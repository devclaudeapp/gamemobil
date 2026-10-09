// Service worker du Fournil (portée : /fournil/) : le jeu reste jouable hors ligne.
// Son cache porte le préfixe « fournil-jeu- » ; il ne touche jamais aux caches des autres pages du dépôt (l'écran d'accueil a le sien).
const CACHE = 'fournil-jeu-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', '../vendor/three.min.js', '../icons/icon.svg', '../icons/icon-180.png', '../icons/icon-192.png', '../icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('fournil-jeu-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { // la page du jeu : le réseau d'abord, la copie en cache hors ligne
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); } return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === self.location.origin || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
  }
});
