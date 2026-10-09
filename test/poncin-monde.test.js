#!/usr/bin/env node
// Opération Poncin — le monde physique (PMONDE) et la navigation (PNAV) : relief, bâtiments, collisions, rayons, lignes de vue, points
// libres, chemins. Cartes synthétiques construites ici (une rue, une place, une ruelle d'1 m, une cour fermée, un coin aigu, une rivière
// et son pont, une zone interdite, du relief ; un village de 600 m pour les temps), puis la vraie carte et la carte provisoire si elles
// sont là. Sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PN = require('../src-poncin/nav.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const f2 = (v) => (Math.round(v * 100) / 100).toString(), f3 = (v) => v.toFixed(3);
const quantile = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const rect = (x0, z0, x1, z1, h, t, sens) => ({ p: sens ? [[x0, z0], [x0, z1], [x1, z1], [x1, z0]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h, t: t || 'maison' });

// ─── géométrie de référence, écrite à part (pas celle du module) ───
function dansPolyRef(q, x, z) { let d = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, zi] = q[i], [xj, zj] = q[j]; if ((zi > z) !== (zj > z) && x < xi + (xj - xi) * (z - zi) / (zj - zi)) d = !d; } return d; }
const dansCouloirRef = (C, x, z) => { const dx = x - C.mx, dz = z - C.mz; return Math.abs(dx * C.ux + dz * C.uz) <= C.dl && Math.abs(dx * C.vx + dz * C.vz) <= C.dw; };
function dedansRef(monde, carte, x, z) { // dans un bâtiment, une zone interdite, l'eau hors des ponts, ou hors du carré
  const L = monde.L; if (!(Math.abs(x) <= L / 2 && Math.abs(z) <= L / 2)) return true;
  if (monde.batiments.some((b) => dansPolyRef(b.p, x, z))) return true;
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
// le premier obstacle, en essayant TOUS les murs et TOUS les toits, et le terrain par pas de 2 cm
function rayonRef(monde, o, d, max) {
  let best = max, res = null; const L = monde.L;
  monde.batiments.forEach((b, bi) => {
    const q = b.p;
    for (let k = 0; k < q.length; k++) {
      const [ax, az] = q[k], [bx, bz] = q[(k + 1) % q.length], ex = bx - ax, ez = bz - az, den = d[0] * ez - d[2] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = ax - o[0], wz = az - o[2], t = (wx * ez - wz * ex) / den, u = (wx * d[2] - wz * d[0]) / den, y = o[1] + d[1] * t;
      if (t >= 0 && t < best && u >= 0 && u <= 1 && y >= b.base && y <= b.sommet) { best = t; res = { t, quoi: 'mur', i: bi }; }
    }
    if (d[1] !== 0) { const t = (b.sommet - o[1]) / d[1]; if (t >= 0 && t < best && dansPolyRef(q, o[0] + d[0] * t, o[2] + d[2] * t)) { best = t; res = { t, quoi: 'toit', i: bi }; } }
  });
  let tSort = best; for (const k of [0, 2]) { if (d[k] > 0) tSort = Math.min(tSort, (L / 2 - o[k]) / d[k]); else if (d[k] < 0) tSort = Math.min(tSort, (-L / 2 - o[k]) / d[k]); }
  const f = (t) => o[1] + d[1] * t - monde.hauteur(o[0] + d[0] * t, o[2] + d[2] * t);
  if (f(0) < 0) return { t: 0, quoi: 'sol', i: -1 };
  for (let t = 0; t < tSort; t += 0.02) {
    const t2 = Math.min(tSort, t + 0.02);
    if (f(t2) < 0) { let lo = t, hi = t2; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (f(m) < 0) hi = m; else lo = m; } if (hi <= best) return { t: hi, quoi: 'sol', i: -1 }; break; }
  }
  return res;
}
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
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.abs(M.hauteur(-100 + i * pas, -100 + j * pas) - h[j * n + i]) > 1e-9) ok = false;
  check(ok, 'aux nœuds de la grille : exactement h[j·n + i]');
  const rnd = R.mulberry32(11); let e = 0;
  for (let k = 0; k < 20000; k++) { const x = -100 + 200 * rnd(), z = -100 + 200 * rnd(); e = Math.max(e, Math.abs(M.hauteur(x, z) - hauteurRef(C1, x, z))); }
  check(e < 1e-9, `dans les triangles [(i,j),(i,j+1),(i+1,j)] et [(i,j+1),(i+1,j+1),(i+1,j)] : barycentrique exact (écart ${e.toExponential(1)})`);
  let saut = 0; // continuité de part et d'autre des diagonales et des bords de case
  for (let k = 0; k < 5000; k++) { const i = Math.floor(rnd() * (n - 1)), j = Math.floor(rnd() * (n - 1)), s = rnd(), x = -100 + (i + s) * pas, z = -100 + (j + 1 - s) * pas; saut = Math.max(saut, Math.abs(M.hauteur(x + 1e-7, z + 1e-7) - M.hauteur(x - 1e-7, z - 1e-7))); }
  check(saut < 1e-4, 'continu à travers les diagonales (i+1, j)–(i, j+1)');
  check([M.hauteur(-500, 0), M.hauteur(0, 900), M.hauteur(NaN, 0)].every(Number.isFinite), 'hors du carré ou NaN : une hauteur finie (bord prolongé)');
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
  let desaccord = 0, frole = 0, msR = 0; const NR = opt.rayons || 600;
  for (let k = 0; k < NR; k++) {
    const p0 = monde.libre(rnd), y = monde.hauteur(p0[0], p0[1]) + 1.6, a = rnd() * Math.PI * 2, el = (rnd() - 0.6) * 0.8;
    const d = [-Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)];
    const t1 = performance.now(); const A = monde.rayon(p0[0], y, p0[1], d[0], d[1], d[2], 120); msR += performance.now() - t1;
    const B = rayonRef(monde, [p0[0], y, p0[1]], d, 120);
    if (!A && !B) continue;
    const tol = (A && A.quoi === 'sol') || (B && B.quoi === 'sol') ? 0.03 : 1e-6;
    if (A && B && A.quoi === B.quoi && A.i === B.i && Math.abs(A.t - B.t) < tol) continue;
    const ta = A ? A.t : 120, tb = B ? B.t : 120; let creux = 0;
    for (let s = Math.min(ta, tb); s <= Math.max(ta, tb); s += 0.005) creux = Math.min(creux, y + d[1] * s - monde.hauteur(p0[0] + d[0] * s, p0[1] + d[2] * s));
    if (creux > -0.02) frole++; else { desaccord++; if (desaccord < 3) console.log('     rayon :', JSON.stringify({ o: [p0[0], y, p0[1]], d, A, B })); }
  }
  check(desaccord === 0, `${NR} rayons contre la recherche brute : ${desaccord} désaccord, ${frole} frôlement(s) ; ${f3(1000 * msR / NR)} µs par rayon`);
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
if (fs.existsSync(vraie)) epreuves('Vraie carte de Poncin (IGN + OSM)', JSON.parse(fs.readFileSync(vraie, 'utf8')), { graine: 5 });
else console.log('\n── (pas de poncin/carte/poncin.json : épreuve sautée)');

titre('Cartes abîmées : jamais d\'exception');
{
  let ok = true;
  for (const c of [null, {}, { taille: 100 }, { taille: 100, relief: { pas: 10, n: 3, h: [1, 2] } }, { taille: 100, batiments: [{ p: null }, { p: [[0, 0], [NaN, 1], [1, 1], [1, 0]] }], eau: [{ p: 3 }], ponts: [{ l: [[0, 0]] }, null], interdit: [{}] }]) {
    try { const m = PM.creer(c), n = PN.creer(m, { reperes: 2 }); m.deplacer(0, 0, 1, 1, 0.35); m.rayon(0, 1, 0, 1, 0, 0, 10); m.vue(0, 1, 0, 5, 1, 5); m.libre(R.mulberry32(1)); n.chemin(-10, -10, 10, 10); n.proche(0, 0); m.bloque(0, 0, 0.35); m.hauteur(1, 1); } catch (e) { ok = false; console.log('     ', e.stack); }
  }
  check(ok, 'carte nulle, vide, relief tronqué, polygones abîmés, ponts sans bout');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
