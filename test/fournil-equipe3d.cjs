// La maquette du boulanger et des apprentis en personnages 3D (src/equipe3d.js, seulement avec ?boulanger3d=1 dans l'adresse) sur la vraie
// page, téléphone en portrait (390 × 844), le mardi 27 octobre 2026. On vérifie :
// · sans le paramètre, rien ne change : le module inactif, aucun fichier de l'équipe demandé, le boulanger et les apprentis en chibis ;
// · avec, en qualité haute : le lot « equipe » demandé après celui des clients, chaque fichier une fois, 600 Ko au plus ; le boulanger et les
//   apprentis en personnages 3D (un maillage chacun, plus le plateau de celui qui porte ; à la taille des clients : 62 × K à 5 % près, le
//   boulanger ×1,1) ; le boulanger porte la tenue de la garde-robe (sa clé, GAME.tenueBoulanger), une pièce changée se voit à l'image suivante
//   (la forme de chaque pièce), la mémoire ne monte pas ; les grades des apprentis (l'étoile dès le grade 3) ; le cycle des apprentis (pétrir au
//   four, le pâton entre les mains ; porter le plateau, le poser, revenir), la panne (Defeat, puis la clé à la main et Hammering), la joie du
//   boulanger (un toucher : VIE.tap) ; le décor ≤ 80 appels de dessin, le boulanger et les apprentis comptés ; le temps processeur d'une image
//   (×4, face aux mêmes en chibis) ; les revenus des fournées inchangés (GAME.revenuFournee de la page, avec et sans le paramètre : les mêmes
//   que src/game.js seul, dans Node, sur le même état) ;
// · les tenues : chacune des 42 pièces a son kit, de sa forme, et change le maillage (sa géométrie ou ses couleurs) ; la tenue de la chaîne (la
//   palette TENUES.chaine, la veste de patron, le trousseau) ; aucune traversée entre deux pièces, ni des mains dans une pièce (toutes les
//   pièces seules, les ensembles, 30 mélanges tirés au sort et 10 qui se frôlent, à cinq poses : le repos, plus tard, la main au front et les
//   mains frottées de la boutique, la joie) ; un maillage par tenue et ≤ 10 500 triangles ; le cache (20 changements sans rien cuire, ≤ 25 ms
//   chacun) ; la mémoire (géométries et tas JS) stable sur 20 changements de plus ; l'aura dans la boutique (rendue avec et sans elle au même
//   instant : elle ne teint pas le boulanger, son halo se voit autour) ; une collection gagnée en jouant, cuite d'avance à petits pas (la
//   porter, ou passer au titre suivant, ne cuit rien sur place) ;
// · la vue « Mon boulanger » : ouverte depuis la garde-robe (onglet Boulanger), tournée au doigt, une pièce mise depuis la vue (portée
//   aussitôt, sa joie), fermée (la boutique reprend) ; trois fois : la mémoire de la boutique ne monte pas ;
// · la HD coupée dans les Réglages : les chibis à l'image suivante, la mémoire rendue après 10 s, le retour des personnages 3D ;
// · la Maison hantée : son équipe (les monstres HD ou les chibis déguisés), aucun personnage 3D de l'équipe ;
// · la qualité éco : les chibis, aucun fichier de l'équipe demandé ; un fichier de l'équipe manquant : le lot échoue, les chibis restent.
// Aucune erreur dans la page, aucun avertissement de l'équipe 3D, de la HD ni de three.js.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-equipe3d.cjs   (port : PORT_EQUIPE3D)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_EQUIPE3D || 9910;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-27T13:00:00+01:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = []; let bloques = []; // les fichiers hd/ demandés, dans l'ordre ; ceux qu'on refuse (404), pour le repli
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  if (bloques.some((b) => b.test(p))) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
const FICHIERS = ['Chef_Male', 'Chef_Female', 'anims-equipe', 'p-lanterne'];
const G0 = require('../src/game.js'); // les règles seules (sans page) : les revenus des fournées, sur le même état
// (évaluée dans la page) les traversées entre les pièces d'un acteur, à sa pose : pour chaque paire de kits (les pièces et les marques du titre),
// les triangles de l'un dont un côté perce un triangle de l'autre (Möller–Trumbore, strictement dans le segment) ; une grille des boîtes pour
// aller vite ; les triangles nuls (les pièces rangées à l'échelle nulle) ignorés. o.mains : les mains aussi (les triangles du corps dont les
// trois sommets suivent surtout un os du poing, Fist) contre chaque kit, la lanterne exceptée (elle est tenue) ; la paire { a: 'mains', b: kit }.
// Rend { paires: [{ a, b, n, ou }], tris, ms }
function traversees(a, o) {
  const t0 = performance.now(), S = a.S, g = S.geometry, idx = g.index.array, n = g.attributes.position.count, P = new Float32Array(n * 3);
  a.g.updateMatrixWorld(true); EQUIPE3D.sommetsMonde(S, n, (i, x, y, z) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; });
  const kits = a.habit.kits, H = a.pr.hauteur * a.g.scale.x, eps = 1e-9, minA = H * H * 1e-9, c = H * 0.02, grilles = new Map(), A9 = new Float32Array(9), B9 = new Float32Array(9);
  const tri = (t, out) => { for (let j = 0; j < 3; j++) { const v = idx[t * 3 + j]; out[j * 3] = P[v * 3]; out[j * 3 + 1] = P[v * 3 + 1]; out[j * 3 + 2] = P[v * 3 + 2]; } return out; };
  const aire = (T) => { const ux = T[3] - T[0], uy = T[4] - T[1], uz = T[5] - T[2], vx = T[6] - T[0], vy = T[7] - T[1], vz = T[8] - T[2], cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2; };
  const segTri = (px, py, pz, qx, qy, qz, T) => {
    const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2], e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2], dx = qx - px, dy = qy - py, dz = qz - pz;
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz; if (Math.abs(det) < eps) return false;
    const f = 1 / det, sx = px - T[0], sy = py - T[1], sz = pz - T[2], uu = f * (sx * hx + sy * hy + sz * hz); if (uu < 0 || uu > 1) return false;
    const qx2 = sy * e1z - sz * e1y, qy2 = sz * e1x - sx * e1z, qz2 = sx * e1y - sy * e1x, vv = f * (dx * qx2 + dy * qy2 + dz * qz2); if (vv < 0 || uu + vv > 1) return false;
    const tt = f * (e2x * qx2 + e2y * qy2 + e2z * qz2); return tt > 1e-6 && tt < 1 - 1e-6;
  };
  const coupe = (A, B) => { for (const [X, Y] of [[A, B], [B, A]]) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) if (segTri(X[i * 3], X[i * 3 + 1], X[i * 3 + 2], X[j * 3], X[j * 3 + 1], X[j * 3 + 2], Y)) return true; return false; };
  const boite = (T) => [Math.min(T[0], T[3], T[6]), Math.min(T[1], T[4], T[7]), Math.min(T[2], T[5], T[8]), Math.max(T[0], T[3], T[6]), Math.max(T[1], T[4], T[7]), Math.max(T[2], T[5], T[8])];
  const cases = (b, f) => { for (let i = Math.floor(b[0] / c); i <= Math.floor(b[3] / c); i++) for (let j = Math.floor(b[1] / c); j <= Math.floor(b[4] / c); j++) for (let l = Math.floor(b[2] / c); l <= Math.floor(b[5] / c); l++) f(i + ',' + j + ',' + l); };
  const grille = (k) => { let G = grilles.get(k.cle); if (G) return G; G = new Map(); for (let t = k.t0; t < k.t1; t++) { tri(t, A9); if (aire(A9) < minA) continue; cases(boite(A9), (q) => { let L = G.get(q); if (!L) G.set(q, (L = [])); L.push(t); }); } grilles.set(k.cle, G); return G; };
  const paires = [];
  for (let x = 0; x < kits.length; x++) for (let y = x + 1; y < kits.length; y++) {
    const ka = kits[x], kb = kits[y], Gb = grille(kb), ou = []; let nb = 0;
    for (let t = ka.t0; t < ka.t1; t++) {
      tri(t, A9); if (aire(A9) < minA) continue; const b = boite(A9), cand = new Set(); cases(b, (q) => { const L = Gb.get(q); if (L) for (const u of L) cand.add(u); });
      for (const u of cand) { tri(u, B9); const bb = boite(B9); if (bb[0] > b[3] || bb[3] < b[0] || bb[1] > b[4] || bb[4] < b[1] || bb[2] > b[5] || bb[5] < b[2]) continue; if (coupe(A9, B9)) { nb++; if (ou.length < 2) ou.push([(A9[0] + A9[3] + A9[6]) / 3 / H, (A9[1] + A9[4] + A9[7]) / 3 / H, (A9[2] + A9[5] + A9[8]) / 3 / H].map((v) => v.toFixed(3)).join(',')); break; } }
    }
    if (nb) paires.push({ a: ka.cle, b: kb.cle, n: nb, ou });
  }
  if (o && o.mains) {
    const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, bones = S.skeleton.bones;
    const poing = (v) => { let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw[v * 4 + j] > w) { w = sw[v * 4 + j]; b = si[v * 4 + j]; } return /^Fist/.test(bones[b].name); };
    const Gm = new Map(); let nm = 0;
    for (let t = 0; t < a.habit.trisCorps; t++) { if (!poing(idx[t * 3]) || !poing(idx[t * 3 + 1]) || !poing(idx[t * 3 + 2])) continue; tri(t, A9); if (aire(A9) < minA) continue; nm++; cases(boite(A9), (q) => { let L = Gm.get(q); if (!L) Gm.set(q, (L = [])); L.push(t); }); }
    for (const k of kits) {
      if (/lanterne/.test(k.cle)) continue; const ou = []; let nb = 0;
      for (let t = k.t0; t < k.t1; t++) {
        tri(t, A9); if (aire(A9) < minA) continue; const b = boite(A9), cand = new Set(); cases(b, (q) => { const L = Gm.get(q); if (L) for (const u of L) cand.add(u); });
        for (const u of cand) { tri(u, B9); const bb = boite(B9); if (bb[0] > b[3] || bb[3] < b[0] || bb[1] > b[4] || bb[4] < b[1] || bb[2] > b[5] || bb[5] < b[2]) continue; if (coupe(A9, B9)) { nb++; if (ou.length < 2) ou.push([(A9[0] + A9[3] + A9[6]) / 3 / H, (A9[1] + A9[4] + A9[7]) / 3 / H, (A9[2] + A9[5] + A9[8]) / 3 / H].map((v) => v.toFixed(3)).join(',')); break; } }
      }
      if (nb) paires.push({ a: 'mains', b: k.cle, n: nb, ou });
    }
    if (!nm) paires.push({ a: 'mains', b: '(aucun triangle de main trouvé)', n: 1, ou: [] });
  }
  return { paires, tris: a.habit.tris, ms: Math.round(performance.now() - t0) };
}

// (évaluée dans la page) l'aura du boulanger dans la boutique : quatre rendus au même instant (dt = 0) : avec l'aura (A), sans (B), lui seul
// d'une couleur plate (C : sa silhouette, son ombre inchangée), de nouveau avec l'aura (A2 : le bruit). Dans sa silhouette (moins deux pixels de
// bord) : l'écart entre A et B (moyenne, 98e centile, maximum) ; le pantalon (le haut des cuisses, au quart de la hanche au genou, projeté à
// l'écran) : sa couleur dans A et dans B ; autour de lui (la boîte de sa silhouette agrandie de 15 % de sa hauteur, hors d'elle) : l'écart
// moyen entre A et B (le halo) ; dans cette boîte, l'écart entre A et A2 (le bruit). Rend null sans boulanger 3D ni aura
function mesurerAura() {
  const F = window.__fournil, S = F.SCENE, st = F.st, gl = document.querySelector('#scene').getContext('webgl2'), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, cam = S.trois.camera;
  let g = null; S.trois.scene.traverse((o) => { if (o.userData && o.userData.e3d && o.userData.e3d.boul && o.visible && o.parent) g = o; }); const a = g && g.userData.e3d; if (!a || !a.aura) return null;
  const rendu = () => { S.frame(0, st, Date.now(), 33, false); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  const A = rendu(); a.aura.visible = false; const B = rendu();
  const m0 = a.S.material, plat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); a.S.material = plat; const C = rendu(); a.S.material = m0; plat.dispose();
  a.aura.visible = true; const A2 = rendu();
  const ec = (X, Y, i) => Math.max(Math.abs(X[i] - Y[i]), Math.abs(X[i + 1] - Y[i + 1]), Math.abs(X[i + 2] - Y[i + 2]));
  const sil = new Uint8Array(W * H); let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let p = 0; p < W * H; p++) if (ec(B, C, p * 4) > 24) { sil[p] = 1; const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { sil: 0 };
  const dedans = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !sil[yy * W + xx]) return false; } return true; };
  const e = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (sil[y * W + x] && dedans(x, y)) e.push(ec(A, B, (y * W + x) * 4));
  e.sort((u, v) => u - v); const moy = e.reduce((s, x) => s + x, 0) / Math.max(1, e.length);
  const R = Math.round((y1 - y0) * 0.15); let nh = 0, sh = 0, bruit = 0;
  for (let y = Math.max(0, y0 - R); y <= Math.min(H - 1, y1 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(W - 1, x1 + R); x++) { const p = y * W + x; bruit = Math.max(bruit, ec(A, A2, p * 4)); if (sil[p]) continue; nh++; sh += ec(A, B, p * 4); }
  const os = (n) => a.S.skeleton.bones.find((b) => b.name === n), v = new THREE.Vector3(), w = new THREE.Vector3(), cuisses = [];
  for (const c of ['L', 'R']) {
    const h = os('UpperLeg' + c), k = os('LowerLeg' + c); if (!h || !k) continue; h.getWorldPosition(v); k.getWorldPosition(w); v.lerp(w, 0.25).project(cam);
    const px = Math.round((v.x + 1) / 2 * W), py = Math.round((v.y + 1) / 2 * H), s0 = [0, 0, 0], s1 = [0, 0, 0]; let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H || !sil[y * W + x] || !dedans(x, y)) continue; const i = (y * W + x) * 4; for (let j = 0; j < 3; j++) { s0[j] += A[i + j]; s1[j] += B[i + j]; } n++; }
    if (n) cuisses.push({ n, avec: s0.map((x) => Math.round(x / n)), sans: s1.map((x) => Math.round(x / n)) });
  }
  return { sil: e.length, moy: +moy.toFixed(2), p98: e[Math.floor(e.length * 0.98)], max: e[e.length - 1], halo: +(sh / Math.max(1, nh)).toFixed(2), bruit, cuisses, W, H };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] }); // WebGL2 : la HD en haute ; gc() : la mesure du tas JS
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => {
      const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F;
      // le détecteur de gel du jeu (ui.js, verifierReveil) : le temps piloté suspend la boucle, il croirait à un retour d'absence
      const si = window.setInterval; window.setInterval = function (fn, ms, ...r) { if (fn && fn.name === 'verifierReveil') return 0; return si.call(window, fn, ms, ...r); };
      // le temps piloté (comme test/fournil-clients3d.cjs) : la boucle du jeu suspendue, le test appelle SCENE.frame lui-même ; l'avance rapide sans dessin
      const raf = window.requestAnimationFrame.bind(window); let manuel = false; const file = [];
      window.__rafManuel = (on) => { manuel = on; if (!on) for (const cb of file.splice(0)) raf(cb); };
      window.requestAnimationFrame = (cb) => { if (!manuel) return raf(cb); file.push(cb); return file.length; };
      window.__dessin = (on) => {
        if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
        for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {};
      };
      // n images de 1/30 s ; la dernière dessinée si dessin ; rend ce que suivre(equipe3d) garde de chaque image
      window.__pas = (n, dessin, suivre) => { const F = window.__fournil, S = F.SCENE, out = []; window.__dessin(false); try { for (let i = 0; i < n; i++) { if (dessin && i === n - 1) window.__dessin(true); S.frame(1 / 30, F.st, Date.now(), 33, false); if (suivre) out.push(suivre(S.equipe3d)); } } finally { window.__dessin(true); } return out; };
    }, decal);
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [], avertissements = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(t + (m.location() && m.location().url))) erreurs.push(t); if (m.type() === 'warning' && /Équipe 3D|Clients 3D|HD :|THREE\./.test(t)) avertissements.push(t); });
    demandes.length = 0;
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 60000 }); await sleep(600);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    for (let k = 0; k < 4; k++) { await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a$="tard"], #feuille [data-a="ok"]'); if (b) b.click(); }); await sleep(250); }
    // la boutique au complet : quatre recettes, quatre apprentis (aux grades 1, 3, 4 et 5), tout le mobilier ; midi, sans saison ; ni événement ni mystère au hasard
    await ev(() => {
      const F = window.__fournil, G = F.G, st = F.st; F.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) F.meuble(m.id);
      st.tuto = 99; st.mystereTimer = 1e9; st.evTimer = 1e9; st.apprentis = st.apprentis || {}; [1, 3, 4, 5].forEach((g, i) => { st.apprentis[G.PRODUITS[i].id] = { xp: [0, 129600, 518400, 1555200, 4860000][g - 1] + 10 }; });
      F.scene({ heure: 13, saison: [] }); F.save();
    });
    await ev(() => window.__fournil.tiroir('ferme'));
    return { ctx, page, erreurs, avertissements, ev };
  }
  const equipe = (ev) => ev(() => window.__fournil.SCENE.equipe3d);
  const memoire = (ev) => ev(() => { const s = window.__fournil.SCENE.stats, e = window.__fournil.SCENE.equipe3d; return { g: s.geometries, t: s.textures, acteurs: e ? e.etat.acteurs : 0 }; });
  const revenus = async (ev) => { // ceux de la page, ceux de src/game.js dans Node sur le même état (copié en JSON, comme la sauvegarde)
    const r = await ev(() => { const F = window.__fournil; return { st: JSON.stringify(F.st), page: [0, 1, 2, 3].map((i) => F.G.revenuFournee(F.st, i)) }; }), st = JSON.parse(r.st), node = [0, 1, 2, 3].map((i) => G0.revenuFournee(st, i));
    return { page: r.page, node, egaux: r.page.every((x, i) => Math.abs(x - node[i]) <= 1e-9 * Math.max(1, Math.abs(x))) };
  };
  // la hauteur du corps de chaque personnage 3D de l'équipe (ses sommets posés par les os, sans la toque), rapportée à 62 × K
  const hauteurs = (ev) => ev(() => { const r = []; window.__fournil.SCENE.trois.scene.traverse((g) => { const a = g.userData && g.userData.e3d; if (a && g.visible && g.parent && !a.vue) { const m = EQUIPE3D.mesure(a); r.push({ qui: a.boul ? 'boulanger' : 'a' + a.i, clip: a.joue, h: +((m.haut - m.bas) / (EQUIPE3D.HAUT * VIE.K)).toFixed(3) }); } }); return r; });

  // ═══════════════════════════════ sans le paramètre ═══════════════════════════════
  console.log('── sans ?boulanger3d=1 : rien ne change ──');
  let { ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute');
  check(await attendre(() => ev(() => HDM.pret('boutique') && HDM.pret('clients')), 90000), 'la boutique et les clients ont leur HD');
  await sleep(4000);
  { const r = await revenus(ev); check(r.egaux, `GAME.revenuFournee : les mêmes que src/game.js seul (${r.page.map((x) => +x.toPrecision(5)).join(', ')})`); }
  {
    const s = await ev(() => ({ actif: typeof EQUIPE3D !== 'undefined' && EQUIPE3D.actif, e3: window.__fournil.SCENE.equipe3d, lot: !!HDM.etat.equipe }));
    check(!s.actif && s.e3 === null && !s.lot && demandes.every((p) => !/\/hd\/equipe\//.test(p)), `le module est inactif, SCENE.equipe3d nul, aucun fichier de l'équipe demandé (${demandes.length} fichiers HD demandés)`);
    const c = await ev(() => { let b3 = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && o.userData.e3d) b3++; }); return b3; });
    check(c === 0, 'aucun personnage 3D de l\'équipe dans la scène (le boulanger et les apprentis en chibis)');
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ qualité haute, avec le paramètre ═══════════════════════════════
  console.log('── ?boulanger3d=1, qualité haute : le lot de l\'équipe, après celui des clients ──');
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute&boulanger3d=1'));
  check(await attendre(() => ev(() => typeof EQUIPE3D !== 'undefined' && EQUIPE3D.actif && HDM.pret('boutique')), 60000), 'le module de l\'équipe 3D est là, et la boutique a ses décors HD');
  check(await attendre(() => ev(() => HDM.pret('equipe')), 120000), 'le lot « equipe » arrive ensuite, de lui-même');
  check(await attendre(async () => { const e = await equipe(ev); return e && e.pret && e.compile === 2 && e.boulanger && e.apprentis.length >= 3 && e.apprentis.every((a) => !a.chibi); }, 120000), 'cuits à petits pas, leur programme compilé : le boulanger et les apprentis deviennent des personnages 3D');
  {
    const iC = demandes.reduce((m, p, i) => (/\/hd\/clients\//.test(p) ? i : m), -1), iE = demandes.findIndex((p) => /\/hd\/equipe\//.test(p));
    const eq = demandes.filter((p) => /\/hd\/equipe\//.test(p)), uniques = [...new Set(eq)], poids = uniques.reduce((s, p) => s + fs.statSync(path.join(root, p)).size, 0);
    const pc = [...new Set(demandes.filter((p) => /\/hd\/clients\//.test(p)))].reduce((s, p) => s + fs.statSync(path.join(root, p)).size, 0);
    check(iC >= 0 && iE > iC, `les fichiers de l'équipe sont demandés après ceux des clients (n° ${iE} après le n° ${iC} sur ${demandes.length})`);
    check(uniques.length === FICHIERS.length && eq.length === FICHIERS.length && FICHIERS.every((n) => uniques.some((p) => p.endsWith(`/equipe/${n}.glb`))) && demandes.filter((p) => p.endsWith('/clients/anims.glb')).length === 1, `${FICHIERS.length} fichiers (les deux corps, leurs clips, la lanterne), chacun demandé une fois ; les clips des clients repris, pas redemandés`);
    check(poids <= 600 * 1024, `leur poids : ${Math.round(poids / 1024)} Ko (≤ 600 Ko) ; avec le lot des clients : ${Math.round((poids + pc) / 1024)} Ko`);
    const e = await equipe(ev);
    check(e.info.corps.length === 2 && e.info.corps.every((c) => c.tris > 2500 && c.tris < 5000), `deux corps cuits (${e.info.corps.map((c) => `${c.nom} ${c.tris} triangles`).join(', ')})`);
    console.log(`        la cuisson : ${e.etat.msCuisson} ms, le plus long pas ${e.etat.pasMax} ms (${e.etat.pasLent}) ; ${e.etat.acteurs} acteurs`);
  }

  console.log('── le temps piloté : le boulanger et les apprentis au travail ──');
  await ev(() => window.__rafManuel(true)); await sleep(300);
  await ev(() => window.__pas(30, true));
  {
    const e = await equipe(ev), st = await ev(() => { const F = window.__fournil; return { cle: F.G.tenueBoulanger(F.st).cle, rang: VIE.etat ? 0 : 0 }; });
    check(e.boulanger && e.boulanger.mailles === 1 && !e.chibiBoulanger, `le boulanger : un personnage 3D, un maillage (${e.boulanger && e.boulanger.mailles}), ${e.boulanger && e.boulanger.tris} triangles`);
    check(e.boulanger && e.boulanger.tenue.endsWith('|' + st.cle), `il porte la tenue de la garde-robe (${e.boulanger && e.boulanger.tenue} ; GAME.tenueBoulanger : ${st.cle})`);
    check(e.apprentis.length === 3 && e.apprentis.every((a) => !a.chibi && a.mailles === (a.plateau ? 2 : 1)), `les apprentis : ${e.apprentis.length} personnages 3D, un maillage chacun, plus le plateau de celui qui porte (${e.apprentis.map((a) => `${a.corps} ${a.mailles}`).join(', ')})`);
    const gr = e.apprentis.map((a) => [a.grade, a.etoile]);
    check(e.apprentis.every((a) => a.etoile === (a.grade >= 3)) && new Set(e.apprentis.map((a) => a.grade)).size >= 2, `les grades : l'étoile dès le grade 3 (${gr.map(([g, s]) => `grade ${g} ${s ? 'étoile' : 'sans'}`).join(', ')})`);
    // la taille : celle des clients (62 × K), à 5 % près, debout ; le boulanger, le patron, un peu plus grand : ×1,1 (décision du joueur)
    const h = (await hauteurs(ev)).filter((x) => x.clip === 'Idle' || x.clip === 'Walk' || x.clip === 'Walk_Carry'), cible = (x) => (x.qui === 'boulanger' ? 1.1 : 1);
    check(h.some((x) => x.qui === 'boulanger') && h.every((x) => Math.abs(x.h / cible(x) - 1) <= 0.05), `à la taille des clients, debout : ${h.map((x) => `${x.qui} ${x.h}`).join(', ')} × 62 K (±5 % ; le boulanger ×1,1)`);
  }
  // le cycle des apprentis : au four (Working_A), porter (Walk_Carry, le plateau), poser (le plateau), revenir (Walk) ; 12 s
  {
    const vus = await ev(() => window.__pas(360, false, (e) => e.apprentis.map((a) => `${a.etat}/${a.clip}${a.plateau ? '+p' : ''}`)));
    const tous = new Set(vus.flat());
    const ok = (s) => tous.has(s);
    check(ok('four/Working_A') && ok('porte/Walk_Carry+p') && ok('depose/Idle+p') && ok('retour/Walk'), `le cycle : ${['four/Working_A', 'porte/Walk_Carry+p', 'depose/Idle+p', 'retour/Walk'].map((s) => `${s} ${ok(s) ? 'vu' : 'ABSENT'}`).join(', ')}`);
    check([...tous].every((s) => !/^(porte|depose)\//.test(s) || s.endsWith('+p')) && [...tous].every((s) => !/^(four|retour)\//.test(s) || !s.endsWith('+p')), 'le plateau entre les mains en portant et en posant, jamais au four ni au retour');
  }
  // la panne : la tête dans les mains (Defeat), puis la clé à la main (Hammering, le haut du corps), jusqu'à la réparation
  {
    const r = await ev(() => { const F = window.__fournil; F.ev('panne'); const e = F.st.ev; if (!e || e.type !== 'panne' || !VIE.apprentis.length) return null; e.i = VIE.apprentis[0].i; for (const a of VIE.apprentis) if (a.i === e.i && a.etat !== 'four') { a.etat = 'four'; a.t = 0.01; } return e.i; }); // (la panne d'un apprenti en vue : les trois des recettes les plus avancées)
    const vus = r == null ? [] : await ev((i) => window.__pas(150, false, (e) => { const a = e.apprentis.find((x) => x.i === i); return a ? `${a.etat}/${a.clip}${a.cle ? '+c' : ''}${a.repare ? '+r' : ''}` : ''; }), r);
    check(r != null && vus.includes('panne/Defeat+c') && vus.some((s) => /^panne\/.*\+c\+r$/.test(s)), `la panne (l'apprenti ${r}) : Defeat, la clé à la main (${vus.includes('panne/Defeat+c') ? 'vu' : 'ABSENT'}), puis il répare (${vus.some((s) => /\+c\+r$/.test(s)) ? 'vu' : 'ABSENT'})`);
    await ev(() => { window.__fournil.st.ev = null; }); const fin = await ev((i) => window.__pas(60, false, (e) => { const a = e.apprentis.find((x) => x.i === i); return a ? `${a.etat}${a.cle ? '+c' : ''}` : ''; }), r);
    check(fin.length && fin[fin.length - 1] && !fin[fin.length - 1].includes('panne') && !fin[fin.length - 1].includes('+c'), `réparé : il reprend son travail, la clé rangée (${fin[fin.length - 1]})`);
  }
  // la joie du boulanger : un toucher (VIE.tap, comme une vente) ; 30 images par seconde (le saut du hop retombe vite)
  {
    await ev(() => window.__pas(160, false)); // (l'attente entre deux joies passée)
    await ev(() => VIE.tap()); const j = await ev(() => window.__pas(20, false, (e) => !!(e.boulanger && e.boulanger.joie)));
    check(j.some(Boolean), `un toucher : le boulanger se réjouit (Cheering, le haut du corps), à 30 images par seconde (${j.filter(Boolean).length} images sur 20)`);
  }
  // le budget : le décor ≤ 80 appels de dessin, le boulanger et les apprentis comptés
  {
    await ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'banquette']) S.installer(z, 600); });
    await ev(() => window.__pas(20, true));
    const a = await ev(() => window.__fournil.SCENE.appelsParGroupe), e = await equipe(ev), st = await ev(() => window.__fournil.SCENE.stats);
    let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v;
    const app = e.apprentis.reduce((s, x) => s + (x.mailles || 0), 0);
    check(decor + app <= 80, `le décor : ${decor} appels de dessin, dont le boulanger ${a.boulanger || 0} ; avec les apprentis (${app}) : ${decor + app} (≤ 80) ; en tout ${st.calls} appels, ${Math.round(st.triangles / 1000)} k triangles`);
  }
  // une pièce changée se voit à l'image suivante (la garde-robe, GAME.equiper) ; trois tenues, puis la première : la mémoire ne bouge pas
  {
    const m0 = await memoire(ev), formes = [];
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; for (const c of ['or', 'quartier', 'hantee']) G.donnerCollection(st, c); G.donnerAura(st, 'lueur'); });
    const TENUES = [['or-toque', 'or-tablier', 'or-chaussures', 'or-foulard', null], ['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'quartier-chaine', null], ['hantee-chapeau', 'hantee-cape', 'hantee-bottes', 'hantee-lanterne', 'lueur'], ['toque-blanche', 'tablier-blanc', 'sabots', null, null]];
    for (const t of TENUES) {
      await ev((t) => { const F = window.__fournil, G = F.G, st = F.st; ['tete', 'haut', 'pieds', 'accessoire'].forEach((p, i) => G.equiper(st, p, t[i])); G.porterAura(st, t[4]); }, t);
      const r = await ev(() => { window.__pas(1, true); const F = window.__fournil, e = window.__fournil.SCENE.equipe3d; return { cle: F.G.tenueBoulanger(F.st).cle, b: e.boulanger }; });
      formes.push(r.b && r.b.tenue.endsWith('|' + r.cle) ? `${r.b.formes.tete}/${r.b.formes.haut}/${r.b.formes.pieds}/${r.b.formes.acc || (r.b.formes.lunettes ? 'lunettes' : '-')}${r.b.aura ? '+aura' : ''} (${r.b.mailles})` : `PAS PORTÉE ${r.b && r.b.tenue} ≠ ${r.cle}`);
    }
    check(formes.length === 4 && !formes.some((f) => f.startsWith('PAS')) && formes[0].startsWith('toque/tablier/chaussures') && formes[1].startsWith('casquette/sweat/baskets/chaine') && formes[2].startsWith('chapeau/cape/bottes/lanterne+aura (2)') && formes[3].startsWith('toque/tablier/chaussures/-'), `chaque tenue portée à l'image suivante, pièce par pièce : ${formes.join(' · ')}`);
    await ev(() => window.__pas(10, true)); const m1 = await memoire(ev);
    check(m1.g <= m0.g + 2 && m1.t <= m0.t + 1 && m1.acteurs === m0.acteurs, `la mémoire ne bouge pas (géométries ${m0.g} → ${m1.g}, textures ${m0.t} → ${m1.t}, acteurs ${m0.acteurs} → ${m1.acteurs})`);
  }
  // une pièce gagnée pendant la partie : cuite d'avance, à petits pas, dans les images qui suivent ; la porter ne cuit rien sur place (aucun kit à
  // l'image du changement). De même la toque du titre suivant : changer de titre ne cuit rien
  {
    const r = await ev(() => {
      const F = window.__fournil, G = F.G, st = F.st, E = EQUIPE3D, une = () => window.__pas(1, false), vider = (n, ms) => { let i = 0; for (; i < n && E.etat.aCuire > 0; i++) { une(); if (ms) ms.push(E.etat.msAvance); } return i; };
      vider(2000); une();
      const a0 = E.etat.avance, i0 = E.etat.imagesAvance; G.donnerCollection(st, 'bronze'); une(); const enAttente = E.etat.aCuire, ms = [], images = vider(2000, ms), cuits = E.etat.avance - a0, imagesAvance = E.etat.imagesAvance - i0;
      const s0 = E.etat.surPlace; for (const [p, id] of [['tete', 'bronze-toque'], ['haut', 'bronze-tablier'], ['pieds', 'bronze-chaussures'], ['accessoire', 'bronze-foulard']]) G.equiper(st, p, id);
      window.__pas(1, true); const s1 = E.etat.surPlace, msChangement = E.etat.msRhabillage, tenue = F.SCENE.equipe3d.boulanger && F.SCENE.equipe3d.boulanger.tenue, cle = G.tenueBoulanger(st).cle;
      vider(2000); const r0 = G.rangTitre(st), s2 = E.etat.surPlace; if (r0 < 5) { let x = 0; for (let n = 1; n < G.TITRES[r0 + 1][0]; n++) x += G.XP_NIVEAU(n); F.xp(Math.max(0, x - (st.xp || 0))); } // (juste assez de savoir-faire pour le titre suivant)
      window.__pas(1, true); const s3 = E.etat.surPlace, r1 = G.rangTitre(st), tenue2 = F.SCENE.equipe3d.boulanger && F.SCENE.equipe3d.boulanger.tenue;
      vider(2000); if (window.gc) window.gc(); // (la cuisson d'avance du titre d'après finie, ses restes ramassés : rien ne pèse sur la mesure du temps processeur)
      const tri = ms.filter((v) => v > 0).sort((u, v) => u - v);
      return { enAttente, images, cuits, imagesAvance, msMed: tri.length ? tri[Math.floor(tri.length / 2)] : 0, msMax: tri.length ? tri[tri.length - 1] : 0, s0, s1, msChangement, tenue, cle, r0, r1, s2, s3, tenue2 };
    });
    check(r.enAttente >= 4 && r.cuits >= 4 && r.imagesAvance >= 8 && r.msMed <= 8 && r.s1 === r.s0 && r.tenue && r.tenue.endsWith('|' + r.cle) && r.msChangement <= 25, `une collection gagnée (le podium de bronze) : ses ${r.cuits} kits cuits d'avance à petits pas, en ${r.imagesAvance} images (${r.msMed} ms par image en médiane, ${r.msMax} ms au plus) ; puis portée : aucun kit cuit à l'image du changement (${r.s0} → ${r.s1} cuits sur place), ${r.msChangement} ms (${r.tenue})`);
    check(r.r0 === 5 || (r.r1 === r.r0 + 1 && r.s3 === r.s2 && r.tenue2 && r.tenue2.startsWith(r.r1 + '|')), `le titre suivant (${r.r0} → ${r.r1}) : sa toque était déjà cuite, rien n'est cuit sur place (${r.s2} → ${r.s3})`);
  }
  // les revenus des fournées : la maquette ne montre que l'apparence (les mêmes que src/game.js seul, sur le même état)
  {
    const r = await revenus(ev);
    check(r.egaux, `GAME.revenuFournee inchangé : les mêmes que src/game.js seul (${r.page.map((x) => +x.toPrecision(5)).join(', ')})`);
  }

  console.log('── le temps processeur d\'une image (×4 : un téléphone quatre fois plus lent) ──');
  {
    // le temps PROCESSEUR du fil principal de la page (/proc/<pid>/task/<pid>/schedstat, comme test/fournil-clients3d.cjs) : des lots de 15
    // images dessinées, l'équipe en 3D puis les mêmes en chibis (EQUIPE3D.permis refusé un instant), en alternance, quatre fois ; la médiane
    const cmd = (p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); } catch (e) { return ''; } };
    const cpuNs = (p) => { try { return +fs.readFileSync(`/proc/${p}/task/${p}/schedstat`, 'utf8').split(' ')[0]; } catch (e) { return 0; } };
    let rp = 0; try { const b = await browser.newBrowserCDPSession(), pi = await b.send('SystemInfo.getProcessInfo'); rp = pi.processInfo.filter((x) => x.type === 'renderer').map((x) => x.id).filter((p) => cmd(p).includes('--type=renderer')).sort((a, b2) => cpuNs(b2) - cpuNs(a))[0] || 0; } catch (e) { rp = 0; }
    if (!rp || !cpuNs(rp)) console.log('        (pas de /proc ici : la mesure du temps processeur est sautée)');
    else {
      const lot = async () => { const c0 = cpuNs(rp); await ev(() => { const F = window.__fournil, S = F.SCENE, gl = document.querySelector('#scene').getContext('webgl2'); for (let i = 0; i < 15; i++) { gl.finish(); S.frame(1 / 30, F.st, Date.now(), 33, false); } }); return (cpuNs(rp) - c0) / 1e6 / 15; };
      const chibis = (on) => ev((on) => { if (on) { EQUIPE3D.__permis = EQUIPE3D.permis; EQUIPE3D.permis = () => false; } else if (EQUIPE3D.__permis) { EQUIPE3D.permis = EQUIPE3D.__permis; delete EQUIPE3D.__permis; } window.__pas(3, true); return window.__fournil.SCENE.equipe3d; }, on);
      const m = { e3: [], ch: [] }; let vus = null;
      for (let k = 0; k < 4; k++) for (const mode of ['e3', 'ch']) { const e = await chibis(mode === 'ch'); if (mode === 'e3' && !vus) vus = e; await lot(); m[mode].push(await lot()); }
      await chibis(false); await ev(() => window.__pas(3, true));
      const med = (l) => { const v = l.slice().sort((a, b) => a - b); return (v[1] + v[2]) / 2; }, r = { e3: med(m.e3), ch: med(m.ch) };
      console.log(`        temps processeur d'une image : l'équipe en 3D ${r.e3.toFixed(2)} ms (×4 : ${(4 * r.e3).toFixed(1)} ms) ; en chibis ${r.ch.toFixed(2)} ms (×4 : ${(4 * r.ch).toFixed(1)} ms) ; lots ${m.e3.map((x) => x.toFixed(2)).join(', ')} / ${m.ch.map((x) => x.toFixed(2)).join(', ')}`);
      check(vus && vus.boulanger && 4 * r.e3 < 33 && r.e3 <= r.ch * 1.3 + 0.5, `le boulanger et ${vus && vus.apprentis.length} apprentis en 3D : ${(4 * r.e3).toFixed(1)} ms par image le processeur ×4 (< 33 ms), au plus 30 % au-dessus des mêmes en chibis (${(4 * r.ch).toFixed(1)} ms)`);
    }
  }

  // ─── (après la mesure du temps processeur : ce qui suit bâtit et jette beaucoup, il ne pèse pas sur elle)
  // ─── les tenues, pièce par pièce : chaque pièce se voit (la géométrie de son kit, ou ses couleurs), la tenue de la chaîne, rien ne passe à
  //     travers rien (toutes les pièces seules, les ensembles, 30 mélanges tirés au sort, à trois poses), les budgets, le cache, la mémoire ───
  console.log('── les tenues pièce par pièce : chaque pièce, la chaîne, les traversées, les budgets, le cache, la mémoire ──');
  {
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; for (const c of ['or', 'argent', 'bronze', 'quartier', 'quartier-or', 'quartier-neon', 'hantee', 'hantee-or', 'hantee-lueur', 'parcours', 'chaine']) G.donnerCollection(st, c); });
    await page.addScriptTag({ content: 'window.__traversees = ' + traversees.toString() + ';' });
    // chaque pièce portée (les autres de base, titre « Boulanger ») : son kit à sa place, de la bonne forme, et le maillage change (sa géométrie
    // ou ses couleurs : la cape et la lanterne en or ont la géométrie des autres)
    const P = await ev(() => {
      const G = window.__fournil.G, O = G.GARDEROBE.objets, P4 = ['tete', 'haut', 'pieds', 'accessoire'], EMP = { tete: 'T|', haut: 'H|', pieds: 'P|', accessoire: 'A|' };
      const sig = (ids) => { const a = EQUIPE3D.boulanger(2, { cle: ids.join('|') }, 'Au Fournil du Village'), g = a.S.geometry, c = g.attributes.color.array, pp = g.attributes.position.array; let hc = 2166136261, hp = 2166136261; for (let i = 0; i < c.length; i++) hc = Math.imul(hc ^ c[i], 16777619) >>> 0; for (let i = 0; i < pp.length; i += 3) hp = Math.imul(hp ^ Math.round(pp[i] * 1e4), 16777619) >>> 0; return { kits: a.habit.kits.map((k) => k.cle), tris: a.habit.tris, sig: `${hp}/${hc}/${pp.length}`, mailles: (() => { let n = 0; a.g.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; })() }; };
      const forme = (v) => ({ tete: { toque: 'T|toque|', casquette: 'T|casquette|', chapeau: 'T|chapeau|' }[v.forme], haut: v.id === 'chaine-veste' ? 'H|veste' : { tablier: 'H|tablier|', sweat: 'H|sweat|', cape: 'H|cape' }[v.forme], pieds: v.id === 'chaine-souliers' ? 'P|pieds|souliers' : v.id === 'sabots' ? 'P|pieds|sabots' : { chaussures: 'P|pieds|', baskets: 'P|pieds|baskets', bottes: 'P|pieds|bottes' }[v.forme], accessoire: v.id === 'chaine-cles' ? 'A|cles' : { lunettes: 'A|lunettes', foulard: 'A|foulard|', chaine: 'A|chaine|', lanterne: 'A|lanterne' }[v.forme] })[v.piece];
      const base = sig(['toque-blanche', 'tablier-blanc', 'sabots', '']), out = [];
      for (const v of Object.values(O)) { const ids = ['toque-blanche', 'tablier-blanc', 'sabots', '']; ids[P4.indexOf(v.piece)] = v.id; const s = sig(ids), k = s.kits.filter((x) => x.startsWith(EMP[v.piece])); out.push({ id: v.id, base: v.collection === 'base' && v.piece !== 'accessoire', kit: k.join(','), forme: !!forme(v) && k.some((x) => x.startsWith(forme(v))), sig: s.sig, tris: s.tris, mailles: s.mailles }); }
      return { base, out, n: Object.keys(O).length };
    });
    const nonBase = P.out.filter((x) => !x.base), sigs = new Set(nonBase.map((x) => x.sig));
    check(P.n === 42 && P.out.every((x) => x.forme), `les ${P.n} pièces : chacune son kit, de sa forme (${P.out.filter((x) => !x.forme).map((x) => `${x.id} → ${x.kit}`).join(', ') || 'toutes'})`);
    check(nonBase.every((x) => x.sig !== P.base.sig) && sigs.size === nonBase.length && P.out.filter((x) => x.base).every((x) => x.sig === P.base.sig), `chaque pièce portée change le maillage : ${nonBase.length} maillages tous différents, et de la tenue de base (les trois pièces de base la redonnent)`);
    console.log(`        les kits : ${P.out.map((x) => `${x.id} ${x.kit} (${x.tris})`).join(' · ')}`);
    // la tenue de la chaîne : la palette TENUES.chaine (celle des chibis aussi), la veste de patron (pas un tablier), le trousseau à la ceinture
    const C = await ev(() => { const h = EQUIPE3D.habitBoulanger(2, { cle: 'chaine-toque|chaine-veste|chaine-souliers|chaine-cles' }, 'Au Fournil du Village'), pal = EQUIPE3D.palette(h), R = EQUIPE3D.ROLES, c = new THREE.Color(PERSOS.TENUES.chaine.tissu), egal = (x) => !!x && Math.abs(x[0] - c.r) + Math.abs(x[1] - c.g) + Math.abs(x[2] - c.b) < 1e-4; return { veste: egal(pal.couleurs[R.indexOf('veste')]), toque: egal(pal.couleurs[R.indexOf('T.tissu')]), haut: h.haut, acc: h.acc, pieds: h.pieds, chibi: PERSOS.TENUES.chaine.tissu, icone: typeof ICONS !== 'undefined' && ICONS.TENUES ? (ICONS.TENUES.chaine || [])[0] : PERSOS.TENUES.chaine.tissu, kits: EQUIPE3D.kitsDe(h).map((k) => k[1] + '|' + k[0]) }; });
    check(C.veste && C.toque && C.haut === 'veste' && C.acc === 'cles' && C.pieds === 'souliers' && C.icone === C.chibi && C.kits.includes('H|veste') && C.kits.includes('A|cles') && C.kits.some((k) => k.startsWith('T|toque|chaine|')), `la tenue de la chaîne : la palette TENUES.chaine (${C.chibi}, la même pour les chibis et les icônes), la toque à galon, la veste de patron, les souliers vernis, le trousseau (${C.kits.join(', ')})`);
    // les traversées : toutes les pièces seules sur la tenue de base (au dernier titre : le foulard rouge, la moustache, le liseré, le col),
    // les ensembles, 30 mélanges tirés au sort (graine fixe, titres au hasard) et des mélanges qui se frôlent ; chacun à trois poses (le
    // repos, plus tard, la joie) : aucun triangle d'une pièce ne passe à travers une autre
    const ids = await ev(() => Object.values(window.__fournil.G.GARDEROBE.objets).map((v) => [v.id, v.piece, v.collection]));
    const parPiece = (p) => ids.filter((x) => x[1] === p).map((x) => x[0]), BASE = ['toque-blanche', 'tablier-blanc', 'sabots', ''], liste = [];
    for (const [id, p] of ids) { const t = BASE.slice(); t[['tete', 'haut', 'pieds', 'accessoire'].indexOf(p)] = id; liste.push([...t, 5]); }
    for (const c of ['or', 'argent', 'bronze', 'quartier', 'quartier-or', 'hantee', 'hantee-or', 'parcours', 'chaine']) liste.push([...['tete', 'haut', 'pieds', 'accessoire'].map((p) => (ids.find((x) => x[2] === c && x[1] === p) || [''])[0]), 5]);
    let graine = 20261027; const hasard = (n) => { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return Math.floor(graine / 4294967296 * n); };
    for (let k = 0; k < 30; k++) { const t = ['tete', 'haut', 'pieds', 'accessoire'].map((p) => { const l = parPiece(p).concat(p === 'accessoire' ? [''] : []); return l[hasard(l.length)]; }); liste.push([...t, hasard(6)]); }
    for (const t of [['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'or-foulard'], ['hantee-chapeau', 'quartier-or-sweat', 'sabots', 'quartier-or-chaine'], ['chaine-toque', 'chaine-veste', 'chaine-souliers', 'parcours-foulard'], ['parcours-toque', 'chaine-veste', 'hantee-bottes', 'quartier-chaine'], ['quartier-neon-casquette', 'hantee-cape', 'quartier-or-baskets', 'argent-foulard'], ['hantee-or-chapeau', 'hantee-or-cape', 'hantee-or-bottes', 'chaine-cles'], ['bronze-toque', 'hantee-cape', 'chaine-souliers', 'quartier-chaine'], ['or-toque', 'quartier-sweat', 'or-chaussures', 'chaine-cles'], ['toque-blanche', 'parcours-tablier', 'hantee-bottes', 'chaine-cles'], ['hantee-lueur-chapeau', 'or-tablier', 'quartier-baskets', 'lunettes-rondes']]) liste.push([...t, 5]);
    const T = await ev((liste) => {
      const out = [], t0 = performance.now();
      for (const t of liste) {
        const a = EQUIPE3D.boulanger(t[4], { cle: t.slice(0, 4).join('|') }, 'Au Fournil du Village'), ctx = { K: a.pr.hauteur / EQUIPE3D.HAUT, x: 0, y: 0, z: 0, yaw: 0 }, vus = new Map();
        // cinq poses : le repos et plus tard (vue : sans geste) ; la main au front et les mains frottées, ses gestes de la boutique (vue: false), à
        // leur plus fort (w = 0,035 et 0,54 de son cycle de 11 s) ; la joie. Les traversées entre les pièces, et celles des mains dans les pièces
        const geste = (w) => ((((w - a.graine) % 1) + 1) % 1) / 0.09;
        for (const [tt, joie, vue, d0] of [[0.3, false, true, 0], [2.1, false, true, 0], [geste(0.035), false, false, -2], [geste(0.54), false, false, -2], [0, true, true, 0]]) {
          a.joieT = joie ? 1.4 : 0; a.joieAttente = joie ? 0 : 99; a.hopP = 0;
          for (let k = 0; k < (joie ? 18 : 3); k++) EQUIPE3D.poserBoulanger(a, { t: tt + (k + d0) / 30, hop: 0, rush: false, vue }, 1 / 30, ctx);
          for (const p of window.__traversees(a, { mains: true }).paires) vus.set(`${p.a}×${p.b}`, (vus.get(`${p.a}×${p.b}`) || 0) + p.n);
        }
        a.joieT = 0; let n = 0; a.g.traverse((o) => { if (o.isMesh && o.visible) n++; }); out.push({ t: t.join('|'), tris: a.habit.tris, mailles: n, paires: [...vus].map(([k, n]) => `${k}:${n}`) });
      }
      return { out, ms: Math.round(performance.now() - t0) };
    }, liste);
    const touches = T.out.filter((x) => x.paires.length), trisMax = Math.max(...T.out.map((x) => x.tris)), trisMin = Math.min(...T.out.map((x) => x.tris)), mains = T.out.filter((x) => x.paires.some((p) => p.startsWith('mains×')));
    check(T.out.length === liste.length && touches.length === 0, `aucune traversée : ${ids.length} pièces seules, 9 ensembles, 30 mélanges tirés au sort et 10 qui se frôlent, à cinq poses (le repos, plus tard, la main au front et les mains frottées de la boutique, la joie) : ni d'une pièce dans une autre, ni des mains dans une pièce (${mains.length} tenues où une main traverse ; ${T.out.length} tenues, ${T.ms} ms)${touches.length ? ' — ' + touches.slice(0, 4).map((x) => `${x.t} : ${x.paires.join(' ')}`).join(' ; ') : ''}`);
    check(T.out.every((x) => x.mailles === 1) && trisMax <= 10500, `le budget : un seul maillage par tenue (un appel de dessin), ${trisMin} à ${trisMax} triangles (≤ 10 500) ; le corps seul : ${await ev(() => window.__fournil.SCENE.equipe3d.info.corps.map((c) => c.tris).join(' / '))}`);
    // le cache : toutes les pièces déjà cuites, 20 changements de tenue ne font que recoller (pas d'à-coup) ; la mémoire ne monte pas
    const M = await ev((liste) => {
      const ms = [], tas = () => (window.gc && window.gc(), performance.memory ? performance.memory.usedJSHeapSize : 0), S = window.__fournil.SCENE.stats;
      const vingt = () => { for (let k = 0; k < 20; k++) { const t = liste[(k * 7) % liste.length], t0 = performance.now(); EQUIPE3D.boulanger(t[4], { cle: t.slice(0, 4).join('|') }, 'Au Fournil du Village'); ms.push(performance.now() - t0); } };
      vingt(); window.__pas(2, true); const h0 = tas(), g0 = S.geometries, k0 = EQUIPE3D.etat.kits; ms.length = 0; vingt(); const k1 = EQUIPE3D.etat.kits; window.__pas(2, true); const h1 = tas(), g1 = S.geometries; // (entre deux, la boutique cuit d'avance les pièces possédées, au titre du moment)
      const v = ms.slice().sort((a, b) => a - b); return { kits0: k0, kits1: k1, max: +v[v.length - 1].toFixed(1), med: +v[10].toFixed(1), h0, h1, g0, g1, gc: !!window.gc };
    }, liste);
    check(M.kits1 === M.kits0 && M.max <= 25, `le cache : 20 changements de tenue, aucun kit à cuire (${M.kits0} en cache), ${M.med} ms en médiane, ${M.max} ms au plus (≤ 25 ms)`);
    check(M.g1 <= M.g0 + 1 && (!M.h0 || M.h1 - M.h0 < 3e6), `la mémoire : 20 changements de plus, géométries ${M.g0} → ${M.g1}, tas JS ${(M.h0 / 1e6).toFixed(1)} → ${(M.h1 / 1e6).toFixed(1)} Mo${M.gc ? ' (après gc)' : ''}`);
    await ev(() => window.__pas(3, true)); // (la scène le rhabille de sa vraie tenue)
    const b = await ev(() => { const F = window.__fournil, e = F.SCENE.equipe3d; return { tenue: e.boulanger && e.boulanger.tenue, cle: F.G.tenueBoulanger(F.st).cle }; });
    check(b.tenue && b.tenue.endsWith('|' + b.cle), `ensuite, la boutique le rhabille de sa tenue (${b.tenue})`);
  }
  // l'aura dans la boutique, sous sa caméra plongeante : elle luit autour de lui sans le teindre (mesurerAura : des rendus au même instant, avec
  // et sans elle) ; dans sa silhouette, l'écart reste minime, et le pantalon (le haut des cuisses) garde sa couleur ; autour de lui, le halo se voit
  {
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; [['tete', 'quartier-casquette'], ['haut', 'quartier-sweat'], ['pieds', 'quartier-baskets'], ['accessoire', null]].forEach(([p, id]) => G.equiper(st, p, id)); G.porterAura(st, 'lueur'); window.__pas(4, true); });
    const r = await ev(mesurerAura);
    const pant = r && r.cuisses && r.cuisses.length ? r.cuisses.map((c) => `rgb(${c.avec}) avec, rgb(${c.sans}) sans (${c.n} px)`).join(' ; ') : 'caché';
    const pantOk = !!r && !!r.cuisses && r.cuisses.every((c) => Math.max(...c.avec.map((x, j) => Math.abs(x - c.sans[j]))) <= 3);
    check(!!r && r.sil > 300 && r.bruit <= 2 && r.moy <= 1 && r.p98 <= 6 && pantOk && r.halo >= 1, `l'aura dans la boutique ne teint pas le boulanger : dans sa silhouette (${r && r.sil} px), écart avec et sans l'aura ${r && r.moy} en moyenne, ${r && r.p98} au 98e centile (le pantalon : ${pant}) ; autour de lui, le halo se voit (écart moyen ${r && r.halo}) ; deux rendus pareils au même instant (écart ${r && r.bruit})`);
    await ev(() => { const F = window.__fournil; F.G.porterAura(F.st, null); window.__pas(2, true); });
  }
  // le pâton : entre les mains de l'apprenti qui pétrit au four, rangé dès qu'il le quitte
  {
    const vus = await ev(() => window.__pas(240, false, (e) => e.apprentis.map((a) => `${a.etat}/${a.clip}${a.pate ? '+pate' : ''}`)));
    const tous = new Set(vus.flat());
    check(tous.has('four/Working_A+pate') && [...tous].every((s) => s.endsWith('+pate') === s.startsWith('four/Working_A')), `le pâton entre les mains au four (Working_A), jamais ailleurs (${[...tous].sort().join(', ')})`);
  }
  console.log('── la vue « Mon boulanger » : ouverte depuis la garde-robe, tournée au doigt, une pièce mise, fermée (trois fois) ──');
  {
    await ev(() => window.__rafManuel(false)); await sleep(400);
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; G.donnerCollection(st, 'parcours'); F.rafraichir(); F.page('boulanger'); }); await sleep(600);
    const m0 = await memoire(ev); const mems = [];
    for (let k = 1; k <= 3; k++) {
      const ok = await ev(() => { const b = document.querySelector('[data-gr-3d]'); if (!b) return false; b.scrollIntoView(); b.click(); return true; });
      if (k === 1) check(ok, 'le bouton « Voir mon boulanger en 3D » de la garde-robe');
      check(await attendre(() => ev(() => { const e = EQUIPE3D.vue.etat; return !!e && e.tris > 0 && e.images > 3 && !!document.getElementById('mon-boulanger'); }), 30000), `vue ${k} : ouverte, le boulanger en grand sur son estrade${erreurs.length ? ' (' + erreurs.slice(0, 2).join(' | ') + ')' : ''}`);
      if (k === 1) {
        const e0 = await ev(() => EQUIPE3D.vue.etat);
        check(e0.appels <= 6 && e0.tris < 9000, `un personnage, son estrade : ${e0.appels} appels de dessin, ${e0.tris} triangles pour le boulanger`);
        // tourné au doigt : un glisser sur la scène fait tourner le boulanger
        const box = await page.locator('#mon-boulanger .mb-scene').boundingBox(), y0 = (await ev(() => EQUIPE3D.vue.etat)).yaw;
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + box.width * (0.3 + i * 0.05), box.y + box.height * 0.5); await sleep(30); } await page.mouse.up();
        const y1 = (await ev(() => EQUIPE3D.vue.etat)).yaw;
        check(Math.abs(y1 - y0) > 0.8, `tourné au doigt : ${y0} → ${y1} rad`);
        // une pièce mise depuis la vue : l'onglet Tête, la toque du parcours ; portée aussitôt, et sa joie
        await ev(() => document.querySelector('#mon-boulanger [data-mb-piece="tete"]').click()); await sleep(150);
        const avant = await ev(() => EQUIPE3D.vue.etat.tenue);
        const mis = await ev(() => { const b = document.querySelector('#mon-boulanger [data-mb-porter="parcours-toque"]'); if (!b) return false; b.click(); return true; });
        const apres = await ev(() => ({ e: EQUIPE3D.vue.etat, cle: window.__fournil.G.tenueBoulanger(window.__fournil.st).cle }));
        check(mis && apres.e.tenue !== avant && apres.e.tenue.endsWith('|' + apres.cle) && apres.cle.startsWith('parcours-toque|') && apres.e.joie, `une pièce mise depuis la vue : portée aussitôt (${avant} → ${apres.e.tenue}), il s'en réjouit`);
        const vue = await ev(() => { const b = document.querySelector('#mon-boulanger [data-mb="pieces"]'), p = b && b.querySelector('[aria-pressed="true"]'); if (!p) return null; const r = p.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { dedans: r.left >= rb.left - 1 && r.right <= rb.right + 1, defile: Math.round(b.scrollLeft) }; });
        check(vue && vue.dedans, `la pièce portée se voit dans la bande, refaite (défilée de ${vue && vue.defile} px)`);
        await ev(() => document.querySelector('#mon-boulanger [data-mb-piece="haut"]').click()); await sleep(150);
        const n = await ev(() => document.querySelectorAll('#mon-boulanger .mb-piece').length);
        check(n >= 3, `l'onglet Haut : les pièces qu'on possède (${n})`);
      }
      await ev(() => document.querySelector('#mon-boulanger [data-mb="fermer"]').click()); await sleep(500);
      const f = await ev(() => ({ el: !!document.getElementById('mon-boulanger'), ouvert: EQUIPE3D.vue.ouvert, etat: EQUIPE3D.vue.etat }));
      check(!f.el && !f.ouvert && f.etat === null, `vue ${k} : fermée (la page, son contexte WebGL rendus)`);
      await ev(() => window.__fournil.page('boutique')); await sleep(1500);
      mems.push(await memoire(ev)); await ev(() => window.__fournil.page('boulanger')); await sleep(400);
    }
    check(await ev(() => window.__fournil.SCENE.stats.rendus > 0), 'la boutique reprend derrière');
    check(mems[2].g <= mems[0].g + 2 && mems[2].t <= mems[0].t && mems[2].acteurs === mems[0].acteurs, `trois ouvertures : la mémoire de la boutique est stable (avant ${m0.g} géométries ; géométries ${mems.map((m) => m.g).join(' → ')}, textures ${mems.map((m) => m.t).join(' → ')}, acteurs ${mems.map((m) => m.acteurs).join(' → ')})`);
    await ev(() => window.__fournil.page('boutique')); await sleep(400);
  }

  console.log('── la HD coupée dans les Réglages : les chibis, la mémoire rendue, puis le retour ──');
  {
    await ev(() => window.__rafManuel(true)); await sleep(300);
    const m0 = await memoire(ev);
    await ev(() => HDM.couper('joueur')); await ev(() => window.__pas(2, true));
    let e = await equipe(ev);
    check(e.chibiBoulanger && !e.boulanger && e.apprentis.every((a) => a.chibi), `coupée : le boulanger et les apprentis redeviennent des chibis à l'image suivante (${e.apprentis.length} apprentis)`);
    await ev(() => window.__pas(30 * 11, false)); await ev(() => window.__pas(2, true));
    e = await equipe(ev); const m1 = await memoire(ev);
    check(e.etat.liberes === 1 && e.etat.acteurs === 0 && m0.acteurs > 0, `après 10 s : la réserve rend sa mémoire (${m0.acteurs} → ${e.etat.acteurs} acteurs ; le rendu : ${m0.g} → ${m1.g} géométries, ${m0.t} → ${m1.t} textures)`);
    await ev(() => HDM.remettre());
    check(await attendre(async () => { await ev(() => window.__pas(4, true)); const x = await equipe(ev); return x && x.boulanger && x.apprentis.every((a) => !a.chibi); }, 60000), 'remise : le boulanger et les apprentis 3D reviennent');
  }

  console.log('── la Maison hantée : son équipe à elle, aucun personnage 3D de l\'équipe ──');
  {
    await ev(() => window.__rafManuel(false)); await sleep(300);
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12; [[60, 1], [40, 1], [25, 1]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5, 6]; F.save(); });
    await ev(() => window.__fournil.hantee());
    const ok = await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.patronne && e.apprentis.length > 0; }), 60000); await sleep(1500);
    const vus = await ev(() => { let e3 = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && o.userData.e3d && o.visible && o.parent) e3++; }); const e = window.__fournil.SCENE.evenement; return { e3, hd: e && e.hd, apprentis: e ? e.apprentis.length : 0 }; });
    check(ok && vus.e3 === 0, `la Maison hantée ${vus.hd ? 'en HD (ses monstres)' : '(ses chibis déguisés)'} : ${vus.apprentis} apprentis à elle, aucun personnage 3D de l'équipe`);
    await ev(() => window.__fournil.fermerHantee());
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.equipe3d; return !window.__fournil.SCENE.evenement && e && e.boulanger && e.apprentis.length > 0 && e.apprentis.every((a) => !a.chibi); }), 60000), 'au retour, le boulanger et les apprentis 3D reprennent la boutique');
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  check(avertissements.length === 0, `aucun avertissement de l'équipe 3D, de la HD ni de three.js (${avertissements.slice(0, 2).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ la qualité éco ═══════════════════════════════
  console.log('── ?boulanger3d=1 en qualité éco : les chibis, aucun fichier de l\'équipe demandé ──');
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=eco&boulanger3d=1'));
  await sleep(6000);
  {
    const e = await equipe(ev);
    check(demandes.every((p) => !/\/hd\/equipe\//.test(p)) && e && !e.boulanger && e.chibiBoulanger && e.apprentis.every((a) => a.chibi), `le boulanger et ${e ? e.apprentis.length : 0} apprentis en chibis, aucun fichier de l'équipe demandé (${demandes.length} fichiers HD demandés)`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ un fichier manquant ═══════════════════════════════
  console.log('── ?boulanger3d=1, les clips de l\'équipe manquants : le lot échoue, les chibis restent ──');
  bloques = [/\/hd\/equipe\/anims-equipe\.glb$/];
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute&boulanger3d=1'));
  check(await attendre(() => ev(() => HDM.etat.equipe && !!HDM.etat.equipe.erreur), 120000), `le lot « equipe » échoue (${await ev(() => HDM.etat.equipe && HDM.etat.equipe.erreur)})`);
  await sleep(2500);
  {
    const e = await equipe(ev), d = await ev(() => window.__fournil.SCENE.stats);
    check(e && !e.pret && !e.boulanger && e.chibiBoulanger && e.apprentis.length > 0 && e.apprentis.every((a) => a.chibi) && d.calls > 0, `le boulanger et ${e ? e.apprentis.length : 0} apprentis restent des chibis, la scène tourne (${d.calls} appels)`);
    check(await attendre(() => ev(() => { const c = window.__fournil.SCENE.clients3d; return !!c && c.pret; }), 60000), 'les clients 3D, eux, sont prêts');
    check(avertissements.length > 0 && avertissements.every((t) => /équipe, fichier manquant|modèles non chargés/.test(t)), `un avertissement le dit, et aucun autre (${avertissements.slice(0, 2).join(' | ')})`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close(); bloques = [];

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (équipe 3D).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
