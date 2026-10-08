/* LE FOURNIL — le mobilier et la salle en 3D : le sol et le mur du fond (avec la fenêtre et la porte), la chambre froide, le four,
   le comptoir et sa vitrine, la caisse, les tables du salon de thé, la décoration, et tous les petits objets qui font vivre la boutique.
   Low-poly arrondi pastel : des boîtes biseautées fusionnées en un seul maillage par meuble, des couleurs plates, pas de texte.
   Repère : X = x écran, Y vers le haut, Z = 0 au pied du mur, +Z vers le spectateur ; 1 unité = 1 px d'écran en largeur.
   Un meuble dont le plan 2D donne le rectangle { x, y, w, h } a son bord avant à Z = wz(y + h) ; sa profondeur (le dessus en 2D) et sa hauteur (la face)
   se partagent le rectangle, si bien que la boîte projetée recouvre le rectangle du plan sans jamais déborder vers l'avant. */
const MEUBLES = (() => {
  'use strict';
  const M = MODELES, P = M.part, TAU = Math.PI * 2, L = '#4A3328';
  const PASTEL = ['#FF9FB2', '#8FE3C2', '#C7B8FF', '#FFD98A', '#9BD0FF', '#FFB48A', '#B5E88A'];
  const TEX = new Map(), MATS = new Map(); // textures et matériaux de la salle, par quartier
  const C_BLANC = new THREE.Color('#FFFFFF'), C_FLASH = new THREE.Color('#FFF3C4'), C_CHAUD = new THREE.Color('#FFB65A'), C_FROID = new THREE.Color('#6B5950');
  // ─── petites aides ───
  const r2 = (v) => Math.round(v * 2) / 2; // des cotes arrondies au demi, pour que le cache des géométries reste petit
  const bo = (w, h, d, r, seg) => M.boite(r2(w), r2(h), r2(d), r, seg);
  const grp = (nom, x, y, z) => { const g = new THREE.Group(); g.userData.nom = nom; g.position.set(x || 0, y || 0, z || 0); return g; };
  const murY = (c, ys) => c.wy(c.LAY.murH - ys); // hauteur monde d'un point du mur donné par son y écran
  const zSur = (c, ys, Y) => (ys - c.LAY.murH + Y * c.CY) / c.SY; // Z d'un point d'écran posé sur un plan horizontal à la hauteur Y
  const propre = (o) => new THREE.MeshLambertMaterial(o); // un matériau propre à l'objet (il sera modifié par anime)
  const lumineux = (hex, k) => propre({ color: hex, emissive: hex, emissiveIntensity: k == null ? 1 : k });
  const matDe = (k, fab) => { let m = MATS.get(k); if (!m) { m = fab(); MATS.set(k, m); } return m; };
  function forme(k, fab) { return M.extrusion(k, fab(), 1, 0); } // une forme plate extrudée d'une unité, mise en cache par clé
  const triangle = (w, h) => forme('tri' + w + '|' + h, () => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, -h); s.closePath(); return s; }); // la pointe en bas
  const coeur = (s) => forme('coeur' + s, () => { const f = new THREE.Shape(); f.moveTo(0, -s * 0.9); f.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.6, s * 0.9, 0, s * 0.3); f.bezierCurveTo(s * 0.6, s * 0.9, s * 1.3, -s * 0.1, 0, -s * 0.9); return f; });
  const arche = (w, h) => forme('arche' + r2(w) + '|' + r2(h), () => { const s = new THREE.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; });
  // ─── les textures du sol et du mur : les motifs 2D, discrets et pastel, mis en cache par quartier ───
  function textureSol(Q) {
    let tx = TEX.get('sol' + Q.id); if (tx) return tx;
    tx = M.texture((c, w, h) => { // une tuile de 256 unités de côté
      c.fillStyle = Q.sol; c.fillRect(0, 0, w, h);
      if (Q.solStyle === 'planches') { const hb = 16; for (let r = 0; r * hb < h; r++) { const y = r * hb; c.fillStyle = r % 2 ? Q.sol2 : 'rgba(0,0,0,.035)'; c.fillRect(0, y, w, hb - 1); c.fillStyle = 'rgba(74,51,40,.10)'; for (let x = (r * 53) % 128; x < w; x += 128) c.fillRect(x, y, 1.5, hb - 1); } }
      else if (Q.solStyle === 'damier') { c.fillStyle = Q.sol2; c.globalAlpha = 0.9; const sw = w / 12, sh = h / 10; for (let r = 0; r < 10; r++) for (let k = 0; k < 12; k++) if ((r + k) % 2 === 0) c.fillRect(k * sw, r * sh, sw + 0.5, sh + 0.5); }
      else { c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1.6; for (let k = 0; k < 4; k++) { const x0 = k * w / 4 + 30; c.beginPath(); c.moveTo(x0, 0); c.bezierCurveTo(x0 + 45, h * 0.35, x0 - 45, h * 0.65, x0, h); c.stroke(); } }
    }, 256, 256, { repete: [1, 1] });
    tx.userData.partagee = true; TEX.set('sol' + Q.id, tx); return tx;
  }
  function textureMur(Q) {
    let tx = TEX.get('mur' + Q.id); if (tx) return tx;
    tx = M.texture((c, w, h) => { // dessiné dans le repère du mur de référence : 390 × 81 px d'écran
      c.scale(w / 390, h / 81);
      const g = c.createLinearGradient(0, 0, 0, 81); g.addColorStop(0, Q.mur); g.addColorStop(1, Q.mur2); c.fillStyle = g; c.fillRect(0, 0, 390, 81);
      if (Q.murStyle === 'lignes') { c.fillStyle = Q.mur2; for (let y = 7; y < 81; y += 14) c.fillRect(0, y, 390, 1.4); }
      if (Q.murStyle === 'rondins') for (let y = 0; y < 81; y += 13) { c.fillStyle = Q.mur2; c.fillRect(0, y, 390, 2); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, y + 4, 390, 1); }
      if (Q.murStyle === 'moulures') { c.strokeStyle = Q.mur2; c.lineWidth = 2; c.strokeRect(390 * 0.32, 14.8, 390 * 0.33, 81 - 29.6); c.lineWidth = 1; c.strokeRect(390 * 0.32 + 5, 19.8, 390 * 0.33 - 10, 81 - 39.6); }
      if (Q.murStyle === 'bande') { c.fillStyle = Q.accent; c.fillRect(0, 81 - 12, 390, 4); c.fillStyle = 'rgba(58,134,200,.12)'; c.fillRect(0, 81 - 16, 390, 3); }
      if (Q.murStyle === 'marbre') { c.strokeStyle = 'rgba(120,100,90,.12)'; c.lineWidth = 1.5; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(k * 78 - 20, 0); c.quadraticCurveTo(k * 78 + 30, 40, k * 78 + 10, 81); c.stroke(); } }
    }, 512, 256, { repete: [1, 1] });
    tx.userData.partagee = true; TEX.set('mur' + Q.id, tx); return tx;
  }
  const toile = () => { let tx = TEX.get('toile'); if (tx) return tx; tx = M.texture((c, w, h) => { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h); c.fillStyle = '#9ED8FF'; c.fillRect(6, 6, w - 12, h * 0.5); c.fillStyle = '#FFE27A'; c.beginPath(); c.arc(w * 0.72, h * 0.3, 4, 0, TAU); c.fill(); c.fillStyle = '#5FD3A4'; c.beginPath(); c.moveTo(6, h - 6); c.lineTo(w * 0.35, h * 0.42); c.lineTo(w * 0.6, h * 0.62); c.lineTo(w * 0.82, h * 0.5); c.lineTo(w - 6, h * 0.58); c.lineTo(w - 6, h - 6); c.closePath(); c.fill(); }, 64, 48); tx.userData.partagee = true; TEX.set('toile', tx); return tx; };
  // ─── la salle : le sol, le mur du fond percé de la fenêtre et de la porte, la plinthe, le plan extérieur et les taches de lumière ───
  function salle(c) {
    const { LAY, W, H, Q } = c, Hm = c.wy(LAY.murH), D = c.wd(H - LAY.murH), f = LAY.fenetre, p = LAY.porte, g = grp('salle');
    const txS = textureSol(Q); txS.repeat.set(W / 256, D / 256);
    g.add(M.mesh(M.plan(W, D), matDe('sol' + Q.id, () => propre({ map: txS })), { x: W / 2, z: D / 2, rx: -Math.PI / 2 }, { ombre: false, recoit: true }));
    // le mur : une forme avec deux trous aux coins arrondis, extrudée sur 8 d'épaisseur ; la texture est posée une fois sur toute la largeur
    const txM = textureMur(Q); txM.repeat.set(1 / W, 1 / Hm);
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(W, 0); s.lineTo(W, Hm); s.lineTo(0, Hm); s.closePath();
    const trou = (x0, y0, x1, y1, r) => { const h = new THREE.Path(); h.moveTo(x0 + r, y0); h.lineTo(x1 - r, y0); h.quadraticCurveTo(x1, y0, x1, y0 + r); h.lineTo(x1, y1 - r); h.quadraticCurveTo(x1, y1, x1 - r, y1); h.lineTo(x0 + r, y1); h.quadraticCurveTo(x0, y1, x0, y1 - r); h.lineTo(x0, y0 + r); h.quadraticCurveTo(x0, y0, x0 + r, y0); s.holes.push(h); };
    const fy1 = murY(c, f.y), fy0 = murY(c, f.y + f.h), py1 = murY(c, p.y);
    trou(f.x, fy0, f.x + f.w, fy1, 8); trou(p.x, -6, p.x + p.w, py1, 6);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false, curveSegments: 4 }); geo.translate(0, 0, -8);
    const mur = new THREE.Mesh(geo, [matDe('mur' + Q.id, () => propre({ map: txM, emissive: '#FFFFFF', emissiveMap: txM, emissiveIntensity: 0.42 })), M.mat(Q.mur2)]); mur.receiveShadow = true; g.add(mur); g.userData.murMat = mur.material[0];
    if (H - LAY.T > 40) { // le grand sol s'assombrit doucement vers le bas, comme dans le dessin d'origine
      const z0 = c.wz(LAY.T), dv = D - z0, voile = matDe('voile', () => new THREE.MeshBasicMaterial({ map: M.texture((x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(74,51,40,0)'); gr.addColorStop(1, 'rgba(74,51,40,.10)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, 4, 64), transparent: true, depthWrite: false }));
      g.add(M.mesh(M.plan(W, dv), voile, { x: W / 2, y: 0.25, z: z0 + dv / 2, rx: -Math.PI / 2 }, { ombre: false }));
    }
    // la plinthe (de part et d'autre de la porte), l'appui et le cadre de la fenêtre, le cadre de la porte
    const cadreCol = Q.vue === 'ville' ? '#2E2A36' : Q.vue === 'montagne' ? Q.bois : '#FFFFFF', hp = c.wy(4), pr = [];
    pr.push(P(bo(p.x, hp, 3, 0.8), Q.bois, { x: p.x / 2, z: 1.5 }), P(bo(W - p.x - p.w, hp, 3, 0.8), Q.bois, { x: (W + p.x + p.w) / 2, z: 1.5 }));
    const fh = fy1 - fy0, fcx = f.x + f.w / 2, fcy = (fy0 + fy1) / 2;
    pr.push(P(bo(f.w + 6, 4, 5, 1), cadreCol, { x: fcx, y: fy1 - 1, z: 2.5 }), P(bo(f.w + 6, 4, 5, 1), cadreCol, { x: fcx, y: fy0 - 3, z: 2.5 }), P(bo(4, fh, 5, 1), cadreCol, { x: f.x - 1, y: fy0, z: 2.5 }), P(bo(4, fh, 5, 1), cadreCol, { x: f.x + f.w + 1, y: fy0, z: 2.5 }));
    pr.push(P(bo(2, fh, 3, 0.6), cadreCol, { x: fcx, y: fy0, z: 0.5 }), P(bo(f.w, 2, 3, 0.6), cadreCol, { x: fcx, y: fcy - 1, z: 0.5 })); // les croisillons
    pr.push(P(bo(f.w + 12, 3, 8, 1), Q.bois, { x: fcx, y: fy0 - 5, z: 3 })); // l'appui
    pr.push(P(bo(4, py1 + 2, 5, 1), cadreCol, { x: p.x - 1, z: 2.5 }), P(bo(4, py1 + 2, 5, 1), cadreCol, { x: p.x + p.w + 1, z: 2.5 }), P(bo(p.w + 6, 4, 5, 1), cadreCol, { x: p.x + p.w / 2, y: py1 - 1, z: 2.5 }));
    g.add(M.maille(pr, { recoit: true }));
    g.add(M.mesh(M.plan(f.w, fh), M.MAT.verre, { x: fcx, y: fcy, z: -3 }, { ombre: false })); // la vitre
    g.add(porte(c, p, py1));
    // le plan extérieur (la scène y pose la vue du quartier) et les deux taches de lumière au sol
    const ext = M.mesh(M.plan(p.x + p.w + 80 - f.x, Hm + 20), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), { x: (f.x + p.x + p.w) / 2, y: (Hm + 20) / 2, z: -60 }, { ombre: false }); g.add(ext); g.userData.exterieur = ext;
    const t1 = c.wd(0.14 * LAY.T), t2 = c.wd(0.1 * LAY.T);
    const m1 = M.mesh(M.plan(f.w - 12, t1), M.MAT.tache, { x: fcx, y: 0.4, z: t1 / 2, rx: -Math.PI / 2 }, { ombre: false }), m2 = M.mesh(M.plan(p.w - 8, t2), M.MAT.tache, { x: p.x + p.w / 2, y: 0.4, z: t2 / 2, rx: -Math.PI / 2 }, { ombre: false });
    g.add(m1, m2); g.userData.taches = [m1, m2];
    return g;
  }
  function porte(c, p, py1) { // la porte fermée dans son trou : un vantail ajouré d'une vitre, un panneau, l'écriteau blanc et la poignée laiton
    const Q = c.Q, col = Q.vue === 'ville' ? '#2E2A36' : Q.vue === 'montagne' ? '#5A3A22' : Q.bois, cx = p.x + p.w / 2, g = grp('porte', cx, 0, -4), pr = [];
    const vy1 = murY(c, p.y + 5), vy0 = murY(c, p.y + 5 + p.h * 0.5), vw = p.w - 12, w = p.w - 3;
    pr.push(P(bo(w, vy0 + 1, 5, 2), col, { y: -1 }), P(bo(5, py1 - vy0 + 2, 5, 1.5), col, { x: -w / 2 + 2.5, y: vy0 - 1 }), P(bo(5, py1 - vy0 + 2, 5, 1.5), col, { x: w / 2 - 2.5, y: vy0 - 1 }), P(bo(w, py1 - vy1 - 1, 5, 1.5), col, { y: vy1 + 0.5 }));
    pr.push(P(bo(vw + 3, 1.6, 1.2, 0.5), '#FFFFFF', { y: vy1 - 0.3, z: 2.5 }), P(bo(vw + 3, 1.6, 1.2, 0.5), '#FFFFFF', { y: vy0 - 1.3, z: 2.5 }), P(bo(1.6, vy1 - vy0, 1.2, 0.5), '#FFFFFF', { x: -vw / 2 - 0.8, y: vy0, z: 2.5 }), P(bo(1.6, vy1 - vy0, 1.2, 0.5), '#FFFFFF', { x: vw / 2 + 0.8, y: vy0, z: 2.5 })); // le cadre blanc de la vitre
    pr.push(P(bo(p.w - 12, murY(c, p.y + p.h * 0.62) - murY(c, p.y + p.h * 0.92), 1.5, 0.8), Q.comptoir2, { y: murY(c, p.y + p.h * 0.92), z: 2.8 })); // le panneau bas
    pr.push(P(bo(Math.min(30, p.w - 10), c.wy(10), 1.2, 1), '#FFFFFF', { y: murY(c, p.y + p.h * 0.56 + 5), z: 3 })); // l'écriteau (le mot est sur le calque 2D)
    pr.push(P(M.sphere(2.5, 10), '#FFC84A', { x: w / 2 - 7, y: murY(c, p.y + p.h * 0.7), z: 3.5 }));
    g.add(M.maille(pr, { recoit: true }));
    g.add(M.mesh(M.plan(vw, vy1 - vy0), M.MAT.verre, { y: (vy0 + vy1) / 2, z: 0 }, { ombre: false }));
    return g;
  }
  // ─── la chambre froide : au cran 0 un sac de farine sur une cagette, puis un frigo blanc, inox, puis vitré à LED ───
  function froid(k, c) {
    const f = c.LAY.froid, Q = c.Q, g = grp('froid', f.x + f.w / 2, 0, c.wz(f.y + f.h)), pr = []; g.userData.zone = 'froid';
    if (k === 0) {
      const d = c.wd(14);
      pr.push(P(bo(f.w - 4, 13, d, 1.5), '#C8864F', { z: -d / 2 }));
      for (let i = 0; i < 3; i++) pr.push(P(bo(1.8, 10, 1, 0.4), '#A86B3A', { x: -f.w / 2 + 4 + (i + 0.5) * (f.w - 8) / 3, y: 1.5, z: -0.4 })); // les fentes de la cagette
      pr.push(P(bo(f.w - 8, 24, d - 3, 7), '#F4E4C8', { y: 13, z: -d / 2 }), P(bo(f.w - 14, 4.5, d - 2, 1.2), Q.accent, { y: 21, z: -d / 2 }), P(bo(11, 7, 7, 3), '#E8B46A', { y: 36, z: -d / 2 }));
      g.add(M.maille(pr)); return g;
    }
    const d = c.wd(f.h * 0.24), h = c.wy(f.h * 0.76), col = k >= 2 ? '#C9CED6' : '#F6F7F9', top = k >= 2 ? '#E2E6EC' : '#FFFFFF';
    pr.push(P(bo(f.w, h - 4, d, 4), col, { z: -d / 2 }), P(bo(f.w, 5, d, 2), top, { y: h - 5, z: -d / 2 }));
    if (k >= 3) { // la chambre vitrée à LED : une cavité claire, trois clayettes garnies, la vitre et sa barre lumineuse
      const vw = f.w - 10, vh = h * 0.72, vy = 8, prof = d * 0.7;
      pr.push(P(bo(vw + 2, vh + 2, 1.5, 0.5), '#DDE8F2', { y: vy - 1, z: -prof }));
      for (let i = 0; i < 3; i++) { const y = vy + 4 + i * (vh - 10) / 3; pr.push(P(bo(vw - 4, 1.2, prof - 2, 0.4), '#FFFFFF', { y, z: -prof / 2 }), P(bo(vw - 10, 4.5, prof - 6, 1.5), ['#E8B46A', '#FFE1EA', '#E7D4FF'][i], { y: y + 1.2, z: -prof / 2 })); }
      for (const [dx, dy, lw, lh] of [[0, vh / 2, vw, 1.6], [0, -vh / 2, vw, 1.6], [vw / 2, 0, 1.6, vh], [-vw / 2, 0, 1.6, vh]]) pr.push(P(bo(lw + 1.6, lh, 1.5, 0.5), '#FFFFFF', { x: dx, y: vy + vh / 2 + dy - lh / 2, z: 0.2 })); // le cadre de la vitre
      g.add(M.mesh(bo(vw, vh, prof - 1, 1), M.MAT.verre, { y: vy, z: -(prof - 1) / 2 }, { ombre: false }));
      const led = M.mesh(bo(vw - 4, 1.5, 1, 0.4), lumineux('#6CB8FF', 1), { y: vy + vh + 2.5, z: -0.5 }, { ombre: false }); g.add(led);
      g.userData.anime = (E) => { led.material.emissiveIntensity = Math.sin(E.t * 3) > 0 ? 1 : 0.25; };
    } else { // une ou deux portes : la rainure et les poignées
      const hcol = k >= 2 ? '#8C939E' : '#B9C6D2';
      pr.push(P(bo(f.w - 6, 1.2, 1, 0.3), M.assombrir(col, 0.12), { y: h * 0.45, z: 0.2 }), P(bo(3, h * 0.22, 2, 0.8), hcol, { x: f.w / 2 - 6.5, y: h * 0.52 + 2, z: 0 }), P(bo(3, h * 0.3, 2, 0.8), hcol, { x: f.w / 2 - 6.5, y: h * 0.14, z: 0 }));
    }
    if (k >= 2) pr.push(P(M.sphere(1.5, 6), '#6CB8FF', { x: -f.w / 2 + 7, y: h - 2.5, z: -0.8 })); // la diode
    g.add(M.maille(pr)); return g;
  }
  // ─── le four : un bloc, une ou deux portes qui rougeoient quand il chauffe, les boutons, puis la hotte, puis le four à bois en arche ───
  function four(k, c) {
    const f = c.LAY.four, d = c.wd(f.h * 0.3), h = c.wy(f.h * 0.7), g = grp('four', f.x + f.w / 2, 0, c.wz(f.y + f.h)), pr = [], lueurs = []; g.userData.zone = 'four';
    const col = k === 0 ? '#9A8F8A' : k >= 4 ? '#B07A52' : '#7A655C', y0 = k >= 4 ? 13 : 0;
    pr.push(P(bo(f.w, h - y0, d, 5), col, { y: y0, z: -d / 2 }), P(bo(f.w - 3, 2, d - 3, 0.8), M.eclaircir(col, 0.3), { y: h - 1.2, z: -d / 2 }));
    const portes = k >= 2 ? 2 : 1, pw = (f.w - 12 - (portes - 1) * 4) / portes, ph = c.wy(f.h * 0.44), yB = h - 5 - ph;
    for (let p = 0; p < portes; p++) {
      const px = -f.w / 2 + 6 + p * (pw + 4) + pw / 2;
      if (k >= 4) { pr.push(P(arche(pw, ph), '#3B2F2A', { x: px, y: yB + ph / 2, z: -1, sz: 3 })); lueurs.push(M.mesh(arche(pw - 4, ph - 4), propre({ color: '#6B5950', emissive: '#FF8C3C', emissiveIntensity: 0 }), { x: px, y: yB + ph / 2, z: -0.3, sz: 2 }, { ombre: false })); }
      else { pr.push(P(bo(pw, ph, 3, 3), '#3B2F2A', { x: px, y: yB, z: -1 })); lueurs.push(M.mesh(bo(pw - 4, ph - 4, 2, 2), propre({ color: '#6B5950', emissive: '#FF8C3C', emissiveIntensity: 0 }), { x: px, y: yB + 2, z: -0.2 }, { ombre: false })); }
      if (k >= 1) for (let r = 0; r < 2; r++) pr.push(P(bo(pw - 8, 1, 0.8, 0.3), '#9E8A80', { x: px, y: yB + ph * (0.32 + r * 0.3), z: 0.5 })); // les grilles
      pr.push(P(bo(pw - 8, 2.5, 2, 1), k >= 1 ? '#E0A61E' : '#C9B8AE', { x: px, y: yB - 5.5, z: -0.5 })); // la poignée
    }
    if (k >= 3) { pr.push(P(bo(f.w * 0.6, 13, d * 0.8, 3), '#8C8C8C', { y: h + 11, z: -d / 2 }), P(M.cylindre(3.4, 3.4, 44, 10), '#C97C3A', { y: h + 22, z: -d / 2 }), P(M.cylindre(4.2, 3.4, 3, 10), '#C97C3A', { y: h + 63, z: -d / 2 })); } // la hotte et son tuyau de cuivre
    if (k >= 4) { pr.push(P(bo(f.w - 6, y0, d - 3, 1), '#3B2F2A', { y: 0, z: -d / 2 - 1 })); for (const [lx, ly] of [[-13, 3], [13, 3], [0, 8.4]]) pr.push(P(M.cylindre(3, 3, 24, 8), '#8B5A3C', { x: lx - 12, y: ly, z: -3, rz: -Math.PI / 2 }), P(M.cylindre(2.2, 2.2, 0.6, 8), '#D9A066', { x: lx + 12.3, y: ly, z: -3, rz: -Math.PI / 2 })); } // la réserve de bûches : deux en bas, une dessus, le bout clair à droite
    else for (const u of [0.3, 0.7]) pr.push(P(M.cylindre(3.4, 3.4, 1.8, 10), '#D9CCC2', { x: -f.w / 2 + f.w * u, y: 7, z: -1.2, rx: Math.PI / 2 }), P(M.cylindre(1.2, 1.2, 1, 6), '#8C7A72', { x: -f.w / 2 + f.w * u, y: 7, z: 0.4, rx: Math.PI / 2 })); // les boutons
    g.add(M.maille(pr)); for (const m of lueurs) g.add(m);
    g.userData.anime = (E) => { for (let i = 0; i < lueurs.length; i++) { const m = lueurs[i].material; if (E.chaud) { m.color.copy(C_CHAUD); m.emissiveIntensity = 0.7 + 0.3 * Math.sin(E.t * 7 + i) * Math.sin(E.t * 3.1); } else { m.color.copy(C_FROID); m.emissiveIntensity = 0; } } };
    return g;
  }
  // ─── le comptoir et sa vitrine : les cotes partagées avec ce qui se pose dessus ───
  function dimsComptoir(c) { // zAv : le bord avant (monde) ; D : la profondeur totale ; H : la hauteur du dessus ; la vitrine bombe de 5 devant le corps
    const C = c.LAY.comptoir, zAv = c.wz(C.y + C.hTop + C.hFace), D = c.wd(C.hTop) + 10, H = c.wy(C.hFace);
    return { C, zAv, D, H, zB: zAv - D, zF: zAv - 5, e: 4 };
  }
  function surDessus(c, p) { // un point du plan (sur le dessus du comptoir) → sa position monde, ramenée sur le dessus s'il déborde
    const d = dimsComptoir(c), Y = c.dessusY == null ? d.H : c.dessusY;
    return { x: Math.max(d.C.x + 13, Math.min(d.C.x + d.C.w - 13, p.x)), y: Y, z: Math.max(d.zB + 5, Math.min(d.zF - 5, zSur(c, p.y, Y))) };
  }
  function comptoir(k, c) {
    const { C, zAv, D, H, e } = dimsComptoir(c), Q = c.Q, w = C.w, g = grp('comptoir', C.x + w / 2, 0, zAv), pr = []; g.userData.zone = 'vitrine';
    const zF = -5, zB = -D, zc = (zF + zB) / 2, prof = zF - zB, vw = w * 0.72, vx = -w / 2 + 8 + vw / 2, yb = c.wy(6), vh = H - e - 2 - yb;
    const n0 = c.niv ? c.niv.filter((v) => v > 0).length : 4, rangees = k >= 2 && n0 > 3 ? 2 : 1;
    // le corps : deux piliers, le socle, le fond de la vitrine, le dessus
    pr.push(P(bo(8, H - e, prof, 2), Q.comptoir, { x: -w / 2 + 4, z: zc }), P(bo(w - 8 - vw, H - e, prof, 2), Q.comptoir, { x: vx + vw / 2 + (w - 8 - vw) / 2, z: zc }), P(bo(vw + 2, yb, prof, 1.5), Q.comptoir, { x: vx, z: zc }));
    pr.push(P(bo(vw + 2, H - e - yb + 1, 3, 1), M.eclaircir(Q.comptoir, 0.35), { x: vx, y: yb - 0.5, z: zB + 1.5 }));
    pr.push(P(bo(w + 4, e, prof + 2, 1.5), Q.comptoir2, { y: H - e, z: zc }), P(bo(w - 8, 0.8, 3, 0.3), M.eclaircir(Q.comptoir2, 0.4), { y: H, z: zc + 1 }));
    if (Q.solStyle === 'planches' || Q.vue === 'montagne') for (const r of [0.33, 0.66]) pr.push(P(bo(w - 8 - vw - 4, 0.8, 0.6, 0.2), M.assombrir(Q.comptoir, 0.15), { x: vx + vw / 2 + (w - 8 - vw) / 2, y: (H - e) * r, z: zF + 0.3 }));
    // les étagères blanches et les étiquettes (une par place), le cadre de la vitrine (blanc, inox au cran 3)
    const etag = (y) => pr.push(P(bo(vw - 2, 1.5, prof - 4, 0.5), '#FFFFFF', { x: vx, y, z: zc + 0.5 }));
    etag(yb); if (rangees === 2) etag(yb + vh / 2);
    const places = (n) => {
      const rows = k >= 2 && n > 3 ? 2 : 1, par = Math.ceil(n / rows), cw = vw / Math.max(3, par), rh = vh / rows, out = [];
      for (let i = 0; i < n; i++) { const r = Math.floor(i / par), haut = rows === 2 && r === 0; out.push({ x: g.position.x + vx - vw / 2 + ((i % par) + 0.5) * cw, y: (haut ? yb + vh / 2 : yb) + 1.5, z: zAv - 9, s: Math.min(cw - 5, rh - 5, haut ? 14 : 18) }); }
      return out;
    };
    if (k >= 2) for (const pl of places(n0)) pr.push(P(bo(6, 2.4, 0.8, 0.4), '#FFFFFF', { x: pl.x - g.position.x, y: pl.y + 0.3, z: -1.2 }));
    const cc = k >= 3 ? '#DDE6EE' : '#FFFFFF', ep = k >= 3 ? 3 : 2.4;
    for (const [dx, dy, lw, lh] of [[0, vh, vw + ep, ep], [0, 0, vw + ep, ep], [vw / 2, vh / 2, ep, vh], [-vw / 2, vh / 2, ep, vh]]) pr.push(P(bo(lw, lh, 2, 0.7), cc, { x: vx + dx, y: yb + dy - lh / 2, z: -0.6 }));
    g.add(M.maille(pr, { recoit: true }));
    g.add(M.mesh(bo(vw, vh, 5.5, 1), M.MAT.verre, { x: vx, y: yb, z: -2.75 }, { ombre: false })); // la vitre bombée
    if (k >= 1) g.add(M.mesh(bo(vw - 8, 1.6, 1.4, 0.5), M.mat('#FFE6A0', { emissive: '#FFE6A0', emissiveIntensity: 0.9 }), { x: vx, y: yb + vh - 3, z: -1 }, { ombre: false })); // le bandeau lumineux
    g.userData.vitrine = { places, rangees }; g.userData.dessusY = H; g.userData.dessusZ = zAv + zc;
    g.userData.zoneBoite = new THREE.Box3(new THREE.Vector3(C.x, 0, zAv - 5), new THREE.Vector3(C.x + vw + 16, H - e, zAv)); // la zone de touche : la face vitrée seule (le dessus porte la caisse)
    return g;
  }
  // ─── la caisse, posée sur le dessus du comptoir : tiroir, écran menthe, écran large, puis terminal et clochette ───
  function caisse(k, c) {
    const o = surDessus(c, c.LAY.caisse), g = grp('caisse', o.x, o.y, o.z), pr = []; g.userData.zone = 'caisse';
    if (k === 0) { pr.push(P(bo(22, 9, 14, 2), c.Q.bois), P(bo(8, 2, 1.5, 0.7), '#E0A61E', { y: 3, z: 7 })); g.add(M.maille(pr)); return g; }
    pr.push(P(bo(24, 10, 16, 3), k >= 3 ? L : '#5FD3A4'));
    for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) pr.push(P(bo(4, 1, 3, 0.4), '#FFFFFF', { x: -6 + q * 6, y: 10, z: 1 + r * 4.5 }));
    if (k >= 3) pr.push(P(bo(7, 12, 5, 1.5), '#B9C6D2', { x: 13.5, z: -3 }), P(M.sphere(3, 10), '#FFC84A', { x: 13.5, y: 14.5, z: -3 }));
    g.add(M.maille(pr));
    const ecran = M.mesh(bo(k >= 2 ? 16 : 12, 9, 1.5, 1), propre({ color: '#FFFFFF' }), { y: 9.5, z: -5, rx: -0.35 }); g.add(ecran);
    g.add(M.mesh(bo(8, 1.2, 0.5, 0.2), M.mat('#3FB889'), { y: 9.5, z: -5, rx: -0.35 }, { ombre: false }).translateY(5).translateZ(0.8));
    g.userData.anime = (E) => { ecran.material.color.copy(E.caisseFlash > 0.3 ? C_FLASH : C_BLANC); };
    return g;
  }
  // ─── les tables rondes du salon de thé, deux chaises chacune, un couvert caché que la scène montre quand on s'assoit ───
  function tables(k, c) {
    const { LAY, K, Q } = c, g = grp('tables'), couverts = []; g.userData.zone = 'tables'; g.userData.couverts = couverts;
    if (k === 0) { const tb = LAY.tables[0]; g.add(M.mesh(M.anneau(14 * K, 16 * K, 32), M.MAT.pointille, { x: tb.x, y: 0.4, z: c.wz(tb.y - 8 * K) }, { ombre: false })); return g; }
    const R = 16 * K, Ht = 28, pr = [], nappe = k >= 4, bougies = [];
    for (let i = 0; i < k; i++) {
      const tb = LAY.tables[i], x = tb.x, z = c.wz(tb.y);
      pr.push(P(M.cylindre(6.5 * K, 7.5 * K, 2, 14), Q.bois, { x, z }), P(M.cylindre(2.4, 2.4, Ht - 5, 8), Q.bois, { x, y: 2, z }));
      pr.push(P(M.cylindre(R, R - 1.5, 3, 22), Q.comptoir, { x, y: Ht - 3, z }), P(M.cylindre(R - 0.3, R - 0.3, 1, 22), nappe ? Q.accent : Q.comptoir2, { x, y: Ht, z }));
      if (nappe) pr.push(P(M.cylindre(R * 0.62, R * 0.62, 0.6, 18), '#FFFFFF', { x, y: Ht + 1, z }));
      for (const s of tb.sieges) chaise(pr, s.x, c.wz(s.y), s.dir, K, Q);
      if (k >= 4 || c.crans.deco >= 3) pr.push(P(bo(4, 6, 4, 1.5), '#9BD0FF', { x, y: Ht + 1, z }), P(M.sphere(2.6, 8), ['#FF6B8B', '#FFC84A', '#B8A6FF'][i % 3], { x, y: Ht + 9, z }));
      if (c.crans.deco >= 4) { pr.push(P(M.cylindre(1.6, 1.8, 6, 8), '#FFFDF5', { x: x + 7 * K, y: Ht + 1, z: z - 2 })); const fl = M.mesh(M.sphere(1.5, 8), lumineux('#FFC84A', 0.3), { x: x + 7 * K, y: Ht + 8.5, z: z - 2, sy: 1.5 }, { ombre: false }); g.add(fl); bougies.push(fl); } // les bougies du salon
      const cv = M.maille([P(M.cylindre(5 * K, 5 * K, 0.8, 14), '#FFFFFF', { x: -5 * K }), P(M.sphere(1.8 * K, 8), '#E8B46A', { x: -5 * K, y: 1.8 }), P(M.cylindre(2.4 * K, 2 * K, 4.5, 10), '#FFFFFF', { x: 4 * K, z: -3 }), P(M.tore(2.2, 0.6, TAU, 6, 10), '#FFFFFF', { x: 6.6 * K, y: 2.6, z: -3 })]);
      cv.position.set(x, Ht + 1, z); cv.visible = false; couverts.push(cv); g.add(cv);
    }
    g.add(M.maille(pr, { recoit: true }));
    if (bougies.length) g.userData.anime = (E) => { for (let i = 0; i < bougies.length; i++) bougies[i].material.emissiveIntensity = 0.3 + E.lampes * (0.8 + 0.2 * Math.sin(E.t * 9 + i * 2.1)); };
    return g;
  }
  function chaise(pr, x, z, dir, K, Q) { // assise à 16, dossier côté extérieur (dir = +1 : la chaise regarde vers +X), quatre pieds
    const a = 13 * K;
    pr.push(P(bo(a, 3, a, 1.2), Q.comptoir2, { x, y: 13, z }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(bo(1.8, 13, 1.8, 0.5), Q.bois, { x: x + sx * (a / 2 - 1.2), z: z + sz * (a / 2 - 1.2) }));
    pr.push(P(bo(3, 16, a, 1.2), Q.bois, { x: x - dir * (a / 2 - 1.5), y: 16, z }));
  }
  // ─── la décoration : la plante, le second cadre et les appliques, la guirlande, puis le tapis, la frise et les bougies du salon ───
  function deco(k, c) {
    const { LAY, Q, W } = c, g = grp('deco'), lampes = []; g.userData.zone = 'deco'; g.userData.lampes = lampes;
    if (k === 0) { const m = M.mesh(M.disque(1, 6), M.MAT.tache, { x: LAY.deco.x, y: 0.2, z: c.wz(LAY.deco.y) }, { ombre: false }); m.visible = false; g.add(m); return g; }
    const pl = plante(LAY.deco.x, LAY.deco.y, c); g.add(pl); g.userData.zoneBoite = new THREE.Box3().setFromObject(pl, true); // la zone de touche : la plante seule (le reste s'accroche au mur ou au plafond)
    if (k >= 2) { g.add(cadre(LAY.cadre2.x, LAY.cadre2.y, c)); for (const a of LAY.appliques) g.add(applique(a.x, a.y - 14, c, lampes)); } // les appliques, juste au-dessus des cadres
    if (k >= 3) g.add(guirlande(c.tags && c.tags.includes('noel'), c));
    if (k >= 4) {
      const t = LAY.tapis, d = c.wd(t.h), tp = grp('tapis', t.x + t.w / 2, 0, c.wz(t.y) + d / 2);
      tp.add(M.mesh(bo(t.w, 0.8, d, 0.4), M.mat(Q.accent, { transparent: true, opacity: 0.4 }), null, { ombre: false, recoit: true }));
      const bord = [[0, d / 2 - 4, t.w - 8, 1], [0, -d / 2 + 4, t.w - 8, 1], [t.w / 2 - 4, 0, 1, d - 8], [-t.w / 2 + 4, 0, 1, d - 8]].map(([x, z, w, dd]) => P(bo(w, 0.6, dd, 0.2), '#FFFFFF', { x, y: 0.8, z }));
      const bm = M.maille(bord, { ombre: false }); bm.material = matDe('bord', () => propre({ vertexColors: true, transparent: true, opacity: 0.55 })); tp.add(bm);
      g.add(tp);
      const Hm = c.wy(LAY.murH); g.add(M.mesh(bo(W, c.wy(4), 1.5, 0.4), M.mat(Q.accent), { x: W / 2, y: Hm - c.wy(7), z: 0.75 }, { ombre: false })); // la frise
    }
    g.userData.anime = (E) => { for (let i = 0; i < lampes.length; i++) lampes[i].material.emissiveIntensity = E.lampes; };
    return g;
  }
  function applique(x, y, c, lampes) { // une applique au mur : un socle bois et un abat-jour tronconique qui s'allume le soir
    const g = grp('applique', x, murY(c, y), 3);
    g.add(M.maille([P(bo(4, c.wy(8), 3, 1), c.Q.bois, { y: -c.wy(8) + 1 })]));
    const m = M.mesh(M.cylindre(5, 8, c.wy(8), 12), lumineux('#FFF3C4', 0), { y: 0, z: 2.5 }); g.add(m); lampes.push(m); return g;
  }

  // ─── le fournil : le plan de travail (pâte, rouleau, farine), le présentoir à baguettes, l'ardoise ───
  function plan(c) {
    const p = c.LAY.plan, Q = c.Q, d = c.wd(p.h * 0.45), h = c.wy(p.h * 0.55), g = grp('plan', p.x + p.w / 2, 0, c.wz(p.y + p.h)), pr = [], zc = -d / 2;
    pr.push(P(bo(p.w, h - 3, d, 2), Q.bois, { z: zc }), P(bo(p.w + 2, 3, d + 1.5, 1), Q.comptoir2, { y: h - 3, z: zc }));
    pr.push(P(M.sphere(5.5, 12), '#FFF3C4', { x: -p.w * 0.2, y: h + 0.5, z: zc, sy: 0.5 }), P(M.cylindre(1.7, 1.7, p.w * 0.3, 8), '#C8864F', { x: p.w * 0.2 - p.w * 0.15, y: h + 1.7, z: zc + 1, rz: -Math.PI / 2 }));
    for (const s of [-1, 1]) pr.push(P(M.cylindre(1, 1, 3, 6), '#E8C39A', { x: p.w * 0.2 + s * (p.w * 0.15 + 1.5), y: h + 1.7, z: zc + 1, rz: -Math.PI / 2 }));
    for (let i = 0; i < 4; i++) pr.push(P(M.sphere(0.9, 6), '#FFFFFF', { x: -p.w * 0.38 + i * 5, y: h + 0.4, z: zc + 2.5 }));
    g.add(M.maille(pr, { recoit: true })); return g;
  }
  function presentoir(n, c) {
    const p = c.LAY.presentoir, Q = c.Q, d = c.wd(p.h * 0.45), h = c.wy(p.h * 0.55), g = grp('presentoir', p.x + p.w / 2, 0, c.wz(p.y + p.h)), pr = [], zc = -d / 2;
    pr.push(P(bo(p.w, h, d, 2.5), Q.bois, { z: zc }), P(bo(p.w + 4, 2.5, d + 3, 1), Q.comptoir2, { y: h, z: zc }));
    for (let i = 1; i < 4; i++) pr.push(P(bo(1.2, h - 4, 0.6, 0.2), M.assombrir(Q.bois, 0.15), { x: -p.w / 2 + i * p.w / 4, y: 2, z: 0.2 }));
    for (let i = 0; i < n; i++) { const bx = n > 1 ? -p.w / 2 + 7 + i * (p.w - 14) / (n - 1) : 0, l = 26 + (i % 2) * 6, a = ((i % 3) - 1) * 0.14; pr.push(P(M.capsule(2.6, l, 8), i % 2 ? '#E8B46A' : '#D99A4E', { x: bx - Math.sin(a) * (l / 2 + 3), y: h - 3 + Math.cos(a) * (l / 2 + 3), z: zc, rz: a })); }
    g.add(M.maille(pr)); return g;
  }
  function ardoise(c) { // un chevalet : deux montants devant, un derrière, le tableau noir et ses traits de craie
    const a = c.LAY.ardoise, Q = c.Q, g = grp('ardoise', a.x, 0, c.wz(a.y)), pr = [], h = c.wy(34), t = 0.22;
    for (const sx of [-1, 1]) pr.push(P(bo(2.2, h, 2.2, 0.6), Q.bois, { x: sx * 12, z: -2 - h * Math.sin(t) / 2 + 1, rx: -t }));
    pr.push(P(bo(2.2, h * 0.92, 2.2, 0.6), Q.bois, { z: -14, rx: 0.3 }));
    const ph = c.wy(26), zt = -2 - (h * 0.42) * Math.sin(t), yt = h * 0.42 * Math.cos(t);
    pr.push(P(bo(26, ph + 6, 1.6, 0.8), Q.bois, { y: yt - 3 * Math.cos(t), z: zt + 3 * Math.sin(t), rx: -t }), P(bo(20, ph, 1.2, 0.5), '#2F3A36', { y: yt, z: zt + 1.2, rx: -t }));
    for (const [dy, w, col] of [[0.82, 14, '#FFFFFF'], [0.66, 11, '#FFFFFF'], [0.5, 13, '#FFFFFF'], [0.32, 10, '#FFD98A']]) pr.push(P(bo(w, 1.1, 0.6, 0.2), col, { x: (w - 14) / 2 - 0, y: yt + ph * dy * Math.cos(t), z: zt + 1.9 - ph * dy * Math.sin(t), rx: -t }));
    g.add(M.maille(pr)); return g;
  }
  // ─── les petits objets ───
  function plante(x, y, c) { // une plante en pot : le pot couleur comptoir, quatre boules de feuillage
    const g = grp('plante', x, 0, c.wz(y + 15) - 9), pr = [];
    pr.push(P(M.cylindre(9, 7, 18, 12), c.Q.comptoir), P(M.cylindre(9.6, 9.6, 2.5, 12), M.eclaircir(c.Q.comptoir, 0.2), { y: 16.5 }), P(M.cylindre(7.5, 7.5, 1, 12), '#6B4A3A', { y: 18 }));
    for (const [ox, oy, r] of [[0, 30, 9.5], [-8.5, 22, 7], [8.5, 22, 7], [0, 43, 7]]) pr.push(P(M.sphere(r, 10), '#5FD3A4', { x: ox, y: oy, z: 0 }));
    pr.push(P(M.sphere(3.5, 8), '#3FB889', { x: -4.5, y: 36, z: 6 }), P(M.sphere(3, 8), '#3FB889', { x: 5, y: 27, z: 6.5 }));
    g.add(M.maille(pr)); return g;
  }
  function fleurs(c) { // un petit vase et trois fleurs rose, beurre, lavande sur le comptoir
    const o = surDessus(c, c.LAY.fleurs), g = grp('fleurs', o.x, o.y, o.z), pr = [], hv = c.wy(10);
    pr.push(P(bo(10, hv, 10, 3), c.Q.comptoir2));
    for (const [a, col, l] of [[-0.3, '#FF6B8B', 20], [0, '#FFC84A', 23], [0.3, '#B8A6FF', 19]]) pr.push(P(M.cylindre(0.7, 0.7, l, 5), '#3FB889', { y: hv - 2, rz: -a }), P(M.sphere(3.2, 9), col, { x: Math.sin(a) * l, y: hv - 2 + Math.cos(a) * l, z: 0 }));
    g.add(M.maille(pr)); return g;
  }
  function chat(c) { // un chat roux endormi sur le comptoir, la tête à droite, la queue qui bat doucement
    const o = surDessus(c, c.LAY.chat), g = grp('chat', o.x, o.y, o.z), roux = '#F2A65A', pr = [];
    pr.push(P(M.capsule(5.5, 12, 10), roux, { y: 5.5, rz: Math.PI / 2 }), P(M.sphere(6, 12), roux, { x: 12, y: 7 }));
    for (const sx of [-1, 1]) pr.push(P(M.cone(2, 3.5, 6), roux, { x: 12 + sx * 3, y: 11.5, rz: -sx * 0.25 }), P(bo(2, 0.8, 0.5, 0.2), L, { x: 12 + sx * 2.3, y: 6.5, z: 5.6 }));
    pr.push(P(M.sphere(1.2, 6), '#FF9FB2', { x: 12, y: 5.2, z: 5.6 }));
    g.add(M.maille(pr));
    const queue = M.mesh(M.tore(6, 1.5, Math.PI * 0.95, 6, 12), M.mat(roux), { x: -11, y: 6, z: 0, rz: -0.4 }); g.add(queue);
    g.userData.anime = (E) => { queue.rotation.z = -0.4 + Math.sin(E.t * 3) * 0.3; };
    return g;
  }
  function paillasson(couleur, c) {
    const p = c.LAY.paillasson, Q = c.Q, d = c.wd(9), col = couleur ? Q.accent : Q.vue === 'ville' ? '#5A4A5E' : '#B9875A', g = grp('paillasson', p.x, 0, c.wz(p.y + 0.5)), pr = [];
    pr.push(P(bo(40, 1.2, d, 0.5), col));
    for (let k = 0; k < 4; k++) pr.push(P(bo(5, 0.5, d * 0.5, 0.2), M.eclaircir(col, 0.3), { x: -13.5 + k * 9, y: 1.1 }));
    g.add(M.maille(pr, { ombre: false, recoit: true })); return g;
  }
  function sapin(c) { // le sapin de Noël : tronc, trois étages de cônes, les boules qui clignotent en alternance, l'étoile
    const s = c.LAY.sapin, g = grp('sapin', s.x, 0, c.wz(s.y)), pr = [];
    pr.push(P(M.cylindre(3, 3.5, 9, 8), '#8B5A3C'));
    for (let k = 0; k < 3; k++) pr.push(P(M.cone(14 - k * 3, 26, 9), k % 2 ? '#2F6B4F' : '#2A6248', { y: 6 + k * 16 }));
    pr.push(P(M.cone(3.5, 5, 4), '#FFC84A', { y: 64 }), P(M.cone(3.5, 5, 4), '#FFC84A', { y: 74, rx: Math.PI }));
    g.add(M.maille(pr));
    const grappes = [[], []];
    for (let k = 0; k < 6; k++) { const y = 12 + k * 8.5, et = Math.min(2, Math.floor((y - 6) / 16)), r = (14 - et * 3) * (1 - (y - 6 - et * 16) / 26), a = -0.9 + (k * 2.3) % 1.8; grappes[k % 2].push(P(M.sphere(2.2, 8), ['#FF6B8B', '#FFC84A', '#9BD0FF'][k % 3], { x: Math.sin(a) * r * 0.9, y, z: Math.cos(a) * r * 0.9 })); }
    const bA = M.maille(grappes[0], { ombre: false }), bB = M.maille(grappes[1], { ombre: false }); bA.material = propre({ vertexColors: true, emissive: '#FFFFFF', emissiveIntensity: 0.4 }); bB.material = propre({ vertexColors: true, emissive: '#FFFFFF', emissiveIntensity: 0.1 }); g.add(bA, bB);
    g.userData.anime = (E) => { const on = Math.sin(E.t * 4) > 0; bA.material.emissiveIntensity = on ? 0.45 : 0.05; bB.material.emissiveIntensity = on ? 0.05 : 0.45; };
    return g;
  }
  function guirlande(noel, c) { // le fil qui pend le long du haut du mur, ses fanions pastel — ou ses ampoules de Noël qui clignotent
    const { W, Q } = c, g = grp('guirlande'), pr = [], N = 9, pt = (u) => ({ x: u * W, y: murY(c, 14 + 26 * (1 - Math.pow(2 * u - 1, 2))) });
    for (let i = 0; i < 24; i++) { const a = pt(i / 24), b = pt((i + 1) / 24), dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy); pr.push(P(M.cylindre(0.7, 0.7, Math.ceil(l), 5), Q.bois, { x: a.x, y: a.y, z: 6, rz: Math.atan2(dy, dx) - Math.PI / 2 })); }
    const lit = [[], []], off = [[], []];
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, p = pt(u);
      if (!noel) pr.push(P(triangle(12, c.wy(11)), PASTEL[i % PASTEL.length], { x: p.x, y: p.y, z: 6 }));
      else { lit[i % 2].push(P(M.sphere(3.5, 10), ['#FF6B8B', '#5FD3A4', '#FFC84A', '#9BD0FF'][i % 4], { x: p.x, y: p.y - c.wy(5), z: 6 })); off[i % 2].push(P(M.sphere(3.5, 10), '#E8E0D5', { x: p.x, y: p.y - c.wy(5), z: 6 })); pr.push(P(M.cylindre(1.2, 1.2, 2.5, 6), L, { x: p.x, y: p.y - c.wy(5) + 2.5, z: 6 })); }
    }
    g.add(M.maille(pr, { ombre: false }));
    if (noel) { const ms = [lit[0], off[0], lit[1], off[1]].map((l) => { const m = M.maille(l, { ombre: false }); g.add(m); return m; }); ms[0].material = ms[2].material = matDe('ampoules', () => propre({ vertexColors: true, emissive: '#FFFFFF', emissiveIntensity: 0.45 })); g.userData.anime = (E) => { const on = Math.sin(E.t * 5) > 0; ms[0].visible = on; ms[1].visible = !on; ms[2].visible = !on; ms[3].visible = on; }; }
    return g;
  }
  function fanions(c) { const g = grp('fanions'), pr = []; for (let i = 0; i < 12; i++) pr.push(P(triangle(14, c.wy(11)), ['#2B5BD7', '#FFFFFF', '#E1496C'][i % 3], { x: (i + 0.5) / 12 * c.W, y: murY(c, 16), z: 6 })); g.add(M.maille(pr, { ombre: false })); return g; }
  function coeurs(c) { // six cœurs roses au bas du mur, qui flottent doucement
    const g = grp('coeurs'), ms = [], y0 = murY(c, c.LAY.murH - 18);
    for (let i = 0; i < 6; i++) { const m = M.mesh(coeur(6), M.mat('#FF6B8B'), { x: c.W * 0.5 + (i - 2.5) * 22, y: y0, z: 6, sy: 1 / c.CY }, { ombre: false }); ms.push(m); g.add(m); }
    g.userData.anime = (E) => { for (let i = 0; i < 6; i++) ms[i].position.y = y0 + Math.sin(E.t * 2 + i) * 3; };
    return g;
  }
  function etagere(n, boites, c) { // deux planches au mur : des pains debout et des boules dorées, trois boîtes à rubans si la pâtisserie fine est ouverte
    const e = c.LAY.etagere, Q = c.Q, dy = Math.max(16, c.LAY.T * 0.1), g = grp('etagere'), pr = [], cw = e.w / 5, cx = e.x + e.w / 2;
    for (let r = 0; r < 2; r++) {
      const Yp = murY(c, e.y + r * dy + 12);
      pr.push(P(bo(e.w, 3, 11, 1), Q.bois, { x: cx, y: Yp - 3, z: 5.5 }), P(bo(2.2, 7, 7, 0.6), Q.bois, { x: e.x + 5, y: Yp - 10, z: 3.5 }), P(bo(2.2, 7, 7, 0.6), Q.bois, { x: e.x + e.w - 5, y: Yp - 10, z: 3.5 }));
      const nb = r === 1 && boites ? 2 : 5;
      for (let i = 0; i < Math.min(nb, n - r * 5); i++) {
        const px = e.x + cw * (i + 0.5), l = c.wy(11) - 5;
        if (r === 1 && i % 2) pr.push(P(M.sphere(cw * 0.42, 10), '#D99A4E', { x: px, y: Yp + cw * 0.3, z: 5.5, sy: 0.72 }));
        else pr.push(P(M.capsule(2.5, l, 8), i % 2 ? '#E8B46A' : '#D99A4E', { x: px, y: Yp + 2.5 + l / 2, z: 5.5, rz: 0.08 * (i % 2 ? -1 : 1) }));
      }
      if (r === 1 && boites) for (let i = 0; i < 3; i++) { const bx = e.x + e.w * 0.42 + i * e.w * 0.2 + e.w * 0.085, bw = e.w * 0.17, bh = c.wy(10); pr.push(P(bo(bw, bh, 8, 1), ['#FFE1EA', '#E7D4FF', '#FFF3C4'][i], { x: bx, y: Yp, z: 5.5 }), P(bo(1.4, bh + 0.4, 8.6, 0.3), PASTEL[i], { x: bx, y: Yp - 0.2, z: 5.5 }), P(bo(bw + 0.4, 1.4, 8.6, 0.3), PASTEL[i], { x: bx, y: Yp + bh * 0.55, z: 5.5 })); }
    }
    g.add(M.maille(pr)); return g;
  }
  function cadre(x, y, c) { // un petit tableau : cadre bois, marge blanche, toile peinte (ciel, soleil, collines)
    const g = grp('cadre', x, murY(c, y + 12), 1.5), h = c.wy(24);
    g.add(M.maille([P(bo(32, h, 3, 0.8), c.Q.bois), P(bo(28, h - c.wy(4), 1.5, 0.4), '#FFFFFF', { z: 1.6 })]));
    g.add(M.mesh(M.plan(26, h - c.wy(6)), matDe('toile', () => propre({ map: toile(), emissive: '#FFFFFF', emissiveMap: toile(), emissiveIntensity: 0.3 })), { z: 2.5 }, { ombre: false }));
    return g;
  }
  function horloge(c) { // cadran blanc cerclé de bois, deux aiguilles tournées par anime selon l'heure ; étirée pour paraître ronde à l'écran
    const h = c.LAY.horloge, g = grp('horloge', h.x, murY(c, h.y), 1); g.scale.y = 1 / c.CY;
    g.add(M.maille([P(M.cylindre(10, 10, 1.5, 24), '#FFFFFF', { rx: Math.PI / 2 }), P(M.tore(10, 1.3, TAU, 8, 28), c.Q.bois, { z: 1.5 }), P(M.sphere(1.4, 8), '#E1496C', { z: 2.6 })]));
    const ah = M.mesh(M.boiteSimple(1.6, 5, 0.8), M.mat(L), { z: 1.8 }, { ombre: false }), am = M.mesh(M.boiteSimple(1.3, 7.5, 0.8), M.mat(L), { z: 2.2 }, { ombre: false }); g.add(ah, am);
    g.userData.anime = (E) => { const d = E.d; if (!d) return; const mn = d.getMinutes() / 60; ah.rotation.z = -((d.getHours() % 12) + mn) / 12 * TAU; am.rotation.z = -mn * TAU; };
    return g;
  }
  function diplome(c) { // le diplôme du boulanger : cadre bois, parchemin, trois lignes grises, le sceau rouge
    const d = c.LAY.diplome, g = grp('diplome', d.x, murY(c, d.y + 13), 1.2), h = c.wy(26), pr = [];
    pr.push(P(bo(22, h, 2.4, 0.8), c.Q.bois), P(bo(16, c.wy(20), 1.2, 0.4), '#FFFDF5', { z: 1.4 }));
    for (let k = 0; k < 3; k++) pr.push(P(bo(10, 0.8, 0.5, 0.2), '#B5A49A', { y: c.wy(5 - k * 4), z: 2.1 }));
    pr.push(P(M.sphere(2.5, 8), '#E1496C', { x: 3, y: -c.wy(6), z: 2.2, sz: 0.5 }));
    g.add(M.maille(pr)); return g;
  }
  function lampe(c) { // la lampe du fournil : un dôme accent fixé en haut du mur par une potence, l'ampoule qui s'allume le soir (pas de cordon : il n'y a pas de plafond)
    const l = c.LAY.lampe, g = grp('lampe', l.x, murY(c, l.y + 8), 0), lampes = []; g.userData.lampes = lampes;
    g.add(M.maille([P(bo(3, 3, 12, 1), L, { y: 4, z: 6 }), P(bo(8, 8, 2, 1.5), M.assombrir(c.Q.accent, 0.2), { y: 1, z: 1 }), P(M.cylindre(4, 11, 9, 14), c.Q.accent, { y: -5, z: 13 })], { ombre: false }));
    const m = M.mesh(M.sphere(3.6, 10), lumineux('#FFF3C4', 0), { y: -5, z: 13 }, { ombre: false }); g.add(m); lampes.push(m);
    g.userData.anime = (E) => { m.material.emissiveIntensity = E.lampes; };
    return g;
  }

  function propSaison(tag, c) { // sur le comptoir : la citrouille, la galette couronnée, les trois œufs ou les deux glaces
    const o = surDessus(c, c.LAY.saison), g = grp('propSaison', o.x, o.y, o.z), pr = [];
    if (tag === 'halloween') { pr.push(P(M.sphere(8, 12), '#F28C28', { y: 6.5, sx: 1.15, sy: 0.8 }), P(M.tore(7, 1.2, TAU, 6, 16), '#E07A1E', { y: 6.5, rx: Math.PI / 2, sx: 1.15 }), P(bo(3, 5, 3, 1), '#3FB889', { y: 12.5 })); for (const sx of [-1, 1]) pr.push(P(M.cone(1.6, 2.6, 3), L, { x: sx * 3.5, y: 6.5, z: 7.6, rx: Math.PI / 2 })); pr.push(P(bo(7, 1.4, 1, 0.3), L, { y: 3.5, z: 7.6 })); }
    else if (tag === 'galette') { pr.push(P(M.cylindre(11, 10, 4.5, 16), '#E8B46A', { sz: 0.75 }), P(M.cylindre(9.5, 9.5, 0.6, 16), '#D9A056', { y: 4.5, sz: 0.75 }), P(M.cylindre(6.5, 6.5, 5, 10), '#FFC84A', { y: 5, sz: 0.9 })); for (let k = 0; k < 5; k++) { const a = k * TAU / 5; pr.push(P(M.cone(1.8, 4, 4), '#FFC84A', { x: Math.cos(a) * 6, y: 10, z: Math.sin(a) * 6 * 0.9 })); } }
    else if (tag === 'paques') ['#FF9FB2', '#9BD0FF', '#B5E88A'].forEach((col, k) => pr.push(P(M.sphere(3.6, 10), col, { x: (k - 1) * 8.5, y: 4.8, sy: 1.35 }), P(M.tore(3.3, 0.5, TAU, 5, 14), '#FFFFFF', { x: (k - 1) * 8.5, y: 5.6, rx: Math.PI / 2, sx: 0.95, sz: 0.95 })));
    else for (let k = 0; k < 2; k++) pr.push(P(M.cone(4, 11, 8), '#E8B46A', { x: k * 11 - 5.5, y: 11, rx: Math.PI }), P(M.sphere(4.6, 10), k ? '#FF9FB2' : '#9BE8C2', { x: k * 11 - 5.5, y: 14 }));
    g.add(M.maille(pr)); return g;
  }
  // ─── la composition d'ensemble (pour l'atelier et la scène) ───
  function vitrineDemo(k, c) { // le comptoir et, à chaque place de la vitrine, une boule dorée de la taille d'une pâtisserie
    const cp = comptoir(k, c), n = c.niv ? c.niv.filter((v) => v > 0).length : 4, g = grp('pâtisseries');
    for (const pl of cp.userData.vitrine.places(n)) g.add(M.mesh(M.sphere(pl.s / 2, 10), M.mat('#E8B46A'), { x: pl.x, y: pl.y + pl.s / 2, z: pl.z, sy: 0.75 }));
    return [cp, g];
  }
  function tout(c) { // la salle et tout le mobilier aux crans de ctx.crans, plus les petits objets ; ctx.demo ajoute des pâtisseries factices
    const k = c.crans, LAY = c.LAY, out = [salle(c), froid(k.froid, c), four(k.four, c)], cp = comptoir(k.vitrine, c); c.dessusY = cp.userData.dessusY;
    out.push(cp, caisse(k.caisse, c), tables(k.tables, c), deco(k.deco, c), plan(c), presentoir(4, c), ardoise(c), etagere(8, true, c), cadre(LAY.cadre.x, LAY.cadre.y, c), horloge(c), diplome(c), fleurs(c), chat(c), paillasson(k.deco >= 1, c), lampe(c), plante(LAY.plante.x, LAY.plante.y, c));
    if (c.tags.includes('noel')) { out.push(sapin(c)); if (k.deco < 3) out.push(guirlande(true, c)); } if (c.tags.includes('fete')) out.push(fanions(c)); if (c.tags.includes('coeurs')) out.push(coeurs(c));
    for (const tg of ['halloween', 'galette', 'paques', 'ete']) if (c.tags.includes(tg)) { out.push(propSaison(tg, c)); break; }
    if (c.demo) out.push(vitrineDemo(k.vitrine, c)[1]);
    return out;
  }
  return { textureSol, textureMur, salle, froid, four, comptoir, caisse, tables, deco, plan, presentoir, ardoise, plante, fleurs, chat, paillasson, sapin, guirlande, fanions, coeurs, etagere, cadre, horloge, diplome, lampe, propSaison, surDessus, dimsComptoir, vitrineDemo, tout };
})();
if (typeof module !== 'undefined') module.exports = MEUBLES;
