/* OPÉRATION PONCIN — la végétation « réaliste stylisée » : arbres par espèce, haies, rangs de vigne, vergers, herbe et fleurs autour du joueur.
   Données (voir src-poncin/ARCHITECTURE.md, « Authenticité ») : carte.arbres [[x, z, h, r?, e?], …] (r : rayon de la couronne, déduit de h
   et de l'espèce s'il manque ; e : feuillu | platane | tilleul | peuplier | saule | fruitier | conifere ; une vieille entrée [x, z, h] devient
   un feuillu, ou un conifère dans un bois de conifères) ; carte.haies [{ l, h?, w? }] ; carte.vegetation [{ p, t, sens?, e? }] : t 'bois'
   (semé d'arbres tous les ~7,5 m dans son polygone ; e : 'conifere' | 'mixte' | 'feuillu', défaut feuillu), 'vigne' (rangs tous les 2 m),
   'verger' (fruitiers en grille s'il n'a aucun arbre réel), 'pre' | 'jardin' (herbe, fleurs) ; sens = direction des rangs, angle compté de
   +x vers +z (défaut : l'axe long du polygone) ; carte.surfaces (herbe, terrain… ; jamais d'herbe sur l'asphalte, les pavés, le gravier) ;
   la photo aérienne (carte.sol.petite, lue une fois, en tâche de fond) dit où l'herbe pousse et de quelle couleur est le sol. Jamais d'herbe
   sur les rues, dans les bâtiments ni dans l'eau. Rien d'inventé : les espèces, positions et tailles viennent des données ; seuls les bois
   et les vergers vides sont semés, et les dessins (feuilles, écorces) sont des choix de style.
   Rendu (Three r158) : UNE texture pour tout (atlas peint sur canvas une fois, puis gardé en mémoire : grappes de feuilles par espèce à
   découpe alpha, écorces, imposteurs, haie, vigne, touffes d'herbe, fleurs et fougères ; couleurs prolongées sous l'alpha et alpha
   conservé dans les mipmaps : pas de liseré noir, pas de feuillage qui fond au loin). Matériaux Lambert (lumières, brouillard et ombres de
   la scène) retouchés par onBeforeCompile : grappes en panneaux tournés vers la caméra (ou pendants, pour le saule) aux normales arrondies
   (la couronne s'éclaire comme une boule, lumière enveloppante, un peu de transparence à contre-jour), troncs et branches avec écorce,
   vent dans le vertex shader (balancement, frémissement des feuilles, des herbes), couleur variée arbre par arbre.
   Niveaux de détail, chacun un InstancedMesh (frustumCulled = false : on élimine nous-mêmes, hors du champ élargi de 24°), recopiés seulement
   quand la caméra a bougé de 2 m ou tourné de 5° : proche (≤ 60 m en haute ; une géométrie par silhouette : boule — feuillu, platane, tilleul,
   fruitier —, colonne — peuplier —, pleureur — saule —, cône — conifère), moyen (≤ 170 m : une géométrie générique déformée par espèce dans
   le shader), loin (un panneau vertical imposteur par arbre) ; haies et vignes : un maillage de tronçons ; herbe : touffes recyclées autour
   de la caméra, qui s'enfoncent avec la distance. Plafonds par niveau (les plus proches d'abord). Ombres (arbres proches, haies, vignes)
   seulement en haute. Budget en haute : ≤ 8 appels + ≤ 5 d'ombre (≤ 14 en tout), ≤ 80k triangles ; moins en moyenne et en éco.
   Aucune allocation par image dans maj (tableaux préparés ; les recopies écrivent dans les tampons des InstancedMesh).
   API : creer(carte, monde, { qualite, dossier, photo }) → { groupe, maj(camera, t), qualite(q?), liberer(), stats } (groupe à ajouter à la
   scène ; maj après avoir placé la caméra ; dossier : où lire carte.sol, défaut window.PONCIN_CARTE_DOSSIER ou 'carte/' ; photo: false pour
   ne pas la lire) ; ESPECES ; QUALITES ; OK (false sans THREE ni document). */
const PVEGETATION = (() => {
  'use strict';
  const OK = typeof THREE !== 'undefined' && typeof document !== 'undefined';
  const TAU = Math.PI * 2;
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lisse = (a, b, v) => { const t = borne((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function h3(i, j, k) { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul((k | 0) + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const rgb = (c, k) => { k = k == null ? 1 : k; return `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`; };
  const rgba = (c, k, a) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;

  // ─── les espèces ───
  const ESPECES = ['feuillu', 'platane', 'tilleul', 'peuplier', 'saule', 'fruitier', 'conifere'];
  const SYN = { chene: 0, hetre: 0, charme: 0, erable: 0, frene: 0, feuillus: 0, broadleaved: 0, platanes: 1, tilleuls: 2, peupliers: 3, saules: 4, fruitiers: 5, pommier: 5, poirier: 5, cerisier: 5, noyer: 5, coniferes: 6, resineux: 6, sapin: 6, epicea: 6, pin: 6, needleleaved: 6 };
  function espece(e) { if (typeof e !== 'string') return -1; const s = e.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); const k = ESPECES.indexOf(s); return k >= 0 ? k : SYN[s] != null ? SYN[s] : -1; }
  const FAM = [0, 0, 0, 1, 2, 0, 3];                              // silhouette du niveau proche : boule, colonne, pleureur, cône
  const R_H = [0.36, 0.42, 0.31, 0.17, 0.45, 0.55, 0.24];         // rayon de couronne / hauteur, quand r manque
  const PENCHE = [0.035, 0.03, 0.025, 0.012, 0.05, 0.13, 0.012];  // inclinaison au sommet (fraction de h) : les fruitiers sont tordus
  const FORME = [[0.32, 0.98, 0, 0], [0.36, 0.98, 0, 0], [0.24, 0.98, 0, 0], [0.11, 1.0, 0, 0], [0.14, 0.9, 0, 1], [0.3, 0.97, 0, 0], [0.07, 1.0, 1, 0]]; // niveau moyen : bas et haut de la couronne (fraction de h), conicité, retombée
  const QUALITES = {
    haute: { proche: 60, nProche: 90, moyen: 170, nMoyen: 420, nLoin: 3200, lignes: 150, nLignes: 480, herbe: 26, pas: 1.05, nHerbe: 1500, ombres: true, atlas: 1024 },
    moyenne: { proche: 45, nProche: 64, moyen: 130, nMoyen: 300, nLoin: 2400, lignes: 120, nLignes: 340, herbe: 20, pas: 1.25, nHerbe: 950, ombres: false, atlas: 1024 },
    eco: { proche: 30, nProche: 36, moyen: 90, nMoyen: 190, nLoin: 1500, lignes: 85, nLignes: 200, herbe: 13, pas: 1.6, nHerbe: 420, ombres: false, atlas: 512 },
  };

  // ═══════════════════════════════ les géométries (en unités normalisées : hauteur 1, rayon de couronne R0) ═══════════════════════════════
  // attributs : position, normal (arrondie pour les feuilles), uv (dans la cellule de l'atlas), aFeu = (coin x, coin y, taille, mode :
  // 0 écorce, 1 grappe tournée vers la caméra, 2 rideau pendant), aOcc (occlusion : intérieur de la couronne, pied du tronc plus sombres)
  function Geo() { this.p = []; this.n = []; this.u = []; this.f = []; this.o = []; this.i = []; this.nv = 0; }
  Geo.prototype.v = function (x, y, z, nx, ny, nz, u, v, f0, f1, f2, f3, o) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.f.push(f0, f1, f2, f3); this.o.push(o); return this.nv++; };
  Geo.prototype.quad = function (a, b, c, d) { this.i.push(a, b, c, a, c, d); };
  Geo.prototype.grappe = function (x, y, z, n, s, rot, ax, ay, occ, miroir) { // un panneau de feuilles centré en (x, y, z), arête s
    const c = Math.cos(rot), si = Math.sin(rot), k = [];
    for (const [cu, cv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { const ox = cu * ax, oy = cv * ay; k.push(this.v(x, y, z, n[0], n[1], n[2], miroir ? 0.5 - cu : cu + 0.5, cv + 0.5, ox * c - oy * si, ox * si + oy * c, s, 1, occ)); }
    this.quad(k[0], k[1], k[2], k[3]);
  };
  Geo.prototype.rideau = function (x, y, z, n, s, ax, occ, miroir) { // un rideau pendant (saule) accroché en (x, y, z), longueur s
    const k = []; for (const [cu, cv] of [[-0.5, -1], [0.5, -1], [0.5, 0], [-0.5, 0]]) k.push(this.v(x, y, z, n[0], n[1], n[2], miroir ? 0.5 - cu : cu + 0.5, cv + 1, cu * ax, cv, s, 2, occ));
    this.quad(k[0], k[1], k[2], k[3]);
  };
  Geo.prototype.tige = function (pts, rays, n, v0, v1, occs) { // un tube le long d'une ligne brisée (tronc, branche), écorce enroulée
    let L = 0; const cum = [0]; for (let k = 1; k < pts.length; k++) { L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]); cum.push(L); }
    let prec = -1;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let rx = 0, ry = 0, rz = 1; if (Math.abs(tz) > 0.9) { rx = 1; rz = 0; }
      let e1x = ty * rz - tz * ry, e1y = tz * rx - tx * rz, e1z = tx * ry - ty * rx; const el = Math.hypot(e1x, e1y, e1z) || 1; e1x /= el; e1y /= el; e1z /= el;
      const e2x = ty * e1z - tz * e1y, e2y = tz * e1x - tx * e1z, e2z = tx * e1y - ty * e1x, r = rays[k], v = v0 + (v1 - v0) * (L > 0 ? cum[k] / L : 0), base = this.nv;
      for (let s = 0; s <= n; s++) { const an = s / n * TAU, c = Math.cos(an), si = Math.sin(an), nx = e1x * c + e2x * si, ny = e1y * c + e2y * si, nz = e1z * c + e2z * si; this.v(pts[k][0] + nx * r, pts[k][1] + ny * r, pts[k][2] + nz * r, nx, ny, nz, s / n, v, 0, 0, 0, 0, occs[k]); }
      if (prec >= 0) for (let s = 0; s < n; s++) this.quad(prec + s, prec + s + 1, base + s + 1, base + s);
      prec = base;
    }
  };
  Geo.prototype.geometrie = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aFeu', new THREE.Float32BufferAttribute(this.f, 4)); g.setAttribute('aOcc', new THREE.Float32BufferAttribute(this.o, 1)); g.setIndex(this.i);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 4); return g;
  };
  const unite = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  function surSphere(rnd) { const y = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - y * y); return [Math.cos(a) * r, y, Math.sin(a) * r]; }
  // chaque silhouette rend { geo, grappes: [{ x, y, z, s, ax, ay, rot, occ, mode }], tiges: [{ pts, rays }], R0 } ; R0 = rayon de couronne nominal
  function silhouette(fam, rnd) {
    const G = new Geo(), gr = [], ti = [];
    const grappe = (x, y, z, n, s, rot, ax, ay, occ) => { G.grappe(x, y, z, n, s, rot, ax, ay, occ, rnd() < 0.5); gr.push({ x, y, z, s, ax, ay, rot, occ, mode: 1 }); };
    const tige = (pts, rays, n, v1, occs) => { G.tige(pts, rays, n, 0, v1, occs); ti.push({ pts, rays }); };
    let R0;
    if (fam === 0) { // la boule irrégulière : des lobes sur un ellipsoïde, des grappes sur les lobes, un tronc et quatre charpentières
      R0 = 0.36; const cy = 0.63, ry = 0.34, lobes = [];
      for (let k = 0; k < 6; k++) { const a = (k + rnd() * 0.6) / 6 * TAU, el = -0.3 + rnd() * 0.75; lobes.push([Math.cos(a) * Math.cos(el) * 0.55, Math.sin(el) * 0.6, Math.sin(a) * Math.cos(el) * 0.55, 0.48 + rnd() * 0.14]); }
      lobes.push([0.05, 0.6, -0.04, 0.5]);
      for (const lo of lobes) {
        const ld = unite(lo[0], lo[1], lo[2]);
        for (let m = 0; m < 6; m++) {
          let d = surSphere(rnd); if (d[0] * ld[0] + d[1] * ld[1] + d[2] * ld[2] < -0.2) d = [-d[0], -d[1], -d[2]];
          const k = lo[3] * (0.62 + rnd() * 0.38); let px = lo[0] + d[0] * k, py = lo[1] + d[1] * k, pz = lo[2] + d[2] * k; const l = Math.hypot(px, py, pz); if (l > 1.08) { px *= 1.08 / l; py *= 1.08 / l; pz *= 1.08 / l; }
          const n = unite(px + (rnd() - 0.5) * 0.4, py + 0.15 + (rnd() - 0.5) * 0.4, pz + (rnd() - 0.5) * 0.4), occ = (0.52 + 0.48 * lisse(0.25, 1.0, Math.hypot(px, py, pz))) * (0.9 + 0.1 * (py + 1) / 2);
          grappe(px * R0, cy + py * ry, pz * R0, n, R0 * (0.56 + rnd() * 0.2), rnd() * TAU, 1, 1, occ);
        }
      }
      for (let m = 0; m < 6; m++) { const d = surSphere(rnd); grappe(d[0] * R0 * 0.35, cy + d[1] * ry * 0.35, d[2] * R0 * 0.35, unite(d[0], d[1] + 0.3, d[2]), R0 * 0.7, rnd() * TAU, 1, 1, 0.45); }
      tige([[0, 0, 0], [0.004, 0.06, 0.002], [0.012, 0.25, -0.006], [0.004, 0.44, 0.004], [0, 0.6, 0]], [0.04, 0.026, 0.022, 0.017, 0.01], 7, 1, [0.55, 0.82, 0.8, 0.62, 0.5]);
      const bas = lobes.slice(0, 6).sort((a, b) => a[1] - b[1]).slice(0, 4);
      bas.forEach((lo, k) => { const y0 = 0.3 + k * 0.04, ex = lo[0] * R0 * 0.85, ey = cy + lo[1] * ry * 0.8, ez = lo[2] * R0 * 0.85; tige([[0, y0, 0], [ex * 0.45, y0 + (ey - y0) * 0.6, ez * 0.45], [ex, ey, ez]], [0.012, 0.008, 0.004], 5, 0.4, [0.7, 0.62, 0.55]); });
    } else if (fam === 1) { // la colonne (peuplier d'Italie) : une couronne étroite et haute, des branches dressées le long du tronc
      R0 = 0.16; const cy = 0.565, ry = 0.455;
      for (let m = 0; m < 52; m++) {
        const t = -0.96 + (m + rnd() * 0.8) / 52 * 1.92, a = rnd() * TAU, pr = Math.sqrt(Math.max(0, 1 - t * t)) * (0.62 + rnd() * 0.42), px = Math.cos(a) * pr, pz = Math.sin(a) * pr;
        grappe(px * R0, cy + t * ry, pz * R0, unite(px, t * 0.5 + 0.1, pz), R0 * (0.8 + rnd() * 0.3) * (0.7 + 0.3 * Math.sqrt(Math.max(0, 1 - t * t))), (rnd() - 0.5) * 0.5, 0.8, 1.25, 0.5 + 0.5 * lisse(0.2, 0.9, pr));
      }
      for (let m = 0; m < 6; m++) grappe((rnd() - 0.5) * R0 * 0.3, cy + (m / 5 - 0.5) * ry * 1.4, (rnd() - 0.5) * R0 * 0.3, unite(0, 0.3, 1), R0 * 0.9, 0, 0.8, 1.3, 0.45);
      tige([[0, 0, 0], [0, 0.04, 0], [0.003, 0.35, 0], [0, 0.7, 0.002], [0, 0.95, 0]], [0.026, 0.017, 0.013, 0.008, 0.003], 6, 1, [0.55, 0.8, 0.7, 0.6, 0.6]);
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rnd(), y0 = 0.1 + k * 0.05; tige([[0, y0, 0], [Math.cos(a) * R0 * 0.35, y0 + 0.2, Math.sin(a) * R0 * 0.35], [Math.cos(a) * R0 * 0.45, y0 + 0.45, Math.sin(a) * R0 * 0.45]], [0.007, 0.005, 0.002], 4, 0.5, [0.65, 0.6, 0.55]); }
    } else if (fam === 2) { // le pleureur (saule) : un tronc court, des charpentières en arceaux, un dôme et des rideaux qui retombent
      R0 = 0.44; const cy = 0.6, ry = 0.3;
      for (let m = 0; m < 26; m++) { let d = surSphere(rnd); if (d[1] < -0.25) d = [d[0], -d[1] * 0.6, d[2]]; const k = 0.7 + rnd() * 0.3; grappe(d[0] * k * R0 * 0.85, cy + d[1] * k * ry, d[2] * k * R0 * 0.85, unite(d[0], d[1] + 0.2, d[2]), R0 * (0.5 + rnd() * 0.15), rnd() * TAU, 1, 1, 0.55 + 0.45 * k); }
      for (let m = 0; m < 34; m++) {
        const a = (m + rnd() * 0.7) / 34 * TAU, pr = 0.7 + rnd() * 0.34, yu = -0.25 + rnd() * 0.75, x = Math.cos(a) * pr * R0 * 0.88, z = Math.sin(a) * pr * R0 * 0.88, y = cy + yu * ry, n = unite(Math.cos(a), 0.1, Math.sin(a)), s = 0.42 + rnd() * 0.16;
        G.rideau(x, y, z, n, s, 0.3, 0.6 + 0.4 * pr, rnd() < 0.5); gr.push({ x, y, z, s, ax: 0.3, ay: 1, rot: 0, occ: 0.6 + 0.4 * pr, mode: 2 });
      }
      tige([[0, 0, 0], [0.01, 0.05, 0], [0.02, 0.18, 0.01], [0.015, 0.3, 0.01]], [0.05, 0.034, 0.03, 0.026], 7, 0.6, [0.55, 0.78, 0.75, 0.65]);
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4 + rnd() * 0.5, ex = Math.cos(a) * R0 * 0.5, ez = Math.sin(a) * R0 * 0.5; tige([[0.015, 0.29, 0.01], [ex * 0.5, 0.5, ez * 0.5], [ex, 0.66, ez]], [0.018, 0.012, 0.006], 5, 0.5, [0.65, 0.6, 0.5]); }
    } else { // le cône (épicéa, sapin) : des étages de grappes aplaties qui retombent, plus petites vers la flèche
      R0 = 0.24; const nT = 8;
      for (let k = 0; k < nT; k++) {
        const t = k / (nT - 1), y = 0.1 + t * 0.8, rT = R0 * Math.pow(1.03 - t, 0.95) * (0.92 + rnd() * 0.12), m = Math.max(3, Math.round(9 * (1 - t) + 2));
        for (let j = 0; j < m; j++) { const a = (j + rnd() * 0.35) / m * TAU + k * 0.7, pr = rT * (0.58 + rnd() * 0.2); grappe(Math.cos(a) * pr, y - rT * 0.22, Math.sin(a) * pr, unite(Math.cos(a), 0.45, Math.sin(a)), rT * (1.0 + rnd() * 0.18) + 0.02, (rnd() - 0.5) * 0.3, 1.35, 0.8, 0.62 + 0.38 * (1 - t * 0.3)); }
        grappe(0, y - rT * 0.1, 0, [0, 1, 0], rT * 1.15 + 0.02, 0, 1.3, 0.85, 0.42);
      }
      grappe(0, 0.965, 0, [0, 1, 0], 0.075, 0, 0.6, 1.3, 1);
      tige([[0, 0, 0], [0, 0.04, 0], [0, 0.5, 0], [0, 0.97, 0]], [0.034, 0.022, 0.013, 0.003], 6, 1, [0.5, 0.7, 0.5, 0.5]);
    }
    return { geo: G.geometrie(), grappes: gr, tiges: ti, R0, tris: G.i.length / 3 };
  }
  function geoMoyen() { // générique : des grappes dans un cylindre (x, z en unités de r ; y = fraction de la couronne), déformées par espèce dans le shader
    const G = new Geo(), rnd = mulberry32(5);
    for (const [t, m, pr] of [[0.06, 3, 0.55], [0.27, 5, 0.86], [0.5, 5, 0.92], [0.72, 4, 0.82], [0.9, 3, 0.55], [1.0, 1, 0]]) for (let j = 0; j < m; j++) { const a = j / m * TAU + t * 2.3, x = Math.cos(a) * pr, z = Math.sin(a) * pr; G.grappe(x, t, z, unite(x, (2 * t - 1) * 0.9 + 0.15, z), 0.92, rnd() * TAU, 1, 1, 0.62 + 0.38 * pr, rnd() < 0.5); }
    G.grappe(0, 0.38, 0, [0, 0.2, 1], 1.0, 0, 1, 1, 0.5); G.grappe(0, 0.66, 0, [0, 0.5, 1], 1.0, 1.3, 1, 1, 0.55);
    G.tige([[0, 0, 0], [0, 1, 0]], [0.08, 0.05], 4, 0, 1, [0.55, 0.7]);
    return { geo: G.geometrie(), tris: G.i.length / 3 };
  }
  function geoLoin() { // un panneau vertical, de x = -0,5 à 0,5 et de y = 0 à 1 (tourné vers la caméra dans le shader)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4); return g;
  }
  function geoLigne() { // un tronçon de haie ou de rang de vigne : x de 0 à 1 (longueur), y de 0 à 1 (hauteur), z de -0,5 à 0,5 (épaisseur)
    const G = new Geo(), F = (x, y, z, nx, ny, nz, u, v, o) => G.v(x, y, z, nx, ny, nz, u, v, 0, 0, 0, 1, o);
    for (const s of [-1, 1]) { // les deux faces, normales arrondies (plus claires en haut), puis la crête en toit arrondi
      const n0 = unite(0, -0.1, s), n1 = unite(0, 0.55, s), a = F(0, 0, 0.5 * s, ...n0, 0, 0, 0.62), b = F(1, 0, 0.5 * s, ...n0, 1, 0, 0.62), c = F(1, 0.93, 0.5 * s, ...n1, 1, 0.93, 1), d = F(0, 0.93, 0.5 * s, ...n1, 0, 0.93, 1);
      G.quad(a, b, c, d);
      const nc = unite(0, 1, s * 0.5), e = F(0, 0.86, 0.46 * s, ...nc, 0, 0.5, 0.95), f = F(1, 0.86, 0.46 * s, ...nc, 1, 0.5, 0.95), gg = F(1, 1.06, 0.02 * s, 0, 1, 0, 1, 0.92, 1.05), h = F(0, 1.06, 0.02 * s, 0, 1, 0, 0, 0.92, 1.05);
      G.quad(e, f, gg, h);
    }
    for (const [x0, w, hy, cep] of [[0, 0.02, 1.07, 0], [0.5, 0.012, 1, 1]]) for (const [dx, dz] of [[w, 0], [0, 0.07]]) { // le piquet (au début) et le cep (au milieu) : deux plans croisés en bois
      const a = G.v(x0 - dx, 0, -dz, 0, 0.3, 1, 0, 0, cep, 0, 0, 0, 0.6), b = G.v(x0 + dx, 0, dz, 0, 0.3, 1, 1, 0, cep, 0, 0, 0, 0.6), c = G.v(x0 + dx, hy, dz, 0, 0.3, 1, 1, 1, cep, 0, 0, 0, 0.9), d = G.v(x0 - dx, hy, -dz, 0, 0.3, 1, 0, 1, cep, 0, 0, 0, 0.9);
      G.quad(a, b, c, d);
    }
    return { geo: G.geometrie(), tris: G.i.length / 3 };
  }
  function geoHerbe() { // deux plans croisés de 1 × 1, posés ; uv.y = hauteur (le vent courbe le haut)
    const p = [], u = [], n = [], idx = [];
    [[1, 0], [0, 1]].forEach(([cx, cz], k) => { const o = k * 4; p.push(-0.5 * cx, 0, -0.5 * cz, 0.5 * cx, 0, 0.5 * cz, 0.5 * cx, 1, 0.5 * cz, -0.5 * cx, 1, -0.5 * cz); u.push(0, 0, 1, 0, 1, 1, 0, 1); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2); return { geo: g, tris: 4 };
  }

  // ═══════════════════════════════ l'atlas (1024 px en haute et moyenne, 512 en éco), peint une fois ═══════════════════════════════
  const CEL = { // en pixels de l'atlas de 1024 : [x, y, l, h] (y vers le bas, comme le canvas)
    feuilles: [[0, 0, 256, 256], [256, 0, 256, 256], [512, 0, 256, 256], [768, 0, 256, 256], [0, 256, 256, 256], [256, 256, 256, 256], [512, 256, 256, 256]],
    haie: [768, 256, 256, 128], vigne: [768, 384, 256, 128], rideau: [768, 768, 128, 256],
    imp: [0, 1, 2, 3, 4, 5, 6].map((k) => [k * 128, 512, 128, 256]), ecorce: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [k * 64, 768, 64, 256]), // 7 = piquet
    herbe: [[512, 768, 128, 128], [640, 768, 128, 128], [512, 896, 128, 128], [640, 896, 128, 128], [896, 768, 128, 128], [896, 896, 128, 128]], // herbe, épis, fleurs, trèfle, fougère, sèche
  };
  const FEUILLES = [ // par espèce : forme, longueur et largeur relative des feuilles (px pour une cellule de 256), nombre, palette, rameaux, fruits
    { forme: 'ovale', l: 15, lw: 0.42, n: 560, pal: [[66, 102, 36], [80, 116, 40], [58, 90, 34], [96, 130, 50], [74, 112, 50], [88, 118, 38]], rameau: [86, 70, 54] },
    { forme: 'palme', l: 22, lw: 0.5, n: 300, pal: [[96, 130, 50], [110, 142, 56], [86, 118, 46], [124, 152, 68], [104, 136, 62]], rameau: [120, 108, 80] },
    { forme: 'coeur', l: 15, lw: 0.5, n: 560, pal: [[84, 128, 44], [98, 140, 50], [74, 116, 40], [112, 150, 62], [92, 134, 56]], rameau: [96, 80, 62] },
    { forme: 'losange', l: 11, lw: 0.5, n: 720, pal: [[78, 116, 44], [92, 128, 50], [68, 104, 40], [136, 156, 104], [104, 136, 60]], rameau: [110, 104, 92] },
    { forme: 'lance', l: 16, lw: 0.17, n: 640, pal: [[120, 142, 72], [134, 154, 84], [106, 130, 64], [156, 170, 112], [128, 150, 70]], rameau: [120, 104, 74], pend: true },
    { forme: 'ovale', l: 14, lw: 0.48, n: 480, pal: [[72, 112, 40], [86, 124, 48], [64, 100, 38], [98, 134, 56]], rameau: [90, 72, 58], fruits: [[196, 52, 38], [214, 160, 58], [176, 44, 36], [150, 168, 50]] },
    { aiguilles: true, n: 9, pal: [[32, 64, 44], [40, 76, 52], [28, 56, 40], [48, 84, 58]], pointes: [[80, 118, 72], [96, 130, 80]], rameau: [92, 66, 46] },
  ];
  const HAIE = { forme: 'ovale', l: 9, lw: 0.48, pal: [[58, 92, 36], [70, 106, 40], [50, 82, 32], [84, 118, 48], [64, 100, 46]], fond: [34, 52, 24] };
  const VIGNE = { forme: 'palme', l: 18, lw: 0.5, pal: [[90, 124, 46], [104, 136, 52], [80, 112, 42], [120, 146, 62], [96, 128, 60]], grains: [[62, 38, 70], [78, 50, 88], [50, 30, 58]], fond: [44, 62, 28] };
  const ECORCES = ['chene', 'platane', 'tilleul', 'peuplier', 'saule', 'fruitier', 'conifere', 'piquet'];
  const BASE_ECORCE = { chene: [104, 94, 80], platane: [184, 176, 140], tilleul: [118, 112, 100], peuplier: [142, 138, 126], saule: [118, 106, 88], fruitier: [92, 80, 68], conifere: [122, 78, 54], piquet: [138, 128, 112] };

  function formeFeuille(c, f, l, w) { // une feuille couchée sur +x : pétiole en (0, 0), pointe en (l, 0), demi-largeur w
    c.beginPath(); c.moveTo(0, 0);
    if (f === 'coeur') { c.bezierCurveTo(-l * 0.08, -w * 1.35, l * 0.72, -w * 1.15, l, 0); c.bezierCurveTo(l * 0.72, w * 1.15, -l * 0.08, w * 1.35, 0, 0); }
    else if (f === 'palme') { const R = l * 0.5; for (let i = 0; i <= 10; i++) { const a = Math.PI + i / 10 * TAU, r = i % 2 ? R : R * (i === 0 || i === 10 ? 0.3 : 0.55); c.lineTo(R + Math.cos(a) * r, Math.sin(a) * r * (w / R) * 1.6); } }
    else if (f === 'losange') { c.quadraticCurveTo(l * 0.22, -w * 1.15, l * 0.45, -w); c.lineTo(l, 0); c.lineTo(l * 0.45, w); c.quadraticCurveTo(l * 0.22, w * 1.15, 0, 0); }
    else { c.quadraticCurveTo(l * 0.42, -w * 1.3, l, 0); c.quadraticCurveTo(l * 0.42, w * 1.3, 0, 0); }
    c.closePath();
  }
  function feuille(c, P, px, py, ang, l, col, k) { // pose, remplit, cerne et nervure
    const ca = Math.cos(ang), sa = Math.sin(ang); c.setTransform(ca, sa, -sa, ca, px, py);
    formeFeuille(c, P.forme, l, l * P.lw); c.fillStyle = rgb(col, k); c.fill();
    if (l > 7) { c.lineWidth = 0.7; c.strokeStyle = rgba(col, k * 0.55, 0.45); c.stroke(); c.beginPath(); c.moveTo(l * 0.06, 0); c.lineTo(l * 0.82, 0); c.strokeStyle = rgba(col, k * 1.3, 0.45); c.lineWidth = 0.6; c.stroke(); }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  function rect(r, k) { return [r[0] * k, r[1] * k, r[2] * k, r[3] * k]; }
  function grappeFeuilles(c, r0, P, rnd, k) { // une grappe ronde aux bords déchiquetés : rameaux, puis trois couches de feuilles de plus en plus claires
    const [x0, y0, W, H] = rect(r0, k), cx = x0 + W / 2, cy = y0 + H / 2, R = W * 0.44, f1 = rnd() * TAU, f2 = rnd() * TAU;
    const bord = (a) => R * (0.8 + 0.12 * Math.sin(3 * a + f1) + 0.08 * Math.sin(5 * a + f2));
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 7; i++) { const a = rnd() * TAU, l = bord(a) * (0.55 + rnd() * 0.35); c.strokeStyle = rgb(P.rameau, 0.75 + rnd() * 0.3); c.lineWidth = W * (0.007 + rnd() * 0.008); c.beginPath(); c.moveTo(cx + (rnd() - 0.5) * W * 0.05, cy + H * 0.05); c.quadraticCurveTo(cx + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * W * 0.1, cy + Math.sin(a) * l * 0.5, cx + Math.cos(a) * l, cy + Math.sin(a) * l); c.stroke(); }
    for (const [part, lum, ext] of [[0.36, 0.58, 1.0], [0.34, 0.8, 0.97], [0.3, 1.0, 0.9]]) {
      const n = Math.round(P.n * part);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, rr = Math.pow(rnd(), 0.62) * ext, px = cx + Math.cos(a) * rr * bord(a), py = cy + Math.sin(a) * rr * bord(a) * 0.96 - (lum > 0.9 ? R * 0.06 : 0);
        const col = P.pal[(rnd() * P.pal.length) | 0], kk = lum * (0.86 + rnd() * 0.26) * (1 + 0.18 * (cy - py) / R);
        const ang = P.pend ? Math.PI / 2 + (rnd() - 0.5) * 0.9 : a + (rnd() - 0.5) * 2.0;
        feuille(c, P, px, py, ang, P.l * k * (0.72 + rnd() * 0.56), col, kk);
      }
    }
    if (P.fruits) for (let i = 0; i < 16; i++) { const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.85, px = cx + Math.cos(a) * rr * bord(a), py = cy + Math.sin(a) * rr * bord(a), col = P.fruits[(i / 4) | 0] || P.fruits[0], r = (3.2 + rnd() * 1.6) * k; c.fillStyle = rgb(col, 0.7); c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill(); c.fillStyle = rgb(col, 1.05); c.beginPath(); c.arc(px - r * 0.2, py - r * 0.2, r * 0.75, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,250,230,.55)'; c.beginPath(); c.arc(px - r * 0.35, py - r * 0.4, r * 0.25, 0, TAU); c.fill(); }
    c.restore();
  }
  function grappeAiguilles(c, r0, P, rnd, k) { // une touffe de rameaux d'épicéa : aiguilles par paires, pousses de l'année plus claires au bout
    const [x0, y0, W, H] = rect(r0, k), cx = x0 + W / 2, cy = y0 + H / 2, R = W * 0.44;
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip(); c.lineCap = 'round';
    for (const [lum, nb] of [[0.6, P.n], [0.82, P.n], [1.0, P.n - 2]]) for (let b = 0; b < nb; b++) {
      const a = (b + rnd() * 0.8) / nb * TAU, l = R * (0.62 + rnd() * 0.36), courbe = 0.25 + rnd() * 0.2, pts = [];
      for (let s = 0; s <= 24; s++) { const t = s / 24; pts.push([cx + Math.cos(a) * l * t, cy + Math.sin(a) * l * t * 0.92 + courbe * l * t * t * 0.5]); }
      c.strokeStyle = rgb(P.rameau, lum); c.lineWidth = 1.4 * k + 0.4; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.stroke();
      const col = P.pal[(rnd() * P.pal.length) | 0], bout = P.pointes[(rnd() * P.pointes.length) | 0];
      for (const [t0, t1, cc, kk] of [[0.08, 0.72, col, lum], [0.7, 1.0, bout, lum]]) {
        c.strokeStyle = rgb(cc, kk * (0.9 + rnd() * 0.2)); c.lineWidth = 1.1 * k + 0.3; c.beginPath();
        for (let s = Math.round(t0 * 24); s < Math.round(t1 * 24); s++) {
          const p = pts[s], q = pts[s + 1], dx = q[0] - p[0], dy = q[1] - p[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, la = (7 + rnd() * 4) * k * (1 - s / 40);
          for (const sg of [-1, 1]) { const ex = ux * 0.55 - sg * uy * 0.83, ey = uy * 0.55 + sg * ux * 0.83; c.moveTo(p[0], p[1]); c.lineTo(p[0] + ex * la, p[1] + ey * la); }
        }
        c.stroke();
      }
    }
    c.restore();
  }
  function rideauSaule(c, r0, P, rnd, k) { // des rameaux pendants couverts de feuilles étroites
    const [x0, y0, W, H] = rect(r0, k);
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip(); c.lineCap = 'round';
    for (const [lum, nb] of [[0.62, 6], [0.85, 6], [1.0, 5]]) for (let s = 0; s < nb; s++) {
      const x = x0 + W * (0.12 + 0.76 * (s + rnd() * 0.8) / nb), bas = y0 + H * (0.72 + rnd() * 0.26), ond = (rnd() - 0.5) * W * 0.18;
      c.strokeStyle = rgb(P.rameau, lum * 0.9); c.lineWidth = 0.9 * k + 0.3; c.beginPath(); c.moveTo(x, y0 + 2 * k); c.quadraticCurveTo(x + ond, (y0 + bas) / 2, x + ond * 0.4, bas); c.stroke();
      for (let y = y0 + 4 * k; y < bas; y += (3.2 + rnd() * 1.6) * k) {
        const t = (y - y0) / (bas - y0), xx = x + ond * 2 * t * (1 - t) + ond * 0.4 * t * t, col = P.pal[(rnd() * P.pal.length) | 0];
        for (const sg of [-1, 1]) if (rnd() < 0.85) feuille(c, P, xx, y, Math.PI / 2 + sg * (0.35 + rnd() * 0.3), P.l * k * (0.6 + rnd() * 0.5), col, lum * (0.88 + rnd() * 0.24));
      }
    }
    c.restore();
  }
  function bande(c, r0, P, rnd, k, vigne) { // une bande de feuillage raccordable en x (haie taillée, rang de vigne palissé)
    const [x0, y0, W, H] = rect(r0, k), f1 = rnd() * TAU, f2 = rnd() * TAU;
    const haut = (x) => H * (vigne ? 0.12 : 0.08) + H * 0.05 * Math.sin(x / W * TAU * 2 + f1) + H * 0.035 * Math.sin(x / W * TAU * 5 + f2);
    const bas = (x) => (vigne ? H * (0.86 + 0.06 * Math.sin(x / W * TAU * 3 + f2)) : H);
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip(); c.lineCap = 'round';
    c.fillStyle = rgb(P.fond); c.beginPath(); c.moveTo(x0, y0 + bas(0) - H * 0.06); for (let x = 0; x <= W; x += 2) c.lineTo(x0 + x, y0 + haut(x) + H * 0.12); for (let x = W; x >= 0; x -= 2) c.lineTo(x0 + x, y0 + bas(x) - H * 0.08); c.closePath(); c.fill();
    if (vigne) { c.strokeStyle = 'rgba(70,64,58,.8)'; c.lineWidth = 1.1 * k; for (const yy of [0.5, 0.78]) { c.beginPath(); c.moveTo(x0, y0 + H * yy); c.lineTo(x0 + W, y0 + H * yy); c.stroke(); } }
    const n = Math.round(W * H / (vigne ? 55 : 30) / k / k);
    for (const [part, lum] of [[0.4, 0.6], [0.33, 0.8], [0.27, 1.0]]) for (let i = 0; i < n * part; i++) {
      const x = rnd() * W, y = haut(x) + rnd() * (bas(x) - haut(x)), col = P.pal[(rnd() * P.pal.length) | 0], kk = lum * (0.86 + rnd() * 0.26) * (1.12 - 0.3 * y / H), l = P.l * k * (0.7 + rnd() * 0.6), ang = rnd() * TAU;
      for (const dx of [-W, 0, W]) if (x + dx > -l && x + dx < W + l) feuille(c, P, x0 + x + dx, y0 + y, ang, l, col, kk);
    }
    if (vigne) for (let g = 0; g < 7; g++) { // des grappes de raisin sous les feuilles
      const gx = (g + rnd() * 0.6) / 7 * W, gy = H * (0.52 + rnd() * 0.18);
      for (let i = 0; i < 14; i++) { const t = i / 14, x = gx + (rnd() - 0.5) * 8 * k * (1 - t * 0.6), y = gy + t * 14 * k, r = (2.1 + rnd() * 0.6) * k, col = P.grains[(rnd() * 3) | 0];
        for (const dx of [-W, 0, W]) { c.fillStyle = rgb(col); c.beginPath(); c.arc(x0 + x + dx, y0 + y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(190,170,210,.45)'; c.beginPath(); c.arc(x0 + x + dx - r * 0.3, y0 + y - r * 0.3, r * 0.35, 0, TAU); c.fill(); } }
    }
    c.restore();
  }
  function ecorce(c, r0, nom, rnd, k) { // une écorce raccordable dans les deux sens (enroulée autour des troncs)
    const [x0, y0, W, H] = rect(r0, k), B = BASE_ECORCE[nom], tore = (f) => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) f(dx, dy); };
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip(); c.fillStyle = rgb(B); c.fillRect(x0, y0, W, H); c.lineCap = 'round';
    const sillons = (n, sombre, clair, l0, l1, pente) => { for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * H, l = (l0 + rnd() * (l1 - l0)) * H, w = (1 + rnd() * 2.2) * k, d = (rnd() - 0.5) * pente * W; tore((dx, dy) => { c.strokeStyle = rgba(B, sombre, 0.85); c.lineWidth = w; c.beginPath(); c.moveTo(x0 + x + dx, y0 + y + dy); c.quadraticCurveTo(x0 + x + dx + d + (rnd() - 0.5) * 4 * k, y0 + y + dy + l / 2, x0 + x + dx + d * 0.3, y0 + y + dy + l); c.stroke(); c.strokeStyle = rgba(B, clair, 0.5); c.lineWidth = w * 0.5; c.beginPath(); c.moveTo(x0 + x + dx + w, y0 + y + dy); c.lineTo(x0 + x + dx + w + d * 0.3, y0 + y + dy + l); c.stroke(); }); } };
    const taches = (n, pal, r0_, r1_) => { for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * H, rx = (r0_ + rnd() * (r1_ - r0_)) * k, ry = rx * (0.6 + rnd() * 0.9), col = pal[(rnd() * pal.length) | 0], m = 7, ph = rnd() * TAU; tore((dx, dy) => { c.fillStyle = rgb(col); c.beginPath(); for (let j = 0; j < m; j++) { const a = j / m * TAU, rr = 0.7 + 0.3 * Math.sin(a * 3 + ph) + rnd() * 0.15; c.lineTo(x0 + x + dx + Math.cos(a) * rx * rr, y0 + y + dy + Math.sin(a) * ry * rr); } c.closePath(); c.fill(); }); } };
    if (nom === 'chene') { sillons(26, 0.45, 1.25, 0.25, 0.7, 0.15); sillons(10, 0.6, 1.2, 0.1, 0.25, 0.4); }
    else if (nom === 'platane') { taches(70, [[214, 206, 172], [168, 164, 118], [196, 192, 168], [142, 138, 96], [226, 220, 196], [176, 170, 130]], 5, 15); taches(25, [[120, 118, 86], [232, 228, 206]], 3, 7); }
    else if (nom === 'tilleul') { sillons(30, 0.6, 1.2, 0.3, 0.9, 0.06); }
    else if (nom === 'peuplier') { sillons(14, 0.62, 1.15, 0.2, 0.6, 0.1); for (let i = 0; i < 26; i++) { const x = rnd() * W, y = rnd() * H, w = (3 + rnd() * 4) * k, h = (8 + rnd() * 10) * k; tore((dx, dy) => { c.fillStyle = rgba(B, 0.42, 0.9); c.beginPath(); c.moveTo(x0 + x + dx, y0 + y + dy - h / 2); c.lineTo(x0 + x + dx + w / 2, y0 + y + dy); c.lineTo(x0 + x + dx, y0 + y + dy + h / 2); c.lineTo(x0 + x + dx - w / 2, y0 + y + dy); c.closePath(); c.fill(); }); } }
    else if (nom === 'saule') { sillons(24, 0.45, 1.2, 0.15, 0.4, 0.6); sillons(16, 0.5, 1.15, 0.1, 0.3, -0.6); }
    else if (nom === 'fruitier') { taches(60, [[74, 64, 54], [104, 92, 78], [84, 72, 60]], 3, 8); taches(16, [[150, 158, 132], [176, 176, 150], [128, 140, 110]], 2, 5); sillons(10, 0.5, 1.2, 0.08, 0.2, 0.8); }
    else if (nom === 'conifere') { for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, w = (8 + rnd() * 14) * k, h = (5 + rnd() * 9) * k, col = [[140, 92, 64], [108, 68, 46], [154, 106, 76], [96, 60, 40]][(rnd() * 4) | 0]; tore((dx, dy) => { c.fillStyle = 'rgba(52,32,22,.9)'; c.fillRect(x0 + x + dx - 1, y0 + y + dy - 1, w + 2, h + 2); c.fillStyle = rgb(col); c.fillRect(x0 + x + dx, y0 + y + dy, w, h); }); } }
    else { for (let i = 0; i < 18; i++) { const x = rnd() * W; tore((dx) => { c.strokeStyle = rgba(B, 0.7 + rnd() * 0.5, 0.6); c.lineWidth = (0.6 + rnd()) * k; c.beginPath(); c.moveTo(x0 + x + dx, y0); c.lineTo(x0 + x + dx + (rnd() - 0.5) * 3 * k, y0 + H); c.stroke(); }); } }
    for (let i = 0; i < 900 * k * k; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.08)'; c.fillRect(x0 + rnd() * W, y0 + rnd() * H, k + 0.5, k + 0.5); }
    c.restore();
  }
  function touffe(c, r0, type, rnd, k) { // une touffe d'herbe vue de côté, posée en bas de la cellule
    const [x0, y0, W, H] = rect(r0, k), VERTS = [[78, 118, 46], [92, 132, 52], [66, 104, 40], [104, 140, 58], [86, 124, 60]], SEC = [[176, 160, 102], [156, 146, 92], [190, 176, 120]];
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip();
    const brin = (bx, len, ang, w, col) => { const tx = bx + Math.sin(ang) * len, ty = y0 + H - Math.cos(ang) * len * 0.96, mx = bx + Math.sin(ang) * len * 0.3, my = y0 + H - len * 0.62, g = c.createLinearGradient(bx, y0 + H, tx, ty); g.addColorStop(0, rgb(col, 0.5)); g.addColorStop(1, rgb(col, 1.12)); c.fillStyle = g; c.beginPath(); c.moveTo(bx - w / 2, y0 + H); c.quadraticCurveTo(mx - w * 0.3, my, tx, ty); c.quadraticCurveTo(mx + w * 0.3, my, bx + w / 2, y0 + H); c.closePath(); c.fill(); return [tx, ty]; };
    const brins = (n, pal, h0, h1, ouv) => { for (let i = 0; i < n; i++) brin(x0 + W / 2 + (rnd() - 0.5) * W * 0.36, H * (h0 + rnd() * (h1 - h0)), (rnd() - 0.5) * ouv, W * (0.022 + rnd() * 0.02), pal[(rnd() * pal.length) | 0]); };
    if (type === 4) { // fougère : frondes arquées aux pinnules alternées
      for (let f = 0; f < 9; f++) { const a = (f / 8 - 0.5) * 2.2 + (rnd() - 0.5) * 0.3, l = H * (0.6 + rnd() * 0.32), col = [[70, 112, 44], [84, 126, 50], [62, 100, 40]][f % 3], bx = x0 + W / 2;
        let px = bx, py = y0 + H; c.strokeStyle = rgb(col, 0.7); c.lineWidth = 1.2 * k + 0.3;
        for (let s = 1; s <= 16; s++) { const t = s / 16, ang = a * (0.4 + t * 0.9), nx = bx + Math.sin(ang) * l * t, ny = y0 + H - Math.cos(ang) * l * t + l * 0.25 * t * t * Math.abs(Math.sin(a)); c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke(); const pl = (1 - t * 0.8) * l * 0.16; for (const sg of [-1, 1]) { c.fillStyle = rgb(col, 0.85 + t * 0.3); c.beginPath(); c.ellipse(nx + Math.cos(ang) * sg * pl * 0.5, ny + Math.sin(ang) * sg * pl * 0.5, pl * 0.55, pl * 0.18 + 0.5, ang + sg * 0.3, 0, TAU); c.fill(); } px = nx; py = ny; } }
    } else if (type === 5) brins(34, SEC.concat([[120, 128, 70]]), 0.4, 0.8, 1.3);
    else {
      brins(type === 3 ? 26 : 38, VERTS, type === 3 ? 0.3 : 0.45, type === 3 ? 0.62 : 0.92, 1.1);
      if (type === 1) for (let i = 0; i < 6; i++) { const [tx, ty] = brin(x0 + W / 2 + (rnd() - 0.5) * W * 0.3, H * (0.8 + rnd() * 0.18), (rnd() - 0.5) * 0.7, W * 0.012, [150, 150, 90]); c.fillStyle = rgb([196, 182, 122], 0.85 + rnd() * 0.3); c.beginPath(); c.ellipse(tx, ty + 6 * k, 2.4 * k, 7 * k, 0, 0, TAU); c.fill(); }
      if (type === 2) for (let i = 0; i < 7; i++) { // pâquerettes et boutons d'or
        const fx = x0 + W * (0.2 + rnd() * 0.6), fy = y0 + H * (0.18 + rnd() * 0.4), jaune = i % 3 === 2;
        c.strokeStyle = 'rgb(84,120,52)'; c.lineWidth = 1.1 * k; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + (rnd() - 0.5) * 6 * k, y0 + H); c.stroke();
        const r = (jaune ? 4.2 : 5.2) * k; for (let p = 0; p < (jaune ? 5 : 11); p++) { const a = p / (jaune ? 5 : 11) * TAU; c.fillStyle = jaune ? 'rgb(246,204,40)' : 'rgb(250,248,240)'; c.beginPath(); c.ellipse(fx + Math.cos(a) * r * 0.6, fy + Math.sin(a) * r * 0.45, r * (jaune ? 0.5 : 0.55), r * (jaune ? 0.45 : 0.18), a, 0, TAU); c.fill(); }
        c.fillStyle = jaune ? 'rgb(214,160,20)' : 'rgb(244,196,40)'; c.beginPath(); c.arc(fx, fy, r * 0.28, 0, TAU); c.fill();
      }
      if (type === 3) for (let i = 0; i < 9; i++) { // trèfle : feuilles rondes et têtes roses
        const fx = x0 + W * (0.15 + rnd() * 0.7), fy = y0 + H * (0.45 + rnd() * 0.4);
        for (let p = 0; p < 3; p++) { const a = p / 3 * TAU - Math.PI / 2; c.fillStyle = 'rgb(74,116,46)'; c.beginPath(); c.arc(fx + Math.cos(a) * 3 * k, fy + Math.sin(a) * 2 * k, 3 * k, 0, TAU); c.fill(); }
        if (i % 2 === 0) { const hx = fx + (rnd() - 0.5) * 6 * k, hy = fy - (10 + rnd() * 14) * k; c.strokeStyle = 'rgb(84,116,56)'; c.lineWidth = k; c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, fy); c.stroke(); for (let p = 0; p < 16; p++) { const a = rnd() * TAU, rr = rnd() * 4.5 * k; c.fillStyle = rnd() < 0.5 ? 'rgb(214,120,170)' : 'rgb(236,160,200)'; c.beginPath(); c.arc(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 1.5 * k, 0, TAU); c.fill(); } }
      }
    }
    c.restore();
  }
  // l'imposteur d'une espèce : la silhouette proche vue de côté, peinte avec les mêmes grappes (assombries vers l'arrière) et le même bois
  function imposteur(c, r0, sil, esp, k, sources) {
    const [x0, y0, W, H] = rect(r0, k), rh = R_H[esp] / sil.R0; let Rm = 0, ym = 0;
    for (const g of sil.grappes) { Rm = Math.max(Rm, Math.abs(g.x) + g.s * g.ax * 0.45, Math.abs(g.z) + g.s * g.ax * 0.45); ym = Math.max(ym, g.mode === 2 ? g.y : g.y + g.s * g.ay * rh * 0.5); }
    sil.Rm = Rm; sil.ym = ym * 1.02;
    const X = (x) => x0 + W / 2 + x / Rm * W / 2, Y = (y) => y0 + H - y / sil.ym * H, sx = W / 2 / Rm, sy = H / sil.ym, B = BASE_ECORCE[ECORCES[esp]];
    c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip(); c.lineCap = 'round';
    for (const t of sil.tiges) for (let i = 0; i + 1 < t.pts.length; i++) { const a = t.pts[i], b = t.pts[i + 1]; c.strokeStyle = rgb(B, 0.62); c.lineWidth = Math.max(1, (t.rays[i] + t.rays[i + 1]) * sx); c.beginPath(); c.moveTo(X(a[0]), Y(a[1])); c.lineTo(X(b[0]), Y(b[1])); c.stroke(); }
    const ordre = sil.grappes.slice().sort((a, b) => a.z - b.z), src = sources[esp], niv = src.niveaux.length;
    for (const g of ordre) {
      const prof = (g.z / Rm + 1) / 2, lum = borne((0.5 + 0.5 * prof) * (0.55 + 0.45 * g.occ), 0, 1), cv = src.niveaux[Math.min(niv - 1, Math.round(lum * (niv - 1)))];
      if (g.mode === 2) { const w = g.s * g.ax * sx, h = g.s * rh * sy; c.drawImage(src.rideau ? cv.rideau : cv, X(g.x) - w / 2, Y(g.y), w, h); continue; }
      const w = g.s * g.ax * sx, h = g.s * g.ay * rh * sy, ca = Math.cos(g.rot), sa = Math.sin(g.rot);
      c.setTransform(ca, sa, -sa, ca, X(g.x), Y(g.y)); c.drawImage(cv, -w / 2, -h / 2, w, h); c.setTransform(1, 0, 0, 1, 0, 0);
    }
    c.restore();
  }
  const ATLAS = new Map(); // taille → { data, S, moyHerbe } (gardé : une seconde création ne repeint rien)
  function peindreAtlas(S, sils) {
    const k = S / 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d', { willReadFrequently: true }), rnd = mulberry32(2024);
    FEUILLES.forEach((P, e) => (P.aiguilles ? grappeAiguilles : grappeFeuilles)(c, CEL.feuilles[e], P, rnd, k));
    rideauSaule(c, CEL.rideau, FEUILLES[4], rnd, k);
    bande(c, CEL.haie, HAIE, rnd, k, false); bande(c, CEL.vigne, VIGNE, rnd, k, true);
    ECORCES.forEach((nom, i) => ecorce(c, CEL.ecorce[i], nom, rnd, k));
    CEL.herbe.forEach((r, i) => touffe(c, r, i, rnd, k));
    // les imposteurs : copies assombries des grappes (pas de filtre canvas : Safari ne le connaît pas)
    const sources = FEUILLES.map((P, e) => {
      const [x, y, w, h] = rect(CEL.feuilles[e], k), niveaux = [];
      for (const l of [0.42, 0.56, 0.7, 0.85, 1]) { const t = document.createElement('canvas'); t.width = w; t.height = h; const tc = t.getContext('2d'); tc.drawImage(cv, x, y, w, h, 0, 0, w, h); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = `rgba(0,0,0,${1 - l})`; tc.fillRect(0, 0, w, h);
        if (e === 4) { const [rx, ry, rw, rh2] = rect(CEL.rideau, k), t2 = document.createElement('canvas'); t2.width = rw; t2.height = rh2; const c2 = t2.getContext('2d'); c2.drawImage(cv, rx, ry, rw, rh2, 0, 0, rw, rh2); c2.globalCompositeOperation = 'source-atop'; c2.fillStyle = `rgba(0,0,0,${1 - l})`; c2.fillRect(0, 0, rw, rh2); t.rideau = t2; }
        niveaux.push(t); }
      return { niveaux, rideau: e === 4 };
    });
    for (let e = 0; e < 7; e++) imposteur(c, CEL.imp[e], sils[FAM[e]], e, k, sources);
    // les octets : couleurs prolongées sous l'alpha (moyenne de la cellule), lignes retournées (v = 0 en bas, comme une CanvasTexture)
    const img = c.getImageData(0, 0, S, S).data, alphas = CEL.feuilles.concat([CEL.haie, CEL.vigne, CEL.rideau], CEL.imp, CEL.herbe);
    let moyHerbe = [0.1, 0.2, 0.05];
    for (const r of alphas) {
      const [x0, y0, w, h] = rect(r, k).map(Math.round); let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * S + x) * 4; if (img[o + 3] > 160) { sr += LIN[img[o]]; sg += LIN[img[o + 1]]; sb += LIN[img[o + 2]]; n++; } }
      if (!n) continue; const m = [sr / n, sg / n, sb / n], ms = m.map((v) => Math.round(255 * Math.pow(v, 1 / 2.2)));
      if (r === CEL.herbe[0]) moyHerbe = m;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * S + x) * 4; if (img[o + 3] < 24) { img[o] = ms[0]; img[o + 1] = ms[1]; img[o + 2] = ms[2]; } }
    }
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) data.set(img.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    return { data, S, moyHerbe };
  }
  function cellule(r, S) { const k = S / 1024, m = 0.5 / S; return new THREE.Vector4(r[0] * k / S + m, 1 - (r[1] + r[3]) * k / S + m, r[2] * k / S - 2 * m, r[3] * k / S - 2 * m); } // (u0, v0, du, dv), un demi-texel de marge

  // ═══════════════════════════════ les shaders (onBeforeCompile sur Lambert et Depth) ═══════════════════════════════
  const VENT = `float ph_ = iDon.w * 6.2832 + dot(instanceMatrix[3].xz, vec2(0.071, 0.053));
float bal_ = sin(uTemps * 0.83 + ph_) * 0.62 + sin(uTemps * 1.97 + ph_ * 1.3) * 0.38;`;
  const WORLDPOS = `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
vec4 worldPosition = vegM;
#endif`;
  // les arbres proches et moyens : écorce et grappes (tournées vers la caméra, ou pendantes) ; moyen : la couronne générique déformée
  function vertexArbre(vs, moyen, ombre) {
    const ent = `uniform float uTemps; uniform vec2 uVent; uniform vec4 uCelF[8]; uniform vec4 uCelB[8]; uniform vec4 uCelS[8]; uniform vec4 uForme[8];
attribute vec4 iDon; attribute vec4 aFeu; attribute float aOcc;${ombre ? '' : '\nvarying float vEnv;'}\n`;
    vs = ent + vs.replace('#include <uv_vertex>', `#ifdef USE_MAP
int e_ = int(iDon.x + 0.5); vec4 ce_ = aFeu.w < 0.5 ? uCelB[e_] : (aFeu.w < 1.5 ? uCelF[e_] : uCelS[e_]);
vMapUv = ce_.xy + uv * ce_.zw;
#endif`).replace('#include <begin_vertex>', `#include <begin_vertex>
float tK_ = 1.0;
${moyen ? `{ vec4 fo_ = uForme[int(iDon.x + 0.5)];
  if (aFeu.w > 0.5) { float t_ = transformed.y, q_ = 2.0 * t_ - 1.0; float p_ = mix(sqrt(max(0.0, 1.0 - q_ * q_)), 1.04 - t_, fo_.z);
    p_ = mix(p_, max(p_, 0.9), fo_.w * (1.0 - smoothstep(0.45, 0.75, t_))); transformed.xz *= p_; transformed.y = mix(fo_.x, fo_.y, t_); tK_ = 0.55 + 0.45 * p_; }
  else transformed.y *= fo_.x + 0.1; }` : ''}`).replace('#include <project_vertex>', `vec3 sc_ = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vec4 vegM = modelMatrix * (instanceMatrix * vec4(transformed, 1.0));
float hN_ = max(transformed.y, 0.0);
${VENT}
vegM.xz += iDon.yz * (hN_ * hN_ * sc_.y) + uVent * (bal_ * 0.011 * hN_ * hN_ * sc_.y);
vec4 mvPosition;
if (aFeu.w > 0.5) {
  float s_ = aFeu.z * sc_.x * tK_;
  float fr_ = sin(uTemps * 3.7 + ph_ * 2.0 + (transformed.x + transformed.z) * 23.0 + transformed.y * 17.0);
  vegM.xyz += vec3(uVent.x, 0.4, uVent.y) * (fr_ * 0.03 * s_);
  if (aFeu.w < 1.5) { mvPosition = viewMatrix * vegM; mvPosition.xy += aFeu.xy * s_; }
  else { vec3 vc_ = cameraPosition - vegM.xyz; vec3 dr_ = normalize(vec3(vc_.z, 0.0, -vc_.x) + vec3(1e-5, 0.0, 0.0));
    vegM.xyz += dr_ * (aFeu.x * s_) + vec3(0.0, aFeu.y * s_, 0.0);
    vegM.xz += uVent * (sin(uTemps * 1.6 + ph_ + transformed.x * 31.0) * 0.12 * max(0.0, -aFeu.y) * s_);
    mvPosition = viewMatrix * vegM; }
} else mvPosition = viewMatrix * vegM;
gl_Position = projectionMatrix * mvPosition;`);
    if (ombre) return vs;
    return vs.replace('#include <color_vertex>', `#ifdef USE_INSTANCING_COLOR
vColor = vec3(aOcc) * (aFeu.w > 0.5 ? instanceColor.rgb : vec3(1.0));
#endif`).replace('#include <normal_vertex>', `vEnv = aFeu.w > 0.5 ? 0.55 : 0.12;
if (aFeu.w > 0.5 && aFeu.w < 1.5) transformedNormal = normalize(normalize(transformedNormal) + vec3(aFeu.xy * 0.7, 0.0));
#include <normal_vertex>`).replace('#include <worldpos_vertex>', WORLDPOS);
  }
  function vertexLoin(vs) { // le panneau imposteur : vertical, tourné vers la caméra autour de son pied
    return `uniform float uTemps; uniform vec2 uVent; uniform vec4 uCelI[8]; uniform vec4 uLoinK[8];
attribute vec4 iDon; varying float vEnv;\n` + vs.replace('#include <uv_vertex>', `#ifdef USE_MAP
vMapUv = uCelI[int(iDon.x + 0.5)].xy + uv * uCelI[int(iDon.x + 0.5)].zw;
#endif`).replace('#include <defaultnormal_vertex>', `vec3 b0_ = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz; vec3 v0_ = cameraPosition - b0_; v0_.y = 0.0; v0_ = normalize(v0_ + vec3(1e-5, 0.0, 0.0));
vec3 transformedNormal = normalize((viewMatrix * vec4(normalize(v0_ * 0.75 + vec3(v0_.z, 0.0, -v0_.x) * position.x * 1.3 + vec3(0.0, 0.2 + position.y * 0.6, 0.0)), 0.0)).xyz);
vEnv = 0.5;`).replace('#include <project_vertex>', `vec3 sc_ = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 0.0); vec4 lk_ = uLoinK[int(iDon.x + 0.5)];
vec3 vc_ = cameraPosition - b0_; vec3 dr_ = normalize(vec3(vc_.z, 0.0, -vc_.x) + vec3(1e-5, 0.0, 0.0));
${VENT}
float hN_ = transformed.y * lk_.y;
vec4 vegM = vec4(b0_ + dr_ * (transformed.x * 2.0 * lk_.x * sc_.x) + vec3(0.0, hN_ * sc_.y, 0.0), 1.0);
vegM.xz += iDon.yz * (hN_ * hN_ * sc_.y) + uVent * (bal_ * 0.011 * hN_ * hN_ * sc_.y);
vec4 mvPosition = viewMatrix * vegM; gl_Position = projectionMatrix * mvPosition;`).replace('#include <worldpos_vertex>', WORLDPOS);
  }
  function vertexLigne(vs, ombre) { // les tronçons de haie et de vigne : feuillage (de la base iDon.y au sommet), piquet et cep en bois
    vs = `uniform float uTemps; uniform vec2 uVent; uniform vec4 uCelL[2]; uniform vec4 uCelP;
attribute vec4 iDon; attribute vec4 aFeu; attribute float aOcc;${ombre ? '' : ' varying float vEnv;'}\n` + vs.replace('#include <uv_vertex>', `#ifdef USE_MAP
vMapUv = aFeu.w > 0.5 ? uCelL[int(iDon.x + 0.5)].xy + uv * uCelL[int(iDon.x + 0.5)].zw : uCelP.xy + uv * uCelP.zw;
#endif`).replace('#include <begin_vertex>', `#include <begin_vertex>
if (aFeu.w > 0.5) transformed.y = mix(iDon.y, 1.0, transformed.y); else if (aFeu.x > 0.5) transformed.y *= iDon.y + 0.06;`).replace('#include <project_vertex>', `vec4 vegM = modelMatrix * (instanceMatrix * vec4(transformed, 1.0));
${VENT}
if (aFeu.w > 0.5) vegM.xyz += vec3(uVent.x, 0.3, uVent.y) * (sin(uTemps * 2.9 + ph_ + transformed.x * 9.0 + transformed.y * 5.0) * 0.025 * transformed.y);
vec4 mvPosition = viewMatrix * vegM; gl_Position = projectionMatrix * mvPosition;`);
    if (ombre) return vs;
    return vs.replace('#include <color_vertex>', `#ifdef USE_INSTANCING_COLOR
vColor = vec3(aOcc) * (aFeu.w > 0.5 ? instanceColor.rgb : vec3(1.0));
#endif`).replace('#include <normal_vertex>', 'vEnv = aFeu.w > 0.5 ? 0.45 : 0.1;\n#include <normal_vertex>').replace('#include <worldpos_vertex>', WORLDPOS);
  }
  function vertexHerbe(vs) { // les touffes : normale vers le ciel (éclairées comme le sol), vent en haut, enfoncées avec la distance
    return `uniform float uTemps; uniform vec2 uVent; uniform vec4 uCelH[6]; uniform float uHerbeR;
attribute vec4 iDon; varying float vEnv;\n` + vs.replace('#include <uv_vertex>', `#ifdef USE_MAP
vMapUv = uCelH[int(iDon.x + 0.5)].xy + uv * uCelH[int(iDon.x + 0.5)].zw;
#endif`).replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0); vEnv = 0.35;').replace('#include <project_vertex>', `vec3 b_ = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
vec4 vegM = modelMatrix * (instanceMatrix * vec4(transformed, 1.0));
float k_ = 1.0 - smoothstep(uHerbeR * 0.55, uHerbeR, distance(b_.xz, cameraPosition.xz));
vegM.xyz = b_ + (vegM.xyz - b_) * vec3(0.6 + 0.4 * k_, k_, 0.6 + 0.4 * k_);
float ph_ = dot(b_.xz, vec2(0.37, 0.23)) + iDon.w * 6.28;
vegM.xz += uVent * ((sin(uTemps * 2.1 + ph_) * 0.6 + sin(uTemps * 3.4 + ph_ * 1.7) * 0.4) * 0.07 * uv.y * uv.y * k_);
vec4 mvPosition = viewMatrix * vegM; gl_Position = projectionMatrix * mvPosition;`).replace('#include <worldpos_vertex>', WORLDPOS);
  }
  // le fragment commun : alpha conservé au loin (le seuil suit le niveau de mipmap), normales non retournées sur les faces arrière,
  // lumière enveloppante (vEnv) et transparence à contre-jour
  function fragmentVeg(fs) {
    const lam = THREE.ShaderChunk.lights_lambert_pars_fragment.replace('float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', 'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + vEnv ) / ( 1.0 + vEnv ) );')
      .replace('vec3 irradiance = dotNL * directLight.color;', 'vec3 irradiance = ( dotNL + vEnv * 0.6 * pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 3.0 ) ) * directLight.color;');
    return 'varying float vEnv; uniform float uTexel;\n' + fs.replace('#include <alphatest_fragment>', `#ifdef USE_ALPHATEST
#ifdef USE_MAP
{ vec2 tx_ = vMapUv * uTexel; vec2 dx_ = dFdx(tx_), dy_ = dFdy(tx_); float lod_ = max(0.0, 0.5 * log2(max(dot(dx_, dx_), dot(dy_, dy_)))); diffuseColor.a *= 1.0 + lod_ * 0.28; }
#endif
if ( diffuseColor.a < alphaTest ) discard;
#endif`).replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')).replace('#include <lights_lambert_pars_fragment>', lam);
  }

  // ═══════════════════════════════ outils du plan ═══════════════════════════════
  const aire = (p) => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  function poly(p) { if (!Array.isArray(p)) return null; const q = []; for (const pt of p) { if (!pt) continue; const x = +pt[0], z = +pt[1]; if (fini(x) && fini(z)) q.push([x, z]); } return q.length >= 3 && Math.abs(aire(q)) > 0.01 ? q : null; }
  function dansPoly(p, x, z) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
  function d2Seg(px, pz, ax, az, bx, bz) { const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez; let t = l > 0 ? ((px - ax) * ex + (pz - az) * ez) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = ax + t * ex - px, dz = az + t * ez - pz; return dx * dx + dz * dz; }
  function axe(p, sens) { // la direction des rangs : sens donné, sinon l'arête qui donne le rectangle englobant le plus petit (son côté long)
    if (fini(+sens)) return [Math.cos(+sens), Math.sin(+sens)];
    let best = null;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; let ux = b[0] - a[0], uz = b[1] - a[1]; const l = Math.hypot(ux, uz); if (l < 0.5) continue; ux /= l; uz /= l; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best[0]) best = [ar, u1 - u0 >= v1 - v0 ? [ux, uz] : [-uz, ux]]; }
    return best ? best[1] : [1, 0];
  }
  function rangs(p, u, ecart, marge, f) { // les rangs parallèles à u, espacés de ecart, coupés par le polygone : f(ax, az, bx, bz)
    const ux = u[0], uz = u[1], vx = -uz, vz = ux; let v0 = Infinity, v1 = -Infinity; for (const q of p) { const v = q[0] * vx + q[1] * vz; v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    for (let o = v0 + ecart / 2; o < v1; o += ecart) {
      const ox = vx * o, oz = vz * o, ts = [];
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], den = ux * ez - uz * ex; if (Math.abs(den) < 1e-9) continue; const t = ((a[0] - ox) * ez - (a[1] - oz) * ex) / den, s = ((a[0] - ox) * uz - (a[1] - oz) * ux) / den; if (s >= 0 && s < 1) ts.push(t); }
      ts.sort((a, b) => a - b); for (let k = 0; k + 1 < ts.length; k += 2) if (ts[k + 1] - ts[k] > 2 * marge + 0.5) f(ox + ux * (ts[k] + marge), oz + uz * (ts[k] + marge), ox + ux * (ts[k + 1] - marge), oz + uz * (ts[k + 1] - marge));
    }
  }

  // ═══════════════════════════════ creer ═══════════════════════════════
  function creer(carte, monde, opts) {
    if (!OK || !carte || !monde) return null;
    opts = opts || {};
    const L = fini(+carte.taille) && carte.taille > 0 ? +carte.taille : monde.L || 600, X0 = -L / 2, rnd = mulberry32(17);
    const H0 = (x, z) => { try { const h = monde.hauteur(x, z); return fini(h) ? h : 0; } catch (e) { return 0; } };
    let nomQ = QUALITES[opts.qualite] ? opts.qualite : 'moyenne', Q = QUALITES[nomQ], libere = false;
    const dossier = typeof opts.dossier === 'string' ? opts.dossier : typeof window !== 'undefined' && window.PONCIN_CARTE_DOSSIER ? window.PONCIN_CARTE_DOSSIER : 'carte/';
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

    // ─── le masque du sol (1 case par mètre) : bloqué (rues, bâtiments, eau, sols durs), densité et genre de l'herbe ───
    const PAS = Math.max(1, L / 1024), N = Math.ceil(L / PAS), BLOQ = new Uint8Array(N * N), DENS = new Uint8Array(N * N), GENRE = new Uint8Array(N * N);
    let PHOTO = null, COUL = null; // densité d'après la photo (vert), couleur du sol tous les 2 cases (rgb)
    const caseDe = (x, z) => { const i = Math.floor((x - X0) / PAS), j = Math.floor((z - X0) / PAS); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
    function remplir(p, f) { // balayage par lignes : f(indice) pour chaque case dont le centre est dans p
      let z0 = Infinity, z1 = -Infinity; for (const q of p) { z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
      const xs = [];
      for (let j = Math.max(0, Math.floor((z0 - X0) / PAS)); j <= Math.min(N - 1, Math.ceil((z1 - X0) / PAS)); j++) {
        const z = X0 + (j + 0.5) * PAS; xs.length = 0;
        for (let i = 0, k = p.length - 1; i < p.length; k = i++) { const a = p[i], b = p[k]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort((a, b) => a - b);
        for (let m = 0; m + 1 < xs.length; m += 2) for (let i = Math.max(0, Math.ceil((xs[m] - X0) / PAS - 0.5)); i <= Math.min(N - 1, Math.floor((xs[m + 1] - X0) / PAS - 0.5)); i++) f(j * N + i);
      }
    }
    function trait(l, w, f) { // une polyligne épaisse
      for (let s = 0; s + 1 < l.length; s++) {
        const a = l[s], b = l[s + 1]; if (!a || !b || !fini(+a[0]) || !fini(+a[1]) || !fini(+b[0]) || !fini(+b[1])) continue; const ax = +a[0], az = +a[1], bx = +b[0], bz = +b[1], r = w / 2, r2 = r * r;
        for (let j = Math.max(0, Math.floor((Math.min(az, bz) - r - X0) / PAS)); j <= Math.min(N - 1, Math.floor((Math.max(az, bz) + r - X0) / PAS)); j++) for (let i = Math.max(0, Math.floor((Math.min(ax, bx) - r - X0) / PAS)); i <= Math.min(N - 1, Math.floor((Math.max(ax, bx) + r - X0) / PAS)); i++) if (d2Seg(X0 + (i + 0.5) * PAS, X0 + (j + 0.5) * PAS, ax, az, bx, bz) <= r2) f(j * N + i);
      }
    }
    const ZONE = { pre: [215, 1], jardin: [185, 2], verger: [205, 1], vigne: [120, 4], bois: [120, 3] }; // densité, genre (1 pré, 2 jardin, 3 bois, 4 vigne)
    for (const v of carte.vegetation || []) { const z = v && ZONE[v.t], p = z && poly(v.p); if (p) remplir(p, (k) => { if (z[0] >= DENS[k]) { DENS[k] = z[0]; GENRE[k] = z[1]; } }); }
    const DURS = { asphalte: 1, paves: 1, gravier: 1, parking: 1, terre: 1, beton: 1 };
    for (const s of carte.surfaces || []) { const p = s && poly(s.p); if (!p) continue; if (DURS[s.t]) remplir(p, (k) => { BLOQ[k] |= 8; }); else if (s.t === 'herbe' || s.t === 'terrain') remplir(p, (k) => { DENS[k] = Math.max(DENS[k], 235); if (!GENRE[k]) GENRE[k] = 1; }); else if (s.t === 'cimetiere') remplir(p, (k) => { DENS[k] = Math.max(DENS[k], 60); }); }
    for (const r of carte.rues || []) if (r && Array.isArray(r.l)) trait(r.l, (fini(+r.w) ? +r.w : 5) + 0.8, (k) => { BLOQ[k] |= 1; });
    for (const pt of carte.ponts || []) if (pt && Array.isArray(pt.l)) trait(pt.l, (fini(+pt.w) ? +pt.w : 6) + 1, (k) => { BLOQ[k] |= 1; });
    for (const b of monde.batiments || carte.batiments || []) { const p = b && poly(b.p); if (p) remplir(p, (k) => { BLOQ[k] |= 2; }); }
    for (const e of carte.eau || []) { const p = e && poly(e.p); if (p) remplir(p, (k) => { BLOQ[k] |= 4; }); }
    const bloque = (x, z, m) => { const k = caseDe(x, z); return k < 0 || (BLOQ[k] & m) !== 0; };

    // ─── les arbres : réels, puis vergers vides et bois semés ───
    const liste = []; // [x, z, h, r, esp, bois]
    const bois = (carte.vegetation || []).filter((v) => v && v.t === 'bois').map((v) => ({ p: poly(v.p), e: typeof v.e === 'string' ? v.e : typeof v.feuilles === 'string' ? v.feuilles : '' })).filter((b) => b.p);
    const coniferes = (e) => /conif|resin|needle/i.test(e), mixte = (e) => /mixt|mixed/i.test(e);
    const ajouter = (x, z, h, r, e, b) => { if (!fini(x) || !fini(z) || Math.abs(x) > L / 2 || Math.abs(z) > L / 2) return; h = borne(fini(h) && h > 1 ? h : 8, 1.5, 45); r = fini(r) && r > 0.3 ? borne(r, h * 0.1, h * 0.8) : h * R_H[e] * (0.9 + rnd() * 0.2); liste.push([x, z, h, r, e, b]); };
    for (const a of carte.arbres || []) {
      if (!Array.isArray(a)) continue; const x = +a[0], z = +a[1]; if (!fini(x) || !fini(z)) continue; let e = espece(a[4]);
      if (e < 0) { e = 0; for (const b of bois) if (coniferes(b.e) && dansPoly(b.p, x, z)) { e = 6; break; } }
      if (bloque(x, z, 2)) continue; // un arbre dans un bâtiment : une erreur des données
      ajouter(x, z, +a[2], +a[3], e, 0);
    }
    for (const v of carte.vegetation || []) { // les vergers sans arbre réel : des fruitiers en grille
      if (!v || v.t !== 'verger') continue; const p = poly(v.p); if (!p) continue;
      if ((carte.arbres || []).some((a) => Array.isArray(a) && dansPoly(p, +a[0], +a[1]))) continue;
      rangs(p, axe(p, v.sens), 7, 2.5, (ax, az, bx, bz) => { const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(l / 6)); for (let k = 0; k <= n; k++) { const t = n ? k / n : 0.5, x = ax + (bx - ax) * t + (rnd() - 0.5) * 0.6, z = az + (bz - az) * t + (rnd() - 0.5) * 0.6; if (!bloque(x, z, 7)) { const h = 3.8 + rnd() * 1.7; ajouter(x, z, h, h * (0.5 + rnd() * 0.12), 5, 0); } } });
    }
    { const A = carte.zones && carte.zones.arene, ac = A && Array.isArray(A.centre) ? A.centre : [0, 0], ar = A && fini(+A.rayon) ? +A.rayon : 110; let n = 0; // les bois : un semis irrégulier, plus clair dans l'arène
      for (const b of bois) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
        const pc = coniferes(b.e) ? 0.9 : mixte(b.e) ? 0.4 : 0.04;
        for (let z = z0; z <= z1 && n < 4000; z += 7.5) for (let x = x0; x <= x1 && n < 4000; x += 7.5) {
          const jx = x + (rnd() - 0.5) * 6, jz = z + (rnd() - 0.5) * 6, r1 = rnd(), r2 = rnd(), r3 = rnd();
          if (Math.hypot(jx - ac[0], jz - ac[1]) < ar + 10 && r1 < 0.55) continue;
          if (!dansPoly(b.p, jx, jz) || bloque(jx, jz, 7)) continue;
          const e = r2 < pc ? 6 : 0; ajouter(jx, jz, (e === 6 ? 12 : 10) + r3 * 9, NaN, e, 1); n++;
        }
      }
    }
    const NA = liste.length;
    const AX = new Float32Array(NA), AY = new Float32Array(NA), AZ = new Float32Array(NA), AH = new Float32Array(NA), AR = new Float32Array(NA), AE = new Uint8Array(NA);
    const MATP = new Float32Array(NA * 16), MATM = new Float32Array(NA * 16), DON = new Float32Array(NA * 4), COLA = new Float32Array(NA * 3), D2 = new Float32Array(NA);
    const comptes = [0, 0, 0, 0, 0, 0, 0];
    { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
      liste.forEach((a, i) => {
        const [x, z, h, r, e, b] = a, R0 = [0.36, 0.16, 0.44, 0.24][FAM[e]], tr = r * 0.12 + 0.3;
        const y = Math.min(H0(x, z), H0(x + tr, z), H0(x - tr, z), H0(x, z + tr), H0(x, z - tr)) - 0.12, rot = rnd() * TAU, an = 0.92 + rnd() * 0.16;
        AX[i] = x; AY[i] = y; AZ[i] = z; AH[i] = h; AR[i] = r; AE[i] = e; comptes[e]++;
        q.setFromAxisAngle(Y, rot); p.set(x, y, z);
        s.set(r / R0 * an, h, r / R0 / an); m.compose(p, q, s); m.toArray(MATP, i * 16);
        s.set(r * an, h, r / an); m.compose(p, q, s); m.toArray(MATM, i * 16);
        const pa = rnd() * TAU, pm = PENCHE[e] * (0.3 + rnd() * 0.7); DON[i * 4] = e; DON[i * 4 + 1] = Math.cos(pa) * pm; DON[i * 4 + 2] = Math.sin(pa) * pm; DON[i * 4 + 3] = rnd();
        const v = rnd(), l = (0.86 + rnd() * 0.26) * (b ? 0.93 : 1); COLA[i * 3] = l * (0.9 + 0.2 * v); COLA[i * 3 + 1] = l * (0.96 + 0.08 * rnd()); COLA[i * 3 + 2] = l * (0.86 + 0.22 * (1 - v));
      });
    }

    // ─── haies et rangs de vigne : des tronçons de ~2,2 m qui suivent le terrain ───
    const troncons = []; // [ax, az, bx, bz, h, w, type (0 haie, 1 vigne), base]
    const decouper = (ax, az, bx, bz, h, w, type, base, pas, ext) => { const l = Math.hypot(bx - ax, bz - az); if (l < 0.3) return; const ux = (bx - ax) / l, uz = (bz - az) / l, n = Math.max(1, Math.round(l / pas)); for (let k = 0; k < n; k++) { const s0 = k / n * l - (k === 0 ? ext : 0), s1 = (k + 1) / n * l + (k === n - 1 ? ext : 0.05); troncons.push([ax + ux * s0, az + uz * s0, ax + ux * s1, az + uz * s1, h, w, type, base]); } };
    for (const hz of carte.haies || []) { if (!hz || !Array.isArray(hz.l)) continue; const h = fini(+hz.h) && hz.h > 0.3 ? borne(+hz.h, 0.4, 6) : 1.6, w = fini(+hz.w) && hz.w > 0.2 ? borne(+hz.w, 0.3, 4) : 1.0; for (let s = 0; s + 1 < hz.l.length; s++) { const a = hz.l[s], b = hz.l[s + 1]; if (a && b && fini(+a[0]) && fini(+a[1]) && fini(+b[0]) && fini(+b[1])) decouper(+a[0], +a[1], +b[0], +b[1], h, w, 0, 0, 2.2, w * 0.4); } }
    for (const v of carte.vegetation || []) { if (!v || v.t !== 'vigne') continue; const p = poly(v.p); if (!p) continue; rangs(p, axe(p, v.sens), 2.0, 0.8, (ax, az, bx, bz) => { if (troncons.length < 12000) decouper(ax, az, bx, bz, 1.45, 0.5, 1, 0.3, 2.4, 0); }); }
    const NL = troncons.length, MATL = new Float32Array(NL * 16), DONL = new Float32Array(NL * 4), COLL = new Float32Array(NL * 3), LX = new Float32Array(NL), LZ = new Float32Array(NL), LY = new Float32Array(NL), LR = new Float32Array(NL);
    { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
      troncons.forEach((t, i) => { const [ax, az, bx, bz, h, w, type, base] = t, l = Math.hypot(bx - ax, bz - az), ya = H0(ax, az), yb = H0(bx, bz); e.set(0, Math.atan2(-(bz - az), bx - ax), Math.atan2(yb - ya, l), 'YXZ'); q.setFromEuler(e); p.set(ax, ya - 0.08, az); s.set(l, h, w); m.compose(p, q, s); m.toArray(MATL, i * 16);
        DONL[i * 4] = type; DONL[i * 4 + 1] = base; DONL[i * 4 + 3] = rnd(); const v = 0.9 + rnd() * 0.18; COLL[i * 3] = v * (0.96 + rnd() * 0.08); COLL[i * 3 + 1] = v; COLL[i * 3 + 2] = v * (0.94 + rnd() * 0.1);
        LX[i] = (ax + bx) / 2; LZ[i] = (az + bz) / 2; LY[i] = (ya + yb) / 2 + h / 2; LR[i] = l / 2 + h; });
    }

    // ─── les silhouettes, l'atlas, les matériaux ───
    const sils = [0, 1, 2, 3].map((f) => silhouette(f, mulberry32(101 + f * 7))), moy = geoMoyen(), loin = geoLoin(), lig = geoLigne(), herbe = geoHerbe();
    let A = ATLAS.get(Q.atlas); if (!A) { A = peindreAtlas(Q.atlas, sils); ATLAS.set(Q.atlas, A); } else for (let e = 0; e < 7; e++) { const s = sils[FAM[e]]; if (!s.Rm) imposteurMesure(s, e); }
    const S = A.S, tex = new THREE.DataTexture(A.data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4; tex.flipY = false; tex.needsUpdate = true;
    const V8 = (f) => [0, 1, 2, 3, 4, 5, 6, 7].map((e) => f(Math.min(e, 6)));
    const U = {
      uTemps: { value: 0 }, uVent: { value: new THREE.Vector2(0.8, 0.6) }, uTexel: { value: S }, uHerbeR: { value: Q.herbe },
      uCelF: { value: V8((e) => cellule(CEL.feuilles[e], S)) }, uCelB: { value: V8((e) => cellule(CEL.ecorce[e], S)) }, uCelS: { value: V8((e) => cellule(e === 4 ? CEL.rideau : CEL.feuilles[e], S)) },
      uCelI: { value: V8((e) => cellule(CEL.imp[e], S)) }, uForme: { value: V8((e) => new THREE.Vector4(...FORME[e])) },
      uLoinK: { value: V8((e) => { const s = sils[FAM[e]]; return new THREE.Vector4(s.Rm / s.R0, s.ym, 0, 0); }) },
      uCelL: { value: [cellule(CEL.haie, S), cellule(CEL.vigne, S)] }, uCelP: { value: cellule(CEL.ecorce[7], S) }, uCelH: { value: CEL.herbe.map((r) => cellule(r, S)) },
    };
    const materiau = (cle, vert, ombre) => {
      const m = ombre ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); sh.vertexShader = vert(sh.vertexShader); if (!ombre) sh.fragmentShader = fragmentVeg(sh.fragmentShader); };
      m.customProgramCacheKey = () => 'veg-' + cle + (ombre ? '-o' : ''); m.extensions = { derivatives: true }; return m;
    };
    const MAT = { proche: materiau('p', (v) => vertexArbre(v, false, false)), ombre: materiau('p', (v) => vertexArbre(v, false, true), true), moyen: materiau('m', (v) => vertexArbre(v, true, false)),
      loin: materiau('l', vertexLoin), ligne: materiau('h', (v) => vertexLigne(v, false)), ombreLigne: materiau('h', (v) => vertexLigne(v, true), true), herbe: materiau('t', vertexHerbe) };

    // ─── les InstancedMesh (capacités au plus haut palier : changer de qualité ne réalloue rien) ───
    const groupe = new THREE.Group(); groupe.name = 'vegetation';
    const QH = QUALITES.haute;
    function instances(nom, geo, mat, cap, ombre) {
      cap = Math.max(1, cap); const im = new THREE.InstancedMesh(geo, mat, cap); im.name = nom; im.frustumCulled = false; im.matrixAutoUpdate = false; im.count = 0; im.visible = false; im.receiveShadow = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      const d = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); d.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iDon', d);
      if (ombre) im.customDepthMaterial = ombre; im.userData.cap = cap; groupe.add(im); return im;
    }
    const parFam = [0, 0, 0, 0]; for (let e = 0; e < 7; e++) parFam[FAM[e]] += comptes[e];
    const PROCHES = sils.map((s, f) => (parFam[f] ? instances('arbres-proches-' + ['boule', 'colonne', 'pleureur', 'cone'][f], s.geo, MAT.proche, Math.min(QH.nProche, parFam[f]), MAT.ombre) : null));
    const MOYENS = NA ? instances('arbres-moyens', moy.geo, MAT.moyen, Math.min(QH.nMoyen, NA), null) : null;
    const LOINS = NA ? instances('arbres-loin', loin, MAT.loin, Math.min(QH.nLoin, NA), null) : null;
    const LIGNES = NL ? instances('haies-vignes', lig.geo, MAT.ligne, Math.min(QH.nLignes, NL), MAT.ombreLigne) : null;
    const HERBE = instances('herbe', herbe.geo, MAT.herbe, QH.nHerbe, null);
    if (LIGNES) LIGNES.receiveShadow = true; HERBE.receiveShadow = true;
    sils.forEach((s, f) => { if (!PROCHES[f]) s.geo.dispose(); });
    const TRIS = { proche: sils.map((s) => s.tris), moyen: moy.tris, loin: 2, ligne: lig.tris, herbe: herbe.tris };

    // ─── l'élimination hors du champ : un tronc de pyramide élargi (fov + 24°), calculé à chaque recopie ───
    const camC = new THREE.PerspectiveCamera(), FR = new THREE.Frustum(), _m = new THREE.Matrix4(), PL = FR.planes;
    function preparerChamp(cam) {
      if (cam.isPerspectiveCamera) { camC.fov = Math.min(150, cam.fov + 24); camC.aspect = cam.aspect; camC.near = 0.05; camC.far = cam.far + 60; camC.updateProjectionMatrix(); _m.multiplyMatrices(camC.projectionMatrix, cam.matrixWorldInverse); }
      else _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      FR.setFromProjectionMatrix(_m);
    }
    const dansChamp = (x, y, z, r) => { for (let k = 0; k < 6; k++) { const p = PL[k]; if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant < -r) return false; } return true; };

    // ─── les recopies ───
    const ST = { proche: [0, 0, 0, 0], moyen: 0, loin: 0, lignes: 0, herbe: 0, appels: 0, appelsOmbre: 0, triangles: 0, trianglesOmbre: 0, majs: 0, majsHerbe: 0, ms: 0, msHerbe: 0 };
    const HIST = new Uint32Array(64), kP = [0, 0, 0, 0];
    function seuil(rmax, cap, d2min, d2max) { // le rayon sous lequel il y a au plus cap candidats (histogramme de 64 tranches)
      HIST.fill(0); let n = 0; const pas = rmax / 64;
      for (let i = 0; i < NA; i++) { const d = D2[i]; if (d < d2min || d >= d2max) continue; HIST[Math.min(63, (Math.sqrt(d) / pas) | 0)]++; n++; }
      if (n <= cap) return rmax; let s = 0; for (let b = 0; b < 64; b++) { s += HIST[b]; if (s > cap) return b * pas; } return rmax;
    }
    function copier(im, k, src, i, mats) { const a = im.instanceMatrix.array, o = k * 16, s = i * 16; for (let q = 0; q < 16; q++) a[o + q] = mats[s + q]; const d = im.geometry.attributes.iDon.array; d[k * 4] = src[i * 4]; d[k * 4 + 1] = src[i * 4 + 1]; d[k * 4 + 2] = src[i * 4 + 2]; d[k * 4 + 3] = src[i * 4 + 3]; }
    function fermer(im, n, cols) {
      if (!im) return; im.count = n; im.visible = n > 0; if (!n) return;
      for (const [a, t] of [[im.instanceMatrix, 16], [im.instanceColor, 3], [im.geometry.attributes.iDon, 4]]) { a.updateRange.offset = 0; a.updateRange.count = n * t; a.needsUpdate = true; }
    }
    function majArbres(cx, cy, cz, far) {
      if (!NA) return;
      const rP = Q.proche, rM = Q.moyen, rF = Math.min(far, 2000), rF2 = rF * rF;
      for (let i = 0; i < NA; i++) { const dx = AX[i] - cx, dz = AZ[i] - cz, d2 = dx * dx + dz * dz; D2[i] = d2 <= rF2 && dansChamp(AX[i], AY[i] + AH[i] * 0.5, AZ[i], Math.max(AH[i] * 0.55, AR[i]) + 1) ? d2 : 1e12; }
      const cutP = seuil(rP, Q.nProche, 0, rP * rP), cutM = seuil(rM, Q.nMoyen, cutP * cutP, rM * rM), cutF = seuil(rF, Q.nLoin, Math.max(cutM, cutP) ** 2, rF2), p2 = cutP * cutP, m2 = Math.max(cutM, cutP) ** 2, f2 = cutF * cutF;
      kP[0] = kP[1] = kP[2] = kP[3] = 0; let kM = 0, kL = 0;
      for (let i = 0; i < NA; i++) {
        const d = D2[i]; if (d >= f2) continue;
        if (d < p2) { const f = FAM[AE[i]], im = PROCHES[f]; if (im && kP[f] < im.userData.cap) { copier(im, kP[f], DON, i, MATP); const c = im.instanceColor.array, o = kP[f] * 3; c[o] = COLA[i * 3]; c[o + 1] = COLA[i * 3 + 1]; c[o + 2] = COLA[i * 3 + 2]; kP[f]++; continue; } }
        if (d < m2 && MOYENS && kM < MOYENS.userData.cap) { copier(MOYENS, kM, DON, i, MATM); const c = MOYENS.instanceColor.array; c[kM * 3] = COLA[i * 3]; c[kM * 3 + 1] = COLA[i * 3 + 1]; c[kM * 3 + 2] = COLA[i * 3 + 2]; kM++; continue; }
        if (LOINS && kL < LOINS.userData.cap) { copier(LOINS, kL, DON, i, MATM); const c = LOINS.instanceColor.array; c[kL * 3] = COLA[i * 3]; c[kL * 3 + 1] = COLA[i * 3 + 1]; c[kL * 3 + 2] = COLA[i * 3 + 2]; kL++; }
      }
      for (let f = 0; f < 4; f++) { fermer(PROCHES[f], kP[f]); ST.proche[f] = kP[f]; }
      fermer(MOYENS, kM); fermer(LOINS, kL); ST.moyen = kM; ST.loin = kL;
    }
    function majLignes(cx, cz) {
      if (!LIGNES) return; const R2 = Q.lignes * Q.lignes, cap = Math.min(Q.nLignes, LIGNES.userData.cap); let k = 0;
      for (let i = 0; i < NL && k < cap; i++) { const dx = LX[i] - cx, dz = LZ[i] - cz; if (dx * dx + dz * dz > R2 || !dansChamp(LX[i], LY[i], LZ[i], LR[i])) continue; copier(LIGNES, k, DONL, i, MATL); const c = LIGNES.instanceColor.array; c[k * 3] = COLL[i * 3]; c[k * 3 + 1] = COLL[i * 3 + 1]; c[k * 3 + 2] = COLL[i * 3 + 2]; k++; }
      fermer(LIGNES, k); ST.lignes = k;
    }
    // l'herbe : une grille fixe du monde (une touffe possible par case, placée par hachage), parcourue de la caméra vers le bord
    let OFFS = null, offsPas = 0;
    function preparerOffsets() { const R = Q.herbe, pas = Q.pas, n = Math.ceil(R / pas) + 1, l = []; for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) { const d = Math.hypot(i, j) * pas; if (d <= R + pas) l.push([d, i, j]); } l.sort((a, b) => a[0] - b[0]); OFFS = new Int16Array(l.length * 2); l.forEach((o, k) => { OFFS[2 * k] = o[1]; OFFS[2 * k + 1] = o[2]; }); offsPas = pas; }
    const moyH = A.moyHerbe;
    function majHerbe(cx, cz) {
      if (!OFFS || offsPas !== Q.pas) preparerOffsets();
      const pas = Q.pas, R2 = Q.herbe * Q.herbe, ci = Math.floor(cx / pas), cj = Math.floor(cz / pas), cap = Math.min(Q.nHerbe, HERBE.userData.cap), ma = HERBE.instanceMatrix.array, da = HERBE.geometry.attributes.iDon.array, ca = HERBE.instanceColor.array; let k = 0;
      for (let o = 0; o < OFFS.length && k < cap; o += 2) {
        const i = ci + OFFS[o], j = cj + OFFS[o + 1], x = (i + h3(i, j, 1)) * pas, z = (j + h3(i, j, 2)) * pas, dx = x - cx, dz = z - cz; if (dx * dx + dz * dz > R2) continue;
        const c = caseDe(x, z); if (c < 0 || BLOQ[c]) continue;
        const dens = Math.max(DENS[c], PHOTO ? PHOTO[c] : 0); if (h3(i, j, 3) * 255 >= dens) continue;
        const y = H0(x, z); if (!dansChamp(x, y + 0.3, z, 0.8)) continue;
        const g = GENRE[c], u = h3(i, j, 4); let t;
        if (g === 3) t = u < 0.45 ? 4 : u < 0.8 ? 0 : 5; else if (g === 2) t = u < 0.55 ? 0 : u < 0.75 ? 2 : u < 0.9 ? 3 : 1; else if (g === 4) t = u < 0.6 ? 0 : u < 0.85 ? 5 : 3; else t = u < 0.42 ? 0 : u < 0.66 ? 1 : u < 0.78 ? 2 : u < 0.88 ? 3 : 5;
        const a = h3(i, j, 5) * TAU, s = (t === 4 ? 0.85 : 0.5) * (0.7 + h3(i, j, 6) * 0.6), sy = s * (t === 4 ? 0.9 : 0.85) * (0.8 + h3(i, j, 7) * 0.45), co = Math.cos(a) * s, si = Math.sin(a) * s, m = k * 16;
        ma[m] = co; ma[m + 1] = 0; ma[m + 2] = -si; ma[m + 3] = 0; ma[m + 4] = 0; ma[m + 5] = sy; ma[m + 6] = 0; ma[m + 7] = 0; ma[m + 8] = si; ma[m + 9] = 0; ma[m + 10] = co; ma[m + 11] = 0; ma[m + 12] = x; ma[m + 13] = y - 0.03; ma[m + 14] = z; ma[m + 15] = 1;
        da[k * 4] = t; da[k * 4 + 3] = h3(i, j, 8);
        const v = 0.9 + h3(i, j, 9) * 0.2; let r = v, gg = v, b = v;
        if (COUL && t !== 2 && t !== 3) { const n2 = N >> 1, q = (Math.min(n2 - 1, (c % N) >> 1) + Math.min(n2 - 1, ((c / N) | 0) >> 1) * n2) * 3, w = t === 4 ? 0.4 : 0.7; r = v * (1 - w + w * borne(LIN[COUL[q]] / moyH[0], 0.45, 1.6)); gg = v * (1 - w + w * borne(LIN[COUL[q + 1]] / moyH[1], 0.45, 1.6)); b = v * (1 - w + w * borne(LIN[COUL[q + 2]] / moyH[2], 0.45, 1.6)); }
        ca[k * 3] = r; ca[k * 3 + 1] = gg; ca[k * 3 + 2] = b; k++;
      }
      fermer(HERBE, k); ST.herbe = k;
    }
    function bilan() { // appels et triangles de la végétation (passe principale, puis ombres en haute)
      let ap = 0, ao = 0, tr = 0, to = 0; const ombres = Q.ombres;
      PROCHES.forEach((im, f) => { if (im && im.count) { ap++; tr += im.count * TRIS.proche[f]; if (ombres) { ao++; to += im.count * TRIS.proche[f]; } } });
      if (MOYENS && MOYENS.count) { ap++; tr += MOYENS.count * TRIS.moyen; } if (LOINS && LOINS.count) { ap++; tr += LOINS.count * 2; }
      if (LIGNES && LIGNES.count) { ap++; tr += LIGNES.count * TRIS.ligne; if (ombres) { ao++; to += LIGNES.count * TRIS.ligne; } } if (HERBE.count) { ap++; tr += HERBE.count * TRIS.herbe; }
      ST.appels = ap; ST.appelsOmbre = ao; ST.triangles = tr; ST.trianglesOmbre = to;
    }
    function appliquerQualite() { for (const im of PROCHES) if (im) im.castShadow = Q.ombres; if (LIGNES) LIGNES.castShadow = Q.ombres; U.uHerbeR.value = Q.herbe; E.force = true; }

    // ─── la photo aérienne : où pousse l'herbe (pixels verts) et de quelle couleur est le sol ───
    function lirePhoto(img) {
      const cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, N, N);
      const d = c.getImageData(0, 0, N, N).data, P = new Uint8Array(N * N), n2 = N >> 1, C = new Uint8Array(n2 * n2 * 3), som = new Float32Array(n2 * n2 * 3);
      for (let k = 0; k < N * N; k++) {
        const r = d[k * 4], g = d[k * 4 + 1], b = d[k * 4 + 2], s = r + g + b, exg = (2 * g - r - b) / (s + 1); P[k] = Math.round(205 * lisse(0.015, 0.09, exg) * lisse(45, 110, s));
        const i = Math.min(n2 - 1, (k % N) >> 1), j = Math.min(n2 - 1, ((k / N) | 0) >> 1), q = (j * n2 + i) * 3; som[q] += r; som[q + 1] += g; som[q + 2] += b;
      }
      for (let q = 0; q < som.length; q++) C[q] = Math.round(som[q] / 4);
      PHOTO = P; COUL = C; E.forceH = true;
    }
    let image = null;
    if (opts.photo !== false && carte.sol && typeof Image !== 'undefined') { const nom = carte.sol.petite || carte.sol.image; if (typeof nom === 'string') { image = new Image(); image.onload = () => { if (!libere) try { lirePhoto(image); } catch (e) { /* photo illisible (origine) : l'herbe suit les polygones */ } }; image.src = dossier + nom; } }

    // ─── maj : recopie quand la caméra a bougé ; sinon seulement le temps (vent) ───
    const E = { cx: 1e9, cy: 0, cz: 1e9, fx: 0, fy: 0, fz: 0, fov: 0, far: 0, asp: 0, hx: 1e9, hz: 1e9, hfx: 0, hfz: 0, force: true, forceH: true };
    const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : 0);
    function maj(camera, t) {
      if (libere || !camera || !camera.matrixWorld) return;
      U.uTemps.value = fini(t) ? t % 3600 : 0;
      const e = camera.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14], fl = Math.hypot(e[8], e[9], e[10]) || 1, fx = -e[8] / fl, fy = -e[9] / fl, fz = -e[10] / fl;
      const dx = cx - E.cx, dy = cy - E.cy, dz = cz - E.cz, tourne = fx * E.fx + fy * E.fy + fz * E.fz < 0.9962;
      const arbres = E.force || dx * dx + dy * dy + dz * dz > 4 || tourne || camera.fov !== E.fov || camera.far !== E.far || camera.aspect !== E.asp;
      const hdx = cx - E.hx, hdz = cz - E.hz, herbe = E.forceH || arbres || hdx * hdx + hdz * hdz > 1.2;
      if (!arbres && !herbe) return;
      const t1 = maintenant(); preparerChamp(camera);
      if (arbres) { majArbres(cx, cy, cz, fini(camera.far) ? camera.far : 1000); majLignes(cx, cz); E.cx = cx; E.cy = cy; E.cz = cz; E.fx = fx; E.fy = fy; E.fz = fz; E.fov = camera.fov; E.far = camera.far; E.asp = camera.aspect; E.force = false; ST.majs++; ST.ms = Math.round((maintenant() - t1) * 100) / 100; }
      const t2 = maintenant(); majHerbe(cx, cz); E.hx = cx; E.hz = cz; E.forceH = false; ST.majsHerbe++; ST.msHerbe = Math.round((maintenant() - t2) * 100) / 100;
      bilan();
    }
    function qualite(q) { if (q === undefined || !QUALITES[q]) return nomQ; if (q !== nomQ) { nomQ = q; Q = QUALITES[q]; appliquerQualite(); } return nomQ; }
    function liberer() {
      if (libere) return; libere = true; if (image) { image.onload = null; image = null; }
      if (groupe.parent) groupe.parent.remove(groupe);
      for (const im of groupe.children) { im.geometry.dispose(); if (im.dispose) im.dispose(); }
      for (const m of Object.values(MAT)) m.dispose(); tex.dispose(); groupe.clear();
    }
    appliquerQualite();
    const tCree = Math.round((maintenant() - t0) * 10) / 10;
    return {
      groupe, maj, qualite, liberer,
      get stats() {
        return { qualite: nomQ, arbres: NA, especes: ESPECES.reduce((o, n, e) => { if (comptes[e]) o[n] = comptes[e]; return o; }, {}), troncons: NL, instances: { proche: ST.proche.reduce((a, b) => a + b, 0), parSilhouette: ST.proche.slice(), moyen: ST.moyen, loin: ST.loin, lignes: ST.lignes, herbe: ST.herbe },
          appels: ST.appels, appelsOmbre: ST.appelsOmbre, triangles: ST.triangles, trianglesOmbre: ST.trianglesOmbre, majs: ST.majs, majsHerbe: ST.majsHerbe, ms: ST.ms, msHerbe: ST.msHerbe, creation: tCree,
          atlas: S, memoire: Math.round(S * S * 4 * 4 / 3), photo: !!PHOTO, trianglesParArbre: TRIS.proche.slice() };
      },
    };
  }
  function imposteurMesure(sil, e) { let Rm = 0, ym = 0; const rh = R_H[e] / sil.R0; for (const g of sil.grappes) { Rm = Math.max(Rm, Math.abs(g.x) + g.s * g.ax * 0.45, Math.abs(g.z) + g.s * g.ax * 0.45); ym = Math.max(ym, g.mode === 2 ? g.y : g.y + g.s * g.ay * rh * 0.5); } sil.Rm = Rm; sil.ym = ym * 1.02; }
  return { creer, ESPECES, QUALITES, OK };
})();
if (typeof module !== 'undefined') module.exports = PVEGETATION;
