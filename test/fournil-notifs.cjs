// Les notifications du Fournil (Web Push, classement v6), dans la vraie page (fournil/ servie en local, service worker compris), sur un
// téléphone en portrait. Supabase est SIMULÉ (page.route, comme test/fournil-classement.cjs) ; PushManager aussi (il faudrait un vrai
// service de push) : subscribe rend un faux abonnement, dont on vérifie qu'il part tel quel à fournil_abonner. La permission est accordée
// par Playwright. La clé publique VAPID de ce test est faite de hasard (65 octets, aucune clé privée nulle part).
// Parcours : le bloc Notifications des Réglages (pas rejoint, puis « Me prévenir »), l'abonnement envoyé (clé publique, préférences), un cas
// décoché, « M'envoyer un essai », planifier en quittant le jeu (visibilitychange, pagehide) et l'annuler au retour, le service worker qui
// affiche un push (titre, texte, icône, tag) et ouvre ou ramène le jeu au toucher, se désabonner, la permission refusée, l'iPhone hors de
// l'écran d'accueil.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-notifs.cjs   (captures dans test/shots/notifs/ ; COPAINS_CAPTURES : un autre dossier en plus)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_NOTIFS || 9686, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const VAPID = Buffer.concat([Buffer.from([4]), crypto.randomBytes(64)]).toString('base64url'); // le format seulement : 65 octets non compressés
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let avecCle = true;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/fournil/config.js') { // la configuration du jeu, avec la clé publique des notifications (comme le joueur l'ajoutera)
    const vraie = fs.readFileSync(path.join(root, 'fournil', 'config.js'), 'utf8').replace(/,\s*giphy: '[^']*'/, '').replace(/,\s*\/\/[^\n]*\n\s*vapid: '[^']*'/, ''); // sans la vraie clé publique : le test pose la sienne (ou aucune)
    res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(avecCle ? vraie.replace(/bearer: true \}/, `bearer: true, vapid: '${VAPID}' }`) : vraie); return;
  }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'notifs'); fs.mkdirSync(out, { recursive: true });
const cap = process.env.COPAINS_CAPTURES || ''; if (cap) fs.mkdirSync(cap, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };

// ─── le faux Supabase : les fonctions v6 qui servent ici ───
const faux = { appels: [], joueurs: new Map() };
const RPC = {
  fournil_publier: (c) => { faux.joueurs.set(c.p_id, { pseudo: c.p_pseudo, jeton: c.p_jeton }); return { ok: true, erreur: null, version: 6, rang_semaine: 1, rang_total: 1, joueurs: 1, joueurs_semaine: 1, semaine: '2026-10-12', photo_maj: new Date().toISOString() }; },
  fournil_classement: () => ({ version: 6, semaine: '2026-10-12', joueurs: 1, lignes: [], moi: null }),
  fournil_recompenses: () => ({ ok: true, erreur: null, podiums: [], derniere: null, pourboires: [], objectif: null }),
  fournil_objectif: () => ({ semaine: '2026-10-12', but: 300, total: 12, joueurs: 1, reussi: false, pourcent: 4 }),
  fournil_vu: () => ({ ok: true }),
  fournil_heure: () => ({ ms: Date.now() }),
  fournil_abonner: (c) => (faux.joueurs.has(c.p_id) && c.p_sub && /^https:\/\//.test(c.p_sub.endpoint) ? { ok: true, erreur: null, prefs: c.p_prefs, appareils: 1 } : { ok: false, erreur: 'jeton' }),
  fournil_desabonner: () => ({ ok: true, erreur: null }),
  fournil_planifier: (c) => ({ ok: true, erreur: null, planifiee: !!c.p_pleine_a }),
  fournil_notif_essai: () => ({ ok: true, erreur: null }),
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1]; let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps, t: Date.now() });
  if (!RPC[nom]) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps || {})) });
}
const appels = (nom) => faux.appels.filter((a) => a.nom === nom);
// PushManager simulé dans la page : subscribe / getSubscription / unsubscribe, et ce qu'on lui a demandé
const fauxPush = () => {
  const etat = { cur: null }; window.__push = { appels: [], options: null };
  if (!window.PushManager) return;
  const sub = (cle) => ({ endpoint: 'https://push.exemple.test/abonnement/' + Math.random().toString(36).slice(2), options: { applicationServerKey: cle.buffer.slice(0) },
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B' + 'p'.repeat(86), auth: 'a'.repeat(22) } }; }, unsubscribe: async () => { etat.cur = null; window.__push.appels.push('unsubscribe'); return true; } });
  PushManager.prototype.subscribe = async function (o) { const cle = new Uint8Array(o.applicationServerKey); window.__push.appels.push('subscribe'); window.__push.options = { userVisibleOnly: o.userVisibleOnly, cle: Array.from(cle) }; etat.cur = sub(cle); return etat.cur; };
  PushManager.prototype.getSubscription = async function () { return etat.cur; };
};

(async () => {
  // Chromium complet (nouveau mode sans fenêtre) : le « headless shell » refuse toujours les notifications ; installé avec « playwright install chromium »
  let browser; try { browser = await chromium.launch({ channel: 'chromium' }); } catch (e) { browser = await chromium.launch(); }
  const errors = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_FAILED|404|ERR_CERT/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  const nouveau = async (o) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(o || {}) });
    await ctx.addInitScript(() => { window.__sansQuartier = true; });
    await ctx.route(SUPA + '/rest/v1/rpc/*', gerer);
    return ctx;
  };
  const blocNotifs = (p) => p.evaluate(() => { const t = [...document.querySelectorAll('#page-reglages .titre-section')].find((h) => /Notifications/.test(h.textContent)); if (!t) return null; const c = t.nextElementSibling, sw = c.querySelector('[data-a="notifs"] [role="switch"]'); return { txt: c.innerText.replace(/\s+/g, ' '), on: sw ? sw.getAttribute('aria-checked') : null, cas: [...c.querySelectorAll('.reglage.cas')].map((x) => x.querySelector('b').textContent + ':' + x.querySelector('[role="switch"]').getAttribute('aria-checked')), essai: !!c.querySelector('[data-a="notif-essai"]') }; });
  const reglages = async (p) => { await p.evaluate(() => { window.__fournil.page('reglages'); window.__fournil.tiroir('ouvert'); }); await sleep(350); await p.evaluate(() => { const t = [...document.querySelectorAll('#page-reglages .titre-section')].find((h) => /Notifications/.test(h.textContent)); if (t) t.scrollIntoView({ block: 'start' }); }); await sleep(200); };

  // ─── l'appareil qui sait : la permission accordée, PushManager (simulé), la clé publique dans config.js ───
  const ctx = await nouveau({ serviceWorkers: 'allow' });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  await ctx.addInitScript(fauxPush);
  const page = await ctx.newPage(); suivre(page);
  await page.goto(BASE + '/fournil/'); await sleep(1200);
  check(await attendre(() => page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))), 'le service worker du jeu est installé (fournil/sw.js)');
  check(await page.evaluate(() => window.FOURNIL_CONFIG.vapid && window.__fournil.classement().notifsPossibles() === ''), 'config.js porte la clé publique : les notifications sont possibles');
  await reglages(page);
  let b = await blocNotifs(page);
  check(b && /rejoins-le d’abord/.test(b.txt) && /Rejoindre le classement/.test(b.txt) && b.on === null, `pas encore au classement : « ${b && b.txt} »`);
  check((await page.evaluate(() => window.__fournil.classement().choisirPseudo('Lucas').then((r) => r.etat))) === 'ok', 'rejoindre le classement');
  await page.evaluate(() => window.__fournil.rafraichir()); await sleep(300); await reglages(page);
  b = await blocNotifs(page);
  check(b && b.on === 'false' && /Me prévenir/.test(b.txt) && !b.cas.length && !b.essai, '« Me prévenir » : un interrupteur, éteint');
  await page.tap('[data-a="notifs"]');
  check(await attendre(async () => ((await blocNotifs(page)) || {}).on === 'true'), 'toucher « Me prévenir » : allumé');
  const ab = appels('fournil_abonner').pop(), po = await page.evaluate(() => window.__push);
  const id = await page.evaluate(() => window.__fournil.classement().etat().id);
  check(ab && ab.corps.p_id === id && /^[0-9a-f]{64}$/.test(ab.corps.p_jeton) && /^https:\/\/push\.exemple\.test\//.test(ab.corps.p_sub.endpoint) && ab.corps.p_sub.keys.p256dh.length === 87 && ab.corps.p_sub.keys.auth.length === 22 && JSON.stringify(ab.corps.p_prefs) === JSON.stringify({ pleine: true, evenements: true, pourboires: true, objectif: true }),
    'fournil_abonner(p_id, p_jeton, p_sub { endpoint, keys { p256dh, auth } }, p_prefs : les quatre cas)');
  check(po.options && po.options.userVisibleOnly === true && Buffer.from(po.options.cle).toString('base64url') === VAPID, 'PushManager.subscribe : userVisibleOnly, et la clé publique de config.js (65 octets)');
  await sleep(300); b = await blocNotifs(page);
  check(b.cas.join() === 'Ta boutique est pleine:true,Les événements:true,Les pourboires:true,L’objectif commun:true' && b.essai, `allumé : les quatre cas et « M’envoyer un essai » (${b.cas.join(' · ')})`);
  await page.screenshot({ path: out + '/01-reglages-notifs.png' }); if (cap) await page.screenshot({ path: cap + '/6-reglages-notifications.png' });
  await page.tap('[data-a="notif-evenements"]');
  check(await attendre(async () => ((await blocNotifs(page)) || { cas: [] }).cas.includes('Les événements:false')) && appels('fournil_abonner').pop().corps.p_prefs.evenements === false && appels('fournil_abonner').length === 2, 'décocher « Les événements » : les préférences repartent (fournil_abonner, evenements: false)');
  check((await page.evaluate(() => window.__push.appels.filter((x) => x === 'subscribe').length)) === 1, 'le même abonnement du navigateur est gardé (pas de second subscribe)');
  await page.tap('[data-a="notif-essai"]');
  check(await attendre(() => page.evaluate(() => /Essai envoyé/.test((document.querySelector('.toast') || {}).textContent || ''))) && appels('fournil_notif_essai').length === 1 && appels('fournil_notif_essai')[0].corps.p_id === id, '« M’envoyer un essai » : fournil_notif_essai, « Essai envoyé »');

  // ─── en quittant le jeu : l'heure où la boutique sera pleine ; au retour : annulée ───
  const h = await page.evaluate(() => window.__fournil.G.heuresAbsence(window.__fournil.st));
  const t0 = Date.now();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await attendre(() => appels('fournil_planifier').length >= 1); await sleep(400);
  const pl = appels('fournil_planifier');
  const quand = pl[0] && Date.parse(pl[0].corps.p_pleine_a);
  check(pl.length === 1 && pl[0].corps.p_id === id && Math.abs(quand - (t0 + h * 3600e3)) < 120e3, `en quittant (visibilitychange puis pagehide) : un seul fournil_planifier, p_pleine_a dans ${h} h (${pl[0] && pl[0].corps.p_pleine_a})`);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(() => appels('fournil_planifier').length >= 2);
  check(appels('fournil_planifier').length === 2 && appels('fournil_planifier')[1].corps.p_pleine_a === null, 'au retour : fournil_planifier(null) annule la notification');

  // ─── le service worker : un push affiché, puis touché ───
  const sw = ctx.serviceWorkers().find((w) => /\/fournil\/sw\.js$/.test(w.url())) || await ctx.waitForEvent('serviceworker');
  let reel = false;
  try { // le vrai chemin : un message push livré par le navigateur (DevTools), qui passe par l'écouteur « push »
    const cdp = await ctx.newCDPSession(page); let reg = null;
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const r of e.registrations) if (/\/fournil\/$/.test(r.scopeURL)) reg = r.registrationId; });
    await cdp.send('ServiceWorker.enable'); await attendre(async () => !!reg, 3000);
    if (reg) { await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: reg, data: JSON.stringify({ titre: 'Le Fournil', texte: 'Ta boulangerie déborde ! Tes apprentis t’attendent.', url: './', type: 'pleine' }) }); reel = await attendre(() => sw.evaluate(() => self.registration.getNotifications().then((l) => l.some((n) => n.tag === 'fournil-pleine'))), 4000); }
  } catch (e) { reel = false; }
  // puis la fonction de l'écouteur, appelée directement (afficherPush) : le texte d'un pourboire
  const vu = await sw.evaluate(async () => {
    let p = null; afficherPush({ data: { json: () => ({ titre: 'Le Fournil', texte: 'Mamie Jo t’a laissé un pourboire 🥐', url: './', type: 'pourboire' }) }, waitUntil: (x) => { p = x; } }); await p;
    const l = await self.registration.getNotifications({ tag: 'fournil-pourboire' }); const n = l[0];
    return n ? { titre: n.title, texte: n.body, tag: n.tag, icone: n.icon, url: n.data && n.data.url, toutes: (await self.registration.getNotifications()).map((x) => x.tag) } : null;
  });
  check(vu && vu.titre === 'Le Fournil' && vu.texte === 'Mamie Jo t’a laissé un pourboire 🥐' && vu.tag === 'fournil-pourboire' && /\/icons\/icon-192\.png$/.test(vu.icone) && vu.url === BASE + '/fournil/', `push : la notification affichée (titre, texte, icône du jeu, tag = type, adresse du jeu) ${JSON.stringify(vu)}`);
  check(reel, 'un vrai message push (livré par le navigateur) passe par l’écouteur « push » et s’affiche (« Ta boulangerie déborde ! »)');
  const piege = await sw.evaluate(async () => { let p = null; afficherPush({ data: { json: () => ({ titre: 'x'.repeat(300), texte: 'y', url: 'https://ailleurs.exemple/piege', type: '<b>' }) }, waitUntil: (x) => { p = x; } }); await p; const n = (await self.registration.getNotifications({ tag: 'fournil-fournil' }))[0]; return n ? { long: n.title.length, url: n.data.url } : null; });
  check(piege && piege.long === 80 && piege.url === BASE + '/fournil/', 'un message absurde : titre borné, type inconnu, une adresse d’un autre site remplacée par celle du jeu');
  const clic = await sw.evaluate(async () => {
    const res = {}; const n = (await self.registration.getNotifications({ tag: 'fournil-pourboire' }))[0];
    const essai = async (fenetres) => { let ouverte = null, focus = 0; Object.defineProperty(self, 'clients', { configurable: true, value: { matchAll: async () => fenetres.map((u) => ({ url: u, focus: async () => { focus++; } })), openWindow: async (u) => { ouverte = u; return null; } } }); let p = null; ouvrirJeu({ notification: n, waitUntil: (x) => { p = x; } }); await p; return { ouverte, focus }; };
    res.sans = await essai([]); res.avec = await essai([location.origin + '/fournil/']); res.autre = await essai([location.origin + '/poncin/']);
    delete self.clients; res.restantes = (await self.registration.getNotifications({ tag: 'fournil-pourboire' })).length; return res;
  });
  check(clic.sans.ouverte === BASE + '/fournil/' && clic.avec.focus === 1 && !clic.avec.ouverte && clic.autre.ouverte === BASE + '/fournil/' && clic.restantes === 0, 'toucher la notification : elle se ferme ; la fenêtre du jeu revient au premier plan, sinon le jeu s’ouvre (/fournil/)');

  // ─── se désabonner ───
  await reglages(page);
  await page.tap('[data-a="notifs"]');
  check(await attendre(async () => ((await blocNotifs(page)) || {}).on === 'false'), '« Me prévenir » touché à nouveau : éteint');
  await attendre(() => appels('fournil_desabonner').length > 0, 4000); // (l'interrupteur s'éteint aussitôt ; l'appel suit)
  const de = appels('fournil_desabonner').pop();
  check(de && de.corps.p_id === id && /^https:\/\/push\.exemple\.test\//.test(de.corps.p_endpoint) && (await page.evaluate(() => window.__push.appels.includes('unsubscribe'))), 'fournil_desabonner(p_endpoint) et l’abonnement du navigateur retiré');
  await ctx.close();

  // ─── la permission refusée ───
  {
    const c2 = await nouveau({ serviceWorkers: 'allow' });
    await c2.addInitScript(fauxPush);
    await c2.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => window.__perm || 'default' }); Notification.requestPermission = async () => { window.__perm = 'denied'; return 'denied'; }; } catch (e) { /* rien */ } });
    const p2 = await c2.newPage(); suivre(p2);
    await p2.goto(BASE + '/fournil/'); await sleep(1200);
    await p2.evaluate(() => window.__fournil.classement().choisirPseudo('Refus').then((r) => r.etat));
    await p2.evaluate(() => window.__fournil.rafraichir()); await reglages(p2);
    const n0 = appels('fournil_abonner').length;
    await p2.tap('[data-a="notifs"]');
    check(await attendre(() => p2.evaluate(() => /Notifications refusées/.test((document.querySelector('.toast') || {}).textContent || ''))) && appels('fournil_abonner').length === n0, 'permission refusée : « Notifications refusées… », rien n’est envoyé');
    await sleep(300); const b2 = await blocNotifs(p2);
    check(b2 && /Notifications bloquées/.test(b2.txt) && /réglages du téléphone/.test(b2.txt) && b2.on === null, `ensuite le bloc l’explique : « ${b2 && b2.txt} »`);
    await c2.close();
  }

  // ─── l'iPhone ouvert dans Safari (pas depuis l'écran d'accueil) : pas de PushManager ───
  {
    const c3 = await nouveau({ serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' });
    await c3.addInitScript(() => { try { delete window.PushManager; } catch (e) { /* rien */ } });
    const p3 = await c3.newPage(); suivre(p3);
    await p3.goto(BASE + '/fournil/'); await sleep(1200); await reglages(p3);
    const b3 = await blocNotifs(p3);
    check(b3 && /Sur iPhone, ajoute d’abord le jeu à l’écran d’accueil/.test(b3.txt) && /Partager/.test(b3.txt) && b3.on === null, `iPhone hors de l’écran d’accueil : « ${b3 && b3.txt} »`);
    await p3.screenshot({ path: out + '/02-iphone-safari.png' });
    await c3.close();
  }

  // ─── sans clé publique (config.js d'aujourd'hui) : « bientôt » ; l'artefact (pas de config.js) : pas de bloc ───
  {
    avecCle = false;
    const c4 = await nouveau({ serviceWorkers: 'block' }); const p4 = await c4.newPage(); suivre(p4);
    await p4.goto(BASE + '/fournil/'); await sleep(1200); await reglages(p4);
    const b4 = await blocNotifs(p4);
    check(b4 && /Bientôt disponible/.test(b4.txt) && b4.on === null, 'sans clé publique dans config.js : « Bientôt disponible »');
    await p4.goto(BASE + '/dist/artifact.html'); await sleep(1200); await reglages(p4);
    check((await blocNotifs(p4)) === null, 'l’artefact Claude (sans config.js) : pas de bloc Notifications');
    await c4.close(); avecCle = true;
  }

  // ─── fournil/sw.js : nouvelle version de cache, les deux écouteurs ───
  const swTxt = fs.readFileSync(path.join(root, 'fournil', 'sw.js'), 'utf8');
  check(/const CACHE = 'fournil-jeu-v\d+'/.test(swTxt) && /addEventListener\('push', afficherPush\)/.test(swTxt) && /addEventListener\('notificationclick', ouvrirJeu\)/.test(swTxt), 'fournil/sw.js : cache fournil-jeu-vN, écouteurs « push » et « notificationclick »');
  check(!/sb_secret_|PRIVATE|private_key/i.test(fs.readFileSync(path.join(root, 'fournil', 'config.js'), 'utf8')), 'fournil/config.js : aucune clé secrète');
  { const cfg = fs.readFileSync(path.join(root, 'fournil', 'config.js'), 'utf8'), m = /vapid: '([A-Za-z0-9_-]+)'/.exec(cfg), cle = m && Buffer.from(m[1], 'base64url');
    check(!!(cle && cle.length === 65 && cle[0] === 4) && /bearer: true \}/.test(cfg.replace(/,\s*giphy: '[^']*'/, '').replace(/,\s*\/\/[^\n]*\n\s*vapid: '[^']*'/, '')), 'fournil/config.js : la vraie clé publique des notifications (65 octets, 0x04 en tête)'); }

  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  check(errors.length === 0, 'aucune erreur dans la page');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
