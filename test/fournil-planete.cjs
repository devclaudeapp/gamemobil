// La petite planète de « Ma chaîne » (src/planete.js), maquette derrière ?planete=1 (src/planete-ecran.js), téléphone en portrait (390 × 844).
// On vérifie :
// · sans ?planete=1 : ni bouton ni écran, le jeu tel qu'avant ;
// · avec ?planete=1 : le bouton rond du coin ouvre l'écran plein (la boutique, derrière, ne se dessine plus) ; à la n°31, trente boutiques,
//   une instance et un drapeau chacune, de plus en plus luxueuses (six standings) ; le kit (hd/planete/planete.glb) demandé une fois,
//   ≤ 600 Ko ; ≤ 60 appels de dessin, ≤ 40 000 triangles en haute, dans la vue d'arrivée et dans la pire des vues (chaque région devant,
//   de loin et de près), à la n°31 et à la n°60 ;
// · au doigt (de vrais touchers, CDP Input.dispatchTouchEvent) : un glissé fait tourner la planète, l'inertie la porte puis s'éteint ;
//   pincer zoome, le zoom trop poussé revient doucement dans ses bornes, la planète se redresse ;
// · toucher le drapeau d'une boutique : elle vient devant, la caméra s'approche, puis l'étiquette (n°, quartier, « Gérant : aucun », jetons
//   à prendre) ; « Entrer » répond ; toucher le ciel : l'étiquette part, la caméra recule ;
// · fermer : l'écran et son canvas partent ; cinq ouvertures et fermetures : la planète rebâtie à l'identique (géométries, textures),
//   la boutique et le tas JS (après le ramasse-miettes) stables ;
// · l'heure : l'écran passe celle de Paris ; à 23 h la nuit (le fond, les vitres allumées), à 19 h le soir, à midi le jour (PLANETE.heure) ;
// · en éco : ≤ 15 000 triangles (la pire des vues aussi, à la n°31 et à la n°60), ni kit, ni nuages ; ?hd=0 : le sol et les boutiques
//   procéduraux seuls, aucune requête hd/planete ;
// · aucune erreur dans la page.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-planete.cjs   (port : PORT_PLANETE)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_PLANETE || 8878;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const demandes = []; // les fichiers hd/planete demandés, avec leur poids
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } if (p.includes('/hd/planete/')) demandes.push({ p, n: d.length }); res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 150) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(150); } return false; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrirJeu(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = []; page.setDefaultTimeout(120000);
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(t + (m.location() && m.location().url))) erreurs.push(t); });
    demandes.length = 0;
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 60000 }); await sleep(500);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    for (let k = 0; k < 4; k++) { await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a$="tard"], #feuille [data-a="ok"]'); if (b) b.click(); }); await sleep(200); }
    await ev(() => { const st = window.__fournil.st; st.tuto = 99; st.mystereTimer = 1e9; st.evTimer = 1e9; window.__fournil.tiroir('ferme'); });
    const cdp = await ctx.newCDPSession(page);
    // (un toucher ; ts : son heure, en secondes, pour un glissé à la cadence d'un vrai écran quelle que soit la lenteur de la machine de test)
    const touche = (type, pts, ts) => cdp.send('Input.dispatchTouchEvent', Object.assign({ type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) }, ts ? { timestamp: ts } : {}));
    const tas = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(100); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    return { ctx, page, erreurs, ev, touche, tas };
  }
  // la pire des vues : chaque région devant, de loin (penchée comme au repos) et de près ; la boucle suspendue le temps de la ronde
  const pire = (ev) => ev(() => {
    PLANETE.essai.pause(true); let calls = 0, tri = 0, ou = '';
    for (let i = 0; i < PLANETE.REG.length; i++) for (const [z, pe] of [[0, 0.36], [0.72, 0]]) { PLANETE.essai.regarder(i, z, pe); PLANETE.essai.image(1 / 60, 2); const s = PLANETE.stats; calls = Math.max(calls, s.calls); if (s.triangles > tri) { tri = s.triangles; ou = PLANETE.REG[i].id + (z ? ' de près' : ''); } }
    PLANETE.essai.repos(); PLANETE.essai.pause(false); return { calls, tri, ou };
  });

  // ─── 1. sans ?planete=1 : rien ne change ───
  {
    const { ctx, ev, erreurs } = await ouvrirJeu('?qualite=haute');
    const r = await ev(() => ({ bouton: !!document.querySelector('#b-planete'), ecran: !!document.querySelector('#planete'), actif: PLANETE_ECRAN.actif, coin: [...document.querySelectorAll('#coin > button')].map((b) => b.id) }));
    check(!r.bouton && !r.ecran && !r.actif, `sans ?planete=1 : ni bouton ni écran (coin : ${r.coin.join(', ')})`);
    check(!demandes.length, 'sans ?planete=1 : aucun fichier de la planète demandé');
    check(!erreurs.length, `aucune erreur (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  // ─── 2. avec ?planete=1, qualité haute ───
  const { ctx, page, ev, touche, tas, erreurs } = await ouvrirJeu('?planete=1&qualite=haute');
  check(await ev(() => !!document.querySelector('#coin #b-planete')), 'le bouton rond de la planète est dans le coin de la boutique');
  // une partie à la boutique n°31 : la chaîne compte les n°1 à 30
  await ev(() => { const f = window.__fournil, G = f.G; f.st.boutiques = 31; f.st.quartierFixe = G.quartierDe(31); });
  // (la boutique se rebâtit à son nouveau standing, ses modèles HD arrivent, puis ses clients 3D, cuits à petits pas : on attend qu'ils soient
  // prêts et que sa mémoire ne bouge plus — sans la planète, elle passe ainsi de 40/14 à 72/45 géométries/textures en une vingtaine de secondes)
  const memScene = () => ev(() => `${SCENE.stats.geometries}/${SCENE.stats.textures}`);
  await attendre(() => ev(() => !SCENE.clients3d || SCENE.clients3d.pret), 90000);
  for (let k = 0, der = '', stable = 0; k < 60 && stable < 4; k++) { await sleep(500); const m = await memScene(); stable = m === der ? stable + 1 : 0; der = m; }
  const avant = await ev(() => ({ scene: { g: SCENE.stats.geometries, t: SCENE.stats.textures }, canvas: document.querySelectorAll('canvas').length }));
  await ev(() => { window.__perduJeu = 0; document.querySelector('#scene').addEventListener('webglcontextlost', () => { window.__perduJeu++; }); }); // (le contexte de la boutique ne doit jamais être sacrifié)
  const tas0 = await tas();
  await page.tap('#b-planete');
  check(await attendre(() => ev(() => PLANETE.ouvert && !!document.querySelector('#planete .pl-toile'))), 'le bouton ouvre l\'écran plein de la planète');
  check(await attendre(() => ev(() => PLANETE.stats && PLANETE.stats.kit), 20000), 'le kit de la planète arrive (qualité haute)');
  await sleep(1800); // (l'arrivée : un quart de tour, puis elle se pose)
  let s = await ev(() => PLANETE.stats);
  check(s.boutiques === 30 && s.placees === 30, `trente boutiques, toutes posées dans leur quartier (${s.placees}/${s.boutiques})`);
  const drap = await ev(() => ({ n: document.querySelectorAll('#planete .pl-drap').length, vus: [...document.querySelectorAll('#planete .pl-drap')].filter((d) => d.style.visibility !== 'hidden').length, titre: document.querySelector('#planete .at-titre').textContent }));
  check(drap.n === 30 && drap.vus >= 8, `un drapeau numéroté par boutique (${drap.n}, dont ${drap.vus} face à nous)`);
  check(/30 boutiques/.test(drap.titre) && /10\/10 quartiers/.test(drap.titre), `le titre : « ${drap.titre.replace(/\s+/g, ' ').trim()} »`);
  const std = await ev(() => { const o = {}; for (let n = 1; n <= 30; n++) { const s = GAME.standingDe(n); o[s] = (o[s] || 0) + 1; } return o; });
  check(Object.keys(std).length === 6, `les six standings sont là (${JSON.stringify(std)})`);
  const hp = await ev(() => ({ planete: PLANETE.stats.heure, paris: GAME.heureParis(Date.now()), phase: PLANETE.stats.phase }));
  check(Math.abs(hp.planete - hp.paris) < 0.05, `l'heure de Paris, comme le ciel de la boutique (${hp.planete.toFixed(2)} h : ${hp.phase})`);
  const poids = demandes.reduce((a, d) => a + d.n, 0), glb = demandes.filter((d) => /planete\.glb$/.test(d.p)).length;
  check(glb === 1 && poids <= 600 * 1024, `le kit demandé une fois, ${(poids / 1024).toFixed(0)} Ko (≤ 600 Ko)`);
  const fondu = await ev(() => { const r = SCENE.stats.rendus; return new Promise((ok) => setTimeout(() => ok(SCENE.stats.rendus - r), 1500)); });
  check(fondu === 0, `la boutique ne se dessine plus derrière l'écran (${fondu} rendus en 1,5 s)`);
  s = await ev(() => PLANETE.stats);
  check(s.calls <= 60, `${s.calls} appels de dessin (≤ 60)`);
  check(s.triangles <= 40000, `${s.triangles} triangles en haute (≤ 40 000)`);
  let pv = await pire(ev);
  check(pv.calls <= 60 && pv.tri <= 40000, `la pire des vues (chaque région devant, de loin et de près) : ${pv.calls} appels, ${pv.tri} triangles (${pv.ou})`);

  // ─── au doigt : tourner, l'inertie, pincer, le retour doux ───
  const q0 = await ev(() => PLANETE.essai.etat().q);
  let ts = Date.now() / 1000; await touche('touchStart', [[150, 420]], ts);
  for (let k = 1; k <= 10; k++) await touche('touchMove', [[150 + k * 14, 420 + k * 3]], ts += 0.016);
  await touche('touchEnd', [], ts += 0.016);
  const e1 = await ev(() => PLANETE.essai.etat());
  const tourne = 2 * Math.acos(Math.min(1, Math.abs(q0[0] * e1.q[0] + q0[1] * e1.q[1] + q0[2] * e1.q[2] + q0[3] * e1.q[3])));
  check(tourne > 0.4, `un glissé de 140 px fait tourner la planète (${(tourne * 180 / Math.PI).toFixed(0)}°)`);
  check(Math.abs(e1.vx) > 0.05, `l'inertie la porte au lâcher (${e1.vx.toFixed(2)} rad/s)`);
  check(await attendre(() => ev(() => { const e = PLANETE.essai.etat(); return e.vx === 0 && e.vy === 0; }), 8000), 'puis l\'inertie s\'éteint');
  const z0 = await ev(() => PLANETE.stats.z);
  await touche('touchStart', [[180, 420], [210, 450]]);
  for (let k = 1; k <= 12; k++) { await touche('touchMove', [[180 - k * 9, 420 - k * 13], [210 + k * 9, 450 + k * 13]]); await sleep(16); }
  const zp = await ev(() => PLANETE.stats.z);
  await touche('touchEnd', []);
  check(zp > z0 + 0.3, `pincer zoome (${z0} → ${zp})`);
  check(await attendre(() => ev(() => PLANETE.stats.z <= 1.0005), 6000), `le zoom trop poussé revient doucement dans ses bornes (${await ev(() => PLANETE.stats.z)})`);
  await touche('touchStart', [[100, 300], [290, 560]]);
  for (let k = 1; k <= 14; k++) { await touche('touchMove', [[100 + k * 7, 300 + k * 9], [290 - k * 7, 560 - k * 9]]); await sleep(16); }
  await touche('touchEnd', []);
  check(await attendre(() => ev(() => PLANETE.stats.z >= -0.0005 && PLANETE.stats.z < 0.2), 8000), `dézoomer ramène la vue d'ensemble, sans aller au-delà (${await ev(() => PLANETE.stats.z)})`);
  check(await attendre(() => ev(() => { const q = new THREE.Quaternion().fromArray(PLANETE.essai.etat().q), n = new THREE.Vector3(0, 1, 0).applyQuaternion(q); return Math.abs(Math.atan2(n.x, n.y)) < 0.08 || Math.hypot(n.x, n.y) < 0.3; }), 10000), 'au repos, la planète se redresse (son nord en haut)');

  // ─── toucher une boutique : le zoom, puis l'étiquette ; « Entrer » ; toucher le ciel ───
  await ev(() => PLANETE.essai.repos()); await sleep(800);
  const cible = await ev(() => { for (const n of [1, 6, 13, 3, 2, 5, 28, 8]) { const e = PLANETE.essai.ecran(n); if (e && e.vu && e.y > 120 && e.y < 700 && e.x > 20 && e.x < 360) return Object.assign({ n }, e); } return null; });
  check(!!cible, `une boutique visible à toucher (n°${cible && cible.n})`);
  if (cible) {
    await touche('touchStart', [[cible.x, cible.y]]); await sleep(60); await touche('touchEnd', []);
    check(await attendre(() => ev(() => PLANETE.stats.etiquette), 8000), 'toucher son drapeau : la caméra s\'approche, puis l\'étiquette paraît');
    const et = await ev(() => ({ s: PLANETE.stats, txt: document.querySelector('#planete .pl-etiquette').textContent.replace(/\s+/g, ' ').trim(), vue: document.querySelector('#planete .pl-etiquette').getBoundingClientRect() }));
    check(et.s.choisi === cible.n && et.s.z > 0.6, `la boutique n°${et.s.choisi} est devant, de près (zoom ${et.s.z})`);
    const q = await ev((n) => GAME.QUARTIERS[GAME.quartierDe(n)].nom, cible.n);
    check(et.txt.includes(`Boutique n°${cible.n}`) && et.txt.toLowerCase().includes(q.toLowerCase()) && et.txt.includes('Gérant : aucun') && /jeton/.test(et.txt), `l'étiquette : « ${et.txt} »`);
    check(et.vue.top > 60 && et.vue.bottom < 844 && et.vue.left >= 0 && et.vue.right <= 390, `l'étiquette tient dans l'écran (${Math.round(et.vue.top)} → ${Math.round(et.vue.bottom)})`);
    const bx = await ev(() => { const r = document.querySelector('#planete .pl-et-entrer').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.touchscreen.tap(bx[0], bx[1]); await sleep(300);
    check(/Bientôt/.test(await ev(() => document.querySelector('#planete .pl-et-entrer').textContent)), '« Entrer » répond (la maquette l\'annonce)');
    await touche('touchStart', [[195, 110]]); await sleep(60); await touche('touchEnd', []);
    check(await attendre(() => ev(() => !PLANETE.stats.etiquette && PLANETE.stats.choisi === 0 && PLANETE.stats.z < 0.2), 6000), 'toucher le ciel : l\'étiquette part, la caméra recule');
  }
  // la planète, de près : ses budgets tiennent aussi
  await ev(() => { PLANETE.viser(30); }); await attendre(() => ev(() => PLANETE.stats.etiquette), 8000); await sleep(300);
  s = await ev(() => PLANETE.stats);
  check(s.calls <= 60 && s.triangles <= 40000, `de près (n°30) : ${s.calls} appels, ${s.triangles} triangles`);
  // une carte postale (l'API de la planète, pour le carnet)
  const carte = await ev(() => PLANETE.photo('village').then((u) => (u ? u.length : 0)));
  check(carte > 5000, `la carte postale d'une région (${(carte / 1024).toFixed(0)} Ko en JPEG)`);

  // ─── fermer ; cinq ouvertures et fermetures : la mémoire reste ───
  await page.tap('#planete [data-pl="fermer"]'); await sleep(300);
  check(await ev(() => !PLANETE.ouvert && !document.querySelector('#planete') && !PLANETE_ECRAN.ouvert), 'fermer : l\'écran part');
  const geos = [], tass = [], jeu = [];
  for (let k = 0; k < 5; k++) {
    await ev(() => PLANETE_ECRAN.ouvrir()); await attendre(() => ev(() => PLANETE.ouvert && PLANETE.stats.images > 3), 15000); await sleep(400);
    geos.push(await ev(() => `${PLANETE.stats.geometries}/${PLANETE.stats.textures}`));
    await ev(() => PLANETE_ECRAN.fermer()); await sleep(1200); // (la boutique se dessine de nouveau)
    jeu.push(await memScene()); tass.push(await tas());
  }
  const apres = await ev(() => ({ scene: { g: SCENE.stats.geometries, t: SCENE.stats.textures }, canvas: document.querySelectorAll('canvas').length, perdu: window.__perduJeu }));
  check(new Set(geos).size === 1, `la planète rebâtie à l'identique à chaque ouverture (géométries/textures : ${geos.join(' · ')})`);
  check(apres.canvas <= avant.canvas && !(await ev(() => document.querySelector('.pl-toile'))), `ses canvas partent avec elle (${avant.canvas} → ${apres.canvas} dans la page)`);
  check(new Set(jeu).size === 1 && jeu[0] === `${avant.scene.g}/${avant.scene.t}` && apres.perdu === 0, `la boutique garde sa mémoire et son contexte (géométries/textures avant : ${avant.scene.g}/${avant.scene.t}, après chaque fermeture : ${jeu.join(' · ')} ; contextes perdus : ${apres.perdu})`);
  const dTas = (tass[4] - tass[0]) / 1024;
  check(dTas < 1536, `le tas JS stable sur cinq ouvertures (${(tass[0] / 1048576).toFixed(1)} → ${(tass[4] / 1048576).toFixed(1)} Mo, ${dTas >= 0 ? '+' : ''}${dTas.toFixed(0)} Ko ; avant la 1re : ${(tas0 / 1048576).toFixed(1)} Mo)`);

  // ─── à la n°60 : les mêmes budgets (les boutiques de dos ne sont pas dessinées, de loin leur forme simple) ───
  await ev(() => PLANETE_ECRAN.ouvrir({ boutiques: 60 })); await attendre(() => ev(() => PLANETE.ouvert && PLANETE.stats.kit), 15000); await sleep(1800);
  s = await ev(() => PLANETE.stats);
  check(s.placees === 59 && s.calls <= 60 && s.triangles <= 40000, `à la n°60 : ${s.placees} boutiques posées, ${s.calls} appels, ${s.triangles} triangles`);
  pv = await pire(ev);
  check(pv.calls <= 60 && pv.tri <= 40000, `à la n°60, la pire des vues : ${pv.calls} appels, ${pv.tri} triangles (${pv.ou})`);
  // ─── l'heure : la nuit, les vitres s'allument ; le soir ; midi ───
  await ev(() => { PLANETE_ECRAN.fermer(); PLANETE_ECRAN.ouvrir({ boutiques: 31, heure: 23 }); }); await sleep(600);
  const ciel = () => ev(() => ({ phase: PLANETE.stats.phase, lueur: PLANETE.stats.lueur, cl: document.querySelector('#planete .pl-vue').className, triangles: PLANETE.stats.triangles }));
  let h = await ciel();
  check(h.phase === 'nuit' && h.lueur === 1 && /pl-nuit/.test(h.cl), `à 23 h, la nuit : le ciel étoilé, les vitres allumées (lueur ${h.lueur} ; ${h.cl})`);
  await ev(() => PLANETE.heure(19)); h = await ciel();
  check(h.phase === 'soir' && h.lueur > 0 && h.lueur < 1 && /pl-soir/.test(h.cl) && !/pl-nuit/.test(h.cl), `à 19 h, le soir (lueur ${h.lueur} ; ${h.cl})`);
  await ev(() => PLANETE.heure(12)); h = await ciel();
  check(h.phase === 'jour' && h.lueur === 0 && !/pl-soir/.test(h.cl), `à midi, le jour (lueur ${h.lueur})`);
  await ev(() => PLANETE_ECRAN.fermer());
  check(!erreurs.length, `aucune erreur (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // ─── 3. en éco ───
  {
    const j = await ouvrirJeu('?planete=1&qualite=eco');
    await j.ev(() => PLANETE_ECRAN.ouvrir({ boutiques: 31 })); await attendre(() => j.ev(() => PLANETE.ouvert && PLANETE.stats.images > 3), 15000); await sleep(1800);
    const se = await j.ev(() => PLANETE.stats);
    check(se.qualite === 'eco' && !se.kit && se.placees === 30, `en éco : trente boutiques, sans kit (${se.qualite})`);
    check(se.triangles <= 15000 && se.calls <= 60, `en éco : ${se.triangles} triangles (≤ 15 000), ${se.calls} appels`);
    let pe = await pire(j.ev);
    check(pe.calls <= 60 && pe.tri <= 15000, `en éco, la pire des vues : ${pe.calls} appels, ${pe.tri} triangles (${pe.ou})`);
    await j.ev(() => { PLANETE_ECRAN.fermer(); PLANETE_ECRAN.ouvrir({ boutiques: 60 }); }); await sleep(600);
    pe = await pire(j.ev);
    check(pe.calls <= 60 && pe.tri <= 15000 && (await j.ev(() => PLANETE.stats.placees)) === 59, `en éco, à la n°60, la pire des vues : ${pe.calls} appels, ${pe.tri} triangles (${pe.ou})`);
    check(!demandes.length, 'en éco : aucun fichier de la planète demandé');
    await j.ev(() => PLANETE_ECRAN.fermer());
    check(!j.erreurs.length, `aucune erreur en éco (${j.erreurs.slice(0, 3).join(' | ')})`);
    await j.ctx.close();
  }
  // ─── 4. ?hd=0 : la planète faite main, entière ───
  {
    const j = await ouvrirJeu('?planete=1&qualite=haute&hd=0');
    await j.ev(() => PLANETE_ECRAN.ouvrir({ boutiques: 16 })); await attendre(() => j.ev(() => PLANETE.ouvert && PLANETE.stats.images > 3), 15000); await sleep(1500);
    const sh = await j.ev(() => PLANETE.stats);
    check(!sh.kit && sh.placees === 15 && sh.calls > 10, `?hd=0 : le sol et les quinze boutiques procéduraux (${sh.calls} appels, ${sh.triangles} triangles)`);
    check(!demandes.length, '?hd=0 : aucune requête hd/planete');
    // une partie neuve (aucune boutique dans la chaîne) : la planète s'ouvre, vide, avec son message
    await j.ev(() => PLANETE_ECRAN.fermer()); await j.ev(() => PLANETE_ECRAN.ouvrir({ boutiques: 1 })); await sleep(800);
    const vide = await j.ev(() => ({ ok: PLANETE.ouvert, n: PLANETE.stats.boutiques, msg: (document.querySelector('#planete .pl-vide') || {}).textContent || '' }));
    check(vide.ok && vide.n === 0 && /2e boutique/.test(vide.msg), `une partie neuve : la planète vide et son message (« ${vide.msg} »)`);
    await j.ev(() => PLANETE_ECRAN.fermer());
    check(!j.erreurs.length, `aucune erreur sans HD (${j.erreurs.slice(0, 3).join(' | ')})`);
    await j.ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST VERT');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });
