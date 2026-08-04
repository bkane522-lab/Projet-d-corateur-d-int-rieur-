// native/ios/Plugin/RoomPlanNormalizer.swift
//
// Convertit un CapturedRoom (RoomPlan) vers l'objet JSON normalisé attendu par le
// backend (voir docs/modele-donnees.md). Toutes les dimensions RoomPlan sont en mètres :
// on les convertit en centimètres pour rester cohérent avec le reste de l'application
// (parcours web, table `mesures`).

import Foundation
import RoomPlan
import simd

enum RoomPlanNormalizer {

    static func toNormalizedSchema(_ room: CapturedRoom) -> [String: Any] {
        let walls = room.walls.enumerated().map { (index, wall) -> [String: Any] in
            let dims = wall.dimensions // (largeur, hauteur, profondeur) en mètres
            return [
                "id": "wall-\(index)",
                "largeur_cm": Int(dims.x * 100),
                "hauteur_cm": Int(dims.y * 100),
                "confidence": confidenceLabel(wall.confidence)
            ]
        }

        let openings: [[String: Any]] = room.doors.enumerated().map { (index, door) -> [String: Any] in
            [
                "id": "door-\(index)",
                "type": "porte",
                "largeur_cm": Int(door.dimensions.x * 100),
                "hauteur_cm": Int(door.dimensions.y * 100),
                "confidence": confidenceLabel(door.confidence)
            ]
        } + room.windows.enumerated().map { (index, window) -> [String: Any] in
            [
                "id": "window-\(index)",
                "type": "fenêtre",
                "largeur_cm": Int(window.dimensions.x * 100),
                "hauteur_cm": Int(window.dimensions.y * 100),
                "confidence": confidenceLabel(window.confidence)
            ]
        }

        let objects: [[String: Any]] = room.objects.enumerated().map { (index, object) -> [String: Any] in
            [
                "id": "object-\(index)",
                "categorie": String(describing: object.category),
                "largeur_cm": Int(object.dimensions.x * 100),
                "hauteur_cm": Int(object.dimensions.y * 100),
                "profondeur_cm": Int(object.dimensions.z * 100),
                "confidence": confidenceLabel(object.confidence)
            ]
        }

        // Dimensions globales approximatives à partir de l'étendue des murs détectés.
        let dimensions = estimateOverallDimensions(walls: room.walls)

        // Score de confiance global : moyenne pondérée simple des confidences RoomPlan.
        let allConfidences = room.walls.map { $0.confidence } + room.doors.map { $0.confidence } + room.windows.map { $0.confidence }
        let confidenceScore = confidenceScoreFromCategories(allConfidences)

        return [
            "scan_provider": "ios_lidar",
            "scan_version": "1.0",
            "room_name": NSNull(),
            "walls": walls,
            "openings": openings,
            "dimensions": dimensions,
            "objects": objects,
            "photos": [],           // le mode LiDAR ne demande pas de photos manuelles
            "annotations": [],
            "confidence_score": confidenceScore,
            "manual_corrections": [],
            // Export USDZ du modèle 3D, écrit sur disque puis uploadé séparément par le JS
            // (voir startScan côté JS : le champ `export_files` est complété après l'appel
            // à session.captureSession.export si l'app appelante le demande).
            "export_files": []
        ]
    }

    private static func confidenceLabel(_ confidence: CapturedRoom.Confidence) -> String {
        switch confidence {
        case .high: return "haute"
        case .medium: return "moyenne"
        case .low: return "basse"
        @unknown default: return "inconnue"
        }
    }

    private static func confidenceScoreFromCategories(_ confidences: [CapturedRoom.Confidence]) -> Int {
        guard !confidences.isEmpty else { return 50 }
        let scores = confidences.map { conf -> Int in
            switch conf {
            case .high: return 90
            case .medium: return 65
            case .low: return 35
            @unknown default: return 50
            }
        }
        return scores.reduce(0, +) / scores.count
    }

    private static func estimateOverallDimensions(walls: [CapturedRoom.Surface]) -> [String: Any] {
        guard !walls.isEmpty else { return [:] }
        // Approximation simple : on prend la plus grande largeur de mur comme longueur
        // indicative de la pièce. RoomPlan ne fournit pas directement une "surface au sol"
        // fiable sans reconstruction du polygone complet — on reste volontairement prudent
        // plutôt que d'inventer un chiffre.
        let largeurs = walls.map { $0.dimensions.x }
        return [
            "largeur_cm": Int((largeurs.max() ?? 0) * 100),
            "note": "Estimation indicative à partir des murs détectés — à confirmer par la décoratrice"
        ]
    }
}
