// L'événement « Le Quartier » sur la vraie page du Fournil (fournil/ servie en local), sur un téléphone en portrait, avec une FAUSSE HEURE dans la
// fenêtre de l'événement (le serveur local donne la même heure dans son en-tête Date : l'horloge de confiance la prend ; Date est décalé avant
// tout script de la page) et un Supabase SIMULÉ (page.route, contrat v4 : p_quartier, période « quartier », podium final).
// Parcours : l'icône ronde en haut à droite (seulement pendant l'événement), l'annonce du premier jour, la porte 18+, la Planque (vendre à la
// main, débloquer, embaucher, les combines), les coups de pouce (descente, scooter, soirée, gros client), les paliers et leurs récompenses dans la
// boulangerie (étoiles, boosts en réserve lancés depuis la pastille, décos du quartier dans la boutique, vêtements de la garde-robe), les gains
// d'absence plafonnés, « Masquer l'événement » dans les Réglages, l'onglet Événement du classement, puis la fin : la Planque fermée, le bilan,
// l'icône disparue, le podium final dans le classement. Puis, dans un second téléphone, la mise à jour « après le boss » : une sauvegarde déjà
// au 12e (le 15 octobre) reçoit les paliers bonus déjà dépassés dans la boutique, une fois ; la liste « Après le boss » (13 à 20) lisible à
// 390 px ; les combines en plus ; le 20e et sa casquette néon ; le bilan qui compte jusqu'à 20. Enfin, dans un troisième téléphone, les
// activités (test/fournil-activites-ecran.cjs) : la barre des trois boutons, une partie de chaque mini-jeu au doigt, un contrat réclamé,
// une opération lancée puis ramassée. Les recettes d'après le boss : les deux cartes « Après le palier 13 / 16 » dès l'entrée, puis, dans le
// second téléphone, le sirop violet débloqué, son apprenti, sa combine ×3, le Grossiste acheté et le prix d'un niveau divisé par deux à l'écran.
// Captures dans test/shots/quartier/ (et dans le dossier donné par SHOTS_QUARTIER) ; celles des recettes dans test/shots/recettes/.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-quartier.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const Q = require('../src/quartier.js'), CL = require('../src/classement.js');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_QUARTIER || 8865, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const out = path.join(__dirname, 'shots', 'quartier'); fs.mkdirSync(out, { recursive: true });
const outR = path.join(__dirname, 'shots', 'recettes'); fs.mkdirSync(outR, { recursive: true }); // les recettes
const photoR = async (pg, nom) => { await pg.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); await pg.screenshot({ path: path.join(outR, nom + '.png') }); await pg.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); }; // sans le toast du moment (une capture par écran) d'après le boss
const out2 = process.env.SHOTS_QUARTIER ? (fs.mkdirSync(process.env.SHOTS_QUARTIER, { recursive: true }), process.env.SHOTS_QUARTIER) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const HEURE = 3600e3;
// le « vrai » temps du test : mercredi 14 octobre 2026, 10 h à Paris (le 2e jour de l'événement)
const DEPART = new Date('2026-10-14T10:00:00+02:00').getTime();
let decal = DEPART - Date.now();
const vrai = () => Date.now() + decal;
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };
function fauxTelephone(decalDepart) { // avant tout script de la page : une fausse heure du téléphone, gardée d'un chargement à l'autre
  let d = decalDepart;
  try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* about:blank */ }
  const D = Date;
  class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } }
  window.Date = FauxDate;
  window.__heureTel = (dec) => { d = dec; try { localStorage.setItem('test.tel', String(dec)); } catch (e) { /* rien */ } };
}

// ─── le faux Supabase (contrat v4) : 20 boulangers, dont 12 avec des billets du quartier ───
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const faux = { joueurs: new Map(), podium: null, appels: [] };
const lundi = () => CL.lundiParis(vrai());
{ const A = ['Mamie', 'Tonton', 'Petit', 'Grand', 'Super', 'Chef', 'Mitron', 'Madame', 'Papy', 'Cousin'], B = ['Jo', 'Brioche'];
  for (let i = 0; i < 20; i++) faux.joueurs.set(crypto.randomUUID(), { jeton: sha('x' + i), pseudo: `${A[i % 10]} ${B[Math.floor(i / 10)]}`, points: 40 - i, ptsTotal: 200 - 5 * i, total: 1e9 / (i + 1), gain: 1e8 / (i + 1), semaine: lundi(), maj: 0, quartier: i < 12 ? Math.round(3e12 / (i + 1)) : 0 }); }
const MOI = { id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex'), pseudo: 'Testeur Q' };
faux.joueurs.set(MOI.id, { jeton: sha(MOI.jeton), pseudo: MOI.pseudo, points: 12, ptsTotal: 12, total: 0, gain: 0, semaine: lundi(), maj: 0, quartier: 0 });
const borne = (ms) => { const f = Q.fenetre(ms); if (!f.ouvert && !f.fini) return 0; return 1e18; }; // (les vrais plafonds : test/fournil-classement-sql.cjs)
function rangs(id) {
  const j = faux.joueurs.get(id), tous = [...faux.joueurs.values()];
  return { rang_semaine: tous.filter((a) => a.points > j.points).length + 1, rang_total: tous.filter((a) => a.ptsTotal > j.ptsTotal).length + 1, rang_quartier: j.quartier > 0 ? tous.filter((a) => a.quartier > j.quartier).length + 1 : null, quartier: j.quartier, points_semaine: j.points, points_total: j.ptsTotal };
}
function figer() { if (faux.podium || vrai() < Q.FIN + HEURE) return; const l = [...faux.joueurs.entries()].filter(([, a]) => a.quartier > 0).sort((a, b) => b[1].quartier - a[1].quartier); faux.podium = new Map(l.slice(0, 3).map(([id, a], k) => [id, { rang: k + 1, pseudo: a.pseudo, valeur: a.quartier }])); }
const RPC = {
  fournil_publier: (c) => {
    figer();
    const j = faux.joueurs.get(c.p_id); if (!j || j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton', version: 4 };
    if (typeof c.p_quartier === 'number' && vrai() >= Q.DEBUT && vrai() < Q.FIN + HEURE) j.quartier = Math.max(j.quartier, Math.min(c.p_quartier, borne(vrai())));
    if (Number.isInteger(c.p_points) && c.p_lundi === lundi()) { const pc = Math.max(0, c.p_points - j.points); j.points += pc; j.ptsTotal += pc; }
    j.maj = Date.now();
    return { ok: true, erreur: null, version: 4, ...rangs(c.p_id), joueurs: faux.joueurs.size, joueurs_semaine: faux.joueurs.size, semaine: lundi(), compte: 0, plafonne: false, points_comptes: 0, points_plafonnes: false, quartier_plafonne: false };
  },
  fournil_classement: (c) => {
    figer();
    const qu = c.p_periode === 'quartier', sem = c.p_periode === 'semaine';
    const v = [...faux.joueurs.entries()].filter(([, a]) => !qu || a.quartier > 0).map(([id, a]) => ({ id, pseudo: a.pseudo, points: qu ? null : sem ? a.points : a.ptsTotal, valeur: qu ? a.quartier : sem ? a.gain : a.total, podium: qu && faux.podium && faux.podium.has(id) ? faux.podium.get(id).rang : null }));
    const cle = qu ? 'valeur' : 'points';
    v.sort((a, b) => b[cle] - a[cle] || a.pseudo.localeCompare(b.pseudo)); v.forEach((x) => { x.rang = v.filter((y) => y[cle] > x[cle]).length + 1; });
    const moi = v.find((x) => x.id === c.p_id), ligne = (x) => ({ rang: x.rang, pseudo: x.pseudo, points: x.points, valeur: x.valeur, moi: x.id === c.p_id, podium: x.podium });
    return { version: 4, semaine: lundi(), periode: c.p_periode, joueurs: v.length, lignes: v.slice(0, 50).map(ligne), moi: moi ? { rang: moi.rang, points: moi.points, valeur: moi.valeur, podium: moi.podium } : null };
  },
  fournil_retirer: (c) => { faux.joueurs.delete(c.p_id); return { ok: true, erreur: null }; },
  fournil_recompenses: (c) => { figer(); const j = faux.joueurs.get(c.p_id); if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton', podiums: [], derniere: null, quartier: null, quartier_podium: null }; return { ok: true, erreur: null, podiums: [], derniere: null, quartier: faux.podium && faux.podium.has(c.p_id) ? faux.podium.get(c.p_id).rang : null, quartier_podium: faux.podium ? [...faux.podium.values()] : null }; },
  fournil_heure: () => ({ ms: vrai() }),
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1]; let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps, t: Date.now() });
  if (!RPC[nom] || !corps) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps)) });
}

(async () => {
  const URL_JEU = `http://localhost:${PORT}/fournil/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(fauxTelephone, decal);
  await ctx.addInitScript((m) => { try { if (!localStorage.getItem('fournil.classement')) localStorage.setItem('fournil.classement', JSON.stringify({ id: m.id, jeton: m.jeton, pseudo: m.pseudo, rejoint: true })); } catch (e) { /* about:blank */ } }, MOI); // déjà inscrit au classement (le faux serveur connaît son identité)
  await ctx.route(SUPA + '/rest/v1/rpc/*', gerer);
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET|ERR_FAILED|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  // déjà inscrit au classement (le faux serveur connaît son identité)
  await page.goto('about:blank');
  const shot = async (nom) => { const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); };
  const pret = async () => { await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 20000 }); await sleep(800); };
  const charger = async () => { await page.goto(URL_JEU); await pret(); };
  const feuille = () => page.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const clic = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const pres = () => ev(() => { const d = GAME.detailPoints(window.__fournil.st); return { descente: d.aujourdhui.presence.descente, commande: d.aujourdhui.presence.commande, paliers: d.aujourdhui.paliers }; }); // les points de boulanger de la présence (lot 7)
  // Le barème du lot 7 (présence, paliers d'événement) démarre le lundi 26 octobre 2026 (G.BAREME_DEPUIS) : le test se joue au 14 octobre, donc au
  // barème d'avant, où ces coups de pouce ne rapportent aucun point de boulanger. On vérifie quand même que le jeu les marque (le branchement de
  // src/evenement.js : GAME.marquerPresence et GAME.marquerPalierEvt espionnés), et les points selon le barème de la semaine de l'heure du test.
  const NOUVEAU_Q = () => CL.lundiParis(vrai()) >= '2026-10-26', gainPres = () => (NOUVEAU_Q() ? 4 : 0), gainPalier = () => (NOUVEAU_Q() ? 3 : 0);
  const espion = () => ev(() => { const G = GAME; if (!G.__appels) { G.__appels = []; const m = G.marquerPresence, p = G.marquerPalierEvt; G.marquerPresence = (s, t) => { G.__appels.push(t); return m(s, t); }; G.marquerPalierEvt = (s) => { G.__appels.push('palier'); return p(s); }; } return G.__appels.slice(); });
  const qst = () => ev(() => { const q = window.__fournil.st.quartier; return q ? { majeur: q.majeur, masque: q.masque, annonce: q.annonce, bilan: q.bilan, billets: q.billets, total: q.total, postes: q.postes.map((p) => [p.niv, p.staff]), paliers: q.paliers.slice(), decos: q.decos.slice(), vetements: q.vetements.slice(), etoiles: q.etoiles, boosts: q.boosts, stats: q.stats, ev: q.ev && q.ev.type, lastSeen: q.lastSeen } : null; });
  const planque = () => ev(() => { const el = document.querySelector('#planque'); return { ouvert: !el.hidden, ecran: el.dataset.ecran, titre: document.querySelector('#pq-titre').textContent, sous: document.querySelector('#pq-sous').textContent, billets: document.querySelector('#pq-billets').textContent, taux: document.querySelector('#pq-taux').textContent, reste: document.querySelector('#pq-reste').textContent, paliers: document.querySelector('[data-pq="paliers"] b').textContent, cartes: [...document.querySelectorAll('#pq-cartes .carte[data-i]')].map((c) => c.className), ev: document.querySelector('#pq-ev').hidden ? '' : document.querySelector('#pq-ev').innerText, corps: document.querySelector('#pq-corps').innerText, calls: window.__fournil.evenement.scene ? window.__fournil.evenement.scene.calls : -1 }; });

  await charger();

  console.log('── le 2e jour de l’événement : l’icône, l’annonce, la porte 18+ ──');
  let c = await ev(() => window.__fournil.coin());
  check(c.quartier && c.classement, `l'icône ronde « Le Quartier » est là, sous Classement et Atelier (${JSON.stringify(c)})`);
  check(await ev(() => window.__fournil.Q.fenetre(HORLOGE.maintenant()).jour) === 2, 'le jeu est au jour 2 de l’événement (horloge de confiance, heure de Paris)');
  check(await attendre(async () => /Le Quartier ouvre ses portes/.test(await feuille())), 'l’annonce s’ouvre toute seule : « Le Quartier ouvre ses portes »');
  await shot('01-annonce');
  let s = await qst(); check(s && s.annonce === true && !s.majeur, 'annoncée une fois (notée dans la sauvegarde), la porte encore fermée');
  await clic('[data-a="pq-entrer"]'); await sleep(400);
  let p = await planque();
  check(p.ouvert && p.ecran === 'porte' && /18 ans et plus/.test(p.corps) && /Non, masquer/.test(p.corps), `la Planque s'ouvre sur la porte 18+ (${p.titre} · ${p.sous})`);
  await shot('02-porte');
  await clic('[data-pq="oui"]'); await sleep(900);
  p = await planque(); s = await qst();
  check(p.ecran === 'planque' && s.majeur && p.cartes.length === 8 && /Jour 2 sur 15/.test(p.sous), `on entre : huit cartes, « ${p.sous} », ${p.reste}`);
  { // les deux recettes d'après le boss, déjà visibles, fermées : « Après le palier 13 », « Après le palier 16 »
    const ap = await ev(() => [6, 7].map((i) => { const c = document.querySelector(`#pq-cartes .carte[data-i="${i}"]`); c.scrollIntoView({ block: 'end' }); const r = c.getBoundingClientRect(), b = c.querySelector('.pq-apres'), rb = b && b.getBoundingClientRect();
      return { cls: c.className, nom: c.querySelector('h3').textContent, txt: b ? b.textContent : '', btn: !!c.querySelector('button'), dans: r.left >= 0 && r.right <= innerWidth + 0.5 && (!rb || (rb.right <= r.right && rb.left >= r.left)) }; }));
    check(ap[0].nom === 'Sirop violet' && ap[0].txt === 'Après le palier 13' && ap[1].nom === 'Cristal bleu' && ap[1].txt === 'Après le palier 16' && ap.every((x) => /verrou/.test(x.cls) && /apres/.test(x.cls) && !x.btn && x.dans), `les recettes d’après le boss : « ${ap[0].nom} » (${ap[0].txt}), « ${ap[1].nom} » (${ap[1].txt}), sans bouton, dans l’écran`);
    await sleep(3500); await photoR(page, 'quartier-carte-apres-palier-13'); // le toast de bienvenue s'en va
    await clic('#pq-cartes .carte[data-i="6"] h3'); await sleep(150);
    check((await ev(() => window.__fournil.st.quartier.postes[6].niv)) === 0, 'toucher la carte fermée ne débloque rien');
    await ev(() => document.querySelector('#pq-cartes').scrollTo(0, 0)); await sleep(150); }
  check(p.calls > 0 && p.calls <= 40, `le décor 3D de la Planque tourne : ${p.calls} appels de dessin (≤ 40)`);
  await shot('03-planque');

  console.log('── jouer dans la Planque ──');
  check(/^0 €/.test(p.billets) && p.cartes[0].includes('manuel') && p.cartes[1].includes('verrou'), 'zéro billet, l’herbe à la main, le shit verrouillé');
  await page.evaluate(() => { const b = document.querySelector('#pq-cartes .carte[data-i] .barre'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await sleep(2600);
  s = await qst(); p = await planque();
  check(s.billets > 0 && s.stats.taps === 1 && s.stats.ventes === 1 && !/^0 €/.test(p.billets), `une touche sur l'herbe : un sachet vendu, ${p.billets} (×1,5 à la main × ${Q.PRESENCE} le boss)`);
  await ev(() => { window.__fournil.st.quartier.billets += 5e4; });
  await page.evaluate(() => document.querySelector('#pq-cartes .carte[data-i="1"] [data-a="debloquer"]').click()); await sleep(300);
  await page.evaluate(() => document.querySelector('#pq-cartes .carte[data-i="0"] [data-a="embaucher"]').click()); await sleep(300);
  s = await qst();
  check(s.postes[1][0] === 1 && s.postes[0][1] === true && s.stats.embauches === 1, 'le shit débloqué, Guetteur Kévin embauché sur l’herbe');
  await sleep(1600); s = await qst(); p = await planque();
  check(s.stats.ventes > 1 && /\/s · le boss/.test(p.taux), `l'apprenti vend tout seul : ${p.taux}`);
  await clic('[data-pq="ameliorations"]'); await sleep(300);
  check(/Les combines/.test(await feuille()) && /Sachets zippés/.test(await feuille()), 'la feuille des combines (améliorations)');
  await ev(() => { window.__fournil.st.quartier.billets += 1e5; });
  await clic('#feuille [data-id="sachets"]'); await sleep(300);
  s = await ev(() => window.__fournil.st.quartier.ameliorations); check(s.sachets === true, 'Sachets zippés achetés');
  await shot('04-combines'); await clic('#feuille [data-a="pq-retour"]'); await sleep(300);

  console.log('── les coups de pouce ──');
  await ev(() => { const Qd = window.__fournil.Q, q = window.__fournil.st.quartier; q.evTimer = 9999; Qd.lancerEvenement(q, Math.random, 'descente'); });
  await sleep(300); p = await planque();
  check(/Descente de police/.test(p.ev) && /Planque/.test(p.ev), `la bannière de la descente : ${p.ev.split('\n')[0]}`);
  await shot('05-descente');
  const b0 = (await qst()).billets, pts0 = await pres(), app0 = (await espion()).length;
  for (let k = 0; k < 12; k++) { await page.evaluate(() => { const b = document.querySelector('#pq-ev [data-a="planquer"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); await sleep(40); }
  await sleep(300); s = await qst();
  check(s.ev === null && s.stats.descentes === 1 && s.billets > b0, 'douze touches : tout est planqué, la prime est tombée');
  { const a = (await espion()).slice(app0); check(a.join() === 'descente' && (await pres()).descente === pts0.descente + gainPres(), `la descente évitée : marquée (marquerPresence « descente »), +${gainPres()} point${gainPres() > 1 ? 's' : ''} de boulanger (${NOUVEAU_Q() ? 'présence, lot 7' : 'le 14 octobre, barème d’avant le 26 : la présence ne compte pas encore'})`); }
  await ev(() => { const Qd = window.__fournil.Q, q = window.__fournil.st.quartier; Qd.lancerEvenement(q, Math.random, 'scooter'); });
  await sleep(300); p = await planque(); check(/livreur/.test(p.ev), 'le livreur en scooter passe');
  await clic('#pq-ev [data-a="attraper"]'); await sleep(300); s = await qst();
  check(s.ev === null && s.stats.scooters === 1, 'le bonus est attrapé');
  await ev(() => { const Qd = window.__fournil.Q, q = window.__fournil.st.quartier; Qd.lancerEvenement(q, Math.random, 'soiree'); });
  await sleep(300); p = await planque();
  check(/Soirée/.test(p.ev) && await ev(() => window.__fournil.Q.boostMult(window.__fournil.st.quartier)) === Q.PRESENCE * 2, 'la soirée : toutes les ventes ×2');
  await ev(() => { const Qd = window.__fournil.Q, q = window.__fournil.st.quartier; q.ev = null; Qd.lancerEvenement(q, () => 0, 'grosclient'); q.ev.fait = q.ev.n; });
  await sleep(300); p = await planque();
  check(/gros client/i.test(p.ev) && /Livrer/.test(p.ev), 'le gros client, sa commande prête');
  await shot('06-grosclient');
  const pts1 = await pres(), app1 = (await espion()).length;
  await clic('#pq-ev [data-a="livrer"]'); await sleep(300); s = await qst();
  check(s.ev === null && s.stats.grosClients === 1, 'livré');
  { const a = (await espion()).slice(app1); check(a.join() === 'commande' && (await pres()).commande === pts1.commande + gainPres(), `le gros client livré : marqué (marquerPresence « commande »), +${gainPres()} point${gainPres() > 1 ? 's' : ''} de boulanger (${NOUVEAU_Q() ? 'grosse commande, lot 7' : 'barème d’avant le 26 octobre'})`); }

  console.log('── les paliers et leurs récompenses pour la boulangerie ──');
  const avant = await ev(() => ({ etoiles: window.__fournil.st.etoiles, reserve: window.__fournil.st.boosts.reserve.length })), pts2 = await pres(), app2 = (await espion()).length;
  await ev((t) => { const q = window.__fournil.st.quartier; q.billets += t - q.total; q.total = t; }, Q.PALIERS[3].total);
  await attendre(async () => /Palier 1/.test(await feuille()));
  check(/Palier 1 · Premiers billets/.test(await feuille()) && /étoile/.test(await feuille()) && /boost ×2/.test(await feuille()), 'le palier 1 est annoncé : une étoile, un boost ×2 en réserve');
  await shot('07-palier');
  s = await qst();
  { const a = (await espion()).slice(app2), pa = (await pres()).paliers; check(a.filter((x) => x === 'palier').length === 4 && pa === Math.min(12, pts2.paliers + 4 * gainPalier()), `quatre paliers franchis : marqués quatre fois (marquerPalierEvt) ; ${NOUVEAU_Q() ? '+3 points de boulanger chacun, 12 au plus par jour (lot 7' : 'aucun point de boulanger (barème d’avant le 26 octobre'} : ${pa})`); }
  check(s.paliers.join() === '1,2,3,4' && s.decos.join() === 'graffiti' && s.vetements.join() === 'quartier-casquette' && s.etoiles === 3 && s.boosts === 2, `les paliers 1 à 4 sont marqués d'un coup : ${JSON.stringify({ decos: s.decos, vetements: s.vetements, etoiles: s.etoiles, boosts: s.boosts })}`);
  const apres = await ev(() => ({ etoiles: window.__fournil.st.etoiles, reserve: window.__fournil.st.boosts.reserve.map((b) => b.mult + ':' + b.secs), casquette: window.__fournil.G.possede ? window.__fournil.G.possede(window.__fournil.st, 'quartier-casquette') : null }));
  check(apres.etoiles === avant.etoiles + 3 && apres.reserve.join() === '2:1800,2:1800', `la boulangerie a reçu 3 étoiles et deux boosts ×2 de 30 min (${JSON.stringify(apres)})`);
  check(apres.casquette === true || apres.casquette === null, apres.casquette === null ? 'la garde-robe n’est pas encore là : la casquette attend dans st.quartier.vetements' : 'la casquette du quartier est dans la garde-robe');
  for (let k = 0; k < 4; k++) { await clic('#feuille [data-a="pq-ok"]'); await sleep(450); }
  check((await feuille()) === '', 'les quatre annonces de palier passent l’une après l’autre');
  p = await planque(); check(p.paliers === '4/12', `le bouton des paliers : ${p.paliers}`);
  await clic('[data-pq="paliers"]'); await sleep(300);
  check(/Les paliers/.test(await feuille()) && (await feuille()).split('✓').length === 5, 'la feuille des paliers : quatre cochés');
  await shot('08-paliers'); await clic('#feuille [data-a="pq-retour"]'); await sleep(200);

  console.log('── retour dans la boulangerie : la réserve de boosts, les décos du quartier ──');
  await clic('[data-pq="fermer"]'); await sleep(1200);
  p = await planque(); s = await qst();
  check(!p.ouvert && s.lastSeen > 0 && await ev(() => !window.__fournil.evenement.scene), 'la Planque se ferme (son décor 3D est libéré), la dernière visite est notée');
  let bo = await ev(() => { const el = document.querySelector('#boosts'); return { hidden: el.hidden, txt: el.innerText, cls: el.className }; });
  check(!bo.hidden && /Boost ×2/.test(bo.txt) && /2 boosts en réserve/.test(bo.txt) && /Lancer/.test(bo.txt), `la pastille des boosts sous les objectifs : ${bo.txt.replace(/\n/g, ' · ')}`);
  await shot('09-boutique-boosts');
  await clic('#boosts'); await sleep(300);
  check(/La réserve de boosts/.test(await feuille()), 'deux boosts : on choisit lequel lancer');
  await clic('#feuille [data-k="0"]'); await sleep(400);
  bo = await ev(() => { const el = document.querySelector('#boosts'), st = window.__fournil.st; return { txt: el.innerText, cls: el.className, actif: st.boosts.actif && st.boosts.actif.mult, reserve: st.boosts.reserve.length, mult: window.__fournil.G.boostMult(st), taux: document.querySelector('#taux').innerText }; });
  check(bo.actif === 2 && bo.reserve === 1 && bo.mult >= 2 && /en cours/.test(bo.txt) && /actif/.test(bo.cls), `le boost ×2 tourne : ${bo.txt.replace(/\n/g, ' · ')} ; les ventes ×${bo.mult}`);
  const decos = await ev(() => window.__fournil.SCENE.decosVues);
  check(decos.includes('graffiti'), `la boutique porte les décos du quartier : ${decos.join(', ') || 'aucune'} (le graffiti sur la porte)`);
  await ev(() => { window.__fournil.SCENE.decosQuartier(['graffiti', 'neon', 'scooter', 'chien']); }); await sleep(900);
  const decos4 = await ev(() => window.__fournil.SCENE.decosVues);
  check(decos4.length === 4, `les quatre décos posées pour la capture : ${decos4.join(', ')}`);
  await ev(() => window.__fournil.tiroir('ferme')); await sleep(600);
  await shot('10-boutique-decos');
  await ev(() => { window.__fournil.SCENE.decosQuartier(window.__fournil.st.quartier.decos); window.__fournil.tiroir('mi'); });
  const stats = await ev(() => window.__fournil.stats());
  check(stats.calls > 0 && stats.calls <= 90, `le budget d'appels de dessin de la boutique tient avec les décos : ${stats.calls}`);

  console.log('── les gains d’absence de la Planque : 8 h au plus, au ralenti ──');
  await ev(() => { window.__fournil.st.quartier.lastSeen = HORLOGE.maintenant() - 30 * 3600e3; });
  const bAv = (await qst()).billets, tauxQ = await ev(() => window.__fournil.Q.tauxBase(window.__fournil.st.quartier));
  await ev(() => window.__fournil.quartier()); await sleep(900);
  s = await qst();
  const gagne = s.billets - bAv, attendu = tauxQ * 8 * 3600 * Q.ABSENCE_PART;
  check(s.billets > bAv && Math.abs(gagne - attendu) / attendu < 0.05, `30 h d'absence : ${Q.fmt(gagne)} € de billets, soit 8 h au ralenti (${Q.fmt(attendu)} attendus)`);
  check(await attendre(() => page.evaluate(() => !!document.querySelector('.toast') && /absence/.test(document.querySelector('.toast').textContent)), 2000), 'le message « Pendant ton absence » (au ralenti sans le boss)');
  { // le téléphone verrouillé Planque ouverte, puis le retour : les apprentis ont bossé (evenement.retour, appelé au retour dans le jeu)
    const b1 = (await qst()).billets, r = await ev(() => { window.__fournil.st.quartier.lastSeen = HORLOGE.maintenant() - 2 * 3600e3; const a = window.__fournil.evenement.retour(); return a && { secs: a.secs, total: a.total }; });
    const b2 = (await qst()).billets;
    check(r && Math.abs(r.secs - 7200) < 5 && r.total > 0 && b2 >= b1 + r.total * 0.99, `retour dans le jeu, Planque ouverte : 2 h payées au ralenti (+${Q.fmt(r ? r.total : 0)} €)`);
  }
  { // l'heure sûre fait sauter le jeu de 2 h, Planque ouverte (le serveur a avancé : HORLOGE.synchroniser lit son en-tête Date) : ui.js payerSaut
    // paie la boulangerie, et l'écran ouvert aussi (evenement.saut) : 2 h au ralenti, comme une absence ; avant, la Planque ne touchait qu'un pas
    await ev(() => { const e = window.__fournil.evenement, s0 = e.saut; window.__sautEv = null; window.__sautAvant = s0; e.saut = (ms) => { const r = s0(ms); window.__sautEv = r && { secs: r.secs, total: r.total, ms }; return r; }; });
    const b1 = (await qst()).billets, tauxS = await ev(() => window.__fournil.Q.tauxBase(window.__fournil.st.quartier));
    decal += 2 * HEURE; const lu = await ev(() => HORLOGE.synchroniser()); await sleep(600);
    const r = await ev(() => window.__sautEv), b2 = (await qst()).billets, attendu2 = tauxS * 2 * 3600 * Q.ABSENCE_PART;
    check(lu && r && Math.abs(r.ms - 2 * HEURE) < 10e3 && Math.abs(r.secs - 7200) < 10 && Math.abs(r.total - attendu2) / attendu2 < 0.05 && b2 >= b1 + r.total * 0.99,
      `un saut de l’heure sûre de 2 h, Planque ouverte : la Planque est payée elle aussi, au ralenti (+${Q.fmt(r ? r.total : 0)} €, ${Q.fmt(attendu2)} attendus)`);
    const jr = await ev(() => (window.__fournil.st.journalRetours || []).slice(-1)[0]);
    check(jr && jr.r === 'heure' && Math.abs(jr.s - 7200) < 10 && (await planque()).ecran === 'planque', `la boulangerie aussi, pour le même temps (le journal des retours : « heure », ${jr && Math.round(jr.s / 60)} min), et la Planque reste ouverte`);
    await ev(() => { window.__fournil.evenement.saut = window.__sautAvant; const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); }); await sleep(400); }
  await clic('[data-pq="fermer"]'); await sleep(300);

  console.log('── l’événement de la boutique en pause sous la Planque ──');
  { // un pétrissage (20 s) lancé, la Planque ouverte 30 s puis refermée : il a encore son temps (en pause sous l'écran, comme une courte
    // sortie) ; le coup de feu, lui, ne demande rien : il continue de s'écouler (ses ventes ×3 ont lieu sous l'écran)
    const evB = () => ev(() => { const st = window.__fournil.st; return st.ev ? { type: st.ev.type, reste: st.ev.fin - HORLOGE.maintenant() } : null; });
    await ev(() => { const st = window.__fournil.st; st.ev = null; st.evTimer = 9999; window.__fournil.ev('petrissage'); });
    const e0 = await evB();
    await ev(() => window.__fournil.quartier()); await sleep(30000);
    check((await planque()).ecran === 'planque', 'la Planque est restée ouverte 30 s');
    await clic('[data-pq="fermer"]'); const e1 = await evB();
    check(e0 && e0.type === 'petrissage' && e1 && e1.type === 'petrissage' && e1.reste > e0.reste - 3000, `le pétrissage a encore son temps en sortant de la Planque (${e0 && Math.round(e0.reste / 1000)} s avant, ${e1 && Math.round(e1.reste / 1000)} s après 30 s dessous)`);
    // une panne lancée juste avant d'ouvrir la Planque : en pause elle aussi (sa prime attend), mais elle n'arrête pas son four sous l'écran
    // (comme une courte sortie, G.absence) : le poste en panne a cuit et vendu pendant les 30 s, et la panne a encore son temps en sortant
    const xpP = () => ev(() => { const f = window.__fournil, st = f.st, ev0 = st.ev; return ev0 && ev0.type === 'panne' ? { i: ev0.i, xp: ((st.apprentis || {})[f.G.PRODUITS[ev0.i].id] || { xp: 0 }).xp, reste: ev0.fin - HORLOGE.maintenant() } : null; });
    await ev(() => { const f = window.__fournil, st = f.st; st.ev = null; st.evTimer = 9999; const s0 = st.stations[0]; window.__poste0 = { ...s0 }; s0.niv = Math.max(1, s0.niv); s0.staff = true; s0.actif = true; f.G.lancerPanne(st, () => 0); });
    const p0 = await xpP(); await ev(() => window.__fournil.quartier()); await sleep(30000);
    await clic('[data-pq="fermer"]'); const p1 = await xpP();
    check(p0 && p1 && p1.i === p0.i && p1.xp > p0.xp && p1.reste > p0.reste - 3000, `une panne puis 30 s de Planque : le poste en panne a vendu dessous (expérience de l’apprenti ${p0 && Math.round(p0.xp)} → ${p1 && Math.round(p1.xp)}), et la panne a encore son temps (${p0 && Math.round(p0.reste / 1000)} s, puis ${p1 && Math.round(p1.reste / 1000)} s)`);
    await ev(() => { const st = window.__fournil.st; Object.assign(st.stations[0], window.__poste0); }); // le poste tel qu'il était : la suite (l'absence, le bilan) ne change pas
    await ev(() => { const st = window.__fournil.st; st.ev = null; window.__fournil.ev('rush'); });
    const r0 = await evB(); await ev(() => window.__fournil.quartier()); await sleep(4000); await clic('[data-pq="fermer"]'); const r1 = await evB();
    check(r0 && r0.type === 'rush' && r1 && r1.type === 'rush' && r0.reste - r1.reste >= 3500, `le coup de feu, lui, s’écoule sous l’écran (${Math.round(r0.reste / 1000)} s, puis ${r1 && Math.round(r1.reste / 1000)} s)`);
    await ev(() => { const st = window.__fournil.st; st.ev = null; st.evTimer = 200; }); await sleep(300); }

  console.log('── Réglages : masquer l’événement ──');
  await ev(() => window.__fournil.page('reglages')); await sleep(300);
  check(await ev(() => !!document.querySelector('[data-a="quartier"]')), 'la ligne « Masquer l’événement » est dans les Réglages pendant l’événement');
  await shot('11-reglages');
  await clic('[data-a="quartier"]'); await sleep(300);
  s = await qst(); c = await ev(() => window.__fournil.coin());
  check(s.masque === true && !c.quartier, 'masqué : l’icône du coin disparaît');
  check(await ev(() => window.__fournil.quartier()) === false, 'et la Planque refuse de s’ouvrir');
  await clic('[data-a="quartier"]'); await sleep(300);
  c = await ev(() => window.__fournil.coin()); check(c.quartier, 'démasqué : l’icône revient');
  await ev(() => window.__fournil.page('boutique'));

  console.log('── le classement : l’onglet Événement ──');
  // le moteur n'envoie jamais deux fois en 15 s (REGLES.ecartMin, relu du stockage partagé par les fenêtres : remettre essai à 0 en mémoire ne
  // suffit pas) ; un envoi périodique vient peut-être de partir (le saut de 2 h l'a rendu dû) : on attend que les 15 s soient passées
  { const der = faux.appels.filter((a) => a.nom === 'fournil_publier').pop(); if (der) await sleep(Math.max(0, der.t + CL.REGLES.ecartMin + 1000 - Date.now())); }
  await ev(() => { window.__fournil.st.quartier.total = 7e11; const e = window.__fournil.classement().etat(); e.essai = 0; e.dernierEnvoi = 0; });
  await ev(() => window.__fournil.feuilleClassement('quartier'));
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille-contenu .cl-liste'))), 'la liste se charge');
  // l'envoi de ses billets, puis la liste relue : on attend qu'il parte, au lieu d'un temps fixe
  await attendre(() => faux.appels.some((a) => a.nom === 'fournil_publier' && a.corps && a.corps.p_quartier === 7e11), 15000); await sleep(500);
  let txt = await feuille();
  check(/Événement/.test(txt) && /billets/.test(txt) && /podium final le 27 oct/.test(txt), 'l’onglet Événement : les billets de la Planque, le podium final annoncé');
  const envoi = faux.appels.filter((a) => a.nom === 'fournil_publier' && a.corps && 'p_quartier' in a.corps).pop();
  check(envoi && envoi.corps.p_quartier === 7e11, `ses billets partent avec fournil_publier (p_quartier = ${envoi && envoi.corps.p_quartier})`);
  txt = await feuille();
  check(/Testeur Q/.test(txt) && /toi/.test(txt), 'sa ligne « Testeur Q » est dans le classement de l’événement');
  await shot('12-classement-evenement');
  await ev(() => window.__fournil.classement().etat().valeur); // (rien : on vérifie seulement que l'état se lit)
  await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });

  console.log('── le classement depuis la Planque ──');
  await ev(() => window.__fournil.quartier()); await sleep(800);
  const bcl = await ev(() => { const b = document.querySelector('#planque [data-pq="classement"]'); const r = b && b.getBoundingClientRect(); return b && { vu: !b.hidden && r.width > 0, txt: b.textContent.trim(), h: Math.round(r.height), droite: Math.round(r.right) <= innerWidth }; });
  check(bcl && bcl.vu && /^\d+(er|e)$/.test(bcl.txt) && bcl.droite, `la Planque montre son rang au classement de l’événement en haut (« ${bcl && bcl.txt} »)`);
  await shot('12b-planque-classement');
  await clic('#planque [data-pq="classement"]');
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille-contenu .cl-liste') && /actif/.test((document.querySelector('#feuille [data-tab="quartier"]') || {}).className || ''))), 'le bouton ouvre le classement sur l’onglet Événement, par-dessus la Planque');
  await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); }); await sleep(300);
  check(await ev(() => !document.querySelector('#planque').hidden), 'la feuille refermée : on est toujours dans la Planque');
  await clic('[data-pq="fermer"]'); await sleep(300);

  console.log('── la fin de l’événement : la Planque fermée, le bilan, l’icône partie, le podium final ──');
  faux.joueurs.get(MOI.id).quartier = 5e12; // ses derniers billets le mettent en tête : le podium final (figé à la première requête après la fin) sera le sien
  decal = Q.FIN + 3 * HEURE - Date.now();
  await page.evaluate((d) => localStorage.setItem('test.tel', String(d)), decal); // l'heure du prochain lancement : la page ouverte ne la voit pas (sinon c'est un réveil, test/fournil-reveil.cjs)
  const avantFin = await ev((fin) => { const q = window.__fournil.st.quartier; q.lastSeen = fin - 2 * 3600e3; return q.total; }, Q.FIN); // parti 2 h avant la fermeture
  await page.evaluate(() => window.__fournil.save());
  await charger();
  c = await ev(() => window.__fournil.coin());
  check(!c.quartier, 'après la fin : plus d’icône du Quartier');
  check(await attendre(async () => (await planque()).ecran === 'bilan', 6000), 'le bilan s’ouvre tout seul : « La Planque a fermé »');
  p = await planque();
  check(/Bilan du quartier/.test(p.corps) && /paliers/.test(p.corps) && /Ce qui reste à vie/.test(p.corps) && /étoile/.test(p.corps), `le bilan : ${p.corps.split('\n').slice(0, 4).join(' / ')}`);
  await shot('13-bilan');
  { const q2 = await qst(); check(q2.total > avantFin && q2.lastSeen === Q.FIN, `parti 2 h avant la fermeture, revenu après : les apprentis ont travaillé jusqu’à la fermeture (+${Math.round(q2.total - avantFin)} billets), pas au-delà`); }
  await clic('[data-pq="fin"]'); await sleep(400);
  s = await qst(); p = await planque();
  check(!p.ouvert && s.bilan === true, 'refermé : le bilan ne reviendra plus');
  check(await ev(() => window.__fournil.quartier()) === true && (await planque()).ecran === 'bilan', 'on peut le rouvrir à la main (fini : toujours le bilan)');
  await clic('[data-pq="fin"]'); await sleep(300);
  const boostsApres = await ev(() => ({ reserve: window.__fournil.st.boosts.reserve.length, etoiles: window.__fournil.st.etoiles, decos: window.__fournil.st.quartier.decos.length }));
  check(boostsApres.reserve === 1 && boostsApres.etoiles === apres.etoiles && boostsApres.decos === 1, 'tout le reste reste : le boost en réserve, les étoiles, les décos');
  const reg = await ev(() => { window.__fournil.page('reglages'); return !!document.querySelector('[data-a="quartier"]'); });
  check(!reg, 'les Réglages n’ont plus la ligne « Masquer l’événement »');
  await ev(() => { const e = window.__fournil.classement().etat(); e.essai = 0; e.dernierEnvoi = 0; window.__fournil.feuilleClassement('quartier'); });
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille-contenu .cl-liste'))), 'le classement de l’événement se lit encore');
  await sleep(800); txt = await feuille();
  check(/fini : le podium final est figé/.test(txt) && /1er du Quartier/.test(txt), 'l’onglet Événement montre le podium final figé');
  await shot('14-podium-final');
  const rq = await page.evaluate(async () => { const r = await window.__fournil.classement().chargerRecompenses({ ecart: 0 }); window.__fournil.majRecompenses(); return { etat: r && r.etat, quartier: window.__fournil.classement().recompenses().quartier }; });
  check(rq.quartier === 1, `fournil_recompenses : 1er du podium final du quartier (${JSON.stringify(rq)})`);
  const or = await ev(() => ['quartier-or-casquette', 'quartier-or-sweat', 'quartier-or-baskets', 'quartier-or-chaine'].map((id) => window.__fournil.G.possede(window.__fournil.st, id)));
  check(or.every(Boolean), `1er du podium final : les quatre pièces de la tenue du quartier en or sont dans la garde-robe (${JSON.stringify(or)})`);
  const tard = faux.appels.filter((a) => a.nom === 'fournil_publier').pop();
  check(!tard || !('p_quartier' in tard.corps), 'après la fin, le téléphone n’envoie plus de billets');

  { // masqué (même après la fin) : le classement n'a plus d'onglet Événement
    await ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.st.quartier.masque = true; }); await sleep(400);
    await ev(() => window.__fournil.feuilleClassement('quartier')); await sleep(600);
    check(await ev(() => document.querySelectorAll('#feuille [data-tab]').length > 0 && !document.querySelector('#feuille [data-tab="quartier"]')), 'masqué : le classement n’a plus d’onglet Événement');
  }

  console.log('── après le boss : une sauvegarde déjà au 12e, à la mise à jour (le 15 octobre, 3e jour) ──');
  { decal = new Date('2026-10-15T10:00:00+02:00').getTime() - Date.now();
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx2.addInitScript(fauxTelephone, decal); await ctx2.route(SUPA + '/rest/v1/rpc/*', gerer);
    const pg = await ctx2.newPage(); pg.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    const ev2 = (fn, arg) => pg.evaluate(fn, arg), clic2 = (sel) => pg.evaluate((x) => { const b = document.querySelector(x); if (!b) return false; b.click(); return true; }, sel);
    const feuille2 = () => pg.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    const shot2 = async (nom) => { const f = path.join(out, nom + '.png'); await pg.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); };
    const charger2 = async () => { await pg.goto(URL_JEU); await pg.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 20000 }); await sleep(800); };
    await pg.goto('about:blank'); await charger2();
    // la sauvegarde d'avant la mise à jour : déjà entré, annonce vue, 4 000 Bn gagnés et les douze paliers reçus (ce que donnait l'ancienne version)
    const av = await ev2(() => { const F = window.__fournil, Qd = F.Q, st = F.st, q = Qd.etat(st, HORLOGE.maintenant()); q.majeur = true; q.annonce = true; Qd.gagner(q, 4e15); q.billets = 1e14; for (let k = 1; k <= 12; k++) Qd.marquerPalier(q, k); q.lastSeen = HORLOGE.maintenant(); F.save();
      return { etoiles: st.etoiles, reserve: st.boosts.reserve.length, paliers: q.paliers.length, dus: Qd.paliersDus(q).map((p) => p.n).join() }; });
    check(av.paliers === 12 && av.dus === '13,14', 'la sauvegarde d’avant : douze paliers reçus, 4 000 Bn de billets (au-delà des 13e et 14e, pas encore donnés)');
    await charger2();
    check(await attendre(async () => /Palier 13/.test(await feuille2()), 20000), 'dans la boutique, sans ouvrir la Planque : la feuille « Palier 13 » arrive toute seule');
    let f2 = await feuille2();
    check(/Après le boss, ça continue/.test(f2) && /boost ×5/.test(f2) && /4 h de ses gains/.test(f2), `le palier 13 (2 étoiles, un ×5, 4 h de gains) : ${f2.split('\n').slice(0, 2).join(' · ')}`);
    await shot2('b1-palier-13-boutique');
    await clic2('#feuille [data-a="pq-ok"]'); await attendre(async () => /Palier 14/.test(await feuille2()), 3000);
    check(/Palier 14/.test(await feuille2()) && /2 étoiles/.test(await feuille2()) && /6 h de ses gains/.test(await feuille2()), 'puis le palier 14 : deux étoiles et 6 h de gains');
    await clic2('#feuille [data-a="pq-ok"]'); await sleep(700);
    let ap = await ev2(() => ({ etoiles: window.__fournil.st.etoiles, reserve: window.__fournil.st.boosts.reserve.length, paliers: window.__fournil.st.quartier.paliers.slice(), feuille: !document.querySelector('#feuille').hidden }));
    check(ap.paliers.join() === '1,2,3,4,5,6,7,8,9,10,11,12,13,14' && ap.etoiles === av.etoiles + 4 && ap.reserve === av.reserve + 1 && !ap.feuille, `donnés une fois : +4 étoiles, +1 boost en réserve (${JSON.stringify({ etoiles: ap.etoiles, reserve: ap.reserve })})`);
    await ev2(() => window.__fournil.annoncerEvenements(true)); await sleep(600);
    check((await feuille2()) === '' && (await ev2(() => window.__fournil.st.etoiles)) === ap.etoiles, 'une seconde annonce ne redonne rien');
    // la Planque : la liste « Après le boss »
    await ev2(() => window.__fournil.quartier()); await sleep(900);
    check(await ev2(() => document.querySelector('[data-pq="paliers"] b').textContent) === '14/20', 'le bouton des paliers passe à « 14/20 » une fois le boss franchi');
    await clic2('[data-pq="paliers"]'); await sleep(400);
    const lis = await ev2(() => { const h = document.querySelector('#feuille .pq-inter'), f = document.querySelector('#feuille'); if (!h) return null; h.scrollIntoView({ block: 'start' }); f.scrollTop -= 40;
      const r = h.getBoundingClientRect(), cs = getComputedStyle(h), lignes = [...document.querySelectorAll('#feuille .pq-palier.bonus')];
      return { txt: h.textContent, h: r.height, gauche: r.left, droite: r.right, taille: parseFloat(cs.fontSize), n: lignes.length, deborde: lignes.some((l) => l.getBoundingClientRect().right > innerWidth + 0.5 || l.scrollWidth > l.clientWidth + 1), horiz: f.scrollWidth > f.clientWidth + 1, nums: lignes.map((l) => l.querySelector('.pq-num').textContent).join(), recus: lignes.filter((l) => /✓/.test(l.textContent)).length, sous: (document.querySelector('#feuille .pq-inter-sous') || {}).textContent, titreTaille: Math.min(...lignes.map((l) => parseFloat(getComputedStyle(l.querySelector('b')).fontSize))) }; });
    check(lis && lis.txt === 'Après le boss' && lis.h > 10 && lis.gauche >= 0 && lis.droite <= 390 && lis.taille >= 14, `l’intertitre « ${lis && lis.txt} » est là, dans l’écran (${lis && Math.round(lis.gauche)}–${lis && Math.round(lis.droite)} px, ${lis && lis.taille} px)`);
    check(lis && lis.n === 8 && lis.nums === '13,14,15,16,17,18,19,20' && lis.recus === 2 && !lis.deborde && !lis.horiz && lis.titreTaille >= 13, `dessous, les paliers 13 à 20 (13 et 14 cochés), sans déborder à 390 px : ${lis && lis.sous}`);
    await sleep(300); await shot2('b2-paliers-apres-le-boss');
    await ev2(() => { const l = [...document.querySelectorAll('#feuille .pq-palier.bonus')].pop(); l.scrollIntoView({ block: 'end' }); }); await sleep(200);
    await shot2('b3-paliers-20');
    await clic2('#feuille [data-a="pq-retour"]'); await sleep(300);
    // les combines en plus
    await clic2('[data-pq="ameliorations"]'); await sleep(400);
    f2 = await feuille2();
    check(/Après le boss/.test(f2) && /Guetteurs sur les toits/.test(f2) && /Trottinette électrique/.test(f2) && !/de plus après le palier/.test(f2), 'les combines : les quatre nouvelles apparaissent sous « Après le boss »');
    const am = await ev2(() => { const l = [...document.querySelectorAll('#feuille .am.bonus')]; l[0].scrollIntoView({ block: 'center' }); return { n: l.length, deborde: l.some((x) => x.getBoundingClientRect().right > innerWidth + 0.5) }; });
    check(am.n === 6 && !am.deborde && /1 combine de plus à partir du palier 16/.test(f2) && /Le Grossiste/.test(f2) && /Gobelets à double fond/.test(f2), 'six lignes (le Grossiste et la combine du sirop compris, celle du cristal attend le 16e), sans déborder');
    await ev2(() => { window.__fournil.st.quartier.billets = 3e15; }); await clic2('#feuille [data-id="guetteurs"]'); await sleep(400);
    check(await ev2(() => window.__fournil.st.quartier.ameliorations.guetteurs === true), 'les guetteurs s’achètent (1 Bd)');
    await ev2(() => { const l = [...document.querySelectorAll('#feuille .am.bonus')]; if (l[0]) l[0].scrollIntoView({ block: 'center' }); }); await sleep(200);
    await shot2('b4-combines-apres-le-boss');
    await clic2('#feuille [data-a="pq-retour"]'); await sleep(300);
    // les recettes d'après le boss : le sirop violet (palier 13 franchi) se débloque, son apprenti, sa combine ×3 ; le Grossiste divise le prix d'un niveau par deux
    { const carte = (i) => ev2((k) => { const c = document.querySelector(`#pq-cartes .carte[data-i="${k}"]`); c.scrollIntoView({ block: 'center' }); const b = c.querySelector('[data-a="ameliorer"] b, [data-a="debloquer"] b'), s = c.querySelector('[data-a="ameliorer"] small');
        return { cls: c.className, txt: c.innerText.replace(/\s+/g, ' '), prix: b ? b.textContent : '', petit: s ? s.textContent : '', pal: (c.querySelector('.palier span') || {}).textContent || '', staff: (c.querySelector('.staff-ok') || {}).textContent || '' }; }, i);
      await ev2(() => { const q = window.__fournil.st.quartier; [1, 2, 3, 4, 5].forEach((i) => { q.postes[i].niv = 150; q.postes[i].staff = true; q.postes[i].actif = true; }); }); await sleep(400); // ses six premiers postes ouverts
      let c6 = await carte(6), c7 = await carte(7);
      check(/verrou/.test(c6.cls) && !/apres/.test(c6.cls) && /Débloquer/.test(c6.txt) && /Après le palier 16/.test(c7.txt), `le 13e franchi : le sirop violet se débloque (${c6.prix}) ; le cristal bleu attend le 16e`);
      await ev2(() => { window.__fournil.st.quartier.billets = 1e15; }); await clic2('#pq-cartes .carte[data-i="6"] [data-a="debloquer"]'); await sleep(400);
      await clic2('#pq-cartes .carte[data-i="6"] [data-a="embaucher"]'); await sleep(400);
      c6 = await carte(6);
      check(!/verrou/.test(c6.cls) && /auto/.test(c6.cls) && c6.staff === 'Pharmacien Gérard' && /Palier 25 ×2/.test(c6.pal), `débloqué, ${c6.staff} embauché ; « ${c6.pal} »`);
      await ev2(() => { window.__fournil.st.quartier.billets = 1e16; }); await clic2('[data-pq="ameliorations"]'); await sleep(400);
      await ev2(() => { const b = document.querySelector('#feuille [data-id="gobelets"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(150);
      const et0 = await ev2(() => window.__fournil.st.etoiles); await clic2('#feuille [data-id="gobelets"]'); await sleep(400);
      check(await ev2(() => window.__fournil.st.quartier.ameliorations.gobelets === true && window.__fournil.Q.ameliorationMult(window.__fournil.st.quartier, 6) === 3) && (await ev2(() => window.__fournil.st.etoiles)) === et0 + 2, 'sa combine « Gobelets à double fond » : sirop ×3, et +2 ★ pour la boulangerie');
      await ev2(() => { const b = document.querySelector('#feuille [data-id="grossiste"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(3500);
      await photoR(pg, 'quartier-combines-grossiste');
      await clic2('#feuille [data-a="pq-retour"]'); await sleep(300);
      await ev2(() => { const q = window.__fournil.st.quartier; q.mode = 1; q.billets = 1e15; }); await ev2(() => document.querySelector('.pq-modes button[data-mode="1"]').click()); await sleep(200);
      const avant = await carte(5), pAvant = await ev2(() => window.__fournil.Q.prixNiveaux(window.__fournil.st.quartier, 5, 1));
      await clic2('[data-pq="ameliorations"]'); await sleep(400); await clic2('#feuille [data-id="grossiste"]'); await sleep(400); await clic2('#feuille [data-a="pq-retour"]'); await sleep(400);
      const apres = await carte(5), pApres = await ev2(() => window.__fournil.Q.prixNiveaux(window.__fournil.st.quartier, 5, 1)), fmt = await ev2((x) => window.__fournil.Q.fmt(x), pAvant / 2);
      check(await ev2(() => window.__fournil.st.quartier.ameliorations.grossiste === true) && pApres === pAvant / 2 && apres.prix.replace(/\s/g, '').startsWith(fmt.replace(/\s/g, '')) && /−50 % ×1/.test(apres.petit) && /promo/.test(await ev2(() => document.querySelector('#pq-cartes .carte[data-i="5"] [data-a="ameliorer"]').className)),
        `le Grossiste acheté : un niveau de Spécialité passe de « ${avant.prix} » à « ${apres.prix} » (${apres.petit})`);
      // le cristal bleu au 16e : les huit postes ouverts, leurs apprentis
      await ev2(() => { const F = window.__fournil, q = F.st.quartier; F.Q.gagner(q, 6e15); q.billets = 1e16; }); await sleep(300);
      for (let k = 0; k < 4 && /Palier/.test(await feuille2()); k++) { await clic2('#feuille [data-a="pq-ok"]'); await sleep(450); }
      await clic2('#pq-cartes .carte[data-i="7"] [data-a="debloquer"]'); await sleep(300); await clic2('#pq-cartes .carte[data-i="7"] [data-a="embaucher"]'); await sleep(400);
      await ev2(() => { const q = window.__fournil.st.quartier; [235, 214, 207, 203, 199, 192, 160, 62].forEach((n, i) => { q.postes[i].niv = n; q.postes[i].staff = true; q.postes[i].actif = true; }); const s = EVENEMENTS.quartier.scene; if (s) s.equipe(q); }); await sleep(600); // l'équipe au complet : neuf personnages
      const huit = await ev2(() => [...document.querySelectorAll('#pq-cartes .carte[data-i]')].map((c) => c.className));
      check(huit.length === 8 && huit.every((x) => /auto/.test(x)) && (await carte(7)).staff === 'Chimiste Monsieur Blanc', 'le 16e franchi : le cristal bleu ouvert, Chimiste Monsieur Blanc embauché ; huit postes, huit apprentis');
      const c7b = await carte(7); check(/Palier 75 ×1,41/.test(c7b.pal), `les paliers intercalés du cristal : « ${c7b.pal} »`);
      await ev2(() => document.querySelector('#pq-cartes').scrollTo(0, 0)); await sleep(3500); // le toast de l'embauche s'en va
      const sc = await ev2(() => { const s = EVENEMENTS.quartier.scene; return { calls: s ? s.calls : 0 }; });
      check(sc.calls > 0 && sc.calls <= 80, `la scène avec l’équipe au complet (neuf personnages) : ${sc.calls} appels de dessin`);
      await photoR(pg, 'quartier-planque-8-postes');
      await ev2(() => document.querySelector('#pq-cartes .carte[data-i="7"]').scrollIntoView({ block: 'end' })); await sleep(300);
      await photoR(pg, 'quartier-planque-8-postes-bas');
      // v6.2 : les paliers intercalés aussi sur les six premières recettes (le shit au niveau 60 : le prochain, le 75e, ajoute ×1,41)
      await ev2(() => { const q = window.__fournil.st.quartier; q.postes[1].niv = 60; }); await attendre(() => ev2(() => /Palier 75 ×1,41/.test(document.querySelector('#pq-cartes .carte[data-i="1"] .palier span').textContent)), 4000);
      const c1 = await carte(1); check(/Palier 75 ×1,41/.test(c1.pal), `une ancienne recette a ses paliers intercalés : le shit, « ${c1.pal} »`);
      await photoR(pg, 'quartier-ancienne-recette-palier-75');
      await ev2(() => document.querySelector('#pq-cartes').scrollTo(0, 0)); }
    await ev2(() => { const Qd = window.__fournil.Q, q = window.__fournil.st.quartier; q.evTimer = 9999; Qd.lancerEvenement(q, Math.random, 'descente'); }); await sleep(300);
    check(/0\/8/.test(await ev2(() => document.querySelector('#pq-ev').innerText)), 'une descente se planque maintenant en 8 touches');
    await ev2(() => { const q = window.__fournil.st.quartier; q.ev = null; });
    // le 20e : la casquette néon
    await ev2(() => { const q = window.__fournil.st.quartier; q.total = 1.2e17; q.billets = 1e16; });
    check(await attendre(async () => /Palier 17/.test(await feuille2()), 5000), 'au-delà de 110 Bd : les paliers 17 à 20 s’annoncent (15 et 16 sont passés avec le cristal bleu)');
    for (let k = 0; k < 5 && !/Palier 20/.test(await feuille2()); k++) { await clic2('#feuille [data-a="pq-ok"]'); await sleep(450); }
    f2 = await feuille2();
    check(/Palier 20 · La légende en néon/.test(f2) && /Casquette néon/.test(f2) && /casquette néon est dans ta garde-robe/.test(f2), 'le palier 20 : « La légende en néon », la casquette néon pour la garde-robe');
    await shot2('b5-palier-20');
    await clic2('#feuille [data-a="pq-ok"]'); await sleep(500);
    const fin2 = await ev2(() => { const F = window.__fournil; return { casquette: F.G.possede(F.st, 'quartier-neon-casquette'), or: F.G.possede(F.st, 'quartier-or-casquette'), btn: document.querySelector('[data-pq="paliers"] b').textContent, paliers: F.st.quartier.paliers.length }; });
    check(fin2.casquette && !fin2.or && fin2.btn === '20/20' && fin2.paliers === 20, `la casquette néon est dans la garde-robe (pas la dorée du podium) ; « ${fin2.btn} »`);
    await ev2(() => { const F = window.__fournil; F.G.equiper(F.st, 'tete', 'quartier-neon-casquette'); F.save(); });
    await clic2('[data-pq="fermer"]'); await sleep(900); await ev2(() => window.__fournil.tiroir && window.__fournil.tiroir('ferme')); await sleep(900);
    await shot2('b6-boutique-casquette-neon');
    // la fin : le bilan compte jusqu'à 20
    decal = Q.FIN + 3 * HEURE - Date.now();
    await pg.evaluate((d) => localStorage.setItem('test.tel', String(d)), decal); await ev2(() => window.__fournil.save());
    await charger2();
    check(await attendre(() => pg.evaluate(() => document.querySelector('#planque').dataset.ecran === 'bilan'), 6000), 'après la fin : le bilan');
    const bil = await ev2(() => document.querySelector('#pq-corps').innerText);
    check(/20\/20 paliers/.test(bil) && /Casquette néon/.test(bil) && /43 étoiles/.test(bil) && /h de gains versées/.test(bil), `le bilan compte jusqu’à 20 : ${bil.split('\n').filter((l) => /paliers|reste/.test(l)).join(' / ')}`);
    await shot2('b7-bilan-20');
    await ctx2.close(); }

  // les activités (src/activites.js) dans un troisième téléphone, le vendredi 16 octobre (4e jour) : la barre, les trois mini-jeux au doigt,
  // un contrat, une opération (test/fournil-activites-ecran.cjs, le même parcours que la Maison hantée)
  await require('./fournil-activites-ecran.cjs')({ browser, url: URL_JEU, heure: (ms) => { decal = ms - Date.now(); }, quand: new Date('2026-10-16T10:00:00+02:00').getTime(), fauxTelephone, route: [SUPA + '/rest/v1/rpc/*', gerer],
    check, errors, dirs: [out, out2].filter(Boolean), prefixe: '', racine: '#planque', ev: 'evenement', ouvrir: 'quartier', cle: 'quartier', nom: 'la Planque', rj: 'planque' });

  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', e && e.stack || e); process.exit(1); });
