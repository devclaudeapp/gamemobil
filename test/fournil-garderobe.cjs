// La garde-robe du Fournil dans la vraie page (fournil/ servie en local), sur un téléphone en portrait : la carte de l'onglet Boulanger,
// la feuille (emplacements, pièces possédées, porter, améliorer en étoiles, ensembles), les bonus affichés et appliqués, le boulanger en 3D
// qui porte ce qu'on équipe (budget d'appels de dessin tenu), la sauvegarde, 360 × 640, l'artefact Claude hors ligne. Captures dans test/shots/garderobe/.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-garderobe.cjs   (PORT_GARDEROBE pour changer de port)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_GARDEROBE || 8799, BASE = `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'garderobe'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(100); } return false; };

(async () => {
  const browser = await chromium.launch();
  { const nc = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await nc(o); await c.addInitScript(() => { window.__sansQuartier = true; }); return c; }; } // pendant sa fenêtre, l'événement « Le Quartier » (icône, annonce) ne vient pas couvrir ce test (src/evenement.js)
  const errors = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET_DISCONNECTED|ERR_FAILED|404|supabase/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  const nouveau = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w || 390, height: h || 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' }); await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}' })); const p = await ctx.newPage(); suivre(p); return { ctx, p }; }; // le classement répond « pas ouvert » : la garde-robe ne dépend pas de lui
  const feuille = (p) => p.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const equipe = (p) => p.evaluate(() => window.__fournil.st.garderobe.equipe);
  const vues = (p) => p.evaluate(() => window.__fournil.SCENE.recompensesVues);
  const large = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && (document.querySelector('#feuille').hidden || document.querySelector('#feuille').scrollWidth <= document.querySelector('#feuille').clientWidth + 1));
  const installer = (p) => p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 3; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; f.xp(2000); f.scene({ heure: 13, assis: true }); f.rafraichir(); });
  const zoneBoulanger = (p) => p.evaluate(() => { const b = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones().boulanger; return { x: b.left + z.x - 24, y: b.top + z.y - 16, width: z.w + 48, height: z.h + 40 }; });
  const sansClients = (p) => p.evaluate(() => new Promise((ok) => { VIE.clients.length = 0; requestAnimationFrame(() => requestAnimationFrame(ok)); }));

  // ─── 1. l'onglet Boulanger : la carte de la garde-robe, tenue de toujours ───
  let { ctx, p } = await nouveau();
  await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/fournil/?qualite=haute'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st));
  await installer(p); await sleep(600);
  await p.evaluate(() => window.__fournil.page('boulanger')); await sleep(400);
  const carte = await p.evaluate(() => { const c = document.querySelector('[data-garderobe]'); return c ? { cases: [...c.querySelectorAll('.gr-case')].map((b) => [b.querySelector('small').textContent, b.querySelector('b').textContent, Math.round(b.getBoundingClientRect().height)]), bonus: c.querySelector('.gr-bonus').textContent, compte: c.querySelector('.compte').textContent, btn: c.querySelector('[data-gr-ouvrir]') ? c.querySelectorAll('[data-gr-ouvrir]').length : 0 } : null; });
  check(!!carte && JSON.stringify(carte.cases.map((c) => c.slice(0, 2))) === JSON.stringify([['Couvre-chef', 'Toque blanche'], ['Haut', 'Tablier blanc'], ['Chaussures', 'Sabots de bois'], ['Accessoire', 'Rien']]) && carte.cases.every((c) => c[2] >= 44), 'la carte Garde-robe de l’onglet Boulanger : quatre emplacements, la tenue de toujours, rien au cou');
  check(!!carte && /Pas encore de bonus/.test(carte.bonus) && /podiums, des événements et du parcours du boulanger/.test(carte.bonus) && carte.compte === 'tenue de toujours' && carte.btn === 5, `« ${carte && carte.bonus} » · « ${carte && carte.compte} »`);
  check(JSON.stringify(await equipe(p)) === JSON.stringify({ tete: 'toque-blanche', haut: 'tablier-blanc', pieds: 'sabots', accessoire: null }) && (await vues(p)).tenue === null, 'l’état : la tenue de base équipée, le boulanger en 3D sans toque de podium');
  await p.evaluate(() => { const el = document.querySelector('[data-garderobe]'); el.scrollIntoView({ block: 'center' }); }); await sleep(200);
  await p.screenshot({ path: out + '/01-carte-boulanger.png' });
  // la garde-robe et la réserve de boosts citent toutes leurs sources (relecture, constat 7) : le parcours du boulanger aussi, et plus seulement le Quartier
  await p.evaluate(() => window.__fournil.garderobe('tete')); await sleep(300);
  const indice = await p.evaluate(() => { const n = document.querySelector('#feuille-contenu [data-cl="garderobe"] .note.centre'); return n ? n.textContent : ''; });
  check(/Les podiums du classement, les événements et le parcours du boulanger en offrent d’autres/.test(indice), `la feuille, une seule pièce : « ${indice} »`);
  await p.evaluate(() => document.querySelector('#feuille [data-a="gr-fermer"]').click()); await sleep(300);
  const boosts = await p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st, lire = () => document.querySelector('#boosts').textContent.replace(/\s+/g, ' ').trim();
    G.donnerBoostReserve(st, 2, 1800); f.renderBoosts(); const un = lire(); G.donnerBoostReserve(st, 3, 900); f.renderBoosts(); const deux = lire();
    f.lancerBoost(); const fe = document.querySelector('#feuille-contenu').textContent.replace(/\s+/g, ' '); document.querySelector('#feuille [data-a="close"]').click();
    st.boosts.reserve.length = 0; f.renderBoosts(); return { un, deux, fe }; });
  check(/En réserve : lance-le quand tu veux/.test(boosts.un) && /2 boosts en réserve/.test(boosts.deux) && !/Quartier/.test(boosts.un + boosts.deux), `le ticket de la réserve, neutre : « ${boosts.un} » puis « ${boosts.deux} »`);
  check(/paliers des événements/.test(boosts.fe) && /parcours du boulanger/.test(boosts.fe) && /contrats de la nuit/.test(boosts.fe) && /pourboires des copains/.test(boosts.fe) && /objectif commun/.test(boosts.fe) && /classement/.test(boosts.fe), 'la feuille de la réserve : les événements, le parcours du boulanger, les contrats de la nuit, le classement, les copains et l’objectif commun');

  // ─── 2. des pièces gagnées (podium d'or, le quartier) et des étoiles : la feuille ───
  const dons = await p.evaluate(() => { const f = window.__fournil, G = f.G; const n = ['or', 'quartier'].reduce((k, c) => k + G.donnerCollection(f.st, c).length, 0); f.vetement('bronze-toque'); f.st.etoiles = 12; f.rafraichir(); return { n, stats: f.st.stats.vetements }; });
  check(dons.n === 8 && dons.stats === 9, 'huit pièces (or, quartier) et une toque de bronze données : comptées dans les statistiques');
  await sleep(300);
  check(await p.evaluate(() => /9 pièces/.test(document.querySelector('[data-garderobe] .compte').textContent)), 'la carte compte « 9 pièces »');
  await p.tap('[data-garderobe] .btn[data-gr-ouvrir]'); await sleep(500);
  const fe = await p.evaluate(() => { const f = document.querySelector('#feuille-contenu [data-cl="garderobe"]'); if (!f) return null; return { segs: [...f.querySelectorAll('[data-gr-piece]')].map((b) => [b.textContent, b.getAttribute('aria-selected'), Math.round(b.getBoundingClientRect().height)]), pieces: [...f.querySelectorAll('[data-gr-porter]')].map((b) => [b.dataset.grPorter, b.getAttribute('aria-pressed'), Math.round(b.getBoundingClientRect().height)]), ameliorer: [...f.querySelectorAll('[data-gr-ameliorer]')].map((b) => [b.dataset.grAmeliorer, b.innerText.replace(/\s+/g, ' ').trim(), b.classList.contains('non')]), tete: f.querySelector('.gr-tete').innerText, ensembles: [...f.querySelectorAll('.gr-ensemble')].map((e) => [e.className.split(' ')[1], e.querySelector('b').textContent, !!e.querySelector('[data-gr-ensemble]')]) }; });
  check(!!fe && JSON.stringify(fe.segs.map((s) => s[0])) === JSON.stringify(['Tête', 'Haut', 'Pieds', 'Accessoire']) && fe.segs[0][1] === 'true' && fe.segs.every((s) => s[2] >= 44), 'la feuille : quatre emplacements en segments, « Tête » ouvert');
  check(!!fe && JSON.stringify(fe.pieces.map((x) => x[0])) === JSON.stringify(['toque-blanche', 'or-toque', 'bronze-toque', 'quartier-casquette']) && fe.pieces[0][1] === 'true' && fe.pieces.every((x) => x[2] >= 56), 'les couvre-chefs possédés : toque blanche (portée), toque d’or, toque de bronze, casquette du quartier');
  check(!!fe && fe.ameliorer.length === 3 && fe.ameliorer.every((a) => /1 ★/.test(a[1]) && !a[2]), 'chaque pièce gagnée a son bouton « Améliorer 1 ★ » (12 étoiles en poche)');
  check(!!fe && /Aucun bonus porté/.test(fe.tete) && /12 étoiles à dépenser/.test(fe.tete), 'en tête : « Aucun bonus porté », les étoiles à dépenser');
  check(!!fe && fe.ensembles.length === 8 && fe.ensembles.filter((e) => e[2]).map((e) => e[0]).join(',') === 'or,quartier' && fe.ensembles.some((e) => e[0] === 'argent' && !e[2]), 'les ensembles : « Tout porter » pour l’or et le quartier (quatre pièces), pas pour l’argent (huit ensembles, Halloween et le parcours du boulanger compris)');
  check(await large(p), 'la feuille tient dans la largeur');
  await p.screenshot({ path: out + '/02-feuille-tete.png' });

  // ─── 3. porter, améliorer : l'état, l'affichage, la 3D ───
  await p.tap('[data-gr-porter="or-toque"]'); await sleep(500);
  check((await equipe(p)).tete === 'or-toque' && await p.evaluate(() => document.querySelector('[data-gr-porter="or-toque"]').getAttribute('aria-pressed') === 'true' && /Porté/.test(document.querySelector('[data-gr-porter="or-toque"]').innerText) && /Tous les gains \+3 %/.test(document.querySelector('.gr-tete').innerText)), 'porter la toque d’or : équipée, « Porté ✓ », le bonus en tête « Tous les gains +3 % »');
  check((await vues(p)).tenue === 'or', 'le boulanger en 3D porte la toque d’or');
  await p.tap('[data-gr-ameliorer="or-toque"]'); await sleep(500);
  const am = await p.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, niv: window.__fournil.G.niveauVetement(window.__fournil.st, 'or-toque'), txt: document.querySelector('.gr-piece.porte').innerText, btn: document.querySelector('[data-gr-ameliorer="or-toque"]').innerText.replace(/\s+/g, ' ').trim(), tete: document.querySelector('.gr-tete').innerText }));
  check(am.etoiles === 11 && am.niv === 2 && /★★☆☆☆/.test(am.txt) && /Tous les gains \+4,5 %/.test(am.txt) && /Niveau 3 : Tous les gains \+6 %/.test(am.txt) && /1 ★/.test(am.btn) && /\+4,5 %/.test(am.tete), 'améliorer : −1 étoile, niveau 2 (★★☆☆☆), « Tous les gains +4,5 % », le niveau 3 annoncé, 11 étoiles restantes');
  const taux1 = await p.evaluate(() => window.__fournil.G.tauxBase(window.__fournil.st));
  await p.evaluate(() => { window.__fournil.G.equiper(window.__fournil.st, 'tete', 'toque-blanche'); });
  const taux0 = await p.evaluate(() => window.__fournil.G.tauxBase(window.__fournil.st));
  await p.evaluate(() => { window.__fournil.G.equiper(window.__fournil.st, 'tete', 'or-toque'); });
  check(Math.abs(taux1 / taux0 - 1.045) < 1e-6, `les gains suivent vraiment : ×${(taux1 / taux0).toFixed(3)} avec la toque d’or au niveau 2`);
  await p.screenshot({ path: out + '/03-toque-or-niveau-2.png' });
  // l'ensemble d'or d'un coup, depuis la liste des ensembles
  await p.evaluate(() => { const b = document.querySelector('[data-gr-ensemble="or"]'); b.scrollIntoView({ block: 'center' }); }); await sleep(200);
  await p.tap('[data-gr-ensemble="or"]'); await sleep(500);
  const ens = await p.evaluate(() => ({ equipe: window.__fournil.st.garderobe.equipe, complet: window.__fournil.G.ensembleComplet(window.__fournil.st), tete: document.querySelector('.gr-tete').innerText, or: document.querySelector('.gr-ensemble.or').className, txt: document.querySelector('.gr-ensemble.or').innerText }));
  check(ens.complet === 'or' && JSON.stringify(ens.equipe) === JSON.stringify({ tete: 'or-toque', haut: 'or-tablier', pieds: 'or-chaussures', accessoire: 'or-foulard' }) && /complet/.test(ens.or) && /Ensemble complet porté/.test(ens.txt), '« Tout porter » : les quatre pièces d’or, l’ensemble complet');
  check(/Tenue d’or au complet/.test(ens.tete) && /Tous les gains \+16,25 %/.test(ens.tete) && /Cuisson 5 % plus rapide/.test(ens.tete) && /\+1,5 h d’absence/.test(ens.tete), 'le bonus porté en tête : gains +16,25 % (toque niveau 2 : 4,5 %, tablier 3 %, ensemble 8 %), cuisson 5 % plus vite, +1,5 h d’absence');
  check(await p.evaluate(() => { const f = window.__fournil, b = f.G.bonusGardeRobe(f.st); return Math.abs(b.gainsTous - 1.045 * 1.03 * 1.08) < 1e-3 && b.vitesse === 0.95 && b.absenceH === 1.5 && f.G.heuresAbsence(f.st) === f.G.ABSENCE_MAX_H + f.G.talent(f.st, 'levetot') + 3 + 1.5; }), 'et dans les règles : gains ×1,1625, temps de cuisson ×0,95, 8 h + 3 (chambre froide) + 1,5 h d’absence');
  await p.screenshot({ path: out + '/04-ensemble-or.png' });
  await p.tap('[data-a="gr-fermer"]'); await sleep(300);
  check(await p.evaluate(() => document.querySelector('#feuille').hidden && /Tenue d’or/.test(document.querySelector('[data-garderobe] .compte').textContent) && /\+16,25 %/.test(document.querySelector('[data-garderobe] .gr-bonus').textContent) && document.querySelectorAll('[data-garderobe] .gr-niv').length === 4), 'la carte de l’onglet suit : « Tenue d’or », le bonus, les niveaux sur les quatre cases');
  check(await p.evaluate(() => /#FFC84A/i.test(document.querySelector('#page-boulanger .boulanger-tete svg').outerHTML)), 'le portrait de la page Boulanger porte la toque d’or');
  await p.screenshot({ path: out + '/05-carte-tenue-or.png' });

  // ─── 4. le boulanger en 3D : la tenue d'or, puis celle du quartier (casquette, sweat, baskets, chaîne) ; budget d'appels de dessin ───
  await p.evaluate(() => { window.__fournil.page('boutique'); window.__fournil.tiroir('ferme'); }); await sleep(900);
  const m1 = await p.evaluate(() => window.__fournil.SCENE.maillagesRecompenses.boulanger);
  check((await vues(p)).tenue === 'or' && m1 === 8, `le boulanger en tenue d’or : ${m1} maillages (2 jambes chaussées, buste, tête, visage, 2 bras, sueur : 8 appels de dessin au plus, comme sans tenue)`);
  await sansClients(p); let zone = await zoneBoulanger(p);
  await p.screenshot({ path: out + '/06-3d-tenue-or.png', clip: zone });
  await p.evaluate(() => { const f = window.__fournil; f.G.equiperCollection(f.st, 'quartier'); f.rafraichir(); }); await sleep(900);
  const m2 = await p.evaluate(() => window.__fournil.SCENE.maillagesRecompenses.boulanger);
  check((await vues(p)).tenue === null && m2 === 8 && await p.evaluate(() => window.__fournil.G.ensembleComplet(window.__fournil.st) === 'quartier'), `la tenue du quartier : pas de toque de podium, l’ensemble du quartier, toujours ${m2} maillages`);
  await sansClients(p); zone = await zoneBoulanger(p);
  await p.screenshot({ path: out + '/07-3d-tenue-quartier.png', clip: zone });
  { // une capture par coordonnées (la scène vit sans cesse : Playwright attendrait en vain qu'elle soit « stable »), et un contrôle que la mise en page ne bouge pas
    const boite = () => p.evaluate(() => { const b = document.querySelector('#scene-wrap').getBoundingClientRect(); return { x: Math.max(0, b.left), y: Math.max(0, b.top), width: Math.min(innerWidth, b.width), height: Math.min(innerHeight, b.height) }; });
    const b1 = await boite(); await sleep(600); const b2 = await boite();
    check(JSON.stringify(b1) === JSON.stringify(b2), `la scène ne bouge pas dans la page (${JSON.stringify(b1)} puis ${JSON.stringify(b2)})`);
    await p.screenshot({ path: out + '/08-boutique-quartier.png', clip: b2 }); }
  await p.evaluate(() => { const f = window.__fournil; f.G.equiper(f.st, 'tete', 'bronze-toque'); f.G.equiper(f.st, 'accessoire', 'lunettes-rondes'); f.rafraichir(); }); await sleep(900);
  const m3 = await p.evaluate(() => window.__fournil.SCENE.maillagesRecompenses.boulanger);
  check((await vues(p)).tenue === 'bronze' && m3 === 8, `un mélange (toque de bronze, sweat du quartier, lunettes) : la toque vue des autres est de bronze, ${m3} maillages`);
  await sansClients(p); zone = await zoneBoulanger(p);
  await p.screenshot({ path: out + '/09-3d-melange.png', clip: zone });

  // ─── 5. la sauvegarde : relancer garde la tenue et les niveaux ───
  await p.evaluate(() => window.__fournil.save());
  await p.reload(); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(1200);
  const apres = await p.evaluate(() => { const f = window.__fournil; return { equipe: f.st.garderobe.equipe, niv: f.G.niveauVetement(f.st, 'or-toque'), n: Object.keys(f.st.garderobe.objets).length, etoiles: f.st.etoiles }; });
  check(JSON.stringify(apres.equipe) === JSON.stringify({ tete: 'bronze-toque', haut: 'quartier-sweat', pieds: 'quartier-baskets', accessoire: 'lunettes-rondes' }) && apres.niv === 2 && apres.n === 13 && apres.etoiles === 11 && (await vues(p)).tenue === 'bronze', 'relancé : la tenue, les 13 pièces, le niveau 2 et les 11 étoiles sont là');
  await ctx.close();

  // ─── 6. à 360 × 640 : la feuille tient, les boutons font 44 px ───
  ({ ctx, p } = await nouveau(360, 640));
  await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/fournil/'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st));
  await p.evaluate(() => { const f = window.__fournil; f.st.tuto = 99; ['or', 'argent', 'quartier-or'].forEach((c) => f.G.donnerCollection(f.st, c)); f.st.etoiles = 3; f.rafraichir(); f.garderobe('pieds'); });
  // la feuille s'ouvre en glissant : on mesure jusqu'à ce qu'elle soit posée (une machine lente y met plus de 500 ms)
  const mesurer = () => p.evaluate(() => ({ large: document.querySelector('#feuille').scrollWidth <= document.querySelector('#feuille').clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, boutons: [...document.querySelectorAll('#feuille-contenu button')].every((b) => b.getBoundingClientRect().height >= 44), pieds: [...document.querySelectorAll('[data-gr-porter]')].map((b) => b.dataset.grPorter), seg: document.querySelector('[data-gr-piece="pieds"]').getAttribute('aria-selected'), mini: Math.min(...[...document.querySelectorAll('#feuille-contenu button')].map((b) => Math.round(b.getBoundingClientRect().height))) }));
  const bon = (x) => x.large && x.boutons && x.seg === 'true' && JSON.stringify(x.pieds) === JSON.stringify(['sabots', 'or-chaussures', 'argent-chaussures', 'quartier-or-baskets']);
  let petit = null; await attendre(async () => bon(petit = await mesurer()), 10000);
  check(petit && bon(petit), `à 360 px : la feuille ouverte sur « Pieds », sans défilement de côté, tous les boutons d’au moins 44 px (${petit ? `large ${petit.large}, plus petit bouton ${petit.mini} px, ${petit.pieds.join(', ')}` : 'pas de mesure'})`);
  await p.screenshot({ path: out + '/10-feuille-360.png' });
  await p.evaluate(() => { const b = document.querySelector('.gr-ensembles'); b.scrollIntoView({ block: 'start' }); }); await sleep(200);
  await p.screenshot({ path: out + '/11-ensembles-360.png' });
  await p.tap('[data-gr-piece="accessoire"]'); await sleep(300);
  check(await p.evaluate(() => { const l = [...document.querySelectorAll('[data-gr-porter]')].map((b) => b.dataset.grPorter); return l[0] === '' && l.includes('lunettes-rondes') && l.includes('quartier-or-chaine') && document.querySelector('[data-gr-porter=""]').getAttribute('aria-pressed') === 'true'; }), 'l’accessoire : « Rien » (porté), les lunettes rondes, les foulards, la chaîne en or');
  await p.tap('[data-gr-porter="quartier-or-chaine"]'); await sleep(300);
  check((await equipe(p)).accessoire === 'quartier-or-chaine' && await p.evaluate(() => /\+0,5 h d’absence/.test(document.querySelector('.gr-tete').innerText)), 'la chaîne en or portée : +0,5 h d’absence en tête');
  await p.tap('[data-gr-ameliorer="quartier-or-chaine"]'); await sleep(300); await p.tap('[data-gr-ameliorer="quartier-or-chaine"]'); await sleep(300); await p.tap('[data-gr-ameliorer="quartier-or-chaine"]'); await sleep(400);
  check(await p.evaluate(() => window.__fournil.st.etoiles === 1 && window.__fournil.G.niveauVetement(window.__fournil.st, 'quartier-or-chaine') === 3 && /2 ★/.test(document.querySelector('[data-gr-ameliorer="quartier-or-chaine"]').innerText) && document.querySelector('[data-gr-ameliorer="quartier-or-chaine"]').classList.contains('non') && !!document.querySelector('.toast')), 'trois touches : niveaux 2 et 3 (1 + 1 étoile), la troisième refusée (le niveau 4 coûte 2 ★, il en reste 1), le bouton grisé, un message');
  await p.screenshot({ path: out + '/12-accessoire-360.png' });
  { // tous les talents appris au niveau 60 : plus de point à dépenser, ni badge sur l'onglet (relecture, constat 10 : le calcul, GAME.ptsTalents)
    const tal = await p.evaluate(() => new Promise((ok) => { const f = window.__fournil, G = f.G, st = f.st; let xp = 0; for (let n = 1; n < 60; n++) xp += G.XP_NIVEAU(n); st.xp = xp; st.talents = {}; for (const t of G.TALENTS) st.talents[t.id] = t.max;
      document.querySelector('#feuille [data-a="gr-fermer"]').click(); f.page('boulanger'); f.rafraichir();
      const lire = () => { const b = document.querySelector('#onglets [data-page="boulanger"] .badge'); return { niv: G.niveau(st), badge: b.hidden ? '' : b.textContent, page: document.querySelector('#page-boulanger').textContent.replace(/\s+/g, ' ') }; };
      requestAnimationFrame(() => { const tout = lire(); st.talents.carnet -= 1; f.rafraichir(); requestAnimationFrame(() => { const moins = lire(); st.talents.carnet += 1; f.rafraichir(); ok({ tout, moins }); }); }); }));
    check(tal.tout.niv === 60 && tal.tout.badge === '' && !/à dépenser/.test(tal.tout.page), `niveau ${tal.tout.niv}, tous les talents au maximum : pas de badge sur l’onglet Boulanger (« ${tal.tout.badge} »), pas de « à dépenser »`);
    check(tal.moins.badge === '1' && /1 point à dépenser/.test(tal.moins.page), `un cran de Carnet en moins : le badge dit 1 (« ${tal.moins.badge} »), « 1 point à dépenser »`);
  }
  await ctx.close();

  // ─── 7. l'artefact Claude : tout marche hors ligne, sans classement ───
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', offline: false });
  const p4 = await c3.newPage(); suivre(p4);
  await p4.goto(BASE + '/dist/artifact.html'); await attendre(() => p4.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800);
  await c3.setOffline(true);
  const art = await p4.evaluate(() => { const f = window.__fournil; f.st.tuto = 99; f.G.donnerCollection(f.st, 'quartier'); f.rafraichir(); f.garderobe('haut'); const ok1 = !!document.querySelector('[data-cl="garderobe"]'); const r = f.G.equiper(f.st, 'haut', 'quartier-sweat'); f.rafraichir(); return { ok1, ok2: r.ok, equipe: f.st.garderobe.equipe.haut, classement: f.classement() === null }; });
  await sleep(700);
  check(art.ok1 && art.ok2 && art.equipe === 'quartier-sweat' && art.classement && (await p4.evaluate(() => window.__fournil.SCENE.maillagesRecompenses.boulanger)) === 8, 'l’artefact Claude, hors ligne : la garde-robe s’ouvre, le sweat se porte, le boulanger en 3D suit, pas de classement');
  await c3.close();

  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  check(errors.length === 0, 'aucune erreur dans la page');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
