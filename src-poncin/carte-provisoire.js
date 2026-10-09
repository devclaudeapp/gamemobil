/* OPÉRATION PONCIN — la carte provisoire : un Poncin dessiné d'après le plan du bourg (place Bichat, mairie, église Saint-Martin, château
   sur sa butte, l'Ain à l'ouest, le Veyron au sud), complété au hasard rejouable (maisons, jardins, arbres), au format v1 de
   src-poncin/ARCHITECTURE.md. Elle sert tant que poncin/carte/poncin.json (IGN + OpenStreetMap) manque ; l'ouest est resserré pour
   que l'Ain tienne dans le carré de 600 m. Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node.
   Pour que deux appareils construisent exactement la même carte (réseau), les décisions ne passent que par + − × ÷ et √ (exacts en
   IEEE 754), jamais par sin/cos (qui peuvent différer d'un moteur à l'autre), et tout est arrondi au centimètre à la fin. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PCARTEPROV = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const L = 600, D = L / 2, PAS = 10, N = L / PAS + 1;

  // ─── géométrie plane (x, z) ───
  const E = 1e-7;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lisse = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }; // smoothstep
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  function aire(p) { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function centre(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
  function dedans(p, x, z) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
  function distSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l > 0 ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const x = ax + t * dx - px, z = az + t * dz - pz; return Math.sqrt(x * x + z * z); }
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function croise(a, b, c, d) { const d1 = orient(c, d, a), d2 = orient(c, d, b), d3 = orient(a, b, c), d4 = orient(a, b, d); return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E)); }
  function distSegSeg(a, b, c, d) { if (croise(a, b, c, d)) return 0; return Math.min(distSeg(a[0], a[1], c[0], c[1], d[0], d[1]), distSeg(b[0], b[1], c[0], c[1], d[0], d[1]), distSeg(c[0], c[1], a[0], a[1], b[0], b[1]), distSeg(d[0], d[1], a[0], a[1], b[0], b[1])); }
  function distBord(p, x, z) { let m = Infinity; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; m = Math.min(m, distSeg(x, z, a[0], a[1], b[0], b[1])); } return m; }
  function simple(p) { // pas d'auto-intersection, pas de pointe, pas de sommet répété
    const n = p.length; if (n < 3) return false;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n], c = p[(i + 2) % n];
      if (Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3) return false;
      if (Math.abs(orient(a, b, c)) < 1e-6 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) return false;
      for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (distSegSeg(a, b, p[j], p[(j + 1) % n]) < 1e-3) return false; }
    }
    return true;
  }
  function pointInterieur(p) { const c = centre(p); if (dedans(p, c[0], c[1])) return c; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 2) % p.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (dedans(p, m[0], m[1])) return m; } return p[0]; }
  function chevauche(A, B) { // les intérieurs se recouvrent (un mur mitoyen ne compte pas)
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (croise(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    for (const q of A) if (dedans(B, q[0], q[1]) && distBord(B, q[0], q[1]) > 0.05) return true;
    for (const q of B) if (dedans(A, q[0], q[1]) && distBord(A, q[0], q[1]) > 0.05) return true;
    const a = pointInterieur(A), b = pointInterieur(B);
    return (dedans(B, a[0], a[1]) && distBord(B, a[0], a[1]) > 0.05) || (dedans(A, b[0], b[1]) && distBord(A, b[0], b[1]) > 0.05);
  }
  function distPolyLigne(p, l) { // distance entre un polygone (plein) et une ligne brisée
    for (const q of l) if (dedans(p, q[0], q[1])) return 0;
    let m = Infinity;
    for (let i = 0; i < p.length; i++) for (let j = 0; j + 1 < l.length; j++) m = Math.min(m, distSegSeg(p[i], p[(i + 1) % p.length], l[j], l[j + 1]));
    return m;
  }
  const boite = (p) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } return [x0, z0, x1, z1]; };
  const norme = (x, z) => { const l = Math.sqrt(x * x + z * z) || 1; return [x / l, z / l]; };
  function chaikin(l, n) { for (let k = 0; k < n; k++) { const r = [l[0]]; for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1]; r.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } r.push(l[l.length - 1]); l = r; } return l; }
  function longueurs(l) { const s = [0]; for (let i = 1; i < l.length; i++) s.push(s[i - 1] + Math.sqrt((l[i][0] - l[i - 1][0]) ** 2 + (l[i][1] - l[i - 1][1]) ** 2)); return s; }
  function surLigne(l, s, cum) { // point et normale (à gauche du sens de parcours, lissée aux sommets) à l'abscisse s
    let i = 1; while (i < l.length - 1 && cum[i] < s) i++;
    const a = l[i - 1], b = l[i], t = borne((s - cum[i - 1]) / Math.max(E, cum[i] - cum[i - 1]), 0, 1);
    let [tx, tz] = norme(b[0] - a[0], b[1] - a[1]);
    if (t > 0.999 && i + 1 < l.length) { const [ux, uz] = norme(l[i + 1][0] - b[0], l[i + 1][1] - b[1]); [tx, tz] = norme(tx + ux, tz + uz); }
    if (t < 0.001 && i > 1) { const [ux, uz] = norme(a[0] - l[i - 2][0], a[1] - l[i - 2][1]); [tx, tz] = norme(tx + ux, tz + uz); }
    return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), nx: tz, nz: -tx, tx, tz, i };
  }
  function berges(l, w) { // les deux bords d'une ligne élargie (rivière), dans le sens de la ligne
    const g = [], d = [], cum = longueurs(l);
    for (let i = 0; i < l.length; i++) { const s = surLigne(l, cum[i], cum), r = (typeof w === 'function' ? w(i / (l.length - 1)) : w) / 2; g.push([s.x + s.nx * r, s.z + s.nz * r]); d.push([s.x - s.nx * r, s.z - s.nz * r]); }
    return [g, d];
  }
  function intersection(a, b, c, d) { const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx; if (Math.abs(den) < E) return null; const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * rx, a[1] + t * rz] : null; }
  // une courbe de Catmull-Rom échantillonnée (rivières)
  function decouper(p) { // Sutherland–Hodgman : le polygone coupé au carré (−D..D), sommets alignés retirés
    for (const [ax, v, sg] of [[0, -D, 1], [0, D, -1], [1, -D, 1], [1, D, -1]]) {
      const r = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], da = sg * (a[ax] - v), db = sg * (b[ax] - v); if (da >= 0) r.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db), q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; q[ax] = v; r.push(q); } }
      p = r; if (p.length < 3) return [];
    }
    for (let k = 0; k < 2; k++) p = p.filter((q, i) => { const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length]; return Math.abs(orient(a, q, b)) > 1e-6; });
    return p;
  }
  function spline(pts, pasPts) { const r = []; for (let i = 0; i + 1 < pts.length; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]; for (let k = 0; k < pasPts; k++) { const t = k / pasPts, t2 = t * t, t3 = t2 * t; r.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); } } r.push(pts[pts.length - 1].slice()); return r; }

  // ─── une grille d'index (cellules de 20 m) pour les recherches de voisinage ───
  function Index(cell) {
    const g = new Map(), k = (i, j) => i * 4096 + j;
    return {
      ajouter(bb, v) { for (let i = Math.floor(bb[0] / cell); i <= Math.floor(bb[2] / cell); i++) for (let j = Math.floor(bb[1] / cell); j <= Math.floor(bb[3] / cell); j++) { const c = k(i, j); let a = g.get(c); if (!a) g.set(c, (a = [])); a.push(v); } },
      chercher(bb, f) { const vu = new Set(); for (let i = Math.floor(bb[0] / cell); i <= Math.floor(bb[2] / cell); i++) for (let j = Math.floor(bb[1] / cell); j <= Math.floor(bb[3] / cell); j++) { const a = g.get(k(i, j)); if (a) for (const v of a) if (!vu.has(v)) { vu.add(v); if (f(v) === true) return true; } } return false; },
    };
  }

  // ─── le plan dessiné (x vers l'est, z vers le sud, place Bichat en (0, 0)) : [nom, type, largeur, points, lissage] ───
  const RUES = [
    ['Avenue du Château', 'route', 6.5, [[-82, -47], [-35, -52], [40, -58], [100, -63], [151, -68]], 1],
    ["Route d'Avrillat", 'route', 6, [[151, -68], [163, -98], [192, -128], [221, -152], [234, -205], [244, -258], [252, -300]], 2],
    ['Rue de la Résistance', 'route', 7, [[-10, -300], [-13, -262], [-24, -164], [-42, -86], [-53, -58], [-62, -52]], 2],
    ['Avenue du Parc', 'route', 7, [[-62, -52], [-77, -38], [-80, 10], [-79, 67], [-75, 120], [-58, 137]], 2],
    ['Place Feltin', 'route', 7, [[-58, 137], [-33, 143], [-26, 152]], 1],
    ['Avenue Paul Painlevé', 'route', 7, [[-26, 152], [-27, 186], [-35, 240], [-44, 300]], 1],
    ['Route de Neuville', 'route', 7, [[-80, 12], [-140, 15], [-200, 17], [-300, 20]], 1],
    ['Rue de la Verchère', 'rue', 5.5, [[-79, -36], [-100, -36], [-114, -40], [-146, -62], [-198, -82]], 1],
    ['Rue du 11 Novembre 1918', 'rue', 5.5, [[151, -68], [146, -56], [131, -37], [95, -3], [60, 32], [55, 37], [12, 78], [-17, 96], [-24, 114], [-26, 140]], 1],
    ['Rue Xavier Bichat', 'rue', 5, [[58, 34], [84, 53], [100, 62], [143, 70], [165, 78]], 1],
    ['Rue du 8 Mai 1945', 'rue', 5, [[18, 10], [16, 22], [-4, 56], [-12, 74]], 1],
    ['Rue des Prêtres', 'rue', 4.5, [[-21, 9], [-18, 39], [-24, 64]], 1],
    ["Rue de l'Étoile", 'rue', 5, [[99, -36], [84, -24], [30, 11]], 1],
    ['Rue Neuve', 'rue', 5, [[22, -14], [60, -26], [99, -36]], 1],
    ['Rue des Halles', 'rue', 5, [[19, -55], [21, -14]], 0],
    ['Porte Bouvent', 'rue', 5, [[-38, -52], [-37, -28], [-31, -8]], 1],
    ['Rue de la Pompe', 'rue', 4.5, [[28, 12], [56, 34]], 0],
    ['Rue du Mazet', 'rue', 4.5, [[114, -20], [137, 2], [151, 25], [154, 40], [152, 56]], 1],
    ['Rue du Veyron', 'rue', 5, [[165, 78], [158, 92], [126, 150]], 1],
    ['Impasse du Bonheur', 'rue', 4, [[-21, 38], [-58, 31]], 0],
    ['Chemin sous les Côtes', 'chemin', 3.5, [[165, 78], [176, 62], [190, 57], [214, 57], [243, 66], [270, 78], [300, 86]], 1],
    ['Quai du Veyron', 'rue', 3.5, [[-24, 134], [-12, 137], [-4, 144], [36, 156], [80, 166]], 1],
    ['Rue Pelan', 'rue', 5, [[-58, 137], [-66, 147], [-104, 178], [-136, 192], [-170, 196]], 1],
    ['Rue Paul-Émile Victor', 'rue', 5, [[-27, 190], [-6, 190], [14, 196], [30, 212], [76, 262], [108, 280], [136, 300]], 1],
    ['Chemin de la Colombière', 'rue', 4.5, [[40, -58], [44, -100], [52, -140], [76, -160]], 1],
    ['Lotissement Les Villas Poncinoises', 'rue', 5, [[-18, -221], [63, -228], [74, -184], [76, -160]], 1],
    ['Chemin des Tilleuls', 'rue', 4.5, [[-19, -238], [-44, -241], [-56, -232], [-75, -205], [-100, -180]], 1],
    ['Allée du Clos', 'rue', 4.5, [[25, -224], [22, -296]], 0],
    ["Chemin des Terres d'Ain", 'chemin', 3, null, 0], // le long de la rive gauche de l'Ain (calculé)
    ['Chemin des Vignes', 'chemin', 3, [[192, -128], [160, -170], [150, -230], [130, -296]], 1],
    ['Chemin du Bois', 'chemin', 3, [[244, -258], [280, -232], [300, -226]], 1],
    ['Chemin de la Gadine', 'chemin', 3, [[-100, -180], [-140, -170], [-190, -160]], 1],
  ];
  // les places (des rues très larges : le sol est pavé, rien n'y est bâti)
  const PLACES = [
    ['Place Bichat', [[-18, -1], [17, 2]], 21],
    ["Place de l'Église", [[-70, 62.4], [-51, 67.2], [-23, 74.7]], 9],
    ['Place de Verdun', [[46, -48], [136, -58]], 10],
    ['Place Porte Leymiat', [[160, 70], [174, 66]], 10],
  ];
  // le bourg clos : rangées mitoyennes à l'intérieur
  const BOURG = [[-42, -48], [150, -66], [176, -40], [178, 62], [150, 100], [60, 112], [-6, 128], [-34, 112], [-46, 60], [-40, 0]];
  const PRAIRIE = [[-86, -24], [-150, -24], [-150, 128], [-86, 128]]; // à l'ouest de l'avenue du Parc : des prés et quelques granges, pas de maisons (des lignes de tir longues)
  const CHATEAU_ZONE = [[181, -103], [226, -116], [284, -108], [295, -60], [292, -20], [278, 18], [236, 26], [196, 22], [186, -12], [179, -55]];

  function creer(graine) {
    graine = graine == null ? 1 : graine;
    const rnd = REGLES.mulberry32(((graine >>> 0) ^ 0x5eed1450) >>> 0);
    const ent = (a, b) => a + rnd() * (b - a), choix = (t) => t[Math.floor(rnd() * t.length)];
    const carte = {
      v: 1, nom: 'Poncin', source: 'provisoire', attribution: 'Carte provisoire dessinée d’après le plan de Poncin (© contributeurs OpenStreetMap)',
      origine: { lat: 46.0875, lon: 5.4069 }, taille: L, relief: null, batiments: [], rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], sol: null, zones: null,
    };
    // ─── l'eau : l'Ain du nord au sud, le Veyron de l'est jusqu'à la confluence ───
    const ainPts = [[-218, -300], [-226, -200], [-237, -100], [-247, 0], [-253, 100], [-262, 200], [-276, 300]].map(([x, z], i) => [x + (i > 0 && i < 6 ? ent(-5, 5) : 0), z]);
    const ain = spline(ainPts, 6), largeurAin = (z) => 50 + 6 * lisse(z, -300, 300) + 3 * (lisse(z, -150, -60) - lisse(z, 60, 160));
    const ainX = (z) => { for (let i = 1; i < ain.length; i++) if (ain[i][1] >= z) { const a = ain[i - 1], b = ain[i]; return lerp(a[0], b[0], (z - a[1]) / Math.max(E, b[1] - a[1])); } return ain[ain.length - 1][0]; };
    const rive = (z, c) => ainX(z) + c * largeurAin(z) / 2; // c = +1 rive gauche (est), −1 rive droite (ouest)
    let est = [], ouest = []; for (let z = -D; z <= D; z += 10) { est.push([rive(z, 1), z]); ouest.push([Math.max(-D, rive(z, -1)), z]); }
    const veyPts = [[D, 214], [255, 198], [215, 193], [170, 190], [130, 186], [90, 180], [45, 174], [5, 167], [-26, 168], [-50, 177], [-64, 200], [-92, 224], [-128, 236], [-168, 241], [-205, 243]].map(([x, z], i) => (i > 0 && (x > 20 || x < -60) ? [x + ent(-3, 3), z + ent(-4, 4)] : [x, z]));
    veyPts.push([rive(244, 1) - 12, 245]);
    const veyron = chaikin(veyPts, 3), largeurVey = (t) => 9.5 + 2 * t;
    { // le Veyron s'arrête pile sur la berge de l'Ain : les deux eaux se touchent sans se recouvrir (pas de double transparence)
      const [g, d] = berges(veyron, largeurVey), coupe = (c) => { for (let k = 1; k < c.length; k++) for (let e = 0; e + 1 < est.length; e++) { const I = intersection(c[k - 1], c[k], est[e], est[e + 1]); if (I) return { k, I }; } return null; };
      const cg = coupe(g), cd = coupe(d);
      est = est.concat([cg.I, cd.I]).sort((a, b) => a[1] - b[1]);
      const entre = est.filter((q) => q[1] > Math.min(cg.I[1], cd.I[1]) && q[1] < Math.max(cg.I[1], cd.I[1]) && q !== cg.I && q !== cd.I);
      if (cg.I[1] > cd.I[1]) entre.reverse();
      carte.eau.push({ p: est.concat(ouest.reverse()), t: 'riviere' }, { p: g.slice(0, cg.k).concat([cg.I], entre, [cd.I], d.slice(0, cd.k).reverse()), t: 'riviere' });
    }
    const eaux = carte.eau.map((e) => e.p), bbEaux = eaux.map(boite);
    const pres = (k, x, z, m) => { const b = bbEaux[k]; return x > b[0] - m && x < b[2] + m && z > b[1] - m && z < b[3] + m; };
    const dansEau = (x, z) => eaux.some((p, k) => pres(k, x, z, 0) && dedans(p, x, z));
    const distEau = (x, z) => { let m = 30; eaux.forEach((p, k) => { if (pres(k, x, z, m)) m = Math.min(m, dedans(p, x, z) ? 0 : distBord(p, x, z)); }); return m; }; // au-delà de 30 m : 30
    const distVeyron = (x, z) => { let m = Infinity; for (let i = 0; i + 1 < veyron.length; i++) m = Math.min(m, distSeg(x, z, veyron[i][0], veyron[i][1], veyron[i + 1][0], veyron[i + 1][1])); return m; };

    // ─── les rues ───
    const rues = [];
    for (const [n, t, w, pts, k] of RUES) {
      let l = pts;
      if (!l) { l = []; for (let z = -D; z <= 196; z += 20) l.push([rive(z, 1) + 11 + (z > -40 && z < 60 ? 2 : 0), z]); }
      else l = l.map(([x, z], i) => (i > 0 && i < l.length - 1 && t !== 'route' ? [x + ent(-1, 1), z + ent(-1, 1)] : [x, z]));
      rues.push({ l: k ? chaikin(l, k) : l, w, t, n });
    }
    for (const [n, l, w] of PLACES) rues.push({ l: l.map((q) => q.slice()), w, t: 'rue', n, place: true });
    // les ponts : là où une route coupe l'eau, de berge à berge, 3 m de plus de chaque côté
    for (const r of rues) {
      if (r.t !== 'route') continue;
      const cum = longueurs(r.l), tot = cum[cum.length - 1]; let debut = -1;
      for (let s = 0; s <= tot + 0.5; s += 0.5) {
        const q = surLigne(r.l, Math.min(s, tot), cum), mouille = dansEau(q.x, q.z);
        if (mouille && debut < 0) debut = s;
        if ((!mouille || s >= tot) && debut >= 0) { const a = surLigne(r.l, Math.max(0, debut - 3.5), cum), b = surLigne(r.l, Math.min(tot, s + 3), cum); carte.ponts.push({ l: [[a.x, a.z], [b.x, b.z]], w: r.w + 1 }); debut = -1; }
      }
    }
    const surPont = (x, z) => carte.ponts.some((p) => distSeg(x, z, p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2);
    const segRues = Index(20);
    rues.forEach((r, ri) => { for (let i = 0; i + 1 < r.l.length; i++) { const a = r.l[i], b = r.l[i + 1], m = r.w / 2 + 2; segRues.ajouter([Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m], { a, b, r: ri }); } });
    const distRue = (x, z, saufRue) => { let m = Infinity; segRues.chercher([x - 25, z - 25, x + 25, z + 25], (s) => { if (s.r === saufRue) return; m = Math.min(m, distSeg(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) - rues[s.r].w / 2); }); return m; };

    // ─── le relief : la rivière à 0 m, la plaine à +4/+7, le bourg qui monte doucement de +8 à +18, la butte du château à +45, les coteaux à +55 ───
    const bruit = (() => { // bruit de valeur lissé, deux octaves, tiré une fois
      const oct = [[60, 1.8], [25, 0.6]].map(([pas, amp]) => { const n = Math.ceil(L / pas) + 2, v = []; for (let i = 0; i < n * n; i++) v.push(rnd() * 2 - 1); return { pas, amp, n, v }; });
      return (x, z) => { let h = 0; for (const o of oct) { const fx = (x + D) / o.pas, fz = (z + D) / o.pas, i = Math.floor(fx), j = Math.floor(fz), u = lisse(fx - i, 0, 1), w = lisse(fz - j, 0, 1), V = (a, b) => o.v[Math.min(o.n - 1, b) * o.n + Math.min(o.n - 1, a)]; h += o.amp * lerp(lerp(V(i, j), V(i + 1, j), u), lerp(V(i, j + 1), V(i + 1, j + 1), u), w); } return h; };
    })();
    function altitude(x, z) {
      const nord = lisse(-z, 60, 260); // les coteaux remontent aussi au nord-est
      let h = 3.5 + 3 * lisse(x, -225, -95) + 9 * lisse(x, -95, 55) + 4 * lisse(x, 55, 140) + (31 + 6 * nord) * lisse(x, 135 - 25 * nord, 265);
      h += bruit(x, z) * (0.35 + 0.65 * lisse(Math.sqrt(x * x + z * z), 120, 220));
      const eO = rive(z, -1); if (x < eO) h = Math.max(h, 2 + 0.3 * (eO - x)); // la rive droite remonte vers Neuville
      const dA = Math.abs(x - ainX(z)) - largeurAin(z) / 2; // l'Ain : un lit à −1,5 m, des berges à +1,5 m qui rejoignent la plaine
      h = dA < 0 ? -1.5 : Math.min(h, lerp(1.5, h, lisse(dA, 0, 70)));
      const fond = 0.5 + 6 * lisse(x, -240, D), dV = distVeyron(x, z) - 5.5; // le Veyron creuse son vallon
      h = dV < 0 ? fond - 1.5 : lerp(fond + 1.2, h, lisse(dV, 0, 75));
      if (z > 190) h += 7 * lisse(z, 200, 300) * lisse(distVeyron(x, z), 20, 90);
      if (dedans(CHATEAU_ZONE, x, z) || distBord(CHATEAU_ZONE, x, z) < 12) { const k = 1 - lisse(dedans(CHATEAU_ZONE, x, z) ? 0 : distBord(CHATEAU_ZONE, x, z), 0, 12); h = lerp(h, 3.5 * Math.round(h / 3.5), k); } // les terrasses du château
      return h;
    }
    const H = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H.push(Math.round(altitude(-D + i * PAS, -D + j * PAS) * 10) / 10);
    carte.relief = { pas: PAS, n: N, h: H };

    // ─── la zone interdite du château et les bâtiments remarquables ───
    carte.interdit.push({ p: CHATEAU_ZONE.map((q) => q.slice()), n: 'Château de Poncin (propriété privée)' });
    const bat = [], idxBat = Index(20);
    const poser = (p, h, t) => { const b = { p, h: Math.round(h * 10) / 10, t, bb: boite(p) }; bat.push(b); idxBat.ajouter(b.bb, b); return b; };
    function libre(p, o) { // un polygone de bâtiment est-il posable ici ?
      o = o || {};
      const bb = boite(p), mr = o.marge == null ? 0.3 : o.marge;
      if (bb[0] < -D + 2 || bb[1] < -D + 2 || bb[2] > D - 2 || bb[3] > D - 2) return false;
      if (!simple(p) || Math.abs(aire(p)) < (o.aireMin || 6)) return false;
      if (idxBat.chercher([bb[0] - 0.5, bb[1] - 0.5, bb[2] + 0.5, bb[3] + 0.5], (b) => b.bb[0] <= bb[2] && b.bb[2] >= bb[0] && b.bb[1] <= bb[3] && b.bb[3] >= bb[1] && chevauche(p, b.p))) return false;
      const vus = new Set();
      if (segRues.chercher([bb[0] - 12, bb[1] - 12, bb[2] + 12, bb[3] + 12], (s) => { const r = rues[s.r], k = s.r === o.rue ? o.recul : mr; if (vus.has(s)) return; vus.add(s); return distPolyLigne(p, [s.a, s.b]) < r.w / 2 + (k == null ? mr : k) - 0.05; })) return false;
      for (const e of eaux) { const b2 = boite(e); if (bb[2] + 5 > b2[0] && bb[0] - 5 < b2[2] && bb[3] + 5 > b2[1] && bb[1] - 5 < b2[3]) { for (const q of p) if (dedans(e, q[0], q[1]) || distBord(e, q[0], q[1]) < 4) return false; if (dedans(p, ...centre(e))) return false; } }
      if (!o.chateau) for (const q of p) if (dedans(CHATEAU_ZONE, q[0], q[1]) || distBord(CHATEAU_ZONE, q[0], q[1]) < 2.5) return false;
      if (!o.chateau && dedans(p, ...centre(CHATEAU_ZONE))) return false;
      return true;
    }
    const rect = (cx, cz, ux, uz, a, b) => { const vx = -uz, vz = ux; return [[cx - ux * a - vx * b, cz - uz * a - vz * b], [cx + ux * a - vx * b, cz + uz * a - vz * b], [cx + ux * a + vx * b, cz + uz * a + vz * b], [cx - ux * a + vx * b, cz - uz * a + vz * b]]; };
    const octo = (cx, cz, r) => { const k = 0.70710678, d = [[1, 0], [k, k], [0, 1], [-k, k], [-1, 0], [-k, -k], [0, -1], [k, -k]]; return d.map(([a, b]) => [cx + a * r, cz + b * r]); };
    // la mairie, au nord de la place
    poser([[-28, -29], [-6, -30.5], [-5, -15.5], [-27, -14]], 12.5, 'mairie');
    // l'église Saint-Martin : nef orientée, chevet à pans, clocher accolé à l'ouest
    {
      const [ux, uz] = norme(30, 8), vx = -uz, vz = ux, ox = -54, oz = 79, lg = 29, lw = 7;
      const P = (a, b) => [ox + ux * a + vx * b, oz + uz * a + vz * b];
      poser([P(0, -lw), P(lg, -lw), P(lg + 4, -lw * 0.55), P(lg + 5, 0), P(lg + 4, lw * 0.55), P(lg, lw), P(0, lw)], 13.5, 'eglise');
      poser([P(-7.4, -3.5), P(-0.4, -3.5), P(-0.4, 3.5), P(-7.4, 3.5)], 27, 'tour');
    }
    // le château : un corps en U ouvert au sud, une tour d'angle
    poser([[219, -100], [264, -104], [267, -64], [257, -64], [255, -90], [230, -88], [230, -63], [221, -63]], 14, 'chateau');
    poser(octo(213.5, -103.5, 4.6), 20, 'tour');
    // quelques grands bâtiments (poste, maison de santé, école, collège, supérette, salle des fêtes)
    const GRANDS = [[-120, 50, 16, 11, 8, 'commerce', 0.1], [-128, -122, 34, 17, 9, 'commerce', -0.35], [62, 222, 40, 13, 8.5, 'commerce', 0.75], [158, 246, 44, 15, 10, 'commerce', 0.3], [-14, -45, 22, 9, 6.5, 'commerce', 0], [-128, -18, 26, 15, 7, 'commerce', 0.08]];
    for (const [cx, cz, a, b, h, t, pente] of GRANDS) { const [ux, uz] = norme(1, pente), p = rect(cx, cz, ux, uz, a / 2, b / 2); if (libre(p, { marge: 1 })) poser(p, h, t); }
    for (const [cx, cz, a, b] of [[-104, 92, 12, 7], [-134, 106, 9, 6], [-104, -6, 10, 6], [-142, 64, 8, 5], [-110, 32, 7, 5], [-138, 4, 11, 6], [-96, 62, 6, 4]]) { // les granges de la prairie
      const [ux, uz] = norme(1, ent(-0.4, 0.4)), p = rect(cx + ent(-3, 3), cz + ent(-3, 3), ux, uz, a / 2, b / 2); if (libre(p, { marge: 1.5 })) poser(p, ent(4, 5.5), 'annexe');
    }

    // ─── les maisons le long des rues : rangées mitoyennes dans le bourg, faubourg, maisons isolées avec jardin ───
    const zoneDe = (x, z) => (dedans(BOURG, x, z) ? 0 : distBord(BOURG, x, z) < 45 ? 1 : 2);
    const jardins = [], parcelles = [];
    function rangee(ri, cote) {
      const r = rues[ri]; if (r.t === 'chemin' && r.n !== 'Chemin sous les Côtes') return;
      const cum = longueurs(r.l), tot = cum[cum.length - 1];
      let s = ent(0, 4), avant = null, hAvant = 0, suite = 0, groupe = 3 + Math.floor(rnd() * 5);
      while (s < tot - 4) {
        const q0 = surLigne(r.l, s, cum), z = zoneDe(q0.x, q0.z);
        const P = z === 0 ? { f: [5, 9], d: [9, 13.5], recul: [0.3, 0.8], h: [8, 12], saut: [2.6, 4.5] } : z === 1 ? { f: [7.5, 11], d: [8, 11], recul: [1.5, 4], h: [6, 9], saut: [2.5, 9] } : { f: [9, 13], d: [8, 11], recul: [5, 9], h: [5, 7.5], saut: [10, 32] };
        if ((r.place && z !== 0) || dedans(PRAIRIE, q0.x + q0.nx * cote * 8, q0.z + q0.nz * cote * 8)) { s += 4; avant = null; continue; }
        const f = ent(...P.f), recul = r.place ? 0.3 : avant ? avant.recul : ent(...P.recul), d = ent(...P.d);
        let ok = null;
        for (const [kf, kd] of [[1, 1], [1, 0.7], [0.65, 0.75], [0.5, 0.6]]) {
          const fe = Math.max(4.2, f * kf); if (s + fe > tot) break;
          const q1 = surLigne(r.l, s + fe, cum), o = cote * (r.w / 2 + recul);
          const F0 = avant && z === 0 ? avant.F1 : [q0.x + q0.nx * o, q0.z + q0.nz * o], F1 = [q1.x + q1.nx * o, q1.z + q1.nz * o];
          const dd = d * kd, B0 = avant && z === 0 ? avant.B1 : [F0[0] + q0.nx * cote * dd + q0.tx * ent(-0.5, 0.5), F0[1] + q0.nz * cote * dd + q0.tz * ent(-0.5, 0.5)];
          const d1 = z === 0 ? dd * ent(0.85, 1.15) : Math.sqrt((B0[0] - F0[0]) ** 2 + (B0[1] - F0[1]) ** 2), B1 = [F1[0] + q1.nx * cote * d1, F1[1] + q1.nz * cote * d1];
          const front = [F0]; for (let i = q0.i; i < q1.i; i++) { const v = r.l[i], sv = surLigne(r.l, cum[i], cum); if (cum[i] > s + 0.5 && cum[i] < s + fe - 0.5) front.push([v[0] + sv.nx * o, v[1] + sv.nz * o]); }
          front.push(F1);
          let p = front.concat([B1, B0]);
          if (z > 0 && rnd() < 0.3) { const m = [(B0[0] + B1[0]) / 2, (B0[1] + B1[1]) / 2], e = ent(2.5, 4.5), ex = q0.nx * cote * e, ez = q0.nz * cote * e; p = front.concat([B1, m, [m[0] + ex, m[1] + ez], [B0[0] + ex, B0[1] + ez]]); } // en L
          else if (z === 0 && rnd() < 0.15) { const m = [lerp(B0[0], B1[0], 0.45), lerp(B0[1], B1[1], 0.45)], e = ent(2, 3.5), ex = q0.nx * cote * e, ez = q0.nz * cote * e; p = front.concat([B1, m, [m[0] + ex, m[1] + ez], [B0[0] + ex, B0[1] + ez]]); } // une aile sur cour
          if (cote < 0) p.reverse();
          if (libre(p, { rue: ri, recul: recul, marge: z === 0 ? 0.3 : 1 })) { ok = { p, F1, B1, recul, fe, front: [F0, F1], dd }; break; }
          if (avant) { avant = null; break; } // la rangée bute : on la reprend un peu plus loin
        }
        if (!ok) { avant = null; s += 1.5; continue; }
        let h = z === 0 && hAvant ? borne(hAvant + ent(-1.6, 1.6), P.h[0], P.h[1]) : ent(...P.h);
        const commerce = z === 0 && (r.place || /11 Novembre|Neuve|Étoile|Halles/.test(r.n || '')) && rnd() < (r.place ? 0.6 : 0.3);
        poser(ok.p, h, commerce ? 'commerce' : 'maison'); hAvant = h; s += ok.fe;
        parcelles.push({ q: q0, cote, o: ok, z, ri });
        suite++;
        if (z === 0 && suite < groupe) avant = ok;
        else { avant = null; suite = 0; groupe = 3 + Math.floor(rnd() * 5); s += ent(...P.saut); }
      }
    }
    // d'abord les rues du bourg (la place et les rues qui y mènent), puis les autres
    const ordre = rues.map((r, i) => i).sort((a, b) => (rues[b].place ? 2 : 0) - (rues[a].place ? 2 : 0) || (rues[a].t === 'rue' ? 0 : 1) - (rues[b].t === 'rue' ? 0 : 1));
    for (const ri of ordre) { rangee(ri, 1); rangee(ri, -1); }
    // jardins, remises et arbres fruitiers derrière les maisons hors du bourg ; appentis dans les cours du bourg
    const fruitiers = [];
    for (const pc of parcelles) {
      const { o, cote, z } = pc, F0 = o.front[0], F1 = o.front[1], [tx, tz] = norme(F1[0] - F0[0], F1[1] - F0[1]), nx = tz * -cote, nz = -tx * -cote;
      if (z === 0) {
        if (rnd() < 0.3) { const a = ent(2, 3.2), b = ent(1.6, 2.6), dd = o.dd + b + ent(0.6, 3), c = [lerp(F0[0], F1[0], 0.5) + nx * dd, lerp(F0[1], F1[1], 0.5) + nz * dd], p = rect(c[0], c[1], tx, tz, a, b); if (libre(p, { marge: 1.2 })) poser(p, ent(3, 4.5), 'annexe'); }
        continue;
      }
      const prof = o.dd + ent(8, 16), lg = Math.sqrt((F1[0] - F0[0]) ** 2 + (F1[1] - F0[1]) ** 2) + ent(5, 10), mid = [lerp(F0[0], F1[0], 0.5), lerp(F0[1], F1[1], 0.5)];
      const jd = rect(mid[0] + nx * (prof / 2 - 0.5), mid[1] + nz * (prof / 2 - 0.5), tx, tz, lg / 2, prof / 2);
      if (jd.every((q) => distRue(q[0], q[1]) > 1 && distEau(q[0], q[1]) > 4 && !dedans(CHATEAU_ZONE, q[0], q[1]) && Math.abs(q[0]) < D - 1 && Math.abs(q[1]) < D - 1)) jardins.push(jd);
      if (rnd() < 0.55) { const a = ent(2.5, 3.5), b = ent(2, 3), dd = o.dd + b + ent(1.5, 5), side = rnd() < 0.5 ? -1 : 1, c = [mid[0] + nx * dd + tx * side * ent(2, 6), mid[1] + nz * dd + tz * side * ent(2, 6)], p = rect(c[0], c[1], tx, tz, a, b); if (libre(p, { marge: 1.5 })) poser(p, ent(3, 4.2), 'annexe'); }
      const nf = Math.floor(ent(0, 3.2)); for (let k = 0; k < nf; k++) { const dd = o.dd + ent(4, prof - o.dd - 1), c = [mid[0] + nx * dd + tx * ent(-lg / 2 + 1.5, lg / 2 - 1.5), mid[1] + nz * dd + tz * ent(-lg / 2 + 1.5, lg / 2 - 1.5)]; fruitiers.push([c[0], c[1], ent(4, 7)]); }
    }

    // ─── la végétation : prés au bord de l'eau, bois sur la rive droite et les coteaux, vignes à l'est, jardins ───
    const veg = (p, t) => carte.vegetation.push({ p, t });
    { const z0 = -D, z1 = D, pO = [], pE = []; for (let z = z0; z <= z1; z += 20) { pO.push([-D, z]); pE.push([Math.max(-D + 1, rive(z, -1) - 2), z]); } if (pE.some((q) => q[0] > -D + 4)) veg(pE.concat(pO.reverse()).filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]), 'bois'); }
    const PRES = [
      [[-202, -296], [-120, -296], [-112, -205], [-150, -176], [-208, -170]],
      [[-196, -150], [-150, -158], [-110, -168], [-96, -110], [-140, -78], [-206, -98]],
      [[-200, -70], [-150, -52], [-112, -30], [-150, -5], [-212, 4]],
      [[-212, 28], [-140, 25], [-96, 30], [-96, 112], [-140, 150], [-218, 168]],
      [[-210, 205], [-180, 214], [-110, 214], [-70, 196], [-56, 236], [-80, 296], [-226, 296]],
      [[-20, 210], [10, 214], [40, 250], [20, 296], [-28, 296]],
      [[90, 150], [118, 158], [96, 168], [40, 160]],
      [[180, 100], [270, 102], [298, 112], [298, 170], [240, 180], [170, 176], [140, 160]],
    ];
    for (const p of PRES) veg(p.map(([x, z]) => [x + ent(-3, 3), z + ent(-3, 3)]).map(([x, z]) => [borne(x, -D, D), borne(z, -D, D)]), 'pre');
    const BOIS = [[[256, -300], [300, -300], [300, -152], [262, -168], [250, -230]], [[190, 30], [250, 34], [282, 44], [296, 64], [268, 70], [240, 60], [188, 50]], [[198, 202], [260, 205], [300, 222], [300, 300], [210, 300], [176, 270]]];
    for (const p of BOIS) veg(p.map((q) => q.slice()), 'bois');
    const VIGNES = [[[140, -296], [234, -296], [228, -214], [208, -160], [170, -150], [146, -178]], [[236, -124], [264, -132], [298, -140], [298, -116], [284, -112], [250, -119]], [[90, -110], [138, -102], [150, -140], [120, -160], [94, -150]]];
    for (const p of VIGNES) veg(p.map((q) => q.slice()), 'vigne');
    for (const p of jardins) veg(p, 'jardin');
    veg([[200, -52], [276, -56], [284, -24], [272, 12], [210, 14], [196, -16]], 'jardin'); // les jardins en terrasses du château
    veg([[222, -60], [254, -60], [254, -66], [222, -66]].map(([x, z]) => [x, z + 2]), 'jardin');

    // ─── les arbres ───
    const arbres = [];
    const planter = (x, z, h, marge, sauf) => {
      if (Math.abs(x) > D - 1 || Math.abs(z) > D - 1 || dansEau(x, z) || distEau(x, z) < 1.5 || distRue(x, z, sauf) < (marge == null ? 1.2 : marge)) return false;
      if (idxBat.chercher([x - 3, z - 3, x + 3, z + 3], (b) => dedans(b.p, x, z) || distBord(b.p, x, z) < 2.2)) return false;
      if (arbres.some((a) => (a[0] - x) ** 2 + (a[1] - z) ** 2 < 9)) return false;
      arbres.push([x, z, h]); return true;
    };
    for (const v of carte.vegetation) { // les bois semés en quinconce
      if (v.t !== 'bois') continue; const bb = boite(v.p);
      for (let z = bb[1] + 4; z < bb[3]; z += 9) for (let x = bb[0] + 4 + ((z / 9) & 1) * 4.5; x < bb[2]; x += 9) { const px = x + ent(-2.5, 2.5), pz = z + ent(-2.5, 2.5); if (dedans(v.p, px, pz) && rnd() < 0.85) planter(px, pz, ent(8, 14)); }
    }
    for (let z = -D + 5; z < D; z += ent(7, 12)) { planter(rive(z, 1) + ent(3, 7), z, ent(9, 14)); if (rnd() < 0.5) planter(rive(z, 1) + ent(8, 13), z + ent(-3, 3), ent(8, 12)); } // la ripisylve de l'Ain
    { const cum = longueurs(veyron); for (let s = 3; s < cum[cum.length - 1]; s += ent(6, 11)) { const q = surLigne(veyron, s, cum), c = rnd() < 0.5 ? 1 : -1, o = 5.5 + ent(2.5, 6); planter(q.x + q.nx * o * c, q.z + q.nz * o * c, ent(7, 12)); } } // et celle du Veyron
    { const r = rues.find((x) => x.n === 'Avenue du Château'), cum = longueurs(r.l); for (let s = 60; s < cum[cum.length - 1] - 8; s += 9) { const q = surLigne(r.l, s, cum); planter(q.x - q.nx * (r.w / 2 + 2), q.z - q.nz * (r.w / 2 + 2), ent(8, 10), 0.8); } } // l'alignement de l'avenue
    const placeI = (n) => rues.findIndex((r) => r.n === n);
    { const v = placeI('Place de Verdun'), l = rues[v].l; for (let t = 0.04; t < 1; t += 0.087) planter(lerp(l[0][0], l[1][0], t), lerp(l[0][1], l[1][1], t) - 2.5, ent(8, 10), 0.3, v); } // le mail de la place de Verdun
    { const v = placeI("Place de l'Église"); for (const [x, z] of [[-66, 61], [-58, 63], [-74, 60]]) planter(x, z, ent(8, 11), 0.3, v); } // les tilleuls de l'église
    { const v = placeI('Place Bichat'); for (const [x, z] of [[-24, 6], [22, -7]]) planter(x, z, ent(7, 9), 0.3, v); }
    for (let x = 206; x < 274; x += 9) { arbres.push([x, 6 - (x - 206) * 0.05, ent(6, 8)]); } // l'allée du château
    for (const [x, z, h] of fruitiers) planter(x, z, h, 1);
    for (const p of PRES) for (let k = 0; k < 6; k++) { const q = p[Math.floor(rnd() * p.length)], r2 = p[Math.floor(rnd() * p.length)], t = rnd(); planter(lerp(q[0], r2[0], t), lerp(q[1], r2[1], t), ent(7, 12)); } // arbres isolés des prés
    carte.arbres = arbres;

    // ─── les noms ───
    const cb = (t) => centre(bat.find((b) => b.t === t).p);
    carte.noms.push({ n: 'Place Bichat', x: 0, z: 0 }, { n: 'Mairie', x: cb('mairie')[0], z: cb('mairie')[1] }, { n: 'Église Saint-Martin', x: cb('eglise')[0], z: cb('eglise')[1] },
      { n: 'Château de Poncin', x: cb('chateau')[0], z: cb('chateau')[1] }, { n: "L'Ain", x: ainX(-160), z: -160 }, { n: 'Le Veyron', x: 120, z: 184 },
      { n: "Place de l'Église", x: -48, z: 64 }, { n: 'Place de Verdun', x: 92, z: -53 });

    // ─── les zones de jeu ───
    const obst = bat.map((b) => b.p).concat(carte.interdit.map((z) => z.p));
    const idxObst = Index(12); obst.forEach((p, i) => idxObst.ajouter(boite(p), i));
    const bords = Index(12); obst.concat(eaux).forEach((p) => { for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; bords.ajouter([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], [a, b]); } });
    const bloque = (x, z) => idxObst.chercher([x, z, x, z], (i) => dedans(obst[i], x, z)) || (dansEau(x, z) && !surPont(x, z));
    const distMur = (x, z, max) => { let m = max; bords.chercher([x - max, z - max, x + max, z + max], ([a, b]) => { m = Math.min(m, distSeg(x, z, a[0], a[1], b[0], b[1])); }); return m; };
    const arene = { centre: [0, 0], rayon: 110 }, C = 2, R = arene.rayon, nc = Math.ceil(2 * R / C) + 1;
    const cel = []; // les cellules de 2 m dans l'arène : libres, accessibles depuis la place, distance au mur
    for (let j = 0; j < nc; j++) for (let i = 0; i < nc; i++) { const x = -R + i * C, z = -R + j * C, dc = Math.sqrt(x * x + z * z); cel.push({ x, z, i, j, ok: dc < R - 1.5 && !bloque(x, z), dm: 0, vu: false }); }
    for (const c of cel) if (c.ok) { c.dm = distMur(c.x, c.z, 14); if (c.dm < 0.8) c.ok = false; }
    const at = (i, j) => (i >= 0 && j >= 0 && i < nc && j < nc ? cel[j * nc + i] : null);
    { // parcours en largeur depuis la place
      let dep = null, best = Infinity; for (const c of cel) if (c.ok && c.x * c.x + c.z * c.z < best) { best = c.x * c.x + c.z * c.z; dep = c; }
      const file = [dep]; dep.vu = true;
      while (file.length) { const c = file.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const v = at(c.i + di, c.j + dj); if (!v || !v.ok || v.vu) continue; if (di && dj && !(at(c.i + di, c.j).ok && at(c.i, c.j + dj).ok)) continue; v.vu = true; file.push(v); } }
    }
    const acces = cel.filter((c) => c.vu);
    const DIRS = [[1, 0], [0.92388, 0.38268], [0.70711, 0.70711], [0.38268, 0.92388], [0, 1], [-0.38268, 0.92388], [-0.70711, 0.70711], [-0.92388, 0.38268], [-1, 0], [-0.92388, -0.38268], [-0.70711, -0.70711], [-0.38268, -0.92388], [0, -1], [0.38268, -0.92388], [0.70711, -0.70711], [0.92388, -0.38268]];
    const nr = Math.ceil(2 * R) + 1, plein = new Uint8Array(nr * nr); // l'arène au mètre près, pour lancer des rayons vite
    for (let j = 0; j < nr; j++) for (let i = 0; i < nr; i++) { const x = -R + i, z = -R + j; plein[j * nr + i] = x * x + z * z > R * R || bloque(x, z) ? 1 : 0; }
    const pleinA = (x, z) => { const i = Math.round(x + R), j = Math.round(z + R); return i < 0 || j < 0 || i >= nr || j >= nr || plein[j * nr + i] === 1; };
    const ouverture = (x, z) => { let s = 0; for (const [dx, dz] of DIRS) { let t = 1; while (t < 70 && !pleinA(x + dx * t, z + dz * t)) t += 1; s += t; } return s / DIRS.length; };
    function eparpiller(cands, n, ecart, deja) { // le plus loin possible les uns des autres (et des points déjà pris)
      const pris = [], loin = (c) => Math.min(Infinity, ...pris.concat(deja || []).map((p) => Math.sqrt((p[0] - c.x) ** 2 + (p[1] - c.z) ** 2)));
      while (pris.length < n && cands.length) {
        let best = null, bv = -1; for (const c of cands) { const v = loin(c) + rnd() * 6; if (v > bv) { bv = v; best = c; } }
        if (pris.length && loin(best) < ecart) break; pris.push([best.x, best.z]);
      }
      return pris;
    }
    const sp = eparpiller(acces.filter((c) => c.dm >= 3.4 && c.dm <= 11 && c.x * c.x + c.z * c.z < (R - 6) ** 2), 20, 15);
    const objCands = acces.filter((c) => c.dm >= 1.6 && c.x * c.x + c.z * c.z < (R - 8) ** 2 && (c.i + c.j) % 2 === 0 && sp.every((p) => (p[0] - c.x) ** 2 + (p[1] - c.z) ** 2 > 64));
    for (const c of objCands) c.ouv = ouverture(c.x, c.z);
    const tri = objCands.slice().sort((a, b) => a.ouv - b.ouv), q = Math.floor(tri.length / 4);
    const armes = [], prendre = (cands, arme, n) => { for (const p of eparpiller(cands, n, 30, armes.map((a) => [a.x, a.z]))) armes.push({ x: p[0], z: p[1], arme }); };
    prendre(tri.slice(-q), 'precision', 2); prendre(tri.slice(0, q), 'pompe', 2); prendre(tri.slice(q, -q), 'soin', 2); prendre(tri.slice(q, -q), 'armure', 2);
    // l'extraction : le bout des ponts et la sortie nord ; la base : la place de Verdun
    const extraction = carte.ponts.map((p) => { const [a, b] = p.l, [ux, uz] = norme(b[0] - a[0], b[1] - a[1]); return [b[0] + ux * 4, b[1] + uz * 4]; });
    extraction.push([-11, -292]);
    carte.zones = { arene, apparitions: sp, armes, extraction, base: [92, -54] };

    // ─── sortie : arrondie au centimètre (les murs mitoyens gardent les mêmes sommets) ───
    const r2 = (v) => Math.round(v * 100) / 100, r1 = (v) => Math.round(v * 10) / 10, pt = (q) => [r2(q[0]), r2(q[1])];
    const net = (p) => p.map(pt).filter((q, i, a) => { const s = a[(i + a.length - 1) % a.length]; return a.length < 2 || q[0] !== s[0] || q[1] !== s[1]; });
    carte.batiments = bat.map((b) => ({ p: net(b.p), h: r1(b.h), t: b.t }));
    carte.rues = rues.map((r) => (r.n ? { l: r.l.map(pt), w: r.w, t: r.t, n: r.n } : { l: r.l.map(pt), w: r.w, t: r.t }));
    carte.eau = carte.eau.map((e) => ({ p: net(decouper(e.p)), t: e.t }));
    carte.ponts = carte.ponts.map((p) => ({ l: p.l.map(pt), w: p.w }));
    carte.vegetation = carte.vegetation.map((v) => ({ p: net(decouper(v.p)), t: v.t })).filter((v) => v.p.length >= 3 && simple(v.p) && Math.abs(aire(v.p)) >= 6);
    carte.arbres = carte.arbres.map(([x, z, h]) => [r2(x), r2(z), r1(h)]);
    carte.interdit = carte.interdit.map((z) => ({ p: net(z.p), n: z.n }));
    carte.noms = carte.noms.map((n) => ({ n: n.n, x: r2(n.x), z: r2(n.z) }));
    const zn = carte.zones; zn.apparitions = zn.apparitions.map(pt); zn.armes = zn.armes.map((a) => ({ x: r2(a.x), z: r2(a.z), arme: a.arme })); zn.extraction = zn.extraction.map(pt); zn.base = pt(zn.base);
    return carte;
  }

  return { creer };
});
