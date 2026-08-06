// api/_lib/supabase.js
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || '';
console.log('[DIAG] SUPABASE_URL longueur:', url.length);
console.log('[DIAG] SUPABASE_URL codes:', Array.from(url).map(c => c.charCodeAt(0)).join(','));
try {
  new URL(url);
  console.log('[DIAG] new URL() OK');
} catch (e) {
  console.log('[DIAG] new URL() ECHEC:', e.message);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans les variables d\'environnement');
}
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
module.exports = { supabaseAdmin };
