// api/summary.js
// POST /api/summary — réservé à l'espace décoratrice.
// Génère un résumé synthétique du besoin. Voir api/_lib/groq.js pour les garde-fous
// (jamais de dimension inventée, jamais de diagnostic structurel).

const { supabaseAdmin } = require('../lib/supabase');
const { requireAdmin } = require('../lib/auth');
const { callGroq } = require('../lib/groq');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const { dossier_id } = req.body;
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    const { data: dossier, error } = await supabaseAdmin.from('dossiers').select('*').eq('id', dossier_id).single();
    if (error || !dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const prompt = `Voici les informations déclarées d'un dossier prospect :
- Type de logement : ${dossier.type_logement || 'non précisé'}
- Pièce concernée : ${dossier.piece_concernee || 'non précisée'}
- Ville : ${dossier.ville || 'non précisée'}
- Surface déclarée : ${dossier.surface_m2 || 'non précisée'} m²
- Problème principal : ${dossier.probleme_principal || 'non précisé'}
- Éléments à conserver : ${dossier.elements_a_conserver || 'aucun'}
- Style recherché : ${dossier.style_recherche || 'non précisé'}
- Budget : ${dossier.budget || 'non précisé'}
- Calendrier : ${dossier.calendrier || 'non précisé'}
- Source du scan : ${dossier.scan_provider || 'manuel'} (indicatif, non validé par la décoratrice)

Rédige un résumé court (5-6 phrases maximum) à destination de la décoratrice, centré sur le
vrai problème du client et les contraintes fortes. Ton direct et professionnel.`;

    let resume;
    try {
      resume = await callGroq(prompt, { maxTokens: 400, temperature: 0.5 });
    } catch (groqErr) {
      console.error(groqErr);
      return res.status(502).json({ error: 'Le service IA est momentanément indisponible' });
    }

    await supabaseAdmin.from('dossiers').update({ resume_ia: resume }).eq('id', dossier_id);

    return res.status(200).json({ resume });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
