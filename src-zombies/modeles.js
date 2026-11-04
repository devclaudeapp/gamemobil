/* DERNIER REMPART — les modèles 3D (zombies/modeles/, faits par outils/zombies/faire-modeles.mjs ; tous en CC0) :
   · Kenney : le zombie de la horde et le survivant (Graveyard Kit), la tourelle et le mortier (Tower Defense Kit), les voitures (Car Kit) ;
   · KayKit : les boss (Golem squelette, loup-garou, Golem de glace, vampire) et leurs clips partagés (Character Animations).
   Le zombie Kenney est fait de six pièces rigides animées (jambes, torse, bras, tête), sans squelette : on « cuit » chaque clip, à 30 images
   par seconde, en une matrice par pièce et par image (relative au modèle). Le rendu pose alors toute la horde avec six maillages instanciés :
   matrice du zombie × matrice cuite de la pièce. Les boss, seuls à l'écran, sont de vrais personnages à squelette (SkeletonUtils.clone + mixer).
   Lu par GLTFLoader + MeshoptDecoder (vendor/fournil-hd.min.js, three r158). Tant que rien n'est chargé (premier lancement hors ligne,
   fichier absent), le rendu garde ses formes faites main : ZMODELES.pret dit lequel des deux on voit.
   API : ZMODELES.charger() → Promise (une seule fois) ; ZMODELES.pret ; ZMODELES.etat ; ZMODELES.M (les modèles préparés, voir preparer). */
const ZMODELES = (() => {
  'use strict';
  const T = typeof THREE !== 'undefined' ? THREE : null, HD = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
  const BASE = (typeof window !== 'undefined' && window.ZOMBIES_MODELES) || 'modeles/';
  const FPS = 30;
  const FICHIERS = {
    zombie: 'kenney/zombie.glb', survivant: 'kenney/survivant.glb', tourelle: 'kenney/tourelle.glb', mortier: 'kenney/mortier.glb',
    'voiture-sedan': 'kenney/voiture-sedan.glb', 'voiture-police': 'kenney/voiture-police.glb', 'voiture-suv': 'kenney/voiture-suv.glb',
    'voiture-taxi': 'kenney/voiture-taxi.glb', 'voiture-van': 'kenney/voiture-van.glb', 'voiture-hatchback-sports': 'kenney/voiture-hatchback-sports.glb',
    golem: 'kaykit/golem.glb', 'golem-glace': 'kaykit/golem-glace.glb', 'loup-garou': 'kaykit/loup-garou.glb', vampire: 'kaykit/vampire.glb',
    'large-marche': 'kaykit/anims-large-marche.glb', 'large-general': 'kaykit/anims-large-general.glb', 'large-coups': 'kaykit/anims-large-coups.glb',
    'medium-marche': 'kaykit/anims-medium-marche.glb', 'medium-general': 'kaykit/anims-medium-general.glb', 'medium-coups': 'kaykit/anims-medium-coups.glb',
  };
  const VOITURES = ['voiture-sedan', 'voiture-police', 'voiture-suv', 'voiture-taxi', 'voiture-van', 'voiture-hatchback-sports'];
  const M = { zombie: null, survivant: null, tourelle: null, mortier: null, voitures: [], boss: {}, anims: { large: [], medium: [] }, blasters: {}, reels: {} };
  // les armes (Blaster Kit de Kenney) : chargées après le reste, sans le bloquer ; une arme sans modèle garde sa forme faite main
  const BLASTERS = 'abcdefghijklmnopqr'.split('');
  // les vraies armes (Ultimate Gun Pack de Quaternius, CC0 : outils/zombies/faire-armes-reelles.mjs) : pistolets, revolver, mitraillettes,
  // fusils à pompe, d'assaut, de précision ; les armes sans modèle réel (lanceurs, énergie…) gardent leur blaster
  const REELS = ['pistolet', 'revolver', 'jumeaux', 'mitraillette', 'vipere', 'pompe', 'doublecanon', 'pompeauto', 'fusil', 'rafale', 'precision', 'canon'];
  let etatArmes = 'attente', etatPersos = 'attente';
  // les survivants à collectionner : le modèle Blocky (chargé après les armes) et ses textures, chargées à la demande
  const textures = new Map();
  function texture(c) {
    if (textures.has(c)) return textures.get(c);
    const t = new T.TextureLoader().load(BASE + `persos/texture-${c}.png`); t.flipY = false; t.wrapS = t.wrapT = T.RepeatWrapping; if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; t.magFilter = T.NearestFilter;
    textures.set(c, t); return t;
  }
  // le survivant d'un skin : { gltf, hauteur, map } (map : la texture à mettre ; null : celles du fichier) ; le Gardien tant que le reste manque
  function survivant(id) {
    const S = typeof ZDONNEES !== 'undefined' ? ZDONNEES.SURVIVANTS[id] : null;
    if (!S || !S.texture || !M.blocky) return { gltf: M.survivant.gltf, hauteur: M.survivant.hauteur, map: null, id: 'gardien' };
    return { gltf: M.blocky.gltf, hauteur: M.blocky.hauteur, map: texture(S.texture), id };
  }
  let etat = 'attente', promesse = null;

  // un matériau Lambert (moins cher que le PBR des fichiers, comme le reste du jeu) qui garde la palette du pack
  const lambert = (m) => new T.MeshLambertMaterial({ map: m && m.map ? m.map : null, color: m && !m.map && m.color ? m.color : '#FFFFFF' });

  // ─── un personnage Kenney : ses pièces, et chaque clip cuit en matrices ───
  function cuire(gltf, clips) {
    const sc = gltf.scene; sc.updateMatrixWorld(true);
    const pieces = []; sc.traverse((o) => { if (o.isMesh) pieces.push(o); });
    const boite = new T.Box3().setFromObject(sc), hauteur = boite.max.y - boite.min.y;
    const mat = lambert(pieces[0] && pieces[0].material);
    const mixer = new T.AnimationMixer(sc), inv = new T.Matrix4().copy(sc.matrixWorld).invert(), tmp = new T.Matrix4();
    const cuits = {};
    for (const nom of clips) {
      const clip = gltf.animations.find((a) => a.name === nom); if (!clip) continue;
      const boucle = nom !== 'die', n = Math.max(2, Math.round(clip.duration * FPS) + (boucle ? 0 : 1));
      mixer.stopAllAction(); const act = mixer.clipAction(clip); act.reset(); act.setLoop(boucle ? T.LoopRepeat : T.LoopOnce, Infinity); act.clampWhenFinished = true; act.play();
      const mats = new Float32Array(n * pieces.length * 16);
      for (let k = 0; k < n; k++) {
        mixer.setTime(boucle ? (k / n) * clip.duration : Math.min(clip.duration - 1e-4, (k / (n - 1)) * clip.duration));
        sc.updateMatrixWorld(true);
        for (let p = 0; p < pieces.length; p++) { tmp.multiplyMatrices(inv, pieces[p].matrixWorld); tmp.toArray(mats, (k * pieces.length + p) * 16); }
      }
      cuits[nom] = { n, duree: clip.duration, boucle, mats };
    }
    mixer.stopAllAction(); mixer.uncacheRoot(sc);
    return { pieces: pieces.map((p) => ({ nom: p.name, geo: p.geometry })), mat, cuits, hauteur };
  }
  // un objet Kenney (tourelle, mortier, voiture) : la scène telle quelle, matériaux en Lambert, et sa boîte
  function objet(gltf) {
    const sc = gltf.scene, cache = new Map();
    sc.traverse((o) => { if (o.isMesh) { if (!cache.has(o.material)) cache.set(o.material, lambert(o.material)); o.material = cache.get(o.material); o.castShadow = true; o.receiveShadow = true; } });
    sc.updateMatrixWorld(true);
    return { scene: sc, boite: new T.Box3().setFromObject(sc) };
  }
  // un boss KayKit : sa scène (clonée à chaque apparition), sa hauteur mesurée sur la pose de marche
  function boss(gltf, anims) {
    const sc = gltf.scene; sc.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const essai = HD.SkeletonUtils.clone(sc), mixer = new T.AnimationMixer(essai), marche = anims.find((a) => a.name === 'Walking_A');
    if (marche) { mixer.clipAction(marche).play(); mixer.update(0.01); }
    essai.updateMatrixWorld(true); essai.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
    const b = new T.Box3().setFromObject(essai, true);
    return { scene: sc, hauteur: Math.max(0.1, b.max.y - b.min.y), sol: b.min.y };
  }
  // ─── les armes faites main, dans le style de l'Ultimate Gun Pack (formes simples, couleurs unies) : ce que le pack n'a pas ───
  // le canon vers −z, comme les modèles du pack ; arme() les traite pareil (taille, finitions)
  const FAITS = ['minigun', 'roquettes', 'lancegrenades', 'flammes', 'arbalete'];
  function faitMain(id) {
    const g = new T.Group(), mats = new Map(), mat = (c) => { if (!mats.has(c)) mats.set(c, new T.MeshLambertMaterial({ color: c })); return mats.get(c); };
    const boite = (w, h, d, x, y, z, c, rx, ry, rz) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); g.add(m); return m; };
    const tube = (av, ar, l, x, y, z, c, n) => { const m = new T.Mesh(new T.CylinderGeometry(av, ar, l, n || 12), mat(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; }; // (av : le rayon devant, vers −z)
    const NOIR = '#1D1F22', METAL = '#3A3E44', ACIER = '#6A7078', BOIS = '#6B4A2F', OLIVE = '#4E5A32', KAKI = '#7C7A52';
    if (id === 'minigun') {
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; tube(0.024, 0.024, 0.66, Math.cos(a) * 0.06, Math.sin(a) * 0.06, -0.42, k % 2 ? METAL : ACIER, 8); }
      tube(0.1, 0.1, 0.035, 0, 0, -0.33, NOIR); tube(0.095, 0.095, 0.035, 0, 0, -0.7, NOIR); tube(0.05, 0.05, 0.08, 0, 0, -0.08, METAL);
      boite(0.2, 0.19, 0.3, 0, 0, 0.1, METAL); boite(0.16, 0.05, 0.24, 0, 0.11, 0.1, NOIR);
      boite(0.04, 0.035, 0.24, 0, 0.19, 0.08, NOIR); boite(0.035, 0.08, 0.035, 0, 0.15, -0.02, NOIR); boite(0.035, 0.08, 0.035, 0, 0.15, 0.18, NOIR); // la poignée de transport
      boite(0.05, 0.16, 0.05, 0, -0.1, 0.3, NOIR, 0.25); boite(0.18, 0.16, 0.2, 0.02, -0.19, 0.06, OLIVE); boite(0.05, 0.02, 0.14, 0.06, -0.08, 0.03, '#B08A3A'); // la crosse, la caisse et la bande
    } else if (id === 'roquettes') {
      tube(0.055, 0.055, 1.0, 0, 0, 0, OLIVE, 14); tube(0.075, 0.06, 0.1, 0, 0, 0.54, NOIR, 14); tube(0.06, 0.06, 0.06, 0, 0, -0.52, NOIR, 14);
      tube(0.0, 0.085, 0.2, 0, 0, -0.72, '#5E6B38', 12); tube(0.085, 0.07, 0.1, 0, 0, -0.57, '#5E6B38', 12); // la roquette dans le tube
      boite(0.05, 0.14, 0.06, 0, -0.1, -0.08, NOIR, 0.2); boite(0.05, 0.13, 0.06, 0, -0.1, 0.16, BOIS, 0.25); boite(0.06, 0.06, 0.16, 0.05, 0.08, -0.18, NOIR); boite(0.02, 0.06, 0.02, 0.05, 0.13, -0.24, NOIR);
    } else if (id === 'lancegrenades') {
      tube(0.05, 0.05, 0.36, 0, 0.02, -0.42, METAL, 12); tube(0.058, 0.058, 0.04, 0, 0.02, -0.6, NOIR, 12);
      tube(0.13, 0.13, 0.2, 0, -0.02, -0.12, NOIR, 6); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; tube(0.035, 0.035, 0.21, Math.cos(a) * 0.08, -0.02 + Math.sin(a) * 0.08, -0.12, METAL, 8); } // le barillet
      boite(0.08, 0.12, 0.26, 0, 0.03, 0.12, METAL); boite(0.05, 0.15, 0.06, 0, -0.1, 0.17, NOIR, 0.25); boite(0.05, 0.12, 0.05, 0, -0.08, -0.36, NOIR);
      boite(0.05, 0.12, 0.3, 0, 0.0, 0.4, OLIVE); boite(0.05, 0.04, 0.22, 0, 0.07, 0.34, NOIR); boite(0.03, 0.05, 0.12, 0, 0.1, -0.05, NOIR);
    } else if (id === 'flammes') {
      tube(0.035, 0.035, 0.6, 0, 0.02, -0.45, METAL, 10); tube(0.055, 0.04, 0.1, 0, 0.02, -0.78, NOIR, 10); tube(0.012, 0.012, 0.14, 0, -0.04, -0.74, '#C8781E', 6); // la lance, la buse, la veilleuse
      boite(0.1, 0.13, 0.36, 0, 0.0, 0.0, METAL); boite(0.05, 0.15, 0.06, 0, -0.12, 0.1, NOIR, 0.25); boite(0.05, 0.12, 0.05, 0, -0.1, -0.28, NOIR);
      tube(0.085, 0.085, 0.34, 0, -0.16, 0.02, '#9C2F23', 14); tube(0.087, 0.087, 0.03, 0, -0.16, -0.12, NOIR, 14); tube(0.087, 0.087, 0.03, 0, -0.16, 0.16, NOIR, 14); // le réservoir
      boite(0.06, 0.1, 0.22, 0, 0.0, 0.3, NOIR);
    } else if (id === 'arbalete') {
      boite(0.06, 0.07, 0.82, 0, 0, 0.18, BOIS); boite(0.07, 0.13, 0.22, 0, -0.03, 0.5, BOIS); boite(0.045, 0.14, 0.06, 0, -0.11, 0.24, NOIR, 0.25);
      boite(0.32, 0.035, 0.05, 0.16, 0.02, -0.2, METAL, 0, 0.32); boite(0.32, 0.035, 0.05, -0.16, 0.02, -0.2, METAL, 0, -0.32); // les branches de l'arc
      boite(0.32, 0.008, 0.008, 0.14, 0.03, -0.06, '#D8D2C0', 0, -0.62); boite(0.32, 0.008, 0.008, -0.14, 0.03, -0.06, '#D8D2C0', 0, 0.62); // la corde
      tube(0.008, 0.008, 0.5, 0, 0.05, -0.08, '#8A6A3A', 6); tube(0.0, 0.018, 0.06, 0, 0.05, -0.36, ACIER, 6); boite(0.12, 0.02, 0.02, 0, -0.04, -0.3, METAL); // le carreau, sa pointe, l'étrier
    }
    return g;
  }
  function preparer(g) {
    M.zombie = cuire(g.zombie, ['walk', 'sprint', 'idle', 'die', 'pick-up']);
    M.survivant = { gltf: g.survivant, hauteur: (() => { const b = new T.Box3().setFromObject(g.survivant.scene); return b.max.y - b.min.y; })() };
    M.tourelle = objet(g.tourelle); M.mortier = objet(g.mortier);
    for (const id of FAITS) M.reels[id] = faitMain(id); // (les armes faites main : prêtes tout de suite)
    M.voitures = VOITURES.map((k) => objet(g[k]));
    for (const rig of ['large', 'medium']) M.anims[rig] = [].concat(g[rig + '-marche'].animations, g[rig + '-general'].animations, g[rig + '-coups'].animations);
    if (typeof ZDONNEES !== 'undefined') for (const k in ZDONNEES.ZOMBIES) { const Z = ZDONNEES.ZOMBIES[k]; if (Z.boss && g[Z.modele]) M.boss[k] = boss(g[Z.modele], M.anims[Z.rig]); }
  }
  function charger() {
    if (promesse) return promesse;
    if (!T || !HD || !HD.GLTFLoader) { etat = 'absent'; return (promesse = Promise.resolve(false)); }
    etat = 'charge';
    const L = new HD.GLTFLoader(); if (HD.MeshoptDecoder) L.setMeshoptDecoder(HD.MeshoptDecoder);
    const lire = (u) => new Promise((ok, ko) => L.load(BASE + u, ok, undefined, ko));
    const cles = Object.keys(FICHIERS);
    promesse = Promise.all(cles.map((k) => lire(FICHIERS[k]))).then((l) => {
      const g = {}; cles.forEach((k, i) => { g[k] = l[i]; });
      preparer(g); etat = 'pret';
      etatArmes = 'charge';
      Promise.all(BLASTERS.map((c) => lire(`armes/blaster-${c}.glb`).then((gl) => { M.blasters[c] = gl.scene; }).catch(() => {})).concat(REELS.map((k) => lire(`armes/reel-${k}.glb`).then((gl) => { M.reels[k] = gl.scene; }).catch(() => {})))).then(() => { etatArmes = Object.keys(M.blasters).length || Object.keys(M.reels).length ? 'pret' : 'absent'; })
        .then(() => lire('persos/blocky.glb')).then((gl) => { gl.scene.traverse((o) => { if (o.isMesh && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); }); /* (des modèles « sans éclairage » : pas de normales, noirs en Lambert) */ M.blocky = { gltf: gl, hauteur: (() => { const b = new T.Box3().setFromObject(gl.scene); return b.max.y - b.min.y; })() }; etatPersos = 'pret'; }).catch(() => { etatPersos = 'absent'; });
      return true;
    }).catch((e) => { etat = 'erreur'; if (typeof console !== 'undefined') console.warn('Dernier Rempart : modèles 3D indisponibles, formes faites main', e && e.message); return false; });
    return promesse;
  }
  // une arme prête à tenir : sa vraie arme (Quaternius) ou son blaster (Kenney, à sa teinte), le canon vers +z, long de « longueur » ; null sans modèle
  // (avec une finition de la collection : sa couleur, sa lueur ; « arcenciel » : le rendu fait tourner la teinte des matériaux de arcsEnCiel)
  const armesFaites = new Map(), arcsEnCiel = new Set();
  function arme(id, longueur, finition) {
    const A = typeof ZDONNEES !== 'undefined' ? ZDONNEES.ARMES[id] : null, reel = M.reels[id], src = reel || (A && M.blasters[A.modele]), F = finition && ZDONNEES.FINITIONS[finition];
    if (!src) return null;
    const cle = id + '|' + (F ? finition : '');
    let base = armesFaites.get(cle);
    if (!base) {
      const mats = new Map();
      base = src.clone(true);
      base.traverse((o) => { if (o.isMesh) { if (!mats.has(o.material)) { const m = lambert(o.material); if (F) { const l0 = reel ? Math.min(1, (m.color.r + m.color.g + m.color.b) * 1.6) : 1; m.color.set(F.couleur); if (reel) m.color.multiplyScalar(0.5 + 0.5 * l0); /* (une vraie arme garde le contraste de ses pièces : les noires restent plus sombres) */ if (F.lueur) m.emissive = new T.Color(F.couleur).multiplyScalar(F.lueur); if (F.translucide) { m.transparent = true; m.opacity = 0.62; } if (F.arcenciel) arcsEnCiel.add(m); } else if (A.teinte && !reel) m.color.set(A.teinte); mats.set(o.material, m); } o.material = mats.get(o.material); o.castShadow = true; } });
      const b = new T.Box3().setFromObject(base), c = new T.Vector3(); b.getCenter(c);
      const g = new T.Group(); base.position.sub(c); base.rotation.y = Math.PI; base.position.x = -base.position.x; base.position.z = -base.position.z; g.add(base);
      g.userData.long = Math.max(1e-3, b.max.z - b.min.z); base = g; armesFaites.set(cle, base);
    }
    const o = base.clone(true); o.scale.setScalar(longueur / base.userData.long);
    if (reel) { o.scale.x *= 1.5; o.scale.y *= 1.5; } // (une vraie arme est fine : un peu plus épaisse, elle se lit encore vue de haut)
    return o;
  }
  return { REELS, charger, arme, arcsEnCiel, survivant, get persosPrets() { return etatPersos === 'pret'; }, get armesPretes() { return etatArmes === 'pret'; }, get etatArmes() { return etatArmes; }, M, FPS, VOITURES, get pret() { return etat === 'pret'; }, get etat() { return etat; }, FICHIERS };
})();
