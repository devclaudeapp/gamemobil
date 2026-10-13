/* LE FOURNIL — les modèles 3D CC0 de Kenney (Furniture Kit, Food Kit, Mini Market ; licence dans fournil/modeles/LICENCE.txt).
   Les GLB de fournil/modeles/ sont lus par un petit lecteur GLB (quelques dizaines de lignes au lieu des 110 Ko du GLTFLoader) et « cuits » :
   chaque triangle prend la couleur de son matériau ou de la palette colormap.png sous son UV, convertie en linéaire. On obtient une géométrie
   à couleurs de sommets, posée (bas sur y = 0), centrée en X/Z, qui entre telle quelle dans les maillages fusionnés de MEUBLES
   (MODELES.assembler, parties marquées vc) : pas un appel de dessin de plus. Les couleurs d'un matériau nommé (wood, plant, metalLight…)
   peuvent être remplacées à la volée (les couleurs du quartier). Tant que les modèles ne sont pas chargés (premier affichage, hors ligne
   sans cache, artefact Claude sans fichiers à côté), MEUBLES garde ses meubles faits à la main : KENNEY.pret dit lequel des deux on voit. */
const KENNEY = typeof THREE === 'undefined' ? null : (() => {
  'use strict';
  const PACKS = { // les modèles gardés (ceux qu'on pose dans la boutique), par pack
    'furniture-kit': ['tableRound', 'chairRounded', 'chairCushion', 'pottedPlant', 'plantSmall2', 'kitchenFridge', 'kitchenFridgeLarge', 'rugDoormat'],
    'food-kit': ['loaf-baguette', 'loaf-round', 'loaf', 'croissant', 'pie', 'cup-saucer', 'cup-coffee', 'rollingPin', 'bowl', 'whisk'],
    'mini-market': ['freezers-standing', 'cash-register'],
  };
  const MODS = new Map(), CACHE = new Map(), attente = [];
  let pret = false, enCours = null, erreur = null, octets = 0;
  // ─── le lecteur GLB : JSON + binaire, nœuds (matrice ou TRS), primitives triangles, accesseurs flottants ou entiers ───
  const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
  const TAILLE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  function accesseur(j, bin, i) {
    const a = j.accessors[i], v = j.bufferViews[a.bufferView], [T, o] = COMP[a.componentType], n = TAILLE[a.type], pas = v.byteStride ? v.byteStride / o : n;
    const src = new T(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * pas + n), out = new Float32Array(a.count * n);
    const k = a.normalized ? (T === Uint8Array ? 1 / 255 : T === Uint16Array ? 1 / 65535 : 1) : 1;
    for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) out[e * n + c] = src[e * pas + c] * k;
    return out;
  }
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); // sRGB → linéaire (les couleurs de sommets de MODELES sont linéaires)
  function lire(buf, palette) { // → { pos, nor, col, mat (le nom du matériau de chaque triangle), noms }
    const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('pas un GLB');
    const lj = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, lj)));
    const bin = new Uint8Array(buf, 20 + lj + 8, dv.getUint32(20 + lj, true));
    const P = [], N = [], C = [], MT = [], noms = [];
    const m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), col = new THREE.Color();
    function noeud(i, parent) {
      const nd = j.nodes[i], m = new THREE.Matrix4();
      if (nd.matrix) m.fromArray(nd.matrix); else m.compose(t.fromArray(nd.translation || [0, 0, 0]), q.fromArray(nd.rotation || [0, 0, 0, 1]), s.fromArray(nd.scale || [1, 1, 1]));
      m.premultiply(parent);
      if (nd.mesh != null) for (const pr of j.meshes[nd.mesh].primitives) {
        if (pr.mode != null && pr.mode !== 4) continue;
        const pos = accesseur(j, bin, pr.attributes.POSITION), nor = pr.attributes.NORMAL != null ? accesseur(j, bin, pr.attributes.NORMAL) : null, uv = pr.attributes.TEXCOORD_0 != null ? accesseur(j, bin, pr.attributes.TEXCOORD_0) : null;
        const idx = pr.indices != null ? accesseur(j, bin, pr.indices) : null, nb = idx ? idx.length : pos.length / 3;
        const mat = pr.material != null ? j.materials[pr.material] : {}, pbr = mat.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1], tex = !!pbr.baseColorTexture && palette, nom = mat.name || '';
        if (!noms.includes(nom)) noms.push(nom);
        m4.copy(m); m3.getNormalMatrix(m4);
        for (let k = 0; k < nb; k += 3) {
          let r = f[0], g = f[1], b = f[2];
          if (tex && uv) { // la palette sous le centre du triangle
            let u = 0, w = 0; for (let e = 0; e < 3; e++) { const ii = idx ? idx[k + e] : k + e; u += uv[ii * 2]; w += uv[ii * 2 + 1]; }
            u = ((u / 3) % 1 + 1) % 1; w = ((w / 3) % 1 + 1) % 1;
            const px = Math.min(palette.w - 1, Math.floor(u * palette.w)), py = Math.min(palette.h - 1, Math.floor(w * palette.h)), o = (py * palette.w + px) * 4;
            r *= lin(palette.d[o] / 255); g *= lin(palette.d[o + 1] / 255); b *= lin(palette.d[o + 2] / 255);
          }
          for (let e = 0; e < 3; e++) {
            const ii = idx ? idx[k + e] : k + e;
            v.set(pos[ii * 3], pos[ii * 3 + 1], pos[ii * 3 + 2]).applyMatrix4(m4); P.push(v.x, v.y, v.z);
            if (nor) { v.set(nor[ii * 3], nor[ii * 3 + 1], nor[ii * 3 + 2]).applyMatrix3(m3).normalize(); N.push(v.x, v.y, v.z); }
            C.push(r, g, b);
          }
          MT.push(noms.indexOf(nom));
        }
      }
      for (const c of nd.children || []) noeud(c, m);
    }
    for (const r of j.scenes[j.scene || 0].nodes) noeud(r, new THREE.Matrix4());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (N.length === P.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.computeBoundingBox(); // posé, centré
    geo.userData.cache = true;
    const d = geo.boundingBox.getSize(new THREE.Vector3());
    return { geo, mat: Uint8Array.from(MT), noms, w: d.x, h: d.y, d: d.z };
  }
  // ─── le chargement : toutes les palettes, puis tous les GLB en parallèle ; une seule tentative par page ───
  async function palette(url) {
    const r = await fetch(url); if (!r.ok) throw new Error(url + ' : ' + r.status);
    const blob = await r.blob(); octets += blob.size;
    const img = await new Promise((ok, ko) => { const i = new Image(), u = URL.createObjectURL(blob); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = ko; i.src = u; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    return { w: cv.width, h: cv.height, d: x.getImageData(0, 0, cv.width, cv.height).data };
  }
  function charger(base) {
    if (enCours) return enCours;
    if (typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) { erreur = 'pas de réseau (page locale)'; return (enCours = Promise.resolve(false)); }
    const t0 = performance.now();
    enCours = (async () => {
      const pals = {};
      for (const pack of Object.keys(PACKS)) if (pack !== 'furniture-kit') pals[pack] = await palette(`${base}${pack}/Textures/colormap.png`);
      await Promise.all(Object.entries(PACKS).flatMap(([pack, noms]) => noms.map(async (nom) => {
        const r = await fetch(`${base}${pack}/${nom}.glb`); if (!r.ok) throw new Error(nom + ' : ' + r.status);
        const buf = await r.arrayBuffer(); octets += buf.byteLength; MODS.set(nom, lire(buf, pals[pack]));
      })));
      pret = true; KENNEY.ms = Math.round(performance.now() - t0);
      for (const f of attente.splice(0)) try { f(); } catch (e) { console.error(e); }
      return true;
    })().catch((e) => { erreur = String(e && e.message || e); console.warn('Modèles Kenney non chargés (les meubles faits à la main restent) :', erreur); MODS.clear(); return false; });
    return enCours;
  }
  const quandPret = (f) => { if (pret) f(); else attente.push(f); };
  // ─── l'usage : la géométrie (recolorée et en cache), ses cotes, une pièce prête pour MODELES.assembler ───
  const _c = new THREE.Color();
  function geo(nom, couleurs) { // couleurs : { nomDeMatériau: '#hex' } remplace la couleur cuite de ces triangles
    const md = MODS.get(nom); if (!md) return null;
    if (!couleurs) return md.geo;
    const k = nom + JSON.stringify(couleurs); let g = CACHE.get(k); if (g) return g;
    g = md.geo.clone(); g.userData.cache = true; const a = g.attributes.color.array;
    const rem = md.noms.map((n) => (couleurs[n] ? _c.set(couleurs[n]).toArray() : null));
    for (let t = 0; t < md.mat.length; t++) { const c = rem[md.mat[t]]; if (c) for (let e = 0; e < 3; e++) a.set(c, (t * 3 + e) * 3); }
    CACHE.set(k, g); return g;
  }
  const dims = (nom) => { const m = MODS.get(nom); return m ? { w: m.w, h: m.h, d: m.d } : null; };
  // une pièce : o = { w, h, d } (cotes visées ; une seule cote donnée → échelle uniforme), ou s (échelle), plus x, y, z, rx, ry, rz ; col teinte le tout
  function part(nom, o, couleurs, col) {
    const md = MODS.get(nom); if (!md) return null; o = o || {};
    let sx, sy, sz;
    if (o.s != null) sx = sy = sz = o.s;
    else { const kw = o.w != null ? o.w / md.w : null, kh = o.h != null ? o.h / md.h : null, kd = o.d != null ? o.d / md.d : null, u = kw || kh || kd || 1; sx = kw || u; sy = kh || (kw && kd ? (kw + kd) / 2 : u); sz = kd || u; }
    const p = MODELES.part(geo(nom, couleurs), col || null, { x: o.x, y: o.y, z: o.z, rx: o.rx, ry: o.ry, rz: o.rz, sx, sy, sz }); p.vc = true; return p;
  }
  return { PACKS, charger, quandPret, geo, dims, part, get pret() { return pret; }, get erreur() { return erreur; }, get octets() { return octets; }, ms: 0, MODS };
})();
if (typeof module !== 'undefined') module.exports = KENNEY;
