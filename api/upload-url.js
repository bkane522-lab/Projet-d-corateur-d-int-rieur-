// api/upload-url.js
// POST /api/upload-url
// Génère une URL signée d'upload direct vers le bucket privé Supabase Storage
// "dossiers-media". Le fichier ne transite jamais par notre base de données —
// seul le chemin de stockage est conservé (voir photos / documents).
//
// Configuration attendue du bucket côté Supabase Dashboard (Storage → dossiers-media) :
//   - Private : oui (jamais public)
//   - Taille max par objet : configurer 10 Mo (couvre le cas document, le plus gros)
//   - Types MIME autorisés (allowed MIME types du bucket) :
//       image/jpeg, image/png, image/webp, application/pdf, model/vnd.usdz+zip
//     Ce réglage bucket est une deuxième barrière, en plus de la validation ci-dessous —
//     les deux doivent être tenues à jour ensemble si les formats acceptés changent.

const { supabaseAdmin } = require('../lib/supabase');
const { checkRateLimit } = require('../lib/rateLimit');
const { handlePreflight } = require('../lib/cors');

const BUCKET = 'dossiers-media';

const ALLOWED_TYPES = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  document: ['application/pdf', 'model/vnd.usdz+zip']
};

const MAX_SIZE_BYTES = {
  photo: 8 * 1024 * 1024,      // 8 Mo avant compression
  document: 10 * 1024 * 1024   // 10 Mo
};

const MAX_FILES_PER_SESSION = {
  photo: 12,
  document: 5
};

const MAX_FILENAME_LEN = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilename(name) {
  const base = (name || 'fichier').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // enlève les accents
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, MAX_FILENAME_LEN) || 'fichier';
}

async function countExistingFiles(sessionId, kind) {
  const folder = kind === 'photo' ? 'photos' : 'documents';
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(`${sessionId}/${folder}`);
  if (error) return 0; // dossier pas encore créé = 0 fichier existant
  return (data || []).length;
}

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const allowed = await checkRateLimit(req, 'upload-url', { limit: 40, windowSeconds: 3600 });
  if (!allowed) return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });

  try {
    const { session_id, filename, contentType, kind, fileSize } = req.body;

    if (!session_id || typeof session_id !== 'string' || !UUID_RE.test(session_id)) {
      return res.status(400).json({ error: 'session_id invalide (doit être un UUID)' });
    }
    if (!['photo', 'document'].includes(kind)) {
      return res.status(400).json({ error: 'kind doit être "photo" ou "document"' });
    }
    if (!ALLOWED_TYPES[kind].includes(contentType)) {
      return res.status(400).json({ error: `Format non autorisé pour ${kind}` });
    }

    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: 'Taille de fichier invalide' });
    }
    if (size > MAX_SIZE_BYTES[kind]) {
      const maxMo = MAX_SIZE_BYTES[kind] / (1024 * 1024);
      return res.status(400).json({ error: `Fichier trop volumineux (${maxMo} Mo maximum pour ${kind === 'photo' ? 'une photo' : 'un document'})` });
    }

    const existingCount = await countExistingFiles(session_id, kind);
    if (existingCount >= MAX_FILES_PER_SESSION[kind]) {
      return res.status(400).json({ error: `Nombre maximal de fichiers atteint (${MAX_FILES_PER_SESSION[kind]})` });
    }

    const safeName = sanitizeFilename(filename);
    const folder = kind === 'photo' ? 'photos' : 'documents';
    const path = `${session_id}/${folder}/${Date.now()}-${safeName}`;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error) throw error;

    return res.status(200).json({
      signedUrl: data.signedUrl,
      token: data.token,
      path
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Impossible de préparer l\'envoi du fichier' });
  }
};
