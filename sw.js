// sw.js
// Service worker minimal : rend l'app installable et permet un chargement rapide de
// l'app shell (pages statiques + CSS/JS). N'intercepte volontairement PAS les appels
// /api/* : les données de dossiers doivent toujours venir du réseau, jamais du cache.

const CACHE_NAME = 'atelier-de-plan-v1';
const APP_SHELL = [
  '/index.html',
  '/scanner.html',
  '/photos-mesures.html',
  '/questionnaire.html',
  '/dossier.html',
  '/rdv.html',
  '/suivi.html',
  '/css/style.css',
  '/js/app.js',
  '/js/scan-detect.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jamais de cache pour les appels API : toujours des données fraîches.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
