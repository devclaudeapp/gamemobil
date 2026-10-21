/* LE FOURNIL — les personnages et les pâtisseries en 3D : clients, apprentis (et leurs grades), boulanger, le chat, les pâtisseries
   de la carte et de saison, en volumes low-poly arrondis pastel.
   Un personnage = un Group (pieds à y = 0, le visage vers +Z) : deux jambes qui balancent, un buste fusionné (vêtement, tablier,
   marinière), une tête fusionnée (peau, coiffure, toque, chapeau), un visage en décalque (atlas d'expressions sur une calotte
   transparente), deux bras, et les accessoires (sac, plateau + pâtisserie fusionnés, clé, halo). Aucune échelle n'est appliquée :
   les cotes sont exprimées directement en unités monde, les proportions du dessin 2D y sont intégrées (73 de haut ≈ 45 px à
   l'écran en plongée 52°, tête r = 10, corps 22 de large). Budget : ≤ 8 appels de dessin par personnage (7 de base + 1 accessoire),
   à tous les grades d'apprenti ; le boulanger qui porte l'aura phosphorescente (le 20e palier de la Maison hantée) : + 1, un sprite ; le chat
   de la boutique : 5 ; une pâtisserie, de la carte ou de saison : 1. */
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
  function haloTex() { // le dégradé radial blanc, partagé (jamais libéré) : le halo du mystère et l'aura du boulanger le teintent
    if (!texHalo) { texHalo = M.texture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64); texHalo.userData.partagee = true; }
    return texHalo;
  }
  function haloMat() { // un dégradé radial doré pour le client mystère : la TEXTURE est partagée (jamais libérée), le SpriteMaterial est propre à chaque personnage (MODELES.dispose le libère sans toucher aux autres) ; en Node, le halo carré de MODELES
    if (typeof document === 'undefined') return M.MAT.halo;
    return new THREE.SpriteMaterial({ map: haloTex(), color: OR, transparent: true, opacity: 0.6, depthWrite: false });
  }
  // l'aura phosphorescente du boulanger (le 20e palier de la Maison hantée, portée depuis la garde-robe : GAME.tenueBoulanger(st).aura) : le
  // même dégradé teinté de vert, un sprite propre à ce boulanger (animerBoulanger fait varier son opacité et sa taille, sans allocation) ;
  // en Node (sans canvas), un sprite sans texture, propre lui aussi (jamais le matériau partagé : on l'anime)
  const AURA = { lueur: '#7CFF6B' };
  function auraMat(id) { return new THREE.SpriteMaterial({ map: typeof document === 'undefined' ? null : haloTex(), color: AURA[id] || AURA.lueur, transparent: true, opacity: 0.44, depthWrite: false }); }
  // ─── un personnage : jambes, buste, tête, visage, bras, accessoires ───
  // Hiérarchie : g (lacet par la scène) > racine (échelle ×1,25 du patron, saut) > jambes ; racine > haut (rebond, respiration, assise) >
  // corps, cou > (tête, visage), bras, accessoires. userData.parts = { racine, haut, jambes[2], corps, cou, tete, visage, bras[2], sac?, plateau?, cle?,
  // halo?, sueur? } : toque et chapeau sont FUSIONNÉS dans tete, la pâtisserie dans plateau (un seul maillage, le produit est fixé à la
  // création : la scène ne le change jamais). Appels de dessin : 7 de base (2 jambes, corps, tête, visage, 2 bras) + 1 accessoire visible
  // à la fois (sac OU halo OU plateau OU clé ; sueur pour le patron) = 8 au plus. L'option `taille` est volontairement ignorée : la
  // scène applique elle-même scale = K × taille au groupe (l'appliquer ici doublerait l'échelle).
  // Grades d'un apprenti (toque + tablier ; o.grade de 1 à 5, 1 par défaut, ignoré pour les autres) : 2 = une bande o.haut assombri
  // de 25 % qui borde le haut du tablier, rappelée en ourlet au bas (le plateau cache le milieu), 3 = + une étoile dorée sur la poitrine, 4 = + toque plus haute de 6, 5 = toque plus haute de 10 et
  // liseré doré au tablier et à la toque. Tout est fusionné dans le buste ou la tête : le nombre d'appels de dessin ne change pas.
  // Tenue du podium (o.tenue = TENUES.or | argent | bronze, le patron seulement) : toque et tablier au métal, une bande foncée au pied de
  // la toque et en ourlet du tablier (elle remplace le liseré doré du titre), une étoile foncée sur le devant de la toque et un reflet clair
  // sur sa gauche. Tout est fusionné dans le buste ou la tête : aucun appel de dessin de plus ; sans o.tenue, rien ne change.
  // La garde-robe du patron (o.garde = GAME.tenueBoulanger(st) : { tete, haut, pieds, accessoire: { forme, metal } | null }) : la forme choisit
  // le dessin (toque ou casquette ; tablier ou sweat à capuche ; sabots, chaussures ou baskets ; foulard, chaîne ou lunettes), le métal
  // sa palette dans TENUES (or, argent, bronze, quartier, quartier-or ; null : la tenue blanche). Le sweat colore aussi les bras (manches,
  // poignets, mains fusionnés en un maillage par bras), les chaussures sont fusionnées à chaque jambe : 8 appels de dessin, comme avant.
  // La garde-robe d'Halloween (la Maison hantée) : chapeau pointu de sorcière ou capuche de fantôme (fusionnés dans la tête), cape (le
  // buste prend la robe claire, la cape doublée et son col sont fusionnés dans le buste, les manches dans les bras), bottes à bout relevé
  // (fusionnées aux jambes), balai miniature en bandoulière (dans le buste) ou lanterne-citrouille (dans le bras droit) : toujours 8 appels.
  // Les costumes de l'équipe du manoir en éco : o.bandes (les bandelettes de la momie), o.os (le pyjama squelette), fusionnés dans le buste.
  // La boutique hantée (src/boutiquehantee.js) : o.deguisement (DEGUISEMENTS : sorcière, vampire, fantôme, momie pour les clients ; l'équipe
  // du manoir pour les apprentis) complète les options ; o.drap (le drap du fantôme, en cloche, festonné) est fusionné dans le buste,
  // o.bandesTete (la tête de la momie), o.oreilles ('loup' : les oreilles du loup-garou ; 'cornes' : celles de la dragonne) dans la tête :
  // toujours 8 appels de dessin au plus.
  function construire(o) {
    const peau = o.peau || '#FFD7B5', chev = o.cheveux || L, large = o.tablier === 'large', phiT = large ? 1.9 : 1.3;
    const gd = o.garde || null, pieceG = (p) => (gd && gd[p] ? gd[p] : null), metalDe = (p) => { const x = pieceG(p); return x && x.metal && TENUES[x.metal] ? TENUES[x.metal] : null; };
    const tnL = o.tenue && o.tenue.tissu ? o.tenue : null; // l'ancienne option : toque et tablier au même métal
    const tnT = metalDe('tete') || tnL, tnH = metalDe('haut') || tnL, tnP = metalDe('pieds'), tnA = metalDe('accessoire');
    const casquette = !!pieceG('tete') && pieceG('tete').forme === 'casquette', sweat = !!pieceG('haut') && pieceG('haut').forme === 'sweat', pieds = pieceG('pieds'), acc = pieceG('accessoire');
    const formeT = pieceG('tete') ? FORMES_HT[pieceG('tete').forme] || null : null, chapeau = formeT === 'chapeau', capuche = formeT === 'capuche', cape = !!pieceG('haut') && pieceG('haut').forme === 'cape'; // la garde-robe d'Halloween
    const tnC = tnH || TENUES.hantee; // la palette de la cape (et de la robe dessous)
    const haut = sweat ? (tnH || TENUES.quartier).tissu : cape ? tnC.clair : o.or ? OR : o.haut || '#FF9FB2';
    const tissuT = tnT ? tnT.tissu : BLANC, galonT = tnT ? tnT.fonce : OR, tissuH = tnH ? tnH.tissu : BLANC, galonH = tnH ? tnH.fonce : OR;
    const grade = o.toque && o.tablier ? Math.max(1, Math.min(5, Math.round(+o.grade || 1))) : 1, lisere = o.lisere || grade >= 5;
    const lunettes = !!o.lunettes || !!(acc && acc.forme === 'lunettes');
    const g = new THREE.Group(), racine = new THREE.Group(), ht = new THREE.Group(), P = { racine, haut: ht, bras: [], jambes: [] };
    g.add(racine); racine.add(ht); g.userData.parts = P; g.userData.options = o;
    // les jambes pendent du bassin (pivot y = 17,5) et remontent jusqu'à 22,5 dans le buste : au sommet du rebond de marche (haut monte de 3,25) elles restent jointes au corps
    for (const sx of [-1, 1]) { const j = pieds ? M.maille([M.part(pendu(3, 16.5, 2), L), ...partsChaussure(pieds.forme, tnP)]) : M.mesh(pendu(3, 16.5, 2), M.mat(L)); j.position.set(sx * 4.5, 17.5, 0); P.jambes.push(j); racine.add(j); }
    // le buste : une capsule, rayures de marinière, tablier qui épouse le corps (ou le sweat à capuche), col et foulard du patron
    const corps = [M.part(M.capsule(11, 12, 12), haut, { y: 36 })];
    if (o.mariniere) for (const y of [31.5, 36, 40.5, 44.8]) corps.push(M.part(bande(11.4, 2.2), '#3A86C8', { y }));
    if (o.tablier && !sweat && !cape) {
      corps.push(M.part(patchS(11.7, phiT, 1.05, HP - 1.05), tissuH, { y: 42 }), M.part(patchC(11.7, 12, phiT), tissuH, { y: 36 }), M.part(patchS(11.7, phiT, HP, 0.95), tissuH, { y: 30 }));
      if (lisere || tnH) corps.push(M.part(patchS(12, phiT, HP + 0.4, 0.28), galonH, { y: 30 }));
      if (tnH) corps.push(M.part(patchC(11.85, 11, 0.2), tnH.clair, { y: 36.5, ry: -0.45 })); // le reflet du métal, une bande claire sur la gauche du tablier
      if (grade >= 2) { const fonce = M.assombrir(haut, 0.25); corps.push(M.part(patchS(11.9, phiT, 1.05, 0.15), fonce, { y: 42 })); if (!lisere) corps.push(M.part(patchS(11.9, phiT, HP + 0.42, 0.28), fonce, { y: 30 })); } // un biais qui borde le haut de la bavette (le blanc reste visible dessous), et son rappel en ourlet au bas du tablier, là où le plateau ne cache rien (au grade 5, le liseré doré prend sa place)
      if (grade >= 3) corps.push(M.part(etoile(2.7, 1.15, 0.9), OR, ETOILE)); // l'étoile, couchée sur la poitrine gauche, au-dessus de la bavette
    }
    if (sweat) { // le sweat à capuche : la capuche rabattue dans le dos, le col, les cordons, la poche kangourou et l'étoile du quartier sur la poitrine
      const c = tnH || TENUES.quartier, poche = M.eclaircir(c.tissu, 0.12);
      corps.push(M.part(M.sphere(7, 10), c.tissu, { y: 47.5, z: -7.5, sx: 1.4, sy: 0.6, sz: 0.95 }), M.part(bande(9.6, 3), c.tissu, { y: 50.5 }), M.part(M.tore(9.4, 1.1, TAU, 6, 16), poche, { y: 51.6, rx: HP }));
      corps.push(M.part(M.capsule(0.55, 5, 5), c.clair, { x: -2.3, y: 45, z: 11, rz: 0.12 }), M.part(M.capsule(0.55, 5, 5), c.clair, { x: 2.3, y: 45, z: 11, rz: -0.12 }));
      corps.push(M.part(patchC(11.75, 5.5, 1.35), poche, { y: 25.5 }), M.part(patchC(11.85, 0.7, 1.35), c.fonce, { y: 30.6 }), M.part(patchS(11.75, 1.35, HP, 0.4), poche, { y: 30 }));
      corps.push(M.part(etoile(2.4, 1, 0.8), c.fonce, ETOILE));
    }
    if (cape) corps.push(...partsCape(tnC)); // la cape : dans le dos, évasée, doublée ; le col dressé et l'agrafe (fusionnés dans le buste)
    if (o.bandes) for (const [y, r] of [[27, 0.25], [32, -0.2], [37.5, 0.18], [43, -0.15]]) corps.push(M.part(bande(11.3, 2), o.bandes, { y, rz: r })); // les bandelettes de la momie
    if (o.os) corps.push(M.part(M.capsule(0.9, 9, 6), '#F4F0E6', { y: 44, z: 10.6 }), ...[40, 36.5, 33].map((y, k) => M.part(M.capsule(0.85, 9 - k * 1.2, 6), '#F4F0E6', { y, z: 10.9 - k * 0.15, rz: HP })), M.part(M.sphere(2, 8), '#F4F0E6', { y: 28, z: 10.2, sx: 1.6, sz: 0.5 })); // le pyjama squelette : la colonne, trois côtes, le bassin
    if (o.drap) { const d = o.drap === true ? '#F6F3FF' : o.drap; corps.push(M.part(M.cylindre(11.6, 15.8, 31, 16), d, { y: 19 })); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; corps.push(M.part(M.sphere(3.4, 8), d, { x: Math.sin(a) * 14.6, y: 19.2, z: Math.cos(a) * 14.6, sy: 0.75 })); } } // le drap du fantôme : une cloche du cou aux genoux, le bas festonné
    if (acc && acc.forme === 'balai') corps.push(...partsBalai(tnA)); // le balai miniature, en bandoulière dans le dos
    if (o.col) corps.push(M.part(patchC(12, 5, 2.3), '#2B5BD7', { y: 45.5, ry: -1.45 }), M.part(patchC(12, 5, 0.6), BLANC, { y: 45.5 }), M.part(patchC(12, 5, 2.3), ROUGE, { y: 45.5, ry: 1.45 }), M.part(patchC(12, 5, 0.6), BLANC, { y: 45.5, ry: Math.PI }));
    const foulardCol = acc && acc.forme === 'foulard' ? (tnA ? tnA.tissu : ROUGE) : acc && acc.forme !== 'lunettes' ? null : o.foulard ? ROUGE : null; // l'accessoire remplace le foulard du titre (les lunettes le laissent)
    if (foulardCol) corps.push(M.part(M.tore(9.2, 2.4, TAU, 8, 16), foulardCol, { y: 51, rx: HP }), M.part(M.sphere(2.6, 8), foulardCol, { y: 49, z: 9.6 }), M.part(M.capsule(1.3, 3, 6), foulardCol, { x: -1.7, y: 46.3, z: 11.2, rz: 0.35 }), M.part(M.capsule(1.3, 3, 6), foulardCol, { x: 1.9, y: 46.6, z: 11, rz: -0.3 })); // deux pans courts qui pendent du nœud, à plat sur le tablier
    if (acc && acc.forme === 'chaine') { const bijou = tnA ? tnA.bijou || tnA.fonce : OR; corps.push(M.part(M.tore(9.6, 0.75, TAU, 6, 20), bijou, { y: 50.2, rx: HP + 0.28 }), M.part(M.tore(10.1, 0.75, TAU, 6, 20), bijou, { y: 48.4, rx: HP + 0.5 }), M.part(M.cylindre(2.3, 2.3, 0.9, 12), bijou, { y: 42.2, z: 11.2, rx: HP + 0.18 }), M.part(M.cylindre(1.3, 1.3, 0.5, 10), tnA ? tnA.clair : '#FFF2C2', { y: 42.2, z: 12.05, rx: HP + 0.18 })); } // deux rangs qui tombent sur la poitrine, un médaillon
    P.corps = M.maille(corps); ht.add(P.corps);
    // la tête : peau, cou, coiffure (calotte, mèches, chignon, bonnet), toque ou casquette, haut-de-forme, moustache
    const tete = [M.part(M.sphere(10, 14), peau), M.part(M.cylindre(3.6, 3.6, 8, 8), peau, { y: -14 })];
    if (!o.toque && !capuche && formeT !== 'citrouille') tete.push(M.part(calotte(10.7, 1.5), chev, { rx: -0.78 }));
    if (o.coiffure === 1 && !o.toque) tete.push(M.part(M.capsule(2.3, 7, 6), chev, { x: -9.8, z: -1.5, rz: -0.12 }), M.part(M.capsule(2.3, 7, 6), chev, { x: 9.8, z: -1.5, rz: 0.12 }));
    if (o.coiffure === 2 && !o.toque) tete.push(M.part(M.sphere(4.2, 8), chev, { y: 10.5, z: -4 }));
    if (o.coiffure === 3 && !o.toque) tete.push(M.part(bande(10, 4.2), o.bonnet || '#9BD0FF', { y: 10 }), M.part(calotte(10.2, HP, 14), o.bonnet || '#9BD0FF', { y: 12 }), M.part(M.sphere(3, 8), BLANC, { y: 22.7 }));
    if (chapeau) tete.push(...partsChapeau(tnT || TENUES.hantee)); // le chapeau pointu de sorcière (à la place de la toque)
    else if (capuche) tete.push(...partsCapuche(tnT || TENUES.fantome)); // la capuche de fantôme
    else if (formeT === 'citrouille') tete.push(...partsTeteCitrouille()); // la tête de citrouille (le costume)
    else if (o.toque && casquette) { // la casquette : une calotte basse, le bandeau, la visière tournée vers l'arrière (devant, elle cacherait les yeux en plongée), le bouton ; sa couleur, celle du quartier
      const c = tnT || TENUES.quartier;
      tete.push(M.part(calotte(10.5, 0.95, 14), c.tissu, { y: 1.4 }), M.part(bande(10.2, 1.8), c.tissu, { y: 7.6 }), M.part(M.boite(9.6, 1.1, 6.8, 0.5), c.fonce, { y: 6.6, z: -10.3, rx: -0.2 }), M.part(M.sphere(1.1, 6), c.fonce, { y: 11.9 }), M.part(patchS(10.75, 0.55, 0.2, 0.55), c.clair, { y: 1.4, ry: -0.95 }));
    } else if (o.toque) {
      const th = (typeof o.toque === 'number' ? o.toque : 14) + (grade >= 5 ? 10 : grade >= 4 ? 6 : 0), hc = Math.max(1, th - 8);
      tete.push(M.part(M.cylindre(9.2, 9.2, 4, 14), tissuT, { y: 8 }), M.part(M.cylindre(8, 8.8, hc, 14), tissuT, { y: 12 }), M.part(calotte(8, HP, 14), tissuT, { y: 12 + hc }));
      if (lisere || tnT) tete.push(M.part(bande(9.5, 1.4), galonT, { y: 8.6 }));
      if (tnT) { const ye = hc >= 6 ? 12 + hc * 0.4 : 10, re = ye < 12 ? 9.2 : 8.8 - (ye - 12) / hc * 0.8; tete.push(M.part(etoile(2.6, 1.1, 0.9), tnT.fonce, { y: ye, z: re + 0.3, sy: 1.45 }), M.part(patchC(8.95, Math.max(1, hc - 1), 0.34), tnT.clair, { y: 12 + hc / 2, ry: -0.75 })); } // l'étoile au front de la toque (étirée en hauteur : la plongée de 52° l'écrase), le reflet sur sa gauche
    }
    if (o.or) tete.push(M.part(M.cylindre(11.8, 11.8, 1.6, 16), L, { y: 9.6 }), M.part(M.cylindre(7.4, 7.2, 15, 14), L, { y: 10 }), M.part(bande(7.7, 2.2), OR, { y: 13 }));
    if (o.bandesTete) for (const [y, r] of [[5.6, 0.22], [-1.2, -0.18], [-6.6, 0.12]]) tete.push(M.part(bande(10.35, 2.2), o.bandesTete === true ? '#E8DCC0' : o.bandesTete, { y, rz: r })); // la tête de la momie (le visage passe par-dessus)
    if (o.oreilles === 'loup') for (const sx of [-1, 1]) tete.push(M.part(M.cone(3.4, 7.5, 6), '#6E5E52', { x: sx * 6.6, y: 10, rz: -sx * 0.4 }), M.part(M.cone(1.8, 4.4, 6), '#FF9FB2', { x: sx * 6.5, y: 9.6, z: 1.4, rz: -sx * 0.4 })); // les oreilles pointues du loup-garou
    else if (o.oreilles === 'cornes') for (const sx of [-1, 1]) tete.push(M.part(M.cone(1.9, 6.5, 6), '#FFE27A', { x: sx * 4.6, y: 10.6, z: -1.2, rz: -sx * 0.3, rx: -0.25 })); // les petites cornes dorées de la dragonne
    if (o.moustache) tete.push(M.part(M.capsule(1.3, 3.2, 6), '#8C5A3C', { x: -2.6, y: 2.4, z: 10.1, rz: 1.05 }), M.part(M.capsule(1.3, 3.2, 6), '#8C5A3C', { x: 2.6, y: 2.4, z: 10.1, rz: -1.05 }));
    P.cou = new THREE.Group(); P.cou.position.y = 52; ht.add(P.cou); // le cou : pivot de la tête et du visage (incliner, tourner, mâcher)
    P.tete = M.maille(tete); P.tete.position.y = 11; P.cou.add(P.tete);
    for (let k = 0; k < NCEL; k++) geoVisage(k); // pré-chauffe les 8 cases du visage : animer n'allouera jamais une géométrie à la volée
    P.visage = new THREE.Mesh(geoVisage(lunettes ? 4 : 0), visageMat()); P.visage.position.y = 11; P.visage.userData.k = lunettes ? 4 : 0; P.cou.add(P.visage);
    for (const sx of [-1, 1]) { // les bras : la peau, ou la manche du sweat (poignet et main fusionnés : toujours un maillage par bras)
      const c = tnH || TENUES.quartier, lanterne = sx > 0 && acc && acc.forme === 'lanterne';
      const b = sweat ? M.maille([M.part(pendu(2.6, 11, 0), c.tissu), M.part(bande(2.85, 1.6), c.fonce, { y: -10.4 }), M.part(M.sphere(2.4, 8), peau, { y: -12.4 }), ...(lanterne ? partsLanterne(tnA) : [])])
        : cape || lanterne ? M.maille([M.part(pendu(2.6, 11, 0), cape ? tnC.clair : peau), ...(cape ? [M.part(bande(2.85, 1.6), tnC.fonce, { y: -10.4 }), M.part(M.sphere(2.4, 8), peau, { y: -12.4 })] : []), ...(lanterne ? partsLanterne(tnA) : [])]) // la manche de la robe sous la cape ; la lanterne-citrouille dans la main droite
        : M.mesh(pendu(2.6, 11, 0), M.mat(peau));
      b.position.set(sx * 11.6, 46, 0); b.rotation.z = sx * 0.1; P.bras.push(b); ht.add(b);
    }
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
  // ─── les déguisements (la boutique hantée) : des options de construire, prêtes à fusionner ; les clients en tirent un au sort, les
  //     apprentis portent celui de leur monstre (src/hantee.js, staffNom : Hubert le fantôme, Ramsès la momie… Bérénice la dragonne) ───
  const H0 = { tete: null, haut: null, pieds: null, accessoire: null }, habit = (o) => Object.assign({}, H0, o);
  const DEGUISEMENTS = {
    sorciere: { garde: habit({ tete: { forme: 'chapeau', metal: 'sorciere-c' }, haut: { forme: 'cape', metal: 'sorciere-c' } }) },
    vampire: { cheveux: '#1E1824', coiffure: 2, garde: habit({ haut: { forme: 'cape', metal: 'vampire-c' } }) },
    fantome: { haut: '#F6F3FF', drap: true, garde: habit({ tete: { forme: 'capuche', metal: 'fantome' } }) },
    momie: { haut: '#E8DCC0', cheveux: '#D9CBA8', coiffure: 0, bandes: '#CDBE9A', bandesTete: '#DCCFAE' },
    // l'équipe du manoir (les mêmes que les chibis du Manoir en éco, src/evenement.js)
    squelette: { haut: '#2E2A38', peau: '#F2EEE6', cheveux: '#2E2A38', coiffure: 0, os: true },
    citrouille: { haut: '#6FBF5A', cheveux: '#5A7A2E', coiffure: 0, garde: habit({ tete: { forme: 'citrouille', metal: null } }) },
    loupgarou: { haut: '#5A4A3E', peau: '#9C8A78', cheveux: '#6E5E52', coiffure: 3, bonnet: '#6E5E52', oreilles: 'loup' },
    dragonne: { haut: '#4FAF6A', peau: '#9FE3A6', cheveux: '#3E8A55', coiffure: 0, oreilles: 'cornes' },
  };
  DEGUISEMENTS.fantome2 = Object.assign({}, DEGUISEMENTS.fantome, { peau: '#F4F1FF', cheveux: '#F4F1FF' }); // Hubert, le vrai fantôme : le visage pâle
  DEGUISEMENTS.momie2 = Object.assign({}, DEGUISEMENTS.momie, { peau: '#E8DCC0' }); // Ramsès, la vraie momie
  DEGUISEMENTS.vampire2 = Object.assign({}, DEGUISEMENTS.vampire, { haut: '#3A2440', peau: '#EDE6FF', garde: habit({ haut: { forme: 'cape', metal: 'vampire' } }) }); // le comte Vladimir
  DEGUISEMENTS.sorciere2 = Object.assign({}, DEGUISEMENTS.sorciere, { peau: '#B9F0A6', cheveux: '#8E6BD8', coiffure: 1, garde: habit({ tete: { forme: 'chapeau', metal: 'sorciere' }, pieds: { forme: 'bottes', metal: 'sorciere' } }), haut: '#5FD3A4' }); // Berthe, la vraie sorcière
  // les neuf sortes de clients-monstres de la boutique hantée (src/boutiquehantee.js, SORTES) en chibis, pour la qualité éco ou sans HD
  DEGUISEMENTS['squelette-sorcier'] = Object.assign({}, DEGUISEMENTS.squelette, { haut: '#3B2A5C', garde: habit({ tete: { forme: 'chapeau', metal: 'sorciere-c' } }) }); // le squelette au chapeau pointu
  DEGUISEMENTS.zombie = { haut: '#6E6488', peau: '#9CCB7A', cheveux: '#3B3346', coiffure: 1 }; // la peau verte, les habits violet-gris
  DEGUISEMENTS.loup = DEGUISEMENTS.loupgarou;
  const deguiser = (o) => { const d = o && DEGUISEMENTS[o.deguisement]; return d ? Object.assign({}, o, d) : o || {}; };
  const creer = (o) => construire(deguiser(o));
  // le patron : même grammaire, 1,25 fois plus grand ; toque, foulard, moustache, liseré et col selon le titre
  // tenue : 'or', 'argent' ou 'bronze' (la tenue du podium du classement), sinon la tenue blanche
  // tenue : 'or', 'argent' ou 'bronze' (toque et tablier du podium, l'ancienne forme), ou la garde-robe complète de GAME.tenueBoulanger(st)
  // ({ tete, haut, pieds, accessoire: { forme, metal } | null }). Les palettes : les métaux du podium ; le quartier (anthracite, accent fraise,
  // bijoux argentés) et le quartier en or (noir et or). bijou : la couleur de la chaîne.
  const TENUES = { or: { tissu: '#FFD15C', fonce: '#D4921A', clair: '#FFF2C2', bijou: '#FFC84A' }, argent: { tissu: '#D3DCE6', fonce: '#7F8FA3', clair: '#F8FBFE', bijou: '#D3DCE6' }, bronze: { tissu: '#E2A06A', fonce: '#9E5A2A', clair: '#F8D6B6', bijou: '#E2A06A' },
    quartier: { tissu: '#2E2B3A', fonce: '#E1496C', clair: '#56516B', bijou: '#D3DCE6' }, 'quartier-or': { tissu: '#1E1B26', fonce: '#FFC84A', clair: '#4A4458', bijou: '#FFC84A' },
    // la Maison hantée : violet nuit et orange citrouille ; en or (le podium final) : noir et or ; et trois costumes de l'équipe du manoir
    hantee: { tissu: '#4B2F7A', fonce: '#FF8A3D', clair: '#8E6BD8', bijou: '#FFC84A' }, 'hantee-or': { tissu: '#1E1B26', fonce: '#FFC84A', clair: '#4A4458', bijou: '#FFC84A' },
    fantome: { tissu: '#F6F3FF', fonce: '#D9D2FF', clair: '#FFFFFF', bijou: '#D9D2FF' }, vampire: { tissu: '#1E1824', fonce: '#C2243F', clair: '#3A2440', bijou: '#C2243F' }, sorciere: { tissu: '#2E2547', fonce: '#5FD3A4', clair: '#4B3D73', bijou: '#5FD3A4' },
    // les déguisements des clients de la boutique hantée : plus clairs, pour se lire dans une salle sombre
    'sorciere-c': { tissu: '#6A4BB8', fonce: '#7CD992', clair: '#9A7FE0', bijou: '#FFC84A' }, 'vampire-c': { tissu: '#2E2238', fonce: '#E1496C', clair: '#B8314F', bijou: '#FFC84A' } };
  // les formes de la garde-robe d'Halloween (et leurs autres noms possibles dans GAME.GARDEROBE)
  const FORMES_HT = { chapeau: 'chapeau', 'chapeau-sorciere': 'chapeau', sorciere: 'chapeau', capuche: 'capuche', 'capuche-fantome': 'capuche', fantome: 'capuche', citrouille: 'citrouille' };
  // la tête de citrouille (le costume de la citrouille-lanterne) : cinq côtes orange autour de la tête, la tige, deux yeux et un sourire jaunes
  function partsTeteCitrouille() {
    const p = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; p.push(M.part(M.sphere(7.4, 10), k % 2 ? '#F28C28' : '#FF9A3D', { x: Math.sin(a) * 5.2, y: 0.5, z: Math.cos(a) * 5.2, sy: 1.25 })); }
    p.push(M.part(M.cylindre(1.4, 1.9, 4.5, 6), '#5A7A2E', { y: 9.5, rz: 0.2 }), M.part(M.cone(1.9, 2.4, 3), '#FFE27A', { x: -4, y: 3, z: 10.4, rx: HP }), M.part(M.cone(1.9, 2.4, 3), '#FFE27A', { x: 4, y: 3, z: 10.4, rx: HP }), M.part(M.boite(8, 1.6, 1.4, 0.6), '#FFE27A', { y: -2.6, z: 10.6 }));
    return p;
  }
  // le chapeau pointu (repère de la tête, centre à 0, rayon 10) : un large bord, le cône qui se plie vers l'arrière, le ruban, la boucle dorée
  function partsChapeau(c) {
    return [M.part(M.cylindre(15.5, 15.5, 1.3, 20), c.tissu, { y: 7.2, rx: -0.12 }), M.part(M.cylindre(9.6, 6.4, 11, 16), c.tissu, { y: 7.6, rx: -0.12 }), M.part(M.cone(6.4, 9, 12), c.tissu, { y: 17.6, z: -2.4, rx: -0.55 }), M.part(M.cone(3, 5.5, 8), c.tissu, { y: 23.2, z: -6.6, rx: -1.2 }),
      M.part(M.cylindre(9.75, 9.3, 2.8, 16), c.fonce, { y: 8.5, rx: -0.12 }), M.part(M.boite(3.6, 3.6, 1.2, 0.5), c.bijou || OR, { y: 8.4, z: 9.6, rx: -0.12 }), M.part(M.boite(1.6, 1.6, 1.4, 0.3), c.tissu, { y: 9.4, z: 9.9, rx: -0.12 })];
  }
  // la capuche de fantôme : une calotte de drap qui couvre la tête (le visage reste libre), un petit bout pointu
  function partsCapuche(c) { return [M.part(calotte(11.2, 1.75, 16), c.tissu, { rx: -0.95 }), M.part(M.cone(3.2, 5, 10), c.tissu, { y: 10, z: -3.5, rx: -0.6 }), M.part(bande(10.9, 2.4), c.fonce, { y: -6.5, rx: 0.32 })]; }
  // la cape : un demi-cylindre évasé dans le dos (du cou aux genoux), sa doublure (faces retournées), le col dressé et l'agrafe
  const capeExt = () => memo('cape|ext', () => new THREE.CylinderGeometry(11.9, 16, 29, 18, 1, true, HP + 0.32, Math.PI - 0.64));
  const capeInt = () => memo('cape|int', () => { const g = new THREE.CylinderGeometry(11.5, 15.6, 29, 18, 1, true, HP + 0.32, Math.PI - 0.64), ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k]; ix[k] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); return g; });
  function partsCape(c) {
    return [M.part(capeExt(), c.tissu, { y: 36 }), M.part(capeInt(), c.fonce, { y: 36 }), M.part(patchC(11, 6, 2.6), c.fonce, { y: 52.5, ry: Math.PI, sx: 1.05, sz: 1.05 }), M.part(patchC(11.25, 6, 2.6), c.tissu, { y: 52.6, ry: Math.PI, sx: 1.08, sz: 1.08 }),
      M.part(M.sphere(1.6, 8), c.bijou || OR, { x: -3.2, y: 49.5, z: 10 }), M.part(M.sphere(1.6, 8), c.bijou || OR, { x: 3.2, y: 49.5, z: 10 }), M.part(M.capsule(0.5, 6, 4), c.bijou || OR, { y: 49.5, z: 10.4, rz: HP })];
  }
  // le balai miniature, en bandoulière dans le dos : le manche en diagonale, la botte de paille et sa ficelle
  function partsBalai(c) { const b = c ? c.fonce : '#8B5A3C'; return [M.part(M.capsule(0.9, 30, 6), '#8B5A3C', { x: 1, y: 37, z: -12.5, rz: -0.75 }), M.part(M.cone(4.2, 10, 10), '#E0B65A', { x: -11, y: 21.5, z: -12.5, rz: Math.PI - 0.75 }), M.part(bande(2.4, 1.6), b, { x: -9, y: 24.3, z: -12.5, rz: -0.75 })]; }
  // la lanterne-citrouille au bout de la main droite (repère du bras : la main à y = −12,4)
  function partsLanterne(c) { return [M.part(M.capsule(0.35, 4, 4), c ? c.fonce : L, { y: -15.5 }), M.part(M.sphere(3.4, 10), '#FF8A3D', { y: -20.5, sy: 0.85 }), M.part(M.cylindre(0.6, 0.8, 1.4, 6), '#5A7A2E', { y: -18.2 }), M.part(M.sphere(0.8, 6), '#FFE27A', { x: -1.2, y: -20, z: 2.8, sz: 0.4 }), M.part(M.sphere(0.8, 6), '#FFE27A', { x: 1.2, y: -20, z: 2.8, sz: 0.4 })]; }
  const METAUX_PODIUM = ['or', 'argent', 'bronze'];
  // les chaussures, fusionnées au bas d'une jambe (pivot en haut : le sol est à y = −17,5) : sabots de bois, chaussures au métal, baskets
  function partsChaussure(forme, tn) {
    if (forme === 'baskets') { const c = tn || TENUES.quartier; return [M.part(M.boiteSimple(7.8, 1.5, 10.4), BLANC, { y: -17.5, z: 1.6 }), M.part(M.boite(7, 3.8, 9.4, 1.3), c.tissu, { y: -16.1, z: 1.4 }), M.part(M.boiteSimple(0.6, 2, 4.6), c.fonce, { x: -3.55, y: -15.6, z: 0.6 }), M.part(M.boiteSimple(0.6, 2, 4.6), c.fonce, { x: 3.55, y: -15.6, z: 0.6 }), M.part(M.boiteSimple(3.2, 0.5, 0.7), BLANC, { y: -12.35, z: 3.4 }), M.part(M.boiteSimple(3.2, 0.5, 0.7), BLANC, { y: -12.35, z: 4.8 })]; }
    if (forme === 'bottes') { const c = tn || TENUES.hantee; return [M.part(M.boite(7.2, 4.6, 9.6, 1.6), c.tissu, { y: -17.5, z: 1.6 }), M.part(M.cone(2.6, 4.6, 8), c.tissu, { y: -15.4, z: 6.4, rx: 1.15 }), M.part(M.sphere(1.1, 6), c.fonce, { y: -12.9, z: 8.6 }), M.part(M.cylindre(3.9, 3.6, 7, 10), c.tissu, { y: -14.5 }), M.part(M.cylindre(4.2, 4.2, 1.6, 10), c.fonce, { y: -8.6 }), M.part(M.boite(2.4, 2, 0.8, 0.3), c.bijou || OR, { y: -12.8, z: 3.8 })]; } // les bottes de sorcière : bout pointu relevé, tige, revers orange, boucle
    if (tn) return [M.part(M.boite(7.2, 4.4, 9.4, 1.4), tn.tissu, { y: -17.5, z: 1.4 }), M.part(M.boiteSimple(7.4, 1, 9.6), tn.fonce, { y: -17.5, z: 1.4 }), M.part(M.boiteSimple(5, 0.8, 1.2), tn.fonce, { y: -14.2, z: 3.2 })];
    return [M.part(M.boite(7.2, 4.4, 9.4, 1.4), '#C8864F', { y: -17.5, z: 1.4 }), M.part(M.boiteSimple(7.4, 1, 9.6), '#8B5A3C', { y: -17.5, z: 1.4 })]; // les sabots
  }
  function boulanger(rang, tenue) {
    rang = rang || 0; const th = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5);
    const garde = tenue && typeof tenue === 'object' ? tenue : null, metal = garde ? (garde.tete && METAUX_PODIUM.includes(garde.tete.metal) ? garde.tete.metal : null) : TENUES[tenue] ? tenue : null;
    const g = construire({ haut: '#FF6B8B', peau: '#FFD7B5', tablier: 'large', toque: th, lisere: rang >= 4, foulard: rang >= 3, moustache: rang >= 3, col: rang >= 5, sueur: true, tenue: garde ? null : TENUES[tenue] || null, garde });
    const P = g.userData.parts;
    // l'aura (garde.aura) : un seul sprite dressé derrière le buste, un peu plus grand que le boulanger ; un appel de dessin de plus, au plus
    if (garde && garde.aura && AURA[garde.aura]) { P.aura = new THREE.Sprite(auraMat(garde.aura)); P.aura.position.set(0, 38, -7); P.aura.scale.set(68, 90, 1); P.aura.renderOrder = -1; P.aura.castShadow = false; P.racine.add(P.aura); }
    P.racine.scale.setScalar(1.25); g.userData.rang = rang; g.userData.tenue = metal; g.userData.garde = garde; return g; // userData.tenue : le métal du podium porté sur la tête (ce que les autres voient), sinon null
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
  // o : { marche, assis, phase, t, plateau, cle, sac, or, pris, attend, blink, expression } et, pour la vie de la salle, joie (0 à 1 : le
  // petit saut bras levés d'un client servi, ou la fête de la Planque), attente (s passées immobile dans la file : au-delà de 6 s, bras
  // croisés et pied qui tape), geste ('salut' à la porte, 'mange' à table, 'petrit' au four, 'depose' au comptoir), rush, graine (décale
  // les gestes d'un personnage à l'autre). Tout est recalculé à chaque appel : rien ne reste d'une pose à l'autre.
  function animer(g, o) {
    const P = g.userData.parts, marche = !!o.marche, assis = !!o.assis, ph = o.phase || 0, t = o.t || 0, s = marche ? Math.sin(ph) * 0.55 : 0;
    const bg = P.bras[0], bd = P.bras[1], jg = P.jambes[0], jd = P.jambes[1], ht = P.haut, cou = P.cou, gr = o.graine || 0, geste = o.geste || '';
    const joie = o.joie > 0 ? Math.min(1, o.joie) : 0, impatient = !marche && !assis && o.attente > 6 && !o.plateau && !o.cle, rush = o.rush ? 1.6 : 1;
    let hy = 0, hsy = 1, hrx = 0, hrz = 0, cx = 0, cyw = 0, cz = 0;
    let bgx = -s, bdx = s, bgz = -0.1, bdz = 0.1, jgx = s, jdx = -s;
    if (assis) {
      hy = -3; jgx = jdx = CUISSE_ASSIS; bgx = bdx = -0.5;
      const balance = Math.sin(t * 2.4 + gr) * 0.1; jgx += balance; jdx -= balance; // les jambes se balancent sous la table
      if (geste === 'mange') { // toutes les 2,6 s environ, une bouchée : la main monte à la bouche, puis on mâche
        const c = (t * 0.38 + gr * 0.13) % 1, k = c < 0.22 ? Math.sin(c / 0.22 * Math.PI) : 0;
        bdx = -0.5 - k * 1.75; bdz = 0.1 - k * 0.45; cx = c >= 0.18 && c < 0.45 ? Math.sin(t * 14) * 0.05 : 0.04;
      }
    } else if (marche) { // le pas : rebond, léger écrasement au contact, buste penché, hanches qui roulent, la tête qui compense
      const b = Math.abs(Math.sin(ph)); hy = b * 2.6 / CY; hsy = 0.95 + b * 0.05; hrx = 0.07; hrz = Math.sin(ph) * 0.06; cz = -hrz * 0.7; cx = -0.05;
    } else { // debout : respiration, le poids d'une jambe sur l'autre, et le regard qui balaie la salle de temps en temps
      hsy = 1 + Math.sin(t * 2.2 + gr) * 0.015; hrz = Math.sin(t * 0.8 + gr) * 0.03; cz = -hrz * 0.5;
      const r = Math.sin(t * 0.55 + gr * 1.7); cyw = r > 0.55 ? (r - 0.55) * 1.6 * (Math.sin(gr * 3.1) > 0 ? 1 : -1) : 0;
    }
    if (impatient) { // bras croisés, pied qui tape, la tête un peu penchée
      bgx = bdx = -1.15; bgz = 0.75; bdz = -0.75; jdx = -Math.max(0, Math.sin(t * 9 + gr)) * 0.3; cz = 0.12; cyw = 0;
    }
    if (o.plateau) { bgx = bdx = -1.45; bgz = -0.1; bdz = 0.1; }
    else if (o.cle) { bdx = -1.0; bdz = 0.25; bgx = s; }
    else if (geste === 'petrit') { const k = Math.sin(t * 7 * rush + gr); bgx = -1.05 - k * 0.3; bdx = -1.05 + k * 0.3; bgz = 0.3; bdz = -0.3; cx = 0.2; hrx = 0.1; hsy = 1 + Math.abs(k) * 0.02; }
    else if (geste === 'depose') { hrx = 0.22; cx = 0.15; bgx = bdx = -0.9; }
    else if (geste === 'salut') { bdx = -0.15; bdz = 2.45 + Math.sin(t * 13) * 0.35; } // la main qui salue, à la porte
    if (joie > 0) { // servi : un petit saut, bras levés, et l'écrasement-étirement du saut
      const k = Math.sin(joie * Math.PI); hy += k * 5 / CY; hsy *= 1 + k * 0.06; bgx = bdx = -0.2; bgz = -0.1 - k * 2.3; bdz = 0.1 + k * 2.3; cx = -0.12 * k;
    }
    ht.position.y = hy; ht.scale.y = hsy; ht.rotation._x = hrx; ht.rotation._z = hrz; tourner(ht);
    cou.rotation._x = cx; cou.rotation._y = cyw; cou.rotation._z = cz; tourner(cou);
    jg.position.y = jd.position.y = assis ? 19 : 17.5; // assis : les cuisses horizontales (r = 3) reposent exactement sur l'assise à y = 16
    jg.rotation._x = jgx; jd.rotation._x = jdx; tourner(jg); tourner(jd);
    bg.rotation._x = bgx; bg.rotation._z = bgz; bd.rotation._x = bdx; bd.rotation._z = bdz; tourner(bg); tourner(bd);
    if (P.sac) P.sac.visible = !!o.sac && !assis;
    const halo = !!(o.or && !o.pris && o.attend);
    if (P.halo) { P.halo.visible = halo; if (halo) { const k = Math.sin(t * 3); P.halo.scale.x = 54 + k * 4; P.halo.scale.y = 70 + k * 5; } }
    if (P.plateau) { P.plateau.visible = !!o.plateau; if (o.plateau) P.plateau.position.y = 44 + (marche ? Math.abs(Math.cos(ph)) * 1.2 : 0); } // la pâtisserie est fusionnée au plateau (o.produit est fixé à la création)
    if (P.cle) { P.cle.visible = !!o.cle; if (o.cle) { P.cle.rotation._z = Math.sin(t * 20) * 0.5; tourner(P.cle); } }
    visage(P, joie > 0.05 ? 1 : o.blink > 3.25 ? 3 : EXPR[o.expression] || 0);
  }
  // le patron : respiration ; de temps en temps il s'essuie le front ou se frotte les mains (au repos seulement) ; un grand saut de joie (hop)
  function animerBoulanger(g, o) {
    const P = g.userData.parts, t = o.t || 0, hop = o.hop || 0, bg = P.bras[0], bd = P.bras[1], cou = P.cou;
    P.haut.scale.y = 1 + Math.sin(t * 1.6) * 0.012; P.racine.position.y = hop * 6 / CY;
    let bgx = -0.25 - hop * 0.4, bdx = bgx, bgz = -(0.25 + hop * 2.3), bdz = 0.25 + hop * 2.3, cx = -hop * 0.15, cz = Math.sin(t * 0.7) * 0.04;
    if (!hop && !o.rush) {
      const w = (t * 0.09) % 1;
      if (w < 0.07) { const k = Math.sin(w / 0.07 * Math.PI); bdx = -0.25 - k * 1.9; bdz = 0.25 - k * 0.9 + Math.sin(t * 9) * 0.15 * k; cx = -0.1 * k; } // le revers de la main sur le front
      else if (w > 0.5 && w < 0.58) { const k = Math.sin((w - 0.5) / 0.08 * Math.PI), f = Math.sin(t * 16) * 0.12 * k; bgx = bdx = -0.25 - k * 0.85; bgz = -0.25 + k * 0.75 + f; bdz = 0.25 - k * 0.75 + f; cx = 0.12 * k; } // il se frotte les mains
    }
    bg.rotation._x = bgx; bd.rotation._x = bdx; bg.rotation._z = bgz; bd.rotation._z = bdz; tourner(bg); tourner(bd);
    cou.rotation._x = cx; cou.rotation._z = cz; tourner(cou);
    if (P.sueur) P.sueur.visible = !!o.rush;
    if (P.aura) { const k = Math.sin(t * 1.4), k2 = Math.sin(t * 0.53 + 1); P.aura.material.opacity = 0.44 + 0.1 * k + 0.04 * k2; P.aura.scale.x = 68 + 3 * k; P.aura.scale.y = 90 + 4 * k + 2 * k2; } // l'aura respire, doucement (deux sinus : jamais tout à fait le même battement)
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
  // yeux prennent une pastille crème sur une robe sombre, ou la couleur de yeux : le chat noir d'Halloween a les yeux jaunes), rayures, ventre, yeux, etat. Libération : retirer le chat directement de son
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
  const geoTeteChat = (robe, ray, creme, fermes, yeux) => memo(`chat-tete|${robe}|${ray}|${creme}|${fermes ? 1 : 0}|${yeux || ''}`, () => {
    const p = [M.part(M.sphere(5.2, 14), robe, { sx: 1.12, sy: 0.96 }), M.part(M.sphere(2.3, 10), creme, { y: -1.6, z: 4.1, sx: 1.45, sy: 0.85, sz: 0.85 }), M.part(M.sphere(0.75, 8), '#F28B9B', { y: -0.75, z: 5.95, sx: 1.25, sy: 0.8, sz: 0.8 })], fonce = sombre(robe);
    for (const sx of [-1, 1]) {
      // les oreilles, des cônes aplatis (des triangles de face, pas un octogone vu d'en haut) presque droits et un peu couchés vers
      // l'arrière : sous la plongée de 52°, l'axe d'une oreille penchée vers l'extérieur viserait la caméra quand le chat est de profil
      // et l'oreille proche s'écraserait en ovale sur la joue ; leur creux rose est posé à plat sur la face avant (même repère)
      const mo = M.matrice({ x: sx * OREILLE[0], y: OREILLE[1], z: OREILLE[2], rx: OREILLE[3], rz: -sx * OREILLE[4] });
      p.push({ geo: M.cone(2.2, 4.8, 8), col: robe, m: mo.clone().multiply(M.matrice({ sz: OREILLE[5] })) }, { geo: M.cone(1.35, 3.4, 8), col: '#FFC1B4', m: mo.clone().multiply(M.matrice({ y: 0.38, z: OREILLE[6], rx: -0.155, sz: 0.34 })) });
      p.push(M.part(M.sphere(0.95, 8), JOUE, { x: sx * 3.6, y: -0.9, z: 3.7, sy: 0.7, sz: 0.5 }));
      if (fonce && !fermes) p.push(M.part(M.sphere(1.3, 8), yeux || creme, { x: sx * 2.1, y: 0.8, z: 4.45, sy: 1.1, sz: 0.5 })); // sur une robe sombre : une pastille crème derrière chaque œil
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
    const geos = [geoTeteChat(robe, ray, creme, false, o.yeux), geoTeteChat(robe, ray, creme, true, o.yeux)];
    P.tete = M.mesh(geos[0], M.MAT.vertex); P.tete.userData.geos = geos; racine.add(P.tete);
    const q1 = M.mesh(geoQueueChat(1, robe, ray), M.MAT.vertex), q2 = M.mesh(geoQueueChat(2, robe, ray), M.MAT.vertex); q1.add(q2); racine.add(q1); P.queue.push(q1, q2);
    for (let k = 0; k < 4; k++) { const p = new THREE.Object3D(); P.pattes.push(p); racine.add(p); }
    // le seul InstancedMesh du jeu : son matériau et son matériau d'ombre lui sont PROPRES (partagés par tous les chats). Avec MAT.vertex
    // ou le matériau de profondeur commun de WebGLShadowMap, Three r158 recompilerait la clé du programme à chaque bascule
    // instancié / non instancié (WebGLRenderer.setProgram : isInstancedMesh && !instancing → needsProgramChange), donc à chaque image.
    materiauxPattes();
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
  // ─── les compagnons (GAME.COMPAGNONS) : chaque animal de la boutique, même grammaire que le chat ───
  // compagnon(id) : le chat roux ou noir (chat()), sinon un modèle de la table ESPECES, bâti sur la même hiérarchie : g (lacet et position
  // par la scène, pieds à y = 0, museau vers +Z) > racine (hauteur, inclinaison) > corps, tete (deux géométries en cache, yeux ouverts /
  // fermés), queue[0] > queue[1] (un Object3D vide quand l'animal n'en a pas : aucun appel de dessin), pattes[4] (pivots ; 2 pour les
  // bipèdes, aucune pour l'escargot) recopiées dans UN InstancedMesh (pattesMaille, ses bornes figées par espèce), et ailes (le mini-dragon,
  // un seul maillage qui bat par son échelle). Appels de dessin : 5 au plus, comme le chat (corps, tête, queue, pattes, et le second
  // segment de queue OU les ailes). Toutes les géométries sont en cache (MODELES.GEOS) : changer d'animal n'en crée ni n'en perd aucune ;
  // seul le tampon d'instances est propre à chaque modèle (libererChat le rend). animerCompagnon(g, { etat, phase, t }) : les états de
  // animerChat ('dort', 'assis', 'marche', 'saut', le reste : debout), chacun avec sa touche : la poule picore, le pingouin se dandine (et
  // dort debout), l'escargot glisse sans pattes, le mini-dragon bat des ailes, le croissant rebondit, le lapin sautille, le chien et le
  // teckel remuent la queue, le raton laveur se frotte les mains. Sans allocation, comme animerChat : poses en tables calculées une fois par
  // espèce (fromArray), mouvement écrit dans les champs (position.y, scale.y, rotation._x… puis tourner()).
  const BLANC_C = '#FFFFFF';
  function yeux(p, x, y, z, r, fermes, o) { // deux yeux : billes sombres (o.pastille : une pastille claire derrière), ou deux arcs fermés
    o = o || {};
    for (const sx of [-1, 1]) {
      if (fermes) { p.push(M.part(M.tore(r * 1.05, r * 0.33, Math.PI, 4, 8), o.arc || L, { x: sx * x, y: y - r * 0.3, z: z + r * 0.2 })); continue; }
      if (o.pastille) p.push(M.part(M.sphere(r * 1.45, 8), o.pastille, { x: sx * x, y, z: z - r * 0.35, sz: 0.55 }));
      p.push(M.part(M.sphere(r, 8), o.col || L, { x: sx * x, y, z }));
    }
  }
  const joues = (p, x, y, z, r) => { for (const sx of [-1, 1]) p.push(M.part(M.sphere(r || 0.95, 8), JOUE, { x: sx * x, y, z, sy: 0.7, sz: 0.5 })); };
  const pattePendue = (r, lp, col, pied, o) => [M.part(pendu(r, lp - (o && o.court != null ? o.court : 2), 0.2), col), M.part(M.sphere((o && o.rp) || r * 1.1, 8), pied, { y: (o && o.py != null ? o.py : 1.15) - lp, z: (o && o.pz) || 0.45, sx: (o && o.sx) || 1, sy: (o && o.sy) || 0.6, sz: (o && o.sz) || 1.2 })];
  // une espèce : lp (longueur des pattes, de la hanche au sol), py (hauteur des hanches sous la racine), hanches ([x, z] ; 4, 2 ou 0),
  // tp (la tête : [y, z]), queue [y, z, inclinaison] (null : sans queue), lq1 (longueur du premier segment), q2r (l'inclinaison du second),
  // R / D (rayon et demi-longueur du corps : l'assise), demiH (la demi-hauteur du corps : couché, il touche le sol), assis
  // ('assis' : l'arrière-train au sol, incliné de a ; 'couche' : en sphinx ; 'debout'), dort ('couche' | 'debout' | 'boule' | 'rentre'),
  // et les pièces : corps(), tete(fermes), q1(), q2(), patte(), ailes().
  const ESPECES = {
    chien: {
      lp: 8, py: -3, hanches: [[-2.8, 7], [2.8, 7], [-2.8, -7], [2.8, -7]], tp: [4.8, 12.4], queue: [2.8, -11.2, -0.5], lq1: 5.5, q2r: 0.5, R: 5.2, D: 11.7, demiH: 4.4, assis: 'assis', a: -0.45, dort: 'couche',
      corps: () => { const robe = '#E6C79C', creme = '#FFF1DC'; return [M.part(M.capsule(5.2, 13, 12), robe, { rx: HP }), M.part(arcCyl(5.32, 13, 1.9, 0), creme, { rx: HP }), M.part(patchS(5.4, 2.0, 1.35, 1.45), creme, { z: 6.5 }), M.part(M.sphere(3.2, 10), '#C99B66', { x: 1.6, y: 4.1, z: -3, sy: 0.4, sx: 1.1 })]; }, // une tache sur le dos : un corniaud
      tete: (f) => { const robe = '#E6C79C', tache = '#C99B66', p = [M.part(M.sphere(4.8, 14), robe, { sx: 1.08, sy: 0.96 }), M.part(M.sphere(2.4, 10), '#FFF1DC', { y: -1.4, z: 3.9, sx: 1.25, sy: 0.85, sz: 1.05 }), M.part(M.sphere(0.95, 8), L, { y: -0.6, z: 6.1, sx: 1.3, sy: 0.85, sz: 0.8 }), M.part(M.sphere(1.6, 8), tache, { x: 2.1, y: 1.1, z: 3.75, sz: 0.45 })];
        for (const sx of [-1, 1]) p.push(M.part(M.sphere(2.1, 8), tache, { x: sx * 4.3, y: 0.4, z: -0.3, sx: 0.45, sy: 1.3, sz: 0.9, rz: sx * 0.25 })); // les oreilles tombantes
        yeux(p, 2, 1.1, 4.35, 0.85, f); joues(p, 3.4, -1, 3.5); return p; },
      q1: () => [M.part(M.capsule(1.15, 5.5, 8), '#E6C79C', { y: 2.75 })], q2: () => [M.part(M.capsule(1.05, 4.2, 8), '#E6C79C', { y: 2.1 }), M.part(calotte(1.12, 1.05, 10), '#FFF1DC', { y: 4.2 })],
      patte: () => pattePendue(1.75, 8, '#E6C79C', '#FFF1DC'),
    },
    // le chien du quartier (gagné au palier 11 du Quartier) : le même bâtard roux et blanc que la déco couchée dans la boutique (meubles.js,
    // chien), en plus costaud (corps, tête et pattes plus épais), la selle brun foncé sur le dos, un bandana rouge noué sur la nuque (sa pointe
    // posée sur les épaules : on la voit de dessus), une grosse chaîne en or et sa médaille, et deux sourcils froncés de videur
    'chien-quartier': {
      lp: 8.6, py: -3.4, hanches: [[-3.4, 7.6], [3.4, 7.6], [-3.4, -7.6], [3.4, -7.6]], tp: [5.6, 13.6], queue: [3.2, -12.4, -0.5], lq1: 4.8, q2r: 0.5, R: 6.1, D: 12.8, demiH: 5.2, assis: 'assis', a: -0.45, dort: 'couche',
      corps: () => { const robe = '#C8864F', creme = '#FFF3E2', rouge = '#E1496C';
        return [M.part(M.capsule(6.1, 13.4, 12), robe, { rx: HP }), M.part(arcCyl(6.22, 13.4, 1.9, 0), creme, { rx: HP }), M.part(patchS(6.3, 2.0, 1.35, 1.45), creme, { z: 6.9 }),
          M.part(M.sphere(3.8, 10), '#8B5A3C', { x: -0.6, y: 4.9, z: -3.2, sy: 0.4, sx: 1.25, sz: 1.3 }), // la selle sur le dos
          M.part(M.tore(5.65, 0.95, TAU, 6, 18), rouge, { y: 1.4, z: 9.2, rx: -0.45 }), M.part(M.cone(3.4, 6.2, 3), rouge, { y: 6.5, z: 8.8, rx: -HP, sz: 0.3 }), // le bandana noué sur la nuque, sa pointe sur les épaules
          M.part(M.tore(5.8, 0.55, TAU, 6, 20), OR, { y: 1.1, z: 10.3, rx: -0.45 }), M.part(M.cylindre(1.3, 1.3, 0.5, 10), OR, { y: -2.6, z: 13, rx: HP - 0.45 })]; }, // la chaîne en or et sa médaille
      tete: (f) => { const robe = '#C8864F', p = [M.part(M.sphere(5.3, 14), robe, { sx: 1.12, sy: 0.95 }), M.part(M.sphere(2.8, 10), '#FFF3E2', { y: -1.6, z: 4.2, sx: 1.3, sy: 0.85, sz: 1.05 }), M.part(M.sphere(1.1, 8), L, { y: -0.6, z: 6.7, sx: 1.3, sy: 0.85, sz: 0.8 })];
        for (const sx of [-1, 1]) p.push(M.part(M.sphere(2.3, 8), '#8B5A3C', { x: sx * 4.8, y: 0.6, z: -0.3, sx: 0.45, sy: 1.25, sz: 0.9, rz: sx * 0.25 }), M.part(M.boite(2.4, 0.6, 0.7, 0.2), L, { x: sx * 2.3, y: 2.7, z: 4.75, rz: -sx * 0.4 })); // les oreilles tombantes, les sourcils froncés
        yeux(p, 2.2, 1.3, 4.8, 0.9, f); return p; },
      q1: () => [M.part(M.capsule(1.35, 4.8, 8), '#C8864F', { y: 2.4 })], q2: () => [M.part(M.capsule(1.25, 3.4, 8), '#C8864F', { y: 1.7 }), M.part(calotte(1.32, 1.05, 10), '#FFF3E2', { y: 3.4 })],
      patte: () => pattePendue(2.1, 8.6, '#C8864F', '#FFF3E2'),
    },
    lapin: {
      lp: 6.5, py: -3.2, hanches: [[-2.6, 4.4], [2.6, 4.4], [-3, -4.4], [3, -4.4]], tp: [4.8, 8.6], queue: [1.2, -8.2, 0], lq1: 0, q2r: null, R: 5.4, D: 7.2, demiH: 4.8, assis: 'assis', a: -0.55, dort: 'couche',
      corps: () => { const robe = '#D9CFC4'; return [M.part(M.sphere(6, 14), robe, { sx: 0.95, sy: 0.9, sz: 1.25 }), M.part(M.sphere(4.4, 12), '#FFF8EF', { y: -1.4, z: 2.6, sx: 0.95, sz: 1.1 }), M.part(M.sphere(3.4, 10), robe, { x: -3.2, y: -0.8, z: -3.4, sz: 1.25 }), M.part(M.sphere(3.4, 10), robe, { x: 3.2, y: -0.8, z: -3.4, sz: 1.25 })]; },
      tete: (f) => { const robe = '#D9CFC4', p = [M.part(M.sphere(4.3, 14), robe, { sx: 1.05 }), M.part(M.sphere(1.35, 8), '#FFF8EF', { x: -0.9, y: -1.4, z: 3.5 }), M.part(M.sphere(1.35, 8), '#FFF8EF', { x: 0.9, y: -1.4, z: 3.5 }), M.part(M.sphere(0.65, 8), '#F28B9B', { y: -0.5, z: 4.3 })];
        for (const sx of [-1, 1]) p.push(M.part(M.capsule(1.3, 6.4, 8), robe, { x: sx * 1.6, y: 6.6, z: -0.9, rx: -0.2, rz: -sx * 0.14, sz: 0.55 }), M.part(M.capsule(0.75, 5.2, 6), '#FFC1B4', { x: sx * 1.6, y: 6.7, z: -0.45, rx: -0.2, rz: -sx * 0.14, sz: 0.35 })); // les grandes oreilles, le creux rose devant
        yeux(p, 1.95, 1, 3.6, 0.82, f); joues(p, 3, -0.9, 3); return p; },
      q1: () => [M.part(M.sphere(2.2, 10), '#FFF8EF')], q2: null, // le pompon
      patte: () => pattePendue(1.5, 6.5, '#D9CFC4', '#FFF8EF', { rp: 1.7, pz: 0.9, sz: 1.6 }),
    },
    poule: {
      lp: 6, py: -4.2, hanches: [[-2, 0.4], [2, 0.4]], tp: [7.6, 6.3], queue: [2, -6.2, -0.35], lq1: 0, q2r: null, demiH: 5.7, assis: 'debout', dort: 'couche',
      corps: () => { const robe = '#D9783F', aile = '#B85A2A'; return [M.part(M.sphere(6, 14), robe, { sx: 0.9, sy: 0.95, sz: 1.15 }), M.part(M.sphere(4.6, 12), '#F2B27A', { y: -1.6, z: 2.6, sz: 0.9 }), M.part(M.sphere(3.4, 10), aile, { x: -4.6, y: 0.4, z: -0.6, sx: 0.38, sy: 0.8, sz: 1.25, rx: -0.2 }), M.part(M.sphere(3.4, 10), aile, { x: 4.6, y: 0.4, z: -0.6, sx: 0.38, sy: 0.8, sz: 1.25, rx: -0.2 }), M.part(M.capsule(2.4, 3, 8), robe, { y: 4, z: 4.2, rx: 0.35 })]; },
      tete: (f) => { const crete = '#E1496C', p = [M.part(M.sphere(3.2, 12), '#D9783F'), M.part(M.cone(1.05, 2.4, 6), '#FFC84A', { y: -0.4, z: 2.7, rx: HP }), M.part(M.sphere(0.8, 8), crete, { y: -2.1, z: 2.4, sx: 0.6, sy: 1.4 })];
        for (const [z, r] of [[-0.9, 0.85], [0.2, 1.05], [1.2, 0.85]]) p.push(M.part(M.sphere(r, 8), crete, { y: 3.1, z, sx: 0.5 })); // la crête
        yeux(p, 1.45, 0.7, 2.65, 0.7, f); return p; },
      q1: () => [-0.45, 0, 0.45].map((rz) => M.part(M.capsule(0.95, 4.2, 6), '#B85A2A', { y: 2.4, rz, sz: 0.55 })), q2: null, // les plumes de la queue, en éventail
      patte: () => [M.part(pendu(0.55, 4.8, 0.2), '#F2A93B'), M.part(M.sphere(1.3, 8), '#F2A93B', { y: 0.25 - 6, z: 0.6, sy: 0.3, sz: 1.4 })],
    },
    canard: {
      lp: 5, py: -3.8, hanches: [[-2.2, 0.5], [2.2, 0.5]], tp: [8.6, 7], queue: [1.6, -7.6, -0.9], lq1: 0, q2r: null, demiH: 4.9, assis: 'debout', dort: 'couche',
      corps: () => { const aile = '#DCE4EE'; return [M.part(M.sphere(6, 14), BLANC_C, { sx: 0.92, sy: 0.82, sz: 1.3 }), M.part(M.sphere(3.6, 10), aile, { x: -4.7, y: 0.6, z: -1, sx: 0.35, sy: 0.7, sz: 1.35 }), M.part(M.sphere(3.6, 10), aile, { x: 4.7, y: 0.6, z: -1, sx: 0.35, sy: 0.7, sz: 1.35 }), M.part(M.capsule(2.3, 4, 8), BLANC_C, { y: 4.2, z: 5.2, rx: 0.15 })]; },
      tete: (f) => { const p = [M.part(M.sphere(3.4, 12), BLANC_C), M.part(M.boite(3.2, 1.2, 3.8, 0.5), '#FF9F2E', { y: -1.9, z: 3.5 })]; yeux(p, 1.5, 0.9, 2.8, 0.7, f); joues(p, 2.4, -0.6, 2.2, 0.7); return p; },
      q1: () => [M.part(M.cone(1.8, 3, 6), BLANC_C, { sz: 0.5 })], q2: null,
      patte: () => [M.part(pendu(0.55, 4, 0.2), '#FF9F2E'), M.part(M.sphere(1.6, 8), '#FF9F2E', { y: 0.15 - 5, z: 0.9, sx: 1.1, sy: 0.25, sz: 1.4 })], // la palme
    },
    herisson: {
      lp: 3.5, py: -3, hanches: [[-3.2, 3.6], [3.2, 3.6], [-3.2, -3.6], [3.2, -3.6]], tp: [0.6, 7.4], queue: null, lq1: 0, q2r: null, demiH: 4.8, assis: 'couche', dort: 'boule',
      corps: () => {
        const p = [M.part(M.sphere(6.2, 14), '#7A5640', { sy: 0.78, sz: 1.15 }), M.part(M.sphere(4.6, 12), '#EBCFA8', { y: -1.3, z: 3.4, sy: 0.7 })];
        const haut = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), un = new THREE.Vector3(1, 1, 1);
        for (const [th, n] of [[0.2, 4], [0.55, 9], [0.9, 12], [1.25, 14]]) for (let k = 0; k < n; k++) { // les piquants, peignés vers l'arrière, sauf sur le museau
          const az = (k + (n % 2 ? 0.5 : 0.25)) * TAU / n; d.set(Math.sin(th) * Math.sin(az), Math.cos(th), Math.sin(th) * Math.cos(az));
          if (d.z > 0.55 && d.y < 0.75) continue;
          pos.set(d.x * 6.2 * 0.9, d.y * 6.2 * 0.78 * 0.9, d.z * 6.2 * 1.15 * 0.9); d.z -= 0.55; d.normalize(); q.setFromUnitVectors(haut, d);
          p.push({ geo: M.cone(0.85, 2.7, 5), col: k % 3 ? '#5A3E2E' : '#E7D2B4', m: new THREE.Matrix4().compose(pos, q, un) });
        }
        return p;
      },
      tete: (f) => { const peau = '#EBCFA8', p = [M.part(M.sphere(2.9, 12), peau), M.part(M.cone(1.3, 2.8, 8), peau, { y: -0.5, z: 1.8, rx: HP }), M.part(M.sphere(0.7, 8), L, { y: -0.5, z: 4.6 }), M.part(M.sphere(0.9, 8), '#C9A27E', { x: -1.9, y: 2.2, z: -0.5, sz: 0.5 }), M.part(M.sphere(0.9, 8), '#C9A27E', { x: 1.9, y: 2.2, z: -0.5, sz: 0.5 })]; yeux(p, 1.2, 0.6, 2.3, 0.6, f); joues(p, 1.9, -0.6, 2, 0.6); return p; },
      q1: null, q2: null,
      patte: () => pattePendue(1.1, 3.5, '#C9A27E', '#C9A27E', { court: 1.2, rp: 1.2, py: 0.6, sz: 1.2 }),
    },
    pingouin: {
      lp: 2.6, py: -7.2, hanches: [[-2.2, 0.8], [2.2, 0.8]], tp: [9.6, 0.4], queue: [-6.4, -3.8, -2.2], lq1: 0, q2r: null, demiH: 7.6, assis: 'debout', dort: 'debout',
      corps: () => { const noir = '#2F3542'; return [M.part(M.capsule(4.8, 5.5, 12), noir, { sz: 0.9 }), M.part(M.sphere(4.3, 12), BLANC_C, { y: -1.2, z: 1.6, sy: 1.55, sz: 0.7 }), M.part(M.capsule(1.1, 5.5, 6), noir, { x: -4.7, y: 0.5, rz: -0.35, sz: 0.45 }), M.part(M.capsule(1.1, 5.5, 6), noir, { x: 4.7, y: 0.5, rz: 0.35, sz: 0.45 })]; },
      tete: (f) => { const p = [M.part(M.sphere(4, 12), '#2F3542'), M.part(M.sphere(1.9, 8), BLANC_C, { x: -1.2, y: 0.3, z: 2.75, sz: 0.5 }), M.part(M.sphere(1.9, 8), BLANC_C, { x: 1.2, y: 0.3, z: 2.75, sz: 0.5 }), M.part(M.cone(0.9, 2.2, 6), '#FFB238', { y: -0.6, z: 3.4, rx: HP })]; yeux(p, 1.25, 0.6, 3.65, 0.6, f); joues(p, 2.2, -0.7, 2.9, 0.6); return p; },
      q1: () => [M.part(M.cone(1.3, 2.2, 6), '#2F3542', { sz: 0.5 })], q2: null,
      patte: () => [M.part(pendu(0.7, 1.4, 0.2), '#FFB238'), M.part(M.sphere(1.7, 8), '#FFB238', { y: 0.2 - 2.6, z: 1.1, sy: 0.3, sz: 1.5 })], // les grands pieds
    },
    raton: {
      lp: 7.5, py: -3, hanches: [[-3, 7], [3, 7], [-3, -7], [3, -7]], tp: [4.8, 12.4], queue: [2.4, -11, -0.7], lq1: 5.5, q2r: 0.45, R: 5.6, D: 11.8, demiH: 4.8, assis: 'assis', a: -0.45, dort: 'couche',
      corps: () => [M.part(M.capsule(5.6, 12.5, 12), '#9A948E', { rx: HP }), M.part(arcCyl(5.72, 12.5, 1.9, 0), '#EFE8DE', { rx: HP }), M.part(patchS(5.8, 2.0, 1.35, 1.45), '#EFE8DE', { z: 6.2 })],
      tete: (f) => { const gris = '#9A948E', masque = '#2E2A28', creme = '#EFE8DE', p = [M.part(M.sphere(5, 14), gris, { sx: 1.1, sy: 0.95 }), M.part(M.sphere(2.2, 10), creme, { y: -1.5, z: 4, sx: 1.2, sz: 1.2 }), M.part(M.sphere(0.8, 8), L, { y: -1.1, z: 6.5, sx: 1.2 })];
        for (const sx of [-1, 1]) {
          p.push(M.part(M.sphere(2.1, 8), masque, { x: sx * 2.1, y: 0.9, z: 3.45, sx: 1.25, sy: 0.75, sz: 0.55 }), M.part(M.sphere(1.1, 8), creme, { x: sx * 2, y: 2.5, z: 3.5, sx: 1.3, sy: 0.4, sz: 0.5 })); // le masque de bandit, les sourcils clairs
          const mo = M.matrice({ x: sx * 3, y: 3.4, z: -0.6, rz: -sx * 0.35 }); p.push({ geo: M.cone(1.9, 3.2, 8), col: gris, m: mo.clone().multiply(M.matrice({ sz: 0.6 })) }, { geo: M.cone(1.1, 2.2, 8), col: creme, m: mo.clone().multiply(M.matrice({ y: 0.3, z: 0.75, sz: 0.3 })) });
        }
        yeux(p, 2.1, 0.95, 4.3, 0.75, f, { pastille: creme, arc: creme }); return p; },
      q1: () => [M.part(M.capsule(1.9, 5.5, 8), '#9A948E', { y: 2.75 }), M.part(bande(2.05, 1.2), '#4E4844', { y: 2.2 }), M.part(bande(2.05, 1.2), '#4E4844', { y: 4.8 })],
      q2: () => [M.part(M.capsule(1.75, 4.8, 8), '#9A948E', { y: 2.4 }), M.part(bande(1.9, 1.1), '#4E4844', { y: 1.8 }), M.part(bande(1.9, 1.1), '#4E4844', { y: 4.1 }), M.part(calotte(1.8, 1.05, 10), '#4E4844', { y: 4.8 })], // la queue annelée
      patte: () => pattePendue(1.8, 7.5, '#5F5955', '#2E2A28'),
    },
    escargot: {
      lp: 0, py: -1.9, hanches: [], tp: [1.6, 12.4], queue: null, lq1: 0, q2r: null, demiH: 1.9, assis: 'debout', dort: 'rentre',
      corps: () => { const corps = '#C6DDB0', coq = '#E8A54A', spi = '#B9732A'; const p = [M.part(M.capsule(3.4, 18, 10), corps, { rx: HP, sz: 0.55 }), M.part(M.capsule(2.6, 3.6, 8), corps, { y: 1.4, z: 10.4, rx: 0.6 }), M.part(M.sphere(7.2, 16), coq, { y: 6.6, z: -2.5, sx: 0.72 })];
        for (const sx of [-1, 1]) p.push(M.part(M.tore(4.4, 0.55, TAU, 6, 20), spi, { x: sx * 5.1, y: 6.6, z: -2.5, ry: HP }), M.part(M.tore(2.4, 0.5, TAU, 6, 16), spi, { x: sx * 5.0, y: 6.6, z: -2.5, ry: HP, sx: 1.3 }), M.part(M.sphere(0.9, 8), spi, { x: sx * 5.1, y: 6.6, z: -2.5 })); // la spirale de la coquille, des deux côtés
        return p; },
      tete: (f) => { const corps = '#C6DDB0', p = [M.part(M.sphere(2.9, 12), corps), M.part(M.tore(1, 0.22, Math.PI, 4, 8), L, { y: -0.9, z: 2.6, rz: Math.PI })];
        for (const sx of [-1, 1]) {
          p.push(M.part(M.capsule(0.45, 4, 6), corps, { x: sx * 1.2, y: 3.2, z: 0.3, rz: -sx * 0.25, rx: -0.15 }), M.part(M.sphere(0.95, 8), f ? corps : BLANC_C, { x: sx * 1.75, y: 5.4, z: 0.55 })); // les yeux au bout des cornes
          p.push(f ? M.part(M.tore(0.5, 0.16, Math.PI, 4, 8), L, { x: sx * 1.75, y: 5.3, z: 1.45 }) : M.part(M.sphere(0.5, 8), L, { x: sx * 1.8, y: 5.5, z: 1.35 }));
        }
        joues(p, 1.9, -0.4, 2.1, 0.6); return p; },
      q1: null, q2: null, patte: null,
    },
    teckel: {
      lp: 4.6, py: -2.4, hanches: [[-2.4, 9.5], [2.4, 9.5], [-2.4, -9.5], [2.4, -9.5]], tp: [4.4, 16.4], queue: [2, -14.6, -0.6], lq1: 5, q2r: 0.4, demiH: 3.6, assis: 'couche', dort: 'couche',
      corps: () => { const p = [M.part(M.capsule(3.8, 22, 12), '#D99A45', { rx: HP }), M.part(arcCyl(3.9, 22, 2.6, Math.PI), '#C47F2E', { rx: HP })]; // la baguette : la croûte, le dessus plus doré
        for (const z of [-7.5, -2.5, 2.5, 7.5]) p.push(M.part(M.capsule(0.75, 3.4, 6), '#F6D9A0', { y: 3.75, z, rx: HP, rz: 0.55, sz: 0.5 })); // les grignes
        return p; },
      tete: (f) => { const brun = '#8B5A3C', p = [M.part(M.sphere(4.2, 14), brun, { sx: 1.05 }), M.part(M.capsule(1.9, 3.2, 8), brun, { y: -1.1, z: 4.2, rx: HP }), M.part(M.sphere(0.9, 8), L, { y: -0.8, z: 7.4, sx: 1.2 })];
        for (const sx of [-1, 1]) p.push(M.part(M.sphere(2.1, 8), '#5E3A24', { x: sx * 3.9, y: -0.4, z: -0.3, sx: 0.4, sy: 1.45, sz: 0.9, rz: sx * 0.15 }), M.part(M.sphere(0.55, 8), '#C8935F', { x: sx * 1.8, y: 2.3, z: 3.45, sz: 0.4 })); // les oreilles, les points feu
        yeux(p, 1.8, 1.2, 3.6, 0.78, f); joues(p, 2.8, -1, 3.1, 0.8); return p; },
      q1: () => [M.part(M.capsule(0.8, 5, 8), '#8B5A3C', { y: 2.5 })], q2: () => [M.part(M.capsule(0.7, 4, 8), '#8B5A3C', { y: 2 }), M.part(calotte(0.75, 1.05, 8), '#5E3A24', { y: 4 })],
      patte: () => pattePendue(1.3, 4.6, '#8B5A3C', '#8B5A3C', { court: 1.6, rp: 1.5, py: 1, sz: 1.3 }),
    },
    croissant: {
      lp: 5.5, py: -2.2, hanches: [[-2.6, 3], [2.6, 3], [-4.2, -1.5], [4.2, -1.5]], tp: [1.2, 7.5], queue: null, lq1: 0, q2r: null, demiH: 3.3, assis: 'debout', dort: 'couche',
      corps: () => { const p = []; // un croissant posé à plat, le ventre devant (le visage), les cornes recourbées vers l'arrière
        for (const [a, r, col] of [[0, 4.2, '#E8A54A'], [-0.6, 3.6, '#D88E36'], [0.6, 3.6, '#D88E36'], [-1.15, 2.9, '#E8A54A'], [1.15, 2.9, '#E8A54A'], [-1.65, 1.9, '#C9792B'], [1.65, 1.9, '#C9792B']]) p.push(M.part(M.sphere(r, 10), col, { x: Math.sin(a) * 6, z: Math.cos(a) * 6 - 2.5, ry: a, sx: 0.8, sy: 0.78 }));
        p.push(M.part(M.sphere(2, 8), '#F7D08A', { y: 2.4, z: 3.6, sy: 0.3, sx: 1.2 })); return p; },
      tete: (f) => { const p = []; for (const sx of [-1, 1]) { if (!f) p.push(M.part(M.sphere(1.25, 8), BLANC_C, { x: sx * 1.4, y: 0.8, sz: 0.6 })); } yeux(p, 1.4, 0.8, 0.55, 0.62, f); p.push(M.part(M.tore(0.9, 0.22, Math.PI, 4, 8), L, { y: -1, z: 0.3, rz: Math.PI })); joues(p, 2.6, -0.4, 0, 0.75); return p; },
      q1: null, q2: null,
      patte: () => [M.part(pendu(0.55, 4.2, 0.2), L), M.part(M.sphere(1.15, 8), BLANC_C, { y: 0.45 - 5.5, z: 0.5, sy: 0.7, sz: 1.5 })], // des jambes fines et de petites baskets
    },
    // la chauve-souris (gagnée au bestiaire de la Maison hantée) : une boule de poils prune au ventre lavande, une grosse tête, deux immenses
    // oreilles roses dedans, de grands yeux brillants, deux petits crocs ; ses ailes (un seul maillage, comme celles du mini-dragon) battent
    // par leur échelle. Elle vole en petits cercles près du plafond (VOL_CS, animerCompagnon) ; endormie, elle se pose (sur le comptoir),
    // les ailes repliées. Sans pattes ni queue : 3 appels de dessin (corps, tête, ailes).
    'chauve-souris': {
      lp: 0, py: -4.6, hanches: [], tp: [6.4, 0.4], queue: null, lq1: 0, q2r: null, demiH: 4.6, assis: 'debout', dort: 'debout', ailesP: [0, 1.6, -0.6], echelle: 1.5,
      corps: () => [M.part(M.sphere(4.6, 14), '#6A57A0', { sy: 1.05 }), M.part(M.sphere(3.3, 12), '#B9A6E8', { y: -0.5, z: 2.3, sy: 1.1, sz: 0.65 }),
        M.part(M.sphere(0.9, 8), '#3A2E58', { x: -1.4, y: -4.4, z: 0.6, sz: 1.3 }), M.part(M.sphere(0.9, 8), '#3A2E58', { x: 1.4, y: -4.4, z: 0.6, sz: 1.3 })], // (les petits pieds griffus)
      tete: (f) => { const robe = '#6A57A0', p = [M.part(M.sphere(4.3, 14), robe, { sx: 1.1 }), M.part(M.sphere(1.5, 10), '#7A68A6', { y: -1.5, z: 3.5, sx: 1.35, sy: 0.85 }), M.part(M.sphere(0.5, 6), L, { y: -1.05, z: 4.9, sx: 1.3 })];
        for (const sx of [-1, 1]) p.push(M.part(M.cone(2.1, 5.6, 8), robe, { x: sx * 2.7, y: 4.8, z: -0.5, rz: -sx * 0.38, sz: 0.55 }), M.part(M.cone(1.2, 3.8, 8), '#F2A7C3', { x: sx * 2.62, y: 4.5, z: 0.1, rz: -sx * 0.38, sz: 0.3 }), // les grandes oreilles, roses dedans
          M.part(M.cone(0.36, 1, 5), BLANC_C, { x: sx * 0.62, y: -2.55, z: 4.05, rx: Math.PI })); // les deux petits crocs
        yeux(p, 1.75, 0.75, 3.55, 1, f, { pastille: '#FFE7A3', arc: L }); joues(p, 3, -1.3, 3.1, 0.85); return p; },
      q1: null, q2: null, patte: null,
      ailes: () => { const p = []; for (const sx of [-1, 1]) {
        p.push(M.part(M.sphere(3.3, 10), '#46386E', { x: sx * 4.6, y: 0.9, sx: 1.45, sy: 0.95, sz: 0.16, rz: sx * 0.28 }), M.part(M.sphere(2.7, 10), '#46386E', { x: sx * 8.4, y: 1.7, sx: 1.15, sy: 1.05, sz: 0.16, rz: sx * 0.5 }), // la membrane, festonnée
          M.part(M.sphere(2.3, 10), '#7A62B0', { x: sx * 5.2, y: 0.5, z: 0.3, sx: 1.4, sy: 0.7, sz: 0.1, rz: sx * 0.28 }), // son dessous plus clair
          M.part(M.capsule(0.42, 8.8, 5), '#3A2E58', { x: sx * 5.4, y: 2.9, rz: sx * (HP - 0.22) }), M.part(M.cone(0.5, 1.4, 5), '#3A2E58', { x: sx * 9.9, y: 4.1, rz: -sx * 0.5 })); // l'os de l'aile, sa griffe
      } return p; },
    },
    dragon: {
      lp: 7, py: -3, hanches: [[-2.8, 6.2], [2.8, 6.2], [-2.8, -6.2], [2.8, -6.2]], tp: [5.4, 11.8], queue: [2.2, -10, -0.95], lq1: 0, q2r: null, R: 5, D: 10.5, demiH: 4.3, assis: 'assis', a: -0.4, dort: 'couche',
      corps: () => { const p = [M.part(M.capsule(5, 11, 12), '#5FD3A4', { rx: HP }), M.part(arcCyl(5.1, 11, 1.9, 0), '#FFF3C4', { rx: HP })]; for (const z of [-5, -2, 1, 4]) p.push(M.part(M.cone(1, 2.4, 5), '#FFC84A', { y: 4.6, z, rx: -0.3, sx: 0.5 })); return p; }, // les crêtes du dos
      tete: (f) => { const vert = '#5FD3A4', p = [M.part(M.sphere(4.6, 14), vert, { sx: 1.05, sy: 0.95 }), M.part(M.sphere(2.6, 10), vert, { y: -1.1, z: 3.8, sx: 1.15, sy: 0.8, sz: 1.1 }), M.part(M.sphere(0.4, 6), '#3FB889', { x: -0.8, y: -0.5, z: 6.4 }), M.part(M.sphere(0.4, 6), '#3FB889', { x: 0.8, y: -0.5, z: 6.4 })];
        for (const sx of [-1, 1]) p.push(M.part(M.cone(0.9, 3, 6), '#FFF3C4', { x: sx * 2, y: 3.4, z: -1, rx: -0.5, rz: -sx * 0.25 }), M.part(M.cone(1.4, 2.6, 6), '#9A84F0', { x: sx * 4.1, y: 1, z: -0.8, rz: -sx * 1.2, sz: 0.4 })); // les cornes, les collerettes
        yeux(p, 2, 1.1, 3.95, 0.88, f); joues(p, 3.2, -1, 3.3); return p; },
      q1: () => [M.part(M.cylindre(0.7, 1.9, 8, 8), '#5FD3A4'), M.part(M.cone(1.6, 2.4, 4), '#FFC84A', { y: 7.6, sz: 0.4 })], q2: null, // la queue effilée, sa pointe en flèche
      patte: () => pattePendue(1.7, 7, '#5FD3A4', '#FFF3C4'),
      ailes: () => { const p = []; for (const sx of [-1, 1]) { const rz = -sx * (HP - 0.6); p.push(M.part(M.cone(3.2, 9, 3), '#9A84F0', { x: sx * 1.2, rz, sz: 0.18 }), M.part(M.capsule(0.45, 8.4, 5), '#C7B8FF', { x: sx * (1.2 + Math.sin(-rz) * 4.6), y: Math.cos(rz) * 4.6, z: 0.5, rz })); } return p; },
    },
  };
  const AILES_P = [0, 4, 1.5]; // la place des ailes sur la racine (le mini-dragon ; la chauve-souris a la sienne, ailesP)
  const VOL_CS = 105, CS_R = 9; // la chauve-souris en vol : sa hauteur au-dessus du sol (près du plafond) et le rayon de ses petits cercles
  const geoEspece = (id, k, f) => memo(`comp|${id}|${k}`, () => M.assembler(f()));
  const BORNES_ESP = {}; // les bornes figées du tampon des pattes, par espèce
  const tourneX = (y, z, a) => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]; // (y, z) tourné autour de X
  function posesEspece(E) { // les poses constantes d'une espèce, calculées une fois : racine, corps, tête, queue, pattes
    const Y = E.lp - E.py, T = E.tp, Q = E.queue || [0, 0, 0], n = E.hanches.length, hanche = (k) => (k < n ? [E.hanches[k][0], E.py, E.hanches[k][1]] : [0, E.py, 0]);
    const base = () => ({ r: [0, Y, 0], rr: [0, 0, 0], c: [0, 0, 0], cs: [1, 1, 1], h: [0, T[0], T[1]], hr: [0, 0, 0], hs: 1, q: [0, Q[0], Q[1]], qr: [Q[2], 0, 0], q2r: [E.q2r || 0, 0, 0], pp: [0, 1, 2, 3].map(hanche), pr: [0, 1, 2, 3].map(() => [0, 0, 0]), ps: [0, 1, 2, 3].map(() => [1, 1, 1]), pv: n > 0 });
    const marche = base(), saut = base(), dort = base(), assis = base();
    // en l'air : nez en bas, pattes repliées, la queue haute
    saut.rr = [0.42, 0, 0]; saut.hr = [-0.3, 0, 0]; saut.qr = [Q[2] - 0.5, 0, 0]; saut.pr = [0, 1, 2, 3].map((k) => [(n === 2 ? k === 0 : k < 2) ? 1 : -1, 0, 0]); saut.ps = [0, 1, 2, 3].map(() => [1, 0.8, 1]);
    const couche = (p, tete) => { // le ventre au sol, les pattes rentrées, la tête basse (tete : levée, en sphinx)
      const dy = Y - E.demiH; p.r = [0, E.demiH, 0]; p.pv = false; p.h = [0, T[0] - dy - (tete ? 0 : 1.5), T[1] - (tete ? 0 : 1)]; p.hr = tete ? [-0.15, 0, 0] : [0.35, 0.35, -0.25]; p.q = [0, Q[1] ? Q[0] - dy : 0, Q[1]]; p.qr = [-HP, 0, tete ? 0.3 : 1.4]; p.q2r = [0, 0, tete ? 0.2 : 0.9];
    };
    // dort : couché en boule (la queue enroulée), debout les yeux fermés (le pingouin), en boule (le hérisson), rentré dans sa coquille (l'escargot)
    if (E.dort === 'debout') { dort.hr = [0.45, 0, 0]; dort.h = [0, T[0] - 0.8, T[1]]; }
    else if (E.dort === 'rentre') { dort.h = [0, T[0] - 0.6, T[1] - 4.5]; dort.hs = 0.65; }
    else { couche(dort, false); dort.cs = [1.08, 0.85, 1]; if (E.dort === 'boule') { dort.cs = [1.05, 1, 0.86]; dort.h = [0, E.demiH - 1, T[1] - 2.6]; dort.hr = [0.6, 0, 0]; } }
    if (E.assis === 'couche') { couche(assis, true); if (n > 0) { assis.pv = true; for (let k = 0; k < 4; k++) { const avant = k < 2; assis.pp[k] = [hanche(k)[0] * (avant ? 1 : 1.25), E.demiH * 0.45, hanche(k)[2]]; assis.pr[k] = [avant ? -1.35 : -1.45, 0, 0]; assis.ps[k] = avant ? [1, 0.8, 1] : [1.2, 0.6, 1]; } } }
    else if (E.assis === 'assis') { // l'arrière-train au sol : le corps raccourci et incliné de a (nez en l'air), pattes avant droites, cuisses repliées devant, la queue au sol
      const a = E.a, D = E.D * 0.85, ys = E.R * Math.cos(a) - D * Math.sin(a) + 0.3, av = tourneX(E.py, E.hanches[0][1], a), ar = tourneX(E.py, E.hanches[2][1], a);
      const hAv = ys + av[0], hAr = ys + ar[0], lAr = E.lp * 0.85, th = Math.acos(Math.max(0, Math.min(1, hAr / lAr)));
      assis.r = [0, ys, 0]; assis.rr = [a, 0, 0]; assis.cs = [1, 1, 0.85]; assis.h = [0, T[0], T[1] * 0.92]; assis.hr = [-a - 0.1, 0, 0]; assis.qr = [-2 - a, 0, 0]; assis.q2r = [0.5, 0, 0];
      for (let k = 0; k < 4; k++) { const avant = k < 2; assis.pr[k] = avant ? [-a, 0, 0] : [-a - th, 0, 0]; assis.ps[k] = avant ? [1, hAv / E.lp, 1] : [1.3, 0.85, 1]; }
    }
    return { marche, saut, dort, assis };
  }
  function materiauxPattes() { // partagés par tous les chats et les compagnons (voir chat())
    matPattes = matPattes || M.partager(new THREE.MeshLambertMaterial({ vertexColors: true }));
    profPattes = profPattes || M.partager(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  }
  function compagnon(id) {
    const E = ESPECES[id];
    if (!E) { const c = chat(id === 'chat-noir' ? Object.assign({}, CHAT_NOIR) : {}); c.userData.espece = id === 'chat-noir' ? 'chat-noir' : 'chat-roux'; return c; } // les deux chats (un id inconnu : le roux)
    if (!E.poses) { E.id = id; E.poses = posesEspece(E); E.q2p = [0, E.lq1, 0]; }
    const g = new THREE.Group(), racine = new THREE.Group(), P = { racine, queue: [], pattes: [], esp: E };
    g.add(racine); g.userData.parts = P; g.userData.espece = id; if (E.echelle) racine.scale.setScalar(E.echelle); // (la chauve-souris, plus grosse que nature : on la voit voler)
    P.corps = M.mesh(geoEspece(id, 'corps', E.corps), M.MAT.vertex); racine.add(P.corps);
    const geos = [geoEspece(id, 'tete0', () => E.tete(false)), geoEspece(id, 'tete1', () => E.tete(true))];
    P.tete = M.mesh(geos[0], M.MAT.vertex); P.tete.userData.geos = geos; racine.add(P.tete);
    const q1 = E.q1 ? M.mesh(geoEspece(id, 'q1', E.q1), M.MAT.vertex) : new THREE.Object3D(), q2 = E.q2 ? M.mesh(geoEspece(id, 'q2', E.q2), M.MAT.vertex) : new THREE.Object3D(); // sans queue : des pivots vides
    q1.add(q2); racine.add(q1); P.queue.push(q1, q2);
    for (let k = 0; k < 4; k++) { const p = new THREE.Object3D(); P.pattes.push(p); racine.add(p); }
    if (E.ailes) { P.ailes = M.mesh(geoEspece(id, 'ailes', E.ailes), M.MAT.vertex); P.ailes.position.fromArray(E.ailesP || AILES_P); racine.add(P.ailes); }
    if (id === 'chauve-souris') g.userData.vol = P.vol = new Float64Array(1); // sa hauteur de vol, lue par la scène (un tableau typé : l'écrire n'alloue rien)
    if (E.patte) {
      materiauxPattes();
      const im = P.pattesMaille = new THREE.InstancedMesh(geoEspece(id, 'patte', E.patte), matPattes, 4);
      im.customDepthMaterial = profPattes; im.castShadow = true; im.frustumCulled = false; racine.add(im);
      if (!BORNES_ESP[id]) { // l'union de toutes les poses, une fois par espèce (comme le chat)
        const b = new THREE.Box3(), o2 = { etat: 'dort', phase: 0, t: 0 };
        for (const e of ['dort', 'assis', 'saut', 'debout', 'marche']) for (let k = 0; k < (e === 'marche' || e === 'assis' ? 16 : 1); k++) { o2.etat = e; o2.phase = k * TAU / 16; o2.t = k * 0.4; animerCompagnon(g, o2); im.computeBoundingBox(); b.union(im.boundingBox); }
        BORNES_ESP[id] = { boite: b, sphere: b.getBoundingSphere(new THREE.Sphere()) };
      }
      im.boundingBox = BORNES_ESP[id].boite.clone(); im.boundingSphere = BORNES_ESP[id].sphere.clone();
      g.addEventListener('removed', () => im.dispose());
    }
    animerCompagnon(g, { etat: 'assis', phase: 0, t: 0 });
    return g;
  }
  // animerCompagnon(g, { etat, phase, t }) : un chat passe à animerChat ; les autres prennent les poses de leur espèce, puis le mouvement
  // et leur touche. Aucune allocation : mêmes règles que animerChat (tables constantes, champs d'Euler suivis de tourner()).
  function animerCompagnon(g, o) {
    const P = g.userData.parts; if (!P.esp) { animerChat(g, o); return; }
    const E = P.esp, id = E.id, r = P.racine, c = P.corps, h = P.tete, q1 = P.queue[0], q2 = P.queue[1], pa = P.pattes, ai = P.ailes, t = o.t || 0, e = o.etat, n = E.hanches.length;
    const A = e === 'dort' ? E.poses.dort : e === 'assis' ? E.poses.assis : e === 'saut' ? E.poses.saut : E.poses.marche;
    r.position.fromArray(A.r); r.rotation.fromArray(A.rr); c.position.fromArray(A.c); c.scale.fromArray(A.cs);
    h.position.fromArray(A.h); h.rotation.fromArray(A.hr); h.scale.x = h.scale.y = h.scale.z = A.hs;
    q1.position.fromArray(A.q); q1.rotation.fromArray(A.qr); q2.position.fromArray(E.q2p); q2.rotation.fromArray(A.q2r);
    for (let k = 0; k < 4; k++) { const p = pa[k]; p.position.fromArray(A.pp[k]); p.rotation.fromArray(A.pr[k]); p.scale.fromArray(A.ps[k]); p.visible = A.pv && k < n; }
    const geo = h.userData.geos[e === 'dort' ? 1 : 0]; if (h.geometry !== geo) h.geometry = geo;
    if (ai) ai.scale.set(1, 1, 1);
    const chien = id === 'chien' || id === 'teckel' || id === 'chien-quartier';
    if (id === 'chauve-souris') { // la chauve-souris : endormie, elle se pose (sur le comptoir : la scène l'y met), les ailes repliées, et respire ;
      // sinon elle vole en petits cercles près du plafond au-dessus de sa place (plus vite quand le compagnon se promène), penchée dans le virage,
      // les ailes qui battent. P.vol[0] (g.userData.vol) : sa hauteur de vol, que la scène ajoute à la zone de la caresse (un tableau typé : rien
      // n'est alloué ; écrit ici, pas dans une fonction à part, qui mettrait ses nombres en boîte tant qu'elle n'est pas optimisée). Sans pattes.
      if (e === 'dort') {
        const b = Math.sin(t * 1.5) * 0.03; c.scale.y *= 1 + b; h.position.y += b * 3; h.rotation._x = 0.3 + Math.sin(t * 0.9) * 0.05; tourner(h);
        ai.scale.set(0.4, 0.7, 1); P.vol[0] = 0; return;
      }
      const a = t * (e === 'marche' ? 2.3 : 1.5), haut = VOL_CS + Math.sin(t * 3.1) * 1.8;
      r.position.x = Math.cos(a) * CS_R; r.position.z = Math.sin(a) * CS_R; r.position.y = A.r[1] + haut;
      r.rotation._x = 0.12; r.rotation._y = -a; r.rotation._z = 0.3; tourner(r); // de face dans le sens du vol, penchée vers le centre du cercle
      h.rotation._x = -0.12 + Math.sin(t * 2.2) * 0.06; tourner(h);
      ai.scale.y = Math.cos(t * 17); ai.scale.x = 1 - 0.12 * Math.abs(Math.sin(t * 17));
      P.vol[0] = haut; return;
    }
    if (e === 'dort') { // la respiration lente ; les ailes repliées, la queue qui frémit
      const b = Math.sin(t * 1.5) * 0.03; c.scale.y *= 1 + b; h.position.y += b * 3;
      if (ai) { ai.scale.y = 0.2; ai.scale.x = 0.75; }
      q2.rotation._z = A.q2r[2] + Math.sin(t * 0.9) * 0.08; tourner(q2);
    } else if (e === 'assis') { // assis, couché en sphinx ou debout sur place : le regard fait le tour de la salle, la queue balaie ; puis la touche de chacun
      h.rotation._y = Math.sin(t * 0.7) * 0.15; tourner(h);
      q1.rotation._z = A.qr[2] + Math.sin(t * (chien ? 11 : 1.4)) * (chien ? 0.45 : 0.25); tourner(q1); q2.rotation._z = A.q2r[2] + Math.sin(t * 1.4 - 0.8) * 0.3; tourner(q2);
      if (id === 'poule') { // elle picore : la tête plonge d'un coup, le corps suit un peu
        let k = Math.max(0, Math.sin(t * 2.3)); k *= k; k *= k;
        h.position.y -= 5.5 * k; h.position.z += 1.8 * k; h.rotation._x = 1.1 * k; tourner(h); r.rotation._x = 0.3 * k; tourner(r);
      } else if (id === 'canard') { q1.rotation._z = Math.sin(t * 14) * 0.35 * Math.max(0, Math.sin(t * 0.8)); tourner(q1); } // la queue frétille
      else if (id === 'pingouin') { r.rotation._z = Math.sin(t * 2.2) * 0.1; tourner(r); } // il se dandine sur place
      else if (id === 'croissant') { const u = Math.abs(Math.sin(t * 3.2)); r.position.y += u * 2.2; c.scale.y = 0.92 + 0.08 * u; c.scale.x = 1.05 - 0.05 * u; } // il rebondit sur place, écrasé en touchant le sol
      else if (id === 'escargot') { h.rotation._z = Math.sin(t * 1.7) * 0.1; tourner(h); c.scale.z = 1 + Math.sin(t * 0.9) * 0.02; } // les cornes oscillent
      else if (id === 'raton') { for (let k = 0; k < 2; k++) { const p = pa[k]; p.rotation._x = A.pr[k][0] - 1 + Math.sin(t * 7 + k * Math.PI) * 0.3; tourner(p); p.scale.y = 0.7; } } // il se frotte les mains
      else if (id === 'lapin') { h.rotation._z = Math.sin(t * 9) * 0.07 * Math.max(0, Math.sin(t * 0.6)); tourner(h); } // les oreilles frémissent
      else if (id === 'herisson') { h.rotation._x = -0.15 + Math.sin(t * 6) * 0.06; tourner(h); } // il renifle
      else if (id === 'dragon' && ai) { const k = Math.sin(t * 0.8); ai.scale.y = k > 0.6 ? 0.3 + 0.35 * (1 + Math.cos(t * 14)) : 1; } // de temps en temps, un battement d'ailes
    } else if (e === 'saut') { // en l'air : la queue pour l'équilibre, les ailes battent
      q1.rotation._z = Math.sin(t * 5) * 0.1; tourner(q1);
      if (ai) ai.scale.y = 0.3 + 0.35 * (1 + Math.cos(t * 16));
    } else { // marche (ou debout) : diagonales opposées (deux pattes : alternées), le dos qui descend quand les pattes s'écartent
      const ph = e === 'marche' ? o.phase || 0 : 0, marche = e === 'marche', s = marche ? Math.sin(id === 'herisson' ? ph * 1.6 : ph) * (id === 'pingouin' ? 0.3 : 0.6) : 0;
      r.position.y = A.r[1] - E.lp * (1 - Math.cos(s)); h.rotation._x = Math.sin(ph * 2) * 0.05; tourner(h);
      if (id === 'lapin') { // il sautille : les pattes vont par paires, le corps décolle
        const v = marche ? Math.sin(ph) * 0.55 : 0; r.position.y = A.r[1] + (marche ? Math.abs(Math.sin(ph * 0.5)) * 4.5 : 0);
        for (let k = 0; k < 4; k++) { pa[k].rotation._x = k < 2 ? -v : v; tourner(pa[k]); }
      } else for (let k = 0; k < n; k++) { pa[k].rotation._x = n === 2 ? (k === 0 ? s : -s) : (k === 0 || k === 3 ? s : -s); tourner(pa[k]); }
      q1.rotation._z = Math.sin(t * (chien ? 9 : 2.6)) * (chien ? 0.4 : 0.22); tourner(q1); q2.rotation._z = Math.sin(t * 2.6 - 0.9) * 0.3; tourner(q2);
      if (id === 'poule') h.position.z += Math.sin(ph * 2) * 1.2; // la tête qui avance à chaque pas
      else if (id === 'canard' || id === 'pingouin') { r.rotation._z = Math.sin(ph) * (id === 'canard' ? 0.12 : 0.2); tourner(r); } // il se dandine
      else if (id === 'escargot') { const u = Math.sin(ph * 0.5); c.scale.z = 1 + 0.06 * u; h.position.z += 0.8 * u; h.rotation._z = Math.sin(t * 1.7) * 0.08; tourner(h); } // il glisse : le pied s'étire et se ramasse
      else if (id === 'croissant') { r.position.y += Math.abs(Math.sin(ph)) * 3.2; c.scale.y = 1 - 0.07 * Math.cos(ph * 2); } // il rebondit à chaque pas
      if (ai) { ai.scale.y = marche ? 0.3 + 0.35 * (1 + Math.cos(t * 13)) : 1; ai.scale.x = marche ? 1 + 0.1 * Math.sin(t * 13) : 1; } // en marchant, il bat des ailes
    }
    const im = P.pattesMaille; if (!im) return;
    for (let k = 0; k < 4; k++) { const p = pa[k]; if (p.visible) { p.updateMatrix(); im.setMatrixAt(k, p.matrix); } else im.setMatrixAt(k, ZERO); }
    im.instanceMatrix.needsUpdate = true;
  }
  // ─── les seize pâtisseries (les huit de toujours, puis les recettes de boutique, 8 à 15) : une liste de parts colorées par produit (posée sur y = 0, centrée, ~16 d'envergure), fusionnée seule
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
      case 8: { // Paris-Brest : une couronne de choux fendue, le praliné en vagues, les amandes effilées et le sucre glace
        p.push(M.part(M.tore(5.4, 2.1, TAU, 8, 18), '#D9A05B', { y: 2.1, rx: HP }));
        for (let k = 0; k < 14; k++) { const a = k * TAU / 14; p.push(M.part(galet(1.75, 8), k % 2 ? '#E2B98A' : '#D8A97A', { x: Math.cos(a) * 5.4, y: 4, z: Math.sin(a) * 5.4, sy: 0.7 })); } // le praliné qui dépasse
        for (let k = 0; k < 12; k++) { const a = (k + 0.5) * TAU / 12; p.push(M.part(M.sphere(1.9, 8), k % 2 ? '#D49A52' : '#DCA45C', { x: Math.cos(a) * 5.4, y: 5.4, z: Math.sin(a) * 5.4, sy: 0.75 })); }
        for (const [a, e] of [[0.3, 0.4], [1.2, -0.5], [2, 0.6], [2.9, -0.2], [3.8, 0.5], [4.6, -0.4], [5.5, 0.3]]) p.push(M.part(galet(0.8, 6), '#F3E2C0', { x: Math.cos(a) * (5.4 + e), y: 6.8, z: Math.sin(a) * (5.4 + e), ry: a, sx: 1.4, sy: 0.25 }));
        for (const a of [0.8, 2.4, 3.3, 5]) p.push(M.part(perle(0.45, 5), BLANC, { x: Math.cos(a) * 5.6, y: 6.9, z: Math.sin(a) * 5.6 }));
        break;
      }
      case 9: { // kouign-amann : un rond feuilleté, quatre coins repliés, le caramel qui brille et coule sur le bord
        p.push(M.part(M.cylindre(7, 7.3, 2.8, 16), '#C9802F'), M.part(M.tore(7, 0.7, TAU, 6, 16), '#A95F1E', { y: 0.6, rx: HP }));
        for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.4; p.push(M.part(M.sphere(3.6, 10), k % 2 ? '#D99440' : '#E0A04A', { x: Math.cos(a) * 3.3, y: 3, z: Math.sin(a) * 3.3, ry: -a, sx: 1.25, sy: 0.55, sz: 0.85 })); }
        p.push(M.part(galet(2.2, 10), '#9E561A', { y: 3.9, sy: 0.4 }));
        for (const [x, z] of [[2.4, 4.8], [-4.6, 2.6], [-1.6, -5], [5, -1.8]]) p.push(M.part(galet(0.9, 6), '#B8702A', { x, y: 2.9, z, sy: 0.35 })); // les gouttes de caramel
        break;
      }
      case 10: { // tarte aux myrtilles : la pâte dorée, la garniture violette, les myrtilles en tas et un brin de sucre glace
        p.push(M.part(M.cylindre(7.4, 6.6, 3, 14), '#E9A95C'), M.part(M.tore(6.6, 1.1, TAU, 6, 14), '#E39A4C', { y: 3, rx: HP }), M.part(M.cylindre(6.2, 6.2, 0.8, 14), '#5B4A9E', { y: 2.5 }));
        for (let r = 0; r < 3; r++) { const n = [1, 6, 11][r], rr = [0, 2.3, 4.5][r]; for (let k = 0; k < n; k++) { const a = k * TAU / n + r; p.push(M.part(perle(1.05, 6), (k + r) % 3 ? '#3E3283' : '#4A3E96', { x: Math.cos(a) * rr, y: 3.4 + (r === 0 ? 0.6 : 0), z: Math.sin(a) * rr })); } }
        for (const [x, z] of [[1.4, 1.2], [-2.8, -1.6], [3.4, -2.6]]) p.push(M.part(perle(0.35, 5), '#C7D2FF', { x, y: 4.3, z }));
        break;
      }
      case 11: { // opéra : biscuit, crème au café, ganache en couches, le glaçage noir et le mot doré, une feuille d'or
        const L5 = [[1.3, '#9A6A44'], [1, '#C89F7A'], [1.1, '#8E5E3A'], [1, '#5A3422'], [1.1, '#9A6A44'], [1, '#C89F7A']]; let y = 0;
        for (const [h, c] of L5) { p.push(M.part(M.boiteSimple(13.5, h, 8.5), c, { y })); y += h; }
        p.push(M.part(M.boite(13.7, 1, 8.7, 0.3), '#2E1B12', { y }));
        p.push(M.part(baton(0.18, 5.5, 4), OR, { x: -1, y: y + 1.05, z: 0.6, rz: HP }), M.part(baton(0.18, 3, 4), OR, { x: 0.4, y: y + 1.05, z: -0.6, rz: HP }), M.part(M.boiteSimple(1.8, 0.15, 1.4), '#FFD15C', { x: 4.3, y: y + 1.05, z: 1.8, ry: 0.5 }));
        break;
      }
      case 12: { // deux canelés : cannelés de cuivre foncé, la croûte caramélisée, le dessus plat et clair
        for (const [x, z, k] of [[-3.6, 0.8, 1], [3.9, -0.6, 0.85]]) {
          const c = [M.part(M.cylindre(3.9, 4.3, 7, 12), '#8B4A1E'), M.part(M.cylindre(3.95, 3.95, 0.7, 12), '#5E2C10', { y: 6.9 }), M.part(M.disque(2.6, 12), '#B5682E', { y: 7.62 })];
          for (let j = 0; j < 10; j++) { const a = j * TAU / 10; c.push(M.part(baton(0.5, 6.4, 5), '#6E3612', { x: Math.cos(a) * 4.1, y: 3.5, z: Math.sin(a) * 4.1 })); } // les cannelures
          p.push(...deplacer(c, { x, z, s: k }));
        }
        break;
      }
      case 13: { // saint-honoré : le disque feuilleté, la couronne de choux caramélisés, la chiboust et la chantilly à la douille
        p.push(M.part(M.cylindre(7.6, 7.6, 1.6, 16), '#E8B46A'), M.part(M.cylindre(5.4, 5.4, 2, 16), '#FFF3C4', { y: 1.6 }));
        for (let k = 0; k < 9; k++) { const a = k * TAU / 9, x = Math.cos(a) * 5.8, z = Math.sin(a) * 5.8; p.push(M.part(M.sphere(2, 8), '#D9A050', { x, y: 3.4, z }), M.part(galet(1.6, 8), '#A0601E', { x, y: 4.9, z, sy: 0.35 })); }
        for (const [r, y] of [[3.3, 4.2], [2.6, 5.6], [1.8, 6.9], [1, 8]]) p.push(M.part(M.tore(r, 0.9, TAU, 6, 12), BLANC, { y, rx: HP }));
        p.push(M.part(M.cone(0.9, 1.6, 8), BLANC, { y: 9.2 }), M.part(perle(0.8, 8), ROUGE, { y: 10.3 }));
        break;
      }
      case 14: { // fraisier : génoise, crème mousseline, les fraises coupées en deux tout autour, la pâte d'amande rose et trois fraises dessus
        p.push(M.part(M.cylindre(7, 7, 1.4, 18), '#F1D08A'), M.part(M.cylindre(6.8, 6.8, 4.2, 18), '#FFF3D6', { y: 1.4 }), M.part(M.cylindre(7, 7, 1.1, 18), '#F1D08A', { y: 5.6 }), M.part(M.cylindre(7.05, 7.05, 0.6, 18), '#FF9FB2', { y: 6.7 }));
        for (let k = 0; k < 14; k++) { const a = k * TAU / 14; p.push(M.part(M.sphere(1.55, 8), '#E8384F', { x: Math.cos(a) * 6.75, y: 3.5, z: Math.sin(a) * 6.75, ry: -a, sx: 0.45, sy: 1.15 })); }
        for (const [x, z] of [[0, 0], [2.3, 1.3], [-2, 1.6]]) p.push(M.part(M.sphere(1.5, 8), '#E1394A', { x, y: 8.5, z, sy: 1.2 }), M.part(M.cone(1, 0.8, 5), '#5DA84A', { x, y: 10.2, z, rx: Math.PI }));
        break;
      }
      case 15: { // croquembouche : la nougatine, la tour de choux dorés au caramel, les fils de sucre, les dragées et une fleur au sommet
        p.push(M.part(M.cylindre(7.6, 7.9, 1.4, 16), '#B8702A'), M.part(M.tore(7.6, 0.5, TAU, 5, 16), '#D9963E', { y: 1.4, rx: HP }));
        for (let r = 0; r < 6; r++) { const rr = 5.4 - r * 0.95, n = Math.max(1, Math.round(TAU * rr / 2.7)); for (let k = 0; k < n; k++) { const a = k * TAU / n + r * 0.5; p.push(M.part(M.sphere(1.55, 7), (k + r) % 2 ? '#D9A050' : '#E3AE5C', { x: Math.cos(a) * rr, y: 2.8 + r * 2, z: Math.sin(a) * rr })); } }
        p.push(M.part(M.sphere(1.5, 8), '#E3AE5C', { y: 14.6 }));
        for (const [r, y, t] of [[5, 4.2, 0.25], [3.6, 8, -0.3], [2.2, 11.6, 0.2]]) p.push(M.part(M.tore(r, 0.16, TAU, 4, 16), '#F6CF6A', { y, rx: HP + t }));
        for (const [a, y, rr] of [[0.4, 3.9, 4.9], [2.2, 5.9, 4], [3.9, 7.8, 3.1], [5.3, 9.6, 2.2]]) p.push(M.part(perle(0.6, 6), BLANC, { x: Math.cos(a) * rr, y, z: Math.sin(a) * rr }));
        p.push(M.part(perle(0.9, 6), '#FF9FB2', { y: 16.2 }));
        break;
      }
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
      default: if (FRIANDISES[id]) return FRIANDISES[id](); return partsPatisserie(7); // un id inconnu : la pièce montée
    }
    return p;
  }
  // ─── les friandises de la Maison hantée (src/hantee.js, PRODUITS : 'ht-acidule'… 'ht-dragon') : même contrat que les pâtisseries
  //     (posées sur y = 0, ~16 d'envergure, un maillage en cache) ; la vitrine et les plateaux des monstres de la boutique hantée ───
  const FRIANDISES = {
    'ht-acidule': () => { const p = []; [[-4, 0, '#FF8A3D'], [4, 1.5, '#8E6BD8'], [0, -3.5, '#7CD992']].forEach(([x, z, c], k) => { p.push(M.part(M.sphere(2.6, 8), c, { x, y: 2.4, z }), M.part(M.cone(1.6, 2.4, 5), c, { x: x - 3, y: 2.4, z, rz: HP }), M.part(M.cone(1.6, 2.4, 5), c, { x: x + 3, y: 2.4, z, rz: -HP })); if (k === 0) p.push(M.part(bande(2.7, 0.8), '#FFE7C2', { x, y: 2.4, z, rz: HP })); }); return p; }, // trois bonbons dans leur papillote
    'ht-pomme': () => [M.part(M.cylindre(6, 6.6, 1.2, 14), '#F4EEE0'), M.part(M.sphere(5, 12), '#D8283F', { y: 5.6, sy: 0.92 }), M.part(galet(2.2, 8), '#FF6B7A', { x: -1.8, y: 8, z: 2.4, sy: 0.4 }), M.part(M.cylindre(0.55, 0.55, 6.5, 6), '#C9A36A', { y: 8.5 }), M.part(M.sphere(0.9, 6), '#E8384F', { x: 3.2, y: 1.6, z: 2.6, sy: 0.5 })], // la pomme d'amour sur sa collerette, un bâton, une goutte
    'ht-cookie': () => { const p = []; for (const [x, z, s] of [[-3.4, 1.2, 1], [3.6, -1, 0.85]]) { p.push(M.part(M.cylindre(5 * s, 5.2 * s, 1.8, 14), '#F4F1FF', { x, z, sz: 1.15 }), M.part(M.sphere(0.9 * s, 6), '#2B2533', { x: x - 1.6 * s, y: 1.8, z: z - 1, sy: 0.5 }), M.part(M.sphere(0.9 * s, 6), '#2B2533', { x: x + 1.6 * s, y: 1.8, z: z - 1, sy: 0.5 }), M.part(M.sphere(1.1 * s, 6), '#2B2533', { x, y: 1.8, z: z + 1.7, sy: 0.4 })); } return p; }, // deux cookies-fantômes glacés, leurs yeux et leur « bouh »
    'ht-toile': () => { const p = [M.part(M.cylindre(7, 7, 0.8, 16), '#5C4688')]; for (let k = 0; k < 4; k++) p.push(M.part(M.capsule(0.35, 13, 4), '#F6F3FF', { y: 1.1, rz: HP, ry: k * Math.PI / 4 })); for (const r of [2.4, 4.4, 6.2]) p.push(M.part(M.tore(r, 0.32, TAU, 4, 16), '#F6F3FF', { y: 1.1, rx: HP })); p.push(M.part(M.sphere(1.4, 8), '#2B2533', { x: 2.2, y: 1.9, z: 1.4 }), M.part(M.sphere(1, 8), '#2B2533', { x: 2.2, y: 2.2, z: 2.8 })); return p; }, // la toile en sucre filé sur son disque, et sa petite araignée
    'ht-potion': () => [M.part(M.sphere(4.6, 12), '#7CD992', { y: 4.4, sy: 0.95 }), M.part(M.cylindre(1.7, 2, 4.4, 10), '#7CD992', { y: 8 }), M.part(M.cylindre(1.6, 1.4, 2.4, 8), '#B07A2E', { y: 12 }), M.part(M.tore(2, 0.5, TAU, 5, 12), '#8E6BD8', { y: 9.4, rx: HP }), M.part(galet(1.6, 8), '#C6FF8F', { x: -1.6, y: 6.6, z: 3.3, sy: 0.5 })], // la potion fumante dans sa fiole ronde
    'ht-citrouille': () => { const p = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; p.push(M.part(M.sphere(4.6, 10), k % 2 ? '#F28C28' : '#FF9A3D', { x: Math.cos(a) * 3.1, y: 4.8, z: Math.sin(a) * 2.3, sy: 1.05 })); } p.push(M.part(M.cylindre(0.9, 1.2, 3, 6), '#5A7A2E', { y: 9.6 }), M.part(M.cone(1.3, 1.7, 3), '#FFE27A', { x: -2.2, y: 6.2, z: 4.6, rx: HP }), M.part(M.cone(1.3, 1.7, 3), '#FFE27A', { x: 2.2, y: 6.2, z: 4.6, rx: HP }), M.part(M.boite(5.2, 1.1, 1, 0.4), '#FFE27A', { y: 3.2, z: 4.8 })); return p; }, // la citrouille sculptée et sa grimace
    'ht-cimetiere': () => [M.part(M.boite(14, 5, 9, 1.4), '#5A3422'), M.part(M.boiteSimple(13.6, 0.8, 8.6), '#3A2014', { y: 5 }), M.part(M.boite(4.6, 6.4, 1.6, 0.8), '#B8B2C8', { x: -2.4, y: 5.6, z: -1.6 }), M.part(M.boiteSimple(2.4, 0.4, 0.3), '#6E6880', { x: -2.4, y: 9.6, z: -0.75 }), M.part(M.capsule(0.7, 3, 6), '#7CD992', { x: 3, y: 6.6, z: 1.4, rz: 0.5 }), M.part(M.capsule(0.7, 2.6, 6), '#FF9FB2', { x: 4.8, y: 6.2, z: -1.6, rz: -0.6 })], // le gâteau du cimetière : la terre en chocolat, une tombe en sucre, deux vers en gélatine
    'ht-dragon': () => { const p = [M.part(M.cylindre(6.6, 6, 2.4, 14), '#8B5A3C'), M.part(M.tore(6.3, 1.1, TAU, 5, 14), '#A8743C', { y: 2.4, rx: HP })]; for (const [x, z, c] of [[-2.6, 0.6, '#4FAF6A'], [2.8, -0.4, '#8E6BD8']]) p.push(M.part(M.sphere(3.3, 12), c, { x, y: 6, z, sy: 1.35 }), M.part(galet(0.9, 6), '#FFE27A', { x: x - 1, y: 7.6, z: z + 2.8, sy: 0.4 }), M.part(galet(0.7, 6), '#FFE27A', { x: x + 1.4, y: 5.2, z: z + 2.9, sy: 0.4 })); return p; }, // deux œufs de dragon tachetés dans leur nid
  };
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
    const mcp = /^compagnons?(?::([a-z-]+?))?(?:-(dort|assis|marche|saut))?(?:-(face|profil))?$/.exec(nom); // 'compagnons-marche', 'compagnons-assis-face', 'compagnon:dragon-marche'…
    if (mcp) { // les treize compagnons en grille (les deux chats, puis la table ESPECES), ou un seul, dans un état, de trois quarts, de face ou de profil, animés
      const ids = mcp[1] ? [mcp[1]] : ['chat-roux', 'chat-noir'].concat(Object.keys(ESPECES)), cs = [], oc = [];
      ids.forEach((id, k) => { const c = compagnon(id); c.rotation.y = mcp[3] === 'face' ? 0 : mcp[3] === 'profil' ? HP : 0.6; if (ids.length > 1) c.position.set(((k % 4) - 1.5) * 62, 0, Math.floor(k / 4) * 50 - 75); g.add(c); cs.push(c); oc.push({ etat: mcp[2] || 'assis', phase: 0, t: 0 }); });
      g.userData.anime = (E) => { for (let k = 0; k < cs.length; k++) { oc[k].t = E.t; oc[k].phase = E.t * 8; animerCompagnon(cs[k], oc[k]); } };
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
      case 'patisseries-boutique': for (let i = 8; i < 16; i++) { const m = patisserie(i); m.rotation.y = 0.35; m.position.set(60 + 90 * ((i - 8) % 4), 0, 330 + 100 * Math.floor((i - 8) / 4)); m.scale.setScalar(4.2); g.add(m); } return g; // les huit recettes de boutique, en gros plan
      case 'tous': { // sept clients et le patron ; les options d'animation sont pré-construites (aucune allocation dans anime)
        const cl = [client(-150, { coiffure: 0, haut: '#8FE3C2' }), client(-100, { coiffure: 1, lunettes: true, haut: '#C7B8FF' }), client(-50, { coiffure: 2, haut: '#FFD98A', peau: '#C68B59' }), client(0, { coiffure: 3, haut: '#9BD0FF', peau: '#8D5A3C' }), client(50, { haut: OR, cheveux: '#E0A61E', coiffure: 0, or: true }), client(100, { haut: '#5FD3A4', coiffure: 0, toque: true, tablier: true, plateau: true, produit: 3 }), client(150, { haut: '#FFB48A', coiffure: 1, sac: true })];
        const os = cl.map((c, k) => ({ dir: 0, marche: k === 6, phase: 0, sac: k === 6, or: k === 4, attend: true, plateau: k === 5, produit: 3, t: 0, blink: 0, expression: ['sourire', 'neutre', 'surpris'][k % 3] })), ob = { hop: 0, rush: true, t: 0, blink: 0, rang: 5 };
        const b = boulanger(5); b.position.set(-60, 0, -90); g.add(b);
        g.userData.anime = (E) => { for (let k = 0; k < cl.length; k++) { const oc = os[k]; oc.phase = E.t * 9; oc.t = E.t; oc.blink = E.t % 3.4; animer(cl[k], oc); } ob.t = E.t; animerBoulanger(b, ob); }; g.position.set(195, 0, 330); return g; }
      default: if (nom.startsWith('apprenti-grade-')) { p = client(0, { haut: '#5FD3A4', coiffure: 0, toque: true, tablier: true, plateau: true, produit: 1, grade: +nom.slice(15) }); o.plateau = true; o.produit = 1; }
      else if (nom.startsWith('boulanger-')) { // 'boulanger-5-or' (toque et tablier d'un métal) ou 'boulanger-5-garde:or-toque,quartier-sweat,quartier-baskets,quartier-chaine' (la garde-robe, ids de GAME.GARDEROBE)
        const [rg, tn] = nom.slice(10).split(/-(.+)/); let tenue = tn;
        if (tn && tn.startsWith('garde:') && typeof GAME !== 'undefined') { const st = GAME.newState(0), ids = tn.slice(6).split(','); for (const id of ids) { GAME.donnerVetement(st, id); const v = GAME.vetement(id); if (v) GAME.equiper(st, v.piece, id); } tenue = GAME.tenueBoulanger(st); }
        p = boulanger(+rg, tenue); g.add(p); anim = animerBoulanger; o.rang = +rg; o.rush = o.rang === 3; o.hop = o.rang === 1 ? 0.6 : 0; } else p = client(0, {});
    }
    p.rotation.y = lacet(dir); g.position.set(195, 0, 350); if (zoom) g.scale.setScalar(zoom);
    g.userData.anime = (E) => { o.t = E.t; o.blink = E.t % 3.4; if (o.marche) o.phase = 1.2 + (E.t - 0.4) * 9; anim(p, o); };
    return g;
  }
  // le chat noir d'Halloween (pendant la Maison hantée, puis au choix) : robe noire bleutée, rayures à peine plus sombres, poitrail gris, yeux jaunes
  const CHAT_NOIR = { couleur: '#2B2733', rayures: '#1F1C26', ventre: '#4A4458', yeux: '#FFD84A' };
  return { HAUTEUR, TAILLE_PATISSERIE, SAISONS, TENUES, DEGUISEMENTS, FRIANDISES: Object.keys(FRIANDISES), deguiser, METAUX_PODIUM, FORMES_HT, CHAT_NOIR, ESPECES, partsChaussure, partsChapeau, partsCape, partsCapuche, creer, animer, lacet, boulanger, animerBoulanger, chat, animerChat, libererChat, compagnon, animerCompagnon, patisserie, geoPatisserie, partsPatisserie, patisserieSaison, geoPatisserieSaison, demo };
})();
if (typeof module !== 'undefined') module.exports = PERSOS;
