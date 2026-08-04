// native/android/arcore-plugin/MarkerOverlayView.kt
//
// Vue transparente superposée à la GLSurfaceView caméra : dessine les points d'angle
// déjà confirmés (marqueurs) et les segments entre eux (lignes des murs), en
// coordonnées écran. Approche volontairement simplifiée (dessin 2D via Canvas plutôt
// qu'un rendu 3D des ancres) — suffisant pour donner un retour visuel clair au client
// pendant le parcours guidé, sans la complexité d'un moteur de rendu 3D complet.
//
// ⚠️ Non compilé/testé dans cet environnement (pas de toolchain Android ici).

package com.atelierdeplan.dossierprojet.arcore

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

class MarkerOverlayView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    data class ScreenPoint(val x: Float, val y: Float, val label: String)

    private var points: List<ScreenPoint> = emptyList()
    private var closeLoop: Boolean = false

    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#B99545") // or de marque — cohérent avec l'identité visuelle web
        style = Paint.Style.FILL
    }
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#B99545")
        style = Paint.Style.STROKE
        strokeWidth = 6f
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 32f
        textAlign = Paint.Align.CENTER
    }

    fun updatePoints(newPoints: List<ScreenPoint>, closeLoop: Boolean = false) {
        this.points = newPoints
        this.closeLoop = closeLoop
        postInvalidate() // redessine depuis le thread GL/UI sans bloquer
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (points.isEmpty()) return

        for (i in points.indices) {
            val a = points[i]
            val hasNext = i < points.size - 1
            if (hasNext) {
                val b = points[i + 1]
                canvas.drawLine(a.x, a.y, b.x, b.y, linePaint)
            } else if (closeLoop && points.size > 2) {
                val b = points[0]
                canvas.drawLine(a.x, a.y, b.x, b.y, linePaint)
            }
        }

        points.forEachIndexed { i, p ->
            canvas.drawCircle(p.x, p.y, 16f, pointPaint)
            canvas.drawText((i + 1).toString(), p.x, p.y - 24f, labelPaint)
        }
    }
}
