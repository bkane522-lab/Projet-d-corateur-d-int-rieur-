// tests/timezone.test.js
// Exécuté réellement avec `node --test` (voir résultats dans README-DEPLOIEMENT.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const { parisLocalToUTCISOString, formatParisDate, escapeHtml } = require('../js/app.js');

test('parisLocalToUTCISOString — heure d\'été (UTC+2)', () => {
  // 14h00 heure de Paris le 15 juillet 2026 = 12h00 UTC (heure d'été, CEST = UTC+2)
  const iso = parisLocalToUTCISOString('2026-07-15T14:00');
  assert.equal(iso, '2026-07-15T12:00:00.000Z');
});

test('parisLocalToUTCISOString — heure d\'hiver (UTC+1)', () => {
  // 14h00 heure de Paris le 15 janvier 2026 = 13h00 UTC (heure d'hiver, CET = UTC+1)
  const iso = parisLocalToUTCISOString('2026-01-15T14:00');
  assert.equal(iso, '2026-01-15T13:00:00.000Z');
});

test('parisLocalToUTCISOString — valeur vide retourne null', () => {
  assert.equal(parisLocalToUTCISOString(''), null);
  assert.equal(parisLocalToUTCISOString(null), null);
});

test('formatParisDate — formate en français, fuseau Europe/Paris', () => {
  const formatted = formatParisDate('2026-07-15T12:00:00.000Z');
  // 12h00 UTC en été = 14h00 à Paris
  assert.match(formatted, /14 ?h ?00|14:00/);
  assert.match(formatted, /juillet/i);
});

test('formatParisDate — chaîne vide retourne une chaîne vide', () => {
  assert.equal(formatParisDate(''), '');
  assert.equal(formatParisDate(null), '');
});

test('escapeHtml — neutralise les balises et guillemets', () => {
  const result = escapeHtml('<script>alert("x")</script>');
  assert.equal(result, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('escapeHtml — valeurs nulles/undefined ne plantent pas', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml — neutralise une tentative d\'injection dans un attribut', () => {
  const result = escapeHtml('"><img src=x onerror=alert(1)>');
  assert.ok(!result.includes('<img'));
  assert.ok(!result.includes('"'));
});
