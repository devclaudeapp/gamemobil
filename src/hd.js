/* LE FOURNIL — les modèles HD : KayKit (CC0, Kay Lousberg : Furniture, City Builder, Halloween, Restaurant Bits) et les Mini Characters de
   Kenney (CC0, riggés et animés : l'équipe de la Planque), compressés en meshopt dans fournil/hd/, chargés par vendor/fournil-hd.min.js (GLTFLoader, SkeletonUtils,
   MeshoptDecoder de three r158 ; postprocessing 6.33.4 ; n8ao 1.8.4). La Planque y prend ses meubles, sa rue de nuit et son équipe animée ; la
   boutique garde ses personnages et reçoit quelques décors. En qualité éco, sans WebGL2, dans l'artefact ou avec ?hd=0 : le rendu habituel. */
const HDM = (() => {
  // actif : le paquet d'outils est là et on ne l'a pas coupé (?hd=0) ; permis(renderer) : WebGL2 et pas en qualité éco (le rendu actuel reste tel quel)
  const actif = typeof window !== 'undefined' && typeof THREE !== 'undefined' && typeof FOURNIL_HD !== 'undefined' && !/[?&]hd=0/.test(location.search);
  const API = { actif, version: 0, pret: () => false, permis: () => false, charger: () => Promise.resolve(false), coupe: () => true, couper: () => {}, remettre: () => {} };
  if (!actif) return API;
  const X = FOURNIL_HD, L = new X.GLTFLoader(), BASE = 'hd/'; if (X.MeshoptDecoder) L.setMeshoptDecoder(X.MeshoptDecoder);
  // deux lots chargés à la demande : la boutique (quelques décors, après le premier rendu), la Planque (à sa première ouverture)
  // l'équipe de la Planque : six Mini Characters de Kenney (fournil/hd/mini/, environ 105 Ko chacun ; clips idle, walk, sit, emote-yes, holding-both, interact-right)
  const MINI = ['male-b', 'female-a', 'male-d', 'female-c', 'male-f', 'female-e'].map((n) => 'character-' + n);
  const LOTS = {
    boutique: { meubles: ['cactus_medium_A', 'cactus_small_A', 'lamp_standing'], halloween: ['pumpkin_orange', 'pumpkin_orange_jackolantern', 'pumpkin_yellow_small'], resto: ['jar_A_large', 'jar_B_medium'] },
    planque: { meubles: ['rug_oval_A', 'cactus_medium_A', 'cactus_small_A', 'pictureframe_medium', 'lamp_standing', 'couch_pillows', 'armchair_pillows', 'table_low'], ville: ['building_D', 'building_F', 'streetlight', 'car_sedan', 'firehydrant', 'trash_A', 'dumpster'], mini: MINI },
  };
  const MOD = {}, PER = {}, etat = {};
  const lire = (u) => new Promise((ok, ko) => L.load(BASE + u, ok, null, ko));
  function charger(lot) {
    if (etat[lot]) return etat[lot].promesse; const e = etat[lot] = { pret: false };
    const t = []; for (const [dossier, noms] of Object.entries(LOTS[lot] || {})) for (const n of noms) {
      if (dossier === 'mini') { if (!PER[n]) t.push(lire(`mini/${n}.glb`).then((g) => { PER[n] = g; }, () => console.warn('HD : personnage manquant', n))); }
      else if (!MOD[n]) t.push(lire(`${dossier}/${n}.glb`).then((g) => { MOD[n] = g.scene; }, () => console.warn('HD : modèle manquant', n))); // un décor manquant est simplement omis
    }
    e.promesse = Promise.all(t).then(() => { if (LOTS[lot].mini && !LOTS[lot].mini.some((v) => PER[v])) throw new Error('personnages HD manquants'); e.pret = true; API.version++; return true; }).catch((err) => { e.erreur = String(err && err.message || err); console.warn('HD : modèles non chargés, rendu habituel', e.erreur); return false; });
    return e.promesse;
  }
  const pret = (lot) => !!(etat[lot] && etat[lot].pret);
  // coupé sur ce téléphone : par le joueur (Réglages) ou par la Planque qui a vu un écran noir ; gardé d'une visite à l'autre
  let coupeMem = null; const CLE = 'fournil.hd';
  const coupe = () => { if (coupeMem === null) { try { coupeMem = localStorage.getItem(CLE) === 'non'; } catch (e) { coupeMem = false; } } return coupeMem; };
  const couper = (raison) => { coupeMem = true; API.raison = raison || 'joueur'; try { localStorage.setItem(CLE, 'non'); } catch (e) { /* rien */ } API.version++; };
  const remettre = () => { coupeMem = false; API.raison = ''; try { localStorage.removeItem(CLE); } catch (e) { /* rien */ } API.version++; };
  const permis = (renderer) => { try { return !coupe() && !!(renderer && renderer.capabilities.isWebGL2 && !(typeof SCENE !== 'undefined' && SCENE.stats && SCENE.stats.qualite === 'eco')); } catch (e) { return false; } };

  // un meuble : cloné, à l'échelle s (unités KayKit → unités du monde), posé pied au sol, centré en x/z sur sa boîte
  function modele(nom, s, o = {}) {
    const src = MOD[nom]; if (!src) return null;
    const g = new THREE.Group(), m = src.clone(true); m.scale.setScalar(s); m.rotation.y = o.ry || 0; m.updateMatrixWorld(true);
    m.traverse((x) => { if (x.isMesh) { x.castShadow = o.ombre !== false; x.receiveShadow = true; } });
    const b = new THREE.Box3().setFromObject(m); m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.add(m);
    g.userData.taille = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }; return g;
  }

  // ─── un Mini Character : clone riggé (gros chibi Kenney, 0,67 unité de haut, regard vers +z) et son mélangeur d'animations ;
  //     nom absent (modèle pas arrivé) : un autre de l'équipe ───
  function mini(nom, o = {}) {
    const src = PER[nom] || PER[MINI.find((n) => PER[n])]; if (!src) return null; const g = X.SkeletonUtils.clone(src.scene);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(g), actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    const a = { g, mixer, actions, joue: null, yaw: 0 }; jouer(a, o.anim || 'idle', 0); mixer.update(Math.random() * 2); return a;
  }
  function jouer(a, nom, fondu = 0.25) {
    if (a.joue === nom || !a.actions[nom]) return; const n = a.actions[nom].reset().play();
    if (a.joue && a.actions[a.joue]) a.actions[a.joue].crossFadeTo(n, fondu, false); a.joue = nom;
  }
  function liberer(a) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.g.traverse((m) => { if (m.isMesh && m.geometry && !m.isSkinnedMesh) m.geometry.dispose(); }); }

  // ─── la passe d'effets : occlusion N8AO (optionnelle), SMAA, halo ; sortie sRGB ───
  function effets(renderer, scene, camera, W, H, dpr, o = {}) {
    let flottant = false; try { flottant = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'); } catch (e) { /* non */ }
    const c = new X.EffectComposer(renderer, { frameBufferType: flottant ? THREE.HalfFloatType : THREE.UnsignedByteType }); // tampons flottants seulement s'ils sont rendables c.addPass(new X.RenderPass(scene, camera));
    let n8 = null;
    if (o.ao !== false) { n8 = new X.N8AOPostPass(scene, camera, W * dpr, H * dpr); Object.assign(n8.configuration, { aoRadius: o.rayon || 40, distanceFalloff: 1, intensity: o.ao || 2.6, color: new THREE.Color(o.aoCouleur || '#3A2418'), halfRes: true, aoSamples: 12, denoiseSamples: 8 }); c.addPass(n8); }
    const fx = [new X.SMAAEffect()]; if (o.halo !== 0) fx.push(new X.BloomEffect({ intensity: o.halo || 0.3, luminanceThreshold: o.seuil || 0.85, mipmapBlur: true }));
    c.addPass(new X.EffectPass(camera, ...fx)); c.setSize(W, H);
    return { rendre: (dt) => c.render(dt), liberer: () => c.dispose(), n8 };
  }
  return Object.assign(API, { pret, permis, charger, etat, coupe, couper, remettre, modele, mini, MINI, jouer, liberer, effets });
})();
if (typeof module !== 'undefined') module.exports = HDM;
