// api/_lib/validateScan.js
// Validation stricte de tout ce qui provient d'un scan (web manuel, iOS LiDAR,
// Android ARCore) avant écriture en base. Principe : on ne fait JAMAIS confiance à un
// objet JSON envoyé par le client, même s'il "a l'air" conforme au schéma attendu —
// chaque champ est revalidé et reconstruit ici, plutôt que transmis tel quel.

const STORAGE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(photos|documents)\/\d+-[a-zA-Z0-9._-]+$/i;

const SCAN_PROVIDERS = ['manuel', 'ios_lidar', 'android_arcore'];
const OPENING_TYPES = ['porte', 'fenêtre', 'ouverture'];
const CONFIDENCE_LABELS = ['haute', 'moyenne', 'basse', 'inconnue'];
const ANNOTATION_STATUTS = ['conserver', 'modifier', 'supprimer', 'probleme', 'a_verifier'];
const EXPORT_TYPES = ['usdz', 'pdf'];

function isFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n);
}

function clampNumber(value, { min = 0, max = 100000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function safeString(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function safeEnum(value, allowed, fallback = null) {
  return allowed.includes(value) ? value : fallback;
}

function isValidStoragePath(path) {
  return typeof path === 'string' && STORAGE_PATH_RE.test(path);
}

/** Un mur valide doit avoir une largeur plausible (0 à 20 m) — au-delà, c'est presque
 *  certainement une erreur d'unité ou une donnée corrompue plutôt qu'un vrai mur. */
function validateWalls(walls) {
  if (!Array.isArray(walls)) return [];
  return walls.slice(0, 30).map((w, i) => {
    const largeur = clampNumber(w?.largeur_cm, { min: 0, max: 2000 });
    const hauteur = w?.hauteur_cm !== undefined ? clampNumber(w.hauteur_cm, { min: 0, max: 500 }) : null;
    if (largeur === null) return null;
    return {
      id: safeString(w?.id, 60) || `wall-${i}`,
      largeur_cm: largeur,
      ...(hauteur !== null ? { hauteur_cm: hauteur } : {}),
      confidence: safeEnum(w?.confidence, CONFIDENCE_LABELS, 'inconnue')
    };
  }).filter(Boolean);
}

function validateOpenings(openings) {
  if (!Array.isArray(openings)) return [];
  return openings.slice(0, 30).map((o, i) => {
    const largeur = clampNumber(o?.largeur_cm, { min: 0, max: 500 });
    const hauteur = clampNumber(o?.hauteur_cm, { min: 0, max: 300 });
    if (largeur === null || hauteur === null) return null;
    return {
      id: safeString(o?.id, 60) || `opening-${i}`,
      type: safeEnum(o?.type, OPENING_TYPES, 'ouverture'),
      largeur_cm: largeur,
      hauteur_cm: hauteur,
      // Une hauteur non mesurée directement (ex: valeur par défaut proposée par le
      // parcours ARCore) doit rester marquée comme telle jusqu'à confirmation du client —
      // jamais présentée comme une mesure au même titre qu'une valeur confirmée.
      hauteur_source: safeEnum(o?.hauteur_source, ['mesuree', 'estimee_defaut_a_corriger', 'confirmee_client'], 'mesuree'),
      confidence: safeEnum(o?.confidence, CONFIDENCE_LABELS, 'inconnue')
    };
  }).filter(Boolean);
}

function validateObjects(objects) {
  if (!Array.isArray(objects)) return [];
  return objects.slice(0, 50).map((o, i) => {
    const largeur = clampNumber(o?.largeur_cm, { min: 0, max: 1000 });
    const hauteur = clampNumber(o?.hauteur_cm, { min: 0, max: 1000 });
    const profondeur = o?.profondeur_cm !== undefined ? clampNumber(o.profondeur_cm, { min: 0, max: 1000 }) : null;
    if (largeur === null || hauteur === null) return null;
    return {
      id: safeString(o?.id, 60) || `object-${i}`,
      categorie: safeString(o?.categorie, 60),
      largeur_cm: largeur,
      hauteur_cm: hauteur,
      ...(profondeur !== null ? { profondeur_cm: profondeur } : {}),
      confidence: safeEnum(o?.confidence, CONFIDENCE_LABELS, 'inconnue')
    };
  }).filter(Boolean);
}

function validateAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  return annotations.slice(0, 30).map((a) => ({
    mur_id: safeString(a?.mur_id, 60),
    statut: safeEnum(a?.statut, ANNOTATION_STATUTS, 'a_verifier')
  })).filter(a => a.mur_id);
}

function validateDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return {};
  const out = {};

  if (dimensions.largeur_cm !== undefined) {
    const v = clampNumber(dimensions.largeur_cm, { min: 0, max: 2000 });
    if (v !== null) out.largeur_cm = v;
  }
  if (dimensions.longueur_cm !== undefined) {
    const v = clampNumber(dimensions.longueur_cm, { min: 0, max: 2000 });
    if (v !== null) out.longueur_cm = v;
  }
  if (dimensions.perimetre_cm !== undefined) {
    const v = clampNumber(dimensions.perimetre_cm, { min: 0, max: 10000 });
    if (v !== null) out.perimetre_cm = v;
  }
  if (dimensions.nombre_murs !== undefined) {
    const v = clampNumber(dimensions.nombre_murs, { min: 0, max: 30 });
    if (v !== null) out.nombre_murs = Math.round(v);
  }
  if (dimensions.note !== undefined) {
    out.note = safeString(dimensions.note, 300);
  }
  if (dimensions.reference && typeof dimensions.reference === 'object') {
    const libelle = safeString(dimensions.reference.libelle, 100);
    const valeur = clampNumber(dimensions.reference.valeur_cm, { min: 0, max: 2000 });
    if (libelle && valeur !== null) {
      out.reference = { libelle, valeur_cm: valeur };
    }
  }

  return out;
}

function validateConfidenceScore(value) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function validateManualCorrections(corrections) {
  if (!Array.isArray(corrections)) return [];
  return corrections.slice(0, 50).map(c => ({
    champ: safeString(c?.champ, 100),
    ancienne_valeur: safeString(c?.ancienne_valeur, 200),
    nouvelle_valeur: safeString(c?.nouvelle_valeur, 200)
  })).filter(c => c.champ);
}

function validateExportFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.slice(0, 5).map(f => {
    if (!isValidStoragePath(f?.storage_path)) return null;
    return {
      storage_path: f.storage_path,
      type: safeEnum(f?.type, EXPORT_TYPES, 'pdf')
    };
  }).filter(Boolean);
}

function validatePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos.slice(0, 20).map((p, i) => {
    if (!isValidStoragePath(p?.storage_path)) return null;
    return {
      storage_path: p.storage_path,
      legende: safeString(p?.legende, 200) || `Photo ${i + 1}`,
      mur_id: safeString(p?.mur_id, 60) || null,
      statut_annotation: safeEnum(p?.statut_annotation, ANNOTATION_STATUTS, 'a_verifier'),
      nettete_ok: typeof p?.nettete_ok === 'boolean' ? p.nettete_ok : null
    };
  }).filter(Boolean);
}

function validateDocuments(documents) {
  if (!Array.isArray(documents)) return [];
  return documents.slice(0, 10).map(d => {
    if (!isValidStoragePath(d?.storage_path)) return null;
    return {
      storage_path: d.storage_path,
      nom_original: safeString(d?.nom_original, 200) || 'Document',
      type_mime: safeEnum(d?.type_mime, ['application/pdf', 'model/vnd.usdz+zip'], 'application/pdf')
    };
  }).filter(Boolean);
}

function validateMesures(mesures) {
  if (!Array.isArray(mesures)) return [];
  return mesures.slice(0, 60).map(m => {
    const valeur = clampNumber(m?.valeur_cm, { min: 0, max: 2000 });
    const libelle = safeString(m?.libelle, 200);
    if (valeur === null || !libelle) return null;
    return { libelle, valeur_cm: valeur };
  }).filter(Boolean);
}

function safeDeviceCapabilities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const asString = JSON.stringify(value);
    if (asString.length > 2000) return null; // rejeté plutôt que tronqué (éviter un JSON invalide)
    return JSON.parse(asString);
  } catch {
    return null;
  }
}

/**
 * Valide et normalise l'ensemble des champs liés au scan, quel que soit le mode
 * d'origine (manuel / ios_lidar / android_arcore).
 */
function validateScanPayload(body) {
  return {
    scan_provider: safeEnum(body.scan_provider, SCAN_PROVIDERS, 'manuel'),
    scan_version: safeString(body.scan_version, 20) || '1.0',
    device_capabilities: safeDeviceCapabilities(body.device_capabilities),
    room_name: body.room_name ? safeString(body.room_name, 100) : null,
    walls: validateWalls(body.walls),
    openings: validateOpenings(body.openings),
    dimensions: validateDimensions(body.dimensions),
    objects: validateObjects(body.objects),
    annotations: validateAnnotations(body.annotations),
    confidence_score: validateConfidenceScore(body.confidence_score),
    manual_corrections: validateManualCorrections(body.manual_corrections),
    export_files: validateExportFiles(body.export_files),
    photos: validatePhotos(body.photos),
    documents: validateDocuments(body.documents),
    mesures: validateMesures(body.mesures)
  };
}

module.exports = {
  validateScanPayload,
  isValidStoragePath,
  validatePhotos,
  validateDocuments,
  validateMesures
};
