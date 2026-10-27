/* LE FOURNIL — MAQUETTE, seulement avec ?boulanger3d=1 dans l'adresse (sans lui, ce module ne fait rien et le jeu ne change pas) : le
   boulanger et les apprentis en personnages 3D animés, comme les clients (src/clients3d.js), avec leur tenue pièce par pièce.
   · Les corps : Chef_Male et Chef_Female de l'Ultimate Animated Character Pack de Quaternius (CC0) : le pack, le rig de 23 os, le matériau
     et l'échelle des clients (HAUT = 62 × K). Le lot « equipe » de src/hd.js (fournil/hd/equipe/, 162 Ko, refait par
     outils/equipe3d/faire-equipe.mjs) est demandé après celui des clients, dont il reprend les clips (Idle, Walk, Victory) ; les siens :
     Walk_Carry (porter le plateau), Defeat (la panne : la tête dans les mains), Working_A (pétrir), Hammering (réparer le four, la clé à la
     main) et Cheering (la joie du boulanger).
   · Les tenues, pièce par pièce : GAME.tenueBoulanger(st) donne la forme de chaque pièce (elle choisit le kit) et sa collection (sa palette,
     PERSOS.TENUES). Trois techniques, une seule géométrie : des pièces rigides sur des os (toque, casquette, chapeau pointu, cape, capuche et
     cordons du sweat, chaîne, lunettes, revers et boucle des bottes, étoile, moustache, col tricolore, goutte de sueur ; en main : la
     citrouille-lanterne, la clé) ; des surfaces drapées (le tablier, la poche du sweat : une grille aux bords nets posée un peu devant la
     « façade » du corps — sa profondeur vue de face —, chaque sommet avec les poids d'os du point du corps qu'il couvre : elles suivent le
     torse et les cuisses, même en marchant) ; des masques de sommets (les chaussures, les bottes, sur le bas des jambes) et la recoloration
     du reste (la veste, le sweat, la robe sous la cape, le foulard). Les pièces sont bâties sur les mesures du corps (le crâne, le buste, les pieds), à la grammaire des chibis (src/persos.js) :
     mêmes formes, mêmes palettes. UN appel de dessin par personnage ; plus l'aura (un sprite) et le plateau d'un apprenti qui porte.
   · Le boulanger : sa géométrie ne porte que ses pièces, refaite quand sa tenue ou son titre changent (sur le même squelette : la mémoire ne
     bouge pas). Respiration (Idle), la joie aux réussites (Cheering, le haut du corps, et un petit saut), de temps en temps il s'essuie le
     front ou se frotte les mains, la goutte de sueur pendant le coup de feu, l'aura qui respire. Les apprentis : une géométrie par corps,
     partagée (toque, tablier, étoile du grade 3, clé) ; chacun sa couleur (le haut de son poste) et ses os (la toque grandit aux grades 4 et 5).
     Au four, ils pétrissent (dos tourné) ; ils portent le plateau (Walk_Carry, le plateau entre les mains), le posent, reviennent (Walk) ; en
     panne, la tête dans les mains (Defeat), puis ils réparent le four, la clé à la main (Hammering).
   · Ce module ne touche ni à la vie (VIE) ni aux règles des apprentis (GAME.revenuFournee) : il lit leur état et le montre. Les chibis
     (src/persos.js) restent en éco, la HD coupée, tant que le lot n'est pas prêt, s'il échoue, et dans la boutique hantée (ses chibis déguisés
     ou ses monstres HD).
   · La vue « Mon boulanger » (vue.ouvrir) : le boulanger en grand, qu'on tourne au doigt, sa tenue portée ; une pièce changée se voit aussitôt. */
const EQUIPE3D = (() => {
  'use strict';
  const T = typeof THREE !== 'undefined' ? THREE : null, X = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
  const demande = typeof location !== 'undefined' && /[?&]boulanger3d=1(?:&|$)/.test(location.search);
  const API = { actif: false, pret: false, erreur: '', permis: () => false, demander: () => {}, preparer: () => false, boulanger: () => null, rhabiller: () => {}, poserBoulanger: () => {}, apprenti: () => null, poserApprenti: () => {}, rendre: () => {}, liberer: () => false, chauffer: () => null, rentrer: () => {}, echantillon: () => null, tete: () => null, vue: { ouvert: false, ouvrir: () => false, fermer: () => {} } };
  if (!demande || !T || !X || typeof document === 'undefined' || typeof HDM === 'undefined' || !HDM.actif || !HDM.LOTS || !HDM.LOTS.equipe || typeof PERSOS === 'undefined' || !PERSOS || typeof MODELES === 'undefined' || !MODELES || typeof GAME === 'undefined') return API;
  const M = MODELES, G = GAME, TAU = Math.PI * 2, HP = Math.PI / 2;

  // ═══ les corps, les rôles de couleur, les os ═══
  const CORPS = ['Chef_Male', 'Chef_Female'];
  const ROLE_MAT = { Skin: 'peau', Face: 'yeux', Hair: 'cheveux', Clothes: 'veste', DarkClothes: 'pantalon', Band: 'foulard' };
  const ROLES = ['fixe', 'peau', 'yeux', 'cheveux', 'veste', 'pantalon', 'foulard',
    'chaussure', 'semelle', 'bout', 'botte', // les pieds : des masques sur le bas des jambes
    'teteTissu', 'teteFonce', 'teteClair', 'teteBijou', 'galonT', // le couvre-chef
    'hautTissu', 'hautFonce', 'hautClair', 'hautBijou', 'galonH', 'biais', 'poche', 'doublure', 'reflet', // le haut
    'piedFonce', 'piedBijou', // les bottes : le revers, la boucle
    'accTissu', 'accFonce', 'accClair', 'accBijou', 'citrouille', 'lunettes', // l'accessoire
    'moustache', 'etoile', 'sueur', 'cle', 'boutons'];
  const RI = Object.fromEntries(ROLES.map((r, i) => [r, i]));
  // les os (noms tels que les lit GLTFLoader : « Fist.R » → « FistR » ; le corps « Body » devient « Body_1 », un groupe porte déjà ce nom)
  const OS = { tete: 'Head', cou: 'Neck', torse: 'Torso', ventre: 'Abdomen', bassin: 'Hips', mainD: 'FistR', mainG: 'FistL', avantD: 'LowerArmR', avantG: 'LowerArmL', brasD: 'UpperArmR', brasG: 'UpperArmL', pieds: ['FootL', 'FootR'], tibias: ['LowerLegL', 'LowerLegR'], basDuCorps: /^(Bone|Body|Hips|UpperLeg|LowerLeg|Foot|PoleTarget)/, bras: /^(Shoulder|UpperArm|LowerArm|Fist)/ };
  // les os ajoutés au gabarit (dans cet ordre) : sur la tête (la toque et son haut, qui monte avec le grade ; la goutte de sueur), sur le torse
  // (l'étoile du grade 3), en main (sous la racine : la lanterne, la clé, placées à chaque image)
  const ACC = ['accToque', 'accToqueHaut', 'accSueur', 'accEtoile', 'accLanterne', 'accCle'];
  const HAUT = 62; // la hauteur des clients (CLIENTS3D.HAUT) : la même échelle pour toute la boutique
  const OR = '#FFC84A', ROUGE = '#E1496C', L = '#4A3328', BLANC = '#FFFFFF';
  const FEMMES = new Set([1, 3, 5, 8, 10, 12, 14]); // les apprenties (GAME.APPRENTIS : Inès, Rose, Agathe, Margaux, Léonie, Aliénor, Capucine)
  const YAW = { 0: 0, 1: HP, '-1': -HP, 2: Math.PI };

  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3(), _q1 = new T.Quaternion(), _q2 = new T.Quaternion(), _q3 = new T.Quaternion();
  const _m1 = new T.Matrix4(), _m2 = new T.Matrix4(), _c = new T.Color(), _s1 = new T.Vector3(), AXE_Y = new T.Vector3(0, 1, 0), _e = new T.Euler();
  const etat = { acteurs: 0, enService: 0, chauffe: false, msCuisson: 0, liberes: 0, rhabillages: 0, msRhabillage: 0 };
  const permis = (renderer) => !!(typeof HDM !== 'undefined' && HDM.permis(renderer));
  function demander() { if (!HDM.etat.equipe) HDM.charger('equipe'); }
  const lin = (hex, k) => { _c.set(hex); if (k != null) _c.multiplyScalar(k); return [_c.r, _c.g, _c.b]; };
  const clair = (hex) => { _c.set(hex); return 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; };

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
      }
      const nb = ix ? ix.count : pos.count, at = (k) => (ix ? ix.getX(k) : k);
      if (nor) { const base = P.length / 3; for (let i = 0; i < pos.count; i++) { n3.fromBufferAttribute(nor, i).applyMatrix3(Nj[dom[i]]).normalize(); emettre(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2], n3.x, n3.y, n3.z, col, role, SIi, SWi, i * 4); } for (let k = 0; k < nb; k++) I.push(base + at(k)); }
      else { // en facettes : la normale de chaque triangle ; les sommets d'une même facette plane partagés
        const vus = new Map();
        for (let k = 0; k < nb; k += 3) {
          const i0 = at(k), i1 = at(k + 1), i2 = at(k + 2);
          a.fromArray(PP, i0 * 3); b.fromArray(PP, i1 * 3); c.fromArray(PP, i2 * 3); n3.subVectors(c, b).cross(_v1.subVectors(a, b)).normalize();
          const cle = ((Math.round(n3.x * 500) + 500) * 1001 + Math.round(n3.y * 500) + 500) * 1001 + Math.round(n3.z * 500) + 500;
          for (const i of [i0, i1, i2]) { const kk = i * 1003003001 + cle; let e = vus.get(kk); if (e === undefined) { e = emettre(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2], n3.x, n3.y, n3.z, col, role, SIi, SWi, i * 4); vus.set(kk, e); } I.push(e); }
        }
      }
      yield o.material.name;
    }
    const n = P.length / 3, pr = { nom, n, P: new Float32Array(P), N: new Float32Array(N), C0: new Float32Array(C0), R: new Uint8Array(R), SI: new Uint16Array(SI), SW: new Float32Array(SW), I: new Uint32Array(I), bindMatrix: S0.bindMatrix.clone(), iB, osIdx: new Map(idx), nbOs: bones.length };
    pr.dom = new Uint16Array(n); for (let k = 0; k < n; k++) { let jd = pr.SI[k * 4], wd = pr.SW[k * 4]; for (let q = 1; q < 4; q++) if (pr.SW[k * 4 + q] > wd) { wd = pr.SW[k * 4 + q]; jd = pr.SI[k * 4 + q]; } pr.dom[k] = jd; }
    pr.osW = {}; bones.forEach((bo, i) => { pr.osW[bo.name] = new T.Vector3().setFromMatrixPosition(BI0[i]); }); // les os au repos de liaison (le monde)
    pr.W = new Float32Array(n * 3); for (let k = 0; k < n; k++) { v.fromArray(pr.P, k * 3).applyMatrix4(pr.bindMatrix); v.toArray(pr.W, k * 3); } // les positions au repos de liaison, dans le monde
    yield 'positions';
    mesures(pr, bones);
    yield 'mesures';
    // le gabarit : le gltf cloné, un seul SkinnedMesh, les os ajoutés, le squelette refait
    const tpl = X.SkeletonUtils.clone(src); let S1 = null; const jeter = [];
    tpl.traverse((o) => { if (o.isMesh) { if (!S1 && o.isSkinnedMesh) S1 = o; else jeter.push(o); } });
    for (const o of jeter) o.parent.remove(o);
    const os = S1.skeleton.bones.slice(), inv = S1.skeleton.boneInverses.slice(), iB1 = S1.bindMatrix.clone().invert(), tete = idx.get(OS.tete), torse = idx.get(OS.torse), racine = os.findIndex((bo) => !bo.parent || !bo.parent.isBone);
    ACC.forEach((nomOs, i) => {
      const bo = new T.Bone(); bo.name = nomOs; bo.scale.setScalar(nomOs === 'accSueur' || nomOs === 'accEtoile' || nomOs === 'accLanterne' || nomOs === 'accCle' ? 0 : 1);
      const parent = nomOs === 'accToqueHaut' ? os[os.length - 1] : nomOs === 'accEtoile' ? os[torse] : nomOs === 'accLanterne' || nomOs === 'accCle' ? os[racine] : os[tete];
      parent.add(bo); os.push(bo); inv.push(nomOs === 'accEtoile' ? inv[torse].clone() : nomOs === 'accLanterne' || nomOs === 'accCle' ? iB1.clone() : inv[tete].clone());
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
  // les mesures au repos de liaison (en T, le visage vers +z, le haut +y), en unités du modèle
  function mesures(pr, bones) {
    const nomDe = (j) => bones[j] ? bones[j].name : '', W = pr.W, R = pr.R, n = pr.n, bx = (f) => { const b = new T.Box3(); for (let k = 0; k < n; k++) if (f(k)) b.expandByPoint(_v1.fromArray(W, k * 3)); return b; };
    const os = (k) => nomDe(pr.dom[k]);
    const crane = bx((k) => R[k] === RI.peau && os(k) === OS.tete), visage = bx((k) => R[k] === RI.yeux), cheveux = bx((k) => R[k] === RI.cheveux);
    const buste = bx((k) => R[k] === RI.veste && (os(k) === OS.torse || os(k) === OS.ventre)), foulard = bx((k) => R[k] === RI.foulard), pantalon = bx((k) => R[k] === RI.pantalon), cou = bx((k) => R[k] === RI.peau && os(k) === OS.cou);
    const t = { cx: (crane.min.x + crane.max.x) / 2, cy: (crane.min.y + crane.max.y) / 2, cz: (crane.min.z + crane.max.z) / 2, rx: (crane.max.x - crane.min.x) / 2, ry: (crane.max.y - crane.min.y) / 2, rz: (crane.max.z - crane.min.z) / 2, sommet: crane.max.y };
    // les yeux : le bas de la partie « Face » de chaque côté (le haut, ce sont les sourcils)
    const cxv = (visage.min.x + visage.max.x) / 2, hy = visage.max.y - visage.min.y, basY = visage.min.y + hy * 0.6, oeil = (cote) => { const s = new T.Vector3(); let k0 = 0; for (let k = 0; k < n; k++) if (R[k] === RI.yeux && (W[k * 3] - cxv) * cote > 0 && W[k * 3 + 1] < basY) { s.x += W[k * 3]; s.y += W[k * 3 + 1]; s.z += W[k * 3 + 2]; k0++; } return s.multiplyScalar(1 / Math.max(1, k0)); };
    const yeux = { g: oeil(1), d: oeil(-1), front: visage.max.z, sourcils: visage.max.y, bas: visage.min.y };
    // les pieds : la peau sous le pantalon (les tibias et les pieds de l'UACP), de chaque côté
    const piedsY0 = bx((k) => R[k] === RI.peau && /Foot|LowerLeg/.test(os(k))).min.y;
    pr.m = { tete: t, yeux, cheveux, buste, foulard, pantalon, cou, piedsY0, chevilleY: pantalon.min.y, H: Math.max(cheveux.max.y, crane.max.y) - piedsY0,
      // l'échelle des chibis (src/persos.js) : un crâne de rayon 10, un buste de rayon 11 haut de 34 (y de 19 à 53) ; les pièces y sont dessinées
      kt: [t.rx / 10, t.ry / 10, t.rz / 10], kb: [Math.max(Math.abs(buste.min.x - t.cx), Math.abs(buste.max.x - t.cx)) / 11, (buste.max.y - pantalon.max.y) / 34, (buste.max.z - buste.min.z) / 22] };
    pr.m.busteY0 = buste.max.y - 53 * pr.m.kb[1]; // le sol des chibis ramené au buste (leur buste va de y 19, la taille, à 53, le cou) : y(chibi) → busteY0 + y × kb[1]
    pr.m.busteZ = (buste.min.z + buste.max.z) / 2;
    pr.nomOs = nomDe;
  }
  // le rayon du crâne seul (la peau de la tête) autour de son axe, entre deux hauteurs : un couvre-chef s'y ajuste (les cheveux sont resserrés dessous)
  function rayonCrane(pr, y0, y1) { const t = pr.m.tete, W = pr.W, R = pr.R; let r = 0; for (let k = 0; k < pr.n; k++) { if (R[k] !== RI.peau || pr.nomOs(pr.dom[k]) !== OS.tete) continue; const y = W[k * 3 + 1]; if (y < y0 || y > y1) continue; r = Math.max(r, Math.hypot(W[k * 3] - t.cx, W[k * 3 + 2] - t.cz)); } return r || t.rx; }
  // le rayon des cheveux et du crâne autour de l'axe de la tête, entre deux hauteurs
  function rayonTete(pr, y0, y1) { const t = pr.m.tete, W = pr.W, R = pr.R; let r = 0; for (let k = 0; k < pr.n; k++) { if (R[k] !== RI.cheveux && !(R[k] === RI.peau && pr.nomOs(pr.dom[k]) === OS.tete)) continue; const y = W[k * 3 + 1]; if (y < y0 || y > y1) continue; r = Math.max(r, Math.hypot(W[k * 3] - t.cx, W[k * 3 + 2] - t.cz)); } return r; }

  // les positions monde des n premiers sommets d'un maillage skinné, à sa pose (comme src/clients3d.js)
  function sommetsMonde(S, n, fn) {
    S.skeleton.update(); const bm = S.skeleton.boneMatrices, g = S.geometry, p = g.attributes.position.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
    _m1.multiplyMatrices(S.matrixWorld, S.bindMatrixInverse); const Wm = _m1.elements, B = S.bindMatrix.elements;
    for (let i = 0; i < n; i++) {
      const x0 = p[i * 3], y0 = p[i * 3 + 1], z0 = p[i * 3 + 2], x = B[0] * x0 + B[4] * y0 + B[8] * z0 + B[12], y = B[1] * x0 + B[5] * y0 + B[9] * z0 + B[13], z = B[2] * x0 + B[6] * y0 + B[10] * z0 + B[14];
      let sx = 0, sy = 0, sz = 0;
      for (let q = 0; q < 4; q++) { const w = sw[i * 4 + q]; if (w === 0) continue; const o = si[i * 4 + q] * 16; sx += w * (bm[o] * x + bm[o + 4] * y + bm[o + 8] * z + bm[o + 12]); sy += w * (bm[o + 1] * x + bm[o + 5] * y + bm[o + 9] * z + bm[o + 13]); sz += w * (bm[o + 2] * x + bm[o + 6] * y + bm[o + 10] * z + bm[o + 14]); }
      fn(i, Wm[0] * sx + Wm[4] * sy + Wm[8] * sz + Wm[12], Wm[1] * sx + Wm[5] * sy + Wm[9] * sz + Wm[13], Wm[2] * sx + Wm[6] * sy + Wm[10] * sz + Wm[14]);
    }
  }
  function* mesurer(pr) { // sur un clone, le corps seul : la hauteur debout (Idle), le sol, le dessus de la tête ; la vitesse du pas (Walk, Walk_Carry)
    const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pr.P, 3)); geo.setAttribute('skinIndex', new T.BufferAttribute(pr.SI, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(pr.SW, 4)); S.geometry = geo;
    const mx = new T.AnimationMixer(g), tete = g.getObjectByName(OS.tete), pied = g.getObjectByName(OS.pieds[0]);
    const id = mx.clipAction(CL.Idle); id.play(); mx.setTime(0.01); g.updateMatrixWorld(true);
    let ymax = -1e9, ymin = 1e9; sommetsMonde(S, pr.n, (i, x, y) => { if (y > ymax) ymax = y; if (y < ymin) ymin = y; });
    pr.hauteur = ymax - Math.min(0, ymin); pr.sol = ymin; tete.getWorldPosition(_v1); pr.dessus = ymax - _v1.y; id.stop();
    yield 'debout';
    for (const nom of ['Walk', 'Walk_Carry']) {
      const clip = CL[nom]; if (!clip) continue; const ma = mx.clipAction(clip); ma.play(); let z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < 24; k++) { mx.setTime(clip.duration * k / 24); g.updateMatrixWorld(true); pied.getWorldPosition(_v1); z0 = Math.min(z0, _v1.z); z1 = Math.max(z1, _v1.z); }
      pr['vitesse' + nom] = 2 * (z1 - z0) / clip.duration; ma.stop();
    }
    mx.uncacheRoot(g); geo.dispose();
    yield 'marche';
  }

  // ═══ les pièces : des parts MODELES ({ geo, col, m }) avec un rôle et un os (un nom, ou une fonction des positions au repos qui rend
  //     [[os, poids], …]), bâties dans le monde au repos de liaison, puis ramenées dans l'espace de liaison du maillage, en facettes ═══
  const pc = (geo, role, p, os, col) => Object.assign(M.part(geo, col || BLANC, p), { role, os });
  // une matrice qui porte le dessin des chibis (persos.js) sur le corps : la tête (centre du crâne, rayon 10) ou le buste (sol des chibis à y 0)
  const surTete = (pr) => { const t = pr.m.tete, k = pr.m.kt; return new T.Matrix4().makeTranslation(t.cx, t.cy, t.cz).multiply(new T.Matrix4().makeScale(k[0], k[1], k[2])); };
  const surBuste = (pr) => { const m = pr.m, k = m.kb; return new T.Matrix4().makeTranslation(m.tete.cx, m.busteY0, m.busteZ).multiply(new T.Matrix4().makeScale(k[0], k[1], k[2])); };
  const porter = (parts, mat) => { for (const p of parts) p.m = p.m ? mat.clone().multiply(p.m) : mat.clone(); return parts; };
  const memo = (k, f) => { k = 'e3|' + k; let g = M.GEOS.get(k); if (!g) { g = f(); g.userData.cache = true; M.GEOS.set(k, g); } return g; };
  const calotte = (r, th, n) => memo(`cal|${r}|${th}|${n}`, () => new T.SphereGeometry(r, n || 14, 6, 0, TAU, 0, th));
  const bande = (r, h, n) => memo(`bd|${r}|${h}|${n}`, () => new T.CylinderGeometry(r, r, h, n || 16, 1, true));
  const patchC = (r, h, phi, n) => memo(`pc|${r}|${h}|${phi}|${n}`, () => new T.CylinderGeometry(r, r, h, n || 8, 1, true, -phi / 2, phi));
  const etoileGeo = (R, r, d) => memo(`et|${R}|${r}|${d}`, () => { // une étoile à cinq branches extrudée, centrée, face à +Z, une pointe en haut
    const s = new T.Shape(); for (let k = 0; k < 10; k++) { const a = HP + k * Math.PI / 5, rr = k % 2 ? r : R; if (k) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1, curveSegments: 1 }); g.center(); return g;
  });

  // ─── la toque : le bandeau juste au-dessus des sourcils, le fût plissé (12 facettes) qui s'évase, le bouffant qui déborde ; le galon
  //     (liseré doré ou bande du métal), l'étoile et le reflet du podium. hc : la hauteur du fût en unités des chibis (src/persos.js : 6 pour un
  //     apprenti, 2 à 28 pour le boulanger selon son titre), ramenée à la tête de l'UACP, plus grosse que celle des chibis (à leur échelle, la
  //     toque en ferait un champignon) : de 0,31 à 1,15 fois la demi-hauteur du crâne. Le haut du fût et le bouffant sont sur accToqueHaut (il
  //     monte aux grades 4 et 5), le bas sur accToque ───
  const hautFut = (pr, hc) => pr.m.tete.ry * (0.22 + hc * 0.024), hautFutPlus = (pr, dh) => pr.m.tete.ry * dh * 0.024;
  function toque(pr, hc, o) {
    const t = pr.m.tete, y = pr.m.yeux, yB = y.sourcils + (t.sommet - y.sourcils) * 0.2, hB = t.ry * 0.34, k = pr.m.kt[0];
    const rB = rayonCrane(pr, yB, yB + hB) * 1.1 + t.rx * 0.03, hF = hautFut(pr, hc), rT = rB * 1.04;
    const yMil = yB + hB + hF * 0.5, fut = (x, yy) => [[yy > yMil ? 'accToqueHaut' : 'accToque', 1]], c = { x: t.cx, z: t.cz };
    const parts = [
      pc(M.cylindre(rB, rB, hB, 14), 'teteTissu', { ...c, y: yB }, 'accToque'),
      pc(M.cylindre(rT, rB * 0.99, hF, 12), 'teteTissu', { ...c, y: yB + hB }, fut),
      pc(new T.SphereGeometry(rT * 1.05, 12, 8), 'teteTissu', { ...c, y: yB + hB + hF + rT * 0.3, sy: 0.74 }, 'accToqueHaut'),
    ];
    if (o.galon) parts.push(pc(bande(rB * 1.012, hB * 0.3, 16), 'galonT', { ...c, y: yB + hB * 0.24 }, 'accToque'));
    if (o.metal) parts.push(pc(etoileGeo(2.6, 1.1, 0.9), 'teteFonce', { x: t.cx, y: yB + hB * 0.6, z: t.cz + rB + 0.25 * k, sx: k * 0.85, sy: k * 1.05, sz: k * 0.8 }, 'accToque'), pc(patchC(rB * 1.008, hB * 0.86, 0.5), 'teteClair', { ...c, y: yB + hB * 0.5, ry: -0.75 }, 'accToque'));
    pr.bordToque = yB; pr.rayonCoiffe = rB * 0.96;
    return parts;
  }
  // ─── la casquette (le quartier) : la calotte qui coiffe le crâne, le bandeau, la visière tournée vers l'arrière (devant, elle cacherait les yeux
  //     en plongée, comme chez les chibis), le bouton, un reflet ───
  function casquette(pr) {
    const t = pr.m.tete, y = pr.m.yeux, yB = y.sourcils + (t.sommet - y.sourcils) * 0.3, R = Math.max(rayonCrane(pr, yB, t.sommet + 0.1), t.rx) * 1.12, hD = (t.sommet - yB) * 1.3 + R * 0.08, c = { x: t.cx, z: t.cz };
    pr.bordCasquette = yB; pr.rayonCoiffe = R * 0.97;
    return [
      pc(new T.SphereGeometry(1, 16, 7, 0, TAU, 0, HP), 'teteTissu', { ...c, y: yB, sx: R, sy: hD, sz: R * (t.rz / t.rx) }, OS.tete),
      pc(bande(R * 1.015, hD * 0.2, 16), 'teteTissu', { ...c, y: yB + hD * 0.1 }, OS.tete),
      pc(M.boite(R * 1.25, R * 0.08, R * 0.95, R * 0.035), 'teteFonce', { x: t.cx, y: yB - R * 0.02, z: t.cz - R * 1.02, rx: 0.2 }, OS.tete),
      pc(M.sphere(R * 0.1, 6), 'teteFonce', { ...c, y: yB + hD + R * 0.01 }, OS.tete),
      pc(new T.SphereGeometry(1.012, 8, 4, HP - 0.35, 0.7, 0.3, 0.7), 'teteClair', { ...c, y: yB, sx: R, sy: hD, sz: R * (t.rz / t.rx), ry: -0.9 }, OS.tete),
    ];
  }
  // ─── une pièce cuite du lot (p-chapeau, p-lanterne : leurs couleurs de sommets). Lue en flottants (le fichier est quantifié : des positions en
  //     entiers normalisés, que transformer sur place écrêterait), sans indices, posée (le bas sur y = 0, centrée en x et z) ; chaque sommet rangé
  //     dans un rôle par classer(r, g, b) (null : il garde sa couleur), avec sa nuance relative à la couleur moyenne de son rôle ───
  const CUITES = {};
  function cuirePiece(nom, classer) {
    if (nom in CUITES) return CUITES[nom]; CUITES[nom] = null;
    const g = HDM.equipe && HDM.equipe(nom); if (!g) return null;
    g.scene.updateMatrixWorld(true); let m = null; g.scene.traverse((o) => { if (!m && o.isMesh) m = o; }); if (!m) return null;
    const src = m.geometry, ix = src.index, pos = src.attributes.position, col = src.attributes.color, n = ix ? ix.count : pos.count;
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), roles = new Uint8Array(n), mul = new Float32Array(n).fill(1), lum = new Float32Array(n), bb = new T.Box3(), somme = {};
    for (let k = 0; k < n; k++) {
      const i = ix ? ix.getX(k) : k; _v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); _v1.toArray(P, k * 3); bb.expandByPoint(_v1);
      const r = col ? col.getX(i) : 1, gg = col ? col.getY(i) : 1, b = col ? col.getZ(i) : 1, role = classer(r, gg, b); C[k * 3] = r; C[k * 3 + 1] = gg; C[k * 3 + 2] = b;
      roles[k] = role ? RI[role] : RI.fixe; lum[k] = 0.2126 * r + 0.7152 * gg + 0.0722 * b; if (role) { const s0 = somme[role] || (somme[role] = [0, 0]); s0[0] += lum[k]; s0[1]++; }
    }
    for (let k = 0; k < n; k++) { const role = ROLES[roles[k]], s0 = somme[role]; if (s0) mul[k] = Math.max(0.55, Math.min(1.6, lum[k] / Math.max(1e-4, s0[0] / s0[1]))); }
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2; for (let k = 0; k < n; k++) { P[k * 3] -= cx; P[k * 3 + 1] -= bb.min.y; P[k * 3 + 2] -= cz; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('color', new T.BufferAttribute(C, 3));
    return (CUITES[nom] = { geo, roles, mul, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z });
  }
  // ─── le chapeau pointu (la Maison hantée) : celui de KayKit (Mage_Hat) ; ses couleurs rangées en rôles (le feutre violet, le ruban orange, la
  //     boucle grise : la palette de la collection les reteint, nuances gardées). Mis à la taille du crâne par son ruban, posé au ras des sourcils,
  //     un peu en arrière ; sinon (le fichier manque), celui des chibis ───
  function chapeau(pr) {
    const t = pr.m.tete, y = pr.m.yeux, yB = y.sourcils + (t.sommet - y.sourcils) * 0.3; pr.bordChapeau = yB;
    const ch = cuirePiece('p-chapeau', (r, g, b) => (Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05 && r > 0.08 ? 'teteBijou' : r > 0.18 && r > 2.2 * b && g < r * 0.8 ? 'teteFonce' : 'teteTissu'));
    if (ch) {
      // le ruban : son rayon et son bas, dans le fichier ; il doit ceindre le crâne et ses cheveux à la hauteur des sourcils
      const P = ch.geo.attributes.position.array; let rr = 0, yr = 1e9; for (let k = 0; k < ch.roles.length; k++) if (ch.roles[k] === RI.teteFonce) { rr = Math.max(rr, Math.hypot(P[k * 3], P[k * 3 + 2])); yr = Math.min(yr, P[k * 3 + 1]); }
      const rTete = rayonCrane(pr, yB, yB + t.ry * 0.3) * 1.12 + t.rx * 0.015; pr.rayonCoiffe = rTete * 0.96; const s = rr > 0 ? rTete / rr : 2 * t.rx * 1.6 / Math.max(ch.w, ch.d);
      return [Object.assign({ geo: ch.geo, col: BLANC, m: new T.Matrix4().compose(new T.Vector3(t.cx, yB - (yr < 1e8 ? yr : 0) * s, t.cz - t.rz * 0.04), new T.Quaternion().setFromEuler(_e.set(-0.12, 0, 0)), new T.Vector3(s, s, s)), vc: true }, { roles: ch.roles, mul: ch.mul, os: OS.tete })];
    }
    const c = { tissu: 'teteTissu', fonce: 'teteFonce', bijou: 'teteBijou' }; // (le chapeau des chibis, src/persos.js partsChapeau)
    return porter([pc(M.cylindre(15.5, 15.5, 1.3, 20), c.tissu, { y: 7.2, rx: -0.12 }, OS.tete), pc(M.cylindre(9.6, 6.4, 11, 16), c.tissu, { y: 7.6, rx: -0.12 }, OS.tete), pc(M.cone(6.4, 9, 12), c.tissu, { y: 17.6, z: -2.4, rx: -0.55 }, OS.tete), pc(M.cone(3, 5.5, 8), c.tissu, { y: 23.2, z: -6.6, rx: -1.2 }, OS.tete),
      pc(M.cylindre(9.75, 9.3, 2.8, 16), c.fonce, { y: 8.5, rx: -0.12 }, OS.tete), pc(M.boite(3.6, 3.6, 1.2, 0.5), c.bijou, { y: 8.4, z: 9.6, rx: -0.12 }, OS.tete)], surTete(pr));
  }
  // ─── la façade du corps : sur une grille de x et y au repos de liaison, le triangle le plus en avant de la veste, du pantalon, du foulard et des
  //     boutons (sans les bras), sa profondeur z et ses coordonnées barycentriques ; les trous d'une rangée (entre les jambes) bouchés d'un bord à
  //     l'autre. Un point posé devant la façade reprend les poids d'os du point du corps qui est dessous : il se déforme avec lui (les épaules
  //     qui tombent, les cuisses qui marchent), sans que la veste ni le pantalon le percent. En cache par corps ───
  function facade(pr) {
    if (pr.facade) return pr.facade;
    const W = pr.W, R = pr.R, I = pr.I, m = pr.m, pas = 0.006, x0 = m.tete.cx - 0.4, y0 = m.piedsY0, y1 = m.buste.max.y + 0.03, nx = Math.round(0.8 / pas) + 1, ny = Math.round((y1 - y0) / pas) + 1, nc = nx * ny;
    const Z = new Float32Array(nc).fill(-1e9), TR = new Int32Array(nc).fill(-1), BA = new Float32Array(nc * 2), GA = new Int32Array(nc * 2).fill(-1), GF = new Float32Array(nc);
    const ok = (k) => (R[k] === RI.veste || R[k] === RI.pantalon || R[k] === RI.foulard || (R[k] === RI.peau && /Torso|Abdomen/.test(pr.nomOs(pr.dom[k])))) && !/^(UpperArm|LowerArm|Fist)/.test(pr.nomOs(pr.dom[k])); // (le haut de la poitrine est sur les os des épaules : gardé)
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2]; if (!ok(a) || !ok(b) || !ok(c)) continue;
      const ax = W[a * 3], ay = W[a * 3 + 1], az = W[a * 3 + 2], bx = W[b * 3], by = W[b * 3 + 1], bz = W[b * 3 + 2], cx = W[c * 3], cy = W[c * 3 + 1], cz = W[c * 3 + 2];
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(det) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / pas)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / pas)), j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / pas)), j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - y0) / pas));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + i * pas, py = y0 + j * pas, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-3 || l2 < -1e-3 || l3 < -1e-3) continue; const z = l1 * az + l2 * bz + l3 * cz, q = j * nx + i;
        if (z > Z[q]) { Z[q] = z; TR[q] = t; BA[q * 2] = l1; BA[q * 2 + 1] = l2; }
      }
    }
    for (let j = 0; j < ny; j++) { let prev = -1; for (let i = 0; i < nx; i++) { const q = j * nx + i; if (Z[q] > -1e8 && TR[q] >= 0) { if (prev >= 0 && i - prev > 1) for (let r = prev + 1; r < i; r++) { const f = (r - prev) / (i - prev), qq = j * nx + r; Z[qq] = Z[j * nx + prev] + (Z[q] - Z[j * nx + prev]) * f; GA[qq * 2] = j * nx + prev; GA[qq * 2 + 1] = q; GF[qq] = f; } prev = i; } } }
    // la façade drapée : le plus en avant à 0,02 près autour de chaque point (un tissu posé passe par-dessus les marches : l'ourlet de la veste, l'entrejambe)
    const ZD = new Float32Array(nc).fill(-1e9), rd = 4;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let z = -1e9; for (let dj = -rd; dj <= rd; dj++) { const jj = j + dj; if (jj < 0 || jj >= ny) continue; for (let di = -rd; di <= rd; di++) { const ii = i + di; if (ii < 0 || ii >= nx) continue; const v = Z[jj * nx + ii]; if (v > z) z = v; } } ZD[j * nx + i] = Z[j * nx + i] > -1e8 ? z : -1e9; }
    const cellule = (i, j) => { i = Math.max(0, Math.min(nx - 1, i)); j = Math.max(0, Math.min(ny - 1, j)); let q = j * nx + i; for (let d = 1; Z[q] < -1e8 && d < nx; d++) { const g = j * nx + Math.max(0, i - d), dr = j * nx + Math.min(nx - 1, i + d); q = Z[g] > -1e8 ? g : dr; } return q; };
    const zA = (x, y) => { const fi = (x - x0) / pas, fj = (y - y0) / pas, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j; return (ZD[cellule(i, j)] * (1 - u) + ZD[cellule(i + 1, j)] * u) * (1 - v) + (ZD[cellule(i, j + 1)] * (1 - u) + ZD[cellule(i + 1, j + 1)] * u) * v; };
    const ajouterSommet = (k, w, acc) => { for (let q = 0; q < 4; q++) { const ww = pr.SW[k * 4 + q] * w; if (ww > 0) acc.set(pr.SI[k * 4 + q], (acc.get(pr.SI[k * 4 + q]) || 0) + ww); } };
    const poidsCellule = (q, w, acc) => { if (w <= 0) return; if (TR[q] >= 0) { const t = TR[q], l1 = BA[q * 2], l2 = BA[q * 2 + 1]; ajouterSommet(I[t], w * l1, acc); ajouterSommet(I[t + 1], w * l2, acc); ajouterSommet(I[t + 2], w * (1 - l1 - l2), acc); } else if (GA[q * 2] >= 0) { poidsCellule(GA[q * 2], w * (1 - GF[q]), acc); poidsCellule(GA[q * 2 + 1], w * GF[q], acc); } };
    const poidsA = (x, y) => { const fi = (x - x0) / pas, fj = (y - y0) / pas, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, acc = new Map(); poidsCellule(cellule(i, j), (1 - u) * (1 - v), acc); poidsCellule(cellule(i + 1, j), u * (1 - v), acc); poidsCellule(cellule(i, j + 1), (1 - u) * v, acc); poidsCellule(cellule(i + 1, j + 1), u * v, acc); return acc; };
    return (pr.facade = { zA, poidsA });
  }
  // ─── le tablier : une surface qui épouse le devant du corps, aux bords nets (la bavette étroite, la taille, la jupe qui couvre les deux cuisses
  //     jusqu'aux genoux), un peu en avant de la veste ; un rôle par bande : l'ourlet (galonH : le liseré doré, la bande du métal, le biais foncé
  //     d'un apprenti du grade 2), le biais du haut de la bavette (grade 2), le reflet du métal. Ses poids d'os : ceux du corps dessous ───
  function grille(pr, o) { // une surface posée devant la façade : rangées de yH à yB, demi-largeur l(y), décalée de e ; role(u, v) par quad (u de -1 à 1, v de 0 en haut à 1 en bas) ; les poids d'os de la façade
    const f = facade(pr), cx = pr.m.tete.cx, nc = o.colonnes, rangees = [];
    for (let y = o.yH; y > o.yB - 1e-6; y -= o.pas) rangees.push(y); if (rangees[rangees.length - 1] > o.yB + 1e-4) rangees.push(o.yB);
    const nr = rangees.length, V = [], PW = [];
    for (let j = 0; j < nr; j++) for (let i = 0; i <= nc; i++) { const y = rangees[j], l = o.largeur(y), x = cx + (i / nc * 2 - 1) * l, z = f.zA(x, y) + o.e; V.push([x, y, z]); PW.push(f.poidsA(x, y)); }
    const norme = (acc) => { const l = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), s0 = l.reduce((a, x) => a + x[1], 0) || 1; return l.map(([b, w]) => [b, w / s0]); };
    const PWn = PW.map(norme), P = [], roles = [], poidsS = [];
    for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nc; i++) {
      const k = (jj, ii) => jj * (nc + 1) + ii, quad = [k(j, i), k(j + 1, i), k(j, i + 1), k(j, i + 1), k(j + 1, i), k(j + 1, i + 1)], role = RI[o.role((i + 0.5) / nc * 2 - 1, (j + 0.5) / (nr - 1))];
      for (const q of quad) { P.push(...V[q]); roles.push(role); poidsS.push(PWn[q]); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    return { geo, col: BLANC, m: null, roles: new Uint8Array(roles), poidsS };
  }
  function tablier(pr, h) {
    const m = pr.m, yH = m.foulard.min.y - (m.foulard.max.y - m.foulard.min.y) * 0.25, yT = m.pantalon.max.y + 0.01, yK = m.chevilleY + (m.pantalon.max.y - m.chevilleY) * 0.34;
    const b = m.buste, larg = Math.max(Math.abs(b.min.x - m.tete.cx), Math.abs(b.max.x - m.tete.cx)), lH = larg * 0.42, lT = larg * 0.66, lJ = larg * 1.08, lK = larg * 1.12;
    const largeur = (y) => (y >= yT + 0.035 ? lH + (lT - lH) * (yH - y) / (yH - yT - 0.035) : y >= yT ? lT + (lJ - lT) * (yT + 0.035 - y) / 0.035 : lJ + (lK - lJ) * (yT - y) / (yT - yK));
    const ourlet = 0.034 * (m.H / 1.97), haut = 0.026 * (m.H / 1.97);
    return grille(pr, { yH, yB: yK, pas: 0.03 * (m.H / 1.97), colonnes: 12, e: 0.012 * (m.H / 1.97), largeur,
      role: (u, v) => { const y = yH + (yK - yH) * v; return y < yK + ourlet ? 'galonH' : y > yH - haut ? (h.biais ? 'biais' : 'hautTissu') : h.reflet && u > 0.42 && u < 0.72 && y < yH - haut * 2 ? 'reflet' : 'hautTissu'; } });
  }
  // ─── la poche kangourou du sweat, sur le ventre, son bord foncé en haut ───
  function poche(pr) {
    const m = pr.m, yB = m.pantalon.max.y + 0.035, yH = yB + (m.buste.max.y - yB) * 0.24, b = m.buste, larg = Math.max(Math.abs(b.min.x - m.tete.cx), Math.abs(b.max.x - m.tete.cx)) * 0.5;
    return grille(pr, { yH, yB, pas: (yH - yB) / 4, colonnes: 6, e: 0.013 * (m.H / 1.97), largeur: (y) => larg * (0.86 + 0.14 * (y - yB) / (yH - yB)), role: (u, v) => (v < 0.2 ? 'hautFonce' : 'poche') });
  }
  // ─── les chaussures (sur les os des pieds) : la semelle, l'empeigne, le bout ; les sabots de bois, les chaussures du métal, les baskets
  //     (semelle blanche, bande sur le côté), les bottes (le bout pointu relevé) ───
  function chaussures(pr, forme) {
    const m = pr.m, parts = [], H = m.H / 1.97;
    for (const [cote, os] of [[1, OS.pieds[0]], [-1, OS.pieds[1]]]) {
      const p = pr.osW[os]; if (!p) continue; const x = p.x, z = p.z + 0.035 * H, y0 = m.piedsY0;
      const w = 0.078 * H, d = 0.135 * H, hs = (forme === 'baskets' ? 0.024 : 0.016) * H, hu = 0.05 * H;
      parts.push(pc(M.boite(w * 1.06, hs, d * 1.04, hs * 0.4), 'semelle', { x, y: y0 - 0.004 * H, z }, os));
      parts.push(pc(M.boite(w, hu, d, Math.min(w, hu) * 0.42), 'chaussure', { x, y: y0 + hs * 0.7, z: z - 0.004 * H }, os));
      parts.push(pc(M.sphere(w * 0.5, 8), 'bout', { x, y: y0 + hs * 0.7 + hu * 0.36, z: z + d * 0.33, sx: 1, sy: 0.62, sz: 0.9 }, os));
      if (forme === 'baskets') parts.push(pc(M.boiteSimple(0.006 * H, hu * 0.42, d * 0.5), 'bout', { x: x + cote * w * 0.51, y: y0 + hs + hu * 0.2, z }, os));
      if (forme === 'bottes') parts.push(pc(M.cone(w * 0.32, d * 0.36, 8), 'chaussure', { x, y: y0 + hs + hu * 0.25, z: z + d * 0.48, rx: 1.15 }, os));
    }
    return parts;
  }
  // ─── le sweat (le quartier) : la veste reteinte, la capuche rabattue dans le dos, le col, les cordons, l'étoile sur la poitrine (la poche : drapée) ───
  function sweat(pr) {
    const os = OS.torse;
    return porter([
      pc(M.sphere(7, 10), 'hautTissu', { y: 48.5, z: -7.2, sx: 1.45, sy: 0.62, sz: 0.95 }, os), pc(M.tore(8.6, 1.5, TAU, 6, 16), 'hautTissu', { y: 51.4, z: -0.4, rx: HP + 0.12 }, os),
      pc(M.capsule(0.6, 5, 5), 'hautClair', { x: -2.6, y: 45.5, z: 11.6, rz: 0.12 }, os), pc(M.capsule(0.6, 5, 5), 'hautClair', { x: 2.6, y: 45.5, z: 11.6, rz: -0.12 }, os),
      pc(etoileGeo(2.4, 1, 0.8), 'hautFonce', { x: 5.2, y: 44, z: 9.9, ry: 0.42, rx: -0.2 }, os),
    ], surBuste(pr));
  }
  // ─── la cape (la Maison hantée) : un demi-cylindre évasé dans le dos, des épaules aux genoux, sa doublure ; le haut sur le torse, le bas sur le
  //     bassin (il suit la marche sans que les mollets le percent) ; le col dressé, l'agrafe ; la veste devient la robe claire ───
  function cape(pr) {
    const m = pr.m, b = m.buste, yH = b.max.y - 0.02, yB = m.pantalon.min.y + (m.pantalon.max.y - m.pantalon.min.y) * 0.32, h = yH - yB;
    const rH = Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) * 1.12, rB = rH * 1.55, iT = OS.torse, iH = OS.bassin;
    const poids = (x, y) => { const u = Math.max(0, Math.min(1, (yH - y) / h)), w = Math.min(1, u * 1.25); return [[iT, 1 - w], [iH, w]]; };
    const ext = memo(`cape|${rH.toFixed(3)}|${h.toFixed(3)}`, () => new T.CylinderGeometry(rH, rB, h, 18, 3, true, HP + 0.3, Math.PI - 0.6).translate(0, -h / 2, 0));
    const int = memo(`capeI|${rH.toFixed(3)}|${h.toFixed(3)}`, () => { const g = new T.CylinderGeometry(rH * 0.97, rB * 0.97, h * 0.99, 18, 3, true, HP + 0.3, Math.PI - 0.6).translate(0, -h / 2, 0); const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const s = ix[k]; ix[k] = ix[k + 2]; ix[k + 2] = s; } return g; });
    const z = m.busteZ - 0.01;
    const parts = [pc(ext, 'hautTissu', { x: m.tete.cx, y: yH, z }, poids), pc(int, 'doublure', { x: m.tete.cx, y: yH, z }, poids)];
    return parts.concat(porter([pc(patchC(9.6, 6.5, 2.7), 'hautFonce', { y: 52.6, ry: Math.PI, sx: 1.04, sz: 1.04 }, OS.torse), pc(patchC(9.85, 6.5, 2.7), 'hautTissu', { y: 52.7, ry: Math.PI, sx: 1.07, sz: 1.07 }, OS.torse),
      pc(M.sphere(1.5, 8), 'hautBijou', { x: -3, y: 49.6, z: 9.6 }, OS.torse), pc(M.sphere(1.5, 8), 'hautBijou', { x: 3, y: 49.6, z: 9.6 }, OS.torse), pc(M.capsule(0.5, 6, 4), 'hautBijou', { y: 49.6, z: 10, rz: HP }, OS.torse)], surBuste(pr)));
  }
  // ─── la chaîne (le quartier) : deux rangs qui tombent sur la poitrine, un médaillon ───
  function chaine(pr) {
    return porter([pc(M.tore(8.8, 0.7, TAU, 6, 20), 'accBijou', { y: 50, z: 1, rx: HP + 0.3 }, OS.torse), pc(M.tore(9.4, 0.7, TAU, 6, 20), 'accBijou', { y: 48.2, z: 1.4, rx: HP + 0.55 }, OS.torse),
      pc(M.cylindre(2.4, 2.4, 0.9, 12), 'accBijou', { y: 42.6, z: 10.6, rx: HP + 0.2 }, OS.torse), pc(M.cylindre(1.4, 1.4, 0.5, 10), 'accClair', { y: 42.7, z: 11.4, rx: HP + 0.2 }, OS.torse)], surBuste(pr));
  }
  // ─── les lunettes rondes : deux cercles devant les yeux et le pont (comme celles des clients 3D) ───
  function lunettes(pr) {
    const y = pr.m.yeux, e = y.g.distanceTo(y.d), r = e * 0.36, z = y.front + r * 0.25, yy = (y.g.y + y.d.y) / 2, ep = r * 0.16, mx = (y.g.x + y.d.x) / 2, l = Math.max(0.001, e - 2 * r);
    return [pc(M.tore(r, ep, TAU, 4, 12), 'lunettes', { x: y.g.x, y: yy, z }, OS.tete), pc(M.tore(r, ep, TAU, 4, 12), 'lunettes', { x: y.d.x, y: yy, z }, OS.tete), pc(M.cylindre(ep * 0.8, ep * 0.8, l, 5), 'lunettes', { x: mx + l / 2, y: yy + r * 0.15, z, rz: HP }, OS.tete)];
  }
  // ─── la moustache du patron (titre 3 et plus), sous le nez ───
  function moustache(pr) {
    const y = pr.m.yeux, t = pr.m.tete, mx = (y.g.x + y.d.x) / 2, e = y.g.distanceTo(y.d), yy = y.bas - (y.bas - (t.cy - t.ry)) * 0.18, z = y.front - 0.004, r = e * 0.11;
    return [pc(M.capsule(r, r * 2.6, 6), 'moustache', { x: mx + e * 0.2, y: yy, z, rz: -1.15 }, OS.tete), pc(M.capsule(r, r * 2.6, 6), 'moustache', { x: mx - e * 0.2, y: yy, z, rz: 1.15 }, OS.tete)];
  }
  // ─── le col tricolore (titre 5) : bleu, blanc, rouge autour du cou ───
  function colTricolore(pr) {
    return porter([pc(patchC(9.3, 4, 2.3), 'fixe', { y: 49.8, ry: -1.45 }, OS.torse, '#2B5BD7'), pc(patchC(9.3, 4, 0.62), 'fixe', { y: 49.8 }, OS.torse, BLANC), pc(patchC(9.3, 4, 2.3), 'fixe', { y: 49.8, ry: 1.45 }, OS.torse, ROUGE), pc(patchC(9.3, 4, 0.62), 'fixe', { y: 49.8, ry: Math.PI }, OS.torse, BLANC)], surBuste(pr));
  }
  // ─── l'étoile dorée du grade 3, sur la poitrine gauche (os d'échelle nulle sous le grade 3) ───
  function etoileGrade(pr) { return porter([pc(etoileGeo(2.7, 1.15, 0.9), 'etoile', { x: 5.4, y: 45, z: 10.4, ry: 0.45, rx: -0.25 }, 'accEtoile')], surBuste(pr)); }
  // ─── la goutte de sueur (le coup de feu), près de la tempe ───
  function sueur(pr) { return porter([pc(M.sphere(1.6, 8), 'sueur', { x: 10.6, y: 2, z: 3.2 }, 'accSueur'), pc(M.cone(1.5, 2.6, 8), 'sueur', { x: 10.6, y: 2.6, z: 3.2 }, 'accSueur')], surTete(pr)); }
  // ─── les bottes : le revers en haut de la tige, la boucle sur le cou-de-pied (le masque teint la tige) ───
  function bottes(pr) {
    const parts = [], m = pr.m, yR = m.chevilleY + (m.pantalon.max.y - m.chevilleY) * 0.2;
    for (const [cote, tib, pied] of [[1, OS.tibias[0], OS.pieds[0]], [-1, OS.tibias[1], OS.pieds[1]]]) {
      const c = jambe(pr, cote, yR); if (!c) continue;
      parts.push(pc(bande(c.r * 1.12, (m.pantalon.max.y - m.chevilleY) * 0.07, 10), 'piedFonce', { x: c.x, y: yR, z: c.z }, tib), pc(M.boiteSimple(c.r * 0.7, c.r * 0.45, c.r * 0.25), 'piedBijou', { x: c.x, y: m.piedsY0 + (m.chevilleY - m.piedsY0) * 0.55, z: c.zAvant + c.r * 0.08 }, pied));
    }
    return parts;
  }
  // le centre et le rayon d'une jambe (le pantalon) à une hauteur, et l'avant du pied
  function jambe(pr, cote, y) {
    const W = pr.W, R = pr.R; let sx = 0, sz = 0, k0 = 0, r = 0, zA = -1e9;
    for (let k = 0; k < pr.n; k++) { const x = W[k * 3]; if (x * cote <= 0.02) continue; if (R[k] === RI.peau && /Foot|LowerLeg/.test(pr.nomOs(pr.dom[k]))) zA = Math.max(zA, W[k * 3 + 2]); if (R[k] !== RI.pantalon || Math.abs(W[k * 3 + 1] - y) > 0.06) continue; sx += x; sz += W[k * 3 + 2]; k0++; }
    if (!k0) return null; const cx = sx / k0, cz = sz / k0;
    for (let k = 0; k < pr.n; k++) { const x = W[k * 3]; if (x * cote <= 0.02 || R[k] !== RI.pantalon || Math.abs(W[k * 3 + 1] - y) > 0.06) continue; r = Math.max(r, Math.hypot(x - cx, W[k * 3 + 2] - cz)); }
    return { x: cx, z: cz, r, zAvant: zA };
  }
  // ─── en main : la citrouille-lanterne (KayKit Halloween Bits, p-lanterne.glb : l'orange reteint à la collection — dorée pour la tenue en or —,
  //     la tige et les yeux gardés), son anse ; la clé de la panne. Bâties en unités des chibis autour de l'origine (la prise), sur un os sous la
  //     racine que tenir() place à chaque image ───
  function lanterne() {
    const parts = [pc(M.capsule(0.32, 3.4, 4), 'accFonce', { y: -1.7 }, 'accLanterne'), pc(M.tore(1.6, 0.3, Math.PI, 4, 8), 'accFonce', { y: -3.4 }, 'accLanterne')];
    const cu = cuirePiece('p-lanterne', (r, g, b) => (r > 0.2 && g < r * 0.62 && b < r * 0.3 ? 'citrouille' : null));
    if (cu) { const s = 9.5 / Math.max(cu.w, cu.d); parts.push(Object.assign({ geo: cu.geo, col: BLANC, m: new T.Matrix4().compose(new T.Vector3(0, -3.6 - cu.h * s, 0), new T.Quaternion(), new T.Vector3(s, s, s)), vc: true }, { roles: cu.roles, mul: cu.mul, os: 'accLanterne' })); }
    else parts.push(pc(M.sphere(4.2, 10), 'citrouille', { y: -8, sy: 0.85 }, 'accLanterne'), pc(M.cylindre(0.7, 0.9, 1.6, 6), 'fixe', { y: -4.6 }, 'accLanterne', '#5A7A2E'), pc(M.sphere(0.9, 6), 'fixe', { x: -1.4, y: -7.6, z: 3.5, sz: 0.4 }, 'accLanterne', '#FFE27A'), pc(M.sphere(0.9, 6), 'fixe', { x: 1.4, y: -7.6, z: 3.5, sz: 0.4 }, 'accLanterne', '#FFE27A'));
    return parts;
  }
  function cle() { // la clé plate des chibis (src/persos.js) : le manche, l'anneau ouvert, sa mâchoire ; l'origine à la prise
    return [pc(M.boiteSimple(2.6, 13, 2), 'cle', { y: -4 }, 'accCle'), pc(M.cylindre(3.4, 3.4, 2, 10), 'cle', { y: 9, z: 1, rx: HP }, 'accCle'), pc(M.boiteSimple(2.2, 3.2, 2.4), 'fixe', { y: 10.6 }, 'accCle', L)];
  }

  // ═══ la géométrie d'un personnage : le corps (ses boutons, les masques des pieds, les cheveux cachés sous le couvre-chef retirés), ses pièces ═══
  // h : ce qu'il porte, en formes (voir habitBoulanger, HABIT_APPRENTI)
  function geometrie(pr, h) {
    const t0 = performance.now(), m = pr.m, n0 = pr.n, Rb = pr.R.slice(), W = pr.W;
    // les boutons de la veste du Chef (la peau de l'UACP, sur le devant du buste) ; les pieds : la peau sous le pantalon devient la chaussure ;
    // les bottes montent sur le pantalon
    const pied0 = m.piedsY0, ch = m.chevilleY, hp = ch - pied0, yBotte = ch + (m.pantalon.max.y - ch) * 0.24, yCol = m.foulard.min.y - 0.01;
    for (let k = 0; k < n0; k++) {
      const y = W[k * 3 + 1], os = pr.nomOs(pr.dom[k]);
      if (Rb[k] === RI.peau && /Foot|LowerLeg/.test(os)) Rb[k] = y < pied0 + hp * 0.22 ? RI.semelle : RI.chaussure;
      else if (Rb[k] === RI.peau && /Torso|Abdomen/.test(os) && y < yCol && W[k * 3 + 2] > m.busteZ + 0.07) Rb[k] = RI.boutons;
      else if (h.pieds === 'bottes' && Rb[k] === RI.pantalon && y < yBotte && /LowerLeg/.test(os)) Rb[k] = RI.botte;
    }
    // les pièces de la tête (et le bord sous lequel les cheveux se cachent), du haut, des pieds, l'accessoire, les marques du titre et du grade
    const pieces = []; let bord = Infinity; pr.rayonCoiffe = 0;
    if (h.tete === 'toque') { pieces.push(...toque(pr, h.hc, { galon: h.galonT, metal: h.metalT })); bord = pr.bordToque; }
    else if (h.tete === 'casquette') { pieces.push(...casquette(pr)); bord = pr.bordCasquette; }
    else if (h.tete === 'chapeau') { pieces.push(...chapeau(pr)); bord = pr.bordChapeau; }
    if (h.haut === 'tablier') pieces.push(tablier(pr, h)); else if (h.haut === 'sweat') pieces.push(...sweat(pr), poche(pr)); else if (h.haut === 'cape') pieces.push(...cape(pr));
    pieces.push(...chaussures(pr, h.pieds)); if (h.pieds === 'bottes') pieces.push(...bottes(pr));
    if (h.acc === 'chaine') pieces.push(...chaine(pr)); else if (h.acc === 'lanterne') pieces.push(...lanterne());
    if (h.lunettes) pieces.push(...lunettes(pr));
    if (h.moustache) pieces.push(...moustache(pr));
    if (h.col) pieces.push(...colTricolore(pr));
    if (h.etoile) pieces.push(...etoileGrade(pr));
    if (h.sueur) pieces.push(...sueur(pr));
    if (h.cle) pieces.push(...cle());
    // les cheveux qui dépassent sous le couvre-chef : ramenés vers l'axe de la tête près du bord (dans son rayon au bord, libres 0,1 plus bas) ;
    // ceux du dessus sont retirés (cachés dedans : des triangles en moins). Les longs cheveux d'une apprentie tombent encore sous la toque
    let Pc = pr.P;
    if (bord < Infinity && pr.rayonCoiffe) {
      Pc = pr.P.slice(); const t = m.tete, rc = pr.rayonCoiffe, d = 0.1 * (m.H / 1.97);
      for (let k = 0; k < n0; k++) { if (Rb[k] !== RI.cheveux) continue; const y = W[k * 3 + 1]; if (y < bord - d) continue; const dx = W[k * 3] - t.cx, dz = W[k * 3 + 2] - t.cz, r = Math.hypot(dx, dz); if (r <= rc) continue;
        const u = Math.min(1, (y - (bord - d)) / d), f = (rc + (r - rc) * (1 - u * u * (3 - 2 * u))) / r; _v1.set(t.cx + dx * f, y, t.cz + dz * f).applyMatrix4(pr.iB); _v1.toArray(Pc, k * 3); }
    }
    const I = [];
    for (let k = 0; k < pr.I.length; k += 3) { const a = pr.I[k], b = pr.I[k + 1], c = pr.I[k + 2]; if (Rb[a] === RI.cheveux && W[a * 3 + 1] > bord && W[b * 3 + 1] > bord && W[c * 3 + 1] > bord) continue; I.push(a, b, c); }
    // les pièces, soudées (un sommet par position, normale, rôle, os et couleur), à la suite du corps
    const pz = emettre(pr, pieces), n = n0 + pz.n;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C0 = new Float32Array(n * 3), R = new Uint8Array(n), MU = new Float32Array(n).fill(1), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    P.set(Pc); N.set(pr.N); C0.set(pr.C0); R.set(Rb); SI.set(pr.SI); SW.set(pr.SW);
    P.set(pz.P, n0 * 3); N.set(pz.N, n0 * 3); C0.set(pz.C, n0 * 3); R.set(pz.R, n0); MU.set(pz.MU, n0); SI.set(pz.SI, n0 * 4); SW.set(pz.SW, n0 * 4);
    for (const k of pz.I) I.push(n0 + k);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('normal', new T.BufferAttribute(N, 3)); geo.setAttribute('skinIndex', new T.BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(SW, 4));
    geo.setAttribute('color', new T.BufferAttribute(new Uint16Array(n * 3), 3, true));
    geo.setIndex(new T.BufferAttribute(n > 65535 ? new Uint32Array(I) : new Uint16Array(I), 1)); geo.computeBoundingSphere();
    etat.msRhabillage = Math.round((performance.now() - t0) * 10) / 10;
    return { geo, R, C0, MU, n, tris: I.length / 3, nCorps: n0 };
  }
  // les pièces en tableaux : chaque part dans le monde au repos, ramenée dans l'espace de liaison, en facettes ; os et poids par sommet
  function emettre(pr, parts) {
    const P = [], N = [], C = [], R = [], MU = [], SI = [], SW = [], I = [], vus = new Map(), q = (x, k) => Math.round(x * k);
    const iB = pr.iB, nm = new T.Matrix3().getNormalMatrix(iB), osDe = (nom) => (pr.osIdx.has(nom) ? pr.osIdx.get(nom) : 0);
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); if (p.m) g.applyMatrix4(p.m); g.computeVertexNormals(); // (sans indices : la normale de chaque face, des facettes)
      const pos = g.attributes.position, nor = g.attributes.normal, vc = p.vc && g.attributes.color, role0 = RI[p.role || 'fixe'], col0 = lin(p.col || BLANC);
      const fixe = p.poidsS ? null : typeof p.os === 'string' ? [[osDe(p.os), 1]] : null;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j), role = p.roles ? p.roles[j] : role0, mul = p.mul ? p.mul[j] : 1;
        const os = fixe || (p.poidsS ? p.poidsS[j] : p.os(x, y, z).map(([o, w]) => [typeof o === 'number' ? o : osDe(o), w]));
        const cr = vc ? vc.getX(j) : col0[0], cg = vc ? vc.getY(j) : col0[1], cb = vc ? vc.getZ(j) : col0[2];
        _v1.set(x, y, z).applyMatrix4(iB); _v2.set(nor.getX(j), nor.getY(j), nor.getZ(j)).applyMatrix3(nm).normalize();
        const cle = `${q(_v1.x, 1e4)},${q(_v1.y, 1e4)},${q(_v1.z, 1e4)},${q(_v2.x, 1e3)},${q(_v2.y, 1e3)},${q(_v2.z, 1e3)},${role},${q(mul, 100)},${q(cr, 1e3)},${q(cg, 1e3)},${q(cb, 1e3)},${os.map((x) => x[0] + ':' + q(x[1], 100)).join('|')}`;
        let k = vus.get(cle);
        if (k === undefined) {
          k = R.length; vus.set(cle, k); P.push(_v1.x, _v1.y, _v1.z); N.push(_v2.x, _v2.y, _v2.z); C.push(cr, cg, cb); R.push(role); MU.push(mul);
          const ww = os.filter((x) => x[1] > 0.001).slice(0, 4), s = ww.reduce((a, x) => a + x[1], 0) || 1;
          for (let i = 0; i < 4; i++) { SI.push(ww[i] ? ww[i][0] : 0); SW.push(ww[i] ? ww[i][1] / s : 0); }
        }
        I.push(k);
      }
      g.dispose();
    }
    return { P, N, C, R, MU, SI, SW, I, n: R.length };
  }

  // ═══ ce que portent le boulanger et les apprentis ═══
  // le boulanger : GAME.tenueBoulanger(st) ({ tete, haut, pieds, accessoire: { forme, metal } | null, aura }) et son titre (le rang : la hauteur de
  // la toque, le liseré doré, le foulard rouge, la moustache, le col), comme le chibi (src/persos.js, boulanger)
  function habitBoulanger(rang, garde) {
    rang = rang || 0; const TN = PERSOS.TENUES || {}, met = (p) => (p && p.metal && TN[p.metal]) || null;
    const tete = (garde && garde.tete) || { forme: 'toque', metal: null }, haut = (garde && garde.haut) || { forme: 'tablier', metal: null }, pieds = (garde && garde.pieds) || { forme: 'chaussures', metal: null }, acc = garde ? garde.accessoire : null;
    const th = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5), formeT = { toque: 'toque', casquette: 'casquette', chapeau: 'chapeau' }[tete.forme] || 'toque';
    const formeH = { tablier: 'tablier', sweat: 'sweat', cape: 'cape' }[haut.forme] || 'tablier', formeP = { chaussures: 'chaussures', baskets: 'baskets', bottes: 'bottes' }[pieds.forme] || 'chaussures', formeA = acc ? acc.forme : null;
    return { corps: 'Chef_Male', boulanger: true, rang, peau: '#FFD7B5', cheveux: L, veste: '#FF6B8B', pantalon: '#3E3540',
      tete: formeT, tnT: met(tete), hc: Math.max(2, th - 8), galonT: rang >= 4 || !!met(tete), metalT: !!met(tete),
      haut: formeH, tnH: met(haut), metalH: haut.metal || null, galonH: rang >= 4, reflet: !!met(haut), biais: false,
      pieds: formeP, tnP: met(pieds), metalP: pieds.metal || null,
      acc: formeA === 'lunettes' ? null : formeA, tnA: met(acc), metalA: acc ? acc.metal || null : null, lunettes: formeA === 'lunettes',
      foulard: formeA === 'foulard' ? 'acc' : formeA && formeA !== 'lunettes' ? null : rang >= 3 ? 'titre' : null,
      moustache: rang >= 3, col: rang >= 5, sueur: true, aura: (garde && garde.aura) || null, cle: false, etoile: false,
      cle0: `${rang}|${garde ? garde.cle : ''}` };
  }
  // les apprentis : toque et tablier blancs, la veste à la couleur de leur poste ; les grades (le biais du grade 2, l'étoile du 3, la toque
  // des 4 et 5, le liseré doré du 5) changent leurs couleurs et leurs os, pas leur géométrie
  const HABIT_APPRENTI = { tete: 'toque', hc: 6, galonT: true, metalT: false, haut: 'tablier', galonH: true, biais: true, reflet: false, pieds: 'chaussures', acc: null, lunettes: false, moustache: false, col: false, sueur: false, etoile: true, cle: true };
  function palette(h) {
    const TN = PERSOS.TENUES || {}, p = new Array(ROLES.length).fill(null), mel = (a, b, k) => { _c.set(a).lerp(new T.Color(b), k); return [_c.r, _c.g, _c.b]; };
    p[RI.peau] = lin(h.peau); p[RI.yeux] = lin(clair(h.peau) < 0.25 ? '#1A120D' : '#3A2A22'); p[RI.cheveux] = lin(h.cheveux); p[RI.pantalon] = lin(h.pantalon);
    p[RI.lunettes] = lin('#3A2A22'); p[RI.moustache] = lin('#8C5A3C'); p[RI.etoile] = lin(OR); p[RI.sueur] = lin('#9BD0FF'); p[RI.cle] = lin('#9A9A9A');
    // la tête
    const tT = h.tnT, cT = h.tete === 'casquette' ? tT || TN.quartier : h.tete === 'chapeau' ? tT || TN.hantee : tT;
    p[RI.teteTissu] = lin(cT ? cT.tissu : BLANC); p[RI.teteFonce] = lin(cT ? cT.fonce : '#D9D2C6'); p[RI.teteClair] = lin(cT ? cT.clair : BLANC); p[RI.teteBijou] = lin(cT ? cT.bijou || OR : OR);
    p[RI.galonT] = lin(h.galonOr ? OR : tT ? tT.fonce : BLANC);
    // le haut
    const tH = h.tnH, cH = h.haut === 'sweat' ? tH || TN.quartier : h.haut === 'cape' ? tH || TN.hantee : tH;
    const vesteHex = h.haut === 'sweat' ? cH.tissu : h.haut === 'cape' ? cH.clair : h.veste; p[RI.veste] = lin(vesteHex);
    p[RI.hautTissu] = lin(cH ? cH.tissu : BLANC); p[RI.hautFonce] = lin(cH ? cH.fonce : '#D9D2C6'); p[RI.hautClair] = lin(cH ? cH.clair : BLANC); p[RI.hautBijou] = lin(cH ? cH.bijou || OR : OR);
    p[RI.doublure] = lin(cH ? cH.fonce : '#D9D2C6'); p[RI.reflet] = lin(cH ? cH.clair : BLANC); p[RI.poche] = h.haut === 'sweat' ? mel(cH.tissu, BLANC, 0.12) : lin(BLANC);
    p[RI.galonH] = lin(h.galonOrH ? OR : tH ? tH.fonce : h.biaisOn ? M.assombrir(h.veste, 0.25) : BLANC);
    p[RI.biais] = h.biaisOn ? lin(M.assombrir(h.veste, 0.25)) : p[RI.hautTissu];
    // les pieds
    const tP = h.tnP;
    if (h.pieds === 'baskets') { const c = tP || TN.quartier; p[RI.chaussure] = lin(c.tissu); p[RI.semelle] = lin(BLANC); p[RI.bout] = lin(c.fonce); }
    else if (h.pieds === 'bottes') { const c = tP || TN.hantee; p[RI.chaussure] = p[RI.botte] = p[RI.bout] = lin(c.tissu); p[RI.semelle] = lin(M.assombrir(c.tissu, 0.45)); p[RI.piedFonce] = lin(c.fonce); p[RI.piedBijou] = lin(c.bijou || OR); }
    else if (tP) { p[RI.chaussure] = p[RI.bout] = lin(tP.tissu); p[RI.semelle] = lin(tP.fonce); }
    else if (h.chaussures) { p[RI.chaussure] = p[RI.bout] = lin(h.chaussures[0]); p[RI.semelle] = lin(h.chaussures[1]); }
    else { p[RI.chaussure] = p[RI.bout] = lin('#C8864F'); p[RI.semelle] = lin('#8B5A3C'); } // les sabots de bois
    if (!p[RI.botte]) p[RI.botte] = p[RI.pantalon];
    // l'accessoire et le foulard (le Band du Chef : le foulard de l'accessoire, le rouge du titre, sinon la couleur de la veste, un col)
    const tA = h.tnA; p[RI.accTissu] = lin(tA ? tA.tissu : ROUGE); p[RI.accFonce] = lin(tA ? tA.fonce : L); p[RI.accClair] = lin(tA ? tA.clair : '#FFF2C2'); p[RI.accBijou] = lin(tA ? tA.bijou || tA.fonce : OR);
    p[RI.citrouille] = lin(h.metalA === 'hantee-or' ? OR : '#FF8A3D');
    p[RI.boutons] = h.haut === 'sweat' ? p[RI.veste] : h.haut === 'cape' ? lin(cH.bijou || OR) : lin('#F6EEDF'); // (les boutons de la veste : crème ; le sweat n'en a pas ; la robe de la cape, dorés)
    p[RI.foulard] = h.foulard === 'acc' ? lin(tA ? tA.tissu : ROUGE) : h.foulard === 'titre' ? lin(ROUGE) : lin(M.assombrir(vesteHex, 0.12)); // (sans foulard : le nœud du Chef se fond dans la veste)
    return p;
  }
  function teindre(geo, R, C0, MU, pal) { // la couleur de chaque sommet : son rôle dans la palette (× sa nuance), sinon sa couleur d'origine
    const col = geo.attributes.color, d = col.array;
    for (let i = 0; i < R.length; i++) { const p = pal[R[i]], k = MU[i] * 65535; if (p) { d[i * 3] = Math.min(65535, p[0] * k); d[i * 3 + 1] = Math.min(65535, p[1] * k); d[i * 3 + 2] = Math.min(65535, p[2] * k); } else { d[i * 3] = C0[i * 3] * 65535; d[i * 3 + 1] = C0[i * 3 + 1] * 65535; d[i * 3 + 2] = C0[i * 3 + 2] * 65535; } }
    col.needsUpdate = true;
  }

  // ═══ les clips : ceux des clients (Idle, Walk, Victory…) et ceux de l'équipe ; la joie, la réparation : le haut du corps ═══
  const CL = {};
  function clips(...listes) {
    for (const l of listes) for (const c of l) CL[c.name] = c;
    const haut = (c, nom) => new T.AnimationClip(nom, c.duration, c.tracks.filter((t) => !OS.basDuCorps.test(t.name.split('.')[0])));
    if (CL.Cheering) CL.__joie = haut(CL.Cheering, 'joie'); else if (CL.Victory) CL.__joie = haut(CL.Victory, 'joie');
    if (CL.Hammering) CL.__repare = haut(CL.Hammering, 'repare');
  }

  // ═══ la préparation, à petits pas (src/scene.js l'appelle à chaque image, tant que l'image n'a pas passé 6 ms, un pas au moins) : les clips ;
  //     chaque corps, une partie par pas, ses mesures, son gabarit ; la géométrie partagée des apprentis ; la réserve, un acteur par pas ═══
  const PROTOS = {}; let iCuit = 0, enCours = null, echec = false, aRemplir = false, clipsLus = false, geoApp = 0;
  function preparer() {
    if (API.pret) { if (aRemplir) remplir(); return true; }
    if (echec || !HDM.pret('equipe')) return false;
    const t0 = performance.now();
    try { do { const t1 = performance.now(), quoi = etape(), d = performance.now() - t1; if (d > (etat.pasMax || 0)) { etat.pasMax = Math.round(d * 10) / 10; etat.pasLent = quoi; } } while (!API.pret && performance.now() - t0 < 6); }
    catch (e) { echec = true; API.erreur = String((e && e.message) || e); console.warn('Équipe 3D : pas préparée, les chibis restent', API.erreur); }
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
    if (geoApp < noms.length) { const pr = PROTOS[noms[geoApp++]]; pr.app = geometrie(pr, HABIT_APPRENTI); pr.app.geo.userData.partagee = true; return 'apprentis ' + pr.nom; }
    for (const nom of noms) { const l = LIBRES.get(nom) || []; LIBRES.set(nom, l); if (TOUS.filter((a) => a.pr.nom === nom && !a.boul).length < RESERVE) { l.push(creerApprenti(PROTOS[nom])); return 'réserve'; } }
    etat.chauffe = false; API.pret = true; return 'prêt';
  }

  // ═══ les acteurs : un clone du gabarit, sa géométrie (les attributs partagés de celle des apprentis, sa couleur ; ou la sienne pour le
  //     boulanger), son mélangeur ═══
  const MAT = { lambert: null };
  function materiau() { if (!MAT.lambert) { MAT.lambert = new T.MeshLambertMaterial({ vertexColors: true }); M.partager(MAT.lambert); } return MAT.lambert; }
  const LIBRES = new Map(), TOUS = []; const RESERVE = 2; let nGraines = 0;
  function squelette(pr) { // (sa graine : le décalage de ses clips et de ses gestes ; sans Math.random, qui reste à la vie de la boutique)
    const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; });
    S.material = materiau(); S.castShadow = true; S.frustumCulled = false; g.visible = false;
    const nomme = (n) => g.getObjectByName(n), a = { g, S, pr, mixer: new T.AnimationMixer(g), actions: {}, joue: '', couches: {}, yaw: 0, graine: (0.17 + 0.618034 * nGraines++) % 1 };
    a.os = { tete: nomme(OS.tete), cou: nomme(OS.cou), torse: nomme(OS.torse), mainD: nomme(OS.mainD), mainG: nomme(OS.mainG), avantD: nomme(OS.avantD), avantG: nomme(OS.avantG), brasD: nomme(OS.brasD), brasG: nomme(OS.brasG), toque: nomme('accToque'), toqueHaut: nomme('accToqueHaut'), sueur: nomme('accSueur'), etoile: nomme('accEtoile'), lanterne: nomme('accLanterne'), cle: nomme('accCle') };
    a.sauve = [a.os.brasD, a.os.avantD, a.os.mainD, a.os.brasG, a.os.avantG, a.os.mainG, a.os.tete, a.os.cou, a.os.torse].filter(Boolean).map((b) => [b, b.quaternion.clone(), b.position.clone()]);
    TOUS.push(a); etat.acteurs = TOUS.length; return a;
  }
  function creerApprenti(pr) {
    const a = squelette(pr), src = pr.app.geo, geo = new T.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(k, src.attributes[k]);
    geo.setIndex(src.index); geo.boundingSphere = src.boundingSphere; geo.setAttribute('color', new T.BufferAttribute(new Uint16Array(pr.app.n * 3), 3, true));
    a.S.geometry = geo; a.habit = pr.app; a.g.userData.e3d = a; a.g.userData.cle = 'e3d'; return a;
  }
  function remplir() { for (const nom of Object.keys(PROTOS)) { const l = LIBRES.get(nom) || []; LIBRES.set(nom, l); if (TOUS.filter((a) => a.pr.nom === nom && !a.boul).length < RESERVE) { l.push(creerApprenti(PROTOS[nom])); return; } } aRemplir = false; etat.chauffe = false; }

  // ─── le boulanger : un seul acteur, rhabillé sur place (sa géométrie refaite, l'ancienne rendue ; même squelette, même mélangeur) ───
  let BOUL = null;
  function boulanger(rang, garde) {
    if (!API.pret || !PROTOS.Chef_Male) return null;
    if (!BOUL) { BOUL = squelette(PROTOS.Chef_Male); BOUL.boul = true; BOUL.g.userData.e3d = BOUL; BOUL.g.userData.cle = 'e3d-boulanger'; }
    rhabiller(BOUL, rang, garde); BOUL.g.visible = true; if (!BOUL.service) { BOUL.service = true; etat.enService++; } return BOUL; // (rhabillé sur place : compté une fois)
  }
  function rhabiller(a, rang, garde) {
    const h = habitBoulanger(rang, garde); if (a.cleHabit === h.cle0 && a.habit) return false;
    const vieux = a.S.geometry, x = geometrie(a.pr, h);
    a.S.geometry = x.geo; if (vieux && !vieux.userData.partagee && vieux !== x.geo) vieux.dispose();
    h.galonOr = rang >= 4; h.galonOrH = rang >= 4; teindre(x.geo, x.R, x.C0, x.MU, palette(h));
    a.habit = x; a.h = h; a.cleHabit = h.cle0; etat.rhabillages++;
    // l'aura : un sprite dressé derrière lui (un appel de dessin de plus), qui respire
    if (h.aura && !a.aura) { a.aura = new T.Sprite(auraMat()); a.aura.renderOrder = -1; a.aura.castShadow = false; a.g.add(a.aura); }
    else if (!h.aura && a.aura) { a.g.remove(a.aura); a.aura.material.dispose(); a.aura = null; }
    a.g.userData.tenue = garde && garde.tete && ['or', 'argent', 'bronze'].includes(garde.tete.metal) ? garde.tete.metal : null; a.g.userData.garde = garde || null;
    a.g.userData.parts = { aura: a.aura || null };
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
    const V = typeof VIE !== 'undefined' ? VIE : null, i = a.i, h = { peau: V ? V.PEAUX6[i % 6] : '#FFD7B5', cheveux: V ? V.CHEVEUX[i % V.CHEVEUX.length] : L, veste: V ? V.HAUTS6[(i * 2 + 1) % 6] : '#FF9FB2', pantalon: '#3E3540', tete: 'toque', haut: 'tablier', pieds: 'chaussures', chaussures: ['#6B4A3A', '#3E2C22'], galonOr: grade >= 5, galonOrH: grade >= 5, biaisOn: grade >= 2, foulard: null };
    teindre(a.S.geometry, a.habit.R, a.habit.C0, a.habit.MU, palette(h));
    a.os.etoile.scale.setScalar(grade >= 3 ? 1 : 0);
    a.os.toqueHaut.position.copy(a.pr.hautTete).multiplyScalar(hautFutPlus(a.pr, grade >= 5 ? 10 : grade >= 4 ? 6 : 0)); // la toque grandit aux grades 4 et 5 (+6, +10 unités des chibis)
  }
  function rendre(a) {
    if (!a) return; a.mixer.stopAllAction(); a.joue = ''; a.couches = {}; a.g.visible = false; if (a.g.parent) a.g.parent.remove(a.g);
    if (a.plateau) { a.g.remove(a.plateau); a.plateau = null; }
    if (a.service) { a.service = false; etat.enService = Math.max(0, etat.enService - 1); }
    if (a.boul) return; // (le boulanger garde sa géométrie : il revient tel quel)
    a.c = 0; for (const b of [a.os.cle, a.os.lanterne]) if (b) b.scale.setScalar(0);
    const l = LIBRES.get(a.pr.nom) || []; l.push(a); LIBRES.set(a.pr.nom, l);
  }
  function liberer() { // la HD interdite depuis 10 s (src/scene.js) : la réserve et le boulanger rendent leur mémoire (les gabarits restent)
    if (!TOUS.length || TOUS.some((a) => a.g.visible && a.g.parent)) return false;
    for (const a of TOUS) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.S.skeleton.dispose(); a.S.geometry.dispose(); if (a.aura) a.aura.material.dispose(); if (a.g.parent) a.g.parent.remove(a.g); }
    TOUS.length = 0; LIBRES.clear(); BOUL = null; etat.acteurs = 0; etat.liberes++; aRemplir = true; return true;
  }
  function chauffer() { if (etat.chauffe || !API.pret) return null; const gs = []; for (const l of LIBRES.values()) for (const a of l) { a.g.position.set(0, -5000, 0); a.g.scale.setScalar(1); a.g.visible = true; gs.push(a.g); } etat.chauffe = true; etat.chauffes = (etat.chauffes || 0) + 1; return gs; }
  function rentrer(gs) { for (const g of gs || []) { const a = g.userData.e3d; if (a && a.c) continue; if (g.parent) g.parent.remove(g); g.visible = false; } }
  function echantillon() { for (const l of LIBRES.values()) if (l.length) return l[0].g; return null; }

  // ─── l'aura phosphorescente : un dégradé radial teinté de vert, comme celle du chibi ───
  let TEX_AURA = null;
  function auraMat() {
    if (!TEX_AURA) { TEX_AURA = M.texture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64); TEX_AURA.userData.partagee = true; }
    return new T.SpriteMaterial({ map: TEX_AURA, color: '#7CFF6B', transparent: true, opacity: 0.44, depthWrite: false });
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

  // ═══ poser le boulanger : derrière le comptoir, face à la salle ; respiration (Idle), la joie, ses gestes, la sueur, la lanterne, l'aura ═══
  // o : { t, hop, rush } (l'état de VIE, comme animerBoulanger des chibis) ; ctx : { K, x, y (monde), z, echelle (× HAUT) }
  function poserBoulanger(a, o, dt, ctx) {
    const g = a.g, pr = a.pr, s = HAUT * ctx.K * (ctx.echelle || 1) / pr.hauteur * (pr.echelle || 1), t = o.t || 0, hop = o.hop || 0;
    g.scale.setScalar(s); a.yaw = angleCourt(a.yaw + angleCourt((ctx.yaw || 0) - a.yaw) * Math.min(1, dt * 8)); g.rotation.y = a.yaw;
    jouer(a, 'Idle', 0.3);
    // la joie : un départ de hop (une vente, un toucher : VIE le remet à 1, puis il retombe de 4 par seconde ; on guette sa remontée, que
    // l'image soit à 60 ou à 30 i/s) lance Cheering, le haut du corps, 1,4 s ; pas plus d'une fois toutes les 5 s (entre deux, le petit saut)
    a.joieT = Math.max(0, (a.joieT || 0) - dt); a.joieAttente = Math.max(0, (a.joieAttente || 0) - dt);
    if (hop > (a.hopP || 0) + 0.02 && a.joieAttente <= 0) { a.joieT = 1.4; a.joieAttente = 5; }
    a.hopP = hop;
    restaurer(a); a.mixer.update(dt); garderPose(a);
    const u = a.joieT > 0 ? 1 - a.joieT / 1.4 : 1; couche(a, '__joie', a.joieT > 0 ? Math.min(1, u * 6, (1 - u) * 4) : 0, 4);
    g.position.set(ctx.x, ctx.y - pr.sol * s + hop * hop * 4 * ctx.K, ctx.z); g.updateMatrixWorld(true);
    // ses gestes, au repos (pas pendant la joie ni le coup de feu) : toutes les 11 s, le revers de la main sur le front ; ou il se frotte les mains
    const os = a.os, w = (t * 0.09 + a.graine) % 1;
    if (!o.rush && a.joieT <= 0 && !o.vue) {
      if (w < 0.07) { // (le front : au-dessus de l'os de la tête, devant le visage ; la main va et vient de côté)
        const k = Math.sin(w / 0.07 * Math.PI), d = pr.dessus * s; _v2.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); _v3.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
        posM(os.tete, _v1); _v1.y += d * 0.5; _v1.addScaledVector(_v2, d * 0.62).addScaledVector(_v3, -d * 0.12 - Math.sin(t * 9) * 0.1 * d * k); ikBras(os.brasD, os.avantD, os.mainD, _v1, k * 0.95);
      }
      else if (w > 0.5 && w < 0.58) { const k = Math.sin((w - 0.5) / 0.08 * Math.PI), f = Math.sin(t * 16) * 0.05 * pr.hauteur * s; posM(os.torse, _v1); _v1.y -= 0.12 * pr.hauteur * s; _v1.x += Math.sin(a.yaw) * 0.16 * pr.hauteur * s; _v1.z += Math.cos(a.yaw) * 0.16 * pr.hauteur * s; _v2.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); _v3.copy(_v1).addScaledVector(_v2, -0.02 * pr.hauteur * s + f); _v4.copy(_v1).addScaledVector(_v2, 0.02 * pr.hauteur * s + f); ikBras(os.brasD, os.avantD, os.mainD, _v3, k); ikBras(os.brasG, os.avantG, os.mainG, _v4, k); }
    }
    // la sueur pendant le coup de feu, la lanterne à la main droite
    if (os.sueur) { const on = !!o.rush; if ((os.sueur.scale.x > 0) !== on) os.sueur.scale.setScalar(on ? 1 : 0); }
    if (a.h && a.h.acc === 'lanterne') { posM(os.mainD, _v1); _v1.y -= 0.025 * pr.hauteur * s; _q1.setFromAxisAngle(AXE_Y, a.yaw + Math.sin(t * 2.2) * 0.15); tenir(os.lanterne, _v1, _q1, ctx.K * (ctx.echelle || 1) * 0.85); } else tenir(os.lanterne, null);
    if (a.aura) { const k = Math.sin(t * 1.4), k2 = Math.sin(t * 0.53 + 1), uu = pr.hauteur / 73; a.aura.material.opacity = 0.44 + 0.1 * k + 0.04 * k2; a.aura.position.set(0, 36 * uu, -8 * uu); a.aura.scale.set((68 + 3 * k) * uu, (90 + 4 * k + 2 * k2) * uu, 1); }
  }

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
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
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
  function cadrer() { // la caméra : le boulanger entier, toque comprise, un peu en plongée, le haut du corps au centre
    if (!V3) return; const h = V3.a ? V3.a.pr.hauteur * (V3.a.h && V3.a.h.tete === 'toque' ? 1 + hautFut(V3.a.pr, V3.a.h.hc) * 0.9 + 0.12 : 1.12) : 2.1;
    const fov = V3.camera.fov * Math.PI / 180, aspect = V3.camera.aspect, d = Math.max(h * 0.6 / Math.tan(fov / 2), (h * 0.36) / (Math.tan(fov / 2) * aspect)) * 1.04, cy = h * 0.47;
    V3.camera.position.set(0, cy + d * Math.sin(0.2), d * Math.cos(0.2)); V3.camera.lookAt(0, cy - 0.02 * h, 0); V3.cible = h;
  }
  function habillerVue(joie) { // l'acteur de la vue (le sien), rhabillé à la tenue portée
    if (!V3) return; const st = V3.ctx.st;
    V3.el.querySelector('[data-mb="sous"]').textContent = `${GAME.titre(st)} · ${GAME.ensembleComplet(st) ? GAME.GARDEROBE.ensembles[GAME.ensembleComplet(st)].nom : 'tenue pièce par pièce'}`;
    if (!API.pret) return; const pr = PROTOS.Chef_Male; if (!pr) return;
    if (!V3.a) { V3.a = squelette(pr); TOUS.pop(); etat.acteurs = TOUS.length; V3.a.vue = true; V3.a.S.material = V3.mat; V3.a.S.castShadow = true; V3.a.g.visible = true; V3.scene.add(V3.a.g); jouer(V3.a, 'Idle', 0); const at = V3.el.querySelector('[data-mb="attente"]'); if (at) at.remove(); }
    rhabiller(V3.a, GAME.rangTitre(st), GAME.tenueBoulanger(st)); cadrer();
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
    if (!API.pret) { HDM.charger('boutique'); demander(); preparer(); if (API.pret) habillerVue(false); }
    const a = V3.a;
    if (a) {
      // l'élan du doigt, puis le retour doux face à soi (un léger balancement) deux secondes après
      if (V3.t - V3.touche > 0.05) { V3.yaw += V3.vyaw * dt; V3.vyaw *= Math.pow(0.04, dt); }
      if (V3.t - V3.touche > 2.2) { const cible = 0.32 * Math.sin(V3.t * 0.5); V3.yaw += angleCourt(cible - V3.yaw) * Math.min(1, dt * 1.6); }
      const K = a.pr.hauteur / HAUT; a.yaw = V3.yaw; a.g.rotation.y = V3.yaw;
      poserBoulanger(a, { t: V3.t, hop: 0, rush: false, vue: true }, dt, { K, x: 0, y: 0, z: 0, yaw: V3.yaw });
      if (VUE.liaison) { a.S.skeleton.pose(); a.g.position.y = -a.pr.m.piedsY0; } // (mise au point : la pose de liaison, en T)
      a.yaw = V3.yaw; a.g.rotation.y = V3.yaw;
      if (a.aura) { const u = a.pr.hauteur / 73; a.aura.position.set(Math.sin(-V3.yaw) * -8 * u, 36 * u, Math.cos(-V3.yaw) * -8 * u); } // (l'aura reste derrière lui, face à la caméra, quand il tourne)
      a.g.updateMatrixWorld(true);
    }
    V3.renderer.render(V3.scene, V3.camera);
  }
  function boucleVue(n) { if (!V3) return; const dt = V3.der ? Math.min(0.1, (n - V3.der) / 1000) : 1 / 60; V3.der = n; imageVue(dt); V3.raf = requestAnimationFrame(boucleVue); }
  function fermerVue() {
    if (!V3) return; const v = V3; V3 = null; VUE.ouvert = false;
    if (v.raf) cancelAnimationFrame(v.raf); if (v.ro) v.ro.disconnect();
    if (v.a) { const a = v.a; a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.S.skeleton.dispose(); a.S.geometry.dispose(); if (a.aura) a.aura.material.dispose(); }
    v.estrade.geometry.dispose(); v.estrade.material.dispose(); v.scene.traverse((o) => { if (o.isMesh && o !== v.estrade && o.geometry && !(v.a && o === v.a.S)) { o.geometry.dispose(); if (o.material && o.material !== v.mat) o.material.dispose(); } }); v.mat.dispose();
    try { v.renderer.dispose(); v.renderer.forceContextLoss(); } catch (e) { /* rien */ }
    v.el.remove();
    if (v.ctx && v.ctx.ferme) v.ctx.ferme();
  }
  const tournerVue = (y) => { if (V3) { V3.yaw = y; V3.vyaw = 0; V3.touche = V3.t + 1e6; } }; // (les captures : un angle tenu)
  Object.assign(VUE, { ouvrir: ouvrirVue, fermer: fermerVue, image: imageVue, tourner: tournerVue }); Object.defineProperty(VUE, 'etat', { enumerable: true, get() { return V3 ? { piece: V3.piece, yaw: +V3.yaw.toFixed(3), tenue: V3.a ? V3.a.cleHabit : '', tris: V3.a ? V3.a.habit.tris : 0, aura: !!(V3.a && V3.a.aura), formes: V3.a ? { tete: V3.a.h.tete, haut: V3.a.h.haut, pieds: V3.a.h.pieds, acc: V3.a.h.acc, lunettes: V3.a.h.lunettes } : null, joie: !!(V3.a && V3.a.joieT > 0), images: V3.images, appels: V3.renderer.info.render.calls, triangles: V3.renderer.info.render.triangles } : null; } }); // (un accesseur : Object.assign le figerait)

  Object.assign(API, { actif: true, HAUT, permis, demander, preparer, boulanger, rhabiller, poserBoulanger, apprenti, poserApprenti, rendre, liberer, chauffer, rentrer, echantillon, tete, mesure, PROTOS, CL, habitBoulanger, geometrie, facade, vue: VUE }); // (PROTOS, CL, habitBoulanger, geometrie, facade : pour les tests et la mise au point)
  Object.defineProperty(API, 'etat', { enumerable: true, get: () => Object.assign({ libres: [...LIBRES.values()].reduce((s, l) => s + l.length, 0) }, etat) });
  return API;
})();
if (typeof module !== 'undefined') module.exports = EQUIPE3D;
