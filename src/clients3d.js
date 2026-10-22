/* LE FOURNIL — MAQUETTE, jamais par défaut : les clients de la boutique en personnages GLB animés, et une caméra plus basse.
   Sans ?clients= ni ?cam= dans l'adresse, rien ne change : CLIENTS3D.actif est faux, CLIENTS3D.cam est vide, la scène garde ses
   chibis et sa caméra (src/scene.js ne passe par ici que si l'un des deux est demandé).
   · ?clients=a : Quaternius, Ultimate Animated Character Pack (CC0) : sept personnages, leurs clips Idle, Walk, SitDown, Victory ;
     ?clients=b : Kenney, Animated Characters « Protagonists » (CC0) : un maillage, trois peaux repeintes, des clips reciblés hors ligne
                  depuis l'UACP (le pack n'a que idle, run et jump) ;
     ?clients=c : Quaternius, Ultimate Modular Men & Women (CC0, réalistes) : six personnages, Idle et Walk du pack, Sit et Cheer reciblés.
     Les fichiers sont dans fournil/hd/clients-a|b|c/. Chaque personnage est CUIT au chargement, comme les monstres de la boutique hantée
     (src/boutiquehantee.js, cuire()) : tous ses maillages fusionnés sur un seul squelette, ses couleurs en couleurs de sommets reteintes
     aux palettes du jeu (la peau, les cheveux et le haut que VIE tire pour chaque client ; le bas d'une petite palette), le croissant et
     la tasse accrochés à l'os de la main (deux os ajoutés, d'échelle nulle quand ils sont rangés) : UN appel de dessin par client.
     Mêmes états que les chibis (VIE : entre, attend, vaTable, assis, sort) : la marche (cadencée sur le pas réel), l'attente, s'asseoir
     (le clip, puis les pieds posés au sol par un petit IK de jambe), manger (un IK du bras amène la main à la bouche : le croissant ou la
     tasse), la joie quand il est servi (le haut du corps du clip de victoire, par-dessus la marche). Le boulanger et les apprentis restent
     des chibis. Qualité haute ou moyenne (WebGL2) seulement ; en éco, ou si un fichier manque : les chibis.
   · ?cam=basse : la caméra orthographique inclinée à 33° au lieu de 52°, un peu rapprochée, les visages plus de face. Seule la caméra
     change : les zones de touche des meubles achetés suivent (elles sont projetées par la caméra), mais le calque 2D (prix, pastilles,
     noms des habitués, bulles), les zones des emplacements vides et le chat restent calés sur le plan vu à 52° (c'est une maquette). */
const CLIENTS3D = (() => {
  'use strict';
  const RECH = typeof location !== 'undefined' ? location.search : '';
  const mp = /[?&]clients=([abc])(?:&|$)/.exec(RECH), CAM = /[?&]cam=basse(?:&|$)/.test(RECH) ? 'basse' : '';
  const T = typeof THREE !== 'undefined' ? THREE : null, X = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
  const API = { actif: false, pack: '', cam: CAM, pret: false, erreur: '', info: null, permis: () => false, charger: () => Promise.resolve(false), acteur: () => null, poser: () => {}, rendre: () => {}, cameraBasse: null };

  // ─── la caméra basse : orthographique, tangage de 33°, cadrée pour montrer le même morceau du plan (du haut du mur jusqu'au bas visible),
  //     rapprochée de 1 à 1,2 fois (les côtés sont un peu rognés) ───
  const PITCH_B = 33 * Math.PI / 180;
  function cameraBasse(cam, o) { // o : { W, H, murH (px), wy, wz, bas (le bas visible, px du plan) }
    const c = Math.cos(PITCH_B), s = Math.sin(PITCH_B), Hm = o.wy(o.murH), bas = Math.max(o.murH + 60, Math.min(o.H, o.bas)), zb = o.wz(bas), m = 6;
    const sh = Hm * c, sb = -zb * s, z = Math.max(1, Math.min(1.2, (bas - m) / (sh - sb)));
    cam.left = -o.W / (2 * z); cam.right = o.W / (2 * z); cam.top = sh + m / z; cam.bottom = cam.top - o.H / z; cam.updateProjectionMatrix();
    cam.position.set(o.W / 2, 1500 * s, 1500 * c); cam.up.set(0, 1, 0); cam.lookAt(o.W / 2, 0, 0); cam.updateMatrixWorld();
    return z;
  }
  if (CAM && T) API.cameraBasse = cameraBasse;
  if (!mp || !T || !X || typeof document === 'undefined') return API;

  // ═══ les packs ═══
  // os : les noms des os tels que les lit GLTFLoader (« Fist.R » → « FistR ») ; bouche : un point devant la bouche, dans le repère du
  // personnage (relatif à l'os de la tête, unités du modèle) ; haut : la hauteur visée (unités du monde, × K × taille du client) ;
  // bas : les pistes que la joie ne touche pas (les jambes, le bassin) ; roles(nomMatériau, perso) → le rôle de la couleur
  const PACKS = {
    a: { dossier: 'clients-a/', persos: ['Casual_Female', 'Casual2_Male', 'Casual3_Male', 'OldClassy_Female', 'Worker_Female', 'Casual_Bald', 'OldClassy_Male'], anims: 'anims-a',
      clips: { idle: 'Idle', marche: 'Walk', assis: 'SitDown', assisIdle: null, joie: 'Victory' }, haut: 74, prise: 0.075,
      os: { main: 'FistR', avant: 'LowerArmR', bras: 'UpperArmR', tete: 'Head', bassin: 'Body', cuisses: ['UpperLegL', 'UpperLegR'], tibias: ['LowerLegL', 'LowerLegR'], pieds: ['FootL', 'FootR'], piedsIK: true, assise: /^(Body|Hips|UpperLeg)/ },
      bas: /^(Bone|Body|UpperLeg|LowerLeg|Foot|PoleTarget)/, bouche: [0, 0.075, 0.2],
      roles: (n, p) => (/^Skin$/.test(n) ? 'peau' : /^Face$/.test(n) ? 'yeux' : /^Hair$/.test(n) ? (/OldClassy/.test(p) ? 'gris' : 'cheveux') : /^(Shirt|Clothes|Main)$/.test(n) ? 'haut' : /^(Pants|DarkClothes)$/.test(n) ? 'bas' : /^Hat$/.test(n) ? (/OldClassy/.test(p) ? 'hautForme' : 'chapeau') : 'fixe') },
    b: { dossier: 'clients-b/', persos: ['characterMedium'], peaux: ['skaterMaleA', 'skaterFemaleA', 'criminalMaleA'], anims: 'anims-b',
      clips: { idle: 'Idle', marche: 'Walk', assis: 'Sit_Down', assisIdle: 'Sit_Idle', joie: 'Cheer' }, haut: 72, prise: 0.04,
      os: { main: 'RightHand', avant: 'RightForeArm', bras: 'RightArm', tete: 'Head', bassin: 'Hips', cuisses: ['LeftUpLeg', 'RightUpLeg'], tibias: ['LeftLeg', 'RightLeg'], pieds: ['LeftFoot', 'RightFoot'], piedsIK: false, assise: /^(Hips|LeftUpLeg|RightUpLeg)$/ },
      bas: /(UpLeg|Leg|Foot|Toes|Ctrl|Roll|IK)$|^(Hips|Root)$/, bouche: [0, 0.055, 0.15], texture: true },
    c: { dossier: 'clients-c/', persos: ['F_Casual', 'H_Casual_Hoodie', 'F_Formal', 'H_Casual_2', 'H_Farmer', 'F_Suit'], anims: 'anims-c',
      clips: { idle: 'Idle', marche: 'Walk', assis: 'Sit_Down', assisIdle: 'Sit_Idle', joie: 'Cheer' }, haut: 68, prise: 0.03,
      os: { main: 'WristR', avant: 'LowerArmR', bras: 'UpperArmR', tete: 'Head', bassin: 'Body', cuisses: ['UpperLegL', 'UpperLegR'], tibias: ['LowerLegL', 'LowerLegR'], pieds: ['FootL', 'FootR'], piedsIK: true, assise: /^(Body|Hips|UpperLeg)/ },
      bas: /^(Root|Body|UpperLeg|LowerLeg|Foot|PT)/, bouche: [0, 0.02, 0.085],
      roles: (n, p) => {
        const R = { F_Casual: { White: 'haut', Orange: 'bas', Hair_Blond: 'cheveux', Hair_Brown: 'sourcils' }, H_Casual_Hoodie: { Purple: 'haut', LightBlue: 'bas', Hair: 'cheveux', Eyebrows: 'sourcils' },
          F_Formal: { LimeGreen: 'haut', Red: 'cheveux' }, H_Casual_2: { LightBrown: 'haut', LightBlue: 'bas', Hair: 'cheveux', Eyebrows: 'sourcils', Skin_Darker: 'peauOmbre' }, H_Farmer: { LightBlue: 'bas', Eyebrows: 'sourcils' },
          F_Suit: { Black: 'hautSombre', Hair_Blond: 'cheveux', Hair_Brown: 'sourcils' } }[p] || {};
        return n === 'Skin' ? 'peau' : R[n] || 'fixe';
      } },
  };
  const P = PACKS[mp[1]];
  // la hauteur d'assise par coin (unités du monde : src/meubles.js, chaises et tabourets à 16, la banquette plus basse)
  const ASSISE = { table: 16, terrasse: 16, bar: 16, banquette: 12 };
  const BAS = ['#4A5A78', '#5B4A3A', '#3E4A5C', '#8A7A66', '#33363F', '#6B5B7A']; // les pantalons (le jeu ne tire pas de bas)
  const CHAPEAUX = ['#C8553D', '#E0B84E', '#3E6E8E', '#5B8E7D', '#D9CAB3', '#8E5B8A'], FORMES = ['#26262C', '#4A3328', '#2F3A55', '#5E2A35']; // les casquettes ; les hauts-de-forme (A)
  const YAW = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI };

  // ─── le chargement (le chargeur de src/hd.js, meshopt) ───
  const L = new X.GLTFLoader(); if (X.MeshoptDecoder) L.setMeshoptDecoder(X.MeshoptDecoder);
  const lire = (u) => new Promise((ok, ko) => L.load('hd/' + P.dossier + u, ok, null, ko));
  const image = (u) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = 'hd/' + P.dossier + u; });
  let promesse = null; const SRC = {}, IMG = {}; let CLIPS = null;
  const permis = (renderer) => { try { return !!(renderer && renderer.capabilities.isWebGL2 && typeof SCENE !== 'undefined' && SCENE.palier !== 'eco'); } catch (e) { return false; } };
  function charger() {
    if (promesse) return promesse;
    const t = [lire(P.anims + '.glb').then((g) => { CLIPS = g.animations; })];
    for (const n of P.persos) t.push(lire(n + '.glb').then((g) => { SRC[n] = g; }));
    for (const n of P.peaux || []) t.push(image(n + '.png').then((im) => { IMG[n] = im; }));
    promesse = Promise.all(t).then(() => { preparer(); API.pret = true; return true; }).catch((e) => { API.erreur = String((e && e.message) || e); console.warn('Clients 3D (maquette) : pas chargés, les chibis restent', API.erreur); return false; });
    return promesse;
  }

  // ─── les couleurs : rôles → couleurs (linéaires) ───
  const _c = new T.Color();
  function palette(c) { // c : le client de VIE
    const h = (c.id * 2654435761) >>> 0, peau = c.peau || '#FFD7B5', ch = c.cheveux || '#4A3328', haut = c.haut || '#FF9FB2';
    const L2 = (hex, k) => { _c.set(hex); if (k != null) _c.multiplyScalar(k); return [_c.r, _c.g, _c.b]; };
    return { peau: L2(peau), peauOmbre: L2(peau, 0.85), cheveux: L2(ch), sourcils: L2(ch, 0.55), gris: L2('#DCD8D0'), haut: L2(haut), hautSombre: L2(haut, 0.45), bas: L2(c.or ? '#E0A61E' : BAS[h % BAS.length]), yeux: L2('#3A2A22'), chapeau: L2(CHAPEAUX[(h >>> 5) % CHAPEAUX.length]), hautForme: L2(FORMES[(h >>> 9) % FORMES.length]) };
  }

  // ═══ la cuisson d'un personnage : tous ses maillages sur le squelette du premier (v' = B0⁻¹ · BI0ⱼ⁻¹ · BIⱼ · B · v, l'os dominant),
  //     un rôle de couleur par sommet, le croissant et la tasse sur deux os ajoutés sous la main ═══
  const PROTOS = [];
  function accessoires() { // le croissant (la pâtisserie n° 1 du jeu) et une tasse : des géométries à couleurs de sommets, ~16 d'envergure, posées sur y = 0
    const M = MODELES, cr = M.assembler(PERSOS.partsPatisserie(1));
    const tasse = M.assembler([M.part(M.cylindre(4.2, 3.6, 8, 14), '#FFFFFF'), M.part(M.cylindre(3.7, 3.7, 0.6, 14), '#6B4226', { y: 7.2 }), M.part(M.tore(2.2, 0.8, Math.PI * 2, 6, 12), '#FFFFFF', { x: 4.4, y: 4.4 }), M.part(M.cylindre(6, 6, 0.6, 16), '#F2E6D8', { y: -0.6 })]);
    return { cr, tasse };
  }
  function cuire(nom, src) {
    src.updateMatrixWorld(true);
    let S0 = null; src.traverse((o) => { if (!S0 && o.isSkinnedMesh) S0 = o; });
    const bones = S0.skeleton.bones, idx = new Map(bones.map((b, i) => [b.name, i])), iB = S0.bindMatrix.clone().invert(), BI0 = S0.skeleton.boneInverses.map((m) => m.clone().invert());
    const parts = [];
    src.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const remap = o.skeleton.bones.map((b) => (idx.has(b.name) ? idx.get(b.name) : 0));
      parts.push({ mesh: o, remap, Mj: o.skeleton.boneInverses.map((bi, j) => iB.clone().multiply(BI0[remap[j]]).multiply(bi).multiply(o.bindMatrix)) });
    });
    // les accessoires : deux os sous la main, d'inverse de liaison identité : leurs sommets sont en coordonnées locales de l'os (la géométrie
    // est quantifiée par meshopt : son espace n'est pas celui du monde au repos ; l'os seul porte la place, l'orientation et la taille)
    const acc = accessoires(), main = idx.get(P.os.main), accBones = [], accInv = [];
    for (const nomAcc of ['accCroissant', 'accTasse']) { const bo = new T.Bone(); bo.name = nomAcc; bo.scale.setScalar(0); accBones.push(bo); accInv.push(iB.clone()); } // (inverse = B⁻¹ : monde = os · v, quelle que soit la liaison du maillage)
    // les tableaux : positions, normales, rôles (et couleur d'origine), os et poids, uv (pack à texture)
    let n = 0, ni = 0; for (const p of parts) { const g = p.mesh.geometry; n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    for (const a of [acc.cr, acc.tasse]) { n += a.attributes.position.count; ni += a.attributes.position.count; }
    const Pp = new Float32Array(n * 3), N = new Float32Array(n * 3), C0 = new Float32Array(n * 3), R = new Uint8Array(n), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), UV = P.texture ? new Float32Array(n * 2) : null, I = new Uint32Array(ni);
    const ROLES = ['fixe', 'peau', 'peauOmbre', 'cheveux', 'sourcils', 'gris', 'haut', 'hautSombre', 'bas', 'yeux', 'chapeau', 'hautForme'], v = new T.Vector3(), nn = new T.Vector3(); let kk = 0, ki = 0;
    for (const p of parts) {
      const g = p.mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, mat = p.mesh.material, base = kk;
      const role = P.roles ? ROLES.indexOf(P.roles(mat.name || '', nom)) : 0, mc = mat.color || new T.Color(1, 1, 1), n3 = p.Mj.map((x) => new T.Matrix3().getNormalMatrix(x));
      for (let i = 0; i < pos.count; i++, kk++) {
        let jd = si.getX(i), wd = sw.getX(i); for (const [jj, ww] of [[si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)], [si.getW(i), sw.getW(i)]]) if (ww > wd) { wd = ww; jd = jj; }
        v.fromBufferAttribute(pos, i).applyMatrix4(p.Mj[jd]); Pp[kk * 3] = v.x; Pp[kk * 3 + 1] = v.y; Pp[kk * 3 + 2] = v.z;
        if (nor) { nn.fromBufferAttribute(nor, i).applyMatrix3(n3[jd]).normalize(); N[kk * 3] = nn.x; N[kk * 3 + 1] = nn.y; N[kk * 3 + 2] = nn.z; }
        if (UV) { C0[kk * 3] = C0[kk * 3 + 1] = C0[kk * 3 + 2] = 1; } else { C0[kk * 3] = mc.r; C0[kk * 3 + 1] = mc.g; C0[kk * 3 + 2] = mc.b; } R[kk] = UV ? 0 : Math.max(0, role); // (la peau peinte : sommets blancs)
        SI[kk * 4] = p.remap[si.getX(i)]; SI[kk * 4 + 1] = p.remap[si.getY(i)]; SI[kk * 4 + 2] = p.remap[si.getZ(i)]; SI[kk * 4 + 3] = p.remap[si.getW(i)];
        SW[kk * 4] = sw.getX(i); SW[kk * 4 + 1] = sw.getY(i); SW[kk * 4 + 2] = sw.getZ(i); SW[kk * 4 + 3] = sw.getW(i);
        if (UV && uv) { UV[kk * 2] = uv.getX(i); UV[kk * 2 + 1] = uv.getY(i); }
      }
      const id = g.index, nb = id ? id.count : pos.count; for (let j = 0; j < nb; j++) I[ki++] = base + (id ? id.getX(j) : j);
    }
    const nbOs = bones.length;
    [acc.cr, acc.tasse].forEach((a, i) => { // les accessoires : leurs couleurs (fixes), un os chacun ; centrés sur l'os
      const pos = a.attributes.position, nor = a.attributes.normal, col = a.attributes.color, base = kk; a.computeBoundingBox(); const cy = (a.boundingBox.min.y + a.boundingBox.max.y) / 2;
      for (let j = 0; j < pos.count; j++, kk++) {
        v.fromBufferAttribute(pos, j); Pp[kk * 3] = v.x; Pp[kk * 3 + 1] = v.y - cy; Pp[kk * 3 + 2] = v.z;
        nn.fromBufferAttribute(nor, j).normalize(); N[kk * 3] = nn.x; N[kk * 3 + 1] = nn.y; N[kk * 3 + 2] = nn.z;
        C0[kk * 3] = col.getX(j); C0[kk * 3 + 1] = col.getY(j); C0[kk * 3 + 2] = col.getZ(j); R[kk] = 255; SI[kk * 4] = nbOs + i; SW[kk * 4] = 1;
        if (UV) { UV[kk * 2] = UV_BLANC[0]; UV[kk * 2 + 1] = UV_BLANC[1]; }
        I[ki++] = base + j;
      }
    });
    // la géométrie de base (partagée par tous les clones de ce personnage : positions, normales, os, index ; chacun a sa couleur)
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Pp, 3)); geo.setAttribute('normal', new T.BufferAttribute(N, 3)); geo.setAttribute('skinIndex', new T.BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(SW, 4));
    if (UV) geo.setAttribute('uv', new T.BufferAttribute(UV, 2));
    geo.setIndex(new T.BufferAttribute(n > 65535 ? I : new Uint16Array(I), 1)); geo.computeBoundingBox(); geo.computeBoundingSphere();
    // le gabarit : le gltf cloné, un seul SkinnedMesh (le premier), les accessoires sous l'os de la main, le squelette refait
    const tpl = X.SkeletonUtils.clone(src); let S1 = null; const jeter = [];
    tpl.traverse((o) => { if (o.isMesh) { if (!S1 && o.isSkinnedMesh) S1 = o; else jeter.push(o); } });
    for (const o of jeter) o.parent.remove(o);
    const os = S1.skeleton.bones.slice(), mainT = os[main]; for (const b of accBones) mainT.add(b);
    S1.bind(new T.Skeleton(os.concat(accBones), S1.skeleton.boneInverses.concat(accInv)), S1.bindMatrix);
    S1.geometry = geo; S1.castShadow = true; S1.receiveShadow = false; S1.frustumCulled = false;
    const tris = I.length / 3 - (acc.cr.attributes.position.count + acc.tasse.attributes.position.count) / 3;
    return { nom, tpl, geo, C0, R, ROLES, tris, nbOs, hauteur: 1 };
  }
  const UV_BLANC = [0.995, 0.005]; // (pack à texture) un coin de la peau repeint en blanc : les accessoires y prennent leur couleur de sommet telle quelle

  // ─── les clips : par nom ; la joie : seulement le haut du corps ───
  const CL = {};
  function clips() {
    for (const c of CLIPS) CL[c.name] = c;
    const j = CL[P.clips.joie]; if (j) CL.__joie = new T.AnimationClip('joie', j.duration, j.tracks.filter((t) => !P.bas.test(t.name.split('.')[0]) && /quaternion$/.test(t.name)));
  }

  // ─── la préparation : les gabarits, la mesure de chaque personnage (hauteur, assise, pas de la marche, cheville) ───
  function preparer() {
    clips();
    for (const n of P.persos) { const pr = cuire(n, SRC[n].scene); mesurer(pr); PROTOS.push(pr); }
    const ref = Math.min(...PROTOS.map((p) => p.hauteur)); for (const p of PROTOS) { p.hauteurTete = p.hauteur; p.hauteur = ref; } // (une seule échelle par pack : un chapeau, un chignon ne rapetissent pas leur porteur)
    API.info = { pack: mp[1], modeles: PROTOS.map((p) => ({ nom: p.nom, tris: p.tris, os: p.nbOs, assise: +p.assise.toFixed(3), pas: +p.vitesse.toFixed(3) })) };
  }
  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3(), _q1 = new T.Quaternion(), _q2 = new T.Quaternion(), _q3 = new T.Quaternion();
  function mesurer(pr) { // sur un clone : la hauteur debout, l'assise (le bas du bassin et des cuisses, assis) et son centre (z), la vitesse du clip de marche, la cheville
    const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; }); S.geometry = pr.geo;
    const mx = new T.AnimationMixer(g), si = pr.geo.attributes.skinIndex, sw = pr.geo.attributes.skinWeight, pied = g.getObjectByName(P.os.pieds[0]);
    const dominant = (i) => { let jd = si.getX(i), wd = sw.getX(i); for (const [jj, ww] of [[si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)], [si.getW(i), sw.getW(i)]]) if (ww > wd) { wd = ww; jd = jj; } return jd; };
    // debout (l'idle) : la cheville au-dessus du sol, la hauteur du personnage (ses sommets, posés par les os : la géométrie est quantifiée), l'échelle monde de la main
    const id = mx.clipAction(CL[P.clips.idle]); id.play(); mx.setTime(0.01); g.updateMatrixWorld(true); pied.getWorldPosition(_v1); pr.cheville = Math.max(0, _v1.y);
    let ymax = -1e9, ymin2 = 1e9; for (let i = 0; i < si.count; i++) { if (pr.R[i] === 255) continue; S.getVertexPosition(i, _v1); S.localToWorld(_v1); ymax = Math.max(ymax, _v1.y); ymin2 = Math.min(ymin2, _v1.y); }
    pr.hauteur = ymax - Math.min(0, ymin2); pr.mainEchelle = g.getObjectByName(P.os.main).getWorldScale(_v1).x; id.stop();
    // assis : le dessous du bassin et des cuisses (sa hauteur, et le centre de la surface d'appui)
    const clipA = CL[P.clips.assisIdle || P.clips.assis], ass = mx.clipAction(clipA); ass.play(); mx.setTime(clipA.duration * 0.999); g.updateMatrixWorld(true);
    const siege = new Set(S.skeleton.bones.map((b, i) => (P.os.assise.test(b.name) ? i : -1)).filter((i) => i >= 0)); let ymin = 1e9; const pts = [];
    for (let i = 0; i < si.count; i++) { if (pr.R[i] === 255 || !siege.has(dominant(i))) continue; S.getVertexPosition(i, _v1); S.localToWorld(_v1); pts.push(_v1.clone()); ymin = Math.min(ymin, _v1.y); }
    let zs = 0, nz = 0; for (const p of pts) if (p.y < ymin + 0.06 * pr.hauteur) { zs += p.z; nz++; }
    pr.assise = ymin; pr.assiseZ = nz ? zs / nz : 0; ass.stop();
    // la marche : l'aller-retour d'un pied (repère du personnage) → la longueur du pas ; la vitesse du clip, en unités du modèle par seconde
    const clipM = CL[P.clips.marche], ma = mx.clipAction(clipM); ma.play(); let zmin = 1e9, zmax = -1e9;
    for (let k = 0; k < 24; k++) { mx.setTime(clipM.duration * k / 24); g.updateMatrixWorld(true); pied.getWorldPosition(_v1); zmin = Math.min(zmin, _v1.z); zmax = Math.max(zmax, _v1.z); }
    pr.vitesse = 2 * (zmax - zmin) / clipM.duration; ma.stop(); mx.uncacheRoot(g);
  }

  // ═══ un acteur : un clone du gabarit, sa géométrie (les attributs du gabarit, sa propre couleur), son mélangeur ═══
  const POOL = new Map(); let nActeurs = 0;
  const MAT = { lambert: null };
  function materiau() { // Lambert à couleurs de sommets, partagé (src/scene.js lui donne son jumeau MeshStandard en qualité riche) ; la peau peinte du pack B : peauPeinte
    if (!MAT.lambert) { MAT.lambert = new T.MeshLambertMaterial({ vertexColors: true }); if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(MAT.lambert); } return MAT.lambert;
  }
  function choisir(c) { const h = (c.id * 2246822519) >>> 0; return P.texture ? 0 : h % PROTOS.length; }
  function acteur(c) {
    if (!API.pret) return null;
    const i = choisir(c), pr = PROTOS[i], l = POOL.get(i); let a = l && l.length ? l.pop() : null;
    if (!a) {
      const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; });
      const geo = new T.BufferGeometry(); for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'uv']) if (pr.geo.attributes[k]) geo.setAttribute(k, pr.geo.attributes[k]);
      geo.setIndex(pr.geo.index); geo.boundingBox = pr.geo.boundingBox; geo.boundingSphere = pr.geo.boundingSphere; geo.setAttribute('color', new T.BufferAttribute(new Float32Array(pr.C0.length), 3)); geo.userData.cache = true;
      S.geometry = geo; S.castShadow = true; S.frustumCulled = false;
      const mixer = new T.AnimationMixer(g), byName = (n) => g.getObjectByName(n);
      a = { g, S, pr, i, mixer, actions: {}, joue: '', joie: null, os: { main: byName(P.os.main), avant: byName(P.os.avant), bras: byName(P.os.bras), tete: byName(P.os.tete), bassin: byName(P.os.bassin), tibias: P.os.tibias.map(byName), cuisses: P.os.cuisses.map(byName), pieds: P.os.pieds.map(byName), cr: byName('accCroissant'), tasse: byName('accTasse') } };
      nActeurs++;
    }
    a.c = c.id; a.etatP = ''; a.joieT = 0; a.assisT = 0; a.aMange = false; a.yaw = YAW[c.dir] || 0; a.vitesse = 0; a.xp = null; a.zp = null; a.graine = (c.id * 0.6180339887) % 1;
    a.objet = (c.id % 3 === 0) ? 'tasse' : 'cr';
    teindre(a, c); a.g.visible = true; a.g.rotation.set(0, a.yaw, 0); a.g.userData.c3d = a; a.g.userData.cle = 'c3d'; a.g.userData.yaw = a.yaw;
    jouer(a, P.clips.idle, 0); a.mixer.update(0.01 + a.graine * 2);
    return a;
  }
  function teindre(a, c) { // la couleur de chaque sommet : le rôle du sommet dans la palette du client, sinon sa couleur d'origine
    const pal = palette(c), col = a.S.geometry.attributes.color.array, R = a.pr.R, C0 = a.pr.C0, ROLES = a.pr.ROLES;
    const tab = ROLES.map((r) => (r === 'fixe' ? null : pal[r]));
    for (let i = 0; i < R.length; i++) { const p = R[i] === 255 ? null : tab[R[i]]; if (p) { col[i * 3] = p[0]; col[i * 3 + 1] = p[1]; col[i * 3 + 2] = p[2]; } else { col[i * 3] = C0[i * 3]; col[i * 3 + 1] = C0[i * 3 + 1]; col[i * 3 + 2] = C0[i * 3 + 2]; } }
    a.S.geometry.attributes.color.needsUpdate = true;
    a.S.material = P.texture ? peauPeinte(c) : materiau();
  }
  function rendre(a) { if (!a) return; a.mixer.stopAllAction(); a.joue = ''; a.joie = null; a.sauve = null; a.g.visible = false; const l = POOL.get(a.i) || []; if (l.length < 4) { l.push(a); POOL.set(a.i, l); } else { a.mixer.uncacheRoot(a.g); a.S.skeleton.dispose(); a.S.geometry.dispose(); } }

  // ─── le pack B : la peau Kenney repeinte aux couleurs du client (des teintes d'ancrage → des rôles ; la nuance de chaque pixel gardée) ───
  const ANCRES = { // [r, g, b] sRGB 0-255 → rôle ; ce qui est loin de toute ancre (les yeux, les dessins, les chaussures) ne bouge pas
    skaterMaleA: [[[78, 23, 18], 'cheveux'], [[245, 148, 117], 'peau'], [[240, 90, 66], 'haut'], [[232, 49, 47], 'haut'], [[26, 82, 118], 'bas'], [[229, 121, 61], 'haut']],
    skaterFemaleA: [[[43, 20, 20], 'cheveux'], [[245, 148, 117], 'peau'], [[34, 34, 34], 'bas'], [[232, 49, 47], 'haut']],
    criminalMaleA: [[[35, 25, 25], 'cheveux'], [[245, 148, 117], 'peau'], [[250, 250, 250], 'haut'], [[0, 150, 110], 'hautSombre']],
  };
  const PEINTES = new Map();
  function peauPeinte(c) {
    const nom = P.peaux[(c.id * 7) % P.peaux.length], pal = palette(c), cle = `${nom}|${c.peau}|${c.cheveux}|${c.haut}|${c.or ? 1 : 0}|${pal.bas.join(',')}`;
    let t = PEINTES.get(cle); if (t) return t; // (le matériau, sa texture)
    const im = IMG[nom], w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); const d = x.getImageData(0, 0, w, h), px = d.data, an = ANCRES[nom] || [];
    const vers = (r) => { const l = pal[r]; return l ? l.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255) : null; }; // linéaire → sRGB 0-255
    const cibles = an.map(([rgb, r]) => ({ rgb, r, vers: vers(r), lum: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 1 }));
    const fx0 = 0.2 * w, fx1 = 0.44 * w, fy0 = 0.12 * h, fy1 = 0.31 * h; // le visage (même dépliage pour les trois peaux) : ses yeux et sourcils ne prennent pas la couleur des cheveux
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2]; let best = null, bd = 60 * 60 * 3;
      for (const a of cibles) { const dr = r - a.rgb[0], dg = g - a.rgb[1], db = b - a.rgb[2], dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = a; } }
      if (!best || !best.vers) continue;
      if (best.r === 'cheveux') { const q = i >> 2, xx = q % w, yy = (q - xx) / w; if (xx > fx0 && xx < fx1 && yy > fy0 && yy < fy1) continue; } const k = (0.2126 * r + 0.7152 * g + 0.0722 * b + 1) / best.lum;
      px[i] = Math.min(255, best.vers[0] * k); px[i + 1] = Math.min(255, best.vers[1] * k); px[i + 2] = Math.min(255, best.vers[2] * k);
    }
    for (let yy = 0; yy < 3; yy++) for (let xx = w - 3; xx < w; xx++) { const i = (yy * w + xx) * 4; px[i] = px[i + 1] = px[i + 2] = 255; } // le coin blanc des accessoires (uv 0,995 / 0,005 : en haut à droite, flipY faux)
    x.putImageData(d, 0, 0);
    t = new T.CanvasTexture(cv); t.flipY = false; t.colorSpace = T.SRGBColorSpace; t.userData.partagee = true;
    const m = new T.MeshLambertMaterial({ vertexColors: true, map: t }); if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(m); // (partagé : la scène ne le libère pas ; gardé ici)
    PEINTES.set(cle, m); return m;
  }

  // ═══ l'animation : jouer un clip (fondu), la joie par-dessus, l'IK du bras (manger) et des jambes (assis) ═══
  function jouer(a, nom, fondu, une) {
    if (a.joue === nom) return; const clip = CL[nom]; if (!clip) return;
    const ac = a.actions[nom] || (a.actions[nom] = a.mixer.clipAction(clip)); ac.reset(); ac.setLoop(une ? T.LoopOnce : T.LoopRepeat, Infinity); ac.clampWhenFinished = !!une; ac.setEffectiveWeight(1); ac.play();
    const av = a.joue && a.actions[a.joue]; if (av && fondu > 0) av.crossFadeTo(ac, fondu, false); else if (av) av.stop();
    if (!une && !av) ac.time = a.graine * clip.duration; a.joue = nom;
  }
  const posM = (o, v) => v.setFromMatrixPosition(o.matrixWorld);
  function tournerMonde(os, q) { // une rotation en espace monde, appliquée à l'os (puis ses enfants recalculés)
    os.parent.getWorldQuaternion(_q2); _q3.copy(_q2).multiply(os.quaternion).premultiply(q); os.quaternion.copy(_q2.invert().multiply(_q3)); os.updateMatrixWorld(true);
  }
  function ikBras(a, cible, k) { // la main vers cible (monde), pondéré par k : deux os (bras, avant-bras), le coude du côté où il est
    if (k < 0.002) return; const o = a.os, S = posM(o.bras, new T.Vector3()), E = posM(o.avant, new T.Vector3()), W = posM(o.main, new T.Vector3());
    const l1 = S.distanceTo(E), l2 = E.distanceTo(W), Tg = W.clone().lerp(cible, k), dST = Tg.clone().sub(S); let d = dST.length(); if (d < 1e-6) return;
    d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, d)); dST.normalize();
    const nrm = new T.Vector3().crossVectors(E.clone().sub(S), W.clone().sub(E)); if (nrm.lengthSq() < 1e-10) nrm.set(0, -1, 0); nrm.normalize();
    const A = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const e1 = S.clone().add(dST.clone().applyAxisAngle(nrm, A).multiplyScalar(l1)), e2 = S.clone().add(dST.clone().applyAxisAngle(nrm, -A).multiplyScalar(l1)), E2 = e1.distanceTo(E) < e2.distanceTo(E) ? e1 : e2;
    tournerMonde(o.bras, _q1.setFromUnitVectors(E.clone().sub(S).normalize(), E2.clone().sub(S).normalize()));
    const W2 = posM(o.main, new T.Vector3()); tournerMonde(o.avant, _q1.setFromUnitVectors(W2.sub(E2).normalize(), Tg.clone().sub(E2).normalize()));
  }
  function piedsAuSol(a, sol, k) { // assis : le tibia tourne au genou pour que la cheville touche le sol (devant, dans l'axe de la cuisse), ou pend droit
    const o = a.os, ch = sol + a.pr.cheville * a.g.scale.y;
    for (let i = 0; i < 2; i++) {
      const tib = o.tibias[i], pied = o.pieds[i]; if (!tib || !pied) continue;
      const K = posM(tib, new T.Vector3()), A = posM(pied, new T.Vector3()), H = posM(o.cuisses[i], new T.Vector3()), Lg = K.distanceTo(A), dy = K.y - ch;
      const av = K.clone().sub(H); av.y = 0; if (av.lengthSq() < 1e-8) av.set(Math.sin(a.g.rotation.y), 0, Math.cos(a.g.rotation.y)); av.normalize();
      const A2 = dy >= Lg ? K.clone().add(new T.Vector3(0, -Lg, 0)) : K.clone().add(av.multiplyScalar(Math.sqrt(Lg * Lg - dy * dy))).add(new T.Vector3(0, -dy, 0));
      A2.lerp(A, 1 - k);
      const q = new T.Quaternion().setFromUnitVectors(A.clone().sub(K).normalize(), A2.clone().sub(K).normalize());
      tournerMonde(tib, q);
      if (P.os.piedsIK) { pied.position.copy(pied.parent.worldToLocal(A2.clone())); pied.updateMatrixWorld(true); }
      else tournerMonde(pied, q.clone().invert()); // (le pied enfant du tibia : il garde son orientation, à plat)
    }
  }
  const angleCourt = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const _e = new T.Euler();
  function orienterAcc(a, cyc, visible) { // l'objet en main : au bout de la main (dans l'axe de l'avant-bras), une orientation monde (la tasse droite, penchée quand on boit ; le croissant presque à plat), à sa taille
    const o = a.os, boit = cyc < 0.3 ? Math.sin(cyc / 0.3 * Math.PI) : 0, sc = a.g.scale.x;
    for (const [b, rx, taille, nom] of [[o.tasse, -0.9 * boit, 8.5, 'tasse'], [o.cr, -0.35, 13, 'cr']]) {
      if (!b) continue; const vis = visible && a.objet === nom;
      if (!vis) { if (b.scale.x !== 0) { b.scale.setScalar(0); b.updateMatrixWorld(true); } continue; }
      posM(o.main, _v1); posM(o.avant, _v2); _v3.subVectors(_v1, _v2).normalize().multiplyScalar(P.prise * a.pr.hauteur * sc); _v1.add(_v3);
      b.position.copy(o.main.worldToLocal(_v1)); b.scale.setScalar(taille / (16 * a.pr.mainEchelle * sc)); // (l'échelle monde de la main inclut celle du client)
      o.main.getWorldQuaternion(_q2); _q3.setFromEuler(_e.set(rx, a.yaw, 0, 'YXZ')); b.quaternion.copy(_q2.invert().multiply(_q3)); b.updateMatrixWorld(true);
    }
  }

  // ─── poser un client : sa place (VIE), son clip, la joie, l'assise et le repas ───
  function poser(a, c, E, dt, ctx) {
    const g = a.g, pr = a.pr, K = ctx.K, s = (P.haut * K * (c.taille || 1)) / (pr.hauteur * 1.0), assis = c.etat === 'assis';
    const marche = c.etat === 'entre' || c.etat === 'sort' || c.etat === 'vaTable' || (c.etat === 'attend' && !!c.glisse);
    // servi : il quitte la file content (la joie, par-dessus ce qu'il fait)
    if (a.etatP === 'attend' && c.etat !== 'attend' && !c.or) { a.joieT = 1.35; }
    if (a.etatP === 'assis' && c.etat !== 'assis') a.aMange = true;
    a.etatP = c.etat;
    g.visible = c.alpha > 0.05; const sc = s * (0.75 + 0.25 * Math.min(1, c.alpha)); g.scale.setScalar(sc);
    // le cap : face à sa marche (même quand la file avance de côté), sinon celui de VIE
    const x = c.x, z = ctx.wz(c.y) - (1 - c.alpha) * 30; let cap = YAW[c.dir] || 0;
    if (a.xp != null && dt > 0) { const vx = (x - a.xp) / dt, vz = (z - a.zp) / dt, v = Math.hypot(vx, vz); a.vitesse += (v - a.vitesse) * Math.min(1, dt * 8); if (v > 8 && !assis) cap = Math.atan2(vx, vz); }
    a.xp = x; a.zp = z;
    a.yaw += angleCourt(cap - a.yaw) * Math.min(1, dt * 10); g.rotation.y = a.yaw;
    // le clip de fond
    if (assis) {
      if (a.joue !== P.clips.assis && a.joue !== P.clips.assisIdle) { jouer(a, P.clips.assis, 0.25, true); a.assisT = 0; }
      a.assisT += dt; const dA = CL[P.clips.assis].duration;
      if (P.clips.assisIdle && a.joue === P.clips.assis && a.assisT >= dA * 0.95) jouer(a, P.clips.assisIdle, 0.2);
    } else if (marche) { jouer(a, P.clips.marche, 0.25); a.assisT = 0; }
    else { jouer(a, P.clips.idle, 0.3); a.assisT = 0; }
    const ac = a.actions[a.joue]; if (ac && a.joue === P.clips.marche) ac.timeScale = Math.max(0.55, Math.min(2.2, a.vitesse / Math.max(1e-3, pr.vitesse * sc)));
    // la joie : le haut du corps du clip de victoire, par-dessus (poids qui monte puis redescend)
    if (a.joieT > 0) {
      if (!a.joie) { a.joie = a.mixer.clipAction(CL.__joie); a.joie.reset(); a.joie.setLoop(T.LoopOnce, 1); a.joie.clampWhenFinished = true; a.joie.timeScale = CL.__joie.duration / 1.35; a.joie.play(); }
      a.joieT -= dt; const u = 1 - a.joieT / 1.35; a.joie.setEffectiveWeight(3 * Math.min(1, u * 5, (1 - u) * 4));
      if (a.joieT <= 0) { a.joie.stop(); a.joie = null; }
    }
    // (le mélangeur n'écrit une valeur que si elle change : un clip figé, assis, ne réécrit plus le bras ni les jambes ; on rend donc aux os
    //  que l'IK touche la pose du clip avant chaque mise à jour, sinon l'IK s'empilerait d'une image à l'autre)
    const o = a.os;
    if (!a.sauve) a.sauve = [o.bras, o.avant, o.main, ...o.tibias, ...o.pieds].filter(Boolean).map((b) => [b, b.quaternion.clone(), b.position.clone()]);
    else for (const [b, q, p] of a.sauve) { b.quaternion.copy(q); b.position.copy(p); }
    a.mixer.update(dt);
    for (const sv of a.sauve) { sv[1].copy(sv[0].quaternion); sv[2].copy(sv[0].position); }
    // la place : debout au point de VIE ; assis, le bassin sur le siège (la hauteur d'assise, le centre de l'assise mesuré au gabarit)
    let y = 0, ox = 0, oz = 0; const kA = assis ? Math.min(1, a.assisT / Math.max(0.2, CL[P.clips.assis].duration * 0.9)) : 0;
    if (assis && c.siege) { const ys = ASSISE[c.siege.zone] || 16; y = (ys - pr.assise * sc) * kA; const d = -pr.assiseZ * sc * kA; ox = Math.sin(a.yaw) * d; oz = Math.cos(a.yaw) * d; }
    g.position.set(x + ox, y, z + oz); g.updateMatrixWorld(true);
    // le repas (assis) : toutes les 2,6 s environ, la main monte à la bouche (le croissant, ou la tasse) ; l'objet en main dès qu'il est servi
    const enMain = (c.sac || c.pris || c.etat === 'vaTable' || assis) && c.etat !== 'entre' && c.etat !== 'attend' && !(c.etat === 'sort' && a.aMange) && !c.or;
    const cyc = (E.t * 0.38 + a.graine * 7) % 1;
    if (assis && kA >= 1) {
      piedsAuSol(a, 0, 1);
      const k = cyc < 0.3 ? Math.sin(cyc / 0.3 * Math.PI) : 0;
      if (k > 0 && o.tete && o.bras) { const b = P.bouche; posM(o.tete, _v4); const fy = Math.sin(a.yaw), fz = Math.cos(a.yaw); _v4.x += fy * b[2] * pr.hauteur * sc; _v4.z += fz * b[2] * pr.hauteur * sc; _v4.y += b[1] * pr.hauteur * sc; ikBras(a, _v4, k); }
    } else if (assis && kA > 0.6) piedsAuSol(a, 0, (kA - 0.6) / 0.4);
    orienterAcc(a, assis && kA >= 1 ? cyc : 1, enMain);
  }

  return Object.assign(API, { actif: true, pack: mp[1], permis, charger, acteur, poser, rendre, get nActeurs() { return nActeurs; }, PACKS, P, CL, PROTOS });
})();
if (typeof module !== 'undefined') module.exports = CLIENTS3D;
