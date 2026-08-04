// api/cron-cleanup.js
// GET /api/cron-cleanup — appelé automatiquement par Vercel Cron (voir vercel.json).
//
// Stratégie de suppression des fichiers orphelins : un prospect peut envoyer des photos
// ou documents (dans un dossier `dossiers-media/<session_id>/...`) puis abandonner le
// parcours avant de soumettre le questionnaire. Ce endpoint supprime les fichiers de
// session qui n'ont, après un délai de sécurité, jamais été rattachés à un dossier créé.
//
// Sécurité : Vercel envoie ses requêtes cron avec l'en-tête `user-agent: vercel-cron/1.0`.
// Ce n'est pas une authentification forte, mais combiné à `CRON_SECRET` (à ajouter en
// query string dans vercel.json si un contrôle plus strict est nécessaire), cela évite un
// déclenchement trivial par un tiers qui devine l'URL.

const { supabaseAdmin } = require('./_lib/supabase');

const BUCKET = 'dossiers-media';
const ORPHAN_DELAY_MS = 24 * 60 * 60 * 1000; // 24h de délai avant suppression

function isLikelyCron(req) {
  const ua = req.headers['user-agent'] || '';
  const secret = req.headers['x-cron-secret'] || req.query?.secret;
  if (process.env.CRON_SECRET) {
    return secret === process.env.CRON_SECRET;
  }
  return ua.includes('vercel-cron');
}

module.exports = async (req, res) => {
  if (!isLikelyCron(req)) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const { data: sessionFolders, error: listError } = await supabaseAdmin.storage
      .from(BUCKET)
      .list('', { limit: 1000 });
    if (listError) throw listError;

    let deletedSessions = 0;
    let deletedFiles = 0;

    for (const folder of sessionFolders || []) {
      const sessionId = folder.name;
      if (!sessionId) continue;

      // Un dossier a-t-il déjà été créé référençant ce session_id (préfixe des storage_path) ?
      const { data: linkedPhotos } = await supabaseAdmin
        .from('photos')
        .select('id')
        .like('storage_path', `${sessionId}/%`)
        .limit(1);
      const { data: linkedDocs } = await supabaseAdmin
        .from('documents')
        .select('id')
        .like('storage_path', `${sessionId}/%`)
        .limit(1);

      if ((linkedPhotos && linkedPhotos.length > 0) || (linkedDocs && linkedDocs.length > 0)) {
        continue; // rattaché à un dossier réel : on ne touche à rien
      }

      // Vérifie l'ancienneté des fichiers de cette session (via les sous-dossiers photos/documents)
      const { data: photoFiles } = await supabaseAdmin.storage.from(BUCKET).list(`${sessionId}/photos`);
      const { data: docFiles } = await supabaseAdmin.storage.from(BUCKET).list(`${sessionId}/documents`);
      const allFiles = [...(photoFiles || []), ...(docFiles || [])];
      if (allFiles.length === 0) continue;

      const allOldEnough = allFiles.every(f => {
        const createdAt = new Date(f.created_at || f.updated_at || 0).getTime();
        return Date.now() - createdAt > ORPHAN_DELAY_MS;
      });
      if (!allOldEnough) continue;

      const pathsToDelete = [
        ...(photoFiles || []).map(f => `${sessionId}/photos/${f.name}`),
        ...(docFiles || []).map(f => `${sessionId}/documents/${f.name}`)
      ];

      if (pathsToDelete.length > 0) {
        await supabaseAdmin.storage.from(BUCKET).remove(pathsToDelete);
        deletedFiles += pathsToDelete.length;
        deletedSessions++;
      }
    }

    return res.status(200).json({ ok: true, deletedSessions, deletedFiles });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur lors du nettoyage' });
  }
};
