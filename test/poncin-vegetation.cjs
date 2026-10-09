// Opération Poncin — la végétation (src-poncin/vegetation.js) sur la VRAIE carte, Playwright, iPhone en paysage : 844×390, deviceScaleFactor 2.
// Vérifie, en haute puis en éco (et en moyenne pour les budgets) : la page se construit sans erreur (ni WebGL ni console), les 2 790 arbres
// réels sont tous là avec leurs espèces, aucun bois n'est semé quand les arbres ont leurs 5 valeurs, les budgets de toute la végétation
// visible mesurés par WebGL (ombres comprises) : haute ≤ 14 appels et ≤ 80k triangles, moyenne ≤ 10 et ≤ 50k, éco ≤ 7 et ≤ 25k (éco : pas
// d'herbe), l'herbe ne pousse ni sur les rues ni dans les bâtiments ni dans l'eau, la mémoire de textures ≤ 8 Mo, des géométries et des
// textures stables après 50 maj, et qu'une seconde création ne repeint rien. Captures (place Xavier-Bichat sous les platanes, rive de
// l'Ain, bois de la colline à l'est, un pré, vue d'ensemble) dans le dossier --sortie (défaut test/shots/poncin-vegetation/).
// Le rendu est logiciel (SwiftShader) : on juge les budgets et l'image, pas les images par seconde.
// Usage : node test/poncin-vegetation.cjs [--qualite=haute,moyenne,eco] [--vues=place,ain,saules,bois,herbe,haut] [--sortie=dossier]
// (NODE_PATH=/opt/node22/lib/node_modules si Playwright est installé globalement).
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const QUALITES = arg('qualite', 'haute,moyenne,eco').split(','), VUES = arg('vues', 'place,ain,saules,bois,herbe,haut').split(',');
const out = path.resolve(arg('sortie', path.join(__dirname, 'shots', 'poncin-vegetation'))); fs.mkdirSync(out, { recursive: true });
const BUDGETS = { haute: { appels: 14, triangles: 80000 }, moyenne: { appels: 10, triangles: 50000 }, eco: { appels: 7, triangles: 25000 } };
const CAPTURES = { haute: VUES, moyenne: [], eco: VUES };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let echecs = 0, oks = 0;
const verif = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else echecs++; };
const k = (n) => (n / 1000).toFixed(1) + 'k';
(async () => {
  const carte = JSON.parse(fs.readFileSync(path.join(racine, 'poncin', 'carte', 'poncin.json'), 'utf8'));
  const especes = {}; for (const a of carte.arbres) especes[a[4]] = (especes[a[4]] || 0) + 1;
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const port = serveur.address().port;
  const ouvrir = async (ctx, q) => {
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/deprecated|GPU stall|ReadPixels/.test(m.text()))) erreurs.push(m.type() + ': ' + m.text().slice(0, 300)); });
    await page.goto(`http://localhost:${port}/test/poncin-vegetation.html?${q}`);
    await page.waitForFunction(() => window.__veg && window.__veg.pret, null, { timeout: 300000 });
    return { page, erreurs };
  };
  for (const qualite of QUALITES) {
    console.log(`── qualité ${qualite} ──`);
    const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const B = BUDGETS[qualite];
    // 1. construction, contenu, budgets dans toutes les vues, stabilité
    {
      const { page, erreurs } = await ouvrir(ctx, `vue=place&qualite=${qualite}`);
      const r = await page.evaluate(() => ({ e: window.__veg.erreurs, s: window.__veg.stats, c: window.__veg.creation }));
      verif(r.e.length === 0, `la page se construit sans exception${r.e.length ? ' : ' + r.e[0].slice(0, 400) : ''}`);
      if (!r.s) { verif(false, 'pas de stats : on arrête cette qualité'); await ctx.close(); continue; }
      console.log(`  info création ${r.c} ms (dont l'atlas ${r.s.creationAtlas} ms) ; atlas ${r.s.atlas} px ; ${r.s.troncons} tronçons de haie ; triangles par arbre proche ${r.s.trianglesParArbre.join(' / ')}`);
      verif(r.s.arbres === carte.arbres.length && r.s.semes === 0, `les ${carte.arbres.length} arbres réels, et rien de semé (${r.s.arbres} arbres, ${r.s.semes} semés ; ${r.s.buissons} buissons pour ${carte.haies.length} haies hautes)`);
      const sm = await page.evaluate(() => window.__veg.semis());
      verif(sm.vieille.semes > 50 && sm.neuve.semes === 0 && sm.vide.semes > 50, `on ne sème les bois que sur une vieille carte (arbres à 3 valeurs : ${sm.vieille.semes} semés ; à 5 valeurs : ${sm.neuve.semes} ; sans arbre : ${sm.vide.semes})`);
      verif(Object.keys(especes).every((e) => r.s.especes[e] === especes[e]), `les espèces de la carte (${Object.entries(r.s.especes).map(([e, n]) => e + ' ' + n).join(', ')})`);
      verif(r.s.photo, 'la photo aérienne est lue (où pousse l\'herbe, couleur du sol)');
      verif(r.s.memoire <= 8 * 1048576, `mémoire de textures ≤ 8 Mo (${(r.s.memoire / 1048576).toFixed(1)} Mo)`);
      const v = await page.evaluate((vues) => vues.map((n) => window.__veg.vue(n)), VUES);
      for (const x of v) {
        const s = x.stats, i = s.instances;
        console.log(`  info ${x.nom.padEnd(6)} végétation ${x.veg.calls} appels, ${k(x.veg.triangles)} tri (le module compte ${s.appels} + ${s.appelsOmbre} d'ombre, ${k(s.triangles)} + ${k(s.trianglesOmbre)}) ; proches ${i.proche} [${i.parSilhouette.join(',')}], moyens ${i.moyen}, loin ${i.loin}, haies ${i.lignes}, herbe ${i.herbe} ; scène entière ${x.tout.calls} appels, ${k(x.tout.triangles)} ; maj ${s.ms} + ${s.msHerbe} ms`);
        verif(x.veg.calls <= B.appels && x.veg.triangles <= B.triangles, `${x.nom} : budget ${qualite} tenu (${x.veg.calls} ≤ ${B.appels} appels, ${k(x.veg.triangles)} ≤ ${k(B.triangles)} triangles, ombres comprises)`);
        verif(x.veg.calls === s.appels + s.appelsOmbre, `${x.nom} : le compte du module égale celui de WebGL (${s.appels + s.appelsOmbre} / ${x.veg.calls})`);
      }
      if (qualite === 'eco') verif(v.every((x) => x.stats.instances.herbe === 0), 'éco : pas d\'herbe');
      else verif(v.some((x) => x.stats.instances.herbe > 100), `de l'herbe autour du joueur (${v.map((x) => x.nom + ' ' + x.stats.instances.herbe).join(', ')})`);
      verif(v.find((x) => x.nom === 'place').stats.instances.proche >= 9 || !VUES.includes('place'), 'les platanes de la place sont au niveau proche');
      // l'herbe : jamais sur une rue, dans un bâtiment ni dans l'eau
      const h = await page.evaluate(() => window.__veg.herbeInterdite ? window.__veg.herbeInterdite() : null);
      if (h) verif(h.mal === 0, `herbe : ${h.n} touffes contrôlées dans les vues, aucune sur une rue, dans un bâtiment ou dans l'eau (${h.mal}${h.ex ? ' : ' + h.ex : ''})`);
      if (qualite !== 'eco') { // changer de qualité en jeu : silhouettes allégées et pas d'herbe en éco, puis retour ; aucune erreur
        const q = await page.evaluate((nom) => { const V = window.__veg, a = V.qualite('eco'), e = V.vue('saules'), b = V.qualite(nom), r = V.vue('saules'); return { a, b, e: { s: e.stats, v: e.veg }, r: { s: r.stats, v: r.veg } }; }, qualite);
        verif(q.a === 'eco' && q.e.s.simple && q.e.s.instances.herbe === 0 && q.e.v.calls <= BUDGETS.eco.appels && q.e.v.triangles <= BUDGETS.eco.triangles && q.b === qualite && !q.r.s.simple && q.r.s.instances.herbe > 0,
          `changer de qualité en jeu : éco (${q.e.v.calls} appels, ${k(q.e.v.triangles)}, silhouettes allégées ${q.e.s.trianglesParArbre.join('/')}, pas d'herbe), puis ${qualite} (${q.r.v.calls} appels, ${k(q.r.v.triangles)}, herbe ${q.r.s.instances.herbe})`);
      }
      const m = await page.evaluate(() => window.__veg.majs(50));
      verif(m.max === m.avant && m.apres === m.avant && m.texApres === m.texAvant, `géométries stables après 50 maj (${m.avant} → ${m.min}..${m.max} → ${m.apres}), textures ${m.texAvant} → ${m.texApres}`);
      console.log(`  info recopies : ${m.stats.majs} des arbres, en moyenne ${m.stats.msMoy} ms (au plus ${m.stats.msMax}) ; ${m.stats.majsHerbe} de l'herbe, en moyenne ${m.stats.msHerbeMoy} ms (processeur de bureau ; un téléphone : ×3 à ×5)`);
      verif(m.stats.msMoy < 2.5 && m.stats.msHerbeMoy < 2.5, `recopies rapides sur cette machine (arbres ${m.stats.msMoy} ms, herbe ${m.stats.msHerbeMoy} ms en moyenne)`);
      const d = await page.evaluate(() => window.__veg.recreer());
      verif(d.atlasPartage && d.ms < r.c, `une seconde création ne repeint pas l'atlas (${d.ms} ms contre ${r.c}) et libérer rend tout (${d.geoAvant} → ${d.geoApres} géométries)`);
      verif(d.geoApres <= d.geoAvant, 'libérer ne laisse rien derrière');
      verif(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
      await page.close();
    }
    // 2. les captures
    for (const vue of CAPTURES[qualite] || []) {
      const { page, erreurs } = await ouvrir(ctx, `vue=${vue}&qualite=${qualite}`);
      await page.screenshot({ path: path.join(out, `${qualite}-${vue}.png`), timeout: 180000 });
      const r = await page.evaluate(() => ({ e: window.__veg.erreurs, x: window.__veg.etat }));
      verif(r.e.length === 0 && erreurs.length === 0, `capture ${qualite}-${vue}${r.x ? ` (végétation ${r.x.veg.calls} appels, ${k(r.x.veg.triangles)} ; scène ${r.x.tout.calls} appels, ${k(r.x.tout.triangles)})` : ''}${r.e.concat(erreurs).slice(0, 2).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  console.log(`\n${oks} ok, ${echecs} échec(s) — captures dans ${out}/`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
