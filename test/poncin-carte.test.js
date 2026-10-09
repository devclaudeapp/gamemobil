#!/usr/bin/env node
// Opération Poncin : les cartes au format v1 (src-poncin/ARCHITECTURE.md). Une carte quelconque est validée (schéma, bornes, polygones,
// apparitions et objets libres — aussi des troncs et des murs d'une carte authentique — et accessibles, arène assez couverte, passages
// voûtés s'il y en a), puis la carte provisoire (PCARTEPROV : contenu, déterminisme de la graine) et, si elle existe, la vraie carte
// poncin/carte/poncin.json (avec ses deux voûtes : Porte Bouvent et Impasse du Bonheur). Pour une vraie carte, les critères de qualité (pensés pour la carte
// dessinée) sont seulement signalés (« note ») ; les règles du contrat, elles, comptent toujours.
// node test/poncin-carte.test.js → « ok / FAIL », code de sortie 1 en cas d'échec. Importé (require), il expose valider(carte, { strict })
// et rasterArene(carte, marge), pour passer d'autres graines ou d'autres cartes au crible.
'use strict';
const fs = require('fs'), path = require('path');
let fails = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; return ok; };
const note = (m) => console.log('  note ' + m);
const exemples = (t) => (t.length ? ` — ${t.slice(0, 3).join(' ; ')}${t.length > 3 ? ` (+${t.length - 3})` : ''}` : '');

// ─── géométrie, écrite à part de celle du générateur ───
function aire(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function dedans(p, x, z) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function dSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + t * dx - px, az + t * dz - pz); }
const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function secoupent(a, b, c, d) { const e = 1e-9, d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d); return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e)); }
function dSegSeg(a, b, c, d) { return secoupent(a, b, c, d) ? 0 : Math.min(dSeg(a[0], a[1], c[0], c[1], d[0], d[1]), dSeg(b[0], b[1], c[0], c[1], d[0], d[1]), dSeg(c[0], c[1], a[0], a[1], b[0], b[1]), dSeg(d[0], d[1], a[0], a[1], b[0], b[1])); }
function dBord(p, x, z) { let m = Infinity; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; m = Math.min(m, dSeg(x, z, a[0], a[1], b[0], b[1])); } return m; }
function autoIntersection(p, D) { // 'croise' si deux arêtes se coupent ou se touchent (ou repartent en arrière), 'bord' si le seul défaut est sur le bord du carré (découpe), sinon ''
  const n = p.length, surBord = (a, b) => (Math.abs(a[0]) >= D - 1e-6 && Math.abs(b[0]) >= D - 1e-6 && a[0] === b[0]) || (Math.abs(a[1]) >= D - 1e-6 && Math.abs(b[1]) >= D - 1e-6 && a[1] === b[1]);
  let bord = false;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n];
    if (Math.abs(cr(a, b, c)) < 1e-9 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) { if (surBord(a, b) && surBord(b, c)) bord = true; else return 'croise'; }
    for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const u = p[j], v = p[(j + 1) % n]; if (dSegSeg(a, b, u, v) < 1e-6) { if (!secoupent(a, b, u, v) && (surBord(a, b) || surBord(u, v))) bord = true; else return 'croise'; } }
  }
  return bord ? 'bord' : '';
}
function recouvre(A, B, tol) { // les intérieurs de deux polygones se recouvrent (au-delà de tol mètres)
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (secoupent(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) {
    // une arête qui en coupe une autre : on mesure de combien un sommet s'enfonce
    for (const q of A) if (dedans(B, q[0], q[1]) && dBord(B, q[0], q[1]) > tol) return true;
    for (const q of B) if (dedans(A, q[0], q[1]) && dBord(A, q[0], q[1]) > tol) return true;
    const m = [(A[i][0] + A[(i + 1) % A.length][0]) / 2, (A[i][1] + A[(i + 1) % A.length][1]) / 2]; if (dedans(B, m[0], m[1]) && dBord(B, m[0], m[1]) > tol) return true;
  }
  for (const q of A) if (dedans(B, q[0], q[1]) && dBord(B, q[0], q[1]) > tol) return true;
  for (const q of B) if (dedans(A, q[0], q[1]) && dBord(A, q[0], q[1]) > tol) return true;
  const a = interieur(A, tol), b = interieur(B, tol); // deux emprises identiques : aucune arête ne se coupe, aucun sommet n'est dedans
  return (!!a && dedans(B, a[0], a[1]) && dBord(B, a[0], a[1]) > tol) || (!!b && dedans(A, b[0], b[1]) && dBord(A, b[0], b[1]) > tol);
}
function interieur(p, tol) { // un point bien à l'intérieur du polygone (le centre, ou le milieu d'une diagonale)
  let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } const c = [x / p.length, z / p.length];
  if (dedans(p, c[0], c[1]) && dBord(p, c[0], c[1]) > tol) return c;
  for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) { const m = [(p[i][0] + p[j][0]) / 2, (p[i][1] + p[j][1]) / 2]; if (dedans(p, m[0], m[1]) && dBord(p, m[0], m[1]) > tol) return m; }
  return null;
}
const bb = (p) => { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]; };
const estPoint = (q) => Array.isArray(q) && q.length === 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]);
const fini = Number.isFinite;

// ─── un raster de l'arène (0,5 m) : bloqué = bâtiment, zone interdite, eau hors pont ; marge = trop près d'un bord pour un joueur ───
function rasterArene(c, marge) {
  const A = c.zones.arene, R = A.rayon, [cx, cz] = A.centre, pas = 0.5, n = Math.ceil(2 * R / pas) + 1;
  const X = (i) => cx - R + i * pas, Z = (j) => cz - R + j * pas;
  const bloque = new Uint8Array(n * n), proche = new Uint8Array(n * n), dehors = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if ((X(i) - cx) ** 2 + (Z(j) - cz) ** 2 > R * R) dehors[j * n + i] = 1;
  const surPont = (x, z) => c.ponts.some((p) => dSeg(x, z, p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2);
  const remplir = (p, eau) => { // remplissage par lignes
    const b = bb(p), j0 = Math.max(0, Math.floor((b[1] - (cz - R)) / pas)), j1 = Math.min(n - 1, Math.ceil((b[3] - (cz - R)) / pas));
    for (let j = j0; j <= j1; j++) { const z = Z(j), xs = []; for (let k = 0, l = p.length - 1; k < p.length; l = k++) { const [xa, za] = p[k], [xb, zb] = p[l]; if ((za > z) !== (zb > z)) xs.push(xa + (z - za) * (xb - xa) / (zb - za)); } xs.sort((a, b2) => a - b2); for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil((xs[k] - (cx - R)) / pas)); i <= Math.min(n - 1, Math.floor((xs[k + 1] - (cx - R)) / pas)); i++) if (!eau || !surPont(X(i), z)) bloque[j * n + i] = 1; }
  };
  const marquerBords = (p, eau) => { for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - marge - (cx - R)) / pas)), i1 = Math.min(n - 1, Math.ceil((Math.max(a[0], b[0]) + marge - (cx - R)) / pas)), j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - marge - (cz - R)) / pas)), j1 = Math.min(n - 1, Math.ceil((Math.max(a[1], b[1]) + marge - (cz - R)) / pas)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (dSeg(X(i), Z(j), a[0], a[1], b[0], b[1]) < marge && !(eau && surPont(X(i), Z(j)))) proche[j * n + i] = 1; } };
  const proches = (p) => { const b = bb(p); return b[2] > cx - R - 2 && b[0] < cx + R + 2 && b[3] > cz - R - 2 && b[1] < cz + R + 2; };
  for (const b of c.batiments) if (proches(b.p)) { remplir(b.p); marquerBords(b.p); }
  for (const z of c.interdit) if (proches(z.p)) { remplir(z.p); marquerBords(z.p); }
  for (const e of c.eau) if (proches(e.p)) { remplir(e.p, true); marquerBords(e.p, true); }
  const idx = (x, z) => { const i = Math.round((x - (cx - R)) / pas), j = Math.round((z - (cz - R)) / pas); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  // accessibles : parcours en largeur (8 voisins, sans couper les coins) depuis la cellule libre la plus proche du centre
  const libre = (k) => k >= 0 && !bloque[k] && !proche[k] && !dehors[k], vu = new Uint8Array(n * n);
  let dep = -1, best = Infinity; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i, d = (X(i) - cx) ** 2 + (Z(j) - cz) ** 2; if (libre(k) && d < best) { best = d; dep = k; } }
  const file = dep >= 0 ? [dep] : []; if (dep >= 0) vu[dep] = 1;
  while (file.length) { const k = file.pop(), i = k % n, j = (k - i) / n; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const a = i + di, b2 = j + dj; if (a < 0 || b2 < 0 || a >= n || b2 >= n) continue; const v = b2 * n + a; if (vu[v] || !libre(v)) continue; if (di && dj && !(libre(j * n + a) && libre(b2 * n + i))) continue; vu[v] = 1; file.push(v); } }
  return { n, pas, X, Z, bloque, proche, dehors, vu, idx, dep, cx, cz, R };
}
const accessible = (r, x, z) => { for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) { const k = r.idx(x + dx, z + dz); if (k >= 0 && r.vu[k]) return true; } return false; };

// ─── la validation d'une carte ───
const TYPES_BAT = ['maison', 'eglise', 'chateau', 'mairie', 'tour', 'annexe', 'commerce'], TYPES_RUE = ['route', 'rue', 'chemin'], TYPES_EAU = ['riviere', 'ruisseau'], TYPES_VEG = ['bois', 'vigne', 'pre', 'jardin'], ARMES = ['pompe', 'precision', 'soin', 'armure'];
function valider(c, o) {
  const strict = !!o.strict, qualite = (ok, m) => (strict ? check(ok, m) : ok ? check(true, m) : note('(qualité, non bloquant) ' + m));
  // schéma
  check(c && c.v === 1 && typeof c.nom === 'string' && ['ign-osm', 'provisoire'].includes(c.source) && typeof c.attribution === 'string' && c.attribution.length > 0, `en-tête v1 (v, nom, source « ${c && c.source} », attribution)`);
  check(c.origine && fini(c.origine.lat) && fini(c.origine.lon) && Math.abs(c.origine.lat) <= 90 && Math.abs(c.origine.lon) <= 180, 'origine lat/lon');
  const L = c.taille, R = c.relief;
  if (!check(fini(L) && L > 0 && R && R.pas > 0 && R.n === L / R.pas + 1 && Array.isArray(R.h) && R.h.length === R.n * R.n && R.h.every(fini), `relief ${R && R.n}×${R && R.n}, pas ${R && R.pas} m, couvre le carré de ${L} m`)) return;
  const hmin = Math.min(...R.h), hmax = Math.max(...R.h); check(hmax - hmin < 400, `relief plausible (${hmin.toFixed(1)} → ${hmax.toFixed(1)} m)`);
  const champs = ['batiments', 'rues', 'eau', 'ponts', 'vegetation', 'arbres', 'interdit', 'noms'];
  if (!check(champs.every((k) => Array.isArray(c[k])) && c.zones && typeof c.zones === 'object', 'tableaux et zones présents')) return;
  check(JSON.stringify(JSON.parse(JSON.stringify(c))) === JSON.stringify(c), 'sérialisable en JSON sans perte');
  const malB = c.batiments.filter((b) => !(Array.isArray(b.p) && b.p.length >= 3 && b.p.every(estPoint) && fini(b.h) && b.h >= 2 && b.h <= 80 && TYPES_BAT.includes(b.t) && (b.n === undefined || typeof b.n === 'string')));
  check(!malB.length, `bâtiments bien formés (p, h entre 2 et 80 m, t connu, n facultatif) : ${c.batiments.length}${exemples(malB.map((b) => JSON.stringify(b).slice(0, 60)))}`);
  const malR = c.rues.filter((r) => !(Array.isArray(r.l) && r.l.length >= 2 && r.l.every(estPoint) && fini(r.w) && r.w > 0 && r.w <= 40 && TYPES_RUE.includes(r.t) && (r.n === undefined || typeof r.n === 'string')));
  check(!malR.length, `rues bien formées (l, w, t, n) : ${c.rues.length}${exemples(malR.map((r) => JSON.stringify(r).slice(0, 60)))}`);
  check(c.eau.every((e) => Array.isArray(e.p) && e.p.length >= 3 && e.p.every(estPoint) && TYPES_EAU.includes(e.t)), `eau bien formée : ${c.eau.length}`);
  check(c.ponts.every((p) => Array.isArray(p.l) && p.l.length === 2 && p.l.every(estPoint) && fini(p.w) && p.w > 0), `ponts bien formés : ${c.ponts.length}`);
  check(c.vegetation.every((v) => Array.isArray(v.p) && v.p.length >= 3 && v.p.every(estPoint) && TYPES_VEG.includes(v.t)), `végétation bien formée : ${c.vegetation.length}`);
  const ESPECES = ['feuillu', 'conifere', 'peuplier', 'platane', 'tilleul', 'fruitier', 'saule'];
  check(c.arbres.every((a) => Array.isArray(a) && (a.length === 3 || a.length === 5) && a.slice(0, 3).every(fini) && a[2] > 0 && a[2] <= 45 && (a.length === 3 || (fini(a[3]) && a[3] > 0 && a[3] <= 20 && ESPECES.includes(a[4])))), `arbres [x, z, h] ou [x, z, h, r, espèce] : ${c.arbres.length}`);
  check(c.interdit.every((z) => Array.isArray(z.p) && z.p.length >= 3 && z.p.every(estPoint) && typeof z.n === 'string'), `zones interdites bien formées : ${c.interdit.length}`);
  check(c.noms.every((n) => typeof n.n === 'string' && n.n.length > 0 && fini(n.x) && fini(n.z)), `noms bien formés : ${c.noms.length}`);
  check(c.sol === null || (c.sol && typeof c.sol.image === 'string' && typeof c.sol.petite === 'string'), 'sol : null ou { image, petite }');
  if (c.sol && o.dossier) check(fs.existsSync(path.join(o.dossier, c.sol.image)) && fs.existsSync(path.join(o.dossier, c.sol.petite)), `images du sol présentes (${c.sol.image}, ${c.sol.petite})`);
  const Z = c.zones, A = Z.arene;
  if (!check(A && estPoint(A.centre) && fini(A.rayon) && A.rayon > 0 && (A.n === undefined || typeof A.n === 'string') && Array.isArray(Z.apparitions) && Z.apparitions.every(estPoint) && Array.isArray(Z.armes) && Z.armes.every((a) => fini(a.x) && fini(a.z) && ARMES.includes(a.arme)) && Array.isArray(Z.extraction) && Z.extraction.every(estPoint) && estPoint(Z.base), 'zones : arène, apparitions, armes, extraction, base')) return;
  // bornes
  const D = L / 2 + 0.01, dans = (q) => Math.abs(q[0]) <= D && Math.abs(q[1]) <= D, hors = [];
  for (const k of ['batiments', 'eau', 'vegetation', 'interdit']) c[k].forEach((e, i) => { if (!e.p.every(dans)) hors.push(`${k}[${i}]`); });
  c.rues.forEach((r, i) => { if (!r.l.every(dans)) hors.push(`rues[${i}]`); }); c.ponts.forEach((p, i) => { if (!p.l.every(dans)) hors.push(`ponts[${i}]`); });
  c.arbres.forEach((a, i) => { if (!dans(a)) hors.push(`arbres[${i}]`); }); c.noms.forEach((n, i) => { if (!dans([n.x, n.z])) hors.push(`noms[${i}]`); });
  Z.apparitions.concat(Z.extraction, [Z.base], Z.armes.map((a) => [a.x, a.z])).forEach((q, i) => { if (!dans(q)) hors.push(`zones #${i}`); });
  check(!hors.length, `tout est dans le carré de ${L} m${exemples(hors)}`);
  check(Math.abs(A.centre[0]) + A.rayon <= L / 2 && Math.abs(A.centre[1]) + A.rayon <= L / 2, `l'arène (rayon ${A.rayon} m) tient dans le carré`);
  // polygones
  const polys = [];
  for (const k of ['batiments', 'eau', 'vegetation', 'interdit']) c[k].forEach((e, i) => polys.push({ k, i, p: e.p }));
  const repete = polys.filter(({ p }) => p.some((q, i) => { const s = p[(i + 1) % p.length]; return q[0] === s[0] && q[1] === s[1]; }));
  check(!repete.length, `polygones sans point répété (ni à la fin, ni à la suite)${exemples(repete.map((x) => `${x.k}[${x.i}]`))}`);
  const defaut = polys.map((x) => Object.assign({ d: autoIntersection(x.p, L / 2) }, x)), tordus = defaut.filter((x) => x.d === 'croise'), plies = defaut.filter((x) => x.d === 'bord');
  check(!tordus.length, `polygones sans auto-intersection (${polys.length})${exemples(tordus.map((x) => `${x.k}[${x.i}]`))}`);
  if (strict) check(!plies.length, 'polygones sans arêtes repliées sur le bord du carré');
  else if (plies.length) note(`${plies.length} polygone(s) coupé(s) par le bord du carré avec des arêtes repliées le long du bord (sans effet en jeu, à nettoyer à la découpe)${exemples(plies.map((x) => `${x.k}[${x.i}]`))}`);
  const petits = polys.filter(({ p }) => Math.abs(aire(p)) < 2);
  check(!petits.length, `polygones non dégénérés (aire ≥ 2 m²)${exemples(petits.map((x) => `${x.k}[${x.i}] ${Math.abs(aire(x.p)).toFixed(1)} m²`))}`);
  const sous6 = polys.filter(({ p }) => Math.abs(aire(p)) < 6);
  qualite(!sous6.length, `polygones d'au moins 6 m² (${sous6.length} plus petits)`);
  // les bâtiments : hors de l'eau, hors des rues, pas les uns dans les autres, rien dans la zone interdite sauf le château
  const dansEau = (x, z) => c.eau.some((e) => dedans(e.p, x, z));
  const mouilles = c.batiments.filter((b) => b.p.some((q) => dansEau(q[0], q[1])) || c.eau.some((e) => b.p.some((q, i) => { const s = b.p[(i + 1) % b.p.length]; return e.p.some((u, j) => secoupent(q, s, u, e.p[(j + 1) % e.p.length])); })));
  qualite(!mouilles.length, `aucun bâtiment dans l'eau (${mouilles.length})`);
  const surRue = [];
  for (const r of c.rues) if (r.t !== 'chemin') for (const b of c.batiments) { const B = bb(b.p), m = r.w / 2; if (r.l.every((q) => q[0] < B[0] - m || q[0] > B[2] + m || q[1] < B[1] - m || q[1] > B[3] + m) && bb(r.l)[0] > B[2] + m) continue; let d = Infinity; for (const q of r.l) if (dedans(b.p, q[0], q[1])) d = 0; for (let i = 0; d > 0 && i + 1 < r.l.length; i++) for (let k = 0; k < b.p.length; k++) d = Math.min(d, dSegSeg(r.l[i], r.l[i + 1], b.p[k], b.p[(k + 1) % b.p.length])); if (d < m - 0.05) surRue.push(`${r.n || r.t} / ${b.t} à ${(m - d).toFixed(1)} m`); }
  qualite(!surRue.length, `aucun bâtiment sur une route ou une rue (${surRue.length})${exemples(surRue)}`);
  const grille = new Map(), cle = (i, j) => i * 10007 + j, chev = [];
  c.batiments.forEach((b, k) => { const B = bb(b.p); for (let i = Math.floor(B[0] / 20); i <= Math.floor(B[2] / 20); i++) for (let j = Math.floor(B[1] / 20); j <= Math.floor(B[3] / 20); j++) { const g = grille.get(cle(i, j)) || []; g.push(k); grille.set(cle(i, j), g); } });
  const vus = new Set();
  for (const g of grille.values()) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) { const k = g[a] * 100000 + g[b]; if (vus.has(k)) continue; vus.add(k); const A1 = c.batiments[g[a]].p, B1 = c.batiments[g[b]].p, ba = bb(A1), bbb = bb(B1); if (ba[0] > bbb[2] || bbb[0] > ba[2] || ba[1] > bbb[3] || bbb[1] > ba[3]) continue; if (recouvre(A1, B1, 0.1)) chev.push(`${g[a]}/${g[b]}`); }
  qualite(!chev.length, `bâtiments sans recouvrement (${chev.length} paires)${exemples(chev)}`);
  const eauxChev = []; for (let i = 0; i < c.eau.length; i++) for (let j = i + 1; j < c.eau.length; j++) if (recouvre(c.eau[i].p, c.eau[j].p, 0.1)) eauxChev.push(`${i}/${j}`);
  qualite(!eauxChev.length, `les eaux se touchent sans se recouvrir (pas de double transparence)${exemples(eauxChev)}`);
  const vegEau = c.vegetation.filter((v) => c.eau.some((e) => recouvre(v.p, e.p, 1))).map((v) => v.t);
  qualite(!vegEau.length, `la végétation ne recouvre pas l'eau (${vegEau.length})${exemples(vegEau)}`);
  const intrus = c.batiments.filter((b) => !['chateau', 'tour'].includes(b.t) && c.interdit.some((z) => b.p.some((q) => dedans(z.p, q[0], q[1]))));
  qualite(!intrus.length, `rien dans la zone interdite sauf le château et sa tour (${intrus.length})`);
  // les zones de jeu : libres, dans l'arène, accessibles depuis le centre
  const r = rasterArene(c, 0.45), dc = (q) => Math.hypot(q[0] - A.centre[0], q[1] - A.centre[1]);
  check(r.dep >= 0 && Math.hypot(r.X(r.dep % r.n) - r.cx, r.Z((r.dep - (r.dep % r.n)) / r.n) - r.cz) < 15, 'le centre de l\'arène est un lieu libre (une place)');
  const obstacles = c.batiments.map((b) => b.p).concat(c.interdit.map((z) => z.p));
  const surPont = (x, z) => c.ponts.some((p) => dSeg(x, z, p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2);
  // le dégagement d'un point : aux bâtiments, zones interdites, à l'eau hors des ponts, et (cartes authentiques) aux troncs des arbres mesurés et aux murs
  const troncs = c.arbres.filter((a) => a.length >= 5).map((a) => [a[0], a[1], Math.min(0.6, Math.max(0.2, 0.12 + 0.025 * a[2]))]), murs = (c.murs || []).filter((m) => !(m.h <= 0.45));
  const degage = (x, z) => {
    let m = Infinity; for (const p of obstacles) { if (dedans(p, x, z)) return -1; m = Math.min(m, dBord(p, x, z)); }
    for (const e of c.eau) { if (surPont(x, z)) continue; if (dedans(e.p, x, z)) return -1; m = Math.min(m, dBord(e.p, x, z)); }
    for (const [tx, tz, r] of troncs) if (Math.abs(tx - x) < m + 1 && Math.abs(tz - z) < m + 1) m = Math.min(m, Math.hypot(tx - x, tz - z) - r);
    for (const w of murs) for (let i = 0; i + 1 < w.l.length; i++) m = Math.min(m, dSeg(x, z, w.l[i][0], w.l[i][1], w.l[i + 1][0], w.l[i + 1][1]) - (w.e || 0.45) / 2);
    return m;
  };
  const apM = strict ? 3 : 1, nAp = strict ? 16 : 12, ecAp = strict ? 15 : 4, sp = Z.apparitions;
  check(sp.length >= nAp, `au moins ${nAp} apparitions (${sp.length})`);
  const spMal = sp.filter((q) => !(degage(q[0], q[1]) >= apM && dc(q) <= A.rayon - 1));
  check(!spMal.length, `apparitions libres, à ≥ ${apM} m des murs, de l'eau${troncs.length ? `, des ${troncs.length} troncs et des murs de clôture` : ''}, dans l'arène${exemples(spMal.map((q) => `[${q}] à ${degage(q[0], q[1]).toFixed(1)} m`))}`);
  let ecart = Infinity; for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) ecart = Math.min(ecart, Math.hypot(sp[i][0] - sp[j][0], sp[i][1] - sp[j][1]));
  check(ecart >= ecAp, `apparitions espacées d'au moins ${ecAp} m (${ecart.toFixed(1)} m)`);
  const spLoin = sp.filter((q) => !accessible(r, q[0], q[1]));
  check(!spLoin.length, `apparitions accessibles à pied depuis le centre${exemples(spLoin.map((q) => `[${q}]`))}`);
  const ob = Z.armes, obM = strict ? 1.5 : 0.8;
  if (strict) { check(ob.length >= 6 && ob.length <= 8, `6 à 8 objets à ramasser (${ob.length})`); check(ARMES.every((a) => ob.some((x) => x.arme === a)), 'objets : pompe, long-tir, soin et armure'); }
  else check(ob.length >= 1, `des objets à ramasser (${ob.length})`);
  const obMal = ob.filter((a) => !(degage(a.x, a.z) >= obM && dc([a.x, a.z]) <= A.rayon - 1 && accessible(r, a.x, a.z)));
  check(!obMal.length, `objets libres (≥ ${obM} m des murs${troncs.length ? ' et des troncs' : ''}), dans l'arène, accessibles${exemples(obMal.map((a) => `${a.arme} [${a.x}, ${a.z}]`))}`);
  // les passages voûtés (facultatifs) : un couloir droit sous des bâtiments de la carte, qui débouche à l'air libre
  if (c.passages !== undefined) {
    const P = Array.isArray(c.passages) ? c.passages : [], malP = [];
    P.forEach((p, i) => {
      const ok = Array.isArray(p.l) && p.l.length === 2 && p.l.every(estPoint) && p.l.every(dans) && fini(p.w) && p.w >= 1.5 && p.w <= 6 && fini(p.h) && p.h >= 2 && Array.isArray(p.b) && p.b.length > 0 && p.b.every((k) => Number.isInteger(k) && c.batiments[k]) && (p.n === undefined || typeof p.n === 'string');
      if (!ok) { malP.push(`passages[${i}] mal formé`); return; }
      const [a, b] = p.l, L0 = Math.hypot(b[0] - a[0], b[1] - a[1]), dansB = (k) => { for (let s = 0; s <= L0; s += 0.1) { const t = s / L0; if (dedans(c.batiments[k].p, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true; } return false; };
      if (!p.b.every(dansB)) malP.push(`passages[${i}] : l'axe ne passe pas sous tous ses bâtiments`);
      if ([a, b].some((q) => c.batiments.some((bt) => dedans(bt.p, q[0], q[1])))) malP.push(`passages[${i}] : un bout dans un bâtiment (pas de débouché)`);
      if (p.b.some((k) => p.h > 0.6 * c.batiments[k].h + 0.05)) malP.push(`passages[${i}] : h > 0,6 × la hauteur du bâtiment`);
    });
    check(!malP.length, `passages voûtés bien formés (${P.length} : ${P.map((p) => p.n || '?').join(', ') || 'aucun'}) : axe sous leurs bâtiments, débouchés à l'air libre, h ≤ 0,6 × leur hauteur${exemples(malP)}`);
  }
  let ecO = Infinity; for (let i = 0; i < ob.length; i++) for (let j = i + 1; j < ob.length; j++) ecO = Math.min(ecO, Math.hypot(ob[i].x - ob[j].x, ob[i].z - ob[j].z));
  qualite(ecO >= 20, `objets bien répartis (au moins 20 m entre deux : ${ecO.toFixed(1)} m)`);
  const exMal = Z.extraction.concat([Z.base]).filter((q) => !(degage(q[0], q[1]) >= 0.5));
  check(!exMal.length, `extraction et base sur des points libres${exemples(exMal.map((q) => `[${q}]`))}`);
  if (strict) check(Z.extraction.length >= 2 && Z.extraction.length <= 3, `2 ou 3 points d'extraction (${Z.extraction.length})`);
  // l'arène : assez de place, des couverts, des lignes de tir variées
  let nDisque = 0, nAcc = 0, nBat = 0; for (let k = 0; k < r.n * r.n; k++) { if (r.dehors[k]) continue; nDisque++; if (r.vu[k]) nAcc++; if (r.bloque[k]) nBat++; }
  check(nAcc / nDisque >= 0.3, `l'arène est assez praticable (${(100 * nAcc / nDisque).toFixed(0)} % accessible)`);
  const pleins = nBat / nDisque; qualite(pleins >= 0.12 && pleins <= 0.55, `bâti dans l'arène entre 12 et 55 % (${(100 * pleins).toFixed(0)} %)`);
  const DIRS = []; for (let k = 0; k < 16; k++) DIRS.push([Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]);
  const rayons = []; let couverts = 0, ech = 0, ouverts = 0, serres = 0;
  const surMur = (x, z) => { const q = r.idx(x, z); return q >= 0 && r.bloque[q]; }; // le rayon s'est arrêté sur un mur (et non sur la limite de l'arène)
  for (let j = 0; j < r.n; j += 8) for (let i = 0; i < r.n; i += 8) { // un point accessible tous les 4 m, 16 directions
    const k = j * r.n + i; if (!r.vu[k]) continue; ech++; const x = r.X(i), z = r.Z(j); let mur = Infinity, loin = 0, pres = 0;
    for (const [dx, dz] of DIRS) { let t = 0.5; for (; t < 120; t += 0.5) { const q = r.idx(x + dx * t, z + dz * t); if (q < 0 || r.dehors[q] || r.bloque[q]) break; } rayons.push(t); if (surMur(x + dx * t, z + dz * t)) mur = Math.min(mur, t); if (t >= 40) loin++; if (t <= 12) pres++; }
    if (mur <= 8) couverts++; if (loin >= 4) ouverts++; if (pres >= 12) serres++;
  }
  rayons.sort((a, b) => a - b);
  const med = rayons[rayons.length >> 1], longs = rayons.filter((t) => t >= 60).length / rayons.length, courts = rayons.filter((t) => t <= 15).length / rayons.length;
  qualite(couverts / ech >= 0.6, `des couverts partout : ${(100 * couverts / ech).toFixed(0)} % des points ont un mur à moins de 8 m (≥ 60 %)`);
  qualite(med >= 8 && med <= 45, `lignes de tir : médiane ${med.toFixed(0)} m (entre 8 et 45 m)`);
  qualite(longs >= 0.025 && courts >= 0.3, `lignes de tir variées : ${(100 * longs).toFixed(1)} % de lignes ≥ 60 m (≥ 2,5 %), ${(100 * courts).toFixed(0)} % ≤ 15 m (≥ 30 %)`);
  qualite(ouverts / ech >= 0.1 && serres / ech >= 0.1, `des endroits dégagés (${(100 * ouverts / ech).toFixed(0)} % des points voient à 40 m dans 4 directions sur 16) et des coins serrés (${(100 * serres / ech).toFixed(0)} % bouchés à 12 m dans 12 directions sur 16), 10 % de chaque au moins`);
}

// ─── la carte provisoire, puis la vraie carte si elle est là ───
function dansEauC(c, q) { return c.eau.some((e) => dedans(e.p, q[0], q[1])); }
function principal() {
  console.log('── carte provisoire (PCARTEPROV) ──');
  const PROV = require('../src-poncin/carte-provisoire.js');
  const aleatoire = Math.random; let hasard = 0; Math.random = () => { hasard++; return aleatoire(); };
  const t0 = process.hrtime.bigint(), c1 = PROV.creer(), ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const c1b = PROV.creer(1), c2 = PROV.creer(2), c7 = PROV.creer(7);
  Math.random = aleatoire;
  check(hasard === 0, 'aucun appel à Math.random()');
  check(JSON.stringify(c1) === JSON.stringify(c1b), 'même graine, même carte (creer() = creer(1))');
  check(JSON.stringify(c1) !== JSON.stringify(c2) && JSON.stringify(c2) !== JSON.stringify(c7), 'une autre graine donne une autre carte');
  check(ms < 1000, `construite en ${ms.toFixed(0)} ms (< 1 s)`);
  { // chargée comme dans la page (gabarit UMD, globales PREGLES puis PCARTEPROV), elle donne la même carte ; sans regles.js aussi
    const vm = require('vm'), lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'src-poncin', f), 'utf8'), page = {}, nue = {};
    page.self = page; vm.createContext(page); vm.runInContext(lire('regles.js'), page); vm.runInContext(lire('carte-provisoire.js'), page);
    nue.self = nue; vm.createContext(nue); vm.runInContext(lire('carte-provisoire.js'), nue);
    check(!!page.PCARTEPROV && JSON.stringify(page.PCARTEPROV.creer()) === JSON.stringify(c1) && JSON.stringify(nue.PCARTEPROV.creer()) === JSON.stringify(c1), 'globale PCARTEPROV dans la page : même carte (avec ou sans PREGLES)');
  }
  check(['abc', NaN, -5, 1e12, Infinity].every((g) => { try { return PROV.creer(g).batiments.length > 0; } catch (e) { return false; } }), 'aucune graine ne la fait planter');
  check(JSON.stringify(c1).length < 200000, `légère (${(JSON.stringify(c1).length / 1024).toFixed(0)} Ko en JSON)`);
  {
    const c = c1, t = (k) => c.batiments.filter((b) => b.t === k), cB = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
    check(c.source === 'provisoire' && c.taille === 600 && c.relief.pas === 10 && c.relief.n === 61, 'source provisoire, carré de 600 m, relief 61 × 61 au pas de 10 m');
    check(c.batiments.length >= 250 && c.batiments.length <= 450, `250 à 450 bâtiments (${c.batiments.length})`);
    check(t('maison').every((b) => b.h >= 5 && b.h <= 12), 'maisons de 5 à 12 m');
    check(['eglise', 'mairie', 'chateau', 'commerce', 'annexe'].every((k) => t(k).length >= 1) && t('tour').length >= 2, 'église, mairie, château, tours, commerces, annexes');
    check(c.batiments.filter((b) => b.p.length !== 4 || Math.abs(Math.abs(aire(b.p)) - Math.hypot(b.p[1][0] - b.p[0][0], b.p[1][1] - b.p[0][1]) * Math.hypot(b.p[2][0] - b.p[1][0], b.p[2][1] - b.p[1][1])) > 1).length >= 60, 'des emprises qui ne sont pas des rectangles');
    const mitoyens = c.batiments.filter((b, i) => i < 200 && c.batiments.some((o, j) => j !== i && b.p.some((q) => o.p.some((u) => u[0] === q[0] && u[1] === q[1])))).length;
    check(mitoyens >= 60, `des rangées mitoyennes dans le bourg (${mitoyens} maisons partagent un mur parmi les 200 premières)`);
    const eg = t('eglise')[0], clocher = t('tour').find((b) => Math.min(...b.p.map((q) => dBord(eg.p, q[0], q[1]))) < 1.5);
    check(!!clocher && clocher.h >= 20 && clocher.h > eg.h && eg.h >= 10, `l'église (${eg.h} m) et son clocher accolé (${clocher && clocher.h} m)`);
    const ch = t('chateau')[0], zi = c.interdit[0];
    check(!!zi && /Château/.test(zi.n) && ch.p.every((q) => dedans(zi.p, q[0], q[1])) && ch.h >= 12, 'le château (haut) est dans sa zone interdite');
    check(t('tour').some((b) => b.p.every((q) => dedans(zi.p, q[0], q[1]))), 'une tour au château');
    check(c.vegetation.some((v) => v.t === 'jardin' && dedans(zi.p, ...cB(v.p))), 'des jardins dans le domaine du château');
    check(c.rues.some((r) => r.t !== 'chemin' && r.l.some((q) => dBord(zi.p, q[0], q[1]) < 20 && !dedans(zi.p, q[0], q[1]))), 'le château se voit d\'une rue qui longe son domaine');
    const noms = c.noms.map((n) => n.n);
    check(['Place Bichat', 'Église Saint-Martin', 'Château de Poncin', "L'Ain", 'Le Veyron'].every((n) => noms.includes(n)), 'les noms : place Bichat, église, château, l\'Ain, le Veyron');
    const mairie = cB(t('mairie')[0].p), egC = cB(eg.p), chC = cB(ch.p);
    check(Math.hypot(...mairie) < 40 && Math.hypot(...egC) < 110 && chC[0] > 150 && chC[1] < 20, `mairie sur la place, église dans le bourg, château à l'est (${chC.map(Math.round)})`);
    // l'eau : l'Ain large à l'ouest, le Veyron plus étroit au sud ; les routes ne la franchissent que sur des ponts
    const largeur = (x0, z0, dx, dz) => { let k = 0; for (let s = -300; s <= 300; s += 0.25) if (c.eau.some((e) => dedans(e.p, x0 + dx * s, z0 + dz * s))) k++; return k * 0.25; };
    const lAin = largeur(-150, 0, 1, 0) /* la ligne z = 0 */, lVey = largeur(100, 0, 0, 1) /* la ligne x = 100 */;
    check(lAin >= 40 && lAin <= 60, `l'Ain fait ${lAin.toFixed(0)} m de large (40 à 60)`);
    check(lVey >= 8 && lVey <= 13, `le Veyron fait ${lVey.toFixed(1)} m de large (8 à 12)`);
    check(c.eau.some((e) => e.p.every((q) => q[0] < -150)), "l'Ain coule dans la partie ouest");
    const pontsOk = c.ponts.filter((p) => { const m = [(p.l[0][0] + p.l[1][0]) / 2, (p.l[0][1] + p.l[1][1]) / 2]; return dansEauC(c, m) && !dansEauC(c, p.l[0]) && !dansEauC(c, p.l[1]); });
    check(c.ponts.length >= 2 && pontsOk.length === c.ponts.length, `${c.ponts.length} ponts qui enjambent l'eau d'une berge à l'autre`);
    const gues = []; for (const r of c.rues) for (let i = 0; i + 1 < r.l.length; i++) { const a = r.l[i], b = r.l[i + 1], k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let s = 0; s <= k; s++) { const x = a[0] + (b[0] - a[0]) * s / k, z = a[1] + (b[1] - a[1]) * s / k; if (dansEauC(c, [x, z]) && !c.ponts.some((p) => dSeg(x, z, p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2)) { gues.push(r.n || r.t); break; } } }
    check(!gues.length, `aucune rue ne traverse l'eau hors d'un pont${exemples([...new Set(gues)])}`);
    // le relief
    const H = c.relief.h, n = c.relief.n, h = (i, j) => H[j * n + i], X = (i) => -300 + i * 10;
    const moy = (f) => { let s = 0, k = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (f(X(i), X(j))) { s += h(i, j); k++; } return s / k; };
    const est = moy((x) => x > 200), ouest = moy((x) => x > -190 && x < -100);
    check(Math.min(...H) >= -3 && Math.max(...H) >= 40 && Math.max(...H) <= 70, `relief de ${Math.min(...H)} à ${Math.max(...H)} m`);
    check(est - ouest >= 25, `le relief monte vers l'est (coteaux ${est.toFixed(0)} m, plaine ${ouest.toFixed(0)} m)`);
    let pente = 0; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) if (Math.hypot(X(i), X(j)) < 100) pente = Math.max(pente, Math.abs(h(i + 1, j) - h(i, j)), Math.abs(h(i, j + 1) - h(i, j)));
    check(pente <= 2, `doux dans le bourg (au plus ${pente.toFixed(1)} m de dénivelé tous les 10 m)`);
    const placeH = h(30, 30); check(placeH > 5 && placeH < 25, `la place Bichat à +${placeH} m au-dessus de la rivière`);
    check(c.arbres.length >= 200 && c.arbres.length <= 900, `quelques centaines d'arbres (${c.arbres.length})`);
    check(TYPES_VEG.every((k) => c.vegetation.some((v) => v.t === k)), 'prés, bois, vignes et jardins');
    const arbresMal = c.arbres.filter(([x, z]) => dansEauC(c, [x, z]) || c.batiments.some((b) => dedans(b.p, x, z)));
    check(!arbresMal.length, `aucun arbre dans l'eau ou dans un bâtiment${exemples(arbresMal.map((a) => `[${a}]`))}`);
    const place = c.rues.find((r) => r.n === 'Place Bichat');
    check(!!place && c.zones.arene.rayon === 110 && dSeg(...c.zones.arene.centre, ...place.l[0], ...place.l[place.l.length - 1]) < place.w / 2, "l'arène est centrée sur la place Bichat, rayon 110 m");
  }
  for (const [nom, c] of [['graine 1', c1], ['graine 2', c2], ['graine 7', c7]]) { console.log(`── carte provisoire, ${nom} : validation v1 ──`); valider(c, { strict: true }); }

  const VRAIE = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
  if (fs.existsSync(VRAIE)) {
    console.log('── poncin/carte/poncin.json : validation v1 ──');
    let c = null; try { c = JSON.parse(fs.readFileSync(VRAIE, 'utf8')); } catch (e) { check(false, `JSON lisible (${e.message})`); }
    if (c) {
      check(c.source === 'ign-osm', 'source ign-osm'); valider(c, { strict: false, dossier: path.dirname(VRAIE) });
      // les deux voûtes de Poncin (le joueur l'a confirmé : il n'y en a que deux) : sous le bâtiment que traverse la voie de ce nom
      const P = c.passages || [], noms = ['Porte Bouvent', 'Impasse du Bonheur'], rue = (n) => c.rues.filter((r) => r.n === n);
      const pres = (p) => rue(p.n).some((r) => r.l.some((q, i) => i && p.b.some((k) => { for (let t = 0; t <= 1; t += 0.02) { const x = r.l[i - 1][0] + (q[0] - r.l[i - 1][0]) * t, z = r.l[i - 1][1] + (q[1] - r.l[i - 1][1]) * t; if (dedans(c.batiments[k].p, x, z)) return true; } return false; })));
      check(P.length === 2 && noms.every((n) => P.some((p) => p.n === n && pres(p))), `deux passages voûtés, Porte Bouvent et Impasse du Bonheur, sous les bâtiments que traversent ces voies (${P.map((p) => `${p.n} sous ${p.b}`).join(' ; ')})`);
    }
  } else note('poncin/carte/poncin.json absente : seule la carte provisoire est validée');

  console.log(fails ? `\n${fails} vérification(s) en échec` : '\nCartes OK.');
  process.exit(fails ? 1 : 0);
}
if (require.main === module) principal();
else module.exports = { valider, rasterArene, recouvre, dedans, echecs: () => fails }; // pour explorer d'autres graines à la main
