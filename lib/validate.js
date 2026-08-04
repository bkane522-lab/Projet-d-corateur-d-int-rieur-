// api/_lib/validate.js
// Validation et normalisation côté serveur — ne jamais faire confiance aux données
// envoyées par le navigateur, même si le formulaire les contraint déjà côté client.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ENUMS = {
  type_logement: ['Appartement', 'Maison', 'Studio', 'Loft'],
  piece_concernee: ['Salon', 'Cuisine', 'Chambre', 'Salle de bain', 'Tout le logement'],
  style_recherche: ['Contemporain', 'Scandinave', 'Industriel', 'Classique revisité', 'Je ne sais pas encore'],
  budget: ['Moins de 10 000 €', '10 000 – 30 000 €', '30 000 – 60 000 €', 'Plus de 60 000 €'],
  calendrier: ['Dès que possible', 'Dans 3 mois', 'Dans 6 mois', 'Pas encore de date'],
  statut: ['Nouveau', 'À analyser', 'À contacter', 'Rendez-vous programmé', 'Proposition envoyée', 'Signé', 'Archivé'],
  source_scan: ['manuel', 'ios_lidar', 'android_arcore']
};

function cleanText(value, maxLen = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function validateEnum(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const allowed = ENUMS[field];
  if (!allowed) return cleanText(value, 100);
  return allowed.includes(value) ? value : null;
}

function validateEmail(email) {
  const clean = cleanText(email, 200);
  return EMAIL_RE.test(clean) ? clean.toLowerCase() : null;
}

function validateNumber(value, { min = 0, max = 100000 } = {}) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

/**
 * Valide et normalise le payload de création d'un dossier.
 * Retourne { ok: true, data } ou { ok: false, errors }
 */
function validateDossierPayload(body) {
  const errors = [];

  const email = validateEmail(body.email_prospect);
  if (!email) errors.push('Email invalide');

  const nom = cleanText(body.nom_prospect, 120);
  if (!nom) errors.push('Nom requis');

  const telephone = cleanText(body.telephone_prospect, 30);

  const data = {
    nom_prospect: nom,
    email_prospect: email,
    telephone_prospect: telephone,
    type_logement: validateEnum(body.type_logement, 'type_logement'),
    piece_concernee: validateEnum(body.piece_concernee, 'piece_concernee'),
    ville: cleanText(body.ville, 100),
    surface_m2: body.surface_m2 ? validateNumber(body.surface_m2, { min: 1, max: 2000 }) : null,
    probleme_principal: cleanText(body.probleme_principal, 1000),
    elements_a_conserver: cleanText(body.elements_a_conserver, 1000),
    style_recherche: validateEnum(body.style_recherche, 'style_recherche'),
    budget: validateEnum(body.budget, 'budget'),
    calendrier: validateEnum(body.calendrier, 'calendrier'),
    source_scan: validateEnum(body.source_scan, 'source_scan') || 'manuel'
  };

  return { ok: errors.length === 0, errors, data };
}

/** Anti-spam : un champ honeypot invisible qui ne doit jamais être rempli par un humain
 *  (les navigateurs et gestionnaires de mots de passe ne le remplissent pas non plus,
 *  car son nom n'appartient à aucune heuristique d'autocomplétion standard). On ne se
 *  base plus sur un délai minimal de remplissage : un vrai utilisateur pourrait très bien
 *  remplir un formulaire rapidement (autofill, formulaire déjà pré-rempli en correction),
 *  et un délai trop strict finit par bloquer des gens réels plutôt que des bots. */
function passesHoneypot(body) {
  return !body.website_confirmation;
}

module.exports = { cleanText, validateEnum, validateEmail, validateNumber, validateDossierPayload, passesHoneypot, ENUMS };
