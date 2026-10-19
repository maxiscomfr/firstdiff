// Fonctionnement hors réseau : l'application est gardée en mémoire sur le téléphone.
const VERSION = 'firstdiff-v3';
const TUILES = 'firstdiff-tuiles';
const COQUILLE = [
  './',
  'css/app.css',
  'data/departements.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/logo.webp',
  'index.html',
  'js/app.js',
  'js/carto.js',
  'js/db.js',
  'js/geo.js',
  'js/importers.js',
  'js/store.js',
  'js/ui.js',
  'js/views/bienvenue.js',
  'js/views/carte.js',
  'js/views/classement.js',
  'js/views/clients.js',
  'js/views/fiche.js',
  'js/views/import.js',
  'js/views/reglages.js',
  'js/views/tournee.js',
  'manifest.webmanifest',
  'vendor/maplibre/maplibre-gl.css',
  'vendor/maplibre/maplibre-gl.js',
  'vendor/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2',
  'vendor/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2',
  'vendor/fonts/atkinson-hyperlegible-next-latin-ext-400-normal.woff2',
  'vendor/fonts/atkinson-hyperlegible-next-latin-ext-700-normal.woff2',
  'vendor/fonts/bricolage-grotesque-latin-ext-wght-normal.woff2',
  'vendor/fonts/bricolage-grotesque-latin-wght-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TUILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function limiter(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Fonds de carte : on garde les morceaux déjà vus pour les zones sans réseau.
  if (url.hostname === 'tiles.openfreemap.org') {
    e.respondWith(caches.open(TUILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok) { c.put(e.request, r.clone()); limiter(c, 3000); } return r; }
      catch { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Fichiers de l'application : réponse immédiate depuis le cache, mise à jour en arrière-plan.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || (e.request.mode === 'navigate' ? c.match('./') : new Response('', { status: 504 }));
  }));
});
