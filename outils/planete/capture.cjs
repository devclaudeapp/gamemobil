// La petite planète dans le vrai jeu (?planete=1), téléphone en portrait (390 × 844) : captures, vidéo et mesures, comme outils/clients3d/boutique.cjs.
// La boucle de la planète est suspendue (PLANETE.essai.pause) : le script fait les images une à une (SwiftShader rend lentement : en temps
// réel, rien n'aurait le temps de se passer), et ses gestes sont de vrais touchers (CDP Input.dispatchTouchEvent) horodatés à la cadence d'un écran.
// usage : node capture.cjs [--captures] [--video 9] [--mesures] [--port 9520] [--sortie <dossier>]
//   --captures : haute et éco, à 5, 15 et 30 boutiques ; une boutique touchée (son étiquette) ; l'autre face ; chaque région de près ;
//                le soir et la nuit (option heure : les vitres allumées, la tour dorée). Sans heure demandée, midi.
//   --video s  : s secondes à 30 images/s (l'arrivée, un glissé et son inertie, pincer, toucher une boutique, son étiquette, revenir) → planete.mp4
//   --mesures  : appels de dessin et triangles (vue d'ensemble, de près, à 30 et 59 boutiques, haute et éco) ; le temps processeur d'une image
//                (×1 et ×4, avec et sans les appels de dessin, la planète au repos et en rotation) ; la mémoire (cinq ouvertures et fermetures)
// Sorties dans --sortie (par défaut <tmp>/planete). Le jeu servi : ce dépôt (node build.js d'abord). Playwright (NODE_PATH), ffmpeg pour la vidéo.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const args = process.argv.slice(2), opt = (k) => args.includes(k), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(__dirname, '../..'), PORT = +val('--port', 9520), SORTIE = path.resolve(val('--sortie', path.join(os.tmpdir(), 'planete')));
fs.mkdirSync(SORTIE, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const demandes = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } if (p.includes('/hd/planete/')) demandes.push({ p, n: d.length }); res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function jeu(qualite, dpr) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr || 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    // les appels de dessin WebGL neutralisables (la mesure « sans dessin »)
    await ctx.addInitScript(() => {
      window.__dessin = (on) => {
        if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
        for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {};
      };
    });
    const page = await ctx.newPage(), errs = []; page.setDefaultTimeout(180000);
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|404|Failed to load/.test(m.text())) errs.push('console ' + m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/?planete=1&qualite=${qualite}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 90000 }); await dodo(600);
    const ev = (f, a) => page.evaluate(f, a);
    for (let k = 0; k < 4; k++) { await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a$="tard"], #feuille [data-a="ok"]'); if (b) b.click(); }); await dodo(250); }
    await ev(() => { const st = window.__fournil.st; st.tuto = 99; st.mystereTimer = 1e9; st.evTimer = 1e9; window.__fournil.tiroir('ferme'); });
    await ev(() => { const s = document.createElement('style'); s.textContent = '.toast, #feuille, #voile { visibility: hidden !important; }'; document.head.appendChild(s); });
    const cdp = await ctx.newCDPSession(page);
    const touche = (type, pts, ts) => cdp.send('Input.dispatchTouchEvent', Object.assign({ type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) }, ts ? { timestamp: ts } : {}));
    // ouvrir la planète à la n°N (N − 1 boutiques), à l'heure h (midi par défaut), le kit arrivé en haute, l'arrivée jouée ; la boucle suspendue
    async function planete(N, h) {
      await ev(() => { if (PLANETE_ECRAN.ouvert) PLANETE_ECRAN.fermer(); });
      await ev(([N, h]) => PLANETE_ECRAN.ouvrir({ boutiques: N, heure: h }), [N, h == null ? 12 : h]);
      await page.waitForFunction((q) => PLANETE.ouvert && (q === 'eco' || PLANETE.stats.kit), qualite, { timeout: 30000 }).catch(() => console.log('(planète : sans kit)'));
      await ev(() => { PLANETE.essai.pause(true); PLANETE.essai.image(1 / 60, 110); }); await dodo(1700); // (l'indice paraît en fondu, de 0,9 à 1,9 s)
    }
    const image = (n, dt) => ev(([n, dt]) => PLANETE.essai.image(dt, n), [n || 1, dt || 1 / 30]);
    return { ctx, page, ev, errs, cdp, touche, planete, image };
  }
  // (une capture : deux images, puis le temps des fondus de l'étiquette et de la légende, 0,2 s, sur une machine lente)
  const photo = async (J, nom) => { await J.image(2); await dodo(700); const f = path.join(SORTIE, nom + '.png'); await J.page.screenshot({ path: f }); console.log('capture', f); return f; };

  if (opt('--captures')) {
    for (const q of ['haute', 'eco']) {
      const J = await jeu(q, 2);
      for (const N of [6, 16, 31]) { await J.planete(N); await photo(J, `${q}-${String(N - 1).padStart(2, '0')}-boutiques`); }
      // une boutique touchée (un vrai toucher sur son drapeau) : la caméra s'approche, puis son étiquette
      await J.planete(16);
      const cible = await J.ev(() => { for (const n of [13, 6, 1, 8, 3]) { const e = PLANETE.essai.ecran(n); if (e && e.vu && e.y > 150 && e.y < 700 && e.x > 30 && e.x < 350) return Object.assign({ n }, e); } return null; });
      if (cible) { await J.touche('touchStart', [[cible.x, cible.y]]); await J.touche('touchEnd', []); await J.image(90); }
      await photo(J, `${q}-boutique-touchee-n${cible ? cible.n : 0}`);
      // le soir et la nuit : les vitres et les lanternes s'allument (la tour Eiffel aussi, dorée)
      await J.planete(31, 23); await photo(J, `${q}-30-boutiques-nuit`);
      if (q === 'haute') {
        await J.planete(31, 19); await photo(J, 'haute-30-boutiques-soir');
        await J.planete(16, 23); await J.ev(() => { PLANETE.viser(13); PLANETE.essai.image(1 / 30, 90); }); await photo(J, 'haute-boutique-touchee-n13-nuit');
        await J.planete(31, 22); await J.ev(() => { PLANETE.essai.regarder(9, 0.75, 0.1); PLANETE.essai.tourner(0, -0.35); }); await photo(J, 'haute-capitale-nuit');
        await J.planete(31); await J.ev(() => { PLANETE.viser(30); PLANETE.essai.image(1 / 30, 90); }); await photo(J, 'haute-boutique-touchee-n30');
        await J.planete(31); await J.ev(() => { PLANETE.viser(3); PLANETE.essai.image(1 / 30, 90); }); await photo(J, 'haute-boutique-touchee-n3');
        await J.planete(31); await J.ev(() => { PLANETE.essai.tourner(Math.PI, 0); }); await photo(J, 'haute-30-boutiques-autre-face');
        await J.planete(16); await J.ev(() => { PLANETE.essai.tourner(Math.PI, 0); }); await photo(J, 'haute-15-boutiques-autre-face');
        // chaque région de près (la planche des régions)
        const ids = await J.ev(() => PLANETE.REG.map((R) => R.id)), fichiers = [];
        await J.planete(31);
        for (let i = 0; i < ids.length; i++) { await J.ev((i) => PLANETE.essai.regarder(i, 0.72, 0), i); fichiers.push(await photo(J, `region-${String(i).padStart(2, '0')}-${ids[i]}`)); }
        execFileSync('montage', [...fichiers, '-tile', '5x2', '-geometry', '390x844+6+6', '-background', '#FFF8EE', path.join(SORTIE, 'planche-regions.png')]);
        for (const f of fichiers) fs.unlinkSync(f);
        console.log('capture', path.join(SORTIE, 'planche-regions.png'));
      }
      if (J.errs.length) console.log('erreurs', q, J.errs.slice(0, 5));
      await J.ctx.close();
    }
  }

  if (opt('--video')) {
    const J = await jeu('haute', 2), FPS = 30, n = Math.round(+val('--video') * FPS), dir = path.join(SORTIE, 'images-video');
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await J.ev(() => PLANETE_ECRAN.ouvrir({ boutiques: 16, heure: 12 }));
    await J.page.waitForFunction(() => PLANETE.ouvert && PLANETE.stats.kit, null, { timeout: 30000 }).catch(() => {});
    await J.ev(() => { PLANETE.essai.pause(true); PLANETE.fermer(); PLANETE_ECRAN.fermer(); PLANETE_ECRAN.ouvrir({ boutiques: 16, heure: 12 }); PLANETE.essai.pause(true); }); // (de nouveau, le kit en cache : l'arrivée filmée depuis le début)
    let ts = Date.now() / 1000; const T = (k) => k / FPS;
    const cible = { n: 0 };
    for (let k = 0; k < n; k++) {
      const t = T(k);
      // un glissé vers la gauche (1,5 → 2,2 s), puis l'inertie
      if (t >= 1.5 && t < 2.25) { const u = (t - 1.5) / 0.75, x = 300 - u * 210, y = 470 + Math.sin(u * 3) * 10; await J.touche(k === Math.round(1.5 * FPS) ? 'touchStart' : 'touchMove', [[x, y]], ts += 1 / FPS); }
      if (k === Math.round(2.25 * FPS)) await J.touche('touchEnd', [], ts += 1 / FPS);
      // pincer pour zoomer un peu (3,9 → 4,5 s), puis relâcher : le zoom tient ; dézoomer (4,9 → 5,4 s)
      if (t >= 3.9 && t < 4.5) { const u = (t - 3.9) / 0.6, d = 40 + u * 70; await J.touche(k === Math.round(3.9 * FPS) ? 'touchStart' : 'touchMove', [[195 - d, 420 - d], [195 + d, 420 + d]], ts += 1 / FPS); }
      if (k === Math.round(4.5 * FPS)) await J.touche('touchEnd', [], ts += 1 / FPS);
      if (t >= 4.9 && t < 5.4) { const u = (t - 4.9) / 0.5, d = 120 - u * 90; await J.touche(k === Math.round(4.9 * FPS) ? 'touchStart' : 'touchMove', [[195 - d, 420 - d], [195 + d, 420 + d]], ts += 1 / FPS); }
      if (k === Math.round(5.4 * FPS)) await J.touche('touchEnd', [], ts += 1 / FPS);
      // toucher une boutique (5,8 s) : elle vient devant, puis son étiquette ; toucher le ciel (8,4 s) : retour à la planète
      if (k === Math.round(5.8 * FPS)) {
        const c = await J.ev(() => { for (const n of [13, 6, 1, 8, 3, 2, 5]) { const e = PLANETE.essai.ecran(n); if (e && e.vu && e.y > 150 && e.y < 700 && e.x > 30 && e.x < 350) return Object.assign({ n }, e); } return null; });
        if (c) { cible.n = c.n; await J.touche('touchStart', [[c.x, c.y]], ts += 1 / FPS); await J.touche('touchEnd', [], ts += 0.05); }
      }
      if (k === Math.round(8.4 * FPS)) { await J.touche('touchStart', [[195, 110]], ts += 1 / FPS); await J.touche('touchEnd', [], ts += 0.05); }
      await J.image(1, 1 / FPS); await dodo(30);
      await J.page.screenshot({ path: path.join(dir, `i${String(k).padStart(4, '0')}.png`) });
      if (k % 30 === 0) process.stdout.write(`${k}/${n} `);
    }
    const out = path.join(SORTIE, 'planete.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'i%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', out]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\nvidéo ${out} ${(fs.statSync(out).size / 1024).toFixed(0)} Ko (boutique touchée : n°${cible.n})`);
    if (J.errs.length) console.log('erreurs vidéo', J.errs.slice(0, 5));
    await J.ctx.close();
  }

  if (opt('--mesures')) {
    const mes = { charge: fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ') };
    for (const q of ['haute', 'eco']) {
      demandes.length = 0;
      const J = await jeu(q, 1), m = mes[q] = {};
      const st = () => J.ev(() => { const s = PLANETE.stats; return { calls: s.calls, triangles: s.triangles, geometries: s.geometries, textures: s.textures, programmes: s.programmes, regions: s.regionsVues }; });
      for (const N of [6, 16, 31, 60]) { await J.planete(N); m[`ensemble${N - 1}`] = await st(); }
      await J.planete(31); await J.ev(() => { PLANETE.viser(30); PLANETE.essai.image(1 / 30, 90); }); m.pres30 = await st();
      await J.ev(() => { PLANETE.relacher(); PLANETE.essai.image(1 / 30, 60); });
      m.octetsKit = demandes.reduce((a, d) => a + d.n, 0);
      // le temps processeur d'une image : la file du processeur graphique vidée avant (gl.finish, hors chrono), 5 de chauffe, 20 mesurées ;
      // avec et sans les appels de dessin, à ×1 et à ×4 (CDP Emulation.setCPUThrottlingRate) ; au repos puis en rotation (les drapeaux bougent)
      const mesure = async (rate, dessin, rotation) => {
        await J.cdp.send('Emulation.setCPUThrottlingRate', { rate }); const v = [];
        for (let i = 0; i < 25; i++) { const c = await J.ev(([dessin, rotation]) => { const cv = document.querySelector('#planete .pl-toile'), gl = cv.getContext('webgl2') || cv.getContext('webgl'); gl.finish(); window.__dessin(dessin); if (rotation) PLANETE.essai.tourner(0.02, 0.004); const t0 = performance.now(); PLANETE.essai.image(1 / 60); const t = performance.now() - t0; window.__dessin(true); return t; }, [dessin, rotation]); if (i >= 5) v.push(c); }
        await J.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        v.sort((a, b) => a - b); const p = (x) => +v[Math.min(v.length - 1, Math.floor(x * v.length))].toFixed(2); return { min: p(0), p10: p(0.1), med: p(0.5), p90: p(0.9) };
      };
      m.temps = {};
      for (const [cle, rot] of [['repos', false], ['rotation', true]]) m.temps[cle] = { sansDessin1: await mesure(1, false, rot), avecDessin1: await mesure(1, true, rot), sansDessin4: await mesure(4, false, rot), avecDessin4: await mesure(4, true, rot) };
      // la construction à l'ouverture (le sol, le décor, les boutiques ; ×1)
      m.ouverture = await J.ev(() => { PLANETE_ECRAN.fermer(); const t0 = performance.now(); PLANETE_ECRAN.ouvrir({ boutiques: 31, heure: 12 }); return +(performance.now() - t0).toFixed(1); });
      // la mémoire : cinq ouvertures et fermetures (le tas après le ramasse-miettes, la mémoire du renderer de la boutique)
      const tas = async () => { await J.cdp.send('HeapProfiler.collectGarbage'); await dodo(100); await J.cdp.send('HeapProfiler.collectGarbage'); return +((await J.cdp.send('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(2); };
      await J.ev(() => PLANETE_ECRAN.fermer()); await dodo(800);
      // (la boutique finit de charger sa HD et ses clients 3D, cuits à petits pas : on attend qu'ils soient prêts et que sa mémoire ne bouge plus)
      await J.page.waitForFunction(() => !SCENE.clients3d || SCENE.clients3d.pret || SCENE.stats.qualite === 'eco', null, { timeout: 90000 }).catch(() => {});
      for (let k = 0, der = '', stable = 0; k < 40 && stable < 4; k++) { await dodo(500); const x = await J.ev(() => `${SCENE.stats.geometries}/${SCENE.stats.textures}`); stable = x === der ? stable + 1 : 0; der = x; }
      m.memoire = [{ tas: await tas(), boutique: await J.ev(() => `${SCENE.stats.geometries}/${SCENE.stats.textures}`) }];
      for (let k = 0; k < 5; k++) { await J.ev(() => PLANETE_ECRAN.ouvrir({ boutiques: 31, heure: 12 })); await dodo(1500); const p = await J.ev(() => `${PLANETE.stats.geometries}/${PLANETE.stats.textures}`); await J.ev(() => PLANETE_ECRAN.fermer()); await dodo(800); m.memoire.push({ tas: await tas(), boutique: await J.ev(() => `${SCENE.stats.geometries}/${SCENE.stats.textures}`), planete: p }); }
      m.erreurs = J.errs.slice(0, 5);
      console.log(q, JSON.stringify(m));
      await J.ctx.close();
    }
    mes.charge += ' → ' + fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
    fs.writeFileSync(path.join(SORTIE, 'mesures.json'), JSON.stringify(mes, null, 1));
    console.log('mesures', path.join(SORTIE, 'mesures.json'));
  }
  await browser.close(); server.close();
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });
