/* OPÉRATION PONCIN — le rendu 3D (Three.js r158) : Poncin en low-poly arrondi pastel, vu à la première personne.
   Le décor est construit une fois par init : sol = relief maillé avec EXACTEMENT la triangulation de monde.hauteur (diagonale (i+1, j)–(i, j+1)),
   habillé de la photo aérienne (carte.sol) ou d'un sol peint sur canvas (rues, eau, végétation, ombres douces) ; bâtiments extrudés et
   fusionnés par tuiles (≤ 16 maillages + autant de maillages de détails — fenêtres, volets, portes, vitrines — montrés seulement de près) ;
   toits à deux pans, en croupe, en pavillon tronqué ou plats à acrotère, flèches des tours ; eau animée, ponts de pierre à arches, clôtures
   des zones interdites, arbres et vignes en InstancedMesh (seuls les proches sont recopiés), ciel peint (dégradé, soleil, nuages, montagnes
   du Bugey) qui suit la caméra, brouillard. Les personnages viennent de PAVATARS (avatars.js). L'arme en vue subjective est une scène à part,
   rendue après le monde avec clearDepth. Effets en pools (InstancedMesh) : traînées, éclairs, impacts de peinture orientés, particules
   (confettis, gouttes). Qualité haute / moyenne / éco (ombres seulement en haute), adaptée au temps d'image comme src/scene.js.
   Aucune allocation par image dans les chemins chauds (vecteurs de travail, tableaux préparés, champs).
   API (contrat, voir src-poncin/ARCHITECTURE.md) : init(canvas, carte, monde, { qualite, dossier }) → bool ; taille(w, h) ;
   image(jeu, idCamera, dt, t) (jeu = null : survol de Poncin) ; evenements(evs, jeu) ; qualite(q?) ; stats ; projeter(x, y, z) → { x, y, devant }
   (objet partagé, à lire tout de suite). En plus : fov (champ vertical en degrés, lu par le HUD), webgl, survol(o) (règle le survol). */
const PRENDU = (() => {
  'use strict';
  const OK3 = typeof THREE !== 'undefined' && typeof MODELES !== 'undefined' && !!MODELES;
  const M = OK3 ? MODELES : null, TAU = Math.PI * 2, HP = Math.PI / 2;
  const REG = typeof PREGLES !== 'undefined' ? PREGLES : null, JOUEUR = REG ? REG.JOUEUR : { oeil: 1.6, oeilAccroupi: 1.0, vitesse: 5.2 };
  const AV = typeof PAVATARS !== 'undefined' ? PAVATARS : null;
  const hash = REG ? REG.hash : (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry32 = REG ? REG.mulberry32 : (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  let erreurs = 0, derniereErreur = '';
  const tourner = (o3) => o3.quaternion.setFromEuler(o3.rotation, false); // après une écriture directe des champs d'Euler (_x, _y, _z)
  function signaler(ou, e) { erreurs++; derniereErreur = ou + ' : ' + (e && e.message ? e.message : e); try { console.warn('[rendu] ' + derniereErreur); } catch (x) { /* rien */ } }

  // ─── la qualité : trois paliers (budgets du contrat), adaptés au temps d'image mesuré ───
  const PALIERS = {
    haute: { dpr: 2, ombres: 1024, brume: [170, 640], detail: 175, arbres: 420, splats: 120, part: 260 },
    moyenne: { dpr: 1.5, ombres: 0, brume: [120, 430], detail: 125, arbres: 300, splats: 90, part: 200 },
    eco: { dpr: 1, ombres: 0, brume: [80, 280], detail: 80, arbres: 210, splats: 60, part: 140 },
  };
  const BUDGETS = { haute: { calls: 110, triangles: 300000 }, moyenne: { calls: 90, triangles: 200000 }, eco: { calls: 70, triangles: 120000 } };
  const ORDRE_Q = ['eco', 'moyenne', 'haute'];
  const QUAL = { niveau: 'moyenne', fixe: false, mesures: 0, somme: 0, calme: 0, echecs: {}, verif: null, moy: 0 };

  // ─── l'état ───
  let renderer = null, gl = null, cv = null, scene = null, camera = null, sceneArme = null, camArme = null, hemi = null, soleil = null, hemiA = null, soleilA = null;
  let carte = null, monde = null, L = 600, W = 1, H = 1, DPR = 1, pret = false, perdu = false, webgl = false, frame = 0, dossier = 'carte/';
  let fovV = 60, tPrecImage = 0, cpuMs = 0, solEtat = 'aucun';
  const SOLEIL = (() => { const x = -0.52, y = 0.66, z = 0.54, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })(); // vers le soleil : sud-ouest, fin d'après-midi
  const C = { brume: '#E2EBEE', ciel: '#A9D8F5', solHemi: '#C8B29A', cielHemi: '#E2F1FF', soleil: '#FFE9CC' };
  // les vecteurs de travail (créés à l'init : Three peut manquer)
  let _v, _v2, _v3, _q, _q2, _m, _e, _c, _s, _Z, _Y;

  // ═══════════════════════════════ construction : outils ═══════════════════════════════
  const COUL = new Map(); // hex|k → [r, g, b] linéaires
  function lin(hex, k) { const cle = k ? hex + k : hex; let c = COUL.get(cle); if (!c) { _c.set(hex); if (k) _c.multiplyScalar(k); c = [_c.r, _c.g, _c.b]; COUL.set(cle, c); } return c; }
  // un tampon de triangles colorés (normales plates calculées à la fin) → une BufferGeometry non indexée
  function Tampon() { this.p = []; this.c = []; }
  Tampon.prototype.tri = function (ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc) {
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    cb = cb || ca; cc = cc || ca; this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  };
  // un quadrilatère a, b, c, d (dans le sens direct vu de devant) ; ca : couleur de a et b, cc : couleur de c et d
  Tampon.prototype.quad = function (a, b, c, d, ca, cc) { cc = cc || ca; this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, ca, cc); this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], ca, cc, cc); };
  Tampon.prototype.vide = function () { return this.p.length === 0; };
  Tampon.prototype.geometrie = function () {
    const n = this.p.length / 3, pos = new Float32Array(this.p), col = new Float32Array(this.c), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const o = i * 3, ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2], vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { nor[o + 3 * k] = nx; nor[o + 3 * k + 1] = ny; nor[o + 3 * k + 2] = nz; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  };
  const P3 = (x, y, z) => [x, y, z];
  // géométrie plane
  const aire = (p) => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  function dansPoly(p, x, z) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
  function d2Seg(px, pz, ax, az, bx, bz) { const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez; let t = l > 0 ? ((px - ax) * ex + (pz - az) * ez) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = ax + t * ex - px, dz = az + t * ez - pz; return dx * dx + dz * dz; }
  function orienter(p) { // points finis, sans doublon, aire signée > 0 (comme monde.js) ; null si dégénéré
    if (!Array.isArray(p)) return null; const q = [];
    for (const pt of p) { if (!pt) continue; const x = +pt[0], z = +pt[1]; if (!fini(x) || !fini(z)) continue; const d = q[q.length - 1]; if (d && Math.abs(d[0] - x) < 1e-6 && Math.abs(d[1] - z) < 1e-6) continue; q.push([x, z]); }
    while (q.length > 1 && Math.abs(q[0][0] - q[q.length - 1][0]) < 1e-6 && Math.abs(q[0][1] - q[q.length - 1][1]) < 1e-6) q.pop();
    if (q.length < 3) return null; const a = aire(q); if (!(Math.abs(a) > 1e-3)) return null; if (a < 0) q.reverse(); return q;
  }
  function obb(p) { // le rectangle d'aire minimale, orienté par une arête : centre, axe long u, demi-longueur hl, demi-largeur hw
    let b = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length]; let ux = c[0] - a[0], uz = c[1] - a[1]; const l = Math.hypot(ux, uz); if (l < 0.3) continue; ux /= l; uz /= l;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
      const ar = (u1 - u0) * (v1 - v0); if (!b || ar < b.ar) b = { ar, ux, uz, u0, u1, v0, v1 };
    }
    if (!b) return null;
    const cu = (b.u0 + b.u1) / 2, cv2 = (b.v0 + b.v1) / 2; let hl = (b.u1 - b.u0) / 2, hw = (b.v1 - b.v0) / 2, ux = b.ux, uz = b.uz;
    const cx = cu * ux - cv2 * uz, cz = cu * uz + cv2 * ux;
    if (hw > hl) { const t = hl; hl = hw; hw = t; const nx = -uz, nz = ux; ux = nx; uz = nz; }
    return { cx, cz, ux, uz, hl, hw, ar: b.ar };
  }
  const convexe = (p) => { for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-6) return false; } return true; };
  function decaler(p, d) { // chaque sommet poussé de d vers l'extérieur (d < 0 : l'intérieur), le long de la bissectrice (onglet limité à 3)
    const n = p.length, q = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
      let e1x = b[0] - a[0], e1z = b[1] - a[1], e2x = c[0] - b[0], e2z = c[1] - b[1]; const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
      const n1x = e1z / l1, n1z = -e1x / l1, n2x = e2z / l2, n2z = -e2x / l2; let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
      const k = Math.min(3, 1 / Math.max(0.33, mx * n1x + mz * n1z)); q.push([b[0] + mx * d * k, b[1] + mz * d * k]);
    }
    return q;
  }
  function simple(p) { // pas d'auto-intersection (pour un polygone décalé)
    const n = p.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
      const o1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), o2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const o3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]), o4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
      if (((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0))) return false;
    }
    return true;
  }
  function trianguler(p) { // indices [i, j, k, …] d'un polygone simple (earcut de Three)
    try { const v = p.map((q) => new THREE.Vector2(q[0], q[1])), t = THREE.ShapeUtils.triangulateShape(v, []), out = []; for (const f of t) out.push(f[0], f[1], f[2]); return out; } catch (e) { return []; }
  }
  const H0 = (x, z) => { try { const h = monde.hauteur(x, z); return fini(h) ? h : 0; } catch (e) { return 0; } };

  // ─── un index des rues (segments) pour « quelle façade donne sur la rue ? » et l'herbe des bois ───
  let indexRues = null;
  function construireIndexRues() {
    const T = 24, G = Math.ceil(L / T) + 1, cases = new Map();
    for (const r of carte.rues || []) {
      const l = r && Array.isArray(r.l) ? r.l : null; if (!l) continue; const w = fini(+r.w) ? +r.w : 5;
      for (let i = 0; i + 1 < l.length; i++) {
        const a = l[i], b = l[i + 1]; if (!a || !b || !fini(+a[0]) || !fini(+b[0])) continue;
        const s = { ax: +a[0], az: +a[1], bx: +b[0], bz: +b[1], w };
        const i0 = Math.floor((Math.min(s.ax, s.bx) + L / 2 - w) / T), i1 = Math.floor((Math.max(s.ax, s.bx) + L / 2 + w) / T), j0 = Math.floor((Math.min(s.az, s.bz) + L / 2 - w) / T), j1 = Math.floor((Math.max(s.az, s.bz) + L / 2 + w) / T);
        for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const k = j * G + ii; let c = cases.get(k); if (!c) { c = []; cases.set(k, c); } c.push(s); }
      }
    }
    indexRues = { T, G, cases };
  }
  function distRue(x, z) { // distance au bord de la rue la plus proche (négative : sur la rue), au plus ~30 m
    if (!indexRues) return 99; const { T, G, cases } = indexRues, i = Math.floor((x + L / 2) / T), j = Math.floor((z + L / 2) / T); let m = 99;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const c = cases.get((j + dj) * G + i + di); if (c) for (const s of c) { const d = Math.sqrt(d2Seg(x, z, s.ax, s.az, s.bx, s.bz)) - s.w / 2; if (d < m) m = d; } }
    return m;
  }
  // ─── un index des bâtiments (est-on dans un autre bâtiment ? mur mitoyen) ───
  let indexBat = null;
  function construireIndexBat(bats) {
    const T = 20, G = Math.ceil(L / T) + 1, cases = new Map();
    bats.forEach((b, k) => { const [x0, z0, x1, z1] = b.aabb; for (let j = Math.floor((z0 + L / 2) / T); j <= Math.floor((z1 + L / 2) / T); j++) for (let i = Math.floor((x0 + L / 2) / T); i <= Math.floor((x1 + L / 2) / T); i++) { const c = j * G + i; let l = cases.get(c); if (!l) { l = []; cases.set(c, l); } l.push(k); } });
    indexBat = { T, G, cases, bats };
  }
  function dansBatiment(x, z, sauf) {
    if (!indexBat) return -1; const { T, G, cases, bats } = indexBat, l = cases.get(Math.floor((z + L / 2) / T) * G + Math.floor((x + L / 2) / T)); if (!l) return -1;
    for (const k of l) { if (k === sauf) continue; const b = bats[k], a = b.aabb; if (x < a[0] || x > a[2] || z < a[1] || z > a[3]) continue; if (dansPoly(b.p, x, z)) return k; }
    return -1;
  }

  // ═══════════════════════════════ le sol ═══════════════════════════════
  let sol = null, solMat = null, jupe = null, texSol = null;
  function construireSol() {
    const R = carte.relief, ok = R && R.n >= 2 && fini(+R.pas) && R.h && R.h.length >= R.n * R.n;
    const n = ok ? R.n | 0 : 2, pas = ok ? +R.pas : L, X0 = -L / 2;
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = new (n * n > 65000 ? Uint32Array : Uint16Array)((n - 1) * (n - 1) * 6);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = X0 + i * pas, z = X0 + j * pas, hv = ok ? +R.h[k] : 0;
      pos[3 * k] = x; pos[3 * k + 1] = fini(hv) ? hv : 0; pos[3 * k + 2] = z; uv[2 * k] = (x - X0) / L; uv[2 * k + 1] = 1 - (z - X0) / L;
    }
    let o = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { // la triangulation partagée : diagonale (i+1, j)–(i, j+1)
      const a = j * n + i, b = j * n + i + 1, c = (j + 1) * n + i, d = (j + 1) * n + i + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = c; idx[o++] = d; idx[o++] = b;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    solMat = new THREE.MeshLambertMaterial({ color: '#FFFFFF' });
    detailSol(solMat);
    sol = new THREE.Mesh(g, solMat); sol.receiveShadow = true; sol.name = 'sol'; scene.add(sol);
    // la jupe : le terrain continue au-delà du carré et remonte en collines, jusque dans la brume
    const per = [], X1 = L / 2;
    for (let i = 0; i < n - 1; i++) per.push([i, 0]); for (let j = 0; j < n - 1; j++) per.push([n - 1, j]); for (let i = n - 1; i > 0; i--) per.push([i, n - 1]); for (let j = n - 1; j > 0; j--) per.push([0, j]);
    const rnd = mulberry32(7), m = per.length, anneaux = [0, 70, 200, 450, 950], hauts = [0, 8, 32, 85, 150];
    const pts = per.map(([i, j]) => { const x = X0 + i * pas, z = X0 + j * pas, h = ok ? +R.h[j * n + i] : 0; return { x, z, h: fini(h) ? h : 0 }; });
    const ph = rnd() * TAU, bruit = (x, z, k) => { const a = Math.atan2(z, x); return 1 + 0.45 * Math.sin(a * 3 + ph + k) + 0.25 * Math.sin(a * 7 - ph * 2 + k * 2) + 0.12 * Math.sin(a * 17 + k * 3); };
    const cols = [lin('#A9C293'), lin('#96B48A'), lin('#8DAA91'), lin('#9DB2B6'), lin('#BCC9D3')]; // des coteaux boisés qui bleuissent au loin
    const ring = (k, a) => { const p = pts[a], d = anneaux[k]; let dx = 0, dz = 0; if (Math.abs(p.x) >= X1 - 1e-6) dx = Math.sign(p.x); if (Math.abs(p.z) >= X1 - 1e-6) dz = Math.sign(p.z); const l = Math.hypot(dx, dz) || 1; return [p.x + dx / l * d, p.h + (k ? hauts[k] * bruit(p.x, p.z, k) : -0.05), p.z + dz / l * d]; };
    const NA = anneaux.length, jp = new Float32Array(NA * m * 3), jc = new Float32Array(NA * m * 3), ji = [];
    for (let k = 0; k < NA; k++) for (let a = 0; a < m; a++) { const v = ring(k, a), o = 3 * (k * m + a); jp[o] = v[0]; jp[o + 1] = v[1]; jp[o + 2] = v[2]; jc[o] = cols[k][0]; jc[o + 1] = cols[k][1]; jc[o + 2] = cols[k][2]; }
    for (let k = 0; k < NA - 1; k++) for (let a = 0; a < m; a++) { const b = (a + 1) % m, p0 = k * m + a, p1 = k * m + b, q0 = (k + 1) * m + a, q1 = (k + 1) * m + b; ji.push(p0, p1, q1, p0, q1, q0); } // le périmètre tourne dans le sens des bâtiments : ces triangles regardent le ciel
    const gj = new THREE.BufferGeometry(); gj.setAttribute('position', new THREE.BufferAttribute(jp, 3)); gj.setAttribute('color', new THREE.BufferAttribute(jc, 3)); gj.setIndex(ji); gj.computeVertexNormals(); gj.computeBoundingSphere(); // ombrage lissé : des collines, pas des rayons
    jupe = new THREE.Mesh(gj, M.MAT.vertex); jupe.receiveShadow = false; jupe.name = 'jupe'; scene.add(jupe);
  }
  // le grain du sol, de près seulement : une texture de détail répétée tous les ~3 m (rouge : touffes d'herbe, vert : grain fin de la
  // chaussée), choisie par l'alpha de la texture du sol (0,72 sur les rues et les ponts, 1 ailleurs)
  let texGrain = null;
  function detailSol(mat) {
    texGrain = M.texture((c, w, h) => {
      const rnd = mulberry32(11), img = c.createImageData(w, h), d = img.data, n = (k) => { const a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = rnd(); for (let p = 0; p < k; p++) { const b = new Float32Array(a.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s2 = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s2 += a[((y + j + h) % h) * w + ((x + i + w) % w)]; b[y * w + x] = s2 / 9; } a.set(b); } return a; };
      const touffes = n(3), fin = n(0), doux = n(1);
      let t0 = Infinity, t1 = -Infinity; for (const v of touffes) { t0 = Math.min(t0, v); t1 = Math.max(t1, v); }
      for (let i = 0; i < w * h; i++) {
        const tf = (touffes[i] - t0) / (t1 - t0), brin = rnd() < 0.08 ? 0.25 : 0;
        d[4 * i] = 255 * Math.min(1, Math.max(0, 0.25 + tf * 0.55 + (fin[i] - 0.5) * 0.35 + brin));
        d[4 * i + 1] = 255 * Math.min(1, Math.max(0, 0.5 + (fin[i] - 0.5) * 0.45 + (doux[i] - 0.5) * 0.5 - (rnd() < 0.015 ? 0.25 : 0)));
        d[4 * i + 2] = 128; d[4 * i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }, 128, 128, { repete: [1, 1] });
    texGrain.colorSpace = THREE.NoColorSpace; texGrain.userData.partagee = true;
    const rep = Math.max(50, Math.round(L / 3.2));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrain = { value: texGrain }; sh.uniforms.rGrain = { value: rep };
      sh.fragmentShader = 'uniform sampler2D tGrain;\nuniform float rGrain;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n#ifdef USE_MAP\n{ vec4 tg = texture2D( tGrain, vMapUv * rGrain ); float pave = 1.0 - smoothstep( 0.8, 0.94, sampledDiffuseColor.a ); float g = mix( tg.r, tg.g, pave ); float k = clamp( 1.0 - length( vViewPosition ) / 70.0, 0.0, 1.0 ); diffuseColor.rgb *= mix( 1.0, 0.78 + g * 0.44, k ); diffuseColor.a = 1.0; }\n#endif');
    };
    mat.customProgramCacheKey = () => 'sol-grain';
  }
  // le sol peint : herbe nuancée par l'altitude et ombrée par le relief, végétation, eau, rues, ombres douces des maisons et des arbres
  function peindreSol(S, photo) { // photo : l'image aérienne, éclaircie, sous les rues peintes (sinon tout est peint)
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = S; const c = cvs.getContext('2d'), k = S / L, P = (v) => (v + L / 2) * k, rnd = mulberry32(3);
    const R = carte.relief, ok = !photo && R && R.n >= 2 && R.h && R.h.length >= R.n * R.n;
    c.fillStyle = '#BEDC9E'; c.fillRect(0, 0, S, S);
    if (photo) { c.drawImage(photo, 0, 0, S, S); c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgb(40,38,30)'; c.fillRect(0, 0, S, S); c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(236,234,222,.3)'; c.fillRect(0, 0, S, S); } // éclaircie et adoucie : moins de contraste, des ombres moins sales vues de près
    if (ok) { // teinte et ombrage du relief, peints petits puis agrandis (lissés)
      const n = R.n, pc = document.createElement('canvas'); pc.width = pc.height = n; const pg = pc.getContext('2d'), img = pg.createImageData(n, n);
      let h0 = Infinity, h1 = -Infinity; for (let i = 0; i < n * n; i++) { const v = +R.h[i]; if (fini(v)) { if (v < h0) h0 = v; if (v > h1) h1 = v; } }
      const bas = [184, 220, 156], hautC = [214, 222, 158], pasR = +R.pas || 10;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const hv = (q, r) => { const v = +R.h[Math.min(n - 1, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, q))]; return fini(v) ? v : 0; };
        const dx = (hv(i + 1, j) - hv(i - 1, j)) / (2 * pasR), dz = (hv(i, j + 1) - hv(i, j - 1)) / (2 * pasR), nl = Math.hypot(dx, 1, dz);
        const ec = (-dx * SOLEIL[0] + SOLEIL[1] - dz * SOLEIL[2]) / nl, om = borne(0.78 + 0.32 * ec, 0.68, 1.06), u = h1 > h0 ? (hv(i, j) - h0) / (h1 - h0) : 0;
        const o = 4 * (j * n + i); for (let q = 0; q < 3; q++) img.data[o + q] = borne((bas[q] + (hautC[q] - bas[q]) * u) * om, 0, 255); img.data[o + 3] = 255;
      }
      pg.putImageData(img, 0, 0); c.imageSmoothingEnabled = true; const cel = S / (n - 1); c.drawImage(pc, 0, 0, n, n, -cel / 2, -cel / 2, n * cel, n * cel); // le pixel i tombe sur le nœud i
    }
    const chemin = (p) => { c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(P(q[0]), P(q[1])) : c.moveTo(P(q[0]), P(q[1])))); c.closePath(); };
    const trait = (l) => { c.beginPath(); l.forEach((q, i) => (i ? c.lineTo(P(+q[0]), P(+q[1])) : c.moveTo(P(+q[0]), P(+q[1])))); };
    // un grain d'herbe
    if (!photo) for (let i = 0; i < S * S / 220; i++) { const x = rnd() * S, y = rnd() * S, r = (0.6 + rnd() * 1.4) * S / 2048; c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,230,.10)' : 'rgba(60,110,50,.09)'; c.fillRect(x, y, r * 2, r * 2); }
    const VEG = { pre: 'rgba(196,232,166,.85)', jardin: 'rgba(206,236,178,.9)', bois: 'rgba(132,186,124,.92)', vigne: 'rgba(214,218,160,.9)' };
    if (!photo) for (const v of carte.vegetation || []) {
      const p = orienter(v && v.p); if (!p) continue; chemin(p); c.fillStyle = VEG[v.t] || VEG.pre; c.fill();
      if (v.t === 'jardin') { c.save(); chemin(p); c.clip(); for (let i = 0; i < 40; i++) { const q = p[Math.floor(rnd() * p.length)], x = P(q[0]) + (rnd() - 0.5) * 40 * k, y = P(q[1]) + (rnd() - 0.5) * 40 * k; c.fillStyle = ['#FFB3C7', '#FFF1A8', '#FFFFFF', '#C7B8FF'][i % 4]; c.beginPath(); c.arc(x, y, 0.5 * k, 0, TAU); c.fill(); } c.restore(); }
      if (v.t === 'bois') { c.save(); chemin(p); c.clip(); for (let i = 0; i < 60; i++) { const q = p[Math.floor(rnd() * p.length)]; c.fillStyle = 'rgba(70,120,70,.12)'; c.beginPath(); c.arc(P(q[0]) + (rnd() - 0.5) * 60 * k, P(q[1]) + (rnd() - 0.5) * 60 * k, (3 + rnd() * 5) * k, 0, TAU); c.fill(); } c.restore(); }
    }
    // les jardins du château : une pelouse tondue en bandes
    if (!photo) for (const z of carte.interdit || []) { const p = orienter(z && z.p); if (!p) continue; c.save(); chemin(p); c.clip(); c.fillStyle = 'rgba(176,222,150,.55)'; c.fill(); c.fillStyle = 'rgba(255,255,255,.08)'; for (let x = -S; x < 2 * S; x += 8 * k) { c.save(); c.translate(x, 0); c.rotate(0.5); c.fillRect(0, -S, 4 * k, 3 * S); c.restore(); } c.restore(); }
    // l'eau : un lit bleu, des berges de sable
    for (const e of carte.eau || []) { const p = orienter(e && e.p); if (!p) continue; chemin(p); c.lineJoin = 'round'; if (!photo) { c.strokeStyle = '#E6DABA'; c.lineWidth = 3.2 * k; c.stroke(); } c.fillStyle = photo ? 'rgba(120,196,214,.55)' : '#8FCFE0'; c.fill(); }
    // les rues : bordure, chaussée, ligne blanche des routes
    const rues = (carte.rues || []).filter((r) => r && Array.isArray(r.l) && r.l.length >= 2).slice().sort((a, b) => (+a.w || 0) - (+b.w || 0));
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of rues) { if (r.t === 'chemin') continue; trait(r.l); c.strokeStyle = '#DCCDB7'; c.lineWidth = ((+r.w || 5) + 1.1) * k; c.stroke(); }
    for (const r of rues) { trait(r.l); c.strokeStyle = r.t === 'chemin' ? '#E9D9B5' : r.t === 'route' ? '#ECE6DE' : '#F5EEE3'; c.lineWidth = (+r.w || 3) * k; c.stroke(); }
    c.setLineDash([3 * k, 4 * k]); for (const r of rues) { if (r.t !== 'route') continue; trait(r.l); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 0.22 * k; c.stroke(); } c.setLineDash([]);
    // les ponts : leur tablier
    for (const p of carte.ponts || []) { if (!p || !Array.isArray(p.l) || p.l.length < 2) continue; trait(p.l); c.strokeStyle = '#E2D3BE'; c.lineWidth = ((+p.w || 6) + 1) * k; c.lineCap = 'butt'; c.stroke(); c.lineCap = 'round'; }
    // ombres douces : au pied des maisons (fausse occlusion), sous les arbres
    c.save(); c.shadowColor = 'rgba(70,60,50,.45)'; c.shadowBlur = 2.2 * k; c.fillStyle = '#C9BBA8';
    for (const b of monde.batiments || []) { chemin(b.p); c.fill(); } c.restore();
    if (!photo) for (const a of carte.arbres || []) { if (!a || !fini(+a[0])) continue; const hh = fini(+a[2]) ? +a[2] : 8, r = hh * 0.32 * k, x = P(+a[0]) - SOLEIL[0] * hh * 0.35 * k, y = P(+a[1]) - SOLEIL[2] * hh * 0.35 * k; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(40,80,40,.28)'); g.addColorStop(1, 'rgba(40,80,40,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    // le masque des surfaces pavées (alpha 0,72), lu par le shader du sol pour le grain de près
    try {
      const mk = document.createElement('canvas'); mk.width = mk.height = S; const m2 = mk.getContext('2d'); m2.lineCap = 'round'; m2.lineJoin = 'round'; m2.strokeStyle = '#000';
      const tm = (l) => { m2.beginPath(); l.forEach((q, i) => (i ? m2.lineTo(P(+q[0]), P(+q[1])) : m2.moveTo(P(+q[0]), P(+q[1])))); };
      for (const r of rues) { if (r.t === 'chemin') continue; tm(r.l); m2.lineWidth = (+r.w || 5) * k; m2.stroke(); }
      for (const p of carte.ponts || []) { if (!p || !Array.isArray(p.l) || p.l.length < 2) continue; tm(p.l); m2.lineWidth = (+p.w || 6) * k; m2.stroke(); }
      c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 0.28; c.drawImage(mk, 0, 0); c.restore();
    } catch (e) { signaler('masque des rues', e); }
    const tx = new THREE.CanvasTexture(cvs); tx.colorSpace = THREE.SRGBColorSpace; tx.userData.canvas = cvs; return tx;
  }
  function habillerSol() {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1), peint = () => { try { const S = QUAL.niveau === 'eco' ? 1024 : 2048; texSol = peindreSol(S); texSol.anisotropy = aniso; poserTexSol(texSol); solEtat = 'peint'; } catch (e) { signaler('sol peint', e); solMat.color.set('#BEDC9E'); solEtat = 'uni'; } };
    const s = carte.sol;
    if (s && (s.image || s.petite) && typeof Image !== 'undefined') {
      solEtat = 'attente'; solMat.color.set('#C9D9B0');
      const fichier = QUAL.niveau === 'eco' && s.petite ? s.petite : s.image || s.petite, img = new Image();
      img.onload = () => { try { const S = QUAL.niveau === 'eco' ? 1024 : 2048; texSol = peindreSol(S, img); texSol.anisotropy = aniso; poserTexSol(texSol); solEtat = 'photo'; } catch (e) { signaler('photo du sol', e); peint(); } };
      img.onerror = () => peint();
      img.src = dossier + fichier;
    } else peint();
  }
  function poserTexSol(tx) { const vieille = solMat.map; solMat.map = tx; solMat.color.set('#FFFFFF'); solMat.needsUpdate = true; if (vieille && vieille !== tx) vieille.dispose(); }

  // ═══════════════════════════════ les bâtiments ═══════════════════════════════
  const PAL = {
    murs: ['#F6E7CF', '#F3D9B8', '#F2CDB9', '#EFD3D8', '#F5E3A9', '#E9DFC8', '#DCE7EE', '#DDEBD6', '#E7DDF0', '#F8F0E4', '#EECBA4', '#F4DCC6'],
    tuiles: ['#E0937A', '#D6876F', '#E6A288', '#D17F6B', '#DC9176', '#CB7D6B'], ardoise: ['#8790A8', '#7D879E', '#939CB2'],
    volets: ['#8CC7B5', '#9DBBE0', '#E59A9A', '#EFD08A', '#B9A7DD', '#A6C98C', '#F2EEE6', '#7FB3C9'],
    portes: ['#9C6B53', '#7FA7C9', '#C47E6A', '#8DBB9A', '#B48FC9', '#6E8FAE'], stores: ['#FF6B8B', '#5FD3A4', '#7FB3FF', '#FFC84A', '#B8A6FF', '#FF9F5A'],
  };
  const VERRE = '#6E8EB8', VERRE_H = '#B4CDE6', CADRE = '#FBF7F0', PIERRE = '#EDE3D2', PLAT = '#D8D0C4';
  let tuiles = [], nbTuiles = 0, TUILE = 150;
  function construireBatiments() {
    const bats = (monde.batiments || []).filter((b) => b && Array.isArray(b.p) && b.p.length >= 3 && fini(b.base) && fini(b.sommet));
    construireIndexBat(bats);
    TUILE = Math.max(150, L / 4); const G = Math.ceil(L / TUILE), tg = [];
    for (let k = 0; k < G * G; k++) tg.push({ gros: new Tampon(), det: new Tampon(), x0: 0, z0: 0, x1: 0, z1: 0, n: 0 });
    const eglises = bats.filter((b) => b.t === 'eglise');
    bats.forEach((b, i) => {
      const cx = (b.aabb[0] + b.aabb[2]) / 2, cz = (b.aabb[1] + b.aabb[3]) / 2, ti = borne(Math.floor((cx + L / 2) / TUILE), 0, G - 1), tj = borne(Math.floor((cz + L / 2) / TUILE), 0, G - 1), t = tg[tj * G + ti];
      try { batiment(b, i, t.gros, t.det, eglises); t.n++; } catch (e) { signaler('bâtiment ' + i, e); }
    });
    const matDet = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    tg.forEach((t, k) => {
      if (t.gros.vide()) return;
      const g = t.gros.geometrie(), m = new THREE.Mesh(g, M.MAT.vertex); m.castShadow = true; m.receiveShadow = true; m.name = 'tuile' + k; scene.add(m);
      const bb = g.boundingBox, ti = { gros: m, det: null, x0: bb.min.x, z0: bb.min.z, x1: bb.max.x, z1: bb.max.z };
      if (!t.det.vide()) { const gd = t.det.geometrie(); ti.det = new THREE.Mesh(gd, matDet); ti.det.castShadow = false; ti.det.receiveShadow = true; ti.det.name = 'details' + k; scene.add(ti.det); }
      tuiles.push(ti);
    });
    nbTuiles = tuiles.length;
  }
  // les points d'une façade : s le long de l'arête a→b, y en hauteur, décollés de off vers l'extérieur
  function batiment(b, idx, Tg, Td, eglises) {
    const p = b.p, n = p.length, base = b.base, sommet = b.sommet, h = b.h, t = b.t || 'maison', hs = hash((b.n || '') + '|' + idx + '|' + Math.round(p[0][0] * 7) + '|' + Math.round(p[0][1] * 7));
    const A = Math.abs(aire(p)), box = obb(p), cvx = convexe(p);
    const rect = box ? A / Math.max(1e-3, 4 * box.hl * box.hw) : 0;
    const tourLike = t === 'tour' || ((t === 'eglise' || t === 'chateau') && A < 130 && h >= 13);
    let clocher = false;
    if (tourLike) { const cx = (b.aabb[0] + b.aabb[2]) / 2, cz = (b.aabb[1] + b.aabb[3]) / 2; clocher = t === 'eglise' || eglises.some((e) => e !== b && Math.hypot((e.aabb[0] + e.aabb[2]) / 2 - cx, (e.aabb[1] + e.aabb[3]) / 2 - cz) < 40); }
    // le style : couleurs, forme et pente du toit
    let mur = PAL.murs[hs % PAL.murs.length], toitC = PAL.tuiles[(hs >>> 4) % PAL.tuiles.length], forme = 'plat', pente = 0.62, volet = PAL.volets[(hs >>> 8) % PAL.volets.length];
    const ardoise = PAL.ardoise[(hs >>> 4) % PAL.ardoise.length];
    if (t === 'annexe') { mur = ['#E6D5BE', '#DCCBB4', '#EAD9C0', '#D9C9B6'][hs % 4]; volet = null; }
    if (t === 'eglise' || clocher) { mur = '#EFE6D6'; toitC = ardoise; volet = null; }
    if (t === 'chateau' || (tourLike && !clocher)) { mur = '#EDE2CF'; toitC = ardoise; volet = null; }
    if (t === 'mairie') { mur = '#F4EBDD'; toitC = ardoise; volet = '#9DBBE0'; }
    if (tourLike) { forme = 'fleche'; pente = clocher ? 1.9 : 1.25; }
    else if (t === 'eglise') { forme = rect > 0.75 ? 'deuxpans' : 'pavillon'; pente = 1.0; }
    else if (t === 'chateau') { forme = cvx && n <= 8 ? 'croupe' : 'pavillon'; pente = 1.15; }
    else if (box && rect > 0.86 && A < 400 && n <= 8) { forme = 'deuxpans'; pente = t === 'annexe' ? 0.5 : 0.62; }
    else if (box && cvx && n <= 8 && A < 900) { forme = 'croupe'; pente = t === 'mairie' ? 0.75 : 0.6; }
    else if (A < 900 || t === 'mairie') { forme = 'pavillon'; pente = 0.7; }
    const cm = lin(mur), cmB = lin(mur, 0.6), cmM = lin(mur, 0.9), parapet = forme === 'plat' ? 0.6 : 0;
    // ─── les murs : une bande sombre au pied (fausse occlusion), le reste clair ───
    const murs = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz); if (len < 1e-3) continue;
      const ux = dx / len, uz = dz / len, nx = uz, nz = -ux, ga = H0(a[0], a[1]), gc = H0(c[0], c[1]), haut = sommet + parapet;
      const ba = Math.min(haut, Math.max(ga, base) + 1.3), bc = Math.min(haut, Math.max(gc, base) + 1.3);
      Tg.quad(P3(c[0], base, c[1]), P3(a[0], base, a[1]), P3(a[0], ba, a[1]), P3(c[0], bc, c[1]), cmB, cmM);
      Tg.quad(P3(c[0], bc, c[1]), P3(a[0], ba, a[1]), P3(a[0], haut, a[1]), P3(c[0], haut, c[1]), cmM, cm);
      const mx = (a[0] + c[0]) / 2 + nx * 0.45, mz = (a[1] + c[1]) / 2 + nz * 0.45, mitoyen = dansBatiment(mx, mz, idx) >= 0 && dansBatiment(a[0] + dx * 0.25 + nx * 0.45, a[1] + dz * 0.25 + nz * 0.45, idx) >= 0;
      murs.push({ a, c, len, ux, uz, nx, nz, mitoyen, rue: mitoyen ? 99 : distRue(mx + nx * 2, mz + nz * 2) });
    }
    // ─── le toit ───
    const cT = lin(toitC), cTs = lin(toitC, 0.55), cTr = lin(toitC, 0.82);
    let fait = false;
    if (forme === 'deuxpans' || forme === 'croupe' || forme === 'fleche') fait = toitPente(Tg, p, b, box, forme, pente, cT, cTs, cTr, cm, sommet);
    if (!fait && forme === 'pavillon') fait = toitPavillon(Tg, p, sommet, pente, cT, cTs, cTr, A);
    if (!fait) toitPlat(Tg, p, sommet, parapet || 0.6, cm, lin(PLAT, (hs & 1) ? 1 : 0.94), !parapet);
    // une cheminée sur une maison sur deux
    if ((t === 'maison' || t === 'commerce') && forme !== 'plat' && box && (hs >>> 12) % 2 === 0 && A > 40) {
      const s = ((hs >>> 14) % 100) / 100 * 0.8 - 0.4, x = box.cx + box.ux * s * box.hl + (-box.uz) * box.hw * 0.35, z = box.cz + box.uz * s * box.hl + box.ux * box.hw * 0.35;
      const yb = sommet + pente * box.hw * 0.62 - 0.3, cc = lin('#E8D6C4'), ch = lin('#B88A78'); // posée sur le pan, à 35 % du faîtage
      cube(Tg, x, z, 0.55, 0.55, yb, yb + 1.25, box.ux, box.uz, cc, cc); cube(Tg, x, z, 0.68, 0.68, yb + 1.25, yb + 1.42, box.ux, box.uz, ch, ch);
    }
    // ─── les détails : portes, vitrines, fenêtres (et volets) ───
    let porte = null; // la façade sur rue : la plus proche d'une rue, à longueur égale la plus longue
    if (!tourLike || clocher) { let best = Infinity; for (const w of murs) { if (w.mitoyen || w.len < (t === 'eglise' ? 3 : 2.4)) continue; const sc = Math.max(0, w.rue) - Math.min(w.len, 10) * 0.12; if (sc < best) { best = sc; porte = w; } } }
    const fenH = t === 'chateau' || t === 'mairie' ? 1.75 : t === 'eglise' ? 3.2 : 1.3, fenW = t === 'eglise' ? 0.85 : t === 'chateau' || t === 'mairie' ? 1.0 : 0.88, etage = t === 'chateau' || t === 'mairie' ? 3.4 : 2.85;
    const cv = lin(VERRE), cvh = lin(VERRE_H), cc = lin(CADRE), cvol = volet ? lin(volet) : null, cvolB = volet ? lin(volet, 0.82) : null;
    for (const w of murs) {
      if (w.mitoyen) continue;
      const rdcPorte = w === porte;
      // la porte, la vitrine et le store des commerces
      if (rdcPorte && t === 'commerce' && w.len >= 3.5) {
        const s0 = 0.6, s1 = w.len - 0.6, g = H0(w.a[0] + w.ux * w.len / 2, w.a[1] + w.uz * w.len / 2), y0 = Math.max(g, base) + 0.3, y1 = Math.min(sommet - 0.4, y0 + 2.2);
        if (y1 - y0 > 1.2) {
          facade(Td, w, s0 - 0.12, s1 + 0.12, y0 - 0.1, y1 + 0.15, 0.03, lin('#FFFFFF'), lin('#FFFFFF'));
          facade(Td, w, s0, s1, y0, y1, 0.05, cv, cvh);
          const pc = PAL.stores[(hs >>> 10) % PAL.stores.length], ys = Math.min(sommet - 0.2, y1 + 0.7), cs = lin(pc), cb = lin('#FFFFFF'), nb = Math.max(2, Math.round((s1 - s0) / 0.6));
          for (let k = 0; k < nb; k++) { const a0 = s0 - 0.1 + (s1 - s0 + 0.2) * k / nb, a1 = s0 - 0.1 + (s1 - s0 + 0.2) * (k + 1) / nb; store(Td, w, a0, a1, ys, y1 + 0.05, 1.1, k % 2 ? cb : cs); }
        }
      } else if (rdcPorte) {
        const large = t === 'annexe' ? 2.4 : t === 'eglise' ? 2.0 : t === 'mairie' ? 1.6 : 1.0, haut = t === 'annexe' ? 2.4 : t === 'eglise' ? 3.6 : t === 'mairie' ? 2.7 : 2.15;
        const sm = w.len / 2, g = H0(w.a[0] + w.ux * sm, w.a[1] + w.uz * sm), y0 = Math.max(g, base) - 0.05, y1 = Math.min(sommet - 0.3, y0 + haut);
        if (y1 - y0 > 1.6) {
          const hp = t === 'annexe' ? '#A57A5E' : t === 'eglise' ? '#8A5E48' : PAL.portes[(hs >>> 6) % PAL.portes.length];
          facade(Td, w, sm - large / 2 - 0.14, sm + large / 2 + 0.14, y0, y1 + 0.14, 0.025, cc, cc);
          facade(Td, w, sm - large / 2, sm + large / 2, y0, y1, 0.045, lin(hp, 0.8), lin(hp));
          if (large > 1.5) facade(Td, w, sm - 0.04, sm + 0.04, y0, y1, 0.055, lin('#5E4636'), lin('#5E4636'));
        }
      }
      if (t === 'annexe' || (tourLike && !clocher)) { if (!(tourLike && w.len > 2.5)) continue; }
      // les fenêtres : tous les ~3 m, par étage
      const pasF = t === 'eglise' ? 4.2 : 3.0, nf = clocher ? (w.len >= 2.2 ? 1 : 0) : Math.floor((w.len - 0.8) / pasF); if (nf < 1) continue;
      for (let k = 0; k < nf; k++) {
        const s = (k + 0.5) * w.len / nf, g = H0(w.a[0] + w.ux * s, w.a[1] + w.uz * s), sol0 = Math.max(g, base);
        if (clocher) { // le clocher : abat-sons sous la flèche, une horloge en dessous
          if (k !== Math.floor(nf / 2)) continue;
          const yA = sommet - 3.6, ab = lin('#5D5A6E'); if (yA - sol0 < 6) continue;
          const la = Math.min(0.75, w.len * 0.3);
          facade(Td, w, s - la, s + la, yA, yA + 2.4, 0.03, lin(PIERRE, 0.85), lin(PIERRE, 0.85)); facade(Td, w, s - la + 0.15, s + la - 0.15, yA + 0.1, yA + 2.25, 0.05, ab, ab);
          for (let r = 0; r < 4; r++) facade(Td, w, s - la + 0.15, s + la - 0.15, yA + 0.3 + r * 0.5, yA + 0.42 + r * 0.5, 0.07, lin('#8F8AA0'), lin('#8F8AA0'));
          horloge(Td, w, s, yA - 1.6, Math.min(0.85, w.len * 0.32)); continue;
        }
        for (let e = 0; ; e++) {
          const y0 = sol0 + (t === 'eglise' ? 2.6 : 0.95) + e * etage, y1 = y0 + fenH; if (y1 > sommet - (t === 'eglise' ? 1.4 : 0.45)) break;
          if (e === 0 && rdcPorte && (t === 'commerce' || Math.abs(s - w.len / 2) < 1.3)) continue;
          if (t === 'eglise' && e > 0) break;
          const fw = fenW / 2;
          facade(Td, w, s - fw - 0.1, s + fw + 0.1, y0 - 0.12, y1 + 0.1, 0.02, cc, cc);
          if (t === 'eglise') { facade(Td, w, s - fw, s + fw, y0, y1, 0.04, lin('#9C8FD0'), lin('#C9B7F0')); facade(Td, w, s - 0.035, s + 0.035, y0, y1, 0.05, cc, cc); continue; }
          facade(Td, w, s - fw, s + fw, y0, y1, 0.04, cv, cvh);
          if (cvol && w.len / nf >= 1.9) { facade(Td, w, s - fw - 0.5, s - fw - 0.06, y0 - 0.05, y1 + 0.05, 0.03, cvolB, cvol); facade(Td, w, s + fw + 0.06, s + fw + 0.5, y0 - 0.05, y1 + 0.05, 0.03, cvolB, cvol); }
        }
      }
    }
  }
  // un rectangle sur la façade w : s0 → s1 le long de l'arête (depuis a), y0 → y1, décollé de off ; c0 en bas, c1 en haut
  function facade(T, w, s0, s1, y0, y1, off, c0, c1) {
    const ax = w.a[0] + w.nx * off, az = w.a[1] + w.nz * off;
    T.quad(P3(ax + w.ux * s1, y0, az + w.uz * s1), P3(ax + w.ux * s0, y0, az + w.uz * s0), P3(ax + w.ux * s0, y1, az + w.uz * s0), P3(ax + w.ux * s1, y1, az + w.uz * s1), c0, c1);
  }
  function store(T, w, s0, s1, yh, yb, prof, c) { // un pan de store incliné, de la façade (yh) vers la rue (yb), et sa face de dessous
    const ax = w.a[0] + w.nx * 0.06, az = w.a[1] + w.nz * 0.06, ox = w.nx * prof, oz = w.nz * prof;
    const a = P3(ax + w.ux * s1, yh, az + w.uz * s1), b = P3(ax + w.ux * s0, yh, az + w.uz * s0), d = P3(ax + w.ux * s1 + ox, yb, az + w.uz * s1 + oz), e = P3(ax + w.ux * s0 + ox, yb, az + w.uz * s0 + oz);
    T.quad(d, e, b, a, c); T.quad(a, b, e, d, lin('#FFFFFF', 0.7));
    T.quad(P3(d[0], yb - 0.25, d[2]), P3(e[0], yb - 0.25, e[2]), e, d, c);
  }
  function horloge(T, w, s, y, r) {
    const ax = w.a[0] + w.nx * 0.06, az = w.a[1] + w.nz * 0.06, cx = ax + w.ux * s, cz = az + w.uz * s, blanc = lin('#FFFDF5'), bord = lin('#6E6A86'), N = 14;
    for (let k = 0; k < N; k++) {
      const a0 = k * TAU / N, a1 = (k + 1) * TAU / N;
      const p0 = P3(cx + w.ux * Math.cos(a0) * r, y + Math.sin(a0) * r, cz + w.uz * Math.cos(a0) * r), p1 = P3(cx + w.ux * Math.cos(a1) * r, y + Math.sin(a1) * r, cz + w.uz * Math.cos(a1) * r);
      T.tri(cx, y, cz, p1[0], p1[1], p1[2], p0[0], p0[1], p0[2], blanc);
      const q0 = P3(cx + w.ux * Math.cos(a0) * r * 1.15 - w.nx * 0.01, y + Math.sin(a0) * r * 1.15, cz + w.uz * Math.cos(a0) * r * 1.15 - w.nz * 0.01), q1 = P3(cx + w.ux * Math.cos(a1) * r * 1.15 - w.nx * 0.01, y + Math.sin(a1) * r * 1.15, cz + w.uz * Math.cos(a1) * r * 1.15 - w.nz * 0.01);
      T.quad(q1, q0, p0, p1, bord);
    }
    const ai = { a: w.a, ux: w.ux, uz: w.uz, nx: w.nx, nz: w.nz };
    facade(T, ai, s - 0.05, s + 0.05, y, y + r * 0.75, 0.09, bord, bord); facade(T, ai, s - 0.05, s + r * 0.55, y - 0.05, y + 0.05, 0.1, bord, bord);
  }
  function cube(T, x, z, w, d, y0, y1, ux, uz, c0, c1) { // une boîte orientée (cheminées, piliers), sans dessous
    const vx = -uz, vz = ux, hw = w / 2, hd = d / 2, q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((c) => [x + ux * c[0] + vx * c[1], z + uz * c[0] + vz * c[1]]);
    if (aire(q) < 0) q.reverse();
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; T.quad(P3(b[0], y0, b[1]), P3(a[0], y0, a[1]), P3(a[0], y1, a[1]), P3(b[0], y1, b[1]), c0, c1); }
    dessus(T, q[0], q[1], q[2], y1, c1); dessus(T, q[0], q[2], q[3], y1, c1);
  }
  function triHaut(T, A, B, Cc, col) { // un triangle quelconque, tourné vers le haut
    if ((B[2] - A[2]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[2] - A[2]) < 0) T.tri(A[0], A[1], A[2], Cc[0], Cc[1], Cc[2], B[0], B[1], B[2], col); else T.tri(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2], col);
  }
  // toits à pans : chaque sommet du mur (débordé de 0,3 m) monte vers son point du faîtage ; les pignons sont des triangles de mur
  function toitPente(T, p, b, box, forme, pente, cT, cTs, cTr, cm, sommet) {
    if (!box) return false;
    const n = p.length, deb = forme === 'fleche' ? 0.25 : 0.35, ux = box.ux, uz = box.uz;
    const rh = forme === 'fleche' ? Math.max(3, 2 * box.hw * pente) : box.hw * pente;
    let r0, r1;
    if (forme === 'deuxpans') { r0 = -box.hl - deb; r1 = box.hl + deb; } else if (forme === 'croupe') { const e = Math.max(0, box.hl - box.hw); r0 = -e; r1 = e; } else { r0 = 0; r1 = 0; }
    const ext = decaler(p, deb), yE = sommet - deb * (forme === 'fleche' ? 0.6 : pente), yF = sommet + rh;
    const cx = forme === 'fleche' ? p.reduce((s, q) => s + q[0], 0) / n : box.cx, cz = forme === 'fleche' ? p.reduce((s, q) => s + q[1], 0) / n : box.cz;
    const faite = (q) => { const s = borne((q[0] - cx) * ux + (q[1] - cz) * uz, r0, r1); return [cx + ux * s, cz + uz * s, s]; };
    for (let i = 0; i < n; i++) {
      const a = ext[i], c = ext[(i + 1) % n], ra = faite(a), rc = faite(c);
      if (forme === 'deuxpans') { // un pignon : l'arête est en travers du faîtage, au bout
        const ex = p[(i + 1) % n][0] - p[i][0], ez = p[(i + 1) % n][1] - p[i][1], el = Math.hypot(ex, ez) || 1;
        if (Math.abs((ex * ux + ez * uz) / el) < 0.35 && Math.abs(ra[2] - rc[2]) < 0.5) {
          const sgn = ra[2] + rc[2] > 0 ? 1 : -1, pa = p[i], pc = p[(i + 1) % n], fx = cx + ux * sgn * box.hl, fz = cz + uz * sgn * box.hl;
          T.tri(pc[0], sommet, pc[1], pa[0], sommet, pa[1], fx, yF, fz, cm);
          continue;
        }
      }
      if (Math.abs(ra[2] - rc[2]) < 0.05) { T.tri(c[0], yE, c[1], a[0], yE, a[1], ra[0], yF, ra[1], cTr, cTr, cT); T.tri(a[0], yE, a[1], c[0], yE, c[1], ra[0], yF, ra[1], cTs); }
      else { T.quad(P3(c[0], yE, c[1]), P3(a[0], yE, a[1]), P3(ra[0], yF, ra[1]), P3(rc[0], yF, rc[1]), cTr, cT); T.quad(P3(a[0], yE, a[1]), P3(c[0], yE, c[1]), P3(rc[0], yF, rc[1]), P3(ra[0], yF, ra[1]), cTs); }
    }
    if (forme === 'fleche') { const bo = lin('#FFC84A'); T.tri(cx - 0.06, yF + 1.4, cz, cx + 0.06, yF + 1.4, cz, cx, yF - 0.2, cz, bo); T.tri(cx + 0.06, yF + 1.4, cz, cx - 0.06, yF + 1.4, cz, cx, yF - 0.2, cz, bo); T.tri(cx, yF + 1.4, cz - 0.06, cx, yF + 1.4, cz + 0.06, cx, yF - 0.2, cz, bo); T.tri(cx, yF + 1.4, cz + 0.06, cx, yF + 1.4, cz - 0.06, cx, yF - 0.2, cz, bo); }
    return true;
  }
  // toit en pavillon tronqué (formes concaves) : un bandeau en pente vers le polygone rétréci, puis un dessus plat
  function toitPavillon(T, p, sommet, pente, cT, cTs, cTr, A) {
    const n = p.length; let d = Math.min(2.6, Math.sqrt(A) * 0.22); let q = null;
    for (let essai = 0; essai < 3 && !q; essai++, d *= 0.6) { const c = decaler(p, -d); if (simple(c) && aire(c) > A * 0.08 && c.every((v) => dansPoly(p, v[0], v[1]))) q = c; }
    if (!q) return false;
    const ext = decaler(p, 0.35), dd = d, yE = sommet - 0.35 * pente, yF = sommet + dd * pente;
    for (let i = 0; i < n; i++) { const a = ext[i], c = ext[(i + 1) % n], ra = q[i], rc = q[(i + 1) % n]; T.quad(P3(c[0], yE, c[1]), P3(a[0], yE, a[1]), P3(ra[0], yF, ra[1]), P3(rc[0], yF, rc[1]), cTr, cT); T.quad(P3(a[0], yE, a[1]), P3(c[0], yE, c[1]), P3(rc[0], yF, rc[1]), P3(ra[0], yF, ra[1]), cTs); }
    const tr = trianguler(q); if (!tr.length) return false;
    for (let i = 0; i < tr.length; i += 3) dessus(T, q[tr[i]], q[tr[i + 1]], q[tr[i + 2]], yF, cT);
    return true;
  }
  function dessus(T, a, b, c, y, col) { // un triangle horizontal tourné vers le ciel
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cr > 0) T.tri(a[0], y, a[1], c[0], y, c[1], b[0], y, b[1], col); else T.tri(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], col);
  }
  function toitPlat(T, p, sommet, hp, cm, cplat, sansParapet) { // plat, avec acrotère (les murs montent déjà de hp)
    const n = p.length, tr = trianguler(p); for (let i = 0; i < tr.length; i += 3) dessus(T, p[tr[i]], p[tr[i + 1]], p[tr[i + 2]], sommet, cplat);
    if (sansParapet) return;
    const q = decaler(p, -0.25), y1 = sommet + hp, cH = lin('#F4EFE6'), ci = lin('#CFC6B8');
    for (let i = 0; i < n; i++) { const a = p[i], c = p[(i + 1) % n], ia = q[i], ic = q[(i + 1) % n]; T.quad(P3(c[0], y1, c[1]), P3(a[0], y1, a[1]), P3(ia[0], y1, ia[1]), P3(ic[0], y1, ic[1]), cH); T.quad(P3(ia[0], sommet, ia[1]), P3(ic[0], sommet, ic[1]), P3(ic[0], y1, ic[1]), P3(ia[0], y1, ia[1]), ci); }
  }

  // ═══════════════════════════════ l'eau, les ponts, les clôtures ═══════════════════════════════
  let eau = null, eauMat = null, texRides = null;
  function niveauEau(x, z) { let m = Infinity; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const h = H0(x + i * 4, z + j * 4); if (h < m) m = h; } return m + 0.35; }
  function construireEau() {
    const pos = [], uv = [];
    for (const e of carte.eau || []) {
      const p = orienter(e && e.p); if (!p) continue;
      // le relief a-t-il un lit sous ce polygone (plus bas que ses berges) ? sinon (ruisseau plus étroit que la maille) la nappe épouse le terrain
      let bord = 0, fond = Infinity; for (const q of p) bord += H0(q[0], q[1]); bord /= p.length;
      { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } for (let z = z0; z <= z1; z += 3) for (let x = x0; x <= x1; x += 3) if (dansPoly(p, x, z)) fond = Math.min(fond, H0(x, z)); }
      const lit = fond < bord - 0.6, pasMax = lit ? 14 : 3.5;
      const tr = trianguler(p); const cache = new Map(), niv = (x, z) => { const k = Math.round(x * 4) + ',' + Math.round(z * 4); let v = cache.get(k); if (v === undefined) { v = lit ? niveauEau(x, z) : H0(x, z) + 0.07; cache.set(k, v); } return v; };
      const pousser = (a, b, c, prof) => { // coupe la plus longue arête en deux tant qu'elle dépasse pasMax (pas d'explosion sur les triangles effilés)
        const lab = Math.hypot(b[0] - a[0], b[1] - a[1]), lbc = Math.hypot(c[0] - b[0], c[1] - b[1]), lca = Math.hypot(a[0] - c[0], a[1] - c[1]), lm = Math.max(lab, lbc, lca);
        if (prof < 24 && lm > pasMax) {
          if (lm === lab) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; pousser(a, m, c, prof + 1); pousser(m, b, c, prof + 1); }
          else if (lm === lbc) { const m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; pousser(a, b, m, prof + 1); pousser(a, m, c, prof + 1); }
          else { const m = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; pousser(a, b, m, prof + 1); pousser(m, b, c, prof + 1); }
          return;
        }
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), l = cr > 0 ? [a, c, b] : [a, b, c];
        for (const q of l) { pos.push(q[0], niv(q[0], q[1]), q[1]); uv.push(q[0] / 9, q[1] / 9); }
      };
      for (let i = 0; i < tr.length; i += 3) pousser(p[tr[i]], p[tr[i + 1]], p[tr[i + 2]], 0);
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); g.computeBoundingSphere();
    texRides = M.texture((c, w, h) => { // une carte de normales : des rides douces, raccordées sur les bords
      const img = c.createImageData(w, h), rnd = mulberry32(5), ondes = []; for (let k = 0; k < 9; k++) ondes.push([1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 4), rnd() * TAU, 0.4 + rnd() * 0.6]);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let dx = 0, dy = 0; for (const [fx, fy, ph, a] of ondes) { const v = Math.cos(TAU * (fx * x / w + fy * y / h) + ph) * a; dx += v * fx; dy += v * fy; }
        const l = Math.hypot(dx * 0.08, dy * 0.08, 1), o = 4 * (y * w + x); img.data[o] = 128 + 127 * (-dx * 0.08 / l); img.data[o + 1] = 128 + 127 * (-dy * 0.08 / l); img.data[o + 2] = 128 + 127 / l; img.data[o + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }, 128, 128, { repete: [1, 1] });
    texRides.colorSpace = THREE.NoColorSpace; texRides.userData.partagee = true;
    eauMat = new THREE.MeshPhongMaterial({ color: '#7CC8E8', specular: '#FFFFFF', shininess: 70, transparent: true, opacity: 0.82, normalMap: texRides, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false, emissive: '#2A6E8E', emissiveIntensity: 0.12 });
    eau = new THREE.Mesh(g, eauMat); eau.renderOrder = 2; eau.receiveShadow = false; eau.name = 'eau'; scene.add(eau);
  }
  let ponts = null, clotures = null;
  function construirePonts() {
    const parts = [];
    for (const pt of carte.ponts || []) {
      const l = pt && pt.l; if (!Array.isArray(l) || l.length < 2 || !l[0] || !l[l.length - 1]) continue;
      const ax = +l[0][0], az = +l[0][1], bx = +l[l.length - 1][0], bz = +l[l.length - 1][1]; if (![ax, az, bx, bz].every(fini)) continue;
      const len = Math.hypot(bx - ax, bz - az); if (len < 1) continue;
      const w = fini(+pt.w) && pt.w > 0 ? +pt.w : 6, hA = H0(ax, az) + 0.08, hB = H0(bx, bz) + 0.08, eauY = niveauEau((ax + bx) / 2, (az + bz) / 2) - 1.2;
      // le tablier : droit d'une rive à l'autre, mais jamais sous le terrain (les joueurs marchent à monde.hauteur : leurs pieds restent dessus)
      const N = Math.max(2, Math.ceil(len / 1.5)), prof = [];
      for (let k = 0; k <= N; k++) { const t = k / N; prof.push(Math.max(hA + (hB - hA) * t, H0(ax + (bx - ax) * t, az + (bz - az) * t) + 0.08)); }
      // la silhouette du pont dans son plan (s le long, y en hauteur) : une dalle, ou une maçonnerie creusée d'arches en plein cintre
      const sh = new THREE.Shape(), hm = Math.min(...prof), na = hm - eauY < 2.8 ? 0 : Math.max(1, Math.round(len / 15));
      sh.moveTo(0, prof[0]); for (let k = 1; k <= N; k++) sh.lineTo(len * k / N, prof[k]);
      if (!na) { for (let k = N; k >= 0; k--) sh.lineTo(len * k / N, prof[k] - 1.1); } else sh.lineTo(len, eauY);
      for (let k = na - 1; k >= 0; k--) {
        const s0 = len * k / na, s1 = len * (k + 1) / na, m = (s0 + s1) / 2, r = Math.min((s1 - s0) * 0.36, Math.max(1, hm - eauY - 1.4)), top = Math.min(hm - 1, eauY + r + 1.2);
        sh.lineTo(m + r, eauY); sh.lineTo(m + r, top - r); sh.absarc(m, top - r, r, 0, Math.PI, false); sh.lineTo(m - r, eauY);
      }
      if (na) sh.lineTo(0, eauY); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 6 });
      geo.translate(0, 0, -w / 2);
      const ang = Math.atan2(-(bz - az), bx - ax), repere = M.matrice({ x: ax, z: az, ry: ang });
      parts.push({ geo, col: '#E7DCCB', m: repere });
      // parapets (avec leur couvertine) et chaussée, tronçon par tronçon le long du profil
      for (let k = 0; k < N; k++) {
        const s0 = len * k / N, s1 = len * (k + 1) / N, y0 = prof[k], y1 = prof[k + 1], lg = Math.hypot(s1 - s0, y1 - y0), pe = Math.atan2(y1 - y0, s1 - s0), m = repere.clone().multiply(M.matrice({ x: (s0 + s1) / 2, y: (y0 + y1) / 2, rz: pe }));
        for (const sv of [-1, 1]) { parts.push({ geo: new THREE.BoxGeometry(lg + 0.02, 0.95, 0.4).translate(0, 0.47, sv * (w / 2 - 0.2)), col: '#F1E8DA', m: m.clone() }, { geo: new THREE.BoxGeometry(lg + 0.04, 0.14, 0.52).translate(0, 0.98, sv * (w / 2 - 0.2)), col: '#D9CCB8', m: m.clone() }); }
        parts.push({ geo: new THREE.BoxGeometry(lg + 0.02, 0.06, w - 0.8).translate(0, 0.03, 0), col: '#E3DED6', m });
      }
    }
    if (!parts.length) return;
    ponts = new THREE.Mesh(M.assembler(parts), M.MAT.vertex); ponts.castShadow = true; ponts.receiveShadow = true; ponts.name = 'ponts'; scene.add(ponts);
    for (const q of parts) q.geo.dispose();
    ponts.geometry.computeBoundingSphere();
  }
  function construireClotures() { // les zones interdites : un muret de pierre et ses piliers, qui suit le terrain
    const T = new Tampon(), cp = lin('#E8DCC8'), cpb = lin('#E8DCC8', 0.7), cc = lin('#F6F0E4'), cpil = lin('#DCCDB6');
    for (const z of carte.interdit || []) {
      const p = orienter(z && z.p); if (!p) continue;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), nb = Math.max(1, Math.ceil(len / 2.4));
        for (let k = 0; k < nb; k++) {
          const t0 = k / nb, t1 = (k + 1) / nb, x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
          const g0 = H0(x0, z0), g1 = H0(x1, z1), ux = (x1 - x0), uz = (z1 - z0), l = Math.hypot(ux, uz) || 1, nx = uz / l * 0.2, nz = -ux / l * 0.2, hm = 1.05;
          // les deux faces, le dessus
          T.quad(P3(x1 + nx, g1 - 0.3, z1 + nz), P3(x0 + nx, g0 - 0.3, z0 + nz), P3(x0 + nx, g0 + hm, z0 + nz), P3(x1 + nx, g1 + hm, z1 + nz), cpb, cp);
          T.quad(P3(x0 - nx, g0 - 0.3, z0 - nz), P3(x1 - nx, g1 - 0.3, z1 - nz), P3(x1 - nx, g1 + hm, z1 - nz), P3(x0 - nx, g0 + hm, z0 - nz), cpb, cp);
          const A1 = P3(x0 - nx * 1.3, g0 + hm, z0 - nz * 1.3), B1 = P3(x0 + nx * 1.3, g0 + hm, z0 + nz * 1.3), C1 = P3(x1 + nx * 1.3, g1 + hm, z1 + nz * 1.3), D1 = P3(x1 - nx * 1.3, g1 + hm, z1 - nz * 1.3);
          triHaut(T, A1, B1, C1, cc); triHaut(T, A1, C1, D1, cc);
          if (k % 2 === 0) { cube(T, x0, z0, 0.55, 0.55, g0 - 0.3, g0 + 1.45, ux / l, uz / l, cpil, cpil); cube(T, x0, z0, 0.66, 0.66, g0 + 1.45, g0 + 1.6, ux / l, uz / l, cc, cc); }
        }
      }
    }
    if (T.vide()) return; clotures = new THREE.Mesh(T.geometrie(), M.MAT.vertex); clotures.castShadow = true; clotures.receiveShadow = true; clotures.name = 'clotures'; scene.add(clotures);
  }

  // ═══════════════════════════════ les arbres et les vignes (InstancedMesh, seuls les proches sont recopiés) ═══════════════════════════════
  const ARBRES = { types: [], maj: -1, cx: 1e9, cz: 1e9 };
  function geoArbre(k, loin) { // en mètres, pour 1 m de haut (mis à l'échelle de h) ; loin : quelques dizaines de triangles
    const tronc = '#9A7058', p = [loin ? M.part(M.cylindre(0.02, 0.03, 0.45, 4), tronc) : M.part(M.cylindre(0.018, 0.03, 0.45, 6), tronc)];
    const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
    if (k === 0) { if (loin) p.push({ geo: ico(0.3), col: '#8CC97E', m: M.matrice({ y: 0.66, sy: 0.95 }) }); else p.push({ geo: ico(0.26, 1), col: '#8CC97E', m: M.matrice({ y: 0.62, sy: 0.9 }) }, { geo: ico(0.19), col: '#9BD38A', m: M.matrice({ x: 0.15, y: 0.75, z: 0.07 }) }, { geo: ico(0.18), col: '#7FBE77', m: M.matrice({ x: -0.14, y: 0.71, z: -0.07 }) }, { geo: ico(0.16), col: '#A6DA92', m: M.matrice({ x: 0.02, y: 0.87, z: -0.03 }) }); }
    else if (k === 1) { for (const [y, r, h] of loin ? [[0.28, 0.24, 0.62]] : [[0.28, 0.24, 0.36], [0.46, 0.19, 0.32], [0.62, 0.13, 0.32]]) p.push(M.part(M.cone(r, h, loin ? 5 : 7), '#6FAE86', { y })); }
    else { p.push({ geo: ico(0.3, loin ? 0 : 1), col: '#A3D48E', m: M.matrice({ y: 0.66, sy: 0.85 }) }); }
    const g = M.assembler(p); for (const q of p) if (!q.geo.userData.cache) q.geo.dispose(); return g;
  }
  function construireArbres() {
    const eaux = (carte.eau || []).map((e) => orienter(e && e.p)).filter(Boolean), listes = [[], [], []], rnd = mulberry32(17), A = carte.zones && carte.zones.arene, ac = A && Array.isArray(A.centre) ? A.centre : [0, 0], ar = A && fini(+A.rayon) ? +A.rayon : 110;
    const ajouter = (x, z, h, k) => { if (!fini(x) || !fini(z) || Math.abs(x) > L / 2 || Math.abs(z) > L / 2) return; listes[k].push([x, H0(x, z) - 0.1, z, h, rnd() * TAU, rnd()]); };
    for (const a of carte.arbres || []) { if (!a) continue; const x = +a[0], z = +a[1], h = fini(+a[2]) && a[2] > 1 ? +a[2] : 8; ajouter(x, z, h, h < 5.5 ? 2 : (hash(x + ',' + z) % 9 === 0 ? 1 : 0)); }
    // les bois : un semis sur une grille irrégulière, plus clair dans l'arène (les arbres ne bloquent ni les balles ni la vue des robots)
    let n = 0;
    for (const v of carte.vegetation || []) {
      if (!v || v.t !== 'bois') continue; const p = orienter(v.p); if (!p) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
      for (let z = z0; z <= z1; z += 7.5) for (let x = x0; x <= x1; x += 7.5) {
        if (n > 2600) break;
        const jx = x + (rnd() - 0.5) * 6, jz = z + (rnd() - 0.5) * 6, da = Math.hypot(jx - ac[0], jz - ac[1]);
        if (da < ar + 10 && rnd() < 0.55) continue;
        if (!dansPoly(p, jx, jz) || distRue(jx, jz) < 1.5 || dansBatiment(jx, jz, -1) >= 0) continue;
        if (eaux.some((q) => dansPoly(q, jx, jz))) continue;
        ajouter(jx, jz, 9 + rnd() * 9, rnd() < 0.3 ? 1 : 0); n++;
      }
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), prof = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    listes.forEach((l, k) => {
      if (!l.length) return;
      const fab = (loin) => { const im = new THREE.InstancedMesh(geoArbre(k, loin), mat, l.length); im.frustumCulled = false; im.castShadow = !loin; im.receiveShadow = false; im.customDepthMaterial = prof; im.count = 0; im.name = (loin ? 'arbres-loin' : 'arbres') + k; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(l.length * 3), 3); scene.add(im); return im; };
      const im = fab(false), imL = fab(true);
      const mats = new Float32Array(l.length * 16), cols = new Float32Array(l.length * 3), xz = new Float32Array(l.length * 2);
      l.forEach((a, i) => {
        _q.setFromAxisAngle(_Y, a[4]); _s.set(a[3] * (0.85 + a[5] * 0.3), a[3], a[3] * (0.85 + a[5] * 0.3)); _v.set(a[0], a[1], a[2]); _m.compose(_v, _q, _s); _m.toArray(mats, i * 16);
        _c.setHSL(0.25 + (a[5] - 0.5) * 0.08, 0.2, 0.92 + a[5] * 0.08); cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b; xz[i * 2] = a[0]; xz[i * 2 + 1] = a[2];
      });
      ARBRES.types.push({ im, imL, mats, cols, xz, n: l.length });
    });
    // les vignes : des rangs de 2,2 m, coupés en morceaux qui suivent le terrain
    const rangs = [];
    for (const v of carte.vegetation || []) {
      if (!v || v.t !== 'vigne') continue; const p = orienter(v.p); if (!p) continue; const box = obb(p); if (!box) continue;
      const ux = box.ux, uz = box.uz, vx = -uz, vz = ux;
      for (let o = -box.hw + 1.1; o < box.hw; o += 2.2) {
        const ox = box.cx + vx * o, oz = box.cz + vz * o, ts = []; // les entrées et sorties du rang dans le polygone
        for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], den = ux * ez - uz * ex; if (Math.abs(den) < 1e-9) continue; const t = ((a[0] - ox) * ez - (a[1] - oz) * ex) / den, u = ((a[0] - ox) * uz - (a[1] - oz) * ux) / den; if (u >= 0 && u < 1) ts.push(t); }
        ts.sort((a, b) => a - b);
        for (let k = 0; k + 1 < ts.length; k += 2) for (let s = ts[k] + 0.8; s < ts[k + 1] - 0.8; s += 10) { const e = Math.min(ts[k + 1] - 0.8, s + 10); if (e - s > 0.8) rangs.push([ox + ux * s, oz + uz * s, ox + ux * e, oz + uz * e]); }
        if (rangs.length > 1500) break;
      }
    }
    if (rangs.length) {
      const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); const cv = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < g.attributes.position.count; i++) { const hy = g.attributes.position.getY(i), c2 = lin(hy > 0.5 ? '#A2CB86' : '#7FAF6B'); cv[3 * i] = c2[0]; cv[3 * i + 1] = c2[1]; cv[3 * i + 2] = c2[2]; } g.setAttribute('color', new THREE.BufferAttribute(cv, 3));
      const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }), rangs.length); im.name = 'vignes'; im.castShadow = false;
      rangs.forEach((r, i) => { const l = Math.hypot(r[2] - r[0], r[3] - r[1]), ya = H0(r[0], r[1]), yb = H0(r[2], r[3]); _e.set(0, Math.atan2(-(r[3] - r[1]), r[2] - r[0]), Math.atan2(yb - ya, l), 'YXZ'); _q.setFromEuler(_e); _v.set((r[0] + r[2]) / 2, (ya + yb) / 2 - 0.05, (r[1] + r[3]) / 2); _s.set(l, 1.05, 0.55); _m.compose(_v, _q, _s); im.setMatrixAt(i, _m); });
      im.computeBoundingSphere(); scene.add(im);
    }
  }
  const PRES = { haute: 75, moyenne: 55, eco: 38 }; // en deçà : l'arbre détaillé (et son ombre en haute) ; au-delà : la version légère
  function majArbres(cx, cz, force) { // recopie les arbres à moins de R de la caméra (toutes les ~6 m de déplacement)
    if (!force && Math.abs(cx - ARBRES.cx) < 6 && Math.abs(cz - ARBRES.cz) < 6) return;
    ARBRES.cx = cx; ARBRES.cz = cz; const R = PALIERS[QUAL.niveau].arbres, R2 = R * R, P = PRES[QUAL.niveau] || 50, P2 = P * P;
    for (let t = 0; t < ARBRES.types.length; t++) {
      const T = ARBRES.types[t], A = T.im, B = T.imL, da = A.instanceMatrix.array, ca = A.instanceColor.array, db = B.instanceMatrix.array, cb = B.instanceColor.array; let ka = 0, kb = 0;
      for (let i = 0; i < T.n; i++) {
        const dx = T.xz[2 * i] - cx, dz = T.xz[2 * i + 1] - cz, d2 = dx * dx + dz * dz; if (d2 > R2) continue;
        if (d2 < P2) { for (let q = 0; q < 16; q++) da[ka * 16 + q] = T.mats[i * 16 + q]; ca[ka * 3] = T.cols[i * 3]; ca[ka * 3 + 1] = T.cols[i * 3 + 1]; ca[ka * 3 + 2] = T.cols[i * 3 + 2]; ka++; }
        else { for (let q = 0; q < 16; q++) db[kb * 16 + q] = T.mats[i * 16 + q]; cb[kb * 3] = T.cols[i * 3]; cb[kb * 3 + 1] = T.cols[i * 3 + 1]; cb[kb * 3 + 2] = T.cols[i * 3 + 2]; kb++; }
      }
      A.count = ka; A.visible = ka > 0; A.instanceMatrix.needsUpdate = true; A.instanceColor.needsUpdate = true;
      B.count = kb; B.visible = kb > 0; B.instanceMatrix.needsUpdate = true; B.instanceColor.needsUpdate = true;
    }
  }

  // ═══════════════════════════════ le ciel ═══════════════════════════════
  let ciel = null;
  function construireCiel() {
    const Wt = QUAL.niveau === 'eco' ? 1024 : 2048, Ht = Wt / 2;
    const tx = M.texture((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h / 2); g.addColorStop(0, '#78BFF0'); g.addColorStop(0.5, '#AEDBF7'); g.addColorStop(0.85, '#D6EAF4'); g.addColorStop(1, C.brume);
      c.fillStyle = g; c.fillRect(0, 0, w, h / 2); c.fillStyle = C.brume; c.fillRect(0, h / 2, w, h / 2);
      // le soleil, à sa vraie place (u = φ / 2π, v = θ / π)
      const th = Math.acos(SOLEIL[1]), ph = Math.atan2(SOLEIL[2], -SOLEIL[0]), sx = ((ph / TAU) % 1 + 1) % 1 * w, sy = th / Math.PI * h;
      for (const dx of [-w, 0, w]) { const gs = c.createRadialGradient(sx + dx, sy, 0, sx + dx, sy, h * 0.42); gs.addColorStop(0, 'rgba(255,248,220,.95)'); gs.addColorStop(0.06, 'rgba(255,244,214,.9)'); gs.addColorStop(0.2, 'rgba(255,232,196,.35)'); gs.addColorStop(1, 'rgba(255,230,200,0)'); c.fillStyle = gs; c.fillRect(0, 0, w, h / 2); }
      // des cumulus pastel : des grappes de boules douces (dégradés radiaux), un ventre lavande, plus petits vers l'horizon
      const rnd = mulberry32(21), boule = (x, y, r, a, col) => { const g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, `rgba(${col},${a})`); g2.addColorStop(0.55, `rgba(${col},${a * 0.85})`); g2.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
      for (let i = 0; i < 22; i++) {
        const y = h * (0.27 + rnd() * 0.17), x = rnd() * w, taille = h * 0.022 * (0.7 + rnd() * 0.8) * (0.6 + (y / h - 0.27) * 3), nb = 5 + Math.floor(rnd() * 5), large = taille * (2.2 + rnd() * 2.2);
        for (const dx of [-w, 0, w]) {
          if (x + dx < -large * 2 || x + dx > w + large * 2) continue;
          boule(x + dx, y + taille * 0.5, large * 0.9, 0.22, '200,196,230');
          for (let k = 0; k < nb; k++) { const u = k / (nb - 1) - 0.5, r = taille * (1.15 - Math.abs(u) * 0.9) * (0.85 + rnd() * 0.3); boule(x + dx + u * large * 1.6, y - r * 0.35, r * 1.25, 0.95, '255,255,255'); }
        }
      }
      // les montagnes du Bugey : trois plans de crêtes, de plus en plus pâles
      const plans = [['#CBD5EA', 0.07, 0.5, 31], ['#B9C9E0', 0.048, 0.62, 47], ['#ACC2D0', 0.027, 0.7, 63]];
      for (const [col, amp, rug, graine] of plans) {
        const r2 = mulberry32(graine), pts = 48, hs = []; for (let i = 0; i < pts; i++) hs.push(r2());
        c.fillStyle = col; c.beginPath(); c.moveTo(0, h / 2 + 2);
        for (let x = 0; x <= w; x += w / 512) { const u = x / w * pts, i = Math.floor(u), f = u - i, a = hs[i % pts], b = hs[(i + 1) % pts], s2 = f * f * (3 - 2 * f), v = a + (b - a) * s2, det = Math.sin(x / w * TAU * 23 + graine) * 0.08 * rug + Math.sin(x / w * TAU * 61) * 0.03 * rug; c.lineTo(x, h / 2 - h * amp * (0.35 + 0.65 * v + det)); }
        c.lineTo(w, h / 2 + 2); c.closePath(); c.fill();
      }
      const gb = c.createLinearGradient(0, h / 2 - h * 0.035, 0, h / 2 + 4); gb.addColorStop(0, 'rgba(226,235,238,0)'); gb.addColorStop(1, C.brume); c.fillStyle = gb; c.fillRect(0, h / 2 - h * 0.035, w, h * 0.035 + 4);
    }, Wt, Ht);
    tx.userData.partagee = true;
    const mat = new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, fog: false, depthWrite: false });
    ciel = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat); ciel.frustumCulled = false; ciel.renderOrder = -10; ciel.name = 'ciel'; scene.add(ciel);
  }

  // ═══════════════════════════════ les effets (pools) ═══════════════════════════════
  const FX = {};
  const NTRAIT = 40, NECL = 16;
  function construireEffets() {
    const P = PALIERS.haute;
    // traînées : une boîte unité le long de +z, étirée de la queue à la tête
    const gt = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    FX.traits = { im: new THREE.InstancedMesh(gt, new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, depthWrite: false }), NTRAIT), l: [] };
    for (let i = 0; i < NTRAIT; i++) FX.traits.l.push({ on: false, ox: 0, oy: 0, oz: 0, fx: 0, fy: 0, fz: 0, len: 0, age: 0, v: 240, q: 3, w: 0.05 });
    // éclairs : une étoile plate face à la caméra
    const s = new THREE.Shape(); for (let k = 0; k < 12; k++) { const a = k * TAU / 12, r = k % 2 ? 0.38 : 1; if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(r, 0); } s.closePath();
    FX.eclairs = { im: new THREE.InstancedMesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }), NECL), l: [] };
    for (let i = 0; i < NECL; i++) FX.eclairs.l.push({ on: false, x: 0, y: 0, z: 0, age: 0, r: 0, s: 0.3 });
    // impacts de peinture : une tache à lobes, en anneau (les plus vieilles sont recouvertes)
    const tache = new THREE.Shape(), rnd = mulberry32(9), NL = 9;
    for (let k = 0; k <= 36; k++) { const a = k / 36 * TAU, lobe = 1 + 0.22 * Math.max(0, Math.cos(a * NL)) ** 4 + 0.08 * Math.sin(a * 3), x = Math.cos(a) * lobe, y = Math.sin(a) * lobe; if (k) tache.lineTo(x, y); else tache.moveTo(x, y); }
    const gTache = [new THREE.ShapeGeometry(tache, 2)]; for (let k = 0; k < 5; k++) { const a = rnd() * TAU, d = 1.3 + rnd() * 0.6, r = 0.08 + rnd() * 0.12; gTache.push(new THREE.CircleGeometry(r, 7).translate(Math.cos(a) * d, Math.sin(a) * d, 0)); }
    const gT = M.assembler(gTache.map((g) => ({ geo: g, col: '#FFFFFF' }))); gTache.forEach((g) => g.dispose());
    const mT = new THREE.MeshLambertMaterial({ color: '#FFFFFF', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, depthWrite: false, transparent: true, opacity: 0.96 });
    FX.taches = { im: new THREE.InstancedMesh(gT, mT, P.splats), l: [], i: 0, n: P.splats };
    for (let i = 0; i < P.splats; i++) FX.taches.l.push({ on: false, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, rot: 0, s: 0.3, age: 9 });
    FX.taches.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(P.splats * 3), 3);
    // particules : confettis et gouttes
    const gp = new THREE.PlaneGeometry(1, 1);
    FX.parts = { im: new THREE.InstancedMesh(gp, new THREE.MeshBasicMaterial({ color: '#FFFFFF', side: THREE.DoubleSide }), P.part), l: [], i: 0, n: P.part };
    for (let i = 0; i < P.part; i++) FX.parts.l.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 1, ay: 0, az: 0, a: 0, va: 0, s: 0.1, vie: 0, age: 0, sol: false, conf: true });
    FX.parts.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(P.part * 3), 3);
    FX.traits.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NTRAIT * 3), 3);
    FX.eclairs.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NECL * 3), 3);
    // ombres rondes des personnages (sans carte d'ombre) et objets à ramasser
    const gombre = new THREE.CircleGeometry(0.5, 16).rotateX(-HP);
    FX.ombres = { im: new THREE.InstancedMesh(gombre, new THREE.MeshBasicMaterial({ color: '#3D3A55', transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 16) };
    for (const k of ['traits', 'eclairs', 'taches', 'parts', 'ombres']) { const im = FX[k].im; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.count = 0; im.visible = false; im.name = 'fx-' + k; im.renderOrder = k === 'eclairs' ? 5 : k === 'traits' ? 4 : 1; scene.add(im); }
    FX.taches.im.receiveShadow = true;
  }
  function couleurArme(id) { return AV ? AV.couleurArme(id) : '#FF6B8B'; }
  function trait(ox, oy, oz, fx, fy, fz, col, arme) {
    const T = FX.traits; let t = null; for (let i = 0; i < NTRAIT; i++) if (!T.l[i].on) { t = T.l[i]; break; } if (!t) { t = T.l[0]; let a = -1; for (let i = 0; i < NTRAIT; i++) if (T.l[i].age > a) { a = T.l[i].age; t = T.l[i]; } }
    const dx = fx - ox, dy = fy - oy, dz = fz - oz, len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (!(len > 0.2)) return;
    t.on = true; t.ox = ox; t.oy = oy; t.oz = oz; t.fx = fx; t.fy = fy; t.fz = fz; t.len = len; t.age = 0; t.col = col;
    t.v = arme === 'precision' ? 420 : arme === 'pompe' ? 170 : 230; t.q = arme === 'precision' ? 10 : arme === 'pompe' ? 1.4 : 2.8; t.w = arme === 'precision' ? 0.03 : arme === 'pompe' ? 0.026 : 0.034;
    const cl = lin(col), i = T.l.indexOf(t); T.im.instanceColor.setXYZ(i, cl[0], cl[1], cl[2]); T.im.instanceColor.needsUpdate = true;
  }
  function eclair(x, y, z, col, s) {
    const E = FX.eclairs; let e = null, k = 0; for (let i = 0; i < NECL; i++) if (!E.l[i].on) { e = E.l[i]; k = i; break; } if (!e) { e = E.l[0]; k = 0; }
    e.on = true; e.x = x; e.y = y; e.z = z; e.age = 0; e.r = (frame * 2.39996) % TAU; e.s = s || 0.32;
    const cl = lin(col); E.im.instanceColor.setXYZ(k, cl[0] * 0.45 + 0.55, cl[1] * 0.45 + 0.55, cl[2] * 0.45 + 0.55); E.im.instanceColor.needsUpdate = true;
  }
  function tache(x, y, z, nx, ny, nz, col, taille) {
    const T = FX.taches, i = T.i, t = T.l[i]; T.i = (i + 1) % T.n;
    const dec = (Math.abs(ny) > 0.7 ? 0.015 : 0.065) + (i % 4) * 0.003; // devant les fenêtres et les portes (décollées de 2 à 5 cm), en quinconce
    t.on = true; t.x = x + nx * dec; t.y = y + ny * dec; t.z = z + nz * dec; t.nx = nx; t.ny = ny; t.nz = nz; t.rot = (i * 2.39996) % TAU; t.s = taille; t.age = 0;
    const cl = lin(col), k = 0.9 + ((i * 37) % 20) / 100; T.im.instanceColor.setXYZ(i, cl[0] * k, cl[1] * k, cl[2] * k); T.im.instanceColor.needsUpdate = true;
    poserTache(i, 0.25);
  }
  function poserTache(i, k) { const t = FX.taches.l[i]; _v.set(t.nx, t.ny, t.nz); if (_v.lengthSq() < 1e-6) _v.set(0, 1, 0); _v.normalize(); _q.setFromUnitVectors(_Z, _v); _q2.setFromAxisAngle(_Z, t.rot); _q.multiply(_q2); _v2.set(t.x, t.y, t.z); const s = t.s * k; _s.set(s, s, s); _m.compose(_v2, _q, _s); FX.taches.im.setMatrixAt(i, _m); FX.taches.im.instanceMatrix.needsUpdate = true; }
  const CONF = ['#FF6B8B', '#5FD3A4', '#7FB3FF', '#FFC84A', '#B8A6FF', '#FF9F5A', '#4FD1E0', '#F48FD8', '#FFFFFF'];
  function particules(x, y, z, n, col, conf, force) {
    const P = FX.parts;
    for (let k = 0; k < n; k++) {
      const i = P.i, p = P.l[i]; P.i = (i + 1) % P.n;
      const a = (frame * 0.618 + k * 2.39996) % TAU, b = ((k * 0.7548) % 1) * 2 - 1, r = Math.sqrt(1 - b * b), v = (conf ? 2.2 + ((k * 0.381) % 1) * 3.2 : 1.6 + ((k * 0.43) % 1) * 2.2) * (force || 1);
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * r * v; p.vy = Math.abs(b) * v * (conf ? 1.1 : 0.8) + (conf ? 2.5 : 1.2); p.vz = Math.sin(a) * r * v;
      p.ax = Math.cos(a * 3.1); p.ay = 0.4; p.az = Math.sin(a * 1.7); p.a = a; p.va = (conf ? 6 : 0) + ((k * 0.29) % 1) * 9; p.s = conf ? 0.09 + ((k * 0.61) % 1) * 0.06 : 0.05 + ((k * 0.47) % 1) * 0.06; p.vie = conf ? 2.2 + ((k * 0.13) % 1) : 0.7; p.age = 0; p.sol = false; p.conf = conf;
      const cl = lin(col || CONF[(k + frame) % CONF.length]); P.im.instanceColor.setXYZ(i, cl[0], cl[1], cl[2]);
    }
    P.im.instanceColor.needsUpdate = true;
  }
  function majEffets(dt) {
    // traînées
    const T = FX.traits; let nt = 0;
    for (let i = 0; i < NTRAIT; i++) {
      const t = T.l[i]; if (!t.on) { T.im.setMatrixAt(i, ZERO); continue; }
      t.age += dt; const d = t.age * t.v, tete = Math.min(t.len, d), queue = Math.min(t.len, Math.max(0, d - t.q)); // la tête file à t.v, la queue la suit à t.q derrière
      if (queue >= t.len - 0.01 || t.age > 1.5) { t.on = false; T.im.setMatrixAt(i, ZERO); continue; }
      const k0 = queue / t.len, k1 = tete / t.len, dx = t.fx - t.ox, dy = t.fy - t.oy, dz = t.fz - t.oz;
      _v.set(t.ox + dx * k0, t.oy + dy * k0, t.oz + dz * k0); _v2.set(dx, dy, dz).normalize(); _q.setFromUnitVectors(_Z, _v2); _s.set(t.w, t.w, Math.max(0.01, (k1 - k0) * t.len)); _m.compose(_v, _q, _s); T.im.setMatrixAt(i, _m); nt = i + 1;
    }
    T.im.count = nt; T.im.visible = nt > 0; if (nt) T.im.instanceMatrix.needsUpdate = true;
    // éclairs (face à la caméra)
    const E = FX.eclairs; let ne = 0;
    for (let i = 0; i < NECL; i++) {
      const e = E.l[i]; if (e.on) { e.age += dt; if (e.age > 0.07) e.on = false; }
      if (!e.on) { E.im.setMatrixAt(i, ZERO); continue; }
      const k = e.s * (1 - e.age / 0.07 * 0.6); _q2.setFromAxisAngle(_Z, e.r); _q.copy(camera.quaternion).multiply(_q2); _v.set(e.x, e.y, e.z); _s.set(k, k, k); _m.compose(_v, _q, _s); E.im.setMatrixAt(i, _m); ne = i + 1;
    }
    E.im.count = ne; E.im.visible = ne > 0; if (ne) E.im.instanceMatrix.needsUpdate = true;
    // impacts : ils « éclosent » en 0,08 s
    const S = FX.taches; let ns = 0;
    for (let i = 0; i < S.n; i++) { const t = S.l[i]; if (!t.on) continue; ns = i + 1; if (t.age < 0.1) { t.age += dt; poserTache(i, Math.min(1, 0.25 + t.age / 0.08 * 0.85) * (t.age < 0.08 ? 1 : 1.1 - Math.min(0.1, (t.age - 0.08) * 5))); } }
    S.im.count = ns; S.im.visible = ns > 0;
    // particules : gravité, freinage (les confettis flottent), elles se posent au sol
    const P = FX.parts; let np = 0;
    for (let i = 0; i < P.n; i++) {
      const p = P.l[i]; if (!p.on) { P.im.setMatrixAt(i, ZERO); continue; }
      p.age += dt; if (p.age > p.vie) { p.on = false; P.im.setMatrixAt(i, ZERO); continue; }
      if (!p.sol) {
        const fr = p.conf ? Math.exp(-dt * 2.6) : Math.exp(-dt * 0.6); p.vx *= fr; p.vz *= fr; p.vy = p.vy * fr - (p.conf ? 5 : 13) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.a += p.va * dt;
        const g = H0(p.x, p.z) + 0.02; if (p.y < g) { p.y = g; p.sol = true; p.ax = 1; p.ay = 0; p.az = 0; p.a = -HP; }
      }
      const fin = p.vie - p.age, k = p.s * (fin < 0.3 ? fin / 0.3 : 1);
      _v2.set(p.ax, p.ay, p.az).normalize(); _q.setFromAxisAngle(_v2, p.a); _v.set(p.x, p.y, p.z); _s.set(k, p.conf ? k * 0.6 : k, k); _m.compose(_v, _q, _s); P.im.setMatrixAt(i, _m); np = i + 1;
    }
    P.im.count = np; P.im.visible = np > 0; if (np) P.im.instanceMatrix.needsUpdate = true;
  }
  let ZERO = null;

  // ═══════════════════════════════ les objets à ramasser ═══════════════════════════════
  const OBJ = { liste: [], t: -1, types: {} };
  function construireObjets() {
    const mk = (geo, n, nom) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#FFFFFF', emissiveIntensity: 0.12 }), n); im.frustumCulled = false; im.count = 0; im.visible = false; im.name = 'objet-' + nom; im.castShadow = false; scene.add(im); return im; };
    const coeur = new THREE.Shape(); coeur.moveTo(0, -0.32); coeur.bezierCurveTo(-0.5, 0.0, -0.32, 0.36, 0, 0.16); coeur.bezierCurveTo(0.32, 0.36, 0.5, 0.0, 0, -0.32);
    const gc = new THREE.ExtrudeGeometry(coeur, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 8 }); gc.center();
    const bouclier = new THREE.Shape(); bouclier.moveTo(0, 0.36); bouclier.quadraticCurveTo(0.3, 0.32, 0.32, 0.2); bouclier.quadraticCurveTo(0.32, -0.15, 0, -0.38); bouclier.quadraticCurveTo(-0.32, -0.15, -0.32, 0.2); bouclier.quadraticCurveTo(-0.3, 0.32, 0, 0.36);
    const gb = new THREE.ExtrudeGeometry(bouclier, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 }); gb.center();
    const etoile = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = HP + k * Math.PI / 5, r = k % 2 ? 0.07 : 0.16; if (k) etoile.lineTo(Math.cos(a) * r, Math.sin(a) * r); else etoile.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const ge = new THREE.ExtrudeGeometry(etoile, { depth: 0.04, bevelEnabled: false }); ge.center();
    OBJ.types.soin = mk(M.assembler([{ geo: gc, col: '#FF8FB1' }, M.part(M.boiteSimple(0.07, 0.22, 0.05), '#FFFFFF', { y: -0.09, z: 0.1 }), M.part(M.boiteSimple(0.22, 0.07, 0.05), '#FFFFFF', { y: -0.035, z: 0.1 })]), 8, 'soin');
    OBJ.types.armure = mk(M.assembler([{ geo: gb, col: '#7FB3FF' }, { geo: ge, col: '#FFC84A', m: M.matrice({ z: 0.09 }) }]), 8, 'armure');
    if (AV) { OBJ.types.pompe = mk(AV.blaster('pompe'), 8, 'pompe'); OBJ.types.precision = mk(AV.blaster('precision'), 8, 'precision'); }
    gc.dispose(); gb.dispose(); ge.dispose();
    const anneau = new THREE.RingGeometry(0.55, 0.85, 28).rotateX(-HP);
    OBJ.anneaux = new THREE.InstancedMesh(anneau, new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 16);
    OBJ.anneaux.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3); OBJ.anneaux.frustumCulled = false; OBJ.anneaux.count = 0; OBJ.anneaux.visible = false; OBJ.anneaux.name = 'objets-anneaux'; scene.add(OBJ.anneaux);
  }
  const COUL_OBJ = { pompe: '#5FD3A4', precision: '#B8A6FF', soin: '#FF8FB1', armure: '#7FB3FF' };
  function majObjets(jeu, t) {
    if (t - OBJ.t > 0.25 || OBJ.t < 0 || t < OBJ.t) { OBJ.t = t; let l = null; try { const md = jeu.mode && typeof jeu.mode.objets === 'function' ? jeu.mode : typeof PARENE !== 'undefined' && PARENE && typeof PARENE.objets === 'function' ? PARENE : null; l = md ? md.objets(jeu) : null; } catch (e) { l = null; } OBJ.liste = Array.isArray(l) ? l : []; }
    const ty = OBJ.types, TL = OBJ.liste_types || (OBJ.liste_types = Object.keys(ty).map((k) => ty[k])); for (let k = 0; k < TL.length; k++) TL[k].count = 0;
    let na = 0;
    for (let i = 0; i < OBJ.liste.length && na < 16; i++) {
      const o = OBJ.liste[i]; if (!o || !fini(+o.x) || !fini(+o.z)) continue; const x = +o.x, z = +o.z, y = H0(x, z), col = COUL_OBJ[o.objet] || '#FFFFFF';
      _v.set(x, y + 0.04, z); _q.identity(); const pulse = o.dispo ? 1 + Math.sin(t * 3 + i) * 0.06 : 0.8; _s.set(pulse, 1, pulse); _m.compose(_v, _q, _s); OBJ.anneaux.setMatrixAt(na, _m);
      const cl = lin(col), kd = o.dispo ? 0 : 0.6; OBJ.anneaux.instanceColor.setXYZ(na, cl[0] + (1 - cl[0]) * kd, cl[1] + (1 - cl[1]) * kd, cl[2] + (1 - cl[2]) * kd); na++;
      const im = ty[o.objet]; if (!im || !o.dispo || im.count >= 8) continue;
      _v.set(x, y + 1.05 + Math.sin(t * 2.2 + i) * 0.12, z); _e.set(o.objet === 'pompe' || o.objet === 'precision' ? 0.25 : 0, t * 1.6 + i, 0, 'YXZ'); _q.setFromEuler(_e); const sc = o.objet === 'pompe' || o.objet === 'precision' ? 2 : 1.5; _s.set(sc, sc, sc); _m.compose(_v, _q, _s);
      if (o.objet === 'pompe' || o.objet === 'precision') { _m2.makeTranslation(0, 0, 0.22); _m.multiply(_m2); }
      im.setMatrixAt(im.count++, _m);
    }
    OBJ.anneaux.count = na; OBJ.anneaux.visible = na > 0; OBJ.anneaux.instanceMatrix.needsUpdate = true; OBJ.anneaux.instanceColor.needsUpdate = true;
    for (let k = 0; k < TL.length; k++) { const im = TL[k]; im.visible = im.count > 0; if (im.count) im.instanceMatrix.needsUpdate = true; }
  }
  function cacherObjets() { if (OBJ.anneaux) OBJ.anneaux.visible = false; for (const k in OBJ.types) OBJ.types[k].visible = false; }
  let _m2 = null;

  // ═══════════════════════════════ la barrière de l'arène (monde.limite) ═══════════════════════════════
  let barriere = null;
  function majBarriere(cx, cz) {
    const lim = monde && monde.limite, ok = lim && Array.isArray(lim.centre) && fini(+lim.centre[0]) && fini(+lim.centre[1]) && fini(+lim.rayon) && lim.rayon > 1;
    if (!ok) { if (barriere) barriere.visible = false; return; }
    if (!(barriere && barriere.userData.x === +lim.centre[0] && barriere.userData.z === +lim.centre[1] && barriere.userData.r === +lim.rayon)) { // seulement quand la limite change (rare)
      if (barriere) { scene.remove(barriere); barriere.geometry.dispose(); }
      const N = 160, pos = [], uv = [], x0 = +lim.centre[0], z0 = +lim.centre[1], r = +lim.rayon;
      for (let i = 0; i <= N; i++) { const a = i / N * TAU, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, g = H0(x, z); pos.push(x, g - 0.6, z, x, g + 4.2, z); uv.push(i / N * r / 2.5, 0, i / N * r / 2.5, 1); }
      const idx = []; for (let i = 0; i < N; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
      if (!barriere) {
        const tx = M.texture((c, w, h) => { // un ruban : des rayures pastel nettes en bas, qui s'effacent vers le haut
          const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,214,228,.5)'); gr.addColorStop(0.5, 'rgba(255,224,236,.18)'); gr.addColorStop(1, 'rgba(255,230,240,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
          const rs = c.createLinearGradient(0, h, 0, 0); rs.addColorStop(0, 'rgba(255,120,165,.95)'); rs.addColorStop(0.3, 'rgba(255,150,190,.55)'); rs.addColorStop(0.75, 'rgba(255,170,205,0)'); c.fillStyle = rs;
          for (let x = -h; x < w + h; x += 16) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 6, h); c.lineTo(x + 6 + h, 0); c.lineTo(x + h, 0); c.fill(); }
        }, 64, 64, { repete: [1, 1] });
        tx.wrapT = THREE.ClampToEdgeWrapping; // en hauteur, pas de répétition : le haut transparent ne reprend pas le bas
        barriere = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.7 })); barriere.renderOrder = 3; barriere.name = 'barriere'; scene.add(barriere);
      } else { barriere.geometry = g; scene.add(barriere); }
      barriere.userData.x = x0; barriere.userData.z = z0; barriere.userData.r = r;
    }
    barriere.visible = true;
    const d = Math.abs(Math.hypot(cx - barriere.userData.x, cz - barriere.userData.z) - barriere.userData.r);
    barriere.material.opacity = borne(1.1 - d / 35, 0.15, 0.75); barriere.material.map.offset.x = (barriere.material.map.offset.x + 0.004) % 1;
  }

  // ═══════════════════════════════ les personnages ═══════════════════════════════
  const acteurs = new Map(); let jeuVu = null;
  function balayer(av, id) { if (av.vu !== frame) { AV.liberer(av); acteurs.delete(id); } }
  function majActeurs(jeu, idCam, dt, t, camMorte) {
    if (!AV) return;
    if (jeu !== jeuVu) { acteurs.forEach((av) => AV.liberer(av)); acteurs.clear(); jeuVu = jeu; }
    const es = jeu.entites || [], ombre = FX.ombres.im, ombres = !renderer.shadowMap.enabled; let no = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (!e || e.id == null) continue;
      let av = acteurs.get(e.id); const robot = !!(e.bot || !e.humain);
      if (av && (av.robot !== robot || (typeof e.couleur === 'string' && av.col !== e.couleur && /^#[0-9a-f]{6}$/i.test(e.couleur)))) { AV.liberer(av); acteurs.delete(e.id); av = null; }
      if (!av) { try { av = AV.creer(e); scene.add(av.groupe); acteurs.set(e.id, av); } catch (err) { signaler('avatar', err); continue; } }
      av.vu = frame;
      try { AV.animer(av, e, dt, t); } catch (err) { signaler('animer', err); }
      if (e.id === idCam && !camMorte) av.groupe.visible = false; // la vue subjective : on ne se voit pas
      if (ombres && av.groupe.visible && e.vivant !== false && no < 16 && fini(+e.x)) { const g = H0(+e.x, +e.z), hh = Math.max(0, (+e.y || 0) - g), k = 1 / (1 + hh * 0.6); _v.set(+e.x, g + 0.03, +e.z); _q.identity(); _s.set(1.2 * k, 1, 1.2 * k); _m.compose(_v, _q, _s); ombre.setMatrixAt(no++, _m); }
    }
    acteurs.forEach(balayer);
    ombre.count = no; ombre.visible = no > 0; if (no) ombre.instanceMatrix.needsUpdate = true;
  }
  function cacherActeurs() { acteurs.forEach((av) => { av.groupe.visible = false; }); if (FX.ombres) FX.ombres.im.visible = false; }
  function trouver(jeu, id) { const es = jeu && jeu.entites; if (!es) return null; for (let i = 0; i < es.length; i++) if (es[i] && es[i].id === id) return es[i]; return null; }

  // ═══════════════════════════════ l'arme en vue subjective (scène à part) ═══════════════════════════════
  const FP = { groupe: null, arme: null, mains: null, flash: null, id: 'rafale', col: '', recul: 0, phase: 0, swx: 0, swy: 0, lastYaw: 0, lastPitch: 0, change: 0, nouvelle: '', recharge: 0, flashT: 0, vit: 0, px: 0, pz: 0 };
  // les mains de la vue subjective : moufles crème, manches à la couleur du joueur (une capsule tendue entre deux points)
  function entre(geo, col, a, b) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), l = A.distanceTo(B), d = B.clone().sub(A).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); return { geo, col, m: new THREE.Matrix4().compose(A.clone().add(d.multiplyScalar(l / 2)), q, new THREE.Vector3(1, 1, 1)) }; }
  const geoMains = (col) => { const k = 'pr-mains|' + col; let g = M.GEOS.get(k); if (!g) { const gant = '#FFF3E2', manche = col, poignet = M.eclaircir(col, 0.35); g = M.assembler([
    M.part(M.sphere(0.05, 12), gant, { x: 0.0, y: -0.075, z: 0.035, sx: 1.05, sy: 1.15, sz: 1.2 }), M.part(M.sphere(0.022, 8), gant, { x: -0.035, y: -0.04, z: 0.0 }), entre(M.capsule(0.052, 0.1, 10), poignet, [0.01, -0.12, 0.07], [0.03, -0.16, 0.13]), entre(M.capsule(0.06, 0.34, 10), manche, [0.03, -0.16, 0.13], [0.12, -0.36, 0.42]),
    M.part(M.sphere(0.048, 12), gant, { x: -0.005, y: -0.03, z: -0.26, sx: 1.2, sy: 0.95, sz: 1.1 }), entre(M.capsule(0.048, 0.08, 10), poignet, [-0.03, -0.07, -0.22], [-0.07, -0.11, -0.16]), entre(M.capsule(0.056, 0.38, 10), manche, [-0.07, -0.11, -0.16], [-0.3, -0.33, 0.12])]); g.userData.cache = true; M.GEOS.set(k, g); } return g; };
  function construireArme() {
    sceneArme = new THREE.Scene(); camArme = new THREE.PerspectiveCamera(52, 2, 0.01, 6);
    hemiA = new THREE.HemisphereLight(C.cielHemi, C.solHemi, 2.1); soleilA = new THREE.DirectionalLight(C.soleil, 1.8); soleilA.position.set(-0.5, 1, 0.6); sceneArme.add(hemiA, soleilA);
    FP.groupe = new THREE.Group(); FP.groupe.scale.setScalar(0.9); sceneArme.add(FP.groupe);
    const matFP = new THREE.MeshLambertMaterial({ vertexColors: true }); // propre à cette scène (autre éclairage, pas de brume) : partager MAT.vertex ferait rechercher à Three son programme deux fois par image
    FP.arme = new THREE.Mesh(AV ? AV.blaster('rafale') : new THREE.BoxGeometry(0.08, 0.1, 0.4), matFP); FP.groupe.add(FP.arme);
    FP.mains = new THREE.Mesh(geoMains('#FFC84A'), matFP); FP.groupe.add(FP.mains);
    const s = new THREE.Shape(); for (let k = 0; k < 14; k++) { const a = k * TAU / 14, r = k % 2 ? 0.42 : 1; if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(r, 0); } s.closePath();
    FP.flash = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: '#FFF6D8', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })); FP.flash.visible = false; FP.groupe.add(FP.flash);
    FP.groupe.visible = false;
  }
  const BASE_FP = [0.27, -0.28, -0.62];
  function majArme(e, jeu, dt, t) {
    const g = FP.groupe; if (!e || e.vivant === false) { g.visible = false; return; }
    g.visible = true;
    const id = AV && AV.BOUCHE[e.arme] ? e.arme : 'rafale';
    if (id !== FP.id && FP.change <= 0) { FP.change = 0.36; FP.nouvelle = id; }
    if (FP.change > 0) { FP.change -= dt; if (FP.change <= 0.18 && FP.id !== FP.nouvelle) { FP.id = FP.nouvelle; if (AV) FP.arme.geometry = AV.blaster(FP.id); } }
    const col = typeof e.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(e.couleur) ? e.couleur : '#FFC84A'; if (col !== FP.col) { FP.col = col; FP.mains.geometry = geoMains(col); }
    // le balancement de marche, l'inertie de la visée, le recul, la recharge, le changement d'arme
    const dx = (+e.x || 0) - FP.px, dz = (+e.z || 0) - FP.pz, d = Math.sqrt(dx * dx + dz * dz); FP.px = +e.x || 0; FP.pz = +e.z || 0;
    const v = d < 3 && dt > 0 ? d / dt : 0; FP.vit += (Math.min(7, v) - FP.vit) * Math.min(1, dt * 8); const k = Math.min(1, FP.vit / (JOUEUR.vitesse || 5.2)) * (e.auSol === false ? 0.3 : 1);
    FP.phase += dt * (5 + FP.vit * 1.2);
    let dyaw = (+e.yaw || 0) - FP.lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); const dp = (+e.pitch || 0) - FP.lastPitch; FP.lastYaw = +e.yaw || 0; FP.lastPitch = +e.pitch || 0;
    FP.swx = (FP.swx + borne(dyaw, -0.2, 0.2) * 0.35) * Math.exp(-dt * 9); FP.swy = (FP.swy - borne(dp, -0.2, 0.2) * 0.35) * Math.exp(-dt * 9);
    FP.recul *= Math.exp(-dt * 13);
    let rech = 0; const fin = +e.rechargeJusqua, tj = +jeu.temps; if (fini(fin) && fini(tj) && fin > tj) { const A = REG ? REG.arme(e.arme) : null, du = A ? A.recharge : 1.6; rech = Math.sin(Math.PI * borne(1 - (fin - tj) / du, 0, 1)); }
    const ch = FP.change > 0 ? Math.sin(Math.PI * (1 - FP.change / 0.36)) : 0;
    g.position.set(BASE_FP[0] + Math.sin(FP.phase) * 0.014 * k + FP.swx * 0.12, BASE_FP[1] - Math.abs(Math.cos(FP.phase)) * 0.012 * k + FP.swy * 0.12 - rech * 0.16 - ch * 0.3 + Math.sin(t * 1.7) * 0.002, BASE_FP[2] + FP.recul * 0.07 + (e.accroupi ? 0.02 : 0));
    const gr = g.rotation; gr._x = 0.03 + FP.recul * 0.16 - rech * 0.35 + FP.swy * 0.4; gr._y = 0.05 + FP.swx * 0.6; gr._z = -0.05 + rech * 0.55 + FP.swx * 0.3; tourner(g); // champs d'Euler + quaternion (pas de mise en boîte, voir avatars.js)
    // l'éclair au bout du canon
    if (FP.flashT > 0) { FP.flashT -= dt; const b = AV ? AV.BOUCHE[FP.id] : [0, 0.07, -0.47]; FP.flash.visible = FP.flashT > 0; FP.flash.position.set(b[0], b[1], b[2] - 0.03); const s2 = 0.07 + FP.flashT * 1.4; FP.flash.scale.set(s2, s2, s2); FP.flash.rotation._z = (frame * 1.3) % TAU; tourner(FP.flash); } else FP.flash.visible = false;
  }
  function tirSubjectif(col) { FP.recul = Math.min(1.6, FP.recul + 1); FP.flashT = 0.055; const cl = lin(col); FP.flash.material.color.setRGB(cl[0] * 0.4 + 0.6, cl[1] * 0.4 + 0.6, cl[2] * 0.4 + 0.6); }
  function boucheSubjective(v) { // le bout du canon de la vue subjective, en coordonnées monde (approché : la caméra de l'arme suit la vraie)
    const b = AV ? AV.BOUCHE[FP.id] : [0, 0.07, -0.47]; v.set(BASE_FP[0] + b[0], BASE_FP[1] + b[1], BASE_FP[2] + b[2]); v.multiplyScalar(1.0); return camera.localToWorld(v);
  }

  // ═══════════════════════════════ la caméra ═══════════════════════════════
  const CAM = { oeil: JOUEUR.oeil || 1.6, phase: 0, vit: 0, px: 0, pz: 0, secousse: 0, kick: 0, morte: 0, par: null, yawM: 0, pitchM: 0, id: null, rx: 0, ry: 0, rz: 0, lx: 0, ly: 0, lz: 0, survolT: 0 };
  const SURVOL = { centre: null, rayon: 165, hauteur: 58, vitesse: 0.045 };
  function poserCameraJeu(jeu, e, dt, t) {
    const x = +e.x, y = +e.y, z = +e.z; if (!fini(x) || !fini(y) || !fini(z)) return false;
    const cible = e.accroupi ? (JOUEUR.oeilAccroupi || 1.0) : (JOUEUR.oeil || 1.6); CAM.oeil += (cible - CAM.oeil) * Math.min(1, dt * 12);
    const dx = x - CAM.px, dz = z - CAM.pz, d = Math.sqrt(dx * dx + dz * dz); CAM.px = x; CAM.pz = z; const v = d < 3 && dt > 0 ? d / dt : 0; CAM.vit += (Math.min(7, v) - CAM.vit) * Math.min(1, dt * 10);
    const k = Math.min(1, CAM.vit / (JOUEUR.vitesse || 5.2)) * (e.auSol === false ? 0 : 1); if (d < 3) CAM.phase += d * TAU / 1.5;
    CAM.secousse *= Math.exp(-dt * 7); CAM.kick *= Math.exp(-dt * 12);
    const yaw = +e.yaw || 0, pitch = borne(+e.pitch || 0, -1.45, 1.45), sh = CAM.secousse, bob = Math.sin(CAM.phase * 2) * 0.03 * k;
    if (e.vivant === false) { // éliminé : on s'élève un peu, on penche, on regarde celui qui nous a repeint
      CAM.morte = Math.min(1, CAM.morte + dt * 1.6); const m = CAM.morte, s = m * m * (3 - 2 * m);
      let yw = yaw, pt = pitch; const tueur = CAM.par != null ? trouver(jeu, CAM.par) : null;
      if (tueur && fini(+tueur.x)) { yw = Math.atan2(-(+tueur.x - x), -(+tueur.z - z)); const dd = Math.hypot(+tueur.x - x, +tueur.z - z); pt = Math.atan2((+tueur.y + 1.2) - (y + 2.4), dd); }
      CAM.yawM += Math.atan2(Math.sin(yw - CAM.yawM), Math.cos(yw - CAM.yawM)) * Math.min(1, dt * 3 * s); CAM.pitchM += (pt - 0.12 - CAM.pitchM) * Math.min(1, dt * 3 * s);
      camera.position.set(x, y + CAM.oeil + s * 1.2, z); const cr = camera.rotation; cr._x = CAM.pitchM; cr._y = CAM.yawM; cr._z = s * 0.18; tourner(camera);
      return true;
    }
    CAM.morte = 0; CAM.yawM = yaw; CAM.pitchM = pitch;
    camera.position.set(x + Math.cos(yaw) * Math.cos(CAM.phase) * 0.025 * k, y + CAM.oeil + bob + Math.sin(t * 61) * sh * 0.05, z - Math.sin(yaw) * Math.cos(CAM.phase) * 0.025 * k);
    const cr = camera.rotation; cr._x = pitch + CAM.kick * 0.012 + Math.sin(t * 53) * sh * 0.02; cr._y = yaw + Math.sin(t * 47) * sh * 0.02; cr._z = Math.sin(CAM.phase) * 0.004 * k; tourner(camera); // ordre YXZ fixé à l'init
    return true;
  }
  function poserCameraSurvol(t) {
    const A = carte.zones && carte.zones.arene, c = SURVOL.centre || (A && Array.isArray(A.centre) ? A.centre : [0, 0]), cx = +c[0] || 0, cz = +c[1] || 0;
    const a = t * SURVOL.vitesse + 0.6, r = SURVOL.rayon + Math.sin(t * 0.07) * 25, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, gc = H0(cx, cz);
    const y = Math.max(H0(x, z) + 22, gc + SURVOL.hauteur + Math.sin(t * 0.05) * 12);
    camera.position.set(x, y, z); _v.set(cx + Math.cos(a + 0.9) * 30, gc + 6, cz + Math.sin(a + 0.9) * 30); camera.lookAt(_v);
  }

  // ═══════════════════════════════ init, taille, qualité ═══════════════════════════════
  function init(canvas, carte0, monde0, opts) {
    if (!OK3 || !canvas || !carte0 || !monde0) return false;
    opts = opts || {};
    try {
      if (renderer) liberer();
      cv = canvas; carte = carte0; monde = monde0; L = fini(+carte.taille) && carte.taille > 0 ? +carte.taille : monde.L || 600;
      dossier = typeof opts.dossier === 'string' ? opts.dossier : typeof window !== 'undefined' && window.PONCIN_CARTE_DOSSIER ? window.PONCIN_CARTE_DOSSIER : 'carte/';
      try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.capture }); } catch (e) { renderer = null; return false; }
      gl = renderer.getContext(); if (!gl) { renderer = null; return false; }
      _v = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3(); _q = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); _m = new THREE.Matrix4(); _m2 = new THREE.Matrix4(); _e = new THREE.Euler(); _c = new THREE.Color(); _s = new THREE.Vector3(); _Z = new THREE.Vector3(0, 0, 1); _Y = new THREE.Vector3(0, 1, 0); ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
      // la qualité de départ : demandée, dans l'adresse, rendu logiciel → éco, sinon moyenne puis ajustée
      const dbg = gl.getExtension('WEBGL_debug_renderer_info'), nomGpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      const q = typeof location !== 'undefined' ? /[?&]qualite=(haute|moyenne|eco)/.exec(location.search) : null;
      QUAL.fixe = false;
      if (q) { QUAL.niveau = q[1]; QUAL.fixe = true; } else if (PALIERS[opts.qualite]) { QUAL.niveau = opts.qualite; QUAL.fixe = true; } else if (/SwiftShader|llvmpipe|Software/i.test(nomGpu)) { QUAL.niveau = 'eco'; QUAL.fixe = true; } else QUAL.niveau = 'moyenne';
      QUAL.gpu = nomGpu;
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.enabled = PALIERS[QUAL.niveau].ombres > 0; renderer.info.autoReset = false; renderer.autoClear = false;
      renderer.setClearColor(C.brume);
      cv.addEventListener('webglcontextlost', surPerte, false); cv.addEventListener('webglcontextrestored', surRetour, false);
      scene = new THREE.Scene(); scene.fog = new THREE.Fog(C.brume, PALIERS[QUAL.niveau].brume[0], PALIERS[QUAL.niveau].brume[1]);
      camera = new THREE.PerspectiveCamera(60, 2, 0.1, PALIERS[QUAL.niveau].brume[1] + 40); camera.rotation.order = 'YXZ'; scene.add(camera);
      hemi = new THREE.HemisphereLight(C.cielHemi, C.solHemi, 2.0);
      soleil = new THREE.DirectionalLight(C.soleil, 2.0); soleil.castShadow = true; soleil.shadow.mapSize.set(PALIERS.haute.ombres, PALIERS.haute.ombres); soleil.shadow.bias = -0.0006; soleil.shadow.normalBias = 0.04;
      const sc = soleil.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
      scene.add(hemi, soleil, soleil.target);
      const etapes = [['index des rues', construireIndexRues], ['ciel', construireCiel], ['sol', construireSol], ['bâtiments', construireBatiments], ['eau', construireEau], ['ponts', construirePonts], ['clôtures', construireClotures], ['arbres', construireArbres], ['effets', construireEffets], ['objets', construireObjets], ['arme', construireArme]];
      for (const [nom, f] of etapes) { try { f(); } catch (e) { signaler(nom, e); } }
      if (!FX.traits) return false; // sans les effets, rien ne tient : on préfère le panneau sans 3D
      try { habillerSol(); } catch (e) { signaler('habiller le sol', e); }
      webgl = true; pret = true; perdu = false; frame = 0; tPrecImage = 0;
      taille(typeof window !== 'undefined' ? window.innerWidth : 844, typeof window !== 'undefined' ? window.innerHeight : 390);
      majArbres(0, 0, true);
      return true;
    } catch (e) { signaler('init', e); pret = false; webgl = false; return false; }
  }
  function liberer() { // une seconde init : on rend tout ce qui est propre au décor précédent
    try {
      acteurs.forEach((av) => AV && AV.liberer(av)); acteurs.clear(); jeuVu = null;
      if (scene) scene.traverse((o) => { if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { if (m.map && !m.map.userData.partagee) m.map.dispose(); if (!M.MATS || ![...M.MATS.values()].includes(m)) m.dispose(); } });
      if (cv) { cv.removeEventListener('webglcontextlost', surPerte, false); cv.removeEventListener('webglcontextrestored', surRetour, false); }
      renderer.dispose();
    } catch (e) { signaler('libérer', e); }
    renderer = null; scene = null; tuiles = []; ARBRES.types = []; for (const k of Object.keys(FX)) delete FX[k]; OBJ.types = {}; OBJ.liste_types = null; OBJ.anneaux = null; barriere = null; eau = null; ciel = null; sol = null; pret = false;
  }
  function surPerte(e) { if (e && e.preventDefault) e.preventDefault(); perdu = true; }
  function surRetour() { // Three recrée son état ; on remet les textures et les programmes à jour, le décor revient tel quel
    perdu = false;
    try { const maj = (o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { m.needsUpdate = true; for (const k of ['map', 'normalMap']) if (m[k]) m[k].needsUpdate = true; } }; if (scene) scene.traverse(maj); if (sceneArme) sceneArme.traverse(maj); if (soleil && soleil.shadow.map) { soleil.shadow.map.dispose(); soleil.shadow.map = null; } ARBRES.cx = 1e9; } catch (e) { signaler('retour du contexte', e); }
  }
  function taille(w, h) {
    if (!renderer) return; w = Math.max(1, Math.round(+w || 1)); h = Math.max(1, Math.round(+h || 1)); W = w; H = h;
    DPR = Math.min(PALIERS[QUAL.niveau].dpr, (typeof window !== 'undefined' && window.devicePixelRatio) || 1); renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
    const asp = W / H; fovV = borne(2 * Math.atan(Math.tan(96 * Math.PI / 360) / asp) * 180 / Math.PI, 50, 74);
    camera.aspect = asp; camera.fov = fovV; camera.updateProjectionMatrix();
    if (camArme) { camArme.aspect = asp; camArme.fov = borne(fovV * 0.95, 48, 70); camArme.updateProjectionMatrix(); }
  }
  let brumeK = 1;
  function brume(k) { if (k === brumeK) return; brumeK = k; const p = PALIERS[QUAL.niveau]; scene.fog.near = p.brume[0] * k; scene.fog.far = p.brume[1] * k; camera.far = p.brume[1] * k + 40; camera.updateProjectionMatrix(); }
  function appliquerQualite() {
    const p = PALIERS[QUAL.niveau]; if (!renderer) return;
    taille(W, H);
    const ombres = p.ombres > 0; if (renderer.shadowMap.enabled !== ombres) { renderer.shadowMap.enabled = ombres; scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) m.needsUpdate = true; }); }
    if (!ombres && soleil.shadow.map) { soleil.shadow.map.dispose(); soleil.shadow.map = null; }
    brumeK = 0; brume(1); ARBRES.cx = 1e9;
  }
  function qualite(q) {
    if (q === undefined) return QUAL.niveau;
    if (q === 'auto') { QUAL.fixe = false; QUAL.mesures = 0; QUAL.somme = 0; return QUAL.niveau; }
    if (!PALIERS[q]) return QUAL.niveau;
    QUAL.fixe = true; if (QUAL.niveau !== q) { QUAL.niveau = q; appliquerQualite(); } return QUAL.niveau;
  }
  function changerPalier(n) { if (QUAL.niveau === n) return; QUAL.niveau = n; appliquerQualite(); }
  // fenêtres de 60 images : au-dessus de 28 ms on descend ; si ça ne va pas 10 % plus vite, c'est l'écran qui plafonne (on remonte, on se fige) ;
  // sous 18 ms pendant dix fenêtres on tente de remonter (deux échecs à un palier : on n'y retourne plus)
  function mesurer(ms) {
    if (QUAL.fixe || !(ms > 0) || ms > 250) return;
    QUAL.somme += ms; if (++QUAL.mesures < 60) return;
    const moy = QUAL.somme / QUAL.mesures; QUAL.moy = moy; QUAL.mesures = 0; QUAL.somme = 0;
    const v = QUAL.verif; QUAL.verif = null;
    if (v) { if (v.sens < 0 && moy > v.avant * 0.9) { changerPalier(v.de); QUAL.fixe = true; return; } if (v.sens > 0 && moy > 28) { QUAL.echecs[QUAL.niveau] = (QUAL.echecs[QUAL.niveau] || 0) + 1; changerPalier(v.de); QUAL.calme = 0; return; } }
    const k = ORDRE_Q.indexOf(QUAL.niveau);
    if (moy > 28 && k > 0) { QUAL.calme = 0; QUAL.verif = { de: QUAL.niveau, avant: moy, sens: -1 }; changerPalier(ORDRE_Q[k - 1]); }
    else if (moy < 18 && k < 2) { const vers = ORDRE_Q[k + 1], nE = QUAL.echecs[vers] || 0; if (nE < 2 && ++QUAL.calme >= 10 * Math.pow(6, nE)) { QUAL.calme = 0; QUAL.verif = { de: QUAL.niveau, avant: moy, sens: 1 }; changerPalier(vers); } }
    else QUAL.calme = 0;
  }

  // ═══════════════════════════════ l'image ═══════════════════════════════
  function image(jeu, idCamera, dt, t) {
    if (!pret || !renderer) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (tPrecImage) mesurer(t0 - tPrecImage); tPrecImage = t0;
    if (perdu) return; // la simulation continue ; le décor reviendra avec le contexte
    dt = fini(dt) && dt > 0 ? Math.min(dt, 0.1) : 0; t = fini(t) ? t : 0; frame++;
    const e = jeu ? trouver(jeu, idCamera) : null;
    if (e && CAM.id !== idCamera) { CAM.id = idCamera; CAM.px = +e.x || 0; CAM.pz = +e.z || 0; FP.px = CAM.px; FP.pz = CAM.pz; FP.lastYaw = +e.yaw || 0; FP.lastPitch = +e.pitch || 0; }
    let enJeu = false;
    try { enJeu = !!(e && poserCameraJeu(jeu, e, dt, t)); } catch (err) { signaler('caméra', err); }
    if (!enJeu) { try { poserCameraSurvol(t); } catch (err) { signaler('survol', err); } }
    brume(enJeu ? 1 : 1.45); // le survol voit plus loin (pas de partie à faire tourner)
    camera.updateMatrixWorld();
    const cx = camera.position.x, cz = camera.position.z;
    try { if (jeu) { majActeurs(jeu, idCamera, dt, t, !!(e && e.vivant === false)); majObjets(jeu, +jeu.temps || t); } else { cacherActeurs(); cacherObjets(); } } catch (err) { signaler('acteurs', err); }
    try { majBarriere(cx, cz); } catch (err) { signaler('barrière', err); }
    try { majEffets(dt); } catch (err) { signaler('effets', err); }
    try { majArbres(cx, cz, false); } catch (err) { signaler('arbres', err); }
    // les détails des façades : seulement les tuiles proches
    const D = PALIERS[QUAL.niveau].detail;
    for (let i = 0; i < nbTuiles; i++) { const ti = tuiles[i]; if (!ti.det) continue; const dx = cx < ti.x0 ? ti.x0 - cx : cx > ti.x1 ? cx - ti.x1 : 0, dz = cz < ti.z0 ? ti.z0 - cz : cz > ti.z1 ? cz - ti.z1 : 0; ti.det.visible = dx * dx + dz * dz < D * D; }
    // le ciel suit la caméra ; le soleil et sa carte d'ombre aussi (calée sur la grille des texels : pas de scintillement)
    if (ciel) { ciel.position.copy(camera.position); const r = camera.far * 0.92; ciel.scale.set(r, r, r); }
    if (renderer.shadowMap.enabled) {
      const px = 80 / PALIERS.haute.ombres, fx = cx - Math.sin(camera.rotation.y) * 18, fz = cz - Math.cos(camera.rotation.y) * 18, sx = Math.round(fx / px) * px, sz = Math.round(fz / px) * px, sy = H0(sx, sz);
      soleil.target.position.set(sx, sy, sz); soleil.position.set(sx + SOLEIL[0] * 160, sy + SOLEIL[1] * 160, sz + SOLEIL[2] * 160); soleil.target.updateMatrixWorld();
    } else { soleil.position.set(cx + SOLEIL[0] * 160, SOLEIL[1] * 160, cz + SOLEIL[2] * 160); soleil.target.position.set(cx, 0, cz); soleil.target.updateMatrixWorld(); }
    if (eauMat) { const o = eauMat.normalMap.offset; o.x = (t * 0.021) % 1; o.y = (t * 0.013) % 1; }
    // l'arme subjective
    const armeVis = enJeu && e && e.vivant !== false;
    try { if (armeVis) majArme(e, jeu, dt, t); else if (FP.groupe) FP.groupe.visible = false; } catch (err) { signaler('arme', err); }
    // le rendu : le monde, puis l'arme par-dessus (profondeur effacée)
    renderer.info.reset();
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    if (FP.groupe && FP.groupe.visible) { renderer.clearDepth(); renderer.render(sceneArme, camArme); }
    const fin = typeof performance !== 'undefined' ? performance.now() : 0; cpuMs = cpuMs * 0.9 + (fin - t0) * 0.1;
  }

  // ═══════════════════════════════ les événements ═══════════════════════════════
  const DERN = new Map(); // tireur → couleur de son dernier tir (pour les gouttes d'une touche)
  function evenements(evs, jeu) {
    if (!pret || !evs || !evs.length || !FX.traits) return;
    for (let i = 0; i < evs.length; i++) { const ev = evs[i]; if (!ev || !ev.t) continue; try { evenement(ev, jeu); } catch (err) { signaler('événement ' + ev.t, err); } }
  }
  function evenement(ev, jeu) {
    const idCam = CAM.id;
    switch (ev.t) {
      case 'tir': {
        const col = couleurArme(ev.arme), o = ev.o, f = ev.fin; DERN.set(ev.id, col);
        if (!Array.isArray(o) || !Array.isArray(f)) return;
        let ox = +o[0], oy = +o[1], oz = +o[2];
        const av = acteurs.get(ev.id), moi = ev.id === idCam && jeu && trouver(jeu, idCam);
        if (moi && moi.vivant !== false) { boucheSubjective(_v3); ox = _v3.x; oy = _v3.y; oz = _v3.z; if (FP.flashT <= 0.03) { tirSubjectif(col); CAM.kick = 1; } }
        else if (av && av.groupe.visible) { av.groupe.updateMatrixWorld(true); AV.bouche(av, _v3); ox = _v3.x; oy = _v3.y; oz = _v3.z; if (av.flashFrame !== frame) { av.flashFrame = frame; eclair(ox, oy, oz, col, ev.arme === 'pompe' ? 0.42 : 0.3); AV.tir(av); } }
        if (fini(ox) && fini(+f[0])) trait(ox, oy, oz, +f[0], +f[1], +f[2], col, ev.arme);
        const im = ev.impact;
        if (im && fini(+im.x) && fini(+im.y) && fini(+im.z)) {
          if (im.quoi === 'mur' || im.quoi === 'toit' || im.quoi === 'sol') { const tl = ev.arme === 'pompe' ? 0.24 : ev.arme === 'precision' ? 0.52 : 0.38; tache(+im.x, +im.y, +im.z, +im.nx || 0, fini(+im.ny) ? +im.ny : 1, +im.nz || 0, col, tl * (0.85 + ((FX.taches.i * 7) % 10) / 30)); particules(+im.x + (+im.nx || 0) * 0.05, +im.y + (+im.ny || 0) * 0.05, +im.z + (+im.nz || 0) * 0.05, ev.arme === 'pompe' ? 1 : 3, col, false, 0.7); }
          else particules(+im.x, +im.y, +im.z, 5, col, false, 0.9);
        }
        return;
      }
      case 'touche': {
        const av = acteurs.get(ev.a); if (av) AV.touche(av);
        if (ev.a === idCam) CAM.secousse = Math.min(1.2, CAM.secousse + (ev.tete ? 0.9 : 0.6));
        const e = jeu && trouver(jeu, ev.a); if (e && fini(+e.x) && ev.a !== idCam) particules(+e.x, (+e.y || 0) + (ev.tete ? 1.55 : 1.1), +e.z, ev.tete ? 9 : 6, DERN.get(ev.de) || '#FF6B8B', false, 1);
        return;
      }
      case 'mort': {
        const e = jeu && trouver(jeu, ev.a); if (ev.a === idCam) { CAM.par = ev.par != null ? ev.par : null; CAM.morte = 0; }
        if (e && fini(+e.x)) { const n = QUAL.niveau === 'eco' ? 40 : 70; particules(+e.x, (+e.y || 0) + 1.1, +e.z, n, null, true, 1); particules(+e.x, (+e.y || 0) + 1.1, +e.z, 10, e.couleur || DERN.get(ev.par), false, 1.3); }
        return;
      }
      case 'reapparition': { const e = jeu && trouver(jeu, ev.id); if (e && fini(+e.x)) particules(+e.x, (+e.y || 0) + 0.4, +e.z, 14, '#FFFFFF', true, 0.6); if (ev.id === idCam) { CAM.par = null; CAM.morte = 0; } return; }
      case 'ramasse': { const e = jeu && trouver(jeu, ev.id); if (e && fini(+e.x)) particules(+e.x, (+e.y || 0) + 1, +e.z, 12, COUL_OBJ[ev.objet] || '#FFC84A', true, 0.5); OBJ.t = -1; return; }
      default:
    }
  }

  // ═══════════════════════════════ projeter, stats ═══════════════════════════════
  const PROJ = { x: 0, y: 0, devant: false };
  function projeter(x, y, z) {
    if (!camera || !fini(+x) || !fini(+y) || !fini(+z)) return null;
    _v.set(+x, +y, +z).applyMatrix4(camera.matrixWorldInverse); PROJ.devant = _v.z < -camera.near; _v.applyMatrix4(camera.projectionMatrix);
    PROJ.x = (_v.x + 1) / 2 * W; PROJ.y = (1 - _v.y) / 2 * H; return PROJ;
  }
  function survol(o) { if (o && typeof o === 'object') { if (Array.isArray(o.centre)) SURVOL.centre = o.centre; for (const k of ['rayon', 'hauteur', 'vitesse']) if (fini(+o[k])) SURVOL[k] = +o[k]; } return SURVOL; }
  const API = {
    init, taille, image, evenements, qualite, projeter, survol,
    get fov() { return fovV; }, get webgl() { return webgl && !perdu; }, get budgets() { return BUDGETS; },
    get _interne() { return { scene, sceneArme, camera, camArme, renderer, FP, FX, CAM, tuiles, acteurs }; }, // pour l'atelier et les tests
    get stats() {
      const i = renderer ? renderer.info : null;
      return { webgl: webgl && !perdu, perdu, qualite: QUAL.niveau, fixe: QUAL.fixe, calls: i ? i.render.calls : 0, triangles: i ? i.render.triangles : 0, geometries: i ? i.memory.geometries : 0, textures: i ? i.memory.textures : 0,
        ms: Math.round((QUAL.moy || 0) * 10) / 10, cpu: Math.round(cpuMs * 100) / 100, dpr: DPR, fov: Math.round(fovV * 10) / 10, sol: solEtat, tuiles: nbTuiles, acteurs: acteurs.size, erreurs, derniereErreur, gpu: QUAL.gpu || '',
        arbres: ARBRES.types.reduce((s, T) => s + T.im.count + T.imL.count, 0), budget: BUDGETS[QUAL.niveau] };
    },
  };
  return API;
})();
if (typeof module !== 'undefined') module.exports = PRENDU;
