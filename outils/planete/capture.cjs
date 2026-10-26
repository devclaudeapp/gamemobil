// La petite planète de « Ma chaîne » (src/planete.js) sur sa page d'essai (outils/planete/page.cjs), téléphone en portrait (390 × 844) :
// captures, vidéo et mesures. La boucle de la planète est suspendue (PLANETE.essai.pause) : le script fait les images une à une (SwiftShader
// rend lentement : en temps réel, rien n'aurait le temps de se passer), et ses gestes sont de vrais touchers (CDP Input.dispatchTouchEvent)
// horodatés à la cadence d'un écran.
// usage : node capture.cjs [--captures] [--video 9] [--mesures] [--port 9660] [--sortie <dossier>]
//   --captures : haute et éco, en plein écran et dans le cadre de l'écran « Ma chaîne » (la planète en haut, la liste dessous), à 5, 15 et
//                30 boutiques ; une boutique touchée (son étiquette : sa jauge, son gérant, ses jetons) ; en haute, une Boutique d'or et un
//                gérant de près, la nuit, 150 et 300 boutiques (les îlots) ; le soir, l'autre face, chaque région de près (la planche) ; trois
//                cartes postales.
//   --video s  : s secondes à 30 images/s, dans le cadre de l'écran : l'arrivée, un glissé et son inertie, pincer, toucher une boutique, son
//                étiquette, « Entrer » (le plongeon) → planete.mp4
//   --mesures  : appels de dessin et triangles (la pire des vues : chaque région, sept zooms, deux caps ; à 30, 59, 150 et 300 boutiques,
//                haute et éco) ; le temps de construction (à froid et depuis le cache) ; le temps processeur d'une image (×1 et ×4) ; la
//                mémoire sur cinq ouvertures et fermetures.
// Sorties dans --sortie (par défaut <tmp>/planete). Playwright (NODE_PATH) ; ffmpeg pour la vidéo ; montage (ImageMagick) pour la planche.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { servir } = require('./page.cjs');
const args = process.argv.slice(2), opt = (k) => args.includes(k), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(__dirname, '../..'), PORT = +val('--port', 9660), SORTIE = path.resolve(val('--sortie', path.join(os.tmpdir(), 'planete')));
fs.mkdirSync(SORTIE, { recursive: true });
const demandes = [], server = servir(ROOT, PORT, demandes);
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function jeu(qualite, dpr, cadre) {
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
    await page.goto(`http://localhost:${PORT}/fournil/planete-essai.html?qualite=${qualite}&cadre=${cadre || 'plein'}`);
    await page.waitForFunction(() => window.ESSAI && typeof PLANETE !== 'undefined' && PLANETE.actif, null, { timeout: 90000 });
    const ev = (f, a) => page.evaluate(f, a);
    const cdp = await ctx.newCDPSession(page);
    const touche = (type, pts, ts) => cdp.send('Input.dispatchTouchEvent', Object.assign({ type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) }, ts ? { timestamp: ts } : {}));
    // ouvrir la planète à la n°N (N − 1 boutiques), à l'heure h (midi par défaut), le kit arrivé en haute, l'arrivée jouée ; la boucle suspendue
    async function planete(N, h, o) {
      await ev(([N, h, o]) => ESSAI.ouvrir(N, Object.assign({ heure: h }, o || {})), [N, h == null ? 12 : h, o || {}]);
      await page.waitForFunction((q) => PLANETE.ouvert && (q === 'eco' || PLANETE.stats.kit), qualite, { timeout: 30000 }).catch(() => console.log('(planète : sans kit)'));
      await ev(() => { PLANETE.essai.pause(true); PLANETE.essai.image(1 / 60, 110); });
    }
    const image = (n, dt) => ev(([n, dt]) => PLANETE.essai.image(dt, n), [n || 1, dt || 1 / 30]);
    return { ctx, page, ev, errs, cdp, touche, planete, image };
  }
  // (une capture : deux images, puis le temps des fondus de l'étiquette et de la légende, 0,2 s, sur une machine lente)
  const photo = async (J, nom) => { await J.image(2); await dodo(700); const f = path.join(SORTIE, nom + '.png'); await J.page.screenshot({ path: f }); console.log('capture', f); return f; };
  const cibleVue = (J, liste) => J.ev((liste) => { for (const n of liste) { const e = PLANETE.essai.ecran(n); if (e && e.vu && e.y > 90 && e.y < 700 && e.x > 30 && e.x < 350) return Object.assign({ n }, e); } return null; }, liste);
  const toucherBoutique = async (J, liste) => { const c = await cibleVue(J, liste); if (c) { await J.touche('touchStart', [[c.x, c.y]]); await J.touche('touchEnd', []); await J.image(90); } return c ? c.n : 0; };

  if (opt('--captures')) {
    for (const q of ['haute', 'eco']) {
      for (const cadre of ['plein', 'ecran']) {
        const J = await jeu(q, 2, cadre), pre = `${q}-${cadre}`;
        for (const N of [6, 16, 31]) { await J.planete(N); await J.ev(() => PLANETE.essai.touche()); await photo(J, `${pre}-${String(N - 1).padStart(2, '0')}-boutiques`); }
        // une boutique touchée (un vrai toucher sur son fanion) : la caméra s'approche, puis son étiquette (sa jauge, son gérant, ses jetons)
        await J.planete(16); const n = await toucherBoutique(J, [13, 9, 6, 1, 8, 3]);
        await photo(J, `${pre}-boutique-touchee-n${n}`);
        if (q === 'haute') {
          await J.planete(31); await J.ev(() => { PLANETE.viser(24); PLANETE.essai.image(1 / 30, 90); }); await photo(J, `${pre}-boutique-or-n24`); // (une Boutique d'or : n % 7 === 3)
          await J.planete(31); await J.ev(() => { PLANETE.viser(27); PLANETE.essai.image(1 / 30, 90); }); await photo(J, `${pre}-gerant-n27`);
          await J.planete(31, 23); await J.ev(() => PLANETE.essai.touche()); await photo(J, `${pre}-30-boutiques-nuit`);
          await J.planete(151); await J.ev(() => PLANETE.essai.touche()); await photo(J, `${pre}-150-boutiques`);
          await J.planete(301); await J.ev(() => { PLANETE.essai.touche(); PLANETE.essai.regarder(6, 0.3, 0.25); }); await photo(J, `${pre}-300-boutiques-ilots`);
        }
        if (J.errs.length) console.log('erreurs', pre, J.errs.slice(0, 5));
        await J.ctx.close();
      }
    }
    // plein écran, haute : le soir, l'autre face, chaque région de près (la planche), des cartes postales
    const J = await jeu('haute', 2, 'plein');
    await J.planete(31, 19); await J.ev(() => PLANETE.essai.touche()); await photo(J, 'haute-plein-30-boutiques-soir');
    await J.planete(31); await J.ev(() => { PLANETE.essai.touche(); PLANETE.essai.tourner(Math.PI, 0); }); await photo(J, 'haute-plein-30-boutiques-autre-face');
    const ids = await J.ev(() => PLANETE.REG.map((R) => R.id)), fichiers = [];
    await J.planete(31); await J.ev(() => PLANETE.essai.touche());
    for (let i = 0; i < ids.length; i++) { await J.ev((i) => PLANETE.essai.regarder(i, 0.72, 0), i); fichiers.push(await photo(J, `region-${String(i).padStart(2, '0')}-${ids[i]}`)); }
    execFileSync('montage', [...fichiers, '-tile', '5x2', '-geometry', '390x844+6+6', '-background', '#FFF8EE', path.join(SORTIE, 'planche-regions.png')]);
    for (const f of fichiers) fs.unlinkSync(f);
    console.log('capture', path.join(SORTIE, 'planche-regions.png'));
    for (const id of ['village', 'capitale', 'ile']) {
      const url = await J.ev((id) => PLANETE.photo(id), id);
      if (url) { const f = path.join(SORTIE, `carte-postale-${id}.jpg`); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('capture', f); }
    }
    if (J.errs.length) console.log('erreurs', J.errs.slice(0, 5));
    await J.ctx.close();
  }

  if (opt('--video')) {
    const J = await jeu('haute', 2, 'ecran'), FPS = 30, n = Math.round(+val('--video') * FPS), dir = path.join(SORTIE, 'images-video');
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await J.ev(() => ESSAI.ouvrir(16, { heure: 12 }));
    await J.page.waitForFunction(() => PLANETE.ouvert && PLANETE.stats.kit, null, { timeout: 30000 }).catch(() => {});
    await J.ev(() => { ESSAI.ouvrir(16, { heure: 12 }); PLANETE.essai.pause(true); }); // (de nouveau, le kit en cache : l'arrivée filmée depuis le début)
    let ts = Date.now() / 1000; const T = (k) => k / FPS, Y = 250; // (le milieu de la planète, dans le cadre de l'écran)
    const cible = { n: 0 };
    for (let k = 0; k < n; k++) {
      const t = T(k);
      // un glissé vers la gauche (1,4 → 2,15 s), puis l'inertie
      if (t >= 1.4 && t < 2.15) { const u = (t - 1.4) / 0.75, x = 310 - u * 220, y = Y + Math.sin(u * 3) * 10; await J.touche(k === Math.round(1.4 * FPS) ? 'touchStart' : 'touchMove', [[x, y]], ts += 1 / FPS); }
      if (k === Math.round(2.15 * FPS)) await J.touche('touchEnd', [], ts += 1 / FPS);
      // pincer pour zoomer un peu (3,5 → 4,1 s), puis relâcher : le zoom tient ; dézoomer (4,4 → 4,9 s)
      if (t >= 3.5 && t < 4.1) { const u = (t - 3.5) / 0.6, d = 30 + u * 55; await J.touche(k === Math.round(3.5 * FPS) ? 'touchStart' : 'touchMove', [[195 - d, Y - d * 0.8], [195 + d, Y + d * 0.8]], ts += 1 / FPS); }
      if (k === Math.round(4.1 * FPS)) await J.touche('touchEnd', [], ts += 1 / FPS);
      if (t >= 4.4 && t < 4.9) { const u = (t - 4.4) / 0.5, d = 95 - u * 70; await J.touche(k === Math.round(4.4 * FPS) ? 'touchStart' : 'touchMove', [[195 - d, Y - d * 0.8], [195 + d, Y + d * 0.8]], ts += 1 / FPS); }
      if (k === Math.round(4.9 * FPS)) await J.touche('touchEnd', [], ts += 1 / FPS);
      // toucher une boutique (5,3 s) : elle vient devant, puis son étiquette ; « Entrer » (7,9 s) : la caméra plonge vers sa porte
      if (k === Math.round(5.3 * FPS)) {
        const c = await J.ev(() => { for (const n of [13, 6, 1, 8, 3, 9, 2, 5, 11, 7]) { const e = PLANETE.essai.ecran(n); if (e && e.vu && e.y > 90 && e.y < 400 && e.x > 30 && e.x < 350) return Object.assign({ n }, e); } return null; });
        if (c) { cible.n = c.n; await J.touche('touchStart', [[c.x, c.y]], ts += 1 / FPS); await J.touche('touchEnd', [], ts += 0.05); }
      }
      if (k === Math.round(7.9 * FPS)) { const b = await J.ev(() => { const e = document.querySelector('.pl-et-entrer'); if (!e || !PLANETE.stats.etiquette) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); if (b) { await J.touche('touchStart', [b], ts += 1 / FPS); await J.touche('touchEnd', [], ts += 0.05); } }
      await J.image(1, 1 / FPS); await dodo(30);
      await J.page.screenshot({ path: path.join(dir, `i${String(k).padStart(4, '0')}.png`) });
      if (k % 30 === 0) process.stdout.write(`${k}/${n} `);
    }
    const out = path.join(SORTIE, 'planete.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'i%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', out]);
    fs.rmSync(dir, { recursive: true, force: true });
    const journal = await J.ev(() => ESSAI.journal.slice());
    console.log(`\nvidéo ${out} ${(fs.statSync(out).size / 1024).toFixed(0)} Ko (boutique touchée : n°${cible.n} ; ${journal.join(', ')})`);
    if (J.errs.length) console.log('erreurs vidéo', J.errs.slice(0, 5));
    await J.ctx.close();
  }

  if (opt('--mesures')) {
    const mes = { charge: fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ') };
    for (const q of ['haute', 'eco']) {
      demandes.length = 0;
      const J = await jeu(q, 1, 'plein'), m = mes[q] = {};
      const pire = () => J.ev(() => {
        PLANETE.essai.pause(true); let calls = 0, tri = 0, ou = '';
        for (let i = 0; i < PLANETE.REG.length; i++) for (const [z, pe] of [[0, 0.36], [0.2, 0.3], [0.3, 0.25], [0.4, 0.2], [0.55, 0.1], [0.72, 0], [0.9, 0]]) for (const tr of [0, 0.5]) {
          PLANETE.essai.regarder(i, z, pe); if (tr) PLANETE.essai.tourner(tr, 0); PLANETE.essai.image(1 / 60, 2); const s = PLANETE.stats; calls = Math.max(calls, s.calls); if (s.triangles > tri) { tri = s.triangles; ou = PLANETE.REG[i].id + ' z' + z + (tr ? ' tourné' : ''); }
        }
        PLANETE.essai.repos(); return { calls, triangles: tri, ou };
      });
      for (const N of [31, 60, 151, 301]) { await J.planete(N); const s = await J.ev(() => { const s = PLANETE.stats; return { calls: s.calls, triangles: s.triangles, geometries: s.geometries, textures: s.textures, programmes: s.programmes, placees: s.placees, ilots: s.ilots }; }); s.pire = await pire(); m[`chaine${N - 1}`] = s; }
      m.octetsKit = demandes.reduce((a, d) => a + d.n, 0);
      // la construction : à froid (le cache vidé) et depuis le cache (rouvrir la même chaîne)
      m.ouverture = await J.ev(() => { ESSAI.fermer(); PLANETE.essai.oublier(); let t0 = performance.now(); ESSAI.ouvrir(31); const froid = performance.now() - t0, tf = PLANETE.stats.temps; ESSAI.fermer(); t0 = performance.now(); ESSAI.ouvrir(31); const cache = performance.now() - t0; return { froid: +froid.toFixed(1), cache: +cache.toFixed(1), detail: tf, memo: PLANETE.stats.memo }; });
      // le temps processeur d'une image : la file du processeur graphique vidée avant (gl.finish, hors chrono), 5 de chauffe, 20 mesurées ;
      // avec et sans les appels de dessin, à ×1 et à ×4 (CDP Emulation.setCPUThrottlingRate) ; au repos puis en rotation (les fanions bougent)
      await J.planete(31);
      const mesure = async (rate, dessin, rotation) => {
        await J.cdp.send('Emulation.setCPUThrottlingRate', { rate }); const v = [];
        for (let i = 0; i < 25; i++) { const c = await J.ev(([dessin, rotation]) => { const cv = document.querySelector('.pl-toile'), gl = cv.getContext('webgl2') || cv.getContext('webgl'); gl.finish(); window.__dessin(dessin); if (rotation) PLANETE.essai.tourner(0.02, 0.004); const t0 = performance.now(); PLANETE.essai.image(1 / 60); const t = performance.now() - t0; window.__dessin(true); return t; }, [dessin, rotation]); if (i >= 5) v.push(c); }
        await J.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        v.sort((a, b) => a - b); const p = (x) => +v[Math.min(v.length - 1, Math.floor(x * v.length))].toFixed(2); return { min: p(0), med: p(0.5), p90: p(0.9) };
      };
      m.temps = {};
      for (const [cle, rot] of [['repos', false], ['rotation', true]]) m.temps[cle] = { sansDessin1: await mesure(1, false, rot), avecDessin1: await mesure(1, true, rot), sansDessin4: await mesure(4, false, rot), avecDessin4: await mesure(4, true, rot) };
      // la mémoire : cinq ouvertures et fermetures (le tas après le ramasse-miettes, la mémoire du renderer de la planète)
      const tas = async () => { await J.cdp.send('HeapProfiler.collectGarbage'); await dodo(100); await J.cdp.send('HeapProfiler.collectGarbage'); return +((await J.cdp.send('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(2); };
      await J.ev(() => ESSAI.fermer()); m.memoire = [{ tas: await tas() }];
      for (let k = 0; k < 5; k++) { await J.ev(() => ESSAI.ouvrir(31)); await dodo(1200); const p = await J.ev(() => `${PLANETE.stats.geometries}/${PLANETE.stats.textures}`); await J.ev(() => ESSAI.fermer()); await dodo(500); m.memoire.push({ tas: await tas(), planete: p, canvas: await J.ev(() => document.querySelectorAll('canvas').length) }); }
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
