// api/public-config.js
// GET /api/public-config
// Expose l'URL Supabase et la clé "anon" au navigateur — ces deux valeurs sont
// publiques par conception (c'est la clé service_role qui doit rester secrète, jamais
// celle-ci). Évite de coder ces valeurs en dur dans le HTML statique.

const { handlePreflight } = require('../lib/cors');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  return res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
};
