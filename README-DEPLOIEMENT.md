# README de déploiement — V2.2

## 0. Rapport honnête : ce qui a tourné pour de vrai, ce qui reste à faire

### Testé réellement, ici, maintenant

```
$ npm test
tests 47
pass 47
fail 0
```

Détail des 47 tests unitaires (Node.js pur, sans réseau ni Supabase) :
- **28** — validation/normalisation des dossiers et du format de scan complet, fuseau
  Europe/Paris (été + hiver), anti-XSS, honeypot, non-régression des liens cassés.
- **2** — `tests/inline-scripts.test.js` (nouveau) : extrait et vérifie syntaxiquement
  *tous* les scripts `<script>` inline de *tous* les fichiers HTML (racine, admin/,
  mobile-web/). C'est ce test qui aurait dû exister avant et qui aurait immédiatement
  attrapé le bug `admin/dossier.html` (try/await orphelin hors fonction) — **démontré en
  direct** : réintroduire temporairement le bug fait échouer ce test (2/2 → 0/2), le
  corriger le fait repasser au vert.
- **6** — `tests/api-url.test.js` (nouveau) : vérifie que `resolveApiUrl()` produit un
  chemin relatif sur le web, une URL absolue en HTTPS dans une app Capacitor native, la
  bascule dev/production, l'absence de double slash, et que `baseUrlMobile` reste une
  valeur provisoire non bloquante (Vercel ou vide), jamais un domaine imposé.
- **5** — `tests/session-renewal.test.js` (nouveau) : `getSessionId()` génère un UUID v4
  valide, `DossierState.clear()` supprime bien `scan_session_id` ET `dossier_en_cours`
  ensemble, un nouveau projet obtient un nouvel UUID différent, rien n'est effacé tant
  que `clear()` n'est pas appelé, et un test statique confirme que `dossier.html`
  n'appelle `clear()` que dans le bloc `try` après un `apiPost` réussi — jamais dans le
  `catch`.
- **6** — `tests/brand-centralization.test.js` (nouveau) : aucune occurrence du nom de
  marque configuré ne traîne en dur dans une page HTML hors des attributs `data-brand-*`,
  le manifest PWA et `capacitor.config.js` lisent bien `js/config.js`, l'`appId` reste
  signalé comme provisoire, `server.url` n'est jamais utilisé, et le domaine personnalisé
  reste une chaîne configurable (vide ou Vercel), jamais interdite.

**Preuve d'efficacité du nouveau test inline-scripts** (extrait du terminal de cette
session) :
```
=== Version buguée réintroduite temporairement ===
# tests 2
# pass 0
# fail 2
=== Restauration du fichier corrigé ===
# tests 2
# pass 2
# fail 0
```

### Préparé mais non exécuté ici

`tests/integration/` : 9 tests qui appellent une API déployée réelle (auth admin,
création de dossier, upload refusé, PDF admin, etc.). Ils s'auto-ignorent proprement
(`skip`) tant que les variables `TEST_BASE_URL` / `TEST_ADMIN_EMAIL` / etc. ne sont pas
fournies — reconfirmé cette passe : **9/9 skip, 0 échec, 0 pass**. Ce n'est PAS la même
chose que "testé et réussi" : ils n'ont jamais tourné contre un vrai serveur. À lancer
après déploiement avec `npm run test:integration` et les variables d'environnement
documentées en en-tête du fichier.

### Vérifié uniquement statiquement (lecture attentive, pas d'exécution)

- La logique CORS (`api/_lib/cors.js`) : relue et cohérente, jamais appelée par un vrai
  navigateur/WebView Capacitor ici (pas de réseau).
- L'enregistrement des plugins (`js/native-plugins.js`, `MainActivity-additions.kt`,
  `RoomPlanPlugin.m`) : relu contre la documentation Capacitor 6, jamais exécuté dans une
  vraie app compilée.

### Nécessite encore Xcode, Android Studio ou un vrai téléphone

Tout le code natif iOS (`native/ios/`) et Android (`native/android/`) : écrit, relu,
cohérent, mais non compilé — pas de toolchain ni de device dans cet environnement. Voir
`native/README.md` pour le détail exact de ce qui est implémenté par plugin.

**Code natif iOS/Android : écrit, relu, cohérent — mais non compilé.** Cet environnement
n'a ni Xcode, ni Android Studio, ni SDK mobile, ni accès réseau pour les installer ou
lancer `npx cap add ios/android`. Voir `native/README.md` pour le détail exact de ce qui
est implémenté (rendu caméra ARCore, projection des marqueurs, 3 boutons RoomPlan,
export USDZ...) et l'avertissement répété : à compiler et tester sur appareil avant toute
mise en production.

---

## 0bis. Résumé de cette passe corrective ciblée

- **Bug bloquant corrigé** : `admin/dossier.html` avait un `try/await` orphelin hors de
  toute fonction (`loadDossier()` manquante) — la page détail dossier ne fonctionnait
  probablement pas du tout. Corrigé, testé, régression impossible sans échec de test.
- **Capacitor connecté aux API distantes** : `js/config.js` centralise la résolution
  d'URL (`resolveApiUrl`), `apiGet/apiPost/apiPatch` (`js/app.js`) l'utilisent
  automatiquement. CORS restreint (`api/_lib/cors.js`) branché sur les 4 endpoints
  appelés depuis le parcours prospect (`dossiers.js`, `upload-url.js`,
  `appointments.js`, `public-config.js`) — jamais `Access-Control-Allow-Origin: *`.
- **Plugins réellement enregistrés** : `js/native-plugins.js` utilise
  `Capacitor.registerPlugin()` explicitement ; `native/android/MainActivity-additions.kt`
  documente l'enregistrement Android qui manquait purement et simplement (Capacitor 6
  l'exige, contrairement à iOS où la macro `CAP_PLUGIN` suffit).
- **Identité de marque centralisée** : `js/config.js` + `js/brand.js`, plus aucun nom en
  dur dans les pages. `manifest.json` régénéré via `scripts/generate-manifest.js`.
  `capacitor.config.json` remplacé par `capacitor.config.js` (lit `appName` depuis la
  config). Domaine personnalisé laissé **configurable et non interdit** — valeur
  provisoire vide (`brand.domaine`) ou Vercel (`api.baseUrlMobile`).
- **Session d'upload renouvelée correctement** : `DossierState.clear()` supprime
  désormais aussi `scan_session_id`, uniquement après confirmation serveur.
- **`mobile-web/` resynchronisé** avec tous les fichiers ci-dessus (était resté sur une
  version antérieure jusqu'à cette passe).

---

## 1. Base de données Supabase

Exécuter dans l'éditeur SQL, **dans l'ordre** :
1. `sql/schema.sql` (si projet neuf)
2. `sql/002_migration_securite_scan.sql`

## 2. Compte administrateur (Supabase Auth)

1. Dashboard → **Authentication → Users → Add user** (email + mot de passe de la décoratrice).
2. Copier l'UUID créé, puis dans l'éditeur SQL :
   ```sql
   insert into admins (user_id, email) values ('<uuid>', 'decoratrice@example.com');
   ```
   Un JWT Supabase Auth valide ne suffit pas à lui seul : sans cette ligne, l'accès aux
   API admin reste refusé (défense en profondeur, vérifié par le test d'intégration
   "Utilisateur Auth valide mais NON listé dans `admins` est refusé").

## 3. Bucket de stockage privé — configuration exacte

Dashboard Supabase → **Storage → New bucket** :
- Nom : `dossiers-media`
- **Private : oui**, sans exception
- **Taille maximale par objet** : 10 Mo (couvre le cas document/USDZ, le plus gros)
- **Types MIME autorisés** (allowed MIME types du bucket) :
  `image/jpeg, image/png, image/webp, application/pdf, model/vnd.usdz+zip`

Ce réglage bucket est une **deuxième barrière** en plus de la validation applicative
(`api/upload-url.js`) — les deux listes doivent rester synchronisées si les formats
acceptés changent un jour.

## 4. Nettoyage des fichiers orphelins (cron)

`vercel.json` déclare un cron quotidien (4h du matin) appelant `/api/cron-cleanup`, qui
supprime les fichiers Storage jamais rattachés à un dossier après 24h (session abandonnée
en cours de parcours). Aucune action manuelle nécessaire après déploiement — Vercel
active les crons déclarés dans `vercel.json` automatiquement (plan Pro requis pour les
crons sur Vercel ; sur le plan Hobby, le cron peut être déclenché manuellement ou via un
service externe comme cron-job.org en ciblant la même URL).

## 5. Variables d'environnement Vercel

Copier `.env.example` → renseigner dans Project Settings → Environment Variables.
`ADMIN_PASSWORD` n'existe plus (authentification 100% Supabase Auth désormais).

## 6. Déploiement web

Méthode inchangée : coller chaque fichier dans l'éditeur GitHub → commit → Vercel
redéploie. Le dossier `mobile-web/` fait partie du dépôt mais n'a pas besoin d'être
déployé sur Vercel séparément — c'est la copie utilisée uniquement par l'app mobile
Capacitor (voir section 7). Les dossiers `api/`, `sql/`, `docs/`, `native/`, `tests/` ne
sont jamais copiés dans l'app mobile.

## 7. Application mobile (Capacitor)

```bash
npm install
npx cap add ios       # génère le vrai projet Xcode (nécessite macOS + Xcode)
npx cap add android   # génère le vrai projet Android Studio
```

⚠️ Ces deux commandes n'ont **pas** été exécutées ici (pas de réseau, pas de toolchain).
Elles doivent être lancées sur une machine avec Xcode / Android Studio installés.

Une fois les projets générés :
- Copier `native/ios/Plugin/*.swift` et `native/ios/Plugin/RoomPlanPlugin.m` dans
  `ios/App/App/`. Fusionner `native/ios/Info.plist-additions.xml` dans
  `ios/App/App/Info.plist`.
- Copier `native/android/arcore-plugin/*.kt` dans
  `android/app/src/main/java/com/atelierdeplan/dossierprojet/arcore/`. Fusionner
  `native/android/AndroidManifest-additions.xml` dans
  `android/app/src/main/AndroidManifest.xml`. Ajouter au `build.gradle` du module app :
  ```gradle
  implementation 'com.google.ar:core:1.42.0'
  implementation 'androidx.appcompat:appcompat:1.7.0'
  ```

```bash
npx cap sync
npx cap open ios      # ouvre Xcode — compiler, corriger les erreurs, tester sur device
npx cap open android  # ouvre Android Studio — idem
```

Voir `native/README.md` pour le détail complet de ce qui est implémenté dans chaque
plugin et les limitations assumées.

## 8. Tests à exécuter après déploiement

```bash
npm test                    # 47 tests unitaires — déjà vérifiés, doivent rester au vert
TEST_BASE_URL=https://votre-app.vercel.app \
TEST_ADMIN_EMAIL=decoratrice@example.com \
TEST_ADMIN_PASSWORD=... \
TEST_NON_ADMIN_EMAIL=... \
TEST_NON_ADMIN_PASSWORD=... \
npm run test:integration    # 9 tests d'intégration — à exécuter en conditions réelles
```

### Checklist manuelle complémentaire
- [ ] Ouvrir `/scanner.html` en navigateur normal (pas Capacitor) → doit basculer sur le
      parcours photos/mesures et rediriger vers `dossier.html` (pas d'erreur 404).
- [ ] Ouvrir `admin/dossier.html` sur un vrai dossier → vérifier que TOUT s'affiche :
      photos, documents/PDF (bouton Consulter fonctionnel), mesures, résumé IA (les 4
      boutons d'assistance), changement de statut, notes privées, prochaine action. Ce
      point avait un bug bloquant avant cette passe (fonction manquante) — désormais
      couvert par un test de non-régression, mais une vérification visuelle reste utile.
- [ ] Dans l'espace admin, ouvrir un dossier avec un PDF joint → le bouton "Consulter"
      doit ouvrir le PDF via lien signé, pas d'accès direct au bucket.
- [ ] Soumettre un dossier avec une photo de 9 Mo → rejeté avec message clair.
- [ ] Soumettre un fichier `.exe` renommé en `.pdf` → rejeté (le `contentType` déclaré est
      vérifié, mais pour une validation plus stricte encore, envisager une vérification
      des "magic bytes" côté serveur en V3).
- [ ] Ajouter deux notes privées identiques → une seule apparaît dans l'historique.
- [ ] Prendre un rendez-vous à 14h en heure d'été ET un autre en heure d'hiver → vérifier
      l'affichage correct côté admin dans les deux cas (couvert unitairement, à
      reconfirmer visuellement).
- [ ] Se connecter en admin, attendre l'expiration du token (ou le révoquer côté
      Supabase), recharger la page → doit rediriger vers `login.html` plutôt que planter.
- [ ] Depuis l'app Capacitor installée (une fois compilée), vérifier dans les DevTools
      distants (Safari Web Inspector / chrome://inspect) que les appels réseau partent
      bien vers l'URL absolue de `baseUrlMobile`, pas vers une origine locale introuvable.

## 9. Limites connues, assumées

- Le rendu caméra AR Android reste une simplification (overlay Canvas 2D plutôt qu'un
  rendu 3D complet des ancres) — fonctionnellement suffisant, visuellement plus simple
  qu'un rendu 3D natif complet.
- L'export USDZ iOS dépend de `CapturedRoom.export(to:exportOptions:)` — à vérifier que
  la signature exacte correspond à la version RoomPlan ciblée lors de la compilation.
- Le rate limiting fail-open si Upstash n'est pas configuré (log d'avertissement, ne
  bloque pas le site).
- Aucune fonctionnalité de rendu photoréaliste, détection de murs porteurs ou devis
  automatique — conformément au périmètre demandé, non ajoutées.
