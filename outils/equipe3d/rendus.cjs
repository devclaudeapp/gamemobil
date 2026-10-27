// La maquette du boulanger et des apprentis en 3D (src/equipe3d.js, ?boulanger3d=1) sur la vraie page, téléphone en portrait (390 × 844) :
// la boutique au complet (quatre recettes, quatre apprentis, tout le mobilier), le temps piloté image par image (comme outils/clients3d/boutique.cjs :
// la boucle du jeu gelée, Math.random graine-fixé, l'avance rapide sans dessin). Les scénarios :
//   boutique  : la boutique en haute, les apprentis au travail (capture, gros plans de l'équipe, mesures) ; --video s : une vidéo
//   vue       : la vue « Mon boulanger », une tenue par capture (--tenues "base;or;quartier;hantee") ; --tourne : quatre angles
//   eco       : la boutique en qualité éco (les chibis)
// usage : node rendus.cjs <scénario> <nom> [--requete "qualite=haute"] [--port 9902] [--video 9] [--tenues …] [--tourne] [--sortie dossier] [--sans3d]
// Sorties dans --sortie (par défaut $EQUIPE3D_TRAVAIL ou <tmp>/equipe3d) : <nom>.png, <nom>-loupeN.png, <nom>-<tenue>.png, <nom>.mp4, <nom>-mesures.json.
// Le jeu servi : ce dépôt (node build.js d'abord). Playwright et son Chromium (NODE_PATH), ffmpeg pour la vidéo.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const args = process.argv.slice(2), scenario = args[0], nom = args[1] || scenario, opt = (k) => args.includes(k), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(val('--sortie', process.env.EQUIPE3D_TRAVAIL || path.join(os.tmpdir(), 'equipe3d'))); fs.mkdirSync(path.join(OUT, 'tmp'), { recursive: true });
const ROOT = path.resolve(__dirname, '../..'), PORT = +val('--port', 9902), DT = 1 / 30, FPS = +val('--fps', 25);
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
    let s = 20261027, s2 = 7; const r1 = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }, r2 = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
    Math.random = function () { const l = (new Error().stack || '').split('\n')[2] || ''; return /three\.min\.js|fournil-hd\.min\.js/.test(l) ? r2() : r1(); };
    const si = window.setInterval, st = window.setTimeout; let gel = false;
    window.setInterval = function (fn, ms, ...r) { if (fn && fn.name === 'verifierReveil') return 0; return si.call(window, typeof fn === 'function' ? function () { if (!gel) return fn.apply(this, arguments); } : fn, ms, ...r); };
    window.setTimeout = function (fn, ms, ...r) { return st.call(window, typeof fn === 'function' ? function () { if (!gel) return fn.apply(this, arguments); } : fn, ms, ...r); };
    window.__depart = () => { s = 20261027; gel = true; };
    const raf = window.requestAnimationFrame.bind(window); let manuel = true; const file = [];
    window.__rafManuel = (on) => { manuel = on; if (!on) for (const cb of file.splice(0)) raf(cb); };
    window.requestAnimationFrame = (cb) => { if (!manuel) return raf(cb); file.push(cb); return file.length; };
    window.__dessin = (on) => {
      if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
      for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {};
    };
  });
  const H = val('--horloge', '2026-10-27T12:00:00Z'); await ctx.addInitScript((base) => { const p0 = performance.now(); Date.now = () => base + (performance.now() - p0); }, Date.parse(H));
  await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
  const page = await ctx.newPage(); const errs = []; page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || /Équipe 3D|HD :|THREE\./.test(m.text())) errs.push(m.type() + ' ' + m.text()); });
  const requete = val('--requete', scenario === 'eco' ? 'qualite=eco' : 'qualite=haute');
  await page.goto(`http://localhost:${PORT}/fournil/?${opt('--sans3d') ? '' : 'boulanger3d=1&'}${requete}`); // (--sans3d : le jeu tel qu'il est, ses chibis, pour la planche côte à côte)
  await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 90000, polling: 200 }); await dodo(800);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; st.mystereTimer = 1e9; st.evTimer = 1e9; for (let k = 0; k < 6; k++) if (st.stations[k]) st.stations[k].niv = Math.max(st.stations[k].niv, 25); st.images = 'max'; f.scene({ heure: 13, saison: [], assis: true }); });
  // les grades des apprentis (le premier au grade 1, puis 3, 4, 5 : la toque grandit, l'étoile, le liseré doré) ; le titre du boulanger
  await ev(() => { const f = window.__fournil, G = f.G, st = f.st; st.apprentis = st.apprentis || {}; [1, 3, 4, 5].forEach((g, i) => { const id = G.PRODUITS[i].id; st.apprentis[id] = { xp: [0, 129600, 518400, 1555200, 4860000][g - 1] + 10 }; }); f.xp(4e5); });
  const fermer = () => ev(() => { const f = document.querySelector('#feuille'); if (f && !f.hidden) { const b = f.querySelector('[data-a="close"], [data-a$="tard"], [data-a="non"], [data-a="ok"], [data-a="pq-ok"]'); if (b) b.click(); } });
  for (let k = 0; k < 8; k++) { await dodo(300); await fermer(); }
  await ev(() => window.__fournil.tiroir('ferme'));
  // les lots HD : la boutique, les clients, l'équipe ; cuits à la main (la boucle est gelée)
  const hd = await ev(() => typeof HDM !== 'undefined' && HDM.actif && !HDM.coupe() && SCENE.stats.qualite !== 'eco');
  if (hd) {
    await ev(() => { HDM.charger('boutique'); if (typeof CLIENTS3D !== 'undefined' && CLIENTS3D.actif) CLIENTS3D.demander(); EQUIPE3D.demander(); });
    for (let t = 0; t < 160; t++) { const ok = await ev(() => HDM.pret('boutique') && (typeof KENNEY === 'undefined' || !KENNEY || KENNEY.pret || KENNEY.erreur) && (!CLIENTS3D.actif || (HDM.pret('clients') && (() => { for (let k = 0; k < 400 && !CLIENTS3D.preparer() && !CLIENTS3D.erreur; k++); return CLIENTS3D.pret; })())) && (!EQUIPE3D.actif || (HDM.pret('equipe') && (() => { for (let k = 0; k < 400 && !EQUIPE3D.preparer() && !EQUIPE3D.erreur; k++); return EQUIPE3D.pret || !!EQUIPE3D.erreur; })()))); if (ok) break; await dodo(500); }
    await ev(() => { const F = window.__fournil; F.SCENE.frame(1 / 30, F.st, Date.now(), 33, false); });
    for (let t = 0; t < 120; t++) { if (await ev(() => { const e = window.__fournil.SCENE.equipe3d, c = window.__fournil.SCENE.clients3d; return (!c || !c.pret || c.compile === 2) && (!e || !e.pret || e.compile === 2); })) break; await dodo(250); }
  }
  await dodo(1200); await fermer();
  await ev(() => { const s = document.createElement('style'); s.textContent = '.toast { visibility: hidden !important; }'; document.head.appendChild(s); });
  await ev(() => { window.__rafManuel(true); window.__tSim = 0; window.__depart(); });
  await dodo(300);
  const pas = (n, rendu, fn) => ev(([n, rendu, DT, fn]) => {
    const f = window.__fournil, S = f.SCENE; window.__dessin(false);
    for (let i = 0; i < n; i++) { const vue = rendu && i === n - 1; if (vue) window.__dessin(true); window.__tSim += DT; if (fn) (0, eval)(fn); S.frame(DT, f.st, Date.now(), DT * 1000, vue); }
    window.__dessin(true); return { t: window.__tSim, apprentis: VIE.apprentis.map((a) => a.etat) };
  }, [n, rendu, DT, fn || null]);
  const entretenir = "if (Math.round(window.__tSim * 30) % 45 === 0 && VIE.clients.length < 6 && VIE.clients.filter((c) => c.etat === 'entre' || c.etat === 'attend').length < 2) VIE.vente(0, 10, '+10', true);";
  const mes = { scenario, nom, requete };
  const etat3d = () => ev(() => ({ e3: window.__fournil.SCENE.equipe3d, stats: window.__fournil.SCENE.stats, groupes: window.__fournil.SCENE.appelsParGroupe }));
  if (scenario === 'boutique' || scenario === 'eco') {
    await pas(3, false);
    await ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'banquette']) S.installer(z, 600); });
    const avance = +val('--avance', 12); let e = null; for (let s = 0; s < avance; s += 2) e = await pas(60, false, entretenir);
    e = await pas(2, true); await dodo(400);
    await page.screenshot({ path: path.join(OUT, nom + '.png') });
    const x = await etat3d(); Object.assign(mes, { t: e.t, apprentis: e.apprentis, calls: x.stats.calls, triangles: x.stats.triangles, groupes: x.groupes, e3: x.e3 });
    let decor = 0, acteurs = 0; for (const [k, v] of Object.entries(x.groupes)) { if (k === 'acteurs' || k === 'chat') acteurs += v; else decor += v; } mes.decor = decor; mes.acteursMaillages = acteurs;
    console.log('mesures', JSON.stringify({ calls: x.stats.calls, tris: x.stats.triangles, decor, acteurs, boulanger: x.groupes.boulanger }));
    console.log('equipe3d', JSON.stringify(x.e3 && { pret: x.e3.pret, compile: x.e3.compile, erreur: x.e3.erreur, boulanger: x.e3.boulanger, apprentis: x.e3.apprentis }));
    // les gros plans : la caméra du jeu resserrée sur un point du plan (px CSS), l'équipe au four et le boulanger derrière le comptoir
    // (un gros plan : « four:z », « boulanger:z », ou un point du plan « p:x,ys,z » en px)
    const loupes = (val('--loupe', 'four:2.8;boulanger:3')).split(';').filter(Boolean);
    for (let i = 0; i < loupes.length; i++) {
      const [x0, y0, z] = await ev((t) => { const L = VIE.LAY, [nomL, zz] = t.split(':'); if (nomL === 'four') return [(L.fourSlots[0] + L.comptoirSlots[2]) / 2, L.lanes[1] - 14 * VIE.K, +zz]; if (nomL === 'boulanger') return [L.boulanger.x, L.boulanger.y - 20 * VIE.K, +zz]; const v = t.replace('p:', '').split(',').map(Number); return v; }, loupes[i]);
      const [px, py] = await ev(([x, ys]) => { const S = window.__fournil.SCENE, L = VIE.LAY, cam = S.trois.camera; if (window.__camAvant) { const [l, r, t, b] = window.__camAvant; cam.left = l; cam.right = r; cam.top = t; cam.bottom = b; cam.updateProjectionMatrix(); } const p = S.trois.ecran(x, 0, (ys - L.murH) / Math.sin(52 * Math.PI / 180)); return [p.x, p.y]; }, [x0, y0]); // (la caméra du jeu, remise avant chaque point)
      await ev(([px, py, z]) => { const S = window.__fournil.SCENE, cam = S.trois.camera, cv = document.querySelector('#scene').getBoundingClientRect(); window.__camAvant = window.__camAvant || [cam.left, cam.right, cam.top, cam.bottom];
        const [l, r, t, b] = window.__camAvant, x = l + (px - cv.left) / cv.width * (r - l), y = t - (py - cv.top) / cv.height * (t - b), w = (r - l) / z, h = (t - b) / z;
        cam.left = x - w / 2; cam.right = x + w / 2; cam.top = y + h / 2; cam.bottom = y - h / 2; cam.updateProjectionMatrix(); for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = 'hidden'; }, [px, py, z]);
      await pas(1, true); await dodo(300);
      await page.screenshot({ path: path.join(OUT, `${nom}-loupe${i + 1}.png`), clip: await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left, y: Math.max(0, r.top), width: r.width, height: Math.min(r.height, 700) }; }) });
    }
    if (loupes.length) await ev(() => { const cam = window.__fournil.SCENE.trois.camera, [l, r, t, b] = window.__camAvant; cam.left = l; cam.right = r; cam.top = t; cam.bottom = b; cam.updateProjectionMatrix(); for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = ''; window.__camAvant = null; });
    if (val('--video')) {
      const n = Math.round(+val('--video') * FPS), dir = path.join(OUT, 'tmp', nom + '-images'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      for (let k = 0; k < n; k++) {
        await ev(([dt, entretenir]) => { const f = window.__fournil, S = f.SCENE; window.__tSim += dt; (0, eval)(entretenir); S.frame(dt, f.st, Date.now(), dt * 1000, false); }, [1 / FPS, entretenir]);
        await page.screenshot({ path: path.join(dir, `i${String(k).padStart(4, '0')}.png`) });
        if (k % 25 === 0) process.stdout.write(`${k}/${n} `);
      }
      const out = path.join(OUT, nom + '.mp4');
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'i%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium', '-movflags', '+faststart', out]);
      console.log('\nvidéo', out, fs.statSync(out).size, 'o');
    }
  }
  if (scenario === 'vue') { // la vue « Mon boulanger » : ouverte depuis la carte de la garde-robe (onglet Boulanger), une tenue par capture
    const TENUES = { base: ['toque-blanche', 'tablier-blanc', 'sabots', 'lunettes-rondes'], or: ['or-toque', 'or-tablier', 'or-chaussures', 'or-foulard'], argent: ['argent-toque', 'argent-tablier', 'argent-chaussures', 'argent-foulard'], bronze: ['bronze-toque', 'bronze-tablier', 'bronze-chaussures', 'bronze-foulard'],
      quartier: ['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'quartier-chaine'], 'quartier-or': ['quartier-or-casquette', 'quartier-or-sweat', 'quartier-or-baskets', 'quartier-or-chaine'], neon: ['quartier-neon-casquette', 'quartier-sweat', 'quartier-baskets', null],
      hantee: ['hantee-chapeau', 'hantee-cape', 'hantee-bottes', 'hantee-lanterne'], 'hantee-or': ['hantee-or-chapeau', 'hantee-or-cape', 'hantee-or-bottes', 'hantee-or-lanterne'], lueur: ['hantee-lueur-chapeau', 'hantee-cape', 'hantee-bottes', null],
      parcours: ['parcours-toque', 'parcours-tablier', 'parcours-chaussures', 'parcours-foulard'], melange: ['parcours-toque', 'quartier-or-sweat', 'hantee-bottes', 'lunettes-rondes'] };
    await ev(() => { const f = window.__fournil, G = f.G, st = f.st; for (const c of ['or', 'argent', 'bronze', 'quartier', 'quartier-or', 'quartier-neon', 'hantee', 'hantee-or', 'hantee-lueur', 'parcours']) G.donnerCollection(st, c); G.donnerAura(st, 'lueur'); G.porterAura(st, null); f.rafraichir(); });
    const liste = val('--tenues', 'base;or;quartier;hantee').split(';'), rangs = val('--rangs', '').split(';').filter(Boolean).map(Number);
    await ev(() => { window.__fournil.page('boulanger'); }); await dodo(500);
    for (const [k, nomT] of liste.entries()) {
      const aura = /\+aura$/.test(nomT), cle = nomT.replace(/\+aura$/, ''), ids = TENUES[cle] || cle.split(','), rang = rangs[k];
      await ev(([ids, aura, rang]) => { const f = window.__fournil, G = f.G, st = f.st; ['tete', 'haut', 'pieds', 'accessoire'].forEach((p, i) => G.equiper(st, p, ids[i])); G.porterAura(st, aura ? 'lueur' : null); if (rang != null) { st.xp = [0, 300, 2000, 9000, 40000, 400000][rang] || st.xp; } f.rafraichir(); }, [ids, aura, rang == null ? null : rang]);
      await dodo(300);
      const ok = await ev(() => { const b = document.querySelector('[data-gr-3d]'); if (!b) return false; b.scrollIntoView(); b.click(); return true; });
      if (!ok) { console.log('pas de bouton « Voir mon boulanger en 3D »'); break; }
      await dodo(400);
      if (opt('--liaison')) await ev(() => { EQUIPE3D.vue.liaison = true; });
      for (let i = 0; i < 90; i++) await ev(() => EQUIPE3D.vue.image(1 / 30)); // 3 s : l'acteur prêt, la joie passée, il revient face à soi
      if (opt('--tourne')) for (const y of [0, 1.57, 3.14, -1.57, 0.6]) { await ev((y) => { EQUIPE3D.vue.tourner(y); EQUIPE3D.vue.image(1 / 30); }, y); await dodo(150); await page.screenshot({ path: path.join(OUT, `${nom}-${nomT}-${Math.round(y * 100)}.png`), clip: { x: 0, y: 80, width: 390, height: 560 } }); }
      await dodo(200);
      await page.screenshot({ path: path.join(OUT, `${nom}-${nomT}.png`) });
      const e = await ev(() => EQUIPE3D.vue.etat); console.log('vue', nomT, JSON.stringify(e)); mes['vue-' + nomT] = e;
      await ev(() => EQUIPE3D.vue.fermer()); await dodo(300);
    }
  }
  if (scenario === 'gestes') { // des planches d'images, la caméra resserrée : le cycle des apprentis, la panne, la joie du boulanger
    await pas(3, false); const avance = +val('--avance', 6); for (let s = 0; s < avance; s += 2) await pas(60, false, entretenir);
    const zoom = async (cible, z) => { const [x0, y0] = await ev((t) => { const L = VIE.LAY; if (t === 'four') return [(L.plan.x + L.comptoirSlots[2]) / 2, L.lanes[1] - 6 * VIE.K]; if (t === 'boulanger') return [L.boulanger.x, L.boulanger.y - 20 * VIE.K]; return [0, 0]; }, cible);
      await ev(([x, ys, z]) => { const S = window.__fournil.SCENE, L = VIE.LAY, cam = S.trois.camera; window.__camAvant = window.__camAvant || [cam.left, cam.right, cam.top, cam.bottom]; const [l, r, t, b] = window.__camAvant; cam.left = l; cam.right = r; cam.top = t; cam.bottom = b; cam.updateProjectionMatrix();
        const p = S.trois.ecran(x, 0, (ys - L.murH) / Math.sin(52 * Math.PI / 180)), cv = document.querySelector('#scene').getBoundingClientRect(), xx = l + (p.x - cv.left) / cv.width * (r - l), yy = t - (p.y - cv.top) / cv.height * (t - b), w = (r - l) / z, h = (t - b) / z;
        cam.left = xx - w / 2; cam.right = xx + w / 2; cam.top = yy + h / 2; cam.bottom = yy - h / 2; cam.updateProjectionMatrix(); for (const el of document.querySelectorAll('#scene-ui')) el.style.visibility = 'hidden'; }, [x0, y0, z]); };
    const planche = async (nomP, n, dtImages, avant, clip) => { const dir = path.join(OUT, 'tmp', `${nom}-${nomP}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); const etats = [];
      for (let k = 0; k < n; k++) { if (avant && k === 0) await ev((f) => (0, eval)(f), avant); await pas(Math.max(1, Math.round(dtImages * 30)), true); await dodo(120); await page.screenshot({ path: path.join(dir, `i${String(k).padStart(3, '0')}.png`), clip }); etats.push(await ev(() => (window.__fournil.SCENE.equipe3d.apprentis || []).map((a) => `${a.i}:${a.etat}/${a.clip}${a.plateau ? '+p' : ''}${a.cle ? '+c' : ''}${a.repare ? '+r' : ''}`).join(' ') + ' | B:' + (window.__fournil.SCENE.equipe3d.boulanger ? window.__fournil.SCENE.equipe3d.boulanger.clip + (window.__fournil.SCENE.equipe3d.boulanger.joie ? '+joie' : '') : '-'))); }
      execFileSync('montage', [...fs.readdirSync(dir).sort().map((f) => path.join(dir, f)), '-tile', `${Math.min(6, n)}x`, '-geometry', '+2+2', '-resize', '50%', path.join(OUT, `${nom}-${nomP}.png`)]); console.log(nomP, JSON.stringify(etats)); };
    const clipF = await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top) + 60, width: 390, height: 420 }; });
    await zoom('four', 2.4); await planche('cycle', 18, 0.33, null, clipF);
    await planche('panne', 12, 0.4, "window.__fournil.ev('panne'); const e = window.__fournil.st.ev; if (e) { for (const a of VIE.apprentis) if (a.i === e.i && a.etat !== 'four') { a.etat = 'four'; a.t = 0.01; } }", clipF);
    await ev(() => { window.__fournil.st.ev = null; });
    await zoom('boulanger', 3); await planche('joie', 12, 0.12, "VIE.tap();", clipF);
    await planche('front', 10, 0.25, "window.__tSim = 0;", clipF);
  }
  const vus = new Map(); for (const d of demandes) vus.set(d.p, d.n); mes.hd = [...vus].map(([p, n]) => ({ p, n })); mes.octetsEquipe = [...vus].filter(([p]) => /\/hd\/equipe\//.test(p)).reduce((a, [, n]) => a + n, 0);
  fs.writeFileSync(path.join(OUT, nom + '-mesures.json'), JSON.stringify(mes, null, 1));
  console.log('octets équipe', mes.octetsEquipe, '· erreurs', JSON.stringify(errs.slice(0, 8)));
  await browser.close(); server.close();
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });
