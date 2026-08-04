// api/analyze.js
// POST /api/analyze — réservé à l'espace décoratrice.
// body: { dossier_id, action } où action ∈ :
//   'questions_rdv'    → prépare des questions pour le premier rendez-vous
//   'infos_manquantes' → signale les informations manquantes dans le dossier
//   'incoherences'     → relève les incohérences entre mesures déclarées et le reste
//   'classification'   → propose un type d'accompagnement adapté
//
// Garde-fous identiques à summary.js : jamais de dimension inventée, jamais de
// diagnostic structurel, jamais de plan présenté comme validé.

const { supabaseAdmin } = require('./_lib/supabase');
const { requireAdmin } = require('./_lib/auth');
const { callGroq } = require('./_lib/groq');

const PROMPTS = {
  questions_rdv: (d) => `À partir de ce dossier (${JSON.stringify(dossierResume(d))}),
propose 5 questions concrètes à poser au client lors du premier rendez-vous, pour clarifier
ce qui n'est pas encore assez précis dans sa demande. Une question par ligne, sans numéro.`,

  infos_manquantes: (d) => `À partir de ce dossier (${JSON.stringify(dossierResume(d))}),
liste les informations importantes qui manquent encore pour bien démarrer le projet
(budget précis, contraintes techniques, accès au logement, etc.). Une information par
ligne, sans numéro. Si rien ne manque de façon évidente, dis-le simplement.`,

  incoherences: (d) => `Voici les mesures déclarées : ${JSON.stringify(d.mesures || [])}.
Voici la surface déclarée par le client : ${d.surface_m2 || 'non précisée'} m².
Signale UNIQUEMENT les incohérences arithmétiques évidentes entre ces valeurs déclarées
(par exemple une surface qui ne correspond visiblement pas aux mesures données). Ne calcule
et n'affirme rien qui ne découle pas directement des chiffres fournis. Si tu ne peux rien
affirmer avec certitude à partir des seules données présentes, dis-le.`,

  classification: (d) => `À partir de ce dossier (${JSON.stringify(dossierResume(d))}),
propose UNE catégorie d'accompagnement parmi : "Conseil ponctuel", "Rénovation partielle",
"Rénovation complète", "Projet de construction/extension". Réponds avec la catégorie
choisie suivie d'une phrase justifiant ce choix à partir des informations données
uniquement.`
};

function dossierResume(d) {
  return {
    type_logement: d.type_logement,
    piece_concernee: d.piece_concernee,
    surface_m2: d.surface_m2,
    probleme_principal: d.probleme_principal,
    elements_a_conserver: d.elements_a_conserver,
    style_recherche: d.style_recherche,
    budget: d.budget,
    calendrier: d.calendrier,
    confidence_score: d.confidence_score
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const { dossier_id, action } = req.body;
    if (!dossier_id || !PROMPTS[action]) {
      return res.status(400).json({ error: 'dossier_id et action valide requis' });
    }

    const { data: dossier, error } = await supabaseAdmin.from('dossiers').select('*').eq('id', dossier_id).single();
    if (error || !dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    if (action === 'incoherences') {
      const { data: mesures } = await supabaseAdmin.from('mesures').select('*').eq('dossier_id', dossier_id);
      dossier.mesures = mesures || [];
    }

    let resultat;
    try {
      resultat = await callGroq(PROMPTS[action](dossier), { maxTokens: 400, temperature: 0.3 });
    } catch (groqErr) {
      console.error(groqErr);
      return res.status(502).json({ error: 'Le service IA est momentanément indisponible' });
    }

    return res.status(200).json({ resultat });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
