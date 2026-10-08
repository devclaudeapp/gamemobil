/* LE FOURNIL — la boutique vue d'en haut (3/4 plongeante), en Canvas 2D : le fournil à gauche, le comptoir au milieu, le salon de thé à droite.
   Les apprentis font la navette four → comptoir avec leurs plateaux, les clients entrent par la porte, font la queue, sont servis et certains
   s'assoient aux tables. Le mobilier (tables, four, vitrine, caisse, chambre froide, décoration) change d'aspect cran par cran.
   Cinq quartiers, les saisons selon la date réelle, la lumière du jour et de la nuit, le boulanger et son titre, le client mystère, les habitués. */
const SCENE = (() => {
  'use strict';
  const G = GAME;
  let cv, ctx, W = 1, H = 1, DPR = 1, K = 1, LAY = null, miH = 0, visH = 1e9, amenager = false, dernier = null;
  const GRANDIT = 0.08; // sur un canvas haut, les personnages grandissent de 8 % au plus
  const TAU = Math.PI * 2;
  const clients = [], apprentis = [], textes = [], vapeurs = [], flocons = [], passants = [], ordre = [];
  let hop = 0, blink = 0, nextSpawn = 2, nextPassant = 5, t = 0, confetti = [], rush = false, rang = 0, pts = 0, affl = 0, Q = null, tags = [], force = {}, caisseFlash = 0;
  let crans = { tables: 0, four: 0, vitrine: 0, caisse: 0, froid: 0, deco: 0 }, abordables = {}, prixDe = {}, panneI = -1;
  const L = '#4A3328';
  const PASTEL = ['#FF9FB2', '#8FE3C2', '#C7B8FF', '#FFD98A', '#9BD0FF', '#FFB48A', '#B5E88A'];
  const PEAUX = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE3C9'];
  const CHEVEUX = ['#4A3328', '#2B2118', '#B8762E', '#E7C27A', '#8C8C8C', '#D9534F'];
  const PEAUX6 = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE3C9', '#5C3A21'], HAUTS6 = ['#FF6B8B', '#5FD3A4', '#B8A6FF', '#FFC84A', '#6CB8FF', '#FF9A62'];
  // les décors : murs, sol, comptoir, palette des clients, vue par la fenêtre
  const DECORS = {
    village: { mur: '#FFF1E3', mur2: '#FBE2CC', murStyle: 'lignes', sol: '#F3D9C0', sol2: 'rgba(255,255,255,.35)', solStyle: 'planches', comptoir: '#D9915C', comptoir2: '#F2B98A', bois: '#C8864F', accent: '#FF9FB2', hauts: PASTEL, vue: 'campagne' },
    paris: { mur: '#EEF1F6', mur2: '#D9E0EA', murStyle: 'moulures', sol: '#E9ECF1', sol2: '#2F3542', solStyle: 'damier', comptoir: '#6F7D8C', comptoir2: '#B9C6D2', bois: '#3D4654', accent: '#2B3A55', hauts: ['#2B3A55', '#C9B79C', '#8A2B3A', '#E4D8C8', '#4D6A8A', '#D9A066'], vue: 'paris' },
    mer: { mur: '#F4FBFF', mur2: '#D6EEF9', murStyle: 'bande', sol: '#EADFC9', sol2: 'rgba(255,255,255,.45)', solStyle: 'planches', comptoir: '#4F9FD1', comptoir2: '#A9D8F0', bois: '#DCE7EE', accent: '#3A86C8', hauts: ['#3A86C8', '#FFFFFF', '#F2C94C', '#FF8A80', '#8FD3F4', '#9BE8C2'], vue: 'mer' },
    montagne: { mur: '#EFDCC2', mur2: '#D8BE9A', murStyle: 'rondins', sol: '#B98A5E', sol2: 'rgba(0,0,0,.08)', solStyle: 'planches', comptoir: '#7A4E31', comptoir2: '#A86F48', bois: '#5A3A22', accent: '#A64B2A', hauts: ['#A64B2A', '#2F6B4F', '#E8D8B0', '#8C3B3B', '#4F6D8C', '#D98E4A'], vue: 'montagne' },
    ville: { mur: '#F6F2EF', mur2: '#E4DCD6', murStyle: 'marbre', sol: '#3A3642', sol2: 'rgba(255,255,255,.08)', solStyle: 'marbre', comptoir: '#2E2A36', comptoir2: '#C9A96A', bois: '#C9A96A', accent: '#FF6B8B', hauts: ['#1F1F2B', '#FF6B8B', '#C9A96A', '#F5F5F5', '#7B61FF', '#3EC9A7'], vue: 'ville' },
  };

  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); }
  // le bloc haut : mur, fournil, comptoir, file — le dessin de référence (390×228) à l'échelle ; le reste de la hauteur, c'est du sol en plus
  function hautBloc(w, h) { const kb = Math.min(1.1, Math.max(0.8, w / 390)); return 228 * kb * (1 + Math.min(GRANDIT, Math.max(0, h - 228 * kb) / 6000)); }
  function resize(width, height, mi) {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = width; H = height; if (mi) miH = mi;
    cv.style.height = H + 'px';
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    calculer();
  }
  // ─── le plan de la boutique : les x en fractions de la largeur, les y en fractions du bloc haut T ; le salon descend dans le sol disponible ───
  function calculer() {
    const T = hautBloc(W, H); K = T / 228;
    const sp = Math.max(0, Math.min(240 * K, H - T - 60)); // le salon s'étale dans le sol en plus (visible tiroir fermé)
    const sp1 = Math.max(0, Math.min(sp * 0.35, (miH || H) - 30 - (0.50 * T + 14 * K))); // la première rangée reste au-dessus du tiroir à mi-hauteur
    const murH = T * 0.33, y1 = T * 0.50 + sp1, y2 = Math.min(T * 0.78 + sp, y1 + 110 * K); // deux rangées, mais pas trop loin l'une de l'autre
    const anciennes = LAY && LAY.tables;
    const tables = [[0.80, y1], [0.93, y1], [0.80, y2], [0.93, y2]].map(([u, v]) => ({ x: W * u, y: v, sieges: [{ x: W * u - 19 * K, y: v + 4, dir: 1, occ: null }, { x: W * u + 19 * K, y: v + 4, dir: -1, occ: null }] }));
    if (anciennes) tables.forEach((tb, k) => tb.sieges.forEach((sg, j) => { const o = anciennes[k].sieges[j]; sg.occ = o.occ; if (o.occ) { o.occ.siege = sg; if (o.occ.etat === 'assis') { o.occ.x = sg.x; o.occ.y = sg.y; } } })); // un recalcul ne vide pas les chaises
    LAY = {
      T, murH, spread: sp,
      fenetre: { x: W * 0.04, y: T * 0.05, w: W * 0.24, h: T * 0.21 },
      etagere: { x: W * 0.73, y: T * 0.05, w: W * 0.12 },
      cadre: { x: W * 0.36, y: T * 0.20 }, horloge: { x: W * 0.52, y: T * 0.22 }, diplome: { x: W * 0.60, y: T * 0.19 }, cadre2: { x: W * 0.66, y: T * 0.20 },
      porte: { x: W * 0.86, y: T * 0.04, w: W * 0.11, h: murH - T * 0.04 },
      entree: { x: W * 0.915, y: murH }, paillasson: { x: W * 0.915, y: murH + 9 },
      deco: { x: W * 0.80, y: T * 0.36 }, plante: { x: W * 0.06, y: T * 0.60 + sp * 0.3 }, sapin: { x: W * 0.655, y: T * 0.42 },
      froid: { x: W * 0.005, y: T * 0.12, w: W * 0.085, h: T * 0.34 },
      four: { x: W * 0.11, y: T * 0.30, w: W * 0.18, h: T * 0.24 },
      plan: { x: W * 0.03, y: T * 0.80 + sp * 0.5, w: W * 0.19, h: T * 0.08 },
      presentoir: { x: W * 0.14, y: T * 0.80 + sp * 0.95, w: W * 0.16, h: T * 0.07 },
      comptoir: { x: W * 0.31, y: T * 0.50, w: W * 0.32, hTop: T * 0.06, hFace: T * 0.14 },
      caisse: { x: W * 0.61, y: T * 0.50 }, fleurs: { x: W * 0.34, y: T * 0.515 }, chat: { x: W * 0.40, y: T * 0.51 }, saison: { x: W * 0.55, y: T * 0.515 },
      boulanger: { x: W * 0.45, y: T * 0.53 },
      lanes: [0.57, 0.64, 0.71].map((f) => T * f), fourSlots: [0.16, 0.20, 0.24].map((f) => W * f), comptoirSlots: [0.255, 0.27, 0.285].map((f) => W * f),
      file: [0.61, 0.55, 0.49, 0.43].map((f) => ({ x: W * f, y: T * 0.76 })), debord: [{ x: W * 0.70, y: T * 0.66 }, { x: W * 0.70, y: T * 0.58 }],
      mystere: { x: W * 0.35, y: T * 0.78 }, allee: W * 0.70, alleeHaut: T * 0.40,
      tables, textes: { x: W * 0.50, y: T * 0.60 }, ardoise: { x: W * 0.28, y: T * 0.97 + sp * 0.5 },
      tapis: { x: W * 0.80 - 32 * K, y: y1 - 24 * K, w: W - (W * 0.80 - 32 * K) - 4, h: y2 - y1 + 36 * K },
      utile: y2 + 40 * K,
    };
  }
  function visible(y) { visH = y; }                     // la hauteur de scène que le tiroir laisse voir
  function rendu() { if (dernier) { const v = visH; visH = 1e9; draw(dernier.st, dernier.hour, dernier.taux, dernier.d); visH = v; } } // un dessin complet, pour le partage et les captures
  const hauteurUtile = () => (LAY ? Math.min(H, LAY.utile) : H);
  function setAmenager(on) { amenager = !!on; }
  function forcer(o) { force = o || {}; } // pour les captures et les tests : heure, saison, clients qui s'assoient toujours
  function ciel(hour) {
    if (hour < 6 || hour >= 21) return { haut: '#3E4C8F', bas: '#8A7CC7', nuit: true, phase: 'nuit' };
    if (hour < 8) return { haut: '#FFC2A8', bas: '#FFE8B8', nuit: false, phase: 'aube' };
    if (hour < 18) return { haut: '#9ED8FF', bas: '#DDF3FF', nuit: false, phase: 'jour' };
    if (hour < 20) return { haut: '#FFB37A', bas: '#FFE1B0', nuit: false, phase: 'soir' };
    return { haut: '#7C6BB8', bas: '#F0A7A0', nuit: false, phase: 'crepuscule' };
  }

  // ─── événements venus du jeu ───
  function vente(i, montant, texte, main) {
    if (!LAY) return;
    textes.push({ x: LAY.textes.x + (Math.random() - 0.5) * W * 0.12, y: LAY.textes.y, txt: texte, life: 1, col: '#3FB889' });
    for (let k = 0; k < (main ? 1 + affl : 1); k++) if (enFile() < (rush ? 8 : 5) + affl && (k > 0 || Math.random() < 0.6)) spawn(); // le bouche-à-oreille amène du monde
    hop = 1; caisseFlash = 0.5;
    if (textes.length > 6) textes.shift();
  }
  function texte(txt, col) { if (LAY) textes.push({ x: W * 0.5, y: LAY.T * 0.46, txt, life: 1.4, col: col || '#E0A61E' }); }
  function tap() { hop = 1; if (LAY) for (let i = 0; i < 3; i++) vapeurs.push({ x: LAY.four.x + LAY.four.w / 2 + (Math.random() - 0.5) * 16, y: LAY.four.y + 4, r: 4 + Math.random() * 4, life: 1 }); }
  function fete() { for (let i = 0; i < 40; i++) confetti.push({ x: Math.random() * W, y: -10 - Math.random() * 40, vx: (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 60, c: PASTEL[i % PASTEL.length], a: Math.random() * TAU, life: 1 }); }
  function setRush(on) { rush = on; if (on && LAY) for (let k = 0; k < 3; k++) spawn(); }
  const enFile = () => { let n = 0; for (const c of clients) if (c.etat !== 'assis' && c.etat !== 'vaTable') n++; return n; };
  function placeLibre() { const pris = clients.filter((c) => c.slot >= 0 && (c.etat === 'entre' || c.etat === 'attend')).map((c) => c.slot); for (let k = 0; k < 6; k++) if (!pris.includes(k)) return k; return 6 + pris.length; }
  const spotDe = (slot) => (slot < 0 ? LAY.mystere : slot < 4 ? LAY.file[slot] : LAY.debord[Math.min(1, slot - 4)]);
  function cheminVers(spot) { const e = LAY.entree; return [{ x: e.x, y: LAY.alleeHaut }, { x: LAY.allee, y: LAY.alleeHaut }, { x: LAY.allee, y: spot.y }, { x: spot.x, y: spot.y }]; }
  function cheminSortie(depuis) { const e = LAY.entree; return [{ x: LAY.allee, y: depuis.y }, { x: LAY.allee, y: LAY.alleeHaut }, { x: e.x, y: LAY.alleeHaut }, { x: e.x, y: e.y }]; }
  function spawn(or) {
    const hauts = (Q && Q.hauts) || PASTEL, hiver = tags.includes('neige') || (Q && Q.vue === 'montagne'), slot = or ? -1 : placeLibre(), spot = spotDe(slot);
    const c = { x: LAY.entree.x, y: LAY.entree.y, etat: 'entre', slot, spot, chemin: cheminVers(spot), wp: 0, v: (or ? 120 : 85 + Math.random() * 15) * K, dir: 0, alpha: 0,
      wait: or ? 8 : 1.2 + Math.random() * 1.5, haut: or ? '#FFC84A' : hauts[Math.floor(Math.random() * hauts.length)],
      peau: PEAUX[Math.floor(Math.random() * PEAUX.length)], cheveux: or ? '#E0A61E' : CHEVEUX[Math.floor(Math.random() * CHEVEUX.length)], taille: or ? 1.15 : 0.9 + Math.random() * 0.2, sac: false, phase: Math.random() * TAU,
      coiffure: or ? 0 : hiver && Math.random() < 0.5 ? 3 : Math.floor(Math.random() * 3), lunettes: !or && Math.random() < 0.2, bonnet: hauts[Math.floor(Math.random() * hauts.length)], sacCol: Math.random() < 0.5 ? '#F2D7B6' : '#E8C7A8',
      or: !!or, pris: false, siege: null, mange: 0 };
    clients.push(c);
    return c;
  }
  // le client mystère : doré, il attend 8 s devant le comptoir ; touché, il laisse un pourboire
  function mystere() { if (!LAY || clients.some((c) => c.or)) return false; spawn(true); return true; }
  // un habitué : silhouette fixe, étiquette avec son prénom, il reste un peu plus longtemps et s'installe volontiers
  function habitue(hb) { if (!LAY || !hb || clients.some((c) => c.hab === hb.id)) return false; const c = spawn(); c.hab = hb.id; c.nom = hb.nom; c.haut = hb.haut; c.cheveux = hb.cheveux; c.peau = hb.peau; c.coiffure = hb.coiffure; c.lunettes = hb.id === 'dupuis'; c.taille = 1.05; c.wait = 3; return true; }
  function hitBoulanger(x, y) { if (!LAY) return false; const b = LAY.boulanger; return Math.abs(x - b.x) < 26 * K && y > b.y - 64 * K && y < b.y + 4; }
  function hit(x, y) {
    for (const c of clients) {
      if (!c.or || c.pris || c.etat !== 'attend') continue;
      if (Math.abs(x - c.x) < 24 * K * c.taille && y > c.y - 52 * K * c.taille && y < c.y + 8) { c.pris = true; c.wait = 0.2; return true; }
    }
    return false;
  }
  // les zones de touche des meubles (en pixels), pour la main du joueur et pour les tests
  function zones() {
    if (!LAY) return {};
    const b = LAY.boulanger, f = LAY.four, fr = LAY.froid, c = LAY.comptoir, k = crans.tables, T = LAY.tables, cz = LAY.caisse, dz = LAY.deco, m = LAY.mystere;
    const tx = T[0].x - 24 * K, ty = T[0].y - 16 * K;
    return {
      boulanger: { x: b.x - 26 * K, y: b.y - 64 * K, w: 52 * K, h: 68 * K },
      four: { x: f.x, y: f.y, w: f.w, h: f.h }, froid: { x: 0, y: fr.y, w: Math.max(44, fr.x + fr.w), h: fr.h },
      vitrine: { x: c.x, y: c.y + c.hTop, w: c.w * 0.75, h: c.hFace + 4 },
      caisse: { x: cz.x - 22, y: cz.y - 22, w: 44, h: 44 }, deco: { x: dz.x - 22, y: dz.y - 22, w: 44, h: 44 },
      tables: { x: tx, y: ty, w: (k >= 2 ? W - tx : 48 * K), h: (k >= 3 ? T[2].y + 14 * K - ty : 44 * K) },
      mystere: { x: m.x - 22, y: m.y - 50, w: 44, h: 58 }, entree: { x: LAY.entree.x, y: LAY.entree.y, w: 0, h: 0 },
    };
  }
  function hitMeuble(x, y) {
    const z = zones(); const dans = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    for (const id of ['caisse', 'deco', 'four', 'froid', 'vitrine', 'tables']) if (z[id] && dans(z[id])) return id;
    return null;
  }

  // ─── la vie de la boutique ───
  function siegeLibre() { for (let k = 0; k < crans.tables; k++) for (const s of LAY.tables[k].sieges) if (!s.occ) return s; return null; }
  function avancer(c, dt) { // suit son chemin ; rend true à l'arrivée
    const p = c.chemin[c.wp]; if (!p) return true;
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), pas = c.v * dt * (rush ? 1.3 : 1);
    c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy < 0 ? 2 : 0);
    if (d <= pas) { c.x = p.x; c.y = p.y; c.wp++; return c.wp >= c.chemin.length; }
    c.x += dx / d * pas; c.y += dy / d * pas; return false;
  }
  function servi(st, c) { // au comptoir : le client est compté, l'habitué noté — exactement comme avant
    c.sac = !c.or || c.pris;
    st.stats.clients++; G.noter(st, 'clients', 1);
    if (c.hab) { const r = G.servirHabitue(st, c.hab); if (r.ok && API.surServi) API.surServi(r); }
    const slotLibre = c.slot; c.slot = -2;
    if (slotLibre >= 0) for (const o of clients) if (o.slot > slotLibre && o.slot < 6 && (o.etat === 'entre' || o.etat === 'attend')) { o.slot--; o.spot = spotDe(o.slot); if (o.etat === 'attend') { o.glisse = true; } else { o.chemin[o.chemin.length - 1] = { x: o.spot.x, y: o.spot.y }; o.chemin[o.chemin.length - 2] = { x: LAY.allee, y: o.spot.y }; } }
    const siege = !c.or ? siegeLibre() : null;
    if (siege && (force.assis || c.hab || Math.random() < 0.45 + 0.1 * crans.tables)) {
      c.siege = siege; siege.occ = c; c.chemin = [{ x: LAY.allee, y: c.y }, { x: LAY.allee, y: siege.y + 8 }, { x: siege.x, y: siege.y }]; c.wp = 0; c.etat = 'vaTable';
    } else { c.chemin = cheminSortie(c); c.wp = 0; c.etat = 'sort'; c.v = 100 * K; }
  }
  function majClients(st, dt) {
    for (const c of clients) {
      c.phase += dt * 9;
      if (c.alpha < 1) c.alpha = Math.min(1, c.alpha + dt * 3);
      if (c.etat === 'entre') { if (avancer(c, dt)) { c.etat = 'attend'; c.dir = 0; } }
      else if (c.etat === 'attend') {
        if (c.glisse) { const dx = c.spot.x - c.x; if (Math.abs(dx) < 1) { c.x = c.spot.x; c.glisse = false; } else c.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt); }
        c.wait -= dt; if (c.wait <= 0) servi(st, c);
      }
      else if (c.etat === 'vaTable') { if (avancer(c, dt)) { c.etat = 'assis'; c.dir = c.siege.dir; c.mange = (4 + Math.random() * 4) * (rush ? 0.6 : 1); } }
      else if (c.etat === 'assis') {
        c.mange -= dt;
        const tableDisparue = LAY.tables.findIndex((tb) => tb.sieges.includes(c.siege)) >= crans.tables;
        if (c.mange <= 0 || tableDisparue) { c.siege.occ = null; c.chemin = [{ x: LAY.allee, y: c.siege.y + 8 }, { x: LAY.allee, y: LAY.alleeHaut }, { x: LAY.entree.x, y: LAY.alleeHaut }, { x: LAY.entree.x, y: LAY.entree.y }]; c.wp = 0; c.siege = null; c.etat = 'sort'; c.v = 100 * K; }
      }
      else if (c.etat === 'sort') { if (c.wp >= c.chemin.length - 1) c.alpha = Math.max(0, c.alpha - dt * 3); if (avancer(c, dt)) c.etat = 'parti'; }
    }
    for (let i = clients.length - 1; i >= 0; i--) if (clients[i].etat === 'parti') clients.splice(i, 1);
  }
  const tCuisson = (st, i) => Math.min(6, Math.max(1.5, G.temps(st, i) * 0.6)) * (rush ? 0.6 : 1);
  function majApprentis(st, dt) {
    const nVis = LAY.T < 190 ? 2 : 3, staffes = [];
    st.stations.forEach((s, i) => { if (s.staff && s.niv > 0 && staffes.length < nVis) staffes.push(i); });
    for (let k = apprentis.length - 1; k >= 0; k--) if (!staffes.includes(apprentis[k].i)) apprentis.splice(k, 1);
    staffes.forEach((i) => { if (!apprentis.some((a) => a.i === i)) { const lane = [0, 1, 2].find((l) => !apprentis.some((a) => a.lane === l)); apprentis.push({ i, lane, x: LAY.fourSlots[lane], y: LAY.lanes[lane], etat: 'four', t: tCuisson(st, i), plateau: false, dir: 1, phase: Math.random() * TAU }); } });
    for (const a of apprentis) {
      a.phase += dt * 9;
      const v = 70 * K * (rush ? 1.5 : 1) * dt;
      if (a.etat === 'four') { a.t -= dt; a.dir = 2; if (panneI === a.i) a.etat = 'panne'; else if (a.t <= 0) { a.plateau = true; a.etat = 'porte'; } }
      else if (a.etat === 'porte') { a.dir = 1; const cible = LAY.comptoirSlots[a.lane]; a.x = Math.min(cible, a.x + v); if (a.x >= cible) { a.etat = 'depose'; a.t = 0.5; a.dir = 0; } }
      else if (a.etat === 'depose') { a.t -= dt; if (a.t <= 0) { a.plateau = false; a.etat = 'retour'; } }
      else if (a.etat === 'retour') { a.dir = -1; const cible = LAY.fourSlots[a.lane]; a.x = Math.max(cible, a.x - v); if (a.x <= cible) { a.etat = 'four'; a.t = tCuisson(st, a.i); } }
      else if (a.etat === 'panne') { a.dir = 0; if (panneI !== a.i) { a.etat = 'four'; a.t = tCuisson(st, a.i); } }
    }
  }
  function frame(dt, st, now) {
    if (!LAY) calculer();
    t += dt;
    const d = new Date(now), hour = force.heure != null ? force.heure : d.getHours() + d.getMinutes() / 60;
    const taux = G.tauxParSeconde(st);
    rang = G.rangTitre(st); pts = G.ptsTalents(st); affl = G.talent(st, 'affluence');
    Q = DECORS[G.QUARTIERS[G.quartier(st)].id] || DECORS.village; tags = force.saison || G.saison(now);
    for (const m of G.MOBILIER) { crans[m.id] = G.mobilierCran(st, m.id); prixDe[m.id] = G.prixMeuble(st, m.id); abordables[m.id] = crans[m.id] < m.max && st.coins >= prixDe[m.id]; }
    panneI = st.ev && st.ev.type === 'panne' && st.ev.fin > st.now ? st.ev.i : -1;
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      nextSpawn = rush ? 0.7 : taux > 0 ? Math.max(1.5, 6 - Math.log10(taux + 1)) : 7;
      if (enFile() < (rush ? 8 : 4) + affl && (rush || taux > 0 || Math.random() < 0.3)) spawn();
    }
    majClients(st, dt);
    majApprentis(st, dt);
    // dehors : des passants devant la fenêtre, et la météo de saison
    const f = LAY.fenetre;
    nextPassant -= dt;
    if (nextPassant <= 0 && Q.vue !== 'mer' && Q.vue !== 'montagne') { nextPassant = 6 + Math.random() * 10; const g = Math.random() < 0.5; passants.push({ x: g ? f.x - 14 : f.x + f.w + 14, vx: (g ? 1 : -1) * (16 + Math.random() * 12), s: 0.7 + Math.random() * 0.3, col: ['#2B3A55', '#6B4A3A', '#3D5A4A', '#7A3B4A'][Math.floor(Math.random() * 4)], phase: Math.random() * TAU }); }
    for (const p of passants) { p.x += p.vx * dt; p.phase += dt * 8; }
    for (let i = passants.length - 1; i >= 0; i--) if (passants[i].x < f.x - 20 || passants[i].x > f.x + f.w + 20) passants.splice(i, 1);
    const meteo = tags.includes('neige') || Q.vue === 'montagne' ? 'neige' : tags.includes('feuilles') ? 'feuilles' : tags.includes('paques') ? 'petales' : null;
    if (meteo && flocons.length < (meteo === 'neige' ? 30 : 12) && Math.random() < dt * (meteo === 'neige' ? 12 : 4)) flocons.push({ x: f.x + Math.random() * f.w, y: f.y - 4, vy: meteo === 'neige' ? 10 + Math.random() * 14 : 18 + Math.random() * 14, vx: meteo === 'neige' ? 0 : 8 + Math.random() * 10, r: meteo === 'neige' ? 1.2 + Math.random() * 1.6 : 2.5, a: Math.random() * TAU, type: meteo });
    for (const fl of flocons) { fl.y += fl.vy * dt; fl.x += (fl.vx + Math.sin(t * 2 + fl.a) * 6) * dt; fl.a += dt * 3; }
    for (let i = flocons.length - 1; i >= 0; i--) if (flocons[i].y > f.y + f.h + 4 || flocons[i].type !== meteo) flocons.splice(i, 1);
    if (panneI >= 0 && Math.random() < dt * 6) vapeurs.push({ x: LAY.four.x + LAY.four.w / 2 + (Math.random() - 0.5) * 22, y: LAY.four.y + 4, r: 5 + Math.random() * 5, life: 1.2, gris: true });
    for (const v of vapeurs) { v.life -= dt * 0.8; v.y -= 22 * dt; v.r += 6 * dt; }
    for (let i = vapeurs.length - 1; i >= 0; i--) if (vapeurs[i].life <= 0) vapeurs.splice(i, 1);
    for (const x of textes) { x.life -= dt * 0.9; x.y -= 28 * dt; }
    for (let i = textes.length - 1; i >= 0; i--) if (textes[i].life <= 0) textes.splice(i, 1);
    for (const k of confetti) { k.x += k.vx * dt; k.y += k.vy * dt; k.a += dt * 6; k.life -= dt * 0.35; }
    confetti = confetti.filter((k) => k.life > 0 && k.y < H + 10);
    if (hop > 0) hop = Math.max(0, hop - dt * 4);
    if (caisseFlash > 0) caisseFlash = Math.max(0, caisseFlash - dt);
    blink = (blink + dt) % 3.4;
    dernier = { st, hour, taux, d };
    if (visH > 48) draw(st, hour, taux, d); // tiroir ouvert : on simule sans dessiner
  }

  // ─── dessin ───
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function ombre(x, y, rx, ry, a) { ctx.fillStyle = `rgba(74,51,40,${a || 0.14})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function draw(st, hour, taux, d) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, Math.min(H, visH + 24)); ctx.clip(); // on ne dessine que ce que le tiroir laisse voir
    const sk = ciel(hour), niv = (i) => st.stations[i].niv, staffs = st.stations.filter((s) => s.staff).length, bonus = Object.keys(st.ameliorations).length, ms = Math.min(1, Math.max(0.66, K));
    mur(sk); sol();
    if (crans.deco >= 4) tapis(LAY.tapis.x, LAY.tapis.y, LAY.tapis.w, LAY.tapis.h);
    // le mur : la fenêtre, la porte, les étagères, ce qui s'accroche au fil de la boutique
    fenetre(LAY.fenetre, sk);
    porte(LAY.porte, sk);
    etagereMur(LAY.etagere, Math.min(10, Math.floor(niv(0) / 10)), niv(6) > 0, ms);
    ctx.save(); ctx.translate(LAY.cadre.x, LAY.cadre.y); ctx.scale(ms, ms); ctx.translate(-LAY.cadre.x, -LAY.cadre.y); if (niv(3) > 0) cadre(LAY.cadre.x, LAY.cadre.y); ctx.restore();
    ctx.save(); ctx.translate(LAY.horloge.x, LAY.horloge.y); ctx.scale(ms, ms); ctx.translate(-LAY.horloge.x, -LAY.horloge.y); horloge(LAY.horloge.x, LAY.horloge.y, d); ctx.restore();
    ctx.save(); ctx.translate(LAY.diplome.x, LAY.diplome.y); ctx.scale(ms, ms); ctx.translate(-LAY.diplome.x, -LAY.diplome.y); if (rang >= 2) diplome(LAY.diplome.x, LAY.diplome.y); if (crans.deco >= 2) { cadre(LAY.cadre2.x, LAY.cadre2.y); applique(W * 0.35, LAY.T * 0.22, sk.nuit); applique(W * 0.65, LAY.T * 0.22, sk.nuit); } ctx.restore();
    if (crans.deco >= 4) { ctx.fillStyle = Q.accent; ctx.globalAlpha = 0.5; ctx.fillRect(0, LAY.murH - 7, W, 4); ctx.globalAlpha = 1; }
    if (niv(5) > 0 || rush || crans.deco >= 3 || tags.includes('noel')) guirlande(tags.includes('noel'));
    if (tags.includes('fete')) fanions();
    if (tags.includes('coeurs')) coeurs();
    if (niv(2) > 0) { ctx.fillStyle = Q.accent; ctx.beginPath(); ctx.ellipse(W * 0.5, LAY.T * 0.07, 14, 5, 0, 0, TAU); ctx.fill(); }
    // les pièces et les personnages, triés par profondeur (le bas de chaque chose)
    ordre.length = 0;
    const push = (y, fn) => ordre.push({ y, fn });
    push(LAY.froid.y + LAY.froid.h, () => froid(LAY.froid, crans.froid));
    push(LAY.four.y + LAY.four.h, () => four(LAY.four, crans.four, st.stations[0].actif || taux > 0));
    push(LAY.paillasson.y + 5, () => paillasson(LAY.paillasson.x, LAY.paillasson.y, crans.deco >= 1));
    if (crans.deco >= 1) push(LAY.deco.y + 2, () => plante(LAY.deco.x, LAY.deco.y));
    if (niv(1) > 0) push(LAY.plante.y + 2, () => plante(LAY.plante.x, LAY.plante.y));
    if (tags.includes('noel')) push(LAY.sapin.y + 2, () => sapin(LAY.sapin.x, LAY.sapin.y));
    push(LAY.plan.y + LAY.plan.h, () => planTravail(LAY.plan));
    if (LAY.spread > 120 && niv(0) >= 20) push(LAY.presentoir.y + LAY.presentoir.h, () => presentoir(LAY.presentoir, Math.min(6, 2 + Math.floor(niv(0) / 25))));
    if (staffs >= 2) push(LAY.ardoise.y, () => ardoise(LAY.ardoise.x, LAY.ardoise.y));
    push(LAY.boulanger.y, () => boulanger(LAY.boulanger.x, LAY.boulanger.y - hop * 4));
    push(LAY.comptoir.y + LAY.comptoir.hTop + LAY.comptoir.hFace, () => { comptoir(LAY.comptoir, st, crans.vitrine); caisse(LAY.caisse.x, LAY.caisse.y, crans.caisse); if (bonus >= 3) fleurs(LAY.fleurs.x, LAY.fleurs.y); if (niv(4) > 0) chat(LAY.chat.x, LAY.chat.y); const sx = LAY.saison.x, sy = LAY.saison.y; if (tags.includes('halloween')) citrouille(sx, sy); else if (tags.includes('galette')) galette(sx, sy); else if (tags.includes('paques')) oeufs(sx - 8, sy); else if (tags.includes('ete') && !tags.includes('fete')) glaces(sx, sy); });
    LAY.tables.forEach((tb, k) => { if (k < Math.max(1, crans.tables)) push(tb.y + 6, () => table(tb, k, crans.tables)); });
    for (const a of apprentis) push(a.y, () => apprenti(a));
    for (const c of clients) push(c.etat === 'assis' ? c.y + 5 : c.y, () => client(c));
    for (let i = 1; i < ordre.length; i++) { const e = ordre[i]; let j = i - 1; while (j >= 0 && ordre[j].y > e.y) { ordre[j + 1] = ordre[j]; j--; } ordre[j + 1] = e; }
    for (const e of ordre) e.fn();
    for (const v of vapeurs) { ctx.globalAlpha = Math.max(0, v.life) * 0.7; ctx.fillStyle = v.gris ? '#8C8C8C' : '#fff'; ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    lumiere(sk, niv(2) > 0);
    for (const x of textes) { ctx.globalAlpha = Math.max(0, Math.min(1, x.life * 1.4)); ctx.font = `700 ${Math.round(15 * Math.min(1.3, 1 + x.txt.length / 40))}px Fredoka, Nunito, sans-serif`; ctx.fillStyle = x.col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.textAlign = 'center'; ctx.strokeText(x.txt, x.x, x.y); ctx.fillText(x.txt, x.x, x.y); }
    ctx.globalAlpha = 1;
    pastilles();
    if (amenager) amenagement();
    for (const k of confetti) { ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a); ctx.globalAlpha = Math.min(1, k.life * 2); ctx.fillStyle = k.c; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore(); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // le mode Aménager : chaque meuble entouré d'un pointillé animé, avec son nom, ses crans et le prix du cran suivant
  function amenagement() {
    const z = zones();
    ctx.font = '700 10px Fredoka, Nunito, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const m of G.MOBILIER) {
      const r = z[m.id]; if (!r) continue;
      const k = crans[m.id], max = k >= m.max, ok = abordables[m.id];
      rr(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 10); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = ok ? '#E0A61E' : '#C8864F'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
      const court = { tables: 'Tables', four: 'Four', vitrine: 'Vitrine', caisse: 'Caisse', froid: 'Froid', deco: 'Déco' }[m.id] || m.nom;
      const label = `${court} ${'●'.repeat(k)}${'○'.repeat(m.max - k)}`, lw = ctx.measureText(label).width + 12, lx = Math.max(2, Math.min(W - lw - 2, r.x)), ly = Math.max(9, r.y - 1);
      ctx.fillStyle = '#fff'; rr(lx, ly - 8, lw, 16, 8); ctx.fill(); ctx.fillStyle = L; ctx.fillText(label, lx + 6, ly);
      const prix = max ? 'Max ✓' : G.fmtEur(prixDe[m.id]), pw = ctx.measureText(prix).width + 12, px = Math.min(W - pw - 2, r.x + r.w - pw - 2), py = r.y + r.h - 1;
      ctx.fillStyle = max ? '#5FD3A4' : ok ? '#FFC84A' : '#EADFD6'; rr(px, py - 8, pw, 16, 8); ctx.fill(); ctx.fillStyle = max ? '#fff' : ok ? L : '#8C6F62'; ctx.fillText(prix, px + 6, py);
    }
    ctx.textBaseline = 'alphabetic';
  }
  // une petite pastille « ↑ » sur les meubles dont le cran suivant est abordable
  function pastilles() {
    const z = zones(), by = Math.sin(t * 3) * 2;
    if (!amenager) for (const m of G.MOBILIER) { // le niveau de chaque meuble, discret, dans l'angle bas gauche de sa zone
      const r = z[m.id], k = crans[m.id]; if (!r || (m.id === 'tables' && k === 0)) continue;
      const txt = `${k}/${m.max}`; ctx.font = '800 9px Nunito, sans-serif'; ctx.textAlign = 'left'; const pw = ctx.measureText(txt).width + 8, px = Math.max(1, r.x + 2), py = r.y + r.h - 7;
      ctx.fillStyle = 'rgba(74,51,40,.55)'; rr(px, py - 6.5, pw, 13, 6.5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(txt, px + 4, py + 3.2);
    }
    for (const id of ['tables', 'four', 'vitrine', 'caisse', 'froid', 'deco']) {
      if (!abordables[id] || !z[id]) continue;
      const r = z[id], x = Math.min(W - 10, r.x + r.w - 6), y = Math.max(10, r.y + 6 + by);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.arc(x + 1, y + 2, 8.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FFC84A'; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y - 4); ctx.moveTo(x - 3.5, y - 0.5); ctx.lineTo(x, y - 4); ctx.lineTo(x + 3.5, y - 0.5); ctx.stroke();
    }
  }
  // ─── murs, sol, lumière ───
  function mur(sk) {
    const mh = LAY.murH;
    const g = ctx.createLinearGradient(0, 0, 0, mh); g.addColorStop(0, Q.mur); g.addColorStop(1, Q.mur2);
    ctx.fillStyle = rush ? '#FFF0E0' : g; ctx.fillRect(0, 0, W, mh);
    ctx.fillStyle = Q.mur2;
    if (Q.murStyle === 'lignes') for (let y = 0; y < mh; y += 14) ctx.fillRect(0, y, W, 1);
    if (Q.murStyle === 'rondins') for (let y = 0; y < mh; y += 13) { ctx.fillRect(0, y, W, 2); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, y + 4, W, 1); ctx.fillStyle = Q.mur2; }
    if (Q.murStyle === 'moulures') { ctx.strokeStyle = Q.mur2; ctx.lineWidth = 2; ctx.strokeRect(W * 0.32, LAY.T * 0.06, W * 0.33, mh - LAY.T * 0.12); }
    if (Q.murStyle === 'bande') { ctx.fillStyle = Q.accent; ctx.fillRect(0, mh - 12, W, 4); ctx.fillStyle = 'rgba(58,134,200,.12)'; ctx.fillRect(0, mh - 16, W, 3); }
    if (Q.murStyle === 'marbre') { ctx.strokeStyle = 'rgba(120,100,90,.12)'; ctx.lineWidth = 1.5; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(k * W * 0.2 - 20, 0); ctx.quadraticCurveTo(k * W * 0.2 + 30, mh * 0.5, k * W * 0.2 + 10, mh); ctx.stroke(); } }
    ctx.fillStyle = Q.bois; ctx.fillRect(0, mh - 4, W, 4); // la plinthe
    ctx.fillStyle = 'rgba(74,51,40,.10)'; ctx.fillRect(0, mh, W, 5);
  }
  function sol() {
    const y0 = LAY.murH;
    const g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, Q.sol); g.addColorStop(1, Q.solStyle === 'marbre' ? '#2A2731' : Q.sol);
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = 'rgba(74,51,40,.05)'; ctx.fillRect(0, y0, W, H - y0);
    if (Q.solStyle === 'planches') { const hb = 11; for (let r = 0; r * hb < H - y0; r++) { const y = y0 + 5 + r * hb; ctx.fillStyle = r % 2 ? Q.sol2 : 'rgba(0,0,0,.035)'; ctx.fillRect(0, y, W, hb - 1); ctx.fillStyle = 'rgba(74,51,40,.10)'; for (let x = ((r * 53) % 130); x < W; x += 130) ctx.fillRect(x, y, 1, hb - 1); } }
    if (Q.solStyle === 'damier') { ctx.fillStyle = Q.sol2; const s = 20; for (let r = 0; r * s < H - y0; r++) for (let c = 0; c * s < W; c++) if ((r + c) % 2 === 0) ctx.fillRect(c * s, y0 + 5 + r * s, s, s); }
    if (Q.solStyle === 'marbre') { ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1.5; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(k * W * 0.25, y0); ctx.quadraticCurveTo(k * W * 0.25 + 40, y0 + 40, k * W * 0.25 + 20, H); ctx.stroke(); } }
    // la lumière de la fenêtre et de la porte se pose sur le sol
    ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(LAY.fenetre.x + 6, y0, LAY.fenetre.w - 12, LAY.T * 0.14); ctx.fillRect(LAY.porte.x + 4, y0, LAY.porte.w - 8, LAY.T * 0.1);
    if (H - y0 > LAY.T) { const v = ctx.createLinearGradient(0, LAY.T, 0, H); v.addColorStop(0, 'rgba(74,51,40,0)'); v.addColorStop(1, 'rgba(74,51,40,.08)'); ctx.fillStyle = v; ctx.fillRect(0, LAY.T, W, H - LAY.T); } // le grand sol s'assombrit doucement vers le bas
  }
  function lumiere(sk, lampeAllumee) {
    if (sk.phase === 'nuit') { ctx.fillStyle = 'rgba(40,50,130,.22)'; ctx.fillRect(0, 0, W, H); }
    else if (sk.phase === 'soir') { ctx.fillStyle = 'rgba(255,150,70,.10)'; ctx.fillRect(0, 0, W, H); }
    else if (sk.phase === 'crepuscule') { ctx.fillStyle = 'rgba(120,90,160,.12)'; ctx.fillRect(0, 0, W, H); }
    else if (sk.phase === 'aube') { ctx.fillStyle = 'rgba(255,190,150,.08)'; ctx.fillRect(0, 0, W, H); }
    if (sk.phase === 'nuit' || sk.phase === 'crepuscule') { // les lampes s'allument : halos chauds
      const pts2 = [[W * 0.2, LAY.murH], [W * 0.8, LAY.murH]]; if (lampeAllumee) pts2.push([W * 0.5, LAY.T * 0.3]); if (crans.deco >= 2) pts2.push([W * 0.35, LAY.T * 0.22], [W * 0.65, LAY.T * 0.22]);
      for (const [x, y] of pts2) { const g = ctx.createRadialGradient(x, y, 2, x, y, W * 0.22); g.addColorStop(0, 'rgba(255,220,140,.42)'); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - W * 0.22, y - W * 0.22, W * 0.44, W * 0.44); }
    }
  }
  // ─── la fenêtre, la porte et ce qu'on voit dehors ───
  function fenetre(f, sk) {
    const { x: fx, y: fy, w: fw, h: fh } = f;
    ctx.save(); rr(fx, fy, fw, fh, 10); ctx.clip();
    const g = ctx.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, sk.haut); g.addColorStop(1, sk.bas); ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
    if (sk.nuit) { ctx.fillStyle = '#FFF4C2'; for (let i = 0; i < 7; i++) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + i); ctx.beginPath(); ctx.arc(fx + 6 + ((i * 37) % (fw - 12)), fy + 4 + ((i * 23) % (fh * 0.45)), 1.2, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(fx + fw * 0.75, fy + fh * 0.28, 6, 0, TAU); ctx.fill(); ctx.fillStyle = sk.haut; ctx.beginPath(); ctx.arc(fx + fw * 0.75 + 3, fy + fh * 0.28 - 2, 5, 0, TAU); ctx.fill(); }
    else if (sk.phase !== 'crepuscule') { ctx.fillStyle = sk.phase === 'soir' ? '#FFD36B' : '#FFE27A'; ctx.beginPath(); ctx.arc(fx + fw * 0.78, fy + fh * (sk.phase === 'soir' ? 0.5 : 0.25), 6, 0, TAU); ctx.fill(); }
    if (!sk.nuit) { ctx.fillStyle = 'rgba(255,255,255,.85)'; const cx = fx + fw * 0.3 + Math.sin(t * 0.05) * 6; for (const [ox, oy, r] of [[0, 0, 6], [7, -2, 7], [14, 1, 5], [5, 4, 5]]) { ctx.beginPath(); ctx.arc(cx + ox, fy + fh * 0.36 + oy, r, 0, TAU); ctx.fill(); } }
    vue(fx, fy, fw, fh, sk);
    for (const p of passants) passant(p, fy + fh - 4);
    for (const fl of flocons) { if (fl.type === 'neige') { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, TAU); ctx.fill(); } else { ctx.save(); ctx.translate(fl.x, fl.y); ctx.rotate(fl.a); ctx.fillStyle = fl.type === 'feuilles' ? '#E07B39' : '#FFB3C7'; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 1.8, 0, 0, TAU); ctx.fill(); ctx.restore(); } }
    ctx.restore();
    ctx.strokeStyle = Q.vue === 'montagne' ? '#5A3A22' : Q.vue === 'ville' ? '#2E2A36' : '#FFFFFF'; ctx.lineWidth = 5; rr(fx, fy, fw, fh, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy); ctx.lineTo(fx + fw / 2, fy + fh); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke();
    ctx.fillStyle = Q.bois; rr(fx - 5, fy + fh - 2, fw + 10, 6, 3); ctx.fill();
  }
  function porte(p, sk) {
    const { x, y, w, h } = p;
    ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x + 2, y + 3, w, h, 6); ctx.fill();
    ctx.fillStyle = Q.vue === 'ville' ? '#2E2A36' : Q.vue === 'montagne' ? '#5A3A22' : Q.bois; rr(x, y, w, h, 6); ctx.fill();
    ctx.save(); rr(x + 5, y + 5, w - 10, h * 0.5, 4); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h * 0.55); g.addColorStop(0, sk.haut); g.addColorStop(1, sk.bas); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    vue(x + 5, y + 5, w - 10, h * 0.5, sk);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; rr(x + 5, y + 5, w - 10, h * 0.5, 4); ctx.stroke();
    ctx.fillStyle = Q.comptoir2; rr(x + 6, y + h * 0.62, w - 12, h * 0.3, 3); ctx.fill();
    ctx.fillStyle = '#FFC84A'; ctx.beginPath(); ctx.arc(x + w - 9, y + h * 0.7, 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; rr(x + w / 2 - 15, y + h * 0.56 - 5, 30, 10, 3); ctx.fill(); ctx.fillStyle = L; ctx.font = '700 6.5px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('OUVERT', x + w / 2, y + h * 0.56 + 2.5);
  }
  function vue(fx, fy, fw, fh, sk) {
    const nuit = sk.nuit, bas = fy + fh, v = Q.vue;
    if (v === 'campagne') {
      ctx.fillStyle = nuit ? '#3E6B4A' : '#7FD08C'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.25, bas + 6, fw * 0.5, fh * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = nuit ? '#2F5A3C' : '#5FBE73'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.8, bas + 8, fw * 0.5, fh * 0.34, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8B5A3C'; ctx.fillRect(fx + fw * 0.68, bas - fh * 0.3, 3, fh * 0.14); ctx.fillStyle = nuit ? '#2F6B45' : '#4FAF62'; ctx.beginPath(); ctx.arc(fx + fw * 0.69, bas - fh * 0.34, fh * 0.11, 0, TAU); ctx.fill();
    } else if (v === 'paris') {
      const cols = nuit ? ['#3B4252', '#4A5368', '#2F3647'] : ['#B9C2D1', '#CBD2DD', '#A6AFBF'];
      [[0, 0.3, 0.5], [0.28, 0.26, 0.62], [0.52, 0.3, 0.46], [0.8, 0.22, 0.56]].forEach(([u, w, h], k) => { const x = fx + fw * u, bw = fw * w, bh = fh * h; ctx.fillStyle = cols[k % 3]; ctx.fillRect(x, bas - bh, bw, bh); ctx.fillStyle = '#6B7280'; ctx.beginPath(); ctx.moveTo(x - 2, bas - bh); ctx.lineTo(x + bw * 0.15, bas - bh - 5); ctx.lineTo(x + bw * 0.85, bas - bh - 5); ctx.lineTo(x + bw + 2, bas - bh); ctx.fill(); for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const lit = nuit && ((r * 3 + c + k) % 3 !== 0); ctx.fillStyle = lit ? '#FFE49A' : nuit ? '#1F2430' : '#EEF2F7'; ctx.fillRect(x + 3 + c * (bw - 6) / 2, bas - bh + 5 + r * (bh - 8) / 3, (bw - 6) / 2 - 2.5, (bh - 8) / 3 - 3); } });
      ctx.strokeStyle = nuit ? '#D8C08A' : '#6B7280'; ctx.lineWidth = 1.4; const tx = fx + fw * 0.9, th = fh * 0.62; ctx.beginPath(); ctx.moveTo(tx - 6, bas); ctx.quadraticCurveTo(tx - 1, bas - th * 0.6, tx, bas - th); ctx.quadraticCurveTo(tx + 1, bas - th * 0.6, tx + 6, bas); ctx.moveTo(tx - 3.5, bas - th * 0.45); ctx.lineTo(tx + 3.5, bas - th * 0.45); ctx.stroke();
    } else if (v === 'mer') {
      const hz = fy + fh * 0.55; const g = ctx.createLinearGradient(0, hz, 0, bas); g.addColorStop(0, nuit ? '#2B4C7E' : '#3A86C8'); g.addColorStop(1, nuit ? '#1E3558' : '#5FB2E6'); ctx.fillStyle = g; ctx.fillRect(fx, hz, fw, bas - hz);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let x = 0; x <= fw; x += 4) ctx.lineTo(fx + x, hz + 6 + k * 7 + Math.sin(x * 0.25 + t * 2 + k) * 1.5); ctx.stroke(); }
      const bx = fx + fw * (0.5 + 0.3 * Math.sin(t * 0.15)); ctx.fillStyle = '#8B5A3C'; ctx.beginPath(); ctx.moveTo(bx - 8, hz + 3); ctx.lineTo(bx + 8, hz + 3); ctx.lineTo(bx + 5, hz + 7); ctx.lineTo(bx - 5, hz + 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(bx, hz + 2); ctx.lineTo(bx, hz - 10); ctx.lineTo(bx + 7, hz + 2); ctx.fill();
      ctx.strokeStyle = nuit ? '#D0D8E0' : '#5B6770'; ctx.lineWidth = 1.4; const gx = fx + fw * (0.35 + 0.1 * Math.sin(t * 0.5)), gy = fy + fh * 0.3 + Math.sin(t * 1.3) * 3; ctx.beginPath(); ctx.moveTo(gx - 5, gy); ctx.quadraticCurveTo(gx - 2.5, gy - 3.5, gx, gy); ctx.quadraticCurveTo(gx + 2.5, gy - 3.5, gx + 5, gy); ctx.stroke();
      ctx.fillStyle = nuit ? '#C9B98F' : '#F2DFB5'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.2, bas + 2, fw * 0.3, fh * 0.1, 0, 0, TAU); ctx.fill();
    } else if (v === 'montagne') {
      for (const [u, w, h, col] of [[0.3, 0.55, 0.78, nuit ? '#5B6A8A' : '#9CA8C4'], [0.75, 0.6, 0.62, nuit ? '#4A5878' : '#8792B0']]) { const px = fx + fw * u, pw = fw * w, ph = fh * h; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px - pw / 2, bas); ctx.lineTo(px, bas - ph); ctx.lineTo(px + pw / 2, bas); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(px - pw * 0.14, bas - ph * 0.72); ctx.lineTo(px, bas - ph); ctx.lineTo(px + pw * 0.14, bas - ph * 0.72); ctx.lineTo(px + pw * 0.06, bas - ph * 0.66); ctx.lineTo(px - pw * 0.06, bas - ph * 0.66); ctx.fill(); }
      ctx.fillStyle = nuit ? '#1F3A2C' : '#2F6B4F'; for (const u of [0.1, 0.22, 0.6, 0.9]) { const px = fx + fw * u; ctx.beginPath(); ctx.moveTo(px - 6, bas); ctx.lineTo(px, bas - fh * 0.26); ctx.lineTo(px + 6, bas); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(fx + fw * 0.5, bas + 4, fw * 0.6, fh * 0.08, 0, 0, TAU); ctx.fill();
    } else { // la grande ville
      const cols = nuit ? ['#20222F', '#2B2E3F', '#181A26'] : ['#8A93A8', '#A3ABBF', '#737C92'];
      [[0, 0.2, 0.7], [0.18, 0.16, 0.92], [0.34, 0.22, 0.6], [0.56, 0.18, 0.84], [0.74, 0.26, 0.66]].forEach(([u, w, h], k) => { const x = fx + fw * u, bw = fw * w, bh = fh * h; ctx.fillStyle = cols[k % 3]; ctx.fillRect(x, bas - bh, bw, bh); for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) { const lit = (nuit || sk.phase === 'soir') && ((r * 2 + c + k) % 3 !== 0); ctx.fillStyle = lit ? (c ? '#FFE49A' : '#9BD0FF') : nuit ? '#0F1118' : '#D9DEE8'; ctx.fillRect(x + 2.5 + c * (bw - 5) / 2, bas - bh + 4 + r * (bh - 6) / 5, (bw - 5) / 2 - 2, (bh - 6) / 5 - 2.5); } });
      ctx.fillStyle = Math.sin(t * 4) > -0.2 ? '#FF6B8B' : '#B14A5F'; rr(fx + fw * 0.36, bas - fh * 0.5, fw * 0.18, 5, 2); ctx.fill();
    }
  }
  function passant(p, y) {
    const s = p.s; ctx.fillStyle = p.col; ctx.globalAlpha = 0.85;
    rr(p.x - 5 * s, y - 20 * s, 10 * s, 14 * s, 4 * s); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, y - 24 * s, 4.5 * s, 0, TAU); ctx.fill();
    const j = Math.sin(p.phase) * 3 * s; ctx.fillRect(p.x - 4 * s + j, y - 6 * s, 3 * s, 6 * s); ctx.fillRect(p.x + 1 * s - j, y - 6 * s, 3 * s, 6 * s);
    ctx.globalAlpha = 1;
  }

  // ─── le mobilier ───
  function etagereMur(e, n, boites, ms) {
    const dy = Math.max(16, LAY.T * 0.1), ph = 11 * ms;
    for (let r = 0; r < 2; r++) {
      const yy = e.y + r * dy;
      ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(e.x + 2, yy + ph + 3, e.w, 4, 2); ctx.fill();
      ctx.fillStyle = Q.bois; rr(e.x, yy + ph + 1, e.w, 4, 2); ctx.fill();
      const nb = r === 1 && boites ? 2 : 5;
      for (let i = 0; i < Math.min(nb, n - r * 5); i++) {
        const pw = e.w / 5 - 4, px = e.x + 2 + i * (e.w / 5);
        if (r === 1 && i % 2) { ctx.fillStyle = '#D99A4E'; ctx.beginPath(); ctx.ellipse(px + pw / 2, yy + ph * 0.55, pw / 2, ph * 0.5, 0, 0, TAU); ctx.fill(); continue; }
        ctx.fillStyle = i % 2 ? '#E8B46A' : '#D99A4E'; rr(px, yy, pw, ph, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(px + 2, yy + 2, pw - 5, 2, 1); ctx.fill();
      }
      if (r === 1 && boites) for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#FFE1EA', '#E7D4FF', '#FFF3C4'][i]; const bx = e.x + e.w * 0.42 + i * e.w * 0.2, bw = e.w * 0.17; rr(bx, yy + 1, bw, ph, 2); ctx.fill(); ctx.strokeStyle = PASTEL[i]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx + bw / 2, yy + 1); ctx.lineTo(bx + bw / 2, yy + 1 + ph); ctx.stroke(); }
    }
  }
  function froid(f, k) {
    const { x, y, w, h } = f;
    if (k === 0) { // un sac de farine et une cagette
      ombre(x + w / 2, y + h, w * 0.6, 4, 0.12);
      ctx.fillStyle = '#C8864F'; rr(x + 2, y + h - 18, w - 4, 16, 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * (w - 8) / 3, y + h - 16, 2, 12);
      ctx.fillStyle = '#F4E4C8'; rr(x + 4, y + h - 40, w - 8, 24, 8); ctx.fill(); ctx.fillStyle = '#E8B46A'; rr(x + w / 2 - 6, y + h - 46, 12, 8, 3); ctx.fill(); ctx.fillStyle = Q.accent; rr(x + 8, y + h - 32, w - 16, 5, 2); ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,.10)'; rr(x + 3, y + 4, w, h, 6); ctx.fill();
    const col = k >= 2 ? '#C9CED6' : '#F6F7F9', top = k >= 2 ? '#E2E6EC' : '#FFFFFF';
    ctx.fillStyle = col; rr(x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = top; rr(x, y, w, 9, 6); ctx.fill();
    if (k >= 3) { // la chambre vitrée à LED
      ctx.fillStyle = 'rgba(140,200,255,.55)'; rr(x + 5, y + 14, w - 10, h - 24, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; rr(x + 5, y + 14, w - 10, h - 24, 4); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 3) > 0 ? '#6CB8FF' : '#DDF3FF'; rr(x + 6, y + 10, w - 12, 2.5, 1); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#E8B46A', '#FFE1EA', '#E7D4FF'][i]; rr(x + 8, y + 20 + i * (h - 34) / 3, w - 16, 5, 2); ctx.fill(); }
    } else { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x + 3, y + h * 0.45, w - 6, 2); ctx.fillStyle = k >= 2 ? '#8C939E' : '#B9C6D2'; rr(x + w - 8, y + 16, 3, h * 0.22, 1.5); ctx.fill(); rr(x + w - 8, y + h * 0.52, 3, h * 0.3, 1.5); ctx.fill(); }
    if (k >= 2) { ctx.fillStyle = '#6CB8FF'; ctx.beginPath(); ctx.arc(x + 7, y + 6, 1.5, 0, TAU); ctx.fill(); }
  }
  function four(f, k, chaud) {
    const { x, y, w, h } = f, cuivre = '#C97C3A';
    ctx.fillStyle = 'rgba(0,0,0,.10)'; rr(x + 3, y + 5, w, h, 8); ctx.fill();
    const col = k === 0 ? ['#9A8F8A', '#7A6F6A'] : k >= 4 ? ['#B07A52', '#7A4E31'] : ['#7A655C', '#5C4A43'];
    const g = ctx.createLinearGradient(x, y, x + w, y); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); ctx.fillStyle = g; rr(x, y, w, h, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(x, y, w, 7, 8); ctx.fill(); // le dessus, vu d'en haut
    if (k >= 3) { ctx.fillStyle = '#8C8C8C'; rr(x + w * 0.2, y - 14, w * 0.6, 12, 3); ctx.fill(); ctx.fillStyle = cuivre; rr(x + w * 0.45, y - 26, w * 0.1, 14, 2); ctx.fill(); } // la hotte et le tuyau de cuivre
    const portes = k >= 2 ? 2 : 1, pw = (w - 12 - (portes - 1) * 4) / portes;
    for (let p = 0; p < portes; p++) {
      const px = x + 6 + p * (pw + 4), py = y + 11, ph = h * 0.46;
      if (k >= 4) { ctx.fillStyle = '#3B2F2A'; ctx.beginPath(); ctx.moveTo(px, py + ph); ctx.lineTo(px, py + ph * 0.45); ctx.quadraticCurveTo(px + pw / 2, py - ph * 0.3, px + pw, py + ph * 0.45); ctx.lineTo(px + pw, py + ph); ctx.closePath(); ctx.fill(); } // la voûte du four à bois
      else { ctx.fillStyle = '#3B2F2A'; rr(px, py, pw, ph, 6); ctx.fill(); }
      if (chaud) { const fl = 0.85 + 0.15 * Math.sin(t * 7 + p) * Math.sin(t * 3.1); const gg = ctx.createRadialGradient(px + pw / 2, py + ph * 0.6, 2, px + pw / 2, py + ph * 0.6, pw * 0.55); gg.addColorStop(0, `rgba(255,220,120,${fl})`); gg.addColorStop(0.6, `rgba(255,140,60,${fl * 0.9})`); gg.addColorStop(1, 'rgba(200,70,30,.6)'); ctx.fillStyle = gg; rr(px + 2, py + 2 + (k >= 4 ? ph * 0.2 : 0), pw - 4, ph - 4 - (k >= 4 ? ph * 0.2 : 0), 5); ctx.fill(); ctx.fillStyle = '#E8B46A'; rr(px + 5, py + ph * 0.55, pw - 10, 5, 2.5); ctx.fill(); }
      else { ctx.fillStyle = '#6B5950'; rr(px + 2, py + 2, pw - 4, ph - 4, 5); ctx.fill(); }
      if (k >= 1) { ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let r = 0; r < 2; r++) ctx.fillRect(px + 4, py + 6 + r * ph * 0.3, pw - 8, 1.5); } // les grilles
      ctx.fillStyle = k >= 1 ? '#E0A61E' : '#C9B8AE'; rr(px + 4, py + ph + 4, pw - 8, 3.5, 2); ctx.fill(); // la poignée
    }
    if (k >= 4) { ctx.fillStyle = '#8B5A3C'; for (let i = 0; i < 4; i++) rr(x + 8 + i * (w - 16) / 4, y + h - 10, (w - 16) / 4 - 3, 6, 3), ctx.fill(); } // les bûches
    else { ctx.fillStyle = '#D9CCC2'; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h - 9, 3.5, 0, TAU); ctx.arc(x + w * 0.7, y + h - 9, 3.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#8C7A72'; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h - 9, 1.3, 0, TAU); ctx.arc(x + w * 0.7, y + h - 9, 1.3, 0, TAU); ctx.fill(); }
  }
  function planTravail(p) {
    const { x, y, w, h } = p;
    ombre(x + w / 2, y + h + 3, w / 2, 4, 0.12);
    ctx.fillStyle = Q.bois; rr(x, y + 6, w, h - 2, 5); ctx.fill();
    ctx.fillStyle = Q.comptoir2; rr(x, y, w, 10, 5); ctx.fill();
    ctx.fillStyle = '#FFF3C4'; ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + 4, 8, 4, 0, 0, TAU); ctx.fill(); // la pâte
    ctx.fillStyle = '#C8864F'; rr(x + w * 0.55, y + 1, w * 0.3, 3, 1.5); ctx.fill(); // le rouleau
    ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + w * 0.15 + i * 6, y + 7, 1, 0, TAU); ctx.fill(); } // la farine
  }
  function presentoir(p, n) { // un panier de baguettes debout, au fond de la boutique
    const { x, y, w, h } = p;
    ombre(x + w / 2, y + h + 2, w / 2, 4, 0.12);
    ctx.fillStyle = Q.bois; rr(x, y, w, h, 5); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.10)'; for (let i = 1; i < 4; i++) ctx.fillRect(x + i * w / 4, y + 2, 1.5, h - 4);
    for (let i = 0; i < n; i++) { const bx = x + 6 + i * (w - 12) / Math.max(1, n - 1) * (n > 1 ? 1 : 0) + (n === 1 ? w / 2 - 6 : 0); ctx.strokeStyle = i % 2 ? '#E8B46A' : '#D99A4E'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, y + 4); ctx.lineTo(bx + 4 - (i % 3) * 3, y - 22 - (i % 2) * 5); ctx.stroke(); }
    ctx.fillStyle = Q.comptoir2; rr(x - 2, y - 2, w + 4, 6, 3); ctx.fill();
  }
  function comptoir(c, st, kv) {
    const { x, y, w, hTop, hFace } = c, yf = y + hTop;
    ombre(x + w / 2, yf + hFace + 4, w / 2, 6, 0.16);
    ctx.fillStyle = Q.comptoir; rr(x, yf - 4, w, hFace + 4, 8); ctx.fill(); // la face
    if (Q.solStyle === 'planches' || Q.vue === 'montagne') { ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + 6, yf + k * hFace / 3); ctx.lineTo(x + w - 6, yf + k * hFace / 3); ctx.stroke(); } }
    // la vitrine sur la face : ce que les clients regardent
    const vx = x + 8, vy = yf + 4, vw = w * 0.72, vh = hFace - 10;
    rr(vx, vy, vw, vh, 6); const gv = ctx.createLinearGradient(vx, vy, vx + vw, vy + vh); gv.addColorStop(0, kv >= 3 ? 'rgba(220,240,255,.92)' : 'rgba(230,246,255,.85)'); gv.addColorStop(1, kv >= 3 ? 'rgba(190,225,250,.85)' : 'rgba(205,232,250,.7)'); ctx.fillStyle = gv; ctx.fill();
    ctx.strokeStyle = kv >= 3 ? '#DDE6EE' : '#FFFFFF'; ctx.lineWidth = kv >= 3 ? 3.5 : 3; ctx.stroke();
    if (kv >= 1) { ctx.fillStyle = Math.sin(t * 2) > -0.9 ? 'rgba(255,230,160,.8)' : 'rgba(255,230,160,.5)'; rr(vx + 4, vy + 2, vw - 8, 2.5, 1); ctx.fill(); } // le bandeau lumineux
    vitrine(st, vx, vy, vw, vh, kv);
    ctx.save(); rr(vx, vy, vw, vh, 6); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(vx + vw * 0.12, vy + vh + 4); ctx.lineTo(vx + vw * 0.3, vy - 4); ctx.moveTo(vx + vw * 0.36, vy + vh + 4); ctx.lineTo(vx + vw * 0.44, vy - 4); ctx.stroke(); ctx.restore();
    // le dessus, vu d'en haut
    ctx.fillStyle = Q.comptoir2; rr(x - 2, y, w + 4, hTop + 2, 6); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x + 6, y + 3, w - 12, 3, 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x - 2, y + hTop - 2, w + 4, 4, 2); ctx.fill();
  }
  function vitrine(st, x, y, w, h, kv) {
    const ouverts = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0);
    const rangees = kv >= 2 && ouverts.length > 3 ? 2 : 1, parRangee = Math.ceil(ouverts.length / rangees), rh = h / rangees;
    ouverts.forEach((i, k) => { const r = Math.floor(k / parRangee), col = k % parRangee, cw = w / Math.max(3, parRangee), s = Math.min(rh - 4, cw - 6); const px = x + 3 + col * cw + (cw - s) / 2, py = y + r * rh + (rh - s) / 2; ctx.fillStyle = 'rgba(255,255,255,.7)'; rr(px - 2, py + s - 3, s + 4, 3, 1.5); ctx.fill(); patisserie(i, px, py, s, s); if (kv >= 2) { ctx.fillStyle = '#fff'; rr(px + s / 2 - 4, py + s - 1, 8, 3, 1); ctx.fill(); } });
  }
  function caisse(x, y, k) {
    ctx.save(); ctx.translate(x, y);
    ombre(0, 8, 13, 3, 0.1);
    if (k === 0) { ctx.fillStyle = Q.bois; rr(-11, -6, 22, 14, 3); ctx.fill(); ctx.fillStyle = '#E0A61E'; rr(-4, 0, 8, 2.5, 1); ctx.fill(); ctx.restore(); return; } // un simple tiroir
    const flash = caisseFlash > 0.3 ? '#FFF3C4' : null;
    ctx.fillStyle = k >= 3 ? '#4A3328' : '#5FD3A4'; rr(-12, -8, 24, 16, 4); ctx.fill();
    ctx.fillStyle = flash || '#fff'; rr(-8, -16, k >= 2 ? 16 : 12, 9, 2.5); ctx.fill(); ctx.fillStyle = '#3FB889'; ctx.fillRect(-6, -12, 8, 1.5);
    ctx.fillStyle = '#fff'; for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) ctx.fillRect(-9 + c * 6, -4 + r * 5, 4, 3);
    if (k >= 3) { ctx.fillStyle = '#B9C6D2'; rr(10, -6, 7, 12, 2); ctx.fill(); ctx.fillStyle = '#FFC84A'; ctx.beginPath(); ctx.arc(14, -11, 3, 0, TAU); ctx.fill(); } // le terminal et la clochette
    ctx.restore();
  }
  function table(tb, k, cran) {
    const { x, y } = tb;
    if (cran === 0) { // la place d'une première table : un cercle pointillé
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(74,51,40,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 10 * K, 16 * K, 10 * K, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(74,51,40,.35)'; ctx.font = `700 ${Math.round(9 * K)}px Nunito, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('tables', x, y - 7 * K);
      return;
    }
    const occ = tb.sieges.map((s) => !!s.occ);
    for (const s of tb.sieges) if (!s.occ) chaise(s.x, s.y, s.dir); // les chaises vides ; une chaise occupée est dessinée avec son client
    ombre(x, y + 2, 15 * K, 5 * K, 0.14);
    ctx.fillStyle = Q.bois; rr(x - 2.5, y - 14 * K, 5, 14 * K, 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y, 7 * K, 3 * K, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = Q.comptoir; ctx.beginPath(); ctx.ellipse(x, y - 12 * K, 16 * K, 10 * K, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = cran >= 4 ? Q.accent : Q.comptoir2; ctx.beginPath(); ctx.ellipse(x, y - 14 * K, 16 * K, 10 * K, 0, 0, TAU); ctx.fill();
    if (cran >= 4) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x, y - 14 * K, 10 * K, 6 * K, 0, 0, TAU); ctx.fill(); }
    if (occ[0] || occ[1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x - 5 * K, y - 15 * K, 4 * K, 2.5 * K, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#E8B46A'; ctx.beginPath(); ctx.arc(x - 5 * K, y - 15.5 * K, 1.8 * K, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; rr(x + 2 * K, y - 18 * K, 5 * K, 5 * K, 1.5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(x + 4.5 * K, y - 21 * K + Math.sin(t * 3 + k) * 1.5, 1.6, 0, TAU); ctx.fill(); } // la tasse et l'assiette
    else if (cran >= 4 || crans.deco >= 3) { ctx.fillStyle = '#9BD0FF'; rr(x - 2, y - 19 * K, 4, 6, 2); ctx.fill(); ctx.fillStyle = ['#FF6B8B', '#FFC84A', '#B8A6FF'][k % 3]; ctx.beginPath(); ctx.arc(x, y - 21 * K, 2.5, 0, TAU); ctx.fill(); } // un petit vase
  }
  function chaise(x, y, dir) { ctx.fillStyle = Q.bois; rr(x - 6 * K, y - 22 * K, 12 * K, 14 * K, 3); ctx.fill(); ctx.fillStyle = Q.comptoir2; rr(x - 7 * K, y - 10 * K, 14 * K, 6 * K, 2); ctx.fill(); ctx.fillStyle = Q.bois; ctx.fillRect(x - 6 * K, y - 4 * K, 2.5, 5 * K); ctx.fillRect(x + 3.5 * K, y - 4 * K, 2.5, 5 * K); void dir; }
  function tapis(x, y, w, h) { ctx.fillStyle = Q.accent; ctx.globalAlpha = 0.35; rr(x, y, w, h, 6); ctx.fill(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; rr(x + 4, y + 3, w - 8, h - 6, 4); ctx.stroke(); ctx.globalAlpha = 1; }
  function applique(x, y, nuit) { ctx.fillStyle = Q.bois; rr(x - 2, y, 4, 8, 1.5); ctx.fill(); ctx.fillStyle = nuit ? '#FFE9A8' : '#FFF3C4'; ctx.beginPath(); ctx.moveTo(x - 8, y + 1); ctx.lineTo(x + 8, y + 1); ctx.lineTo(x + 5, y - 7); ctx.lineTo(x - 5, y - 7); ctx.closePath(); ctx.fill(); }
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

  // ─── les personnages, vus de trois quarts : ombre, jambes, corps, tête, visage, accessoires ───
  function perso(x, y, s, o) {
    const marche = !!o.marche, bob = marche ? Math.abs(Math.sin(o.phase)) * 2 : 0, j = marche ? Math.sin(o.phase) * 3 : 0, dir = o.dir || 0;
    ctx.save(); if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (!o.assis) ombre(x, y + 1, 11 * s, 3.5 * s, 0.14);
    ctx.translate(x, y - bob); ctx.scale(s, s);
    if (o.assis) { ctx.fillStyle = Q.bois; rr(-9, -32, 18, 20, 4); ctx.fill(); ctx.fillStyle = L; rr(-9, -9, 7, 7, 2.5); ctx.fill(); rr(2, -9, 7, 7, 2.5); ctx.fill(); } // la chaise derrière, les jambes repliées
    else { ctx.fillStyle = L; rr(-8 + j, -9, 6, 10, 2.5); ctx.fill(); rr(2 - j, -9, 6, 10, 2.5); ctx.fill(); }
    const by0 = o.assis ? -22 : -27, bh = o.assis ? 15 : 20;
    ctx.fillStyle = o.haut; rr(-11, by0, 22, bh, 8); ctx.fill();
    if (o.mariniere) { ctx.fillStyle = '#3A86C8'; for (let k = 0; k < 3; k++) ctx.fillRect(-11, by0 + 4 + k * 5, 22, 2); }
    if (o.tablier) { ctx.fillStyle = '#fff'; rr(-7, by0 + 4, 14, bh - 6, 4); ctx.fill(); ctx.fillStyle = o.haut; rr(-2, by0 + 6, 4, 3, 1); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(-11, by0 + bh - 4, 22, 4, 3); ctx.fill();
    // les bras : tendus devant avec un plateau, ou le long du corps
    ctx.strokeStyle = o.peau; ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (o.plateau) { ctx.beginPath(); ctx.moveTo(-9, by0 + 5); ctx.lineTo(-7 + 6 * dir, by0 + 1); ctx.moveTo(9, by0 + 5); ctx.lineTo(7 + 6 * dir, by0 + 1); ctx.stroke(); }
    else if (!o.assis) { ctx.beginPath(); ctx.moveTo(-10, by0 + 5); ctx.lineTo(-12 - j * 0.5, by0 + 15); ctx.moveTo(10, by0 + 5); ctx.lineTo(12 + j * 0.5, by0 + 15); ctx.stroke(); }
    // la tête
    const hy = by0 - 8;
    ctx.fillStyle = o.peau; ctx.beginPath(); ctx.arc(0, hy, 10, 0, TAU); ctx.fill();
    if (o.toque) { ctx.fillStyle = '#fff'; rr(-8, hy - 19, 16, 10, 5); ctx.fill(); rr(-10, hy - 12, 20, 4, 2); ctx.fill(); }
    else if (o.coiffure === 3) { ctx.fillStyle = o.bonnet; rr(-10, hy - 20, 20, 12, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, hy - 20, 3, 0, TAU); ctx.fill(); ctx.fillStyle = o.bonnet; rr(-11, hy - 12, 22, 4, 2); ctx.fill(); }
    else { ctx.fillStyle = o.cheveux; ctx.beginPath(); ctx.arc(0, hy - 3, 10, Math.PI, TAU); ctx.fill(); if (dir === 2) { ctx.beginPath(); ctx.arc(0, hy, 10, 0, TAU); ctx.fill(); } if (o.coiffure === 1) { rr(-11, hy - 5, 4, 12, 2); ctx.fill(); rr(7, hy - 5, 4, 12, 2); ctx.fill(); } if (o.coiffure === 2) { ctx.beginPath(); ctx.arc(0, hy - 12, 4, 0, TAU); ctx.fill(); } }
    if (o.or) { ctx.fillStyle = L; rr(-12, hy - 13, 24, 4, 2); ctx.fill(); rr(-7, hy - 24, 14, 12, 3); ctx.fill(); } // le chapeau du mystère
    if (dir !== 2) { // le visage
      const ex = dir === 1 ? 3 : dir === -1 ? -3 : 0;
      ctx.fillStyle = L; ctx.beginPath(); ctx.arc(-4 + ex, hy - 1, 1.6, 0, TAU); ctx.arc(4 + ex, hy - 1, 1.6, 0, TAU); ctx.fill();
      if (o.lunettes) { ctx.strokeStyle = L; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-4 + ex, hy - 1, 3.5, 0, TAU); ctx.moveTo(7.5 + ex, hy - 1); ctx.arc(4 + ex, hy - 1, 3.5, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = L; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(ex, hy + 2, 3.2, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.fillStyle = '#FFB3B3'; ctx.beginPath(); ctx.arc(-7 + ex * 0.5, hy + 2, 1.8, 0, TAU); ctx.arc(7 + ex * 0.5, hy + 2, 1.8, 0, TAU); ctx.fill();
    }
    if (o.plateau) { ctx.fillStyle = '#C9B8AE'; rr(-12 + 6 * dir, by0 - 2, 24, 5, 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; rr(-10 + 6 * dir, by0 - 1, 20, 1.5, 1); ctx.fill(); if (o.produit != null) patisserie(o.produit, -8 + 6 * dir, by0 - 17, 16, 16); }
    if (o.cle) { ctx.save(); ctx.translate(12, by0 + 6); ctx.rotate(Math.sin(t * 20) * 0.5); ctx.fillStyle = '#8C8C8C'; rr(-2, -8, 4, 14, 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, -9, 4, 0, TAU); ctx.fill(); ctx.restore(); }
    if (o.sac) { ctx.fillStyle = o.sacCol; rr(10, by0 + 8, 10, 13, 2); ctx.fill(); ctx.strokeStyle = Q.bois; ctx.lineWidth = 1.2; ctx.strokeRect(10, by0 + 8, 10, 13); ctx.fillStyle = '#E8B46A'; rr(12, by0 + 3, 6, 6, 2); ctx.fill(); }
    ctx.restore();
  }
  function client(c) {
    const s = K * c.taille, marche = c.etat === 'entre' || c.etat === 'sort' || c.etat === 'vaTable' || (c.etat === 'attend' && c.glisse);
    if (c.or && !c.pris && c.etat === 'attend') { // halo et étincelles du client mystère
      ctx.fillStyle = 'rgba(255,200,74,.28)'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 24 * s, 24 * s, 32 * s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FFC84A'; for (let k = 0; k < 4; k++) { const a = t * 2 + k * 1.6; etincelle(c.x + Math.cos(a) * 22 * s, c.y - 24 * s + Math.sin(a * 1.3) * 26 * s, (4 + Math.sin(t * 6 + k) * 1.5) * s); }
    }
    const assis = c.etat === 'assis';
    perso(c.x, assis ? c.y + 2 : c.y, assis ? s * 0.8 : s, { haut: c.haut, peau: c.peau, cheveux: c.cheveux, coiffure: c.coiffure, lunettes: c.lunettes, bonnet: c.bonnet, dir: c.dir, marche, phase: c.phase, sac: c.sac && !assis, sacCol: c.sacCol, or: c.or, assis, alpha: c.alpha, mariniere: Q.vue === 'mer' && c.haut === '#FFFFFF' });
    if (c.hab && c.alpha > 0.5) { // l'étiquette de l'habitué
      ctx.font = '700 10px Nunito, sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(c.nom).width + 12, ty = c.y - (c.etat === 'assis' ? 50 : 56) * s;
      ctx.fillStyle = '#fff'; rr(c.x - w / 2, ty - 8, w, 15, 7); ctx.fill(); ctx.fillStyle = L; ctx.fillText(c.nom, c.x, ty + 3);
    }
  }
  function apprenti(a) {
    const s = K * 0.95, bounce = a.etat === 'four' && rush ? Math.abs(Math.sin(t * 8 + a.lane)) * 2 : 0, cuit = a.etat === 'four' || a.etat === 'depose';
    perso(a.x, a.y - bounce, s, { haut: HAUTS6[(a.i * 2 + 1) % 6], peau: PEAUX6[a.i % 6], cheveux: CHEVEUX[a.i % CHEVEUX.length], coiffure: 0, toque: true, tablier: true, dir: a.etat === 'panne' ? 0 : a.dir, marche: a.etat === 'porte' || a.etat === 'retour', phase: a.phase, plateau: a.plateau, produit: a.i, cle: a.etat === 'panne' });
    if (cuit && a.etat === 'four' && Math.random() < 0.04) vapeurs.push({ x: a.x + (Math.random() - 0.5) * 10, y: a.y - 40 * s, r: 2 + Math.random() * 2, life: 0.6 });
  }
  // ─── le boulanger : sa toque, son foulard, sa moustache, son col changent avec son titre ───
  function boulanger(x, y) {
    const peau = '#FFD7B5', resp = 1 + Math.sin(t * 1.6) * 0.012, s = 0.72 * K;
    ombre(x, y + 2, 20 * s, 5 * s, 0.14);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s * resp);
    ctx.fillStyle = '#fff'; rr(-22, -44, 44, 44, 14); ctx.fill();
    ctx.fillStyle = '#FF6B8B'; rr(-10, -44, 20, 26, 6); ctx.fill();
    if (rang >= 4) { ctx.fillStyle = '#FFC84A'; rr(-22, -8, 44, 5, 2); ctx.fill(); } // le maître : liseré doré au tablier
    if (rang >= 5) { ctx.fillStyle = '#2B5BD7'; rr(-22, -44, 14, 8, 3); ctx.fill(); ctx.fillStyle = '#fff'; rr(-7, -44, 14, 8, 3); ctx.fill(); ctx.fillStyle = '#E1496C'; rr(8, -44, 14, 8, 3); ctx.fill(); } // le col bleu-blanc-rouge du MOF
    if (rang >= 3) { ctx.fillStyle = '#E1496C'; rr(-14, -46, 28, 7, 3); ctx.fill(); } // le compagnon : foulard rouge
    const a = hop * 10; ctx.strokeStyle = peau; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-20, -32); ctx.lineTo(-30 + a, -12 + a * 0.4); ctx.moveTo(20, -32); ctx.lineTo(30 - a, -12 + a * 0.4); ctx.stroke();
    ctx.fillStyle = peau; ctx.beginPath(); ctx.arc(0, -58, 16, 0, TAU); ctx.fill();
    const th = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5);
    ctx.fillStyle = '#fff'; rr(-17, -64 - th, 34, th, rang === 0 ? 5 : 10); ctx.fill(); rr(-19, -68, 38, 7, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.06)'; rr(8, -64 - th, 9, th, 4); ctx.fill();
    if (rang >= 4) { ctx.fillStyle = '#FFC84A'; rr(-19, -68, 38, 3, 2); ctx.fill(); }
    ctx.fillStyle = L;
    if (blink > 3.2) { ctx.fillRect(-8, -60, 5, 2); ctx.fillRect(3, -60, 5, 2); }
    else { ctx.beginPath(); ctx.arc(-6, -60, 2, 0, TAU); ctx.arc(6, -60, 2, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = L; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -55, 6, 0.2, Math.PI - 0.2); ctx.stroke();
    if (rang >= 3) { ctx.strokeStyle = '#8C5A3C'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-7, -53); ctx.quadraticCurveTo(-3, -56, 0, -53); ctx.quadraticCurveTo(3, -56, 7, -53); ctx.stroke(); }
    ctx.fillStyle = '#FFB3B3'; ctx.beginPath(); ctx.arc(-11, -54, 2.5, 0, TAU); ctx.arc(11, -54, 2.5, 0, TAU); ctx.fill();
    if (rush) { ctx.fillStyle = '#9BD0FF'; ctx.beginPath(); ctx.arc(19, -66, 2.2, 0, TAU); ctx.fill(); }
    ctx.restore();
    if (pts > 0) { // un point de talent à dépenser : une bulle au-dessus de la toque
      const th2 = rang === 0 ? 10 : rang === 1 ? 22 : 22 + Math.min(14, (rang - 1) * 5), by = y - (78 + th2) * s + Math.sin(t * 3) * 2;
      ctx.fillStyle = '#fff'; rr(x + 8, by - 10, 24, 18, 8); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 12, by + 7); ctx.lineTo(x + 8, by + 13); ctx.lineTo(x + 18, by + 8); ctx.fill();
      ctx.fillStyle = '#9A84F0'; etincelle(x + 20, by - 1, 6);
    }
  }
  function etincelle(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); }
  // ─── petits décors ───
  function plante(x, y) { ombre(x, y + 16, 11, 3, 0.12); ctx.fillStyle = Q.comptoir; rr(x - 9, y, 18, 15, 5); ctx.fill(); ctx.fillStyle = '#5FD3A4'; for (const [ox, oy, r] of [[0, -7, 8], [-8, -2, 6], [8, -2, 6], [0, -16, 6]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, TAU); ctx.fill(); } ctx.fillStyle = '#3FB889'; ctx.beginPath(); ctx.arc(x - 4, y - 11, 3, 0, TAU); ctx.fill(); }
  function cadre(x, y) { ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x - 14, y + 2, 32, 24, 4); ctx.fill(); ctx.fillStyle = '#fff'; rr(x - 16, y, 32, 24, 4); ctx.fill(); ctx.strokeStyle = Q.bois; ctx.lineWidth = 3; ctx.strokeRect(x - 16, y, 32, 24); ctx.fillStyle = '#9ED8FF'; ctx.fillRect(x - 12, y + 4, 24, 10); ctx.fillStyle = '#5FD3A4'; ctx.beginPath(); ctx.moveTo(x - 12, y + 20); ctx.lineTo(x - 2, y + 9); ctx.lineTo(x + 6, y + 16); ctx.lineTo(x + 12, y + 11); ctx.lineTo(x + 12, y + 20); ctx.closePath(); ctx.fill(); }
  function horloge(x, y, d) {
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.arc(x + 1, y + 2, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill(); ctx.strokeStyle = Q.bois; ctx.lineWidth = 2.5; ctx.stroke();
    const h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * TAU - Math.PI / 2, m = d.getMinutes() / 60 * TAU - Math.PI / 2;
    ctx.strokeStyle = L; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(h) * 5, y + Math.sin(h) * 5); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(m) * 7.5, y + Math.sin(m) * 7.5); ctx.stroke();
    ctx.fillStyle = '#E1496C'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
  }
  function diplome(x, y) { ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(x - 9, y + 2, 22, 26, 3); ctx.fill(); ctx.fillStyle = Q.bois; rr(x - 11, y, 22, 26, 3); ctx.fill(); ctx.fillStyle = '#FFFDF5'; rr(x - 8, y + 3, 16, 20, 2); ctx.fill(); ctx.strokeStyle = '#B5A49A'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - 5, y + 8 + k * 4); ctx.lineTo(x + 5, y + 8 + k * 4); } ctx.stroke(); ctx.fillStyle = '#E1496C'; ctx.beginPath(); ctx.arc(x + 3, y + 19, 2.5, 0, TAU); ctx.fill(); }
  function guirlande(noel) { ctx.strokeStyle = Q.bois; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 14); ctx.quadraticCurveTo(W / 2, 40, W, 14); ctx.stroke(); for (let i = 0; i < 9; i++) { const u = (i + 0.5) / 9, x = u * W, y = 14 + 4 * (1 - Math.pow(2 * u - 1, 2)) * 6.5; if (noel) { ctx.fillStyle = Math.sin(t * 5 + i) > 0 ? ['#FF6B8B', '#5FD3A4', '#FFC84A', '#9BD0FF'][i % 4] : '#E8E0D5'; ctx.beginPath(); ctx.arc(x, y + 5, 3.5, 0, TAU); ctx.fill(); } else { ctx.fillStyle = PASTEL[i % PASTEL.length]; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 11); ctx.closePath(); ctx.fill(); } } }
  function fanions() { for (let i = 0; i < 12; i++) { const x = (i + 0.5) / 12 * W; ctx.fillStyle = ['#2B5BD7', '#FFFFFF', '#E1496C'][i % 3]; ctx.beginPath(); ctx.moveTo(x - 7, 16); ctx.lineTo(x + 7, 16); ctx.lineTo(x, 27); ctx.closePath(); ctx.fill(); } }
  function coeurs() { ctx.fillStyle = '#FF6B8B'; for (let i = 0; i < 6; i++) { const x = W * 0.5 + (i - 2.5) * 22, y = LAY.murH - 18 + Math.sin(t * 2 + i) * 2; ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.bezierCurveTo(x - 7, y - 2, x - 3, y - 7, x, y - 3); ctx.bezierCurveTo(x + 3, y - 7, x + 7, y - 2, x, y + 5); ctx.fill(); } }
  function ardoise(x, y) { ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08); ctx.fillStyle = Q.bois; rr(-13, -34, 26, 34, 3); ctx.fill(); ctx.fillStyle = '#2F3A36'; rr(-10, -31, 20, 26, 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-7, -26); ctx.lineTo(7, -26); ctx.moveTo(-7, -21); ctx.lineTo(4, -21); ctx.moveTo(-7, -16); ctx.lineTo(6, -16); ctx.stroke(); ctx.strokeStyle = '#FFD98A'; ctx.beginPath(); ctx.moveTo(-7, -11); ctx.lineTo(3, -11); ctx.stroke(); ctx.restore(); }
  function paillasson(x, y, couleur) { ctx.fillStyle = couleur ? Q.accent : Q.vue === 'ville' ? '#5A4A5E' : '#B9875A'; rr(x - 20, y - 4, 40, 9, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 16 + k * 9, y - 2, 5, 5); }
  function fleurs(x, y) { ctx.fillStyle = Q.comptoir2; rr(x - 6, y - 10, 12, 12, 3); ctx.fill(); ctx.strokeStyle = '#3FB889'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x - 4, y - 22); ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 24); ctx.moveTo(x, y - 10); ctx.lineTo(x + 4, y - 21); ctx.stroke(); for (const [ox, oy, col] of [[-4, -23, '#FF6B8B'], [0, -25, '#FFC84A'], [4, -22, '#B8A6FF']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + ox, y + oy, 3.2, 0, TAU); ctx.fill(); } }
  function chat(x, y) { const q = Math.sin(t * 3) * 3; ctx.fillStyle = '#F2A65A'; rr(x - 14, y - 11, 26, 11, 5); ctx.fill(); ctx.beginPath(); ctx.arc(x + 12, y - 11, 6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 8, y - 15); ctx.lineTo(x + 10, y - 20); ctx.lineTo(x + 12, y - 16); ctx.moveTo(x + 13, y - 16); ctx.lineTo(x + 15, y - 20); ctx.lineTo(x + 16, y - 15); ctx.fill(); ctx.strokeStyle = '#F2A65A'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.quadraticCurveTo(x - 22, y - 6 + q, x - 20, y - 15); ctx.stroke(); ctx.fillStyle = L; ctx.fillRect(x + 10, y - 12, 2, 1.5); ctx.fillRect(x + 14, y - 12, 2, 1.5); }
  function citrouille(x, y) { ctx.fillStyle = '#F28C28'; ctx.beginPath(); ctx.ellipse(x, y - 6, 9, 7, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#C96A14'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 4, y - 12); ctx.quadraticCurveTo(x - 6, y - 6, x - 4, y); ctx.moveTo(x + 4, y - 12); ctx.quadraticCurveTo(x + 6, y - 6, x + 4, y); ctx.stroke(); ctx.fillStyle = '#3FB889'; rr(x - 1.5, y - 16, 3, 5, 1); ctx.fill(); ctx.fillStyle = L; ctx.beginPath(); ctx.moveTo(x - 5, y - 8); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x - 3.5, y - 10.5); ctx.moveTo(x + 5, y - 8); ctx.lineTo(x + 2, y - 8); ctx.lineTo(x + 3.5, y - 10.5); ctx.fill(); ctx.fillRect(x - 4, y - 4, 8, 1.5); }
  function galette(x, y) { ctx.fillStyle = '#E8B46A'; ctx.beginPath(); ctx.ellipse(x, y - 4, 11, 4.5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#A8621F'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 7, y - 6); ctx.lineTo(x + 7, y - 2); ctx.moveTo(x - 7, y - 2); ctx.lineTo(x + 7, y - 6); ctx.stroke(); ctx.fillStyle = '#FFC84A'; ctx.beginPath(); ctx.moveTo(x - 7, y - 8); for (let k = 0; k < 4; k++) { ctx.lineTo(x - 7 + k * 4.7, y - 15); ctx.lineTo(x - 5 + k * 4.7, y - 9); } ctx.lineTo(x + 7, y - 8); ctx.closePath(); ctx.fill(); }
  function oeufs(x, y) { ['#FF9FB2', '#9BD0FF', '#B5E88A'].forEach((col, k) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + k * 8, y - 5, 3.5, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x + k * 8 - 2.5, y - 6, 5, 1.5); }); }
  function glaces(x, y) { for (let k = 0; k < 2; k++) { ctx.fillStyle = '#E8B46A'; ctx.beginPath(); ctx.moveTo(x + k * 10 - 4, y - 8); ctx.lineTo(x + k * 10 + 4, y - 8); ctx.lineTo(x + k * 10, y + 2); ctx.fill(); ctx.fillStyle = k ? '#FF9FB2' : '#9BE8C2'; ctx.beginPath(); ctx.arc(x + k * 10, y - 10, 4.5, 0, TAU); ctx.fill(); } }
  function sapin(x, y) { ombre(x, y + 1, 14, 3, 0.12); ctx.fillStyle = '#8B5A3C'; ctx.fillRect(x - 3, y - 6, 6, 8); ctx.fillStyle = '#2F6B4F'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 14 + k * 3, y - 6 - k * 10); ctx.lineTo(x, y - 22 - k * 10); ctx.lineTo(x + 14 - k * 3, y - 6 - k * 10); ctx.fill(); } for (let k = 0; k < 6; k++) { ctx.fillStyle = Math.sin(t * 4 + k) > 0 ? ['#FF6B8B', '#FFC84A', '#9BD0FF'][k % 3] : '#fff'; ctx.beginPath(); ctx.arc(x - 8 + (k * 7) % 16, y - 11 - k * 4.5, 2, 0, TAU); ctx.fill(); } ctx.fillStyle = '#FFC84A'; etincelle(x, y - 44, 4); }

  const API = { init, resize, frame, vente, texte, tap, fete, setRush, mystere, habitue, hit, hitBoulanger, hitMeuble, zones, forcer, hautBloc, visible, rendu, hauteurUtile, setAmenager, surServi: null,
    get amenager() { return amenager; }, get clients() { return clients.length; }, get apprentis() { return apprentis.length; }, get assis() { let n = 0; for (const c of clients) if (c.etat === 'assis') n++; return n; }, get mystereVisible() { return clients.some((c) => c.or && !c.pris && c.etat === 'attend'); } };
  return API;
})();
