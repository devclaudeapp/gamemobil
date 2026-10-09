// Service worker de l'écran d'accueil (portée : la racine du dépôt) : l'accueil s'ouvre hors ligne.
// Il ne s'occupe que de l'accueil : les jeux ont chacun leur service worker dans leur dossier (fournil/sw.js), et leurs caches ne sont jamais effacés ici.
// Il remplace l'ancien service worker du Fournil, qui vivait à la racine : ses caches « fournil-v1 » à « fournil-v13 » sont retirés.
const CACHE = 'accueil-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/accueil.svg', './icons/accueil-180.png', './icons/accueil-192.png', './icons/accueil-512.png', './icons/icon.svg'];
const base = new URL('./', self.location).pathname; // le chemin de l'accueil (/gamemobil/ sur GitHub Pages)
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith('accueil-') && k !== CACHE) || /^fournil-v\d+$/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { // seulement l'accueil lui-même ; la navigation vers un jeu passe sans détour (le jeu a son propre service worker)
    if (url.origin !== self.location.origin || (url.pathname !== base && url.pathname !== base + 'index.html')) return;
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); } return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  const local = url.origin === self.location.origin && SHELL.some((s) => new URL(s, self.location).href === url.href);
  if (local || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
  }
});
