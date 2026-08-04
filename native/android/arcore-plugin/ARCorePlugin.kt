// native/android/arcore-plugin/ARCorePlugin.kt
//
// Pont Capacitor exposant le parcours ARCore guidé au code web existant. Contrat JS
// identique à celui du plugin iOS (voir js/scan-detect.js et scanner.html) :
//   - isSupported() -> { supported: Bool }
//   - startScan()   -> objet normalisé (voir docs/modele-donnees.md)
//
// ⚠️ Important : contrairement à RoomPlan sur iOS, ARCore Depth API ne reconstruit pas
// automatiquement une pièce. Ce plugin lance un parcours ASSISTÉ où le client vise
// lui-même les angles et confirme les mesures — voir GuidedArCoreActivity.kt.
// Ce fichier n'a pas été compilé ni testé dans cet environnement (pas de toolchain
// Android Studio / SDK ici). À intégrer dans un projet Capacitor Android, tester sur un
// appareil physique compatible ARCore avant toute mise en production.

package com.atelierdeplan.dossierprojet.arcore

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ar.core.ArCoreApk

@CapacitorPlugin(name = "ARCorePlugin")
class ARCorePlugin : Plugin() {

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val availability = ArCoreApk.getInstance().checkAvailability(context)
        val supported = availability.isSupported
        val result = JSObject()
        result.put("supported", supported)
        call.resolve(result)
    }

    @PluginMethod
    fun startScan(call: PluginCall) {
        val availability = ArCoreApk.getInstance().checkAvailability(context)
        if (!availability.isSupported) {
            call.reject("ARCore non supporté sur cet appareil.")
            return
        }

        saveCall(call) // conserve l'appel JS en attente le temps de l'activité native

        val intent = Intent(context, GuidedArCoreActivity::class.java)
        startActivityForResult(call, intent, "handleScanResult")
    }

    @com.getcapacitor.annotation.ActivityCallback
    private fun handleScanResult(call: PluginCall?, result: androidx.activity.result.ActivityResult) {
        if (call == null) return

        if (result.resultCode != android.app.Activity.RESULT_OK || result.data == null) {
            call.reject("Scan annulé ou échoué.")
            return
        }

        val json = result.data?.getStringExtra(GuidedArCoreActivity.EXTRA_RESULT_JSON)
        if (json == null) {
            call.reject("Aucun résultat renvoyé par le scan.")
            return
        }

        try {
            val normalized = JSObject(json)
            call.resolve(normalized)
        } catch (e: Exception) {
            call.reject("Résultat de scan illisible : ${e.message}")
        }
    }
}
