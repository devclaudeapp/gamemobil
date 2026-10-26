// Service worker du Fournil (portée : /fournil/) : le jeu reste jouable hors ligne. L'écran d'accueil l'enregistre aussi, pour qu'il marche sans réseau même jamais ouvert.
// Son cache porte le préfixe « fournil-jeu- » ; il ne touche jamais aux caches des autres pages du dépôt (l'écran d'accueil a le sien).
// Le classement en ligne : config.js (adresse et clé publique) passe par le réseau d'abord ; les appels à Supabase ne sont jamais interceptés ni mis en cache,
// pas plus que les GIF du chat (GIPHY : externes, ils ne passeraient déjà pas par le cache, qui ne prend que ce site et les polices ; on le dit quand même).
// L'horloge de confiance (src/horloge.js) lit l'heure du serveur dans l'en-tête Date d'une requête « ?heure=… » : elle va toujours au réseau, jamais au cache.
const CACHE = 'fournil-jeu-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './config.js', '../vendor/three.min.js', '../icons/icon.svg', '../icons/icon-180.png', '../icons/icon-192.png', '../icons/icon-512.png', '../icons/icon-maskable-512.png'];
const enCache = (req, res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
// à l'installation, contourner le cache HTTP (GitHub Pages le garde 10 min) pour ne pas figer une vieille copie
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('fournil-jeu-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname)) return; // le classement : toujours le réseau, jamais de copie
  if (/(^|\.)giphy\.com$/.test(url.hostname)) return; // les GIF du chat (api.giphy.com, media.giphy.com) : toujours le réseau, jamais de copie
  if (url.origin === self.location.origin && url.searchParams.has('heure')) return; // l'heure du serveur : toujours le réseau (une copie donnerait une vieille heure)
  if (url.origin === self.location.origin && url.pathname === new URL('./version.json', self.location).pathname) return; // la version en ligne : toujours le réseau (src/ui.js, verifierVersion)
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { // la page du jeu : le réseau d'abord, la copie en cache hors ligne
    // sans le cache HTTP (GitHub Pages garde la page 10 min) : une mise à jour demandée arrive tout de suite ; la requête garde le mode de redirection de la navigation
    e.respondWith(Promise.resolve().then(() => fetch(new Request(req, { cache: 'no-cache' }))).catch(() => fetch(req)).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); } return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  const local = url.origin === self.location.origin;
  if (local && /[/]media[/][^/]+[.]mp4$/.test(url.pathname)) { e.respondWith(video(req, url)); return; } // la vidéo de l'annonce : en cache entière, servie par morceaux
  if (local && (url.pathname.endsWith('.webmanifest') || url.pathname === new URL('./config.js', self.location).pathname)) { e.respondWith(fetch(req).then((res) => enCache(req, res)).catch(() => caches.match(req))); return; } // le manifeste et la configuration : le réseau d'abord
  if (local || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => enCache(req, res))));
});
// La vidéo de présentation d'un événement (fournil/media/*.mp4, l'annonce de la Maison hantée) : mise en cache ENTIÈRE à sa première lecture
// (une requête sans Range, sous l'adresse seule), puis servie depuis la copie. Les lecteurs vidéo (Safari, toujours) demandent des morceaux
// (Range: bytes=…) : on les découpe dans la copie (206 et Content-Range), sinon iPhone refuse de la lire. Hors ligne et jamais vue : une erreur
// réseau, la feuille garde l'affiche (fournil/media/*.jpg, mise en cache comme toute image du site).
function morceau(req, res) {
  const r = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!r || (!r[1] && !r[2])) return res;
  return res.arrayBuffer().then((buf) => {
    const n = buf.byteLength, debut = r[1] ? +r[1] : Math.max(0, n - +r[2]), fin = r[1] && r[2] ? Math.min(+r[2], n - 1) : n - 1;
    if (debut >= n || debut > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${n}` } });
    return new Response(buf.slice(debut, fin + 1), { status: 206, statusText: 'Partial Content', headers: { 'Content-Type': res.headers.get('Content-Type') || 'video/mp4', 'Content-Range': `bytes ${debut}-${fin}/${n}`, 'Content-Length': String(fin - debut + 1), 'Accept-Ranges': 'bytes' } });
  });
}
function video(req, url) {
  const cle = url.origin + url.pathname;
  return caches.match(cle).then((hit) => hit || fetch(cle).then((res) => { if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(cle, copy)).catch(() => {}); } return res; }))
    .then((res) => (res.status === 200 ? morceau(req, res) : res)).catch(() => Response.error());
}
// Les notifications (Web Push, version 6 du classement) : la fonction « notifier » de Supabase envoie { titre, texte, url, type } chiffré pour cet
// abonnement ; on l'affiche avec l'icône du jeu, une seule à la fois par type (tag). Toucher la notification ramène la fenêtre du jeu au
// premier plan, ou l'ouvre. Les textes viennent de notre serveur, mais restent bornés ; l'adresse n'ouvre jamais qu'une page de ce site.
const ICONE = new URL('../icons/icon-192.png', self.location).href;
const ICI = () => new URL('./', self.registration.scope).href;
function adresse(u) { try { const x = new URL(typeof u === 'string' && u ? u : './', self.registration.scope); return x.origin === self.location.origin ? x.href : ICI(); } catch (e) { return ICI(); } }
function afficherPush(e) { // (une fonction nommée : les tests l'appellent dans le service worker, test/fournil-notifs.cjs)
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { texte: e.data.text() }; } catch (y) { d = {}; } }
  if (!d || typeof d !== 'object') d = {};
  const titre = String(d.titre || 'Le Fournil').slice(0, 80), texte = String(d.texte || '').slice(0, 240), type = /^[a-z]{1,20}$/.test(String(d.type || '')) ? d.type : 'fournil';
  e.waitUntil(self.registration.showNotification(titre, { body: texte, icon: ICONE, badge: ICONE, tag: 'fournil-' + type, renotify: true, data: { url: adresse(d.url), type } }));
}
function ouvrirJeu(e) {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || ICI(), racine = new URL('./', self.registration.scope).pathname;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
    const w = liste.find((c) => { try { return new URL(c.url).pathname.startsWith(racine); } catch (x) { return false; } });
    if (w && 'focus' in w) return w.focus();
    return self.clients.openWindow ? self.clients.openWindow(cible) : null;
  }));
}
self.addEventListener('push', afficherPush);
self.addEventListener('notificationclick', ouvrirJeu);
