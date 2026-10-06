/* LE FOURNIL — la boutique en Canvas 2D : cinq quartiers (vue par la fenêtre, murs, sol, comptoir), une boutique qui grandit,
   les saisons selon la date réelle, la lumière du jour et de la nuit, le boulanger et son titre, les clients, les passants, les événements. */
const SCENE = (() => {
  'use strict';
  const G = GAME;
  let cv, ctx, W = 1, H = 1, DPR = 1;
  const TAU = Math.PI * 2;
  const clients = [], textes = [], vapeurs = [], flocons = [], passants = [];
  let hop = 0, blink = 0, nextSpawn = 2, nextPassant = 5, t = 0, confetti = [], rush = false, rang = 0, pts = 0, affl = 0, Q = null, tags = [], force = {};
  const L = '#4A3328';
  const PASTEL = ['#FF9FB2', '#8FE3C2', '#C7B8FF', '#FFD98A', '#9BD0FF', '#FFB48A', '#B5E88A'];
  const PEAUX = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE3C9'];
  const CHEVEUX = ['#4A3328', '#2B2118', '#B8762E', '#E7C27A', '#8C8C8C', '#D9534F'];
  // les décors : murs, sol, comptoir, palette des clients, vue par la fenêtre
  const DECORS = {
    village: { mur: '#FFF1E3', mur2: '#FBE2CC', murStyle: 'lignes', sol: '#F3D9C0', sol2: 'rgba(255,255,255,.35)', solStyle: 'planches', comptoir: '#D9915C', comptoir2: '#F2B98A', bois: '#C8864F', accent: '#FF9FB2', hauts: PASTEL, vue: 'campagne' },
    paris: { mur: '#EEF1F6', mur2: '#D9E0EA', murStyle: 'moulures', sol: '#E9ECF1', sol2: '#2F3542', solStyle: 'damier', comptoir: '#6F7D8C', comptoir2: '#B9C6D2', bois: '#3D4654', accent: '#2B3A55', hauts: ['#2B3A55', '#C9B79C', '#8A2B3A', '#E4D8C8', '#4D6A8A', '#D9A066'], vue: 'paris' },
    mer: { mur: '#F4FBFF', mur2: '#D6EEF9', murStyle: 'bande', sol: '#EADFC9', sol2: 'rgba(255,255,255,.45)', solStyle: 'planches', comptoir: '#4F9FD1', comptoir2: '#A9D8F0', bois: '#DCE7EE', accent: '#3A86C8', hauts: ['#3A86C8', '#FFFFFF', '#F2C94C', '#FF8A80', '#8FD3F4', '#9BE8C2'], vue: 'mer' },
    montagne: { mur: '#EFDCC2', mur2: '#D8BE9A', murStyle: 'rondins', sol: '#B98A5E', sol2: 'rgba(0,0,0,.08)', solStyle: 'planches', comptoir: '#7A4E31', comptoir2: '#A86F48', bois: '#5A3A22', accent: '#A64B2A', hauts: ['#A64B2A', '#2F6B4F', '#E8D8B0', '#8C3B3B', '#4F6D8C', '#D98E4A'], vue: 'montagne' },
    ville: { mur: '#F6F2EF', mur2: '#E4DCD6', murStyle: 'marbre', sol: '#3A3642', sol2: 'rgba(255,255,255,.08)', solStyle: 'marbre', comptoir: '#2E2A36', comptoir2: '#C9A96A', bois: '#C9A96A', accent: '#FF6B8B', hauts: ['#1F1F2B', '#FF6B8B', '#C9A96A', '#F5F5F5', '#7B61FF', '#3EC9A7'], vue: 'ville' },
  };

  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); }
  function resize(width, height) {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = width; H = height;
    cv.style.height = H + 'px';
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  function forcer(o) { force = o || {}; } // pour les captures : heure et saison imposées
  function ciel(hour) {
    if (hour < 6 || hour >= 21) return { haut: '#3E4C8F', bas: '#8A7CC7', nuit: true, phase: 'nuit' };
    if (hour < 8) return { haut: '#FFC2A8', bas: '#FFE8B8', nuit: false, phase: 'aube' };
    if (hour < 18) return { haut: '#9ED8FF', bas: '#DDF3FF', nuit: false, phase: 'jour' };
    if (hour < 20) return { haut: '#FFB37A', bas: '#FFE1B0', nuit: false, phase: 'soir' };
    return { haut: '#7C6BB8', bas: '#F0A7A0', nuit: false, phase: 'crepuscule' };
  }

  // ─── événements venus du jeu ───
  function vente(i, montant, texte, main) {
    const x = W * 0.62 + Math.random() * W * 0.1, y = H * 0.52;
    textes.push({ x, y, txt: texte, life: 1, col: '#3FB889' });
    for (let k = 0; k < (main ? 1 + affl : 1); k++) if (clients.length < (rush ? 8 : 5) + affl && (k > 0 || Math.random() < 0.6)) spawn(); // le bouche-à-oreille amène du monde
    hop = 1;
    if (textes.length > 6) textes.shift();
  }
  function texte(txt, col) { textes.push({ x: W * 0.5, y: H * 0.45, txt, life: 1.4, col: col || '#E0A61E' }); }
  function tap() { hop = 1; for (let i = 0; i < 3; i++) vapeurs.push({ x: W * 0.13 + (Math.random() - 0.5) * 16, y: H * 0.5, r: 4 + Math.random() * 4, life: 1 }); }
  function fete() { for (let i = 0; i < 40; i++) confetti.push({ x: Math.random() * W, y: -10 - Math.random() * 40, vx: (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 60, c: PASTEL[i % PASTEL.length], a: Math.random() * TAU, life: 1 }); }
  function setRush(on) { rush = on; if (on) for (let k = 0; k < 3; k++) spawn(); }
  function spawn(or) {
    const hauts = (Q && Q.hauts) || PASTEL, hiver = tags.includes('neige') || (Q && Q.vue === 'montagne');
    const c = { x: W + 20, y: H * 0.78 - Math.random() * 6, vx: -(50 + Math.random() * 30), etat: 'entre', wait: or ? 8 : 1.2 + Math.random() * 1.5, haut: or ? '#FFC84A' : hauts[Math.floor(Math.random() * hauts.length)],
      peau: PEAUX[Math.floor(Math.random() * PEAUX.length)], cheveux: or ? '#E0A61E' : CHEVEUX[Math.floor(Math.random() * CHEVEUX.length)], taille: or ? 1.15 : 0.9 + Math.random() * 0.25, sac: false, phase: Math.random() * TAU,
      coiffure: or ? 0 : hiver && Math.random() < 0.5 ? 3 : Math.floor(Math.random() * 3), lunettes: !or && Math.random() < 0.2, bonnet: hauts[Math.floor(Math.random() * hauts.length)], sacCol: Math.random() < 0.5 ? '#F2D7B6' : '#E8C7A8',
      cible: or ? W * 0.5 : W * 0.56 + (clients.length % 5) * 24, or: !!or, pris: false };
    clients.push(c);
    return c;
  }
  // le client mystère : doré, il attend 8 s devant le comptoir ; touché, il laisse un pourboire
  function mystere() { if (clients.some((c) => c.or)) return false; spawn(true); return true; }
  // un habitué : silhouette fixe, étiquette avec son prénom, il reste un peu plus longtemps
  function habitue(hb) { if (!hb || clients.some((c) => c.hab === hb.id)) return false; const c = spawn(false); c.hab = hb.id; c.nom = hb.nom; c.haut = hb.haut; c.cheveux = hb.cheveux; c.peau = hb.peau; c.coiffure = hb.coiffure; c.lunettes = hb.id === 'dupuis'; c.taille = 1.05; c.wait = 3; return true; }
  // le boulanger, au comptoir : on le touche pour ouvrir sa fiche
  function hitBoulanger(x, y) { const bx = W * 0.33, by = H * 0.62; return Math.abs(x - bx) < 34 && y > by - 112 && y < by + 4; }
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
    const d = new Date(now), hour = force.heure != null ? force.heure : d.getHours() + d.getMinutes() / 60;
    const taux = G.tauxParSeconde(st);
    rang = G.rangTitre(st); pts = G.ptsTalents(st); affl = G.talent(st, 'affluence');
    Q = DECORS[G.QUARTIERS[G.quartier(st)].id] || DECORS.village; tags = force.saison || G.saison(now);
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      nextSpawn = rush ? 0.7 : taux > 0 ? Math.max(1.5, 6 - Math.log10(taux + 1)) : 7;
      if (clients.length < (rush ? 8 : 4) + affl && (rush || taux > 0 || Math.random() < 0.3)) spawn();
    }
    for (const c of clients) {
      c.phase += dt * 9;
      if (c.etat === 'entre') { c.x += c.vx * dt * (rush ? 1.4 : 1); if (c.x <= c.cible) { c.x = c.cible; c.etat = 'attend'; } }
      else if (c.etat === 'attend') { c.wait -= dt; if (c.wait <= 0) { c.etat = 'sort'; c.sac = !c.or || c.pris; st.stats.clients++; G.noter(st, 'clients', 1); if (c.hab) { const r = G.servirHabitue(st, c.hab); if (r.ok && API.surServi) API.surServi(r); } } }
      else { c.x += (c.or ? 90 : 70) * dt; }
    }
    for (let i = clients.length - 1; i >= 0; i--) if (clients[i].etat === 'sort' && clients[i].x > W + 30) clients.splice(i, 1);
    // dehors : des passants devant la fenêtre, et la météo de saison
    const fx = W * 0.56, fy = H * 0.08, fw = W * 0.3, fh = H * 0.34;
    nextPassant -= dt;
    if (nextPassant <= 0 && Q.vue !== 'mer' && Q.vue !== 'montagne') { nextPassant = 6 + Math.random() * 10; const g = Math.random() < 0.5; passants.push({ x: g ? fx - 14 : fx + fw + 14, vx: (g ? 1 : -1) * (16 + Math.random() * 12), s: 0.8 + Math.random() * 0.4, col: ['#2B3A55', '#6B4A3A', '#3D5A4A', '#7A3B4A'][Math.floor(Math.random() * 4)], phase: Math.random() * TAU }); }
    for (const p of passants) { p.x += p.vx * dt; p.phase += dt * 8; }
    for (let i = passants.length - 1; i >= 0; i--) if (passants[i].x < fx - 20 || passants[i].x > fx + fw + 20) passants.splice(i, 1);
    const meteo = tags.includes('neige') || Q.vue === 'montagne' ? 'neige' : tags.includes('feuilles') ? 'feuilles' : tags.includes('paques') ? 'petales' : null;
    if (meteo && flocons.length < (meteo === 'neige' ? 40 : 14) && Math.random() < dt * (meteo === 'neige' ? 14 : 4)) flocons.push({ x: fx + Math.random() * fw, y: fy - 4, vy: meteo === 'neige' ? 10 + Math.random() * 14 : 18 + Math.random() * 14, vx: meteo === 'neige' ? 0 : 8 + Math.random() * 10, r: meteo === 'neige' ? 1.2 + Math.random() * 1.6 : 2.5, a: Math.random() * TAU, type: meteo });
    for (const f of flocons) { f.y += f.vy * dt; f.x += (f.vx + Math.sin(t * 2 + f.a) * 6) * dt; f.a += dt * 3; }
    for (let i = flocons.length - 1; i >= 0; i--) if (flocons[i].y > fy + fh + 4 || flocons[i].type !== meteo) flocons.splice(i, 1);
    if (st.ev && st.ev.type === 'panne' && Math.random() < dt * 6) vapeurs.push({ x: W * 0.13 + (Math.random() - 0.5) * 22, y: H * 0.5, r: 5 + Math.random() * 5, life: 1.2, gris: true });
    for (const v of vapeurs) { v.life -= dt * 0.8; v.y -= 22 * dt; v.r += 6 * dt; }
    for (let i = vapeurs.length - 1; i >= 0; i--) if (vapeurs[i].life <= 0) vapeurs.splice(i, 1);
    for (const x of textes) { x.life -= dt * 0.9; x.y -= 28 * dt; }
    for (let i = textes.length - 1; i >= 0; i--) if (textes[i].life <= 0) textes.splice(i, 1);
    for (const k of confetti) { k.x += k.vx * dt; k.y += k.vy * dt; k.a += dt * 6; k.life -= dt * 0.35; }
    confetti = confetti.filter((k) => k.life > 0 && k.y < H + 10);
    if (hop > 0) hop = Math.max(0, hop - dt * 4);
    blink = (blink + dt) % 3.4;
    draw(st, hour, taux, d);
  }

  // ─── dessin ───
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function ombre(x, y, rx, ry, a) { ctx.fillStyle = `rgba(74,51,40,${a || 0.14})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function draw(st, hour, taux, d) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sk = ciel(hour), fx = W * 0.56, fy = H * 0.08, fw = W * 0.3, fh = H * 0.34, niv = (i) => st.stations[i].niv;
    const staffs = st.stations.filter((s) => s.staff).length, bonus = Object.keys(st.ameliorations).length;
    mur(sk);
    fenetre(fx, fy, fw, fh, sk);
    // ce qui s'accroche aux murs au fil de la boutique
    if (niv(1) > 0) plante(fx - 26, fy + fh + 4);
    if (niv(2) > 0) lampe(W * 0.3, 0, sk.nuit);
    if (niv(3) > 0) cadre(W * 0.49, fy + 4);
    horloge(W * 0.49, H * 0.3, d);
    if (rang >= 2) diplome(W * 0.92, fy + 12);
    if (niv(5) > 0 || rush || tags.includes('noel')) guirlande(tags.includes('noel'));
    if (tags.includes('fete')) fanions();
    if (tags.includes('coeurs')) coeurs();
    const pains = Math.min(10, Math.floor(niv(0) / 10));
    etagere(W * 0.04, H * 0.16, W * 0.44, pains, niv(6) > 0);
    four(W * 0.04, H * 0.42, W * 0.18, H * 0.36, st.stations[0].actif || taux > 0);
    for (const v of vapeurs) { ctx.globalAlpha = Math.max(0, v.life) * 0.7; ctx.fillStyle = v.gris ? '#8C8C8C' : '#fff'; ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    sol();
    if (staffs >= 2) ardoise(W * 0.13, H * 0.97);
    paillasson(W * 0.9, H * 0.9);
    if (tags.includes('noel')) sapin(W * 0.86, H * 0.74);
    boulanger(W * 0.33, H * 0.62 - hop * 6);
    const cy = H * 0.58, ch = H * 0.3;
    comptoir(W * 0.24, cy, W * 0.52, ch, st);
    if (bonus >= 3) fleurs(W * 0.29, cy - 4);
    if (niv(4) > 0) chat(W * 0.7, cy - 2);
    if (tags.includes('halloween')) citrouille(W * 0.6, cy - 5);
    if (tags.includes('galette')) galette(W * 0.3 + (bonus >= 3 ? 30 : 0), cy - 4);
    if (tags.includes('paques')) oeufs(W * 0.56, cy - 4);
    if (tags.includes('ete') && !tags.includes('fete')) glaces(W * 0.6, cy - 6);
    for (const c of clients) client(c);
    lumiere(sk, niv(2) > 0);
    for (const x of textes) { ctx.globalAlpha = Math.max(0, Math.min(1, x.life * 1.4)); ctx.font = `700 ${Math.round(15 * Math.min(1.3, 1 + x.txt.length / 40))}px Fredoka, Nunito, sans-serif`; ctx.fillStyle = x.col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.textAlign = 'center'; ctx.strokeText(x.txt, x.x, x.y); ctx.fillText(x.txt, x.x, x.y); }
    ctx.globalAlpha = 1;
    for (const k of confetti) { ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a); ctx.globalAlpha = Math.min(1, k.life * 2); ctx.fillStyle = k.c; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
  // ─── murs, sol, lumière ───
  function mur(sk) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.62); g.addColorStop(0, Q.mur); g.addColorStop(1, Q.mur2);
    ctx.fillStyle = rush ? '#FFF0E0' : g; ctx.fillRect(0, 0, W, H * 0.62);
    ctx.fillStyle = Q.mur2;
    if (Q.murStyle === 'lignes') for (let y = 0; y < H * 0.62; y += 18) ctx.fillRect(0, y, W, 1);
    if (Q.murStyle === 'rondins') for (let y = 0; y < H * 0.62; y += 16) { ctx.fillRect(0, y, W, 2); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, y + 5, W, 1); ctx.fillStyle = Q.mur2; }
    if (Q.murStyle === 'moulures') { ctx.strokeStyle = Q.mur2; ctx.lineWidth = 2; for (const [x, w] of [[W * 0.04, W * 0.44], [W * 0.9, W * 0.08]]) { ctx.strokeRect(x, H * 0.08, w, H * 0.5); } ctx.fillRect(0, H * 0.56, W, 3); }
    if (Q.murStyle === 'bande') { ctx.fillStyle = Q.accent; ctx.fillRect(0, H * 0.56, W, 5); ctx.fillStyle = 'rgba(58,134,200,.12)'; ctx.fillRect(0, H * 0.52, W, 3); }
    if (Q.murStyle === 'marbre') { ctx.strokeStyle = 'rgba(120,100,90,.12)'; ctx.lineWidth = 1.5; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(k * W * 0.2 - 20, 0); ctx.quadraticCurveTo(k * W * 0.2 + 30, H * 0.3, k * W * 0.2 + 10, H * 0.62); ctx.stroke(); } ctx.fillStyle = Q.bois; ctx.fillRect(0, H * 0.57, W, 3); }
    const v = ctx.createRadialGradient(W * 0.45, H * 0.3, H * 0.2, W * 0.45, H * 0.3, W * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(74,51,40,.10)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H * 0.62);
  }
  function sol() {
    const y0 = H * 0.62;
    const g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, Q.sol); g.addColorStop(1, Q.solStyle === 'marbre' ? '#2A2731' : Q.sol);
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(0, y0, W, 4);
    if (Q.solStyle === 'planches') { ctx.fillStyle = Q.sol2; for (let x = 0; x < W; x += 34) ctx.fillRect(x, y0 + 4, 17, H - y0); }
    if (Q.solStyle === 'damier') { ctx.fillStyle = Q.sol2; const s = 22; for (let r = 0; r < 4; r++) for (let c = -1; c < W / s + 1; c++) if ((r + c) % 2 === 0) { const yy = y0 + 4 + r * s * 0.55, sh = s * 0.55; ctx.beginPath(); ctx.moveTo(c * s + s / 2, yy); ctx.lineTo(c * s + s, yy + sh / 2); ctx.lineTo(c * s + s / 2, yy + sh); ctx.lineTo(c * s, yy + sh / 2); ctx.closePath(); ctx.fill(); } }
    if (Q.solStyle === 'marbre') { ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1.5; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(k * W * 0.25, y0); ctx.quadraticCurveTo(k * W * 0.25 + 40, y0 + 20, k * W * 0.25 + 20, H); ctx.stroke(); } }
  }
  function lumiere(sk, lampeAllumee) {
    if (sk.phase === 'nuit') { ctx.fillStyle = 'rgba(40,50,130,.22)'; ctx.fillRect(0, 0, W, H); }
    else if (sk.phase === 'soir') { ctx.fillStyle = 'rgba(255,150,70,.10)'; ctx.fillRect(0, 0, W, H); }
    else if (sk.phase === 'crepuscule') { ctx.fillStyle = 'rgba(120,90,160,.12)'; ctx.fillRect(0, 0, W, H); }
    else if (sk.phase === 'aube') { ctx.fillStyle = 'rgba(255,190,150,.08)'; ctx.fillRect(0, 0, W, H); }
    if (sk.phase === 'nuit' || sk.phase === 'crepuscule') { // les lampes s'allument : halos chauds
      const pts = [[W * 0.1, H * 0.1], [W * 0.95, H * 0.12]]; if (lampeAllumee) pts.push([W * 0.3, H * 0.22]);
      for (const [x, y] of pts) { const g = ctx.createRadialGradient(x, y, 2, x, y, W * 0.22); g.addColorStop(0, 'rgba(255,220,140,.45)'); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - W * 0.22, y - W * 0.22, W * 0.44, W * 0.44); ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
    }
  }
  // ─── la fenêtre et ce qu'on voit dehors ───
  function fenetre(fx, fy, fw, fh, sk) {
    ctx.save(); rr(fx, fy, fw, fh, 14); ctx.clip();
    const g = ctx.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, sk.haut); g.addColorStop(1, sk.bas); ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
    if (sk.nuit) { ctx.fillStyle = '#FFF4C2'; for (let i = 0; i < 9; i++) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + i); ctx.beginPath(); ctx.arc(fx + 6 + ((i * 37) % (fw - 12)), fy + 6 + ((i * 23) % (fh * 0.45)), 1.3, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(fx + fw * 0.75, fy + fh * 0.25, 8, 0, TAU); ctx.fill(); ctx.fillStyle = sk.haut; ctx.beginPath(); ctx.arc(fx + fw * 0.75 + 4, fy + fh * 0.25 - 3, 7, 0, TAU); ctx.fill(); }
    else if (sk.phase !== 'crepuscule') { ctx.fillStyle = sk.phase === 'soir' ? '#FFD36B' : '#FFE27A'; ctx.beginPath(); ctx.arc(fx + fw * 0.78, fy + fh * (sk.phase === 'soir' ? 0.5 : 0.22), 8, 0, TAU); ctx.fill(); }
    if (!sk.nuit) { ctx.fillStyle = 'rgba(255,255,255,.85)'; const cx = fx + fw * 0.3 + Math.sin(t * 0.05) * 6; for (const [ox, oy, r] of [[0, 0, 8], [9, -3, 10], [18, 1, 7], [7, 5, 7]]) { ctx.beginPath(); ctx.arc(cx + ox, fy + fh * 0.34 + oy, r, 0, TAU); ctx.fill(); } }
    vue(fx, fy, fw, fh, sk);
    for (const p of passants) passant(p, fy + fh - 6);
    for (const f of flocons) { if (f.type === 'neige') { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); } else { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.fillStyle = f.type === 'feuilles' ? '#E07B39' : '#FFB3C7'; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 1.8, 0, 0, TAU); ctx.fill(); ctx.restore(); } }
    ctx.restore();
    // le cadre, les croisillons, le petit écriteau
    ctx.strokeStyle = Q.vue === 'montagne' ? '#5A3A22' : Q.vue === 'ville' ? '#2E2A36' : '#FFFFFF'; ctx.lineWidth = 6; rr(fx, fy, fw, fh, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy); ctx.lineTo(fx + fw / 2, fy + fh); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke();
    ctx.fillStyle = Q.bois; rr(fx - 6, fy + fh - 2, fw + 12, 7, 3); ctx.fill();
    ctx.fillStyle = '#fff'; rr(fx + 6, fy + fh - 18, 30, 12, 3); ctx.fill(); ctx.fillStyle = L; ctx.font = '700 7px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('OUVERT', fx + 21, fy + fh - 9);
  }
  function vue(fx, fy, fw, fh, sk) {
    const nuit = sk.nuit, bas = fy + fh, v = Q.vue;
    if (v === 'campagne') {
      ctx.fillStyle = nuit ? '#3E6B4A' : '#7FD08C'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.25, bas + 6, fw * 0.5, fh * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = nuit ? '#2F5A3C' : '#5FBE73'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.8, bas + 8, fw * 0.5, fh * 0.34, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8B5A3C'; ctx.fillRect(fx + fw * 0.68, bas - fh * 0.3, 3, fh * 0.14); ctx.fillStyle = nuit ? '#2F6B45' : '#4FAF62'; ctx.beginPath(); ctx.arc(fx + fw * 0.69, bas - fh * 0.34, fh * 0.11, 0, TAU); ctx.fill();
    } else if (v === 'paris') {
      const cols = nuit ? ['#3B4252', '#4A5368', '#2F3647'] : ['#B9C2D1', '#CBD2DD', '#A6AFBF'];
      [[0, 0.3, 0.5], [0.28, 0.26, 0.62], [0.52, 0.3, 0.46], [0.8, 0.22, 0.56]].forEach(([u, w, h], k) => { const x = fx + fw * u, bw = fw * w, bh = fh * h; ctx.fillStyle = cols[k % 3]; ctx.fillRect(x, bas - bh, bw, bh); ctx.fillStyle = '#6B7280'; ctx.beginPath(); ctx.moveTo(x - 2, bas - bh); ctx.lineTo(x + bw * 0.15, bas - bh - 7); ctx.lineTo(x + bw * 0.85, bas - bh - 7); ctx.lineTo(x + bw + 2, bas - bh); ctx.fill(); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const lit = nuit && ((r * 3 + c + k) % 3 !== 0); ctx.fillStyle = lit ? '#FFE49A' : nuit ? '#1F2430' : '#EEF2F7'; ctx.fillRect(x + 3 + c * (bw - 6) / 3, bas - bh + 6 + r * (bh - 10) / 3, (bw - 6) / 3 - 3, (bh - 10) / 3 - 4); } });
      ctx.strokeStyle = nuit ? '#D8C08A' : '#6B7280'; ctx.lineWidth = 1.6; const tx = fx + fw * 0.9, th = fh * 0.62; ctx.beginPath(); ctx.moveTo(tx - 7, bas); ctx.quadraticCurveTo(tx - 1, bas - th * 0.6, tx, bas - th); ctx.quadraticCurveTo(tx + 1, bas - th * 0.6, tx + 7, bas); ctx.moveTo(tx - 4, bas - th * 0.45); ctx.lineTo(tx + 4, bas - th * 0.45); ctx.stroke();
    } else if (v === 'mer') {
      const hz = fy + fh * 0.55; const g = ctx.createLinearGradient(0, hz, 0, bas); g.addColorStop(0, nuit ? '#2B4C7E' : '#3A86C8'); g.addColorStop(1, nuit ? '#1E3558' : '#5FB2E6'); ctx.fillStyle = g; ctx.fillRect(fx, hz, fw, bas - hz);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let x = 0; x <= fw; x += 4) ctx.lineTo(fx + x, hz + 8 + k * 9 + Math.sin(x * 0.25 + t * 2 + k) * 1.5); ctx.stroke(); }
      const bx = fx + fw * (0.5 + 0.3 * Math.sin(t * 0.15)); ctx.fillStyle = '#8B5A3C'; ctx.beginPath(); ctx.moveTo(bx - 9, hz + 3); ctx.lineTo(bx + 9, hz + 3); ctx.lineTo(bx + 6, hz + 8); ctx.lineTo(bx - 6, hz + 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(bx, hz + 2); ctx.lineTo(bx, hz - 12); ctx.lineTo(bx + 8, hz + 2); ctx.fill();
      ctx.strokeStyle = nuit ? '#D0D8E0' : '#5B6770'; ctx.lineWidth = 1.4; const gx = fx + fw * (0.35 + 0.1 * Math.sin(t * 0.5)), gy = fy + fh * 0.3 + Math.sin(t * 1.3) * 3; ctx.beginPath(); ctx.moveTo(gx - 6, gy); ctx.quadraticCurveTo(gx - 3, gy - 4, gx, gy); ctx.quadraticCurveTo(gx + 3, gy - 4, gx + 6, gy); ctx.stroke();
      ctx.fillStyle = nuit ? '#C9B98F' : '#F2DFB5'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.2, bas + 2, fw * 0.3, fh * 0.1, 0, 0, TAU); ctx.fill();
    } else if (v === 'montagne') {
      for (const [u, w, h, col] of [[0.3, 0.55, 0.78, nuit ? '#5B6A8A' : '#9CA8C4'], [0.75, 0.6, 0.62, nuit ? '#4A5878' : '#8792B0']]) { const px = fx + fw * u, pw = fw * w, ph = fh * h; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px - pw / 2, bas); ctx.lineTo(px, bas - ph); ctx.lineTo(px + pw / 2, bas); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(px - pw * 0.14, bas - ph * 0.72); ctx.lineTo(px, bas - ph); ctx.lineTo(px + pw * 0.14, bas - ph * 0.72); ctx.lineTo(px + pw * 0.06, bas - ph * 0.66); ctx.lineTo(px - pw * 0.06, bas - ph * 0.66); ctx.fill(); }
      ctx.fillStyle = nuit ? '#1F3A2C' : '#2F6B4F'; for (const u of [0.1, 0.22, 0.6, 0.9]) { const px = fx + fw * u; ctx.beginPath(); ctx.moveTo(px - 7, bas); ctx.lineTo(px, bas - fh * 0.26); ctx.lineTo(px + 7, bas); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.5, bas + 4, fw * 0.6, fh * 0.08, 0, 0, TAU); ctx.fill();
    } else { // la grande ville
      const cols = nuit ? ['#20222F', '#2B2E3F', '#181A26'] : ['#8A93A8', '#A3ABBF', '#737C92'];
      [[0, 0.2, 0.7], [0.18, 0.16, 0.92], [0.34, 0.22, 0.6], [0.56, 0.18, 0.84], [0.74, 0.26, 0.66]].forEach(([u, w, h], k) => { const x = fx + fw * u, bw = fw * w, bh = fh * h; ctx.fillStyle = cols[k % 3]; ctx.fillRect(x, bas - bh, bw, bh); for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) { const lit = (nuit || sk.phase === 'soir') && ((r * 2 + c + k) % 3 !== 0); ctx.fillStyle = lit ? (c ? '#FFE49A' : '#9BD0FF') : nuit ? '#0F1118' : '#D9DEE8'; ctx.fillRect(x + 3 + c * (bw - 6) / 2, bas - bh + 5 + r * (bh - 8) / 6, (bw - 6) / 2 - 2.5, (bh - 8) / 6 - 3); } });
      ctx.fillStyle = Math.sin(t * 4) > -0.2 ? '#FF6B8B' : '#B14A5F'; rr(fx + fw * 0.36, bas - fh * 0.5, fw * 0.18, 6, 2); ctx.fill();
    }
  }
  function passant(p, y) {
    const s = p.s; ctx.fillStyle = p.col; ctx.globalAlpha = 0.85;
    rr(p.x - 5 * s, y - 22 * s, 10 * s, 16 * s, 4 * s); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, y - 27 * s, 5 * s, 0, TAU); ctx.fill();
    const j = Math.sin(p.phase) * 3 * s; ctx.fillRect(p.x - 4 * s + j, y - 7 * s, 3 * s, 7 * s); ctx.fillRect(p.x + 1 * s - j, y - 7 * s, 3 * s, 7 * s);
    ctx.globalAlpha = 1;
  }
  // ─── le mobilier ───
  function etagere(x, y, w, n, patisseries) {
    for (let r = 0; r < 2; r++) {
      const yy = y + r * 26;
      ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x + 2, yy + 17, w, 5, 2); ctx.fill();
      ctx.fillStyle = Q.bois; rr(x, yy + 14, w, 5, 2); ctx.fill();
      for (let i = 0; i < Math.min(5, n - r * 5); i++) {
        const px = x + 8 + i * (w / 5), pw = w / 5 - 12;
        if (r === 1 && i % 2) { ctx.fillStyle = '#D99A4E'; ctx.beginPath(); ctx.ellipse(px + pw / 2, yy + 7, pw / 2, 7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#A8621F'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + pw * 0.3, yy + 5); ctx.lineTo(px + pw * 0.7, yy + 5); ctx.stroke(); continue; } // une miche
        ctx.fillStyle = i % 2 ? '#E8B46A' : '#D99A4E'; rr(px, yy, pw, 13, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(px + 3, yy + 2, pw - 8, 3, 2); ctx.fill();
        ctx.strokeStyle = '#A8621F'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 6, yy + 3); ctx.lineTo(px + 10, yy + 9); ctx.moveTo(px + 14, yy + 3); ctx.lineTo(px + 18, yy + 9); ctx.stroke();
      }
    }
    if (patisseries) { // une troisième étagère de boîtes à gâteaux, quand le mille-feuille est là
      const yy = y + 52; ctx.fillStyle = Q.bois; rr(x, yy + 14, w * 0.6, 5, 2); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#FFE1EA', '#E7D4FF', '#FFF3C4'][i]; rr(x + 6 + i * 26, yy + 2, 20, 12, 3); ctx.fill(); ctx.strokeStyle = PASTEL[i]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 16 + i * 26, yy + 2); ctx.lineTo(x + 16 + i * 26, yy + 14); ctx.stroke(); }
    }
  }
  function four(x, y, w, h, chaud) {
    ctx.fillStyle = 'rgba(0,0,0,.10)'; rr(x + 3, y + 4, w, h, 10); ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w, y); g.addColorStop(0, '#7A655C'); g.addColorStop(1, '#5C4A43'); ctx.fillStyle = g; rr(x, y, w, h, 10); ctx.fill();
    rr(x + 6, y + 8, w - 12, h * 0.45, 8); ctx.fillStyle = '#3B2F2A'; ctx.fill();
    if (chaud) { const f = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 3.1); const gg = ctx.createRadialGradient(x + w / 2, y + h * 0.3, 2, x + w / 2, y + h * 0.3, w * 0.5); gg.addColorStop(0, `rgba(255,220,120,${f})`); gg.addColorStop(0.6, `rgba(255,140,60,${f * 0.9})`); gg.addColorStop(1, 'rgba(200,70,30,.6)'); ctx.fillStyle = gg; rr(x + 8, y + 10, w - 16, h * 0.41, 7); ctx.fill(); ctx.fillStyle = '#E8B46A'; rr(x + 14, y + h * 0.3, w - 28, 8, 4); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x + 16, y + h * 0.31, w - 36, 2, 1); ctx.fill(); }
    else { ctx.fillStyle = '#6B5950'; rr(x + 8, y + 10, w - 16, h * 0.41, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; rr(x + 9, y + 11, w - 18, 4, 2); ctx.fill();
    ctx.fillStyle = '#C9B8AE'; rr(x + 8, y + h * 0.56, w - 16, 4, 2); ctx.fill();
    ctx.fillStyle = '#D9CCC2'; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.78, 4, 0, TAU); ctx.arc(x + w * 0.7, y + h * 0.78, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8C7A72'; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.78, 1.5, 0, TAU); ctx.arc(x + w * 0.7, y + h * 0.78, 1.5, 0, TAU); ctx.fill();
  }
  function comptoir(x, cy, w, ch, st) {
    ombre(x + w / 2, cy + ch + 4, w / 2, 6, 0.16);
    const g = ctx.createLinearGradient(0, cy, 0, cy + ch); g.addColorStop(0, Q.comptoir); g.addColorStop(1, Q.vue === 'ville' ? '#1E1B24' : Q.comptoir); ctx.fillStyle = g; rr(x, cy, w, ch, 10); ctx.fill();
    if (Q.solStyle === 'planches' || Q.vue === 'montagne') { ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 6, cy + 20 + k * (ch - 30) / 4); ctx.lineTo(x + w - 6, cy + 20 + k * (ch - 30) / 4); ctx.stroke(); } }
    rr(x, cy, w, 14, 7); ctx.fillStyle = Q.comptoir2; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x + 6, cy + 3, w - 12, 3, 2); ctx.fill();
    const vx = x + w * 0.06, vy = cy + 20, vw = w * 0.88, vh = ch - 34;
    rr(vx, vy, vw, vh, 8); const gv = ctx.createLinearGradient(vx, vy, vx + vw, vy + vh); gv.addColorStop(0, 'rgba(230,246,255,.85)'); gv.addColorStop(1, 'rgba(205,232,250,.7)'); ctx.fillStyle = gv; ctx.fill(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
    vitrine(st, vx, vy, vw, vh);
    ctx.save(); rr(vx, vy, vw, vh, 8); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(vx + vw * 0.12, vy + vh + 4); ctx.lineTo(vx + vw * 0.3, vy - 4); ctx.moveTo(vx + vw * 0.36, vy + vh + 4); ctx.lineTo(vx + vw * 0.44, vy - 4); ctx.stroke(); ctx.restore(); // reflets du verre
  }
  function vitrine(st, x, y, w, h) {
    const ouverts = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0);
    const n = Math.max(1, ouverts.length), cw = w / Math.max(3, n), s = Math.min(h - 6, cw - 6);
    ouverts.forEach((i, k) => { const px = x + 4 + k * cw + (cw - s) / 2, py = y + (h - s) / 2; ctx.fillStyle = 'rgba(255,255,255,.7)'; rr(px - 2, py + s - 4, s + 4, 4, 2); ctx.fill(); patisserie(i, px, py, s, s); });
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

  // ─── le boulanger : sa toque, son foulard, sa moustache, son col changent avec son titre ───
  function boulanger(x, y) {
    const peau = '#FFD7B5', resp = 1 + Math.sin(t * 1.6) * 0.012;
    ombre(x, y + 2, 26, 5, 0.14);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, resp); ctx.translate(-x, -y);
    ctx.fillStyle = '#fff'; rr(x - 22, y - 44, 44, 44, 14); ctx.fill();
    ctx.fillStyle = '#FF6B8B'; rr(x - 10, y - 44, 20, 26, 6); ctx.fill();
    if (rang >= 4) { ctx.fillStyle = '#FFC84A'; rr(x - 22, y - 8, 44, 5, 2); ctx.fill(); } // le maître : liseré doré au tablier
    if (rang >= 5) { ctx.fillStyle = '#2B5BD7'; rr(x - 22, y - 44, 14, 8, 3); ctx.fill(); ctx.fillStyle = '#fff'; rr(x - 7, y - 44, 14, 8, 3); ctx.fill(); ctx.fillStyle = '#E1496C'; rr(x + 8, y - 44, 14, 8, 3); ctx.fill(); } // le col bleu-blanc-rouge du MOF
    if (rang >= 3) { ctx.fillStyle = '#E1496C'; rr(x - 14, y - 46, 28, 7, 3); ctx.fill(); } // le compagnon : foulard rouge
    // les bras : ils pétrissent quand on touche
    const a = hop * 10; ctx.strokeStyle = peau; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 20, y - 32); ctx.lineTo(x - 30 + a, y - 12 + a * 0.4); ctx.moveTo(x + 20, y - 32); ctx.lineTo(x + 30 - a, y - 12 + a * 0.4); ctx.stroke();
    ctx.fillStyle = peau; ctx.beginPath(); ctx.arc(x, y - 58, 16, 0, TAU); ctx.fill();
    const th = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5);
    ctx.fillStyle = '#fff'; rr(x - 17, y - 64 - th, 34, th, rang === 0 ? 5 : 10); ctx.fill(); rr(x - 19, y - 68, 38, 7, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.06)'; rr(x + 8, y - 64 - th, 9, th, 4); ctx.fill();
    if (rang >= 4) { ctx.fillStyle = '#FFC84A'; rr(x - 19, y - 68, 38, 3, 2); ctx.fill(); } // bande dorée
    ctx.fillStyle = L;
    if (blink > 3.2) { ctx.fillRect(x - 8, y - 60, 5, 2); ctx.fillRect(x + 3, y - 60, 5, 2); }
    else { ctx.beginPath(); ctx.arc(x - 6, y - 60, 2, 0, TAU); ctx.arc(x + 6, y - 60, 2, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y - 55, 6, 0.2, Math.PI - 0.2); ctx.stroke();
    if (rang >= 3) { ctx.strokeStyle = '#8C5A3C'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 7, y - 53); ctx.quadraticCurveTo(x - 3, y - 56, x, y - 53); ctx.quadraticCurveTo(x + 3, y - 56, x + 7, y - 53); ctx.stroke(); } // moustache
    ctx.fillStyle = '#FFB3B3'; ctx.beginPath(); ctx.arc(x - 11, y - 54, 2.5, 0, TAU); ctx.arc(x + 11, y - 54, 2.5, 0, TAU); ctx.fill();
    if (rush) { ctx.fillStyle = '#9BD0FF'; ctx.beginPath(); ctx.arc(x + 19, y - 66, 2.2, 0, TAU); ctx.fill(); } // une goutte de sueur pendant le coup de feu
    ctx.restore();
    if (pts > 0) { // un point de talent à dépenser : une bulle au-dessus de la toque
      const th2 = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5), by = y - 78 - th2 + Math.sin(t * 3) * 2;
      ctx.fillStyle = '#fff'; rr(x + 10, by - 12, 26, 20, 8); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 14, by + 7); ctx.lineTo(x + 10, by + 14); ctx.lineTo(x + 20, by + 8); ctx.fill();
      ctx.fillStyle = '#9A84F0'; etincelle(x + 23, by - 2, 7);
    }
  }
  // ─── les clients : silhouettes variées, démarche, lunettes, bonnets l'hiver, sac au départ ───
  function client(c) {
    const x = c.x, y = c.y, s = c.taille, marche = c.etat !== 'attend', bob = marche ? Math.abs(Math.sin(c.phase)) * 3 : 0;
    ombre(x, y + 1, 14 * s, 3.5 * s, 0.14);
    ctx.save(); ctx.translate(x, y - bob); ctx.scale(s, s);
    if (c.or && !c.pris && c.etat === 'attend') { // halo et étincelles du client mystère
      ctx.fillStyle = 'rgba(255,200,74,.28)'; ctx.beginPath(); ctx.ellipse(0, -30, 30, 44, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FFC84A'; for (let k = 0; k < 4; k++) { const a = t * 2 + k * 1.6, px = Math.cos(a) * 26, py = -30 + Math.sin(a * 1.3) * 34; etincelle(px, py, 4 + Math.sin(t * 6 + k) * 1.5); }
    }
    const j = marche ? Math.sin(c.phase) * 3 : 0;
    ctx.fillStyle = '#4A3328'; rr(-11 + j, -10, 9, 12, 3); ctx.fill(); rr(2 - j, -10, 9, 12, 3); ctx.fill();
    ctx.fillStyle = c.haut; rr(-13, -40, 26, 32, 10); ctx.fill();
    if (Q.vue === 'mer' && c.haut === '#FFFFFF') { ctx.fillStyle = '#3A86C8'; for (let k = 0; k < 4; k++) ctx.fillRect(-13, -38 + k * 7, 26, 2.5); } // marinière
    ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(-13, -14, 26, 6, 4); ctx.fill();
    ctx.fillStyle = c.peau; ctx.beginPath(); ctx.arc(0, -52, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = c.cheveux;
    if (c.coiffure === 3) { ctx.fillStyle = c.bonnet; rr(-13, -66, 26, 14, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -67, 3.5, 0, TAU); ctx.fill(); ctx.fillStyle = c.bonnet; rr(-14, -56, 28, 5, 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, -56, 13, Math.PI, TAU); ctx.fill(); if (c.coiffure === 1) { rr(-14, -58, 6, 16, 3); ctx.fill(); rr(8, -58, 6, 16, 3); ctx.fill(); } if (c.coiffure === 2) { ctx.beginPath(); ctx.arc(0, -68, 5, 0, TAU); ctx.fill(); } }
    if (c.or) { ctx.fillStyle = '#4A3328'; rr(-15, -58, 30, 5, 2); ctx.fill(); rr(-9, -72, 18, 15, 3); ctx.fill(); } // chapeau
    ctx.fillStyle = L; ctx.beginPath(); ctx.arc(-5, -52, 1.8, 0, TAU); ctx.arc(5, -52, 1.8, 0, TAU); ctx.fill();
    if (c.lunettes) { ctx.strokeStyle = L; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-5, -52, 4, 0, TAU); ctx.moveTo(9, -52); ctx.arc(5, -52, 4, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = L; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -49, 4, 0.3, Math.PI - 0.3); ctx.stroke();
    if (c.sac) { ctx.fillStyle = c.sacCol; rr(12, -28, 14, 18, 3); ctx.fill(); ctx.strokeStyle = Q.bois; ctx.lineWidth = 1.5; ctx.strokeRect(12, -28, 14, 18); ctx.fillStyle = '#E8B46A'; rr(15, -34, 8, 8, 3); ctx.fill(); }
    ctx.restore();
    if (c.hab) { // l'étiquette de l'habitué
      ctx.font = '700 10px Nunito, sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(c.nom).width + 12, ty = y - bob - 82 * s;
      ctx.fillStyle = '#fff'; rr(x - w / 2, ty - 8, w, 15, 7); ctx.fill(); ctx.fillStyle = L; ctx.fillText(c.nom, x, ty + 3);
    }
  }
  function etincelle(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); }
  // ─── petits décors ───
  function plante(x, y) { ctx.fillStyle = Q.comptoir; rr(x - 10, y, 20, 16, 5); ctx.fill(); ctx.fillStyle = '#5FD3A4'; for (const [ox, oy, r] of [[0, -8, 9], [-9, -2, 7], [9, -2, 7], [0, -18, 7]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, TAU); ctx.fill(); } ctx.fillStyle = '#3FB889'; ctx.beginPath(); ctx.arc(x - 4, y - 12, 3, 0, TAU); ctx.fill(); }
  function lampe(x, y, nuit) { ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke(); ctx.fillStyle = Q.accent; ctx.beginPath(); ctx.moveTo(x - 16, y + 40); ctx.lineTo(x + 16, y + 40); ctx.lineTo(x + 8, y + 22); ctx.lineTo(x - 8, y + 22); ctx.closePath(); ctx.fill(); ctx.fillStyle = nuit ? 'rgba(255,230,150,.6)' : 'rgba(255,230,150,.3)'; ctx.beginPath(); ctx.arc(x, y + 46, nuit ? 20 : 14, 0, TAU); ctx.fill(); }
  function cadre(x, y) { ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x - 14, y + 2, 32, 26, 4); ctx.fill(); ctx.fillStyle = '#fff'; rr(x - 16, y, 32, 26, 4); ctx.fill(); ctx.strokeStyle = Q.bois; ctx.lineWidth = 3; ctx.strokeRect(x - 16, y, 32, 26); ctx.fillStyle = '#9ED8FF'; ctx.fillRect(x - 12, y + 4, 24, 12); ctx.fillStyle = '#5FD3A4'; ctx.beginPath(); ctx.moveTo(x - 12, y + 22); ctx.lineTo(x - 2, y + 10); ctx.lineTo(x + 6, y + 18); ctx.lineTo(x + 12, y + 12); ctx.lineTo(x + 12, y + 22); ctx.closePath(); ctx.fill(); }
  function horloge(x, y, d) {
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.arc(x + 1, y + 2, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill(); ctx.strokeStyle = Q.bois; ctx.lineWidth = 2.5; ctx.stroke();
    const h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * TAU - Math.PI / 2, m = d.getMinutes() / 60 * TAU - Math.PI / 2;
    ctx.strokeStyle = L; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(h) * 5, y + Math.sin(h) * 5); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(m) * 7.5, y + Math.sin(m) * 7.5); ctx.stroke();
    ctx.fillStyle = '#E1496C'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
  }
  function diplome(x, y) { ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x - 9, y + 2, 22, 28, 3); ctx.fill(); ctx.fillStyle = Q.bois; rr(x - 11, y, 22, 28, 3); ctx.fill(); ctx.fillStyle = '#FFFDF5'; rr(x - 8, y + 3, 16, 22, 2); ctx.fill(); ctx.strokeStyle = '#B5A49A'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - 5, y + 8 + k * 4); ctx.lineTo(x + 5, y + 8 + k * 4); } ctx.stroke(); ctx.fillStyle = '#E1496C'; ctx.beginPath(); ctx.arc(x + 3, y + 20, 2.5, 0, TAU); ctx.fill(); }
  function guirlande(noel) { ctx.strokeStyle = Q.bois; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 22); ctx.quadraticCurveTo(W / 2, 50, W, 22); ctx.stroke(); for (let i = 0; i < 9; i++) { const u = (i + 0.5) / 9, x = u * W, y = 22 + 4 * (1 - Math.pow(2 * u - 1, 2)) * 7; if (noel) { ctx.fillStyle = Math.sin(t * 5 + i) > 0 ? ['#FF6B8B', '#5FD3A4', '#FFC84A', '#9BD0FF'][i % 4] : '#E8E0D5'; ctx.beginPath(); ctx.arc(x, y + 5, 3.5, 0, TAU); ctx.fill(); } else { ctx.fillStyle = PASTEL[i % PASTEL.length]; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 12); ctx.closePath(); ctx.fill(); } } }
  function fanions() { for (let i = 0; i < 12; i++) { const x = (i + 0.5) / 12 * W; ctx.fillStyle = ['#2B5BD7', '#FFFFFF', '#E1496C'][i % 3]; ctx.beginPath(); ctx.moveTo(x - 7, 24); ctx.lineTo(x + 7, 24); ctx.lineTo(x, 36); ctx.closePath(); ctx.fill(); } }
  function coeurs() { ctx.fillStyle = '#FF6B8B'; for (let i = 0; i < 6; i++) { const x = W * 0.5 + (i - 2.5) * 22, y = 32 + Math.sin(t * 2 + i) * 2; ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.bezierCurveTo(x - 7, y - 2, x - 3, y - 7, x, y - 3); ctx.bezierCurveTo(x + 3, y - 7, x + 7, y - 2, x, y + 5); ctx.fill(); } }
  function ardoise(x, y) { ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08); ctx.fillStyle = Q.bois; rr(-15, -38, 30, 38, 3); ctx.fill(); ctx.fillStyle = '#2F3A36'; rr(-12, -35, 24, 30, 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-8, -29); ctx.lineTo(8, -29); ctx.moveTo(-8, -23); ctx.lineTo(5, -23); ctx.moveTo(-8, -17); ctx.lineTo(7, -17); ctx.stroke(); ctx.strokeStyle = '#FFD98A'; ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(3, -11); ctx.stroke(); ctx.restore(); }
  function paillasson(x, y) { ctx.fillStyle = Q.vue === 'ville' ? '#5A4A5E' : '#B9875A'; rr(x - 22, y - 4, 44, 9, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 18 + k * 10, y - 2, 6, 5); }
  function fleurs(x, y) { ctx.fillStyle = Q.comptoir2; rr(x - 6, y - 10, 12, 12, 3); ctx.fill(); ctx.strokeStyle = '#3FB889'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x - 4, y - 22); ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 24); ctx.moveTo(x, y - 10); ctx.lineTo(x + 4, y - 21); ctx.stroke(); for (const [ox, oy, col] of [[-4, -23, '#FF6B8B'], [0, -25, '#FFC84A'], [4, -22, '#B8A6FF']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + ox, y + oy, 3.2, 0, TAU); ctx.fill(); } }
  function chat(x, y) { const q = Math.sin(t * 3) * 3; ctx.fillStyle = '#F2A65A'; rr(x - 16, y - 12, 30, 12, 6); ctx.fill(); ctx.beginPath(); ctx.arc(x + 14, y - 12, 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 9, y - 16); ctx.lineTo(x + 11, y - 22); ctx.lineTo(x + 14, y - 17); ctx.moveTo(x + 15, y - 17); ctx.lineTo(x + 18, y - 22); ctx.lineTo(x + 19, y - 16); ctx.fill(); ctx.strokeStyle = '#F2A65A'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 16, y - 6); ctx.quadraticCurveTo(x - 26, y - 6 + q, x - 24, y - 16); ctx.stroke(); ctx.fillStyle = L; ctx.fillRect(x + 11, y - 13, 2, 1.5); ctx.fillRect(x + 16, y - 13, 2, 1.5); }
  function citrouille(x, y) { ctx.fillStyle = '#F28C28'; ctx.beginPath(); ctx.ellipse(x, y - 6, 10, 8, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#C96A14'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 4, y - 13); ctx.quadraticCurveTo(x - 6, y - 6, x - 4, y + 1); ctx.moveTo(x + 4, y - 13); ctx.quadraticCurveTo(x + 6, y - 6, x + 4, y + 1); ctx.stroke(); ctx.fillStyle = '#3FB889'; rr(x - 1.5, y - 17, 3, 5, 1); ctx.fill(); ctx.fillStyle = L; ctx.beginPath(); ctx.moveTo(x - 5, y - 8); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x - 3.5, y - 10.5); ctx.moveTo(x + 5, y - 8); ctx.lineTo(x + 2, y - 8); ctx.lineTo(x + 3.5, y - 10.5); ctx.fill(); ctx.fillRect(x - 4, y - 4, 8, 1.5); }
  function galette(x, y) { ctx.fillStyle = '#E8B46A'; ctx.beginPath(); ctx.ellipse(x, y - 4, 12, 5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#A8621F'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x + 8, y - 2); ctx.moveTo(x - 8, y - 2); ctx.lineTo(x + 8, y - 6); ctx.stroke(); ctx.fillStyle = '#FFC84A'; ctx.beginPath(); ctx.moveTo(x - 7, y - 8); for (let k = 0; k < 4; k++) { ctx.lineTo(x - 7 + k * 4.7, y - 15); ctx.lineTo(x - 5 + k * 4.7, y - 9); } ctx.lineTo(x + 7, y - 8); ctx.closePath(); ctx.fill(); }
  function oeufs(x, y) { ['#FF9FB2', '#9BD0FF', '#B5E88A'].forEach((col, k) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + k * 9, y - 5, 4, 5.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x + k * 9 - 3, y - 6, 6, 1.5); }); }
  function glaces(x, y) { for (let k = 0; k < 2; k++) { ctx.fillStyle = '#E8B46A'; ctx.beginPath(); ctx.moveTo(x + k * 10 - 4, y - 8); ctx.lineTo(x + k * 10 + 4, y - 8); ctx.lineTo(x + k * 10, y + 2); ctx.fill(); ctx.fillStyle = k ? '#FF9FB2' : '#9BE8C2'; ctx.beginPath(); ctx.arc(x + k * 10, y - 10, 4.5, 0, TAU); ctx.fill(); } }
  function sapin(x, y) { ctx.fillStyle = '#8B5A3C'; ctx.fillRect(x - 3, y - 6, 6, 8); ctx.fillStyle = '#2F6B4F'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 16 + k * 3, y - 6 - k * 12); ctx.lineTo(x, y - 24 - k * 12); ctx.lineTo(x + 16 - k * 3, y - 6 - k * 12); ctx.fill(); } for (let k = 0; k < 6; k++) { ctx.fillStyle = Math.sin(t * 4 + k) > 0 ? ['#FF6B8B', '#FFC84A', '#9BD0FF'][k % 3] : '#fff'; ctx.beginPath(); ctx.arc(x - 9 + (k * 7) % 18, y - 12 - k * 5, 2, 0, TAU); ctx.fill(); } ctx.fillStyle = '#FFC84A'; etincelle(x, y - 50, 4); }

  const API = { init, resize, frame, vente, texte, tap, fete, setRush, mystere, habitue, hit, hitBoulanger, forcer, surServi: null, get clients() { return clients.length; }, get mystereVisible() { return clients.some((c) => c.or && !c.pris && c.etat === 'attend'); } };
  return API;
})();
