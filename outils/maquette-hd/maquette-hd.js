// MAQUETTE HD du Fournil (aperçu, pas le jeu) : la boutique refaite avec KayKit Restaurant Bits, des personnages riggés et animés
// (KayKit Adventurers, rhabillés), l'occlusion N8AO, SMAA, un halo et un tone mapping. Elle se glisse sous l'interface du vrai jeu :
// même caméra orthographique que src/scene.js, mêmes emplacements (VIE.LAY), et les personnages suivent les vrais clients (VIE.clients).
(() => {
  const HD = window.FOURNIL_HD, V = typeof VIE !== 'undefined' ? VIE : null; if (!HD || !V || !V.LAY) { window.__hd = { err: 'pas de VIE / FOURNIL_HD' }; return; }
  const { GLTFLoader, SkeletonUtils, EffectComposer, RenderPass, EffectPass, SMAAEffect, BloomEffect, ToneMappingEffect, ToneMappingMode, N8AOPostPass } = HD;
  const PITCH = 52 * Math.PI / 180, SY = Math.sin(PITCH), CY = Math.cos(PITCH), BASE = window.__hdBase || '/hd/';
  const R = window.__hdReglages || {};
  const old = document.getElementById('scene'), ui = document.getElementById('scene-ui');
  const cv = document.createElement('canvas'); cv.id = 'scene-hd';
  cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
  old.parentNode.insertBefore(cv, ui); old.style.visibility = 'hidden';
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const DPR = Math.min(R.dpr || 2, window.devicePixelRatio || 1); renderer.setPixelRatio(DPR);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#E9D9C4');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  const hemi = new THREE.HemisphereLight('#FFF1DE', '#8C6A50', 1.0); scene.add(hemi);
  const dir = new THREE.DirectionalLight('#FFE2B8', 2.9); dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); dir.shadow.bias = -0.0004; dir.shadow.normalBias = 1.2; scene.add(dir, dir.target);
  const lampe = new THREE.PointLight('#FFC873', 0, 0, 1.6); scene.add(lampe);
  let composer = null, n8 = null;
  const L = new GLTFLoader(), charger = (u) => new Promise((ok, ko) => L.load(BASE + u, ok, null, ko));
  const MEUBLES = ['floor_kitchen', 'wall', 'wall_window_open', 'wall_doorway', 'door_A', 'fridge_A_decorated', 'oven', 'stove_multi_decorated', 'kitchencounter_straight_A', 'kitchencounter_straight_B', 'kitchencabinet', 'kitchentable_A_large_decorated', 'crate_buns', 'table_round_A_small_decorated', 'chair_A', 'menu', 'food_ingredient_bun', 'food_burger', 'jar_A_large', 'jar_B_medium', 'shelf_papertowel_decorated', 'pillar_A', 'crate_lid', 'plate', 'cuttingboard'];
  const PERSOS = ['Rogue', 'Mage', 'Knight', 'Barbarian'];
  const M = {}, P = {};
  let W = 0, H = 0, LAY = null, S = 30, cle = '', salle = null; const acteurs = new Map();
  const wz = (ys) => (ys - LAY.murH) / SY, wy = (px) => px / CY;

  // ─── rhabiller : la texture-palette des personnages (cases de 128 px) ; les cases de peau, de cheveux et les gris restent,
  //     les cases de couleur prennent la teinte voulue (luminance gardée) ─────────────────────────────────────────────────
  const texCache = new Map();
  function hsl(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
  function rgb(h, s, l) { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r + m, g + m, b + m]; }
  function rhabiller(map, cible, cleT) {
    if (texCache.has(cleT)) return texCache.get(cleT);
    const img = map.image, n = img.width, cv2 = document.createElement('canvas'); cv2.width = n; cv2.height = n; const x = cv2.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, n, n), a = d.data, cell = n / 8, c = new THREE.Color(cible), [th, ts, tl] = hsl(c.r, c.g, c.b);
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
      let r = 0, g = 0, b = 0, k = 0; for (let yy = 0; yy < cell; yy += 8) for (let xx = 0; xx < cell; xx += 8) { const i = ((cy * cell + yy) * n + cx * cell + xx) * 4; r += a[i]; g += a[i + 1]; b += a[i + 2]; k++; }
      const [h, s, l] = hsl(r / k / 255, g / k / 255, b / k / 255);
      const peau = h >= 8 && h <= 42 && s > 0.2 && l > 0.42, sombre = l < 0.22, gris = s < 0.14;
      if (peau || sombre || (gris && !R.gris)) continue;
      for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
        const i = ((cy * cell + yy) * n + cx * cell + xx) * 4, [, , pl] = hsl(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255);
        const ll = Math.min(0.95, Math.max(0.05, pl - l + tl)), [nr, ng, nb] = rgb(th, ts, ll); a[i] = nr * 255; a[i + 1] = ng * 255; a[i + 2] = nb * 255;
      }
    }
    x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv2); t.flipY = map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(cleT, t); return t;
  }

  function parquet(w, d) { // des lames de bois de 1,4 unité, teintes un peu différentes, joints fins
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d'), lames = 8, l = 1024 / lames;
    for (let i = 0; i < lames; i++) for (let j = 0; j < 4; j++) { const v = (Math.sin(i * 12.9 + j * 78.2) * 43758.5) % 1, k = Math.abs(v); x.fillStyle = `hsl(${28 + k * 6}, ${42 + k * 10}%, ${58 + k * 9}%)`; const dec = (i % 2) * 128; x.fillRect(i * l, ((j * 256 + dec) % 1024), l, 256); x.fillRect(i * l, ((j * 256 + dec) % 1024) - 1024, l, 256); }
    x.globalAlpha = 0.07; for (let k = 0; k < 900; k++) { x.fillStyle = k % 2 ? '#5a3a20' : '#fff3e0'; x.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random() * 2, 20 + Math.random() * 60); }
    x.globalAlpha = 0.5; x.fillStyle = '#6B4A30'; for (let i = 0; i <= lames; i++) x.fillRect(i * l - 1, 0, 2, 1024); for (let i = 0; i < lames; i++) for (let j = 0; j < 4; j++) x.fillRect(i * l, (j * 256 + (i % 2) * 128) % 1024, l, 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(w / (0.6 * S * lames), d / (0.6 * S * lames) * 2); return t;
  }
  // ─── poser un meuble : centré en x, son devant (bord le plus proche de la caméra) en zAvant ───
  function poser(nom, x, zAvant, o = {}) {
    const src = M[nom]; if (!src) return null;
    const g = src.scene.clone(true); g.scale.set(S * (o.sx || o.s || 1), S * (o.sy || o.s || 1), S * (o.sz || o.s || 1)); g.rotation.y = o.ry || 0;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = o.ombre !== false; m.receiveShadow = true; } });
    g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g);
    g.position.set(x - (b.min.x + b.max.x) / 2, (o.y || 0) - (o.sol === false ? 0 : b.min.y), zAvant - b.max.z); salle.add(g); return g;
  }
  function batir() {
    if (salle) { scene.remove(salle); salle.traverse((m) => { if (m.isMesh) m.geometry.dispose(); }); }
    salle = new THREE.Group(); scene.add(salle);
    const D = (H - LAY.murH) / SY + 200, K = V.K;
    // le sol : un parquet chaud (texture peinte), le mur du fond : enduit crème, soubassement en bois, plinthe ; la porte d'entrée
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, D), new THREE.MeshStandardMaterial({ map: parquet(W + 200, D), roughness: 0.82 }));
    sol.rotation.x = -Math.PI / 2; sol.position.set(W / 2, 0, D / 2); sol.receiveShadow = true; salle.add(sol);
    const enduit = new THREE.MeshStandardMaterial({ color: '#F3E4CE', roughness: 0.95 }), bois = new THREE.MeshStandardMaterial({ color: '#A8724A', roughness: 0.7 }), hm = 4 * S;
    const mur = new THREE.Mesh(new THREE.BoxGeometry(W + 200, hm, 0.4 * S), enduit); mur.position.set(W / 2, hm / 2, -0.2 * S); mur.receiveShadow = true; salle.add(mur);
    const soub = new THREE.Mesh(new THREE.BoxGeometry(W + 200, 1.3 * S, 0.12 * S), bois); soub.position.set(W / 2, 0.65 * S, 0.06 * S); soub.receiveShadow = true; salle.add(soub);
    const p = LAY.porte; poser('door_A', p.x + p.w / 2, 0.42 * S, { s: 0.9 });
    // la cuisine, contre le mur à gauche : le frigo, le four, les feux ; les placards au-dessus
    const fr = LAY.froid, fo = LAY.four;
    poser('fridge_A_decorated', Math.max(S, fr.x + fr.w / 2), wz(fr.y + fr.h) + 0.2 * S, { s: 0.85 });
    poser('oven', fo.x + fo.w / 2 + 0.4 * S, wz(fo.y + fo.h), { s: 0.95 });
    poser('kitchencabinet', fo.x + fo.w / 2 + 0.4 * S, 1.05 * S, { sol: false, s: 0.95, ombre: false });
    poser('shelf_papertowel_decorated', LAY.etagere.x + LAY.etagere.w / 2, 0.7 * S, { sol: false, y: 2.2 * S, ombre: false });
    // le comptoir et sa vitrine (des petits pains, des burgers « viennois »), la caisse (le menu) au bout
    const c = LAY.comptoir, zc = wz(c.y + c.hTop + c.hFace * 0.9), n = Math.max(2, Math.round(c.w / (2 * S)));
    for (let k = 0; k < n; k++) poser(k % 2 ? 'kitchencounter_straight_B' : 'kitchencounter_straight_A', c.x + (k + 0.5) * c.w / n, zc, { sx: c.w / n / (2 * S), sz: 0.62 });
    const dessus = 1.0 * S;
    for (let k = 0; k < 4; k++) poser(k % 2 ? 'food_burger' : 'food_ingredient_bun', c.x + (k + 0.6) * c.w / 5, zc - 0.3 * S, { sol: false, y: dessus, s: 0.55 });
    poser('menu', LAY.caisse.x, zc - 0.2 * S, { sol: false, y: dessus, s: 0.8 });
    // le plan de travail et le présentoir à gauche ; le salon de thé à droite (tables rondes et chaises)
    poser('kitchentable_A_large_decorated', LAY.plan.x + LAY.plan.w / 2 + 0.3 * S, wz(LAY.plan.y + LAY.plan.h) + 0.4 * S, { s: 0.7 });
    poser('crate_buns', LAY.presentoir.x + LAY.presentoir.w / 2, wz(LAY.presentoir.y + LAY.presentoir.h), { s: 0.6 });
    for (const tb of LAY.tables) {
      poser('table_round_A_small_decorated', tb.x, wz(tb.y) + 0.55 * S, { s: 0.75 });
      for (const sg of tb.sieges) poser('chair_A', sg.x - sg.dir * 0.12 * S, wz(sg.y) + 0.45 * S, { s: 0.75, ry: sg.dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    // la lumière : un soleil de fin de matinée par la fenêtre, une lampe chaude au-dessus du comptoir
    dir.position.set(W * 0.15, 900, wz(LAY.murH) + 700); dir.target.position.set(W * 0.55, 0, wz(H * 0.45)); dir.target.updateMatrixWorld();
    const sc = dir.shadow.camera; sc.left = -W * 1.1; sc.right = W * 1.1; sc.top = 900; sc.bottom = -900; sc.near = 10; sc.far = 3000; sc.updateProjectionMatrix();
    lampe.position.set(c.x + c.w / 2, 4 * S, zc); lampe.intensity = R.lampe != null ? R.lampe : 0;
  }

  // ─── les personnages : un clone riggé par client / apprenti / boulanger, son mélangeur d'animations ───
  const YAW = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI };
  const CACHE_MESH = /Knife|Crossbow|Throwable|Cape|Shield|Sword|Axe|Staff|Wand|Spellbook|Mug|Hat|Helmet|Hood|Quiver|Arrow|Book/i;
  function creerPerso(variant, couleur, toque) {
    const src = P[variant], g = SkeletonUtils.clone(src.scene);
    g.traverse((m) => {
      if (CACHE_MESH.test(m.name)) m.visible = false;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; if (m.material && m.material.map) { m.material = m.material.clone(); m.material.map = rhabiller(m.material.map, couleur, variant + couleur); } }
    });
    if (toque) { // une toque blanche sur l'os de la tête
      let tete = null; g.traverse((o) => { if (!tete && o.isBone && /head/i.test(o.name)) tete = o; });
      if (tete) { const blanc = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8 }), t = new THREE.Group();
        const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.42, 20), blanc); fut.position.y = 0.21; t.add(fut);
        for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), blanc); const a = k / 5 * Math.PI * 2; b.position.set(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2); t.add(b); }
        t.position.y = 0.95; t.traverse((o) => { if (o.isMesh) o.castShadow = true; }); tete.add(t); }
    }
    const mixer = new THREE.AnimationMixer(g), actions = {};
    for (const nom of ['Idle', 'Walking_A', 'Sit_Chair_Idle', 'Interact', 'Use_Item', 'Cheer', 'Walking_C']) { const clip = src.animations.find((a) => a.name === nom); if (clip) actions[nom] = mixer.clipAction(clip); }
    const a = { g, mixer, actions, joue: null, yaw: 0 };
    jouer(a, 'Idle', 0); mixer.update(Math.random() * 2); return a;
  }
  function jouer(a, nom, fondu = 0.25) {
    if (a.joue === nom || !a.actions[nom]) return; const n = a.actions[nom].reset().play();
    if (a.joue && a.actions[a.joue]) a.actions[a.joue].crossFadeTo(n, fondu, false); a.joue = nom;
  }
  const HAUTS = ['#E85D75', '#4F8FE0', '#F2B33D', '#5FBF8F', '#9B6BE0', '#E07B4F', '#3DB6C9', '#D9577E'];
  function tourner(a, dir, dt) { const c = YAW[dir] || 0; a.yaw += Math.atan2(Math.sin(c - a.yaw), Math.cos(c - a.yaw)) * Math.min(1, dt * 10); a.g.rotation.y = a.yaw; }
  function synchroniser(dt) {
    const vus = new Set();
    for (const c of V.clients) {
      let a = acteurs.get(c.id);
      if (!a) { a = creerPerso(PERSOS[c.id % 4], c.haut && /^#/.test(c.haut) ? c.haut : HAUTS[c.id % HAUTS.length], false); acteurs.set(c.id, a); scene.add(a.g); }
      vus.add(c.id);
      const assis = c.etat === 'assis', marche = c.etat === 'entre' || c.etat === 'sort' || c.etat === 'vaTable' || (c.etat === 'attend' && !!c.glisse);
      a.g.visible = c.alpha > 0.05; a.g.scale.setScalar(S * 0.74 * (c.taille || 1));
      a.g.position.set(c.x, assis ? 0.18 * S : 0, wz(c.y) + (assis ? 0.35 * S : 0) - (1 - c.alpha) * 30);
      jouer(a, assis ? 'Sit_Chair_Idle' : marche ? 'Walking_A' : 'Idle'); tourner(a, c.dir, dt); a.mixer.update(dt);
    }
    for (const ap of V.apprentis) {
      const id = 'a' + ap.i; let a = acteurs.get(id);
      if (!a) { a = creerPerso(ap.i % 2 ? 'Rogue' : 'Mage', '#F4F1EA', true); acteurs.set(id, a); scene.add(a.g); }
      vus.add(id); a.g.scale.setScalar(S * 0.72); a.g.position.set(ap.x, 0, wz(ap.y));
      jouer(a, ap.etat === 'porte' || ap.etat === 'retour' ? 'Walking_A' : 'Use_Item'); tourner(a, ap.etat === 'panne' ? 0 : ap.dir, dt); a.mixer.update(dt);
    }
    let b = acteurs.get('boulanger'); if (!b) { b = creerPerso('Knight', '#FAFAF5', true); acteurs.set('boulanger', b); scene.add(b.g); }
    vus.add('boulanger'); b.g.scale.setScalar(S * 0.78); b.g.position.set(LAY.boulanger.x, 0, wz(LAY.boulanger.y) - 0.2 * S); jouer(b, 'Interact'); b.g.rotation.y = 0; b.mixer.update(dt);
    for (const [id, a] of acteurs) if (!vus.has(id)) { scene.remove(a.g); acteurs.delete(id); }
  }

  // ─── la taille, la caméra (celle de src/scene.js), la passe d'effets ───
  function dimensionner() {
    W = V.W; H = V.H; LAY = V.LAY; S = W * (R.echelle || 0.08);
    const r = old.getBoundingClientRect(), wr = old.parentNode.getBoundingClientRect(); cv.style.left = (r.left - wr.left) + 'px'; cv.style.top = (r.top - wr.top) + 'px'; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    renderer.setSize(W, H, false);
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
    const Zc = (H / 2 - LAY.murH) / SY; camera.position.set(W / 2, 1500 * SY, Zc + 1500 * CY); camera.lookAt(W / 2, 0, Zc); camera.updateMatrixWorld();
    if (composer) composer.dispose();
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    if (R.ao !== false) { n8 = new N8AOPostPass(scene, camera, W * DPR, H * DPR); Object.assign(n8.configuration, { aoRadius: S * 1.8, distanceFalloff: 1.0, intensity: R.aoK || 3.4, color: new THREE.Color('#2A1A12'), halfRes: true, aoSamples: 16, denoiseSamples: 8 }); composer.addPass(n8); }
    composer.addPass(new EffectPass(camera, new SMAAEffect(), new BloomEffect({ intensity: R.bloom != null ? R.bloom : 0.35, luminanceThreshold: 0.82, mipmapBlur: true }), new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
    composer.setSize(W, H);
    batir(); for (const [, a] of acteurs) scene.remove(a.g); acteurs.clear();
  }
  let dernier = performance.now(), images = 0, tMesure = performance.now(), ips = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - dernier) / 1000); dernier = now;
    if (!V.LAY) return; const k = `${V.W}x${V.H}x${V.LAY.tables[0].y | 0}`; if (k !== cle) { cle = k; dimensionner(); }
    synchroniser(dt); composer.render(dt);
    images++; if (now - tMesure > 1000) { ips = images * 1000 / (now - tMesure); images = 0; tMesure = now; }
  }
  window.__hd = { pret: false, get stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ips: Math.round(ips), acteurs: acteurs.size, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; } };
  Promise.all([...MEUBLES.map((n) => charger('resto/' + n + '.gltf').then((g) => { M[n] = g; }).catch(() => {})), ...PERSOS.map((n) => charger('persos/' + n + '.glb').then((g) => { P[n] = g; }))])
    .then(() => { requestAnimationFrame(frame); setTimeout(() => { window.__hd.pret = true; }, 600); })
    .catch((e) => { window.__hd.err = String(e && e.message || e); });
})();
