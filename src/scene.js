/* LE FOURNIL — la boutique en vraie 3D (Three.js r158, low-poly arrondi pastel). Cette vue ne simule rien : VIE (src/vie.js) fait vivre
   les clients, la file, les apprentis et le plan LAY en pixels d'écran ; ici on projette ce plan dans une pièce en volumes, caméra fixe
   orthographique en plongée 3/4 (lacet 0, 52°), cadrée pour que chaque point du plan tombe exactement à son pixel : un point du sol
   (X, ys) est en monde (X, 0, wz(ys)), un point du mur (X, ys) en (X, wy(murH − ys), 0). Les meubles et la salle viennent de MEUBLES,
   les personnages et les pâtisseries de PERSOS ; en qualité haute et moyenne, la HD permise, les clients sont des personnages 3D animés
   (CLIENTS3D, src/clients3d.js : leur lot demandé après celui de la boutique, cuit à petits pas ; des chibis tant qu'il n'est pas prêt, en éco
   et la HD coupée). Un calque 2D (#scene-ui) porte les textes, les pastilles, le mode Aménager et les confettis.
   setEvenement(vue) bascule la scène sur un événement (la Maison hantée, src/boutiquehantee.js) : la même boutique, son thème (src/vie.js,
   DECORS.hantee), ses clients déguisés, son équipe, ses bougies ; la vie de la boutique attend de côté (VIE.basculer), setEvenement(null)
   la rend telle quelle. vue = { id, compagnon, garde (la tenue du boulanger), equipe (le déguisement de l'apprenti de chaque station),
   friandises (ce que porte chaque station : vitrine et plateaux), cadre: { haut, bas } (la fenêtre de l'écran qui montre la scène, en px
   du canvas : la scène y descend de haut, et ne se rend que jusqu'à bas) }. En qualité haute, quand le lot HD « hantee3 » est là
   (src/boutiquehantee.js, BOUTIQUE_HANTEE.HD), la boutique hantée change tout : son décor cuit d'un bloc, sa nuit (brouillard, ACES, huit
   lumières au plus, halos), ses clients-monstres animés, son équipe à ses postes et sa patronne (modeHD) ; sinon le rendu procédural. */
const SCENE = (() => {
  'use strict';
  const G = GAME, V = VIE, M = MODELES;
  // les clients en personnages 3D animés (src/clients3d.js) : en qualité haute et moyenne, la HD permise, dès que leur lot est prêt ; sinon les chibis
  const C3 = typeof CLIENTS3D !== 'undefined' && CLIENTS3D && CLIENTS3D.actif ? CLIENTS3D : null;
  const TAU = Math.PI * 2, PITCH = 52 * Math.PI / 180, SY = Math.sin(PITCH), CY = Math.cos(PITCH), L = '#4A3328';
  let cv, cvUi, ctx2, renderer, scene, camera, hemi, dir, W = 1, H = 1, DPR = 1, DPRui = 1, LAY = null, visH = 1e9, amenager = false, webgl = false, perdu = 0, nFrame = 0, dernier = null;
  const wz = (ys) => (ys - LAY.murH) / SY, wy = (px) => px / CY, wd = (px) => px / SY;
  const projeterY = (Y, Z) => LAY.murH - Y * CY + Z * SY; // la hauteur d'écran d'un point monde (son X est son x d'écran)
  // ─── la qualité : trois paliers, adaptés au temps de frame mesuré ───
  const PALIERS = { haute: { dpr: 2, ombres: 1024, saute: false }, moyenne: { dpr: 1.5, ombres: 512, saute: false }, eco: { dpr: 1, ombres: 0, saute: true } };
  const QUAL = { niveau: 'haute', fixe: false, mesures: 0, somme: 0, calme: 0, echecs: {}, verif: null, choix: 'auto', depart: null };
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
  // le choix du joueur (Réglages › Le jeu › Qualité graphique, st.qualite) : 'auto' (la mesure ci-dessous choisit le palier), ou un palier
  // fixe ('haute', 'moyenne', 'eco') que la mesure ne touche plus. Revenir à Auto rend la main à la mesure, remise à zéro, depuis le palier
  // en cours (pas de matériaux à recompiler : elle descend si le téléphone peine, remonte s'il suit) ; un rendu logiciel revient à son éco
  // figée. Au lancement, la scène naît au palier choisi. ?qualite= l'emporte sur le choix (tests, débogage).
  function choisirQualite(choix) {
    QUAL.choix = PALIERS[choix] ? choix : 'auto'; if (!QUAL.depart || QUAL.depart.url) return; // avant init (ou ?qualite=) : retenu seulement
    QUAL.mesures = 0; QUAL.somme = 0; QUAL.calme = 0; QUAL.echecs = {}; QUAL.verif = null; QUAL.moy = 0;
    if (QUAL.choix !== 'auto') { qualite(QUAL.choix); QUAL.fixe = true; } else if (QUAL.depart.fixe) { qualite(QUAL.depart.niveau); QUAL.fixe = true; } else QUAL.fixe = false;
  }
  // l'intervalle réel qui suit une image (le travail du processeur graphique compris), par fenêtres de 60 images ; ui.js le mesure : la cadence
  // limitée (30 images/s en jouant, 10 au repos ; 60 et 20 en Fluide) saute volontairement des images de l'écran, ce n'est pas de la lenteur, seul compte le temps
  // jusqu'au rafraîchissement qui suit une image faite :
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
    if (r !== RICHE.actif) { RICHE.actif = r; scene.environment = r && !modeHD ? envMap() : null; habiller(scene); RICHE.aoSale = true; }
    if (niveau !== 'haute' && RICHE.post) { RICHE.post.liberer(); RICHE.post = null; }
  }
  // l'occlusion ambiante peinte : sol (vu de dessus : x → u, z → v) et mur (x, hauteur) ; repeinte quand un meuble change
  function peindreAO() {
    if (!RICHE.actif || !salle || !LAY || modeHD) return;
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
      uniforms: { tCol: { value: rt.texture }, tProf: { value: rt.depthTexture }, px: { value: new THREE.Vector2() }, seuil: { value: 0.0015 }, contour: { value: 0.75 }, chaud: { value: 0.55 }, expo: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tCol; uniform sampler2D tProf; uniform vec2 px; uniform float seuil; uniform float contour; uniform float chaud; uniform float expo; varying vec2 vUv;
        vec3 versSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        vec3 aces(vec3 c) { // le tone mapping ACES filmique de three.js (la nuit de la boutique hantée : expo > 0)
          c *= expo / 0.6; c = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * c;
          c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
          return clamp(mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * c, 0.0, 1.0); }
        void main() {
          vec3 lin = texture2D(tCol, vUv).rgb; if (expo > 0.0) lin = aces(lin);
          vec3 c = versSRGB(lin);
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
    QUAL.depart = { niveau: QUAL.niveau, fixe: QUAL.fixe, url: !!q }; // Auto au lancement (figé : un rendu logiciel) ; un palier choisi par le joueur s'impose ensuite
    if (!q && QUAL.choix !== 'auto') { QUAL.niveau = QUAL.choix; QUAL.fixe = true; } // choisi avant init : la scène naît à ce palier
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
  // ─── la vue d'un événement (setEvenement) ───
  let EVV = null, compAvant = null;
  const decalage = () => (EVV && EVV.cadre ? Math.round(EVV.cadre.haut || 0) : 0); // la scène descend de tant de px dans son canvas (la fenêtre de l'écran de l'événement)
  const visible3 = () => (EVV && EVV.cadre ? Math.max(0, EVV.cadre.bas - decalage()) : visH); // la hauteur de plan visible (sous le tiroir, ou dans la fenêtre)
  function cadrer() { // la caméra : le plan tombe à son pixel, descendu de decalage()
    if (!camera) return; const dy = decalage();
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2 + dy; camera.bottom = -H / 2 + dy; camera.updateProjectionMatrix(); zonesCache = null;
  }
  function setEvenement(v) {
    v = v || null; const avant = EVV; EVV = v;
    if (!!avant !== !!v) {
      V.basculer(v ? v.id || 'evenement' : ''); // la vie de la boutique de côté, ou de retour
      for (const g of acteurs.values()) { scene && scene.remove(g); rendreAuPool(g); } acteurs.clear(); // les personnages de l'autre salle : rendus
      AMB = 1; feteT = 0;
      if (v) { compAvant = modeleComp; if (v.compagnon) poserCompagnon(v.compagnon); } else if (compAvant) { poserCompagnon(compAvant); compAvant = null; }
      for (const p of lampes) p.color.set(v ? '#FFB45A' : '#FFD98A'); // les bougies : une lumière plus orangée
      toutRebatir(); hdCle = ''; couvertsCle = '';
    }
    if (webgl && LAY) cadrer();
  }
  let tailleC = '';
  function resize(width, height, mi) {
    const t = `${width}x${height}x${mi}`; if (t === tailleC && LAY) return; tailleC = t; // même taille : rien à reconstruire
    W = width; H = height; V.resize(W, H, mi); LAY = V.LAY;
    if (!webgl) return;
    const p = PALIERS[QUAL.niveau]; DPR = Math.min(p.dpr, window.devicePixelRatio || 1);
    renderer.setPixelRatio(DPR); renderer.setSize(W, H, false); DPRui = Math.min(2, window.devicePixelRatio || 1); cvUi.width = Math.round(W * DPRui); cvUi.height = Math.round(H * DPRui);
    if (renderer.shadowMap.enabled !== (p.ombres > 0)) { renderer.shadowMap.enabled = p.ombres > 0; recompiler(); }
    cadrer();
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
  function setAmenager(on) { amenager = !!on; if (!amenager) { deplacer = false; glisse = null; } }
  // le mode Déplacer (dans Aménager) : la grille, les meubles déplaçables entourés ; glisse : le meuble sous le doigt (VIE.proposer) ou null
  let deplacer = false, glisse = null;
  function setDeplacer(on) { deplacer = !!on && amenager; glisse = null; }
  function glisser(g) { glisse = g || null; }
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
    // (le néon remonte au-dessus des bocaux du bestiaire quand l'étagère est là aussi : même fenêtre ; dans la boutique hantée, pas de néon)
    { id: 'neon', cle: () => (QDECO.neon && MEUBLES.neon ? (HDECO.bestiaire ? 'haut' : '1') : null), faire: (k, c) => MEUBLES.neon(c, k === 'haut') },
    // le chien : couché dans son coin, SAUF quand il est le compagnon de la boutique (« chien-quartier », GAME.COMPAGNONS) : c'est le même
    // chien, il s'est levé pour te suivre ; pas deux chiens identiques dans la salle. Un autre compagnon choisi : il retourne se coucher.
    { id: 'chien', cle: () => (QDECO.chien && MEUBLES.chien && modeleComp !== 'chien-quartier' ? '1' : null), faire: (k, c) => MEUBLES.chien(c) },
    // les décos de la Maison hantée (src/hantee.js, gagnées aux paliers, à vie) : citrouilles-lanternes, toiles d'araignée, chaudron, petit fantôme
    ...['citrouilles', 'toiles', 'chaudron', 'fantome'].map((id) => ({ id: 'ht-' + id, cle: () => (htDeco(id) && MEUBLES[id] ? '1' : null), faire: (k, c) => MEUBLES[id](c) })),
    // l'étagère aux bocaux de monstres (le bestiaire de la Maison hantée, à la 5e sorte complétée) : seulement gagnée, dans les deux boutiques
    { id: 'ht-bestiaire', cle: () => (HDECO.bestiaire && MEUBLES.bocaux ? '1' : null), faire: (k, c) => MEUBLES.bocaux(c) },
    // la lanterne de la légende (le 20e palier de la Maison hantée) : seulement gagnée, dans les deux boutiques, comme l'étagère aux bocaux
    { id: 'ht-legende', cle: () => (HDECO.legende && MEUBLES.lanterneLegende ? '1' : null), faire: (k, c) => MEUBLES.lanterneLegende(c) },
    // la toque de la recette du jour (src/activites.js : la 500e fournée, à vie), accrochée à la porte de l'arrière-boutique : celle de la Planque, celle du Manoir plus bas si les deux sont là
    { id: 'toque-or', cle: () => (QDECO['toque-or'] && MEUBLES.toqueRecette ? '1' : null), faire: (k, c) => MEUBLES.toqueRecette(c, 'or', false) },
    { id: 'ht-toque-citrouille', cle: () => (HDECO['toque-citrouille'] && MEUBLES.toqueRecette ? (QDECO['toque-or'] ? 'deux' : 'seule') : null), faire: (k, c) => MEUBLES.toqueRecette(c, 'citrouille', k === 'deux') },
    // la boutique hantée (setEvenement) : ses bougies, ses lanternes, ses chauves-souris (MEUBLES.hantee ; modèles cuits en haute)
    { id: 'hantee', cle: (E) => (EVV && MEUBLES.hantee ? `${E.crans.tables}|${E.crans.bar}|${E.crans.vitrine}|${LAY.sig}` : null), faire: (k, c) => MEUBLES.hantee(c) },
    // le badge « Esprit d'équipe » (l'objectif commun de la semaine réussi, classement v6) : une rosette accrochée au mur, à vie ; absent pour qui ne l'a pas
    { id: 'equipe', cle: () => (REC.equipe ? '1' : null), faire: (k, c) => rosetteEquipe(c) },
    // le standing de la boutique (GAME.standing, palier 1 à 5) : ses objets (Q.objets) en un maillage (la lueur du soir comprise) ; en haute, ses modèles cuits (lots luxe*)
    { id: 'standing', cle: (E) => (E.Q.standing && MEUBLES.standing ? `${E.Q.standing}|${luxePret(E.Q.standing) ? 'hd' : ''}|${htDeco('chaudron') ? 'c' : ''}|${typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret ? 'k' : ''}` : null), faire: (k, c) => MEUBLES.standing(c) },
  ];
  // dans la boutique hantée, les petits décors de la boutique qui ne vont pas avec le manoir (les baguettes, les fleurs, les fanions, les
  // trophées, les décos du quartier…) se retirent ; ceux de la Maison hantée sont tous là (les citrouilles, les toiles, le chaudron, le fantôme)
  const SANS_EV = new Set(['presentoir', 'cadre', 'ardoise', 'fleurs', 'guirlande', 'fanions', 'coeurs', 'sapin', 'trophees', 'coupe', 'diplome', 'graffiti', 'neon', 'chien', 'equipe', 'plante']);
  const htDeco = (id) => !!(EVV || HDECO[id]);
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
  const QDECO = { graffiti: false, neon: false, scooter: false, chien: false, 'toque-or': false }; // les décos du quartier posées dans la boutique (et la toque de la recette du jour)
  function decosQuartier(liste) { const l = Array.isArray(liste) ? liste : []; for (const k of Object.keys(QDECO)) QDECO[k] = l.includes(k); ext.der = -1; }
  const HDECO = { citrouilles: false, toiles: false, chaudron: false, fantome: false, 'toque-citrouille': false, bestiaire: false, legende: false }; // les décos de la Maison hantée posées dans la boutique (d'autres noms : ignorés)
  const ALIAS_HT = { citrouille: 'citrouilles', lanternes: 'citrouilles', toile: 'toiles', araignees: 'toiles', chaudrons: 'chaudron', fantomes: 'fantome' };
  function decosHantee(liste) { const l = (Array.isArray(liste) ? liste : []).map((k) => ALIAS_HT[k] || k); for (const k of Object.keys(HDECO)) HDECO[k] = l.includes(k); }
  // le compagnon de la boutique (GAME.COMPAGNONS : le chat roux, le chat noir, le chien… le mini-dragon ; ui.js dit lequel, noir d'office pour
  // un chat pendant la Maison hantée) ; changé, l'ancien est libéré (son tampon d'instances) et le nouveau bâti à l'image suivante
  let modeleComp = 'chat-roux';
  function compagnon(id) { const n = typeof id === 'string' && id ? id : 'chat-roux'; if (EVV && EVV.compagnon) { compAvant = n; return; } poserCompagnon(n); } // (la boutique hantée garde son chat noir : celui de la boutique revient au retour)
  function poserCompagnon(n) { if (n === modeleComp) return; modeleComp = n; if (chatG) { scene.remove(chatG); (PERSOS.libererChat || M.dispose)(chatG); chatG = null; } }
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
    c.hdLuxe = !!(E.Q.standing && luxePret(E.Q.standing)); c.chaudron = htDeco('chaudron'); c.ev = !!EVV; // le standing : ses modèles cuits ; le coin du chaudron
    c.LAY = LAY; c.K = V.K; c.W = W; c.H = H; c.Q = E.Q; c.tags = E.tags; c.rush = E.rush; c.t = E.t; c.sk = E.sk; c.crans = E.crans; c.niv = E.niv; c.staffs = E.staffs; c.bonus = E.bonus; c.rang = E.rang;
    const cp = groupes.comptoir; c.dessusY = cp ? cp.userData.dessusY : wy(LAY.comptoir.hFace); c.dessusZ = cp ? cp.userData.dessusZ : wz(LAY.comptoir.y + LAY.comptoir.hTop + LAY.comptoir.hFace) - wd(LAY.comptoir.hTop) / 2;
    if (modeHD && D3) { c.dessusY = D3.dessusY; c.dessusZ = D3.dessusZ; } // la boutique hantée : le dessus de son comptoir KayKit (le chat y dort)
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
    const h3 = hd3(); if (h3 !== modeHD) basculerHD(h3);
    if (modeHD) { construireHD(E); return; }
    const c = contexte(E), base = `${E.Q.id}|${W}x${H}`;
    const rs = !EVV && E.st.saison && E.st.saison.niv > 0 && PERSOS.patisserieSaison ? E.st.saison.id : '', ouverts = E.niv.map((n, i) => (n > 0 ? (EVV ? (EVV.friandises || [])[i] || null : i) : null)).filter((i) => i != null).slice(-VITRINE_MAX); // les plus avancées, si elles ne tiennent pas toutes (la boutique hantée : ses friandises, des ids de PERSOS)
    c.nVitrine = ouverts.length + (rs ? 1 : 0); // la recette de saison a sa place : étagères, étiquettes et places sur le même compte
    if (Qc !== E.Q) { Qc = E.Q; renderer.setClearColor(E.Q.sol); salle = MEUBLES.salle(c); remplacer('salle', salle); }
    for (const id of MEUBLES_IDS) { // les neuf meubles (le comptoir porte la vitrine), reconstruits quand leur cran change
      const cran = E.crans[id === 'comptoir' ? 'vitrine' : id] || 0, k = `${cran}|${base}${id === 'tables' ? '|' + E.crans.deco : ''}${SALLE_IDS.includes(id) && c.hd ? '|hd' : ''}${id === 'deco' && E.tags.includes('noel') ? '|noel' : ''}${id === 'deco' && c.trophees ? '|trophees' : ''}${id === 'comptoir' ? '|' + c.nVitrine : ''}${LAY.sig && (SALLE_IDS.includes(id) || id === 'deco') ? '|a' + LAY.sig : ''}`; // (a… : la salle aménagée, le tapis rose suit les tables)
      if (cles[id] !== k) { cles[id] = k; remplacer(id, MEUBLES[id](cran, c)); if (id === 'comptoir') { cles.produits = null; cles.caisse = null; const cp = groupes.comptoir; if (cp && cp.userData.dessusY != null) { c.dessusY = cp.userData.dessusY; c.dessusZ = cp.userData.dessusZ; } } }
    }
    for (const d of CONDS) { const k = EVV && SANS_EV.has(d.id) ? null : d.cle(E), kk = k == null ? null : `${k}|${base}`; if (cles[d.id] !== kk) { cles[d.id] = kk; remplacer(d.id, kk == null ? null : d.faire(k, c)); } }
    const kc = `${LAY.sieges.length}|${V.K}|${LAY.sig}|${typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret ? 'k' : ''}`; // les couverts : un maillage instancié pour toutes les places
    if (cles.couverts !== kc) { cles.couverts = kc; couvertsCle = ''; remplacer('couverts', MEUBLES.couverts(LAY.sieges.length, c)); }
    const kp = `${ouverts.join(',')}|${rs}|${E.crans.vitrine}|${base}`;
    if (cles.produits !== kp) { // les pâtisseries dans la vitrine
      cles.produits = kp; const g = new THREE.Group(), vit = groupes.comptoir && groupes.comptoir.userData.vitrine, liste = rs ? ouverts.concat([rs]) : ouverts, places = vit ? vit.places(liste.length) : [];
      if (EVV && PERSOS.partsPatisserie) { // la boutique hantée : ses friandises fusionnées en un maillage (un appel de dessin pour toute la vitrine)
        const pr = [], q0 = new THREE.Quaternion();
        liste.forEach((i, k) => { const p = places[k]; if (!p) return; const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q0, new THREE.Vector3(1, 1, 1).multiplyScalar((p.s || 16) / (PERSOS.TAILLE_PATISSERIE || 16))); for (const x of PERSOS.partsPatisserie(i)) pr.push({ geo: x.geo, col: x.col, m: x.m ? m.clone().multiply(x.m) : m }); });
        if (pr.length) g.add(M.maille(pr, { ombre: false }));
      } else liste.forEach((i, k) => { const p = places[k]; if (!p) return; const m = (typeof i === 'string' ? PERSOS.patisserieSaison(i) : patisserieK(i) || PERSOS.patisserie(i)).clone(); const s = (p.s || 16) / (PERSOS.TAILLE_PATISSERIE || 16); m.position.set(p.x, p.y, p.z); m.scale.setScalar(s); m.castShadow = false; g.add(m); });
      remplacer('produits', g);
    }
    const garde = EVV && EVV.garde ? EVV.garde : G.tenueBoulanger(E.st), kb = `${E.rang}|${garde.cle}|${base}`; // le boulanger porte ce que la garde-robe équipe (la boutique hantée : la tenue de l'événement) (REC.tenue, l'ancienne tenue du podium, ne décide plus)
    if (cles.boulanger !== kb) { cles.boulanger = kb; boulangerG = PERSOS.boulanger(E.rang, garde); boulangerG.userData.yaw = 0; boulangerG.position.set(LAY.boulanger.x, 0, wz(LAY.boulanger.y)); boulangerG.scale.setScalar(0.9 * V.K); boulangerG.updateMatrixWorld(true); boulangerG.userData.zoneBoite = new THREE.Box3().setFromObject(boulangerG, true); remplacer('boulanger', boulangerG); } // la zone de touche : la pose de repos
  }

  // ─── la boutique hantée en qualité haute (modeHD) : le décor cuit d'un bloc (BOUTIQUE_HANTEE.HD.decor), la nuit, les monstres animés ───
  const BH = () => (typeof BOUTIQUE_HANTEE !== 'undefined' ? BOUTIQUE_HANTEE : null);
  const hd3 = () => !!EVV && webgl && !!BH() && BH().HD.pret(renderer);
  let modeHD = false, D3 = null, AMB = 1, feteT = 0; const lampesHD = [], poolM = new Map();
  function basculerHD(on) { // tout le décor et tous les personnages changent de style ; la nuit (brouillard, ACES, pas d'ambiance PMREM) arrive ou repart
    modeHD = on; D3 = null;
    for (const id of Object.keys(groupes)) if (groupes[id]) remplacer(id, null);
    for (const k of Object.keys(cles)) delete cles[k]; Qc = null; salle = null; boulangerG = null; chatHautCle = null; hdCle = ''; couvertsCle = '';
    for (const g of acteurs.values()) { scene.remove(g); rendreAuPool(g); } acteurs.clear();
    if (hdDecor) { scene.remove(hdDecor); M.dispose(hdDecor); hdDecor = null; }
    if (on) {
      scene.fog = new THREE.Fog('#2A2048', 1650, 2700); scene.environment = null; renderer.setClearColor('#120E22');
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
      while (lampesHD.length < 5) { const l = new THREE.PointLight('#FFB060', 0, 150, 1); l.castShadow = false; lampesHD.push(l); }
      for (const l of lampesHD) scene.add(l);
    } else {
      scene.fog = null; scene.environment = RICHE.actif ? envMap() : null; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
      for (const l of lampesHD) scene.remove(l);
      for (const p of lampes) { p.color.set(EVV ? '#FFB45A' : '#FFD98A'); p.decay = 1; }
      for (const l of poolM.values()) for (const a of l) BH().HD.liberer(a); poolM.clear();
    }
    recompiler();
  }
  function construireHD(E) { // le décor hanté, rebâti quand la taille, l'aménagement ou un cran de la salle change
    const k = `${W}x${H}|${LAY.sig}|${['tables', 'bar', 'banquette', 'terrasse', 'vitrine'].map((id) => E.crans[id] || 0).join(',')}`;
    if (cles.ht3 === k) return; cles.ht3 = k;
    let d = null; try { d = BH().HD.decor(contexte(E)); } catch (e) { BH().HD.rater(e); } // raté : la frame suivante repasse en procédural
    if (!d) return; D3 = d; remplacer('ht3', d.g); chatHautCle = null;
    const toutes = lampes.concat(lampesHD);
    toutes.forEach((l, i) => { const q = d.lumieres[i]; if (!q) { l.userData.k = 0; l.intensity = 0; return; } l.position.set(q.x, q.y, q.z); l.color.set(q.col); l.distance = q.d; l.decay = 1; l.userData.k = q.k; });
  }
  function eclairerHD(E) { // la nuit à la bougie : l'hémisphère violet, la lune bleutée ; les lumières vacillent ; tout baisse quand le ×6 s'endort (AMB)
    const a = AMB, t = E.t;
    hemi.color.set('#8A7CC8'); hemi.groundColor.set('#2A1F3A'); hemi.intensity = 0.3 + 0.7 * a;
    dir.color.set('#9FB4FF'); dir.intensity = 0.3 + 0.7 * a; lampesNiv = 1;
    lampes.concat(lampesHD).forEach((l, i) => { l.intensity = (l.userData.k || 0) * (0.2 + 0.8 * a) * (0.86 + 0.09 * Math.sin(t * 9 + i * 1.7) + 0.05 * Math.sin(t * 23 + i * 2.3)); });
    const hx = BH().HD, hm = hx.haloMat(); hm.uniforms.uT.value = t; hm.uniforms.uK.value = 0.3 + 0.7 * a;
    hx.mat('').userData.u.uLueur.value = hx.mat('bandes').userData.u.uLueur.value = (0.55 + 0.45 * a) * (0.94 + 0.06 * Math.sin(t * 11));
    if (RICHE.post) { RICHE.post.mat.uniforms.chaud.value = 0.12; RICHE.post.mat.uniforms.expo.value = 1.35; }
  }
  // un monstre : pris dans le pool de sa sorte (gardé d'une visite à l'autre tant que la boutique hantée dure), ou neuf
  function prendreMonstre(sorte) { const l = poolM.get(sorte); const a = l && l.length ? l.pop() : BH().HD.acteur(sorte); if (!a) return null; a.joue = ''; a.etatP = ''; a.g.visible = true; a.g.rotation.set(0, 0, 0); a.g.rotation.order = 'YXZ'; a.g.userData.cle = 'hd3|' + sorte; a.g.userData.yaw = 0; return a; }
  function rendreMonstre(g) { const a = g.userData.hd3; if (!a) return; if (a.mixer) a.mixer.stopAllAction(); a.joue = ''; const l = poolM.get(a.sorte) || []; if (l.length < 3) { l.push(a); poolM.set(a.sorte, l); } else BH().HD.liberer(a); }
  const ASSIS_Y = { table: 0, terrasse: 0, bar: 0, banquette: -0.05 }; // la hauteur d'assise (×U) : Sit_Chair_Idle est calé sur chair_A ; la banquette est plus basse
  function animerMonstre(a, clip, dt, vitesse) {
    if (a.fantome) return; const hx = BH().HD;
    if (clip === 'Sit_Chair_Idle' && a.joue !== 'Sit_Chair_Idle' && a.joue !== 'Sit_Chair_Down') { hx.jouer(a, 'Sit_Chair_Down', 0.2, true); a.tAssis = 0.75; }
    else if (a.joue === 'Sit_Chair_Down' && clip === 'Sit_Chair_Idle') { if ((a.tAssis -= dt) <= 0) hx.jouer(a, 'Sit_Chair_Idle', 0.25); }
    else hx.jouer(a, clip, 0.25);
    const ac = a.actions[a.joue]; if (ac) ac.timeScale = vitesse || 1;
    a.mixer.update(dt);
  }
  function poserMonstre(a, x, y, z, ry, dt) { const g = a.g; g.position.set(x, y, z); if (ry != null) { g.userData.yaw += angleCourt(ry - g.userData.yaw) * Math.min(1, dt * 12); g.rotation.y = g.userData.yaw; } }
  function synchroniserHD(E, dt) {
    vus.clear(); const U = D3 ? D3.U : 29 * V.K, ech = 0.74 * U, t = E.t;
    for (const c of V.clients) {
      let g = acteurs.get(c.id);
      if (!g) { const a = prendreMonstre(c.deg || BH().SORTES[c.id % 9]); if (!a) continue; g = a.g; g.userData.deg = a.sorte; g.userData.yaw = YAW[c.dir] || 0; scene.add(g); acteurs.set(c.id, g); }
      vus.add(c.id); const a = g.userData.hd3, assis = c.etat === 'assis', marche = (c.etat === 'entre' || c.etat === 'sort' || c.etat === 'vaTable' || (c.etat === 'attend' && !!c.glisse)) && !(c.joie > 0);
      g.visible = c.alpha > 0.05; g.scale.setScalar((a.fantome ? U : ech) * (0.75 + 0.25 * Math.min(1, c.alpha)));
      const y = a.fantome ? (0.32 + 0.06 * Math.sin(t * 2.4 + c.id) + (assis ? 0.3 : 0) + (c.joie > 0 || feteT > 0 ? 0.08 * Math.abs(Math.sin(t * 9)) : 0)) * U : assis && c.siege ? (ASSIS_Y[c.siege.zone] || 0) * U : 0;
      poserMonstre(a, c.x, y, wz(c.y) - (1 - c.alpha) * 30, YAW[c.dir] || 0, dt);
      if (a.fantome) g.rotation.x = marche ? 0.2 : 0; // le drap penche dans le sens de la marche
      animerMonstre(a, c.joie > 0 || feteT > 0 ? 'Cheer' : assis ? 'Sit_Chair_Idle' : marche ? a.marche : 'Idle', dt, marche ? (c.humeur === 'fache' ? 1.5 : 1.1) : 1);
    }
    // l'équipe : chaque poste embauché a son monstre, à son poste (Interact) ; la patronne derrière le comptoir
    const st = E.st.stations || [];
    st.forEach((s, i) => {
      if (!s.staff || !(s.niv > 0) || !D3 || !D3.postes[i]) return; const id = 'a' + i; let g = acteurs.get(id);
      if (!g) { const a = prendreMonstre(BH().HD.EQUIPE3[i]); if (!a) return; g = a.g; g.userData.yaw = D3.postes[i].ry; scene.add(g); acteurs.set(id, g); }
      vus.add(id); const a = g.userData.hd3, p = D3.postes[i]; g.scale.setScalar(a.fantome ? U : ech);
      poserMonstre(a, p.x, a.fantome ? (p.vol || 0.3 * U) + 0.05 * U * Math.sin(t * 2 + i) : 0, p.z, p.ry, dt);
      animerMonstre(a, feteT > 0 ? 'Cheer' : 'Interact', dt, 0.8 + 0.05 * i);
    });
    if (LAY) {
      let g = acteurs.get('patronne'); if (!g) { const a = prendreMonstre('patronne'); if (a) { g = a.g; scene.add(g); acteurs.set('patronne', g); } }
      if (g) { vus.add('patronne'); const a = g.userData.hd3; g.scale.setScalar(ech); poserMonstre(a, LAY.boulanger.x, 0, wz(LAY.boulanger.y), 0, dt); animerMonstre(a, feteT > 0 || E.hop > 0.6 ? 'Cheer' : 'Interact', dt, 0.9); }
    }
    for (const [id, g] of acteurs) if (!vus.has(id)) { scene.remove(g); rendreAuPool(g); acteurs.delete(id); }
    feteT = Math.max(0, feteT - dt);
    poserChat(E, dt);
  }
  // les acteurs de la boutique hantée à l'écran (BOUTIQUE_HANTEE.acteurs) : le haut de la tête en pixels de la fenêtre, ce qui se voit dans la fenêtre
  const _va = { x: 0, y: 0 };
  function ecranDe(x, y, z, r) { _v.set(x, y, z).project(camera); _va.x = r.left + (_v.x + 1) / 2 * r.width; _va.y = r.top + (1 - _v.y) / 2 * r.height; return _va; }
  function acteursEv() {
    if (!EVV || !webgl || !LAY || !cv) return []; const r = cv.getBoundingClientRect(), out = [], k = r.height / H, haut = r.top + decalage() * k, bas = r.top + (EVV.cadre && EVV.cadre.bas ? EVV.cadre.bas : H) * k;
    const mettre = (id, sorte, role, etat, g, hauteur, largeur) => {
      if (!g || !g.visible) return; const p = g.position, tete = ecranDe(p.x, p.y + hauteur, p.z, r), tx = tete.x, ty = tete.y, pied = ecranDe(p.x, p.y, p.z, r).y;
      if (pied < haut + 8 || ty > bas - 8) return; const o = { id, sorte, role, etat, x: Math.round(tx), y: Math.round(ty), l: Math.round(largeur * k), h: Math.round(pied - ty) };
      if (g.userData.hd3) o.clip = g.userData.hd3.fantome ? 'flotte' : g.userData.hd3.joue; out.push(o); // (en haute : le clip joué, pour les tests)
    };
    const hm = (g) => { const a = g && g.userData.hd3; return a ? a.haut * g.scale.y : (PERSOS.HAUTEUR || 73) * (g ? g.scale.y : 1); };
    for (const c of V.clients) { const g = acteurs.get(c.id); if (!g) continue; const b = g.userData.c3d, tp = b ? C3.tete(b) : null; mettre('c' + c.id, c.deg || '', 'client', V.etatClient(c), g, tp ? tp.y - g.position.y : hm(g) * (c.etat === 'assis' && !(g.userData.hd3 && g.userData.hd3.fantome) ? 0.78 : 1), 38 * V.K); } // (un client 3D : le haut de sa tête)
    for (const [id, g] of acteurs) if (typeof id === 'string' && id[0] === 'a') { const i = +id.slice(1); mettre(id, modeHD ? BH().HD.EQUIPE3[i] : (EVV.equipe || [])[i] || '', 'apprenti', 'poste', g, hm(g), 38 * V.K); }
    const pa = modeHD ? acteurs.get('patronne') : boulangerG; if (pa) mettre('patronne', 'patronne', 'patronne', 'poste', pa, modeHD ? hm(pa) : 80 * V.K, 40 * V.K);
    return out;
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
    if (modeHD) { eclairerHD(E); return; }
    let a = E.sk.phase, b = a, k = 0;
    for (const [h, p, q] of BORNES) { const d = E.hour - h; if (Math.abs(d) < 0.25) { a = p; b = q; k = (d + 0.25) / 0.5; } }
    const A = PHASES[a], B = PHASES[b], mix = (u, v) => u + (v - u) * k;
    hemi.color.set(A.hemi[0]).lerp(_c1.set(B.hemi[0]), k); hemi.groundColor.set(A.hemi[1]).lerp(_c1.set(B.hemi[1]), k); hemi.intensity = mix(A.hemi[2], B.hemi[2]);
    dir.color.set(A.dir[0]).lerp(_c1.set(B.dir[0]), k); dir.intensity = mix(A.dir[1], B.dir[1]);
    if (E.rush) { hemi.color.lerp(_c2.set('#FFF0E0'), 0.5); dir.intensity *= 1.1; }
    if (RICHE.actif) { RICHE.envK = RICHE.kEnv * hemi.intensity / 1.3 * (1 - 0.55 * mix(A.lampes, B.lampes)); hemi.intensity *= RICHE.kHemi; dir.intensity *= RICHE.kDir; if (RICHE.post) { RICHE.post.mat.uniforms.chaud.value = RICHE.chaud * (1 - 0.6 * mix(A.lampes, B.lampes)); RICHE.post.mat.uniforms.expo.value = 0; } } // l'ambiance vient surtout de la pièce (PMREM) ; le ciel ne fait plus que teinter
    lampesNiv = mix(A.lampes, B.lampes);
    if (EVV) { // la boutique hantée : les bougies brûlent toute la journée, le soir elles éclairent la salle
      const nk = lampesNiv; hemi.intensity *= 1 - 0.3 * nk; dir.intensity *= 1 - 0.4 * nk; if (RICHE.actif) RICHE.envK *= 1 - 0.35 * nk; // la nuit tombe plus fort sur le manoir : les bougies prennent le relais
      lampesNiv = Math.max(0.45, lampesNiv); const fl = LAY.fleurs, tb = LAY.tables, k = Math.max(1, Math.min(E.crans.tables || 1, tb.length)), p = LAY.porte;
      const pos = [[fl.x, wy(LAY.comptoir.hFace) + 30, wz(fl.y) + 10], [tb[Math.floor((k - 1) / 2)].x, 60, wz(tb[0].y) + 6], [p.x + p.w / 2, 30, wz(LAY.murH + 10 * V.K)]];
      lampes.forEach((pl, i) => { pl.position.set(pos[i][0], pos[i][1], pos[i][2]); pl.distance = W * 0.75; pl.intensity = (i === 2 ? 90 : 130) * lampesNiv * (0.3 + 0.7 * AMB); });
      if (AMB < 1) { hemi.intensity *= 0.55 + 0.45 * AMB; dir.intensity *= 0.6 + 0.4 * AMB; } // le ×6 qui s'endort : la lumière baisse
    } else {
      const coin = (E.crans.banquette || 0) >= 3, salon = coin || (E.crans.deco >= 4 && E.crans.tables > 0), tb = LAY.tables, allumees = [E.crans.deco >= 2, E.crans.deco >= 2, E.niv[2] > 0 || salon];
      const lp = LAY.banquette.lampe, pos = [[LAY.appliques[0].x, wy(LAY.murH - LAY.appliques[0].y), 18], [LAY.appliques[1].x, wy(LAY.murH - LAY.appliques[1].y), 18], coin ? [lp.x, 54, wz(lp.y)] : salon ? [tb[1].x, 60, wz((tb[0].y + tb[3].y) / 2)] : [LAY.lampe.x, wy(LAY.murH - LAY.lampe.y) - 10, 20]]; // le soir, la lampe du coin salon (ou le salon de thé)
      lampes.forEach((p, i) => { p.position.set(pos[i][0], pos[i][1], pos[i][2]); p.distance = W * 0.9; p.intensity = allumees[i] ? 150 * lampesNiv : 0; });
    }
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
    } else if (v === 'hantee') { // le jardin du manoir : les collines, la grille, deux tombes, un arbre mort, des citrouilles qui luisent, des chauves-souris
      ctx.fillStyle = nuit ? '#2A1F45' : '#7A6A9A'; ctx.beginPath(); ctx.moveTo(fx, bas - fh * 0.2); ctx.quadraticCurveTo(fx + fw * 0.35, bas - fh * 0.42, fx + fw * 0.65, bas - fh * 0.26); ctx.quadraticCurveTo(fx + fw * 0.85, bas - fh * 0.34, fx + fw, bas - fh * 0.28); ctx.lineTo(fx + fw, bas); ctx.lineTo(fx, bas); ctx.fill();
      ctx.fillStyle = nuit ? '#1E1830' : '#5A4A72'; ctx.fillRect(fx, bas - fh * 0.12, fw, fh * 0.12);
      ctx.strokeStyle = nuit ? '#120E1C' : '#3A2E4A'; ctx.lineCap = 'round'; ctx.lineWidth = 4; const ax = fx + fw * 0.78; ctx.beginPath(); ctx.moveTo(ax, bas - fh * 0.1); ctx.lineTo(ax - 2, bas - fh * 0.58); ctx.stroke(); ctx.lineWidth = 2.4;
      for (const [a, b, c, d] of [[0, 0.42, 0.13, 0.3], [-1, 0.48, -0.12, 0.36], [0, 0.34, 0.1, 0.24], [-1, 0.54, -0.08, 0.5]]) { ctx.beginPath(); ctx.moveTo(ax + a * 2, bas - fh * b); ctx.lineTo(ax + fw * c, bas - fh * d - fh * 0.12); ctx.stroke(); }
      ctx.fillStyle = nuit ? '#4A4060' : '#9A92AE'; for (const [u, hh] of [[0.18, 0.16], [0.4, 0.13]]) { const gx = fx + fw * u, w2 = fw * 0.045; ctx.beginPath(); ctx.moveTo(gx - w2, bas - fh * 0.08); ctx.lineTo(gx - w2, bas - fh * hh); ctx.arc(gx, bas - fh * hh, w2, Math.PI, 0); ctx.lineTo(gx + w2, bas - fh * 0.08); ctx.fill(); }
      ctx.strokeStyle = nuit ? '#120E1C' : '#2E2440'; ctx.lineWidth = 1.6; for (let k = 0; k <= 14; k++) { const x = fx + k * fw / 14; ctx.beginPath(); ctx.moveTo(x, bas); ctx.lineTo(x, bas - fh * 0.14); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(fx, bas - fh * 0.1); ctx.lineTo(fx + fw, bas - fh * 0.1); ctx.stroke();
      for (const u of [0.28, 0.6]) { const px = fx + fw * u, py = bas - fh * 0.05; ctx.fillStyle = '#FF8A3D'; ctx.beginPath(); ctx.ellipse(px, py, 6, 4.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = nuit ? '#FFE27A' : '#B85A1E'; ctx.fillRect(px - 3, py - 1.5, 2, 2); ctx.fillRect(px + 1, py - 1.5, 2, 2); }
      ctx.fillStyle = nuit ? '#120E1C' : '#3A2E4A'; for (let k = 0; k < 3; k++) { const a = t * (0.5 + k * 0.12) + k * 2, bx = fx + fw * (0.5 + 0.36 * Math.sin(a)), by = fy + fh * (0.22 + 0.07 * k + 0.03 * Math.sin(a * 3)), f = Math.sin(t * 14 + k) * 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 4, by - 3 - f, bx - 8, by + 1); ctx.quadraticCurveTo(bx - 4, by + 1, bx, by + 2.5); ctx.quadraticCurveTo(bx + 4, by + 1, bx + 8, by + 1); ctx.quadraticCurveTo(bx + 4, by - 3 - f, bx, by); ctx.fill(); }
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
  const cleClient = (c) => `${c.haut}|${c.peau}|${c.cheveux}|${c.coiffure}|${c.bonnet}|${c.lunettes ? 1 : 0}|${c.or ? 1 : 0}|${c.mariniere ? 1 : 0}|${c.hab || ''}|${c.deg || ''}`;
  function prendre(cle, fabrique) { const l = pool.get(cle); if (l && l.length) return l.pop(); const g = fabrique(); g.userData.cle = cle; g.userData.yaw = 0; return g; }
  function rendreAuPool(g) { if (g.userData.c3d) { C3.rendre(g.userData.c3d); return; } if (g.userData.hd3) { rendreMonstre(g); return; } const k = g.userData.cle; if (!/^apprenti/.test(k)) { M.dispose(g); return; } const l = pool.get(k) || []; if (l.length < 1) { l.push(g); pool.set(k, l); } else M.dispose(g); } // les clients sont presque tous uniques : on les libère ; un apprenti par produit est gardé
  // ─── les décors HD (src/hd.js) : chargés après le premier rendu si le palier le permet ; le boulanger et les apprentis restent des chibis (les
  //     clients ont leur lot à eux, plus bas : CLIENTS3D) ───
  let hdDecor = null, hdCle = '', hdDemande = false;
  // des plantes, des bocaux sur le plan de travail ; en octobre, des citrouilles
  function decorHD(E) {
    if (!HDM.permis(renderer) || modeHD) { if (hdDecor) { scene.remove(hdDecor); M.dispose(hdDecor); hdDecor = null; hdCle = ''; } return; } // repassé en éco : on retire
    const k = `${W}x${H}|${LAY.bar.y | 0}|${LAY.sig}|${E.tags.includes('halloween') ? 'h' : ''}|${Object.keys(cles).length}|s${E.Q.standing || 0}|${EVV ? 'ev' : ''}`; // l'aménagement et le palier du standing : la scène change, on repose
    if (k === hdCle) return; hdCle = k;
    if (hdDecor) { scene.remove(hdDecor); M.dispose(hdDecor); }
    const g = hdDecor = new THREE.Group(), S = W * 0.08, K = V.K, pose = (nom, x, y, z, o = {}) => { const m = HDM.modele(nom, S * (o.s || 1), o); if (m) { m.position.set(x, y, z); m.userData.nomHD = nom; g.add(m); } return m; };
    // (les meubles de la salle, la lampe du coin salon comprise, sont des meubles KayKit fusionnés : MEUBLES.tables, bar, banquette, terrasse)
    if (!EVV) { // (la boutique hantée : ses lanternes et son chandelier à leur place)
      pose('cactus_medium_A', LAY.entree.x - 34 * K, 0, wz(LAY.murH + 14 * K), { s: 0.6 }); // une plante près de la porte
      pose('cactus_small_A', LAY.comptoir.x + 8 * K, wy(LAY.comptoir.hFace + LAY.comptoir.hTop * 0.5), wz(LAY.comptoir.y + LAY.comptoir.hTop * 0.6), { s: 0.4 }); // un petit cactus sur le comptoir
    }
    const pl = LAY.plan; pose('jar_A_large', pl.x + pl.w * 0.25, wy(pl.h * 0.55), wz(pl.y + pl.h * 0.6), { s: 0.25 }); pose('jar_B_medium', pl.x + pl.w * 0.45, wy(pl.h * 0.55), wz(pl.y + pl.h * 0.6), { s: 0.25 });
    if (E.tags.includes('halloween')) { pose('pumpkin_orange_jackolantern', LAY.entree.x - 30 * K, 0, wz(LAY.murH + 22 * K), { s: 0.45 }); pose('pumpkin_orange', LAY.entree.x - 48 * K, 0, wz(LAY.murH + 30 * K), { s: 0.35 }); pose('pumpkin_yellow_small', LAY.devanture.porte.x1 + 22, 0, wz(LAY.devanture.y + 9 * K), { s: 0.6 }); /* dehors, à droite de la porte, au-delà de la colonne droite du portique (x1 + 9 ± 5 : src/meubles.js standing, mêmes mesures) et de son cordon (x1 + 3) */ }
    habiller(g); scene.add(g);
  }
  // les clients 3D : le contexte de CLIENTS3D.poser ; leur programme (le Lambert skinné ou son jumeau MeshStandard) compilé hors de l'image
  // (compileAsync : le navigateur compile en arrière-plan quand il le sait, KHR_parallel_shader_compile ; sinon tout de suite, renderer.compile :
  // sans l'extension, compileAsync n'y gagne rien et la r158 l'écrit en avertissement à chaque lancement), puis la chauffe de leur réserve
  // (dessinée une fois hors champ, l'image où elle arrive) : les clients deviennent 3D ensuite ; la réserve rendue (sa mémoire) quand la HD
  // reste interdite plus de 10 s (l'éco, la HD coupée dans les Réglages)
  const ctxC3 = { wz, K: 1 }; let c3Chauffe = null, c3Interdit = 0, c3Compile = 0; // c3Compile : 0 à faire, 1 en cours, 2 fait
  function compilerC3() {
    c3Compile = 1; const g = C3.echantillon(), fini = () => { c3Compile = 2; }; if (!g) { fini(); return; }
    habiller(g);
    try { const p = renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(g, camera, scene) : null; if (p && p.then) p.then(fini, fini); else { renderer.compile(g, camera, scene); fini(); } } catch (e) { fini(); } // (extensions.has se tait, extensions.get avertit)
  }
  function synchroniser(E, dt) {
    if (c3Chauffe) { C3.rentrer(c3Chauffe); c3Chauffe = null; } // (avant tout : la boutique hantée en HD peut arriver juste après la chauffe)
    if (modeHD) { synchroniserHD(E, dt); return; }
    vus.clear();
    const c3p = C3 && C3.pret && C3.permis(renderer); if (c3p && !c3Compile) compilerC3();
    const c3 = c3p && c3Compile === 2 ? C3 : null; ctxC3.K = V.K;
    if (c3) { c3Interdit = 0; c3Chauffe = c3.chauffer(); if (c3Chauffe) for (const g of c3Chauffe) { habiller(g); scene.add(g); } }
    else if (C3 && C3.pret && !c3p && (c3Interdit += dt) > 10) C3.liberer(); // (sans effet si la réserve est déjà rendue, ou si un acteur est encore en service)
    for (const c of V.clients) {
      let g = acteurs.get(c.id); const glb = !!c3 && !EVV && !c.deg; // (la boutique hantée procédurale garde ses chibis : leurs costumes, et le client mystère avec eux)
      if (C3 && g && !!g.userData.c3d !== glb && !(glb && g.userData.repli)) { scene.remove(g); rendreAuPool(g); acteurs.delete(c.id); g = null; } // (repli : un chibi faute d'acteur, il le reste plutôt que d'être rebâti à chaque image)
      if (!g && glb) { const a = c3.acteur(c); if (a) { g = a.g; habiller(g); scene.add(g); acteurs.set(c.id, g); } }
      if (!g) { g = prendre(cleClient(c), () => PERSOS.creer({ haut: c.haut, peau: c.peau, cheveux: c.cheveux, coiffure: c.coiffure, bonnet: c.bonnet, lunettes: c.lunettes, or: c.or, mariniere: c.mariniere, sac: true, sacCol: c.sacCol, taille: c.taille, deguisement: c.deg })); g.userData.deg = c.deg || ''; g.userData.repli = glb; g.userData.yaw = YAW[c.dir] || 0; habiller(g); scene.add(g); acteurs.set(c.id, g); }
      vus.add(c.id); if (g.userData.c3d) c3.poser(g.userData.c3d, c, E, dt, ctxC3); else poser(g, c, E, dt);
    }
    for (const a of V.apprentis) {
      const id = 'a' + a.i; let g = acteurs.get(id);
      if (g && g.userData.grade !== (a.grade || 1)) { scene.remove(g); M.dispose(g); acteurs.delete(id); g = null; } // il a monté de grade : nouvelle tenue
      if (!g && EVV) g = prendre(`ht|${a.i}`, () => PERSOS.creer({ deguisement: (EVV.equipe || [])[a.i] || 'fantome2', plateau: true, produit: (EVV.friandises || [])[a.i] || 0, cle: true })); // la boutique hantée : le monstre de la station, sa friandise sur le plateau
      if (!g) { g = prendre('apprenti' + a.i + '|' + (a.grade || 1), () => PERSOS.creer({ haut: V.HAUTS6[(a.i * 2 + 1) % 6], peau: V.PEAUX6[a.i % 6], cheveux: V.CHEVEUX[a.i % V.CHEVEUX.length], coiffure: 0, toque: true, tablier: true, plateau: true, produit: a.i, cle: true, grade: a.grade || 1 })); }
      if (!g.parent) { g.userData.grade = a.grade || 1; g.userData.yaw = YAW[a.dir] || 0; habiller(g); scene.add(g); acteurs.set(id, g); }
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
    if (!chatG) return null; const K = V.K, sx = chatG.position.x, sy = projeterY(chatG.position.y + (chatG.userData.vol ? chatG.userData.vol[0] : 0) * chatG.scale.y, chatG.position.z); // (la chauve-souris en vol : la zone monte avec elle)
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
      const t = s.table || s, k = s.zone === 'bar' ? 0 : s.zone === 'banquette' || s.zone === 'terrasse' ? 0.3 : 0.45, x = t.x + (s.x - t.x) * k; // (la table bistrot de la terrasse est plus petite : 12 de rayon contre 16)
      // (la table basse du coin salon n'a que 16 de fond : le couvert de la banquette reste à 3 du milieu en profondeur, sur le plateau, au lieu de déborder dans le vide)
      const dy = (s.y - t.y) * k, y = s.zone === 'bar' ? LAY.bar.y - 4 * V.K : t.y + (s.zone === 'banquette' ? Math.max(-3 * V.K * SY, Math.min(3 * V.K * SY, dy)) : dy);
      _m4.makeRotationY(s.dir === 1 ? Math.PI / 2 : s.dir === -1 ? -Math.PI / 2 : 0).setPosition(x, MEUBLES.HAUT[s.zone] || 29, wz(y)); im.setMatrixAt(i, _m4);
    });
    im.instanceMatrix.needsUpdate = true;
  }
  // ─── la frame : simuler, reconstruire ce qui a changé, éclairer, poser, rendre, puis le calque 2D ───
  const EA = { t: 0, chaud: false, caisseFlash: 0, nuit: false, lampes: 0, rush: false, d: null, sk: null, tags: [] };
  function frame(dt, st, now, msImage, espacee) { // msImage : l'intervalle qui a suivi l'image d'avant (ui.js) ; à défaut, dt. espacee : la cadence a déjà sauté des rafraîchissements
    const E = V.frame(dt, st, now); LAY = V.LAY; dernier = E;
    if (visFin && performance.now() >= visFin) { visH = visCible; visFin = 0; }
    if (!webgl) return;
    const t0 = performance.now();
    try {
      if (EVV && HDM.permis(renderer) && !HDM.pret('hantee3')) HDM.charger('hantee3'); // la boutique hantée : son lot HD (charger ne recharge pas ; préchargé d'habitude)
      construire(E); if (HDM.pret('boutique')) { decorHD(E); if (E.Q.standing && HDM.permis(renderer)) for (const l of lotsLuxe(E.Q.standing)) HDM.charger(l); } else if (!hdDemande && nFrame > 30 && HDM.permis(renderer)) { hdDemande = true; HDM.charger('boutique'); } // les lots du standing : après ceux de la boutique, seulement ceux du palier (charger ne recharge pas)
      if (C3 && HDM.pret('boutique') && C3.permis(renderer)) { C3.demander(); C3.preparer(); } // les clients 3D : leur lot après celui de la boutique, cuit dès qu'il est là (demander ne redemande pas)
      eclairer(E); peindreExterieur(now, E); peindreAO();
      synchroniser(E, dt);
      EA.t = E.t; EA.chaud = E.chaud; EA.caisseFlash = E.caisseFlash; EA.nuit = E.sk.nuit; EA.lampes = lampesNiv; EA.rush = E.rush; EA.d = E.d; EA.sk = E.sk; EA.tags = E.tags;
      for (const o of animes) o.userData.anime(EA);
      poserCouverts();
      const vh = visible3();
      if (perdu) { if (performance.now() - perdu > 3000) panneau(true); if (vh > 48) calque(E, Math.min(H, vh + 24)); return; } // contexte perdu : on attend sa restauration ; s'il ne revient pas, on le dit
      nFrame++;
      if (vh > 48) { mesurer(msImage != null ? msImage : dt * 1000); if (!(PALIERS[QUAL.niveau].saute && !espacee && (nFrame & 1))) rendre(E, false); } // l'éco rend une image sur deux ; si la cadence en saute déjà, toutes
      QUAL.cpu = performance.now() - t0;
    } catch (e) { panne(e); }
  }
  function panneau(on) { const p = document.getElementById('sans-3d'); if (p) p.hidden = !on; }
  function panne(e) { // la 3D casse : on l'arrête, la boutique continue de vivre sans image plutôt que de figer le jeu
    webgl = false; console.error('Scène 3D arrêtée :', e);
    panneau(true);
    if (ctx2) { ctx2.setTransform(1, 0, 0, 1, 0, 0); ctx2.clearRect(0, 0, cvUi.width, cvUi.height); }
  }
  let rendus = 0; // les images rendues (pour les tests de la cadence)
  function rendre(E, complet) {
    rendus++;
    const hv = complet ? H : Math.min(H, visible3() + decalage() + 24); // (le haut du canvas compris : la scène y descend dans la fenêtre d'un événement)
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
    const c = ctx2, dy = decalage(); c.setTransform(DPRui, 0, 0, DPRui, 0, 0); c.clearRect(0, 0, W, H);
    c.save(); c.beginPath(); c.rect(0, 0, W, hv); c.clip(); if (dy) c.translate(0, dy); // la fenêtre d'un événement : le plan descend avec la scène
    for (const v of V.vapeurs) { c.globalAlpha = Math.max(0, v.life) * 0.7; c.fillStyle = v.gris ? '#8C8C8C' : '#fff'; c.beginPath(); c.arc(v.x, v.y, v.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    const s0 = V.K, hp = PERSOS.HAUTEUR || 73;
    for (const cl of V.clients) {
      if (cl.or && !cl.pris && cl.etat === 'attend') { const s = s0 * cl.taille, cy = cl.y - 24 * s; c.fillStyle = '#FFC84A'; for (let k = 0; k < 4; k++) { const a = E.t * 2 + k * 1.6; etincelle(cl.x + Math.cos(a) * 22 * s, cy + Math.sin(a * 1.3) * 26 * s, (4 + Math.sin(E.t * 6 + k) * 1.5) * s); } }
      if (cl.hab && cl.alpha > 0.5) { const s = s0 * cl.taille, g = acteurs.get(cl.id), tp = g && g.userData.c3d ? C3.tete(g.userData.c3d) : null, tx = tp ? tp.x : cl.x, ty = (tp ? projeterY(tp.y, tp.z) : projeterY((cl.etat === 'assis' ? hp * 0.75 : hp) * s, wz(cl.y))) - 10; c.font = '700 10px Nunito, sans-serif'; c.textAlign = 'center'; const w = c.measureText(cl.nom).width + 12; c.fillStyle = '#fff'; rr(tx - w / 2, ty - 8, w, 15, 7); c.fill(); c.fillStyle = L; c.fillText(cl.nom, tx, ty + 3); } // (le personnage 3D : au-dessus de sa tête, où qu'elle soit)
    }
    if (E.pts > 0 && boulangerG && !E.st.visite && !EVV) { const r = zones().boulanger, by = (r ? r.y + 4 : LAY.boulanger.y - 80 * s0) - 8 + Math.sin(E.t * 3) * 2, bx = LAY.boulanger.x; c.fillStyle = '#fff'; rr(bx + 8, by - 10, 24, 18, 8); c.fill(); c.beginPath(); c.moveTo(bx + 12, by + 7); c.lineTo(bx + 8, by + 13); c.lineTo(bx + 18, by + 8); c.fill(); c.fillStyle = '#9A84F0'; etincelle(bx + 20, by - 1, 6); }
    if (!EVV) { // les emplacements des meubles de la salle pas encore achetés : leur nom, discret, au-dessus des pointillés
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
    if (!deplacer && !EVV) pastilles(E); // (la boutique hantée : ni pastilles ni Aménager, l'écran de l'événement est par-dessus)
    if (amenager && !EVV) { if (deplacer) modeDeplacer(E); else amenagement(E); }
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
  // le mode Déplacer : les points de la grille, chaque meuble déplaçable entouré (pâle s'il n'est pas encore acheté : sa place est gardée),
  // et le meuble qui suit le doigt, aimanté : vert s'il peut aller là, rouge avec la raison sinon (et le meuble qu'il touche)
  const COURT = (m) => (m.type === 'tables' ? `Table ${m.i + 1}` : m.type === 'terrasse' ? `Terrasse ${m.i + 1}` : m.id === 'bar' ? 'Bar' : 'Salon');
  function silhouette(m, r, x, y) { // la forme du meuble dans son emprise (tables : le plateau et les deux chaises)
    const c = ctx2, K = V.K;
    if (m.type === 'tables' || m.type === 'terrasse') { c.beginPath(); c.ellipse(x, y, (m.type === 'terrasse' ? 12 : 16) * K, (m.type === 'terrasse' ? 9 : 12) * K, 0, 0, TAU); c.fill(); for (const s of [-1, 1]) { rr(x + s * 19 * K - 6 * K, y + 4 - 5 * K, 12 * K, 10 * K, 3); c.fill(); } }
    else if (m.id === 'bar') { rr(r.x + 2, y - 8 * K, r.w - 4, 12 * K, 4); c.fill(); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(r.x + 2 + (r.w - 4) * (0.125 + i * 0.25), y - 19 * K, 5 * K, 0, TAU); c.fill(); } }
    else { rr(x - 27 * K, y - 11 * K, 54 * K, 16 * K, 5); c.fill(); rr(x - 22 * K, y + 18 * K, 28 * K, 12 * K, 4); c.fill(); rr(x - 47 * K, y + 15 * K, 22 * K, 18 * K, 5); c.fill(); }
  }
  function modeDeplacer(E) {
    const c = ctx2, g = LAY.grille, K = V.K, dev = LAY.devanture.y, ty = LAY.terrasse[0].y;
    c.fillStyle = 'rgba(74,51,40,.22)';
    for (let r = 0; r < g.rangs; r++) { const y = g.y0 + (r + 0.5) * g.pas; if (y > dev - 4 && Math.abs(y - ty) > g.pas / 2) continue; for (let k = 0; k < g.cols; k++) { c.beginPath(); c.arc(g.x0 + (k + 0.5) * g.pas, Math.abs(y - ty) <= g.pas / 2 ? ty : y, 1.6, 0, TAU); c.fill(); } }
    c.font = '700 10px Fredoka, Nunito, sans-serif'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const m of LAY.mobiles) {
      const r = m.r, achete = V.mobileAchete(m), pris = glisse && glisse.id === m.id;
      rr(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 8);
      if (!achete) { c.setLineDash([3, 4]); c.strokeStyle = 'rgba(74,51,40,.28)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); continue; }
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 4.5; c.stroke();
      c.setLineDash([6, 4]); c.lineDashOffset = -E.t * 20; c.strokeStyle = pris ? 'rgba(74,51,40,.35)' : '#E0A61E'; c.lineWidth = 2.2; c.stroke(); c.setLineDash([]);
      if (pris) continue;
      const t = COURT(m), lw = c.measureText(t).width + 10, lx = Math.max(2, Math.min(W - lw - 2, r.x + 2)), ly = Math.max(8, r.y - 2);
      c.fillStyle = '#fff'; rr(lx, ly - 7, lw, 14, 7); c.fill(); c.fillStyle = L; c.textAlign = 'left'; c.fillText(t, lx + 5, ly + 0.5);
    }
    if (glisse) {
      const m = LAY.mobiles.find((o) => o.id === glisse.id), r = glisse.rect, ok = glisse.ok;
      if (glisse.autre) { const o = LAY.mobiles.find((x) => x.id === glisse.autre); if (o) { rr(o.r.x + 1, o.r.y + 1, o.r.w - 2, o.r.h - 2, 8); c.strokeStyle = '#E1496C'; c.lineWidth = 2.5; c.stroke(); } }
      rr(r.x, r.y, r.w, r.h, 9); c.fillStyle = ok ? 'rgba(95,211,164,.30)' : 'rgba(225,73,108,.26)'; c.fill(); c.strokeStyle = ok ? '#2FA77A' : '#E1496C'; c.lineWidth = 3; c.stroke();
      c.fillStyle = ok ? 'rgba(47,167,122,.55)' : 'rgba(225,73,108,.5)'; if (m) silhouette(m, r, glisse.x, glisse.y);
      const t = ok ? `${m ? COURT(m) : ''} : ici ✓` : glisse.raison; c.font = '700 12px Fredoka, Nunito, sans-serif';
      const lw = c.measureText(t).width + 18, lx = Math.max(4, Math.min(W - lw - 4, r.x + r.w / 2 - lw / 2)), ly = r.y - 16 > 14 ? r.y - 16 : r.y + r.h + 16;
      c.fillStyle = 'rgba(0,0,0,.12)'; rr(lx + 1, ly - 10, lw, 22, 11); c.fill(); c.fillStyle = ok ? '#2FA77A' : '#E1496C'; rr(lx, ly - 12, lw, 22, 11); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(t, lx + lw / 2, ly - 0.5);
    }
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
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

  const API = { init, resize, frame, setEvenement, zones, hit, hitBoulanger, hitMeuble, hitArriere, zoneArriere, hitChat, hitTrophees, recompenses, decosQuartier, decosHantee, pelageChat, compagnon, ronron, souffle, forcer, hautBloc: V.hautBloc, visible, rendu, hauteurUtile, setAmenager, setDeplacer, glisser, qualite, choisirQualite,
    get palier() { return QUAL.niveau; }, get choixQualite() { return QUAL.choix; }, // le palier rendu, le choix du joueur (Réglages)
    installer: (zone, duree) => webgl && V.installer(zone, duree), vente: V.vente, texte: V.texte, tap: V.tap, fete: V.fete, setRush: V.setRush, mystere: () => webgl && V.mystere(), habitue: V.habitue,
    get surServi() { return V.surServi; }, set surServi(f) { V.surServi = f; },
    get decosVues() { return Object.keys(QDECO).filter((k) => QDECO[k] && (k === 'scooter' || groupes[k])); }, // les décos du quartier posées (pour les tests)
    get decosHanteeVues() { return Object.keys(HDECO).filter((k) => HDECO[k] && groupes['ht-' + k]); }, // les décos de la Maison hantée posées (pour les tests)
    get chatVu() { const m = chatG ? chatG.userData.modele : null; return m === 'chat-noir' ? 'noir' : m === 'chat-roux' ? 'roux' : m; }, // le pelage du chat dans la boutique, ou l'id d'un autre compagnon (pour les tests)
    get compagnonVu() { if (!chatG) return null; let appels = 0; chatG.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) appels++; }); return { id: chatG.userData.modele, appels, x: chatG.position.x, y: chatG.position.y, z: chatG.position.z, vol: chatG.userData.vol ? chatG.userData.vol[0] : 0 }; }, // le compagnon bâti dans la boutique et ses appels de dessin ; vol : la hauteur de vol de la chauve-souris (pour les tests)
    precharger(lot) { // en arrière-plan, si le palier le permet ; la Maison hantée : le lot de la boutique hantée (le défaut), ses personnages préparés ensuite
      if (typeof HDM === 'undefined' || !webgl || !HDM.permis(renderer)) return false;
      if (lot === 'hantee' && BH() && BH().demande()) { HDM.charger('hantee3').then((ok) => { if (ok) setTimeout(() => BH().HD.preparer(), 400); }); return true; }
      HDM.charger(lot); return true;
    },
    // la boutique hantée (src/boutiquehantee.js) : la scène, la caméra et la projection vers la fenêtre ; les acteurs à l'écran ; l'ambiance ; la fête
    get trois() { return webgl && cv ? { scene, camera, ecran: (x, y, z) => { const p = ecranDe(x, y, z, cv.getBoundingClientRect()); return { x: p.x, y: p.y }; } } : null; },
    acteursEv, ambiance(k) { AMB = Math.max(0, Math.min(1, +k || 0)); }, feteMonstres() { feteT = 1.8; }, get hd3() { return modeHD; },
    alleger() { if (RICHE.post) { RICHE.post.liberer(); RICHE.post = null; } }, // un écran plein (la Planque) couvre la boutique : la passe d'effets rend sa mémoire, recréée au retour
    get decorHD() { return hdDecor ? hdDecor.children.length : 0; }, // les décors HD posés (pour les tests)
    get evenement() { // la boutique hantée (pour les tests) : son thème, ses clients déguisés (bâtis), son équipe aux stations, ses décors
      if (!EVV) return null; let deguises = 0, clients = 0; for (const [id, g] of acteurs) if (typeof id === 'number') { clients++; if (g.userData.deg) deguises++; }
      const E = dernier, ht = groupes.hantee, hl = D3 && D3.g.children.find((o) => o.userData.nom === 'halos');
      const apprentis = modeHD ? [...acteurs.keys()].filter((id) => typeof id === 'string' && id[0] === 'a').map((id) => +id.slice(1)).sort((a, b) => a - b).map((i) => ({ i, costume: BH().HD.EQUIPE3[i], bati: true })) // en haute : toute l'équipe embauchée, à ses postes
        : V.apprentis.map((a) => ({ i: a.i, costume: (EVV.equipe || [])[a.i] || '', bati: acteurs.has('a' + a.i) }));
      return { id: EVV.id || '', theme: E && E.Q ? E.Q.id : '', mode: V.mode, clients, deguises, apprentis, bougies: modeHD ? (hl ? hl.geometry.index.count / 6 : 0) : ht ? ht.userData.bougies || 0 : 0, hd: modeHD, patronne: modeHD ? acteurs.has('patronne') : !!boulangerG, lumieres: modeHD ? lampes.concat(lampesHD).filter((l) => l.parent && (l.userData.k || 0) > 0).length : 0, monstres: modeHD ? [...acteurs.values()].map((g) => g.userData.deg || (g.userData.hd3 && g.userData.hd3.sorte)) : [], decos: ['citrouilles', 'toiles', 'chaudron', 'fantome'].filter((k) => groupes['ht-' + k]), compagnon: chatG ? chatG.userData.modele : null, tenue: boulangerG && boulangerG.userData.garde ? boulangerG.userData.garde.cle || '' : '', decalage: decalage(), visible: visible3() };
    },
    get decorHDBoites() { if (!hdDecor) return []; const b = new THREE.Box3(); return hdDecor.children.map((m) => { b.setFromObject(m); return { nom: m.userData.nomHD || '', x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z }; }); }, // leurs boîtes monde (pour les tests)
    get recompensesVues() { return { tenue: boulangerG ? boulangerG.userData.tenue || null : null, coupe: groupes.coupe ? REC.coupe : null, coupes: groupes.trophees ? REC.coupes.length : 0, ...(groupes.equipe ? { equipe: true } : {}) }; }, // ce que la boutique montre (pour les tests ; equipe : la rosette « Esprit d'équipe », seulement quand elle est là)
    get maillagesRecompenses() { const n = (g) => { let k = 0; if (g) g.traverse((o) => { if (o.isMesh) k++; }); return k; }; return { coupe: n(groupes.coupe), trophees: n(groupes.trophees), boulanger: n(boulangerG), salle: n(salle) }; }, // le budget d'appels de dessin (pour les tests)
    get _riche() { return RICHE; }, // les réglages du rendu riche (pour les tests et les captures)
    get appelsParGroupe() { const out = {}; const n = (g) => { let k = 0; g.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) k += Array.isArray(o.material) ? o.material.length : 1; }); return k; }; for (const [id, g] of Object.entries(groupes)) if (g) out[id] = n(g); if (hdDecor) out.hd = n(hdDecor); let a = 0; for (const g of acteurs.values()) a += n(g); out.acteurs = a; if (chatG) out.chat = n(chatG); return out; }, // le budget d'appels de dessin, meuble par meuble (pour les tests)
    get couverts() { return (couvertsCle.match(/1/g) || []).length; }, // les couverts posés (un par client assis ; pour les tests)
    get clients3d() { // les clients 3D (pour les tests) : prêts, permis, combien en 3D et en chibis dans la salle, la réserve, et chacun (son personnage, son clip, ses accessoires,
      // ses maillages visibles, le bas de ses pieds et son sac (y monde), le haut de sa tête à l'écran)
      if (!C3) return null; let glb = 0, chibis = 0; const liste = [], p = new THREE.Vector3();
      for (const c of V.clients) { const g = acteurs.get(c.id); if (!g) continue; const a = g.userData.c3d; if (!a) { chibis++; continue; } glb++; const t = C3.tete(a), o = a.os, vu = (b) => !!b && b.scale.x > 0, y = (b) => p.setFromMatrixPosition(b.matrixWorld).y;
        let mailles = 0; g.traverse((m) => { if (m.isMesh && m.visible) mailles++; });
        liste.push({ id: c.id, etat: c.etat, siege: c.siege ? c.siege.zone : '', leve: c.leveT != null, nom: a.pr.nom, clip: a.joue, joie: a.joieT > 0, salut: +a.salut.toFixed(2), geste: a.geste ? a.geste.nom : '', or: !!c.or, pris: !!c.pris, hab: c.hab || '', coiffure: c.coiffure, raye: !!a.raye, attente: +a.attente.toFixed(1),
          sac: vu(o.sac), sacY: vu(o.sac) ? +y(o.sac).toFixed(1) : null, sacLieu: vu(o.sac) ? a.sacLieu : '', croissant: vu(o.cr), tasse: vu(o.tasse), objetY: vu(o.cr) ? +y(o.cr).toFixed(1) : vu(o.tasse) ? +y(o.tasse).toFixed(1) : null, lunettes: vu(o.lunettes), bonnet: vu(o.bonnet), halo: !!a.halo, mailles, pieds: +Math.min(...o.pieds.map(y)).toFixed(1),
          assise: +(g.position.y + a.pr.assise * g.scale.y).toFixed(2), assisK: +(a.kA || 0).toFixed(2), // (le dessous du pantalon, assis : sur le siège ; assisK : 1 une fois assis)
          x: g.position.x, y: g.position.y, z: g.position.z, echelle: g.scale.x, tete: t ? { x: t.x, y: t.y, z: t.z, ecran: projeterY(t.y, t.z) } : null }); }
      return { pret: C3.pret, permis: !!renderer && C3.permis(renderer), compile: c3Compile, erreur: C3.erreur, glb, chibis, liste, etat: C3.etat, info: C3.info };
    },
    get assisEn() { return { table: V.assisEn('table'), bar: V.assisEn('bar'), banquette: V.assisEn('banquette'), terrasse: V.assisEn('terrasse') }; }, // les clients assis par coin (pour les tests)
    get standingVu() { const g = groupes.standing, E = dernier; let n = 0; if (g) g.traverse((o) => { if (o.isMesh) n++; }); const emprises = ((g && g.userData.emprises) || []).map((e) => Object.assign({}, e, { haut: projeterY(e.y1, e.z0), bas: projeterY(e.y0, e.z1) })); return { palier: E && E.Q ? E.Q.standing || 0 : 0, decor: E && E.Q ? E.Q.id : '', hd: /\|hd\|/.test(cles.standing || ''), mailles: n, emprises }; }, // le standing posé ; ses emprises (monde, et haut/bas à l'écran) (pour les tests)
    get boulangerVu() { const g = groupes.boulanger, P = g && g.userData.parts; if (!g) return null; let maillages = 0, sprites = 0; g.traverse((o) => { if (!o.visible) return; if (o.isMesh) maillages++; else if (o.isSprite) sprites++; }); return { tenue: (g.userData.garde && g.userData.garde.cle) || '', aura: !!(P && P.aura), opacite: P && P.aura ? +P.aura.material.opacity.toFixed(3) : 0, haut: P && P.aura ? +P.aura.scale.y.toFixed(2) : 0, maillages, sprites }; }, // le boulanger posé : sa tenue, son aura (un sprite) et ses appels de dessin (pour les tests)
    get meublesHD() { return SALLE_IDS.filter((id) => groupes[id] && /\|hd/.test(cles[id] || '')); }, // les meubles de la salle bâtis en KayKit (pour les tests)
    get amenager() { return amenager; }, get deplacer() { return deplacer; }, get glisse() { return glisse; }, get clients() { return V.nClients; }, get apprentis() { return V.nApprentis; }, get assis() { return V.assis; }, get mystereVisible() { return V.mystereVisible; }, get webgl() { return webgl; },
    get _qual() { return QUAL; }, // la mesure de la qualité (pour les tests de la cadence)
    get stats() { return { webgl, qualite: QUAL.niveau, rendus, calls: renderer ? renderer.info.render.calls : 0, triangles: renderer ? renderer.info.render.triangles : 0, ms: QUAL.moy || 0, cpu: QUAL.cpu || 0, acteurs: acteurs.size, animes: animes.length, geometries: renderer ? renderer.info.memory.geometries : 0, textures: renderer ? renderer.info.memory.textures : 0, riche: RICHE.actif, effets: !!RICHE.post, kenney: typeof KENNEY !== 'undefined' && KENNEY ? { pret: KENNEY.pret, octets: KENNEY.octets, ms: KENNEY.ms, erreur: KENNEY.erreur } : null }; } };
  return API;
})();
