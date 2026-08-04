// capacitor.config.js
// Capacitor accepte nativement un fichier de config .js/.ts en plus du .json — utilisé
// ici pour que `appName` lise la même source de vérité que le reste de l'app
// (js/config.js), plutôt que de dupliquer le nom de marque une troisième fois.

const { APP_CONFIG } = require('./js/config.js');

module.exports = {
  // ⚠️ IDENTIFIANT PROVISOIRE — voir native/README.md, section "Identifiants natifs".
  // `com.example.*` est un domaine réservé, jamais publiable sur l'App Store / Play
  // Store. Avant toute soumission réelle, remplacer par un identifiant définitif basé
  // sur le nom commercial choisi (ex: com.nomdelagence.dossierprojet), en respectant les
  // contraintes de chaque store (unique, non modifiable après première publication).
  appId: 'com.example.dossierprojet.provisional',
  appName: APP_CONFIG.brand.nomCourt,
  webDir: 'mobile-web',
  bundledWebRuntime: false,
  // Ne JAMAIS utiliser `server.url` en production : cela ferait charger l'app depuis un
  // serveur distant au lieu des fichiers embarqués dans mobile-web, perdant tout
  // fonctionnement hors-ligne et la logique de resolveApiUrl() de js/config.js, conçue
  // précisément pour ne pas en dépendre.
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    RoomPlanPlugin: {},
    ARCorePlugin: {}
  }
};
