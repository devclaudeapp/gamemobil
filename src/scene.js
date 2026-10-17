/* LE FOURNIL — la boutique en vraie 3D (Three.js r158, low-poly arrondi pastel). Cette vue ne simule rien : VIE (src/vie.js) fait vivre
   les clients, la file, les apprentis et le plan LAY en pixels d'écran ; ici on projette ce plan dans une pièce en volumes, caméra fixe
   orthographique en plongée 3/4 (lacet 0, 52°), cadrée pour que chaque point du plan tombe exactement à son pixel : un point du sol
   (X, ys) est en monde (X, 0, wz(ys)), un point du mur (X, ys) en (X, wy(murH − ys), 0). Les meubles et la salle viennent de MEUBLES,
   les personnages et les pâtisseries de PERSOS. Un calque 2D (#scene-ui) porte les textes, les pastilles, le mode Aménager et les confettis. */
const SCENE = (() => {
  'use strict';
  const G = GAME, V = VIE, M = MODELES;
  const TAU = Math.PI * 2, PITCH = 52 * Math.PI / 180, SY = Math.sin(PITCH), CY = Math.cos(PITCH), L = '#4A3328';
  let cv, cvUi, ctx2, renderer, scene, camera, hemi, dir, W = 1, H = 1, DPR = 1, DPRui = 1, LAY = null, visH = 1e9, amenager = false, webgl = false, perdu = 0, nFrame = 0, dernier = null;
  const wz = (ys) => (ys - LAY.murH) / SY, wy = (px) => px / CY, wd = (px) => px / SY;
  const projeterY = (Y, Z) => LAY.murH - Y * CY + Z * SY; // la hauteur d'écran d'un point monde (son X est son x d'écran)
  // ─── la qualité : trois paliers, adaptés au temps de frame mesuré ───
  const PALIERS = { haute: { dpr: 2, ombres: 1024, saute: false }, moyenne: { dpr: 1.5, ombres: 512, saute: false }, eco: { dpr: 1, ombres: 0, saute: true } };
  const QUAL = { niveau: 'haute', fixe: false, mesures: 0, somme: 0, calme: 0, echecs: {}, verif: null };
  const ORDRE_Q = ['eco', 'moyenne', 'haute'];
  const recompiler = () => scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); // les tableaux de matériaux (le mur) compris
  function qualite(niveau) {
    if (!PALIERS[niveau] || QUAL.niveau === niveau) return; QUAL.niveau = niveau; const p = PALIERS[niveau];
    if (!renderer) return;
    DPR = Math.min(p.dpr, window.devicePixelRatio || 1); renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
    const ombres = p.ombres > 0; if (renderer.shadowMap.enabled !== ombres) { renderer.shadowMap.enabled = ombres; recompiler(); }
    if ((!ombres || dir.shadow.mapSize.x !== p.ombres) && dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; } // une carte d'ombre inutile ou à la mauvaise taille est rendue
    if (ombres) dir.shadow.mapSize.set(p.ombres, p.ombres);
    richesse(niveau);
  }
  // l'intervalle réel entre deux images (le travail du processeur graphique compris), par fenêtres de 60 images :
  // au-dessus de 28 ms on descend d'un palier ; si la fenêtre suivante ne va pas 10 % plus vite, c'est l'écran qui plafonne la cadence (30 Hz,
  // mode économie d'énergie) : on remonte et on ne bouge plus. Sous 18 ms pendant dix fenêtres on tente de remonter, puis une minute, puis plus jamais.
  function mesurer(ms) {
    if (QUAL.fixe || !(ms > 0) || ms > 200) return; // un onglet en veille ou un à-coup isolé ne compte pas
    QUAL.somme += ms; if (++QUAL.mesures < 60) return;
    const moy = QUAL.somme / QUAL.mesures; QUAL.moy = moy; QUAL.mesures = 0; QUAL.somme = 0;
    const v = QUAL.verif; QUAL.verif = null;
    if (v) { if (v.sens < 0 && moy > v.avant * 0.9) { qualite(v.de); QUAL.fixe = true; return; } if (v.sens > 0 && moy > 28) { QUAL.echecs[QUAL.niveau] = (QUAL.echecs[QUAL.niveau] || 0) + 1; qualite(v.de); QUAL.calme = 0; return; } }
    const k = ORDRE_Q.indexOf(QUAL.niveau);
    if (moy > 28 && k > 0) { QUAL.calme = 0; QUAL.verif = { de: QUAL.niveau, avant: moy, sens: -1 }; qualite(ORDRE_Q[k - 1]); }
    else if (moy < 18 && k < 2) { const vers = ORDRE_Q[k + 1], n = QUAL.echecs[vers] || 0; if (n < 2 && ++QUAL.calme >= 10 * Math.pow(6, n)) { QUAL.calme = 0; QUAL.verif = { de: QUAL.niveau, avant: moy, sens: 1 }; qualite(vers); } }
    else QUAL.calme = 0;
  }
  // ─── le rendu riche (paliers haute et moyenne ; l'éco garde exactement le rendu d'avant) ───
  // · la lumière d'ambiance : une pièce chaude (portage de RoomEnvironment, three.js r158, MIT, d'après model-viewer) passée au PMREM,
  //   que les matériaux standard (PBR, rugosité forte : on reste mat et cartoon) reflètent en lumière diffuse et en reflets doux ;
  // · les matériaux : chaque Lambert de la scène a un jumeau MeshStandard (mêmes couleurs, textures, lueurs) ; on bascule de l'un à l'autre
  //   avec le palier, sans rien reconstruire ; les jumeaux suivent la vie de leur original (partagé ou non) ;
  // · l'occlusion ambiante : une texture d'ombres de contact peinte (sous les meubles, au pied du mur), posée en aoMap sur le sol et le mur ;
  // · les effets (haute seulement) : la scène est rendue dans une cible MSAA, puis une passe plein écran pose un contour cartoon (écarts
  //   de profondeur), une correction de couleur chaude et un léger vignettage. Une passe, pas de bibliothèque.
  const RICHE = { actif: false, env: null, envK: 0.5, lueurMur: 0.6, kEnv: 0.16, kHemi: 0.35, kDir: 0.92, effets: true, chaud: 0.55, jumeaux: new WeakMap(), post: null, ao: null, aoMur: null, aoSale: true };
  const estRiche = (niveau) => niveau !== 'eco';
  function pieceEnv() { // la pièce d'ambiance : murs clairs, six panneaux lumineux un peu chauds, quelques volumes qui cassent l'uniformité
    const s = new THREE.Scene(), geo = new THREE.BoxGeometry(); geo.deleteAttribute('uv');
    const murM = new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: '#FFF4E8' }), boiteM = new THREE.MeshStandardMaterial({ color: '#F2E2D2' });
    const lum = new THREE.PointLight(0xffffff, renderer._useLegacyLights ? 5 : 900, 28, 2); lum.position.set(0.418, 16.199, 0.3); s.add(lum);
    const b = (m, p, r, k) => { const o = new THREE.Mesh(geo, m); o.position.set(p[0], p[1], p[2]); o.rotation.set(0, r, 0); o.scale.set(k[0], k[1], k[2]); s.add(o); };
    b(murM, [-0.757, 13.219, 0.717], 0, [31.713, 28.305, 28.591]);
    for (const [p, r, k] of [[[-10.906, 2.009, 1.846], -0.195, [2.328, 7.905, 4.651]], [[-5.607, -0.754, -0.758], 0.994, [1.97, 1.534, 3.955]], [[6.167, 0.857, 7.803], 0.561, [3.927, 6.285, 3.687]], [[-2.017, 0.018, 6.124], 0.333, [2.002, 4.566, 2.064]], [[2.291, -0.756, -2.621], -0.286, [1.546, 1.552, 1.496]], [[-2.193, -0.369, -5.547], 0.516, [3.875, 3.487, 2.986]]]) b(boiteM, p, r, k);
    const panneau = (k, teinte) => { const m = new THREE.MeshBasicMaterial(); m.color.set(teinte).multiplyScalar(k); return m; };
    for (const [k, t, p, e] of [[50, '#FFE9CF', [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]], [50, '#FFE9CF', [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]], [17, '#FFF6EA', [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]], [43, '#FFEBD6', [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]], [20, '#FFE2C4', [3.235, 11.486, -12.541], [2.5, 2, 0.1]], [100, '#FFF8F0', [0, 20, 0], [1, 0.1, 1]]]) b(panneau(k, t), p, 0, e);
    return s;
  }
  function envMap() {
    if (RICHE.env) return RICHE.env;
    const pm = new THREE.PMREMGenerator(renderer), piece = pieceEnv();
    RICHE.env = pm.fromScene(piece, 0.04).texture; pm.dispose();
    piece.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return RICHE.env;
  }
  function rugosite(m) { if (m.transparent && m.opacity < 0.6) return 0.18; if (m.map) return 0.92; return 0.78; } // le verre brille, le sol et le mur restent mats
  function jumeau(m) { // le MeshStandard d'un Lambert (en cache) ; partagé si l'original l'est
    let t = RICHE.jumeaux.get(m); if (t) return t;
    t = new THREE.MeshStandardMaterial({ color: m.color.clone(), vertexColors: m.vertexColors, map: m.map, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, side: m.side, alphaTest: m.alphaTest, depthTest: m.depthTest, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits, flatShading: m.flatShading, roughness: rugosite(m), metalness: 0 });
    Object.defineProperty(t, 'envMapIntensity', { get: () => RICHE.envK, set: () => {} }); // une seule intensité d'ambiance pour toute la scène, réglée par la phase du jour
    t.userData.lambert = m; if (M.estPartage(m)) M.partager(t);
    RICHE.jumeaux.set(m, t); return t;
  }
  function habiller(obj) { // pose les jumeaux (palier riche) ou les originaux (éco) sur tout ce que porte obj
    const riche = RICHE.actif;
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const vers = (m) => (riche ? (m.isMeshLambertMaterial ? jumeau(m) : m) : (m.userData && m.userData.lambert) || m);
      if (Array.isArray(o.material)) { if (o.material.some((m) => vers(m) !== m)) o.material = o.material.map(vers); } else { const n = vers(o.material); if (n !== o.material) o.material = n; }
    });
  }
  function richesse(niveau) { // le palier change : on bascule les matériaux, l'environnement et la passe d'effets
    const r = estRiche(niveau); if (!renderer) return;
    if (r !== RICHE.actif) { RICHE.actif = r; scene.environment = r ? envMap() : null; habiller(scene); RICHE.aoSale = true; }
    if (niveau !== 'haute' && RICHE.post) { RICHE.post.liberer(); RICHE.post = null; }
  }
  // l'occlusion ambiante peinte : sol (vu de dessus : x → u, z → v) et mur (x, hauteur) ; repeinte quand un meuble change
  function peindreAO() {
    if (!RICHE.actif || !salle || !LAY) return;
    if (!RICHE.aoSale) return; RICHE.aoSale = false; // repeinte seulement quand un groupe du décor a changé
    const D = wd(H - LAY.murH), Hm = wy(LAY.murH);
    const sol = RICHE.ao || (RICHE.ao = { cv: document.createElement('canvas') }), mur = RICHE.aoMur || (RICHE.aoMur = { cv: document.createElement('canvas') });
    sol.cv.width = 256; sol.cv.height = Math.max(64, Math.min(1024, Math.round(256 * D / W))); mur.cv.width = 256; mur.cv.height = 128;
    const x = sol.cv.getContext('2d'), sx = sol.cv.width / W, sz = sol.cv.height / D;
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, sol.cv.width, sol.cv.height);
    const g0 = x.createLinearGradient(0, 0, 0, 26 * sz); g0.addColorStop(0, 'rgba(70,50,40,.75)'); g0.addColorStop(1, 'rgba(70,50,40,0)'); x.fillStyle = g0; x.fillRect(0, 0, sol.cv.width, 26 * sz); // le pied du mur
    const tache = (x0, z0, x1, z1, k, flou) => { x.save(); x.shadowColor = `rgba(60,40,30,${k})`; x.shadowBlur = flou; x.shadowOffsetX = 4000; x.fillStyle = '#000'; x.beginPath(); x.roundRect(x0 * sx - 4000, z0 * sz, Math.max(1, (x1 - x0) * sx), Math.max(1, (z1 - z0) * sz), 3); x.fill(); x.restore(); };
    const bx = new THREE.Box3();
    for (const id of ['froid', 'four', 'comptoir', 'plan', 'presentoir', 'ardoise', 'plante', 'sapin', 'trophees', 'chien']) {
      const gr = groupes[id]; if (!gr) continue; bx.setFromObject(gr); if (bx.isEmpty() || bx.min.y > 2) continue;
      tache(bx.min.x + 1, Math.max(0, bx.min.z), bx.max.x - 1, bx.max.z + 2, 0.85, 10);
    }
    const dc = groupes.deco && groupes.deco.userData.zoneBoite; if (dc && !dc.isEmpty()) tache(dc.min.x + 2, dc.min.z + 2, dc.max.x - 2, dc.max.z, 0.6, 8);
    for (let i = 0; i < Math.min(V.crans.tables, LAY.tables.length); i++) { const tb = LAY.tables[i], r = 14 * V.K, z = wz(tb.y); tache(tb.x - r, z - r * 0.8, tb.x + r, z + r * 0.8, 0.55, 10); for (const s of tb.sieges) { const zs = wz(s.y); tache(s.x - 6 * V.K, zs - 6 * V.K, s.x + 6 * V.K, zs + 6 * V.K, 0.4, 6); } }
    if (V.crans.bar > 0) { const b = LAY.bar; tache(b.x0, wz(b.y - 12 * V.K), b.x1, wz(b.y + 6 * V.K), 0.55, 8); }
    if (V.crans.banquette > 0) { const q = LAY.banquette, K = V.K; tache(q.x - 27 * K, wz(q.y) - 14 * K, q.x + 27 * K, wz(q.y) + 10 * K, 0.5, 10); }
    // le mur : le pied (assombri sur 10 % de sa hauteur) et l'ombre portée des meubles adossés
    const y = mur.cv.getContext('2d'), mx = mur.cv.width / W, my = mur.cv.height / Hm; y.fillStyle = '#FFFFFF'; y.fillRect(0, 0, mur.cv.width, mur.cv.height);
    const g1 = y.createLinearGradient(0, mur.cv.height, 0, mur.cv.height - 30 * my); g1.addColorStop(0, 'rgba(70,50,40,.5)'); g1.addColorStop(1, 'rgba(70,50,40,0)'); y.fillStyle = g1; y.fillRect(0, mur.cv.height - 30 * my, mur.cv.width, 30 * my);
    for (const id of ['froid', 'four', 'comptoir']) { const gr = groupes[id]; if (!gr) continue; bx.setFromObject(gr); if (bx.isEmpty() || bx.min.z > 60) continue; y.save(); y.shadowColor = 'rgba(60,40,30,.45)'; y.shadowBlur = 10; y.shadowOffsetX = 4000; y.fillStyle = '#000'; y.fillRect(bx.min.x * mx - 4000, mur.cv.height - bx.max.y * my, (bx.max.x - bx.min.x) * mx, bx.max.y * my); y.restore(); }
    for (const a of [sol, mur]) { if (!a.tex) { a.tex = new THREE.CanvasTexture(a.cv); a.tex.userData.partagee = true; } a.tex.needsUpdate = true; }
    RICHE.aoMur.tex.repeat.set(1 / W, 1 / Hm); RICHE.aoMur.tex.flipY = true;
    // sur les jumeaux du sol et du mur (le mur : sa face avant seulement, le matériau 0)
    salle.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry.type === 'PlaneGeometry' && o.material.isMeshStandardMaterial && o.material.map && o.rotation.x < 0 && o.userData.nom !== 'trottoir') { o.material.aoMap = sol.tex; o.material.aoMapIntensity = 1; o.material.needsUpdate = true; } // (le trottoir a sa propre peinture)
      if (Array.isArray(o.material) && o.material[0].isMeshStandardMaterial) { o.material[0].aoMap = mur.tex; o.material[0].aoMapIntensity = 1; o.material[0].needsUpdate = true; }
    });
  }
  // la passe d'effets : la scène dans une cible MSAA (couleur + profondeur), puis un triangle plein écran
  function creerPost() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { samples: renderer.capabilities.isWebGL2 ? 4 : 0, type: THREE.UnsignedByteType });
    rt.texture.colorSpace = THREE.SRGBColorSpace; rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tCol: { value: rt.texture }, tProf: { value: rt.depthTexture }, px: { value: new THREE.Vector2() }, seuil: { value: 0.0015 }, contour: { value: 0.75 }, chaud: { value: 0.55 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tCol; uniform sampler2D tProf; uniform vec2 px; uniform float seuil; uniform float contour; uniform float chaud; varying vec2 vUv;
        vec3 versSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() {
          vec3 c = versSRGB(texture2D(tCol, vUv).rgb);
          // le contour cartoon : un saut de profondeur (caméra orthographique : profondeur linéaire) avec ses quatre voisins
          float d = texture2D(tProf, vUv).r, e = 0.0;
          e = max(e, abs(d - texture2D(tProf, vUv + vec2(px.x, 0.0)).r)); e = max(e, abs(d - texture2D(tProf, vUv - vec2(px.x, 0.0)).r));
          e = max(e, abs(d - texture2D(tProf, vUv + vec2(0.0, px.y)).r)); e = max(e, abs(d - texture2D(tProf, vUv - vec2(0.0, px.y)).r));
          float k = smoothstep(seuil, seuil * 2.5, e) * contour;
          c = mix(c, c * vec3(0.42, 0.32, 0.27), k);
          // la correction chaude : un peu de saturation, des ombres relevées vers le miel, des hautes lumières crème, une courbe douce
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 1.0 + 0.10 * chaud);
          c += chaud * vec3(0.030, 0.012, -0.012) * (1.0 - l);
          c *= mix(vec3(1.0), vec3(1.025, 1.0, 0.955), chaud);
          c = mix(c, c * c * (3.0 - 2.0 * c), 0.10 * chaud);
          // le vignettage, léger et chaud
          vec2 q = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(q * vec2(1.0, 0.75)));
          c *= mix(vec3(0.93, 0.90, 0.87), vec3(1.0), v);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = new THREE.Mesh(geo, mat); quad.frustumCulled = false; const sc = new THREE.Scene(); sc.add(quad); const cam = new THREE.Camera();
    return {
      rt, mat,
      rendre(hv) {
        const w = Math.round(W * DPR), h = Math.round(H * DPR);
        if (rt.width !== w || rt.height !== h) { rt.setSize(w, h); mat.uniforms.px.value.set(1 / w, 1 / h); }
        rt.scissorTest = hv < H; rt.scissor.set(0, Math.floor((H - hv) * DPR), w, Math.ceil(hv * DPR)); rt.viewport.set(0, 0, w, h);
        renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
        renderer.info.autoReset = false; renderer.render(sc, cam); renderer.info.autoReset = true; // les stats : la passe de la scène + 1 (comme sans effets, la passe d'ombre n'est pas comptée)
      },
      liberer() { rt.dispose(); rt.depthTexture.dispose(); mat.dispose(); geo.dispose(); },
    };
  }
  // ─── mise en route ───
  function init(canvas, ui) {
    cv = canvas; cvUi = ui; ctx2 = ui ? ui.getContext('2d') : null;
    if (typeof THREE === 'undefined' || !M || !MEUBLES || !PERSOS || !ctx2) return false; // Three.js absent (fichier non chargé) : la boutique vit sans image
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch (e) { renderer = null; return false; }
    const gl = renderer.getContext(); if (!gl) return false;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor('#F3D9C0');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'), nom = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const q = /[?&]qualite=(haute|moyenne|eco)/.exec(location.search);
    if (q) { QUAL.niveau = q[1]; QUAL.fixe = true; } else if (/SwiftShader|llvmpipe|Software/i.test(nom)) { QUAL.niveau = 'eco'; QUAL.fixe = true; } // un rendu logiciel reste en éco
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); perdu = performance.now(); });
    cv.addEventListener('webglcontextrestored', () => { perdu = 0; panneau(false); if (RICHE.post) { RICHE.post.liberer(); RICHE.post = null; } if (RICHE.env) { RICHE.env = null; if (RICHE.actif) scene.environment = envMap(); } toutRebatir(); });
    _c1 = new THREE.Color(); _c2 = new THREE.Color(); _v = new THREE.Vector3(); _b = new THREE.Box3();
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    hemi = new THREE.HemisphereLight('#DDF3FF', '#8C6F62', 1.3);
    dir = new THREE.DirectionalLight('#FFF4E0', 2.2); dir.castShadow = true; dir.shadow.mapSize.set(PALIERS[QUAL.niveau].ombres || 512, PALIERS[QUAL.niveau].ombres || 512); dir.shadow.bias = -0.0005; dir.shadow.normalBias = 1.5;
    scene.add(hemi, dir, dir.target);
    for (let k = 0; k < 3; k++) { const p = new THREE.PointLight('#FFD98A', 0, 1, 1); p.castShadow = false; lampes.push(p); scene.add(p); }
    ext.tex = new THREE.CanvasTexture(ext.cv); ext.tex.colorSpace = THREE.SRGBColorSpace; ext.tex.userData.partagee = true; // le paysage vit toute la partie
    richesse(QUAL.niveau);
    // les modèles Kenney (fournil/modeles/) : seulement sur la page du jeu (l'artefact n'a pas les fichiers à côté) ; prêts, tout le décor est rebâti avec eux
    if (typeof KENNEY !== 'undefined' && KENNEY && window.FOURNIL_ACCUEIL != null && !/[?&]kenney=0/.test(location.search)) KENNEY.charger('modeles/').then((ok) => { if (ok) toutRebatir(); });
    webgl = true; return true;
  }
  let tailleC = '';
  function resize(width, height, mi) {
    const t = `${width}x${height}x${mi}`; if (t === tailleC && LAY) return; tailleC = t; // même taille : rien à reconstruire
    W = width; H = height; V.resize(W, H, mi); LAY = V.LAY;
    if (!webgl) return;
    const p = PALIERS[QUAL.niveau]; DPR = Math.min(p.dpr, window.devicePixelRatio || 1);
    renderer.setPixelRatio(DPR); renderer.setSize(W, H, false); DPRui = Math.min(2, window.devicePixelRatio || 1); cvUi.width = Math.round(W * DPRui); cvUi.height = Math.round(H * DPRui);
    if (renderer.shadowMap.enabled !== (p.ombres > 0)) { renderer.shadowMap.enabled = p.ombres > 0; recompiler(); }
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
    const Zc = (H / 2 - LAY.murH) / SY;
    camera.position.set(W / 2, 1500 * SY, Zc + 1500 * CY); camera.up.set(0, 1, 0); camera.lookAt(W / 2, 0, Zc); camera.updateMatrixWorld();
    dir.position.set(W * 0.78, 900, Zc + 520); dir.target.position.set(W / 2, 0, Zc); dir.target.updateMatrixWorld();
    const sc = dir.shadow.camera; sc.left = -W * 0.75; sc.right = W * 0.75; sc.top = 650; sc.bottom = -650; sc.near = 10; sc.far = 3000; sc.updateProjectionMatrix();
    toutRebatir();
  }
  let visCible = 0, visFin = 0;
  function visible(y) { // le tiroir qui descend découvre la scène tout de suite ; celui qui monte ne la cache qu'à la fin de sa course (0,28 s)
    if (y >= visH) { visH = y; visFin = 0; } else { visCible = y; visFin = performance.now() + 320; }
  }
  const hauteurUtile = () => V.hauteurUtile();
  function setAmenager(on) { amenager = !!on; }
  const forcer = (o) => V.forcer(o);

  // ─── ce qui est construit : la salle, les meubles par cran, les petits décors conditionnels, les produits de la vitrine, le boulanger ───
  const cles = {}, groupes = {}, animes = [], lampes = []; let salle = null, boulangerG = null, ctxC = null, Qc = null, zonesCache = null, pool = new Map(); const acteurs = new Map();
  function toutRebatir() { for (const k of Object.keys(cles)) delete cles[k]; Qc = null; zonesCache = null; if (ext.tex) ext.tex.needsUpdate = true; ext.der = -1; } // tout le décor sera reconstruit à la frame suivante ; les personnages ne dépendent pas de la taille
  function remplacer(id, g) { // pose (ou retire) un groupe nommé, en libérant l'ancien
    const vieux = groupes[id]; if (vieux) { scene.remove(vieux); M.dispose(vieux); }
    groupes[id] = g || null; if (g) { habiller(g); scene.add(g); } zonesCache = null; RICHE.aoSale = true; recenserAnimes();
  }
  function recenserAnimes() { animes.length = 0; scene.traverse((o) => { if (o.userData && typeof o.userData.anime === 'function') animes.push(o); }); }
  const objet = (E, id) => !!(E.Q.objets && E.Q.objets.includes(id)); // les petits objets d'un quartier du parcours (GAME.QUARTIERS, theme.objets) : posés d'office
  const CONDS = [ // les petits décors : une clé par frame, reconstruits quand elle change (null : absent)
    { id: 'etagere', cle: (E) => `${Math.min(10, Math.floor(E.niv[0] / 10))}|${E.niv[6] > 0 ? 1 : 0}`, faire: (k, c) => { const [n, b] = k.split('|'); return MEUBLES.etagere(+n, b === '1', c); } },
    { id: 'cadre', cle: (E) => (E.niv[3] > 0 ? '1' : null), faire: (k, c) => MEUBLES.cadre(LAY.cadre.x, LAY.cadre.y, c) },
    { id: 'horloge', cle: () => '1', faire: (k, c) => MEUBLES.horloge(c) },
    { id: 'diplome', cle: (E) => (E.rang >= 2 ? '1' : null), faire: (k, c) => MEUBLES.diplome(c) },
    { id: 'plante', cle: (E) => (E.niv[1] > 0 || objet(E, 'plante') ? '1' : null), faire: (k, c) => MEUBLES.plante(LAY.plante.x, LAY.plante.y, c) },
    { id: 'sapin', cle: (E) => (E.tags.includes('noel') || objet(E, 'sapin') ? (REC.coupes.length ? 'd' : '1') : null), faire: (k, c) => MEUBLES.sapin(c, k === 'd') }, // la vitrine des trophées prend sa place : il se pousse à droite
    { id: 'trophees', cle: () => (REC.coupes.length && MEUBLES.trophees ? REC.coupes.join(',') : null), faire: (k, c) => MEUBLES.trophees(k.split(','), c) }, // toutes les coupes gagnées
    { id: 'coupe', cle: () => (REC.coupe && MEUBLES.coupe ? REC.coupe : null), faire: (k, c) => MEUBLES.coupe(k, c) }, // la coupe du dernier podium, sur le comptoir la semaine qui suit
    { id: 'plan', cle: () => '1', faire: (k, c) => MEUBLES.plan(c) },
    { id: 'presentoir', cle: (E) => (LAY.spread > 120 && E.niv[0] >= 20 ? String(Math.min(6, 2 + Math.floor(E.niv[0] / 25))) : null), faire: (k, c) => MEUBLES.presentoir(+k, c) },
    { id: 'ardoise', cle: (E) => (E.staffs >= 2 || objet(E, 'ardoise') ? '1' : null), faire: (k, c) => MEUBLES.ardoise(c) },
    { id: 'fleurs', cle: (E) => (E.bonus >= 3 || objet(E, 'fleurs') ? '1' : null), faire: (k, c) => MEUBLES.fleurs(c) },
    { id: 'paillasson', cle: (E) => (E.crans.deco >= 1 ? 'c' : 'n'), faire: (k, c) => MEUBLES.paillasson(k === 'c', c) },
    { id: 'guirlande', cle: (E) => ((E.crans.deco < 3 && (E.niv[5] > 0 || E.rush || E.tags.includes('noel'))) || objet(E, 'guirlande') ? (E.tags.includes('noel') ? 'noel' : 'g') : null), faire: (k, c) => MEUBLES.guirlande(k === 'noel', c) },
    { id: 'fanions', cle: (E) => (E.tags.includes('fete') || objet(E, 'fanions') ? '1' : null), faire: (k, c) => MEUBLES.fanions(c) },
    { id: 'coeurs', cle: (E) => (E.tags.includes('coeurs') ? '1' : null), faire: (k, c) => MEUBLES.coeurs(c) },
    { id: 'saison', cle: (E) => { const r = E.st.saison; if (r && r.niv > 0 && PERSOS.patisserieSaison) return 'recette:' + r.id; return E.tags.includes('halloween') ? 'halloween' : E.tags.includes('galette') ? 'galette' : E.tags.includes('paques') ? 'paques' : E.tags.includes('ete') && !E.tags.includes('fete') ? 'ete' : null; },
      faire: (k, c) => { if (!k.startsWith('recette:')) return MEUBLES.propSaison(k, c); const o = MEUBLES.surDessus(c, LAY.saison), g = new THREE.Group(), m = PERSOS.patisserieSaison(k.slice(8)).clone(); m.scale.setScalar(1.15); g.add(m); g.position.set(o.x, o.y, o.z); return g; } }, // la recette de saison préparée, posée sur le comptoir
    { id: 'lampe', cle: (E) => (E.niv[2] > 0 || objet(E, 'lampe') ? '1' : null), faire: (k, c) => MEUBLES.lampe(c) },
    // les décos de l'événement « Le Quartier » (src/quartier.js, gagnées aux paliers, à vie) : le tag sur la porte, l'enseigne néon, le chien ; le scooter est peint dehors (peindreExterieur)
    { id: 'graffiti', cle: () => (QDECO.graffiti && MEUBLES.graffiti ? '1' : null), faire: (k, c) => MEUBLES.graffiti(c) },
    { id: 'neon', cle: () => (QDECO.neon && MEUBLES.neon ? '1' : null), faire: (k, c) => MEUBLES.neon(c) },
    // le chien : couché dans son coin, SAUF quand il est le compagnon de la boutique (« chien-quartier », GAME.COMPAGNONS) : c'est le même
    // chien, il s'est levé pour te suivre ; pas deux chiens identiques dans la salle. Un autre compagnon choisi : il retourne se coucher.
    { id: 'chien', cle: () => (QDECO.chien && MEUBLES.chien && modeleComp !== 'chien-quartier' ? '1' : null), faire: (k, c) => MEUBLES.chien(c) },
    // les décos de la Maison hantée (src/hantee.js, gagnées aux paliers, à vie) : citrouilles-lanternes, toiles d'araignée, chaudron, petit fantôme
    ...['citrouilles', 'toiles', 'chaudron', 'fantome'].map((id) => ({ id: 'ht-' + id, cle: () => (HDECO[id] && MEUBLES[id] ? '1' : null), faire: (k, c) => MEUBLES[id](c) })),
    // le badge « Esprit d'équipe » (l'objectif commun de la semaine réussi, classement v6) : une rosette accrochée au mur, à vie ; absent pour qui ne l'a pas
    { id: 'equipe', cle: () => (REC.equipe ? '1' : null), faire: (k, c) => rosetteEquipe(c) },
    // le standing de la boutique (GAME.standing, palier 1 à 5) : ses objets (Q.objets) en un maillage (la lueur du soir en plus) ; en haute, ses modèles cuits (lots luxe*)
    { id: 'standing', cle: (E) => (E.Q.standing && MEUBLES.standing ? `${E.Q.standing}|${luxePret(E.Q.standing) ? 'hd' : ''}|${HDECO.chaudron ? 'c' : ''}|${typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret ? 'k' : ''}` : null), faire: (k, c) => MEUBLES.standing(c) },
  ];
  // les lots HD du standing nécessaires à un palier (src/hd.js : luxe1, luxe3, luxe5), et s'ils sont tous là (et la HD permise)
  const lotsLuxe = (s) => ['luxe1', 'luxe3', 'luxe5'].filter((l, i) => s >= [1, 3, 5][i]);
  const luxePret = (s) => typeof HDM !== 'undefined' && HDM.permis(renderer) && lotsLuxe(s).every((l) => HDM.pret(l));
  function rosetteEquipe(c) { // une cocarde : disque doré, cœur crème, deux rubans menthe et lavande ; une seule maille
    const K = V.K, h = c.LAY.horloge, dp = c.LAY.diplome, g = new THREE.Group(), P = M.part, ys = h.y + 6 * K; // entre l'horloge et le diplôme, à côté de la tête du boulanger
    g.userData.nom = 'equipe'; g.position.set((h.x + dp.x) / 2 - 2 * K, c.wy(c.LAY.murH - ys), 1.5); g.scale.set(1, 1 / CY, 1); // étirée pour paraître ronde à l'écran (comme l'horloge)
    const r = 7 * K, HP = Math.PI / 2;
    g.add(M.maille([
      P(M.boite(4 * K, 12 * K, 1, 0.4), '#5FD3A4', { x: -3.4 * K, y: -r - 6 * K, rz: 0.3 }), P(M.boite(4 * K, 12 * K, 1, 0.4), '#9A84F0', { x: 3.4 * K, y: -r - 6 * K, rz: -0.3 }),
      P(M.cylindre(r, r, 1.6, 14), '#FFC84A', { rx: HP }), P(M.cylindre(r * 0.66, r * 0.66, 1.2, 14), '#FFF3C4', { rx: HP, z: 1 }), P(M.sphere(r * 0.3, 8), '#E1496C', { z: 2.4, sz: 0.5 }),
    ], { ombre: false }));
    return g;
  }
  const MEUBLES_IDS = ['froid', 'four', 'comptoir', 'caisse', 'tables', 'deco', 'bar', 'banquette', 'terrasse'];
  const SALLE_IDS = ['tables', 'bar', 'banquette', 'terrasse']; // les meubles de la salle : KayKit en haute et moyenne (lot HD « boutique »), faits main en éco
  // les récompenses du podium du classement (src/classement.js) : la tenue du boulanger, la coupe du comptoir, les coupes de la vitrine
  const REC = { tenue: null, coupe: null, coupes: [], equipe: false }, METAUX = ['or', 'argent', 'bronze'];
  const QDECO = { graffiti: false, neon: false, scooter: false, chien: false }; // les décos du quartier posées dans la boutique
  function decosQuartier(liste) { const l = Array.isArray(liste) ? liste : []; for (const k of Object.keys(QDECO)) QDECO[k] = l.includes(k); ext.der = -1; }
  const HDECO = { citrouilles: false, toiles: false, chaudron: false, fantome: false }; // les décos de la Maison hantée posées dans la boutique (d'autres noms : ignorés)
  const ALIAS_HT = { citrouille: 'citrouilles', lanternes: 'citrouilles', toile: 'toiles', araignees: 'toiles', chaudrons: 'chaudron', fantomes: 'fantome' };
  function decosHantee(liste) { const l = (Array.isArray(liste) ? liste : []).map((k) => ALIAS_HT[k] || k); for (const k of Object.keys(HDECO)) HDECO[k] = l.includes(k); }
  // le compagnon de la boutique (GAME.COMPAGNONS : le chat roux, le chat noir, le chien… le mini-dragon ; ui.js dit lequel, noir d'office pour
  // un chat pendant la Maison hantée) ; changé, l'ancien est libéré (son tampon d'instances) et le nouveau bâti à l'image suivante
  let modeleComp = 'chat-roux';
  function compagnon(id) { const n = typeof id === 'string' && id ? id : 'chat-roux'; if (n === modeleComp) return; modeleComp = n; if (chatG) { scene.remove(chatG); (PERSOS.libererChat || M.dispose)(chatG); chatG = null; } }
  function pelageChat(p) { compagnon(p === 'noir' ? 'chat-noir' : 'chat-roux'); } // l'ancien réglage : un des deux chats
  function recompenses(o) {
    o = o || {};
    REC.tenue = METAUX.includes(o.tenue) ? o.tenue : null; REC.coupe = METAUX.includes(o.coupe) ? o.coupe : null;
    REC.coupes = Array.isArray(o.coupes) ? o.coupes.filter((m) => METAUX.includes(m)).slice(-200) : [];
    REC.equipe = o.equipe === true; // le badge « Esprit d'équipe »
  }
  function contexte(E) {
    const c = ctxC || (ctxC = { wz, wy, wd, SY, CY });
    c.trophees = REC.coupes.length > 0; // la vitrine des trophées décroche le second cadre
    c.hd = typeof HDM !== 'undefined' && HDM.pret('boutique') && HDM.permis(renderer); // les meubles de la salle en KayKit
    c.hdLuxe = !!(E.Q.standing && luxePret(E.Q.standing)); c.chaudron = HDECO.chaudron; // le standing : ses modèles cuits ; le coin du chaudron
    c.LAY = LAY; c.K = V.K; c.W = W; c.H = H; c.Q = E.Q; c.tags = E.tags; c.rush = E.rush; c.t = E.t; c.sk = E.sk; c.crans = E.crans; c.niv = E.niv; c.staffs = E.staffs; c.bonus = E.bonus; c.rang = E.rang;
    const cp = groupes.comptoir; c.dessusY = cp ? cp.userData.dessusY : wy(LAY.comptoir.hFace); c.dessusZ = cp ? cp.userData.dessusZ : wz(LAY.comptoir.y + LAY.comptoir.hTop + LAY.comptoir.hFace) - wd(LAY.comptoir.hTop) / 2;
    return c;
  }
  // les pâtisseries de la vitrine prises dans le Food Kit quand il est là (baguette, croissant, tarte aux pommes) ; les autres restent celles de PERSOS
  const VITRINE_MAX = 8; // la vitrine montre huit recettes au plus (depuis les recettes de boutique, il y en a seize) : les plus avancées
  const PAT_K = { 0: ['loaf-baguette', 0.5], 1: ['croissant', 0.4], 3: ['pie', 0] }, patK = new Map();
  function patisserieK(i) {
    const d = PAT_K[i]; if (!d || typeof KENNEY === 'undefined' || !KENNEY || !KENNEY.pret) return null;
    let m = patK.get(i); if (m) return m;
    const T = PERSOS.TAILLE_PATISSERIE || 16, dm = KENNEY.dims(d[0]), k = T * (i === 0 ? 1.15 : 1) / Math.max(dm.w, dm.d);
    m = M.mesh(M.assembler([KENNEY.part(d[0], { s: k, ry: d[1] })]), M.MAT.vertex); m.geometry.userData.cache = true; m.userData.i = i; patK.set(i, m); return m;
  }
  function construire(E) {
    const c = contexte(E), base = `${E.Q.id}|${W}x${H}`;
    const rs = E.st.saison && E.st.saison.niv > 0 && PERSOS.patisserieSaison ? E.st.saison.id : '', ouverts = E.niv.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0).slice(-VITRINE_MAX); // les plus avancées, si elles ne tiennent pas toutes
    c.nVitrine = ouverts.length + (rs ? 1 : 0); // la recette de saison a sa place : étagères, étiquettes et places sur le même compte
    if (Qc !== E.Q) { Qc = E.Q; renderer.setClearColor(E.Q.sol); salle = MEUBLES.salle(c); remplacer('salle', salle); }
    for (const id of MEUBLES_IDS) { // les neuf meubles (le comptoir porte la vitrine), reconstruits quand leur cran change
      const cran = E.crans[id === 'comptoir' ? 'vitrine' : id] || 0, k = `${cran}|${base}${id === 'tables' ? '|' + E.crans.deco : ''}${SALLE_IDS.includes(id) && c.hd ? '|hd' : ''}${id === 'deco' && E.tags.includes('noel') ? '|noel' : ''}${id === 'deco' && c.trophees ? '|trophees' : ''}${id === 'comptoir' ? '|' + c.nVitrine : ''}`;
      if (cles[id] !== k) { cles[id] = k; remplacer(id, MEUBLES[id](cran, c)); if (id === 'comptoir') { cles.produits = null; cles.caisse = null; const cp = groupes.comptoir; if (cp && cp.userData.dessusY != null) { c.dessusY = cp.userData.dessusY; c.dessusZ = cp.userData.dessusZ; } } }
    }
    for (const d of CONDS) { const k = d.cle(E), kk = k == null ? null : `${k}|${base}`; if (cles[d.id] !== kk) { cles[d.id] = kk; remplacer(d.id, kk == null ? null : d.faire(k, c)); } }
    const kc = `${LAY.sieges.length}|${V.K}|${typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret ? 'k' : ''}`; // les couverts : un maillage instancié pour toutes les places
    if (cles.couverts !== kc) { cles.couverts = kc; couvertsCle = ''; remplacer('couverts', MEUBLES.couverts(LAY.sieges.length, c)); }
    const kp = `${ouverts.join(',')}|${rs}|${E.crans.vitrine}|${base}`;
    if (cles.produits !== kp) { // les pâtisseries dans la vitrine
      cles.produits = kp; const g = new THREE.Group(), vit = groupes.comptoir && groupes.comptoir.userData.vitrine, liste = rs ? ouverts.concat([rs]) : ouverts, places = vit ? vit.places(liste.length) : [];
      liste.forEach((i, k) => { const p = places[k]; if (!p) return; const m = (typeof i === 'string' ? PERSOS.patisserieSaison(i) : patisserieK(i) || PERSOS.patisserie(i)).clone(); const s = (p.s || 16) / (PERSOS.TAILLE_PATISSERIE || 16); m.position.set(p.x, p.y, p.z); m.scale.setScalar(s); m.castShadow = false; g.add(m); });
      remplacer('produits', g);
    }
    const garde = G.tenueBoulanger(E.st), kb = `${E.rang}|${garde.cle}|${base}`; // le boulanger porte ce que la garde-robe équipe (REC.tenue, l'ancienne tenue du podium, ne décide plus)
    if (cles.boulanger !== kb) { cles.boulanger = kb; boulangerG = PERSOS.boulanger(E.rang, garde); boulangerG.userData.yaw = 0; boulangerG.position.set(LAY.boulanger.x, 0, wz(LAY.boulanger.y)); boulangerG.scale.setScalar(0.9 * V.K); boulangerG.updateMatrixWorld(true); boulangerG.userData.zoneBoite = new THREE.Box3().setFromObject(boulangerG, true); remplacer('boulanger', boulangerG); } // la zone de touche : la pose de repos
  }

  // ─── la lumière : cinq phases du ciel, fondues autour de chaque borne ; les lampes la nuit ; le coup de feu réchauffe ───
  const PHASES = { // des teintes douces : le dessin d'origine ne posait qu'un voile de 8 à 22 %
    nuit: { hemi: ['#A3ADE0', '#3A3248', 0.9], dir: ['#B0BEFF', 0.55], lampes: 1, tache: 0.0 },
    aube: { hemi: ['#FFF0E6', '#8C6F62', 1.2], dir: ['#FFE0C8', 1.9], lampes: 0.2, tache: 0.06 },
    jour: { hemi: ['#DDF3FF', '#8C6F62', 1.3], dir: ['#FFF4E0', 2.2], lampes: 0, tache: 0.10 },
    soir: { hemi: ['#FFEADB', '#7A5C4E', 1.15], dir: ['#FFCE9E', 1.9], lampes: 0.4, tache: 0.05 },
    crepuscule: { hemi: ['#E4DAF6', '#4A3E58', 1.0], dir: ['#D6C6FF', 1.2], lampes: 1, tache: 0.02 },
  };
  const BORNES = [[6, 'nuit', 'aube'], [8, 'aube', 'jour'], [18, 'jour', 'soir'], [20, 'soir', 'crepuscule'], [21, 'crepuscule', 'nuit']];
  let _c1, _c2, lampesNiv = 0;
  function eclairer(E) {
    let a = E.sk.phase, b = a, k = 0;
    for (const [h, p, q] of BORNES) { const d = E.hour - h; if (Math.abs(d) < 0.25) { a = p; b = q; k = (d + 0.25) / 0.5; } }
    const A = PHASES[a], B = PHASES[b], mix = (u, v) => u + (v - u) * k;
    hemi.color.set(A.hemi[0]).lerp(_c1.set(B.hemi[0]), k); hemi.groundColor.set(A.hemi[1]).lerp(_c1.set(B.hemi[1]), k); hemi.intensity = mix(A.hemi[2], B.hemi[2]);
    dir.color.set(A.dir[0]).lerp(_c1.set(B.dir[0]), k); dir.intensity = mix(A.dir[1], B.dir[1]);
    if (E.rush) { hemi.color.lerp(_c2.set('#FFF0E0'), 0.5); dir.intensity *= 1.1; }
    if (RICHE.actif) { RICHE.envK = RICHE.kEnv * hemi.intensity / 1.3 * (1 - 0.55 * mix(A.lampes, B.lampes)); hemi.intensity *= RICHE.kHemi; dir.intensity *= RICHE.kDir; if (RICHE.post) RICHE.post.mat.uniforms.chaud.value = RICHE.chaud * (1 - 0.6 * mix(A.lampes, B.lampes)); } // l'ambiance vient surtout de la pièce (PMREM) ; le ciel ne fait plus que teinter
    lampesNiv = mix(A.lampes, B.lampes);
    const coin = (E.crans.banquette || 0) >= 3, salon = coin || (E.crans.deco >= 4 && E.crans.tables > 0), tb = LAY.tables, allumees = [E.crans.deco >= 2, E.crans.deco >= 2, E.niv[2] > 0 || salon];
    const lp = LAY.banquette.lampe, pos = [[LAY.appliques[0].x, wy(LAY.murH - LAY.appliques[0].y), 18], [LAY.appliques[1].x, wy(LAY.murH - LAY.appliques[1].y), 18], coin ? [lp.x, 54, wz(lp.y)] : salon ? [tb[1].x, 60, wz((tb[0].y + tb[3].y) / 2)] : [LAY.lampe.x, wy(LAY.murH - LAY.lampe.y) - 10, 20]]; // le soir, la lampe du coin salon (ou le salon de thé)
    lampes.forEach((p, i) => { p.position.set(pos[i][0], pos[i][1], pos[i][2]); p.distance = W * 0.9; p.intensity = allumees[i] ? 150 * lampesNiv : 0; });
    const taches = salle && salle.userData.taches; if (taches) for (const m of taches) m.material.opacity = mix(A.tache, B.tache);
    const mm = salle && salle.userData.murMat; if (mm) { mm.emissive.copy(hemi.color); mm.emissiveIntensity = 0.42 * hemi.intensity / 1.3; const mj = RICHE.jumeaux.get(mm); if (mj) { mj.emissive.copy(hemi.color); mj.emissiveIntensity = RICHE.actif ? 0.42 * (hemi.intensity / RICHE.kHemi) / 1.3 * RICHE.lueurMur : mm.emissiveIntensity; } } // le mur suit la lumière (sa lueur compense les faces verticales, pas la nuit)
  }

  // ─── dehors : une texture repeinte dix fois par seconde, vue par la fenêtre et la porte ───
  const ext = { cv: document.createElement('canvas'), tex: null, der: -1, phase: '' };
  ext.cv.width = 512; ext.cv.height = 256;
  function peindreExterieur(now, E) {
    const plan = salle && salle.userData.exterieur; if (!plan) return;
    if (plan.material.map !== ext.tex) { plan.material.map = ext.tex; plan.material.color.set('#FFFFFF'); plan.material.needsUpdate = true; }
    if (ext.der >= 0 && now - ext.der < 100 && ext.phase === E.sk.phase + E.Q.id) return;
    ext.der = now; ext.phase = E.sk.phase + E.Q.id;
    const x = ext.cv.getContext('2d'), w = ext.cv.width, h = ext.cv.height, sk = E.sk, t = E.t;
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, sk.haut); g.addColorStop(1, sk.bas); x.fillStyle = g; x.fillRect(0, 0, w, h);
    // la texture couvre le plan extérieur, de fenetre.x − 40 à porte.x + porte.w + 40 : chaque ouverture voit un paysage complet
    const f = LAY.fenetre, p = LAY.porte, x0 = f.x - 40, x1 = p.x + p.w + 40, u = (X) => (X - x0) / (x1 - x0) * w;
    const zones2 = [[u(f.x - 24), u(f.x + f.w + 24)], [u(p.x - 16), u(p.x + p.w + 16)]];
    for (const [a, b] of zones2) { const fw = b - a, fh = h * 0.86; vueCiel(x, a, 0, fw, fh, sk, t); vue(x, a, 0, fw, fh, sk, t, E.Q.vue); }
    const [a, b] = zones2[0], fw = b - a, solY = h * 0.86 - 4;
    for (const pa of V.passants) passant(x, a + pa.u * fw, solY, pa);
    if (QDECO.scooter) scooter(x, a + fw * 0.74, solY + 2, fw / 130, sk.nuit); // le scooter du quartier, garé devant la boutique (la porte est sous les icônes du coin : on le voit par la fenêtre)
    for (const fl of V.flocons) { const fx = a + fl.u * fw, fy = fl.v * h * 0.86; if (fl.type === 'neige') { x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(fx, fy, fl.r * 1.6, 0, TAU); x.fill(); } else { x.save(); x.translate(fx, fy); x.rotate(fl.a); x.fillStyle = fl.type === 'feuilles' ? '#E07B39' : '#FFB3C7'; x.beginPath(); x.ellipse(0, 0, 5, 3, 0, 0, TAU); x.fill(); x.restore(); } }
    ext.tex.needsUpdate = true;
  }
  function vueCiel(x, fx, fy, fw, fh, sk, t) {
    if (sk.nuit) { x.fillStyle = '#FFF4C2'; for (let i = 0; i < 9; i++) { x.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + i); x.beginPath(); x.arc(fx + 6 + ((i * 37) % (fw - 12)), fy + 4 + ((i * 23) % (fh * 0.45)), 2, 0, TAU); x.fill(); } x.globalAlpha = 1; x.beginPath(); x.arc(fx + fw * 0.75, fy + fh * 0.28, 11, 0, TAU); x.fill(); x.fillStyle = sk.haut; x.beginPath(); x.arc(fx + fw * 0.75 + 5, fy + fh * 0.28 - 3, 9, 0, TAU); x.fill(); }
    else if (sk.phase !== 'crepuscule') { x.fillStyle = sk.phase === 'soir' ? '#FFD36B' : '#FFE27A'; x.beginPath(); x.arc(fx + fw * 0.78, fy + fh * (sk.phase === 'soir' ? 0.5 : 0.25), 11, 0, TAU); x.fill(); }
    if (!sk.nuit) { x.fillStyle = 'rgba(255,255,255,.85)'; const cx = fx + fw * 0.3 + Math.sin(t * 0.05) * 10; for (const [ox, oy, r] of [[0, 0, 11], [13, -4, 13], [26, 2, 9], [9, 7, 9]]) { x.beginPath(); x.arc(cx + ox, fy + fh * 0.36 + oy, r, 0, TAU); x.fill(); } }
  }
  function vue(ctx, fx, fy, fw, fh, sk, t, v) { // le paysage du quartier, repris du dessin 2D
    const nuit = sk.nuit, bas = fy + fh, rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    if (v === 'campagne') {
      ctx.fillStyle = nuit ? '#3E6B4A' : '#7FD08C'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.25, bas + 6, fw * 0.5, fh * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = nuit ? '#2F5A3C' : '#5FBE73'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.8, bas + 8, fw * 0.5, fh * 0.34, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8B5A3C'; ctx.fillRect(fx + fw * 0.68, bas - fh * 0.3, 5, fh * 0.14); ctx.fillStyle = nuit ? '#2F6B45' : '#4FAF62'; ctx.beginPath(); ctx.arc(fx + fw * 0.69, bas - fh * 0.34, fh * 0.11, 0, TAU); ctx.fill();
    } else if (v === 'paris') {
      const cols = nuit ? ['#3B4252', '#4A5368', '#2F3647'] : ['#B9C2D1', '#CBD2DD', '#A6AFBF'];
      [[0, 0.3, 0.5], [0.28, 0.26, 0.62], [0.52, 0.3, 0.46], [0.8, 0.22, 0.56]].forEach(([u, w, h], k) => { const x = fx + fw * u, bw = fw * w, bh = fh * h; ctx.fillStyle = cols[k % 3]; ctx.fillRect(x, bas - bh, bw, bh); ctx.fillStyle = '#6B7280'; ctx.beginPath(); ctx.moveTo(x - 2, bas - bh); ctx.lineTo(x + bw * 0.15, bas - bh - 8); ctx.lineTo(x + bw * 0.85, bas - bh - 8); ctx.lineTo(x + bw + 2, bas - bh); ctx.fill(); ctx.fillStyle = nuit ? '#F7D774' : '#E8EDF3'; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if ((r + c + k) % 3 !== 0) ctx.fillRect(x + 4 + c * bw * 0.3, bas - bh + 6 + r * bh * 0.28, 4, 5); });
      ctx.strokeStyle = nuit ? '#D8C08A' : '#6B7280'; ctx.lineWidth = 2.4; const tx = fx + fw * 0.9, th = fh * 0.62; ctx.beginPath(); ctx.moveTo(tx - 10, bas); ctx.quadraticCurveTo(tx - 2, bas - th * 0.6, tx, bas - th); ctx.quadraticCurveTo(tx + 2, bas - th * 0.6, tx + 10, bas); ctx.moveTo(tx - 6, bas - th * 0.45); ctx.lineTo(tx + 6, bas - th * 0.45); ctx.stroke();
    } else if (v === 'mer') {
      const hz = fy + fh * 0.55; const g = ctx.createLinearGradient(0, hz, 0, bas); g.addColorStop(0, nuit ? '#2B4C7E' : '#3A86C8'); g.addColorStop(1, nuit ? '#1E3558' : '#5FB2E6'); ctx.fillStyle = g; ctx.fillRect(fx, hz, fw, bas - hz);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let x = 0; x <= fw; x += 6) ctx.lineTo(fx + x, hz + 10 + k * 12 + Math.sin(x * 0.15 + t * 2 + k) * 2.5); ctx.stroke(); }
      const bx = fx + fw * (0.5 + 0.3 * Math.sin(t * 0.15)); ctx.fillStyle = '#8B5A3C'; ctx.beginPath(); ctx.moveTo(bx - 14, hz + 5); ctx.lineTo(bx + 14, hz + 5); ctx.lineTo(bx + 9, hz + 12); ctx.lineTo(bx - 9, hz + 12); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(bx, hz + 3); ctx.lineTo(bx, hz - 18); ctx.lineTo(bx + 12, hz + 3); ctx.fill();
      ctx.strokeStyle = nuit ? '#D0D8E0' : '#5B6770'; ctx.lineWidth = 2.4; const gx = fx + fw * (0.35 + 0.1 * Math.sin(t * 0.5)), gy = fy + fh * 0.3 + Math.sin(t * 1.3) * 5; ctx.beginPath(); ctx.moveTo(gx - 9, gy); ctx.quadraticCurveTo(gx - 4.5, gy - 6, gx, gy); ctx.quadraticCurveTo(gx + 4.5, gy - 6, gx + 9, gy); ctx.stroke();
      ctx.fillStyle = nuit ? '#C9B98F' : '#F2DFB5'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.2, bas + 2, fw * 0.3, fh * 0.1, 0, 0, TAU); ctx.fill();
    } else if (v === 'montagne') {
      for (const [u, w, h, col] of [[0.3, 0.55, 0.78, nuit ? '#5B6A8A' : '#9CA8C4'], [0.75, 0.6, 0.62, nuit ? '#4A5878' : '#8792B0']]) { const px = fx + fw * u, pw = fw * w, ph = fh * h; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px - pw / 2, bas); ctx.lineTo(px, bas - ph); ctx.lineTo(px + pw / 2, bas); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(px - pw * 0.14, bas - ph * 0.72); ctx.lineTo(px, bas - ph); ctx.lineTo(px + pw * 0.14, bas - ph * 0.72); ctx.lineTo(px + pw * 0.05, bas - ph * 0.66); ctx.lineTo(px - pw * 0.05, bas - ph * 0.66); ctx.fill(); }
      ctx.fillStyle = nuit ? '#1F3A2C' : '#2F6B4F'; for (const u of [0.1, 0.22, 0.6, 0.9]) { const px = fx + fw * u; ctx.beginPath(); ctx.moveTo(px - 10, bas); ctx.lineTo(px, bas - fh * 0.26); ctx.lineTo(px + 10, bas); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.5, bas + 4, fw * 0.6, fh * 0.08, 0, 0, TAU); ctx.fill();
    } else { // la grande ville
      const cols = nuit ? ['#20222F', '#2B2E3F', '#181A26'] : ['#8A93A8', '#A3ABBF', '#737C92'];
      [[0, 0.2, 0.7], [0.18, 0.16, 0.92], [0.34, 0.22, 0.6], [0.56, 0.18, 0.84], [0.74, 0.26, 0.66]].forEach(([u, w, h], k) => { const x = fx + fw * u, bw = fw * w, bh = fh * h; ctx.fillStyle = cols[k % 3]; ctx.fillRect(x, bas - bh, bw, bh); for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) { const lit = (nuit || sk.phase === 'soir') && ((r * 2 + c + k) % 3 !== 0); ctx.fillStyle = lit ? (c ? '#FFE9A8' : '#FFD36B') : 'rgba(255,255,255,.25)'; ctx.fillRect(x + 4 + c * bw * 0.5, bas - bh + 6 + r * bh * 0.18, 4, 5); } });
      ctx.fillStyle = Math.sin(t * 4) > -0.2 ? '#FF6B8B' : '#B14A5F'; rr(fx + fw * 0.36, bas - fh * 0.5, fw * 0.18, 8, 3); ctx.fill();
    }
  }
  function scooter(x, cx, y, s, nuit) { // un scooter de livraison, de profil, garé devant la porte : deux roues, le plancher, la selle, le guidon, le top-case
    x.save(); x.translate(cx, y); x.scale(s, s); x.lineJoin = 'round'; x.lineCap = 'round';
    x.fillStyle = L; for (const wx of [-22, 22]) { x.beginPath(); x.arc(wx, -8, 8, 0, TAU); x.fill(); x.fillStyle = '#8C8C8C'; x.beginPath(); x.arc(wx, -8, 3.5, 0, TAU); x.fill(); x.fillStyle = L; }
    x.fillStyle = '#E1496C'; x.beginPath(); x.moveTo(-14, -12); x.lineTo(12, -12); x.lineTo(18, -24); x.lineTo(24, -26); x.lineTo(26, -30); x.lineTo(14, -30); x.lineTo(6, -20); x.lineTo(-10, -20); x.lineTo(-18, -30); x.lineTo(-30, -30); x.lineTo(-28, -22); x.lineTo(-20, -14); x.closePath(); x.fill();
    x.fillStyle = L; x.beginPath(); x.roundRect(-16, -34, 16, 5, 2.5); x.fill(); // la selle
    x.strokeStyle = L; x.lineWidth = 2.5; x.beginPath(); x.moveTo(22, -28); x.lineTo(28, -40); x.moveTo(23, -40); x.lineTo(33, -40); x.stroke(); // le guidon
    x.fillStyle = nuit ? '#FFE27A' : '#FFF3C4'; x.beginPath(); x.arc(27, -24, 3.2, 0, TAU); x.fill(); // le phare
    x.fillStyle = '#5FD3A4'; x.beginPath(); x.roundRect(-34, -48, 20, 14, 3); x.fill(); x.fillStyle = '#fff'; x.fillRect(-30, -43, 12, 2.2); // le top-case
    x.restore();
  }
  function passant(x, px, y, p) { const s = p.s * 1.7; x.fillStyle = p.col; x.globalAlpha = 0.85; x.beginPath(); x.roundRect(px - 5 * s, y - 20 * s, 10 * s, 14 * s, 4 * s); x.fill(); x.beginPath(); x.arc(px, y - 24 * s, 4.5 * s, 0, TAU); x.fill(); const j = Math.sin(p.phase) * 3 * s; x.fillRect(px - 4 * s + j, y - 6 * s, 3 * s, 6 * s); x.fillRect(px + 1 * s - j, y - 6 * s, 3 * s, 6 * s); x.globalAlpha = 1; }

  // ─── les personnages : un groupe par client ou apprenti, pris dans un pool par apparence, posé là où VIE les met ───
  const YAW = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI }, vus = new Set(), oAnim = {};
  const angleCourt = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const cleClient = (c) => `${c.haut}|${c.peau}|${c.cheveux}|${c.coiffure}|${c.bonnet}|${c.lunettes ? 1 : 0}|${c.or ? 1 : 0}|${c.mariniere ? 1 : 0}|${c.hab || ''}`;
  function prendre(cle, fabrique) { const l = pool.get(cle); if (l && l.length) return l.pop(); const g = fabrique(); g.userData.cle = cle; g.userData.yaw = 0; return g; }
  function rendreAuPool(g) { const k = g.userData.cle; if (!/^apprenti/.test(k)) { M.dispose(g); return; } const l = pool.get(k) || []; if (l.length < 1) { l.push(g); pool.set(k, l); } else M.dispose(g); } // les clients sont presque tous uniques : on les libère ; un apprenti par produit est gardé
  // ─── les décors HD (src/hd.js) : chargés après le premier rendu si le palier le permet ; la boutique garde ses personnages ───
  let hdDecor = null, hdCle = '', hdDemande = false;
  // des plantes, des bocaux sur le plan de travail ; en octobre, des citrouilles
  function decorHD(E) {
    if (!HDM.permis(renderer)) { if (hdDecor) { scene.remove(hdDecor); M.dispose(hdDecor); hdDecor = null; hdCle = ''; } return; } // repassé en éco : on retire
    const k = `${W}x${H}|${LAY.bar.y | 0}|${E.tags.includes('halloween') ? 'h' : ''}|${Object.keys(cles).length}|s${E.Q.standing || 0}`; // le palier du standing : la scène change, on repose
    if (k === hdCle) return; hdCle = k;
    if (hdDecor) { scene.remove(hdDecor); M.dispose(hdDecor); }
    const g = hdDecor = new THREE.Group(), S = W * 0.08, K = V.K, pose = (nom, x, y, z, o = {}) => { const m = HDM.modele(nom, S * (o.s || 1), o); if (m) { m.position.set(x, y, z); g.add(m); } return m; };
    // (les meubles de la salle, la lampe du coin salon comprise, sont des meubles KayKit fusionnés : MEUBLES.tables, bar, banquette, terrasse)
    pose('cactus_medium_A', LAY.entree.x - 34 * K, 0, wz(LAY.murH + 14 * K), { s: 0.6 }); // une plante près de la porte
    pose('cactus_small_A', LAY.comptoir.x + 8 * K, wy(LAY.comptoir.hFace + LAY.comptoir.hTop * 0.5), wz(LAY.comptoir.y + LAY.comptoir.hTop * 0.6), { s: 0.4 }); // un petit cactus sur le comptoir
    const pl = LAY.plan; pose('jar_A_large', pl.x + pl.w * 0.25, wy(pl.h * 0.55), wz(pl.y + pl.h * 0.6), { s: 0.25 }); pose('jar_B_medium', pl.x + pl.w * 0.45, wy(pl.h * 0.55), wz(pl.y + pl.h * 0.6), { s: 0.25 });
    if (E.tags.includes('halloween')) { pose('pumpkin_orange_jackolantern', LAY.entree.x - 30 * K, 0, wz(LAY.murH + 22 * K), { s: 0.45 }); pose('pumpkin_orange', LAY.entree.x - 48 * K, 0, wz(LAY.murH + 30 * K), { s: 0.35 }); pose('pumpkin_yellow_small', LAY.devanture.porte.x1 + 9 * K, 0, wz(LAY.devanture.y + 9 * K), { s: 0.6 }); /* dehors, à droite de la porte */ }
    habiller(g); scene.add(g);
  }
  function synchroniser(E, dt) {
    vus.clear();
    for (const c of V.clients) {
      let g = acteurs.get(c.id);
      if (!g) { g = prendre(cleClient(c), () => PERSOS.creer({ haut: c.haut, peau: c.peau, cheveux: c.cheveux, coiffure: c.coiffure, bonnet: c.bonnet, lunettes: c.lunettes, or: c.or, mariniere: c.mariniere, sac: true, sacCol: c.sacCol, taille: c.taille })); g.userData.yaw = YAW[c.dir] || 0; habiller(g); scene.add(g); acteurs.set(c.id, g); }
      vus.add(c.id); poser(g, c, E, dt);
    }
    for (const a of V.apprentis) {
      const id = 'a' + a.i; let g = acteurs.get(id);
      if (g && g.userData.grade !== (a.grade || 1)) { scene.remove(g); M.dispose(g); acteurs.delete(id); g = null; } // il a monté de grade : nouvelle tenue
      if (!g) { g = prendre('apprenti' + a.i + '|' + (a.grade || 1), () => PERSOS.creer({ haut: V.HAUTS6[(a.i * 2 + 1) % 6], peau: V.PEAUX6[a.i % 6], cheveux: V.CHEVEUX[a.i % V.CHEVEUX.length], coiffure: 0, toque: true, tablier: true, plateau: true, produit: a.i, cle: true, grade: a.grade || 1 })); g.userData.grade = a.grade || 1; g.userData.yaw = YAW[a.dir] || 0; habiller(g); scene.add(g); acteurs.set(id, g); }
      vus.add(id); poserApprenti(g, a, E, dt);
    }
    for (const [id, g] of acteurs) if (!vus.has(id)) { scene.remove(g); rendreAuPool(g); acteurs.delete(id); }
    if (boulangerG) { oAnim.hop = E.hop; oAnim.rush = E.rush; oAnim.blink = E.blink; oAnim.t = E.t; oAnim.rang = E.rang; PERSOS.animerBoulanger(boulangerG, oAnim); }
    poserChat(E, dt);
  }
  // le compagnon : sur le comptoir quand il dort, au sol quand il se promène, en arc pendant un saut
  let chatG = null, chatHaut = null, chatPied = null, chatHautCle = null; const oChat = { etat: 'dort', phase: 0, t: 0 }, ETAT_CHAT = { dort: 'dort', assis: 'assis', marche: 'marche', descend: 'saut', monte: 'saut' }, _pc = { x: 0, y: 0, z: 0 };
  function poserChat(E, dt) {
    const c = V.chat;
    if (!c || !PERSOS.chat) { if (chatG) { scene.remove(chatG); (PERSOS.libererChat || M.dispose)(chatG); chatG = null; } return; } // libererChat : le tampon d'instances des pattes
    if (!chatG) { chatG = PERSOS.compagnon ? PERSOS.compagnon(modeleComp) : PERSOS.chat(modeleComp === 'chat-noir' && PERSOS.CHAT_NOIR ? Object.assign({}, PERSOS.CHAT_NOIR) : {}); chatG.userData.yaw = Math.PI / 2; chatG.userData.modele = modeleComp; habiller(chatG); scene.add(chatG); }
    if (chatHautCle !== cles.comptoir) { chatHautCle = cles.comptoir; chatHaut = MEUBLES.surDessus(contexte(E), LAY.chat); chatPied = V.piedComptoir(); } // recalculés quand le comptoir change
    const haut = chatHaut, pied = chatPied, zp = wz(pied.y);
    if (c.etat === 'descend' || c.etat === 'monte') { const u = c.etat === 'descend' ? c.saut : 1 - c.saut, e = u * u * (3 - 2 * u); _pc.x = haut.x + (pied.x - haut.x) * e; _pc.z = haut.z + (zp - haut.z) * e; _pc.y = haut.y * (1 - e) + Math.sin(Math.PI * u) * 14; }
    else if (c.haut) { _pc.x = haut.x; _pc.y = haut.y; _pc.z = haut.z; }
    else { _pc.x = c.x; _pc.y = 0; _pc.z = wz(c.y); }
    chatG.position.set(_pc.x, _pc.y, _pc.z); chatG.scale.setScalar(V.K * 0.95);
    tourner(chatG, c.etat === 'dort' ? 1 : c.dir, dt);
    oChat.etat = ETAT_CHAT[c.etat] || 'assis'; oChat.phase = c.phase; oChat.t = E.t; (PERSOS.animerCompagnon || PERSOS.animerChat)(chatG, oChat);
  }
  function zoneChat() { // un rectangle autour du chat (il bouge : rien en cache)
    if (!chatG) return null; const K = V.K, sx = chatG.position.x, sy = projeterY(chatG.position.y, chatG.position.z);
    const c = V.chat;
    if (c && c.haut && c.etat === 'dort') return { x: sx - 18 * K, y: sy - 16 * K, w: 36 * K, h: 20 * K }; // roulé en boule sur le comptoir : une zone plate, qui laisse le buste du boulanger à lui
    return { x: sx - 22 * K, y: sy - 30 * K, w: 44 * K, h: 36 * K };
  }
  function hitChat(x, y) { return dans(zoneChat(), x, y); }
  function ronron() { V.ronron(); }
  function souffle(n) { V.souffle(n); } // le nuage de farine du mini-dragon caressé
  function tourner(g, dir, dt) { const cible = YAW[dir] || 0; g.userData.yaw += angleCourt(cible - g.userData.yaw) * Math.min(1, dt * 12); g.rotation.y = g.userData.yaw; }
  function poser(g, c, E, dt) {
    const s = V.K * c.taille, assis = c.etat === 'assis', marche = c.etat === 'entre' || c.etat === 'sort' || c.etat === 'vaTable' || (c.etat === 'attend' && !!c.glisse);
    g.visible = c.alpha > 0.05; g.scale.setScalar(s * (0.7 + 0.3 * Math.min(1, c.alpha)));
    g.position.set(c.x, 0, wz(c.y) - (1 - c.alpha) * 30);
    tourner(g, c.dir, dt);
    const u = g.userData; // la joie d'être servi (le client quitte la file), et le temps passé immobile dans la file
    if (u.etatP === 'attend' && c.etat !== 'attend') u.joie = 1; else if (u.joie > 0) u.joie = Math.max(0, u.joie - dt / 0.8);
    u.etatP = c.etat; u.tAtt = c.etat === 'attend' && !c.glisse ? (u.tAtt || 0) + dt : 0;
    oAnim.joie = u.joie || 0; oAnim.attente = u.tAtt; oAnim.graine = c.id * 1.7; oAnim.rush = false;
    oAnim.geste = assis ? 'mange' : (c.etat === 'entre' && c.wp === 0) || (c.etat === 'sort' && c.wp >= c.chemin.length - 1) ? 'salut' : '';
    oAnim.marche = marche; oAnim.phase = c.phase; oAnim.assis = assis; oAnim.dir = c.dir; oAnim.sac = c.sac && !assis; oAnim.or = c.or; oAnim.pris = c.pris; oAnim.attend = c.etat === 'attend'; oAnim.plateau = false; oAnim.produit = null; oAnim.cle = false; oAnim.t = E.t; oAnim.blink = (E.blink + c.phase) % 3.4; oAnim.expression = c.or ? 'sourire' : assis ? 'sourire' : 'neutre';
    PERSOS.animer(g, oAnim);
  }
  function poserApprenti(g, a, E, dt) {
    const s = V.K * 0.95, saute = a.etat === 'four' && E.rush ? Math.abs(Math.sin(E.t * 8 + a.lane)) * 2 / CY : 0;
    g.visible = true; g.scale.setScalar(s); g.position.set(a.x, saute, wz(a.y));
    tourner(g, a.etat === 'panne' ? 0 : a.dir, dt);
    oAnim.joie = 0; oAnim.attente = 0; oAnim.graine = a.lane * 2.1 + a.i; oAnim.rush = !!E.rush; oAnim.geste = a.etat === 'four' ? 'petrit' : a.etat === 'depose' ? 'depose' : '';
    oAnim.marche = a.etat === 'porte' || a.etat === 'retour'; oAnim.phase = a.phase; oAnim.assis = false; oAnim.dir = a.dir; oAnim.sac = false; oAnim.or = false; oAnim.pris = false; oAnim.attend = false; oAnim.plateau = a.plateau; oAnim.produit = a.i; oAnim.cle = a.etat === 'panne'; oAnim.t = E.t; oAnim.blink = (E.blink + a.lane) % 3.4; oAnim.expression = a.etat === 'panne' ? 'surpris' : 'neutre';
    PERSOS.animer(g, oAnim);
  }

  // les couverts : posés devant chaque client assis (sur sa table, le bar ou la table basse), cachés tant que personne n'est assis ;
  // les matrices ne sont réécrites que quand une place change
  let couvertsCle = '', _m4 = null, ZERO4 = null;
  function poserCouverts() {
    const g = groupes.couverts, im = g && g.userData.im; if (!im) return;
    if (!_m4) { _m4 = new THREE.Matrix4(); ZERO4 = new THREE.Matrix4().makeScale(0, 0, 0); }
    let cle = ''; for (const s of LAY.sieges) cle += s.occ && s.occ.etat === 'assis' && s.occ.siege === s ? '1' : '0';
    if (cle === couvertsCle) return; couvertsCle = cle;
    im.visible = cle.includes('1'); // personne d'assis : pas même un appel de dessin
    LAY.sieges.forEach((s, i) => {
      if (i >= im.count) return; if (cle[i] !== '1') { im.setMatrixAt(i, ZERO4); return; }
      const t = s.table || s, k = s.zone === 'bar' ? 0 : s.zone === 'banquette' ? 0.3 : 0.45, x = t.x + (s.x - t.x) * k, y = s.zone === 'bar' ? LAY.bar.y - 4 * V.K : t.y + (s.y - t.y) * k;
      _m4.makeRotationY(s.dir === 1 ? Math.PI / 2 : s.dir === -1 ? -Math.PI / 2 : 0).setPosition(x, MEUBLES.HAUT[s.zone] || 29, wz(y)); im.setMatrixAt(i, _m4);
    });
    im.instanceMatrix.needsUpdate = true;
  }
  // ─── la frame : simuler, reconstruire ce qui a changé, éclairer, poser, rendre, puis le calque 2D ───
  const EA = { t: 0, chaud: false, caisseFlash: 0, nuit: false, lampes: 0, rush: false, d: null, sk: null, tags: [] };
  function frame(dt, st, now) {
    const E = V.frame(dt, st, now); LAY = V.LAY; dernier = E;
    if (visFin && performance.now() >= visFin) { visH = visCible; visFin = 0; }
    if (!webgl) return;
    const t0 = performance.now();
    try {
      construire(E); if (HDM.pret('boutique')) { decorHD(E); if (E.Q.standing && HDM.permis(renderer)) for (const l of lotsLuxe(E.Q.standing)) HDM.charger(l); } else if (!hdDemande && nFrame > 30 && HDM.permis(renderer)) { hdDemande = true; HDM.charger('boutique'); } // les lots du standing : après ceux de la boutique, seulement ceux du palier (charger ne recharge pas)
      eclairer(E); peindreExterieur(now, E); peindreAO();
      synchroniser(E, dt);
      EA.t = E.t; EA.chaud = E.chaud; EA.caisseFlash = E.caisseFlash; EA.nuit = E.sk.nuit; EA.lampes = lampesNiv; EA.rush = E.rush; EA.d = E.d; EA.sk = E.sk; EA.tags = E.tags;
      for (const o of animes) o.userData.anime(EA);
      poserCouverts();
      if (perdu) { if (performance.now() - perdu > 3000) panneau(true); if (visH > 48) calque(E, Math.min(H, visH + 24)); return; } // contexte perdu : on attend sa restauration ; s'il ne revient pas, on le dit
      nFrame++;
      if (visH > 48) { mesurer(dt * 1000); if (!(PALIERS[QUAL.niveau].saute && (nFrame & 1))) rendre(E, false); }
      QUAL.cpu = performance.now() - t0;
    } catch (e) { panne(e); }
  }
  function panneau(on) { const p = document.getElementById('sans-3d'); if (p) p.hidden = !on; }
  function panne(e) { // la 3D casse : on l'arrête, la boutique continue de vivre sans image plutôt que de figer le jeu
    webgl = false; console.error('Scène 3D arrêtée :', e);
    panneau(true);
    if (ctx2) { ctx2.setTransform(1, 0, 0, 1, 0, 0); ctx2.clearRect(0, 0, cvUi.width, cvUi.height); }
  }
  function rendre(E, complet) {
    const hv = complet ? H : Math.min(H, visH + 24);
    renderer.setScissorTest(!complet); if (!complet) renderer.setScissor(0, H - hv, W, hv);
    if (QUAL.niveau === 'haute' && RICHE.actif && RICHE.effets && renderer.capabilities.isWebGL2) { if (!RICHE.post) RICHE.post = creerPost(); RICHE.post.rendre(hv); } // les effets : haute seulement
    else renderer.render(scene, camera);
    renderer.setScissorTest(false);
    calque(E, hv);
  }
  function rendu() { // un rendu complet, pour le partage et les captures, à la finesse de l'écran (le palier revient à la tâche suivante)
    if (!dernier || !webgl) return;
    if (DPR < DPRui) { renderer.setPixelRatio(DPRui); renderer.setSize(W, H, false); setTimeout(() => { renderer.setPixelRatio(DPR); renderer.setSize(W, H, false); }, 0); }
    rendre(dernier, true);
  }

  // ─── les zones de touche : les boîtes projetées des meubles, les rectangles du plan pour le reste ───
  let _v, _b; // créés dans init (Three.js peut manquer)
  function rectDe(obj, marge) { // le rectangle d'écran d'un objet (ou d'une boîte monde déjà calculée : userData.zoneBoite)
    if (!obj) return null; if (obj.isBox3) _b.copy(obj); else _b.setFromObject(obj, true); if (_b.isEmpty()) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < 8; k++) { _v.set(k & 1 ? _b.max.x : _b.min.x, k & 2 ? _b.max.y : _b.min.y, k & 4 ? _b.max.z : _b.min.z).project(camera); const sx = (_v.x + 1) / 2 * W, sy = (1 - _v.y) / 2 * H; x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy); }
    marge = marge || 0; return { x: x0 - marge, y: y0 - marge, w: x1 - x0 + 2 * marge, h: y1 - y0 + 2 * marge };
  }
  function auMoins(r, w, h) { if (!r) return r; if (r.w < w) { r.x -= (w - r.w) / 2; r.w = w; } if (r.h < h) { r.y -= (h - r.h) / 2; r.h = h; } return r; }
  function zones() {
    if (!LAY) return {};
    const z = V.zones(); if (!webgl) return z;
    if (zonesCache) return avecChat(zonesCache);
    const K = V.K, k = V.crans.tables;
    const boite = (g) => (g && g.userData.zoneBoite) || g; // la déco et le comptoir désignent leur partie touchable (la plante, la face vitrée)
    const four = rectDe(groupes.four, 2), fr = rectDe(groupes.froid, 2), vit = rectDe(boite(groupes.comptoir), 2), ca = rectDe(groupes.caisse, 6), tb = k > 0 ? rectDe(groupes.tables, 4) : null, bo = rectDe(boite(boulangerG), 4), de = V.crans.deco > 0 ? rectDe(boite(groupes.deco), 6) : null;
    const salle = (id) => (V.crans[id] > 0 && groupes[id] ? auMoins(rectDe(groupes[id], 4), 44, 44) : null) || auMoins({ ...z[id] }, 44, 44); // acheté : sa boîte projetée ; sinon son emplacement
    zonesCache = {
      boulanger: (() => { const r = auMoins(bo, 52 * K, 68 * K) || z.boulanger; if (vit && r.y + r.h > vit.y) r.h = Math.max(8, vit.y - r.y); return r; })(), // il ne mord pas sur la vitrine
      four: four ? (four.y < z.four.y - 12 ? { x: four.x, y: z.four.y - 12, w: four.w, h: four.y + four.h - (z.four.y - 12) } : four) : z.four, froid: fr ? { x: 0, y: fr.y, w: Math.max(44, fr.x + fr.w), h: fr.h } : z.froid,
      vitrine: vit || z.vitrine,
      caisse: auMoins(ca, 44, 44) || z.caisse, deco: auMoins(de, 44, 44) || z.deco,
      tables: auMoins(tb || { ...z.tables }, 44, 44), bar: salle('bar'), banquette: salle('banquette'), terrasse: salle('terrasse'),
      mystere: z.mystere, entree: z.entree,
    };
    return avecChat(zonesCache);
  }
  function avecChat(z) { const zc = zoneChat(); if (zc) z.chat = zc; else delete z.chat; return z; } // la zone du chat n'existe que s'il y a un chat
  const dans = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function hit(x, y) { // le client mystère, par sa boîte projetée ou son rectangle du plan
    const c = V.mystereEnAttente(); if (!c) return false;
    const g = acteurs.get(c.id), r = g ? rectDe(g, 6) : null;
    if (dans(r, x, y) || V.hit(x, y)) { if (!c.pris) V.toucherMystere(c); return true; }
    return false;
  }
  function hitBoulanger(x, y) { return dans(zones().boulanger, x, y); }
  function hitTrophees(x, y) { // la vitrine des trophées ou la coupe du comptoir
    if (!webgl || !LAY) return false;
    const v = groupes.trophees, cp = groupes.coupe; // la vitrine : au moins 44 × 44 ; la coupe, juste elle (elle touche le tablier du boulanger)
    return dans(v ? auMoins(rectDe(v, 3), 44, 44) : null, x, y) || dans(cp ? rectDe(cp, 1) : null, x, y);
  }
  // la petite porte de l'arrière-boutique (src/meubles.js, porteArriere) : son rectangle au mur (un point du mur tombe à son pixel), au moins 44 × 44
  function zoneArriere() { if (!webgl || !LAY || !LAY.arriere) return null; const a = LAY.arriere; return auMoins({ x: a.x - 4, y: a.y - 3, w: a.w + 8, h: LAY.murH - a.y + 6 }, 44, 44); }
  function hitArriere(x, y) { return dans(zoneArriere(), x, y); }
  function hitMeuble(x, y) { const z = zones(); for (const id of ['caisse', 'deco', 'four', 'froid', 'vitrine', 'bar', 'banquette', 'terrasse', 'tables']) if (dans(z[id], x, y)) return id; return null; } // ui.js ouvre sheetMeuble(id)

  // ─── le calque 2D : textes, vapeurs, étiquettes, bulle de talent, étincelles du mystère, pastilles, Aménager, confettis ───
  function rr(x, y, w, h, r) { ctx2.beginPath(); ctx2.roundRect(x, y, w, h, r); }
  function calque(E, hv) {
    const c = ctx2; c.setTransform(DPRui, 0, 0, DPRui, 0, 0); c.clearRect(0, 0, W, H);
    c.save(); c.beginPath(); c.rect(0, 0, W, hv); c.clip();
    for (const v of V.vapeurs) { c.globalAlpha = Math.max(0, v.life) * 0.7; c.fillStyle = v.gris ? '#8C8C8C' : '#fff'; c.beginPath(); c.arc(v.x, v.y, v.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    const s0 = V.K, hp = PERSOS.HAUTEUR || 73;
    for (const cl of V.clients) {
      if (cl.or && !cl.pris && cl.etat === 'attend') { const s = s0 * cl.taille, cy = cl.y - 24 * s; c.fillStyle = '#FFC84A'; for (let k = 0; k < 4; k++) { const a = E.t * 2 + k * 1.6; etincelle(cl.x + Math.cos(a) * 22 * s, cy + Math.sin(a * 1.3) * 26 * s, (4 + Math.sin(E.t * 6 + k) * 1.5) * s); } }
      if (cl.hab && cl.alpha > 0.5) { const s = s0 * cl.taille, ty = projeterY((cl.etat === 'assis' ? hp * 0.75 : hp) * s, wz(cl.y)) - 10; c.font = '700 10px Nunito, sans-serif'; c.textAlign = 'center'; const w = c.measureText(cl.nom).width + 12; c.fillStyle = '#fff'; rr(cl.x - w / 2, ty - 8, w, 15, 7); c.fill(); c.fillStyle = L; c.fillText(cl.nom, cl.x, ty + 3); }
    }
    if (E.pts > 0 && boulangerG && !E.st.visite) { const r = zones().boulanger, by = (r ? r.y + 4 : LAY.boulanger.y - 80 * s0) - 8 + Math.sin(E.t * 3) * 2, bx = LAY.boulanger.x; c.fillStyle = '#fff'; rr(bx + 8, by - 10, 24, 18, 8); c.fill(); c.beginPath(); c.moveTo(bx + 12, by + 7); c.lineTo(bx + 8, by + 13); c.lineTo(bx + 18, by + 8); c.fill(); c.fillStyle = '#9A84F0'; etincelle(bx + 20, by - 1, 6); }
    { // les emplacements des meubles de la salle pas encore achetés : leur nom, discret, au-dessus des pointillés
      c.fillStyle = 'rgba(74,51,40,.45)'; c.font = `700 ${Math.round(9 * s0)}px Nunito, sans-serif`; c.textAlign = 'center';
      const em = LAY.emplacements, tb = LAY.tables[0], t0 = LAY.terrasse[0];
      if (V.crans.tables === 0) c.fillText('tables', tb.x, tb.y - 7 * s0);
      if (!V.crans.bar) c.fillText('bar', (LAY.bar.x0 + LAY.bar.x1) / 2, em.bar.y + em.bar.h / 2 + 3 * s0);
      if (!V.crans.banquette) c.fillText('coin salon', em.banquette.x + em.banquette.w / 2, em.banquette.y + em.banquette.h / 2 + 3 * s0);
      if (!V.crans.terrasse) c.fillText('terrasse', t0.x, t0.y - 2 * s0);
    }
    if (V.chat) for (const h of V.chat.coeurs) { c.globalAlpha = Math.max(0, Math.min(1, h.life)); c.fillStyle = '#FF6B8B'; coeur(h.x, h.y, 6); }
    c.globalAlpha = 1;
    for (const x of V.textes) { c.globalAlpha = Math.max(0, Math.min(1, x.life * 1.4)); c.font = `700 ${Math.round(15 * Math.min(1.3, 1 + x.txt.length / 40))}px Fredoka, Nunito, sans-serif`; c.fillStyle = x.col; c.strokeStyle = '#fff'; c.lineWidth = 4; c.textAlign = 'center'; c.strokeText(x.txt, x.x, x.y); c.fillText(x.txt, x.x, x.y); }
    c.globalAlpha = 1;
    pastilles(E);
    if (amenager) amenagement(E);
    for (const k of V.confetti) { c.save(); c.translate(k.x, k.y); c.rotate(k.a); c.globalAlpha = Math.min(1, k.life * 2); c.fillStyle = k.c; c.fillRect(-4, -2.5, 8, 5); c.restore(); }
    c.globalAlpha = 1; c.restore();
  }
  function coeur(x, y, s) { const c = ctx2; c.beginPath(); c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.6, y - s * 0.9, x, y - s * 0.3); c.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.3, y + s * 0.1, x, y + s * 0.9); c.fill(); }
  function etincelle(x, y, r) { const c = ctx2; c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill(); }
  // le mode Aménager : chaque meuble entouré d'un pointillé animé, avec son nom, ses crans et le prix du cran suivant
  function amenagement(E) {
    const c = ctx2, z = zones(), crans = V.crans, abordables = V.abordables, prixDe = V.prixDe;
    c.font = '700 10px Fredoka, Nunito, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const m of G.MOBILIER) {
      const r = z[m.id]; if (!r) continue;
      const k = crans[m.id], max = k >= m.max, ok = abordables[m.id];
      rr(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 10); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 5; c.stroke();
      c.setLineDash([6, 4]); c.lineDashOffset = -E.t * 20; c.strokeStyle = ok ? '#E0A61E' : '#C8864F'; c.lineWidth = 2.5; c.stroke(); c.setLineDash([]);
      const court = { tables: 'Tables', four: 'Four', vitrine: 'Vitrine', caisse: 'Caisse', froid: 'Froid', deco: 'Déco', bar: 'Bar', banquette: 'Salon', terrasse: 'Terrasse' }[m.id] || m.nom;
      const label = `${court} ${'●'.repeat(k)}${'○'.repeat(m.max - k)}`, lw = c.measureText(label).width + 12, lx = Math.max(2, Math.min(W - lw - 2, r.x)), ly = Math.max(9, r.y - 1);
      c.fillStyle = '#fff'; rr(lx, ly - 8, lw, 16, 8); c.fill(); c.fillStyle = L; c.fillText(label, lx + 6, ly);
      const prix = max ? 'Max ✓' : G.fmtEur(prixDe[m.id]), pw = c.measureText(prix).width + 12, px = Math.min(W - pw - 2, r.x + r.w - pw - 2), py = r.y + r.h - 1;
      c.fillStyle = max ? '#5FD3A4' : ok ? '#FFC84A' : '#EADFD6'; rr(px, py - 8, pw, 16, 8); c.fill(); c.fillStyle = max ? '#fff' : ok ? L : '#8C6F62'; c.fillText(prix, px + 6, py);
    }
    c.textBaseline = 'alphabetic';
  }
  // une petite pastille de niveau par meuble, et la pastille « ↑ » quand le cran suivant est abordable
  function pastilles(E) {
    const c = ctx2, z = zones(), by = Math.sin(E.t * 3) * 2, crans = V.crans, abordables = V.abordables;
    if (!amenager) for (const m of G.MOBILIER) {
      const r = z[m.id], k = crans[m.id]; if (!r || (SALLE_IDS.includes(m.id) && k === 0)) continue;
      const txt = `${k}/${m.max}`; c.font = '800 9px Nunito, sans-serif'; c.textAlign = 'left'; const pw = c.measureText(txt).width + 8, px = Math.max(1, r.x + 2), py = r.y + r.h - 7;
      c.fillStyle = 'rgba(74,51,40,.55)'; rr(px, py - 6.5, pw, 13, 6.5); c.fill(); c.fillStyle = '#fff'; c.fillText(txt, px + 4, py + 3.2);
    }
    for (const id of ['tables', 'four', 'vitrine', 'caisse', 'froid', 'deco', 'bar', 'banquette', 'terrasse']) {
      if (!abordables[id] || !z[id]) continue;
      const r = z[id], x = Math.min(W - 10, r.x + r.w - 6), y = Math.max(10, r.y + 6 + by);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.arc(x + 1, y + 2, 8.5, 0, TAU); c.fill();
      c.fillStyle = '#FFC84A'; c.beginPath(); c.arc(x, y, 8.5, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = L; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y - 4); c.moveTo(x - 3.5, y - 0.5); c.lineTo(x, y - 4); c.lineTo(x + 3.5, y - 0.5); c.stroke();
    }
  }

  const API = { init, resize, frame, zones, hit, hitBoulanger, hitMeuble, hitArriere, zoneArriere, hitChat, hitTrophees, recompenses, decosQuartier, decosHantee, pelageChat, compagnon, ronron, souffle, forcer, hautBloc: V.hautBloc, visible, rendu, hauteurUtile, setAmenager, qualite,
    installer: (zone, duree) => webgl && V.installer(zone, duree), vente: V.vente, texte: V.texte, tap: V.tap, fete: V.fete, setRush: V.setRush, mystere: () => webgl && V.mystere(), habitue: V.habitue,
    get surServi() { return V.surServi; }, set surServi(f) { V.surServi = f; },
    get decosVues() { return Object.keys(QDECO).filter((k) => QDECO[k] && (k === 'scooter' || groupes[k])); }, // les décos du quartier posées (pour les tests)
    get decosHanteeVues() { return Object.keys(HDECO).filter((k) => HDECO[k] && groupes['ht-' + k]); }, // les décos de la Maison hantée posées (pour les tests)
    get chatVu() { const m = chatG ? chatG.userData.modele : null; return m === 'chat-noir' ? 'noir' : m === 'chat-roux' ? 'roux' : m; }, // le pelage du chat dans la boutique, ou l'id d'un autre compagnon (pour les tests)
    get compagnonVu() { if (!chatG) return null; let appels = 0; chatG.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) appels++; }); return { id: chatG.userData.modele, appels, x: chatG.position.x, y: chatG.position.y, z: chatG.position.z }; }, // le compagnon bâti dans la boutique et ses appels de dessin (pour les tests)
    precharger(lot) { if (typeof HDM === 'undefined' || !webgl || !HDM.permis(renderer)) return false; HDM.charger(lot); return true; }, // en arrière-plan, si le palier le permet
    alleger() { if (RICHE.post) { RICHE.post.liberer(); RICHE.post = null; } }, // un écran plein (la Planque) couvre la boutique : la passe d'effets rend sa mémoire, recréée au retour
    get decorHD() { return hdDecor ? hdDecor.children.length : 0; }, // les décors HD posés (pour les tests)
    get recompensesVues() { return { tenue: boulangerG ? boulangerG.userData.tenue || null : null, coupe: groupes.coupe ? REC.coupe : null, coupes: groupes.trophees ? REC.coupes.length : 0, ...(groupes.equipe ? { equipe: true } : {}) }; }, // ce que la boutique montre (pour les tests ; equipe : la rosette « Esprit d'équipe », seulement quand elle est là)
    get maillagesRecompenses() { const n = (g) => { let k = 0; if (g) g.traverse((o) => { if (o.isMesh) k++; }); return k; }; return { coupe: n(groupes.coupe), trophees: n(groupes.trophees), boulanger: n(boulangerG), salle: n(salle) }; }, // le budget d'appels de dessin (pour les tests)
    get _riche() { return RICHE; }, // les réglages du rendu riche (pour les tests et les captures)
    get appelsParGroupe() { const out = {}; const n = (g) => { let k = 0; g.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) k += Array.isArray(o.material) ? o.material.length : 1; }); return k; }; for (const [id, g] of Object.entries(groupes)) if (g) out[id] = n(g); if (hdDecor) out.hd = n(hdDecor); let a = 0; for (const g of acteurs.values()) a += n(g); out.acteurs = a; if (chatG) out.chat = n(chatG); return out; }, // le budget d'appels de dessin, meuble par meuble (pour les tests)
    get couverts() { return (couvertsCle.match(/1/g) || []).length; }, // les couverts posés (un par client assis ; pour les tests)
    get assisEn() { return { table: V.assisEn('table'), bar: V.assisEn('bar'), banquette: V.assisEn('banquette'), terrasse: V.assisEn('terrasse') }; }, // les clients assis par coin (pour les tests)
    get standingVu() { const g = groupes.standing, E = dernier; let n = 0; if (g) g.traverse((o) => { if (o.isMesh) n++; }); return { palier: E && E.Q ? E.Q.standing || 0 : 0, decor: E && E.Q ? E.Q.id : '', hd: /\|hd\|/.test(cles.standing || ''), mailles: n }; }, // le standing posé (pour les tests)
    get meublesHD() { return SALLE_IDS.filter((id) => groupes[id] && /\|hd/.test(cles[id] || '')); }, // les meubles de la salle bâtis en KayKit (pour les tests)
    get amenager() { return amenager; }, get clients() { return V.nClients; }, get apprentis() { return V.nApprentis; }, get assis() { return V.assis; }, get mystereVisible() { return V.mystereVisible; }, get webgl() { return webgl; },
    get stats() { return { webgl, qualite: QUAL.niveau, calls: renderer ? renderer.info.render.calls : 0, triangles: renderer ? renderer.info.render.triangles : 0, ms: QUAL.moy || 0, cpu: QUAL.cpu || 0, acteurs: acteurs.size, animes: animes.length, geometries: renderer ? renderer.info.memory.geometries : 0, textures: renderer ? renderer.info.memory.textures : 0, riche: RICHE.actif, effets: !!RICHE.post, kenney: typeof KENNEY !== 'undefined' && KENNEY ? { pret: KENNEY.pret, octets: KENNEY.octets, ms: KENNEY.ms, erreur: KENNEY.erreur } : null }; } };
  return API;
})();
