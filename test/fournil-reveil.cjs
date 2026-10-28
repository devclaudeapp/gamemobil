// Les gains hors ligne quand l'app n'est pas fermée (iPhone verrouillé, app installée laissée ouverte) : la page dort, performance.now()
// s'arrête, et iOS ne prévient pas toujours (pas de visibilitychange). Ici, le sommeil est simulé : l'heure du téléphone ET celle du serveur
// avancent, performance.now() non, sans aucun événement. Le détecteur de réveil doit payer l'absence (feuille « Pendant ton absence »),
// l'écran d'un événement ouvert (le Manoir de la Maison hantée ; la Planque, écartée avec le Quartier le 27 oct., était ici avant, à remettre à son retour) doit payer ses apprentis (jusqu'à la fermeture si l'événement ferme pendant le sommeil, puis le bilan) ; avancer seulement l'heure du téléphone ne rapporte rien ; un même sommeil n'est payé qu'une fois.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-reveil.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_REVEIL || 8869;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const H = 3600e3, DEPART = new Date('2026-10-28T10:00:00+01:00').getTime(); // le 2e jour de la Maison hantée (le Manoir est ouvert)
let decalServeur = DEPART - Date.now();
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(Date.now() + decalServeur).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  // l'heure du téléphone : décalée, et avançable d'un coup (le sommeil) sans que performance.now() bouge
  await ctx.addInitScript((d0) => { let d = d0; const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; window.__avancerTel = (ms) => { d += ms; };
    // le gel (iPhone, app laissée en arrière-plan sans verrouiller) : performance.now() avance aussi, avec les images
    let dp = 0; const pn = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); performance.now = () => pn() + dp; window.requestAnimationFrame = (cb) => raf((t) => cb(t + dp)); window.__geler = (ms) => { d += ms; dp += ms; }; window.__deriver = (ms) => { dp += ms; }; window.__sansQuartier = false; }, decalServeur);
  await ctx.route(/supabase\.co/, (r) => r.abort());
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(1500);
  const fermerFeuille = () => page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="pq-tard"]'); if (b) b.click(); }); // (l'annonce du Manoir : « Plus tard »)
  await fermerFeuille();
  // une boulangerie qui tourne toute seule : des produits ouverts et des apprentis
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e9); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); st.tuto = 99; f.save(); });
  await sleep(1500); await fermerFeuille();
  const argent = () => page.evaluate(() => window.__fournil.st.coins);
  const feuille = () => page.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const sommeil = async (ms, serveurAussi = true) => { if (serveurAussi) decalServeur += ms; await page.evaluate((x) => window.__avancerTel(x), ms); };

  console.log('── la page dort 2 h (téléphone et serveur avancent, performance.now() non, aucun événement) ──');
  let a0 = await argent();
  await sommeil(2 * H);
  check(await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'reveil')), 'le détecteur de réveil voit le sommeil et lance le retour');
  check(await attendre(async () => /absence/i.test(await feuille())), `la feuille « Pendant ton absence » s'ouvre (${(await feuille()).replace(/\s+/g, ' ').slice(0, 70)})`);
  let a1 = await argent();
  check(a1 > a0 * 1.0 && a1 - a0 > 0, `l'absence est payée : +${Math.round(a1 - a0)} €`);
  const paye2h = a1 - a0;
  await fermerFeuille(); await sleep(2500);
  const a2 = await argent();
  check(a2 - a1 < paye2h * 0.2, 'et une seule fois (rien de plus dans les secondes qui suivent)');

  console.log('── triche : seule l\'heure du téléphone avance de 3 h ──');
  await page.evaluate(() => { window.__fournil.st.lastSeen = window.__fournil.st.lastSeen; }); const t0 = await argent();
  await sommeil(3 * H, false);
  await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours), 6000); await sleep(3000);
  const t1 = await argent();
  check(t1 - t0 < paye2h * 0.2, `le serveur n'a pas bougé : rien de payé pour ces 3 h (+${Math.round(t1 - t0)} €, contre ${Math.round(paye2h)} € pour 2 h de vrai sommeil)`);
  await fermerFeuille();
  // (le téléphone reste 3 h en avance : le jeu suit l'heure du serveur)
  await sleep(1500); await fermerFeuille();

  console.log('── un sommeil d\'1 h avec un visibilitychange en même temps : payé une fois ──');
  const v0 = await argent();
  await sommeil(1 * H);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await attendre(async () => /absence/i.test(await feuille())); await sleep(3000);
  const v1 = await argent();
  check(v1 - v0 > 0 && v1 - v0 < paye2h * 0.75, `1 h payée une fois (+${Math.round(v1 - v0)} €, environ la moitié des 2 h)`);
  await fermerFeuille();

  console.log('── une nuit de 12 h : plafonnée comme une vraie absence ──');
  const plafondH = await page.evaluate(() => window.__fournil.G.heuresAbsence(window.__fournil.st)); const n0 = await argent();
  await sommeil(12 * H);
  await attendre(async () => /absence/i.test(await feuille())); await sleep(1500);
  const n1 = await argent(), txt = (await feuille()).replace(/\s+/g, ' ');
  check(n1 - n0 > paye2h * 1.5 && n1 - n0 < paye2h * (plafondH / 2) * 1.15, `payée jusqu'au plafond de ${plafondH} h (+${Math.round(n1 - n0)} € ; feuille : ${txt.slice(0, 50)})`);
  await fermerFeuille();

  console.log('── une courte veille de 30 s : payée sans feuille ──');
  const c0 = await argent();
  await sommeil(30e3);
  await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'reveil' && !window.__fournil.retour.enCours)); await sleep(1500);
  const c1 = await argent();
  check(c1 > c0 && !/Pendant ton absence/.test(await feuille()), `+${Math.round(c1 - c0)} €, sans feuille (moins de 90 s)`);

  console.log('── le Manoir ouvert pendant le sommeil ──');
  await fermerFeuille(); await page.evaluate(() => window.__fournil.hantee()); await sleep(500);
  await page.evaluate(() => { const F = window.__fournil, q = F.st[F.evHantee.cle]; q.billets = 5e4; }); await sleep(200);
  await page.evaluate(() => { const b = document.querySelector('#ht-cartes [data-a="embaucher"]'); if (b) b.click(); }); await sleep(1500);
  const b0 = await page.evaluate(() => { const F = window.__fournil; return F.st[F.evHantee.cle].billets; });
  await sommeil(1 * H);
  await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'reveil' && !window.__fournil.retour.enCours)); await sleep(1500);
  const b1 = await page.evaluate(() => { const F = window.__fournil; return F.st[F.evHantee.cle].billets; });
  check(b1 > b0, `l'apprenti du Manoir a travaillé pendant le sommeil : +${Math.round(b1 - b0)} bonbons`);
  await page.evaluate(() => { const b = document.querySelector('#hantee [data-pq="fermer"]'); if (b) b.click(); }); await sleep(800); await fermerFeuille();

  console.log('── le jeu gelé 2 h (performance.now() avance aussi, aucun événement : l\'app laissée en arrière-plan, téléphone éveillé) ──');
  const g0 = await argent();
  decalServeur += 2 * H; await page.evaluate((x) => window.__geler(x), 2 * H);
  // deux gardes peuvent le voir les premiers : le détecteur de gel (chaque seconde) ou le filet de la boucle (le trou entre deux images) ;
  // l'ordre dépend de la machine, les deux lancent le même retour, payé une fois (vérifié plus bas)
  check(await attendre(() => page.evaluate(() => ['gel', 'saut'].includes(window.__fournil.retour.dernier))), 'le gel est vu (détecteur ou filet) et lance le retour');
  check(await attendre(async () => /absence/i.test(await feuille())), `la feuille « Pendant ton absence » s'ouvre (${(await feuille()).replace(/\s+/g, ' ').slice(0, 60)})`);
  await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours)); const g1 = await argent();
  check(g1 - g0 > paye2h * 0.6, `les 2 h sont payées : +${Math.round(g1 - g0)} € (contre ${Math.round(paye2h)} € au réveil)`);
  await fermerFeuille(); await sleep(2500);
  check((await argent()) - g1 < paye2h * 0.2, 'une seule fois');

  console.log('── le filet : un gel que le détecteur a manqué (la page se disait « cachée » au dégel) ──');
  const f0 = await argent();
  await page.evaluate((h) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.__geler(2 * h); }, H);
  decalServeur += 2 * H;
  check(await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'saut')), 'la boucle ne tique pas par-dessus le trou : elle lance le retour');
  await page.evaluate(() => { delete document.visibilityState; });
  check(await attendre(async () => /absence/i.test(await feuille())), 'la feuille « Pendant ton absence » s\'ouvre');
  await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours)); const f1 = await argent();
  check(f1 - f0 > paye2h * 0.6, `les 2 h sont payées : +${Math.round(f1 - f0)} €`);
  await fermerFeuille();

  console.log('── le journal des retours ──');
  const jr = await page.evaluate(() => window.__fournil.st.journalRetours || []);
  const raisons = jr.map((e) => e.r).join(',');
  check(jr.length >= 6 && jr.length <= 10, `${jr.length} retours notés (10 au plus) : ${raisons}`);
  check(raisons.includes('reveil') && (raisons.includes('gel') || raisons.includes('saut')), 'le réveil et le gel (ou le saut) y sont');
  const dernierJ = jr[jr.length - 1];
  check(dernierJ && ['saut', 'gel'].includes(dernierJ.r) && dernierJ.n === 'feuille' && dernierJ.s > 7000 && dernierJ.g > 0, `le dernier : ${JSON.stringify(dernierJ)}`);
  check(jr.some((e) => e.n === 'court'), 'la veille de 30 s y est, « moins de 90 s »');
  await page.evaluate(() => window.__fournil.page('reglages')); await sleep(600);
  check(await page.evaluate(() => !!document.querySelector('[data-a="journal-retours"]')), 'Réglages › « Journal des retours »');
  await page.evaluate(() => document.querySelector('[data-a="journal-retours"]').click()); await sleep(600);
  const txtJ = (await feuille()).replace(/\s+/g, ' ');
  check(/Journal des retours/.test(txtJ) && /Le jeu reprend après une pause/.test(txtJ) && /moins de 90 s/.test(txtJ), `la feuille du journal (${txtJ.slice(0, 120)})`);
  await page.screenshot({ path: path.join(process.env.CAPTURES_REVEIL || require('os').tmpdir(), 'journal-retours.png') });
  await fermerFeuille();
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  console.log('── le compteur du téléphone saute de 3 h en pleine partie (l’heure, elle, n’a pas bougé) ──');
  {
    await fermerFeuille(); await sleep(6000); // une sauvegarde juste avant
    const d0 = await argent();
    await page.evaluate((x) => window.__deriver(x), 3 * H);
    check(await attendre(() => page.evaluate(() => (window.__fournil.st.journalRetours || []).some((e) => e.r === 'recul'))), 'l’heure sûre ramène le jeu à l’heure (« Horloge du jeu remise à l’heure »)');
    await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours)); await sleep(1500);
    const jr = await page.evaluate(() => window.__fournil.st.journalRetours);
    const r = jr.filter((e) => e.r === 'recul').pop(), dv = jr.filter((e) => e.r === 'derive').pop();
    check(!!dv && dv.o > 3 * 3600 - 60, `le mouchard a vu le compteur sauter (+${dv && Math.round(dv.o / 60)} min)`);
    check(r && Math.abs(r.o - 3 * 3600) < 120 && r.s < 60, `recul de ${r && Math.round(r.o / 60)} min, absence rendue ${r && r.s} s (la sauvegarde était à l’heure : rien d’inventé)`);
    const ecartJeu = (await page.evaluate(() => window.__fournil.st.now)) - (Date.now() + decalServeur);
    check(Math.abs(ecartJeu) < 60e3, `le jeu est à l’heure (écart ${Math.round(ecartJeu / 1000)} s)`);
    const d1 = await argent();
    check(d1 - d0 < paye2h * 0.05 && !/Pendant ton absence/.test(await feuille()), `pas de fausse absence (+${Math.round(d1 - d0)} €)`);
    const a0 = await argent(); await sommeil(1 * H);
    await attendre(async () => /absence/i.test(await feuille())); await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours)); await sleep(1000);
    const a1 = await argent();
    check(a1 - a0 > paye2h * 0.35, `puis 1 h de vraie absence est payée normalement (+${Math.round(a1 - a0)} €)`);
    await fermerFeuille();
  }

  console.log('── une vieille sauvegarde 2 h 46 en avance (le cas d’Adolf) : le jeu revient à l’heure et paie la vraie absence ──');
  {
    await sleep(6000);
    const save = await page.evaluate((srv) => { const s = JSON.parse(localStorage.getItem('fournil.v2')); const avance = (2 * 60 + 46) * 60e3, parti = 3600e3; s.lastSeen = srv - parti + avance; s.horloge = { sure: srv - parti, jeu: s.lastSeen }; delete s.vuTel; s.journalRetours = []; return JSON.stringify(s); }, Date.now() + decalServeur);
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx2.addInitScript(([raw, d0]) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d0); } static now() { return D.now() + d0; } } window.Date = F; window.__sansQuartier = false; if (!sessionStorage.getItem('graine')) { sessionStorage.setItem('graine', '1'); localStorage.setItem('fournil.v2', raw); localStorage.setItem('fournil.horloge', JSON.stringify(JSON.parse(raw).horloge)); } }, [save, decalServeur]);
    await ctx2.route(/supabase\.co/, (r) => r.abort());
    const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => erreurs.push(e.message));
    await p2.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await p2.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(2000);
    const txt = await p2.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText.replace(/\s+/g, ' ')));
    const jr2 = await p2.evaluate(() => window.__fournil.st.journalRetours || []);
    const rc = jr2.find((e) => e.r === 'recul'), lc = jr2.find((e) => e.r === 'lancement');
    check(rc && Math.abs(rc.o - 106 * 60) < 120 && Math.abs(rc.s - 166 * 60) < 120, `au lancement : horloge remise à l’heure (−${rc && Math.round(rc.o / 60)} min : 2 h 46 d’avance moins l’heure passée), ${rc && Math.round(rc.s / 60)} min d’absence rendues`);
    check(lc && Math.abs(lc.o - 3600) < 120 && lc.n === 'feuille' && /Pendant ton absence/.test(txt), `la vraie heure d’absence est payée, avec la feuille (${lc && Math.round(lc.o / 60)} min ; ${txt.slice(0, 40)})`);
    const ecart2 = (await p2.evaluate(() => window.__fournil.st.now)) - (Date.now() + decalServeur);
    check(Math.abs(ecart2) < 60e3, `le jeu est à l’heure (écart ${Math.round(ecart2 / 1000)} s)`);
    await p2.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); }); await sleep(300);
    await p2.evaluate(() => window.__fournil.journalRetours()); await sleep(500);
    const tj = await p2.evaluate(() => document.querySelector('#feuille-contenu').innerText.replace(/\s+/g, ' '));
    check(/remise à l’heure/.test(tj), `le journal le montre (${tj.slice(0, 160)})`);
    await p2.screenshot({ path: path.join(process.env.CAPTURES_REVEIL || require('os').tmpdir(), 'journal-recul.png') });
    await ctx2.close();
  }
  console.log('── une vieille sauvegarde à la boutique n°14, sans parcours, partie depuis 8 h : le parcours d’abord, l’absence ensuite ──');
  {
    const G = require('../src/game.js'), srv = Date.now() + decalServeur;
    const raw = await page.evaluate((srv) => { const s = JSON.parse(localStorage.getItem('fournil.v2')), parti = srv - 8 * 3600e3; s.boutiques = 14; delete s.parcours; s.lastSeen = parti; s.vuTel = parti; s.horloge = { sure: parti, jeu: parti }; s.journalRetours = []; return JSON.stringify(s); }, srv);
    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx4.addInitScript(([r, d0]) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d0); } static now() { return D.now() + d0; } } window.Date = F; window.__sansQuartier = false; if (!sessionStorage.getItem('graine')) { sessionStorage.setItem('graine', '1'); localStorage.setItem('fournil.v2', r); localStorage.setItem('fournil.horloge', JSON.stringify(JSON.parse(r).horloge)); } }, [raw, decalServeur]);
    await ctx4.route(/supabase\.co/, (r) => r.abort());
    const p4 = await ctx4.newPage(); p4.on('pageerror', (e) => erreurs.push(e.message));
    await p4.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await p4.waitForFunction(() => window.__fournil && window.__fournil.st && (window.__fournil.st.journalRetours || []).some((e) => e.r === 'lancement'), null, { timeout: 30000 }); await sleep(1500);
    const lc = await p4.evaluate(() => window.__fournil.st.journalRetours.find((e) => e.r === 'lancement'));
    const txt4 = await p4.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText.replace(/\s+/g, ' ')));
    // ce que vaut cette absence, au moteur du jeu : avec les récompenses des boutiques n°2 à 14 (+2 % de gains, 50 étoiles…), et sans
    const avec = JSON.parse(raw), sans = JSON.parse(raw), rc4 = G.rattraperParcours(avec), fin4 = avec.lastSeen + lc.s * 1000;
    const gAvec = G.absence(avec, fin4).total, gSans = G.absence(sans, fin4).total;
    check(rc4.length === 13 && lc.s > 8 * 3600 - 60 && /Pendant ton absence/.test(txt4), `8 h d’absence payées au lancement, avec la feuille (${Math.round(lc.s / 60)} min ; ${txt4.slice(0, 30)})`);
    check(gAvec > gSans * 1.02 && Math.abs(lc.g - gAvec) <= gAvec * 0.005, `l’absence compte le parcours : ${Math.round(lc.g)} € payés, ${Math.round(gAvec)} € attendus avec le parcours (${Math.round(gSans)} € sans lui : +${((gAvec / gSans - 1) * 100).toFixed(1)} %)`);
    await p4.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
    check(await attendre(() => p4.evaluate(() => !document.querySelector('#feuille').hidden && /Ton parcours/.test(document.querySelector('#feuille-contenu').innerText)), 8000), 'puis, la feuille du retour refermée, le récapitulatif « Ton parcours »');
    check(await p4.evaluate(() => { const p = window.__fournil.st.parcours; return !!p && p.recus.length === 13 && p.gains === 2; }), 'les récompenses des boutiques n°2 à 14 sont reçues une fois (+2 % de gains)');
    await ctx4.close();
  }
  console.log('── le Manoir ouvert, le téléphone verrouillé 3 h avant la fermeture, rouvert après : payé jusqu’à la fermeture, puis le bilan ──');
  {
    const Q = require('../src/hantee.js'); // (la Planque, écartée avec le Quartier le 27 oct., était ici avant : à remettre à son retour)
    decalServeur = Q.FIN - 3 * H - Date.now();
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx3.addInitScript((d0) => { let d = d0; const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; window.__avancerTel = (ms) => { d += ms; }; window.__sansQuartier = false; }, decalServeur);
    await ctx3.route(/supabase\.co/, (r) => r.abort());
    const p3 = await ctx3.newPage(); p3.on('pageerror', (e) => erreurs.push(e.message));
    await p3.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await p3.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(1500);
    const fermer3 = () => p3.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="pq-tard"]'); if (b) b.click(); });
    await fermer3(); await p3.evaluate(() => window.__fournil.hantee()); await sleep(800);
    await p3.evaluate(() => { const F = window.__fournil, Q = F.HT, q = F.st[F.evHantee.cle]; q.billets = 1e9; for (let i = 0; i < 3; i++) { Q.acheter(q, i); Q.embaucher(q, i); } q.billets = 0; }); await sleep(1200);
    // la carte du produit suivant, pas encore débloqué : « Rapporte X la vente » dit le vrai gain de sa première vente (à la main, présence comprise)
    const carte = await p3.evaluate(() => { const F = window.__fournil, Q = F.HT, q = F.st[F.evHantee.cle], c = document.querySelector('#ht-cartes .carte[data-i="3"]'), m = c && /Rapporte (.+?) la vente/.exec(c.innerText.replace(/\s+/g, ' '));
      const x = JSON.parse(JSON.stringify(q)); x.billets = 1e12; Q.acheter(x, 3); x.postes.forEach((s, i) => { if (i !== 3) s.actif = false; }); const t0 = x.total; Q.lancer(x, 3); Q.tick(x, Q.temps(x, 3) + 0.01, x.now); // la vraie première vente, au moteur du jeu
      return { texte: m ? m[1] : '', gain: x.total - t0, attendu: F.evHantee.F.fmtPhrase(x.total - t0), base: Q.PRODUITS[3].rev }; });
    check(carte.texte && carte.texte === carte.attendu && carte.gain > carte.base * 6, `la carte « Rapporte ${carte.texte} la vente » : la vraie première vente fait ${carte.attendu} (le prix de base : ${carte.base})`);
    // une opération en cours et une partie de mini-jeu ouverte au moment du verrouillage
    await p3.evaluate(() => { const F = window.__fournil, Q = F.HT; Q.lancerOperation(F.st[F.evHantee.cle], Q.OPERATIONS[0].id, HORLOGE.maintenant(), () => 0.99); });
    await p3.evaluate(() => document.querySelector('#hantee [data-act="mini"]').click()); await sleep(400);
    await p3.evaluate(() => document.querySelector('#feuille [data-jeu]').click()); await sleep(400);
    check(await p3.evaluate(() => !document.querySelector('#hantee .pq-mini').hidden), 'une partie de mini-jeu est ouverte');
    const avant = await p3.evaluate((fin) => { const F = window.__fournil, Q = F.HT, q = F.st[F.evHantee.cle], x = JSON.parse(JSON.stringify(q)); x.lastSeen = Math.max(x.lastSeen, x.now); Q.absence(x, fin); const op = Q.ramasserOperation(x, fin); return { total: q.total, attendu: x.total - q.total, op: op ? op.net : 0 }; }, Q.FIN);
    decalServeur += 4 * H; await p3.evaluate((x) => window.__avancerTel(x), 4 * H);
    check(await attendre(() => p3.evaluate(() => document.querySelector('#hantee').dataset.ecran === 'bilan'), 15000), 'au réveil, l’événement est fini : le bilan');
    const apres = await p3.evaluate(() => { const F = window.__fournil, q = F.st[F.evHantee.cle]; return { total: q.total, lastSeen: q.lastSeen, absenceFin: q.absenceFin, operation: q.operation, mini: !document.querySelector('#hantee .pq-mini').hidden, enMini: document.querySelector('#hantee').classList.contains('en-mini') }; });
    const gain = apres.total - avant.total;
    check(apres.absenceFin && apres.lastSeen === Q.FIN && Math.abs(gain - avant.attendu) <= avant.attendu * 0.02, `l’équipe est payée jusqu’à la fermeture, pas au-delà : +${Math.round(gain)} bonbons (attendu ${Math.round(avant.attendu)}, dont l’opération ${Math.round(avant.op)})`);
    check(!apres.operation && !apres.mini && !apres.enMini, 'les activités s’arrêtent : l’opération est ramassée, le mini-jeu fermé');
    await sleep(2500);
    const encore = await p3.evaluate(() => { const F = window.__fournil; return F.st[F.evHantee.cle].total; });
    await p3.evaluate(() => { const b = document.querySelector('#hantee [data-pq="fin"]'); if (b) b.click(); }); await sleep(300); await p3.evaluate(() => window.__fournil.hantee()); await sleep(400);
    const fin3 = await p3.evaluate(() => ({ total: window.__fournil.st[window.__fournil.evHantee.cle].total, ecran: document.querySelector('#hantee').dataset.ecran }));
    check(encore === apres.total && fin3.total === apres.total && fin3.ecran === 'bilan', 'payé une seule fois (rien de plus ensuite, ni en rouvrant le bilan)');
    await ctx3.close();
  }
  check(erreurs.length === 0, `toujours aucune erreur (${erreurs.slice(0, 3).join(' | ')})`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (réveil).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
