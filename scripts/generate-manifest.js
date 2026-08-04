// scripts/generate-manifest.js
//
// manifest.json est un fichier statique (le navigateur/l'OS le lit directement, sans
// exécuter de JS) : il ne peut donc pas lire js/config.js à la volée comme les pages
// HTML. Ce script régénère manifest.json (racine + mobile-web) à partir de la même
// source de vérité — à relancer à chaque changement de nom de marque.
//
// Usage : node scripts/generate-manifest.js

const fs = require('node:fs');
const path = require('node:path');
const { APP_CONFIG } = require('../js/config.js');

const manifest = {
  name: `${APP_CONFIG.brand.nomCourt} — Dossier Projet`,
  short_name: APP_CONFIG.brand.nomCourt,
  description: "Documentez votre espace et transmettez votre projet à la décoratrice.",
  start_url: '/index.html',
  scope: '/',
  display: 'standalone',
  background_color: APP_CONFIG.brand.couleurs.ivoire,
  theme_color: APP_CONFIG.brand.couleurs.encre,
  orientation: 'portrait-primary',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};

const targets = [
  path.join(__dirname, '..', 'manifest.json'),
  path.join(__dirname, '..', 'mobile-web', 'manifest.json')
];

for (const target of targets) {
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Généré :', target);
}
