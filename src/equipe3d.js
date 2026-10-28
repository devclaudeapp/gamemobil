/* LE FOURNIL — le boulanger et les apprentis en personnages 3D animés, comme les clients (src/clients3d.js), avec leur tenue pièce par pièce.
   C'est le défaut en qualité haute et moyenne quand la HD est permise (HDM.permis : WebGL2, pas l'éco, pas coupée dans Réglages › Décors en
   HD) : la même règle que les clients 3D. Les chibis (src/persos.js) restent en éco, la HD coupée, tant que le lot n'est pas prêt, s'il échoue
   (les clips manquent, ou le corps du boulanger), et dans la boutique hantée (ses chibis déguisés ou ses monstres HD) ; ?equipe=0 dans
   l'adresse les garde toujours (les tests). La visite d'un copain et les boutiques de la chaîne suivent la règle de la boutique.
   · Les corps : Chef_Male et Chef_Female de l'Ultimate Animated Character Pack de Quaternius (CC0) : le pack, le rig de 23 os, le matériau
     et l'échelle des clients (HAUT = 62 × K ; le boulanger, le patron, ×1,1). Le lot « equipe » de src/hd.js (fournil/hd/equipe/, refait par
     outils/equipe3d/faire-equipe.mjs) est demandé après celui des clients, dont il reprend les clips (Idle, Walk, Victory) ; les siens :
     Walk_Carry (porter le plateau) et Defeat (la panne : la tête dans les mains) du même pack, Working_A (pétrir), Hammering (réparer le
     four, la clé à la main) et Cheering (la joie du boulanger) des KayKit Character Animations de Kay Lousberg (CC0), reciblés sur ce rig.
   · Les tenues, pièce par pièce : GAME.tenueBoulanger(st) dit ce qu'il porte (l'id de chaque pièce, sa forme, sa collection). Chaque pièce de
     la garde-robe a son « kit » 3D, fidèle à son nom et à sa description (la toque blanche plissée, la toque d'or à l'étoile, le tablier
     brodé aux initiales de la boutique, la casquette néon qui clignote, le chapeau phosphorescent, la cape doublée qui fait « whoosh », le
     trousseau qui tinte…) ; les marques du titre (la toque qui grandit, le foulard rouge, la moustache, le liseré doré, le col tricolore) et
     des grades des apprentis aussi. Un kit est bâti une fois par corps, sur ses mesures (le crâne, la façade du buste, les pieds), puis gardé
     en cache : changer de pièce ne fait que recoller des tableaux (pas d'à-coup : les pièces possédées, et la toque du titre suivant, sont
     cuites d'avance, à petits pas, dans les images qui suivent leur gain). Trois techniques, une seule géométrie, UN appel de dessin par
     personnage (plus l'aura, un plan dressé derrière lui, et le plateau d'un apprenti qui porte) : des pièces rigides sur des os (la toque, les
     chaussures, le foulard noué, la chaîne, les lunettes ; en main : la citrouille-lanterne, la clé, le pâton ; sur des os à ressort : la cape,
     le trousseau) ;
     des surfaces drapées sur le corps, chaque sommet avec les poids d'os du corps tout proche (le tablier, la poche du sweat, la capuche, la
     cape) ; des masques de sommets (les poignets, l'ourlet, le dessous des chaussures, les boutons du Chef rentrés sous le sweat) et la
     recoloration du reste (la veste, le sweat, la robe sous la cape, le col du Chef). Ce qui brille (la casquette néon, le chapeau phosphorescent, les yeux de la citrouille, l'éclat de la
     chaîne) : une lueur par sommet, dans le même matériau (l'attribut « lueur », ajouté au programme du matériau partagé).
   · Le boulanger : sa géométrie ne porte que ses pièces, refaite quand sa tenue ou son titre changent (sur le même squelette : la mémoire ne
     bouge pas). Respiration (Idle), la joie aux réussites (Cheering, le haut du corps, et un petit saut), de temps en temps il s'essuie le
     front ou se frotte les mains, la goutte de sueur pendant le coup de feu, l'aura qui respire. Les apprentis : une géométrie par corps,
     partagée (toque, tablier, étoile du grade 3, clé) ; chacun sa couleur (le haut de son poste) et ses os (la toque grandit aux grades 4 et 5).
     Au four, ils pétrissent (dos tourné, le pâton entre les mains), un peu de vapeur s'échappe du four (un maillage instancié : un appel de
     dessin) ; ils portent le plateau (Walk_Carry, le plateau entre les mains), le posent, reviennent (Walk) ; en panne, la tête dans les mains
     (Defeat), puis ils réparent le four, la clé à la main (Hammering).
   · La préparation se fait à petits pas, sur des centaines d'images (aucun pas de plus de quelques millisecondes), la tenue du boulanger de la
     partie comprise : le boulanger passe en 3D à une image, puis un apprenti par image, sans rien bâtir sur place.
   · Ce module ne touche ni à la vie (VIE) ni aux règles des apprentis (GAME.revenuFournee) : il lit leur état et le montre.
   · La vue « Mon boulanger » (vue.ouvrir) : le boulanger en grand, qu'on tourne au doigt, sa tenue portée ; une pièce changée se voit aussitôt. */
const EQUIPE3D = (() => {
  'use strict';
  const T = typeof THREE !== 'undefined' ? THREE : null, X = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
  const sansEquipe = typeof location !== 'undefined' && /[?&]equipe=0(?:&|$)/.test(location.search); // (les tests : les chibis d'office)
  const API = { actif: false, pret: false, erreur: '', permis: () => false, dispo: () => false, demander: () => {}, preparer: () => false, boulanger: () => null, rhabiller: () => {}, poserBoulanger: () => {}, apprenti: () => null, poserApprenti: () => {}, rendre: () => {}, liberer: () => false, chauffer: () => null, rentrer: () => {}, echantillon: () => null, tete: () => null, vue: { ouvert: false, ouvrir: () => false, fermer: () => {} } };
  if (sansEquipe || !T || !X || typeof document === 'undefined' || typeof HDM === 'undefined' || !HDM.actif || !HDM.LOTS || !HDM.LOTS.equipe || typeof PERSOS === 'undefined' || !PERSOS || typeof MODELES === 'undefined' || !MODELES || typeof GAME === 'undefined') return API;
  const M = MODELES, G = GAME, TAU = Math.PI * 2, HP = Math.PI / 2;

  // ═══ les corps, les rôles de couleur, les os ═══
  const CORPS = ['Chef_Male', 'Chef_Female'];
  const ROLE_MAT = { Skin: 'peau', Face: 'yeux', Hair: 'cheveux', Clothes: 'veste', DarkClothes: 'pantalon', Band: 'foulard' };
  // les rôles de couleur : ceux du corps (ses matériaux ; ses masques : les boutons de la veste du Chef, les poignets et l'ourlet de la veste, le
  // dessus et le dessous des pieds, le pantalon dans la botte), puis ceux des pièces, par emplacement (T la tête, H le haut, P les pieds, A
  // l'accessoire, X les marques du titre et du grade) et par nom (le rôle d'une part dans son kit : tissu, fonce, clair, bijou…)
  const ROLES_CORPS = ['fixe', 'peau', 'yeux', 'cheveux', 'veste', 'pantalon', 'foulard', 'boutons', 'poignet', 'ourletV', 'chaussure', 'semelleM', 'botte'];
  const LOCAUX = ['tissu', 'fonce', 'clair', 'bijou', 'galon', 'doublure', 'broderie', 'poche', 'bord', 'reflet', 'semelle', 'lacet', 'bois', 'cuir', 'blanc', 'gris', 'oeil', 'tige', 'citrouille', 'lueur', 'bleu', 'rouge', 'sueur', 'etoile', 'cle', 'moustache', 'eclat', 'pate'];
  const EMPLS = ['T', 'H', 'P', 'A', 'X'];
  const ROLES = ROLES_CORPS.concat(...EMPLS.map((e) => LOCAUX.map((l) => e + '.' + l)));
  const RI = Object.fromEntries(ROLES.map((r, i) => [r, i]));
  // les os (noms tels que les lit GLTFLoader : « Fist.R » → « FistR » ; le corps « Body » devient « Body_1 », un groupe porte déjà ce nom)
  const OS = { tete: 'Head', cou: 'Neck', torse: 'Torso', ventre: 'Abdomen', bassin: 'Hips', mainD: 'FistR', mainG: 'FistL', avantD: 'LowerArmR', avantG: 'LowerArmL', brasD: 'UpperArmR', brasG: 'UpperArmL', pieds: ['FootL', 'FootR'], tibias: ['LowerLegL', 'LowerLegR'], basDuCorps: /^(Bone|Body|Hips|UpperLeg|LowerLeg|Foot|PoleTarget)/, bras: /^(Shoulder|UpperArm|LowerArm|Fist)/ };
  // les os ajoutés au gabarit (dans cet ordre) : sur la tête (la toque et son haut, qui monte avec le grade ; la goutte de sueur), sur le torse
  // (l'étoile du grade 3 ; la cape, à ressort, pivot en haut du dos ; l'éclat de la chaîne), au bassin (le trousseau, à ressort, pivot à la
  // ceinture), en main (sous la racine : la lanterne, la clé, la pâte que pétrit un apprenti, placées à chaque image)
  const ACC = ['accToque', 'accToqueHaut', 'accSueur', 'accEtoile', 'accLanterne', 'accCle', 'accCape', 'accCles', 'accEclat', 'accPate'];
  const HAUT = 62, ECHELLE_BOULANGER = 1.1; // la hauteur des clients (CLIENTS3D.HAUT) : la même échelle pour toute la boutique ; le patron un peu plus grand
  const OR = '#FFC84A', ROUGE = '#E1496C', L = '#4A3328', BLANC = '#FFFFFF';
  const FEMMES = new Set([1, 3, 5, 8, 10, 12, 14]); // les apprenties (GAME.APPRENTIS : Inès, Rose, Agathe, Margaux, Léonie, Aliénor, Capucine)
  const YAW = { 0: 0, 1: HP, '-1': -HP, 2: Math.PI };

  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3(), _q1 = new T.Quaternion(), _q2 = new T.Quaternion(), _q3 = new T.Quaternion();
  const _m1 = new T.Matrix4(), _m2 = new T.Matrix4(), _c = new T.Color(), _s1 = new T.Vector3(), AXE_Y = new T.Vector3(0, 1, 0), _e = new T.Euler();
  const etat = { acteurs: 0, enService: 0, chauffe: false, msCuisson: 0, liberes: 0, rhabillages: 0, msRhabillage: 0, msRhabillageMax: 0, kits: 0, msKits: 0, msKitMax: 0, kitLent: '', surPlace: 0, avance: 0, imagesAvance: 0, msAvance: 0, msAvanceMax: 0 }; // (surPlace : les kits cuits à l'image où on les porte ; avance : ceux cuits d'avance, en imagesAvance images, msAvance ms dans la dernière, msAvanceMax au plus)
  const permis = (renderer) => !!(typeof HDM !== 'undefined' && HDM.permis(renderer));
  // l'équipe 3D possible ici : la HD permise dans la boutique (src/scene.js : WebGL2, pas l'éco, pas coupée) et le lot pas en échec ; la vue
  // « Mon boulanger » (son bouton dans la garde-robe) ne se propose qu'alors
  const dispo = () => !echec && !(HDM.etat.equipe && HDM.etat.equipe.erreur) && typeof SCENE !== 'undefined' && !!SCENE.hdPermise;
  function demander() { if (!HDM.etat.equipe) HDM.charger('equipe'); }
  const lin = (hex, k) => { _c.set(hex); if (k != null) _c.multiplyScalar(k); return [_c.r, _c.g, _c.b]; };
  const clair = (hex) => { _c.set(hex); return 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; };
  const mel = (a, b, k) => M.melange(a, b, k);

  // un générateur mené pas à pas, chaque pas nommé quoi (la préparation garde le nom de son plus long pas) ; rend sa valeur finale
  function* nomme(gen, quoi) { for (;;) { const x = gen.next(); if (x.done) return x.value; yield quoi; } }
  // la fin du pas en cours (performance.now()), posée par ceux qui mènent la préparation pas à pas (preparer, cuireAvance, remplir) : les
  // longues boucles des générateurs y jettent un œil de temps en temps (souffle()) et rendent la main l'heure passée. Un pas dure ainsi à peu
  // près PAS_MS quel que soit le téléphone (le processeur ralenti ×4, le code encore froid, interprété), là où un compte fixe de sommets ou de
  // triangles en prenait parfois 5 à 8 (20 à 33 ms ×4). Infinity hors de ces pas : un générateur mené d'un trait (facade(), geometrie(),
  // rhabiller()) ne s'arrête pas
  let finPas = Infinity; const PAS_MS = 1.5;
  const souffle = () => finPas !== Infinity && performance.now() > finPas;
  // ═══ la cuisson d'un corps (à petits pas) : ses parties sur le squelette de la première, les normales de face des parties en facettes, un rôle par
  //     sommet ; ses mesures au repos de liaison (la pose en T : le crâne, le visage, le buste, le cou, le bas des jambes) ; le gabarit (os ajoutés) ═══
  function* cuire(nom, gltf) {
    const src = gltf.scene; src.updateMatrixWorld(true);
    let S0 = null; src.traverse((o) => { if (!S0 && o.isSkinnedMesh) S0 = o; });
    const bones = S0.skeleton.bones, idx = new Map(bones.map((b, i) => [b.name, i])), iB = S0.bindMatrix.clone().invert(), BI0 = S0.skeleton.boneInverses.map((m) => m.clone().invert());
    const P = [], N = [], C0 = [], R = [], SI = [], SW = [], I = [];
    const v = new T.Vector3(), n3 = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    const emettre = (x, y, z, nx, ny, nz, col, role, si, sw, o) => { const k = P.length / 3; P.push(x, y, z); N.push(nx, ny, nz); C0.push(col.r, col.g, col.b); R.push(role); SI.push(si[o], si[o + 1], si[o + 2], si[o + 3]); SW.push(sw[o], sw[o + 1], sw[o + 2], sw[o + 3]); return k; };
    const parts = []; src.traverse((o) => { if (o.isSkinnedMesh) parts.push(o); });
    for (const o of parts) {
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index;
      const remap = o.skeleton.bones.map((bo) => (idx.has(bo.name) ? idx.get(bo.name) : 0));
      const Mj = o.skeleton.boneInverses.map((bi, j) => iB.clone().multiply(BI0[remap[j]]).multiply(bi).multiply(o.bindMatrix)), Nj = Mj.map((m) => new T.Matrix3().getNormalMatrix(m));
      const role = RI[ROLE_MAT[o.material.name] || 'fixe'], col = o.material.color || new T.Color(1, 1, 1);
      const PP = new Float32Array(pos.count * 3), SIi = new Uint16Array(pos.count * 4), SWi = new Float32Array(pos.count * 4), dom = new Int32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        let jd = 0, wd = -1; for (let q = 0; q < 4; q++) { const ww = sw.getComponent(i, q), jj = si.getComponent(i, q); SIi[i * 4 + q] = remap[jj]; SWi[i * 4 + q] = ww; if (ww > wd) { wd = ww; jd = jj; } }
        dom[i] = jd; v.fromBufferAttribute(pos, i).applyMatrix4(Mj[jd]); PP[i * 3] = v.x; PP[i * 3 + 1] = v.y; PP[i * 3 + 2] = v.z;
        if (i % 1200 === 1199 || ((i & 63) === 63 && souffle())) yield o.material.name;
      }
      yield o.material.name;
      const nb = ix ? ix.count : pos.count, at = (k) => (ix ? ix.getX(k) : k);
      if (nor) { const base = P.length / 3; for (let i = 0; i < pos.count; i++) { n3.fromBufferAttribute(nor, i).applyMatrix3(Nj[dom[i]]).normalize(); emettre(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2], n3.x, n3.y, n3.z, col, role, SIi, SWi, i * 4); if (i % 1200 === 1199 || ((i & 63) === 63 && souffle())) yield o.material.name; } for (let k = 0; k < nb; k++) { I.push(base + at(k)); if ((k & 1023) === 1023 && souffle()) yield o.material.name; } }
      else { // en facettes : la normale de chaque triangle ; les sommets d'une même facette plane partagés
        const vus = new Map();
        for (let k = 0; k < nb; k += 3) {
          if (k % 2400 === 2397 || (k % 96 === 93 && souffle())) yield o.material.name;
          const i0 = at(k), i1 = at(k + 1), i2 = at(k + 2);
          a.fromArray(PP, i0 * 3); b.fromArray(PP, i1 * 3); c.fromArray(PP, i2 * 3); n3.subVectors(c, b).cross(_v1.subVectors(a, b)).normalize();
          const cle = ((Math.round(n3.x * 500) + 500) * 1001 + Math.round(n3.y * 500) + 500) * 1001 + Math.round(n3.z * 500) + 500;
          for (const i of [i0, i1, i2]) { const kk = i * 1003003001 + cle; let e = vus.get(kk); if (e === undefined) { e = emettre(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2], n3.x, n3.y, n3.z, col, role, SIi, SWi, i * 4); vus.set(kk, e); } I.push(e); }
        }
      }
      yield o.material.name;
    }
    // (les tableaux typés, deux par pas : des dizaines de milliers de nombres chacun)
    const n = P.length / 3, pr = { nom, n, P: new Float32Array(P), N: new Float32Array(N), bindMatrix: S0.bindMatrix.clone(), iB, osIdx: new Map(idx), nbOs: bones.length, kits: new Map() };
    yield 'positions';
    pr.C0 = new Float32Array(C0); pr.R = new Uint8Array(R);
    yield 'positions';
    pr.SI = new Uint16Array(SI); pr.SW = new Float32Array(SW);
    yield 'positions';
    pr.I = new Uint32Array(I);
    yield 'positions';
    pr.dom = new Uint16Array(n); for (let k = 0; k < n; k++) { let jd = pr.SI[k * 4], wd = pr.SW[k * 4]; for (let q = 1; q < 4; q++) if (pr.SW[k * 4 + q] > wd) { wd = pr.SW[k * 4 + q]; jd = pr.SI[k * 4 + q]; } pr.dom[k] = jd; if ((k & 511) === 511 && souffle()) yield 'positions'; }
    yield 'positions';
    pr.osW = {}; bones.forEach((bo, i) => { pr.osW[bo.name] = new T.Vector3().setFromMatrixPosition(BI0[i]); }); // les os au repos de liaison (le monde)
    pr.W = new Float32Array(n * 3); for (let k = 0; k < n; k++) { v.fromArray(pr.P, k * 3).applyMatrix4(pr.bindMatrix); v.toArray(pr.W, k * 3); if ((k & 511) === 511 && souffle()) yield 'positions'; } // les positions au repos de liaison, dans le monde
    yield 'positions';
    yield* nomme(mesuresGen(pr, bones), 'mesures');
    yield* nomme(facadeGen(pr, 1), 'façade');
    // le gabarit : le gltf cloné, un seul SkinnedMesh, les os ajoutés, le squelette refait
    const tpl = X.SkeletonUtils.clone(src); let S1 = null; const jeter = [];
    tpl.traverse((o) => { if (o.isMesh) { if (!S1 && o.isSkinnedMesh) S1 = o; else jeter.push(o); } });
    for (const o of jeter) o.parent.remove(o);
    const os = S1.skeleton.bones.slice(), inv = S1.skeleton.boneInverses.slice(), iB1 = S1.bindMatrix.clone().invert(), tete = idx.get(OS.tete), torse = idx.get(OS.torse), bassin = idx.get(OS.bassin), racine = os.findIndex((bo) => !bo.parent || !bo.parent.isBone);
    // les pivots des os à ressort, au repos de liaison (le monde) : la cape en haut du dos, le trousseau à la ceinture, sur la hanche droite
    const m = pr.m, f = facade(pr, 1), xC = m.tete.cx - 0.105 * m.u, yC = m.pantalon.max.y + 0.005 * m.u, pivots = { accCape: new T.Vector3(m.tete.cx, m.buste.max.y - 0.03 * m.u, m.buste.min.z * 0.6), accCles: new T.Vector3(xC, yC, Math.max(f.zA(xC, yC), f.zA(xC, yC - 0.06 * m.u)) + 0.034 * m.u), accEclat: new T.Vector3(m.tete.cx + 0.03 * m.u, m.buste.max.y - 0.16 * m.u, m.buste.max.z + 0.05 * m.u) };
    ACC.forEach((nomOs) => {
      const enMain = nomOs === 'accLanterne' || nomOs === 'accCle' || nomOs === 'accPate', bo = new T.Bone(); bo.name = nomOs; bo.scale.setScalar(nomOs === 'accSueur' || nomOs === 'accEtoile' || nomOs === 'accEclat' || enMain ? 0 : 1);
      const ip = nomOs === 'accToqueHaut' ? os.length - 1 : nomOs === 'accEtoile' || nomOs === 'accCape' || nomOs === 'accEclat' ? torse : nomOs === 'accCles' ? bassin : enMain ? -1 : tete;
      const parent = ip < 0 ? os[racine] : os[ip], invP = ip < 0 ? iB1 : inv[ip], pv = pivots[nomOs];
      let iv = invP.clone();
      if (pv) { const o = pv.clone().applyMatrix4(invP); bo.position.copy(o); iv = new T.Matrix4().makeTranslation(-o.x, -o.y, -o.z).multiply(invP); pr['pivot_' + nomOs] = pv.clone(); } // (un pivot décalé : l'os au repos là où il doit tourner)
      parent.add(bo); os.push(bo); inv.push(iv);
      pr.osIdx.set(nomOs, os.length - 1);
    });
    S1.bind(new T.Skeleton(os, inv), S1.bindMatrix);
    S1.castShadow = true; S1.receiveShadow = false; S1.frustumCulled = false;
    pr.tpl = tpl; pr.racine = racine;
    // la toque monte d'un grade à l'autre : l'os de son haut se déplace vers le haut du monde au repos, exprimé dans le repère de la tête
    const rt = BI0[tete].clone(); rt.setPosition(0, 0, 0); pr.hautTete = new T.Vector3(0, 1, 0).applyMatrix4(rt.invert()); // (BI0 : l'os au repos dans le monde ; son inverse ramène le vecteur dans le repère de l'os)
    yield 'gabarit';
    yield* mesurer(pr);
    return pr;
  }

  // les mesures au repos de liaison (en T, le visage vers +z, le haut +y, la gauche du personnage vers +x), en unités du modèle
  function* mesuresGen(pr, bones) { // (à petits pas : une boîte, puis la suivante ; chacune rend la main l'heure passée)
    const nomDe = (j) => bones[j] ? bones[j].name : '', W = pr.W, R = pr.R, n = pr.n;
    function* bx(f) { const b = new T.Box3(); for (let k = 0; k < n; k++) { if (f(k)) b.expandByPoint(_v1.fromArray(W, k * 3)); if ((k & 1023) === 1023 && souffle()) yield; } return b; }
    const noms = new Array(n); for (let k = 0; k < n; k++) { noms[k] = nomDe(pr.dom[k]); if ((k & 1023) === 1023 && souffle()) yield; } const os = (k) => noms[k];
    yield;
    const crane = yield* bx((k) => R[k] === RI.peau && os(k) === OS.tete), visage = yield* bx((k) => R[k] === RI.yeux), cheveux = yield* bx((k) => R[k] === RI.cheveux);
    yield;
    const buste = yield* bx((k) => R[k] === RI.veste && (os(k) === OS.torse || os(k) === OS.ventre)), foulard = yield* bx((k) => R[k] === RI.foulard);
    yield;
    const pantalon = yield* bx((k) => R[k] === RI.pantalon), cou = yield* bx((k) => R[k] === RI.peau && os(k) === OS.cou);
    yield;
    const t = { cx: (crane.min.x + crane.max.x) / 2, cy: (crane.min.y + crane.max.y) / 2, cz: (crane.min.z + crane.max.z) / 2, rx: (crane.max.x - crane.min.x) / 2, ry: (crane.max.y - crane.min.y) / 2, rz: (crane.max.z - crane.min.z) / 2, sommet: crane.max.y };
    // les yeux : le bas de la partie « Face » de chaque côté (le haut, ce sont les sourcils)
    const cxv = (visage.min.x + visage.max.x) / 2, hy = visage.max.y - visage.min.y, basY = visage.min.y + hy * 0.6, oeil = (cote) => { const s = new T.Vector3(); let k0 = 0; for (let k = 0; k < n; k++) if (R[k] === RI.yeux && (W[k * 3] - cxv) * cote > 0 && W[k * 3 + 1] < basY) { s.x += W[k * 3]; s.y += W[k * 3 + 1]; s.z += W[k * 3 + 2]; k0++; } return s.multiplyScalar(1 / Math.max(1, k0)); };
    const yeux = { g: oeil(1), d: oeil(-1), front: visage.max.z, sourcils: visage.max.y, bas: visage.min.y };
    yield;
    // les pieds : la peau sous le pantalon (les tibias et les pieds de l'UACP), de chaque côté (0 : la gauche, +x ; 1 : la droite)
    const jambe = new Uint8Array(n); for (let k = 0; k < n; k++) jambe[k] = R[k] === RI.peau && /Foot|LowerLeg/.test(os(k)) ? 1 : 0;
    const piedsY0 = (yield* bx((k) => jambe[k] === 1)).min.y;
    const pieds = []; for (const cote of [1, -1]) pieds.push(yield* bx((k) => jambe[k] === 1 && W[k * 3] * cote > 0));
    yield;
    const epaules = yield* bx((k) => R[k] === RI.veste && /^Shoulder/.test(os(k))), veste = yield* bx((k) => R[k] === RI.veste && !/^(UpperArm|LowerArm|Fist)/.test(os(k)));
    pr.m = { tete: t, yeux, cheveux, buste, foulard, pantalon, cou, piedsY0, pieds, epaules, veste, chevilleY: pantalon.min.y, H: Math.max(cheveux.max.y, crane.max.y) - piedsY0,
      // l'échelle des chibis (src/persos.js) : un crâne de rayon 10, un buste de rayon 11 haut de 34 (y de 19 à 53) ; les pièces y sont dessinées
      kt: [t.rx / 10, t.ry / 10, t.rz / 10], kb: [Math.max(Math.abs(buste.min.x - t.cx), Math.abs(buste.max.x - t.cx)) / 11, (buste.max.y - pantalon.max.y) / 34, (buste.max.z - buste.min.z) / 22] };
    pr.m.busteY0 = buste.max.y - 53 * pr.m.kb[1]; // le sol des chibis ramené au buste (leur buste va de y 19, la taille, à 53, le cou) : y(chibi) → busteY0 + y × kb[1]
    pr.m.busteZ = (buste.min.z + buste.max.z) / 2;
    pr.m.u = pr.m.H / 1.97; // l'unité des cotes des kits : bâties sur Chef_Male (1,97 de haut), elles suivent un autre corps
    pr.nomOs = nomDe;
    yield;
    // les sommets de la peau de la tête (rayonCrane : les couvre-chefs s'y ajustent, dans les pas de leurs kits), une fois par corps
    const vc = []; for (let k = 0; k < n; k++) { if (R[k] === RI.peau && noms[k] === OS.tete) vc.push(k); if ((k & 1023) === 1023 && souffle()) yield; }
    pr.vCrane = new Int32Array(vc);
  }
  // le rayon du crâne seul (la peau de la tête) autour de son axe, entre deux hauteurs : un couvre-chef s'y ajuste (les cheveux sont resserrés dessous)
  function rayonCrane(pr, y0, y1) {
    const t = pr.m.tete, W = pr.W;
    if (!pr.vCrane) { const l = []; for (let k = 0; k < pr.n; k++) if (pr.R[k] === RI.peau && pr.nomOs(pr.dom[k]) === OS.tete) l.push(k); pr.vCrane = new Int32Array(l); } // (mesuresGen les a d'habitude déjà relevés)
    let r = 0; for (const k of pr.vCrane) { const y = W[k * 3 + 1]; if (y < y0 || y > y1) continue; r = Math.max(r, Math.hypot(W[k * 3] - t.cx, W[k * 3 + 2] - t.cz)); } return r || t.rx;
  }

  // les positions monde des n premiers sommets d'un maillage skinné, à sa pose (comme src/clients3d.js)
  function sommetsMonde(S, n, fn, i0) { // (i0 : à partir de ce sommet, pour une tranche)
    S.skeleton.update(); const bm = S.skeleton.boneMatrices, g = S.geometry, p = g.attributes.position.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
    _m1.multiplyMatrices(S.matrixWorld, S.bindMatrixInverse); const Wm = _m1.elements, B = S.bindMatrix.elements;
    for (let i = i0 || 0; i < n; i++) {
      const x0 = p[i * 3], y0 = p[i * 3 + 1], z0 = p[i * 3 + 2], x = B[0] * x0 + B[4] * y0 + B[8] * z0 + B[12], y = B[1] * x0 + B[5] * y0 + B[9] * z0 + B[13], z = B[2] * x0 + B[6] * y0 + B[10] * z0 + B[14];
      let sx = 0, sy = 0, sz = 0;
      for (let q = 0; q < 4; q++) { const w = sw[i * 4 + q]; if (w === 0) continue; const o = si[i * 4 + q] * 16; sx += w * (bm[o] * x + bm[o + 4] * y + bm[o + 8] * z + bm[o + 12]); sy += w * (bm[o + 1] * x + bm[o + 5] * y + bm[o + 9] * z + bm[o + 13]); sz += w * (bm[o + 2] * x + bm[o + 6] * y + bm[o + 10] * z + bm[o + 14]); }
      fn(i, Wm[0] * sx + Wm[4] * sy + Wm[8] * sz + Wm[12], Wm[1] * sx + Wm[5] * sy + Wm[9] * sz + Wm[13], Wm[2] * sx + Wm[6] * sy + Wm[10] * sz + Wm[14]);
    }
  }
  function* mesurer(pr) { // sur un clone, le corps seul : la hauteur debout (Idle), le sol, le dessus de la tête ; la vitesse du pas (Walk, Walk_Carry)
    const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pr.P, 3)); geo.setAttribute('skinIndex', new T.BufferAttribute(pr.SI, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(pr.SW, 4)); S.geometry = geo;
    yield 'debout'; // (le clone, puis son mélangeur, puis les sommets à la pose par tranches : trois pas au lieu d'un)
    const mx = new T.AnimationMixer(g), tete = g.getObjectByName(OS.tete), pied = g.getObjectByName(OS.pieds[0]);
    const id = mx.clipAction(CL.Idle); id.play(); mx.setTime(0.01); g.updateMatrixWorld(true);
    yield 'debout';
    let ymax = -1e9, ymin = 1e9; const haut = (i, x, y) => { if (y > ymax) ymax = y; if (y < ymin) ymin = y; };
    for (let i0 = 0; i0 < pr.n; i0 += 2048) { sommetsMonde(S, Math.min(pr.n, i0 + 2048), haut, i0); if (i0 + 2048 < pr.n && souffle()) yield 'debout'; }
    pr.hauteur = ymax - Math.min(0, ymin); pr.sol = ymin; tete.getWorldPosition(_v1); pr.dessus = ymax - _v1.y; id.stop();
    yield 'debout';
    for (const nom of ['Walk', 'Walk_Carry']) {
      const clip = CL[nom]; if (!clip) continue; const ma = mx.clipAction(clip); ma.play(); let z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < 24; k++) { mx.setTime(clip.duration * k / 24); g.updateMatrixWorld(true); pied.getWorldPosition(_v1); z0 = Math.min(z0, _v1.z); z1 = Math.max(z1, _v1.z); if (k % 8 === 7) yield 'marche'; }
      pr['vitesse' + nom] = 2 * (z1 - z0) / clip.duration; ma.stop();
    }
    mx.uncacheRoot(g); geo.dispose();
    yield 'marche';
  }

  // ═══ le corps vu par les pièces : ses sommets les plus proches (leurs poids d'os), son contour à une hauteur, sa façade de face et de dos ═══
  // les sommets du corps rangés dans une grille (au repos de liaison) : les plus proches d'un point, parmi ceux qu'un filtre garde (le nom de leur os)
  function proches(pr) { if (pr.proches) return pr.proches; const g = prochesGen(pr); let x; do x = g.next(); while (!x.done); return x.value; }
  function* prochesGen(pr) { // (à petits pas : la grille, puis le nom de l'os de chaque sommet)
    if (pr.proches) return pr.proches;
    const W = pr.W, n = pr.n, c = 0.04 * pr.m.u, cel = new Map(), cle = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
    for (let v = 0; v < n; v++) { const q = cle(Math.floor(W[v * 3] / c), Math.floor(W[v * 3 + 1] / c), Math.floor(W[v * 3 + 2] / c)); let l = cel.get(q); if (!l) cel.set(q, (l = [])); l.push(v); if (v % 2000 === 1999 || ((v & 255) === 255 && souffle())) yield; }
    yield;
    // (le filtre d'un sommet : celui de son os, l'expression régulière passée une fois par os et non par sommet — le premier point posé avec
    //  un filtre neuf ne coûte plus un tour de tous les sommets)
    const passe = new Map(), filtreDe = (f) => { if (!f) return null; let a = passe.get(f.source); if (!a) { const po = new Uint8Array(pr.nbOs); for (let j = 0; j < pr.nbOs; j++) po[j] = f.test(pr.nomOs(j)) ? 1 : 0; a = new Uint8Array(n); for (let v = 0; v < n; v++) a[v] = po[pr.dom[v]]; passe.set(f.source, a); } return a; };
    function chercher(x, y, z, filtre, kmax) { // les kmax plus proches : [[sommet, distance²], …], du plus proche au plus loin
      const i0 = Math.floor(x / c), j0 = Math.floor(y / c), k0 = Math.floor(z / c), out = [], ok = filtreDe(filtre);
      for (let r = 0; r < 12 && out.length < kmax; r++) {
        for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) for (let k = k0 - r; k <= k0 + r; k++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0), Math.abs(k - k0)) !== r) continue; // (la couronne de rang r seulement)
          const l = cel.get(cle(i, j, k)); if (!l) continue;
          for (const v of l) { if (ok && !ok[v]) continue; const dx = W[v * 3] - x, dy = W[v * 3 + 1] - y, dz = W[v * 3 + 2] - z; out.push([v, dx * dx + dy * dy + dz * dz]); }
        }
        if (out.length >= kmax) { out.sort((a, b) => a[1] - b[1]); if (out[kmax - 1][1] <= (r * c) * (r * c)) break; } // (assez de candidats plus proches que la couronne suivante)
      }
      out.sort((a, b) => a[1] - b[1]); return out.slice(0, kmax);
    }
    return (pr.proches = { chercher });
  }
  // les poids d'os d'un point posé près du corps : ceux de ses quatre sommets les plus proches (parmi les os que filtre garde), mêlés selon la
  // distance ; il se déforme avec le corps sous lui (les épaules qui tombent, le torse qui respire)
  function poidsCorps(pr, filtre) {
    const P = proches(pr), vus = new Map(), q = 2e4;
    return (x, y, z) => {
      const cle = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`, d = vus.get(cle); if (d) return d;
      const l = P.chercher(x, y, z, filtre, 4), acc = new Map();
      for (const [v, d2] of l) { const w0 = 1 / (Math.sqrt(d2) + 0.004 * pr.m.u); for (let q = 0; q < 4; q++) { const w = pr.SW[v * 4 + q] * w0; if (w > 0) acc.set(pr.SI[v * 4 + q], (acc.get(pr.SI[v * 4 + q]) || 0) + w); } }
      const t = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), s = t.reduce((a, x) => a + x[1], 0) || 1, r = t.map(([b, w]) => [b, w / s]);
      vus.set(cle, r); return r;
    };
  }
  // le contour du corps à une hauteur : son rayon le plus grand autour de l'axe du corps dans chaque direction (θ = 0 devant, π/2 vers sa gauche),
  // parmi les sommets dont l'os passe le filtre ; en cache par filtre
  function contour(pr, filtre, cleF) {
    pr.contours = pr.contours || {}; if (pr.contours[cleF]) return pr.contours[cleF];
    const W = pr.W, n = pr.n, cx = pr.m.tete.cx, cz = pr.m.busteZ, pasY = 0.02 * pr.m.u, NA = 48, y0 = pr.m.piedsY0, NY = Math.ceil(pr.m.H / pasY) + 2, Rm = new Float32Array(NY * NA);
    const passe = new Uint8Array(pr.nbOs); for (let j = 0; j < pr.nbOs; j++) passe[j] = !filtre || filtre.test(pr.nomOs(j)) ? 1 : 0; // (le filtre par os, une fois : pas d'expression régulière par sommet)
    for (let v = 0; v < n; v++) {
      if (!passe[pr.dom[v]]) continue; if (pr.R[v] === RI.cheveux || pr.R[v] === RI.yeux) continue;
      const x = W[v * 3] - cx, z = W[v * 3 + 2] - cz, j = Math.round((W[v * 3 + 1] - y0) / pasY); if (j < 0 || j >= NY) continue;
      const a = ((Math.atan2(x, z) / TAU) % 1 + 1) % 1, i = Math.round(a * NA) % NA, r = Math.hypot(x, z); if (r > Rm[j * NA + i]) Rm[j * NA + i] = r;
    }
    const r = (theta, y) => { // le plus grand rayon autour de (θ, y), à un pas près de chaque côté
      const a = ((theta / TAU) % 1 + 1) % 1, i = Math.round(a * NA) % NA, j = Math.round((y - y0) / pasY); let m = 0;
      for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= NY) continue; for (let di = -1; di <= 1; di++) m = Math.max(m, Rm[jj * NA + ((i + di) % NA + NA) % NA]); }
      return m;
    };
    return (pr.contours[cleF] = { r, cx, cz });
  }
  // la façade du corps vue de face (sens 1) ou de dos (sens -1) : sur une grille de x et y au repos de liaison, le triangle le plus en avant (ou
  // le plus en arrière) de la veste, du pantalon, du foulard et des boutons (sans les bras), sa profondeur z et ses coordonnées barycentriques ;
  // les trous d'une rangée (entre les jambes) bouchés d'un bord à l'autre. Un point posé sur la façade reprend les poids d'os du point du corps
  // qui est dessous : il se déforme avec lui (les épaules qui tombent, les cuisses qui marchent), sans que la veste ni le pantalon le percent. En
  // cache par corps et par sens
  // (facade() la rend d'un trait, en cache ; facadeGen() la bâtit à petits pas — la préparation, src/scene.js à chaque image —, rendant la
  //  main tous les 96 triangles, entre ses passes, et dès que l'heure du pas est passée : souffle())
  function facade(pr, sens) { const k0 = (sens || 1) > 0 ? 'facade' : 'facadeDos'; if (pr[k0]) return pr[k0]; const g = facadeGen(pr, sens); let x; do x = g.next(); while (!x.done); return x.value; }
  function* facadeGen(pr, sens) {
    sens = sens || 1; const k0 = sens > 0 ? 'facade' : 'facadeDos'; if (pr[k0]) return pr[k0];
    const W = pr.W, R = pr.R, I = pr.I, m = pr.m, pas = 0.006 * m.u, x0 = m.tete.cx - 0.4 * m.u, y0 = m.piedsY0, y1 = m.buste.max.y + 0.03 * m.u, nx = Math.round(0.8 * m.u / pas) + 1, ny = Math.round((y1 - y0) / pas) + 1, nc = nx * ny;
    const Z = new Float32Array(nc).fill(-1e9), TR = new Int32Array(nc).fill(-1), BA = new Float32Array(nc * 2), GA = new Int32Array(nc * 2).fill(-1), GF = new Float32Array(nc);
    const torse = new Uint8Array(pr.nbOs), bras = new Uint8Array(pr.nbOs); for (let j = 0; j < pr.nbOs; j++) { const os = pr.nomOs(j); torse[j] = /Torso|Abdomen/.test(os) ? 1 : 0; bras[j] = /^(UpperArm|LowerArm|Fist)/.test(os) ? 1 : 0; } // (par os, une fois : pas d'expression régulière par sommet)
    const garde = new Uint8Array(pr.n); for (let k = 0; k < pr.n; k++) { const j = pr.dom[k]; garde[k] = (R[k] === RI.veste || R[k] === RI.pantalon || R[k] === RI.foulard || (R[k] === RI.peau && torse[j])) && !bras[j] ? 1 : 0; if ((k & 1023) === 1023 && souffle()) yield; } // (le haut de la poitrine est sur les os des épaules : gardé)
    const ok = (k) => garde[k] === 1;
    yield;
    let travail = 0; // (les cases parcourues depuis le dernier pas : un grand triangle en couvre des centaines ; on rend la main toutes les 6 000, ou l'heure passée)
    for (let t = 0; t < I.length; t += 3) {
      if (travail > 6000 || t % 288 === 285 || (t % 24 === 21 && souffle())) { travail = 0; yield; }
      const a = I[t], b = I[t + 1], c = I[t + 2]; if (!ok(a) || !ok(b) || !ok(c)) continue;
      const ax = W[a * 3], ay = W[a * 3 + 1], az = sens * W[a * 3 + 2], bx = W[b * 3], by = W[b * 3 + 1], bz = sens * W[b * 3 + 2], cx = W[c * 3], cy = W[c * 3 + 1], cz = sens * W[c * 3 + 2];
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(det) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / pas)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / pas)), j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / pas)), j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - y0) / pas));
      travail += (i1 - i0 + 1) * (j1 - j0 + 1);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = x0 + i * pas, py = y0 + j * pas, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, l3 = 1 - l1 - l2;
          if (l1 < -1e-3 || l2 < -1e-3 || l3 < -1e-3) continue; const z = l1 * az + l2 * bz + l3 * cz, q = j * nx + i;
          if (z > Z[q]) { Z[q] = z; TR[q] = t; BA[q * 2] = l1; BA[q * 2 + 1] = l2; }
        }
        if ((j & 3) === 3 && souffle()) { travail = 0; yield; } // (un grand triangle : il rend la main entre deux rangées)
      }
    }
    yield;
    for (let j = 0; j < ny; j++) { let prev = -1; for (let i = 0; i < nx; i++) { const q = j * nx + i; if (Z[q] > -1e8 && TR[q] >= 0) { if (prev >= 0 && i - prev > 1) for (let r = prev + 1; r < i; r++) { const f = (r - prev) / (i - prev), qq = j * nx + r; Z[qq] = Z[j * nx + prev] + (Z[q] - Z[j * nx + prev]) * f; GA[qq * 2] = j * nx + prev; GA[qq * 2 + 1] = q; GF[qq] = f; } prev = i; } } if ((j & 7) === 7 && souffle()) yield; }
    yield;
    // la façade drapée : le plus en avant à 0,024 près autour de chaque point (un tissu posé passe par-dessus les marches : l'ourlet de la veste, l'entrejambe)
    const ZD = new Float32Array(nc).fill(-1e9), ZH = new Float32Array(nc), rd = 4; // (le maximum sur le carré : sur la ligne, puis sur la colonne)
    for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) { let z = -1e9; for (let ii = Math.max(0, i - rd), i1 = Math.min(nx - 1, i + rd); ii <= i1; ii++) { const v = Z[j * nx + ii]; if (v > z) z = v; } ZH[j * nx + i] = z; } if (j % 40 === 39 || ((j & 3) === 3 && souffle())) yield; }
    yield;
    for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) { if (!(Z[j * nx + i] > -1e8)) continue; let z = -1e9; for (let jj = Math.max(0, j - rd), j1 = Math.min(ny - 1, j + rd); jj <= j1; jj++) { const v = ZH[jj * nx + i]; if (v > z) z = v; } ZD[j * nx + i] = z; } if (j % 40 === 39 || ((j & 3) === 3 && souffle())) yield; }
    const cellule = (i, j) => { i = Math.max(0, Math.min(nx - 1, i)); j = Math.max(0, Math.min(ny - 1, j)); let q = j * nx + i; for (let d = 1; Z[q] < -1e8 && d < nx; d++) { const g = j * nx + Math.max(0, i - d), dr = j * nx + Math.min(nx - 1, i + d); q = Z[g] > -1e8 ? g : dr; } return q; };
    const zA = (x, y) => { const fi = (x - x0) / pas, fj = (y - y0) / pas, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j; return sens * ((ZD[cellule(i, j)] * (1 - u) + ZD[cellule(i + 1, j)] * u) * (1 - v) + (ZD[cellule(i, j + 1)] * (1 - u) + ZD[cellule(i + 1, j + 1)] * u) * v); };
    const ajouterSommet = (k, w, acc) => { for (let q = 0; q < 4; q++) { const ww = pr.SW[k * 4 + q] * w; if (ww > 0) acc.set(pr.SI[k * 4 + q], (acc.get(pr.SI[k * 4 + q]) || 0) + ww); } };
    const poidsCellule = (q, w, acc) => { if (w <= 0) return; if (TR[q] >= 0) { const t = TR[q], l1 = BA[q * 2], l2 = BA[q * 2 + 1]; ajouterSommet(I[t], w * l1, acc); ajouterSommet(I[t + 1], w * l2, acc); ajouterSommet(I[t + 2], w * (1 - l1 - l2), acc); } else if (GA[q * 2] >= 0) { poidsCellule(GA[q * 2], w * (1 - GF[q]), acc); poidsCellule(GA[q * 2 + 1], w * GF[q], acc); } };
    const norme = (acc) => { const l = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), s0 = l.reduce((a, x) => a + x[1], 0) || 1; return l.map(([b, w]) => [b, w / s0]); };
    const poidsA = (x, y) => { const fi = (x - x0) / pas, fj = (y - y0) / pas, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, acc = new Map(); poidsCellule(cellule(i, j), (1 - u) * (1 - v), acc); poidsCellule(cellule(i + 1, j), u * (1 - v), acc); poidsCellule(cellule(i, j + 1), (1 - u) * v, acc); poidsCellule(cellule(i + 1, j + 1), u * v, acc); return norme(acc); };
    // la normale de la façade drapée (vers l'extérieur), par différences
    const normale = (x, y, out) => { const d = 2 * pas; return (out || new T.Vector3()).set(-sens * (zA(x + d, y) - zA(x - d, y)) / (2 * d), -sens * (zA(x, y + d) - zA(x, y - d)) / (2 * d), sens).normalize(); };
    return (pr[k0] = { zA, poidsA, normale, sens });
  }

  // le dessus du corps vu d'en haut (le haut des épaules, la nuque, le col ; ni la tête ni les avant-bras) : toit(x, z), la hauteur la plus
  // haute sous ce point (-1e9 hors du corps) ; une fois par corps
  function toit(pr) { if (pr.toit) return pr.toit; const g = toitGen(pr); let x; do x = g.next(); while (!x.done); return x.value; }
  function* toitGen(pr) { // (à petits pas, comme facadeGen)
    if (pr.toit) return pr.toit; const W = pr.W, R = pr.R, I = pr.I, m = pr.m, u = m.u, pas = 0.008 * u, x0 = m.tete.cx - 0.36 * u, z0 = m.busteZ - 0.3 * u, nx = Math.ceil(0.72 * u / pas) + 1, nz = Math.ceil(0.6 * u / pas) + 1, Y = new Float32Array(nx * nz).fill(-1e9);
    const haut = new Uint8Array(pr.nbOs); for (let j = 0; j < pr.nbOs; j++) haut[j] = /^(Torso|Neck|Shoulder|UpperArm)/.test(pr.nomOs(j)) ? 1 : 0;
    const garde = new Uint8Array(pr.n); for (let k = 0; k < pr.n; k++) { garde[k] = (R[k] === RI.veste || R[k] === RI.foulard || R[k] === RI.peau) && haut[pr.dom[k]] ? 1 : 0; if ((k & 1023) === 1023 && souffle()) yield; }
    const ok = (k) => garde[k] === 1;
    yield;
    let travail = 0;
    for (let t = 0; t < I.length; t += 3) {
      if (travail > 6000 || t % 768 === 765 || (t % 24 === 21 && souffle())) { travail = 0; yield; }
      const a = I[t], b = I[t + 1], c = I[t + 2]; if (!ok(a) || !ok(b) || !ok(c)) continue;
      const ax = W[a * 3], ay = W[a * 3 + 1], az = W[a * 3 + 2], bx = W[b * 3], by = W[b * 3 + 1], bz = W[b * 3 + 2], cx = W[c * 3], cy = W[c * 3 + 1], cz = W[c * 3 + 2], det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / pas)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / pas)), j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / pas)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / pas));
      travail += (i1 - i0 + 1) * (j1 - j0 + 1);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) { const px = x0 + i * pas, pz = z0 + j * pas, l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det, l3 = 1 - l1 - l2; if (l1 < -1e-3 || l2 < -1e-3 || l3 < -1e-3) continue; const y = l1 * ay + l2 * by + l3 * cy, q = j * nx + i; if (y > Y[q]) Y[q] = y; }
        if ((j & 3) === 3 && souffle()) { travail = 0; yield; }
      }
    }
    return (pr.toit = (x, z) => { const i = Math.round((x - x0) / pas), j = Math.round((z - z0) / pas); return i < 0 || j < 0 || i >= nx || j >= nz ? -1e9 : Y[j * nx + i]; });
  }

  // ═══ les pièces : des kits. Un kit, c'est une liste de parts { geo, m, role, os } : une géométrie (jetée après usage), une matrice (vers le
  //     monde au repos de liaison), un rôle de couleur local (tissu, fonce, clair, bijou… ; ou un rôle par sommet), ses os (un nom d'os ; une
  //     fonction des positions qui rend [[os, poids], …] ; ou les poids de chaque sommet). emettre() les ramène dans l'espace de liaison du
  //     maillage, en facettes, soudées : des tableaux, gardés en cache par corps (pr.kits) ═══
  const pc = (geo, role, p, os, o) => Object.assign({ geo, m: p ? (p.isMatrix4 ? p : M.matrice(p)) : null, role, os }, o || {});
  const porter = (parts, mat) => { for (const p of parts) p.m = p.m ? mat.clone().multiply(p.m) : mat.clone(); return parts; };
  const V3d = (x, y, z) => new T.Vector3(x, y, z);
  const surTete = (pr) => { const t = pr.m.tete, k = pr.m.kt; return new T.Matrix4().makeTranslation(t.cx, t.cy, t.cz).multiply(new T.Matrix4().makeScale(k[0], k[1], k[2])); };
  // une nappe tendue entre des anneaux (du bas vers le haut ; dans chacun, les points dans le sens des θ croissants : θ = 0 devant, π/2 vers la
  // gauche du personnage, +x) : ses faces regardent dehors (o.dedans : dedans) ; o.ouvert : les anneaux ne bouclent pas ; o.bas, o.haut : un
  // bouchon (vers le bas, vers le haut ; au centre des points, ou au point donné)
  function nappe(anneaux, o) {
    o = o || {}; const P = [], ferme = !o.ouvert;
    const tri = (a, b, c) => { if (o.dedans) P.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z); else P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
    for (let j = 0; j < anneaux.length - 1; j++) { const A = anneaux[j], B = anneaux[j + 1], n = A.length, m = ferme ? n : n - 1; for (let i = 0; i < m; i++) { const i1 = (i + 1) % n; tri(A[i], A[i1], B[i]); tri(A[i1], B[i1], B[i]); } }
    const centre = (A) => A.reduce((s, p) => s.add(p), new T.Vector3()).multiplyScalar(1 / A.length);
    if (o.bas) { const A = anneaux[0], c = o.bas.isVector3 ? o.bas : centre(A); for (let i = 0; i < A.length; i++) tri(c, A[(i + 1) % A.length], A[i]); }
    if (o.haut) { const A = anneaux[anneaux.length - 1], c = o.haut.isVector3 ? o.haut : centre(A); for (let i = 0; i < A.length; i++) tri(c, A[i], A[(i + 1) % A.length]); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); return g;
  }
  // un anneau de n points autour de (cx, y, cz), rayons rx (vers +x) et rz (vers +z), × f(θ, i) ; ouvert de a0 à a1 (n + 1 points)
  function anneau(cx, y, cz, rx, rz, n, f, a0, a1) {
    const out = [], ouvert = a1 != null, nn = ouvert ? n + 1 : n;
    for (let i = 0; i < nn; i++) { const th = ouvert ? a0 + (a1 - a0) * i / n : i / n * TAU, k = f ? f(th, i) : 1; out.push(new T.Vector3(cx + Math.sin(th) * rx * k, typeof y === 'function' ? y(th, i) : y, cz + Math.cos(th) * rz * k)); }
    return out;
  }
  const tube = (pts, r, nr, segs, ferme) => new T.TubeGeometry(new T.CatmullRomCurve3(pts, !!ferme, 'catmullrom', 0.5), segs || pts.length * 3, r, nr || 5, !!ferme);
  // une baguette de a à b (le monde) : épaisseur ep, profondeur prof le long de n (la normale de la surface où elle est posée, a et b sur elle)
  function baton(a, b, ep, prof, n) {
    const d = new T.Vector3().subVectors(b, a), Lg = d.length(), g = new T.BoxGeometry(Lg + ep * 0.9, ep, prof), xa = d.normalize(), ya = new T.Vector3().crossVectors(n, xa).normalize(), za = new T.Vector3().crossVectors(xa, ya);
    return g.applyMatrix4(new T.Matrix4().makeBasis(xa, ya, za).setPosition(a.clone().add(b).multiplyScalar(0.5).addScaledVector(za, prof * 0.45)));
  }
  // une forme plate (THREE.Shape, dans le plan xy, face à +z) extrudée de d, centrée ; puis posée par la matrice m
  function plaque(forme, d, biseau) { const g = new T.ExtrudeGeometry(forme, { depth: d, bevelEnabled: !!biseau, bevelThickness: biseau || 0, bevelSize: biseau || 0, bevelSegments: 1, curveSegments: 3 }); g.center(); return g; }
  function etoile(R, r, d, n) { // une étoile à n branches (5), centrée, face à +z, une pointe en haut
    const s = new T.Shape(), k = n || 5; for (let i = 0; i < 2 * k; i++) { const a = HP + i * Math.PI / k, rr = i % 2 ? r : R; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    return plaque(s, d, Math.min(d * 0.35, R * 0.12));
  }
  // une matrice qui pose un objet en p, son +z le long de n (la normale de la surface), son +y vers le haut autant que possible ; tourné de rz autour de n
  function surSurface(p, n, s, rz) {
    const z = n.clone().normalize(), x = new T.Vector3().crossVectors(AXE_Y, z); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize(); const y = new T.Vector3().crossVectors(z, x);
    const m = new T.Matrix4().makeBasis(x, y, z); if (rz) m.multiply(new T.Matrix4().makeRotationZ(rz)); if (s) m.multiply(s.isVector3 ? new T.Matrix4().makeScale(s.x, s.y, s.z) : new T.Matrix4().makeScale(s, s, s));
    return m.setPosition(p);
  }
  // l'écriture brodée : une police de bâtonnets (chaque glyphe, des lignes brisées dans une case de 2 de large sur 4 de haut), posée sur une surface
  const POLICE = { 0: ['0,0 2,0 2,4 0,4 0,0'], 1: ['1,0 1,4 0.3,3.2'], 2: ['0,4 2,4 2,2 0,2 0,0 2,0'], 3: ['0,4 2,4 2,0 0,0', '0.6,2 2,2'], 4: ['0,4 0,2 2,2', '2,4 2,0'], 5: ['2,4 0,4 0,2 2,2 2,0 0,0'], 6: ['2,4 0,4 0,0 2,0 2,2 0,2'], 7: ['0,4 2,4 0.8,0'], 8: ['0,0 2,0 2,4 0,4 0,0', '0,2 2,2'], 9: ['2,2 0,2 0,4 2,4 2,0 0,0'],
    A: ['0,0 0,3 1,4 2,3 2,0', '0,1.8 2,1.8'], B: ['0,0 0,4 1.5,4 2,3.4 1.5,2 0,2', '1.5,2 2,1.4 2,0.6 1.5,0 0,0'], C: ['2,4 0,4 0,0 2,0'], D: ['0,0 0,4 1.2,4 2,3.1 2,0.9 1.2,0 0,0'], E: ['2,4 0,4 0,0 2,0', '0,2 1.5,2'], F: ['2,4 0,4 0,0', '0,2 1.5,2'], G: ['2,4 0,4 0,0 2,0 2,2 1,2'], H: ['0,0 0,4', '2,0 2,4', '0,2 2,2'], I: ['1,0 1,4', '0.3,4 1.7,4', '0.3,0 1.7,0'], J: ['2,4 2,0 0,0 0,1.2'],
    K: ['0,0 0,4', '2,4 0,1.8 2,0'], L: ['0,4 0,0 2,0'], M: ['0,0 0,4 1,2 2,4 2,0'], N: ['0,0 0,4 2,0 2,4'], O: ['0,0 2,0 2,4 0,4 0,0'], P: ['0,0 0,4 2,4 2,2 0,2'], Q: ['0,0 2,0 2,4 0,4 0,0', '1.1,1 2.1,-0.4'], R: ['0,0 0,4 2,4 2,2 0,2 2,0'], S: ['2,4 0,4 0,2 2,2 2,0 0,0'], T: ['0,4 2,4', '1,4 1,0'], U: ['0,4 0,0 2,0 2,4'], V: ['0,4 1,0 2,4'], W: ['0,4 0.45,0 1,2 1.55,0 2,4'], X: ['0,0 2,4', '0,4 2,0'], Y: ['0,4 1,2 2,4', '1,2 1,0'], Z: ['0,4 2,4 0,0 2,0'] };
  const LIGNES = Object.fromEntries(Object.entries(POLICE).map(([k, l]) => [k, l.map((s) => s.split(' ').map((p) => p.split(',').map(Number)))]));
  const largeurTexte = (txt, h) => txt.length * h * 0.5 + Math.max(0, txt.length - 1) * h * 0.28; // (une lettre : h/2 de large ; l'espace entre deux : 0,28 h)
  // les bâtonnets d'un texte : place(u, v) rend [point, normale] sur la surface (u, v depuis le coin bas gauche du texte, dans le monde) ; h : la
  // hauteur d'une lettre ; ep : l'épaisseur du trait ; prof : son relief
  function tracer(txt, h, ep, prof, place) {
    const out = [], u1 = h / 4; let x0 = 0;
    for (const ch of txt) {
      const l = LIGNES[ch];
      if (l) for (const ligne of l) for (let i = 0; i < ligne.length - 1; i++) {
        const [pa, na] = place(x0 + ligne[i][0] * u1, ligne[i][1] * u1), [pb, nb] = place(x0 + ligne[i + 1][0] * u1, ligne[i + 1][1] * u1);
        out.push(baton(pa, pb, ep, prof, na.clone().add(nb).normalize()));
      }
      x0 += h * 0.5 + h * 0.28;
    }
    return out;
  }
  // les initiales d'un nom de boutique (« Au Fournil du Village » → FV), sans les petits mots ni les accents ; trois au plus
  const PETITS = new Set(['AU', 'AUX', 'DU', 'DE', 'DES', 'LE', 'LA', 'LES', 'L', 'D', 'ET', 'EN', 'A', 'CHEZ', 'UN', 'UNE', 'SUR', 'SOUS', 'PAR', 'POUR', 'THE']);
  function initiales(nom) {
    const mots = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const forts = mots.filter((m) => !PETITS.has(m)), l = (forts.length ? forts : mots).map((m) => m[0]).filter((c) => LIGNES[c]);
    return l.slice(0, 3).join('') || 'B';
  }

  // les parts d'un kit, en tableaux : chaque part dans le monde au repos, ramenée dans l'espace de liaison, en facettes ; os et poids par sommet ;
  // un rôle global par sommet (l'emplacement du kit et le rôle local de la part). Les géométries des parts sont jetées. Un générateur : il rend
  // la main tous les 64 sommets et après chaque part (la cuisson d'avance s'étale ainsi sur plusieurs images, quelques millisecondes chacune)
  function* emettre(pr, parts, emp) {
    const P = [], N = [], C = [], R = [], MU = [], SI = [], SW = [], I = [], vus = new Map(), q = (x, k) => Math.round(x * k); let yMax = -Infinity;
    const iB = pr.iB, nm = new T.Matrix3().getNormalMatrix(iB), osDe = (nom) => (pr.osIdx.has(nom) ? pr.osIdx.get(nom) : 0);
    const role = (l) => (l == null ? RI.fixe : RI[emp + '.' + l] != null ? RI[emp + '.' + l] : RI[l] != null ? RI[l] : RI.fixe);
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); if (p.m) g.applyMatrix4(p.m); g.computeVertexNormals(); // (sans indices : la normale de chaque face, des facettes)
      const pos = g.attributes.position, nor = g.attributes.normal, vc = p.vc && g.attributes.color, role0 = role(p.role || 'tissu'), col0 = lin(p.col || BLANC);
      const fixe = p.poidsS ? null : typeof p.os === 'string' ? [[osDe(p.os), 1]] : null;
      let rf = role0; // (roleDe : un rôle par face, d'après son centre et sa normale)
      for (let j = 0; j < pos.count; j++) {
        if (p.roleDe && j % 3 === 0) rf = role(p.roleDe((pos.getX(j) + pos.getX(j + 1) + pos.getX(j + 2)) / 3, (pos.getY(j) + pos.getY(j + 1) + pos.getY(j + 2)) / 3, (pos.getZ(j) + pos.getZ(j + 1) + pos.getZ(j + 2)) / 3, nor.getX(j), nor.getY(j), nor.getZ(j)));
        const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j), rl = p.roles ? role(p.roles[j]) : p.roleDe ? rf : role0, mul = p.mul ? p.mul[j] : p.nuance || 1; if (y > yMax) yMax = y;
        const os = fixe || (p.poidsS ? p.poidsS[j] : p.os(x, y, z).map(([o, w]) => [typeof o === 'number' ? o : osDe(o), w]));
        const cr = vc ? vc.getX(j) : col0[0], cg = vc ? vc.getY(j) : col0[1], cb = vc ? vc.getZ(j) : col0[2];
        _v1.set(x, y, z).applyMatrix4(iB); _v2.set(nor.getX(j), nor.getY(j), nor.getZ(j)).applyMatrix3(nm).normalize();
        const cle = `${q(_v1.x, 1e4)},${q(_v1.y, 1e4)},${q(_v1.z, 1e4)},${q(_v2.x, 1e3)},${q(_v2.y, 1e3)},${q(_v2.z, 1e3)},${rl},${q(mul, 100)},${q(cr, 1e3)},${q(cg, 1e3)},${q(cb, 1e3)},${os.map((x) => x[0] + ':' + q(x[1], 100)).join('|')}`;
        let k = vus.get(cle);
        if (k === undefined) {
          k = R.length; vus.set(cle, k); P.push(_v1.x, _v1.y, _v1.z); N.push(_v2.x, _v2.y, _v2.z); C.push(cr, cg, cb); R.push(rl); MU.push(mul);
          const ww = os.filter((x) => x[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4), s = ww.reduce((a, x) => a + x[1], 0) || 1;
          for (let i = 0; i < 4; i++) { SI.push(ww[i] ? ww[i][0] : 0); SW.push(ww[i] ? ww[i][1] / s : 0); }
        }
        I.push(k);
        if ((j & 63) === 63 || ((j & 7) === 7 && souffle())) yield; // (les poids d'une part posée près du corps, sommet par sommet, coûtent : l'heure du pas aussi)
      }
      g.dispose(); if (!p.garder && !(p.geo.userData && p.geo.userData.cache)) p.geo.dispose();
      yield;
    }
    return { P: new Float32Array(P), N: new Float32Array(N), C: new Float32Array(C), R: new Uint8Array(R), MU: new Float32Array(MU), SI: new Uint16Array(SI), SW: new Float32Array(SW), I: new Uint32Array(I), n: R.length, tris: I.length / 3, yMax };
  }


  // ═══ les kits de la tête ═══
  // ─── la toque : le bandeau au ras des sourcils, le fût à douze plis qui s'évase, le bouffant qui déborde (ses plis rayonnent, un creux au
  //     sommet) ; hc : la hauteur du fût en unités des chibis (src/persos.js : 6 pour un apprenti ; pour le boulanger, de 2 à 32 selon son titre),
  //     ramenée à la tête de l'UACP (de 0,27 à 0,99 fois la demi-hauteur du crâne). Le haut du fût et le bouffant sont sur accToqueHaut (il monte
  //     aux grades 4 et 5), le bas sur accToque. Les variantes : le liseré doré (le titre, le grade 5) ; les toques du podium à l'étoile (l'or :
  //     la grande étoile entre deux petites, le double galon, l'anneau doré sous le bouffant ; l'argent : l'étoile et son galon ; le bronze :
  //     une étoile plus petite), le reflet du métal sur un pli ; celle du parcours, brodée des numéros de ses boutiques (11, 17, 23, 29) ; celle
  //     de la chaîne, au large galon tressé et à la petite clé d'or ───
  const hautFut = (pr, hc) => pr.m.tete.ry * (0.22 + hc * 0.024), hautFutPlus = (pr, dh) => pr.m.tete.ry * dh * 0.024;
  function mesToque(pr, hc) {
    const t = pr.m.tete, y = pr.m.yeux, yB = y.sourcils + (t.sommet - y.sourcils) * 0.2, hB = t.ry * 0.34, rB = rayonCrane(pr, yB, yB + hB) * 1.1 + t.rx * 0.03, hF = hautFut(pr, hc);
    return { yB, hB, rB, hF, rH: rB * 1.12, y0: yB + hB, y1: yB + hB + hF, yMil: yB + hB + hF * 0.5, cx: t.cx, cz: t.cz };
  }
  function kitToque(pr, o) {
    const T0 = mesToque(pr, o.hc), { yB, hB, rB, hF, rH, y0, y1, yMil, cx, cz } = T0, u = pr.m.u, N = 24, parts = [], v = o.v || 'base';
    const pli = (k) => (th, i) => (i % 2 ? 1 - k : 1), fut = (x, yy) => [[yy > yMil + 1e-5 ? 'accToqueHaut' : 'accToque', 1]];
    parts.push(pc(nappe([anneau(cx, yB, cz, rB, rB, 20), anneau(cx, yB + hB * 0.5, cz, rB * 1.012, rB * 1.012, 20), anneau(cx, y0, cz, rB, rB, 20)]), 'tissu', null, 'accToque'));
    const f0 = anneau(cx, y0 - hB * 0.1, cz, rB * 0.985, rB * 0.985, N, pli(0.08)), f1 = anneau(cx, yMil, cz, (rB + rH) * 0.5, (rB + rH) * 0.5, N, pli(0.085)), f2 = anneau(cx, y1, cz, rH, rH, N, pli(0.085));
    parts.push(pc(nappe([f0, f1, f2]), 'tissu', null, fut));
    const bf = o.bouffant || 1, b = (dy, k, p) => anneau(cx, y1 + rH * dy * bf, cz, rH * k, rH * k, N, pli(p == null ? 0.1 : p));
    parts.push(pc(nappe([f2.map((p) => p.clone()), b(0.07, 1.1), b(0.24, 1.15), b(0.42, 1.02), b(0.55, 0.74), b(0.61, 0.4, 0.04)], { haut: new T.Vector3(cx, y1 + rH * 0.59 * bf, cz) }), 'tissu', null, 'accToqueHaut'));
    const galon = (y0g, y1g, role, k) => pc(nappe([anneau(cx, y0g, cz, rB * (k || 1.022), rB * (k || 1.022), 20), anneau(cx, y1g, cz, rB * (k || 1.022), rB * (k || 1.022), 20)]), role, null, 'accToque');
    if (o.galon) parts.push(galon(yB + hB * 0.08, yB + hB * 0.34, 'galon'));
    const podium = v === 'or' || v === 'argent' || v === 'bronze';
    if (podium) {
      parts.push(galon(yB + hB * 0.08, yB + hB * 0.34, 'fonce'));
      if (v === 'or') parts.push(galon(yB + hB * 0.74, yB + hB * 0.92, 'fonce'), pc(nappe([anneau(cx, y1 - hF * 0.06, cz, rH * 1.0, rH * 1.0, N, pli(0.05)), anneau(cx, y1 + rH * 0.03, cz, rH * 1.07, rH * 1.07, N, pli(0.06))]), 'bijou', null, 'accToqueHaut'));
      const R = (v === 'or' ? 0.056 : v === 'argent' ? 0.05 : 0.043) * u, ye = yB + hB * 0.55 + (v === 'or' ? hB * 0.06 : 0);
      parts.push(pc(etoile(R, R * 0.43, 0.012 * u), 'fonce', { x: cx, y: ye, z: cz + rB * 1.022 + 0.004 * u, sy: 1.06 }, 'accToque'));
      if (v === 'or') for (const s of [-1, 1]) { const a = s * 0.46, r0 = rB * 1.022 + 0.003 * u; parts.push(pc(etoile(0.027 * u, 0.012 * u, 0.008 * u), 'fonce', new T.Matrix4().makeRotationY(a).setPosition(cx + Math.sin(a) * r0, ye - hB * 0.04, cz + Math.cos(a) * r0), 'accToque')); }
      // le reflet du métal : un pli clair sur la gauche (vue de face, la droite du personnage)
      const a0 = -0.86, a1 = -0.6, rf = (k) => anneau(cx, y0 - hB * 0.1 + hF * k, cz, (rB * 0.985 + (rH - rB * 0.985) * k) * 1.006, (rB * 0.985 + (rH - rB * 0.985) * k) * 1.006, 2, null, a0, a1);
      parts.push(pc(nappe([rf(0.08), rf(0.5), rf(0.92)], { ouvert: true }), 'reflet', null, fut));
    }
    if (v === 'parcours') { // le galon cuivré, les numéros brodés autour du fût (dans sa moitié basse : ils ne bougent pas quand il grandit)
      parts.push(galon(yB + hB * 0.08, yB + hB * 0.34, 'fonce'), galon(yB + hB * 0.7, yB + hB * 0.86, 'fonce'));
      const h = Math.min(0.064 * u, hF * 0.42), yb = y0 + Math.max(0.006 * u, hF * 0.07), rr = (yy) => { const k = (yy - (y0 - hB * 0.1)) / (hF + hB * 0.1); return (rB * 0.985 + (rH - rB * 0.985) * k) + 0.002 * u; };
      [['11', -0.84], ['17', -0.28], ['23', 0.28], ['29', 0.84]].forEach(([txt, ac]) => {
        const w = largeurTexte(txt, h), rm = rr(yb + h / 2);
        for (const g of tracer(txt, h, 0.0085 * u, 0.006 * u, (uu, vv) => { const a = ac + (uu - w / 2) / rm, yy = yb + vv, r = rr(yy); return [new T.Vector3(cx + Math.sin(a) * r, yy, cz + Math.cos(a) * r), new T.Vector3(Math.sin(a), 0, Math.cos(a))]; })) parts.push(pc(g, 'fonce', null, 'accToque'));
      });
    }
    if (v === 'chaine') { // le galon tressé (des chevrons or et bronze), un filet d'or dessus, la petite clé d'or sur le devant du fût
      const n = 28, ya = yB + hB * 0.08, yb = yB + hB * 0.8, ym = (ya + yb) / 2, r = rB * 1.024, P1 = [], P2 = [];
      const pt = (aa, yy) => [cx + Math.sin(aa) * r, yy, cz + Math.cos(aa) * r];
      for (const [y0r, y1r, inv] of [[ya, ym, 1], [ym, yb, 0]]) for (let i = 0; i < n; i++) { // deux rangs de dents de scie, l'or en haut de chaque case, le bronze en bas, un rang sur deux à l'envers : une tresse
        const a = i / n * TAU, a2 = (i + 1) / n * TAU, A = pt(a, y0r), B = pt(a2, y0r), C = pt(a2, y1r), D = pt(a, y1r), haut = (i + inv) % 2 === 0;
        if (haut) { P2.push(...A, ...B, ...C); P1.push(...A, ...C, ...D); } else { P1.push(...B, ...C, ...D); P2.push(...A, ...B, ...D); }
      }
      const geo = (P) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); return g; };
      parts.push(pc(geo(P1), 'bijou', null, 'accToque'), pc(geo(P2), 'fonce', null, 'accToque'), galon(yB + hB * 0.86, yB + hB * 0.93, 'bijou', 1.026));
      const kc = new T.Vector3(cx, y0 + Math.max(0.045 * u, hF * 0.36), 0), rk = rB * 0.985 + (rH - rB * 0.985) * ((kc.y - (y0 - hB * 0.1)) / (hF + hB * 0.1)) + 0.004 * u; kc.z = cz + rk;
      for (const p of cleDoree(0.075 * u)) parts.push(Object.assign(p, { m: new T.Matrix4().setPosition(kc).multiply(p.m || new T.Matrix4()), os: 'accToque', role: p.role || 'bijou' }));
    }
    return { parts, info: { bord: yB, rayon: rB * 0.96, toque: T0 } };
  }
  // une petite clé plate (l'anneau, la tige, le panneton à deux dents), de hauteur h, dressée dans le plan xy, l'anneau en haut, face à +z
  function cleDoree(h) {
    const e = h * 0.12;
    return [pc(new T.TorusGeometry(h * 0.2, e * 0.55, 4, 10), 'bijou', { y: h * 0.32 }), pc(new T.BoxGeometry(e * 0.9, h * 0.62, e * 0.9), 'bijou', { y: -h * 0.18 }), pc(new T.BoxGeometry(h * 0.18, e * 0.9, e * 0.9), 'bijou', { x: h * 0.09, y: -h * 0.42 }), pc(new T.BoxGeometry(h * 0.13, e * 0.9, e * 0.9), 'bijou', { x: h * 0.065, y: -h * 0.3 })];
  }

  // ─── la casquette (le quartier) : six pans (une couture entre deux), le bandeau, la visière tournée vers l'arrière (« comme il faut ») et son
  //     dessous de couleur, le bouton du sommet ; devant, au-dessus du front, l'ouverture de la patte de réglage ; derrière, l'étoile du quartier.
  //     La néon : rose, ses coutures, son bouton et le bord de sa visière en cyan, qui brillent (et clignotent un peu). La dorée (le podium
  //     final) : noire, l'or en grand, qui se voit de la salle d'en haut : le bandeau, les coutures épaisses, le dessus de la visière ───
  function kitCasquette(pr, o) {
    const t = pr.m.tete, y = pr.m.yeux, u = pr.m.u, v = o.v || 'quartier', yB = y.sourcils + (t.sommet - y.sourcils) * 0.3, R = Math.max(rayonCrane(pr, yB, t.sommet + 0.1), t.rx) * 1.12, hD = (t.sommet - yB) * 1.3 + R * 0.08, kz = t.rz / t.rx, cx = t.cx, cz = t.cz, parts = [], os = OS.tete;
    const neon = v === 'neon', or = v === 'quartier-or', couture = neon ? 'lueur' : or ? 'fonce' : 'bord', NP = 6, NS = 3, NR = 6;
    const pt = (a, k) => { const ph = k / NR * HP * 0.98, r = R * Math.cos(ph) * (1 + 0.04 * Math.max(0, Math.cos(a)) * Math.sin(ph * 2)); return new T.Vector3(cx + Math.sin(a) * r, yB + hD * Math.sin(ph), cz + Math.cos(a) * r * kz); };
    for (let p = 0; p < NP; p++) { // les pans, un sur deux un peu plus sombre
      const a0 = (p - 0.5) / NP * TAU, anneaux = []; for (let k = 0; k <= NR; k++) { const l = []; for (let i = 0; i <= NS; i++) l.push(pt(a0 + i / NS * TAU / NP, k)); anneaux.push(l); }
      parts.push(pc(nappe(anneaux, { ouvert: true, haut: new T.Vector3(cx, yB + hD, cz) }), 'tissu', null, os, { nuance: p % 2 ? 0.9 : 1 }));
      const l = []; for (let k = 0; k <= NR; k++) { const q = pt(a0, k); q.x = cx + (q.x - cx) * 1.012; q.z = cz + (q.z - cz) * 1.012; q.y += 0.003 * u; l.push(q); }
      parts.push(pc(tube(l, (or ? 0.0062 : 0.0042) * u, 4, 12), couture, null, os));
    }
    parts.push(pc(nappe([anneau(cx, yB - 0.004 * u, cz, R * 1.016, R * kz * 1.016, 24), anneau(cx, yB + hD * 0.17, cz, R * 1.012, R * kz * 1.012, 24)]), neon ? 'lueur' : or ? 'fonce' : 'tissu', null, os, { nuance: or ? 1 : 0.94 }));
    // la visière, derrière : un arc aplati qui descend un peu vers sa pointe ; dessus le tissu, dessous la couleur, le bord
    const NV = 12, va = Math.PI - 1.0, vb = Math.PI + 1.0, rIn = R * 0.96, rOut = R * 1.6, ep = 0.011 * u;
    const visiere = (k, dy) => { const l = []; for (let i = 0; i <= NV; i++) { const tt = i / NV, a = va + (vb - va) * tt, sv = Math.pow(Math.sin(tt * Math.PI), 0.7), r = rIn + (rOut - rIn) * sv * k; l.push(new T.Vector3(cx + Math.sin(a) * r, yB - 0.004 * u - k * k * 0.05 * u * sv + dy, cz + Math.cos(a) * r * kz)); } return l; };
    const dessusV = [0, 0.5, 1].map((k) => visiere(k, ep)), dessousV = [0, 0.5, 1].map((k) => visiere(k, 0));
    parts.push(pc(nappe(dessusV, { ouvert: true, dedans: true }), or ? 'fonce' : 'tissu', null, os), pc(nappe(dessousV, { ouvert: true }), or ? 'tissu' : 'fonce', null, os, { nuance: or ? 0.8 : 1 }));
    parts.push(pc(nappe([dessousV[2], dessusV[2]], { ouvert: true }), neon ? 'lueur' : 'fonce', null, os));
    // le bouton du sommet
    parts.push(pc(new T.SphereGeometry(R * 0.11, 8, 4, 0, TAU, 0, HP), neon ? 'lueur' : 'fonce', { x: cx, y: yB + hD - 0.006 * u, z: cz, sy: 0.7 }, os));
    // devant : l'ouverture de la patte de réglage (un demi-disque sombre au-dessus du front) et la patte
    const fz = cz + R * kz * 1.02, d0 = new T.Shape(); d0.absarc(0, 0, R * 0.2, 0, Math.PI, false); d0.lineTo(R * 0.2, 0);
    parts.push(pc(plaque(d0, 0.004 * u), 'bord', { x: cx, y: yB + R * 0.08, z: fz, rx: -0.12 }, os), pc(new T.BoxGeometry(R * 0.44, R * 0.05, 0.006 * u), neon ? 'lueur' : 'fonce', { x: cx, y: yB + R * 0.03, z: fz + 0.002 * u, rx: -0.1 }, os));
    // derrière, au-dessus de la visière : l'étoile du quartier
    parts.push(pc(etoile(0.045 * u, 0.02 * u, 0.008 * u), neon ? 'lueur' : v === 'quartier-or' ? 'bijou' : 'fonce', new T.Matrix4().makeRotationY(Math.PI).multiply(new T.Matrix4().makeRotationX(-0.42)).setPosition(cx, yB + hD * 0.45, cz - R * kz * 0.93), os));
    return { parts, info: { bord: yB, rayon: R * 0.97 } };
  }

  // ─── le chapeau pointu (la Maison hantée) : le bord qui ondule, retombe un peu sur les côtés et derrière et se relève devant (d'en haut, la
  //     caméra de la boutique voit les yeux sous le bord), le cône qui se plie vers l'arrière au bout, le ruban et sa boucle, les étoiles
  //     (« pointu, étoilé ») ; le doré : le cône et le bord dorés, le ruban noir ; le phosphorescent : violet nuit, le ruban, les étoiles et le
  //     liseré du bord en vert qui brille dans le noir ───
  function kitChapeau(pr, o) {
    const t = pr.m.tete, y = pr.m.yeux, u = pr.m.u, v = o.v || 'hantee', yB = y.sourcils + (t.sommet - y.sourcils) * 0.36, rT = rayonCrane(pr, yB, yB + t.ry * 0.3) * 1.1 + t.rx * 0.02, cx = t.cx, cz = t.cz - t.rz * 0.02, parts = [], os = OS.tete, N = 28;
    const lueur = v === 'lueur', rBord = rT * 1.3, chute = 0.05 * u, releve = 0.14 * u, ep = 0.012 * u;
    // le bord : dessus, dessous, la tranche ; il ondule (5 creux), retombe vers l'extérieur et se relève devant (θ = 0)
    const yb = (r, th) => { const k = Math.max(0, (r - rT) / (rBord - rT)), c = Math.max(0, Math.cos(th)); return yB + 0.004 * u - k * k * chute + k * k * releve * c * c + Math.sin(th * 5 + 0.7) * 0.012 * u * Math.pow(k, 1.5); };
    const bordA = (k, dy) => { const r = rT * 0.97 + (rBord - rT * 0.97) * k; return anneau(cx, (th) => yb(r, th) + dy, cz, r, r, N); };
    const ks = [0, 0.35, 0.7, 1], dessus = ks.map((k) => bordA(k, ep * 0.5)), dessous = ks.map((k) => bordA(k, -ep * 0.5));
    parts.push(pc(nappe(dessus, { dedans: true }), 'tissu', null, os), pc(nappe(dessous), 'tissu', null, os, { nuance: 0.82 }), pc(nappe([dessous[3], dessus[3]]), lueur ? 'lueur' : 'tissu', null, os));
    // le cône : des anneaux le long d'un axe qui part droit puis se plie en arrière ; son bout se couche
    const hc = 0.74 * u, K = 9, centres = [], rayons = [];
    for (let k = 0; k <= K; k++) { const s = k / K, plie = Math.max(0, s - 0.55) / 0.45; centres.push(new T.Vector3(cx + 0.02 * u * s * s, yB + 0.01 * u + hc * s - hc * 0.16 * plie * plie, cz - hc * (0.06 * s + 0.42 * plie * plie))); rayons.push(Math.max(0.006 * u, rT * Math.pow(1 - s, 1.15) * (1 + 0.06 * Math.sin(s * Math.PI)))); }
    parts.push(pc(fourreau(centres, rayons, 16, { bout: true }), 'tissu', null, os));
    // le ruban et la boucle
    const yR0 = yB + 0.008 * u, yR1 = yB + 0.075 * u, rR = (yy) => rT * Math.pow(1 - (yy - yB - 0.01 * u) / hc, 1.15) * 1.03 + 0.003 * u;
    parts.push(pc(nappe([anneau(cx, yR0, cz - 0.001 * u, rR(yR0), rR(yR0), 24), anneau(cx, yR1, cz - 0.01 * u, rR(yR1), rR(yR1), 24)]), lueur ? 'lueur' : 'fonce', null, os));
    const bz = cz + rR((yR0 + yR1) / 2) + 0.004 * u, by = (yR0 + yR1) / 2, bw = 0.07 * u, bh = 0.062 * u, be = 0.012 * u, bp = 0.008 * u;
    parts.push(pc(new T.BoxGeometry(bw, be, bp), 'bijou', { x: cx, y: by + bh / 2 - be / 2, z: bz, rx: -0.09 }, os), pc(new T.BoxGeometry(bw, be, bp), 'bijou', { x: cx, y: by - bh / 2 + be / 2, z: bz + 0.004 * u, rx: -0.09 }, os), pc(new T.BoxGeometry(be, bh, bp), 'bijou', { x: cx - bw / 2 + be / 2, y: by, z: bz + 0.002 * u, rx: -0.09 }, os), pc(new T.BoxGeometry(be, bh, bp), 'bijou', { x: cx + bw / 2 - be / 2, y: by, z: bz + 0.002 * u, rx: -0.09 }, os));
    // les étoiles, sur le cône (posées sur sa surface, face à sa normale)
    const surCone = (s, a) => { const k = s * K, k0 = Math.min(K - 1, Math.floor(k)), f = k - k0, c = centres[k0].clone().lerp(centres[k0 + 1], f), r = rayons[k0] + (rayons[k0 + 1] - rayons[k0]) * f, n = new T.Vector3(Math.sin(a), 0.32, Math.cos(a)).normalize(); return [c.addScaledVector(new T.Vector3(Math.sin(a), 0, Math.cos(a)), r + 0.002 * u), n]; };
    [[0.22, 0.32, 0.048], [0.4, -0.5, 0.038], [0.55, 0.18, 0.03], [0.3, 1.25, 0.034], [0.3, -1.3, 0.034], [0.18, -0.95, 0.03]].forEach(([s, a, R]) => { const [p, n] = surCone(s, a); parts.push(pc(etoile(R * u, R * u * 0.42, 0.007 * u), lueur ? 'lueur' : 'etoile', surSurface(p, n, null, a * 0.4), os)); });
    return { parts, info: { bord: yB, rayon: rT * 0.96 } };
  }
  // un fourreau : un tube de rayon variable (r[k], ou [r le long de la normale, r le long de la binormale]) le long de centres c[k], ses repères
  // transportés d'un anneau à l'autre (n0 : la normale de départ) ; o.bout, o.debut : fermé au dernier, au premier point ; o.n : points par anneau
  function fourreau(c, r, n, o) {
    o = o || {}; const K = c.length, tg = [];
    for (let k = 0; k < K; k++) tg.push(new T.Vector3().subVectors(c[Math.min(K - 1, k + 1)], c[Math.max(0, k - 1)]).normalize());
    const nr = (o.n0 || (Math.abs(tg[0].y) > 0.9 ? new T.Vector3(0, 0, 1) : new T.Vector3(0, 1, 0))).clone(); nr.addScaledVector(tg[0], -tg[0].dot(nr)).normalize();
    const anneaux = [];
    for (let k = 0; k < K; k++) {
      if (k) { nr.addScaledVector(tg[k], -tg[k].dot(nr)); if (nr.lengthSq() < 1e-8) nr.set(1, 0, 0); nr.normalize(); }
      const bi = new T.Vector3().crossVectors(tg[k], nr), rr = r[k], ra = Array.isArray(rr) ? rr[0] : rr, rb = Array.isArray(rr) ? rr[1] : rr, A = [];
      for (let i = 0; i < n; i++) { const a = i / n * TAU + (o.phase || 0); A.push(c[k].clone().addScaledVector(nr, Math.cos(a) * ra).addScaledVector(bi, Math.sin(a) * rb)); }
      anneaux.push(A);
    }
    return nappe(anneaux, { bas: o.debut ? c[0] : null, haut: o.bout ? c[K - 1] : null });
  }


  // ═══ les kits du haut ═══
  // une surface drapée sur la façade (sens 1 : devant ; -1 : le dos), en rangées de yH (en haut) à yB (en bas), de demi-largeur largeur(y) autour
  // de o.cx, décalée de e vers l'extérieur ; role(u, v) par quad (u de -1 à 1, v de 0 en haut à 1 en bas) ; chaque sommet avec les poids d'os de
  // la façade sous lui
  // (drape() d'un trait ; drapeGen() rend la main toutes les trois rangées : les grands pans des kits à petits pas)
  function drape(pr, o) { const g = drapeGen(pr, o); let x; do x = g.next(); while (!x.done); return x.value; }
  function* drapeGen(pr, o) {
    const sens = o.sens || 1, f = facade(pr, sens), cx0 = o.cx != null ? o.cx : pr.m.tete.cx, centre = o.centre || (() => cx0), nc = o.colonnes, rangees = [];
    for (let y = o.yH; y > o.yB - 1e-6; y -= o.pas) rangees.push(y); if (rangees[rangees.length - 1] > o.yB + 1e-4) rangees.push(o.yB);
    const nr = rangees.length, V = [], PW = [];
    for (let j = 0; j < nr; j++) { for (let i = 0; i <= nc; i++) { const y = rangees[j], x = centre(y) + (i / nc * 2 - 1) * o.largeur(y), z = f.zA(x, y) + sens * o.e; V.push([x, y, z]); PW.push(f.poidsA(x, y)); } if (j % 3 === 2 || souffle()) yield; }
    yield;
    const P = [], roles = [], poidsS = [];
    for (let j = 0; j < nr - 1; j++) {
      for (let i = 0; i < nc; i++) {
        const k = (jj, ii) => jj * (nc + 1) + ii, quad = sens > 0 ? [k(j, i), k(j + 1, i), k(j, i + 1), k(j, i + 1), k(j + 1, i), k(j + 1, i + 1)] : [k(j, i), k(j, i + 1), k(j + 1, i), k(j, i + 1), k(j + 1, i + 1), k(j + 1, i)];
        const role = o.role ? o.role((i + 0.5) / nc * 2 - 1, (j + 0.5) / (nr - 1)) : 'tissu';
        for (const q of quad) { P.push(...V[q]); roles.push(role); poidsS.push(PW[q]); }
      }
      if ((j & 3) === 3 && souffle()) yield;
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    return { geo, m: null, roles, poidsS };
  }
  // un point sur la façade (devant), décalé de e : [point, normale] ; et ses poids d'os
  const surFacade = (pr, x, y, e) => { const f = facade(pr, 1); return [new T.Vector3(x, y, f.zA(x, y) + e), f.normale(x, y)]; };
  const poidsFacade = (pr) => { const f = facade(pr, 1); return (x, y) => f.poidsA(x, y); };

  // ─── le tablier : une surface qui épouse le devant du corps, aux bords nets (la bavette étroite, la taille, la jupe qui couvre les deux cuisses
  //     jusqu'aux genoux), un peu en avant de la veste ; l'ourlet (galon : le liseré doré du titre, le bord du métal), le biais du haut de la
  //     bavette (un apprenti au grade 2) ; la bride du cou, les cordons noués en boucle dans le dos. Le blanc : sa poche. Les tablettes du
  //     podium, « brodé au nom de la boutique » : un cartouche au bas de la bavette, ses initiales brodées dedans (l'or : le liseré doré de la
  //     bavette, deux épis de blé brodés, un double ourlet ; l'argent : le liseré ; le bronze : le cartouche seul). Celui du parcours : « une
  //     poche par quartier », quatre poches cuivrées ───
  function* kitTablier(pr, o) { // (un générateur : rend la main entre ses parties, la cuisson s'étale sur plusieurs images)
    const m = pr.m, u = m.u, v = o.v || 'base', f = facade(pr, 1), cx = m.tete.cx, parts = [], podium = v === 'or' || v === 'argent' || v === 'bronze';
    const yH = m.foulard.min.y - (m.foulard.max.y - m.foulard.min.y) * 0.25, yT = m.pantalon.max.y + 0.01 * u, yK = m.chevilleY + (m.pantalon.max.y - m.chevilleY) * 0.34;
    const b = m.buste, larg = Math.max(Math.abs(b.min.x - cx), Math.abs(b.max.x - cx)), lH = larg * 0.42, lT = larg * 0.66, lJ = larg * 1.08, lK = larg * 1.12, d35 = 0.035 * u;
    const largeur = (y) => (y >= yT + d35 ? lH + (lT - lH) * (yH - y) / (yH - yT - d35) : y >= yT ? lT + (lJ - lT) * (yT + d35 - y) / d35 : lJ + (lK - lJ) * (yT - y) / (yT - yK));
    const ourlet = 0.034 * u, hautB = 0.026 * u, e = 0.012 * u, wF = poidsFacade(pr);
    yield;
    parts.push(yield* drapeGen(pr, { yH, yB: yK, pas: 0.03 * u, colonnes: 12, e, largeur, role: (uu, vv) => { const y = yH + (yK - yH) * vv; return y < yK + ourlet ? 'galon' : y > yH - hautB && o.biais ? 'bord' : (v === 'or' || v === 'argent') && uu > 0.4 && uu < 0.7 && y < yT - 0.02 * u ? 'reflet' : 'tissu'; } }));
    if (v === 'or') parts.push(yield* drapeGen(pr, { yH: yK + ourlet + 0.016 * u, yB: yK + ourlet + 0.008 * u, pas: 0.01 * u, colonnes: 12, e: e + 0.002 * u, largeur: (y) => largeur(y) * 0.995, role: () => 'bijou' }));
    yield;
    // la bride du cou : des coins de la bavette au col (elle passe dessous)
    const wH = poidsCorps(pr, /^(Torso|Neck|Shoulder|Abdomen)/);
    for (const s of [1, -1]) {
      const x0 = cx + s * lH * 0.92, x1 = cx + s * 0.104 * u, y1 = yH + 0.034 * u;
      parts.push(pc(tube([new T.Vector3(x0, yH - 0.01 * u, f.zA(x0, yH - 0.01 * u) + e), new T.Vector3(x0 + s * 0.004 * u, yH + 0.012 * u, f.zA(x0, yH + 0.012 * u) + e * 0.8), new T.Vector3(x1, y1, f.zA(x1, y1) + 0.003 * u), new T.Vector3(cx + s * 0.13 * u, m.foulard.max.y - 0.045 * u, m.busteZ + 0.015 * u)], 0.0058 * u, 4, 9), 'tissu', null, wH));
    }
    yield;
    // les cordons, de la taille au dos, et leur boucle
    const C = contour(pr, /^(Torso|Abdomen|Hips|Body)/, 'taille'), yL = yT + 0.014 * u, wB = poidsCorps(pr, /^(Torso|Abdomen|Hips|Body)/), cz = C.cz, rL = (th) => C.r(th, yL) + e * 1.15 + 0.004 * u;
    const a0 = Math.atan2(lT * 0.96, f.zA(cx + lT, yL) - cz);
    for (const s of [1, -1]) { const pts = []; for (let k = 0; k <= 8; k++) { const th = s * (a0 + (Math.PI - 0.16 - a0) * k / 8); pts.push(new T.Vector3(cx + Math.sin(th) * rL(th), yL, cz + Math.cos(th) * rL(th))); } parts.push(pc(fourreau(pts, pts.map(() => [0.011 * u, 0.0036 * u]), 6, { n0: new T.Vector3(0, 1, 0), debut: true, bout: true }), 'tissu', null, wB)); }
    const zb = cz - rL(Math.PI) - 0.006 * u, B = new T.Vector3(cx, yL, zb);
    for (const s of [1, -1]) {
      parts.push(pc(new T.TorusGeometry(0.026 * u, 0.0075 * u, 4, 10), 'tissu', new T.Matrix4().makeTranslation(cx + s * 0.03 * u, yL + 0.006 * u, zb - 0.004 * u).multiply(new T.Matrix4().makeRotationZ(-s * 0.3)).multiply(new T.Matrix4().makeScale(1, 0.55, 1)), wB));
      parts.push(pc(new T.BoxGeometry(0.016 * u, 0.075 * u, 0.005 * u), 'tissu', new T.Matrix4().makeTranslation(cx + s * 0.016 * u, yL - 0.042 * u, zb - 0.002 * u).multiply(new T.Matrix4().makeRotationZ(s * 0.22)), wB));
    }
    parts.push(pc(new T.SphereGeometry(0.013 * u, 8, 5), 'tissu', { x: cx, y: yL, z: zb - 0.006 * u, sz: 0.7 }, wB));
    yield;
    // une pièce rapportée, drapée : de (xc, yc), largeur w, hauteur h, au-dessus du tablier
    const piece = (xc, yc, w, h, role, de, cols) => drapeGen(pr, { yH: yc + h / 2, yB: yc - h / 2, pas: h / 2, colonnes: cols || 4, e: e + de, cx: xc, largeur: () => w / 2, role: () => role }); // (un générateur : yield*)
    if (v === 'base' || v === 'apprenti') { const yc = yT - 0.16 * u; parts.push(yield* piece(cx, yc, 0.13 * u, 0.1 * u, 'poche', 0.003 * u), yield* piece(cx, yc + 0.05 * u - 0.007 * u, 0.13 * u, 0.014 * u, 'bord', 0.005 * u)); }
    if (v === 'parcours') { // une poche par quartier : quatre, leur rabat cuivré, deux rivets
      const yc = yT - 0.15 * u;
      for (const k of [-1.5, -0.5, 0.5, 1.5]) { const xc = cx + k * 0.104 * u; parts.push(yield* piece(xc, yc, 0.086 * u, 0.085 * u, 'poche', 0.003 * u), yield* piece(xc, yc + 0.0425 * u - 0.008 * u, 0.086 * u, 0.016 * u, 'fonce', 0.005 * u)); for (const s of [-1, 1]) { const [p] = surFacade(pr, xc + s * 0.034 * u, yc + 0.034 * u, e + 0.008 * u); parts.push(pc(new T.SphereGeometry(0.0055 * u, 6, 4), 'bijou', { x: p.x, y: p.y, z: p.z, sz: 0.6 }, wF)); } yield; }
    }
    if (podium) { // le cartouche brodé : son cadre, son fond, les initiales de la boutique
      const yc = yT + 0.105 * u, a = 0.064 * u, bb = 0.046 * u, ell = (k) => (y) => a * k * Math.sqrt(Math.max(0.04, 1 - Math.pow((y - yc) / (bb * k), 2)));
      parts.push(yield* drapeGen(pr, { yH: yc + bb, yB: yc - bb, pas: bb / 3, colonnes: 12, e: e + 0.003 * u, largeur: ell(1), role: () => 'fonce' }), yield* drapeGen(pr, { yH: yc + bb * 0.8, yB: yc - bb * 0.8, pas: bb * 0.8 / 3, colonnes: 12, e: e + 0.0045 * u, largeur: ell(0.8), role: () => 'clair' }));
      yield;
      const txt = o.mono || 'B', h = 0.036 * u, w = largeurTexte(txt, h);
      for (const g of tracer(txt, h, 0.0064 * u, 0.0035 * u, (uu, vv) => surFacade(pr, cx - w / 2 + uu, yc - h / 2 + vv, e + 0.0052 * u))) parts.push(pc(g, 'broderie', null, (x, y) => wF(x, y)));
      yield;
      if (v === 'or' || v === 'argent') for (const s of [1, -1]) { const pts = []; for (let k = 0; k <= 6; k++) { const y = yH - 0.008 * u - (yH - yT - 0.01 * u) * k / 6, x = cx + s * (largeur(y) - 0.006 * u); pts.push(new T.Vector3(x, y, f.zA(x, y) + e + 0.002 * u)); } parts.push(pc(tube(pts, 0.0045 * u, 4, 12), v === 'or' ? 'bijou' : 'fonce', null, (x, y) => wF(x, y))); }
      if (v === 'or') for (const s of [1, -1]) { // deux épis de blé, de part et d'autre du cartouche
        const x0 = cx + s * (a + 0.016 * u), [p0] = surFacade(pr, x0, yc - bb * 0.9, e + 0.004 * u), [p1, n1] = surFacade(pr, x0 + s * 0.006 * u, yc + bb * 1.05, e + 0.004 * u);
        parts.push(pc(baton(p0, p1, 0.0035 * u, 0.003 * u, n1), 'bijou', null, (x, y) => wF(x, y)));
        for (let k = 0; k < 4; k++) for (const c of [-1, 1]) { const t = 0.35 + k * 0.17, [p, n] = surFacade(pr, x0 + s * 0.006 * u * t + c * 0.007 * u, yc - bb * 0.9 + (bb * 1.95) * t, e + 0.0045 * u); parts.push(pc(new T.SphereGeometry(0.0062 * u, 6, 4), 'bijou', surSurface(p, n, new T.Vector3(0.55, 1, 0.5), -c * 0.5), (x, y) => wF(x, y))); }
        yield;
      }
    }
    return { parts };
  }

  // ─── le sweat à capuche (le quartier) : la veste reteinte (ses boutons rentrés) ; la capuche rabattue : son bord, un boudin en fer à cheval
  //     posé sur les épaules derrière la nuque, qui s'affine devant et descend en V sur la poitrine (ses deux pans à plat, qui se rejoignent sous
  //     le col), et sa poche qui pend dans le dos (sa couture au milieu, son ouverture plus claire) ; les cordons qui sortent du V, leurs embouts
  //     de métal ; la poche kangourou (le même tissu, ses rebords, ses deux entrées) ; l'étoile du quartier sur la poitrine ; les côtes des
  //     poignets et de l'ourlet. En or : « noir et or, rien d'autre », l'or en grand pour qu'on le voie de la salle, d'en haut : le bord de la
  //     capuche, les côtes des poignets et de l'ourlet, les rebords de la poche, des cordons plus épais ───
  function* kitSweat(pr, o) { // (un générateur, comme le tablier)
    const m = pr.m, u = m.u, v = o.v || 'quartier', or = v === 'quartier-or', f = facade(pr, 1), fd = facade(pr, -1), cx = m.tete.cx, parts = [], wC = poidsCorps(pr, /^(Torso|Neck|Shoulder|Abdomen)/), wF = poidsFacade(pr);
    const C = contour(pr, /^(Torso|Neck|Shoulder|Abdomen)/, 'haut'), cz = C.cz, yN = m.foulard.max.y - 0.02 * u, K = 22, PH = 2.3, pts = [], rr = [];
    const To = toit(pr), r0s = [];
    for (let k = 0; k <= K; k++) { const ph = -PH + 2 * PH * k / K, th = Math.PI + ph; r0s.push(Math.max(C.r(th, yN - 0.01 * u), 0.15 * u)); }
    for (let k = 0; k <= K; k++) { // le bord : de l'épaule gauche, par la nuque, à l'épaule droite (posé dessus) ; il s'affine et descend vers le devant
      const ph = -PH + 2 * PH * k / K, th = Math.PI + ph, c2 = Math.pow(Math.cos(ph / 2), 2), bt = Math.max(0, (Math.abs(ph) - 1.85) / (PH - 1.85));
      const ra = (0.024 + 0.012 * c2) * u * (1 - 0.5 * bt), rb = (0.024 + 0.008 * c2) * u * (1 - 0.55 * bt), r0 = (r0s[Math.max(0, k - 1)] + 2 * r0s[k] + r0s[Math.min(K, k + 1)]) / 4 + rb + 0.008 * u;
      let yc = yN - 0.022 * u * (1 - c2) + 0.004 * u * c2 - 0.034 * u * bt * bt; for (const dr of [-0.8, 0, 0.8]) { const r = r0 + dr * rb; yc = Math.max(yc, To(cx + Math.sin(th) * r, cz + Math.cos(th) * r) + ra * 0.9); }
      pts.push(new T.Vector3(cx + Math.sin(th) * r0, yc, cz + Math.cos(th) * r0)); rr.push([ra, rb]);
    }
    parts.push(pc(fourreau(pts, rr, 8, { n0: new T.Vector3(0, 1, 0), debut: true, bout: true }), or ? 'fonce' : 'tissu', null, wC));
    yield;
    // ses deux pans, devant : à plat sur la poitrine, du bout du boudin jusqu'au V sous le col (le gauche passe sur le droit)
    const xV0 = 0.12 * u, yV0 = yN - 0.05 * u, yV1 = m.foulard.min.y - 0.085 * u, eV = 0.0032 * u, ancres = []; // (à plat : une chaîne de cou passe dessus)
    for (const s of [1, -1]) {
      const l = [], r2 = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, x = cx + s * (xV0 * (1 - t) + 0.006 * u * t) * (1 - 0.06 * Math.sin(t * Math.PI)), y = yV0 + (yV1 - yV0) * Math.pow(t, 0.9), e = 0.0024 * u + eV + (s > 0 ? 0.0034 * u * t : 0); l.push(new T.Vector3(x, y, f.zA(x, y) + e)); r2.push([eV, 0.013 * u * (1 - 0.35 * t)]); }
      parts.push(pc(fourreau(l, r2, 6, { n0: new T.Vector3(0, 0, 1), debut: true, bout: true }), 'doublure', null, OS.torse)); // (sur le torse, comme la chaîne qui passe dessus)
      ancres.push(l[4]);
    }
    yield;
    // la poche de la capuche, dans le dos : une coque aplatie du bord jusqu'au milieu du dos, sa couture, son ouverture
    const yH = yN - 0.01 * u, yB = m.buste.max.y - 0.25 * u, hp = yH - yB, lp = 0.13 * u, NP = 7, MP = 10, coque = [];
    for (let j = 0; j <= NP; j++) { const t = j / NP, y = yH - hp * t, l = lp * Math.sin(Math.min(1, 0.25 + t) * Math.PI * 0.82) * (t > 0.85 ? 1 - (t - 0.85) * 3.2 : 1), bomb = 0.05 * u * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.012 * u, row = []; for (let i = 0; i <= MP; i++) { const x = cx + l * (2 * i / MP - 1), b = bomb * Math.sqrt(Math.max(0, 1 - Math.pow(2 * i / MP - 1, 2))); row.push(new T.Vector3(x, y, fd.zA(x, y) - 0.008 * u - b)); } coque.push(row); }
    parts.push(pc(nappe(coque.slice().reverse().map((r) => r.slice().reverse()), { ouvert: true }), 'tissu', null, wC));
    const couture = coque.map((r) => r[MP / 2].clone().add(new T.Vector3(0, 0, -0.003 * u)));
    parts.push(pc(tube(couture.slice(1, NP), 0.0035 * u, 4, 12), 'bord', null, wC));
    const ov = new T.Shape(); ov.absellipse(0, 0, 0.085 * u, 0.026 * u, 0, TAU, false, 0);
    parts.push(pc(plaque(ov, 0.004 * u), 'doublure', surSurface(new T.Vector3(cx, yH - 0.006 * u, fd.zA(cx, yH) - 0.03 * u), new T.Vector3(0, 0.75, -0.66).normalize()), wC));
    yield;
    // les cordons : ils sortent des pans du V et pendent, leurs embouts
    for (const [i, s] of [[0, 1], [1, -1]]) {
      const a0 = ancres[i], l = [], rc = (or ? 0.0072 : 0.0048) * u, ec = (or ? 0.0086 : 0.0062) * u; for (let k = 0; k <= 4; k++) { const y = a0.y - 0.004 * u - k * 0.03 * u, x = a0.x + s * k * 0.004 * u; l.push(new T.Vector3(x, y, f.zA(x, y) + (k ? ec : a0.z - f.zA(a0.x, a0.y) + eV + 0.006 * u))); }
      parts.push(pc(tube(l, rc, 4, 10), 'fonce', null, OS.torse));
      const [pe, ne] = surFacade(pr, l[4].x, l[4].y - 0.012 * u, (or ? 0.0115 : 0.009) * u), re = (or ? 0.011 : 0.0085) * u; parts.push(pc(new T.CylinderGeometry(re, re, 0.024 * u, 6), 'bijou', surSurface(pe, ne).multiply(new T.Matrix4().makeRotationX(HP)), OS.torse));
    }
    // la poche kangourou : le même tissu, un peu plus clair ; ses rebords piqués, ses deux entrées sur les côtés
    const yb = m.pantalon.max.y + 0.035 * u, yh = yb + (m.buste.max.y - yb) * 0.24, lk = Math.max(Math.abs(m.buste.min.x - cx), Math.abs(m.buste.max.x - cx)) * 0.5;
    yield;
    parts.push(yield* drapeGen(pr, { yH: yh, yB: yb, pas: (yh - yb) / 4, colonnes: 8, e: 0.013 * u, largeur: (y) => lk * (0.86 + 0.14 * (y - yb) / (yh - yb)), role: (uu, vv) => (vv < 0.2 || Math.abs(uu) > 0.78 && vv < 0.75 ? 'bord' : 'poche') }));
    yield;
    // l'étoile, sur la poitrine gauche
    const [ps, ns] = surFacade(pr, cx + 0.08 * u, m.buste.max.y - 0.17 * u, 0.006 * u); parts.push(pc(etoile(0.034 * u, 0.015 * u, 0.007 * u), or ? 'bijou' : 'fonce', surSurface(ps, ns, null, -0.15), (x, y) => wF(x, y)));
    parts.push(...poignets(pr, 'bord', 0.006 * u, 0.04 * u), ...ourlet(pr, 'bord', 0.034 * u));
    return { parts };
  }
  // la section d'une manche (la veste) à la distance x0 de l'axe du corps, du côté cote (au repos en T, le bras est le long de x) : son centre et ses rayons
  function manche(pr, cote, x0) {
    const W = pr.W, R = pr.R, d = 0.02 * pr.m.u; let sy = 0, sz = 0, k0 = 0, ry = 0, rz = 0;
    for (let k = 0; k < pr.n; k++) { if (R[k] !== RI.veste || Math.abs(W[k * 3] - cote * x0) > d) continue; sy += W[k * 3 + 1]; sz += W[k * 3 + 2]; k0++; }
    if (!k0) return null; const cy = sy / k0, cz = sz / k0;
    for (let k = 0; k < pr.n; k++) { if (R[k] !== RI.veste || Math.abs(W[k * 3] - cote * x0) > d) continue; ry = Math.max(ry, Math.abs(W[k * 3 + 1] - cy)); rz = Math.max(rz, Math.abs(W[k * 3 + 2] - cz)); }
    return { y: cy, z: cz, ry, rz };
  }
  // les poignets : un court fourreau autour du bout de chaque manche (sur l'os de l'avant-bras), d'épaisseur ep, de largeur l
  function poignets(pr, role, ep, l) {
    const parts = [], W = pr.W, R = pr.R; let xf = 0;
    for (let k = 0; k < pr.n; k++) if (R[k] === RI.veste && /LowerArm|Fist/.test(pr.nomOs(pr.dom[k]))) xf = Math.max(xf, Math.abs(W[k * 3]));
    for (const [cote, os] of [[1, OS.avantG], [-1, OS.avantD]]) {
      const x1 = xf - 0.003 * pr.m.u, x0 = x1 - l, s0 = manche(pr, cote, x0 + 0.01 * pr.m.u), s1 = manche(pr, cote, x1 - 0.01 * pr.m.u); if (!s0 || !s1) continue;
      const c = [new T.Vector3(cote * x0, s0.y, s0.z), new T.Vector3(cote * (x0 + x1) / 2, (s0.y + s1.y) / 2, (s0.z + s1.z) / 2), new T.Vector3(cote * x1, s1.y, s1.z)], r = [[s0.ry + ep, s0.rz + ep], [(s0.ry + s1.ry) / 2 + ep * 1.25, (s0.rz + s1.rz) / 2 + ep * 1.25], [s1.ry + ep, s1.rz + ep]];
      parts.push(pc(fourreau(c, r, 12, { n0: new T.Vector3(0, 1, 0) }), role, null, os));
    }
    return parts;
  }
  // l'ourlet : une bande tout autour des hanches, au bas de la veste, de hauteur h
  function ourlet(pr, role, h) {
    const m = pr.m, u = m.u, C = contour(pr, /^(Torso|Abdomen|Hips|Body)/, 'taille'), y0 = m.veste.min.y - 0.004 * u, y1 = y0 + h, r = () => (th) => { let rr = 0; for (let y = y0 - 0.02 * u; y <= y1 + 0.02 * u; y += 0.01 * u) rr = Math.max(rr, C.r(th, y)); return rr + 0.01 * u; };
    return [pc(nappe([anneau(C.cx, y0, C.cz, 1, 1, 28, r(y0)), anneau(C.cx, (y0 + y1) / 2, C.cz, 1, 1, 28, (th) => r((y0 + y1) / 2)(th) + 0.003 * u), anneau(C.cx, y1, C.cz, 1, 1, 28, r(y1))]), role, null, poidsCorps(pr, /^(Abdomen|Hips|Body|Torso)/))];
  }

  // ─── la cape (la Maison hantée) : elle s'agrafe devant le cou, couvre les épaules et tombe dans le dos, derrière les bras, en s'évasant jusqu'aux
  //     mollets ; dehors le tissu, dedans la doublure (« doublée de violet » ; en or : « noire dehors, dorée dedans »), qu'on voit sur ses côtés
  //     depuis la salle ; le grand col dressé, doublé lui aussi ; l'agrafe et sa chaînette. Son bas est sur un os à ressort (accCape) : elle fait
  //     « whoosh » quand il se retourne. La veste devient la robe ───
  function* kitCape(pr, o) { // (un générateur, comme le tablier)
    const m = pr.m, u = m.u, cx = m.tete.cx, parts = [], C = contour(pr, /^(Torso|Abdomen|Hips|Body|Neck|Shoulder|UpperLeg)/, 'cape'), cz = C.cz, wC = poidsCorps(pr, /^(Torso|Neck|Shoulder|Abdomen|Hips)/), wE = poidsCorps(pr, /^(Torso|Neck|Shoulder|UpperArm)/);
    const yN = m.foulard.max.y - 0.006 * u, yS = m.epaules.max.y - 0.006 * u, yBas = m.chevilleY + (m.pantalon.max.y - m.chevilleY) * 0.3, S = [0, 0.03, 0.07, 0.13, 0.22, 0.34, 0.48, 0.63, 0.78, 0.9, 1], NU = 22;
    const yDe = (s) => yN + (yBas - yN) * s, d12 = 0.12 * u;
    const demi = (y) => (y >= yS ? 2.86 - (2.86 - 2.2) * (yN - y) / (yN - yS) : y >= yS - d12 ? 2.2 - (2.2 - 1.16) * (yS - y) / d12 : 1.16 + 0.38 * Math.pow((yS - d12 - y) / (yS - d12 - yBas), 1.3));
    const rBase = (th, y) => { let r = C.r(th, y); if (y < yS) for (let yy = y; yy <= yS; yy += 0.03 * u) r = Math.max(r, C.r(th, yy)); return r; };
    const evase = (y) => (y >= yS - 0.05 * u ? 0 : 0.16 * u * Math.pow((yS - 0.05 * u - y) / (yS - 0.05 * u - yBas), 1.25));
    const rCape = (th, y) => rBase(th, y) + (y >= yS ? 0.014 * u : 0.022 * u) + evase(y);
    const ressort = (x, y, z) => { const s = (yN - y) / (yN - yBas), w = s <= 0.12 ? 0 : s >= 0.5 ? 1 : (() => { const t = (s - 0.12) / 0.38; return t * t * (3 - 2 * t); })(); const p = (s < 0.16 ? wE : wC)(x, y, z).map(([b0, ww]) => [b0, ww * (1 - w)]); if (w > 0) p.push(['accCape', w]); return p; }; // (le haut épouse les épaules, et le haut des bras quand ils bougent ; le bas suit l'os à ressort)
    const rangee = (s, dr) => { const y = yDe(s), d = demi(y), l = []; for (let i = 0; i <= NU; i++) { const th = Math.PI - d + 2 * d * i / NU, r = rCape(th, y) + (dr || 0); l.push(new T.Vector3(cx + Math.sin(th) * r, y, cz + Math.cos(th) * r)); } return l; };
    const ext = S.slice().reverse().map((s) => rangee(s)), dbl = S.slice().reverse().map((s) => rangee(s, -0.007 * u));
    parts.push(pc(nappe(ext, { ouvert: true }), 'tissu', null, ressort), pc(nappe(dbl, { ouvert: true, dedans: true }), 'doublure', null, ressort));
    yield;
    // ses tranches (le bas, les deux côtés), des deux faces
    const deuxFaces = (anneaux, role) => [pc(nappe(anneaux, { ouvert: true }), role, null, ressort), pc(nappe(anneaux, { ouvert: true, dedans: true }), role, null, ressort)];
    parts.push(...deuxFaces([dbl[0], ext[0]], 'tissu'));
    for (const i of [0, NU]) parts.push(...deuxFaces(ext.map((l, j) => [dbl[j][i], l[i]]), 'doublure'));
    yield;
    // le col dressé : il monte derrière la nuque, plus haut vers l'avant, évasé ; dehors le tissu, dedans la doublure
    const NC = 20, dC = 2.25, yC0 = yN - 0.012 * u, colA = (k, dr) => { const l = []; for (let i = 0; i <= NC; i++) { const th = Math.PI - dC + 2 * dC * i / NC, a = Math.abs(th - Math.PI) / dC, y = yC0 + (0.08 * u + 0.11 * u * a * a) * k, r = rBase(th, yN) + 0.024 * u + (0.13 * u + 0.05 * u * a) * Math.pow(k, 1.3) + (dr || 0); l.push(new T.Vector3(cx + Math.sin(th) * r, y, cz + Math.cos(th) * r)); } return l; };
    const colE = [0, 0.35, 0.7, 1].map((k) => colA(k)), colI = [0, 0.35, 0.7, 1].map((k) => colA(k, -0.006 * u));
    parts.push(pc(nappe(colE, { ouvert: true }), 'tissu', null, 'Torso'), pc(nappe(colI, { ouvert: true, dedans: true }), 'doublure', null, 'Torso'), ...[[colI[3], colE[3]]].map((a) => pc(nappe(a, { ouvert: true, dedans: true }), 'doublure', null, 'Torso')), pc(nappe([colI[3], colE[3]], { ouvert: true }), 'doublure', null, 'Torso'));
    // l'agrafe : deux boutons dorés aux coins du haut de la cape, la chaînette entre eux
    const g0 = ext[ext.length - 1][0], g1 = ext[ext.length - 1][NU], ag = [];
    for (const p of [g0, g1]) { const n = new T.Vector3(p.x - cx, 0.15, p.z - cz).normalize(); ag.push(p.clone().addScaledVector(n, 0.008 * u)); parts.push(pc(new T.CylinderGeometry(0.017 * u, 0.017 * u, 0.008 * u, 10), 'bijou', surSurface(p.clone().addScaledVector(n, 0.004 * u), n).multiply(new T.Matrix4().makeRotationX(HP)), 'Torso')); }
    const mil = ag[0].clone().add(ag[1]).multiplyScalar(0.5).add(new T.Vector3(0, -0.018 * u, 0.006 * u));
    parts.push(pc(tube([ag[0], mil, ag[1]], 0.0032 * u, 4, 10), 'bijou', null, 'Torso'));
    return { parts };
  }

  // ─── la veste de patron (la chaîne) : la veste du Chef reteinte, « croisée, boutons dorés » : deux rangées de trois gros boutons d'or, la
  //     croisure (un passepoil sombre qui descend du col en biais), la pochette dans sa poche de poitrine ; les galons dorés des poignets (un masque) ───
  function kitVeste(pr, o) {
    const m = pr.m, u = m.u, cx = m.tete.cx, parts = [], wF = poidsFacade(pr), f = facade(pr, 1);
    for (const dy of [0.16, 0.245, 0.33]) for (const s of [1, -1]) { const [p, n] = surFacade(pr, cx + s * 0.06 * u, m.buste.max.y - dy * u, 0.001 * u); parts.push(pc(new T.SphereGeometry(0.0165 * u, 10, 4, 0, TAU, 0, HP).rotateX(HP), 'bijou', surSurface(p, n, new T.Vector3(1, 1, 0.6)), (x, y) => wF(x, y))); }
    // les revers : deux pointes drapées qui descendent du col jusqu'à la première rangée, plus sombres, bordées d'un filet d'or
    const yT = m.foulard.min.y + 0.012 * u, yL = m.buste.max.y - 0.14 * u;
    for (const s of [1, -1]) {
      const w = (y) => 0.004 * u + 0.05 * u * Math.pow((y - yL) / (yT - yL), 0.8), c0 = (y) => cx + s * (0.038 * u + w(y) * 0.5 + 0.03 * u * (1 - (y - yL) / (yT - yL)));
      parts.push(drape(pr, { yH: yT, yB: yL, pas: (yT - yL) / 5, colonnes: 4, e: 0.004 * u, centre: c0, largeur: (y) => w(y) * 0.5, role: () => 'bord' }));
      const bordP = []; for (let k = 0; k <= 5; k++) { const y = yT - (yT - yL) * k / 5, x = c0(y) + s * w(y) * 0.5; bordP.push(new T.Vector3(x, y, f.zA(x, y) + 0.006 * u)); }
      parts.push(pc(tube(bordP, 0.0032 * u, 4, 10), 'bijou', null, (x, y) => wF(x, y)));
    }
    // la croisure : le bord du pan de devant, en biais du revers gauche jusqu'à l'ourlet
    const pts = [[0.064, -0.14], [0.1, -0.2], [0.104, -0.32], [0.104, -0.44], [0.104, -0.56]].map(([x, dy]) => { const xx = cx + x * u, y = m.buste.max.y + dy * u; return new T.Vector3(xx, y, f.zA(xx, y) + 0.0035 * u); }).filter((p) => p.y > m.pantalon.max.y - 0.02 * u);
    parts.push(pc(fourreau(pts, pts.map(() => [0.0075 * u, 0.0028 * u]), 6, { n0: new T.Vector3(1, 0, 0) }), 'bord', null, (x, y) => wF(x, y)));
    // la poche de poitrine (droite du personnage) et sa pochette
    const xp = cx - 0.105 * u, yp = m.buste.max.y - 0.2 * u, [pa, na] = surFacade(pr, xp - 0.03 * u, yp, 0.003 * u), [pb] = surFacade(pr, xp + 0.03 * u, yp + 0.004 * u, 0.003 * u);
    parts.push(pc(baton(pa, pb, 0.008 * u, 0.004 * u, na), 'bord', null, (x, y) => wF(x, y)));
    for (const [dx, h, a] of [[-0.02, 0.042, 0.28], [0, 0.05, 0], [0.019, 0.04, -0.32]]) { const [p, n] = surFacade(pr, xp + dx * u, yp + h * u * 0.42, 0.005 * u), tr = new T.Shape(); tr.moveTo(-0.014 * u, -h * u * 0.5); tr.lineTo(0.014 * u, -h * u * 0.5); tr.lineTo(0, h * u * 0.5); parts.push(pc(plaque(tr, 0.003 * u), 'blanc', surSurface(p, n, null, a), (x, y) => wF(x, y))); }
    parts.push(...poignets(pr, 'bijou', 0.005 * u, 0.026 * u));
    return { parts };
  }


  // ═══ les kits des pieds ═══
  // le centre et le rayon d'une jambe (le pantalon) à une hauteur, et l'avant du pied
  function jambe(pr, cote, y) {
    const W = pr.W, R = pr.R; let sx = 0, sz = 0, k0 = 0, r = 0, zA = -1e9;
    for (let k = 0; k < pr.n; k++) { const x = W[k * 3]; if (x * cote <= 0.02) continue; if (R[k] === RI.peau && /Foot|LowerLeg/.test(pr.nomOs(pr.dom[k]))) zA = Math.max(zA, W[k * 3 + 2]); if (R[k] !== RI.pantalon || Math.abs(W[k * 3 + 1] - y) > 0.06) continue; sx += x; sz += W[k * 3 + 2]; k0++; }
    if (!k0) return null; const cx = sx / k0, cz = sz / k0;
    for (let k = 0; k < pr.n; k++) { const x = W[k * 3]; if (x * cote <= 0.02 || R[k] !== RI.pantalon || Math.abs(W[k * 3 + 1] - y) > 0.06) continue; r = Math.max(r, Math.hypot(x - cx, W[k * 3 + 2] - cz)); }
    return { x: cx, z: cz, r, zAvant: zA };
  }
  // une chaussure : une coque de sections le long du pied (du talon au bout), chacune un arc (du bord extérieur bas, par-dessus, au bord intérieur bas)
  // refermée par dessous, et sa semelle. o (en unités de Chef_Male) : larg (la largeur), haut (la tige, au talon), bout (la hauteur vers le bout),
  // avance (le bout dépasse le pied de tant), recul (le talon), pointe (l'exposant de l'affinement du bout), bout0 (la largeur du bout, en part de
  // la largeur), releve (le bout se relève de tant), semelle (son épaisseur), cap (le bout rapporté, d'une autre couleur, à partir de cette part de
  // la longueur). Rend ses parts et surCoque(s, a) : le point de sa surface à la part s de la longueur et à l'angle a de l'arc (0 : le bord
  // extérieur bas du côté +x, π/2 : le dessus, π : l'autre bord), et sa normale
  function coque(pr, cote, o, os) {
    const m = pr.m, u = m.u, pied = m.pieds[cote > 0 ? 0 : 1], x = (pied.min.x + pied.max.x) / 2, y0 = m.piedsY0, zT = pied.min.z - (o.recul || 0.012) * u, zB = pied.max.z + (o.avance || 0.085) * u, L = zB - zT, K = 10, MA = 10, sem = (o.semelle || 0.012) * u;
    const larg = (s) => o.larg * u * 0.5 * (s < 0.16 ? 0.8 + 0.2 * Math.sin(s / 0.16 * HP) : s < 0.6 ? 1 : 1 - (1 - (o.bout0 == null ? 0.38 : o.bout0)) * Math.pow((s - 0.6) / 0.4, o.pointe || 1.6));
    const haut = (s) => { const t = Math.pow(Math.min(1, s / 0.6), 1.15); return (o.haut * (1 - t) + o.bout * t * (s > 0.6 ? 1 - 0.6 * Math.pow((s - 0.6) / 0.4, 1.8) : 1)) * u; };
    const lev = (s) => (o.releve || 0) * u * Math.pow(Math.max(0, s - 0.55) / 0.45, 2);
    const point = (s, a, d) => { const z = zT + L * s, w = Math.max(0.004 * u, larg(s)) + (d || 0), h = Math.max(0.006 * u, haut(s) - sem) + (d || 0); return new T.Vector3(x + Math.cos(a) * w, y0 + sem * 0.9 + lev(s) + Math.sin(a) * h, z); };
    const ks = []; for (let k = 0; k <= K; k++) ks.push(k / K); if (o.cap && !ks.includes(o.cap)) { ks.push(o.cap); ks.sort((a, b) => a - b); }
    const sections = ks.map((s) => { const l = []; for (let i = 0; i <= MA; i++) l.push(point(s, i / MA * Math.PI)); return l; });
    const sol = ks.map((s) => { const z = zT + L * s, ws = Math.max(0.004 * u, larg(s)) * 1.05 + 0.002 * u; return [new T.Vector3(x + ws, y0 - 0.003 * u + lev(s), z), new T.Vector3(x + ws, y0 + sem + lev(s), z), new T.Vector3(x - ws, y0 + sem + lev(s), z), new T.Vector3(x - ws, y0 - 0.003 * u + lev(s), z)]; });
    const debutSol = sol[0][0].clone().add(sol[0][2]).multiplyScalar(0.5).add(new T.Vector3(0, 0, -0.002 * u)), finSol = sol[sol.length - 1][0].clone().add(sol[sol.length - 1][2]).multiplyScalar(0.5).add(new T.Vector3(0, 0, 0.004 * u));
    const parts = [], ic = o.cap ? ks.indexOf(o.cap) : -1;
    if (ic > 0) parts.push(pc(nappe(sections.slice(0, ic + 1), { bas: true }), 'tissu', null, os), pc(nappe(sections.slice(ic), { haut: true }), 'clair', null, os));
    else parts.push(pc(nappe(sections, { bas: true, haut: true }), 'tissu', null, os));
    parts.push(pc(nappe(sol, { bas: debutSol, haut: finSol }), 'semelle', null, os));
    const surCoque = (s, a, d) => { const p = point(s, a, d || 0), q = point(Math.min(1, s + 0.02), a, d || 0), r = point(s, a + 0.05, d || 0); const n = new T.Vector3().crossVectors(new T.Vector3().subVectors(r, p), new T.Vector3().subVectors(q, p)).normalize(); if (n.dot(new T.Vector3(Math.cos(a), Math.sin(a), 0)) < 0) n.negate(); return [p, n]; };
    // un ruban posé sur la coque, de (s0, a0) à (s1, a1) : ep sa largeur, rel son relief
    const ruban = (s0, a0, s1, a1, ep, rel, role, n) => { const l = []; for (let k = 0; k <= (n || 4); k++) { const t = k / (n || 4); l.push(surCoque(s0 + (s1 - s0) * t, a0 + (a1 - a0) * t, rel)[0]); } return pc(fourreau(l, l.map(() => [ep, rel * 0.8]), 4, { n0: surCoque((s0 + s1) / 2, (a0 + a1) / 2)[1], debut: true, bout: true }), role, null, os); };
    return { parts, x, zT, zB, L, larg, haut, lev, y0, sem, cote, surCoque, ruban, sections, ks };
  }
  // ─── les chaussures, de la paire au pied : v (la pièce) choisit la coque et ses détails. Les sabots de bois (une coque ronde et épaisse au bout
  //     relevé, le fil du bois, la bride de cuir, ils claquent) ; les chaussures du podium (le bout clair, les lacets ; l'argent : l'étoile sur le côté ; l'or : l'étoile et
  //     deux petites ailes au talon, « on court plus vite au four ») ; celles du parcours (lacets et couture cuivrés, « elles ont fait vingt-trois
  //     boutiques » : le bout un peu usé) ; les souliers vernis de la chaîne (noirs, fins, leurs reflets) ; les baskets (la grosse semelle blanche,
  //     les deux bandes, la languette du talon, les lacets ; « blanches, enfin presque » : quelques traces) ; les bottes (le bout pointu qui se
  //     recourbe, la tige jusqu'au mollet, le revers rabattu à pointes, la boucle) ; celles d'un apprenti ───
  function* kitChaussures(pr, o) { // (un générateur : un pied, puis l'autre)
    const m = pr.m, u = m.u, v = o.v || 'sabots', parts = [];
    for (const [cote, os] of [[1, OS.pieds[0]], [-1, OS.pieds[1]]]) {
      let c = null;
      if (v === 'sabots') {
        c = coque(pr, cote, { larg: 0.142, haut: 0.094, bout: 0.076, avance: 0.108, recul: 0.018, pointe: 1.0, bout0: 0.64, releve: 0.036, semelle: 0.026 }, os); c.os = os;
        c.parts[0].role = 'bois'; c.parts[1].role = 'semelle';
        for (const a of [HP - 0.42, HP, HP + 0.42]) parts.push(c.ruban(0.56, a, 0.97, a * 0.9 + HP * 0.1, 0.0026 * u, 0.0013 * u, 'fonce', 6)); // (le fil du bois, sur le bout)
        const ia = c.ks.indexOf(0.4), ib = c.ks.indexOf(0.5), bride = [c.sections[ia], c.sections[ib]].map((l, j) => l.map((p, i) => c.surCoque(c.ks[j ? ib : ia], i / 10 * Math.PI, 0.004 * u)[0]));
        parts.push(pc(nappe(bride), 'cuir', null, os), pc(nappe(bride, { dedans: true }), 'cuir', null, os));
      } else if (v === 'souliers') {
        c = coque(pr, cote, { larg: 0.108, haut: 0.062, bout: 0.034, avance: 0.098, pointe: 1.25, bout0: 0.22, semelle: 0.009 }, os); c.os = os;
        parts.push(c.ruban(0.72, 1.25, 0.93, 1.45, 0.0042 * u, 0.0012 * u, 'reflet'), c.ruban(0.3, cote > 0 ? 0.55 : 2.59, 0.62, cote > 0 ? 0.62 : 2.52, 0.0032 * u, 0.0012 * u, 'reflet'), c.ruban(0.05, 0.15, 0.95, 0.15, 0.0028 * u, 0.0012 * u, 'bord', 8), c.ruban(0.05, Math.PI - 0.15, 0.95, Math.PI - 0.15, 0.0028 * u, 0.0012 * u, 'bord', 8));
      } else if (/^baskets/.test(v)) {
        c = coque(pr, cote, { larg: 0.124, haut: 0.084, bout: 0.052, avance: 0.086, pointe: 1.7, bout0: 0.46, semelle: 0.032, cap: 0.8 }, os); c.os = os;
        const ex = cote > 0 ? 0 : Math.PI, sg = cote > 0 ? 1 : -1; // (le côté extérieur de l'arc)
        for (const ds of [0, 0.1]) parts.push(c.ruban(0.28 + ds, ex + sg * 0.22, 0.42 + ds, ex + sg * 0.95, 0.0065 * u, 0.002 * u, 'fonce'));
        for (let k = 0; k < 3; k++) { const s = 0.44 + k * 0.08; parts.push(c.ruban(s, 1.05, s, 2.09, 0.0034 * u, 0.0022 * u, 'blanc', 3)); }
        parts.push(c.ruban(0.03, ex + sg * 0.25, 0.03, Math.PI - ex - sg * 0.25, 0.006 * u, 0.002 * u, 'fonce', 5)); // (le renfort du talon)
      } else if (/^bottes/.test(v)) {
        c = coque(pr, cote, { larg: 0.11, haut: 0.095, bout: 0.04, avance: 0.118, pointe: 1.15, bout0: 0.16, releve: 0.05, semelle: 0.012 }, os); c.os = os;
        // le bout qui se recourbe : un petit fourreau qui part du bout et s'enroule vers le haut et l'arrière
        const zb = c.zB, yb = c.y0 + c.sem + c.lev(1) + 0.006 * u, pts = [new T.Vector3(c.x, yb, zb - 0.012 * u), new T.Vector3(c.x, yb + 0.012 * u, zb + 0.008 * u), new T.Vector3(c.x, yb + 0.04 * u, zb + 0.014 * u), new T.Vector3(c.x, yb + 0.055 * u, zb - 0.002 * u)];
        parts.push(pc(fourreau(pts, [0.011 * u, 0.008 * u, 0.0055 * u, 0.002 * u], 6, { bout: true }), 'tissu', null, os));
        // la tige droite jusqu'au mollet (sur le tibia), le revers, la boucle sur le cou-de-pied
        const tib = OS.tibias[cote > 0 ? 0 : 1], yR = m.chevilleY + (m.pantalon.max.y - m.chevilleY) * 0.27, jR = jambe(pr, cote, yR) || { x: c.x, z: 0, r: 0.09 * u }, jC = jambe(pr, cote, m.chevilleY + 0.03 * u) || jR, rT = Math.max(jR.r, jC.r) + 0.012 * u;
        const ax0 = new T.Vector3(c.x, c.y0 + 0.05 * u, c.zT + c.L * 0.3), ax1 = new T.Vector3(jR.x, yR, jR.z), anneaux = [];
        for (const [t, r] of [[0, 0.064 * u], [0.25, rT * 0.92], [0.55, rT], [1, rT]]) { const cc = ax0.clone().lerp(ax1, t); anneaux.push(anneau(cc.x, cc.y, cc.z, r, r * 1.04, 14)); }
        parts.push(pc(nappe(anneaux), 'tissu', null, tib));
        const yR1 = yR + 0.032 * u, jH = jambe(pr, cote, yR1) || jR, rr = rT + 0.002 * u;
        // le revers en entonnoir : serré sur la tige, il s'évase vers le haut et finit en sept pointes, comme une couronne ; dedans, il redescend
        // sur la jambe
        const yRh = (th, i) => yR1 + 0.012 * u + (i % 2 ? -0.014 * u : 0.006 * u), rH = rr + 0.022 * u;
        parts.push(pc(nappe([anneau(ax1.x, yR - 0.022 * u, ax1.z, rr + 0.002 * u, (rr + 0.002 * u) * 1.04, 14), anneau(ax1.x, yR + 0.004 * u, ax1.z, rr + 0.008 * u, (rr + 0.008 * u) * 1.04, 14), anneau(ax1.x, yRh, ax1.z, rH, rH * 1.04, 14)]), 'fonce', null, tib));
        const dedans = anneau(ax1.x, (th, i) => yRh(th, i) - 0.001 * u, ax1.z, rH - 0.004 * u, (rH - 0.004 * u) * 1.04, 14);
        parts.push(pc(nappe([anneau(jH.x, yR1 - 0.006 * u, jH.z, jH.r + 0.004 * u, jH.r + 0.004 * u, 14), dedans], { dedans: true }), 'fonce', null, tib, { nuance: 0.72 }), pc(nappe([dedans, anneau(ax1.x, yRh, ax1.z, rH, rH * 1.04, 14)], { dedans: true }), 'fonce', null, tib));
        const zf = c.zT + c.L * 0.42, yf = c.y0 + c.haut(0.42) - 0.004 * u, bw = 0.034 * u, bh = 0.026 * u, be = 0.0065 * u;
        for (const [dx, dy, w, h] of [[0, bh / 2, bw, be], [0, -bh / 2, bw, be], [bw / 2, 0, be, bh], [-bw / 2, 0, be, bh]]) parts.push(pc(new T.BoxGeometry(w, h, 0.006 * u), 'bijou', { x: c.x + dx, y: yf + dy, z: zf + 0.003 * u, rx: -0.85 }, os));
      } else { // les chaussures : le podium, le parcours, un apprenti
        const app = v === 'apprenti';
        c = coque(pr, cote, { larg: app ? 0.104 : 0.114, haut: app ? 0.066 : 0.072, bout: 0.042, avance: app ? 0.07 : 0.082, pointe: 1.6, bout0: 0.4, semelle: 0.014, cap: app ? 0 : 0.74 }, os); c.os = os;
        if (!app) {
          for (let k = 0; k < 3; k++) { const s = 0.4 + k * 0.08; parts.push(c.ruban(s, 1.0, s, 2.14, 0.0032 * u, 0.0022 * u, 'lacet', 3)); }
          const ex = cote > 0 ? 0 : Math.PI, sg = cote > 0 ? 1 : -1;
          if (v === 'or' || v === 'argent') { const [p, n] = c.surCoque(0.5, ex + sg * 0.55, 0.002 * u); parts.push(pc(etoile(0.019 * u, 0.008 * u, 0.005 * u), v === 'or' ? 'bijou' : 'fonce', surSurface(p, n), os)); }
          if (v === 'parcours') parts.push(c.ruban(0.06, 0.12, 0.96, 0.12, 0.0024 * u, 0.0012 * u, 'lacet', 8), c.ruban(0.06, Math.PI - 0.12, 0.96, Math.PI - 0.12, 0.0024 * u, 0.0012 * u, 'lacet', 8));
          if (v === 'or') for (let k = 0; k < 3; k++) { // les petites ailes du talon
            const pl = new T.Shape(); pl.moveTo(0, 0); pl.quadraticCurveTo(0.012 * u, 0.006 * u, 0.026 * u - k * 0.004 * u, 0.004 * u + k * 0.006 * u); pl.quadraticCurveTo(0.01 * u, -0.002 * u, 0, -0.006 * u); pl.lineTo(0, 0);
            parts.push(pc(plaque(pl, 0.003 * u), 'bijou', new T.Matrix4().makeRotationY(cote > 0 ? -HP : HP).multiply(new T.Matrix4().makeRotationZ(0.35 + k * 0.28)).setPosition(c.x + cote * (c.larg(0.08) + 0.003 * u), c.y0 + c.haut(0.05) * 0.7 + k * 0.004 * u, c.zT + c.L * 0.1 - k * 0.006 * u), os));
          }
        }
      }
      parts.push(...c.parts);
      yield;
    }
    return { parts };
  }

  // ═══ les kits de l'accessoire et des marques ═══
  // ─── le foulard noué : le col du Chef (sa bande autour du cou) prend sa couleur, et devant, sous le menton, le gros nœud et ses deux pans qui
  //     tombent en V sur la poitrine, larges, bordés d'un liseré qui tranche (on les voit de la salle, d'en haut : la tête cache le cou ; sur un
  //     tablier de la même collection aussi). L'or : des pois clairs ; l'argent : deux rayures claires ; le bronze : uni ; le parcours : des pois
  //     cuivrés et « 29 » brodé (« noué à la boutique n°29 ») ; celui du titre : rouge, à pois ───
  function kitFoulard(pr, o) {
    const m = pr.m, u = m.u, v = o.v || 'titre', cx = m.tete.cx, parts = [], os = OS.torse, f = facade(pr, 1);
    const yK = m.foulard.min.y - 0.004 * u, zK = f.zA(cx, yK) + 0.056 * u; // (le nœud devant la bavette d'un tablier)
    parts.push(pc(new T.SphereGeometry(0.05 * u, 10, 6), 'tissu', { x: cx, y: yK, z: zK, sx: 1.3, sy: 0.95, sz: 0.8 }, os), pc(new T.TorusGeometry(0.04 * u, 0.015 * u, 5, 12), 'tissu', { x: cx, y: yK + 0.005 * u, z: zK - 0.008 * u, sx: 1.5, sy: 0.72, rx: 0.1 }, os, { nuance: 0.86 }));
    for (const [s, ang, lg] of [[1, 0.44, 0.27], [-1, -0.32, 0.235]]) { // deux pans, un peu de travers, bordés
      const feuille = (w, L) => { const fo = new T.Shape(); fo.moveTo(-w * 0.5, 0); fo.quadraticCurveTo(-w * 1.2, -L * 0.45, -w * 0.15, -L); fo.lineTo(w * 0.35, -L * 0.9); fo.quadraticCurveTo(w * 1.15, -L * 0.45, w * 0.5, 0); fo.lineTo(-w * 0.5, 0); return fo; };
      const w = 0.058 * u, L = lg * u, x0 = cx + s * 0.02 * u, y0 = yK - 0.012 * u, xm = x0 + Math.sin(ang) * L * 0.5, ym = y0 - Math.cos(ang) * L * 0.5, [pm, nm] = surFacade(pr, xm, ym, 0.03 * u);
      const ma = surSurface(new T.Vector3(x0, y0, pm.z + (zK - pm.z) * 0.3), nm, null, ang);
      parts.push(pc(plaque(feuille(w, L), 0.007 * u, 0.0015 * u), 'tissu', ma.clone().multiply(new T.Matrix4().makeTranslation(0, 0, 0.002 * u)), os), pc(plaque(feuille(w * 1.28, L * 1.075), 0.006 * u, 0.0015 * u), 'bord', ma, os));
      const sur = (t, dx) => new T.Vector3(dx || 0, -L * t, 0.0075 * u).applyMatrix4(ma);
      if (v === 'or' || v === 'parcours' || v === 'titre') for (const [t, dx] of [[0.2, -0.009], [0.38, 0.011], [0.56, -0.007], [0.74, 0.006]]) parts.push(pc(new T.SphereGeometry(0.0072 * u, 6, 4), v === 'parcours' ? 'bijou' : 'clair', new T.Matrix4().makeTranslation(...sur(t, dx * u).toArray()).multiply(new T.Matrix4().makeScale(1, 1, 0.4)), os));
      if (v === 'argent') for (const t of [0.34, 0.54]) { const a = sur(t, -w * 0.72), b = sur(t + 0.06, w * 0.72); parts.push(pc(baton(a, b, 0.011 * u, 0.0035 * u, nm), 'clair', null, os)); }
      if (v === 'parcours' && s > 0) { const h = 0.026 * u, wt = largeurTexte('29', h); for (const g of tracer('29', h, 0.0048 * u, 0.0025 * u, (uu, vv) => [new T.Vector3(-wt / 2 + uu, -L * 0.88 + vv, 0.0062 * u).applyMatrix4(ma), nm])) parts.push(pc(g, 'bijou', null, os)); }
    }
    return { parts };
  }
  // ─── la chaîne (le quartier) : une gourmette de maillons alternés qui tombe en U sur la poitrine depuis le col, un médaillon et son étoile ;
  //     « elle brille sous les néons » : un éclat qui scintille (un os qui grandit et s'efface). En or : plus épaisse, le médaillon plus grand
  //     (« la vraie, pas la plaquée ») ───
  function kitChaine(pr, o) {
    const m = pr.m, u = m.u, v = o.v || 'quartier', or = v === 'quartier-or', cx = m.tete.cx, parts = [], os = OS.torse, f = facade(pr, 1);
    const pv = pr.pivot_accEclat || new T.Vector3(cx, m.buste.max.y - 0.16 * u, m.buste.max.z + 0.05 * u), yBas = pv.y + 0.012 * u, yHaut = m.foulard.max.y - 0.048 * u, xH = 0.104 * u; // (ses bouts plongent sous le col : sous la cape, s'il y en a une)
    const point = (s) => { const x = cx + xH * Math.sin(s * HP * 1.02), y = yBas + (yHaut - yBas) * Math.pow(Math.abs(s), 1.6); return new T.Vector3(x, y, f.zA(x, y) + (or ? 0.037 : 0.034) * u - 0.033 * u * Math.pow(Math.abs(s), 9)); };
    const NL = or ? 20 : 22, Rl = (or ? 0.0125 : 0.0105) * u, rl = (or ? 0.0042 : 0.0032) * u;
    for (let k = 0; k <= NL; k++) {
      const s = -1 + 2 * k / NL, p = point(s), t = point(Math.min(1, s + 0.02)).sub(point(Math.max(-1, s - 0.02))).normalize(), n = f.normale(p.x, p.y), b = new T.Vector3().crossVectors(t, n);
      const mat = new T.Matrix4().makeBasis(t, k % 2 ? n : b, k % 2 ? b.clone().negate() : n).setPosition(p);
      parts.push(pc(new T.TorusGeometry(Rl, rl, 3, 6), 'bijou', mat.multiply(new T.Matrix4().makeScale(1.25, 1, 1)), os));
    }
    const pm = point(0), nm = f.normale(pm.x, pm.y), Rm = (or ? 0.036 : 0.029) * u, cm = new T.Vector3(pm.x, pm.y - Rm - 0.004 * u, f.zA(pm.x, pm.y - Rm) + 0.032 * u);
    parts.push(pc(new T.CylinderGeometry(Rm, Rm, 0.008 * u, 14).rotateX(HP), 'bijou', surSurface(cm, nm), os), pc(new T.TorusGeometry(Rm, 0.0035 * u, 4, 16), 'clair', surSurface(cm.clone().addScaledVector(nm, 0.004 * u), nm), os));
    parts.push(pc(etoile(Rm * 0.6, Rm * 0.26, 0.004 * u), or ? 'rouge' : 'fonce', surSurface(cm.clone().addScaledVector(nm, 0.005 * u), nm), os));
    // l'éclat : quatre branches fines, sur l'os qui scintille (posé à son pivot)
    const ec = new T.Shape(), a = 0.02 * u, bq = 0.0035 * u; ec.moveTo(0, a); ec.lineTo(bq, bq); ec.lineTo(a, 0); ec.lineTo(bq, -bq); ec.lineTo(0, -a); ec.lineTo(-bq, -bq); ec.lineTo(-a, 0); ec.lineTo(-bq, bq); ec.lineTo(0, a);
    const pe = new T.Vector3(cm.x + Rm * 0.75, cm.y + Rm * 0.75, cm.z + 0.012 * u);
    parts.push(pc(plaque(ec, 0.002 * u), 'eclat', surSurface(pe, nm, null, 0.4), (x, y, z) => [['accEclat', 1]]));
    pr.eclat = pe.clone(); // (l'os de l'éclat doit être à cet endroit : son pivot, posé à la cuisson, en est tout près)
    return { parts };
  }
  // ─── les lunettes rondes : deux cercles devant les yeux, le pont, les branches jusqu'aux oreilles ───
  function kitLunettes(pr) {
    const y = pr.m.yeux, t = pr.m.tete, u = pr.m.u, e = y.g.distanceTo(y.d), r = e * 0.31, z = y.front + r * 0.42, yy = (y.g.y + y.d.y) / 2 + e * 0.06, ep = r * 0.16, mx = (y.g.x + y.d.x) / 2, l = Math.max(0.001, e - 2 * r), os = OS.tete, parts = [];
    parts.push(pc(new T.TorusGeometry(r, ep, 4, 16), 'tissu', { x: y.g.x, y: yy, z }, os), pc(new T.TorusGeometry(r, ep, 4, 16), 'tissu', { x: y.d.x, y: yy, z }, os), pc(new T.CylinderGeometry(ep * 0.8, ep * 0.8, l + ep, 5), 'tissu', { x: mx, y: yy + r * 0.18, z, rz: HP }, os));
    for (const s of [1, -1]) { const ex = (s > 0 ? y.g.x : y.d.x) + s * r * 0.98, a = new T.Vector3(ex, yy + r * 0.1, z - ep * 0.5), b = new T.Vector3(t.cx + s * t.rx * 1.02, yy + r * 0.05, t.cz + t.rz * 0.2); parts.push(pc(baton(a, b, ep * 1.1, ep * 0.9, new T.Vector3(s, 0, 0)), 'tissu', null, os)); }
    return { parts };
  }
  // ─── une pièce cuite du lot (p-lanterne : ses couleurs de sommets). Lue en flottants (le fichier est quantifié : des positions en entiers
  //     normalisés, que transformer sur place écrêterait), sans indices, posée (le bas sur y = 0, centrée en x et z) ; chaque sommet rangé dans un
  //     rôle par classer(r, g, b) (null : il garde sa couleur), avec sa nuance relative à la couleur moyenne de son rôle ───
  const CUITES = {};
  function cuirePiece(nom, classer) {
    if (nom in CUITES) return CUITES[nom]; CUITES[nom] = null;
    const g = HDM.equipe && HDM.equipe(nom); if (!g) return null;
    g.scene.updateMatrixWorld(true); let m = null; g.scene.traverse((o) => { if (!m && o.isMesh) m = o; }); if (!m) return null;
    const src = m.geometry, ix = src.index, pos = src.attributes.position, col = src.attributes.color, n = ix ? ix.count : pos.count;
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), roles = new Array(n).fill(null), mul = new Float32Array(n).fill(1), lum = new Float32Array(n), bb = new T.Box3(), somme = {};
    for (let k = 0; k < n; k++) {
      const i = ix ? ix.getX(k) : k; _v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); _v1.toArray(P, k * 3); bb.expandByPoint(_v1);
      const r = col ? col.getX(i) : 1, gg = col ? col.getY(i) : 1, b = col ? col.getZ(i) : 1, role = classer(r, gg, b); C[k * 3] = r; C[k * 3 + 1] = gg; C[k * 3 + 2] = b;
      roles[k] = role; lum[k] = 0.2126 * r + 0.7152 * gg + 0.0722 * b; if (role) { const s0 = somme[role] || (somme[role] = [0, 0]); s0[0] += lum[k]; s0[1]++; }
    }
    for (let k = 0; k < n; k++) { const s0 = roles[k] && somme[roles[k]]; if (s0) mul[k] = Math.max(0.55, Math.min(1.6, lum[k] / Math.max(1e-4, s0[0] / s0[1]))); }
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2; for (let k = 0; k < n; k++) { P[k * 3] -= cx; P[k * 3 + 1] -= bb.min.y; P[k * 3 + 2] -= cz; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('color', new T.BufferAttribute(C, 3));
    return (CUITES[nom] = { geo, roles, mul, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z });
  }
  // ─── en main : la citrouille-lanterne (KayKit Halloween Bits, p-lanterne.glb : l'orange reteint à la collection — dorée pour la tenue en or —,
  //     la tige gardée, ses yeux et sa bouche allumés : « elle éclaire les fournées de nuit »), son anse ; la clé de la panne. Bâties en unités des
  //     chibis autour de l'origine (la prise), sur un os sous la racine que tenir() place à chaque image ───
  function kitLanterne() {
    const parts = [pc(new T.CapsuleGeometry(0.32, 3.4, 2, 4), 'fonce', { y: -1.7 }, 'accLanterne'), pc(new T.TorusGeometry(1.6, 0.3, 4, 8, Math.PI), 'fonce', { y: -3.4 }, 'accLanterne')];
    const cu = cuirePiece('p-lanterne', (r, g, b) => { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; return r > 0.2 && g < r * 0.62 && b < r * 0.3 ? 'citrouille' : l < 0.09 ? 'oeil' : g > r ? 'tige' : null; });
    if (cu) { const s = 9.5 / Math.max(cu.w, cu.d); parts.push({ geo: cu.geo, m: new T.Matrix4().compose(new T.Vector3(0, -3.6 - cu.h * s, 0), new T.Quaternion(), new T.Vector3(s, s, s)), vc: true, roles: cu.roles, mul: cu.mul, os: 'accLanterne', garder: true }); }
    else parts.push(pc(new T.SphereGeometry(4.2, 10, 7), 'citrouille', { y: -8, sy: 0.85 }, 'accLanterne'), pc(new T.CylinderGeometry(0.7, 0.9, 1.6, 6), 'tige', { y: -4.6 }, 'accLanterne'), pc(new T.SphereGeometry(0.9, 6, 4), 'oeil', { x: -1.4, y: -7.6, z: 3.5, sz: 0.4 }, 'accLanterne'), pc(new T.SphereGeometry(0.9, 6, 4), 'oeil', { x: 1.4, y: -7.6, z: 3.5, sz: 0.4 }, 'accLanterne'));
    return { parts };
  }
  // ─── le trousseau de clés (la chaîne) : « une clé par boutique : il tinte à chaque pas » ; pendu à la ceinture, sur la hanche droite, par une
  //     patte de cuir : l'anneau, cinq clés en éventail (or et laiton, une d'argent), sur un os à ressort (accCles) qui balance et tinte ───
  function kitCles(pr) {
    const u = pr.m.u, P = pr.pivot_accCles || new T.Vector3(-0.105 * u, pr.m.pantalon.max.y, pr.m.buste.max.z + 0.03 * u), os = 'accCles', parts = [];
    parts.push(pc(new T.BoxGeometry(0.026 * u, 0.046 * u, 0.007 * u), 'cuir', { x: P.x, y: P.y - 0.018 * u, z: P.z }, os), pc(new T.CylinderGeometry(0.006 * u, 0.006 * u, 0.004 * u, 8).rotateX(HP), 'bijou', { x: P.x, y: P.y - 0.03 * u, z: P.z + 0.005 * u }, os));
    const A = new T.Vector3(P.x, P.y - 0.062 * u, P.z + 0.002 * u), Ra = 0.025 * u;
    parts.push(pc(new T.TorusGeometry(Ra, 0.0034 * u, 4, 14), 'bijou', { x: A.x, y: A.y, z: A.z }, os));
    [[-0.62, 'bijou', 1], [-0.25, 'clair', 0.9], [0.1, 'bijou', 1.08], [0.42, 'gris', 0.95], [0.75, 'clair', 0.88]].forEach(([a, role, k], i) => {
      const h = 0.07 * u * k, ax = Math.sin(a), ay = -Math.cos(a), base = new T.Vector3(A.x + ax * Ra, A.y + ay * Ra, A.z + (i % 2 ? 0.003 : -0.003) * u);
      const mat = new T.Matrix4().makeRotationZ(a).setPosition(base.x + ax * h * 0.32, base.y + ay * h * 0.32, base.z);
      for (const p of cleDoree(h)) { p.role = role; p.m = mat.clone().multiply(new T.Matrix4().makeRotationZ(Math.PI)).multiply(p.m || new T.Matrix4()); p.os = os; parts.push(p); }
    });
    return { parts };
  }
  // ─── les marques : la moustache du patron (titre 3 et plus), l'étoile dorée du grade 3 (os d'échelle nulle sous le grade 3), la goutte de sueur
  //     (le coup de feu), la clé de la panne d'un apprenti ───
  function kitMoustache(pr) {
    const y = pr.m.yeux, t = pr.m.tete, mx = (y.g.x + y.d.x) / 2, e = y.g.distanceTo(y.d), yy = y.bas - (y.bas - (t.cy - t.ry)) * 0.25, z = y.front - 0.006, r = e * 0.105;
    return { parts: [pc(new T.CapsuleGeometry(r, r * 2.5, 2, 6), 'moustache', { x: mx + e * 0.2, y: yy, z, rz: -1.2 }, OS.tete), pc(new T.CapsuleGeometry(r, r * 2.5, 2, 6), 'moustache', { x: mx - e * 0.2, y: yy, z, rz: 1.2 }, OS.tete)] };
  }
  const surBuste = (pr) => { const m = pr.m, k = m.kb; return new T.Matrix4().makeTranslation(m.tete.cx, m.busteY0, m.busteZ).multiply(new T.Matrix4().makeScale(k[0], k[1], k[2])); };
  function kitEtoileGrade(pr) { return { parts: porter([pc(etoile(2.7, 1.15, 0.9), 'etoile', { x: 5.4, y: 45, z: 10.4, ry: 0.45, rx: -0.25 }, 'accEtoile')], surBuste(pr)) }; }
  function kitSueur(pr) { return { parts: porter([pc(new T.SphereGeometry(1.6, 8, 6), 'sueur', { x: 10.6, y: 2, z: 3.2 }, 'accSueur'), pc(new T.ConeGeometry(1.5, 2.6, 8).translate(0, 1.3, 0), 'sueur', { x: 10.6, y: 2.6, z: 3.2 }, 'accSueur')], surTete(pr)) }; }
  function kitPate() { // le pâton qu'un apprenti pétrit au four : une boule de pâte aplatie, un peu de farine dessus ; l'origine au creux des mains
    return { parts: [pc(new T.SphereGeometry(4.4, 10, 7), 'pate', { y: -1.2, sx: 1.25, sy: 0.62 }, 'accPate'), pc(new T.SphereGeometry(1.1, 6, 4), 'blanc', { x: 1.6, y: 1.25, z: 0.8, sy: 0.35 }, 'accPate'), pc(new T.SphereGeometry(0.8, 6, 4), 'blanc', { x: -1.9, y: 1.1, z: -0.9, sy: 0.35 }, 'accPate')] };
  }
  function kitCle() { // la clé plate des chibis (src/persos.js) : le manche, l'anneau ouvert, sa mâchoire ; l'origine à la prise
    return { parts: [pc(new T.BoxGeometry(2.6, 13, 2).translate(0, 6.5, 0), 'cle', { y: -4 }, 'accCle'), pc(new T.CylinderGeometry(3.4, 3.4, 2, 10), 'cle', { y: 10, z: 1, rx: HP }, 'accCle'), pc(new T.BoxGeometry(2.2, 3.2, 2.4).translate(0, 1.6, 0), 'bord', { y: 10.6 }, 'accCle')] };
  }


  // ═══ ce que portent le boulanger et les apprentis ═══
  // l'id de chaque pièce portée : celui de la clé de la tenue (GAME.tenueBoulanger : « tête|haut|pieds|accessoire[|aura:…] »), sinon celui de sa
  // forme et de sa collection, sinon la pièce de base
  const PIECES4 = ['tete', 'haut', 'pieds', 'accessoire'], PODIUM = ['or', 'argent', 'bronze'];
  function idsDe(garde) {
    const out = {}, cles = garde && typeof garde.cle === 'string' ? garde.cle.split('|') : [], O = G.GARDEROBE.objets;
    PIECES4.forEach((p, i) => {
      const x = garde ? garde[p] : null, id = cles[i];
      if (id && O[id] && O[id].piece === p) out[p] = id;
      else if (x && x.forme) { const v = Object.values(O).find((o) => o.piece === p && o.forme === x.forme && o.collection === (x.metal || 'base')) || Object.values(O).find((o) => o.piece === p && o.forme === x.forme); out[p] = v ? v.id : G.GARDEROBE.base[p]; }
      else out[p] = garde && p === 'accessoire' ? null : G.GARDEROBE.base[p];
    });
    return out;
  }
  // le boulanger : sa tenue (ids, formes, collections) et son titre (le rang : la toque qui grandit à chaque titre, le liseré doré, le foulard du
  // titre, la moustache, le col tricolore), comme le chibi (src/persos.js, boulanger) ; nom : le nom de la boutique (ses initiales, brodées)
  const TOQUE_TITRE = [8, 22, 27, 32, 36, 40], BOUFFANT = [0.72, 0.86, 0.93, 1, 1.05, 1.1]; // la hauteur de la toque à chaque titre (unités des chibis ; le chibi s'arrête à 36 : la 3D grandit encore au dernier), et son bouffant
  function habitBoulanger(rang, garde, nom) {
    rang = Math.max(0, Math.min(5, rang || 0)); const ids = idsDe(garde), O = G.GARDEROBE.objets, vt = (p) => (ids[p] && O[ids[p]]) || null;
    const t = vt('tete'), hv = vt('haut'), pv = vt('pieds'), av = vt('accessoire'), fa = av ? av.forme : null;
    const h = { corps: 'Chef_Male', boulanger: true, rang, ids, peau: '#FFD7B5', cheveux: L, veste: '#FF6B8B', pantalon: '#3E3540', hc: TOQUE_TITRE[rang] - 8, nom: nom || '', mono: initiales(nom) };
    h.col = { tete: t ? t.collection : 'base', haut: hv ? hv.collection : 'base', pieds: pv ? pv.collection : 'base', acc: av ? av.collection : null };
    h.tete = t ? ({ toque: 'toque', casquette: 'casquette', chapeau: 'chapeau' }[t.forme] || 'toque') : 'toque';
    h.haut = hv && hv.id === 'chaine-veste' ? 'veste' : hv ? ({ tablier: 'tablier', sweat: 'sweat', cape: 'cape' }[hv.forme] || 'tablier') : 'tablier';
    h.pieds = pv && pv.id === 'chaine-souliers' ? 'souliers' : pv ? ({ chaussures: 'chaussures', baskets: 'baskets', bottes: 'bottes' }[pv.forme] || 'chaussures') : 'chaussures';
    h.acc = av && av.id === 'chaine-cles' ? 'cles' : fa === 'lunettes' ? null : ['foulard', 'chaine', 'lanterne'].includes(fa) ? fa : null;
    h.lunettes = fa === 'lunettes';
    h.galonOr = rang >= 4; h.moustache = rang >= 3; h.colTri = rang >= 5 && h.haut !== 'sweat';
    h.foulardTitre = rang >= 3 && h.acc !== 'foulard' && h.acc !== 'chaine'; // (la chaîne de cou prend sa place ; le trousseau, la lanterne, les lunettes le laissent)
    h.sueur = true; h.aura = (garde && garde.aura) || null; h.etoile = false; h.cle = false;
    h.cle0 = `${rang}|${garde ? garde.cle : ''}`;
    return h;
  }
  // les apprentis : toque et tablier blancs, la veste à la couleur de leur poste ; les grades (le biais du grade 2, l'étoile du 3, la toque
  // des 4 et 5, le liseré doré du 5) changent leurs couleurs et leurs os, pas leur géométrie
  const HABIT_APPRENTI = { tete: 'toque', hc: 6, haut: 'tablier', pieds: 'chaussures', acc: null, lunettes: false, moustache: false, colTri: false, foulardTitre: false, sueur: false, etoile: true, cle: true, pate: true, apprenti: true, col: { tete: 'base', haut: 'base', pieds: 'base', acc: null } };
  // la variante d'un kit, d'après la collection de sa pièce
  const varToque = (c) => (c === 'base' || !c ? 'base' : PODIUM.includes(c) || c === 'parcours' || c === 'chaine' ? c : 'metal');
  const varTablier = (c) => (c === 'base' || !c ? 'base' : PODIUM.includes(c) || c === 'parcours' ? c : 'metal');
  // les kits d'une tenue : [clé, emplacement, fabrique] ; la clé dit tout ce qui change la géométrie (les couleurs viennent de la palette)
  function kitsDe(h) {
    const l = [], app = !!h.apprenti, c = h.col;
    if (h.tete === 'toque') { const v = app ? 'base' : varToque(c.tete), g = app || (h.galonOr && v === 'base'), bf = app ? 1 : BOUFFANT[h.rang] || 1; l.push([`toque|${v}|${h.hc}|${g ? 'g' : ''}|${bf}`, 'T', (pr) => kitToque(pr, { hc: h.hc, v, galon: g, bouffant: bf })]); }
    else if (h.tete === 'casquette') { const v = c.tete === 'quartier-neon' ? 'neon' : c.tete === 'quartier-or' ? 'quartier-or' : 'quartier'; l.push([`casquette|${v}`, 'T', (pr) => kitCasquette(pr, { v })]); }
    else if (h.tete === 'chapeau') { const v = c.tete === 'hantee-lueur' ? 'lueur' : c.tete === 'hantee-or' ? 'hantee-or' : 'hantee'; l.push([`chapeau|${v}`, 'T', (pr) => kitChapeau(pr, { v })]); }
    if (h.haut === 'tablier') { const v = app ? 'apprenti' : varTablier(c.haut), mono = PODIUM.includes(v) ? h.mono : ''; l.push([`tablier|${v}|${mono}`, 'H', (pr) => kitTablier(pr, { v, mono, biais: app })]); }
    else if (h.haut === 'sweat') { const v = c.haut === 'quartier-or' ? 'quartier-or' : 'quartier'; l.push([`sweat|${v}`, 'H', (pr) => kitSweat(pr, { v })]); }
    else if (h.haut === 'cape') l.push(['cape', 'H', (pr) => kitCape(pr, {})]);
    else if (h.haut === 'veste') l.push(['veste', 'H', (pr) => kitVeste(pr, {})]);
    const vp = app ? 'apprenti' : h.pieds === 'souliers' ? 'souliers' : h.pieds === 'baskets' ? (c.pieds === 'quartier-or' ? 'baskets-or' : 'baskets-quartier') : h.pieds === 'bottes' ? (c.pieds === 'hantee-or' ? 'bottes-or' : 'bottes-hantee') : c.pieds === 'base' || !c.pieds ? 'sabots' : PODIUM.includes(c.pieds) || c.pieds === 'parcours' ? c.pieds : 'bronze';
    l.push([`pieds|${vp}`, 'P', (pr) => kitChaussures(pr, { v: vp })]);
    if (h.acc === 'foulard') { const v = PODIUM.includes(c.acc) || c.acc === 'parcours' ? c.acc : 'bronze'; l.push([`foulard|${v}`, 'A', (pr) => kitFoulard(pr, { v })]); }
    else if (h.acc === 'chaine') { const v = c.acc === 'quartier-or' ? 'quartier-or' : 'quartier'; l.push([`chaine|${v}`, 'A', (pr) => kitChaine(pr, { v })]); }
    else if (h.acc === 'lanterne') l.push(['lanterne', 'A', () => kitLanterne()]);
    else if (h.acc === 'cles') l.push(['cles', 'A', (pr) => kitCles(pr)]);
    if (h.lunettes) l.push(['lunettes', 'A', (pr) => kitLunettes(pr)]);
    if (h.foulardTitre) l.push(['foulard|titre', 'X', (pr) => kitFoulard(pr, { v: 'titre' })]);
    if (h.moustache) l.push(['moustache', 'X', (pr) => kitMoustache(pr)]);
    if (h.etoile) l.push(['etoile', 'X', (pr) => kitEtoileGrade(pr)]);
    if (h.sueur) l.push(['sueur', 'X', (pr) => kitSueur(pr)]);
    if (h.cle) l.push(['cle', 'X', () => kitCle()]);
    if (h.pate) l.push(['pate', 'X', () => kitPate()]);
    return l;
  }
  // un kit cuit, en cache par corps : le premier usage le bâtit ; ensuite, rien que des tableaux à recoller. cuireKit est un générateur (les
  // parts, puis leur émission à petits pas ; son temps de calcul compté sans les attentes entre deux images) : la préparation et la cuisson
  // d'avance le mènent pas à pas (cuireAvance) ; geometrieGen le mène là où on le porte, s'il n'est pas encore cuit (le kit commencé d'avance,
  // s'il l'est, est fini plutôt que recommencé)
  let cuisson = null; // le kit qui cuit d'avance : { pr, k0, gen }
  function* cuireKit(pr, cle, emp, faire) {
    let ms = 0, mf = 0, t0 = performance.now(), r = faire(pr);
    if (r && typeof r.next === 'function') { const gen = r; ms += performance.now() - t0; yield; t0 = performance.now(); for (;;) { const x = gen.next(), d = performance.now() - t0; ms += d; if (d > mf) mf = d; if (x.done) { r = x.value; break; } yield; t0 = performance.now(); } } // (un kit qui se bâtit à petits pas : le tablier, le sweat, la cape, les chaussures)
    else { mf = performance.now() - t0; ms += mf; }
    if (mf > (etat.msFaireMax || 0)) { etat.msFaireMax = Math.round(mf * 10) / 10; etat.faireLent = emp + '|' + cle; } // (le plus long pas de la construction d'un kit)
    yield;
    const g = emettre(pr, r.parts, emp); let x;
    for (;;) { t0 = performance.now(); x = g.next(); ms += performance.now() - t0; if (x.done) break; yield; }
    const k = x.value, k0 = emp + '|' + cle; k.info = r.info || null; k.cle = cle; k.emp = emp; k.ms = Math.round(ms * 10) / 10;
    pr.kits.set(k0, k); etat.kits++; etat.msKits = Math.round((etat.msKits + k.ms) * 10) / 10; if (k.ms > etat.msKitMax) { etat.msKitMax = k.ms; etat.kitLent = k0; }
    return k;
  }

  // les boutons de la veste du Chef (le masque « boutons » de geometrie) : chaque sommet et le centre de son bouton (ses sommets reliés), dans
  // l'espace du maillage ; une fois par corps
  function boutonsDe(pr) { if (pr.boutons) return pr.boutons; const g = boutonsGen(pr); let x; do x = g.next(); while (!x.done); return x.value; }
  function* boutonsGen(pr) { // (à petits pas : le masque, les liens des triangles, puis les boutons)
    if (pr.boutons) return pr.boutons; const m = pr.m, u = m.u, W = pr.W, n = pr.n, yCol = m.foulard.min.y - 0.01 * u, dans = new Uint8Array(n), pere = new Int32Array(n);
    const torse = new Uint8Array(pr.nbOs); for (let j = 0; j < pr.nbOs; j++) torse[j] = /Torso|Abdomen/.test(pr.nomOs(j)) ? 1 : 0;
    for (let k = 0; k < n; k++) { pere[k] = k; dans[k] = pr.R[k] === RI.peau && torse[pr.dom[k]] && W[k * 3 + 1] < yCol && W[k * 3 + 2] > m.busteZ + 0.07 * u ? 1 : 0; }
    yield;
    const chef = (i) => { while (pere[i] !== i) { pere[i] = pere[pere[i]]; i = pere[i]; } return i; };
    for (let k = 0; k < pr.I.length; k += 3) { const a = pr.I[k], b = pr.I[k + 1], c = pr.I[k + 2]; if (dans[a] && dans[b] && dans[c]) { pere[chef(b)] = chef(a); pere[chef(c)] = chef(a); } }
    yield;
    // (les sommets du maillage sont doublés aux arêtes vives : ceux d'un même point sont du même bouton)
    const vus = new Map(); for (let k = 0; k < n; k++) if (dans[k]) { const q = `${Math.round(W[k * 3] * 1e4)},${Math.round(W[k * 3 + 1] * 1e4)},${Math.round(W[k * 3 + 2] * 1e4)}`; if (vus.has(q)) pere[chef(k)] = chef(vus.get(q)); else vus.set(q, k); }
    yield;
    const somme = new Map(); for (let k = 0; k < n; k++) if (dans[k]) { const c = chef(k); let s = somme.get(c); if (!s) somme.set(c, (s = [0, 0, 0, 0])); s[0] += pr.P[k * 3]; s[1] += pr.P[k * 3 + 1]; s[2] += pr.P[k * 3 + 2]; s[3]++; }
    const boutons = []; for (let k = 0; k < n; k++) if (dans[k]) { const s = somme.get(chef(k)); boutons.push([k, new Float32Array([s[0] / s[3], s[1] / s[3], s[2] / s[3]])]); }
    pr.nBoutons = somme.size; return (pr.boutons = boutons);
  }

  // ═══ la géométrie d'une tenue : le corps (ses masques : les boutons, les poignets, l'ourlet, les pieds, le pantalon dans la botte, le col
  //     tricolore ; les cheveux cachés sous le couvre-chef retirés ou resserrés) et ses kits, recollés ═══
  // les masques du corps, une fois par corps (le pas « masques » de la préparation) : le rôle de chaque sommet sous les pièces — les pieds
  // chaussés (le dessus, la semelle), les boutons du Chef —, puis ceux qui changent selon la tenue : le pantalon rentré dans la botte, le col
  // tricolore (le blanc, le bleu, le rouge selon l'angle autour du cou)
  // (masques() d'un trait, en cache ; masquesGen() à petits pas : le pas « masques » de la préparation)
  function masques(pr) { if (pr.masques) return pr.masques; const g = masquesGen(pr); let x; do x = g.next(); while (!x.done); return x.value; }
  function* masquesGen(pr) {
    if (pr.masques) return pr.masques;
    const m = pr.m, u = m.u, W = pr.W, n0 = pr.n, rb = pr.R.slice(), pied0 = m.piedsY0, ch = m.chevilleY, hp = ch - pied0, yBotte = ch + (m.pantalon.max.y - ch) * 0.3, yCol = m.foulard.min.y - 0.01 * u, cxT = m.tete.cx, botte = [], col = [];
    const cl = new Uint8Array(pr.nbOs); for (let j = 0; j < pr.nbOs; j++) { const os = pr.nomOs(j); cl[j] = /LowerLeg/.test(os) ? 3 : /Foot/.test(os) ? 1 : /Torso|Abdomen/.test(os) ? 2 : 0; } // (par os : 1 le pied, 3 le tibia, 2 le torse)
    for (let k = 0; k < n0; k++) {
      const y = W[k * 3 + 1], c = cl[pr.dom[k]], r = rb[k];
      if (r === RI.peau && (c === 1 || c === 3)) rb[k] = y < pied0 + hp * 0.22 ? RI.semelleM : RI.chaussure;
      else if (r === RI.peau && c === 2 && y < yCol && W[k * 3 + 2] > m.busteZ + 0.07 * u) rb[k] = RI.boutons;
      else if (r === RI.pantalon && y < yBotte && c === 3) botte.push(k);
      else if (r === RI.foulard) { const a = Math.atan2(W[k * 3] - cxT, W[k * 3 + 2] - m.busteZ); col.push(k, Math.abs(a) > 2.3 || Math.abs(a) < 0.42 ? RI['X.blanc'] : a < 0 ? RI['X.bleu'] : RI['X.rouge']); }
      if ((k & 1023) === 1023 && souffle()) yield;
    }
    if (pr.masques) return pr.masques; // (bâtis d'un trait entre-temps, par une tenue portée plus tôt : ceux-là restent)
    return (pr.masques = { rb, botte: new Int32Array(botte), col: new Int32Array(col) });
  }
  // (geometrie() la bâtit d'un trait ; geometrieGen() à petits pas : les kits — cuits à petits pas s'il le faut —, le corps, puis l'assemblage)
  function geometrie(pr, h) { const g = geometrieGen(pr, h); let x; do x = g.next(); while (!x.done); return x.value; }
  function* geometrieGen(pr, h) {
    let ms = 0, tPas = performance.now(); const m = pr.m, u = m.u, n0 = pr.n, W = pr.W, mq = masques(pr), Rb = mq.rb.slice();
    const liste = kitsDe(h), kits = [];
    for (const [cle, emp, faire] of liste) { // (un kit pas encore cuit : cuit ici, à l'image où on le porte — celui qui cuisait d'avance est fini plutôt que recommencé)
      const k0 = emp + '|' + cle, k = pr.kits.get(k0); if (k) { kits.push(k); continue; }
      const c = cuisson && cuisson.pr === pr && cuisson.k0 === k0 ? cuisson : null; if (c) cuisson = null;
      ms += performance.now() - tPas; kits.push(yield* (c ? c.gen : cuireKit(pr, cle, emp, faire))); etat.surPlace++; tPas = performance.now();
    }
    if (h.pieds === 'bottes') for (let i = 0; i < mq.botte.length; i++) Rb[mq.botte[i]] = RI.botte;
    if (h.colTri) for (let i = 0; i < mq.col.length; i += 2) Rb[mq.col[i]] = mq.col[i + 1];
    // les cheveux qui dépassent sous le couvre-chef : ramenés vers l'axe de la tête près du bord (dans son rayon au bord, libres 0,1 plus bas) ;
    // ceux du dessus sont retirés (cachés dedans : des triangles en moins). Les longs cheveux d'une apprentie tombent encore sous la toque
    const info = (kits.find((k) => k.info && k.info.bord != null) || {}).info, bord = info ? info.bord : Infinity;
    let Pc = pr.P;
    if (info && info.rayon) {
      Pc = pr.P.slice(); const t = m.tete, rc = info.rayon, d = 0.1 * u;
      for (let k = 0; k < n0; k++) {
        if ((k & 1023) === 1023 && souffle()) { ms += performance.now() - tPas; yield; tPas = performance.now(); }
        if (Rb[k] !== RI.cheveux) continue; const y = W[k * 3 + 1]; if (y < bord - d) continue; const dx = W[k * 3] - t.cx, dz = W[k * 3 + 2] - t.cz, r = Math.hypot(dx, dz); if (r <= rc) continue;
        const uu = Math.min(1, (y - (bord - d)) / d), f = (rc + (r - rc) * (1 - uu * uu * (3 - 2 * uu))) / r; _v1.set(t.cx + dx * f, y, t.cz + dz * f).applyMatrix4(pr.iB); _v1.toArray(Pc, k * 3);
      }
    }
    // les boutons du Chef, sous le sweat et la veste de patron (elle a les siens) : chacun ramené à son centre (des triangles nuls, rien ne dépasse)
    if (h.haut === 'sweat' || h.haut === 'veste') { if (Pc === pr.P) Pc = pr.P.slice(); for (const [k, c] of boutonsDe(pr)) Pc.set(c, k * 3); }
    ms += performance.now() - tPas; yield; tPas = performance.now(); // (à petits pas : les masques, puis les triangles, puis l'assemblage ; chacun rend aussi la main l'heure passée)
    const I = [];
    for (let k = 0; k < pr.I.length; k += 3) {
      const a = pr.I[k], b = pr.I[k + 1], c = pr.I[k + 2]; if (!(Rb[a] === RI.cheveux && W[a * 3 + 1] > bord && W[b * 3 + 1] > bord && W[c * 3 + 1] > bord)) I.push(a, b, c);
      if (k % 3072 === 3069 && souffle()) { ms += performance.now() - tPas; yield; tPas = performance.now(); }
    }
    const nCorpsTris = I.length / 3;
    ms += performance.now() - tPas; yield; tPas = performance.now();
    // les kits, recollés à la suite du corps
    let n = n0; for (const k of kits) n += k.n;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C0 = new Float32Array(n * 3), R = new Uint8Array(n), MU = new Float32Array(n).fill(1), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), places = [];
    P.set(Pc); N.set(pr.N); C0.set(pr.C0); R.set(Rb); SI.set(pr.SI); SW.set(pr.SW);
    let o = n0;
    for (const k of kits) {
      P.set(k.P, o * 3); N.set(k.N, o * 3); C0.set(k.C, o * 3); R.set(k.R, o); MU.set(k.MU, o); SI.set(k.SI, o * 4); SW.set(k.SW, o * 4);
      const tA = I.length / 3; for (let i = 0; i < k.I.length; i++) I.push(o + k.I[i]); places.push({ cle: k.emp + '|' + k.cle, emp: k.emp, v0: o, v1: o + k.n, t0: tA, t1: I.length / 3 }); o += k.n;
      if (souffle()) { ms += performance.now() - tPas; yield; tPas = performance.now(); }
    }
    ms += performance.now() - tPas; yield; tPas = performance.now();
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('normal', new T.BufferAttribute(N, 3)); geo.setAttribute('skinIndex', new T.BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(SW, 4));
    geo.setAttribute('color', new T.BufferAttribute(new Uint16Array(n * 3), 3, true)); geo.setAttribute('lueur', new T.BufferAttribute(new Uint8Array(n * 4), 4, true));
    geo.setIndex(new T.BufferAttribute(n > 65535 ? new Uint32Array(I) : new Uint16Array(I), 1));
    if (souffle()) { ms += performance.now() - tPas; yield; tPas = performance.now(); } // (la sphère englobante : un tour de plus sur tous les sommets)
    geo.computeBoundingSphere();
    ms = Math.round((ms + performance.now() - tPas) * 10) / 10;
    etat.msRhabillage = ms; etat.msAssemblage = ms; etat.msRhabillageMax = Math.max(etat.msRhabillageMax || 0, ms); // (le temps de l'assemblage, sans les kits cuits ici ni les attentes entre deux images)
    const sommet = Math.max(m.tete.sommet, m.cheveux.max.y, ...kits.filter((k) => k.emp === 'T').map((k) => k.yMax)); // (le cadre de la vue : la tenue entière, chapeau pointu compris)
    return { geo, R, C0, MU, n, tris: I.length / 3, nCorps: n0, trisCorps: nCorpsTris, kits: places, ms, haut: (sommet - m.piedsY0) / m.H };
  }

  // ═══ les couleurs : une palette par tenue (une couleur par rôle ; null : sa couleur d'origine) et ses lueurs ([r, g, b, clignote] : ce qui
  //     brille, et s'il clignote) ═══
  function palette(h) {
    const TN = PERSOS.TENUES || {}, p = new Array(ROLES.length).fill(null), lu = new Array(ROLES.length).fill(null);
    const set = (role, hex, k) => { if (RI[role] != null && hex) p[RI[role]] = lin(hex, k); }, brille = (role, hex, k, cl) => { if (RI[role] != null) lu[RI[role]] = [...lin(hex, Math.min(1, (k || 1) / 2)), cl || 0]; };
    const pal = (c, d) => TN[c] || TN[d] || { tissu: BLANC, fonce: '#D9D2C6', clair: BLANC, bijou: OR }, c = h.col || {};
    // le corps
    set('peau', h.peau); set('yeux', clair(h.peau) < 0.25 ? '#1A120D' : '#3A2A22'); set('cheveux', h.cheveux); set('pantalon', h.pantalon);
    set('X.moustache', '#8C5A3C'); set('X.etoile', OR); set('X.sueur', '#9BD0FF'); set('X.cle', '#9A9A9A'); set('X.bord', L); set('X.tissu', '#3A2A22'); set('X.bleu', '#2B5BD7'); set('X.blanc', BLANC); set('X.rouge', ROUGE); set('X.pate', '#F1DCB0');
    // la tête
    if (h.tete === 'toque') {
      const v = h.apprenti ? 'base' : varToque(c.tete), t = v === 'base' ? null : pal(c.tete, 'or');
      set('T.tissu', t ? t.tissu : BLANC); set('T.fonce', t ? t.fonce : '#D9D2C6'); set('T.clair', t ? t.clair : BLANC); set('T.bijou', t ? t.bijou || OR : OR); set('T.galon', h.galonOr ? OR : BLANC); set('T.reflet', t ? M.melange(t.tissu, t.clair, 0.5) : BLANC); // (le reflet du métal : un pli à peine plus clair)
    } else if (h.tete === 'casquette') {
      const neon = c.tete === 'quartier-neon', t = pal(c.tete, 'quartier');
      set('T.tissu', t.tissu); set('T.fonce', t.fonce); set('T.clair', t.clair); set('T.bijou', t.bijou || OR); set('T.bord', M.assombrir(t.tissu, neon ? 0.55 : 0.35)); set('T.lueur', t.fonce);
      if (neon) brille('T.lueur', t.fonce, 1.5, 1);
    } else if (h.tete === 'chapeau') {
      const v = c.tete;
      if (v === 'hantee-or') { set('T.tissu', '#E9B33E'); set('T.fonce', '#1E1B26'); set('T.bijou', '#FFF2C2'); set('T.etoile', '#2A2233'); }
      else if (v === 'hantee-lueur') { const t = pal('hantee-lueur'); set('T.tissu', t.tissu); set('T.bijou', t.clair); set('T.lueur', t.fonce); brille('T.lueur', t.fonce, 1.6, 0); }
      else { const t = pal('hantee'); set('T.tissu', '#4A2E78'); set('T.fonce', t.fonce); set('T.bijou', OR); set('T.etoile', OR); }
    }
    // le haut : la veste (le Chef), sous le tablier ; le sweat ; la robe sous la cape ; la veste de patron
    let veste = h.veste, poignet = null, ourlet = null, band = null;
    if (h.haut === 'tablier') {
      const v = h.apprenti ? 'apprenti' : varTablier(c.haut), t = v === 'base' || v === 'apprenti' ? null : pal(c.haut, 'or'), biais = h.biaisOn ? M.assombrir(h.veste, 0.25) : BLANC;
      set('H.tissu', t ? t.tissu : BLANC); set('H.fonce', t ? t.fonce : '#D9D2C6'); set('H.clair', t ? t.clair : BLANC); set('H.bijou', t ? t.bijou || OR : OR); set('H.reflet', t ? M.melange(t.tissu, t.clair, 0.45) : BLANC);
      set('H.galon', h.galonOrH || (h.galonOr && !t && !h.apprenti) ? OR : t ? t.fonce : h.apprenti ? biais : BLANC); set('H.bord', h.apprenti ? biais : t ? t.fonce : '#ECE6DC'); set('H.poche', t ? M.melange(t.tissu, BLANC, 0.1) : '#FAF7F2'); set('H.broderie', t ? (c.haut === 'or' ? '#A8650E' : t.fonce) : '#D9D2C6');
    } else if (h.haut === 'sweat') {
      const t = pal(c.haut, 'quartier'); veste = t.tissu; poignet = t.fonce; ourlet = t.fonce; band = M.assombrir(t.tissu, 0.15);
      set('H.tissu', t.tissu); set('H.fonce', t.fonce); set('H.clair', c.haut === 'quartier-or' ? t.fonce : t.clair); set('H.bijou', c.haut === 'quartier-or' ? '#FFF2C2' : t.bijou || OR); set('H.poche', M.assombrir(t.tissu, 0.1)); set('H.doublure', t.fonce); set('H.bord', c.haut === 'quartier-or' ? t.fonce : M.assombrir(t.tissu, 0.35)); // (la doublure de la capuche : rose, ou or ; les rebords, les poignets et l'ourlet : sombres, ou or)
    } else if (h.haut === 'cape') {
      const or = c.haut === 'hantee-or'; veste = or ? '#3A3442' : '#5B3A8E'; band = or ? '#2A2531' : '#43296B';
      set('H.tissu', or ? '#1E1B26' : '#2C2342'); set('H.doublure', or ? '#FFC84A' : '#9A70E2'); set('H.bijou', OR);
    } else if (h.haut === 'veste') {
      const t = pal('chaine', 'bronze'); veste = t.tissu; poignet = t.bijou || OR; ourlet = M.assombrir(t.tissu, 0.18); band = t.fonce;
      set('H.bijou', t.bijou || OR); set('H.bord', M.assombrir(t.tissu, 0.38)); set('H.blanc', '#FFF8EC');
    }
    set('veste', veste); set('poignet', poignet || veste); set('ourletV', ourlet || veste);
    set('boutons', h.haut === 'tablier' ? '#F6EEDF' : h.haut === 'cape' ? OR : veste); // (les boutons du Chef : crème ; la robe de la cape : dorés ; le sweat et la veste de patron (ses gros boutons à elle) : cachés)
    // le col du Chef : le foulard noué (sa couleur), sinon la veste un peu plus sombre
    const coulFoulard = h.acc === 'foulard' ? (c.acc === 'parcours' ? M.melange(pal(c.acc, 'or').tissu, pal(c.acc, 'or').clair, 0.22) : M.melange(pal(c.acc, 'or').tissu, pal(c.acc, 'or').fonce, 0.6)) : h.foulardTitre ? ROUGE : null; // (le col noué, de la couleur du foulard)
    set('foulard', coulFoulard || band || M.assombrir(veste, 0.12));
    // les pieds
    const vp = h.apprenti ? 'apprenti' : h.pieds, cp = c.pieds;
    let dessus = '#D39A5C', dessous = '#8B5A3C', botte = null;
    if (vp === 'apprenti') { dessus = '#6B4A3A'; dessous = '#3E2C22'; set('P.tissu', dessus); set('P.semelle', dessous); set('P.clair', dessus); }
    else if (vp === 'souliers') { dessus = '#17131C'; dessous = '#2A1E24'; set('P.tissu', dessus); set('P.reflet', '#D9D4E6'); set('P.bord', '#7B2D42'); set('P.semelle', dessous); }
    else if (vp === 'baskets') { const or = cp === 'quartier-or'; dessus = or ? '#1E1B26' : '#F2EEE6'; dessous = or ? '#FFC84A' : BLANC; set('P.tissu', dessus); set('P.clair', or ? '#2E2A38' : '#E6E0D5'); set('P.blanc', or ? '#FFC84A' : BLANC); set('P.fonce', or ? '#FFC84A' : '#E1496C'); set('P.semelle', dessous); }
    else if (vp === 'bottes') { const or = cp === 'hantee-or'; dessus = or ? '#E9B33E' : '#3A2560'; dessous = or ? '#1E1B26' : '#1E1530'; botte = dessus; set('P.tissu', dessus); set('P.fonce', or ? '#1E1B26' : '#FF8A3D'); set('P.bijou', or ? '#FFF2C2' : OR); set('P.semelle', dessous); }
    else if (cp && cp !== 'base') { const t = pal(cp, 'bronze'); dessus = t.tissu; dessous = t.fonce; set('P.tissu', t.tissu); set('P.clair', cp === 'parcours' ? M.melange(t.tissu, t.clair, 0.38) : t.clair); set('P.semelle', M.assombrir(t.fonce, 0.15)); set('P.lacet', cp === 'parcours' ? t.fonce : M.assombrir(t.fonce, 0.1)); set('P.fonce', t.fonce); set('P.bijou', t.bijou || OR); set('P.gris', M.melange(t.tissu, '#9AA3B2', 0.45)); }
    else { set('P.bois', '#D39A5C'); set('P.fonce', '#A86E3C'); set('P.cuir', '#6B3A22'); set('P.semelle', '#8B5A3C'); } // les sabots de bois (le fil du bois, plus sombre)
    set('chaussure', dessus); set('semelleM', dessous); set('botte', botte || h.pantalon);
    // l'accessoire
    if (h.acc === 'foulard' || h.foulardTitre) {
      const t = h.acc === 'foulard' ? pal(c.acc, 'or') : null, emp = h.acc === 'foulard' ? 'A' : 'X';
      const parc = c.acc === 'parcours', corps = t ? (parc ? M.melange(t.tissu, t.clair, 0.22) : M.melange(t.tissu, t.fonce, 0.6)) : ROUGE; // (le corps du foulard : un ton plus profond que le tablier du même métal ; son liseré clair, ou cuivré)
      set(emp + '.tissu', corps); set(emp + '.fonce', t ? t.fonce : '#A8243F'); set(emp + '.bord', t ? (parc ? t.fonce : M.melange(t.clair, BLANC, 0.3)) : '#A8243F'); set(emp + '.clair', t ? M.melange(t.clair, BLANC, 0.4) : '#FFD0D8'); set(emp + '.bijou', t ? (parc ? t.fonce : c.acc === 'or' ? '#FFF2C2' : t.bijou || OR) : OR);
    }
    if (h.acc === 'chaine') { const or = c.acc === 'quartier-or'; set('A.bijou', or ? '#FFC84A' : '#D3DCE6'); set('A.clair', or ? '#FFF2C2' : '#FFFFFF'); set('A.fonce', '#E1496C'); set('A.rouge', '#E1496C'); set('A.eclat', '#FFFFFF'); brille('A.eclat', '#FFFFFF', 1.6, 0); }
    if (h.acc === 'lanterne') { const or = c.acc === 'hantee-or'; set('A.citrouille', or ? OR : '#FF8A3D'); set('A.fonce', or ? '#1E1B26' : L); set('A.oeil', or ? '#FFF6D0' : '#FFD27A'); brille('A.oeil', or ? '#FFE9A0' : '#FFB347', 1.7, 0.3); }
    if (h.lunettes) set('A.tissu', '#3A2A22');
    if (h.acc === 'cles') { set('A.bijou', '#E8B04A'); set('A.clair', '#F3D27C'); set('A.gris', '#C9CED6'); set('A.cuir', '#5A1E2C'); }
    return { couleurs: p, lueurs: lu };
  }
  function teindre(geo, R, C0, MU, pal) { // la couleur de chaque sommet : son rôle dans la palette (× sa nuance), sinon sa couleur d'origine ; sa lueur
    const col = geo.attributes.color, d = col.array, lu = geo.attributes.lueur, dl = lu ? lu.array : null, P = pal.couleurs, Lu = pal.lueurs;
    for (let i = 0; i < R.length; i++) {
      const p = P[R[i]], k = MU[i] * 65535;
      if (p) { d[i * 3] = Math.min(65535, p[0] * k); d[i * 3 + 1] = Math.min(65535, p[1] * k); d[i * 3 + 2] = Math.min(65535, p[2] * k); } else { d[i * 3] = C0[i * 3] * 65535; d[i * 3 + 1] = C0[i * 3 + 1] * 65535; d[i * 3 + 2] = C0[i * 3 + 2] * 65535; }
      if (dl) { const g = Lu[R[i]]; if (g) { dl[i * 4] = g[0] * 255; dl[i * 4 + 1] = g[1] * 255; dl[i * 4 + 2] = g[2] * 255; dl[i * 4 + 3] = g[3] * 255; } else dl[i * 4] = dl[i * 4 + 1] = dl[i * 4 + 2] = dl[i * 4 + 3] = 0; }
    }
    col.needsUpdate = true; if (lu) lu.needsUpdate = true;
  }
  // la lueur dans le matériau partagé : un attribut par sommet (« lueur » : sa couleur, et s'il clignote), ajouté à l'émission du programme ;
  // uLueur : le clignotement du moment (le même pour tous ; ce qui ne clignote pas l'ignore). Le jumeau MeshStandard de src/scene.js reprend le
  // même ajout (userData.lueur)
  const U_LUEUR = { value: 1 };
  function lumineux(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLueur = U_LUEUR;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 lueur;\nvarying vec4 vLueur;').replace('#include <color_vertex>', '#include <color_vertex>\n\tvLueur = lueur;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vLueur;\nuniform float uLueur;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vLueur.rgb * mix( 1.0, uLueur, vLueur.a ) * 2.0;');
    };
    mat.customProgramCacheKey = () => 'equipe3d-lueur'; mat.userData.lueur = true;
    return mat;
  }
  // le clignotement : surtout allumé, un frémissement, et de temps en temps un raté (deux battements éteints)
  function clignote(t) { const c = t % 3.7; return c > 3.42 && c < 3.5 ? 0.12 : c > 3.56 && c < 3.62 ? 0.25 : 0.86 + 0.14 * Math.sin(t * 9.3) * Math.sin(t * 2.1); }


  // ═══ les clips : ceux des clients (Idle, Walk, Victory…) et ceux de l'équipe ; la joie, la réparation : le haut du corps ═══
  const CL = {};
  function clips(...listes) {
    for (const l of listes) for (const c of l) CL[c.name] = c;
    const haut = (c, nom) => new T.AnimationClip(nom, c.duration, c.tracks.filter((t) => !OS.basDuCorps.test(t.name.split('.')[0])));
    if (CL.Cheering) CL.__joie = haut(CL.Cheering, 'joie'); else if (CL.Victory) CL.__joie = haut(CL.Victory, 'joie');
    if (CL.Hammering) CL.__repare = haut(CL.Hammering, 'repare');
  }

  // ═══ la préparation, à petits pas (src/scene.js l'appelle à chaque image, tant que l'image n'a pas passé 3 ms, un pas au moins) : les clips ;
  //     chaque corps, une partie par pas (ses parties, ses positions, ses mesures, sa façade — par paquets de triangles —, son gabarit, sa
  //     marche), ce que les pièces lisent du corps (sa façade de dos, ses contours, ses épaules, les boutons du Chef, ses masques) ; les kits des
  //     apprentis, chacun à petits pas (les grands kits — tablier, sweat, cape, chaussures — se bâtissent eux-mêmes par morceaux, puis leurs
  //     sommets s'émettent 64 par 64), leur géométrie partagée ; la réserve, un acteur par pas ; enfin le boulanger de la partie : les kits de sa
  //     tenue portée, son acteur, sa géométrie (en trois pas). Aucun pas ne dépasse ainsi quelques millisecondes : le processeur ralenti ×4,
  //     aucune image ne passe plus de 30 ms dans l'équipe (test/fournil-equipe3d.cjs). src/scene.js montre ensuite le boulanger à une image,
  //     puis un apprenti par image. Prêt, il cuit encore à l'avance, à petits pas (quelques millisecondes par image, pas aux images où l'équipe
  //     passe en 3D), les pièces que le boulanger possède et la toque de son titre suivant (st, rang, nom : sa partie, que src/scene.js lui
  //     passe à chaque image ; une pièce gagnée est cuite dans les images qui suivent, la porter ou changer de titre ne bâtit alors plus rien) ═══
  const PROTOS = {}; let iCuit = 0, enCours = null, echec = false, aRemplir = false, clipsLus = false, geoApp = 0, avance = null, pasKit = null, prepB = null;
  const AVANCE = [], BUDGET = 3; // les kits à cuire à l'avance : [corps, clé, emplacement, fabrique] ; la préparation : 3 ms par image (un pas au moins)
  const partie = { st: null, rang: 0, nom: '' }; // (la partie que montre la boutique : son boulanger est préparé avec le reste)
  // (les cinq plus longs pas de la préparation, pour la mise au point : etat.pasLents, [[ms, pas], …])
  function noterPas(d, quoi) { const l = etat.pasLents || (etat.pasLents = []); if (l.length < 5 || d > l[l.length - 1][0]) { l.push([Math.round(d * 10) / 10, quoi]); l.sort((a, b) => b[0] - a[0]); if (l.length > 5) l.length = 5; } }
  function preparer(st, rang, nom) {
    if (st) { partie.st = st; partie.rang = Math.max(0, Math.min(5, rang || 0)); partie.nom = nom || ''; }
    if (API.pret) {
      if (aRemplir) { finPas = performance.now() + PAS_MS; try { remplir(); } finally { finPas = Infinity; } }
      else { if (st) prevoir(st, rang, nom); cuireAvance(3); }
      return true;
    }
    if (echec || !HDM.pret('equipe')) return false;
    const t0 = performance.now();
    try { do { const t1 = performance.now(); finPas = t1 + PAS_MS; const quoi = etape(), d = performance.now() - t1; if (d > (etat.pasMax || 0)) { etat.pasMax = Math.round(d * 10) / 10; etat.pasLent = quoi; } noterPas(d, quoi); } while (!API.pret && performance.now() - t0 < BUDGET); }
    catch (e) { echec = true; API.erreur = String((e && e.message) || e); console.warn('Équipe 3D : pas préparée, les chibis restent', API.erreur); }
    finally { finPas = Infinity; }
    const ms = performance.now() - t0; etat.msCuisson = Math.round(etat.msCuisson + ms); etat.msImageMax = Math.max(etat.msImageMax || 0, Math.round(ms)); etat.images = (etat.images || 0) + 1;
    return API.pret;
  }
  function etape() {
    if (!clipsLus) { const a = HDM.clients('anims'), b = HDM.equipe('anims-equipe'); if (!a || !b) throw new Error('clips manquants'); clips(a.animations, b.animations); clipsLus = true; return 'clips'; }
    if (enCours) { const r = enCours.next(); if (r.done) { PROTOS[r.value.nom] = r.value; enCours = null; } return 'cuisson ' + (r.done ? r.value.nom : r.value || ''); }
    if (iCuit < CORPS.length) { const nom = CORPS[iCuit++], g = HDM.equipe(nom); if (g) enCours = cuire(nom, g); return 'lecture ' + nom; }
    if (!PROTOS.Chef_Male) throw new Error('pas de corps pour le boulanger');
    if (!API.info) { const ref = Math.min(...Object.values(PROTOS).map((p) => p.hauteur)); for (const p of Object.values(PROTOS)) p.echelle = ref / p.hauteur; API.info = { corps: Object.values(PROTOS).map((p) => ({ nom: p.nom, sommets: p.n, tris: p.I.length / 3, hauteur: +p.hauteur.toFixed(3) })) }; return 'mesures'; }
    const noms = Object.keys(PROTOS);
    if (!avance) { // ce que les pièces lisent du corps, un morceau par pas ; puis les kits des apprentis, chacun à petits pas (un générateur)
      avance = [];
      for (const nom of noms) { const pr = PROTOS[nom]; avance.push(['façade ' + nom, () => facadeGen(pr, 1)], ['dos ' + nom, () => facadeGen(pr, -1)], ['proches ' + nom, () => prochesGen(pr)], ['contour taille ' + nom, () => contour(pr, /^(Torso|Abdomen|Hips|Body)/, 'taille')], ['contour haut ' + nom, () => contour(pr, /^(Torso|Neck|Shoulder|Abdomen)/, 'haut')], ['contour cape ' + nom, () => contour(pr, /^(Torso|Abdomen|Hips|Body|Neck|Shoulder|UpperLeg)/, 'cape')], ['épaules ' + nom, () => toitGen(pr)], ['boutons ' + nom, () => boutonsGen(pr)], ['masques ' + nom, () => masquesGen(pr)]); for (const [cle, emp, faire] of kitsDe(HABIT_APPRENTI)) avance.push(['kit ' + emp + '|' + cle + ' ' + nom, () => (pr.kits.has(emp + '|' + cle) ? null : cuireKit(pr, cle, emp, faire))]); }
    }
    if (pasKit) { if (pasKit.gen.next().done) pasKit = null; return pasKit ? pasKit.quoi : 'pas fini'; }
    const lancer = (l) => { const [quoi, f] = l.shift(), gen = f(); if (gen && typeof gen.next === 'function') pasKit = { quoi, gen }; return quoi; }; // (un générateur : mené aux pas suivants)
    if (avance.length) return lancer(avance);
    if (geoApp < noms.length) { const pr = PROTOS[noms[geoApp++]]; pasKit = { quoi: 'apprentis ' + pr.nom, gen: (function* () { pr.app = yield* geometrieGen(pr, HABIT_APPRENTI); pr.app.geo.userData.partagee = true; })() }; return 'apprentis ' + pr.nom; }
    for (const nom of noms) { const l = LIBRES.get(nom) || []; LIBRES.set(nom, l); if (TOUS.filter((a) => a.pr.nom === nom && !a.boul).length < RESERVE) { l.push(creerApprenti(PROTOS[nom])); return 'réserve'; } }
    // le boulanger de la partie : les kits de sa tenue portée (à petits pas), son acteur, puis sa géométrie ; la boutique le montre ensuite sans
    // rien bâtir (une tenue changée entre-temps est faite à l'image où elle se voit, comme d'habitude)
    if (!prepB) { prepB = listeBoulanger(); return 'tenue du boulanger'; }
    if (prepB.length) return lancer(prepB);
    etat.chauffe = false; API.pret = true; return 'prêt';
  }
  // les pas qui préparent le boulanger de la partie : ses kits pas encore cuits (sa tenue au titre du moment, et au suivant : la toque qui
  // grandit), son acteur, sa géométrie (un générateur)
  function listeBoulanger() {
    const pr = PROTOS.Chef_Male, l = [], vus = new Set(); if (!pr || !partie.st) return l;
    const garde = G.tenueBoulanger(partie.st);
    for (const r of partie.rang < 5 ? [partie.rang, partie.rang + 1] : [partie.rang]) for (const [c, emp, faire] of kitsDe(habitBoulanger(r, garde, partie.nom))) { const k0 = emp + '|' + c; if (pr.kits.has(k0) || vus.has(k0)) continue; vus.add(k0); l.push(['kit ' + k0 + ' boulanger', () => (pr.kits.has(k0) ? null : cuireKit(pr, c, emp, faire))]); }
    l.push(['boulanger', () => { if (!BOUL) creerBoulanger(); }], ['habit du boulanger', () => (partie.st && BOUL ? rhabillerGen(BOUL, partie.rang, G.tenueBoulanger(partie.st), partie.nom) : null)]);
    return l;
  }
  // ce qui est à cuire à l'avance pour le boulanger de st : sa tenue portée d'abord, puis chaque pièce qu'il possède (portée avec les pièces de
  // base : un kit ne dépend que de sa pièce, du titre et du nom de la boutique) ; au titre du moment, puis au suivant (la toque qui grandit, la
  // moustache et le foulard du titre). Revu dès que la garde-robe (sa version), le titre ou le nom changent : à chaque image, la clé seule
  let vuAvance = '';
  function prevoir(st, rang, nom) {
    const pr = PROTOS.Chef_Male; if (!pr || !st) return; rang = Math.max(0, Math.min(5, rang || 0)); nom = nom || '';
    const g = G.garderobe(st), k = `${g.v}|${Object.keys(g.objets).length}|${rang}|${nom}`; if (k === vuAvance) return; vuAvance = k;
    const O = G.GARDEROBE.objets, deja = new Set(AVANCE.map((x) => x[2] + '|' + x[1])); if (cuisson) deja.add(cuisson.k0);
    const ajouter = (h) => { for (const [c, emp, faire] of kitsDe(h)) { const k0 = emp + '|' + c; if (!pr.kits.has(k0) && !deja.has(k0)) { deja.add(k0); AVANCE.push([pr, c, emp, faire]); } } };
    for (const r of rang < 5 ? [rang, rang + 1] : [rang]) {
      ajouter(habitBoulanger(r, G.tenueBoulanger(st), nom));
      for (const id of Object.keys(g.objets)) { const v = O[id]; if (v) ajouter(habitBoulanger(r, { cle: PIECES4.map((p) => (p === v.piece ? id : p === 'accessoire' ? '' : G.GARDEROBE.base[p])).join('|') }, nom)); }
    }
  }
  // la cuisson d'avance, à petits pas : budget ms au plus par image (un pas au moins), le kit commencé d'abord
  function cuireAvance(budget) {
    if (!cuisson && !AVANCE.length) { etat.msAvance = 0; return; }
    const t0 = performance.now();
    try {
      do {
        if (!cuisson) { const [pr, cle, emp, faire] = AVANCE.shift(); if (pr.kits.has(emp + '|' + cle)) continue; cuisson = { pr, k0: emp + '|' + cle, gen: cuireKit(pr, cle, emp, faire) }; }
        finPas = performance.now() + PAS_MS; // (le pas rend la main l'heure passée, comme ceux de la préparation)
        if (cuisson.gen.next().done) { cuisson = null; etat.avance++; }
      } while ((cuisson || AVANCE.length) && performance.now() - t0 < budget);
    } finally { finPas = Infinity; }
    const ms = Math.round((performance.now() - t0) * 10) / 10; etat.msAvance = ms; etat.imagesAvance++; if (ms > etat.msAvanceMax) etat.msAvanceMax = ms;
  }

  // ═══ les acteurs : un clone du gabarit, sa géométrie (les attributs partagés de celle des apprentis, sa couleur ; ou la sienne pour le
  //     boulanger), son mélangeur ═══
  const MAT = { lambert: null };
  function materiau() { if (!MAT.lambert) { MAT.lambert = lumineux(new T.MeshLambertMaterial({ vertexColors: true })); M.partager(MAT.lambert); } return MAT.lambert; }
  const LIBRES = new Map(), TOUS = []; const RESERVE = 2; let nGraines = 0;
  function squelette(pr) { // (sa graine : le décalage de ses clips et de ses gestes ; sans Math.random, qui reste à la vie de la boutique)
    const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; });
    S.material = materiau(); S.castShadow = true; S.frustumCulled = false; g.visible = false;
    const nomme = (n) => g.getObjectByName(n), a = { g, S, pr, mixer: new T.AnimationMixer(g), actions: {}, joue: '', couches: {}, yaw: 0, graine: (0.17 + 0.618034 * nGraines++) % 1 };
    a.os = { tete: nomme(OS.tete), cou: nomme(OS.cou), torse: nomme(OS.torse), bassin: nomme(OS.bassin), mainD: nomme(OS.mainD), mainG: nomme(OS.mainG), avantD: nomme(OS.avantD), avantG: nomme(OS.avantG), brasD: nomme(OS.brasD), brasG: nomme(OS.brasG), toque: nomme('accToque'), toqueHaut: nomme('accToqueHaut'), sueur: nomme('accSueur'), etoile: nomme('accEtoile'), lanterne: nomme('accLanterne'), cle: nomme('accCle'), cape: nomme('accCape'), cles: nomme('accCles'), eclat: nomme('accEclat'), pate: nomme('accPate') };
    a.sauve = [a.os.brasD, a.os.avantD, a.os.mainD, a.os.brasG, a.os.avantG, a.os.mainG, a.os.tete, a.os.cou, a.os.torse].filter(Boolean).map((b) => [b, b.quaternion.clone(), b.position.clone()]);
    TOUS.push(a); etat.acteurs = TOUS.length; return a;
  }
  function creerApprenti(pr) {
    const a = squelette(pr), src = pr.app.geo, geo = new T.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'lueur']) geo.setAttribute(k, src.attributes[k]);
    geo.setIndex(src.index); geo.boundingSphere = src.boundingSphere; geo.setAttribute('color', new T.BufferAttribute(new Uint16Array(pr.app.n * 3), 3, true));
    a.S.geometry = geo; a.habit = pr.app; a.g.userData.e3d = a; a.g.userData.cle = 'e3d'; return a;
  }
  // la réserve rendue (la HD interdite plus de 10 s), puis permise de nouveau : un acteur par image, puis le boulanger (son acteur, puis sa
  // géométrie, à petits pas), avant d'être chauffée
  let pasRemplir = null;
  function remplir() {
    for (const nom of Object.keys(PROTOS)) { const l = LIBRES.get(nom) || []; LIBRES.set(nom, l); if (TOUS.filter((a) => a.pr.nom === nom && !a.boul).length < RESERVE) { l.push(creerApprenti(PROTOS[nom])); return; } }
    if (pasRemplir) { if (pasRemplir.next().done) pasRemplir = null; return; }
    if (!BOUL && PROTOS.Chef_Male && partie.st) { creerBoulanger(); pasRemplir = rhabillerGen(BOUL, partie.rang, G.tenueBoulanger(partie.st), partie.nom); return; }
    aRemplir = false; etat.chauffe = false;
  }

  // ─── le boulanger : un seul acteur, rhabillé sur place (sa géométrie refaite, l'ancienne rendue ; même squelette, même mélangeur). Préparé
  //     avec le reste (la tenue de la partie), il n'est d'habitude plus à bâtir quand la boutique le montre ───
  let BOUL = null;
  function creerBoulanger() { BOUL = squelette(PROTOS.Chef_Male); BOUL.boul = true; BOUL.g.userData.e3d = BOUL; BOUL.g.userData.cle = 'e3d-boulanger'; return BOUL; }
  function boulanger(rang, garde, nom, st) {
    if (!API.pret || !PROTOS.Chef_Male) return null;
    if (!BOUL) creerBoulanger(); if (pasRemplir) pasRemplir = null; // (montré avant la fin de son habillage à petits pas : fini ici)
    rhabiller(BOUL, rang, garde, nom); BOUL.g.visible = true; if (!BOUL.service) { BOUL.service = true; etat.enService++; } // (rhabillé sur place : compté une fois)
    if (st) prevoir(st, rang, nom);
    return BOUL;
  }
  // (rhabiller() d'un trait ; rhabillerGen() à petits pas : la géométrie, puis les couleurs)
  function rhabiller(a, rang, garde, nom) { const g = rhabillerGen(a, rang, garde, nom); let x; do x = g.next(); while (!x.done); return x.value; }
  function* rhabillerGen(a, rang, garde, nom) {
    const h = habitBoulanger(rang, garde, nom), cles = kitsDe(h).map((k) => k[1] + '|' + k[0]).join(';'); if (a.cleHabit === h.cle0 && a.clesKits === cles && a.habit) return false;
    const x = yield* geometrieGen(a.pr, h); yield;
    const vieux = a.S.geometry; a.S.geometry = x.geo; if (vieux && !vieux.userData.partagee && vieux !== x.geo) vieux.dispose();
    teindre(x.geo, x.R, x.C0, x.MU, palette(h));
    a.habit = x; a.h = h; a.cleHabit = h.cle0; a.clesKits = cles; etat.rhabillages++;
    // l'aura : un plan dressé derrière lui (un appel de dessin de plus), qui respire ; posé à chaque rendu face à la caméra (poserAura), dessiné
    // juste avant lui (son ordre : 1, le sien : 2 ; tout le reste de la boutique avant eux)
    if (h.aura && !a.aura) { a.aura = new T.Mesh(new T.PlaneGeometry(1, 1), auraMat()); a.aura.renderOrder = 1; a.S.renderOrder = 2; a.aura.frustumCulled = false; a.aura.castShadow = false; a.aura.receiveShadow = false; a.aura.userData.acteur = a; a.aura.onBeforeRender = poserAura; a.g.add(a.aura); }
    else if (!h.aura && a.aura) { a.g.remove(a.aura); a.aura.geometry.dispose(); a.aura.material.dispose(); a.aura = null; }
    a.g.userData.tenue = garde && garde.tete && PODIUM.includes(garde.tete.metal) ? garde.tete.metal : null; a.g.userData.garde = garde || null;
    a.g.userData.parts = { aura: a.aura || null };
    // les os à ressort et l'éclat, remis au repos
    a.ressorts = { cape: { x: 0, z: 0, vx: 0, vz: 0, tw: 0 }, cles: { x: 0, z: 0, vx: 0, vz: 0 }, p: null, v: null, yaw: a.yaw };
    for (const b of [a.os.cape, a.os.cles]) if (b) b.quaternion.identity();
    if (a.os.eclat) a.os.eclat.scale.setScalar(0);
    return true;
  }
  // ─── un apprenti : pris dans la réserve de son corps (une apprentie : Chef_Female), sinon un nouveau ; ses couleurs ───
  function apprenti(ap) {
    if (!API.pret) return null;
    const nom = FEMMES.has(ap.i) && PROTOS.Chef_Female ? 'Chef_Female' : 'Chef_Male', pr = PROTOS[nom]; if (!pr) return null;
    const l = LIBRES.get(nom); let a = l && l.length ? l.pop() : null; if (!a) a = creerApprenti(pr);
    a.c = 'a' + ap.i; a.i = ap.i; a.grade = 0; a.etatP = ''; a.panneT = 0; a.xp = null; a.zp = null; a.vitesse = 0; a.capMarche = null; a.neuf = true; a.yaw = YAW[ap.dir] || 0; a.joue = '';
    a.g.visible = true; a.g.rotation.set(0, a.yaw, 0); habillerApprenti(a, ap.grade || 1);
    jouer(a, 'Idle', 0); a.mixer.update(0.01 + a.graine * 2);
    for (const sv of a.sauve) { sv[1].copy(sv[0].quaternion); sv[2].copy(sv[0].position); }
    a.service = true; etat.enService++; return a;
  }
  function habillerApprenti(a, grade) {
    if (a.grade === grade) return; a.grade = grade;
    const V = typeof VIE !== 'undefined' ? VIE : null, i = a.i, h = Object.assign({}, HABIT_APPRENTI, { peau: V ? V.PEAUX6[i % 6] : '#FFD7B5', cheveux: V ? V.CHEVEUX[i % V.CHEVEUX.length] : L, veste: V ? V.HAUTS6[(i * 2 + 1) % 6] : '#FF9FB2', pantalon: '#3E3540', galonOr: grade >= 5, galonOrH: grade >= 5, biaisOn: grade >= 2 });
    teindre(a.S.geometry, a.habit.R, a.habit.C0, a.habit.MU, palette(h));
    a.os.etoile.scale.setScalar(grade >= 3 ? 1 : 0);
    a.os.toqueHaut.position.copy(a.pr.hautTete).multiplyScalar(hautFutPlus(a.pr, grade >= 5 ? 10 : grade >= 4 ? 6 : 0)); // la toque grandit aux grades 4 et 5 (+6, +10 unités des chibis)
  }
  function rendre(a) {
    if (!a) return; a.mixer.stopAllAction(); a.joue = ''; a.couches = {}; a.g.visible = false; if (a.g.parent) a.g.parent.remove(a.g);
    if (a.plateau) { a.g.remove(a.plateau); a.plateau = null; }
    if (a.service) { a.service = false; etat.enService = Math.max(0, etat.enService - 1); }
    if (a.boul) return; // (le boulanger garde sa géométrie : il revient tel quel)
    a.c = 0; for (const b of [a.os.cle, a.os.lanterne, a.os.pate]) if (b) b.scale.setScalar(0);
    const l = LIBRES.get(a.pr.nom) || []; l.push(a); LIBRES.set(a.pr.nom, l);
  }
  function liberer() { // la HD interdite depuis 10 s (src/scene.js) : la réserve et le boulanger rendent leur mémoire (les gabarits et les kits restent)
    if (!TOUS.length || TOUS.some((a) => a.g.visible && a.g.parent)) return false;
    for (const a of TOUS) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.S.skeleton.dispose(); a.S.geometry.dispose(); if (a.aura) { a.aura.geometry.dispose(); a.aura.material.dispose(); } if (a.g.parent) a.g.parent.remove(a.g); }
    TOUS.length = 0; LIBRES.clear(); BOUL = null; etat.acteurs = 0; etat.liberes++; aRemplir = true; return true;
  }
  function chauffer() { if (etat.chauffe || !API.pret) return null; const gs = []; for (const l of LIBRES.values()) for (const a of l) { a.g.position.set(0, -5000, 0); a.g.scale.setScalar(1); a.g.visible = true; gs.push(a.g); } etat.chauffe = true; etat.chauffes = (etat.chauffes || 0) + 1; return gs; }
  function rentrer(gs) { for (const g of gs || []) { const a = g.userData.e3d; if (a && a.c) continue; if (g.parent) g.parent.remove(g); g.visible = false; } }
  function echantillon() { for (const l of LIBRES.values()) if (l.length) return l[0].g; return null; }

  // ─── l'aura phosphorescente : un halo vert qui respire autour de lui, plus vif sur son pourtour, piqué de petites lueurs. Un plan dressé, qui
  //     ne tourne qu'autour de la verticale, face à la caméra, posé derrière lui (penché face à la caméra plongeante de la boutique, comme un
  //     sprite, sa moitié basse passerait devant lui et le teindrait de vert). Il est dessiné parmi les objets opaques, juste avant lui, sans
  //     écrire la profondeur : ce qui est devant lui le cache, le boulanger passe par-dessus (rien de lui n'est jamais teint, pas même la
  //     visière, la cape ou le chapeau qui dépassent derrière), le mélange est celui d'un objet transparent ───
  let TEX_AURA = null;
  function auraMat() {
    if (!TEX_AURA) {
      TEX_AURA = M.texture((c, w, h) => {
        const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(0.4, 'rgba(255,255,255,.4)'); g.addColorStop(0.64, 'rgba(255,255,255,.46)'); g.addColorStop(0.78, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        for (let k = 0; k < 12; k++) { const a = k * 2.399, r = w * (0.3 + 0.1 * ((k * 7) % 5) / 4), x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r, s = w * (0.005 + 0.003 * (k % 3)), gg = c.createRadialGradient(x, y, 0, x, y, s * 2.5); gg.addColorStop(0, 'rgba(255,255,255,.75)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gg; c.fillRect(x - s * 2.5, y - s * 2.5, s * 5, s * 5); }
      }, 128, 128); TEX_AURA.userData.partagee = true;
    }
    return new T.MeshBasicMaterial({ map: TEX_AURA, color: '#7CFF6B', opacity: 0.44, transparent: false, depthWrite: false, blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor });
  }
  // l'aura, posée à chaque rendu (onBeforeRender : la caméra de ce rendu, celle de la boutique ou celle de la vue) : dressée, tournée vers la
  // caméra autour de la verticale seulement, derrière lui à AURA_RECUL fois sa hauteur de son axe (à l'opposé de la caméra) ; sa hauteur et sa
  // taille du moment (la respiration : position.y et scale, en unités du modèle, que poserBoulanger règle), allongée de 1 / cos(plongée) : la
  // caméra plongeante de la boutique la voit de la même hauteur que la vue, presque de face (elle encadre encore sa tête)
  const AURA_RECUL = 0.17, _va = new T.Vector3(), _vb = new T.Vector3(), _sa = new T.Vector3(), _qa = new T.Quaternion();
  function poserAura(renderer, scene, camera) {
    const a = this.userData.acteur; if (!a) return; const mw = a.g.matrixWorld, s = _sa.setFromMatrixScale(mw).x;
    camera.getWorldDirection(_va); let dx = _va.x, dz = _va.z; const l = Math.hypot(dx, dz), allonge = 1 / Math.max(0.4, l);
    if (l < 1e-3) { dx = -Math.sin(a.yaw); dz = -Math.cos(a.yaw); } else { dx /= l; dz /= l; } // (la caméra droit au-dessus : derrière son dos)
    _vb.setFromMatrixPosition(mw); _vb.x += dx * AURA_RECUL * a.pr.hauteur * s; _vb.z += dz * AURA_RECUL * a.pr.hauteur * s; _vb.y += this.position.y * s;
    _qa.setFromAxisAngle(AXE_Y, Math.atan2(-dx, -dz));
    this.matrixWorld.compose(_vb, _qa, _sa.set(this.scale.x * s, this.scale.y * s * allonge, 1));
  }


  // ═══ l'animation : jouer un clip (fondu), les couches du haut du corps, l'IK des bras, tenir un objet ═══
  function jouer(a, nom, fondu, une) {
    if (a.joue === nom) return; const clip = CL[nom]; if (!clip) return;
    const ac = a.actions[nom] || (a.actions[nom] = a.mixer.clipAction(clip)); ac.reset(); ac.setLoop(une ? T.LoopOnce : T.LoopRepeat, Infinity); ac.clampWhenFinished = !!une; ac.setEffectiveWeight(1); ac.timeScale = 1; ac.play();
    const av = a.joue && a.actions[a.joue]; if (av && fondu > 0) av.crossFadeTo(ac, fondu, false); else if (av) av.stop();
    if (!une && !av) ac.time = a.graine * clip.duration;
    a.joue = nom;
  }
  function couche(a, nom, poids, force) { // une couche du haut du corps, son poids de 0 à 1 (au-dessus de la pose de fond)
    const clip = CL[nom]; if (!clip) return; let ac = a.actions[nom];
    if (poids <= 0.001) { if (ac && ac.isRunning()) ac.stop(); return; }
    if (!ac) ac = a.actions[nom] = a.mixer.clipAction(clip);
    if (!ac.isRunning()) { ac.reset(); ac.setLoop(T.LoopRepeat, Infinity); ac.play(); }
    ac.setEffectiveWeight((force || 3) * poids);
  }
  const posM = (o, v) => v.setFromMatrixPosition(o.matrixWorld);
  function tournerMonde(os, q) { os.parent.getWorldQuaternion(_q2); _q3.copy(_q2).multiply(os.quaternion).premultiply(q); os.quaternion.copy(_q2.invert().multiply(_q3)); os.updateMatrixWorld(true); }
  const _S = new T.Vector3(), _E = new T.Vector3(), _W = new T.Vector3(), _Tg = new T.Vector3(), _d = new T.Vector3(), _nrm = new T.Vector3(), _e1 = new T.Vector3(), _e2 = new T.Vector3(), _t1 = new T.Vector3(), _t2 = new T.Vector3();
  function ikBras(bras, avant, main, cible, k) { // une main vers cible (monde), pondéré par k : deux os, le coude du côté où il est
    if (k < 0.002 || !bras || !avant || !main) return; posM(bras, _S); posM(avant, _E); posM(main, _W);
    const l1 = _S.distanceTo(_E), l2 = _E.distanceTo(_W); _Tg.copy(_W).lerp(cible, k); _d.subVectors(_Tg, _S); let d = _d.length(); if (d < 1e-6) return;
    d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, d)); _d.normalize();
    _nrm.crossVectors(_t1.subVectors(_E, _S), _t2.subVectors(_W, _E)); if (_nrm.lengthSq() < 1e-10) _nrm.set(0, -1, 0); _nrm.normalize();
    const A = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    _e1.copy(_d).applyAxisAngle(_nrm, A).multiplyScalar(l1).add(_S); _e2.copy(_d).applyAxisAngle(_nrm, -A).multiplyScalar(l1).add(_S); const E2 = _e1.distanceTo(_E) < _e2.distanceTo(_E) ? _e1 : _e2;
    tournerMonde(bras, _q1.setFromUnitVectors(_t1.subVectors(_E, _S).normalize(), _t2.subVectors(E2, _S).normalize()));
    posM(main, _W); tournerMonde(avant, _q1.setFromUnitVectors(_t1.subVectors(_W, E2).normalize(), _t2.subVectors(_Tg, E2).normalize()));
  }
  function tenir(b, p, q, k) { // un objet tenu : à la position p (monde), l'orientation q (monde), la taille k ; ou rangé (échelle nulle)
    if (!b) return; if (!p) { if (b.scale.x !== 0) { b.scale.setScalar(0); b.updateMatrixWorld(true); } return; }
    _m1.compose(p, q, _s1.setScalar(k)); _m2.copy(b.parent.matrixWorld).invert().multiply(_m1); _m2.decompose(b.position, b.quaternion, b.scale); b.updateMatrixWorld(true);
  }
  const angleCourt = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const restaurer = (a) => { for (const [b, q, p] of a.sauve) { b.quaternion.copy(q); b.position.copy(p); } };
  const garderPose = (a) => { for (const sv of a.sauve) { sv[1].copy(sv[0].quaternion); sv[2].copy(sv[0].position); } };
  // ─── les os à ressort : la cape traîne derrière lui et s'évase quand il se retourne (« elle fait whoosh »), retombe en se balançant ; le
  //     trousseau balance au moindre mouvement (« il tinte à chaque pas ») ; l'éclat de la chaîne scintille. Le mouvement du bassin (son
  //     accélération, rapportée à sa taille) et la vitesse de son lacet les poussent, un ressort amorti les ramène ───
  const _ax = new T.Vector3(), _ay = new T.Vector3();
  function ressorts(a, dt, t) {
    const h = a.h || {}, os = a.os; if (!os.bassin) return;
    const R = a.ressorts || (a.ressorts = { cape: { x: 0, z: 0, vx: 0, vz: 0, tw: 0 }, cles: { x: 0, z: 0, vx: 0, vz: 0 }, p: null, v: null, yaw: a.yaw });
    if (!R.p) { R.p = new T.Vector3(); R.v = new T.Vector3(); R.a = new T.Vector3(); R.qa = new T.Quaternion(); R.qb = new T.Quaternion(); R.qc = new T.Quaternion(); R.w = 0; posM(os.bassin, R.p); }
    dt = Math.max(1 / 240, Math.min(dt || 1 / 60, 0.05));
    posM(os.bassin, _v1); _v2.subVectors(_v1, R.p).divideScalar(dt); R.a.subVectors(_v2, R.v).divideScalar(dt); R.v.copy(_v2); R.p.copy(_v1);
    const w = angleCourt(a.yaw - R.yaw) / dt; R.yaw = a.yaw; R.w += (w - R.w) * Math.min(1, dt * 12);
    const H = Math.max(1e-6, a.pr.hauteur * a.g.scale.x), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), af = Math.max(-40, Math.min(40, (R.a.x * fx + R.a.z * fz) / H)), al = Math.max(-40, Math.min(40, (R.a.x * fz - R.a.z * fx) / H)), av = Math.max(-40, Math.min(40, R.a.y / H));
    _ax.set(fz, 0, -fx); _ay.set(fx, 0, fz); // (l'axe de côté, l'axe d'avant)
    if (os.cape) {
      if (h.haut === 'cape') {
        const c = R.cape, k = 24, d = 4.2, ww = Math.min(9, Math.abs(R.w));
        c.vx += (-k * c.x - d * c.vx + af * 0.9 + ww * ww * 0.14 + Math.max(0, -av) * 0.35) * dt; c.x = Math.max(-0.12, Math.min(0.75, c.x + c.vx * dt));
        c.vz += (-k * c.z - d * c.vz - al * 0.9) * dt; c.z = Math.max(-0.45, Math.min(0.45, c.z + c.vz * dt));
        c.tw += (Math.max(-0.7, Math.min(0.7, -R.w * 0.11)) - c.tw) * Math.min(1, dt * 7);
        os.cape.quaternion.identity(); os.cape.updateMatrixWorld(true);
        R.qa.setFromAxisAngle(_ax, c.x + 0.012 * Math.sin(t * 1.3 + a.graine * 6)); R.qb.setFromAxisAngle(_ay, c.z); R.qc.setFromAxisAngle(AXE_Y, c.tw); R.qc.multiply(R.qa).multiply(R.qb);
        tournerMonde(os.cape, R.qc);
      } else os.cape.quaternion.identity();
    }
    if (os.cles) {
      if (h.acc === 'cles') {
        const c = R.cles, k = 46, d = 2.6, ww = Math.min(9, Math.abs(R.w));
        c.vx += (-k * c.x - d * c.vx + af * 1.6 + ww * 0.35 * Math.sin(t * 11)) * dt; c.x = Math.max(-0.9, Math.min(0.9, c.x + c.vx * dt));
        c.vz += (-k * c.z - d * c.vz - al * 1.6 - R.w * 0.25 + av * 0.2 * Math.sin(t * 7)) * dt; c.z = Math.max(-0.9, Math.min(0.9, c.z + c.vz * dt));
        os.cles.quaternion.identity(); os.cles.updateMatrixWorld(true);
        R.qa.setFromAxisAngle(_ax, c.x + 0.04 * Math.sin(t * 2.3 + 1)); R.qb.setFromAxisAngle(_ay, c.z + 0.05 * Math.sin(t * 1.7)); R.qa.multiply(R.qb);
        tournerMonde(os.cles, R.qa);
      }
    }
    if (os.eclat) { const on = h.acc === 'chaine', cy = ((t * 0.42 + a.graine) % 1), s = on && cy < 0.11 ? Math.sin(cy / 0.11 * Math.PI) : 0; if (os.eclat.scale.x !== s) { os.eclat.scale.setScalar(s); os.eclat.updateMatrixWorld(true); } }
  }

  // ═══ poser le boulanger : derrière le comptoir, face à la salle ; respiration (Idle), la joie, ses gestes, la sueur, la lanterne, l'aura, ce qui
  //     brille, les os à ressort. Dans la boutique, le patron est 1,1 fois plus grand que les clients et les apprentis ═══
  // o : { t, hop, rush, vue } (l'état de VIE, comme animerBoulanger des chibis ; vue : la vue « Mon boulanger ») ; ctx : { K, x, y (monde), z, echelle (× HAUT) }
  function poserBoulanger(a, o, dt, ctx) {
    const g = a.g, pr = a.pr, kB = o.vue ? 1 : ECHELLE_BOULANGER, s = HAUT * ctx.K * (ctx.echelle || 1) * kB / pr.hauteur * (pr.echelle || 1), t = o.t || 0, hop = o.hop || 0;
    g.scale.setScalar(s); a.yaw = angleCourt(a.yaw + angleCourt((ctx.yaw || 0) - a.yaw) * Math.min(1, dt * 8)); g.rotation.y = a.yaw;
    jouer(a, 'Idle', 0.3);
    // la joie : un départ de hop (une vente, un toucher : VIE le remet à 1, puis il retombe de 4 par seconde ; on guette sa remontée, que
    // l'image soit à 60 ou à 30 i/s) lance Cheering, le haut du corps, 1,4 s ; pas plus d'une fois toutes les 5 s (entre deux, le petit saut)
    a.joieT = Math.max(0, (a.joieT || 0) - dt); a.joieAttente = Math.max(0, (a.joieAttente || 0) - dt);
    if (hop > (a.hopP || 0) + 0.02 && a.joieAttente <= 0) { a.joieT = 1.4; a.joieAttente = 5; }
    a.hopP = hop;
    restaurer(a); a.mixer.update(dt); garderPose(a);
    const u = a.joieT > 0 ? 1 - a.joieT / 1.4 : 1, kj = a.joieT > 0 ? Math.min(1, u * 6, (1 - u) * 4) : 0; couche(a, '__joie', kj, 4);
    g.position.set(ctx.x, ctx.y - pr.sol * s + hop * hop * 4 * ctx.K * kB, ctx.z); g.updateMatrixWorld(true);
    // ses gestes, au repos (pas pendant la joie ni le coup de feu) : toutes les 11 s, le revers de la main sur le front ; ou il se frotte les
    // mains. Sous des lunettes ou le chapeau pointu, la main n'a pas la place d'aller au front (elle passerait à travers les verres ou le bord) :
    // il se frotte les mains, là aussi
    const os = a.os, w = (t * 0.09 + a.graine) % 1, lanterne = !!(a.h && a.h.acc === 'lanterne'), front = !(a.h && (a.h.lunettes || a.h.tete === 'chapeau'));
    if (!o.rush && a.joieT <= 0 && !o.vue && !lanterne) { // (la lanterne à la main : ni le front ni les mains frottées)
      if (w < 0.07 && front) { // (le front : au-dessus de l'os de la tête, devant le visage ; la main va et vient de côté)
        const k = Math.sin(w / 0.07 * Math.PI), d = pr.dessus * s; _v2.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); _v3.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
        posM(os.tete, _v1); _v1.y += d * 0.5; _v1.addScaledVector(_v2, d * 0.62).addScaledVector(_v3, -d * 0.12 - Math.sin(t * 9) * 0.1 * d * k); ikBras(os.brasD, os.avantD, os.mainD, _v1, k * 0.95);
      }
      else if (w < 0.07 || (w > 0.5 && w < 0.58)) { const k = Math.sin((w < 0.07 ? w / 0.07 : (w - 0.5) / 0.08) * Math.PI), f = Math.sin(t * 16) * 0.05 * pr.hauteur * s; posM(os.torse, _v1); _v1.y -= 0.12 * pr.hauteur * s; _v1.x += Math.sin(a.yaw) * 0.16 * pr.hauteur * s; _v1.z += Math.cos(a.yaw) * 0.16 * pr.hauteur * s; _v2.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); _v3.copy(_v1).addScaledVector(_v2, -0.02 * pr.hauteur * s + f); _v4.copy(_v1).addScaledVector(_v2, 0.02 * pr.hauteur * s + f); ikBras(os.brasD, os.avantD, os.mainD, _v3, k); ikBras(os.brasG, os.avantG, os.mainG, _v4, k); }
    }
    // la sueur pendant le coup de feu, la lanterne à la main droite
    if (os.sueur) { const on = !!o.rush; if ((os.sueur.scale.x > 0) !== on) os.sueur.scale.setScalar(on ? 1 : 0); }
    if (lanterne) { // la lanterne : le bras un peu levé, elle pend devant lui sur sa droite (loin de la cape et des bottes), sauf dans la joie (il la brandit)
      const Hs = pr.hauteur * s, sy = Math.sin(a.yaw), cy = Math.cos(a.yaw), lx = -0.2, lz = 0.13 + 0.01 * Math.sin(t * 1.3);
      _v1.set(g.position.x + (lx * cy + lz * sy) * Hs, g.position.y + (pr.sol / pr.hauteur + 0.4) * Hs, g.position.z + (-lx * sy + lz * cy) * Hs); ikBras(os.brasD, os.avantD, os.mainD, _v1, 1 - kj);
      posM(os.mainD, _v1); _v1.y -= 0.025 * Hs; _q1.setFromAxisAngle(AXE_Y, a.yaw + Math.sin(t * 2.2) * 0.15); tenir(os.lanterne, _v1, _q1, ctx.K * (ctx.echelle || 1) * kB * 0.85);
    } else tenir(os.lanterne, null);
    ressorts(a, dt, t); U_LUEUR.value = clignote(t);
    if (a.aura) { const k = Math.sin(t * 1.4), k2 = Math.sin(t * 0.53 + 1), uu = pr.hauteur / 73; a.aura.material.opacity = 0.44 + 0.1 * k + 0.04 * k2; a.aura.position.set(0, 36 * uu, 0); a.aura.scale.set((68 + 3 * k) * uu, (90 + 4 * k + 2 * k2) * uu, 1); }
  }

  const memo = (k, f) => { k = 'e3|' + k; let g = M.GEOS.get(k); if (!g) { g = f(); g.userData.cache = true; M.GEOS.set(k, g); } return g; };
  // ─── la place d'un apprenti en 3D. Les chibis se tiennent au four en file, sur trois couloirs (src/vie.js : fourSlots, lanes), et posent
  //     leur plateau au bout du comptoir en file aussi (comptoirSlots) ; les apprentis 3D, à la taille des clients, s'y marcheraient dessus. Au
  //     four, deux se tiennent côte à côte devant ses deux portes (le premier couloir à gauche, le deuxième à droite), le troisième pétrit au
  //     plan de travail, de profil ; au bout du comptoir, trois places en quinconce, qu'aucun trajet ne traverse (le premier passe devant la
  //     porte de droite) ; entre les deux, la marche de VIE (le même trajet, au même rythme, entre d'autres extrémités). VIE n'en sait rien ───
  function place(ap, ctx, o) {
    const L = ctx.LAY, l = Math.max(0, Math.min(2, ap.lane || 0)), K = ctx.K;
    if (!L || !L.four || !L.fourSlots || !L.comptoirSlots || !L.lanes) { o.x = ap.x; o.z = ctx.wz(ap.y); o.cap = Math.PI; return o; }
    const f0 = L.fourSlots[l], c0 = L.comptoirSlots[l], u = c0 > f0 ? Math.max(0, Math.min(1, (ap.x - f0) / (c0 - f0))) : 0, dl = L.lanes[1] - L.lanes[0];
    let x0, y0;
    if (l === 2 && L.plan) { x0 = L.plan.x + L.plan.w + 13 * K; y0 = L.plan.y + L.plan.h * 0.75; o.cap = -HP; } // (le plan de travail : sa face avant à y + h, sa profondeur 0,45 h)
    else { x0 = L.four.x + L.four.w * (l === 0 ? 0.27 : 0.73); y0 = L.lanes[0] + (l === 0 ? 0 : 2 * K); o.cap = Math.PI; }
    const x1 = l === 1 ? L.comptoirSlots[1] + 1.5 * K : c0, y1 = l === 0 ? L.lanes[0] + dl * 1.35 : l === 1 ? L.lanes[0] + dl * 0.3 : L.lanes[2] + dl * 0.5;
    o.x = x0 + (x1 - x0) * u; o.z = ctx.wz(y0 + (y1 - y0) * u); return o;
  }

  // ═══ poser un apprenti : sa place (VIE, revue pour la 3D), son cap, son clip, le plateau, la clé ═══
  // ap : l'apprenti de VIE ({ i, lane, etat, x, y, dir, plateau, phase, grade }) ; ctx : { K, wz, rush, t, LAY }
  function poserApprenti(a, ap, E, dt, ctx) {
    const g = a.g, pr = a.pr, K = ctx.K, s = HAUT * K / pr.hauteur * (pr.echelle || 1);
    habillerApprenti(a, ap.grade || 1);
    if (ap.etat !== a.etatP) { if (ap.etat === 'panne') a.panneT = 0; a.etatP = ap.etat; }
    if (ap.etat === 'panne') a.panneT += dt;
    g.visible = true; g.scale.setScalar(s);
    const pl = place(ap, ctx, a.pl || (a.pl = {})), x = pl.x, z = pl.z, marche = ap.etat === 'porte' || ap.etat === 'retour';
    if (a.xp != null && dt > 0) { const dx = x - a.xp, dz = z - a.zp, vv = Math.hypot(dx, dz) / dt; a.vitesse += (vv - a.vitesse) * Math.min(1, dt * 8); if (vv > 2 * K) a.capMarche = Math.atan2(dx, dz); }
    a.xp = x; a.zp = z;
    // le cap : à son poste, face au four ou au plan de travail ; en réparant, face au four, de trois quarts (le bras droit et la clé vus de la
    // salle) ; en marchant, face à sa marche ; la tête dans les mains (Defeat), face à la salle ; en posant le plateau, face à la salle (on le voit)
    const repare = ap.etat === 'panne' && a.panneT > (CL.Defeat ? CL.Defeat.duration * 0.92 : 0);
    const cap = ap.etat === 'four' ? pl.cap : repare ? Math.PI - 0.6 : ap.etat === 'panne' ? 0 : marche && a.capMarche != null ? a.capMarche : YAW[ap.dir] || 0;
    a.yaw = angleCourt(a.yaw + angleCourt(cap - a.yaw) * Math.min(1, dt * (a.neuf ? 100 : 10))); g.rotation.y = a.yaw; a.neuf = false;
    // le clip : pétrir au four (plus vite pendant le coup de feu), porter, poser, revenir ; la panne : Defeat une fois, puis réparer (le haut du corps)
    if (ap.etat === 'four') jouer(a, 'Working_A', 0.3);
    else if (ap.etat === 'porte') jouer(a, CL.Walk_Carry ? 'Walk_Carry' : 'Walk', 0.2);
    else if (ap.etat === 'retour') jouer(a, 'Walk', 0.2);
    else if (ap.etat === 'panne' && !repare) jouer(a, 'Defeat', 0.25, true);
    else jouer(a, 'Idle', 0.25);
    const ac = a.actions[a.joue];
    if (ac) { if (a.joue === 'Walk' || a.joue === 'Walk_Carry') { const vc = (a.joue === 'Walk' ? pr.vitesseWalk : pr.vitesseWalk_Carry || pr.vitesseWalk) * s; ac.timeScale = Math.max(0.6, Math.min(2.4, a.vitesse / Math.max(1e-3, vc))); } else if (a.joue === 'Working_A') ac.timeScale = ctx.rush ? 1.5 : 1; else ac.timeScale = 1; }
    couche(a, '__repare', repare ? 1 : 0, 6);
    restaurer(a); a.mixer.update(dt); garderPose(a);
    const saute = ap.etat === 'four' && ctx.rush ? Math.abs(Math.sin(ctx.t * 8 + (ap.lane || 0))) * 2 * K : 0;
    g.position.set(x, -pr.sol * s + saute, z); g.updateMatrixWorld(true);
    const os = a.os;
    // poser le plateau : les deux mains avancent et descendent vers le comptoir
    if (ap.etat === 'depose') { const k = Math.min(1, Math.sin(Math.min(1, (0.5 - Math.max(0, ap.t || 0)) / 0.5) * Math.PI) * 1.3); posM(os.torse, _v1); _v2.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); _v1.addScaledVector(_v2, 0.24 * pr.hauteur * s); _v1.y -= 0.16 * pr.hauteur * s; _v3.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); ikBras(os.brasD, os.avantD, os.mainD, _v4.copy(_v1).addScaledVector(_v3, -0.1 * pr.hauteur * s), k); ikBras(os.brasG, os.avantG, os.mainG, _v4.copy(_v1).addScaledVector(_v3, 0.1 * pr.hauteur * s), k); }
    // le plateau et sa pâtisserie (un maillage à part, entre les deux mains), la clé de la panne dans la main droite
    if (ap.plateau) {
      if (!a.plateau) { a.plateau = new T.Mesh(geoPlateau(ap.i), M.MAT.vertex); a.plateau.castShadow = true; a.plateau.userData.produit = ap.i; g.add(a.plateau); if (ctx.habiller) ctx.habiller(a.plateau); }
      posM(os.mainD, _v1); posM(os.mainG, _v2); _v1.add(_v2).multiplyScalar(0.5); _v1.y += 0.02 * pr.hauteur * s; _v3.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); _v1.addScaledVector(_v3, 0.03 * pr.hauteur * s);
      g.worldToLocal(_v1); a.plateau.position.copy(_v1); a.plateau.rotation.set(0, 0, 0); a.plateau.scale.setScalar(0.95 * K * (HAUT / 73) / s);
    } else if (a.plateau) { g.remove(a.plateau); a.plateau = null; }
    if (ap.etat === 'panne') { posM(os.mainD, _v1); _q1.setFromEuler(_e.set(repare ? -0.6 : 0.4, a.yaw, repare ? 0 : Math.sin(ctx.t * 14) * 0.4, 'YXZ')); tenir(os.cle, _v1, _q1, K); } else tenir(os.cle, null);
    // le pâton entre ses mains quand il pétrit (il s'écrase un peu sous les paumes)
    if (ap.etat === 'four' && a.joue === 'Working_A') { posM(os.mainD, _v1); posM(os.mainG, _v2); _v1.add(_v2).multiplyScalar(0.5); _v1.y -= 0.035 * pr.hauteur * s; _q1.setFromAxisAngle(AXE_Y, a.yaw); tenir(os.pate, _v1, _q1, K * (1 + 0.06 * Math.sin(ctx.t * 9))); } else tenir(os.pate, null);
  }
  // ═══ la vapeur du four : quand il cuit et que des apprentis y travaillent, quelques bouffées s'échappent du haut de ses portes, montent, enflent
  //     et s'évanouissent (plus nombreuses pendant le coup de feu). UN appel de dessin : un maillage instancié (douze bouffées au plus, des boules
  //     à facettes blanches, translucides), posé par src/scene.js tant que l'équipe est en 3D ; les bouffées 2D des chibis au four n'y sont plus
  //     dessinées. Son tirage au sort est le sien (la vie de la boutique garde Math.random) ═══
  const VAP = { g: null, b: [], acc: 0, graine: 7, N: 12, VIE: 1.9 };
  const hasardV = () => { VAP.graine = (Math.imul(VAP.graine, 1664525) + 1013904223) >>> 0; return VAP.graine / 4294967296; };
  function vapeur() {
    if (VAP.g) return VAP.g;
    const g = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshLambertMaterial({ color: '#FFFFFF', emissive: '#FFF4E6', emissiveIntensity: 0.25, transparent: true, opacity: 0.5, depthWrite: false }), VAP.N);
    g.count = 0; g.visible = false; g.castShadow = false; g.receiveShadow = false; g.frustumCulled = false; g.renderOrder = 3; g.instanceMatrix.setUsage(T.DynamicDrawUsage); g.userData.vapeur = true;
    return (VAP.g = g);
  }
  // o : { x, y, z (monde : le haut des portes, au milieu, juste devant), l (la largeur des portes), K, n (les apprentis au four), chaud, rush } ;
  // null : plus de vapeur (l'équipe redevenue chibis)
  function poserVapeur(dt, o) {
    const g = vapeur(), b = VAP.b; dt = Math.max(0, Math.min(dt || 0, 0.1));
    if (!o) { b.length = 0; g.count = 0; g.visible = false; return g; }
    const K = o.K || 1, debit = o.chaud && o.n > 0 ? (0.8 + 0.45 * Math.min(3, o.n)) * (o.rush ? 1.7 : 1) : 0; // (des bouffées par seconde)
    VAP.acc += dt * debit;
    while (VAP.acc >= 1) { VAP.acc -= 1; if (b.length < VAP.N) b.push({ x: o.x + (hasardV() - 0.5) * o.l, y: o.y, z: o.z, vx: (hasardV() - 0.5) * 3 * K, vz: (1 + hasardV() * 2) * K, r: (1.9 + hasardV() * 1.2) * K, t: 0, vie: VAP.VIE * (0.8 + hasardV() * 0.4) }); }
    for (let i = b.length - 1; i >= 0; i--) { const p = b[i]; p.t += dt; if (p.t >= p.vie) { b.splice(i, 1); continue; } p.x += p.vx * dt; p.z += p.vz * dt; p.y += (10 + 6 * (1 - p.t / p.vie)) * K * dt; }
    for (let i = 0; i < b.length; i++) { const p = b[i], u = p.t / p.vie, k = p.r * (0.55 + 1.3 * u) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.6); _m1.makeScale(k, k * 0.85, k).setPosition(p.x, p.y, p.z); g.setMatrixAt(i, _m1); }
    g.count = b.length; g.visible = b.length > 0; g.instanceMatrix.needsUpdate = true;
    return g;
  }
  // le plateau d'un apprenti : la planche et la pâtisserie de son poste (celle des chibis, src/persos.js), en cache (jamais libéré)
  const geoPlateau = (i) => memo('plateau|' + i, () => M.assembler([M.part(M.boite(24, 2, 13, 0.8), '#C9B8AE'), ...PERSOS.partsPatisserie(i).map((p) => ({ geo: p.geo, col: p.col, m: new T.Matrix4().makeTranslation(0, 2, 0).multiply(p.m || new T.Matrix4()) }))]));
  // le haut de la tête d'un acteur (monde) : la bulle des talents, le calque
  function tete(a) { if (!a || !a.os.tete) return null; const p = posM(a.os.tete, new T.Vector3()); p.y += a.pr.dessus * a.g.scale.y; return p; }
  // (pour les tests) le bas et le haut du corps d'un acteur, en y monde : ses sommets posés par les os
  function mesure(a) { let bas = Infinity, haut = -Infinity; a.g.updateMatrixWorld(true); sommetsMonde(a.S, a.habit ? a.habit.nCorps : a.pr.n, (i, x, y) => { if (y < bas) bas = y; if (y > haut) haut = y; }); return { bas, haut }; }

  // ═══ la vue « Mon boulanger » : plein écran, le boulanger en grand sur son estrade, qu'on tourne au doigt, sa tenue portée ; en bas, les quatre
  //     emplacements et les pièces qu'on possède : en toucher une la lui met (GAME.equiper), il la porte aussitôt et s'en réjouit. Son propre
  //     contexte WebGL (rendu en sortant, comme la Planque et l'arrière-salle), son propre acteur ; la boutique, cachée, attend (src/ui.js) ═══
  const PIECES = [['tete', 'Tête'], ['haut', 'Haut'], ['pieds', 'Pieds'], ['accessoire', 'Accessoire']];
  const CSS_VUE = `#mon-boulanger{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;background:linear-gradient(180deg,#FFF7EC 0%,#FFEBDA 62%,#FBDCC4 100%);padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);animation:atEntre .22s ease-out}
#mon-boulanger .mb-scene{position:relative;flex:1 1 auto;min-height:0;touch-action:none;cursor:grab}
#mon-boulanger .mb-scene canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#mon-boulanger .mb-indice{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);margin:0;padding:6px 14px 6px 12px;border-radius:999px;background:rgba(255,255,255,.86);box-shadow:0 2px 8px rgba(74,51,40,.12);font:700 12.5px/1.2 var(--texte-font);color:var(--texte-2);white-space:nowrap;transition:opacity .5s;pointer-events:none;display:flex;align-items:center;gap:6px}
#mon-boulanger .mb-indice svg{width:18px;height:18px}
#mon-boulanger .mb-attente{position:absolute;inset:0;display:grid;place-items:center;margin:0;font:700 15px/1.2 var(--titre);color:var(--texte-2)}
#mon-boulanger .mb-bas{flex:0 0 auto;background:var(--carte);border-radius:24px 24px 0 0;box-shadow:0 -4px 16px rgba(74,51,40,.09);padding:12px 12px 14px}
#mon-boulanger .mb-bas .segments{margin:0 0 4px}
#mon-boulanger .mb-pieces{display:flex;gap:8px;overflow-x:auto;padding:8px 2px 6px;scrollbar-width:none;min-height:112px}
#mon-boulanger .mb-pieces::-webkit-scrollbar{display:none}
#mon-boulanger .mb-piece{flex:0 0 auto;width:86px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 5px 7px;border-radius:16px;background:var(--creme);box-shadow:0 3px 0 var(--gris);font:700 11px/1.15 var(--texte-font);color:var(--texte);text-align:center}
#mon-boulanger .mb-piece svg{width:46px;height:46px}
#mon-boulanger .mb-piece small{font-size:10px;color:var(--texte-2);font-weight:700}
#mon-boulanger .mb-piece[aria-pressed="true"]{background:var(--or-clair);box-shadow:0 3px 0 var(--beurre-sombre),inset 0 0 0 2px var(--beurre)}
#mon-boulanger .mb-piece:active{transform:translateY(2px);box-shadow:0 1px 0 var(--gris)}`;
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VUE = { ouvert: false }; let V3 = null;
  function ouvrirVue(ctx, piece) {
    if (V3) return true; if (!ctx || !ctx.st) return false;
    if (!document.getElementById('mb-css')) { const st = document.createElement('style'); st.id = 'mb-css'; st.textContent = CSS_VUE; document.head.appendChild(st); }
    const el = document.createElement('div'); el.id = 'mon-boulanger'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'mb-titre');
    const ferme = typeof ICONS !== 'undefined' && ICONS.UI && ICONS.UI.fermer ? ICONS.UI.fermer : '×';
    el.innerHTML = `<div class="at-haut"><button type="button" class="at-fermer" data-mb="fermer" aria-label="Fermer la vue du boulanger"><i class="ico">${ferme}</i></button><div class="at-titre"><b id="mb-titre">Mon boulanger</b><small data-mb="sous"></small></div></div>
      <div class="mb-scene" data-mb="scene"><p class="mb-attente" data-mb="attente">Le boulanger s’habille…</p><p class="mb-indice" data-mb="indice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3"/></svg>Tourne-le du doigt</p></div>
      <div class="mb-bas"><div class="segments" role="tablist" aria-label="Emplacement" data-mb="seg"></div><div class="mb-pieces" role="list" data-mb="pieces"></div></div>`;
    document.body.appendChild(el);
    const zone = el.querySelector('[data-mb="scene"]'), cv = document.createElement('canvas'); zone.insertBefore(cv, zone.firstChild);
    let renderer = null; try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { renderer = null; }
    if (!renderer) { el.remove(); return false; }
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(26, 1, 0.1, 50);
    scene.add(new T.HemisphereLight('#FFF6EC', '#B89478', 1.5));
    const cle = new T.DirectionalLight('#FFF0DC', 2.1); cle.position.set(1.6, 3.2, 2.6); cle.castShadow = true; cle.shadow.mapSize.set(1024, 1024); Object.assign(cle.shadow.camera, { left: -1.5, right: 1.5, top: 2.6, bottom: -0.6, near: 0.5, far: 9 }); cle.shadow.bias = -0.0008; cle.shadow.normalBias = 0.02; scene.add(cle, cle.target);
    const contre = new T.DirectionalLight('#DCEBFF', 0.9); contre.position.set(-2.2, 2.4, -2.6); scene.add(contre);
    // l'estrade : un disque crème au bord biseauté, l'ombre douce posée dessus
    const estrade = new T.Mesh(new T.CylinderGeometry(0.78, 0.82, 0.08, 48), new T.MeshStandardMaterial({ color: '#F6E1C8', roughness: 0.9 })); estrade.position.y = -0.04; estrade.receiveShadow = true; scene.add(estrade);
    const lisere = new T.Mesh(new T.TorusGeometry(0.8, 0.012, 6, 64), new T.MeshStandardMaterial({ color: '#E8B98C', roughness: 0.8 })); lisere.rotation.x = HP; lisere.position.y = 0.001; scene.add(lisere);
    const mat = lumineux(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 })); // (sa lueur : la même que dans la boutique)
    V3 = { el, cv, zone, renderer, scene, camera, mat, estrade, ctx, a: null, yaw: 0.35, vyaw: 0, touche: -9, t: 0, piece: GAME.GARDEROBE.pieces.includes(piece) ? piece : 'tete', raf: 0, der: 0, joie: 0, images: 0 };
    VUE.ouvert = true;
    // la rotation au doigt (avec un peu d'élan) ; au repos, il revient doucement face à soi
    let x0 = null, xp = 0, tp = 0;
    zone.addEventListener('pointerdown', (e) => { x0 = e.clientX; xp = e.clientX; tp = performance.now(); V3.vyaw = 0; V3.touche = V3.t; zone.setPointerCapture(e.pointerId); zone.style.cursor = 'grabbing'; const ind = el.querySelector('[data-mb="indice"]'); if (ind) ind.style.opacity = '0'; });
    zone.addEventListener('pointermove', (e) => { if (x0 == null || !V3) return; const dx = e.clientX - xp, n = performance.now(); V3.yaw += dx * 0.011; V3.vyaw = dx * 0.011 / Math.max(0.008, (n - tp) / 1000); xp = e.clientX; tp = n; V3.touche = V3.t; });
    const lacher = () => { x0 = null; zone.style.cursor = ''; if (V3) V3.touche = V3.t; };
    zone.addEventListener('pointerup', lacher); zone.addEventListener('pointercancel', lacher);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !V3) return;
      if (b.dataset.mb === 'fermer') { if (ctx.son) ctx.son.tap(); fermerVue(); return; }
      if (b.dataset.mbPiece) { if (b.dataset.mbPiece === V3.piece) return; if (ctx.son) ctx.son.tap(); V3.piece = b.dataset.mbPiece; dessinerBas(); return; }
      if (b.dataset.mbAura != null) { const r = GAME.porterAura(ctx.st, b.dataset.mbAura || null); if (r.ok) { if (ctx.son) ctx.son.tap(); apres(); } return; }
      if (b.dataset.mbPorter != null) { const r = GAME.equiper(ctx.st, V3.piece, b.dataset.mbPorter || null); if (!r.ok) { if (ctx.son) ctx.son.non(); return; } if (ctx.son) ctx.son.tap(); if (ctx.buzz) ctx.buzz(8); apres(); }
    });
    const apres = () => { if (ctx.save) ctx.save(); if (ctx.apres) ctx.apres(); habillerVue(true); dessinerBas(); };
    const taille = () => { if (!V3) return; const r = zone.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); renderer.setPixelRatio(dpr); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix(); cadrer(); };
    V3.taille = taille; if (typeof ResizeObserver !== 'undefined') { V3.ro = new ResizeObserver(taille); V3.ro.observe(zone); }
    taille(); dessinerBas(); habillerVue(false);
    V3.raf = requestAnimationFrame(boucleVue);
    return true;
  }
  function cadrer() { // la caméra : le boulanger entier, toque comprise, un peu en plongée, le haut du corps au centre ; ou un gros plan (V3.zoom : les captures)
    if (!V3) return; const z = V3.zoom, h = V3.a ? V3.a.pr.hauteur * (z && z.fixe ? 1.3 : Math.max(1.1, (V3.a.habit.haut || 1) + 0.07)) : 2.1, hz = z ? h * z.h : h; // (la hauteur de la tenue, mesurée : la toque qui grandit, le chapeau pointu ; fixe : la même pour tous, une planche des titres)
    const fov = V3.camera.fov * Math.PI / 180, aspect = V3.camera.aspect, d = Math.max(hz * 0.6 / Math.tan(fov / 2), (hz * 0.36) / (Math.tan(fov / 2) * aspect)) * 1.04, cy = z ? h * z.cy : h * 0.47, el = z && z.el != null ? z.el : 0.2;
    V3.camera.position.set(0, cy + d * Math.sin(el), d * Math.cos(el)); V3.camera.lookAt(0, cy - 0.02 * hz, 0); V3.cible = h;
    const b = V3.boite; if (b) { // (la boîte des pièces : dans tout le canevas, ou dans le carré de sa largeur — les vignettes)
      const o = V3.boiteO || {}, c = b.getCenter(new T.Vector3()), sz = b.getSize(new T.Vector3()), mg = (o.marge || 1.25) * 0.5, ab = Math.max(0.2, aspect), r = o.carre ? Math.max(sz.y / (o.ratio || 1), sz.x) * mg / ab : Math.max(sz.y, sz.x / ab) * mg, dd = r / Math.tan(fov / 2) + Math.max(sz.x, sz.z) * 0.5, e = o.el != null ? o.el : 0.22;
      V3.camera.position.set(c.x, c.y + dd * Math.sin(e), c.z + dd * Math.cos(e)); V3.camera.lookAt(c);
    }
  }
  function habillerVue(joie) { // l'acteur de la vue (le sien), rhabillé à la tenue portée
    if (!V3) return; const st = V3.ctx.st;
    V3.el.querySelector('[data-mb="sous"]').textContent = `${GAME.titre(st)} · ${GAME.ensembleComplet(st) ? GAME.GARDEROBE.ensembles[GAME.ensembleComplet(st)].nom : 'tenue pièce par pièce'}`;
    if (!API.pret) return; const pr = PROTOS.Chef_Male; if (!pr) return;
    if (!V3.a) { V3.a = squelette(pr); TOUS.pop(); etat.acteurs = TOUS.length; V3.a.vue = true; V3.a.S.material = V3.mat; V3.a.S.castShadow = true; V3.a.g.visible = true; V3.scene.add(V3.a.g); jouer(V3.a, 'Idle', 0); const at = V3.el.querySelector('[data-mb="attente"]'); if (at) at.remove(); }
    rhabiller(V3.a, GAME.rangTitre(st), GAME.tenueBoulanger(st), GAME.nomBoutique ? GAME.nomBoutique(st) : ''); cadrer();
    if (joie) { V3.a.joieT = 1.4; V3.a.joieAttente = 0; V3.joie = 1; V3.touche = Math.min(V3.touche, V3.t - 1.2); }
  }
  function dessinerBas() {
    if (!V3) return; const st = V3.ctx.st, g = GAME.garderobe(st), p = V3.piece, porte = g.equipe[p];
    V3.el.querySelector('[data-mb="seg"]').innerHTML = PIECES.map(([id, nomP]) => `<button type="button" role="tab" data-mb-piece="${id}" aria-selected="${id === p}" class="${id === p ? 'actif' : ''}">${nomP}</button>`).join('');
    const liste = Object.values(GAME.GARDEROBE.objets).filter((v) => v.piece === p && g.objets[v.id]), ico = (v) => (typeof ICONS !== 'undefined' && ICONS.vetement ? ICONS.vetement(v.forme, v.collection === 'base' ? 'base' : v.collection) : '');
    let html = p === 'accessoire' ? `<button type="button" class="mb-piece" role="listitem" data-mb-porter="" aria-pressed="${porte === null}"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13" fill="none" stroke="#C9B8AE" stroke-width="3" stroke-dasharray="4 4"/></svg>Rien<small>le cou libre</small></button>` : '';
    html += liste.map((v) => `<button type="button" class="mb-piece" role="listitem" data-mb-porter="${v.id}" aria-pressed="${porte === v.id}" aria-label="${esc(v.nom)}${porte === v.id ? ' : portée' : ''}">${ico(v)}${esc(v.nom)}</button>`).join('');
    if (p === 'accessoire' && g.auras && g.auras.length) html += g.auras.map((id) => { const au = GAME.AURAS[id], on = g.aura === id; return `<button type="button" class="mb-piece" role="listitem" data-mb-aura="${on ? '' : id}" aria-pressed="${on}"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="${au.couleur}" opacity=".25"/><circle cx="24" cy="24" r="12" fill="${au.couleur}" opacity=".45"/><circle cx="24" cy="24" r="6" fill="#F2FFE0"/></svg>${esc(au.nom)}<small>${on ? 'portée' : 'rangée'}</small></button>`; }).join('');
    const bande = V3.el.querySelector('[data-mb="pieces"]'); bande.innerHTML = html;
    // la pièce portée en vue, au milieu de la bande (à l'ouverture, à l'onglet changé, après en avoir mis une : la bande refaite repartirait du début)
    const pp = bande.querySelector('[aria-pressed="true"]'); if (pp) { const r = pp.getBoundingClientRect(), rb = bande.getBoundingClientRect(); bande.scrollLeft = Math.max(0, bande.scrollLeft + (r.left + r.width / 2) - (rb.left + rb.width / 2)); }
  }
  function imageVue(dt) { // une image de la vue (la boucle, ou les tests qui la pilotent)
    if (!V3) return; V3.t += dt; V3.images++;
    if (!API.pret) { const st = V3.ctx.st; HDM.charger('boutique'); demander(); preparer(st, GAME.rangTitre(st), GAME.nomBoutique ? GAME.nomBoutique(st) : ''); if (API.pret) habillerVue(false); } // (ouverte avant que l'équipe soit prête : la préparation continue ici, la tenue du boulanger comprise)
    else { const st = V3.ctx.st; prevoir(st, GAME.rangTitre(st), GAME.nomBoutique ? GAME.nomBoutique(st) : ''); cuireAvance(2); } // (la boutique attend sous la vue : la cuisson d'avance continue ici, une pièce gagnée juste avant est prête à être mise)
    const a = V3.a;
    if (a) {
      // l'élan du doigt, puis le retour doux face à soi (un léger balancement) deux secondes après
      if (V3.t - V3.touche > 0.05) { V3.yaw += V3.vyaw * dt; V3.vyaw *= Math.pow(0.04, dt); }
      if (V3.t - V3.touche > 2.2) { const cible = 0.32 * Math.sin(V3.t * 0.5); V3.yaw += angleCourt(cible - V3.yaw) * Math.min(1, dt * 1.6); }
      const K = a.pr.hauteur / HAUT; a.yaw = V3.yaw; a.g.rotation.y = V3.yaw;
      poserBoulanger(a, { t: V3.t, hop: 0, rush: false, vue: true }, dt, { K, x: 0, y: 0, z: 0, yaw: V3.yaw });
      if (VUE.liaison) { a.S.skeleton.pose(); a.g.position.y = -a.pr.m.piedsY0; } // (mise au point : la pose de liaison, en T)
      a.yaw = V3.yaw; a.g.rotation.y = V3.yaw;
      a.g.updateMatrixWorld(true);
    }
    V3.renderer.render(V3.scene, V3.camera);
  }
  function boucleVue(n) { if (!V3) return; const dt = V3.der ? Math.min(0.1, (n - V3.der) / 1000) : 1 / 60; V3.der = n; imageVue(dt); V3.raf = requestAnimationFrame(boucleVue); }
  function fermerVue() {
    if (!V3) return; const v = V3; V3 = null; VUE.ouvert = false;
    if (v.raf) cancelAnimationFrame(v.raf); if (v.ro) v.ro.disconnect();
    if (v.a) { const a = v.a; a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.S.skeleton.dispose(); a.S.geometry.dispose(); if (a.aura) { a.aura.geometry.dispose(); a.aura.material.dispose(); } }
    v.estrade.geometry.dispose(); v.estrade.material.dispose(); v.scene.traverse((o) => { if (o.isMesh && o !== v.estrade && o.geometry && !(v.a && o === v.a.S)) { o.geometry.dispose(); if (o.material && o.material !== v.mat) o.material.dispose(); } }); v.mat.dispose();
    try { v.renderer.dispose(); v.renderer.forceContextLoss(); } catch (e) { /* rien */ }
    v.el.remove();
    if (v.ctx && v.ctx.ferme) v.ctx.ferme();
  }
  const tournerVue = (y) => { if (V3) { V3.yaw = y; V3.vyaw = 0; V3.touche = V3.t + 1e6; } }; // (les captures : un angle tenu)
  const zoomVue = (cy, h, el, fixe) => { if (V3) { V3.zoom = cy == null ? null : { cy, h: h || 0.3, el, fixe: !!fixe }; V3.boite = null; cadrer(); } }; // (les captures : un gros plan, centré à cy × la hauteur, h × la hauteur dans le cadre, vu de el rad au-dessus ; fixe : la même hauteur pour toutes les tenues)
  function zoomPiece(emp, marge, o) { // (les captures : un gros plan sur les pièces d'un emplacement — T, H, P, A, X, ou une clé de kit —, la boîte de leurs sommets à la pose du moment ; null : le boulanger entier.
    //  o : { carre : cadrée pour un cadre de la largeur du canevas, haut de ratio fois sa largeur (1 : un carré), el : vue de el rad au-dessus, haut, bas, cote : la boîte agrandie de tant de fois la hauteur du corps — un peu du corps autour de la pièce })
    if (!V3) return false; if (!emp) { V3.boite = null; cadrer(); return true; } const a = V3.a; if (!a) return false; const ks = a.habit.kits.filter((k) => k.emp === emp || k.cle === emp); if (!ks.length) return false;
    const n = a.S.geometry.attributes.position.count, dans = new Uint8Array(n), b = new T.Box3(), v = new T.Vector3(); for (const k of ks) for (let i = k.v0; i < k.v1; i++) dans[i] = 1;
    a.g.updateMatrixWorld(true); sommetsMonde(a.S, n, (i, x, y, z) => { if (dans[i] && Number.isFinite(x)) b.expandByPoint(v.set(x, y, z)); }); if (b.isEmpty()) return false;
    o = o || {}; const H = a.pr.hauteur * a.g.scale.y; b.max.y += (o.haut || 0) * H; b.min.y -= (o.bas || 0) * H; b.min.x -= (o.cote || 0) * H; b.max.x += (o.cote || 0) * H;
    V3.boite = b; V3.boiteO = Object.assign({}, o, { marge: marge || 1.25 }); V3.zoom = null; cadrer(); return true;
  }
  Object.assign(VUE, { ouvrir: ouvrirVue, fermer: fermerVue, image: imageVue, tourner: tournerVue, zoom: zoomVue, zoomPiece, rhabiller: () => { habillerVue(false); dessinerBas(); } }); // (rhabiller : la tenue changée ailleurs, la vue suit)
  Object.defineProperty(VUE, 'etat', { enumerable: true, get() { return V3 ? { piece: V3.piece, yaw: +V3.yaw.toFixed(3), tenue: V3.a ? V3.a.cleHabit : '', tris: V3.a ? V3.a.habit.tris : 0, kits: V3.a ? V3.a.habit.kits.map((k) => k.cle) : [], ms: V3.a ? V3.a.habit.ms : 0, aura: !!(V3.a && V3.a.aura), formes: V3.a ? { tete: V3.a.h.tete, haut: V3.a.h.haut, pieds: V3.a.h.pieds, acc: V3.a.h.acc, lunettes: V3.a.h.lunettes, foulard: V3.a.h.foulardTitre, col: V3.a.h.colTri } : null, joie: !!(V3.a && V3.a.joieT > 0), images: V3.images, appels: V3.renderer.info.render.calls, triangles: V3.renderer.info.render.triangles } : null; } }); // (un accesseur : Object.assign le figerait)

  Object.assign(API, { actif: true, HAUT, HAUT_BOULANGER: HAUT * ECHELLE_BOULANGER, permis, dispo, demander, preparer, boulanger, rhabiller, poserBoulanger, apprenti, poserApprenti, vapeur, poserVapeur, rendre, liberer, chauffer, rentrer, echantillon, tete, mesure, PROTOS, CL, ROLES, habitBoulanger, kitsDe, geometrie, palette, facade, toit, contour, initiales, sommetsMonde, U_LUEUR, vue: VUE }); // (PROTOS, CL, ROLES, habitBoulanger, kitsDe, geometrie, palette, facade, initiales, sommetsMonde, U_LUEUR : pour les tests et la mise au point)
  Object.defineProperty(API, 'etat', { enumerable: true, get: () => Object.assign({ libres: [...LIBRES.values()].reduce((s, l) => s + l.length, 0), aCuire: AVANCE.length + (cuisson ? 1 : 0), vapeur: VAP.b.length }, etat) }); // (aCuire : les kits qui attendent leur cuisson d'avance ; vapeur : les bouffées du four)
  Object.defineProperty(API, 'remplit', { enumerable: true, get: () => aRemplir }); // (la réserve se refait après avoir rendu sa mémoire : la boutique garde ses chibis jusque-là)
  return API;
})();
if (typeof module !== 'undefined') module.exports = EQUIPE3D;

