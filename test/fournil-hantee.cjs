// L'événement « La Maison hantée » sur la vraie page du Fournil (fournil/ servie en local), sur un téléphone en portrait, avec une FAUSSE
// HEURE (le serveur local donne la même heure dans son en-tête Date : l'horloge de confiance la prend ; Date est décalé avant tout script).
// Parcours : le 27 octobre à 13 h, une partie qui a joué au Quartier : son bilan d'abord, puis (et pas en même temps) l'annonce de la Maison
// hantée ; l'icône citrouille du coin ; le Manoir en HD (KayKit Halloween Bits, l'équipe costumée en Mini Characters) : vendre à la main,
// débloquer, embaucher, les sortilèges, les coups de pouce (tous les types de HANTEE.EVENEMENTS), les paliers et leurs récompenses dans la
// boulangerie (étoiles, boosts, décos d'Halloween, tenue de la garde-robe), les gains d'absence plafonnés et le retour Planque ouverte, le
// chat noir dans la boutique, « Masquer la Maison hantée » dans les Réglages ; le décor éco (chibis costumés) ; puis la fin : le Manoir
// fermé, le bilan, l'icône partie, le chat noir au choix. Puis, dans un second téléphone, « après le maître » : une sauvegarde déjà au 12e
// reçoit les paliers bonus déjà dépassés, une fois ; la liste « Après le maître du Manoir » (13 à 20) lisible à 390 px ; les Sortilèges en
// plus ; le 20e et son chapeau phosphorescent ; le bilan qui compte jusqu'à 20. Enfin, dans un troisième téléphone, les activités
// (test/fournil-activites-ecran.cjs) : la barre des trois boutons, une partie de chaque mini-jeu au doigt, un contrat, une opération.
// Captures dans test/shots/hantee/ (et dans le dossier donné par SHOTS_HANTEE).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hantee.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HT = require('../src/hantee.js');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_HANTEE || 9265; // les ports du groupe H2 : +400 (fournil-quartier.cjs est en 8865)
const outR = path.join(__dirname, 'shots', 'recettes'); fs.mkdirSync(outR, { recursive: true }); // les recettes
const photoR = async (pg, nom) => { await pg.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); await pg.screenshot({ path: path.join(outR, nom + '.png') }); await pg.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); }; // sans le toast du moment (une capture par écran) d'après le maître
const out = path.join(__dirname, 'shots', 'hantee'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_HANTEE ? (fs.mkdirSync(process.env.SHOTS_HANTEE, { recursive: true }), process.env.SHOTS_HANTEE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const HEURE = 3600e3;
// le « vrai » temps du test : mardi 27 octobre 2026, 13 h à Paris (le Quartier a fermé à midi, la Maison hantée vient d'ouvrir)
const DEPART = HT.DEBUT + HEURE;
let decal = DEPART - Date.now();
const vrai = () => Date.now() + decal;
const demandes = [];
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const passe = (m) => console.log('  --   ' + m); // une vérification qui attend l'autre groupe (src/game.js, src/classement.js) : ni réussie ni ratée
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };
function fauxTelephone(decalDepart) { // avant tout script de la page : une fausse heure du téléphone, gardée d'un chargement à l'autre
  let d = decalDepart;
  try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* about:blank */ }
  const D = Date;
  class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } }
  window.Date = FauxDate;
}

(async () => {
  const URL_JEU = `http://localhost:${PORT}/fournil/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(fauxTelephone, decal);
  await ctx.addInitScript(() => { window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true }); }); // les messages vus
  await ctx.route(/supabase\.co/, (r) => r.abort()); // pas de classement en ligne ici (test/fournil-classement*.cjs) : le jeu marche sans
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  await page.goto('about:blank');
  const shot = async (nom, sel) => { const f = path.join(out, nom + '.png'); if (sel) await page.locator(sel).screenshot({ path: f }); else await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); };
  const pret = async () => { await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900); };
  const charger = async (q) => { await page.goto(URL_JEU + (q || '?qualite=haute')); await pret(); };
  const feuille = () => page.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const clic = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const hst = () => ev(() => { const F = window.__fournil, h = F.st[F.evHantee.cle]; return h ? { masque: h.masque, annonce: h.annonce, bilan: h.bilan, billets: h.billets, total: h.total, postes: h.postes.map((p) => [p.niv, p.staff]), paliers: h.paliers.slice(), decos: h.decos.slice(), vetements: h.vetements.slice(), etoiles: h.etoiles, boosts: h.boosts, stats: h.stats, ev: h.ev && h.ev.type, lastSeen: h.lastSeen } : null; });
  const manoir = () => ev(() => { const el = document.querySelector('#hantee'), s = window.__fournil.evHantee.scene; return { ouvert: !el.hidden, ecran: el.dataset.ecran, titre: document.querySelector('#ht-titre').textContent, sous: document.querySelector('#ht-sous').textContent, billets: document.querySelector('#ht-billets').textContent, taux: document.querySelector('#ht-taux').textContent, reste: document.querySelector('#ht-reste').textContent, paliers: el.querySelector('[data-pq="paliers"] b').textContent, cartes: [...document.querySelectorAll('#ht-cartes .carte[data-i]')].map((c) => c.className), ev: document.querySelector('#ht-ev').hidden ? '' : document.querySelector('#ht-ev').innerText, corps: document.querySelector('#ht-corps').innerText, calls: s ? s.calls : -1, hd: s ? s.hd : null, planque: !document.querySelector('#planque').hidden }; });

  // une partie qui a joué au Quartier (son bilan n'est pas encore vu) et adopté le chat, chargée avant le lancement
  await page.goto(URL_JEU + '?qualite=haute'); await pret();
  await ev(() => { const F = window.__fournil, st = F.st; F.G.adopterChat(st, 'Réglisse'); const q = F.Q.etat(st, HORLOGE.maintenant()); q.majeur = true; q.annonce = true; q.total = 3e11; q.billets = 1e9; delete st[F.evHantee.cle]; F.save(); }); // (ce premier lancement a pu annoncer la Maison hantée : on l'oublie)
  await sleep(300);

  console.log('── le 27 octobre à 13 h : le bilan du Quartier d’abord, puis l’annonce de la Maison hantée ──');
  await charger();
  check(await attendre(() => page.evaluate(() => document.querySelector('#planque').dataset.ecran === 'bilan'), 6000), 'au lancement, le bilan du Quartier s’ouvre en premier');
  check(!/Maison hantée ouvre/.test(await feuille()), 'pas d’annonce de la Maison hantée par-dessus le bilan (jamais deux annonces à la fois)');
  let c = await ev(() => window.__fournil.coin());
  check(!c.quartier && c.hantee, `l’icône du Quartier est partie, la citrouille de la Maison hantée est là (${JSON.stringify({ quartier: c.quartier, hantee: c.hantee })})`);
  await clic('#planque [data-pq="fin"]'); await sleep(600);
  check(!/Maison hantée ouvre/.test(await feuille()), 'le bilan refermé : un temps de calme, l’annonce ne surgit pas aussitôt');
  check(await ev(() => window.__fournil.annoncerEvenements(true)) === true && /La Maison hantée ouvre ses portes/.test(await feuille()), 'puis l’annonce : « La Maison hantée ouvre ses portes »');
  check(/tous les âges/.test(await feuille()) && !/18 ans/.test(await feuille()), 'tous âges, sans porte 18+');
  await shot('01-annonce');
  let s = await hst(); check(s && s.annonce === true, 'annoncée une fois (notée dans la sauvegarde)');
  check(await ev(() => window.__fournil.chatNoir()) === true && await attendre(() => page.evaluate(() => window.__fournil.SCENE.chatVu === 'noir'), 3000), 'pendant l’événement, le chat de la boutique est noir');
  await clic('[data-a="pq-entrer"]'); await sleep(900);

  console.log('── le Manoir ──');
  let m = await manoir();
  check(m.ouvert && m.ecran === 'manoir' && !m.planque && m.cartes.length === HT.PRODUITS.length && /Jour 1 sur/.test(m.sous), `on entre directement : ${m.cartes.length} cartes, « ${m.titre} · ${m.sous} », ${m.reste}`);
  check(/bonbons/.test(m.billets), `le solde est en bonbons : « ${m.billets} »`);
  check(m.cartes[0].includes('manuel') && m.cartes[1].includes('verrou'), 'la première friandise à la main, la deuxième verrouillée');
  { // les deux recettes d'après le maître, déjà visibles, fermées
    const ap = await ev(() => [6, 7].map((i) => { const c = document.querySelector(`#ht-cartes .carte[data-i="${i}"]`); c.scrollIntoView({ block: 'end' }); const b = c.querySelector('.pq-apres'), r = c.getBoundingClientRect();
      return { cls: c.className, nom: c.querySelector('h3').textContent, txt: b ? b.textContent : '', btn: !!c.querySelector('button'), dans: r.left >= 0 && r.right <= innerWidth + 0.5 }; }));
    check(ap[0].nom === 'Gâteaux du cimetière' && ap[0].txt === 'Après le palier 13' && ap[1].nom === 'Œufs de dragon en chocolat' && ap[1].txt === 'Après le palier 16' && ap.every((x) => /apres/.test(x.cls) && !x.btn && x.dans), `les recettes d’après le maître : « ${ap[0].nom} » (${ap[0].txt}), « ${ap[1].nom} » (${ap[1].txt}), sans bouton`);
    await sleep(3500); await photoR(page, 'hantee-carte-apres-palier-13');
    await ev(() => document.querySelector('#ht-cartes').scrollTo(0, 0)); await sleep(150); }
  check(await attendre(async () => { const x = await manoir(); return x.hd && x.hd.actif && x.hd.persos >= 1; }, 30000), 'les modèles HD arrivent : le salon KayKit, le jardin par la fenêtre, la patronne en Mini Character');
  const poids = demandes.filter((d) => /hd\/hantee\//.test(d)).reduce((a, d) => a + fs.statSync(path.join(root, d)).size, 0);
  check(poids > 0 && poids < 700e3, `les modèles du manoir pèsent ${Math.round(poids / 1024)} Ko (meshopt, < 700 Ko)`);
  await page.evaluate(() => { const b = document.querySelector('#ht-cartes .carte[data-i] .barre'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await attendre(async () => (await hst()).stats.ventes >= 1, 10000); // (le rendu logiciel de la HD est lent : le temps du jeu avance moins vite)
  s = await hst(); m = await manoir();
  check(s.billets > 0 && s.stats.taps === 1 && s.stats.ventes === 1, `une touche : une vente à la main, ${m.billets}`);
  await ev((n) => { const F = window.__fournil; F.st[F.evHantee.cle].billets += n; }, HT.PRODUITS[1].debloquer + HT.PRODUITS[0].staff + 10);
  await page.evaluate(() => document.querySelector('#ht-cartes .carte[data-i="1"] [data-a="debloquer"]').click()); await sleep(300);
  await page.evaluate(() => document.querySelector('#ht-cartes .carte[data-i="0"] [data-a="embaucher"]').click()); await sleep(300);
  s = await hst();
  check(s.postes[1][0] === 1 && s.postes[0][1] === true && s.stats.embauches === 1, `la deuxième friandise débloquée, ${HT.PRODUITS[0].staffNom} embauché`);
  await attendre(async () => (await hst()).stats.ventes > 1, 10000); s = await hst(); m = await manoir();
  check(s.stats.ventes > 1 && /\/s/.test(m.taux), `l'employé vend tout seul : ${m.taux}`);
  check(await attendre(async () => { const x = await manoir(); return x.hd && x.hd.costumes.length === 2 && x.hd.costumes[1] === 'fantome'; }, 4000), 'il apparaît dans le salon, costumé en fantôme');
  await clic('#hantee [data-pq="ameliorations"]'); await sleep(300);
  check(/Les sortilèges|Sortilèges/i.test(await feuille()) && (await feuille()).includes(HT.AMELIORATIONS[0].nom), 'la feuille des sortilèges (améliorations)');
  await ev((n) => { const F = window.__fournil; F.st[F.evHantee.cle].billets += n; }, HT.AMELIORATIONS[0].cout * 2);
  await clic(`#feuille [data-id="${HT.AMELIORATIONS[0].id}"]`); await sleep(300);
  check(await ev((id) => { const F = window.__fournil; return F.st[F.evHantee.cle].ameliorations[id] === true; }, HT.AMELIORATIONS[0].id), `${HT.AMELIORATIONS[0].nom} acheté`);
  await shot('03-sortileges'); await clic('#feuille [data-a="pq-retour"]'); await sleep(300);

  console.log('── l’équipe au complet, en costumes ──');
  await ev(() => { const F = window.__fournil, h = F.st[F.evHantee.cle]; h.postes.forEach((p, i) => { p.niv = Math.max(p.niv, 25 + i * 3); p.staff = true; p.actif = true; }); h.billets = Math.max(h.billets, 5e9); F.evHantee.scene.equipe(h); });
  check(await attendre(async () => { const x = await manoir(); return x.hd && x.hd.persos === 9; }, 5000), 'neuf Mini Characters : la patronne et les huit employés (le loup-garou et la dragonne compris)');
  m = await manoir();
  check(JSON.stringify(m.hd.costumes) === JSON.stringify(['patronne', 'fantome', 'momie', 'squelette', 'vampire', 'sorciere', 'citrouille', 'loupgarou', 'dragonne']), `les costumes : ${m.hd.costumes.join(', ')}`);
  check(m.calls > 0 && m.calls <= 110, `le décor HD tourne : ${m.calls} appels de dessin (≤ 110)`);
  check(m.hd.jardin === true && m.hd.noirs === 0, 'le jardin hanté par la fenêtre (scène KayKit rendue dans une texture), pas d’écran noir');
  await sleep(3500); await shot('02-manoir-hd'); await shot('02b-scene-hd', '#ht-canvas');
  await photoR(page, 'hantee-manoir-8-postes');
  await ev(() => document.querySelector('#ht-cartes .carte[data-i="7"]').scrollIntoView({ block: 'end' })); await sleep(300);
  await photoR(page, 'hantee-manoir-8-postes-bas'); await ev(() => document.querySelector('#ht-cartes').scrollTo(0, 0));

  console.log('── les coups de pouce ──');
  const typesEv = Object.keys(HT.EVENEMENTS);
  for (const type of typesEv) {
    await ev((t) => { const F = window.__fournil, h = F.st[F.evHantee.cle]; h.ev = null; h.evTimer = 9999; F.HT.lancerEvenement(h, () => 0, t); }, type);
    await attendre(() => page.evaluate((t) => document.querySelector('#ht-ev').dataset.type === t && !document.querySelector('#ht-ev').hidden, type), 6000); m = await manoir(); const g = await ev(() => { const b = document.querySelector('#ht-ev'); return b.querySelector('[data-a="planquer"]') ? 'taper' : b.querySelector('[data-a="attraper"]') ? 'attraper' : b.querySelector('.ev.grosclient') ? 'livrer' : 'mult'; });
    check(m.ev.length > 0, `« ${type} » (${g}) : la bannière « ${m.ev.split('\n')[0]} »`);
    if (type === typesEv[0]) await shot('04-coup-de-pouce');
    if (g === 'taper') { const n = await ev(() => { const F = window.__fournil; return F.st[F.evHantee.cle].ev.n; }); for (let k = 0; k < n; k++) { await page.evaluate(() => { const b = document.querySelector('#ht-ev [data-a="planquer"]'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); await sleep(30); } await sleep(300); check((await hst()).ev === null, `  ${n} touches : réussi, la prime tombe`); }
    if (g === 'attraper') { await clic('#ht-ev [data-a="attraper"]'); await sleep(300); check((await hst()).ev === null, '  attrapé'); }
    if (g === 'livrer') { await ev(() => { const F = window.__fournil, h = F.st[F.evHantee.cle]; h.ev.fait = h.ev.n; }); await attendre(() => page.evaluate(() => !!document.querySelector('#ht-ev [data-a="livrer"]')), 6000); await clic('#ht-ev [data-a="livrer"]'); await sleep(300); check((await hst()).ev === null, '  livré'); }
    if (g === 'mult') { check(await ev(() => { const F = window.__fournil; return F.HT.boostMult(F.st[F.evHantee.cle]); }) > HT.PRESENCE, '  toutes les ventes multipliées'); await ev(() => { const F = window.__fournil; F.st[F.evHantee.cle].ev = null; }); }
  }

  console.log('── les paliers et leurs récompenses pour la boulangerie ──');
  const avant = await ev(() => ({ etoiles: window.__fournil.st.etoiles, reserve: window.__fournil.st.boosts.reserve.length }));
  const p4 = HT.PALIERS.slice(0, 4), etoiles4 = p4.reduce((a, p) => a + (p.etoiles || 0), 0), boosts4 = p4.filter((p) => p.boost).length, decos4 = p4.filter((p) => p.deco).map((p) => p.deco), vet4 = p4.filter((p) => p.vetement).map((p) => p.vetement);
  await ev((t) => { const F = window.__fournil, h = F.st[F.evHantee.cle]; h.billets += t - h.total; h.total = t; }, HT.PALIERS[3].total);
  check(await attendre(async () => /Palier 1/.test(await feuille())), 'le palier 1 est annoncé');
  await shot('05-palier');
  s = await hst();
  check(s.paliers.join() === '1,2,3,4' && s.decos.join() === decos4.join() && s.vetements.join() === vet4.join(), `les paliers 1 à 4 marqués d'un coup : ${JSON.stringify({ decos: s.decos, vetements: s.vetements })}`);
  const apres = await ev(() => ({ etoiles: window.__fournil.st.etoiles, reserve: window.__fournil.st.boosts.reserve.length }));
  check(apres.etoiles === avant.etoiles + etoiles4 && apres.reserve === avant.reserve + boosts4, `la boulangerie a reçu ${etoiles4} étoiles et ${boosts4} boosts en réserve`);
  const connu = await ev((ids) => ids.map((id) => !!window.__fournil.G.vetement(id)), vet4);
  if (connu.every(Boolean)) check(await ev((ids) => ids.every((id) => window.__fournil.G.possede(window.__fournil.st, id)), vet4), `la garde-robe a reçu ${vet4.join(', ')}`);
  else passe(`la garde-robe ne connaît pas encore ${vet4.join(', ')} (src/game.js, groupe H1) : la pièce attend dans st.hantee.vetements`);
  for (let k = 0; k < 4; k++) { await clic('#feuille [data-a="pq-ok"]'); await sleep(450); }
  check((await feuille()) === '', 'les quatre annonces de palier passent l’une après l’autre');
  m = await manoir(); check(m.paliers === `4/${HT.PALIERS_BOSS}`, `le bouton des paliers : ${m.paliers} (sur douze tant que le maître n’est pas franchi)`);
  await clic('#hantee [data-pq="paliers"]'); await sleep(300);
  check(/Les paliers/.test(await feuille()) && (await feuille()).split('✓').length === 5, 'la feuille des paliers : quatre cochés');
  await shot('06-paliers'); await clic('#feuille [data-a="pq-retour"]'); await sleep(200);

  console.log('── les gains d’absence : plafonnés, au ralenti ; le retour écran ouvert ──');
  await clic('#hantee [data-pq="fermer"]'); await sleep(900);
  m = await manoir(); s = await hst();
  check(!m.ouvert && s.lastSeen > 0 && await ev(() => !window.__fournil.evHantee.scene), 'le Manoir se ferme (son décor 3D est libéré), la dernière visite est notée');
  await ev(() => { const F = window.__fournil; F.st[F.evHantee.cle].lastSeen = HORLOGE.maintenant() - 30 * 3600e3; });
  const bAv = (await hst()).billets, tauxH = await ev(() => { const F = window.__fournil; return F.HT.tauxBase(F.st[F.evHantee.cle]); });
  await ev(() => window.__fournil.hantee()); await sleep(900);
  s = await hst();
  const gagne = s.billets - bAv, attendu = tauxH * HT.heuresAbsence() * 3600 * (HT.ABSENCE_PART || 1);
  check(s.billets > bAv && Math.abs(gagne - attendu) / attendu < 0.05, `30 h d'absence : ${HT.fmt(gagne)} bonbons, soit ${HT.heuresAbsence()} h au ralenti (${HT.fmt(attendu)} attendus)`);
  check(await attendre(() => page.evaluate(() => window.__toasts.some((t) => /Pendant ton absence/.test(t))), 6000), 'le message « Pendant ton absence »');
  { const b1 = (await hst()).billets, r = await ev(() => { const F = window.__fournil; F.st[F.evHantee.cle].lastSeen = HORLOGE.maintenant() - 2 * 3600e3; const a = F.evHantee.retour(); return a && { secs: a.secs, total: a.total }; });
    const b2 = (await hst()).billets;
    check(r && Math.abs(r.secs - 7200) < 5 && r.total > 0 && b2 >= b1 + r.total * 0.99, `retour dans le jeu, Manoir ouvert : 2 h payées (+${HT.fmt(r ? r.total : 0)})`); }
  await clic('#hantee [data-pq="fermer"]'); await sleep(400);

  console.log('── la boutique : les décos d’Halloween, le chat noir, la tenue ──');
  const dv = await ev(() => window.__fournil.SCENE.decosHanteeVues);
  check(decos4.every((d) => dv.includes(d) || !['citrouilles', 'toiles', 'chaudron', 'fantome'].includes(d)), `les décos gagnées sont dans la boutique : ${dv.join(', ') || 'aucune'}`);
  await ev(() => window.__fournil.SCENE.decosHantee(['citrouilles', 'toiles', 'chaudron', 'fantome']));
  check(await attendre(async () => (await ev(() => window.__fournil.SCENE.decosHanteeVues)).length === 4, 8000), 'les quatre décos posées pour la capture'); // (la scène se rebâtit à l'image suivante : sur une machine chargée, plus d'une seconde)
  // la tenue d'Halloween portée par le boulanger : les pièces de la garde-robe (src/game.js, H1) ; en attendant H1, ajoutées ici pour la capture
  const ids = await ev((v) => { const F = window.__fournil, G = F.G, GR = G.GARDEROBE, coll = F.evHantee.cle, formes = { tete: 'chapeau', haut: 'cape', pieds: 'bottes', accessoire: 'balai' };
    let pieces = Object.values(GR.objets).filter((o) => o.collection === coll);
    if (!pieces.length) { v.forEach((id, k) => { const piece = ['tete', 'haut', 'pieds', 'accessoire'][k]; GR.objets[id] = { id, nom: id, piece, collection: coll, forme: formes[piece], bonus: {}, rarete: 'rare', desc: '' }; }); pieces = Object.values(GR.objets).filter((o) => o.collection === coll); }
    for (const o of pieces) { G.donnerVetement(F.st, o.id); G.equiper(F.st, o.piece, o.id); } F.rafraichir(); return pieces.map((o) => `${o.id}:${o.forme}`); }, HT.VETEMENTS);
  console.log('     pièces portées : ' + ids.join(', '));
  check(await ev(() => window.__fournil.stats().calls) <= 100, `le budget d'appels de dessin de la boutique tient (décos, chat, tenue) : ${await ev(() => window.__fournil.stats().calls)}`);
  await ev(() => window.__fournil.tiroir('ferme')); await sleep(1200);
  check(await ev(() => window.__fournil.SCENE.chatVu) === 'noir', 'le chat noir dort dans la boutique');
  await shot('07-boutique-halloween');
  await ev(() => window.__fournil.tiroir('mi'));
  await ev(() => window.__fournil.garderobe('tete')); await sleep(500);
  const gr = await feuille();
  check(/Garde-robe/.test(gr) && /Maison hantée/.test(gr), 'la garde-robe montre les pièces de la Maison hantée');
  check(/Le compagnon de la boutique/i.test(gr) && /chat noir/i.test(gr), 'et le compagnon de la boutique (un chat : noir d’office pendant l’événement)');
  await shot('08-garderobe');
  await ev(() => { const b = document.querySelector('#feuille [data-a="gr-fermer"]'); if (b) b.click(); }); await sleep(300);

  console.log('── Réglages : masquer la Maison hantée ──');
  await ev(() => window.__fournil.page('reglages')); await sleep(300);
  check(await ev(() => !!document.querySelector('[data-a="hantee"]')), 'la ligne « Masquer la Maison hantée » est dans les Réglages pendant l’événement');
  await clic('[data-a="hantee"]'); await sleep(300);
  s = await hst(); c = await ev(() => window.__fournil.coin());
  check(s.masque === true && !c.hantee, 'masqué : la citrouille du coin disparaît');
  check(await ev(() => window.__fournil.hantee()) === false, 'et le Manoir refuse de s’ouvrir');
  await clic('[data-a="hantee"]'); await sleep(300);
  c = await ev(() => window.__fournil.coin()); check(c.hantee, 'démasqué : la citrouille revient');
  await ev(() => window.__fournil.page('boutique'));
  const onglet = await ev(() => { const P = typeof CLASSEMENT !== 'undefined' && CLASSEMENT.PERIODES; return !!(P && P.includes(window.__fournil.evHantee.cle)); });
  if (onglet) { await ev(() => window.__fournil.feuilleClassement(window.__fournil.evHantee.cle)); await sleep(1200); check(await ev(() => !!document.querySelector('#feuille [data-tab="hantee"]')) && /Halloween/.test(await feuille()), 'le classement a son onglet « Halloween »');
    const tabs = await ev(() => [...document.querySelectorAll('#feuille [data-tab]')].map((b) => ({ t: b.textContent, ok: b.scrollWidth <= b.clientWidth + 1 })));
    check(tabs.every((x) => x.ok), `les onglets tiennent sur l'iPhone, sans se chevaucher : ${tabs.map((x) => x.t).join(' · ')}`); await shot('09-classement-halloween'); await clic('#feuille [data-a="close"]'); }
  else passe('l’onglet « Halloween » du classement attend le moteur v5 (src/classement.js, groupe H1)');

  console.log('── le décor éco : des chibis costumés ──');
  await page.evaluate(() => window.__fournil.save());
  await charger('?qualite=eco');
  await ev(() => window.__fournil.hantee()); await sleep(1500);
  m = await manoir();
  check(m.ecran === 'manoir' && m.hd && !m.hd.actif && m.calls > 0 && m.calls <= 105, `en éco : pas de HD, ${m.calls} appels de dessin (≤ 105 : neuf chibis depuis le loup-garou et la dragonne)`);
  check(JSON.stringify(m.hd.costumes) === JSON.stringify(['patronne', 'fantome', 'momie', 'squelette', 'vampire', 'sorciere', 'citrouille', 'loupgarou', 'dragonne']), 'les mêmes costumes, en chibis');
  await shot('10-manoir-eco'); await shot('10b-scene-eco', '#ht-canvas'); await photoR(page, 'hantee-manoir-8-postes-eco');
  await clic('#hantee [data-pq="fermer"]'); await sleep(300);

  console.log('── la fin : le Manoir fermé, le bilan, l’icône partie, le chat noir au choix ──');
  decal = HT.FIN + 3 * HEURE - Date.now();
  await page.evaluate((d) => localStorage.setItem('test.tel', String(d)), decal);
  await page.evaluate(() => window.__fournil.save());
  await charger();
  c = await ev(() => window.__fournil.coin());
  check(!c.hantee && !c.quartier, 'après la fin : plus d’icône d’événement');
  check(await attendre(async () => (await manoir()).ecran === 'bilan', 6000), 'le bilan s’ouvre tout seul');
  m = await manoir();
  check(/Ce qui reste à vie/.test(m.corps) && /4\/\d+ paliers/.test(m.corps) && /étoile/.test(m.corps) && /chat noir/.test(m.corps), `le bilan : ${m.corps.split('\n').slice(0, 3).join(' / ')}`);
  await shot('11-bilan');
  await clic('#hantee [data-pq="fin"]'); await sleep(400);
  s = await hst(); check(!(await manoir()).ouvert && s.bilan === true, 'refermé : le bilan ne reviendra plus');
  check(await ev(() => window.__fournil.hantee()) === true && (await manoir()).ecran === 'bilan', 'on peut le rouvrir à la main (fini : toujours le bilan)');
  await clic('#hantee [data-pq="fin"]'); await sleep(300);
  check(!(await ev(() => window.__fournil.chatNoir())), 'après l’événement, le chat redevient roux par défaut');
  await ev(() => window.__fournil.page('reglages')); await sleep(300);
  check(await ev(() => !document.querySelector('[data-a="hantee"]') && !!document.querySelector('[data-a="compagnons"]')), 'les Réglages : plus de ligne « Masquer », mais « Le compagnon »');
  await clic('[data-a="compagnons"]'); await sleep(400);
  check(await ev(() => /Gagné à la Maison hantée/.test(document.querySelector('#feuille-contenu [data-cp="chat-noir"]').innerText) && !!document.querySelector('#feuille-contenu [data-cp-choisir="chat-noir"]')), 'la feuille « Les compagnons » : le chat noir, gagné à la Maison hantée, au choix');
  await clic('#feuille-contenu [data-cp-choisir="chat-noir"]'); await sleep(400);
  check(await ev(() => window.__fournil.chatNoir()) && await attendre(() => page.evaluate(() => window.__fournil.SCENE.chatVu === 'noir'), 3000), 'choisi : le chat noir revient dans la boutique, à vie');
  await ev(() => { const b = document.querySelector('#feuille-contenu [data-cp="chat-noir"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(400);
  await shot('12-reglages-chat');
  await ev(() => { const b = document.querySelector('#feuille-contenu [data-a="cp-fermer"]'); if (b) b.click(); }); await sleep(300);
  await ev(() => window.__fournil.page('boutique'));
  await ev(() => { window.__fournil.SCENE.decosHantee(['citrouilles', 'toiles', 'chaudron', 'fantome']); window.__fournil.tiroir('ferme'); }); await sleep(1500);
  await shot('13-boutique-nuit', '#scene');
  await ev(() => { const F = window.__fournil; F.SCENE.decosHantee(F.st[F.evHantee.cle].decos); F.tiroir('mi'); });


  console.log('── après le maître : une sauvegarde déjà au 12e, à la mise à jour (le 28 octobre) ──');
  await ctx.close(); // le premier téléphone a fini (sa scène HD en rendu logiciel ne ralentit plus le second)
  { decal = new Date('2026-10-28T10:00:00+01:00').getTime() - Date.now();
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx2.addInitScript(fauxTelephone, decal); await ctx2.route(/supabase\.co/, (r) => r.abort());
    const pg = await ctx2.newPage(); pg.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    const ev2 = (fn, arg) => pg.evaluate(fn, arg), clic2 = (sel) => pg.evaluate((x) => { const b = document.querySelector(x); if (!b) return false; b.click(); return true; }, sel);
    const feuille2 = () => pg.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    const shot2 = async (nom) => { const f = path.join(out, nom + '.png'); await pg.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); };
    const charger2 = async () => { await pg.goto(URL_JEU + '?qualite=eco'); await pg.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900); };
    await pg.goto('about:blank'); await charger2();
    // d'abord l'annonce du jour sur ce premier chargement (le minuteur de 800 ms de ui.js) : posée après l'état ci-dessous, elle donnerait
    // déjà les paliers 13 et 14 ici, avant le rechargement (une course entre ce minuteur et l'évaluation, selon la charge de la machine)
    check(await attendre(() => ev2(() => { const F = window.__fournil, qq = F.st[F.evHantee.cle]; return !!(qq && qq.annonce) && !document.querySelector('#feuille').hidden; }), 20000), 'le premier chargement : l’annonce du jour d’abord');
    const av = await ev2(() => { const F = window.__fournil, R = F.HT, st = F.st, q = R.etat(st, HORLOGE.maintenant()); q.annonce = true; R.gagner(q, 3e15); q.billets = 1e14; for (let k = 1; k <= 12; k++) R.marquerPalier(q, k); q.lastSeen = HORLOGE.maintenant(); F.save();
      return { etoiles: st.etoiles, reserve: st.boosts.reserve.length, paliers: q.paliers.length, dus: R.paliersDus(q).map((p) => p.n).join() }; });
    check(av.paliers === 12 && av.dus === '13,14', 'la sauvegarde d’avant : douze paliers reçus, 3 000 Bn de bonbons (au-delà des 13e et 14e, pas encore donnés)');
    await charger2();
    check(await attendre(async () => /Palier 13/.test(await feuille2()), 20000), 'dans la boutique, sans ouvrir le Manoir : la feuille « Palier 13 » arrive toute seule');
    check(/huit paliers bonus/.test(await feuille2()), 'avec l’annonce des paliers bonus');
    await shot2('h1-palier-13-boutique');
    await clic2('#feuille [data-a="pq-ok"]'); await attendre(async () => /Palier 14/.test(await feuille2()), 3000);
    await clic2('#feuille [data-a="pq-ok"]'); await sleep(700);
    const ap = await ev2(() => { const F = window.__fournil; return { etoiles: F.st.etoiles, reserve: F.st.boosts.reserve.length, paliers: F.st[F.evHantee.cle].paliers.join(), feuille: !document.querySelector('#feuille').hidden }; });
    check(ap.paliers === '1,2,3,4,5,6,7,8,9,10,11,12,13,14' && ap.etoiles === av.etoiles + 4 && ap.reserve === av.reserve + 1 && !ap.feuille, `donnés une fois : +4 étoiles, +1 boost (${JSON.stringify({ etoiles: ap.etoiles, reserve: ap.reserve })})`);
    await ev2(() => window.__fournil.annoncerEvenements(true)); await sleep(600);
    check((await feuille2()) === '' && (await ev2(() => window.__fournil.st.etoiles)) === ap.etoiles, 'une seconde annonce ne redonne rien');
    await ev2(() => window.__fournil.hantee()); await sleep(1200);
    check(await ev2(() => document.querySelector('#hantee [data-pq="paliers"] b').textContent) === '14/20', 'le bouton des paliers passe à « 14/20 »');
    await clic2('#hantee [data-pq="paliers"]'); await sleep(400);
    const lis = await ev2(() => { const h = document.querySelector('#feuille .pq-inter'), f = document.querySelector('#feuille'); if (!h) return null; h.scrollIntoView({ block: 'start' }); f.scrollTop -= 40;
      const r = h.getBoundingClientRect(), lignes = [...document.querySelectorAll('#feuille .pq-palier.bonus')];
      return { txt: h.textContent, h: r.height, gauche: r.left, droite: r.right, taille: parseFloat(getComputedStyle(h).fontSize), n: lignes.length, nums: lignes.map((l) => l.querySelector('.pq-num').textContent).join(), recus: lignes.filter((l) => /✓/.test(l.textContent)).length, deborde: lignes.some((l) => l.getBoundingClientRect().right > innerWidth + 0.5 || l.scrollWidth > l.clientWidth + 1), horiz: f.scrollWidth > f.clientWidth + 1 }; });
    check(lis && lis.txt === 'Après le maître du Manoir' && lis.h > 10 && lis.gauche >= 0 && lis.droite <= 390 && lis.taille >= 14, `l’intertitre « ${lis && lis.txt} », dans l’écran`);
    check(lis && lis.n === 8 && lis.nums === '13,14,15,16,17,18,19,20' && lis.recus === 2 && !lis.deborde && !lis.horiz, 'dessous, les paliers 13 à 20 (13 et 14 cochés), sans déborder à 390 px');
    await sleep(300); await shot2('h2-paliers-apres-le-maitre');
    await clic2('#feuille [data-a="pq-retour"]'); await sleep(300);
    await clic2('#hantee [data-pq="ameliorations"]'); await sleep(400);
    const f2 = await feuille2();
    check(/Après le maître du Manoir/.test(f2) && /Épouvantail à chauves-souris/.test(f2) && /Balai à turbo/.test(f2), 'les Sortilèges : les quatre nouveaux sous « Après le maître du Manoir »');
    await ev2(() => { const l = [...document.querySelectorAll('#feuille .am.bonus')]; if (l[0]) l[0].scrollIntoView({ block: 'center' }); }); await sleep(250);
    await shot2('h3-sortileges-apres-le-maitre');
    await clic2('#feuille [data-a="pq-retour"]'); await sleep(300);
    // les recettes d'après le maître : les gâteaux du cimetière (13e franchi), Gaston, la pelle ×3 ; le Marché des sorcières divise le prix par deux
    { const carte = (i) => ev2((k) => { const c = document.querySelector(`#ht-cartes .carte[data-i="${k}"]`); c.scrollIntoView({ block: 'center' }); const b = c.querySelector('[data-a="ameliorer"] b, [data-a="debloquer"] b'), s = c.querySelector('[data-a="ameliorer"] small');
        return { cls: c.className, txt: c.innerText.replace(/\s+/g, ' '), prix: b ? b.textContent : '', petit: s ? s.textContent : '', pal: (c.querySelector('.palier span') || {}).textContent || '', staff: (c.querySelector('.staff-ok') || {}).textContent || '' }; }, i);
      await ev2(() => { const F = window.__fournil, q = F.st[F.evHantee.cle]; [1, 2, 3, 4, 5].forEach((i) => { q.postes[i].niv = 150; q.postes[i].staff = true; q.postes[i].actif = true; }); q.billets = 1e16; q.mode = 1; });
      await attendre(() => ev2(() => !!document.querySelector('#ht-cartes .carte[data-i="6"] [data-a="debloquer"]')), 6000); // (en éco, rendu logiciel : quelques images de retard)
      let c6 = await carte(6); const c7 = await carte(7);
      check(/Débloquer/.test(c6.txt) && /Après le palier 16/.test(c7.txt), `le 13e franchi : les gâteaux du cimetière se débloquent (${c6.prix}) ; les œufs de dragon attendent le 16e`);
      await clic2('#ht-cartes .carte[data-i="6"] [data-a="debloquer"]'); await attendre(() => ev2(() => !!document.querySelector('#ht-cartes .carte[data-i="6"] [data-a="embaucher"]')), 6000);
      await clic2('#ht-cartes .carte[data-i="6"] [data-a="embaucher"]'); await attendre(() => ev2(() => !!document.querySelector('#ht-cartes .carte[data-i="6"] .staff-ok')), 6000);
      c6 = await carte(6); check(/auto/.test(c6.cls) && c6.staff === 'Gaston le loup-garou' && /Palier 25 ×2/.test(c6.pal), `débloqués, ${c6.staff} embauché ; « ${c6.pal} »`);
      await clic2('#hantee [data-pq="ameliorations"]'); await sleep(400); await clic2('#feuille [data-id="pelle"]'); await sleep(400);
      check(await ev2(() => { const F = window.__fournil, q = F.st[F.evHantee.cle]; return q.ameliorations.pelle === true && F.HT.ameliorationMult(q, 6) === 3; }), 'son Sortilège « La pelle du fossoyeur gourmand » : gâteaux ×3');
      await ev2(() => { const b = document.querySelector('#feuille [data-id="marche"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(3500);
      await photoR(pg, 'hantee-sortileges-marche');
      await clic2('#feuille [data-a="pq-retour"]'); await sleep(300);
      await ev2(() => document.querySelector('#hantee .pq-modes button[data-mode="1"]').click()); await sleep(200);
      const avant = await carte(5), pAvant = await ev2(() => { const F = window.__fournil; return F.HT.prixNiveaux(F.st[F.evHantee.cle], 5, 1); });
      await clic2('#hantee [data-pq="ameliorations"]'); await sleep(400); await clic2('#feuille [data-id="marche"]'); await sleep(400); await clic2('#feuille [data-a="pq-retour"]'); await sleep(400);
      const apres = await carte(5), pApres = await ev2(() => { const F = window.__fournil; return F.HT.prixNiveaux(F.st[F.evHantee.cle], 5, 1); });
      check(await ev2(() => { const F = window.__fournil; return F.st[F.evHantee.cle].ameliorations.marche === true; }) && pApres === pAvant / 2 && /−50 % ×1/.test(apres.petit) && apres.prix !== avant.prix, `le Marché des sorcières acheté : un niveau de citrouilles passe de « ${avant.prix} » à « ${apres.prix} » (${apres.petit})`);
      await ev2(() => document.querySelector('#ht-cartes').scrollTo(0, 0)); }
    await ev2(() => { const F = window.__fournil, q = F.st[F.evHantee.cle]; q.total = 7e16; q.billets = 1e15; });
    check(await attendre(async () => /Palier 15/.test(await feuille2()), 5000), 'au-delà de 60 Bd : les paliers 15 à 20 s’annoncent');
    for (let k = 0; k < 5 && !/Palier 20/.test(await feuille2()); k++) { await clic2('#feuille [data-a="pq-ok"]'); await sleep(450); }
    check(/Palier 20 · La légende phosphorescente/.test(await feuille2()) && /Chapeau phosphorescent/.test(await feuille2()), 'le palier 20 : le chapeau phosphorescent pour la garde-robe');
    await shot2('h4-palier-20');
    await clic2('#feuille [data-a="pq-ok"]'); await sleep(400);
    check(await ev2(() => { const F = window.__fournil; return F.G.possede(F.st, 'hantee-lueur-chapeau') && !F.G.possede(F.st, 'hantee-or-chapeau'); }), 'le chapeau phosphorescent est dans la garde-robe (pas le doré du podium)');
    decal = HT.FIN + 3 * HEURE - Date.now();
    await pg.evaluate((d) => localStorage.setItem('test.tel', String(d)), decal); await ev2(() => window.__fournil.save());
    await charger2();
    check(await attendre(() => pg.evaluate(() => document.querySelector('#hantee').dataset.ecran === 'bilan'), 6000), 'après la fin : le bilan');
    const bil = await ev2(() => document.querySelector('#ht-corps').innerText);
    check(/20\/20 paliers/.test(bil) && /Chapeau phosphorescent/.test(bil), `le bilan compte jusqu’à 20 : ${bil.split('\n').filter((l) => /paliers|reste/.test(l)).join(' / ')}`);
    await shot2('h5-bilan-20');
    await ctx2.close(); }

  // les activités (src/activites.js) dans un troisième téléphone, le mercredi 28 octobre à 15 h (2e jour) : la barre, les trois mini-jeux au
  // doigt, un contrat, une opération (test/fournil-activites-ecran.cjs, le même parcours que la Planque)
  await require('./fournil-activites-ecran.cjs')({ browser, url: URL_JEU + '?qualite=eco', heure: (ms) => { decal = ms - Date.now(); }, quand: HT.DEBUT + 27 * HEURE, fauxTelephone, route: [/supabase\.co/, (r) => r.abort()],
    check, errors, dirs: [out, out2].filter(Boolean), prefixe: '', racine: '#hantee', ev: 'evHantee', ouvrir: 'hantee', cle: 'hantee', nom: 'le Manoir', rj: 'manoir' });

  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', e && e.stack || e); process.exit(1); });
