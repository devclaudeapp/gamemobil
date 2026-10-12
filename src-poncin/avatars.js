/* OPÉRATION PONCIN — les personnages en 3D : joueurs (les chibis de PERSOS, src/persos.js, casqués aux couleurs de leur équipe, un
   blaster à peinture à la main) et robots (arrondis pastel, antenne, yeux LED), et les trois blasters (aussi utilisés en vue subjective).
   Repère : mètres ; un avatar a les pieds à y = 0 et regarde vers −z quand son lacet vaut 0 (le contrat : yaw positif vers l'ouest).
   Les modèles sont dessinés face à +z (comme PERSOS) puis tournés de π. Toute l'animation se fait sans allocation (champs d'Euler et
   de position écrits directement, géométries en cache échangées, matériaux partagés). Voir src-poncin/ARCHITECTURE.md (section rendu).
   API : PAVATARS.creer(e) → av (av.groupe à poser dans la scène) ; cle(e) (l'apparence : recréer si elle change) ; animer(av, e, dt, t, x?, y?, z?) (la position affichée, sinon e.x…) ;
   tir(av) ; touche(av) ; bouche(av, v) (le bout du canon, en monde) ; liberer(av) ; blaster(id) → géométrie (canon vers −z, poignée à
   l'origine, mètres) ; BOUCHE[id] (le bout du canon dans ce repère) ; HAUTEUR.
   Appels de dessin : robot 4 (2 jambes, corps + tête + bras + blaster fusionnés, yeux) ; joueur 9 (les 7 du chibi, casque, blaster). */
const PAVATARS = typeof THREE === 'undefined' || typeof MODELES === 'undefined' || !MODELES ? null : (() => {
  'use strict';
  const M = MODELES, TAU = Math.PI * 2, HP = Math.PI / 2;
  const R = typeof PREGLES !== 'undefined' ? PREGLES : null;
  const COULEURS = R ? R.COULEURS : ['#FF6B8B', '#5FD3A4', '#7FB3FF', '#FFC84A', '#B8A6FF', '#FF9F5A', '#4FD1E0', '#F48FD8'];
  const hash = R ? R.hash : (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const NAVY = '#2B2A4C', GRIS = '#8E8AA8', GRIS_C = '#B9B5CF', CREME = '#FFF6E8', OR = '#FFC84A';
  const HAUTEUR = 1.65, K = HAUTEUR / 73; // un chibi de PERSOS (73 unités) ramené à 1,65 m
  const HAUT_CHIBI = 0.025 / K; // le balancement du haut du corps d'un chibi (C3) : 2,5 cm, en unités de PERSOS
  const memo = (k, f) => { k = 'pav|' + k; let g = M.GEOS.get(k); if (!g) { g = f(); g.userData.cache = true; M.GEOS.set(k, g); } return g; };
  const couleurArme = (id) => { const a = R ? R.arme(id) : null; return a && a.couleur ? a.couleur : id === 'pompe' ? '#5FD3A4' : id === 'precision' ? '#B8A6FF' : '#FF6B8B'; };
  // une pièce orientée le long d'un segment (capsule ou cylindre centré sur Y) : de a à b
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
  function entre(geo, col, a, b) { _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); const l = _a.distanceTo(_b); _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); const m = new THREE.Matrix4().compose(_a.clone().add(_b.clone().multiplyScalar(l / 2)), _q.clone(), new THREE.Vector3(1, 1, 1)); return { geo, col, m }; }
  const deplacer = (parts, p) => { const m = M.matrice(p); return parts.map((q) => ({ geo: q.geo, col: q.col, m: q.m ? m.clone().multiply(q.m) : m.clone() })); };

  // ─── les blasters à peinture : canon vers −z, poignée à l'origine ; corps à la couleur de l'arme, réservoir de peinture sur le dessus ───
  const BOUCHE = { rafale: [0, 0.075, -0.47], pompe: [0, 0.08, -0.5], precision: [0, 0.07, -0.66] };
  function partsBlaster(id) {
    const c = couleurArme(id), cl = M.eclaircir(c, 0.45), fo = M.assombrir(c, 0.22), p = [];
    if (id === 'pompe') { // trapu : gros canon évasé, pompe sous le canon, réservoir rond
      p.push(M.part(M.boite(0.12, 0.13, 0.36, 0.035), c, { y: 0.02, z: -0.1 }), M.part(M.cylindre(0.042, 0.042, 0.2, 10), CREME, { y: 0.08, z: -0.32, rx: -HP }));
      p.push(M.part(M.cylindre(0.062, 0.045, 0.06, 10), fo, { y: 0.08, z: -0.44, rx: -HP }), M.part(M.tore(0.055, 0.012, TAU, 5, 12), CREME, { y: 0.08, z: -0.5 }));
      p.push(M.part(M.boite(0.075, 0.06, 0.16, 0.025), fo, { y: -0.03, z: -0.33 }), M.part(M.sphere(0.062, 10), cl, { y: 0.16, z: -0.1, sy: 0.8 }), M.part(M.sphere(0.018, 8), OR, { y: 0.205, z: -0.1 }));
    } else if (id === 'precision') { // long : canon fin, lunette, crosse
      p.push(M.part(M.boite(0.08, 0.1, 0.42, 0.028), c, { y: 0.02, z: -0.12 }), M.part(M.cylindre(0.02, 0.02, 0.34, 8), CREME, { y: 0.07, z: -0.48, rx: -HP }));
      p.push(M.part(M.tore(0.026, 0.009, TAU, 4, 10), fo, { y: 0.07, z: -0.64 }), M.part(M.cylindre(0.03, 0.03, 0.22, 10), NAVY, { y: 0.14, z: -0.1, rx: -HP }));
      p.push(M.part(M.cylindre(0.036, 0.036, 0.02, 10), '#9FE3FF', { y: 0.14, z: -0.215, rx: -HP }), M.part(M.cylindre(0.036, 0.036, 0.02, 10), '#9FE3FF', { y: 0.14, z: 0.015, rx: -HP }));
      p.push(M.part(M.boite(0.06, 0.12, 0.16, 0.025), fo, { y: -0.01, z: 0.16 }), M.part(M.capsule(0.03, 0.08, 6), cl, { y: 0.1, z: 0.05, rx: HP }));
    } else { // rafale : compact, canon moyen, réservoir en capsule
      p.push(M.part(M.boite(0.09, 0.11, 0.34, 0.03), c, { y: 0.02, z: -0.12 }), M.part(M.cylindre(0.027, 0.027, 0.16, 8), CREME, { y: 0.075, z: -0.37, rx: -HP }));
      p.push(M.part(M.tore(0.03, 0.011, TAU, 4, 10), fo, { y: 0.075, z: -0.45 }), M.part(M.capsule(0.036, 0.11, 8), cl, { y: 0.15, z: -0.13, rx: HP }), M.part(M.sphere(0.016, 8), OR, { y: 0.19, z: -0.06 }));
      p.push(M.part(M.boite(0.1, 0.03, 0.05, 0.01), OR, { y: 0.06, z: -0.27 }));
    }
    p.push(M.part(M.boite(0.06, 0.13, 0.07, 0.02), NAVY, { y: -0.1, z: 0.03, rx: 0.25 }), M.part(M.tore(0.03, 0.008, Math.PI, 4, 8), NAVY, { y: -0.03, z: -0.05, rx: 0, rz: Math.PI })); // poignée et pontet
    return p;
  }
  const blaster = (id) => memo('blaster|' + id, () => M.assembler(partsBlaster(BOUCHE[id] ? id : 'rafale')));

  // ─── les robots : corps, tête, bras et blaster en UN maillage (une géométrie en cache par couleur et par arme) ───
  const HANCHE = 0.56;
  function partsRobot(col, arme) {
    const c = M.eclaircir(col, 0.12), tete = M.eclaircir(col, 0.55), fo = M.assombrir(col, 0.18), p = [];
    p.push(M.part(M.boite(0.36, 0.14, 0.27, 0.05), GRIS, { y: -0.06 }), M.part(M.boite(0.62, 0.58, 0.44, 0.16, 1), c, { y: 0.04 })); // bassin, tronc
    p.push(M.part(M.boite(0.38, 0.26, 0.06, 0.05, 1), CREME, { y: 0.15, z: 0.205 }), M.part(M.sphere(0.045, 8), OR, { y: 0.28, z: 0.24 }), M.part(M.boite(0.05, 0.03, 0.02, 0.008), '#FF8FB1', { x: -0.09, y: 0.21, z: 0.24 }), M.part(M.boite(0.05, 0.03, 0.02, 0.008), '#7FD8FF', { x: 0.09, y: 0.21, z: 0.24 }));
    p.push(M.part(M.cylindre(0.08, 0.08, 0.09, 10), GRIS, { y: 0.6 }), M.part(M.boite(0.68, 0.48, 0.54, 0.18, 1), tete, { y: 0.66 })); // cou, tête
    p.push(M.part(M.boite(0.54, 0.27, 0.06, 0.09, 1), NAVY, { y: 0.765, z: 0.25 })); // la visière sombre où brillent les yeux
    for (const sx of [-1, 1]) p.push(M.part(M.cylindre(0.1, 0.1, 0.06, 12), fo, { x: sx * 0.36, y: 0.9, rz: HP }), M.part(M.sphere(0.095, 10), GRIS_C, { x: sx * 0.35, y: 0.47 })); // oreilles, épaules
    p.push(M.part(M.cylindre(0.018, 0.018, 0.22, 6), GRIS, { y: 1.13 }), M.part(M.sphere(0.06, 10), col === '#FFC84A' ? '#FF6B8B' : OR, { y: 1.38 })); // l'antenne
    p.push(M.part(M.boite(0.34, 0.16, 0.05, 0.04, 1), fo, { y: 0.83, z: -0.29 }), M.part(M.capsule(0.11, 0.2, 8), M.eclaircir(couleurArme(arme), 0.35), { y: 0.33, z: -0.27 }), M.part(M.sphere(0.035, 8), CREME, { y: 0.54, z: -0.27 })); // dans le dos : une grille, le réservoir de peinture
    // les bras tiennent le blaster devant eux : épaule → coude → main (la droite du robot est en −x quand il regarde +z)
    const md = [-0.07, 0.36, 0.3], mg = [0.05, 0.4, 0.5];
    for (const [ep, co, ma] of [[[-0.35, 0.47, 0], [-0.3, 0.3, 0.18], md], [[0.35, 0.47, 0], [0.26, 0.32, 0.24], mg]]) {
      p.push(entre(M.capsule(0.06, 0.12, 6), GRIS_C, ep, co), entre(M.capsule(0.055, 0.12, 6), c, co, ma), M.part(M.sphere(0.07, 8), fo, { x: ma[0], y: ma[1], z: ma[2] }));
    }
    p.push(...deplacer(partsBlaster(arme), { x: -0.05, y: 0.33, z: 0.32, ry: Math.PI, s: 1.25 }));
    return p;
  }
  const geoRobot = (col, arme) => memo(`robot|${col}|${arme}`, () => M.assembler(partsRobot(col, arme)));
  // une jambe pend de la hanche (son pivot) jusqu'au sol, HANCHE plus bas : la cuisse-tibia en capsule, le pied arrondi
  const geoJambeRobot = (col) => memo('jrobot|' + col, () => M.assembler([M.part(M.capsule(0.075, 0.26, 8), GRIS, { y: -0.2 }), M.part(M.boite(0.2, 0.11, 0.3, 0.045), M.assombrir(col, 0.1), { y: -HANCHE, z: 0.04 })]));
  // les yeux LED : ronds (normal), plissés (tir) et en croix (touché), échangés sans allocation ; centrés à 0,06 au-dessus du pivot
  const barre = () => memo('barre-yeux', () => new THREE.BoxGeometry(0.032, 0.14, 0.02));
  const YEUX = []; // les trois géométries, gardées ici : animer ne recompose jamais la clé du cache
  const geoYeux = (k) => YEUX[k] || (YEUX[k] = memo('yeux|' + k, () => {
    if (k === 2) { const p = []; for (const sx of [-1, 1]) for (const a of [0.7, -0.7]) p.push(M.part(barre(), '#FFFFFF', { x: sx * 0.11, y: 0.06, rz: a })); return M.assembler(p); }
    const h = k === 1 ? 0.045 : 0.12; return M.assembler([M.part(M.boite(0.085, h, 0.02, 0.02), '#FFFFFF', { x: -0.11, y: 0.06 - h / 2 }), M.part(M.boite(0.085, h, 0.02, 0.02), '#FFFFFF', { x: 0.11, y: 0.06 - h / 2 })]);
  }));
  let matLed = null, matLedRose = null, matFlash = null;
  const mats = () => {
    if (!matLed) {
      matLed = M.partager(new THREE.MeshBasicMaterial({ color: '#C9FFF4' })); matLedRose = M.partager(new THREE.MeshBasicMaterial({ color: '#FF9EC0' }));
      matFlash = M.partager(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#FFFFFF'), emissiveIntensity: 0.6 }));
    }
  };
  function robot(e, col, arme) {
    mats();
    const g = new THREE.Group(), racine = new THREE.Group(), haut = new THREE.Group(); g.add(racine);
    const jambes = [-1, 1].map((sx) => { const j = M.mesh(geoJambeRobot(col), M.MAT.vertex, { x: sx * 0.17, y: HANCHE }); racine.add(j); return j; });
    haut.position.y = HANCHE; racine.add(haut);
    const corps = M.mesh(geoRobot(col, arme), M.MAT.vertex); haut.add(corps);
    const yeux = new THREE.Mesh(geoYeux(0), matLed); yeux.position.set(0, 0.84, 0.285); yeux.castShadow = false; haut.add(yeux);
    const bouche = new THREE.Object3D(); haut.add(bouche);
    return { groupe: g, racine, haut, jambes, corps, yeux, bouche, robot: true, col, arme };
  }
  // ─── les joueurs : un chibi de PERSOS, casque d'équipe (dôme, liseré, crête), blaster dans les mains ───
  const PEAUX = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE0C7'], CHEVEUX = ['#4A3328', '#8C5A3C', '#E0A61E', '#2B2A4C', '#C0623A'];
  const geoCasque = (col) => memo('casque|' + col, () => {
    const inc = new THREE.Matrix4().makeRotationX(-0.5), cal = new THREE.SphereGeometry(11.6, 16, 8, 0, TAU, 0, 1.3);
    const rim = new THREE.Matrix4().multiplyMatrices(inc, new THREE.Matrix4().makeTranslation(0, 11.6 * Math.cos(1.3), 0)).multiply(new THREE.Matrix4().makeRotationX(HP));
    const crete = new THREE.Matrix4().multiplyMatrices(inc, new THREE.Matrix4().makeTranslation(0, 11.4, -0.5)).multiply(new THREE.Matrix4().makeRotationX(HP));
    const g = M.assembler([{ geo: cal, col, m: inc }, { geo: M.tore(11.6 * Math.sin(1.3), 1.1, TAU, 6, 20), col: M.assombrir(col, 0.15), m: rim }, { geo: M.capsule(1.7, 13, 6), col: CREME, m: crete }]);
    cal.dispose(); return g;
  });
  function joueur(e, col, arme) {
    mats();
    const h = hash(String(e.id || e.nom || '')), P0 = PERSOS.creer({ haut: col, peau: PEAUX[h % PEAUX.length], cheveux: CHEVEUX[(h >>> 3) % CHEVEUX.length], coiffure: (h >>> 6) % 2 });
    const g = new THREE.Group(), racine = new THREE.Group(); g.add(racine); P0.scale.setScalar(K); racine.add(P0);
    const P = P0.userData.parts, casque = M.mesh(geoCasque(col), M.MAT.vertex, { y: 63 }); P.haut.add(casque);
    const visee = new THREE.Object3D(); visee.position.set(0, 46, 0); P.haut.add(visee);
    const arm = M.mesh(blaster(arme), M.MAT.vertex, { x: -2.5, y: -2.5, z: 15, ry: Math.PI, s: 1.25 / K }); visee.add(arm);
    const bouche = new THREE.Object3D(); visee.add(bouche);
    return { groupe: g, racine, P, perso: P0, casque, visee, armeM: arm, bouche, robot: false, col, arme, o: { marche: false, phase: 0, t: 0, blink: 0, expression: 'sourire', plateau: true } };
  }
  const couleurDe = (e) => (e && typeof e.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(e.couleur) ? e.couleur : COULEURS[hash(String(e && e.id)) % COULEURS.length]);
  const cle = (e) => `${e.bot || !e.humain ? 'r' : 'j'}|${couleurDe(e)}`;
  function creer(e) {
    const col = couleurDe(e), arme = BOUCHE[e.arme] ? e.arme : 'rafale', estRobot = !!(e.bot || !e.humain) || !PERSOS;
    const av = estRobot ? robot(e, col, arme) : joueur(e, col, arme);
    Object.assign(av, { cle: cle(e), id: e.id, px: +e.x || 0, pz: +e.z || 0, phase: 0, vit: 0, recul: 0, flash: 0, pop: -1, vivant: e.vivant !== false, cligne: (hash(String(e.id)) % 100) / 30, accr: 0, pitch: 0 });
    poserBouche(av); av.groupe.userData.avatar = av;
    return av;
  }
  function poserBouche(av) { // le bout du canon suit l'arme tenue
    const b = BOUCHE[av.arme] || BOUCHE.rafale;
    if (av.robot) av.bouche.position.set(-0.05 - b[0] * 1.25, 0.33 + b[1] * 1.25, 0.32 - b[2] * 1.25);
    else av.bouche.position.set(-2.5 - b[0] * 1.25 / K, -2.5 + b[1] * 1.25 / K, 15 - b[2] * 1.25 / K);
  }
  function changerArme(av, arme) {
    if (!BOUCHE[arme] || av.arme === arme) return; av.arme = arme;
    if (av.robot) av.corps.geometry = geoRobot(av.col, arme); else av.armeM.geometry = blaster(arme);
    poserBouche(av);
  }
  // ─── l'animation (sans allocation) ───
  // Les angles calculés s'écrivent dans les champs d'Euler (_x, _y, _z) puis tourner() recale le quaternion (comme src/persos.js) :
  // passés aux setters rotation.x / rotation.set, V8 les mettrait en boîte à chaque image (mesuré : ~80 octets par avatar et par image).
  // DÉPENDANCE DE VERSION (Three r158) : mêmes champs privés que PERSOS ; revenir aux setters si une mise à jour les renomme.
  const tourner = (o3) => o3.quaternion.setFromEuler(o3.rotation, false);
  function flasher(av, on) {
    const m = on ? matFlash : M.MAT.vertex;
    if (av.robot) { if (av.corps.material !== m) { av.corps.material = m; av.jambes[0].material = m; av.jambes[1].material = m; av.yeux.material = on ? matLedRose : matLed; } }
    else if (av.casque.material !== m) { av.casque.material = m; av.P.corps.material = m; av.P.tete.material = m; }
  }
  // px, py, pz (facultatifs) : la position affichée (rendu.js l'interpole entre deux pas de la simulation) ; sinon e.x, e.y, e.z
  function animer(av, e, dt, t, px, py, pz) {
    if (!(dt >= 0) || dt > 0.25) dt = 0;
    const g = av.groupe, vivant = e.vivant !== false;
    if (!vivant) { // éliminé : un petit « pop » (gonfle 0,12 s) puis plus rien, les confettis sont dans rendu.js
      if (av.vivant) { av.vivant = false; av.pop = 0; }
      if (av.pop >= 0 && av.pop < 0.12) { av.pop += dt; const k = 1 + av.pop * 2.5; av.racine.scale.set(k, 1.6 - k * 0.6, k); g.visible = true; flasher(av, true); }
      else { g.visible = false; av.pop = -1; }
      av.px = px === undefined ? +e.x : px; av.pz = pz === undefined ? +e.z : pz; return;
    }
    const x = px === undefined ? +e.x : +px, y = py === undefined ? +e.y : +py, z = pz === undefined ? +e.z : +pz;
    if (!av.vivant) { av.vivant = true; av.racine.scale.set(1, 1, 1); av.px = x; av.pz = z; av.flash = 0; flasher(av, false); }
    if (!(x - x === 0 && y - y === 0 && z - z === 0)) { g.visible = false; return; } // une position invalide : on ne dessine pas
    // vitesse et phase de marche (une téléportation ne compte pas)
    const dx = x - av.px, dz = z - av.pz, d = Math.sqrt(dx * dx + dz * dz); av.px = x; av.pz = z;
    const v = d < 3 && dt > 0 ? d / dt : 0; av.vit += (Math.min(7, v) - av.vit) * Math.min(1, dt * 10);
    // C3 : la phase φ de la foulée, comme la caméra (PCORPS.camera) : un pas de 0,75 + 0,2·v m, φ += π·d/pas (une foulée de deux pas = 2π)
    if (d < 3) { av.phase += Math.PI * d / (0.75 + 0.2 * av.vit); if (av.phase > 1e4) av.phase -= TAU * Math.floor(av.phase / TAU); }
    const marche = av.vit > 0.4, km = Math.min(1, av.vit / 4);
    g.position.x = x; g.position.y = y; g.position.z = z; g.rotation._y = (+e.yaw || 0) + Math.PI; tourner(g);
    // l'invincibilité du retour : il clignote
    g.visible = !(e.invincible > 0) || ((t * 9) | 0) % 2 === 0;
    av.accr += ((e.accroupi ? 1 : 0) - av.accr) * Math.min(1, dt * 12);
    const p = Math.max(-1.2, Math.min(1.2, +e.pitch || 0)); av.pitch += (p - av.pitch) * Math.min(1, dt * 14);
    av.recul = Math.max(0, av.recul - dt * 7); av.flash = Math.max(0, av.flash - dt); flasher(av, av.flash > 0);
    changerArme(av, e.arme);
    const enLAir = e.auSol === false, s = Math.sin(av.phase);
    if (av.robot) {
      const j0 = av.jambes[0], j1 = av.jambes[1], sw = marche ? s * 0.65 * km : 0;
      if (enLAir) { j0.rotation._x = -0.55; j1.rotation._x = 0.35; } else { j0.rotation._x = sw; j1.rotation._x = -sw; } tourner(j0); tourner(j1);
      const ec = 1 - av.accr * 0.42; j0.scale.y = j1.scale.y = ec; j0.position.y = j1.position.y = HANCHE * ec;
      av.haut.position.y = HANCHE * ec + (marche ? 0.02 * km * (1 - Math.cos(2 * av.phase)) / 2 : Math.sin(t * 2.2) * 0.006); // C3 : 2 cm une fois par pas
      const hr = av.haut.rotation; hr._x = -av.pitch * 0.45 + 0.07 * km - av.recul * 0.22; hr._z = marche ? s * 0.05 * km : 0; tourner(av.haut);
      av.haut.position.z = -av.recul * 0.05;
      // les yeux : clignent, se plissent au tir, en croix quand il est touché
      av.cligne += dt; if (av.cligne > 3.3) av.cligne = 0;
      const k = av.flash > 0 ? 2 : av.recul > 0.3 ? 1 : 0, geo = geoYeux(k); if (av.yeux.geometry !== geo) av.yeux.geometry = geo;
      av.yeux.scale.y = k === 0 && av.cligne > 3.15 ? 0.15 : 1;
    } else {
      const o = av.o; o.marche = marche && !enLAir; o.phase = av.phase; o.t = t; av.cligne += dt; if (av.cligne > 3.4) av.cligne = 0; o.blink = av.cligne; o.expression = av.flash > 0 ? 'surpris' : 'sourire';
      PERSOS.animer(av.perso, o);
      // C3 : PERSOS lève le haut du corps à |sin φ|·2/cos 52° unités (7 cm) ; on le réécrit à 2,5 cm·(1 − cos 2φ)/2, au même rythme que les jambes
      if (o.marche) av.P.haut.position.y = HAUT_CHIBI * km * (1 - Math.cos(2 * av.phase)) / 2;
      const P = av.P, b0 = P.bras[0], b1 = P.bras[1], ax = -1.45 - av.pitch * 0.85 + av.recul * 0.3;
      b0.rotation._x = ax; b0.rotation._y = 0; b0.rotation._z = 0.5; b1.rotation._x = ax; b1.rotation._y = 0; b1.rotation._z = -0.5; tourner(b0); tourner(b1);
      av.visee.rotation._x = -av.pitch * 0.85 - av.recul * 0.3; tourner(av.visee); av.visee.position.z = -av.recul * 3;
      if (enLAir) { P.jambes[0].rotation._x = -0.6; P.jambes[1].rotation._x = 0.4; tourner(P.jambes[0]); tourner(P.jambes[1]); }
      av.racine.position.y = -av.accr * 0.32; av.racine.scale.y = 1 - av.accr * 0.12;
    }
  }
  function tir(av) { if (av) av.recul = 1; }
  function touche(av) { if (av) av.flash = 0.11; }
  function bouche(av, v) { av.bouche.getWorldPosition(v); return v; }
  function liberer(av) { if (!av) return; if (av.groupe.parent) av.groupe.parent.remove(av.groupe); M.dispose(av.groupe); } // les géométries sont en cache : seuls les matériaux propres partent
  return { HAUTEUR, BOUCHE, creer, cle, animer, tir, touche, bouche, liberer, blaster, couleurArme, geoRobot };
})();
if (typeof module !== 'undefined') module.exports = PAVATARS;
