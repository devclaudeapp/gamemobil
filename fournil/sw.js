// Service worker du Fournil (portée : /fournil/) : le jeu reste jouable hors ligne. L'écran d'accueil l'enregistre aussi, pour qu'il marche sans réseau même jamais ouvert.
// Son cache porte le préfixe « fournil-jeu- » ; il ne touche jamais aux caches des autres pages du dépôt (l'écran d'accueil a le sien).
// Le classement en ligne : config.js (adresse et clé publique) passe par le réseau d'abord ; les appels à Supabase ne sont jamais interceptés ni mis en cache.
const CACHE = 'fournil-jeu-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './config.js', '../vendor/three.min.js', '../icons/icon.svg', '../icons/icon-180.png', '../icons/icon-192.png', '../icons/icon-512.png', '../icons/icon-maskable-512.png'];
const enCache = (req, res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
// à l'installation, contourner le cache HTTP (GitHub Pages le garde 10 min) pour ne pas figer une vieille copie
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('fournil-jeu-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname)) return; // le classement : toujours le réseau, jamais de copie
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { // la page du jeu : le réseau d'abord, la copie en cache hors ligne
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); } return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  const local = url.origin === self.location.origin;
  if (local && (url.pathname.endsWith('.webmanifest') || url.pathname === new URL('./config.js', self.location).pathname)) { e.respondWith(fetch(req).then((res) => enCache(req, res)).catch(() => caches.match(req))); return; } // le manifeste et la configuration : le réseau d'abord
  if (local || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => enCache(req, res))));
});
