# Modules natifs — iOS RoomPlan & Android ARCore

## État réel de ces livrables — à lire avant toute chose

Aucun code de ce dossier n'a été **compilé ni exécuté** dans l'environnement qui l'a
généré : pas de Xcode, pas d'Android Studio, pas de SDK iOS/Android, pas de simulateur ni
d'appareil physique, et pas d'accès réseau pour installer les toolchains ou lancer
`npx cap add ios/android`. C'est une limite de cet environnement, pas un choix.

Ce qui a été fait ici : une relecture attentive du code contre la documentation publique
RoomPlan / ARKit / ARCore, une implémentation complète (pas des stubs) de chaque
fonctionnalité demandée, une cohérence interne vérifiée à la main (signatures d'API,
cycle de vie, flux de données). Ce qui n'a **pas** été fait : compilation réelle,
correction d'erreurs de build, test sur device. Avant toute mise en production :

1. `npx cap add ios` / `npx cap add android` pour générer les vrais projets Xcode/Android Studio.
2. Copier les fichiers de ce dossier aux emplacements indiqués ci-dessous.
3. Compiler, corriger les éventuels ajustements d'API (les signatures RoomPlan/ARCore
   varient légèrement selon la version exacte du SDK installée).
4. Tester sur un appareil physique — RoomPlan exige un LiDAR réel (iPhone/iPad Pro),
   ARCore exige un Android certifié Google Play Services for AR. Aucun des deux ne
   fonctionne en simulateur/émulateur pour la partie caméra/capteurs.

## Contrat JS commun (inchangé)

```js
const check = await window.Capacitor.Plugins.RoomPlanPlugin.isSupported();
const result = await window.Capacitor.Plugins.RoomPlanPlugin.startScan();
// Même contrat pour Plugins.ARCorePlugin
```

Format retourné : voir `docs/modele-donnees.md` (`scan_provider`, `walls`, `openings`,
`dimensions`, `objects`, `annotations`, `confidence_score`, `manual_corrections`,
`export_files`).

## Liaison JS ↔ natif — ce qui enregistre réellement chaque plugin

Lister un nom de plugin dans `capacitor.config.js` ne l'enregistre pas — cette config ne
fait que passer des options à un plugin déjà enregistré par ailleurs. Trois étapes
distinctes, réellement nécessaires :

1. **Côté JS** (`js/native-plugins.js`) : appelle `Capacitor.registerPlugin('RoomPlanPlugin')`
   / `Capacitor.registerPlugin('ARCorePlugin')` explicitement, exposés ensuite sous
   `window.NativePlugins.RoomPlanPlugin` / `.ARCorePlugin`. `js/scan-detect.js` et
   `scanner.html` utilisent ces objets plutôt que d'accéder implicitement à
   `window.Capacitor.Plugins.X` — et gèrent explicitement le cas où le plugin est `null`
   (message clair + bascule vers le parcours web, jamais un bouton silencieusement mort).

2. **Côté iOS** : le fichier `RoomPlanPlugin.m` avec la macro `CAP_PLUGIN(...)` EST le
   mécanisme d'enregistrement pour Capacitor 6 — le runtime Objective-C scanne les
   classes utilisant cette macro au démarrage du pont. Aucune modification d'AppDelegate
   n'est nécessaire pour un plugin local comme celui-ci.

3. **Côté Android** : contrairement à iOS, Capacitor 6 exige un enregistrement explicite
   dans `MainActivity`, **avant** `super.onCreate()`. Voir
   `native/android/MainActivity-additions.kt` — c'est l'étape qui manquait purement et
   simplement dans la livraison précédente (le nom du plugin dans la config ne suffisait
   pas). Sans elle, tout appel à `ARCorePlugin` depuis le JS échoue avec une erreur
   "plugin not implemented", même si le code Kotlin du plugin est parfaitement correct.

## Identifiants natifs — valeur provisoire, à corriger avant publication

`appId` dans `capacitor.config.js` vaut actuellement `com.example.dossierprojet.provisional`.
`com.example.*` est un domaine réservé par convention (RFC 2606) : Xcode et Android
Studio l'acceptent pour builder et tester, mais **ni l'App Store ni le Google Play Store
ne l'accepteront à la publication**. Avant toute soumission réelle :
- Choisir le nom commercial définitif (actuellement `APP_CONFIG.brand.nomCourt` = "Nom
  de l'agence", voir `js/config.js`).
- En dériver un identifiant de forme inversée (ex: `com.nomdelagence.dossierprojet`).
- Le renseigner dans `capacitor.config.js` (`appId`), dans le `package` Android
  (`android/app/build.gradle` + dossiers Java/Kotlin), et dans le Bundle Identifier Xcode
  (target iOS → Signing & Capabilities).
- **Ce changement n'est pas rétroactif** : une fois une app publiée sous un `appId`/Bundle
  ID donné, il ne peut plus être changé sans republier l'app comme une nouvelle
  application (perte des avis, des installations, du référencement).

## iOS — RoomPlan (`ios/Plugin/`)

| Fichier | Rôle |
|---|---|
| `RoomPlanPlugin.swift` | Pont Capacitor, cycle de vie du scan, export USDZ |
| `RoomScanHostViewController.swift` | Écran natif avec 3 boutons explicites : **Annuler**, **Recommencer**, **Terminer** |
| `RoomPlanNormalizer.swift` | Conversion `CapturedRoom` → format normalisé partagé |
| `RoomPlanPlugin.m` | Header Objective-C requis par Capacitor |
| `Info.plist-additions.xml` | Clés de permission à fusionner (caméra, mouvement) |

**Comportement des 3 boutons (finalisé) :**
- **Terminer** → arrête la session (`captureSession.stop()`), ce qui déclenche
  automatiquement le traitement RoomPlan puis le delegate `captureView(didPresent:)` :
  le résultat normalisé est renvoyé au JS (`call.resolve(...)`) et l'écran se ferme.
- **Annuler** → demande confirmation, arrête la session sans laisser RoomPlan présenter
  de résultat (`shouldPresent` renvoie `false` via le flag `isCancelling`), ferme l'écran,
  et **rejette proprement** l'appel Capacitor (`call.reject("Scan annulé...")`).
- **Recommencer** → arrête puis relance une session neuve, sans fermer l'écran ni
  renvoyer de résultat.

**Export USDZ** : `RoomPlanPlugin.swift` appelle `CapturedRoom.export(to:exportOptions:)`
vers un fichier temporaire après un scan réussi (best-effort — un échec d'export
n'empêche pas de renvoyer le reste du résultat). Le chemin local est inclus dans l'objet
résolu sous `export_local_path`. Côté JS (`scanner.html`), ce fichier est ensuite lu via
`@capacitor/filesystem` et uploadé vers Supabase Storage comme un document classique
(`kind: "document"`, `contentType: "model/vnd.usdz+zip"`, déjà autorisé côté serveur) —
cette partie JS, elle, est du code web ordinaire et peut être relue/testée normalement.

## Android — ARCore guidé (`android/arcore-plugin/`)

| Fichier | Rôle |
|---|---|
| `ARCorePlugin.kt` | Pont Capacitor, lance l'activité et récupère son résultat |
| `GuidedArCoreActivity.kt` | Activité complète : rendu caméra, gestes, boutons, cycle de vie |
| `CameraBackgroundRenderer.kt` | Rendu du flux caméra ARCore en arrière-plan (texture OES + shader) |
| `MarkerOverlayView.kt` | Overlay Canvas : marqueurs d'angles + lignes entre points |
| `AndroidManifest-additions.xml` | Permissions et déclarations à fusionner |

**Ce qui est réellement implémenté cette fois (pas un squelette) :**
- Rendu caméra via `GLSurfaceView.Renderer` + texture OES externe (technique standard
  ARCore, simplifiée : pas de nuage de points affiché, seulement le flux vidéo).
- Marqueurs et lignes entre points via projection 3D→écran (matrices vue/projection
  ARCore) dessinée sur un overlay `Canvas` transparent superposé à la vue caméra —
  approche volontairement simplifiée par rapport à un rendu 3D des ancres, mais donnant
  un vrai retour visuel au client.
- Gestes tactiles (`GestureDetector`) reliés à `onScreenTap()`.
- 4 boutons fonctionnels : **Continuer** (avance dans les étapes), **Corriger** (liste les
  murs calculés, permet d'éditer une valeur manuellement), **Terminer** (finalise et
  renvoie le résultat au plugin Capacitor), **Annuler** (confirmation puis `RESULT_CANCELED`).
- Saisie des ouvertures avec **confirmation obligatoire de la hauteur** : ARCore ne mesure
  pas la hauteur avec 2 points au sol, donc une valeur usuelle est proposée mais le champ
  `hauteur_source` vaut `"estimee_defaut_a_corriger"` tant que le client n'a pas modifié la
  valeur, et `"confirmee_client"` s'il l'a explicitement changée — jamais présentée comme
  une mesure au même titre qu'une valeur confirmée.
- Cycle de vie complet : `onResume` (permission caméra, création/reprise de session),
  `onPause` (pause session + GLSurfaceView), `onDestroy` (fermeture session),
  `onRequestPermissionsResult` (gestion du refus de permission).

**Simplification assumée** : le rendu ne reproduit pas le nuage de points ARCore complet
ni un rendu 3D des ancres (ce qui suivrait le modèle des exemples officiels "HelloAR")
— l'overlay 2D en Canvas a été choisi pour rester lisible et cohérent avec le reste du
code, au prix d'un rendu moins riche visuellement qu'un vrai rendu 3D des points ancrés.

## Dépendances à ajouter

**iOS** : `RoomPlan.framework`, `ARKit.framework` (inclus dans le SDK iOS 16+, aucun pod
tiers nécessaire). `@capacitor/filesystem` côté JS (déjà dans `package.json`).

**Android** (`build.gradle` du module app) :
```gradle
implementation 'com.google.ar:core:1.42.0'
implementation 'androidx.appcompat:appcompat:1.7.0'
```
