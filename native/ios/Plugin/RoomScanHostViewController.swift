// native/ios/Plugin/RoomScanHostViewController.swift
//
// Enveloppe la RoomCaptureView de RoomPlan dans un écran natif plein écran avec une
// interface explicite à 3 actions, comme demandé : Annuler, Recommencer, Terminer.
// On n'utilise pas seulement les contrôles internes de RoomCaptureView pour que le
// comportement de chaque bouton soit exactement celui voulu par l'app (et pas celui,
// plus générique, fourni par défaut par RoomPlan).

import UIKit
import RoomPlan

class RoomScanHostViewController: UIViewController {

    private let captureView: RoomCaptureView
    private let config: RoomCaptureSession.Configuration

    /// Recommencer : arrête la session en cours et en relance une neuve, sans renvoyer de
    /// résultat au JS (l'utilisateur reste sur l'écran de scan).
    var onRestart: (() -> Void)?

    /// Terminer : doit arrêter proprement la session RoomPlan. L'arrêt déclenche le
    /// traitement RoomPlan puis le delegate `captureView(didPresent:)`, qui renvoie le
    /// résultat normalisé au JS et ferme l'écran (géré côté RoomPlanPlugin).
    var onFinish: (() -> Void)?

    /// Annuler : arrête la session SANS traiter le résultat, ferme l'écran, et doit
    /// aboutir à un rejet propre de l'appel Capacitor côté JS (géré côté RoomPlanPlugin).
    var onCancel: (() -> Void)?

    init(captureView: RoomCaptureView, config: RoomCaptureSession.Configuration) {
        self.captureView = captureView
        self.config = config
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non supporté") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        captureView.frame = view.bounds
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(captureView)

        let instructionLabel = UILabel()
        instructionLabel.text = "Déplacez-vous lentement pour scanner chaque mur de la pièce."
        instructionLabel.textColor = .white
        instructionLabel.font = .systemFont(ofSize: 13, weight: .medium)
        instructionLabel.textAlignment = .center
        instructionLabel.numberOfLines = 2
        instructionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        instructionLabel.layer.cornerRadius = 6
        instructionLabel.layer.masksToBounds = true
        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(instructionLabel)

        let cancelButton = makeButton(title: "Annuler", color: UIColor(white: 0.25, alpha: 0.92))
        let restartButton = makeButton(title: "Recommencer", color: UIColor(red: 0.71, green: 0.38, blue: 0.18, alpha: 0.92))
        let finishButton = makeButton(title: "Terminer", color: UIColor(red: 0.49, green: 0.54, blue: 0.43, alpha: 0.95))

        cancelButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)
        restartButton.addTarget(self, action: #selector(handleRestart), for: .touchUpInside)
        finishButton.addTarget(self, action: #selector(handleFinish), for: .touchUpInside)

        let buttonStack = UIStackView(arrangedSubviews: [cancelButton, restartButton, finishButton])
        buttonStack.axis = .horizontal
        buttonStack.distribution = .fillEqually
        buttonStack.spacing = 10
        buttonStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(buttonStack)

        NSLayoutConstraint.activate([
            instructionLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            instructionLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            instructionLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),

            buttonStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            buttonStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            buttonStack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            buttonStack.heightAnchor.constraint(equalToConstant: 46)
        ])
    }

    private func makeButton(title: String, color: UIColor) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = color
        button.layer.cornerRadius = 6
        button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        return button
    }

    @objc private func handleRestart() { onRestart?() }
    @objc private func handleFinish() { onFinish?() }

    @objc private func handleCancel() {
        let confirm = UIAlertController(
            title: "Annuler le scan ?",
            message: "Les données déjà capturées seront perdues.",
            preferredStyle: .alert
        )
        confirm.addAction(UIAlertAction(title: "Continuer le scan", style: .cancel))
        confirm.addAction(UIAlertAction(title: "Annuler le scan", style: .destructive) { [weak self] _ in
            self?.onCancel?()
        })
        present(confirm, animated: true)
    }
}
