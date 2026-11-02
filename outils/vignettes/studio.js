/* LE FOURNIL — le studio des vignettes (outils/vignettes) : un objet du jeu seul, photographié pour le carnet « Mes décos », l'étagère des
   trophées et le carnet du croupier. La même caméra et la même lumière pour toutes les vignettes :
   · la caméra : orthographique (celle de la boutique), de trois quarts (lacet AZ, plongée EL), cadrée sur les sommets de l'objet (la boîte
     de ce qui se dessine vraiment : os, instances et parties vives compris), centrée, une marge régulière autour ;
   · la lumière : celle du rendu riche de la boutique (src/scene.js, paliers haute et moyenne) : le ciel et le sol (HemisphereLight), le
     soleil (DirectionalLight), la pièce chaude d'ambiance (portage de RoomEnvironment passé au PMREM) que reflètent les jumeaux MeshStandard
     des matériaux Lambert ; puis la passe d'effets du palier haut (le contour cartoon par écarts de profondeur, la correction chaude) ;
   · l'ombre de contact : la silhouette de l'objet vue d'en dessous (ou de derrière, pour ce qui s'accroche au mur), adoucie (flou), posée
     sur un plan invisible, légère ;
   · fond transparent, rendu N × N (512) ; outils/vignettes/cuire.cjs le réduit à 256 px en webp.
   Aucun hasard, aucune horloge : la même scène donne la même image. */
const STUDIO = (() => {
  'use strict';
  const T = THREE, N = 512, AZ = 0.52, EL = 0.66; // le lacet (30°, vers la droite) et la plongée (38°) de la caméra, pour toutes les vignettes
  const MARGE = 0.075; // la marge autour de l'objet, en part du côté de l'image
  const cv = document.createElement('canvas'); cv.width = cv.height = N; document.body.appendChild(cv);
  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(N, N, false); renderer.outputColorSpace = T.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  // ─── la lumière : celle de la boutique en rendu riche (src/scene.js : hemi 1,3 × 0,35, soleil 2,2 × 0,92, la pièce d'ambiance 0,16) ───
  const hemi = new T.HemisphereLight('#DDF3FF', '#8C6F62', 1.3 * 0.35), soleil = new T.DirectionalLight('#FFF4E0', 2.2 * 0.92), ENV_K = 0.16;
  soleil.position.set(0.19, 1, 0.55); scene.add(hemi, soleil, soleil.target); // (sa direction : celle de la boutique, d'en haut, un peu de la droite et de devant)
  function pieceEnv() { // la pièce d'ambiance de src/scene.js (portage de RoomEnvironment, three.js r158, MIT) : murs clairs, panneaux lumineux chauds
    const s = new T.Scene(), geo = new T.BoxGeometry(); geo.deleteAttribute('uv');
    const murM = new T.MeshStandardMaterial({ side: T.BackSide, color: '#FFF4E8' }), boiteM = new T.MeshStandardMaterial({ color: '#F2E2D2' });
    const lum = new T.PointLight(0xffffff, renderer._useLegacyLights ? 5 : 900, 28, 2); lum.position.set(0.418, 16.199, 0.3); s.add(lum);
    const b = (m, p, r, k) => { const o = new T.Mesh(geo, m); o.position.set(p[0], p[1], p[2]); o.rotation.set(0, r, 0); o.scale.set(k[0], k[1], k[2]); s.add(o); };
    b(murM, [-0.757, 13.219, 0.717], 0, [31.713, 28.305, 28.591]);
    for (const [p, r, k] of [[[-10.906, 2.009, 1.846], -0.195, [2.328, 7.905, 4.651]], [[-5.607, -0.754, -0.758], 0.994, [1.97, 1.534, 3.955]], [[6.167, 0.857, 7.803], 0.561, [3.927, 6.285, 3.687]], [[-2.017, 0.018, 6.124], 0.333, [2.002, 4.566, 2.064]], [[2.291, -0.756, -2.621], -0.286, [1.546, 1.552, 1.496]], [[-2.193, -0.369, -5.547], 0.516, [3.875, 3.487, 2.986]]]) b(boiteM, p, r, k);
    const panneau = (k, teinte) => { const m = new T.MeshBasicMaterial(); m.color.set(teinte).multiplyScalar(k); return m; };
    for (const [k, t, p, e] of [[50, '#FFE9CF', [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]], [50, '#FFE9CF', [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]], [17, '#FFF6EA', [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]], [43, '#FFEBD6', [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]], [20, '#FFE2C4', [3.235, 11.486, -12.541], [2.5, 2, 0.1]], [100, '#FFF8F0', [0, 20, 0], [1, 0.1, 1]]]) b(panneau(k, t), p, 0, e);
    return s;
  }
  { const pm = new T.PMREMGenerator(renderer), piece = pieceEnv(); scene.environment = pm.fromScene(piece, 0.04).texture; pm.dispose(); piece.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
  // les jumeaux MeshStandard des matériaux Lambert (src/scene.js, jumeau) : mêmes couleurs, textures, lueurs ; rugosité forte (mat, cartoon)
  const jumeaux = new WeakMap();
  const rugosite = (m) => (m.transparent && m.opacity < 0.6 ? 0.18 : m.map ? 0.92 : 0.78);
  function jumeau(m) {
    let t = jumeaux.get(m); if (t) return t;
    t = new T.MeshStandardMaterial({ color: m.color.clone(), vertexColors: m.vertexColors, map: m.map, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, side: m.side, alphaTest: m.alphaTest, depthTest: m.depthTest, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits, flatShading: m.flatShading, roughness: rugosite(m), metalness: 0 });
    t.envMapIntensity = ENV_K;
    if (m.userData.lueur) { t.onBeforeCompile = m.onBeforeCompile; t.customProgramCacheKey = m.customProgramCacheKey; t.userData.lueur = true; } // (la lueur de l'équipe 3D, src/equipe3d.js)
    jumeaux.set(m, t); return t;
  }
  function habiller(obj) { obj.traverse((o) => { if (!o.isMesh || !o.material) return; const v = (m) => (m.isMeshLambertMaterial ? jumeau(m) : m); o.material = Array.isArray(o.material) ? o.material.map(v) : v(o.material); }); }

  // ─── les sommets qui se dessinent, en coordonnées du monde : maillages, instances, os, et les parties vives des décos (MEUBLES.fusion :
  //     chaque sommet dans le repère de sa partie, posé par uVifs[part]) ───
  const _v = new T.Vector3(), _m = new T.Matrix4(), _mi = new T.Matrix4();
  function sommets(racine, fn) {
    racine.updateMatrixWorld(true);
    racine.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData.studio || o.userData.horsCadre) return; let p = o; while (p) { if (!p.visible) return; p = p.parent; } // (horsCadre : un halo, qui déborde)
      const g = o.geometry, pos = g.attributes.position; if (!pos) return;
      const idx = g.index, n = idx ? idx.count : pos.count, vifs = o.material && o.material.userData && o.material.userData.vifs, part = g.attributes.part;
      if (o.isSkinnedMesh) o.skeleton.update();
      const fait = new Uint8Array(pos.count);
      const un = (i, mInst) => {
        if (o.isSkinnedMesh) o.getVertexPosition(i, _v); else _v.fromBufferAttribute(pos, i);
        if (vifs && part) { _mi.copy(vifs.value[Math.round(part.getX(i))]); _mi.elements[3] = 0; if (_mi.elements[0] === 0 && _mi.elements[5] === 0 && _mi.elements[10] === 0) return; _v.applyMatrix4(_mi); }
        if (mInst) _v.applyMatrix4(mInst);
        _v.applyMatrix4(o.matrixWorld); fn(_v.x, _v.y, _v.z);
      };
      if (o.isInstancedMesh) { for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, _m); if (_m.determinant() === 0) continue; for (let j = 0; j < n; j++) un(idx ? idx.getX(j) : j, _m); } return; }
      for (let j = 0; j < n; j++) { const i = idx ? idx.getX(j) : j; if (fait[i]) continue; fait[i] = 1; un(i, null); }
    });
  }
  function boite(racine) { const b = new T.Box3(); sommets(racine, (x, y, z) => b.expandByPoint(_v.set(x, y, z))); return b; }

  // ─── l'ombre de contact (d'après l'exemple « contact shadows » de three.js) : la profondeur de l'objet vue depuis son appui (le sol sous lui,
  //     ou le mur derrière), plus sombre là où il le touche, floutée, posée sur un plan qui ne prend que l'ombre ───
  const RT_O = 256, rtO = new T.WebGLRenderTarget(RT_O, RT_O), rtF = new T.WebGLRenderTarget(RT_O, RT_O); rtO.texture.generateMipmaps = rtF.texture.generateMipmaps = false;
  const camO = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const matProf = new T.MeshDepthMaterial(); matProf.depthTest = false; matProf.depthWrite = false; matProf.side = T.DoubleSide;
  matProf.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 1.0 ), pow( 1.0 - fragCoordZ, 2.2 ) );'); };
  const flou = (sens) => new T.ShaderMaterial({ uniforms: { t: { value: null }, d: { value: new T.Vector2() } }, depthTest: false, depthWrite: false, blending: T.NoBlending,
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main() { vec4 s = vec4(0.0); float w[5]; w[0] = 0.2270270; w[1] = 0.1945946; w[2] = 0.1216216; w[3] = 0.0540540; w[4] = 0.0162162;
      s += texture2D(t, vUv) * w[0]; for (int i = 1; i < 5; i++) { s += texture2D(t, vUv + d * float(i)) * w[i]; s += texture2D(t, vUv - d * float(i)) * w[i]; } gl_FragColor = s; }` });
  const flouH = flou(), flouV = flou();
  const tri = new T.BufferGeometry(); tri.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new T.Mesh(tri, flouH); quad.frustumCulled = false; const sceneQ = new T.Scene(); sceneQ.add(quad); const camQ = new T.Camera();
  const plan = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: rtO.texture, color: '#4A3328', transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }));
  plan.userData.studio = true; plan.renderOrder = -1;
  // appui 'sol' : le plan sous l'objet ; 'mur' : le plan derrière lui, perpendiculaire à n (le mur, tourné comme l'objet : a, son lacet)
  function ombre(racine, b, appui, a) {
    const s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), mur = appui === 'mur';
    let L, H;
    if (mur) { // le mur : le plan de normale n qui passe derrière le sommet le plus reculé ; la caméra d'ombre y est posée, tournée vers l'objet
      const n = new T.Vector3(Math.sin(a || 0), 0, Math.cos(a || 0)); let d0 = Infinity, d1 = -Infinity; sommets(racine, (x, y, z) => { const d = x * n.x + z * n.z; if (d < d0) d0 = d; if (d > d1) d1 = d; });
      const p = c.clone().addScaledVector(n, d0 - c.dot(n)); L = Math.max(s.x, s.y, s.z) * 1.6; H = (d1 - d0) * 0.9 + 0.001;
      camO.position.copy(p); camO.up.set(0, 1, 0); camO.lookAt(p.x + n.x, p.y, p.z + n.z); // (sa droite : le −x du mur, vu de derrière)
      plan.rotation.set(0, a || 0, 0); plan.scale.set(-L, L, 1); plan.position.copy(p).addScaledVector(n, -0.01); // (le plan, retourné en x, retombe sur la silhouette)
    } else {
      L = Math.max(s.x, s.z) * 1.5 + Math.max(s.x, s.y, s.z) * 0.25; H = s.y * 0.9 + 0.001; // (l'étendue du plan ; la hauteur au-delà de laquelle l'objet ne fait plus d'ombre)
      camO.position.set(c.x, b.min.y, c.z); camO.up.set(0, 0, 1); camO.lookAt(c.x, b.min.y + 1, c.z); // (depuis le sol, vers le haut : sa droite est +x, son haut +z)
      plan.rotation.set(Math.PI / 2, 0, 0); plan.scale.set(L, L, 1); plan.position.set(c.x, b.min.y - 0.01, c.z);
    }
    camO.left = -L / 2; camO.right = L / 2; camO.top = L / 2; camO.bottom = -L / 2; camO.near = 0; camO.far = H; camO.updateProjectionMatrix(); camO.updateMatrixWorld(true);
    const avant = scene.overrideMaterial, cachees = [];
    racine.traverse((o) => { if (o.isMesh && (o.userData.horsCadre || (o.material && o.material.userData && o.material.userData.vifs))) { cachees.push([o, o.visible]); o.visible = false; } }); // (les parties vives : leur pose est dans leur programme ; leur ombre n'y serait pas ; un halo n'en fait pas)
    plan.visible = false; scene.overrideMaterial = matProf; renderer.setRenderTarget(rtO); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camO); scene.overrideMaterial = avant;
    for (const [o, v] of cachees) o.visible = v;
    for (let k = 0; k < 3; k++) { // le flou : trois allers-retours horizontal / vertical
      quad.material = flouH; flouH.uniforms.t.value = rtO.texture; flouH.uniforms.d.value.set((1.6 + k) / RT_O, 0); renderer.setRenderTarget(rtF); renderer.render(sceneQ, camQ);
      quad.material = flouV; flouV.uniforms.t.value = rtF.texture; flouV.uniforms.d.value.set(0, (1.6 + k) / RT_O); renderer.setRenderTarget(rtO); renderer.render(sceneQ, camQ);
    }
    renderer.setRenderTarget(null); plan.visible = true; plan.material.side = T.DoubleSide;
  }
  scene.add(plan); plan.visible = false;

  // ─── la passe d'effets (src/scene.js, creerPost) : le contour cartoon (les écarts de profondeur avec les voisins) et la correction chaude ;
  //     ici sur fond transparent : la couleur, prémultipliée par l'alpha, est démultipliée pour la retouche puis remultipliée ───
  const rt = new T.WebGLRenderTarget(N, N, { samples: 4, type: T.UnsignedByteType }); rt.texture.colorSpace = T.SRGBColorSpace; rt.depthTexture = new T.DepthTexture(N, N); rt.depthTexture.type = T.UnsignedIntType;
  const post = new T.ShaderMaterial({
    uniforms: { tCol: { value: rt.texture }, tProf: { value: rt.depthTexture }, px: { value: new T.Vector2(2 / N, 2 / N) }, seuil: { value: 0.01 }, contour: { value: 0.75 }, chaud: { value: 0.55 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tCol; uniform sampler2D tProf; uniform vec2 px; uniform float seuil; uniform float contour; uniform float chaud; varying vec2 vUv;
      vec3 versSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec4 t = texture2D(tCol, vUv); float a = t.a; if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }
        float m = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)), fondu = smoothstep(0.0, 0.035, m); // (l'ombre s'efface avant le bord : l'objet, lui, reste à la marge, bien plus loin)
        vec3 c = versSRGB(clamp(t.rgb / a, 0.0, 1.0));
        float d = texture2D(tProf, vUv).r, e = 0.0;
        e = max(e, abs(d - texture2D(tProf, vUv + vec2(px.x, 0.0)).r)); e = max(e, abs(d - texture2D(tProf, vUv - vec2(px.x, 0.0)).r));
        e = max(e, abs(d - texture2D(tProf, vUv + vec2(0.0, px.y)).r)); e = max(e, abs(d - texture2D(tProf, vUv - vec2(0.0, px.y)).r));
        float k = smoothstep(seuil, seuil * 2.5, e) * contour * step(d, 0.99999);
        c = mix(c, c * vec3(0.42, 0.32, 0.27), k);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 1.0 + 0.10 * chaud);
        c += chaud * vec3(0.030, 0.012, -0.012) * (1.0 - l);
        c *= mix(vec3(1.0), vec3(1.025, 1.0, 0.955), chaud);
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.10 * chaud);
        a *= fondu; gl_FragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
      }`,
    depthTest: false, depthWrite: false, blending: T.NoBlending,
  });

  // ─── une vignette : l'objet posé dans le studio, cadré, éclairé, son ombre, la passe d'effets ; rend l'image (PNG, data URL) et ses mesures ───
  // o : { appui: 'sol' | 'mur' | 'aucun' (le mur : perpendiculaire au lacet du groupe racine), marge, apres (après les matériaux),
  //       recadre: { x: [a, b], y: [c, d] } (le cadre ne garde que cette part de l'objet vu de la caméra, de 0 à 1, de gauche à droite et de
  //       bas en haut ; ce qui dépasse sort de l'image, fondu au bord : le tag sans ses gouttes, le buste du boulanger dans son aura),
  //       az, el (une mise au point seulement) }
  function rendre(racine, o) {
    o = o || {};
    habiller(racine); if (typeof o.apres === 'function') o.apres(racine); // (après le changement de matériaux : la greffe des parties vives se repose sur les jumeaux)
    scene.add(racine); racine.updateMatrixWorld(true);
    const b = boite(racine); if (b.isEmpty()) { scene.remove(racine); throw new Error('objet vide'); }
    const az = o.az != null ? o.az : AZ, el = o.el != null ? o.el : EL, c = b.getCenter(new T.Vector3()), R = b.getSize(new T.Vector3()).length() / 2 + 1;
    camera.position.set(c.x + Math.sin(az) * Math.cos(el) * R * 4, c.y + Math.sin(el) * R * 4, c.z + Math.cos(az) * Math.cos(el) * R * 4); camera.up.set(0, 1, 0); camera.lookAt(c); camera.updateMatrixWorld(true);
    // le cadre : les sommets dans le repère de la caméra ; un carré centré sur leur boîte, la marge autour
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity; const inv = camera.matrixWorldInverse;
    sommets(racine, (x, y, z) => { _v.set(x, y, z).applyMatrix4(inv); if (_v.x < x0) x0 = _v.x; if (_v.x > x1) x1 = _v.x; if (_v.y < y0) y0 = _v.y; if (_v.y > y1) y1 = _v.y; if (_v.z < z0) z0 = _v.z; if (_v.z > z1) z1 = _v.z; });
    const etendue = Math.max(x1 - x0, y1 - y0); // (la taille de tout l'objet : le contour s'y règle, recadré ou non)
    if (o.recadre) { const rx = o.recadre.x || [0, 1], ry = o.recadre.y || [0, 1], w = x1 - x0, h = y1 - y0; x1 = x0 + w * rx[1]; x0 += w * rx[0]; y1 = y0 + h * ry[1]; y0 += h * ry[0]; }
    const marge = o.marge != null ? o.marge : MARGE, cote = Math.max(x1 - x0, y1 - y0) / (1 - 2 * marge), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    camera.left = cx - cote / 2; camera.right = cx + cote / 2; camera.top = cy + cote / 2; camera.bottom = cy - cote / 2;
    const prof = z1 - z0 + 1; camera.near = Math.max(0.01, -z1 - prof * 0.6); camera.far = -z0 + prof * 2.5; camera.updateProjectionMatrix();
    post.uniforms.seuil.value = Math.max(0.0005, (0.09 * etendue) / (camera.far - camera.near)); // (le contour : un écart de 9 % de la taille de l'objet ; la boutique : ≈ 6 px pour des meubles de 20 à 60)
    // l'ombre de contact, puis le rendu dans la cible MSAA, puis la passe d'effets sur le canevas
    if (o.appui !== 'aucun') ombre(racine, b, o.appui === 'mur' ? 'mur' : 'sol', racine.rotation.y); else plan.visible = false;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
    quad.material = post; renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sceneQ, camQ);
    const png = cv.toDataURL('image/png');
    scene.remove(racine); plan.visible = false;
    return { png, boite: { min: b.min.toArray().map((v) => +v.toFixed(2)), max: b.max.toArray().map((v) => +v.toFixed(2)) }, cadre: +cote.toFixed(2), appels: renderer.info.render.calls };
  }
  return { N, AZ, EL, MARGE, renderer, scene, camera, rendre, boite, sommets, habiller };
})();
