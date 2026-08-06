// api/_lib/supabase.js
// Client Supabase côté serveur uniquement (clé service_role).
// Ne jamais importer ce fichier dans du code exécuté navigateur.
const { createClient } = require('@supabase/supabase-js');

// LOG TEMPORAIRE DE DIAGNOSTIC — à retirer après résolution
console.log('[DIAG] SUPABASE_URL présent:', !!process.env.SUPABASE_URL, '| longueur:', (process.env.SUPABASE_URL || '').length, '| commence par https:', (process.env.SUPABASE_URL || '').startsWith('https://'));
console.log('[DIAG] SUPABASE_SERVICE_KEY présent:', !!process.env.SUPABASE_SERVICE_KEY, '| longueur:', (process.env.SUPABASE_SERVICE_KEY || '').length);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans les variables d\'environnement');
}
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
module.exports = { supabaseAdmin };
