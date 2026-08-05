// sw.js
// Service worker minimal : rend l'app installable et permet un chargement rapide de
// l'app shell (pages statiques + CSS/JS). N'intercepte volontairement PAS les appels
// /api/* : les données de dossiers doivent toujours venir du réseau, jamais du cache.

// CORRECTIF (bug mobile Android — upload photo/navigation bloqués) :
// L'ancien nom de cache était une chaîne statique ('atelier-de-plan-v1'), jamais
// modifiée entre déploiements. Un navigateur ne détecte une mise à jour du service
// worker que si CE FICHIER change — pas si js/app.js ou photos-mesures.html changent.
// Un téléphone ayant déjà visité le site (surtout via "Ajouter à l'écran d'accueil")
// pouvait donc rester bloqué indéfiniment sur un ancien bundle en cache, même après un
// nouveau déploiement corrigé. SW_VERSION doit être incrémenté à CHAQUE déploiement qui
// touche l'app shell, pour forcer la détection de mise à jour.
const SW_VERSION = 'v2-fix-photos-mobile';
const CACHE_NAME = `atelier-de-plan-${SW_VERSION}`;
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

  // Réseau d'abord pour les pages HTML (navigations) : évite de servir une page
  // obsolète alors qu'une connexion est disponible. Le cache ne sert plus que de
  // secours hors-ligne. Les autres ressources (CSS/JS/images) restent cache-first
  // pour la vitesse, le cache étant de toute façon invalidé à chaque changement de
  // SW_VERSION ci-dessus.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
