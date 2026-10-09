/* LE FOURNIL — la vie de la boutique, sans dessin : le plan (LAY), les clients qui entrent, font la queue, s'attablent et repartent,
   les apprentis qui font la navette four → comptoir, les textes qui flottent, les vapeurs, les confettis, les passants et la météo dehors.
   Tout est en pixels CSS de l'écran (x = largeur, y = profondeur sur le sol) : la vue 3D projette ces coordonnées, les tests les mesurent. */
const VIE = (() => {
  'use strict';
  const G = GAME;
  let W = 1, H = 1, K = 1, LAY = null, miH = 0;
  const GRANDIT = 0.08; // sur un canvas haut, les personnages grandissent de 8 % au plus
  const TAU = Math.PI * 2;
  const clients = [], apprentis = [], textes = [], vapeurs = [], flocons = [], passants = [];
  let confetti = [], hop = 0, blink = 0, nextSpawn = 2, nextPassant = 5, t = 0, rush = false, rang = 0, pts = 0, affl = 0, Q = null, tags = [], force = {}, caisseFlash = 0, idSuivant = 1;
  const crans = { tables: 0, four: 0, vitrine: 0, caisse: 0, froid: 0, deco: 0 }, abordables = {}, prixDe = {}; let panneI = -1;
  const PASTEL = ['#FF9FB2', '#8FE3C2', '#C7B8FF', '#FFD98A', '#9BD0FF', '#FFB48A', '#B5E88A'];
  const PEAUX = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE3C9'];
  const CHEVEUX = ['#4A3328', '#2B2118', '#B8762E', '#E7C27A', '#8C8C8C', '#D9534F'];
  const PEAUX6 = ['#FFD7B5', '#F1B990', '#C68B59', '#8D5A3C', '#FFE3C9', '#5C3A21'], HAUTS6 = ['#FF6B8B', '#5FD3A4', '#B8A6FF', '#FFC84A', '#6CB8FF', '#FF9A62'];
  // les décors : murs, sol, comptoir, palette des clients, vue par la fenêtre
  const DECORS = {
    village: { id: 'village', mur: '#FFF1E3', mur2: '#FBE2CC', murStyle: 'lignes', sol: '#F3D9C0', sol2: 'rgba(255,255,255,.35)', solStyle: 'planches', comptoir: '#D9915C', comptoir2: '#F2B98A', bois: '#C8864F', accent: '#FF9FB2', hauts: PASTEL, vue: 'campagne' },
    paris: { id: 'paris', mur: '#EEF1F6', mur2: '#D9E0EA', murStyle: 'moulures', sol: '#E9ECF1', sol2: '#2F3542', solStyle: 'damier', comptoir: '#6F7D8C', comptoir2: '#B9C6D2', bois: '#3D4654', accent: '#2B3A55', hauts: ['#2B3A55', '#C9B79C', '#8A2B3A', '#E4D8C8', '#4D6A8A', '#D9A066'], vue: 'paris' },
    mer: { id: 'mer', mur: '#F4FBFF', mur2: '#D6EEF9', murStyle: 'bande', sol: '#EADFC9', sol2: 'rgba(255,255,255,.45)', solStyle: 'planches', comptoir: '#4F9FD1', comptoir2: '#A9D8F0', bois: '#DCE7EE', accent: '#3A86C8', hauts: ['#3A86C8', '#FFFFFF', '#F2C94C', '#FF8A80', '#8FD3F4', '#9BE8C2'], vue: 'mer' },
    montagne: { id: 'montagne', mur: '#EFDCC2', mur2: '#D8BE9A', murStyle: 'rondins', sol: '#B98A5E', sol2: 'rgba(0,0,0,.08)', solStyle: 'planches', comptoir: '#7A4E31', comptoir2: '#A86F48', bois: '#5A3A22', accent: '#A64B2A', hauts: ['#A64B2A', '#2F6B4F', '#E8D8B0', '#8C3B3B', '#4F6D8C', '#D98E4A'], vue: 'montagne' },
    ville: { id: 'ville', mur: '#F6F2EF', mur2: '#E4DCD6', murStyle: 'marbre', sol: '#3A3642', sol2: 'rgba(255,255,255,.08)', solStyle: 'marbre', comptoir: '#2E2A36', comptoir2: '#C9A96A', bois: '#C9A96A', accent: '#FF6B8B', hauts: ['#1F1F2B', '#FF6B8B', '#C9A96A', '#F5F5F5', '#7B61FF', '#3EC9A7'], vue: 'ville' },
  };
  Q = DECORS.village;

  // le bloc haut : mur, fournil, comptoir, file — le dessin de référence (390×228) à l'échelle ; le reste de la hauteur, c'est du sol en plus
  function hautBloc(w, h) { const kb = Math.min(1.1, Math.max(0.8, w / 390)); return 228 * kb * (1 + Math.min(GRANDIT, Math.max(0, h - 228 * kb) / 6000)); }
  function resize(width, height, mi) { W = width; H = height; if (mi) miH = mi; calculer(); }
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
      T, murH, spread: sp, W, H, K,
      fenetre: { x: W * 0.04, y: T * 0.05, w: W * 0.24, h: T * 0.21 },
      etagere: { x: W * 0.73, y: T * 0.05, w: W * 0.12 },
      cadre: { x: W * 0.36, y: T * 0.20 }, horloge: { x: W * 0.52, y: T * 0.22 }, diplome: { x: W * 0.60, y: T * 0.19 }, cadre2: { x: W * 0.66, y: T * 0.20 },
      appliques: [{ x: W * 0.35, y: T * 0.22 }, { x: W * 0.65, y: T * 0.22 }], lampe: { x: W * 0.5, y: T * 0.07 },
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
  const hauteurUtile = () => (LAY ? Math.min(H, LAY.utile) : H);
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
    const c = { id: idSuivant++, x: LAY.entree.x, y: LAY.entree.y, etat: 'entre', slot, spot, chemin: cheminVers(spot), wp: 0, v: (or ? 120 : 85 + Math.random() * 15) * K, dir: 0, alpha: 0,
      wait: or ? 8 : 1.2 + Math.random() * 1.5, haut: or ? '#FFC84A' : hauts[Math.floor(Math.random() * hauts.length)],
      peau: PEAUX[Math.floor(Math.random() * PEAUX.length)], cheveux: or ? '#E0A61E' : CHEVEUX[Math.floor(Math.random() * CHEVEUX.length)], taille: or ? 1.15 : 0.9 + Math.random() * 0.2, sac: false, phase: Math.random() * TAU,
      coiffure: or ? 0 : hiver && Math.random() < 0.5 ? 3 : Math.floor(Math.random() * 3), lunettes: !or && Math.random() < 0.2, bonnet: hauts[Math.floor(Math.random() * hauts.length)], sacCol: Math.random() < 0.5 ? '#F2D7B6' : '#E8C7A8',
      or: !!or, pris: false, siege: null, mange: 0 };
    c.mariniere = Q.vue === 'mer' && c.haut === '#FFFFFF';
    clients.push(c);
    return c;
  }
  // le client mystère : doré, il attend 8 s devant le comptoir ; touché, il laisse un pourboire
  function mystere() { if (!LAY || clients.some((c) => c.or)) return false; spawn(true); return true; }
  // un habitué : silhouette fixe, étiquette avec son prénom, il reste un peu plus longtemps et s'installe volontiers
  function habitue(hb) { if (!LAY || !hb || clients.some((c) => c.hab === hb.id)) return false; const c = spawn(); c.hab = hb.id; c.nom = hb.nom; c.haut = hb.haut; c.cheveux = hb.cheveux; c.peau = hb.peau; c.coiffure = hb.coiffure; c.lunettes = hb.id === 'dupuis'; c.taille = 1.05; c.wait = 3; c.mariniere = false; return true; }
  const mystereEnAttente = () => clients.find((c) => c.or && !c.pris && c.etat === 'attend') || null;
  function toucherMystere(c) { c.pris = true; c.wait = 0.2; }
  function hitBoulanger(x, y) { if (!LAY) return false; const b = LAY.boulanger; return Math.abs(x - b.x) < 26 * K && y > b.y - 64 * K && y < b.y + 4; }
  function hit(x, y) {
    for (const c of clients) {
      if (!c.or || c.pris || c.etat !== 'attend') continue;
      if (Math.abs(x - c.x) < 24 * K * c.taille && y > c.y - 52 * K * c.taille && y < c.y + 8) { toucherMystere(c); return true; }
    }
    return false;
  }
  // les zones de touche des meubles (en pixels) telles que le plan les définit ; la vue 3D remplace celles des meubles par leurs boîtes projetées
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
      if (c.etat === 'entre') { if (avancer(c, dt)) { c.etat = 'attend'; c.dir = 0; if (c.or) chasseChat(); } } // le chat court voir le client mystère pendant qu'il attend
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
      a.phase += dt * 9; a.grade = force.grades || G.gradeApprenti(st, a.i);
      const v = 70 * K * (rush ? 1.5 : 1) * dt;
      if (a.etat === 'four') { a.t -= dt; a.dir = 2; if (panneI === a.i) a.etat = 'panne'; else if (a.t <= 0) { a.plateau = true; a.etat = 'porte'; } }
      else if (a.etat === 'porte') { a.dir = 1; const cible = LAY.comptoirSlots[a.lane]; a.x = Math.min(cible, a.x + v); if (a.x >= cible) { a.etat = 'depose'; a.t = 0.5; a.dir = 0; } }
      else if (a.etat === 'depose') { a.t -= dt; if (a.t <= 0) { a.plateau = false; a.etat = 'retour'; } }
      else if (a.etat === 'retour') { a.dir = -1; const cible = LAY.fourSlots[a.lane]; a.x = Math.max(cible, a.x - v); if (a.x <= cible) { a.etat = 'four'; a.t = tCuisson(st, a.i); } }
      else if (a.etat === 'panne') { a.dir = 0; if (panneI !== a.i) { a.etat = 'four'; a.t = tCuisson(st, a.i); } }
      if (a.etat === 'four' && Math.random() < 0.04) vapeurs.push({ x: a.x + (Math.random() - 0.5) * 10, y: a.y - 40 * K, r: 2 + Math.random() * 2, life: 0.6 }); // la vapeur des fournées
    }
  }
  // ─── le chat : il dort sur le comptoir, saute, fait le tour (la plante, l'allée, le salon), s'assoit, remonte ; il court voir le client mystère ───
  // chat.haut : sur le comptoir ; chat.saut : 0 → 1 pendant un saut (descente ou montée) ; (x, y) : le point du sol (au pied du comptoir quand il est en haut)
  let chat = null;
  const piedComptoir = () => ({ x: LAY.chat.x, y: LAY.comptoir.y + LAY.comptoir.hTop + LAY.comptoir.hFace + 12 * K });
  // des coins libres : loin de la file et de l'allée (plus de 30K de l'axe des clients), au-dessus du tiroir à mi-hauteur
  const spotsChat = () => [{ x: LAY.plante.x + 24 * K, y: LAY.plante.y + 8 * K }, { x: LAY.ardoise.x + 44 * K, y: Math.min(LAY.ardoise.y - 4 * K, (miH || H) - 24 * K) }, { x: LAY.allee - 34 * K, y: LAY.tables[0].y + 12 * K }, { x: W * 0.47, y: LAY.T * 0.92 }];
  function versChat(cible, vite) { const c = chat; c.cible = cible; c.etat = 'marche'; c.vite = !!vite; }
  function majChat(st, dt) {
    if (!st.chat) { chat = null; return; }
    if (!chat) { const p = piedComptoir(); chat = { x: p.x, y: p.y, etat: 'dort', haut: true, saut: 0, t: 12 + Math.random() * 18, phase: 0, dir: 1, cible: null, vite: false, tours: 0, coeurs: [] }; }
    const c = chat; c.phase += dt * 8; c.t -= dt;
    for (let i = c.coeurs.length - 1; i >= 0; i--) { const h = c.coeurs[i]; h.y -= 20 * dt; h.life -= dt; if (h.life <= 0) c.coeurs.splice(i, 1); }
    if (force.chat) { // les captures : endormi sur le comptoir, ou assis dans l'allée
      if (force.chat === 'assis') { const sp = spotsChat()[3]; c.x = sp.x; c.y = sp.y; c.haut = false; c.etat = 'assis'; } else { const p = piedComptoir(); c.x = p.x; c.y = p.y; c.haut = true; c.etat = 'dort'; }
      c.saut = 0; return;
    }
    if (c.etat === 'dort') { if (c.t <= 0) { c.etat = 'descend'; c.saut = 0; c.dir = 0; } } // il saute face à la salle
    else if (c.etat === 'descend' || c.etat === 'monte') { c.saut = Math.min(1, c.saut + dt / 0.45); if (c.saut >= 1) { c.saut = 0; if (c.etat === 'descend') { c.haut = false; c.tours = 0; versChat(spotsChat()[Math.floor(Math.random() * 4)]); } else { c.haut = true; c.etat = 'dort'; c.t = 18 + Math.random() * 25; } } }
    else if (c.etat === 'marche') {
      const v = (c.vite ? 95 : 42) * K * dt, dx = c.cible.x - c.x, dy = c.cible.y - c.y, d = Math.hypot(dx, dy);
      c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy < 0 ? 2 : 0);
      if (d <= v) { c.x = c.cible.x; c.y = c.cible.y; if (c.cible.retour) { c.etat = 'monte'; c.saut = 0; c.dir = 2; } else { c.etat = 'assis'; c.dir = 0; c.t = c.vite ? 2.5 : 4 + Math.random() * 5; } }
      else { c.x += dx / d * v; c.y += dy / d * v; }
    }
    else if (c.etat === 'assis') { if (c.t <= 0) { if (++c.tours >= 3) { const p = piedComptoir(); versChat({ x: p.x, y: p.y, retour: true }); } else versChat(spotsChat()[Math.floor(Math.random() * 4)]); } }
  }
  function chasseChat() { if (chat && !chat.haut && chat.etat !== 'monte' && chat.etat !== 'descend' && LAY) { versChat({ x: LAY.mystere.x + 16 * K, y: LAY.mystere.y + 6 * K }, true); chat.tours = Math.min(chat.tours, 2); } }
  function ronron() { if (!chat) return; const x = chat.x, y = (chat.haut ? LAY.chat.y : chat.y) - 26 * K; for (let k = 0; k < 3; k++) chat.coeurs.push({ x: x + (k - 1) * 9, y: y - k * 4, life: 1 + k * 0.15 }); }

  let etat = null; // l'instantané de la dernière frame, pour la vue
  function frame(dt, st, now) {
    if (!LAY) calculer();
    dt = Math.min(0.25, Math.max(0, dt));
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
    majChat(st, dt);
    // dehors : des passants devant la fenêtre et la météo de saison, en fractions de la fenêtre (u : 0 → 1 de gauche à droite, v : 0 → 1 de haut en bas)
    nextPassant -= dt;
    if (nextPassant <= 0 && Q.vue !== 'mer' && Q.vue !== 'montagne') { nextPassant = 6 + Math.random() * 10; const g = Math.random() < 0.5; passants.push({ u: g ? -0.15 : 1.15, vu: (g ? 1 : -1) * (0.17 + Math.random() * 0.13), s: 0.7 + Math.random() * 0.3, col: ['#2B3A55', '#6B4A3A', '#3D5A4A', '#7A3B4A'][Math.floor(Math.random() * 4)], phase: Math.random() * TAU }); }
    for (const p of passants) { p.u += p.vu * dt; p.phase += dt * 8; }
    for (let i = passants.length - 1; i >= 0; i--) if (passants[i].u < -0.2 || passants[i].u > 1.2) passants.splice(i, 1);
    const meteo = tags.includes('neige') || Q.vue === 'montagne' ? 'neige' : tags.includes('feuilles') ? 'feuilles' : tags.includes('paques') ? 'petales' : null;
    if (meteo && flocons.length < (meteo === 'neige' ? 30 : 12) && Math.random() < dt * (meteo === 'neige' ? 12 : 4)) flocons.push({ u: Math.random(), v: -0.05, vv: meteo === 'neige' ? 0.2 + Math.random() * 0.3 : 0.35 + Math.random() * 0.3, vu: meteo === 'neige' ? 0 : 0.08 + Math.random() * 0.1, r: meteo === 'neige' ? 1.2 + Math.random() * 1.6 : 2.5, a: Math.random() * TAU, type: meteo });
    for (const fl of flocons) { fl.v += fl.vv * dt; fl.u += (fl.vu + Math.sin(t * 2 + fl.a) * 0.06) * dt; fl.a += dt * 3; }
    for (let i = flocons.length - 1; i >= 0; i--) if (flocons[i].v > 1.08 || flocons[i].type !== meteo) flocons.splice(i, 1);
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
    const niv = st.stations.map((s) => s.niv), staffs = st.stations.filter((s) => s.staff).length, bonus = Object.keys(st.ameliorations).length;
    etat = { st, d, hour, sk: ciel(hour), taux, tags, Q, crans, abordables, prixDe, rang, pts, affl, rush, hop, caisseFlash, panneI, t, blink, niv, staffs, bonus, chaud: st.stations[0].actif || taux > 0, dt };
    return etat;
  }

  const API = { hautBloc, resize, frame, vente, texte, tap, fete, setRush, mystere, habitue, hit, hitBoulanger, zones, forcer, hauteurUtile, ciel, toucherMystere, mystereEnAttente, ronron, piedComptoir, surServi: null,
    DECORS, PASTEL, PEAUX6, HAUTS6, CHEVEUX, TAU,
    get LAY() { return LAY; }, get K() { return K; }, get W() { return W; }, get H() { return H; }, get t() { return t; }, get rush() { return rush; }, get Q() { return Q; }, get tags() { return tags; }, get force() { return force; }, get etat() { return etat; },
    get clients() { return clients; }, get apprentis() { return apprentis; }, get textes() { return textes; }, get vapeurs() { return vapeurs; }, get confetti() { return confetti; }, get flocons() { return flocons; }, get passants() { return passants; }, get chat() { return chat; }, get crans() { return crans; }, get abordables() { return abordables; }, get prixDe() { return prixDe; },
    get nClients() { return clients.length; }, get nApprentis() { return apprentis.length; }, get assis() { let n = 0; for (const c of clients) if (c.etat === 'assis') n++; return n; }, get mystereVisible() { return !!mystereEnAttente(); } };
  return API;
})();
if (typeof module !== 'undefined') module.exports = VIE;
