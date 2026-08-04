// api/_lib/auth.js
// Vérifie une véritable session Supabase Auth (JWT), et confirme que l'utilisateur
// est bien listé dans la table `admins`. Remplace l'ancien contrôle "Bearer + longueur"
// qui n'authentifiait rien.

const { supabaseAdmin } = require('./supabase');

/**
 * Retourne l'utilisateur admin authentifié, ou null si la requête n'est pas
 * légitimement authentifiée en tant qu'administrateur.
 */
async function getAdminUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  // 1. Vérifie que le JWT est un token Supabase Auth valide et non expiré.
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user) return null;

  // 2. Vérifie que cet utilisateur est bien autorisé en tant qu'administrateur
  //    (allowlist explicite en base, plutôt que de faire confiance à un simple JWT valide —
  //    n'importe quel compte Supabase Auth du projet ne doit pas devenir admin par erreur).
  const { data: admin, error: adminError } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError || !admin) return null;

  return userData.user;
}

/**
 * Helper à utiliser en tête de chaque endpoint admin :
 *   const user = await requireAdmin(req, res);
 *   if (!user) return; // la réponse 401 a déjà été envoyée
 */
async function requireAdmin(req, res) {
  const user = await getAdminUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentification administrateur requise' });
    return null;
  }
  return user;
}

module.exports = { getAdminUser, requireAdmin };
