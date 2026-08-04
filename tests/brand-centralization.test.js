// tests/brand-centralization.test.js
// Vérifie qu'aucun nom de marque n'est plus écrit en dur dans les pages HTML : toute
// mention doit passer par js/config.js + js/brand.js (attributs data-brand-*). Comme le
// nom définitif n'est pas encore choisi, on vérifie l'ABSENCE de dispersion plutôt que la
// présence d'un nom précis — le test doit rester vrai même après le choix du nom final,
// tant que la config reste la seule source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { APP_CONFIG } = require('../js/config.js');

const PAGE_DIRS_HTML = ['.', 'admin', 'mobile-web'];

function listFiles(dir, ext) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter(f => f.endsWith(ext)).map(f => path.join(dir, f));
}

test('js/config.js est bien la seule source du nom de marque (pas de doublon en dur ailleurs)', () => {
  const nomCourt = APP_CONFIG.brand.nomCourt;
  const failures = [];

  for (const dir of PAGE_DIRS_HTML) {
    for (const relFile of listFiles(dir, '.html')) {
      const html = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
      // On tolère le nom dans un attribut data-brand-* (fallback texte avant exécution
      // du JS) mais pas ailleurs dans le contenu visible hors de ces conventions.
      const withoutDataBrandFallbacks = html
        .replace(/<title[^>]*data-brand-title[^>]*>[^<]*<\/title>/g, '')
        .replace(/data-brand="nomCourt">[^<]*</g, '<')
        .replace(/data-brand-line="[^"]*">[^<]*</g, '<');

      if (withoutDataBrandFallbacks.includes(nomCourt)) {
        failures.push(relFile);
      }
    }
  }

  assert.deepEqual(failures, [],
    `Le nom de marque apparaît en dur (hors data-brand-*) dans :\n${failures.join('\n')}`);
});

test('manifest.json (racine et mobile-web) reflète bien APP_CONFIG.brand.nomCourt', () => {
  for (const relFile of ['manifest.json', 'mobile-web/manifest.json']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, relFile), 'utf8'));
    assert.equal(manifest.short_name, APP_CONFIG.brand.nomCourt,
      `${relFile} doit être régénéré via scripts/generate-manifest.js après tout changement de marque`);
    assert.ok(manifest.name.includes(APP_CONFIG.brand.nomCourt));
  }
});

test('capacitor.config.js lit appName depuis js/config.js plutôt que de le dupliquer', () => {
  delete require.cache[require.resolve('../capacitor.config.js')];
  const capConfig = require('../capacitor.config.js');
  assert.equal(capConfig.appName, APP_CONFIG.brand.nomCourt);
});

test('capacitor.config.js utilise un appId provisoire clairement documenté, pas un identifiant définitif', () => {
  const capConfig = require('../capacitor.config.js');
  assert.match(capConfig.appId, /provisional|example/i,
    "l'appId doit signaler explicitement son caractère provisoire avant publication sur les stores");
});

test('aucune configuration Capacitor ne référence "server.url" (interdit en production)', () => {
  const capacitorConfigContent = fs.readFileSync(path.join(ROOT, 'capacitor.config.js'), 'utf8');
  const configObjectPart = capacitorConfigContent.split('module.exports')[1] || '';
  assert.doesNotMatch(configObjectPart, /server\s*:\s*{\s*url/,
    'server.url ne doit pas être utilisé comme solution de production');
});

test('js/config.js garde le domaine personnalisé configurable (pas de valeur interdite/bloquante)', () => {
  // Le domaine peut être vide (pas encore choisi) ou toute chaîne — jamais une valeur
  // qui empêcherait techniquement de le renseigner plus tard.
  assert.equal(typeof APP_CONFIG.brand.domaine, 'string');
  assert.equal(typeof APP_CONFIG.api.baseUrlMobile, 'string');
  assert.ok(APP_CONFIG.api.baseUrlMobile.length > 0,
    'baseUrlMobile doit avoir une valeur fonctionnelle par défaut (Capacitor en a besoin pour fonctionner)');
});
