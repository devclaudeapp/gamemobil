/* OPÉRATION PONCIN — les personnages en 3D : joueurs (les chibis de PERSOS, src/persos.js, casqués aux couleurs de leur équipe) et robots
   (arrondis pastel, antenne, yeux LED), qui tiennent leur VRAIE arme (poncin/armes/*.glb, aussi utilisée en vue subjective) et prennent la
   pose de leur posture (debout, accroupi, glissade, couché, en visée, en course).
   Repère : mètres ; un avatar a les pieds à y = 0 et regarde vers −z quand son lacet vaut 0 (le contrat : yaw positif vers l'ouest).
   Les modèles sont dessinés face à +z (comme PERSOS) puis tournés de π. Toute l'animation se fait sans allocation (champs d'Euler et
   de position écrits directement, géométries en cache échangées, matériaux partagés). Voir src-poncin/ARCHITECTURE.md (section rendu).
   Les armes (section « les vraies armes ») : chaque GLB est lu une fois par THREE.GLTFLoader (vendor/poncin-GLTFLoader.js), aplati en UNE
   géométrie à couleurs de sommets (un appel de dessin, le matériau partagé MODELES.MAT.vertex), tourné canon vers −z et haut vers +y
   (sens trouvés sur la géométrie : l'axe le plus long ; le bout le plus fin est la bouche ; l'axe du canon est au-dessus du centre),
   mis à sa longueur réelle (AK-74 0,88 m … P226 0,2 m), l'origine à la poignée. Repères mesurés sur les modèles (GABARITS) : bouche,
   point de mire (la ligne de visée et la place de l'œil en visée), main gauche, fenêtre d'éjection. Sans GLTFLoader (vieille page) ou
   si un fichier manque : une arme procédurale au même gabarit, remplacée dès que le modèle arrive (armes.version change : les maillages
   se mettent à jour seuls). Sans Three (Node) : PAVATARS vaut null, comme avant.
   API : PAVATARS.creer(e) → av (av.groupe à poser dans la scène) ; cle(e) (l'apparence : recréer si elle change) ; animer(av, e, dt, t, x?, y?, z?) (la position affichée, sinon e.x…) ;
   tir(av) ; touche(av) ; bouche(av, v) (le bout du canon, en monde) ; liberer(av) ; posture(e) → 'debout' | 'accroupi' | 'glisse' | 'couche' ;
   armes : { charger(dossier) → Promise, etat ('aucun' | 'charge' | 'glb' | 'partiel' | 'procedural'), version, geo(id), infos(id), modele(id),
   classe(id), IDS, GABARITS } ; blaster(id) (= armes.geo, compat) ; BOUCHE[id] (compat : le bout du canon dans le repère de l'arme) ; HAUTEUR.
   Les ids d'armes : ceux de PREGLES.ARMES (ak74 … p226 ; le champ modele, sinon l'id) ; les blasters d'avant (rafale, pompe, precision…)
   prennent le modèle le plus proche.
   Appels de dessin : robot 5 (2 jambes, corps + tête + bras fusionnés, yeux, arme) ; joueur 9 (les 7 du chibi, casque, arme). */
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
  const estArme = (id) => !!(R && R.estArme && R.estArme(id));
  const couleurArme = (id) => { const a = estArme(id) ? R.arme(id) : null; return a && a.couleur ? a.couleur : '#FFD27A'; }; // compat (la couleur de la peinture d'avant)
  // une pièce orientée le long d'un segment (capsule ou cylindre centré sur Y) : de a à b
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
  function entre(geo, col, a, b) { _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); const l = _a.distanceTo(_b); _b.sub(_a).normalize(); _q.setFromUnitVectors(_Y, _b); const m = new THREE.Matrix4().compose(_a.clone().add(_b.clone().multiplyScalar(l / 2)), _q.clone(), new THREE.Vector3(1, 1, 1)); return { geo, col, m }; }

  // ═══════════════════════════════ les vraies armes ═══════════════════════════════
  // GABARITS : mesurés sur les modèles (captures de côté, grille en cm), dans le repère « bouche » : [z, y] avec z = distance à la bouche
  // le long du canon (m), y = hauteur au-dessus de l'axe du canon (m). poignee : la main droite (l'origine du repère de l'arme) ; garde :
  // la main gauche ; mire : z de l'œil quand on vise (la joue sur la crosse ; bras tendus aux pistolets) et y de la ligne de visée (le haut
  // des organes de visée, l'axe de la lunette) ; ejection : la fenêtre d'où sortent les douilles (côté droit) ; viseur : 'lunette' | 'point' | 'fer'.
  const GABARITS = {
    ak74: { long: 0.88, classe: 'fusil', poignee: [0.60, -0.06], garde: [0.28, -0.03], mire: [0.80, 0.045], ejection: [0.47, 0.015], viseur: 'point' },
    m4: { long: 0.84, classe: 'fusil', poignee: [0.59, -0.06], garde: [0.28, -0.03], mire: [0.76, 0.075], ejection: [0.48, 0.01], viseur: 'point' },
    ump: { long: 0.69, classe: 'mitraillette', poignee: [0.43, -0.07], garde: [0.20, -0.05], mire: [0.62, 0.09], ejection: [0.30, 0.02], viseur: 'point' },
    mp9: { long: 0.50, classe: 'mitraillette', poignee: [0.29, -0.05], garde: [0.175, -0.08], mire: [0.45, 0.065], ejection: [0.20, 0.02], viseur: 'point' },
    pompe: { long: 1.00, classe: 'pompe', poignee: [0.71, -0.04], garde: [0.30, -0.035], mire: [0.90, 0.062], ejection: [0.60, 0.01], viseur: 'fer' },
    m24: { long: 1.09, classe: 'sniper', poignee: [0.74, -0.05], garde: [0.45, -0.04], mire: [0.90, 0.034], ejection: [0.72, 0.02], viseur: 'lunette' },
    awm: { long: 1.20, classe: 'sniper', poignee: [0.91, -0.07], garde: [0.55, -0.04], mire: [1.02, 0.055], ejection: [0.80, 0.02], viseur: 'lunette' },
    m1911: { long: 0.22, classe: 'pistolet', poignee: [0.19, -0.05], garde: [0.17, -0.07], mire: [0.62, 0.045], ejection: [0.12, 0.02], viseur: 'fer' },
    p226: { long: 0.20, classe: 'pistolet', poignee: [0.17, -0.05], garde: [0.15, -0.07], mire: [0.58, 0.032], ejection: [0.11, 0.015], viseur: 'fer' },
  };
  const IDS3D = Object.keys(GABARITS);
  // les armes à peinture d'avant (régime historique, vieux tests) → le modèle le plus proche
  const ANCIENS = { rafale: 'ak74', carabine: 'm4', arrosoir: 'ump', arroseuse: 'mp9', pompe: 'pompe', precision: 'm24', petoire: 'p226' };
  const A3 = { geo: Object.create(null), proc: Object.create(null), infos: Object.create(null), version: 0, etat: 'aucun', promesse: null, erreurs: [], charges: 0 };
  function modeleDe(id) {
    if (GABARITS[id]) return id;
    const A = estArme(id) ? R.arme(id) : null;
    if (A && GABARITS[A.modele]) return A.modele;
    return ANCIENS[id] || 'ak74';
  }
  function classeDe(id) { const A = estArme(id) ? R.arme(id) : null; return A && A.classe ? A.classe : GABARITS[modeleDe(id)].classe; }
  // du repère « bouche » ([z, y]) à celui de l'arme (origine à la poignée, canon vers −z) : (0, y − Py, z − Pz)
  const versArme = (G, z, y) => [0, y - G.poignee[1], z - G.poignee[0]];
  function infos(id) {
    const m = modeleDe(id); let o = A3.infos[m]; if (o) return o;
    const G = GABARITS[m];
    o = A3.infos[m] = { id: m, classe: G.classe, long: G.long, viseur: G.viseur, lunette: G.viseur === 'lunette',
      bouche: versArme(G, 0, 0), mire: versArme(G, G.mire[0], G.mire[1]), garde: versArme(G, G.garde[0], G.garde[1]), ejection: versArme(G, G.ejection[0], G.ejection[1]),
      arriere: versArme(G, G.long, 0) };
    o.ejection[0] = 0.025; // le côté droit de la carcasse
    return o;
  }
  // l'arme procédurale (repli) : canon, carcasse, poignée, chargeur, crosse, lunette, au gabarit du modèle
  function procedurale(m) {
    const G = GABARITS[m], L = G.long, P = G.poignee, p = [], noir = '#2A2B2E', gris = '#45474C', bois = '#6B4A33';
    const bx = (w, h, d, col, z, y, rx) => p.push({ geo: new THREE.BoxGeometry(w, h, d), col, m: M.matrice({ y: y - P[1], z: z - P[0], rx: rx || 0 }) });
    const cy = (r, l, col, z, y) => p.push({ geo: new THREE.CylinderGeometry(r, r, l, 8), col, m: M.matrice({ y: y - P[1], z: z - P[0], rx: HP }) });
    if (G.classe === 'pistolet') { bx(0.028, 0.032, L, gris, L / 2, 0.012); bx(0.026, 0.11, 0.035, noir, P[0], P[1] - 0.02, -0.25); }
    else {
      const rec = G.classe === 'mitraillette' ? 0.5 : 0.38; // la part de la carcasse
      cy(0.009, L * 0.45, noir, L * 0.225, 0); bx(0.04, 0.06, L * rec, gris, P[0] - L * rec * 0.35, 0.0);
      bx(0.03, 0.09, 0.035, noir, P[0], P[1] - 0.02, -0.3);
      if (G.classe !== 'pompe' && G.classe !== 'sniper') bx(0.026, 0.13, 0.04, noir, (P[0] + G.garde[0]) / 2, -0.09, 0.2);
      if (G.classe === 'pompe') cy(0.02, 0.2, noir, G.garde[0], -0.03);
      bx(0.035, 0.08, L - P[0] - 0.03, G.classe === 'sniper' || G.classe === 'pompe' ? bois : noir, (P[0] + L) / 2 + 0.015, -0.03);
      if (G.viseur === 'lunette') cy(0.02, 0.3, noir, G.mire[0] - 0.3, G.mire[1]);
    }
    const g = M.assembler(p); p.forEach((q) => q.geo.dispose()); g.computeBoundingSphere(); g.userData.cache = true; return g;
  }
  // la géométrie de l'arme : le modèle GLB s'il est arrivé, sinon la procédurale (créée une fois)
  function geoArme(id) { const m = modeleDe(id); return A3.geo[m] || A3.proc[m] || (A3.proc[m] = procedurale(m)); }
  // un GLB lu → UNE géométrie à couleurs de sommets dans le repère de l'arme (voir l'en-tête : orientation trouvée sur la géométrie)
  function aplatir(m, racine) {
    const G = GABARITS[m], V = THREE.Vector3, morceaux = [];
    racine.updateMatrixWorld(true);
    racine.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position) morceaux.push(o); });
    if (!morceaux.length) throw new Error('aucun maillage');
    const chaque = (f) => { for (const o of morceaux) { const p = o.geometry.attributes.position; for (let k = 0; k < p.count; k++) f(v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld)); } };
    const bb = new THREE.Box3(), v = new V();
    chaque((q) => bb.expandByPoint(q));
    const s = bb.getSize(new V()), c = bb.getCenter(new V()), axes = ['x', 'y', 'z'].sort((a, b) => s[b] - s[a]), lo = axes[0], ha = axes[1];
    // les deux bouts : le plus fin (en hauteur) est la bouche ; l'axe du canon (milieu de la tranche de la bouche) est au-dessus du centre
    const tranche = (f0, f1) => { let mn = Infinity, mx = -Infinity; chaque((q) => { const t = (q[lo] - bb.min[lo]) / s[lo]; if (t >= f0 && t <= f1) { if (q[ha] < mn) mn = q[ha]; if (q[ha] > mx) mx = q[ha]; } }); return { h: mx - mn, c: (mn + mx) / 2 }; };
    const t0 = tranche(0, 0.06), t1 = tranche(0.94, 1), auMax = t1.h < t0.h, haut = ((auMax ? t1.c : t0.c) - c[ha]) > 0 ? 1 : -1;
    const E = { x: new V(1, 0, 0), y: new V(0, 1, 0), z: new V(0, 0, 1) }, Zv = E[lo].clone().multiplyScalar(auMax ? -1 : 1), Yv = E[ha].clone().multiplyScalar(haut), Xv = new V().crossVectors(Yv, Zv);
    const k = G.long / s[lo];
    // la bouche (z minimal) et l'axe du canon (milieu de la tranche des 3 premiers %) dans le repère normalisé
    let zMin = Infinity; chaque((q) => { const z = q.sub(c).dot(Zv) * k; if (z < zMin) zMin = z; });
    let y0 = Infinity, y1 = -Infinity; chaque((q) => { q.sub(c); if (q.dot(Zv) * k < zMin + G.long * 0.03) { const y = q.dot(Yv) * k; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
    const ya = (y0 + y1) / 2;
    // la matrice complète : centre → base (X, Y, Z) → échelle → bouche à l'origine → poignée à l'origine
    const B = new THREE.Matrix4().makeBasis(Xv, Yv, Zv).transpose(), N = new THREE.Matrix4().makeTranslation(0, -ya - G.poignee[1], -zMin - G.poignee[0]).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(B).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    const parts = [], col = new THREE.Color();
    for (const o of morceaux) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(N, o.matrixWorld)); if (!g.attributes.normal) g.computeVertexNormals();
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat && mat.color) col.copy(mat.color); else col.setRGB(0.05, 0.05, 0.05);
      // les couleurs du pack sont très sombres (l'acier presque noir) : relevées d'un cran pour qu'on lise les formes dans la lumière du jeu
      col.setRGB(col.r * 1.3 + 0.014, col.g * 1.3 + 0.014, col.b * 1.3 + 0.014);
      parts.push({ geo: g, col: '#' + col.getHexString() }); // en sRGB : assembler la relit (THREE.Color.set) et revient au linéaire
    }
    const out = M.assembler(parts); parts.forEach((q) => q.geo.dispose());
    out.computeBoundingSphere(); out.computeBoundingBox(); out.userData.cache = true; out.userData.glb = m;
    return out;
  }
  function chargerUn(loader, m, dossier) {
    return new Promise((ok) => {
      try {
        loader.load(dossier + m + '.glb', (gltf) => {
          try { const g = aplatir(m, gltf.scene); A3.geo[m] = g; A3.charges++; A3.version++; } catch (e) { A3.erreurs.push(m + ' : ' + (e && e.message)); }
          try { gltf.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const x of ms) x.dispose(); }); } catch (e) { /* rien */ }
          ok();
        }, null, (e) => { A3.erreurs.push(m + ' : ' + (e && e.message ? e.message : 'introuvable')); ok(); });
      } catch (e) { A3.erreurs.push(m + ' : ' + (e && e.message)); ok(); }
    });
  }
  // armes.charger(dossier) : lit les 9 modèles, une seule fois (dossier : 'armes/' depuis poncin/index.html, '../poncin/armes/' depuis test/)
  function charger(dossier) {
    if (A3.promesse) return A3.promesse;
    if (typeof THREE.GLTFLoader !== 'function') { A3.etat = 'procedural'; A3.promesse = Promise.resolve(A3.etat); return A3.promesse; }
    A3.etat = 'charge'; const loader = new THREE.GLTFLoader(), d = typeof dossier === 'string' ? dossier : 'armes/';
    A3.promesse = Promise.all(IDS3D.map((m) => chargerUn(loader, m, d))).then(() => { A3.etat = A3.charges === IDS3D.length ? 'glb' : A3.charges ? 'partiel' : 'procedural'; return A3.etat; });
    return A3.promesse;
  }
  const BOUCHE = new Proxy(Object.create(null), { get: (o, id) => (typeof id === 'string' ? infos(id).bouche : undefined), has: () => true }); // compat : BOUCHE[id]
  const armes = { charger, geo: geoArme, infos, modele: modeleDe, classe: classeDe, GABARITS, IDS: IDS3D,
    get etat() { return A3.etat; }, get version() { return A3.version; }, get erreurs() { return A3.erreurs.slice(); }, get charges() { return A3.charges; } };

  // ═══════════════════════════════ les robots ═══════════════════════════════
  // corps, tête et bras en UN maillage (une géométrie en cache par couleur) ; l'arme est un maillage à part dans la main droite
  const HANCHE = 0.56;
  const MAIN_R = [-0.07, 0.36, 0.3], MAIN_G = [0.05, 0.4, 0.5]; // la main droite (la poignée de l'arme), la gauche (la garde)
  function partsRobot(col) {
    const c = M.eclaircir(col, 0.12), tete = M.eclaircir(col, 0.55), fo = M.assombrir(col, 0.18), p = [];
    p.push(M.part(M.boite(0.36, 0.14, 0.27, 0.05), GRIS, { y: -0.06 }), M.part(M.boite(0.62, 0.58, 0.44, 0.16, 1), c, { y: 0.04 })); // bassin, tronc
    p.push(M.part(M.boite(0.38, 0.26, 0.06, 0.05, 1), CREME, { y: 0.15, z: 0.205 }), M.part(M.sphere(0.045, 8), OR, { y: 0.28, z: 0.24 }), M.part(M.boite(0.05, 0.03, 0.02, 0.008), '#FF8FB1', { x: -0.09, y: 0.21, z: 0.24 }), M.part(M.boite(0.05, 0.03, 0.02, 0.008), '#7FD8FF', { x: 0.09, y: 0.21, z: 0.24 }));
    p.push(M.part(M.cylindre(0.08, 0.08, 0.09, 10), GRIS, { y: 0.6 }), M.part(M.boite(0.68, 0.48, 0.54, 0.18, 1), tete, { y: 0.66 })); // cou, tête
    p.push(M.part(M.boite(0.54, 0.27, 0.06, 0.09, 1), NAVY, { y: 0.765, z: 0.25 })); // la visière sombre où brillent les yeux
    for (const sx of [-1, 1]) p.push(M.part(M.cylindre(0.1, 0.1, 0.06, 12), fo, { x: sx * 0.36, y: 0.9, rz: HP }), M.part(M.sphere(0.095, 10), GRIS_C, { x: sx * 0.35, y: 0.47 })); // oreilles, épaules
    p.push(M.part(M.cylindre(0.018, 0.018, 0.22, 6), GRIS, { y: 1.13 }), M.part(M.sphere(0.06, 10), col === '#FFC84A' ? '#FF6B8B' : OR, { y: 1.38 })); // l'antenne
    p.push(M.part(M.boite(0.34, 0.16, 0.05, 0.04, 1), fo, { y: 0.83, z: -0.29 }), M.part(M.boite(0.3, 0.26, 0.12, 0.04, 1), '#5E6B4E', { y: 0.2, z: -0.3 }), M.part(M.boite(0.12, 0.07, 0.03, 0.015), '#48523C', { y: 0.36, z: -0.37 })); // dans le dos : une grille, la musette des chargeurs
    // les bras tiennent l'arme devant eux : épaule → coude → main (la droite du robot est en −x quand il regarde +z)
    for (const [ep, co, ma] of [[[-0.35, 0.47, 0], [-0.3, 0.3, 0.18], MAIN_R], [[0.35, 0.47, 0], [0.26, 0.32, 0.24], MAIN_G]]) {
      p.push(entre(M.capsule(0.06, 0.12, 6), GRIS_C, ep, co), entre(M.capsule(0.055, 0.12, 6), c, co, ma), M.part(M.sphere(0.07, 8), fo, { x: ma[0], y: ma[1], z: ma[2] }));
    }
    return p;
  }
  const geoRobot = (col) => memo(`robot2|${col}`, () => M.assembler(partsRobot(col)));
  // une jambe pend de la hanche (son pivot) jusqu'au sol, HANCHE plus bas : la cuisse-tibia en capsule, le pied arrondi
  const geoJambeRobot = (col) => memo('jrobot|' + col, () => M.assembler([M.part(M.capsule(0.075, 0.26, 8), GRIS, { y: -0.2 }), M.part(M.boite(0.2, 0.11, 0.3, 0.045), M.assombrir(col, 0.1), { y: -HANCHE, z: 0.04 })]));
  // les yeux LED : ronds (normal), plissés (tir, visée) et en croix (touché), échangés sans allocation ; centrés à 0,06 au-dessus du pivot
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
  // l'arme tenue : son maillage (repère de l'arme : poignée à l'origine, canon vers −z), tourné de π pour viser +z comme le modèle ;
  // le bout du canon (bouche) en enfant
  function armeTenue(parent, id, x, y, z, s) {
    const mesh = new THREE.Mesh(geoArme(id), M.MAT.vertex); mesh.castShadow = true; mesh.position.set(x, y, z); mesh.rotation.y = Math.PI; mesh.scale.setScalar(s);
    const bouche = new THREE.Object3D(); mesh.add(bouche); parent.add(mesh); return { mesh, bouche };
  }
  function robot(e, col, arme) {
    mats();
    const g = new THREE.Group(), racine = new THREE.Group(), haut = new THREE.Group(); g.add(racine);
    const jambes = [-1, 1].map((sx) => { const j = M.mesh(geoJambeRobot(col), M.MAT.vertex, { x: sx * 0.17, y: HANCHE }); racine.add(j); return j; });
    haut.position.y = HANCHE; racine.add(haut);
    const corps = M.mesh(geoRobot(col), M.MAT.vertex); haut.add(corps);
    const yeux = new THREE.Mesh(geoYeux(0), matLed); yeux.position.set(0, 0.84, 0.285); yeux.castShadow = false; haut.add(yeux);
    const t = armeTenue(haut, arme, MAIN_R[0], MAIN_R[1], MAIN_R[2], 1.15);
    return { groupe: g, racine, haut, jambes, corps, yeux, armeM: t.mesh, bouche: t.bouche, robot: true, col, arme: '' };
  }
  // ─── les joueurs : un chibi de PERSOS, casque d'équipe (dôme, liseré, crête), l'arme dans les mains ───
  const PEAUX = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE0C7'], CHEVEUX = ['#4A3328', '#8C5A3C', '#E0A61E', '#2B2A4C', '#C0623A'];
  const geoCasque = (col) => memo('casque|' + col, () => {
    const inc = new THREE.Matrix4().makeRotationX(-0.5), cal = new THREE.SphereGeometry(11.6, 16, 8, 0, TAU, 0, 1.3);
    const rim = new THREE.Matrix4().multiplyMatrices(inc, new THREE.Matrix4().makeTranslation(0, 11.6 * Math.cos(1.3), 0)).multiply(new THREE.Matrix4().makeRotationX(HP));
    const crete = new THREE.Matrix4().multiplyMatrices(inc, new THREE.Matrix4().makeTranslation(0, 11.4, -0.5)).multiply(new THREE.Matrix4().makeRotationX(HP));
    const g = M.assembler([{ geo: cal, col, m: inc }, { geo: M.tore(11.6 * Math.sin(1.3), 1.1, TAU, 6, 20), col: M.assombrir(col, 0.15), m: rim }, { geo: M.capsule(1.7, 13, 6), col: CREME, m: crete }]);
    cal.dispose(); return g;
  });
  const S_CHIBI = 0.92 / (1.25 * K); // l'arme dans le repère du haut du chibi (unités de PERSOS, sous la racine × 1,25) : 92 % de sa vraie taille
  function joueur(e, col, arme) {
    mats();
    const h = hash(String(e.id || e.nom || '')), P0 = PERSOS.creer({ haut: col, peau: PEAUX[h % PEAUX.length], cheveux: CHEVEUX[(h >>> 3) % CHEVEUX.length], coiffure: (h >>> 6) % 2 });
    const g = new THREE.Group(), racine = new THREE.Group(); g.add(racine); P0.scale.setScalar(K); racine.add(P0);
    const P = P0.userData.parts, casque = M.mesh(geoCasque(col), M.MAT.vertex, { y: P.cou ? 11 : 63 }); (P.cou || P.haut).add(casque); // sur le cou : il suit la tête
    const visee = new THREE.Object3D(); visee.position.set(0, 46, 0); P.haut.add(visee);
    const t = armeTenue(visee, arme, -3.5, -4, 13, S_CHIBI);
    return { groupe: g, racine, P, perso: P0, casque, visee, armeM: t.mesh, bouche: t.bouche, robot: false, col, arme: '', o: { marche: false, phase: 0, t: 0, blink: 0, expression: 'sourire', plateau: true } };
  }
  const couleurDe = (e) => (e && typeof e.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(e.couleur) ? e.couleur : COULEURS[hash(String(e && e.id)) % COULEURS.length]);
  const cle = (e) => `${e.bot || !e.humain ? 'r' : 'j'}|${couleurDe(e)}`;
  function creer(e) {
    const col = couleurDe(e), arme = e.arme || 'ak74', estRobot = !!(e.bot || !e.humain) || !PERSOS;
    const av = estRobot ? robot(e, col, arme) : joueur(e, col, arme);
    Object.assign(av, { cle: cle(e), id: e.id, px: +e.x || 0, pz: +e.z || 0, phase: 0, vit: 0, recul: 0, flash: 0, pop: -1, vivant: e.vivant !== false, cligne: (hash(String(e.id)) % 100) / 30, accr: 0, pitch: 0,
      couche: 0, glisse: 0, vise: 0, armeV: -1, classe: 'fusil' });
    changerArme(av, arme); av.groupe.userData.avatar = av;
    return av;
  }
  function changerArme(av, arme) { // l'arme tenue (et sa bouche) ; aussi quand le modèle GLB arrive (armes.version)
    if (av.arme === arme && av.armeV === A3.version) return;
    av.arme = arme; av.armeV = A3.version; av.classe = classeDe(arme);
    av.armeM.geometry = geoArme(arme); const b = infos(arme).bouche; av.bouche.position.set(b[0], b[1], b[2]);
  }
  // la posture affichée d'une entité : celle du corps v2 (e.posture ; e.vers pendant une transition), sinon les drapeaux de l'instantané
  // (e.drapeaux : 32 couché, 64 glissade ; ou e.couche, e.glisse), sinon l'accroupi historique
  const DR = (e) => (typeof e.drapeaux === 'number' ? e.drapeaux : 0);
  function posture(e) {
    const p = e.vers && e.transition > 0 ? e.vers : e.posture;
    if (p === 'debout' || p === 'accroupi' || p === 'glisse' || p === 'couche') return p;
    const d = DR(e); return e.couche || d & 32 ? 'couche' : e.glisse || d & 64 ? 'glisse' : e.accroupi ? 'accroupi' : 'debout';
  }
  const viseDe = (e) => (e.vise > 0 ? Math.min(1, +e.vise) : DR(e) & 256 ? 1 : 0); // drapeau 256 : vise ≥ 0,5
  const courtDe = (e) => !!(e.course || DR(e) & 128);
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
  // le recul de l'arme selon sa classe (le pistolet saute, le sniper et la pompe poussent, la mitraillette vibre)
  const RECUL = { fusil: 1, mitraillette: 0.6, pompe: 1.6, sniper: 1.8, pistolet: 1.2 };
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
    const v = d < 3 && dt > 0 ? d / dt : 0; av.vit += (Math.min(9, v) - av.vit) * Math.min(1, dt * 10);
    // C3 : la phase φ de la foulée, comme la caméra (PCORPS.camera) : un pas de 0,75 + 0,2·v m, φ += π·d/pas (une foulée de deux pas = 2π)
    if (d < 3) { av.phase += Math.PI * d / (0.75 + 0.2 * av.vit); if (av.phase > 1e4) av.phase -= TAU * Math.floor(av.phase / TAU); }
    g.position.x = x; g.position.y = y; g.position.z = z; g.rotation._y = (+e.yaw || 0) + Math.PI; tourner(g);
    // l'invincibilité du retour : il clignote
    g.visible = !(e.invincible > 0) || ((t * 9) | 0) % 2 === 0;
    // la posture : des poids lissés (accroupi, couché, glissade, visée) ; la glissade et le couché ne marchent pas
    const pos = posture(e), vise = viseDe(e);
    av.accr += ((pos === 'accroupi' ? 1 : 0) - av.accr) * Math.min(1, dt * 12);
    av.couche += ((pos === 'couche' ? 1 : 0) - av.couche) * Math.min(1, dt * 5);
    av.glisse += ((pos === 'glisse' ? 1 : 0) - av.glisse) * Math.min(1, dt * 10);
    av.vise += (vise - av.vise) * Math.min(1, dt * 10);
    const marche = av.vit > 0.4 && av.couche < 0.5 && av.glisse < 0.5, km = Math.min(1, av.vit / 4), course = courtDe(e) && marche;
    const p = Math.max(-1.2, Math.min(1.2, +e.pitch || 0)); av.pitch += (p - av.pitch) * Math.min(1, dt * 14);
    av.recul = Math.max(0, av.recul - dt * 7); av.flash = Math.max(0, av.flash - dt); flasher(av, av.flash > 0);
    changerArme(av, e.arme || av.arme);
    const enLAir = e.auSol === false && av.glisse < 0.5, s = Math.sin(av.phase), rc = av.recul * (RECUL[av.classe] || 1);
    const kc = av.couche, kg = av.glisse * (1 - kc), kv = av.vise * (1 - kg) * (1 - kc * 0.5), ka = av.accr * (1 - kc) * (1 - kg);
    // le corps entier : couché (pivoté face au sol autour des pieds, reculé de 0,95 m : la tête devant, à la sphère de tête de la
    // capsule couchée), glissade (penché en arrière, les jambes devant), accroupi (plus bas)
    const rr = av.racine.rotation; rr._x = kc * HP - kg * 0.75; tourner(av.racine);
    av.racine.position.z = -kc * 0.95 - kg * 0.2;
    if (av.robot) {
      const j0 = av.jambes[0], j1 = av.jambes[1], sw = marche ? s * (course ? 0.85 : 0.65) * km : 0;
      if (enLAir) { j0.rotation._x = -0.55; j1.rotation._x = 0.35; }
      else { j0.rotation._x = sw - kg * 1.25 - ka * 0.9 + kc * 0.15; j1.rotation._x = -sw - kg * 1.0 - ka * 0.2 - kc * 0.1; }
      tourner(j0); tourner(j1);
      const ec = 1 - ka * 0.3; j0.scale.y = j1.scale.y = ec; j0.position.y = j1.position.y = HANCHE * ec;
      av.racine.position.y = -ka * 0.12 + kc * 0.32 - kg * 0.12;
      av.haut.position.y = HANCHE * ec + (marche ? 0.02 * km * (1 - Math.cos(2 * av.phase)) / 2 : Math.sin(t * 2.2) * 0.006); // C3 : 2 cm une fois par pas
      // le haut : le regard (couché, la tête relevée), penché en course, en avant en glissade, l'arme épaulée en visée
      const hr = av.haut.rotation; hr._x = (-av.pitch * 0.45 + (course ? 0.22 : 0.07) * km - rc * 0.22) * (1 - kc) - kc * (0.6 + av.pitch * 0.4) + kg * 0.45 - kv * 0.05; hr._z = marche ? s * 0.05 * km : 0; tourner(av.haut);
      av.haut.position.z = -av.recul * 0.05;
      // l'arme : basse en course, épaulée (plus haute, contre la tête) en visée
      const am = av.armeM, crs = course ? 1 : 0; am.position.x = MAIN_R[0] + kv * 0.05; am.position.y = MAIN_R[1] + kv * 0.2 - crs * 0.08; am.position.z = MAIN_R[2] - kv * 0.06 + rc * 0.03;
      am.rotation._x = crs * 0.5 - rc * 0.25; am.rotation._y = Math.PI; tourner(am);
      // les yeux : clignent, se plissent au tir ou en visée, en croix quand il est touché
      av.cligne += dt; if (av.cligne > 3.3) av.cligne = 0;
      const k = av.flash > 0 ? 2 : av.recul > 0.3 || kv > 0.6 ? 1 : 0, geo = geoYeux(k); if (av.yeux.geometry !== geo) av.yeux.geometry = geo;
      av.yeux.scale.y = k === 0 && av.cligne > 3.15 ? 0.15 : 1;
    } else {
      const o = av.o; o.marche = marche && !enLAir; o.phase = av.phase; o.t = t; av.cligne += dt; if (av.cligne > 3.4) av.cligne = 0; o.blink = av.cligne; o.expression = av.flash > 0 ? 'surpris' : 'sourire';
      PERSOS.animer(av.perso, o);
      // C3 : PERSOS lève le haut du corps à |sin φ|·2/cos 52° unités (7 cm) ; on le réécrit à 2,5 cm·(1 − cos 2φ)/2, au même rythme que les jambes
      const P = av.P;
      if (o.marche) P.haut.position.y = HAUT_CHIBI * km * (1 - Math.cos(2 * av.phase)) / 2;
      // les bras portent l'arme : levés avec le regard, plus haut en visée (la crosse à l'épaule), bas en course ; couché, tendus devant
      const b0 = P.bras[0], b1 = P.bras[1], pv = av.pitch * (1 - kc), bas = course ? 0.45 : 0;
      const ax = -1.45 - pv * 0.85 + rc * 0.3 - kv * 0.3 + bas - kc * 1.45;
      b0.rotation._x = ax; b0.rotation._y = 0; b0.rotation._z = 0.5 - kv * 0.15; b1.rotation._x = ax - kv * 0.1; b1.rotation._y = 0; b1.rotation._z = -0.5 + kv * 0.25; tourner(b0); tourner(b1);
      // le support de l'arme : suit le regard ; couché, il pivote avec le corps pour viser devant (le corps est déjà tourné de π/2)
      const vs = av.visee; vs.rotation._x = -pv * 0.85 - rc * 0.3 + bas - kc * (HP + av.pitch * 0.6); tourner(vs);
      vs.position.x = kv * 1.5; vs.position.y = 46 + kv * 5 - bas * 4 + kc * 4; vs.position.z = -av.recul * 3 + kv * 2;
      if (P.cou) { P.cou.rotation._x -= kc * 1.2 - kv * 0.15; tourner(P.cou); } // couché, la tête relevée vers l'avant ; en visée, penchée sur l'arme
      // les jambes : en l'air, accroupi (cuisses en avant : le corps descend), glissade (tendues devant), couché (allongées)
      const jg = P.jambes[0], jd = P.jambes[1];
      if (enLAir) { jg.rotation._x = -0.6; jd.rotation._x = 0.4; }
      else if (kg > 0.02 || ka > 0.02 || kc > 0.02) { const m = 1 - Math.max(ka, kg, kc); jg.rotation._x = jg.rotation._x * m - ka * 1.2 - kg * 1.35 + kc * 0.08; jd.rotation._x = jd.rotation._x * m - ka * 0.4 - kg * 1.05 - kc * 0.05; }
      tourner(jg); tourner(jd);
      if (course && o.marche) { P.haut.rotation._x += 0.18 * km; tourner(P.haut); }
      av.racine.position.y = -ka * 0.34 + kc * 0.2 - kg * 0.3; av.racine.scale.y = 1 - ka * 0.06;
    }
  }
  function tir(av) { if (av) av.recul = 1; }
  function touche(av) { if (av) av.flash = 0.11; }
  function bouche(av, v) { av.bouche.getWorldPosition(v); return v; }
  function liberer(av) { if (!av) return; if (av.groupe.parent) av.groupe.parent.remove(av.groupe); M.dispose(av.groupe); } // les géométries sont en cache : seuls les matériaux propres partent
  return { HAUTEUR, BOUCHE, creer, cle, animer, tir, touche, bouche, liberer, posture, armes, blaster: geoArme, couleurArme, geoRobot };
})();
if (typeof module !== 'undefined') module.exports = PAVATARS;
