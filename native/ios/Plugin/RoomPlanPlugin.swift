// native/ios/Plugin/RoomPlanPlugin.swift
//
// Pont Capacitor exposant RoomPlan (iOS 16+, appareils avec LiDAR) au code web existant.
// Contrat JS (voir js/scan-detect.js et scanner.html) :
//   - isSupported() -> { supported: Bool }
//   - startScan()   -> objet normalisé (voir docs/modele-donnees.md), incluant
//                      optionnellement `export_local_path` si l'export USDZ a réussi —
//                      à lire côté JS via @capacitor/filesystem puis à uploader via
//                      POST /api/upload-url (kind: "document", contentType:
//                      "model/vnd.usdz+zip").
//
// ⚠️ État de ce fichier : code source complet et cohérent, relu attentivement contre la
// documentation publique RoomPlan/ARKit, mais NON COMPILÉ dans cet environnement (pas de
// toolchain Xcode/iOS disponible ici). À intégrer dans un vrai projet Xcode généré par
// `npx cap add ios`, compiler, corriger les éventuels ajustements d'API selon la version
// exacte du SDK iOS ciblée, puis tester sur un appareil physique compatible LiDAR —
// RoomPlan ne fonctionne pas dans le simulateur iOS.

import Foundation
import Capacitor
import RoomPlan
import ARKit

@objc(RoomPlanPlugin)
public class RoomPlanPlugin: CAPPlugin, RoomCaptureSessionDelegate, RoomCaptureViewDelegate {

    private var captureSessionConfig: RoomCaptureSession.Configuration?
    private var roomCaptureView: RoomCaptureView?
    private var pendingCall: CAPPluginCall?
    private var isCancelling = false

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": RoomCaptureSession.isSupported])
    }

    @objc func startScan(_ call: CAPPluginCall) {
        guard RoomCaptureSession.isSupported else {
            call.reject("RoomPlan non supporté sur cet appareil (LiDAR requis).")
            return
        }

        pendingCall = call
        isCancelling = false

        DispatchQueue.main.async {
            guard let bridgeVC = self.bridge?.viewController else {
                call.reject("Impossible d'accéder au contrôleur racine")
                return
            }

            let captureView = RoomCaptureView(frame: bridgeVC.view.bounds)
            captureView.captureSession.delegate = self
            captureView.delegate = self
            self.roomCaptureView = captureView

            let config = RoomCaptureSession.Configuration()
            self.captureSessionConfig = config

            let scanVC = RoomScanHostViewController(captureView: captureView, config: config)

            scanVC.onRestart = { [weak captureView] in
                captureView?.captureSession.stop()
                captureView?.captureSession.run(configuration: config)
            }

            scanVC.onFinish = { [weak captureView] in
                // Arrête la session : déclenche automatiquement le traitement RoomPlan,
                // puis le delegate captureView(didPresent:) ci-dessous.
                captureView?.captureSession.stop()
            }

            scanVC.onCancel = { [weak self, weak scanVC] in
                self?.isCancelling = true
                captureView.captureSession.stop()
                scanVC?.dismiss(animated: true) {
                    self?.pendingCall?.reject("Scan annulé par l'utilisateur.")
                    self?.pendingCall = nil
                }
            }

            scanVC.modalPresentationStyle = .fullScreen
            bridgeVC.present(scanVC, animated: true) {
                captureView.captureSession.run(configuration: config)
            }
        }
    }

    // MARK: - RoomCaptureViewDelegate

    public func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        // Si l'utilisateur a appuyé sur "Annuler", on ne laisse pas RoomPlan traiter et
        // présenter un résultat que personne n'attend plus côté JS.
        return !isCancelling
    }

    public func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        if isCancelling { return } // déjà géré par onCancel

        if let error = error {
            pendingCall?.reject("Erreur de traitement du scan : \(error.localizedDescription)")
            pendingCall = nil
            dismissScanScreen()
            return
        }

        var normalized = RoomPlanNormalizer.toNormalizedSchema(processedResult)

        // Export USDZ best-effort : un échec ici n'empêche pas de renvoyer le reste du
        // résultat normalisé au JS (les dimensions/murs/ouvertures restent utilisables
        // même sans export 3D).
        if let localPath = exportUSDZ(processedResult) {
            normalized["export_local_path"] = localPath
        }

        pendingCall?.resolve(normalized)
        pendingCall = nil
        dismissScanScreen()
    }

    // MARK: - RoomCaptureSessionDelegate

    public func captureSession(_ session: RoomCaptureSession, didFailWith error: Error) {
        if isCancelling { return }
        pendingCall?.reject("Le scan a échoué : \(error.localizedDescription)")
        pendingCall = nil
        dismissScanScreen()
    }

    // MARK: - Helpers

    private func dismissScanScreen() {
        DispatchQueue.main.async {
            self.bridge?.viewController?.presentedViewController?.dismiss(animated: true)
        }
    }

    /// Exporte le modèle 3D capturé au format USDZ dans un fichier temporaire.
    /// Retourne le chemin local du fichier si l'export réussit, sinon nil (non fatal).
    private func exportUSDZ(_ room: CapturedRoom) -> String? {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("scan-\(UUID().uuidString)")
            .appendingPathExtension("usdz")

        do {
            // API RoomPlan : CapturedRoom.export(to:exportOptions:) écrit un fichier USDZ
            // paramétrique décrivant la pièce (murs, ouvertures, objets reconnus).
            try room.export(to: tempURL, exportOptions: .parametric)
            return tempURL.path
        } catch {
            print("Export USDZ échoué (non bloquant) : \(error.localizedDescription)")
            return nil
        }
    }
}
