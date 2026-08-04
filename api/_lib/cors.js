// api/_lib/cors.js
// Une app Capacitor installée charge son contenu depuis une origine différente de
// l'API (capacitor://localhost sur iOS, https://localhost sur Android par défaut), donc
// les appels vers l'API Vercel sont cross-origin et nécessitent des en-têtes CORS.
// On n'ouvre PAS `Access-Control-Allow-Origin: *` : seules les origines Capacitor
// connues et le domaine de production (voir js/config.js) sont autorisées.

const { APP_CONFIG } = require('../../js/config.js');

const ALLOWED_ORIGINS = [
  'capacitor://localhost', // iOS
  'https://localhost',      // Android (schéma par défaut du WebView Capacitor)
  'http://localhost',        // fallback émulateur Android / dev local
  APP_CONFIG.api.baseUrlMobile,
  APP_CONFIG.brand.domaine
].filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  // Si l'origine n'est pas dans la liste : aucun en-tête CORS n'est posé, et le
  // navigateur/WebView appelant bloquera la réponse de son côté — comportement voulu.
}

/** À appeler en tout premier dans chaque endpoint public (appelé depuis le site web ET
 *  l'app mobile). Retourne true si la requête était un préflight OPTIONS déjà traité
 *  (l'appelant doit alors `return` immédiatement sans rien faire d'autre). */
function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors, handlePreflight, ALLOWED_ORIGINS };
