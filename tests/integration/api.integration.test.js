// tests/integration/api.integration.test.js
//
// ⚠️ CES TESTS N'ONT PAS ÉTÉ EXÉCUTÉS dans l'environnement qui les a écrits : ils
// appellent une API déployée réelle (Vercel + Supabase), qui nécessite un accès réseau
// et un projet configuré — indisponibles ici. Ils sont prêts à être lancés après
// déploiement, avec les variables d'environnement suivantes :
//
//   TEST_BASE_URL              ex: https://votre-app.vercel.app
//   TEST_ADMIN_EMAIL            un compte listé dans la table `admins`
//   TEST_ADMIN_PASSWORD
//   TEST_NON_ADMIN_EMAIL          un compte Supabase Auth valide MAIS absent de `admins`
//   TEST_NON_ADMIN_PASSWORD
//
// Lancer avec : TEST_BASE_URL=... node --test tests/integration/*.test.js
// Sans ces variables, chaque test s'auto-ignore (test.skip) plutôt que d'échouer —
// pour ne pas polluer la suite de tests unitaires réels avec de faux échecs.

const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_BASE_URL;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const NON_ADMIN_EMAIL = process.env.TEST_NON_ADMIN_EMAIL;
const NON_ADMIN_PASSWORD = process.env.TEST_NON_ADMIN_PASSWORD;

const canRun = Boolean(BASE_URL);
const canRunAuth = Boolean(BASE_URL && ADMIN_EMAIL && ADMIN_PASSWORD);
const canRunNonAdmin = Boolean(BASE_URL && NON_ADMIN_EMAIL && NON_ADMIN_PASSWORD);

async function getSupabaseConfig() {
  const res = await fetch(`${BASE_URL}/api/public-config`);
  return res.json();
}

async function signIn(email, password) {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

test('API admin refuse une requête sans token', { skip: !canRun }, async () => {
  const res = await fetch(`${BASE_URL}/api/dossiers`);
  assert.equal(res.status, 401);
});

test('Connexion admin valide + accès au listing', { skip: !canRunAuth }, async () => {
  const session = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.ok(session.access_token, 'La connexion doit renvoyer un access_token');

  const res = await fetch(`${BASE_URL}/api/dossiers`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.dossiers));
});

test('Utilisateur Auth valide mais NON listé dans `admins` est refusé', { skip: !canRunNonAdmin }, async () => {
  const session = await signIn(NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD);
  assert.ok(session.access_token, 'Le compte doit être un compte Supabase Auth valide');

  const res = await fetch(`${BASE_URL}/api/dossiers`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  assert.equal(res.status, 401, 'Un JWT valide ne suffit pas sans être dans la table admins');
});

test('Création de dossier avec données valides → code_acces retourné existe réellement', { skip: !canRun }, async () => {
  const res = await fetch(`${BASE_URL}/api/dossiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom_prospect: 'Test Intégration',
      email_prospect: `test-${Date.now()}@example.com`,
      type_logement: 'Appartement',
      ville: 'Lyon'
    })
  });
  assert.equal(res.status, 200);
  const { code_acces } = await res.json();
  assert.match(code_acces, /^ADP-[A-Z0-9]{5}$/);

  // Le code retourné doit correspondre à un vrai dossier consultable ensuite.
  const suiviRes = await fetch(`${BASE_URL}/api/dossiers?code=${code_acces}`);
  assert.equal(suiviRes.status, 200);
  const suiviData = await suiviRes.json();
  assert.equal(suiviData.statut, 'Nouveau');
});

test('Création de dossier avec email invalide → 400, pas de faux code', { skip: !canRun }, async () => {
  const res = await fetch(`${BASE_URL}/api/dossiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom_prospect: 'Test', email_prospect: 'pas-un-email' })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code_acces, undefined);
});

test('Soumission avec honeypot rempli → 400 explicite, jamais un faux succès', { skip: !canRun }, async () => {
  const res = await fetch(`${BASE_URL}/api/dossiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom_prospect: 'Bot Test',
      email_prospect: 'bot@example.com',
      website_confirmation: 'http://spam.example'
    })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code_acces, undefined);
});

test('Upload refusé si fileSize dépasse la limite (photo > 8 Mo)', { skip: !canRun }, async () => {
  const res = await fetch(`${BASE_URL}/api/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSize: 9 * 1024 * 1024,
      kind: 'photo'
    })
  });
  assert.equal(res.status, 400);
});

test('Upload refusé si le format MIME n\'est pas autorisé', { skip: !canRun }, async () => {
  const res = await fetch(`${BASE_URL}/api/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      filename: 'virus.exe',
      contentType: 'application/x-msdownload',
      fileSize: 1000,
      kind: 'document'
    })
  });
  assert.equal(res.status, 400);
});

test('Rendez-vous : un créneau à 14h Paris est bien stocké/restitué en 14h Paris', { skip: !canRunAuth }, async () => {
  // Nécessite un dossier existant avec un rendez-vous — scénario à adapter avec un
  // dossier de test réel une fois le compte admin et un code d'accès disponibles.
  // Laissé en préparation : la logique de conversion est déjà couverte unitairement
  // dans tests/timezone.test.js (exécuté avec succès, voir README-DEPLOIEMENT.md).
});
