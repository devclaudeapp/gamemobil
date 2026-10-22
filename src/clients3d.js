/* LE FOURNIL — les clients de la boutique en personnages 3D animés : six personnages de l'Ultimate Animated Character Pack de Quaternius (CC0 ;
   fournil/hd/clients/, le lot « clients » de src/hd.js, ≈ 385 Ko, refait par outils/clients3d/faire-clients.mjs). C'est le défaut en qualité haute et
   moyenne quand la HD est permise (HDM.permis : WebGL2, pas l'éco, pas coupée dans Réglages › Décors en HD) ; src/scene.js demande le lot après
   celui de la boutique (après les premières images), le service worker le garde comme les autres fichiers hd/. Les chibis (src/persos.js) restent
   en éco, la HD coupée, tant que le lot n'est pas prêt, s'il échoue (les clips manquent, ou tous les personnages : un personnage manquant est
   simplement omis), et pour les clients déguisés de la boutique hantée procédurale ; ?clients=0 dans l'adresse les garde toujours (les tests).
   Le boulanger et les apprentis restent des chibis.
   · La cuisson (comme les monstres de la boutique hantée, src/boutiquehantee.js) : les parties d'un personnage fusionnées en une géométrie sur
     son squelette, les normales de face recalculées pour les parties en facettes (le fichier ne les porte pas), un rôle de couleur par sommet
     (peau, yeux, cheveux, haut, bas, chapeau…) ; les accessoires — le croissant et la tasse, le sac en papier, les lunettes, le bonnet d'hiver —
     sur des os ajoutés, d'échelle nulle quand ils sont rangés : UN appel de dessin par client. Chaque client a ses couleurs de sommets, teintes
     aux couleurs que VIE lui tire (la palette du quartier) ; la marinière (au bord de la mer, un haut blanc) raye son haut.
   · Une réserve d'acteurs : quatre par personnage, bâtis et chauffés (dessinés une fois hors champ) dès le lot préparé, rendus à la réserve
     quand le client s'en va : la mémoire (géométries, textures des os) ne bouge plus ensuite. Un client prend un acteur de son personnage,
     sinon un autre libre ; au-delà, la réserve grandit.
   · La vie (VIE, mêmes états que les chibis : entre, attend, vaTable, assis, sort) : il entre en saluant de la main (Wave, le haut du corps
     par-dessus la marche, cadencée sur le pas réel) et attend son tour ; servi, il lève les bras (Victory) et prend son sac ; il va s'asseoir
     son croissant ou sa tasse à la main (au bar, toujours une tasse), s'assoit (SitDown, les pieds posés au sol), pose son sac par terre et
     mange (la main monte à la bouche) ; repu, il se lève en ramassant son sac (PickUp : VIE lui laisse ce temps, leveT) et repart en saluant.
     Le client mystère, tout en or, attend dans son halo (le calque 2D fait ses étincelles) et s'impatiente (il regarde autour de lui, tape du
     pied) ; touché, il dit oui de la tête et repart avec son sac ; oublié, il repart les mains vides en disant non. L'habitué : toujours le
     même personnage (Mme Dupuis et ses lunettes, Marco en costume, Léna en casque de chantier), son prénom au-dessus de sa tête (le calque
     de src/scene.js, à la hauteur de sa tête : tete()), un oui de la tête quand il est servi. L'hiver (la neige, la montagne), un bonnet
     pour qui le porte chez les chibis, sur un personnage sans chapeau. */
const CLIENTS3D = (() => {
  'use strict';
  const T = typeof THREE !== 'undefined' ? THREE : null, X = typeof FOURNIL_HD !== 'undefined' ? FOURNIL_HD : null;
  const sansClients = typeof location !== 'undefined' && /[?&]clients=0(?:&|$)/.test(location.search); // (les tests : les chibis d'office)
  const API = { actif: false, pret: false, erreur: '', info: null, permis: () => false, demander: () => {}, preparer: () => false, acteur: () => null, poser: () => {}, rendre: () => {}, tete: () => null, liberer: () => {}, chauffer: () => false, rentrer: () => {} };
  if (!T || !X || typeof document === 'undefined' || sansClients || typeof HDM === 'undefined' || !HDM.actif || !HDM.LOTS || !HDM.LOTS.clients || typeof PERSOS === 'undefined' || !PERSOS || typeof MODELES === 'undefined' || !MODELES) return API;

  // ═══ les personnages : le rôle de chaque matériau (les autres gardent leur couleur : ceintures, bretelles, chemise blanche, gilet de travail) ═══
  const PERSONNAGES = {
    Casual_Female: { roles: { Skin: 'peau', Face: 'yeux', Hair: 'cheveux', Shirt: 'haut', Pants: 'bas' } },
    Casual2_Male: { roles: { Skin: 'peau', Face: 'yeux', Hair: 'cheveux', Shirt: 'haut', Pants: 'bas' }, crete: true }, // (sa crête traverserait un bonnet)
    Doctor_Female_Old: { roles: { Skin: 'peau', Face: 'yeux', Hair: 'gris', Main: 'haut', Black: 'hautClair', Brown: 'bas' } }, // la blouse devient un manteau
    OldClassy_Male: { roles: { Skin: 'peau', Face: 'yeux', Hair: 'gris', Shirt: 'haut', Pants: 'bas', Hat: 'hautForme' }, chapeau: true },
    Suit_Male: { roles: { Skin: 'peau', Face: 'yeux', Hair: 'cheveux', Black: 'hautSombre', Details: 'haut' } }, // le costume sombre, la cravate à la couleur du client
    Worker_Female: { roles: { Skin: 'peau', Face: 'yeux', Hair: 'cheveux', Shirt: 'haut', Pants: 'bas', Hat: 'casque' }, chapeau: true },
  };
  const HABITUES = { dupuis: 'Doctor_Female_Old', marco: 'Suit_Male', lena: 'Worker_Female' }, MYSTERE = 'OldClassy_Male';
  // les os (noms tels que les lit GLTFLoader : « Fist.R » → « FistR ») ; assise : les os qui portent sur le siège ; basDuCorps : ce que la joie ne touche pas
  const OS = { main: 'FistR', avant: 'LowerArmR', bras: 'UpperArmR', tete: 'Head', cuisses: ['UpperLegL', 'UpperLegR'], tibias: ['LowerLegL', 'LowerLegR'], pieds: ['FootL', 'FootR'], assise: /^(Body|Hips|UpperLeg)/, basDuCorps: /^(Bone|Body|Hips|UpperLeg|LowerLeg|Foot|PoleTarget)/ };
  const ROLES = ['fixe', 'peau', 'yeux', 'cheveux', 'gris', 'haut', 'hautSombre', 'hautClair', 'bas', 'casque', 'hautForme', 'sac', 'anse', 'lunettes', 'bonnet', 'pompon'];
  const RI = Object.fromEntries(ROLES.map((r, i) => [r, i]));
  // les mesures (unités du monde, comme les chibis : 73 de haut à l'échelle 1) : la hauteur visée (× K × taille du client) ; l'assise de chaque coin
  // (src/meubles.js : chaises et tabourets à 16, la banquette plus basse) ; un point devant la bouche (relatif à la tête, × la hauteur du modèle) ;
  // l'objet en main, au bout du poing (× la hauteur) ; la durée de la joie
  const HAUT = 74, ASSISE = { table: 16, terrasse: 16, bar: 16, banquette: 12 }, BOUCHE = [0, 0.075, 0.2], PRISE = 0.075, JOIE = 1.35;
  const BAS = ['#4A5A78', '#5B4A3A', '#3E4A5C', '#8A7A66', '#33363F', '#6B5B7A'], CASQUES = ['#F2C14E', '#F08A3C', '#F2EEE4', '#E05A4E', '#5B8FD0'];
  const FORMES = ['#26262C', '#4A3328', '#2F3A55', '#5E2A35'], GRIS = ['#DCD8D0', '#C4BFB6', '#ECE8E0', '#A9A49B'], OR = '#FFC84A', OR2 = '#E0A61E';
  const YAW = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI };

  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3(), _v5 = new T.Vector3(), _q1 = new T.Quaternion(), _q2 = new T.Quaternion(), _q3 = new T.Quaternion();
  const _m1 = new T.Matrix4(), _m2 = new T.Matrix4(), _e = new T.Euler(), _c = new T.Color(), _s1 = new T.Vector3(), AXE_Y = new T.Vector3(0, 1, 0);
  const etat = { prets: 0, acteurs: 0, enService: 0, chauffe: false, msCuisson: 0, liberes: 0 };

  const permis = (renderer) => !!(typeof HDM !== 'undefined' && HDM.permis(renderer));
  function demander() { if (!HDM.etat.clients) HDM.charger('clients'); }

  // ═══ les accessoires ═══
  // tenus en main (le croissant, la tasse, le sac) : bâtis autour de l'origine, en unités du monde, sur un os ajouté sous la racine du squelette dont
  // l'inverse de liaison est celui du maillage : leurs sommets sont en coordonnées locales de l'os, que poser() place chaque image (la main, et
  // une orientation monde : la tasse droite, le sac qui pend). Portés sur la tête (les lunettes, le bonnet) : bâtis dans l'espace de liaison du
  // maillage, à la mesure de chaque tête, sur un os enfant de la tête qui a sa liaison : ils la suivent ; échelle nulle quand ils sont rangés.
  // (MODELES.assembler rend des triangles sans indices, trois sommets chacun : souder() les rend indexés, un sommet par position, normale, couleur
  //  et rôle ; un accessoire rangé coûte encore ses sommets à chaque image, chez chaque client)
  function souder(geo, roles) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color, vus = new Map(), P = [], N = [], C = [], R = [], I = [], q = (x, k) => Math.round(x * k);
    for (let j = 0; j < pos.count; j++) {
      const cle = `${q(pos.getX(j), 1e4)},${q(pos.getY(j), 1e4)},${q(pos.getZ(j), 1e4)},${q(nor.getX(j), 1e3)},${q(nor.getY(j), 1e3)},${q(nor.getZ(j), 1e3)},${col ? q(col.getX(j), 1e3) + ',' + q(col.getY(j), 1e3) + ',' + q(col.getZ(j), 1e3) : ''},${roles ? roles[j] : 0}`;
      let k = vus.get(cle); if (k === undefined) { k = P.length / 3; vus.set(cle, k); P.push(pos.getX(j), pos.getY(j), pos.getZ(j)); N.push(nor.getX(j), nor.getY(j), nor.getZ(j)); C.push(col ? col.getX(j) : 1, col ? col.getY(j) : 1, col ? col.getZ(j) : 1); R.push(roles ? roles[j] : RI.fixe); }
      I.push(k);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('color', new T.Float32BufferAttribute(C, 3)); g.setIndex(I);
    return { geo: g, roles: new Uint8Array(R) };
  }
  const rolesDe = (geo, parts) => { const r = new Uint8Array(geo.attributes.position.count); let o = 0; for (const p of parts) { const n = p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; r.fill(RI[p.role || 'fixe'], o, o + n); o += n; } return r; };
  function enMain() {
    const M = MODELES, C = (g, col, role, p) => Object.assign(M.part(g, col, p), { role });
    const cr = souder(M.assembler(PERSOS.partsPatisserie(1))); // le croissant du jeu (la pâtisserie n° 1, src/persos.js), ~16 d'envergure
    const tasse = souder(M.assembler([M.part(M.cylindre(4.2, 3.6, 8, 12), '#FFFFFF'), M.part(M.cylindre(3.7, 3.7, 0.6, 12), '#6B4226', { y: 7.2 }), M.part(M.tore(2.2, 0.8, Math.PI * 2, 5, 10), '#FFFFFF', { x: 4.4, y: 4.4 }), M.part(M.cylindre(6, 6, 0.6, 14), '#F2E6D8', { y: -0.6 })]));
    // le sac en papier kraft (celui des chibis : 9 × 13 × 5), son revers, son anse ; pendu par l'anse : l'origine en haut
    const sacP = [C(M.boite(9, 13, 5, 1.2, 1), '#F2D7B6', 'sac', { y: -16 }), C(M.boite(9.4, 1.4, 5.4, 0.5, 1), '#E2C29C', 'sac', { y: -4.4 }), C(M.tore(2.6, 0.55, Math.PI, 4, 8), '#C9955A', 'anse', { y: -3.2 })];
    const sacG = M.assembler(sacP), sac = souder(sacG, rolesDe(sacG, sacP));
    return { cr, tasse, sac };
  }

  // ═══ la cuisson d'un personnage : ses parties sur le squelette de la première (v' = B0⁻¹ · BI0ⱼ⁻¹ · BIⱼ · B · v, l'os dominant), les normales
  //     de face des parties en facettes, un rôle de couleur par sommet, les accessoires ═══
  function* cuire(nom, gltf, acc) { // (à petits pas : une partie du personnage par pas, puis les accessoires et le gabarit, puis les mesures)
    const src = gltf.scene; src.updateMatrixWorld(true);
    let S0 = null; src.traverse((o) => { if (!S0 && o.isSkinnedMesh) S0 = o; });
    const bones = S0.skeleton.bones, idx = new Map(bones.map((b, i) => [b.name, i])), iB = S0.bindMatrix.clone().invert(), BI0 = S0.skeleton.boneInverses.map((m) => m.clone().invert());
    const pr0 = {}, cfg = PERSONNAGES[nom], P = [], N = [], C0 = [], R = [], RAY = [], SI = [], SW = [], I = [];
    const v = new T.Vector3(), n3 = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    const emettre = (x, y, z, nx, ny, nz, col, role, si, sw, o) => { const k = P.length / 3; P.push(x, y, z); N.push(nx, ny, nz); C0.push(col.r, col.g, col.b); R.push(role); RAY.push(0); o = o || 0; SI.push(si[o], si[o + 1], si[o + 2], si[o + 3]); SW.push(sw[o], sw[o + 1], sw[o + 2], sw[o + 3]); return k; };
    const parts = []; src.traverse((o) => { if (o.isSkinnedMesh) parts.push(o); });
    let hautY0 = Infinity, hautY1 = -Infinity; const hautTris = [];
    for (const o of parts) {
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index;
      const remap = o.skeleton.bones.map((bo) => (idx.has(bo.name) ? idx.get(bo.name) : 0));
      const Mj = o.skeleton.boneInverses.map((bi, j) => iB.clone().multiply(BI0[remap[j]]).multiply(bi).multiply(o.bindMatrix)), Nj = Mj.map((m) => new T.Matrix3().getNormalMatrix(m));
      const role = RI[cfg.roles[o.material.name] || 'fixe'], col = o.material.color || new T.Color(1, 1, 1);
      const PP = new Float32Array(pos.count * 3), SIi = new Uint16Array(pos.count * 4), SWi = new Float32Array(pos.count * 4), dom = new Int32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        let jd = 0, wd = -1; for (let q = 0; q < 4; q++) { const ww = sw.getComponent(i, q), jj = si.getComponent(i, q); SIi[i * 4 + q] = remap[jj]; SWi[i * 4 + q] = ww; if (ww > wd) { wd = ww; jd = jj; } }
        dom[i] = jd; v.fromBufferAttribute(pos, i).applyMatrix4(Mj[jd]); PP[i * 3] = v.x; PP[i * 3 + 1] = v.y; PP[i * 3 + 2] = v.z;
      }
      const nb = ix ? ix.count : pos.count, at = (k) => (ix ? ix.getX(k) : k);
      if (nor) { // une partie lisse (les cheveux, le visage) : ses normales, ses indices
        const base = P.length / 3;
        for (let i = 0; i < pos.count; i++) { n3.fromBufferAttribute(nor, i).applyMatrix3(Nj[dom[i]]).normalize(); emettre(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2], n3.x, n3.y, n3.z, col, role, SIi, SWi, i * 4); }
        for (let k = 0; k < nb; k++) I.push(base + at(k));
      } else { // en facettes : la normale de chaque triangle ; les sommets d'une même facette plane partagés (le haut : un sommet par triangle, pour les rayures)
        const vus = new Map(), seul = role === RI.haut;
        for (let k = 0; k < nb; k += 3) {
          const i0 = at(k), i1 = at(k + 1), i2 = at(k + 2);
          a.fromArray(PP, i0 * 3); b.fromArray(PP, i1 * 3); c.fromArray(PP, i2 * 3); n3.subVectors(c, b).cross(_v1.subVectors(a, b)).normalize();
          const cle = ((Math.round(n3.x * 500) + 500) * 1001 + Math.round(n3.y * 500) + 500) * 1001 + Math.round(n3.z * 500) + 500; // (la normale arrondie, en un nombre)
          for (let q = 0; q < 3; q++) {
            const i = q === 0 ? i0 : q === 1 ? i1 : i2, kk = i * 1003003001 + cle; let e = seul ? undefined : vus.get(kk);
            if (e === undefined) { e = emettre(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2], n3.x, n3.y, n3.z, col, role, SIi, SWi, i * 4); if (!seul) vus.set(kk, e); }
            I.push(e);
          }
          if (seul) { const y = (a.y + b.y + c.y) / 3; hautTris.push([I.length - 3, y]); hautY0 = Math.min(hautY0, y); hautY1 = Math.max(hautY1, y); }
        }
      }
      yield;
    }
    // la marinière : sept bandes dans la hauteur du haut, une sur deux rayée (par triangle : des bandes nettes)
    if (hautTris.length) { const h = Math.max(1e-6, hautY1 - hautY0) / 7; for (const [k, y] of hautTris) if (Math.floor((y - hautY0) / h) % 2 === 1) for (let j = 0; j < 3; j++) RAY[I[k + j]] = 1; }
    const nbCorps = P.length / 3, trisCorps = I.length / 3;
    // les os ajoutés : en main (sous la racine, liaison du maillage) ; sur la tête (enfants de la tête, sa liaison)
    const racine = bones.findIndex((bo) => !bo.parent || !bo.parent.isBone), tete = idx.get(OS.tete), ACC = ['accCroissant', 'accTasse', 'accSac', 'accLunettes', 'accBonnet', 'accCheveux'], nbOs = bones.length;
    const UN = [1, 0, 0, 0], osAcc = [0, 1, 2, 3, 4].map((k) => [nbOs + k, 0, 0, 0]);
    const blanc = new T.Color(1, 1, 1), ajouter = ({ geo, roles }, os, enLiaison) => { // (indexée, soudée) ; enLiaison : déjà dans l'espace de liaison (portés sur la tête)
      const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color, base = P.length / 3;
      geo.computeBoundingBox(); const cy = enLiaison || os === 2 ? 0 : (geo.boundingBox.min.y + geo.boundingBox.max.y) / 2; // (le sac garde son origine : le haut de l'anse)
      for (let j = 0; j < pos.count; j++) {
        const ro = roles ? roles[j] : RI.fixe; if (col) _c.setRGB(col.getX(j), col.getY(j), col.getZ(j)); else _c.copy(blanc);
        emettre(pos.getX(j), pos.getY(j) - cy, pos.getZ(j), nor.getX(j), nor.getY(j), nor.getZ(j), _c, ro, osAcc[os], UN);
      }
      const ix = geo.index; for (let k = 0; k < ix.count; k++) I.push(base + ix.getX(k));
    };
    ajouter(acc.cr, 0); ajouter(acc.tasse, 1); ajouter(acc.sac, 2);
    // la tête, mesurée dans le monde au repos (la liaison du maillage) : ses sommets de peau et de cheveux (l'os dominant : la tête), les yeux et
    // les sourcils (la partie « Face ») ; les lunettes et le bonnet y sont bâtis, puis ramenés dans l'espace de liaison du maillage
    const yeux = [], crane = [], cheveux = [], jD = (k) => { let jd = SI[k * 4], wd = SW[k * 4]; for (let q = 1; q < 4; q++) if (SW[k * 4 + q] > wd) { wd = SW[k * 4 + q]; jd = SI[k * 4 + q]; } return jd; };
    for (let k = 0; k < nbCorps; k++) { if (jD(k) !== tete) continue; const p = new T.Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(S0.bindMatrix); if (R[k] === RI.yeux) yeux.push(p); else if (R[k] === RI.peau) crane.push(p); else if (R[k] === RI.cheveux || R[k] === RI.gris) { p.k = k; cheveux.push(p); } }
    const mt = mesureTete(yeux, crane), lu = lunettes(mt), bon = bonnet(mt);
    lu.geo.applyMatrix4(iB); bon.geo.applyMatrix4(iB); ajouter(lu, 3, true); ajouter(bon, 4, true);
    // sous le bonnet : les cheveux au-dessus de son bord passent sur un os à eux (enfant de la tête, au centre du bonnet), d'échelle nulle quand le
    // bonnet est mis : ils s'y replient, cachés dedans ; ceux d'en dessous (les côtés, la queue de cheval) dépassent du bonnet
    for (const p of cheveux) if (p.y > bon.bord) { const k = p.k; SI[k * 4] = nbOs + 5; SI[k * 4 + 1] = SI[k * 4 + 2] = SI[k * 4 + 3] = 0; SW[k * 4] = 1; SW[k * 4 + 1] = SW[k * 4 + 2] = SW[k * 4 + 3] = 0; }
    const teteRepos = S0.skeleton.boneInverses[tete].clone().invert(), centreBonnet = bon.centre.clone().applyMatrix4(teteRepos.clone().invert()); // (le centre du bonnet, dans le repère de la tête au repos)
    pr0.tete = { ecart: +mt.yeuxG.distanceTo(mt.yeuxD).toFixed(3), crane: +(mt.crane.max.y - mt.crane.min.y).toFixed(3) };
    // la géométrie de base (partagée par tous les acteurs de ce personnage ; chacun a sa couleur)
    const n = P.length / 3, geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(P), 3)); geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(N), 3));
    geo.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(SI), 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(SW), 4));
    geo.setIndex(new T.BufferAttribute(n > 65535 ? new Uint32Array(I) : new Uint16Array(I), 1)); geo.computeBoundingBox(); geo.computeBoundingSphere();
    yield;
    // le gabarit : le gltf cloné, un seul SkinnedMesh, les os ajoutés, le squelette refait
    const tpl = X.SkeletonUtils.clone(src); let S1 = null; const jeter = [];
    tpl.traverse((o) => { if (o.isMesh) { if (!S1 && o.isSkinnedMesh) S1 = o; else jeter.push(o); } });
    for (const o of jeter) o.parent.remove(o);
    const os = S1.skeleton.bones.slice(), inv = S1.skeleton.boneInverses.slice(), iB1 = S1.bindMatrix.clone().invert();
    ACC.forEach((nomOs, i) => {
      const bo = new T.Bone(); bo.name = nomOs; bo.scale.setScalar(i === 5 ? 1 : 0); (i >= 3 ? os[tete] : os[racine]).add(bo); os.push(bo);
      if (i === 5) { bo.position.copy(centreBonnet); inv.push(teteRepos.clone().multiply(new T.Matrix4().makeTranslation(centreBonnet.x, centreBonnet.y, centreBonnet.z)).invert()); } // les cheveux : posés comme sur la tête, repliés au centre du bonnet
      else inv.push(i >= 3 ? inv[tete].clone() : iB1.clone());
    });
    S1.bind(new T.Skeleton(os, inv), S1.bindMatrix);
    S1.geometry = geo; S1.castShadow = true; S1.receiveShadow = false; S1.frustumCulled = false;
    const pr = Object.assign(pr0, { nom, tpl, geo, C0: new Float32Array(C0), R: new Uint8Array(R), RAY: new Uint8Array(RAY), tris: trisCorps, sommets: nbCorps, trisAcc: I.length / 3 - trisCorps, sommetsAcc: n - nbCorps, nbOs, chapeau: !!cfg.chapeau, sansBonnet: !!(cfg.chapeau || cfg.crete), hauteur: 1 });
    yield; mesurer(pr); return pr;
  }
  // la tête (monde au repos ; le visage regarde vers +z, le haut est +y) : le centre de chaque œil (le bas de la partie « Face » de son côté :
  // le haut, ce sont les sourcils), l'avant du visage, la calotte (la peau et les cheveux au-dessus des sourcils)
  function mesureTete(yeux, crane) {
    const box = new T.Box3(); for (const p of yeux) box.expandByPoint(p);
    const cx = (box.min.x + box.max.x) / 2, hy = box.max.y - box.min.y, bas = box.min.y + hy * 0.6;
    const moy = (l) => l.reduce((s, p) => s.add(p), new T.Vector3()).multiplyScalar(1 / Math.max(1, l.length));
    const oeil = (cote) => moy(yeux.filter((p) => (p.x - cx) * cote > 0 && p.y < bas)), haut = new T.Box3(); for (const p of crane) if (p.y > box.max.y) haut.expandByPoint(p);
    return { yeuxG: oeil(1), yeuxD: oeil(-1), front: box.max.z, yeuxH: hy, sourcils: box.max.y, crane: haut };
  }
  function lunettes(t) { // deux cercles fins devant les yeux et le pont : bâtis dans le monde au repos
    const M = MODELES, e = t.yeuxG.distanceTo(t.yeuxD), r = e * 0.34, z = t.front + r * 0.2, y = (t.yeuxG.y + t.yeuxD.y) / 2, ep = r * 0.15, col = '#3A2A22', mx = (t.yeuxG.x + t.yeuxD.x) / 2, l = Math.max(0.001, e - 2 * r);
    return souder(M.assembler([M.part(M.tore(r, ep, Math.PI * 2, 4, 12), col, { x: t.yeuxG.x, y, z }), M.part(M.tore(r, ep, Math.PI * 2, 4, 12), col, { x: t.yeuxD.x, y, z }),
      M.part(M.cylindre(ep * 0.8, ep * 0.8, l, 5), col, { x: mx + l / 2, y: y + r * 0.15, z, rz: Math.PI / 2 })])); // (le cylindre, posé sur y = 0, couché vers −x)
  }
  function bonnet(t) { // le bonnet d'hiver : une calotte de laine sur le crâne (au-dessus des sourcils ; les cheveux de dessus se cachent dedans), un revers, un pompon blanc
    const M = MODELES, c = t.crane, cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2, y0 = t.sourcils + (c.max.y - t.sourcils) * 0.1;
    const rx = (c.max.x - c.min.x) / 2 * 1.14, rz = (c.max.z - c.min.z) / 2 * 1.14, h = (c.max.y - y0) * 1.22, r = Math.max(rx, rz);
    const parts = [
      Object.assign(M.part(new T.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#FFFFFF', { x: cx, y: y0, z: cz, sx: rx, sy: h, sz: rz }), { role: 'bonnet' }),
      Object.assign(M.part(M.cylindre(1, 1, 1, 14), '#FFFFFF', { x: cx, y: y0 - h * 0.12, z: cz, sx: rx * 1.05, sy: h * 0.24, sz: rz * 1.05 }), { role: 'bonnet' }),
      Object.assign(M.part(M.sphere(r * 0.22, 7), '#FFFFFF', { x: cx, y: y0 + h + r * 0.1, z: cz }), { role: 'pompon' }),
    ];
    const g = M.assembler(parts);
    return Object.assign(souder(g, rolesDe(g, parts)), { bord: y0 - h * 0.12, centre: new T.Vector3(cx, y0 + h * 0.35, cz) });
  }

  // ═══ les clips : par nom ; la joie et le salut : le haut du corps seulement, par-dessus le reste ═══
  const CL = {};
  function clips(anims) {
    for (const c of anims) CL[c.name] = c;
    if (CL.Victory) CL.__joie = new T.AnimationClip('joie', CL.Victory.duration, CL.Victory.tracks.filter((t) => !OS.basDuCorps.test(t.name.split('.')[0]) && /quaternion$/.test(t.name)));
    if (CL.Wave) CL.__salut = new T.AnimationClip('salut', CL.Wave.duration, CL.Wave.tracks.filter((t) => !OS.basDuCorps.test(t.name.split('.')[0])));
  }

  // ═══ la préparation, à petits pas (src/scene.js l'appelle à chaque image ; des pas tant que l'image n'a pas passé 6 ms, un au moins) : les
  //     clips et les accessoires ; puis chaque personnage, une partie par pas, ses accessoires et son gabarit, ses mesures ; puis la réserve, un
  //     acteur par pas. Prêt quand tout y est ═══
  const PROTOS = [], NOMS = [], A_CUIRE = Object.keys(PERSONNAGES); let ACC = null, iCuit = 0, enCours = null, echec = false;
  function preparer() {
    if (API.pret || echec || !HDM.pret('clients')) return API.pret;
    const t0 = performance.now();
    try { do etape(); while (!API.pret && performance.now() - t0 < 6); }
    catch (e) { echec = true; API.erreur = String((e && e.message) || e); console.warn('Clients 3D : pas préparés, les chibis restent', API.erreur); }
    const ms = performance.now() - t0; etat.msCuisson = Math.round(etat.msCuisson + ms); etat.msImageMax = Math.max(etat.msImageMax || 0, Math.round(ms)); etat.images = (etat.images || 0) + 1;
    return API.pret;
  }
  function etape() {
    if (!ACC) { clips(HDM.clients('anims').animations); ACC = enMain(); return; }
    if (enCours) { const r = enCours.next(); if (r.done) { PROTOS.push(r.value); NOMS.push(r.value.nom); enCours = null; } return; } // un pas de la cuisson en cours
    if (iCuit < A_CUIRE.length) { const nom = A_CUIRE[iCuit++], g = HDM.clients(nom); if (g) enCours = cuire(nom, g, ACC); return; }
    if (!API.info) {
      if (!PROTOS.length) throw new Error('aucun personnage');
      const ref = Math.min(...PROTOS.map((p) => p.hauteur)); for (const p of PROTOS) { p.hauteurTete = p.hauteur; p.hauteur = ref; } // une seule échelle : un chapeau, un chignon ne rapetissent pas leur porteur
      API.info = { modeles: PROTOS.map((p) => ({ nom: p.nom, tris: p.tris, sommets: p.sommets, trisAcc: p.trisAcc, sommetsAcc: p.sommetsAcc, os: p.nbOs, assise: +p.assise.toFixed(3), pas: +p.vitesse.toFixed(3) })) };
      return;
    }
    for (let i = 0; i < PROTOS.length; i++) { const l = LIBRES.get(i) || []; LIBRES.set(i, l); if (l.length < RESERVE) { l.push(creer(i)); return; } } // la réserve : un acteur par étape
    etat.chauffe = false; API.pret = true;
  }
  // les positions monde des n premiers sommets d'un maillage skinné, à sa pose : une multiplication matrice × vecteur par os et par sommet
  // (SkinnedMesh.getVertexPosition refait une multiplication de matrices par os et par sommet)
  function sommetsMonde(S, n, fn) {
    S.skeleton.update(); const bm = S.skeleton.boneMatrices, g = S.geometry, p = g.attributes.position.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
    _m1.multiplyMatrices(S.matrixWorld, S.bindMatrixInverse); const W = _m1.elements, B = S.bindMatrix.elements;
    for (let i = 0; i < n; i++) {
      const x0 = p[i * 3], y0 = p[i * 3 + 1], z0 = p[i * 3 + 2], x = B[0] * x0 + B[4] * y0 + B[8] * z0 + B[12], y = B[1] * x0 + B[5] * y0 + B[9] * z0 + B[13], z = B[2] * x0 + B[6] * y0 + B[10] * z0 + B[14];
      let sx = 0, sy = 0, sz = 0;
      for (let q = 0; q < 4; q++) { const w = sw[i * 4 + q]; if (w === 0) continue; const o = si[i * 4 + q] * 16; sx += w * (bm[o] * x + bm[o + 4] * y + bm[o + 8] * z + bm[o + 12]); sy += w * (bm[o + 1] * x + bm[o + 5] * y + bm[o + 9] * z + bm[o + 13]); sz += w * (bm[o + 2] * x + bm[o + 6] * y + bm[o + 10] * z + bm[o + 14]); }
      fn(i, W[0] * sx + W[4] * sy + W[8] * sz + W[12], W[1] * sx + W[5] * sy + W[9] * sz + W[13], W[2] * sx + W[6] * sy + W[10] * sz + W[14]);
    }
  }
  function mesurer(pr) { // sur un clone : la hauteur debout, la cheville, l'assise et son centre, la vitesse du pas, le point où les mains ramassent le sac
    const g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; }); S.geometry = pr.geo;
    const mx = new T.AnimationMixer(g), si = pr.geo.attributes.skinIndex, sw = pr.geo.attributes.skinWeight, pied = g.getObjectByName(OS.pieds[0]), tete = g.getObjectByName(OS.tete), main = g.getObjectByName(OS.main);
    const dominant = (i) => { let jd = 0, wd = -1; for (let q = 0; q < 4; q++) { const ww = sw.array[i * 4 + q]; if (ww > wd) { wd = ww; jd = si.array[i * 4 + q]; } } return jd; };
    const id = mx.clipAction(CL.Idle); id.play(); mx.setTime(0.01); g.updateMatrixWorld(true); pied.getWorldPosition(_v1); pr.cheville = Math.max(0, _v1.y);
    let ymax = -1e9, ymin = 1e9; sommetsMonde(S, pr.sommets, (i, x, y) => { if (y > ymax) ymax = y; if (y < ymin) ymin = y; });
    pr.hauteur = ymax - Math.min(0, ymin); tete.getWorldPosition(_v1); pr.dessus = ymax - _v1.y; id.stop();
    // assis (la fin de SitDown) : le dessous du bassin et des cuisses, et le centre de la surface d'appui
    const ass = mx.clipAction(CL.SitDown); ass.setLoop(T.LoopOnce, 1); ass.clampWhenFinished = true; ass.play(); mx.setTime(CL.SitDown.duration * 0.999); g.updateMatrixWorld(true);
    const siege = new Set(S.skeleton.bones.map((b, i) => (OS.assise.test(b.name) ? i : -1)).filter((i) => i >= 0)), pts = []; let ya = 1e9;
    sommetsMonde(S, pr.sommets, (i, x, y, z) => { if (!siege.has(dominant(i))) return; pts.push(y, z); if (y < ya) ya = y; });
    let zs = 0, nz = 0; for (let k = 0; k < pts.length; k += 2) if (pts[k] < ya + 0.06 * pr.hauteur) { zs += pts[k + 1]; nz++; }
    pr.assise = ya; pr.assiseZ = nz ? zs / nz : 0; ass.stop();
    // la marche : l'aller-retour d'un pied → la longueur du pas ; la vitesse du clip (unités du modèle par seconde)
    const ma = mx.clipAction(CL.Walk); ma.play(); let z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < 24; k++) { mx.setTime(CL.Walk.duration * k / 24); g.updateMatrixWorld(true); pied.getWorldPosition(_v1); z0 = Math.min(z0, _v1.z); z1 = Math.max(z1, _v1.z); }
    pr.vitesse = 2 * (z1 - z0) / CL.Walk.duration; ma.stop();
    // ramasser (PickUp) : l'instant où la main droite est au plus bas, et où elle est alors (repère du personnage) : le sac posé là l'attend
    const pu = mx.clipAction(CL.PickUp); pu.play(); let yb = 1e9;
    for (let k = 0; k <= 40; k++) { const t = CL.PickUp.duration * k / 40; mx.setTime(t); g.updateMatrixWorld(true); main.getWorldPosition(_v1); if (_v1.y < yb) { yb = _v1.y; pr.ramasse = { t, x: _v1.x, z: _v1.z }; } }
    pu.stop(); mx.uncacheRoot(g);
  }

  // ═══ les acteurs : un clone du gabarit, sa géométrie (les attributs du gabarit, sa propre couleur), son mélangeur ; la réserve ═══
  const MAT = { lambert: null };
  function materiau() { // Lambert à couleurs de sommets, partagé (src/scene.js lui donne son jumeau MeshStandard en qualité haute et moyenne)
    if (!MAT.lambert) { MAT.lambert = new T.MeshLambertMaterial({ vertexColors: true }); if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(MAT.lambert); } return MAT.lambert;
  }
  const LIBRES = new Map(), TOUS = []; const RESERVE = 4;
  function creer(i) {
    const pr = PROTOS[i], g = X.SkeletonUtils.clone(pr.tpl); let S = null; g.traverse((o) => { if (o.isSkinnedMesh) S = o; });
    const geo = new T.BufferGeometry(); for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(k, pr.geo.attributes[k]);
    geo.setIndex(pr.geo.index); geo.boundingBox = pr.geo.boundingBox; geo.boundingSphere = pr.geo.boundingSphere; geo.setAttribute('color', new T.BufferAttribute(new Uint16Array(pr.C0.length), 3, true));
    S.geometry = geo; S.material = materiau(); S.castShadow = true; S.frustumCulled = false; g.visible = false;
    const nomme = (n) => g.getObjectByName(n);
    const a = { g, S, pr, i, mixer: new T.AnimationMixer(g), actions: {}, joue: '', c: 0, os: { main: nomme(OS.main), avant: nomme(OS.avant), bras: nomme(OS.bras), tete: nomme(OS.tete), cuisses: OS.cuisses.map(nomme), tibias: OS.tibias.map(nomme), pieds: OS.pieds.map(nomme), mainG: nomme('FistL'), cr: nomme('accCroissant'), tasse: nomme('accTasse'), sac: nomme('accSac'), lunettes: nomme('accLunettes'), bonnet: nomme('accBonnet'), cheveux: nomme('accCheveux') } };
    a.sauve = [a.os.bras, a.os.avant, a.os.main, a.os.tete, ...a.os.tibias, ...a.os.pieds].filter(Boolean).map((b) => [b, b.quaternion.clone(), b.position.clone()]);
    g.userData.c3d = a; g.userData.cle = 'c3d'; TOUS.push(a); etat.acteurs = TOUS.length; return a;
  }
  function reserve() { for (let i = 0; i < PROTOS.length; i++) { const l = LIBRES.get(i) || []; while (l.length < RESERVE) l.push(creer(i)); LIBRES.set(i, l); } etat.chauffe = false; }
  // le personnage d'un client : le mystère, l'habitué, le bonnet (sans chapeau), sinon tiré de son numéro
  function voulu(c) {
    const par = (nom) => { const i = NOMS.indexOf(nom); return i >= 0 ? i : -1; };
    if (c.or) { const i = par(MYSTERE); if (i >= 0) return i; }
    if (c.hab && HABITUES[c.hab]) { const i = par(HABITUES[c.hab]); if (i >= 0) return i; }
    const ok = PROTOS.map((p, i) => i).filter((i) => !(c.coiffure === 3 && PROTOS[i].sansBonnet));
    const h = (c.hab ? [...String(c.hab)].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) : c.id * 2246822519) >>> 0;
    return ok[h % ok.length];
  }
  function acteur(c) {
    if (!API.pret) return null;
    if (!LIBRES.size) reserve(); // (après liberer : la réserve revient)
    const i = voulu(c), l = LIBRES.get(i); let a = l && l.length ? l.pop() : null;
    if (!a && !c.or && !c.hab) { let best = -1; for (const [j, x] of LIBRES) if (x.length && !(c.coiffure === 3 && PROTOS[j].sansBonnet) && (best < 0 || x.length > LIBRES.get(best).length)) best = j; if (best >= 0) a = LIBRES.get(best).pop(); } // un autre personnage libre
    if (!a) a = creer(i); // la réserve grandit
    a.c = c.id; a.etatP = ''; a.joieT = 0; a.salut = 0; a.salutT = 0; a.salueE = a.salueS = c.etat !== 'entre'; a.geste = null; a.assisT = 0; a.leveT = 0; a.leve = false; a.attente = 0; a.prisVu = false; a.neuf = true;
    a.yaw = YAW[c.dir] || 0; a.vitesse = 0; a.xp = null; a.zp = null; a.graine = (c.id * 0.6180339887) % 1; a.objet = null; a.sacSol = null; a.sacMain = false;
    a.lunettes = !!c.lunettes; a.bonnet = c.coiffure === 3 && !a.pr.sansBonnet; a.raye = !!c.mariniere;
    teindre(a, c); a.g.visible = true; a.g.rotation.set(0, a.yaw, 0); a.g.userData.yaw = a.yaw;
    jouer(a, 'Idle', 0); a.mixer.update(0.01 + a.graine * 2); // (rendu à la réserve, stopAllAction a remis chaque os animé à son repos)
    for (const sv of a.sauve) { sv[1].copy(sv[0].quaternion); sv[2].copy(sv[0].position); }
    etat.enService++; return a;
  }
  function rendre(a) {
    if (!a || a.c === 0) return; a.mixer.stopAllAction(); a.joue = ''; a.couche = null; a.c = 0; a.g.visible = false; if (a.halo) { a.g.remove(a.halo); a.halo = null; }
    for (const b of [a.os.cr, a.os.tasse, a.os.sac, a.os.lunettes, a.os.bonnet]) if (b) b.scale.setScalar(0); if (a.os.cheveux) a.os.cheveux.scale.setScalar(1);
    const l = LIBRES.get(a.i) || []; l.push(a); LIBRES.set(a.i, l); etat.enService = Math.max(0, etat.enService - 1);
  }
  function liberer() { // la HD interdite (src/scene.js : depuis 10 s, les clients sont tous redevenus des chibis) : la réserve rend sa mémoire (les
    // gabarits restent ; elle revient au besoin). Jamais avec un acteur en service : les géométries des acteurs partagent les tampons du gabarit
    if (!TOUS.length || TOUS.some((a) => a.c)) return false;
    for (const a of TOUS) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); a.S.skeleton.dispose(); a.S.geometry.dispose(); if (a.g.parent) a.g.parent.remove(a.g); }
    TOUS.length = 0; LIBRES.clear(); etat.acteurs = 0; etat.liberes++; return true;
  }
  // la chauffe : les acteurs libres dessinés une fois, loin sous le sol (leur géométrie, la texture de leurs os et les programmes montent sur la
  // carte graphique tout de suite, pas au premier client ; la mémoire ne bouge plus ensuite) : chauffer() les rend à src/scene.js, qui les pose
  // dans la scène pour une image ; rentrer() reprend ceux qu'aucun client n'a pris entre-temps
  function chauffer() { if (etat.chauffe || !API.pret) return null; const gs = []; for (const l of LIBRES.values()) for (const a of l) { a.g.position.set(0, -5000, 0); a.g.scale.setScalar(1); a.g.visible = true; gs.push(a.g); } etat.chauffe = true; etat.chauffes = (etat.chauffes || 0) + 1; return gs; }
  function rentrer(gs) { for (const g of gs || []) { const a = g.userData.c3d; if (a && a.c) continue; if (g.parent) g.parent.remove(g); g.visible = false; } }

  // ─── les couleurs : rôles → couleurs (linéaires) ───
  const lin = (hex, k) => { _c.set(hex); if (k != null) _c.multiplyScalar(k); return [_c.r, _c.g, _c.b]; };
  const melange = (a, b, k) => { _c.set(a); const c2 = new T.Color(b); _c.lerp(c2, k); return [_c.r, _c.g, _c.b]; };
  function palette(c) {
    const h = (c.id * 2654435761) >>> 0, peau = c.peau || '#FFD7B5', ch = c.cheveux || '#4A3328', haut = c.or ? OR : c.haut || '#FF9FB2';
    _c.set(peau); const clair = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; // (en linéaire) : sur une peau sombre, les yeux plus noirs
    const p = new Array(ROLES.length).fill(null);
    p[RI.peau] = lin(peau); p[RI.yeux] = lin(clair < 0.25 ? '#1A120D' : '#3A2A22'); p[RI.cheveux] = lin(ch);
    p[RI.gris] = c.hab || c.or ? lin(ch) : lin(GRIS[h % GRIS.length]); p[RI.haut] = lin(haut); p[RI.hautSombre] = c.or ? lin(OR2) : lin(haut, 0.42);
    p[RI.hautClair] = melange(haut, '#FFFFFF', 0.72); p[RI.bas] = lin(c.or ? OR2 : BAS[(h >>> 3) % BAS.length]);
    p[RI.casque] = lin(CASQUES[(h >>> 5) % CASQUES.length]); p[RI.hautForme] = lin(c.or ? '#2A2622' : FORMES[(h >>> 9) % FORMES.length]);
    p[RI.sac] = lin(c.or ? OR : c.sacCol || '#F2D7B6'); p[RI.anse] = lin(c.or ? OR2 : '#C9955A'); p[RI.lunettes] = lin('#3A2A22');
    p[RI.bonnet] = lin(c.bonnet || '#9BD0FF'); p[RI.pompon] = lin('#FFFFFF');
    return p;
  }
  const RAYURE = lin('#3A86C8'), BLANC = lin('#FFFFFF');
  function teindre(a, c) { // la couleur de chaque sommet : son rôle dans la palette du client, sinon sa couleur d'origine ; la marinière : le haut blanc rayé de bleu
    const pal = palette(c), col = a.S.geometry.attributes.color, d = col.array, R = a.pr.R, C0 = a.pr.C0, RAY = a.pr.RAY, raye = a.raye;
    for (let i = 0; i < R.length; i++) {
      let p = pal[R[i]]; if (raye && R[i] === RI.haut) p = RAY[i] ? RAYURE : BLANC;
      if (p) { d[i * 3] = p[0] * 65535; d[i * 3 + 1] = p[1] * 65535; d[i * 3 + 2] = p[2] * 65535; } else { d[i * 3] = C0[i * 3] * 65535; d[i * 3 + 1] = C0[i * 3 + 1] * 65535; d[i * 3 + 2] = C0[i * 3 + 2] * 65535; }
    }
    col.needsUpdate = true;
  }

  // ═══ l'animation : jouer un clip (fondu), les couches du haut du corps, l'IK du bras (manger) et des jambes (assis), les gestes de la tête ═══
  function jouer(a, nom, fondu, une, depuis) {
    if (a.joue === nom) return; const clip = CL[nom]; if (!clip) return;
    const ac = a.actions[nom] || (a.actions[nom] = a.mixer.clipAction(clip)); ac.reset(); ac.setLoop(une ? T.LoopOnce : T.LoopRepeat, Infinity); ac.clampWhenFinished = !!une; ac.setEffectiveWeight(1); ac.timeScale = 1; ac.play();
    const av = a.joue && a.actions[a.joue]; if (av && fondu > 0) av.crossFadeTo(ac, fondu, false); else if (av) av.stop();
    if (depuis != null) ac.time = depuis; else if (!une && !av) ac.time = a.graine * clip.duration;
    a.joue = nom;
  }
  function couche(a, nom, poids) { // une couche du haut du corps (la joie, le salut), son poids de 0 à 1 (au-delà de la pose de fond)
    const clip = CL[nom]; if (!clip) return; let ac = a.actions[nom];
    if (poids <= 0.001) { if (ac && ac.isRunning()) ac.stop(); return; }
    if (!ac) ac = a.actions[nom] = a.mixer.clipAction(clip);
    if (!ac.isRunning()) { ac.reset(); ac.setLoop(nom === '__joie' ? T.LoopOnce : T.LoopRepeat, Infinity); ac.clampWhenFinished = true; ac.play(); if (nom === '__joie') ac.timeScale = clip.duration / JOIE; }
    ac.setEffectiveWeight((nom === '__salut' ? 8 : 3) * poids); // (au-dessus du fond, de poids 1 : la couche l'emporte aux trois quarts, le salut presque tout ; le bas du corps reste au fond)
  }
  const posM = (o, v) => v.setFromMatrixPosition(o.matrixWorld);
  function tournerMonde(os, q) { // une rotation en espace monde, appliquée à l'os (puis ses enfants recalculés)
    os.parent.getWorldQuaternion(_q2); _q3.copy(_q2).multiply(os.quaternion).premultiply(q); os.quaternion.copy(_q2.invert().multiply(_q3)); os.updateMatrixWorld(true);
  }
  const _S = new T.Vector3(), _E = new T.Vector3(), _W = new T.Vector3(), _Tg = new T.Vector3(), _d = new T.Vector3(), _nrm = new T.Vector3(), _e1 = new T.Vector3(), _e2 = new T.Vector3(), _t1 = new T.Vector3(), _t2 = new T.Vector3();
  function ikBras(a, cible, k) { // la main droite vers cible (monde), pondéré par k : deux os (bras, avant-bras), le coude du côté où il est
    if (k < 0.002) return; const o = a.os; posM(o.bras, _S); posM(o.avant, _E); posM(o.main, _W);
    const l1 = _S.distanceTo(_E), l2 = _E.distanceTo(_W); _Tg.copy(_W).lerp(cible, k); _d.subVectors(_Tg, _S); let d = _d.length(); if (d < 1e-6) return;
    d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, d)); _d.normalize();
    _nrm.crossVectors(_t1.subVectors(_E, _S), _t2.subVectors(_W, _E)); if (_nrm.lengthSq() < 1e-10) _nrm.set(0, -1, 0); _nrm.normalize();
    const A = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    _e1.copy(_d).applyAxisAngle(_nrm, A).multiplyScalar(l1).add(_S); _e2.copy(_d).applyAxisAngle(_nrm, -A).multiplyScalar(l1).add(_S); const E2 = _e1.distanceTo(_E) < _e2.distanceTo(_E) ? _e1 : _e2;
    tournerMonde(o.bras, _q1.setFromUnitVectors(_t1.subVectors(_E, _S).normalize(), _t2.subVectors(E2, _S).normalize()));
    posM(o.main, _W); tournerMonde(o.avant, _q1.setFromUnitVectors(_t1.subVectors(_W, E2).normalize(), _t2.subVectors(_Tg, E2).normalize()));
  }
  function piedsAuSol(a, k) { // assis : le tibia tourne au genou pour que la cheville touche le sol (devant, dans l'axe de la cuisse), ou pend droit
    const o = a.os, ch = a.pr.cheville * a.g.scale.y;
    for (let i = 0; i < 2; i++) {
      const tib = o.tibias[i], pied = o.pieds[i]; if (!tib || !pied) continue;
      posM(tib, _v1); posM(pied, _v2); posM(o.cuisses[i], _v3); const Lg = _v1.distanceTo(_v2), dy = _v1.y - ch;
      _v4.subVectors(_v1, _v3); _v4.y = 0; if (_v4.lengthSq() < 1e-8) _v4.set(Math.sin(a.g.rotation.y), 0, Math.cos(a.g.rotation.y)); _v4.normalize();
      if (dy >= Lg) _v5.copy(_v1).y -= Lg; else _v5.copy(_v1).addScaledVector(_v4, Math.sqrt(Lg * Lg - dy * dy)).y -= dy;
      _v5.lerp(_v2, 1 - k);
      _q1.setFromUnitVectors(_t1.subVectors(_v2, _v1).normalize(), _t2.subVectors(_v5, _v1).normalize()); tournerMonde(tib, _q1);
      pied.position.copy(pied.parent.worldToLocal(_t1.copy(_v5))); pied.updateMatrixWorld(true); // (les pieds de l'UACP sont des os d'IK, enfants de la racine)
    }
  }
  // un accessoire tenu : à la position p (monde), l'orientation q (monde), la taille k (unités du monde) ; ou rangé (échelle nulle)
  function tenir(b, p, q, k) {
    if (!b) return; if (!p) { if (b.scale.x !== 0) { b.scale.setScalar(0); b.updateMatrixWorld(true); } return; }
    _m1.compose(p, q, _s1.setScalar(k)); _m2.copy(b.parent.matrixWorld).invert().multiply(_m1); _m2.decompose(b.position, b.quaternion, b.scale); b.updateMatrixWorld(true);
  }
  const porter = (b, on) => { if (b && (b.scale.x !== 0) !== on) { b.scale.setScalar(on ? 1 : 0); b.updateMatrixWorld(true); } };
  const angleCourt = (x) => Math.atan2(Math.sin(x), Math.cos(x));

  // ─── le halo du client mystère : un dégradé radial doré dressé derrière lui (comme celui des chibis) ; un seul, prêté ───
  let HALO = null;
  function halo() {
    if (HALO) return HALO;
    const tex = MODELES.texture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64);
    tex.userData.partagee = true; const m = new T.SpriteMaterial({ map: tex, color: OR, transparent: true, opacity: 0.6, depthWrite: false }); MODELES.partager(m);
    HALO = new T.Sprite(m); HALO.userData.halo = true; return HALO;
  }

  // ═══ poser un client : sa place (VIE), son clip, ses couches, l'assise, le repas, le sac, ses gestes ═══
  function poser(a, c, E, dt, ctx) {
    const g = a.g, pr = a.pr, K = ctx.K, s = HAUT * K * (c.taille || 1) / pr.hauteur, assis = c.etat === 'assis', leve = assis && c.leveT != null;
    const marche = c.etat === 'entre' || c.etat === 'vaTable' || (c.etat === 'sort' && !(c.joie > 0)) || (c.etat === 'attend' && !!c.glisse);
    // les passages d'un état à l'autre : servi (la joie ; l'habitué et le mystère touché disent oui, le mystère oublié dit non) ; touché
    if (a.etatP === 'attend' && c.etat !== 'attend') {
      if (c.or && !c.pris) a.geste = { nom: 'non', t: 0 };
      else { a.joieT = JOIE; if (c.hab) a.geste = { nom: 'oui', t: 0 }; }
    }
    if (c.or && c.pris && !a.prisVu) { a.prisVu = true; a.geste = { nom: 'oui', t: 0 }; }
    if (assis && a.etatP !== 'assis') { a.assisT = a.neuf ? 9 : 0; a.leveT = 0; } // (un client installé d'office, déjà assis : la fin du clip)
    a.etatP = c.etat; a.neuf = false;
    g.visible = c.alpha > 0.05; const sc = s * (0.75 + 0.25 * Math.min(1, c.alpha)); g.scale.setScalar(sc);
    // le cap : face à sa marche (même quand la file avance de côté), sinon celui de VIE
    const x = c.x, z = ctx.wz(c.y) - (1 - c.alpha) * 30; let cap = YAW[c.dir] || 0;
    if (a.xp != null && dt > 0) { const vx = (x - a.xp) / dt, vz = (z - a.zp) / dt, vv = Math.hypot(vx, vz); a.vitesse += (vv - a.vitesse) * Math.min(1, dt * 8); if (vv > 8 && !assis) cap = Math.atan2(vx, vz); }
    a.xp = x; a.zp = z;
    a.yaw += angleCourt(cap - a.yaw) * Math.min(1, dt * 10); g.rotation.y = a.yaw;
    // le clip de fond : assis (SitDown, figé à sa fin), se lever en ramassant son sac (PickUp, depuis le bas de la flexion), marcher, attendre
    if (leve) {
      if (a.joue !== 'PickUp') { jouer(a, 'PickUp', 0.3, true, Math.max(0, pr.ramasse.t - 0.32)); a.leveT = 0; }
      a.leveT += dt; a.actions.PickUp.timeScale = 1.15;
    } else if (assis) {
      if (a.joue !== 'SitDown') { jouer(a, 'SitDown', a.assisT > 1 ? 0 : 0.25, true); if (a.assisT > 1) a.actions.SitDown.time = CL.SitDown.duration; }
      a.assisT += dt;
    } else if (marche) jouer(a, 'Walk', 0.25);
    else jouer(a, 'Idle', 0.3);
    const ac = a.actions[a.joue]; if (ac && a.joue === 'Walk') ac.timeScale = Math.max(0.55, Math.min(2.2, a.vitesse / Math.max(1e-3, pr.vitesse * sc)));
    // les couches : la joie (servi : les bras levés, 1,35 s), le salut (à la porte, en entrant et en sortant)
    if (a.joieT > 0) { a.joieT -= dt; const u = 1 - a.joieT / JOIE; couche(a, '__joie', Math.min(1, u * 5, (1 - u) * 4)); } else couche(a, '__joie', 0);
    // (le salut dure 1,5 s : en entrant, dès la porte ; en sortant, sur les deux derniers bouts de chemin, avant de s'effacer)
    if (!a.salueE && c.etat === 'entre' && c.wp === 0) { a.salueE = true; a.salutT = 1.5; }
    if (!a.salueS && c.etat === 'sort' && c.chemin && c.wp >= c.chemin.length - 2 && !(c.joie > 0)) { a.salueS = true; a.salutT = 1.5; }
    a.salutT = Math.max(0, a.salutT - dt);
    a.salut = Math.max(0, Math.min(1, a.salut + (a.salutT > 0 && a.joieT <= 0 ? dt * 4 : -dt * 3))); couche(a, '__salut', a.salut);
    // (le mélangeur n'écrit une valeur que si elle change : un clip figé ne réécrit plus le bras, les jambes ni la tête ; on rend donc aux os
    //  que l'IK et les gestes touchent la pose du clip avant chaque mise à jour, sinon ils s'empileraient d'une image à l'autre)
    for (const [b, q, p] of a.sauve) { b.quaternion.copy(q); b.position.copy(p); }
    a.mixer.update(dt);
    for (const sv of a.sauve) { sv[1].copy(sv[0].quaternion); sv[2].copy(sv[0].position); }
    // la place : debout au point de VIE ; assis, le bassin sur le siège (la hauteur d'assise, le centre mesuré au gabarit) ; il s'en dégage en se levant
    const kA = leve ? Math.max(0, 1 - a.leveT / 0.25) : assis ? Math.min(1, a.assisT / Math.max(0.2, CL.SitDown.duration * 0.9)) : 0;
    let y = 0, ox = 0, oz = 0;
    if ((assis || leve) && c.siege) { const ys = ASSISE[c.siege.zone] || 16; y = (ys - pr.assise * sc) * kA; const d = -pr.assiseZ * sc * kA; ox = Math.sin(a.yaw) * d; oz = Math.cos(a.yaw) * d; }
    g.position.set(x + ox, y, z + oz); g.updateMatrixWorld(true);
    // assis : les pieds au sol ; le repas (toutes les 2,6 s environ, la main monte à la bouche : le croissant, ou la tasse)
    const o = a.os, cyc = (E.t * 0.38 + a.graine * 7) % 1, mange = assis && !leve && kA >= 1;
    if (mange) {
      piedsAuSol(a, 1);
      const k = cyc < 0.3 ? Math.sin(cyc / 0.3 * Math.PI) : 0;
      if (k > 0) { posM(o.tete, _v4); _v4.x += Math.sin(a.yaw) * BOUCHE[2] * pr.hauteur * sc; _v4.z += Math.cos(a.yaw) * BOUCHE[2] * pr.hauteur * sc; _v4.y += BOUCHE[1] * pr.hauteur * sc; ikBras(a, _v4, k); }
    } else if (assis && !leve && kA > 0.6) piedsAuSol(a, (kA - 0.6) / 0.4);
    else if (leve && kA > 0) piedsAuSol(a, kA);
    // les gestes de la tête : oui (hocher), non (secouer) ; l'impatience du mystère (plus de 6 s sans être touché) : il regarde autour de lui et tape du pied
    a.attente = c.etat === 'attend' && !c.glisse ? a.attente + dt : 0;
    const impatient = c.or && !c.pris && a.attente > 6;
    if (a.geste) {
      const gs = a.geste; gs.t += dt; const D = gs.nom === 'oui' ? 0.9 : 1.1, u = gs.t / D;
      if (u >= 1) a.geste = null;
      else { const env = Math.sin(Math.PI * u), ang = gs.nom === 'oui' ? 0.32 * env * Math.sin(u * Math.PI * 6) : 0.42 * env * Math.sin(u * Math.PI * 6); // trois hochements, trois va-et-vient
        if (gs.nom === 'oui') { _v1.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); tournerMonde(o.tete, _q1.setFromAxisAngle(_v1, Math.abs(ang))); } else tournerMonde(o.tete, _q1.setFromAxisAngle(AXE_Y, ang)); }
    } else if (impatient) {
      tournerMonde(o.tete, _q1.setFromAxisAngle(AXE_Y, 0.55 * Math.sin(E.t * 1.4 + a.graine * 5)));
      const pd = o.pieds[1]; if (pd) { const k = Math.max(0, Math.sin(E.t * 9 + a.graine * 3)); _v1.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)); tournerMonde(pd, _q1.setFromAxisAngle(_v1, -0.35 * k)); }
    }
    // les objets : le croissant ou la tasse (en allant s'asseoir, et assis), le sac (servi : en main ; assis : par terre ; ramassé en se levant)
    if (!a.objet && (c.etat === 'vaTable' || assis)) a.objet = c.siege && c.siege.zone === 'bar' ? 'tasse' : c.id % 3 === 0 ? 'tasse' : 'cr';
    const objet = (c.etat === 'vaTable' || (assis && !leve)) && !c.or ? a.objet : null, boit = mange && cyc < 0.3 ? Math.sin(cyc / 0.3 * Math.PI) : 0;
    for (const [b, nom, rx, taille] of [[o.tasse, 'tasse', -0.9 * boit, 8.5], [o.cr, 'cr', -0.35, 13]]) {
      if (objet !== nom) { tenir(b, null); continue; }
      posM(o.main, _v1); posM(o.avant, _v2); _v3.subVectors(_v1, _v2).normalize().multiplyScalar(PRISE * pr.hauteur * sc); _v1.add(_v3);
      _q1.setFromEuler(_e.set(rx, a.yaw, 0, 'YXZ')); tenir(b, _v1, _q1, taille / 16 * K * (c.taille || 1));
    }
    poserSac(a, c, assis, leve, sc, K);
    porter(o.lunettes, a.lunettes); porter(o.bonnet, a.bonnet); porter(o.cheveux, !a.bonnet); // (le bonnet mis : les cheveux de dessus repliés dedans)
    // le halo du mystère qui attend (dressé derrière lui ; 54 × 70 pour un client de 73 de haut, comme les chibis)
    const avecHalo = c.or && !c.pris && c.etat === 'attend';
    if (avecHalo && !a.halo) { a.halo = halo(); g.add(a.halo); } else if (!avecHalo && a.halo) { g.remove(a.halo); a.halo = null; }
    if (a.halo) { const k = Math.sin(E.t * 3), u = pr.hauteur / 73; a.halo.position.set(0, 36 * u, -8 * u); a.halo.scale.set((54 + k * 4) * u, (70 + k * 5) * u, 1); }
  }
  // le sac : en main droite (servi, en sortant), en main gauche en allant s'asseoir (la droite tient le croissant), posé par terre assis (là
  // où les mains le ramassent), dans la main droite dès l'instant du clip où elle touche le sol
  function poserSac(a, c, assis, leve, sc, K) {
    const o = a.os, b = o.sac; if (!b) return;
    if (!c.sac) { tenir(b, null); a.sacSol = null; return; }
    const k = (c.taille || 1) * K, pr = a.pr;
    if ((assis && !leve) || (leve && a.actions.PickUp && a.actions.PickUp.time < pr.ramasse.t)) {
      if (!a.sacSol || !leve) { // posé à l'endroit où la main droite descend (repère du personnage debout, à sa place)
        const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw), x = c.x, z = a.zp;
        a.sacSol = a.sacSol || new T.Vector3(); a.sacSol.set(x + cy * pr.ramasse.x * sc + sy * pr.ramasse.z * sc, 13 * k * 0.5 + 0.2, z - sy * pr.ramasse.x * sc + cy * pr.ramasse.z * sc);
      }
      _q1.setFromAxisAngle(AXE_Y, a.yaw + 0.5); _v1.copy(a.sacSol); _v1.y = 13 * k + 0.2 + 3.2 * k; // (l'origine du sac est en haut de l'anse)
      tenir(b, _v1, _q1, k); return;
    }
    const main = c.etat === 'vaTable' && o.mainG ? o.mainG : o.main; // en allant s'asseoir : la main gauche
    posM(main, _v1); _v1.y -= 1.5 * k; _q1.setFromAxisAngle(AXE_Y, a.yaw); tenir(b, _v1, _q1, k);
  }
  // le haut de la tête d'un acteur (monde) : le calque y pose le prénom de l'habitué ; et sa hauteur
  function tete(a) { if (!a || !a.os.tete) return null; const p = posM(a.os.tete, new T.Vector3()); p.y += a.pr.dessus * a.g.scale.y; return p; }

  Object.assign(API, { actif: true, permis, demander, preparer, acteur, poser, rendre, tete, liberer, chauffer, rentrer, PERSONNAGES, CL, PROTOS });
  Object.defineProperty(API, 'etat', { enumerable: true, get: () => Object.assign({ libres: [...LIBRES.values()].reduce((s, l) => s + l.length, 0) }, etat) }); // (pour les tests : la réserve, la cuisson)
  return API;
})();
if (typeof module !== 'undefined') module.exports = CLIENTS3D;
