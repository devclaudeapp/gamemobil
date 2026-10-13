/* LE FOURNIL — rendu HD (ESSAI, branche maquette-hd, seulement avec ?hd=1) : des modèles KayKit (CC0, Kay Lousberg) mêlés au décor
   du jeu, des personnages riggés et animés (KayKit Adventurers, rhabillés par leur palette), et une passe d'effets (N8AO, SMAA, halo)
   par vendor/fournil-hd.min.js (GLTFLoader + SkeletonUtils three r158, postprocessing 6.33.4, n8ao 1.8.4). Sans ?hd=1 : rien ne change. */
const HDM = (() => {
  const actif = typeof window !== 'undefined' && typeof THREE !== 'undefined' && typeof FOURNIL_HD !== 'undefined' && /[?&]hd=1/.test(location.search);
  const API = { actif, pret: false, version: 0 };
  if (!actif) return API;
  const X = FOURNIL_HD, L = new X.GLTFLoader(), BASE = 'hd/';
  const LISTE = {
    meubles: ['rug_oval_A', 'rug_rectangle_stripes_A', 'cactus_medium_A', 'cactus_small_A', 'cactus_small_B', 'pictureframe_large_A', 'pictureframe_medium', 'pictureframe_small_A', 'lamp_standing', 'couch_pillows', 'armchair_pillows', 'table_low', 'shelf_B_large_decorated', 'cabinet_medium_decorated', 'lamp_table'],
    ville: ['building_D', 'building_F', 'building_B', 'streetlight', 'car_sedan', 'dumpster', 'firehydrant', 'bench', 'trash_A', 'box_A'],
    halloween: ['pumpkin_orange', 'pumpkin_orange_jackolantern', 'pumpkin_yellow_small', 'candle_triple', 'lantern_hanging'],
    resto: ['jar_A_large', 'jar_B_medium', 'jar_C_small', 'cuttingboard'],
  };
  const VARIANTES = ['Rogue', 'Mage', 'Knight', 'Barbarian'], MOD = {}, PER = {}, attente = [];
  const charger = (u) => new Promise((ok, ko) => L.load(BASE + u, ok, null, ko));
  const taches = [];
  for (const [dossier, noms] of Object.entries(LISTE)) for (const n of noms) taches.push(charger(`${dossier}/${n}.gltf`).then((g) => { MOD[n] = g.scene; }).catch(() => {}));
  for (const n of VARIANTES) taches.push(charger(`persos/${n}.glb`).then((g) => { PER[n] = g; }));
  Promise.all(taches).then(() => { API.pret = true; API.version++; attente.splice(0).forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }).catch((e) => { API.erreur = String(e && e.message || e); });

  // un meuble : cloné, à l'échelle s (unités KayKit → unités du monde), posé pied au sol, centré en x/z sur sa boîte
  function modele(nom, s, o = {}) {
    const src = MOD[nom]; if (!src) return null;
    const g = new THREE.Group(), m = src.clone(true); m.scale.setScalar(s); m.rotation.y = o.ry || 0; m.updateMatrixWorld(true);
    m.traverse((x) => { if (x.isMesh) { x.castShadow = o.ombre !== false; x.receiveShadow = true; } });
    const b = new THREE.Box3().setFromObject(m); m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.add(m);
    g.userData.taille = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }; return g;
  }

  // ─── rhabiller : la texture-palette (8 × 8 cases) ; la peau, les cheveux sombres et les gris restent, le reste prend la teinte voulue ───
  const texCache = new Map();
  function hsl(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
  function rgb(h, s, l) { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r + m, g + m, b + m]; }
  function rhabiller(map, cible, gris, cle) {
    if (texCache.has(cle)) return texCache.get(cle);
    const img = map.image, n = img.width, cv = document.createElement('canvas'); cv.width = n; cv.height = n; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, n, n), a = d.data, cell = n / 8, c = new THREE.Color(cible), [th, ts, tl] = hsl(c.r, c.g, c.b);
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
      let r = 0, g = 0, b = 0, k = 0; for (let yy = 0; yy < cell; yy += 8) for (let xx = 0; xx < cell; xx += 8) { const i = ((cy * cell + yy) * n + cx * cell + xx) * 4; r += a[i]; g += a[i + 1]; b += a[i + 2]; k++; }
      const [h, s, l] = hsl(r / k / 255, g / k / 255, b / k / 255);
      if ((h >= 8 && h <= 42 && s > 0.2 && l > 0.42) || l < 0.22 || (s < 0.14 && !gris)) continue;
      for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
        const i = ((cy * cell + yy) * n + cx * cell + xx) * 4, [, , pl] = hsl(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255);
        const [nr, ng, nb] = rgb(th, ts, Math.min(0.96, Math.max(0.05, pl - l + tl))); a[i] = nr * 255; a[i + 1] = ng * 255; a[i + 2] = nb * 255;
      }
    }
    x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.partagee = true; texCache.set(cle, t); return t;
  }

  // ─── un personnage : clone riggé, rhabillé, toque en option sur l'os de la tête, mélangeur d'animations ───
  const blanc = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85 });
  function perso(variante, couleur, o = {}) {
    const src = PER[variante] || PER.Rogue, g = X.SkeletonUtils.clone(src.scene);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; if (m.material && m.material.map) { m.material = m.material.clone(); m.material.map = rhabiller(m.material.map, couleur, !!o.gris, variante + couleur + (o.gris ? 'g' : '')); } } });
    if (o.toque) {
      let tete = null; g.traverse((b) => { if (!tete && b.isBone && /head/i.test(b.name)) tete = b; });
      if (tete) { const t = new THREE.Group(), fut = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.42, 20), blanc); fut.position.y = 0.21; t.add(fut);
        for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), blanc), a = k / 5 * Math.PI * 2; b.position.set(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2); t.add(b); }
        t.position.y = 0.95; t.traverse((m) => { if (m.isMesh) m.castShadow = true; }); tete.add(t); }
    }
    const mixer = new THREE.AnimationMixer(g), actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    const a = { g, mixer, actions, joue: null, yaw: 0 }; jouer(a, o.anim || 'Idle', 0); mixer.update(Math.random() * 3); return a;
  }
  function jouer(a, nom, fondu = 0.25) {
    if (a.joue === nom || !a.actions[nom]) return; const n = a.actions[nom].reset().play();
    if (a.joue && a.actions[a.joue]) a.actions[a.joue].crossFadeTo(n, fondu, false); a.joue = nom;
  }
  function liberer(a) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.g.traverse((m) => { if (m.isMesh && m.geometry && !m.isSkinnedMesh) m.geometry.dispose(); }); }

  // ─── la passe d'effets : occlusion N8AO (optionnelle), SMAA, halo ; sortie sRGB ───
  function effets(renderer, scene, camera, W, H, dpr, o = {}) {
    const c = new X.EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType }); c.addPass(new X.RenderPass(scene, camera));
    let n8 = null;
    if (o.ao !== false) { n8 = new X.N8AOPostPass(scene, camera, W * dpr, H * dpr); Object.assign(n8.configuration, { aoRadius: o.rayon || 40, distanceFalloff: 1, intensity: o.ao || 2.6, color: new THREE.Color(o.aoCouleur || '#3A2418'), halfRes: true, aoSamples: 12, denoiseSamples: 8 }); c.addPass(n8); }
    const fx = [new X.SMAAEffect()]; if (o.halo !== 0) fx.push(new X.BloomEffect({ intensity: o.halo || 0.3, luminanceThreshold: o.seuil || 0.85, mipmapBlur: true }));
    c.addPass(new X.EffectPass(camera, ...fx)); c.setSize(W, H);
    return { rendre: (dt) => c.render(dt), liberer: () => c.dispose(), n8 };
  }
  function quandPret(f) { if (API.pret) f(); else attente.push(f); }
  return Object.assign(API, { modele, perso, jouer, liberer, effets, quandPret, VARIANTES });
})();
if (typeof module !== 'undefined') module.exports = HDM;
