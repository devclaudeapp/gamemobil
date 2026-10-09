/* LE FOURNIL — les personnages et les pâtisseries en 3D : clients, apprentis (et leurs grades), boulanger, le chat, les pâtisseries
   de la carte et de saison, en volumes low-poly arrondis pastel.
   Un personnage = un Group (pieds à y = 0, le visage vers +Z) : deux jambes qui balancent, un buste fusionné (vêtement, tablier,
   marinière), une tête fusionnée (peau, coiffure, toque, chapeau), un visage en décalque (atlas d'expressions sur une calotte
   transparente), deux bras, et les accessoires (sac, plateau + pâtisserie fusionnés, clé, halo). Aucune échelle n'est appliquée :
   les cotes sont exprimées directement en unités monde, les proportions du dessin 2D y sont intégrées (73 de haut ≈ 45 px à
   l'écran en plongée 52°, tête r = 10, corps 22 de large). Budget : ≤ 8 appels de dessin par personnage (7 de base + 1 accessoire),
   à tous les grades d'apprenti ; le chat de la boutique : 5 ; une pâtisserie, de la carte ou de saison : 1. */
const PERSOS = typeof THREE === 'undefined' ? null : (() => { // sans Three.js (fichier non chargé), le module vaut null et le jeu démarre sans 3D
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
  const etoile = (R, r, d) => memo(`et|${R}|${r}|${d}`, () => { // une étoile à cinq branches extrudée, centrée, face à +Z, une pointe en haut
    const s = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = HP + k * Math.PI / 5, rr = k % 2 ? r : R; if (k) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1, curveSegments: 1 }); g.center(); g.computeVertexNormals(); return g;
  });
  // l'étoile du grade 3 : posée sur la calotte haute du buste (sphère r = 11 centrée à y = 42), à 0,84 rad du pôle et 0,5 rad vers la
  // gauche du personnage (+X), juste au-dessus de la bavette et sous le menton en plongée ; tournée (rx, ry) pour épouser la normale
  const ETOILE = (() => { const th = 0.84, ps = 0.5, R = 11.4, nx = Math.sin(th) * Math.sin(ps), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ps), ry = Math.asin(nx); return { x: nx * R, y: 42 + ny * R, z: nz * R, ry, rx: -Math.asin(ny / Math.cos(ry)) }; })();
  // ─── le visage : un atlas peint une fois (8 cases : neutre, sourire, surpris, yeux fermés × sans / avec lunettes) ───
  // Le décalque n'est pas un PlaneGeometry mais une CALOTTE SPHÉRIQUE (SphereGeometry partielle à r = 10,35, juste au-dessus de la
  // peau) : collé à la tête, le visage reste lisible à tous les lacets (profil, trois quarts) sans flotter devant elle. Chaque case
  // de l'atlas est projetée sur la calotte via (asin x/R, acos y/R), si bien qu'un trait peint à (x, y) « autour de la tête » se retrouve
  // au bon endroit sur la sphère ; l'expression se choisit en échangeant la géométrie (8 cases pré-chauffées, uv décalés).
  const RV = 10.35, PHI = 2.4, THL = 1.8, TH0 = 0.7, NCEL = 8, CW = 128, CH = 96; // la calotte du visage : rayon, étendue angulaire, et la taille des cases
  let matVisage = null, texHalo = null;
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
  const VISAGES = []; // les 8 cases déjà construites : visage() les reprend ici sans recomposer la clé du cache (une chaîne allouée à chaque clignement)
  const geoVisage = (k) => VISAGES[k] || (VISAGES[k] = memo('visage|' + k, () => { const g = new THREE.SphereGeometry(RV, 10, 8, HP - PHI / 2, PHI, TH0, THL), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / NCEL); return g; }));
  function haloMat() { // un dégradé radial doré pour le client mystère : la TEXTURE est partagée (jamais libérée), le SpriteMaterial est propre à chaque personnage (MODELES.dispose le libère sans toucher aux autres) ; en Node, le halo carré de MODELES
    if (typeof document === 'undefined') return M.MAT.halo;
    if (!texHalo) { texHalo = M.texture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64); texHalo.userData.partagee = true; }
    return new THREE.SpriteMaterial({ map: texHalo, color: OR, transparent: true, opacity: 0.6, depthWrite: false });
  }
  // ─── un personnage : jambes, buste, tête, visage, bras, accessoires ───
  // Hiérarchie : g (lacet par la scène) > racine (échelle ×1,25 du patron, saut) > jambes ; racine > haut (rebond, respiration, assise) >
  // corps, tête, visage, bras, accessoires. userData.parts = { racine, haut, jambes[2], corps, tete, visage, bras[2], sac?, plateau?, cle?,
  // halo?, sueur? } : toque et chapeau sont FUSIONNÉS dans tete, la pâtisserie dans plateau (un seul maillage, le produit est fixé à la
  // création : la scène ne le change jamais). Appels de dessin : 7 de base (2 jambes, corps, tête, visage, 2 bras) + 1 accessoire visible
  // à la fois (sac OU halo OU plateau OU clé ; sueur pour le patron) = 8 au plus. L'option `taille` est volontairement ignorée : la
  // scène applique elle-même scale = K × taille au groupe (l'appliquer ici doublerait l'échelle).
  // Grades d'un apprenti (toque + tablier ; o.grade de 1 à 5, 1 par défaut, ignoré pour les autres) : 2 = une bande o.haut assombri
  // de 25 % qui borde le haut du tablier, rappelée en ourlet au bas (le plateau cache le milieu), 3 = + une étoile dorée sur la poitrine, 4 = + toque plus haute de 6, 5 = toque plus haute de 10 et
  // liseré doré au tablier et à la toque. Tout est fusionné dans le buste ou la tête : le nombre d'appels de dessin ne change pas.
  function construire(o) {
    const peau = o.peau || '#FFD7B5', haut = o.or ? OR : o.haut || '#FF9FB2', chev = o.cheveux || L, large = o.tablier === 'large', phiT = large ? 1.9 : 1.3;
    const grade = o.toque && o.tablier ? Math.max(1, Math.min(5, Math.round(+o.grade || 1))) : 1, lisere = o.lisere || grade >= 5;
    const g = new THREE.Group(), racine = new THREE.Group(), ht = new THREE.Group(), P = { racine, haut: ht, bras: [], jambes: [] };
    g.add(racine); racine.add(ht); g.userData.parts = P; g.userData.options = o;
    // les jambes pendent du bassin (pivot y = 17,5) et remontent jusqu'à 22,5 dans le buste : au sommet du rebond de marche (haut monte de 3,25) elles restent jointes au corps
    for (const sx of [-1, 1]) { const j = M.mesh(pendu(3, 16.5, 2), M.mat(L), { x: sx * 4.5, y: 17.5 }); P.jambes.push(j); racine.add(j); }
    // le buste : une capsule, rayures de marinière, tablier qui épouse le corps, col et foulard du patron
    const corps = [M.part(M.capsule(11, 12, 12), haut, { y: 36 })];
    if (o.mariniere) for (const y of [31.5, 36, 40.5, 44.8]) corps.push(M.part(bande(11.4, 2.2), '#3A86C8', { y }));
    if (o.tablier) {
      corps.push(M.part(patchS(11.7, phiT, 1.05, HP - 1.05), BLANC, { y: 42 }), M.part(patchC(11.7, 12, phiT), BLANC, { y: 36 }), M.part(patchS(11.7, phiT, HP, 0.95), BLANC, { y: 30 }));
      if (lisere) corps.push(M.part(patchS(12, phiT, HP + 0.4, 0.28), OR, { y: 30 }));
      if (grade >= 2) { const fonce = M.assombrir(haut, 0.25); corps.push(M.part(patchS(11.9, phiT, 1.05, 0.15), fonce, { y: 42 })); if (!lisere) corps.push(M.part(patchS(11.9, phiT, HP + 0.42, 0.28), fonce, { y: 30 })); } // un biais qui borde le haut de la bavette (le blanc reste visible dessous), et son rappel en ourlet au bas du tablier, là où le plateau ne cache rien (au grade 5, le liseré doré prend sa place)
      if (grade >= 3) corps.push(M.part(etoile(2.7, 1.15, 0.9), OR, ETOILE)); // l'étoile, couchée sur la poitrine gauche, au-dessus de la bavette
    }
    if (o.col) corps.push(M.part(patchC(12, 5, 2.3), '#2B5BD7', { y: 45.5, ry: -1.45 }), M.part(patchC(12, 5, 0.6), BLANC, { y: 45.5 }), M.part(patchC(12, 5, 2.3), ROUGE, { y: 45.5, ry: 1.45 }), M.part(patchC(12, 5, 0.6), BLANC, { y: 45.5, ry: Math.PI }));
    if (o.foulard) corps.push(M.part(M.tore(9.2, 2.4, TAU, 8, 16), ROUGE, { y: 51, rx: HP }), M.part(M.sphere(2.6, 8), ROUGE, { y: 49, z: 9.6 }), M.part(M.capsule(1.3, 3, 6), ROUGE, { x: -1.7, y: 46.3, z: 11.2, rz: 0.35 }), M.part(M.capsule(1.3, 3, 6), ROUGE, { x: 1.9, y: 46.6, z: 11, rz: -0.3 })); // deux pans courts qui pendent du nœud, à plat sur le tablier
    P.corps = M.maille(corps); ht.add(P.corps);
    // la tête : peau, cou, coiffure (calotte, mèches, chignon, bonnet), toque, haut-de-forme, moustache
    const tete = [M.part(M.sphere(10, 14), peau), M.part(M.cylindre(3.6, 3.6, 8, 8), peau, { y: -14 })];
    if (!o.toque) tete.push(M.part(calotte(10.7, 1.5), chev, { rx: -0.78 }));
    if (o.coiffure === 1 && !o.toque) tete.push(M.part(M.capsule(2.3, 7, 6), chev, { x: -9.8, z: -1.5, rz: -0.12 }), M.part(M.capsule(2.3, 7, 6), chev, { x: 9.8, z: -1.5, rz: 0.12 }));
    if (o.coiffure === 2 && !o.toque) tete.push(M.part(M.sphere(4.2, 8), chev, { y: 10.5, z: -4 }));
    if (o.coiffure === 3 && !o.toque) tete.push(M.part(bande(10, 4.2), o.bonnet || '#9BD0FF', { y: 10 }), M.part(calotte(10.2, HP, 14), o.bonnet || '#9BD0FF', { y: 12 }), M.part(M.sphere(3, 8), BLANC, { y: 22.7 }));
    if (o.toque) { const th = (typeof o.toque === 'number' ? o.toque : 14) + (grade >= 5 ? 10 : grade >= 4 ? 6 : 0), hc = Math.max(1, th - 8); tete.push(M.part(M.cylindre(9.2, 9.2, 4, 14), BLANC, { y: 8 }), M.part(M.cylindre(8, 8.8, hc, 14), BLANC, { y: 12 }), M.part(calotte(8, HP, 14), BLANC, { y: 12 + hc })); if (lisere) tete.push(M.part(bande(9.5, 1.4), OR, { y: 8.6 })); }
    if (o.or) tete.push(M.part(M.cylindre(11.8, 11.8, 1.6, 16), L, { y: 9.6 }), M.part(M.cylindre(7.4, 7.2, 15, 14), L, { y: 10 }), M.part(bande(7.7, 2.2), OR, { y: 13 }));
    if (o.moustache) tete.push(M.part(M.capsule(1.3, 3.2, 6), '#8C5A3C', { x: -2.6, y: 2.4, z: 10.1, rz: 1.05 }), M.part(M.capsule(1.3, 3.2, 6), '#8C5A3C', { x: 2.6, y: 2.4, z: 10.1, rz: -1.05 }));
    P.tete = M.maille(tete); P.tete.position.y = 63; ht.add(P.tete);
    for (let k = 0; k < NCEL; k++) geoVisage(k); // pré-chauffe les 8 cases du visage : animer n'allouera jamais une géométrie à la volée
    P.visage = new THREE.Mesh(geoVisage(o.lunettes ? 4 : 0), visageMat()); P.visage.position.y = 63; P.visage.userData.k = o.lunettes ? 4 : 0; ht.add(P.visage);
    for (const sx of [-1, 1]) { const b = M.mesh(pendu(2.6, 11, 0), M.mat(peau), { x: sx * 11.6, y: 46 }); b.rotation.z = sx * 0.1; P.bras.push(b); ht.add(b); }
    // les accessoires, cachés tant qu'animer ne les montre pas
    if (o.sac || o.sacCol) { P.sac = M.maille([M.part(M.boite(9, 13, 5, 1.2), o.sacCol || '#F2D7B6'), M.part(M.capsule(2.2, 5, 6), '#E8B46A', { y: 15.5, rz: -0.25 })]); P.sac.position.set(14.5, 22, 4); P.sac.visible = false; ht.add(P.sac); }
    if (o.plateau) { P.plateau = M.mesh(geoPlateau(o.produit == null ? 0 : o.produit), M.MAT.vertex, { y: 44, z: 16 }); P.plateau.visible = false; ht.add(P.plateau); } // plateau + pâtisserie en un seul maillage
    if (o.cle) { P.cle = M.maille([M.part(M.boiteSimple(3, 14, 2.2), GRIS, { y: -5 }), M.part(M.cylindre(3.6, 3.6, 2.2, 10), GRIS, { y: 9.5, rx: HP }), M.part(M.boiteSimple(2.2, 3, 2.6), L, { y: 11 })]); P.cle.position.set(13, 39, 11); P.cle.visible = false; ht.add(P.cle); }
    // le halo du mystère : un sprite dressé derrière le corps (il reproduit l'ellipse dorée du 2D plutôt qu'un disque au sol, plus
    // lisible en plongée) ; 54 de large pour un client de 34, il déborde un peu sur les voisins de la file mais passe derrière eux
    // grâce au test de profondeur. Les étincelles sont dessinées par le calque 2D de scene.js, pas ici (pas de doublon).
    if (o.or) { P.halo = new THREE.Sprite(haloMat()); P.halo.position.set(0, 36, -8); P.halo.scale.set(54, 70, 1); P.halo.visible = false; ht.add(P.halo); }
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
  // DÉPENDANCE DE VERSION (Three r158) : on écrit les champs privés d'Euler (_x, _y, _z) sans passer par le setter, puis tourner()
  // recale le quaternion comme le ferait Euler._onChangeCallback. Si une mise à jour de Three renomme ces champs ou change ce rappel,
  // revenir aux setters (rotation.x = …) et re-mesurer les allocations d'animerChat.
  const tourner = (o3) => o3.quaternion.setFromEuler(o3.rotation, false);
  const CUISSE_ASSIS = -HP + 0.08; // assis : la cuisse d'un client, presque horizontale
  // ─── l'animation, sans aucune allocation : poses, visibilités, expression ───
  function visage(P, k) { k = (P.visage.userData.k & 4) | k; if (P.visage.userData.k !== k) { P.visage.userData.k = k; P.visage.geometry = geoVisage(k); } }
  const lacet = (dir) => (dir === 1 ? HP : dir === -1 ? -HP : dir === 2 ? Math.PI : 0);
  // les angles CALCULÉS s'écrivent dans les champs d'Euler (_x, _z) suivis de tourner() (voir animerChat) : passés au setter rotation.x
  // depuis un appel polymorphe (clients et apprentis mêlés), V8 les mettrait en boîte à chaque image
  function animer(g, o) {
    const P = g.userData.parts, marche = !!o.marche, assis = !!o.assis, ph = o.phase || 0, t = o.t || 0, s = marche ? Math.sin(ph) * 0.5 : 0;
    const bg = P.bras[0], bd = P.bras[1], jg = P.jambes[0], jd = P.jambes[1];
    P.haut.position.y = assis ? -3 : marche ? Math.abs(Math.sin(ph)) * 2 / CY : 0;
    jg.position.y = jd.position.y = assis ? 19 : 17.5; // assis : les cuisses horizontales (r = 3) reposent exactement sur l'assise à y = 16
    jg.rotation._x = assis ? CUISSE_ASSIS : s; jd.rotation._x = assis ? CUISSE_ASSIS : -s; tourner(jg); tourner(jd);
    bg.rotation._z = -0.1; bd.rotation._z = 0.1;
    if (o.plateau) { bg.rotation._x = bd.rotation._x = -1.45; }
    else if (o.cle) { bd.rotation._x = -1.0; bd.rotation._z = 0.25; bg.rotation._x = s; }
    else if (assis) { bg.rotation._x = bd.rotation._x = -0.5; }
    else { bg.rotation._x = -s; bd.rotation._x = s; }
    tourner(bg); tourner(bd);
    if (P.sac) P.sac.visible = !!o.sac && !assis;
    const halo = !!(o.or && !o.pris && o.attend);
    if (P.halo) { P.halo.visible = halo; if (halo) { const k = Math.sin(t * 3); P.halo.scale.x = 54 + k * 4; P.halo.scale.y = 70 + k * 5; } }
    if (P.plateau) P.plateau.visible = !!o.plateau; // la pâtisserie est fusionnée au plateau (o.produit est fixé à la création)
    if (P.cle) { P.cle.visible = !!o.cle; if (o.cle) { P.cle.rotation._z = Math.sin(t * 20) * 0.5; tourner(P.cle); } }
    visage(P, o.blink > 3.25 ? 3 : EXPR[o.expression] || 0);
  }
  function animerBoulanger(g, o) {
    const P = g.userData.parts, t = o.t || 0, hop = o.hop || 0, bg = P.bras[0], bd = P.bras[1];
    P.haut.scale.y = 1 + Math.sin(t * 1.6) * 0.012; P.racine.position.y = hop * 4 / CY;
    bg.rotation._z = -(0.25 + hop * 2); bd.rotation._z = 0.25 + hop * 2; bg.rotation._x = bd.rotation._x = -0.25 - hop * 0.4; tourner(bg); tourner(bd);
    if (P.sueur) P.sueur.visible = !!o.rush;
    visage(P, o.blink > 3.25 ? 3 : 1);
  }
  // ─── le chat de la boutique : un roux tigré, même grammaire que les personnages (volumes ronds, couleurs plates, petits yeux) ───
  // Hiérarchie : g (lacet et position par la scène, pieds à y = 0, museau vers +Z) > racine (hauteur, inclinaison du saut) > corps
  // (capsule couchée selon Z : 25 de long, rayures, ventre et poitrail crème fusionnés), tete (sphère, museau, nez, oreilles, joues,
  // yeux, rayures du front fusionnés ; deux géométries en cache, yeux ouverts / fermés, échangées par animerChat), queue[0] > queue[1]
  // (deux segments qui se plient : chacun pivote à sa base, le second au bout du premier), pattes[4] (pivots Object3D : avant x < 0,
  // avant x > 0, arrière x < 0, arrière x > 0) et pattesMaille (UN InstancedMesh pour les quatre pattes, ses matrices recopiées des
  // pivots par animerChat ; son matériau et son matériau d'ombre lui sont propres, ses bornes figées, il n'est jamais écarté par le
  // frustum). Appels de dessin : corps, tête, 2 segments de queue, pattes = 5 (budget 6). Options : couleur (robe, défaut #F2A65A ; les
  // yeux prennent une pastille crème sur une robe sombre), rayures, ventre, etat. Libération : retirer le chat directement de son
  // parent (scene.remove), ou appeler PERSOS.libererChat(chat) s'il part avec un groupe.
  const CHAT_Y = 11, LP = 8, PATTE_X = 2.9, PATTE_Y = -3, PATTE_Z = 7.2, LQ1 = 6.6, ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let matPattes = null, profPattes = null, BORNES_PATTES = null; // créés au premier chat, partagés par tous les suivants
  const arcCyl = (r, h, phi, c) => memo(`arc|${r}|${h}|${phi}|${c}`, () => new THREE.CylinderGeometry(r, r, h, 12, 1, true, c - phi / 2, phi)); // un morceau de cylindre centré, ouvert, autour de l'angle c (0 = +Z)
  const geoCorpsChat = (robe, ray, creme) => memo(`chat-corps|${robe}|${ray}|${creme}`, () => {
    const p = [M.part(M.capsule(5.5, 14, 12), robe, { rx: HP }), M.part(arcCyl(5.62, 14, 1.9, 0), creme, { rx: HP }), M.part(patchS(5.7, 2.0, 1.35, 1.45), creme, { z: 7 })]; // couché selon Z (l'angle 0 du cylindre passe dessous), ventre, poitrail
    for (const z of [-5.2, -1.8, 1.6]) p.push(M.part(arcCyl(5.74, 1.5, 2.3, Math.PI), ray, { z, rx: HP })); // trois rayures en travers du dos
    return M.assembler(p);
  });
  const OREILLE = [2.55, 3.05, -0.45, -0.3, 0.12, 0.65, 0.94]; // x, y, z de la base, inclinaison vers l'arrière, vers l'extérieur, aplatissement, avancée du creux rose
  const sombre = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.16; }; // une robe trop foncée pour des yeux #4A3328 (luminance linéaire)
  const geoTeteChat = (robe, ray, creme, fermes) => memo(`chat-tete|${robe}|${ray}|${creme}|${fermes ? 1 : 0}`, () => {
    const p = [M.part(M.sphere(5.2, 14), robe, { sx: 1.12, sy: 0.96 }), M.part(M.sphere(2.3, 10), creme, { y: -1.6, z: 4.1, sx: 1.45, sy: 0.85, sz: 0.85 }), M.part(M.sphere(0.75, 8), '#F28B9B', { y: -0.75, z: 5.95, sx: 1.25, sy: 0.8, sz: 0.8 })], fonce = sombre(robe);
    for (const sx of [-1, 1]) {
      // les oreilles, des cônes aplatis (des triangles de face, pas un octogone vu d'en haut) presque droits et un peu couchés vers
      // l'arrière : sous la plongée de 52°, l'axe d'une oreille penchée vers l'extérieur viserait la caméra quand le chat est de profil
      // et l'oreille proche s'écraserait en ovale sur la joue ; leur creux rose est posé à plat sur la face avant (même repère)
      const mo = M.matrice({ x: sx * OREILLE[0], y: OREILLE[1], z: OREILLE[2], rx: OREILLE[3], rz: -sx * OREILLE[4] });
      p.push({ geo: M.cone(2.2, 4.8, 8), col: robe, m: mo.clone().multiply(M.matrice({ sz: OREILLE[5] })) }, { geo: M.cone(1.35, 3.4, 8), col: '#FFC1B4', m: mo.clone().multiply(M.matrice({ y: 0.38, z: OREILLE[6], rx: -0.155, sz: 0.34 })) });
      p.push(M.part(M.sphere(0.95, 8), JOUE, { x: sx * 3.6, y: -0.9, z: 3.7, sy: 0.7, sz: 0.5 }));
      if (fonce && !fermes) p.push(M.part(M.sphere(1.3, 8), creme, { x: sx * 2.1, y: 0.8, z: 4.45, sy: 1.1, sz: 0.5 })); // sur une robe sombre : une pastille crème derrière chaque œil
      p.push(fermes ? M.part(M.tore(0.95, 0.3, Math.PI, 4, 8), fonce ? creme : L, { x: sx * 2.1, y: 0.6, z: 4.8 }) : M.part(M.sphere(0.9, 8), L, { x: sx * 2.1, y: 0.9, z: 4.5 })); // les yeux : deux billes sombres, ou deux arcs fermés (crème sur une robe sombre)
    }
    for (const [x, l] of [[-1.3, 1.1], [0, 1.6], [1.3, 1.1]]) p.push(M.part(M.capsule(0.42, l, 6), ray, { x, y: 4.45, z: 2.2, rx: -1.13 })); // le « M » du front
    return M.assembler(p);
  });
  const geoQueueChat = (k, robe, ray) => memo(`chat-queue|${k}|${robe}|${ray}`, () => M.assembler(k === 1
    ? [M.part(M.capsule(1.45, 6.4, 8), robe, { y: 3.2 }), M.part(bande(1.6, 0.9), ray, { y: 2.6 }), M.part(bande(1.6, 0.9), ray, { y: 5.3 })] // de la base (pivot) vers +Y
    : [M.part(M.capsule(1.35, 5.8, 8), robe, { y: 2.9 }), M.part(bande(1.5, 0.8), ray, { y: 1.7 }), M.part(bande(1.5, 0.8), ray, { y: 4 }), M.part(calotte(1.45, 1.05, 10), ray, { y: 5.8 })]));
  const geoPatteChat = (robe, creme) => memo(`chat-patte|${robe}|${creme}`, () => M.assembler([M.part(pendu(1.75, LP - 2, 0.2), robe), M.part(M.sphere(1.95, 8), creme, { y: 1.15 - LP, z: 0.45, sy: 0.6, sz: 1.2 })])); // pend de la hanche (pivot) jusqu'au sol, LP plus bas
  function chat(o) {
    o = o || {};
    const robe = o.couleur || '#F2A65A', ray = o.rayures || (o.couleur ? M.assombrir(robe, 0.15) : '#D9853B'), creme = o.ventre || '#FFE3C9';
    const g = new THREE.Group(), racine = new THREE.Group(), P = { racine, queue: [], pattes: [] };
    g.add(racine); g.userData.parts = P; g.userData.options = o;
    P.corps = M.mesh(geoCorpsChat(robe, ray, creme), M.MAT.vertex); racine.add(P.corps);
    const geos = [geoTeteChat(robe, ray, creme, false), geoTeteChat(robe, ray, creme, true)];
    P.tete = M.mesh(geos[0], M.MAT.vertex); P.tete.userData.geos = geos; racine.add(P.tete);
    const q1 = M.mesh(geoQueueChat(1, robe, ray), M.MAT.vertex), q2 = M.mesh(geoQueueChat(2, robe, ray), M.MAT.vertex); q1.add(q2); racine.add(q1); P.queue.push(q1, q2);
    for (let k = 0; k < 4; k++) { const p = new THREE.Object3D(); P.pattes.push(p); racine.add(p); }
    // le seul InstancedMesh du jeu : son matériau et son matériau d'ombre lui sont PROPRES (partagés par tous les chats). Avec MAT.vertex
    // ou le matériau de profondeur commun de WebGLShadowMap, Three r158 recompilerait la clé du programme à chaque bascule
    // instancié / non instancié (WebGLRenderer.setProgram : isInstancedMesh && !instancing → needsProgramChange), donc à chaque image.
    matPattes = matPattes || M.partager(new THREE.MeshLambertMaterial({ vertexColors: true }));
    profPattes = profPattes || M.partager(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    const im = P.pattesMaille = new THREE.InstancedMesh(geoPatteChat(robe, creme), matPattes, 4);
    im.customDepthMaterial = profPattes; im.castShadow = true; im.frustumCulled = false; racine.add(im); // toujours dessiné : 4 instances, le chat est à l'écran
    // des bornes FIGÉES (l'union de toutes les poses, calculée une fois sur ce premier chat puis copiée) : animerChat ne les recalcule
    // jamais (ce serait des allocations à chaque image), et ni le rendu ni Box3.setFromObject n'ont à les créer
    if (!BORNES_PATTES) {
      const b = new THREE.Box3(), o2 = { etat: 'dort', phase: 0, t: 0 };
      for (const e of ['dort', 'assis', 'saut', 'debout', 'marche']) for (let k = 0; k < (e === 'marche' ? 16 : 1); k++) { o2.etat = e; o2.phase = k * TAU / 16; animerChat(g, o2); im.computeBoundingBox(); b.union(im.boundingBox); }
      BORNES_PATTES = { boite: b, sphere: b.getBoundingSphere(new THREE.Sphere()) };
    }
    im.boundingBox = BORNES_PATTES.boite.clone(); im.boundingSphere = BORNES_PATTES.sphere.clone();
    // le tampon des matrices côté GPU est libéré quand le chat est retiré DIRECTEMENT de son parent (il se recrée seul s'il revient) ;
    // s'il quitte la scène à l'intérieur d'un groupe, appeler PERSOS.libererChat(chat) (MODELES.dispose ne le fait pas)
    g.addEventListener('removed', () => im.dispose());
    animerChat(g, { etat: o.etat || 'assis', phase: 0, t: 0 });
    return g;
  }
  function libererChat(g) { const P = g && g.userData.parts; if (P && P.pattesMaille) P.pattesMaille.dispose(); if (g) M.dispose(g); } // le tampon d'instances, puis ce que MODELES.dispose libère d'ordinaire
  // les poses constantes : [x, y, z] puis [rx, ry, rz] de racine, corps, tête, queue[0] et queue[1] ; animerChat n'y ajoute que le mouvement
  const POSES_CHAT = {
    dort: [[0, 0, 0], [0, 0, 0], [0, 4.4, 0], [0, 0, 0], [-3.4, 4.9, 6.6], [0.3, 0.35, -0.35], [0, 1.45, -7.6], [-HP, 0, 1.85], [0, LQ1, 0], [0, 0, 1]],
    assis: [[0, 0, 0], [0, 0, 0], [0, 9.55, 0.6], [-1.05, 0, 0], [0, 21.6, 5.6], [-0.1, 0, 0], [1.2, 1.45, -6.4], [-HP, 0, -1.2], [0, LQ1, 0], [0, 0, -1.25]],
    saut: [[0, CHAT_Y, 0], [0.42, 0, 0], [0, 0, 0], [0, 0, 0], [0, 5, 12.5], [-0.3, 0, 0], [0, 2.6, -11.4], [-1.15, 0, 0], [0, LQ1, 0], [0.35, 0, 0]],
    marche: [[0, CHAT_Y, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 4.6, 12.7], [0, 0, 0], [0, 2.6, -11.4], [-0.45, 0, 0], [0, LQ1, 0], [0.45, 0, 0]],
  };
  // assis : les pattes avant partent sous le poitrail (y = 11,5) et s'allongent jusqu'au sol, les arrière couchées vers l'avant, épaissies en cuisses
  const PATTES_CHAT = [[-PATTE_X, PATTE_Y, PATTE_Z], [PATTE_X, PATTE_Y, PATTE_Z], [-PATTE_X, PATTE_Y, -PATTE_Z], [PATTE_X, PATTE_Y, -PATTE_Z]], PATTES_ASSIS = [[-2.4, 11.5, 5.4], [2.4, 11.5, 5.4], [-3.9, 2.9, -1.6], [3.9, 2.9, -1.6]], CUISSE = -HP + 0.1, ASSIS_SZ = 0.8;
  // animerChat(g, { etat, phase, t }) : etat 'dort' (roulé en boule, yeux fermés, respiration lente), 'assis' (la queue balaie le sol),
  // 'marche' (diagonales opposées selon phase, en rad, que la scène fait avancer), 'saut' (incliné nez en bas, pattes repliées, pour
  // descendre du comptoir), toute autre valeur : debout immobile. Aucune allocation, même pas de nombre emballé par V8 : les poses
  // viennent de tables constantes (fromArray), le mouvement s'écrit dans les champs (position.y, scale.y, rotation._x/_y/_z suivi de
  // tourner(o3) qui recale le quaternion ; un angle calculé passé au setter rotation.x ou en argument serait mis en boîte à chaque
  // appel), la tête échange deux géométries en cache et les matrices des pattes sont recopiées dans le tampon de l'InstancedMesh, dont
  // les bornes (figées par chat()) ne sont jamais recalculées. Mesuré : 0 octet par appel en régime établi, objets ramassés compris.
  function animerChat(g, o) {
    const P = g.userData.parts, r = P.racine, c = P.corps, h = P.tete, q1 = P.queue[0], q2 = P.queue[1], pa = P.pattes, t = o.t || 0, e = o.etat, A = POSES_CHAT[e] || POSES_CHAT.marche;
    r.position.fromArray(A[0]); r.rotation.fromArray(A[1]); c.position.fromArray(A[2]); c.rotation.fromArray(A[3]); c.scale.set(1, 1, 1);
    h.position.fromArray(A[4]); h.rotation.fromArray(A[5]); q1.position.fromArray(A[6]); q1.rotation.fromArray(A[7]); q2.position.fromArray(A[8]); q2.rotation.fromArray(A[9]);
    for (let k = 0; k < 4; k++) { const p = pa[k]; p.position.fromArray(e === 'assis' ? PATTES_ASSIS[k] : PATTES_CHAT[k]); p.rotation.set(0, 0, 0); p.scale.set(1, 1, 1); p.visible = e !== 'dort'; }
    const geo = h.userData.geos[e === 'dort' ? 1 : 0]; if (h.geometry !== geo) h.geometry = geo;
    if (e === 'dort') { // le corps écrasé en boule (respiration : scale.y × (1 ± 0,03)), la tête posée à l'avant côté x < 0, la queue enroulée le long du même flanc jusqu'au museau
      const b = Math.sin(t * 1.5) * 0.03;
      c.scale.set(1.4, 0.8, 0.62); c.scale.y = 0.8 + 0.8 * b; h.position.y = 4.9 + b * 3; q2.rotation._z = 1 + Math.sin(t * 0.9) * 0.08; tourner(q2);
    } else if (e === 'assis') { // l'arrière-train au sol (le tronc raccourci et redressé : un chat assis, pas un sphinx), pattes avant droites, pieds arrière devant, la queue couchée qui balaie
      c.scale.z = ASSIS_SZ; pa[0].scale.y = pa[1].scale.y = 11.5 / LP; pa[2].scale.set(1.35, 0.75, 1); pa[3].scale.set(1.35, 0.75, 1); pa[2].rotation.x = pa[3].rotation.x = CUISSE;
      h.rotation._y = Math.sin(t * 0.7) * 0.12; tourner(h); q1.rotation._z = -1.2 + Math.sin(t * 1.4) * 0.18; tourner(q1); q2.rotation._z = -1.25 + Math.sin(t * 1.4 - 0.8) * 0.3; tourner(q2);
    } else if (e === 'saut') { // en l'air : nez en bas, pattes repliées sous le ventre, la queue haute pour l'équilibre
      for (let k = 0; k < 4; k++) { pa[k].rotation.x = k < 2 ? 1 : -1; pa[k].scale.y = 0.8; }
      q1.rotation._z = Math.sin(t * 5) * 0.1; tourner(q1);
    } else { // marche (ou debout) : diagonales opposées, le dos qui descend de 0,5 quand les pattes s'écartent (le bas des pieds reste à y = 0), la queue en point d'interrogation
      const ph = e === 'marche' ? o.phase || 0 : 0, s = e === 'marche' ? Math.sin(ph) * 0.6 : 0;
      r.position.y = CHAT_Y - 2.7 * (1 - Math.cos(s)); h.rotation._x = Math.sin(ph * 2) * 0.05; tourner(h);
      for (let k = 0; k < 4; k++) { pa[k].rotation._x = k === 0 || k === 3 ? s : -s; tourner(pa[k]); }
      q1.rotation._z = Math.sin(t * 2.6) * 0.22; tourner(q1); q2.rotation._z = Math.sin(t * 2.6 - 0.9) * 0.3; tourner(q2);
    }
    const im = P.pattesMaille;
    for (let k = 0; k < 4; k++) { const p = pa[k]; if (p.visible) { p.updateMatrix(); im.setMatrixAt(k, p.matrix); } else im.setMatrixAt(k, ZERO); } // une patte cachée : écrasée en un point
    im.instanceMatrix.needsUpdate = true; // les bornes restent figées (l'union de toutes les poses, posée par chat()) : rien à recalculer
  }
  // ─── les huit pâtisseries : une liste de parts colorées par produit (posée sur y = 0, centrée, ~16 d'envergure), fusionnée seule
  // (geoPatisserie, en cache) ou avec le plateau d'un apprenti (geoPlateau, en cache) — jamais passée telle quelle à M.assembler
  // depuis un autre maillage, les couleurs par sommet s'y perdraient ───
  function partsPatisserie(i) {
    if (typeof i === 'string') return partsSaison(i); // un id de saison ('citrouille'…) : le plateau d'un apprenti peut aussi en porter une
    const p = [], ax = 0.5;
    switch (i) {
      case 0: p.push(M.part(M.capsule(3, 10, 10), '#E8B46A', { y: 3, rz: HP, ry: ax })); for (const u of [-4, 0, 4]) p.push(M.part(M.boiteSimple(1.1, 1, 3.8), '#A8621F', { x: u * Math.cos(ax), y: 5.3, z: -u * Math.sin(ax), ry: ax + 0.7 })); break; // baguette couchée, trois grignes
      case 1: [1.6, 2.3, 2.8, 3.1, 2.8, 2.3, 1.6].forEach((r, k) => { const a = -1.75 + k * (3.5 / 6); p.push(M.part(M.sphere(r, 8), k % 2 ? '#E0983E' : '#E8A54A', { x: Math.sin(a) * 5.4, y: r, z: Math.cos(a) * 5.4 - 2 })); }); break; // croissant : un chapelet de boules sur un arc
      case 2: p.push(M.part(M.boite(14, 6.4, 9.5, 2.4), '#EBB15A'), M.part(M.boiteSimple(2, 3.6, 10.2), '#5B3A29', { x: -3.4, y: 3.2 }), M.part(M.boiteSimple(2, 3.6, 10.2), '#5B3A29', { x: 3.4, y: 3.2 })); break; // pain au chocolat : les deux barres affleurent le dessus (0,4 au-dessus), comme en 2D
      case 3: p.push(M.part(M.cylindre(7.4, 6.6, 3, 14), '#E9A95C'), M.part(M.tore(6.6, 1.1, TAU, 6, 14), '#E9A95C', { y: 3, rx: HP }), M.part(M.cylindre(6.3, 6.3, 1, 14), '#F7C96B', { y: 2.6 })); for (let k = 0; k < 6; k++) p.push(M.part(M.sphere(1.3, 6), '#E85A4F', { x: Math.cos(k * TAU / 6) * 3.8, y: 4.4, z: Math.sin(k * TAU / 6) * 3.8 })); p.push(M.part(M.sphere(1.3, 6), '#E85A4F', { y: 4.5 })); break;
      case 4: p.push(M.part(M.capsule(3, 10, 10), '#F1C27A', { y: 3, rz: HP }), M.part(M.capsule(2.7, 9.6, 10), '#8B5A3C', { y: 5, rz: HP, sx: 0.5 })); break; // éclair : 16 de long, 6 de large
      case 5: for (const [x, z, c1, c2] of [[-3.8, 2.2, '#C9A3F5', '#E7D4FF'], [3.9, -2.4, '#F79AB5', '#FFE1EA']]) p.push(M.part(M.cylindre(4, 4.6, 2, 12), c1, { x, z }), M.part(M.cylindre(4, 4, 1.4, 12), c2, { x, y: 2, z }), M.part(M.cylindre(4.6, 4, 2, 12), c1, { x, y: 3.4, z })); break;
      case 6: [0, 3.9, 7.8].forEach((y, k) => p.push(M.part(M.boite(13, 1.7, 8.5, 0.5), k === 2 ? BLANC : '#F1C27A', { y }))); for (const y of [1.6, 5.5]) p.push(M.part(M.boiteSimple(12.4, 2.4, 7.9), '#FFF3C4', { y })); break;
      default: p.push(M.part(M.cylindre(7.8, 8.2, 1.6, 14), '#F7C96B')); for (let k = 0; k < 6; k++) p.push(M.part(M.sphere(2.3, 8), k % 2 ? '#C7B8FF' : '#FFE1EA', { x: Math.cos(k * TAU / 6) * 5.2, y: 3.7, z: Math.sin(k * TAU / 6) * 5.2 })); for (let k = 0; k < 3; k++) p.push(M.part(M.sphere(2.1, 8), k % 2 ? '#FFE1EA' : '#C7B8FF', { x: Math.cos(k * TAU / 3 + 0.5) * 2.6, y: 7.2, z: Math.sin(k * TAU / 3 + 0.5) * 2.6 })); p.push(M.part(M.sphere(2, 8), '#FFE1EA', { y: 10.4 }), M.part(M.sphere(1, 6), '#E85A4F', { y: 12.6 }));
    }
    return p;
  }
  const geoPatisserie = (i) => (typeof i === 'string' ? geoPatisserieSaison(i) : memo('pat|' + i, () => M.assembler(partsPatisserie(i))));
  const geoPlateau = (i) => memo('plateau|' + i, () => M.assembler([M.part(M.boite(24, 2, 13, 0.8), '#C9B8AE'), ...partsPatisserie(i).map((p) => ({ geo: p.geo, col: p.col, m: new THREE.Matrix4().makeTranslation(0, 2, 0).multiply(p.m || new THREE.Matrix4()) }))])); // le plateau et sa pâtisserie posée dessus, en UN maillage
  function patisserie(i) { const m = M.mesh(geoPatisserie(i), M.MAT.vertex); m.userData.i = i; return m; }
  // ─── les six pâtisseries de saison : même contrat (posées sur y = 0, centrées, ~16 d'envergure, un seul maillage en cache par id) ───
  const SAISONS = ['citrouille', 'buche', 'crepe', 'paques', 'galette', 'glace'];
  const spirale = (r, tours, ep) => memo(`spi|${r}|${tours}|${ep}`, () => { // un tube enroulé en spirale dans le plan XY (face à +Z), du centre vers le rayon r
    const c = new THREE.Curve(); c.getPoint = (u, v) => { const a = u * tours * TAU, rr = r * (0.12 + 0.88 * u); return (v || new THREE.Vector3()).set(Math.cos(a) * rr, Math.sin(a) * rr, 0); };
    return new THREE.TubeGeometry(c, Math.round(tours * 10), ep, 4, false);
  });
  // les petites pièces des pâtisseries de saison, en peu de facettes (elles font 1 à 3 px à l'écran) : perle (bille à 4 anneaux), galet
  // (bille aplatie à 3 anneaux, pour les taches et les plaques écrasées) et baton (cylindre centré le long de Y, à la place d'une capsule fine)
  const perle = (r, n) => memo(`perle|${r}|${n || 6}`, () => new THREE.SphereGeometry(r, n || 6, 4));
  const galet = (r, n) => memo(`galet|${r}|${n || 8}`, () => new THREE.SphereGeometry(r, n || 8, 3));
  const baton = (r, l, n) => memo(`baton|${r}|${l}|${n || 5}`, () => new THREE.CylinderGeometry(r, r, l, n || 5));
  const demiDisque = (r, d) => memo(`dd|${r}|${d}`, () => { const s = new THREE.Shape(); s.moveTo(r, 0); s.absarc(0, 0, r, 0, Math.PI, false); s.lineTo(r, 0); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -d / 2); g.computeVertexNormals(); return g; }); // posé sur son bord droit, face à +Z
  const deplacer = (parts, p) => { const m = M.matrice(p); return parts.map((q) => ({ geo: q.geo, col: q.col, m: q.m ? m.clone().multiply(q.m) : m.clone() })); }; // un sous-ensemble de parts déplacé d'un bloc
  function partsSaison(id) {
    const p = [];
    switch (id) {
      case 'citrouille': { // tarte à la citrouille : moule de pâte, bord dentelé, garniture en côtes de potiron, la tige au centre
        p.push(M.part(M.cylindre(7.5, 6.6, 2.6, 16), '#E9A95C'), M.part(M.tore(6.95, 0.95, TAU, 6, 12), '#E39A4C', { y: 2.6, rx: HP }), M.part(M.cylindre(6.2, 6.2, 0.6, 16), '#F08A24', { y: 2.4 }));
        for (let k = 0; k < 12; k++) { const a = k * TAU / 12; p.push(M.part(perle(0.9), '#EFB46A', { x: Math.sin(a) * 6.95, y: 3.05, z: Math.cos(a) * 6.95 })); }
        for (let k = 0; k < 8; k++) { const a = (k + 0.5) * TAU / 8; p.push(M.part(M.sphere(3.1, 8), k % 2 ? '#F28C28' : '#F59A36', { x: Math.sin(a) * 2.9, y: 2.85, z: Math.cos(a) * 2.9, ry: a, sx: 0.66, sy: 0.4 })); } // huit côtes jointives : le dessus d'un potiron
        p.push(M.part(M.cylindre(0.55, 0.75, 1.8, 6), '#5DA84A', { y: 3.4 }), M.part(galet(1.1, 6), '#7BC45E', { x: 1.2, y: 4.3, z: 0.3, sx: 1.4, sy: 0.3, sz: 0.8, rz: -0.35 }));
        break;
      }
      case 'buche': { // bûche de Noël : un rondin chocolat strié, les deux bouts crème roulés en spirale, un nœud, du houx et du sucre glace
        const R = 3.7, CHOC = '#6B3E26', CREME = '#F3D9B1';
        p.push(M.part(M.cylindre(R, R, 15, 14), CHOC, { x: 7.5, y: R, rz: HP }));
        for (const [ph, l, x] of [[0.35, 11, -0.8], [0.85, 12.5, 0.6], [1.35, 9, -1.6], [1.85, 12, 0.4], [2.4, 10, 1]]) p.push(M.part(baton(0.3, l + 0.6), '#4E2A18', { x, y: R + Math.sin(ph) * (R + 0.05), z: Math.cos(ph) * (R + 0.05), rz: HP }));
        for (const sx of [-1, 1]) p.push(M.part(M.disque(3.55, 16), CREME, { x: sx * 7.52, y: R, rz: -sx * HP }), M.part(spirale(2.9, 2.2, 0.32), CHOC, { x: sx * 7.6, y: R, ry: sx * HP }));
        p.push(M.part(M.cylindre(1.6, 1.75, 2.2, 10), CHOC, { x: 3.6, y: 2 * R - 0.6, z: 0.6 }), M.part(M.disque(1.5, 12), CREME, { x: 3.6, y: 2 * R + 1.62, z: 0.6 }), M.part(spirale(1.15, 1.6, 0.18), CHOC, { x: 3.6, y: 2 * R + 1.65, z: 0.6, rx: -HP }));
        for (const [x, z, s] of [[-4.6, 0.4, 1.2], [-1.6, -0.6, 1], [5.6, -0.4, 0.9], [-6.6, 1.2, 0.7]]) p.push(M.part(galet(1.5), BLANC, { x, y: 2 * R - 0.25, z, sx: 1.3 * s, sy: 0.35, sz: s })); // le sucre glace en plaques
        for (const sx of [-1, 1]) p.push(M.part(galet(1.7), '#3E8E41', { x: -1.5 + sx * 1.5, y: 2 * R + 0.2, z: 1.2, ry: -sx * 0.55, sx: 1.6, sy: 0.3, sz: 0.7 }));
        for (const [x, z] of [[-1.9, 1.6], [-1.1, 1.9], [-1.5, 1]]) p.push(M.part(perle(0.7), '#D7263D', { x, y: 2 * R + 0.65, z }));
        break;
      }
      case 'crepe': { // une pile de quatre crêpes dorées qui débordent un peu les unes des autres, un quartier de citron dessus
        [[0.3, -0.2], [-0.5, 0.35], [0.45, 0.4], [-0.2, -0.35]].forEach(([x, z], k) => p.push(M.part(M.cylindre(7.15, 6.85, 0.8, 14), ['#F2C77A', '#EBB866', '#F2C77A', '#F5CF86'][k], { x, y: k * 0.82, z })));
        for (const [x, z, r] of [[-3.6, 2.2, 0.8], [-1, 4.6, 0.6], [2.4, 3.6, 0.9], [4.2, 0.4, 0.6], [-4.4, -1.8, 0.7], [0.4, -4.4, 0.85], [-1.5, 0.6, 0.55]]) p.push(M.part(galet(r, 7), '#DFA24E', { x, y: 3.26, z, sx: 1.25, sy: 0.22 })); // les taches dorées de la poêle
        p.push(...deplacer([M.part(demiDisque(2.9, 1.3), '#F7D531'), M.part(demiDisque(2.4, 1.5), '#FFF3A6'), M.part(M.boiteSimple(0.25, 2.2, 1.55), BLANC, { rz: 0.6 }), M.part(M.boiteSimple(0.25, 2.2, 1.55), BLANC, { rz: -0.6 })], { x: 2.4, y: 3.2, z: -1.4, ry: 0.45 }));
        for (const [x, z] of [[-2.6, -1.2], [-3.4, 0.4], [1.2, 1.8], [-0.6, 2.8]]) p.push(M.part(perle(0.35, 5), BLANC, { x, y: 3.3, z }));
        break;
      }
      case 'paques': { // une poule en chocolat (yeux en sucre, crête et barbillon rouges, ruban rose) et deux œufs pastel dans un nid
        const CH = '#7A4A2A', x0 = -3.3;
        p.push(M.part(M.sphere(4, 12), CH, { x: x0, y: 3.7, sy: 0.92, sz: 1.12 }), M.part(M.sphere(2.5, 10), CH, { x: x0, y: 7.4, z: 2.4 }));
        for (const a of [-0.45, 0, 0.45]) p.push(M.part(M.sphere(1.6, 6), '#6A3E22', { x: x0 + Math.sin(a) * 1.6, y: 6.2, z: -3.6, rz: -a, rx: -0.5, sx: 0.5, sy: 1.35, sz: 0.75 })); // la queue en éventail de plumes
        for (const sx of [-1, 1]) p.push(M.part(M.sphere(2.2, 8), '#8E5A36', { x: x0 + sx * 3.75, y: 3.9, z: -0.3, sx: 0.45, sy: 0.75, sz: 1.1 }), M.part(perle(0.5), BLANC, { x: x0 + sx * 1.05, y: 7.9, z: 4.5 }), M.part(perle(0.3, 5), L, { x: x0 + sx * 1.05, y: 7.95, z: 4.95 }));
        p.push(M.part(M.cone(0.65, 1.4, 6), '#FFB347', { x: x0, y: 7.2, z: 4.6, rx: HP }), M.part(perle(0.5), ROUGE, { x: x0, y: 6.3, z: 4.4 }));
        for (const [y, z] of [[9.6, 0.9], [10, 1.7], [9.75, 2.5]]) p.push(M.part(perle(0.7), ROUGE, { x: x0, y, z })); // la crête, sur le haut du crâne
        p.push(M.part(M.tore(2.25, 0.38, TAU, 5, 10), '#FF9FB2', { x: x0, y: 5.6, z: 1.9, rx: HP - 0.4 }), M.part(perle(0.7), '#FF9FB2', { x: x0 - 0.7, y: 4.9, z: 4.1, sx: 1.2, sz: 0.6 }), M.part(perle(0.7), '#FF9FB2', { x: x0 + 0.7, y: 4.9, z: 4.1, sx: 1.2, sz: 0.6 }));
        p.push(M.part(M.tore(3.2, 0.95, TAU, 6, 10), '#E8C27A', { x: 4.3, y: 0.85, z: 0.6, rx: HP }), M.part(M.cylindre(3, 3, 0.6, 10), '#D9AE62', { x: 4.3, y: 0.2, z: 0.6 }));
        for (const [x, z, rz, c1] of [[3.2, 1.7, 0.3, '#FFC2D1'], [5.5, -0.5, -0.25, '#A9D8FF']]) p.push(...deplacer([M.part(M.sphere(2.2, 10), c1, { sy: 1.3 }), M.part(M.tore(2.24, 0.26, TAU, 4, 8), BLANC, { rx: HP }), M.part(perle(0.4, 5), BLANC, { y: 1.6, z: 1.55 }), M.part(perle(0.4, 5), BLANC, { x: 1, y: -1.3, z: 1.6 })], { x, y: 2.9, z, rz }));
        return deplacer(p, { x: -0.2, z: -0.5 }); // recentrée sur l'origine (la poule et le nid ne sont pas symétriques)
      }
      case 'galette': { // galette des rois : flancs feuilletés, dessus doré quadrillé, une couronne dorée posée dessus
        p.push(M.part(M.cylindre(7.9, 8.1, 2.4, 20), '#F5D08A'), M.part(M.tore(8, 0.18, TAU, 4, 20), '#E8B460', { y: 0.8, rx: HP }), M.part(M.tore(8, 0.18, TAU, 4, 20), '#E8B460', { y: 1.6, rx: HP }), M.part(M.cylindre(7.6, 7.9, 0.7, 20), '#E2A04A', { y: 2.4 }));
        for (const a of [Math.PI / 4, -Math.PI / 4]) for (const d of [-4.5, -1.5, 1.5, 4.5]) p.push(M.part(M.boiteSimple(+(1.88 * Math.sqrt(7.3 * 7.3 - d * d)).toFixed(2), 0.22, 0.42), '#B9702C', { x: d * Math.sin(a), y: 3.05, z: d * Math.cos(a), ry: a }));
        const cx = 2.6, cy = 3.05, cz = -2;
        p.push(M.part(M.cylindre(2.5, 2.5, 2, 12), OR, { x: cx, y: cy, z: cz }), M.part(M.cylindre(2.15, 2.15, 0.1, 12), '#D99A1E', { x: cx, y: cy + 2, z: cz }));
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.3; p.push(M.part(M.cone(0.75, 1.5, 6), OR, { x: cx + Math.sin(a) * 2.15, y: cy + 1.95, z: cz + Math.cos(a) * 2.15 })); }
        p.push(M.part(perle(0.5), ROUGE, { x: cx, y: cy + 1, z: cz + 2.5 }), M.part(perle(0.45), '#3A86C8', { x: cx + 1.75, y: cy + 1, z: cz + 1.75 }), M.part(perle(0.45), '#3A86C8', { x: cx - 1.75, y: cy + 1, z: cz + 1.75 }));
        break;
      }
      case 'glace': { // deux cornets gaufrés plantés dans un présentoir, une boule menthe (pépites), une boule rose (cerise)
        p.push(M.part(M.boite(13, 2, 5, 0.9), '#E7D4FF')); // un petit présentoir
        for (const sx of [-1, 1]) {
          const c = [M.part(M.cone(2.5, 7.5, 10), '#E8AE5E', { y: 9.5, rx: Math.PI })], boule = sx < 0 ? '#A8E6CF' : '#FFB3C8', b = Math.atan(2.5 / 7.5); // le cornet, pointe en bas (à y = 2, dans le présentoir)
          for (const y of [4.2, 6, 7.8]) c.push(M.part(M.tore(+(2.5 * (y - 2) / 7.5 + 0.06).toFixed(2), 0.2, TAU, 4, 10), '#C98A3E', { y, rx: HP })); // le gaufrage : des cercles et des génératrices
          for (const a of [0.9, 1.57, 2.25, -0.3, 3.45]) c.push(M.part(baton(0.16, 6.92, 4), '#C98A3E', { x: Math.cos(a) * 1.32, y: 5.75, z: Math.sin(a) * 1.32, rz: b, ry: Math.PI - a }));
          c.push(M.part(M.tore(2.55, 0.75, TAU, 6, 10), boule, { y: 9.9, rx: HP }), M.part(M.sphere(3, 10), boule, { y: 11.9 }));
          if (sx < 0) for (const [a, e] of [[0.5, 0.4], [1.6, 0.9], [2.6, 0.3], [1.1, -0.2], [2.1, 0.1], [-0.4, 0.7]]) c.push(M.part(perle(0.34, 4), '#5B3A29', { x: Math.cos(a) * Math.cos(e) * 3, y: 11.9 + Math.sin(e) * 3, z: Math.sin(a) * Math.cos(e) * 3 })); // les pépites de chocolat
          else c.push(M.part(M.sphere(0.9, 8), ROUGE, { y: 15.5 }), M.part(baton(0.12, 1.44, 4), '#5DA84A', { x: 0.3, y: 16.6, rz: -0.4 }));
          p.push(...deplacer(c, { x: sx * 3.8, y: 0, rz: -sx * 0.1 }));
        }
        break;
      }
      default: return partsPatisserie(7); // un id inconnu : la pièce montée
    }
    return p;
  }
  const geoPatisserieSaison = (id) => memo('saison|' + id, () => M.assembler(partsSaison(id)));
  function patisserieSaison(id) { const m = M.mesh(geoPatisserieSaison(id), M.MAT.vertex); m.userData.id = id; return m; }
  // ─── l'atelier : une situation posée au milieu du sol, animée par userData.anime ; zoom pour voir les détails ───
  function demo(nom, ctx, zoom) {
    nom = nom || 'client-1';
    const g = new THREE.Group(), base = { haut: '#FF9FB2', peau: '#FFD7B5', cheveux: '#4A3328', coiffure: 1, bonnet: '#9BD0FF', sacCol: '#F2D7B6' }, o = { dir: 0, expression: 'sourire', blink: 0, t: 0 };
    let p = null, anim = animer, dir = 0;
    const client = (x, extra) => { const c = creer(Object.assign({}, base, extra)); c.position.x = x; g.add(c); return c; };
    const CHATS = { dort: 0.6, assis: 0.5, marche: HP, saut: HP, debout: 0.5 }, mc = /^chat-(dort|assis|marche|saut|debout)(-profil|-face)?(-brun)?$/.exec(nom); // 'chat-assis', 'chat-assis-profil', 'chat-dort-face-brun'…
    if (mc || nom === 'chats') { // un chat (ou les quatre états côte à côte), de trois quarts, de profil ou de face, roux ou brun, animé
      const liste = mc ? [mc[1]] : ['dort', 'assis', 'marche', 'saut'], chats = [], oc = [];
      liste.forEach((e, k) => { const c = chat(mc && mc[3] ? { couleur: L } : {}); c.rotation.y = mc && mc[2] ? (mc[2] === '-profil' ? HP : 0) : CHATS[e]; c.position.set((k - (liste.length - 1) / 2) * 42, e === 'saut' ? 8 : 0, 0); g.add(c); chats.push(c); oc.push({ etat: e, phase: 0, t: 0 }); });
      g.userData.anime = (E) => { for (let k = 0; k < chats.length; k++) { oc[k].t = E.t; oc[k].phase = E.t * 8; animerChat(chats[k], oc[k]); } };
      g.position.set(195, 0, 350); if (zoom) g.scale.setScalar(zoom); return g;
    }
    if (nom.startsWith('saison-')) { const m = patisserieSaison(nom.slice(7)); m.rotation.y = 0.35; g.add(m); g.position.set(195, 0, 380); g.scale.setScalar(zoom || 6); return g; } // une seule, de trois quarts, grossie
    if (nom === 'saisons') { for (let i = 0; i < SAISONS.length; i++) { const m = patisserieSaison(SAISONS[i]); m.position.set(70 + 50 * i, 0, 400); m.scale.setScalar(2); g.add(m); } return g; }
    if (nom === 'grades') { // les cinq grades côte à côte, sans plateau (la bande, l'étoile, la toque et le liseré se voient)
      const cl = [], os = [];
      for (let k = 0; k < 5; k++) { cl.push(client((k - 2) * 50, { haut: ['#5FD3A4', '#9BD0FF', '#C7B8FF', '#FFB48A', '#FF9FB2'][k], peau: ['#FFD7B5', '#F1B990', '#C68B59', '#FFD7B5', '#8D5A3C'][k], coiffure: 0, toque: true, tablier: true, grade: k + 1 })); os.push({ dir: 0, expression: 'sourire', blink: 0, t: 0 }); }
      g.userData.anime = (E) => { for (let k = 0; k < 5; k++) { os[k].t = E.t; animer(cl[k], os[k]); } };
      g.position.set(195, 0, 350); if (zoom) g.scale.setScalar(zoom); return g;
    }
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
      case 'tous': { // sept clients et le patron ; les options d'animation sont pré-construites (aucune allocation dans anime)
        const cl = [client(-150, { coiffure: 0, haut: '#8FE3C2' }), client(-100, { coiffure: 1, lunettes: true, haut: '#C7B8FF' }), client(-50, { coiffure: 2, haut: '#FFD98A', peau: '#C68B59' }), client(0, { coiffure: 3, haut: '#9BD0FF', peau: '#8D5A3C' }), client(50, { haut: OR, cheveux: '#E0A61E', coiffure: 0, or: true }), client(100, { haut: '#5FD3A4', coiffure: 0, toque: true, tablier: true, plateau: true, produit: 3 }), client(150, { haut: '#FFB48A', coiffure: 1, sac: true })];
        const os = cl.map((c, k) => ({ dir: 0, marche: k === 6, phase: 0, sac: k === 6, or: k === 4, attend: true, plateau: k === 5, produit: 3, t: 0, blink: 0, expression: ['sourire', 'neutre', 'surpris'][k % 3] })), ob = { hop: 0, rush: true, t: 0, blink: 0, rang: 5 };
        const b = boulanger(5); b.position.set(-60, 0, -90); g.add(b);
        g.userData.anime = (E) => { for (let k = 0; k < cl.length; k++) { const oc = os[k]; oc.phase = E.t * 9; oc.t = E.t; oc.blink = E.t % 3.4; animer(cl[k], oc); } ob.t = E.t; animerBoulanger(b, ob); }; g.position.set(195, 0, 330); return g; }
      default: if (nom.startsWith('apprenti-grade-')) { p = client(0, { haut: '#5FD3A4', coiffure: 0, toque: true, tablier: true, plateau: true, produit: 1, grade: +nom.slice(15) }); o.plateau = true; o.produit = 1; }
      else if (nom.startsWith('boulanger-')) { p = boulanger(+nom.slice(10)); g.add(p); anim = animerBoulanger; o.rang = +nom.slice(10); o.rush = o.rang === 3; o.hop = o.rang === 1 ? 0.6 : 0; } else p = client(0, {});
    }
    p.rotation.y = lacet(dir); g.position.set(195, 0, 350); if (zoom) g.scale.setScalar(zoom);
    g.userData.anime = (E) => { o.t = E.t; o.blink = E.t % 3.4; if (o.marche) o.phase = 1.2 + (E.t - 0.4) * 9; anim(p, o); };
    return g;
  }
  return { HAUTEUR, TAILLE_PATISSERIE, SAISONS, creer, animer, lacet, boulanger, animerBoulanger, chat, animerChat, libererChat, patisserie, geoPatisserie, partsPatisserie, patisserieSaison, geoPatisserieSaison, demo };
})();
if (typeof module !== 'undefined') module.exports = PERSOS;
