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
    cv.addEventListener('webglcontextrestored', () => { perdu = 0; panneau(false); toutRebatir(); });
    _c1 = new THREE.Color(); _c2 = new THREE.Color(); _v = new THREE.Vector3(); _b = new THREE.Box3();
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    hemi = new THREE.HemisphereLight('#DDF3FF', '#8C6F62', 1.3);
    dir = new THREE.DirectionalLight('#FFF4E0', 2.2); dir.castShadow = true; dir.shadow.mapSize.set(PALIERS[QUAL.niveau].ombres || 512, PALIERS[QUAL.niveau].ombres || 512); dir.shadow.bias = -0.0005; dir.shadow.normalBias = 1.5;
    scene.add(hemi, dir, dir.target);
    for (let k = 0; k < 3; k++) { const p = new THREE.PointLight('#FFD98A', 0, 1, 1); p.castShadow = false; lampes.push(p); scene.add(p); }
    ext.tex = new THREE.CanvasTexture(ext.cv); ext.tex.colorSpace = THREE.SRGBColorSpace; ext.tex.userData.partagee = true; // le paysage vit toute la partie
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
    groupes[id] = g || null; if (g) scene.add(g); zonesCache = null; recenserAnimes();
  }
  function recenserAnimes() { animes.length = 0; scene.traverse((o) => { if (o.userData && typeof o.userData.anime === 'function') animes.push(o); }); }
  const CONDS = [ // les petits décors : une clé par frame, reconstruits quand elle change (null : absent)
    { id: 'etagere', cle: (E) => `${Math.min(10, Math.floor(E.niv[0] / 10))}|${E.niv[6] > 0 ? 1 : 0}`, faire: (k, c) => { const [n, b] = k.split('|'); return MEUBLES.etagere(+n, b === '1', c); } },
    { id: 'cadre', cle: (E) => (E.niv[3] > 0 ? '1' : null), faire: (k, c) => MEUBLES.cadre(LAY.cadre.x, LAY.cadre.y, c) },
    { id: 'horloge', cle: () => '1', faire: (k, c) => MEUBLES.horloge(c) },
    { id: 'diplome', cle: (E) => (E.rang >= 2 ? '1' : null), faire: (k, c) => MEUBLES.diplome(c) },
    { id: 'plante', cle: (E) => (E.niv[1] > 0 ? '1' : null), faire: (k, c) => MEUBLES.plante(LAY.plante.x, LAY.plante.y, c) },
    { id: 'sapin', cle: (E) => (E.tags.includes('noel') ? '1' : null), faire: (k, c) => MEUBLES.sapin(c) },
    { id: 'plan', cle: () => '1', faire: (k, c) => MEUBLES.plan(c) },
    { id: 'presentoir', cle: (E) => (LAY.spread > 120 && E.niv[0] >= 20 ? String(Math.min(6, 2 + Math.floor(E.niv[0] / 25))) : null), faire: (k, c) => MEUBLES.presentoir(+k, c) },
    { id: 'ardoise', cle: (E) => (E.staffs >= 2 ? '1' : null), faire: (k, c) => MEUBLES.ardoise(c) },
    { id: 'fleurs', cle: (E) => (E.bonus >= 3 ? '1' : null), faire: (k, c) => MEUBLES.fleurs(c) },
    { id: 'chat', cle: (E) => (E.niv[4] > 0 ? '1' : null), faire: (k, c) => MEUBLES.chat(c) },
    { id: 'paillasson', cle: (E) => (E.crans.deco >= 1 ? 'c' : 'n'), faire: (k, c) => MEUBLES.paillasson(k === 'c', c) },
    { id: 'guirlande', cle: (E) => (E.crans.deco < 3 && (E.niv[5] > 0 || E.rush || E.tags.includes('noel')) ? (E.tags.includes('noel') ? 'noel' : 'g') : null), faire: (k, c) => MEUBLES.guirlande(k === 'noel', c) },
    { id: 'fanions', cle: (E) => (E.tags.includes('fete') ? '1' : null), faire: (k, c) => MEUBLES.fanions(c) },
    { id: 'coeurs', cle: (E) => (E.tags.includes('coeurs') ? '1' : null), faire: (k, c) => MEUBLES.coeurs(c) },
    { id: 'saison', cle: (E) => (E.tags.includes('halloween') ? 'halloween' : E.tags.includes('galette') ? 'galette' : E.tags.includes('paques') ? 'paques' : E.tags.includes('ete') && !E.tags.includes('fete') ? 'ete' : null), faire: (k, c) => MEUBLES.propSaison(k, c) },
    { id: 'lampe', cle: (E) => (E.niv[2] > 0 ? '1' : null), faire: (k, c) => MEUBLES.lampe(c) },
  ];
  const MEUBLES_IDS = ['froid', 'four', 'comptoir', 'caisse', 'tables', 'deco'];
  function contexte(E) {
    const c = ctxC || (ctxC = { wz, wy, wd, SY, CY });
    c.LAY = LAY; c.K = V.K; c.W = W; c.H = H; c.Q = E.Q; c.tags = E.tags; c.rush = E.rush; c.t = E.t; c.sk = E.sk; c.crans = E.crans; c.niv = E.niv; c.staffs = E.staffs; c.bonus = E.bonus; c.rang = E.rang;
    const cp = groupes.comptoir; c.dessusY = cp ? cp.userData.dessusY : wy(LAY.comptoir.hFace); c.dessusZ = cp ? cp.userData.dessusZ : wz(LAY.comptoir.y + LAY.comptoir.hTop + LAY.comptoir.hFace) - wd(LAY.comptoir.hTop) / 2;
    return c;
  }
  function construire(E) {
    const c = contexte(E), base = `${E.Q.id}|${W}x${H}`;
    if (Qc !== E.Q) { Qc = E.Q; renderer.setClearColor(E.Q.sol); salle = MEUBLES.salle(c); remplacer('salle', salle); }
    for (const id of MEUBLES_IDS) { // les six meubles (le comptoir porte la vitrine), reconstruits quand leur cran change
      const cran = E.crans[id === 'comptoir' ? 'vitrine' : id], k = `${cran}|${base}${id === 'tables' ? '|' + E.crans.deco : ''}${id === 'deco' && E.tags.includes('noel') ? '|noel' : ''}${id === 'comptoir' ? '|' + E.niv.filter((n) => n > 0).length : ''}`;
      if (cles[id] !== k) { cles[id] = k; remplacer(id, MEUBLES[id](cran, c)); if (id === 'comptoir') { cles.produits = null; cles.caisse = null; const cp = groupes.comptoir; if (cp && cp.userData.dessusY != null) { c.dessusY = cp.userData.dessusY; c.dessusZ = cp.userData.dessusZ; } } }
    }
    for (const d of CONDS) { const k = d.cle(E), kk = k == null ? null : `${k}|${base}`; if (cles[d.id] !== kk) { cles[d.id] = kk; remplacer(d.id, kk == null ? null : d.faire(k, c)); } }
    const ouverts = E.niv.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0), kp = `${ouverts.join(',')}|${E.crans.vitrine}|${base}`;
    if (cles.produits !== kp) { // les pâtisseries dans la vitrine
      cles.produits = kp; const g = new THREE.Group(), vit = groupes.comptoir && groupes.comptoir.userData.vitrine, places = vit ? vit.places(ouverts.length) : [];
      ouverts.forEach((i, k) => { const p = places[k]; if (!p) return; const m = PERSOS.patisserie(i).clone(); const s = (p.s || 16) / (PERSOS.TAILLE_PATISSERIE || 16); m.position.set(p.x, p.y, p.z); m.scale.setScalar(s); m.castShadow = false; g.add(m); });
      remplacer('produits', g);
    }
    const kb = `${E.rang}|${base}`;
    if (cles.boulanger !== kb) { cles.boulanger = kb; boulangerG = PERSOS.boulanger(E.rang); boulangerG.userData.yaw = 0; boulangerG.position.set(LAY.boulanger.x, 0, wz(LAY.boulanger.y)); boulangerG.scale.setScalar(0.9 * V.K); boulangerG.updateMatrixWorld(true); boulangerG.userData.zoneBoite = new THREE.Box3().setFromObject(boulangerG, true); remplacer('boulanger', boulangerG); } // la zone de touche : la pose de repos
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
    lampesNiv = mix(A.lampes, B.lampes);
    const salon = E.crans.deco >= 4 && E.crans.tables > 0, tb = LAY.tables, allumees = [E.crans.deco >= 2, E.crans.deco >= 2, E.niv[2] > 0 || salon];
    const pos = [[LAY.appliques[0].x, wy(LAY.murH - LAY.appliques[0].y), 18], [LAY.appliques[1].x, wy(LAY.murH - LAY.appliques[1].y), 18], salon ? [(tb[0].x + tb[1].x) / 2, 60, wz((tb[0].y + tb[2].y) / 2)] : [LAY.lampe.x, wy(LAY.murH - LAY.lampe.y) - 10, 20]];
    lampes.forEach((p, i) => { p.position.set(pos[i][0], pos[i][1], pos[i][2]); p.distance = W * 0.9; p.intensity = allumees[i] ? 150 * lampesNiv : 0; });
    const taches = salle && salle.userData.taches; if (taches) for (const m of taches) m.material.opacity = mix(A.tache, B.tache);
    const mm = salle && salle.userData.murMat; if (mm) { mm.emissive.copy(hemi.color); mm.emissiveIntensity = 0.42 * hemi.intensity / 1.3; } // le mur suit la lumière (sa lueur compense les faces verticales, pas la nuit)
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
  function passant(x, px, y, p) { const s = p.s * 1.7; x.fillStyle = p.col; x.globalAlpha = 0.85; x.beginPath(); x.roundRect(px - 5 * s, y - 20 * s, 10 * s, 14 * s, 4 * s); x.fill(); x.beginPath(); x.arc(px, y - 24 * s, 4.5 * s, 0, TAU); x.fill(); const j = Math.sin(p.phase) * 3 * s; x.fillRect(px - 4 * s + j, y - 6 * s, 3 * s, 6 * s); x.fillRect(px + 1 * s - j, y - 6 * s, 3 * s, 6 * s); x.globalAlpha = 1; }

  // ─── les personnages : un groupe par client ou apprenti, pris dans un pool par apparence, posé là où VIE les met ───
  const YAW = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI }, vus = new Set(), oAnim = {};
  const angleCourt = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const cleClient = (c) => `${c.haut}|${c.peau}|${c.cheveux}|${c.coiffure}|${c.bonnet}|${c.lunettes ? 1 : 0}|${c.or ? 1 : 0}|${c.mariniere ? 1 : 0}|${c.hab || ''}`;
  function prendre(cle, fabrique) { const l = pool.get(cle); if (l && l.length) return l.pop(); const g = fabrique(); g.userData.cle = cle; g.userData.yaw = 0; return g; }
  function rendreAuPool(g) { const k = g.userData.cle; if (!/^apprenti/.test(k)) { M.dispose(g); return; } const l = pool.get(k) || []; if (l.length < 1) { l.push(g); pool.set(k, l); } else M.dispose(g); } // les clients sont presque tous uniques : on les libère ; un apprenti par produit est gardé
  function synchroniser(E, dt) {
    vus.clear();
    for (const c of V.clients) {
      let g = acteurs.get(c.id);
      if (!g) { g = prendre(cleClient(c), () => PERSOS.creer({ haut: c.haut, peau: c.peau, cheveux: c.cheveux, coiffure: c.coiffure, bonnet: c.bonnet, lunettes: c.lunettes, or: c.or, mariniere: c.mariniere, sac: true, sacCol: c.sacCol, taille: c.taille })); g.userData.yaw = YAW[c.dir] || 0; scene.add(g); acteurs.set(c.id, g); }
      vus.add(c.id); poser(g, c, E, dt);
    }
    for (const a of V.apprentis) {
      const id = 'a' + a.i; let g = acteurs.get(id);
      if (!g) { g = prendre('apprenti' + a.i, () => PERSOS.creer({ haut: V.HAUTS6[(a.i * 2 + 1) % 6], peau: V.PEAUX6[a.i % 6], cheveux: V.CHEVEUX[a.i % V.CHEVEUX.length], coiffure: 0, toque: true, tablier: true, plateau: true, produit: a.i, cle: true })); g.userData.yaw = YAW[a.dir] || 0; scene.add(g); acteurs.set(id, g); }
      vus.add(id); poserApprenti(g, a, E, dt);
    }
    for (const [id, g] of acteurs) if (!vus.has(id)) { scene.remove(g); rendreAuPool(g); acteurs.delete(id); }
    if (boulangerG) { oAnim.hop = E.hop; oAnim.rush = E.rush; oAnim.blink = E.blink; oAnim.t = E.t; oAnim.rang = E.rang; PERSOS.animerBoulanger(boulangerG, oAnim); }
  }
  function tourner(g, dir, dt) { const cible = YAW[dir] || 0; g.userData.yaw += angleCourt(cible - g.userData.yaw) * Math.min(1, dt * 12); g.rotation.y = g.userData.yaw; }
  function poser(g, c, E, dt) {
    const s = V.K * c.taille, assis = c.etat === 'assis', marche = c.etat === 'entre' || c.etat === 'sort' || c.etat === 'vaTable' || (c.etat === 'attend' && !!c.glisse);
    g.visible = c.alpha > 0.05; g.scale.setScalar(s * (0.7 + 0.3 * Math.min(1, c.alpha)));
    g.position.set(c.x, 0, wz(c.y) - (1 - c.alpha) * 30);
    tourner(g, c.dir, dt);
    oAnim.marche = marche; oAnim.phase = c.phase; oAnim.assis = assis; oAnim.dir = c.dir; oAnim.sac = c.sac && !assis; oAnim.or = c.or; oAnim.pris = c.pris; oAnim.attend = c.etat === 'attend'; oAnim.plateau = false; oAnim.produit = null; oAnim.cle = false; oAnim.t = E.t; oAnim.blink = (E.blink + c.phase) % 3.4; oAnim.expression = c.or ? 'sourire' : assis ? 'sourire' : 'neutre';
    PERSOS.animer(g, oAnim);
  }
  function poserApprenti(g, a, E, dt) {
    const s = V.K * 0.95, saute = a.etat === 'four' && E.rush ? Math.abs(Math.sin(E.t * 8 + a.lane)) * 2 / CY : 0;
    g.visible = true; g.scale.setScalar(s); g.position.set(a.x, saute, wz(a.y));
    tourner(g, a.etat === 'panne' ? 0 : a.dir, dt);
    oAnim.marche = a.etat === 'porte' || a.etat === 'retour'; oAnim.phase = a.phase; oAnim.assis = false; oAnim.dir = a.dir; oAnim.sac = false; oAnim.or = false; oAnim.pris = false; oAnim.attend = false; oAnim.plateau = a.plateau; oAnim.produit = a.i; oAnim.cle = a.etat === 'panne'; oAnim.t = E.t; oAnim.blink = (E.blink + a.lane) % 3.4; oAnim.expression = a.etat === 'panne' ? 'surpris' : 'neutre';
    PERSOS.animer(g, oAnim);
  }

  // ─── la frame : simuler, reconstruire ce qui a changé, éclairer, poser, rendre, puis le calque 2D ───
  const EA = { t: 0, chaud: false, caisseFlash: 0, nuit: false, lampes: 0, rush: false, d: null, sk: null, tags: [] };
  function frame(dt, st, now) {
    const E = V.frame(dt, st, now); LAY = V.LAY; dernier = E;
    if (visFin && performance.now() >= visFin) { visH = visCible; visFin = 0; }
    if (!webgl) return;
    const t0 = performance.now();
    try {
      construire(E);
      eclairer(E); peindreExterieur(now, E);
      synchroniser(E, dt);
      EA.t = E.t; EA.chaud = E.chaud; EA.caisseFlash = E.caisseFlash; EA.nuit = E.sk.nuit; EA.lampes = lampesNiv; EA.rush = E.rush; EA.d = E.d; EA.sk = E.sk; EA.tags = E.tags;
      for (const o of animes) o.userData.anime(EA);
      const tb = groupes.tables; if (tb && tb.userData.couverts) LAY.tables.forEach((table, i) => { const m = tb.userData.couverts[i]; if (m) m.visible = table.sieges.some((s) => !!s.occ); });
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
    renderer.render(scene, camera);
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
    if (zonesCache) return zonesCache;
    const K = V.K, k = V.crans.tables;
    const boite = (g) => (g && g.userData.zoneBoite) || g; // la déco et le comptoir désignent leur partie touchable (la plante, la face vitrée)
    const four = rectDe(groupes.four, 2), fr = rectDe(groupes.froid, 2), vit = rectDe(boite(groupes.comptoir), 2), ca = rectDe(groupes.caisse, 6), tb = k > 0 ? rectDe(groupes.tables, 4) : null, bo = rectDe(boite(boulangerG), 4), de = V.crans.deco > 0 ? rectDe(boite(groupes.deco), 6) : null;
    zonesCache = {
      boulanger: (() => { const r = auMoins(bo, 52 * K, 68 * K) || z.boulanger; if (vit && r.y + r.h > vit.y) r.h = Math.max(8, vit.y - r.y); return r; })(), // il ne mord pas sur la vitrine
      four: four ? (four.y < z.four.y - 12 ? { x: four.x, y: z.four.y - 12, w: four.w, h: four.y + four.h - (z.four.y - 12) } : four) : z.four, froid: fr ? { x: 0, y: fr.y, w: Math.max(44, fr.x + fr.w), h: fr.h } : z.froid,
      vitrine: vit || z.vitrine,
      caisse: auMoins(ca, 44, 44) || z.caisse, deco: auMoins(de, 44, 44) || z.deco,
      tables: tb ? { x: tb.x, y: tb.y, w: k >= 2 ? Math.max(tb.w, W - tb.x) : tb.w, h: tb.h } : z.tables,
      mystere: z.mystere, entree: z.entree,
    };
    return zonesCache;
  }
  const dans = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function hit(x, y) { // le client mystère, par sa boîte projetée ou son rectangle du plan
    const c = V.mystereEnAttente(); if (!c) return false;
    const g = acteurs.get(c.id), r = g ? rectDe(g, 6) : null;
    if (dans(r, x, y) || V.hit(x, y)) { if (!c.pris) V.toucherMystere(c); return true; }
    return false;
  }
  function hitBoulanger(x, y) { return dans(zones().boulanger, x, y); }
  function hitMeuble(x, y) { const z = zones(); for (const id of ['caisse', 'deco', 'four', 'froid', 'vitrine', 'tables']) if (dans(z[id], x, y)) return id; return null; }

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
    if (E.pts > 0 && boulangerG) { const r = zones().boulanger, by = (r ? r.y + 4 : LAY.boulanger.y - 80 * s0) - 8 + Math.sin(E.t * 3) * 2, bx = LAY.boulanger.x; c.fillStyle = '#fff'; rr(bx + 8, by - 10, 24, 18, 8); c.fill(); c.beginPath(); c.moveTo(bx + 12, by + 7); c.lineTo(bx + 8, by + 13); c.lineTo(bx + 18, by + 8); c.fill(); c.fillStyle = '#9A84F0'; etincelle(bx + 20, by - 1, 6); }
    if (V.crans.tables === 0) { const tb = LAY.tables[0]; c.fillStyle = 'rgba(74,51,40,.45)'; c.font = `700 ${Math.round(9 * s0)}px Nunito, sans-serif`; c.textAlign = 'center'; c.fillText('tables', tb.x, tb.y - 7 * s0); }
    for (const x of V.textes) { c.globalAlpha = Math.max(0, Math.min(1, x.life * 1.4)); c.font = `700 ${Math.round(15 * Math.min(1.3, 1 + x.txt.length / 40))}px Fredoka, Nunito, sans-serif`; c.fillStyle = x.col; c.strokeStyle = '#fff'; c.lineWidth = 4; c.textAlign = 'center'; c.strokeText(x.txt, x.x, x.y); c.fillText(x.txt, x.x, x.y); }
    c.globalAlpha = 1;
    pastilles(E);
    if (amenager) amenagement(E);
    for (const k of V.confetti) { c.save(); c.translate(k.x, k.y); c.rotate(k.a); c.globalAlpha = Math.min(1, k.life * 2); c.fillStyle = k.c; c.fillRect(-4, -2.5, 8, 5); c.restore(); }
    c.globalAlpha = 1; c.restore();
  }
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
      const court = { tables: 'Tables', four: 'Four', vitrine: 'Vitrine', caisse: 'Caisse', froid: 'Froid', deco: 'Déco' }[m.id] || m.nom;
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
      const r = z[m.id], k = crans[m.id]; if (!r || (m.id === 'tables' && k === 0)) continue;
      const txt = `${k}/${m.max}`; c.font = '800 9px Nunito, sans-serif'; c.textAlign = 'left'; const pw = c.measureText(txt).width + 8, px = Math.max(1, r.x + 2), py = r.y + r.h - 7;
      c.fillStyle = 'rgba(74,51,40,.55)'; rr(px, py - 6.5, pw, 13, 6.5); c.fill(); c.fillStyle = '#fff'; c.fillText(txt, px + 4, py + 3.2);
    }
    for (const id of ['tables', 'four', 'vitrine', 'caisse', 'froid', 'deco']) {
      if (!abordables[id] || !z[id]) continue;
      const r = z[id], x = Math.min(W - 10, r.x + r.w - 6), y = Math.max(10, r.y + 6 + by);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.arc(x + 1, y + 2, 8.5, 0, TAU); c.fill();
      c.fillStyle = '#FFC84A'; c.beginPath(); c.arc(x, y, 8.5, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = L; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y - 4); c.moveTo(x - 3.5, y - 0.5); c.lineTo(x, y - 4); c.lineTo(x + 3.5, y - 0.5); c.stroke();
    }
  }

  const API = { init, resize, frame, zones, hit, hitBoulanger, hitMeuble, forcer, hautBloc: V.hautBloc, visible, rendu, hauteurUtile, setAmenager, qualite,
    vente: V.vente, texte: V.texte, tap: V.tap, fete: V.fete, setRush: V.setRush, mystere: () => webgl && V.mystere(), habitue: V.habitue,
    get surServi() { return V.surServi; }, set surServi(f) { V.surServi = f; },
    get amenager() { return amenager; }, get clients() { return V.nClients; }, get apprentis() { return V.nApprentis; }, get assis() { return V.assis; }, get mystereVisible() { return V.mystereVisible; }, get webgl() { return webgl; },
    get stats() { return { webgl, qualite: QUAL.niveau, calls: renderer ? renderer.info.render.calls : 0, triangles: renderer ? renderer.info.render.triangles : 0, ms: QUAL.moy || 0, cpu: QUAL.cpu || 0, acteurs: acteurs.size, animes: animes.length, geometries: renderer ? renderer.info.memory.geometries : 0, textures: renderer ? renderer.info.memory.textures : 0 }; } };
  return API;
})();
