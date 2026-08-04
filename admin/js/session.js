// admin/js/session.js
// Remplace l'ancien "token brut en sessionStorage" par une vraie session Supabase Auth :
// restauration automatique au chargement, renouvellement automatique du JWT expiré,
// déconnexion réelle, redirection vers la connexion en cas d'expiration définitive.
//
// Utilise le stockage de session intégré de supabase-js (localStorage par défaut),
// avec persistSession + autoRefreshToken activés explicitement.

let _client = null;
let _clientReady = null;

function getAdminClient() {
  if (!_clientReady) {
    _clientReady = (async () => {
      const res = await fetch('/api/public-config');
      const { supabaseUrl, supabaseAnonKey } = await res.json();
      _client = supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      return _client;
    })();
  }
  return _clientReady;
}

/**
 * À appeler en haut de chaque page admin protégée (dashboard, détail dossier).
 * Redirige vers login.html si aucune session valide n'existe, sinon retourne la session.
 * Écoute aussi les événements de déconnexion/expiration pour rediriger en temps réel.
 */
async function requireAdminSession() {
  const client = await getAdminClient();
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  client.auth.onAuthStateChange((event, newSession) => {
    if (event === 'SIGNED_OUT' || (!newSession && event !== 'INITIAL_SESSION')) {
      window.location.href = 'login.html';
    }
  });

  return session;
}

/** Retourne toujours un token d'accès à jour (rafraîchi automatiquement par supabase-js
 *  si besoin) — à utiliser juste avant chaque appel API, plutôt que de garder un token
 *  figé en mémoire qui finirait par expirer. */
async function getAdminAuthHeaders() {
  const client = await getAdminClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    throw new Error('Session expirée');
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

async function signOutAdmin() {
  const client = await getAdminClient();
  await client.auth.signOut();
  window.location.href = 'login.html';
}
