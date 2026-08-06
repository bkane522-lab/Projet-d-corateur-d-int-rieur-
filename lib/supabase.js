// api/_lib/supabase.js
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_KEY || '';
console.log('[DIAG] SUPABASE_URL longueur:', url.length, '| SUPABASE_SERVICE_KEY longueur:', key.length, '| SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans les variables d\'environnement');
}
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
module.exports = { supabaseAdmin };
