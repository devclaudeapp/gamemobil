// L'événement « Le Quartier » sur la vraie page du Fournil (fournil/ servie en local), sur un téléphone en portrait, avec une FAUSSE HEURE dans la
// fenêtre de l'événement (le serveur local donne la même heure dans son en-tête Date : l'horloge de confiance la prend ; Date est décalé avant
// tout script de la page) et un Supabase SIMULÉ (page.route, contrat v4 : p_quartier, période « quartier », podium final).
// Parcours : l'icône ronde en haut à droite (seulement pendant l'événement), l'annonce du premier jour, la porte 18+, la Planque (vendre à la
// main, débloquer, embaucher, les combines), les coups de pouce (descente, scooter, soirée, gros client), les paliers et leurs récompenses dans la
// boulangerie (étoiles, boosts en réserve lancés depuis la pastille, décos du quartier dans la boutique, vêtements de la garde-robe), les gains
// d'absence plafonnés, « Masquer l'événement » dans les Réglages, l'onglet Événement du classement, puis la fin : la Planque fermée, le bilan,
// l'icône disparue, le podium final dans le classement. Captures dans test/shots/quartier/ (et dans le dossier donné par SHOTS_QUARTIER).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-quartier.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const Q = require('../src/quartier.js'), CL = require('../src/classement.js');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_QUARTIER || 8865, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const out = path.join(__dirname, 'shots', 'quartier'); fs.mkdirSync(out, { recursive: true });
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
  faux.appels.push({ nom, corps });
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
  const qst = () => ev(() => { const q = window.__fournil.st.quartier; return q ? { majeur: q.majeur, masque: q.masque, annonce: q.annonce, bilan: q.bilan, billets: q.billets, total: q.total, postes: q.postes.map((p) => [p.niv, p.staff]), paliers: q.paliers.slice(), decos: q.decos.slice(), vetements: q.vetements.slice(), etoiles: q.etoiles, boosts: q.boosts, stats: q.stats, ev: q.ev && q.ev.type, lastSeen: q.lastSeen } : null; });
  const planque = () => ev(() => { const el = document.querySelector('#planque'); return { ouvert: !el.hidden, ecran: el.dataset.ecran, titre: document.querySelector('#pq-titre').textContent, sous: document.querySelector('#pq-sous').textContent, billets: document.querySelector('#pq-billets').textContent, taux: document.querySelector('#pq-taux').textContent, reste: document.querySelector('#pq-reste').textContent, paliers: document.querySelector('[data-pq="paliers"] b').textContent, cartes: [...document.querySelectorAll('#pq-cartes .carte')].map((c) => c.className), ev: document.querySelector('#pq-ev').hidden ? '' : document.querySelector('#pq-ev').innerText, corps: document.querySelector('#pq-corps').innerText, calls: window.__fournil.evenement.scene ? window.__fournil.evenement.scene.calls : -1 }; });

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
  check(p.ecran === 'planque' && s.majeur && p.cartes.length === 6 && /Jour 2 sur 15/.test(p.sous), `on entre : six cartes, « ${p.sous} », ${p.reste}`);
  check(p.calls > 0 && p.calls <= 40, `le décor 3D de la Planque tourne : ${p.calls} appels de dessin (≤ 40)`);
  await shot('03-planque');

  console.log('── jouer dans la Planque ──');
  check(/^0 €/.test(p.billets) && p.cartes[0].includes('manuel') && p.cartes[1].includes('verrou'), 'zéro billet, l’herbe à la main, le shit verrouillé');
  await page.evaluate(() => { const b = document.querySelector('#pq-cartes .carte .barre'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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
  const b0 = (await qst()).billets;
  for (let k = 0; k < 12; k++) { await page.evaluate(() => { const b = document.querySelector('#pq-ev [data-a="planquer"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); await sleep(40); }
  await sleep(300); s = await qst();
  check(s.ev === null && s.stats.descentes === 1 && s.billets > b0, 'douze touches : tout est planqué, la prime est tombée');
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
  await clic('#pq-ev [data-a="livrer"]'); await sleep(300); s = await qst();
  check(s.ev === null && s.stats.grosClients === 1, 'livré');

  console.log('── les paliers et leurs récompenses pour la boulangerie ──');
  const avant = await ev(() => ({ etoiles: window.__fournil.st.etoiles, reserve: window.__fournil.st.boosts.reserve.length }));
  await ev((t) => { const q = window.__fournil.st.quartier; q.billets += t - q.total; q.total = t; }, Q.PALIERS[3].total);
  await attendre(async () => /Palier 1/.test(await feuille()));
  check(/Palier 1 · Premiers billets/.test(await feuille()) && /étoile/.test(await feuille()) && /boost ×2/.test(await feuille()), 'le palier 1 est annoncé : une étoile, un boost ×2 en réserve');
  await shot('07-palier');
  s = await qst();
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
  await clic('[data-pq="fermer"]'); await sleep(300);

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
  await ev(() => { window.__fournil.st.quartier.total = 7e11; const e = window.__fournil.classement().etat(); e.essai = 0; e.dernierEnvoi = 0; });
  await ev(() => window.__fournil.feuilleClassement('quartier'));
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille-contenu .cl-liste'))), 'la liste se charge');
  await sleep(1500); // l'envoi de ses billets, puis la liste relue
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
  await page.evaluate((d) => window.__heureTel(d), decal);
  await page.evaluate(() => window.__fournil.save());
  await charger();
  c = await ev(() => window.__fournil.coin());
  check(!c.quartier, 'après la fin : plus d’icône du Quartier');
  check(await attendre(async () => (await planque()).ecran === 'bilan', 6000), 'le bilan s’ouvre tout seul : « La Planque a fermé »');
  p = await planque();
  check(/Bilan du quartier/.test(p.corps) && /paliers/.test(p.corps) && /Ce qui reste à vie/.test(p.corps) && /étoile/.test(p.corps), `le bilan : ${p.corps.split('\n').slice(0, 4).join(' / ')}`);
  await shot('13-bilan');
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
  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', e && e.stack || e); process.exit(1); });
