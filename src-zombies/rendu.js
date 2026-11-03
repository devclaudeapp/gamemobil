/* DERNIER REMPART — le rendu Three.js (r158, vendor/three.min.js), vu de dessus par une caméra inclinée qui suit le survivant.
   Les personnages et quelques objets sont des modèles CC0 (src-zombies/modeles.js, zombies/LICENCE.txt) : la horde et le survivant Kenney,
   la tourelle, le mortier et les voitures Kenney, les boss KayKit. Le décor des arènes, la barricade, la mine, l'épouvantail, la ferraille et
   les effets sont construits ici en low-poly à facettes (boîtes, cylindres, icosaèdres, couleurs de sommets), dans le même style ; tant que
   les modèles ne sont pas chargés (ou s'ils manquent), les personnages et les défenses gardent aussi leurs formes faites main.
   Budget d'appels de dessin, pour un téléphone : le décor entier en deux maillages fusionnés (les voitures en un troisième) ; toute la horde
   en six maillages instanciés (une pièce du zombie Kenney chacun, posée avec ses matrices d'animation précalculées, une teinte par type) ;
   un boss à squelette à la fois ; la ferraille et les flaques instanciées ; les défenses, les caisses, les traçantes et les explosions en
   petites réserves d'objets réutilisés.
   API : ZRENDU.creer(canvas, { qualite: 'haute' | 'eco' }) → r
     r.charger(jeu)                  construit l'arène de la partie (et oublie l'ancienne)
     r.image(jeu, idMoi, dt, evs)    une image : suit l'état, joue les effets des événements du pas
     r.taille(w, h), r.qualite(q), r.stats() → { webgl, calls, triangles, modeles, horde, boss, survivant, defenses }, r.ecranDe(x, z) → [px, py] */
const ZRENDU = (() => {
  'use strict';
  const T = typeof THREE !== 'undefined' ? THREE : null;
  const D = typeof ZDONNEES !== 'undefined' ? ZDONNEES : null;
  const ECHELLE = 1.3; // les personnages un peu plus grands que nature : on les lit mieux vus de haut
  const MAX_Z = 70, MAX_FERRAILLE = 160, MAX_FLAQUES = 90, MAX_TRACANTES = 48, MAX_BOUMS = 8, MAX_CORPS = 24;

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
        default: F.add(BOITE, '#9C8E7A', mat(x, h / 2, z, 0, w, h, d), 0.06, g);
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
    let qualite = opts.qualite === 'eco' ? 'eco' : 'haute';
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualite === 'eco' ? 1.25 : 2));
    renderer.shadowMap.enabled = qualite !== 'eco'; renderer.shadowMap.type = T.PCFShadowMap;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.5, 160);
    const hemi = new T.HemisphereLight('#FFFFFF', '#6E7F52', 1.15); scene.add(hemi);
    const soleil = new T.DirectionalLight('#FFF3DC', 1.9); soleil.position.set(-9, 22, 12); soleil.castShadow = true;
    soleil.shadow.mapSize.set(2048, 2048); const sc = soleil.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 70; soleil.shadow.bias = -0.0008; soleil.shadow.normalBias = 0.02;
    scene.add(soleil); scene.add(soleil.target);
    const matVC = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
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
      let n = 0; const temps = performance.now() / 1000;
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
        const age = jeu.t - zb.naissance, y = age < 0.7 ? -1.6 * ECHELLE * Zd.taille * (1 - age / 0.7) : 0;
        if (KZ && !Zd.boss) {
          // le zombie Kenney : marche (sprint pour le Coureur), le geste d'attraper quand il frappe, l'immobilité sinon
          const course = zb.type === 'coureur' && zb.bouge, clip = zb.attaque > 0 ? 'pick-up' : !zb.bouge ? 'idle' : course ? 'sprint' : 'walk';
          if (clip !== r.clip) { r.clip = clip; r.t = clip === 'pick-up' ? 0 : r.t; }
          r.t += dt * (clip === 'walk' ? zb.vitesse / 1.25 : clip === 'sprint' ? zb.vitesse / 3.2 : clip === 'pick-up' ? 2.2 : 1);
          if (nk < MAX_Z) poserKenney(nk++, zb.type, zb.x, y, zb.z, zb.angle, clip, r.t, zb.flash > 0);
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
      if (KZ) for (const m of KZ.inst) { m.count = nk; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }

    // ─── la horde en modèles Kenney (ZMODELES) : six maillages instanciés, une pièce chacun, posés avec les matrices cuites ───
    const MOD = typeof ZMODELES !== 'undefined' ? ZMODELES : null, HD = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
    let KZ = null;
    const teintes = {}; if (D) for (const k in D.ZOMBIES) teintes[k] = new T.Color(D.ZOMBIES[k].teinte || '#FFFFFF');
    const _m2 = new T.Matrix4();
    function brancherHorde() {
      const Mz = MOD.M.zombie;
      KZ = { M: Mz, k: (1.6 * ECHELLE) / Mz.hauteur, inst: Mz.pieces.map((p) => { const m = new T.InstancedMesh(p.geo, Mz.mat, MAX_Z); m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; m.count = 0; m.setColorAt(0, BLANC); scene.add(m); return m; }) };
    }
    function poserKenney(i, type, x, y, z, a, clip, t, flash) {
      const Zd = D.ZOMBIES[type], s = KZ.k * Zd.taille, large = type === 'costaud' ? 1.22 : type === 'coureur' ? 0.9 : 1;
      _q.setFromEuler(_e.set(0, Math.PI / 2 - a, 0)); _v.set(x, y, z); _s.set(s * large, s, s * large); _base.compose(_v, _q, _s); // le modèle regarde vers +z
      const C = KZ.M.cuits[clip] || KZ.M.cuits.walk, np = KZ.M.pieces.length;
      let f = Math.floor(t * ZMODELES.FPS); f = C.boucle ? ((f % C.n) + C.n) % C.n : Math.min(C.n - 1, Math.max(0, f));
      const couleur = flash ? FLASH : teintes[type];
      for (let p = 0; p < np; p++) { _m2.fromArray(C.mats, (f * np + p) * 16); _part.multiplyMatrices(_base, _m2); KZ.inst[p].setMatrixAt(i, _part); KZ.inst[p].setColorAt(i, couleur); }
    }

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
        const age = jeu.t - zb.naissance, y = age < 0.7 ? -1.6 * ECHELLE * Zd.taille * (1 - age / 0.7) : 0;
        b.o.position.set(zb.x, y - b.sol, zb.z); b.o.rotation.set(0, Math.PI / 2 - zb.angle, 0);
        b.coup = Math.max(0, b.coup - dt);
        if (zb.attaque > 0.22 && b.coup <= 0 && b.actions.coup) { b.act = ''; jouerBoss(b, 'coup', 0.1); b.coup = b.actions.coup.getClip().duration * 0.8; }
        else if (b.coup <= 0) { const v = zb.bouge ? (zb.vitesse > 1.8 ? 'course' : 'marche') : 'repos'; jouerBoss(b, v); if (b.actions[v]) b.actions[v].timeScale = v === 'marche' ? Math.max(0.6, zb.vitesse / 1.1) : 1; }
        const rouge = zb.flash > 0 ? 0.35 : 0; for (const m of b.mats) if (m.emissive) m.emissive.setRGB(rouge, rouge * 0.15, rouge * 0.1);
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
    function nouveauSurvivantK() {
      const S = MOD.M.survivant, g = new T.Group(), o = S.gltf.scene.clone(true), cache = new Map();
      o.traverse((m) => { if (m.isMesh) { if (!cache.has(m.material)) cache.set(m.material, new T.MeshLambertMaterial({ map: m.material.map })); m.material = cache.get(m.material); m.castShadow = true; } });
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
      return { g, o, k, mixer, act, jambes: '', haut: '', arme, anneau, armeId: '', modele: true, mort: false };
    }
    const JAMBES = /^(leg-left|leg-right|root)$/, HAUT = /^(torso|arm-left|arm-right|head)$/;
    const changer = (s, cote, nom) => { if (s[cote] === nom) return; const a = s.act[nom], p = s.act[s[cote]]; if (a) { a.reset(); a.play(); if (p) a.crossFadeFrom(p, 0.15, false); } s[cote] = nom; };
    function majSurvivantK(s, j, dt) {
      s.g.position.set(j.x, 0, j.z); s.g.rotation.set(0, Math.PI / 2 - j.angle, 0);
      if (!j.vivant) { if (!s.mort && s.act.mort) { s.mort = true; s.mixer.stopAllAction(); s.act.mort.reset().play(); s.jambes = s.haut = ''; } s.mixer.update(dt); return; }
      if (s.mort) { s.mort = false; s.mixer.stopAllAction(); s.jambes = s.haut = ''; }
      changer(s, 'jambes', j.bouge > 0.05 ? 'marche' : 'repos'); if (s.act.marche) s.act.marche.timeScale = 0.6 + j.bouge * 0.9;
      changer(s, 'haut', j.visee ? 'tir' : 'tenir');
      const s2 = j.armes[j.main], id = s2 ? s2.id : 'pistolet';
      if (id !== s.armeId) { s.armeId = id; const L = (LONGUEUR[id] || 0.4) * 1.2; s.arme.scale.set(0.11 / s.k, 0.13 / s.k, L / s.k); s.arme.position.set(0, 0.05 / s.k, (0.3 + L / 2) / s.k); s.arme.material.color.set(D.ARMES[id] ? D.ARMES[id].couleur : '#333').multiplyScalar(0.55); }
      s.mixer.update(dt);
      s.g.visible = !(j.invul > 0 && Math.floor(j.invul * 20) % 2 === 0);
    }
    const survivants = new Map();
    const LONGUEUR = { pistolet: 0.32, revolver: 0.4, pompe: 0.75, mitraillette: 0.55, fusil: 0.8, precision: 0.95 };
    function majSurvivants(jeu, idMoi, dt) {
      const vus = new Set();
      for (const j of jeu.joueurs) {
        vus.add(j.id);
        let s = survivants.get(j.id); if (!s) { s = MOD && MOD.pret ? nouveauSurvivantK() : nouveauSurvivant(j.id === idMoi ? '#E3B663' : '#7FB3E0'); survivants.set(j.id, s); s.anneau.material.color.set(j.id === idMoi ? '#FFD84A' : j.couleur || '#7FB3E0'); }
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
        if (id !== s.armeId) { s.armeId = id; const L = LONGUEUR[id] || 0.4; s.arme.scale.set(L, 0.12, 0.1); s.arme.material.color.set(D.ARMES[id] ? D.ARMES[id].couleur : '#333').multiplyScalar(0.55); s.longueur = L; }
        s.recul = Math.max(0, (s.recul || 0) - dt * 8);
        s.bg.rotation.z = -Math.PI / 2 + 0.05 + s.recul * 0.3; s.bd.rotation.z = -Math.PI / 2 + 0.05 + s.recul * 0.3;
        s.bg.position.z = 0.22; s.bd.position.z = -0.22;
        s.arme.position.set(0.48 + s.longueur / 2 - s.recul * 0.08, 1.0, 0);
        // clignote un peu après un coup reçu
        s.g.visible = !(j.invul > 0 && Math.floor(j.invul * 20) % 2 === 0);
      }
      for (const [id, s] of survivants) if (!vus.has(id)) { scene.remove(s.g); survivants.delete(id); }
    }

    // ─── la ferraille au sol : un maillage instancié (écrous et plaques) ───
    const geoFerraille = (() => { const F = new Fab(); F.add(cyl(0.16, 0.16, 0.08, 6), '#9AA1AA', mat(0, 0.06, 0)); F.add(cyl(0.07, 0.07, 0.1, 6), '#59606A', mat(0, 0.07, 0)); F.add(BOITE, '#B07A45', mat(0.12, 0.05, 0.08, 0.6, 0.2, 0.05, 0.12)); return F.geo(); })();
    const ferraille = new T.InstancedMesh(geoFerraille, matVC, MAX_FERRAILLE); ferraille.instanceMatrix.setUsage(T.DynamicDrawUsage); ferraille.frustumCulled = false; ferraille.count = 0; ferraille.castShadow = true; scene.add(ferraille);
    // les objets rares (caisses d'armes, soins) : une petite réserve
    const geoCaisse = (() => { const F = new Fab(); F.add(BOITE, '#3F5E3A', mat(0, 0.32, 0, 0, 0.9, 0.62, 0.6), 0.04, 5); F.add(BOITE, '#F2C230', mat(0, 0.32, 0, 0, 0.92, 0.12, 0.62)); F.add(BOITE, '#2B3A28', mat(0, 0.66, 0, 0, 0.94, 0.08, 0.64)); return F.geo(); })();
    const geoSoin = (() => { const F = new Fab(); F.add(BOITE, '#F4F1EA', mat(0, 0.25, 0, 0, 0.5, 0.4, 0.42)); F.add(BOITE, '#D9443B', mat(0, 0.46, 0, 0, 0.12, 0.03, 0.34)); F.add(BOITE, '#D9443B', mat(0, 0.46, 0, 0, 0.34, 0.03, 0.12)); F.add(BOITE, '#D9443B', mat(0.26, 0.25, 0, 0, 0.02, 0.28, 0.1)); return F.geo(); })();
    const matFaisceau = new T.MeshBasicMaterial({ color: '#FFE27A', transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending });
    const geoFaisceau = cyl(0.35, 0.5, 6, 10, true).translate(0, 3, 0);
    const reserveObjets = [];
    function objetRare(type) {
      let o = reserveObjets.find((x) => !x.pris && x.type === type);
      if (!o) {
        const g = new T.Group(), m = new T.Mesh(type === 'caisse' ? geoCaisse : geoSoin, matVC); m.castShadow = true; g.add(m);
        if (type === 'caisse') { const f = new T.Mesh(geoFaisceau, matFaisceau); g.add(f); }
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
        } else {
          const r = objetRare(o.type); r.g.position.set(o.x, Math.sin(t * 2.5 + o.id) * 0.06, o.z); r.m.rotation.y = t * 0.8;
        }
      }
      ferraille.count = n; ferraille.instanceMatrix.needsUpdate = true;
      for (const o of reserveObjets) if (!o.pris) o.g.visible = false;
    }

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
          if (d.type === 'barricade') g.rotation.y = -d.angle;
        }
        r.pose = Math.min(1, r.pose + dt * 5); const k = 0.4 + 0.6 * r.pose; r.g.scale.set(k, k, k);
        if (r.tete && d.type !== 'mine') r.tete.rotation.y = r.modele ? Math.PI / 2 - d.angle : -d.angle;
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
    function tracante(x, z, a, l, arme) {
      const o = tracantes[iTrace]; iTrace = (iTrace + 1) % MAX_TRACANTES;
      o.t = arme === 'sniper' ? 0.12 : 0.06; o.m.visible = true;
      o.m.position.set(x + Math.cos(a) * l / 2, 1.0, z + Math.sin(a) * l / 2); o.m.rotation.set(0, -a, 0);
      o.m.scale.set(l, arme === 'sniper' ? 0.07 : 0.045, arme === 'sniper' ? 0.07 : 0.045); o.m.material.opacity = 0.95;
      o.m.material.color.set(arme === 'tourelle' ? '#9AE6FF' : '#FFE89A');
    }
    const matBoum = new T.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: 0.9, depthWrite: false });
    const geoBoum = new T.IcosahedronGeometry(1, 1);
    const boums = []; for (let i = 0; i < MAX_BOUMS; i++) { const m = new T.Mesh(geoBoum, matBoum.clone()); m.visible = false; scene.add(m); boums.push({ m, t: 0, r: 1 }); }
    let iBoum = 0;
    function boum(x, z, r) { const o = boums[iBoum]; iBoum = (iBoum + 1) % MAX_BOUMS; o.t = 0.45; o.r = r; o.m.position.set(x, 0.4, z); o.m.visible = true; secousse = Math.max(secousse, 0.35); }
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
    function majProjectiles(jeu) {
      let n = 0;
      for (const c of jeu.crachats) { if (n >= 24) break; _base.makeTranslation(c.x, 0.9, c.z); crachats.setMatrixAt(n++, _base); }
      crachats.count = n; crachats.instanceMatrix.needsUpdate = true; n = 0;
      for (const o of jeu.obus) { if (n >= 12) break; const k = Math.min(1, o.t / o.duree), h = 0.8 + Math.sin(k * Math.PI) * 6; _base.makeTranslation(o.x0 + (o.x1 - o.x0) * k, h, o.z0 + (o.z1 - o.z0) * k); _r.makeScale(1.4, 1.4, 1.4); _base.multiply(_r); obus.setMatrixAt(n++, _base); }
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
      hemi.groundColor.set(A.sol2);
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
      const sol = new T.Mesh(gsol, new T.MeshLambertMaterial({ vertexColors: true })); sol.receiveShadow = true; scene.add(sol); enArene.push(sol);
      // la bordure (une haie de bois et de pierre), les obstacles, et le paysage autour (arbres, rochers ; sans collision)
      const F = new Fab();
      const bordure = (x, z, w, d) => F.add(BOITE, A.bord, mat(x, 0.45, z, 0, w, 0.9, d), 0.06, 11);
      bordure(0, -demi - 0.4, A.taille + 1.6, 0.8); bordure(0, demi + 0.4, A.taille + 1.6, 0.8); bordure(-demi - 0.4, 0, 0.8, A.taille); bordure(demi + 0.4, 0, 0.8, A.taille);
      for (let i = -demi; i <= demi; i += 4) for (const [x, z] of [[i, -demi - 0.4], [i, demi + 0.4], [-demi - 0.4, i], [demi + 0.4, i]]) F.add(BOITE, '#8A7458', mat(x, 0.6, z, 0, 0.3, 1.2, 0.3));
      const avecVoitures = !!(MOD && MOD.pret), voitures = [];
      A.obstacles.forEach((o, k) => { if (avecVoitures && o.type === 'voiture') voitures.push(o); else obstacle(F, o, k); });
      let g2 = 4242; const alea = () => { g2 = (g2 * 16807) % 2147483647; return g2 / 2147483647; };
      for (let i = 0; i < 70; i++) { // le paysage : une couronne d'arbres et de rochers autour de l'arène
        const a = alea() * Math.PI * 2, r = demi + 4 + alea() * 18, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < demi + 2 && Math.abs(z) < demi + 2) continue;
        obstacle(F, alea() < 0.7 ? { type: 'arbre', c: [x, z, 0.9 + alea() * 0.6] } : { type: 'rocher', c: [x, z, 0.8 + alea() * 1.2] }, 100 + i);
      }
      const decor = new T.Mesh(F.geo(), matVC); decor.castShadow = true; decor.receiveShadow = true; scene.add(decor); enArene.push(decor);
      // les touffes d'herbe et les petites fleurs (sans ombre portée)
      const H = new Fab(), touffe = cyl(0, 0.09, 0.32, 4);
      for (let i = 0; i < 260; i++) {
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
      cam.init = false;
    }

    // ─── la caméra : au-dessus, inclinée, elle suit le survivant (avec un peu d'avance dans le sens de la marche) ───
    const cam = { x: 0, z: 0, init: false };
    let secousse = 0, W = 1, H = 1;
    function majCamera(jeu, idMoi, dt) {
      const j = jeu.joueurs.find((k) => k.id === idMoi) || jeu.joueurs[0]; if (!j) return;
      const tx = j.x + j.vx * 0.25, tz = j.z + j.vz * 0.25;
      if (!cam.init) { cam.x = tx; cam.z = tz; cam.init = true; }
      const k = 1 - Math.exp(-6 * dt); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k;
      const portrait = H > W, haut = portrait ? 30 : 22, recul = portrait ? 12 : 12;
      let sx = 0, sz = 0; if (secousse > 0) { secousse = Math.max(0, secousse - dt); sx = (Math.random() - 0.5) * secousse * 0.6; sz = (Math.random() - 0.5) * secousse * 0.6; }
      camera.position.set(cam.x + sx, haut, cam.z + recul + sz); camera.lookAt(cam.x + sx, 0, cam.z + sz - (portrait ? 0 : 0.5));
      // l'ombre suit la caméra (une carte d'ombre de 48 m de côté autour d'elle)
      soleil.position.set(cam.x - 9, 22, cam.z + 12); soleil.target.position.set(cam.x, 0, cam.z);
    }

    // ─── une image ───
    let derniereT = 0;
    function image(jeu, idMoi, dt, evs) {
      if (!arene || arene !== jeu.A) charger(jeu);
      if (evs) for (const e of evs) {
        switch (e.t) {
          case 'tir': tracante(e.x, e.z, e.a, e.l, e.cle === 'tourelle' ? 'tourelle' : e.arme); { const s = survivants.get(e.de); if (s) s.recul = 1; } break;
          case 'mort': corps.push({ type: e.type, x: e.x, z: e.z, a: e.a || 0, t: 0 }); if (corps.length > MAX_CORPS) corps.shift(); flaque(e.x, e.z, D.ZOMBIES[e.type].taille * 1.1, '#5E8C2E'); break;
          case 'touche': if (Math.random() < 0.25) flaque(e.x + (Math.random() - 0.5) * 0.6, e.z + (Math.random() - 0.5) * 0.6, 0.35, '#6F9A38'); break;
          case 'boum': boum(e.x, e.z, e.r); flaque(e.x, e.z, e.r * 0.55, '#4A4A3A'); break;
          case 'flaque': flaque(e.x, e.z, 0.7, '#A6D63A'); break;
          case 'blesse': secousse = Math.max(secousse, 0.18); break;
          case 'casse': boum(e.x, e.z, 1.0); break;
        }
      }
      majSurvivants(jeu, idMoi, dt);
      majZombies(jeu, dt);
      majBoss(jeu, dt);
      majObjets(jeu);
      majDefenses(jeu, dt);
      majProjectiles(jeu);
      majFlaques(dt);
      for (const o of tracantes) if (o.m.visible) { o.t -= dt; o.m.material.opacity = Math.max(0, o.t / 0.06); if (o.t <= 0) o.m.visible = false; }
      for (const o of boums) if (o.m.visible) { o.t -= dt; const k = 1 - o.t / 0.45; o.m.scale.setScalar(o.r * (0.3 + k * 0.9)); o.m.material.opacity = Math.max(0, 0.9 * (1 - k)); o.m.material.color.set(k < 0.3 ? '#FFE07A' : '#FF8A3A'); if (o.t <= 0) o.m.visible = false; }
      majCamera(jeu, idMoi, dt);
      renderer.render(scene, camera);
      derniereT = performance.now();
    }
    function taille(w, h) { W = Math.max(1, w); H = Math.max(1, h); renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = H > W ? 52 : 40; camera.updateProjectionMatrix(); }
    function regler(q) {
      qualite = q === 'eco' ? 'eco' : 'haute';
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualite === 'eco' ? 1.25 : 2)); renderer.setSize(W, H, false);
      renderer.shadowMap.enabled = qualite !== 'eco'; soleil.castShadow = qualite !== 'eco';
      scene.traverse((o) => { if (o.material) { const l = Array.isArray(o.material) ? o.material : [o.material]; for (const m of l) m.needsUpdate = true; } });
    }
    const _p = T ? new T.Vector3() : null;
    function ecranDe(x, z, y) { _p.set(x, y || 0, z).project(camera); return [(_p.x + 1) / 2 * W, (1 - _p.y) / 2 * H]; }
    function stats() { const i = renderer.info; return { webgl: true, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, qualite, derniere: derniereT, modeles: MOD ? MOD.etat : 'absent', horde: KZ ? 'kenney' : 'faite-main', boss: [...bossVus.values()].map((b) => b.type), survivant: [...survivants.values()].some((x) => x.modele) ? 'kenney' : 'fait-main', defenses: [...defs.values()].filter((r) => r.modele).length }; }
    // les modèles 3D arrivent : la horde passe en Kenney, le survivant, les défenses et l'arène (ses voitures) sont refaits avec eux
    if (MOD) MOD.charger().then((ok) => {
      if (!ok) return;
      brancherHorde();
      for (const [, x] of survivants) scene.remove(x.g); survivants.clear();
      for (const [, r] of defs) scene.remove(r.g); defs.clear();
      arene = null;
    });
    return { charger, image, taille, qualite: regler, ecranDe, stats, renderer, scene, camera };
  }
  return { creer };
})();
