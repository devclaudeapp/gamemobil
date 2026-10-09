// Opération Poncin — captures du rendu 3D (Playwright, iPhone en paysage : 844×390, deviceScaleFactor 2), carte réelle puis provisoire,
// qualité haute puis éco : une rue du bourg, la place de l'arène, le château et le clocher vus de la rue, la rivière et un pont, une vue
// d'en haut, personnages et robots de près, tirs (traînées, éclairs, impacts de peinture), confettis d'une élimination, le survol du titre.
// Pour chaque image : appels de dessin, triangles, géométries, comparés aux budgets du contrat ; puis les géométries et les textures
// doivent rester stables quand on rejoue toutes les scènes, et le contexte WebGL perdu puis retrouvé doit redonner une image.
// Le rendu est logiciel (SwiftShader) : on ne juge pas les images par seconde, seulement les budgets.
// Usage : node test/poncin-scene.cjs [--carte=reelle,provisoire] [--qualite=haute,eco] [--scenes=rue,tir]
// (NODE_PATH=/opt/node22/lib/node_modules si Playwright est installé globalement). Captures dans test/shots/poncin-scene/.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..'), out = path.join(__dirname, 'shots', 'poncin-scene'); fs.mkdirSync(out, { recursive: true });
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CARTES = arg('carte', 'reelle,provisoire').split(','), QUALITES = arg('qualite', 'haute,eco').split(',');
const SCENES = arg('scenes', 'rue,place,chateau,eglise,pont,haut,persos,tir,confettis,survol').split(',');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let echecs = 0, oks = 0;
const verif = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else echecs++; };
const fmt = (s) => `${s.calls} appels, ${(s.triangles / 1000).toFixed(1)}k triangles, ${s.geometries} géométries, ${s.textures} textures`;
(async () => {
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const port = serveur.address().port;
  for (const carte of CARTES) for (const qualite of QUALITES) {
    console.log(`── carte ${carte}, qualité ${qualite} ──`);
    const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
    await page.goto(`http://localhost:${port}/test/poncin-atelier.html?carte=${carte}&qualite=${qualite}`);
    const pret = await page.evaluate(() => atelier.pret);
    verif(pret && pret.ok, `WebGL et décor prêts (carte ${pret && pret.source}, ${pret && pret.taille} m, sol ${pret && pret.stats.sol}, ${pret && pret.stats.tuiles} tuiles)`);
    if (!pret || !pret.ok) { await ctx.close(); continue; }
    const budget = pret.stats.budget;
    verif(pret.stats.qualite === qualite, `la qualité demandée par l'adresse est appliquée (${pret.stats.qualite})`);
    if (pret.stats.tuiles > 16) verif(false, `≤ 16 tuiles de bâtiments (${pret.stats.tuiles})`);
    // le sol est maillé avec la triangulation de monde.hauteur : un rayon vertical sur le maillage retrouve la hauteur du monde, au millimètre
    const sol = await page.evaluate(() => {
      const I = PRENDU._interne, m = I.scene.getObjectByName('sol'), M = atelier.monde, L = M.L, rc = new THREE.Raycaster(), bas = new THREE.Vector3(0, -1, 0); let pire = 0, n = 0;
      m.updateMatrixWorld(true);
      for (let k = 0; k < 400; k++) { const x = -L / 2 + 0.3 + ((k * 0.6180339887) % 1) * (L - 0.6), z = -L / 2 + 0.3 + ((k * 0.7548776662) % 1) * (L - 0.6); rc.set(new THREE.Vector3(x, 2000, z), bas); const h = rc.intersectObject(m, false)[0]; if (!h) continue; n++; pire = Math.max(pire, Math.abs(h.point.y - M.hauteur(x, z))); }
      return { n, pire };
    });
    verif(sol.n >= 390 && sol.pire < 0.005, `le maillage du sol suit monde.hauteur (${sol.n} points, écart max ${(sol.pire * 1000).toFixed(2)} mm)`);
    const stats = {};
    for (const nom of SCENES) {
      const s = await page.evaluate((n) => atelier.scene(n), nom);
      if (!s) { verif(false, `scène ${nom} inconnue`); continue; }
      await page.screenshot({ path: path.join(out, `${carte}-${qualite}-${nom}.png`), timeout: 180000 });
      stats[nom] = s;
      verif(s.calls <= budget.calls && s.triangles <= budget.triangles, `${nom.padEnd(9)} ${fmt(s)} (budget ${budget.calls} / ${budget.triangles / 1000}k)`);
    }
    // géométries et textures stables : on rejoue deux fois toutes les scènes (poses, tirs, impacts, confettis)
    const g0 = await page.evaluate(() => PRENDU.stats), suite = [];
    for (let r = 0; r < 2; r++) for (const nom of SCENES) suite.push(await page.evaluate((n) => { const s = atelier.scene(n); return { g: s.geometries, t: s.textures }; }, nom));
    const g1 = await page.evaluate(() => PRENDU.stats), gmax = Math.max(...suite.map((x) => x.g)), tmax = Math.max(...suite.map((x) => x.t));
    verif(g1.geometries <= g0.geometries + 2 && gmax <= g0.geometries + 4, `géométries stables en rejouant les scènes (${g0.geometries} → ${g1.geometries}, au plus ${gmax})`);
    verif(tmax <= g0.textures, `textures stables (${g0.textures} → ${g1.textures})`);
    // le contexte WebGL perdu : la simulation continue (image() ne lève rien), puis le décor revient
    const perte = await page.evaluate(async () => {
      const r = { avant: PRENDU.stats.geometries }; if (!atelier.perdre()) return { ok: false, raison: 'pas de WEBGL_lose_context' };
      await new Promise((f) => setTimeout(f, 200)); let lance = null;
      try { for (let i = 0; i < 5; i++) atelier.etape(1 / 60, 1); } catch (e) { lance = e.message; }
      r.pendant = PRENDU.stats.webgl; r.lance = lance; atelier.retrouver();
      let n = 0; const pompe = () => { n++; atelier.etape(1 / 60, 1); if (!PRENDU.stats.webgl && n < 300) requestAnimationFrame(pompe); }; requestAnimationFrame(pompe); // le navigateur rend le contexte à l'image suivante (comme la boucle du jeu)
      for (let i = 0; i < 60 && !PRENDU.stats.webgl; i++) await new Promise((f) => setTimeout(f, 100));
      atelier.scene('place'); r.apres = PRENDU.stats; r.ok = true; return r;
    });
    verif(perte.ok && perte.pendant === false && !perte.lance && perte.apres.webgl && perte.apres.calls > 10 && perte.apres.triangles > 10000, `contexte WebGL perdu puis retrouvé : ${perte.ok ? `pendant la perte webgl=${perte.pendant}, rien ne lève${perte.lance ? ' (sauf : ' + perte.lance + ')' : ''} ; après : ${fmt(perte.apres)}` : perte.raison}`);
    await page.screenshot({ path: path.join(out, `${carte}-${qualite}-retour-contexte.png`), timeout: 180000 });
    const fin = await page.evaluate(() => PRENDU.stats);
    verif(fin.erreurs === 0, `aucune erreur interne du rendu (${fin.erreurs}${fin.derniereErreur ? ' : ' + fin.derniereErreur : ''})`);
    verif(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
    console.log(`  info GPU : ${fin.gpu} ; DPR ${fin.dpr} ; champ vertical ${fin.fov}°`);
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  console.log(`\n${oks} ok, ${echecs} en échec — captures dans ${path.relative(racine, out)}/`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); serveur.close(); process.exit(1); });
