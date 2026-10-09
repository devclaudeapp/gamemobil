/* OPÉRATION PONCIN — le monde physique : relief, bâtiments, eau et ponts, zones interdites ; collisions d'un cercle qui glisse le long
   des murs, rayons (les tirs), lignes de vue, points libres. Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node pour les tests.
   Voir src-poncin/ARCHITECTURE.md (axes : x à l'est, z au sud, y en haut ; mètres).
   Tout ce qui bloque est ramené à des ARÊTES (segments du plan xz) rangées dans une grille de cellules d'environ 12 m : murs des
   bâtiments, clôtures des zones interdites, berges (sauf dans le couloir des ponts, dont les côtés deviennent des parapets au-dessus de
   l'eau) et bord du carré. Chaque arête est inscrite dans toutes les cellules à moins de MARGE d'elle : un cercle de rayon ≤ MARGE n'a
   besoin que de sa propre cellule. L'intérieur des polygones (est-on dedans ?) se lit par pair-impair, sauf dans les cellules sans
   arête, dont l'état (libre ou plein) est calculé une fois pour toutes. Aucune allocation dans les chemins chauds hors du résultat rendu.
   Une position déjà DANS une région pleine (téléportation ratée : jamais en jeu normal) est rendue par deplacer au point libre le plus proche.
   L'API (contrat) : monde.L, hauteur(x, z), bloque(x, z, r), deplacer(x, z, dx, dz, r) → [x, z], rayon(o…, d…, max) → { t, x, y, z,
   nx, ny, nz, quoi: 'mur' | 'toit' | 'sol', i } | null (i : indice du bâtiment, −1 pour le sol ; normale tournée vers le tireur),
   vue(a…, b…), libre(rnd, centre?, rayon?) → [x, z], limite, batiments [{ p, h, t, base, sommet, aabb, … }] (p dans le sens d'aire signée
   Σ(x_i·z_{i+1} − x_{i+1}·z_i) > 0 : la normale extérieure de l'arête a→b est (bz − az, ax − bx) / longueur).
   En plus : passe(ax, az, bx, bz, r) (la capsule du segment ne touche rien), dedans(x, z) (dans une région pleine), pente(x, z) →
   [dh/dx, dh/dz] (tableau partagé, à copier), couloirs (les ponts), interdits, stats ; accessible (x, z) → bool, branché par PNAV.creer :
   libre() préfère alors la composante principale de la navigation (jamais une cour fermée). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PMONDE = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const CELLULE = 12;        // côté visé d'une cellule de la grille (m)
  const MARGE = 1.05;        // rayon couvert par l'inscription des arêtes (un joueur fait 0,35 m, les points libres demandent 1 m)
  const ELARGI_PONT = 0.5;   // le couloir d'un pont déborde de 0,5 m de chaque côté de sa largeur (1 m en tout)
  const SOUS_BASE = 0.5;     // un bâtiment s'enfonce de 0,5 m sous le point le plus bas du relief sous son emprise
  const PEAU = 1e-4;         // le jeu laissé entre un cercle repoussé et le mur
  const PAS_SOL = 0.4;       // la marche sur le terrain avance d'au moins ce pas (m), puis la dichotomie affine
  const SOURCE = { interdit: -1, eau: -2, bord: -3, parapet: -4 }; // la source d'une arête qui n'est pas un mur de bâtiment (≥ 0 : indice du bâtiment)
  const fini = (v) => typeof v === 'number' && v - v === 0;

  // ─── géométrie plane ───
  const aire = (q) => { let s = 0; for (let i = 0, n = q.length; i < n; i++) { const a = q[i], b = q[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  // un polygone propre : points finis, sans doublon ni point final répété, aire signée Σ(x_i·z_{i+1} − x_{i+1}·z_i) > 0
  // (sens horaire vu du dessus, nord en haut : la normale extérieure de l'arête a→b est (bz − az, −(bx − ax)) / longueur) ; null s'il est dégénéré
  function nettoyer(p) {
    if (!Array.isArray(p)) return null;
    const q = [];
    for (const pt of p) {
      if (!pt) continue; const x = +pt[0], z = +pt[1]; if (!fini(x) || !fini(z)) continue;
      const d = q[q.length - 1]; if (d && Math.abs(d[0] - x) < 1e-6 && Math.abs(d[1] - z) < 1e-6) continue;
      q.push([x, z]);
    }
    while (q.length > 1 && Math.abs(q[0][0] - q[q.length - 1][0]) < 1e-6 && Math.abs(q[0][1] - q[q.length - 1][1]) < 1e-6) q.pop();
    if (q.length < 3) return null;
    const a = aire(q); if (!(Math.abs(a) > 1e-3)) return null;
    if (a < 0) q.reverse();
    return q;
  }
  const aplatir = (q) => { const f = new Float64Array(q.length * 2); q.forEach((pt, i) => { f[2 * i] = pt[0]; f[2 * i + 1] = pt[1]; }); return f; };
  function dansPoly(f, x, z) { // pair-impair sur [x0, z0, x1, z1, …]
    let d = false;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const zi = f[i + 1], zj = f[j + 1];
      if ((zi > z) !== (zj > z) && x < f[i] + (f[j] - f[i]) * (z - zi) / (zj - zi)) d = !d;
    }
    return d;
  }
  function d2PtSeg(px, pz, ax, az, bx, bz) {
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - ax - t * ex, dz = pz - az - t * ez; return dx * dx + dz * dz;
  }
  function croise(ax, az, bx, bz, cx, cz, dx, dz) { // les segments ab et cd se coupent franchement (un simple contact ne compte pas)
    const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    if (!((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))) return false;
    const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    return (d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0);
  }
  // distance² entre deux segments (−1 s'ils se croisent)
  const d2SegSeg = (ax, az, bx, bz, cx, cz, dx, dz) => croise(ax, az, bx, bz, cx, cz, dx, dz) ? -1
    : Math.min(d2PtSeg(ax, az, cx, cz, dx, dz), d2PtSeg(bx, bz, cx, cz, dx, dz), d2PtSeg(cx, cz, ax, az, bx, bz), d2PtSeg(dx, dz, ax, az, bx, bz));
  function d2SegRect(ax, az, bx, bz, x0, z0, x1, z1) { // distance² d'un segment à un rectangle plein (construction seulement)
    let t0 = 0, t1 = 1; const ex = bx - ax, ez = bz - az;
    const coupe = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (coupe(-ex, ax - x0) && coupe(ex, x1 - ax) && coupe(-ez, az - z0) && coupe(ez, z1 - az) && t0 <= t1) return 0;
    const dr = (x, z) => { const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0; return dx * dx + dz * dz; };
    return Math.min(dr(ax, az), dr(bx, bz), d2PtSeg(x0, z0, ax, az, bx, bz), d2PtSeg(x1, z0, ax, az, bx, bz), d2PtSeg(x0, z1, ax, az, bx, bz), d2PtSeg(x1, z1, ax, az, bx, bz));
  }

  function creer(carte) {
    carte = carte || {};
    const L = fini(+carte.taille) && carte.taille > 0 ? +carte.taille : 600, X0 = -L / 2, X1 = L / 2;

    // ─── le relief : une seule triangulation, partagée avec le rendu (diagonale (i+1, j)–(i, j+1) de chaque case) ───
    const R = carte.relief;
    let rn = 0, rpas = 1, rh = null, hMin = 0, hMax = 0, penteMax = 0;
    if (R && R.n >= 2 && fini(+R.pas) && R.pas > 0 && R.h && R.h.length >= R.n * R.n) {
      rn = R.n | 0; rpas = +R.pas; rh = new Float64Array(rn * rn);
      for (let k = 0; k < rn * rn; k++) { const v = +R.h[k]; rh[k] = fini(v) ? v : 0; }
      hMin = Infinity; hMax = -Infinity;
      for (let k = 0; k < rh.length; k++) { if (rh[k] < hMin) hMin = rh[k]; if (rh[k] > hMax) hMax = rh[k]; }
      for (let j = 0; j < rn - 1; j++) for (let i = 0; i < rn - 1; i++) { // la plus forte pente d'un triangle (borne de Lipschitz de la marche des rayons)
        const k = j * rn + i, a = rh[k], b = rh[k + 1], c = rh[k + rn], d = rh[k + rn + 1];
        penteMax = Math.max(penteMax, Math.hypot(b - a, c - a) / rpas, Math.hypot(d - c, d - b) / rpas);
      }
    }
    const RM = rn - 1;
    function hauteur(x, z) {
      if (!rh) return 0;
      let u = (x - X0) / rpas, v = (z - X0) / rpas;
      if (!(u > 0)) u = 0; else if (u > RM) u = RM;
      if (!(v > 0)) v = 0; else if (v > RM) v = RM;
      let i = u | 0, j = v | 0; if (i >= RM) i = RM - 1; if (j >= RM) j = RM - 1;
      const fx = u - i, fz = v - j, k = j * rn + i;
      if (fx + fz <= 1) { const a = rh[k]; return a + fx * (rh[k + 1] - a) + fz * (rh[k + rn] - a); }
      const d = rh[k + rn + 1]; return d + (1 - fx) * (rh[k + rn] - d) + (1 - fz) * (rh[k + 1] - d);
    }
    const PENTE = [0, 0]; // dh/dx, dh/dz au point (triangle du maillage)
    function pente(x, z) {
      PENTE[0] = 0; PENTE[1] = 0; if (!rh) return PENTE;
      let u = (x - X0) / rpas, v = (z - X0) / rpas;
      if (!(u > 0)) u = 0; else if (u > RM) u = RM;
      if (!(v > 0)) v = 0; else if (v > RM) v = RM;
      let i = u | 0, j = v | 0; if (i >= RM) i = RM - 1; if (j >= RM) j = RM - 1;
      const k = j * rn + i;
      if (u - i + v - j <= 1) { PENTE[0] = (rh[k + 1] - rh[k]) / rpas; PENTE[1] = (rh[k + rn] - rh[k]) / rpas; }
      else { PENTE[0] = (rh[k + rn + 1] - rh[k + rn]) / rpas; PENTE[1] = (rh[k + rn + 1] - rh[k + 1]) / rpas; }
      return PENTE;
    }
    // le minimum exact du relief sous une emprise : le relief est linéaire par triangle, son minimum est aux sommets de l'emprise, à ses
    // croisements avec les lignes du maillage (u, v et u + v entiers) ou aux nœuds de la grille à l'intérieur
    function minRelief(q, f) {
      if (!rh) return 0;
      let m = Infinity; const n = q.length;
      for (let a = 0; a < n; a++) {
        const [ax, az] = q[a], [bx, bz] = q[(a + 1) % n]; m = Math.min(m, hauteur(ax, az));
        const ua = (ax - X0) / rpas, va = (az - X0) / rpas, ub = (bx - X0) / rpas, vb = (bz - X0) / rpas;
        const lignes = (p0, p1) => { if (p1 === p0) return; const lo = Math.ceil(Math.min(p0, p1)), hi = Math.floor(Math.max(p0, p1)); for (let k = Math.max(lo, -1); k <= Math.min(hi, 2 * rn + 1); k++) { const t = (k - p0) / (p1 - p0); if (t > 0 && t < 1) m = Math.min(m, hauteur(ax + (bx - ax) * t, az + (bz - az) * t)); } };
        lignes(ua, ub); lignes(va, vb); lignes(ua + va, ub + vb);
      }
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let j = Math.max(0, Math.ceil((z0 - X0) / rpas)); j <= Math.min(RM, Math.floor((z1 - X0) / rpas)); j++)
        for (let i = Math.max(0, Math.ceil((x0 - X0) / rpas)); i <= Math.min(RM, Math.floor((x1 - X0) / rpas)); i++)
          if (dansPoly(f, X0 + i * rpas, X0 + j * rpas)) m = Math.min(m, rh[j * rn + i]);
      return fini(m) ? m : 0;
    }

    // ─── les bâtiments normalisés ───
    const batiments = [];
    for (const b of carte.batiments || []) {
      const p = nettoyer(b && b.p); if (!p) continue;
      const f = aplatir(p), h = fini(+b.h) && b.h > 0 ? +b.h : 6;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const base = minRelief(p, f) - SOUS_BASE;
      batiments.push(Object.assign({}, b, { p, h, t: b.t || 'maison', base, sommet: base + h, aabb: [x0, z0, x1, z1] }));
    }
    const NB = batiments.length;

    // ─── les régions pleines (pour « est-on dedans ? ») : bâtiments, zones interdites, eau ───
    const regions = []; // { f, aabb, k: 0 bâtiment | 1 interdit | 2 eau, i }
    batiments.forEach((b, i) => regions.push({ f: aplatir(b.p), aabb: b.aabb, k: 0, i, q: b.p }));
    const interdits = [];
    for (const z of carte.interdit || []) { const p = nettoyer(z && z.p); if (p) { interdits.push({ p, n: z.n || '' }); regions.push({ f: aplatir(p), aabb: boite(p), k: 1, i: interdits.length - 1, q: p }); } }
    const eaux = [];
    for (const e of carte.eau || []) { const p = nettoyer(e && e.p); if (p) { eaux.push({ p, t: e.t || 'riviere', f: aplatir(p) }); regions.push({ f: eaux[eaux.length - 1].f, aabb: boite(p), k: 2, i: eaux.length - 1, q: p }); } }
    function boite(p) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; }
    const dansEau = (x, z) => eaux.some((e) => dansPoly(e.f, x, z));

    // ─── les ponts : un couloir rectangulaire où l'eau ne bloque plus, prolongé jusqu'à sortir de l'eau ───
    const couloirs = [];
    for (const pt of carte.ponts || []) {
      const l = pt && pt.l; if (!Array.isArray(l) || l.length < 2 || !l[0] || !l[l.length - 1]) continue;
      const ax = +l[0][0], az = +l[0][1], bx = +l[l.length - 1][0], bz = +l[l.length - 1][1];
      if (![ax, az, bx, bz].every(fini)) continue;
      const lg = Math.hypot(bx - ax, bz - az); if (lg < 0.1) continue;
      const ux = (bx - ax) / lg, uz = (bz - az) / lg, vx = -uz, vz = ux, dw = (fini(+pt.w) && pt.w > 0 ? +pt.w : 5) / 2 + ELARGI_PONT;
      const mouille = (x, z) => { for (let s = -1; s <= 1.0001; s += 0.25) if (dansEau(x + vx * dw * s, z + vz * dw * s)) return true; return false; };
      let e0 = 1, e1 = 1;
      while (e0 < 40 && mouille(ax - ux * e0, az - uz * e0)) e0 += 1;
      while (e1 < 40 && mouille(bx + ux * e1, bz + uz * e1)) e1 += 1;
      const sx = ax - ux * e0, sz = az - uz * e0, tx = bx + ux * e1, tz = bz + uz * e1;
      couloirs.push({ mx: (sx + tx) / 2, mz: (sz + tz) / 2, ux, uz, vx, vz, dl: (lg + e0 + e1) / 2, dw,
        coins: [[sx - vx * dw, sz - vz * dw], [tx - vx * dw, tz - vz * dw], [tx + vx * dw, tz + vz * dw], [sx + vx * dw, sz + vz * dw]], w: dw * 2 });
    }
    const dansCouloir = (C, x, z) => { const dx = x - C.mx, dz = z - C.mz; return Math.abs(dx * C.ux + dz * C.uz) <= C.dl && Math.abs(dx * C.vx + dz * C.vz) <= C.dw; };
    function intervalleCouloir(C, ax, az, bx, bz) { // [t0, t1] du segment a→b dans le couloir, ou null
      let t0 = 0, t1 = 1;
      for (const [ex, ez, demi] of [[C.ux, C.uz, C.dl], [C.vx, C.vz, C.dw]]) {
        const s0 = (ax - C.mx) * ex + (az - C.mz) * ez, ds = (bx - ax) * ex + (bz - az) * ez;
        if (Math.abs(ds) < 1e-12) { if (s0 < -demi || s0 > demi) return null; continue; }
        let ta = (-demi - s0) / ds, tb = (demi - s0) / ds; if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 >= t1) return null;
      }
      return [t0, t1];
    }

    // ─── les arêtes ───
    const A = []; // ax, az, bx, bz, source
    const arete = (ax, az, bx, bz, s) => { if (Math.hypot(bx - ax, bz - az) > 1e-6) A.push(ax, az, bx, bz, s); };
    batiments.forEach((b, i) => { const q = b.p; for (let a = 0; a < q.length; a++) { const u = q[a], v = q[(a + 1) % q.length]; arete(u[0], u[1], v[0], v[1], i); } });
    for (const z of interdits) { const q = z.p; for (let a = 0; a < q.length; a++) { const u = q[a], v = q[(a + 1) % q.length]; arete(u[0], u[1], v[0], v[1], SOURCE.interdit); } }
    for (const e of eaux) { // les berges, moins leurs morceaux dans un couloir de pont
      const q = e.p;
      for (let a = 0; a < q.length; a++) {
        const [ax, az] = q[a], [bx, bz] = q[(a + 1) % q.length];
        let morceaux = [[0, 1]];
        for (const C of couloirs) {
          const iv = intervalleCouloir(C, ax, az, bx, bz); if (!iv) continue;
          const suite = [];
          for (const [m0, m1] of morceaux) { if (Math.min(m1, iv[0]) - m0 > 1e-9) suite.push([m0, Math.min(m1, iv[0])]); if (m1 - Math.max(m0, iv[1]) > 1e-9) suite.push([Math.max(m0, iv[1]), m1]); }
          morceaux = suite;
        }
        for (const [m0, m1] of morceaux) arete(ax + (bx - ax) * m0, az + (bz - az) * m0, ax + (bx - ax) * m1, az + (bz - az) * m1, SOURCE.eau);
      }
    }
    couloirs.forEach((C, ci) => { // les côtés d'un couloir, là où ils passent au-dessus de l'eau (hors d'un autre couloir), deviennent des parapets
      for (let a = 0; a < 4; a++) {
        const [ax, az] = C.coins[a], [bx, bz] = C.coins[(a + 1) % 4], ts = [0, 1];
        const coupe = (q) => { for (let k = 0; k < q.length; k++) { const [cx, cz] = q[k], [dx, dz] = q[(k + 1) % q.length]; const ex = bx - ax, ez = bz - az, fx = dx - cx, fz = dz - cz, den = ex * fz - ez * fx; if (Math.abs(den) < 1e-12) continue; const t = ((cx - ax) * fz - (cz - az) * fx) / den, u = ((cx - ax) * ez - (cz - az) * ex) / den; if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t); } };
        eaux.forEach((e) => coupe(e.p)); couloirs.forEach((D, di) => { if (di !== ci) coupe(D.coins); });
        ts.sort((p, q) => p - q);
        for (let k = 0; k + 1 < ts.length; k++) {
          const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
          const mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
          if (dansEau(mx, mz) && !couloirs.some((D, di) => di !== ci && dansCouloir(D, mx, mz))) arete(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, SOURCE.parapet);
        }
      }
    });
    arete(X0, X0, X1, X0, SOURCE.bord); arete(X1, X0, X1, X1, SOURCE.bord); arete(X1, X1, X0, X1, SOURCE.bord); arete(X0, X1, X0, X0, SOURCE.bord);
    const NA = A.length / 5, E = new Float64Array(NA * 4), ES = new Int32Array(NA);
    for (let k = 0; k < NA; k++) { E[4 * k] = A[5 * k]; E[4 * k + 1] = A[5 * k + 1]; E[4 * k + 2] = A[5 * k + 2]; E[4 * k + 3] = A[5 * k + 3]; ES[k] = A[5 * k + 4]; }
    const BASE = new Float64Array(NB), SOMMET = new Float64Array(NB);
    batiments.forEach((b, i) => { BASE[i] = b.base; SOMMET[i] = b.sommet; });

    // ─── la grille : arêtes (avec la marge) et régions (par leur boîte), en listes compactes ───
    const G = Math.max(1, Math.ceil(L / CELLULE)), CS = L / G, INV = 1 / CS;
    const ci = (x) => { const i = Math.floor((x - X0) * INV); return i < 0 ? 0 : i >= G ? G - 1 : i; };
    function compacter(listes) { const d = new Int32Array(G * G + 1); let n = 0; for (let c = 0; c < G * G; c++) { d[c] = n; n += listes[c].length; } d[G * G] = n; const v = new Int32Array(n); for (let c = 0; c < G * G; c++) v.set(listes[c], d[c]); return [d, v]; }
    const lA = Array.from({ length: G * G }, () => []), lR = Array.from({ length: G * G }, () => []);
    for (let k = 0; k < NA; k++) {
      const ax = E[4 * k], az = E[4 * k + 1], bx = E[4 * k + 2], bz = E[4 * k + 3];
      for (let j = ci(Math.min(az, bz) - MARGE); j <= ci(Math.max(az, bz) + MARGE); j++)
        for (let i = ci(Math.min(ax, bx) - MARGE); i <= ci(Math.max(ax, bx) + MARGE); i++)
          if (d2SegRect(ax, az, bx, bz, X0 + i * CS, X0 + j * CS, X0 + (i + 1) * CS, X0 + (j + 1) * CS) <= MARGE * MARGE) lA[j * G + i].push(k);
    }
    regions.forEach((r, k) => { const [x0, z0, x1, z1] = r.aabb; for (let j = ci(z0); j <= ci(z1); j++) for (let i = ci(x0); i <= ci(x1); i++) lR[j * G + i].push(k); });
    const [cA0, cA] = compacter(lA), [cR0, cR] = compacter(lR);
    const RF = regions.map((r) => r.f), RK = new Int8Array(regions.map((r) => r.k)), RB = new Float64Array(regions.length * 4);
    regions.forEach((r, k) => RB.set(r.aabb, 4 * k));
    // dedans sans raccourci : dans un bâtiment, une zone interdite, l'eau hors des couloirs, ou hors du carré
    function dedansLent(x, z, c) {
      if (!(x >= X0 && x <= X1 && z >= X0 && z <= X1)) return true;
      for (let n = cR0[c]; n < cR0[c + 1]; n++) {
        const k = cR[n], o = 4 * k;
        if (x < RB[o] || x > RB[o + 2] || z < RB[o + 1] || z > RB[o + 3] || !dansPoly(RF[k], x, z)) continue;
        if (RK[k] !== 2) return true;
        let pont = false; for (let m = 0; m < couloirs.length; m++) if (dansCouloir(couloirs[m], x, z)) { pont = true; break; }
        if (!pont) return true;
      }
      return false;
    }
    const ETAT = new Uint8Array(G * G); // 0 libre, 1 plein (cellule sans arête), 2 mélangée
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = j * G + i; ETAT[c] = cA0[c + 1] > cA0[c] ? 2 : dedansLent(X0 + (i + 0.5) * CS, X0 + (j + 0.5) * CS, c) ? 1 : 0; }
    function dedans(x, z) {
      if (!(x >= X0 && x <= X1 && z >= X0 && z <= X1)) return true;
      const c = ci(z) * G + ci(x), e = ETAT[c];
      return e === 2 ? dedansLent(x, z, c) : e === 1;
    }

    // ─── marquage « déjà vu » sans réallocation ───
    const VU_A = new Uint32Array(NA), VU_R = new Uint32Array(regions.length); let tour = 0;
    const nouveauTour = () => { if (++tour > 4e9) { VU_A.fill(0); VU_R.fill(0); tour = 1; } return tour; };
    const CAND = new Int32Array(NA + 1); // arêtes candidates d'un déplacement
    function rassembler(x0, z0, x1, z1, m) { // les arêtes dont la boîte touche [x0 − m, x1 + m] × [z0 − m, z1 + m] → CAND ; renvoie leur nombre
      const t = nouveauTour(), e = Math.max(0, m - MARGE); let n = 0;
      const i0 = ci(x0 - e), i1 = ci(x1 + e), j0 = ci(z0 - e), j1 = ci(z1 + e);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = j * G + i;
        for (let s = cA0[c]; s < cA0[c + 1]; s++) {
          const k = cA[s]; if (VU_A[k] === t) continue; VU_A[k] = t;
          const o = 4 * k, ax = E[o], az = E[o + 1], bx = E[o + 2], bz = E[o + 3];
          if ((ax < bx ? ax : bx) > x1 + m || (ax > bx ? ax : bx) < x0 - m || (az < bz ? az : bz) > z1 + m || (az > bz ? az : bz) < z0 - m) continue;
          CAND[n++] = k;
        }
      }
      return n;
    }
    // les cellules traversées par un segment, dans l'ordre (Amanatides–Woo), avec le paramètre d'entrée dans [0, 1]
    const LC = new Int32Array(2 * G + 8), LT = new Float64Array(2 * G + 8);
    function traverser(ax, az, bx, bz) {
      const gx = (ax - X0) * INV, gz = (az - X0) * INV, ddx = (bx - ax) * INV, ddz = (bz - az) * INV;
      let t0 = 0, t1 = 1;
      const coupe = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
      if (!(coupe(-ddx, gx) && coupe(ddx, G - gx) && coupe(-ddz, gz) && coupe(ddz, G - gz)) || t0 > t1) return 0;
      let i = Math.floor(gx + ddx * t0), j = Math.floor(gz + ddz * t0);
      if (i < 0) i = 0; else if (i >= G) i = G - 1; if (j < 0) j = 0; else if (j >= G) j = G - 1;
      const si = ddx > 0 ? 1 : ddx < 0 ? -1 : 0, sj = ddz > 0 ? 1 : ddz < 0 ? -1 : 0;
      let tx = si > 0 ? (i + 1 - gx) / ddx : si < 0 ? (i - gx) / ddx : Infinity, tz = sj > 0 ? (j + 1 - gz) / ddz : sj < 0 ? (j - gz) / ddz : Infinity;
      const px = si ? Math.abs(1 / ddx) : Infinity, pz = sj ? Math.abs(1 / ddz) : Infinity;
      let n = 0, t = t0;
      for (;;) {
        LC[n] = j * G + i; LT[n] = t; n++;
        if (n >= LC.length) break;
        if (tx < tz) { if (tx > t1) break; t = tx; i += si; tx += px; if (i < 0 || i >= G) break; }
        else { if (tz > t1) break; t = tz; j += sj; tz += pz; if (j < 0 || j >= G) break; }
      }
      return n;
    }
    const limiteOk = (l) => !!(l && l.centre && fini(+l.centre[0]) && fini(+l.centre[1]) && fini(+l.rayon) && l.rayon > 0);

    // ─── bloque : le cercle touche un mur, est dans une région pleine, sort du carré ou de la limite ───
    function bloque(x, z, r) {
      r = r > 0 ? +r : 0;
      if (!fini(x) || !fini(z)) return true;
      if (x < X0 + r || x > X1 - r || z < X0 + r || z > X1 - r) return true;
      const lim = monde.limite;
      if (limiteOk(lim)) { const dx = x - lim.centre[0], dz = z - lim.centre[1], m = lim.rayon - r; if (m <= 0 || dx * dx + dz * dz > m * m) return true; }
      if (r > 0) {
        const r2 = r * r;
        if (r <= MARGE) {
          const c = ci(z) * G + ci(x);
          for (let s = cA0[c]; s < cA0[c + 1]; s++) { const o = 4 * cA[s]; if (d2PtSeg(x, z, E[o], E[o + 1], E[o + 2], E[o + 3]) < r2) return true; }
        } else {
          const n = rassembler(x, z, x, z, r);
          for (let s = 0; s < n; s++) { const o = 4 * CAND[s]; if (d2PtSeg(x, z, E[o], E[o + 1], E[o + 2], E[o + 3]) < r2) return true; }
        }
      }
      return dedans(x, z);
    }

    // ─── deplacer : sous-pas plus courts que le rayon (on ne peut pas sauter un mur), repoussé hors des arêtes (on glisse), puis vérifié :
    // à la fin de chaque sous-pas, aucune arête plus près que le rayon et aucune arête franchie ; sinon on essaie l'axe x seul, l'axe z seul,
    // ou on reste. Une position de départ déjà enfoncée peut en sortir, jamais s'enfoncer davantage. ───
    let QX = 0, QZ = 0, NC = 0, BX0 = 0, BZ0 = 0, BX1 = 0, BZ1 = 0, SEUIL2 = 0, LCX = 0, LCZ = 0, LM = -1;
    function essai(px, pz, sx, sz, r) {
      let qx = px + sx, qz = pz + sz; const r2 = r * r;
      for (let it = 0; it < 5; it++) {
        let bouge = false;
        for (let s = 0; s < NC; s++) {
          const o = 4 * CAND[s], ax = E[o], az = E[o + 1], ex = E[o + 2] - ax, ez = E[o + 3] - az, l2 = ex * ex + ez * ez;
          let t = ((qx - ax) * ex + (qz - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          let dx = qx - ax - t * ex, dz = qz - az - t * ez; const d2 = dx * dx + dz * dz;
          if (d2 >= r2) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-9) { // pile sur l'arête : on repousse du côté d'où l'on vient
            dx = ez; dz = -ex; d = Math.sqrt(l2); if ((px - ax) * dx + (pz - az) * dz < 0) { dx = -dx; dz = -dz; }
            qx += dx / d * (r + PEAU); qz += dz / d * (r + PEAU);
          } else { const k = (r + PEAU - d) / d; qx += dx * k; qz += dz * k; }
          bouge = true;
        }
        if (LM >= 0) { const dx = qx - LCX, dz = qz - LCZ, d = Math.sqrt(dx * dx + dz * dz); if (d > LM) { const k = (LM - PEAU) / d; qx = LCX + dx * k; qz = LCZ + dz * k; bouge = true; } }
        if (!bouge) break;
      }
      if (!(qx >= BX0 && qx <= BX1 && qz >= BZ0 && qz <= BZ1)) return false; // repoussé hors de la zone dont on a lu les arêtes
      for (let s = 0; s < NC; s++) {
        const o = 4 * CAND[s], ax = E[o], az = E[o + 1], bx = E[o + 2], bz = E[o + 3];
        if (d2PtSeg(qx, qz, ax, az, bx, bz) < SEUIL2 || croise(px, pz, qx, qz, ax, az, bx, bz)) return false;
      }
      if (LM >= 0) { const dx = qx - LCX, dz = qz - LCZ; if (dx * dx + dz * dz > (LM + 1e-6) * (LM + 1e-6)) return false; }
      QX = qx; QZ = qz; return true;
    }
    function ejecter(x, z, r) { // le point libre le plus proche d'une position perdue dans une région pleine (jamais en jeu normal)
      for (let d = 0.25; d <= 40; d += 0.25) {
        const n = Math.max(8, Math.ceil(d * 6));
        for (let a = 0; a < n; a++) { const qx = x + Math.cos(a * 2 * Math.PI / n) * d, qz = z + Math.sin(a * 2 * Math.PI / n) * d; if (!bloque(qx, qz, r)) return [qx, qz]; }
      }
      return secours();
    }
    function deplacer(x, z, dx, dz, r) {
      if (!fini(x) || !fini(z)) { const s = secours(); return [s[0], s[1]]; }
      if (!fini(dx) || !fini(dz)) { dx = 0; dz = 0; }
      r = fini(r) && r > 0.01 ? +r : 0.01;
      if (dedans(x, z)) return ejecter(x, z, r); // dans un mur, dans l'eau, hors du carré : on ressort au plus près plutôt que d'y rester
      let lg = Math.sqrt(dx * dx + dz * dz);
      if (lg < 1e-12) return [x, z];
      const pas = 0.9 * r; let n = Math.ceil(lg / pas);
      if (n > 400) { const k = 400 * pas / lg; dx *= k; dz *= k; lg *= k; n = 400; } // un « déplacement » de plus de 400 sous-pas n'en est pas un
      const m = 3 * r + 0.1, x0 = Math.min(x, x + dx), x1 = Math.max(x, x + dx), z0 = Math.min(z, z + dz), z1 = Math.max(z, z + dz);
      NC = rassembler(x0, z0, x1, z1, m); BX0 = x0 - 2 * r; BX1 = x1 + 2 * r; BZ0 = z0 - 2 * r; BZ1 = z1 + 2 * r;
      let jeu = Infinity; // le dégagement de départ : un cercle déjà enfoncé a le droit de le rester, pas de s'enfoncer plus
      for (let s = 0; s < NC; s++) { const o = 4 * CAND[s]; jeu = Math.min(jeu, d2PtSeg(x, z, E[o], E[o + 1], E[o + 2], E[o + 3])); }
      const seuil = Math.min(r - 1e-3, Math.sqrt(jeu) - 1e-6); SEUIL2 = seuil > 0 ? seuil * seuil : 0;
      const lim = monde.limite; LM = -1;
      if (limiteOk(lim)) { LCX = +lim.centre[0]; LCZ = +lim.centre[1]; LM = Math.max(lim.rayon - r, Math.hypot(x - LCX, z - LCZ)); }
      const sx = dx / n, sz = dz / n; let px = x, pz = z;
      for (let k = 0; k < n; k++) {
        if (essai(px, pz, sx, sz, r) || essai(px, pz, sx, 0, r) || essai(px, pz, 0, sz, r)) { px = QX; pz = QZ; }
        else break; // coincé : on reste au dernier point sûr
      }
      return [px, pz];
    }

    // ─── passe : la capsule de rayon r le long de a→b ne touche rien (ni mur ni région pleine, dans le carré et la limite) ───
    function passe(ax, az, bx, bz, r) {
      r = r > 0 ? +r : 0;
      if (bloque(ax, az, r) || bloque(bx, bz, r)) return false;
      const r2 = r * r;
      if (r <= MARGE) {
        const t = nouveauTour(), n = traverser(ax, az, bx, bz);
        for (let s = 0; s < n; s++) {
          const c = LC[s];
          for (let u = cA0[c]; u < cA0[c + 1]; u++) {
            const k = cA[u]; if (VU_A[k] === t) continue; VU_A[k] = t;
            const o = 4 * k; if (d2SegSeg(ax, az, bx, bz, E[o], E[o + 1], E[o + 2], E[o + 3]) < r2) return false;
          }
        }
        return true;
      }
      const n = rassembler(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r);
      for (let s = 0; s < n; s++) { const o = 4 * CAND[s]; if (d2SegSeg(ax, az, bx, bz, E[o], E[o + 1], E[o + 2], E[o + 3]) < r2) return false; }
      return true;
    }

    // ─── rayon : le premier mur, toit ou bout de terrain touché (bâtiments = prismes de base à sommet, toits plats) ───
    const H = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, quoi: '', i: -1 };
    function solEn(ox, oy, oz, dx, dy, dz, tDeb, tFin) { // la marche sur le terrain (pas bornés par la pente, puis dichotomie) ; renvoie t ou −1
      if (!rh || !(tFin > tDeb)) return -1;
      const f = (t) => oy + dy * t - hauteur(ox + dx * t, oz + dz * t);
      let a = tDeb, fa = f(a);
      if (fa < 0) return a;
      if (dy >= 0 && oy > hMax) return -1;
      if (dy < 0) { const tb = (oy - hMin) / -dy; if (tb < tFin) tFin = tb + 1e-6; } // sous le point le plus bas, plus rien à toucher
      const K = Math.abs(dy) + penteMax * Math.sqrt(dx * dx + dz * dz) + 1e-9;
      while (a < tFin) {
        const b = Math.min(tFin, a + Math.max(PAS_SOL, fa / K)), fb = f(b);
        if (fb < 0) {
          let lo = a, hi = b;
          for (let k = 0; k < 40 && hi - lo > 1e-5; k++) { const m = (lo + hi) / 2; if (f(m) < 0) hi = m; else lo = m; }
          return hi;
        }
        a = b; fa = fb;
      }
      return -1;
    }
    function lancer(ox, oy, oz, dx, dy, dz, max) { // remplit H, renvoie vrai si quelque chose est touché avant max
      let best = max, quoi = 0, bi = -1, bnx = 0, bny = 0, bnz = 0;
      const hl = Math.sqrt(dx * dx + dz * dz), t = nouveauTour();
      // l'entrée dans le carré et sa sortie bornent la recherche sur le terrain (au-delà, il n'y a plus de monde)
      let tSort = max, tEnt = 0;
      if (dx > 0) { tSort = Math.min(tSort, (X1 - ox) / dx); tEnt = Math.max(tEnt, (X0 - ox) / dx); } else if (dx < 0) { tSort = Math.min(tSort, (X0 - ox) / dx); tEnt = Math.max(tEnt, (X1 - ox) / dx); } else if (ox < X0 || ox > X1) tSort = -1;
      if (dz > 0) { tSort = Math.min(tSort, (X1 - oz) / dz); tEnt = Math.max(tEnt, (X0 - oz) / dz); } else if (dz < 0) { tSort = Math.min(tSort, (X0 - oz) / dz); tEnt = Math.max(tEnt, (X1 - oz) / dz); } else if (oz < X0 || oz > X1) tSort = -1;
      const n = hl > 1e-9 ? traverser(ox, oz, ox + dx * max, oz + dz * max) : (ox >= X0 && ox <= X1 && oz >= X0 && oz <= X1 ? (LC[0] = ci(oz) * G + ci(ox), LT[0] = 0, 1) : 0);
      for (let s = 0; s < n; s++) {
        if (LT[s] * max > best) break;
        const c = LC[s];
        if (hl > 1e-9) for (let u = cA0[c]; u < cA0[c + 1]; u++) { // les murs
          const k = cA[u]; if (VU_A[k] === t) continue; VU_A[k] = t;
          const b = ES[k]; if (b < 0) continue;
          const o = 4 * k, ax = E[o], az = E[o + 1], ex = E[o + 2] - ax, ez = E[o + 3] - az, den = dx * ez - dz * ex;
          if (den > -1e-12 && den < 1e-12) continue;
          const wx = ax - ox, wz = az - oz, tt = (wx * ez - wz * ex) / den;
          if (tt < 0 || tt >= best) continue;
          const uu = (wx * dz - wz * dx) / den; if (uu < 0 || uu > 1) continue;
          const y = oy + dy * tt; if (y < BASE[b] || y > SOMMET[b]) continue;
          best = tt; quoi = 1; bi = b; bnx = ez; bny = 0; bnz = -ex;
        }
        if (dy !== 0) for (let u = cR0[c]; u < cR0[c + 1]; u++) { // les toits
          const k = cR[u]; if (RK[k] !== 0 || VU_R[k] === t) continue; VU_R[k] = t;
          const tt = (SOMMET[k] - oy) / dy; if (tt < 0 || tt >= best) continue;
          const x = ox + dx * tt, z = oz + dz * tt, o = 4 * k;
          if (x < RB[o] || x > RB[o + 2] || z < RB[o + 1] || z > RB[o + 3] || !dansPoly(RF[k], x, z)) continue;
          best = tt; quoi = 2; bi = k; bnx = 0; bny = dy < 0 ? 1 : -1; bnz = 0;
        }
      }
      const ts = solEn(ox, oy, oz, dx, dy, dz, tEnt, Math.min(best, tSort));
      if (ts >= 0 && ts <= best) {
        best = ts; quoi = 3; bi = -1; const g = pente(ox + dx * ts, oz + dz * ts); bnx = -g[0]; bny = 1; bnz = -g[1];
      }
      if (!quoi) return false;
      const nl = Math.sqrt(bnx * bnx + bny * bny + bnz * bnz) || 1; bnx /= nl; bny /= nl; bnz /= nl;
      if (quoi === 1 && bnx * dx + bnz * dz > 0) { bnx = -bnx; bnz = -bnz; } // la face vue par le tireur
      H.t = best; H.x = ox + dx * best; H.y = oy + dy * best; H.z = oz + dz * best; H.nx = bnx; H.ny = bny; H.nz = bnz; H.i = bi;
      H.quoi = quoi === 1 ? 'mur' : quoi === 2 ? 'toit' : 'sol';
      return true;
    }
    function rayon(ox, oy, oz, dx, dy, dz, max) {
      if (!(fini(ox) && fini(oy) && fini(oz) && fini(dx) && fini(dy) && fini(dz))) return null;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-12) return null;
      if (Math.abs(l - 1) > 1e-9) { dx /= l; dy /= l; dz /= l; }
      max = fini(max) && max > 0 ? +max : L * 2;
      if (!lancer(ox, oy, oz, dx, dy, dz, max)) return null;
      return { t: H.t, x: H.x, y: H.y, z: H.z, nx: H.nx, ny: H.ny, nz: H.nz, quoi: H.quoi, i: H.i };
    }
    function vue(ax, ay, az, bx, by, bz) {
      if (!(fini(ax) && fini(ay) && fini(az) && fini(bx) && fini(by) && fini(bz))) return false;
      const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 0.05) return true;
      return !lancer(ax, ay, az, dx / l, dy / l, dz / l, l - 0.02);
    }

    // ─── libre : un point au hasard à au moins 1 m de tout mur (dans le cercle donné, sinon la limite, sinon tout le carré) ───
    const rndDefaut = REGLES && REGLES.mulberry32 ? REGLES.mulberry32(0x504f4e43) : (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    function libre(rnd, centre, rayonZone) {
      if (typeof rnd !== 'function') rnd = rndDefaut;
      let cx = 0, cz = 0, R = 0, carre = true;
      const lim = monde.limite;
      if (centre && fini(+centre[0]) && fini(+centre[1])) { cx = +centre[0]; cz = +centre[1]; R = fini(+rayonZone) && rayonZone > 0 ? +rayonZone : 30; carre = false; }
      else if (limiteOk(lim)) { cx = +lim.centre[0]; cz = +lim.centre[1]; R = +lim.rayon; carre = false; }
      const acc = typeof monde.accessible === 'function' ? monde.accessible : null;
      for (let k = 0; k < 600; k++) {
        let x, z;
        if (carre) { x = X0 + 2 + (L - 4) * rnd(); z = X0 + 2 + (L - 4) * rnd(); }
        else { const a = rnd() * Math.PI * 2, d = R * Math.sqrt(rnd()); x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d; }
        if (bloque(x, z, 1)) continue;
        if (acc && k < 450 && !acc(x, z)) continue; // de préférence là où l'on peut aller (si une navigation est branchée)
        return [x, z];
      }
      for (let d = 0; d <= Math.max(R, L / 2); d += 0.5) for (let a = 0; a < 16; a++) { // en dernier recours, en spirale depuis le centre
        const x = cx + Math.cos(a * Math.PI / 8) * d, z = cz + Math.sin(a * Math.PI / 8) * d;
        if (!bloque(x, z, 0.5)) return [x, z];
      }
      return [cx, cz];
    }
    const secours = () => limiteOk(monde.limite) ? libre(rndDefaut) : libre(rndDefaut, [0, 0], L / 2); // une position perdue (NaN) revient sur un point libre

    const monde = {
      L, limite: null, batiments, interdits, couloirs,
      hauteur, bloque, deplacer, rayon, vue, libre,
      passe, dedans, pente,
      accessible: null, // une fonction (x, z) → bool qu'y branche PNAV.creer : la composante principale de la navigation
      stats: { aretes: NA, cellules: G * G, cote: CS, regions: regions.length, ponts: couloirs.length },
      _interne: { E, ES, cA0, cA, G, CS, MARGE, regions, X0 },
    };
    return monde;
  }

  return { creer, CELLULE, MARGE, SOURCE, nettoyer, dansPoly };
});
