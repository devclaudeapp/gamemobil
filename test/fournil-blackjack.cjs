// L'arrière-salle du Fournil (le BlackJack caché) dans la vraie page (fournil/ servie en local), sur un téléphone en portrait, AU DOIGT :
// toutes les touches passent par de vrais évènements tactiles (CDP Input.dispatchTouchEvent), comme sur un iPhone.
// Parcours (iPhone 390 × 844, finesse 3) : la petite porte du fond dans la boutique en 3D ; quatre touches ne suffisent pas, une touche
// ailleurs remet le compte à zéro, cinq touches de suite l'ouvrent ; le mot de la première fois ; miser aux jetons (1 %, 10 %, 50 %) et au
// réglage fin ; une main jouée jusqu'au bout (tirer, rester) ; un BlackJack payé 3 pour 2 ; les deux mises annexes gagnées (Perfect Pairs,
// 21+3) ; doubler ; le tapis avec sa confirmation (non, puis oui) ; le tableau des gains ; la carte « L'arrière-salle » du Journal qui y
// ramène ; une main en cours qui survit au rechargement ; aucun événement surprise pendant la main ; la fortune (lifetime), les étoiles et
// les points de boulanger jamais touchés. Puis un petit écran (360 × 640) et l'artefact Claude.
// Les cartes des mains « à montrer » sont posées en tête du sabot (le reste du sabot reste celui du jeu).
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-blackjack.cjs
//   captures dans test/shots/fournil-blackjack/ (ou SHOTS=dossier) ; PORT_BLACKJACK pour choisir le port (sinon un port libre)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(+process.env.PORT_BLACKJACK || 0);
const out = process.env.SHOTS || path.join(__dirname, 'shots', 'fournil-blackjack'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 50) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(50); } return false; };

function doigt(p, cdp) {
  const ev = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const toucher = async (x, y) => { await ev('touchStart', [[x, y]]); await ev('touchEnd', []); };
  const centre = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; if (e.closest('#pages')) e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }, sel);
  const toucherEl = async (sel) => { const c = await centre(sel); if (!c) throw new Error('introuvable : ' + sel); await toucher(c.x, c.y); return c; };
  return { toucher, toucherEl, centre };
}
const etat = (p) => p.evaluate(() => window.__fournil.arriere());
const eco = (p) => p.evaluate(() => { const f = window.__fournil, st = f.st; return { coins: st.coins, lifetime: st.lifetime, lifetimeRun: st.lifetimeRun, etoiles: st.etoiles, xp: st.xp, points: JSON.stringify(st.points), jour: JSON.stringify(st.jour), semaine: JSON.stringify(st.semaine), stats: JSON.stringify(st.stats) }; });
// pose des cartes en tête du sabot (dans l'ordre de la donne : joueur, croupier, joueur, croupier, puis les tirages)
const empiler = (p, t) => p.evaluate((t) => { const f = window.__fournil, B = f.BJ, a = B.etat(f.st); const c = t.split(' ').map((x) => { const m = /^(A|[2-9]|10|V|D|R)([♠♥♦♣])$/.exec(x); return B.SYMBOLES.indexOf(m[2]) * 13 + B.RANGS.indexOf(m[1]) - 1; }); a.sabot = c.concat(B.nouveauSabot().slice(c.length)); a.pos = 0; }, t);
const finAnim = (p, phase) => attendre(async () => (await etat(p)).phase === phase, 8000);
const salle = (p) => p.evaluate(() => { const a = document.querySelector('#arriere'), vis = (e) => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'; const H = innerHeight, W = innerWidth;
  const boutons = [...a.querySelectorAll('button')].filter((b) => vis(b) && !b.closest('[hidden]')).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.innerText.trim() || b.getAttribute('aria-label')).replace(/\s+/g, ' '), h: Math.round(r.height), w: Math.round(r.width), dedans: r.left >= -0.5 && r.right <= W + 0.5 && r.top >= -0.5 && r.bottom <= H + 0.5 }; });
  const coupes = [...a.querySelectorAll('.ar-caisse b, .ar-sur b, .ar-case > b, .ar-jeton small, .ar-donner b, .ar-act b, .ar-act small, .at-titre b, .ar-total, .ar-resultat b, .ar-infos-main b, .ar-infos-main small')].filter(vis).filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
  const cartes = [...a.querySelectorAll('.ar-carte')].map((e) => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= W + 0.5; });
  return { large: a.scrollWidth <= a.clientWidth + 1, boutons, coupes, cartesDedans: cartes.every(Boolean), nCartes: cartes.length, texte: a.innerText }; });

(async () => {
  const PORT = server.address().port, BASE = `http://localhost:${PORT}`;
  const browser = await chromium.launch();
  { const nc = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await nc(o); await c.addInitScript(() => { window.__sansQuartier = true; }); return c; }; } // l'événement « Le Quartier » ne vient pas couvrir ce test
  const errors = [];
  const suivreErr = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET_DISCONNECTED|ERR_FAILED|ERR_CERT|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  const nouveau = async (w, h, dsf) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' }); const p = await ctx.newPage(); suivreErr(p); const cdp = await ctx.newCDPSession(p); return { ctx, p, d: doigt(p, cdp) }; };
  const preparer = (p, coins) => p.evaluate((coins) => { const f = window.__fournil, G = f.G, st = f.st; st.tuto = 99; f.give(3000); G.acheter(st, 0); G.acheter(st, 1); st.coins = coins; f.page('boutique'); f.tiroir('mi'); f.rafraichir(); }, coins);

  // ═══ 1. iPhone 390 × 844, finesse 3 ═══
  console.log('── iPhone 390 × 844 ──');
  let { ctx, p, d } = await nouveau(390, 844, 3);
  await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/fournil/'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st));
  await sleep(800); await preparer(p, 2500); await sleep(600);
  let eco0 = await eco(p);
  check(!(await p.evaluate(() => window.__fournil.st.arriere && window.__fournil.st.arriere.trouvee)), 'au départ, l’arrière-salle n’est pas trouvée');
  await p.evaluate(() => window.__fournil.journal()); await sleep(300);
  check(await p.evaluate(() => !document.querySelector('#page-journal [data-arriere]')), 'le Journal ne montre pas encore de carte « L’arrière-salle »');
  await p.evaluate(() => window.__fournil.page('boutique')); await sleep(300);

  // ─── la petite porte du fond ───
  const z = await p.evaluate(() => { const z = window.__fournil.zonePorte(), r = document.querySelector('#scene').getBoundingClientRect(), e = document.querySelector('#enseigne').getBoundingClientRect(), c = document.querySelector('#coin').getBoundingClientRect(); return z && { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2, w: z.w, h: z.h, sousEnseigne: r.top + z.y + z.h / 2 > e.bottom, sousCoin: r.left + z.x + z.w > c.left && r.top + z.y < c.bottom }; });
  check(z && z.w >= 44 && z.h >= 44, `la porte du fond a une zone de touche de 44 × 44 au moins (${z && Math.round(z.w)} × ${z && Math.round(z.h)})`);
  check(z && z.sousEnseigne && !z.sousCoin, 'elle se touche : ni sous l’enseigne, ni sous les icônes du coin');
  const mailles = await p.evaluate(() => window.__fournil.SCENE.maillagesRecompenses.salle);
  check(mailles === 11, `la porte est fusionnée avec la plinthe et les cadres : la salle garde ses 11 maillages (10 + le trottoir de la devanture, 17 octobre), pas d’appel de dessin en plus (${mailles})`);
  await p.screenshot({ path: out + '/01-porte.png' });
  await p.screenshot({ path: out + '/01b-porte-zoom.png', clip: { x: 0, y: 50, width: 390, height: 150 } });
  // quatre touches : rien ; une touche ailleurs remet le compte à zéro
  for (let k = 0; k < 4; k++) { await d.toucher(z.x, z.y); await sleep(120); }
  await sleep(400); check(!(await etat(p)).ouvert, 'quatre touches sur la porte : rien ne s’ouvre');
  await d.toucher(200, 330); await sleep(150); // le sol de la boutique
  await d.toucher(z.x, z.y); await sleep(150);
  await sleep(300); check(!(await etat(p)).ouvert, 'une touche ailleurs remet le compte à zéro (4 + 1 ailleurs + 1 ≠ 5 de suite)');
  await sleep(3200); // et les touches trop anciennes (plus de 3 s) ne comptent plus
  // une feuille surgie entre-temps (le chat, une annonce) prendrait les touches : on la ferme, et on dit ce qui gênait si la porte reste close
  const genes = () => p.evaluate(() => ({ feuille: !document.querySelector('#feuille').hidden && (document.querySelector('#feuille-contenu').innerText || '').split('\n')[0], tiroir: window.__fournil.tiroir() }));
  const cinqTouches = async () => { await p.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); window.__fournil.tiroir('ferme'); }); await sleep(400);
    for (let k = 0; k < 5; k++) { await d.toucher(z.x + (k % 2 ? 4 : -4), z.y + (k % 3) - 1); await sleep(140); }
    return attendre(async () => (await etat(p)).ouvert, 2000); };
  let ouverte = await cinqTouches();
  if (!ouverte) { console.log(`        (porte restée close : ${JSON.stringify(await genes())} ; on recommence une fois)`); await sleep(3200); ouverte = await cinqTouches(); }
  check(ouverte, 'cinq touches de suite (en moins de 3 s) : l’arrière-salle s’ouvre');
  await sleep(400);
  let s = await salle(p), e = await etat(p);
  check(e.dialogue === 'accueil' && /Tu as trouvé l’arrière.salle…/.test(s.texte), 'la première fois : « Tu as trouvé l’arrière-salle… »');
  check(/ne compte pour le classement ni pour ta fortune/.test(s.texte), 'le mot dit que rien ne compte pour le classement ni la fortune');
  await p.screenshot({ path: out + '/02-salle-ouverture.png' });
  await d.toucherEl('[data-ar="asseoir"]'); await sleep(300);
  // la boutique a pu vendre une fournée lancée par les touches dans la salle 3D : la référence est prise une fois les fours au repos, salle ouverte
  await attendre(() => p.evaluate(() => window.__fournil.st.stations.every((x) => !x.actif)), 15000); eco0 = await eco(p);
  await p.evaluate(() => { const G = window.__fournil.G, g = G.gagner; window.__appelsGagner = 0; G.gagner = function () { window.__appelsGagner++; return g.apply(this, arguments); }; });
  e = await etat(p); s = await salle(p);
  check(e.dialogue === '' && e.phase === 'mise', 'on s’assied à la table : place aux mises');
  check(s.large && !s.coupes.length && s.boutons.every((b) => b.dedans) && s.boutons.filter((b) => !/Effacer/.test(b.t)).every((b) => b.h >= 44 && b.w >= 44), `rien de coupé ni hors de l’écran, cibles de 44 px au moins (${s.boutons.map((b) => `${b.t} ${b.w}×${b.h}`).join(' | ')})${s.coupes.length ? ' COUPÉS : ' + s.coupes.join(', ') : ''}`);
  check(s.boutons.find((b) => /Effacer/.test(b.t)).h >= 44, '« Effacer » aussi : 44 px de haut');
  check(/1\s%\s25\s€/.test(s.texte) && /10\s%\s250\s€/.test(s.texte) && /50\s%/.test(s.texte) && /Tapis/.test(s.texte), `les jetons rapides : 1 % (25 €), 10 % (250 €), 50 %, Tapis (${s.boutons.filter((b) => /%|Tapis/.test(b.t)).map((b) => b.t).join(' | ')})`);
  check(await p.evaluate(() => document.querySelector('#arriere').getBoundingClientRect().top <= 0 && getComputedStyle(document.querySelector('#arriere')).position === 'fixed'), 'plein écran, par-dessus la boutique (comme l’Atelier)');

  // ─── le tableau des gains ───
  await d.toucherEl('[data-ar="gains"]'); await sleep(300); s = await salle(p);
  check((await etat(p)).dialogue === 'gains' && /Paire mixte[\s\S]*5 pour 1/.test(s.texte) && /Paire de couleur[\s\S]*12 pour 1/.test(s.texte) && /Paire parfaite[\s\S]*25 pour 1/.test(s.texte), 'le tableau des gains : Perfect Pairs 5, 12, 25 pour 1');
  check(/Couleur[\s\S]*5 pour 1/.test(s.texte) && /Quinte[\s\S]*10 pour 1/.test(s.texte) && /Brelan[\s\S]*30 pour 1/.test(s.texte) && /Quinte couleur[\s\S]*40 pour 1/.test(s.texte) && /Brelan de même enseigne[\s\S]*100 pour 1/.test(s.texte) && /3 pour 2/.test(s.texte), '21+3 : couleur 5, quinte 10, brelan 30, quinte couleur 40, brelan de même enseigne 100 ; BlackJack 3 pour 2');
  await p.screenshot({ path: out + '/08-tableau-gains.png' });
  await d.toucherEl('.ar-boite [data-ar="ok"]'); await sleep(250);

  // ─── miser : jetons et réglage fin ───
  await d.toucherEl('[data-jeton="0.1"]'); await sleep(120);
  e = await etat(p); check(e.mises.main === 250, `le jeton 10 % pose 250 € sur la mise (${e.mises.main})`);
  await d.toucherEl('[data-ar="plus"]'); await sleep(120); e = await etat(p); const apresPlus = e.mises.main;
  await d.toucherEl('[data-ar="moins"]'); await sleep(120); e = await etat(p);
  check(apresPlus > 250 && e.mises.main === 250, `le réglage fin : + (${apresPlus} €) puis − (${e.mises.main} €)`);
  await d.toucherEl('[data-case="paires"]'); await sleep(100); await d.toucherEl('[data-jeton="0.01"]'); await sleep(100);
  await d.toucherEl('[data-case="plus3"]'); await sleep(100); await d.toucherEl('[data-jeton="0.01"]'); await sleep(100);
  e = await etat(p); check(e.mises.paires === 25 && e.mises.plus3 === 25 && e.choix === 'plus3', 'les mises annexes : on touche la case, puis le jeton (25 € sur Perfect Pairs, 25 € sur 21+3)');

  // ─── une main jouée jusqu'au bout, avec les deux annexes gagnées : 8♥ 8♦ (paire de couleur) et le 8♠ du croupier (brelan) ───
  await empiler(p, '8♥ 8♠ 8♦ 6♦ 3♣ R♣');
  let c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="donner"]');
  check(await attendre(async () => (await etat(p)).main && (await p.evaluate(() => !document.querySelector('#ar-annonce').hidden && /Perfect Pairs|21\+3/.test(document.querySelector('#ar-annonce').textContent))), 5000), 'la donne : les annexes se règlent tout de suite (annonce sur le tapis)');
  await sleep(250);
  await p.screenshot({ path: out + '/05-side-bet-gagne.png' });
  await finAnim(p, 'jeu'); e = await etat(p);
  const pp = e.main.annexes.find((x) => x.id === 'paires'), p3 = e.main.annexes.find((x) => x.id === 'plus3');
  check(pp.type === 'couleur' && pp.gain === 25 * 13 && p3.type === 'brelan' && p3.gain === 25 * 31, `Perfect Pairs : paire de couleur (+${pp.gain} €, 12 pour 1) ; 21+3 : brelan (+${p3.gain} €, 30 pour 1)`);
  check(Math.abs((await eco(p)).coins - (c0 - 300 + 325 + 775)) < 1e-6, 'la caisse : mises prises, annexes payées dès la donne');
  check(e.vue.cachee && e.vue.croupier === 2 && e.vue.joueur === 2, 'la deuxième carte du croupier reste cachée');
  s = await salle(p);
  check(s.boutons.some((b) => b.t.startsWith('Tirer')) && s.boutons.some((b) => b.t.startsWith('Rester')) && s.boutons.some((b) => b.t.startsWith('Doubler')) && s.boutons.filter((b) => /^(Tirer|Rester|Doubler)/.test(b.t)).every((b) => b.h >= 44), 'pendant la main : Tirer, Rester, Doubler (44 px au moins)');
  // pas d'événement surprise pendant la main
  await p.evaluate(() => { const st = window.__fournil.st; st.evTimer = 0.2; st.mystereTimer = 0.2; st.chatAttente = 0.2; });
  await sleep(1500);
  check(await p.evaluate(() => !window.__fournil.st.ev && document.querySelector('#feuille').hidden), 'aucun événement surprise ni feuille qui surgit pendant la main');
  await d.toucherEl('[data-ar="tirer"]'); await finAnim(p, 'jeu'); await sleep(200);
  e = await etat(p); check(e.main.joueur.length === 3 && !e.main.fin, `tirer : une carte de plus (${e.main.joueur.join(' ')} = 19)`);
  await p.screenshot({ path: out + '/03-main-en-cours.png' });
  c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="rester"]'); await finAnim(p, 'mise'); await sleep(300);
  e = await etat(p);
  check(e.main.fin && e.main.croupier.length === 3 && e.main.resultat === 'croupierBrule' && Math.abs((await eco(p)).coins - (c0 + 500)) < 1e-6, `rester : le croupier retourne sa carte (8 + 6 = 14), tire le roi et brûle à 24 : +250 € (${e.main.croupier.join(' ')})`);
  s = await salle(p); check(/Gagné !/.test(s.texte) && /Le croupier brûle à 24/.test(s.texte), 'le résultat s’affiche : « Gagné ! », « Le croupier brûle à 24 »');

  // ─── un BlackJack (3 pour 2) ───
  await d.toucherEl('[data-ar="effacer"]'); await sleep(100); await d.toucherEl('[data-case="main"]'); await sleep(80); await d.toucherEl('[data-jeton="0.1"]'); await sleep(100);
  e = await etat(p); const miseBJ = e.mises.main;
  await empiler(p, 'A♠ 9♣ R♥ 7♦');
  c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="donner"]'); await finAnim(p, 'mise'); await sleep(450);
  e = await etat(p); s = await salle(p);
  check(e.main.resultat === 'blackjack' && Math.abs((await eco(p)).coins - (c0 + miseBJ * 1.5)) < 1e-6 && /BlackJack !/.test(s.texte) && /Payé 3 pour 2/.test(s.texte), `BlackJack ! payé 3 pour 2 (${miseBJ} € → +${miseBJ * 1.5} €)`);
  await p.screenshot({ path: out + '/04-blackjack-gagne.png' });

  // ─── doubler ───
  await empiler(p, '6♠ 10♥ 5♦ 7♣ 9♦');
  c0 = (await eco(p)).coins;
  await d.toucherEl('[data-ar="donner"]'); await finAnim(p, 'jeu');
  await d.toucherEl('[data-ar="doubler"]'); await finAnim(p, 'mise'); await sleep(200);
  e = await etat(p); check(e.main.double && e.main.joueur.length === 3 && e.main.resultat === 'gagne' && Math.abs((await eco(p)).coins - (c0 + e.main.mise / 2 * 2)) < 1e-6, `doubler : mise ×2 (${e.main.mise} €), une seule carte (20), gagné contre 17`);

  // ─── le tapis, avec confirmation ───
  await d.toucherEl('[data-ar="effacer"]'); await sleep(100);
  await d.toucherEl('[data-jeton="tapis"]'); await sleep(150);
  const caisse = (await eco(p)).coins; e = await etat(p);
  check(Math.abs(e.mises.main - caisse) < 1e-6, `Tapis : toute la caisse sur la mise (${Math.round(caisse)} €)`);
  await d.toucherEl('[data-ar="donner"]'); await sleep(300);
  e = await etat(p); s = await salle(p);
  check(e.dialogue === 'tapis' && /Tapis \?/.test(s.texte) && /toute la caisse/.test(s.texte), 'avant un tapis : « Tapis ? Tu mets toute la caisse en jeu »');
  await p.screenshot({ path: out + '/06-tapis-confirmation.png' });
  await d.toucherEl('[data-ar="non"]'); await sleep(250);
  check((await etat(p)).dialogue === '' && !(await etat(p)).main.fin === false && Math.abs((await eco(p)).coins - caisse) < 1e-6, '« Non, je réfléchis » : rien n’est joué');
  await empiler(p, '10♠ 10♥ 9♦ 8♣');
  await d.toucherEl('[data-ar="donner"]'); await sleep(250); await d.toucherEl('[data-ar="oui"]');
  await attendre(async () => (await eco(p)).coins === 0, 3000);
  check((await eco(p)).coins === 0, 'tapis : la caisse est vide pendant la main (tout est sur le tapis)');
  await finAnim(p, 'jeu'); await d.toucherEl('[data-ar="rester"]'); await finAnim(p, 'mise'); await sleep(200);
  e = await etat(p); check(e.main.tapis && e.main.resultat === 'gagne' && Math.abs((await eco(p)).coins - caisse * 2) < 1e-6, `tapis gagné : la caisse double (${Math.round(caisse * 2)} €)`);

  // ─── ni fortune, ni étoiles, ni points ───
  const eco1 = await eco(p);
  check(eco1.lifetime === eco0.lifetime && eco1.lifetimeRun === eco0.lifetimeRun && eco1.etoiles === eco0.etoiles && eco1.xp === eco0.xp && eco1.points === eco0.points && eco1.semaine === eco0.semaine && eco1.stats === eco0.stats, `la fortune publiée (lifetime ${Math.round(eco1.lifetime)} €), lifetimeRun, étoiles, expérience, points de boulanger, défis, statistiques : inchangés${Object.keys(eco0).filter((k) => k !== 'coins' && eco0[k] !== eco1[k]).map((k) => ` [${k} : ${eco0[k]} → ${eco1[k]}]`).join('')}`);
  check(await p.evaluate(() => window.__appelsGagner === 0), 'aucun appel à gagner() pendant toutes ces mains');
  check(eco1.coins !== eco0.coins, `seule la caisse a bougé (${Math.round(eco0.coins)} € → ${Math.round(eco1.coins)} €)`);

  // ─── la carte du Journal ───
  await d.toucherEl('[data-ar="fermer"]'); await sleep(400);
  check(!(await etat(p)).ouvert, 'la croix ferme l’arrière-salle');
  await d.toucherEl('#onglets [data-page="journal"]'); await sleep(400); await p.evaluate(() => window.__fournil.tiroir('ouvert')); await sleep(400);
  const carte = await p.evaluate(() => { const c = document.querySelector('#page-journal [data-arriere]'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { texte: c.innerText, h: r.height, dernier: !c.nextElementSibling }; });
  check(carte && /L’arrière-salle/.test(carte.texte) && carte.h >= 44 && carte.dernier, `une carte discrète « L’arrière-salle », tout en bas du Journal (${carte && Math.round(carte.h)} px)`);
  await sleep(300); await p.screenshot({ path: out + '/07-journal-carte.png' });
  await d.toucherEl('#page-journal [data-arriere]');
  check(await attendre(async () => (await etat(p)).ouvert, 2000) && (await etat(p)).dialogue === '', 'la carte du Journal ramène à la table (sans le mot de la première fois)');

  // ─── une main en cours survit au rechargement (la mise ne revient pas) ───
  await d.toucherEl('[data-ar="effacer"]'); await sleep(80); await d.toucherEl('[data-jeton="0.01"]'); await sleep(80);
  await empiler(p, '10♠ 10♥ 6♦ 8♣ 3♥');
  c0 = (await eco(p)).coins; const m1 = (await etat(p)).mises.main;
  await d.toucherEl('[data-ar="donner"]'); await finAnim(p, 'jeu');
  await p.evaluate(() => window.__fournil.save());
  await p.reload(); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(900);
  check(Math.abs((await eco(p)).coins - (c0 - m1)) < 1e-6 && !(await etat(p)).ouvert, 'rechargée au milieu d’une main : la mise reste prise');
  await p.evaluate(() => { window.__fournil.journal(); window.__fournil.tiroir('ouvert'); }); await sleep(400);
  check(await p.evaluate(() => /Une main t’attend/.test((document.querySelector('#page-journal [data-arriere]') || {}).innerText || '')), 'le Journal dit qu’une main attend sur le tapis');
  await d.toucherEl('#page-journal [data-arriere]'); await attendre(async () => (await etat(p)).ouvert, 2000); await sleep(300);
  e = await etat(p); check(e.phase === 'jeu' && e.main.joueur.length === 2 && !e.main.fin, `la main reprend telle quelle (${e.main.joueur.join(' ')})`);
  await d.toucherEl('[data-ar="tirer"]'); await finAnim(p, 'jeu'); await sleep(100);
  e = await etat(p); check(e.main.joueur[2] === '3♥', 'et la carte suivante est celle du même sabot (3♥)');
  await d.toucherEl('[data-ar="rester"]'); await finAnim(p, 'mise');
  check((await eco(p)).lifetime === eco0.lifetime, 'toujours aucune incidence sur la fortune');
  await ctx.close();

  // ═══ 2. Petit écran 360 × 640 : une longue main ═══
  console.log('── 360 × 640 ──');
  ({ ctx, p, d } = await nouveau(360, 640, 2));
  await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/fournil/'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800);
  await preparer(p, 123456789.5); await sleep(400);
  const z2 = await p.evaluate(() => { const z = window.__fournil.zonePorte(), r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2 }; });
  for (let k = 0; k < 5; k++) { await d.toucher(z2.x, z2.y); await sleep(150); }
  check(await attendre(async () => (await etat(p)).ouvert, 2000), '360 px : la porte s’ouvre aussi en cinq touches');
  await d.toucherEl('[data-ar="asseoir"]'); await sleep(250);
  s = await salle(p);
  check(s.large && !s.coupes.length && s.boutons.every((b) => b.dedans), `360 × 640 : rien de coupé ni hors de l’écran à la mise${s.coupes.length ? ' COUPÉS : ' + s.coupes.join(', ') : ''} (${s.boutons.filter((b) => !b.dedans).map((b) => b.t).join(', ')})`);
  await d.toucherEl('[data-jeton="0.5"]'); await sleep(80); await d.toucherEl('[data-case="paires"]'); await sleep(80); await d.toucherEl('[data-jeton="0.01"]'); await sleep(80);
  await empiler(p, 'A♠ 10♣ A♥ 6♦ A♦ A♣ 2♠ 2♥ 2♦ R♠');
  await d.toucherEl('[data-ar="donner"]'); await finAnim(p, 'jeu');
  for (let k = 0; k < 5; k++) { await d.toucherEl('[data-ar="tirer"]'); await finAnim(p, 'jeu'); }
  e = await etat(p); s = await salle(p);
  check(e.main.joueur.length === 7 && s.cartesDedans && s.large && !s.coupes.length && s.boutons.every((b) => b.dedans), `sept cartes (${e.main.joueur.join(' ')}) : la main tient dans l’écran, boutons visibles (${s.nCartes} cartes, dedans ${s.cartesDedans}, large ${s.large}, coupés ${s.coupes.join(',')}, hors ${s.boutons.filter((b) => !b.dedans).map((b) => b.t).join(',')})`);
  await p.screenshot({ path: out + '/09-petit-ecran.png' });
  await d.toucherEl('[data-ar="rester"]'); await finAnim(p, 'mise'); await sleep(300);
  s = await salle(p); check(!s.coupes.length && s.boutons.every((b) => b.dedans), '360 × 640 : le résultat et le panneau tiennent');
  await p.screenshot({ path: out + '/10-petit-ecran-resultat.png' });
  await ctx.close();

  // ═══ 3. L'artefact Claude ═══
  console.log('── l’artefact ──');
  ({ ctx, p, d } = await nouveau(390, 844, 2));
  await p.goto(BASE + '/dist/artifact.html'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800);
  await preparer(p, 5000); await sleep(300);
  check(await p.evaluate(() => window.__fournil.ouvrirArriere() && window.__fournil.arriere().ouvert), 'l’arrière-salle s’ouvre aussi dans l’artefact');
  await ctx.close();

  check(!errors.length, `aucune erreur dans la page${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\ntout est vert');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
