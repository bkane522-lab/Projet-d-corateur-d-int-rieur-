// tests/session-renewal.test.js
// Vérifie le comportement attendu au point 5 : `scan_session_id` (et `dossier_en_cours`)
// ne doivent être effacés qu'après confirmation réelle de la création du dossier — jamais
// avant un appel serveur, et jamais partiellement. Un nouveau projet doit ensuite obtenir
// un tout nouvel UUID de session.
//
// sessionStorage n'existe pas sous Node : on le simule avec un mock en mémoire, injecté
// en global avant de charger js/app.js (comme pour js/config.js dans api-url.test.js).

const test = require('node:test');
const assert = require('node:assert/strict');

function makeSessionStorageMock() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _dump: () => ({ ...store })
  };
}

function withFreshApp(fn) {
  global.sessionStorage = makeSessionStorageMock();
  delete require.cache[require.resolve('../js/app.js')];
  const mod = require('../js/app.js');
  try {
    return fn(mod, global.sessionStorage);
  } finally {
    delete global.sessionStorage;
    delete require.cache[require.resolve('../js/app.js')];
  }
}

test('getSessionId() génère un UUID v4 valide et le persiste', () => {
  withFreshApp(({ getSessionId }) => {
    const id1 = getSessionId();
    const id2 = getSessionId();
    assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(id1, id2, 'le même id doit être réutilisé tant que la session existe');
  });
});

test('DossierState.clear() supprime bien scan_session_id ET dossier_en_cours', () => {
  withFreshApp(({ getSessionId, DossierState }, storage) => {
    getSessionId();
    DossierState.save({ reponses: { ville: 'Lyon' } });

    assert.ok(storage.getItem('scan_session_id'), 'précondition : session_id doit exister avant clear()');
    assert.ok(storage.getItem('dossier_en_cours'), 'précondition : dossier_en_cours doit exister avant clear()');

    DossierState.clear();

    assert.equal(storage.getItem('scan_session_id'), null);
    assert.equal(storage.getItem('dossier_en_cours'), null);
  });
});

test('après clear(), un nouveau projet obtient un UUID de session différent du précédent', () => {
  withFreshApp(({ getSessionId, DossierState }) => {
    const firstSessionId = getSessionId();
    DossierState.clear(); // simule la fin d'un dossier envoyé avec succès
    const secondSessionId = getSessionId(); // "prochain projet"

    assert.notEqual(firstSessionId, secondSessionId,
      'un nouvel UUID doit être généré pour le projet suivant, jamais le même');
  });
});

test('rien ne doit encore avoir été effacé tant que clear() n\'a pas été appelé (pas de suppression anticipée)', () => {
  withFreshApp(({ getSessionId, DossierState }, storage) => {
    const sessionId = getSessionId();
    DossierState.save({ photos: [{ storage_path: 'x' }] });

    // Simule un échec serveur : on ne doit JAMAIS appeler clear() dans ce cas (c'est une
    // règle de dossier.html, vérifiée ici au niveau de l'état lui-même : tant que
    // clear() n'est pas explicitement appelé, rien ne disparaît).
    assert.equal(storage.getItem('scan_session_id'), sessionId);
    assert.ok(storage.getItem('dossier_en_cours'));
  });
});

test('régression statique : dossier.html n\'appelle DossierState.clear() que dans le bloc de succès (try, après apiPost)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'dossier.html'), 'utf8');

  const tryBlockMatch = html.match(/try\s*{([\s\S]*?)}\s*catch/);
  assert.ok(tryBlockMatch, 'un bloc try/catch doit encadrer l\'envoi du dossier');
  const tryBlock = tryBlockMatch[1];

  assert.match(tryBlock, /await apiPost\(['"`]\/api\/dossiers['"`]/, 'apiPost doit être appelé dans le try');
  assert.match(tryBlock, /DossierState\.clear\(\)/, 'clear() doit être dans le même try, donc après apiPost réussi');

  const clearIndex = tryBlock.indexOf('DossierState.clear()');
  const apiPostIndex = tryBlock.indexOf('await apiPost');
  assert.ok(clearIndex > apiPostIndex, 'clear() doit survenir APRÈS l\'appel apiPost, jamais avant');

  const catchBlockMatch = html.match(/}\s*catch\s*\(err\)\s*{([\s\S]*?)}\s*\);/);
  if (catchBlockMatch) {
    assert.doesNotMatch(catchBlockMatch[1], /DossierState\.clear\(\)/,
      'clear() ne doit jamais être appelé dans le bloc catch (échec serveur)');
  }
});
