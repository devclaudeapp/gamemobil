// Opération Poncin — le jeu en ligne de bout en bout, sur trois téléphones simulés en paysage (la vraie page, la vraie carte, la voie
// 'local' : BroadcastChannel entre les pages d'un même contexte). A crée le salon, B le rejoint par le code, C par le lien ?salle=CODE ;
// l'hôte ajoute un robot et lance ; chacun voit les autres au même endroit ; B repeint C (crochets de test) ; la fin arrive partout ;
// l'hôte relance ; C part (il disparaît chez les autres) ; l'hôte part (« L'hôte a quitté la partie » chez B). Débits mesurés.
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-enligne.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORT = 8793;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'poncin-enligne'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const RESEAU = process.env.RESEAU || 'local'; // RESEAU=webrtc-local : la même épreuve sur le vrai WebRTC entre les pages (signalisation locale)
const URL0 = `http://localhost:${PORT}/poncin/?reseau=${RESEAU}&qualite=eco`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  const errors = [];
  const ouvrir = async (nom, url) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => { errors.push(nom + ' : ' + e.message); console.log('PAGEERROR', nom, e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_CERT|ERR_NAME|net::/.test(m.text() + ((m.location() && m.location().url) || ''))) { errors.push(nom + ' : ' + m.text()); console.log('CONSOLE', nom, m.text()); } });
    await page.goto(url);
    await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran && document.body.dataset.ecran !== 'chargement', null, { timeout: 40000 }).catch(() => {});
    return page;
  };
  const E = (page) => page.evaluate(() => window.__poncin.enLigne.etat());
  const attendre = async (page, fn, arg, ms = 15000) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } };
  const cliquer = async (page, sel) => { await page.click(sel, { timeout: 15000, noWaitAfter: true }); };
  // trois pages WebGL logicielles sur la même machine : on ne dessine la 3D que sur la page qu'on photographie (la simulation, elle, tourne partout)
  const rendu = (page, oui) => page.evaluate((o) => window.__poncin.rendu(o), oui);
  const photo = async (page, nom, ms) => { await rendu(page, true); await sleep(ms || 1500); await page.screenshot({ path: out + '/' + nom }); await rendu(page, false); };
  const fps = (page) => page.evaluate(() => window.__poncin.stats().fps);

  // ─── A crée le salon ───
  const A = await ouvrir('A', URL0);
  check(await attendre(A, () => document.body.dataset.ecran === 'titre', null, 30000), 'A : l’écran titre');
  await cliquer(A, '[data-a="jouer"]'); await cliquer(A, '#b-copains');
  check(await attendre(A, () => document.body.dataset.ecran === 'copains'), 'A : « Avec les copains » ouvre l’écran des salons');
  const pseudoA = await A.evaluate(() => document.querySelector('#moi-pseudo').textContent);
  check(/^\S+ \S+ \d\d$/.test(pseudoA), `pseudo par défaut tiré des listes : « ${pseudoA} »`);
  await A.screenshot({ path: out + '/01-copains.png' });
  await rendu(A, false);
  await cliquer(A, '#b-creer');
  check(await attendre(A, () => document.body.dataset.ecran === 'salon' && /^[A-Z]{4}$/.test(document.querySelector('#salon-code').textContent)), 'A : salon créé, un code de 4 lettres');
  const code = await A.evaluate(() => document.querySelector('#salon-code').textContent);
  const eA = await E(A);
  check(eA.estHote && eA.code === code && eA.via === RESEAU, `A est l’hôte du salon ${code} (voie ${eA.via})`);

  // ─── B rejoint par le code, C par le lien ───
  const B = await ouvrir('B', URL0);
  await attendre(B, () => document.body.dataset.ecran === 'titre', null, 30000); await rendu(B, false);
  // le pseudo se change dans les réglages (les trois pages partagent le stockage du navigateur : sans ça, même pseudo partout)
  await cliquer(B, '[data-a="reglages"]'); await B.fill('#e-reglages input[data-r="nom"]', 'Bruno'); await cliquer(B, '#e-reglages [data-a="retour"]');
  await cliquer(B, '[data-a="jouer"]'); await cliquer(B, '#b-copains');
  check((await B.evaluate(() => document.querySelector('#moi-pseudo').textContent)) === 'Bruno', 'B : pseudo modifié dans les réglages (Bruno)');
  await B.fill('#code-salon', code.toLowerCase());
  await cliquer(B, '#b-rejoindre');
  check(await attendre(B, () => document.body.dataset.ecran === 'salon'), 'B : rejoint le salon en tapant le code');
  const C = await ouvrir('C', URL0 + '&salle=' + code);
  check(await attendre(C, () => document.body.dataset.ecran === 'salon', null, 30000), 'C : ouvre le lien ?salle=CODE et arrive droit dans le salon');
  await rendu(C, false); await C.evaluate(() => window.__poncin.enLigne.pseudo('Chloé'));
  const tous = [A, B, C], noms = ['A', 'B', 'C'];
  const trois = await Promise.all(tous.map((p) => attendre(p, () => document.querySelectorAll('#salon-liste li:not(.vide)').length === 3, null, 8000)));
  check(trois.every(Boolean), 'le salon montre 3 joueurs sur les 3 pages');
  const [eB, eC] = [await E(B), await E(C)];
  check(!eB.estHote && !eC.estHote && eB.code === code && eC.code === code, 'B et C sont des clients du même salon');
  const ids = { A: eA.idMoi, B: eB.idMoi, C: eC.idMoi }, pseudos = {};
  await attendre(A, () => /Chloé/.test(document.querySelector('#salon-liste').textContent) && /Bruno/.test(document.querySelector('#salon-liste').textContent), null, 6000);
  for (const j of (await E(A)).joueurs) pseudos[j.id] = j.pseudo;
  check(pseudos[eB.idMoi] === 'Bruno' && pseudos[eC.idMoi] === 'Chloé', `les pseudos dans le salon : ${Object.values(pseudos).join(', ')} (Chloé renommée une fois dans le salon)`);
  check(new Set(Object.values(ids)).size === 3 && !Object.values(ids).includes('moi'), 'chacun a son id de salon (plus de « moi » codé en dur)');
  // prêts, réglages de l'hôte
  await cliquer(B, '#b-salon-action'); await cliquer(C, '#b-salon-action');
  check(await attendre(A, () => /2\/2/.test(document.querySelector('#salon-etat').textContent)), 'B et C disent « Prêt » : l’hôte le voit (2/2)');
  await cliquer(A, '#e-salon [data-sopt="bots"] [data-v="1"]');
  await cliquer(A, '#e-salon [data-sopt="niveau"] [data-v="facile"]');
  check(await attendre(B, () => { const b = document.querySelector('#e-salon [data-sopt="bots"] [data-v="1"]'); return b && b.getAttribute('aria-pressed') === 'true' && b.disabled; }), 'l’hôte ajoute 1 robot : B voit le réglage (en lecture seule)');
  await sleep(2600); // un tour de pings
  await photo(A, '02-salon-hote.png');
  await photo(B, '03-salon-client.png');
  const lA = await A.evaluate(() => document.querySelector('#salon-liste').innerText);
  check(/ms/.test(lA) && (RESEAU === 'local' ? /même appareil/ : /direct|relais/).test(lA), 'liste des joueurs : ping et voie (' + lA.replace(/\s+/g, ' ').slice(0, 120) + ')');

  // ─── le lancement ───
  await cliquer(A, '#b-salon-action');
  const enCompte = await Promise.all(tous.map((p) => attendre(p, () => ['compte', 'partie'].includes(document.body.dataset.ecran), null, 8000)));
  check(enCompte.every(Boolean), 'l’hôte lance : compte à rebours sur les 3 pages');
  const enPartie = await Promise.all(tous.map((p) => attendre(p, () => document.body.dataset.ecran === 'partie', null, 12000)));
  check(enPartie.every(Boolean), 'les 3 pages sont en partie');
  await sleep(1500);
  console.log(`      images/s (3D coupée) : ${(await Promise.all(tous.map(fps))).join(', ')}`);
  const etats = await Promise.all(tous.map(E));
  check(etats.every((e) => e.partie && e.partie.entites.length === 4 && e.partie.entites.filter((x) => x.bot).length === 1), `4 entités partout (3 joueurs + 1 robot) : ${etats.map((e) => e.partie ? e.partie.entites.length : '?').join(', ')}`);
  check(etats[0].partie.hote && !etats[1].partie.hote && !etats[2].partie.hote, 'A simule (hôte), B et C affichent la façade');
  // chacun se voit : positions concordantes (joueurs immobiles)
  const ecartMax = (es) => { let m = 0; for (const id of Object.values(ids)) { const r = es[0].partie.entites.find((x) => x.id === id); for (const e of es.slice(1)) { const x = e.partie.entites.find((y) => y.id === id); m = Math.max(m, x && r ? Math.hypot(x.x - r.x, x.z - r.z) : 99); } } return m; };
  const ec1 = ecartMax(etats);
  check(ec1 < 0.5, `chacun voit les autres au même endroit (écart max ${ec1.toFixed(3)} m)`);

  // ─── B repeint C ───
  const place = await A.evaluate(({ b, c }) => {
    const j = window.__poncin.jeu(), M = j.monde, R = PREGLES; let ok = null;
    for (let k = 1; k < 600 && !ok; k++) { const p = M.libre(R.mulberry32(k), j.arene.centre, 70), q = [p[0] + 9, p[1]]; if (!M.bloque(q[0], q[1], 0.6) && M.vue(p[0], M.hauteur(p[0], p[1]) + 1.6, p[1], q[0], M.hauteur(q[0], q[1]) + 1.2, q[1]) && M.vue(q[0], M.hauteur(q[0], q[1]) + 1.6, q[1], p[0], M.hauteur(p[0], p[1]) + 1.2, p[1])) ok = [p, q]; }
    if (!ok) return null;
    const eb = j.trouver(b), ec = j.trouver(c);
    eb.x = ok[0][0]; eb.z = ok[0][1]; eb.y = M.hauteur(eb.x, eb.z); ec.x = ok[1][0]; ec.z = ok[1][1]; ec.y = M.hauteur(ec.x, ec.z);
    window.__loin = () => { // le robot reste loin de B et C pendant l'épreuve (il ne doit pas repeindre C à la place de B)
      for (const bot of j.entites.filter((e) => e.bot)) { if (Math.min(Math.hypot(bot.x - eb.x, bot.z - eb.z), Math.hypot(bot.x - ec.x, bot.z - ec.z)) > 60) continue; for (let k = 1; k < 200; k++) { const p = M.libre(R.mulberry32(77 + k), j.arene.centre, 105); if (Math.min(Math.hypot(p[0] - eb.x, p[1] - eb.z), Math.hypot(p[0] - ec.x, p[1] - ec.z)) > 80) { bot.x = p[0]; bot.z = p[1]; bot.y = M.hauteur(p[0], p[1]); bot.ia = null; break; } } }
    };
    window.__loin(); window.__loinT = setInterval(window.__loin, 100);
    return ok;
  }, { b: ids.B, c: ids.C });
  check(!!place, 'l’hôte pose B et C face à face à 9 m');
  await sleep(1200);
  const placeVue = await Promise.all(tous.map(E));
  const ec2 = ecartMax(placeVue);
  check(ec2 < 0.5, `après le déplacement imposé par l’hôte, les 3 pages concordent (écart ${ec2.toFixed(3)} m)`);
  // les photos de la partie : l'hôte regarde B et C, B regarde C (les avatars des autres sont bien là)
  await A.evaluate((b) => { window.__poncin.viser(b); window.__poncin.joueur().yaw += 0.14; }, ids.B); await photo(A, '04-partie-hote.png');
  // (B vise 8° à côté de C : pile dessus, le tir automatique au doigt le repeindrait déjà)
  await B.evaluate((c) => { window.__poncin.viser(c); window.__poncin.joueur().yaw += 0.14; }, ids.C); await photo(B, '05-partie-B.png');
  const vieC0 = await A.evaluate((c) => window.__poncin.jeu().trouver(c).vie, ids.C);
  // la vie de C suivie chez l'hôte et chez C lui-même (chaque image), pendant que B tire
  await A.evaluate((c) => { window.__vies = []; window.__vieT = setInterval(() => { const e = window.__poncin.jeu().trouver(c); if (e) window.__vies.push(e.vivant ? e.vie : 0); }, 30); }, ids.C);
  await C.evaluate(() => { window.__vies = []; window.__vieT = setInterval(() => { const m = window.__poncin.joueur(); if (m) window.__vies.push(m.vivant ? m.vie : 0); }, 30); });
  let elimine = false;
  for (let k = 0; k < 80 && !elimine; k++) {
    await B.evaluate((c) => { const p = window.__poncin; p.viser(c); p.entree({ tir: true }); }, ids.C);
    await sleep(60);
    elimine = await A.evaluate((c) => !window.__poncin.jeu().trouver(c).vivant, ids.C);
  }
  await B.evaluate(() => window.__poncin.entree(null));
  const viesA = await A.evaluate(() => { clearInterval(window.__vieT); clearInterval(window.__loinT); return window.__vies; });
  check(elimine, 'C est repeint');
  const ecranRepeint = await attendre(C, () => !document.querySelector('.h-mort').hidden && /Repeint par/.test(document.querySelector('.h-mort').innerText), null, 2500);
  const viesC = await C.evaluate(() => { clearInterval(window.__vieT); return window.__vies; });
  const paliers = (v) => v.filter((x, i) => i === 0 || x !== v[i - 1]);
  check(vieC0 === 100 && paliers(viesA).length >= 3 && paliers(viesC).some((x) => x > 0 && x < 100), `B tire sur C : la vie de C baisse, chez l’hôte (${paliers(viesA).join(' → ')}) et sur la page de C (${paliers(viesC).join(' → ')})`);
  check(ecranRepeint, 'C voit l’écran « Repeint par … »');
  await photo(C, '06-repeint-C.png', 600);
  const fils = await Promise.all(tous.map(E));
  const pB = pseudos[ids.B], pC = pseudos[ids.C];
  check(fils[0].fil.some((l) => l.includes(pB) && l.includes(pC) && /a repeint/.test(l)), `fil de l’hôte : « ${fils[0].fil.find((l) => l.includes(pC)) || '—'} »`);
  check(fils[1].fil.some((l) => /Tu as repeint/.test(l) && l.includes(pC)), `fil de B : « ${fils[1].fil.find((l) => l.includes(pC)) || '—'} »`);
  check(fils[2].fil.some((l) => l.includes(pB) && /t’a repeint/.test(l)), `fil de C : « ${fils[2].fil.find((l) => l.includes(pB)) || '—'} »`);
  const sc = fils.map((e) => { const b = e.partie.entites.find((x) => x.id === ids.B), c = e.partie.entites.find((x) => x.id === ids.C); return `${b.kills}/${b.points}/${c.morts}`; });
  check(sc.every((s) => s === sc[0]) && sc[0].startsWith('1/'), `scores identiques sur les 3 pages (repeints / points de B / morts de C : ${sc.join(' · ')})`);

  // ─── débits (sur 4 s de jeu, B tirant sur l'hôte : des événements à chaque envoi) ───
  const lire = () => Promise.all(tous.map((p) => p.evaluate(() => window.__poncin.enLigne.stats().partie)));
  await B.evaluate((a) => { const p = window.__poncin; window.__tirT = setInterval(() => { p.viser(a); p.entree({ tir: true }); }, 50); }, ids.A);
  const s1 = await lire(); await sleep(4000); const s2 = await lire();
  await B.evaluate(() => { clearInterval(window.__tirT); window.__poncin.entree(null); });
  const par = (i, k) => (s2[i][k] - s1[i][k]) / ((s2[i].t - s1[i].t) / 1000);
  const d = { hote: par(0, 'envoyes'), bRecus: par(1, 'recus'), bEnvoyes: par(1, 'envoyes'), cRecus: par(2, 'recus'), cEnvoyes: par(2, 'envoyes') };
  console.log(`      hôte → chaque client : ${d.hote.toFixed(1)} messages/s ; B : reçus ${d.bRecus.toFixed(1)}/s, envoyés ${d.bEnvoyes.toFixed(1)}/s ; C : reçus ${d.cRecus.toFixed(1)}/s, envoyés ${d.cEnvoyes.toFixed(1)}/s`);
  console.log(`      clients vus par l’hôte : ${JSON.stringify(s2[0].clients)} ; B : ${JSON.stringify(s2[1])}`);
  check(Object.values(d).every((v) => v <= 35) && d.bEnvoyes > 20 && d.bRecus > 15, 'débits ≤ 35 messages/s par sens et par client (état 20/s + événements ≤ 14/s ; entrées 30/s)');

  // ─── la fin (chez l'hôte) arrive partout ───
  await A.evaluate(() => window.__poncin.finir());
  const fins = await Promise.all(tous.map((p) => attendre(p, () => document.body.dataset.ecran === 'fin' && !!document.querySelector('.h-fin-carte'), null, 8000)));
  check(fins.every(Boolean), 'la fin (finie chez l’hôte) arrive sur les 3 pages');
  const tf = await Promise.all(tous.map((p) => p.evaluate(() => document.querySelector('.h-fin').innerText)));
  check(/Rejouer/.test(tf[0]) && /Salon/.test(tf[0]) && !/Rejouer/.test(tf[1]) && /Salon/.test(tf[1]), 'l’hôte peut relancer ; les clients attendent (Salon / Quitter)');
  await photo(B, '07-fin-B.png');
  await photo(A, '08-fin-hote.png');

  // ─── l'hôte relance ───
  await cliquer(A, '.h-fin [data-fin="rejouer"]');
  const relance = await Promise.all(tous.map((p) => attendre(p, () => document.body.dataset.ecran === 'partie', null, 12000)));
  check(relance.every(Boolean), 'l’hôte relance : les 3 pages repartent en partie');
  await sleep(800);

  // ─── C quitte : il disparaît chez les autres ───
  await C.evaluate(() => window.__poncin.enLigne.quitter());
  const sansC = await Promise.all([A, B].map((p) => attendre(p, (c) => { const e = window.__poncin.enLigne.etat(); return e.partie && !e.partie.entites.some((x) => x.id === c); }, ids.C, 8000)));
  check(sansC.every(Boolean), 'C quitte : il disparaît chez A et chez B');
  check((await C.evaluate(() => document.body.dataset.ecran)) === 'copains', 'C revient à l’écran des salons');

  // ─── l'hôte quitte : message sur B ───
  await A.evaluate(() => window.__poncin.enLigne.quitter());
  check(await attendre(B, () => document.body.dataset.ecran === 'fin' && /L’hôte a quitté la partie/.test(document.querySelector('.h-fin').innerText), null, 15000), 'l’hôte quitte : B voit « L’hôte a quitté la partie »');
  await photo(B, '09-hote-parti.png');
  await cliquer(B, '.h-fin [data-fin="salon"]');
  check(await attendre(B, () => document.body.dataset.ecran === 'salon'), 'B retourne au salon (dont il devient l’hôte)');
  await attendre(B, () => { const e = window.__poncin.enLigne.etat(); return e.estHote && e.joueurs.length === 1; }, null, 20000);
  const eB2 = await E(B);
  check(eB2.estHote && eB2.joueurs.length === 1, `B est le nouvel hôte du salon, seul (${eB2.joueurs.map((j) => j.pseudo + (j.hote ? ' (hôte)' : '')).join(', ')})`);

  const errReseau = await Promise.all(tous.map((p) => p.evaluate(() => { const e = window.__poncin.enLigne.etat(); return (e.reseau ? e.reseau.erreurs : 0) + e.erreurs; })));
  check(errReseau.every((n) => n === 0), `aucune erreur rattrapée (${errReseau.join(', ')})`);
  console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' | ') : 'ERRORS none');
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  await browser.close(); server.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch((e) => { console.log('ÉCHEC', e); process.exit(1); });
