// tests/api-url.test.js
// Vérifie que resolveApiUrl() (js/config.js) produit bien :
//  - un chemin relatif sur le site web (même origine que l'API, comportement Vercel) ;
//  - une URL absolue vers le domaine configuré dans une app Capacitor native ;
//  - la bonne bascule dev/production.
//
// Sous Node, `window` n'existe pas nativement : chaque test simule l'environnement en
// définissant global.window avant d'appeler resolveApiUrl, puis nettoie après lui pour
// ne pas polluer les tests suivants (Node partage le même processus entre tests).

const test = require('node:test');
const assert = require('node:assert/strict');

function withWindow(windowShape, fn) {
  global.window = windowShape;
  try {
    // On vide le cache require pour que config.js relise `window` fraîchement à chaque
    // scénario plutôt que de réutiliser un module déjà chargé une fois pour toutes.
    delete require.cache[require.resolve('../js/config.js')];
    const { resolveApiUrl, APP_CONFIG } = require('../js/config.js');
    return fn(resolveApiUrl, APP_CONFIG);
  } finally {
    delete global.window;
    delete require.cache[require.resolve('../js/config.js')];
  }
}

test('resolveApiUrl — site web (pas de Capacitor) : chemin relatif inchangé', () => {
  withWindow({}, (resolveApiUrl) => {
    assert.equal(resolveApiUrl('/api/dossiers'), '/api/dossiers');
  });
});

test('resolveApiUrl — Capacitor présent mais isNativePlatform() false : reste relatif', () => {
  withWindow({ Capacitor: { isNativePlatform: () => false } }, (resolveApiUrl) => {
    assert.equal(resolveApiUrl('/api/dossiers'), '/api/dossiers');
  });
});

test('resolveApiUrl — app Capacitor native (production) : URL absolue de production', () => {
  withWindow({ Capacitor: { isNativePlatform: () => true } }, (resolveApiUrl, APP_CONFIG) => {
    const url = resolveApiUrl('/api/dossiers');
    assert.equal(url, `${APP_CONFIG.api.baseUrlMobile}/api/dossiers`);
    assert.match(url, /^https:\/\//, 'doit être une URL absolue en HTTPS');
  });
});

test('resolveApiUrl — app Capacitor native (development) : bascule vers baseUrlMobileDev', () => {
  withWindow({ Capacitor: { isNativePlatform: () => true } }, (resolveApiUrl, APP_CONFIG) => {
    const original = APP_CONFIG.api.environment;
    APP_CONFIG.api.environment = 'development';
    try {
      const url = resolveApiUrl('/api/dossiers');
      assert.equal(url, `${APP_CONFIG.api.baseUrlMobileDev}/api/dossiers`);
    } finally {
      APP_CONFIG.api.environment = original;
    }
  });
});

test('resolveApiUrl — ne double jamais un slash final de baseUrlMobile', () => {
  withWindow({ Capacitor: { isNativePlatform: () => true } }, (resolveApiUrl, APP_CONFIG) => {
    const original = APP_CONFIG.api.baseUrlMobile;
    APP_CONFIG.api.baseUrlMobile = 'https://exemple.test/';
    try {
      assert.equal(resolveApiUrl('/api/dossiers'), 'https://exemple.test/api/dossiers');
    } finally {
      APP_CONFIG.api.baseUrlMobile = original;
    }
  });
});

test('APP_CONFIG.api.baseUrlMobile est une valeur provisoire non bloquante (Vercel ou vide), pas un domaine imposé', () => {
  const { APP_CONFIG } = require('../js/config.js');
  // Le domaine personnalisé n'est jamais interdit : brand.domaine peut rester vide tant
  // qu'il n'est pas choisi, et baseUrlMobile pointe vers un déploiement Vercel par
  // défaut, sans empêcher de le remplacer par un domaine personnalisé plus tard.
  assert.equal(APP_CONFIG.brand.domaine, '', 'domaine vide tant que non choisi — configurable, jamais interdit');
  assert.match(APP_CONFIG.api.baseUrlMobile, /vercel\.app$|^$/, 'valeur provisoire Vercel ou vide, jamais un domaine imposé en dur');
});
