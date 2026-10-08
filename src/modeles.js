/* LE FOURNIL — les briques de la 3D : géométries arrondies mises en cache, matériaux mats partagés, fusion de pièces colorées,
   textures peintes sur canvas. Low-poly arrondi pastel : des formes simples aux arêtes biseautées, des couleurs plates, pas de photo.
   Repère : 1 unité = 1 px d'écran en largeur ; Y vers le haut ; les objets sont posés sur y = 0. */
const MODELES = typeof THREE === 'undefined' ? null : (() => { // sans Three.js (fichier non chargé), le module vaut null et le jeu démarre sans 3D
  'use strict';
  const TAU = Math.PI * 2;
  const GEOS = new Map(), MATS = new Map(), PARTAGES = new Set();
  const cle = (...a) => a.join('|');
  function memo(k, fabrique) { let g = GEOS.get(k); if (!g) { g = fabrique(); g.userData.cache = true; GEOS.set(k, g); } return g; }
  // ─── géométries (toutes centrées en X/Z ; « posée » = le bas sur y = 0) ───
  function boite(w, h, d, r, seg) { // boîte aux arêtes arrondies, posée : une forme à coins ronds extrudée avec un biseau, à facettes plates
    r = r == null ? Math.min(w, h, d) * 0.18 : r; seg = seg || 2;
    return memo(cle('boite', w, h, d, r, seg), () => {
      const rr = Math.max(0.01, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)), iw = w - 2 * rr, ih = h - 2 * rr, rc = Math.max(0.001, Math.min(rr, iw / 2, ih / 2));
      const s = new THREE.Shape(), hw = iw / 2, hh = ih / 2;
      s.moveTo(-hw + rc, -hh); s.lineTo(hw - rc, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + rc); s.lineTo(hw, hh - rc); s.quadraticCurveTo(hw, hh, hw - rc, hh);
      s.lineTo(-hw + rc, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - rc); s.lineTo(-hw, -hh + rc); s.quadraticCurveTo(-hw, -hh, -hw + rc, -hh);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * rr), bevelEnabled: true, bevelThickness: rr, bevelSize: rr, bevelOffset: 0, bevelSegments: seg, curveSegments: 3 });
      g.center(); g.translate(0, h / 2, 0); g.computeVertexNormals(); return g;
    });
  }
  const boiteSimple = (w, h, d) => memo(cle('box', w, h, d), () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)); // posée, arêtes vives (petites pièces)
  const sphere = (r, n) => memo(cle('sph', r, n || 10), () => new THREE.SphereGeometry(r, n || 10, Math.max(6, Math.round((n || 10) * 0.7))));
  const capsule = (r, l, n) => memo(cle('cap', r, l, n || 8), () => new THREE.CapsuleGeometry(r, l, 3, n || 8)); // centrée, le long de Y, hauteur totale l + 2r
  const cylindre = (rh, rb, h, n) => memo(cle('cyl', rh, rb, h, n || 12), () => new THREE.CylinderGeometry(rh, rb, h, n || 12).translate(0, h / 2, 0)); // posé
  const cone = (r, h, n) => memo(cle('cone', r, h, n || 10), () => new THREE.ConeGeometry(r, h, n || 10).translate(0, h / 2, 0)); // posé
  const tore = (R, r, arc, n, m) => memo(cle('tore', R, r, arc || TAU, n || 8, m || 16), () => new THREE.TorusGeometry(R, r, n || 8, m || 16, arc || TAU));
  const plan = (w, h) => memo(cle('plan', w, h), () => new THREE.PlaneGeometry(w, h));
  const anneau = (ri, ro, n) => memo(cle('anneau', ri, ro, n || 24), () => new THREE.RingGeometry(ri, ro, n || 24).rotateX(-Math.PI / 2)); // à plat sur le sol
  const disque = (r, n) => memo(cle('disque', r, n || 16), () => new THREE.CircleGeometry(r, n || 16).rotateX(-Math.PI / 2)); // à plat
  function extrusion(k, shape, depth, bevel) { return memo(cle('ext', k), () => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 4 }); g.center(); g.computeVertexNormals(); return g; }); }
  // ─── matériaux : mats, partagés, mis en cache par couleur ───
  function mat(hex, o) { // Lambert mat ; options : emissive, emissiveIntensity, transparent, opacity, side, metal (reflet léger), map
    const k = cle(hex, o ? JSON.stringify(o) : '');
    let m = MATS.get(k);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: hex });
      if (o) { if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity == null ? 1 : o.emissiveIntensity; } if (o.transparent) { m.transparent = true; m.opacity = o.opacity == null ? 0.5 : o.opacity; m.depthWrite = o.depthWrite == null ? false : o.depthWrite; } if (o.side) m.side = o.side; if (o.map) m.map = o.map; }
      PARTAGES.add(m); MATS.set(k, m);
    }
    return m;
  }
  const MAT = {
    vertex: new THREE.MeshLambertMaterial({ vertexColors: true }),
    verre: new THREE.MeshLambertMaterial({ color: '#CFE9FA', transparent: true, opacity: 0.32, depthWrite: false }),
    verreFonce: new THREE.MeshLambertMaterial({ color: '#8FB8D8', transparent: true, opacity: 0.45, depthWrite: false }),
    blanc: new THREE.MeshLambertMaterial({ color: '#FFFFFF' }),
    tache: new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.1, depthWrite: false }),
    halo: new THREE.SpriteMaterial({ color: '#FFC84A', transparent: true, opacity: 0.35, depthWrite: false }),
    ombre: new THREE.MeshBasicMaterial({ color: '#4A3328', transparent: true, opacity: 0.14, depthWrite: false }),
    pointille: new THREE.MeshBasicMaterial({ color: '#4A3328', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  };
  for (const m of Object.values(MAT)) PARTAGES.add(m);
  // ─── pièces et fusion : une liste de { geo, col, m } devient une seule géométrie à couleurs par sommet ───
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function matrice(p) { // { x, y, z, rx, ry, rz, s, sx, sy, sz } → Matrix4
    p = p || {}; const m = new THREE.Matrix4();
    _p.set(p.x || 0, p.y || 0, p.z || 0); _e.set(p.rx || 0, p.ry || 0, p.rz || 0); _q.setFromEuler(_e); const s = p.s == null ? 1 : p.s; _s.set(p.sx == null ? s : p.sx, p.sy == null ? s : p.sy, p.sz == null ? s : p.sz);
    return m.compose(_p, _q, _s);
  }
  const part = (geo, col, p) => ({ geo, col, m: p ? matrice(p) : null });
  function assembler(parties) {
    let n = 0;
    const gs = parties.map((p) => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); if (p.m) g.applyMatrix4(p.m); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    gs.forEach((g, i) => {
      const m = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      _c.set(parties[i].col || '#FFFFFF'); for (let k = 0; k < m; k++) { col[(o + k) * 3] = _c.r; col[(o + k) * 3 + 1] = _c.g; col[(o + k) * 3 + 2] = _c.b; }
      o += m;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }
  function maille(parties, o) { // un maillage fusionné, qui porte et reçoit les ombres par défaut
    const m = new THREE.Mesh(assembler(parties), MAT.vertex); m.castShadow = !o || o.ombre !== false; m.receiveShadow = !!(o && o.recoit); return m;
  }
  function mesh(geo, materiau, p, o) { const m = new THREE.Mesh(geo, materiau); if (p) m.applyMatrix4(matrice(p)); m.castShadow = !o || o.ombre !== false; m.receiveShadow = !!(o && o.recoit); return m; }
  // ─── textures peintes ───
  function texture(peindre, w, h, o) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; peindre(cv.getContext('2d'), w, h);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    if (o && o.repete) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(o.repete[0], o.repete[1]); }
    tx.userData.canvas = cv; return tx;
  }
  // ─── couleurs ───
  function melange(a, b, k) { _c.set(a); const c2 = new THREE.Color(b); _c.lerp(c2, k); return '#' + _c.getHexString(); }
  const eclaircir = (hex, k) => melange(hex, '#FFFFFF', k), assombrir = (hex, k) => melange(hex, '#000000', k);
  // ─── libération : ce qui n'est ni en cache ni partagé ───
  function dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!PARTAGES.has(m)) { if (m.map && !m.map.userData.partagee) m.map.dispose(); m.dispose(); }
    });
  }
  const partager = (m) => { PARTAGES.add(m); return m; }; // un matériau tenu en cache ailleurs : dispose ne le libère jamais
  return { TAU, partager, boite, boiteSimple, sphere, capsule, cylindre, cone, tore, plan, anneau, disque, extrusion, mat, MAT, part, matrice, assembler, maille, mesh, texture, melange, eclaircir, assombrir, dispose, GEOS, MATS };
})();
if (typeof module !== 'undefined') module.exports = MODELES;
