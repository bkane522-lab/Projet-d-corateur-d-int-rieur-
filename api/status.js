// api/status.js
// PATCH /api/status — réservé à l'espace décoratrice (Supabase Auth vérifiée).

const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');
const { validateEnum, cleanText } = require('../lib/validate');

module.exports = async (req, res) => {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const { dossier_id, statut, prochaine_action, notes_privees } = req.body;
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    const statutValide = statut ? validateEnum(statut, 'statut') : null;
    if (statut && !statutValide) return res.status(400).json({ error: 'Statut invalide' });

    const update = {};
    if (statutValide) update.statut = statutValide;
    if (prochaine_action !== undefined) update.prochaine_action = cleanText(prochaine_action, 500);

    if (Object.keys(update).length > 0) {
      const { error } = await supabaseAdmin.from('dossiers').update(update).eq('id', dossier_id);
      if (error) throw error;
    }

    if (statutValide) {
      await supabaseAdmin.from('historique_statuts').insert({ dossier_id, statut: statutValide });
    }

    // Notes privées : on n'insère une nouvelle ligne que si le contenu est non vide
    // ET différent de la dernière note enregistrée — évite les doublons quand
    // la décoratrice clique sur "Enregistrer" sans avoir modifié le texte.
    const contenuNote = cleanText(notes_privees, 3000);
    if (contenuNote) {
      const { data: derniere } = await supabaseAdmin
        .from('notes_privees')
        .select('contenu')
        .eq('dossier_id', dossier_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!derniere || derniere.contenu !== contenuNote) {
        await supabaseAdmin.from('notes_privees').insert({ dossier_id, contenu: contenuNote });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
