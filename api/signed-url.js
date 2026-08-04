// api/signed-url.js
// GET /api/signed-url?path=... — réservé à l'espace décoratrice.
// Génère un lien de lecture temporaire (60 secondes) vers un fichier privé du bucket
// "dossiers-media". Aucun fichier du dossier n'est jamais rendu public directement.

const { supabaseAdmin } = require('./_lib/supabase');
const { requireAdmin } = require('./_lib/auth');

const BUCKET = 'dossiers-media';

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await requireAdmin(req, res);
  if (!user) return;

  const { path } = req.query;
  if (!path || typeof path !== 'string') return res.status(400).json({ error: 'path requis' });

  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60);

    if (error) throw error;

    return res.status(200).json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Impossible de générer le lien' });
  }
};
