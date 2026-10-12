#!/usr/bin/env node
// Opération Poncin — le monde physique (PMONDE) et la navigation (PNAV) : relief, bâtiments, collisions, rayons, lignes de vue, points
// libres, chemins. Cartes synthétiques construites ici (une rue, une place, une ruelle d'1 m, une cour fermée, un coin aigu, une rivière
// et son pont, une zone interdite, du relief ; un village de 600 m pour les temps ; un bourg à voûtes, troncs, murs et mobilier), puis
// la vraie carte (ses deux passages voûtés, ses 2 790 troncs) et la carte provisoire si elles sont là. Les références (dedans, rayon)
// sont écrites à part, par force brute. Sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PN = require('../src-poncin/nav.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; return !!ok; };
const titre = (t) => console.log('\n── ' + t);
const f2 = (v) => (Math.round(v * 100) / 100).toString(), f3 = (v) => v.toFixed(3);
const quantile = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const rect = (x0, z0, x1, z1, h, t, sens) => ({ p: sens ? [[x0, z0], [x0, z1], [x1, z1], [x1, z0]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h, t: t || 'maison' });

// ─── géométrie de référence, écrite à part (pas celle du module) ───
function dansPolyRef(q, x, z) { let d = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, zi] = q[i], [xj, zj] = q[j]; if ((zi > z) !== (zj > z) && x < xi + (xj - xi) * (z - zi) / (zj - zi)) d = !d; } return d; }
const dansCouloirRef = (C, x, z) => { const dx = x - C.mx, dz = z - C.mz; return Math.abs(dx * C.ux + dz * C.uz) <= C.dl && Math.abs(dx * C.vx + dz * C.vz) <= C.dw; };
// les passages voûtés, d'après leur description (monde.passages : l, u, long, w, h, sol, b) : le couloir, l'intrados en plein cintre
function couloirRef(P, x, z) { const rx = x - P.l[0][0], rz = z - P.l[0][1], t = rx * P.u[0] + rz * P.u[1], e = rz * P.u[0] - rx * P.u[1]; return t >= 0 && t <= P.long && Math.abs(e) <= P.w / 2 ? { t, e } : null; }
const intradosRef = (P, c) => P.sol[0] + (P.sol[1] - P.sol[0]) * c.t / P.long + P.h - P.w / 2 + Math.sqrt(Math.max(0, P.w * P.w / 4 - c.e * c.e));
const creuxRef = (monde, i, x, y, z) => monde.passages.some((P) => { if (!P.b.includes(i)) return false; const c = couloirRef(P, x, z); return !!c && y <= intradosRef(P, c); });
function dedansRef(monde, carte, x, z) { // dans un bâtiment (hors du couloir de ses passages), une zone interdite, l'eau hors des ponts, ou hors du carré
  const L = monde.L; if (!(Math.abs(x) <= L / 2 && Math.abs(z) <= L / 2)) return true;
  if (monde.batiments.some((b, i) => dansPolyRef(b.p, x, z) && !monde.passages.some((P) => P.b.includes(i) && couloirRef(P, x, z)))) return true;
  if ((carte.interdit || []).some((zn) => dansPolyRef(zn.p, x, z))) return true;
  return (carte.eau || []).some((e) => dansPolyRef(e.p, x, z)) && !monde.couloirs.some((C) => dansCouloirRef(C, x, z));
}
function hauteurRef(carte, x, z) { // barycentrique dans le triangle du maillage, par un système 2 × 2 générique
  const { pas, n, h } = carte.relief, L = carte.taille;
  const u = Math.min(n - 1, Math.max(0, (x + L / 2) / pas)), v = Math.min(n - 1, Math.max(0, (z + L / 2) / pas));
  const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), fx = u - i, fz = v - j;
  const T = fx + fz <= 1 ? [[i, j], [i, j + 1], [i + 1, j]] : [[i, j + 1], [i + 1, j + 1], [i + 1, j]];
  const [[a0, b0], [a1, b1], [a2, b2]] = T, det = (a1 - a0) * (b2 - b0) - (a2 - a0) * (b1 - b0);
  const l1 = ((u - a0) * (b2 - b0) - (a2 - a0) * (v - b0)) / det, l2 = ((a1 - a0) * (v - b0) - (u - a0) * (b1 - b0)) / det;
  const H = (p) => h[p[1] * n + p[0]]; return H(T[0]) * (1 - l1 - l2) + H(T[1]) * l1 + H(T[2]) * l2;
}
// les obstacles de la carte, décrits à part (rayons, hauteurs : ceux du contrat de monde.js) : troncs des arbres mesurés, murs, mobilier massif
const MOB_REF = { fontaine: [[1.15, 0.6]], monument: [[1.3, 0.4], [0.75, 2.1], [0.36, 4.7]], croix: [[0.45, 1.36]] };
function obstaclesRef(monde, carte) {
  if (carte._obsRef) return carte._obsRef;
  const H = (x, z) => monde.hauteur(x, z), o = { cyl: [], caps: [] };
  (carte.arbres || []).forEach((a, k) => { if (a.length >= 5) { const r = Math.min(0.6, Math.max(0.2, 0.12 + 0.025 * a[2])), y = H(a[0], a[1]); o.cyl.push({ x: a[0], z: a[1], r, haut: y + Math.max(2.5, a[2] / 2), bas: y - 0.6, de: 'arbre', k });
    const rf = Math.min(0.45 * a[3], r + 0.3); if (a[4] === 'conifere' && rf > r + 0.05) o.cyl.push({ x: a[0], z: a[1], r: rf, haut: y + 0.6 * a[2], bas: y + 0.3, de: 'arbre', k }); } }); // + le feuillage dense
  (carte.mobilier || []).forEach((m, k) => { const t = MOB_REF[m.t]; if (t) { const y = H(m.x, m.z); for (const c of t) o.cyl.push({ x: m.x, z: m.z, r: c[0], haut: y + c[1], bas: y - 0.6, de: 'mobilier', k }); }
    else if (m.t === 'abribus') { const c = Math.cos(m.yaw || 0), s = Math.sin(m.yaw || 0), P = (lx, lz) => [m.x - c * lx - s * lz, m.z + s * lx - c * lz], a = P(-1.55, -0.62), b = P(1.55, -0.62), y = H(m.x, m.z); o.caps.push({ a, b, r: 0.08, ha: y + 2.38, hb: y + 2.38, bas: y - 0.6, de: 'mobilier', k }); } });
  (carte.murs || []).forEach((m, k) => { const h = m.h > 0.3 ? Math.min(6, Math.max(0.4, m.h)) : 1.8, e = m.e > 0.05 ? Math.min(1.2, Math.max(0.1, m.e)) : 0.45;
    for (let i = 0; i + 1 < m.l.length; i++) { const a = m.l[i], b = m.l[i + 1]; o.caps.push({ a, b, r: e / 2, ha: H(a[0], a[1]) + h, hb: H(b[0], b[1]) + h, bas: Math.min(H(a[0], a[1]), H(b[0], b[1])) - 0.6, de: 'mur', k, sol: h > 0.45 }); } });
  (monde.bancs || []).forEach(([x, z, yaw]) => { const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, lz) => [x - c * lx - s * lz, z + s * lx - c * lz], y = Math.min(H(x, z), H(x + 0.9, z), H(x - 0.9, z)); o.caps.push({ a: P(-0.78, -0.015), b: P(0.78, -0.015), r: 0.23, ha: y + 0.86, hb: y + 0.86, bas: y - 0.6, de: 'mobilier', k: -1 }); });
  carte._obsRef = o; Object.defineProperty(carte, '_obsRef', { enumerable: false }); return o;
}
// le premier obstacle, en essayant TOUS les murs (sauf sous l'arc d'une arcade), TOUS les toits, les piédroits et (par pas de 5 mm) les
// voûtes des passages, tous les troncs et objets (cylindres), tous les murs (capsules, par pas de 1 cm), et le terrain par pas de 2 cm
function rayonRef(monde, o, d, max, carte) {
  let best = max, res = null; const L = monde.L, at = (t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  const prendre = (t, r) => { if (t >= 0 && t < best) { best = t; res = Object.assign({ t }, r); } };
  const plan = (ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, den = d[0] * ez - d[2] * ex; if (Math.abs(den) < 1e-12) return null; const wx = ax - o[0], wz = az - o[2], t = (wx * ez - wz * ex) / den, u = (wx * d[2] - wz * d[0]) / den; return u >= 0 && u <= 1 && t >= 0 ? t : null; };
  monde.batiments.forEach((b, bi) => {
    const q = b.p;
    for (let k = 0; k < q.length; k++) {
      const [ax, az] = q[k], [bx, bz] = q[(k + 1) % q.length], t = plan(ax, az, bx, bz); if (t === null) continue;
      const [x, y, z] = at(t); if (y >= b.base && y <= b.sommet && !creuxRef(monde, bi, x, y, z)) prendre(t, { quoi: 'mur', i: bi, de: 'batiment' });
    }
    if (d[1] !== 0) { const t = (b.sommet - o[1]) / d[1]; if (t >= 0 && t < best && dansPolyRef(q, o[0] + d[0] * t, o[2] + d[2] * t)) prendre(t, { quoi: 'toit', i: bi, de: 'batiment' }); }
  });
  monde.passages.forEach((P, p) => {
    const hw = P.w / 2, [ax, az] = P.l[0], [ux, uz] = P.u, nx = -uz, nz = ux, bx = ax + ux * P.long, bz = az + uz * P.long;
    const C = [[ax + nx * hw, az + nz * hw], [bx + nx * hw, bz + nz * hw], [bx - nx * hw, bz - nz * hw], [ax - nx * hw, az - nz * hw]];
    for (let k = 0; k < 4; k++) { // les côtés du couloir, dans l'emprise : les piédroits
      const t = plan(C[k][0], C[k][1], C[(k + 1) % 4][0], C[(k + 1) % 4][1]); if (t === null) continue;
      const [x, y, z] = at(t); for (const i of P.b) { const b = monde.batiments[i]; if (dansPolyRef(b.p, x, z) && y >= b.base && y <= b.sommet) prendre(t, { quoi: 'mur', i, de: 'batiment' }); }
    }
    let avant = false; // la voûte : le premier point du couloir, dans l'emprise, au-dessus de l'intrados, juste après un point du couloir sous l'intrados
    for (let t = 0; t < best; t += 0.005) {
      const [x, y, z] = at(t), c = couloirRef(P, x, z), i = c ? P.b.find((j) => dansPolyRef(monde.batiments[j].p, x, z)) : undefined;
      const dessus = i !== undefined && y > intradosRef(P, c) && y < monde.batiments[i].sommet;
      if (dessus && avant) {
        let lo = t - 0.005, hi = t; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2, [x2, y2, z2] = at(m), c2 = couloirRef(P, x2, z2); if (c2 && y2 > intradosRef(P, c2)) hi = m; else lo = m; }
        const [x3, , z3] = at(hi); if (P.b.some((j) => dansPolyRef(monde.batiments[j].p, x3, z3))) prendre(hi, { quoi: 'mur', i, de: 'voute', k: p }); // sinon : la façade au-dessus de l'arc
        break;
      }
      avant = !!c && y <= intradosRef(P, c);
    }
  });
  if (carte) {
    const O = obstaclesRef(monde, carte), dh = Math.hypot(d[0], d[2]);
    for (const c of O.cyl) { // cylindres : l'équation du second degré dans le plan, puis la hauteur (ou le dessus)
      const qx = o[0] - c.x, qz = o[2] - c.z, A = d[0] * d[0] + d[2] * d[2], B = 2 * (qx * d[0] + qz * d[2]), Cc = qx * qx + qz * qz - c.r * c.r;
      if (Cc <= 0 || A < 1e-12) continue; const D = B * B - 4 * A * Cc; if (D < 0) continue;
      const t = (-B - Math.sqrt(D)) / (2 * A); if (t < 0 || t >= best) continue;
      const y = o[1] + d[1] * t; if (y <= c.haut) { if (y >= c.bas) prendre(t, { quoi: 'mur', i: -1, de: c.de, k: c.k }); continue; }
      if (d[1] < 0) { const t2 = (c.haut - o[1]) / d[1], x2 = o[0] + d[0] * t2, z2 = o[2] + d[2] * t2; if (Math.hypot(x2 - c.x, z2 - c.z) <= c.r) prendre(t2, { quoi: 'toit', i: -1, de: c.de, k: c.k }); }
    }
    for (const c of O.caps) { // capsules : on avance par pas de 1 cm là où le rayon passe près du segment
      const dans = (t) => { const [x, , z] = at(t); return Math.sqrt(d2Ref(x, z, c.a, c.b)) <= c.r; };
      const haut = (t) => { const [x, , z] = at(t), ex = c.b[0] - c.a[0], ez = c.b[1] - c.a[1], l2 = ex * ex + ez * ez, f = l2 ? Math.max(0, Math.min(1, ((x - c.a[0]) * ex + (z - c.a[1]) * ez) / l2)) : 0; return c.ha + (c.hb - c.ha) * f; };
      if (dans(0) || dh < 1e-9) continue;
      const lo0 = Math.max(0, Math.min(...[c.a, c.b].map((q) => ((q[0] - o[0]) * d[0] + (q[1] - o[2]) * d[2]) / (dh * dh))) - (c.r + 3) / dh), hi0 = Math.min(best, Math.max(...[c.a, c.b].map((q) => ((q[0] - o[0]) * d[0] + (q[1] - o[2]) * d[2]) / (dh * dh))) + (c.r + 3) / dh);
      for (let t = lo0; t < hi0; t += 0.01) {
        if (!dans(t)) continue;
        let lo = Math.max(0, t - 0.01), hi = t; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (dans(m)) hi = m; else lo = m; }
        const y = o[1] + d[1] * hi; if (y <= haut(hi)) { if (y >= c.bas) prendre(hi, { quoi: 'mur', i: -1, de: c.de, k: c.k }); break; }
        for (let u = hi; u < hi0 && dans(u); u += 0.005) if (o[1] + d[1] * u <= haut(u)) { let a = u - 0.005, b = u; for (let n = 0; n < 30; n++) { const m = (a + b) / 2; if (o[1] + d[1] * m <= haut(m)) b = m; else a = m; } prendre(b, { quoi: 'toit', i: -1, de: c.de, k: c.k }); break; }
        break;
      }
    }
  }
  let tSort = best; for (const k of [0, 2]) { if (d[k] > 0) tSort = Math.min(tSort, (L / 2 - o[k]) / d[k]); else if (d[k] < 0) tSort = Math.min(tSort, (-L / 2 - o[k]) / d[k]); }
  const f = (t) => o[1] + d[1] * t - monde.hauteur(o[0] + d[0] * t, o[2] + d[2] * t);
  if (f(0) < 0) return { t: 0, quoi: 'sol', i: -1, de: 'terrain' };
  for (let t = 0; t < tSort; t += 0.02) {
    const t2 = Math.min(tSort, t + 0.02);
    if (f(t2) < 0) { let lo = t, hi = t2; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (f(m) < 0) hi = m; else lo = m; } if (hi <= best) return { t: hi, quoi: 'sol', i: -1, de: 'terrain' }; break; }
  }
  return res;
}
function d2Ref(px, pz, a, b) { const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez; let t = l2 ? ((px - a[0]) * ex + (pz - a[1]) * ez) / l2 : 0; t = Math.max(0, Math.min(1, t)); return (px - a[0] - t * ex) ** 2 + (pz - a[1] - t * ez) ** 2; }
// même chose touchée : même surface, même bâtiment, même source (et même objet), au même endroit (tol mètres)
const memeTouche = (A, B, tol) => A && B && A.i === B.i && Math.abs(A.t - B.t) < tol && ((A.quoi === B.quoi && A.de === B.de && (B.k === undefined || A.k === B.k))
  || (A.quoi === 'mur' && B.quoi === 'mur' && [A.de, B.de].every((d) => d === 'voute' || d === 'batiment') && Math.abs(A.t - B.t) < 0.005)); // à la naissance de la voûte, voûte ou piédroit : le même point
const segCroise = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d); return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); };

// ─── carte 1 : le hameau d'essai (200 m) ───
function hameau() {
  const L = 200, n = 21, pas = 10, h = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -L / 2 + i * pas, z = -L / 2 + j * pas; h.push(200 + 0.03 * x + 12 * Math.exp(-((x - 60) ** 2 + (z + 55) ** 2) / 600) + 0.5 * Math.sin(x / 7) * Math.cos(z / 9)); }
  const batiments = [];
  // la rue (z de −5 à 5) entre deux rangées ; une ruelle d'1 m dans la rangée nord (x de −30 à −29)
  for (const [x0, x1] of [[-90, -70], [-66, -50], [-46, -30], [-29, -14], [-10, 6], [10, 26], [30, 46], [50, 66]]) {
    batiments.push(rect(x0, -16, x1, -5, 7 + ((x0 + 100) % 5), 'maison', x0 % 3 === 0)); // orientations mélangées
    if (x0 !== -46 && x0 !== -29) batiments.push(rect(x0, 5, x1, 16, 6 + ((x0 + 100) % 4), 'commerce', x0 % 2 === 0));
  }
  batiments.push(rect(80, -30, 88, -22, 25, 'tour')); // une tour
  batiments.push({ p: [[-30, 25], [-10, 25], [-10, 30], [-25, 30], [-25, 45], [-30, 45], [-30, 25]], h: 9, t: 'mairie' }); // en L, point final répété
  batiments.push({ p: [[-80, 25], [-70, 45], [-60, 25], [-62, 25], [-70, 41], [-78, 25]], h: 8, t: 'annexe' }); // un Λ : coin aigu dessous
  for (const r of [[30, 22, 70, 30], [30, 44, 70, 52], [30, 30, 38, 44], [62, 30, 70, 44]]) batiments.push(rect(...r, 10, 'maison')); // une cour fermée
  batiments.push(rect(0, 40, 1, 41, 3, 'annexe')); // un kiosque d'1 m
  batiments.push({ p: [[5, 5], [6, 6]], h: 5 }); // dégénéré : ignoré
  return {
    v: 1, nom: 'Hameau', source: 'essai', taille: L, origine: { lat: 46, lon: 5 }, relief: { pas, n, h }, batiments,
    rues: [{ l: [[-100, 0], [100, 0]], w: 8, t: 'rue', n: 'Grande Rue' }],
    eau: [{ p: [[-110, 60], [110, 60], [110, 70], [-110, 70]], t: 'riviere' }], // traverse tout le carré
    ponts: [{ l: [[20, 58], [20, 72]], w: 6 }],
    interdit: [{ p: [[-95, -95], [-60, -95], [-60, -65], [-95, -65]], n: 'Château (propriété privée)' }],
    vegetation: [], arbres: [], noms: [], sol: null, zones: { arene: { centre: [0, 0], rayon: 80 }, apparitions: [], armes: [] },
  };
}
// ─── carte 2 : un village de 600 m généré (rues tous les 48 m, pâtés, prés, rivière à trois ponts, château) ───
function village600(graine) {
  const rnd = R.mulberry32(graine), L = 600, n = 61, pas = 10, h = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -L / 2 + i * pas, z = -L / 2 + j * pas; h.push(240 + 0.04 * x - 0.02 * z + 6 * Math.sin(x / 53) * Math.cos(z / 41) + 14 * Math.exp(-((x + 180) ** 2 + (z + 160) ** 2) / 4000)); }
  const riv = (x) => 150 + 12 * Math.sin(x / 60), batiments = [];
  const poser = (x0, z0, w, d, a, hh) => { const cx = x0 + w / 2, cz = z0 + d / 2, c = Math.cos(a), s = Math.sin(a); batiments.push({ p: [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]), h: hh, t: 'maison' }); };
  for (let bx = -292; bx < 284; bx += 48) for (let bz = -292; bz < 284; bz += 48) {
    if (rnd() < 0.22 || (bz + 40 > riv(bx) - 14 && bz < riv(bx) + 26) || (bx > 140 && bx < 250 && bz < -190)) continue; // pré, berges, château
    const k = 2 + Math.floor(rnd() * 6);
    for (let q = 0; q < k; q++) { const w = 6 + rnd() * 11, d = 6 + rnd() * 9; poser(bx + 4 + rnd() * (40 - w - 8), bz + 4 + rnd() * (40 - d - 8), w, d, (rnd() - 0.5) * 0.8, 4 + rnd() * 10); }
    if (rnd() < 0.3) batiments.push({ p: [[bx + 2, bz + 2], [bx + 20, bz + 2], [bx + 20, bz + 8], [bx + 8, bz + 8], [bx + 8, bz + 22], [bx + 2, bz + 22]], h: 7, t: 'maison' }); // en L
  }
  const haut = [], bas = []; for (let x = -320; x <= 320; x += 20) { haut.push([x, riv(x) - 7]); bas.unshift([x, riv(x) + 7]); }
  return {
    v: 1, nom: 'Village', source: 'essai', taille: L, relief: { pas, n, h }, batiments, rues: [],
    eau: [{ p: haut.concat(bas), t: 'riviere' }], ponts: [-150, 30, 200].map((x) => ({ l: [[x, riv(x) - 14], [x, riv(x) + 14]], w: 7 })),
    interdit: [{ p: [[150, -290], [240, -290], [240, -200], [150, -200]], n: 'Château' }], vegetation: [], arbres: [], noms: [], sol: null,
    zones: { arene: { centre: [0, 0], rayon: 110 }, apparitions: [], armes: [] },
  };
}

// ─────────────────────────────────────────── le hameau, cas par cas ───────────────────────────────────────────
const C1 = hameau(); let t0 = performance.now(); const M = PM.creer(C1); const msCreer1 = performance.now() - t0;
titre(`Hameau d'essai (200 m) : ${M.batiments.length} bâtiments, ${M.stats.aretes} arêtes, construit en ${f2(msCreer1)} ms`);
check(M.L === 200 && M.limite === null, 'monde.L et monde.limite (null au départ)');
check(M.batiments.length === C1.batiments.length - 1, 'le polygone dégénéré est écarté, les autres gardés');
{
  const aire = (q) => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  check(M.batiments.every((b) => aire(b.p) > 0), 'bâtiments normalisés : tous dans le même sens (aire signée positive en x, z)');
  const L = M.batiments.find((b) => b.t === 'mairie');
  check(L.p.length === 6, 'le point final répété est retiré (L à 6 sommets)');
  check(M.batiments.every((b) => { const xs = b.p.map((p) => p[0]), zs = b.p.map((p) => p[1]); return b.aabb[0] === Math.min(...xs) && b.aabb[2] === Math.max(...xs) && b.aabb[1] === Math.min(...zs) && b.aabb[3] === Math.max(...zs); }), 'aabb exactes');
  let pire = 0, dessous = true;
  for (const b of M.batiments) { // le minimum du relief sous l'emprise, par échantillonnage fin (sommets compris)
    let m = Math.min(...b.p.map(([x, z]) => M.hauteur(x, z)));
    for (let x = b.aabb[0]; x <= b.aabb[2]; x += 0.25) for (let z = b.aabb[1]; z <= b.aabb[3]; z += 0.25) if (dansPolyRef(b.p, x, z)) m = Math.min(m, M.hauteur(x, z));
    pire = Math.max(pire, Math.abs(b.base - (m - 0.5))); if (b.base > m - 0.5 + 1e-9) dessous = false;
  }
  check(dessous && pire < 0.05, `base = relief minimal sous l'emprise − 0,5 m (écart à l'échantillonnage ${f3(pire)} m, jamais au-dessus)`);
  check(M.batiments.every((b) => Math.abs(b.sommet - b.base - b.h) < 1e-9), 'sommet = base + h');
}

titre('Relief : la triangulation partagée');
{
  const { pas, n, h } = C1.relief; let ok = true;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.abs(M.relief(-100 + i * pas, -100 + j * pas) - h[j * n + i]) > 1e-9) ok = false;
  check(ok, 'aux nœuds de la grille : exactement h[j·n + i]');
  const rnd = R.mulberry32(11); let e = 0;
  for (let k = 0; k < 20000; k++) { const x = -100 + 200 * rnd(), z = -100 + 200 * rnd(); e = Math.max(e, Math.abs(M.relief(x, z) - hauteurRef(C1, x, z))); }
  check(e < 1e-9, `dans les triangles [(i,j),(i,j+1),(i+1,j)] et [(i,j+1),(i+1,j+1),(i+1,j)] : barycentrique exact (écart ${e.toExponential(1)})`);
  let saut = 0; // continuité de part et d'autre des diagonales et des bords de case
  for (let k = 0; k < 5000; k++) { const i = Math.floor(rnd() * (n - 1)), j = Math.floor(rnd() * (n - 1)), s = rnd(), x = -100 + (i + s) * pas, z = -100 + (j + 1 - s) * pas; saut = Math.max(saut, Math.abs(M.relief(x + 1e-7, z + 1e-7) - M.relief(x - 1e-7, z - 1e-7))); }
  check(saut < 1e-4, 'continu à travers les diagonales (i+1, j)–(i, j+1)');
  check([M.relief(-500, 0), M.relief(0, 900), M.relief(NaN, 0)].every(Number.isFinite), 'hors du carré ou NaN : une hauteur finie (bord prolongé)');
}

titre('Ponts : on marche sur la chaussée dessinée (C7)');
{
  // la référence, écrite à part : le profil de rendu.js (relief + 8 cm aux deux bouts, droit, jamais sous le relief + 8 cm, échantillonné
  // tous les ≤ 1,5 m), la chaussée 6 cm au-dessus ; on y marche sur la largeur du couloir (w/2 + 0,5 m), de a à b
  const tablierRef = (Mo, pt) => { const [a, b] = [pt.l[0], pt.l[pt.l.length - 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(len / 1.5)), hA = Mo.relief(a[0], a[1]) + 0.08, hB = Mo.relief(b[0], b[1]) + 0.08;
    const prof = []; for (let k = 0; k <= n; k++) { const t = k / n; prof.push(Math.max(hA + (hB - hA) * t, Mo.relief(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) + 0.08)); }
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], demi = (pt.w || 6) / 2 + 0.5;
    return (x, z) => { const rx = x - a[0], rz = z - a[1], s = rx * u[0] + rz * u[1], e = rz * u[0] - rx * u[1]; if (s < 0 || s > len || Math.abs(e) > demi) return -Infinity; const v = s / len * n, k = Math.min(n - 1, Math.floor(v)); return prof[k] + (prof[k + 1] - prof[k]) * (v - k) + 0.06; };
  };
  const cartes = [['hameau', C1, M]], vraieP = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
  if (fs.existsSync(vraieP)) { const CVp = JSON.parse(fs.readFileSync(vraieP, 'utf8')); cartes.push(['vraie carte', CVp, PM.creer(CVp)]); }
  for (const [nom, Cx, Mx] of cartes) {
    const rnd = R.mulberry32(77); let ecart = 0, dessus = 0, pireAvant = 0, sousRelief = 0, saut = 0, pente = 0;
    check(Mx.tabliers.length === Cx.ponts.length && PM.CHAUSSEE === 0.06 && PM.SUR_TABLIER === 0.08, `${nom} : ${Mx.tabliers.length} tablier(s) exposés à rendu.js (une seule formule)`);
    for (const pt of Cx.ponts) {
      const ref = tablierRef(Mx, pt), [a, b] = [pt.l[0], pt.l[pt.l.length - 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], v = [-u[1], u[0]];
      for (let k = 0; k < 4000; k++) { // au hasard autour du pont : hauteur = max(relief, chaussée de référence)
        const s = -3 + (len + 6) * rnd(), e = ((pt.w || 6) / 2 + 2) * (2 * rnd() - 1), x = a[0] + u[0] * s + v[0] * e, z = a[1] + u[1] * s + v[1] * e, c = ref(x, z), r = Mx.relief(x, z), h = Mx.hauteur(x, z);
        ecart = Math.max(ecart, Math.abs(h - Math.max(r, c))); if (h < r - 1e-9) sousRelief++;
        if (c > r) { dessus++; pireAvant = Math.max(pireAvant, c - r); }
      }
      let hp = Mx.hauteur(a[0] + u[0] * 0.01, a[1] + u[1] * 0.01); // le long de l'axe, par pas de 5 cm : continu, pente = celle du profil
      for (let s = 0.06; s < len - 0.01; s += 0.05) { const x = a[0] + u[0] * s, z = a[1] + u[1] * s, h = Mx.hauteur(x, z); saut = Math.max(saut, Math.abs(h - hp)); hp = h;
        const g = Mx.pente(x, z), d = (Mx.hauteur(x + u[0] * 0.01, z + u[1] * 0.01) - Mx.hauteur(x - u[0] * 0.01, z - u[1] * 0.01)) / 0.02; if (Math.abs(d) < 2) pente = Math.max(pente, Math.abs(g[0] * u[0] + g[1] * u[1] - d)); }
    }
    check(ecart < 1e-9 && sousRelief === 0 && dessus > 100, `${nom} : monde.hauteur = max(relief, chaussée) (écart ${ecart.toExponential(1)} sur ${dessus} points sur un tablier ; le relief y était jusqu'à ${f2(pireAvant * 100)} cm sous la chaussée)`);
    check(saut < 0.03 && pente < 0.02, `${nom} : sur l'axe, la chaussée est continue (saut ≤ ${f2(saut * 100)} cm en 5 cm) et monde.pente la suit (écart ${f3(pente)})`);
    const T = Mx.tabliers[0], mx = (T.ax + T.bx) / 2, mz = (T.az + T.bz) / 2, y0 = Mx.hauteur(mx, mz), h = Mx.rayon(mx, y0 + 3, mz, 0, -1, 0, 10);
    check(h && h.de === 'terrain' && Math.abs(h.y - y0) < 0.01, `${nom} : un tir vers le bas, au milieu du pont, s'arrête sur la chaussée (${h && f2(h.y - y0)} m de l'écart)`);
  }
  // un joueur qui traverse le pont du hameau marche sur la chaussée, pas dedans
  const J = R.JOUEUR, PCo = (() => { try { global.PREGLES = R; return require('../src-poncin/corps.js'); } catch (e) { return null; } })();
  if (PCo) {
    const e = { x: 20, y: M.hauteur(20, 50), z: 50, vx: 0, vz: 0, vy: 0, yaw: Math.PI, pitch: 0, auSol: true, accroupi: false }, en = { avant: 1, cote: 0, dyaw: 0, dpitch: 0 }; let pire = 0, n = 0;
    for (let k = 0; k < 600 && e.z < 80; k++) { PCo.deplacer(e, en, 1 / 60, M, null); if (e.z > 58 && e.z < 72) { n++; pire = Math.max(pire, Math.abs(e.y - M.hauteur(e.x, e.z))); } }
    check(n > 30 && pire < 1e-9 && e.z > 72, `le hameau : un joueur traverse le pont les pieds sur la chaussée (${n} pas sur le tablier, écart ${pire.toExponential(1)} m)`);
  }
}

titre('bloque');
{
  const b = (x, z, r) => M.bloque(x, z, r);
  check(b(-80, -10, 0) && b(-80, -10, 0.35), 'au cœur d\'un bâtiment');
  check(!b(-80, 0, 0.35) && !b(0, 0, 1), 'au milieu de la rue');
  check(b(-80, -4.7, 0.35) && !b(-80, -4.6, 0.35), 'contre un mur : bloqué à 0,30 m, libre à 0,40 m (rayon 0,35)');
  check(b(-40, 65, 0.35) && b(-40, 61, 0), 'dans la rivière, loin du pont');
  check(!b(20, 65, 0.35) && !b(23, 65, 0.35) && b(23.3, 65, 0.35) && b(24, 65, 0), 'sur le pont (couloir élargi de 0,5 m de chaque côté), pas au-delà');
  check(!b(20, 75, 0.35) && !b(20, 56, 0.35), 'les deux têtes du pont restent ouvertes');
  check(b(-80, -80, 0.35) && b(-59.8, -80, 0.35) && !b(-59.5, -80, 0.35), 'zone interdite : bloque comme un mur');
  check(b(99.8, 0, 0.35) && b(0, -100.1, 0) && !b(99.5, 30, 0.35), 'bord du carré');
  check(b(50, 37, 0) === false && b(37.8, 37, 0.35), 'la cour fermée est libre (mais murée)');
  check(b(NaN, 0, 0.35) && b(0, Infinity, 0.35), 'NaN ou infini : bloqué');
  M.limite = { centre: [0, 0], rayon: 40 };
  check(b(39.8, 0, 0.35) && !b(39.5, 0, 0.35) && b(0, -45, 0), 'monde.limite (cercle) bloque aussi');
  M.limite = null;
  check(!b(39.8, 0, 0.35), '… et plus du tout une fois remise à null');
  check(b(-80, -6, 2) && !b(-80, 0, 2) && b(-80, 0, 5.5), 'grands rayons (au-delà de la marge de la grille)');
}

titre('deplacer : glisse le long des murs, jamais à travers');
{
  const r = 0.35, D = (x, z, dx, dz, rr) => M.deplacer(x, z, dx, dz, rr || r);
  let q = D(0, 0, 1, 0.5); check(q[0] === 1 && q[1] === 0.5, 'en plein air : le déplacement demandé, exactement');
  q = D(-80, -2, 0, -3); check(Math.abs(q[1] - (-5 + r)) < 2e-3 && q[0] === -80, `de face contre un mur : arrêté à r du mur (z = ${f3(q[1])})`);
  q = D(-80, -3, 2, -2); check(Math.abs(q[1] - (-5 + r)) < 2e-3 && Math.abs(q[0] - -78) < 0.02, `en biais : glisse le long du mur (x = ${f3(q[0])}, z = ${f3(q[1])})`);
  q = D(-80, -2, 0, -30); check(q[1] > -5 + r - 2e-3, 'un grand pas d\'un coup (30 m) : sous-pas, pas de saut à travers le mur');
  q = D(-80, -2, 0, -1e6); check(q[1] > -5 + r - 2e-3 && Number.isFinite(q[0]), 'un pas absurde (1 000 km) : borné, sans traverser');
  let p = [-29.5, -3]; for (let k = 0; k < 20; k++) p = D(p[0], p[1], 0, -1);
  check(p[1] < -17, `la ruelle d'1 m se franchit (rayon 0,35) : z = ${f2(p[1])}`);
  p = [-29.5, -3]; for (let k = 0; k < 20; k++) p = D(p[0], p[1], 0, -1, 0.55);
  check(p[1] > -5.5, 'un cercle de 0,55 m n\'y passe pas');
  p = [20, 50]; for (let k = 0; k < 40; k++) p = D(p[0], p[1], 0, 1);
  check(p[1] > 80, `traverse la rivière par le pont (z = ${f2(p[1])})`);
  p = [-40, 50]; for (let k = 0; k < 40; k++) p = D(p[0], p[1], 0, 1);
  check(Math.abs(p[1] - (60 - r)) < 2e-3, 'ailleurs, s\'arrête au bord de l\'eau');
  p = [22.5, 61]; let sec = true; for (let k = 0; k < 20; k++) { p = D(p[0], p[1], 0.4, 0.1); if (p[0] > 23.5 - r + 2e-3 || M.bloque(p[0], p[1], r - 2e-3)) sec = false; }
  check(sec && p[1] > 62.5, `longe le parapet du pont sans tomber à l'eau (x = ${f3(p[0])})`);
  // le coin aigu du Λ : on pousse vers la pointe, de face et en biais, des centaines de fois
  let pire = Infinity, dedans = false;
  for (const r2 of [0.35, 0.45]) {
    p = [-70, 27];
    for (let k = 0; k < 600; k++) { const a = Math.PI / 2 + (k % 7 - 3) * 0.25; p = D(p[0], p[1], Math.cos(a) * 0.6, Math.sin(a) * 0.6, r2); if (dedansRef(M, C1, p[0], p[1])) dedans = true; pire = Math.min(pire, Math.sqrt(minD2(M, p[0], p[1])) - r2); }
  }
  check(!dedans && pire > -2e-3, `coin aigu : jamais dedans, jamais enfoncé (marge la pire ${f3(pire)} m)`);
  q = D(-80, -4.8, 0.5, 0); check(-5 - q[1] <= 0 && q[1] >= -4.8 - 1e-6, 'départ déjà enfoncé (0,2 m du mur) : le long du mur, pas plus profond');
  q = D(-80, -4.8, 0, 0.5); check(q[1] > -4.4, '… et il peut s\'en écarter');
  q = D(NaN, 0, 1, 1); check(Number.isFinite(q[0]) && !M.bloque(q[0], q[1], 0.35), 'position NaN : ramené sur un point libre');
  q = D(-80, -14, 0.1, 0); check(!M.bloque(q[0], q[1], r) && Math.hypot(q[0] + 80, q[1] + 14) < 3, `départ DANS un bâtiment (téléportation ratée) : ressort au plus près (${f2(Math.hypot(q[0] + 80, q[1] + 14))} m)`);
  q = D(-40, 66, 0, 0.1); check(!M.bloque(q[0], q[1], r) && Math.hypot(q[0] + 40, q[1] - 66) < 5, 'départ dans la rivière : ressort sur la berge la plus proche');
  q = D(130, 0, -1, 0); check(!M.bloque(q[0], q[1], r) && q[0] < 100, 'départ hors du carré : revient dedans');
  q = D(0, 0, NaN, 1); check(q[0] === 0 && q[1] === 0, 'déplacement NaN : on ne bouge pas');
}
function minD2(monde, x, z) { const E = monde._interne.E; let m = Infinity; for (let k = 0; k < E.length; k += 4) { const ax = E[k], az = E[k + 1], ex = E[k + 2] - ax, ez = E[k + 3] - az, l2 = ex * ex + ez * ez; let t = ((x - ax) * ex + (z - az) * ez) / l2; t = Math.max(0, Math.min(1, t)); m = Math.min(m, (x - ax - t * ex) ** 2 + (z - az - t * ez) ** 2); } return m; }

titre('rayon : murs, toits, terrain');
{
  const y0 = M.hauteur(-80, 0) + 1.6;
  let h = M.rayon(-80, y0, 0, 0, 0, -1, 100);
  check(h && h.quoi === 'mur' && Math.abs(h.t - 5) < 1e-9 && Math.abs(h.nz - 1) < 1e-9 && M.batiments[h.i].aabb[2] === -70, 'vers le nord dans la rue : le mur de la rangée, normale vers le tireur');
  const b = M.batiments[h.i];
  h = M.rayon(-80, b.sommet + 10, -10, 0, -1, 0, 50);
  check(h && h.quoi === 'toit' && Math.abs(h.t - 10) < 1e-9 && h.ny === 1 && Math.abs(h.y - b.sommet) < 1e-9, 'à la verticale d\'un toit : le toit plat, normale (0, 1, 0)');
  h = M.rayon(3.3, M.hauteur(3.3, 2.7) + 1.6, 2.7, 0.6, -0.8, 0, 50); // touche au milieu d'un triangle (loin des lignes du maillage)
  const g = (x, z) => [(M.hauteur(x + 1e-5, z) - M.hauteur(x - 1e-5, z)) / 2e-5, (M.hauteur(x, z + 1e-5) - M.hauteur(x, z - 1e-5)) / 2e-5];
  check(h && h.quoi === 'sol' && h.i === -1 && Math.abs(h.y - M.hauteur(h.x, h.z)) < 1e-3, `vers le sol : le terrain (y = relief à ${f3(Math.abs(h.y - M.hauteur(h.x, h.z)))} m près)`);
  if (h) { const [gx, gz] = g(h.x, h.z), n = Math.hypot(gx, 1, gz); check(Math.abs(h.nx + gx / n) < 1e-3 && Math.abs(h.ny - 1 / n) < 1e-3 && Math.abs(h.nz + gz / n) < 1e-3, 'normale du terrain = celle du triangle touché'); }
  check(M.rayon(-80, y0, 0, 0, 0, -1, 4.9) === null, 'au-delà de max : null');
  check(M.rayon(0, 210, 0, 0, 0, 0, 10) === null && M.rayon(NaN, 0, 0, 1, 0, 0, 10) === null, 'direction nulle ou NaN : null');
  h = M.rayon(-80, y0, -10, 1, 0, 0, 100);
  check(h && h.quoi === 'mur' && h.nx < -0.99 && Math.abs(h.t - 10) < 1e-9, 'depuis l\'intérieur d\'un bâtiment : son propre mur, normale vers le tireur');
  const tour = M.batiments.find((x) => x.t === 'tour'), vise = (o, c) => { const d = [c[0] - o[0], c[1] - o[1], c[2] - o[2]], l = Math.hypot(...d); return M.rayon(...o, d[0] / l, d[1] / l, d[2] / l, 300); };
  h = M.rayon(84, M.hauteur(84, 0) + 1.6, 0, 0, 0, -1, 100);
  check(h && h.quoi === 'mur' && M.batiments[h.i] === tour && Math.abs(h.z + 22) < 1e-9, 'la tour, droit devant au bout de la rue');
  h = vise([58, M.hauteur(58, 0) + 1.6, 0], [84, M.hauteur(84, -26) + 1.6, -26]);
  check(h && h.quoi === 'mur' && M.batiments[h.i].t === 'maison', 'en biais, la rangée cache la tour');
  h = vise([84, tour.sommet + 40, -100], [84, tour.sommet - 0.5, -26]);
  check(h && M.batiments[h.i] === tour && h.quoi === 'toit', 'la tour vue d\'en haut : son toit');
  h = M.rayon(-80, y0, 0, 0.6, 0, 0.8, 100); const lg = Math.hypot(h.nx, h.ny, h.nz);
  check(h && Math.abs(lg - 1) < 1e-9 && h.nx * 0.6 + h.nz * 0.8 < 0, 'normale unitaire, tournée vers le tireur');
  h = M.rayon(-150, 400, 0, 1, -0.05, 0, 400); const y150 = 400 - 0.05 / Math.hypot(1, 0.05) * 50;
  check(M.rayon(-150, M.hauteur(-100, 0) - 5, 0, -1, 0, 0, 400) === null && (!h || h.x >= -100 - 1e-9) && y150 > M.hauteur(-100, 0), 'un rayon venu de hors du carré : rien n\'existe dehors (ni sol, ni mur)');
  // contre la recherche brute
  const rnd = R.mulberry32(5); let ecart = 0, desaccord = 0, frole = 0, n = 0, touches = 0;
  for (let k = 0; k < 3000; k++) {
    const p = M.libre(rnd), y = M.hauteur(p[0], p[1]) + (k % 3 === 0 ? 20 * rnd() : 1.6);
    const a = rnd() * Math.PI * 2, el = (rnd() - 0.6) * 1.2, d = [-Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)];
    const A = M.rayon(p[0], y, p[1], d[0], d[1], d[2], 150), B = rayonRef(M, [p[0], y, p[1]], d, 150); n++;
    if (!A && !B) continue; touches++;
    const tolT = (A && A.quoi === 'sol') || (B && B.quoi === 'sol') ? 0.03 : 1e-6;
    if (A && B && A.quoi === B.quoi && A.i === B.i && Math.abs(A.t - B.t) < tolT) { ecart = Math.max(ecart, Math.abs(A.t - B.t)); continue; }
    // un frôlement du terrain (le rayon passe sous le sol de moins de 2 cm) n'est pas une erreur
    const tb = B ? B.t : 150, ta = A ? A.t : 150; let creux = 0;
    for (let t = Math.min(ta, tb); t <= Math.max(ta, tb); t += 0.005) creux = Math.min(creux, y + d[1] * t - M.hauteur(p[0] + d[0] * t, p[1] + d[2] * t));
    if (creux > -0.02 && ((A && A.quoi === 'sol') || (B && B.quoi === 'sol'))) { frole++; continue; }
    desaccord++; if (desaccord < 4) console.log('    ', JSON.stringify({ o: [p[0], y, p[1]], d, A, B }));
  }
  check(desaccord === 0, `${n} rayons contre la recherche brute (tous les murs, tous les toits, terrain au pas de 2 cm) : ${touches} touchent, ${desaccord} désaccord, ${frole} frôlement(s), écart ≤ ${ecart.toExponential(1)} m`);
}

titre('vue : bâtiments et relief');
{
  const oeil = (x, z) => [x, M.hauteur(x, z) + 1.6, z];
  check(M.vue(...oeil(-80, 0), ...oeil(80, 0)) && M.vue(...oeil(80, 0), ...oeil(-80, 0)), 'd\'un bout à l\'autre de la rue : vu (dans les deux sens)');
  check(!M.vue(...oeil(-80, 0), ...oeil(-80, -30)), 'à travers la rangée : caché');
  const b = M.batiments.find((x) => x.aabb[0] === -90 && x.aabb[1] === -16);
  check(M.vue(-80, b.sommet + 3, 0, -80, b.sommet + 3, -30), 'par-dessus les toits : vu');
  check(!M.vue(...oeil(60, -88), ...oeil(60, -22)), 'derrière la colline : caché par le relief');
  check(M.vue(60, 240, -88, 60, 240, -22), 'au-dessus de la colline : vu');
  check(M.vue(...oeil(0, 0), ...oeil(0, 0)), 'un point se voit lui-même');
}

titre('libre : points au hasard à 1 m des murs');
{
  const rnd = R.mulberry32(3); let ok = true, dans = true;
  for (let k = 0; k < 500; k++) { const p = M.libre(rnd); if (M.bloque(p[0], p[1], 1 - 1e-9)) ok = false; }
  for (let k = 0; k < 300; k++) { const p = M.libre(rnd, [-50, 0], 20); if (M.bloque(p[0], p[1], 1 - 1e-9)) ok = false; if (Math.hypot(p[0] + 50, p[1]) > 20 + 1e-9) dans = false; }
  check(ok, '800 points : jamais à moins d\'1 m d\'un mur, de l\'eau ou d\'une zone interdite');
  check(dans, 'avec un centre et un rayon : dans le cercle');
  const a = M.libre(R.mulberry32(9)), b = M.libre(R.mulberry32(9)); check(a[0] === b[0] && a[1] === b[1], 'rejouable : même graine, même point');
  M.limite = { centre: [0, 0], rayon: 30 }; let lim = true;
  for (let k = 0; k < 200; k++) { const p = M.libre(rnd); if (Math.hypot(p[0], p[1]) > 29) lim = false; }
  M.limite = null; check(lim, 'sans centre, avec une limite : dans la limite (moins 1 m)');
  const p = M.libre(rnd, [50, 37], 0.5); check(Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]), 'zone impossible (0,5 m) : un point quand même, jamais rien');
}

titre('PNAV sur le hameau');
const NAV = PN.creer(M, { pas: 1.5, marge: 0.45 });
{
  check(PN.creer(M, { pas: 1.5, marge: 0.45 }) === NAV, 'une seule grille par monde et par réglage (mise en cache)');
  const segmentsSurs = (ch, r) => ch.every((p, i) => i === 0 || M.passe(ch[i - 1][0], ch[i - 1][1], p[0], p[1], r));
  const ch = NAV.chemin(-60, 0, -60, 85);
  check(ch && ch.length >= 3, `de la rue à l'autre rive : ${ch && ch.length} points`);
  check(ch && ch.some((p, i) => i > 0 && segCroise(ch[i - 1], p, [16.5, 65], [23.5, 65])), 'il passe par le pont');
  check(ch && segmentsSurs(ch, 0.35), 'chaque segment laisse 0,35 m aux murs (monde.passe)');
  check(ch && ch[0][0] === -60 && ch[0][1] === 0 && ch[ch.length - 1][0] === -60 && ch[ch.length - 1][1] === 85, 'commence au départ, finit à l\'arrivée');
  check(NAV.libre(50, 37) && !NAV.accessible(50, 37) && NAV.accessible(0, 0), 'la cour fermée : libre mais hors de la composante principale');
  const c2 = NAV.chemin(0, 0, 50, 37);
  check(c2 === null || (!dansPolyRef([[38, 30], [62, 30], [62, 44], [38, 44]], ...c2[c2.length - 1]) && NAV.accessible(...c2[c2.length - 1])), 'vers la cour fermée : on s\'arrête dehors (ou null), jamais à travers le mur');
  const p = NAV.proche(-80, -10);
  check(NAV.libre(p[0], p[1]) && Math.hypot(p[0] + 80, p[1] + 10) < 7, `proche() depuis l'intérieur d'un bâtiment : la case libre la plus proche (${f2(Math.hypot(p[0] + 80, p[1] + 10))} m)`);
  const p2 = NAV.proche(0, 0); check(p2[0] === 0 && p2[1] === 0, 'proche() d\'un point navigable : lui-même');
  check(NAV.chemin(NaN, 0, 1, 1) === null && Array.isArray(NAV.proche(NaN, 3)), 'NaN : null / un point, sans erreur');
  let accord = true, nPas = 0;
  for (let i = 1; i < NAV.stats.cote - 1; i += 3) for (let j = 1; j < NAV.stats.cote - 1; j += 3) { const x = -100 + (i + 0.5) * 1.5, z = -100 + (j + 0.5) * 1.5; nPas++; if (NAV.libre(x, z) && M.bloque(x, z, 0.45)) accord = false; }
  check(accord, `nav.libre ⇒ monde.bloque(x, z, marge) faux, aux centres des cases (${nPas} cases)`);
  M.limite = { centre: [0, 0], rayon: 40 };
  const c3 = NAV.chemin(-30, 0, 30, 0), c4 = NAV.chemin(-30, 0, 70, 0);
  check(c3 && c3.every(([x, z]) => Math.hypot(x, z) <= 40 - 0.45 + 1e-6) && segmentsSurs(c3, 0.35), 'avec monde.limite : la grille suit, le chemin reste dedans');
  check(c4 === null || Math.hypot(...c4[c4.length - 1]) <= 40, 'une cible hors limite : on s\'arrête au bord (ou null)');
  M.limite = null;
  const c5 = NAV.chemin(-30, 0, 70, 0); check(c5 && Math.abs(c5[c5.length - 1][0] - 70) < 1e-9, 'limite levée : la grille revient');
}

// ─────────────────────── un bourg à voûtes : passages, troncs, murs et mobilier, cas par cas ───────────────────────
// une rangée percée d'une voûte nord-sud, deux maisons mitoyennes traversées par un même passage, une annexe trop basse pour une
// voûte ; une place plantée (trois arbres mesurés, un ancien [x, z, h]), un mur, un muret, du mobilier ; le terrain monte de 4 % vers le sud
function bourgVoute() {
  const L = 160, n = 17, pas = 10, h = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -L / 2 + i * pas, z = -L / 2 + j * pas; h.push(300 + 0.04 * z + 0.02 * x); }
  const batiments = [rect(-30, -24, -6, -8, 9), rect(-6, -24, 6, -8, 10, 'maison', true), rect(6, -24, 30, -8, 9), rect(40, -20, 52, -8, 8), rect(52, -20, 64, -8, 8, 'commerce'), rect(-60, 40, -50, 50, 3, 'annexe')];
  return {
    v: 1, nom: 'Bourg', source: 'essai', taille: L, relief: { pas, n, h }, batiments, rues: [], eau: [], ponts: [], interdit: [], vegetation: [], noms: [], sol: null,
    arbres: [[0, 10, 9, 3, 'platane'], [8, 10, 20, 4, 'tilleul'], [-8, 10, 2, 1, 'fruitier'], [15, 20, 10]],
    murs: [{ l: [[-30, 30], [0, 30], [20, 34]], h: 1.8, e: 0.5, t: 'pierre' }, { l: [[-30, 40], [30, 40]], h: 0.4, e: 0.3, t: 'pierre' }],
    mobilier: [{ x: -20, z: 10, t: 'fontaine' }, { x: 20, z: 10, t: 'monument', yaw: 0 }, { x: 0, z: 18, t: 'poubelle' }, { x: 4, z: 18, t: 'panneau', n: 'Mairie' }, { x: -40, z: 15, t: 'abribus', yaw: 0 }, { x: 30, z: 18, t: 'croix' }],
    passages: [{ l: [[0, -27], [0, -5]], w: 3.2, h: 3.4, b: [1], n: 'Porte du Sud' }, { l: [[37, -14], [67, -14]], w: 2.8, h: 3.2, b: [3, 4], n: 'Passage double' },
      { l: [[-55, 37], [-55, 53]], w: 3, h: 3.4, b: [5], n: 'Trop basse' }, { l: [[-70, -30], [-70, -10]], w: 3, b: [], n: 'Sans bâtiment' }, { l: [[NaN, 0], [1, 1]], w: -2, b: [99] }, null],
    zones: { arene: { centre: [0, 10], rayon: 70 }, apparitions: [], armes: [] },
  };
}
const C3 = bourgVoute(), M3 = PM.creer(C3), N3 = PN.creer(M3, { pas: 1.5, marge: 0.45 }), r3 = 0.35;
const sol3 = (x, z) => M3.hauteur(x, z), oeil3 = (x, z, dy) => [x, sol3(x, z) + (dy == null ? 1.6 : dy), z];
const marcher = (M, a, b, r, pas) => { let q = a.slice(), n = 0; for (; n < 5000; n++) { const dx = b[0] - q[0], dz = b[1] - q[1], d = Math.hypot(dx, dz); if (d < 0.02) break; const s = Math.min(pas || 0.2, d) / d; const q2 = M.deplacer(q[0], q[1], dx * s, dz * s, r || 0.35); if (Math.hypot(q2[0] - q[0], q2[1] - q[1]) < 1e-6) break; q = q2; } return q; };
const longueur = (c) => c.reduce((s, q, i) => i ? s + Math.hypot(q[0] - c[i - 1][0], q[1] - c[i - 1][1]) : 0, 0);
const sousVoutePar = (M, ch, p) => ch.some((q, i) => { if (!i) return false; for (let s = 0; s <= 1; s += 0.02) if (M.sousVoute(ch[i - 1][0] + (q[0] - ch[i - 1][0]) * s, ch[i - 1][1] + (q[1] - ch[i - 1][1]) * s) === p) return true; return false; });
titre(`Bourg à voûtes (160 m) : ${M3.passages.length} passages, ${M3.stats.troncs} troncs, ${M3.stats.murs} mur + ${M3.stats.murets} muret, ${M3.stats.mobilier} objets massifs`);
{
  const [P0, P1] = M3.passages;
  check(M3.passages.length === 2 && P0.n === 'Porte du Sud' && P1.n === 'Passage double', 'passages normalisés : l\'annexe de 3 m est trop basse pour une voûte, le passage sans bâtiment et les entrées abîmées sont écartés');
  check(P0.w === 3.2 && P0.h === 3.4 && P0.b.join() === '1' && Math.abs(P0.long - 22) < 1e-9 && P0.u[0] === 0 && P0.u[1] === 1 && Math.abs(P0.sol[0] - sol3(0, -27)) < 1e-9 && Math.abs(P0.sol[1] - sol3(0, -5)) < 1e-9, 'Porte du Sud : w, h, b, axe, longueur, sol aux deux bouts');
  const b0 = P0.bats[0], q1 = M3.batiments[1].p, surArete = (e, a) => { const A = q1[e.a], B = q1[(e.a + 1) % q1.length]; return Math.abs(Math.hypot(e.x - A[0], e.z - A[1]) - e.s) < 1e-9 && d2Ref(e.x, e.z, A, B) < 1e-12 && Math.abs(e.z - a) < 1e-9 && Math.abs(e.x) < 1e-9; };
  check(b0.i === 1 && surArete(b0.entree, -24) && surArete(b0.sortie, -8), `l'axe entre par la façade nord (z = −24, arête ${b0.entree.a}, ${f2(b0.entree.s)} m) et sort par la façade sud (arête ${b0.sortie.a})`);
  check(b0.coupes.length === 2 && b0.coupes.every((c) => Math.abs(c.s1 - c.s0 - 3.2) < 1e-9 && Math.abs((c.s0 + c.s1) / 2 - 6) < 1e-9), 'les deux arcades à creuser : 3,2 m au milieu de chaque façade (coupes)');
  check(P1.b.join() === '3,4' && P1.bats.length === 2 && Math.abs(P1.bats[0].entree.x - 40) < 1e-9 && Math.abs(P1.bats[0].sortie.x - 52) < 1e-9 && Math.abs(P1.bats[1].entree.x - 52) < 1e-9 && Math.abs(P1.bats[1].sortie.x - 64) < 1e-9 && P1.bats.every((b) => b.coupes.length === 2), 'Passage double : sous deux maisons mitoyennes (le mur mitoyen est percé aussi)');
  check(M3.stats.troncs === 3 && M3.stats.murs === 1 && M3.stats.murets === 1 && M3.stats.mobilier === 4 && M3.stats.passages === 2, 'troncs des seuls arbres mesurés (pas l\'entrée [x, z, h]), mur et muret, mobilier massif (ni poubelle ni panneau)');
}
titre('Passages : à pied');
{
  let q = marcher(M3, [0, -35], [0, 0]);
  check(Math.hypot(q[0], q[1]) < 0.05, `on traverse la Porte du Sud à pied, de z = −35 à z = 0 (arrivé à ${f2(Math.hypot(q[0], q[1]))} m)`);
  q = marcher(M3, [35, -14], [70, -14]);
  check(Math.hypot(q[0] - 70, q[1] + 14) < 0.05, 'et le Passage double, à travers le mur mitoyen');
  q = M3.deplacer(0, -16, 5, 0, r3); check(Math.abs(q[0] - (1.6 - r3)) < 2e-3 && q[1] === -16, `poussé de côté sous la voûte : arrêté au piédroit (x = ${f3(q[0])}, attendu ${f3(1.6 - r3)})`);
  q = M3.deplacer(0, -16, 3, 3, r3); check(Math.abs(q[0] - (1.6 - r3)) < 2e-3 && Math.abs(q[1] + 13) < 0.02, `en biais : glisse le long du piédroit (z = ${f2(q[1])})`);
  q = marcher(M3, [-10, -35], [-10, 0]); check(Math.abs(q[1] - (-24 - r3)) < 2e-3, 'la maison voisine reste pleine : arrêté devant sa façade');
  q = marcher(M3, [3.5, -35], [3.5, 0]); check(q[1] < -24 + 1e-6, 'à côté de l\'arcade (dans le trumeau) : arrêté devant la façade');
  check(!M3.bloque(0, -16, r3) && M3.bloque(3, -16, r3) && !M3.dedans(0, -16) && M3.dedans(4, -16) && M3.dedans(0, -24.5) === false, 'bloque / dedans : libre dans le couloir, plein à côté dans la maison');
  check(M3.sousVoute(0, -16) === 0 && M3.sousVoute(0, -26) === -1 && M3.sousVoute(46, -14) === 1 && M3.sousVoute(3, -16) === -1, 'sousVoute : sous la voûte (pas dans le débord du couloir, pas dans la maison)');
  const rnd = R.mulberry32(31); let dedans = 0, enfonce = 0, p = [0, -16];
  for (let k = 0; k < 4000; k++) { const a = rnd() * Math.PI * 2, lg = 0.05 + 0.6 * rnd(), q2 = M3.deplacer(p[0], p[1], Math.cos(a) * lg, Math.sin(a) * lg, r3); if (dedansRef(M3, C3, q2[0], q2[1])) dedans++; else if (M3.bloque(q2[0], q2[1], r3 - 2e-3)) enfonce++; p = q2; if (k % 400 === 399) p = [0, -16]; }
  check(dedans === 0 && enfonce === 0, '4 000 pas au hasard sous la voûte et autour : jamais dans une maison, jamais enfoncé');
}
titre('Passages : tirs et lignes de vue');
{
  const P0 = M3.passages[0], o = oeil3(0, -35);
  let h = M3.rayon(...o, 0, 0, 1, 30);
  check(h === null, 'un tir dans l\'axe à 1,6 m passe sous la voûte (rien sur 30 m)');
  h = M3.rayon(0, sol3(0, -35) + 6, -35, 0, 0, 1, 30);
  check(h && h.quoi === 'mur' && h.de === 'batiment' && h.i === 1 && Math.abs(h.z + 24) < 1e-9 && h.nz === -1, 'à 6 m (au-dessus de l\'arc) : la façade de la maison, normale vers le tireur');
  h = M3.rayon(0, sol3(0, -35) + 3.3, -35, 0, 0, 1, 30);
  check(h === null, 'à 3,3 m à l\'horizontale : il file sous la clé (le sol monte vers le sud, la voûte avec lui)');
  const dm = [0, 0.15, 1].map((v) => v / Math.hypot(0.15, 1)); h = M3.rayon(0, sol3(0, -24.5) + 3.0, -24.5, ...dm, 30);
  check(h && h.de === 'voute' && h.z > -24 && h.z < -8 && Math.abs(h.y - M3.arche(0, h.x, h.z)) < 1e-6 && h.ny < -0.99, `un tir qui monte entre sous l'arc et touche la clé (z = ${h && f2(h.z)}, ${h && f2(h.y - sol3(h.x, h.z))} m au-dessus du sol)`);
  h = M3.rayon(1.5, sol3(1.5, -35) + 3.0, -35, 0, 0, 1, 30);
  check(h && h.de === 'batiment' && h.i === 1 && Math.abs(h.z + 24) < 1e-9, 'à 3 m, près du piédroit : au-dessus de l\'arc → la façade');
  const m = [0, sol3(0, -16), -16];
  h = M3.rayon(m[0], m[1] + 1.6, m[2], 0, 1, 0, 50);
  check(h && h.de === 'voute' && h.k === 0 && h.i === 1 && Math.abs(h.y - (M3.arche(0, 0, -16))) < 1e-6 && Math.abs(h.y - m[1] - 3.4) < 0.01 && h.ny < -0.999, `vers le haut sous la voûte : la clé, à ${f2(h.y - m[1])} m du sol (de : 'voute', normale vers le bas)`);
  h = M3.rayon(m[0], m[1] + 1.0, m[2], 1, 0, 0, 50);
  check(h && h.quoi === 'mur' && h.de === 'batiment' && h.i === 1 && Math.abs(h.x - 1.6) < 1e-9 && h.nx === -1, 'de côté à 1 m : le piédroit (x = 1,6), normale vers le tireur');
  const s2 = Math.SQRT1_2; h = M3.rayon(m[0], m[1] + 1.6, m[2], s2, s2, 0, 50);
  const naiss = M3.arche(0, 1.6, -16), rr = h && Math.hypot(h.x, h.y - naiss);
  check(h && h.de === 'voute' && Math.abs(rr - 1.6) < 1e-6 && Math.abs(h.nx + h.x / 1.6) < 1e-6 && Math.abs(h.ny + (h.y - naiss) / 1.6) < 1e-6, `à 45° vers le haut et le côté : sur le cercle de l'arc (rayon ${f3(rr)} m), normale vers son centre`);
  check(M3.vue(...oeil3(0, -35), ...oeil3(0, 0)) && M3.vue(...oeil3(0, 0), ...oeil3(0, -35)), 'vue de part et d\'autre de la voûte (dans les deux sens)');
  check(!M3.vue(m[0], m[1] + 1.6, m[2], 0, M3.batiments[1].sommet + 2, -16), 'depuis la voûte, on ne voit pas le ciel (le bâtiment reste plein au-dessus)');
  check(M3.vue(...oeil3(-2, -35), ...oeil3(2, 0)) && !M3.vue(...oeil3(-3, -35), ...oeil3(3, 0)), 'en biais par l\'arcade : vu ; plus en biais, le trumeau cache');
  check(M3.rayon(...oeil3(37, -14), 1, 0, 0, 30) === null && M3.vue(...oeil3(37, -14), ...oeil3(67, -14)), 'le Passage double, d\'un bout à l\'autre : ni le mur mitoyen ni les façades n\'arrêtent le tir');
  // contre la recherche brute, autour des voûtes
  const rnd = R.mulberry32(41); let desaccord = 0, n = 0, voutes = 0;
  for (let k = 0; k < 1500; k++) {
    const P = M3.passages[k % 2], t = -6 + (P.long + 12) * rnd(), e = (rnd() - 0.5) * 2.4 * P.w, x = P.l[0][0] + P.u[0] * t - P.u[1] * e, z = P.l[0][1] + P.u[1] * t + P.u[0] * e;
    if (M3.bloque(x, z, 0.3)) continue;
    const y = sol3(x, z) + 0.3 + 2.8 * rnd(), a = rnd() * Math.PI * 2, el = (rnd() - 0.3) * 1.4, d = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
    const A = M3.rayon(x, y, z, ...d, 40), B = rayonRef(M3, [x, y, z], d, 40, C3); n++; if (A && A.de === 'voute') voutes++;
    if (!A && !B) continue;
    const tol = [A, B].some((q) => q && (q.de === 'voute' || q.quoi === 'sol' || q.de === 'mur')) ? 0.02 : 1e-6;
    if (!memeTouche(A, B, tol)) { desaccord++; if (desaccord < 4) console.log('     ', JSON.stringify({ o: [x, y, z], d, A, B })); }
  }
  check(desaccord === 0 && voutes > 50, `${n} rayons tirés sous et autour des voûtes contre la recherche brute : ${desaccord} désaccord (${voutes} touchent une voûte)`);
}
titre('Passages : la navigation');
{
  const c1 = N3.chemin(0, -35, 0, 0);
  check(c1 && longueur(c1) < 35.5 && c1.every(([x]) => Math.abs(x) < 1.2) && sousVoutePar(M3, c1, 0), `un robot passe par la Porte du Sud (${c1 && f2(longueur(c1))} m, ${c1 && c1.length} points)`);
  const c2 = N3.chemin(35, -14, 70, -14);
  check(c2 && longueur(c2) < 35.5 && sousVoutePar(M3, c2, 1), `et par le Passage double (${c2 && f2(longueur(c2))} m)`);
  const M3b = PM.creer(Object.assign({}, C3, { passages: [] })), N3b = PN.creer(M3b, { pas: 1.5, marge: 0.45 }), c3 = N3b.chemin(0, -35, 0, 0);
  check(c3 && longueur(c3) > 50, `sans les passages, le même trajet fait le tour de la rangée (${c3 && f2(longueur(c3))} m)`);
  const c4 = N3.chemin(-55, 33, -55, 57); check(c4 && longueur(c4) > 26, `l'annexe trop basse n'a pas de passage : on la contourne (${c4 && f2(longueur(c4))} m)`);
}
titre('Troncs, murs et mobilier');
{
  const rt0 = 0.12 + 0.025 * 9, rt1 = 0.6, rt2 = 0.2, D0 = rt0 + r3;
  check(M3.bloque(0, 10 - D0 + 0.01, r3) && !M3.bloque(0, 10 - D0 - 0.01, r3) && M3.bloque(8, 10 - rt1 - r3 + 0.01, r3) && !M3.bloque(8, 10 - rt1 - r3 - 0.01, r3) && M3.bloque(-8, 10 - rt2 - r3 + 0.01, r3) && !M3.bloque(-8, 10 - rt2 - r3 - 0.01, r3), `les troncs bloquent : rayon clamp(0,12 + 0,025·h ; 0,2 ; 0,6) (${f3(rt0)}, ${rt1}, ${rt2} m)`);
  check(!M3.bloque(15, 20, r3) && !M3.bloque(15, 20, 0), 'une vieille entrée [x, z, h] ne bloque rien');
  check(M3.bloque(0, 10, 0) && !M3.bloque(0, 10.4, 0), 'bloque(x, z, 0) : dans le tronc, pas à côté');
  let q = M3.deplacer(0, 6, 0, 4, r3); check(Math.abs(q[1] - (10 - D0)) < 2e-3 && q[0] === 0, `de face contre un tronc : arrêté à r + rayon du tronc (z = ${f3(q[1])})`);
  q = [-0.25, 5]; let xMin = 0; for (let k = 0; k < 120 && q[1] < 15; k++) { q = M3.deplacer(q[0], q[1], 0, 0.1, r3); xMin = Math.min(xMin, q[0]); }
  check(q[1] > 14.9 && xMin < -D0 + 0.01, `légèrement décalé : on glisse autour du tronc et on passe (écarté jusqu'à x = ${f2(xMin)})`);
  let pire = Infinity; q = [-0.05, 5]; for (let k = 0; k < 300; k++) { q = M3.deplacer(q[0], q[1], 0.01 * Math.sin(k), 0.3, r3); pire = Math.min(pire, Math.hypot(q[0], q[1] - 10) - D0); }
  check(pire > -2e-3, `poussé 300 fois contre le tronc : jamais enfoncé (marge la pire ${f3(pire)} m)`);
  let h = M3.rayon(...oeil3(0, 0), 0, 0, 1, 30);
  check(h && h.quoi === 'mur' && h.de === 'arbre' && h.k === 0 && h.i === -1 && Math.abs(h.t - (10 - rt0)) < 1e-9 && Math.abs(h.nz + 1) < 1e-9, `un tir arrêté par le tronc (de : 'arbre', k = 0, à ${f3(h && h.t)} m)`);
  h = M3.rayon(...oeil3(-8, 0, 3), 0, 0, 1, 30); check(h === null || h.de !== 'arbre', 'au-dessus d\'un petit tronc (2,5 m), le tir passe dans le feuillage');
  h = M3.rayon(...oeil3(-8, 0, 2), 0, 0, 1, 30); check(h && h.de === 'arbre' && h.k === 2, '… à 2 m, il touche');
  check(!M3.vue(...oeil3(0, 0), ...oeil3(0, 20)) && M3.vue(...oeil3(2, 0), ...oeil3(2, 20)), 'les troncs cachent ce qui est juste derrière (les robots ne voient pas à travers)');
  // le mur
  q = M3.deplacer(-10, 25, 0, 10, r3); check(Math.abs(q[1] - (30 - 0.25 - r3)) < 2e-3, `contre le mur (e = 0,5 m) : arrêté à e/2 + r (z = ${f3(q[1])})`);
  q = M3.deplacer(-10, 29.3, 5, 3, r3); check(Math.abs(q[0] + 5) < 0.02 && Math.abs(q[1] - (30 - 0.25 - r3)) < 2e-3, 'en biais : glisse le long du mur');
  q = marcher(M3, [-31, 25], [-31, 35]); check(q[1] > 34.9, 'on contourne le bout du mur');
  h = M3.rayon(...oeil3(-10, 25, 1), 0, 0, 1, 20); check(h && h.de === 'mur' && h.k === 0 && h.quoi === 'mur' && Math.abs(h.z - 29.75) < 1e-6, 'un tir à 1 m s\'arrête sur le parement du mur');
  h = M3.rayon(...oeil3(-10, 25, 2.5), 0, 0, 1, 10); check(h === null, 'à 2,5 m, il passe au-dessus (le mur fait 1,8 m)');
  const yTop = sol3(-10, 30) + 1.8, dd = [0, -0.6, 0.8]; h = M3.rayon(-10, yTop + 0.5, 29.5, ...dd, 5);
  check(h && h.quoi === 'toit' && h.de === 'mur' && Math.abs(h.y - yTop) < 1e-3 && h.ny === 1, `un tir plongeant retombe sur le chaperon (y = ${h && f3(h.y - yTop)} m du dessus)`);
  q = marcher(M3, [0, 37], [0, 43]); check(q[1] > 42.9 && !M3.bloque(0, 40, r3), 'un muret de 40 cm se franchit comme une marche');
  h = M3.rayon(...oeil3(0, 36, 0.2), 0, 0, 1, 10); check(h && h.de === 'mur' && h.k === 1, '… mais il arrête un tir rasant');
  h = M3.rayon(...oeil3(0, 36), 0, 0, 1, 10); check(h === null, '… pas un tir à hauteur d\'homme');
  // le mobilier
  check(M3.bloque(-20 + 1.15 + r3 - 0.01, 10, r3) && !M3.bloque(-20 + 1.15 + r3 + 0.01, 10, r3) && M3.bloque(20, 10 + 0.75 + r3 - 0.01, r3) && M3.bloque(30.79, 18, r3) && !M3.bloque(30.81, 18, r3), 'fontaine (1,15 m), monument (0,75 m), croix (0,45 m) : massifs');
  check(!M3.bloque(0, 18, r3) && !M3.bloque(4, 18, r3), 'poubelle et panneau : on passe');
  check(M3.bloque(-40, 15.62, r3) && !M3.bloque(-40, 15.1, r3) && M3.bloque(-38.45, 15.62 - 0.08 - r3 + 0.01, r3), 'l\'abribus : sa paroi du fond bloque, on peut s\'y abriter');
  h = M3.rayon(...oeil3(-20, 5, 0.4), 0, 0, 1, 10); check(h && h.de === 'mobilier' && h.k === 0, 'un tir bas arrêté par le bassin de la fontaine');
  h = M3.rayon(...oeil3(-20, 5, 1.0), 0, 0, 1, 10); check(h === null, '… à 1 m, il passe au-dessus');
  h = M3.rayon(...oeil3(20, 5), 0, 0, 1, 10); check(h && h.de === 'mobilier' && h.k === 1 && Math.abs(h.z - (10 - 0.75)) < 1e-9, 'le monument arrête les tirs');
  { const v = (y, z0) => M3.rayon(20, M3.hauteur(20, z0) + y, z0, 0, 0, 1, 10); // l'obélisque (jusqu'à 4,7 m, r 0,36) et les degrés (r 1,3 sur 0,4 m)
    const a = v(3.5, 5), b = v(5.2, 5), c = v(0.25, 5); // le sol monte de 0,2 m jusqu'au monument
    check(a && a.de === 'mobilier' && a.k === 1 && Math.abs(a.z - (10 - 0.36)) < 1e-9 && b === null && c && c.k === 1 && Math.abs(c.z - (10 - 1.3)) < 1e-9 && M3.bloque(20, 10 + 1.3 + r3 - 0.01, r3) && !M3.bloque(20, 10 + 1.3 + r3 + 0.01, r3),
      'le monument : un tir à 3,5 m bute sur l\'obélisque, à 5,2 m il passe au-dessus ; les degrés (1,3 m) arrêtent un tir rasant et les pieds'); }
  // contre la recherche brute, sur la place
  const rnd = R.mulberry32(43); let desaccord = 0, n = 0, obs = 0;
  for (let k = 0; k < 2500; k++) {
    const x = -45 + 90 * rnd(), z = -4 + 50 * rnd(); if (M3.bloque(x, z, 0.3)) continue;
    const y = sol3(x, z) + 0.1 + 2.5 * rnd(), a = rnd() * Math.PI * 2, el = (rnd() - 0.6) * 1.2, d = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
    const A = M3.rayon(x, y, z, ...d, 40), B = rayonRef(M3, [x, y, z], d, 40, C3); n++; if (A && A.i === -1 && A.de !== 'terrain') obs++;
    if (!A && !B) continue;
    const tol = [A, B].some((q2) => q2 && (q2.de === 'voute' || q2.quoi === 'sol' || q2.de === 'mur' || q2.quoi === 'toit')) ? 0.02 : 1e-6;
    if (!memeTouche(A, B, tol)) { desaccord++; if (desaccord < 4) console.log('     ', JSON.stringify({ o: [x, y, z], d, A, B })); }
  }
  check(desaccord === 0 && obs > 100, `${n} rayons sur la place contre la recherche brute : ${desaccord} désaccord (${obs} sur un tronc, un mur ou un objet)`);
  const rnd2 = R.mulberry32(44); let mauvais = 0; for (let k = 0; k < 300; k++) { const p = M3.libre(rnd2, [0, 15], 25); if (C3.arbres.some((a) => a.length >= 5 && Math.hypot(p[0] - a[0], p[1] - a[1]) < 1 + Math.min(0.6, Math.max(0.2, 0.12 + 0.025 * a[2]))) || d2Ref(p[0], p[1], [-30, 30], [0, 30]) < 1.25 ** 2) mauvais++; }
  check(mauvais === 0, 'monde.libre : jamais à moins d\'1 m d\'un tronc ou d\'un mur');
  const c5 = N3.chemin(-1, 5, -1, 15); check(c5 && c5.every((p, i) => !i || M3.passe(c5[i - 1][0], c5[i - 1][1], p[0], p[1], 0.35)), 'les chemins des robots contournent les troncs');
}
titre('Vieilles cartes (sans passages, murs ni mobilier ; arbres [x, z, h]) : rien ne change');
{
  check(M.stats.aretes === 108 && M.stats.aretesTirs === 0 && M.stats.troncs === 0 && M.passages.length === 0, 'le hameau : les mêmes 108 arêtes, rien de plus');
  const prov = fs.existsSync(path.join(__dirname, '..', 'src-poncin', 'carte-provisoire.js')) ? require('../src-poncin/carte-provisoire.js').creer() : null;
  if (prov) {
    const A = PM.creer(prov), B = PM.creer(Object.assign({}, prov, { passages: [], murs: [], mobilier: [] })), rnd = R.mulberry32(45); let diff = 0;
    for (let k = 0; k < 2000; k++) {
      const p = A.libre(rnd), a = rnd() * 6.3, d = [Math.cos(a), (rnd() - 0.6) * 0.5, Math.sin(a)], qa = A.deplacer(p[0], p[1], d[0] * 3, d[2] * 3, 0.35), qb = B.deplacer(p[0], p[1], d[0] * 3, d[2] * 3, 0.35);
      const ha = A.rayon(p[0], A.hauteur(p[0], p[1]) + 1.6, p[1], ...d, 100), hb = B.rayon(p[0], B.hauteur(p[0], p[1]) + 1.6, p[1], ...d, 100);
      if (qa[0] !== qb[0] || qa[1] !== qb[1] || JSON.stringify(ha) !== JSON.stringify(hb)) diff++;
    }
    check(A.stats.troncs === 0 && A.stats.aretesTirs === 0 && A.passages.length === 0 && diff === 0, `la carte provisoire (${prov.arbres.length} arbres [x, z, h]) : aucun tronc, et des champs vides n'y changent rien (2 000 déplacements et tirs identiques)`);
  }
}

// ─────────────────────────────────── épreuves au hasard, sur chaque carte ───────────────────────────────────
function epreuves(nom, carte, opt) {
  opt = opt || {};
  titre(`${nom} (${carte.taille} m, ${(carte.batiments || []).length} bâtiments)`);
  let t = performance.now(); const monde = PM.creer(carte); const msMonde = performance.now() - t;
  t = performance.now(); const nav = PN.creer(monde, { pas: 1.5, marge: 0.45 }); const msNav = performance.now() - t;
  console.log(`     monde ${f2(msMonde)} ms (${monde.stats.aretes} arêtes, ${monde.stats.ponts} pont(s)) ; nav ${f2(msNav)} ms (grille ${nav.stats.msGrille} ms, repères ${nav.stats.msReperes} ms, ${nav.stats.cote}² cases, ${nav.stats.libres} libres, ${nav.stats.serres} case(s) serrée(s), ${(nav.stats.octets / 1048576).toFixed(1)} Mo, composante principale ${nav.stats.principale})`);
  const rnd = R.mulberry32(opt.graine || 1);
  // 10 000 déplacements enchaînés, petits et grands, contre les murs : jamais dans un polygone, jamais enfoncé
  let dedans = 0, enfonce = 0, horsLim = 0, immobiles = 0, ms = 0, nb = 0, p = monde.libre(rnd), r = 0.35;
  const N = opt.deplacements || 10000;
  for (let k = 0; k < N; k++) {
    if (k % 500 === 0) { p = monde.libre(rnd); r = k % 1000 ? 0.45 : 0.35; }
    if (k === N / 2 && carte.zones && carte.zones.arene) { monde.limite = { centre: carte.zones.arene.centre, rayon: carte.zones.arene.rayon }; p = monde.libre(rnd); }
    const a = rnd() * Math.PI * 2, u = rnd(), lg = u < 0.7 ? 0.3 * rnd() : u < 0.95 ? 0.3 + 1.7 * rnd() : 2 + 6 * rnd();
    const t1 = performance.now(); const q = monde.deplacer(p[0], p[1], Math.cos(a) * lg, Math.sin(a) * lg, r); ms += performance.now() - t1; nb++;
    if (!Number.isFinite(q[0]) || dedansRef(monde, carte, q[0], q[1])) { dedans++; if (dedans < 3) console.log('     dedans :', p, q, a, lg, r); }
    else if (monde.bloque(q[0], q[1], r - 2e-3)) { enfonce++; if (enfonce < 3) console.log('     enfoncé :', p, q, a, lg, r); }
    if (monde.limite && Math.hypot(q[0] - monde.limite.centre[0], q[1] - monde.limite.centre[1]) > monde.limite.rayon - r + 1e-6) horsLim++;
    if (q[0] === p[0] && q[1] === p[1]) immobiles++;
    p = q;
  }
  monde.limite = null;
  check(dedans === 0 && enfonce === 0, `${N} déplacements au hasard (rayons 0,35 et 0,45, pas jusqu'à 8 m) : jamais dans un polygone ni enfoncé (${(100 * immobiles / N).toFixed(1)} % bloqués net)`);
  check(horsLim === 0, 'la moitié sous monde.limite (l\'arène) : jamais au-delà');
  check(ms / nb <= 0.02, `deplacer : ${f3(1000 * ms / nb)} µs en moyenne (≤ 20 µs)`);
  // rayons contre la recherche brute
  let desaccord = 0, frole = 0, msR = 0; const NR = opt.rayons || 600, touchesDe = {};
  for (let k = 0; k < NR; k++) {
    const p0 = monde.libre(rnd), y = monde.hauteur(p0[0], p0[1]) + 1.6, a = rnd() * Math.PI * 2, el = (rnd() - 0.6) * 0.8;
    const d = [-Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)];
    const t1 = performance.now(); const A = monde.rayon(p0[0], y, p0[1], d[0], d[1], d[2], 120); msR += performance.now() - t1;
    const B = rayonRef(monde, [p0[0], y, p0[1]], d, 120, carte);
    if (!A && !B) continue; touchesDe[(A && A.de) || '—'] = (touchesDe[(A && A.de) || '—'] || 0) + 1;
    const tol = [A, B].some((h) => h && (h.quoi === 'sol' || h.de === 'voute' || h.de === 'mur' || (h.de === 'mobilier' && h.quoi === 'toit'))) ? 0.03 : 1e-6;
    if (memeTouche(A, B, tol)) continue;
    const ta = A ? A.t : 120, tb = B ? B.t : 120; let creux = 0;
    for (let s = Math.min(ta, tb); s <= Math.max(ta, tb); s += 0.005) creux = Math.min(creux, y + d[1] * s - monde.hauteur(p0[0] + d[0] * s, p0[1] + d[2] * s));
    if (creux > -0.02) frole++; else { desaccord++; if (desaccord < 3) console.log('     rayon :', JSON.stringify({ o: [p0[0], y, p0[1]], d, A, B })); }
  }
  check(desaccord === 0, `${NR} rayons contre la recherche brute : ${desaccord} désaccord, ${frole} frôlement(s) ; ${f3(1000 * msR / NR)} µs par rayon ; touchés ${JSON.stringify(touchesDe)}`);
  // points libres
  let mauvais = 0; for (let k = 0; k < 300; k++) { const q = monde.libre(rnd); if (monde.bloque(q[0], q[1], 1 - 1e-9) || !nav.accessible(q[0], q[1])) mauvais++; }
  check(mauvais === 0, '300 points libres : à 1 m des murs et dans la composante principale');
  // chemins
  const paires = []; for (let k = 0; k < (opt.chemins || 500); k++) paires.push([monde.libre(rnd), monde.libre(rnd)]);
  for (const [a, b] of paires.slice(0, 50)) nav.chemin(a[0], a[1], b[0], b[1]); // le compilateur à chaud
  // chaque chemin est chronométré trois fois : on garde le meilleur (un passage du ramasse-miettes, déclenché par n'importe quel code,
  // ne compte pas contre l'algorithme) et on donne aussi le pire brut
  const durees = [], brutes = []; let nuls = 0, traverse = 0, serre = 0, ouvertes = 0, maxOuv = 0;
  for (const [a, b] of paires) {
    let ch = null, mieux = Infinity;
    for (let e = 0; e < 3; e++) { const t1 = performance.now(); ch = nav.chemin(a[0], a[1], b[0], b[1]); const d = performance.now() - t1; mieux = Math.min(mieux, d); brutes.push(d); }
    durees.push(mieux);
    ouvertes += nav.stats.ouvertes; maxOuv = Math.max(maxOuv, nav.stats.ouvertes);
    if (!ch) { nuls++; continue; }
    for (let i = 1; i < ch.length; i++) { if (!monde.passe(ch[i - 1][0], ch[i - 1][1], ch[i][0], ch[i][1], 0)) traverse++; else if (!monde.passe(ch[i - 1][0], ch[i - 1][1], ch[i][0], ch[i][1], 0.3)) serre++; }
  }
  // des bots de 0,35 m suivent les 100 premiers chemins avec deplacer (pas de 0,2 m vers le point suivant) : ils arrivent tous
  let arrives = 0, suivis = 0, frottes = 0;
  for (const [a, b] of paires.slice(0, 100)) {
    const ch = nav.chemin(a[0], a[1], b[0], b[1]); if (!ch) continue; suivis++;
    let p = [a[0], a[1]], i = 1, n = 0;
    while (i < ch.length && n < 20000) {
      const dx = ch[i][0] - p[0], dz = ch[i][1] - p[1], d = Math.hypot(dx, dz);
      if (d < 0.25) { i++; continue; }
      const s = Math.min(0.2, d) / d, q = monde.deplacer(p[0], p[1], dx * s, dz * s, 0.35);
      if (Math.hypot(q[0] - p[0] - dx * s, q[1] - p[1] - dz * s) > 1e-6) frottes++;
      p = q; n++;
    }
    if (i >= ch.length) arrives++;
  }
  check(arrives === suivis, `${suivis} chemins suivis par un bot (deplacer, rayon 0,35, pas de 0,2 m) : ${arrives} arrivés ; ${frottes} pas frottés contre un mur`);
  const moy = durees.reduce((s, v) => s + v, 0) / durees.length;
  check(nuls === 0, `${paires.length} chemins entre points libres : ${nuls} sans réponse`);
  check(traverse === 0 && serre === 0, `aucun segment ne traverse un mur (${traverse}) ni ne le frôle à moins de 0,3 m (${serre})`);
  const max = Math.max(...durees);
  check(carte.taille > 650 || max <= 4, `chemin : moyenne ${f3(moy)} ms, p90 ${f3(quantile(durees, 0.9))}, p99 ${f3(quantile(durees, 0.99))}, max ${f3(max)} ms${carte.taille > 650 ? '' : ' (≤ 4 ms)'} (pire mesure brute ${f3(Math.max(...brutes))} ms) ; ${Math.round(ouvertes / paires.length)} cases fermées en moyenne, ${maxOuv} au pire`);
  if (opt.astar) { // JPS contre A* case par case : mêmes réponses, longueurs voisines
    const ref = PN.creer(monde, { pas: 1.5, marge: 0.45, methode: 'astar' }); let diff = 0, pire = 1;
    const lg = (c) => c.reduce((s, q, i) => i ? s + Math.hypot(q[0] - c[i - 1][0], q[1] - c[i - 1][1]) : 0, 0);
    for (const [a, b] of paires.slice(0, 200)) { const A = nav.chemin(a[0], a[1], b[0], b[1]), B = ref.chemin(a[0], a[1], b[0], b[1]); if (!A !== !B) diff++; else if (A) pire = Math.max(pire, lg(A) / lg(B)); }
    check(diff === 0 && pire < 1.12, `JPS contre A* case par case (200 chemins) : mêmes réponses, au pire ${((pire - 1) * 100).toFixed(1)} % plus long`);
  }
  if (carte.zones && carte.zones.arene) { // dans l'arène
    monde.limite = { centre: carte.zones.arene.centre, rayon: carte.zones.arene.rayon };
    nav.libre(0, 0); const msLim = nav.stats.msLimite; // la grille suit la limite (une fois)
    const ds = []; let hors = 0;
    for (let k = 0; k < 200; k++) {
      const a = monde.libre(rnd), b = monde.libre(rnd); let ch = null, mieux = Infinity;
      for (let e = 0; e < 3; e++) { const t1 = performance.now(); ch = nav.chemin(a[0], a[1], b[0], b[1]); mieux = Math.min(mieux, performance.now() - t1); }
      ds.push(mieux); if (!ch || ch.some(([x, z]) => Math.hypot(x - monde.limite.centre[0], z - monde.limite.centre[1]) > monde.limite.rayon)) hors++;
    }
    monde.limite = null;
    check(hors === 0, `arène (rayon ${carte.zones.arene.rayon} m ; la grille suit la limite en ${msLim} ms) : 200 chemins, tous dedans ; moyenne ${f3(ds.reduce((s, v) => s + v, 0) / ds.length)} ms, max ${f3(Math.max(...ds))} ms`);
    // une partie d'arène qui crée sa navigation une fois la limite posée : la grille ne couvre que l'arène
    const m2 = PM.creer(carte); m2.limite = { centre: carte.zones.arene.centre, rayon: carte.zones.arene.rayon };
    const t2 = performance.now(), n2 = PN.creer(m2, { pas: 1.5, marge: 0.45 }), ms2 = performance.now() - t2; let ok2 = true;
    for (let k = 0; k < 100; k++) { const a = m2.libre(rnd), b = m2.libre(rnd), ch = n2.chemin(a[0], a[1], b[0], b[1]); if (!ch || ch.some(([x, z]) => Math.hypot(x - m2.limite.centre[0], z - m2.limite.centre[1]) > m2.limite.rayon)) ok2 = false; }
    check(ok2 && n2.stats.cote < nav.stats.cote, `navigation créée sous la limite : ${n2.stats.cote}² cases (${(n2.stats.octets / 1048576).toFixed(1)} Mo) construites en ${f2(ms2)} ms, 100 chemins justes`);
    m2.limite = null; const ch3 = n2.chemin(-carte.taille / 2 + 20, -carte.taille / 2 + 20, carte.taille / 2 - 20, carte.taille / 2 - 20);
    check(n2.stats.constructions === 2 && n2.stats.cote >= nav.stats.cote - 1, `limite levée : la grille se reconstruit sur toute la carte (${n2.stats.cote}², ${n2.stats.msGrille + n2.stats.msReperes} ms)${ch3 ? '' : ' (coins non reliés)'}`);
  }
  return { monde, nav };
}

epreuves('Hameau d\'essai', C1, { graine: 2, astar: true, chemins: 300 });
epreuves('Village généré', village600(7), { graine: 3, astar: true });
const prov = path.join(__dirname, '..', 'src-poncin', 'carte-provisoire.js');
if (fs.existsSync(prov)) {
  let carte = null; try { carte = require(prov).creer(); } catch (e) { console.log('     (carte provisoire illisible : ' + e.message + ')'); }
  if (carte) epreuves('Carte provisoire (PCARTEPROV)', carte, { graine: 4 });
} else console.log('\n── (pas de carte provisoire : épreuve sautée)');
const vraie = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
if (fs.existsSync(vraie)) {
  const CV = JSON.parse(fs.readFileSync(vraie, 'utf8')), { monde: MV, nav: NV } = epreuves('Vraie carte de Poncin (IGN + OSM)', CV, { graine: 5 });
  titre('Vraie carte : les deux voûtes, les troncs');
  const attendus = { 'Porte Bouvent': [65, -28], 'Impasse du Bonheur': [62, 36] };
  check(MV.passages.length === 2 && MV.passages.every((P) => attendus[P.n] && Math.hypot((P.l[0][0] + P.l[1][0]) / 2 - attendus[P.n][0], (P.l[0][1] + P.l[1][1]) / 2 - attendus[P.n][1]) < 6 && P.w >= 2.4 && P.w <= 3.6 && P.h === 3.4 && P.bats.every((b) => b.entree && b.sortie && b.coupes.length >= 2)),
    `2 passages : ${MV.passages.map((P) => `${P.n} [${[(P.l[0][0] + P.l[1][0]) / 2, (P.l[0][1] + P.l[1][1]) / 2].map(f2)}] w ${P.w} h ${P.h} sous ${P.b}`).join(' ; ')}`);
  for (const [p, P] of MV.passages.entries()) {
    // un point libre devant chaque débouché (d'abord dans l'axe, sinon le plus proche d'où l'on voit le bout du couloir)
    const debouche = (sg) => { const a = sg < 0 ? P.l[0] : P.l[1]; let best = null, bd = Infinity;
      for (let d = 1.5; d < 6; d += 0.5) for (let k = 0; k < 24; k++) { const ang = Math.atan2(P.u[1] * sg, P.u[0] * sg) + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * Math.PI / 12, x = a[0] + Math.cos(ang) * d, z = a[1] + Math.sin(ang) * d, c = d + Math.abs(ang - Math.atan2(P.u[1] * sg, P.u[0] * sg));
        if (c < bd && !MV.bloque(x, z, 0.6) && NV.accessible(x, z) && MV.passe(x, z, a[0], a[1], 0.4)) { bd = c; best = [x, z]; } }
      return best; };
    const A = debouche(-1), B = debouche(1); if (!check(A && B, `${P.n} : un point libre et accessible devant chaque débouché ([${A && A.map(f2)}], [${B && B.map(f2)}])`)) continue;
    const aller = (a, b, via) => { let q = a; for (const c of via.concat([b])) q = marcher(MV, q, c); return q; };
    const q = aller(A, B, [P.l[0], P.l[1]]), q2 = aller(B, A, [P.l[1], P.l[0]]);
    check(Math.hypot(q[0] - B[0], q[1] - B[1]) < 0.05 && Math.hypot(q2[0] - A[0], q2[1] - A[1]) < 0.05, `${P.n} : on la traverse à pied, dans les deux sens`);
    const E0 = [P.l[0][0] - P.u[0] * 0.4, P.l[0][1] - P.u[1] * 0.4], E1 = [P.l[1][0] + P.u[0] * 0.4, P.l[1][1] + P.u[1] * 0.4]; // dans l'axe, juste devant les arcades
    const oA = [E0[0], MV.hauteur(E0[0], E0[1]) + 1.6, E0[1]], oB = [E1[0], MV.hauteur(E1[0], E1[1]) + 1.6, E1[1]], dAB = oB.map((v, i) => v - oA[i]), lAB = Math.hypot(...dAB);
    const h = MV.rayon(...oA, ...dAB.map((v) => v / lAB), lAB);
    check(!MV.bloque(E0[0], E0[1], 0.35) && !MV.bloque(E1[0], E1[1], 0.35) && h === null && MV.vue(...oA, ...oB) && MV.vue(...oB, ...oA), `${P.n} : un tir et une ligne de vue passent sous la voûte d'un bout à l'autre (${f2(lAB)} m)`);
    const m = [(P.l[0][0] + P.l[1][0]) / 2, (P.l[0][1] + P.l[1][1]) / 2], hm = MV.rayon(m[0], MV.hauteur(m[0], m[1]) + 1.6, m[1], 0, 1, 0, 30);
    check(MV.sousVoute(m[0], m[1]) === p && hm && hm.de === 'voute' && P.b.includes(hm.i) && Math.abs(hm.y - MV.hauteur(m[0], m[1]) - P.h) < 0.05, `${P.n} : un tir vers le haut touche la voûte (${hm && f2(hm.y - MV.hauteur(m[0], m[1]))} m), pas le ciel à travers le bâtiment`);
    const hh = MV.rayon(E0[0], MV.hauteur(E0[0], E0[1]) + P.h + 1.5, E0[1], ...[dAB[0], 0, dAB[2]].map((v) => v / Math.hypot(dAB[0], dAB[2])), lAB);
    check(hh && hh.de === 'batiment' && P.b.includes(hh.i) && hh.quoi === 'mur', `${P.n} : au-dessus de l'arc (${f2(P.h + 1.5)} m), le tir s'arrête sur la façade du bâtiment ${hh && hh.i}`);
    const ch = NV.chemin(A[0], A[1], B[0], B[1]);
    check(ch && sousVoutePar(MV, ch, p) && longueur(ch) < 1.3 * Math.hypot(B[0] - A[0], B[1] - A[1]), `${P.n} : un robot y trouve son chemin (${ch && f2(longueur(ch))} m, ${ch && ch.length} points, sous la voûte)`);
  }
  const Z = CV.zones, A = Z.arene, J = R.JOUEUR, dansArene = CV.arbres.filter((a) => Math.hypot(a[0] - A.centre[0], a[1] - A.centre[1]) <= A.rayon);
  check(MV.stats.troncs === CV.arbres.length && dansArene.length === 72, `${MV.stats.troncs} troncs (tous les arbres mesurés), dont ${dansArene.length} dans l'arène ; ${MV.stats.murs} murs, ${MV.stats.mobilier} objets massifs`);
  const MV0 = PM.creer(Object.assign({}, CV, { arbres: CV.arbres.map((a) => a.slice(0, 3)), murs: [], mobilier: [] })), NV0 = PN.creer(MV0, { pas: 1.5, marge: 0.45 }); // la même carte sans troncs, murs ni mobilier
  check(Z.apparitions.every((q) => !MV.bloque(q[0], q[1], 1) && NV.accessible(q[0], q[1]) === NV0.accessible(q[0], q[1])) && Z.armes.every((o) => !MV.bloque(o.x, o.z, 0.8) && NV.accessible(o.x, o.z) === NV0.accessible(o.x, o.z)),
    `apparitions (${Z.apparitions.length}, à 1 m de tout) et objets (${Z.armes.length}, à 0,8 m) toujours libres avec les troncs et les murs, aussi accessibles qu'avant`);
  const rnd = R.mulberry32(51); let pres = 0, coll = 0; // dans l'arène, autour des troncs : des pas au hasard ne traversent jamais un tronc
  for (const a of dansArene) { const rt = Math.min(0.6, Math.max(0.2, 0.12 + 0.025 * a[2])); let p = [a[0] + rt + 0.5, a[1]]; if (MV.bloque(p[0], p[1], J.rayon)) continue; pres++; for (let k = 0; k < 60; k++) { const ang = rnd() * 6.3; p = MV.deplacer(p[0], p[1], Math.cos(ang) * 0.4, Math.sin(ang) * 0.4, J.rayon); if (Math.hypot(p[0] - a[0], p[1] - a[1]) < rt + J.rayon - 2e-3) coll++; } }
  check(coll === 0 && pres > 40, `${pres} troncs de l'arène bousculés 60 fois chacun : jamais traversés`);
  const bancs = MV.bancs.map(([x, z, yaw]) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw), o = [x + fx * 3, z + fz * 3], q = marcher(MV, o, [x - fx * 3, z - fz * 3]), h = MV.rayon(o[0], MV.hauteur(o[0], o[1]) + 0.6, o[1], -fx, 0, -fz, 6); return { bloque: MV.bloque(x, z, 0.35), arret: Math.hypot(q[0] - o[0], q[1] - o[1]), h }; });
  check(MV.bancs.length === 4 && MV.stats.bancs === 4 && MV.bancs.every(([x, z]) => Math.hypot(x - A.centre[0], z - A.centre[1]) < 45) && bancs.every((b) => b.bloque && b.arret < 3 && b.h && b.h.de === 'mobilier' && b.h.t < 3),
    `${MV.bancs.length} bancs sur la place (choix de style), pleins : on bute dessus (arrêt après ${bancs.map((b) => f2(b.arret)).join(', ')} m sur 3) et un tir à 0,6 m s'y arrête (${bancs.map((b) => b.h ? b.h.de + ' à ' + f2(b.h.t) : 'rien').join(', ')} m)`);
  check(M3.bancs.length === 0 && M3.stats.bancs === 0, 'pas de place nommée près de l\'arène (cartes d\'essai) : aucun banc');
  { // le sapin de l'arène : son feuillage dense cache qui est derrière (ni vue ni tir), sans gêner les pas ; personne n'y a l'œil
    const S = CV.arbres.find((a) => a[4] === 'conifere' && Math.hypot(a[0] - A.centre[0], a[1] - A.centre[1]) <= A.rayon), ys = (x, z) => MV.hauteur(x, z);
    const rob = [S[0] + 8, ys(S[0] + 8, S[1]) + 1.6, S[1]], cache = [S[0] - 1.5, ys(S[0] - 1.5, S[1] + 0.7) + 1.2, S[1] + 0.7], h = MV.rayon(...rob, ...[cache[0] - rob[0], cache[1] - rob[1], cache[2] - rob[2]].map((v, i, d) => v / Math.hypot(...d)), 20);
    const rf = PM.rFeuillage(S[2], S[3], S[4]), rt = PM.rTronc(S[2]);
    check(S && !MV.vue(...rob, ...cache) && !MV.vue(...cache, ...rob) && h && h.de === 'arbre' && MV.vue(rob[0], rob[1], rob[2], S[0] - 1.5, cache[1], S[1] + 3) && !MV.bloque(cache[0], cache[2], J.rayon) && MV.stats.feuillages === CV.arbres.filter((a) => PM.rFeuillage(a[2], a[3], a[4]) > 0).length && rf > rt && rf < rt + J.rayon,
      `le sapin de l'arène [${S && S.slice(0, 4)}] : ni vue ni tir à travers son feuillage (cylindre de ${f2(rf)} m), à côté on voit ; ${MV.stats.feuillages} conifères ainsi garnis`);
  }
} else console.log('\n── (pas de poncin/carte/poncin.json : épreuve sautée)');

titre('Cartes abîmées : jamais d\'exception');
{
  let ok = true;
  const abimes = { taille: 100, batiments: [{ p: [[0, 0], [10, 0], [10, 10], [0, 10]], h: 8 }], passages: [{ l: [[5, -2], [5, 12]], w: 'x', h: -1, b: [0, 7, 'a'] }, { l: null }, 3, { l: [[1, 1], [1, 1]] }],
    arbres: [[1, 1, 5, 2, 'feuillu'], [NaN, 0, 3, 1, 'x'], 'a', null, [2, 2, -4, 1, 'saule']], murs: [{ l: [[0, 0], [NaN, 3], [1, 1]] }, { l: 5 }, null, { l: [[3, 3], [3, 3]], h: 'x', e: -1 }], mobilier: [{ t: 'fontaine', x: NaN }, null, { t: 'abribus', x: 1, z: 1, yaw: 'a' }, { t: 'inconnu', x: 2, z: 2 }] };
  for (const c of [null, {}, { taille: 100 }, { taille: 100, relief: { pas: 10, n: 3, h: [1, 2] } }, { taille: 100, batiments: [{ p: null }, { p: [[0, 0], [NaN, 1], [1, 1], [1, 0]] }], eau: [{ p: 3 }], ponts: [{ l: [[0, 0]] }, null], interdit: [{}] }, abimes, { taille: 100, passages: {}, arbres: 3, murs: 'a', mobilier: {} }]) {
    try { const m = PM.creer(c), n = PN.creer(m, { reperes: 2 }); m.deplacer(0, 0, 1, 1, 0.35); m.rayon(0, 1, 0, 1, 0, 0, 10); m.vue(0, 1, 0, 5, 1, 5); m.libre(R.mulberry32(1)); n.chemin(-10, -10, 10, 10); n.proche(0, 0); m.bloque(0, 0, 0.35); m.hauteur(1, 1); } catch (e) { ok = false; console.log('     ', e.stack); }
  }
  check(ok, 'carte nulle, vide, relief tronqué, polygones abîmés, ponts sans bout, passages, arbres, murs et mobilier abîmés');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
