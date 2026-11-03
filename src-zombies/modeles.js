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
  const M = { zombie: null, survivant: null, tourelle: null, mortier: null, voitures: [], boss: {}, anims: { large: [], medium: [] } };
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
  function preparer(g) {
    M.zombie = cuire(g.zombie, ['walk', 'sprint', 'idle', 'die', 'pick-up']);
    M.survivant = { gltf: g.survivant, hauteur: (() => { const b = new T.Box3().setFromObject(g.survivant.scene); return b.max.y - b.min.y; })() };
    M.tourelle = objet(g.tourelle); M.mortier = objet(g.mortier);
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
      preparer(g); etat = 'pret'; return true;
    }).catch((e) => { etat = 'erreur'; if (typeof console !== 'undefined') console.warn('Dernier Rempart : modèles 3D indisponibles, formes faites main', e && e.message); return false; });
    return promesse;
  }
  return { charger, M, FPS, VOITURES, get pret() { return etat === 'pret'; }, get etat() { return etat; }, FICHIERS };
})();
