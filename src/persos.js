/* LE FOURNIL — les personnages et les pâtisseries en 3D : clients, apprentis, boulanger, en volumes low-poly arrondis pastel.
   Un personnage = un Group (pieds à y = 0, le visage vers +Z) : deux jambes qui balancent, un buste fusionné (vêtement, tablier,
   marinière), une tête fusionnée (peau, coiffure, toque, chapeau), un visage en décalque (atlas d'expressions sur une calotte
   transparente), deux bras, et les accessoires (sac, plateau + pâtisserie, clé, halo). La verticale est étirée de 1/cos 52° pour
   que la silhouette garde à l'écran les proportions du dessin 2D (tête r = 10, corps 22 de large, 45 px de haut). */
const PERSOS = (() => {
  'use strict';
  const M = MODELES, TAU = Math.PI * 2, HP = Math.PI / 2, CY = Math.cos(52 * Math.PI / 180);
  const L = '#4A3328', JOUE = '#FFB3B3', BLANC = '#FFFFFF', OR = '#FFC84A', ROUGE = '#E1496C', GRIS = '#8C8C8C';
  const HAUTEUR = 73, TAILLE_PATISSERIE = 16; // hauteur canonique (45 px à l'écran) ; envergure d'une pâtisserie
  const EXPR = { neutre: 0, sourire: 1, surpris: 2, fermes: 3 };
  // ─── géométries propres aux personnages, mises en cache dans MODELES.GEOS (donc jamais libérées) ───
  function memo(k, f) { k = 'persos|' + k; let g = M.GEOS.get(k); if (!g) { g = f(); g.userData.cache = true; M.GEOS.set(k, g); } return g; }
  const calotte = (r, th, n) => memo(`cal|${r}|${th}`, () => new THREE.SphereGeometry(r, n || 14, 7, 0, TAU, 0, th)); // une calotte sphérique centrée, du pôle jusqu'à l'angle th
  const patchS = (r, phi, t0, tl) => memo(`ps|${r}|${phi}|${t0}|${tl}`, () => new THREE.SphereGeometry(r, 8, 4, HP - phi / 2, phi, t0, tl)); // un morceau de sphère centré sur +Z
  const patchC = (r, h, phi) => memo(`pc|${r}|${h}|${phi}`, () => new THREE.CylinderGeometry(r, r, h, 8, 1, true, -phi / 2, phi)); // un morceau de cylindre (centré) face à +Z
  const bande = (r, h) => memo(`bd|${r}|${h}`, () => new THREE.CylinderGeometry(r, r, h, 16, 1, true)); // un anneau cylindrique ouvert, centré
  const pendu = (r, l, dy) => memo(`pd|${r}|${l}|${dy}`, () => new THREE.CapsuleGeometry(r, l, 3, 8).translate(0, dy - l / 2, 0)); // une capsule qui pend : son pivot en haut
  // ─── le visage : un atlas peint une fois (8 cases : neutre, sourire, surpris, yeux fermés × sans / avec lunettes) ───
  const RV = 10.35, PHI = 2.4, THL = 1.8, TH0 = 0.7, NCEL = 8, CW = 128, CH = 96; // la calotte du visage : rayon, étendue angulaire, et la taille des cases
  let matVisage = null, matHalo = null;
  function peindreVisages(c, Wc, Hc) {
    const cw = Wc / NCEL, S = cw / (RV * PHI), cl = (v) => Math.max(-1, Math.min(1, v));
    c.clearRect(0, 0, Wc, Hc); c.lineCap = 'round';
    for (let k = 0; k < NCEL; k++) {
      const expr = k % 4, lun = k >= 4, ox = k * cw;
      const P = (x, y) => [ox + (Math.asin(cl(x / RV)) / PHI + 0.5) * cw, (Math.acos(cl(y / RV)) - TH0) / THL * Hc]; // (x, y) autour du centre de la tête → pixel de l'atlas
      const disque = (x, y, r, col) => { const [px, py] = P(x, y); c.fillStyle = col; c.beginPath(); c.arc(px, py, r * S, 0, TAU); c.fill(); };
      const arc = (x, y, r, a0, a1, lw) => { const [px, py] = P(x, y); c.strokeStyle = L; c.lineWidth = lw * S; c.beginPath(); c.arc(px, py, r * S, a0, a1); c.stroke(); };
      c.save(); c.beginPath(); c.rect(ox, 0, cw, Hc); c.clip();
      disque(-7, 1.6, 1.9, JOUE); disque(7, 1.6, 1.9, JOUE);
      if (expr === 3) { arc(-4, 4.2, 1.9, Math.PI + 0.35, TAU - 0.35, 1.3); arc(4, 4.2, 1.9, Math.PI + 0.35, TAU - 0.35, 1.3); }
      else { const r = expr === 2 ? 2.1 : 1.6; disque(-4, 4.8, r, L); disque(4, 4.8, r, L); }
      if (expr === 2) disque(0, 0.6, 1.6, L); else if (expr === 1 || expr === 3) arc(0, 1.8, 3.3, 0.3, Math.PI - 0.3, 1.6); else arc(0, 1.6, 2.3, 0.5, Math.PI - 0.5, 1.4);
      if (lun) { arc(-4, 4.8, 3.5, 0, TAU, 1.1); arc(4, 4.8, 3.5, 0, TAU, 1.1); const [ax, ay] = P(-0.6, 4.8), [bx] = P(0.6, 4.8); c.lineWidth = 1.1 * S; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, ay); c.stroke(); }
      c.restore();
    }
  }
  function visageMat() { // partagé par tous les visages ; en Node (sans canvas) un simple matériau peau
    if (matVisage) return matVisage;
    if (typeof document === 'undefined') return (matVisage = M.mat('#FFD7B5'));
    const tx = M.texture(peindreVisages, NCEL * CW, CH); tx.userData.partagee = true; tx.toJSON = () => 'visages'; // la clé du cache de MODELES.mat reste courte
    matVisage = M.mat(BLANC, { map: tx }); matVisage.alphaTest = 0.5; return matVisage;
  }
  const geoVisage = (k) => memo('visage|' + k, () => { const g = new THREE.SphereGeometry(RV, 10, 8, HP - PHI / 2, PHI, TH0, THL), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / NCEL); return g; });
  function haloMat() { // un dégradé radial doré pour le client mystère (sprite) ; en Node, le halo carré de MODELES
    if (matHalo) return matHalo;
    if (typeof document === 'undefined') return (matHalo = M.MAT.halo);
    const tx = M.texture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64);
    tx.userData.partagee = true; matHalo = new THREE.SpriteMaterial({ map: tx, color: OR, transparent: true, opacity: 0.6, depthWrite: false }); return matHalo;
  }
  // ─── un personnage : jambes, buste, tête, visage, bras, accessoires ───
  function construire(o) {
    const peau = o.peau || '#FFD7B5', haut = o.or ? OR : o.haut || '#FF9FB2', chev = o.cheveux || L, large = o.tablier === 'large', phiT = large ? 1.9 : 1.3;
    const g = new THREE.Group(), racine = new THREE.Group(), ht = new THREE.Group(), P = { racine, haut: ht, bras: [], jambes: [] };
    g.add(racine); racine.add(ht); g.userData.parts = P; g.userData.options = o;
    for (const sx of [-1, 1]) { const j = M.mesh(pendu(3, 13, -1.5), M.mat(L), { x: sx * 4.5, y: 17.5 }); P.jambes.push(j); racine.add(j); }
    // le buste : une capsule, rayures de marinière, tablier qui épouse le corps, col et foulard du patron
    const corps = [M.part(M.capsule(11, 12, 12), haut, { y: 36 })];
    if (o.mariniere) for (const y of [31.5, 36, 40.5, 44.8]) corps.push(M.part(bande(11.4, 2.2), '#3A86C8', { y }));
    if (o.tablier) {
      corps.push(M.part(patchS(11.7, phiT, 1.05, HP - 1.05), BLANC, { y: 42 }), M.part(patchC(11.7, 12, phiT), BLANC, { y: 36 }), M.part(patchS(11.7, phiT, HP, 0.95), BLANC, { y: 30 }));
      if (o.lisere) corps.push(M.part(patchS(12, phiT, HP + 0.4, 0.28), OR, { y: 30 }));
    }
    if (o.col) corps.push(M.part(patchC(12, 5, 2.3), '#2B5BD7', { y: 45.5, ry: -1.45 }), M.part(patchC(12, 5, 0.6), BLANC, { y: 45.5 }), M.part(patchC(12, 5, 2.3), ROUGE, { y: 45.5, ry: 1.45 }), M.part(patchC(12, 5, 0.6), BLANC, { y: 45.5, ry: Math.PI }));
    if (o.foulard) corps.push(M.part(M.tore(9.2, 2.4, TAU, 8, 16), ROUGE, { y: 51, rx: HP }), M.part(M.sphere(2.6, 8), ROUGE, { y: 49, z: 9.6 }), M.part(M.capsule(1.5, 5, 6), ROUGE, { x: -2, y: 44, z: 12.2, rz: 0.3 }), M.part(M.capsule(1.5, 4, 6), ROUGE, { x: 2.5, y: 44.5, z: 12, rz: -0.3 }));
    P.corps = M.maille(corps); ht.add(P.corps);
    // la tête : peau, cou, coiffure (calotte, mèches, chignon, bonnet), toque, haut-de-forme, moustache
    const tete = [M.part(M.sphere(10, 14), peau), M.part(M.cylindre(3.6, 3.6, 8, 8), peau, { y: -14 })];
    if (!o.toque) tete.push(M.part(calotte(10.7, 1.5), chev, { rx: -0.78 }));
    if (o.coiffure === 1 && !o.toque) tete.push(M.part(M.capsule(2.3, 7, 6), chev, { x: -9.8, z: -1.5, rz: -0.12 }), M.part(M.capsule(2.3, 7, 6), chev, { x: 9.8, z: -1.5, rz: 0.12 }));
    if (o.coiffure === 2 && !o.toque) tete.push(M.part(M.sphere(4.2, 8), chev, { y: 10.5, z: -4 }));
    if (o.coiffure === 3 && !o.toque) tete.push(M.part(bande(10, 4.2), o.bonnet || '#9BD0FF', { y: 10 }), M.part(calotte(10.2, HP, 14), o.bonnet || '#9BD0FF', { y: 12 }), M.part(M.sphere(3, 8), BLANC, { y: 22.7 }));
    if (o.toque) { const th = typeof o.toque === 'number' ? o.toque : 14, hc = Math.max(1, th - 8); tete.push(M.part(M.cylindre(9.2, 9.2, 4, 14), BLANC, { y: 8 }), M.part(M.cylindre(8, 8.8, hc, 14), BLANC, { y: 12 }), M.part(calotte(8, HP, 14), BLANC, { y: 12 + hc })); if (o.lisere) tete.push(M.part(bande(9.5, 1.4), OR, { y: 8.6 })); }
    if (o.or) tete.push(M.part(M.cylindre(11.8, 11.8, 1.6, 16), L, { y: 9.6 }), M.part(M.cylindre(7.4, 7.2, 15, 14), L, { y: 10 }), M.part(bande(7.7, 2.2), OR, { y: 13 }));
    if (o.moustache) tete.push(M.part(M.capsule(1.3, 3.2, 6), '#8C5A3C', { x: -2.6, y: 2.4, z: 10.1, rz: 1.05 }), M.part(M.capsule(1.3, 3.2, 6), '#8C5A3C', { x: 2.6, y: 2.4, z: 10.1, rz: -1.05 }));
    P.tete = M.maille(tete); P.tete.position.y = 63; ht.add(P.tete);
    P.visage = new THREE.Mesh(geoVisage(o.lunettes ? 4 : 0), visageMat()); P.visage.position.y = 63; P.visage.userData.k = o.lunettes ? 4 : 0; ht.add(P.visage);
    for (const sx of [-1, 1]) { const b = M.mesh(pendu(2.6, 11, 0), M.mat(peau), { x: sx * 11.6, y: 46 }); b.rotation.z = sx * 0.1; P.bras.push(b); ht.add(b); }
    // les accessoires, cachés tant qu'animer ne les montre pas
    if (o.sac || o.sacCol) { P.sac = M.maille([M.part(M.boite(9, 13, 5, 1.2), o.sacCol || '#F2D7B6'), M.part(M.capsule(2.2, 5, 6), '#E8B46A', { y: 15.5, rz: -0.25 })]); P.sac.position.set(14.5, 22, 4); P.sac.visible = false; ht.add(P.sac); }
    if (o.plateau) {
      P.plateau = M.mesh(M.boite(24, 2, 13, 0.8), M.mat('#C9B8AE'), { y: 44, z: 16 }); P.plateau.visible = false; ht.add(P.plateau);
      P.produit = patisserie(o.produit == null ? 0 : o.produit); P.produit.position.set(0, 46, 16); P.produit.visible = false; ht.add(P.produit);
    }
    if (o.cle) { P.cle = M.maille([M.part(M.boiteSimple(3, 14, 2.2), GRIS, { y: -5 }), M.part(M.cylindre(3.6, 3.6, 2.2, 10), GRIS, { y: 9.5, rx: HP }), M.part(M.boiteSimple(2.2, 3, 2.6), L, { y: 11 })]); P.cle.position.set(13, 39, 11); P.cle.visible = false; ht.add(P.cle); }
    if (o.or) {
      P.halo = new THREE.Sprite(haloMat()); P.halo.position.set(0, 36, -8); P.halo.scale.set(54, 70, 1); P.halo.visible = false; ht.add(P.halo);
      P.etincelles = M.mesh(memo('etincelles', () => M.assembler([22, 36, 50, 30].map((y, k) => M.part(M.sphere(1.9, 6), OR, { x: Math.cos(k * HP) * 20, y, z: Math.sin(k * HP) * 20 })))), M.mat(OR, { emissive: OR, emissiveIntensity: 0.5 }), null, { ombre: false }); P.etincelles.visible = false; ht.add(P.etincelles);
    }
    if (o.sueur) { P.sueur = M.maille([M.part(M.sphere(2.2, 8), '#9BD0FF'), M.part(M.cone(2.1, 3.4, 8), '#9BD0FF', { y: 1 })]); P.sueur.position.set(12.5, 66, 5); P.sueur.visible = false; ht.add(P.sueur); }
    P.visage.castShadow = false;
    return g;
  }
  const creer = (o) => construire(o || {});
  // le patron : même grammaire, 1,25 fois plus grand ; toque, foulard, moustache, liseré et col selon le titre
  function boulanger(rang) {
    rang = rang || 0; const th = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5);
    const g = construire({ haut: '#FF6B8B', peau: '#FFD7B5', tablier: 'large', toque: th, lisere: rang >= 4, foulard: rang >= 3, moustache: rang >= 3, col: rang >= 5, sueur: true });
    g.userData.parts.racine.scale.setScalar(1.25); g.userData.rang = rang; return g;
  }
  // ─── l'animation, sans aucune allocation : poses, visibilités, expression ───
  function visage(P, k) { k = (P.visage.userData.k & 4) | k; if (P.visage.userData.k !== k) { P.visage.userData.k = k; P.visage.geometry = geoVisage(k); } }
  const lacet = (dir) => (dir === 1 ? HP : dir === -1 ? -HP : dir === 2 ? Math.PI : 0);
  function animer(g, o) {
    const P = g.userData.parts, marche = !!o.marche, assis = !!o.assis, ph = o.phase || 0, t = o.t || 0, s = marche ? Math.sin(ph) * 0.5 : 0;
    const bg = P.bras[0], bd = P.bras[1], jg = P.jambes[0], jd = P.jambes[1];
    P.haut.position.y = assis ? -3 : marche ? Math.abs(Math.sin(ph)) * 2 / CY : 0;
    jg.rotation.x = assis ? -HP + 0.08 : s; jd.rotation.x = assis ? -HP + 0.08 : -s;
    bg.rotation.z = -0.1; bd.rotation.z = 0.1;
    if (o.plateau) { bg.rotation.x = bd.rotation.x = -1.45; }
    else if (o.cle) { bd.rotation.x = -1.0; bd.rotation.z = 0.25; bg.rotation.x = s; }
    else if (assis) { bg.rotation.x = bd.rotation.x = -0.5; }
    else { bg.rotation.x = -s; bd.rotation.x = s; }
    if (P.sac) P.sac.visible = !!o.sac && !assis;
    const halo = !!(o.or && !o.pris && o.attend);
    if (P.halo) { P.halo.visible = halo; if (halo) P.halo.scale.set(54 + Math.sin(t * 3) * 4, 70 + Math.sin(t * 3) * 5, 1); }
    if (P.etincelles) { P.etincelles.visible = halo; P.etincelles.rotation.y = t * 2; P.etincelles.position.y = Math.sin(t * 1.3) * 3; }
    if (P.plateau) P.plateau.visible = !!o.plateau;
    if (P.produit) { const i = o.plateau && o.produit != null ? o.produit : -1; P.produit.visible = i >= 0; if (i >= 0 && P.produit.userData.i !== i) { P.produit.userData.i = i; P.produit.geometry = geoPatisserie(i); } }
    if (P.cle) { P.cle.visible = !!o.cle; if (o.cle) P.cle.rotation.z = Math.sin(t * 20) * 0.5; }
    visage(P, o.blink > 3.25 ? 3 : EXPR[o.expression] || 0);
  }
  function animerBoulanger(g, o) {
    const P = g.userData.parts, t = o.t || 0, hop = o.hop || 0, bg = P.bras[0], bd = P.bras[1];
    P.haut.scale.y = 1 + Math.sin(t * 1.6) * 0.012; P.racine.position.y = hop * 4 / CY;
    bg.rotation.z = -(0.25 + hop * 2); bd.rotation.z = 0.25 + hop * 2; bg.rotation.x = bd.rotation.x = -0.25 - hop * 0.4;
    if (P.sueur) P.sueur.visible = !!o.rush;
    visage(P, o.blink > 3.25 ? 3 : 1);
  }
  // ─── les huit pâtisseries : une géométrie fusionnée en cache par produit, posée sur y = 0, ~16 d'envergure ───
  const geoPatisserie = (i) => memo('pat|' + i, () => {
    const p = [], ax = 0.5;
    switch (i) {
      case 0: p.push(M.part(M.capsule(3, 10, 10), '#E8B46A', { y: 3, rz: HP, ry: ax })); for (const u of [-4, 0, 4]) p.push(M.part(M.boiteSimple(1.1, 1, 3.8), '#A8621F', { x: u * Math.cos(ax), y: 5.3, z: -u * Math.sin(ax), ry: ax + 0.7 })); break; // baguette couchée, trois grignes
      case 1: [1.6, 2.3, 2.8, 3.1, 2.8, 2.3, 1.6].forEach((r, k) => { const a = -1.75 + k * (3.5 / 6); p.push(M.part(M.sphere(r, 8), k % 2 ? '#E0983E' : '#E8A54A', { x: Math.sin(a) * 5.4, y: r, z: Math.cos(a) * 5.4 - 2 })); }); break; // croissant : un chapelet de boules sur un arc
      case 2: p.push(M.part(M.boite(14, 6.4, 9.5, 2.4), '#EBB15A'), M.part(M.boiteSimple(2, 3.6, 10.2), '#5B3A29', { x: -3.4, y: 1.3 }), M.part(M.boiteSimple(2, 3.6, 10.2), '#5B3A29', { x: 3.4, y: 1.3 })); break;
      case 3: p.push(M.part(M.cylindre(7.4, 6.6, 3, 14), '#E9A95C'), M.part(M.tore(6.6, 1.1, TAU, 6, 14), '#E9A95C', { y: 3, rx: HP }), M.part(M.cylindre(6.3, 6.3, 1, 14), '#F7C96B', { y: 2.6 })); for (let k = 0; k < 6; k++) p.push(M.part(M.sphere(1.3, 6), '#E85A4F', { x: Math.cos(k * TAU / 6) * 3.8, y: 4.4, z: Math.sin(k * TAU / 6) * 3.8 })); p.push(M.part(M.sphere(1.3, 6), '#E85A4F', { y: 4.5 })); break;
      case 4: p.push(M.part(M.capsule(2.8, 9, 10), '#F1C27A', { y: 2.8, rz: HP }), M.part(M.capsule(2.5, 8.6, 10), '#8B5A3C', { y: 4.7, rz: HP, sx: 0.5 })); break;
      case 5: for (const [x, z, c1, c2] of [[-3.8, 2.2, '#C9A3F5', '#E7D4FF'], [3.9, -2.4, '#F79AB5', '#FFE1EA']]) p.push(M.part(M.cylindre(4, 4.6, 2, 12), c1, { x, z }), M.part(M.cylindre(4, 4, 1.4, 12), c2, { x, y: 2, z }), M.part(M.cylindre(4.6, 4, 2, 12), c1, { x, y: 3.4, z })); break;
      case 6: [0, 3.9, 7.8].forEach((y, k) => p.push(M.part(M.boite(13, 1.7, 8.5, 0.5), k === 2 ? BLANC : '#F1C27A', { y }))); for (const y of [1.6, 5.5]) p.push(M.part(M.boiteSimple(12.4, 2.4, 7.9), '#FFF3C4', { y })); break;
      default: p.push(M.part(M.cylindre(7.8, 8.2, 1.6, 14), '#F7C96B')); for (let k = 0; k < 6; k++) p.push(M.part(M.sphere(2.3, 8), k % 2 ? '#C7B8FF' : '#FFE1EA', { x: Math.cos(k * TAU / 6) * 5.2, y: 3.7, z: Math.sin(k * TAU / 6) * 5.2 })); for (let k = 0; k < 3; k++) p.push(M.part(M.sphere(2.1, 8), k % 2 ? '#FFE1EA' : '#C7B8FF', { x: Math.cos(k * TAU / 3 + 0.5) * 2.6, y: 7.2, z: Math.sin(k * TAU / 3 + 0.5) * 2.6 })); p.push(M.part(M.sphere(2, 8), '#FFE1EA', { y: 10.4 }), M.part(M.sphere(1, 6), '#E85A4F', { y: 12.6 }));
    }
    return M.assembler(p);
  });
  function patisserie(i) { const m = M.mesh(geoPatisserie(i), M.MAT.vertex); m.userData.i = i; return m; }
  // ─── l'atelier : une situation posée au milieu du sol, animée par userData.anime ; zoom pour voir les détails ───
  function demo(nom, ctx, zoom) {
    const g = new THREE.Group(), base = { haut: '#FF9FB2', peau: '#FFD7B5', cheveux: '#4A3328', coiffure: 1, bonnet: '#9BD0FF', sacCol: '#F2D7B6' }, o = { dir: 0, expression: 'sourire', blink: 0, t: 0 };
    let p = null, anim = animer, dir = 0;
    const client = (x, extra) => { const c = creer(Object.assign({}, base, extra)); c.position.x = x; g.add(c); return c; };
    switch (nom) {
      case 'client-0': case 'client-1': case 'client-2': case 'client-3': p = client(0, { coiffure: +nom.slice(-1) }); break;
      case 'lunettes': p = client(0, { lunettes: true, haut: '#8FE3C2' }); o.expression = 'neutre'; break;
      case 'surpris': p = client(0, { coiffure: 2 }); o.expression = 'surpris'; break;
      case 'sac': p = client(0, { sac: true, coiffure: 0 }); o.sac = true; break;
      case 'mystere': p = client(0, { haut: OR, peau: '#F1B990', cheveux: '#E0A61E', coiffure: 0, or: true }); o.or = true; o.attend = true; break;
      case 'apprenti': p = client(0, { haut: '#5FD3A4', coiffure: 0, toque: true, tablier: true, plateau: true, produit: 1 }); o.plateau = true; o.produit = 1; break;
      case 'panne': p = client(0, { haut: '#B8A6FF', coiffure: 0, toque: true, tablier: true, plateau: true, cle: true }); o.cle = true; o.expression = 'surpris'; break;
      case 'mariniere': p = client(0, { haut: '#FFFFFF', mariniere: true, coiffure: 2 }); break;
      case 'assis': p = client(0, {}); o.assis = true; dir = 1; g.add(M.mesh(M.boiteSimple(18, 16, 16), M.mat(ctx && ctx.Q ? ctx.Q.bois : '#C8864F'), { y: 0, z: -3 }), M.mesh(M.boiteSimple(18, 22, 3), M.mat(ctx && ctx.Q ? ctx.Q.bois : '#C8864F'), { y: 14, z: -10 })); g.children.forEach((c) => { c.rotation.y = lacet(dir); }); break;
      case 'client-marche': p = client(0, { coiffure: 0, sac: true }); o.marche = true; o.phase = 1.2; o.sac = true; dir = 1; break;
      case 'dos': p = client(0, {}); dir = 2; break;
      case 'profil': p = client(0, { lunettes: true }); dir = -1; break;
      case 'patisseries': for (let i = 0; i < 8; i++) { const m = patisserie(i); m.position.set(60 + 40 * i, 0, 400); m.scale.setScalar(2); g.add(m); } return g;
      case 'tous': { const cl = [client(-150, { coiffure: 0, haut: '#8FE3C2' }), client(-100, { coiffure: 1, lunettes: true, haut: '#C7B8FF' }), client(-50, { coiffure: 2, haut: '#FFD98A', peau: '#C68B59' }), client(0, { coiffure: 3, haut: '#9BD0FF', peau: '#8D5A3C' }), client(50, { haut: OR, cheveux: '#E0A61E', coiffure: 0, or: true }), client(100, { haut: '#5FD3A4', coiffure: 0, toque: true, tablier: true, plateau: true, produit: 3 }), client(150, { haut: '#FFB48A', coiffure: 1, sac: true })]; const b = boulanger(5); b.position.set(-60, 0, -90); g.add(b); g.userData.anime = (E) => { cl.forEach((c, k) => animer(c, { dir: 0, marche: k === 6, phase: E.t * 9, sac: k === 6, or: k === 4, attend: true, plateau: k === 5, produit: 3, t: E.t, blink: E.t % 3.4, expression: ['sourire', 'neutre', 'surpris'][k % 3] })); animerBoulanger(b, { hop: 0, rush: true, t: E.t, blink: 0, rang: 5 }); }; g.position.set(195, 0, 330); return g; }
      default: if (nom.startsWith('boulanger-')) { p = boulanger(+nom.slice(10)); g.add(p); anim = animerBoulanger; o.rang = +nom.slice(10); o.rush = o.rang === 3; o.hop = o.rang === 1 ? 0.6 : 0; } else p = client(0, {});
    }
    p.rotation.y = lacet(dir); g.position.set(195, 0, 350); if (zoom) g.scale.setScalar(zoom);
    g.userData.anime = (E) => { o.t = E.t; o.blink = E.t % 3.4; if (o.marche) o.phase = 1.2 + (E.t - 0.4) * 9; anim(p, o); };
    return g;
  }
  return { HAUTEUR, TAILLE_PATISSERIE, creer, animer, lacet, boulanger, animerBoulanger, patisserie, geoPatisserie, demo };
})();
if (typeof module !== 'undefined') module.exports = PERSOS;
