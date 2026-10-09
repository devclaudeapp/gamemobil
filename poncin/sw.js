// Service worker d'Opération Poncin (portée : /poncin/) : le jeu s'ouvre hors ligne en solo.
// Caches au préfixe « poncin-jeu- » : il ne touche jamais aux caches de l'accueil ni du Fournil.
// La page, la configuration et le manifeste passent par le réseau d'abord ; le reste (Three.js, supabase-js, la carte, les icônes) est servi
// tout de suite depuis le cache et rafraîchi en arrière-plan : une mise à jour arrive au lancement suivant.
const CACHE = 'poncin-jeu-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './config.js', '../vendor/three.min.js', '../icons/poncin.svg', '../icons/poncin-192.png', '../icons/poncin-512.png'];
const OPTIONNELS = ['./carte/poncin.json', './carte/sol-1024.jpg', '../vendor/supabase.min.js']; // absents au début : leur échec n'empêche pas l'installation
const enCache = (req, res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))
    .then(() => Promise.all(OPTIONNELS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('poncin-jeu-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); } return res; }).catch(() => caches.match('./index.html'))); return; }
  const local = url.origin === self.location.origin;
  if (local && /(\.webmanifest|\/config\.js)$/.test(url.pathname)) { e.respondWith(fetch(req).then((res) => enCache(req, res)).catch(() => caches.match(req))); return; }
  if (local || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => { const reseau = fetch(req).then((res) => enCache(req, res)); if (hit) { reseau.catch(() => {}); return hit; } return reseau; }));
  }
});
