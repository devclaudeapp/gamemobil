/* LE FOURNIL — les modèles HD : KayKit (CC0, Kay Lousberg : Furniture, City Builder, Halloween, Restaurant Bits) et les Mini Characters de
   Kenney (CC0, riggés et animés : l'équipe de la Planque), compressés en meshopt dans fournil/hd/, chargés par vendor/fournil-hd.min.js (GLTFLoader, SkeletonUtils,
   MeshoptDecoder de three r158 ; construit par outils/maquette-hd/construire.cjs). La Planque y prend ses meubles, sa rue de nuit et son équipe animée ; la
   boutique garde ses personnages et reçoit quelques décors ; la boutique hantée (src/boutiquehantee.js) prend tout son lot « hantee3 » : le
   pack décor, ses neuf monstres et son équipe (KayKit Skeletons, Adventurers, Mystery Series 4, Asset Quest), les clips partagés. En qualité
   éco, sans WebGL2, dans l'artefact ou avec ?hd=0 : le rendu habituel. */
const HDM = (() => {
  // actif : le paquet d'outils est là et on ne l'a pas coupé (?hd=0) ; permis(renderer) : WebGL2 et pas en qualité éco (le rendu actuel reste tel quel)
  const actif = typeof window !== 'undefined' && typeof THREE !== 'undefined' && typeof FOURNIL_HD !== 'undefined' && !/[?&]hd=0/.test(location.search);
  const API = { actif, version: 0, pret: () => false, permis: () => false, charger: () => Promise.resolve(false), coupe: () => true, couper: () => {}, remettre: () => {} };
  if (!actif) return API;
  const X = FOURNIL_HD, L = new X.GLTFLoader(), BASE = 'hd/'; if (X.MeshoptDecoder) L.setMeshoptDecoder(X.MeshoptDecoder);
  // trois lots chargés à la demande : la boutique (quelques décors, après le premier rendu), la Planque et la Maison hantée (à leur première ouverture) ;
  // et, en plus, les petits lots cuits du standing et de la boutique hantée
  // l'équipe de la Planque : six Mini Characters de Kenney (fournil/hd/mini/, environ 105 Ko chacun ; clips idle, walk, sit, emote-yes, holding-both, interact-right)
  const MINI = ['male-b', 'female-a', 'male-d', 'female-c', 'male-f', 'female-e'].map((n) => 'character-' + n);
  const LOTS = {
    // la boutique : ses meubles KayKit cuits (fournil/hd/meubles2/ : couleurs de sommets, sans texture, quelques Ko chacun ; lus par part())
    boutique: { meubles2: ['table_round_A_small', 'chair_A_wood', 'chair_A', 'chair_stool_wood', 'couch_pillows', 'armchair_pillows', 'table_low', 'rug_rectangle_stripes_A', 'lamp_standing', 'menu'], meubles: ['cactus_medium_A', 'cactus_small_A'], halloween: ['pumpkin_orange', 'pumpkin_orange_jackolantern', 'pumpkin_yellow_small'], resto: ['jar_A_large', 'jar_B_medium'] },
    // la Maison hantée (fournil/hd/hantee/ : KayKit Halloween Bits et Furniture Bits, CC0) : le salon du manoir, le jardin par la fenêtre, l'équipe costumée
    hantee: { hantee: ['armchair', 'book_set', 'candle_melted', 'candle_thin', 'candle_triple', 'crypt', 'fence', 'fence_gate', 'gravestone', 'lantern_hanging', 'lantern_standing', 'pictureframe_large_A', 'post_lantern', 'pumpkin_orange_small', 'pumpkin_yellow_jackolantern', 'rug_rectangle_stripes_A', 'shelf_B_large_decorated', 'table_medium', 'tree_dead_medium', 'tree_pine_orange_medium'], halloween: ['pumpkin_orange', 'pumpkin_orange_jackolantern'], mini: MINI },
    // le standing (src/meubles.js, standing ; fournil/hd/luxe/ : cuits, quelques Ko) : chargés seulement quand la boutique atteint le palier
    luxe1: { luxe: ['lantern_hanging'] }, luxe3: { luxe: ['column'] }, luxe5: { luxe: ['statue', 'trophy'] },
    // la boutique hantée (src/boutiquehantee.js : l'écran de la Maison hantée ; fournil/hd/hantee3/, ≈ 1,8 Mo) : le pack décor (67 modèles,
    // une scène par modèle), un GLB par personnage (sans clips : le rig KayKit à 41 os), les clips partagés, la peau du loup-garou, les ardoises
    hantee3: { hantee3: ['decor-hante', 'anims-hante', 'Skeleton_Minion', 'Skeleton_Mage', 'Rogue', 'Rogue_Hooded', 'Mage', 'Knight', 'Werewolf_Wolf'], images: ['hantee3/werewolf_B.png', 'hantee3/ardoises.jpg', 'hantee3/ardoises-normale.jpg'] },
    planque: { meubles: ['rug_oval_A', 'cactus_medium_A', 'cactus_small_A', 'pictureframe_medium', 'lamp_standing', 'couch_pillows', 'armchair_pillows', 'table_low'], ville: ['building_D', 'building_F', 'streetlight', 'car_sedan', 'firehydrant', 'trash_A', 'dumpster'], mini: MINI },
  };
  const MOD = {}, PER = {}, etat = {}, H3 = { decor: {}, persos: {}, clips: [], images: {} };
  const lire = (u) => new Promise((ok, ko) => L.load(BASE + u, ok, null, ko));
  const image = (u) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = BASE + u; });
  function lireH3(n) { // le lot de la boutique hantée : le pack (ses scènes par nom), les clips, ou un personnage (le gltf entier : son squelette)
    if (n === 'decor-hante' ? Object.keys(H3.decor).length : n === 'anims-hante' ? H3.clips.length : H3.persos[n]) return null;
    return lire(`hantee3/${n}.glb`).then((g) => { if (n === 'decor-hante') { for (const s of g.scenes) H3.decor[s.name] = s; } else if (n === 'anims-hante') H3.clips = g.animations; else H3.persos[n] = g.scene; });
  }
  function charger(lot) {
    if (etat[lot]) return etat[lot].promesse; const e = etat[lot] = { pret: false };
    const t = []; for (const [dossier, noms] of Object.entries(LOTS[lot] || {})) for (const n of noms) {
      if (dossier === 'mini') { if (!PER[n]) t.push(lire(`mini/${n}.glb`).then((g) => { PER[n] = g; }, () => console.warn('HD : personnage manquant', n))); }
      else if (dossier === 'hantee3') { const p = lireH3(n); if (p) t.push(p); } // (tout ou rien : un fichier manquant fait échouer le lot, la boutique hantée reste en procédural)
      else if (dossier === 'images') { if (!H3.images[n]) t.push(image(n).then((im) => { H3.images[n] = im; })); }
      else { const cle = dossier === 'meubles2' || dossier === 'luxe' ? `${dossier}/${n}` : n; if (!MOD[cle]) t.push(lire(`${dossier}/${n}.glb`).then((g) => { MOD[cle] = g.scene; }, () => console.warn('HD : modèle manquant', n))); } // un décor manquant est simplement omis ; les meubles cuits gardent leur dossier dans leur nom
    }
    e.promesse = Promise.all(t).then(() => { if (LOTS[lot].mini && !LOTS[lot].mini.some((v) => PER[v])) throw new Error('personnages HD manquants'); e.pret = true; API.version++; return true; }).catch((err) => { e.erreur = String(err && err.message || err); console.warn('HD : modèles non chargés, rendu habituel', e.erreur); return false; });
    return e.promesse;
  }
  const pret = (lot) => !!(etat[lot] && etat[lot].pret);
  // coupé sur ce téléphone : par le joueur (Réglages) ou par la Planque qui a vu un écran noir ; gardé d'une visite à l'autre, avec sa raison
  // ('non:écran noir', 'non:joueur' ; un ancien 'non' tout court vaut 'joueur'), pour que le petit texte des Réglages reste juste après un rechargement
  let coupeMem = null; const CLE = 'fournil.hd';
  const coupe = () => {
    if (coupeMem === null) { let v = null; try { v = localStorage.getItem(CLE); } catch (e) { /* rien */ } coupeMem = v === 'non' || /^non:/.test(v || ''); API.raison = coupeMem ? v.slice(4) || 'joueur' : ''; }
    return coupeMem;
  };
  const couper = (raison) => { coupeMem = true; API.raison = raison || 'joueur'; try { localStorage.setItem(CLE, 'non:' + API.raison); } catch (e) { /* rien */ } API.version++; };
  const remettre = () => { coupeMem = false; API.raison = ''; try { localStorage.removeItem(CLE); } catch (e) { /* rien */ } API.version++; };
  coupe(); // dès le chargement : API.raison est lue par les Réglages avant tout appel à coupe()
  const permis = (renderer) => { try { return !coupe() && !!(renderer && renderer.capabilities.isWebGL2 && !(typeof SCENE !== 'undefined' && SCENE.stats && SCENE.stats.qualite === 'eco')); } catch (e) { return false; } };

  // un meuble : cloné, à l'échelle s (unités KayKit → unités du monde), posé pied au sol, centré en x/z sur sa boîte
  function modele(nom, s, o = {}) {
    const src = MOD[nom]; if (!src) return null;
    const g = new THREE.Group(), m = src.clone(true); m.scale.setScalar(s); m.rotation.y = o.ry || 0; m.updateMatrixWorld(true);
    m.traverse((x) => { if (x.isMesh) { x.castShadow = o.ombre !== false; x.receiveShadow = true; } });
    const b = new THREE.Box3().setFromObject(m); m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.add(m);
    g.userData.taille = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }; return g;
  }

  // ─── un meuble cuit (fournil/hd/meubles2/) : ses maillages mis bout à bout en une géométrie à couleurs de sommets (linéaires), posée
  //     (bas sur y = 0) et centrée en X/Z, en cache ; part() en fait une pièce pour MODELES.assembler, comme KENNEY.part (même syntaxe) ───
  const CUITS = new Map();
  function cuit(nom) {
    if (CUITS.has(nom)) return CUITS.get(nom); const src = MOD[nom]; if (!src) return null;
    src.updateMatrixWorld(true); const P = [], N = [], C = [], v = new THREE.Vector3(), m3 = new THREE.Matrix3();
    src.traverse((o) => {
      if (!o.isMesh) return; const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, col = g.attributes.color, idx = g.index, nb = idx ? idx.count : p.count, mc = o.material && o.material.color;
      m3.getNormalMatrix(o.matrixWorld);
      for (let k = 0; k < nb; k++) {
        const i = idx ? idx.getX(k) : k; v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z);
        if (n) { v.fromBufferAttribute(n, i).applyMatrix3(m3).normalize(); N.push(v.x, v.y, v.z); }
        C.push((col ? col.getX(i) : 1) * (mc ? mc.r : 1), (col ? col.getY(i) : 1) * (mc ? mc.g : 1), (col ? col.getZ(i) : 1) * (mc ? mc.b : 1));
      }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    if (N.length === P.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else geo.computeVertexNormals();
    geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.computeBoundingBox();
    geo.userData.cache = true; const d = geo.boundingBox.getSize(new THREE.Vector3()), r = { geo, w: d.x, h: d.y, d: d.z }; CUITS.set(nom, r); return r;
  }
  // les couleurs du quartier : teinte = '#hex' repeint les tons chauds du modèle (les bois orangés, les tissus jaunes : r nettement au-dessus
  // de b) dans cette couleur, en gardant leurs dégradés (la plus claire devient la teinte, les autres en proportion) ; les gris et les bleus restent
  const _ct = new THREE.Color(), lum = (a, i) => 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2], chaud = (a, i) => a[i] > 0.08 && a[i] > 1.6 * a[i + 2] && a[i] - a[i + 2] > 0.06;
  function teint(nom, teinte) {
    const md = cuit(nom); if (!md || !teinte) return md; const k = nom + '|' + teinte; if (CUITS.has(k)) return CUITS.get(k);
    const g = md.geo.clone(), a = g.attributes.color.array; let lmax = 0; g.userData.cache = true;
    for (let i = 0; i < a.length; i += 3) if (chaud(a, i)) lmax = Math.max(lmax, lum(a, i));
    _ct.set(teinte); for (let i = 0; i < a.length; i += 3) if (chaud(a, i)) { const f = 0.35 + 0.65 * lum(a, i) / lmax; a[i] = _ct.r * f; a[i + 1] = _ct.g * f; a[i + 2] = _ct.b * f; }
    const r = { geo: g, w: md.w, h: md.h, d: md.d }; CUITS.set(k, r); return r;
  }
  // o = { w, h, d } (cotes visées, avant la rotation ; une seule cote → échelle uniforme) ou s, plus x, y, z, rx, ry, rz, teinte ; col teinte le tout
  function part(nom, o, col) {
    o = o || {}; const md = teint(nom, o.teinte); if (!md || typeof MODELES === 'undefined' || !MODELES) return null;
    let sx, sy, sz;
    if (o.s != null) sx = sy = sz = o.s;
    else { const kw = o.w != null ? o.w / md.w : null, kh = o.h != null ? o.h / md.h : null, kd = o.d != null ? o.d / md.d : null, u = kw || kh || kd || 1; sx = kw || u; sy = kh || (kw && kd ? (kw + kd) / 2 : u); sz = kd || u; }
    const p = MODELES.part(md.geo, col || null, { x: o.x, y: o.y, z: o.z, rx: o.rx, ry: o.ry, rz: o.rz, sx, sy, sz }); p.vc = true; return p;
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

  return Object.assign(API, { pret, permis, charger, etat, H3, coupe, couper, remettre, modele, cuit, part, mini, MINI, jouer, liberer });
})();
if (typeof module !== 'undefined') module.exports = HDM;
