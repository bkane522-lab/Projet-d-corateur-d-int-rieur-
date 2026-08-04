// tests/links.test.js
// Test de non-régression pour le bug corrigé au point 1 (scanner.html → passeport.html
// inexistant). Scanne tous les fichiers HTML du projet et vérifie que chaque référence
// vers un autre fichier .html pointe vers un fichier qui existe réellement sur disque.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['.', 'admin', 'mobile-web'];

function listHtmlFiles(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(dir, f));
}

function extractHtmlRefs(content) {
  const refs = new Set();
  const hrefMatches = content.matchAll(/href=["']([a-zA-Z0-9_./-]+\.html)[^"']*["']/g);
  for (const m of hrefMatches) refs.add(m[1]);
  const locationMatches = content.matchAll(/location\.href\s*=\s*[`'"]([a-zA-Z0-9_./-]+\.html)/g);
  for (const m of locationMatches) refs.add(m[1]);
  return [...refs];
}

test('aucun lien HTML ne pointe vers un fichier inexistant (racine + admin/ + mobile-web/)', () => {
  const failures = [];

  for (const dir of SCAN_DIRS) {
    for (const relFile of listHtmlFiles(dir)) {
      const content = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
      const refs = extractHtmlRefs(content);
      for (const ref of refs) {
        const resolved = path.normalize(path.join(path.dirname(path.join(ROOT, relFile)), ref));
        if (!fs.existsSync(resolved)) {
          failures.push(`${relFile} référence "${ref}" → introuvable (${resolved})`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `Liens cassés détectés :\n${failures.join('\n')}`);
});

test('scanner.html ne référence plus "passeport.html" (régression du bug corrigé)', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scanner.html'), 'utf8');
  assert.ok(!content.includes('passeport.html'));
});
