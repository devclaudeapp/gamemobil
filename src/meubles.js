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
      else if (Q.solStyle === 'nacre') { solMarbre(c, w, h, Q); solNacre(c, w, h, Q); } // (la 6e finition : le marbre et ses incrustations de nacre)
      else if (Q.solStyle === 'tomettes') solTomettes(c, w, h, Q); // (la Halle du Marché d'automne)
      else { c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1.6; for (let k = 0; k < 4; k++) { const x0 = k * w / 4 + 30; c.beginPath(); c.moveTo(x0, 0); c.bezierCurveTo(x0 + 45, h * 0.35, x0 - 45, h * 0.65, x0, h); c.stroke(); } }
      if (Q.standing >= 3 && Q.solStyle === 'marbre') { c.fillStyle = Q.or; c.globalAlpha = 0.55; for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x + 3.5, y); c.lineTo(x, y + 3.5); c.lineTo(x - 3.5, y); c.fill(); } c.globalAlpha = 1; } // le marbre d'origine (la ville, la capitale) : des cabochons dorés
    }, 256, 256, { repete: [1, 1] });
    tx.userData.partagee = true; TEX.set('sol' + Q.id, tx); return tx;
  }
  // les tomettes de la Halle (le Marché d'automne) : des hexagones de terre cuite, trois tons à peine différents (une suite fixe : la tuile
  // est la même à chaque fois), leurs joints de mortier clair ; 16 colonnes × 14 rangs : la tuile de 256 se raccorde de tous les côtés
  function solTomettes(c, w, h, Q) {
    const nc = 26, nr = 22, px = w / nc, hr = h / nr, r = px / 1.5, tons = [Q.sol, Q.sol2, M.eclaircir(Q.sol, 0.06), M.assombrir(Q.sol, 0.04)];
    c.lineWidth = 1.1; c.strokeStyle = 'rgba(240,214,180,.85)'; c.lineJoin = 'round';
    for (let i = -1; i <= nc; i++) for (let j = -1; j <= nr; j++) {
      const x = i * px, y = j * hr + ((i % 2 + 2) % 2) * hr / 2, k = (((i + nc) % nc) * 7 + ((j + nr) % nr) * 13 + (((i + nc) % nc) * ((j + nr) % nr)) % 5) % 4;
      c.fillStyle = tons[k]; c.beginPath(); c.moveTo(x - r, y); c.lineTo(x - r / 2, y - hr / 2); c.lineTo(x + r / 2, y - hr / 2); c.lineTo(x + r, y); c.lineTo(x + r / 2, y + hr / 2); c.lineTo(x - r / 2, y + hr / 2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,236,210,.10)'; c.beginPath(); c.ellipse(x - r * 0.2, y - hr * 0.12, r * 0.35, hr * 0.18, 0, 0, TAU); c.fill(); // un reflet de cire
    }
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
  // la nacre (6e finition, lot « progression ») : au milieu de chaque dalle de marbre, une rosace de nacre irisée (rose, ciel, crème) cerclée
  // d'un filet de platine, et une petite perle à chaque croisée des joints
  function solNacre(c, w, h, Q) {
    const t = 64, pl = Q.platine || '#E5E4E2';
    for (let y = 0; y < h; y += t) for (let x = 0; x < w; x += t) {
      const cx = x + t / 2, cy = y + t / 2, g = c.createLinearGradient(cx - 12, cy - 12, cx + 12, cy + 12);
      g.addColorStop(0, '#FBE3EE'); g.addColorStop(0.45, '#DDF0FB'); g.addColorStop(0.75, '#F3ECFF'); g.addColorStop(1, '#FFF4DC');
      c.fillStyle = g; c.strokeStyle = pl; c.lineWidth = 0.8; c.globalAlpha = 0.8;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5, 2.3, a, 0, TAU); c.fill(); c.stroke(); } // huit pétales
      c.globalAlpha = 1; c.beginPath(); c.arc(cx, cy, 3, 0, TAU); c.fillStyle = '#FFFFFF'; c.fill(); c.stroke();
      c.beginPath(); c.arc(cx, cy, 14.5, 0, TAU); c.lineWidth = 0.9; c.stroke(); // le filet de platine
    }
    c.fillStyle = '#FFF8F0'; for (let y = 0; y <= h; y += t) for (let x = 0; x <= w; x += t) { c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill(); }
  }
  // le mur monté en gamme : marbre plus marqué, moulures (filet laiton puis or), pilastres, lambris bas et sa cimaise, corniche dorée
  function murStanding(c, Q) {
    const s = Q.standing || 0, y0 = 81 * 0.62, filet = Q.platine || (s >= 3 ? Q.or : M.assombrir(Q.mur2, 0.12)), fil = Q.platine || Q.or; // (la 6e finition : des filets de platine)
    if (s >= 4) { c.strokeStyle = 'rgba(120,100,90,.16)'; c.lineWidth = 1; for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(k * 47 + 12, 0); c.bezierCurveTo(k * 47 - 18, 22, k * 47 + 40, 34, k * 47 + 6, y0); c.stroke(); } }
    const haut = Q.corniche ? 9 : 6;
    if (Q.panneaux) { c.strokeStyle = filet; c.lineWidth = 1.3; for (let x = 6; x + 40 < 390; x += 48) { c.strokeRect(x, haut + 2, 40, y0 - haut - 7); if (s >= 3) { c.lineWidth = 0.6; c.strokeRect(x + 3, haut + 5, 34, y0 - haut - 13); c.lineWidth = 1.3; } } }
    if (Q.pilastres) for (let x = 0; x <= 390; x += 97.5) { c.fillStyle = M.eclaircir(Q.mur, 0.5); c.fillRect(x - 4, haut, 8, y0 - haut); c.fillStyle = M.assombrir(Q.mur2, 0.06); c.fillRect(x - 1.5, haut + 4, 0.8, y0 - haut - 8); c.fillRect(x + 0.7, haut + 4, 0.8, y0 - haut - 8); c.fillStyle = Q.or; c.fillRect(x - 5.5, haut, 11, 2.2); }
    if (Q.lambris) {
      const bois = M.melange(Q.mur2, Q.bois, 0.32 + 0.04 * s); c.fillStyle = bois; c.fillRect(0, y0, 390, 81 - y0);
      c.strokeStyle = M.assombrir(bois, 0.14); c.lineWidth = 1; for (let x = 4; x + 22 < 392; x += 28) c.strokeRect(x, y0 + 4, 22, 81 - y0 - 9);
      c.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 4; x + 22 < 392; x += 28) c.fillRect(x + 1, y0 + 5, 20, 1);
      c.fillStyle = M.assombrir(Q.bois, 0.1); c.fillRect(0, y0 - 1.5, 390, 3); c.fillStyle = s >= 2 ? fil : M.eclaircir(Q.bois, 0.25); c.fillRect(0, y0 - 2.4, 390, 0.9); // la cimaise et son filet
    }
    if (Q.corniche) { c.fillStyle = M.assombrir(Q.mur2, 0.05); c.fillRect(0, 0, 390, haut - 2); c.fillStyle = fil; c.fillRect(0, haut - 2.4, 390, 1.6); c.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 3; x < 390; x += 7) c.fillRect(x, 2, 3, haut - 6); }
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
      if (Q.murStyle === 'halle') { // la halle à colombages : la sablière en haut, les poteaux de chêne, des croix de Saint-André un panneau sur deux, le lambris de
        // châtaignier en bas (sa cimaise rouille), le torchis crème entre deux, un peu nuancé
        const bois = Q.cadre || Q.bois, yl = 81 * 0.7, pas = 48.75;
        c.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 24; k++) { c.beginPath(); c.ellipse((k * 67) % 390, 8 + (k * 29) % 50, 9, 3.5, 0, 0, TAU); c.fill(); } // le torchis, inégal
        c.strokeStyle = bois; c.lineCap = 'butt';
        for (let i = 0, x = 0; x < 390; i++, x += pas) if (i % 2) { c.lineWidth = 3.2; c.beginPath(); c.moveTo(x + 3, 6); c.lineTo(x + pas - 3, yl - 2); c.moveTo(x + pas - 3, 6); c.lineTo(x + 3, yl - 2); c.stroke(); } // les croix
        c.fillStyle = bois; for (let x = 0; x <= 390; x += pas) c.fillRect(x - 2.6, 0, 5.2, yl); // les poteaux
        c.fillRect(0, 0, 390, 5.5); c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(0, 4.4, 390, 1.1); // la sablière
        c.fillStyle = M.assombrir(Q.bois, 0.05); c.fillRect(0, yl, 390, 81 - yl); c.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 3; x < 390; x += 13) c.fillRect(x, yl + 2, 1.2, 81 - yl - 2); // le lambris
        c.fillStyle = Q.accent; c.fillRect(0, yl - 1.4, 390, 2.6); c.fillStyle = bois; c.fillRect(0, yl + 1.2, 390, 1.4); // la cimaise
      }
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
    if (Q.comptoirTranslucide) { // la 3e finition (lot « progression ») : l'onyx, des plaques de pierre de miel veinées qui laissent passer la lumière
      const xd = vx + vw / 2 + (w - 8 - vw) / 2, wd = w - 8 - vw - 2.6, hc = H - e - 3, veine = M.assombrir(Q.comptoir, 0.22);
      pr.push(P(M.boiteSimple(r2(wd), r2(hc), 0.6), ONYX_LUEUR, { x: xd, y: 1.5, z: zF + 0.2 }), P(M.boiteSimple(5.4, r2(hc), 0.6), ONYX_LUEUR, { x: -w / 2 + 4, y: 1.5, z: zF + 0.2 }), P(M.boiteSimple(r2(vw - 1), r2(yb - 2.4), 0.6), ONYX_LUEUR, { x: vx, y: 1.2, z: zF + 0.2 }));
      for (const [u, a, l] of [[0.25, 0.5, 0.7], [0.6, -0.35, 0.55], [0.82, 0.6, 0.45]]) pr.push(P(M.boiteSimple(0.5, r2(hc * l), 0.7), veine, { x: xd - wd / 2 + wd * u, y: hc * (0.5 - l / 2) + 1.5, z: zF + 0.35, rz: a * 0.4 }));
    }
    const mc = M.maille(pr, { recoit: true }); g.add(mc);
    if (Q.comptoirTranslucide) { const allumer = lueurVerre(mc, [[ONYX_LUEUR, 0.45, 0.3]]); g.userData.anime = (E) => allumer(allumage(E), jourDe(E)); }
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
  // le dessus réel des plateaux, par coin : chaque meuble est bâti pour y arriver (fait main, Kenney ou KayKit, avec ou sans nappe), et les
  // couverts (SCENE, poserCouverts) comme les bougies de la boutique hantée (hantee) s'y posent : une seule mesure, rien ne flotte
  const HAUT = { table: 29, bar: 24, banquette: 10, terrasse: 28 };
  function pointilles(pr, r, c) { // l'emplacement d'un meuble pas encore acheté : un rectangle de tirets au sol (r : rectangle du plan, en pixels)
    const z0 = c.wz(r.y), z1 = c.wz(r.y + r.h), n = Math.max(2, Math.round(r.w / 14)), m = Math.max(2, Math.round((z1 - z0) / 14));
    for (let i = 0; i < n; i++) for (const z of [z0, z1]) pr.push(P(M.boiteSimple(r2(r.w / n * 0.55), 0.4, 1.4), '#FFFFFF', { x: r.x + (i + 0.5) * r.w / n, y: 0.3, z }));
    for (let i = 0; i < m; i++) for (const x of [r.x, r.x + r.w]) pr.push(P(M.boiteSimple(1.4, 0.4, r2((z1 - z0) / m * 0.55)), '#FFFFFF', { x, y: 0.3, z: z0 + (i + 0.5) * (z1 - z0) / m }));
  }
  function maillePointillee(pr, g) { const m = M.maille(pr, { ombre: false }); m.material = M.MAT.pointille; g.add(m); return g; }
  function tableRonde(pr, x, z, R, Ht, Q, c, nappe) { // une table ronde : KayKit, Kenney ou faite main ; son plateau aux couleurs du quartier ; Ht : son dessus (nappe comprise)
    const k = hdp(c, 'table_round_A_small', { w: 2 * R, d: 2 * R, h: nappe ? Ht - 0.8 : Ht, x, z, teinte: Q.comptoir }); if (k) { pr.push(k); if (nappe) pr.push(P(M.cylindre(R - 1.2, R - 1.2, 0.8, 20), Q.accent, { x, y: Ht - 0.8, z })); return; } // (la nappe couvre tout le plateau, comme chez Kenney : les couverts sont dessus)
    if (KN()) { pr.push(kp('tableRound', { w: 2 * R, d: 2 * R, h: Ht - 0.6, x, z }, { wood: Q.comptoir }), P(M.cylindre(R - 1.2, R - 1.2, 1, 22), nappe ? Q.accent : Q.comptoir2, { x, y: Ht - 1, z })); return; }
    pr.push(P(M.cylindre(6.5 * c.K, 7.5 * c.K, 2, 14), Q.bois, { x, z }), P(M.cylindre(2.4, 2.4, Ht - 6, 8), Q.bois, { x, y: 2, z }));
    pr.push(P(M.cylindre(R, R - 1.5, 3, 22), Q.comptoir, { x, y: Ht - 4, z }), P(M.cylindre(R - 0.3, R - 0.3, 1, 22), nappe ? Q.accent : Q.comptoir2, { x, y: Ht - 1, z }));
  }
  // ─── les tables du salon de thé : deux rangées de trois sous la file, deux chaises chacune ───
  function tables(k, c) {
    const { LAY, K, Q } = c, g = grp('tables'); g.userData.zone = 'tables';
    if (k === 0) { const tb = LAY.tables[0]; g.add(M.mesh(M.anneau(14 * K, 16 * K, 32), M.MAT.pointille, { x: tb.x, y: 0.4, z: c.wz(tb.y - 8 * K) }, { ombre: false })); return g; }
    const R = 16 * K, Ht = HAUT.table, pr = [], fl = [], nappe = k >= 4; // Ht : le dessus de la table (nappe comprise), où l'on pose les couverts
    for (let i = 0; i < Math.min(k, LAY.tables.length); i++) {
      const tb = LAY.tables[i], x = tb.x, z = c.wz(tb.y);
      tableRonde(pr, x, z, R, Ht, Q, c, nappe);
      if (nappe) pr.push(P(M.cylindre(R * 0.62, R * 0.62, 0.1, 18), '#FFFFFF', { x, y: Ht, z })); // le napperon, au milieu : un tissu (0,1), les assiettes posées au bord ne s'y enfoncent pas
      for (const s of tb.sieges) chaise(pr, s.x, c.wz(s.y), s.dir, K, Q, k >= 3, c);
      if (k >= 4 || c.crans.deco >= 3) pr.push(P(bo(4, 6, 4, 1.5), '#9BD0FF', { x, y: Ht, z }), P(M.sphere(2.6, 8), ['#FF6B8B', '#FFC84A', '#B8A6FF'][i % 3], { x, y: Ht + 8, z }));
      if (c.crans.deco >= 4) { pr.push(P(M.cylindre(1.6, 1.8, 6, 8), '#FFFDF5', { x: x + 7 * K, y: Ht, z: z - 2 })); fl.push(P(M.sphere(1.5, 8), '#FFC84A', { x: x + 7 * K, y: Ht + 7.5, z: z - 2, sy: 1.5 })); } // les bougies du salon
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
    const n = Math.min(4, k + 1), Hb = HAUT.bar, w = b.x1 - b.x0, xc = (b.x0 + b.x1) / 2, zc = c.wz(b.y - 2 * K), d = 15 * K;
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
      const kt = hdp(c, 'table_low', { w: 28 * K, d: 16 * K, h: HAUT.banquette, x: xt, z: zt });
      if (kt) pr.push(kt); else { pr.push(P(bo(28 * K, 2.5, 16 * K, 1), Q.comptoir2, { x: xt, y: HAUT.banquette - 2.5, z: zt })); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(bo(2, HAUT.banquette - 2, 2, 0.5), Q.bois, { x: xt + sx * 12 * K, z: zt + sz * 6 * K })); }
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
    const R = 12 * K, Ht = HAUT.terrasse, metal = '#4A4A55';
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
  function decoPlan(c) {
    const p = c.LAY.plan, Q = c.Q, d = c.wd(p.h * 0.45), h = c.wy(p.h * 0.55), D = nouvelle('plan', { x: p.x + p.w / 2, z: c.wz(p.y + p.h) }), pr = D.fixe, zc = -d / 2;
    pr.push(P(bo(p.w, h - 3, d, 2), Q.bois, { z: zc }), P(bo(p.w + 2, 3, d + 1.5, 1), Q.comptoir2, { y: h - 3, z: zc }));
    pr.push(P(M.sphere(5.5, 12), '#FFF3C4', { x: -p.w * 0.2, y: h + 0.5, z: zc, sy: 0.5 }), P(M.cylindre(1.7, 1.7, p.w * 0.3, 8), '#C8864F', { x: p.w * 0.2 - p.w * 0.15, y: h + 1.7, z: zc + 1, rz: -Math.PI / 2 }));
    if (KN()) { pr.pop(); pr.push(kp('rollingPin', { w: p.w * 0.36, x: p.w * 0.05, y: h, z: zc + 1 }), kp('bowl', { w: 13, x: p.w * 0.36, y: h, z: zc - 1 }), kp('whisk', { w: 11, x: p.w * 0.36, y: h + 4, z: zc - 1, rz: -0.5, ry: 0.6 })); } // Food Kit : le rouleau, le cul-de-poule et son fouet
    else for (const s of [-1, 1]) pr.push(P(M.cylindre(1, 1, 3, 6), '#E8C39A', { x: p.w * 0.2 + s * (p.w * 0.15 + 1.5), y: h + 1.7, z: zc + 1, rz: -Math.PI / 2 }));
    for (let i = 0; i < 4; i++) pr.push(P(M.sphere(0.9, 6), '#FFFFFF', { x: -p.w * 0.38 + i * 5, y: h + 0.4, z: zc + 2.5 }));
    return D;
  }
  const plan = (c) => enGroupe('plan', decoPlan(c), c);
  function presentoir(n, c) {
    const p = c.LAY.presentoir, Q = c.Q, d = c.wd(p.h * 0.45), h = c.wy(p.h * 0.55), g = grp('presentoir', p.x + p.w / 2, 0, c.wz(p.y + p.h)), pr = [], zc = -d / 2;
    pr.push(P(bo(p.w, h, d, 2.5), Q.bois, { z: zc }), P(bo(p.w + 4, 2.5, d + 3, 1), Q.comptoir2, { y: h, z: zc }));
    for (let i = 1; i < 4; i++) pr.push(P(bo(1.2, h - 4, 0.6, 0.2), M.assombrir(Q.bois, 0.15), { x: -p.w / 2 + i * p.w / 4, y: 2, z: 0.2 }));
    for (let i = 0; i < n; i++) { const bx = n > 1 ? -p.w / 2 + 7 + i * (p.w - 14) / (n - 1) : 0, l = 26 + (i % 2) * 6, a = ((i % 3) - 1) * 0.14; if (KN()) { pr.push(kp('loaf-baguette', { w: l + 6, h: 5.5, d: 5.5, x: bx - Math.sin(a) * (l / 2 + 3), y: h - 3 + Math.cos(a) * (l / 2 + 3) - 3, z: zc, rz: Math.PI / 2 + a })); continue; } pr.push(P(M.capsule(2.6, l, 8), i % 2 ? '#E8B46A' : '#D99A4E', { x: bx - Math.sin(a) * (l / 2 + 3), y: h - 3 + Math.cos(a) * (l / 2 + 3), z: zc, rz: a })); }
    g.add(M.maille(pr)); return g;
  }
  function decoArdoise(c) { // un chevalet : deux montants devant, un derrière, le tableau noir et ses traits de craie
    const a = c.LAY.ardoise, Q = c.Q, D = nouvelle('ardoise', { x: a.x, z: c.wz(a.y) }), pr = D.fixe, h = c.wy(34), t = 0.22;
    for (const sx of [-1, 1]) pr.push(P(bo(2.2, h, 2.2, 0.6), Q.bois, { x: sx * 12, z: -2 - h * Math.sin(t) / 2 + 1, rx: -t }));
    pr.push(P(bo(2.2, h * 0.92, 2.2, 0.6), Q.bois, { z: -14, rx: 0.3 }));
    const ph = c.wy(26), zt = -2 - (h * 0.42) * Math.sin(t), yt = h * 0.42 * Math.cos(t);
    pr.push(P(bo(26, ph + 6, 1.6, 0.8), Q.bois, { y: yt - 3 * Math.cos(t), z: zt + 3 * Math.sin(t), rx: -t }), P(bo(20, ph, 1.2, 0.5), '#2F3A36', { y: yt, z: zt + 1.2, rx: -t }));
    for (const [dy, w, col] of [[0.82, 14, '#FFFFFF'], [0.66, 11, '#FFFFFF'], [0.5, 13, '#FFFFFF'], [0.32, 10, '#FFD98A']]) pr.push(P(bo(w, 1.1, 0.6, 0.2), col, { x: (w - 14) / 2 - 0, y: yt + ph * dy * Math.cos(t), z: zt + 1.9 - ph * dy * Math.sin(t), rx: -t }));
    return D;
  }
  const ardoise = (c) => enGroupe('ardoise', decoArdoise(c), c);
  // ─── les petits objets ───
  function decoPlante(x, y, c, touffe) { // une plante en pot : le pot couleur comptoir, quatre boules de feuillage (Q.plante : sa couleur dans un décor qui la choisit, le violet de la Maison hantée)
    const D = nouvelle('plante', { x, z: c.wz(y + 15) - 9 }), pr = D.fixe, f1 = c.Q.plante || '#5FD3A4', f2 = c.Q.plante ? M.assombrir(c.Q.plante, 0.2) : '#3FB889';
    if (KN()) { pr.push(touffe ? kp('plantSmall2', { h: 50 }, { wood: c.Q.comptoir, plant: f1 }) : kp('pottedPlant', { h: 62 }, { wood: c.Q.comptoir, woodDark: '#6B4A3A', plant: c.Q.plante || '#4FC79A' })); return D; } // Furniture Kit : la touffe ronde (déco) ou la plante à feuilles hautes
    pr.push(P(M.cylindre(9, 7, 18, 12), c.Q.comptoir), P(M.cylindre(9.6, 9.6, 2.5, 12), M.eclaircir(c.Q.comptoir, 0.2), { y: 16.5 }), P(M.cylindre(7.5, 7.5, 1, 12), '#6B4A3A', { y: 18 }));
    for (const [ox, oy, r] of [[0, 30, 9.5], [-8.5, 22, 7], [8.5, 22, 7], [0, 43, 7]]) pr.push(P(M.sphere(r, 10), f1, { x: ox, y: oy, z: 0 }));
    pr.push(P(M.sphere(3.5, 8), f2, { x: -4.5, y: 36, z: 6 }), P(M.sphere(3, 8), f2, { x: 5, y: 27, z: 6.5 }));
    return D;
  }
  function plante(x, y, c, touffe) { const D = decoPlante(x, y, c, touffe), g = grp('plante'); g.applyMatrix4(D.base); g.add(M.maille(D.fixe)); return g; } // (la plante de la déco : un maillage à elle, sa boîte est la zone de touche du meuble)
  function decoFleurs(c) { // un petit vase et trois fleurs rose, beurre, lavande sur le comptoir
    const o = surDessus(c, c.LAY.fleurs), D = nouvelle('fleurs', o), pr = D.fixe, hv = c.wy(10);
    pr.push(P(bo(10, hv, 10, 3), c.Q.comptoir2));
    for (const [a, col, l] of [[-0.3, '#FF6B8B', 20], [0, '#FFC84A', 23], [0.3, '#B8A6FF', 19]]) pr.push(P(M.cylindre(0.7, 0.7, l, 5), '#3FB889', { y: hv - 2, rz: -a }), P(M.sphere(3.2, 9), col, { x: Math.sin(a) * l, y: hv - 2 + Math.cos(a) * l, z: 0 }));
    return D;
  }
  const fleurs = (c) => enGroupe('fleurs', decoFleurs(c), c);
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
  function decoPaillasson(couleur, c) {
    const p = c.LAY.paillasson, Q = c.Q, d = c.wd(9), col = couleur ? Q.accent : Q.vue === 'ville' ? '#5A4A5E' : '#B9875A', D = nouvelle('paillasson', { x: p.x, z: c.wz(p.y + 0.5) }), pr = D.fixe;
    if (KN()) { pr.push(kp('rugDoormat', { w: 40, h: 1.4, d }, { wood: col })); return D; } // le paillasson du Furniture Kit
    pr.push(P(bo(40, 1.2, d, 0.5), col));
    for (let k = 0; k < 4; k++) pr.push(P(bo(5, 0.5, d * 0.5, 0.2), M.eclaircir(col, 0.3), { x: -13.5 + k * 9, y: 1.1 }));
    return D;
  }
  const paillasson = (couleur, c) => enGroupe('paillasson', decoPaillasson(couleur, c), c);
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
  function decoCadre(x, y, c) { // un petit tableau : cadre bois, marge blanche, toile peinte (ciel, soleil, collines) ; un décor à portrait (la Maison hantée) : l'ancêtre fantôme
    const D = nouvelle('cadre', { x, y: murY(c, y + 12), z: 1.5 }), h = c.wy(24), port = !!c.Q.portrait;
    D.fixe.push(P(bo(32, h, 3, 0.8), port ? '#B07A2E' : boisCadre(c)), P(bo(28, h - c.wy(4), 1.5, 0.4), port ? '#E0B65A' : '#FFFFFF', { z: 1.6 }));
    D.tex.push({ w: 26, h: h - c.wy(6), o: { z: 2.5 }, zone: port ? 'portrait' : 'toile', k: port ? 1.25 : 1.3 }); // (sa lueur d'avant, 0,25 ou 0,3 : un éclat dans la couleur)
    return D;
  }
  const cadre = (x, y, c) => enGroupe('cadre', decoCadre(x, y, c), c);
  // le portrait de l'ancêtre du manoir : un fantôme distingué en nœud papillon, sur fond de nuit (le même que celui du Manoir, src/evenement.js)
  const portrait = () => { let tx = TEX.get('portrait'); if (tx) return tx; tx = M.texture((x, w, h) => {
    x.scale(w / 80, h / 100); x.fillStyle = '#2A2050'; x.fillRect(0, 0, 80, 100); x.fillStyle = '#3B2A66'; x.beginPath(); x.ellipse(40, 50, 34, 44, 0, 0, TAU); x.fill();
    x.fillStyle = '#F4F1FF'; x.beginPath(); x.moveTo(20, 92); x.lineTo(20, 46); x.arc(40, 46, 20, Math.PI, 0); x.lineTo(60, 92); for (let k = 0; k < 4; k++) x.quadraticCurveTo(55 - k * 10, 84, 50 - k * 10, 92); x.fill();
    x.fillStyle = '#1E1824'; x.beginPath(); x.ellipse(33, 46, 3, 4.2, 0, 0, TAU); x.ellipse(47, 46, 3, 4.2, 0, 0, TAU); x.fill();
    x.fillStyle = '#FF9FB2'; x.beginPath(); x.arc(28, 54, 2.6, 0, TAU); x.arc(52, 54, 2.6, 0, TAU); x.fill();
    x.fillStyle = '#E1496C'; x.beginPath(); x.moveTo(40, 66); x.lineTo(31, 61); x.lineTo(31, 71); x.closePath(); x.moveTo(40, 66); x.lineTo(49, 61); x.lineTo(49, 71); x.closePath(); x.fill();
    x.strokeStyle = '#1E1824'; x.lineWidth = 1.8; x.beginPath(); x.arc(40, 53, 4.2, 0.2, Math.PI - 0.2); x.stroke();
  }, 80, 100); tx.userData.partagee = true; TEX.set('portrait', tx); return tx; };
  // l'heure de Paris des aiguilles (E.d : lu en getUTC…) ; sans heure, midi
  const angleHeure = (E) => { const d = E.d; if (!d) return 0; return -((d.getUTCHours() % 12) + d.getUTCMinutes() / 60) / 12 * TAU; };
  const angleMinute = (E) => { const d = E.d; return d ? -d.getUTCMinutes() / 60 * TAU : 0; };
  const aiguille = (geo, z, angle) => ({ pr: [P(geo, L)], emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(angle(E)); m4.setPosition(0, 0, z); } });
  function decoHorloge(c) { // cadran blanc cerclé de bois, deux aiguilles tournées selon l'heure ; étirée pour paraître ronde à l'écran
    const h = c.LAY.horloge, D = nouvelle('horloge', { x: h.x, y: murY(c, h.y), z: 1, sy: 1 / c.CY });
    D.fixe.push(P(M.cylindre(10, 10, 1.5, 24), '#FFFFFF', { rx: Math.PI / 2 }), P(M.tore(10, 1.3, TAU, 8, 28), boisCadre(c), { z: 1.5 }), P(M.sphere(1.4, 8), '#E1496C', { z: 2.6 }));
    D.vifs.push(aiguille(M.boiteSimple(1.6, 5, 0.8), 1.8, angleHeure), aiguille(M.boiteSimple(1.3, 7.5, 0.8), 2.2, angleMinute)); // les aiguilles (vives : la greffe les tourne)
    return D;
  }
  const horloge = (c) => enGroupe('horloge', decoHorloge(c), c);
  function decoDiplome(c) { // le diplôme du boulanger : cadre bois, parchemin, trois lignes grises, le sceau rouge
    const d = c.LAY.diplome, D = nouvelle('diplome', { x: d.x, y: murY(c, d.y + 13), z: 1.2 }), h = c.wy(26), pr = D.fixe;
    pr.push(P(bo(22, h, 2.4, 0.8), boisCadre(c)), P(bo(16, c.wy(20), 1.2, 0.4), '#FFFDF5', { z: 1.4 }));
    for (let k = 0; k < 3; k++) pr.push(P(bo(10, 0.8, 0.5, 0.2), '#B5A49A', { y: c.wy(5 - k * 4), z: 2.1 }));
    pr.push(P(M.sphere(2.5, 8), '#E1496C', { x: 3, y: -c.wy(6), z: 2.2, sz: 0.5 }));
    return D;
  }
  const diplome = (c) => enGroupe('diplome', decoDiplome(c), c);
  function decoLampe(c) { // la lampe du fournil : un dôme accent fixé en haut du mur par une potence, l'ampoule qui s'allume le soir (pas de cordon : il n'y a pas de plafond)
    const l = c.LAY.lampe, D = nouvelle('lampe', { x: l.x, y: murY(c, l.y + 8), z: 0 });
    D.fixe.push(P(bo(3, 3, 12, 1), L, { y: 4, z: 6 }), P(bo(8, 8, 2, 1.5), M.assombrir(c.Q.accent, 0.2), { y: 1, z: 1 }), P(M.cylindre(4, 11, 9, 14), c.Q.accent, { y: -5, z: 13 }));
    D.vifs.push({ pr: [P(M.sphere(3.6, 10), '#FFF3C4', { y: -5, z: 13 })], emi: '#FFF3C4', k: (E) => E.lampes, m: null }); // l'ampoule
    return D;
  }
  const lampe = (c) => enGroupe('lampe', decoLampe(c), c);

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
  function decoGraffiti(c) { // (une toile de l'atlas, découpée : alphaTest ; sa lueur d'avant, 0,25, en éclat)
    const { LAY, W } = c, w = Math.min(44, W * 0.11), h = w * 0.55, D = nouvelle('graffiti', { x: W * 0.79, y: murY(c, LAY.T * 0.265), z: 0.6 });
    D.tex.push({ w, h, o: { rz: -0.08 }, zone: 'tag', k: 1.25 }); return D;
  }
  // l'enseigne néon : un éclair rose et un tube menthe suspendus dans la fenêtre, qui grésillent le soir (un maillage, deux matériaux)
  // haut : l'étagère aux bocaux du bestiaire (bocaux) est posée aussi, sur le rebord de la même fenêtre, et ses bocaux montent dans sa moitié
  // basse ; le néon remonte alors contre le haut de la fenêtre, et rapetisse s'il le faut, pour finir au-dessus des couvercles (les bocaux ne bougent pas)
  function decoNeon(c, haut) {
    const { LAY } = c, f = LAY.fenetre, x = f.x + f.w * 0.5; let y = murY(c, f.y + f.h * 0.5), s = Math.max(10, Math.min(16, f.h * 0.3));
    if (haut) { // le haut de la fenêtre ; le haut des bocaux (la planche au rebord, leur hauteur wy(17), le couvercle et son bouton : 3,5), et un jour de 1,5
      const plafond = murY(c, f.y) - 1, couvercles = murY(c, f.y + f.h + 1) + c.wy(17) + 3.5 + 1.5;
      s = Math.min(s, (plafond - couvercles) / 1.9); y = plafond - 0.95 * s;
    }
    const D = nouvelle('neon', { x, y, z: 3 });
    D.fixe.push(P(bo(s * 1.6, s * 1.9, 1.2, 1), '#2E2B3A', { y: -0.95 * s, z: -0.8 })); // le fond noir mat, centré derrière les tubes (une boîte est posée : sa base en y)
    const zig = [[-0.25, 0.75], [0.1, 0.1], [-0.08, 0.1], [0.25, -0.75]].map(([u, v]) => [u * s, v * s]), tubes = [];
    for (let k = 0; k < zig.length - 1; k++) { const [x0, y0] = zig[k], [x1, y1] = zig[k + 1], l = Math.hypot(x1 - x0, y1 - y0); tubes.push(P(M.capsule(0.9, l, 6), '#FF6B8B', { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0.6, rz: Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2 })); }
    D.vifs.push({ pr: tubes, emi: '#FF6B8B', k: (E) => (0.55 + 0.45 * E.lampes) * (Math.sin(E.t * 17) > 0.92 ? 0.25 : 1), m: null }, // l'éclair rose, qui grésille
      { pr: [P(M.tore(s * 0.62, 0.8, TAU, 6, 20), '#5FD3A4', { z: 0.3, sy: 1.15 })], emi: '#5FD3A4', k: (E) => 0.5 + 0.5 * E.lampes, m: null }); // le tube menthe
    return D;
  }
  // le chien du quartier : un bâtard couché au bord du salon, roux et blanc, la queue qui bat (un maillage fusionné + la queue)
  const _eu = new THREE.Euler();
  function decoChien(c) {
    const { LAY, W, K } = c, x = LAY.chien ? LAY.chien.x : W * 0.62, y = LAY.chien ? LAY.chien.y : LAY.T * 0.92 + LAY.spread * 0.6, D = nouvelle('chien', { x, z: c.wz(y), s: K }), poil = '#C8864F', clair = '#FFF3E2', pr = D.fixe;
    pr.push(P(M.capsule(6, 14, 10), poil, { y: 6, rz: Math.PI / 2 }), P(M.sphere(4.8, 10), clair, { x: -2, y: 5, z: 2.2, sx: 1.4, sy: 0.9 })); // le corps et la bavette
    pr.push(P(M.sphere(6.2, 12), poil, { x: 12, y: 8 }), P(M.capsule(2.6, 4, 8), poil, { x: 16.5, y: 6.5, z: 1, rz: -Math.PI / 2 }), P(M.sphere(1.6, 6), L, { x: 20.5, y: 7, z: 1.2 })); // la tête, le museau, la truffe
    for (const sx of [-1, 1]) pr.push(P(M.capsule(2.2, 4, 6), '#8B5A3C', { x: 10 + sx * 1.5, y: 10.5, z: sx * 5.2, rz: sx * 0.6, rx: sx * 0.9 }), P(bo(1.8, 0.9, 0.5, 0.2), L, { x: 14.5, y: 9.4, z: sx * 2.4 })); // les oreilles qui tombent, les yeux
    pr.push(P(M.capsule(2.2, 7, 6), clair, { x: -4, y: 2.2, z: 6.5, rz: Math.PI / 2 }), P(M.capsule(2.2, 7, 6), clair, { x: -4, y: 2.2, z: -6.5, rz: Math.PI / 2 }), P(M.capsule(2.4, 8, 6), poil, { x: 8, y: 2.4, z: 7, rz: Math.PI / 2 })); // les pattes repliées, une patte avant allongée
    pr.push(P(M.tore(3.8, 0.9, Math.PI, 6, 12), '#E1496C', { x: 11, y: 7.5, rx: Math.PI / 2, rz: Math.PI })); // le collier
    D.vifs.push({ pr: [P(M.capsule(1.4, 9, 6), poil)], emi: null, k: 0, m: (E, m4) => { _eu.set(0, Math.sin(E.t * 6) * 0.55, Math.PI / 2 + 0.3); m4.makeRotationFromEuler(_eu); m4.setPosition(-14, 3, 2); } }); // la queue qui bat
    return D;
  }
  // ─── les décos de la Maison hantée (src/hantee.js), gagnées aux paliers et gardées à vie : mignonnes-effrayantes, jamais dans le passage ───
  const partsCitrouille = (x, y, z, r) => { const pr = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; pr.push(P(M.sphere(r * 0.62, 10), k % 2 ? '#F28C28' : '#FF9A3D', { x: x + Math.cos(a) * r * 0.42, y: y + r * 0.72, z: z + Math.sin(a) * r * 0.3, sy: 1.05 })); } pr.push(P(M.cylindre(r * 0.12, r * 0.16, r * 0.42, 6), '#5A7A2E', { x, y: y + r * 1.32, z })); return pr; };
  const partsVisageCitrouille = (x, y, z, r) => [P(M.cone(r * 0.2, r * 0.26, 3), '#FFE27A', { x: x - r * 0.3, y: y + r * 0.86, z: z + r * 0.6, rx: HP }), P(M.cone(r * 0.2, r * 0.26, 3), '#FFE27A', { x: x + r * 0.3, y: y + r * 0.86, z: z + r * 0.6, rx: HP }), P(bo(r * 0.7, r * 0.16, r * 0.12, r * 0.05), '#FFE27A', { x, y: y + r * 0.42, z: z + r * 0.64 })];
  // les citrouilles-lanternes : trois, au pied du mur près de la petite porte, qui s'allument le soir (le visage s'illumine)
  function decoCitrouilles(c) {
    const { LAY, W, K } = c, D = nouvelle('citrouilles'), vis = [];
    for (const [u, dy, r] of [[0.335, 10, 10], [0.362, 19, 7.5], [0.308, 20, 6.5]]) { const x = W * u, z = c.wz(LAY.murH + dy * K), rr = r * K; D.fixe.push(...partsCitrouille(x, 0, z, rr)); vis.push(...partsVisageCitrouille(x, 0, z, rr)); }
    D.vifs.push({ pr: vis, emi: '#FFB347', k: (E) => 0.35 + 0.65 * E.lampes + 0.1 * Math.sin(E.t * 9), m: null }); // les visages qui s'allument
    return D;
  }
  // les toiles d'araignée : deux coins hauts du mur (une toile peinte, un plan chacun) et une petite araignée souriante au bout de son fil
  const toileAraignee = () => { let tx = TEX.get('toile-ht'); if (tx) return tx; tx = M.texture((x, w, h) => {
    x.strokeStyle = 'rgba(120,110,150,.75)'; x.lineWidth = 2.2; x.lineCap = 'round';
    for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * w, Math.sin(a) * h); x.stroke(); }
    x.lineWidth = 1.6; for (let r = w * 0.18; r < w; r += w * 0.17) { x.beginPath(); for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2, px = Math.cos(a) * r, py = Math.sin(a) * r; if (k === 0) x.moveTo(px, py); else { const am = (k - 0.5) / 5 * Math.PI / 2; x.quadraticCurveTo(Math.cos(am) * r * 0.86, Math.sin(am) * r * 0.86, px, py); } } x.stroke(); }
  }, 128, 128); tx.userData.partagee = true; TEX.set('toile-ht', tx); return tx; };
  // place : posée au rebord de la fenêtre (src/vie.js, LAY.decos r1 ou r2), une seule toile tendue dans le coin haut de sa place (à gauche
  // pour r1, à droite pour r2), contre la vitre, et l'araignée au bout de son fil
  function decoToiles(c, place) {
    const { LAY, K } = c, droite = !!place && place.id === 'r2', s = place ? Math.min(34 * K, place.w * 1.15, c.wy(place.h) * 1.15) : 34 * K;
    const D = place ? nouvelle('toiles', { x: droite ? place.x + place.w / 2 : place.x - place.w / 2, y: murY(c, place.y - place.h), z: 0.5 }) : nouvelle('toiles', { z: 0.5 }), yh = place ? 0 : murY(c, 0), xa = place ? (droite ? -s * 0.62 : s * 0.62) : s * 0.62, za = place ? 1 + 2.8 * K : 1; // (posée : l'araignée devant la vitre, pas dans le mur)
    if (place) D.tex.push({ w: s, h: s, o: droite ? { x: -s / 2, y: -s / 2, rz: -HP } : { x: s / 2, y: -s / 2 }, zone: 'araignee', k: 1.15 });
    else D.tex.push({ w: s, h: s, o: { x: s / 2, y: yh - s / 2 }, zone: 'araignee', k: 1.15 }, { w: s, h: s, o: { x: LAY.porte.x - s / 2 - 2, y: yh - s / 2, rz: -HP }, zone: 'araignee', k: 1.15 }); // les deux toiles (un maillage d'avant, MeshBasic : sans lumière, d'où l'éclat)
    const fil = (E) => s * (0.45 + 0.25 * Math.sin(E.t * 0.8));
    D.vifs.push({ pr: [P(M.cylindre(0.25, 0.25, 1, 4), '#9C94B8')], emi: null, k: 0, m: (E, m4) => { const l = fil(E); m4.makeScale(1, l, 1); m4.setPosition(xa, yh - l, za); } }, // le fil, qui s'allonge et remonte
      { pr: [P(M.sphere(2.6 * K, 8), '#2E2547'), P(M.sphere(1.8 * K, 8), '#2E2547', { y: -2.6 * K }), P(M.sphere(0.6 * K, 6), '#FFFFFF', { x: -0.8 * K, y: -2.8 * K, z: 1.6 * K }), P(M.sphere(0.6 * K, 6), '#FFFFFF', { x: 0.8 * K, y: -2.8 * K, z: 1.6 * K })], emi: null, k: 0, m: (E, m4) => { m4.makeTranslation(xa, yh - fil(E) - 2 * K, za); } }); // la petite araignée au bout
    return D;
  }
  // le chaudron : sur trois pieds au bord du fournil, une potion verte qui bouillonne et fume doucement (le reflet vert s'allume le soir)
  function decoChaudron(c) {
    const { LAY, W, K } = c, r = 10 * K, x = W * 0.085, z = c.wz(LAY.murH + 54 * K), D = nouvelle('chaudron', { x, z }), pr = D.fixe;
    pr.push(P(M.sphere(r, 14), '#2B2533', { y: r * 0.95, sy: 0.8 }), P(M.tore(r * 0.9, 1.4 * K, TAU, 6, 18), '#4A4060', { y: r * 1.62, rx: HP }));
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5; pr.push(P(M.cylindre(1.2 * K, 0.9 * K, 5 * K, 6), '#2B2533', { x: Math.cos(a) * r * 0.65, z: Math.sin(a) * r * 0.65 })); }
    D.vifs.push({ pr: [P(M.cylindre(r * 0.84, r * 0.84, 1, 16), '#8FE36B', { y: r * 1.58 })], emi: '#8FE36B', k: (E) => 0.45 + 0.35 * E.lampes + 0.15 * Math.sin(E.t * 3), m: null }); // la potion
    for (let k = 0; k < 3; k++) D.vifs.push({ pr: [P(M.sphere(1.7 * K, 8), '#C6FF8F')], emi: '#C6FF8F', k: 0.8, m: (E, m4) => { const ph = (E.t * 0.6 + k / 3) % 1, b = Math.sin(ph * Math.PI) + 0.05; m4.makeScale(b, b, b); m4.setPosition(Math.sin(k * 2.3 + E.t) * r * 0.4, r * 1.6 + ph * 14 * K, Math.cos(k * 1.9) * r * 0.3); } }); // les bulles qui montent
    return D;
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
  // l'étagère aux bocaux de monstres (le bestiaire de la Maison hantée : cinq sortes de clients-monstres complétées, q.decos 'bestiaire') :
  // une planche en rebord de la fenêtre (au-dessus du four : le milieu du mur passe sous l'enseigne de la boutique), quatre bocaux au couvercle de couleur, un petit monstre dans chacun (un fantôme, une
  // tête-citrouille, une chauve-souris, un crâne), leur étiquette. Un seul appel de dessin (le budget de la boutique) : le verre n'est pas
  // transparent, c'est le fond du bocal (un demi-cylindre bleuté, aplati contre le mur) avec ses deux cerclages et un reflet ; le petit
  // monstre est posé devant, dedans.
  // teinte : 'argent' (les neuf sortes en argent, q.decos 'bestiaire-argent') ou 'or' (les neuf en or, 'bestiaire-or' : elle remplace
  // l'autre) : la même étagère, mêmes pièces, mêmes bocaux et mêmes petits monstres, la planche, les équerres, les couvercles et les
  // cerclages dans ce métal (les couleurs des sommets : toujours fusionnée avec les petits décors, aucun appel de dessin de plus)
  const TEINTES_BOCAUX = {
    argent: { bois: '#B9C3CF', couv: ['#E3E9F0', '#C9D2DD', '#E3E9F0', '#C9D2DD'], cercle: '#F2F5F9', fond: '#D9E6F2' },
    or: { bois: '#D9A62E', couv: ['#FFD45A', '#F2B937', '#FFD45A', '#F2B937'], cercle: '#FFE58A', fond: '#F4ECD2' },
  };
  function decoBocaux(c, teinte) {
    const T = TEINTES_BOCAUX[teinte] || null;
    const f = c.LAY.fenetre, K = c.K, D = nouvelle('bestiaire'), pr = D.fixe, n = 4, ys = f.y + f.h + 1, Yp = murY(c, ys);
    const cx = f.x + f.w / 2, w = f.w - 6, pas = w / n, r = Math.min(6.4 * K, pas * 0.36), hj = c.wy(17), Q = c.Q;
    const bois = T ? T.bois : Q.bois, fond = T ? T.fond : '#CFE3F4', cercle = T ? T.cercle : '#A9C8E2';
    pr.push(P(bo(w, 2.4, 10, 0.8), bois, { x: cx, y: Yp - 2.4, z: 5.5 }), P(bo(2, 6, 6, 0.6), bois, { x: cx - w / 2 + 4, y: Yp - 8, z: 3.2 }), P(bo(2, 6, 6, 0.6), bois, { x: cx + w / 2 - 4, y: Yp - 8, z: 3.2 })); // la planche, ses deux équerres
    const couv = T ? T.couv : ['#8E5CF7', '#FF8A1F', '#5FD3A4', '#E1496C'];
    for (let i = 0; i < n; i++) {
      const x = cx - w / 2 + pas * (i + 0.5), z = 5.5, y0 = Yp, ym = y0 + hj * 0.42, rm = r * 0.55;
      pr.push(P(M.cylindre(r, r, hj, 12), fond, { x, y: y0 + hj / 2, z: z - r * 0.45, sz: 0.55 }), P(M.sphere(r, 12), fond, { x, y: y0 + hj, z: z - r * 0.45, sy: 0.35, sz: 0.55 }), // le fond du bocal (son épaule arrondie)
        P(M.tore(r, 0.45, TAU, 5, 14), cercle, { x, y: y0 + 0.5, z, rx: HP }), P(M.tore(r * 0.86, 0.45, TAU, 5, 14), cercle, { x, y: y0 + hj + 0.4, z, rx: HP }), // ses deux cerclages
        P(bo(0.9, hj * 0.55, 0.4, 0.2), '#FFFFFF', { x: x - r * 0.6, y: y0 + hj * 0.55, z: z + r * 0.75 })); // un reflet
      pr.push(P(M.cylindre(r * 0.82, r * 0.82, 2.2, 12), couv[i], { x, y: y0 + hj + 1.2, z }), P(M.sphere(0.9, 6), couv[i], { x, y: y0 + hj + 2.6, z })); // le couvercle et son bouton
      pr.push(P(bo(r * 1.1, c.wy(3.4), 0.5, 0.2), '#FFF3DC', { x, y: y0 + hj * 0.18, z: z + r + 0.2 })); // l'étiquette
      if (i === 0) pr.push(P(M.sphere(rm, 10), '#FFFFFF', { x, y: ym, z, sy: 1.25 }), P(M.sphere(rm * 0.2, 6), L, { x: x - rm * 0.35, y: ym + rm * 0.2, z: z + rm * 0.85 }), P(M.sphere(rm * 0.2, 6), L, { x: x + rm * 0.35, y: ym + rm * 0.2, z: z + rm * 0.85 })); // le petit fantôme
      else if (i === 1) pr.push(...partsCitrouille(x, ym - rm * 0.7, z, rm), ...partsVisageCitrouille(x, ym - rm * 0.7, z, rm)); // la tête-citrouille
      else if (i === 2) { pr.push(P(M.sphere(rm, 10), '#5B4A86', { x, y: ym, z }), P(M.sphere(rm * 0.28, 6), '#FFE7A3', { x: x - rm * 0.38, y: ym + rm * 0.15, z: z + rm * 0.82 }), P(M.sphere(rm * 0.28, 6), '#FFE7A3', { x: x + rm * 0.38, y: ym + rm * 0.15, z: z + rm * 0.82 })); for (const sx of [-1, 1]) pr.push(P(M.cone(rm * 0.4, rm * 0.9, 5), '#5B4A86', { x: x + sx * rm * 0.55, y: ym + rm * 1.05, z, rz: -sx * 0.35 }), P(M.sphere(rm * 0.7, 8), '#46386E', { x: x + sx * rm * 1.05, y: ym, z: z - 0.4, sx: 0.9, sy: 0.6, sz: 0.25, rz: sx * 0.4 })); } // la chauve-souris
      else pr.push(P(M.sphere(rm, 10), '#F4F0E6', { x, y: ym, z }), P(M.sphere(rm * 0.27, 6), '#3A2E46', { x: x - rm * 0.38, y: ym + rm * 0.1, z: z + rm * 0.84 }), P(M.sphere(rm * 0.27, 6), '#3A2E46', { x: x + rm * 0.38, y: ym + rm * 0.1, z: z + rm * 0.84 }), P(bo(rm * 0.9, rm * 0.55, rm * 0.7, 0.2), '#F4F0E6', { x, y: ym - rm * 0.8, z: z + rm * 0.2 })); // le petit crâne
    }
    return D;
  }
  // la lanterne de la légende (le 20e palier de la Maison hantée, q.decos 'legende', à vie) : un petit réverbère de fer forgé posé au pied
  // du fournil, à gauche (entre le chaudron et le plan de travail : hors de l'allée, des apprentis et de la grille des meubles), son toit
  // pointu et sa boule dorée, une citrouille à son pied ; dans sa cage, une flamme verte phosphorescente qui respire et vacille, plus
  // vive le soir. Deux appels de dessin (le fer, la flamme), comme les citrouilles-lanternes
  function decoLanterne(c) {
    const { LAY, W, K: K0 } = c, K = K0 * 1.65, D = nouvelle('legende', { x: W * 0.05, z: c.wz(LAY.murH + 78 * K0) }), fer = '#2B2533', fer2 = '#4A3D63', or = '#FFC84A', pr = D.fixe; // (K : sa propre échelle, un peu plus grande que celle de la salle)
    const hc = 21 * K, cg = 8.5 * K, l = 3.2 * K; // le haut du poteau (le bas de la cage), la hauteur de la cage, sa demi-largeur
    pr.push(P(M.cylindre(3.4 * K, 4 * K, 1.6 * K, 10), fer, { y: 0.8 * K }), P(M.cylindre(0.75 * K, 0.9 * K, hc, 8), fer, { y: hc / 2 }), // le pied, le poteau
      P(M.tore(1.3 * K, 0.4 * K, TAU, 5, 12), or, { y: hc * 0.55, rx: HP }), P(M.sphere(1.3 * K, 8), fer2, { y: hc - 0.4 * K }), // la bague dorée, le col
      P(bo(2 * l + 1.6 * K, 1.2 * K, 2 * l + 1.6 * K, 0.4), fer2, { y: hc + 0.6 * K }), P(bo(2 * l + 0.8 * K, 1 * K, 2 * l + 0.8 * K, 0.3), fer2, { y: hc + cg + 0.5 * K })); // le plancher, le plafond de la cage
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(bo(0.8 * K, cg, 0.8 * K, 0.2), fer, { x: sx * l, y: hc + 1.2 * K + cg / 2, z: sz * l })); // les quatre montants (pas de vitre devant : la flamme se voit)
    pr.push(P(M.cone(l * 1.65, 5 * K, 4), fer, { y: hc + cg + 3.4 * K, ry: Math.PI / 4 }), P(M.sphere(1 * K, 8), or, { y: hc + cg + 6.4 * K }), // le toit pointu, la boule dorée
      P(M.tore(1.1 * K, 0.35 * K, TAU, 5, 10), fer, { y: hc + cg + 7.6 * K })); // l'anneau du sommet
    pr.push(...partsCitrouille(5.6 * K, 0, 0.6 * K, 3 * K), ...partsVisageCitrouille(5.6 * K, 0, 0.6 * K, 3 * K)); // la petite citrouille du pied, à côté (pas devant : le plan de travail est juste en dessous)
    const y0 = hc + 1.2 * K + cg * 0.42;
    D.vifs.push({ pr: [P(M.sphere(2.3 * K, 10), '#C6FF8F', { sy: 1.15 }), P(M.cone(1.8 * K, 4 * K, 8), '#C6FF8F', { y: 2.9 * K }), P(M.sphere(1 * K, 8), '#F2FFE0', { y: -0.2 * K, z: 1 * K })], emi: '#7CFF6B', // la flamme verte, qui respire et vacille
      k: (E) => 0.95 + 0.6 * E.lampes + 0.2 * Math.sin(E.t * 2.3), m: (E, m4) => { const k = Math.sin(E.t * 2.3), v = Math.sin(E.t * 11) * Math.sin(E.t * 7.3); m4.makeScale(1 - 0.04 * k, 1 + 0.1 * k + 0.05 * v, 1 - 0.04 * k); m4.setPosition(0, y0 + 0.3 * K * k, 0); } });
    return D;
  }
  // la toque de la recette du jour (src/activites.js : la 500e fournée d'un événement, q.decos) : une petite plaque accrochée à la porte de
  // l'arrière-boutique (au-dessus, l'enseigne de la boutique la cacherait), sa toque devant ; 'or' (la Planque) : la toque dorée sur fond
  // nuit ; 'citrouille' (le Manoir) : une citrouille qui porte la toque. bas : la seconde place, plus bas sur la porte (les deux gagnées).
  // Dessinée en pixels d'écran, étirée de 1/CY (ronde à l'écran)
  // 'feuille' (la Halle) : la toque brodée de feuilles d'or, sur fond de noyer dans son cadre rouille, une feuille d'érable devant. bas : la
  // seconde place (true), ou le rang de la place (0, 1, 2 : la toque de la Halle prend la troisième quand les deux autres sont là)
  function decoToque(c, sorte, bas) {
    const a = c.LAY.arriere, cit = sorte === 'citrouille', fe = sorte === 'feuille', rang = bas === true ? 1 : +bas || 0, hpx = a ? c.LAY.murH - a.y : 60, x = a ? a.x + a.w / 2 : c.W * 0.32, ys = (a ? a.y : c.LAY.T * 0.2) + hpx * [0.21, 0.47, 0.73][Math.min(2, rang)];
    const D = nouvelle(cit ? 'toque-citrouille' : fe ? 'toque-feuille' : 'toque-or', { x, y: murY(c, ys), z: 4.2, sy: 1 / c.CY }), pr = D.fixe;
    pr.push(P(bo(19, 17, 2.2, 0.8), cit ? '#7B4FD0' : fe ? MC.rouille : '#FFC84A'), P(bo(15.5, 13.5, 1.2, 0.4), cit ? '#2A2047' : fe ? '#4A2E1C' : '#2E2B3A', { z: 1.4 })); // le cadre, le fond
    const yt = cit ? 2.6 : fe ? 0.4 : -1; // le bas de la toque (le tout un peu haut : vu de haut, ce qui avance du mur descend à l'écran)
    if (cit) { pr.push(P(M.sphere(4.4, 12), '#FF8A3D', { y: -0.6, z: 2.6, sx: 1.25, sz: 0.5 }), P(bo(1.4, 1.6, 0.6, 0.2), '#3FB889', { y: 3.6, z: 2.8 })); for (const sx of [-1, 1]) pr.push(P(M.sphere(0.8, 6), '#FFE27A', { x: sx * 1.9, y: 0, z: 4.6 })); }
    if (fe) pr.push(feuille(-3.6, -4.6, 3.4, 2.6, MC.or, { rz: 0.5 }), feuille(3.8, -4.4, 3.4, 2.2, MC.rouille, { rz: -0.4 }));
    const blanc = cit || fe ? '#FFFFFF' : '#FFE07A';
    pr.push(P(M.cylindre(2.9, 2.9, 3.2, 12), blanc, { y: yt + 1.6, z: 2.6, sz: 0.5 })); // le bandeau de la toque
    for (const dx of [-2.2, 0, 2.2]) pr.push(P(M.sphere(2.3, 10), blanc, { x: dx, y: yt + 4.6 + (dx ? 0 : 0.8), z: 2.6, sz: 0.5 })); // le bouffant
    pr.push(P(bo(6.4, 0.9, 0.5, 0.2), cit ? '#FF8A3D' : fe ? MC.or : '#5FD3A4', { y: yt + 1.4, z: 4.2 })); // le ruban
    if (fe) for (const dx of [-1.6, 1.6]) pr.push(feuille(dx, yt + 1.9, 4.6, 0.75, MC.or, { rz: dx * 0.3 })); // les deux feuilles d'or brodées sur le ruban
    return D;
  }
  // ─── la boutique hantée (src/boutiquehantee.js, le thème « hantee » de src/vie.js) : les bougies (un chandelier sur le comptoir, une
  //     bougie au milieu de chaque table, deux sur le bar, une sur le plan de travail), deux lanternes de part et d'autre de la porte du
  //     fond, trois chauves-souris accrochées sous la corniche. Deux appels de dessin : le décor fusionné, fait main (la qualité éco ou sans HD :
  //     en haute, la boutique hantée a son décor KayKit entier, src/boutiquehantee.js) et les flammes, qui vacillent et brillent plus fort le soir ───
  function hantee(c) {
    const { LAY, W, K } = c, g = grp('hantee', 0, 0, 0), pr = [], fl = [], cire = '#F4EEE0', fer = '#2B2533';
    const flamme = (x, y, z, r) => fl.push(P(M.sphere(r || 1.5, 6), '#FFD27A', { x, y, z, sy: 1.7 }));
    const bougie = (x, y, z, h, r) => { pr.push(P(M.cylindre(r, r * 1.05, h, 8), cire, { x, y, z }), P(M.cylindre(0.25, 0.25, 1.6, 4), L, { x, y: y + h, z })); flamme(x, y + h + 2, z, r * 0.75); };
    // le chandelier du comptoir, à gauche du chat (la place des fleurs, qui n'y sont pas)
    const o = surDessus(c, LAY.fleurs);
    { pr.push(P(M.cylindre(4 * K, 4.6 * K, 1.4, 12), fer, o), P(M.cylindre(0.8, 0.8, 7 * K, 6), fer, { x: o.x, y: o.y + 1.4, z: o.z }), P(bo(13 * K, 1.2, 1.6, 0.4), fer, { x: o.x, y: o.y + 7 * K, z: o.z })); for (const dx of [-5.6, 0, 5.6]) bougie(o.x + dx * K, o.y + 8 * K + (dx ? 0 : 1.6), o.z, dx ? 5 * K : 6 * K, 1.3); }
    // une bougie au milieu de chaque table achetée, deux sur le bar, une sur le plan de travail
    const surTable = (x, y, z) => { pr.push(P(M.cylindre(2.6, 2.9, 1, 10), fer, { x, y, z })); bougie(x, y + 1, z, 4.4 * K, 1.2); };
    for (let i = 0; i < Math.min(c.crans.tables || 0, LAY.tables.length); i++) { const t = LAY.tables[i]; surTable(t.x, HAUT.table, c.wz(t.y)); }
    if ((c.crans.bar || 0) > 0) { const b = LAY.bar; for (const u of [0.2, 0.8]) surTable(b.x0 + (b.x1 - b.x0) * u, HAUT.bar, c.wz(b.y - 4 * K)); }
    const pl = LAY.plan;
    bougie(pl.x + pl.w * 0.78, c.wy(pl.h * 0.55), c.wz(pl.y + pl.h * 0.6), 5 * K, 1.4);
    // les deux lanternes de la porte du fond, posées au sol de part et d'autre, dans la salle (jamais dans le passage : l'allée entre au milieu)
    const p = LAY.porte, zl = c.wz(LAY.murH + 8 * K);
    for (const x of [p.x - 9 * K, Math.min(W - 6 * K, p.x + p.w + 9 * K)]) {
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
  // ─── le Marché d'automne (src/boutiquemarche.js, le thème « marche » de src/vie.js) : les accessoires de la Halle, faits main au même
  //     trait (pommes, courges, cagettes, bottes de paille, feuilles d'érable, lampions, le brasero aux châtaignes), le décor de la Halle en
  //     éco (marche) et ses décos (les paliers du Marché, la saison d'automne) ───
  const MC = { rouille: '#C8552A', creme: '#F6E7C8', or: '#E8B33A', mousse: '#7A9A3A', chataigne: '#7B4A2A', pomme: '#C8342B', pommeV: '#8DB33A', pommeJ: '#E8B33A', courge: '#E07B2A', courgeJ: '#E8A93A', paille: '#E2C26A', bois: '#A8743F', boisF: '#6B4026', fer: '#3A302C', feuilles: ['#D9622B', '#E8B33A', '#B8372A', '#C98A2B', '#8E3B2E'] };
  // la feuille d'érable : une forme plate (cinq lobes et sa queue), d'une unité d'épaisseur, environ 1,7 de haut
  // la feuille d'érable : treize points, ses trois grands lobes et ses deux petits (48 triangles extrudée)
  const erable = () => forme('erable', () => { const s = new THREE.Shape(), p = [[0, 1], [0.2, 0.52], [0.6, 0.68], [0.46, 0.26], [0.86, 0.14], [0.3, -0.2], [0.05, -0.72], [-0.05, -0.72], [-0.3, -0.2], [-0.86, 0.14], [-0.46, 0.26], [-0.6, 0.68], [-0.2, 0.52]]; s.moveTo(p[0][0], p[0][1]); for (const [x, y] of p.slice(1)) s.lineTo(x, y); s.closePath(); return s; });
  const feuille = (x, y, z, s, col, o) => P(erable(), col, Object.assign({ x, y, z, sx: s, sy: s, sz: Math.max(0.4, s * 0.12) }, o || {}));
  const partsPomme = (x, y, z, r, col) => [P(M.sphere(r, 7), col, { x, y: y + r * 0.92, z, sy: 0.92 }), P(M.cylindre(r * 0.1, r * 0.12, r * 0.55, 4), MC.boisF, { x, y: y + r * 1.62, z, rz: 0.3 })];
  function partsCourge(x, y, z, r, col, o) { // une courge (ou un potiron) : cinq côtes, son pédoncule ; o.plat : un potiron plus large que haut
    const pr = [], sy = o && o.plat ? 0.78 : 1.05; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; pr.push(P(M.sphere(r * 0.62, 6), k % 2 ? col : M.eclaircir(col, 0.12), { x: x + Math.cos(a) * r * 0.42, y: y + r * 0.66 * sy, z: z + Math.sin(a) * r * 0.32, sy })); }
    pr.push(P(M.cylindre(r * 0.1, r * 0.15, r * 0.45, 5), '#5A7A2E', { x, y: y + r * 1.2 * sy, z, rz: 0.25 })); return pr;
  }
  // une cagette de bois (le fond, quatre côtés en lattes avec leur jour, les coins) remplie : pommes, courges, châtaignes, champignons ou raisin
  function partsCagette(x, y, z, w, d, h, contenu, ry) {
    const pr = [], e = Math.max(0.6, w * 0.05), bois = MC.bois, m = M.matrice({ x, y, z, ry: ry || 0 }), L2 = [];
    L2.push(P(M.boiteSimple(w, e, d), M.assombrir(bois, 0.08)));
    for (const [sx, sz, lw, ld] of [[0, d / 2 - e / 2, w, e], [0, -d / 2 + e / 2, w, e], [w / 2 - e / 2, 0, e, d], [-w / 2 + e / 2, 0, e, d]]) for (const yy of [e, h * 0.58]) L2.push(P(M.boiteSimple(lw, h * 0.32, ld), bois, { x: sx, y: yy, z: sz }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L2.push(P(M.boiteSimple(e * 1.4, h, e * 1.4), M.assombrir(bois, 0.12), { x: sx * (w / 2 - e * 0.7), z: sz * (d / 2 - e * 0.7) }));
    const tc = contenu === 'courges' ? 1.25 : 0.9, nx = Math.max(2, Math.round(w / (h * tc))), nz = Math.max(1, Math.round(d / (h * tc))), rx = w / nx / 2, rz = d / nz / 2, rr = Math.min(rx, rz) * 0.95; // (les courges : moins nombreuses, plus grosses)
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const px = -w / 2 + rx * (2 * i + 1), pz = -d / 2 + rz * (2 * j + 1), yy = h * 0.55, k = i * 3 + j * 7;
      if (contenu === 'courges') L2.push(...partsCourge(px, yy - rr * 0.2, pz, rr * 1.05, k % 3 === 1 ? MC.courgeJ : MC.courge, { plat: true }));
      else if (contenu === 'chataignes') { for (const [dx, dz] of [[-0.35, -0.3], [0.35, 0.2], [-0.1, 0.4]]) L2.push(P(M.sphere(rr * 0.5, 5), k % 2 ? MC.chataigne : '#8E5A33', { x: px + dx * rr, y: yy + rr * 0.3, z: pz + dz * rr, sy: 0.8 })); }
      else if (contenu === 'champignons') { L2.push(P(M.cylindre(rr * 0.22, rr * 0.28, rr * 0.7, 6), '#F4E3C3', { x: px, y: yy, z: pz }), P(M.sphere(rr * 0.6, 8), k % 2 ? '#B5733C' : '#C98A3A', { x: px, y: yy + rr * 0.7, z: pz, sy: 0.55 })); }
      else if (contenu === 'raisin') { for (let g2 = 0; g2 < 5; g2++) L2.push(P(M.sphere(rr * 0.32, 6), k % 2 ? '#6B3A7A' : '#8E4E8E', { x: px + (g2 % 2 - 0.5) * rr * 0.5, y: yy + rr * (0.55 - g2 * 0.08), z: pz + (g2 - 2) * rr * 0.22 })); }
      else L2.push(...partsPomme(px, yy - rr * 0.35, pz, rr * 0.92, [MC.pomme, MC.pommeV, MC.pomme, MC.pommeJ][k % 4]));
    }
    for (const p of L2) pr.push(PARTIE(p, m)); return pr;
  }
  const partsBotte = (x, y, z, w, h, d, ry) => { const m = M.matrice({ x, y, z, ry: ry || 0 }); return [P(bo(w, h, d, Math.min(h, d) * 0.22), MC.paille), P(bo(w * 0.98, h * 0.12, d * 1.02, 0.2), '#C9A24E', { y: h * 0.86 }), P(M.boiteSimple(w * 0.06, h * 1.02, d * 1.03), '#8E6B3A', { x: -w * 0.25 }), P(M.boiteSimple(w * 0.06, h * 1.02, d * 1.03), '#8E6B3A', { x: w * 0.25 })].map((p) => PARTIE(p, m)); };
  // un lampion de papier (la boule, ses deux collerettes sombres) ; la boule est sa part lumineuse (lp), le reste fixe (pr)
  function lampion(pr, lp, x, y, z, r, col) { pr.push(P(M.cylindre(r * 0.45, r * 0.5, r * 0.22, 8), MC.fer, { x, y: y + r * 0.92, z }), P(M.cylindre(r * 0.5, r * 0.4, r * 0.2, 8), MC.fer, { x, y: y - r * 1.1, z }), P(M.cylindre(0.18, 0.18, r * 0.8, 3), MC.fer, { x, y: y + r * 1.1, z })); lp.push(P(M.sphere(r, 10), col, { x, y: y - r * 0.08, z, sy: 1.12 })); }
  // le brasero du marchand de marrons : trois pieds, la vasque de fonte, la grille, les braises (lumineuses) et les châtaignes qui grillent
  function brasero(pr, lp, x, y, z, s) {
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4; pr.push(P(M.cylindre(0.6 * s, 0.5 * s, 7 * s, 5), MC.fer, { x: x + Math.cos(a) * 4.6 * s, y, z: z + Math.sin(a) * 4.6 * s, rz: Math.cos(a) * 0.18, rx: -Math.sin(a) * 0.18 })); }
    pr.push(P(M.cylindre(7 * s, 4.4 * s, 3.4 * s, 12), MC.fer, { x, y: y + 6.2 * s, z }), P(M.tore(6.9 * s, 0.5 * s, TAU, 4, 14), '#5A4A42', { x, y: y + 9.6 * s, z, rx: HP }));
    for (const [dx, dz] of [[-2.6, -1], [0, 1.6], [2.6, -0.4], [-0.8, -2.4], [1.4, 2.8], [-3, 1.8]]) pr.push(P(M.sphere(1.05 * s, 6), dx > 0 ? MC.chataigne : '#5E3720', { x: x + dx * s, y: y + 10.2 * s, z: z + dz * s, sy: 0.78 }));
    for (const [dx, dz] of [[-1.6, 0], [1.4, -1.4], [0.6, 2], [-2.8, -2.2], [3, 1.2]]) lp.push(P(M.sphere(1.3 * s, 5), '#FF7A2A', { x: x + dx * s, y: y + 9.1 * s, z: z + dz * s, sy: 0.6 }));
  }
  // l'auvent rayé de l'étal, rouille et crème, accroché en haut du mur derrière le comptoir (au-dessus de la tête du boulanger : il ne la cache
  // pas en plongée), et son lambrequin festonné
  function auvent(pr, x0, x1, Y, D, a) {
    const n = Math.max(4, Math.round((x1 - x0) / 9)), sw = (x1 - x0) / n, L2 = D / Math.cos(a), yf = Y - D * Math.tan(a);
    for (let i = 0; i < n; i++) { const x = x0 + sw * (i + 0.5), col = i % 2 ? MC.creme : MC.rouille; pr.push(P(M.boiteSimple(sw + 0.05, 1.1, L2), col, { x, y: Y - D * Math.tan(a) / 2, z: D / 2, rx: a }), P(M.cylindre(sw / 2, sw / 2, 0.8, 10), col, { x, y: yf - 0.4, z: D + 0.3, rx: HP })); }
    pr.push(P(M.cylindre(0.7, 0.7, x1 - x0 + 4, 6), MC.boisF, { x: x0 - 2, y: Y + 0.6, z: 0.8, rz: -HP })); // la tringle
  }
  // ─── la Halle en éco (le thème « marche » : la boutique pendant le Marché d'automne ; en haute, la HD a son décor entier) : l'auvent rayé
  //     de l'étal, un panier de pommes sur le comptoir, une courge et un lampion sur chaque table, deux sur le bar, le brasero aux châtaignes
  //     sur le plan de travail, les cagettes et une botte de paille de part et d'autre de la porte du fond, la guirlande de feuilles et de
  //     lampions sous la sablière. Deux appels de dessin (src/meubles.js fusion : le décor ; les lampions, les braises qui rougeoient, plus
  //     fort le soir, et qui se balancent doucement) ───
  function marche(c) {
    const { LAY, W, K } = c, D = nouvelle('marche'), pr = D.fixe, lp = [], Hm = c.wy(LAY.murH), C = LAY.comptoir;
    auvent(pr, C.x - 4 * K, C.x + C.w + 4 * K, Hm - 3, 15 * K, 0.42);
    const o = surDessus(c, LAY.fleurs); // le panier de pommes du comptoir (la place des fleurs, qui n'y sont pas)
    pr.push(P(M.cylindre(5.6 * K, 4.4 * K, 3.6 * K, 10), '#C9934E', o), P(M.tore(5.4 * K, 0.5 * K, Math.PI, 4, 10), '#A8743F', { x: o.x, y: o.y + 3.6 * K, z: o.z, rz: 0 }));
    for (const [dx, dz, col] of [[-2.2, -1, MC.pomme], [2.1, -0.6, MC.pommeV], [0, 1.6, MC.pomme], [-0.6, -2.4, MC.pommeJ]]) pr.push(...partsPomme(o.x + dx * K, o.y + 2.2 * K, o.z + dz * K, 2.1 * K, col));
    const surTable = (x, y, z, i) => { pr.push(...partsCourge(x - 5 * K, y, z + 2 * K, 3.2 * K, i % 2 ? MC.courgeJ : MC.courge, { plat: true })); lampion(pr, lp, x + 4 * K, y + 5.4 * K, z - 1 * K, 2.6 * K, [MC.or, MC.rouille, '#F2D3A0'][i % 3]); pr.push(P(M.cylindre(1.6 * K, 2 * K, 1.2 * K, 8), MC.boisF, { x: x + 4 * K, y, z: z - 1 * K }), P(M.cylindre(0.25, 0.25, 2.2 * K, 3), MC.fer, { x: x + 4 * K, y: y + 1.2 * K, z: z - 1 * K })); };
    for (let i = 0; i < Math.min(c.crans.tables || 0, LAY.tables.length); i++) { const t = LAY.tables[i]; surTable(t.x, HAUT.table, c.wz(t.y), i); }
    if ((c.crans.bar || 0) > 0) { const b = LAY.bar; [0.2, 0.8].forEach((u, i) => surTable(b.x0 + (b.x1 - b.x0) * u, HAUT.bar, c.wz(b.y - 4 * K), i + 1)); }
    const pl = LAY.plan; brasero(pr, lp, pl.x + pl.w * 0.72, c.wy(pl.h * 0.55), c.wz(pl.y + pl.h * 0.6), 0.85 * K);
    // de part et d'autre de la porte du fond, dans la salle (jamais dans le passage) : deux cagettes empilées, une botte de paille et sa citrouille
    const p = LAY.porte, zl = c.wz(LAY.murH + 9 * K), xg = p.x - 15 * K, xd = Math.min(W - 9 * K, p.x + p.w + 6 * K);
    pr.push(...partsCagette(xg, 0, zl, 16 * K, 10 * K, 6 * K, 'pommes'), ...partsCagette(xg, 6 * K, zl - 0.5, 15 * K, 9.5 * K, 6 * K, 'courges', 0.12));
    pr.push(...partsBotte(xd, 0, zl + 2 * K, 11 * K, 7 * K, 9 * K, 0.1), ...partsCourge(xd, 7 * K, zl + 2 * K, 3.6 * K, MC.courge));
    // la guirlande sous la sablière : des feuilles d'érable sur une ficelle, un lampion toutes les quatre feuilles (on évite le haut de la fenêtre
    // et de la porte, où pendent les lampions de la déco et les feuilles de la couronne)
    const yh = Hm - 6, fx1 = LAY.fenetre.x + LAY.fenetre.w + 6, n = 22;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = fx1 + (p.x - 8 - fx1) * u, creux = Math.sin(((u * 3) % 1) * Math.PI) * 5 * K, y = yh - creux;
      if (x > C.x - 6 * K && x < C.x + C.w + 6 * K) continue; // (l'auvent de l'étal passe là)
      if (i % 4 === 2) lampion(pr, lp, x, y - 4 * K, 3.5, 2.4 * K, [MC.rouille, MC.or, '#F2D3A0'][(i / 4 | 0) % 3]);
      else pr.push(feuille(x, y - 1.6 * K, 2.6, 2.8 * K, MC.feuilles[i % MC.feuilles.length], { rz: (i % 3 - 1) * 0.5 }));
    }
    D.vifs.push({ pr: lp, emi: '#FFB45A', k: (E) => 0.22 + 0.78 * E.lampes + 0.05 * Math.sin(E.t * 7), m: null }); // les lampions et les braises : ils s'allument le soir
    const f = fusion([{ d: D, place: null }]), g = grp('marche'); if (f.petits) g.add(f.petits); if (f.lueurs) { g.add(f.lueurs); g.userData.anime = f.anime; }
    g.userData.lampions = lp.length; return g;
  }
  // ─── les décos du Marché d'automne (src/marche.js : les paliers 2, 4, 6, 8, l'album de la forêt au 5e, l'arbre aux feuilles d'or au 20e, la
  //     toque brodée de feuilles à la 500e fournée de la recette du jour ; st.marche.decos, gardées à vie) et de la saison d'automne (src/saison-automne.js,
  //     les crans 3, 7, 15, 19 et 22). Celles du Marché ont leur place d'origine (comme celles du Manoir) ; celles de la saison n'existent que posées.
  //     Bâties comme les autres : en parties typées (fixe, vifs), fusionnées avec les petits décors (aucun appel de dessin de plus) ───
  function decoCagettes(c, place) { // les cagettes du perron : deux cagettes côte à côte (pommes, courges), une troisième dessus (châtaignes), un potiron devant
    const { LAY, K } = c, pl = place ? null : LAY.decos.find((x) => x.id === 's1'), D = place ? nouvelle('cagettes') : nouvelle('cagettes', { x: pl.x - 2 * K, z: c.wz(pl.y) - 4 * K }), pr = D.fixe;
    pr.push(...partsCagette(-8.5 * K, 0, 0, 16 * K, 10 * K, 6.5 * K, 'pommes', 0.08), ...partsCagette(8.5 * K, 0, 0.6, 16 * K, 10 * K, 6.5 * K, 'courges', -0.06), ...partsCagette(0.5 * K, 6.5 * K, -0.5, 15 * K, 9.5 * K, 6 * K, 'chataignes', 0.18));
    pr.push(...partsCourge(-12 * K, 0, 8.5 * K, 3.8 * K, MC.courge, { plat: true }));
    return D;
  }
  function decoLampions(c, place) { // les lampions de la Halle : une ficelle et cinq lampions qui s'allument le soir ; d'origine, tendue en haut de la fenêtre ;
    // posée (un rebord), sur deux piquets de châtaignier
    const { LAY, K } = c, f = LAY.fenetre, w = place ? 34 : f.w - 10, D = place ? nouvelle('lampions') : nouvelle('lampions', { x: f.x + f.w / 2, y: murY(c, f.y) - 2, z: 3.5 }), pr = D.fixe, lp = [], h = place ? 22 : 0, n = 5;
    if (place) for (const sx of [-1, 1]) pr.push(P(M.cylindre(0.7, 0.8, h + 1, 5), MC.boisF, { x: sx * w / 2 }), P(M.sphere(1, 6), MC.boisF, { x: sx * w / 2, y: h + 1 }));
    for (let k = 0; k <= 12; k++) { const u = k / 12, x = -w / 2 + w * u, y = h - Math.sin(u * Math.PI) * 4.5 * (place ? 1 : K); pr.push(P(M.sphere(0.35, 4), MC.fer, { x, y })); }
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, x = -w / 2 + w * u, y = h - Math.sin(u * Math.PI) * 4.5 * (place ? 1 : K) - 4.2; lampion(pr, lp, x, y, 0, place ? 2.9 : 3.1 * K, [MC.rouille, MC.or, '#F2D3A0', MC.rouille, MC.or][i]); }
    D.vifs.push({ pr: lp, emi: '#FFB45A', k: (E) => 0.2 + 0.85 * E.lampes, m: (E, m4) => { m4.makeRotationZ(Math.sin(E.t * 1.3) * 0.02); } });
    return D;
  }
  function decoFeuilles(c, place) { // le tas de feuilles mortes : un tas roux, des feuilles d'érable dessus et autour, trois petits champignons, un râteau couché
    const { LAY, W, K } = c, D = place ? nouvelle('feuilles') : nouvelle('feuilles', { x: W * 0.27, z: c.wz(LAY.devanture.y + 24 * K) }), pr = D.fixe, s = place ? 1 : K;
    pr.push(P(M.sphere(11 * s, 10), '#B8572A', { y: 0, sy: 0.42, sx: 1.15 }), P(M.sphere(7 * s, 9), '#D9822B', { x: -3 * s, y: 1.5 * s, z: 1 * s, sy: 0.5 }), P(M.sphere(6 * s, 9), '#C9612E', { x: 5 * s, y: 1 * s, z: -1 * s, sy: 0.45 }));
    for (let k = 0; k < 14; k++) { const a = k * 2.4, r = (k < 7 ? 5 : 11.5) * s, y = k < 7 ? 4.2 * s : 0.4; pr.push(feuille(Math.cos(a) * r, y, Math.sin(a) * r * 0.8, 2.3 * s, MC.feuilles[k % MC.feuilles.length], { rx: -HP + 0.3 * Math.sin(a * 3), rz: a })); }
    for (const [x, z, h] of [[-9, 6, 3], [-7, 8, 2.2], [10, 5, 2.6]]) pr.push(P(M.cylindre(0.7 * s, 0.9 * s, h * s, 6), '#F4E3C3', { x: x * s, z: z * s }), P(M.sphere(1.7 * s, 8), '#C8342B', { x: x * s, y: h * s, z: z * s, sy: 0.6 }), P(M.sphere(0.4 * s, 4), '#FFFFFF', { x: (x + 0.6) * s, y: (h + 0.8) * s, z: (z + 1) * s }));
    pr.push(P(M.cylindre(0.45 * s, 0.45 * s, 22 * s, 5), MC.bois, { x: 6 * s, y: 0.6 * s, z: 9 * s, rz: HP - 0.05, ry: 0.5 }), P(M.boiteSimple(7 * s, 0.6 * s, 1 * s), MC.fer, { x: -4 * s, y: 0.2 * s, z: 14.3 * s, ry: 0.5 }));
    return D;
  }
  function decoTonneau(c, place) { // le tonneau du pressoir : les douelles bombées, trois cercles de fer, le robinet et son gobelet, un panier de pommes dessus
    const { LAY, K } = c, pl = place ? null : LAY.decos.find((x) => x.id === 's2'), D = place ? nouvelle('tonneau') : nouvelle('tonneau', { x: pl.x, z: c.wz(pl.y) - 5 * K }), pr = D.fixe, s = place ? 1 : K, r = 7 * s, h = 17 * s;
    pr.push(P(M.cylindre(r * 0.86, r * 0.9, h * 0.25, 14), '#9C6B42'), P(M.cylindre(r, r * 0.9, h * 0.25, 14), '#A8743F', { y: h * 0.25 }), P(M.cylindre(r * 0.9, r, h * 0.25, 14), '#A8743F', { y: h * 0.5 }), P(M.cylindre(r * 0.86, r * 0.9, h * 0.25, 14), '#9C6B42', { y: h * 0.75 }));
    for (const [y, rr] of [[0.12, 0.9], [0.5, 1.01], [0.88, 0.9]]) pr.push(P(M.tore(r * rr, 0.55 * s, TAU, 4, 16), MC.fer, { y: h * y, rx: HP }));
    for (let k = 0; k < 8; k++) pr.push(P(M.boiteSimple(0.35 * s, h * 0.96, 0.4 * s), '#7B4A2A', { x: Math.sin(k * TAU / 8) * r * 0.98, y: h * 0.02, z: Math.cos(k * TAU / 8) * r * 0.98, ry: k * TAU / 8 })); // les joints des douelles
    pr.push(P(M.cylindre(r * 0.84, r * 0.84, 0.6 * s, 14), '#8E5A33', { y: h }), P(M.cylindre(0.7 * s, 0.7 * s, 3 * s, 6), '#C9A24E', { y: h * 0.35, z: r + 1 * s, rx: HP }), P(M.boiteSimple(1.2 * s, 2 * s, 1 * s), '#C9A24E', { y: h * 0.35 - 1.6 * s, z: r + 2.4 * s }));
    pr.push(P(M.cylindre(1.5 * s, 1.1 * s, 2.6 * s, 8), '#E8D2A8', { x: 3 * s, z: r + 4 * s }));
    pr.push(P(M.cylindre(4.4 * s, 3.4 * s, 2.6 * s, 10), '#C9934E', { y: h + 0.6 * s }), ...partsPomme(-1.4 * s, h + 2 * s, -0.6 * s, 1.8 * s, MC.pomme), ...partsPomme(1.6 * s, h + 2 * s, 0.4 * s, 1.8 * s, MC.pommeV), ...partsPomme(0.2 * s, h + 2.4 * s, 1.6 * s, 1.7 * s, MC.pommeJ));
    return D;
  }
  // l'étagère aux peluches de la forêt (l'album, src/marche.js : la 5e sorte complétée ; 'argent', 'or' : les neuf en argent, puis en or, la même
  // étagère à ce métal) : une planche et ses équerres, trois peluches (l'écureuil, le hérisson, le renard) assises, un petit gland. D'origine, à la
  // place du second tableau (src/vie.js m1 : la déco l'y décroche, comme une déco posée)
  const TEINTES_ALBUM = { argent: { bois: '#B9C3CF', ruban: '#E3E9F0' }, or: { bois: '#D9A62E', ruban: '#FFD45A' } };
  function decoAlbum(c, place, teinte) {
    const { LAY, K } = c, T = TEINTES_ALBUM[teinte] || null, m1 = LAY.decos.find((x) => x.id === 'm1'), D = place ? nouvelle('album') : nouvelle('album', { x: m1.x, y: murY(c, m1.y) - 6, z: 0 }), pr = D.fixe, s = place ? 1 : K * 1.15, bois = T ? T.bois : MC.bois;
    pr.push(P(bo(36 * s, 2.2 * s, 9 * s, 0.6), bois, { z: 4.5 * s }), P(bo(1.8 * s, 6 * s, 5 * s, 0.4), bois, { x: -14 * s, y: -6 * s, z: 2.5 * s }), P(bo(1.8 * s, 6 * s, 5 * s, 0.4), bois, { x: 14 * s, y: -6 * s, z: 2.5 * s }));
    if (T) pr.push(P(M.boiteSimple(36.4 * s, 0.6 * s, 0.4 * s), T.ruban, { y: 1.6 * s, z: 9.1 * s }));
    const peluche = (x, corps, ventre, o) => {
      const y = 2.2 * s, z = 4.6 * s; pr.push(P(M.sphere(3.4 * s, 8), corps, { x, y: y + 3 * s, z, sy: 0.95 }), P(M.sphere(2.2 * s, 8), ventre, { x, y: y + 2.7 * s, z: z + 1.6 * s, sy: 1.05, sz: 0.6 }), P(M.sphere(2.9 * s, 8), corps, { x, y: y + 7.6 * s, z }));
      for (const sx of [-1, 1]) pr.push(P(M.sphere(1.1 * s, 6), corps, { x: x + sx * 2.6 * s, y: y + 1, z: z + 1.6 * s }), P(M.sphere(0.45 * s, 5), L, { x: x + sx * 1 * s, y: y + 8.1 * s, z: z + 2.6 * s }));
      pr.push(P(M.sphere(0.6 * s, 5), o.nez || L, { x, y: y + 7.2 * s, z: z + 2.9 * s }));
      if (o.oreilles) for (const sx of [-1, 1]) pr.push(P(M.cone(1.1 * s, 2.8 * s, 5), corps, { x: x + sx * 1.8 * s, y: y + 9.4 * s, z, rz: -sx * 0.3 }), P(M.cone(0.5 * s, 1.6 * s, 4), o.pointe || ventre, { x: x + sx * 2.1 * s, y: y + 11.4 * s, z: z + 0.2 * s, rz: -sx * 0.3 }));
      if (o.queue) pr.push(P(M.sphere(2.6 * s, 8), o.queue, { x: x + 3.2 * s, y: y + 5.4 * s, z: z - 1.6 * s, sx: 0.7, sy: 1.4 }));
      if (o.piquants) for (let k = 0; k < 7; k++) { const a = -1.2 + k * 0.4; pr.push(P(M.cone(0.9 * s, 2.4 * s, 4), '#5A3E2E', { x: x + Math.sin(a) * 3 * s, y: y + 3.6 * s + Math.cos(a) * 2.4 * s, z: z - 2 * s, rz: -a, rx: -0.5 })); }
    };
    peluche(-10 * s, '#C8662B', '#F2C79A', { oreilles: true, pointe: '#7B3A1A', queue: '#D97A3A' }); // l'écureuil
    peluche(0, '#9A7A5E', '#EBCFA8', { piquants: true }); // le hérisson
    peluche(10 * s, '#E0672A', '#FFF3E2', { oreilles: true, pointe: '#2E2420', queue: '#E0672A' }); // le renard
    pr.push(P(M.sphere(1.3 * s, 6), '#B8862F', { x: 15.4 * s, y: 3.3 * s, z: 6 * s, sy: 1.2 }), P(M.cylindre(1.4 * s, 1.3 * s, 0.9 * s, 6), '#6B4026', { x: 15.4 * s, y: 4.2 * s, z: 6 * s })); // un gland
    return D;
  }
  // l'arbre aux feuilles d'or (la Légende du Marché, le 20e palier) : un petit érable en pot, son tronc tordu, une couronne de feuilles d'or qui
  // luisent doucement (plus fort le soir), et deux feuilles qui tombent en tournoyant, sans fin
  function decoArbreOr(c, place) {
    const { W, LAY, K } = c, D = place ? nouvelle('arbre-or') : nouvelle('arbre-or', { x: W * 0.93, z: c.wz(LAY.T * 0.66) }), pr = D.fixe, s = place ? 1 : K * 1.1, lp = [];
    pr.push(P(M.cylindre(6 * s, 4.6 * s, 6 * s, 10), '#B5552B'), P(M.tore(6 * s, 0.7 * s, TAU, 4, 14), '#8E3B1E', { y: 6 * s, rx: HP }), P(M.cylindre(5.4 * s, 5.4 * s, 0.6 * s, 10), '#5A3A22', { y: 5.6 * s }));
    pr.push(P(M.cylindre(1.1 * s, 1.7 * s, 14 * s, 6), '#6B4026', { y: 6 * s, rz: 0.12 }), P(M.cylindre(0.6 * s, 0.9 * s, 7 * s, 5), '#6B4026', { x: 1.6 * s, y: 15 * s, rz: -0.7 }), P(M.cylindre(0.6 * s, 0.9 * s, 6 * s, 5), '#6B4026', { x: -0.6 * s, y: 16 * s, rz: 0.8 }));
    for (const [x, y, z, r] of [[0, 25, 0, 7.5], [-6, 22, 1, 5.5], [6.5, 21.5, 0, 5.2], [2, 29, -1, 5], [-3, 28, 2, 4.6]]) lp.push(P(M.sphere(r * s, 10), r > 6 ? '#F2C14A' : '#E8B33A', { x: x * s, y: y * s, z: z * s, sy: 0.85 }));
    for (let k = 0; k < 10; k++) { const a = k * 2.4, y = (22 + (k % 4) * 2.6) * s; lp.push(feuille(Math.cos(a) * 7.6 * s, y, Math.sin(a) * 6 * s + 2 * s, 2.4 * s, k % 2 ? '#FFD45A' : '#E8A93A', { rz: a, rx: -0.4 })); }
    D.vifs.push({ pr: lp, emi: '#E8B33A', k: (E) => 0.3 + 0.5 * E.lampes + 0.08 * Math.sin(E.t * 1.7), m: null });
    for (let k = 0; k < 2; k++) D.vifs.push({ pr: [feuille(0, 0, 0, 2.6 * s, '#FFD45A')], emi: '#E8B33A', k: 0.5, m: (E, m4) => { const u = (E.t * 0.16 + k * 0.5) % 1; _eu.set(Math.sin(E.t * 3 + k) * 0.8, E.t * 2 + k, Math.sin(E.t * 2.3 + k) * 0.6); m4.makeRotationFromEuler(_eu); m4.setPosition((k ? 7 : -6) * s + Math.sin(u * 9 + k) * 3 * s, (22 - u * 20) * s, (3 + k * 2) * s); } });
    return D;
  }
  // ─── les décos de la saison d'automne (src/saison-automne.js : la piste), posées seulement ───
  function decoCouronneFeuilles() { // la couronne de la porte : un anneau de feuilles d'érable, des glands, deux baies, le nœud de toile rouille
    const D = nouvelle('couronne-feuilles'), pr = D.fixe, n = 16;
    pr.push(P(M.tore(10, 2.2, TAU, 6, 18), '#8E6B3A', { z: 1.5 }));
    for (let k = 0; k < n; k++) { const a = k / n * TAU; pr.push(feuille(Math.cos(a) * 10, Math.sin(a) * 10, 3 + (k % 2) * 0.6, 3.6, MC.feuilles[k % MC.feuilles.length], { rz: a - HP + (k % 2 ? 0.4 : -0.3) })); }
    for (const a of [0.6, 2.2, 3.9, 5.2]) pr.push(P(M.sphere(1.4, 6), '#B8862F', { x: Math.cos(a) * 8.6, y: Math.sin(a) * 8.6, z: 5, sy: 1.2 }), P(M.cylindre(1.5, 1.4, 1, 6), '#6B4026', { x: Math.cos(a) * 8.6, y: Math.sin(a) * 8.6 + 1.4, z: 5 }));
    for (const [x, y] of [[-3, -9.5], [2.6, -10]]) pr.push(P(M.sphere(1.2, 6), '#C8342B', { x, y, z: 5.6 }));
    pr.push(P(M.sphere(2.4, 8), MC.rouille, { y: -11, z: 6, sx: 1.3, sz: 0.6 }), P(bo(4.6, 3, 1.2, 0.4), MC.rouille, { x: -3.6, y: -12.4, z: 5.6, rz: 0.6 }), P(bo(4.6, 3, 1.2, 0.4), MC.rouille, { x: 3.6, y: -12.4, z: 5.6, rz: -0.6 }), P(bo(1.8, 7, 0.8, 0.3), MC.rouille, { x: -1.6, y: -19, z: 5.2, rz: 0.15 }), P(bo(1.8, 7, 0.8, 0.3), MC.rouille, { x: 1.6, y: -19, z: 5.2, rz: -0.15 }));
    return D;
  }
  function decoGuirlandeFeuilles() { // la guirlande de feuilles : une ficelle drapée en deux creux, vingt feuilles, deux pommes de pin aux bouts
    const D = nouvelle('guirlande-feuilles'), pr = D.fixe, w = 36;
    for (let k = 0; k <= 20; k++) { const u = k / 20, x = -w / 2 + w * u, y = 6 - Math.abs(Math.sin(u * TAU)) * 4.5; pr.push(feuille(x, y, 1.5 + (k % 2), 3, MC.feuilles[k % MC.feuilles.length], { rz: (k % 3 - 1) * 0.6, rx: -0.3 })); }
    for (const sx of [-1, 1]) { pr.push(P(M.cone(2, 4.6, 7), '#7B4A2A', { x: sx * (w / 2 + 1), y: 0, z: 1.5, rz: Math.PI })); for (let k = 0; k < 3; k++) pr.push(P(M.tore(1.6 - k * 0.4, 0.45, TAU, 4, 8), '#5A3A22', { x: sx * (w / 2 + 1), y: -1 - k * 1.2, z: 1.5, rx: HP })); }
    return D;
  }
  // le toit en pyramide de la lanterne : le cône à quatre pans tourné d'un huitième de tour DANS sa géométrie (tourné par la matrice de la pièce,
  // sa boîte, calculée sur la boîte du cône, gonflait de 41 % : la lanterne, placée par le milieu de sa boîte, glissait vers la salle)
  let TOIT_LANTERNE = null;
  const toitLanterne = () => { if (!TOIT_LANTERNE) { TOIT_LANTERNE = M.cone(8.2, 5, 4).clone().rotateY(Math.PI / 4); TOIT_LANTERNE.computeBoundingBox(); TOIT_LANTERNE.userData.cache = true; } return TOIT_LANTERNE; };
  function decoLanterneAutomne() { // la lanterne d'automne : le socle et le toit de cuivre, quatre montants, la bougie qui luit derrière le verre ambré, des feuilles et deux glands au pied
    const D = nouvelle('lanterne-automne', { sx: 0.9, sy: 0.9, sz: 0.9 }), pr = D.fixe, cu = '#B87333', lp = []; // (un peu plus petite que nature : elle tient dans sa place du comptoir)
    pr.push(P(bo(12, 1.6, 12, 0.5), cu), P(bo(11, 1.2, 11, 0.4), cu, { y: 15 }), P(toitLanterne(), cu, { y: 16.2 }), P(M.tore(1.6, 0.45, TAU, 4, 8), cu, { y: 22.4 }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(M.boiteSimple(1.1, 13.6, 1.1), M.assombrir(cu, 0.2), { x: sx * 4.9, y: 1.4, z: sz * 4.9 }));
    pr.push(P(M.cylindre(2, 2, 5.6, 10), '#FFF1C9', { y: 1.6 }));
    lp.push(P(M.boiteSimple(9.2, 12.6, 9.2), '#F2B24A', { y: 1.8 }), P(M.sphere(1.1, 6), '#FFE9A0', { y: 8.6, sy: 1.7 }));
    D.vifs.push({ pr: lp, emi: '#FFB045', k: (E) => 0.35 + 0.65 * E.lampes + 0.06 * Math.sin(E.t * 9) + 0.04 * Math.sin(E.t * 23), m: null });
    for (const [k, x, z] of [[0, -7.8, 1.9], [1, -8.1, -1.7], [2, 7.9, -2.1], [3, 5.4, 3.4], [4, -4.8, 3.4]]) pr.push(feuille(x, 0.6, z, 2.6, MC.feuilles[k], { rx: -HP + 0.2, rz: k * 1.3 })); // (sur les côtés du socle, jamais plus profond que lui : la place du comptoir pose la lanterne par le milieu de sa boîte, ce qui dépasserait devant ou derrière la décalerait vers la salle)
    pr.push(P(M.sphere(1.3, 6), '#B8862F', { x: 8.6, y: 1.3, z: 1.4, sy: 1.2 }), P(M.cylindre(1.4, 1.3, 0.9, 6), '#6B4026', { x: 8.6, y: 2.5, z: 1.4 }));
    return D;
  }
  function decoEpouvantail() { // l'épouvantail : le piquet et la traverse, la chemise à carreaux, la tête de toile cousue et son sourire, le chapeau de paille, la paille
    // qui dépasse des manches, une corneille posée sur le bras ; il se balance un peu au vent
    const D = nouvelle('epouvantail'), pr = D.fixe, v = [];
    pr.push(P(M.cylindre(0.9, 1.1, 30, 6), MC.boisF), P(M.sphere(5.5, 8), '#8E6B3A', { y: 0, sy: 0.25 }));
    v.push(P(M.cylindre(0.7, 0.7, 30, 5), MC.boisF, { y: 21, rz: HP, x: 15 }), P(bo(13, 13, 7, 2), '#C8552A', { y: 12 }), P(bo(13.4, 2.2, 7.4, 0.6), '#7A3A1A', { y: 15.6 }), P(bo(13.4, 2.2, 7.4, 0.6), '#7A3A1A', { y: 19.6 }), P(bo(3, 13.4, 7.4, 0.6), '#E8B33A', { x: -2.4, y: 11.8 }));
    for (const sx of [-1, 1]) v.push(P(bo(8, 5, 5, 1.5), '#C8552A', { x: sx * 9.5, y: 18.4 }), P(M.cone(2.4, 4, 6), MC.paille, { x: sx * 14.6, y: 20.9, rz: sx * HP }));
    v.push(P(M.sphere(5, 10), '#E8D2A8', { y: 30 }), P(M.sphere(0.8, 5), L, { x: -1.8, y: 31, z: 4.5 }), P(M.sphere(0.8, 5), L, { x: 1.8, y: 31, z: 4.5 }), P(M.tore(1.8, 0.35, Math.PI, 3, 8), L, { y: 28.8, z: 4.6, rz: Math.PI }));
    v.push(P(M.cylindre(9, 9, 0.8, 14), MC.paille, { y: 33.6 }), P(M.cylindre(4.2, 5, 4.4, 12), MC.paille, { y: 34.2 }), P(M.cylindre(5.1, 5.1, 1.4, 12), MC.rouille, { y: 34.6 }));
    v.push(P(M.sphere(2.2, 8), '#2E2A30', { x: 18, y: 23.6, sx: 1.4 }), P(M.sphere(1.5, 8), '#2E2A30', { x: 20.2, y: 25.2 }), P(M.cone(0.6, 1.6, 4), '#E8A93A', { x: 21.6, y: 25, rz: -HP }));
    D.vifs.push({ pr: v, emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(Math.sin(E.t * 0.9) * 0.025); } });
    return D;
  }
  function decoTropheeAutomne() { // le trophée de la saison d'automne 2026 : le socle de noyer, sa plaque « 2026 », la coupe d'or, une grande feuille d'or dressée
    const D = nouvelle('trophee-automne-2026'), pr = D.fixe, or = '#E8B33A';
    pr.push(P(bo(15, 5, 11, 1), '#5A3A22'), P(bo(13, 1.6, 9.4, 0.5), '#6B4026', { y: 5 }), P(M.boiteSimple(10, 3.4, 0.4), '#FFE9A8', { y: 0.8, z: 5.6 }));
    let x = -3.9; for (const n of [2, 0, 2, 6]) { chiffre(pr, n, x, 1.1, 5.9, 2.6, '#6B4026'); x += 2.6; }
    pr.push(P(M.cylindre(1.4, 2.6, 3, 10), or, { y: 6.6 }), P(M.cylindre(4.6, 1.4, 6, 12), or, { y: 9.6 }), P(M.tore(4.4, 0.7, TAU, 4, 14), '#FFD45A', { y: 15.6, rx: HP }));
    for (const sx of [-1, 1]) pr.push(P(M.tore(2, 0.5, Math.PI, 4, 8), or, { x: sx * 5.4, y: 12.4, rz: sx * HP }));
    pr.push(feuille(0, 22, 0.5, 6, '#F2C14A', { rz: 0.15 }), P(M.cylindre(0.4, 0.5, 4, 4), or, { y: 15.6 }));
    return D;
  }
  // ─── le standing de la boutique (Q.standing 1 à 5, Q.objets : src/vie.js decor) : ce qui s'ajoute au décor, hors des chemins et des
  //     zones de touche — contre le mur du fond, en haut, aux deux coins du fournil, à la porte de la devanture et sur le trottoir.
  //     Tout est fusionné en un maillage (1 appel de dessin, le soir compris : la lueur des lanternes est dans le même, lueurVerre).
  //     En qualité haute (c.hdLuxe : lots HD « luxe1/3/5 » chargés), les lanternes, les colonnes, la statue et le trophée sont des
  //     modèles cuits (fournil/hd/luxe/ : KayKit Halloween et Furniture Bits, Kenney Starter Kit, CC0) ; sinon tout est fait main.
  const hdl = (c, nom, o, col) => (c.hdLuxe && typeof HDM !== 'undefined' && HDM.part ? HDM.part('luxe/' + nom, o, col) : null);
  // le verre des lanternes : une couleur à lui, que lueurVerre reconnaît dans le maillage fusionné (attribut « lueur » : 1 sur ses sommets).
  // Les finitions (lot « progression ») en ajoutent d'autres, chacune sa couleur exacte et ses deux lueurs : le soir (la bougie des lustres,
  // la lanterne de fer forgé, la teinte chaude d'uLueurTeinte) et le jour (les vitraux, les cristaux, l'onyx : leur propre couleur, qui
  // s'éteint doucement à la nuit tombée) — [couleur, soir, jour]
  const VERRE_LANTERNE = '#EADBB0';
  function lueurVerre(mesh, table) { // sa lumière (uniforms rendus) s'ajoute aux verres seuls, le reste ne change pas → (soir, jour) => void
    table = table || [[VERRE_LANTERNE, 1, 0]];
    const geo = mesh.geometry, col = geo.attributes.color.array, n = col.length / 3, l = new Float32Array(n * 2), cs = table.map(([h]) => new THREE.Color(h));
    for (let i = 0; i < n; i++) for (let j = 0; j < cs.length; j++) { const v = cs[j]; if (Math.abs(col[i * 3] - v.r) < 1e-6 && Math.abs(col[i * 3 + 1] - v.g) < 1e-6 && Math.abs(col[i * 3 + 2] - v.b) < 1e-6) { l[i * 2] = table[j][1]; l[i * 2 + 1] = table[j][2]; break; } }
    geo.setAttribute('lueur', new THREE.BufferAttribute(l, 2));
    const u = { value: 0 }, uj = { value: 0 }, teinte = { value: new THREE.Color('#FFD98A') };
    const greffer = (mat) => { // sur le matériau du moment : le Lambert propre, ou son jumeau MeshStandard (src/scene.js habiller, palier riche)
      if (mat.userData.lueur === u) return; mat.userData.lueur = u;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uLueur = u; sh.uniforms.uJour = uj; sh.uniforms.uLueurTeinte = teinte;
        sh.vertexShader = 'attribute vec2 lueur;\nvarying vec2 vLueur;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLueur = lueur;');
        sh.fragmentShader = 'uniform float uLueur;\nuniform float uJour;\nuniform vec3 uLueurTeinte;\nvarying vec2 vLueur;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uLueurTeinte * (uLueur * vLueur.x) + diffuseColor.rgb * (uJour * vLueur.y);');
      };
      mat.customProgramCacheKey = () => 'lueur-verre2|' + mat.type; mat.needsUpdate = true;
    };
    mesh.material = propre({ vertexColors: true }); greffer(mesh.material);
    return (k, jour) => { greffer(mesh.material); u.value = k; uj.value = jour || 0; };
  }
  // les couleurs exactes des verres et des pierres qui luisent, dans les finitions (une seule nuance chacune : lueurVerre les reconnaît)
  const CRISTAL = '#EAF6FF', BOUGIE = '#FFF1C9', VITRAUX = ['#4F7BD9', '#D9535E', '#F2C14E', '#6BBF7E'], ONYX_LUEUR = '#F3D29A';
  const LUEURS_FINITIONS = [[VERRE_LANTERNE, 1, 0], [BOUGIE, 1.1, 0.12], [CRISTAL, 0.55, 0.35], ...VITRAUX.map((h) => [h, 0.15, 0.55]), [ONYX_LUEUR, 0.45, 0.3]];
  const allumage = (E) => (E.lampes > 0.02 ? 0.35 + 0.65 * E.lampes : 0); // le soir : la lueur des verres (lanternes, bougies)
  const jourDe = (E) => Math.max(0.15, 1 - 0.85 * (E.lampes || 0)); // le jour : la lumière qui traverse les vitraux, l'onyx, la coupole
  // les étoiles de l'enseigne (Q.etoilesEnseigne : le rang du palier) : une étoile à cinq branches, extrudée, posée face à la rue
  const etoile5 = (r) => forme('etoile5|' + r, () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = HP + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } s.closePath(); return s; });
  const OCTA = new THREE.OctahedronGeometry(1, 0); OCTA.userData.cache = true; // une goutte de cristal : huit faces
  // un chiffre en sept segments (le « × k » d'une enseigne qui porte plus de dix étoiles) : des barrettes dorées, h de haut
  const SEGMENTS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  function chiffre(pr, n, x, y, z, h, col) {
    const w = h * 0.55, e = Math.max(0.5, h * 0.16), seg = { a: [0, h, 1], b: [w / 2, h * 0.75, 0], c: [w / 2, h * 0.25, 0], d: [0, 0, 1], e: [-w / 2, h * 0.25, 0], f: [-w / 2, h * 0.75, 0], g: [0, h / 2, 1] };
    for (const s of SEGMENTS[n] || '') { const [dx, dy, hor] = seg[s]; pr.push(P(M.boiteSimple(hor ? r2(w) : e, hor ? e : r2(h / 2), 0.6), col, { x: x + dx, y: y + dy - (hor ? e / 2 : h / 4), z })); }
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
    const fin = Q.finition || 0; if (fin) finitions(c, pr, note, { ob, or, zd, x0, x1, xc0, xc1 });
    const mm = M.maille(pr.filter(Boolean)); g.add(mm);
    if (fin) { // les finitions : leurs verres et leurs pierres luisent (le soir et le jour), en toute qualité ; la coupole, son voile de lumière
      const allumer = lueurVerre(mm, LUEURS_FINITIONS), voile = ob('coupole') ? voileCoupole(c) : null; if (voile) g.add(voile);
      g.userData.anime = (E) => { allumer(allumage(E), jourDe(E)); if (voile) { const o = 0.55 * Math.max(0, 1 - 1.1 * (E.lampes || 0)); voile.material.opacity = o; voile.visible = o > 0.01; } }; // (la nuit, le voile éteint : pas d'appel de dessin)
    } else if (lu.length && c.hdLuxe) { // la lueur des lanternes : avec les modèles cuits (haute), le soir ; dans le MÊME maillage (pas d'appel de dessin en plus)
      const allumer = lueurVerre(mm); g.userData.anime = (E) => allumer(E.lampes > 0.02 ? 0.35 + 0.65 * E.lampes : 0);
    }
    return g;
  }
  // ─── les finitions, au-delà du Palais du goût (Q.finition 1 à 7, Q.objets : src/vie.js decor ; lot « progression ») : leurs pièces dans
  //     le maillage du standing (aucun appel de dessin en plus), sauf la lumière du jour de la coupole (un voile additif : 1 appel, à la 7e).
  //     Hors des chemins et des zones de touche : l'enseigne sur les colonnes du portique, la lanterne de fer forgé au mur, à gauche de la
  //     porte du fond, les lustres au-dessus des deux bouts du comptoir, les vitraux dans le haut de la fenêtre, les poignées sur la porte.
  //     Le noyer (Q.bois), l'onyx du comptoir (comptoir), la nacre au sol et le platine aux murs (textureSol, murStanding) : dans la salle.
  //     o : ce que standing a déjà calculé (ob, l'or, la devanture zd, la porte x0 x1, les colonnes xc0 xc1) ; note : leurs emprises (tests)
  function finitions(c, pr, note, o) {
    const { LAY, Q } = c, { ob, or, zd, x0, x1, xc0, xc1 } = o, noyer = '#5A3A22', fer = '#2B2533', plomb = '#3A3440', laiton = '#D9A441';
    // 1. l'enseigne dorée : une planche de noyer posée sur les colonnes du portique, son cadre et ses lettres à la feuille d'or (des traits
    //    d'or : le nom de la boutique est sur l'écran), un médaillon étoilé au milieu ; au-dessus, les étoiles du palier (le rang k : dix au
    //    plus, puis une étoile et « × k » en chiffres d'or)
    if (ob('enseigne')) {
      const xe = (x0 + x1) / 2, ze = zd + 2, larg = r2(xc1 - xc0 + 14), y0 = 43, hE = 13, ye = y0 + hE + 3.4, k = Math.max(0, Math.floor(Q.etoilesEnseigne || 0));
      pr.push(P(bo(larg, hE, 3.4, 1.2), noyer, { x: xe, y: y0, z: ze }));
      for (const yy of [y0 + 0.5, y0 + hE - 1.7]) pr.push(P(M.boiteSimple(larg - 1.5, 1.2, 0.8), or, { x: xe, y: yy, z: ze + 1.8 }));
      for (const sx of [-1, 1]) pr.push(P(M.boiteSimple(1.2, hE - 1.4, 0.8), or, { x: xe + sx * (larg / 2 - 1.3), y: y0 + 0.7, z: ze + 1.8 }));
      let xx = xe - 7.5; for (const lw of [1.8, 2.2, 2.6, 1.6, 2.6]) { xx -= lw + 1; pr.push(P(M.boiteSimple(lw, 5.6, 0.7), or, { x: xx + lw / 2, y: y0 + 3.7, z: ze + 1.9 })); } // les lettres d'or, à gauche
      xx = xe + 7.5; for (const lw of [2.2, 2.6, 1.6, 2.6, 2.0]) { pr.push(P(M.boiteSimple(lw, 5.6, 0.7), or, { x: xx + lw / 2, y: y0 + 3.7, z: ze + 1.9 })); xx += lw + 1; } // et à droite
      pr.push(P(M.cylindre(4.8, 4.8, 1, 14), or, { x: xe, y: y0 + 6.5, z: ze + 1.6, rx: HP }), P(etoile5(3), '#FFF2C2', { x: xe, y: y0 + 6.5, z: ze + 2.9 })); // le médaillon
      if (k && k <= 10) { const pas = Math.min(7.4, (larg - 6) / k); for (let i = 0; i < k; i++) pr.push(P(etoile5(3.2), or, { x: xe + (i - (k - 1) / 2) * pas, y: ye + 0.4, z: ze })); }
      else if (k > 10) { // une étoile, « × », et le rang en chiffres d'or
        const ch = String(k), tot = 8 + 6.5 + ch.length * 6, xa = xe - tot / 2;
        pr.push(P(etoile5(3.8), or, { x: xa + 3.8, y: ye + 0.8, z: ze }));
        for (const a of [0.75, -0.75]) pr.push(P(bo(1, 5.6, 0.8, 0.2), or, { x: xa + 10.6 + Math.sin(a) * 2.8, y: ye + 0.8 - Math.cos(a) * 2.8, z: ze, rz: a })); // ×
        for (let i = 0; i < ch.length; i++) chiffre(pr, +ch[i], xa + 17.5 + i * 6, ye - 3, ze, 7.6, or);
      }
      note('enseigne', xe, ze, larg, 3.4, y0, ye + 5);
    }
    // la lanterne de fer forgé, à la porte du fond (là où entrent les clients) : une potence en volute scellée au mur, la lanterne pendue au
    // bout, son verre qui s'allume le soir (à gauche de la porte : la droite est sous les boutons ronds de l'écran)
    if (ob('lanterneFer')) {
      const p = LAY.porte, xl = p.x - 9.5, yb = Math.min(98, murY(c, p.y) - 14), zb = 12, k = 1.4; // (k : la lanterne, une fois et demie celle des colonnes)
      pr.push(P(bo(3.6, 9, 1.2, 0.5), fer, { x: xl, y: yb - 6, z: 0.6 }), P(M.boiteSimple(1.1, 1.1, zb), fer, { x: xl, y: yb, z: zb / 2 + 0.8 })); // la platine, la potence
      pr.push(P(M.tore(4.4, 0.5, Math.PI * 1.2, 3, 8), fer, { x: xl, y: yb - 3.6, z: 5.4, ry: HP, rz: 0.3 }), P(M.sphere(0.9, 6), or, { x: xl, y: yb + 1.1, z: zb + 0.7 })); // la volute, le bout doré
      pr.push(P(M.cylindre(0.35, 0.35, 2.6 * k, 4), fer, { x: xl, y: yb - 2.6 * k, z: zb }), P(M.cone(3.6 * k, 3.2 * k, 4), fer, { x: xl, y: yb - 5.8 * k, z: zb, ry: Math.PI / 4 }), P(M.sphere(0.8 * k, 6), or, { x: xl, y: yb - 2.4 * k, z: zb })); // l'anneau, le chapeau, sa boule
      pr.push(P(M.boiteSimple(r2(4.4 * k), r2(7 * k), r2(4.4 * k)), VERRE_LANTERNE, { x: xl, y: yb - 13 * k, z: zb }), P(M.boiteSimple(r2(5.4 * k), 1.4, r2(5.4 * k)), fer, { x: xl, y: yb - 14.2 * k, z: zb })); // le verre, le fond
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.push(P(M.boiteSimple(0.7, r2(7.6 * k), 0.7), fer, { x: xl + sx * 2.4 * k, y: yb - 13.3 * k, z: zb + sz * 2.4 * k }));
      pr.push(P(M.cone(1.1, 3, 4), fer, { x: xl, y: yb - 14.2 * k, z: zb, rx: Math.PI })); // la pointe du bas
      note('lanterneFer', xl, zb / 2 + 1, 8.5 * k, zb + 4 * k, yb - 14.2 * k - 3, yb + 2);
    }
    // les poignées de laiton (2) : une barre de tirage et une plaque de propreté sur la porte du fond (la porte est au noyer : Q.bois)
    if (Q.laiton) {
      const p = LAY.porte, cx = p.x + p.w / 2, w = p.w - 3, yh = murY(c, p.y + p.h * 0.7);
      pr.push(P(bo(1.6, 13, 1.4, 0.5), laiton, { x: cx + w / 2 - 7, y: yh - 6.5, z: 0.6 }), P(bo(w - 8, 6, 0.8, 0.3), laiton, { x: cx, y: 1.2, z: -1.1 }));
    }
    // 4. les lustres de cristal, au-dessus des deux bouts du comptoir : la chaîne qui monte sous l'enseigne de l'écran (une rosace pour plafond),
    //    le fût, deux couronnes d'or, six bougies qui s'allument le soir, une goutte de cristal sous chaque bras et une grosse au milieu
    if (ob('lustres')) {
      const dc = dimsComptoir(c), zl = dc.zAv - dc.D / 2, yl = dc.H + 46;
      for (const xl of [dc.C.x + 15, dc.C.x + dc.C.w - 15]) {
        pr.push(P(M.cylindre(0.4, 0.4, 72, 4), or, { x: xl, y: yl + 20, z: zl }), P(M.cylindre(4, 4, 1, 10), or, { x: xl, y: yl + 92, z: zl })); // la chaîne, la rosace
        pr.push(P(M.cylindre(1.2, 1.9, 20, 6), or, { x: xl, y: yl - 1, z: zl }), P(M.tore(12, 0.85, TAU, 3, 16), or, { x: xl, y: yl + 4, z: zl, rx: HP }), P(M.tore(6, 0.6, TAU, 3, 12), or, { x: xl, y: yl + 14, z: zl, rx: HP }));
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + 0.3, ca = Math.cos(a), sa = Math.sin(a), dx = ca * 12, dz = sa * 12;
          pr.push(P(M.boiteSimple(1, 1, 11), or, { x: xl + ca * 6, y: yl + 3.6, z: zl + sa * 6, ry: -a + HP })); // le bras
          pr.push(P(M.cylindre(1.5, 1, 1.4, 6), or, { x: xl + dx, y: yl + 4.6, z: zl + dz }), P(M.cylindre(0.85, 0.85, 3.4, 5), '#FFFFFF', { x: xl + dx, y: yl + 6, z: zl + dz }), P(OCTA, BOUGIE, { x: xl + dx, y: yl + 11, z: zl + dz, sx: 1.25, sy: 2, sz: 1.25 }));
          pr.push(P(OCTA, CRISTAL, { x: xl + dx * 1.03, y: yl + 1.2, z: zl + dz * 1.03, sx: 1.2, sy: 2.4, sz: 1.2 }), P(OCTA, CRISTAL, { x: xl + ca * 6.2, y: yl + 11.2, z: zl + sa * 6.2, sx: 0.8, sy: 1.6, sz: 0.8 }));
        }
        pr.push(P(OCTA, CRISTAL, { x: xl, y: yl - 4.6, z: zl, sx: 3, sy: 4.6, sz: 3 }));
        note('lustre', xl, zl, 27, 27, yl - 9.2, yl + 20);
      }
    }
    // 5. les vitraux : dans le haut de la fenêtre, un bandeau de verres de couleur sertis de plomb (bleu de nuit, liseré rouge), trois épis
    //    de blé dorés et leurs feuilles ; ils luisent le jour, la lumière passe (entre les croisillons et la vitre)
    if (ob('vitraux')) {
      const f = LAY.fenetre, yT = murY(c, f.y), yB = murY(c, f.y + f.h * 0.38), hb = yT - yB, xc = f.x + f.w / 2, zv = -2;
      pr.push(P(M.boiteSimple(r2(f.w), r2(hb), 0.5), VITRAUX[0], { x: xc, y: yB, z: zv }));
      for (const yy of [yB, yT - 2.4]) pr.push(P(M.boiteSimple(r2(f.w), 2.4, 0.6), VITRAUX[1], { x: xc, y: yy, z: zv + 0.1 }));
      for (const yy of [yB + 2.4, yT - 2.4]) pr.push(P(M.boiteSimple(r2(f.w), 0.6, 0.7), plomb, { x: xc, y: yy - 0.3, z: zv + 0.2 }));
      for (const u of [1 / 3, 2 / 3]) pr.push(P(M.boiteSimple(0.6, r2(hb), 0.7), plomb, { x: f.x + f.w * u, y: yB, z: zv + 0.2 }));
      for (const u of [1 / 6, 0.5, 5 / 6]) { // un épi : la tige, six grains en chevrons, deux feuilles
        const xe = f.x + f.w * u, y0 = yB + 3, h = hb - 7;
        pr.push(P(M.boiteSimple(0.7, r2(h), 0.6), VITRAUX[2], { x: xe, y: y0, z: zv + 0.35 }));
        for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) pr.push(P(OCTA, VITRAUX[2], { x: xe + sx * 1.3, y: y0 + h * (0.55 + i * 0.15), z: zv + 0.4, sx: 1.1, sy: 2.1, sz: 0.4, rz: -sx * 0.5 }));
        for (const sx of [-1, 1]) pr.push(P(OCTA, VITRAUX[3], { x: xe + sx * 2.2, y: y0 + h * 0.25, z: zv + 0.4, sx: 0.9, sy: 3, sz: 0.4, rz: -sx * 0.7 }));
      }
      note('vitraux', xc, zv, f.w, 1, yB, yT);
    }
  }
  // 7. la coupole de verre : la lumière du jour qui tombe sur le comptoir (trois rais), et la rosace qu'elle dessine au sol devant lui (douze
  //    pétales de lumière) ; un voile additif à lui (couleurs de sommets : le noir n'ajoute rien), qui s'éteint la nuit (anime : son opacité)
  function voileCoupole(c) {
    const { LAY } = c, dc = dimsComptoir(c), xc = dc.C.x + dc.C.w / 2, zl = dc.zAv - dc.D / 2, pos = [], col = [], chaud = [1, 0.86, 0.55], rien = [0, 0, 0];
    const tri = (a, ca, b, cb, d, cd) => { pos.push(...a, ...b, ...d); col.push(...ca, ...cb, ...cd); };
    const quad = (a, ca, b, cb, d, cd, e, ce) => { tri(a, ca, b, cb, d, cd); tri(a, ca, d, cd, e, ce); };
    for (const [dx, w, k] of [[-34, 16, 0.3], [2, 22, 0.42], [36, 14, 0.26]]) { // trois rais, du haut de l'écran jusqu'au dessus du comptoir
      const x = xc + dx, yb = dc.H + 0.5, yh = 260, cb = chaud.map((v) => v * k);
      quad([x - w / 2, yb, zl], cb, [x + w / 2, yb, zl], cb, [x + w / 2 + 10, yh, zl - 30], rien, [x - w / 2 + 10, yh, zl - 30], rien);
    }
    const xr = LAY.W * 0.52, zr = c.wz(LAY.T * 0.765), R = Math.min(LAY.W * 0.2, 62), n = 24; // la rosace au sol, sur le tapis d'entrée (src/meubles.js standing : mêmes mesures)
    for (let i = 0; i < n; i++) {
      const a0 = i * TAU / n, a1 = (i + 1) * TAU / n, k = i % 2 ? 0.07 : 0.2, cc = chaud.map((v) => v * k);
      tri([xr, 0.9, zr], cc, [xr + Math.cos(a1) * R, 0.9, zr + Math.sin(a1) * R * 0.62], rien, [xr + Math.cos(a0) * R, 0.9, zr + Math.sin(a0) * R * 0.62], rien);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.castShadow = false; m.receiveShadow = false; m.userData.nom = 'coupole'; m.userData.sansRiche = true; return m;
  }
  // ─── les chantiers du quartier (lot « progression » : PROGRESSION.PROJETS, src/vie.js projetsDehors) : dehors, sur la place de l'autre côté
  //     de la rue (le bas de l'écran, sous le bord du trottoir : on la voit tiroir fermé, jamais sous un meuble ni sur la terrasse), quatre au
  //     plus — les quatre derniers finis, de gauche à droite. Un maillage pour tout (le pavé de la place, sa bordure, les monuments ; le verre
  //     des réverbères s'allume le soir, lueurVerre) : 1 appel de dessin. Chacun bâti à l'origine (le sol en y = 0, face à la rue : +Z), 200 à
  //     700 triangles ; tour > 0 : la variante rénovée (dorée, de marbre, de cristal) prend sa teinte pour la pierre ou les toits.
  const TEINTES_PROJET = ['#FFC84A', '#ECE6DE', '#BFE6FF'];
  const teinteProjet = (tour) => (tour > 0 ? TEINTES_PROJET[Math.min(TEINTES_PROJET.length, tour) - 1] : null);
  const PROJETS3D = {
    fontaine: (t) => { // la fontaine : le grand bassin et son eau, la vasque haute, le jet, les filets d'eau qui retombent
      const pierre = t || '#D9CFC4', eau = '#7CC8F0', jet = '#D6F1FF', pr = [];
      pr.push(P(M.cylindre(17, 18, 5, 16), pierre), P(M.cylindre(15.2, 15.2, 0.6, 16), eau, { y: 4.2 }), P(M.tore(16.2, 1.3, TAU, 4, 16), M.eclaircir(pierre, 0.25), { y: 5, rx: HP }));
      pr.push(P(M.cylindre(2.6, 3.4, 12, 8), pierre, { y: 4.6 }), P(M.cylindre(8, 6, 2.4, 12), pierre, { y: 15 }), P(M.cylindre(6.6, 6.6, 0.5, 12), eau, { y: 17.1 }), P(M.cylindre(1.3, 1.7, 4, 6), pierre, { y: 17.2 }), P(M.cone(1, 7, 6), jet, { y: 21 }));
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.25; pr.push(P(M.cylindre(0.45, 0.6, 11.5, 4), jet, { x: Math.cos(a) * 8.6, y: 5.4, z: Math.sin(a) * 8.6, rx: -Math.sin(a) * 0.18, rz: Math.cos(a) * 0.18 })); }
      return pr;
    },
    kiosque: (t) => { // le kiosque à musique : le socle octogonal, huit colonnettes et leur balustrade, le toit en pavillon, son lambrequin, l'épi doré
      const toit = t || '#FF9FB2', socle = t ? M.eclaircir(t, 0.45) : '#E8DCC8', fer = '#2F4A3A', pr = [], o8 = Math.PI / 8;
      pr.push(P(M.cylindre(19, 20, 4, 8), socle, { ry: o8 }), P(M.cylindre(19.4, 19.4, 0.8, 8), M.assombrir(socle, 0.12), { y: 4, ry: o8 }), P(M.boiteSimple(8, 2, 6), M.assombrir(socle, 0.06), { y: 0, z: 19 }));
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + o8; pr.push(P(M.cylindre(0.75, 0.75, 19, 5), fer, { x: Math.cos(a) * 16.5, y: 4.8, z: Math.sin(a) * 16.5 })); }
      pr.push(P(M.tore(16.5, 0.45, TAU, 3, 8), fer, { y: 9.5, rx: HP, rz: o8 }));
      pr.push(P(M.cylindre(18, 18, 1.6, 8), M.assombrir(toit, 0.1), { y: 23.6, ry: o8 }), P(M.cone(21, 11, 8), toit, { y: 25, ry: o8 }), P(M.cylindre(0.5, 0.5, 4, 4), fer, { y: 35.5 }), P(M.sphere(1.6, 8), '#FFC84A', { y: 40.5 }));
      for (let i = 0; i < 16; i++) { const a = (i + 0.5) * TAU / 16; pr.push(P(OCTA, i % 2 ? '#FFFFFF' : toit, { x: Math.cos(a) * 18.6, y: 23, z: Math.sin(a) * 18.6, sx: 2.2, sy: 1.6, sz: 2.2 })); } // le lambrequin festonné
      return pr;
    },
    marche: (t) => { // le marché couvert : une halle de fer et de verre (deux pans, le faîtage), six piliers, trois étals de fruits et de légumes
      const verre = t || '#A8D8FF', fer = '#3A4A5A', pr = [], lx = 26, lz = 13, haut = 18, faite = 27, pente = Math.atan2(faite - haut, lz + 2), pan = Math.hypot(faite - haut, lz + 2);
      pr.push(P(M.boiteSimple(lx * 2 + 6, 1.2, lz * 2 + 6), '#CFC4B4'));
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) pr.push(P(M.cylindre(0.9, 1.2, haut, 6), fer, { x: sx * lx, y: 1.2, z: sz * lz }));
      for (const sz of [-1, 1]) pr.push(P(M.boiteSimple(lx * 2 + 8, 0.8, r2(pan)), verre, { y: (haut + faite) / 2 + 0.6, z: sz * (lz + 2) / 2, rx: sz * pente }), P(M.boiteSimple(lx * 2 + 8, 0.9, 0.9), fer, { y: haut + 0.6, z: sz * (lz + 2) }));
      pr.push(P(M.boiteSimple(lx * 2 + 9, 1.2, 1.4), fer, { y: faite + 0.5 }));
      for (const [x, col] of [[-16, '#E1496C'], [0, '#FFC84A'], [16, '#5FD3A4']]) { // les étals : le tréteau, la caisse, les fruits
        pr.push(P(M.boiteSimple(12, 6, 6), '#C8864F', { x, y: 1.2, z: 2 }), P(M.boiteSimple(11, 2.2, 5.4), M.assombrir('#C8864F', 0.2), { x, y: 7.2, z: 2 }));
        for (let i = 0; i < 4; i++) pr.push(P(OCTA, col, { x: x - 4 + i * 2.7, y: 10, z: 2 + (i % 2 ? 1 : -1), s: 1.6 }));
      }
      return pr;
    },
    reverberes: (t) => { // les réverbères : trois lampadaires de fonte, leur lanterne de verre qui s'allume le soir
      const fer = t || '#2F4A3A', pr = [];
      for (const x of [-22, 0, 22]) {
        pr.push(P(M.cylindre(2.4, 3, 2.5, 8), fer, { x }), P(M.cylindre(0.8, 1.1, 30, 6), fer, { x, y: 2.5 }), P(M.cylindre(2.2, 1.2, 2, 6), fer, { x, y: 32.4 }));
        pr.push(P(M.cylindre(3, 2.2, 6.5, 6), VERRE_LANTERNE, { x, y: 34.4 }), P(M.cone(3.9, 3.6, 6), fer, { x, y: 40.9 }), P(M.sphere(0.9, 6), '#FFC84A', { x, y: 45 }));
      }
      return pr;
    },
    jardin: (t) => { // le jardin public : la pelouse, deux tilleuls, un banc, le bac à sable
      const feuille = t || '#5FBE73', clair = t ? M.eclaircir(t, 0.25) : '#86D98E', pr = [];
      pr.push(P(M.cylindre(25, 25, 0.8, 16), '#9BD88E', { sz: 0.62 }));
      for (const [x, z, h] of [[-15, -3, 26], [14, -5, 30]]) pr.push(P(M.cylindre(1.4, 1.9, h * 0.5, 6), '#8B5A3C', { x, z }), P(M.sphere(9, 8), feuille, { x, y: h * 0.62, z }), P(M.sphere(6.4, 7), clair, { x: x + 3, y: h * 0.82, z: z + 2 }));
      pr.push(P(M.boiteSimple(15, 1.2, 4.6), '#C8864F', { x: -4, y: 3.6, z: 8 }), P(M.boiteSimple(15, 4.4, 1), '#C8864F', { x: -4, y: 4.8, z: 5.8 }));
      for (const sx of [-1, 1]) pr.push(P(M.boiteSimple(1.2, 3.6, 4), '#3A3440', { x: -4 + sx * 6, z: 8 }));
      pr.push(P(M.boiteSimple(12, 2, 10), '#D9CFC4', { x: 15, z: 8 }), P(M.boiteSimple(10.4, 2.3, 8.4), '#F2DFB5', { x: 15, z: 8 }), P(OCTA, '#E1496C', { x: 13, y: 3.2, z: 9, s: 1.2 }));
      return pr;
    },
    horloge: (t) => { // l'horloge de la place : un pilier de pierre, quatre cadrans et leurs aiguilles, un toit d'ardoise et son épi
      const pierre = t || '#D9CFC4', toit = t || '#7FA0E0', pr = [];
      pr.push(P(M.boiteSimple(12, 3, 12), M.assombrir(pierre, 0.1)), P(M.boiteSimple(8, 34, 8), pierre, { y: 3 }), P(M.boiteSimple(11, 11, 11), pierre, { y: 37 }), P(M.boiteSimple(12, 1.2, 12), M.assombrir(pierre, 0.1), { y: 48 }));
      pr.push(P(M.cylindre(4.2, 4.2, 0.6, 16), '#FFFFFF', { y: 42.5, z: 5.5, rx: HP }), P(M.tore(4.3, 0.45, TAU, 3, 16), '#FFC84A', { y: 42.5, z: 6.1 }));
      for (const sx of [-1, 1]) pr.push(P(M.cylindre(4.2, 4.2, 0.6, 16), '#FFFFFF', { x: sx * 5.5, y: 42.5, rz: HP }));
      pr.push(P(M.boiteSimple(0.6, 3, 0.4), L, { y: 42.5, z: 6.4, rz: 0.5 }), P(M.boiteSimple(0.5, 3.8, 0.4), L, { y: 42.5, z: 6.5, rz: -2 })); // les aiguilles (la fournée de dix heures dix)
      pr.push(P(M.cone(8.6, 8, 4), toit, { y: 49.2, ry: Math.PI / 4 }), P(M.cylindre(0.4, 0.4, 3, 4), '#3A3440', { y: 57 }), P(M.sphere(1.1, 6), '#FFC84A', { y: 60.5 }));
      return pr;
    },
    manege: (t) => { // le manège : le plancher, le mât, le chapiteau rayé et sa frise, quatre chevaux de bois sur leurs barres dorées
      const toit = t || '#FF9FB2', or = '#FFC84A', pr = [];
      pr.push(P(M.cylindre(19, 20, 3, 14), '#E8DCC8'), P(M.cylindre(19.6, 19.6, 0.8, 14), or, { y: 3 }), P(M.cylindre(2, 2, 26, 8), '#FFF2C2', { y: 3 }));
      pr.push(P(M.cylindre(21, 21, 2.6, 12), '#FFFFFF', { y: 26 }), P(M.cone(22, 10, 12), toit, { y: 28.6 }), P(M.sphere(1.8, 8), or, { y: 39.5 }));
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; pr.push(P(M.boiteSimple(1.6, 0.6, 21), '#FFFFFF', { x: Math.sin(a) * 10, y: 28.6 + 5.2, z: Math.cos(a) * 10, ry: a, rx: -0.43 })); } // les rayures du chapiteau
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + 0.6, x = Math.cos(a) * 13.5, z = Math.sin(a) * 13.5, col = ['#FFFFFF', '#FFD98A', '#C7B8FF', '#8FE3C2'][i], tx = -Math.sin(a), tz = Math.cos(a);
        pr.push(P(M.cylindre(0.4, 0.4, 23, 4), or, { x, y: 3, z }), P(M.capsule(2.3, 5.4, 6), col, { x, y: 11 + (i % 2) * 2, z, rz: HP, ry: HP - a }), P(M.capsule(1.3, 3, 6), col, { x: x + tx * 4.6, y: 14.5 + (i % 2) * 2, z: z + tz * 4.6, rx: 0.5 * tz, rz: -0.5 * tx }));
      }
      return pr;
    },
    statue: (t) => { // la statue du Boulanger inconnu : le socle et sa plaque d'or, le boulanger en bronze, sa toque, la baguette levée
      const pierre = t ? M.eclaircir(t, 0.3) : '#D9CFC4', bronze = t || '#B07A3A', b2 = t ? M.assombrir(t, 0.2) : '#8C5A2A', pr = [];
      pr.push(P(M.boiteSimple(18, 3, 18), M.assombrir(pierre, 0.08)), P(M.boiteSimple(13, 16, 13), pierre, { y: 3 }), P(M.boiteSimple(15, 2, 15), M.assombrir(pierre, 0.08), { y: 19 }), P(M.boiteSimple(8, 2, 0.6), '#FFC84A', { y: 10, z: 6.6 }));
      pr.push(P(M.cylindre(4.2, 5.6, 15, 8), bronze, { y: 21 }), P(M.sphere(3.8, 8), bronze, { y: 39 }), P(M.cylindre(3.4, 3.2, 3, 8), b2, { y: 41.6 }), P(M.sphere(4, 8), b2, { y: 46, sy: 0.75 }));
      pr.push(P(M.cylindre(1.2, 1.2, 10, 6), bronze, { x: 3.2, y: 31, rz: -0.9 }), P(M.cylindre(1.1, 1.1, 18, 6), '#C8864F', { x: 10.5, y: 33, rz: -0.25 })); // le bras, la baguette levée
      return pr;
    },
  };
  const PLACES_DEHORS = [[0.5], [0.3, 0.7], [0.18, 0.5, 0.82], [0.13, 0.38, 0.62, 0.87]]; // les places des monuments, selon leur nombre (en part de la largeur)
  const PLACES_COMPACT = [[0.4], [0.3, 0.9], [0.15, 0.45, 0.9], [0.1, 0.3, 0.5, 0.9]]; // (au bord du trottoir : à l'écart de la porte et de son tapis, vers 0,70)
  function dehors(liste, c) { // liste : [{ id, tour }] (src/vie.js projetsDehors : quatre au plus) → un groupe ; userData.emprises : leurs boîtes monde (tests)
    const { LAY, W, H } = c, g = grp('dehors'), tr = LAY.trottoir, l = (Array.isArray(liste) ? liste : []).filter((x) => x && PROJETS3D[x.id]).slice(-4);
    // la place tient entre le bord du trottoir et le tiroir fermé (H − 37 : test/fournil-meubles.cjs) : la rue en haut (un tiers), puis la bordure,
    // les monuments au milieu de la bande qui reste. Un petit écran n'a pas cette bande (moins de 44 px : 360 × 640 et 375 × 667 en ont 11,
    // 360 × 740 43) : les monuments, plus petits, se posent alors au bord du trottoir (compact), le pied au ras du tiroir fermé, la tête sous le
    // passage des clients (LAY.trottoir.rue : la terrasse et ses tables restent dégagées) ; plus petits que 0,3, rien
    const vis = H - 37, emp = g.userData.emprises = []; if (!l.length || !tr) return g;
    const SY = c.SY || 0.79, CY = c.CY || 0.62, compact = vis - tr.bord < 44, xs = (compact ? PLACES_COMPACT : PLACES_DEHORS)[l.length - 1], _b = new THREE.Box3(), bx = new THREE.Box3(), pr = [];
    const largeur = (W / Math.max(3, l.length) - 8) / 58;
    const poser = (parts, m, out) => { _b.makeEmpty(); for (const p of parts) { const pp = PARTIE(p, m); if (!pp.geo.boundingBox) pp.geo.computeBoundingBox(); bx.copy(pp.geo.boundingBox).applyMatrix4(pp.m); _b.union(bx); if (out) out.push(pp); } return _b; };
    let s, zp, place;
    if (!compact) {
      const yPlace = tr.bord + Math.max(14, (vis - tr.bord) * 0.3), bande = vis - yPlace, z0 = c.wz(yPlace), z1 = c.wz(H + 40), pave = '#D8CBB8';
      zp = c.wz(yPlace + bande * 0.52); place = { y: yPlace, z0, z1 };
      pr.push(P(M.boiteSimple(W + 4, 0.4, r2(z1 - z0)), pave, { x: W / 2, y: 0.25, z: (z0 + z1) / 2 }), P(M.boiteSimple(W + 4, 1.2, 3), '#F4F1EA', { x: W / 2, y: 0.25, z: z0 + 1.5 }), P(M.boiteSimple(W + 4, 0.2, 1.2), '#B8AC9A', { x: W / 2, y: 0.65, z: z0 + 4.2 })); // le pavé de la place, sa bordure, le caniveau
      for (let k = 1; k * 11 < z1 - z0 - 6; k++) pr.push(P(M.boiteSimple(W + 4, 0.15, 0.6), M.assombrir(pave, 0.08), { x: W / 2, y: 0.66, z: z0 + 5 + k * 11 })); // les joints
      s = Math.max(0.5, Math.min(0.92, largeur, bande * 0.42 / (21 * SY))); // (21 : le plus grand rayon, le kiosque et le manège)
    } else {
      // l'emprise à l'écran de chaque monument à l'échelle 1, autour du centre de son pied : devant (avant, sa profondeur vers l'écran) et
      // au-dessus (haut : sa hauteur et son arrière) ; l'échelle qui tient tout entre la rue des clients et le tiroir fermé, le pied aligné
      let avant = 0, haut = 0; const I = new THREE.Matrix4();
      for (const x of l) { const b = poser(PROJETS3D[x.id](teinteProjet(x.tour)), I); avant = Math.max(avant, b.max.z * SY); haut = Math.max(haut, b.max.y * CY - b.min.z * SY); }
      // (la tête peut mordre de 8 px sur la rue des clients, qui passent derrière, jamais sur les tables de la terrasse)
      const ter = (LAY.mobiles || []).filter((m) => m.type === 'terrasse' && m.r).reduce((a, m) => Math.max(a, m.r.y + m.r.h), -Infinity);
      const bas = vis - 1, lim = Math.max(tr.rue - 8, ter + 2); s = Math.min(0.92, largeur, (bas - lim) / Math.max(1, avant + haut));
      if (!(s >= 0.3)) return g;
      zp = c.wz(bas - s * avant); place = { y: lim, z0: c.wz(lim), z1: c.wz(bas), compact: true };
    }
    l.forEach((x, i) => {
      const b = poser(PROJETS3D[x.id](teinteProjet(x.tour)), new THREE.Matrix4().makeScale(s, s, s).setPosition(W * xs[i], 0, zp), pr);
      emp.push({ nom: x.id, tour: x.tour, x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
    });
    const mm = M.maille(pr, { recoit: true }); mm.userData.nom = 'place'; g.add(mm);
    const allumer = lueurVerre(mm); g.userData.anime = (E) => allumer(allumage(E));
    g.userData.place = Object.assign(place, { s }); return g;
  }
  // ─── « Mes décos » : les petits décors et les décos en PARTIES TYPÉES, fusionnés par src/scene.js en deux maillages ───
  // Une déco (nouvelle) : { id, base (sa place bâtie : la position, l'échelle d'un groupe), fixe: [P…] (couleurs de sommets, immobiles),
  //   tex: [{ w, h, o, zone, k }] (des plans peints pris dans l'atlas : zone 'toile' | 'portrait' | 'tag' | 'araignee' ; k : leur éclat,
  //   la lueur qu'ils avaient avant), vifs: [{ pr: [P…], emi: '#hex' | null, k: nombre | (E) => nombre, m: (E, m4) => void | null }]
  //   (les parties lumineuses ou animées : chacune sa matrice et son intensité, posées à chaque image dans le maillage des lueurs) }.
  // La fusion (fusion) fait des décos posées et des petits décors fixes DEUX maillages : « petits » (un matériau partagé, couleurs de
  // sommets et l'atlas des toiles peintes, découpées en alphaTest) et « lueurs » (les parties lumineuses ET animées : une greffe de
  // shader les pose une à une, uVifs[i] = matrice et intensité ; aiguilles, queue du chien, bulles, flamme, néon…). Deux appels de
  // dessin pour tout, en haute comme en éco (le contrat en permettait trois : « animés » rejoint « lueurs », la même greffe sert aux deux).
  const nouvelle = (id, o) => ({ id, base: M.matrice(o || {}), fixe: [], tex: [], vifs: [] });
  // l'atlas des toiles peintes (256 × 256) : un blanc pour tout ce qui n'a que sa couleur, le tableau, le portrait, le tag, la toile d'araignée
  const ATLAS = { blanc: [0, 0, 4, 4], toile: [8, 0, 64, 48], portrait: [80, 0, 80, 100], tag: [0, 128, 128, 64], araignee: [128, 128, 128, 128] };
  function atlas() {
    let tx = TEX.get('atlas'); if (tx) return tx;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 6, 6);
    for (const [z, f] of [['toile', toile], ['portrait', portrait], ['tag', toileTag], ['araignee', toileAraignee]]) { const [a, b, w, h] = ATLAS[z]; x.drawImage(f().userData.canvas, a, b, w, h); }
    tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; tx.userData.partagee = true; tx.userData.canvas = cv; // (sans mipmaps : les zones ne bavent pas l'une sur l'autre)
    TEX.set('atlas', tx); return tx;
  }
  const uvDe = (zone, u, v) => { const [a, b, w, h] = ATLAS[zone]; return [(a + u * w) / 256, 1 - (b + (1 - v) * h) / 256]; };
  const matPetits = () => matDe('petits', () => propre({ vertexColors: true, map: atlas(), alphaTest: 0.5 }));
  const ombrePetits = () => matDe('petits-ombre', () => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas(), alphaTest: 0.5 }));
  // les géométries non indexées, mêmes attributs, mises bout à bout
  function bout(geos) {
    const out = new THREE.BufferGeometry(); if (!geos.length) return out;
    for (const [nom, a0] of Object.entries(geos[0].attributes)) {
      const n = a0.itemSize, arr = new Float32Array(geos.reduce((k, g) => k + g.attributes[nom].count * n, 0)); let o = 0;
      for (const g of geos) { arr.set(g.attributes[nom].array, o); o += g.attributes[nom].count * n; }
      out.setAttribute(nom, new THREE.BufferAttribute(arr, n));
    }
    return out;
  }
  const PARTIE = (p, m) => ({ geo: p.geo, col: p.col, vc: p.vc, m: p.m ? m.clone().multiply(p.m) : m }); // une pièce, sa matrice précédée de m
  // les pièces fixes et les toiles d'une déco, placées par m (= place × base) : une géométrie position, normale, couleur, uv
  function geoFixe(d, m, gelees) {
    const out = [], pr = d.fixe.filter(Boolean).map((p) => PARTIE(p, m)).concat(gelees || []);
    if (pr.length) { const g = M.assembler(pr), n = g.attributes.position.count, uv = new Float32Array(n * 2), [u, v] = uvDe('blanc', 0.5, 0.5); for (let i = 0; i < n; i++) { uv[i * 2] = u; uv[i * 2 + 1] = v; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.push(g); }
    for (const t of d.tex) {
      const g = new THREE.PlaneGeometry(t.w, t.h).toNonIndexed(); g.applyMatrix4(m.clone().multiply(M.matrice(t.o)));
      const n = g.attributes.position.count, uv = g.attributes.uv.array, col = new Float32Array(n * 3).fill(t.k || 1);
      for (let i = 0; i < n; i++) { const [a, b] = uvDe(t.zone, uv[i * 2], uv[i * 2 + 1]); uv[i * 2] = a; uv[i * 2 + 1] = b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.push(g);
    }
    return out;
  }
  // la boîte monde d'une déco placée par m (ses parties vives au repos)
  const _bx = new THREE.Box3(), _m4 = new THREE.Matrix4(), REPOS = { t: 0, lampes: 0, d: null };
  function boiteDe(d, m) {
    const b = new THREE.Box3(), aj = (geo, mm) => { if (!geo.boundingBox) geo.computeBoundingBox(); _bx.copy(geo.boundingBox).applyMatrix4(mm); b.union(_bx); };
    for (const p of d.fixe) if (p) aj(p.geo, p.m ? m.clone().multiply(p.m) : m);
    for (const t of d.tex) { const mm = m.clone().multiply(M.matrice(t.o)); _bx.min.set(-t.w / 2, -t.h / 2, 0); _bx.max.set(t.w / 2, t.h / 2, 0); _bx.applyMatrix4(mm); b.union(_bx); }
    for (const v of d.vifs) { const mv = v.m ? (v.m(REPOS, _m4), m.clone().multiply(_m4)) : m; for (const p of v.pr) if (p) aj(p.geo, p.m ? mv.clone().multiply(p.m) : mv); }
    return b;
  }
  // la greffe du maillage des lueurs : chaque sommet porte sa partie (part) et sa lueur (emi) ; uVifs[part] le pose et règle son éclat
  // (l'élément [3] de la matrice, la 1re colonne de la 4e ligne, toujours nul pour une matrice affine, porte l'intensité). Posée sur le
  // matériau du moment : le Lambert, ou son jumeau MeshStandard du rendu riche (src/scene.js habiller), à chaque image
  const MAX_VIFS = 20;
  function greffer(mat, U) {
    if (mat.userData.vifs === U) return; mat.userData.vifs = U;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uVifs = U;
      sh.vertexShader = `attribute float part;\nattribute vec3 emi;\nuniform mat4 uVifs[${MAX_VIFS}];\nvarying vec3 vEmi;\n` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tmat4 mVif = uVifs[int(part + 0.5)]; float kVif = mVif[0][3]; mVif[0][3] = 0.0; objectNormal = normalize(mat3(mVif) * objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = (mVif * vec4(transformed, 1.0)).xyz; vEmi = emi * kVif;');
      sh.fragmentShader = 'varying vec3 vEmi;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vEmi;');
    };
    mat.customProgramCacheKey = () => 'vifs|' + MAX_VIFS + '|' + mat.type; mat.needsUpdate = true;
  }
  // fusion(liste) : liste = [{ d (une déco en parties), place (Matrix4 ; null : là où elle est bâtie) }] →
  //   { petits: Mesh | null, lueurs: Mesh | null, anime(E), boites: { id: Box3 }, parts: le nombre de parties vives, tri: les triangles }
  const _c3 = new THREE.Color();
  function fusion(liste) {
    const gf = [], gv = [], slots = [], boites = {}, gelees = [];
    for (const { d, place } of liste) {
      const m = place ? place.clone().multiply(d.base) : d.base.clone(); boites[d.id] = boiteDe(d, m);
      const gel = [];
      for (const v of d.vifs) {
        if (slots.length >= MAX_VIFS) { const mv = v.m ? (v.m(REPOS, _m4), m.clone().multiply(_m4)) : m; for (const p of v.pr) if (p) gel.push(PARTIE(p, mv)); continue; } // (plus de place : figée avec les petits)
        const i = slots.length, g = M.assembler(v.pr.filter(Boolean)), n = g.attributes.position.count, part = new Float32Array(n).fill(i), emi = new Float32Array(n * 3);
        if (v.emi) { _c3.set(v.emi); for (let k = 0; k < n; k++) emi.set([_c3.r, _c3.g, _c3.b], k * 3); }
        g.setAttribute('part', new THREE.BufferAttribute(part, 1)); g.setAttribute('emi', new THREE.BufferAttribute(emi, 3)); gv.push(g);
        slots.push({ m: v.m, k: v.k, PB: m });
      }
      gf.push(...geoFixe(d, m, gel));
    }
    let petits = null, lueurs = null, tri = 0;
    if (gf.length) { const g = bout(gf); tri += g.attributes.position.count / 3; petits = new THREE.Mesh(g, matPetits()); petits.castShadow = true; petits.receiveShadow = true; petits.customDepthMaterial = ombrePetits(); petits.userData.nom = 'petits'; }
    const U = { value: Array.from({ length: MAX_VIFS }, () => new THREE.Matrix4().makeScale(0, 0, 0)) }, a = new THREE.Matrix4();
    const anime = (E) => { for (let i = 0; i < slots.length; i++) { const s = slots[i], u = U.value[i]; if (s.m) { s.m(E, a); u.multiplyMatrices(s.PB, a); } else u.copy(s.PB); u.elements[3] = typeof s.k === 'function' ? s.k(E) : s.k || 0; } if (lueurs) greffer(lueurs.material, U); };
    if (gv.length) {
      const g = bout(gv); tri += g.attributes.position.count / 3; lueurs = new THREE.Mesh(g, propre({ vertexColors: true })); lueurs.castShadow = false; lueurs.frustumCulled = false; lueurs.userData.nom = 'lueurs'; // (ses sommets sont dans le repère de leur partie : la boîte du maillage ne veut rien dire)
      greffer(lueurs.material, U); anime(REPOS);
    }
    return { petits, lueurs, anime, boites, parts: slots.length, tri };
  }
  // un petit décor seul, en groupe (l'atelier, MEUBLES.tout) : ses deux maillages, animés
  function enGroupe(nom, d, c) { const f = fusion([{ d, place: null }]), g = grp(nom); if (f.petits) g.add(f.petits); if (f.lueurs) { g.add(f.lueurs); g.userData.anime = f.anime; } return g; }
  // ─── placer une déco à une place typée (src/vie.js LAY.decos : { id, type, x, y, w, h }, en pixels d'écran) ───
  // On la bâtit là où elle vit d'habitude (ou, pour une déco neuve, à l'origine), puis on la déplace et la réduit pour tenir dans sa place :
  // au mur, son centre au point de la place (contre le mur) ; au sol, sur le comptoir, au rebord, son pied au point de la place.
  const placer = (d, place, c) => placerBoite(boiteDe(d, d.base), place, c);
  function placerGroupe(g, place, c) { g.updateMatrixWorld(true); const m = placerBoite(new THREE.Box3().setFromObject(g, true), place, c); g.applyMatrix4(m); return g; } // (la vitrine des coupes)
  function placerBoite(b, place, c) {
    if (b.isEmpty() || !place) return new THREE.Matrix4();
    const w = b.max.x - b.min.x || 1, h = b.max.y - b.min.y || 1, p = b.max.z - b.min.z || 1, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const ecranH = h * c.CY + p * c.SY; // la hauteur qu'elle prend à l'écran (sa face et son dessus)
    let s, T;
    if (place.type === 'mur') { s = Math.min(1, place.w / w, place.h / ecranH); // (ce qui avance du mur descend à l'écran : sa profondeur compte)
      const tz = (place.z || 0) - s * b.min.z; T = [place.x - s * cx, murY(c, place.y) + (s * cz + tz) * c.SY / c.CY - s * (b.min.y + b.max.y) / 2, tz]; } // (le milieu de sa boîte à l'écran au milieu de la place)
    else {
      s = Math.min(1, place.w / w, place.h / ecranH);
      const o = place.type === 'comptoir' ? surDessus(c, place) : place.type === 'rebord' ? { x: place.x, y: murY(c, place.y), z: 4.5 } : { x: place.x, y: 0, z: c.wz(place.y) - Math.min(s * p, c.wd(place.p || 0)) / 2 };
      T = [o.x - s * cx, o.y - s * b.min.y, o.z - s * cz];
    }
    return new THREE.Matrix4().makeScale(s, s, s).setPosition(T[0], T[1], T[2]);
  }
  // la planchette d'un rebord : posée sous ce qui s'y tient (la fenêtre n'a pas d'appui à elle)
  function planchette(place, c) { const D = nouvelle('planchette-' + place.id, { x: place.x, y: murY(c, place.y) - 2.4, z: 0 }); D.fixe.push(P(M.boiteSimple(place.w + 4, 2.4, 9), c.Q.bois, { z: 4.5 }), P(M.boiteSimple(1.6, 5, 5), c.Q.bois, { x: -place.w / 2, y: -5, z: 2.5 }), P(M.boiteSimple(1.6, 5, 5), c.Q.bois, { x: place.w / 2, y: -5, z: 2.5 })); return D; }
  // la rosette « Esprit d'équipe » (l'objectif commun de la semaine réussi, classement v6) : une cocarde, disque doré, cœur crème, deux rubans
  function decoRosette(c) {
    const K = c.K, h = c.LAY.horloge, dp = c.LAY.diplome, ys = h.y + 6 * K, r = 7 * K, HP2 = Math.PI / 2; // entre l'horloge et le diplôme, à côté de la tête du boulanger
    const D = nouvelle('rosette', { x: (h.x + dp.x) / 2 - 2 * K, y: c.wy(c.LAY.murH - ys), z: 1.5, sy: 1 / c.CY }); // étirée pour paraître ronde à l'écran (comme l'horloge)
    D.fixe.push(P(M.boite(4 * K, 12 * K, 1, 0.4), '#5FD3A4', { x: -3.4 * K, y: -r - 6 * K, rz: 0.3 }), P(M.boite(4 * K, 12 * K, 1, 0.4), '#9A84F0', { x: 3.4 * K, y: -r - 6 * K, rz: -0.3 }),
      P(M.cylindre(r, r, 1.6, 14), '#FFC84A', { rx: HP2 }), P(M.cylindre(r * 0.66, r * 0.66, 1.2, 14), '#FFF3C4', { rx: HP2, z: 1 }), P(M.sphere(r * 0.3, 8), '#E1496C', { z: 2.4, sz: 0.5 }));
    return D;
  }
  // ─── les 15 décos de « Ma chaîne » : procédurales, 300 triangles au plus chacune, couleurs de sommets (le style de src/modeles.js).
  //     Bâties à l'origine : au mur, centrées sur (0, 0) contre le mur (z ≥ 0) ; au sol, sur le comptoir et au rebord, posées sur y = 0 ───
  const bs = (w, h, d) => M.boiteSimple(r2(w), r2(h), r2(d)), cyl = (rh, rb, h, n) => M.cylindre(rh, rb, h, n || 8);
  const NEUVES = {
    'souvenir-village': () => { // le petit moulin : la tour blanche, le toit rouge, quatre ailes qui tournent
      const D = nouvelle('souvenir-village'); D.fixe.push(P(cyl(4.2, 5.4, 13, 8), '#FFF4E2'), P(M.cone(5.6, 6, 8), '#D9534F', { y: 13 }), P(bs(3, 5, 1), '#8B5A3C', { y: 0, z: 5 }), P(cyl(5.8, 6.2, 1.2, 8), '#B5E88A'));
      const ailes = []; for (let k = 0; k < 4; k++) ailes.push(P(bs(1.6, 9, 0.5), '#E8C39A', { rz: k * HP, y: 0 }), P(bs(2.6, 6, 0.3), '#FFFFFF', { rz: k * HP, x: Math.sin(-k * HP) * 0, y: 0 }));
      D.vifs.push({ pr: ailes, emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(E.t * 1.2); m4.setPosition(0, 11, 5.6); } }); return D; },
    'souvenir-paris': () => { // le réverbère parisien : le pied, le fût vert sombre, la lanterne qui s'allume le soir
      const D = nouvelle('souvenir-paris'), v = '#2F4A3A'; D.fixe.push(P(cyl(3.6, 4.4, 2.5, 8), v), P(cyl(0.9, 1.2, 30, 6), v, { y: 2.5 }), P(cyl(2.2, 1.2, 2, 6), v, { y: 31 }), P(M.cone(4.6, 4, 6), v, { y: 40.5 }), P(M.sphere(1, 6), '#FFC84A', { y: 45 }));
      D.vifs.push({ pr: [P(cyl(3.4, 2.4, 7.5, 6), '#FFF3C4', { y: 33 })], emi: '#FFD98A', k: (E) => 0.25 + 0.85 * E.lampes, m: null }); return D; },
    'souvenir-mer': () => { // le bateau en bouteille : la bouteille couchée (vert d'eau), son bouchon, le voilier dedans
      const D = nouvelle('souvenir-mer'); D.fixe.push(P(cyl(5, 5, 20, 10), '#BFE3E0', { rz: HP, y: 5, x: 10 }), P(cyl(2, 3.6, 4, 8), '#BFE3E0', { rz: -HP, x: 10, y: 5 }), P(cyl(1.8, 1.8, 3, 6), '#B07A4A', { rz: -HP, x: 14, y: 5 }), P(bs(10, 1.2, 4), '#8B5A3C', { x: -6, y: 0 }), P(bs(16, 0.8, 1), '#5A4A3A', { x: 0, y: -0.2, z: 0 }));
      D.fixe.push(P(bs(9, 2.2, 3.4), '#C8864F', { y: 3.2 }), P(bs(0.6, 6.5, 0.6), '#5A4A3A', { y: 5.2 }), P(M.cone(2.8, 5.5, 3), '#FFFFFF', { x: 0.8, y: 5.8, sz: 0.3 }), P(bs(9, 0.4, 3.2), '#5FB2E6', { y: 3 })); return D; },
    'souvenir-montagne': () => { // la cloche de vache : la courroie de cuir brodée, la cloche de laiton, son battant
      const D = nouvelle('souvenir-montagne'); D.fixe.push(P(bs(3.4, 16, 1), '#8B4A2E', { y: 0, z: 0.5 }), P(bs(3.6, 1.2, 1.2), '#FFFFFF', { y: 11, z: 0.9 }), P(bs(3.6, 1.2, 1.2), '#E1496C', { y: 7, z: 0.9 }), P(M.tore(2.4, 0.6, TAU, 4, 8), '#C8A050', { y: 0, z: 1.5 }));
      D.fixe.push(P(cyl(3.2, 5, 9, 8), '#E0B040', { y: -11, z: 4 }), P(cyl(5.2, 5.2, 1, 8), '#B8862A', { y: -11.5, z: 4 }), P(M.sphere(1.5, 6), '#6B4A3A', { y: -12.5, z: 4 })); return D; },
    'souvenir-ville': () => { // le tramway miniature : la caisse jaune et crème, les vitres, le toit, la perche, les roues sur un bout de rail
      const D = nouvelle('souvenir-ville'); D.fixe.push(P(bs(20, 1, 4), '#6B6B78'), P(bs(17, 6, 6), '#FFC84A', { y: 2 }), P(bs(17.4, 2, 6.4), '#FFF4E2', { y: 8 }), P(bs(18, 1.4, 6.6), '#C04A3A', { y: 10 }));
      for (let k = 0; k < 4; k++) D.fixe.push(P(bs(2.6, 2.4, 0.4), '#9ED8FF', { x: -6 + k * 4, y: 5, z: 3.1 }));
      for (const x of [-5.5, 5.5]) D.fixe.push(P(cyl(1.4, 1.4, 1, 6), '#3A3440', { x, y: 1.4, z: 3.2, rx: HP }));
      D.fixe.push(P(bs(0.5, 6, 0.5), '#3A3440', { y: 11.4, rz: 0.5 })); return D; },
    'souvenir-gare': () => { // l'horloge de quai : la potence, le cadran double, cerclé de vert, ses aiguilles qui tournent (l'heure de Paris)
      const D = nouvelle('souvenir-gare'); D.fixe.push(P(bs(2, 2, 7), '#2F4A3A', { y: 5, z: 3.5 }), P(bs(5, 6, 1.2), '#2F4A3A', { y: 3, z: 0.6 }), P(cyl(6, 6, 3, 14), '#FFFFFF', { rx: HP, y: -1, z: 5.6 }), P(M.tore(6, 0.9, TAU, 4, 14), '#2F4A3A', { y: -1, z: 8.6 }));
      D.vifs.push({ pr: [P(bs(1, 3.6, 0.5), L)], emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(angleHeure(E)); m4.setPosition(0, -1, 8.8); } }, { pr: [P(bs(0.8, 5, 0.5), L)], emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(angleMinute(E)); m4.setPosition(0, -1, 9.1); } }); return D; },
    'souvenir-ile': () => { // le coquillage : une coquille Saint-Jacques nacrée, sept côtes en éventail, posée sur le sable
      const D = nouvelle('souvenir-ile'); D.fixe.push(P(cyl(7, 7.5, 1, 10), '#F2DFB5', { sz: 0.7 }));
      for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.33; D.fixe.push(P(bs(2.4, 10, 1.6), k % 2 ? '#FFB48A' : '#FFD2BC', { y: 1, z: -1, rz: a, rx: -0.5 })); }
      D.fixe.push(P(bs(5, 2, 2), '#FF9F80', { y: 1, z: 1.6 })); return D; },
    'souvenir-chateau': () => { // le blason : l'écu bleu roi à pointe, la bande d'or, la couronne
      const D = nouvelle('souvenir-chateau'), ecu = forme('ecu', () => { const s = new THREE.Shape(); s.moveTo(-7, 8); s.lineTo(7, 8); s.lineTo(7, 0); s.quadraticCurveTo(7, -7, 0, -10); s.quadraticCurveTo(-7, -7, -7, 0); s.closePath(); return s; });
      D.fixe.push(P(ecu, '#C8A050', { z: 0.5, sx: 1.12, sy: 1.1, sz: 1 }), P(ecu, '#2B5BD7', { z: 1.3, sz: 1 }), P(bs(2.6, 17, 0.6), '#FFC84A', { y: -8.6, z: 2, rz: -0.6 }));
      D.fixe.push(P(bs(10, 2, 1.2), '#FFC84A', { y: 9, z: 1 })); for (const x of [-4, 0, 4]) D.fixe.push(P(M.cone(1.3, 3, 4), '#FFC84A', { x, y: 11, z: 1 })); return D; },
    'souvenir-cimes': () => { // les skis croisés : deux skis rouges et blancs en croix, deux bâtons
      const D = nouvelle('souvenir-cimes');
      for (const s of [-1, 1]) D.fixe.push(P(bs(2.6, 30, 0.8), s > 0 ? '#E1496C' : '#2B5BD7', { y: -15, z: 1 + (s > 0 ? 0.9 : 0), rz: s * 0.55 }), P(bs(2.6, 3, 1.6), '#FFFFFF', { y: -1.5, z: 1.6 + (s > 0 ? 0.9 : 0), rz: s * 0.55 }), P(cyl(0.45, 0.45, 26, 4), '#5A4A3A', { y: -13, x: s * 4, z: 0.4, rz: -s * 0.25 }), P(cyl(1.6, 1.6, 0.5, 6), '#3A3440', { x: s * (4 - Math.sin(0.25) * 11), y: -10.5, z: 0.4, rz: -s * 0.25 }));
      return D; },
    'souvenir-capitale': () => { // la tour Eiffel miniature : quatre pieds, deux étages, la flèche
      const D = nouvelle('souvenir-capitale'), f = '#8C6F4E'; D.fixe.push(P(bs(11, 1, 11), '#E8DCC0'));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) D.fixe.push(P(bs(1.4, 10, 1.4), f, { x: sx * 3.2, y: 1, z: sz * 3.2, rx: sz * 0.28, rz: -sx * 0.28 }));
      D.fixe.push(P(bs(8, 1.2, 8), f, { y: 9.6 }), P(cyl(0.9, 2.6, 12, 4), f, { y: 10.8, ry: Math.PI / 4 }), P(bs(3.4, 0.9, 3.4), f, { y: 17 }), P(cyl(0.2, 0.9, 7, 4), f, { y: 22.8 }), P(M.sphere(0.6, 4), '#FFC84A', { y: 29.8 })); return D; },
    'chaine-plan': () => { // le plan de la chaîne : une carte encadrée, la mer, les terres, une punaise par boutique
      const D = nouvelle('chaine-plan'); D.fixe.push(P(bs(28, 20, 1.6), '#8B5A3C', { y: -10 }), P(bs(25, 17, 0.6), '#9ED8FF', { y: -8.5, z: 1.1 }), P(bs(12, 9, 0.5), '#B5E88A', { x: -5, y: -5, z: 1.5 }), P(bs(8, 6, 0.5), '#F2DFB5', { x: 6, y: -6, z: 1.5 }), P(bs(5, 4, 0.5), '#B5E88A', { x: 7, y: 2, z: 1.5 }));
      [[-8, -1], [-3, -3], [-6, 2], [6, -3], [8, 3], [3, 5]].forEach(([x, y], k) => D.fixe.push(P(M.cone(1.1, 2.2, 4), ['#E1496C', '#FFC84A', '#2B5BD7'][k % 3], { x, y, z: 1.6, rx: HP }))); return D; },
    'chaine-cloche': () => { // la cloche du gérant : la sonnette de réception, son socle de bois, le dôme doré, le bouton
      const D = nouvelle('chaine-cloche'); D.fixe.push(P(cyl(6, 6.5, 2, 10), '#8B5A3C'), P(cyl(5.6, 5.8, 0.6, 10), '#FFC84A', { y: 2 }), P(M.sphere(5, 10), '#FFD24A', { y: 2.4, sy: 0.75 }), P(cyl(0.6, 0.6, 2, 6), '#B8862A', { y: 6 }), P(M.sphere(1.3, 6), '#B8862A', { y: 8.2 })); return D; },
    'chaine-globe': () => { // le globe de la petite planète : un pied doré, l'anneau, la planète verte et bleue qui tourne doucement
      const D = nouvelle('chaine-globe'); D.fixe.push(P(cyl(4, 5, 1.6, 8), '#8B5A3C'), P(cyl(0.8, 1, 5, 6), '#C8A050', { y: 1.6 }), P(M.tore(7, 0.5, Math.PI * 1.4, 3, 10), '#C8A050', { y: 13, rz: -0.6 }));
      D.vifs.push({ pr: [P(M.sphere(6, 8), '#5FB2E6'), P(bs(5, 4, 2), '#7FD08C', { x: 2.6, y: 0.5, z: 4.8, ry: 0.5 }), P(bs(4, 3, 2), '#7FD08C', { x: -3, y: -3, z: -4.6, ry: 0.4 }), P(bs(4, 1, 4), '#FFFFFF', { y: 5.3 })], emi: null, k: 0, m: (E, m4) => { m4.makeRotationY(E.t * 0.5); m4.setPosition(0, 13, 0); } }); return D; },
    'chaine-statue': () => { // la statue du fondateur : toi, en bronze, sur un socle de pierre, une baguette à la main, la toque sur la tête
      const D = nouvelle('chaine-statue'), b = '#B07A3A', b2 = '#8C5A2A'; D.fixe.push(P(bs(14, 8, 12), '#D9D2C4'), P(bs(15, 1.4, 13), '#BFB6A6', { y: 8 }), P(bs(10, 1, 1), '#C8A050', { y: 4, z: 6.1 }));
      D.fixe.push(P(cyl(3.8, 5, 13, 8), b, { y: 9.4 }), P(M.sphere(3.6, 6), b, { y: 25.5 }), P(cyl(3, 3, 2.4, 8), b2, { y: 28 }), P(M.sphere(3.4, 6), b2, { y: 32, sy: 0.8 }), P(cyl(1.1, 1.1, 9, 6), b, { x: 4.2, y: 14, rz: 0.5 }), P(cyl(1, 1, 13, 5), '#C8864F', { x: 6.8, y: 16, rz: -0.25 })); return D; },
    'chaine-enseigne': () => { // l'enseigne dorée (la 1re Boutique d'or) : une plaque d'or qui luit, son cadre, une gerbe de blé, suspendue à une potence
      const D = nouvelle('chaine-enseigne'); D.fixe.push(P(bs(2, 2, 10), L, { y: 9, z: 5 }), P(bs(1, 4, 1), L, { x: -6, y: 6, z: 9 }), P(bs(1, 4, 1), L, { x: 6, y: 6, z: 9 }), P(bs(22, 14, 1.4), '#8B5A3C', { y: -8, z: 9 }));
      D.vifs.push({ pr: [P(bs(19, 11, 0.6), '#FFC84A', { y: -6.5, z: 9.8 }), P(cyl(0.5, 0.5, 8, 4), '#FFF3C4', { y: -5.5, z: 10.4 }), P(M.sphere(1.2, 5), '#FFF3C4', { x: -1.2, y: 2.4, z: 10.4, sy: 1.6 }), P(M.sphere(1.2, 5), '#FFF3C4', { x: 1.2, y: 1.4, z: 10.4, sy: 1.6 })], emi: '#FFC84A', k: (E) => 0.18 + 0.5 * E.lampes, m: null }); return D; },
  };
  // ─── les décos rares des paliers au-delà de la n°30 (lot « progression » : CHAINE.FAMILLES, famille « palier », GAME.RARES_PALIER) : au sol,
  //     posées sur y = 0 ; à part des quinze de « Ma chaîne » (NEUVES), comme elles sans place d'origine (elles n'existent que posées) ───
  const DECOS_PALIER = {
    'horloge-comtoise': () => { // l'horloge comtoise : la caisse de noyer, la porte vitrée où bat le balancier doré, le cadran émaillé et ses aiguilles (l'heure de Paris), le fronton
      const D = nouvelle('horloge-comtoise'), b = '#6B4226', b2 = '#4E2E18', or = '#E8B84A';
      D.fixe.push(P(bs(13, 4, 9), b2), P(bs(11, 30, 7.4), b, { y: 4 }), P(bs(13.4, 2.2, 9), b2, { y: 33.6 }), P(bs(12, 11, 8), b, { y: 35.8 }), P(bs(13, 1.6, 8.6), b2, { y: 46.6 }));
      D.fixe.push(P(bs(7.4, 20, 0.4), '#2E2A3A', { y: 8, z: 3.75 }), P(bs(8.4, 0.9, 0.6), or, { y: 7.6, z: 3.95 }), P(bs(8.4, 0.9, 0.6), or, { y: 27.8, z: 3.95 }), P(bs(0.9, 20.6, 0.6), or, { x: -3.75, y: 7.6, z: 3.95 }), P(bs(0.9, 20.6, 0.6), or, { x: 3.75, y: 7.6, z: 3.95 })); // la porte vitrée, son cadre doré
      D.fixe.push(P(cyl(4.4, 4.4, 0.6, 12), '#FFF8EC', { y: 41.4, z: 4, rx: HP }), P(M.tore(4.6, 0.5, TAU, 3, 12), or, { y: 41.4, z: 4.6 }), P(bs(0.9, 0.9, 0.5), L, { y: 40.95, z: 4.7 })); // le cadran
      D.fixe.push(P(arche(12, 7), b2, { y: 51.7, sz: 7.6 }), P(M.sphere(1.3, 6), or, { y: 55.8 }), P(bs(1, 3.4, 1), or, { x: -4.6, y: 48.2, z: 3.4 }), P(bs(1, 3.4, 1), or, { x: 4.6, y: 48.2, z: 3.4 })); // le fronton, sa boule d'or
      D.vifs.push({ pr: [P(bs(0.5, 13, 0.4), or, { y: -13 }), P(cyl(2.4, 2.4, 0.6, 8), or, { y: -15.2, rx: HP })], emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(Math.sin(E.t * Math.PI) * 0.2); m4.setPosition(0, 26.5, 3.3); } }); // le balancier : une seconde par battement
      D.vifs.push({ pr: [P(bs(0.8, 2.6, 0.3), L)], emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(angleHeure(E)); m4.setPosition(0, 41.4, 4.9); } }, { pr: [P(bs(0.6, 3.6, 0.3), L)], emi: null, k: 0, m: (E, m4) => { m4.makeRotationZ(angleMinute(E)); m4.setPosition(0, 41.4, 5.1); } });
      return D; },
    piano: () => { // le piano à queue : la caisse laquée noire et sa courbe, trois pieds, le clavier, le couvercle levé sur sa béquille, la banquette
      const D = nouvelle('piano'), noir = '#22202B', noir2 = '#34303F', or = '#E8B84A', touche = '#FFFDF6';
      const caisse = forme('piano-caisse', () => { const s = new THREE.Shape(); s.moveTo(-11, -9); s.lineTo(11, -9); s.lineTo(11, 1); s.bezierCurveTo(11, 8, 3, 7, 0, 12); s.bezierCurveTo(-3, 17, -11, 20, -11, 12); s.closePath(); return s; });
      if (!caisse.boundingBox) caisse.computeBoundingBox(); const hy = caisse.boundingBox.max.y; // (la forme est centrée : le bord du clavier, en bas de la forme, tombe en z = +hy une fois couchée)
      D.fixe.push(P(caisse, noir, { y: 10, rx: -HP, sz: 6.6 })); // la caisse : la forme du dessus (x vers la droite, y vers le fond), extrudée sur la hauteur
      for (const [x, z] of [[-9, hy - 2.6], [9, hy - 2.6], [-6, -hy + 4.5]]) D.fixe.push(P(bs(2, 6.8, 2), noir2, { x, z }), P(bs(2.4, 0.6, 2.4), or, { x, z }));
      D.fixe.push(P(bs(22, 1.4, 5.4), touche, { y: 9.4, z: hy + 2.2 }), P(bs(23, 3.2, 1.2), noir, { y: 7.4, z: hy + 4.9 }), P(bs(1.4, 4.6, 6), noir, { x: -11.6, y: 7.4, z: hy + 2.2 }), P(bs(1.4, 4.6, 6), noir, { x: 11.6, y: 7.4, z: hy + 2.2 })); // le clavier, son bandeau, ses joues
      for (let i = 0; i < 9; i++) if (i % 3 !== 2) D.fixe.push(P(bs(1, 0.9, 3), noir, { x: -9 + i * 2.25, y: 10.8, z: hy + 1.2 })); // les touches noires
      D.fixe.push(P(bs(5, 0.5, 2.4), or, { y: 0.4, z: hy - 1.5 })); // la lyre des pédales
      D.fixe.push({ geo: caisse, col: noir2, m: new THREE.Matrix4().makeTranslation(-11, 13.6, 0).multiply(new THREE.Matrix4().makeRotationZ(0.55)).multiply(new THREE.Matrix4().makeTranslation(11, 0, 0)).multiply(M.matrice({ rx: -HP, sz: 0.5 })) }); // le couvercle levé
      D.fixe.push(P(cyl(0.35, 0.35, 11, 4), or, { x: 4, y: 13.4, z: -2, rz: 0.75 })); // sa béquille
      D.fixe.push(P(bs(12, 2, 5), noir, { y: 5, z: hy + 9.5 }), P(bs(11, 0.8, 4.2), '#8E1B2E', { y: 7, z: hy + 9.5 })); for (const sx of [-1, 1]) D.fixe.push(P(bs(1, 5, 4), noir2, { x: sx * 5, z: hy + 9.5 })); // la banquette et son coussin
      return D; },
  };
  // ─── le registre des décos posables : leur type de place (le même que CHAINE.FAMILLES, src/chaine.js) et comment les bâtir.
  //     o : ce qui règle leur dessin à leur place d'origine (le néon remonté au-dessus des bocaux, la seconde place des toques) ───
  const DECOS = {
    graffiti: { type: 'mur', faire: (c) => decoGraffiti(c) }, neon: { type: 'mur', faire: (c, place, o) => decoNeon(c, !place && !!(o && o.haut)) },
    chien: { type: 'sol', faire: (c) => decoChien(c) }, 'toque-or': { type: 'mur', faire: (c) => decoToque(c, 'or', false) },
    citrouilles: { type: 'sol', faire: (c) => decoCitrouilles(c) }, toiles: { type: 'rebord', faire: (c, place) => decoToiles(c, place), enPlace: true },
    chaudron: { type: 'sol', faire: (c) => decoChaudron(c) }, bestiaire: { type: 'mur', faire: (c, place, o) => decoBocaux(c, o && o.teinte) }, legende: { type: 'sol', faire: (c) => decoLanterne(c) },
    'toque-citrouille': { type: 'mur', faire: (c, place, o) => decoToque(c, 'citrouille', !place && !!(o && o.bas)) }, rosette: { type: 'mur', faire: (c) => decoRosette(c) },
    'vitrine-coupes': { type: 'sol', groupe: true }, scooter: { type: 'dehors', peint: true }, // (la vitrine reste un groupe à elle : sa zone de touche ; le scooter est peint dehors)
    'souvenir-village': { type: 'comptoir' }, 'souvenir-paris': { type: 'sol' }, 'souvenir-mer': { type: 'rebord' }, 'souvenir-montagne': { type: 'mur' }, 'souvenir-ville': { type: 'rebord' },
    'souvenir-gare': { type: 'mur' }, 'souvenir-ile': { type: 'comptoir' }, 'souvenir-chateau': { type: 'mur' }, 'souvenir-cimes': { type: 'mur' }, 'souvenir-capitale': { type: 'comptoir' },
    'chaine-plan': { type: 'mur' }, 'chaine-cloche': { type: 'comptoir' }, 'chaine-globe': { type: 'comptoir' }, 'chaine-statue': { type: 'sol' }, 'chaine-enseigne': { type: 'mur' },
    'horloge-comtoise': { type: 'sol', faire: DECOS_PALIER['horloge-comtoise'] }, piano: { type: 'sol', faire: DECOS_PALIER.piano }, // (les décos rares des paliers, lot « progression »)
    // le Marché d'automne (st.marche.decos) : leur place d'origine (o.rang : la place de la toque sur la porte du fond ; o.teinte : le métal de l'album)
    cagettes: { type: 'sol', faire: (c, place) => decoCagettes(c, place) }, lampions: { type: 'rebord', faire: (c, place) => decoLampions(c, place) },
    feuilles: { type: 'sol', faire: (c, place) => decoFeuilles(c, place) }, tonneau: { type: 'sol', faire: (c, place) => decoTonneau(c, place) },
    album: { type: 'mur', faire: (c, place, o) => decoAlbum(c, place, o && o.teinte) }, 'arbre-or': { type: 'sol', faire: (c, place) => decoArbreOr(c, place) },
    'toque-feuille': { type: 'mur', faire: (c, place, o) => decoToque(c, 'feuille', !place && o ? o.rang || 0 : 0) },
    // la saison d'automne (la piste, SAISONS.possede) : posées seulement (DECOS_SAISON, comme les neuves)
    'couronne-feuilles': { type: 'mur' }, 'guirlande-feuilles': { type: 'rebord' }, 'lanterne-automne': { type: 'comptoir' }, epouvantail: { type: 'sol' }, 'trophee-automne-2026': { type: 'comptoir' },
  };
  // les décos de la saison d'automne (src/saison-automne.js, la piste) : à part des neuves de « Ma chaîne » (NEUVES) et des rares des paliers,
  // comme elles sans place d'origine
  const DECOS_SAISON = { 'couronne-feuilles': decoCouronneFeuilles, 'guirlande-feuilles': decoGuirlandeFeuilles, 'lanterne-automne': decoLanterneAutomne, epouvantail: decoEpouvantail, 'trophee-automne-2026': decoTropheeAutomne };
  for (const [id, f] of Object.entries(NEUVES)) DECOS[id].faire = f;
  for (const [id, f] of Object.entries(DECOS_SAISON)) DECOS[id].faire = f;
  // une déco en parties, bâtie à sa place : place = null (sa place d'origine, celle d'aujourd'hui ; une déco neuve n'en a pas : null) ou une
  // place typée de LAY.decos → { d, place: Matrix4 | null }, avec la planchette d'un rebord en plus
  function decoParties(id, c, place, o) {
    const x = DECOS[id]; if (!x || !x.faire) return null;
    if (!place) return NEUVES[id] || DECOS_PALIER[id] || DECOS_SAISON[id] ? null : [{ d: x.faire(c, null, o), place: null }];
    if (x.type !== place.type) return null;
    const d = x.faire(c, place, o), out = [{ d, place: x.enPlace ? null : placer(d, place, c) }];
    if (place.type === 'rebord' && !x.enPlace) out.push({ d: planchette(place, c), place: null }); // (la toile se tend dans la vitre : pas de planchette)
    return out;
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
  return { get sallesEnCache() { return [...TEX.keys()].filter((k) => /^(sol|mur)/.test(k)).length; }, textureSol, textureMur, salle, froid, four, comptoir, caisse, tables, bar, banquette, terrasse, couverts, HAUT, deco, plan, presentoir, ardoise, plante, fleurs, chat, paillasson, sapin, guirlande, fanions, coeurs, etagere, cadre, horloge, diplome, lampe, propSaison, surDessus, dimsComptoir, vitrineDemo, tout, coupe, trophees, partsCoupe, METAL, fantome, hantee, standing, coinsStanding, dehors, PROJETS3D, // (dehors, PROJETS3D : les chantiers du quartier, lot « progression »)
    marche, MC, erable, partsCagette, partsCourge, partsPomme, partsBotte, // (la Halle du Marché d'automne, en éco ; ses accessoires, repris par src/boutiquemarche.js)
    // « Mes décos » : les petits décors et les décos en parties typées, leur fusion, leurs places
    DECOS, NEUVES, DECOS_PALIER, DECOS_SAISON, MAX_VIFS, decoParties, decoCadre, decoHorloge, decoDiplome, decoPlante, decoFleurs, decoPaillasson, decoLampe, decoPlan, decoArdoise, fusion, placerGroupe, boiteDe, atlas };
})();
if (typeof module !== 'undefined') module.exports = MEUBLES;
