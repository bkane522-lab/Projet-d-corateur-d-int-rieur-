# Arborescence du projet (V2.1)

```
dossier-projet/
├── index.html / scanner.html / photos-mesures.html / questionnaire.html
├── dossier.html (passeport) / rdv.html / suivi.html
│
├── admin/
│   ├── login.html / dashboard.html / dossier.html
│   └── js/session.js          # Session Supabase Auth réelle (restauration/renouvellement)
│
├── css/style.css
├── js/app.js, js/scan-detect.js, js/config.js, js/brand.js, js/native-plugins.js
│
├── mobile-web/                  # Dossier dédié à l'app Capacitor (webDir)
│   └── (copie des pages prospect + css/js/manifest/sw/icons — PAS admin/api/sql/docs/native)
│
├── api/
│   ├── _lib/ (supabase, auth, validate, validateScan, rateLimit, groq)
│   ├── dossiers.js, status.js, summary.js, analyze.js, appointments.js
│   ├── upload-url.js, signed-url.js, public-config.js, cron-cleanup.js
│   └── _lib/cors.js  (CORS restreint : origines Capacitor + domaine de prod, jamais *)
│
├── sql/schema.sql, sql/002_migration_securite_scan.sql
│
├── native/
│   ├── README.md
│   ├── ios/Plugin/ (RoomPlanPlugin.swift/.m, RoomScanHostViewController.swift, RoomPlanNormalizer.swift)
│   ├── ios/Info.plist-additions.xml
│   ├── android/arcore-plugin/ (ARCorePlugin.kt, GuidedArCoreActivity.kt, CameraBackgroundRenderer.kt, MarkerOverlayView.kt)
│   └── android/AndroidManifest-additions.xml
│
├── tests/
│   ├── timezone.test.js, validate.test.js, validateScan.test.js, links.test.js
│   ├── inline-scripts.test.js  (syntaxe de tous les <script> inline des HTML)
│   ├── api-url.test.js  (résolution web/Capacitor)
│   ├── session-renewal.test.js  (scan_session_id)
│   ├── brand-centralization.test.js  (pas de nom de marque dispersé)
│   └── integration/api.integration.test.js  (nécessite déploiement réel)
│
├── manifest.json / sw.js / icons/       # PWA installable
├── capacitor.config.js                    # webDir: "mobile-web", lit js/config.js pour appName
├── vercel.json                            # cron nettoyage fichiers orphelins
├── package.json                            # deps Capacitor + scripts npm + scripts test
├── .env.example
├── README-DEPLOIEMENT.md
├── scripts/generate-manifest.js  (régénère manifest.json depuis js/config.js)
└── docs/ (cahier-des-charges, architecture-technique, modele-donnees, arborescence)
```
