// Opération Poncin — les textures du décor (src-poncin/textures.js), Playwright, iPhone en paysage : 844×390, deviceScaleFactor 2.
// Vérifie : rien n'est fabriqué deux fois (mêmes objets, compteurs stables), MODELES.dispose et la boucle de libération de rendu.js ne
// rendent ni les textures ni les matériaux partagés, les matières se raccordent sans couture (écart au bord ≈ écart entre voisines), les
// sols de détail sont neutres (gris, moyenne 0,5, données brutes), mipmaps et anisotropie, mémoire ≤ 24 Mo en haute pour le jeu typique
// (et réduite en éco), temps de fabrication (d'un coup, puis par tranches avec preparer), la rue de démonstration rendue sans erreur
// WebGL avec peu d'appels de dessin et des textures GPU stables. Captures des planches et de la rue dans test/shots/poncin-textures/.
// Le rendu est logiciel (SwiftShader) : on ne juge pas les images par seconde. Les temps sont ceux de cette machine ; l'« étalon »
// (1e7 tours d'une boucle simple) permet de les ramener à un téléphone.
// Usage : node test/poncin-textures.cjs [--qualite=haute,eco] [--vues=murs,toits,atlas,zoom,rue,facade,eglise,haut,sol,bar]
// (NODE_PATH=/opt/node22/lib/node_modules si Playwright est installé globalement).
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..'), out = path.join(__dirname, 'shots', 'poncin-textures'); fs.mkdirSync(out, { recursive: true });
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const QUALITES = arg('qualite', 'haute,eco').split(','), VUES = arg('vues', 'murs,toits,atlas,zoom,rue,facade,eglise,haut,sol,bar').split(',');
const VUES_ECO = ['murs', 'rue', 'facade'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let echecs = 0, oks = 0;
const verif = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else echecs++; };
const mo = (o) => (o / 1048576).toFixed(1) + ' Mo';
(async () => {
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const port = serveur.address().port, memoire = {};
  const ouvrir = async (ctx, q) => {
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/deprecated/.test(m.text()))) erreurs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    await page.goto(`http://localhost:${port}/test/poncin-textures.html?${q}`);
    await page.waitForFunction(() => window.__tex && window.__tex.pret, null, { timeout: 240000 });
    return { page, erreurs };
  };
  for (const qualite of QUALITES) {
    console.log(`── qualité ${qualite} ──`);
    const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    // 1. fabrication d'un coup (le jeu typique : 9 matières de bâtiments, l'atlas, 4 sols de détail, 12 enseignes, 15 plaques), contrôles
    {
      const { page, erreurs } = await ouvrir(ctx, `vue=rue&qualite=${qualite}`);
      const r = await page.evaluate(() => ({ m: __tex.mesures, e: __tex.erreurs, etalon: __tex.etalon, st: __tex.statsTypique, tout: __tex.statsTout, rendu: __tex.rendu, init: __tex.init }));
      verif(r.e.length === 0, `la page se construit sans exception${r.e.length ? ' : ' + r.e[0].slice(0, 300) : ''}`);
      console.log(`  info étalon processeur : 1e7 tours en ${r.etalon} ms ; WebGL2 ${r.init && r.init.webgl2}, anisotropie ${r.init && r.init.anisotropie}`);
      console.log(`  info jeu typique d'un coup : ${r.m.typique} ms (bâtiments ${r.m.bati}, atlas ${r.m.details}, sols ${r.m.sols}, enseignes ${r.m.enseignes}, plaques ${r.m.plaques}) ; phases ${JSON.stringify(r.st.phases)} ; bruits ${r.st.detail.bruits} ms`);
      console.log(`  info tout le reste : ${r.m.reste} ms ; ${r.tout.textures} textures, ${mo(r.tout.octets)} si TOUT était créé à la fois`);
      memoire[qualite] = r.st.octets;
      verif(r.m.typique < (qualite === 'eco' ? 250 : 600), `jeu typique fabriqué en ${r.m.typique} ms sur cette machine (étalon ${r.etalon} ms ; seuil de bon sens ${qualite === 'eco' ? 250 : 600} ms)`);
      if (qualite === 'haute') verif(r.st.octets <= 24 * 1048576, `mémoire du jeu typique ≤ 24 Mo en haute (${mo(r.st.octets)}, ${r.st.textures} textures)`);
      else verif(memoire.haute ? r.st.octets <= memoire.haute / 3 : r.st.octets <= 8 * 1048576, `mémoire réduite en éco (${mo(r.st.octets)}${memoire.haute ? ' contre ' + mo(memoire.haute) + ' en haute' : ''})`);
      const v = await page.evaluate(() => __tex.verifier());
      verif(v.memes, 'les mêmes demandes rendent les mêmes objets (façades, toits, sols, atlas, couches, enseignes, plaques, alias)');
      verif(v.generees[0] === v.generees[1] && v.bases[0] === v.bases[1], `rien n'est fabriqué deux fois en redemandant tout trois fois (textures ${v.generees[0]} → ${v.generees[1]}, matières ${v.bases[0]} → ${v.bases[1]})`);
      verif(v.partagees && v.liberees.length === 0 && !v.matLibere, `MODELES.dispose et la libération de rendu.js ne libèrent rien de partagé${v.liberees.length ? ' (libérées : ' + v.liberees.join(', ') + ')' : ''}${v.matLibere ? ' (matériau bati libéré)' : ''}`);
      const pires = Object.entries(v.coutures).sort((a, b) => Math.max(...b[1]) - Math.max(...a[1])), pire = pires[0];
      verif(pires.every(([, c]) => c[0] <= 1 && c[1] <= 1), `${pires.length} matières sans couture : raccord ≤ max(1,6 × médiane, 1,05 × maximum) des écarts entre voisines (pire : ${pire[0]} ${pire[1].join(' / ')})`);
      const ne = Object.entries(v.neutres);
      verif(ne.every(([, n]) => Math.abs(n.moyenne - 0.5) < 0.03 && n.saturation === 0 && n.colorSpace === ''), `sols de détail neutres : gris, moyenne 0,5, données brutes (${ne.map(([k, n]) => k + ' ' + n.moyenne).join(', ')})`);
      verif(v.mipmaps, 'mipmaps et anisotropie sur toutes les textures (façades, toits, sols, atlas, couches, enseignes)');
      // la rue de démonstration : WebGL sans erreur, appels de dessin, textures GPU stables en repassant toutes les vues, après dispose
      const g = await page.evaluate(() => { const vs = ['rue', 'facade', 'eglise', 'haut', 'sol', 'bar'], l = []; for (let k = 0; k < 2; k++) for (const n of vs) l.push(__tex.vue3d(n)); return l; });
      const tex0 = g[0].textures, texMax = Math.max(...g.map((x) => x.textures)), callsMax = Math.max(...g.map((x) => x.calls));
      verif(g.every((x) => x.gl === 0), `la rue de démonstration se rend sans erreur WebGL (${g.length} images)`);
      verif(callsMax <= 16, `rue de démonstration : ≤ 16 appels de dessin (au plus ${callsMax} : bâtiments fusionnés 1, ouvertures 1, enseignes 1 par page, sols)`);
      verif(texMax === tex0, `textures GPU stables en repassant les vues (${tex0} → au plus ${texMax})`);
      verif(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
      await page.close();
    }
    // 2. fabrication par tranches (preparer) : la plus longue tranche bloque peu l'image
    {
      const { page, erreurs } = await ouvrir(ctx, `vue=murs&qualite=${qualite}&mesure=async`);
      const r = await page.evaluate(() => ({ m: __tex.mesures, p: __tex.prep, e: __tex.erreurs }));
      console.log(`  info preparer : ${r.m.preparer} ms au total (avec les pauses), tranche la plus longue ${r.p.tranchePlusLongue} ms ; ensuite le jeu typique s'emballe en ${r.m.typique} ms`);
      verif(r.e.length === 0 && erreurs.length === 0 && r.m.typique < r.m.preparer, `preparer en tâche de fond, puis tout est déjà prêt (${r.m.typique} ms d'emballage)${r.e.concat(erreurs).slice(0, 2).join(' | ')}`);
      verif(r.p.tranchePlusLongue < (qualite === 'eco' ? 40 : 80), `la plus longue tranche de preparer reste courte sur cette machine (${r.p.tranchePlusLongue} ms)`);
      await page.close();
    }
    // 3. les captures
    for (const vue of qualite === 'haute' ? VUES : VUES.filter((v) => VUES_ECO.includes(v))) {
      const { page, erreurs } = await ouvrir(ctx, `vue=${vue}&qualite=${qualite}`);
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(out, `${qualite}-${vue}.png`), timeout: 180000 });
      const r = await page.evaluate(() => ({ e: __tex.erreurs, rendu: __tex.rendu }));
      verif(r.e.length === 0 && erreurs.length === 0, `capture ${vue}${r.rendu ? ` (${r.rendu.calls} appels, ${(r.rendu.triangles / 1000).toFixed(1)}k triangles)` : ''}${r.e.concat(erreurs).slice(0, 2).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  console.log(`\n${oks} ok, ${echecs} échec(s) — captures dans ${path.relative(racine, out)}/`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
