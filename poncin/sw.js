// Service worker d'Opération Poncin (portée : /poncin/) : le jeu s'ouvre hors ligne en solo.
// Caches au préfixe « poncin-jeu- » : il ne touche jamais aux caches de l'accueil ni du Fournil.
// La page, la configuration et le manifeste passent par le réseau d'abord ; le reste (Three.js, supabase-js, la carte, les icônes) est servi
// tout de suite depuis le cache et rafraîchi en arrière-plan : une mise à jour arrive au lancement suivant. La carte est demandée avec son
// empreinte (carte/poncin.json?v=…, posée par build.js) : une nouvelle carte a une nouvelle adresse, aucun cache ne sert celle d'hier (sinon
// pas de voûtes au premier lancement, et en ligne l'hôte et ses copains joueraient sur deux cartes) ; on n'en garde qu'une version, et hors
// ligne la carte en cache sert quelle que soit son empreinte.
const CACHE = 'poncin-jeu-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './config.js', '../vendor/three.min.js', '../icons/poncin.svg', '../icons/poncin-192.png', '../icons/poncin-512.png'];
const OPTIONNELS = ['./carte/poncin.json', './carte/sol-1024.jpg', './carte/sol-arene-2048.jpg', '../vendor/supabase.min.js']; // absents au début : leur échec n'empêche pas l'installation
const enCache = (req, res) => {
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone(), u = new URL(req.url);
    caches.open(CACHE).then((c) => (u.search && u.origin === self.location.origin ? c.keys().then((ks) => Promise.all(ks.filter((k) => { const v = new URL(k.url); return v.origin === u.origin && v.pathname === u.pathname && v.search && v.search !== u.search; }).map((k) => c.delete(k)))) : null).then(() => c.put(req, copy))); // une seule version par adresse versionnée
  }
  return res;
};
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
    e.respondWith(caches.match(req).then((hit) => {
      const reseau = fetch(req).then((res) => enCache(req, res)); if (hit) { reseau.catch(() => {}); return hit; }
      return reseau.catch((err) => (local ? caches.match(req, { ignoreSearch: true }) : Promise.resolve(null)).then((h) => h || Promise.reject(err))); // hors ligne : la carte préchargée (sans ?v=) ou une autre version
    }));
  }
});
