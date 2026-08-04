// api/appointments.js
// POST /api/appointments — le prospect propose ses créneaux de disponibilité.
// GET  /api/appointments?dossier_id=... — réservé admin (authentification Supabase réelle).

const { supabaseAdmin } = require('./_lib/supabase');
const { requireAdmin } = require('./_lib/auth');
const { checkRateLimit } = require('./_lib/rateLimit');
const { handlePreflight } = require('./_lib/cors');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  try {
    if (req.method === 'POST') {
      const allowed = await checkRateLimit(req, 'appointments', { limit: 10, windowSeconds: 3600 });
      if (!allowed) return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });

      const { code_acces, creneau1, creneau2, lieu } = req.body;
      if (!code_acces || !creneau1) return res.status(400).json({ error: 'Créneau requis' });

      const { data: dossier, error: findError } = await supabaseAdmin
        .from('dossiers')
        .select('id')
        .eq('code_acces', code_acces)
        .single();
      if (findError || !dossier) return res.status(404).json({ error: 'Dossier introuvable' });

      const inserts = [{ dossier_id: dossier.id, date_heure: creneau1, lieu, statut: 'proposé' }];
      if (creneau2) inserts.push({ dossier_id: dossier.id, date_heure: creneau2, lieu, statut: 'proposé' });

      const { error } = await supabaseAdmin.from('rendez_vous').insert(inserts);
      if (error) throw error;

      await supabaseAdmin.from('dossiers').update({ statut: 'À contacter' }).eq('id', dossier.id);
      await supabaseAdmin.from('historique_statuts').insert({ dossier_id: dossier.id, statut: 'À contacter' });

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const { dossier_id } = req.query;
      const { data, error } = await supabaseAdmin.from('rendez_vous').select('*').eq('dossier_id', dossier_id);
      if (error) throw error;
      return res.status(200).json({ rendez_vous: data });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
