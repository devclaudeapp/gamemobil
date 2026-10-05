/* LE FOURNIL — la boutique en Canvas 2D : vitrine, boulanger, clients, coup de feu, client mystère, lumière du jour selon l'heure réelle. */
const SCENE = (() => {
  'use strict';
  const G = GAME;
  let cv, ctx, W = 1, H = 1, DPR = 1;
  const TAU = Math.PI * 2;
  const clients = [], textes = [], vapeurs = [];
  let hop = 0, blink = 0, nextSpawn = 2, t = 0, confetti = [], rush = false;
  const PASTEL = ['#FF9FB2', '#8FE3C2', '#C7B8FF', '#FFD98A', '#9BD0FF', '#FFB48A', '#B5E88A'];
  const PEAUX = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE3C9'];
  const CHEVEUX = ['#4A3328', '#2B2118', '#B8762E', '#E7C27A', '#8C8C8C', '#D9534F'];
  const L = '#4A3328';

  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); }
  function resize(width, height) {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = width; H = height;
    cv.style.height = H + 'px';
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  function ciel(hour) {
    if (hour < 6 || hour >= 21) return { haut: '#4B5A9E', bas: '#8E7CC3', nuit: true };
    if (hour < 8) return { haut: '#FFC2A8', bas: '#FFE8B8', nuit: false };
    if (hour < 18) return { haut: '#9ED8FF', bas: '#DDF3FF', nuit: false };
    if (hour < 20) return { haut: '#FFB37A', bas: '#FFE1B0', nuit: false };
    return { haut: '#7C6BB8', bas: '#F0A7A0', nuit: false };
  }
  // ─── événements venus du jeu ───
  function vente(i, montant, texte) {
    const x = W * 0.62 + Math.random() * W * 0.1, y = H * 0.52;
    textes.push({ x, y, txt: texte, life: 1, col: '#3FB889' });
    if (clients.length < (rush ? 8 : 5) && Math.random() < 0.6) spawn();
    hop = 1;
    if (textes.length > 6) textes.shift();
  }
  function texte(txt, col) { textes.push({ x: W * 0.5, y: H * 0.45, txt, life: 1.4, col: col || '#E0A61E' }); }
  function tap() { hop = 1; for (let i = 0; i < 3; i++) vapeurs.push({ x: W * 0.13 + (Math.random() - 0.5) * 16, y: H * 0.5, r: 4 + Math.random() * 4, life: 1 }); }
  function fete() { for (let i = 0; i < 40; i++) confetti.push({ x: Math.random() * W, y: -10 - Math.random() * 40, vx: (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 60, c: PASTEL[i % PASTEL.length], a: Math.random() * TAU, life: 1 }); }
  function setRush(on) { rush = on; if (on) for (let k = 0; k < 3; k++) spawn(); }
  function spawn(or) {
    const c = { x: W + 20, y: H * 0.78 - Math.random() * 6, vx: -(50 + Math.random() * 30), etat: 'entre', wait: or ? 8 : 1.2 + Math.random() * 1.5, haut: or ? '#FFC84A' : PASTEL[Math.floor(Math.random() * PASTEL.length)],
      peau: PEAUX[Math.floor(Math.random() * PEAUX.length)], cheveux: or ? '#E0A61E' : CHEVEUX[Math.floor(Math.random() * CHEVEUX.length)], taille: or ? 1.15 : 0.9 + Math.random() * 0.25, sac: false, phase: Math.random() * TAU,
      cible: or ? W * 0.5 : W * 0.56 + (clients.length % 5) * 24, or: !!or, pris: false };
    clients.push(c);
    return c;
  }
  // le client mystère : doré, il attend 8 s devant le comptoir ; touché, il laisse un pourboire
  function mystere() { if (clients.some((c) => c.or)) return false; spawn(true); return true; }
  function hit(x, y) {
    for (const c of clients) {
      if (!c.or || c.pris || c.etat !== 'attend') continue;
      if (Math.abs(x - c.x) < 28 * c.taille && y > c.y - 75 * c.taille && y < c.y + 8) { c.pris = true; c.wait = 0.2; return true; }
    }
    return false;
  }

  // ─── boucle ───
  function frame(dt, st, now) {
    t += dt;
    const d = new Date(now), hour = d.getHours() + d.getMinutes() / 60;
    const taux = G.tauxParSeconde(st);
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      nextSpawn = rush ? 0.7 : taux > 0 ? Math.max(1.5, 6 - Math.log10(taux + 1)) : 7;
      if (clients.length < (rush ? 8 : 4) && (rush || taux > 0 || Math.random() < 0.3)) spawn();
    }
    for (const c of clients) {
      c.phase += dt * 9;
      if (c.etat === 'entre') { c.x += c.vx * dt * (rush ? 1.4 : 1); if (c.x <= c.cible) { c.x = c.cible; c.etat = 'attend'; } }
      else if (c.etat === 'attend') { c.wait -= dt; if (c.wait <= 0) { c.etat = 'sort'; c.sac = !c.or || c.pris; st.stats.clients++; G.noter(st, 'clients', 1); } }
      else { c.x += (c.or ? 90 : 70) * dt; }
    }
    for (let i = clients.length - 1; i >= 0; i--) if (clients[i].etat === 'sort' && clients[i].x > W + 30) clients.splice(i, 1);
    for (const x of textes) { x.life -= dt * 0.9; x.y -= 28 * dt; }
    for (let i = textes.length - 1; i >= 0; i--) if (textes[i].life <= 0) textes.splice(i, 1);
    if (st.ev && st.ev.type === 'panne' && Math.random() < dt * 6) vapeurs.push({ x: W * 0.13 + (Math.random() - 0.5) * 22, y: H * 0.5, r: 5 + Math.random() * 5, life: 1.2, gris: true });
    for (const v of vapeurs) { v.life -= dt * 0.8; v.y -= 22 * dt; v.r += 6 * dt; }
    for (let i = vapeurs.length - 1; i >= 0; i--) if (vapeurs[i].life <= 0) vapeurs.splice(i, 1);
    for (const k of confetti) { k.x += k.vx * dt; k.y += k.vy * dt; k.a += dt * 6; k.life -= dt * 0.35; }
    confetti = confetti.filter((k) => k.life > 0 && k.y < H + 10);
    if (hop > 0) hop = Math.max(0, hop - dt * 4);
    blink = (blink + dt) % 3.4;
    draw(st, hour, taux);
  }

  // ─── dessin ───
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function draw(st, hour, taux) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sk = ciel(hour);
    ctx.fillStyle = rush ? '#FFF0E0' : '#FFF1E3'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FBE2CC'; for (let y = 0; y < H * 0.62; y += 18) ctx.fillRect(0, y, W, 1);
    const fx = W * 0.56, fy = H * 0.08, fw = W * 0.3, fh = H * 0.34;
    const g = ctx.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, sk.haut); g.addColorStop(1, sk.bas);
    rr(fx, fy, fw, fh, 14); ctx.fillStyle = g; ctx.fill();
    if (sk.nuit) { ctx.fillStyle = '#FFF4C2'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(fx + 10 + ((i * 37) % (fw - 20)), fy + 8 + ((i * 23) % (fh * 0.5)), 1.4, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.arc(fx + fw * 0.75, fy + fh * 0.3, 8, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(255,255,255,.85)'; const cx = fx + fw * 0.3 + Math.sin(t * 0.05) * 6; for (const [ox, oy, r] of [[0, 0, 9], [10, -3, 11], [20, 1, 8], [8, 5, 8]]) { ctx.beginPath(); ctx.arc(cx + ox, fy + fh * 0.4 + oy, r, 0, TAU); ctx.fill(); } }
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 6; rr(fx, fy, fw, fh, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy); ctx.lineTo(fx + fw / 2, fy + fh); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke();
    const niv = (i) => st.stations[i].niv;
    if (niv(1) > 0) plante(fx - 26, fy + fh + 4);
    if (niv(2) > 0) lampe(W * 0.36, 0);
    if (niv(3) > 0) cadre(W * 0.4, fy + 6);
    if (niv(5) > 0 || rush) guirlande();
    const pains = Math.min(10, Math.floor(niv(0) / 10));
    etagere(W * 0.04, H * 0.16, W * 0.44, pains);
    four(W * 0.04, H * 0.42, W * 0.18, H * 0.36, st.stations[0].actif || taux > 0);
    for (const v of vapeurs) { ctx.globalAlpha = Math.max(0, v.life) * 0.7; ctx.fillStyle = v.gris ? '#8C8C8C' : '#fff'; ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#F3D9C0'; ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.fillStyle = '#E8C7A8'; ctx.fillRect(0, H * 0.62, W, 4);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < W; x += 34) ctx.fillRect(x, H * 0.64, 17, H * 0.36);
    boulanger(W * 0.33, H * 0.62 - hop * 6);
    const cy = H * 0.58, ch = H * 0.3;
    rr(W * 0.24, cy, W * 0.52, ch, 10); ctx.fillStyle = '#D9915C'; ctx.fill();
    rr(W * 0.24, cy, W * 0.52, 14, 7); ctx.fillStyle = '#F2B98A'; ctx.fill();
    rr(W * 0.27, cy + 20, W * 0.46, ch - 34, 8); ctx.fillStyle = 'rgba(222,244,255,.75)'; ctx.fill(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
    vitrine(st, W * 0.27, cy + 20, W * 0.46, ch - 34);
    if (niv(4) > 0) chat(W * 0.7, cy - 2);
    for (const c of clients) client(c);
    for (const x of textes) { ctx.globalAlpha = Math.max(0, Math.min(1, x.life * 1.4)); ctx.font = `700 ${Math.round(15 * Math.min(1.3, 1 + x.txt.length / 40))}px Fredoka, Nunito, sans-serif`; ctx.fillStyle = x.col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.textAlign = 'center'; ctx.strokeText(x.txt, x.x, x.y); ctx.fillText(x.txt, x.x, x.y); }
    ctx.globalAlpha = 1;
    for (const k of confetti) { ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a); ctx.globalAlpha = Math.min(1, k.life * 2); ctx.fillStyle = k.c; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
  function etagere(x, y, w, n) {
    for (let r = 0; r < 2; r++) {
      const yy = y + r * 26;
      ctx.fillStyle = '#C8864F'; rr(x, yy + 14, w, 5, 2); ctx.fill();
      for (let i = 0; i < Math.min(5, n - r * 5); i++) {
        const px = x + 8 + i * (w / 5);
        ctx.fillStyle = i % 2 ? '#E8B46A' : '#D99A4E'; rr(px, yy, w / 5 - 12, 13, 6); ctx.fill();
        ctx.strokeStyle = '#A8621F'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 6, yy + 3); ctx.lineTo(px + 10, yy + 9); ctx.moveTo(px + 14, yy + 3); ctx.lineTo(px + 18, yy + 9); ctx.stroke();
      }
    }
  }
  function four(x, y, w, h, chaud) {
    rr(x, y, w, h, 10); ctx.fillStyle = '#6E5A52'; ctx.fill();
    rr(x + 6, y + 8, w - 12, h * 0.45, 8); ctx.fillStyle = chaud ? '#FF9F4A' : '#8C7A72'; ctx.fill();
    if (chaud) { ctx.fillStyle = '#FFD36B'; rr(x + 10, y + 14, w - 20, h * 0.3, 6); ctx.fill(); ctx.fillStyle = '#E8B46A'; rr(x + 14, y + h * 0.3, w - 28, 8, 4); ctx.fill(); }
    ctx.fillStyle = '#D9CCC2'; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.75, 4, 0, TAU); ctx.arc(x + w * 0.7, y + h * 0.75, 4, 0, TAU); ctx.fill();
  }
  function boulanger(x, y) {
    const peau = '#FFD7B5';
    ctx.fillStyle = '#fff'; rr(x - 22, y - 44, 44, 44, 14); ctx.fill();
    ctx.fillStyle = '#FF6B8B'; rr(x - 10, y - 44, 20, 26, 6); ctx.fill();
    ctx.fillStyle = peau; ctx.beginPath(); ctx.arc(x, y - 58, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; rr(x - 17, y - 86, 34, 22, 10); ctx.fill(); rr(x - 19, y - 68, 38, 7, 4); ctx.fill();
    ctx.fillStyle = L;
    if (blink > 3.2) { ctx.fillRect(x - 8, y - 60, 5, 2); ctx.fillRect(x + 3, y - 60, 5, 2); }
    else { ctx.beginPath(); ctx.arc(x - 6, y - 60, 2, 0, TAU); ctx.arc(x + 6, y - 60, 2, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y - 55, 6, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#FFB3B3'; ctx.beginPath(); ctx.arc(x - 11, y - 54, 2.5, 0, TAU); ctx.arc(x + 11, y - 54, 2.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = peau; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x - 20, y - 32); ctx.lineTo(x - 30, y - 12); ctx.moveTo(x + 20, y - 32); ctx.lineTo(x + 30, y - 12); ctx.stroke();
    if (rush) { ctx.fillStyle = '#9BD0FF'; ctx.beginPath(); ctx.arc(x + 19, y - 66, 2.2, 0, TAU); ctx.fill(); } // une goutte de sueur pendant le coup de feu
  }
  function vitrine(st, x, y, w, h) {
    const ouverts = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0);
    const n = Math.max(1, ouverts.length), cw = w / Math.max(3, n), s = Math.min(h - 6, cw - 6);
    ouverts.forEach((i, k) => patisserie(i, x + 4 + k * cw + (cw - s) / 2, y + (h - s) / 2, s, s));
  }
  function patisserie(i, x, y, w, h) {
    const s = Math.min(w, h);
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(s / 48, s / 48); ctx.translate(-24, -24);
    switch (i) {
      case 0: ctx.strokeStyle = '#E8B46A'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10, 34); ctx.lineTo(36, 12); ctx.stroke(); ctx.strokeStyle = '#A8621F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 27); ctx.lineTo(20, 29); ctx.moveTo(24, 20); ctx.lineTo(28, 22); ctx.stroke(); break;
      case 1: ctx.fillStyle = '#E8A54A'; ctx.beginPath(); ctx.moveTo(10, 30); ctx.bezierCurveTo(6, 20, 14, 12, 22, 12); ctx.bezierCurveTo(32, 11, 40, 18, 38, 26); ctx.bezierCurveTo(37, 31, 31, 30, 30, 26); ctx.bezierCurveTo(26, 31, 18, 34, 10, 30); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.stroke(); break;
      case 2: ctx.fillStyle = '#EBB15A'; rr(8, 14, 32, 22, 7); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#5B3A29'; rr(15, 19, 4, 12, 2); ctx.fill(); rr(29, 19, 4, 12, 2); ctx.fill(); break;
      case 3: ctx.fillStyle = '#E9A95C'; ctx.beginPath(); ctx.ellipse(24, 28, 18, 11, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#F7C96B'; ctx.beginPath(); ctx.ellipse(24, 25, 15, 8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#E85A4F'; ctx.beginPath(); ctx.arc(24, 25, 3, 0, TAU); ctx.fill(); break;
      case 4: ctx.fillStyle = '#F1C27A'; rr(6, 18, 36, 16, 8); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#8B5A3C'; rr(8, 16, 32, 10, 5); ctx.fill(); break;
      case 5: for (const [cx, cy, col, col2] of [[18, 28, '#C9A3F5', '#E7D4FF'], [31, 19, '#F79AB5', '#FFE1EA']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 11, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = col2; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 11, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 11, 5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 1.5; ctx.stroke(); } break;
      case 6: for (let k = 0; k < 3; k++) { ctx.fillStyle = k === 2 ? '#fff' : '#F1C27A'; rr(8, 30 - k * 11, 32, 7, 2); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 1.5; ctx.stroke(); if (k < 2) { ctx.fillStyle = '#FFF3C4'; ctx.fillRect(8, 26 - k * 11, 32, 4); } } break;
      default: ctx.fillStyle = '#F7C96B'; ctx.beginPath(); ctx.moveTo(24, 6); ctx.lineTo(36, 38); ctx.lineTo(12, 38); ctx.closePath(); ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#FFE1EA'; for (const [cx, cy] of [[24, 13], [20, 20], [28, 20], [16, 28], [24, 28], [32, 28]]) { ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }
  function client(c) {
    const x = c.x, y = c.y, s = c.taille, bob = c.etat === 'attend' ? 0 : Math.abs(Math.sin(c.phase)) * 3;
    ctx.save(); ctx.translate(x, y - bob); ctx.scale(s, s);
    if (c.or && !c.pris && c.etat === 'attend') { // halo et étincelles du client mystère
      ctx.fillStyle = 'rgba(255,200,74,.28)'; ctx.beginPath(); ctx.ellipse(0, -30, 30, 44, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FFC84A'; for (let k = 0; k < 4; k++) { const a = t * 2 + k * 1.6, px = Math.cos(a) * 26, py = -30 + Math.sin(a * 1.3) * 34; etincelle(px, py, 4 + Math.sin(t * 6 + k) * 1.5); }
    }
    ctx.fillStyle = c.haut; rr(-13, -40, 26, 32, 10); ctx.fill();
    ctx.fillStyle = '#4A3328'; rr(-11, -10, 9, 12, 3); ctx.fill(); rr(2, -10, 9, 12, 3); ctx.fill();
    ctx.fillStyle = c.peau; ctx.beginPath(); ctx.arc(0, -52, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = c.cheveux; ctx.beginPath(); ctx.arc(0, -56, 13, Math.PI, TAU); ctx.fill();
    if (c.or) { ctx.fillStyle = '#4A3328'; rr(-15, -58, 30, 5, 2); ctx.fill(); rr(-9, -72, 18, 15, 3); ctx.fill(); } // chapeau
    ctx.fillStyle = L; ctx.beginPath(); ctx.arc(-5, -52, 1.8, 0, TAU); ctx.arc(5, -52, 1.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = L; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -49, 4, 0.3, Math.PI - 0.3); ctx.stroke();
    if (c.sac) { ctx.fillStyle = '#F2D7B6'; rr(12, -28, 14, 18, 3); ctx.fill(); ctx.strokeStyle = '#C8864F'; ctx.lineWidth = 1.5; ctx.strokeRect(12, -28, 14, 18); ctx.fillStyle = '#E8B46A'; rr(15, -34, 8, 8, 3); ctx.fill(); }
    ctx.restore();
  }
  function etincelle(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); }
  function plante(x, y) { ctx.fillStyle = '#D9915C'; rr(x - 10, y, 20, 16, 5); ctx.fill(); ctx.fillStyle = '#5FD3A4'; for (const [ox, oy, r] of [[0, -8, 9], [-9, -2, 7], [9, -2, 7], [0, -18, 7]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, TAU); ctx.fill(); } }
  function lampe(x, y) { ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke(); ctx.fillStyle = '#FFC84A'; ctx.beginPath(); ctx.moveTo(x - 16, y + 40); ctx.lineTo(x + 16, y + 40); ctx.lineTo(x + 8, y + 22); ctx.lineTo(x - 8, y + 22); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,230,150,.35)'; ctx.beginPath(); ctx.arc(x, y + 48, 16, 0, TAU); ctx.fill(); }
  function cadre(x, y) { ctx.fillStyle = '#fff'; rr(x - 16, y, 32, 26, 4); ctx.fill(); ctx.strokeStyle = '#C8864F'; ctx.lineWidth = 3; ctx.strokeRect(x - 16, y, 32, 26); ctx.fillStyle = '#9ED8FF'; ctx.fillRect(x - 12, y + 4, 24, 12); ctx.fillStyle = '#5FD3A4'; ctx.beginPath(); ctx.moveTo(x - 12, y + 22); ctx.lineTo(x - 2, y + 10); ctx.lineTo(x + 6, y + 18); ctx.lineTo(x + 12, y + 12); ctx.lineTo(x + 12, y + 22); ctx.closePath(); ctx.fill(); }
  function guirlande() { ctx.strokeStyle = '#C8864F'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(W / 2, 34, W, 6); ctx.stroke(); for (let i = 0; i < 9; i++) { const u = (i + 0.5) / 9, x = u * W, y = 6 + 4 * (1 - Math.pow(2 * u - 1, 2)) * 7; ctx.fillStyle = PASTEL[i % PASTEL.length]; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 12); ctx.closePath(); ctx.fill(); } }
  function chat(x, y) { ctx.fillStyle = '#F2A65A'; rr(x - 16, y - 12, 30, 12, 6); ctx.fill(); ctx.beginPath(); ctx.arc(x + 14, y - 12, 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 9, y - 16); ctx.lineTo(x + 11, y - 22); ctx.lineTo(x + 14, y - 17); ctx.moveTo(x + 15, y - 17); ctx.lineTo(x + 18, y - 22); ctx.lineTo(x + 19, y - 16); ctx.fill(); ctx.strokeStyle = '#F2A65A'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 16, y - 6); ctx.quadraticCurveTo(x - 26, y - 6, x - 24, y - 16); ctx.stroke(); ctx.fillStyle = L; ctx.fillRect(x + 11, y - 13, 2, 1.5); ctx.fillRect(x + 16, y - 13, 2, 1.5); }

  return { init, resize, frame, vente, texte, tap, fete, setRush, mystere, hit, get clients() { return clients.length; }, get mystereVisible() { return clients.some((c) => c.or && !c.pris && c.etat === 'attend'); } };
})();
