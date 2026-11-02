/* LE FOURNIL — les objets des vignettes qui n'ont pas de modèle dans le jeu (global OBJ), bâtis comme les décos de src/meubles.js : des
   primitives de src/modeles.js (boîtes arrondies, cylindres, sphères, cônes, tores), des couleurs de sommets fusionnées en un maillage, la
   palette du jeu ; et, pour ce qui se lit (les cartes, le tapis), de petites toiles peintes.
   · les trophées de la boutique (GAME.TROPHEES) : un objet chacun, posé sur un socle de bois rond à plaque ; la plaque dit la difficulté
     (bronze, argent, or : le savoir-faire qu'il rapporte). Ce que le jeu a déjà en 3D sert tel quel : les pâtisseries (PERSOS.partsPatisserie),
     la coupe du podium (MEUBLES.partsCoupe), le chat (PERSOS.chat), les recettes de saison (PERSOS.geoPatisserieSaison) ;
   · les trophées de l'arrière-salle (CASINO.TROPHEES) : un objet chacun, sur un socle de feutre vert cerclé de bois ;
   · les habillages de l'arrière-salle (CASINO.SKINS) : le tapis (le feutre de sa couleur, son bourrelet de bois), le dos des cartes, la
     pile de jetons, la roue (ARRIERE.ROUE.creer : la vraie roue de la roulette, à sa finition) ; les couleurs sont celles de src/style.css ;
   · le scooter du Quartier (peint de profil dans la boutique, src/scene.js) et le pigeon voyageur de Ma chaîne (sans modèle). */
const OBJ = (() => {
  'use strict';
  const T = THREE, M = MODELES, TAU = Math.PI * 2, HP = Math.PI / 2, L = '#4A3328';
  const P = (geo, col, o) => M.part(geo, col, o), bo = (w, h, d, r) => M.boite(w, h, d, r), bs = (w, h, d) => M.boiteSimple(w, h, d);
  const cyl = (rh, rb, h, n) => M.cylindre(rh, rb, h, n || 14), sph = (r, n) => M.sphere(r, n || 12), cone = (r, h, n) => M.cone(r, h, n || 12), tore = (R, r, arc, n, m) => M.tore(R, r, arc || TAU, n || 6, m || 18), caps = (r, l, n) => M.capsule(r, l, n || 8);
  const OR = ['#FFC84A', '#D4921A', '#FFF2C2'], ARGENT = ['#C9D3DE', '#7F8FA3', '#FFFFFF'], BRONZE = ['#D98C52', '#9E5A2A', '#F8D6B6'];
  const grp = (...o) => { const g = new T.Group(); for (const x of o) if (x) g.add(x); return g; };
  const maille = (pr) => M.maille(pr.filter(Boolean));
  // une étoile (extrudée, à facettes douces), un cœur, une forme quelconque : en cache par clé
  const formes = new Map();
  function forme(cle, f, prof, biseau) { let g = formes.get(cle); if (!g) { g = new T.ExtrudeGeometry(f(), { depth: prof, bevelEnabled: true, bevelThickness: biseau, bevelSize: biseau, bevelSegments: 2, curveSegments: 6 }); g.center(); g.computeVertexNormals(); g.userData.cache = true; formes.set(cle, g); } return g; }
  const etoile = (R, prof) => forme('etoile|' + R + '|' + prof, () => { const s = new T.Shape(); for (let k = 0; k < 10; k++) { const r = k % 2 ? R * 0.45 : R, a = HP + k * Math.PI / 5; if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return s; }, prof, Math.min(0.6, R * 0.12));
  const coeur = (R, prof) => forme('coeur|' + R + '|' + prof, () => { const s = new T.Shape(), k = R / 10; s.moveTo(0, -9 * k); s.bezierCurveTo(-3 * k, -6 * k, -10 * k, -2 * k, -10 * k, 3 * k); s.bezierCurveTo(-10 * k, 8 * k, -4 * k, 10 * k, 0, 6 * k); s.bezierCurveTo(4 * k, 10 * k, 10 * k, 8 * k, 10 * k, 3 * k); s.bezierCurveTo(10 * k, -2 * k, 3 * k, -6 * k, 0, -9 * k); return s; }, prof, Math.min(0.6, R * 0.1));
  const eclair = (R, prof) => forme('eclair|' + R + '|' + prof, () => { const s = new T.Shape(), k = R / 10; [[2, 10], [-6, -1], [-0.5, -1], [-3, -10], [6, 2], [0.5, 2], [4, 10]].forEach(([x, y], i) => (i ? s.lineTo(x * k, y * k) : s.moveTo(x * k, y * k))); s.closePath(); return s; }, prof, Math.min(0.5, R * 0.06));
  const coche = (R, prof) => forme('coche|' + R + '|' + prof, () => { const s = new T.Shape(), k = R / 10; [[-9, 1], [-5, 5], [-2, 1.5], [6, 10], [10, 6], [-2, -7]].forEach(([x, y], i) => (i ? s.lineTo(x * k, y * k) : s.moveTo(x * k, y * k))); s.closePath(); return s; }, prof, Math.min(0.5, R * 0.06));
  // une toile peinte (en cache), posée sur un plan : les cartes, le tapis, les journaux
  const toiles = new Map();
  function toile(cle, w, h, peindre) { let t = toiles.get(cle); if (!t) { t = M.texture(peindre, w, h); t.userData.partagee = true; toiles.set(cle, t); } return t; }
  const plan = (w, h, tex, o) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: tex, transparent: false, alphaTest: 0.5 })); if (o) m.applyMatrix4(M.matrice(o)); return m; };

  // ═══ les socles ═══
  const TIERS = (xp) => (xp >= 80 ? OR : xp >= 40 ? ARGENT : BRONZE); // (le savoir-faire du trophée : 10 à 30 bronze, 40 à 60 argent, 80 et plus or)
  function socle(metal, casino) {
    const m = metal || OR, pr = [];
    if (casino) pr.push(P(cyl(10, 10.6, 2, 28), '#4E3122'), P(cyl(9.2, 9.6, 1.4, 28), '#7A4E33', { y: 2 }), P(cyl(8.4, 8.4, 0.5, 28), '#2E8C63', { y: 3.4 }));
    else pr.push(P(cyl(10, 10.6, 2, 28), '#6B4A3A'), P(cyl(9.2, 9.6, 1.6, 28), '#8B5A3C', { y: 2 }));
    pr.push(P(bo(6.4, 1.8, 1, 0.3), m[0], { y: 0.9, z: 9.9, rx: -0.05 }), P(bs(4.2, 0.35, 0.3), m[1], { y: 1.65, z: 10.35 }));
    return { pr, y: casino ? 3.9 : 3.6 };
  }

  // ═══ des pièces qui servent à plusieurs trophées ═══
  const baguette = (x, y, z, o) => { const l = (o && o.l) || 20, pr = [P(caps(2.4, l, 10), '#E8B46A', { x, y, z, rz: (o && o.rz) != null ? o.rz : HP, ry: (o && o.ry) || 0 })]; return pr; };
  function toque(x, y, z, s, o) { // la toque blanche (bandeau, bouffant) ; o.galon : un galon d'or ; o.etoile : l'étoile du grade 3
    o = o || {}; const pr = [P(cyl(3 * s, 3.1 * s, 4 * s, 16), '#FFFFFF', { x, y, z }), P(sph(3.9 * s, 14), '#FFFFFF', { x, y: y + 5.2 * s, z, sy: 0.72 })];
    for (const [dx, dz] of [[-1.8, 0], [1.8, 0], [0, 1.6], [0, -1.6]]) pr.push(P(sph(2.3 * s, 10), '#F7F3EC', { x: x + dx * s, y: y + 5.6 * s, z: z + dz * s }));
    if (o.galon) pr.push(P(cyl(3.18 * s, 3.18 * s, 1.1 * s, 16), o.galon, { x, y: y + 0.4 * s, z }));
    if (o.etoile) pr.push(P(etoile(1.5 * s, 0.6 * s), o.etoile, { x, y: y + 2.2 * s, z: z + 3.15 * s }));
    return pr;
  }
  const tourne = (pr, a) => { const m = new T.Matrix4().makeRotationY(a); for (const p of pr) p.m = m.clone().multiply(p.m || new T.Matrix4()); return pr; }; // (des pièces tournées autour de l'axe du socle)
  const piece = (x, y, z, r, col) => [P(cyl(r, r, r * 0.32, 18), (col || OR)[0], { x, y, z }), P(cyl(r * 0.72, r * 0.72, r * 0.36, 18), (col || OR)[2], { x, y: y + 0.02, z })]; // une pièce (de monnaie), à plat
  const patisserie = (i, x, y, z, s, ry) => PERSOS.partsPatisserie(i).map((p) => ({ geo: p.geo, col: p.col, vc: p.vc, m: new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry || 0, 0)), new T.Vector3(s, s, s)).multiply(p.m || new T.Matrix4()) }));
  function medaille(x, y, z, r, metal, ruban, emb) { // une médaille pendue à son ruban en V (face à +z) ; emb : ce qu'elle porte (des parts, centrées sur sa face)
    const m = metal || OR, pr = [];
    for (const sx of [-1, 1]) pr.push(P(bo(r * 0.75, r * 1.9, 0.6, 0.2), sx < 0 ? ruban[0] : ruban[1] || ruban[0], { x: x + sx * r * 0.42, y: y + r * 0.55, z: z - 0.4, rz: sx * 0.38 }));
    pr.push(P(cyl(r, r, 1.4, 22), m[0], { x, y: y, z, rx: HP }), P(tore(r * 0.86, 0.32, TAU, 5, 22), m[1], { x, y, z: z + 0.75 }), P(sph(r * 0.18, 6), m[2], { x: x - r * 0.45, y: y + r * 0.45, z: z + 0.8, sz: 0.3 }));
    if (emb) pr.push(...emb);
    return pr;
  }
  const boutique = (x, y, z, s, aw) => { // une petite boutique : murs crème, toit, store rayé, porte et vitrine
    const pr = [P(bo(12 * s, 9 * s, 9 * s, 0.6 * s), '#FFF4E2', { x, y, z }), P(bo(13.4 * s, 1.6 * s, 10.4 * s, 0.5 * s), '#8B5A3C', { x, y: y + 9 * s, z }), P(cone(8.6 * s, 4.2 * s, 4), aw[1] || '#D9534F', { x, y: y + 10.6 * s, z, ry: Math.PI / 4, sz: 0.78 })];
    for (let k = 0; k < 4; k++) pr.push(P(bo(3 * s, 1.4 * s, 2.6 * s, 0.4 * s), k % 2 ? '#FFFFFF' : aw[0], { x: x + (-4.5 + k * 3) * s, y: y + 6.2 * s, z: z + 5 * s, rx: 0.5 }));
    pr.push(P(bo(3 * s, 5 * s, 0.6 * s, 0.3 * s), '#8B5A3C', { x: x + 3 * s, y, z: z + 4.6 * s }), P(bo(4.4 * s, 3.4 * s, 0.6 * s, 0.3 * s), '#9ED8FF', { x: x - 2.6 * s, y: y + 1.4 * s, z: z + 4.6 * s }));
    return pr;
  };

  // ═══ les cartes à jouer (les enseignes et les figures de src/arriere.js) ═══
  const ENS = ['M12 2.6C9.4 5.6 3 9.6 3 14.1c0 2.6 2 4.5 4.5 4.5 1.5 0 2.8-.7 3.6-1.9-.2 1.9-.9 3.3-2.3 4.7h6.4c-1.4-1.4-2.1-2.8-2.3-4.7.8 1.2 2.1 1.9 3.6 1.9 2.5 0 4.5-1.9 4.5-4.5 0-4.5-6.4-8.5-9-11.5z',
    'M12 21.2S2.6 15.3 2.6 9c0-2.9 2.2-5.2 5-5.2 1.9 0 3.5 1 4.4 2.6.9-1.6 2.5-2.6 4.4-2.6 2.8 0 5 2.3 5 5.2 0 6.3-9.4 12.2-9.4 12.2z',
    'M12 2.4c2.3 3.5 5 6.6 8.2 9.6-3.2 3-5.9 6.1-8.2 9.6-2.3-3.5-5-6.6-8.2-9.6 3.2-3 5.9-6.1 8.2-9.6z', null];
  function enseigne(x, s, cx, cy, k) { // une enseigne (0 pique, 1 cœur, 2 carreau, 3 trèfle) dans un carré de 24 × k, centrée sur (cx, cy)
    x.save(); x.translate(cx - 12 * k, cy - 12 * k); x.scale(k, k); x.fillStyle = s === 1 || s === 2 ? '#E1496C' : '#3A2A22';
    if (ENS[s]) x.fill(new Path2D(ENS[s])); else { for (const [a, b] of [[12, 7.3], [7, 13.4], [17, 13.4]]) { x.beginPath(); x.arc(a, b, 4.3, 0, TAU); x.fill(); } x.fill(new Path2D('M12 11.5c0 4.3-1.1 7-3.3 9.8h6.6c-2.2-2.8-3.3-5.5-3.3-9.8z')); }
    x.restore();
  }
  const arrondi = (x, w, h, r) => { x.beginPath(); x.roundRect(0, 0, w, h, r); };
  const FIG = { V: ['#EFEAFF', '#9A84F0'], D: ['#FFE9EE', '#FF6B8B'], R: ['#FFF3C4', '#E0A61E'] };
  function texCarte(rang, s) {
    return toile(`carte|${rang}|${s}`, 140, 196, (x, w, h) => {
      x.clearRect(0, 0, w, h); arrondi(x, w, h, 16); x.fillStyle = '#FFFDF8'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#E6D9CB'; x.stroke();
      const coul = s === 1 || s === 2 ? '#E1496C' : '#3A2A22'; x.fillStyle = coul; x.font = '700 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(rang, 26, 28); enseigne(x, s, 26, 58, 1.05);
      x.save(); x.translate(w, h); x.rotate(Math.PI); x.fillText(rang, 26, 28); enseigne(x, s, 26, 58, 1.05); x.restore();
      if (FIG[rang]) { x.fillStyle = FIG[rang][0]; x.strokeStyle = FIG[rang][1]; x.lineWidth = 5; x.beginPath(); x.roundRect(40, 50, 60, 96, 12); x.fill(); x.stroke(); x.fillStyle = coul; x.font = '700 46px sans-serif'; x.fillText(rang, 70, 86); enseigne(x, s, 70, 124, 1); }
      else enseigne(x, s, w / 2, h / 2 + 4, rang === 'A' ? 3.2 : 2.4);
    });
  }
  const DOS = { // le dos des cartes (src/style.css : --dos, --dos-trait, --dos-motif, --dos-coeur)
    classique: { dos: '#FF8FA6', trait: '#E1496C', motif: 'rgba(255,255,255,.26)', coeur: '#FFC84A' }, or: { dos: '#E7BE4E', trait: '#A87A16', motif: 'rgba(255,250,220,.34)', coeur: '#FFF3C4' },
    fournil: { dos: '#F0D2A0', trait: '#B9732A', motif: 'rgba(185,115,42,.16)', coeur: '#E8A54A' }, damier: { dos: '#B8A6FF', trait: '#7E66E0', motif: 'rgba(255,255,255,.34)', coeur: '#FFFDF8' },
  };
  function texDos(id) {
    const d = DOS[id] || DOS.classique;
    return toile('dos|' + id, 140, 196, (x, w, h) => {
      x.clearRect(0, 0, w, h); arrondi(x, w, h, 16); x.save(); x.clip(); x.fillStyle = d.dos; x.fillRect(0, 0, w, h); x.fillStyle = d.motif;
      if (id === 'damier') { for (let i = 0; i * 18 < w; i++) for (let j = 0; j * 18 < h; j++) if ((i + j) % 2 === 0) x.fillRect(i * 18, j * 18, 18, 18); }
      else { x.lineWidth = 6; x.strokeStyle = d.motif; for (let k = -h; k < w + h; k += 16) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + h, h); x.stroke(); x.beginPath(); x.moveTo(k + h, 0); x.lineTo(k, h); x.stroke(); } }
      x.restore(); x.lineWidth = 8; x.strokeStyle = '#FFFDF8'; arrondi(x, w, h, 16); x.save(); x.clip(); x.lineWidth = 16; x.stroke(); x.restore(); x.lineWidth = 3.5; x.strokeStyle = d.trait; x.beginPath(); x.roundRect(8, 8, w - 16, h - 16, 10); x.stroke();
      x.fillStyle = d.coeur; x.strokeStyle = '#FFFDF8'; x.lineWidth = 7; x.beginPath(); if (id === 'fournil') x.ellipse(w / 2, h / 2, 30, 26, 0, 0, TAU); else x.arc(w / 2, h / 2, 29, 0, TAU); x.stroke(); x.fill(); x.lineWidth = 3.5; x.strokeStyle = d.trait; x.beginPath(); if (id === 'fournil') x.ellipse(w / 2, h / 2, 34, 30, 0, 0, TAU); else x.arc(w / 2, h / 2, 33, 0, TAU); x.stroke();
      if (id === 'fournil') { x.strokeStyle = 'rgba(122,70,30,.5)'; x.lineWidth = 3; for (const dx of [-12, 0, 12]) { x.beginPath(); x.moveTo(w / 2 + dx - 5, h / 2 - 9); x.lineTo(w / 2 + dx + 5, h / 2 + 9); x.stroke(); } }
    });
  }
  // une carte : une plaque arrondie (sa tranche crème), la face peinte devant, le dos peint derrière ; debout, face à +z, le bas sur y = 0
  function carte(rang, s, o) {
    o = o || {}; const w = 14, h = 19.6, g = new T.Group();
    g.add(M.maille([P(bo(w, h, 0.5, 1.4), '#F3E9DC')]), plan(w - 0.2, h - 0.2, texCarte(rang, s), { y: h / 2, z: 0.27 }), plan(w - 0.2, h - 0.2, texDos(o.dos || 'classique'), { y: h / 2, z: -0.27, ry: Math.PI }));
    g.applyMatrix4(M.matrice(o)); return g;
  }
  function carteDos(id, o) { const w = 14, h = 19.6, g = new T.Group(); g.add(M.maille([P(bo(w, h, 0.5, 1.4), '#F3E9DC')]), plan(w - 0.2, h - 0.2, texDos(id), { y: h / 2, z: 0.27 }), plan(w - 0.2, h - 0.2, texDos(id), { y: h / 2, z: -0.27, ry: Math.PI })); g.applyMatrix4(M.matrice(o || {})); return g; }
  // un jeton : le disque, le liseré clair du dessus, les tirets du bord (src/style.css : --c, --c2, --bord)
  const JETONS = {
    classique: [['#5FD3A4', '#3FB889'], ['#6CB8FF', '#3E8FD6'], ['#B8A6FF', '#9A84F0'], ['#FF6B8B', '#E1496C']], bord: { classique: '#FFFFFF', nacre: '#B4A0C8', pastel: '#8C6F62' },
    nacre: [['#F4F1EC', '#C9C2B8'], ['#EEF3FA', '#C9C2B8'], ['#F3EEFA', '#C9C2B8'], ['#FAEEF0', '#D8B7BE']], pastel: [['#FFD3B8', '#E8A985'], ['#CDE8FF', '#93C4EC'], ['#E3DAFF', '#B3A2EA'], ['#FFC9D4', '#E897A8']],
  };
  function jeton(x, y, z, cols, bord, o) { // (o.s : sa taille, 1 : celle des piles ; o.a : le tour de ses tirets)
    const k = (o && o.s) || 1, r = 6 * k, h = 1.7 * k, pr = [P(cyl(r, r, h, 24), cols[0], { x, y, z }), P(cyl(r * 0.98, r * 0.98, 0.25, 24), cols[1], { x, y: y - 0.05, z }), P(tore(r * 0.58, 0.22, TAU, 4, 22), '#FFFFFF', { x, y: y + h + 0.02, z, rx: HP })];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + ((o && o.a) || 0); pr.push(P(bs(1.7, 1.76, 0.5), bord, { x: x + Math.cos(a) * (r - 0.1 * k), y: y - 0.03 * k, z: z + Math.sin(a) * (r - 0.1 * k), ry: -a + HP, s: k })); }
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU + ((o && o.a) || 0); pr.push(P(bs(1.1, 0.12, 0.8), bord, { x: x + Math.cos(a) * (r - 0.8 * k), y: y + h, z: z + Math.sin(a) * (r - 0.8 * k), ry: -a + HP, s: k })); }
    return pr;
  }
  const pile = (x, z, n, set, y0) => { const pr = [], S = JETONS[set] || JETONS.classique, b = JETONS.bord[set] || '#FFFFFF'; for (let k = 0; k < n; k++) pr.push(...jeton(x + Math.sin(k * 2.1) * 0.35, (y0 || 0) + k * 1.8, z + Math.cos(k * 1.7) * 0.35, S[k % 4], b, { a: k * 0.35 })); return pr; };

  // ═══ les trophées de la boutique (GAME.TROPHEES) : un objet chacun, sur son socle ═══
  const TB = {
    premiere: (y) => [P(bo(10, 1, 16, 0.45), '#C8864F', { y, z: 1.4, ry: -0.6 }), P(bo(2.4, 1, 10, 0.45), '#A86E3C', { x: Math.sin(-0.6) * -12.6, y, z: 1.4 + Math.cos(-0.6) * -12.6, ry: -0.6 }), ...patisserie(0, 0, y + 1, 1.4, 0.95, -0.6 + HP)], // la baguette sur sa pelle
    cent: (y) => { const pr = [P(cyl(7.4, 6, 7, 18), '#C8864F', { y }), P(tore(7.4, 0.9, TAU, 6, 20), '#A86E3C', { y: y + 7, rx: HP }), P(cyl(6.8, 6.8, 0.6, 18), '#8B5A3C', { y: y + 6.2 })]; for (let k = 0; k < 5; k++) pr.push(P(bs(0.5, 6.2, 0.4), '#E8B46A', { x: Math.cos(k / 5 * TAU) * 7, y: y + 0.4, z: Math.sin(k / 5 * TAU) * 7 })); for (const [x, z, a, l] of [[-3.2, -1.6, 0.42, 14], [0.2, -2.4, 0.06, 16], [3.4, -1.2, -0.38, 13]]) pr.push(P(caps(1.7, l, 10), '#E8B46A', { x: x - Math.sin(a) * (l / 2 + 2), y: y + 6 + Math.cos(a) * (l / 2 + 2), z, rz: a }), P(bs(1.6, 0.4, 1.2), '#C88A3E', { x: x - Math.sin(a) * (l / 2 + 4), y: y + 6 + Math.cos(a) * (l / 2 + 4), z: z + 1.5, rz: a + 0.5 })); pr.push(...patisserie(1, -1.5, y + 6.6, 3.6, 0.85, 0.3)); return pr; }, // le panier de pains
    dixmille: (y) => { const pr = [P(bo(14, 15, 9, 3.6), '#F4EEE2', { y }), P(bo(14.4, 2.6, 9.4, 1.1), '#2B5BD7', { y: y + 4.5 }), P(bo(9, 3, 6, 1.4), '#F4EEE2', { y: y + 14.2 }), P(tore(2.4, 0.5, TAU, 5, 12), '#C8864F', { y: y + 16.2, rx: HP, sz: 0.7 })]; for (let k = 0; k < 5; k++) pr.push(P(sph(0.9, 6), '#E0A61E', { x: -0.9 + (k % 2) * 1.8, y: y + 8.6 + k * 1.1, z: 4.7, sz: 0.4, sy: 1.4 })); pr.push(P(bs(0.35, 6.4, 0.3), '#C8864F', { y: y + 7.6, z: 4.65 })); return pr; }, // le sac de farine (un épi de blé)
    million: (y) => [...MEUBLES.partsCoupe('or', 1.15, 0, y, 0), ...piece(-7.5, y, 4.5, 2.6), ...piece(7, y, 4, 2.4), ...piece(5.6, y + 0.9, 6.4, 2.2), P(etoile(3.6, 1.2), OR[0], { y: y + 24.4 })], // la grande coupe d'or et ses pièces
    equipe: (y) => [...toque(-4, y, -2.5, 1), ...toque(4, y, -2.5, 1), ...toque(0, y, 3.2, 1.05)], // trois toques
    'grande-equipe': (y) => [...toque(-6.2, y, -3, 0.85, { galon: '#FFC84A' }), ...toque(0, y, -3.6, 0.85, { galon: '#FFC84A' }), ...toque(6.2, y, -3, 0.85, { galon: '#FFC84A' }), ...toque(-3.2, y, 3.2, 0.9, { galon: '#FFC84A' }), ...toque(3.2, y, 3.2, 0.9, { galon: '#FFC84A' })], // cinq toques galonnées
    livreur: (y) => { const pr = [P(bo(14, 10, 11, 0.8), '#D9A86C', { y }), P(bs(14.3, 0.4, 2), '#E1496C', { y: y + 9.85 }), P(bs(2, 0.4, 11.3), '#E1496C', { y: y + 9.85 }), P(bs(2, 9.6, 0.4), '#E1496C', { y: y + 0.2, z: 5.6 }), P(bs(0.4, 9.6, 2), '#E1496C', { x: 7.05, y: y + 0.2 })]; pr.push(P(sph(1.8, 8), '#E1496C', { x: -1.6, y: y + 10.8, sx: 1.4, sz: 0.7, rz: 0.5 }), P(sph(1.8, 8), '#E1496C', { x: 1.6, y: y + 10.8, sx: 1.4, sz: 0.7, rz: -0.5 }), P(sph(0.9, 8), '#C93A5A', { y: y + 10.6 }), P(bo(4.4, 2.8, 0.3, 0.2), '#FFFFFF', { x: -3.6, y: y + 3, z: 5.6 })); for (const p of pr) p.m = new T.Matrix4().makeRotationY(0.15).multiply(p.m); return pr; }, // le colis et son ruban noué
    traiteur: (y) => [P(cyl(10, 9, 1, 26), '#E6EBF0', { y }), P(cyl(7.6, 7.6, 0.8, 26), '#C9D3DE', { y: y + 1 }), P(sph(7.4, 22), '#DDE4EC', { y: y + 1.4, sy: 0.82 }), P(sph(1.6, 10), '#A9B6C4', { y: y + 7.8 }), P(cyl(0.6, 0.8, 1, 8), '#A9B6C4', { y: y + 7.4 }), P(sph(1.1, 6), '#FFFFFF', { x: -3.2, y: y + 5.4, z: 4.4, sx: 0.6, sy: 2.4, sz: 0.4, rz: 0.5 })], // la cloche de service
    presse: (y) => { const pr = [P(bo(15, 1.6, 19, 0.3), '#F4F0E6', { y, ry: -0.25 }), P(bo(14, 1.2, 18, 0.3), '#FFFFFF', { y: y + 1.6, ry: -0.18 }), P(bs(11, 0.3, 3), '#E1496C', { y: y + 2.75, z: -6, ry: -0.18 })]; for (let k = 0; k < 6; k++) pr.push(P(bs(k % 3 === 2 ? 5 : 10, 0.25, 0.9), '#B5A49A', { x: k % 3 === 2 ? -2.4 : 0, y: y + 2.75, z: -1.8 + k * 1.9, ry: -0.18 })); pr.push(P(etoile(4, 1), OR[0], { x: 5.4, y: y + 6.8, z: 6.6, rx: -0.35 })); return pr; }, // le journal et son étoile
    etoile: (y) => [P(cyl(7, 6.6, 0.9, 26), '#FFFFFF', { y, z: 2.5 }), P(tore(5.6, 0.35, TAU, 4, 26), '#E6DDD1', { y: y + 0.95, z: 2.5, rx: HP }), P(bo(0.9, 0.5, 9, 0.2), '#C9D3DE', { x: -8.2, y, z: 2.5 }), P(bo(0.9, 0.5, 9, 0.2), '#C9D3DE', { x: 8.2, y, z: 2.5 }), P(etoile(7.5, 1.6), OR[0], { y: y + 12, z: -3.5 }), P(cyl(0.6, 0.6, 5, 8), OR[1], { y, z: -3.5 })], // l'assiette, les couverts, l'étoile
    bras: (y) => [P(sph(6.6, 16), '#F6E7C8', { y: y + 4.2, sy: 0.62, sx: 1.15 }), P(caps(2, 18, 12), '#D9A86C', { y: y + 9.2, rz: HP, ry: 0.35 }), P(caps(1.1, 4.6, 8), '#A86E3C', { x: Math.cos(0.35) * 12.6, y: y + 9.2, z: -Math.sin(0.35) * 12.6, rz: HP, ry: 0.35 }), P(caps(1.1, 4.6, 8), '#A86E3C', { x: -Math.cos(0.35) * 12.6, y: y + 9.2, z: Math.sin(0.35) * 12.6, rz: HP, ry: 0.35 }), P(sph(0.8, 6), '#FFFFFF', { x: -3, y: y + 7.6, z: 5.6, sz: 0.3 })], // le pâton et le rouleau
    eclair: (y) => [P(eclair(10, 2.2), '#FFC84A', { y: y + 10.4, x: -2 }), ...patisserie(4, 5.5, y, 4, 0.8, 0.5)], // l'éclair jaune, et un éclair au chocolat
    bricoleur: (y) => [P(bo(3, 18, 1.4, 0.6), '#A9B6C4', { x: -1, y: y + 1.5, rz: -0.55 }), P(tore(3.2, 1.3, Math.PI * 1.45, 6, 14), '#A9B6C4', { x: -1 + Math.sin(0.55) * 18.6, y: y + 1.5 + Math.cos(0.55) * 18.6, rz: 0.17 - 0.55 }), P(bo(2.2, 13, 1.6, 0.6), '#C8864F', { x: 2.5, y: y + 1, rz: 0.55 }), P(bo(7, 3, 3, 0.8), '#7F8FA3', { x: 2.5 - Math.sin(0.55) * 14, y: y + 1 + Math.cos(0.55) * 14, rz: 0.55 })], // la clé et le marteau croisés
    mystere: (y) => [...piece(3, y, 3.5, 4), ...piece(-4.5, y, 5, 2.8), P(tore(5.2, 1, TAU, 8, 26), OR[0], { x: -1.2, y: y + 11.6, z: -0.5, rx: 0.15 }), P(cyl(4.5, 4.5, 0.6, 24), '#BFE3F7', { x: -1.2, y: y + 11.6, z: -0.5, rx: HP + 0.15 }), P(caps(1.2, 7, 8), '#8B5A3C', { x: 4.6, y: y + 4.6, z: -0.7, rz: 0.7 }), P(sph(0.8, 6), '#FFFFFF', { x: -3, y: y + 13.6, z: 0.4, sz: 0.3 })], // la loupe et les pièces
    genereux: (y) => { const pr = [P(cyl(6.2, 6, 13, 20), '#CFE9FA', { y }), P(cyl(5.2, 5.2, 1.8, 20), '#E1496C', { y: y + 13 }), P(tore(6.1, 0.6, TAU, 5, 20), '#B9DCF2', { y: y + 12.6, rx: HP }), P(bs(0.7, 9, 0.3), '#FFFFFF', { x: -3.8, y: y + 2, z: 4.6 })]; for (let k = 0; k < 9; k++) pr.push(...piece(Math.cos(k * 2.4) * 2.6, y + 0.6 + k * 0.95, Math.sin(k * 2.4) * 2.6, 2.4)); pr.push(P(coeur(3, 0.8), '#FF6B8B', { y: y + 7, z: 6.1 })); return pr; }, // le pot à pourboires
    etoiles10: (y) => [P(etoile(9, 2.4), OR[0], { y: y + 12 }), P(cyl(0.8, 1.6, 3.4, 10), OR[1], { y })], // une étoile
    etoiles100: (y) => [P(etoile(7, 2), OR[0], { y: y + 13 }), P(etoile(4.4, 1.6), OR[0], { x: -8.2, y: y + 6.2, z: 1.5, rz: 0.3 }), P(etoile(4.4, 1.6), OR[0], { x: 8.2, y: y + 6.2, z: 1.5, rz: -0.3 }), P(cyl(0.8, 1.6, 6, 10), OR[1], { y })], // trois étoiles
    etoiles1000: (y) => { const pr = [P(etoile(7.2, 2.2), OR[0], { y: y + 11 }), P(cyl(0.8, 1.6, 3.4, 10), OR[1], { y })]; for (let k = 0; k < 14; k++) { const a = -0.25 + k / 13 * (Math.PI + 0.5); pr.push(P(sph(1.5, 6), k % 2 ? '#7FD08C' : '#5FB27A', { x: Math.cos(a) * 9.5, y: y + 11 - Math.sin(a) * 9.5 + 1, z: -0.4, sx: 0.6, sy: 1.4, rz: a + HP })); } for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; pr.push(P(etoile(1.4, 0.5), OR[2], { x: Math.cos(a) * 12.5, y: y + 11 + Math.sin(a) * 12.5 * 0.85, z: 1 })); } return pr; }, // l'étoile dans sa couronne de laurier
    boutique2: (y) => boutique(0, y, 0, 1.15, ['#FF6B8B', '#D9534F']), // une boutique
    boutique5: (y) => [...boutique(-6.6, y, -3.2, 0.62, ['#5FD3A4', '#3FB889']), ...boutique(6.6, y, -3.2, 0.62, ['#B8A6FF', '#9A84F0']), ...boutique(0, y, 3.6, 0.7, ['#FF6B8B', '#D9534F'])], // trois boutiques
    boutique10: (y) => { // la petite planète, et ses boutiques posées dessus
      const R = 8.6, c = new T.Vector3(0, y + R + 0.4, 0), pr = [P(sph(R, 22), '#5FB2E6', { y: c.y }), P(sph(4.6, 10), '#7FD08C', { x: 3, y: c.y + 4.6, z: 3, sy: 0.6 }), P(sph(4, 10), '#7FD08C', { x: -5, y: c.y, z: 4.6, sx: 0.6 }), P(sph(3.6, 10), '#7FD08C', { x: 2, y: c.y - 2, z: -6.6, sz: 0.6 })];
      for (const [x, yy, z, col] of [[0.3, 1, 0.5, '#FF6B8B'], [-0.7, 0.6, 0.6, '#5FD3A4'], [0.8, 0.3, 0.7, '#B8A6FF'], [-0.2, 0.25, 1, '#FFC84A']]) {
        const n = new T.Vector3(x, yy, z).normalize(), m = new T.Matrix4().compose(c.clone().addScaledVector(n, R - 0.4), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), n), new T.Vector3(1, 1, 1));
        for (const p of boutique(0, 0, 0, 0.32, [col])) { p.m = m.clone().multiply(p.m || new T.Matrix4()); pr.push(p); }
      }
      return pr;
    },
    semaine: (y) => { const pr = [P(bo(14, 15, 3, 0.8), '#FFFDF5', { y, rx: -0.12 }), P(bo(14.4, 3.4, 3.4, 1), '#E1496C', { y: y + 13.4, z: -0.2, rx: -0.12 })]; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) pr.push(P(bs(2, 1.6, 0.3), '#E6DDD1', { x: -4.8 + c * 3.2, y: y + 2.4 + r * 3.2 + Math.sin(0.12) * 1.5, z: 1.6 - (2.4 + r * 3.2) * 0.12, rx: -0.12 })); for (const x of [-4, 4]) pr.push(P(tore(1.1, 0.35, TAU, 4, 10), '#A9B6C4', { x, y: y + 16.6, z: -0.3, ry: HP })); pr.push(P(coche(7, 1.6), '#3FB889', { y: y + 8.2, z: 3.4, rx: -0.12 })); return pr; }, // le calendrier coché
    defi: (y) => [P(cyl(0.6, 0.7, 22, 8), '#8B5A3C', { y }), P(sph(1, 8), OR[0], { y: y + 22.4 }), P(bo(11, 7, 0.5, 0.2), '#FF6B8B', { x: 5.8, y: y + 14.4 }), P(bo(4, 7.1, 0.6, 0.2), '#FFFFFF', { x: 5, y: y + 14.4 }), P(cone(2.6, 2.4, 10), '#F4EEE2', { y, sy: 0.6 })], // le fanion planté
    piece: (y) => patisserie(7, 0, y, 0, 1.25, 0.3), // la pièce montée
    'recette-boutique': (y) => [P(cyl(8.4, 8, 0.8, 26), '#FFFFFF', { y }), ...patisserie(8, 0, y + 0.8, 0, 1.3, 0.3)], // le Paris-Brest
    carte: (y) => { const pr = [P(bs(1.4, 0.3, 9), '#FFC84A', { x: 0.6, y: y + 1.9, z: 3.5 })]; for (const sx of [-1, 1]) { pr.push(P(bo(10, 1, 14, 0.3), '#B03A4E', { x: sx * 5.2, y, rz: sx * 0.1 }), P(bo(9.2, 0.8, 13, 0.3), '#FFFDF5', { x: sx * 5, y: y + 0.9, rz: sx * 0.1 })); for (let k = 0; k < 5; k++) pr.push(P(bs(k === 0 ? 5 : 7, 0.2, 0.8), k === 0 ? '#E1496C' : '#B5A49A', { x: sx * 5, y: y + 1.75 + 0.5 * 0.1 * 5, z: -4.8 + k * 2.4, rz: sx * 0.1 })); } return pr; }, // le livre de recettes ouvert
    franchise: (y) => [P(bo(15, 3.6, 12, 1.6), '#D9534F', { y }), P(sph(1, 6), '#FFC84A', { x: -7.2, y: y + 3.4, z: -5.6 }), P(sph(1, 6), '#FFC84A', { x: 7.2, y: y + 3.4, z: 5.6 }), P(tore(2.6, 0.9, TAU, 6, 16), OR[0], { x: -4.2, y: y + 4.4, z: 0, rx: HP }), P(bo(10, 1.4, 1.4, 0.4), OR[0], { x: 2.8, y: y + 3.7 }), P(bs(1.4, 1.2, 2.2), OR[0], { x: 5.4, y: y + 3.6, z: 1.2 }), P(bs(1.4, 1.2, 1.6), OR[0], { x: 7.2, y: y + 3.6, z: 0.9 })], // la clé d'or sur son coussin
    compagnon: (y) => tourne(medaille(0, y + 11, 0, 7, ARGENT, ['#E1496C', '#C93A5A'], toque(0, y + 8.2, 1.6, 0.72)), 0.4), // la médaille du Compagnon, son ruban rouge, la toque
    mof: (y) => tourne(medaille(0, y + 11, 0, 7, OR, ['#2B5BD7', '#E1496C'], [P(bs(3, 12, 0.7), '#FFFFFF', { y: y + 13.2, z: -0.5 }), P(etoile(3.6, 0.8), '#FFFFFF', { y: y + 11, z: 0.9 })]), 0.4), // le col bleu-blanc-rouge et sa médaille
    fidele: (y) => [P(cyl(7, 6.4, 0.8, 24), '#FFFFFF', { y }), P(cyl(4.6, 3.6, 6.4, 20), '#FF9FB2', { y: y + 0.8 }), P(cyl(3.9, 3.9, 0.4, 20), '#6B4A3A', { y: y + 6.9 }), P(tore(2.3, 0.7, Math.PI * 1.2, 6, 12), '#FF9FB2', { x: 4.6, y: y + 4, rz: -HP - 0.6 }), P(coeur(3.6, 1), '#E1496C', { y: y + 13.2 })], // la tasse de l'habitué, un cœur
    salon: (y) => [P(sph(6.6, 18), '#5FD3A4', { y: y + 5.6, sy: 0.82 }), P(cyl(3.4, 4.4, 1.6, 16), '#5FD3A4', { y: y + 9.6 }), P(sph(1.4, 8), '#FFFFFF', { y: y + 11.8 }), P(caps(1.2, 7, 8), '#5FD3A4', { x: 7.6, y: y + 7.8, rz: -0.9 }), P(tore(3.4, 0.9, Math.PI * 1.3, 6, 14), '#3FB889', { x: -6.4, y: y + 6.2, rz: HP + 0.3 }), P(cyl(5.4, 5, 0.8, 20), '#3FB889', { y }), P(sph(1.6, 8), '#FFFFFF', { x: -2.6, y: y + 7.2, z: 5.4, sx: 0.6, sy: 1.4, sz: 0.5 })], // la théière
    decorateur: (y) => [P(cyl(5.6, 5, 9, 20), '#C9D3DE', { y }), P(cyl(5.2, 5.2, 0.6, 20), '#FF6B8B', { y: y + 8.8 }), P(tore(5.5, 0.4, TAU, 4, 20), '#A9B6C4', { y: y + 9, rx: HP }), P(bo(4, 3, 0.6, 0.2), '#FF6B8B', { x: 3, y: y + 5, z: 5.1, ry: 0.4 }), P(caps(0.7, 12, 8), '#C8864F', { x: 2, y: y + 14, z: -1, rz: 0.55 }), P(bo(2.6, 3.2, 1.6, 0.5), '#E1496C', { x: -1.3, y: y + 8.6, z: -1, rz: 0.55 })], // le pot de peinture et son pinceau
    grade: (y) => toque(0, y, 0, 1.45, { etoile: OR[0] }), // la toque de l'apprenti et son étoile
    brigade: (y) => [...toque(0, y, 0, 1.45, { galon: OR[0] }), P(etoile(2.4, 0.8), OR[0], { x: -9, y: y + 12, z: 1, rz: 0.3 }), P(etoile(2.4, 0.8), OR[0], { x: -6, y: y + 17, z: 1, rz: 0.1 }), P(etoile(2.4, 0.8), OR[0], { x: 6, y: y + 17, z: 1, rz: -0.1 }), P(etoile(2.4, 0.8), OR[0], { x: 9, y: y + 12, z: 1, rz: -0.3 })], // la toque galonnée, quatre étoiles
    saison1: (y) => [P(cyl(9.2, 8.8, 0.8, 26), '#FFFFFF', { y }), { geo: PERSOS.geoPatisserieSaison('galette'), col: null, vc: true, m: M.matrice({ y: y + 0.8, s: 1.15, ry: 0.4 }) }], // la galette, maîtrisée
    saisons4: (y) => { const pr = [P(cyl(10, 9.6, 1, 28), '#C8864F', { y }), P(tore(9.8, 0.6, TAU, 5, 28), '#A86E3C', { y: y + 1, rx: HP })]; [['galette', -4.4, -3.6], ['glace', 4.4, -3.6], ['citrouille', -4.4, 4.2], ['buche', 4.4, 4.2]].forEach(([id, x, z]) => pr.push({ geo: PERSOS.geoPatisserieSaison(id), col: null, vc: true, m: M.matrice({ x, y: y + 1, z, s: 0.62, ry: 0.4 }) })); return pr; }, // les quatre saisons sur un plateau
  };
  function trophee(id) {
    const t = GAME.TROPHEES.find((x) => x.id === id); if (!t) return null;
    const s = socle(TIERS(t.xp)), g = new T.Group();
    if (id === 'ronron') { // le chat roux du jeu, endormi sur un coussin
      g.add(maille([...s.pr, P(cyl(9.6, 9.6, 2.2, 24), '#B8A6FF', { y: s.y, sy: 1 }), P(tore(9, 1.1, TAU, 6, 24), '#9A84F0', { y: s.y + 1.6, rx: HP })]));
      const c = PERSOS.chat({}); PERSOS.animerChat(c, { etat: 'dort', phase: 0, t: 0 }); c.position.set(0, s.y + 2.4, 0); c.rotation.y = 0.5; g.add(c); return { g, appui: 'sol' };
    }
    const f = TB[id]; if (!f) return null;
    g.add(maille([...s.pr, ...f(s.y)])); return { g, appui: 'sol' };
  }

  // ═══ les trophées de l'arrière-salle (CASINO.TROPHEES) ═══
  function tropheeCasino(id) {
    const s = socle(OR, true), y = s.y, g = new T.Group(), pr = [...s.pr];
    const debout = (rang, en, o) => g.add(carte(rang, en, Object.assign({ y }, o)));
    switch (id) {
      case 'premiere-main': debout('A', 0, { x: -3.2, rz: 0.18, z: -0.4, rx: -0.12 }); debout('R', 1, { x: 3.2, rz: -0.18, z: 0.4, rx: -0.12 }); break;
      case 'blackjack': debout('A', 0, { x: -3.6, rz: 0.2, z: -0.4, rx: -0.12 }); debout('V', 3, { x: 3, rz: -0.16, z: 0.4, rx: -0.12 }); pr.push(P(etoile(3.2, 1), OR[0], { x: 7.6, y: y + 19, z: 1.6, rz: -0.3 }), P(etoile(2, 0.8), OR[0], { x: -8.2, y: y + 18.6, z: 1, rz: 0.3 })); break;
      case 'cinq-cartes': ['10', 'V', 'D', 'R', 'A'].forEach((r, k) => debout(r, [2, 1, 0, 3, 0][k], { x: (k - 2) * 3.4, rz: -(k - 2) * 0.22, z: -1.2 + k * 0.45, rx: -0.12, y: y - Math.abs(k - 2) * 0.6 })); break;
      case 'partage': debout('8', 0, { x: -4.8, rz: 0.22, ry: 0.25, rx: -0.1 }); debout('8', 1, { x: 4.8, rz: -0.22, ry: -0.25, rx: -0.1 }); pr.push(P(bs(0.5, 0.3, 14), OR[0], { y: y + 0.1, z: 1 })); break;
      case 'double': pr.push(...pile(-4.2, 0.5, 6, 'classique', y), ...pile(4.2, -0.5, 6, 'classique', y), P(bo(3.6, 0.9, 0.9, 0.3), OR[0], { y: y + 6.4, z: 3, rz: 0.78 }), P(bo(3.6, 0.9, 0.9, 0.3), OR[0], { y: y + 6.4, z: 3, rz: -0.78 })); break;
      case 'paire-parfaite': debout('7', 1, { x: -2.6, rz: 0.12, z: -0.5, rx: -0.12 }); debout('7', 1, { x: 2.6, rz: -0.12, z: 0.5, rx: -0.12 }); pr.push(P(coeur(3.6, 1.2), '#FF6B8B', { y: y + 21.6, z: 1 })); break;
      case 'plein': case 'zero': {
        const zero = id === 'zero', tex = toile('case|' + (zero ? 0 : 17), 128, 128, (x, w, h) => { x.fillStyle = zero ? '#1E7A3A' : '#2E8C63'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,236,190,.75)'; x.lineWidth = 6; x.strokeRect(5, 5, w - 10, h - 10); x.fillStyle = zero ? '#FFFFFF' : '#E1496C'; if (!zero) { x.beginPath(); x.arc(w / 2, h / 2, 38, 0, TAU); x.fill(); x.fillStyle = '#FFFFFF'; } x.font = '700 58px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(zero ? '0' : '17', w / 2, h / 2 + 3); });
        const pivot = new T.Group(); pivot.rotation.y = 0.35; pivot.add(plan(14, 14, tex, { y: y + 0.15, rx: -HP })); g.add(pivot); const cj = zero ? ['#FFC84A', '#E0A61E'] : ['#5FD3A4', '#3FB889'], c = Math.cos(0.35), sn = Math.sin(0.35), jx = c * 4.6 + sn * -4.6, jz = -sn * 4.6 + c * -4.6; // (la case à plat, tournée vers nous autour de la verticale, un petit jeton sur son coin du fond : le numéro se lit)
        pr.push(...jeton(jx, y + 0.3, jz, cj, '#FFFFFF', { s: 0.45 })); if (zero) pr.push(...jeton(jx + 0.2, y + 1.1, jz + 0.15, cj, '#FFFFFF', { s: 0.45, a: 0.4 })); break;
      }
      case 'habitue': pr.push(...pile(0, 0, 11, 'classique', y)); break;
      case 'serie-10': { const v = '#8E1B3A', v2 = '#B0294F'; pr.push(P(bo(8.6, 10, 3.6, 1.6), v, { y: y + 6.8, rz: -0.1 }), P(bo(7, 6, 3.4, 1.4), v2, { y: y + 1, rz: -0.1 }), P(tore(3.6, 0.9, TAU, 6, 16), '#FFF3C4', { y: y + 6.2, rx: HP, sx: 1.2, rz: -0.1 })); [[-3.2, 0.12], [-1.05, 0.04], [1.1, -0.04], [3.2, -0.12]].forEach(([x, a], k) => pr.push(P(caps(1.05, k === 1 || k === 2 ? 6.4 : 5.4, 8), v, { x: x - 0.1 * 16, y: y + 19 - (k === 0 || k === 3 ? 1 : 0), rz: a - 0.1 }))); pr.push(P(caps(1.1, 4.6, 8), v, { x: 5.4, y: y + 11.4, rz: -0.9 }), P(sph(0.9, 6), '#FFFFFF', { x: -2.4, y: y + 12, z: 1.9, sx: 0.6, sy: 2.2, sz: 0.4 })); break; } // le gant de velours
      case 'assidu': { const b = '#8B5A3C', f = '#6B4A3A'; pr.push(P(bo(15, 21, 2.2, 0.6), f, { y, z: -2 }), P(bo(11.4, 18.4, 1, 0.3), '#FFE7A8', { y: y + 0.4, z: -0.6 }), P(bs(11, 0.6, 3), '#5A3E30', { y, z: 0.4 }));  // le chambranle, la lumière dedans, le seuil
        const porte = [P(bo(11, 18, 1.4, 0.5), b, { x: 5.5 }), P(bo(8.4, 6, 0.6, 0.3), '#A86E3C', { x: 5.5, y: 10.4, z: 0.7 }), P(bo(8.4, 5, 0.6, 0.3), '#A86E3C', { x: 5.5, y: 2.6, z: 0.7 }), P(sph(0.9, 8), OR[0], { x: 9.4, y: 8.4, z: 1.2 }), P(bo(4, 2.2, 0.4, 0.2), '#FFF7EC', { x: 5.5, y: 13.6, z: 0.9 })]; // le vantail : ses panneaux, le bouton d'or, la plaque « Privé »
        const m = new T.Matrix4().makeTranslation(-5.5, y + 0.4, -0.6).multiply(new T.Matrix4().makeRotationY(-0.75)); for (const p of porte) { p.m = m.clone().multiply(p.m); pr.push(p); } break; } // (entrouverte, sur ses gonds à gauche)
      default: return null;
    }
    g.add(maille(pr)); return { g, appui: 'sol' };
  }

  // ═══ les habillages de l'arrière-salle (CASINO.SKINS) : id « categorie-skin » ═══
  const TAPIS = { vert: ['#2E8C63', '#227252', '#18563D', '#7A4E33', '#4E3122'], bordeaux: ['#A63A4E', '#86283B', '#5E1828', '#7A4E33', '#4E3122'], 'bleu-nuit': ['#335A9A', '#26457C', '#182E57', '#7A4E33', '#4E3122'], 'noir-or': ['#333230', '#242321', '#151413', '#B8913A', '#7C5F1F'], prune: ['#84559A', '#67407A', '#472A57', '#7A4E33', '#4E3122'] };
  function skin(cle) {
    const k = cle.indexOf('-'), cat = cle.slice(0, k), id = cle.slice(k + 1), g = new T.Group();
    if (cat === 'tapis') { // le tapis : le feutre (dégradé radial, grain, le filet doré de la table), son bourrelet de bois
      const c = TAPIS[id] || TAPIS.vert, tex = toile('tapis|' + id, 256, 256, (x, w, h) => {
        const gr = x.createRadialGradient(w * 0.5, h * 0.4, 8, w * 0.5, h * 0.45, w * 0.78); gr.addColorStop(0, c[0]); gr.addColorStop(0.55, c[1]); gr.addColorStop(1, c[2]); x.fillStyle = gr; x.fillRect(0, 0, w, h);
        let s = 7; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; for (let i = 0; i < 2600; i++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.05)'; x.fillRect(r() * w, r() * h, 1.6, 1.6); } // (le grain du feutre : un hasard semé, le même à chaque fois)
        const lu = x.createRadialGradient(w * 0.5, h * 0.3, 4, w * 0.5, h * 0.3, w * 0.5); lu.addColorStop(0, 'rgba(255,228,160,.22)'); lu.addColorStop(1, 'rgba(255,228,160,0)'); x.fillStyle = lu; x.fillRect(0, 0, w, h);
        x.strokeStyle = 'rgba(255,236,190,.4)'; x.lineWidth = 5; x.beginPath(); x.ellipse(w / 2, h * 0.18, w * 0.42, h * 0.5, 0, Math.PI * 0.12, Math.PI * 0.88); x.stroke(); // (le filet de la table, en ∪, comme src/style.css .ar-feutre)
        x.fillStyle = 'rgba(255,214,107,.55)'; for (let k = 0; k < 9; k++) { const u = (k - 4) / 4, px = w / 2 + u * w * 0.3, py = h * 0.6 + (1 - Math.cos(u * 0.9)) * h * 0.1; x.fillRect(px - 9, py - 3, 18 - (k % 3) * 4, 6); } // (le texte du feutre, deviné)
      });
      g.add(maille([P(bo(40, 3.2, 40, 1.6), c[3]), P(bo(41, 1.4, 41, 0.7), c[4], { y: -0.2 }), P(bs(34, 0.3, 34), c[1], { y: 3 })]), plan(34, 34, tex, { y: 3.4, rx: -HP }));
      return { g, appui: 'sol' };
    }
    if (cat === 'dos') { g.add(carteDos(id, { x: -3.2, rz: 0.16, rx: -0.14, z: -1 }), carteDos(id, { x: 3.2, rz: -0.12, rx: -0.14, z: 0.6 })); return { g, appui: 'sol' }; } // deux cartes de dos, en éventail
    if (cat === 'jetons') { g.add(maille([...pile(-4.4, -1.6, 5, id), ...pile(4.6, -1, 3, id), ...jeton(0.8, 0, 7, (JETONS[id] || JETONS.classique)[3], JETONS.bord[id] || '#FFFFFF', { a: 0.7 })])); return { g, appui: 'sol' }; } // deux piles et un jeton posé
    if (cat === 'roue' && typeof ARRIERE !== 'undefined' && ARRIERE.ROUE && ARRIERE.ROUE.creer) { // la vraie roue (src/arriere.js), à sa finition, la bille dans le 17
      const R = ARRIERE.ROUE, o = R.creer(R.FINITIONS[id] || R.FINITIONS.classique), p = R.plan(17, 6, 0), e = R.etatBille(p, R.T_FIN);
      o.cylindre.rotation.y = e.cylindre; o.bille.position.set(e.r * Math.cos(e.a), e.y, -e.r * Math.sin(e.a)); o.roue.scale.setScalar(20); g.add(o.roue); return { g, appui: 'sol', fin: () => o.roue.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); for (const x of [].concat(m.material)) { if (x.map) x.map.dispose(); x.dispose(); } } }) };
    }
    return null;
  }

  // ═══ le scooter du Quartier (src/scene.js le peint de profil derrière la vitre : les mêmes couleurs, en volumes) ═══
  function scooter() {
    const rose = '#E1496C', pr = [];
    for (const x of [-22, 22]) pr.push(P(cyl(8, 8, 4.4, 20), L, { x, y: 8, rx: HP }), P(cyl(3.6, 3.6, 4.8, 14), '#8C8C8C', { x, y: 8, rx: HP }));
    pr.push(P(bo(30, 3, 11, 1.2), rose, { x: -1, y: 11 }), P(bo(16, 10, 12, 4), rose, { x: -20, y: 17 }), P(bo(10, 6, 12.4, 2.6), rose, { x: -24, y: 22 })); // le plancher, le capot arrière
    pr.push(P(bo(6, 20, 10, 2.6), rose, { x: 15, y: 11, rz: -0.42 }), P(bo(9, 4, 10, 1.6), rose, { x: 20, y: 8.5, rz: 0.15 })); // le tablier avant, le garde-boue
    pr.push(P(bo(17, 4, 9, 1.8), L, { x: -14, y: 27 })); // la selle
    pr.push(P(cyl(1.1, 1.1, 12, 8), L, { x: 23, y: 26, rz: 0.42 }), P(caps(1.1, 12, 8), L, { x: 25.5, y: 37, rx: HP }), P(sph(1.6, 8), '#3A2E46', { x: 25.5, y: 37, z: 6.6 }), P(sph(1.6, 8), '#3A2E46', { x: 25.5, y: 37, z: -6.6 })); // la colonne, le guidon
    pr.push(P(sph(3.2, 12), '#FFF3C4', { x: 25, y: 29.5, sz: 0.8 }), P(tore(3.2, 0.6, TAU, 5, 16), '#C9D3DE', { x: 26, y: 29.5, ry: HP })); // le phare
    pr.push(P(bo(20, 14, 13, 3), '#5FD3A4', { x: -26, y: 30 }), P(bs(13, 2.4, 13.4), '#FFFFFF', { x: -26, y: 36 }), P(sph(1.2, 6), '#FFC84A', { x: -31, y: 22, z: 4.5 })); // le top-case, sa bande, le feu
    const g = new T.Group(); g.add(maille(pr)); g.rotation.y = -0.4; return grp(g);
  }
  // ═══ le pigeon voyageur (comme les oiseaux de PERSOS : un corps rond, une tête, les ailes, les yeux et les joues ; la gorge irisée) ═══
  function pigeon() {
    const gris = '#A3ACBC', aile = '#7D879A', pr = [P(sph(6, 14), gris, { y: 6.6, sx: 0.92, sy: 0.9, sz: 1.2 }), P(sph(4.3, 12), '#C7CDD8', { y: 5.2, z: 2.6, sz: 0.85 })];
    for (const sx of [-1, 1]) pr.push(P(sph(3.6, 10), aile, { x: sx * 4.6, y: 7, z: -1, sx: 0.38, sy: 0.8, sz: 1.35, rx: -0.15 }), P(bs(2.2, 0.5, 2), '#3A3440', { x: sx * 4.6, y: 8.4, z: -2.6, sx: 0.4 }), P(bs(2.2, 0.5, 2), '#3A3440', { x: sx * 4.7, y: 7.2, z: -2.2, sx: 0.4 }));
    pr.push(P(cyl(3.1, 3.5, 3, 14), '#6FB89A', { y: 10.6, z: 3.6, rx: 0.35 }), P(cyl(3.15, 3.2, 1.2, 14), '#9A84F0', { y: 11.8, z: 4, rx: 0.35 })); // la gorge irisée
    pr.push(P(sph(3.3, 12), '#8E97A8', { y: 14.4, z: 4.6 }), P(cone(0.9, 2.6, 6), '#E8B07A', { y: 13.8, z: 7.8, rx: HP }), P(sph(0.75, 6), '#FFFFFF', { y: 14.3, z: 7.4, sy: 0.6 }));
    for (const sx of [-1, 1]) pr.push(P(sph(0.72, 8), '#3A2A22', { x: sx * 1.55, y: 15.1, z: 7.25 }), P(sph(0.3, 6), '#FFFFFF', { x: sx * 1.45, y: 15.35, z: 7.85 }), P(sph(0.8, 8), '#FFB3B3', { x: sx * 2.4, y: 13.8, z: 6.9, sy: 0.7, sz: 0.5 }));
    for (const rz of [-0.4, 0, 0.4]) pr.push(P(caps(0.95, 4.6, 6), '#6B7486', { y: 6.2, z: -6.4, rz, rx: -1.15, sz: 0.55 }));
    for (const sx of [-1, 1]) pr.push(P(cyl(0.45, 0.45, 2.4, 6), '#E8897A', { x: sx * 2, y: 0.6 }), P(sph(1.2, 8), '#E8897A', { x: sx * 2, y: 0.3, z: 0.6, sy: 0.3, sz: 1.4 }));
    const g = new T.Group(); g.add(maille(pr)); return g;
  }
  return { trophee, tropheeCasino, skin, scooter, pigeon, socle, TB, TIERS };
})();
