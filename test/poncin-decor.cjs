// Opération Poncin — le décor (src-poncin/decor.js) sur la vraie carte, Playwright, iPhone en paysage : 844×390, deviceScaleFactor 2.
// Vérifie : la page se construit sans exception ni erreur WebGL, les bâtiments remarquables sont trouvés (mairie et ses trois drapeaux,
// tabac, banque, poste, Bar des Sports et sa terrasse, commerces), le mobilier réel, les murs, l'ambiance (lanternes jamais à moins de
// 15 m l'une de l'autre, bancs de la place hors des rues et des bâtiments, ceux de monde.bancs, pleins pour les pas et les tirs, plaques
// de rue, fenêtres fleuries), l'intérieur derrière les glaces selon le commerce (pains, bureau, salle, salon), les budgets du décor SEUL
// dans chaque vue (haute ≤ 14 appels et ≤ 40k triangles, ombres comprises ; éco ≤ 8 et ≤ 15k), des géométries et des textures stables
// d'une image à l'autre, en changeant de qualité et après liberer(), les replis (sans PTEXTURES, pierre en moellons), le raccord de
// couleur de l'horizon avec le sol au bord du carré. Captures dans test/shots/poncin-decor/ (vue au sol : mairie, tabac, banque, poste,
// bar et sa terrasse, place, plaque, horizon des montagnes ; et un survol). Le rendu est logiciel (SwiftShader) : on ne juge pas les
// images par seconde.
// Usage : node test/poncin-decor.cjs [--qualite=haute,eco] [--vues=mairie,tabac,…] [--sortie=dossier]
// (NODE_PATH=/opt/node22/lib/node_modules si Playwright est installé globalement).
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const out = path.resolve(arg('sortie', path.join(__dirname, 'shots', 'poncin-decor'))); fs.mkdirSync(out, { recursive: true });
const QUALITES = arg('qualite', 'haute,eco').split(','), VUES = arg('vues', 'mairie,entree,tabac,banque,poste,bar,commerces,place,plaque,horizon,horizonOuest,bord,survol').split(',');
const VUES_ECO = ['mairie', 'bar', 'place', 'horizon'];
const BUDGETS = { haute: { appels: 14, triangles: 40000 }, moyenne: { appels: 12, triangles: 28000 }, eco: { appels: 8, triangles: 15000 } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let echecs = 0, oks = 0;
const verif = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else echecs++; };
(async () => {
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const port = serveur.address().port;
  const ouvrir = async (ctx, q) => {
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/deprecated|GPU stall|ReadPixels/i.test(m.text()))) erreurs.push(m.type() + ': ' + m.text().slice(0, 240)); });
    await page.goto(`http://localhost:${port}/test/poncin-decor.html?${q}`);
    await page.waitForFunction(() => window.__decor && window.__decor.pret, null, { timeout: 300000 });
    return { page, erreurs };
  };
  for (const qualite of QUALITES) {
    console.log(`── qualité ${qualite} ──`);
    const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const B = BUDGETS[qualite] || BUDGETS.haute;
    {
      const { page, erreurs } = await ouvrir(ctx, `vue=mairie&qualite=${qualite}`);
      const r = await page.evaluate(() => ({ e: __decor.erreurs, s: __decor.stats(), m: __decor.mesures, rq: __decor.remarquables(), fa: __decor.facades(), rendu: __decor.rendu }));
      verif(r.e.length === 0 && r.s.erreurs.length === 0, `la page et le décor se construisent sans exception${r.e.concat(r.s.erreurs).slice(0, 2).map((x) => ' : ' + x.slice(0, 300)).join('')}`);
      console.log(`  info création ${r.m.creer} ms (plan ${r.s.creation} ms, maillage ${r.s.construction} ms) ; ${r.s.appels} maillages, ${(r.s.triangles / 1000).toFixed(1)}k triangles (${JSON.stringify(r.s.parMaillage)}) ; pierre : ${r.s.pierre} ; atlas ${r.s.atlas} px, ${r.s.cellules} cellules`);
      console.log(`  info objets ${JSON.stringify(r.s.objets)} ; horizon ${JSON.stringify(r.s.horizon)}`);
      const quoi = (q, n) => r.rq.find((x) => x.quoi === q && (!n || x.n === n));
      verif(!!quoi('mairie', 'Hôtel de ville de Poncin') && r.s.objets.drapeaux >= 3, `la mairie (« Hôtel de ville de Poncin ») : entrée, inscription, ${r.s.objets.drapeaux} drapeaux`);
      verif(!!quoi('tabac', 'Bureau de Tabac Presse') && !!quoi('banque', 'Crédit Agricole') && !!quoi('poste', 'La Poste'), 'le tabac, le Crédit Agricole et La Poste ont leur devanture');
      const tb = quoi('terrasse', 'Bar des Sports');
      verif(!!tb && tb.tables >= 3 && r.s.objets.terrasses >= 2, `le Bar des Sports a sa terrasse (${tb ? tb.tables : 0} tables) ; ${r.s.objets.terrasses} terrasses, ${r.s.objets.tables} tables${r.s.terrassesRefusees.length ? ' (sans place devant la façade ni ailleurs, d\'après les rues et les bâtiments de la carte : ' + r.s.terrassesRefusees.map((x) => x.split(' {')[0]).join(', ') + ')' : ''}`);
      const noms = ['Aux Pains Dorés', 'Petit Casino', 'Office de tourisme intercommunal', 'Gendarmerie nationale', 'Collège Roger Vailland', 'École primaire du Veyron', 'Maison de santé', 'Le Centre', 'Le Poncinois'];
      const manquent = noms.filter((n) => !r.rq.some((x) => x.n === n)); verif(manquent.length === 0, `enseignes et plaques aux vrais noms (${noms.length - manquent.length}/${noms.length}${manquent.length ? ', manquent : ' + manquent.join(', ') : ''}), ${r.s.objets.devantures} devantures`);
      verif(r.s.objets.mobilier === 15 && r.s.objets.murs === 7, `mobilier réel ${r.s.objets.mobilier}/15, murs ${r.s.objets.murs}/7`);
      const int = (q, n) => { const x = quoi(q, n); return x ? x.interieur || 'étagères' : 'absent'; }, ints = { 'Aux Pains Dorés': int('boulangerie', 'Aux Pains Dorés'), 'Crédit Agricole': int('banque', 'Crédit Agricole'), 'La Poste': int('poste', 'La Poste'), 'Bar des Sports': int('bar', 'Bar des Sports'), 'Le Centre': int('restaurant', 'Le Centre'), 'En Tête à Tête': int('coiffure', 'En Tête à Tête'), 'Petit Casino': int('epicerie', 'Petit Casino') };
      verif(ints['Aux Pains Dorés'] === 'pains' && ints['Crédit Agricole'] === 'bureau' && ints['La Poste'] === 'bureau' && ints['Bar des Sports'] === 'salle' && ints['Le Centre'] === 'salle' && ints['En Tête à Tête'] === 'salon' && ints['Petit Casino'] === 'étagères', `derrière les glaces, l'intérieur du commerce (${Object.entries(ints).map(([n, v]) => n + ' : ' + v).join(', ')})`);
      const lan = await page.evaluate(() => __decor.stats().objets.lanternes);
      verif(lan >= 12 && r.s.objets.plaquesRue >= 6 && r.s.objets.fenetres >= 4, `ambiance : ${lan} lanternes, ${r.s.objets.bancs} bancs, ${r.s.objets.plaquesRue} plaques de rue, ${r.s.objets.fenetres} fenêtres fleuries, ${r.s.objets.pots} pots`);
      const am = await page.evaluate(() => __decor.verifierAmbiance());
      verif(am.dMin >= 15, `lanternes : jamais deux à moins de 15 m (au plus près ${am.dMin} m, ${am.lanternes} lanternes)`);
      // les bancs de la place : monde.js les pose et les rend pleins (monde.bancs), le décor ne dessine qu'eux (jamais un banc qu'on traverse)
      if (am.mondeBancs === null) verif(false, `bancs de la place : monde.bancs absent (monde.js ne pose pas encore les bancs ; le décor n'en dessine donc aucun : ${r.s.objets.bancs})`);
      else {
        verif(am.bancs.length >= 2 && am.bancs.length <= 4 && am.bancs.every((b) => b.rue >= 0.8 && b.place < 45 && !b.bat), `${am.bancs.length} bancs sur la place, hors des rues (bord de chaussée à ${am.bancs.map((b) => b.rue).join(', ')} m) et des bâtiments`);
        verif(am.memes && am.bancs.every((b) => b.bloque && b.de === 'mobilier' && b.tir < 3.2), `les bancs dessinés sont ceux de monde.bancs (${am.mondeBancs}), pleins : monde.bloque à leur centre ${am.bancs.map((b) => b.bloque).join(', ')} ; un tir à 0,6 m s'y arrête (${am.bancs.map((b) => b.de ? b.de + ' à ' + b.tir + ' m' : 'rien').join(', ')})`);
      }
      verif(am.nomsOk && am.pMin >= 15, `plaques de rue aux noms de carte.rues, une par carrefour (${am.plaques} plaques, ${am.nomsPlaques} rues, au plus près ${am.pMin} m)`);
      verif(r.fa.length >= 15 && r.fa.every((f) => Number.isInteger(f.b) && f.s1 > f.s0), `${r.fa.length} façades habillées décrites pour rendu.js`);
      // les budgets du décor seul, dans chaque vue ; des géométries et des textures stables
      const vs = await page.evaluate(() => { const l = {}; for (const n of __decor.noms()) l[n] = __decor.seul(n); return l; });
      const pire = Object.entries(vs).sort((a, b) => b[1].triangles - a[1].triangles)[0], maxA = Math.max(...Object.values(vs).map((v) => v.calls));
      verif(Object.values(vs).every((v) => v.gl === 0), `${Object.keys(vs).length} vues du décor seul sans erreur WebGL`);
      verif(maxA <= B.appels, `décor seul : ≤ ${B.appels} appels de dessin, ombres comprises (au plus ${maxA})`);
      verif(pire[1].triangles <= B.triangles, `décor seul : ≤ ${B.triangles / 1000}k triangles, ombres comprises (au plus ${(pire[1].triangles / 1000).toFixed(1)}k, vue ${pire[0]})`);
      const st = await page.evaluate(() => { const a = []; for (let k = 0; k < 3; k++) for (const n of __decor.noms()) a.push(__decor.vue(n, k * 0.7)); return a.slice(__decor.noms().length); }); // un premier tour pour tout charger, puis deux
      verif(st.every((x) => x.geometries === st[0].geometries && x.textures === st[0].textures && x.gl === 0), `géométries et textures stables d'une image à l'autre et d'une vue à l'autre (${st[0].geometries} géométries, ${st[0].textures} textures, ${st.length} images)`);
      const qs = await page.evaluate(() => { const g0 = __decor.vue('mairie').geometries, a = __decor.qualite('eco'), g1 = __decor.vue('mairie').geometries, b = __decor.qualite(new URLSearchParams(location.search).get('qualite') || 'haute'), g2 = __decor.vue('mairie').geometries; return { g0, g1, g2, a: [a.appels, a.triangles], b: [b.appels, b.triangles] }; });
      verif(qs.g2 === qs.g0, `changer de qualité et revenir ne laisse rien derrière (géométries ${qs.g0} → ${qs.g1} → ${qs.g2} ; éco ${qs.a[0]} maillages ${(qs.a[1] / 1000).toFixed(1)}k triangles)`);
      const cq = await page.evaluate((q) => { const a = __decor.changerQualite(q === 'eco' ? 'haute' : 'eco'), b = __decor.changerQualite(q); return { a: [a.r.gl, a.s.appels, a.s.erreurs.length], b: [b.r.gl, b.s.appels, b.s.erreurs.length], g: [a.r.geometries, b.r.geometries] }; }, qualite);
      verif(cq.a[0] === 0 && cq.b[0] === 0 && cq.a[2] === 0 && cq.b[2] === 0, `changer de qualité comme rendu.js (PTEXTURES.vider, puis decor.qualite) : reconstruit sans erreur (${cq.a[1]} puis ${cq.b[1]} maillages)`);
      const ph = await page.evaluate(() => __decor.photoBord()), rc = await page.evaluate(() => __decor.raccord());
      const ecart = rc.map(([a, b]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])), moy = ecart.reduce((s, x) => s + x, 0) / ecart.length;
      verif(ph && moy < 60, `raccord de l'horizon avec le sol au bord du carré : écart moyen ${moy.toFixed(0)} (somme des 3 canaux, sur 255) ; photo lue ${ph}`);
      const rp = await page.evaluate(() => ({ sans: __decor.recreer('sans'), moellons: __decor.recreer('moellons') }));
      verif(rp.sans.gl === 0 && rp.sans.stats.erreurs.length === 0 && rp.sans.stats.appels > 0 && rp.moellons.gl === 0 && rp.moellons.stats.pierre === 'moellons', `replis : sans PTEXTURES (${rp.sans.stats.appels} maillages, ${(rp.sans.stats.triangles / 1000).toFixed(1)}k) et pierre en moellons, sans erreur`);
      const pv = await page.evaluate(() => __decor.provisoire());
      verif(pv.every((x) => x.gl === 0 && x.erreurs.length === 0 && x.appels > 0) && pv[0].horizon === 'collines' && pv[1].horizon === 'collines', `cartes sans les champs facultatifs (provisoire : ${pv[0].appels} maillages, ${(pv[0].triangles / 1000).toFixed(1)}k ; vieille carte : ${pv[1].appels} maillages) : horizon de collines génériques, sans erreur`);
      const lb = await page.evaluate(() => __decor.liberer());
      verif(lb.apres < lb.avant, `liberer() rend les géométries du décor (${lb.avant} → ${lb.apres})`);
      verif(erreurs.length === 0, `aucune erreur dans la console${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
      await page.close();
    }
    for (const vue of qualite === 'haute' ? VUES : VUES.filter((v) => VUES_ECO.includes(v))) {
      const { page, erreurs } = await ouvrir(ctx, `vue=${vue}&qualite=${qualite}`);
      await page.waitForTimeout(50);
      await page.screenshot({ path: path.join(out, `${qualite}-${vue}.png`), timeout: 240000 });
      const r = await page.evaluate(() => ({ e: __decor.erreurs, rendu: __decor.rendu }));
      verif(r.e.length === 0 && erreurs.length === 0, `capture ${vue}${r.rendu ? ` (scène ${r.rendu.calls} appels, ${(r.rendu.triangles / 1000).toFixed(1)}k triangles)` : ''}${r.e.concat(erreurs).slice(0, 2).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  console.log(`\n${oks} ok, ${echecs} échec(s) — captures dans ${path.relative(racine, out) || out}/`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
