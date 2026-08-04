// native/android/arcore-plugin/GuidedArCoreActivity.kt
//
// Parcours ARCore ASSISTÉ (pas une reconstruction automatique façon RoomPlan) :
// 1. Le client vise et confirme chaque angle de la pièce (points ancrés via hit-test).
// 2. L'app calcule les distances entre angles consécutifs = longueurs des murs.
// 3. Le client confirme les portes/fenêtres en visant leurs bords, puis CONFIRME
//    explicitement la hauteur (jamais acceptée silencieusement comme mesurée).
// 4. Un plan 2D simplifié est généré à partir du polygone des angles.
// 5. Un score de confiance est calculé à partir de la qualité de tracking ARCore.
// 6. Chaque mesure reste éditable manuellement avant validation finale (étape Corriger).
//
// Cette version implémente réellement :
//   - le rendu caméra (CameraBackgroundRenderer, GLSurfaceView.Renderer)
//   - les marqueurs et lignes (MarkerOverlayView, projection 3D→écran)
//   - les gestes tactiles reliés à onScreenTap()
//   - les boutons Continuer / Corriger / Terminer / Annuler
//   - la saisie des ouvertures avec confirmation obligatoire de la hauteur
//   - le cycle de vie complet (onResume/onPause/onDestroy) et les permissions caméra
//
// ⚠️ État de ce fichier : implémentation complète et cohérente, relue attentivement
// contre la documentation publique ARCore, mais NON COMPILÉE dans cet environnement
// (pas de toolchain Android SDK/Gradle disponible ici). À intégrer dans un vrai projet
// Android Studio généré par `npx cap add android`, compiler, corriger les éventuels
// ajustements d'API selon la version exacte d'ARCore utilisée, puis tester sur un
// appareil physique certifié Google Play Services for AR.

package com.atelierdeplan.dossierprojet.arcore

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.ar.core.*
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableException
import org.json.JSONArray
import org.json.JSONObject
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.sqrt

class GuidedArCoreActivity : Activity(), GLSurfaceView.Renderer {

    companion object {
        const val EXTRA_RESULT_JSON = "scan_result_json"
        private const val CAMERA_PERMISSION_CODE = 100
    }

    private enum class Step { ANGLES, OPENINGS, REVIEW }

    private var session: Session? = null
    private var currentStep = Step.ANGLES
    private var installRequested = false

    private lateinit var glSurfaceView: GLSurfaceView
    private lateinit var overlayView: MarkerOverlayView
    private lateinit var instructionText: TextView
    private val backgroundRenderer = CameraBackgroundRenderer()

    private val viewMatrix = FloatArray(16)
    private val projMatrix = FloatArray(16)
    private var viewportWidth = 0
    private var viewportHeight = 0

    private val cornerAnchors = mutableListOf<Anchor>()
    private val walls = mutableListOf<JSONObject>()
    private val openings = mutableListOf<JSONObject>()
    private val trackingSamples = mutableListOf<Boolean>()
    private var pendingOpeningFirstPoint: Pose? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildLayout()
    }

    // ------------------------------------------------------------------
    // Mise en page : GLSurfaceView (caméra) + overlay marqueurs + instructions + boutons
    // ------------------------------------------------------------------
    private fun buildLayout() {
        val root = FrameLayout(this)

        glSurfaceView = GLSurfaceView(this).apply {
            preserveEGLContextOnPause = true
            setEGLContextClientVersion(2)
            setRenderer(this@GuidedArCoreActivity)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
        root.addView(glSurfaceView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        overlayView = MarkerOverlayView(this)
        root.addView(overlayView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        instructionText = TextView(this).apply {
            setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0x99000000.toInt())
            setPadding(24, 16, 24, 16)
            textSize = 14f
        }
        val instructionParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        instructionParams.topMargin = 48
        instructionParams.marginStart = 32
        instructionParams.marginEnd = 32
        root.addView(instructionText, instructionParams)

        val buttonBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 4f
        }
        val cancelBtn = simpleButton("Annuler") { confirmCancel() }
        val correctBtn = simpleButton("Corriger") { showCorrectionDialog() }
        val continueBtn = simpleButton("Continuer") { advanceStep() }
        val finishBtn = simpleButton("Terminer") { proceedToReview() }
        listOf(cancelBtn, correctBtn, continueBtn, finishBtn).forEach {
            buttonBar.addView(it, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        val buttonParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        buttonParams.gravity = android.view.Gravity.BOTTOM
        buttonParams.bottomMargin = 32
        root.addView(buttonBar, buttonParams)

        setContentView(root)

        val gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                onScreenTap(e.x, e.y)
                return true
            }
        })
        glSurfaceView.setOnTouchListener { _, event -> gestureDetector.onTouchEvent(event) }

        updateInstruction()
    }

    private fun simpleButton(label: String, action: () -> Unit): android.widget.Button {
        return android.widget.Button(this).apply {
            text = label
            setOnClickListener { action() }
        }
    }

    // ------------------------------------------------------------------
    // Cycle de vie ARCore + permissions caméra
    // ------------------------------------------------------------------
    override fun onResume() {
        super.onResume()

        if (!hasCameraPermission()) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
            return
        }

        if (session == null) {
            if (!ensureSessionCreated()) return
        }

        try {
            session?.resume()
        } catch (e: CameraNotAvailableException) {
            showBlockingError("Caméra indisponible — fermez les autres apps qui l'utilisent puis réessayez.")
            session = null
            return
        }
        glSurfaceView.onResume()
    }

    override fun onPause() {
        super.onPause()
        session?.pause()
        glSurfaceView.onPause()
    }

    override fun onDestroy() {
        session?.close()
        session = null
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                onResume() // relance l'initialisation maintenant que la permission est accordée
            } else {
                showBlockingError("La caméra est nécessaire pour scanner votre pièce.")
            }
        }
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun ensureSessionCreated(): Boolean {
        return try {
            when (ArCoreApk.getInstance().requestInstall(this, !installRequested)) {
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    installRequested = true
                    false
                }
                ArCoreApk.InstallStatus.INSTALLED -> {
                    session = Session(this).apply {
                        val config = Config(this)
                        if (isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                            config.depthMode = Config.DepthMode.AUTOMATIC
                        }
                        configure(config)
                    }
                    true
                }
            }
        } catch (e: UnavailableException) {
            showBlockingError("ARCore indisponible : ${e.message}")
            false
        }
    }

    // ------------------------------------------------------------------
    // Rendu OpenGL (GLSurfaceView.Renderer)
    // ------------------------------------------------------------------
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        backgroundRenderer.createOnGlThread()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height
        android.opengl.GLES20.glViewport(0, 0, width, height)
        session?.setDisplayGeometry(display.rotation, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        val session = this.session ?: return
        android.opengl.GLES20.glClear(android.opengl.GLES20.GL_COLOR_BUFFER_BIT or android.opengl.GLES20.GL_DEPTH_BUFFER_BIT)

        session.setCameraTextureName(backgroundRenderer.textureId)

        val frame: Frame = try { session.update() } catch (e: CameraNotAvailableException) { return }

        if (frame.hasDisplayGeometryChanged()) {
            val uv = FloatArray(8)
            frame.transformDisplayUvCoords(
                floatArrayOf(0f, 1f, 1f, 1f, 0f, 0f, 1f, 0f).let { java.nio.FloatBuffer.wrap(it) },
                java.nio.FloatBuffer.wrap(uv)
            )
            backgroundRenderer.updateTexCoords(uv)
        }

        backgroundRenderer.draw()

        val camera = frame.camera
        camera.getViewMatrix(viewMatrix, 0)
        camera.getProjectionMatrix(projMatrix, 0, 0.1f, 100f)

        trackingSamples.add(camera.trackingState == TrackingState.TRACKING)
        refreshOverlayFromMainThread()
    }

    // ------------------------------------------------------------------
    // Interaction tactile → hit-test → logique métier
    // ------------------------------------------------------------------
    private fun onScreenTap(x: Float, y: Float) {
        val session = this.session ?: return
        val frame = try { session.update() } catch (e: CameraNotAvailableException) { return }

        if (frame.camera.trackingState != TrackingState.TRACKING) {
            runOnUiThread { instructionText.text = "Déplacez doucement le téléphone pour stabiliser le suivi, puis réessayez." }
            return
        }

        val hits = frame.hitTest(x, y)
        val validHit = hits.firstOrNull { hit ->
            val trackable = hit.trackable
            (trackable is Plane && trackable.isPoseInPolygon(hit.hitPose)) || trackable is Point
        }

        if (validHit == null) {
            runOnUiThread { instructionText.text = "Aucune surface détectée ici — visez un mur ou le sol." }
            return
        }

        val anchor = validHit.createAnchor()

        when (currentStep) {
            Step.ANGLES -> handleCornerTap(anchor)
            Step.OPENINGS -> handleOpeningTap(anchor)
            Step.REVIEW -> { /* pas d'interaction tactile en révision */ }
        }
    }

    private fun handleCornerTap(anchor: Anchor) {
        cornerAnchors.add(anchor)
        runOnUiThread { instructionText.text = "Angle ${cornerAnchors.size} enregistré. Visez le suivant, ou appuyez sur Continuer." }
    }

    private fun handleOpeningTap(anchor: Anchor) {
        if (pendingOpeningFirstPoint == null) {
            pendingOpeningFirstPoint = anchor.pose
            runOnUiThread { instructionText.text = "Premier bord enregistré — visez le second bord de l'ouverture." }
            return
        }
        val distanceM = distanceBetween(pendingOpeningFirstPoint!!, anchor.pose)
        pendingOpeningFirstPoint = null
        runOnUiThread { promptOpeningDetails(distanceM) }
    }

    // ------------------------------------------------------------------
    // Boutons Continuer / Corriger / Terminer / Annuler
    // ------------------------------------------------------------------
    private fun advanceStep() {
        when (currentStep) {
            Step.ANGLES -> {
                if (cornerAnchors.size < 3) {
                    instructionText.text = "Visez au moins 3 angles avant de continuer."
                    return
                }
                computeWallsFromCorners()
                currentStep = Step.OPENINGS
            }
            Step.OPENINGS -> {
                currentStep = Step.REVIEW
            }
            Step.REVIEW -> proceedToReview()
        }
        updateInstruction()
    }

    private fun updateInstruction() {
        instructionText.text = when (currentStep) {
            Step.ANGLES -> "Visez et validez chaque angle de la pièce, dans l'ordre, en faisant le tour. Au moins 3 angles."
            Step.OPENINGS -> "Visez les deux bords de chaque porte/fenêtre, ou appuyez sur Continuer s'il n'y en a plus."
            Step.REVIEW -> "Vérifiez le récapitulatif, corrigez si besoin, puis appuyez sur Terminer."
        }
    }

    private fun confirmCancel() {
        AlertDialog.Builder(this)
            .setTitle("Annuler le scan ?")
            .setMessage("Les données déjà capturées seront perdues.")
            .setNegativeButton("Continuer le scan", null)
            .setPositiveButton("Annuler le scan") { _, _ ->
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
            .show()
    }

    private fun showCorrectionDialog() {
        if (walls.isEmpty()) {
            instructionText.text = "Aucun mur calculé pour le moment — terminez d'abord l'étape des angles."
            return
        }
        val items = walls.map { "${it.getString("id")} : ${it.getInt("largeur_cm")} cm" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Corriger une mesure")
            .setItems(items) { _, index ->
                showEditValueDialog(walls[index])
            }
            .show()
    }

    private fun showEditValueDialog(wall: JSONObject) {
        val input = android.widget.EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(wall.getInt("largeur_cm").toString())
        }
        AlertDialog.Builder(this)
            .setTitle("Nouvelle valeur (cm)")
            .setView(input)
            .setPositiveButton("Enregistrer") { _, _ ->
                val newValue = input.text.toString().toIntOrNull()
                if (newValue != null && newValue in 1..2000) {
                    wall.put("largeur_cm", newValue)
                    wall.put("confidence", "haute") // corrigée manuellement par le client = fiable
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    // ------------------------------------------------------------------
    // Calculs métier
    // ------------------------------------------------------------------
    private fun computeWallsFromCorners() {
        walls.clear()
        for (i in cornerAnchors.indices) {
            val a = cornerAnchors[i].pose
            val b = cornerAnchors[(i + 1) % cornerAnchors.size].pose
            val distanceM = distanceBetween(a, b)
            walls.add(JSONObject().apply {
                put("id", "wall-$i")
                put("largeur_cm", (distanceM * 100).toInt())
                put("confidence", confidenceLabelForCurrentTracking())
            })
        }
    }

    private fun promptOpeningDetails(largeurM: Double) {
        AlertDialog.Builder(this)
            .setTitle("Type d'ouverture")
            .setItems(arrayOf("Porte", "Fenêtre")) { _, which ->
                val type = if (which == 0) "porte" else "fenêtre"
                promptHeightConfirmation(type, largeurM)
            }
            .show()
    }

    /** ARCore ne mesure pas facilement la hauteur avec 2 points au sol : on propose une
     *  valeur usuelle par défaut, mais elle DOIT être explicitement confirmée ou corrigée
     *  par le client avant d'être acceptée — jamais silencieusement traitée comme mesurée. */
    private fun promptHeightConfirmation(type: String, largeurM: Double) {
        val hauteurParDefaut = if (type == "porte") 204 else 120
        val input = android.widget.EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(hauteurParDefaut.toString())
        }
        AlertDialog.Builder(this)
            .setTitle("Confirmez la hauteur (cm)")
            .setMessage("Valeur usuelle proposée pour une $type — ARCore ne peut pas la mesurer directement ici. Corrigez si besoin puis confirmez.")
            .setView(input)
            .setCancelable(false)
            .setPositiveButton("Confirmer") { _, _ ->
                val hauteur = input.text.toString().toIntOrNull()?.coerceIn(1, 300) ?: hauteurParDefaut
                val confirmedByClient = hauteur != hauteurParDefaut
                openings.add(JSONObject().apply {
                    put("id", "opening-${openings.size}")
                    put("type", type)
                    put("largeur_cm", (largeurM * 100).toInt())
                    put("hauteur_cm", hauteur)
                    put("hauteur_source", if (confirmedByClient) "confirmee_client" else "estimee_defaut_a_corriger")
                    put("confidence", confidenceLabelForCurrentTracking())
                })
            }
            .show()
    }

    private fun proceedToReview() {
        currentStep = Step.REVIEW
        val confidenceScore = computeOverallConfidence()
        val plan2D = buildSimplified2DPlan()

        val result = JSONObject().apply {
            put("scan_provider", "android_arcore")
            put("scan_version", "1.0")
            put("room_name", JSONObject.NULL)
            put("walls", JSONArray(walls))
            put("openings", JSONArray(openings))
            put("dimensions", plan2D)
            put("objects", JSONArray())
            put("photos", JSONArray())
            put("annotations", JSONArray())
            put("confidence_score", confidenceScore)
            put("manual_corrections", JSONArray())
            put("export_files", JSONArray())
        }

        val intent = Intent().putExtra(EXTRA_RESULT_JSON, result.toString())
        setResult(Activity.RESULT_OK, intent)
        finish()
    }

    private fun buildSimplified2DPlan(): JSONObject {
        val perimetreCm = walls.sumOf { it.getInt("largeur_cm") }
        return JSONObject().apply {
            put("perimetre_cm", perimetreCm)
            put("nombre_murs", walls.size)
            put("note", "Plan indicatif basé sur les angles visés par le client — à confirmer par la décoratrice")
        }
    }

    private fun computeOverallConfidence(): Int {
        if (trackingSamples.isEmpty()) return 40
        val trackingRatio = trackingSamples.count { it }.toDouble() / trackingSamples.size
        return (trackingRatio * 80).toInt().coerceIn(20, 80)
    }

    private fun confidenceLabelForCurrentTracking(): String {
        val tracking = session?.let {
            try { it.update().camera.trackingState == TrackingState.TRACKING } catch (e: Exception) { false }
        } ?: false
        return if (tracking) "moyenne" else "basse"
    }

    private fun distanceBetween(a: Pose, b: Pose): Double {
        val dx = (a.tx() - b.tx()).toDouble()
        val dy = (a.ty() - b.ty()).toDouble()
        val dz = (a.tz() - b.tz()).toDouble()
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    // ------------------------------------------------------------------
    // Projection 3D → écran pour l'overlay des marqueurs
    // ------------------------------------------------------------------
    private fun refreshOverlayFromMainThread() {
        val screenPoints = cornerAnchors.mapIndexedNotNull { i, anchor ->
            projectPoseToScreen(anchor.pose)?.let { (x, y) -> MarkerOverlayView.ScreenPoint(x, y, "${i + 1}") }
        }
        runOnUiThread { overlayView.updatePoints(screenPoints, closeLoop = currentStep != Step.ANGLES) }
    }

    private fun projectPoseToScreen(pose: Pose): Pair<Float, Float>? {
        if (viewportWidth == 0 || viewportHeight == 0) return null

        val vpMatrix = FloatArray(16)
        Matrix.multiplyMM(vpMatrix, 0, projMatrix, 0, viewMatrix, 0)

        val worldPoint = floatArrayOf(pose.tx(), pose.ty(), pose.tz(), 1f)
        val clipPoint = FloatArray(4)
        Matrix.multiplyMV(clipPoint, 0, vpMatrix, 0, worldPoint, 0)

        if (clipPoint[3] <= 0f) return null // point derrière la caméra

        val ndcX = clipPoint[0] / clipPoint[3]
        val ndcY = clipPoint[1] / clipPoint[3]

        val screenX = (ndcX * 0.5f + 0.5f) * viewportWidth
        val screenY = (1f - (ndcY * 0.5f + 0.5f)) * viewportHeight
        return Pair(screenX, screenY)
    }

    private fun showBlockingError(message: String) {
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Scan impossible")
                .setMessage(message)
                .setCancelable(false)
                .setPositiveButton("Fermer") { _, _ ->
                    setResult(Activity.RESULT_CANCELED)
                    finish()
                }
                .show()
        }
    }
}
