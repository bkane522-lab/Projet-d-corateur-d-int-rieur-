// tests/validate.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDossierPayload, validateEmail, passesHoneypot } = require('../lib/validate.js');

test('validateDossierPayload — payload valide accepté', () => {
  const { ok, data } = validateDossierPayload({
    nom_prospect: 'Marie Dupont',
    email_prospect: 'marie@example.com',
    telephone_prospect: '0612345678',
    type_logement: 'Appartement',
    ville: 'Lyon',
    surface_m2: '62'
  });
  assert.equal(ok, true);
  assert.equal(data.email_prospect, 'marie@example.com');
  assert.equal(data.surface_m2, 62);
});

test('validateDossierPayload — email invalide refusé', () => {
  const { ok, errors } = validateDossierPayload({
    nom_prospect: 'Marie Dupont',
    email_prospect: 'pas-un-email',
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('Email')));
});

test('validateDossierPayload — nom manquant refusé', () => {
  const { ok, errors } = validateDossierPayload({
    email_prospect: 'marie@example.com'
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('Nom')));
});

test('validateDossierPayload — enum non reconnue devient null plutôt qu\'acceptée telle quelle', () => {
  const { data } = validateDossierPayload({
    nom_prospect: 'Test',
    email_prospect: 'test@example.com',
    type_logement: 'Château médiéval' // valeur arbitraire non prévue
  });
  assert.equal(data.type_logement, null);
});

test('validateDossierPayload — surface hors bornes refusée (null)', () => {
  const { data } = validateDossierPayload({
    nom_prospect: 'Test',
    email_prospect: 'test@example.com',
    surface_m2: '99999'
  });
  assert.equal(data.surface_m2, null);
});

test('validateEmail — formats valides et invalides', () => {
  assert.equal(validateEmail('a@b.co'), 'a@b.co');
  assert.equal(validateEmail('MAJUSCULE@Example.COM'), 'majuscule@example.com');
  assert.equal(validateEmail('pas-un-email'), null);
  assert.equal(validateEmail(''), null);
  assert.equal(validateEmail('a@b'), null);
});

test('passesHoneypot — champ vide passe, champ rempli bloque', () => {
  assert.equal(passesHoneypot({}), true);
  assert.equal(passesHoneypot({ website_confirmation: '' }), true);
  assert.equal(passesHoneypot({ website_confirmation: 'http://spam.example' }), false);
});

test('passesHoneypot — un envoi rapide légitime (autofill) n\'est plus bloqué', () => {
  // Avant correction, un délai de remplissage trop court bloquait un humain utilisant
  // l'autofill. Ce n'est plus le cas : seul le honeypot compte désormais.
  assert.equal(passesHoneypot({ form_rendered_at: Date.now() - 10 }), true);
});
