/* DERNIER REMPART — le rendu Three.js (r158, vendor/three.min.js), vu de dessus par une caméra inclinée qui suit le survivant.
   Les personnages et quelques objets sont des modèles CC0 (src-zombies/modeles.js, zombies/LICENCE.txt) : la horde et le survivant Kenney,
   la tourelle, le mortier et les voitures Kenney, les boss KayKit. Le décor des arènes, la barricade, la mine, l'épouvantail, la ferraille et
   les effets sont construits ici en low-poly à facettes (boîtes, cylindres, icosaèdres, couleurs de sommets), dans le même style ; tant que
   les modèles ne sont pas chargés (ou s'ils manquent), les personnages et les défenses gardent aussi leurs formes faites main.
   Budget d'appels de dessin, pour un téléphone : le décor entier en deux maillages fusionnés (les voitures en un troisième) ; toute la horde
   en six maillages instanciés (une pièce du zombie Kenney chacun, posée avec ses matrices d'animation précalculées, une teinte par type) ;
   un boss à squelette à la fois ; la ferraille et les flaques instanciées ; les défenses, les caisses, les traçantes et les explosions en
   petites réserves d'objets réutilisés.
   API : ZRENDU.creer(canvas, { qualite: 'auto' | 'haute' | 'moyenne' | 'eco' }) → r
     r.charger(jeu)                  construit l'arène de la partie (et oublie l'ancienne)
     r.image(jeu, idMoi, dt, evs)    une image : suit l'état, joue les effets des événements du pas
     r.taille(w, h), r.qualite(q), r.stats() → { webgl, calls, triangles, modeles, horde, boss, survivant, defenses }, r.ecranDe(x, z) → [px, py] */
const ZRENDU = (() => {
  'use strict';
  const T = typeof THREE !== 'undefined' ? THREE : null;
  const D = typeof ZDONNEES !== 'undefined' ? ZDONNEES : null;
  const ECHELLE = 1.3; // les personnages un peu plus grands que nature : on les lit mieux vus de haut
  const MAX_Z = 70, MAX_MORCEAUX = 108, MAX_PARTICULES = 260, MAX_FERRAILLE = 160, MAX_FLAQUES = 90, MAX_TRACANTES = 48, MAX_BOUMS = 8, MAX_CORPS = 24;

  // ─── fabrique low-poly : des morceaux colorés fusionnés en une géométrie à facettes ───
  const _m = T ? new T.Matrix4() : null, _q = T ? new T.Quaternion() : null, _e = T ? new T.Euler() : null, _v = T ? new T.Vector3() : null, _s = T ? new T.Vector3() : null, _c = T ? new T.Color() : null;
  function mat(x, y, z, ry, sx, sy, sz, rx, rz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
    return _m.clone().compose(_v, _q, _s);
  }
  function Fab() { this.l = []; }
  Fab.prototype.add = function (geo, couleur, m, varie, graine) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3); _c.set(couleur);
    let s = graine || 1;
    for (let i = 0; i < n; i += 3) { // une couleur par face, un peu variée
      let k = 1; if (varie) { s = (s * 16807) % 2147483647; k = 1 - varie + (s / 2147483647) * varie * 2; }
      for (let j = 0; j < 3 && i + j < n; j++) { c[(i + j) * 3] = _c.r * k; c[(i + j) * 3 + 1] = _c.g * k; c[(i + j) * 3 + 2] = _c.b * k; }
    }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal');
    this.l.push(g); return this;
  };
  Fab.prototype.geo = function () {
    let n = 0; for (const g of this.l) n += g.attributes.position.count;
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3); let o = 0;
    for (const g of this.l) { p.set(g.attributes.position.array, o * 3); c.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(p, 3)); out.setAttribute('color', new T.BufferAttribute(c, 3)); out.computeVertexNormals(); out.computeBoundingSphere();
    this.l = []; return out;
  };
  const BOITE = T ? new T.BoxGeometry(1, 1, 1) : null;
  const cyl = (rh, rb, h, n) => new T.CylinderGeometry(rh, rb, h, n || 7, 1);
  function rocheGeo(r, graine) { // un icosaèdre cabossé
    const g = new T.IcosahedronGeometry(r, 0), p = g.attributes.position; let s = graine; // (l’icosaèdre est déjà sans index)
    const vus = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!vus.has(k)) { s = (s * 16807) % 2147483647; vus.set(k, 0.78 + (s / 2147483647) * 0.4); }
      const f = vus.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
    }
    return g;
  }

  // ─── les obstacles, par type (dans la fabrique du décor) ───
  function obstacle(F, o, k) {
    const g = 1000 + k * 37;
    if (o.r) {
      const [x, z, w, d, h] = o.r;
      switch (o.type) {
        case 'muret': { // des blocs de pierre claire, posés en rangée
          const long = Math.max(w, d), n = Math.max(1, Math.round(long / 1.3)), lx = w >= d, pas = long / n;
          for (let i = 0; i < n; i++) {
            const t = -long / 2 + pas * (i + 0.5), bx = x + (lx ? t : 0), bz = z + (lx ? 0 : t);
            F.add(BOITE, i % 3 === 1 ? '#D9CBA8' : '#E6DABD', mat(bx, h / 2, bz, 0, lx ? pas * 0.96 : w, h, lx ? d : pas * 0.96), 0.05, g + i);
            F.add(BOITE, '#CDBE98', mat(bx, h + 0.03, bz, 0, (lx ? pas * 0.96 : w) * 0.92, 0.06, (lx ? d : pas * 0.96) * 0.92));
          }
          break;
        }
        case 'caisses': {
          const cw = w / 2, cd = d / 2;
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (!(i === 1 && j === 1)) {
            const bx = x - w / 4 + i * cw, bz = z - d / 4 + j * cd; F.add(BOITE, (i + j) % 2 ? '#B98B55' : '#C99B62', mat(bx, h / 2, bz, 0, cw * 0.96, h, cd * 0.96), 0.06, g + i * 3 + j);
            F.add(BOITE, '#8E6638', mat(bx, h * 0.5, bz, 0, cw * 1.0, h * 0.14, cd * 1.0));
          }
          F.add(BOITE, '#D4A86E', mat(x - w / 4, h * 1.5, z - d / 4, 0.2, cw * 0.9, h, cd * 0.9), 0.06, g + 9);
          break;
        }
        case 'voiture': {
          const lx = w > d, L = lx ? w : d, l = lx ? d : w, ry = lx ? 0 : Math.PI / 2, col = o.couleur || '#D9534F';
          const P = (a, b) => [x + (lx ? a : b), z + (lx ? b : a)];
          let p = P(0, 0); F.add(BOITE, col, mat(p[0], 0.62, p[1], ry, L, 0.62, l), 0.04, g);
          p = P(-L * 0.06, 0); F.add(BOITE, col, mat(p[0], 1.13, p[1], ry, L * 0.5, 0.45, l * 0.86), 0.04, g + 1);
          F.add(BOITE, '#2F3B4A', mat(p[0], 1.13, p[1], ry, L * 0.52, 0.34, l * 0.88));
          for (const [a, b] of [[L * 0.32, l / 2], [-L * 0.32, l / 2], [L * 0.32, -l / 2], [-L * 0.32, -l / 2]]) { const q = P(a, b); F.add(cyl(0.32, 0.32, 0.22, 8), '#26262B', mat(q[0], 0.32, q[1], ry, 1, 1, 1, Math.PI / 2)); }
          p = P(L / 2, 0); F.add(BOITE, '#F4E3A1', mat(p[0], 0.7, p[1], ry, 0.05, 0.16, l * 0.7));
          break;
        }
        case 'benne':
          F.add(BOITE, '#3F7D5A', mat(x, h / 2, z, 0, w, h, d), 0.05, g);
          F.add(BOITE, '#2F6347', mat(x, h + 0.06, z, 0, w * 1.04, 0.12, d * 1.04));
          break;
        case 'grange': { // la grange rouge et son toit à deux pans
          F.add(BOITE, '#B5473A', mat(x, h / 2, z, 0, w, h, d), 0.04, g);
          F.add(BOITE, '#F2EDE4', mat(x, h * 0.42, z + d / 2 + 0.01, 0, w * 0.34, h * 0.8, 0.06));
          F.add(BOITE, '#8A3A2F', mat(x, h * 0.42, z + d / 2 + 0.03, 0, w * 0.28, h * 0.7, 0.06));
          const toit = new T.CylinderGeometry(1, 1, 1, 3, 1); // un prisme
          F.add(toit, '#6B4A3A', mat(x, h + d * 0.2, z, 0, d * 0.62, w * 1.06, d * 0.36, 0, Math.PI / 2), 0.03, g + 2);
          break;
        }
        case 'cloture': {
          const lx = w >= d, long = lx ? w : d, n = Math.max(2, Math.round(long / 1.6));
          for (let i = 0; i <= n; i++) { const t = -long / 2 + long * i / n; F.add(BOITE, '#8C6A44', mat(x + (lx ? t : 0), h / 2, z + (lx ? 0 : t), 0, 0.16, h, 0.16)); }
          for (const y of [h * 0.4, h * 0.82]) F.add(BOITE, '#A7804F', mat(x, y, z, 0, lx ? long : 0.08, 0.1, lx ? 0.08 : long), 0.05, g);
          break;
        }
        case 'tracteur': {
          const lx = w > d, ry = lx ? 0 : Math.PI / 2, L = lx ? w : d;
          F.add(BOITE, '#3E8E4A', mat(x, 0.95, z, ry, L * 0.9, 0.8, (lx ? d : w) * 0.6), 0.04, g);
          F.add(BOITE, '#3E8E4A', mat(x - (lx ? 0 : 0), 1.75, z + (lx ? 0 : L * 0.2), ry, L * 0.36, 0.9, (lx ? d : w) * 0.55), 0.04, g + 1);
          F.add(BOITE, '#BFE0F0', mat(x, 1.8, z + (lx ? 0 : L * 0.2), ry, L * 0.38, 0.6, (lx ? d : w) * 0.5));
          for (const [a, r] of [[-L * 0.28, 0.75], [L * 0.32, 0.45]]) for (const s of [-1, 1]) {
            const px = lx ? x + a : x + s * (w / 2), pz = lx ? z + s * (d / 2) : z + a;
            F.add(cyl(r, r, 0.38, 9), '#2A2A2A', mat(px, r, pz, ry + Math.PI / 2, 1, 1, 1, 0, Math.PI / 2));
          }
          break;
        }
        case 'crypte': // le mausolée : pierre grise, toit en pointe, porte sombre
          F.add(BOITE, '#8A8A92', mat(x, h / 2, z, 0, w, h, d), 0.05, g); F.add(BOITE, '#2A2A30', mat(x, h * 0.35, z + d / 2 + 0.02, 0, w * 0.25, h * 0.6, 0.06));
          F.add(new T.CylinderGeometry(1, 1, 1, 3, 1), '#6A6A74', mat(x, h + d * 0.18, z, 0, d * 0.55, w * 1.04, d * 0.32, 0, Math.PI / 2), 0.04, g + 1);
          F.add(BOITE, '#B8B8C0', mat(x, h + d * 0.5, z, 0, 0.12, 0.8, 0.12)); F.add(BOITE, '#B8B8C0', mat(x, h + d * 0.6, z, 0, 0.5, 0.12, 0.12));
          break;
        case 'tombe': F.add(BOITE, '#A8A8B0', mat(x, h / 2, z, 0, w, h, d), 0.08, g); F.add(BOITE, '#7E8A6A', mat(x, 0.05, z + (d > w ? 0 : 0.9), 0, w * 0.9, 0.1, 1.4)); break;
        case 'grille': {
          const lx = w >= d, long = lx ? w : d, n = Math.max(4, Math.round(long / 0.45));
          for (let i = 0; i <= n; i++) { const t = -long / 2 + long * i / n; F.add(BOITE, '#3A3438', mat(x + (lx ? t : 0), h / 2, z + (lx ? 0 : t), 0, 0.06, h, 0.06)); }
          for (const y of [0.2, h * 0.92]) F.add(BOITE, '#4A4448', mat(x, y, z, 0, lx ? long : 0.08, 0.08, lx ? 0.08 : long));
          break;
        }
        case 'conteneur': case 'rayon': case 'immeuble': { // une grande boîte colorée, avec ses nervures (conteneur), ses étagères (rayon), ses fenêtres (immeuble)
          const col = o.couleur || '#C0392B'; F.add(BOITE, col, mat(x, h / 2, z, 0, w, h, d), 0.04, g);
          const lx = w >= d, long = lx ? w : d;
          if (o.type === 'conteneur') for (let i = 0; i <= Math.round(long / 0.6); i++) { const t = -long / 2 + i * 0.6; F.add(BOITE, col, mat(x + (lx ? t : 0), h / 2, z + (lx ? 0 : t), 0, lx ? 0.08 : w * 1.04, h * 0.96, lx ? d * 1.04 : 0.08), 0.12, g + i); }
          else if (o.type === 'rayon') for (const y of [0.5, 1.1, 1.7]) F.add(BOITE, '#E8E8E8', mat(x, y, z, 0, w * 1.06, 0.06, d * 1.01));
          else for (let fy = 1.5; fy < h - 0.5; fy += 1.6) for (let i = 0; i < Math.floor(long / 2); i++) { const t = -long / 2 + 1 + i * 2; for (const sgn of [-1, 1]) F.add(BOITE, (i + Math.round(fy)) % 3 ? '#FFE9A0' : '#2A3040', mat(x + (lx ? t : sgn * (w / 2 + 0.02)), fy, z + (lx ? sgn * (d / 2 + 0.02) : t), 0, lx ? 0.8 : 0.04, 0.9, lx ? 0.04 : 0.8)); }
          break;
        }
        case 'grue':
          F.add(BOITE, '#E8A33A', mat(x, 0.4, z, 0, w, 0.8, d)); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.add(BOITE, '#E8A33A', mat(x + a * w * 0.35, h / 2, z + b * d * 0.35, 0, 0.18, h, 0.18));
          F.add(BOITE, '#E8A33A', mat(x - 4, h, z, 0, 12, 0.3, 0.3)); F.add(BOITE, '#4A4F57', mat(x - 9, h - 1.5, z, 0, 0.05, 3, 0.05)); break;
        case 'banc': F.add(BOITE, '#8C6A44', mat(x, 0.45, z, 0, w, 0.1, d), 0.05, g); F.add(BOITE, '#8C6A44', mat(x + (w < d ? w * 0.4 : 0), 0.75, z + (w < d ? 0 : d * 0.4), 0, w < d ? 0.08 : w, 0.5, w < d ? d : 0.08)); for (const sgn of [-1, 1]) F.add(BOITE, '#4A4448', mat(x + (w >= d ? sgn * w * 0.4 : 0), 0.22, z + (w < d ? sgn * d * 0.4 : 0), 0, 0.08, 0.44, 0.08)); break;
        case 'terrasse': // une table et ses chaises, un parasol
          F.add(cyl(0.6, 0.6, 0.06, 10), '#F2EDE4', mat(x, 0.78, z)); F.add(cyl(0.05, 0.05, 0.78, 6), '#4A4448', mat(x, 0.39, z));
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; F.add(BOITE, '#C94F3D', mat(x + Math.cos(a) * 1.0, 0.45, z + Math.sin(a) * 1.0, -a, 0.45, 0.06, 0.45)); }
          F.add(cyl(0.04, 0.04, 2.2, 6), '#4A4448', mat(x, 1.1, z)); F.add(cyl(0.05, 1.5, 0.45, 8), '#F2C230', mat(x, 2.3, z), 0.05, g); break;
        case 'bateau': {
          const lx = w > d, ry = lx ? Math.PI / 2 : 0, L = lx ? w : d, l = lx ? d : w;
          F.add(BOITE, '#8A5A3A', mat(x, 0.6, z, ry, l, 1.2, L * 0.82), 0.05, g); F.add(new T.CylinderGeometry(1, 1, 1, 3, 1), '#8A5A3A', mat(x + (lx ? L * 0.45 : 0), 0.6, z + (lx ? 0 : L * 0.45), ry, l * 0.58, 1.2, 1.4, 0, 0), 0.05, g + 1);
          F.add(BOITE, '#E8E2D4', mat(x, 1.3, z, ry, l * 0.92, 0.18, L * 0.8)); F.add(cyl(0.08, 0.1, 4, 6), '#6A4A2A', mat(x, 3, z)); F.add(BOITE, '#F2EDE4', mat(x, 3.2, z + 0.6, ry + 0.3, 0.05, 2, 1.4)); break;
        }
        case 'cabane': F.add(BOITE, '#C9A26A', mat(x, h / 2, z, 0, w, h, d), 0.06, g); F.add(new T.CylinderGeometry(1, 1, 1, 3, 1), '#8A5A3A', mat(x, h + d * 0.2, z, 0, d * 0.6, w * 1.08, d * 0.34, 0, Math.PI / 2), 0.04, g + 1); F.add(BOITE, '#5A3A22', mat(x, h * 0.35, z + d / 2 + 0.02, 0, w * 0.25, h * 0.65, 0.06)); break;
        case 'echafaudage': {
          for (let i = 0; i <= Math.round(w / 2); i++) for (const sz of [-d / 2, d / 2]) F.add(BOITE, '#8A8F98', mat(x - w / 2 + i * 2, h / 2, z + sz, 0, 0.1, h, 0.1));
          for (const y of [h * 0.33, h * 0.66, h]) F.add(BOITE, '#B98B55', mat(x, y, z, 0, w, 0.08, d), 0.06, g + Math.round(y)); break;
        }
        case 'parpaings': for (let i = 0; i < 3; i++) F.add(BOITE, i % 2 ? '#A8A8A0' : '#B8B8B0', mat(x, h * (i + 0.5) / 3, z, i * 0.08, w * 0.95, h / 3 * 0.92, d * 0.95), 0.06, g + i); break;
        case 'comptoir': F.add(BOITE, '#E8E8E8', mat(x, h / 2, z, 0, w, h, d), 0.04, g); F.add(BOITE, '#3A3F4A', mat(x, h + 0.03, z, 0, w * 1.02, 0.06, d * 1.02)); F.add(BOITE, '#2ECC71', mat(x + w * 0.3, h + 0.3, z, 0, 0.3, 0.5, 0.2)); break;
        case 'rondins': for (let i = 0; i < 3; i++) { const lx = w >= d; F.add(cyl(0.3, 0.3, (lx ? w : d) * 0.95, 8), '#8A6040', mat(x + (lx ? 0 : (i - 1) * 0.36), 0.3 + (i === 1 ? 0.45 : 0), z + (lx ? (i - 1) * 0.36 : 0), 0, 1, 1, 1, lx ? 0 : Math.PI / 2, lx ? Math.PI / 2 : 0), 0.06, g + i); } break;
        // le Lot 5d : le Métro (escalier, distributeur, portique), l'Hôpital (cloison, lit, brancard, armoire), la Base (hangar, char, sacs, tente)
        case 'escalier': { // l'escalier mécanique : une rampe de marches, ses deux rampes noires, la bouche claire au sommet
          const lx = w >= d, L = lx ? w : d, l = lx ? d : w, n = 9;
          for (let i = 0; i < n; i++) { const t = -L / 2 + L * (i + 0.5) / n, hh = h * (i + 1) / n; F.add(BOITE, i % 2 ? '#8A9098' : '#9AA0A8', mat(x + (lx ? t : 0), hh / 2, z + (lx ? 0 : t), 0, lx ? L / n : l * 0.8, hh, lx ? l * 0.8 : L / n), 0.03, g + i); }
          for (const sg of [-1, 1]) F.add(BOITE, '#2A2E36', mat(x + (lx ? 0 : sg * l * 0.45), h * 0.6, z + (lx ? sg * l * 0.45 : 0), 0, lx ? L : 0.12, h * 1.2, lx ? 0.12 : L));
          F.add(BOITE, '#E8C547', mat(x, h + 0.02, z, 0, lx ? 0.3 : l * 0.8, 0.04, lx ? l * 0.8 : 0.3)); break;
        }
        case 'distributeur': F.add(BOITE, o.couleur || '#D9534F', mat(x, h / 2, z, 0, w, h, d), 0.04, g); F.add(BOITE, '#BFE8FF', mat(x - w * 0.15, h * 0.62, z + d / 2 + 0.01, 0, w * 0.55, h * 0.5, 0.04)); F.add(BOITE, '#2A2E36', mat(x + w * 0.3, h * 0.45, z + d / 2 + 0.01, 0, w * 0.18, h * 0.3, 0.04)); break;
        case 'portique': { const lx = w >= d, L = lx ? w : d, n = Math.max(2, Math.round(L / 1.2)); for (let i = 0; i <= n; i++) { const t = -L / 2 + L * i / n; F.add(BOITE, '#B8BEC6', mat(x + (lx ? t : 0), h / 2, z + (lx ? 0 : t), 0, lx ? 0.25 : w, h, lx ? d : 0.25), 0.04, g + i); } F.add(BOITE, '#E5533D', mat(x, h * 0.75, z, 0, lx ? L : 0.06, 0.08, lx ? 0.06 : L)); break; }
        case 'cloison': F.add(BOITE, '#EEF2F2', mat(x, h / 2, z, 0, w, h, d), 0.03, g); F.add(BOITE, '#7FB8C8', mat(x, 0.5, z, 0, w * 1.01, 0.2, d * 1.01)); F.add(BOITE, '#C8D2D4', mat(x, h + 0.04, z, 0, w * 1.02, 0.08, d * 1.02)); break;
        case 'lit': { const lx = w >= d; F.add(BOITE, '#B8C2CC', mat(x, 0.35, z, 0, w, 0.3, d)); F.add(BOITE, '#F4F6F6', mat(x, 0.6, z, 0, w * 0.96, 0.22, d * 0.94), 0.04, g); F.add(BOITE, '#8FC8E8', mat(x + (lx ? w * 0.12 : 0), 0.73, z + (lx ? 0 : d * 0.12), 0, lx ? w * 0.66 : d * 0.9, 0.06, lx ? d * 0.9 : d * 0.66)); F.add(BOITE, '#FFFFFF', mat(x - (lx ? w * 0.38 : 0), 0.76, z - (lx ? 0 : d * 0.38), 0, lx ? w * 0.18 : d * 0.6, 0.1, lx ? d * 0.6 : d * 0.18)); F.add(BOITE, '#7A8494', mat(x - (lx ? w / 2 : 0), 0.65, z - (lx ? 0 : d / 2), 0, lx ? 0.08 : w, 0.7, lx ? d : 0.08)); break; }
        case 'brancard': F.add(BOITE, '#E8ECEE', mat(x, h * 0.8, z, 0, w, 0.12, d), 0.04, g); F.add(BOITE, '#8FC8E8', mat(x, h * 0.85 + 0.04, z, 0, w * 0.9, 0.04, d * 0.9)); for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) F.add(BOITE, '#7A8494', mat(x + a * w, h * 0.4, z + b * d, 0, 0.06, h * 0.8, 0.06)); break;
        case 'armoire': F.add(BOITE, '#F4F6F6', mat(x, h / 2, z, 0, w, h, d), 0.03, g); F.add(BOITE, '#2E9446', mat(x, h * 0.72, z + d / 2 + 0.02, 0, 0.5, 0.14, 0.04)); F.add(BOITE, '#2E9446', mat(x, h * 0.72, z + d / 2 + 0.02, 0, 0.14, 0.5, 0.04)); F.add(BOITE, '#C8D2D4', mat(x, h * 0.35, z + d / 2 + 0.01, 0, w * 0.9, 0.04, 0.03)); break;
        case 'hangar': { // le hangar kaki, son toit arrondi, la grande porte
          F.add(BOITE, '#6E7350', mat(x, h * 0.4, z, 0, w, h * 0.8, d), 0.04, g);
          F.add(cyl(1, 1, 1, 12), '#5E6345', mat(x, h * 0.8, z, Math.PI / 2, d * 0.5, w, d * 0.5, 0, Math.PI / 2), 0.03, g + 1);
          F.add(BOITE, '#3A3E2E', mat(x, h * 0.35, z + d / 2 + 0.02, 0, w * 0.5, h * 0.7, 0.06)); F.add(BOITE, '#E8C547', mat(x, h * 0.73, z + d / 2 + 0.04, 0, w * 0.5, 0.1, 0.04)); break;
        }
        case 'char': { // le char : la caisse, la tourelle, le canon, les chenilles
          const lx = w > d, ry = lx ? Math.PI / 2 : 0, L = lx ? w : d, l = lx ? d : w;
          F.add(BOITE, '#5E6A3A', mat(x, 0.9, z, ry, l * 0.86, 0.8, L), 0.04, g); for (const sg of [-1, 1]) F.add(BOITE, '#2E322A', mat(x + (lx ? 0 : sg * l * 0.42), 0.45, z + (lx ? sg * l * 0.42 : 0), ry, l * 0.22, 0.9, L * 1.02));
          F.add(BOITE, '#6A763F', mat(x, 1.65, z, ry, l * 0.6, 0.6, L * 0.45), 0.04, g + 1); F.add(cyl(0.13, 0.15, L * 0.75, 8), '#4A5230', mat(x + (lx ? L * 0.38 : 0), 1.7, z + (lx ? 0 : L * 0.38), 0, 1, 1, 1, lx ? 0 : Math.PI / 2, lx ? Math.PI / 2 : 0)); break;
        }
        case 'sacs': { const lx = w >= d, L = lx ? w : d, n = Math.max(2, Math.round(L / 0.7)); for (let r2 = 0; r2 < 2; r2++) for (let i = 0; i < n - r2; i++) { const t = -L / 2 + L * (i + 0.5 + r2 * 0.5) / n; F.add(BOITE, (i + r2) % 2 ? '#B8A878' : '#C8B888', mat(x + (lx ? t : 0), 0.22 + r2 * 0.42, z + (lx ? 0 : t), 0, lx ? L / n * 0.95 : w, 0.4, lx ? d : L / n * 0.95), 0.08, g + i * 3 + r2); } break; }
        case 'tente': F.add(new T.CylinderGeometry(1, 1, 1, 3, 1), '#6E7350', mat(x, h / 2, z, w > d ? 0 : Math.PI / 2, (w > d ? d : w) * 0.6, w > d ? w : d, h * 0.62, 0, Math.PI / 2), 0.05, g); F.add(BOITE, '#3A3E2E', mat(x + (w > d ? w / 2 : 0), h * 0.3, z + (w > d ? 0 : d / 2), 0, w > d ? 0.04 : 0.8, h * 0.6, w > d ? 0.8 : 0.04)); break;
        default: F.add(BOITE, o.couleur || '#9C8E7A', mat(x, h / 2, z, 0, w, h, d), 0.06, g);
      }
    } else if (o.c) {
      const [x, z, r] = o.c;
      switch (o.type) {
        case 'rocher': F.add(rocheGeo(r * 1.15, g), '#CDBE9C', mat(x, r * 0.55, z, k), 0.1, g); break;
        case 'arbre':
          F.add(cyl(r * 0.28, r * 0.38, 1.6, 6), '#7A5634', mat(x, 0.8, z));
          F.add(rocheGeo(r * 2.0, g), '#5E9E3A', mat(x, 2.4, z, k), 0.12, g);
          F.add(rocheGeo(r * 1.4, g + 5), '#6FB043', mat(x + r * 0.4, 3.3, z - r * 0.3, k), 0.12, g + 5);
          break;
        case 'puits':
          F.add(cyl(r, r * 1.05, 0.9, 10), '#B7AA92', mat(x, 0.45, z), 0.08, g);
          F.add(cyl(r * 0.78, r * 0.78, 0.92, 10), '#3A4A5A', mat(x, 0.47, z));
          for (const s of [-1, 1]) F.add(BOITE, '#7A5634', mat(x + s * r * 0.85, 1.3, z, 0, 0.14, 1.7, 0.14));
          F.add(new T.CylinderGeometry(1, 1, 1, 3, 1), '#9C4A3A', mat(x, 2.25, z, 0, 0.6, r * 2.3, 0.45, 0, Math.PI / 2), 0.05, g + 3);
          break;
        case 'foin':
          F.add(cyl(r, r, r * 1.6, 10), '#E3C25B', mat(x, r, z, k * 0.7, 1, 1, 1, Math.PI / 2), 0.08, g);
          break;
        case 'caddie':
          F.add(BOITE, '#B8C2CC', mat(x, 0.55, z, k, 0.9, 0.55, 0.6), 0.05, g);
          F.add(BOITE, '#7A8794', mat(x, 0.2, z, k, 0.8, 0.08, 0.55));
          break;
        case 'lampadaire':
          F.add(cyl(0.1, 0.14, 4.2, 6), '#4A4F57', mat(x, 2.1, z));
          F.add(BOITE, '#4A4F57', mat(x + 0.5, 4.2, z, 0, 1.1, 0.12, 0.2));
          F.add(BOITE, '#FFF2B8', mat(x + 0.95, 4.1, z, 0, 0.4, 0.1, 0.3));
          break;
        case 'cypres': F.add(cyl(r * 0.2, r * 0.25, 1.0, 6), '#5A4030', mat(x, 0.5, z)); F.add(cyl(0.05, r * 0.95, 4.2, 7), '#2F5A3A', mat(x, 3.0, z, k), 0.1, g); break;
        case 'sapin': F.add(cyl(r * 0.22, r * 0.3, 1.2, 6), '#5A4030', mat(x, 0.6, z)); for (let i = 0; i < 3; i++) F.add(cyl(0.05, r * (1.5 - i * 0.35), 1.5, 7), i % 2 ? '#3E7A3A' : '#356E34', mat(x, 1.6 + i * 1.0, z, k + i), 0.08, g + i); break;
        case 'bitte': F.add(cyl(r * 0.8, r, 0.8, 8), '#3A3F4A', mat(x, 0.4, z)); F.add(cyl(r * 1.1, r * 1.1, 0.12, 8), '#3A3F4A', mat(x, 0.84, z)); break;
        case 'fontaine': F.add(cyl(r, r * 1.05, 0.7, 14), '#C8C0B0', mat(x, 0.35, z), 0.05, g); F.add(cyl(r * 0.88, r * 0.88, 0.72, 14), '#5AA8D8', mat(x, 0.37, z)); F.add(cyl(0.25, 0.35, 1.6, 8), '#C8C0B0', mat(x, 1.1, z)); F.add(cyl(0.8, 0.4, 0.3, 10), '#C8C0B0', mat(x, 1.9, z)); F.add(cyl(0.6, 0.6, 0.06, 10), '#7AC8F0', mat(x, 2.02, z)); break;
        case 'kiosque': F.add(cyl(r, r, 0.5, 8), '#E8E2D4', mat(x, 0.25, z), 0.04, g); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; F.add(cyl(0.08, 0.08, 2.6, 6), '#4A6A5A', mat(x + Math.cos(a) * r * 0.9, 1.8, z + Math.sin(a) * r * 0.9)); } F.add(cyl(0.1, r * 1.2, 1.2, 8), '#4A6A5A', mat(x, 3.6, z), 0.04, g + 1); break;
        case 'parasol': F.add(cyl(0.05, 0.05, 2.3, 6), '#E8E2D4', mat(x, 1.15, z)); F.add(cyl(0.05, 1.5, 0.5, 8), ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71'][g % 4], mat(x, 2.35, z), 0.04, g); F.add(BOITE, '#F2EDE4', mat(x + 1, 0.12, z + 0.4, 0.4, 0.7, 0.08, 1.6)); break;
        case 'betonniere': F.add(cyl(r * 0.8, r * 0.5, r * 1.6, 9), '#E8A33A', mat(x, r * 1.2, z, 0, 1, 1, 1, 0.6), 0.05, g); F.add(BOITE, '#5A5F68', mat(x, 0.35, z, 0, r * 1.6, 0.4, r)); F.add(cyl(0.3, 0.3, 0.15, 8), '#2A2A2A', mat(x - r * 0.7, 0.3, z, 0, 1, 1, 1, Math.PI / 2)); break;
        case 'pilier': F.add(cyl(r, r * 1.05, 4.2, 10), '#C8CDD2', mat(x, 2.1, z), 0.04, g); F.add(BOITE, '#2E6EB0', mat(x, 2.4, z, 0, r * 2.1, 0.5, 0.06)); F.add(cyl(r * 1.25, r * 1.25, 0.2, 10), '#8A9098', mat(x, 0.1, z)); break;
        case 'plante': F.add(cyl(r * 0.6, r * 0.45, 0.6, 8), '#C86A3A', mat(x, 0.3, z)); F.add(rocheGeo(r * 1.1, g), '#4F9A34', mat(x, 1.0, z, k), 0.12, g); break;
        case 'mirador': { F.add(BOITE, '#7A6A4A', mat(x, 4.2, z, 0, r * 2, 0.2, r * 2), 0.05, g); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.add(BOITE, '#6A5A3A', mat(x + a * r * 0.75, 2.1, z + b * r * 0.75, 0, 0.16, 4.2, 0.16)); for (const [a, b, w2, d2] of [[0, -1, 2, 0.08], [0, 1, 2, 0.08], [-1, 0, 0.08, 2], [1, 0, 0.08, 2]]) F.add(BOITE, '#8A7A5A', mat(x + a * r, 4.75, z + b * r, 0, w2 * r, 0.9, d2 * r + 0.06)); F.add(new T.ConeGeometry(r * 1.6, 1.0, 4), '#5E6345', mat(x, 5.7, z, Math.PI / 4), 0.04, g + 1); break; }
        case 'neon': // un poteau et son enseigne qui brille (couleur de l'obstacle ; matériau à part, plus bas)
          F.add(cyl(0.08, 0.1, 3.4, 6), '#2A2E36', mat(x, 1.7, z)); break;
        case 'roche': F.add(rocheGeo(r * 1.2, g), '#2E2826', mat(x, r * 0.6, z, k), 0.1, g); F.add(rocheGeo(r * 0.6, g + 3), '#3A3230', mat(x + r * 0.6, r * 0.3, z - r * 0.4, k), 0.1, g + 3); break;
        default: F.add(cyl(r, r, 1.2, 8), '#9C8E7A', mat(x, 0.6, z), 0.06, g);
      }
    }
  }

  // ─── les pièces d'un personnage (repère : il regarde vers +x, pieds en y = 0, taille 1 ≈ 1,6 m) ───
  function pieces() {
    const jambe = BOITE.clone().translate(0, -0.5, 0).scale(0.2, 0.52, 0.2); // pivot à la hanche
    const bras = BOITE.clone().translate(0, -0.5, 0).scale(0.15, 0.5, 0.15);  // pivot à l'épaule
    const torse = BOITE.clone().scale(0.34, 0.52, 0.5).translate(0, 0.78, 0);
    const tete = BOITE.clone().scale(0.4, 0.38, 0.4).translate(0.02, 1.24, 0);
    const F = new Fab();
    F.add(BOITE, '#FFF4A0', mat(0.21, 1.27, 0.09, 0, 0.04, 0.07, 0.08)).add(BOITE, '#FFF4A0', mat(0.21, 1.27, -0.09, 0, 0.04, 0.07, 0.08));
    F.add(BOITE, '#5A2A2A', mat(0.21, 1.12, 0, 0, 0.04, 0.05, 0.16));
    const yeux = F.geo();
    return { jambe, bras, torse, tete, yeux };
  }

  // des objets Kenney texturés (même palette) → une seule géométrie (position, normale, uv), dans le repère du monde
  function fusionner(objs) {
    const lst = []; let n = 0;
    for (const o of objs) o.traverse((m) => { if (m.isMesh) { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; lst.push([g, m.matrixWorld.clone()]); n += g.attributes.position.count; } });
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), v = new T.Vector3(), nm = new T.Matrix3(); let o = 0;
    for (const [g, mw] of lst) {
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; nm.getNormalMatrix(mw);
      for (let i = 0; i < pa.count; i++, o++) {
        v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(mw); P[o * 3] = v.x; P[o * 3 + 1] = v.y; P[o * 3 + 2] = v.z;
        if (na) { v.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(nm).normalize(); N[o * 3] = v.x; N[o * 3 + 1] = v.y; N[o * 3 + 2] = v.z; }
        if (ua) { U[o * 2] = ua.getX(i); U[o * 2 + 1] = ua.getY(i); }
      }
    }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(P, 3)); out.setAttribute('normal', new T.BufferAttribute(N, 3)); out.setAttribute('uv', new T.BufferAttribute(U, 2)); out.computeBoundingSphere();
    return out;
  }
  const premierMap = (sc) => { let m = null; sc.traverse((o) => { if (!m && o.isMesh && o.material && o.material.map) m = o.material.map; }); return m; };

  function creer(canvas, opts) {
    if (!T) return null;
    opts = opts || {};
    // le Lot 7a : la qualité, en paliers. « auto » (par défaut) commence au palier 0 et descend d'un cran quand les images tardent, remonte quand
    // tout file ; « haute » et « moyenne » restent fixes ; « eco » coupe les ombres et les lumières des tirs. Chaque palier : la résolution
    // maximale (points par pixel), la taille de la carte d'ombre, une ombre recalculée toutes les 1 ou 2 images, la part de particules gardées
    const PALIERS = [{ ratio: 2, ombre: 2048, chaque: 1, part: 1 }, { ratio: 1.75, ombre: 2048, chaque: 1, part: 1 }, { ratio: 1.5, ombre: 1024, chaque: 1, part: 1 }, { ratio: 1.25, ombre: 1024, chaque: 2, part: 0.7 }, { ratio: 1, ombre: 512, chaque: 2, part: 0.5 }];
    const ECO = { ratio: 1.25, ombre: 0, chaque: 1, part: 0.5 };
    const choixQ = (q) => (q === 'eco' || q === 'haute' || q === 'moyenne' ? q : 'auto');
    let reglage = choixQ(opts.qualite), qualite = reglage === 'eco' ? 'eco' : 'haute', palier = reglage === 'moyenne' ? 2 : 0;
    const QP = () => (reglage === 'eco' ? ECO : PALIERS[palier]);
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QP().ratio));
    renderer.shadowMap.enabled = qualite !== 'eco'; renderer.shadowMap.type = T.PCFSoftShadowMap; // (des ombres aux bords doux)
    renderer.shadowMap.autoUpdate = false; let nImage = 0; // (le Lot 7a : l'ombre recalculée à la demande, toutes les QP().chaque images)
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.22; // (un rendu tonal de cinéma : les lumières vives restent lisibles, les flashs ne brûlent pas l'image)
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.5, 160);
    const hemi = new T.HemisphereLight('#FFFFFF', '#6E7F52', 1.15); scene.add(hemi);
    const soleil = new T.DirectionalLight('#FFF3DC', 1.9); soleil.position.set(-9, 22, 12); soleil.castShadow = true;
    soleil.shadow.mapSize.set(QP().ombre || 1024, QP().ombre || 1024); const sc = soleil.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 70; soleil.shadow.bias = -0.0008; soleil.shadow.normalBias = 0.02;
    scene.add(soleil); scene.add(soleil.target);
    const matVC = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // ─── la météo (l'Ascension) : lumières, brume (comptée depuis la caméra, à 25 m du sol : pres > 22), la lampe du survivant, la torche du black-out, la pluie ───
    const lampe = new T.PointLight('#FFD9A0', 0, 11, 1.4); scene.add(lampe);
    const torche = new T.SpotLight('#FFF2D0', 0, 18, 0.6, 0.45, 1.1); scene.add(torche); scene.add(torche.target);
    const AMB = {
      clair: { hemi: 1.15, soleil: 1.9, pres: 34, loin: 75 },
      crepuscule: { hemi: 0.85, soleil: 1.5, couleurSoleil: '#FFB070', teinte: '#FFD8B8', brume: '#E8B48A', pres: 30, loin: 75 },
      nuit: { hemi: 0.3, soleil: 0.35, couleurSoleil: '#9FB8FF', teinte: '#8FA8D8', brume: '#18202E', pres: 27, loin: 50, lampe: 6 },
      brouillard: { hemi: 1.0, soleil: 0.8, brume: '#C9CDD2', pres: 19, loin: 36 },
      orage: { hemi: 0.5, soleil: 0.55, couleurSoleil: '#BFD0FF', teinte: '#B8C4DC', brume: '#465060', pres: 26, loin: 60, pluie: true, lampe: 5 },
      meteores: { hemi: 0.75, soleil: 1.2, couleurSoleil: '#FF9A6A', teinte: '#FFC8A8', brume: '#A8705A', pres: 28, loin: 70 },
      blackout: { hemi: 0.05, soleil: 0.0, teinte: '#8090B0', brume: '#05070C', pres: 26, loin: 40, torche: 110, lampe: 4 },
    };
    let meteoVue = null, eclairT = 0, hemiBase = 1.15;
    function ambiance(m) {
      const a = AMB[m] || AMB.clair; hemiBase = a.hemi; hemi.intensity = a.hemi; hemi.color.set(a.teinte || '#FFFFFF');
      soleil.intensity = a.soleil; soleil.color.set(a.couleurSoleil || '#FFF3DC'); const b = a.brume || (arene ? arene.brume : '#CFE7D9');
      if (scene.background && scene.background.isColor) scene.background.set(b); if (scene.fog) { scene.fog.color.set(b); scene.fog.near = a.pres; scene.fog.far = a.loin; }
      lampe.intensity = a.lampe || 0; torche.intensity = a.torche || 0; pluie.visible = !!a.pluie; meteoVue = m;
    }
    const pluie = new T.InstancedMesh(new T.BoxGeometry(0.025, 0.7, 0.025), new T.MeshBasicMaterial({ color: '#C8D8F0', transparent: true, opacity: 0.45, depthWrite: false }), 240); pluie.frustumCulled = false; pluie.visible = false; scene.add(pluie);
    const gouttes = []; for (let i = 0; i < 240; i++) gouttes.push({ x: (Math.random() - 0.5) * 34, y: Math.random() * 14, z: (Math.random() - 0.5) * 26 });
    function majMeteo(jeu, idMoi, dt) {
      if (jeu.meteo !== meteoVue) ambiance(jeu.meteo);
      const j = jeu.joueurs.find((k) => k.id === idMoi) || jeu.joueurs[0];
      if (j && (lampe.intensity || torche.intensity)) { lampe.position.set(j.x, 2.4, j.z); torche.position.set(j.x - Math.cos(j.angle) * 0.3, 2.6, j.z - Math.sin(j.angle) * 0.3); torche.target.position.set(j.x + Math.cos(j.angle) * 7, 0, j.z + Math.sin(j.angle) * 7); }
      if (eclairT > 0) { eclairT -= dt; hemi.intensity = hemiBase + Math.max(0, eclairT) * 12; } else if (hemi.intensity !== hemiBase) hemi.intensity = hemiBase;
      if (pluie.visible) {
        let n = 0; for (const g of gouttes) { g.y -= dt * 18; if (g.y < 0) { g.y += 14; g.x = (Math.random() - 0.5) * 34; g.z = (Math.random() - 0.5) * 26; } _base.makeTranslation(cam.x + g.x, g.y, cam.z + g.z); pluie.setMatrixAt(n++, _base); }
        pluie.count = n; pluie.instanceMatrix.needsUpdate = true;
      }
    }
    // les chutes annoncées : un cercle rouge au sol qui se resserre ; le météore tombe du ciel ; la foudre frappe d'un coup
    const alertes = [], anneaux = []; for (let i = 0; i < 8; i++) { const m = new T.Mesh(new T.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#FF3B2F', transparent: true, opacity: 0.8, depthWrite: false })); m.visible = false; scene.add(m); const r = new T.Mesh(new T.IcosahedronGeometry(0.45, 0), new T.MeshLambertMaterial({ color: '#5A3A2A', emissive: '#FF5A1A', emissiveIntensity: 0.9 })); r.visible = false; scene.add(r); anneaux.push({ m, r }); }
    function majAlertes(dt) {
      for (let i = alertes.length - 1; i >= 0; i--) { const a = alertes[i]; a.t += dt; if (a.t >= a.delai) alertes.splice(i, 1); }
      anneaux.forEach((o, i) => {
        const a = alertes[i]; o.m.visible = !!a; o.r.visible = !!a && (a.meteo === 'meteores' || a.meteo === 'artillerie'); if (!a) return;
        const k = a.t / a.delai; o.m.material.color.set(a.couleur || '#FF3B2F'); o.m.position.set(a.x, 0.04, a.z); o.m.scale.setScalar(a.r * (1.25 - k * 0.25)); o.m.material.opacity = 0.45 + 0.45 * Math.abs(Math.sin(a.t * 14));
        if (o.r.visible) { o.r.position.set(a.x + (1 - k) * 4, 0.3 + (1 - k) * 14, a.z - (1 - k) * 2); o.r.rotation.set(a.t * 5, a.t * 3, 0); if (Math.random() < 0.6) particule(o.r.position.x, o.r.position.y, o.r.position.z, 0, 0.5, 0, 0.5, 0.2, Math.random() < 0.5 ? '#FF8A3A' : '#8A8A8A', 0); }
      });
    }
    const P = pieces();
    let arene = null; const enArene = []; // ce qui appartient à l'arène chargée (jeté au changement)

    // ─── les zombies : cinq maillages instanciés ───
    const mkInst = (geo, n, couleur) => { const m = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: couleur || '#FFFFFF', flatShading: true }), n); m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; m.count = 0; m.setColorAt(0, new T.Color('#fff')); scene.add(m); return m; };
    const Z = { torse: mkInst(P.torse, MAX_Z), tete: mkInst(P.tete, MAX_Z), yeux: mkInst(P.yeux, MAX_Z), bras: mkInst(P.bras, MAX_Z * 2), jambe: mkInst(P.jambe, MAX_Z * 2) };
    Z.yeux.material = new T.MeshBasicMaterial({ vertexColors: true }); Z.yeux.castShadow = false;
    const corps = []; // les zombies qui tombent (animation de mort) : { type, x, z, a, t }
    const couleurs = {}; // type → { peau, haut, bas } (T.Color)
    if (D) for (const k in D.ZOMBIES) { const z = D.ZOMBIES[k]; couleurs[k] = { peau: new T.Color(z.peau), haut: new T.Color(z.haut), bas: new T.Color(z.bas) }; }
    const BLANC = new T.Color('#FFFFFF'), FLASH = new T.Color('#FFE9E0');
    const _base = new T.Matrix4(), _part = new T.Matrix4(), _r = new T.Matrix4(), _t = new T.Matrix4();
    function poser(inst, i, base, ox, oy, oz, rz, couleur, sx) {
      _t.makeTranslation(ox, oy, oz); _part.multiplyMatrices(base, _t);
      if (rz) { _r.makeRotationZ(rz); _part.multiply(_r); }
      if (sx) { _r.makeScale(sx, 1, sx); _part.multiply(_r); }
      inst.setMatrixAt(i, _part); if (couleur) inst.setColorAt(i, couleur);
    }
    function majZombies(jeu, dt) {
      let n = 0; const temps = performance.now() / 1000; for (const k in nAcc) nAcc[k] = 0;
      const dessiner = (type, x, y, z, a, marche, attaque, flash, chute, id, naissance) => {
        if (n >= MAX_Z) return;
        const Zd = D.ZOMBIES[type], k = Zd.taille * ECHELLE, large = type === 'costaud' || Zd.boss ? 1.25 : type === 'coureur' ? 0.85 : 1, C = couleurs[type];
        _q.setFromEuler(_e.set(0, -a, 0)); _v.set(x, y, z); _s.set(k * large, k, k * large);
        _base.compose(_v, _q, _s);
        if (chute) { _r.makeRotationZ(-chute * 1.45); _base.multiply(_r); } // il tombe en arrière
        const ph = marche, sw = Math.sin(ph) * 0.6, bob = Math.abs(Math.cos(ph)) * 0.04;
        const peau = flash ? FLASH : C.peau, haut = flash ? FLASH : C.haut, bas = flash ? FLASH : C.bas;
        if (bob) { _t.makeTranslation(0, bob, 0); _base.multiply(_t); }
        // le corps penché en avant (les zombies), les bras tendus
        poser(Z.torse, n, _base, 0, 0, 0, -0.12, haut);
        poser(Z.tete, n, _base, 0.06, 0, 0, -0.08, peau);
        poser(Z.yeux, n, _base, 0.06, 0, 0, -0.08, BLANC);
        const leve = -Math.PI / 2 + 0.15 + Math.sin(temps * 3 + id) * 0.08 - attaque * 1.2;
        poser(Z.bras, 2 * n, _base, 0.02, 1.0, 0.31, leve + sw * 0.25, peau);
        poser(Z.bras, 2 * n + 1, _base, 0.02, 1.0, -0.31, leve - sw * 0.25 - 0.1, peau);
        poser(Z.jambe, 2 * n, _base, 0, 0.52, 0.12, sw, bas);
        poser(Z.jambe, 2 * n + 1, _base, 0, 0.52, -0.12, -sw, bas);
        n++;
      };
      let nk = 0;
      for (const zb of jeu.zombies) {
        const Zd = D.ZOMBIES[zb.type];
        if (Zd.boss && bossPret(zb.type)) continue; // un boss KayKit : majBoss s'en charge
        const r = rendusZ.get(zb.id) || nouveauRZ(zb);
        r.vu = true; r.ph += dt * zb.vitesse * 3.2 * (zb.bouge ? 1 : 0.15);
        // sortir de terre : les 0,7 premières secondes
        const age = jeu.t - zb.naissance, y = (age < 0.7 ? -1.6 * ECHELLE * Zd.taille * (1 - age / 0.7) : 0) + (zb.saut > 0 && Zd.saut ? Math.sin((1 - zb.saut / Zd.saut.duree) * Math.PI) * 1.8 : 0);
        const clignote = Zd.kamikaze && Math.floor(temps * (zb.bouge ? 7 : 3) + zb.id) % 2 === 0;
        if (zb.terre) { if (ACC.fouisseur) accessoire('fouisseur', zb.x, 0, zb.z, zb.angle, temps + zb.id, Zd); if (Math.random() < dt * 12) particule(zb.x + (Math.random() - 0.5) * 0.7, 0.1, zb.z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.5, 0.09, Math.random() < 0.5 ? '#7A5A3A' : '#A88A5A', 0); continue; } // (sous terre : la motte qui avance)
        if (KZ && !Zd.boss) {
          // le zombie Kenney : marche (sprint pour le Coureur), le geste d'attraper quand il frappe, l'immobilité sinon
          const course = zb.type === 'coureur' && zb.bouge, clip = zb.attaque > 0 ? 'pick-up' : !zb.bouge ? 'idle' : course ? 'sprint' : 'walk';
          if (clip !== r.clip) { r.clip = clip; r.t = clip === 'pick-up' ? 0 : r.t; }
          r.t += dt * (clip === 'walk' ? zb.vitesse / 1.25 : clip === 'sprint' ? zb.vitesse / 3.2 : clip === 'pick-up' ? 2.2 : 1);
          if (jeu.noel && nBonnet < MAX_Z && !(age < 0.7)) bonnet(nBonnet++, zb.x, y, zb.z, zb.angle, Zd.taille * (zb.elite ? 1.3 : 1), temps + zb.id); // (Noël : le bonnet rouge)
          if (ACC[zb.type] && zb.type !== 'fouisseur' && (zb.type !== 'blinde' || zb.bouclier > 0)) accessoire(zb.type, zb.x, y, zb.z, zb.angle, temps + zb.id, Zd);
          if (nk < MAX_Z) poserKenney(nk++, zb.type, zb.x, y, zb.z, zb.angle, zb.saut > 0 ? 'sprint' : clip, r.t * (zb.gel > 0 ? 0.5 : 1), (zb.flash > 0 && !(zb.feu > 0)) || clignote, zb.elite ? 3 : zb.gel > 0 ? 2 : zb.feu > 0 ? 1 : zb.poison > 0 ? 5 : zb.excite > 0 ? 4 : 0);
          if (zb.etourdi > 0 && Math.random() < dt * 8) { const b = temps * 8 + zb.id; particule(zb.x + Math.cos(b) * 0.4, 2.3 * Zd.taille, zb.z + Math.sin(b) * 0.4, 0, 0.3, 0, 0.35, 0.09, '#FFE84A', 0); } // (étourdi : des étoiles)
          if (zb.poison > 0 && Math.random() < dt * 4) particule(zb.x + (Math.random() - 0.5) * 0.5, 1.6 * Zd.taille, zb.z + (Math.random() - 0.5) * 0.5, 0, 0.8, 0, 0.6, 0.1, '#8CF05A', 0);
        } else dessiner(zb.type, zb.x, y, zb.z, zb.angle, r.ph, zb.attaque > 0 ? Math.sin((0.3 - zb.attaque) / 0.3 * Math.PI) : 0, zb.flash > 0, 0, zb.id);
      }
      for (const [id, r] of rendusZ) { if (!r.vu) rendusZ.delete(id); else r.vu = false; }
      for (let i = corps.length - 1; i >= 0; i--) {
        const c = corps[i]; c.t += dt; if (c.t > 1.8) { corps.splice(i, 1); continue; }
        if (D.ZOMBIES[c.type].boss && bossPret(c.type)) { corps.splice(i, 1); continue; }
        const y = c.t > 1.1 ? -(c.t - 1.1) * 0.9 : 0;
        if (KZ && !D.ZOMBIES[c.type].boss) { if (nk < MAX_Z) poserKenney(nk++, c.type, c.x, y, c.z, c.a, 'die', c.t * 1.3, false); }
        else dessiner(c.type, c.x, y, c.z, c.a, 0, 0, false, Math.min(1, c.t / 0.35), 0);
      }
      for (const k in Z) { const m = Z[k], c = k === 'bras' || k === 'jambe' ? 2 * n : n; m.count = c; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      for (const k in ACC) { ACC[k].count = nAcc[k] || 0; ACC[k].instanceMatrix.needsUpdate = true; }
      for (const m of BONNET) { m.count = nBonnet; m.instanceMatrix.needsUpdate = true; } nBonnet = 0;
      if (KZ) { const comptes = dessinerMorceaux(nk, dt); KZ.inst.forEach((m, p) => { m.count = comptes[p]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); }
    }

    // ─── la horde en modèles Kenney (ZMODELES) : six maillages instanciés, une pièce chacun, posés avec les matrices cuites ───
    const MOD = typeof ZMODELES !== 'undefined' ? ZMODELES : null, HD = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
    let KZ = null;
    const teintes = {}; if (D) for (const k in D.ZOMBIES) teintes[k] = new T.Color(D.ZOMBIES[k].teinte || '#FFFFFF');
    const _m2 = new T.Matrix4();
    function brancherHorde() {
      const Mz = MOD.M.zombie;
      KZ = { M: Mz, k: (1.6 * ECHELLE) / Mz.hauteur, inst: Mz.pieces.map((p) => { const m = new T.InstancedMesh(p.geo, Mz.mat, MAX_Z + MAX_MORCEAUX); m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; m.count = 0; m.setColorAt(0, BLANC); scene.add(m); return m; }) };
    }
    const GEL = new T.Color('#A8E4FF'), FEU = new T.Color('#FFB27A'), OR = new T.Color('#FFD24A'), EXCITE = new T.Color('#FF6A5A'), TOXIQUE = new T.Color('#9CF06A');
    // les accessoires qui font reconnaître un type d'un coup d'œil : le sabre du sabreur, la bombe du kamikaze, le boulet du geôlier, l'aura
    // de l'invocateur (des maillages instanciés, posés à côté du zombie, dans son repère)
    const mkAcc = (geo, couleur, base) => { const m = new T.InstancedMesh(geo, base || new T.MeshLambertMaterial({ color: couleur }), 32); m.frustumCulled = false; m.count = 0; m.castShadow = !base; m.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(m); return m; };
    const ACC = {
      sabreur: mkAcc(new T.BoxGeometry(0.08, 0.08, 1.05).translate(0, 0, 0.45), '#D8E2EC'),
      kamikaze: mkAcc(new T.SphereGeometry(0.27, 8, 6), '#E04030'),
      geolier: mkAcc(new T.IcosahedronGeometry(0.24, 0), '#3A3540'),
      invocateur: mkAcc(new T.RingGeometry(0.75, 0.95, 20).rotateX(-Math.PI / 2), null, new T.MeshBasicMaterial({ color: '#B57CFF', transparent: true, opacity: 0.55, depthWrite: false })),
      // le Lot 5 : le bouclier du blindé (une plaque rivetée devant lui), la motte du fouisseur sous terre, la poche d'œufs de la pondeuse,
      // le cercle rouge du hurleur
      blinde: mkAcc(new T.BoxGeometry(0.12, 0.9, 0.8), '#A7B1BE'),
      fouisseur: mkAcc(new T.SphereGeometry(0.55, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), '#7A5A3A'),
      pondeuse: mkAcc(new T.IcosahedronGeometry(0.34, 1), '#E8B8D8'),
      hurleur: mkAcc(new T.RingGeometry(0.7, 0.86, 20).rotateX(-Math.PI / 2), null, new T.MeshBasicMaterial({ color: '#FF5A4A', transparent: true, opacity: 0.6, depthWrite: false })),
    };
    const nAcc = {}; const _ao = new T.Vector3();
    function accessoire(type, x, y, z, a, temps, Zd) {
      const m = ACC[type]; if (!m || (nAcc[type] || 0) >= 32) return; const i = nAcc[type] = (nAcc[type] || 0); nAcc[type]++;
      const k = Zd.taille, ca = Math.cos(a), sa = Math.sin(a);
      if (type === 'sabreur') { _ao.set(x + ca * 0.25 * k - sa * 0.38 * k, y + 0.95 * k, z + sa * 0.25 * k + ca * 0.38 * k); _q.setFromEuler(_e.set(-0.35, Math.PI / 2 - a, 0)); }
      else if (type === 'kamikaze') { _ao.set(x - ca * 0.42 * k, y + 1.25 * k + Math.sin(temps * 9) * 0.04, z - sa * 0.42 * k); _q.identity(); }
      else if (type === 'blinde') { const e = k * ECHELLE; _ao.set(x + ca * 0.72 * e, y + 0.62 * e, z + sa * 0.72 * e); _q.setFromEuler(_e.set(0, -a, 0.42)); _s.set(e, e, e); _base.compose(_ao, _q, _s); m.setMatrixAt(i, _base); return; } // (devant lui, penché en arrière : on le voit d'en haut)
      else if (type === 'fouisseur') { _ao.set(x, 0.02, z); _q.setFromEuler(_e.set(0, temps * 0.5, 0)); _s.set(1 + Math.sin(temps * 13) * 0.08, 1 + Math.sin(temps * 17) * 0.2, 1 + Math.cos(temps * 11) * 0.08); _base.compose(_ao, _q, _s); m.setMatrixAt(i, _base); return; }
      else if (type === 'pondeuse') { const g = 1 + Math.sin(temps * 4) * 0.07; _ao.set(x - ca * 0.5 * k, y + 0.95 * k, z - sa * 0.5 * k); _q.identity(); _s.set(g * k, g * 0.85 * k, g * k); _base.compose(_ao, _q, _s); m.setMatrixAt(i, _base); return; }
      else if (type === 'hurleur') { const g = 1 + (temps * 0.8 % 1) * 0.5; _ao.set(x, 0.05, z); _q.identity(); _s.set(g, 1, g); _base.compose(_ao, _q, _s); m.setMatrixAt(i, _base); return; }
      else if (type === 'geolier') { _ao.set(x - sa * -0.5 * k + ca * 0.1, y + 0.35, z + ca * -0.5 * k + sa * 0.1); _q.setFromEuler(_e.set(temps, temps * 0.7, 0)); }
      else { _ao.set(x, 0.04, z); _q.setFromEuler(_e.set(0, temps * 1.5, 0)); }
      _s.set(1, 1, 1); _base.compose(_ao, _q, _s); m.setMatrixAt(i, _base);
    }
    // Noël (Lot 5e) : le bonnet rouge des zombies (un cône, son revers blanc, son pompon), posé sur la tête, un peu en avant
    const mkBonnet = (geo, c) => { const m = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: c }), MAX_Z); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(m); return m; };
    const BONNET = [mkBonnet(new T.ConeGeometry(0.2, 0.42, 8).translate(0, 0.21, 0).rotateZ(-0.35), '#D8283A'), mkBonnet(new T.CylinderGeometry(0.23, 0.23, 0.09, 10), '#F4F4F4'), mkBonnet(new T.SphereGeometry(0.075, 6, 5).translate(0.14, 0.4, 0), '#FFFFFF')];
    let nBonnet = 0;
    function bonnet(i, x, y, z, a, k, t) { const e = k * ECHELLE, ca = Math.cos(a), sa = Math.sin(a);
      _ao.set(x + ca * 0.12 * e, y + 1.5 * e + Math.abs(Math.sin(t * 4)) * 0.02, z + sa * 0.12 * e); _q.setFromEuler(_e.set(0, -a, 0)); _s.set(e, e, e); _base.compose(_ao, _q, _s);
      for (const m of BONNET) m.setMatrixAt(i, _base);
    }
    function poserKenney(i, type, x, y, z, a, clip, t, flash, etat) {
      const Zd = D.ZOMBIES[type], s = KZ.k * Zd.taille * (etat === 3 ? 1.3 : 1), large = type === 'costaud' ? 1.22 : type === 'coureur' ? 0.9 : 1;
      _q.setFromEuler(_e.set(0, Math.PI / 2 - a, 0)); _v.set(x, y, z); _s.set(s * large, s, s * large); _base.compose(_v, _q, _s); // le modèle regarde vers +z
      const C = KZ.M.cuits[clip] || KZ.M.cuits.walk, np = KZ.M.pieces.length;
      let f = Math.floor(t * ZMODELES.FPS); f = C.boucle ? ((f % C.n) + C.n) % C.n : Math.min(C.n - 1, Math.max(0, f));
      const couleur = flash ? FLASH : etat === 3 ? OR : etat === 2 ? GEL : etat === 1 ? FEU : etat === 4 ? EXCITE : etat === 5 ? TOXIQUE : teintes[type];
      for (let p = 0; p < np; p++) { _m2.fromArray(C.mats, (f * np + p) * 16); _part.multiplyMatrices(_base, _m2); KZ.inst[p].setMatrixAt(i, _part); KZ.inst[p].setColorAt(i, couleur); }
    }

    // ─── les zombies en morceaux : à la mort, les six pièces du zombie Kenney s'envolent (poussées par le dernier coup), rebondissent,
    // puis s'enfoncent dans le sol. Elles réutilisent les maillages instanciés de la horde (des instances en plus, aucun appel de dessin en plus).
    const morceaux = [], _p3 = new T.Vector3(), _q2 = new T.Quaternion(), _s3 = new T.Vector3(), _qd = new T.Quaternion(), _ax = new T.Vector3();
    function eclater(e) {
      const Zd = D.ZOMBIES[e.type], C = KZ.M.cuits.walk, np = KZ.M.pieces.length, s = KZ.k * Zd.taille, large = e.type === 'costaud' ? 1.22 : e.type === 'coureur' ? 0.9 : 1;
      _q.setFromEuler(_e.set(0, Math.PI / 2 - (e.a || 0), 0)); _v.set(e.x, 0, e.z); _s.set(s * large, s, s * large); _base.compose(_v, _q, _s);
      let kx = +e.kx || 0, kz = +e.kz || 0; const kl = Math.hypot(kx, kz); if (kl > 1e-3) { kx /= kl; kz /= kl; } else { const a = Math.random() * 6.28; kx = Math.cos(a); kz = Math.sin(a); }
      const force = e.fort ? 1.5 : 1;
      while (morceaux.length + np > MAX_MORCEAUX) morceaux.shift();
      for (let p = 0; p < np; p++) {
        _m2.fromArray(C.mats, p * 16); _part.multiplyMatrices(_base, _m2); _part.decompose(_p3, _q2, _s3);
        const tete = /head/.test(KZ.M.pieces[p].nom), v = (2 + Math.random() * 3) * force;
        morceaux.push({ p, type: e.type, x: _p3.x, y: _p3.y, z: _p3.z, q: _q2.clone(), sc: _s3.clone(), sol: 0.06 * s,
          vx: kx * v + (Math.random() - 0.5) * 3, vy: (tete ? 6 : 3) * force + Math.random() * 3, vz: kz * v + (Math.random() - 0.5) * 3,
          ax: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: (6 + Math.random() * 10) * (Math.random() < 0.5 ? -1 : 1), t: 0 });
      }
      for (let k = 0; k < 10; k++) particule(e.x, 0.9, e.z, (Math.random() - 0.5) * 5 + kx * 2, 2 + Math.random() * 4, (Math.random() - 0.5) * 5 + kz * 2, 0.7, 0.12, '#6FA338', 0.3);
    }
    function dessinerMorceaux(nk, dt) {
      const comptes = KZ.inst.map(() => nk);
      for (let i = morceaux.length - 1; i >= 0; i--) {
        const m = morceaux[i]; m.t += dt;
        if (m.t > 3.2) { morceaux.splice(i, 1); continue; }
        if (m.t < 2.3) {
          m.vy -= 18 * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
          if (m.y < m.sol) { m.y = m.sol; m.vy = Math.abs(m.vy) > 1.5 ? -m.vy * 0.35 : 0; m.vx *= 0.55; m.vz *= 0.55; m.w *= 0.5; }
          _qd.setFromAxisAngle(m.ax, m.w * dt); m.q.premultiply(_qd);
        } else m.y -= dt * 0.5; // il s'enfonce
      }
      for (const m of morceaux) {
        const n = comptes[m.p]; if (n >= MAX_Z + MAX_MORCEAUX) continue;
        _p3.set(m.x, m.y, m.z); _part.compose(_p3, m.q, m.sc); KZ.inst[m.p].setMatrixAt(n, _part); KZ.inst[m.p].setColorAt(n, teintes[m.type]); comptes[m.p] = n + 1;
      }
      return comptes;
    }
    // ─── les particules : douilles, gouttes, étincelles (un seul maillage instancié, une couleur par instance) ───
    // le Lot 7a : les particules vivent dans une réserve fixe (des tableaux de nombres, la plus ancienne remplacée quand tout est pris) et leurs
    // couleurs sont gardées une fois lues : plus aucun objet créé par particule, donc plus de ramasse-miettes qui fait sauter une image
    const geoPart = new T.BoxGeometry(1, 1, 1);
    const instPart = new T.InstancedMesh(geoPart, new T.MeshBasicMaterial({ color: '#FFFFFF' }), MAX_PARTICULES); instPart.frustumCulled = false; instPart.count = 0; instPart.setColorAt(0, BLANC); scene.add(instPart);
    const PK = 11, pv = new Float32Array(MAX_PARTICULES * PK), pc = new Array(MAX_PARTICULES).fill(null); let iPart = 0, nPart = 0; // x y z vx vy vz vie t taille rebond r
    const coulParts = new Map(); const coulPart = (c) => { let o = coulParts.get(c); if (!o) { o = new T.Color(c); coulParts.set(c, o); } return o; };
    const particules = { get length() { return nPart; } };
    function particule(x, y, z, vx, vy, vz, vie, taille, coul, rebond) {
      const part = QP().part; if (part < 1 && Math.random() > part) return;
      const i = iPart, o = i * PK; iPart = (iPart + 1) % MAX_PARTICULES; if (!(pv[o + 7] < pv[o + 6])) nPart++;
      pv[o] = x; pv[o + 1] = y; pv[o + 2] = z; pv[o + 3] = vx; pv[o + 4] = vy; pv[o + 5] = vz; pv[o + 6] = vie; pv[o + 7] = 0; pv[o + 8] = taille; pv[o + 9] = rebond || 0; pv[o + 10] = Math.random() * 6;
      pc[i] = coulPart(coul);
    }
    function majParticules(dt) {
      let n = 0, vivantes = 0;
      for (let i = 0; i < MAX_PARTICULES; i++) {
        const o = i * PK; if (!(pv[o + 7] < pv[o + 6])) continue;
        pv[o + 7] += dt; const t = pv[o + 7], vie = pv[o + 6]; if (t >= vie) continue; vivantes++;
        pv[o + 4] -= 16 * dt; pv[o] += pv[o + 3] * dt; pv[o + 1] += pv[o + 4] * dt; pv[o + 2] += pv[o + 5] * dt; pv[o + 10] += dt * 9;
        if (pv[o + 1] < 0.03) { pv[o + 1] = 0.03; pv[o + 4] = -pv[o + 4] * pv[o + 9]; pv[o + 3] *= 0.5; pv[o + 5] *= 0.5; }
        const k = pv[o + 8] * (t > vie * 0.7 ? Math.max(0.05, (vie - t) / (vie * 0.3)) : 1), r = pv[o + 10];
        _q.setFromEuler(_e.set(r, r * 0.7, 0)); _v.set(pv[o], pv[o + 1], pv[o + 2]); _s.set(k, k * 0.6, k * 1.6); _base.compose(_v, _q, _s);
        instPart.setMatrixAt(n, _base); instPart.setColorAt(n, pc[i]); n++;
      }
      nPart = vivantes;
      instPart.count = n; instPart.instanceMatrix.needsUpdate = true; if (instPart.instanceColor) instPart.instanceColor.needsUpdate = true;
    }
    // la caméra de cinéma : elle plonge sur un point (le boss abattu) puis revient
    let cine = null;
    function cinema(x, z, duree) { cine = { x, z, t: 0, duree: duree || 1.8 }; }

    // ─── les boss en modèles KayKit : de vrais personnages à squelette, un seul à la fois à l'écran ───
    const bossVus = new Map(); // id du zombie → { o, mixer, actions, act, mats, type, mort, coup }
    const bossPret = (type) => !!(MOD && MOD.pret && HD && MOD.M.boss[type]);
    function nouveauBoss(zb) {
      const B = MOD.M.boss[zb.type], Zd = D.ZOMBIES[zb.type], o = HD.SkeletonUtils.clone(B.scene), mats = [];
      o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); m.castShadow = true; m.frustumCulled = false; } });
      const k = (1.6 * ECHELLE * Zd.taille) / B.hauteur; o.scale.setScalar(k);
      const mixer = new T.AnimationMixer(o), A = MOD.M.anims[Zd.rig], trouver = (re) => A.find((c) => re.test(c.name));
      const actions = {};
      for (const [nom, re] of [['marche', /^Walking_A$/], ['course', /^Running_A$/], ['repos', /^Idle_A$/], ['touche', /^Hit_A$/], ['mort', /^Death_A$/], ['coup', /Unarmed_Smash|Unarmed_Attack_Punch_A|Unarmed_Punch|2H_Slam|Chop/]]) {
        const c = trouver(re); if (!c) continue; const act = mixer.clipAction(c); if (nom === 'mort' || nom === 'coup' || nom === 'touche') { act.setLoop(T.LoopOnce, 1); act.clampWhenFinished = nom === 'mort'; } actions[nom] = act;
      }
      scene.add(o);
      const b = { o, mixer, actions, act: '', mats, type: zb.type, mort: 0, coup: 0, sol: B.sol * k, vu: true };
      bossVus.set(zb.id, b); return b;
    }
    function jouerBoss(b, nom, fondu) {
      const a = b.actions[nom]; if (!a || b.act === nom) return;
      const prec = b.actions[b.act]; a.reset(); a.play(); if (prec) a.crossFadeFrom(prec, fondu == null ? 0.2 : fondu, false); b.act = nom;
    }
    function majBoss(jeu, dt) {
      for (const [, b] of bossVus) b.vu = false;
      for (const zb of jeu.zombies) {
        const Zd = D.ZOMBIES[zb.type]; if (!Zd.boss || !bossPret(zb.type)) continue;
        const b = bossVus.get(zb.id) || nouveauBoss(zb); b.vu = true;
        const age = jeu.t - zb.naissance, A5 = Zd.attaque, bond = zb.saut > 0 && A5 && A5.duree ? Math.sin((1 - zb.saut / A5.duree) * Math.PI) * 2.6 : 0;
        const y = (age < 0.7 ? -1.6 * ECHELLE * Zd.taille * (1 - age / 0.7) : 0) + bond;
        b.o.position.set(zb.x, y - b.sol, zb.z); b.o.rotation.set(0, Math.PI / 2 - zb.angle, 0);
        b.coup = Math.max(0, b.coup - dt);
        if (zb.attaque > 0.22 && b.coup <= 0 && b.actions.coup) { b.act = ''; jouerBoss(b, 'coup', 0.1); b.coup = b.actions.coup.getClip().duration * 0.8; }
        else if (b.coup <= 0) { const v = zb.bouge ? (zb.vitesse > 1.8 ? 'course' : 'marche') : 'repos'; jouerBoss(b, v); if (b.actions[v]) b.actions[v].timeScale = v === 'marche' ? Math.max(0.6, zb.vitesse / 1.1) : 1; }
        const rage = (zb.phase || 1) >= 3 ? 0.16 + Math.sin(performance.now() / 160) * 0.08 : 0; // (la phase 3 : il rougeoie)
        const rouge = zb.flash > 0 ? 0.35 : rage; for (const m of b.mats) if (m.emissive) m.emissive.setRGB(rouge, rouge * 0.15, rouge * 0.1);
        if (rage && Math.random() < dt * 6) particule(zb.x + (Math.random() - 0.5) * 1.2, 1 + Math.random() * 2, zb.z + (Math.random() - 0.5) * 1.2, 0, 1.5, 0, 0.6, 0.12, '#FF5A3A', 0);
        b.mixer.update(dt);
      }
      for (const [id, b] of bossVus) {
        if (b.vu) continue;
        if (!b.mort) { b.mort = 0.0001; b.act = ''; jouerBoss(b, 'mort', 0.1); for (const m of b.mats) if (m.emissive) m.emissive.setRGB(0, 0, 0); }
        b.mort += dt; b.mixer.update(dt);
        if (b.mort > 2.2) b.o.position.y -= dt * 1.2;
        if (b.mort > 3.4) { scene.remove(b.o); b.mixer.stopAllAction(); bossVus.delete(id); }
      }
    }
    const rendusZ = new Map(); const nouveauRZ = (zb) => { const r = { ph: Math.random() * 6, t: Math.random() * 3, clip: '', vu: false }; rendusZ.set(zb.id, r); return r; }; // t : le temps dans le clip Kenney

    // ─── le survivant (et ses copains) : des maillages simples, animés ───
    function nouveauSurvivant(couleur) {
      const g = new T.Group();
      const F = new Fab();
      F.add(BOITE, couleur || '#E3B663', mat(0, 0.78, 0, 0, 0.34, 0.52, 0.5), 0.03, 7);           // le haut
      F.add(BOITE, '#F2C7A0', mat(0.02, 1.24, 0, 0, 0.38, 0.36, 0.38));                              // la tête
      F.add(BOITE, '#5B4630', mat(0.0, 1.45, 0, 0, 0.42, 0.1, 0.42));                                // les cheveux
      F.add(BOITE, '#C0743A', mat(0.12, 1.42, 0, 0, 0.3, 0.08, 0.44));                               // la casquette
      F.add(BOITE, '#2B2A2A', mat(0.21, 1.27, 0.09, 0, 0.03, 0.06, 0.06)).add(BOITE, '#2B2A2A', mat(0.21, 1.27, -0.09, 0, 0.03, 0.06, 0.06));
      F.add(BOITE, '#8C6A3F', mat(-0.26, 0.86, 0, 0, 0.2, 0.42, 0.4), 0.05, 3);                      // le sac à dos
      F.add(BOITE, '#E0B24A', mat(-0.37, 0.9, 0, 0, 0.04, 0.12, 0.28));
      const corpsM = new T.Mesh(F.geo(), matVC); corpsM.castShadow = true; g.add(corpsM);
      const mk = (geo, c) => { const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: c, flatShading: true })); m.castShadow = true; g.add(m); return m; };
      const jg = mk(P.jambe, '#4E5A6E'), jd = mk(P.jambe, '#4E5A6E'); jg.position.set(0, 0.52, 0.12); jd.position.set(0, 0.52, -0.12);
      const bg = mk(P.bras, '#E3B663'), bd = mk(P.bras, '#E3B663'); bg.position.set(0.02, 1.0, 0.3); bd.position.set(0.02, 1.0, -0.3);
      const arme = new T.Mesh(BOITE, new T.MeshLambertMaterial({ color: '#3A3D44', flatShading: true })); arme.castShadow = true; g.add(arme);
      const ombre = new T.Mesh(new T.CircleGeometry(0.42, 12), new T.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false })); ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.02; g.add(ombre);
      const anneau = new T.Mesh(new T.RingGeometry(0.5, 0.62, 24), new T.MeshBasicMaterial({ color: '#FFD84A', transparent: true, opacity: 0.85, depthWrite: false })); anneau.rotation.x = -Math.PI / 2; anneau.position.y = 0.03; g.add(anneau);
      g.scale.setScalar(ECHELLE * 1.04);
      scene.add(g);
      return { g, jg, jd, bg, bd, arme, anneau, ph: 0, armeId: '' };
    }
    // le survivant Kenney (le fossoyeur du Graveyard Kit) : les jambes jouent la marche ou le repos, le haut du corps tient l'arme ou tire
    // (deux demi-clips : les pistes des jambes d'un côté, celles du torse, des bras et de la tête de l'autre) ; l'arme est accrochée au torse
    function nouveauSurvivantK(skin) {
      const S = MOD.survivant(skin || 'gardien'), g = new T.Group(), o = S.gltf.scene.clone(true), cache = new Map();
      o.traverse((m) => { if (m.isMesh) { if (!cache.has(m.material)) cache.set(m.material, new T.MeshLambertMaterial({ map: S.map || m.material.map })); m.material = cache.get(m.material); m.castShadow = true; } });
      const k = (1.6 * ECHELLE * 1.04) / S.hauteur; o.scale.setScalar(k); g.add(o);
      const mixer = new T.AnimationMixer(o), clip = (n) => S.gltf.animations.find((c) => c.name === n);
      const moitie = (n, re) => { const c = clip(n); return c ? mixer.clipAction(new T.AnimationClip(n + (re === JAMBES ? '-jambes' : '-haut'), c.duration, c.tracks.filter((t) => re.test(t.name.split('.')[0])))) : null; };
      const act = { marche: moitie('walk', JAMBES), repos: moitie('idle', JAMBES), tir: moitie('holding-both-shoot', HAUT), tenir: moitie('holding-both', HAUT), mort: clip('die') ? mixer.clipAction(clip('die')) : null };
      if (act.mort) { act.mort.setLoop(T.LoopOnce, 1); act.mort.clampWhenFinished = true; }
      const torse = o.getObjectByName('torso') || o;
      const arme = new T.Mesh(BOITE, new T.MeshLambertMaterial({ color: '#3A3D44', flatShading: true })); arme.castShadow = true; torse.add(arme);
      const ombre = new T.Mesh(new T.CircleGeometry(0.55, 12), new T.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false })); ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.02; g.add(ombre);
      const anneau = new T.Mesh(new T.RingGeometry(0.62, 0.76, 24), new T.MeshBasicMaterial({ color: '#FFD84A', transparent: true, opacity: 0.85, depthWrite: false })); anneau.rotation.x = -Math.PI / 2; anneau.position.y = 0.03; g.add(anneau);
      scene.add(g);
      const s = { g, o, k, mixer, act, jambes: '', haut: '', arme, anneau, armeId: '', modele: true, mort: false, skin: S.id, emote: clip('emote-yes') ? mixer.clipAction(clip('emote-yes')) : null };
      s.mains = mesurerMains(s); return s;
    }
    // où sont les mains dans la pose « tenir à deux mains » (le bout de chaque bras, dans le repère du torse) : l'arme s'y pose, quel que
    // soit le modèle (le fossoyeur a son torse à la taille, les Blocky aux hanches ; une valeur fixe mettait l'arme au ventre)
    function mesurerMains(s) {
      const torse = s.arme.parent, bd = s.o.getObjectByName('arm-right'), bg = s.o.getObjectByName('arm-left');
      if (!torse || !bd || !bg || !s.act.tenir) return null;
      s.act.tenir.reset().play(); s.mixer.update(0.05); s.g.updateMatrixWorld(true);
      const v = new T.Vector3(), ep = new T.Vector3();
      const bout = (bras) => { let best = null, d = -1; bras.getWorldPosition(ep); bras.traverse((m) => { if (!m.isMesh) return; const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const dd = v.distanceTo(ep); if (dd > d) { d = dd; best = v.clone(); } } }); return best ? torse.worldToLocal(best) : null; };
      const a = bout(bd), b = bout(bg); s.act.tenir.stop(); s.mixer.update(0);
      return a && b ? { y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 } : null;
    }
    const JAMBES = /^(leg-left|leg-right|root)$/, HAUT = /^(torso|arm-left|arm-right|head)$/;
    const changer = (s, cote, nom) => { if (s[cote] === nom) return; const a = s.act[nom], p = s.act[s[cote]]; if (a) { a.reset(); a.play(); if (p) a.crossFadeFrom(p, 0.15, false); } s[cote] = nom; };
    function majSurvivantK(s, j, dt) {
      s.g.position.set(j.x, 0, j.z); s.g.rotation.set(0, Math.PI / 2 - j.angle, 0);
      if (!j.vivant) { if (!s.mort && s.act.mort) { s.mort = true; s.mixer.stopAllAction(); s.act.mort.reset().play(); s.jambes = s.haut = ''; } s.mixer.update(dt); return; }
      if (s.mort) { s.mort = false; s.mixer.stopAllAction(); s.jambes = s.haut = ''; }
      changer(s, 'jambes', j.bouge > 0.05 ? 'marche' : 'repos'); if (s.act.marche) s.act.marche.timeScale = 0.6 + j.bouge * 0.9;
      changer(s, 'haut', j.visee ? 'tir' : 'tenir');
      const s2 = j.armes[j.main], id = s2 ? s2.id : 'pistolet', fin = (j.finitions && j.finitions[id]) || '';
      if (id !== s.armeId || fin !== s.fin || s.armesVues !== MOD.armesPretes) {
        s.armeId = id; s.fin = fin; s.armesVues = MOD.armesPretes; const L = longueur(id) * 1.2;
        if (s.blaster) { s.blaster.parent.remove(s.blaster); s.blaster = null; }
        const b = MOD.arme(id, L / s.k, fin);
        // dans les mains : la poignée (le tiers arrière de l'arme) entre les deux mains, l'arme posée juste au-dessus
        const m = s.mains, my = m ? m.y + 0.03 / s.k : 0.06 / s.k, mz = m ? m.z + (L * 0.2 - 0.04) / s.k : (0.22 + L / 2) / s.k;
        if (b) { b.position.set(0, my, mz); s.arme.parent.add(b); s.blaster = b; s.arme.visible = false; }
        else { s.arme.visible = true; s.arme.scale.set(0.11 / s.k, 0.13 / s.k, L / s.k); s.arme.position.set(0, my, mz); s.arme.material.color.set(D.ARMES[id] ? D.ARMES[id].couleur : '#333').multiplyScalar(0.55); }
      }
      s.mixer.update(dt);
      s.g.visible = !(j.invul > 0 && j.invul < 10 && Math.floor(j.invul * 20) % 2 === 0); // (le clignotement après un coup ; pas l'invincibilité de la démonstration, 99 s)
      rouler(s, j, dt);
    }
    // la roulade : un salto avant dans le sens du bond (le tour autour de la taille, pas des pieds), un peu de poussière
    function rouler(s, j, dt) {
      s.g.rotation.order = 'YXZ';
      if (!(j.roule > 0) || !j.vivant) { s.g.rotation.x = 0; if (s.anneau) s.anneau.visible = j.vivant && !j.parti; return; }
      const k = 1 - j.roule / D.ROULADE.duree, th = k * Math.PI * 2, a = Math.atan2(j.rdz || 0, j.rdx || 1), h = 0.85;
      s.g.rotation.set(th, Math.PI / 2 - a, 0); s.g.position.set(j.x - Math.cos(a) * h * Math.sin(th), h - h * Math.cos(th), j.z - Math.sin(a) * h * Math.sin(th));
      if (s.anneau) s.anneau.visible = false;
      if (Math.random() < dt * 30) particule(j.x + (Math.random() - 0.5) * 0.5, 0.1, j.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5, 0.45, 0.13, '#C8B48A', 0);
    }
    const survivants = new Map();
    const LONGUEUR = { pistolet: 0.32, revolver: 0.4, pompe: 0.75, mitraillette: 0.55, fusil: 0.8, precision: 0.95, canon: 1.05, minigun: 0.85, doublecanon: 0.78, roquettes: 0.95 };
    const PAR_FAMILLE = { lame: 0.62, pistolet: 0.36, mitraillette: 0.55, pompe: 0.72, fusil: 0.8, sniper: 0.95, lanceur: 0.8, energie: 0.7, flamme: 0.75 };
    const longueur = (id) => LONGUEUR[id] || (D.ARMES[id] && PAR_FAMILLE[D.ARMES[id].famille]) || 0.4;
    function majSurvivants(jeu, idMoi, dt) {
      const vus = new Set();
      for (const j of jeu.joueurs) {
        vus.add(j.id);
        let s = survivants.get(j.id);
        const voulu = MOD && MOD.pret ? MOD.survivant(j.skin || 'gardien').id : '';
        if (s && s.modele && s.skin !== voulu) { scene.remove(s.g); s = null; } // un autre skin (ou ses textures enfin prêtes)
        if (!s) { s = MOD && MOD.pret ? nouveauSurvivantK(j.skin) : nouveauSurvivant(j.id === idMoi ? '#E3B663' : '#7FB3E0'); survivants.set(j.id, s); s.anneau.material.color.set(j.id === idMoi ? '#FFD84A' : j.couleur || '#7FB3E0'); }
        s.g.visible = !j.parti; s.anneau.visible = j.vivant && !j.parti; // en coop, chacun son anneau (le sien en jaune)
        if (s.modele) { majSurvivantK(s, j, dt); continue; }
        s.g.position.set(j.x, 0, j.z); s.g.rotation.set(0, -j.angle, 0);
        if (!j.vivant) { s.g.rotation.z = Math.min(Math.PI / 2, (s.g.rotation.z || 0) + dt * 5); s.g.position.y = 0.1; continue; }
        s.g.rotation.z = 0;
        // la marche : les jambes suivent la vitesse ; le haut du corps vise (les bras tiennent l'arme droit devant)
        s.ph += dt * 11 * j.bouge; const sw = Math.sin(s.ph) * 0.7 * j.bouge;
        // jambes : dans le sens de la marche, même si l'on vise ailleurs (on pivote leur angle relatif)
        s.jg.rotation.z = sw; s.jd.rotation.z = -sw;
        const s2 = j.armes[j.main], id = s2 ? s2.id : 'pistolet';
        if (id !== s.armeId) { s.armeId = id; const L = longueur(id); s.arme.scale.set(L, 0.12, 0.1); s.arme.material.color.set(D.ARMES[id] ? D.ARMES[id].couleur : '#333').multiplyScalar(0.55); s.longueur = L; }
        s.recul = Math.max(0, (s.recul || 0) - dt * 8);
        s.bg.rotation.z = -Math.PI / 2 + 0.05 + s.recul * 0.3; s.bd.rotation.z = -Math.PI / 2 + 0.05 + s.recul * 0.3;
        s.bg.position.z = 0.22; s.bd.position.z = -0.22;
        s.arme.position.set(0.48 + s.longueur / 2 - s.recul * 0.08, 1.0, 0);
        // clignote un peu après un coup reçu
        s.g.visible = !(j.invul > 0 && j.invul < 10 && Math.floor(j.invul * 20) % 2 === 0); // (le clignotement après un coup ; pas l'invincibilité de la démonstration, 99 s)
      }
      for (const [id, s] of survivants) if (!vus.has(id)) { scene.remove(s.g); survivants.delete(id); }
    }

    // ─── les compagnons (Lot 5e) : des modèles faits main, tournés vers +x ; parties animées : pattes, queue, ailes, antenne ───
    function compagnonMesh(type) {
      const g = new T.Group(), F = new Fab(), parts = {}, mk = (geo, c, x, y, z) => { const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: c, flatShading: true })); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
      if (type === 'chien' || type === 'chat' || type === 'renne') {
        const c = type === 'chien' ? '#B07A45' : type === 'chat' ? '#F2A65A' : '#A0703A', k = type === 'renne' ? 1.35 : type === 'chat' ? 0.8 : 1;
        F.add(BOITE, c, mat(0, 0.45 * k, 0, 0, 0.7 * k, 0.3 * k, 0.3 * k), 0.05, 61); F.add(BOITE, c, mat(0.42 * k, 0.62 * k, 0, 0, 0.3 * k, 0.26 * k, 0.26 * k), 0.05, 62);
        F.add(BOITE, type === 'chat' ? '#FFF2E0' : '#E8D2B0', mat(0.6 * k, 0.56 * k, 0, 0, 0.12 * k, 0.12 * k, 0.16 * k)); F.add(BOITE, type === 'renne' ? '#E0283A' : '#2A2A2A', mat(0.67 * k, 0.6 * k, 0, 0, 0.05 * k, 0.07 * k, 0.07 * k));
        for (const sg of [-1, 1]) F.add(BOITE, '#1A1A1A', mat(0.55 * k, 0.68 * k, sg * 0.07 * k, 0, 0.03, 0.05 * k, 0.04 * k));
        if (type === 'chien') for (const sg of [-1, 1]) F.add(BOITE, '#7A5030', mat(0.38 * k, 0.74 * k, sg * 0.12 * k, 0.3 * sg, 0.08, 0.18, 0.1));
        if (type === 'chat') for (const sg of [-1, 1]) F.add(new T.ConeGeometry(0.06, 0.14, 4), c, mat(0.42 * k, 0.8 * k, sg * 0.08, 0));
        if (type === 'renne') for (const sg of [-1, 1]) { F.add(BOITE, '#E8D8B0', mat(0.36 * k, 0.95 * k, sg * 0.12, 0, 0.04, 0.32, 0.04)); F.add(BOITE, '#E8D8B0', mat(0.42 * k, 1.05 * k, sg * 0.18, 0, 0.18, 0.04, 0.04)); F.add(BOITE, '#E8D8B0', mat(0.3 * k, 1.08 * k, sg * 0.16, 0, 0.04, 0.12, 0.04)); }
        const corps = new T.Mesh(F.geo(), matVC); corps.castShadow = true; g.add(corps); parts.corps = corps;
        parts.pattes = [[0.22, 0.12], [0.22, -0.12], [-0.22, 0.12], [-0.22, -0.12]].map(([x, z]) => { const m = mk(new T.BoxGeometry(0.08 * k, 0.32 * k, 0.08 * k).translate(0, -0.16 * k, 0), c, x * k, 0.34 * k, z * k); return m; });
        parts.queue = mk(new T.BoxGeometry(0.06, type === 'chat' ? 0.34 : 0.22, 0.06).translate(0, type === 'chat' ? 0.17 : 0.11, 0), type === 'renne' ? '#F2EDE4' : c, -0.36 * k, 0.52 * k, 0); parts.queue.rotation.z = type === 'chat' ? 0.2 : 0.9;
        g.userData.sol = true;
      } else if (type === 'corbeau') {
        F.add(BOITE, '#2E2E36', mat(0, 0, 0, 0, 0.42, 0.18, 0.18), 0.05, 63); F.add(BOITE, '#2E2E36', mat(0.25, 0.06, 0, 0, 0.16, 0.15, 0.14)); F.add(new T.ConeGeometry(0.04, 0.14, 4), '#E8B830', mat(0.38, 0.05, 0, 0, 1, 1, 1, 0, -Math.PI / 2)); F.add(BOITE, '#2E2E36', mat(-0.28, 0.02, 0, 0, 0.18, 0.04, 0.16));
        F.add(BOITE, '#FFFFFF', mat(0.3, 0.1, 0.06, 0, 0.03, 0.03, 0.03)); F.add(BOITE, '#FFFFFF', mat(0.3, 0.1, -0.06, 0, 0.03, 0.03, 0.03));
        const corps = new T.Mesh(F.geo(), matVC); corps.castShadow = true; g.add(corps); parts.corps = corps;
        parts.ailes = [-1, 1].map((sg) => { const m = mk(new T.BoxGeometry(0.26, 0.03, 0.34).translate(0, 0, sg * 0.17), '#3A3A44', 0, 0.04, sg * 0.06); m.userData.sg = sg; return m; });
      } else { // le petit robot
        F.add(BOITE, '#7FA8C8', mat(0, 0, 0, 0, 0.42, 0.36, 0.42), 0.04, 64); F.add(BOITE, '#2A3440', mat(0.215, 0.04, 0, 0, 0.02, 0.16, 0.3)); F.add(BOITE, '#5AE0FF', mat(0.225, 0.04, 0, 0, 0.02, 0.06, 0.2));
        F.add(BOITE, '#4A5A6A', mat(0.12, -0.12, 0.25, 0, 0.26, 0.08, 0.08)); F.add(BOITE, '#4A5A6A', mat(0.12, -0.12, -0.25, 0, 0.26, 0.08, 0.08)); F.add(BOITE, '#4A5A6A', mat(0, 0.24, 0, 0, 0.03, 0.14, 0.03));
        const corps = new T.Mesh(F.geo(), matVC); corps.castShadow = true; g.add(corps); parts.corps = corps;
        parts.voyant = mk(new T.SphereGeometry(0.05, 8, 6), '#FF5A4A', 0, 0.33, 0); parts.voyant.material = new T.MeshBasicMaterial({ color: '#FF5A4A' });
      }
      g.scale.setScalar(ECHELLE * 1.1); return { g, parts, type };
    }
    const compagnons3d = new Map();
    function majCompagnons(jeu, dt) {
      const t = performance.now() / 1000, vus = new Set();
      for (const c of jeu.compagnons || []) {
        vus.add(c.id); let o = compagnons3d.get(c.id);
        if (!o || o.type !== c.type) { if (o) scene.remove(o.g); o = compagnonMesh(c.type); scene.add(o.g); o.ph = 0; compagnons3d.set(c.id, o); }
        const P = o.parts; o.ph += dt * (c.bouge ? 14 : 3);
        if (c.type === 'corbeau') { o.g.position.set(c.x, 2.0 + Math.sin(t * 3 + c.id) * 0.15 - (c.attaque > 0 ? 0.9 : 0), c.z); for (const a of P.ailes) a.rotation.x = a.userData.sg * Math.sin(t * 18) * 0.7; }
        else if (c.type === 'robot') { o.g.position.set(c.x, 1.1 + Math.sin(t * 2.5 + c.id) * 0.1, c.z); P.voyant.material.color.set(c.attaque > 0 || Math.floor(t * 2) % 2 ? '#FF5A4A' : '#5A1A1A'); }
        else { o.g.position.set(c.x, c.bouge ? Math.abs(Math.sin(o.ph)) * 0.06 : 0, c.z); P.pattes.forEach((p, i) => { p.rotation.z = c.bouge ? Math.sin(o.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; }); P.queue.rotation.x = Math.sin(t * (c.type === 'chien' ? 14 : 4)) * 0.5; if (c.attaque > 0) P.corps.rotation.z = -0.2; else P.corps.rotation.z = 0; }
        o.g.rotation.y = -c.a;
      }
      for (const [id, o] of compagnons3d) if (!vus.has(id)) { scene.remove(o.g); compagnons3d.delete(id); }
    }
    // la neige de Noël : des flocons qui tombent doucement autour de la caméra
    const neige = new T.InstancedMesh(new T.BoxGeometry(0.07, 0.07, 0.07), new T.MeshBasicMaterial({ color: '#FFFFFF' }), 260); neige.frustumCulled = false; neige.visible = false; scene.add(neige);
    const flocons = []; for (let i = 0; i < 260; i++) flocons.push({ x: (Math.random() - 0.5) * 40, y: Math.random() * 14, z: (Math.random() - 0.5) * 30, v: 0.8 + Math.random() * 0.8, p: Math.random() * 6 });
    function majNeige(jeu, dt) {
      neige.visible = !!jeu.noel; if (!neige.visible) return; const t = performance.now() / 1000;
      flocons.forEach((f, i) => { f.y -= f.v * dt; if (f.y < 0) { f.y += 14; f.x = (Math.random() - 0.5) * 40; f.z = (Math.random() - 0.5) * 30; } _base.makeTranslation(cam.x + f.x + Math.sin(t + f.p) * 0.5, f.y, cam.z + f.z); neige.setMatrixAt(i, _base); });
      neige.instanceMatrix.needsUpdate = true;
    }

    // ─── la ferraille au sol : un maillage instancié (écrous et plaques) ───
    const geoFerraille = (() => { const F = new Fab(); F.add(cyl(0.16, 0.16, 0.08, 6), '#9AA1AA', mat(0, 0.06, 0)); F.add(cyl(0.07, 0.07, 0.1, 6), '#59606A', mat(0, 0.07, 0)); F.add(BOITE, '#B07A45', mat(0.12, 0.05, 0.08, 0.6, 0.2, 0.05, 0.12)); return F.geo(); })();
    const ferraille = new T.InstancedMesh(geoFerraille, matVC, MAX_FERRAILLE); ferraille.instanceMatrix.setUsage(T.DynamicDrawUsage); ferraille.frustumCulled = false; ferraille.count = 0; ferraille.castShadow = true; scene.add(ferraille);
    // les objets rares (caisses d'armes, soins) : une petite réserve
    const geoCaisse = (() => { const F = new Fab(); F.add(BOITE, '#3F5E3A', mat(0, 0.32, 0, 0, 0.9, 0.62, 0.6), 0.04, 5); F.add(BOITE, '#F2C230', mat(0, 0.32, 0, 0, 0.92, 0.12, 0.62)); F.add(BOITE, '#2B3A28', mat(0, 0.66, 0, 0, 0.94, 0.08, 0.64)); return F.geo(); })();
    // Noël (Lot 5e) : le cadeau (une boîte rouge, son ruban doré et son nœud), le flocon (une étoile bleutée qui luit)
    const geoCadeau = (() => { const F = new Fab(); F.add(BOITE, '#D8283A', mat(0, 0.28, 0, 0, 0.56, 0.56, 0.56), 0.04, 51); F.add(BOITE, '#F2C230', mat(0, 0.28, 0, 0, 0.58, 0.58, 0.12)); F.add(BOITE, '#F2C230', mat(0, 0.28, 0, 0, 0.12, 0.58, 0.58)); F.add(BOITE, '#F2C230', mat(0.1, 0.62, 0, 0.6, 0.22, 0.12, 0.08)); F.add(BOITE, '#F2C230', mat(-0.1, 0.62, 0, -0.6, 0.22, 0.12, 0.08)); return F.geo(); })();
    const geoFlocon = (() => { const g = new T.OctahedronGeometry(0.22, 0); g.translate(0, 0.45, 0); return g; })(), matFlocon = new T.MeshBasicMaterial({ color: '#CFEFFF' });
    const geoSoin = (() => { const F = new Fab(); F.add(BOITE, '#F4F1EA', mat(0, 0.25, 0, 0, 0.5, 0.4, 0.42)); F.add(BOITE, '#D9443B', mat(0, 0.46, 0, 0, 0.12, 0.03, 0.34)); F.add(BOITE, '#D9443B', mat(0, 0.46, 0, 0, 0.34, 0.03, 0.12)); F.add(BOITE, '#D9443B', mat(0.26, 0.25, 0, 0, 0.02, 0.28, 0.1)); return F.geo(); })();
    const matFaisceau = new T.MeshBasicMaterial({ color: '#FFE27A', transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending });
    const geoFaisceau = cyl(0.35, 0.5, 6, 10, true).translate(0, 3, 0);
    const reserveObjets = [];
    const matFaisceauRare = new T.MeshBasicMaterial({ color: '#A66BFF', transparent: true, opacity: 0.42, depthWrite: false }); // (mélange normal : il reste violet sur l'herbe)
    const geoGemme = new T.OctahedronGeometry(0.3, 0), geoSocle = new T.RingGeometry(0.42, 0.6, 24).rotateX(-Math.PI / 2), geoFaisceauB = cyl(0.22, 0.3, 2.2, 10, true).translate(0, 1.1, 0);
    function objetRare(type) {
      let o = reserveObjets.find((x) => !x.pris && x.type === type);
      if (!o && type.startsWith('bonus:')) { // un bonus : sa gemme, son socle lumineux, son icône qui flotte au-dessus, un petit faisceau
        const k = type.slice(6), B = D.BONUS[k] || { couleur: '#FFFFFF' }, g = new T.Group();
        const m = new T.Mesh(geoGemme, new T.MeshLambertMaterial({ color: B.couleur, emissive: new T.Color(B.couleur).multiplyScalar(0.45) })); m.castShadow = true; m.position.y = 0.45; g.add(m);
        const socle = new T.Mesh(geoSocle, new T.MeshBasicMaterial({ color: B.couleur, transparent: true, opacity: 0.85, depthWrite: false })); socle.position.y = 0.04; g.add(socle);
        const f = new T.Mesh(geoFaisceauB, new T.MeshBasicMaterial({ color: B.couleur, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending })); g.add(f);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: textureIcone(k), depthWrite: false, transparent: true })); sp.scale.set(0.75, 0.75, 1); sp.position.y = 1.25; g.add(sp);
        scene.add(g); o = { type, g, m, socle, pris: false }; reserveObjets.push(o);
      }
      if (!o) {
        const g = new T.Group(), m = new T.Mesh(type === 'soin' ? geoSoin : type === 'cadeau' ? geoCadeau : type === 'flocon' ? geoFlocon : geoCaisse, type === 'flocon' ? matFlocon : matVC); m.castShadow = type !== 'flocon'; g.add(m);
        if (type === 'caisse' || type === 'caisseRare') { const f = new T.Mesh(geoFaisceau, type === 'caisseRare' ? matFaisceauRare : matFaisceau); if (type === 'caisseRare') f.scale.set(1.3, 1.6, 1.3); g.add(f); }
        scene.add(g); o = { type, g, m, pris: false }; reserveObjets.push(o);
      }
      o.pris = true; o.g.visible = true; return o;
    }
    function majObjets(jeu) {
      const t = performance.now() / 1000; let n = 0;
      for (const o of reserveObjets) o.pris = false;
      for (const o of jeu.objets) {
        if (o.type === 'ferraille') {
          if (n >= MAX_FERRAILLE) continue;
          const clign = o.age > 38 && Math.floor(o.age * 6) % 2 === 0;
          _q.setFromEuler(_e.set(0, t * 2 + o.id, 0)); _v.set(o.x, (o.vole ? 0.35 : 0.05 + Math.abs(Math.sin(t * 3 + o.id)) * 0.08), o.z); const k = clign ? 0.001 : 0.9 + Math.min(o.valeur, 8) * 0.06; _s.set(k, k, k);
          _base.compose(_v, _q, _s); ferraille.setMatrixAt(n++, _base);
        } else if (o.type === 'bonus') { // (il flotte, tourne, et clignote ses 3 dernières secondes)
          const r = objetRare('bonus:' + o.bonus); r.g.position.set(o.x, Math.sin(t * 3 + o.id) * 0.1, o.z); r.m.rotation.y = t * 2; r.socle.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
          r.g.visible = !(o.age > D.BONUS_CHANCE.dure - 3 && Math.floor(o.age * 7) % 2 === 0);
        } else {
          const r = objetRare(o.type === 'caisse' && o.rare ? 'caisseRare' : o.type); r.g.position.set(o.x, Math.sin(t * 2.5 + o.id) * 0.06 + (o.type === 'flocon' && o.vole ? 0.4 : 0), o.z); r.m.rotation.y = t * (o.type === 'flocon' ? 3 : 0.8);
        }
      }
      ferraille.count = n; ferraille.instanceMatrix.needsUpdate = true;
      for (const o of reserveObjets) if (!o.pris) o.g.visible = false;
    }

    // ─── le Lot 4 : les icônes des bonus, les auras, les leurres, le largage, les pièges ───
    // l'icône d'un bonus (un rond de sa couleur, un symbole blanc), dessinée une fois dans un canvas ; la même sert au HUD
    const icones = {};
    function canvasIcone(k) {
      if (icones[k]) return icones[k];
      const B = D.BONUS[k] || { couleur: '#888' }, n = 128, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), m = n / 2;
      g.fillStyle = B.couleur; g.strokeStyle = '#1F2533'; g.lineWidth = 8; g.beginPath(); g.arc(m, m, m - 6, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
      if (k === 'rage' || k === 'double') { g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#1F2533'; g.strokeText('×2', m, m + 3); g.fillText('×2', m, m + 3); if (k === 'double') { g.lineWidth = 5; g.strokeStyle = '#fff'; g.beginPath(); for (let a = 0; a < 6; a++) g.lineTo(m + Math.cos(a / 6 * 6.28) * 46, m + Math.sin(a / 6 * 6.28) * 46); g.closePath(); g.stroke(); } }
      else if (k === 'bouclier') { g.beginPath(); g.moveTo(m, 22); g.lineTo(m + 36, 34); g.quadraticCurveTo(m + 34, 86, m, 106); g.quadraticCurveTo(m - 34, 86, m - 36, 34); g.closePath(); g.fill(); }
      else if (k === 'aimant') { g.lineWidth = 18; g.beginPath(); g.arc(m, m + 4, 26, Math.PI, 0, true); g.stroke(); g.fillRect(m - 35, 30, 18, 20); g.fillRect(m + 17, 30, 18, 20); }
      else if (k === 'ralenti') { g.beginPath(); g.moveTo(m - 28, 26); g.lineTo(m + 28, 26); g.lineTo(m, m); g.closePath(); g.moveTo(m - 28, 102); g.lineTo(m + 28, 102); g.lineTo(m, m); g.closePath(); g.fill(); }
      else if (k === 'bombe') { g.beginPath(); g.arc(m - 4, m + 8, 30, 0, 7); g.fill(); g.lineWidth = 7; g.beginPath(); g.moveTo(m + 14, m - 16); g.quadraticCurveTo(m + 30, m - 40, m + 40, m - 30); g.stroke(); g.fillStyle = '#FFE07A'; g.beginPath(); g.arc(m + 42, m - 32, 8, 0, 7); g.fill(); }
      else if (k === 'leurre') { g.lineWidth = 9; for (const r of [36, 20]) { g.beginPath(); g.arc(m, m, r, 0, 7); g.stroke(); } g.beginPath(); g.arc(m, m, 7, 0, 7); g.fill(); }
      return (icones[k] = c);
    }
    const texIcones = {};
    function textureIcone(k) { if (!texIcones[k]) { const t = new T.CanvasTexture(canvasIcone(k)); if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; texIcones[k] = t; } return texIcones[k]; }
    function iconeBonus(k) { return canvasIcone(k).toDataURL('image/png'); }
    // les auras du survivant : une bulle bleue (le bouclier), un anneau de sa couleur à ses pieds (rage, double ferraille, super-aimant)
    const geoBulle = new T.SphereGeometry(1, 18, 12), geoAura = new T.RingGeometry(0.78, 1.0, 32).rotateX(-Math.PI / 2);
    function auras(s, j, t, dt) {
      const E = j.effets || {};
      if (!s.bulle) { s.bulle = new T.Mesh(geoBulle, new T.MeshBasicMaterial({ color: '#4FC3F7', transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending })); s.bulle.position.y = 1.05; s.g.add(s.bulle);
        s.aura = new T.Mesh(geoAura, new T.MeshBasicMaterial({ color: '#E5533D', transparent: true, opacity: 0.85, depthWrite: false })); s.aura.position.y = 0.05; s.g.add(s.aura); } // (accrochées au survivant : elles partent avec lui)
      const b = E.bouclier || 0; s.bulle.visible = b > 0 && j.vivant && !(b < 1.5 && Math.floor(b * 8) % 2 === 0); if (s.bulle.visible) { s.bulle.scale.setScalar(1.15 + Math.sin(t * 6) * 0.04); s.bulle.material.opacity = 0.16 + Math.sin(t * 9) * 0.05; }
      const k = j.gele > 0 ? 'gele' : j.rageT > 0 ? 'berserk' : ['rage', 'double', 'aimant'].find((x) => E[x] > 0); s.aura.visible = !!k && j.vivant;
      if (k === 'berserk') { s.aura.material.color.set('#E5533D'); s.aura.rotation.y = t * 4; s.aura.scale.setScalar(1.3 + Math.sin(t * 12) * 0.1); if (Math.random() < dt * 20) particule(j.x + (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 1.4, j.z + (Math.random() - 0.5) * 0.8, 0, 2, 0, 0.4, 0.09, Math.random() < 0.5 ? '#FF4A2A' : '#FFB03A', 0); }
      else if (k === 'gele') { s.aura.material.color.set('#A8E4FF'); s.aura.rotation.y = t * 0.6; s.aura.scale.setScalar(1.25); if (Math.random() < dt * 10) particule(j.x + (Math.random() - 0.5) * 0.9, 0.3 + Math.random(), j.z + (Math.random() - 0.5) * 0.9, 0, 0.6, 0, 0.6, 0.06, '#E8F8FF', 0); }
      else if (k) { s.aura.material.color.set(D.BONUS[k].couleur); s.aura.rotation.y = t * 2; s.aura.scale.setScalar((k === 'aimant' ? 1.6 : 1.1) + Math.sin(t * 7) * 0.07); if (k === 'rage' && Math.random() < dt * 14) particule(j.x + (Math.random() - 0.5) * 0.8, 0.3, j.z + (Math.random() - 0.5) * 0.8, 0, 2.5 + Math.random() * 2, 0, 0.45, 0.08, Math.random() < 0.5 ? '#FF5A3A' : '#FFB347', 0); }
    }
    // le leurre : un mannequin de bois et sa cible, un cercle rose qui pulse à ses pieds
    const reserveLeurres = [];
    function leurre3d() {
      const g = new T.Group(), F = new Fab();
      F.add(cyl(0.05, 0.06, 1.2, 6), '#7A5634', mat(0, 0.6, 0)); F.add(BOITE, '#C9A06A', mat(0, 1.25, 0, 0, 0.55, 0.65, 0.3)); F.add(BOITE, '#C9A06A', mat(0, 1.25, 0, 0, 1.0, 0.14, 0.14));
      F.add(new T.SphereGeometry(0.2, 10, 8), '#D8B07A', mat(0, 1.75, 0)); F.add(BOITE, '#E5533D', mat(0, 1.3, 0.16, 0, 0.32, 0.32, 0.02)); F.add(BOITE, '#FFFFFF', mat(0, 1.3, 0.17, 0, 0.18, 0.18, 0.02)); F.add(BOITE, '#E5533D', mat(0, 1.3, 0.18, 0, 0.07, 0.07, 0.02));
      const m = new T.Mesh(F.geo(), matVC); m.castShadow = true; g.add(m);
      const r = new T.Mesh(geoAura, new T.MeshBasicMaterial({ color: '#F28CB8', transparent: true, opacity: 0.8, depthWrite: false })); r.position.y = 0.05; g.add(r);
      scene.add(g); const o = { g, r }; reserveLeurres.push(o); return o;
    }
    function majLeurres(jeu, t) {
      const l = jeu.leurres || []; let i = 0;
      for (const L of l) { const o = reserveLeurres[i] || leurre3d(); i++; o.g.visible = !(L.t < 2 && Math.floor(L.t * 6) % 2 === 0); o.g.position.set(L.x, 0, L.z); o.g.rotation.y = Math.sin(t * 3 + L.id) * 0.15; o.r.scale.setScalar(1.2 + (t * 1.5 % 1) * 2.4); o.r.material.opacity = 0.7 * (1 - (t * 1.5 % 1)); }
      for (; i < reserveLeurres.length; i++) reserveLeurres[i].g.visible = false;
    }
    // le largage : la fumée verte qui monte du point de chute, un anneau qui pulse au sol, puis la caisse qui descend sous son parachute
    let largage3d = null, fumeeAcc = 0;
    function majLargage(jeu, t, dt) {
      const la = jeu.largage;
      if (!largage3d) {
        const g = new T.Group(), F = new Fab();
        const caisse = new T.Mesh(geoCaisse, matVC); caisse.castShadow = true; g.add(caisse);
        F.add(new T.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#F2EDE4', mat(0, 2.6, 0)); for (const [x, z] of [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) F.add(BOITE, '#4A4F57', mat(x * 0.45, 1.65, z * 0.45, 0, 0.03, 1.9, 0.03, z * 0.42, -x * 0.42));
        const para = new T.Mesh(F.geo(), matVC); g.add(para);
        const anneau = new T.Mesh(geoAura, new T.MeshBasicMaterial({ color: '#2FBF4A', transparent: true, opacity: 0.9, depthWrite: false })); anneau.position.y = 0.06; scene.add(anneau);
        scene.add(g); largage3d = { g, anneau };
      }
      const L = largage3d, vu = !!(la && la.pose);
      L.anneau.visible = vu; L.g.visible = vu && la.t < 2.6;
      if (!vu) return;
      L.anneau.position.set(la.x, 0.06, la.z); L.anneau.scale.setScalar(1.2 + Math.sin(t * 6) * 0.2); L.anneau.rotation.y = t;
      fumeeAcc += dt * 12; while (fumeeAcc >= 1) { fumeeAcc--; fumee(la.x + (Math.random() - 0.5) * 0.5, 0.3, la.z + (Math.random() - 0.5) * 0.5, 1.0 + Math.random() * 0.5, 2.6, Math.random() < 0.5 ? '#2FBF4A' : '#6FE07F'); }
      if (L.g.visible) { const h = Math.max(0, la.t / 2.6) * 20; L.g.position.set(la.x, h, la.z); L.g.rotation.y = t * 0.6; L.g.rotation.z = Math.sin(t * 2) * 0.08; }
    }
    // les pièges : la grille (cerclée de jaune et noir) et son interrupteur (un poteau, un bouton au sol, un voyant : vert prêt, bleu allumé, rouge
    // qui recharge) ; allumée, la grille luit et crépite
    let pieges3d = null, piegesDe = null;
    function majPieges(jeu, t) {
      const l = jeu.pieges || [];
      if (piegesDe !== jeu) {
        if (pieges3d) for (const p of pieges3d) { scene.remove(p.g); }
        piegesDe = jeu; pieges3d = l.map((p) => {
          const g = new T.Group(), F = new Fab(), r = D.PIEGE.rayon;
          F.add(cyl(r, r, 0.08, 28), '#2E3238', mat(p.x, 0.04, p.z)); for (let k = -2; k <= 2; k++) { F.add(BOITE, '#5C6168', mat(p.x + k * r * 0.36, 0.09, p.z, 0, 0.06, 0.03, r * 1.7 * Math.sqrt(1 - (k * 0.36) ** 2))); F.add(BOITE, '#5C6168', mat(p.x, 0.09, p.z + k * r * 0.36, 0, r * 1.7 * Math.sqrt(1 - (k * 0.36) ** 2), 0.03, 0.06)); }
          for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; F.add(BOITE, k % 2 ? '#F2C230' : '#1F2533', mat(p.x + Math.cos(a) * (r - 0.1), 0.1, p.z + Math.sin(a) * (r - 0.1), -a, 0.2, 0.04, 0.85 * r * Math.PI / 8 / 0.85 * 0.5)); }
          F.add(cyl(0.55, 0.55, 0.06, 16), '#4A4F57', mat(p.sx, 0.03, p.sz)); F.add(cyl(0.4, 0.4, 0.08, 16), '#E5533D', mat(p.sx, 0.07, p.sz)); F.add(BOITE, '#5C6168', mat(p.sx + 0.7, 0.45, p.sz, 0, 0.16, 0.9, 0.16));
          const m = new T.Mesh(F.geo(), matVC); m.receiveShadow = true; g.add(m);
          const voyant = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), new T.MeshBasicMaterial({ color: '#5CE06A' })); voyant.position.set(p.sx + 0.7, 0.98, p.sz); g.add(voyant);
          const lueur = new T.Mesh(new T.CircleGeometry(r * 0.96, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#7FDBFF', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })); lueur.position.set(p.x, 0.12, p.z); g.add(lueur);
          scene.add(g); return { g, voyant, lueur };
        });
      }
      l.forEach((p, i) => { const o = pieges3d[i]; if (!o) return;
        o.voyant.material.color.set(p.etat === 'actif' ? '#7FDBFF' : p.etat === 'recharge' ? '#B8342A' : '#5CE06A'); o.voyant.scale.setScalar(p.etat === 'pret' ? 1 + Math.sin(t * 4) * 0.2 : 1);
        o.lueur.material.opacity = p.etat === 'actif' ? 0.28 + Math.sin(t * 30) * 0.12 : 0; });
    }
    function zap(e) { const r = D.PIEGE.rayon; for (let k = 0; k < 3; k++) { const a0 = Math.random() * 6.28, a1 = a0 + 1.5 + Math.random() * 2, r0 = Math.random() * r * 0.9, r1 = Math.random() * r * 0.9; const pts = [[e.x + Math.cos(a0) * r0, e.z + Math.sin(a0) * r0], [e.x + Math.cos(a1) * r1, e.z + Math.sin(a1) * r1]]; for (let i = 0; i < 3; i++) { const f0 = i / 3, f1 = (i + 1) / 3, j0 = i ? 0.3 : 0, j1 = i < 2 ? 0.3 : 0; segment(pts[0][0] + (pts[1][0] - pts[0][0]) * f0 + (Math.random() - 0.5) * j0, 0.2 + Math.random() * 0.4, pts[0][1] + (pts[1][1] - pts[0][1]) * f0 + (Math.random() - 0.5) * j0, pts[0][0] + (pts[1][0] - pts[0][0]) * f1 + (Math.random() - 0.5) * j1, 0.2 + Math.random() * 0.4, pts[0][1] + (pts[1][1] - pts[0][1]) * f1 + (Math.random() - 0.5) * j1, 0.07, '#BFF0FF', 0.12); } } if (Math.random() < 0.5) lumiere(e.x, 1, e.z, '#7FDBFF', 10, 6, 0.12); }

    // ─── les défenses : un groupe par défense posée, fait de morceaux partagés par type ───
    const geosDef = {};
    function geoDef(type) {
      if (geosDef[type]) return geosDef[type];
      const F = new Fab(), G = {};
      switch (type) {
        case 'tourelle':
          F.add(cyl(0.45, 0.55, 0.3, 8), '#5D6470', mat(0, 0.15, 0)); F.add(cyl(0.12, 0.16, 0.5, 6), '#4A505A', mat(0, 0.5, 0)); G.base = F.geo();
          F.add(BOITE, '#7C8696', mat(0, 0.85, 0, 0, 0.5, 0.32, 0.44), 0.04, 2); F.add(BOITE, '#2F343C', mat(0.45, 0.88, 0.08, 0, 0.6, 0.08, 0.08)); F.add(BOITE, '#2F343C', mat(0.45, 0.88, -0.08, 0, 0.6, 0.08, 0.08)); F.add(BOITE, '#F2C230', mat(-0.2, 0.85, 0, 0, 0.12, 0.34, 0.46)); G.tete = F.geo();
          break;
        case 'mortier':
          F.add(cyl(0.5, 0.6, 0.25, 8), '#6B6F57', mat(0, 0.12, 0)); F.add(BOITE, '#8A7A55', mat(0, 0.3, 0, 0.4, 0.9, 0.15, 0.2)); G.base = F.geo();
          F.add(cyl(0.16, 0.2, 0.9, 8), '#4B5040', mat(0.12, 0.62, 0, 0, 1, 1, 1, 0, -0.6)); G.tete = F.geo();
          break;
        case 'barricade':
          for (let i = 0; i < 3; i++) F.add(BOITE, i % 2 ? '#A7804F' : '#B98E5A', mat(0, 0.25 + i * 0.3, 0, 0, 0.22, 0.24, 1.8), 0.08, 30 + i);
          for (const s of [-0.7, 0.7]) F.add(BOITE, '#7A5634', mat(-0.05, 0.5, s, 0, 0.16, 1.0, 0.16));
          F.add(BOITE, '#9C7448', mat(0.02, 0.55, 0, 0.0, 0.14, 0.14, 2.0, 0.5));
          G.base = F.geo(); break;
        case 'mine':
          F.add(cyl(0.32, 0.36, 0.1, 10), '#5E6347', mat(0, 0.05, 0)); F.add(cyl(0.12, 0.12, 0.06, 8), '#3B3E2E', mat(0, 0.12, 0)); G.base = F.geo();
          F.add(BOITE, '#FF4A3A', mat(0, 0.16, 0, 0, 0.06, 0.04, 0.06)); G.tete = F.geo();
          break;
        case 'tourellefeu':
          F.add(cyl(0.45, 0.55, 0.3, 8), '#5D6470', mat(0, 0.15, 0)); F.add(cyl(0.12, 0.16, 0.5, 6), '#4A505A', mat(0, 0.5, 0)); G.base = F.geo();
          F.add(BOITE, '#D9824B', mat(0, 0.85, 0, 0, 0.5, 0.34, 0.46), 0.04, 5); F.add(cyl(0.09, 0.12, 0.55, 8), '#2F343C', mat(0.42, 0.88, 0, 0, 1, 1, 1, 0, Math.PI / 2)); F.add(cyl(0.16, 0.16, 0.42, 8), '#C0392B', mat(-0.18, 0.95, 0.2, 0, 1, 1, 1, Math.PI / 2)); G.tete = F.geo();
          break;
        case 'tourelletesla':
          F.add(cyl(0.45, 0.55, 0.3, 8), '#5D6470', mat(0, 0.15, 0)); F.add(cyl(0.1, 0.18, 1.0, 6), '#7C8696', mat(0, 0.8, 0)); for (const y of [0.55, 0.8, 1.05]) F.add(cyl(0.22, 0.22, 0.06, 10), '#B87333', mat(0, y, 0)); G.base = F.geo();
          F.add(new T.IcosahedronGeometry(0.26, 1), '#6FD3FF', mat(0, 1.45, 0)); G.tete = F.geo();
          break;
        case 'claymore':
          F.add(BOITE, '#6B7A3A', mat(0.02, 0.2, 0, 0, 0.12, 0.3, 0.6), 0.04, 6); for (const s of [-0.22, 0.22]) F.add(BOITE, '#2F343C', mat(-0.05, 0.06, s, 0, 0.04, 0.14, 0.04)); F.add(BOITE, '#FF4A3A', mat(0.09, 0.3, 0, 0, 0.02, 0.05, 0.05)); G.base = F.geo(); break;
        case 'baril':
          F.add(cyl(0.36, 0.36, 0.9, 10), '#D64534', mat(0, 0.45, 0)); for (const y of [0.2, 0.7]) F.add(cyl(0.375, 0.375, 0.06, 10), '#8C2A1E', mat(0, y, 0)); F.add(cyl(0.12, 0.12, 0.03, 8), '#FFE07A', mat(0, 0.91, 0)); G.base = F.geo(); break;
        case 'radio':
          F.add(BOITE, '#5B8BD9', mat(0, 0.3, 0, 0, 0.5, 0.45, 0.8), 0.05, 7); F.add(cyl(0.14, 0.14, 0.04, 10), '#2B2A33', mat(0.26, 0.3, -0.18, 0, 1, 1, 1, 0, Math.PI / 2)); F.add(BOITE, '#FFE07A', mat(0.26, 0.38, 0.18, 0, 0.02, 0.08, 0.25));
          F.add(BOITE, '#2B2A33', mat(0, 0.8, 0.2, 0, 0.03, 0.6, 0.03, 0.4)); G.base = F.geo(); break;
        case 'epouvantail':
          F.add(BOITE, '#7A5634', mat(0, 0.9, 0, 0, 0.12, 1.8, 0.12)); F.add(BOITE, '#7A5634', mat(0, 1.35, 0, 0, 0.1, 0.1, 1.4));
          F.add(BOITE, '#C94F3D', mat(0, 1.2, 0, 0, 0.3, 0.55, 0.6), 0.06, 4); F.add(BOITE, '#E9D18C', mat(0, 1.68, 0, 0, 0.34, 0.34, 0.34));
          F.add(cyl(0.05, 0.42, 0.25, 8), '#C9A24E', mat(0, 1.92, 0));
          F.add(BOITE, '#4A7A44', mat(0, 1.15, 0.72, 0, 0.12, 0.12, 0.1)).add(BOITE, '#4A7A44', mat(0, 1.15, -0.72, 0, 0.12, 0.12, 0.1));
          G.base = F.geo(); break;
      }
      geosDef[type] = G; return G;
    }
    const matBarre = new T.MeshBasicMaterial({ color: '#2B2A2A', transparent: true, opacity: 0.7, depthWrite: false }), matBarreV = new T.MeshBasicMaterial({ color: '#6BD36B', depthWrite: false });
    const geoPlan = new T.PlaneGeometry(1, 1);
    const defs = new Map();
    function majDefenses(jeu, dt) {
      const vus = new Set(), t = performance.now() / 1000;
      for (const d of jeu.defenses) {
        vus.add(d.id); let r = defs.get(d.id);
        if (!r) {
          const g = new T.Group(); let base = null, tete = null, modele = false;
          const O = MOD && MOD.pret && (d.type === 'tourelle' || d.type === 'mortier') ? MOD.M[d.type] : null;
          if (O) { // le modèle Kenney (Tower Defense Kit) : le socle, et le canon (« barrel ») qui pivote
            base = O.scene.clone(true); const tx = O.boite.max.x - O.boite.min.x, tz = O.boite.max.z - O.boite.min.z, k = (d.type === 'tourelle' ? 1.35 : 1.5) / Math.max(tx, tz);
            base.scale.setScalar(k); base.position.y = -O.boite.min.y * k; g.add(base); tete = base.getObjectByName('barrel'); modele = !!tete;
          } else {
            const G = geoDef(d.type); base = new T.Mesh(G.base, matVC); base.castShadow = true; g.add(base);
            if (G.tete) { tete = new T.Mesh(G.tete, d.type === 'mine' ? new T.MeshBasicMaterial({ vertexColors: true }) : matVC); tete.castShadow = true; g.add(tete); }
          }
          const fond = new T.Mesh(geoPlan, matBarre), barre = new T.Mesh(geoPlan, matBarreV.clone()); fond.renderOrder = 5; barre.renderOrder = 6;
          const bar = new T.Group(); bar.add(fond); bar.add(barre); barre.position.z = 0.001; bar.position.y = d.type === 'epouvantail' ? 2.4 : 1.5; g.add(bar);
          g.position.set(d.x, 0, d.z); scene.add(g); r = { g, base, tete, bar, barre, pose: 0, modele }; defs.set(d.id, r);
          if (d.type === 'barricade' || d.type === 'claymore' || d.type === 'radio') g.rotation.y = -d.angle;
        }
        r.pose = Math.min(1, r.pose + dt * 5); const k = 0.4 + 0.6 * r.pose; r.g.scale.set(k, k, k);
        if (r.tete && d.type !== 'mine' && d.type !== 'tourelletesla') r.tete.rotation.y = r.modele ? Math.PI / 2 - d.angle : -d.angle;
        if (d.type === 'tourelletesla') { const p = 1 + Math.sin(t * 8 + d.id) * 0.08; r.tete.scale.set(p, p, p); }
        if (d.type === 'radio') { r.base.position.y = Math.abs(Math.sin(t * 12)) * 0.04; if (Math.random() < dt * 4) particule(d.x, 1.0, d.z, (Math.random() - 0.5), 1.4, (Math.random() - 0.5), 0.9, 0.12, Math.random() < 0.5 ? '#FFE07A' : '#FFFFFF', 0); }
        if (d.type === 'mine') r.tete.visible = Math.floor(t * 3 + d.id) % 2 === 0;
        const f = d.vie / d.vieMax; r.bar.visible = f < 0.999 && d.type !== 'mine';
        if (r.bar.visible) { r.bar.quaternion.copy(camera.quaternion); r.bar.children[0].scale.set(1.0, 0.13, 1); r.barre.scale.set(Math.max(0.01, f) * 0.96, 0.09, 1); r.barre.position.x = -(1 - f) * 0.48; r.barre.material.color.set(f > 0.5 ? '#6BD36B' : f > 0.25 ? '#F2C230' : '#E5533D'); }
      }
      for (const [id, r] of defs) if (!vus.has(id)) { scene.remove(r.g); defs.delete(id); }
    }

    // ─── les effets : traçantes, explosions, flaques, crachats, obus ───
    const matTrace = new T.MeshBasicMaterial({ color: '#FFE89A', transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending });
    const tracantes = []; for (let i = 0; i < MAX_TRACANTES; i++) { const m = new T.Mesh(BOITE, matTrace.clone()); m.visible = false; scene.add(m); tracantes.push({ m, t: 0 }); }
    let iTrace = 0;
    function tracante(x, z, a, l, arme, y0) {
      const o = tracantes[iTrace]; iTrace = (iTrace + 1) % MAX_TRACANTES;
      const gros = arme === 'sniper' || arme === 'laser', ep = arme === 'laser' ? 0.11 : gros ? 0.07 : 0.045;
      o.t = gros ? 0.12 : 0.06; o.m.visible = true;
      o.m.position.set(x + Math.cos(a) * l / 2, y0 != null ? (y0 + 1.0) / 2 : 1.0, z + Math.sin(a) * l / 2); o.m.rotation.set(0, -a, 0);
      o.m.scale.set(l, ep, ep); o.m.material.opacity = 0.95;
      o.m.material.color.set(COULEUR_TRACE[arme] || '#FFE89A');
    }
    // l'effet d'un tir, selon l'arme : traçante, rayon laser, cône de flammes ou de givre, éclair (lignes brisées), rien (roquette, scie : le projectile se voit)
    const COULEUR_TRACE = { tourelle: '#9AE6FF', laser: '#FF5C8A', sniper: '#FFE89A', arc: '#E8D2A6', toxine: '#8CF05A' };
    function effetTir(e, bc) {
      const A = D.ARMES[e.cle];
      if (e.arme === 'flamme' || e.arme === 'cryo') {
        const feu = e.arme === 'flamme';
        for (let k = 0; k < 6; k++) { const a = e.a + (Math.random() - 0.5) * 0.62, v = 6 + Math.random() * 5, vie = Math.max(0.12, e.l / v) * (0.6 + Math.random() * 0.5); particule(e.x + Math.cos(e.a) * 0.3, 0.9 + Math.random() * 0.3, e.z + Math.sin(e.a) * 0.3, Math.cos(a) * v, 0.4 + Math.random() * 1.2, Math.sin(a) * v, vie, 0.22 + Math.random() * 0.2, feu ? (k % 3 === 0 ? '#FFE08A' : k % 3 === 1 ? '#FFB347' : '#FF5A14') : (k % 2 ? '#E6FAFF' : '#8FDDFF'), 0); }
        return;
      }
      if (e.arme === 'tesla') { if (e.pts) eclair(e.pts); return; }
      if (e.arme === 'lame') { // la machette : un arc blanc qui balaie devant le survivant
        const C = A ? A.cone : 1, R = (e.l || 2.2) * 0.8, n = 7; let px = null, pz = null;
        for (let k = 0; k <= n; k++) { const b = e.a - C + (2 * C * k) / n, x = e.x + Math.cos(b) * R, z = e.z + Math.sin(b) * R; if (px != null) segment(px, 1.0, pz, x, 1.0, z, 0.09, k > n / 2 ? '#FFFFFF' : '#CFE3F2', 0.13); px = x; pz = z; }
        if (e.touche) for (let k = 0; k < 6; k++) { const b = e.a + (Math.random() - 0.5) * C * 2; particule(e.x + Math.cos(b) * R, 1.0, e.z + Math.sin(b) * R, Math.cos(b) * 3, 1 + Math.random() * 2, Math.sin(b) * 3, 0.3, 0.08, '#8FD14F', 0.3); }
        return;
      }
      if (e.arme === 'sonique') { // le canon sonique : trois fronts d'onde qui partent en éventail
        const C = A ? A.cone : 0.6;
        for (let f = 0; f < 3; f++) for (let k = 0; k < 9; k++) { const b = e.a - C + (2 * C * k) / 8, v = 9 + f * 2.5; particule(e.x + Math.cos(b) * 0.4, 1.0, e.z + Math.sin(b) * 0.4, Math.cos(b) * v, 0.2, Math.sin(b) * v, Math.max(0.12, e.l / v) * (0.7 + f * 0.12), 0.11 - f * 0.02, f ? '#BFF6F0' : '#FFFFFF', 0); }
        secousse = Math.max(secousse, 0.08); return;
      }
      if (e.arme === 'trou') return;
      if (e.arme === 'roquette' || e.arme === 'scie' || e.arme === 'acide') return;
      const cle = e.cle === 'tourelle' ? 'tourelle' : A && A.classe === 'laser' ? 'laser' : e.arme;
      if (bc) { const fx = e.x + Math.cos(e.a) * e.l, fz = e.z + Math.sin(e.a) * e.l, l = Math.hypot(fx - bc.x, fz - bc.z); if (l > 0.3) { tracante(bc.x, bc.z, Math.atan2(fz - bc.z, fx - bc.x), l, cle, bc.y); return; } } // (depuis le bout du canon)
      tracante(e.x, e.z, e.a, e.l, cle);
    }
    // les éclairs : des segments brisés, en boîtes fines additives (les lignes WebGL n'ont qu'un pixel)
    const MAX_SEG = 72, matSeg = new T.MeshBasicMaterial({ color: '#BFF0FF', transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false });
    const segs = []; for (let i = 0; i < MAX_SEG; i++) { const m = new T.Mesh(BOITE, matSeg.clone()); m.visible = false; m.frustumCulled = false; scene.add(m); segs.push({ m, t: 0 }); }
    let iSeg = 0; const _pa = new T.Vector3(), _pb = new T.Vector3();
    function segment(x0, y0, z0, x1, y1, z1, ep, couleur, duree) {
      const o = segs[iSeg]; iSeg = (iSeg + 1) % MAX_SEG; _pa.set(x0, y0, z0); _pb.set(x1, y1, z1);
      const l = _pa.distanceTo(_pb); o.m.position.copy(_pa).add(_pb).multiplyScalar(0.5); o.m.lookAt(_pb); o.m.scale.set(ep, ep, l);
      o.m.material.color.set(couleur); o.m.material.opacity = 1; o.t = o.d = duree; o.m.visible = true;
    }
    function eclair(pts) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], parts = 4; let px = x0, py = 1.0, pz = z0;
        for (let k = 1; k <= parts; k++) { const f = k / parts, j = k === parts ? 0 : 0.45; const nx = x0 + (x1 - x0) * f + (Math.random() - 0.5) * j, ny = 1.0 + (Math.random() - 0.5) * j, nz = z0 + (z1 - z0) * f + (Math.random() - 0.5) * j; segment(px, py, pz, nx, ny, nz, 0.09, '#9FE6FF', 0.16); segment(px, py, pz, nx, ny, nz, 0.035, '#FFFFFF', 0.12); px = nx; py = ny; pz = nz; }
        for (let k = 0; k < 4; k++) particule(x1, 1.0, z1, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.3, 0.1, '#DFF8FF', 0);
      }
    }
    // les disques du lance-scies et les flaques d'acide (des listes de l'état du jeu)
    const disques = new T.InstancedMesh(new T.CylinderGeometry(0.36, 0.36, 0.06, 10), new T.MeshBasicMaterial({ color: '#E8EEF4' }), 16); disques.frustumCulled = false; disques.count = 0; disques.castShadow = true; scene.add(disques);
    const zonesM = new T.InstancedMesh(new T.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#9BE33A', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 16); zonesM.frustumCulled = false; zonesM.count = 0; scene.add(zonesM);
    function majDisquesZones(jeu, dt) {
      let n = 0; const tps = performance.now() / 1000;
      for (const d of jeu.disques || []) { if (n >= 16) break; _q.setFromEuler(_e.set(0, tps * 25 + d.id, 0)); _v.set(d.x, 0.9, d.z); _s.set(1, 1, 1); _base.compose(_v, _q, _s); disques.setMatrixAt(n++, _base); }
      disques.count = n; disques.instanceMatrix.needsUpdate = true; n = 0;
      for (const z of jeu.zones || []) { if (z.feu) { if (Math.random() < dt * 30) { const b = Math.random() * 6.28, r = Math.random() * z.r; particule(z.x + Math.cos(b) * r, 0.1, z.z + Math.sin(b) * r, 0, 1.5 + Math.random() * 1.5, 0, 0.5, 0.18, Math.random() < 0.5 ? '#FF7A1A' : '#FFC23A', 0); } continue; } if (n >= 16) break; const k = z.r * Math.min(1, (z.duree - z.vie) * 5 + 0.3) * (z.vie < 0.6 ? z.vie / 0.6 : 1); _q.identity(); _v.set(z.x, 0.03, z.z); _s.set(k, 1, k); _base.compose(_v, _q, _s); zonesM.setMatrixAt(n++, _base); if (Math.random() < dt * 6) particule(z.x + (Math.random() - 0.5) * z.r, 0.1, z.z + (Math.random() - 0.5) * z.r, 0, 0.8 + Math.random(), 0, 0.6, 0.08, '#C6F56A', 0); }
      zonesM.count = n; zonesM.instanceMatrix.needsUpdate = true;
      // les zombies qui brûlent fument, ceux qui sont gelés givrent
      for (const zb of jeu.zombies) { if (zb.feu > 0 && Math.random() < dt * 10) particule(zb.x + (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.6, zb.z + (Math.random() - 0.5) * 0.4, 0, 1.6, 0, 0.45, 0.14, Math.random() < 0.6 ? '#FF8A2A' : '#FFD06A', 0); else if (zb.gel > 0 && Math.random() < dt * 5) particule(zb.x + (Math.random() - 0.5) * 0.5, 1.0 + Math.random() * 0.8, zb.z + (Math.random() - 0.5) * 0.5, 0, -0.3, 0, 0.5, 0.08, '#E6FAFF', 0); }
    }
    const chaines = []; for (let i = 0; i < 6; i++) { const m = new T.Mesh(BOITE, new T.MeshLambertMaterial({ color: '#5A5560' })); m.visible = false; m.castShadow = true; scene.add(m); const c = new T.Mesh(new T.TorusGeometry(0.16, 0.05, 5, 8), new T.MeshLambertMaterial({ color: '#8A8590' })); c.visible = false; scene.add(c); chaines.push({ m, c }); }
    function majChaines(jeu) {
      let n = 0;
      const tendre = (x0, z0, x1, z1, crochet) => { if (n >= chaines.length) return; const o = chaines[n++]; _pa.set(x0, 1.1, z0); _pb.set(x1, 1.0, z1); const l = _pa.distanceTo(_pb); o.m.position.copy(_pa).add(_pb).multiplyScalar(0.5); o.m.lookAt(_pb); o.m.scale.set(0.06, 0.06, l); o.m.visible = true; o.c.visible = crochet; if (crochet) { o.c.position.copy(_pb); o.c.lookAt(_pa); } };
      for (const c of jeu.crochets || []) { const g = jeu.zombies.find((z) => z.id === c.de); if (g) tendre(g.x, g.z, c.x, c.z, true); }
      for (const j of jeu.joueurs) if (j.tire) { const g = jeu.zombies.find((z) => z.id === j.tire.de); if (g) tendre(g.x, g.z, j.x, j.z, false); }
      for (; n < chaines.length; n++) { chaines[n].m.visible = false; chaines[n].c.visible = false; }
    }
    const matBoum = new T.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: 0.9, depthWrite: false });
    const geoBoum = new T.IcosahedronGeometry(1, 1);
    const boums = []; for (let i = 0; i < MAX_BOUMS; i++) { const m = new T.Mesh(geoBoum, matBoum.clone()); m.visible = false; scene.add(m); boums.push({ m, t: 0, r: 1 }); }
    let iBoum = 0;
    function boum(x, z, r, petite) {
      const o = boums[iBoum]; iBoum = (iBoum + 1) % MAX_BOUMS; o.t = 0.45; o.r = r; o.m.position.set(x, 0.4, z); o.m.visible = true; secousse = Math.max(secousse, petite ? 0.08 : 0.35);
      // l'explosion en entier : l'onde de choc au sol, la fumée qui monte, des braises et des débris, un flash qui éclaire tout autour
      onde(x, z, r * (petite ? 0.8 : 1.25));
      for (let k = 0; k < (petite ? 2 : 7); k++) { const a = Math.random() * 6.28, d = Math.random() * r * 0.5; fumee(x + Math.cos(a) * d, 0.5 + Math.random() * 0.6, z + Math.sin(a) * d, r * (0.55 + Math.random() * 0.4), petite ? 0.9 : 1.6 + Math.random() * 0.8, k < 2 && !petite ? '#3A3430' : '#6E6862'); }
      for (let k = 0; k < (petite ? 5 : 12); k++) { const a = Math.random() * 6.28, v = 3 + Math.random() * 5; particule(x, 0.6, z, Math.cos(a) * v, 3 + Math.random() * 6, Math.sin(a) * v, 0.5 + Math.random() * 0.5, 0.09, k % 3 ? '#FFB347' : '#FFE07A', 0.2); }
      if (!petite) for (let k = 0; k < 7; k++) { const a = Math.random() * 6.28, v = 2 + Math.random() * 4; particule(x, 0.4, z, Math.cos(a) * v, 4 + Math.random() * 5, Math.sin(a) * v, 1.1 + Math.random() * 0.6, 0.13, '#2E2A26', 0.35); }
      lumiere(x, 1.4, z, '#FF9A3A', petite ? 14 : 34, r * 4 + 6, 0.32);
    }
    // ─── les effets de la 3D (Lot 3) : éclairs au bout du canon et lumières, ondes de choc, fumée, étincelles ───
    // une texture faite au pinceau dans un canvas : une étoile de feu (l'éclair du canon), un rond doux (la fumée)
    function texture2D(dessin, n) { const c = document.createElement('canvas'); c.width = c.height = n || 64; dessin(c.getContext('2d'), c.width); const t = new T.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; return t; }
    const texEclat = texture2D((g, n) => { const m = n / 2, gr = g.createRadialGradient(m, m, 0, m, m, m); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,220,130,.9)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? m * 0.32 : m; g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); } g.fill(); });
    const texFumee = texture2D((g, n) => { const m = n / 2, gr = g.createRadialGradient(m, m, 0, m, m, m); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
    const eclats = []; for (let i = 0; i < 10; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: texEclat, color: '#FFE2A0', blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.visible = false; scene.add(sp); eclats.push({ sp, t: 0 }); }
    let iEclat = 0;
    function eclatBouche(p, taille, couleur) { const o = eclats[iEclat]; iEclat = (iEclat + 1) % eclats.length; o.sp.position.copy(p); const k = taille * (0.8 + Math.random() * 0.5); o.sp.scale.set(k, k, k); o.sp.material.rotation = Math.random() * 6.28; o.sp.material.color.set(couleur || '#FFE2A0'); o.sp.material.opacity = 1; o.t = 0.06; o.neuf = true; o.sp.visible = true; }
    // des lumières en réserve (toujours dans la scène, éteintes : en ajouter recompilerait les matériaux) : le canon, l'explosion
    const lumieres = []; for (let i = 0; i < 2; i++) { const l = new T.PointLight('#FFC870', 0, 8, 1.6); l.visible = qualite !== 'eco'; scene.add(l); lumieres.push({ l, t: 0, d: 1, i0: 0 }); } // (en économe : retirées des calculs de lumière)
    let iLum = 0;
    function lumiere(x, y, z, couleur, intensite, portee, duree) { if (qualite === 'eco') return; const o = lumieres[iLum]; iLum = (iLum + 1) % lumieres.length; o.l.position.set(x, y, z); o.l.color.set(couleur); o.l.distance = portee; o.i0 = intensite; o.l.intensity = intensite; o.t = o.d = duree; o.neuf = true; }
    const fumees = []; for (let i = 0; i < 40; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: texFumee, color: '#777', transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); fumees.push({ sp, t: 0, vie: 1, k: 1 }); }
    let iFumee = 0;
    function fumee(x, y, z, k, vie, couleur) { const o = fumees[iFumee]; iFumee = (iFumee + 1) % fumees.length; o.sp.position.set(x, y, z); o.k = k; o.t = 0; o.vie = vie; o.vx = (Math.random() - 0.5) * 0.6; o.vz = (Math.random() - 0.5) * 0.6; o.sp.material.color.set(couleur); o.sp.material.rotation = Math.random() * 6.28; o.sp.visible = true; }
    const ondes = []; for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#FFD08A', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false })); m.visible = false; scene.add(m); ondes.push({ m, t: 0, r: 1 }); }
    let iOnde = 0;
    function onde(x, z, r, couleur) { const o = ondes[iOnde]; iOnde = (iOnde + 1) % ondes.length; o.m.position.set(x, 0.06, z); o.r = r; o.t = 0; o.m.material.color.set(couleur || '#FFD08A'); o.m.visible = true; }
    function majEffets(dt) {
      // (un éclair ou un flash tout neuf est montré au moins une image entière, même quand les images sont lentes)
      for (const o of eclats) if (o.sp.visible) { if (o.neuf) { o.neuf = false; continue; } o.t -= dt; o.sp.material.opacity = Math.max(0, o.t / 0.06); if (o.t <= 0) o.sp.visible = false; }
      for (const o of lumieres) if (o.t > 0) { if (o.neuf) { o.neuf = false; continue; } o.t -= dt; o.l.intensity = o.t > 0 ? o.i0 * (o.t / o.d) : 0; }
      for (const o of fumees) if (o.sp.visible) { o.t += dt; const u = o.t / o.vie; if (u >= 1) { o.sp.visible = false; continue; } o.sp.position.y += dt * 1.1 * (1 - u * 0.5); o.sp.position.x += o.vx * dt; o.sp.position.z += o.vz * dt; const k = o.k * (1 + u * 1.6); o.sp.scale.set(k, k, k); o.sp.material.opacity = 0.62 * (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88); o.sp.material.rotation += dt * 0.4; }
      for (const o of ondes) if (o.m.visible) { o.t += dt; const u = o.t / 0.38; if (u >= 1) { o.m.visible = false; continue; } const k = o.r * (0.25 + u * 1.2); o.m.scale.set(k, 1, k); o.m.material.opacity = 0.85 * (1 - u); }
    }
    // le bout du canon d'un survivant (le modèle de son arme : sa demi-longueur devant son centre), en coordonnées du monde
    const _bout = new T.Vector3();
    function boutCanon(s) { if (!s || !s.blaster || !s.blaster.userData.long) return null; s.blaster.updateWorldMatrix(true, false); return s.blaster.localToWorld(_bout.set(0, 0, s.blaster.userData.long / 2)); }
    // les flaques (sang vert des zombies, acide des crachats, traces de brûlé) : un cercle instancié, en anneau
    const flaques = new T.InstancedMesh(new T.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: '#FFFFFF', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, transparent: true, opacity: 0.85 }), MAX_FLAQUES);
    flaques.frustumCulled = false; flaques.receiveShadow = true; flaques.count = 0; flaques.instanceMatrix.setUsage(T.DynamicDrawUsage); flaques.setColorAt(0, BLANC); scene.add(flaques);
    const fl = []; let iFlaque = 0;
    function flaque(x, z, r, couleur) { const o = fl[iFlaque] || (fl[iFlaque] = { c: new T.Color() }); o.x = x; o.z = z; o.r = r; o.t = 0; o.a = Math.random() * 6; o.c.set(couleur); iFlaque = (iFlaque + 1) % MAX_FLAQUES; }
    function majFlaques(dt) {
      let n = 0;
      for (const o of fl) {
        if (!o || o.t > 24) continue; o.t += dt;
        const k = o.r * Math.min(1, o.t * 6) * (o.t > 20 ? Math.max(0.01, 1 - (o.t - 20) / 4) : 1);
        _q.setFromEuler(_e.set(0, o.a, 0)); _v.set(o.x, 0.015 + (n % 7) * 0.001, o.z); _s.set(k, 1, k * 0.8); _base.compose(_v, _q, _s);
        flaques.setMatrixAt(n, _base); flaques.setColorAt(n, o.c); n++;
      }
      flaques.count = n; flaques.instanceMatrix.needsUpdate = true; if (flaques.instanceColor) flaques.instanceColor.needsUpdate = true;
    }
    const geoBille = new T.IcosahedronGeometry(0.16, 0);
    const crachats = new T.InstancedMesh(geoBille, new T.MeshBasicMaterial({ color: '#B6F04A' }), 24); crachats.frustumCulled = false; crachats.count = 0; scene.add(crachats);
    const obus = new T.InstancedMesh(geoBille, new T.MeshLambertMaterial({ color: '#3B3E2E' }), 12); obus.frustumCulled = false; obus.count = 0; obus.castShadow = true; scene.add(obus);
    // les singularités : une sphère noire qui palpite, un anneau violet qui tourne, de la poussière qui spirale vers elle
    const reserveTrous = [], geoTrou = new T.SphereGeometry(0.55, 16, 12), geoAnneauTrou = new T.RingGeometry(0.75, 1.0, 32).rotateX(-Math.PI / 2);
    function trou3d() {
      const g = new T.Group(), c = new T.Mesh(geoTrou, new T.MeshBasicMaterial({ color: '#0C0618' })); c.position.y = 1.0; g.add(c);
      const halo = new T.Mesh(geoTrou, new T.MeshBasicMaterial({ color: '#8A5AFF', transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false })); halo.position.y = 1.0; halo.scale.setScalar(1.5); g.add(halo);
      const a = new T.Mesh(geoAnneauTrou, new T.MeshBasicMaterial({ color: '#B48CFF', transparent: true, opacity: 0.7, depthWrite: false })); a.position.y = 0.06; g.add(a);
      scene.add(g); const o = { g, c, halo, a }; reserveTrous.push(o); return o;
    }
    function majTrous(jeu, dt) {
      const l = jeu.trous || []; let i = 0; const t = performance.now() / 1000;
      for (const T0 of l) {
        const o = reserveTrous[i] || trou3d(); i++; o.g.visible = true; o.g.position.set(T0.x, 0, T0.z);
        const k = Math.min(1, T0.t / 0.25), fin = T0.duree - T0.t < 0.4 ? Math.max(0.2, (T0.duree - T0.t) / 0.4) : 1;
        o.c.scale.setScalar(k * fin * (1 + Math.sin(t * 18) * 0.08)); o.halo.scale.setScalar(k * (1.5 + Math.sin(t * 9) * 0.15));
        o.a.rotation.y = t * 4; o.a.scale.setScalar(T0.r * (0.95 + Math.sin(t * 6) * 0.05)); o.a.material.opacity = 0.4 + 0.3 * k;
        if (Math.random() < dt * 40) { const b = Math.random() * 6.28, r = T0.r * (0.6 + Math.random() * 0.4); particule(T0.x + Math.cos(b) * r, 0.3 + Math.random() * 1.2, T0.z + Math.sin(b) * r, -Math.cos(b) * r * 1.6 - Math.sin(b) * 2, 0.6, -Math.sin(b) * r * 1.6 + Math.cos(b) * 2, 0.55, 0.08, Math.random() < 0.5 ? '#B48CFF' : '#5A3AA8', 0); }
      }
      for (; i < reserveTrous.length; i++) reserveTrous[i].g.visible = false;
    }
    // les drones (Lot 5c) : un petit quadricoptère qui flotte et tourne autour du survivant, ses hélices floues
    const reserveDrones = [];
    function drone3d() {
      const g = new T.Group(), F = new Fab();
      F.add(BOITE, '#2E3440', mat(0, 0, 0, 0, 0.36, 0.14, 0.36)); F.add(BOITE, '#3BB7F0', mat(0, 0.08, 0, 0, 0.2, 0.05, 0.2)); F.add(BOITE, '#E5533D', mat(0.19, 0, 0, 0, 0.04, 0.05, 0.08));
      F.add(BOITE, '#2E3440', mat(0, 0, 0, 0.785, 0.9, 0.05, 0.06)); F.add(BOITE, '#2E3440', mat(0, 0, 0, -0.785, 0.9, 0.05, 0.06));
      const m = new T.Mesh(F.geo(), matVC); m.castShadow = true; g.add(m);
      const helices = []; for (const [x, z] of [[0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) { const h = new T.Mesh(new T.CircleGeometry(0.17, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#DDE6EE', transparent: true, opacity: 0.45, depthWrite: false })); h.position.set(x, 0.06, z); g.add(h); helices.push(h); }
      g.scale.setScalar(1.15); scene.add(g); const o = { g, helices }; reserveDrones.push(o); return o;
    }
    function majDrones(jeu, dt) {
      const t = performance.now() / 1000; let i = 0;
      for (const d of jeu.drones || []) { const o = reserveDrones[i] || drone3d(); i++; o.g.visible = !(d.t < 1.2 && Math.floor(d.t * 8) % 2 === 0); o.g.position.set(d.x, 2.1 + Math.sin(t * 3 + d.id) * 0.12, d.z); o.g.rotation.y = -t * 1.6; for (const h of o.helices) h.rotation.y = t * 40; }
      for (; i < reserveDrones.length; i++) reserveDrones[i].g.visible = false;
    }
    function majProjectiles(jeu) {
      let n = 0;
      for (const c of jeu.crachats) { if (n >= 24) break; _base.makeTranslation(c.x, 0.9, c.z); crachats.setMatrixAt(n++, _base); }
      crachats.count = n; crachats.instanceMatrix.needsUpdate = true; n = 0;
      for (const o of jeu.obus) {
        if (n >= 12) break; const k = Math.min(1, o.t / o.duree), h = o.droit ? 1.0 : 0.8 + Math.sin(k * Math.PI) * (o.grenade || o.de === 'mortier' || !o.de ? 6 : 3), x = o.x0 + (o.x1 - o.x0) * k, z = o.z0 + (o.z1 - o.z0) * k;
        const sc = o.trou ? 1.6 : o.petite ? 0.8 : o.droit ? 1.0 : 1.4;
        _base.makeTranslation(x, h, z); _r.makeScale(sc, sc, sc); _base.multiply(_r); obus.setMatrixAt(n++, _base);
        if (o.trou) { for (let k = 0; k < 2; k++) particule(x + (Math.random() - 0.5) * 0.4, h + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, 0.4, 0.1, k ? '#B48CFF' : '#2A1A4A', 0); continue; }
        if (o.droit && Math.random() < 0.8) particule(x, h, z, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, 0.5, 0.12, Math.random() < 0.3 ? '#FFB347' : '#B8B8B8', 0);
      }
      obus.count = n; obus.instanceMatrix.needsUpdate = true;
    }

    // ─── l'arène : sol, bordure, obstacles, verdure, et le paysage autour ───
    function charger(jeu) {
      for (const o of enArene) { scene.remove(o); if (o.geometry) o.geometry.dispose(); }
      enArene.length = 0;
      for (const [, r] of defs) scene.remove(r.g); defs.clear();
      corps.length = 0; for (const o of fl) if (o) o.t = 99; rendusZ.clear();
      const A = jeu.A; arene = A; const demi = A.taille / 2;
      scene.background = new T.Color(A.brume); scene.fog = new T.Fog(A.brume, 34, 75);
      hemi.groundColor.set(A.sol2); meteoVue = null;
      // le sol : une grande plaque à facettes (dedans plus clair, dehors plus sombre)
      const n = 48, cote = A.taille + 60, gsol = new T.PlaneGeometry(cote, cote, n, n).rotateX(-Math.PI / 2).toNonIndexed();
      const pp = gsol.attributes.position, cc = new Float32Array(pp.count * 3), c1 = new T.Color(A.sol), c2 = new T.Color(A.sol2), c3 = new T.Color(A.sol2).multiplyScalar(0.82), tmp = new T.Color();
      let s = 77;
      for (let i = 0; i < pp.count; i += 3) {
        const cx = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3, cz = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3;
        s = (s * 16807) % 2147483647; const r = s / 2147483647;
        const dedans = Math.abs(cx) < demi && Math.abs(cz) < demi;
        tmp.copy(dedans ? (r < 0.5 ? c1 : c2) : c3); tmp.multiplyScalar(0.94 + r * 0.1);
        for (let j = 0; j < 3; j++) { cc[(i + j) * 3] = tmp.r; cc[(i + j) * 3 + 1] = tmp.g; cc[(i + j) * 3 + 2] = tmp.b; }
      }
      gsol.setAttribute('color', new T.BufferAttribute(cc, 3)); gsol.computeVertexNormals();
      texSol.repeat.set(cote / 6, cote / 6);
      const sol = new T.Mesh(gsol, new T.MeshLambertMaterial({ vertexColors: true, map: texSol })); sol.receiveShadow = true; scene.add(sol); enArene.push(sol);
      // la bordure (une haie de bois et de pierre), les obstacles, et le paysage autour (arbres, rochers ; sans collision)
      const F = new Fab();
      const bordure = (x, z, w, d) => F.add(BOITE, A.bord, mat(x, 0.45, z, 0, w, 0.9, d), 0.06, 11);
      bordure(0, -demi - 0.4, A.taille + 1.6, 0.8); bordure(0, demi + 0.4, A.taille + 1.6, 0.8); bordure(-demi - 0.4, 0, 0.8, A.taille); bordure(demi + 0.4, 0, 0.8, A.taille);
      for (let i = -demi; i <= demi; i += 4) for (const [x, z] of [[i, -demi - 0.4], [i, demi + 0.4], [-demi - 0.4, i], [demi + 0.4, i]]) F.add(BOITE, '#8A7458', mat(x, 0.6, z, 0, 0.3, 1.2, 0.3));
      const avecVoitures = !!(MOD && MOD.pret), voitures = [];
      A.obstacles.forEach((o, k) => { if (avecVoitures && o.type === 'voiture') voitures.push(o); else obstacle(F, o, k); });
      let g2 = 4242; const alea = () => { g2 = (g2 * 16807) % 2147483647; return g2 / 2147483647; };
      const autour = AUTOUR[A.id || jeu.arene] || 'arbres';
      for (let i = 0; i < 70; i++) { // le paysage autour de l'arène (arbres et rochers, sapins, immeubles, roches noires… ou de l'eau)
        if (autour === 'eau' || autour === 'tunnel') break;
        const a = alea() * Math.PI * 2, r = demi + 4 + alea() * 18, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < demi + 2 && Math.abs(z) < demi + 2) continue;
        const o = autour === 'sapins' ? { type: 'sapin', c: [x, z, 0.9 + alea() * 0.4] } : autour === 'immeubles' ? { type: 'immeuble', r: [x, z, 5 + alea() * 4, 5 + alea() * 4, 5 + alea() * 9], couleur: ['#3A3F5A', '#4A3A5A', '#2E4A5A'][i % 3] } : autour === 'roches' ? { type: 'roche', c: [x, z, 1 + alea() * 1.6] } : autour === 'murs' ? (i % 3 ? null : { type: 'immeuble', r: [x, z, 6, 6, 3 + alea() * 2], couleur: '#B8BEC6' }) : alea() < 0.7 ? { type: 'arbre', c: [x, z, 0.9 + alea() * 0.6] } : { type: 'rocher', c: [x, z, 0.8 + alea() * 1.2] };
        if (o) obstacle(F, o, 100 + i);
      }
      const decor = new T.Mesh(F.geo(), matVC); decor.castShadow = true; decor.receiveShadow = true; scene.add(decor); enArene.push(decor);
      // de l'eau tout autour (le Port, la Plage)
      if (autour === 'eau') { const eau = new T.Mesh(new T.PlaneGeometry(A.taille + 120, A.taille + 120).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: '#3E8EBE' })); eau.position.y = -0.05; scene.add(eau); enArene.push(eau); sol.material.vertexColors = true; sol.scale.set((A.taille + 2) / (A.taille + 60), 1, (A.taille + 2) / (A.taille + 60)); }
      // la lave (le Volcan), qui brille et ondule, et les enseignes néon : des matériaux qui luisent
      if (A.laves) for (const [lx, lz, w, d] of A.laves) { const m = new T.Mesh(new T.BoxGeometry(w, 0.08, d), matLave); m.position.set(lx, 0.04, lz); scene.add(m); enArene.push(m); }
      for (const o of A.obstacles) if (o.type === 'neon') { const [x, z] = o.c, m = new T.Mesh(new T.BoxGeometry(0.18, 0.9, 1.6), new T.MeshBasicMaterial({ color: o.couleur || '#FF3D9A' })); m.position.set(x, 3.2, z); scene.add(m); enArene.push(m); const l = new T.PointLight(o.couleur || '#FF3D9A', 8, 9, 1.5); l.position.set(x, 3, z); scene.add(l); enArene.push(l); }
      // les touffes d'herbe et les petites fleurs (sans ombre portée), là où il y a de l'herbe
      const H = new Fab(), touffe = cyl(0, 0.09, 0.32, 4), herbeux = HERBE.has(A.id || jeu.arene);
      for (let i = 0; i < (herbeux ? 260 : 0); i++) {
        const x = (alea() * 2 - 1) * (demi - 1), z = (alea() * 2 - 1) * (demi - 1); if (jeu.monde.bloque(x, z, 0.3)) continue;
        if (alea() < 0.82) { for (let k = 0; k < 3; k++) H.add(touffe, alea() < 0.5 ? '#6E9B3E' : '#7FAE48', mat(x + (k - 1) * 0.08, 0.14, z + (k % 2) * 0.07, 0, 1, 0.8 + alea() * 0.6, 1, (k - 1) * 0.3)); }
        else H.add(BOITE, ['#F2E36B', '#F29BB5', '#FFFFFF'][i % 3], mat(x, 0.08, z, alea(), 0.1, 0.06, 0.1));
      }
      if (A.taille && A.sol === '#8C9096') { // le parking : des places peintes au lieu des touffes
        H.l.length = 0;
        for (let i = -4; i <= 4; i++) for (const z of [-9, 13.5]) H.add(BOITE, '#E8E8E8', mat(i * 3.5, 0.012, z, 0, 0.14, 0.02, 4));
      }
      if (H.l.length) { const herbe = new T.Mesh(H.geo(), matVC); herbe.receiveShadow = true; scene.add(herbe); enArene.push(herbe); }
      // les voitures du Parking : des modèles Kenney (Car Kit), à la taille de leur rectangle, fusionnés en un seul maillage (une palette)
      if (voitures.length) {
        const objs = voitures.map((o, k) => {
          const O = MOD.M.voitures[k % MOD.M.voitures.length], [x, z, w, d] = o.r, c = O.scene.clone(true);
          const long = O.boite.max.z - O.boite.min.z, sc = Math.max(w, d) / long * 1.02;
          c.scale.setScalar(sc); c.rotation.y = (w > d ? Math.PI / 2 : 0) + (k % 2 ? Math.PI : 0); c.position.set(x, -O.boite.min.y * sc, z); c.updateMatrixWorld(true);
          return c;
        });
        const m = new T.Mesh(fusionner(objs), new T.MeshLambertMaterial({ map: premierMap(MOD.M.voitures[0].scene) })); m.castShadow = true; m.receiveShadow = true; scene.add(m); enArene.push(m);
      }
      decor5d(jeu, A, demi);
      cam.init = false;
      prechauffer(); // (le Lot 7a : tous les matériaux compilés au chargement de l'arène)
    }
    // ─── le Lot 5d : les voies et le train du Métro, les murs du tunnel ; les armoires de l'Hôpital ; les barbelés de la Base ───
    let train3d = null, feux = [], pharmas3d = [];
    function decor5d(jeu, A, demi) {
      train3d = null; feux = []; pharmas3d = [];
      const F = new Fab(); let rien = true;
      for (const V of A.voies || []) { // le ballast, les traverses, deux rails ; la ligne jaune du bord des quais ; la voie file dans les tunnels
        rien = false; const L = A.taille + 40;
        F.add(BOITE, '#4A3E36', mat(0, 0.015, V.z, 0, L, 0.03, V.largeur), 0.05, 31);
        for (let x = -L / 2; x <= L / 2; x += 0.9) F.add(BOITE, '#6A4E36', mat(x, 0.05, V.z, 0, 0.32, 0.06, V.largeur * 0.82));
        for (const sg of [-0.28, 0.28]) F.add(BOITE, '#B8BEC6', mat(0, 0.12, V.z + sg * V.largeur, 0, L, 0.1, 0.1));
        for (const sg of [-1, 1]) F.add(BOITE, '#F2C230', mat(0, 0.02, V.z + sg * (V.largeur / 2 + 0.25), 0, A.taille, 0.03, 0.22));
        for (const sx of [-1, 1]) { const tx = sx * (demi + 1.6); F.add(BOITE, '#1A1D22', mat(tx, 2.2, V.z, 0, 0.3, 4.4, V.largeur + 1.4)); } // la bouche du tunnel, noire
        for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshBasicMaterial({ color: '#5A1A1A' })); m.position.set(-demi + 4 + i * (A.taille - 8) / 5, 0.25, V.z + V.largeur / 2 + 0.55); scene.add(m); enArene.push(m); feux.push({ m, voie: A.voies.indexOf(V) }); }
      }
      if (A.voies) { // les murs carrelés autour de la station, ouverts sur les tunnels
        for (const sz of [-1, 1]) F.add(BOITE, '#5A606A', mat(0, 3, sz * (demi + 2), 0, A.taille + 8, 6, 1.2), 0.04, 33);
        for (const sx of [-1, 1]) for (const [z0, z1] of [[-demi - 2, A.voies[0].z - 2.6], [A.voies[0].z + 2.6, A.voies[1].z - 2.6], [A.voies[1].z + 2.6, demi + 2]]) F.add(BOITE, '#5A606A', mat(sx * (demi + 2), 3, (z0 + z1) / 2, 0, 1.2, 6, z1 - z0), 0.04, 34);
        const T3 = new Fab(), L = D.TRAIN.longueur; T3.add(BOITE, '#D8DEE4', mat(0, 1.4, 0, 0, L, 2.6, 2.9), 0.03, 40); T3.add(BOITE, '#2E6EB0', mat(0, 0.6, 0, 0, L * 1.01, 0.35, 2.95));
        for (let i = 0; i < 7; i++) for (const sg of [-1, 1]) T3.add(BOITE, '#3A4A5A', mat(-L / 2 + 1.4 + i * 2.2, 1.8, sg * 1.46, 0, 1.4, 0.9, 0.04));
        T3.add(BOITE, '#FFF2B8', mat(L / 2 + 0.02, 1.0, 0.9, 0, 0.04, 0.3, 0.4)); T3.add(BOITE, '#FFF2B8', mat(L / 2 + 0.02, 1.0, -0.9, 0, 0.04, 0.3, 0.4)); T3.add(BOITE, '#2A3440', mat(L / 2 + 0.01, 1.9, 0, 0, 0.04, 1.0, 2.4));
        train3d = new T.Mesh(T3.geo(), matVC); train3d.castShadow = true; train3d.visible = false; scene.add(train3d); enArene.push(train3d);
      }
      if (A.pharmacies) { rien = false; for (let t = -demi + 2; t < demi; t += 2) { F.add(BOITE, '#C2CCCF', mat(t, 0.012, 0, 0, 0.06, 0.02, A.taille)); F.add(BOITE, '#C2CCCF', mat(0, 0.012, t, 0, A.taille, 0.02, 0.06)); } } // (le carrelage de l'Hôpital)
      for (const [x, z, w, d] of A.barbeles || []) { // les barbelés : des piquets et des spirales de fil
        rien = false; const lx = w >= d, L = lx ? w : d, n = Math.max(3, Math.round(L / 0.55));
        for (let i = 0; i <= Math.round(L / 2); i++) { const t = -L / 2 + i * L / Math.round(L / 2); F.add(BOITE, '#6A5A3A', mat(x + (lx ? t : 0), 0.45, z + (lx ? 0 : t), 0, 0.08, 0.9, 0.08)); }
        for (let i = 0; i < n; i++) { const t = -L / 2 + L * (i + 0.5) / n; F.add(new T.TorusGeometry(0.34, 0.025, 4, 10), '#9AA0A8', mat(x + (lx ? t : 0), 0.4, z + (lx ? 0 : t), lx ? Math.PI / 2 : 0, 1, 1, 1, 0.25)); }
      }
      if (!rien || A.voies) { const m = new T.Mesh(F.geo(), matVC); m.castShadow = true; m.receiveShadow = true; scene.add(m); enArene.push(m); }
      for (const p of jeu.pharmas || []) { // la croix verte qui luit au-dessus de l'armoire, son cercle au sol
        const croix = new T.Group(), mc = new T.MeshBasicMaterial({ color: '#4FE07A' }); for (const [a, b] of [[0.7, 0.22], [0.22, 0.7]]) { const m = new T.Mesh(new T.BoxGeometry(a, b, 0.08), mc); croix.add(m); }
        croix.position.set(p.x, 2.7, p.z - 0.9); scene.add(croix); enArene.push(croix);
        const anneau = new T.Mesh(new T.RingGeometry(D.PHARMACIE.rayon - 0.12, D.PHARMACIE.rayon, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#4FC36A', transparent: true, opacity: 0.55, depthWrite: false }));
        anneau.position.set(p.x, 0.04, p.z); scene.add(anneau); enArene.push(anneau); pharmas3d.push({ croix, mc, anneau });
      }
    }
    function majArene5d(jeu, dt) {
      const T0 = jeu.train, t = performance.now() / 1000;
      if (train3d && T0) {
        const passe = T0.phase === 'passe', V = jeu.A.voies[T0.voie]; train3d.visible = passe;
        if (passe && typeof ZJEU !== 'undefined' && ZJEU.trainX) { const xt = ZJEU.trainX(jeu), L = D.TRAIN.longueur; train3d.position.set(xt - T0.sens * L / 2, 0, V.z); train3d.rotation.y = T0.sens > 0 ? 0 : Math.PI; if (Math.random() < dt * 30) particule(xt, 0.3, V.z + (Math.random() - 0.5) * 2, -T0.sens * 4, 1, (Math.random() - 0.5) * 2, 0.4, 0.12, '#8A8070', 0); }
        const clign = T0.phase !== 'attente' && Math.floor(t * 6) % 2 === 0; for (const f of feux) f.m.material.color.set(clign && f.voie === T0.voie ? '#FF3A2A' : '#5A1A1A');
      }
      (jeu.pharmas || []).forEach((p, i) => { const o = pharmas3d[i]; if (!o) return; const pret = !(p.recharge > 0); o.mc.color.set(pret ? '#4FE07A' : '#6A6F78'); o.croix.rotation.y = pret ? t * 1.2 : 0; o.anneau.visible = pret; o.anneau.material.opacity = 0.35 + 0.25 * (p.stock / D.PHARMACIE.stock) + Math.sin(t * 4) * 0.08; });
    }

    // ─── la caméra : au-dessus, inclinée, elle suit le survivant (avec un peu d'avance dans le sens de la marche) ───
    const cam = { x: 0, z: 0, init: false };
    let secousse = 0, W = 1, H = 1;
    let decal = 0, decalVoulu = 0;
    // la vitrine (l'écran titre, la Collection) : la caméra descend en plan rapproché sur le survivant, posé là où l'écran le demande
    // (x, y : sa place, en fraction de l'écran, par un décalage de la vue) ; le passage vers le jeu et retour est un travelling continu
    let vit = 0, vitVoulu = 0, vitX = 0.5, vitY = 0.55, vitDist = 1, vitAz = Math.atan2(9.4, 3.2); // (vitAz : d'où la vitrine filme)
    const _cn = T ? new T.Vector3() : null, _cv = T ? new T.Vector3() : null, _vn = T ? new T.Vector3() : null, _vv = T ? new T.Vector3() : null;
    function vitrine(on, x, y, dist) { vitVoulu = on ? 1 : 0; if (x != null) vitX = x; if (y != null) vitY = y; if (dist != null) vitDist = dist; }
    // la texture de détail du sol : des grains et de grandes taches douces (sans raccord visible : chaque tache est aussi dessinée de l'autre
    // côté du bord), qui multiplie les couleurs des facettes
    const texSol = (() => {
      const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n, n);
      let graine = 7; const rnd = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
      const partout = (f) => { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) f(dx, dy); };
      for (let i = 0; i < 16; i++) { const x = rnd() * n, y = rnd() * n, r = 24 + rnd() * 44, fonce = rnd() < 0.55; partout((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, fonce ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); }); }
      for (let i = 0; i < 2200; i++) { const v = (200 + rnd() * 55) | 0, x = rnd() * n, y = rnd() * n, r = 0.8 + rnd() * 2.6, e = 0.4 + rnd() * 0.6, a = rnd() * 3; g.fillStyle = `rgb(${v},${v},${v})`; partout((dx, dy) => { g.beginPath(); g.ellipse(x + dx, y + dy, r, r * e, a, 0, 7); g.fill(); }); }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
    })();
    const AUTOUR = { foret: 'sapins', neon: 'immeubles', volcan: 'roches', supermarche: 'murs', port: 'eau', plage: 'eau', cimetiere: 'sapins', metro: 'tunnel', hopital: 'murs', base: 'sapins' };
    const HERBE = new Set(['jardin', 'ferme', 'cimetiere', 'foret', 'base']);
    const matLave = new T.MeshBasicMaterial({ color: '#FF6A1A' });
    function majCamera(jeu, idMoi, dt) {
      const j = jeu.camera || jeu.joueurs.find((k) => k.id === idMoi) || jeu.joueurs[0]; if (!j) return; // (l'Infection : la caméra suit ton zombie)
      const tx = j.x + (j.vx || 0) * 0.25, tz = j.z + (j.vz || 0) * 0.25;
      if (!cam.init) { cam.x = tx; cam.z = tz; cam.init = true; }
      const k = 1 - Math.exp(-6 * dt); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k;
      const portrait = H > W; let haut = portrait ? 30 : 20.5, recul = portrait ? 12 : 11.2, fx = cam.x, fz = cam.z; // (en paysage, un peu plus près qu'avant : 22 et 12)
      if (cine) { // plongée : la caméra descend vers le point, puis remonte (courbe en cloche)
        cine.t += dt; const u = Math.min(1, cine.t / cine.duree), w = Math.sin(u * Math.PI);
        fx = cam.x + (cine.x - cam.x) * w; fz = cam.z + (cine.z - cam.z) * w; haut -= 11 * w; recul -= 5 * w;
        if (u >= 1) cine = null;
      }
      decal += (decalVoulu - decal) * k; fx += decal * 0.7; haut -= Math.abs(decal) * 1.4; recul -= Math.abs(decal) * 0.4; // (la collection : le survivant à gauche, en plus gros)
      let sx = 0, sz = 0; if (secousse > 0) { secousse = Math.max(0, secousse - dt); sx = (Math.random() - 0.5) * secousse * 0.6; sz = (Math.random() - 0.5) * secousse * 0.6; }
      camera.position.set(fx + sx, haut, fz + recul + sz); camera.lookAt(fx + sx, 0, fz + sz - (portrait ? 0 : 0.5));
      vit += (vitVoulu - vit) * (1 - Math.exp(-2.6 * dt)); if (Math.abs(vitVoulu - vit) < 1e-3) vit = vitVoulu;
      if (vit > 0) {
        const e = vit * vit * (3 - 2 * vit), d = vitDist; // (en douceur)
        _cn.copy(camera.position); _vn.set(fx + sx, 0, fz + sz - (portrait ? 0 : 0.5));
        // la caméra tourne lentement pour filmer le survivant de face (un peu de trois quarts), plutôt que son dos quand il tire au loin
        if (j.angle != null) { let v = j.angle + 0.42 - vitAz; v = Math.atan2(Math.sin(v), Math.cos(v)); vitAz += v * (1 - Math.exp(-0.9 * dt)); }
        const R = 9.93 * d; _cv.set(cam.x + Math.cos(vitAz) * R, 4.6 * d + 0.6, cam.z + Math.sin(vitAz) * R); _vv.set(cam.x, 1.0, cam.z);
        camera.position.lerpVectors(_cn, _cv, e); _vn.lerp(_vv, e); camera.lookAt(_vn);
        camera.setViewOffset(W, H, (0.5 - vitX) * W * e, (0.5 - vitY) * H * e, W, H);
      } else if (camera.view && camera.view.enabled) camera.clearViewOffset();
      // l'ombre suit la caméra (une carte d'ombre de 48 m de côté autour d'elle)
      soleil.position.set(cam.x - 9, 22, cam.z + 12); soleil.target.position.set(cam.x, 0, cam.z);
    }

    // ─── une image ───
    let derniereT = 0;
    let impacts = 0;
    function image(jeu, idMoi, dt, evs) {
      impacts = 0; ajusterQualite();
      if (!arene || arene !== jeu.A) charger(jeu);
      if (evs) for (const e of evs) {
        switch (e.t) {
          case 'tir': {
            if (e.rb) { tracante(e.x, e.z, e.a, e.l, e.arme); for (let k = 0; k < 3; k++) particule(e.x, 1.0, e.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.2, 0.05, '#FFE07A', 0); break; } // (un ricochet : la trace repart du mur, une étincelle)
            const s = survivants.get(e.de), bc = boutCanon(s), A0 = D.ARMES[e.cle];
            if (bc && e.arme !== 'flamme' && e.arme !== 'cryo' && e.arme !== 'tesla' && e.arme !== 'scie' && e.arme !== 'lame' && e.arme !== 'sonique') { // (l'éclair du canon, et sa lumière une fois sur deux)
              const gros = A0 && (A0.famille === 'pompe' || A0.famille === 'sniper' || A0.famille === 'lanceur'), laser = A0 && A0.famille === 'energie';
              eclatBouche(bc, gros ? 1.2 : 0.8, laser ? '#FF9AC0' : '#FFE2A0'); if (gros || Math.random() < 0.5) lumiere(bc.x, bc.y, bc.z, laser ? '#FF6FA0' : '#FFC870', gros ? 9 : 5, 6, 0.07);
            } else if (e.cle === 'tourelle') eclatBouche(_bout.set(e.x + Math.cos(e.a) * 0.6, 1.05, e.z + Math.sin(e.a) * 0.6), 0.55, '#BFEFFF');
            effetTir(e, bc);
            if (s) { s.recul = 1; if (!e.b) { const a = e.a + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) * 0.9; particule(e.x, 1.0, e.z, Math.cos(a) * 2.5, 2.5 + Math.random() * 1.5, Math.sin(a) * 2.5, 1.3, 0.07, '#E0B040', 0.4); } } // une douille
            break;
          }
          case 'mort':
            flaque(e.x, e.z, D.ZOMBIES[e.type].taille * 1.1, '#5E8C2E');
            if (e.boss) { cinema(e.x, e.z, 1.9); secousse = Math.max(secousse, 0.6); for (let k = 0; k < 60; k++) particule(e.x, 1.5, e.z, (Math.random() - 0.5) * 9, 5 + Math.random() * 8, (Math.random() - 0.5) * 9, 1.6 + Math.random(), 0.11, k % 3 ? '#FFD84A' : '#FFF4C0', 0.45); }
            if (KZ && !D.ZOMBIES[e.type].boss && (e.fort || Math.random() < 0.45)) eclater(e); // en morceaux
            else { corps.push({ type: e.type, x: e.x, z: e.z, a: e.a || 0, t: 0 }); if (corps.length > MAX_CORPS) corps.shift(); }
            break;
          case 'touche':
            if (Math.random() < 0.25) flaque(e.x + (Math.random() - 0.5) * 0.6, e.z + (Math.random() - 0.5) * 0.6, 0.35, '#6F9A38');
            if (!e.petit && impacts++ < 10) { for (let k = 0; k < (e.crit ? 5 : 2); k++) particule(e.x, 1.0, e.z, (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 5, 0.22, 0.06, k % 2 ? '#FFF3C0' : '#FFD25A', 0); particule(e.x, 1.0, e.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.09, '#6F9A38', 0.1); } // (étincelles et gouttes ; au plus 10 impacts par image)
            break;
          case 'boum': boum(e.x, e.z, e.r, e.petite); if (!e.petite) flaque(e.x, e.z, e.r * 0.55, '#4A4A3A'); break;
          case 'flaque': flaque(e.x, e.z, 0.7, '#A6D63A'); break;
          case 'blesse': secousse = Math.max(secousse, 0.18); break;
          case 'souffle': for (let k = 0; k < 4; k++) { const a = e.a + (Math.random() - 0.5) * 0.7, v = 5 + Math.random() * 3; particule(e.x + Math.cos(e.a) * 0.4, 1.2, e.z + Math.sin(e.a) * 0.4, Math.cos(a) * v, 0.5 + Math.random(), Math.sin(a) * v, 0.55 + Math.random() * 0.2, 0.2 + Math.random() * 0.15, k % 2 ? '#FF7A1A' : '#FFC24A', 0); } break;
          case 'pare': for (let k = 0; k < 7; k++) particule(e.x, 1.1, e.z, (Math.random() - 0.5) * 6, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.3, 0.07, k % 2 ? '#FFFFFF' : '#FFE07A', 0.3); break;
          case 'saute': case 'atterrit': for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; particule(e.x + Math.cos(a) * 0.3, 0.15, e.z + Math.sin(a) * 0.3, Math.cos(a) * 2, 0.6, Math.sin(a) * 2, 0.45, 0.14, '#C8B48A', 0); } if (e.t === 'atterrit') secousse = Math.max(secousse, 0.12); break;
          case 'invoque': for (const p of [[e.x, e.z]].concat(e.pts || [])) for (let k = 0; k < 10; k++) particule(p[0] + (Math.random() - 0.5) * 0.8, 0.1, p[1] + (Math.random() - 0.5) * 0.8, 0, 2 + Math.random() * 2, 0, 0.8, 0.11, k % 2 ? '#B57CFF' : '#E8D8FF', 0); break;
          case 'detone': flaque(e.x, e.z, 1.4, '#3A3A30'); break;
          case 'infecte': flaque(e.x, e.z, 1.0, '#5E8C2E'); for (let k = 0; k < 18; k++) particule(e.x, 1.0, e.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.7, 0.12, k % 2 ? '#8FD14F' : '#4F8A2E', 0.4); secousse = Math.max(secousse, 0.2); break;
          case 'alerte': if (alertes.length < 8) alertes.push({ x: e.x, z: e.z, r: e.r, delai: e.delai, t: 0, meteo: e.meteo, couleur: e.meteo === 'artillerie' ? '#FF8A3A' : null }); break;
          case 'impact':
            if (e.meteo === 'orage') { let px = e.x + (Math.random() - 0.5) * 2, py = 16, pz = e.z + (Math.random() - 0.5) * 2; for (let k = 1; k <= 6; k++) { const f = k / 6, nx = e.x + (Math.random() - 0.5) * (1 - f) * 2.5, ny = 16 * (1 - f), nz = e.z + (Math.random() - 0.5) * (1 - f) * 2.5; segment(px, py, pz, nx, ny, nz, 0.16, '#E8F4FF', 0.22); px = nx; py = ny; pz = nz; } eclairT = 0.15; }
            else flaque(e.x, e.z, 1.6, '#2A2420');
            break;
          case 'casse': boum(e.x, e.z, 1.0); break;
          case 'bonus': {
            const B = D.BONUS[e.bonus] || { couleur: '#FFF' }; onde(e.x, e.z, 1.6, B.couleur); for (let k = 0; k < 14; k++) { const a = Math.random() * 6.28, v = 2 + Math.random() * 3; particule(e.x, 0.7, e.z, Math.cos(a) * v, 2 + Math.random() * 3, Math.sin(a) * v, 0.5, 0.09, B.couleur, 0); }
            if (e.bonus === 'bombe') { const j = jeu.joueurs.find((x) => x.id === e.id); if (j) { boum(j.x, j.z, 4.5); onde(j.x, j.z, e.r || 14, '#FFFFFF'); onde(j.x, j.z, (e.r || 14) * 0.6, '#FF8A3A'); lumiere(j.x, 3, j.z, '#FFF2C0', 60, 30, 0.45); secousse = Math.max(secousse, 0.8); } }
            break;
          }
          case 'largue': { secousse = Math.max(secousse, 0.15); for (let k = 0; k < 4; k++) fumee(e.x + (Math.random() - 0.5) * 1.5, 0.3, e.z + (Math.random() - 0.5) * 1.5, 0.9, 1.4, '#B8A88A'); for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28; particule(e.x, 0.2, e.z, Math.cos(a) * 3, 1.5 + Math.random() * 2, Math.sin(a) * 3, 0.6, 0.1, '#C8B48A', 0.2); } break; }
          case 'piege': onde(e.x, e.z, D.PIEGE.rayon * 1.3, '#7FDBFF'); break;
          case 'zap': zap(e); break;
          // le Lot 5b : la roulade, la singularité qui s'ouvre et qui implose, la contagion des toxines
          // le Lot 5c : les capacités, les tirs des drones
          case 'capacite': {
            const C = D.CAPACITES[e.cap] || { couleur: '#FFF' }, j = jeu.joueurs.find((x) => x.id === e.id), x = j ? j.x : e.x, z = j ? j.z : e.z;
            if (e.cap === 'soin') { onde(x, z, e.r || 6, '#4FC36A'); onde(x, z, 1.6, '#FFFFFF'); for (const k of jeu.joueurs) if (k.vivant && Math.hypot(k.x - x, k.z - z) <= (k.id === e.id ? 0.1 : e.r || 6)) for (let n = 0; n < 16; n++) particule(k.x + (Math.random() - 0.5) * 0.9, 0.3, k.z + (Math.random() - 0.5) * 0.9, 0, 2 + Math.random() * 2, 0, 0.8, 0.11, n % 3 ? '#7FE08A' : '#FFFFFF', 0); lumiere(x, 2, z, '#7FE08A', 25, 10, 0.3); }
            else if (e.cap === 'rage') { onde(x, z, 3, '#E5533D'); for (let n = 0; n < 24; n++) { const b = Math.random() * 6.28, v = 2 + Math.random() * 4; particule(x, 1.0, z, Math.cos(b) * v, 1 + Math.random() * 3, Math.sin(b) * v, 0.5, 0.11, n % 2 ? '#FF4A2A' : '#FFB03A', 0.3); } lumiere(x, 2, z, '#FF5A3A', 30, 10, 0.3); secousse = Math.max(secousse, 0.2); }
            else if (e.cap === 'drone') { for (let n = 0; n < 14; n++) particule(x, 1.6, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.08, n % 2 ? '#3BB7F0' : '#FFFFFF', 0); onde(x, z, 1.8, '#3BB7F0'); }
            else if (e.cap === 'artillerie') { fumee(x, 0.3, z, 0.8, 1.6, '#FF8A3A'); for (let n = 0; n < 8; n++) particule(x, 0.3, z, (Math.random() - 0.5) * 1.5, 3 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 0.8, 0.12, '#FF6A2A', 0); }
            break;
          }
          case 'drone': { const p = e.pts || [], c = e.feu ? '#FFB03A' : e.arc ? '#BFF0FF' : '#9AE6FF'; for (let k = 0; k + 1 < p.length; k++) segment(p[k][0], k ? 1.0 : 2.1, p[k][1], p[k + 1][0], 1.0, p[k + 1][1], e.arc ? 0.06 : 0.045, c, 0.08); if (p.length > 1) particule(p[1][0], 1.0, p[1][1], 0, 1, 0, 0.2, 0.07, c, 0); break; }
          case 'finDrone': for (let n = 0; n < 8; n++) particule(e.x, 2.1, e.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.4, 0.08, '#9AA3AE', 0.4); break;
          case 'compagnon':
            if (e.type === 'robot') segment(e.x, 1.2, e.z, e.cx, 1.0, e.cz, 0.05, '#5AE0FF', 0.07);
            else for (let n = 0; n < 4; n++) particule(e.cx, 0.9, e.cz, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.3, 0.07, e.type === 'renne' ? '#BFF0FF' : e.type === 'corbeau' ? '#2E2E36' : '#FFE07A', 0.3);
            break;
          case 'cadeau': onde(e.x, e.z, 1.6, '#F2C230'); for (let n = 0; n < 18; n++) { const b = Math.random() * 6.28, v = 2 + Math.random() * 3; particule(e.x, 0.6, e.z, Math.cos(b) * v, 2 + Math.random() * 3, Math.sin(b) * v, 0.6, 0.08, ['#D8283A', '#F2C230', '#FFFFFF', '#2EB85C'][n % 4], 0.3); } break;
          case 'train': secousse = Math.max(secousse, 0.35); break;
          case 'renverse': secousse = Math.max(secousse, 0.6); for (let n = 0; n < 12; n++) particule(e.x, 1, e.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 2, (Math.random() - 0.5) * 5, 0.5, 0.1, '#FFE07A', 0.3); break;
          case 'soigne': for (let n = 0; n < 3; n++) particule(e.x + (Math.random() - 0.5) * 0.7, 0.4, e.z + (Math.random() - 0.5) * 0.7, 0, 2, 0, 0.7, 0.1, n % 2 ? '#7FE08A' : '#FFFFFF', 0); break;
          case 'roule': for (let k = 0; k < 10; k++) { const b = (e.a || 0) + Math.PI + (Math.random() - 0.5) * 1.4, v = 1 + Math.random() * 2.5; particule(e.x, 0.15, e.z, Math.cos(b) * v, 0.8 + Math.random(), Math.sin(b) * v, 0.5, 0.14, '#C8B48A', 0); } break;
          case 'trou': onde(e.x, e.z, e.r || 4, '#8A5AFF'); lumiere(e.x, 1.5, e.z, '#8A5AFF', 20, 10, 0.3); break;
          case 'implose': boum(e.x, e.z, e.r || 3); onde(e.x, e.z, (e.r || 3) * 1.6, '#B48CFF'); onde(e.x, e.z, e.r || 3, '#FFFFFF'); lumiere(e.x, 2, e.z, '#C8A8FF', 50, 22, 0.4); secousse = Math.max(secousse, 0.5); for (let k = 0; k < 30; k++) { const b = Math.random() * 6.28, v = 3 + Math.random() * 6; particule(e.x, 1, e.z, Math.cos(b) * v, 2 + Math.random() * 4, Math.sin(b) * v, 0.7, 0.11, k % 2 ? '#B48CFF' : '#2A1A4A', 0.3); } break;
          case 'contagion': onde(e.x, e.z, e.r || 2.5, '#8CF05A'); for (let k = 0; k < 12; k++) { const b = Math.random() * 6.28, v = 1 + Math.random() * 2.5; particule(e.x, 0.8, e.z, Math.cos(b) * v, 1 + Math.random() * 1.5, Math.sin(b) * v, 0.7, 0.16, k % 2 ? '#8CF05A' : '#4F8A2E', 0); } break;
          // le Lot 5 : le bouclier qui sonne et qui casse, le fouisseur, la ponte, le hurlement ; les boss (la phase, l'attaque annoncée puis portée)
          case 'ricoche': { const a = e.a || 0; for (let k = 0; k < 4; k++) particule(e.x + Math.cos(a) * 0.55, 0.9, e.z + Math.sin(a) * 0.55, Math.cos(a) * 2 + (Math.random() - 0.5) * 4, 1 + Math.random() * 2.5, Math.sin(a) * 2 + (Math.random() - 0.5) * 4, 0.25, 0.06, k % 2 ? '#FFFFFF' : '#FFE07A', 0); break; }
          case 'brise': { const a = e.a || 0; for (let k = 0; k < 16; k++) particule(e.x + Math.cos(a) * 0.5, 0.9, e.z + Math.sin(a) * 0.5, Math.cos(a) * 3 + (Math.random() - 0.5) * 6, 2 + Math.random() * 4, Math.sin(a) * 3 + (Math.random() - 0.5) * 6, 0.9, 0.1, k % 3 ? '#8A929E' : '#D8DEE6', 0.5); lumiere(e.x, 1, e.z, '#FFF2C0', 8, 6, 0.08); break; }
          case 'terre': case 'surgit': {
            const n = e.t === 'surgit' ? 22 : 10; for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, v = 1 + Math.random() * (e.t === 'surgit' ? 4 : 2); particule(e.x, 0.15, e.z, Math.cos(a) * v, 2 + Math.random() * 4, Math.sin(a) * v, 0.7, 0.12, k % 2 ? '#7A5A3A' : '#A88A5A', 0.5); }
            flaque(e.x, e.z, e.t === 'surgit' ? 1.3 : 0.8, '#4A3A28'); if (e.t === 'surgit') { onde(e.x, e.z, e.r || 1.5, '#C8A070'); secousse = Math.max(secousse, 0.15); } break;
          }
          case 'ponte': flaque(e.x, e.z, 0.7, '#C8A0B8'); for (const p of e.pts || []) for (let k = 0; k < 6; k++) particule(p[0], 0.3, p[1], (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.45, 0.08, k % 2 ? '#F0E0B0' : '#E8B8D8', 0); break;
          case 'hurle': onde(e.x, e.z, e.r || 7, '#FF5A4A'); onde(e.x, e.z, (e.r || 7) * 0.55, '#FF9A8A'); break;
          case 'phase': {
            cinema(e.x, e.z, 1.2); secousse = Math.max(secousse, 0.5); onde(e.x, e.z, D.PHASES.repousse + 1, '#FFFFFF'); onde(e.x, e.z, 7, e.n >= 3 ? '#FF3B2F' : '#FFB03A'); lumiere(e.x, 2.5, e.z, e.n >= 3 ? '#FF5A3A' : '#FFC870', 40, 18, 0.4);
            for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 3 + Math.random() * 5; particule(e.x, 1.2, e.z, Math.cos(a) * v, 2 + Math.random() * 4, Math.sin(a) * v, 0.9, 0.12, k % 2 ? '#FFD84A' : '#FF6A3A', 0.4); }
            for (const p of e.pts || []) for (let k = 0; k < 8; k++) particule(p[0], 0.2, p[1], (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 0.1, '#5A4A3A', 0);
            break;
          }
          case 'prepare': if (alertes.length < 8) alertes.push({ x: e.x, z: e.z, r: e.r, delai: e.delai, t: 0, couleur: e.genre === 'nova' ? '#5AC8FF' : e.genre === 'eclipse' ? '#B05AFF' : '#FF3B2F' }); break;
          case 'frappe':
            if (e.genre === 'nova') { onde(e.x, e.z, e.r, '#A8E4FF'); onde(e.x, e.z, e.r * 0.6, '#FFFFFF'); lumiere(e.x, 2, e.z, '#BFEFFF', 50, 20, 0.35); for (let k = 0; k < 40; k++) { const a = Math.random() * 6.28, v = 4 + Math.random() * 6; particule(e.x, 0.6, e.z, Math.cos(a) * v, 1 + Math.random() * 3, Math.sin(a) * v, 0.8, 0.1, k % 2 ? '#E8F8FF' : '#7FD0FF', 0.3); } flaque(e.x, e.z, e.r * 0.7, '#CFEFFF'); }
            else { boum(e.x, e.z, e.genre === 'bond' ? 1.6 : 2.4); onde(e.x, e.z, e.r, '#E0C090'); flaque(e.x, e.z, e.r * 0.5, '#3A3428'); for (let k = 0; k < 24; k++) { const a = Math.random() * 6.28, v = 3 + Math.random() * 5; particule(e.x + Math.cos(a) * 0.8, 0.2, e.z + Math.sin(a) * 0.8, Math.cos(a) * v, 1 + Math.random() * 3, Math.sin(a) * v, 0.7, 0.14, k % 2 ? '#8A7A60' : '#C8B48A', 0.5); } }
            secousse = Math.max(secousse, e.genre === 'bond' ? 0.4 : 0.6); break;
          case 'eclipse': for (const [x, z] of [[e.x0, e.z0], [e.x, e.z]]) { for (let k = 0; k < 18; k++) { const a = Math.random() * 6.28, v = 1.5 + Math.random() * 3; particule(x, 1.4, z, Math.cos(a) * v, 1 + Math.random() * 3, Math.sin(a) * v, 0.7, 0.13, k % 3 ? '#2A1A30' : '#8C1C2C', 0); } fumee(x, 0.8, z, 0.8, 1.2, '#3A2A40'); } break;
        }
      }
      majSurvivants(jeu, idMoi, dt);
      majZombies(jeu, dt);
      majBoss(jeu, dt);
      majObjets(jeu);
      { const tps = performance.now() / 1000; for (const j of jeu.joueurs) { const s = survivants.get(j.id); if (s) auras(s, j, tps, dt); } majLeurres(jeu, tps); majLargage(jeu, tps, dt); majPieges(jeu, tps); }
      majDefenses(jeu, dt);
      majProjectiles(jeu);
      majArene5d(jeu, dt);
      majCompagnons(jeu, dt);
      majNeige(jeu, dt);
      majTrous(jeu, dt);
      majDrones(jeu, dt);
      majDisquesZones(jeu, dt);
      majChaines(jeu);
      if (MOD && MOD.arcsEnCiel.size) { const h = (performance.now() / 4000) % 1; for (const m of MOD.arcsEnCiel) { m.color.setHSL(h, 0.85, 0.55); if (m.emissive) m.emissive.setHSL(h, 0.85, 0.15); } }
      majMeteo(jeu, idMoi, dt);
      if (arene && arene.laves) { const tps = performance.now() / 1000; matLave.color.setRGB(1, 0.16 + Math.sin(tps * 3) * 0.05, 0.01); if (Math.random() < dt * 8) { const [lx, lz, w, d] = arene.laves[Math.floor(Math.random() * arene.laves.length)]; particule(lx + (Math.random() - 0.5) * w, 0.1, lz + (Math.random() - 0.5) * d, 0, 1.2 + Math.random(), 0, 0.7, 0.12, Math.random() < 0.5 ? '#FFB347' : '#FF5A1A', 0); } }
      majAlertes(dt);
      majFlaques(dt);
      majParticules(dt);
      majEffets(dt);
      for (const o of tracantes) if (o.m.visible) { o.t -= dt; o.m.material.opacity = Math.max(0, o.t / 0.06); if (o.t <= 0) o.m.visible = false; }
      for (const o of segs) if (o.m.visible) { o.t -= dt; o.m.material.opacity = Math.max(0, o.t / o.d); if (o.t <= 0) o.m.visible = false; }
      for (const o of boums) if (o.m.visible) { o.t -= dt; const k = 1 - o.t / 0.45; o.m.scale.setScalar(o.r * (0.3 + k * 0.9)); o.m.material.opacity = Math.max(0, 0.9 * (1 - k)); o.m.material.color.set(k < 0.3 ? '#FFE07A' : '#FF8A3A'); if (o.t <= 0) o.m.visible = false; }
      majCamera(jeu, idMoi, dt);
      if (qualite !== 'eco' && nImage++ % QP().chaque === 0) renderer.shadowMap.needsUpdate = true; // (le Lot 7a : l'ombre, toutes les 1 ou 2 images)
      renderer.render(scene, camera);
      derniereT = performance.now();
    }
    // le Lot 7a : la qualité automatique. Sur des fenêtres de 1,5 s, la durée moyenne d'une image : au-delà de 21 ms (moins de 48 images par
    // seconde), un palier de moins (deux au-delà de 60 ms : un téléphone qui peine ne doit pas attendre) ; en dessous de 17,5 ms pendant 6 s
    // d'affilée (et pas de baisse depuis 20 s), un palier de plus. Une image de plus d'une seconde (un chargement, l'onglet caché) ne compte
    // pas, les autres comptent au plus 400 ms (sur un appareil très lent, toutes sont longues : elles doivent faire baisser la qualité).
    // Après trois remontées suivies d'une rechute, on ne remonte plus.
    const auto = { acc: 0, n: 0, der: 0, bon: 0, baisse: -1e9, rechutes: 0, monte: false };
    let msMoy = 0;
    function ajusterQualite() {
      const t = performance.now(), brut = auto.der ? t - auto.der : 0; auto.der = t; if (!brut || brut > 1000) return;
      const ms = Math.min(400, brut); auto.acc += ms; auto.n++; if (auto.acc < 1500) return;
      const moy = auto.acc / auto.n; auto.acc = 0; auto.n = 0; msMoy = moy; if (reglage !== 'auto') return;
      if (moy > 21 && palier < PALIERS.length - 1) { if (auto.monte) auto.rechutes++; auto.monte = false; auto.bon = 0; auto.baisse = t; appliquer(palier + (moy > 60 ? 2 : 1)); }
      else if (moy < 17.5) { auto.bon += 1.5; if (auto.bon >= 6 && palier > 0 && t - auto.baisse > 20000 && auto.rechutes < 3) { auto.bon = 0; auto.monte = true; appliquer(palier - 1); } }
      else auto.bon = 0;
    }
    // un palier : la résolution, la carte d'ombre (refaite à sa nouvelle taille), le reste se lit à chaque image (QP().chaque, QP().part)
    function appliquer(p) {
      palier = Math.max(0, Math.min(PALIERS.length - 1, p)); const q = QP();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio)); renderer.setSize(W, H, false);
      if (q.ombre && soleil.shadow.mapSize.x !== q.ombre) { soleil.shadow.mapSize.set(q.ombre, q.ombre); if (soleil.shadow.map) { soleil.shadow.map.dispose(); soleil.shadow.map = null; } }
      renderer.shadowMap.needsUpdate = true;
    }
    function taille(w, h) { W = Math.max(1, w); H = Math.max(1, h); renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = H > W ? 52 : 40; camera.updateProjectionMatrix(); }
    // le réglage du joueur : 'auto' | 'haute' | 'moyenne' | 'eco' (l'ancien « graphismes économes » donne 'eco'). Seul le passage vers ou depuis
    // « économe » refait les matériaux (les ombres et les lumières allumées ou coupées) ; entre les autres, rien n'est recompilé
    function regler(q) {
      const avant = qualite; reglage = choixQ(q); qualite = reglage === 'eco' ? 'eco' : 'haute';
      auto.bon = 0; auto.rechutes = 0; auto.monte = false; auto.baisse = -1e9;
      appliquer(reglage === 'moyenne' ? 2 : reglage === 'haute' ? 0 : reglage === 'auto' ? palier : palier);
      if (avant !== qualite) {
        renderer.shadowMap.enabled = qualite !== 'eco'; soleil.castShadow = qualite !== 'eco'; for (const o of lumieres) o.l.visible = qualite !== 'eco';
        scene.traverse((o) => { if (o.material) { const l = Array.isArray(o.material) ? o.material : [o.material]; for (const m of l) m.needsUpdate = true; } });
        prechauffer();
      }
    }
    // le préchauffage : tous les matériaux de la scène compilés d'un coup, y compris ceux des objets en réserve (cachés : explosions, ondes,
    // traçantes, la horde de chaque type), plutôt qu'à leur première apparition, en pleine vague (l'image qui accroche)
    function prechauffer() {
      // (un boss à squelette, posé le temps du préchauffage sous le sol : son matériau à os est compilé maintenant, pas à son entrée en scène)
      let bossTemp = null;
      try { const t = Object.keys((MOD && MOD.M && MOD.M.boss) || {}).find((k) => bossPret(k)); if (t) { bossTemp = HD.SkeletonUtils.clone(MOD.M.boss[t].scene); bossTemp.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } }); bossTemp.position.set(0, -50, 0); scene.add(bossTemp); } } catch (e) { bossTemp = null; }
      const caches = []; scene.traverse((o) => { if (o.visible === false) { caches.push(o); o.visible = true; } });
      const comptes = []; scene.traverse((o) => { if (o.isInstancedMesh) { comptes.push(o, o.count); if (!o.count) o.count = 1; } });
      // (une image entière, ombre comprise, dans le canevas : les matériaux de l'ombre ne sont faits qu'au premier rendu de l'ombre ; elle ne se
      // voit pas, l'image de la partie est dessinée par-dessus dans la même trame)
      try { renderer.compile(scene, camera); if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); } catch (e) { /* rien : la compilation se fera à la première image */ }
      for (const o of caches) o.visible = false; for (let i = 0; i < comptes.length; i += 2) comptes[i].count = comptes[i + 1];
      if (bossTemp) scene.remove(bossTemp);
    }
    const _p = T ? new T.Vector3() : null;
    function ecranDe(x, z, y) { _p.set(x, y || 0, z).project(camera); return [(_p.x + 1) / 2 * W, (1 - _p.y) / 2 * H]; }
    function stats() { const i = renderer.info; return { reglage, palier, ombre: qualite === 'eco' ? 0 : soleil.shadow.mapSize.x, ms: +msMoy.toFixed(1), programmes: i.programs ? i.programs.length : 0, ratio: renderer.getPixelRatio(), webgl: true, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, qualite, derniere: derniereT, modeles: MOD ? MOD.etat : 'absent', horde: KZ ? 'kenney' : 'faite-main', boss: [...bossVus.values()].map((b) => b.type), survivant: [...survivants.values()].some((x) => x.modele) ? 'kenney' : 'fait-main', defenses: [...defs.values()].filter((r) => r.modele).length, morceaux: morceaux.length, particules: particules.length, cinema: !!cine, armes: MOD ? MOD.etatArmes : 'absent', tenues: [...survivants.values()].filter((x) => x.blaster).map((x) => x.armeId) }; }
    // les modèles 3D arrivent : la horde passe en Kenney, le survivant, les défenses et l'arène (ses voitures) sont refaits avec eux
    if (MOD) MOD.charger().then((ok) => {
      if (!ok) return;
      brancherHorde();
      for (const [, x] of survivants) scene.remove(x.g); survivants.clear();
      for (const [, r] of defs) scene.remove(r.g); defs.clear();
      arene = null;
    });
    // ─── les portraits (Collection, vitrine) : un survivant ou une arme, rendu à part dans une petite image au fond transparent, gardé en
    // cache ; rendu au double de sa taille puis réduit (lissé sans multi-échantillonnage). null tant que le modèle ou sa texture manque.
    const portraits = new Map();
    let rtP = null, sceneP = null, camP = null;
    function portrait(type, id, opts) {
      opts = opts || {};
      if (!MOD || !MOD.pret) return null;
      const L = opts.taille || 160, cle = `${type}|${id}|${opts.finition || ''}|${L}`;
      if (portraits.has(cle)) return portraits.get(cle);
      if (opts.siPret) return null; // (le Lot 7a : en pleine vague, seulement ceux déjà faits)
      let objet = null;
      if (type === 'survivant') {
        const SD = D.SURVIVANTS[id]; if (SD && SD.texture && !MOD.persosPrets) return null;
        const S = MOD.survivant(id); if (S.map && !(S.map.image && S.map.image.complete && S.map.image.naturalWidth > 0)) return null; // (la texture arrive)
        const o = S.gltf.scene.clone(true), cache = new Map();
        o.traverse((m) => { if (m.isMesh) { if (!cache.has(m.material)) cache.set(m.material, new T.MeshLambertMaterial({ map: S.map || m.material.map })); m.material = cache.get(m.material); } });
        const clip = S.gltf.animations.find((c) => c.name === 'idle');
        if (clip) { const mx = new T.AnimationMixer(o); mx.clipAction(clip).play(); mx.update(0.4); }
        objet = new T.Group(); objet.add(o); o.rotation.y = -0.45;
      } else if (type === 'arme') {
        if (!MOD.armesPretes) return null;
        const o = MOD.arme(id, 1, opts.finition || null); if (!o) return null;
        objet = new T.Group(); objet.add(o); o.rotation.set(0.12, -Math.PI / 2 + 0.35, 0.18);
      } else if (type === 'compagnon') { // (Lot 5e) le compagnon fait main, de trois quarts
        if (!D.COMPAGNONS[id]) return null; const c = compagnonMesh(id); objet = new T.Group(); objet.add(c.g); c.g.rotation.y = -0.6; c.g.position.y = id === 'corbeau' ? 0 : 0;
      } else return null;
      if (!rtP) {
        rtP = new T.WebGLRenderTarget(L * 2, L * 2); if ('colorSpace' in rtP.texture) rtP.texture.colorSpace = T.SRGBColorSpace;
        sceneP = new T.Scene(); sceneP.add(new T.HemisphereLight('#FFFFFF', '#7A8696', 1.7));
        const d = new T.DirectionalLight('#FFF1D8', 2.4); d.position.set(3, 5, 6); sceneP.add(d);
        const r = new T.DirectionalLight('#9FC4FF', 1.1); r.position.set(-5, 2, -3); sceneP.add(r); // (un liseré froid derrière)
        camP = new T.PerspectiveCamera(26, 1, 0.05, 60);
      }
      if (rtP.width !== L * 2) rtP.setSize(L * 2, L * 2);
      sceneP.add(objet); objet.updateMatrixWorld(true);
      const b = new T.Box3().setFromObject(objet), c = new T.Vector3(), t3 = new T.Vector3(); b.getCenter(c); b.getSize(t3);
      const rayon = Math.max(t3.x, t3.y, t3.z * 0.6) / 2, dist = rayon / Math.tan(T.MathUtils.degToRad(camP.fov / 2)) * (type === 'arme' ? 1.05 : 1.3);
      camP.position.set(c.x, c.y + t3.y * 0.08, c.z + dist); camP.lookAt(c.x, c.y, c.z); camP.updateProjectionMatrix();
      const avantRT = renderer.getRenderTarget(), avantC = renderer.getClearColor(new T.Color()), avantA = renderer.getClearAlpha(), avantOmbre = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rtP); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sceneP, camP);
      const px = new Uint8Array(L * L * 16); renderer.readRenderTargetPixels(rtP, 0, 0, L * 2, L * 2, px);
      renderer.setRenderTarget(avantRT); renderer.setClearColor(avantC, avantA); renderer.shadowMap.autoUpdate = avantOmbre;
      sceneP.remove(objet);
      const grand = document.createElement('canvas'); grand.width = grand.height = L * 2;
      const gx = grand.getContext('2d'), img = gx.createImageData(L * 2, L * 2), ligne = L * 2 * 4;
      for (let y = 0; y < L * 2; y++) img.data.set(px.subarray((L * 2 - 1 - y) * ligne, (L * 2 - y) * ligne), y * ligne); // (WebGL lit de bas en haut)
      gx.putImageData(img, 0, 0);
      const petit = document.createElement('canvas'); petit.width = petit.height = L;
      const px2 = petit.getContext('2d'); px2.imageSmoothingQuality = 'high'; px2.drawImage(grand, 0, 0, L, L);
      const url = petit.toDataURL('image/png'); portraits.set(cle, url); return url;
    }
    return { charger, image, taille, qualite: regler, ecranDe, stats, cinema, decaler: (v) => { decalVoulu = +v || 0; }, vitrine, get enVitrine() { return vit; }, portrait, iconeBonus, renderer, scene, camera, get morceaux() { return morceaux.length; }, get particules() { return particules.length; } };
  }
  return { creer };
})();
