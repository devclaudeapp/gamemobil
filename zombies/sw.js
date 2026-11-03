// Service worker de Dernier Rempart (portée : /zombies/) : le jeu s'ouvre et se joue hors ligne.
// Caches au préfixe « zombies-jeu- » : il ne touche jamais aux caches de l'accueil ni des autres jeux.
// La page et le manifeste passent par le réseau d'abord (une mise à jour arrive tout de suite, et hors ligne la copie en cache sert) ;
// le reste (Three.js et ses outils, les modèles 3D, les icônes, les polices) est servi tout de suite depuis le cache et rafraîchi en arrière-plan.
// Changer un fichier de SHELL : l'ajouter ici et passer CACHE à la version suivante.
const CACHE = 'zombies-jeu-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './config.js', '../vendor/three.min.js', '../vendor/fournil-hd.min.js', '../vendor/supabase.min.js', '../icons/zombies.svg', '../icons/zombies-180.png', '../icons/zombies-192.png', '../icons/zombies-512.png'];
// les modèles 3D (Kenney, KayKit) : mis en cache à l'installation, sans bloquer si l'un manque (le jeu garde alors ses formes faites main)
const OPTIONNELS = [...['zombie', 'survivant', 'tourelle', 'mortier', 'voiture-sedan', 'voiture-police', 'voiture-suv', 'voiture-taxi', 'voiture-van', 'voiture-hatchback-sports'].map((n) => `./modeles/kenney/${n}.glb`),
  ...['golem', 'golem-glace', 'loup-garou', 'vampire', 'anims-large-marche', 'anims-large-general', 'anims-large-coups', 'anims-medium-marche', 'anims-medium-general', 'anims-medium-coups'].map((n) => `./modeles/kaykit/${n}.glb`)];
const enCache = (req, res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))
    .then(() => Promise.all(OPTIONNELS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('zombies-jeu-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
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
      return reseau;
    }));
  }
});
