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
  const crans = { tables: 0, four: 0, vitrine: 0, caisse: 0, froid: 0, deco: 0, bar: 0, banquette: 0, terrasse: 0 }, abordables = {}, prixDe = {}; let panneI = -1;
  let vueEv = null; // la vue d'un événement (st.vueEv : la boutique hantée) : son décor, ses saisons, les déguisements de ses clients
  let places = { tables: 0, bar: 0, banquette: 0, terrasse: 0 }, dehors = 0; // les places assises actives (GAME.places) ; dehors : l'envie de terrasse (0 la nuit, 1 les beaux jours)
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
    // la Maison hantée (src/boutiquehantee.js : la boutique pendant l'événement, en qualité éco ou sans HD) : papier peint violet nuit à rayures et ses
    // petites chauves-souris, parquet sombre, bois de cercueil, accents citrouille ; les cadres sombres, le portrait de l'ancêtre ; dehors, le jardin hanté
    hantee: { id: 'hantee', mur: '#56418A', mur2: '#34285A', murStyle: 'hantee', sol: '#4A3854', sol2: 'rgba(0,0,0,.14)', solStyle: 'planches', comptoir: '#4A2F45', comptoir2: '#8E6BD8', bois: '#3A2730', accent: '#E8782F', cadre: '#2A1E33', portrait: true, plante: '#8E6BD8', hauts: ['#FF8A3D', '#8E6BD8', '#7CD992', '#FFE7A3', '#E1496C', '#6CB8FF'], vue: 'hantee' },
  };
  Q = DECORS.village;
  // les quartiers du parcours (la gare, l'île… : GAME.QUARTIERS) portent leur décor dans leurs données (theme) : lu tel quel, une fois
  const THEMES = new Map();
  function decorBase(q) { if (!q) return DECORS.village; if (DECORS[q.id]) return DECORS[q.id]; if (!q.theme) return DECORS.village; let d = THEMES.get(q.id); if (!d) { d = Object.assign({ id: q.id }, q.theme); THEMES.set(q.id, d); } return d; }
  // le standing (GAME.standing : 0 à 5, un palier toutes les cinq boutiques) : le même quartier, ses couleurs gardées, monte en gamme.
  // Palier 0 : le décor tel quel. Ensuite une variante (id distinct, « paris-s3 », mise en cache : la scène la reconstruit une fois) :
  //   1 Belle boutique : lambris bas au mur, filet laiton au comptoir, plantes hautes, lanternes à la porte, tapis d'entrée, fleurs ;
  //   2 Maison réputée : moulures tout le long, sol en chevrons (le marbre reste du marbre), store rayé à la porte ;
  //   3 Grande maison : pilastres et corniche dorés, colonnes à l'entrée, vitrine et cadres dorés ;
  //   4 Maison de prestige : marbre veiné au mur, au sol et sur le comptoir, tapis rouge et cordons devant la porte ;
  //   5 Palais du goût : joints d'or au sol, la statue et le trophée.
  // Les teintes s'approfondissent un peu à chaque palier (bois, comptoir) ; l'or passe du laiton (1-2) à l'or vif (3+).
  // Les objets du standing s'ajoutent à objets (src/scene.js les pose ; MEUBLES.standing les construit).
  const hexRgb = (h) => { const m = /^#([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgbHex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const melanger = (a, b, k) => { const x = hexRgb(a), y = hexRgb(b); return x && y ? rgbHex(x.map((v, i) => v + (y[i] - v) * k)) : a; };
  const LUXE = new Map(), OBJETS_STANDING = [[], ['plante', 'fleurs', 'plantesHautes', 'lanternes', 'tapisEntree'], ['marquise'], ['colonnes'], ['tapisRouge'], ['statue', 'trophee']];
  function decor(q, s) {
    const b = decorBase(q); s = Math.max(0, Math.min(5, Math.floor(+s) || 0)); if (!s) return b;
    const k = b.id + '-s' + s; let d = LUXE.get(k); if (d) return d;
    const f = 0.035 * s, sombre = (c) => melanger(c, '#2A1A12', f), marbreBase = b.solStyle === 'marbre';
    const objets = [...new Set([...(b.objets || []), ...OBJETS_STANDING.slice(1, s + 1).flat()])];
    d = Object.assign({}, b, {
      id: k, base: b.id, standing: s, objets,
      comptoir: sombre(b.comptoir), bois: sombre(b.bois), mur2: melanger(b.mur2, b.bois, 0.06 * s),
      or: s >= 3 ? '#E8B84A' : '#C9A35A', // le laiton, puis l'or
      lambris: true, panneaux: s >= 2, pilastres: s >= 3, corniche: s >= 3, murStyle: s >= 4 ? 'marbre' : b.murStyle,
      solStyle: s >= 4 ? 'marbre2' : s >= 2 && !marbreBase ? 'chevrons' : b.solStyle, solOr: s >= 5,
      sol: s >= 4 && !marbreBase ? melanger(b.sol, '#FFFFFF', 0.25) : b.sol,
      solB: s >= 2 && !marbreBase ? (hexRgb(b.sol2) ? melanger(b.sol, b.sol2, 0.22) : melanger(b.sol, '#6B4A35', 0.12)) : b.sol2,
    });
    LUXE.set(k, d); return d;
  }

  // le bloc haut : mur, fournil, comptoir, file — le dessin de référence (390×228) à l'échelle ; le reste de la hauteur, c'est du sol en plus
  function hautBloc(w, h) { const kb = Math.min(1.1, Math.max(0.8, w / 390)); return 228 * kb * (1 + Math.min(GRANDIT, Math.max(0, h - 228 * kb) / 6000)); }
  function resize(width, height, mi) { W = width; H = height; if (mi) miH = mi; calculer(); }
  // ─── le plan de la boutique : les x en fractions de la largeur, les y en fractions du bloc haut T, puis la salle qui descend dans le sol ───
  // La salle (lot A des meubles), de haut en bas sous la file d'attente :
  //   · deux rangées de trois tables (2 places chacune), à gauche de l'allée ; à droite de l'allée, le coin salon (banquette face à la salle,
  //     table basse, tapis, lampe, fauteuil) ;
  //   · le bar contre la devanture, tabourets face à la rue ; la devanture, sa porte au bout de l'allée ;
  //   · dehors, le trottoir et sa terrasse (trois tables bistrot), puis la chaussée jusqu'au bas de l'écran.
  // Les écarts ont un minimum (360 × 640 : tout tient au-dessus du tiroir fermé) et grandissent jusqu'à un plafond quand l'écran est haut.
  // Les places assises sont dans LAY.sieges ({ id, x, y, dir, zone, meuble, rang, voie }) ; voie : le chemin depuis l'allée (sans le siège).
  // LAY.emplacements : les rectangles nommés des meubles du plan (zones de touche) ; LAY.mobiles : les meubles déplaçables et leurs emprises.
  const ECARTS = [['a0', 40, 12], ['gR', 70, 18], ['gBar', 60, 24], ['gDev', 10, 0], ['gTer', 44, 22], ['gBord', 34, 12], ['gBas', 8, 0]]; // [nom, minimum, en plus au plus] (×K)
  // « Tout déplaçable » (st.amenagement, GAME.nettoyerAmenagement) : chaque table, le bar (un bloc), le coin salon (un bloc) et les tables de
  // la terrasse (en x seulement) se posent sur la grille LAY.grille (cases de 24 px à l'échelle, depuis le bas de la file) ; une case nulle :
  // la place d'origine. Le plan d'origine (aucun aménagement) donne exactement les places et les voies dessinées à la main ci-dessous ;
  // un plan aménagé calcule ses voies sur une grille fine (BFS des cases libres depuis l'allée, puis le fil tendu) jusqu'à l'abord de chaque place.
  // Chaque meuble déplaçable a son emprise au sol (LAY.mobiles : le meuble, ses chaises et leur dégagement) ; valider() refuse, avec la raison,
  // une place qui chevauche, sort de la salle, coupe la file, l'allée, le passage des apprentis ou la porte, ou laisse une place inatteignable.
  let amenDemande = null, codeDemande = '', amenRef; // l'aménagement lu dans st (nettoyé), son code, l'objet d'où il vient
  const MARGE = 3, PAS_FIN = 6, LOIN_ALLEE = 30; // (×K) le dégagement d'un passant autour des emprises ; le pas de la grille des voies ; la distance du chat à l'axe des clients
  function calculer(bouge) {
    const anciens = LAY && LAY.sieges ? new Map(LAY.sieges.map((s) => [s.id, s])) : null;
    let L = plan(amenDemande, false);
    if (L.sig && !L.verdict.ok) L = plan(null, false); // l'aménagement ne tient pas sur cet écran (la photo d'un copain, un autre téléphone) : le plan d'origine
    K = L.K; LAY = L;
    if (anciens) for (const s of L.sieges) { // un recalcul ne vide pas les chaises ; un meuble déplacé fait lever ses clients
      const o = anciens.get(s.id); if (!o || !o.occ) continue;
      const c = o.occ; s.occ = c; s.actif = o.actif; c.siege = s;
      const deplace = bouge && (Math.abs(o.x - s.x) > 0.5 || Math.abs(o.y - s.y) > 0.5);
      if (c.etat === 'assis') { c.x = s.x; c.y = s.y; if (deplace) leve(c); } // il suit sa chaise, se lève et repart par sa nouvelle voie
      else if (deplace && c.etat === 'vaTable') { // en chemin : il renonce et fait demi-tour par où il est venu, puis l'allée et la porte du fond
        const e = LAY.entree; s.occ = null; c.siege = null; c.etat = 'sort'; c.v = 100 * K;
        c.chemin = [...(c.chemin || []).slice(0, c.wp).reverse(), { x: LAY.allee, y: LAY.alleeHaut }, { x: e.x, y: LAY.alleeHaut }, { x: e.x, y: e.y }]; c.wp = 0;
      }
    }
    if (bouge && chat && !chat.haut && chat.etat !== 'monte' && chat.etat !== 'descend') { // le chat, assis ou en route là où un meuble vient d'être posé, va au coin libre le plus proche
      const sp = spotsChat().filter(Boolean), surMeuble = (x, y) => LAY.mobiles.some((m) => m.dedans && dansR(m.r, x, y, 0));
      const cibleMorte = chat.etat === 'marche' && chat.cible && !chat.cible.retour && !sp.some((q) => Math.hypot(q.x - chat.cible.x, q.y - chat.cible.y) < 1);
      if (sp.length && (surMeuble(chat.x, chat.y) || cibleMorte)) versChat(sp.reduce((b, q) => (Math.hypot(q.x - chat.x, q.y - chat.y) < Math.hypot(b.x - chat.x, b.y - chat.y) ? q : b)));
    }
  }
  function plan(a, verifier, focus) { // focus : le meuble qu'on déplace (la raison parle de lui)
    const T = hautBloc(W, H), K = T / 228;
    const sp = Math.max(0, Math.min(240 * K, H - T - 60)); // le sol en plus sous le bloc haut (le présentoir ne vient que s'il y en a assez)
    const murH = T * 0.33, allee = W * 0.70;
    // les écarts verticaux de la salle : du bas de la file (Y0) au bas utile (juste au-dessus du tiroir fermé, qui dépasse de 37 px)
    const Y0 = T * 0.86, dispo = Math.max(0, H - 40 - Y0), mini = ECARTS.reduce((s, e) => s + e[1], 0) * K, plus = ECARTS.reduce((s, e) => s + e[2], 0) * K;
    const f = Math.min(1, dispo / mini), u = dispo > mini ? Math.min(1, (dispo - mini) / plus) : 0, E = {};
    for (const [n, a0, b] of ECARTS) E[n] = (a0 * f + b * u) * K;
    const yA = Y0 + E.a0, yB = yA + E.gR, barY = yB + E.gBar, dev = barY + E.gDev, terY = dev + E.gTer, bord = terY + E.gBord, rue = terY + E.gTer * 0.45; // rue : le passage du trottoir, devant les tables
    const pas = 24 * K, nMax = (G.AMEN_MAX == null ? 35 : G.AMEN_MAX) + 1; // une case doit tenir dans le code compact (GAME.AMEN_MAX : un chiffre de base 36)
    const grille = { x0: 0, y0: Y0, pas, cols: Math.min(nMax, Math.floor(W / pas)), rangs: Math.min(nMax, Math.floor((bord - Y0) / pas)) }; // la grille du « tout déplaçable » (un grand écran n'en montre que les 36 premières colonnes)
    const gx = (c) => (c + 0.5) * pas, gy = (r) => Y0 + (r + 0.5) * pas; // le centre d'une case
    const sieges = [], tables = [];
    const S = (id, x, y, dir, zone, meuble, rang, voie, o) => { const s = Object.assign({ id, x, y, dir, zone, meuble, rang, voie, occ: null, actif: false }, o || {}); sieges.push(s); return s; };
    const abords = new Map(); // id du siège → ses abords possibles (plan aménagé) : [[premier point hors emprise, …suite jusqu'au siège exclu], …]
    // les tables : la n° 1 près de l'allée, puis vers la gauche, rangée du haut d'abord ; la voie passe devant la rangée (jamais entre les chaises)
    [[0.56, yA], [0.34, yA], [0.12, yA], [0.56, yB], [0.34, yB], [0.12, yB]].forEach(([fx, y0], i) => {
      const p = a && a.tables[i], x = p ? gx(p[0]) : W * fx, y = p ? gy(p[1]) : y0;
      const ya = y + 20 * K, voie = (sx) => [{ x: allee, y: ya }, { x: sx, y: ya }], tb = { x, y, sieges: [] };
      tb.sieges.push(S(`table${i + 1}.g`, x - 19 * K, y + 4, 1, 'table', 'tables', i, voie(x - 19 * K), { table: tb }), S(`table${i + 1}.d`, x + 19 * K, y + 4, -1, 'table', 'tables', i, voie(x + 19 * K), { table: tb }));
      for (const s of tb.sieges) abords.set(s.id, [[{ x: s.x, y: ya }], [{ x: s.x, y: y - 20 * K }]]); // par devant, sinon par derrière
      tables.push(tb);
    });
    // le bar : le comptoir contre la devanture, quatre tabourets derrière, face à la rue (dir 0 : face à l'écran) ; on l'aborde par derrière
    const pb = a && a.bar, bxc = pb ? gx(pb[0]) : 0, bY = pb ? gy(pb[1]) : barY;
    const bar = pb ? { x0: bxc - W * 0.24, x1: bxc + W * 0.24, y: bY, h: 12 * K } : { x0: W * 0.08, x1: W * 0.56, y: barY, h: 12 * K };
    [0.14, 0.26, 0.38, 0.50].forEach((fx, i) => { const x = pb ? bar.x0 + W * (fx - 0.08) : W * fx, y = bY - 19 * K, ya = bY - 35 * K; S(`bar${i + 1}`, x, y, 0, 'bar', 'bar', i, [{ x: allee, y: ya }, { x, y: ya }], { table: { x, y: bY } }); abords.set(`bar${i + 1}`, [[{ x, y: ya }]]); });
    // le coin salon : la banquette (deux places face à la salle), la table basse devant, le fauteuil à sa gauche tourné vers elle
    // (sx(o) : o ×K à droite du centre de la banquette — écrit comme à l'origine, W − (30 − o)·K, quand le salon n'a pas bougé)
    const ps = a && a.salon, yC = ps ? gy(ps[1]) : yA, sx = (o) => (ps ? gx(ps[0]) + o * K : W - (30 - o) * K);
    const bq = { x: sx(0), y: yC, table: { x: sx(-8), y: yC + 24 * K }, lampe: { x: sx(-32), y: yC - 16 * K }, tapis: { x: sx(-8), y: yC + 12 * K, w: 66 * K, h: 44 * K } };
    S('banquette.g', sx(-13), yC, 0, 'banquette', 'banquette', 0, [{ x: allee, y: yC }], { table: bq.table });
    S('banquette.d', sx(13), yC, 0, 'banquette', 'banquette', 1, [{ x: allee, y: yC + 42 * K }, { x: sx(16), y: yC + 42 * K }, { x: sx(16), y: yC + 10 * K }], { table: bq.table });
    S('fauteuil', sx(-36), yC + 24 * K, 1, 'banquette', 'banquette', 2, [{ x: allee, y: yC + 24 * K }], { table: bq.table });
    { const y12 = yC + 12 * K, bas = yC + 44 * K; // par la gauche, par la droite, ou par-dessous (entre la table basse et le bord droit)
      abords.set('banquette.g', [[{ x: sx(-58), y: y12 }, { x: sx(-13), y: y12 }], [{ x: sx(34), y: y12 }, { x: sx(-13), y: y12 }], [{ x: sx(16), y: bas }, { x: sx(16), y: y12 }, { x: sx(-13), y: y12 }]]);
      abords.set('banquette.d', [[{ x: sx(16), y: bas }, { x: sx(16), y: yC + 10 * K }], [{ x: sx(34), y: y12 }, { x: sx(16), y: y12 }], [{ x: sx(-58), y: y12 }, { x: sx(16), y: y12 }]]);
      abords.set('fauteuil', [[{ x: sx(-36), y: bas }], [{ x: sx(-58), y: yC + 24 * K }]]); }
    // la terrasse : trois tables bistrot sur le trottoir ; on sort par la porte de la devanture et on repart par la rue, sur le côté
    const terrasse = [];
    [0.40, 0.88, 0.16].forEach((fx, i) => {
      const c = a && a.terrasse[i], x = c != null ? gx(c) : W * fx, tb = { x, y: terY, sieges: [] }, voie = (sx2) => [{ x: allee, y: dev + 4 * K }, { x: allee, y: rue }, { x: sx2, y: rue }];
      tb.sieges.push(S(`terrasse${i + 1}.g`, x - 19 * K, terY + 4, 1, 'terrasse', 'terrasse', 2 * i, voie(x - 19 * K), { table: tb }), S(`terrasse${i + 1}.d`, x + 19 * K, terY + 4, -1, 'terrasse', 'terrasse', 2 * i + 1, voie(x + 19 * K), { table: tb }));
      terrasse.push(tb);
    });
    const R = (x, y, w, h) => ({ x, y, w, h });
    // les emprises des meubles déplaçables (le meuble, ses chaises, leur dégagement) et les obstacles fixes de la salle
    const mobiles = [];
    tables.forEach((t, i) => mobiles.push({ id: `table${i + 1}`, type: 'tables', i, nom: `la table ${i + 1}`, x: t.x, y: t.y, r: R(t.x - 27 * K, t.y - 14 * K, 54 * K, 28 * K), dedans: true, sieges: t.sieges.map((s) => s.id) }));
    mobiles.push({ id: 'bar', type: 'bar', i: 0, nom: 'le bar', x: (bar.x0 + bar.x1) / 2, y: bar.y, r: R(bar.x0 - 2, bar.y - 28 * K, bar.x1 - bar.x0 + 4, 34 * K), dedans: true, sieges: ['bar1', 'bar2', 'bar3', 'bar4'] });
    mobiles.push({ id: 'salon', type: 'banquette', i: 0, nom: 'le coin salon', x: bq.x, y: yC, r: R(sx(-52), yC - 34 * K, 80 * K, 72 * K), dedans: true, sieges: ['banquette.g', 'banquette.d', 'fauteuil'] });
    terrasse.forEach((t, i) => mobiles.push({ id: `terrasse${i + 1}`, type: 'terrasse', i, nom: `la table ${i + 1} de la terrasse`, x: t.x, y: t.y, r: R(t.x - 27 * K, t.y - 14 * K, 54 * K, 28 * K), dedans: false, sieges: t.sieges.map((s) => s.id) }));
    const presentoir = { x: W * 0.79, y: barY - T * 0.07, w: W * 0.17, h: T * 0.07 }, plante = { x: W * 0.045, y: barY - 8 * K }, chien = { x: W * 0.80, y: barY - 34 * K };
    const porte = { x0: W * 0.64, x1: W * 0.76 };
    const fixes = [{ nom: 'la plante', r: R(plante.x - 9, plante.y - 9, 18, 18) }, { nom: 'le présentoir', r: R(presentoir.x, presentoir.y, presentoir.w, presentoir.h) }, { nom: 'le coin du chien', r: R(chien.x - 14 * K, chien.y - 8 * K, 28 * K, 14 * K) }];
    // le standing (src/meubles.js standing, paliers 3 et 4) : les colonnes et les cordons dorés posés sur le trottoir, de part et d'autre de la
    // porte de la devanture (mêmes mesures, ramenées à l'écran) ; leur place est gardée à tous les paliers, comme celle d'un meuble pas encore
    // acheté (un aménagement reste valide quand la boutique monte en gamme). Les places d'honneur (plantes, statue, trophée) sont au pied du
    // fournil, au-dessus de la salle : aucun meuble déplaçable n'y monte (r.y < Y0 est refusé).
    const SYp = Math.sin(52 * Math.PI / 180), vide0 = Math.min(26, ((rue - dev) / SYp - 8) * 0.55), standingSol = [
      { nom: 'les colonnes de l’entrée', r: R(porte.x0 - 14, dev - SYp, 10, 10 * SYp) }, { nom: 'les colonnes de l’entrée', r: R(porte.x1 + 4, dev - SYp, 10, 10 * SYp) },
      { nom: 'les cordons dorés', r: R(porte.x0 - 6, dev + 9.5 * SYp, 6, (vide0 + 3.5) * SYp) }, { nom: 'les cordons dorés', r: R(porte.x1, dev + 9.5 * SYp, 6, (vide0 + 3.5) * SYp) }]; // (le poteau avant en zd + 10,5 : il dégage le socle des colonnes)
    const sig = a ? (G.codeAmenagement ? G.codeAmenagement(a) : JSON.stringify(a)) : '';
    // les voies d'un plan aménagé (et la vérification : chevauchements, passages, places atteignables)
    const marche = sig || verifier ? grilleVoies({ W, K, Y0, dev, allee, mobiles, fixes }) : null;
    const verdict = verifier || sig ? verifierPlan({ W, H, K, T, Y0, dev, allee, porte, mobiles, fixes, standingSol, sieges, abords, marche, focus }) : { ok: true };
    if (sig && verdict.ok) for (const s of sieges) if (s.zone !== 'terrasse') s.voie = verdict.voies.get(s.id);
    // le coin du chat, les spots où il va s'asseoir, le tapis rose des tables : à l'origine, ceux du dessin ; aménagés, sur une place libre
    const sal = mobiles.find((m) => m.id === 'salon');
    let chat = R(sx(-22), yC + 54 * K, 24 * K, 16 * K);
    const spots = [{ x: chat.x + chat.w / 2, y: chat.y + chat.h / 2 }, { x: sig ? bar.x1 + W * 0.06 : W * 0.62, y: bar.y - 4 * K }, null, { x: W * 0.45, y: T * 0.88 }];
    if (sig && marche) {
      // libre : dans la salle, hors des meubles, loin de l'allée (plus de LOIN_ALLEE·K de l'axe des clients) et du seuil de la devanture
      const loinAllee = (r) => r.x + r.w <= allee - LOIN_ALLEE * K || r.x >= allee + LOIN_ALLEE * K, seuilP = R(porte.x0, dev - 22 * K, porte.x1 - porte.x0, 22 * K);
      const libreR = (r) => r.y >= Y0 && r.y + r.h <= dev - 4 && r.x >= 2 && r.x + r.w <= W - 2 && !mobiles.some((m) => m.dedans && inter(m.r, r)) && !fixes.some((o) => inter(o.r, r)) && loinAllee(r) && !inter(r, seuilP);
      if (!libreR(chat)) { // à côté du coin salon, sinon la case libre de la grille la plus proche de lui
        const cases = []; for (let r = 0; r < grille.rangs; r++) for (let c = 0; c < grille.cols; c++) cases.push(R(gx(c) - 12 * K, gy(r) - 8 * K, 24 * K, 16 * K));
        const d2 = (r) => (r.x + r.w / 2 - sal.x) ** 2 + (r.y + r.h / 2 - yC) ** 2;
        chat = [R(sal.r.x - 26 * K, yC + 10 * K, 24 * K, 16 * K), R(sal.r.x + sal.r.w + 2 * K, yC + 10 * K, 24 * K, 16 * K), R(sx(-22), sal.r.y - 18 * K, 24 * K, 16 * K)].find(libreR) || cases.filter(libreR).sort((a, b) => d2(a) - d2(b))[0] || chat;
      }
      spots[0] = { x: chat.x + chat.w / 2, y: chat.y + chat.h / 2 };
      const horsAllee = (x) => Math.abs(x - allee) >= LOIN_ALLEE * K; // les spots 0 et 1 : loin de l'allée, comme à l'origine
      for (const k of [0, 1, 3]) spots[k] = marche.prochePlace(spots[k], k < 2 ? horsAllee : null);
    }
    let tapis = { x: W * 0.02, y: yA - 26 * K, w: W * 0.56 + 44 * K - W * 0.02, h: yB - yA + 50 * K }; // le tapis rose (déco 4) : sous les tables
    if (sig) { // sous les premières tables, tant qu'il ne passe pas sous le bar ni le coin salon
      const autres = mobiles.filter((m) => m.id === 'bar' || m.id === 'salon').map((m) => m.r);
      for (let n = 1; n <= 6; n++) {
        const ts = tables.slice(0, n), x0 = Math.max(2, Math.min(...ts.map((t) => t.x)) - 36 * K), y0 = Math.max(Y0, Math.min(...ts.map((t) => t.y)) - 26 * K);
        const r = R(x0, y0, Math.min(W - 2, Math.max(...ts.map((t) => t.x)) + 36 * K) - x0, Math.min(dev - 2, Math.max(...ts.map((t) => t.y)) + 24 * K) - y0);
        if (n > 1 && autres.some((o) => inter(o, r))) break; tapis = r;
      }
    }
    const tx = Math.min(...tables.map((t) => t.x)), ty = Math.min(...tables.map((t) => t.y));
    return {
      T, murH, spread: sp, W, H, K,
      fenetre: { x: W * 0.04, y: T * 0.05, w: W * 0.24, h: T * 0.21 },
      etagere: { x: W * 0.73, y: T * 0.05, w: W * 0.12 },
      cadre: { x: W * 0.39, y: T * 0.20 }, horloge: { x: W * 0.52, y: T * 0.22 }, diplome: { x: W * 0.60, y: T * 0.19 }, cadre2: { x: W * 0.66, y: T * 0.20 },
      appliques: [{ x: W * 0.38, y: T * 0.22 }, { x: W * 0.65, y: T * 0.22 }], lampe: { x: W * 0.5, y: T * 0.07 },
      arriere: { x: W * 0.292, y: T * 0.20, w: W * 0.054, h: murH - T * 0.20 }, // la petite porte de l'arrière-boutique, entre la fenêtre et le tableau (src/arriere.js)
      porte: { x: W * 0.86, y: T * 0.04, w: W * 0.11, h: murH - T * 0.04 },
      entree: { x: W * 0.915, y: murH }, paillasson: { x: W * 0.915, y: murH + 9 },
      deco: { x: W * 0.80, y: T * 0.36 }, plante, sapin: { x: W * 0.655, y: T * 0.42 },
      froid: { x: W * 0.005, y: T * 0.12, w: W * 0.085, h: T * 0.34 },
      four: { x: W * 0.11, y: T * 0.30, w: W * 0.18, h: T * 0.24 },
      plan: { x: W * 0.01, y: T * 0.71, w: W * 0.14, h: T * 0.08 }, // le plan de travail, sous la chambre froide, à gauche des apprentis
      presentoir, // les baguettes debout, contre la devanture, à droite de la porte (fixe : le bar déplacé ne l'emmène pas)
      comptoir: { x: W * 0.31, y: T * 0.50, w: W * 0.32, hTop: T * 0.06, hFace: T * 0.14 },
      caisse: { x: W * 0.61, y: T * 0.50 }, fleurs: { x: W * 0.34, y: T * 0.515 }, chat: { x: W * 0.40, y: T * 0.51 }, saison: { x: W * 0.55, y: T * 0.515 },
      boulanger: { x: W * 0.45, y: T * 0.53 },
      lanes: [0.57, 0.64, 0.71].map((f) => T * f), fourSlots: [0.16, 0.20, 0.24].map((f) => W * f), comptoirSlots: [0.255, 0.27, 0.285].map((f) => W * f),
      file: [0.61, 0.55, 0.49, 0.43].map((f) => ({ x: W * f, y: T * 0.76 })), debord: [{ x: W * 0.70, y: T * 0.66 }, { x: W * 0.70, y: T * 0.58 }],
      mystere: { x: W * 0.35, y: T * 0.78 }, allee, alleeHaut: T * 0.40,
      textes: { x: W * 0.50, y: T * 0.60 }, ardoise: { x: W * 0.57, y: dev + 15 * K }, // l'ardoise du jour, dehors, à gauche de la porte
      chien, // le chien du quartier, couché entre le coin salon et le présentoir
      // la salle : les sièges, les tables, le bar, le coin salon, la devanture et le trottoir
      sieges, tables, terrasse, bar, banquette: bq, rangees: [yA, yB], devanture: { y: dev, porte }, trottoir: { y: dev, rue, bord },
      tapis,
      emplacements: {
        tables: sig ? R(tx - 34 * K, ty - 24 * K, Math.max(...tables.map((t) => t.x)) - tx + 68 * K, Math.max(...tables.map((t) => t.y)) - ty + 40 * K) : R(W * 0.12 - 34 * K, yA - 24 * K, W * 0.44 + 68 * K, yB - yA + 40 * K),
        bar: R(bar.x0 - 4, bar.y - 36 * K, bar.x1 - bar.x0 + 8, 36 * K + bar.h),
        banquette: R(sx(-52), yC - 34 * K, 80 * K, 72 * K),
        terrasse: R(W * 0.04, dev + 4, W * 0.92, bord - dev - 4),
        chat, // le coin du chat : aucun meuble, aucun passage
      },
      grille, // la grille du « tout déplaçable » (st.amenagement)
      utile: Math.min(H, bord + 24 * K),
      chatSpots: spots, mobiles, fixes, standingSol, sig, verdict, abords,
    };
  }
  const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; // deux rectangles qui se recouvrent (se toucher ne compte pas)
  const dansR = (r, x, y, m) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
  // la grille fine des voies : des cases de PAS_FIN·K, une colonne exactement sur l'allée ; libre : à plus de MARGE·K de toute emprise de la salle
  function grilleVoies(o) {
    const { W, K, Y0, dev, allee, mobiles, fixes } = o, s = PAS_FIN * K, m = MARGE * K;
    const k0 = Math.floor((allee - 3) / s), k1 = Math.floor((W - 3 - allee) / s), nc = k0 + k1 + 1, nr = Math.max(1, Math.floor((dev - 5 - Y0) / s));
    const X = (i) => allee + (i - k0) * s, Yr = (j) => Y0 + s / 2 + j * s;
    const obs = mobiles.filter((x) => x.dedans).map((x) => x.r).concat(fixes.map((x) => x.r));
    const bloque = (x, y) => x < 3 || x > W - 3 || y < Y0 - 1 || y > dev - 5 || obs.some((r) => dansR(r, x, y, m));
    const libre = new Uint8Array(nc * nr); for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) libre[j * nc + i] = bloque(X(i), Yr(j)) ? 0 : 1;
    const par = new Int32Array(nc * nr).fill(-2), file = [];
    for (let j = 0; j < nr; j++) { const q = j * nc + k0; if (libre[q]) { par[q] = -1; file.push(q); } } // les sources : la colonne de l'allée
    for (let h = 0; h < file.length; h++) {
      const q = file[h], i = q % nc, j = (q - i) / nc;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nc || b >= nr) continue; const n = b * nc + a; if (libre[n] && par[n] === -2) { par[n] = q; file.push(n); } }
    }
    const vue = (p, q2) => { const n = Math.ceil(Math.hypot(q2.x - p.x, q2.y - p.y) / 2); for (let k = 0; k <= n; k++) if (bloque(p.x + (q2.x - p.x) * k / n, p.y + (q2.y - p.y) * k / n)) return false; return true; };
    const cases = (p) => { // les cases atteintes les plus proches d'un point, d'où on le voit
      const i = Math.round((p.x - allee) / s) + k0, j = Math.round((p.y - Y0 - s / 2) / s), out = [];
      for (let r = 0; r <= 2 && !out.length; r++) for (let b = j - r; b <= j + r; b++) for (let a = i - r; a <= i + r; a++) { if (a < 0 || b < 0 || a >= nc || b >= nr) continue; const q = b * nc + a; if (par[q] !== -2 && vue({ x: X(a), y: Yr(b) }, p)) out.push(q); }
      return out;
    };
    function chemin(p) { // les points de l'allée jusqu'à p (le fil tendu), ou null si p est inatteignable
      if (bloque(p.x, p.y)) return null; const c = cases(p); if (!c.length) return null;
      const pts = [p]; for (let q = c[0]; q >= 0; q = par[q]) { const i = q % nc; pts.push({ x: X(i), y: Yr((q - i) / nc) }); }
      pts.reverse(); const out = [pts[0]]; let i = 0;
      while (i < pts.length - 1) { let j = i + 1; while (j + 1 < pts.length && vue(pts[i], pts[j + 1])) j++; out.push(pts[j]); i = j; }
      out[0] = { x: allee, y: out[0].y }; return out;
    }
    const atteint = (p) => !bloque(p.x, p.y) && cases(p).length > 0;
    function prochePlace(p, ok) { // la case libre atteinte la plus proche d'un point (les spots du chat) ; ok(x, y) : un filtre en plus
      if (atteint(p) && (!ok || ok(p.x, p.y))) return p; let best = null, d = 1e9;
      for (let q = 0; q < nc * nr; q++) if (par[q] !== -2) { const i = q % nc, x = X(i), y = Yr((q - i) / nc), e = Math.hypot(x - p.x, y - p.y); if (e < d && (!ok || ok(x, y))) { d = e; best = { x, y }; } }
      return best || p;
    }
    return { chemin, atteint, prochePlace, vue, bloque };
  }
  // la vérification d'un plan : { ok, raison, id (le meuble en faute) } ; voies : les chemins calculés (plan aménagé valide)
  function verifierPlan(o) {
    const { W, H, K, Y0, dev, allee, porte, fixes, sieges, abords, marche, focus } = o, mobiles = o.mobiles.slice().sort((a, b) => (b.id === focus) - (a.id === focus)); // le meuble déplacé d'abord
    const non = (m, raison) => ({ ok: false, raison, id: m ? m.id : null });
    const corridor = { x: allee - 12 * K, y: Y0, w: 24 * K, h: dev - Y0 }, seuil = { x: porte.x0, y: dev - 22 * K, w: porte.x1 - porte.x0, h: 22 * K };
    for (const m of mobiles) {
      const r = m.r, cx = r.x + r.w / 2;
      if (r.y + r.h > H - 37) return non(m, `${maj(m.nom)} serait caché${m.id === 'salon' || m.id === 'bar' ? '' : 'e'} sous le tiroir.`);
      if (!m.dedans) { // la terrasse : sur le trottoir, en x seulement, jamais devant la porte
        if (r.x < 1 || r.x + r.w > W - 1) return non(m, 'Ça sort de la terrasse.');
        if (r.x < porte.x1 + 2 && r.x + r.w > porte.x0 - 2) return non(m, 'Ça bloque la porte de la devanture.');
        const so = (o.standingSol || []).find((x) => inter(r, x.r)); if (so) return non(m, `${maj(so.nom)} sont déjà là.`);
        continue;
      }
      if (r.x < 1 || r.x + r.w > W - 1) return non(m, 'Ça sort de la salle.');
      if (r.y < Y0) return non(m, cx > allee ? 'Ça couperait le chemin de la porte du fond.' : cx < W * 0.31 ? 'Ça couperait le passage des apprentis.' : 'Ça couperait la file d’attente.');
      if (r.y + r.h > dev - 1) return non(m, inter(r, { x: porte.x0, y: dev - 30, w: porte.x1 - porte.x0, h: 60 }) ? 'Ça bloque la porte de la devanture.' : 'Ça sort de la salle.');
      if (inter(r, corridor)) return non(m, 'Ça bloque l’allée.');
      if (inter(r, seuil)) return non(m, 'Ça bloque la porte de la devanture.');
      const fx = fixes.find((x) => inter(r, x.r)); if (fx) return non(m, `${maj(fx.nom)} est déjà là.`);
    }
    for (let i = 0; i < mobiles.length; i++) for (let j = i + 1; j < mobiles.length; j++) if (mobiles[i].dedans === mobiles[j].dedans && inter(mobiles[i].r, mobiles[j].r)) return Object.assign(non(mobiles[i], `Ça touche ${mobiles[j].nom}.`), { avec: mobiles[j].id }); // (i = 0 : le meuble déplacé, s'il est en cause)
    const voies = new Map();
    for (const s of sieges) {
      if (s.zone === 'terrasse') continue;
      let v = null; for (const ab of abords.get(s.id) || []) { const c = marche.chemin(ab[0]); if (c) { v = c.concat(ab.slice(1)); break; } } // la suite de l'abord est dessinée dans l'emprise du meuble
      if (!v) { const m = mobiles.find((x) => x.sieges.includes(s.id)); return non(m, `Plus personne ne pourrait s’asseoir ${m.type === 'tables' ? 'à ' + m.nom : m.id === 'bar' ? 'au bar' : 'dans le coin salon'}.`); }
      voies.set(s.id, v);
    }
    return { ok: true, voies };
  }
  const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
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
    if (modeVie !== '' && vueEv && vueEv.deguisements && !or) c.deg = vueEv.deguisements[Math.floor(Math.random() * vueEv.deguisements.length)]; // la boutique hantée : chacun vient déguisé
    clients.push(c);
    return c;
  }
  // le client mystère : doré, il attend 8 s devant le comptoir ; touché, il laisse un pourboire
  function mystere() { if (!LAY || clients.some((c) => c.or)) return false; spawn(true); return true; }
  // un habitué : silhouette fixe, étiquette avec son prénom, il reste un peu plus longtemps et s'installe volontiers
  function habitue(hb) { if (!LAY || !hb || clients.some((c) => c.hab === hb.id)) return false; const c = spawn(); c.hab = hb.id; c.nom = hb.nom; c.haut = hb.haut; c.cheveux = hb.cheveux; c.peau = hb.peau; c.coiffure = hb.coiffure; c.lunettes = hb.id === 'dupuis'; c.taille = 1.05; c.wait = 3; c.mariniere = false; return true; }
  // pour les captures et les tests : un client déjà installé à une place libre d'un coin ('table', 'bar', 'banquette', 'terrasse'), pour longtemps
  function installer(zone, duree) {
    if (!LAY) return false; const s = LAY.sieges.find((x) => x.actif && !x.occ && (!zone || x.zone === zone)); if (!s) return false;
    const c = spawn(); c.slot = -2; c.siege = s; s.occ = c; c.x = s.x; c.y = s.y; c.alpha = 1; c.etat = 'assis'; c.dir = s.dir; c.sac = true; c.mange = duree || 60; return true;
  }
  const mystereEnAttente = () => clients.find((c) => c.or && !c.pris && c.etat === 'attend') || null;
  function toucherMystere(c) { c.pris = true; c.wait = 0.2; }
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
    const b = LAY.boulanger, f = LAY.four, fr = LAY.froid, c = LAY.comptoir, k = crans.tables, T = LAY.tables, cz = LAY.caisse, dz = LAY.deco, m = LAY.mystere, em = LAY.emplacements;
    const actives = T.slice(0, Math.max(1, k)), tx = Math.min(...actives.map((t) => t.x)) - 30 * K, ty = Math.min(...actives.map((t) => t.y)) - 22 * K;
    return {
      boulanger: { x: b.x - 26 * K, y: b.y - 64 * K, w: 52 * K, h: 68 * K },
      four: { x: f.x, y: f.y, w: f.w, h: f.h }, froid: { x: 0, y: fr.y, w: Math.max(44, fr.x + fr.w), h: fr.h },
      vitrine: { x: c.x, y: c.y + c.hTop, w: c.w * 0.75, h: c.hFace + 4 },
      caisse: { x: cz.x - 22, y: cz.y - 22, w: 44, h: 44 }, deco: { x: dz.x - 22, y: dz.y - 22, w: 44, h: 44 },
      tables: { x: tx, y: ty, w: Math.max(...actives.map((t) => t.x)) + 30 * K - tx, h: Math.max(...actives.map((t) => t.y)) + 14 * K - ty },
      bar: { ...em.bar }, banquette: { ...em.banquette }, terrasse: { ...em.terrasse },
      mystere: { x: m.x - 22, y: m.y - 50, w: 44, h: 58 }, entree: { x: LAY.entree.x, y: LAY.entree.y, w: 0, h: 0 },
    };
  }

  // ─── la vie de la boutique ───
  // les sièges actifs : ceux des meubles achetés (GAME.places : n tables, n tabourets, n places du coin salon, n places dehors)
  function activer() { for (const s of LAY.sieges) s.actif = s.rang < (places[s.meuble] || 0); }
  const ENVIE = { table: 1, bar: 0.8, banquette: 0.3, terrasse: 1.2 }; // le poids de chaque coin (par place libre) quand on choisit où s'asseoir
  function siegeLibre(c) { // où s'asseoir : l'habitué file sur la banquette ; les autres tirent un coin au sort, la terrasse selon le temps
    const libres = LAY.sieges.filter((s) => s.actif && !s.occ); if (!libres.length) return null;
    if (force.zone) return libres.find((s) => s.zone === force.zone) || null; // les tests et les captures : un coin imposé
    if (c && c.hab) { const b = libres.find((s) => s.zone === 'banquette'); if (b) return b; }
    let tot = 0; const poids = libres.map((s) => { const p = ENVIE[s.zone] * (s.zone === 'terrasse' ? dehors : 1); tot += p; return p; });
    if (tot <= 0) return null;
    let r = Math.random() * tot; for (let i = 0; i < libres.length; i++) { r -= poids[i]; if (r <= 0 && poids[i] > 0) return libres[i]; }
    return libres.find((s, i) => poids[i] > 0) || null;
  }
  const DUREE = { table: 1, bar: 0.45, banquette: 1.7, terrasse: 1.25 }; // au bar on boit et on repart ; sur la banquette on s'attarde
  // repu, il se lève : LEVER secondes encore à sa place (c.leveT, qui décompte ; le siège et son couvert encore à lui) avant de repartir ; les clients
  // 3D (src/clients3d.js) s'y relèvent en ramassant leur sac posé par terre, les chibis restent assis ce temps-là
  const LEVER = 0.9;
  function avancer(c, dt) { // suit son chemin ; rend true à l'arrivée
    const p = c.chemin[c.wp]; if (!p) return true;
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), pas = c.v * dt * (rush ? 1.3 : 1);
    c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy < 0 ? 2 : 0);
    if (d <= pas) { c.x = p.x; c.y = p.y; c.wp++; return c.wp >= c.chemin.length; }
    c.x += dx / d * pas; c.y += dy / d * pas; return false;
  }
  function leve(c) { // il se lève et repart : par sa voie, l'allée et la porte du fond ; depuis la terrasse, par la rue (le côté le plus proche)
    c.leveT = null;
    const s = c.siege, assis = c.etat === 'assis'; s.occ = null; c.siege = null; c.wp = 0; c.etat = 'sort'; c.v = 100 * K;
    if (!assis) { c.chemin = cheminSortie(c); return; } // en route vers un siège qui a disparu (nouvelle boutique) : demi-tour par l'allée
    if (s.zone === 'terrasse') { const rue = LAY.trottoir.rue; c.chemin = [{ x: s.x, y: rue }, { x: s.x < W * 0.6 ? -30 * K : W + 30 * K, y: rue }]; return; }
    c.chemin = [...s.voie.slice().reverse(), { x: LAY.allee, y: LAY.alleeHaut }, { x: LAY.entree.x, y: LAY.alleeHaut }, { x: LAY.entree.x, y: LAY.entree.y }];
  }
  function servi(st, c) { // au comptoir : le client est compté, l'habitué noté — exactement comme avant
    c.sac = !c.or || c.pris;
    st.stats.clients++; G.noter(st, 'clients', 1);
    if (c.hab) { const r = G.servirHabitue(st, c.hab); if (r.ok && API.surServi) API.surServi(r); }
    libererPlace(c);
    const envie = Math.min(0.9, 0.45 + 0.1 * Math.min(4, places.tables) + 0.03 * (places.bar + places.banquette + places.terrasse)), siege = !c.or && (force.assis || c.hab || Math.random() < envie) ? siegeLibre(c) : null;
    if (siege) { c.siege = siege; siege.occ = c; c.chemin = [{ x: LAY.allee, y: c.y }, ...siege.voie, { x: siege.x, y: siege.y }]; c.wp = 0; c.etat = 'vaTable'; }
    else { c.chemin = cheminSortie(c); c.wp = 0; c.etat = 'sort'; c.v = 100 * K; if (modeVie !== '') { c.humeur = 'content'; c.joie = 1.2; } } // la boutique hantée : il fête son achat sur place (Cheer) avant de repartir
  }
  function libererPlace(c) { // sa place dans la file se libère : ceux de derrière avancent d'un cran
    const slotLibre = c.slot; c.slot = -2;
    if (slotLibre >= 0) for (const o of clients) if (o.slot > slotLibre && o.slot < 6 && (o.etat === 'entre' || o.etat === 'attend')) { o.slot--; o.spot = spotDe(o.slot); if (o.etat === 'attend') { o.glisse = true; } else { o.chemin[o.chemin.length - 1] = { x: o.spot.x, y: o.spot.y }; o.chemin[o.chemin.length - 2] = { x: LAY.allee, y: o.spot.y }; } }
  }
  // la boutique hantée (src/boutiquehantee.js : servir, fache) : un client part tout de suite, content (il fête son achat, puis s'en va) ou
  // fâché (il repart sans payer, à grands pas) ; assis, il se lève. Rend false s'il n'est pas (ou plus) là
  function congedier(id, humeur) {
    const c = clients.find((x) => x.id === id); if (!c || c.etat === 'sort' || c.etat === 'parti' || !LAY) return false;
    const content = humeur !== 'fache';
    if (c.etat === 'assis' || c.etat === 'vaTable') { leve(c); }
    else { libererPlace(c); c.glisse = false; c.chemin = cheminSortie(c); c.wp = 0; c.etat = 'sort'; c.v = (content ? 100 : 150) * K; }
    c.humeur = content ? 'content' : 'fache'; c.joie = content ? 1.2 : 0; c.pris = true;
    return true;
  }
  // la boutique hantée (src/boutiquehantee.js : entrer) : un client-monstre de la file des règles (src/hantee.js, servir) entre, de la sorte
  // donnée, et attend au comptoir qu'on le serve (congedier 'content') ou qu'il s'en aille (congedier 'fache') : personne ne le sert à sa
  // place. Rend son id (null : pas encore de plan)
  function accueillir(sorte) { if (!LAY) return null; const c = spawn(); if (sorte) c.deg = sorte; c.garde = true; c.wait = Infinity; return c.id; }
  // l'état d'un client pour l'écran de l'événement : 'entre' (il arrive), 'file' (il attend au comptoir), 'assis' (installé ou en route vers sa place), 'sort'
  const etatClient = (c) => (c.etat === 'attend' ? 'file' : c.etat === 'assis' || c.etat === 'vaTable' ? 'assis' : c.etat === 'sort' || c.etat === 'parti' ? 'sort' : 'entre');
  function majClients(st, dt) {
    for (const c of clients) {
      c.phase += dt * 9;
      if (c.alpha < 1 && c.etat !== 'sort') c.alpha = Math.min(1, c.alpha + dt * 3); // (le fondu d'entrée ; à la sortie, il s'efface sur le dernier bout de chemin)
      if (c.etat === 'entre') { if (avancer(c, dt)) { c.etat = 'attend'; c.dir = 0; if (c.or) chasseChat(); } } // le chat court voir le client mystère pendant qu'il attend
      else if (c.etat === 'attend') {
        if (c.glisse) { const dx = c.spot.x - c.x; if (Math.abs(dx) < 1) { c.x = c.spot.x; c.glisse = false; } else c.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt); }
        c.wait -= dt; if (c.wait <= 0) servi(st, c);
      }
      else if (c.etat === 'vaTable') { if (!c.siege.actif) leve(c); else if (avancer(c, dt)) { c.etat = 'assis'; c.dir = c.siege.dir; c.mange = (4 + Math.random() * 4) * (rush ? 0.6 : 1) * DUREE[c.siege.zone] * (c.hab ? 1.3 : 1); } }
      else if (c.etat === 'assis') { c.mange -= dt; if (!c.siege.actif) leve(c); else if (c.mange <= 0) { if (c.leveT == null) c.leveT = LEVER; else if ((c.leveT -= dt) <= 0) leve(c); } } // repu (il se lève, puis repart), ou son meuble a disparu (nouvelle boutique : tout de suite)
      else if (c.etat === 'sort') { if (c.joie > 0) { c.joie -= dt; c.dir = 0; continue; } if (c.wp >= c.chemin.length - 1) c.alpha = Math.max(0, c.alpha - dt * 3); if (avancer(c, dt)) c.etat = 'parti'; } // (content : il fête d'abord, face à la salle)
    }
    for (let i = clients.length - 1; i >= 0; i--) if (clients[i].etat === 'parti') clients.splice(i, 1);
  }
  const tCuisson = (st, i) => Math.min(6, Math.max(1.5, G.temps(st, i) * 0.6)) * (rush ? 0.6 : 1);
  function majApprentis(st, dt) {
    const nVis = LAY.T < 190 ? 2 : 3, staffes = [];
    for (let i = st.stations.length - 1; i >= 0 && staffes.length < nVis; i--) { const s = st.stations[i]; if (s.staff && s.niv > 0) staffes.push(i); } // les apprentis des recettes les plus avancées : les recettes de boutique passent sur les plateaux
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
  // le coin du chat (LAY.emplacements.chat, près du coin salon), le bout du bar, le pied du plan de travail, et le milieu entre la file et les tables
  const spotsChat = () => { const c = LAY.chatSpots, p = LAY.plan; return [c[0], c[1], { x: p.x + p.w + 10 * K, y: Math.min(p.y + p.h + 6 * K, (miH || H) - 24 * K) }, c[3]]; }; // (LAY.chatSpots : sur une place libre quand la salle est aménagée)
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
  function souffle(n) { // le mini-dragon caressé crache un petit nuage de farine devant lui (des vapeurs blanches qui montent et s'étalent)
    if (!chat || !LAY) return; const d = chat.dir === 1 ? 1 : chat.dir === -1 ? -1 : 0, x = chat.x + d * 18 * K, y = (chat.haut ? LAY.chat.y : chat.y) - (d ? 12 : 4) * K;
    for (let k = 0; k < (n || 7); k++) vapeurs.push({ x: x + (Math.random() - 0.5) * 16 * K, y: y + (Math.random() - 0.5) * 8 * K, r: (3 + Math.random() * 4) * K, life: 0.9 + Math.random() * 0.5 });
  }

  let etat = null; // l'instantané de la dernière frame, pour la vue
  function frame(dt, st, now) {
    if (!LAY) calculer();
    dt = Math.min(0.25, Math.max(0, dt));
    t += dt;
    const d = G.paris(now), hour = force.heure != null ? force.heure : d.getUTCHours() + d.getUTCMinutes() / 60; // l’heure de Paris (à lire en getUTC…), comme les heures de pointe et les habitués
    const taux = G.tauxParSeconde(st);
    rang = G.rangTitre(st); pts = G.ptsTalents(st); affl = G.talent(st, 'affluence');
    vueEv = st.vueEv || null; // la boutique hantée : le décor et les saisons de l'événement, pas ceux du quartier
    // un client né entre la bascule et cette image (une vente juste après setEvenement : vueEv n'était pas encore lu) s'habille ici, avant
    // que la scène ne le bâtisse : jamais un client « sans déguisement » dans la boutique hantée, même dans l'image où il naît
    if (modeVie !== '' && vueEv && vueEv.deguisements) for (const c of clients) if (!c.deg && !c.or) c.deg = vueEv.deguisements[Math.floor(Math.random() * vueEv.deguisements.length)];
    Q = vueEv && DECORS[vueEv.decor] ? DECORS[vueEv.decor] : decor(G.QUARTIERS[G.quartier(st)], G.standing ? G.standing(st) : 0); tags = force.saison || (vueEv && vueEv.tags) || G.saison(now);
    if (st.amenagement !== amenRef) { amenRef = st.amenagement; const n = G.nettoyerAmenagement ? G.nettoyerAmenagement(st.amenagement) : null, c = n ? G.codeAmenagement(n) : ''; if (c !== codeDemande) { codeDemande = c; amenDemande = n; calculer(true); } } // un meuble déplacé (ou une autre boutique) : le plan suit
    for (const id of ['bar', 'banquette', 'terrasse']) crans[id] = G.mobilierCran(st, id); // (avant que GAME.MOBILIER les connaisse : cran 0)
    for (const m of G.MOBILIER) { crans[m.id] = G.mobilierCran(st, m.id); prixDe[m.id] = G.prixMeuble(st, m.id); abordables[m.id] = crans[m.id] < m.max && st.coins >= prixDe[m.id]; }
    places = G.places(st);
    activer();
    // la terrasse : personne dehors la nuit ni sous la neige ; les beaux jours (belle saison, jours de marché : GAME.terrassePleine), elle se remplit
    dehors = hour < 8 || hour >= 21 || tags.includes('neige') ? 0 : G.terrassePleine(st) || force.zone === 'terrasse' ? 1 : 0.15;
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

  // ─── basculer(mode) : la boutique hantée (mode 'hantee') et la boutique ('') ne partagent pas leur salle. En entrant dans l'événement, la
  //     vie de la boutique (clients, apprentis, chat, textes, vapeurs, flocons, passants, confettis, minuteries) est mise de côté telle
  //     quelle ; l'événement part d'une salle vide ; en sortant, la sienne est jetée et celle de la boutique revient (chaque client
  //     retrouve sa place par l'id du siège : un siège disparu entre-temps, il repart par l'allée) ───
  let modeVie = '', garde = null;
  function basculer(m) {
    m = m || ''; if (m === modeVie) return false;
    const vider = () => { for (const a of [clients, apprentis, textes, vapeurs, flocons, passants]) a.length = 0; confetti = []; chat = null; if (LAY) for (const s of LAY.sieges) s.occ = null; };
    if (modeVie === '') garde = { clients: clients.slice(), apprentis: apprentis.slice(), textes: textes.slice(), vapeurs: vapeurs.slice(), flocons: flocons.slice(), passants: passants.slice(), confetti, chat, nextSpawn, nextPassant, hop, caisseFlash, Q, tags };
    vider(); nextSpawn = 0.6; nextPassant = 3; modeVie = m;
    if (m === '') vueEv = null; // de retour : plus de déguisements ni de décor de l'événement, même avant la prochaine frame (une vente peut tomber avant)
    if (m === '' && garde) {
      const g = garde; garde = null;
      clients.push(...g.clients); apprentis.push(...g.apprentis); textes.push(...g.textes); vapeurs.push(...g.vapeurs); flocons.push(...g.flocons); passants.push(...g.passants);
      confetti = g.confetti; chat = g.chat; nextSpawn = g.nextSpawn; nextPassant = g.nextPassant; hop = g.hop; caisseFlash = g.caisseFlash; Q = g.Q || DECORS.village; tags = g.tags || G.saison(Date.now()); // le décor de la boutique, tel qu'on l'a laissé
      if (LAY) for (const c of clients) {
        if (!c.siege) continue; const s = LAY.sieges.find((x) => x.id === c.siege.id);
        if (s && !s.occ) { s.occ = c; c.siege = s; if (c.etat === 'assis') { c.x = s.x; c.y = s.y; } }
        else { c.siege = null; c.etat = 'sort'; c.wp = 0; c.v = 100 * K; c.chemin = cheminSortie(c); }
      }
    }
    return true;
  }

  // ─── « tout déplaçable » : ce que le mode Déplacer demande (src/ui.js, src/scene.js) ───
  // l'aménagement courant (nettoyé) ou un neuf, tout à l'origine
  const vide = () => ({ v: 1, tables: [null, null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] });
  const copie = (a) => { const n = a && G.nettoyerAmenagement(a); return n ? { v: 1, tables: n.tables.map((p) => (p ? p.slice() : null)), bar: n.bar && n.bar.slice(), salon: n.salon && n.salon.slice(), terrasse: n.terrasse.slice() } : vide(); };
  // valider(st, proposition) : la proposition (un aménagement, ses cases peuvent sortir de la grille) tient-elle sur cet écran ? { ok, raison, id }
  function valider(st, prop) {
    if (!LAY) calculer();
    const a = prop === undefined ? (st && st.amenagement) : prop;
    if (a != null && (typeof a !== 'object' || a.v !== 1 || !Array.isArray(a.tables) || a.tables.length !== 6 || !Array.isArray(a.terrasse) || a.terrasse.length !== 3)) return { ok: false, raison: 'Ce plan est abîmé.', id: null };
    const ent = (p) => p == null || (Array.isArray(p) && p.length === 2 && p.every(Number.isInteger));
    if (a && (!a.tables.every(ent) || !ent(a.bar) || !ent(a.salon) || !a.terrasse.every((c) => c == null || Number.isInteger(c)))) return { ok: false, raison: 'Ce plan est abîmé.', id: null };
    const loin = (p) => p != null && [].concat(p).some((v) => v > G.AMEN_MAX); // une case que le code compact ne sait pas écrire
    if (a && (a.tables.some(loin) || loin(a.bar) || loin(a.salon) || a.terrasse.some(loin))) return { ok: false, raison: 'Trop loin pour le plan.', id: null };
    const v = plan(a, true).verdict; return v.ok ? { ok: true, raison: '', id: null } : { ok: false, raison: v.raison, id: v.id };
  }
  // la case de la grille où tombe le centre (x, y) d'un meuble déplaçable (la terrasse : sa colonne seulement)
  function caseDe(id, x, y) { const g = LAY.grille, c = Math.round(x / g.pas - 0.5), r = Math.round((y - g.y0) / g.pas - 0.5); return /^terrasse/.test(id) ? [c] : [c, r]; }
  // proposer(st, id, x, y) : le meuble id posé là (aimanté à la grille) : { a (le nouvel aménagement), ok, raison, rect (son emprise), x, y (son centre aimanté) }
  let dernierePro = { cle: '', p: null }; // le doigt reste dans la même case : la même réponse, sans refaire les voies
  function proposer(st, id, x, y) {
    if (!LAY) calculer();
    // on part du plan AFFICHÉ : un aménagement sauvé qui ne tient pas sur cet écran (calculer l'a remplacé par le plan d'origine) ne compte pas
    const sauve = st && st.amenagement, horsEcran = !!sauve && sauve === amenRef && codeDemande !== '' && LAY.sig === '';
    const g = LAY.grille, a = copie(horsEcran ? null : sauve), cs = caseDe(id, x, y);
    cs[0] = Math.max(0, Math.min(g.cols - 1, cs[0])); if (cs.length > 1) cs[1] = Math.max(-3, Math.min(g.rangs, G.AMEN_MAX, cs[1])); // on peut pousser jusqu'à la file : la raison le dira
    const cle = `${W}x${H}|${G.codeAmenagement(a)}|${id}|${cs}`; if (cle === dernierePro.cle) return dernierePro.p;
    const m = /^table(\d)$/.exec(id), t = /^terrasse(\d)$/.exec(id);
    if (m) a.tables[+m[1] - 1] = cs; else if (t) a.terrasse[+t[1] - 1] = cs[0]; else if (id === 'bar') a.bar = cs; else if (id === 'salon') a.salon = cs; else return null;
    const L = plan(a, true, id), mo = L.mobiles.find((o) => o.id === id), v = L.verdict;
    const p = { a, ok: v.ok, raison: v.ok ? '' : v.raison, rect: mo.r, x: mo.x, y: mo.y, autre: v.ok ? null : v.avec || null }; dernierePro = { cle, p }; return p;
  }
  // le meuble déplaçable sous le doigt (son emprise et la hauteur du meuble au-dessus, au moins 44 × 44) ; achetes : seulement les meubles achetés
  function mobileSous(x, y, achetes) {
    if (!LAY) return null;
    const ms = LAY.mobiles.slice().reverse().filter((m) => !achetes || mobileAchete(m)); // la terrasse et le salon avant les tables qu'ils recouvrent
    const sous = (m, haut) => { const r = m.r, w = Math.max(44, r.w), hh = haut ? Math.max(44, r.h + 22 * K) : r.h; return x >= r.x + r.w / 2 - w / 2 && x <= r.x + r.w / 2 + w / 2 && y >= r.y + r.h - hh && y <= r.y + r.h; };
    // d'abord l'emprise même d'un meuble (les emprises ne se recouvrent pas) : la hauteur d'un autre meuble posé juste dessous ne la vole pas ;
    // sinon la hauteur du meuble au-dessus de son emprise (22·K : le parasol, le dossier), au moins 44 × 44
    return ms.find((m) => sous(m, false)) || ms.find((m) => sous(m, true)) || null;
  }
  // un meuble acheté : les tables 1..n, le bar et le coin salon dès le cran 1, les tables de la terrasse 1..n
  function mobileAchete(m) { const k = crans[m.type] || 0; return m.type === 'tables' || m.type === 'terrasse' ? m.i < k : k > 0; }

  const API = { hautBloc, resize, frame, basculer, congedier, accueillir, etatClient, installer, valider, proposer, mobileSous, mobileAchete, caseDe, vente, texte, tap, fete, setRush, mystere, habitue, hit, zones, forcer, hauteurUtile, ciel, toucherMystere, mystereEnAttente, ronron, souffle, piedComptoir, surServi: null,
    DECORS, decor, PASTEL, PEAUX6, HAUTS6, CHEVEUX, TAU,
    get LAY() { return LAY; }, get amenagementApplique() { return LAY ? LAY.sig : ''; }, get amenagementDemande() { return codeDemande; }, get K() { return K; }, get W() { return W; }, get H() { return H; }, get t() { return t; }, get rush() { return rush; }, get Q() { return Q; }, get tags() { return tags; }, get force() { return force; }, get etat() { return etat; }, get mode() { return modeVie; }, get vueEv() { return vueEv; },
    get clients() { return clients; }, get apprentis() { return apprentis; }, get textes() { return textes; }, get vapeurs() { return vapeurs; }, get confetti() { return confetti; }, get flocons() { return flocons; }, get passants() { return passants; }, get chat() { return chat; }, get crans() { return crans; }, get places() { return places; }, get abordables() { return abordables; }, get prixDe() { return prixDe; },
    get nClients() { return clients.length; }, get nApprentis() { return apprentis.length; }, get assis() { let n = 0; for (const c of clients) if (c.etat === 'assis') n++; return n; }, assisEn: (zone) => clients.filter((c) => c.etat === 'assis' && c.siege && c.siege.zone === zone).length, get mystereVisible() { return !!mystereEnAttente(); } };
  return API;
})();
if (typeof module !== 'undefined') module.exports = VIE;
