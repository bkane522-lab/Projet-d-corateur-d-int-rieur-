// native/android/MainActivity-additions.kt
//
// Capacitor 6 : les plugins natifs LOCAUX au projet (pas installés depuis npm avec leur
// propre module Gradle) doivent être enregistrés explicitement dans MainActivity, AVANT
// l'appel à super.onCreate(). C'est cette étape — et non capacitor.config.js — qui relie
// réellement le code Kotlin au pont JS. Le simple fait de lister le nom du plugin dans
// la config Capacitor (comme c'était fait initialement) ne suffit pas : sans ce
// registerPlugin(), window.Capacitor.registerPlugin('ARCorePlugin') côté JS résout un
// plugin qui n'existe pas côté natif, et chaque appel échoue silencieusement ou lève
// une erreur "plugin not implemented".
//
// À fusionner dans android/app/src/main/java/.../MainActivity.kt (généré par
// `npx cap add android`) :

package com.example.dossierprojet.provisional // ⚠️ à aligner avec l'appId réel choisi

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.atelierdeplan.dossierprojet.arcore.ARCorePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // L'enregistrement doit avoir lieu AVANT super.onCreate(), qui initialise le
        // pont Capacitor et consomme la liste des plugins enregistrés.
        registerPlugin(ARCorePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}

// Note : RoomPlanPlugin est un plugin iOS uniquement (RoomPlan n'existe pas sur Android)
// — il n'apparaît donc jamais dans ce fichier Android. Côté JS, js/native-plugins.js
// gère cette asymétrie normalement : sur Android, Capacitor.registerPlugin('RoomPlanPlugin')
// renvoie un proxy dont les méthodes échoueront proprement (capté par le try/catch dans
// js/scan-detect.js), jamais un crash.
