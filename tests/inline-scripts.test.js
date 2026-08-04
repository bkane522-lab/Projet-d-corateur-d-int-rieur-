// tests/inline-scripts.test.js
//
// Les tests précédents ne vérifiaient que les fichiers .js autonomes. Un bug réel
// (try/await orphelin dans admin/dossier.html) est passé inaperçu parce qu'il vivait
// dans un <script> inline d'un fichier .html, jamais analysé syntaxiquement. Ce test
// comble ce trou : il extrait CHAQUE bloc <script> sans src= de CHAQUE fichier HTML du
// projet (racine, admin/, mobile-web/) et vérifie sa syntaxe avec le moteur V8 de Node
// (new vm.Script), sans l'exécuter — seulement une vérification syntaxique, comme
// `node --check` pour un fichier .js classique.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['.', 'admin', 'mobile-web'];

function listHtmlFiles(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(dir, f));
}

/** Extrait le contenu des balises <script> qui n'ont PAS d'attribut src (donc du code
 *  inline à vérifier), en ignorant les <script type="application/json"> etc. */
function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // script externe, rien à vérifier ici
    if (/type\s*=\s*["'](?!text\/javascript)[^"']*["']/.test(attrs)) continue; // ex: application/json
    const code = match[2].trim();
    if (code) scripts.push(code);
  }
  return scripts;
}

test('tous les scripts inline des fichiers HTML sont syntaxiquement valides', () => {
  const failures = [];
  let totalChecked = 0;

  for (const dir of SCAN_DIRS) {
    for (const relFile of listHtmlFiles(dir)) {
      const html = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
      const scripts = extractInlineScripts(html);

      scripts.forEach((code, index) => {
        totalChecked++;
        try {
          // new vm.Script ne fait QUE parser/compiler, jamais exécuter.
          new vm.Script(code, { filename: `${relFile}#inline-${index}` });
        } catch (err) {
          failures.push(`${relFile} (bloc <script> #${index}) : ${err.message}`);
        }
      });
    }
  }

  assert.ok(totalChecked > 0, 'Aucun script inline trouvé — le test lui-même serait alors inutile');
  assert.deepEqual(failures, [], `Scripts inline invalides :\n${failures.join('\n')}`);
});

test('régression : admin/dossier.html contient bien une fonction loadDossier() correctement déclarée', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin/dossier.html'), 'utf8');
  assert.match(html, /async function loadDossier\s*\(\)\s*{/,
    'loadDossier doit être déclarée comme fonction async, pas un bloc try/await orphelin');
});
