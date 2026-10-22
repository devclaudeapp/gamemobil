// La roulette de l'arrière-salle (lot 7) dans la vraie page (fournil/ servie en local), sur un téléphone en portrait, AU DOIGT :
// toutes les touches passent par de vrais évènements tactiles (CDP Input.dispatchTouchEvent), comme sur un iPhone.
// Parcours (iPhone 390 × 844, finesse 3) : la bascule BlackJack → Roulette ; la roue 3D bâtie à l'ouverture de la table (trois mille
// triangles environ, aucun fichier) ; la bille calée sur le numéro tiré, 37 numéros sur 37 (caseSous, fonction pure du temps) ; miser au
// doigt sur rouge, une douzaine et un plein ; un tirage forcé (window.__rouletteTirage, le commutateur de test lu par arriere.js seul) ;
// la bille qui finit, dans la scène 3D elle-même, sur le numéro tiré ; les gains payés ; l'historique ; « même mise » ; un tour perdu sur
// le zéro ; un plein sur le zéro (trophées « Plein ! » et « Le zéro », skins débloqués) ; le tapis et sa confirmation (non, puis oui) ;
// le carnet du croupier (mini-objectifs, trophées, statistiques, skins : une finition de roue achetée aux jetons d'or et choisie) ;
// la roue libérée en quittant la table ; la fortune (lifetime), les étoiles et les points de boulanger jamais touchés.
// Puis sans WebGL (le numéro s'affiche sans animation), un petit écran (360 × 640) et l'artefact Claude.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-roulette.cjs
//   captures dans test/shots/fournil-roulette/ (ou SHOTS=dossier) ; PORT_ROULETTE pour choisir le port (sinon un port libre)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(+process.env.PORT_ROULETTE || 0);
const out = process.env.SHOTS || path.join(__dirname, 'shots', 'fournil-roulette'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 50) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(50); } return false; };

function doigt(p, cdp) {
  const ev = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const toucher = async (x, y) => { await ev('touchStart', [[x, y]]); await ev('touchEnd', []); };
  const centre = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }, sel);
  const toucherEl = async (sel) => { const c = await centre(sel); if (!c) throw new Error('introuvable : ' + sel); await toucher(c.x, c.y); return c; };
  return { toucher, toucherEl, centre };
}
const etat = (p) => p.evaluate(() => window.__fournil.arriere());
const eco = (p) => p.evaluate(() => { const st = window.__fournil.st; return { coins: st.coins, lifetime: st.lifetime, lifetimeRun: st.lifetimeRun, etoiles: st.etoiles, xp: st.xp, points: JSON.stringify(st.points), jour: JSON.stringify(st.jour), semaine: JSON.stringify(st.semaine), stats: JSON.stringify(st.stats), trophees: JSON.stringify(st.trophees) }; });
const salle = (p) => p.evaluate(() => { const a = document.querySelector('#arriere'), vis = (e) => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'; const H = innerHeight, W = innerWidth;
  const boutons = [...a.querySelectorAll('button')].filter((b) => vis(b) && !b.closest('[hidden]') && !b.closest('.ar-dialogue')).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.innerText.trim() || b.getAttribute('aria-label')).replace(/\s+/g, ' '), h: Math.round(r.height), w: Math.round(r.width), dedans: r.left >= -0.5 && r.right <= W + 0.5 && r.top >= -0.5 && r.bottom <= H + 0.5 }; });
  const coupes = [...a.querySelectorAll('.ar-caisse b, .ar-sur b, .ar-jeton small, .ar-donner b, .at-titre b, .ar-cell .nom, .ar-numero i, .ar-rien-ne-va b')].filter(vis).filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
  return { large: a.scrollWidth <= a.clientWidth + 1, boutons, coupes, texte: a.innerText }; });
// la bille et le numéro : jusqu'à la fin de l'animation (7 s), puis la table revient aux mises
const finTour = (p) => attendre(async () => { const e = await etat(p); return e.roulette.phase === 'mise'; }, 15000);

(async () => {
  const PORT = server.address().port, BASE = `http://localhost:${PORT}`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL logiciel : la roue 3D
  const errors = [];
  const suivreErr = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET_DISCONNECTED|ERR_FAILED|ERR_CERT|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  const nouveau = async (w, h, dsf, init) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansQuartier = true; }); if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage(); suivreErr(p); const cdp = await ctx.newCDPSession(p); return { ctx, p, d: doigt(p, cdp) }; };
  const preparer = (p, coins) => p.evaluate((coins) => { const f = window.__fournil, G = f.G, st = f.st; st.tuto = 99; f.give(3000); G.acheter(st, 0); G.acheter(st, 1); st.coins = coins; f.page('boutique'); f.tiroir('mi'); f.rafraichir(); }, coins);
  const entrer = async (p, d, coins) => { // la salle déjà trouvée, le mot de la première fois lu, puis la bascule vers la roulette, au doigt
    await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
    await p.goto(BASE + '/fournil/'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800);
    await preparer(p, coins); await sleep(300);
    await p.evaluate(() => window.__fournil.ouvrirArriere()); await sleep(250);
    await d.toucherEl('[data-ar="asseoir"]'); await sleep(250);
    await attendre(() => p.evaluate(() => window.__fournil.st.stations.every((x) => !x.actif)), 15000); // les fours au repos : la caisse ne bouge plus que par la roulette
    await p.evaluate((c) => { window.__fournil.st.coins = c; }, coins);
    await d.toucherEl('.ar-bascule [data-table="roulette"]'); await sleep(500);
  };

  // ═══ 1. iPhone 390 × 844, finesse 3 ═══
  console.log('── iPhone 390 × 844 ──');
  let { ctx, p, d } = await nouveau(390, 844, 3);
  await entrer(p, d, 10000);
  const eco0 = await eco(p);
  await p.evaluate(() => { const G = window.__fournil.G, g = G.gagner; window.__appelsGagner = 0; G.gagner = function () { window.__appelsGagner++; return g.apply(this, arguments); }; });
  let e = await etat(p), s = await salle(p);
  check(e.table === 'roulette' && /Roulette · un seul zéro/.test(s.texte), 'la bascule ouvre la roulette (« Roulette · un seul zéro »)');
  check(await p.evaluate(() => window.__fournil.st.arriere.table === 'roulette'), 'la table choisie est notée dans la sauvegarde (st.arriere.table)');
  check(e.roulette.rendu === 'webgl' && await p.evaluate(() => document.querySelectorAll('#ar-roue canvas').length === 1), 'la roue 3D est bâtie à l’ouverture de la table (un canvas WebGL)');
  check(e.roulette.tris > 2500 && e.roulette.tris <= 3500, `la roue reste légère : ${e.roulette.tris} triangles (le repérage : 3 140)`);
  check(!e.roulette.anime, 'au repos, la roue ne se redessine pas (aucune boucle d’animation)');
  // 37 numéros sur 37 : la bille finit sur le numéro tiré, quel que soit l'angle de départ du cylindre (fonctions pures du temps)
  const cale = await p.evaluate(() => { const Rq = ARRIERE.ROUE, ok = []; for (let n = 0; n <= 36; n++) { let bon = true; for (const c0 of [0, 1.3, 4.7]) { const pl = Rq.plan(n, 6, c0); if (Rq.caseSous(pl, Rq.T_CALE) !== n || Rq.caseSous(pl, Rq.T_FIN) !== n) bon = false; } if (bon) ok.push(n); } return ok.length; });
  check(cale === 37, `la bille calée sur le tirage : ${cale}/37 numéros (à la pose et à la fin, trois angles de départ)`);
  check(s.large && !s.coupes.length && s.boutons.every((b) => b.dedans) && s.boutons.filter((b) => !/Effacer|Même mise|Chances|Numéros/.test(b.t)).every((b) => b.h >= 44 && b.w >= 44), `rien de coupé ni hors de l’écran, cibles de 44 px au moins${s.coupes.length ? ' COUPÉS : ' + s.coupes.join(', ') : ''} (${s.boutons.filter((b) => !b.dedans || b.h < 44).map((b) => `${b.t} ${b.w}×${b.h}`).join(' | ')})`);
  check(/1–18/.test(s.texte) && /Rouge/.test(s.texte) && /Noir/.test(s.texte) && /Pair/.test(s.texte) && /Impair/.test(s.texte) && /19–36/.test(s.texte) && /13–24/.test(s.texte) && /Col\. 3/.test(s.texte), 'le tapis : chances simples, douzaines, colonnes');

  // ─── miser au doigt : 1 % sur rouge, 10 % sur la 2e douzaine, 1 % en plein sur le 17 ───
  await d.toucherEl('[data-jr="0.01"]'); await sleep(100); await d.toucherEl('[data-mise="rouge"]'); await sleep(100);
  await d.toucherEl('[data-jr="0.1"]'); await sleep(100); await d.toucherEl('[data-mise="douzaine-2"]'); await sleep(100);
  await d.toucherEl('[data-vue="numeros"]'); await sleep(150);
  check((await etat(p)).roulette.vueTapis === 'numeros' && await p.evaluate(() => document.querySelectorAll('.ar-grille.numeros [data-mise]').length === 37), 'l’onglet « Numéros » : la grille des 37 pleins');
  await d.toucherEl('[data-jr="0.01"]'); await sleep(100); await d.toucherEl('[data-mise="plein-14"]'); await sleep(150);
  e = await etat(p);
  const misesVues = Object.fromEntries(e.roulette.mises.map((m) => [m.cle, m.mise]));
  check(misesVues.rouge === 100 && misesVues['douzaine-2'] === 1000 && misesVues['plein-14'] === 100 && e.roulette.total === 1200, `les mises posées : rouge 100 €, 2e douzaine 1 000 €, plein 14 100 € (${JSON.stringify(misesVues)})`);
  s = await salle(p); check(!s.coupes.length && s.boutons.every((b) => b.dedans) && s.texte.includes('Lancer la bille · ' + await p.evaluate(() => window.__fournil.G.fmtEur(1200))), '« Lancer la bille · 1,2 k € »');
  await p.screenshot({ path: out + '/01-avant-390.png' });
  await d.toucherEl('[data-vue="chances"]'); await sleep(150);
  await p.screenshot({ path: out + '/01b-avant-chances-390.png' });

  // ─── le tour : le 14 forcé (rouge, 2e douzaine) ───
  await p.evaluate(() => { window.__rouletteTirage = 14; window.__bullesVues = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => window.__bullesVues.push(n.textContent)))).observe(document.querySelector('#ar-bulles'), { childList: true }); }); // les bulles vues (une capture d'écran lente peut durer plus qu'elles)
  let c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="lancer"]');
  check(await attendre(async () => (await etat(p)).roulette.phase === 'tour', 2000), 'lancer : la table passe au tour (« Rien ne va plus… »)');
  e = await etat(p);
  check(Math.abs((await eco(p)).coins - (c0 - 1200 + 200 + 3000 + 3600)) < 1e-6, 'le tirage d’abord : mises prises et gains payés dès le lancer, dans la sauvegarde');
  check(await p.evaluate((c) => document.querySelector('#ar-coins').textContent === window.__fournil.G.fmtEur(c - 1200), c0), 'tant que la bille roule, la caisse montrée est celle d’après les mises (le gain ne se devine pas)');
  check(await p.evaluate(() => /Rien ne va plus/.test(document.querySelector('#ar-panneau').innerText)), '« Rien ne va plus… » pendant le tour');
  check(e.roulette.anime, 'la roue s’anime pendant le tour (une image par frame, seulement maintenant)');
  check(await p.evaluate(() => [...document.querySelectorAll('#ar-histo li')].every((li) => li.textContent !== '14')), 'l’historique ne trahit pas le numéro avant que la bille se pose');
  await sleep(2300); await p.screenshot({ path: out + '/02-pendant-390.png' });
  check(await attendre(async () => !(await etat(p)).roulette.anime, 9000), 'l’animation s’arrête d’elle-même (7 s)');
  e = await etat(p);
  check(e.roulette.bille === 14, `la bille finit sur le 14 : la case lue sur les objets 3D eux-mêmes (${e.roulette.bille})`);
  await sleep(150); await p.screenshot({ path: out + '/03-apres-390.png' });
  s = await salle(p);
  const num = await p.evaluate(() => document.querySelector('#ar-numero').innerText.replace(/\s+/g, ' ')), plus5600 = (await p.evaluate(() => window.__fournil.G.fmtEur(5600))).replace(/\s+/g, ' ');
  check(/14/.test(num) && /Rouge/.test(num) && num.includes('+' + plus5600), `le numéro posé sur la roue : « 14 Rouge +5,6 k € » (${num})`);
  check(await finTour(p), 'puis la table revient aux mises');
  await sleep(300); const vues = await p.evaluate(() => window.__bullesVues);
  check(vues.some((b) => /Trophée : Plein !/.test(b)), `une bulle du casino : le trophée « Plein ! » (${[...new Set(vues)].join(' | ')})`);
  check(await p.evaluate(() => document.querySelector('#ar-coins').textContent === window.__fournil.G.fmtEur(window.__fournil.st.coins)), 'la caisse montrée rattrape la vraie');
  const h1 = await p.evaluate(() => [...document.querySelectorAll('#ar-histo li')].map((li) => li.textContent));
  check(h1[h1.length - 1] === '14' && await p.evaluate(() => document.querySelector('#ar-histo li.dernier').classList.contains('rouge')), `l’historique : le 14, en rouge, au bout (${h1.join(' ')})`);
  check(await p.evaluate(() => ['rouge', 'douzaine-2', 'plein-14'].every((k) => document.querySelector(`[data-mise="${k}"]`).classList.contains('gagnee'))), 'les cases gagnantes marquées sur le tapis (rouge, 2e douzaine, plein 14)');
  await p.screenshot({ path: out + '/04-apres-tapis-390.png' });

  // ─── « même mise », puis un tour perdu sur le zéro ───
  await d.toucherEl('[data-ar="meme"]'); await sleep(150);
  e = await etat(p); check(e.roulette.total === 1200 && e.roulette.mises.length === 3, '« Même mise » : les trois mises reviennent');
  await p.evaluate(() => { window.__rouletteTirage = 0; }); c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="lancer"]'); await sleep(300); await finTour(p);
  e = await etat(p);
  check(e.roulette.numero === 0 && e.roulette.bille === 0 && Math.abs((await eco(p)).coins - (c0 - 1200)) < 1e-6, 'le zéro : toutes les chances simples, la douzaine et le plein 14 perdus (−1 200 €)');

  // ─── un plein sur le zéro : deux trophées, deux skins ───
  await d.toucherEl('[data-vue="numeros"]'); await sleep(100); await d.toucherEl('[data-mise="plein-0"]'); await sleep(100);
  c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="lancer"]'); await sleep(300); await finTour(p); await sleep(400);
  e = await etat(p);
  check(Math.abs((await eco(p)).coins - (c0 + e.roulette.total * 0 + 35 * (await p.evaluate(() => window.__fournil.st.arriere.roulette.dernier.mise)))) < 1e-6, 'le plein sur le zéro payé 35 pour 1');
  check((await p.evaluate(() => window.__bullesVues)).some((b) => /Trophée : Le zéro/.test(b)), `la bulle du casino : « Le zéro »`);
  check(await p.evaluate(() => { const c = window.__fournil.st.arriere.casino; return !!(c.trophees.plein && c.trophees.zero && c.skins.debloques.includes('roue:ebene') && c.skins.debloques.includes('roue:or')); }), 'les finitions « Ébène » et « Or » de la roue débloquées');
  await p.screenshot({ path: out + '/05-trophee-bulle-390.png' });

  // ─── le tapis, avec confirmation ───
  await d.toucherEl('[data-vue="chances"]'); await sleep(100);
  await d.toucherEl('[data-jr="1"]'); await sleep(100); await d.toucherEl('[data-mise="noir"]'); await sleep(100);
  const caisse = (await eco(p)).coins; e = await etat(p);
  check(Math.abs(e.roulette.total - caisse) < 1e-6, `le jeton « Tapis » : toute la caisse sur noir (${Math.round(caisse)} €)`);
  await d.toucherEl('[data-ar="lancer"]'); await sleep(300);
  e = await etat(p); s = await salle(p);
  check(e.dialogue === 'tapis' && /Tapis \?/.test(s.texte) && /zéro fait perdre/.test(s.texte), 'avant un tapis : « Tapis ? » (le zéro fait perdre les chances simples)');
  await p.screenshot({ path: out + '/06-tapis-390.png' });
  await d.toucherEl('[data-ar="non"]'); await sleep(250);
  check((await etat(p)).dialogue === '' && (await etat(p)).roulette.phase === 'mise' && Math.abs((await eco(p)).coins - caisse) < 1e-6, '« Pas cette fois » : rien n’est joué');
  await p.evaluate(() => { window.__rouletteTirage = 2; });
  await d.toucherEl('[data-ar="lancer"]'); await sleep(250); await d.toucherEl('[data-ar="oui"]'); await sleep(300); await finTour(p);
  check(Math.abs((await eco(p)).coins - caisse * 2) < 1e-6, `tapis gagné sur le 2 noir : la caisse double (${Math.round(caisse * 2)} €)`);

  // ─── le carnet du croupier ───
  await d.toucherEl('[data-ar="carnet"]'); await sleep(300);
  e = await etat(p); s = await p.evaluate(() => document.querySelector('.ar-boite').innerText);
  const nObj = await p.evaluate(() => document.querySelectorAll('.ar-objs li').length);
  check(e.dialogue === 'carnet' && e.carnet === 'objectifs' && nObj === 3 && /jeton/.test(s) && /0,5 %/.test(s), 'le carnet : les trois mini-objectifs du jour, les jetons d’or, la règle des 0,5 % de la caisse');
  check(await p.evaluate(() => { const o = window.__fournil.st.arriere.casino.objectifs; return o.some((x) => x.type === 'tours' || x.type === 'couleur' || x.type === 'douzaine') ? o.filter((x) => ['tours', 'couleur', 'douzaine'].includes(x.type)).every((x) => x.progres > 0) : true; }), 'les tours joués font avancer les mini-objectifs de la roulette');
  await p.screenshot({ path: out + '/07-carnet-objectifs-390.png' });
  await d.toucherEl('[data-onglet="trophees"]'); await sleep(250);
  const tr = await p.evaluate(() => [...document.querySelectorAll('.ar-trophs li')].map((li) => ({ id: li.dataset.trophee, g: li.classList.contains('gagne') })));
  check(tr.length === 11 && tr[0].g && tr.findIndex((x) => !x.g) > 0 && tr.slice(tr.findIndex((x) => !x.g)).every((x) => !x.g), `les 11 trophées du casino, gagnés d’abord (${tr.filter((x) => x.g).map((x) => x.id).join(', ')})`);
  await p.screenshot({ path: out + '/08-carnet-trophees-390.png' });
  await d.toucherEl('[data-onglet="stats"]'); await sleep(250);
  s = await p.evaluate(() => document.querySelector('[data-jeu="roulette"]').innerText);
  check(/Tours joués\s*4/.test(s) && /Pleins gagnés\s*2/.test(s), `les statistiques de la roulette : 4 tours, 2 pleins (${s.replace(/\s+/g, ' ')})`);
  check(await p.evaluate(() => !!document.querySelector('[data-jeu="blackjack"]')), 'et celles du BlackJack, à part');
  await p.screenshot({ path: out + '/09-carnet-stats-390.png' });
  await d.toucherEl('[data-onglet="skins"]'); await sleep(250);
  // une finition achetée aux jetons d'or (les jetons sont posés ici : il faudrait des jours de mini-objectifs pour en avoir 5)
  await p.evaluate(() => { window.__fournil.st.arriere.casino.jetonsOr = 6; }); await d.toucherEl('[data-onglet="skins"]'); await sleep(200);
  const voir = (sel) => p.evaluate((x) => document.querySelector(x).scrollIntoView({ block: 'center' }), sel);
  await voir('[data-skin="roue:fournil"]'); await sleep(150); await d.toucherEl('[data-skin="roue:fournil"]'); await sleep(400);
  e = await etat(p);
  check(e.skins.roue === 'fournil' && e.roulette.finition === 'fournil' && await p.evaluate(() => window.__fournil.st.arriere.casino.jetonsOr === 1), 'la finition « Le Fournil » achetée (5 jetons d’or) et choisie : la roue 3D est refaite à ses couleurs');
  await voir('[data-skin="tapis:bordeaux"]'); await sleep(150); await d.toucherEl('[data-skin="tapis:bordeaux"]'); await sleep(200);
  e = await etat(p); check(e.skins.tapis === 'bordeaux' || !(await p.evaluate(() => window.__fournil.st.arriere.casino.skins.debloques.includes('tapis:bordeaux'))), 'un skin débloqué se choisit d’une touche');
  await voir('[data-skin="croupier:smoking"]'); await sleep(150); await d.toucherEl('[data-skin="croupier:smoking"]'); await sleep(250);
  check((await etat(p)).skins.croupier === 'gilet', 'un skin à trophée pas encore gagné reste verrouillé');
  await voir('[data-skin="roue:fournil"]'); await sleep(150); await p.screenshot({ path: out + '/10-carnet-skins-390.png' });
  await d.toucherEl('.ar-boite [data-ar="ok"]'); await sleep(250);
  await p.screenshot({ path: out + '/11-roue-fournil-390.png' });

  // ─── ni fortune, ni étoiles, ni points ───
  const eco1 = await eco(p);
  check(eco1.lifetime === eco0.lifetime && eco1.lifetimeRun === eco0.lifetimeRun && eco1.etoiles === eco0.etoiles && eco1.xp === eco0.xp && eco1.points === eco0.points && eco1.semaine === eco0.semaine && eco1.stats === eco0.stats && eco1.trophees === eco0.trophees, `la fortune (lifetime), lifetimeRun, étoiles, expérience, points de boulanger, défis, statistiques et trophées de la boutique : inchangés${Object.keys(eco0).filter((k) => k !== 'coins' && eco0[k] !== eco1[k]).map((k) => ` [${k}]`).join('')}`);
  check(await p.evaluate(() => window.__appelsGagner === 0), 'aucun appel à gagner() pendant toute la roulette');

  // ─── la roue libérée en quittant la table, rebâtie au retour ; le dernier numéro reste affiché ───
  await d.toucherEl('.ar-bascule [data-table="blackjack"]'); await sleep(300);
  e = await etat(p);
  check(e.table === 'blackjack' && e.roulette.rendu === null && await p.evaluate(() => document.querySelectorAll('#ar-roue canvas').length === 0), 'retour au BlackJack : la roue 3D est libérée (plus de canvas)');
  await d.toucherEl('[data-ar="fermer"]'); await sleep(300);
  await p.evaluate(() => window.__fournil.ouvrirArriere()); await sleep(300);
  check((await etat(p)).table === 'blackjack', 'la salle rouvre sur la dernière table choisie (le BlackJack)');
  await d.toucherEl('.ar-bascule [data-table="roulette"]'); await sleep(400);
  e = await etat(p);
  check(e.roulette.rendu === 'webgl' && e.roulette.bille === 2 && /2/.test(await p.evaluate(() => document.querySelector('#ar-numero').innerText)), 'la roulette rebâtie : la bille et le numéro du dernier tour (le 2) y sont encore');
  await d.toucherEl('[data-ar="fermer"]'); await sleep(300);
  check(await p.evaluate(() => document.querySelectorAll('#ar-roue canvas').length === 0), 'la salle fermée : plus rien de la roue');
  // les trophées du casino rangés avec ceux de la boutique (page du boulanger), une fois la porte trouvée
  await p.evaluate(() => { window.__fournil.page('boulanger'); window.__fournil.tiroir('ouvert'); }); await sleep(500);
  const carteTr = await p.evaluate(() => { const h = document.querySelector('.troph-ar'); if (!h) return null; h.scrollIntoView({ block: 'center' }); return { t: h.textContent, n: h.parentElement.querySelectorAll('[data-trophee-ar]').length }; });
  check(carteTr && /L’arrière-salle · 2\/11/.test(carteTr.t) && carteTr.n === 11, `la carte « Trophées » du boulanger : « L’arrière-salle · 2/11 » (${carteTr && carteTr.t})`);
  await sleep(300); await p.screenshot({ path: out + '/12-trophees-boulanger-390.png' });
  await ctx.close();

  // ═══ 2. Sans WebGL : le numéro s'affiche sans animation ═══
  console.log('── sans WebGL ──');
  ({ ctx, p, d } = await nouveau(390, 844, 2, () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { if (this.classList.contains('ar-roue-3d') && /webgl/.test(t)) return null; return g.call(this, t, o); }; }));
  await entrer(p, d, 5000);
  e = await etat(p);
  check(e.roulette.rendu === '2d' && await p.evaluate(() => !document.querySelector('#ar-roue-2d').hidden), 'sans WebGL : une roue à plat, sans 3D');
  await d.toucherEl('[data-mise="impair"]'); await sleep(100);
  await p.evaluate(() => { window.__rouletteTirage = 5; });
  await d.toucherEl('[data-ar="lancer"]');
  check(await attendre(async () => !(await p.evaluate(() => document.querySelector('#ar-numero').hidden)), 1500), 'le numéro s’affiche tout de suite (moins d’1,5 s)');
  await finTour(p); e = await etat(p);
  check(e.roulette.numero === 5 && /5/.test(await p.evaluate(() => document.querySelector('#ar-numero').innerText)), 'le 5 impair, payé');
  await p.screenshot({ path: out + '/13-sans-webgl.png' });
  await ctx.close();

  // ═══ 3. Petit écran 360 × 640 ═══
  console.log('── 360 × 640 ──');
  ({ ctx, p, d } = await nouveau(360, 640, 2));
  await entrer(p, d, 123456789.5);
  s = await salle(p);
  check(s.large && !s.coupes.length && s.boutons.every((b) => b.dedans), `360 × 640 : rien de coupé ni hors de l’écran${s.coupes.length ? ' COUPÉS : ' + s.coupes.join(', ') : ''} (${s.boutons.filter((b) => !b.dedans).map((b) => b.t).join(', ')})`);
  await d.toucherEl('[data-mise="passe"]'); await sleep(80); await d.toucherEl('[data-mise="colonne-1"]'); await sleep(80);
  await d.toucherEl('[data-vue="numeros"]'); await sleep(120); await d.toucherEl('[data-mise="plein-34"]'); await sleep(120);
  s = await salle(p);
  check(s.large && !s.coupes.length && s.boutons.every((b) => b.dedans) && await p.evaluate(() => [...document.querySelectorAll('.ar-grille.numeros [data-mise]')].every((b) => { const r = b.getBoundingClientRect(); const t = document.querySelector('#ar-roulette').getBoundingClientRect(); return r.height >= 26 && r.bottom <= t.bottom - 4; })), '360 × 640 : la grille des 37 pleins tient sur le tapis (la roue s’efface le temps de choisir un numéro)');
  await p.screenshot({ path: out + '/01-avant-360.png' });
  await p.evaluate(() => { window.__rouletteTirage = 34; });
  await d.toucherEl('[data-ar="lancer"]'); await sleep(2300);
  await p.screenshot({ path: out + '/02-pendant-360.png' });
  await attendre(async () => !(await etat(p)).roulette.anime, 9000); await sleep(150);
  e = await etat(p); check(e.roulette.bille === 34, '360 × 640 : la bille finit sur le 34');
  await p.screenshot({ path: out + '/03-apres-360.png' });
  await finTour(p); s = await salle(p);
  check(!s.coupes.length && s.boutons.every((b) => b.dedans), '360 × 640 : après le tour, tout tient');
  for (const [o, n] of [['objectifs', '07'], ['trophees', '08'], ['stats', '09'], ['skins', '10']]) {
    if (o === 'objectifs') await d.toucherEl('[data-ar="carnet"]'); else await d.toucherEl(`[data-onglet="${o}"]`);
    await sleep(300); await p.screenshot({ path: `${out}/${n}-carnet-${o}-360.png` });
  }
  check(await p.evaluate(() => { const b = document.querySelector('.ar-boite').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 0.5 && b.right <= innerWidth + 0.5; }), '360 × 640 : le carnet tient dans l’écran (il défile)');
  await ctx.close();

  // ═══ 4. L'artefact Claude ═══
  console.log('── l’artefact ──');
  ({ ctx, p, d } = await nouveau(390, 844, 2));
  await p.goto(BASE + '/dist/artifact.html'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800);
  await preparer(p, 5000); await sleep(300);
  await p.evaluate(() => { window.__fournil.ouvrirArriere(); document.querySelector('[data-ar="asseoir"]').click(); }); await sleep(200);
  await d.toucherEl('.ar-bascule [data-table="roulette"]'); await sleep(400);
  e = await etat(p); check(e.table === 'roulette' && e.roulette.rendu === 'webgl', 'la roulette s’ouvre aussi dans l’artefact (Three.js en ligne)');
  await ctx.close();

  check(!errors.length, `aucune erreur dans la page${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\ntout est vert');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
