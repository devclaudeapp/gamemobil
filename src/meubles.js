/* LE FOURNIL — le mobilier et la salle en 3D : le sol et le mur du fond (avec la fenêtre et la porte), la chambre froide, le four,
   le comptoir et sa vitrine, la caisse, les tables du salon de thé, la décoration, et tous les petits objets qui font vivre la boutique.
   Low-poly arrondi pastel : des boîtes biseautées fusionnées en un seul maillage par meuble, des couleurs plates, pas de texte.
   Repère : X = x écran, Y vers le haut, Z = 0 au pied du mur, +Z vers le spectateur ; 1 unité = 1 px d'écran en largeur.
   Un meuble dont le plan 2D donne le rectangle { x, y, w, h } a son bord avant à Z = wz(y + h) ; sa profondeur (le dessus en 2D) et sa hauteur (la face)
   se partagent le rectangle, si bien que la boîte projetée recouvre le rectangle du plan sans jamais déborder vers l'avant. */
const MEUBLES = typeof THREE === 'undefined' ? null : (() => { // sans Three.js (fichier non chargé), le module vaut null et le jeu démarre sans 3D
  'use strict';
  const M = MODELES, P = M.part, TAU = Math.PI * 2, HP = Math.PI / 2, L = '#4A3328';
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
  // les modèles CC0 de Kenney (src/kenney.js), quand ils sont chargés : une pièce cuite qui entre dans la fusion (null sinon : on garde le fait main)
  const KN = () => (typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret ? KENNEY : null);
  const kp = (nom, o, couleurs, col) => { const k = KN(); return k ? k.part(nom, o, couleurs, col) : null; };
  const matDe = (k, fab) => { let m = MATS.get(k); if (!m) { m = M.partager(fab()); MATS.set(k, m); } return m; }; // en cache par quartier : partagé, jamais libéré
  function forme(k, fab) { return M.extrusion(k, fab(), 1, 0); } // une forme plate extrudée d'une unité, mise en cache par clé
  const triangle = (w, h) => forme('tri' + w + '|' + h, () => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, -h); s.closePath(); return s; }); // la pointe en bas
  const coeur = (s) => forme('coeur' + s, () => { const f = new THREE.Shape(); f.moveTo(0, -s * 0.9); f.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.6, s * 0.9, 0, s * 0.3); f.bezierCurveTo(s * 0.6, s * 0.9, s * 1.3, -s * 0.1, 0, -s * 0.9); return f; });
  const arche = (w, h) => forme('arche' + r2(w) + '|' + r2(h), () => { const s = new THREE.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; });
  // ─── les textures du sol et du mur : les motifs 2D, discrets et pastel, mis en cache par quartier ───
  // Un décor (Q.id) par quartier ET par palier du standing (« paris-s3 ») : jusqu'à 60. Le cache ne garde que les SALLES_MAX derniers vus
  // (la boutique, celle d'avant pendant une transition, une visite ou l'atelier) ; les autres rendent leurs textures et leurs matériaux.
  const SALLES = [], SALLES_MAX = 3;
  function retenirSalle(id) {
    const i = SALLES.indexOf(id); if (i === 0) return; if (i > 0) SALLES.splice(i, 1); SALLES.unshift(id);
    while (SALLES.length > SALLES_MAX) {
      const v = SALLES.pop();
      for (const k of ['sol' + v, 'mur' + v]) { const tx = TEX.get(k); if (tx) { tx.dispose(); TEX.delete(k); } const m = MATS.get(k); if (m) { M.oublier(m); MATS.delete(k); } }
    }
  }
  function textureSol(Q) {
    retenirSalle(Q.id); let tx = TEX.get('sol' + Q.id); if (tx) return tx;
    tx = M.texture((c, w, h) => { // une tuile de 256 unités de côté
      c.fillStyle = Q.sol; c.fillRect(0, 0, w, h);
      if (Q.solStyle === 'planches') { const hb = 16; for (let r = 0; r * hb < h; r++) { const y = r * hb; c.fillStyle = r % 2 ? Q.sol2 : 'rgba(0,0,0,.035)'; c.fillRect(0, y, w, hb - 1); c.fillStyle = 'rgba(74,51,40,.10)'; for (let x = (r * 53) % 128; x < w; x += 128) c.fillRect(x, y, 1.5, hb - 1); } }
      else if (Q.solStyle === 'damier') { c.fillStyle = Q.sol2; c.globalAlpha = 0.9; const sw = w / 12, sh = h / 10; for (let r = 0; r < 10; r++) for (let k = 0; k < 12; k++) if ((r + k) % 2 === 0) c.fillRect(k * sw, r * sh, sw + 0.5, sh + 0.5); }
      else if (Q.solStyle === 'chevrons') solChevrons(c, w, h, Q);
      else if (Q.solStyle === 'marbre2') solMarbre(c, w, h, Q);
      else { c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1.6; for (let k = 0; k < 4; k++) { const x0 = k * w / 4 + 30; c.beginPath(); c.moveTo(x0, 0); c.bezierCurveTo(x0 + 45, h * 0.35, x0 - 45, h * 0.65, x0, h); c.stroke(); } }
      if (Q.standing >= 3 && Q.solStyle === 'marbre') { c.fillStyle = Q.or; c.globalAlpha = 0.55; for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x + 3.5, y); c.lineTo(x, y + 3.5); c.lineTo(x - 3.5, y); c.fill(); } c.globalAlpha = 1; } // le marbre d'origine (la ville, la capitale) : des cabochons dorés
    }, 256, 256, { repete: [1, 1] });
    tx.userData.partagee = true; TEX.set('sol' + Q.id, tx); return tx;
  }
  // ─── le standing (Q.standing, src/vie.js decor) : le parquet en chevrons (point de Hongrie), le marbre veiné aux joints d'or ───
  const clair = (hex) => { const k = new THREE.Color(hex); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b > 0.35; };
  function solChevrons(c, w, h, Q) { // des lames en V, colonnes de 32 de large, rangs de 16 : la tuile de 256 se raccorde de tous les côtés
    const cw = 32, hb = 16, k = 0.5, A = Q.sol, B = Q.solB || M.assombrir(Q.sol, 0.1), joint = clair(Q.sol) ? 'rgba(74,51,40,.16)' : 'rgba(255,255,255,.10)';
    c.lineWidth = 1; c.strokeStyle = joint;
    for (let x0 = 0; x0 < w; x0 += 2 * cw) for (let j = -3; j * hb < h + 2 * cw; j++) {
      const y = j * hb;
      for (const [pts, col] of [[[[x0, y + cw * k], [x0 + cw, y], [x0 + cw, y + hb], [x0, y + cw * k + hb]], j % 2 ? A : B], [[[x0 + cw, y], [x0 + 2 * cw, y + cw * k], [x0 + 2 * cw, y + cw * k + hb], [x0 + cw, y + hb]], j % 2 ? B : A]]) {
        c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); c.fillStyle = col; c.fill(); c.stroke();
      }
    }
  }
  function solMarbre(c, w, h, Q) { // des dalles de 64, deux tons à peine différents, veinées ; les joints (or au dernier palier) et leurs cabochons
    const lum = clair(Q.sol), t = 64; let g = 7;
    const hasard = () => { g = (g * 16807) % 2147483647; return g / 2147483647; }; // le même marbre à chaque fois
    for (let y = 0; y < h; y += t) for (let x = 0; x < w; x += t) {
      c.fillStyle = ((x + y) / t) % 2 ? Q.sol : M.melange(Q.sol, lum ? '#FFFFFF' : '#000000', 0.12); c.fillRect(x, y, t, t);
      c.save(); c.beginPath(); c.rect(x, y, t, t); c.clip(); c.strokeStyle = lum ? 'rgba(120,100,90,.22)' : 'rgba(255,255,255,.16)';
      for (let v = 0; v < 2; v++) { c.lineWidth = 0.8 + hasard() * 1.4; c.beginPath(); const x0 = x + hasard() * t, y0 = y; c.moveTo(x0, y0); c.bezierCurveTo(x0 + (hasard() - 0.5) * 60, y + t * 0.4, x0 + (hasard() - 0.5) * 60, y + t * 0.7, x + hasard() * t, y + t); c.stroke(); }
      c.restore();
    }
    c.fillStyle = Q.solOr ? Q.or : lum ? 'rgba(74,51,40,.18)' : 'rgba(255,255,255,.14)';
    for (let k = 0; k < w; k += t) { c.fillRect(k - 0.75, 0, 1.5, h); c.fillRect(0, k - 0.75, w, 1.5); }
    c.fillStyle = Q.or; for (let y = 0; y <= h; y += t) for (let x = 0; x <= w; x += t) { c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.fill(); }
  }
  // le mur monté en gamme : marbre plus marqué, moulures (filet laiton puis or), pilastres, lambris bas et sa cimaise, corniche dorée
  function murStanding(c, Q) {
    const s = Q.standing || 0, y0 = 81 * 0.62, filet = s >= 3 ? Q.or : M.assombrir(Q.mur2, 0.12);
    if (s >= 4) { c.strokeStyle = 'rgba(120,100,90,.16)'; c.lineWidth = 1; for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(k * 47 + 12, 0); c.bezierCurveTo(k * 47 - 18, 22, k * 47 + 40, 34, k * 47 + 6, y0); c.stroke(); } }
    const haut = Q.corniche ? 9 : 6;
    if (Q.panneaux) { c.strokeStyle = filet; c.lineWidth = 1.3; for (let x = 6; x + 40 < 390; x += 48) { c.strokeRect(x, haut + 2, 40, y0 - haut - 7); if (s >= 3) { c.lineWidth = 0.6; c.strokeRect(x + 3, haut + 5, 34, y0 - haut - 13); c.lineWidth = 1.3; } } }
    if (Q.pilastres) for (let x = 0; x <= 390; x += 97.5) { c.fillStyle = M.eclaircir(Q.mur, 0.5); c.fillRect(x - 4, haut, 8, y0 - haut); c.fillStyle = M.assombrir(Q.mur2, 0.06); c.fillRect(x - 1.5, haut + 4, 0.8, y0 - haut - 8); c.fillRect(x + 0.7, haut + 4, 0.8, y0 - haut - 8); c.fillStyle = Q.or; c.fillRect(x - 5.5, haut, 11, 2.2); }
    if (Q.lambris) {
      const bois = M.melange(Q.mur2, Q.bois, 0.32 + 0.04 * s); c.fillStyle = bois; c.fillRect(0, y0, 390, 81 - y0);
      c.strokeStyle = M.assombrir(bois, 0.14); c.lineWidth = 1; for (let x = 4; x + 22 < 392; x += 28) c.strokeRect(x, y0 + 4, 22, 81 - y0 - 9);
      c.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 4; x + 22 < 392; x += 28) c.fillRect(x + 1, y0 + 5, 20, 1);
      c.fillStyle = M.assombrir(Q.bois, 0.1); c.fillRect(0, y0 - 1.5, 390, 3); c.fillStyle = s >= 2 ? Q.or : M.eclaircir(Q.bois, 0.25); c.fillRect(0, y0 - 2.4, 390, 0.9); // la cimaise et son filet
    }
    if (Q.corniche) { c.fillStyle = M.assombrir(Q.mur2, 0.05); c.fillRect(0, 0, 390, haut - 2); c.fillStyle = Q.or; c.fillRect(0, haut - 2.4, 390, 1.6); c.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 3; x < 390; x += 7) c.fillRect(x, 2, 3, haut - 6); }
  }
  function textureMur(Q) {
    retenirSalle(Q.id); let tx = TEX.get('mur' + Q.id); if (tx) return tx;
    tx = M.texture((c, w, h) => { // dessiné dans le repère du mur de référence : 390 × 81 px d'écran
      c.scale(w / 390, h / 81);
      const g = c.createLinearGradient(0, 0, 0, 81); g.addColorStop(0, Q.mur); g.addColorStop(1, Q.mur2); c.fillStyle = g; c.fillRect(0, 0, 390, 81);
      if (Q.murStyle === 'lignes') { c.fillStyle = Q.mur2; for (let y = 7; y < 81; y += 14) c.fillRect(0, y, 390, 1.4); }
      if (Q.murStyle === 'rondins') for (let y = 0; y < 81; y += 13) { c.fillStyle = Q.mur2; c.fillRect(0, y, 390, 2); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, y + 4, 390, 1); }
      if (Q.murStyle === 'moulures' && !Q.panneaux) { c.strokeStyle = Q.mur2; c.lineWidth = 2; c.strokeRect(390 * 0.32, 14.8, 390 * 0.33, 81 - 29.6); c.lineWidth = 1; c.strokeRect(390 * 0.32 + 5, 19.8, 390 * 0.33 - 10, 81 - 39.6); }
      if (Q.murStyle === 'bande') { c.fillStyle = Q.accent; c.fillRect(0, 81 - 12, 390, 4); c.fillStyle = 'rgba(58,134,200,.12)'; c.fillRect(0, 81 - 16, 390, 3); }
      if (Q.murStyle === 'hantee') { // le papier peint du manoir : de larges rayures, une petite chauve-souris entre deux, le lambris sombre et sa cimaise
        for (let x = 0; x < 390; x += 26) { c.fillStyle = 'rgba(30,20,50,.28)'; c.fillRect(x + 13, 0, 13, 81); }
        c.fillStyle = 'rgba(205,189,255,.22)'; for (let x = 6.5, k = 0; x < 390; x += 26, k++) { const y = k % 2 ? 18 : 34; c.beginPath(); c.ellipse(x, y, 1.6, 1.2, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(x - 1, y); c.quadraticCurveTo(x - 3, y - 2.2, x - 5.2, y - 0.4); c.quadraticCurveTo(x - 3, y + 0.2, x - 1, y + 0.8); c.moveTo(x + 1, y); c.quadraticCurveTo(x + 3, y - 2.2, x + 5.2, y - 0.4); c.quadraticCurveTo(x + 3, y + 0.2, x + 1, y + 0.8); c.fill(); }
        const y0 = 81 * 0.66; c.fillStyle = '#2A1E33'; c.fillRect(0, y0, 390, 81 - y0); c.fillStyle = '#3A2A48'; for (let x = 4; x < 390; x += 32) c.fillRect(x, y0 + 4, 26, 81 - y0 - 8);
        c.fillStyle = '#5C4232'; c.fillRect(0, y0 - 1.6, 390, 2.6); c.fillStyle = 'rgba(255,138,61,.55)'; c.fillRect(0, y0 - 2.2, 390, 0.7);
      }
      if (Q.murStyle === 'marbre') { c.strokeStyle = 'rgba(120,100,90,.12)'; c.lineWidth = 1.5; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(k * 78 - 20, 0); c.quadraticCurveTo(k * 78 + 30, 40, k * 78 + 10, 81); c.stroke(); } }
      if (Q.standing) murStanding(c, Q);
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
    const cadreCol = Q.cadre || (Q.vue === 'ville' ? '#2E2A36' : Q.vue === 'montagne' ? Q.bois : '#FFFFFF'), hp = c.wy(4), pr = []; // (Q.cadre : un décor qui choisit ses cadres, la Maison hantée)
    const ar = LAY.arriere, ag = ar ? ar.x - 3 : p.x, ad = ar ? ar.x + ar.w + 3 : p.x; // la plinthe s'interrompt aussi devant la petite porte du fond
    pr.push(P(bo(ag, hp, 3, 0.8), Q.bois, { x: ag / 2, z: 1.5 }), P(bo(W - p.x - p.w, hp, 3, 0.8), Q.bois, { x: (W + p.x + p.w) / 2, z: 1.5 }));
    if (ar) { pr.push(P(bo(p.x - ad, hp, 3, 0.8), Q.bois, { x: (ad + p.x) / 2, z: 1.5 })); pr.push(...porteArriere(c, ar)); }
    const fh = fy1 - fy0, fcx = f.x + f.w / 2, fcy = (fy0 + fy1) / 2;
    pr.push(P(bo(f.w + 6, 4, 5, 1), cadreCol, { x: fcx, y: fy1 - 1, z: 2.5 }), P(bo(f.w + 6, 4, 5, 1), cadreCol, { x: fcx, y: fy0 - 3, z: 2.5 }), P(bo(4, fh, 5, 1), cadreCol, { x: f.x - 1, y: fy0, z: 2.5 }), P(bo(4, fh, 5, 1), cadreCol, { x: f.x + f.w + 1, y: fy0, z: 2.5 }));
    pr.push(P(bo(2, fh, 3, 0.6), cadreCol, { x: fcx, y: fy0, z: 0.5 }), P(bo(f.w, 2, 3, 0.6), cadreCol, { x: fcx, y: fcy - 1, z: 0.5 })); // les croisillons
    pr.push(P(bo(f.w + 12, 3, 8, 1), Q.bois, { x: fcx, y: fy0 - 5, z: 3 })); // l'appui
    pr.push(P(bo(4, py1 + 2, 5, 1), cadreCol, { x: p.x - 1, z: 2.5 }), P(bo(4, py1 + 2, 5, 1), cadreCol, { x: p.x + p.w + 1, z: 2.5 }), P(bo(p.w + 6, 4, 5, 1), cadreCol, { x: p.x + p.w / 2, y: py1 - 1, z: 2.5 }));
    const dv = LAY.devanture; if (dv) pr.push(...devanture(c, dv, cadreCol));
    g.add(M.maille(pr, { recoit: true }));
    if (dv) g.add(trottoir(c, dv.y));
    g.add(M.mesh(M.plan(f.w, fh), M.MAT.verre, { x: fcx, y: fcy, z: -3 }, { ombre: false })); // la vitre
    g.add(porte(c, p, py1));
    // le plan extérieur (la scène y pose la vue du quartier) et les deux taches de lumière au sol
    const ext = M.mesh(M.plan(p.x + p.w + 80 - f.x, Hm + 20), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), { x: (f.x + p.x + p.w) / 2, y: (Hm + 20) / 2, z: -60 }, { ombre: false }); g.add(ext); g.userData.exterieur = ext;
    const t1 = c.wd(0.14 * LAY.T), t2 = c.wd(0.1 * LAY.T);
    const m1 = M.mesh(M.plan(f.w - 12, t1), M.MAT.tache, { x: fcx, y: 0.4, z: t1 / 2, rx: -Math.PI / 2 }, { ombre: false }), m2 = M.mesh(M.plan(p.w - 8, t2), M.MAT.tache, { x: p.x + p.w / 2, y: 0.4, z: t2 / 2, rx: -Math.PI / 2 }, { ombre: false });
    g.add(m1, m2); g.userData.taches = [m1, m2];
    return g;
  }
  // ─── la devanture, en bas de la salle : une allège de bois basse (on voit par-dessus), coupée par la porte au bout de l'allée,
  //     deux montants et le seuil ; ses pièces entrent dans le maillage de la salle (pas d'appel de dessin en plus) ───
  function devanture(c, dv, cadreCol) {
    const { W, Q, K } = c, z = c.wz(dv.y) + 2, hA = 9, ep = 5, pr = [], x0 = dv.porte.x0, x1 = dv.porte.x1;
    for (const [a, b] of [[-2, x0], [x1, W + 2]]) {
      pr.push(P(bo(b - a, hA, ep, 1.2), Q.bois, { x: (a + b) / 2, z }), P(bo(b - a, 2, ep + 3, 0.8), Q.comptoir2, { x: (a + b) / 2, y: hA, z }));
      for (let x = a + 26 * K; x < b - 12 * K; x += 52 * K) pr.push(P(bo(3, 15, 3, 0.8), cadreCol, { x, y: hA, z: z - 0.5 })); // les petits montants des vitres basses
    }
    for (const x of [x0, x1]) pr.push(P(bo(5, 32, 7, 1.2), cadreCol, { x, z })); // le chambranle de la porte
    pr.push(P(bo(x1 - x0 - 4, 0.8, 9, 0.3), M.eclaircir(Q.bois, 0.3), { x: (x0 + x1) / 2, z })); // le seuil
    return pr;
  }
  // le trottoir et la rue : un plan peint (les pavés, la bordure, la chaussée) de la devanture au bas de l'écran ; un par salle (libéré avec elle)
  function trottoir(c, y0) {
    const { W, H, Q, LAY } = c, z0 = c.wz(y0) + 2, D = c.wd(H + 40 - y0), tr = LAY.trottoir, kb = (tr.bord - y0) / (H + 40 - y0); // kb : la part du trottoir, le reste est la chaussée
    const qid = Q.base || Q.id, p0 = M.melange('#DDD5C9', Q.accent, 0.14); // les quartiers du parcours : des pavés teintés de leur couleur
    const pav = { village: ['#E3D3BE', '#D6C3AA'], paris: ['#C9CED6', '#B7BDC7'], mer: ['#F1E8D6', '#E4D8C0'], montagne: ['#C9BCA9', '#B8AA95'], ville: ['#8F8C99', '#7F7C89'] }[qid] || [p0, M.assombrir(p0, 0.07)];
    const route = qid === 'ville' ? '#3B3944' : qid === 'montagne' || qid === 'cimes' ? '#7A7E86' : '#6E6C78';
    const tx = M.texture((x, w, h) => {
      const hb = h * kb; x.fillStyle = pav[1]; x.fillRect(0, 0, w, hb);
      const pw = 18, ph = 10; for (let r = 0; r * ph < hb; r++) for (let k = -1; k * pw < w; k++) { x.fillStyle = (r * 7 + k * 3) % 5 ? pav[0] : M.eclaircir(pav[0], 0.18); x.beginPath(); x.roundRect(k * pw + (r % 2) * pw / 2 + 1, r * ph + 1, pw - 2, ph - 2, 2.5); x.fill(); }
      x.fillStyle = '#F4F1EA'; x.fillRect(0, hb - 3, w, 6); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, hb + 3, w, 2); // la bordure
      x.fillStyle = route; x.fillRect(0, hb + 5, w, h - hb - 5);
      x.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < w; k += 46) x.fillRect(k + 8, hb + 5 + (h - hb - 5) * 0.55, 26, 3); // les pointillés de la chaussée
    }, 256, Math.max(64, Math.min(512, Math.round(256 * D / W))));
    const m = M.mesh(M.plan(W + 4, D), propre({ map: tx }), { x: W / 2, y: 0.3, z: z0 + D / 2, rx: -Math.PI / 2 }, { ombre: false, recoit: true });
    m.userData.nom = 'trottoir'; return m;
  }
  // la petite porte de l'arrière-boutique : un vantail de bois cintré dans son chambranle, deux pentures, le bouton laiton, une plaque
  // et un filet de lumière chaude qui passe dessous (on y joue aux cartes…). Ses pièces se fusionnent avec la plinthe et les cadres de la
  // salle : pas un appel de dessin de plus. Le cintre est dessiné en pixels d'écran puis étiré de 1/CY : il paraît rond en plongée.
  function porteArriere(c, a) {
    const Q = c.Q, hpx = c.LAY.murH - a.y, w = a.w, cx = a.x + a.w / 2, k = 1 / c.CY, bois = M.assombrir(Q.bois, 0.16), fonce = M.assombrir(Q.bois, 0.34), pr = [];
    pr.push(P(arche(w + 5, hpx + 2.5), fonce, { x: cx, y: (hpx + 2.5) / 2 * k, z: 1, sy: k, sz: 2 })); // le chambranle
    pr.push(P(arche(w, hpx), bois, { x: cx, y: hpx / 2 * k, z: 1.8, sy: k, sz: 2.5 })); // le vantail
    for (const u of [-1, 1]) pr.push(P(bo(0.9, c.wy(hpx - w / 2 - 3), 0.6, 0.2), fonce, { x: cx + u * w / 6, y: 1.5, z: 3.1 })); // les joints des planches
    for (const yy of [5, hpx - w / 2 - 2]) pr.push(P(bo(w * 0.55, 1.8, 0.8, 0.3), '#5B4A44', { x: cx - w * 0.17, y: c.wy(yy), z: 3.3 })); // les pentures
    pr.push(P(bo(8, c.wy(4.5), 0.8, 0.5), '#FFF7EC', { x: cx, y: c.wy(hpx * 0.62), z: 3.3 })); // la plaque « Privé » (sans mot : elle se devine)
    pr.push(P(M.sphere(1.5, 8), '#FFC84A', { x: cx + w / 2 - 4, y: c.wy(hpx * 0.42), z: 3.6 })); // le bouton
    pr.push(P(bo(w - 4, 0.6, 7, 0.25), '#FFE3A0', { x: cx, y: 0.05, z: 6.5 })); // la lumière qui filtre sous la porte, sur le sol
    return pr;
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
    if (KN()) { // Kenney : le frigo blanc (Furniture Kit), le grand frigo inox à deux portes, puis la vitrine réfrigérée du Mini Market et sa barre à LED
      if (k >= 3) {
        pr.push(kp('freezers-standing', { w: f.w, h: h - 3, d, z: -d / 2 }), P(bo(f.w - 2, 4, d - 2, 1.5), '#FFFFFF', { y: h - 4, z: -d / 2 }));
        const led = M.mesh(bo(f.w - 12, 1.5, 1, 0.4), lumineux('#6CB8FF', 1), { y: h - 2.5, z: 0 }, { ombre: false }); g.add(led);
        g.userData.anime = (E) => { led.material.emissiveIntensity = Math.sin(E.t * 3) > 0 ? 1 : 0.25; };
      } else pr.push(kp(k >= 2 ? 'kitchenFridgeLarge' : 'kitchenFridge', { w: f.w, h, d, z: -d / 2 }, k >= 2 ? { metalLight: '#D5DAE1', metalMedium: '#8C939E' } : { metalLight: '#FBFBF8', metal: '#B9C6D2', metalDark: '#8C939E', glass: '#CFE9FA' }));
      if (k >= 2) pr.push(P(M.sphere(1.5, 6), '#6CB8FF', { x: -f.w / 2 + 7, y: h - 2.5, z: 0.6 }));
      g.add(M.maille(pr)); return g;
    }
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
    const n0 = c.nVitrine != null ? c.nVitrine : c.niv ? c.niv.filter((v) => v > 0).length : 4, rangees = k >= 2 && n0 > 3 ? 2 : 1;
    // le corps : deux piliers, le socle, le fond de la vitrine, le dessus
    pr.push(P(bo(8, H - e, prof, 2), Q.comptoir, { x: -w / 2 + 4, z: zc }), P(bo(w - 8 - vw, H - e, prof, 2), Q.comptoir, { x: vx + vw / 2 + (w - 8 - vw) / 2, z: zc }), P(bo(vw + 2, yb, prof, 1.5), Q.comptoir, { x: vx, z: zc }));
    pr.push(P(bo(vw + 2, H - e - yb + 1, 3, 1), M.eclaircir(Q.comptoir, 0.35), { x: vx, y: yb - 0.5, z: zB + 1.5 }));
    const sg = Q.standing || 0, dessus = sg >= 4 ? M.melange(Q.comptoir2, '#FFFFFF', 0.55) : Q.comptoir2; // le standing : un dessus de marbre clair (4+)
    pr.push(P(bo(w + 4, e, prof + 2, 1.5), dessus, { y: H - e, z: zc }), P(bo(w - 8, 0.8, 3, 0.3), M.eclaircir(dessus, 0.4), { y: H, z: zc + 1 }));
    if (sg >= 1) pr.push(P(bo(w + 3, 0.9, 0.8, 0.3), Q.or, { y: H - e * 0.5 - 0.45, z: zF + 1.4 })); // le filet laiton (or dès 3) au bord du dessus
    if (sg >= 2) { // la plinthe sombre, son filet, et deux pieds boule dorés aux coins
      pr.push(P(bo(w - 1, 2.6, 1.2, 0.5), M.assombrir(Q.comptoir, 0.32), { y: 0, z: zF + 0.4 }), P(bo(w - 1, 0.7, 1.4, 0.2), Q.or, { y: 2.6, z: zF + 0.4 }));
      for (const sx of [-1, 1]) pr.push(P(M.sphere(2.1, 8), Q.or, { x: sx * (w / 2 - 2.5), y: 1.6, z: zF + 0.8 }));
    }
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
    const cc = (Q.standing || 0) >= 3 ? Q.or : k >= 3 ? '#DDE6EE' : '#FFFFFF', ep = k >= 3 ? 3 : 2.4; // la vitrine dorée de la Grande maison
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
    if (KN()) { // la caisse enregistreuse du Mini Market (menthe, puis anthracite au dernier cran), la clochette au dernier cran ; l'écran qui s'allume à chaque vente reste le nôtre
      pr.push(kp('cash-register', { w: 30, h: 18, d: 20 }, null, k >= 3 ? '#9A8F9F' : '#E2FFF3'));
      if (k >= 3) pr.push(P(bo(7, 10, 5, 1.5), '#B9C6D2', { x: 15, z: -3 }), P(M.sphere(3, 10), '#FFC84A', { x: 15, y: 12.5, z: -3 }));
      g.add(M.maille(pr));
      const ecran = M.mesh(bo(k >= 2 ? 12 : 9, 6, 1, 1), propre({ color: '#FFFFFF' }), { x: -8, y: 11, z: 0.6, rx: -0.2 }); g.add(ecran);
      g.userData.anime = (E) => { ecran.material.color.copy(E.caisseFlash > 0.3 ? C_FLASH : C_BLANC); };
      return g;
    }
    pr.push(P(bo(24, 10, 16, 3), k >= 3 ? L : '#5FD3A4'));
    for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) pr.push(P(bo(4, 1, 3, 0.4), '#FFFFFF', { x: -6 + q * 6, y: 10, z: 1 + r * 4.5 }));
    if (k >= 3) pr.push(P(bo(7, 12, 5, 1.5), '#B9C6D2', { x: 13.5, z: -3 }), P(M.sphere(3, 10), '#FFC84A', { x: 13.5, y: 14.5, z: -3 }));
    g.add(M.maille(pr));
    const ecran = M.mesh(bo(k >= 2 ? 16 : 12, 9, 1.5, 1), propre({ color: '#FFFFFF' }), { y: 9.5, z: -5, rx: -0.35 }); g.add(ecran);
    g.add(M.mesh(bo(8, 1.2, 0.5, 0.2), M.mat('#3FB889'), { y: 9.5, z: -5, rx: -0.35 }, { ombre: false }).translateY(5).translateZ(0.8));
    g.userData.anime = (E) => { ecran.material.color.copy(E.caisseFlash > 0.3 ? C_FLASH : C_BLANC); };
    return g;
  }
  // ─── la salle (lot A des meubles) : les tables, le bar, le coin salon, la terrasse ; chaque meuble est UN maillage fusionné ───
  // En qualité haute et moyenne (c.hd : le lot HD « boutique » est là), les pièces viennent des meubles KayKit cuits (fournil/hd/meubles2/,
  // HDM.part : couleurs de sommets, pas de texture) ; sinon (éco, artefact, HD coupée), les pièces faites main (et celles de Kenney quand
  // elles sont chargées). Les couverts ne sont pas ici : un seul maillage instancié pour toutes les places (SCENE, MEUBLES.couverts).
  const hdp = (c, nom, o, col) => (c.hd && typeof HDM !== 'undefined' && HDM.part ? HDM.part('meubles2/' + nom, o, col) : null); // une pièce KayKit, ou null
  const HAUT = { table: 29, bar: 25, banquette: 11, terrasse: 29 }; // la hauteur des plateaux où l'on pose les couverts, par coin
  function pointilles(pr, r, c) { // l'emplacement d'un meuble pas encore acheté : un rectangle de tirets au sol (r : rectangle du plan, en pixels)
    const z0 = c.wz(r.y), z1 = c.wz(r.y + r.h), n = Math.max(2, Math.round(r.w / 14)), m = Math.max(2, Math.round((z1 - z0) / 14));
    for (let i = 0; i < n; i++) for (const z of [z0, z1]) pr.push(P(M.boiteSimple(r2(r.w / n * 0.55), 0.4, 1.4), '#FFFFFF', { x: r.x + (i + 0.5) * r.w / n, y: 0.3, z }));
    for (let i = 0; i < m; i++) for (const x of [r.x, r.x + r.w]) pr.push(P(M.boiteSimple(1.4, 0.4, r2((z1 - z0) / m * 0.55)), '#FFFFFF', { x, y: 0.3, z: z0 + (i + 0.5) * (z1 - z0) / m }));
  }
  function maillePointillee(pr, g) { const m = M.maille(pr, { ombre: false }); m.material = M.MAT.pointille; g.add(m); return g; }
  function tableRonde(pr, x, z, R, Ht, Q, c, nappe) { // une table ronde : KayKit, Kenney ou faite main ; son plateau aux couleurs du quartier
    const k = hdp(c, 'table_round_A_small', { w: 2 * R, d: 2 * R, h: Ht - 1, x, z, teinte: Q.comptoir }); if (k) { pr.push(k); if (nappe) pr.push(P(M.cylindre(R * 0.8, R * 0.8, 0.8, 20), Q.accent, { x, y: Ht - 1, z })); return; }
    if (KN()) { pr.push(kp('tableRound', { w: 2 * R, d: 2 * R, h: Ht, x, z }, { wood: Q.comptoir }), P(M.cylindre(R - 1.2, R - 1.2, 1, 22), nappe ? Q.accent : Q.comptoir2, { x, y: Ht - 0.4, z })); return; }
    pr.push(P(M.cylindre(6.5 * c.K, 7.5 * c.K, 2, 14), Q.bois, { x, z }), P(M.cylindre(2.4, 2.4, Ht - 5, 8), Q.bois, { x, y: 2, z }));
    pr.push(P(M.cylindre(R, R - 1.5, 3, 22), Q.comptoir, { x, y: Ht - 3, z }), P(M.cylindre(R - 0.3, R - 0.3, 1, 22), nappe ? Q.accent : Q.comptoir2, { x, y: Ht, z }));
  }
  // ─── les tables du salon de thé : deux rangées de trois sous la file, deux chaises chacune ───
  function tables(k, c) {
    const { LAY, K, Q } = c, g = grp('tables'); g.userData.zone = 'tables';
    if (k === 0) { const tb = LAY.tables[0]; g.add(M.mesh(M.anneau(14 * K, 16 * K, 32), M.MAT.pointille, { x: tb.x, y: 0.4, z: c.wz(tb.y - 8 * K) }, { ombre: false })); return g; }
    const R = 16 * K, Ht = HAUT.table - 1, pr = [], fl = [], nappe = k >= 4;
    for (let i = 0; i < Math.min(k, LAY.tables.length); i++) {
      const tb = LAY.tables[i], x = tb.x, z = c.wz(tb.y);
      tableRonde(pr, x, z, R, Ht, Q, c, nappe);
      if (nappe) pr.push(P(M.cylindre(R * 0.62, R * 0.62, 0.6, 18), '#FFFFFF', { x, y: Ht + 1, z }));
      for (const s of tb.sieges) chaise(pr, s.x, c.wz(s.y), s.dir, K, Q, k >= 3, c);
      if (k >= 4 || c.crans.deco >= 3) pr.push(P(bo(4, 6, 4, 1.5), '#9BD0FF', { x, y: Ht + 1, z }), P(M.sphere(2.6, 8), ['#FF6B8B', '#FFC84A', '#B8A6FF'][i % 3], { x, y: Ht + 9, z }));
      if (c.crans.deco >= 4) { pr.push(P(M.cylindre(1.6, 1.8, 6, 8), '#FFFDF5', { x: x + 7 * K, y: Ht + 1, z: z - 2 })); fl.push(P(M.sphere(1.5, 8), '#FFC84A', { x: x + 7 * K, y: Ht + 8.5, z: z - 2, sy: 1.5 })); } // les bougies du salon
    }
    g.add(M.maille(pr, { recoit: true }));
    if (fl.length) { const flammes = M.maille(fl, { ombre: false }); flammes.material = propre({ vertexColors: true, emissive: '#FFC84A', emissiveIntensity: 0.3 }); g.add(flammes); g.userData.anime = (E) => { flammes.material.emissiveIntensity = 0.3 + E.lampes * (0.8 + 0.2 * Math.sin(E.t * 9)); }; } // toutes les flammes : un seul maillage
    return g;
  }
  function chaise(pr, x, z, dir, K, Q, coussin, c) { // assise à 16, dossier côté extérieur (dir = +1 : la chaise regarde vers +X), quatre pieds
    const a = 13 * K, ry = dir > 0 ? HP : -HP;
    const kk = c && hdp(c, 'chair_A_wood', { w: 15 * K, d: 16 * K, h: 32, x, z, ry }); if (kk) { pr.push(kk); if (coussin) pr.push(P(bo(11 * K, 1.6, 11 * K, 0.8), Q.accent, { x, y: 16, z })); return; } // la chaise de bois KayKit (coussin au salon de thé)
    if (KN()) { pr.push(kp(coussin ? 'chairCushion' : 'chairRounded', { w: a, d: a, h: 32, x, z, ry }, { wood: Q.bois, carpet: Q.accent })); return; } // la chaise du Furniture Kit (coussin au salon de thé)
    pr.push(P(bo(a, 3, a, 1.2), Q.comptoir2, { x, y: 13, z }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(bo(1.8, 13, 1.8, 0.5), Q.bois, { x: x + sx * (a / 2 - 1.2), z: z + sz * (a / 2 - 1.2) }));
    pr.push(P(bo(3, 16, a, 1.2), Q.bois, { x: x - dir * (a / 2 - 1.5), y: 16, z }));
  }
  // ─── le bar : un comptoir de bois contre la devanture (le même bois que le grand comptoir), ses tabourets face à la rue ───
  // crans : 1 → le comptoir et deux tabourets ; 2 → trois tabourets et l'ardoise des cafés ; 3 → quatre tabourets et la machine à café
  function bar(k, c) {
    const { LAY, K, Q } = c, b = LAY.bar, g = grp('bar'); g.userData.zone = 'bar'; const pr = [];
    if (k === 0) { pointilles(pr, LAY.emplacements.bar, c); return maillePointillee(pr, g); }
    const n = Math.min(4, k + 1), Hb = HAUT.bar - 1, w = b.x1 - b.x0, xc = (b.x0 + b.x1) / 2, zc = c.wz(b.y - 2 * K), d = 15 * K;
    // le comptoir : le corps, le dessus clair qui déborde côté clients, la barre de pieds dorée (côté tabourets)
    pr.push(P(bo(w, Hb - 3, d - 4, 2), Q.comptoir, { x: xc, z: zc + 1 }), P(bo(w + 4, 3, d + 2, 1.2), Q.comptoir2, { x: xc, y: Hb - 3, z: zc - 0.5 }));
    for (let i = 1; i < 4; i++) pr.push(P(bo(1, Hb - 8, 0.6, 0.3), M.assombrir(Q.comptoir, 0.15), { x: b.x0 + i * w / 4, y: 3, z: zc + d / 2 - 1.6 })); // les panneaux de la face
    pr.push(P(M.cylindre(0.9, 0.9, w - 6, 8), '#E0B252', { x: xc, y: 5, z: zc - d / 2 - 1.5, rz: HP }));
    for (const s of LAY.sieges) if (s.zone === 'bar' && s.rang < n) { // les tabourets
      const x = s.x, z = c.wz(s.y);
      const kk = hdp(c, 'chair_stool_wood', { w: 13 * K, d: 13 * K, h: 16, x, z }); if (kk) { pr.push(kk); continue; }
      pr.push(P(M.cylindre(6 * K, 5.5 * K, 3, 14), Q.accent, { x, y: 13, z }), P(M.cylindre(1.3, 1.6, 13, 8), '#8C8C99', { x, z }), P(M.cylindre(4.5 * K, 5 * K, 1.2, 12), '#8C8C99', { x, z }), P(M.tore(3.6 * K, 0.5, TAU, 5, 12), '#8C8C99', { x, y: 6, z, rx: HP }));
    }
    if (k >= 2) { const mk = hdp(c, 'menu', { h: 9, x: b.x0 + 8, y: Hb, z: zc }); pr.push(mk || P(bo(7, 9, 1.5, 0.6), '#2F3A36', { x: b.x0 + 8, y: Hb, z: zc, rx: -0.2 })); } // l'ardoise des cafés, posée sur le comptoir
    if (k >= 3) { const mx = b.x1 - 10; pr.push(P(bo(13, 13, 10, 2), '#B9C6D2', { x: mx, y: Hb, z: zc + 1 }), P(bo(11, 3, 9, 1), '#4A4A55', { x: mx, y: Hb + 13, z: zc + 1 }), P(M.cylindre(1.4, 1.4, 4, 8), '#4A4A55', { x: mx - 2.5, y: Hb + 4, z: zc - 4.5 }), P(M.cylindre(2, 1.6, 3.5, 10), '#FFFFFF', { x: mx - 2.5, y: Hb, z: zc - 5.5 })); } // la machine à café et sa tasse
    g.add(M.maille(pr, { recoit: true })); return g;
  }
  // ─── le coin salon : la banquette face à la salle ; puis la table basse et le tapis ; puis la lampe et le fauteuil ───
  function banquette(k, c) {
    const { LAY, K, Q } = c, bq = LAY.banquette, g = grp('banquette'); g.userData.zone = 'banquette'; const pr = [];
    if (k === 0) { pointilles(pr, LAY.emplacements.banquette, c); return maillePointillee(pr, g); }
    const zc = c.wz(bq.y) - 3, coussin = M.eclaircir(Q.accent, 0.15);
    const kb = hdp(c, 'couch_pillows', { w: 54 * K, d: 24 * K, h: 34, x: bq.x, z: zc, teinte: Q.accent });
    if (kb) pr.push(kb);
    else { // la banquette faite main : le socle, le dossier, les accoudoirs, deux coussins d'assise et deux coussins de dos
      const w = 54 * K, d = 24 * K, x = bq.x;
      pr.push(P(bo(w, 10, d, 2.5), Q.bois, { x, z: zc }), P(bo(w, 22, 6, 2.5), Q.accent, { x, y: 8, z: zc - d / 2 + 3 }));
      for (const sx of [-1, 1]) pr.push(P(bo(6, 18, d, 2.5), Q.accent, { x: x + sx * (w / 2 - 3), y: 4, z: zc }));
      for (const sx of [-1, 1]) pr.push(P(bo(w / 2 - 7, 6, d - 7, 2.5), coussin, { x: x + sx * (w / 4 - 1.5), y: 10, z: zc + 2.5 }), P(bo(w / 2 - 10, 12, 4, 2), '#FFF3E2', { x: x + sx * (w / 4 - 1.5), y: 16, z: zc - d / 2 + 7.5, rx: -0.15 }));
    }
    if (k >= 2) { // le tapis et la table basse
      const t = bq.tapis, tt = bq.table, xt = tt.x, zt = c.wz(tt.y);
      const kr = hdp(c, 'rug_rectangle_stripes_A', { w: t.w, d: c.wd(t.h), h: 0.8, x: t.x, z: c.wz(t.y), teinte: M.eclaircir(Q.accent, 0.35) });
      pr.push(kr || P(bo(t.w, 0.8, c.wd(t.h), 0.4), M.eclaircir(Q.accent, 0.45), { x: t.x, z: c.wz(t.y) }));
      if (!kr) pr.push(P(bo(t.w - 8, 0.6, c.wd(t.h) - 8, 0.2), '#FFFFFF', { x: t.x, y: 0.5, z: c.wz(t.y) }), P(bo(t.w - 12, 0.7, c.wd(t.h) - 12, 0.2), M.eclaircir(Q.accent, 0.45), { x: t.x, y: 0.6, z: c.wz(t.y) }));
      const kt = hdp(c, 'table_low', { w: 28 * K, d: 16 * K, h: HAUT.banquette - 1, x: xt, z: zt });
      if (kt) pr.push(kt); else { pr.push(P(bo(28 * K, 2.5, 16 * K, 1), Q.comptoir2, { x: xt, y: HAUT.banquette - 3.5, z: zt })); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(bo(2, HAUT.banquette - 3, 2, 0.5), Q.bois, { x: xt + sx * 12 * K, z: zt + sz * 6 * K })); }
    }
    if (k >= 3) { // la lampe sur pied (l'abat-jour s'allume le soir : la lumière du salon) et le fauteuil, tourné vers la table basse
      const l = bq.lampe, zl = c.wz(l.y), kl = hdp(c, 'lamp_standing', { w: 14 * K, d: 14 * K, h: 58, x: l.x, z: zl });
      if (kl) pr.push(kl); else pr.push(P(M.cylindre(5, 6, 1.5, 12), '#4A4A55', { x: l.x, z: zl }), P(M.cylindre(0.9, 0.9, 46, 6), '#4A4A55', { x: l.x, z: zl }), P(M.cylindre(5, 8, 11, 12), '#FFF3C4', { x: l.x, y: 45, z: zl }));
      const f = LAY.sieges.find((s) => s.id === 'fauteuil'), zf = c.wz(f.y), kf = hdp(c, 'armchair_pillows', { w: 26 * K, d: 24 * K, h: 34, x: f.x, z: zf, ry: HP, teinte: Q.accent });
      if (kf) pr.push(kf);
      else { const x = f.x, d = 24 * K; pr.push(P(bo(d, 10, 24 * K, 2.5), Q.bois, { x, z: zf }), P(bo(6, 22, 24 * K, 2.5), Q.accent, { x: x - d / 2 + 3, y: 8, z: zf }), P(bo(d - 7, 6, 24 * K - 10, 2.5), coussin, { x: x + 2.5, y: 10, z: zf })); for (const sz of [-1, 1]) pr.push(P(bo(d, 18, 5, 2.5), Q.accent, { x, y: 4, z: zf + sz * (12 * K - 2.5) })); }
    }
    g.add(M.maille(pr, { recoit: true })); return g;
  }
  // ─── la terrasse, sur le trottoir devant la devanture : une table bistrot de deux places par cran ; deux jardinières dès le cran 2,
  //     une guirlande de guinguette au cran 3 (ses ampoules s'allument le soir) ───
  function terrasse(k, c) {
    const { LAY, K, Q, W } = c, g = grp('terrasse'); g.userData.zone = 'terrasse'; const pr = [];
    if (k === 0) { const t = LAY.terrasse[0]; pointilles(pr, { x: t.x - 34 * K, y: t.y - 20 * K, w: 68 * K, h: 34 * K }, c); return maillePointillee(pr, g); } // la place de la première table
    const R = 12 * K, Ht = HAUT.terrasse - 1, metal = '#4A4A55';
    for (let i = 0; i < Math.min(k, LAY.terrasse.length); i++) {
      const tb = LAY.terrasse[i], x = tb.x, z = c.wz(tb.y);
      const kt = hdp(c, 'table_round_A_small', { w: 2 * R, d: 2 * R, h: Ht, x, z, teinte: '#F4EFE6' });
      if (kt) pr.push(kt); else pr.push(P(M.cylindre(5 * K, 6 * K, 1.5, 12), metal, { x, z }), P(M.cylindre(1.4, 1.4, Ht - 2, 8), metal, { x, z }), P(M.cylindre(R, R, 2, 20), '#F4EFE6', { x, y: Ht - 2, z }), P(M.tore(R, 0.7, TAU, 5, 20), metal, { x, y: Ht - 1, z, rx: HP }));
      for (const s of tb.sieges) { // les chaises bistrot : KayKit (le modèle du Restaurant), ou métal et cannage
        const xs = s.x, zs = c.wz(s.y), ry = s.dir > 0 ? HP : -HP, kc = hdp(c, 'chair_A', { w: 15 * K, d: 16 * K, h: 32, x: xs, z: zs, ry, teinte: '#D9B07A' });
        if (kc) { pr.push(kc); continue; }
        const a = 12 * K; pr.push(P(M.cylindre(a / 2, a / 2, 2.5, 14), '#E8C99A', { x: xs, y: 13.5, z: zs }));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(M.cylindre(0.7, 0.7, 14, 5), metal, { x: xs + sx * a * 0.32, z: zs + sz * a * 0.32 }));
        pr.push(P(M.tore(a * 0.45, 0.8, Math.PI, 5, 12), metal, { x: xs - s.dir * a * 0.3, y: 24, z: zs, ry: -ry + HP, rz: 0 }), P(M.cylindre(0.7, 0.7, 10, 5), metal, { x: xs - s.dir * a * 0.42, y: 15, z: zs - a * 0.36 }), P(M.cylindre(0.7, 0.7, 10, 5), metal, { x: xs - s.dir * a * 0.42, y: 15, z: zs + a * 0.36 }));
      }
    }
    if (k >= 2) for (const x of [W * 0.03, W * 0.97]) { const z = c.wz(LAY.devanture.y + 6 * K); pr.push(P(bo(9 * K, 9, 12 * K, 1.5), Q.bois, { x, z })); for (const [ox, oz, r] of [[-2, -2, 4.5], [2, 1, 5], [0, 3, 4]]) pr.push(P(M.sphere(r, 8), '#5FD3A4', { x: x + ox, y: 11 + r * 0.3, z: z + oz })); pr.push(P(M.sphere(1.6, 6), '#FF6B8B', { x: x - 1, y: 17, z: z + 2 }), P(M.sphere(1.6, 6), '#FFC84A', { x: x + 2.5, y: 15.5, z: z - 1 })); } // les jardinières, aux deux bouts
    if (k >= 3) { // la guirlande de guinguette : deux mâts aux bouts du trottoir, un fil qui pend, des ampoules (un maillage lumineux)
      const z = c.wz(LAY.trottoir.bord - 2 * K), x0 = W * 0.02, x1 = W * 0.98, hm = 46, amp = [], fil = pr; // le fil et les mâts entrent dans le maillage de la terrasse
      for (const x of [x0, x1]) fil.push(P(M.cylindre(1, 1.2, hm, 6), metal, { x, z }));
      const n = 11; for (let i = 0; i <= n; i++) { const u = i / n, x = x0 + (x1 - x0) * u, y = hm - 9 * Math.sin(Math.PI * u); if (i < n) { const u2 = (i + 1) / n, xb = x0 + (x1 - x0) * u2, yb = hm - 9 * Math.sin(Math.PI * u2), l = Math.hypot(xb - x, yb - y); fil.push(P(M.cylindre(0.35, 0.35, l, 4), L, { x, y, z, rz: -Math.atan2(xb - x, yb - y) })); } if (i > 0 && i < n) amp.push(P(M.sphere(1.8, 6), ['#FFE27A', '#FF9FB2', '#9BD0FF'][i % 3], { x, y: y - 2.5, z })); }
      const am = M.maille(amp, { ombre: false }); am.material = propre({ vertexColors: true, emissive: '#FFE6A0', emissiveIntensity: 0.1 }); g.add(am);
      g.userData.anime = (E) => { am.material.emissiveIntensity = 0.1 + 0.9 * E.lampes; };
    }
    g.add(M.maille(pr, { recoit: true }));
    return g;
  }
  // ─── les couverts : un croissant sur sa soucoupe et une tasse ; UN maillage instancié pour toutes les places (la scène pose les instances) ───
  function couverts(n, c) {
    const K = c.K, pr = KN() ? [P(M.cylindre(5, 5, 0.8, 14), '#FFFFFF', { x: -5 }), kp('croissant', { w: 7.5, x: -5, y: 0.8, ry: 0.4 }), kp('cup-saucer', { w: 7, x: 4.5, z: -3 }), kp('cup-coffee', { w: 4.6, x: 4.5, y: 0.7, z: -3, ry: -0.6 })]
      : [P(M.cylindre(5, 5, 0.8, 14), '#FFFFFF', { x: -5 }), P(M.sphere(1.8, 8), '#E8B46A', { x: -5, y: 1.8 }), P(M.cylindre(2.4, 2, 4.5, 10), '#FFFFFF', { x: 4, z: -3 }), P(M.tore(2.2, 0.6, TAU, 6, 10), '#FFFFFF', { x: 6.6, y: 2.6, z: -3 })];
    const geo = M.assembler(pr); geo.scale(K, 1, K);
    const im = new THREE.InstancedMesh(geo, M.MAT.vertex, Math.max(1, n)); im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; im.count = Math.max(1, n);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < im.count; i++) im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true;
    const g = grp('couverts'); g.add(im); g.userData.im = im; return g;
  }
  // ─── la décoration : la plante, le second cadre et les appliques, la guirlande, puis le tapis, la frise et les bougies du salon ───
  function deco(k, c) {
    const { LAY, Q, W } = c, g = grp('deco'), lampes = []; g.userData.zone = 'deco'; g.userData.lampes = lampes;
    if (k === 0) { const m = M.mesh(M.disque(1, 6), M.MAT.tache, { x: LAY.deco.x, y: 0.2, z: c.wz(LAY.deco.y) }, { ombre: false }); m.visible = false; g.add(m); return g; }
    const pl = plante(LAY.deco.x, LAY.deco.y, c, true); g.add(pl); g.userData.zoneBoite = new THREE.Box3().setFromObject(pl, true); // la zone de touche : la plante seule (le reste s'accroche au mur ou au plafond)
    if (k >= 2) { if (!c.trophees) g.add(cadre(LAY.cadre2.x, LAY.cadre2.y, c)); for (const a of LAY.appliques) g.add(applique(a.x, a.y - 14, c, lampes)); } // les appliques, juste au-dessus des cadres
    if (k >= 3 && !c.ev) g.add(guirlande(c.tags && c.tags.includes('noel'), c)); // (la boutique hantée : ses toiles et ses chauves-souris à la place des fanions)
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
    if (KN()) { pr.pop(); pr.push(kp('rollingPin', { w: p.w * 0.36, x: p.w * 0.05, y: h, z: zc + 1 }), kp('bowl', { w: 13, x: p.w * 0.36, y: h, z: zc - 1 }), kp('whisk', { w: 11, x: p.w * 0.36, y: h + 4, z: zc - 1, rz: -0.5, ry: 0.6 })); } // Food Kit : le rouleau, le cul-de-poule et son fouet
    else for (const s of [-1, 1]) pr.push(P(M.cylindre(1, 1, 3, 6), '#E8C39A', { x: p.w * 0.2 + s * (p.w * 0.15 + 1.5), y: h + 1.7, z: zc + 1, rz: -Math.PI / 2 }));
    for (let i = 0; i < 4; i++) pr.push(P(M.sphere(0.9, 6), '#FFFFFF', { x: -p.w * 0.38 + i * 5, y: h + 0.4, z: zc + 2.5 }));
    g.add(M.maille(pr, { recoit: true })); return g;
  }
  function presentoir(n, c) {
    const p = c.LAY.presentoir, Q = c.Q, d = c.wd(p.h * 0.45), h = c.wy(p.h * 0.55), g = grp('presentoir', p.x + p.w / 2, 0, c.wz(p.y + p.h)), pr = [], zc = -d / 2;
    pr.push(P(bo(p.w, h, d, 2.5), Q.bois, { z: zc }), P(bo(p.w + 4, 2.5, d + 3, 1), Q.comptoir2, { y: h, z: zc }));
    for (let i = 1; i < 4; i++) pr.push(P(bo(1.2, h - 4, 0.6, 0.2), M.assombrir(Q.bois, 0.15), { x: -p.w / 2 + i * p.w / 4, y: 2, z: 0.2 }));
    for (let i = 0; i < n; i++) { const bx = n > 1 ? -p.w / 2 + 7 + i * (p.w - 14) / (n - 1) : 0, l = 26 + (i % 2) * 6, a = ((i % 3) - 1) * 0.14; if (KN()) { pr.push(kp('loaf-baguette', { w: l + 6, h: 5.5, d: 5.5, x: bx - Math.sin(a) * (l / 2 + 3), y: h - 3 + Math.cos(a) * (l / 2 + 3) - 3, z: zc, rz: Math.PI / 2 + a })); continue; } pr.push(P(M.capsule(2.6, l, 8), i % 2 ? '#E8B46A' : '#D99A4E', { x: bx - Math.sin(a) * (l / 2 + 3), y: h - 3 + Math.cos(a) * (l / 2 + 3), z: zc, rz: a })); }
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
  function plante(x, y, c, touffe) { // une plante en pot : le pot couleur comptoir, quatre boules de feuillage (Q.plante : sa couleur dans un décor qui la choisit, le violet de la Maison hantée)
    const g = grp('plante', x, 0, c.wz(y + 15) - 9), pr = [], f1 = c.Q.plante || '#5FD3A4', f2 = c.Q.plante ? M.assombrir(c.Q.plante, 0.2) : '#3FB889';
    if (KN()) { pr.push(touffe ? kp('plantSmall2', { h: 50 }, { wood: c.Q.comptoir, plant: f1 }) : kp('pottedPlant', { h: 62 }, { wood: c.Q.comptoir, woodDark: '#6B4A3A', plant: c.Q.plante || '#4FC79A' })); g.add(M.maille(pr)); return g; } // Furniture Kit : la touffe ronde (déco) ou la plante à feuilles hautes
    pr.push(P(M.cylindre(9, 7, 18, 12), c.Q.comptoir), P(M.cylindre(9.6, 9.6, 2.5, 12), M.eclaircir(c.Q.comptoir, 0.2), { y: 16.5 }), P(M.cylindre(7.5, 7.5, 1, 12), '#6B4A3A', { y: 18 }));
    for (const [ox, oy, r] of [[0, 30, 9.5], [-8.5, 22, 7], [8.5, 22, 7], [0, 43, 7]]) pr.push(P(M.sphere(r, 10), f1, { x: ox, y: oy, z: 0 }));
    pr.push(P(M.sphere(3.5, 8), f2, { x: -4.5, y: 36, z: 6 }), P(M.sphere(3, 8), f2, { x: 5, y: 27, z: 6.5 }));
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
    if (KN()) { pr.push(kp('rugDoormat', { w: 40, h: 1.4, d }, { wood: col })); g.add(M.maille(pr, { ombre: false, recoit: true })); return g; } // le paillasson du Furniture Kit
    pr.push(P(bo(40, 1.2, d, 0.5), col));
    for (let k = 0; k < 4; k++) pr.push(P(bo(5, 0.5, d * 0.5, 0.2), M.eclaircir(col, 0.3), { x: -13.5 + k * 9, y: 1.1 }));
    g.add(M.maille(pr, { ombre: false, recoit: true })); return g;
  }
  function sapin(c, decale) { // le sapin de Noël : tronc, trois étages de cônes, les boules qui clignotent en alternance, l'étoile (decale : poussé à droite, la vitrine des trophées occupe sa place)
    const s = c.LAY.sapin, g = grp('sapin', s.x + (decale ? c.W * 0.085 : 0), 0, c.wz(s.y)), pr = [];
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
        if (KN()) { // le Food Kit : baguettes debout et pains ronds en bas, croissants et pains de mie en haut
          if (r === 0) pr.push(i % 2 ? kp('loaf-round', { w: cw * 0.9, d: 8, x: px, y: Yp, z: 5.5 }) : kp('loaf-baguette', { w: l + 5, h: 5, d: 5, x: px, y: Yp + (l + 5) / 2 - 2.5, z: 5.5, rz: Math.PI / 2 + 0.08 * (i % 4 ? -1 : 1) }));
          else pr.push(i % 2 ? kp('croissant', { w: cw * 0.95, x: px, y: Yp, z: 5.5, ry: 0.3 }) : kp('loaf', { w: cw * 0.8, d: 8, x: px, y: Yp, z: 5.5, ry: Math.PI / 2 }));
        } else if (r === 1 && i % 2) pr.push(P(M.sphere(cw * 0.42, 10), '#D99A4E', { x: px, y: Yp + cw * 0.3, z: 5.5, sy: 0.72 }));
        else pr.push(P(M.capsule(2.5, l, 8), i % 2 ? '#E8B46A' : '#D99A4E', { x: px, y: Yp + 2.5 + l / 2, z: 5.5, rz: 0.08 * (i % 2 ? -1 : 1) }));
      }
      if (r === 1 && boites) for (let i = 0; i < 3; i++) { const bx = e.x + e.w * 0.42 + i * e.w * 0.2 + e.w * 0.085, bw = e.w * 0.17, bh = c.wy(10); pr.push(P(bo(bw, bh, 8, 1), ['#FFE1EA', '#E7D4FF', '#FFF3C4'][i], { x: bx, y: Yp, z: 5.5 }), P(bo(1.4, bh + 0.4, 8.6, 0.3), PASTEL[i], { x: bx, y: Yp - 0.2, z: 5.5 }), P(bo(bw + 0.4, 1.4, 8.6, 0.3), PASTEL[i], { x: bx, y: Yp + bh * 0.55, z: 5.5 })); }
    }
    g.add(M.maille(pr)); return g;
  }
  const boisCadre = (c) => ((c.Q.standing || 0) >= 3 && c.Q.or ? c.Q.or : c.Q.bois); // les cadres, l'horloge et le diplôme dorés de la Grande maison (standing 3+)
  function cadre(x, y, c) { // un petit tableau : cadre bois, marge blanche, toile peinte (ciel, soleil, collines) ; un décor à portrait (la Maison hantée) : l'ancêtre fantôme
    const g = grp('cadre', x, murY(c, y + 12), 1.5), h = c.wy(24), port = !!c.Q.portrait;
    g.add(M.maille([P(bo(32, h, 3, 0.8), port ? '#B07A2E' : boisCadre(c)), P(bo(28, h - c.wy(4), 1.5, 0.4), port ? '#E0B65A' : '#FFFFFF', { z: 1.6 })]));
    g.add(M.mesh(M.plan(26, h - c.wy(6)), port ? matDe('portrait', () => propre({ map: portrait(), emissive: '#FFFFFF', emissiveMap: portrait(), emissiveIntensity: 0.25 })) : matDe('toile', () => propre({ map: toile(), emissive: '#FFFFFF', emissiveMap: toile(), emissiveIntensity: 0.3 })), { z: 2.5 }, { ombre: false }));
    return g;
  }
  // le portrait de l'ancêtre du manoir : un fantôme distingué en nœud papillon, sur fond de nuit (le même que celui du Manoir, src/evenement.js)
  const portrait = () => { let tx = TEX.get('portrait'); if (tx) return tx; tx = M.texture((x, w, h) => {
    x.scale(w / 80, h / 100); x.fillStyle = '#2A2050'; x.fillRect(0, 0, 80, 100); x.fillStyle = '#3B2A66'; x.beginPath(); x.ellipse(40, 50, 34, 44, 0, 0, TAU); x.fill();
    x.fillStyle = '#F4F1FF'; x.beginPath(); x.moveTo(20, 92); x.lineTo(20, 46); x.arc(40, 46, 20, Math.PI, 0); x.lineTo(60, 92); for (let k = 0; k < 4; k++) x.quadraticCurveTo(55 - k * 10, 84, 50 - k * 10, 92); x.fill();
    x.fillStyle = '#1E1824'; x.beginPath(); x.ellipse(33, 46, 3, 4.2, 0, 0, TAU); x.ellipse(47, 46, 3, 4.2, 0, 0, TAU); x.fill();
    x.fillStyle = '#FF9FB2'; x.beginPath(); x.arc(28, 54, 2.6, 0, TAU); x.arc(52, 54, 2.6, 0, TAU); x.fill();
    x.fillStyle = '#E1496C'; x.beginPath(); x.moveTo(40, 66); x.lineTo(31, 61); x.lineTo(31, 71); x.closePath(); x.moveTo(40, 66); x.lineTo(49, 61); x.lineTo(49, 71); x.closePath(); x.fill();
    x.strokeStyle = '#1E1824'; x.lineWidth = 1.8; x.beginPath(); x.arc(40, 53, 4.2, 0.2, Math.PI - 0.2); x.stroke();
  }, 80, 100); tx.userData.partagee = true; TEX.set('portrait', tx); return tx; };
  function horloge(c) { // cadran blanc cerclé de bois, deux aiguilles tournées par anime selon l'heure ; étirée pour paraître ronde à l'écran
    const h = c.LAY.horloge, g = grp('horloge', h.x, murY(c, h.y), 1); g.scale.y = 1 / c.CY;
    g.add(M.maille([P(M.cylindre(10, 10, 1.5, 24), '#FFFFFF', { rx: Math.PI / 2 }), P(M.tore(10, 1.3, TAU, 8, 28), boisCadre(c), { z: 1.5 }), P(M.sphere(1.4, 8), '#E1496C', { z: 2.6 })]));
    const ah = M.mesh(M.boiteSimple(1.6, 5, 0.8), M.mat(L), { z: 1.8 }, { ombre: false }), am = M.mesh(M.boiteSimple(1.3, 7.5, 0.8), M.mat(L), { z: 2.2 }, { ombre: false }); g.add(ah, am);
    g.userData.anime = (E) => { const d = E.d; if (!d) return; const mn = d.getUTCMinutes() / 60; ah.rotation.z = -((d.getUTCHours() % 12) + mn) / 12 * TAU; am.rotation.z = -mn * TAU; };
    return g;
  }
  function diplome(c) { // le diplôme du boulanger : cadre bois, parchemin, trois lignes grises, le sceau rouge
    const d = c.LAY.diplome, g = grp('diplome', d.x, murY(c, d.y + 13), 1.2), h = c.wy(26), pr = [];
    pr.push(P(bo(22, h, 2.4, 0.8), boisCadre(c)), P(bo(16, c.wy(20), 1.2, 0.4), '#FFFDF5', { z: 1.4 }));
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
  // ─── les récompenses du podium du classement : la coupe de la semaine sur le comptoir, la vitrine des trophées qui les garde toutes ───
  // Une coupe : socle de bois, plaque, pied, nœud, vasque évasée, rebord, deux anses, l'intérieur foncé, un reflet ; 18 de haut, 15 de large
  // anses comprises (s = 1), posée sur y = 0 et face à +Z. Ses pièces se fusionnent avec celles du meuble qui la porte.
  const METAL = { or: ['#FFC84A', '#D4921A', '#FFF2C2'], argent: ['#C9D3DE', '#7F8FA3', '#FFFFFF'], bronze: ['#D98C52', '#9E5A2A', '#F8D6B6'] }; // teinte, ombre, reflet
  function partsCoupe(metal, s, x, y, z) {
    const [m, f, cl] = METAL[metal] || METAL.or, pr = [], q = (v) => Math.round(v * s * 100) / 100; // des cotes arrondies : le cache des géométries reste petit
    const at = (dx, dy, dz, o) => Object.assign({ x: x + dx * s, y: y + dy * s, z: z + dz * s }, o || {});
    pr.push(P(bo(q(9), q(3), q(6.5), q(1)), '#6B4A3A', at(0, 0, 0)), P(M.boiteSimple(q(4.6), q(1.4), q(0.4)), f, at(0, 0.8, 3.3))); // le socle et sa plaque
    pr.push(P(M.cylindre(q(1.1), q(3), q(3.5), 10), m, at(0, 3, 0)), P(M.sphere(q(1.7), 8), m, at(0, 7.2, 0)), P(M.cylindre(q(5.2), q(1.8), q(9), 14), m, at(0, 8, 0))); // le pied, le nœud, la vasque
    pr.push(P(M.tore(q(5.2), q(0.7), TAU, 6, 18), cl, at(0, 17, 0, { rx: Math.PI / 2 })), P(M.disque(q(4.6), 14), M.melange(m, f, 0.55), at(0, 17.1, 0)), P(M.tore(q(3.9), q(0.45), TAU, 5, 16), f, at(0, 12.6, 0, { rx: Math.PI / 2 }))); // le rebord clair, l'intérieur foncé, le filet
    for (const sx of [-1, 1]) pr.push(P(M.tore(q(2.9), q(0.75), Math.PI, 6, 10), m, at(sx * 4.4, 13.3, 0, { rz: -sx * Math.PI / 2 }))); // les anses
    pr.push(P(M.sphere(q(0.85), 6), cl, at(-2, 13.6, 3.6, { sx: 0.6, sy: 3, sz: 0.6, rz: 0.2 }))); // le reflet sur la vasque
    return pr;
  }
  function coupe(metal, c) { // la coupe du dernier podium, posée sur le comptoir la semaine qui suit, à droite du boulanger
    const o = surDessus(c, { x: c.W * 0.495, y: c.LAY.comptoir.y + c.LAY.comptoir.hTop * 0.25 }), g = grp('coupe', o.x, o.y, o.z);
    g.add(M.maille(partsCoupe(metal, 1.1, 0, 0, 0))); g.userData.zone = 'trophees'; return g;
  }
  // la vitrine des trophées : un gradin de bois à trois marches adossé au mur, à droite du comptoir, sous l'applique (à la place du second
  // cadre, qu'elle décroche, et du sapin, qu'elle pousse à droite à Noël), devant un panneau au médaillon doré ; toutes les coupes gagnées, de la plus ancienne (en haut, au fond, à gauche) à la plus récente
  // (en bas, devant, à droite) : en plongée, un gradin les montre toutes, là où des étagères fermées les cacheraient. Il s'élargit jusqu'à
  // 52, puis les coupes rapetissent pour toutes tenir. Un seul maillage fusionné : 1 appel de dessin.
  function trophees(liste, c) {
    const n = liste.length, rangs = 3, parRang = Math.max(Math.min(n, 3), Math.ceil(n / rangs)), Q = c.Q, pas = 7, hs = 6; // jusqu'à trois coupes côte à côte sur la marche du haut, puis les marches du dessous
    const sc = Math.min(0.75, 48 / (parRang * 15)), w = Math.max(34, Math.min(52, parRang * 15 * sc + 6)), hp = 45;
    const g = grp('trophees', c.W * 0.67, 0, 0), pr = [], bois = Q.bois, sombre = M.assombrir(bois, 0.12), fond = M.eclaircir(Q.accent, 0.62);
    pr.push(P(bo(w, hp, 2.5, 1), fond, { z: 1.25 }), P(bo(w + 2, 2.5, 3.5, 0.8), sombre, { y: hp - 1, z: 1.75 })); // le panneau et sa corniche
    pr.push(P(M.cylindre(4.4, 4.4, 1.6, 18), '#FFC84A', { y: hp - 6, z: 2.5, rx: Math.PI / 2, sz: 1 / c.CY }), P(M.cylindre(2.8, 2.8, 1, 16), '#E0A61E', { y: hp - 6, z: 3.4, rx: Math.PI / 2, sz: 1 / c.CY })); // le médaillon (rond à l'écran)
    for (let r = 0; r < rangs; r++) { // les marches : la r-ième (0 = devant, la plus basse) monte à (r + 1) × hs et va jusqu'au mur
      const d = (rangs - r) * pas; pr.push(P(bo(w, (r + 1) * hs, d, 0.8), r % 2 ? bois : sombre, { z: 2.5 + d / 2 }), P(bo(w - 1, 0.8, 1.2, 0.3), M.eclaircir(bois, 0.3), { y: (r + 1) * hs - 0.5, z: 2.5 + d - 0.6 }));
    }
    liste.forEach((metal, i) => { // rang du haut (au fond) d'abord, de gauche à droite
      const r = rangs - 1 - Math.floor(i / parRang), k = i % parRang, ici = Math.min(parRang, n - (rangs - 1 - r) * parRang), ecart = (w - 4) / Math.max(ici, 1);
      pr.push(...partsCoupe(metal, sc, -w / 2 + 2 + ecart * (k + 0.5), (r + 1) * hs, 2.5 + (rangs - r - 0.5) * pas));
    });
    g.add(M.maille(pr)); g.userData.zone = 'trophees'; return g;
  }
  // ─── les décos de l'événement « Le Quartier » (src/quartier.js), gagnées aux paliers et gardées à vie dans la boutique ───
  // le graffiti : un tag en lettres bulles bombé sur le mur, sous l'étagère (une toile, un seul plan ; la porte, elle, est sous les icônes du coin)
  const toileTag = () => { let tx = TEX.get('tag'); if (tx) return tx; tx = M.texture((c, w, h) => {
    const mot = 'LF', cols = ['#FF6B8B', '#5FD3A4', '#FFC84A'];
    c.font = `900 ${h * 0.62}px Fredoka, Nunito, Arial Black, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.save(); c.translate(w / 2, h / 2); c.rotate(-0.12);
    c.lineWidth = h * 0.18; c.strokeStyle = '#2E2B3A'; c.strokeText(mot, 0, 0);
    c.lineWidth = h * 0.09; c.strokeStyle = cols[2]; c.strokeText(mot, 0, 0);
    c.fillStyle = cols[0]; c.fillText(mot, 0, 0); c.restore();
    c.fillStyle = cols[1]; for (const [x, y, r] of [[0.14, 0.2, 0.05], [0.86, 0.78, 0.04], [0.8, 0.18, 0.03]]) { c.beginPath(); c.arc(w * x, h * y, h * r, 0, TAU); c.fill(); }
  }, 128, 64); tx.userData.partagee = true; TEX.set('tag', tx); return tx; };
  function graffiti(c) {
    const { LAY, W } = c, w = Math.min(44, W * 0.11), h = w * 0.55, g = grp('graffiti', W * 0.79, murY(c, LAY.T * 0.265), 0.6);
    g.add(M.mesh(M.plan(w, h), matDe('tag', () => propre({ map: toileTag(), transparent: true, emissive: '#FFFFFF', emissiveMap: toileTag(), emissiveIntensity: 0.25 })), { rz: -0.08 }, { ombre: false }));
    return g;
  }
  // l'enseigne néon : un éclair rose et un tube menthe suspendus dans la fenêtre, qui grésillent le soir (un maillage, deux matériaux)
  function neon(c) {
    const { LAY, W } = c, f = LAY.fenetre, x = f.x + f.w * 0.5, y = murY(c, f.y + f.h * 0.5), g = grp('neon', x, y, 3), pr = [], s = Math.max(10, Math.min(16, f.h * 0.3));
    pr.push(P(bo(s * 1.6, s * 1.9, 1.2, 1), '#2E2B3A', { z: -0.8 })); // le fond noir mat
    g.add(M.maille(pr, { ombre: false }));
    const zig = [[-0.25, 0.75], [0.1, 0.1], [-0.08, 0.1], [0.25, -0.75]].map(([u, v]) => [u * s, v * s]), tubes = [];
    for (let k = 0; k < zig.length - 1; k++) { const [x0, y0] = zig[k], [x1, y1] = zig[k + 1], l = Math.hypot(x1 - x0, y1 - y0); tubes.push(P(M.capsule(0.9, l, 6), '#FF6B8B', { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0.6, rz: Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2 })); }
    const rose = M.maille(tubes, { ombre: false }); rose.material = propre({ vertexColors: true, emissive: '#FF6B8B', emissiveIntensity: 0.9 }); g.add(rose);
    const vert = M.mesh(M.tore(s * 0.62, 0.8, TAU, 6, 20), lumineux('#5FD3A4', 0.9), { z: 0.3, sy: 1.15 }, { ombre: false }); g.add(vert);
    g.userData.anime = (E) => { const gr = Math.sin(E.t * 17) > 0.92 ? 0.25 : 1; rose.material.emissiveIntensity = (0.55 + 0.45 * E.lampes) * gr; vert.material.emissiveIntensity = 0.5 + 0.5 * E.lampes; };
    return g;
  }
  // le chien du quartier : un bâtard couché au bord du salon, roux et blanc, la queue qui bat (un maillage fusionné + la queue)
  function chien(c) {
    const { LAY, W, K } = c, x = LAY.chien ? LAY.chien.x : W * 0.62, y = LAY.chien ? LAY.chien.y : LAY.T * 0.92 + LAY.spread * 0.6, g = grp('chien', x, 0, c.wz(y)), poil = '#C8864F', clair = '#FFF3E2', pr = [];
    g.scale.setScalar(K);
    pr.push(P(M.capsule(6, 14, 10), poil, { y: 6, rz: Math.PI / 2 }), P(M.sphere(4.8, 10), clair, { x: -2, y: 5, z: 2.2, sx: 1.4, sy: 0.9 })); // le corps et la bavette
    pr.push(P(M.sphere(6.2, 12), poil, { x: 12, y: 8 }), P(M.capsule(2.6, 4, 8), poil, { x: 16.5, y: 6.5, z: 1, rz: -Math.PI / 2 }), P(M.sphere(1.6, 6), L, { x: 20.5, y: 7, z: 1.2 })); // la tête, le museau, la truffe
    for (const sx of [-1, 1]) pr.push(P(M.capsule(2.2, 4, 6), '#8B5A3C', { x: 10 + sx * 1.5, y: 10.5, z: sx * 5.2, rz: sx * 0.6, rx: sx * 0.9 }), P(bo(1.8, 0.9, 0.5, 0.2), L, { x: 14.5, y: 9.4, z: sx * 2.4 })); // les oreilles qui tombent, les yeux
    pr.push(P(M.capsule(2.2, 7, 6), clair, { x: -4, y: 2.2, z: 6.5, rz: Math.PI / 2 }), P(M.capsule(2.2, 7, 6), clair, { x: -4, y: 2.2, z: -6.5, rz: Math.PI / 2 }), P(M.capsule(2.4, 8, 6), poil, { x: 8, y: 2.4, z: 7, rz: Math.PI / 2 })); // les pattes repliées, une patte avant allongée
    pr.push(P(M.tore(3.8, 0.9, Math.PI, 6, 12), '#E1496C', { x: 11, y: 7.5, rx: Math.PI / 2, rz: Math.PI })); // le collier
    g.add(M.maille(pr));
    const queue = M.mesh(M.capsule(1.4, 9, 6), M.mat(poil), { x: -14, y: 3, z: 2, rz: Math.PI / 2 + 0.3 }); g.add(queue);
    g.userData.anime = (E) => { queue.rotation.y = Math.sin(E.t * 6) * 0.55; };
    return g;
  }
  // ─── les décos de la Maison hantée (src/hantee.js), gagnées aux paliers et gardées à vie : mignonnes-effrayantes, jamais dans le passage ───
  const partsCitrouille = (x, y, z, r) => { const pr = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; pr.push(P(M.sphere(r * 0.62, 10), k % 2 ? '#F28C28' : '#FF9A3D', { x: x + Math.cos(a) * r * 0.42, y: y + r * 0.72, z: z + Math.sin(a) * r * 0.3, sy: 1.05 })); } pr.push(P(M.cylindre(r * 0.12, r * 0.16, r * 0.42, 6), '#5A7A2E', { x, y: y + r * 1.32, z })); return pr; };
  const partsVisageCitrouille = (x, y, z, r) => [P(M.cone(r * 0.2, r * 0.26, 3), '#FFE27A', { x: x - r * 0.3, y: y + r * 0.86, z: z + r * 0.6, rx: HP }), P(M.cone(r * 0.2, r * 0.26, 3), '#FFE27A', { x: x + r * 0.3, y: y + r * 0.86, z: z + r * 0.6, rx: HP }), P(bo(r * 0.7, r * 0.16, r * 0.12, r * 0.05), '#FFE27A', { x, y: y + r * 0.42, z: z + r * 0.64 })];
  // les citrouilles-lanternes : trois, au pied du mur près de la petite porte, qui s'allument le soir (le visage s'illumine)
  function citrouilles(c) {
    const { LAY, W, K } = c, g = grp('citrouilles', 0, 0, 0), pr = [], vis = [];
    for (const [u, dy, r] of [[0.335, 10, 10], [0.362, 19, 7.5], [0.308, 20, 6.5]]) { const x = W * u, z = c.wz(LAY.murH + dy * K), rr = r * K; pr.push(...partsCitrouille(x, 0, z, rr)); vis.push(...partsVisageCitrouille(x, 0, z, rr)); }
    g.add(M.maille(pr)); const yeux = M.maille(vis, { ombre: false }); yeux.material = propre({ vertexColors: true, emissive: '#FFB347', emissiveIntensity: 0.4 }); g.add(yeux);
    g.userData.anime = (E) => { yeux.material.emissiveIntensity = 0.35 + 0.65 * E.lampes + 0.1 * Math.sin(E.t * 9); };
    return g;
  }
  // les toiles d'araignée : deux coins hauts du mur (une toile peinte, un plan chacun) et une petite araignée souriante au bout de son fil
  const toileAraignee = () => { let tx = TEX.get('toile-ht'); if (tx) return tx; tx = M.texture((x, w, h) => {
    x.strokeStyle = 'rgba(120,110,150,.75)'; x.lineWidth = 2.2; x.lineCap = 'round';
    for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * w, Math.sin(a) * h); x.stroke(); }
    x.lineWidth = 1.6; for (let r = w * 0.18; r < w; r += w * 0.17) { x.beginPath(); for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2, px = Math.cos(a) * r, py = Math.sin(a) * r; if (k === 0) x.moveTo(px, py); else { const am = (k - 0.5) / 5 * Math.PI / 2; x.quadraticCurveTo(Math.cos(am) * r * 0.86, Math.sin(am) * r * 0.86, px, py); } } x.stroke(); }
  }, 128, 128); tx.userData.partagee = true; TEX.set('toile-ht', tx); return tx; };
  function plans(liste) { // des plans texturés ([w, h, { x, y, z, rx, ry, rz }]) fusionnés en une géométrie (pas en cache : rendue avec son groupe)
    const P3 = [], N3 = [], U2 = [], I = []; let n = 0;
    for (const [w, h, o] of liste) { const g = new THREE.PlaneGeometry(w, h).applyMatrix4(M.matrice(o)); P3.push(...g.attributes.position.array); N3.push(...g.attributes.normal.array); U2.push(...g.attributes.uv.array); for (const i of g.index.array) I.push(i + n); n += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N3, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); out.setIndex(I); return out;
  }
  function toiles(c) {
    const { LAY, W, K } = c, s = 34 * K, g = grp('toiles', 0, 0, 0.5), mat = matDe('toile-ht', () => new THREE.MeshBasicMaterial({ map: toileAraignee(), transparent: true, depthWrite: false })), yh = murY(c, 0);
    g.add(M.mesh(plans([[s, s, { x: s / 2, y: yh - s / 2 }], [s, s, { x: LAY.porte.x - s / 2 - 2, y: yh - s / 2, rz: -HP }]]), mat, null, { ombre: false })); // les deux toiles : un seul maillage
    const fil = M.mesh(M.cylindre(0.25, 0.25, 1, 4), M.mat('#9C94B8'), { x: s * 0.62, y: yh, z: 1 }, { ombre: false }), ar = M.maille([P(M.sphere(2.6 * K, 8), '#2E2547'), P(M.sphere(1.8 * K, 8), '#2E2547', { y: -2.6 * K }), P(M.sphere(0.6 * K, 6), '#FFFFFF', { x: -0.8 * K, y: -2.8 * K, z: 1.6 * K }), P(M.sphere(0.6 * K, 6), '#FFFFFF', { x: 0.8 * K, y: -2.8 * K, z: 1.6 * K })], { ombre: false });
    g.add(fil, ar);
    g.userData.anime = (E) => { const l = s * (0.45 + 0.25 * Math.sin(E.t * 0.8)); fil.scale.y = l; fil.position.y = yh - l; ar.position.set(s * 0.62, yh - l - 2 * K, 1); };
    return g;
  }
  // le chaudron : sur trois pieds au bord du fournil, une potion verte qui bouillonne et fume doucement (le reflet vert s'allume le soir)
  function chaudron(c) {
    const { LAY, W, K } = c, r = 10 * K, x = W * 0.085, z = c.wz(LAY.murH + 54 * K), g = grp('chaudron', x, 0, z), pr = [];
    pr.push(P(M.sphere(r, 14), '#2B2533', { y: r * 0.95, sy: 0.8 }), P(M.tore(r * 0.9, 1.4 * K, TAU, 6, 18), '#4A4060', { y: r * 1.62, rx: HP }));
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5; pr.push(P(M.cylindre(1.2 * K, 0.9 * K, 5 * K, 6), '#2B2533', { x: Math.cos(a) * r * 0.65, z: Math.sin(a) * r * 0.65 })); }
    g.add(M.maille(pr));
    const potion = M.mesh(M.cylindre(r * 0.84, r * 0.84, 1, 16), lumineux('#8FE36B', 0.7), { y: r * 1.58 }, { ombre: false }); g.add(potion);
    const bulles = []; for (let k = 0; k < 3; k++) { const b = M.mesh(M.sphere(1.7 * K, 8), lumineux('#C6FF8F', 0.8), { y: r * 1.6 }, { ombre: false }); g.add(b); bulles.push(b); }
    g.userData.anime = (E) => { potion.material.emissiveIntensity = 0.45 + 0.35 * E.lampes + 0.15 * Math.sin(E.t * 3); bulles.forEach((b, k) => { const ph = (E.t * 0.6 + k / 3) % 1; b.position.set(Math.sin(k * 2.3 + E.t) * r * 0.4, r * 1.6 + ph * 14 * K, Math.cos(k * 1.9) * r * 0.3); b.scale.setScalar(Math.sin(ph * Math.PI) + 0.05); }); };
    return g;
  }
  // le petit fantôme : un drap en cloche translucide qui flotte devant la fenêtre, va et vient, deux yeux et des joues roses
  function fantome(c) {
    const { LAY, W, K } = c, f = LAY.fenetre, g = grp('fantome', 0, 0, 0), r = 9 * K, pr = [];
    pr.push(P(M.sphere(r, 14), '#FFFFFF', { y: r * 1.2, sy: 1.05 }), P(M.cylindre(r, r * 1.15, r * 1.2, 14), '#FFFFFF', { y: 0 }));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; pr.push(P(M.sphere(r * 0.3, 8), '#FFFFFF', { x: Math.cos(a) * r * 0.9, z: Math.sin(a) * r * 0.9 })); }
    const corps = M.maille(pr, { ombre: false }); corps.material = propre({ vertexColors: true, transparent: true, opacity: 0.86, emissive: '#D9D2FF', emissiveIntensity: 0.4 }); g.add(corps);
    g.add(M.maille([P(M.sphere(1.5 * K, 8), L, { x: -3 * K, y: r * 1.35, z: r * 0.92, sy: 1.4, sz: 0.4 }), P(M.sphere(1.5 * K, 8), L, { x: 3 * K, y: r * 1.35, z: r * 0.92, sy: 1.4, sz: 0.4 }), P(M.sphere(1.4 * K, 8), '#FF9FB2', { x: -5.6 * K, y: r * 1.05, z: r * 0.82, sz: 0.3 }), P(M.sphere(1.4 * K, 8), '#FF9FB2', { x: 5.6 * K, y: r * 1.05, z: r * 0.82, sz: 0.3 })], { ombre: false }));
    const x0 = f.x + f.w * 0.5, y0 = murY(c, f.y + f.h) - r * 0.5, z0 = c.wz(LAY.murH + 26 * K);
    g.userData.anime = (E) => { g.position.set(x0 + Math.sin(E.t * 0.4) * f.w * 0.6, y0 + Math.sin(E.t * 1.7) * 4 * K, z0); g.rotation.y = Math.cos(E.t * 0.4) * 0.5; corps.material.opacity = 0.78 + 0.1 * Math.sin(E.t * 2.2); };
    return g;
  }
  // la toque de la recette du jour (src/activites.js : la 500e fournée d'un événement, q.decos) : une petite plaque accrochée à la porte de
  // l'arrière-boutique (au-dessus, l'enseigne de la boutique la cacherait), sa toque devant ; 'or' (la Planque) : la toque dorée sur fond
  // nuit ; 'citrouille' (le Manoir) : une citrouille qui porte la toque. bas : la seconde place, plus bas sur la porte (les deux gagnées).
  // Dessinée en pixels d'écran, étirée de 1/CY (ronde à l'écran)
  function toqueRecette(c, sorte, bas) {
    const a = c.LAY.arriere, cit = sorte === 'citrouille', hpx = a ? c.LAY.murH - a.y : 60, x = a ? a.x + a.w / 2 : c.W * 0.32, ys = (a ? a.y : c.LAY.T * 0.2) + hpx * (bas ? 0.47 : 0.21);
    const g = grp('toque-' + sorte, x, murY(c, ys), 4.2), pr = []; g.scale.y = 1 / c.CY;
    pr.push(P(bo(19, 17, 2.2, 0.8), cit ? '#7B4FD0' : '#FFC84A'), P(bo(15.5, 13.5, 1.2, 0.4), cit ? '#2A2047' : '#2E2B3A', { z: 1.4 })); // le cadre, le fond
    const yt = cit ? 2.6 : -1; // le bas de la toque (le tout un peu haut : vu de haut, ce qui avance du mur descend à l'écran)
    if (cit) { pr.push(P(M.sphere(4.4, 12), '#FF8A3D', { y: -0.6, z: 2.6, sx: 1.25, sz: 0.5 }), P(bo(1.4, 1.6, 0.6, 0.2), '#3FB889', { y: 3.6, z: 2.8 })); for (const sx of [-1, 1]) pr.push(P(M.sphere(0.8, 6), '#FFE27A', { x: sx * 1.9, y: 0, z: 4.6 })); }
    const blanc = cit ? '#FFFFFF' : '#FFE07A';
    pr.push(P(M.cylindre(2.9, 2.9, 3.2, 12), blanc, { y: yt + 1.6, z: 2.6, sz: 0.5 })); // le bandeau de la toque
    for (const dx of [-2.2, 0, 2.2]) pr.push(P(M.sphere(2.3, 10), blanc, { x: dx, y: yt + 4.6 + (dx ? 0 : 0.8), z: 2.6, sz: 0.5 })); // le bouffant
    pr.push(P(bo(6.4, 0.9, 0.5, 0.2), cit ? '#FF8A3D' : '#5FD3A4', { y: yt + 1.4, z: 4.2 })); // le ruban
    g.add(M.maille(pr, { ombre: false })); return g;
  }
  // ─── la boutique hantée (src/boutiquehantee.js, le thème « hantee » de src/vie.js) : les bougies (un chandelier sur le comptoir, une
  //     bougie au milieu de chaque table, deux sur le bar, une sur le plan de travail), deux lanternes de part et d'autre de la porte du
  //     fond, trois chauves-souris accrochées sous la corniche. Deux appels de dessin : le décor fusionné (modèles KayKit Halloween cuits
  //     en qualité haute, c.hdHantee ; faits main sinon) et les flammes, qui vacillent et brillent plus fort le soir ───
  const hdh = (c, nom, o, col) => (c.hdHantee && typeof HDM !== 'undefined' && HDM.part ? HDM.part('hantee2/' + nom, o, col) : null);
  function hantee(c) {
    const { LAY, W, K } = c, g = grp('hantee', 0, 0, 0), pr = [], fl = [], cire = '#F4EEE0', fer = '#2B2533';
    const flamme = (x, y, z, r) => fl.push(P(M.sphere(r || 1.5, 6), '#FFD27A', { x, y, z, sy: 1.7 }));
    const bougie = (x, y, z, h, r) => { pr.push(P(M.cylindre(r, r * 1.05, h, 8), cire, { x, y, z }), P(M.cylindre(0.25, 0.25, 1.6, 4), L, { x, y: y + h, z })); flamme(x, y + h + 2, z, r * 0.75); };
    // le chandelier du comptoir, à gauche du chat (la place des fleurs, qui n'y sont pas)
    const o = surDessus(c, LAY.fleurs), kc = hdh(c, 'candle_triple', { h: 15 * K, x: o.x, y: o.y, z: o.z });
    if (kc) { pr.push(kc); for (const [dx, dy] of [[-3.1, 13.6], [0, 15.4], [3.1, 12.4]]) flamme(o.x + dx * K, o.y + dy * K, o.z, 1.1 * K); }
    else { pr.push(P(M.cylindre(4 * K, 4.6 * K, 1.4, 12), fer, o), P(M.cylindre(0.8, 0.8, 7 * K, 6), fer, { x: o.x, y: o.y + 1.4, z: o.z }), P(bo(13 * K, 1.2, 1.6, 0.4), fer, { x: o.x, y: o.y + 7 * K, z: o.z })); for (const dx of [-5.6, 0, 5.6]) bougie(o.x + dx * K, o.y + 8 * K + (dx ? 0 : 1.6), o.z, dx ? 5 * K : 6 * K, 1.3); }
    // une bougie au milieu de chaque table achetée, deux sur le bar, une sur le plan de travail
    const surTable = (x, y, z) => { const k = hdh(c, 'candle', { h: 7 * K, x, y, z }); if (k) { pr.push(k); flamme(x, y + 7.6 * K, z, 1.1); } else { pr.push(P(M.cylindre(2.6, 2.9, 1, 10), fer, { x, y, z })); bougie(x, y + 1, z, 4.4 * K, 1.2); } };
    for (let i = 0; i < Math.min(c.crans.tables || 0, LAY.tables.length); i++) { const t = LAY.tables[i]; surTable(t.x, HAUT.table, c.wz(t.y)); }
    if ((c.crans.bar || 0) > 0) { const b = LAY.bar; for (const u of [0.2, 0.8]) surTable(b.x0 + (b.x1 - b.x0) * u, HAUT.bar + 1.5, c.wz(b.y - 4 * K)); }
    const pl = LAY.plan, kp2 = hdh(c, 'candle_melted', { h: 9 * K, x: pl.x + pl.w * 0.78, y: c.wy(pl.h * 0.55), z: c.wz(pl.y + pl.h * 0.6) });
    if (kp2) { pr.push(kp2); flamme(pl.x + pl.w * 0.78, c.wy(pl.h * 0.55) + 9.4 * K, c.wz(pl.y + pl.h * 0.6), 1.1); } else bougie(pl.x + pl.w * 0.78, c.wy(pl.h * 0.55), c.wz(pl.y + pl.h * 0.6), 5 * K, 1.4);
    // les deux lanternes de la porte du fond, posées au sol de part et d'autre, dans la salle (jamais dans le passage : l'allée entre au milieu)
    const p = LAY.porte, zl = c.wz(LAY.murH + 8 * K);
    for (const x of [p.x - 9 * K, Math.min(W - 6 * K, p.x + p.w + 9 * K)]) {
      const kl = hdh(c, 'lantern_standing', { h: 22 * K, x, z: zl });
      if (kl) { pr.push(kl); flamme(x, 9.5 * K, zl, 2); continue; }
      pr.push(P(bo(8 * K, 1.6, 8 * K, 0.6), fer, { x, z: zl }), P(bo(6.4 * K, 11 * K, 6.4 * K, 0.8), '#FFE7A3', { x, y: 1.6, z: zl }), P(M.cone(5 * K, 5 * K, 4), fer, { x, y: 1.6 + 11 * K, z: zl, ry: Math.PI / 4 }), P(M.tore(1.6 * K, 0.4, TAU, 4, 8), fer, { x, y: 1.6 + 17 * K, z: zl }));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(M.cylindre(0.5, 0.5, 11 * K, 4), fer, { x: x + sx * 3.2 * K, y: 1.6, z: zl + sz * 3.2 * K }));
      flamme(x, 6 * K, zl, 2.2);
    }
    // trois chauves-souris endormies, la tête en bas, sous la corniche (entre la fenêtre, le tableau et l'étagère)
    const yh = murY(c, 0) - 2;
    for (const u of [0.31, 0.47, 0.68]) { const x = W * u; pr.push(P(M.sphere(2.4 * K, 8), fer, { x, y: yh - 4 * K, z: 2, sy: 1.25 }), P(M.cone(0.8 * K, 1.6 * K, 4), fer, { x: x - 1.2 * K, y: yh - 8.6 * K, z: 2.2, rx: Math.PI }), P(M.cone(0.8 * K, 1.6 * K, 4), fer, { x: x + 1.2 * K, y: yh - 8.6 * K, z: 2.2, rx: Math.PI }), P(bo(3.2 * K, 6 * K, 0.8, 0.3), '#3E3648', { x: x - 2.6 * K, y: yh - 7 * K, z: 1.8, rz: 0.25 }), P(bo(3.2 * K, 6 * K, 0.8, 0.3), '#3E3648', { x: x + 2.6 * K, y: yh - 7 * K, z: 1.8, rz: -0.25 }), P(M.sphere(0.5 * K, 5), '#FFD84A', { x: x - 0.9 * K, y: yh - 6.4 * K, z: 4.6 }), P(M.sphere(0.5 * K, 5), '#FFD84A', { x: x + 0.9 * K, y: yh - 6.4 * K, z: 4.6 })); }
    g.add(M.maille(pr, { ombre: false }));
    const flammes = M.maille(fl, { ombre: false }); flammes.material = propre({ vertexColors: true, emissive: '#FFB347', emissiveIntensity: 0.9 }); g.add(flammes);
    g.userData.anime = (E) => { const m = flammes.material; m.emissiveIntensity = 0.75 + 0.35 * E.lampes + 0.12 * Math.sin(E.t * 11) + 0.06 * Math.sin(E.t * 23); flammes.scale.y = 1 + 0.02 * Math.sin(E.t * 13); };
    g.userData.bougies = fl.length; return g;
  }
  // ─── le standing de la boutique (Q.standing 1 à 5, Q.objets : src/vie.js decor) : ce qui s'ajoute au décor, hors des chemins et des
  //     zones de touche — contre le mur du fond, en haut, aux deux coins du fournil, à la porte de la devanture et sur le trottoir.
  //     Tout est fusionné en un maillage (1 appel de dessin, le soir compris : la lueur des lanternes est dans le même, lueurVerre).
  //     En qualité haute (c.hdLuxe : lots HD « luxe1/3/5 » chargés), les lanternes, les colonnes, la statue et le trophée sont des
  //     modèles cuits (fournil/hd/luxe/ : KayKit Halloween et Furniture Bits, Kenney Starter Kit, CC0) ; sinon tout est fait main.
  const hdl = (c, nom, o, col) => (c.hdLuxe && typeof HDM !== 'undefined' && HDM.part ? HDM.part('luxe/' + nom, o, col) : null);
  // le verre des lanternes : une couleur à lui, que lueurVerre reconnaît dans le maillage fusionné (attribut « lueur » : 1 sur ses sommets)
  const VERRE_LANTERNE = '#EADBB0';
  function lueurVerre(mesh) { // sa lumière (uniform rendu) s'ajoute au verre seul, le reste ne change pas
    const geo = mesh.geometry, col = geo.attributes.color.array, n = col.length / 3, l = new Float32Array(n), v = new THREE.Color(VERRE_LANTERNE);
    for (let i = 0; i < n; i++) l[i] = Math.abs(col[i * 3] - v.r) < 1e-6 && Math.abs(col[i * 3 + 1] - v.g) < 1e-6 && Math.abs(col[i * 3 + 2] - v.b) < 1e-6 ? 1 : 0;
    geo.setAttribute('lueur', new THREE.BufferAttribute(l, 1));
    const u = { value: 0 }, teinte = { value: new THREE.Color('#FFD98A') };
    const greffer = (mat) => { // sur le matériau du moment : le Lambert propre, ou son jumeau MeshStandard (src/scene.js habiller, palier riche)
      if (mat.userData.lueur === u) return; mat.userData.lueur = u;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uLueur = u; sh.uniforms.uLueurTeinte = teinte;
        sh.vertexShader = 'attribute float lueur;\nvarying float vLueur;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLueur = lueur;');
        sh.fragmentShader = 'uniform float uLueur;\nuniform vec3 uLueurTeinte;\nvarying float vLueur;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uLueurTeinte * (uLueur * vLueur);');
      };
      mat.customProgramCacheKey = () => 'lueur-verre|' + mat.type; mat.needsUpdate = true;
    };
    mesh.material = propre({ vertexColors: true }); greffer(mesh.material);
    return (k) => { greffer(mesh.material); u.value = k; };
  }
  function coinsStanding(c) { // les deux places d'honneur, au pied du fournil : à droite sous la plante de la déco, à gauche sous la chambre froide
    const { LAY, W } = c; return { d: { x: W * 0.80, y: LAY.T * 0.62 }, g: { x: Math.max(W * 0.045, 18), y: LAY.T * 0.60 } }; // (à gauche, jamais coupé par le bord de l'écran)
  }
  function standing(c) { // (src/vie.js plan : standingSol garde la place des colonnes et des cordons sur le trottoir ; mêmes mesures, à changer ensemble)
    const { LAY, W, K, Q } = c, s = Q.standing || 0, ob = (id) => !!(Q.objets && Q.objets.includes(id)), g = grp('standing'), pr = [], lu = [];
    if (!s) return g;
    const or = Q.or || '#C9A35A', orF = M.assombrir(or, 0.25), dv = LAY.devanture, zd = c.wz(dv.y) + 2, x0 = dv.porte.x0, x1 = dv.porte.x1, coin = coinsStanding(c), Hm = c.wy(LAY.murH);
    const marbre = M.melange('#F4F0EA', Q.mur, 0.25);
    // g.userData.emprises : les boîtes monde des pièces qui tiennent de la place (colonnes, poteaux, statue, trophée et ce qui les porte) —
    // pour les tests : rien ne s'interpénètre, rien n'est posé dans le vide (appui ≥ pied), rien ne sort de l'écran ni ne couvre une zone de touche
    const emp = g.userData.emprises = [], note = (nom, x, z, w, d, y0, y1, o) => emp.push(Object.assign({ nom, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1 }, o || {}));
    const dimsHD = (nom, h) => { const md = typeof HDM !== 'undefined' && HDM.cuit ? HDM.cuit('luxe/' + nom) : null; return md ? { w: md.w * h / md.h, d: md.d * h / md.h } : null; }; // (part() : échelle uniforme sur la hauteur)
    // le socle de marbre : sa plaque du dessus fait l de côté (13 : les cotes d'origine), la base l + 2
    const socle = (x, z, h, l = 13) => { pr.push(P(bo(l + 2, 2.5, l + 2, 0.8), M.assombrir(marbre, 0.08), { x, z }), P(M.cylindre(l * 0.4, l * 0.43, h - 5, 12), marbre, { x, y: 2.5, z }), P(bo(l, 2.5, l, 0.8), M.assombrir(marbre, 0.08), { x, y: h - 2.5, z }), P(bo(l + 0.4, 0.7, l + 0.4, 0.2), or, { x, y: h - 3, z })); note('socle', x, z, l + 2, l + 2, 0, h); return h; };
    // les plantes hautes en pot (1-4), aux deux places d'honneur ; au palier 5, la statue et le trophée les remplacent
    for (const [cote, p] of [['d', coin.d], ['g', coin.g]]) {
      const x = p.x, z = c.wz(p.y);
      if (cote === 'g' && c.chaudron) continue; // le chaudron de la Maison hantée occupe ce coin
      // la statue cuite a son propre plinthe (25 de côté, 11 de haut) : posée au sol, sans socle de marbre sous elle (il était plus étroit : porte-à-faux)
      if (ob('statue') && cote === 'd') { const st = hdl(c, 'statue', { h: 48, x, y: 0, z }); if (st) { const dm = dimsHD('statue', 48); pr.push(st); if (dm) note('statue', x, z, dm.w, dm.d, 0, 48, { pied: dm.w, appui: 0 }); continue; } const h = socle(x, z, 14); note('statue', x, z, 11, 9, h, h + 39, { pied: 11, appui: 13 }); { pr.push(P(bo(11, 4, 9, 1), marbre, { x, y: h, z }), P(M.cone(7, 24, 10), marbre, { x, y: h + 4, z }), P(M.sphere(6, 10), marbre, { x, y: h + 33, z, sy: 1.1 }), P(M.tore(5.4, 1.1, Math.PI * 1.3, 5, 10), or, { x, y: h + 36, z: z + 0.5, rx: -0.4, rz: Math.PI * 1.15 })); } continue; } // le buste couronné de lauriers
      // le trophée : plus petit (le cuit fait 1,19 fois sa hauteur de large, anses comprises ; son pied octogonal 0,72 fois), un peu plus bas
      // que la place d'honneur pour ne pas couvrir la chambre froide (sa pastille), sur un socle aussi large que son pied
      if (ob('trophee') && cote === 'g') { const zt = c.wz(p.y + 12), tr = hdl(c, 'trophy', { h: 24, x, y: 10, z: zt }), dm = tr && dimsHD('trophy', 24), pied = dm ? 0.72 * 24 : 9 * 1.4;
        const h = socle(x, zt, 10, Math.max(13, Math.ceil(pied) + 1)); if (tr) pr.push(tr); else pr.push(...partsCoupe('or', 1.4, x, h, zt));
        note('trophee', x, zt, dm ? dm.w : 22.5, dm ? dm.d : 11, h, h + (tr ? 24 : 25), { pied, appui: Math.max(13, Math.ceil(pied) + 1) }); continue; }
      if (!ob('plantesHautes')) continue;
      const kk = KN() ? kp('pottedPlant', { h: 52, x, z }, { wood: s >= 3 ? or : Q.comptoir, woodDark: M.assombrir(Q.bois, 0.3), plant: '#3FB889' }) : null;
      if (kk) { pr.push(kk); continue; }
      pr.push(P(M.cylindre(7, 5.5, 13, 12), s >= 3 ? or : Q.comptoir, { x, z }), P(M.cylindre(7.4, 7.4, 1.6, 12), M.eclaircir(s >= 3 ? or : Q.comptoir, 0.25), { x, y: 12, z }), P(M.cylindre(0.9, 1.1, 22, 6), '#7A5236', { x, y: 12, z }));
      for (const [ox, oy, oz, r] of [[0, 38, 0, 8], [-6, 30, 2, 6.5], [6, 31, -1, 6.5], [-3, 45, 1, 5.5], [4, 42, 3, 5.5], [0, 25, 4, 5]]) pr.push(P(M.sphere(r, 9), oy > 40 ? '#5FD3A4' : '#3FB889', { x: x + ox, y: oy, z: z + oz }));
    }
    // le tapis d'entrée : un grand ovale sous la file d'attente, devant la vitrine (plat : on marche dessus)
    if (ob('tapisEntree')) {
      const tx = W * 0.52, tz = c.wz(LAY.T * 0.765), tw = W * 0.34, td = c.wd(LAY.T * 0.15), col = s >= 4 ? M.melange('#B3243A', Q.accent, 0.25) : M.eclaircir(Q.accent, 0.2);
      // des anneaux empilés (chacun un peu plus haut) : la bordure, le filet laiton puis or, le champ, le médaillon clair
      for (const [m, coul, ep] of [[0, M.assombrir(col, 0.12), 0.5], [2.5, or, 0.6], [4, col, 0.7], [10, M.eclaircir(col, 0.3), 0.8], [12.5, col, 0.9]]) pr.push(P(M.cylindre(tw / 2 - m, tw / 2 - m, ep, 28), coul, { x: tx, z: tz, sz: (td - m * 2 * (td / tw)) / (tw - m * 2) }));
    }
    // les colonnes du portique (3+), de part et d'autre de la porte de la devanture, hors du store (qui les cacherait), contre la façade
    // (mêmes mesures, à changer ensemble : src/vie.js standingSol, et la citrouille d'Halloween de src/scene.js decorHD, posée à droite de x1 + 14)
    const xc0 = x0 - 9, xc1 = x1 + 9;
    if (ob('colonnes')) for (const x of [xc0, xc1]) {
      note('colonne', x, zd + 2, 10, 10, 0, 42);
      const kc = hdl(c, 'column', { h: 42, w: 10, d: 10, x, z: zd + 2 });
      if (kc) pr.push(kc, P(bo(11, 0.8, 11, 0.2), or, { x, y: 35.5, z: zd + 2 }));
      else { pr.push(P(bo(10, 3, 10, 0.8), marbre, { x, z: zd + 2 }), P(M.cylindre(3.6, 4, 34, 12), marbre, { x, y: 3, z: zd + 2 }), P(bo(10, 3.5, 10, 0.8), marbre, { x, y: 37, z: zd + 2 }), P(M.tore(3.8, 0.6, TAU, 5, 12), or, { x, y: 34, z: zd + 2, rx: HP }), P(M.tore(4.1, 0.6, TAU, 5, 12), or, { x, y: 4, z: zd + 2, rx: HP })); }
    }
    // les lanternes de la porte : de part et d'autre (1-2), puis sur les colonnes ; leur verre s'allume le soir
    if (ob('lanternes')) for (const x of ob('colonnes') ? [xc0, xc1] : [x0 - 6, x1 + 6]) { // (à côté du store, pas dessous)
      const zl = zd + (ob('colonnes') ? 9.5 : 4.5), yl = ob('colonnes') ? 25 : 21;
      pr.push(P(bo(1.6, 1.6, 4, 0.4), '#3B3440', { x, y: yl + 9, z: zl - 2.5 }));
      const kl = hdl(c, 'lantern_hanging', { h: 13, x, y: yl - 1, z: zl });
      if (kl) pr.push(kl); else pr.push(P(bo(6, 1.5, 6, 0.5), '#3B3440', { x, y: yl, z: zl }), P(M.cone(4.2, 3.5, 4), '#3B3440', { x, y: yl + 8, z: zl, ry: Math.PI / 4 }), P(M.sphere(1, 6), or, { x, y: yl + 12, z: zl }));
      pr.push(P(bo(3.8, 6.3, 3.8, 0.8), VERRE_LANTERNE, { x, y: yl + 1.5, z: zl })); lu.push(1); // le verre ; le soir, il s'allume (voir plus bas)
    }
    // le store rayé (2+) : au-dessus de la porte de la devanture, aux couleurs du quartier, un lambrequin festonné
    if (ob('marquise')) {
      const n = 8, l = x1 - x0 + 6, sw = l / n, a = 0.5, prof = 14, yT = 38;
      for (let i = 0; i < n; i++) { const x = x0 - 3 + (i + 0.5) * sw; pr.push(P(M.boiteSimple(r2(sw + 0.2), 1, prof), i % 2 ? '#FFFFFF' : Q.accent, { x, y: yT - Math.sin(a) * prof / 2, z: zd + Math.cos(a) * prof / 2, rx: a })); pr.push(P(M.sphere(sw / 2, 8), i % 2 ? '#FFFFFF' : Q.accent, { x, y: yT - Math.sin(a) * prof - 0.5, z: zd + Math.cos(a) * prof, sy: 0.55, sz: 0.3 })); }
      pr.push(P(M.cylindre(0.7, 0.7, r2(l), 6), or, { x: x1 + 3, y: yT, z: zd, rz: HP })); // la tringle dorée
    }
    // le tapis rouge et ses cordons (4+) : de la porte de la devanture jusqu'au milieu du trottoir (le passage vers la rue reste libre)
    if (ob('tapisRouge')) {
      const z1 = c.wz(LAY.trottoir.rue) - 4, lt = z1 - zd - 2, xc = (x0 + x1) / 2, wt = x1 - x0 - 6;
      pr.push(P(bo(wt, 0.7, lt, 0.3), '#B3243A', { x: xc, y: 0.4, z: zd + 2 + lt / 2 }), P(bo(1.2, 0.8, lt, 0.2), or, { x: xc - wt / 2 + 1.5, y: 0.45, z: zd + 2 + lt / 2 }), P(bo(1.2, 0.8, lt, 0.2), or, { x: xc + wt / 2 - 1.5, y: 0.45, z: zd + 2 + lt / 2 }));
      const zb = [zd + 10.5, zd + 8 + Math.min(26, lt * 0.55)]; // le poteau avant dégage le socle des colonnes (zd + 7) : sa base (r 3) part de zd + 7,5
      for (const x of [x0 - 3, x1 + 3]) {
        for (const z of zb) note('poteau', x, z, 6, 6, 0, 16), pr.push(P(M.cylindre(2.6, 3, 1.2, 10), or, { x, z }), P(M.cylindre(0.7, 0.7, 13, 6), or, { x, y: 1, z }), P(M.sphere(1.5, 8), or, { x, y: 14.5, z }));
        const l = zb[1] - zb[0]; pr.push(P(M.tore(l / 2, 0.75, Math.PI, 5, 12), '#8E1B2E', { x, y: 12.8, z: (zb[0] + zb[1]) / 2, ry: HP, rz: Math.PI, sy: 0.35 }));
      }
    }
    const mm = M.maille(pr.filter(Boolean)); g.add(mm);
    if (lu.length && c.hdLuxe) { // la lueur des lanternes : avec les modèles cuits (haute), le soir ; dans le MÊME maillage (pas d'appel de dessin en plus)
      const allumer = lueurVerre(mm); g.userData.anime = (E) => allumer(E.lampes > 0.02 ? 0.35 + 0.65 * E.lampes : 0);
    }
    return g;
  }
  // ─── la composition d'ensemble (pour l'atelier et la scène) ───
  function vitrineDemo(k, c) { // le comptoir et, à chaque place de la vitrine, une boule dorée de la taille d'une pâtisserie
    const cp = comptoir(k, c), n = c.niv ? c.niv.filter((v) => v > 0).length : 4, g = grp('pâtisseries');
    for (const pl of cp.userData.vitrine.places(n)) g.add(M.mesh(M.sphere(pl.s / 2, 10), M.mat('#E8B46A'), { x: pl.x, y: pl.y + pl.s / 2, z: pl.z, sy: 0.75 }));
    return [cp, g];
  }
  function tout(c) { // la salle et tout le mobilier aux crans de ctx.crans, plus les petits objets ; ctx.demo ajoute des pâtisseries factices
    const k = c.crans, LAY = c.LAY, out = [salle(c), froid(k.froid, c), four(k.four, c)], cp = comptoir(k.vitrine, c); c.dessusY = cp.userData.dessusY;
    out.push(cp, caisse(k.caisse, c), tables(k.tables, c), bar(k.bar || 0, c), banquette(k.banquette || 0, c), terrasse(k.terrasse || 0, c), deco(k.deco, c), plan(c), presentoir(4, c), ardoise(c), etagere(8, true, c), cadre(LAY.cadre.x, LAY.cadre.y, c), horloge(c), diplome(c), fleurs(c), chat(c), paillasson(k.deco >= 1, c), lampe(c), plante(LAY.plante.x, LAY.plante.y, c));
    if (c.tags.includes('noel')) { out.push(sapin(c, !!(c.coupes && c.coupes.length))); if (k.deco < 3) out.push(guirlande(true, c)); } if (c.tags.includes('fete')) out.push(fanions(c)); if (c.tags.includes('coeurs')) out.push(coeurs(c));
    for (const tg of ['halloween', 'galette', 'paques', 'ete']) if (c.tags.includes(tg)) { out.push(propSaison(tg, c)); break; }
    if (c.demo) out.push(vitrineDemo(k.vitrine, c)[1]);
    if (c.coupes && c.coupes.length) out.push(trophees(c.coupes, c)); // les récompenses du podium (avec c.trophees, le second cadre est décroché)
    if (c.coupe) out.push(coupe(c.coupe, c));
    if (c.Q && c.Q.standing) out.push(standing(c));
    return out;
  }
  return { get sallesEnCache() { return [...TEX.keys()].filter((k) => /^(sol|mur)/.test(k)).length; }, textureSol, textureMur, salle, froid, four, comptoir, caisse, tables, bar, banquette, terrasse, couverts, HAUT, deco, plan, presentoir, ardoise, plante, fleurs, chat, paillasson, sapin, guirlande, fanions, coeurs, etagere, cadre, horloge, diplome, lampe, propSaison, surDessus, dimsComptoir, vitrineDemo, tout, coupe, trophees, partsCoupe, METAL, graffiti, neon, chien, citrouilles, toiles, chaudron, fantome, toqueRecette, hantee, standing, coinsStanding };
})();
if (typeof module !== 'undefined') module.exports = MEUBLES;
