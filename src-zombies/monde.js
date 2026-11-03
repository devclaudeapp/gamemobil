/* DERNIER REMPART — le monde d'une arène : ses obstacles (rectangles alignés sur les axes et cercles), les collisions des corps ronds,
   les lignes de vue et le trajet des balles. Il a la forme qu'attend la navigation d'Opération Poncin (src-poncin/nav.js, A* et JPS, réutilisé
   tel quel) : { L, limite, bloque(x, z, r), passe(ax, az, bx, bz, r) }.
   - bloque(x, z, r) : un cercle de rayon r posé là touche un obstacle ou sort de l'arène ;
   - passe(ax, az, bx, bz, r) : la capsule (le segment épaissi de r) ne touche aucun obstacle (les obstacles bas comptent : on ne les enjambe pas) ;
   - tir(ax, az, dx, dz, max) : la distance jusqu'au premier obstacle HAUT sur le rayon (les balles passent au-dessus des obstacles bas) ;
   - vue(ax, az, bx, bz) : le segment ne croise aucun obstacle haut (une tourelle voit par-dessus une clôture) ;
   - pousser(c) : sort le cercle { x, z, rayon } des obstacles et le garde dans l'arène (modifie c.x, c.z).
   Module pur (aucun DOM, aucun THREE), gabarit UMD : ZMONDE. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZMONDE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BAS = 1.0; // un obstacle plus bas que ça (clôture, muret bas, caisses) arrête les corps mais pas les balles

  // distance² du point (px, pz) au segment [a, b]
  function d2Seg(px, pz, ax, az, bx, bz) {
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * ex - px, qz = az + t * ez - pz; return qx * qx + qz * qz;
  }
  // entrée du segment a + t·d (t ∈ [0, tmax]) dans la boîte [x0, x1] × [z0, z1] (méthode des dalles) : t d'entrée, ou Infinity
  function dalle(ax, az, dx, dz, tmax, x0, z0, x1, z1) {
    let t0 = 0, t1 = tmax;
    if (Math.abs(dx) < 1e-12) { if (ax < x0 || ax > x1) return Infinity; }
    else { let a = (x0 - ax) / dx, b = (x1 - ax) / dx; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return Infinity; }
    if (Math.abs(dz) < 1e-12) { if (az < z0 || az > z1) return Infinity; }
    else { let a = (z0 - az) / dz, b = (z1 - az) / dz; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return Infinity; }
    return t0;
  }
  // entrée du rayon dans le cercle (cx, cz, R) : t, ou Infinity (d unitaire)
  function cercle(ax, az, dx, dz, tmax, cx, cz, R) {
    const fx = ax - cx, fz = az - cz, b = fx * dx + fz * dz, c = fx * fx + fz * fz - R * R;
    if (c <= 0) return 0;
    const disc = b * b - c; if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc); return t >= 0 && t <= tmax ? t : Infinity;
  }

  function creer(arene) {
    const demi = arene.taille / 2;
    const rects = [], cercles = [];
    for (const o of arene.obstacles) {
      if (o.r) { const [x, z, w, d, h] = o.r; rects.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h: h == null ? 1.5 : h, type: o.type }); }
      else if (o.c) { const [x, z, r] = o.c; cercles.push({ x, z, r, h: o.h == null ? (o.type === 'foin' ? 1.2 : 2) : o.h, type: o.type }); }
    }
    function bloque(x, z, r) {
      if (x < -demi + r || x > demi - r || z < -demi + r || z > demi - r) return true;
      for (let i = 0; i < rects.length; i++) {
        const b = rects[i], qx = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x, qz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
        if ((qx - x) * (qx - x) + (qz - z) * (qz - z) < r * r) return true;
      }
      for (let i = 0; i < cercles.length; i++) { const c = cercles[i], R = c.r + r; if ((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) < R * R) return true; }
      return false;
    }
    function passe(ax, az, bx, bz, r) {
      r = r || 0;
      if (Math.abs(bx) > demi - r || Math.abs(bz) > demi - r) return false;
      const dx = bx - ax, dz = bz - az;
      for (let i = 0; i < rects.length; i++) { const b = rects[i]; if (dalle(ax, az, dx, dz, 1, b.x0 - r, b.z0 - r, b.x1 + r, b.z1 + r) <= 1) return false; }
      for (let i = 0; i < cercles.length; i++) { const c = cercles[i], R = c.r + r; if (d2Seg(c.x, c.z, ax, az, bx, bz) < R * R) return false; }
      return true;
    }
    function tir(ax, az, dx, dz, max) { // d unitaire
      let t = max;
      // le bord de l'arène
      if (dx > 1e-9) t = Math.min(t, (demi - ax) / dx); else if (dx < -1e-9) t = Math.min(t, (-demi - ax) / dx);
      if (dz > 1e-9) t = Math.min(t, (demi - az) / dz); else if (dz < -1e-9) t = Math.min(t, (-demi - az) / dz);
      for (let i = 0; i < rects.length; i++) { const b = rects[i]; if (b.h < BAS) continue; const u = dalle(ax, az, dx, dz, t, b.x0, b.z0, b.x1, b.z1); if (u < t) t = u; }
      for (let i = 0; i < cercles.length; i++) { const c = cercles[i]; if (c.h < BAS) continue; const u = cercle(ax, az, dx, dz, t, c.x, c.z, c.r); if (u < t) t = u; }
      return Math.max(0, t);
    }
    function vue(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az, l = Math.sqrt(dx * dx + dz * dz); if (l < 1e-6) return true;
      return tir(ax, az, dx / l, dz / l, l) >= l - 1e-6;
    }
    function pousser(c) {
      const r = c.rayon;
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < rects.length; i++) {
          const b = rects[i];
          if (c.x < b.x0 - r || c.x > b.x1 + r || c.z < b.z0 - r || c.z > b.z1 + r) continue;
          const qx = c.x < b.x0 ? b.x0 : c.x > b.x1 ? b.x1 : c.x, qz = c.z < b.z0 ? b.z0 : c.z > b.z1 ? b.z1 : c.z;
          const ex = c.x - qx, ez = c.z - qz, d2 = ex * ex + ez * ez;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; c.x += ex * k; c.z += ez * k; }
          else { // le centre est dans la boîte : on sort par le côté le plus proche
            const g = c.x - b.x0, dr = b.x1 - c.x, h = c.z - b.z0, ba = b.z1 - c.z, m = Math.min(g, dr, h, ba);
            if (m === g) c.x = b.x0 - r; else if (m === dr) c.x = b.x1 + r; else if (m === h) c.z = b.z0 - r; else c.z = b.z1 + r;
          }
        }
        for (let i = 0; i < cercles.length; i++) {
          const o = cercles[i], R = o.r + r, ex = c.x - o.x, ez = c.z - o.z, d2 = ex * ex + ez * ez;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) || 1e-6, k = (R - d) / d; c.x += (d2 > 1e-12 ? ex : 1) * k; c.z += (d2 > 1e-12 ? ez : 0) * k;
        }
      }
      const m = demi - r;
      if (c.x < -m) c.x = -m; else if (c.x > m) c.x = m;
      if (c.z < -m) c.z = -m; else if (c.z > m) c.z = m;
      return c;
    }
    // une case libre près de (x, z), en spirale (pour poser une défense, une caisse, un zombie qui sort)
    function libreProche(x, z, r, rmax) {
      if (!bloque(x, z, r)) return [x, z];
      for (let d = 0.5; d <= (rmax || 6); d += 0.5) {
        const n = Math.max(8, Math.round(d * 6));
        for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (!bloque(px, pz, r)) return [px, pz]; }
      }
      return null;
    }
    return { L: arene.taille, demi, limite: null, rects, cercles, bloque, passe, tir, vue, pousser, libreProche };
  }
  return { creer, BAS };
});
