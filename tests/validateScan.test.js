// tests/validateScan.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateScanPayload,
  isValidStoragePath,
  validatePhotos,
  validateMesures
} = require('../lib/validateScan.js');

const VALID_SESSION = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

test('isValidStoragePath — accepte un chemin conforme, rejette le reste', () => {
  assert.equal(isValidStoragePath(`${VALID_SESSION}/photos/1234-photo.jpg`), true);
  assert.equal(isValidStoragePath('../../etc/passwd'), false);
  assert.equal(isValidStoragePath('not-a-uuid/photos/1234-x.jpg'), false);
  assert.equal(isValidStoragePath(`${VALID_SESSION}/photos/../../../secret.jpg`), false);
  assert.equal(isValidStoragePath(''), false);
  assert.equal(isValidStoragePath(null), false);
});

test('validateScanPayload — scan_provider inconnu retombe sur "manuel"', () => {
  const result = validateScanPayload({ scan_provider: 'chose_inventee' });
  assert.equal(result.scan_provider, 'manuel');
});

test('validateScanPayload — walls : largeur négative ou absurde rejetée', () => {
  const result = validateScanPayload({
    walls: [
      { id: 'w1', largeur_cm: 320 },      // valide
      { id: 'w2', largeur_cm: -50 },       // négatif -> rejeté
      { id: 'w3', largeur_cm: 999999 },     // absurde -> rejeté
      { id: 'w4', largeur_cm: 'abc' }        // non numérique -> rejeté
    ]
  });
  assert.equal(result.walls.length, 1);
  assert.equal(result.walls[0].largeur_cm, 320);
});

test('validateScanPayload — confidence_score toujours dans [0,100]', () => {
  assert.equal(validateScanPayload({ confidence_score: 150 }).confidence_score, 100);
  assert.equal(validateScanPayload({ confidence_score: -30 }).confidence_score, 0);
  assert.equal(validateScanPayload({ confidence_score: 42.7 }).confidence_score, 43);
  assert.equal(validateScanPayload({ confidence_score: 'beaucoup' }).confidence_score, null);
});

test('validateScanPayload — openings : hauteur_source non reconnue retombe sur "mesuree"', () => {
  const result = validateScanPayload({
    openings: [{ id: 'o1', type: 'porte', largeur_cm: 80, hauteur_cm: 204, hauteur_source: 'invente' }]
  });
  assert.equal(result.openings[0].hauteur_source, 'mesuree');
});

test('validateScanPayload — dimensions : clés inconnues ignorées, valeurs bornées gardées', () => {
  const result = validateScanPayload({
    dimensions: { largeur_cm: 400, cle_arbitraire: 'devrait disparaître', longueur_cm: -10 }
  });
  assert.equal(result.dimensions.largeur_cm, 400);
  assert.equal(result.dimensions.cle_arbitraire, undefined);
  assert.equal(result.dimensions.longueur_cm, undefined); // négatif -> rejeté silencieusement
});

test('validateScanPayload — export_files : storage_path invalide filtré', () => {
  const result = validateScanPayload({
    export_files: [
      { storage_path: `${VALID_SESSION}/documents/123-scan.usdz`, type: 'usdz' },
      { storage_path: '/etc/passwd', type: 'usdz' }
    ]
  });
  assert.equal(result.export_files.length, 1);
});

test('validatePhotos — limite à 20 photos même si plus envoyées', () => {
  const photos = Array.from({ length: 30 }, (_, i) => ({
    storage_path: `${VALID_SESSION}/photos/${i}-photo.jpg`,
    legende: `Photo ${i}`
  }));
  const result = validatePhotos(photos);
  assert.equal(result.length, 20);
});

test('validatePhotos — statut_annotation invalide retombe sur "a_verifier"', () => {
  const result = validatePhotos([
    { storage_path: `${VALID_SESSION}/photos/1-x.jpg`, statut_annotation: 'valeur_inventee' }
  ]);
  assert.equal(result[0].statut_annotation, 'a_verifier');
});

test('validateMesures — valeur non numérique ou négative rejetée', () => {
  const result = validateMesures([
    { libelle: 'Largeur', valeur_cm: 320 },
    { libelle: 'Absurde', valeur_cm: -5 },
    { libelle: '', valeur_cm: 100 }, // libellé vide -> rejeté
    { libelle: 'Texte', valeur_cm: 'pas un nombre' }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].libelle, 'Largeur');
});
