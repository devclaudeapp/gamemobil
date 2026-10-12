/* OPÉRATION PONCIN — le rendu 3D (Three.js r158) : le vrai Poncin en « réaliste stylisé » (matières, végétation, mobilier vrais, couleurs
   justes un peu saturées, lumière chaude de fin d'après-midi), vu à la première personne ; les personnages et les blasters restent cartoon.
   rendu.js est le chef d'orchestre du décor, construit une fois par init :
   - le sol : le relief maillé avec EXACTEMENT la triangulation de monde.hauteur (diagonale (i+1, j)–(i, j+1)), habillé de la photo aérienne
     (carte.sol.petite) et, autour de l'arène, de la photo fine carte.sol.arene fondue sans couture ; un masque peint d'après les données
     (rues, ponts, chemins, carte.surfaces, couloirs des voûtes) choisit le grain de près (PTEXTURES.solPaquet : asphalte, pavés, gravier ;
     l'herbe là où la photo est verte) et porte une fausse occlusion au pied des murs ; sans photo (carte provisoire), un sol peint ;
   - les bâtiments extrudés et fusionnés par tuiles (≤ 16 maillages, un appel de dessin chacun, + autant de maillages d'ouvertures montrés
     de près) : murs selon la matière réelle (b.mur ; église, château et tours en pierre de taille), toits selon b.toit et la teinte de la
     photo (b.teinteToit, un peu saturée), tout dans UNE texture en couches (PTEXTURES.bati : attributs uv et couche ; repli WebGL1 : les
     couleurs moyennes) ; toits à deux pans, en croupe, en pavillon tronqué ou plats à acrotère, flèches ; pied des murs assombri ;
     fenêtres, volets persiennes, portes, vitrines, abat-sons, chaînes d'angle par l'atlas PTEXTURES.details (travées n = ⌊(l − 0,6) / 3⌋,
     étages de 2,85 m, bas de fenêtre à sol + 0,87 : la règle que suivent les fenêtres fleuries de decor.js, qui recouvrent exactement les
     nôtres) ; rien sur les murs mitoyens, ni au rez-de-chaussée des façades déjà habillées par decor.js (decor.facades) ;
   - les deux passages voûtés (monde.passages : Porte Bouvent, Impasse du Bonheur) : arcade en plein cintre creusée dans les façades d'entrée
     et de sortie (le mur n'est plus dessiné dans l'ouverture ; sur une façade oblique, sa trace est une demi-ellipse), archivolte et
     piédroits de pierre de taille, voûte en berceau et murs de moellons dedans, plus sombres (un maillage à part, aux normales opposées
     au soleil : seul le ciel l'éclaire, à toutes les qualités), sol pavé et sombre ; on voit la place à travers ;
     l'arme en main s'assombrit sous la voûte ;
   - PVEGETATION (arbres LiDAR par espèce, haies, herbe) et PDECOR (mobilier, murs, enseignes et bâtiments remarquables, ambiance, horizon
     des vraies montagnes) : créés à l'init, maj(camera, t) à chaque image, qualite(q) avec la qualité adaptative, libérés avec le décor ;
   - l'eau animée, les ponts de pierre à arches, les clôtures de pierre des zones interdites, le ciel peint (dégradé chaud, halo du soleil
     bas, nuages) qui suit la caméra, une brume légère bleutée au loin qui fond avec l'horizon de PDECOR ; ombres du soleil en haute.
   Replis : sans PVEGETATION, arbres et vignes en InstancedMesh ; sans PDECOR, des collines peintes (la « jupe ») et des montagnes dans le ciel.
   Les personnages viennent de PAVATARS (avatars.js). L'arme en vue subjective est une scène à part, rendue après le monde avec clearDepth.
   Effets en pools (InstancedMesh) : traînées, éclairs, impacts de peinture orientés, particules (confettis, gouttes). Qualité haute /
   moyenne / éco (ombres seulement en haute), adaptée au temps d'image comme src/scene.js. Budgets de l'image entière (passe d'ombre
   comprise, renderer.info remis à zéro avant chaque image) : ≤ 110 / 90 / 70 appels de dessin, ≤ 300k / 200k / 120k triangles ; mémoire
   des textures ≤ 96 / 64 / 32 Mo (stats.memoire). Aucune allocation par image dans les chemins chauds (vecteurs de travail, tableaux
   préparés, champs).
   API (contrat, voir src-poncin/ARCHITECTURE.md) : init(canvas, carte, monde, { qualite, dossier }) → bool ; taille(w, h) ;
   image(jeu, idCamera, dt, t, alpha?) (jeu = null : survol de Poncin ; alpha ∈ [0, 1], 1 par défaut : chaque entité est dessinée à
   a + (x − a)·alpha, a = ax / ay / az / aoeil posés par jeu.js au début de chaque pas ; caméra de PCORPS.camera, regard = e.yaw/e.pitch
   + PCONTROLES.enAttente()) ; reglages({ balancement: 'normal' | 'doux' | 'aucun' }) → { balancement } ; evenements(evs, jeu) ; qualite(q?) ; stats ; projeter(x, y, z) → { x, y, devant }
   (objet partagé, à lire tout de suite). En plus : fov (champ vertical en degrés, lu par le HUD), webgl, survol(o) (règle le survol). */
const PRENDU = (() => {
  'use strict';
  const OK3 = typeof THREE !== 'undefined' && typeof MODELES !== 'undefined' && !!MODELES;
  const M = OK3 ? MODELES : null, TAU = Math.PI * 2, HP = Math.PI / 2;
  const REG = typeof PREGLES !== 'undefined' ? PREGLES : null, JOUEUR = REG ? REG.JOUEUR : { oeil: 1.6, oeilAccroupi: 1.0, vitesse: 5.2 };
  const AV = typeof PAVATARS !== 'undefined' ? PAVATARS : null;
  // les modules du décor « authentique » (facultatifs : sans eux, les replis d'avant)
  const PTX = typeof PTEXTURES !== 'undefined' && PTEXTURES && PTEXTURES.OK ? PTEXTURES : null;
  const PVEG = typeof PVEGETATION !== 'undefined' && PVEGETATION && PVEGETATION.OK ? PVEGETATION : null;
  const PDEC = typeof PDECOR !== 'undefined' && PDECOR && PDECOR.OK ? PDECOR : null;
  const hash = REG ? REG.hash : (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry32 = REG ? REG.mulberry32 : (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const VIDE = [];
  let erreurs = 0, derniereErreur = '';
  const tourner = (o3) => o3.quaternion.setFromEuler(o3.rotation, false); // après une écriture directe des champs d'Euler (_x, _y, _z)
  function signaler(ou, e) { erreurs++; derniereErreur = ou + ' : ' + (e && e.message ? e.message : e); try { console.warn('[rendu] ' + derniereErreur); } catch (x) { /* rien */ } }

  // ─── la qualité : trois paliers (budgets du contrat), adaptés au temps d'image mesuré ───
  // photo : la photo aérienne du carré (petite : 1024 px) ; arene : côté (px) de la photo fine de l'arène ; masque : côté du masque des
  // surfaces ; ciel : largeur de la toile du ciel ; chaines : chaînes d'angle ; arc : facettes des voûtes
  const PALIERS = {
    haute: { dpr: 2, ombres: 1024, brume: [170, 640], detail: 175, arbres: 420, splats: 120, part: 260, memoire: 96, photo: 'petite', arene: 2048, masque: 1024, ciel: 2048, chaines: true, arc: 14 },
    moyenne: { dpr: 1.5, ombres: 0, brume: [120, 430], detail: 125, arbres: 300, splats: 90, part: 200, memoire: 64, photo: 'petite', arene: 1024, masque: 1024, ciel: 1024, chaines: true, arc: 12 },
    eco: { dpr: 1, ombres: 0, brume: [80, 280], detail: 80, arbres: 210, splats: 60, part: 140, memoire: 32, photo: 'petite', arene: 1024, masque: 512, ciel: 1024, chaines: false, arc: 8 },
  };
  const BUDGETS = { haute: { calls: 110, triangles: 300000, memoire: 96 }, moyenne: { calls: 90, triangles: 200000, memoire: 64 }, eco: { calls: 70, triangles: 120000, memoire: 32 } };
  const ORDRE_Q = ['eco', 'moyenne', 'haute'];
  const QUAL = { niveau: 'moyenne', fixe: false, mesures: 0, somme: 0, calme: 0, echecs: {}, verif: null, moy: 0, ignorer: 0 };

  // ─── l'état ───
  let renderer = null, gl = null, cv = null, scene = null, camera = null, sceneArme = null, camArme = null, hemi = null, soleil = null, hemiA = null, soleilA = null;
  let carte = null, monde = null, L = 600, W = 1, H = 1, DPR = 1, pret = false, perdu = false, webgl = false, frame = 0, dossier = 'carte/';
  let fovV = 60, tPrecImage = 0, cpuMs = 0, solEtat = 'aucun', veg = null, decor = null, lumA = 1, memoireMo = 0, memoireSale = true;
  // vers le soleil : sud-ouest, bas (≈ 33°) : la lumière chaude de fin d'après-midi, des ombres longues
  const SOLEIL = (() => { const x = -0.687, y = 0.545, z = 0.481, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();
  // la lumière (choix de style) : soleil doré, ciel bleu franc, brume légère et bleutée au loin (PDECOR y fond ses montagnes)
  const C = { brume: '#D3DEE7', ciel: '#9CC8EC', solHemi: '#B59E86', cielHemi: '#D9E8FA', soleil: '#FFDDB0', iHemi: 1.75, iSoleil: 2.6 };
  // les vecteurs de travail (créés à l'init : Three peut manquer)
  let _v, _v2, _v3, _q, _q2, _m, _e, _c, _s, _Z, _Y;

  // ═══════════════════════════════ construction : outils ═══════════════════════════════
  const COUL = new Map(); // hex|k → [r, g, b] linéaires
  function lin(hex, k) { const cle = k ? hex + k : hex; let c = COUL.get(cle); if (!c) { _c.set(hex); if (k) _c.multiplyScalar(k); c = [_c.r, _c.g, _c.b]; COUL.set(cle, c); } return c; }
  // un tampon de triangles colorés (normales plates calculées à la fin) → une BufferGeometry non indexée ; tex : avec les attributs uv et
  // couche (la texture en couches de PTEXTURES.bati : u le long du mur, v en hauteur, en mètres / 3 ; couche 0 = la couleur seule)
  function Tampon(tex) { this.p = []; this.c = []; this.u = tex ? [] : null; this.k = tex ? [] : null; }
  Tampon.prototype.tri = function (ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc, uv, k) {
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    cb = cb || ca; cc = cc || ca; this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
    if (this.u) { if (uv) this.u.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]); else this.u.push(0, 0, 0, 0, 0, 0); const kk = k || 0; this.k.push(kk, kk, kk); }
  };
  // un quadrilatère a, b, c, d (dans le sens direct vu de devant) ; ca : couleur de a et b, cc : couleur de c et d
  Tampon.prototype.quad = function (a, b, c, d, ca, cc) { cc = cc || ca; this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, ca, cc); this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], ca, cc, cc); };
  // le même, une couleur par sommet, uv = [ua, va, ub, vb, uc, vc, ud, vd], k = la couche
  Tampon.prototype.quad4 = function (a, b, c, d, ca, cb, cc, cd, uv, k) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, cb, cc, uv ? [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]] : null, k);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], ca, cc, cd, uv ? [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]] : null, k);
  };
  Tampon.prototype.vide = function () { return this.p.length === 0; };
  Tampon.prototype.geometrie = function () {
    const n = this.p.length / 3, pos = new Float32Array(this.p), col = new Float32Array(this.c), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const o = i * 3, ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2], vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { nor[o + 3 * k] = nx; nor[o + 3 * k + 1] = ny; nor[o + 3 * k + 2] = nz; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.u) { g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2)); g.setAttribute('couche', new THREE.BufferAttribute(new Float32Array(this.k), 1)); }
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
  // H0 : le relief seul (le sol dessiné, les murs, l'eau, les ponts eux-mêmes) ; HS : là où l'on marche (le relief, ou la chaussée d'un
  // pont, C7) : ombres des personnages, objets, gouttes de peinture
  const H0 = (x, z) => { try { const h = monde.relief ? monde.relief(x, z) : monde.hauteur(x, z); return fini(h) ? h : 0; } catch (e) { return 0; } };
  const HS = (x, z) => { try { const h = monde.hauteur(x, z); return fini(h) ? h : 0; } catch (e) { return 0; } };

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
    bats.forEach((b, k) => { if (!b || !Array.isArray(b.aabb)) return; const [x0, z0, x1, z1] = b.aabb; for (let j = Math.floor((z0 + L / 2) / T); j <= Math.floor((z1 + L / 2) / T); j++) for (let i = Math.floor((x0 + L / 2) / T); i <= Math.floor((x1 + L / 2) / T); i++) { const c = j * G + i; let l = cases.get(c); if (!l) { l = []; cases.set(c, l); } l.push(k); } });
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
    sol = new THREE.Mesh(g, solMat); sol.receiveShadow = true; sol.name = 'sol'; scene.add(sol);
    if (decor) return; // PDECOR dessine l'horizon réel (les montagnes du Bugey) : pas de collines peintes
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
  // ─── la photo aérienne : le carré entier (carte.sol.petite), la photo fine de l'arène fondue par-dessus (bords adoucis sur 6 %), le
  // grain de près choisi par le masque des surfaces (R asphalte, G pavés, B gravier ; le reste : l'herbe là où la photo est verte,
  // l'asphalte ailleurs ; sur R et G, le vert de la photo — des couronnes vues d'avion — devient un asphalte ombragé), l'occlusion au pied
  // des murs et dans les voûtes (A du masque ; uDetail.w : la plus sombre, plus sombre sans carte d'ombre) ───
  let texArene = null, texMasque = null, texNeutre = null, texGris = null, imgSol = null, imgArene = null;
  const USOL = { tArene: { value: null }, uArene: { value: null }, uAreneK: { value: 0 }, tMasque: { value: null }, tPaquet: { value: null }, uDetail: { value: null } };
  const DETAIL_SOL = { haute: [2.3, 55, 0.8, 0.5], moyenne: [2.3, 45, 0.75, 0.32], eco: [2.3, 32, 0.7, 0.32] }; // période du grain (m), portée (m), force, occlusion la plus sombre (sans carte d'ombre, plus sombre : le sol des voûtes)
  const PHOTO = [1.14, 1.16, 1.05]; // la photo, retouchée (choix de style) : gamma, saturation, gain — un peu moins pâle, des couleurs justes
  function texPixel(r, g, b, a) { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); t.needsUpdate = true; return t; }
  function paquetSol() { let t = null; if (PTX) { try { t = PTX.solPaquet(['asphalte', 'paves', 'gravier', 'herbe']); } catch (e) { signaler('PTEXTURES.solPaquet', e); } } return t || texGris; }
  function shaderPhoto(mat) {
    if (!texNeutre) { texNeutre = texPixel(0, 0, 0, 255); texGris = texPixel(128, 128, 128, 128); }
    USOL.tArene.value = texNeutre; USOL.uArene.value = new THREE.Vector4(0, 0, 1, 0); USOL.uAreneK.value = 0;
    USOL.tMasque.value = texMasque || texNeutre; USOL.tPaquet.value = paquetSol(); USOL.uDetail.value = new THREE.Vector4(...DETAIL_SOL[QUAL.niveau]);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, USOL);
      sh.vertexShader = 'varying vec3 vSolM;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSolM = transformed;');
      sh.fragmentShader = 'uniform sampler2D tArene;\nuniform vec4 uArene;\nuniform float uAreneK;\nuniform sampler2D tMasque;\nuniform sampler2D tPaquet;\nuniform vec4 uDetail;\nvarying vec3 vSolM;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
        '#ifdef USE_MAP',
        '{',
        '\tvec3 c = texture2D( map, vMapUv ).rgb;',
        '\tvec2 ua = ( vSolM.xz - uArene.xy ) / uArene.z;',
        '\tfloat ka = uAreneK * smoothstep( 0.0, 0.06, min( min( ua.x, ua.y ), min( 1.0 - ua.x, 1.0 - ua.y ) ) );',
        '\tif ( ka > 0.0 ) c = mix( c, texture2D( tArene, vec2( ua.x, 1.0 - ua.y ) ).rgb, ka );',
        '\tc = pow( c, vec3( ' + PHOTO[0].toFixed(3) + ' ) ); c = max( mix( vec3( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ), c, ' + PHOTO[1].toFixed(3) + ' ), 0.0 ) * ' + PHOTO[2].toFixed(3) + ';',
        '\tvec4 m = texture2D( tMasque, vMapUv );',
        '\tfloat reste = clamp( 1.0 - m.r - m.g - m.b, 0.0, 1.0 ), vert = smoothstep( 0.004, 0.03, c.g - 0.5 * ( c.r + c.b ) );',
        '\tvec4 w = vec4( m.r + reste * ( 1.0 - vert ), m.g, m.b, reste * vert );',
        // sur les sols forcément durs (asphalte, parking, routes ; pavés, couloirs des voûtes), le vert de la photo est le feuillage vu d'avion
        // (les platanes de la place Xavier-Bichat) : il devient un gris d'asphalte chaud un peu plus sombre, l'ombre des arbres ; les chemins,
        // le gravier, la terre et le cimetière (bleu du masque) gardent la photo : l'herbe peut vraiment y pousser
        '\tfloat dur = clamp( m.r + m.g, 0.0, 1.0 ), lc = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );',
        '\tc = mix( c, vec3( 1.06, 1.02, 0.94 ) * max( lc * 1.25, 0.35 ), dur * vert );',
        '\tfloat f =clamp( 1.0 - length( vViewPosition ) / uDetail.y, 0.0, 1.0 ) * uDetail.z;',
        '\tc *= mix( 1.0, 2.0 * dot( w, texture2D( tPaquet, vSolM.xz / uDetail.x ) ), f ) * mix( uDetail.w, 1.0, m.a );',
        '\tdiffuseColor.rgb *= c;',
        '}',
        '#endif'].join('\n'));
    };
    mat.customProgramCacheKey = () => 'sol-photo'; mat.needsUpdate = true;
  }
  function peindreMasque(S) { // RGB : asphalte, pavés, gravier (et terre) ; A : 1 à découvert, sombre au pied des murs et sous les voûtes
    const k = S / L, P = (v) => (v + L / 2) * k;
    const mk = document.createElement('canvas'); mk.width = mk.height = S; const c = mk.getContext('2d', { willReadFrequently: true });
    const chemin = (g, p) => { g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(P(q[0]), P(q[1])) : g.moveTo(P(q[0]), P(q[1])))); g.closePath(); };
    const trait = (g, l) => { g.beginPath(); l.forEach((q, i) => (i ? g.lineTo(P(+q[0]), P(+q[1])) : g.moveTo(P(+q[0]), P(+q[1])))); };
    c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
    const TY = { asphalte: '#F00', parking: '#F00', route: '#F00', paves: '#0F0', gravier: '#00F', cimetiere: '#00F', terre: '#00F', chemin: '#00F' };
    for (const s of carte.surfaces || []) { const p = orienter(s && s.p); if (!p) continue; c.fillStyle = TY[s.t] || '#000'; chemin(c, p); c.fill(); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    const rues = (carte.rues || []).filter((r) => r && Array.isArray(r.l) && r.l.length >= 2 && r.l.every((q) => q && fini(+q[0]) && fini(+q[1]))).sort((a, b) => (+a.w || 0) - (+b.w || 0));
    for (const r of rues) { trait(c, r.l); c.strokeStyle = r.t === 'chemin' ? '#00F' : '#F00'; c.lineWidth = Math.max(1, ((+r.w || 4) + (r.t === 'chemin' ? 0 : 0.6)) * k); c.stroke(); }
    for (const p of carte.ponts || []) { if (!p || !Array.isArray(p.l) || p.l.length < 2) continue; trait(c, p.l); c.strokeStyle = '#F00'; c.lineWidth = (+p.w || 6) * k; c.stroke(); }
    const couloirs = (monde.passages || []).map((V) => { const hw = V.w / 2, [a, b] = V.l, nx = -V.u[1] * hw, nz = V.u[0] * hw; return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]; });
    c.fillStyle = '#0F0'; for (const q of couloirs) { chemin(c, q); c.fill(); } // le sol pavé des voûtes
    // l'occlusion : l'ombre douce au pied des murs, puis les couloirs des voûtes, sombres
    const oc = document.createElement('canvas'); oc.width = oc.height = S; const o = oc.getContext('2d', { willReadFrequently: true });
    o.fillStyle = '#FFF'; o.fillRect(0, 0, S, S); o.save(); o.shadowColor = 'rgba(0,0,0,.62)'; o.shadowBlur = Math.max(2, 2.2 * k); o.fillStyle = '#000';
    for (const b of monde.batiments || []) { if (b && b.p) { chemin(o, b.p); o.fill(); } } o.restore();
    o.fillStyle = 'rgb(15,15,15)'; for (const q of couloirs) { chemin(o, q); o.fill(); } // presque noir : le soleil n'entre pas sous la voûte (en moyenne et en éco, sans carte d'ombre, c'est cette occlusion qui l'assombrit)
    const dm = c.getImageData(0, 0, S, S).data, dA = o.getImageData(0, 0, S, S).data, d = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) { const ls = (S - 1 - y) * S * 4, ld = y * S * 4; for (let x = 0; x < S * 4; x += 4) { d[ld + x] = dm[ls + x]; d[ld + x + 1] = dm[ls + x + 1]; d[ld + x + 2] = dm[ls + x + 2]; d[ld + x + 3] = dA[ls + x]; } } // ligne du bas d'abord (v = 0 au sud)
    const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; t.name = 'masque-sol';
    return t;
  }
  function poserArene(img, aniso) { // la texture de la photo fine, à la taille du palier (réduite sur une toile au besoin)
    const S = PALIERS[QUAL.niveau].arene; let tx;
    if (img.width > S) { const c2 = document.createElement('canvas'); c2.width = c2.height = S; const g = c2.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, S, S); tx = new THREE.CanvasTexture(c2); } else tx = new THREE.Texture(img);
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = aniso; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.name = 'photo-arene'; tx.needsUpdate = true;
    if (texArene) texArene.dispose(); texArene = tx; USOL.tArene.value = tx; memoireSale = true;
  }
  function adapterResolutions() { // après un changement de qualité : la photo de l'arène, le masque du sol et le ciel prennent la taille du palier (mémoire)
    const P = PALIERS[QUAL.niveau], aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
    try { if (texArene && imgArene && imgArene.complete && imgArene.width && (texArene.image.width || 0) !== Math.min(P.arene, imgArene.width)) poserArene(imgArene, aniso); } catch (e) { signaler('photo de l’arène', e); }
    try { if (texMasque && texMasque.image.width !== P.masque) { const t = peindreMasque(P.masque); texMasque.dispose(); texMasque = t; USOL.tMasque.value = t; } } catch (e) { signaler('masque du sol', e); }
    try { if (ciel && ciel.material.map && ciel.material.map.image.width !== P.ciel) { scene.remove(ciel); ciel.geometry.dispose(); ciel.material.map.dispose(); ciel.material.dispose(); ciel = null; construireCiel(); } } catch (e) { signaler('ciel', e); }
    memoireSale = true;
  }
  function chargerArene(aniso, fin) { // la photo fine de l'arène (≈ 0,2 m/px), réduite selon la qualité
    const a = carte.sol && carte.sol.arene;
    if (!a || typeof a.image !== 'string' || !Array.isArray(a.centre) || !fini(+a.centre[0]) || !fini(+a.centre[1]) || !(+a.taille > 0)) { fin(); return; }
    const img = new Image(); imgArene = img;
    img.onload = () => {
      if (img !== imgArene || !solMat) return;
      try { poserArene(img, aniso); USOL.uArene.value.set(+a.centre[0] - a.taille / 2, +a.centre[1] - a.taille / 2, +a.taille, 0); USOL.uAreneK.value = 1; }
      catch (e) { signaler('photo de l’arène', e); }
      fin();
    };
    img.onerror = () => { if (img === imgArene) fin(); };
    img.src = dossier + a.image;
  }
  function habillerSol() {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
    const peint = () => { try { detailSol(solMat); const S = QUAL.niveau === 'eco' ? 1024 : 2048; texSol = peindreSol(S); texSol.anisotropy = aniso; poserTexSol(texSol); solEtat = 'peint'; } catch (e) { signaler('sol peint', e); solMat.color.set('#BEDC9E'); solEtat = 'uni'; } };
    const s = carte.sol, nom = s && typeof (s[PALIERS[QUAL.niveau].photo] || s.petite || s.image) === 'string' ? s[PALIERS[QUAL.niveau].photo] || s.petite || s.image : null;
    if (nom && typeof Image !== 'undefined') {
      solEtat = 'attente'; solMat.color.set('#B9BFA6');
      try { texMasque = peindreMasque(PALIERS[QUAL.niveau].masque); } catch (e) { signaler('masque du sol', e); texMasque = null; }
      shaderPhoto(solMat);
      const img = new Image(); imgSol = img;
      img.onload = () => {
        if (img !== imgSol || !solMat) return;
        try { const tx = new THREE.Texture(img); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = aniso; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.name = 'photo-sol'; tx.needsUpdate = true; texSol = tx; poserTexSol(tx); memoireSale = true; }
        catch (e) { signaler('photo du sol', e); peint(); return; }
        chargerArene(aniso, () => { if (img === imgSol) solEtat = 'photo'; });
      };
      img.onerror = () => { if (img === imgSol) peint(); };
      img.src = dossier + nom;
    } else peint();
  }
  function poserTexSol(tx) { const vieille = solMat.map; solMat.map = tx; solMat.color.set('#FFFFFF'); solMat.needsUpdate = true; if (vieille && vieille !== tx) vieille.dispose(); memoireSale = true; }

  // ═══════════════════════════════ les bâtiments ═══════════════════════════════
  // les matières : PTEXTURES.bati (toutes dans une texture en couches : un appel de dessin par tuile) ; sans WebGL2, null : les couleurs
  // moyennes seules (repli WebGL1) ; l'atlas des ouvertures (fenêtres, volets, portes, vitrines…) : PTEXTURES.details
  const NOMS_BATI = ['crepi', 'mixte', 'pierre', 'taille', 'brique', 'beton', 'bois', 'tuiles', 'ecailles', 'canal', 'ardoise', 'ardoise-ecailles', 'zinc', 'plat'];
  let BATI = null, ATL = null;
  function matieres() {
    BATI = null; ATL = null; if (!PTX) return;
    try { BATI = PTX.bati(NOMS_BATI) || null; } catch (e) { signaler('PTEXTURES.bati', e); BATI = null; }
    try { ATL = PTX.details() || null; } catch (e) { signaler('PTEXTURES.details', e); ATL = null; }
  }
  const coulM = (nom, hex, k) => (BATI ? BATI.couleur(nom, hex, k == null ? 1 : k) : lin(hex, k == null ? 1 : k)); // couleur de sommet : la moyenne rendue vaut hex (× k)
  const coucheM = (nom) => (BATI ? BATI.couche(nom) : 0);
  // les nuances (choix de style : la matière vient des données, la nuance est tirée) : crépis des villages de l'Ain, calcaires du Bugey
  const TEINTES = {
    crepi: ['#E2CCA4', '#E2CCA4', '#E6D3AA', '#E6D3AA', '#ECE5D6', '#ECE5D6', '#D9B37E', '#D9B37E', '#C2BBAE', '#DDB197', '#E3CA93', '#C99D78'],
    pierre: ['#CFC0A2', '#D5BC8E', '#BBB3A3', '#C9B796'], taille: ['#DCD1BC', '#D6CAB2'], mixte: ['#D8C4A0', '#CFBC99', '#DECCA9'],
    brique: ['#A65D40'], beton: ['#C8C3B9'], bois: ['#8A6748'],
  };
  const VOLETS = ['vert', 'bleu', 'gris', 'brun', 'bordeaux']; // le tirage de decor.js (hash('volets|' + i)) : ses fenêtres fleuries ont nos volets
  const STORES = ['#7A2E35', '#2F5A45', '#2D4566', '#8C6A3A', '#5B3A5A', '#9A4A2C'];
  const BLANC = [1, 1, 1], HSL = { h: 0, s: 0, l: 0 };
  function retoucher(hex, f) { _c.set(hex); _c.getHSL(HSL, THREE.SRGBColorSpace); f(HSL); _c.setHSL(((HSL.h % 1) + 1) % 1, borne(HSL.s, 0, 1), borne(HSL.l, 0, 1), THREE.SRGBColorSpace); return '#' + _c.getHexString(); }
  function teinteToit(b, nom, hs) { // la vraie teinte (la photo, b.teinteToit), ramenée dans la gamme de la matière et un peu saturée
    const t = typeof b.teinteToit === 'string' && /^#[0-9a-f]{6}$/i.test(b.teinteToit) ? b.teinteToit : null;
    if (nom === 'tuiles' || nom === 'canal' || nom === 'ecailles') return retoucher(t || ['#A6553A', '#9A5A44', '#B0623F', '#8E5440'][hs % 4], (c) => { const h = c.h > 0.5 ? c.h - 1 : c.h; c.h = borne(h, 0, 0.065); c.s = borne(c.s * 1.25 + 0.1, 0.24, 0.46); c.l = borne(c.l * 0.95, 0.3, 0.44); });
    if (nom === 'ardoise' || nom === 'ardoise-ecailles') return retoucher(t || '#5E6674', (c) => { c.h = 0.6; c.s = borne(c.s, 0.06, 0.16); c.l = borne(c.l, 0.3, 0.42); });
    if (nom === 'zinc') return retoucher(t || '#9AA2A8', (c) => { c.h = 0.56; c.s = borne(c.s, 0.02, 0.08); c.l = borne(c.l, 0.52, 0.7); });
    return retoucher(t || '#ABA59B', (c) => { c.s = borne(c.s, 0, 0.07); c.l = borne(c.l, 0.45, 0.62); }); // plat : gravillons, béton
  }
  function teinteMur(nom, hs, t) { if (t === 'mairie' && nom === 'crepi') return '#EAD8B2'; const l = TEINTES[nom] || TEINTES.crepi; return l[(hs >>> 7) % l.length]; }
  // la fausse occlusion du pied des murs : 0,6 au pied, 0,93 à 1,2 m du sol, 1 en haut
  function kMur(y, g, base, haut) { const bt = Math.min(haut, g + 1.2); return y <= bt ? 0.6 + 0.33 * borne((y - base) / Math.max(0.1, bt - base), 0, 1) : 0.93 + 0.07 * borne((y - bt) / Math.max(0.1, haut - bt), 0, 1); }
  const PF = (w, s, y, off) => [w.a[0] + w.ux * s + w.nx * off, y, w.a[1] + w.uz * s + w.nz * off]; // un point de la façade w (s depuis a, décalé de off vers le dehors)
  const solF = (w, s, base) => Math.max(H0(w.a[0] + w.ux * s, w.a[1] + w.uz * s), base);
  // les uv d'un mur : (s / e + du, (y − base) / e + dv) ; e = 4,8 m pour l'enduit à pierres vues (ses lacunes se répètent moins : de grandes
  // plaques tombées), 3 m sinon (les assises de la pierre de taille restent à leur hauteur) ; du, dv : le décalage du bâtiment en cours
  // (posé par batiment()), pour que deux maisons voisines de même matière ne se raccordent pas en papier peint ; le crépi garde dv = 0 :
  // ses coulures partent de l'appui de la fenêtre type (v 0,32), à la hauteur de nos fenêtres du rez-de-chaussée
  let decUV = [0, 0];
  const echUV = (nom) => (nom === 'mixte' ? 4.8 : 3), decV = (nom) => (nom === 'crepi' ? 0 : decUV[1]);
  // un quadrilatère [[s, y] × 4] sur la façade w, tourné vers le dehors quel que soit l'ordre donné ; uv métriques (ci-dessus) ;
  // k : un nombre, ou une fonction (s, y) → k
  function quadF(T, w, q, off, nom, hex, k, base) {
    let a2 = 0; for (let i = 0; i < 4; i++) { const p0 = q[i], p1 = q[(i + 1) % 4]; a2 += p0[0] * p1[1] - p1[0] * p0[1]; }
    if (a2 > 0) q = [q[3], q[2], q[1], q[0]]; // dehors : sens horaire dans le plan (s, y) (s croît vers la gauche de qui regarde la façade)
    const col = (i) => coulM(nom, hex, typeof k === 'function' ? k(q[i][0], q[i][1]) : k), e = echUV(nom), du = decUV[0], dv = decV(nom);
    T.quad4(PF(w, q[0][0], q[0][1], off), PF(w, q[1][0], q[1][1], off), PF(w, q[2][0], q[2][1], off), PF(w, q[3][0], q[3][1], off), col(0), col(1), col(2), col(3),
      [q[0][0] / e + du, (q[0][1] - base) / e + dv, q[1][0] / e + du, (q[1][1] - base) / e + dv, q[2][0] / e + du, (q[2][1] - base) / e + dv, q[3][0] / e + du, (q[3][1] - base) / e + dv], coucheM(nom));
  }
  function quadVers(T, a, b, c, d, o, ca, cb, cc, cd, uv, k) { // un quadrilatère tourné vers le point o
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * (o[0] - a[0]) + ny * (o[1] - a[1]) + nz * (o[2] - a[2]) >= 0) T.quad4(a, b, c, d, ca, cb, cc, cd, uv, k);
    else T.quad4(d, c, b, a, cd, cc, cb, ca, uv && [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]], k);
  }
  // un morceau de mur plein, de sA à sB : la bande sombre du pied, puis le reste
  function murPlein(T, w, sA, sB, base, haut, nom, hex) {
    const gA = solF(w, sA, base), gB = solF(w, sB, base), bA = Math.min(haut, gA + 1.2), bB = Math.min(haut, gB + 1.2), kA = (s, y) => kMur(y, s === sA ? gA : gB, base, haut);
    quadF(T, w, [[sB, base], [sA, base], [sA, bA], [sB, bB]], 0, nom, hex, kA, base);
    quadF(T, w, [[sB, bB], [sA, bA], [sA, haut], [sB, haut]], 0, nom, hex, kA, base);
  }

  // ─── les passages voûtés (monde.passages) : l'arcade dans les façades, l'archivolte, la voûte dedans ───
  const solV = (V, t) => V.sol[0] + (V.sol[1] - V.sol[0]) * borne(t / (V.long || 1), 0, 1); // le sol du passage, linéaire de a à b (comme monde.arche)
  function arcSur(V, w, N) { // la trace de l'intrados sur la façade w : [[s, y, sol, θ]] de θ = 0 à π (écart e = (w/2)·cos θ, y = sol + h − w/2 + (w/2)·sin θ)
    const nlx = -V.u[1], nlz = V.u[0], kap = w.ux * nlx + w.uz * nlz; if (Math.abs(kap) < 0.25) return null; // une façade presque parallèle au couloir
    const ax = V.l[0][0], az = V.l[0][1], e0 = (w.a[0] - ax) * nlx + (w.a[1] - az) * nlz, hw = V.w / 2, pts = [];
    for (let k = 0; k <= N; k++) {
      const th = Math.PI * k / N, e = hw * Math.cos(th), s = (e - e0) / kap, x = w.a[0] + w.ux * s, z = w.a[1] + w.uz * s, sv = solV(V, (x - ax) * V.u[0] + (z - az) * V.u[1]);
      pts.push([s, sv + V.h - hw + hw * Math.sin(th), sv, th]);
    }
    return { pts, e0, kap, hw };
  }
  function murArche(T, w, A, base, haut, nom, hex) { // la façade au-dessus de l'arcade : des bandes verticales, de l'intrados au haut du mur
    const pts = A.pts.slice().sort((p, q) => p[0] - q[0]), k = (s, y) => kMur(y, pts[0][2], base, haut);
    for (let i = 0; i + 1 < pts.length; i++) { const p0 = pts[i], p1 = pts[i + 1]; if (p1[0] - p0[0] < 1e-4) continue; quadF(T, w, [[p0[0], p0[1]], [p1[0], p1[1]], [p1[0], haut], [p0[0], haut]], 0, nom, hex, k, base); }
  }
  function archivolte(T, w, A, V, base, sommet) { // l'arc de pierre de taille autour de l'arcade, et ses piédroits du sol à la naissance
    const hw = A.hw, r = Math.min(0.3, sommet - (A.pts[0][2] + V.h) - 0.12); if (r < 0.08) return;
    const nom = 'taille', hex = '#DCD0B8', N = A.pts.length - 1, ext = (k) => { const th = A.pts[k][3]; return [((hw + r) * Math.cos(th) - A.e0) / A.kap, A.pts[k][2] + V.h - hw + (hw + r) * Math.sin(th)]; };
    for (let k = 0; k < N; k++) { const i0 = A.pts[k], i1 = A.pts[k + 1]; quadF(T, w, [[i0[0], i0[1]], [i1[0], i1[1]], ext(k + 1), ext(k)], 0.025, nom, hex, k === N >> 1 || k === (N - 1) >> 1 ? 1.06 : 1.0, base); }
    for (const k of [0, N]) { const i = A.pts[k], o = ext(k), g = H0(w.a[0] + w.ux * i[0], w.a[1] + w.uz * i[0]) - 0.3; quadF(T, w, [[i[0], g], [o[0], g], [o[0], o[1]], [i[0], i[1]]], 0.025, nom, hex, (s, y) => (y < g + 1 ? 0.82 : 0.97), base); }
  }
  function voute(T, V, bi) { // dedans : la voûte en berceau et les piédroits, en moellons, de façade à façade (lignes parallèles à l'axe), plus sombres
    const b = monde.batiments[bi]; if (!b) return; const p = b.p, hw = V.w / 2, ax = V.l[0][0], az = V.l[0][1], ux = V.u[0], uz = V.u[1], nlx = -uz, nlz = ux, base = b.base, N = PALIERS[QUAL.niveau].arc;
    const ligne = (e) => { // [t entrée, t sortie] de la ligne à l'écart e dans l'emprise du bâtiment
      const ox = ax + nlx * e, oz = az + nlz * e; let t0 = Infinity, t1 = -Infinity;
      for (let i = 0; i < p.length; i++) { const A = p[i], Bq = p[(i + 1) % p.length], ex = Bq[0] - A[0], ez = Bq[1] - A[1], den = ux * ez - uz * ex; if (Math.abs(den) < 1e-9) continue; const t = ((A[0] - ox) * ez - (A[1] - oz) * ex) / den, s = ((A[0] - ox) * uz - (A[1] - oz) * ux) / den; if (s < -1e-6 || s > 1 + 1e-6) continue; if (t < t0) t0 = t; if (t > t1) t1 = t; }
      return t1 > t0 + 0.05 ? [t0, t1] : null;
    };
    const pt = (t, e, y) => [ax + ux * t + nlx * e, y, az + uz * t + nlz * e], nom = 'pierre', hex = '#C6B89D', kV = coucheM(nom), L0 = [];
    for (let k = 0; k <= N; k++) { const th = Math.PI * k / N, e = hw * Math.cos(th); L0.push({ l: ligne(e), e, yo: V.h - hw + hw * Math.sin(th), v: hw * th / 3 }); }
    const mil = L0[N >> 1].l || [0, V.long], tm = (mil[0] + mil[1]) / 2, O = [ax + ux * tm, solV(V, tm) + V.h - hw, az + uz * tm], cv = coulM(nom, hex, 0.62);
    for (let k = 0; k < N; k++) {
      const A = L0[k], Bq = L0[k + 1]; if (!A.l || !Bq.l) continue;
      quadVers(T, pt(A.l[0], A.e, solV(V, A.l[0]) + A.yo), pt(A.l[1], A.e, solV(V, A.l[1]) + A.yo), pt(Bq.l[1], Bq.e, solV(V, Bq.l[1]) + Bq.yo), pt(Bq.l[0], Bq.e, solV(V, Bq.l[0]) + Bq.yo), O, cv, cv, cv, cv,
        [A.l[0] / 3, A.v, A.l[1] / 3, A.v, Bq.l[1] / 3, Bq.v, Bq.l[0] / 3, Bq.v], kV);
    }
    for (const e of [hw, -hw]) { // les piédroits, du sol à la naissance
      const l = ligne(e); if (!l) continue; const [t0, t1] = l, nA = V.h - hw, P0 = pt(t0, e, 0), P1 = pt(t1, e, 0), g0 = H0(P0[0], P0[2]) - 0.3, g1 = H0(P1[0], P1[2]) - 0.3, y0 = solV(V, t0) + nA, y1 = solV(V, t1) + nA;
      const O2 = [ax + ux * (t0 + t1) / 2, solV(V, (t0 + t1) / 2) + nA * 0.5, az + uz * (t0 + t1) / 2], cb = coulM(nom, hex, 0.45), ch = coulM(nom, hex, 0.64);
      quadVers(T, pt(t0, e, g0), pt(t1, e, g1), pt(t1, e, y1), pt(t0, e, y0), O2, cb, cb, ch, ch, [t0 / 3, (g0 - base) / 3, t1 / 3, (g1 - base) / 3, t1 / 3, (y1 - base) / 3, t0 / 3, (y0 - base) / 3], kV);
    }
  }

  let tuiles = [], nbTuiles = 0, TUILE = 150, habille = new Map(), arcsPar = new Map(), nVoutes = 0, AC = [0, 0], voutesM = null;
  const cleF = (a, c) => a[0] + ',' + a[1] + '|' + c[0] + ',' + c[1];
  const batOk = (b) => b && Array.isArray(b.p) && b.p.length >= 3 && fini(b.base) && fini(b.sommet) && Array.isArray(b.aabb);
  function construireBatiments() {
    tuiles = []; nbTuiles = 0;
    const bats = monde.batiments || [];
    construireIndexBat(bats);
    const A0 = carte.zones && carte.zones.arene; AC = A0 && Array.isArray(A0.centre) ? [+A0.centre[0] || 0, +A0.centre[1] || 0] : [0, 0];
    // les façades déjà habillées par decor.js (devantures, mairie, inscriptions) : on n'y met ni porte, ni vitrine, ni fenêtre au rez-de-chaussée
    habille = new Map(); if (decor && Array.isArray(decor.facades)) for (const f of decor.facades) { if (!f || !Array.isArray(f.a) || !Array.isArray(f.c)) continue; const k = cleF(f.a, f.c); let l = habille.get(k); if (!l) habille.set(k, (l = [])); l.push([+f.s0, +f.s1, f.quoi]); }
    // les arcades des passages : [s0, s1, passage, haut de l'archivolte] par arête
    arcsPar = new Map(); (monde.passages || []).forEach((V, ip) => { for (const bt of V.bats || []) for (const cp of bt.coupes || []) { const k = bt.i + '|' + cp.a; let l = arcsPar.get(k); if (!l) arcsPar.set(k, (l = [])); l.push([cp.s0, cp.s1, ip, Math.max(V.sol[0], V.sol[1]) + V.h + 0.32]); } });
    arcsPar.forEach((l) => l.sort((a, b) => a[0] - b[0]));
    TUILE = Math.max(150, L / 4); const G = Math.ceil(L / TUILE), tg = [], tex = !!BATI;
    for (let k = 0; k < G * G; k++) tg.push({ gros: new Tampon(tex), det: new Tampon(true) });
    const tuileDe = (b) => { const cx = (b.aabb[0] + b.aabb[2]) / 2, cz = (b.aabb[1] + b.aabb[3]) / 2; return tg[borne(Math.floor((cz + L / 2) / TUILE), 0, G - 1) * G + borne(Math.floor((cx + L / 2) / TUILE), 0, G - 1)]; };
    const eglises = bats.filter((b) => batOk(b) && b.t === 'eglise');
    bats.forEach((b, i) => { if (!batOk(b)) return; const t = tuileDe(b); try { batiment(b, i, t.gros, t.det, eglises); } catch (e) { signaler('bâtiment ' + i, e); } });
    // l'intérieur des voûtes : un maillage à part (pas une tuile de plus), aux normales horizontales opposées au soleil : le soleil n'y entre
    // jamais, avec ou sans carte d'ombre ; seul le ciel (l'hémisphère) l'éclaire, comme la haute à l'ombre. castShadow reste vrai : en
    // haute, c'est l'intrados (faces arrière dans la passe d'ombre) qui ombre le sol du couloir
    nVoutes = 0; const TV = new Tampon(tex);
    (monde.passages || []).forEach((V) => { for (const bt of V.bats || []) { const b = bats[bt.i]; if (!batOk(b)) continue; try { voute(TV, V, bt.i); nVoutes++; } catch (e) { signaler('voûte ' + V.n, e); } } });
    const matG = BATI ? BATI.materiau() : M.MAT.vertex, matD = ATL ? ATL.materiau({ couleurs: true }) : null;
    if (!TV.vide()) {
      const g = TV.geometrie(), nn = g.attributes.normal.array, lh = Math.hypot(SOLEIL[0], SOLEIL[2]), ox = -SOLEIL[0] / lh, oz = -SOLEIL[2] / lh;
      for (let i = 0; i < nn.length; i += 3) { nn[i] = ox; nn[i + 1] = 0; nn[i + 2] = oz; }
      voutesM = new THREE.Mesh(g, matG); voutesM.castShadow = true; voutesM.receiveShadow = true; voutesM.name = 'voutes'; voutesM.matrixAutoUpdate = false; scene.add(voutesM);
    }
    tg.forEach((t, k) => {
      if (t.gros.vide()) return;
      const g = t.gros.geometrie(), m = new THREE.Mesh(g, matG); m.castShadow = true; m.receiveShadow = true; m.name = 'tuile' + k; m.matrixAutoUpdate = false; scene.add(m);
      const bb = g.boundingBox, ti = { gros: m, det: null, x0: bb.min.x, z0: bb.min.z, x1: bb.max.x, z1: bb.max.z };
      if (matD && !t.det.vide()) { const gd = t.det.geometrie(); ti.det = new THREE.Mesh(gd, matD); ti.det.castShadow = false; ti.det.receiveShadow = true; ti.det.name = 'details' + k; ti.det.matrixAutoUpdate = false; scene.add(ti.det); }
      tuiles.push(ti);
    });
    nbTuiles = tuiles.length; memoireSale = true;
  }
  function viderBatiments() { for (const ti of tuiles) for (const m of [ti.gros, ti.det]) { if (!m) continue; scene.remove(m); m.geometry.dispose(); } tuiles = []; nbTuiles = 0; if (voutesM) { scene.remove(voutesM); voutesM.geometry.dispose(); voutesM = null; } }
  function batiment(b, idx, Tg, Td, eglises) {
    const p = b.p, n = p.length, base = b.base, sommet = b.sommet, h = b.h, t = b.t || 'maison', hs = hash((b.n || '') + '|' + idx + '|' + Math.round(p[0][0] * 7) + '|' + Math.round(p[0][1] * 7));
    decUV = [(hs & 255) / 85, ((hs >>> 8) & 255) / 85]; // le décalage des uv de ses murs (l'archivolte des voûtes comprise ; voute() et cube() gardent les leurs)
    const A = Math.abs(aire(p)), box = obb(p), cvx = convexe(p);
    const rect = box ? A / Math.max(1e-3, 4 * box.hl * box.hw) : 0;
    const tourLike = t === 'tour' || ((t === 'eglise' || t === 'chateau') && A < 130 && h >= 13);
    let clocher = false;
    if (tourLike) { const cx = (b.aabb[0] + b.aabb[2]) / 2, cz = (b.aabb[1] + b.aabb[3]) / 2; clocher = t === 'eglise' || eglises.some((e) => e !== b && Math.hypot((e.aabb[0] + e.aabb[2]) / 2 - cx, (e.aabb[1] + e.aabb[3]) / 2 - cz) < 40); }
    // les matières (les données) : église, château, tours en pierre de taille ; la forme et la pente du toit
    let nomMur = { pierre: 'pierre', mixte: 'mixte', brique: 'brique', beton: 'beton', bois: 'bois' }[b.mur] || 'crepi';
    if (t === 'eglise' || t === 'chateau' || tourLike) nomMur = 'taille';
    let nomToit = { ardoise: 'ardoise', zinc: 'zinc', beton: 'plat', verre: 'zinc' }[b.toit] || 'tuiles', forme = 'plat', pente = 0.62;
    if (tourLike) { forme = 'fleche'; pente = clocher ? 1.9 : 1.25; }
    else if (t === 'eglise') { forme = rect > 0.75 ? 'deuxpans' : 'pavillon'; pente = 1.0; }
    else if (t === 'chateau') { forme = cvx && n <= 8 ? 'croupe' : 'pavillon'; pente = 1.15; }
    else if (box && rect > 0.86 && A < 400 && n <= 8) { forme = 'deuxpans'; pente = t === 'annexe' ? 0.5 : 0.62; }
    else if (box && cvx && n <= 8 && A < 900) { forme = 'croupe'; pente = t === 'mairie' ? 0.75 : 0.6; }
    else if (A < 900 || t === 'mairie') { forme = 'pavillon'; pente = 0.7; }
    if (nomToit === 'plat') forme = 'plat';
    if (nomToit === 'tuiles') { if (tourLike || t === 'eglise' || t === 'chateau') nomToit = 'ecailles'; else if (forme !== 'plat' && pente <= 0.62 && (hs >>> 9) % 4 === 0) { nomToit = 'canal'; pente = Math.min(pente, 0.5); } }
    if (nomToit === 'ardoise' || nomToit === 'ecailles') { if (forme !== 'plat' && forme !== 'fleche') pente = Math.max(pente, 0.85); if (nomToit === 'ardoise' && tourLike) nomToit = 'ardoise-ecailles'; }
    const toitPlatNom = nomToit === 'zinc' ? 'zinc' : 'plat', hexMur = teinteMur(nomMur, hs, t), hexToit = teinteToit(b, forme === 'plat' ? toitPlatNom : nomToit, hs), parapet = forme === 'plat' ? 0.6 : 0, haut = sommet + parapet;
    // ─── les murs (texture de la matière, pied assombri) ; les arcades des passages y sont creusées ───
    const murs = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz); if (len < 1e-3) continue;
      const ux = dx / len, uz = dz / len, nx = uz, nz = -ux, w = { a, c, len, ux, uz, nx, nz, i, mitoyen: false, rue: 99 };
      const arcs = arcsPar.get(idx + '|' + i); let s = 0;
      if (arcs) for (const [s0, s1, ip] of arcs) {
        const V = monde.passages[ip], Ar = arcSur(V, w, PALIERS[QUAL.niveau].arc);
        if (s0 > s) murPlein(Tg, w, s, s0, base, haut, nomMur, hexMur);
        if (Ar) { murArche(Tg, w, Ar, base, haut, nomMur, hexMur); archivolte(Tg, w, Ar, V, base, sommet); } else murPlein(Tg, w, s0, s1, base, haut, nomMur, hexMur);
        s = Math.max(s, s1);
      }
      if (s < len) murPlein(Tg, w, s, len, base, haut, nomMur, hexMur);
      const mx = (a[0] + c[0]) / 2 + nx * 0.45, mz = (a[1] + c[1]) / 2 + nz * 0.45;
      w.mitoyen = dansBatiment(mx, mz, idx) >= 0 && dansBatiment(a[0] + dx * 0.25 + nx * 0.45, a[1] + dz * 0.25 + nz * 0.45, idx) >= 0;
      w.rue = w.mitoyen ? 99 : distRue(mx + nx * 2, mz + nz * 2);
      murs.push(w);
    }
    // ─── le toit ───
    const R = { toit: forme === 'plat' ? toitPlatNom : nomToit, hexT: hexToit, mur: nomMur, hexM: hexMur, base, sommet };
    let fait = false;
    if (forme === 'deuxpans' || forme === 'croupe' || forme === 'fleche') fait = toitPente(Tg, p, b, box, forme, pente, R);
    if (!fait && forme === 'pavillon') fait = toitPavillon(Tg, p, pente, A, R);
    if (!fait) toitPlat(Tg, p, parapet || 0.6, !parapet, R.toit === 'zinc' || R.toit === 'plat' ? R : Object.assign({}, R, { toit: 'plat', hexT: teinteToit({}, 'plat', hs) }));
    // une cheminée sur une maison sur deux : de la matière du mur, un chapeau de terre cuite
    if ((t === 'maison' || t === 'commerce') && forme !== 'plat' && box && (hs >>> 12) % 2 === 0 && A > 40) {
      const s = ((hs >>> 14) % 100) / 100 * 0.8 - 0.4, x = box.cx + box.ux * s * box.hl + (-box.uz) * box.hw * 0.35, z = box.cz + box.uz * s * box.hl + box.ux * box.hw * 0.35;
      const yb = sommet + pente * box.hw * 0.62 - 0.3, ch = lin('#8E5A48'); // posée sur le pan, à 35 % du faîtage
      cube(Tg, x, z, 0.55, 0.55, yb, yb + 1.25, box.ux, box.uz, coulM(nomMur, hexMur, 0.9), coulM(nomMur, hexMur, 1), nomMur); cube(Tg, x, z, 0.68, 0.68, yb + 1.25, yb + 1.4, box.ux, box.uz, ch, ch);
    }
    // ─── les ouvertures (atlas PTEXTURES.details) ───
    let porte = null; // la façade sur rue : la plus proche d'une rue, à longueur égale la plus longue
    if (!tourLike || clocher) { let best = Infinity; for (const w of murs) { if (w.mitoyen || w.len < (t === 'eglise' ? 3 : 2.4)) continue; const sc = Math.max(0, w.rue) - Math.min(w.len, 10) * 0.12; if (sc < best) { best = sc; porte = w; } } }
    if (ATL) ouvertures(Td, Tg, b, idx, murs, porte, { t, hs, nomMur, tourLike, clocher, haut, cx: (b.aabb[0] + b.aabb[2]) / 2, cz: (b.aabb[1] + b.aabb[3]) / 2 });
  }
  // une cellule de l'atlas sur la façade w : centrée en s, le bas en y, l × h m (la taille de la cellule par défaut), décollée de off ;
  // o.miroir : u inversé ; o.coupe : la part de la hauteur gardée (du bas) ; o.col : la couleur de sommet
  function cellule(T, w, nom, s, y, off, o) {
    const c = ATL.cellules[nom]; if (!c) return false;
    const l = (o && o.l) || c.l, kr = o && o.coupe ? o.coupe : 1, hh = ((o && o.h) || c.h) * kr, uv = c.uv, mi = !!(o && o.miroir), col = (o && o.col) || BLANC;
    const u0 = mi ? uv[2] : uv[0], u1 = mi ? uv[0] : uv[2], v0 = uv[1], v1 = uv[1] + (uv[3] - uv[1]) * kr;
    T.quad4(PF(w, s + l / 2, y, off), PF(w, s - l / 2, y, off), PF(w, s - l / 2, y + hh, off), PF(w, s + l / 2, y + hh, off), col, col, col, col, [u0, v0, u1, v0, u1, v1, u0, v1], 0);
    return true;
  }
  function fenetre(T, w, nom, s, y0, vol, ferme, col) { // la fenêtre (encadrement, appui) et ses volets persiennes, ouverts ou fermés
    const F = ATL.cellules[nom]; if (!F) return; cellule(T, w, nom, s, y0, 0.04, { col });
    const V = vol ? ATL.cellules[vol] : null; if (!V) return;
    const ou = F.ouverture || [0.1, 0.1, F.l - 0.1, F.h - 0.1];
    if (ferme) { const lo = (ou[2] - ou[0]) / 2, xo = s + F.l / 2 - ou[0], ho = ou[3] - ou[1]; cellule(T, w, vol, xo - lo / 2, y0 + ou[1], 0.055, { l: lo, h: ho, col }); cellule(T, w, vol, xo - lo * 1.5, y0 + ou[1], 0.055, { l: lo, h: ho, col, miroir: true }); }
    else { const yo = y0 + ou[1] - 0.03, ho = ou[3] - ou[1] + 0.06; cellule(T, w, vol, s + F.l / 2 - 0.07 + V.l / 2, yo, 0.05, { h: ho, col }); cellule(T, w, vol, s - F.l / 2 + 0.07 - V.l / 2, yo, 0.05, { h: ho, col, miroir: true }); }
  }
  // les ouvertures d'un bâtiment : travées n = ⌊(l − 0,6) / 3⌋ (au moins 1), s = (k + 0,5)·l/n ; étages de 2,85 m, bas de la fenêtre à
  // max(sol, base) + 0,87 (sol pris à 30 cm devant le mur) — la règle des fenêtres fleuries de decor.js ; mairie et château : hautes fenêtres
  // tous les 3,4 m ; église : vitraux et portail ; clocher : abat-sons et horloges ; annexes : une porte de grange ; commerces sans
  // devanture du décor : vitrines et store ; chaînes d'angle de pierre sur une partie des maisons crépies (sauf en éco)
  function ouvertures(Td, Tg, b, idx, murs, porte, o) {
    const CEL = ATL.cellules, t = o.t, sommet = b.sommet, base = b.base, kd = 0.92 + ((o.hs >>> 3) & 7) / 100, col = [kd, kd, kd];
    const grand = t === 'mairie' || t === 'chateau', etage = grand ? 3.4 : 2.85, y00 = grand ? 0.95 : 0.87, nomF = grand ? 'fenetre-haute' : 'fenetre', F = CEL[nomF];
    const avecVolets = (t === 'maison' || t === 'commerce' || t === 'mairie') && (Math.hypot(o.cx - AC[0], o.cz - AC[1]) < 75 || (o.hs >>> 20) % 5 !== 0);
    const vol = avecVolets ? 'volet-' + VOLETS[hash('volets|' + idx) % VOLETS.length] : null;
    const nomP = o.nomMur === 'pierre' || o.nomMur === 'mixte' || o.nomMur === 'taille' ? 'porte-ancienne' : (o.hs & 1) ? 'porte-peinte' : 'porte';
    for (const w of murs) {
      if (w.mitoyen || w.len < 2.4) continue;
      const hab = habille.get(cleF(w.a, w.c)) || VIDE, arcs = arcsPar.get(idx + '|' + w.i) || VIDE;
      const pris = (s, demi, e, y0) => hab.some((sp) => (e === 0 || sp[2] === 'mairie') && s + demi > sp[0] - 0.3 && s - demi < sp[1] + 0.3) || arcs.some((sp) => y0 < sp[3] && s + demi > sp[0] - 0.45 && s - demi < sp[1] + 0.45);
      if (t === 'eglise' && !o.tourLike) { // la nef : le portail au milieu de la façade de la rue, des vitraux tous les ~4,2 m partout (de part et d'autre du portail)
        let hp = -1; // la demi-emprise du portail (et sa marge) : pas de vitrail dedans
        if (w === porte) { const s = w.len / 2; if (CEL.portail && w.len >= CEL.portail.l + 0.6 && !pris(s, CEL.portail.l / 2, 0, 0)) { cellule(Td, w, 'portail', s, solF(w, s, base) - 0.02, 0.04, { col }); hp = CEL.portail.l / 2 + 0.9; } }
        const nv = w.len >= 2.5 ? Math.max(1, Math.floor((w.len - 0.8) / 4.2)) : 0; // au moins un vitrail par pan de 2,5 m (les redans du chevet)
        for (let k = 0; k < nv; k++) { const s = (k + 0.5) * w.len / nv, y = solF(w, s, base) + 2.6; if (y + 3.0 > sommet - 1.2 || Math.abs(s - w.len / 2) < hp) continue; cellule(Td, w, 'vitrail', s, y, 0.04, { col }); }
        continue;
      }
      if (o.clocher) { // le clocher : un abat-son sous la flèche, une horloge en dessous
        if (w.len < 2.2) continue; const s = w.len / 2, g = solF(w, s, base), la = Math.min(1.4, w.len * 0.55), ha = la / 1.4 * 2.4, ya = sommet - 0.7 - ha, hz = Math.min(1.5, w.len * 0.55);
        if (ya - g < 7) continue; cellule(Td, w, 'abat-son', s, ya, 0.04, { l: la, h: ha, col }); cellule(Td, w, 'horloge', s, ya - 0.6 - hz, 0.04, { l: hz, h: hz, col }); continue;
      }
      if (t === 'annexe') { // une porte de grange (ou une porte peinte) sur la façade de la rue, pas de fenêtres
        if (w !== porte) continue; const s = w.len / 2, g = solF(w, s, base), grange = CEL.grange && w.len >= 3.6 && sommet - g >= 3.4, nm = grange ? 'grange' : 'porte-peinte';
        if (!pris(s, CEL[nm].l / 2, 0, 0)) cellule(Td, w, nm, s, g - 0.02, 0.045, { col }); continue;
      }
      if (o.tourLike && w.len < 2.5) continue;
      const nf = Math.max(1, Math.floor((w.len - 0.6) / 3)), pas = w.len / nf, vitrines = t === 'commerce' && w === porte && !hab.length && w.len >= 3.5;
      let kp = -1; // la travée de la porte : libre, la plus proche du milieu
      if (w === porte && !(t === 'mairie' && decor)) { let best = Infinity; for (let k = 0; k < nf; k++) { const s = (k + 0.5) * pas; if (pris(s, 0.75, 0, 0)) continue; const d = Math.abs(k - (nf - 1) / 2); if (d < best) { best = d; kp = k; } } }
      for (let k = 0; k < nf; k++) {
        const s = (k + 0.5) * pas, g = Math.max(H0(w.a[0] + w.ux * s + w.nx * 0.3, w.a[1] + w.uz * s + w.nz * 0.3), base);
        for (let e = 0; ; e++) {
          const y0 = g + y00 + e * etage; if (y0 + F.h > sommet - (grand ? 0.5 : 0.45)) break;
          if (e === 0 && vitrines) { if (!pris(s, 0.8, 0, 0)) cellule(Td, w, k === kp ? 'vitrine-porte' : 'vitrine', s, g - 0.02, 0.045, { l: Math.min(pas - 0.25, k === kp ? 1.05 : 2.2), h: 2.7, col }); continue; }
          if (e === 0 && k === kp) { cellule(Td, w, t === 'mairie' ? 'porte-ancienne' : nomP, s, g - 0.02, 0.045, { col }); continue; }
          if (pris(s, F.l / 2 + 0.35, e, y0)) continue;
          fenetre(Td, w, nomF, s, y0, vol, vol && ((o.hs >>> ((k * 5 + e * 3) % 27)) & 15) === 0, col);
        }
      }
      if (vitrines) { const g = solF(w, w.len / 2, base); store(Tg, w, 0.4, w.len - 0.4, g + 3.02, g + 2.6, 1.05, lin(STORES[(o.hs >>> 10) % STORES.length])); }
    }
    // les chaînes d'angle (harpes de pierre) aux angles saillants des maisons crépies : « chaine » à gauche de l'angle, « chaine-b » de l'autre côté
    if (!(PALIERS[QUAL.niveau].chaines && (o.nomMur === 'crepi' || o.nomMur === 'mixte') && (t === 'maison' || t === 'commerce' || t === 'mairie') && sommet - base >= 5 && (o.hs >>> 16) % 3 !== 0)) return;
    for (let i = 0; i < murs.length; i++) {
      const w1 = murs[i], w2 = murs[(i + 1) % murs.length]; if (w1.c !== w2.a || w1.mitoyen || w2.mitoyen || w1.len < 1.6 || w2.len < 1.6) continue;
      if (w1.ux * w2.uz - w1.uz * w2.ux < 0.5) continue; // un angle saillant franc
      if ((arcsPar.get(idx + '|' + w1.i) || VIDE).some((sp) => sp[1] > w1.len - 1) || (arcsPar.get(idx + '|' + w2.i) || VIDE).some((sp) => sp[0] < 1)) continue;
      const g = Math.max(H0(w1.c[0], w1.c[1]), base) - 0.05, top = o.haut - 0.05;
      for (let y = g; y < top - 0.25; y += 2.88) { const kr = Math.min(1, (top - y) / 2.88); cellule(Td, w1, 'chaine', w1.len - 0.36, y, 0.025, { coupe: kr, col }); cellule(Td, w2, 'chaine-b', 0.36, y, 0.025, { coupe: kr, col, miroir: true }); }
    }
  }
  function store(T, w, s0, s1, yh, yb, prof, c) { // un store de toile rayée, incliné de la façade (yh) vers la rue (yb) : dessus, dessous, lambrequin
    const ax = w.a[0] + w.nx * 0.06, az = w.a[1] + w.nz * 0.06, ox = w.nx * prof, oz = w.nz * prof, nb = Math.max(2, Math.round((s1 - s0) / 0.45)), creme = lin('#EDE4D2');
    for (let i = 0; i < nb; i++) {
      const u0 = s0 + (s1 - s0) * i / nb, u1 = s0 + (s1 - s0) * (i + 1) / nb, cc = i % 2 ? creme : c;
      const a = P3(ax + w.ux * u1, yh, az + w.uz * u1), b = P3(ax + w.ux * u0, yh, az + w.uz * u0), d = P3(ax + w.ux * u1 + ox, yb, az + w.uz * u1 + oz), e = P3(ax + w.ux * u0 + ox, yb, az + w.uz * u0 + oz);
      T.quad(d, e, b, a, cc); T.quad(a, b, e, d, [cc[0] * 0.5, cc[1] * 0.5, cc[2] * 0.5]);
      T.quad(P3(d[0], yb - 0.22, d[2]), P3(e[0], yb - 0.22, e[2]), e, d, [cc[0] * 0.88, cc[1] * 0.88, cc[2] * 0.88]);
    }
  }
  function cube(T, x, z, w, d, y0, y1, ux, uz, c0, c1, nom) { // une boîte orientée (cheminées, piliers), sans dessous ; nom : la matière des côtés (uv métriques)
    const vx = -uz, vz = ux, hw = w / 2, hd = d / 2, q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((c) => [x + ux * c[0] + vx * c[1], z + uz * c[0] + vz * c[1]]);
    if (aire(q) < 0) q.reverse(); const k = nom ? coucheM(nom) : 0;
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]); T.quad4(P3(b[0], y0, b[1]), P3(a[0], y0, a[1]), P3(a[0], y1, a[1]), P3(b[0], y1, b[1]), c0, c0, c1, c1, nom ? [l / 3, y0 / 3, 0, y0 / 3, 0, y1 / 3, l / 3, y1 / 3] : null, k); }
    dessus(T, q[0], q[1], q[2], y1, c1); dessus(T, q[0], q[2], q[3], y1, c1);
  }
  function triHaut(T, A, B, Cc, col) { // un triangle quelconque, tourné vers le haut
    if ((B[2] - A[2]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[2] - A[2]) < 0) T.tri(A[0], A[1], A[2], Cc[0], Cc[1], Cc[2], B[0], B[1], B[2], col); else T.tri(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2], col);
  }
  // le pan d'un toit : de l'égout a → c (à yE) vers le faîtage ; uv : u le long de l'égout, v le long de la pente depuis l'égout (m / 3)
  function panToit(T, a, c, ra, rc, yE, yF, R, tri) {
    const ex = c[0] - a[0], ez = c[1] - a[1], el = Math.hypot(ex, ez) || 1, eux = ex / el, euz = ez / el;
    const U = (q) => ((q[0] - a[0]) * eux + (q[1] - a[1]) * euz) / 3, Vp = (q, y) => Math.hypot((q[0] - a[0]) * euz - (q[1] - a[1]) * eux, y - yE) / 3;
    const k = coucheM(R.toit), cT = coulM(R.toit, R.hexT, 1), cE = coulM(R.toit, R.hexT, 0.84), cS = lin('#5E4A3E');
    if (tri) { T.tri(c[0], yE, c[1], a[0], yE, a[1], ra[0], yF, ra[1], cE, cE, cT, [U(c), 0, U(a), 0, U(ra), Vp(ra, yF)], k); T.tri(a[0], yE, a[1], c[0], yE, c[1], ra[0], yF, ra[1], cS); }
    else { T.quad4(P3(c[0], yE, c[1]), P3(a[0], yE, a[1]), P3(ra[0], yF, ra[1]), P3(rc[0], yF, rc[1]), cE, cE, cT, cT, [U(c), 0, U(a), 0, U(ra), Vp(ra, yF), U(rc), Vp(rc, yF)], k); T.quad(P3(a[0], yE, a[1]), P3(c[0], yE, c[1]), P3(rc[0], yF, rc[1]), P3(ra[0], yF, ra[1]), cS); }
  }
  // toits à pans : chaque sommet du mur (débordé de 0,35 m) monte vers son point du faîtage ; les pignons sont des triangles de mur
  function toitPente(T, p, b, box, forme, pente, R) {
    if (!box) return false;
    const n = p.length, deb = forme === 'fleche' ? 0.25 : 0.35, ux = box.ux, uz = box.uz, sommet = R.sommet;
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
          const sgn = ra[2] + rc[2] > 0 ? 1 : -1, pa = p[i], pc = p[(i + 1) % n], fx = cx + ux * sgn * box.hl, fz = cz + uz * sgn * box.hl, sf = ((fx - pa[0]) * ex + (fz - pa[1]) * ez) / el, cm = coulM(R.mur, R.hexM, 1);
          const e = echUV(R.mur), du = decUV[0], dv = decV(R.mur); // les uv du mur dessous (quadF) : le pignon le prolonge sans couture
          T.tri(pc[0], sommet, pc[1], pa[0], sommet, pa[1], fx, yF, fz, cm, cm, cm, [el / e + du, (sommet - R.base) / e + dv, du, (sommet - R.base) / e + dv, sf / e + du, (yF - R.base) / e + dv], coucheM(R.mur));
          continue;
        }
      }
      panToit(T, a, c, ra, rc, yE, yF, R, Math.abs(ra[2] - rc[2]) < 0.05);
    }
    if (forme === 'fleche') { const bo = lin('#D9B24A'); T.tri(cx - 0.06, yF + 1.4, cz, cx + 0.06, yF + 1.4, cz, cx, yF - 0.2, cz, bo); T.tri(cx + 0.06, yF + 1.4, cz, cx - 0.06, yF + 1.4, cz, cx, yF - 0.2, cz, bo); T.tri(cx, yF + 1.4, cz - 0.06, cx, yF + 1.4, cz + 0.06, cx, yF - 0.2, cz, bo); T.tri(cx, yF + 1.4, cz + 0.06, cx, yF + 1.4, cz - 0.06, cx, yF - 0.2, cz, bo); }
    return true;
  }
  // toit en pavillon tronqué (formes concaves) : un bandeau en pente vers le polygone rétréci, puis un dessus plat
  function toitPavillon(T, p, pente, A, R) {
    const n = p.length, sommet = R.sommet; let d = Math.min(2.6, Math.sqrt(A) * 0.22); let q = null;
    for (let essai = 0; essai < 3 && !q; essai++, d *= 0.6) { const c = decaler(p, -d); if (simple(c) && aire(c) > A * 0.08 && c.every((v) => dansPoly(p, v[0], v[1]))) q = c; }
    if (!q) return false;
    const ext = decaler(p, 0.35), yE = sommet - 0.35 * pente, yF = sommet + d * pente;
    for (let i = 0; i < n; i++) panToit(T, ext[i], ext[(i + 1) % n], q[i], q[(i + 1) % n], yE, yF, R, false);
    const tr = trianguler(q); if (!tr.length) return false;
    const k = coucheM(R.toit), cT = coulM(R.toit, R.hexT, 1);
    for (let i = 0; i < tr.length; i += 3) dessus(T, q[tr[i]], q[tr[i + 1]], q[tr[i + 2]], yF, cT, k);
    return true;
  }
  function dessus(T, a, b, c, y, col, k) { // un triangle horizontal tourné vers le ciel ; k : la couche (uv : x / 3, z / 3)
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), uv = k ? [a[0] / 3, a[1] / 3, (cr > 0 ? c : b)[0] / 3, (cr > 0 ? c : b)[1] / 3, (cr > 0 ? b : c)[0] / 3, (cr > 0 ? b : c)[1] / 3] : null;
    if (cr > 0) T.tri(a[0], y, a[1], c[0], y, c[1], b[0], y, b[1], col, col, col, uv, k); else T.tri(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], col, col, col, uv, k);
  }
  function toitPlat(T, p, hp, sansParapet, R) { // plat (gravillons ou zinc), avec acrotère (les murs montent déjà de hp)
    const n = p.length, sommet = R.sommet, tr = trianguler(p), k = coucheM(R.toit), cp = coulM(R.toit, R.hexT, 1);
    for (let i = 0; i < tr.length; i += 3) dessus(T, p[tr[i]], p[tr[i + 1]], p[tr[i + 2]], sommet, cp, k);
    if (sansParapet) return;
    const q = decaler(p, -0.25), y1 = sommet + hp, cH = lin('#E2DCD2'), ci = coulM(R.mur, R.hexM, 0.82), km = coucheM(R.mur);
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], ia = q[i], ic = q[(i + 1) % n], l = Math.hypot(ic[0] - ia[0], ic[1] - ia[1]);
      T.quad(P3(c[0], y1, c[1]), P3(a[0], y1, a[1]), P3(ia[0], y1, ia[1]), P3(ic[0], y1, ic[1]), cH);
      T.quad4(P3(ia[0], sommet, ia[1]), P3(ic[0], sommet, ic[1]), P3(ic[0], y1, ic[1]), P3(ia[0], y1, ia[1]), ci, ci, ci, ci, [0, 0, l / 3, 0, l / 3, hp / 3, 0, hp / 3], km);
    }
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
    eauMat = new THREE.MeshPhongMaterial({ color: '#5E9AA0', specular: '#FFF4E0', shininess: 80, transparent: true, opacity: 0.8, normalMap: texRides, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false, emissive: '#1C4A55', emissiveIntensity: 0.1 });
    eau = new THREE.Mesh(g, eauMat); eau.renderOrder = 2; eau.receiveShadow = false; eau.name = 'eau'; scene.add(eau);
  }
  let ponts = null, clotures = null;
  const CH = typeof PMONDE !== 'undefined' && PMONDE.CHAUSSEE > 0 ? PMONDE.CHAUSSEE : 0.06; // l'épaisseur de la chaussée (monde.js : on marche dessus)
  function construirePonts() {
    const parts = [];
    for (const T of monde.tabliers || []) {
      const ax = T.ax, az = T.az, bx = T.bx, bz = T.bz, len = T.len, w = T.w, eauY = niveauEau((ax + bx) / 2, (az + bz) / 2) - 1.2;
      // le tablier : le profil de monde.tabliers (C7 : une seule formule ; monde.hauteur suit la chaussée, posée 6 cm au-dessus du profil)
      const N = T.n, prof = T.prof;
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
      parts.push({ geo, col: '#CDBC9E', m: repere, nom: 'pierre' });
      // parapets (avec leur couvertine) et chaussée, tronçon par tronçon le long du profil
      for (let k = 0; k < N; k++) {
        const s0 = len * k / N, s1 = len * (k + 1) / N, y0 = prof[k], y1 = prof[k + 1], lg = Math.hypot(s1 - s0, y1 - y0), pe = Math.atan2(y1 - y0, s1 - s0), m = repere.clone().multiply(M.matrice({ x: (s0 + s1) / 2, y: (y0 + y1) / 2, rz: pe }));
        for (const sv of [-1, 1]) { parts.push({ geo: new THREE.BoxGeometry(lg + 0.02, 0.95, 0.4).translate(0, 0.47, sv * (w / 2 - 0.2)), col: '#D6C8AE', m: m.clone(), nom: 'pierre' }, { geo: new THREE.BoxGeometry(lg + 0.04, 0.14, 0.52).translate(0, 0.98, sv * (w / 2 - 0.2)), col: '#DCD1BC', m: m.clone(), nom: 'taille' }); }
        parts.push({ geo: new THREE.BoxGeometry(lg + 0.02, CH, w - 0.8).translate(0, CH / 2, 0), col: '#8F8A84', m });
      }
    }
    if (!parts.length) return;
    const g = M.assembler(parts);
    if (BATI) { // uv métriques selon la normale (dessus : x, z ; côtés : le plan vertical), la couche et la couleur de la matière de chaque morceau
      const P = g.attributes.position.array, N = g.attributes.normal.array, Cc = g.attributes.color.array, nv = P.length / 3, uv = new Float32Array(nv * 2), kk = new Float32Array(nv); let o = 0;
      for (const q of parts) {
        const m = q.geo.index ? q.geo.index.count : q.geo.attributes.position.count, k = q.nom ? coucheM(q.nom) : 0, c = q.nom ? coulM(q.nom, q.col, 1) : null;
        for (let v = o; v < o + m && v < nv; v++) {
          const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], nx = Math.abs(N[3 * v]), ny = Math.abs(N[3 * v + 1]), nz = Math.abs(N[3 * v + 2]);
          if (ny > 0.7) { uv[2 * v] = x / 3; uv[2 * v + 1] = z / 3; } else if (nx > nz) { uv[2 * v] = z / 3; uv[2 * v + 1] = y / 3; } else { uv[2 * v] = x / 3; uv[2 * v + 1] = y / 3; }
          kk[v] = k; if (c) { Cc[3 * v] = c[0]; Cc[3 * v + 1] = c[1]; Cc[3 * v + 2] = c[2]; }
        }
        o += m;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('couche', new THREE.BufferAttribute(kk, 1));
    }
    ponts = new THREE.Mesh(g, BATI ? BATI.materiau() : M.MAT.vertex); ponts.castShadow = true; ponts.receiveShadow = true; ponts.name = 'ponts'; scene.add(ponts);
    for (const q of parts) q.geo.dispose();
    ponts.geometry.computeBoundingSphere();
  }
  function construireClotures() { // les zones interdites : un muret de moellons coiffé d'une couvertine, des piliers de pierre de taille, qui suit le terrain
    const T = new Tampon(!!BATI), nom = 'pierre', hex = '#CDBE9F', cc = lin('#E4DACA'), kP = coucheM(nom), cb = coulM(nom, hex, 0.66), ch = coulM(nom, hex, 1);
    const pb = coulM('taille', '#D8CDB6', 0.8), ph = coulM('taille', '#D8CDB6', 1), chap = lin('#E9E1D3');
    for (const z of carte.interdit || []) {
      const p = orienter(z && z.p); if (!p) continue; let su = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), nb = Math.max(1, Math.ceil(len / 2.4));
        for (let k = 0; k < nb; k++) {
          const t0 = k / nb, t1 = (k + 1) / nb, x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
          const g0 = H0(x0, z0), g1 = H0(x1, z1), ux = (x1 - x0), uz = (z1 - z0), l = Math.hypot(ux, uz) || 1, nx = uz / l * 0.2, nz = -ux / l * 0.2, hm = 1.05, u0 = su / 3, u1 = (su + l) / 3; su += l;
          // les deux faces (moellons, uv métriques), le dessus
          T.quad4(P3(x1 + nx, g1 - 0.3, z1 + nz), P3(x0 + nx, g0 - 0.3, z0 + nz), P3(x0 + nx, g0 + hm, z0 + nz), P3(x1 + nx, g1 + hm, z1 + nz), cb, cb, ch, ch, [u1, (g1 - 0.3) / 3, u0, (g0 - 0.3) / 3, u0, (g0 + hm) / 3, u1, (g1 + hm) / 3], kP);
          T.quad4(P3(x0 - nx, g0 - 0.3, z0 - nz), P3(x1 - nx, g1 - 0.3, z1 - nz), P3(x1 - nx, g1 + hm, z1 - nz), P3(x0 - nx, g0 + hm, z0 - nz), cb, cb, ch, ch, [u0, (g0 - 0.3) / 3, u1, (g1 - 0.3) / 3, u1, (g1 + hm) / 3, u0, (g0 + hm) / 3], kP);
          const A1 = P3(x0 - nx * 1.3, g0 + hm, z0 - nz * 1.3), B1 = P3(x0 + nx * 1.3, g0 + hm, z0 + nz * 1.3), C1 = P3(x1 + nx * 1.3, g1 + hm, z1 + nz * 1.3), D1 = P3(x1 - nx * 1.3, g1 + hm, z1 - nz * 1.3);
          triHaut(T, A1, B1, C1, cc); triHaut(T, A1, C1, D1, cc);
          if (k % 2 === 0) { cube(T, x0, z0, 0.55, 0.55, g0 - 0.3, g0 + 1.45, ux / l, uz / l, pb, ph, 'taille'); cube(T, x0, z0, 0.66, 0.66, g0 + 1.45, g0 + 1.6, ux / l, uz / l, chap, chap); }
        }
      }
    }
    if (T.vide()) return; clotures = new THREE.Mesh(T.geometrie(), BATI ? BATI.materiau() : M.MAT.vertex); clotures.castShadow = true; clotures.receiveShadow = true; clotures.name = 'clotures'; scene.add(clotures);
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
  // une toile (u = φ / 2π, v = θ / π) : dégradé de fin d'après-midi (zénith bleu franc, horizon pâle et bleuté = la brume), halo doré du
  // soleil bas, cumulus ; sans PDECOR, les montagnes du Bugey peintes (avec PDECOR, son horizon de relief réel les remplace)
  let ciel = null;
  function construireCiel() {
    const Wt = PALIERS[QUAL.niveau].ciel, Ht = Wt / 2, cvs = document.createElement('canvas'); cvs.width = Wt; cvs.height = Ht;
    const c = cvs.getContext('2d'), w = Wt, h = Ht, montagnes = !decor;
    const g = c.createLinearGradient(0, 0, 0, h / 2); g.addColorStop(0, '#4C8ED2'); g.addColorStop(0.42, '#78B2E3'); g.addColorStop(0.78, '#B4D2E8'); g.addColorStop(1, C.brume);
    c.fillStyle = g; c.fillRect(0, 0, w, h / 2); c.fillStyle = C.brume; c.fillRect(0, h / 2, w, h / 2);
    // le soleil, à sa vraie place, et sa lumière chaude : un halo large et doux, plus doré vers l'horizon
    const th = Math.acos(SOLEIL[1]), ph = Math.atan2(SOLEIL[2], -SOLEIL[0]), sx = ((ph / TAU) % 1 + 1) % 1 * w, sy = th / Math.PI * h;
    for (const dx of [-w, 0, w]) {
      c.save(); c.translate(sx + dx, h / 2); c.scale(2.6, 1); const gh = c.createRadialGradient(0, 0, 0, 0, 0, h * 0.34); gh.addColorStop(0, 'rgba(255,214,168,.55)'); gh.addColorStop(0.45, 'rgba(255,220,186,.22)'); gh.addColorStop(1, 'rgba(255,226,200,0)'); c.fillStyle = gh; c.fillRect(-h, -h * 0.4, 2 * h, h * 0.4); c.restore();
      const gs = c.createRadialGradient(sx + dx, sy, 0, sx + dx, sy, h * 0.42); gs.addColorStop(0, 'rgba(255,246,222,.98)'); gs.addColorStop(0.05, 'rgba(255,238,204,.9)'); gs.addColorStop(0.18, 'rgba(255,222,180,.38)'); gs.addColorStop(1, 'rgba(255,220,190,0)'); c.fillStyle = gs; c.fillRect(0, 0, w, h / 2);
    }
    // des cumulus : des grappes de boules douces, ventre gris-lavande, bord doré du côté du soleil, plus petits vers l'horizon
    const rnd = mulberry32(21), boule = (x, y, r, a, col) => { const g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, `rgba(${col},${a})`); g2.addColorStop(0.55, `rgba(${col},${a * 0.85})`); g2.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
    for (let i = 0; i < 20; i++) {
      const y = h * (0.28 + rnd() * 0.16), x = rnd() * w, taille = h * 0.02 * (0.7 + rnd() * 0.8) * (0.6 + (y / h - 0.28) * 3), nb = 5 + Math.floor(rnd() * 5), large = taille * (2.2 + rnd() * 2.2);
      const ds = Math.min(Math.abs(x - sx), w - Math.abs(x - sx)) / w, dore = ds < 0.18 ? '255,236,206' : '255,252,246';
      for (const dx of [-w, 0, w]) {
        if (x + dx < -large * 2 || x + dx > w + large * 2) continue;
        boule(x + dx, y + taille * 0.55, large * 0.9, 0.26, '176,180,206');
        for (let k = 0; k < nb; k++) { const u = k / (nb - 1) - 0.5, r = taille * (1.15 - Math.abs(u) * 0.9) * (0.85 + rnd() * 0.3); boule(x + dx + u * large * 1.6, y - r * 0.35, r * 1.25, 0.92, dore); }
      }
    }
    if (montagnes) { // repli sans PDECOR : les montagnes du Bugey, trois plans de crêtes de plus en plus pâles
      const plans = [['#C2CEE2', 0.07, 0.5, 31], ['#B2C3DA', 0.048, 0.62, 47], ['#A6BCCB', 0.027, 0.7, 63]];
      for (const [col, amp, rug, graine] of plans) {
        const r2 = mulberry32(graine), pts = 48, hs = []; for (let i = 0; i < pts; i++) hs.push(r2());
        c.fillStyle = col; c.beginPath(); c.moveTo(0, h / 2 + 2);
        for (let x = 0; x <= w; x += w / 512) { const u = x / w * pts, i = Math.floor(u), f = u - i, a = hs[i % pts], b = hs[(i + 1) % pts], s2 = f * f * (3 - 2 * f), v = a + (b - a) * s2, det = Math.sin(x / w * TAU * 23 + graine) * 0.08 * rug + Math.sin(x / w * TAU * 61) * 0.03 * rug; c.lineTo(x, h / 2 - h * amp * (0.35 + 0.65 * v + det)); }
        c.lineTo(w, h / 2 + 2); c.closePath(); c.fill();
      }
    }
    const gb = c.createLinearGradient(0, h / 2 - h * 0.035, 0, h / 2 + 4); gb.addColorStop(0, 'rgba(211,222,231,0)'); gb.addColorStop(1, C.brume); c.fillStyle = gb; c.fillRect(0, h / 2 - h * 0.035, w, h * 0.035 + 4);
    const tx = new THREE.CanvasTexture(cvs); tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; tx.name = 'ciel';
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
        const g = HS(p.x, p.z) + 0.02; if (p.y < g) { p.y = g; p.sol = true; p.ax = 1; p.ay = 0; p.az = 0; p.a = -HP; }
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
      const o = OBJ.liste[i]; if (!o || !fini(+o.x) || !fini(+o.z)) continue; const x = +o.x, z = +o.z, y = HS(x, z), col = COUL_OBJ[o.objet] || '#FFFFFF';
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
      affiche(e);
      try { AV.animer(av, e, dt, t, AFF.x, AFF.y, AFF.z); } catch (err) { signaler('animer', err); }
      if (e.id === idCam && !camMorte) av.groupe.visible = false; // la vue subjective : on ne se voit pas
      if (ombres && av.groupe.visible && e.vivant !== false && no < 16 && fini(AFF.x)) { const g = HS(AFF.x, AFF.z), hh = Math.max(0, AFF.y - g), k = 1 / (1 + hh * 0.6); _v.set(AFF.x, g + 0.03, AFF.z); _q.identity(); _s.set(1.2 * k, 1, 1.2 * k); _m.compose(_v, _q, _s); ombre.setMatrixAt(no++, _m); }
    }
    acteurs.forEach(balayer);
    ombre.count = no; ombre.visible = no > 0; if (no) ombre.instanceMatrix.needsUpdate = true;
  }
  function cacherActeurs() { acteurs.forEach((av) => { av.groupe.visible = false; }); if (FX.ombres) FX.ombres.im.visible = false; }
  function trouver(jeu, id) { const es = jeu && jeu.entites; if (!es) return null; for (let i = 0; i < es.length; i++) if (es[i] && es[i].id === id) return es[i]; return null; }

  // ═══════════════════════════════ l'arme en vue subjective (scène à part) ═══════════════════════════════
  const FP = { groupe: null, arme: null, mains: null, flash: null, id: 'rafale', col: '', recul: 0, phase: 0, swx: 0, swy: 0, lastYaw: 0, lastPitch: 0, change: 0, nouvelle: '', recharge: 0, flashT: 0 };
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
    // le balancement de marche (C3 : la phase φ de la foulée de la caméra, une descente douce par pas, le côté une fois par foulée ;
    // × 0,2 en visée), l'inertie de la visée, le recul, la recharge, le changement d'arme
    const k = CAM.k * (1 - 0.8 * (e.vise > 0 ? Math.min(1, e.vise) : 0)) * CAM.bal, ph = CAM.phi;
    FP.phase = ph; const bobY = -0.006 * k * (1 - Math.cos(2 * ph)) / 2, bobX = 0.008 * k * Math.sin(ph);
    let dyaw = CAM.yaw - FP.lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); const dp = CAM.pitch - FP.lastPitch; FP.lastYaw = CAM.yaw; FP.lastPitch = CAM.pitch;
    FP.swx = (FP.swx + borne(dyaw, -0.2, 0.2) * 0.35) * Math.exp(-dt * 9); FP.swy = (FP.swy - borne(dp, -0.2, 0.2) * 0.35) * Math.exp(-dt * 9);
    FP.recul *= Math.exp(-dt * 13);
    let rech = 0; const fin = +e.rechargeJusqua, tj = +jeu.temps; if (fini(fin) && fini(tj) && fin > tj) { const A = REG ? REG.arme(e.arme) : null, du = A ? A.recharge : 1.6; rech = Math.sin(Math.PI * borne(1 - (fin - tj) / du, 0, 1)); }
    const ch = FP.change > 0 ? Math.sin(Math.PI * (1 - FP.change / 0.36)) : 0;
    g.position.set(BASE_FP[0] + bobX + FP.swx * 0.12, BASE_FP[1] + bobY + FP.swy * 0.12 - rech * 0.16 - ch * 0.3 + Math.sin(t * 1.7) * 0.002, BASE_FP[2] + FP.recul * 0.07 + (e.accroupi ? 0.02 : 0));
    const gr = g.rotation; gr._x = 0.03 + FP.recul * 0.16 - rech * 0.35 + FP.swy * 0.4; gr._y = 0.05 + FP.swx * 0.6; gr._z = -0.05 + rech * 0.55 + FP.swx * 0.3; tourner(g); // champs d'Euler + quaternion (pas de mise en boîte, voir avatars.js)
    // l'éclair au bout du canon
    if (FP.flashT > 0) { FP.flashT -= dt; const b = AV ? AV.BOUCHE[FP.id] : [0, 0.07, -0.47]; FP.flash.visible = FP.flashT > 0; FP.flash.position.set(b[0], b[1], b[2] - 0.03); const s2 = 0.07 + FP.flashT * 1.4; FP.flash.scale.set(s2, s2, s2); FP.flash.rotation._z = (frame * 1.3) % TAU; tourner(FP.flash); } else FP.flash.visible = false;
  }
  function tirSubjectif(col) { FP.recul = Math.min(1.6, FP.recul + 1); FP.flashT = 0.055; const cl = lin(col); FP.flash.material.color.setRGB(cl[0] * 0.4 + 0.6, cl[1] * 0.4 + 0.6, cl[2] * 0.4 + 0.6); }
  function boucheSubjective(v) { // le bout du canon de la vue subjective, en coordonnées monde (approché : la caméra de l'arme suit la vraie)
    const b = AV ? AV.BOUCHE[FP.id] : [0, 0.07, -0.47]; v.set(BASE_FP[0] + b[0], BASE_FP[1] + b[1], BASE_FP[2] + b[2]); v.multiplyScalar(1.0); return camera.localToWorld(v);
  }

  // ═══════════════════════════════ la caméra ═══════════════════════════════
  // CAM.f : la caméra subjective de PCORPS.camera (C1 balancement calé sur la foulée, C2 œil lissé par Holt, creux d'atterrissage) ;
  // CAM.yaw / CAM.pitch : le regard affiché (celui de la simulation + les variations pas encore consommées : PCONTROLES.enAttente) ;
  // CAM.phi, CAM.k : la phase de la foulée et la part du balancement (pour l'arme subjective, C3) ; CAM.bal : le réglage (1, 0,5 ou 0)
  const CAM = { oeil: JOUEUR.oeil || 1.6, phase: 0, phi: 0, k: 0, bal: 1, balancement: 'normal', f: null, yaw: 0, pitch: 0, secousse: 0, kick: 0, morte: 0, par: null, yawM: 0, pitchM: 0, id: null, rx: 0, ry: 0, rz: 0, lx: 0, ly: 0, lz: 0, survolT: 0 };
  const BAL = { normal: 1, doux: 0.5, aucun: 0 };
  const SURVOL = { centre: null, rayon: 165, hauteur: 58, vitesse: 0.045 };
  // la vue de l'entité suivie, telle que PCORPS.camera la lit (objet réutilisé : position affichée, œil affiché, posture)
  const VUE = { x: 0, y: 0, z: 0, auSol: true, vy: 0, corpsV2: true, oeil: JOUEUR.oeil || 1.6, vers: 'debout', course: false, vise: 0, accroupi: false };
  // la position affichée d'une entité : a + (x − a)·alpha (ax, ay, az, aoeil posés par jeu.js au début de chaque pas ; repli sur x s'ils
  // manquent, et pas d'interpolation à travers une téléportation) → AFF (réutilisé)
  const AFF = { x: 0, y: 0, z: 0, oeil: 0 };
  let ALPHA = 1;
  function affiche(e) {
    const x = +e.x, y = +e.y, z = +e.z, a = ALPHA;
    AFF.x = x; AFF.y = y; AFF.z = z; AFF.oeil = +e.oeil;
    if (a >= 1) return AFF;
    const ax = +e.ax, ay = +e.ay, az = +e.az;
    if (!(ax - ax === 0 && ay - ay === 0 && az - az === 0) || Math.abs(x - ax) + Math.abs(z - az) > 4 || Math.abs(y - ay) > 4) return AFF;
    AFF.x = ax + (x - ax) * a; AFF.y = ay + (y - ay) * a; AFF.z = az + (z - az) * a;
    const ao = +e.aoeil; if (ao - ao === 0 && AFF.oeil - AFF.oeil === 0) AFF.oeil = ao + (AFF.oeil - ao) * a;
    return AFF;
  }
  function cameraCorps() { // créée à la première image (PCORPS est chargé avant rendu.js dans la page ; l'atelier peut s'en passer)
    if (!CAM.f && typeof PCORPS !== 'undefined' && PCORPS && typeof PCORPS.camera === 'function') CAM.f = PCORPS.camera({ balancement: CAM.balancement });
    return CAM.f;
  }
  function regard(e, suivi) { // le regard affiché : celui de la simulation, plus ce que les commandes ont pris et que le pas n'a pas encore consommé
    let yaw = +e.yaw || 0, pitch = +e.pitch || 0;
    if (suivi && typeof PCONTROLES !== 'undefined' && PCONTROLES && typeof PCONTROLES.enAttente === 'function') {
      let w = null; try { w = PCONTROLES.enAttente(); } catch (err) { w = null; }
      if (w) { const dy = +w.dyaw, dp = +w.dpitch; if (dy - dy === 0) yaw += dy; if (dp - dp === 0) pitch += dp; }
    }
    CAM.yaw = yaw; CAM.pitch = borne(pitch, -1.45, 1.45);
  }
  function poserCameraJeu(jeu, e, dt, t) {
    affiche(e); const x = AFF.x, y = AFF.y, z = AFF.z; if (!fini(x) || !fini(y) || !fini(z)) return false;
    // l'œil de la posture : celui de la simulation (corps v2, interpolé) ; au régime historique, l'accroupi lissé comme avant
    if (e.corpsV2 && fini(AFF.oeil)) CAM.oeil = AFF.oeil;
    else { const cible = e.accroupi ? (JOUEUR.oeilAccroupi || 1.0) : (JOUEUR.oeil || 1.6); CAM.oeil += (cible - CAM.oeil) * Math.min(1, dt * 12); }
    CAM.secousse *= Math.exp(-dt * 7); CAM.kick *= Math.exp(-dt * 12);
    regard(e, true);
    const yaw = CAM.yaw, pitch = CAM.pitch, sh = CAM.secousse;
    if (e.vivant === false) { // éliminé : on s'élève un peu, on penche, on regarde celui qui nous a repeint
      CAM.morte = Math.min(1, CAM.morte + dt * 1.6); const m = CAM.morte, s = m * m * (3 - 2 * m);
      let yw = yaw, pt = pitch; const tueur = CAM.par != null ? trouver(jeu, CAM.par) : null;
      if (tueur && fini(+tueur.x)) { yw = Math.atan2(-(+tueur.x - x), -(+tueur.z - z)); const dd = Math.hypot(+tueur.x - x, +tueur.z - z); pt = Math.atan2((+tueur.y + 1.2) - (y + 2.4), dd); }
      CAM.yawM += Math.atan2(Math.sin(yw - CAM.yawM), Math.cos(yw - CAM.yawM)) * Math.min(1, dt * 3 * s); CAM.pitchM += (pt - 0.12 - CAM.pitchM) * Math.min(1, dt * 3 * s);
      camera.position.set(x, y + CAM.oeil + s * 1.2, z); const cr = camera.rotation; cr._x = CAM.pitchM; cr._y = CAM.yawM; cr._z = s * 0.18; tourner(camera);
      CAM.k = 0; if (CAM.f) CAM.f.remettre(); // au retour, l'œil repart net
      return true;
    }
    CAM.morte = 0; CAM.yawM = yaw; CAM.pitchM = pitch;
    // C1 + C2 : PCORPS.camera sur la position affichée (sans PCORPS : l'œil net, sans balancement)
    const f = cameraCorps(); let cy = y + CAM.oeil, cote = 0, roulis = 0;
    if (f) {
      VUE.x = x; VUE.y = y; VUE.z = z; VUE.auSol = e.auSol !== false; VUE.vy = +e.vy || 0; VUE.oeil = CAM.oeil;
      VUE.course = !!e.course; VUE.vers = e.corpsV2 ? (e.vers || e.posture || 'debout') : (e.accroupi ? 'accroupi' : 'debout'); VUE.vise = e.vise > 0 ? +e.vise : 0;
      const o = f(VUE, dt > 0 ? dt : 1e-4); cy = o.y; cote = o.cote; roulis = o.roulis; CAM.phi = o.phase; CAM.k = o.k;
    } else CAM.k = 0;
    CAM.phase = CAM.phi;
    camera.position.set(x + Math.cos(yaw) * cote, cy + Math.sin(t * 61) * sh * 0.05, z - Math.sin(yaw) * cote);
    const cr = camera.rotation; cr._x = pitch + CAM.kick * 0.012 + Math.sin(t * 53) * sh * 0.02; cr._y = yaw + Math.sin(t * 47) * sh * 0.02; cr._z = roulis; tourner(camera); // ordre YXZ fixé à l'init
    return true;
  }
  // PRENDU.reglages({ balancement: 'normal' | 'doux' | 'aucun' }) → les réglages en cours (copie)
  function reglages(o) {
    if (o && BAL[o.balancement] != null) { CAM.balancement = o.balancement; CAM.bal = BAL[o.balancement]; if (CAM.f) CAM.f.regler({ balancement: o.balancement }); }
    return { balancement: CAM.balancement };
  }
  function poserCameraSurvol(t) {
    const A = carte.zones && carte.zones.arene, c = SURVOL.centre || (A && Array.isArray(A.centre) ? A.centre : [0, 0]), cx = +c[0] || 0, cz = +c[1] || 0;
    const a = t * SURVOL.vitesse + 0.6, r = SURVOL.rayon + Math.sin(t * 0.07) * 25, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, gc = H0(cx, cz);
    const y = Math.max(H0(x, z) + 22, gc + SURVOL.hauteur + Math.sin(t * 0.05) * 12);
    camera.position.set(x, y, z); _v.set(cx + Math.cos(a + 0.9) * 30, gc + 6, cz + Math.sin(a + 0.9) * 30); camera.lookAt(_v);
  }

  // ═══════════════════════════════ init, taille, qualité ═══════════════════════════════
  function construireDecor() { // PDECOR : mobilier, murs, enseignes et bâtiments remarquables, ambiance, horizon (avant les bâtiments : ils lisent decor.facades)
    if (!PDEC) return;
    decor = PDEC.creer(carte, monde, { qualite: QUAL.niveau, textures: PTX, bati: () => BATI, dossier }) || null;
    if (decor) scene.add(decor.groupe);
  }
  function construireVegetation() { // PVEGETATION : les arbres LiDAR par espèce, les haies, l'herbe ; sinon, les anciens arbres instanciés
    if (PVEG) { veg = PVEG.creer(carte, monde, { qualite: QUAL.niveau, dossier }) || null; if (veg) { scene.add(veg.groupe); return; } }
    construireArbres();
  }
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
      // les textures du décor : WebGL2 ou non (sans WebGL2, PTEXTURES.bati rend null : les couleurs seules), la taille selon la qualité
      if (PTX) { try { PTX.init(renderer); PTX.qualite(QUAL.niveau); } catch (e) { signaler('PTEXTURES.init', e); } }
      scene = new THREE.Scene(); scene.fog = new THREE.Fog(C.brume, PALIERS[QUAL.niveau].brume[0], PALIERS[QUAL.niveau].brume[1]);
      camera = new THREE.PerspectiveCamera(60, 2, 0.1, PALIERS[QUAL.niveau].brume[1] + 40); camera.rotation.order = 'YXZ'; scene.add(camera);
      hemi = new THREE.HemisphereLight(C.cielHemi, C.solHemi, C.iHemi);
      soleil = new THREE.DirectionalLight(C.soleil, C.iSoleil); soleil.castShadow = true; soleil.shadow.mapSize.set(PALIERS.haute.ombres, PALIERS.haute.ombres); soleil.shadow.bias = -0.0006; soleil.shadow.normalBias = 0.04;
      const sc = soleil.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
      scene.add(hemi, soleil, soleil.target);
      const etapes = [['index des rues', construireIndexRues], ['matières', matieres], ['décor', construireDecor], ['ciel', construireCiel], ['sol', construireSol], ['bâtiments', construireBatiments], ['eau', construireEau], ['ponts', construirePonts], ['clôtures', construireClotures], ['végétation', construireVegetation], ['effets', construireEffets], ['objets', construireObjets], ['arme', construireArme]];
      for (const [nom, f] of etapes) { try { f(); } catch (e) { signaler(nom, e); } }
      if (!FX.traits) return false; // sans les effets, rien ne tient : on préfère le panneau sans 3D
      try { habillerSol(); } catch (e) { signaler('habiller le sol', e); }
      webgl = true; pret = true; perdu = false; frame = 0; tPrecImage = 0; lumA = 1; memoireSale = true;
      taille(typeof window !== 'undefined' ? window.innerWidth : 844, typeof window !== 'undefined' ? window.innerHeight : 390);
      if (ARBRES.types.length) majArbres(0, 0, true);
      return true;
    } catch (e) { signaler('init', e); pret = false; webgl = false; return false; }
  }
  const partage = (m) => !!(m && ((m.userData && m.userData.partagee) || (M.MATS && [...M.MATS.values()].includes(m))));
  function liberer() { // une seconde init : on rend tout ce qui est propre au décor précédent (jamais les textures ni les matériaux partagés de PTEXTURES)
    try {
      acteurs.forEach((av) => AV && AV.liberer(av)); acteurs.clear(); jeuVu = null;
      if (veg) { try { veg.liberer(); } catch (e) { signaler('végétation.liberer', e); } if (veg.groupe && veg.groupe.parent) veg.groupe.parent.remove(veg.groupe); veg = null; }
      if (decor) { try { decor.liberer(); } catch (e) { signaler('décor.liberer', e); } decor = null; }
      imgSol = null; imgArene = null;
      if (scene) scene.traverse((o) => { if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { if (m.map && !(m.map.userData && m.map.userData.partagee)) m.map.dispose(); if (!partage(m)) m.dispose(); } });
      for (const t of [texArene, texMasque]) if (t) t.dispose(); texArene = null; texMasque = null;
      if (cv) { cv.removeEventListener('webglcontextlost', surPerte, false); cv.removeEventListener('webglcontextrestored', surRetour, false); }
      renderer.dispose();
    } catch (e) { signaler('libérer', e); }
    renderer = null; scene = null; tuiles = []; nbTuiles = 0; voutesM = null; ARBRES.types = []; for (const k of Object.keys(FX)) delete FX[k]; OBJ.types = {}; OBJ.liste_types = null; OBJ.anneaux = null; barriere = null; eau = null; eauMat = null; ciel = null; sol = null; solMat = null; jupe = null; ponts = null; clotures = null; pret = false;
  }
  function surPerte(e) { if (e && e.preventDefault) e.preventDefault(); perdu = true; }
  function surRetour() { // Three recrée son état ; on remet les textures et les programmes à jour, le décor revient tel quel
    perdu = false;
    try {
      const maj = (o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { m.needsUpdate = true; for (const k of ['map', 'normalMap']) if (m[k]) m[k].needsUpdate = true; } };
      if (scene) scene.traverse(maj); if (sceneArme) sceneArme.traverse(maj);
      for (const t of [texArene, texMasque, texNeutre, texGris]) if (t) t.needsUpdate = true;
      if (PTX) PTX.retour(); if (decor) decor.retour();
      if (soleil && soleil.shadow.map) { soleil.shadow.map.dispose(); soleil.shadow.map = null; } ARBRES.cx = 1e9;
    } catch (e) { signaler('retour du contexte', e); }
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
  // les textures suivent la qualité CHOISIE (réglages, PRENDU.qualite) : haute et moyenne ont les mêmes tailles (seule l'anisotropie change) ;
  // vers ou depuis l'éco (tailles / 2), PTEXTURES est vidé puis refait et les bâtiments reconstruits avec les nouvelles matières (≈ 1 à 2 s
  // sur un téléphone lent), la photo de l'arène, le masque du sol et le ciel prennent la taille du palier. La qualité adaptative (auto) n'y
  // touche pas : en pleine partie, ce serait un arrêt d'image ; elle ne change que ce qui coûte à chaque image (résolution, ombres, brume,
  // décor, végétation, grain du sol). On compare au niveau réel de PTEXTURES : après une descente automatique, choisir le palier d'où l'on
  // vient ne refait rien, choisir l'éco les refait
  function texturesSuivent(q) {
    if (PTX) {
      try {
        const avant = PTX.qualite(); PTX.qualite(q);
        if ((avant === 'eco') !== (q === 'eco')) {
          viderBatiments(); PTX.vider(); matieres(); construireBatiments(); for (const o of [clotures, ponts]) if (o) o.material = BATI ? BATI.materiau() : M.MAT.vertex; USOL.tPaquet.value = paquetSol();
          // le décor tient aussi des matières de PTEXTURES (pierre, ouvertures, enseignes), vidées : il se refait au maj suivant, même s'il est
          // déjà à ce palier (le rattrapage après une descente automatique) ; decor.qualite ne refait rien quand le palier ne change pas
          if (decor) { try { const dq = decor.qualite(); decor.qualite(dq === 'eco' ? 'moyenne' : 'eco'); decor.qualite(q); } catch (e) { signaler('décor.qualite', e); } }
        }
      } catch (e) { signaler('textures de la qualité', e); }
    }
    adapterResolutions();
  }
  function texturesPour(q, auto) {
    if (!auto) texturesSuivent(q);
    if (USOL.uDetail.value) USOL.uDetail.value.set(...DETAIL_SOL[q]);
    if (decor) { try { decor.qualite(q); } catch (e) { signaler('décor.qualite', e); } }
    if (veg) { try { veg.qualite(q); } catch (e) { signaler('végétation.qualite', e); } }
    memoireSale = true;
  }
  function appliquerQualite(ancien, auto) {
    const p = PALIERS[QUAL.niveau]; if (!renderer) return;
    taille(W, H);
    const ombres = p.ombres > 0; if (renderer.shadowMap.enabled !== ombres) { renderer.shadowMap.enabled = ombres; scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) m.needsUpdate = true; }); }
    if (!ombres && soleil.shadow.map) { soleil.shadow.map.dispose(); soleil.shadow.map = null; }
    brumeK = 0; brume(1); ARBRES.cx = 1e9;
    if (ancien && ancien !== QUAL.niveau) texturesPour(QUAL.niveau, auto);
  }
  function qualite(q) {
    if (q === undefined) return QUAL.niveau;
    if (q === 'auto') { QUAL.fixe = false; QUAL.mesures = 0; QUAL.somme = 0; return QUAL.niveau; }
    if (!PALIERS[q]) return QUAL.niveau;
    QUAL.fixe = true;
    if (QUAL.niveau !== q) { const a = QUAL.niveau; QUAL.niveau = q; appliquerQualite(a, false); }
    else if (renderer) { try { texturesSuivent(q); } catch (e) { signaler('textures de la qualité', e); } memoireSale = true; } // déjà à ce palier par la qualité adaptative : les textures le rattrapent
    return QUAL.niveau;
  }
  // un changement de la qualité adaptative : quelques images de plus ne comptent pas (celle du changement reconstruit le décor)
  function changerPalier(n) { if (QUAL.niveau === n) return; const a = QUAL.niveau; QUAL.niveau = n; QUAL.ignorer = 5; appliquerQualite(a, true); }
  // fenêtres de 60 images : au-dessus de 28 ms on descend ; si ça ne va pas 10 % plus vite, c'est l'écran qui plafonne (on remonte, on se fige) ;
  // sous 18 ms pendant dix fenêtres on tente de remonter (deux échecs à un palier : on n'y retourne plus)
  function mesurer(ms) {
    if (QUAL.fixe || !(ms > 0) || ms > 250) return;
    if (QUAL.ignorer > 0) { QUAL.ignorer--; return; }
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
  function image(jeu, idCamera, dt, t, alpha) {
    if (!pret || !renderer) return;
    ALPHA = alpha >= 0 && alpha <= 1 ? +alpha : 1; // la part du pas en cours (boucle à pas fixe, § 2) ; 1 : la dernière position simulée
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (tPrecImage) mesurer(t0 - tPrecImage); tPrecImage = t0;
    if (perdu) return; // la simulation continue ; le décor reviendra avec le contexte
    dt = fini(dt) && dt > 0 ? Math.min(dt, 0.1) : 0; t = fini(t) ? t : 0; frame++;
    const e = jeu ? trouver(jeu, idCamera) : null;
    if (e && CAM.id !== idCamera) { CAM.id = idCamera; if (CAM.f) CAM.f.remettre(); FP.lastYaw = +e.yaw || 0; FP.lastPitch = +e.pitch || 0; }
    let enJeu = false;
    try { enJeu = !!(e && poserCameraJeu(jeu, e, dt, t)); } catch (err) { signaler('caméra', err); }
    if (!enJeu) { try { poserCameraSurvol(t); } catch (err) { signaler('survol', err); } }
    brume(enJeu ? 1 : QUAL.niveau === 'eco' ? 2.5 : 1.75); // le survol voit plus loin (pas de partie à faire tourner) : la vallée de l'Ain et le Bugey derrière
    camera.updateMatrixWorld();
    const cx = camera.position.x, cz = camera.position.z;
    try { if (jeu) { majActeurs(jeu, idCamera, dt, t, !!(e && e.vivant === false)); majObjets(jeu, +jeu.temps || t); } else { cacherActeurs(); cacherObjets(); } } catch (err) { signaler('acteurs', err); }
    try { majBarriere(cx, cz); } catch (err) { signaler('barrière', err); }
    try { majEffets(dt); } catch (err) { signaler('effets', err); }
    if (veg) { try { veg.maj(camera, t); } catch (err) { signaler('végétation', err); } } else if (ARBRES.types.length) { try { majArbres(cx, cz, false); } catch (err) { signaler('arbres', err); } }
    if (decor) { try { decor.maj(camera, t); } catch (err) { signaler('décor', err); } }
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
    // l'arme subjective (plus sombre sous une voûte)
    const armeVis = enJeu && e && e.vivant !== false;
    try { if (armeVis) majArme(e, jeu, dt, t); else if (FP.groupe) FP.groupe.visible = false; } catch (err) { signaler('arme', err); }
    if (armeVis && hemiA) { let sv = -1; try { sv = monde.sousVoute ? monde.sousVoute(+e.x, +e.z) : -1; } catch (err) { sv = -1; } lumA += ((sv >= 0 ? 0.5 : 1) - lumA) * Math.min(1, dt * 6); hemiA.intensity = C.iHemi * 1.15 * lumA; soleilA.intensity = C.iSoleil * 0.75 * lumA; }
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
  // la mémoire des textures (Mo, mipmaps comprises) : celles de PTEXTURES (ses comptes), de la végétation et du décor (les leurs), les nôtres
  // (matériaux des deux scènes, photos et masque du sol) et la carte d'ombre ; recalculée seulement quand quelque chose a changé
  const octetsTex = (t) => { const im = t.image || {}, w = im.width || im.naturalWidth || 0, h = im.height || im.naturalHeight || 0, d = im.depth || 1; return w * h * d * 4 * (t.generateMipmaps !== false && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1); };
  function memoire() {
    if (!memoireSale || !scene) return memoireMo;
    let o = 0; const vues = new Set(), exclus = new Set();
    for (const g of [veg && veg.groupe, decor && decor.groupe]) if (g) g.traverse((x) => exclus.add(x));
    const compter = (t) => { if (!t || !t.isTexture || vues.has(t) || (t.userData && t.userData.ptex)) return; vues.add(t); o += octetsTex(t); };
    const parcourir = (racine) => racine.traverse((x) => { if (exclus.has(x)) return; const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : []; for (const m of ms) for (const k of ['map', 'normalMap', 'alphaMap', 'emissiveMap']) compter(m[k]); });
    parcourir(scene); if (sceneArme) parcourir(sceneArme);
    for (const t of [texArene, texMasque]) compter(t);
    if (PTX) { try { o += PTX.stats().octets; } catch (e) { /* rien */ } }
    if (decor) { try { o += +decor.stats.memoire || 0; } catch (e) { /* rien */ } }
    if (veg) { try { o += +veg.stats.memoire || 0; } catch (e) { /* rien */ } }
    if (renderer && renderer.shadowMap.enabled) o += PALIERS.haute.ombres * PALIERS.haute.ombres * 8; // la carte d'ombre (couleur + profondeur)
    memoireMo = Math.round(o / 104857.6) / 10; memoireSale = false; return memoireMo;
  }
  const API = {
    init, taille, image, evenements, qualite, projeter, survol, reglages,
    get fov() { return fovV; }, get webgl() { return webgl && !perdu; }, get budgets() { return BUDGETS; },
    get _interne() { return { scene, sceneArme, camera, camArme, renderer, FP, FX, CAM, tuiles, voutes: voutesM, acteurs, decor, veg, BATI, ATL, USOL, soleil, hemi, QUAL, SOLEIL, palier: changerPalier }; }, // pour l'atelier et les tests (palier : un changement de la qualité adaptative)
    get stats() {
      const i = renderer ? renderer.info : null; let ds = null, vs = null, ps = null;
      try { ds = decor ? decor.stats : null; } catch (e) { ds = null; } try { vs = veg ? veg.stats : null; } catch (e) { vs = null; } try { ps = PTX ? PTX.stats() : null; } catch (e) { ps = null; }
      return { webgl: webgl && !perdu, perdu, qualite: QUAL.niveau, fixe: QUAL.fixe, calls: i ? i.render.calls : 0, triangles: i ? i.render.triangles : 0, geometries: i ? i.memory.geometries : 0, textures: i ? i.memory.textures : 0,
        ms: Math.round((QUAL.moy || 0) * 10) / 10, cpu: Math.round(cpuMs * 100) / 100, dpr: DPR, fov: Math.round(fovV * 10) / 10, sol: solEtat, tuiles: nbTuiles, acteurs: acteurs.size, erreurs, derniereErreur, gpu: QUAL.gpu || '',
        arbres: vs ? vs.arbres : ARBRES.types.reduce((s, T) => s + T.im.count + T.imL.count, 0), budget: BUDGETS[QUAL.niveau], memoire: memoire(), voutes: nVoutes, bati: BATI ? 'couches' : 'couleurs',
        decor: ds ? { appels: ds.appels, triangles: ds.triangles, appelsOmbre: ds.appelsOmbre, trianglesOmbre: ds.trianglesOmbre, memoire: Math.round((ds.memoire || 0) / 104857.6) / 10, erreurs: (ds.erreurs || []).length } : null,
        vegetation: vs ? { appels: vs.appels, triangles: vs.triangles, appelsOmbre: vs.appelsOmbre, trianglesOmbre: vs.trianglesOmbre, memoire: Math.round((vs.memoire || 0) / 104857.6) / 10, arbres: vs.arbres, buissons: vs.buissons } : null,
        textures3d: ps ? { mo: ps.mo, ms: ps.ms, pages: ps.pages } : null };
    },
  };
  return API;
})();
if (typeof module !== 'undefined') module.exports = PRENDU;
