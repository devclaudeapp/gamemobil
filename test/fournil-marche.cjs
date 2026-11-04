// L'événement « Le Marché d'automne » à l'écran (src/evenement.js : ficheBoutique, ficheMarche ; src/ui.js : le coin, les onglets, les Réglages,
// le podium) sur la vraie page du Fournil (fournil/ servie en local), téléphone en portrait (390 × 844), le samedi 14 novembre 2026 à 11 h
// (le 2e jour du Marché ; HORLOGE suit la fausse heure du téléphone et l'en-tête Date du serveur local). Supabase est SIMULÉ (page.route :
// fournil_publier, fournil_classement, fournil_recompenses, fournil_heure). Parcours :
// · une partie qui a joué la Maison hantée sans voir son bilan : le bilan d'abord, puis (jamais en même temps) l'annonce du Marché, une seule
//   fois (« Comment jouer » en six points, sans défilement de côté) ; l'icône feuille du coin et son minuteur (« 6 j 9 h ») ;
// · entrer dans la Halle : l'écran #marche (ids mc-), les huit recettes, le solde en noisettes, « Jour 2 sur 8 » ;
// · le tiroir du Manoir (la règle permanente : src/tiroir.js et le tiroir de src/evenement.js) : ses trois crans en 390 × 844, 375 × 812 et
//   360 × 640, la poignée glissée jusqu'en haut, la barre tirée vers le bas, la liste qui défile (pas la page), tirée vers le bas tout en haut
//   elle referme le tiroir au cran mi ; aucun défilement de côté à 360 px ;
// · la feuille des paliers (« gagné, s'ouvre dimanche 15 ») ; trois paliers reçus d'un coup (des étoiles et un boost, les cagettes posées
//   dans la boutique, le bonnet à pompon dans la garde-robe) ;
// · le classement : l'onglet « Marché » (et celui d'Halloween, lisible jusqu'au 16 nov.), les noisettes envoyées avec p_evt = 'marche' ;
// · les Réglages : « Masquer le Marché d'automne » (l'icône part, la Halle refuse de s'ouvrir), puis démasqué ;
// · après le 20 novembre à 20 h : le bilan de la Halle ; un 7e du classement final : « Tu as fini 7e du Marché d'automne sur 12 », 3 étoiles et
//   un boost ×3 de 30 min, une seule fois ; un 2e : la tenue d'automne en or dans la garde-robe ;
// · aucune erreur de page.
// Ce qui dépend des règles du constructeur A (src/classement.js : EVTS ; src/game.js : la garde-robe du Marché) est marqué « -- » tant qu'il manque.
// Captures dans test/shots/marche/ (et dans SHOTS_MARCHE s'il est donné).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-marche.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const MC = require('../src/marche.js'), CL = require('../src/classement.js');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_MARCHE || 8884, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const out = path.join(__dirname, 'shots', 'marche'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_MARCHE ? (fs.mkdirSync(process.env.SHOTS_MARCHE, { recursive: true }), process.env.SHOTS_MARCHE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const HEURE = 3600e3, DEPART = new Date('2026-11-14T11:00:00+01:00').getTime();
let decal = DEPART - Date.now();
const vrai = () => Date.now() + decal;
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const passe = (m) => console.log('  --   ' + m); // une vérification qui attend le constructeur A (src/classement.js, src/game.js) : ni réussie ni ratée
const attendre = async (fn, ms = 10000, pas = 120) => { for (let t = 0; t < ms; t += pas) { try { const r = await fn(); if (r) return r; } catch (e) { /* la page se recharge */ } await sleep(pas); } return null; };
const AVEC_EVT = CL.PERIODES && CL.PERIODES.includes('marche'); // le moteur du classement connaît l'événement 'marche' (constructeur A : EVTS)

// ─── le faux Supabase (comme test/fournil-recompenses.cjs) : un petit classement en mémoire, le Marché en période à part ───
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const MOI = { id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex'), pseudo: 'Paulo' };
const faux = { joueurs: new Map(), appels: [], evenements: null };
function semer() {
  faux.joueurs.clear(); faux.appels.length = 0; faux.evenements = null; const l = CL.lundiParis(vrai());
  ['Mamie Jo', 'Tonton Brioche', 'Petit Levain'].forEach((pseudo, i) => faux.joueurs.set(crypto.randomUUID(), { jeton: sha('x' + i), pseudo, sommet: 1e12, total: 9e9 / (i + 1), gain: 3e8 / (i + 1), semaine: l, evt: { marche: 4e13 / (i + 1), hantee: 7e14 / (i + 1) } }));
  faux.joueurs.set(MOI.id, { jeton: sha(MOI.jeton), pseudo: MOI.pseudo, sommet: 1e6, total: 2e9, gain: 1e8, semaine: l, evt: {} });
}
const RPC = {
  fournil_publier: (c) => {
    const j = faux.joueurs.get(c.p_id), l = CL.lundiParis(vrai()); if (!j || j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' };
    if (c.p_evt && c.p_score > 0) j.evt[c.p_evt] = Math.max(j.evt[c.p_evt] || 0, c.p_score);
    const tous = [...faux.joueurs.values()];
    return { ok: true, erreur: null, rang_semaine: 2, rang_total: 2, joueurs: tous.length, joueurs_total: tous.length, joueurs_semaine: tous.length, semaine: l, compte: 0, plafonne: false, ...(c.p_evt ? { evt: c.p_evt, rang_evt: tous.filter((a) => (a.evt[c.p_evt] || 0) > (j.evt[c.p_evt] || 0)).length + 1 } : {}) };
  },
  fournil_classement: (c) => {
    const l = CL.lundiParis(vrai()), per = c.p_periode, evt = per !== 'semaine' && per !== 'total' && per !== 'quartier';
    const v = [...faux.joueurs.entries()].map(([id, a]) => ({ id, pseudo: a.pseudo, valeur: evt ? a.evt[per] || 0 : per === 'semaine' ? a.gain : a.total })).filter((x) => !evt || x.valeur > 0);
    v.sort((a, b) => b.valeur - a.valeur); v.forEach((x, k) => { x.rang = k + 1; });
    const moi = v.find((x) => x.id === c.p_id);
    return { semaine: l, periode: per, joueurs: v.length, lignes: v.slice(0, 50).map((x) => ({ rang: x.rang, pseudo: x.pseudo, valeur: x.valeur, moi: x.id === c.p_id })), moi: moi ? { rang: moi.rang, valeur: moi.valeur } : null };
  },
  fournil_recompenses: (c) => ({ ok: true, erreur: null, podiums: [], derniere: null, ...(faux.evenements ? { evenements: faux.evenements } : {}) }),
  fournil_heure: () => ({ ms: vrai() }),
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request(); if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1]; let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps });
  if (!RPC[nom] || !corps) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps)) });
}
const etatInscrit = (rec) => JSON.stringify({ ...CL.etatNeuf(), id: MOI.id, jeton: MOI.jeton, pseudo: MOI.pseudo, rejoint: true, essai: 0, dernierEnvoi: 0, valeur: null, ...(rec ? { recompenses: rec } : {}) });
function fauxTelephone(decalDepart) { // avant tout script de la page : une fausse heure du téléphone, gardée d'un chargement à l'autre
  let d = decalDepart; try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* about:blank */ }
  const D = Date; class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = FauxDate;
  window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true });
}

(async () => {
  semer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(fauxTelephone, decal);
  await ctx.route(SUPA + '/rest/v1/rpc/*', gerer); await ctx.route(/googleapis|gstatic/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  const URL_JEU = `http://localhost:${PORT}/fournil/?qualite=eco`;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (nom) => { await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
  const pret = async () => { await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900); };
  const charger = async () => { await page.goto(URL_JEU); await pret(); };
  const feuille = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const clic = (sel) => ev((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
  const fermerFeuille = async () => { for (let k = 0; k < 4; k++) { const ouverte = await ev(() => !document.querySelector('#feuille').hidden); if (!ouverte) return; await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="pq-ok"], #feuille [data-a="pq-tard"], #feuille [data-a="pq-retour"], #feuille [data-a="ev-recuperer"]'); if (b) b.click(); else document.querySelector('#voile').click(); }); await sleep(500); } };
  const mq = () => ev(() => { const F = window.__fournil, q = F.st.marche; return q ? { annonce: q.annonce, bilan: q.bilan, masque: q.masque, total: q.total, billets: q.billets, paliers: q.paliers.slice(), decos: q.decos.slice(), vetements: q.vetements.slice() } : null; });
  const halle = () => ev(() => { const el = document.querySelector('#marche'); return { ouvert: !el.hidden, ecran: el.dataset.ecran, titre: document.querySelector('#mc-titre').textContent, sous: document.querySelector('#mc-sous').textContent, billets: document.querySelector('#mc-billets').textContent, taux: document.querySelector('#mc-taux').innerText, reste: document.querySelector('#mc-reste').textContent, cartes: [...document.querySelectorAll('#mc-cartes .carte[data-i]')].map((c) => c.querySelector('h3') ? c.querySelector('h3').textContent : '') }; });
  const largeur = () => ev(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, feuille: (() => { const f = document.querySelector('#feuille'); return f.hidden ? 0 : f.scrollWidth - f.clientWidth; })(), marche: (() => { const m = document.querySelector('#marche'); return m.hidden ? 0 : m.scrollWidth - m.clientWidth; })() }));

  // une vieille partie (tout est ouvert), inscrite au classement, qui a joué la Maison hantée sans voir son bilan
  await page.goto(`http://localhost:${PORT}/vide.html`);
  await ev((e) => { localStorage.clear(); localStorage.setItem('fournil.classement', e); }, etatInscrit());
  await charger();
  await ev(() => { const F = window.__fournil, st = F.st; window.__sansEvenements = true; st.lifetime = Math.max(st.lifetime, 5e9); st.tuto = 9; st.etoiles = Math.max(st.etoiles, 3);
    const h = F.evHantee.R.etat(st, F.evHantee.R.DEBUT + 3600e3); h.annonce = true; h.total = 4e12; h.billets = 1e9; h.bilan = false; h.paliers = [1, 2, 3, 4, 5, 6, 7]; h.ouvertLe = F.evHantee.R.DEBUT + 3600e3;
    delete st.marche; F.save(); });
  await sleep(300);

  console.log('── le samedi 14 novembre à 11 h : le bilan de la Maison hantée d’abord, puis l’annonce du Marché (jamais deux à la fois) ──');
  await charger();
  check(await attendre(() => ev(() => !!document.querySelector('#feuille-contenu [data-bilan="hantee"]') || document.querySelector('#hantee').dataset.ecran === 'bilan'), 8000), 'au lancement, le bilan de la Maison hantée passe en premier');
  check(!/Marché d’automne ouvre/.test(await feuille()), 'pas d’annonce du Marché par-dessus le bilan');
  await ev(() => { if (window.__fournil.evHantee && !document.querySelector('#hantee').hidden) window.__fournil.fermerHantee(); }); await fermerFeuille(); await sleep(400);
  let c = await ev(() => window.__fournil.coin());
  check(c.marche && !c.hantee && !c.quartier, `l’icône feuille du Marché est dans le coin, pas la citrouille (${JSON.stringify({ marche: c.marche, hantee: c.hantee })})`);
  const minuteur = () => ev(() => { const b = document.querySelector('#b-marche'), x = b.querySelector('.ev-reste'), r = x.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { txt: x.hidden ? '' : x.textContent.replace(/ /g, ' '), label: b.getAttribute('aria-label'), dedans: r.left >= rb.left - 6 && r.right <= rb.right + 6, police: parseFloat(getComputedStyle(x).fontSize), large: Math.round(rb.width), ico: !!b.querySelector('.ico svg') }; });
  { const mn = await attendre(async () => { const x = await minuteur(); return x.txt ? x : null; }, 6000);
    check(!!mn && /^6 j (8|9) h$/.test(mn.txt) && /Marché d’automne · encore 6 j/.test(mn.label) && mn.dedans && mn.police >= 10 && mn.large <= 44, `le minuteur sous l’icône : « ${mn && mn.txt} » (« ${mn && mn.label} »)`);
    passe(`l’icône dessinée du coin (ICONS.UI.marche, constructeur C) : ${mn && mn.ico ? 'là' : 'pas encore'}`);
    await page.screenshot({ path: path.join(out, '00-coin-minuteur.png'), clip: { x: 240, y: 40, width: 150, height: 300 } }); }
  check(await ev(() => window.__fournil.annoncerEvenements(true)) === true && /Le Marché d’automne ouvre ses étals/.test(await feuille()), 'puis l’annonce : « Le Marché d’automne ouvre ses étals ! »');
  { const a = await ev(() => { const f = document.querySelector('#feuille-contenu'); return { regles: [...f.querySelectorAll('.ht-regles li')].map((l) => l.innerText.replace(/\s+/g, ' ')), entrer: (() => { const b = f.querySelector('[data-a="pq-entrer"]'); return b ? { t: b.innerText, h: b.getBoundingClientRect().height } : null; })(), tard: !!f.querySelector('[data-a="pq-tard"]'), mc: !!f.querySelector('.pq-sheet.mc') }; });
    check(a.regles.length === 6 && /enfants déguisés/.test(a.regles[0]) && /×6/.test(a.regles[1]) && /album de la forêt/.test(a.regles[2]) && /20 paliers/.test(a.regles[3]) && /15 premiers/.test(a.regles[4]) && /vendredi 20 novembre, 20 h/.test(a.regles[5].replace(/ /g, ' ')), `« Comment jouer » en six points : ${a.regles.map((r) => r.split('.')[0]).join(' · ')}`);
    check(!!a.entrer && /Entrer dans la Halle/.test(a.entrer.t) && a.entrer.h >= 44 && a.tard && a.mc, `« Entrer dans la Halle » (${a.entrer && Math.round(a.entrer.h)} px) et « Plus tard », aux couleurs du Marché`); }
  { const l = await largeur(); check(l.doc <= l.vw && l.feuille <= 1, `l’annonce, sans défilement de côté (${l.doc} px pour ${l.vw})`); }
  await sleep(400); await shot('01-annonce');
  check((await mq()).annonce === true && await ev(() => window.__fournil.annoncerEvenements(true)) === false, 'annoncée une seule fois (notée dans la sauvegarde)');

  console.log('── la Halle ──');
  await clic('#feuille [data-a="pq-entrer"]'); await sleep(1500);
  let h = await halle();
  check(h.ouvert && h.ecran === 'halle' && h.titre === 'La Halle' && /Jour 2 sur 8/.test(h.sous), `on entre dans la Halle : « ${h.titre} · ${h.sous} »`);
  check(h.cartes.length === MC.PRODUITS.length && h.cartes[0] === MC.PRODUITS[0].nom, `les ${h.cartes.length} recettes, la première : « ${h.cartes[0]} »`);
  check(/noisettes/.test(h.billets) && /Ferme dans|6 j/.test(h.reste + h.taux), `le solde en noisettes : « ${h.billets.replace(/\s+/g, ' ')} » · ${h.reste}`);
  { const t = await ev(() => { const el = document.querySelector('#marche'); return { guirlande: !!el.querySelector('.mc-guirlande'), feuilles: el.querySelectorAll('.mc-vol .mc-f').length, eveil: !!el.querySelector('#mc-eveil'), serie: !!el.querySelector('#mc-serie'), commande: !!el.querySelector('#mc-commande'), album: !!el.querySelector('#mc-bestiaire'), fond: getComputedStyle(el).backgroundColor, toile: !!el.querySelector('.mh-toile') }; });
    check(t.guirlande && t.feuilles === 2 && !t.toile && t.fond === 'rgb(255, 244, 228)', `ses touches d’automne : la guirlande de feuilles dans l’en-tête, deux feuilles près de la poignée, le fond crème (${t.fond}), pas de toile d’araignée`);
    check(t.eveil && t.serie && t.commande && t.album, 'les places des activités, sur le préfixe mc- : la jauge, la série, la commande du marché, l’album de la forêt'); }
  await ev(() => document.querySelector('#mc-cartes .carte[data-i="0"] .barre') && document.querySelector('#mc-cartes .carte[data-i="0"] .barre').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  check(await attendre(async () => ((await mq()) || {}).total > 0, 10000), 'une touche sur les châtaignes : une première vente, en noisettes');
  await sleep(600); await shot('02-halle');

  console.log('── le tiroir du Manoir : trois crans, la poignée et la barre, la liste qui défile ──');
  const cdp = await ctx.newCDPSession(page);
  const touche = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const pose = () => attendre(() => ev(() => { const t = document.querySelector('#marche .pq-tiroir'); return !t.style.transform && Math.abs(t.getBoundingClientRect().top - document.querySelector('#marche').getBoundingClientRect().top - parseFloat(t.style.getPropertyValue('--pq-tiroir-y'))) < 0.5; }), 15000, 50);
  const glisser = async (x, y0, y1, n = 10, pas = 16, tenir = 0) => { await touche('touchStart', [[x, y0]]); for (let k = 1; k <= n; k++) { await touche('touchMove', [[x, y0 + (y1 - y0) * k / n]]); await sleep(pas); } if (tenir) await sleep(tenir); await touche('touchEnd', []); await sleep(600); await pose(); };
  const centreDe = (sel) => ev((s2) => { const b = document.querySelector(s2).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
  const cran = () => ev(() => { const el = document.querySelector('#marche'), t = el.querySelector('.pq-tiroir'), c = el.querySelector('#mc-cartes'), a = el.querySelector('.pq-act'), r0 = el.getBoundingClientRect(), R = (e) => e.getBoundingClientRect();
    return { pos: el.dataset.tiroir, y: parseFloat(t.style.getPropertyValue('--pq-tiroir-y')), haut: R(t).top - r0.top, tr: t.style.transform, bas: R(c).bottom, H: window.innerHeight, ecran: R(el).bottom, fond: R(t).bottom, col: a ? [R(a).top, R(a).bottom] : [0, 0], solde: R(el.querySelector('.pq-solde')).bottom, barre: R(el.querySelector('.pq-barre')).bottom, scene: R(el.querySelector('.pq-scene')).bottom, defile: document.scrollingElement.scrollTop + el.scrollTop, cartesDefile: c.scrollTop, large: document.documentElement.scrollWidth - innerWidth, boutique: el.classList.contains('mc-boutique') || el.classList.contains('ht-boutique') }; });
  const crans = {};
  const surCran = async (ou, attendu) => {
    const k = await cran(), exact = ['haut', 'mi', 'ferme'].includes(k.pos) && !k.tr && Math.abs(k.haut - k.y) < 1 && (!crans[k.pos] || Math.abs(crans[k.pos] - k.y) < 1);
    const liste = Math.abs(k.bas - k.H) <= 2 && k.fond >= k.H - 1, col = k.pos === 'haut' ? k.col[0] >= k.haut : k.col[1] <= k.haut, rien = !k.defile && Math.abs(k.ecran - k.H) < 1 && k.large <= 0;
    // (fermé : la barre seule en bas ; la scène agrandie jusqu'à elle quand la boutique du Marché est à l'écran, src/boutiquemarche.js, constructeur C)
    const lieu = k.pos === 'haut' ? Math.abs(k.haut - k.solde) <= 2 : k.pos === 'ferme' ? Math.abs(k.barre - k.H) <= 40 && (!k.boutique || k.scene > k.H - 120) : true;
    check(exact && liste && col && rien && lieu && (!attendu || k.pos === attendu), `${ou} : sur le cran ${k.pos}${attendu && k.pos !== attendu ? ` (attendu : ${attendu})` : ''} (${Math.round(k.haut)} px), le bas de la liste à ${Math.round(k.bas)} px pour un écran de ${k.H}${exact && liste && col && rien && lieu ? '' : ` (cran ${Math.round(k.y)}, solde ${Math.round(k.solde)}, barre ${Math.round(k.barre)}, scène ${Math.round(k.scene)}, défilé ${k.defile}, de côté ${k.large})`}`);
    return k;
  };
  for (const [w, hh] of [[390, 844], [375, 812], [360, 640]]) {
    const ou = `${w} × ${hh}`; for (const k in crans) delete crans[k];
    await page.setViewportSize({ width: w, height: hh }); await sleep(1000); await ev(() => window.__fournil.evMarche.tiroir('mi')); await pose();
    for (const cc of ['mi', 'haut', 'ferme', 'mi']) { await ev((c2) => window.__fournil.evMarche.tiroir(c2), cc); await pose(); await sleep(150); const k = await surCran(`${ou}, posé ${cc}`, cc); crans[cc] = k.y; if (w !== 375) await shot(`03-tiroir-${cc}-${w}x${hh}`); }
    let [x, y] = await centreDe('#marche .pq-poignee'); await glisser(x, y, crans.haut + 12, 14, 40); await surCran(`${ou}, la poignée glissée jusqu’en haut`, 'haut');
    [x, y] = await centreDe('#marche .pq-modes [data-mode="100"]'); await glisser(x, y, y + (crans.mi - crans.haut) * 0.8, 10, 30); await surCran(`${ou}, la barre tirée vers le bas : il redescend`, 'mi');
    // en haut, la liste défile ; tout en haut, tirée vers le bas, elle referme le tiroir (au cran mi)
    await ev(() => window.__fournil.evMarche.tiroir('haut')); await pose();
    { const k0 = await cran(); await glisser(150, Math.min(k0.H - 60, k0.y + 300), k0.y + 80, 10, 30); const k1 = await cran();
      check(k1.pos === 'haut' && k1.cartesDefile > 0 && !k1.defile, `${ou}, en haut : la liste défile au doigt (${Math.round(k1.cartesDefile)} px), pas la page`);
      await ev(() => { document.querySelector('#mc-cartes').scrollTop = 0; }); await sleep(200);
      const k2 = await cran(); await glisser(150, k2.y + 120, k2.y + 120 + (crans.mi - crans.haut) * 0.8, 10, 40); await surCran(`${ou}, la liste tout en haut, tirée vers le bas : le tiroir redescend`, 'mi'); }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(800); await ev(() => window.__fournil.evMarche.tiroir('mi')); await pose();

  console.log('── les paliers ──');
  await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.billets = 1e9; F.save(); });
  const avant = await ev(() => ({ et: window.__fournil.st.etoiles, boosts: (window.__fournil.st.boosts && window.__fournil.st.boosts.reserve.length) || 0 }));
  await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.total = 5e10; F.save(); }); // (les trois paliers du premier jour)
  check(await attendre(async () => ((await mq()) || { paliers: [] }).paliers.length >= 3, 10000), 'trois paliers franchis d’un coup (le premier jour)');
  { const f1 = await attendre(async () => { const t = await feuille(); return /Palier 1/.test(t) ? t : null; }, 6000);
    check(!!f1 && /Premières noisettes/.test(f1), `la feuille du palier 1 : « ${(f1 || '').split('\n')[0]} »`); await sleep(300); await shot('04-palier-1'); }
  for (let k = 0; k < 4; k++) { await clic('#feuille [data-a="pq-ok"]'); await sleep(700); }
  { const s = await mq(), apres = await ev(() => ({ et: window.__fournil.st.etoiles, boosts: (window.__fournil.st.boosts && window.__fournil.st.boosts.reserve.length) || 0 }));
    check(apres.et === avant.et + 1 && apres.boosts === avant.boosts + 1, `palier 1 : +1 ★ (${avant.et} → ${apres.et}) et un boost ×2 en réserve`);
    check(s.decos.includes('cagettes'), 'palier 2 : les cagettes du perron (q.decos)');
    check(s.vetements.includes('marche-bonnet'), 'palier 3 : le bonnet à pompon gagné (q.vetements)');
    const gr = await ev(() => { const G = window.__fournil.G; try { return { connu: !!G.vetement('marche-bonnet'), a: G.possede ? G.possede(window.__fournil.st, 'marche-bonnet') : false }; } catch (e) { return { connu: false }; } });
    if (gr.connu) check(gr.a, 'le bonnet à pompon est dans la garde-robe du boulanger'); else passe('le bonnet dans la garde-robe attend la garde-robe du Marché (src/game.js, constructeur A)'); }
  await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.total = 3.2e12; F.save(); }); // (le 7e palier : gagné, il s'ouvre dimanche)
  await sleep(1200); await fermerFeuille();
  for (let k = 0; k < 4; k++) { await clic('#feuille [data-a="pq-ok"]'); await sleep(500); }
  await clic('#marche [data-pq="paliers"]'); await sleep(700);
  { const t = await feuille(); check(/Les paliers/.test(t) && /gagné, s’ouvre dimanche 15/.test(t) && /Les bottes de pluie/.test(t), `la feuille des paliers : le 7e « gagné, s’ouvre dimanche 15 »`);
    const l = await largeur(); check(l.feuille <= 1, `sans défilement de côté (${l.feuille} px de trop)`); }
  await ev(() => { const x = [...document.querySelectorAll('#feuille .pq-palier')].find((p) => /bottes/.test(p.textContent)); if (x) x.scrollIntoView({ block: 'center' }); }); await sleep(300); await shot('05-paliers');
  await fermerFeuille();
  { const d = await attendre(() => ev(() => window.__fournil.SCENE.decosMarcheVues ? window.__fournil.SCENE.decosMarcheVues.includes('cagettes') : null), 3000);
    if (await ev(() => !!window.__fournil.SCENE.decosMarche)) check(!!d, 'les cagettes posées dans la boutique (SCENE.decosMarche)'); else passe('les cagettes dans la boutique attendent SCENE.decosMarche (src/scene.js, constructeur C)'); }

  console.log('── le classement : l’onglet « Marché » (et celui d’Halloween, jusqu’au 16) ──');
  await ev(() => window.__fournil.fermerMarche()); await sleep(600); await fermerFeuille();
  if (AVEC_EVT) {
    const env = await attendre(async () => { const x = faux.appels.find((a) => a.nom === 'fournil_publier' && a.corps && a.corps.p_evt === 'marche'); if (!x) await ev(() => { const c = window.__fournil.classement(); if (c) c.envoyer('ouverture'); }); return x; }, 90000, 3000); // (un envoi au plus toutes les 30 s : REGLES.ecartMin)
    check(!!env && env.corps.p_score > 0, `les noisettes partent au classement avec p_evt = 'marche' (${env ? env.corps.p_score : 'rien'})`);
    await ev(() => window.__fournil.feuilleClassement('marche')); await sleep(1500);
    const tabs = await ev(() => [...document.querySelectorAll('#feuille [data-tab]')].map((b) => ({ id: b.dataset.tab, t: b.textContent, ok: b.scrollWidth <= b.clientWidth + 1 })));
    check(tabs.some((x) => x.id === 'marche' && /Marché/.test(x.t)) && tabs.some((x) => x.id === 'hantee') && tabs.every((x) => x.ok), `les onglets : ${tabs.map((x) => x.t).join(' · ')} (le Marché, et Halloween jusqu’au 16)`);
    const t = await feuille(); check(/noisettes gagnées à la Halle/.test(t) && /noisettes/.test(t) && /Mamie Jo/.test(t), `l’onglet « Marché » : « ${(t.split('\n').find((l) => /Halle/.test(l)) || '').trim()} »`);
    await shot('06-classement-marche'); await fermerFeuille();
  } else passe('l’onglet « Marché » et p_evt = \'marche\' attendent le moteur du classement (src/classement.js, EVTS : constructeur A)');

  console.log('── les Réglages : masquer le Marché ──');
  await ev(() => window.__fournil.page('reglages')); await sleep(600);
  { const l = await ev(() => { const b = document.querySelector('[data-a="marche"]'); return b ? b.innerText.replace(/\s+/g, ' ') : ''; });
    check(/Masquer le Marché d’automne/.test(l), `la ligne « ${l.slice(0, 60)} » est dans les Réglages pendant le Marché`); }
  await clic('[data-a="marche"]'); await sleep(400);
  c = await ev(() => window.__fournil.coin());
  check((await mq()).masque === true && !c.marche, 'masqué : l’icône feuille disparaît');
  check(await ev(() => window.__fournil.marche()) === false, 'et la Halle refuse de s’ouvrir');
  await clic('[data-a="marche"]'); await sleep(400);
  c = await ev(() => window.__fournil.coin()); check(c.marche && (await mq()).masque === false, 'démasqué : l’icône revient');
  await ev(() => window.__fournil.page('boutique')); await sleep(300);

  console.log('── après le vendredi 20 novembre à 20 h : le bilan, les places du classement final ──');
  decal = MC.FIN + 3 * HEURE - Date.now();
  await ev((d) => localStorage.setItem('test.tel', String(d)), decal); await ev(() => window.__fournil.save());
  await charger();
  check(await attendre(() => ev(() => document.querySelector('#marche').dataset.ecran === 'bilan'), 8000), 'après la fin : le bilan de la Halle s’ouvre de lui-même');
  { const b = await ev(() => document.querySelector('#mc-corps').innerText);
    check(/La Halle a fermé|Bilan du Marché/.test(b) && /paliers/.test(b) && /reste à vie/.test(b), `le bilan : ${b.split('\n').filter((l) => /paliers|reste/.test(l)).join(' / ').slice(0, 160)}`); }
  await sleep(600); await shot('07-bilan');
  await ev(() => window.__fournil.fermerMarche()); await sleep(500);
  c = await ev(() => window.__fournil.coin()); check(!c.marche, 'fini : l’icône du coin est partie');
  // un 7e du classement final (v6.6 : du 1er au 15e) : la feuille « Tu as fini 7e du Marché d'automne sur 12 », 3 ★ et un boost ×3 de 30 min, une fois
  if (AVEC_EVT) {
    faux.evenements = { marche: { rang: 7, joueurs: 12, podium: [] } };
    await ev((e) => { localStorage.setItem('fournil.classement', e); }, etatInscrit(Object.assign(CL.recompensesNeuves(), { evenements: { marche: { rang: 7, joueurs: 12, podium: [] } } })));
    await charger(); await fermerFeuille();
    const e0 = await ev(() => ({ et: window.__fournil.st.etoiles, b: window.__fournil.st.boosts.reserve.length }));
    const f7 = await attendre(async () => { const t = await feuille(); return /7e du Marché d’automne sur 12/.test(t) ? t : null; }, 15000);
    check(!!f7 && /3 étoiles/.test(f7) && /×3/.test(f7) && !/en or/.test(f7), `« ${(f7 || '').split('\n').find((l) => /7e/.test(l)) || '—'} » : 3 étoiles et un boost ×3, pas la tenue en or`);
    await sleep(400); await shot('08-fini-7e');
    await clic('#feuille [data-a="ev-recuperer"]'); await sleep(800);
    const e1 = await ev(() => ({ et: window.__fournil.st.etoiles, b: window.__fournil.st.boosts.reserve.length }));
    check(e1.et === e0.et + 3 && e1.b === e0.b + 1, `« Récupérer » : +3 ★ (${e0.et} → ${e1.et}), le boost dans la réserve`);
    await charger(); await sleep(2500);
    const e2 = await ev(() => window.__fournil.st.etoiles);
    check(e2 === e1.et && !/7e du Marché/.test(await feuille()), 'une seule fois : rien de plus au lancement suivant');
    await ev(() => window.__fournil.recompenses()); await sleep(800);
    const mr = await feuille(); check(/Mes événements/.test(mr) && /Le Marché d’automne/.test(mr), '« Mes récompenses » : la place au Marché d’automne, dans « Mes événements »');
    await shot('09-mes-recompenses'); await fermerFeuille();
  } else passe('la place du classement final (« Tu as fini 7e du Marché d’automne sur 12 ») attend src/classement.js (EVTS, evtAPayer : constructeur A)');
  // un 2e : la tenue d'automne en or (le podium final), à vie
  { const connu = await ev(() => { try { return !!window.__fournil.G.vetement('marche-or-bonnet'); } catch (e) { return false; } });
    if (AVEC_EVT && connu) {
      await ev((e) => { localStorage.setItem('fournil.classement', e); }, etatInscrit(Object.assign(CL.recompensesNeuves(), { evenements: { marche: { rang: 2, joueurs: 12, podium: [] } } })));
      faux.evenements = { marche: { rang: 2, joueurs: 12, podium: [] } };
      await charger(); await sleep(2500);
      check(await attendre(() => ev(() => window.__fournil.G.possede(window.__fournil.st, 'marche-or-bonnet')), 10000), 'un 2e du classement final : la tenue d’automne en or est dans la garde-robe');
      check((await ev(() => window.__toasts.slice())).some((t) => /Podium final du Marché d’automne/.test(t)), '« Podium final du Marché d’automne : la tenue d’automne en or est dans ta garde-robe ! »');
    } else passe('la tenue d’automne en or du 2e attend src/classement.js (EVTS) et la garde-robe du Marché (src/game.js : constructeur A)'); }

  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', (e && e.stack) || e); process.exit(1); });
