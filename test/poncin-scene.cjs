// Opération Poncin — captures du rendu 3D (Playwright, iPhone en paysage : 844×390, deviceScaleFactor 2), carte réelle puis provisoire,
// qualité haute puis éco : une rue du bourg, la place de l'arène, le château et le clocher vus de la rue, la rivière et un pont, une vue
// d'en haut, personnages et robots de près, tirs (traînées, éclairs, impacts de peinture), confettis d'une élimination, le survol du titre ;
// sur la carte réelle, le Poncin « authentique » : la place Xavier-Bichat (mairie, tabac, banque) et son sol, la terrasse du Bar des Sports,
// la Porte Bouvent des deux côtés et dedans, l'Impasse du Bonheur des deux côtés, la nef de l'église (portail, vitraux), les bords de l'Ain
// (saules, peupliers), l'horizon du Bugey.
// Pour chaque image : appels de dessin, triangles (passe d'ombre comprise), géométries, mémoire des textures, comparés aux budgets du
// contrat ; décor (PDECOR), végétation (PVEGETATION), matières en couches et voûtes branchés ; le sol de la place est un asphalte gris même
// là où la photo montre les couronnes des platanes ; l'intérieur des voûtes ne voit jamais le soleil ; puis les géométries et les textures
// doivent rester stables quand on rejoue toutes les scènes, et le contexte WebGL perdu puis retrouvé doit redonner une image ; sur la carte
// réelle enfin, un palier de la qualité adaptative ne refait ni les textures ni les bâtiments, et des allers-retours de qualité choisie
// (vers l'éco et retour) rendent la mémoire JS (rien de mort gardé par MODELES.partager) et la mémoire des textures. Un tableau des comptes
// par vue et par qualité termine la sortie.
// Le rendu est logiciel (SwiftShader) : on ne juge pas les images par seconde, seulement les budgets et les images.
// Usage : node test/poncin-scene.cjs [--carte=reelle,provisoire] [--qualite=haute,eco] [--scenes=rue,tir]
// (NODE_PATH=/opt/node22/lib/node_modules si Playwright est installé globalement). Captures dans test/shots/poncin-scene/.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..'), out = path.join(__dirname, 'shots', 'poncin-scene'); fs.mkdirSync(out, { recursive: true });
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CARTES = arg('carte', 'reelle,provisoire').split(','), QUALITES = arg('qualite', 'haute,eco').split(',');
const AUTH = ['place-sol', 'mairie', 'tabac', 'banque', 'terrasse', 'bouvent-nord', 'bouvent-dedans', 'bouvent-sud', 'bonheur-est', 'bonheur-ouest', 'nef', 'ain', 'horizon']; // carte réelle seulement
const SCENES0 = arg('scenes', ['rue', 'place', ...AUTH, 'chateau', 'eglise', 'pont', 'haut', 'persos', 'tir', 'confettis', 'survol'].join(',')).split(',');
const TABLEAU = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let echecs = 0, oks = 0;
const verif = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else echecs++; };
const fmt = (s) => `${s.calls} appels, ${(s.triangles / 1000).toFixed(1)}k triangles, ${s.geometries} géométries, ${s.textures} textures`;
const mediane = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
(async () => {
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const port = serveur.address().port;
  for (const carte of CARTES) for (const qualite of QUALITES) {
    console.log(`── carte ${carte}, qualité ${qualite} ──`);
    const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const page = await ctx.newPage(), erreurs = [], cdp = await ctx.newCDPSession(page);
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
    await page.goto(`http://localhost:${port}/test/poncin-atelier.html?carte=${carte}&qualite=${qualite}`);
    const pret = await page.evaluate(() => atelier.pret);
    verif(pret && pret.ok, `WebGL et décor prêts (carte ${pret && pret.source}, ${pret && pret.taille} m, sol ${pret && pret.stats.sol}, ${pret && pret.stats.tuiles} tuiles)`);
    if (!pret || !pret.ok) { await ctx.close(); continue; }
    const budget = pret.stats.budget, SCENES = carte === 'reelle' ? SCENES0 : SCENES0.filter((n) => !AUTH.includes(n));
    verif(pret.stats.qualite === qualite, `la qualité demandée par l'adresse est appliquée (${pret.stats.qualite})`);
    if (carte === 'reelle') { // le décor authentique est branché
      const a = await page.evaluate(() => { const I = PRENDU._interne, s = PRENDU.stats; return { decor: !!I.decor, veg: !!I.veg, jupe: !!I.scene.getObjectByName('jupe'), horizon: !!I.scene.getObjectByName('decor-horizon'), voutes: s.voutes, passages: atelier.monde.passages.length, bati: s.bati, arbres: s.arbres, vieuxArbres: !!I.scene.getObjectByName('arbres0'), dErr: s.decor && s.decor.erreurs, sol: s.sol }; });
      verif(a.decor && a.veg && !a.vieuxArbres, `PDECOR et PVEGETATION branchés (${a.arbres} arbres LiDAR, plus d'arbres instanciés d'avant)`);
      verif(a.horizon && !a.jupe, `l'horizon réel de PDECOR remplace les collines peintes`);
      verif(a.voutes === a.passages && a.passages === 2, `les ${a.passages} passages voûtés sont creusés (${a.voutes} voûtes)`);
      verif(a.bati === 'couches', `les bâtiments ont leurs matières (texture en couches : ${a.bati})`);
      verif(a.sol === 'photo' && !a.dErr, `le sol est la photo aérienne (${a.sol}), le décor sans erreur`);
      // l'intérieur des voûtes : un maillage à part (pas une tuile de plus), aux normales horizontales opposées au soleil : il n'est jamais
      // éclairé en direct, même sans carte d'ombre (moyenne, éco) ; il porte ombre (en haute, l'intrados ombre le sol du couloir)
      const v = await page.evaluate(() => { const I = PRENDU._interne, m = I.voutes; if (!m) return null; const n = m.geometry.attributes.normal.array, S = I.SOLEIL, l = Math.hypot(S[0], S[1], S[2]); let pire = -1, ny = 0;
        for (let i = 0; i < n.length; i += 3) { pire = Math.max(pire, (n[i] * S[0] + n[i + 1] * S[1] + n[i + 2] * S[2]) / l); ny = Math.max(ny, Math.abs(n[i + 1])); }
        return { tri: n.length / 9, pire, ny, ombre: m.castShadow && m.receiveShadow, tuile: I.tuiles.some((t) => t.gros === m || t.det === m), dansScene: m.parent === I.scene }; });
      verif(v && v.tri > 50 && v.pire < -0.2 && v.ny === 0 && v.ombre && !v.tuile && v.dansScene, `l'intérieur des voûtes : un maillage à part (${v && v.tri} triangles), tourné à l'opposé du soleil (N·L ≤ ${v && v.pire.toFixed(2)}) : jamais au soleil, même sans ombres`);
      // le sol de la place Xavier-Bichat (un parking) : un asphalte gris, même là où la photo aérienne montre les couronnes des platanes
      const ps = (await page.evaluate(() => atelier.solPlace())) || [], verts = ps.filter((o) => o.photo > 6);
      const mP = mediane(verts.map((o) => o.photo)), mR = mediane(verts.map((o) => o.rendu)), mL = mediane(ps.map((o) => o.l));
      verif(ps.length >= 40 && verts.length >= 10 && mR < 5 && mL > 60, `le sol de la place est un asphalte gris sous les platanes (${verts.length} des ${ps.length} points vus sont verts sur la photo : vert ${mP.toFixed(1)} → ${mR.toFixed(1)} rendu, luminance ${mL})`);
      await page.screenshot({ path: path.join(out, `${carte}-${qualite}-place-sol-mesure.png`), timeout: 180000 });
    }
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
      verif(s.calls <= budget.calls && s.triangles <= budget.triangles && s.memoire <= budget.memoire, `${nom.padEnd(14)} ${fmt(s)}, ${s.memoire} Mo (budget ${budget.calls} / ${budget.triangles / 1000}k / ${budget.memoire} Mo)`);
      TABLEAU.push([carte, qualite, nom, s.calls, Math.round(s.triangles / 100) / 10, s.memoire, s.decor ? s.decor.appels : '-', s.vegetation ? s.vegetation.appels : '-']);
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
    if (carte === 'reelle') {
      // les bases de PTEXTURES lisent leur tranche de la texture en couches des bâtiments : pas de copie de leurs pixels gardée en double
      const bs = await page.evaluate(() => { const B = PRENDU._interne.BATI; if (!B) return null; const buf = B.texture.image.data.buffer; let k = 0; PTEXTURES._interne.BASES.forEach((b) => { if (b && b.d && b.d.buffer === buf) k++; }); return { k, couches: B.noms.length }; });
      verif(bs && bs.k === bs.couches, `les ${bs && bs.couches} matières des bâtiments lisent la texture en couches, sans copie en double (${bs && bs.k} bases)`);
      // la qualité adaptative (un palier en pleine partie) ne refait ni les textures ni les bâtiments (ce serait un arrêt d'image)
      const autre = qualite === 'eco' ? 'moyenne' : 'eco';
      const pa = await page.evaluate((autre) => { const I = PRENDU._interne, t0 = I.tuiles[0] && I.tuiles[0].gros, p0 = PTEXTURES.qualite(), q0 = PRENDU.stats.qualite, r = {};
        I.palier(autre); atelier.scene('place'); r.q = PRENDU.stats.qualite; r.ptx = PTEXTURES.qualite(); r.memes = !!t0 && I.tuiles[0].gros === t0;
        I.palier(q0); atelier.scene('place'); r.retour = PRENDU.stats.qualite; r.memes2 = !!t0 && I.tuiles[0].gros === t0; r.p0 = p0; r.q0 = q0; r.err = PRENDU.stats.erreurs; return r; }, autre);
      verif(pa.q === autre && pa.ptx === pa.p0 && pa.memes && pa.retour === pa.q0 && pa.memes2 && !pa.err, `un palier de la qualité adaptative (${pa.q0} → ${pa.q} → ${pa.retour}) garde les textures (${pa.ptx}) et les bâtiments`);
      // la qualité choisie : vers l'éco (ou en revenir) refait les textures et les bâtiments ; au retour, la mémoire JS (après ramassage) et
      // celle des textures reviennent : rien de mort n'est gardé (les matériaux de PTEXTURES restent dans MODELES.partager, vidés)
      const tas = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576; };
      const base = await page.evaluate(() => atelier.scene('place')), H = [];
      for (const q of [autre, qualite, autre, qualite, autre, qualite]) { await page.evaluate((q) => { PRENDU.qualite(q); atelier.scene('place'); }, q); if (q === qualite) H.push(await tas()); }
      const apres = await page.evaluate(() => Object.assign({ ptx: PTEXTURES.qualite() }, atelier.scene('place')));
      verif(apres.ptx === qualite && apres.qualite === qualite && Math.abs(apres.memoire - base.memoire) < 0.5 && apres.textures <= base.textures && apres.calls === base.calls && Math.abs(apres.triangles - base.triangles) < 200,
        `allers-retours ${qualite} ↔ ${autre} choisis : textures refaites (${apres.ptx}), même image (${base.calls} → ${apres.calls} appels, ${base.memoire} → ${apres.memoire} Mo de textures, ${base.textures} → ${apres.textures} textures)`);
      verif(H[2] - H[1] < 4 && H[1] - H[0] < 4, `la mémoire JS revient après chaque aller-retour (${H.map((h) => h.toFixed(1)).join(' → ')} Mo : moins de 4 Mo d'écart ; la fuite d'avant gardait ≈ 34 Mo par aller-retour)`);
    }
    const fin = await page.evaluate(() => PRENDU.stats);
    verif(fin.erreurs === 0, `aucune erreur interne du rendu (${fin.erreurs}${fin.derniereErreur ? ' : ' + fin.derniereErreur : ''})`);
    verif(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
    console.log(`  info GPU : ${fin.gpu} ; DPR ${fin.dpr} ; champ vertical ${fin.fov}°`);
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  console.log('\ncarte      qualité  vue             appels  ktri   Mo    décor  végét.');
  for (const l of TABLEAU) console.log(`${l[0].padEnd(10)} ${l[1].padEnd(8)} ${l[2].padEnd(15)} ${String(l[3]).padStart(6)} ${String(l[4]).padStart(6)} ${String(l[5]).padStart(5)} ${String(l[6]).padStart(6)} ${String(l[7]).padStart(7)}`);
  console.log(`\n${oks} ok, ${echecs} en échec — captures dans ${path.relative(racine, out)}/`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); serveur.close(); process.exit(1); });
