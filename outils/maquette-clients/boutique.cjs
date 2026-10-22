// La boutique du Fournil (le worktree de la maquette) à 390×844, qualité haute, tout le mobilier, 6 à 8 clients (file, assis qui mangent).
// Le temps est piloté : la boucle du jeu (rAF) est gelée, le script appelle SCENE.frame(dt) image par image (SwiftShader rend ~1 image/s :
// en temps réel, rien n'aurait le temps de se passer) ; l'avance rapide neutralise les appels de dessin WebGL (comme test/fournil-batterie.cjs).
// usage : node boutique.cjs <nom> "<requête>" [--port 90xx] [--tiroir ferme|mi] [--avance s] [--video s] [--fps n] [--mesures] [--sans-cpu] [--cpu-temps] [--horloge ISO]
//         [--loupe "x,y,z;…"] (gros plans : la caméra du jeu resserrée sur un point de l'écran, px CSS) [--cote "x,ys,largeur,x|z;…"] (vues de côté)
// Math.random est graine-fixée : les mêmes clients d'une variante à l'autre. Sorties dans $MAQUETTE_TRAVAIL (par défaut <tmp>/maquette-clients) :
// captures/<nom>.png (+ -loupeN, -coteN), tmp/<nom>-images/, videos/<nom>.mp4, tmp/<nom>-mesures.json. Le jeu servi : ce dépôt (node build.js d'abord),
// ou --racine <dossier> (une autre copie, par exemple git archive de master). Playwright et son Chromium (NODE_PATH), ffmpeg pour la vidéo.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const BASE = process.env.MAQUETTE_TRAVAIL || path.join(os.tmpdir(), 'maquette-clients'); for (const d of ['captures', 'tmp', 'videos']) fs.mkdirSync(path.join(BASE, d), { recursive: true });
const args = process.argv.slice(2), nom = args[0], requete = args[1] || '', opt = (k) => args.includes(k), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(val('--racine', path.resolve(__dirname, '../..'))); // (--racine : une autre copie du jeu, par exemple master, pour comparer)
const PORT = +val('--port', 9010), TIROIR = val('--tiroir', 'ferme'), FPS = +val('--fps', 25), DT = 1 / 30;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const demandes = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } if (p.includes('/hd/')) demandes.push({ p, n: d.length }); res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    // deux suites graine-fixées : celle du jeu (VIE tire ses clients) et celle de three.js (les uuid des objets créés) ; ainsi les variantes,
    // qui ne créent pas les mêmes objets (chibis ou GLB), voient arriver exactement les mêmes clients
    let s = 20261022, s2 = 7; const r1 = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }, r2 = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
    Math.random = function () { const l = (new Error().stack || '').split('\n')[2] || ''; return /three\.min\.js|fournil-hd\.min\.js/.test(l) ? r2() : r1(); };
    // le détecteur de gel du jeu (ui.js, verifierReveil, chaque seconde) : l'avance rapide bloque la page plus de 5 s, il croirait à un retour
    // d'absence et rattraperait le temps « perdu » (ventes, clients) selon la durée réelle du blocage, qui dépend de la charge de la machine
    const si = window.setInterval, st = window.setTimeout; let gel = false;
    window.setInterval = function (fn, ms, ...r) { if (fn && fn.name === 'verifierReveil') return 0; return si.call(window, typeof fn === 'function' ? function () { if (!gel) return fn.apply(this, arguments); } : fn, ms, ...r); };
    window.setTimeout = function (fn, ms, ...r) { return st.call(window, typeof fn === 'function' ? function () { if (!gel) return fn.apply(this, arguments); } : fn, ms, ...r); };
    // au départ du temps piloté : la suite du jeu reprend sa graine, et les minuteurs de la page se taisent (sons, annonces, bandeaux :
    // ils tirent aussi au hasard, au rythme de l'horloge réelle ; la vie, elle, ne passe que par SCENE.frame)
    window.__depart = () => { s = 20261022; gel = true; };
    const raf = window.requestAnimationFrame.bind(window); let manuel = true; const file = []; // gelée dès le chargement : aucune image ne passe avant la mise en place (les variantes voient les mêmes clients)
    window.__rafManuel = (on) => { manuel = on; }; // gelée : les rappels de la boucle du jeu attendent (le script appelle SCENE.frame lui-même)
    window.requestAnimationFrame = (cb) => { if (!manuel) return raf(cb); file.push(cb); return file.length; };
    window.__dessin = (on) => { // les appels de dessin WebGL neutralisés (avance rapide) ou rendus
      if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
      for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {};
    };
  });
  // --horloge <ISO> : l'heure du jeu fixée (Date.now part de là au chargement de la page). Le débit de la boutique dépend de l'heure réelle
  // (heures de pointe), et la vie en tire la cadence des clients : deux rendus faits à des heures différentes n'auraient pas les mêmes clients
  if (val('--horloge')) await ctx.addInitScript((base) => { const p0 = performance.now(); Date.now = () => base + (performance.now() - p0); }, Date.parse(val('--horloge')));
  await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
  const page = await ctx.newPage(); const errs = []; page.setDefaultTimeout(180000); // (SwiftShader, machine partagée : une capture peut prendre plus de 30 s)
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || /Clients 3D/i.test(m.text())) errs.push(m.type() + ' ' + m.text()); });
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=haute${requete ? '&' + requete : ''}`);
  await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 90000, polling: 200 }); await dodo(800);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; for (let k = 0; k < 6; k++) if (st.stations[k]) st.stations[k].niv = Math.max(st.stations[k].niv, 25); st.images = 'max'; f.scene({ heure: 13, saison: [], assis: true }); });
  const fermer = () => ev(() => { const f = document.querySelector('#feuille'); if (f && !f.hidden) { const b = f.querySelector('[data-a="close"], [data-a$="tard"], [data-a="non"], [data-a="ok"], [data-a="pq-ok"]'); if (b) b.click(); } });
  for (let k = 0; k < 8; k++) { await dodo(300); await fermer(); }
  await ev((t) => window.__fournil.tiroir(t), TIROIR);
  // les lots HD (boutique), les modèles Kenney du jeu et le pack de clients s'il est demandé : demandés à la main (la boucle est gelée)
  await ev(() => { HDM.charger('boutique'); if (typeof CLIENTS3D !== 'undefined' && CLIENTS3D.actif) CLIENTS3D.charger(); });
  for (let t = 0; t < 120; t++) { const ok = await ev(() => HDM.pret('boutique') && (typeof KENNEY === 'undefined' || !KENNEY || KENNEY.pret || KENNEY.erreur) && (typeof CLIENTS3D === 'undefined' || !CLIENTS3D.actif || CLIENTS3D.pret || CLIENTS3D.erreur)); if (ok) break; await dodo(500); }
  await dodo(1200); await fermer();
  // (les toasts, et la feuille « Pendant ton absence » que le détecteur de gel du jeu ouvre quand un pas d'images bloque la page plus de 5 s)
  await ev(() => { const s = document.createElement('style'); s.textContent = '.toast, #feuille, #voile { visibility: hidden !important; }'; document.head.appendChild(s); });
  // le temps piloté : la boucle gelée ; pas(n, rendu) : n images de 1/30 s par SCENE.frame (sans dessin sauf la dernière si rendu)
  await ev(() => { window.__rafManuel(true); window.__tSim = 0; window.__depart(); });
  await dodo(300);
  const pas = (n, rendu, fn) => ev(([n, rendu, DT, fn]) => {
    const f = window.__fournil, S = f.SCENE; window.__dessin(false);
    for (let i = 0; i < n; i++) { if (rendu && i === n - 1) window.__dessin(true); window.__tSim += DT; if (fn) (0, eval)(fn); S.frame(DT, f.st, Date.now(), DT * 1000, false); }
    window.__dessin(true); return { t: window.__tSim, clients: VIE.clients.map((c) => c.etat) };
  }, [n, rendu, DT, fn || null]);
  // la mise en place : quatre clients assis (tables, banquette), puis du monde au comptoir ; la vie avance (avance rapide), la file entretenue
  await pas(3, false); // (une première image : la vie calcule ses places actives ; installer en a besoin)
  await ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'banquette']) S.installer(z, 600); });
  // (la vie amène elle-même un client toutes les 1,5 à 2 s ; on n'entretient la file que si elle se vide, et sans dépasser huit clients)
  const entretenir = "if (Math.round(window.__tSim * 30) % 45 === 0 && VIE.clients.length < 6 && VIE.clients.filter((c) => c.etat === 'entre' || c.etat === 'attend').length < 2) VIE.vente(0, 10, '+10', true);";
  const avance = +val('--avance', 14);
  let e = null; for (let s = 0; s < avance; s += 2) e = await pas(60, false, entretenir);
  e = await pas(2, true); await dodo(400);
  console.log(nom, 't', e.t.toFixed(1), JSON.stringify(e.clients));
  await page.screenshot({ path: path.join(BASE, 'captures', nom + '.png') });
  const etat = await ev(() => ({ stats: window.__fournil.SCENE.stats, groupes: window.__fournil.SCENE.appelsParGroupe, c3d: typeof CLIENTS3D !== 'undefined' ? CLIENTS3D.info : null }));
  const mes = { nom, requete, t: e.t, clients: e.clients, calls: etat.stats.calls, triangles: etat.stats.triangles, groupes: etat.groupes, c3d: etat.c3d };
  if (val('--loupe')) {
    // un point « p:x,ys,z » est un point du sol du plan (px du plan), projeté par la caméra en place (la caméra basse le montre ailleurs)
    const loupes = val('--loupe').split(';').map((t) => ({ plan: t.startsWith('p:'), v: t.replace('p:', '').split(',').map(Number) }));
    for (let i = 0; i < loupes.length; i++) {
      let [px, py, z] = loupes[i].v;
      if (loupes[i].plan) [px, py] = await ev(([x, ys]) => { const S = window.__fournil.SCENE, L = VIE.LAY, p = S.trois.ecran(x, 0, (ys - L.murH) / Math.sin(52 * Math.PI / 180)); return [p.x, p.y]; }, [px, py]);
      await ev(([px, py, z]) => { const S = window.__fournil.SCENE, cam = S.trois.camera, cv = document.querySelector('#scene').getBoundingClientRect(); window.__camAvant = window.__camAvant || [cam.left, cam.right, cam.top, cam.bottom];
        const [l, r, t, b] = window.__camAvant, x = l + (px - cv.left) / cv.width * (r - l), y = t - (py - cv.top) / cv.height * (t - b), w = (r - l) / z, h = (t - b) / z;
        cam.left = x - w / 2; cam.right = x + w / 2; cam.top = y + h / 2; cam.bottom = y - h / 2; cam.updateProjectionMatrix(); for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = 'hidden'; }, [px, py, z]);
      await pas(1, true); await dodo(300);
      await page.screenshot({ path: path.join(BASE, 'captures', `${nom}-loupe${i + 1}.png`), clip: await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left, y: Math.max(0, r.top), width: r.width, height: Math.min(r.height, 700) }; }) });
    }
    await ev(() => { const cam = window.__fournil.SCENE.trois.camera, [l, r, t, b] = window.__camAvant; cam.left = l; cam.right = r; cam.top = t; cam.bottom = b; cam.updateProjectionMatrix(); for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = ''; window.__camAvant = null; });
  }
  if (val('--cote')) { // des vues de côté (contrôle de l'assise et des pieds) : la caméra regarde à l'horizontale un point du plan (x, ys en px du plan), une tranche de profondeur
    const vues = val('--cote').split(';').map((t) => t.split(','));
    for (let i = 0; i < vues.length; i++) {
      const [x, ys, larg, dirv] = vues[i];
      await ev(([x, ys, larg, dirv]) => { const S = window.__fournil.SCENE, cam = S.trois.camera, L = VIE.LAY, z = (ys - L.murH) / Math.sin(52 * Math.PI / 180);
        window.__camAv2 = { l: cam.left, r: cam.right, t: cam.top, b: cam.bottom, p: cam.position.clone(), q: cam.quaternion.clone(), n: cam.near, f: cam.far }; cam.near = 900 - 30; cam.far = 900 + 45;
        const cv = document.querySelector('#scene').getBoundingClientRect(), asp = cv.height / cv.width, w = larg;
        cam.left = -w / 2; cam.right = w / 2; cam.top = w * asp * 0.2; cam.bottom = -w * asp * 0.8; cam.updateProjectionMatrix();
        if (dirv === 'z') cam.position.set(x, 35, z + 900); else cam.position.set(x + 900, 35, z); cam.lookAt(x, 35, z); cam.updateMatrixWorld();
        for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = 'hidden'; }, [+x, +ys, +larg, dirv || 'x']);
      const nr = +val('--cote-rafale', 1), clipC = await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left, y: Math.max(0, r.top), width: r.width, height: Math.min(r.height, 300) }; });
      for (let k = 0; k < nr; k++) { await pas(nr > 1 ? 6 : 1, true); await dodo(200); await page.screenshot({ path: path.join(BASE, 'captures', `${nom}-cote${i + 1}${nr > 1 ? '-' + k : ''}.png`), clip: clipC }); }
      await ev(() => { const cam = window.__fournil.SCENE.trois.camera, a = window.__camAv2; cam.left = a.l; cam.right = a.r; cam.top = a.t; cam.bottom = a.b; cam.near = a.n; cam.far = a.f; cam.position.copy(a.p); cam.quaternion.copy(a.q); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = ''; });
    }
  }
  if (opt('--mesures')) {
    let decor = 0, acteurs = 0; for (const [k, v] of Object.entries(etat.groupes)) { if (k === 'acteurs' || k === 'chat') acteurs += v; else decor += v; } mes.decor = decor; mes.acteursMaillages = acteurs;
    const s = []; for (let k = 0; k < 6; k++) { await pas(3, true); s.push(await ev(() => [window.__fournil.SCENE.stats.calls, window.__fournil.SCENE.stats.triangles])); }
    mes.callsMax = Math.max(...s.map((x) => x[0])); mes.trisMax = Math.max(...s.map((x) => x[1]));
    const vus = new Map(); for (const d of demandes) vus.set(d.p, d.n); mes.hd = [...vus].map(([p, n]) => ({ p, n }));
    mes.octetsClients = [...vus].filter(([p]) => /\/hd\/clients-/.test(p)).reduce((a, [, n]) => a + n, 0);
    // le temps JS d'une image, processeur normal et ralenti ×4 (CDP Emulation.setCPUThrottlingRate)
    if (opt('--cpu-temps')) { // le temps PROCESSEUR du fil principal du moteur de rendu (/proc/<pid>/task/<pid>/schedstat), peu sensible à la charge :
      // un fil préempté par un autre processus ne compte pas ce temps-là ; l'attente du processeur graphique (gl.finish) non plus. Des lots de 15 images
      // (une longue tâche : gl.finish, puis SCENE.frame), avec et sans les appels de dessin ; 6 lots sans dessin, 4 avec (après un lot de
      // chauffe), tous gardés : sur une machine partagée, le temps processeur lui-même varie (caches, cœur voisin) ; la planche en prend la médiane. ×4 : 4 fois ce temps (c'est ce
      // qu'émule le ralentissement de CDP, étalonné par etalon.cjs).
      const cmd = (p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); } catch (e) { return ''; } };
      const cpuNs = (p) => { try { return +fs.readFileSync(`/proc/${p}/task/${p}/schedstat`, 'utf8').split(' ')[0]; } catch (e) { return 0; } };
      // les moteurs de rendu de CE navigateur (le domaine SystemInfo de CDP donne leurs pid) ; celui de la page est le plus occupé
      const bcdp = await browser.newBrowserCDPSession(), pinfo = await bcdp.send('SystemInfo.getProcessInfo');
      const rends = pinfo.processInfo.filter((x) => x.type === 'renderer').map((x) => x.id).filter((p) => cmd(p).includes('--type=renderer')); const rp = rends.sort((a, b) => cpuNs(b) - cpuNs(a))[0];
      const lot = async (dessin) => {
        const c0 = cpuNs(rp), w = await ev(([DT, dessin, N]) => { const f = window.__fournil, S = f.SCENE, cv = document.querySelector('canvas#scene') || document.querySelector('#scene canvas') || document.querySelector('canvas'), gl = cv.getContext('webgl2') || cv.getContext('webgl'); let t = 0; for (let i = 0; i < N; i++) { gl.finish(); window.__dessin(dessin); window.__tSim += DT; const t0 = performance.now(); S.frame(DT, f.st, Date.now(), DT * 1000, false); t += performance.now() - t0; window.__dessin(true); } return t / N; }, [DT, dessin, 15]), c1 = cpuNs(rp);
        return { cpu: (c1 - c0) / 1e6 / 15, mur: w };
      };
      const serie = async (dessin, nl) => { await lot(dessin); const v = []; for (let k = 0; k < nl; k++) v.push(await lot(dessin)); return { cpu: +Math.min(...v.map((x) => x.cpu)).toFixed(2), lots: v.map((x) => +x.cpu.toFixed(2)), mur: +Math.min(...v.map((x) => x.mur)).toFixed(2) }; };
      mes.cpuTemps = { pid: rp, renderers: rends.length, sans: await serie(false, 6), avec: await serie(true, 4) };
      console.log('cpu-temps', JSON.stringify(mes.cpuTemps));
    }
    if (!opt('--sans-cpu')) { // (la mesure du processeur, sensible à la charge de la machine : à part, machine aussi calme que possible)
    // Une image par appel (SCENE.frame : la simulation VIE, les personnages, leurs mélangeurs et IK, la scène préparée et soumise), la file du
    // processeur graphique vidée avant (gl.finish, hors chrono : SwiftShader dessine environ une image par seconde ; sans cela l'image mesurée
    // attendrait les précédentes, et ce temps-là n'est pas du JS). 5 images de chauffe, 20 mesurées : 10e centile et médiane. Avec et sans les
    // appels de dessin WebGL (neutralisés), à ×1 et à ×4. (Le ralentissement de CDP découpe le temps en tranches de quelques centaines de µs :
    // étalonné sur une boucle JS de 0,5 à 8 ms par appel, la médiane à ×4 vaut 4,2 à 4,5 fois celle à ×1 : etalon.cjs.)
    const cdp = await ctx.newCDPSession(page);
    const mesure = async (rate, dessin) => {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate }); const v = [];
      for (let i = 0; i < 25; i++) { const c = await ev(([DT, dessin]) => { const f = window.__fournil, S = f.SCENE, cv = document.querySelector('canvas#scene') || document.querySelector('#scene canvas') || document.querySelector('canvas'), gl = cv.getContext('webgl2') || cv.getContext('webgl'); gl.finish(); window.__dessin(dessin); window.__tSim += DT; const t0 = performance.now(); S.frame(DT, f.st, Date.now(), DT * 1000, false); const t = performance.now() - t0; window.__dessin(true); return t; }, [DT, dessin]); if (i >= 5) v.push(c); }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      v.sort((a, b) => a - b); const q = (x) => +v[Math.min(v.length - 1, Math.floor(x * v.length))].toFixed(2); return { min: q(0), p10: q(0.1), med: q(0.5), p90: q(0.9), n: v.length };
    };
    mes.charge = require('fs').readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
    mes.sansDessin1 = await mesure(1, false); mes.avecDessin1 = await mesure(1, true); mes.sansDessin4 = await mesure(4, false); mes.avecDessin4 = await mesure(4, true);
    mes.charge += ' → ' + require('fs').readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
    }
    console.log('mesures', JSON.stringify({ calls: mes.callsMax, tris: mes.trisMax, decor, octets: mes.octetsClients, sansDessin1: mes.sansDessin1, avecDessin1: mes.avecDessin1, sansDessin4: mes.sansDessin4, avecDessin4: mes.avecDessin4, charge: mes.charge }));
  }
  if (val('--video')) { // la rafale : FPS images par seconde de temps simulé, chacune rendue puis photographiée ; ffmpeg en fait une vidéo
    const n = Math.round(+val('--video') * FPS), dir = path.join(BASE, 'tmp', nom + '-images'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    for (let k = 0; k < n; k++) {
      await ev(([dt, entretenir]) => { const f = window.__fournil, S = f.SCENE; window.__tSim += dt; (0, eval)(entretenir); S.frame(dt, f.st, Date.now(), dt * 1000, false); }, [1 / FPS, entretenir]);
      await page.screenshot({ path: path.join(dir, `i${String(k).padStart(4, '0')}.png`) });
      if (k % 25 === 0) process.stdout.write(`${k}/${n} `);
    }
    const out = path.join(BASE, 'videos', nom + '.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'i%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium', '-movflags', '+faststart', out]);
    console.log('\nvidéo', out, fs.statSync(out).size, 'o');
  }
  fs.writeFileSync(path.join(BASE, 'tmp', nom + '-mesures.json'), JSON.stringify(mes, null, 1));
  console.log('erreurs', JSON.stringify(errs.slice(0, 8)));
  await browser.close(); server.close();
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });
