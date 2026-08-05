// tests/photos-gate.test.js
// Non-régression pour le bug "photos échouent + bouton Continuer ne navigue pas"
// (mission V2, parcours Photos et mesures). Teste evaluatePhotosGate (js/app.js),
// la fonction pure qui décide si le bouton Continuer doit être bloqué.

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePhotosGate } = require('../js/app.js');

test('evaluatePhotosGate — aucune photo prise (tous "local") : pas bloqué', () => {
  const gate = evaluatePhotosGate(['local', 'local', 'local', 'local']);
  assert.equal(gate.disabled, false);
});

test('evaluatePhotosGate — toutes les photos envoyées : pas bloqué', () => {
  const gate = evaluatePhotosGate(['uploaded', 'uploaded', 'local', 'local']);
  assert.equal(gate.disabled, false);
});

test('evaluatePhotosGate — une photo en cours d\'envoi : bloqué avec message explicite', () => {
  const gate = evaluatePhotosGate(['uploaded', 'uploading', 'local', 'local']);
  assert.equal(gate.disabled, true);
  assert.ok(gate.reason.length > 0, 'un message explicatif doit être fourni');
});

test('evaluatePhotosGate — une photo en échec : bloqué, et ne navigue plus silencieusement', () => {
  // C'était le comportement fautif avant correctif : le bouton naviguait quand même en
  // ignorant les photos en échec, perdant silencieusement les données du prospect.
  const gate = evaluatePhotosGate(['uploaded', 'failed', 'local', 'local']);
  assert.equal(gate.disabled, true);
  assert.match(gate.reason, /envoyées|réessayez/i);
});

test('evaluatePhotosGate — échec ET en cours simultanément : priorité au message "en cours"', () => {
  const gate = evaluatePhotosGate(['failed', 'uploading']);
  assert.equal(gate.disabled, true);
  assert.match(gate.reason, /cours/i);
});

test('evaluatePhotosGate — tableau vide (aucun mur ajouté) : pas bloqué', () => {
  const gate = evaluatePhotosGate([]);
  assert.equal(gate.disabled, false);
});
