/* LE FOURNIL — la petite planète de « Ma chaîne de boutiques » (global PLANETE) : une planète miniature low-poly, pastel, qu'on tourne au doigt
   (inertie, pincer pour zoomer, retour doux), ses dix régions (une par quartier de GAME.QUARTIERS, chacune avec son repère : le moulin du
   village, l'immeuble d'angle parisien, le phare du bord de mer, les sommets et l'hôtel de la montagne, le gratte-ciel de la grande ville, la
   halle et son petit train, l'île et ses palmiers, le château sur sa colline, la station de ski et son télésiège, la tour Eiffel de la
   capitale) et une boutique par numéro de la chaîne, posée dans sa région, de plus en plus luxueuse avec son standing (six paliers).
   Au-dessus de chaque boutique, son fanion numéroté : un filet pour la jauge de la Boutique d'or, un point doré quand il y a des jetons à
   prendre, tout doré pour une Boutique d'or. Devant sa porte, son gérant s'il en a un ; sur le toit d'une Boutique d'or, l'enseigne dorée.
   Toucher une boutique fait tourner la planète et l'approche, sa façade vers nous, puis montre son étiquette dessous (son numéro, son nom,
   son quartier et son standing, la jauge, le gérant et le temps qu'il lui reste, les jetons à prendre, « Entrer ») ; son fanion s'efface
   alors (l'étiquette porte son numéro). Le cadrage est calculé pour que la boutique tienne entre le titre de l'écran et son étiquette : la
   planète de l'écran « Ma chaîne » (340 à 490 px de haut) a une étiquette compacte (130 px) et s'approche moins. « Entrer » plonge vers
   sa porte, puis appelle onEntrer, une seule fois (une seconde de garde après).
   Tout est procédural (0 Ko) ; en qualité haute et moyenne, la HD permise, quelques modèles libres (le kit fournil/hd/planete/planete.glb :
   Kenney et KayKit, CC0, cuits en couleurs de sommets par outils/planete/kit.mjs ; le lot « planete » de src/hd.js) s'y ajoutent. En éco :
   le sol moins fin, un décor réduit, des boutiques simplifiées, ni nuages ni animations.
   Budget : une région = un maillage (son sol et son décor fusionnés, caché quand il passe sous l'horizon), l'eau, les boutiques en instances
   (par standing, une forme riche pour les plus proches et une forme simple pour les autres ; une forme minuscule, commune, tout au loin), les
   gérants et les enseignes d'or en instances, les ombres au sol, les nuages, le halo et quelques pièces animées : une trentaine d'appels de
   dessin au plus ; ≤ 40 000 triangles en haute, ≤ 15 000 en éco, dans toutes les vues et quelle que soit la taille de la chaîne.
   Les places : des anneaux autour du repère de chaque quartier, puis une spirale ; quand un quartier manque de place (une chaîne de plus de
   cent boutiques), des îlots se lèvent dans la mer de l'île et du bord de mer, et les places se resserrent (les boutiques qui s'y posent sont
   plus petites) ; une boutique garde toujours sa place, d'une ouverture à l'autre.
   Son propre contexte WebGL, créé à l'ouverture, rendu à la fermeture (forceContextLoss), comme les écrans des événements. Le sol et le décor
   calculés restent en mémoire 90 s après la fermeture (rouvrir la même chaîne ne les recalcule pas), puis partent. Sa feuille de style (les
   fanions, l'étiquette, la légende, le ciel) est à elle : posée en tête du document à la première ouverture, la feuille du jeu passe après.
   API (contrat du lot, § 6.4) :
     ouvrir(conteneur, fiches, { qualite, onToucher(n), onEntrer(n), heure, boutiques }) → true si la planète est là. fiches : CHAINE.liste
       ({ n, nom, quartier, standing, jauge: { fait, max, niv }, jetons, or, gerant: { rythme, duree, part, heures, reste } | null, … }) ;
       boutiques : st.boutiques (les quartiers pas encore gagnés restent dans la brume) ; heure : celle de Paris (midi sans elle) : le ciel
       suit les cinq phases de la boutique, et le soir les vitres s'allument.
     maj(fiches) : les fanions, l'étiquette, les gérants et les enseignes d'or, sans rebâtir la géométrie (une boutique de plus : tout est rebâti).
     viser(n) : tourner et zoomer sur une boutique, puis son étiquette (sans rappeler onToucher).
     photo(q) → Promise<dataURL> : la carte postale d'une région (son id ou son indice), pour st.chaine.cartes.
     heure(h) ; fermer() ; ouvert ; stats et essai (les tests et les captures).
   Elle lit GAME (quartierDe, standingDe, QUARTIERS, STANDINGS) et VIE.decor (les couleurs) ; elle n'écrit jamais st. */
const PLANETE = (() => {
  'use strict';
  const RIEN = { actif: false, ouvert: false, ouvrir: () => false, maj() {}, viser: () => false, relacher() {}, photo: () => Promise.resolve(null), heure() {}, fermer() {}, stats: null };
  if (typeof THREE === 'undefined' || typeof document === 'undefined') return RIEN;
  const G = typeof GAME !== 'undefined' ? GAME : null, VI = typeof VIE !== 'undefined' ? VIE : null;
  const V3 = THREE.Vector3, TAU = Math.PI * 2, DEG = Math.PI / 180, HAUT = new V3(0, 1, 0), AVANT = new V3(0, 0, 1);
  const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t, borne = (x, a, b) => Math.max(a, Math.min(b, x));
  const angle = (a, b) => Math.acos(borne(a.dot(b), -1, 1));
  const doux = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // ease-in-out cubique
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduit = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  // ─── le bruit (valeur 3D, sans bibliothèque) et un tirage graine-fixé : la même planète à chaque ouverture ───
  const hache = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  function bruit(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const a = lerp(hache(xi, yi, zi), hache(xi + 1, yi, zi), u), b = lerp(hache(xi, yi + 1, zi), hache(xi + 1, yi + 1, zi), u);
    const c = lerp(hache(xi, yi, zi + 1), hache(xi + 1, yi, zi + 1), u), d = lerp(hache(xi, yi + 1, zi + 1), hache(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(a, b, v), lerp(c, d, v), w);
  }
  const bruitP = (p, f, o) => bruit(p.x * f + (o || 0), p.y * f + (o || 0) * 1.7, p.z * f - (o || 0));
  function tirage(s) { return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ─── les quartiers (GAME.QUARTIERS : leur ordre, leur nom) et leur place sur la planète ───
  const QS = G ? G.QUARTIERS : ['village', 'paris', 'mer', 'montagne', 'ville', 'gare', 'ile', 'chateau', 'cimes', 'capitale'].map((id) => ({ id, nom: id, enseigne: '' }));
  const quartierDe = G ? G.quartierDe : (n) => (Math.max(1, n) - 1) % QS.length;
  const standingDe = G ? G.standingDe : (n) => Math.max(0, Math.min(5, Math.floor((Math.max(1, n) - 1) / 5)));
  const NOMS_STANDING = G ? G.STANDINGS.map((s) => s.nom) : ['Boutique de quartier', 'Belle boutique', 'Maison réputée', 'Grande maison', 'Maison de prestige', 'Palais du goût'];
  // La disposition des dix régions : celle de dix points qui se repoussent sur une sphère (le problème de Thomson : deux pôles et deux anneaux
  // de quatre, décalés de 45°), d'aires égales à 68° des pôles. Le village est au pôle de devant, la capitale au pôle opposé (du premier
  // quartier au dernier, le tour du monde) ; les quatre autres quartiers de toujours l'entourent, et les cinq du parcours sont derrière :
  // un joueur qui débute voit ses cinq boutiques d'un coup, le reste de la planète l'attend. Les voisins vont ensemble : la montagne et la
  // station de ski, le bord de mer et l'île (une même mer), la grande ville et la gare, Paris et son château.
  const ANNEAU = 68 * DEG;
  const PLACES_REG = { village: [0, 0], montagne: [1, 0], ville: [1, 90], mer: [1, 180], paris: [1, 270], cimes: [2, 45], gare: [2, 135], ile: [2, 225], chateau: [2, 315], capitale: [3, 0] };
  // les couleurs des boutiques de chaque quartier : le toit (la façade et le store viennent du décor de la boutique, VIE.decor, s'il est là)
  const TEINTES = {
    village: { toit: '#E58A63', mur: '#FFF1E3', accent: '#FF9FB2' }, paris: { toit: '#7D8BA6', mur: '#EEF1F6', accent: '#2B3A55' },
    mer: { toit: '#5FA8D8', mur: '#F4FBFF', accent: '#3A86C8' }, montagne: { toit: '#8A5A3C', mur: '#EFDCC2', accent: '#A64B2A' },
    ville: { toit: '#9A8FC0', mur: '#F6F2EF', accent: '#FF6B8B' }, gare: { toit: '#4E8A6E', mur: '#F4EBDD', accent: '#C0392B' },
    ile: { toit: '#E9C27A', mur: '#F2FBF8', accent: '#2BB3A6' }, chateau: { toit: '#8C6BC2', mur: '#EDE6DA', accent: '#6B4AA0' },
    cimes: { toit: '#A0543E', mur: '#F4F7FB', accent: '#E63946' }, capitale: { toit: '#33405F', mur: '#F7F3EC', accent: '#FFC84A' },
  };
  function centreDe(id) {
    const [k, az] = PLACES_REG[id] || [0, 0]; if (k === 0) return new V3(0, 0, 1); if (k === 3) return new V3(0, 0, -1);
    const a = k === 1 ? ANNEAU : Math.PI - ANNEAU, b = az * DEG; return new V3(Math.sin(a) * Math.sin(b), Math.sin(a) * Math.cos(b), Math.cos(a));
  }
  // chaque région : son centre c et un repère tangent (e1 : vers le haut de la planète, e2) ; autour(R, ρ, β) : le point à ρ radians du centre, cap β
  const REG = QS.map((q, i) => {
    const c = centreDe(q.id), e1 = HAUT.clone().addScaledVector(c, -HAUT.dot(c)); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize();
    const t = TEINTES[q.id] || TEINTES.village; return { i, id: q.id, nom: q.nom, gagneA: q.boutique || 0, c, e1, e2: new V3().crossVectors(c, e1), toit: t.toit, mur: t.mur, accent: t.accent };
  });
  const RI = {}; for (const R of REG) RI[R.id] = R;
  const autour = (R, rho, beta, out) => (out || new V3()).copy(R.c).multiplyScalar(Math.cos(rho)).addScaledVector(R.e1, Math.sin(rho) * Math.cos(beta)).addScaledVector(R.e2, Math.sin(rho) * Math.sin(beta)).normalize();

  // ─── le relief : un rayon par direction. Les frontières des régions sont déformées par le bruit (des bords sinueux, pas des droites), et
  //     les reliefs des régions voisines se fondent sur une bande étroite ───
  const _w = new V3(), PROCHE = { i1: 0, i2: 1, i3: 2, d1: 0, d2: 0, d3: 0 };
  function plusProches(p, o) {
    const k = 0.13; _w.set(p.x + k * (bruit(p.x * 2.3 + 3.1, p.y * 2.3, p.z * 2.3) - 0.5), p.y + k * (bruit(p.x * 2.3, p.y * 2.3 + 7.3, p.z * 2.3) - 0.5), p.z + k * (bruit(p.x * 2.3, p.y * 2.3, p.z * 2.3 + 13.7) - 0.5)).normalize();
    let i1 = 0, i2 = 1, i3 = 2, a1 = -2, a2 = -2, a3 = -2;
    for (let i = 0; i < REG.length; i++) { const d = _w.dot(REG[i].c); if (d > a1) { a3 = a2; i3 = i2; a2 = a1; i2 = i1; a1 = d; i1 = i; } else if (d > a2) { a3 = a2; i3 = i2; a2 = d; i2 = i; } else if (d > a3) { a3 = d; i3 = i; } }
    o.i1 = i1; o.i2 = i2; o.i3 = i3; o.d1 = Math.acos(borne(a1, -1, 1)); o.d2 = Math.acos(borne(a2, -1, 1)); o.d3 = Math.acos(borne(a3, -1, 1)); return o;
  }
  const MER = 1.0; // le niveau de la mer (rayon de l'eau)
  const COTE = 60 * DEG; // le bord de mer : la côte à 60° du village, la plage regarde l'avant de la planète, la mer au-delà
  const cote = (p) => Math.acos(borne(p.dot(RI.village.c), -1, 1)) - COTE + 0.08 * (bruitP(p, 5, 3) - 0.5); // > 0 : en mer
  const ILE_R = 0.26;
  // les îlots : des îles rondes (un plateau de 0,1 rad, une plage autour) dans la mer de l'île et dans celle du bord de mer. Les trois premiers
  // de l'île sont toujours là ; les autres se lèvent un à un quand leur quartier manque de place (ILOTS_ACTIFS : combien sont levés), du plus
  // près au plus loin. Chacun porte trois boutiques en triangle. Tirés une fois, loin des frontières, dans la mer.
  const ILOTS = { ile: [40, 160, 280].map((b) => ({ c: autour(RI.ile, 0.43, b * DEG), r: 0.15 })), mer: [] }, ILOTS_ACTIFS = { ile: 3, mer: 0 };
  function ilot(p, L, k) { // le rayon du sol sur un îlot levé (−1 : pas d'îlot ici)
    let h = -1;
    for (let i = 0; i < k; i++) { const it = L[i], di = Math.acos(borne(p.dot(it.c), -1, 1)); if (di < it.r) h = Math.max(h, 1.004 + 0.0155 * (1 - lisse(it.r - 0.055, it.r, di))); }
    return h;
  }
  // la Seine de la capitale : une courbe dans le plan tangent (u le long de e2, v le long de e1), au sud de la tour ; seine(p) : la distance à son lit
  const coordsCapitale = (p) => { const R = RI.capitale, w = p.dot(R.c); return w < 0.4 ? null : [Math.atan2(p.dot(R.e2), w), Math.atan2(p.dot(R.e1), w)]; };
  const SEINE = (u) => -0.2 + 0.07 * Math.sin(u * 5.5 + 0.4);
  const ETOILE = autour(RI.capitale, 0.27, 1.25); // l'arc de triomphe et ses avenues
  const seine = (p) => { const c = coordsCapitale(p); return c ? Math.abs(c[1] - SEINE(c[0])) : 1; };
  // les sommets de la montagne et de la station de ski : des cônes émoussés, tirés une fois (graine fixe) ; ceux de la montagne derrière sa
  // vallée (vus de l'avant, ils se dressent derrière les boutiques), ceux des cimes tout autour du plateau
  const PICS = { montagne: [], cimes: [] };
  (() => {
    const r = tirage(17);
    for (let k = 0; k < 9; k++) { const b = (-120 + 240 * k / 8 + (r() - 0.5) * 18) * DEG, rho = 0.33 + 0.16 * r(); PICS.montagne.push({ d: autour(RI.montagne, rho, b), h: 0.07 + 0.07 * r(), r: 0.13 + 0.06 * r() }); }
    for (let k = 0; k < 10; k++) { const b = (k * 36 + (r() - 0.5) * 20) * DEG, rho = 0.34 + 0.14 * r(); PICS.cimes.push({ d: autour(RI.cimes, rho, b), h: 0.08 + 0.08 * r(), r: 0.13 + 0.06 * r() }); }
  })();
  const pics = (p, L) => { let h = 0; for (const k of L) { const a = 1 - Math.acos(borne(p.dot(k.d), -1, 1)) / k.r; if (a > 0) h = Math.max(h, k.h * Math.pow(a, 1.25) * (0.85 + 0.3 * bruitP(p, 11, 5))); } return h; };
  const _pc = new V3();
  const RELIEF = { // le rayon du sol de chaque région en p (d : la distance angulaire à son centre)
    village: (p, d) => 1.016 + 0.016 * (bruitP(p, 4.2) - 0.42) * lisse(0.16, 0.34, d),
    paris: (p) => 1.016 + 0.002 * bruitP(p, 9),
    mer: (p) => { const s = cote(p); if (s < 0) return 1.007 + 0.011 * lisse(0, -0.16, s); const hi = ilot(p, ILOTS.mer, ILOTS_ACTIFS.mer); return hi > 0 ? hi : 0.997 - 0.034 * lisse(0, 0.15, s); },
    montagne: (p, d) => { const lac = 1 - lisse(0.035, 0.06, angle(p, autour(RI.montagne, 0.27, Math.PI * 0.62, _pc))); return 1.018 + pics(p, PICS.montagne) - 0.03 * lac + 0.006 * (bruitP(p, 6) - 0.5) * lisse(0.2, 0.3, d); },
    ville: () => 1.017,
    gare: (p) => 1.016 + 0.001 * bruitP(p, 9),
    ile: (p, d) => { // l'île, et ses îlots autour (les boutiques de l'île, au-delà de la n°40, y trouvent leur place)
      const r = ILE_R + 0.035 * (bruitP(p, 7, 2) - 0.5); if (d < r) return 1.004 + 0.024 * (1 - lisse(r * 0.45, r, d));
      const hi = ilot(p, ILOTS.ile, ILOTS_ACTIFS.ile); if (hi > 0) return hi;
      return 0.997 - 0.032 * lisse(r, r + 0.12, d);
    },
    chateau: (p, d) => 1.016 + 0.052 * (1 - lisse(0.075, 0.165, d)) + 0.014 * (bruitP(p, 4.6, 1) - 0.42) * lisse(0.24, 0.38, d),
    cimes: (p, d) => 1.03 + pics(p, PICS.cimes) - 0.013 * lisse(0.48, 0.66, d),
    capitale: (p) => { const s = seine(p); return s < 0.045 ? 0.991 + 0.026 * lisse(0.018, 0.045, s) : 1.017; }, // la Seine, au sud de la tour
  };
  const relief = (i, p) => RELIEF[REG[i].id](p, Math.acos(borne(p.dot(REG[i].c), -1, 1)));
  function altitude(p, o) { // le rayon du sol en p (unitaire) ; o reçoit les régions les plus proches
    o = plusProches(p, o || PROCHE);
    const w2 = Math.exp(-(o.d2 - o.d1) / 0.028), w3 = Math.exp(-(o.d3 - o.d1) / 0.028);
    let h = relief(o.i1, p), s = 1;
    if (w2 > 0.01) { h += w2 * relief(o.i2, p); s += w2; }
    if (w3 > 0.01) { h += w3 * relief(o.i3, p); s += w3; }
    return h / s;
  }
  // les îlots candidats (au-delà des trois premiers de l'île) : en mer, au cœur de leur région (loin des frontières : leur relief ne se fond
  // pas avec celui des voisines), à 0,36 rad les uns des autres au moins
  (() => {
    const o = {};
    const tirer = (R, liste, rhos, enMer) => {
      const cands = [];
      for (const rho of rhos) for (let b = 0; b < 360; b += 12) { const c = autour(R, rho, (b + rho * 97) * DEG); plusProches(c, o); if (o.i1 !== R.i || o.d2 - o.d1 < 0.2 || !enMer(c)) continue; cands.push(c); }
      for (const c of cands) if (liste.every((x) => angle(c, x.c) > 0.36)) liste.push({ c, r: 0.15 });
    };
    tirer(RI.ile, ILOTS.ile, [0.47, 0.55, 0.62, 0.38], (c) => angle(c, RI.ile.c) > ILE_R + 0.17);
    tirer(RI.mer, ILOTS.mer, [0.24, 0.32, 0.4, 0.48, 0.16], (c) => cote(c) > 0.17);
  })();

  // ─── les couleurs (linéaires, en cache) ───
  const COULEURS = new Map(), _c = new THREE.Color();
  // les couleurs qui s'allument le soir : les vitres, les lanternes, les lampadaires, le feu du phare (1 : toute la lueur) et la tour Eiffel,
  // dorée la nuit (2 : à moitié) ; marquées dans la couleur de leurs sommets (+10 ou +20 sur le rouge, que le shader retire), sans attribut de plus
  const LUEURS = new Map([['#BFE6F6', 1], ['#FFF0B8', 1], ['#A9CBE0', 1], ['#A9D2EC', 1], ['#FFE9B8', 1], ['#FFE6A0', 1], ['#FFE69A', 1], ['#FFD86E', 1], ['#FFF6DA', 1], ['#B08F78', 2], ['#9C7C66', 2]]);
  function couleur(hex) { let k = COULEURS.get(hex); if (!k) { _c.set(hex); k = [_c.r, _c.g, _c.b]; if (LUEURS.has(hex)) k.lueur = LUEURS.get(hex); COULEURS.set(hex, k); } return k; }
  const melange = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const BRUME = couleur('#F2EFF7'); // un quartier pas encore gagné : pâli, comme dans la brume

  // la couleur du sol d'une région en p (h : le rayon, pente : l'écart d'altitude sur la facette, d : la distance au centre)
  const SOL = {
    village: (p, h, pente, d) => { // des prés, et des champs en damier hors du bourg
      if (d > 0.3 && bruitP(p, 4.2, 4) > 0.6) { const k = Math.floor((p.x * 0.8 + p.y * 0.5 + p.z * 0.3) * 38 + bruitP(p, 3) * 2); return ['#F0D88E', '#C9E59B', '#E8C877', '#B5DC8A'][((k % 4) + 4) % 4]; }
      return bruitP(p, 7, 1) > 0.5 ? '#A9DC8D' : '#9DD382';
    },
    paris: (p, h, pente, d) => (d > 0.3 && bruitP(p, 6, 2) > 0.64 ? '#B2DC92' : bruitP(p, 9, 3) > 0.5 ? '#EFE5D3' : '#E7DCC6'), // le pavé, quelques squares
    mer: (p, h) => (h < 1.012 ? '#F3E3B5' : bruitP(p, 7) > 0.55 ? '#C9E7A3' : '#F0E2B8'),
    montagne: (p, h, pente) => (h > 1.105 ? '#FFFFFF' : h > 1.072 || pente > 0.022 ? (bruitP(p, 13) > 0.5 ? '#B8AEA4' : '#A89E95') : h > 1.04 ? '#7FBF6E' : bruitP(p, 8) > 0.5 ? '#9DD487' : '#92CC7C'),
    ville: (p, h, pente, d) => (d > 0.22 && bruitP(p, 6, 5) > 0.58 ? (bruitP(p, 13) > 0.5 ? '#A9DA90' : '#9DD186') : bruitP(p, 10, 1) > 0.5 ? '#CBC5DC' : '#BFB9D2'), // l'asphalte lavande, des parcs
    gare: (p, h, pente, d) => (d < 0.15 || Math.abs(d - 0.41) < 0.03 ? (bruitP(p, 11) > 0.5 ? '#E6D3B1' : '#DCC7A3') : bruitP(p, 7, 2) > 0.5 ? '#B7DD93' : '#A9D589'), // le gravier de la cour et du chemin de fer, des prés
    ile: (p, h) => (h > 1.0165 ? (bruitP(p, 9) > 0.5 ? '#9BD98A' : '#8ED07F') : '#F6E7BF'),
    chateau: (p, h, pente, d) => (d < 0.17 && h > 1.03 ? '#A2D58A' : bruitP(p, 6, 6) > 0.6 ? '#76B866' : bruitP(p, 8) > 0.5 ? '#8DCA78' : '#84C371'),
    cimes: (p, h, pente) => (pente > 0.034 && h > 1.07 ? (bruitP(p, 13) > 0.5 ? '#CFCBDB' : '#C2BFD0') : bruitP(p, 9, 2) > 0.5 ? '#FDFEFF' : '#EDF3FB'),
    capitale: (p, h, pente, d) => (d > 0.24 && bruitP(p, 6, 8) > 0.67 ? '#A6D98B' : bruitP(p, 9, 7) > 0.5 ? '#F3E7C6' : '#EBDDB6'), // le pavé clair, quelques squares
  };

  // ─── les formes unitaires : des listes de triangles (x, y, z…), posées sur y = 0, de taille 1 ───
  function triangles(geo) { const g = geo.index ? geo.toNonIndexed() : geo, a = Array.from(g.attributes.position.array); if (g !== geo) g.dispose(); geo.dispose(); return a; }
  const BOITE = (() => {
    const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]], o = [];
    for (const [a, b, c, d] of [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3]]) o.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]); // (pas de dessous : tout est posé)
    return o;
  })();
  const QUAD = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]; // dans le plan XY, tourné vers +z
  const QUAD2 = QUAD.concat([-0.5, 0, 0, 0.5, 1, 0, 0.5, 0, 0, -0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]); // les deux faces (une voile, un drapeau)
  const TRI2 = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]; // un triangle rectangle, deux faces
  const PANS = (() => { // le toit à deux pans : faîtage le long de x, y ∈ [0, 1]
    const a = [-0.5, 0, 0.5], b = [0.5, 0, 0.5], c = [0.5, 1, 0], d = [-0.5, 1, 0], e = [0.5, 0, -0.5], f = [-0.5, 0, -0.5];
    return [...a, ...b, ...c, ...a, ...c, ...d, ...e, ...f, ...d, ...e, ...d, ...c];
  })();
  const PIGNONS = [0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0];
  const CROUPES = new Map();
  function croupes(r) { // le toit à quatre pans, faîtage de longueur 2r (0 : une pyramide)
    let o = CROUPES.get(r); if (o) return o;
    const a = [-0.5, 0, 0.5], b = [0.5, 0, 0.5], e = [0.5, 0, -0.5], f = [-0.5, 0, -0.5], c = [r, 1, 0], d = [-r, 1, 0];
    o = [...a, ...b, ...c, ...a, ...c, ...d, ...e, ...f, ...d, ...e, ...d, ...c, ...b, ...e, ...c, ...f, ...a, ...d]; CROUPES.set(r, o); return o;
  }
  const ETOILE5 = (() => { // une étoile à cinq branches, plate, dans le plan XY tournée vers +z, de diamètre 1
    const o = []; for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * TAU, a1 = a0 + TAU / 10, a2 = a0 + TAU / 5, P = (a, r) => [Math.sin(a) * r, Math.cos(a) * r, 0];
      o.push(0, 0, 0, ...P(a0, 0.5), ...P(a1, 0.21), 0, 0, 0, ...P(a1, 0.21), ...P(a2, 0.5));
    }
    return o;
  })();
  const FORMES = new Map();
  const forme = (k, f) => { let o = FORMES.get(k); if (!o) { o = f(); FORMES.set(k, o); } return o; };
  function cylindre(n, k, chapeau) { // les côtés (diamètre 1 en bas, k en haut, hauteur 1) et, s'il le faut, le dessus ; jamais le dessous
    const o = [];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, x0 = Math.sin(a0) * 0.5, z0 = Math.cos(a0) * 0.5, x1 = Math.sin(a1) * 0.5, z1 = Math.cos(a1) * 0.5;
      if (k > 0) o.push(x0, 0, z0, x1, 0, z1, x1 * k, 1, z1 * k, x0, 0, z0, x1 * k, 1, z1 * k, x0 * k, 1, z0 * k); else o.push(x0, 0, z0, x1, 0, z1, 0, 1, 0);
      if (chapeau && k > 0) o.push(0, 1, 0, x0 * k, 1, z0 * k, x1 * k, 1, z1 * k);
    }
    return o;
  }
  const CYL = (n, k) => forme('cyl' + n + '|' + k, () => cylindre(n, k, true)); // un fût fermé en haut
  const TUBE = (n, k) => forme('tube' + n + '|' + k, () => cylindre(n, k, false)); // un tronc, un poteau, un pied (leur haut est caché ou trop fin pour se voir)
  const CONE = (n) => forme('cone' + n, () => cylindre(n, 0, false));
  const ICO = (d) => forme('ico' + d, () => triangles(new THREE.IcosahedronGeometry(0.5, d).translate(0, 0.5, 0))); // diamètre 1, posé
  const DOME = (n) => forme('dome' + n, () => triangles(new THREE.SphereGeometry(0.5, n, Math.max(2, n >> 1), 0, TAU, 0, Math.PI / 2))); // une demi-sphère, posée
  const VOUTE = forme('voute', () => triangles(new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2))); // une demi-coque le long de x, ouverte en bas
  const ARCHE = forme('arche', () => triangles(new THREE.TorusGeometry(0.5, 0.05, 3, 6, Math.PI))); // sa moitié haute

  // ─── le lot : des pièces fusionnées en une géométrie à couleurs de sommets (et, pour les boutiques, la teinte de chaque sommet) ───
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _t = new V3(), _s = new V3(), _v = new V3(), _v2 = new V3();
  class Lot {
    constructor(teintes) { this.p = []; this.c = []; this.t = teintes ? [] : null; this.M = new THREE.Matrix4(); }
    // une forme, à sa place dans le repère du lot (M) : centre (x, y, z), tailles (sx, sy, sz), rotations (ry, puis rx, rz), couleur, teinte
    f(fo, x, y, z, sx, sy, sz, col, ry, rx, rz, te) {
      _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
      this.brut(fo, _m2.multiplyMatrices(this.M, _m), couleur(col), te || 0);
    }
    brut(fo, m, k, te, ks) { // ks : une couleur par sommet (le kit)
      const e = m.elements, P = this.p, C = this.c, T = this.t;
      for (let i = 0; i < fo.length; i += 3) {
        const x = fo[i], y = fo[i + 1], z = fo[i + 2];
        P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        if (ks) C.push(ks[i] * k[0], ks[i + 1] * k[1], ks[i + 2] * k[2]); else C.push(k[0] + 10 * (k.lueur || 0), k[1], k[2]); if (T) T.push(te);
      }
    }
    // une pièce d'un point A à un point B (dans le repère du lot), de section l × l : une poutre, un pied de tour, un câble
    poutre(A, B, l, col, fo) { _v.subVectors(B, A); const len = _v.length(); _q.setFromUnitVectors(HAUT, _v.normalize()); _m.compose(A, _q, _s.set(l, len, l)); this.brut(fo || BOITE, _m2.multiplyMatrices(this.M, _m), couleur(col), 0); }
    get n() { return this.p.length / 9; }
    tableaux() { return { p: new Float32Array(this.p), c: new Float32Array(this.c), t: this.t ? new Float32Array(this.t) : null }; }
    geo() { return geoDe(this.tableaux()); }
  }
  // une géométrie sur des tableaux déjà prêts (ils ne sont pas recopiés : le cache du sol et du décor les garde, la géométrie les partage)
  function geoDe(a) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.p, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.c, 3));
    if (a.t) g.setAttribute('teinte', new THREE.BufferAttribute(a.t, 1)); g.computeBoundingSphere(); return g;
  }
  // la matrice d'un objet posé au point p (unitaire) du sol : debout sur la normale, sa façade (+z local) vers le cap f (tangent), à l'échelle s
  const _ax = new V3(), _ay = new V3(), _az = new V3();
  function poser(M, p, h, f, s) {
    _ay.copy(p); _az.copy(f).addScaledVector(p, -f.dot(p)); if (_az.lengthSq() < 1e-8) _az.set(1, 0, 0).addScaledVector(p, -p.x); _az.normalize(); _ax.crossVectors(_ay, _az);
    M.makeBasis(_ax, _ay, _az); M.scale(_s.set(s, s, s)); M.setPosition(p.x * h, p.y * h, p.z * h); return M;
  }
  const capAleatoire = (p, r, out) => { _v2.set(0.3, 1, 0.2).cross(p); if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0); _v2.normalize(); const b = _v.crossVectors(p, _v2); return (out || new V3()).copy(_v2).multiplyScalar(Math.cos(r)).addScaledVector(b, Math.sin(r)); };

  // ─── les boutiques : six standings (GAME.STANDINGS), du plus simple au palais ; façade vers +z, posées sur y = 0. Teintes des sommets :
  //     0 sa couleur, 1 × la façade du quartier, 2 × son toit, 3 × son accent (le store, les drapeaux) ───
  const DIM = { larg: [1.0, 1.08, 1.12, 1.26, 1.34, 1.5], haut: [0.6, 0.62, 1.04, 1.1, 1.16, 1.2], prof: [0.8, 0.82, 0.84, 0.88, 0.9, 0.94] };
  // un fronton : le triangle d'une façade (tourné vers +z), épaisseur d
  function fronton(L, x, y, z, w, h, d, col) { L.f(PANS, x, y, z, d, h, w, col, Math.PI / 2); L.f(PIGNONS, x, y, z, d, h, w, col, Math.PI / 2); }
  const MARBRE = '#F6F2EC', OR = '#EDBE4E', VITRE = '#BFE6F6', VITRE_LUIT = '#FFF0B8', PORTE = '#7A5236', SOCLE = '#D8CEC2', BOIS = '#9C6B45', ROUGE = '#C8323C';
  function geoBoutique(s, eco) {
    const L = new Lot(true), B = (x, y, z, w, h, d, col, te, ry, rx) => L.f(BOITE, x, y, z, w, h, d, col, ry, rx, 0, te);
    const Q = (x, y, z, w, h, col, te) => L.f(QUAD, x, y, z, w, h, 1, col, 0, 0, 0, te);
    const larg = DIM.larg[s], haut = DIM.haut[s], prof = DIM.prof[s], av = prof / 2;
    const marbre = s >= 4, mur = marbre ? MARBRE : '#FFFFFF', teMur = marbre ? 0 : 1;
    B(0, -0.4, 0, larg + 0.08, 0.48, prof + 0.08, s >= 3 ? '#E9E1D6' : SOCLE, 0); // le socle (il descend sous le sol : la pente ne laisse pas de vide)
    B(0, 0.08, 0, larg, haut, prof, mur, teMur);
    const y0 = 0.08 + haut; // le haut des murs
    // le toit : à deux pans (0, 1), mansardé (2, 4), à quatre pans (3), une terrasse et son dôme (5)
    if (s <= 1) { L.f(PANS, 0, y0, 0, larg + 0.14, 0.42, prof + 0.16, '#FFFFFF', 0, 0, 0, 2); L.f(PIGNONS, 0, y0, 0, larg, 0.42, prof, mur, 0, 0, 0, teMur); }
    else if (s === 3) { B(0, y0, 0, larg + 0.08, 0.07, prof + 0.08, OR, 0); L.f(croupes(0.2), 0, y0 + 0.07, 0, larg + 0.06, 0.4, prof + 0.06, '#FFFFFF', 0, 0, 0, 2); }
    else if (s === 5) { B(0, y0, 0, larg + 0.08, 0.07, prof + 0.08, OR, 0); B(0, y0 + 0.07, 0, larg - 0.04, 0.03, prof - 0.04, '#EFE6D8', 0); if (!eco) for (let k = -2; k <= 2; k++) B(k * larg / 5, y0 + 0.07, av - 0.02, 0.05, 0.09, 0.05, MARBRE, 0); } // (la balustrade : de près seulement)
    else { B(0, y0, 0, larg + 0.06, 0.06, prof + 0.06, s >= 4 ? OR : '#F3EBDD', 0); L.f(croupes(0.32), 0, y0 + 0.06, 0, larg, 0.34, prof - 0.02, '#FFFFFF', 0, 0, 0, 2); }
    // la devanture : la vitrine (qui luit du palier 3), la porte, le store (rayé du palier 2)
    const vw = larg * (s >= 3 ? 0.5 : 0.44);
    Q(-larg * 0.17, 0.18, av + 0.004, vw, 0.3, s >= 3 ? VITRE_LUIT : VITRE, 0);
    Q(larg * 0.29, 0.08, av + 0.004, 0.2, 0.4, PORTE, 0);
    const ys = 0.58, profS = 0.26, ns = s >= 2 && !(eco && s === 5) ? 6 : 1; // (de loin, le palais garde un store uni : son dôme le signale assez)
    for (let k = 0; k < ns; k++) { const w = (larg * 0.96) / ns; if (ns > 1 && k % 2) continue; // (le store rayé : une bande sur deux à l'accent, les autres dessous, blanches)
      B(-larg * 0.48 + w * (k + 0.5), ys, av + 0.11, w, 0.03, profS, '#FFFFFF', 3, 0, 0.5); }
    if (ns > 1) B(0, ys - 0.004, av + 0.105, larg * 0.95, 0.03, profS - 0.01, '#FFFFFF', 0, 0, 0.5); // (dessous : le blanc des rayures)
    B(0, ys - 0.1, av + 0.225, larg * 0.96, 0.07, 0.02, '#FFFFFF', 3); // le lambrequin du store
    if (eco) { if (s >= 2) Q(0, 0.72, av + 0.004, larg * 0.5, 0.2, VITRE, 0); if (s === 5) { L.f(CYL(6, 1), 0, y0 + 0.08, 0, 0.5, 0.18, 0.5, MARBRE); L.f(DOME(5), 0, y0 + 0.26, 0, 0.56, 0.5, 0.56, OR); } return L.geo(); }
    if (s <= 1) B(larg * 0.28, y0 + 0.12, -0.16, 0.11, 0.3, 0.11, '#C9785B', 0); // la cheminée
    if (s >= 1) { // les boiseries, les jardinières et les lanternes de la belle boutique
      B(0, 0.08, av + 0.006, larg + 0.02, 0.1, 0.02, s >= 4 ? OR : BOIS, 0);
      for (const sx of [-1, 1]) { B(sx * (larg / 2 + 0.06), 0.0, av - 0.02, 0.13, 0.13, 0.13, BOIS, 0); L.f(ICO(0), sx * (larg / 2 + 0.06), 0.1, av - 0.02, 0.2, 0.2, 0.2, '#6FBF63'); }
      for (const sx of [-1, 1]) B(larg * 0.29 + sx * 0.15, 0.36, av + 0.03, 0.05, 0.08, 0.05, '#FFD86E', 0); // (les lanternes : un jaune à elles, qui s'allume le soir)
    }
    if (s >= 1) { const ex = -larg / 2 - 0.02; B(ex - 0.08, 0.5, av - 0.06, 0.16, 0.025, 0.025, '#4A4A58', 0); L.f(CYL(7, 1), ex - 0.14, 0.33, av - 0.06, 0.2, 0.025, 0.2, '#FFFFFF', 0, 0, Math.PI / 2, 3); B(ex - 0.14, 0.4, av - 0.06, 0.03, 0.04, 0.12, '#E8A54A', 0); } // l'enseigne en potence et son petit pain
    if (s >= 2) { // l'étage : deux fenêtres et leurs jardinières fleuries, l'enseigne
      for (const sx of [-1, 1]) { Q(sx * larg * 0.24, 0.74, av + 0.004, 0.2, 0.24, VITRE, 0); B(sx * larg * 0.24, 0.7, av + 0.03, 0.24, 0.05, 0.06, '#FF8FA3', 0); }
      B(0, 0.62, av + 0.02, larg * 0.5, 0.09, 0.03, s >= 3 ? OR : '#FFF6E5', 0);
      if (s === 2 || s === 4) for (const sx of [-0.25, 0.25]) { B(sx * larg, y0 + 0.08, 0.22, 0.14, 0.15, 0.12, mur, teMur); L.f(PANS, sx * larg, y0 + 0.23, 0.22, 0.18, 0.08, 0.16, '#FFFFFF', 0, 0, 0, 2); } // les lucarnes
    }
    if (s >= 3) { // les colonnes de l'entrée et leur fronton
      const cols = s >= 5 ? [-0.36, -0.12, 0.12, 0.36] : [-0.2, 0.2];
      for (const cx of cols) L.f(TUBE(5, 1), larg * 0.29 * (s >= 5 ? 0 : 1) + cx * (s >= 5 ? larg : 1), 0.08, av + 0.09, 0.07, 0.56, 0.07, '#FFFFFF');
      const fx = s >= 5 ? 0 : larg * 0.29, fw = s >= 5 ? larg * 0.86 : 0.56;
      B(fx, 0.64, av + 0.09, fw, 0.05, 0.12, s >= 4 ? OR : '#FFFFFF', 0); fronton(L, fx, 0.69, av + 0.09, fw, 0.13, 0.1, '#FFFFFF');
    }
    if (s >= 4) { // le tapis rouge et ses cordons dorés, le drapeau
      B(larg * 0.29 * (s >= 5 ? 0 : 1), 0.0, av + 0.32, 0.2, 0.012, 0.5, ROUGE, 0);
      for (const sx of [-1, 1]) L.f(TUBE(4, 1), larg * 0.29 * (s >= 5 ? 0 : 1) + sx * 0.16, 0, av + 0.48, 0.035, 0.16, 0.035, OR);
      for (const sx of s >= 5 ? [-1, 1] : [1]) { const fx = sx * larg * 0.38; L.f(TUBE(3, 1), fx, y0 + 0.06, -0.1, 0.025, 0.5, 0.025, '#8A8F9C'); L.f(QUAD2, fx + 0.11, y0 + 0.4, -0.1, 0.22, 0.14, 1, '#FFFFFF', 0, 0, 0, 3); }
    }
    if (s === 5) { // le palais : le tambour, le dôme doré et sa flèche, la statue devant
      L.f(TUBE(8, 1), 0, y0 + 0.08, 0, 0.56, 0.2, 0.56, MARBRE); L.f(DOME(8), 0, y0 + 0.28, 0, 0.62, 0.52, 0.62, OR); L.f(CONE(5), 0, y0 + 0.52, 0, 0.08, 0.3, 0.08, OR);
      B(-larg * 0.62, 0, av + 0.16, 0.14, 0.18, 0.14, '#FFFFFF', 0); L.f(ICO(0), -larg * 0.62, 0.18, av + 0.16, 0.08, 0.2, 0.08, OR);
    }
    return L.geo();
  }
  // la forme minuscule, commune à tous les standings (une boîte, son toit, son store), mise aux dimensions de chacun par la matrice de
  // l'instance (largeur, hauteur des murs, profondeur) : ce qu'on voit d'une boutique au bord de la planète, à quelques pixels
  function geoMicro() {
    const L = new Lot(true);
    L.f(BOITE, 0, -0.5, 0, 1.06, 1.5, 1.06, '#FFFFFF', 0, 0, 0, 1);
    L.f(PANS, 0, 1, 0, 1.12, 0.45, 1.16, '#FFFFFF', 0, 0, 0, 2);
    L.f(BOITE, 0, 0.62, 0.62, 0.96, 0.06, 0.22, '#FFFFFF', 0, 0.5, 0, 3);
    L.f(QUAD, -0.18, 0.2, 0.531, 0.44, 0.34, 1, VITRE);
    return L.geo();
  }
  // le gérant : un petit bonhomme devant la vitrine (la veste lavande des gérants de l'écran, son chapeau melon, sa cravate), 52 triangles
  function geoGerant() {
    const L = new Lot(false);
    L.f(BOITE, 0, 0, 0, 0.15, 0.13, 0.09, '#3E4A6B');
    L.f(CYL(5, 0.72), 0, 0.11, 0, 0.23, 0.2, 0.2, '#9A84F0');
    L.f(BOITE, 0, 0.2, 0.08, 0.035, 0.08, 0.02, '#E1496C');
    L.f(ICO(0), 0, 0.29, 0, 0.19, 0.19, 0.19, '#FFD7B5');
    L.f(CYL(6, 1), 0, 0.44, 0, 0.21, 0.015, 0.21, '#4A3328'); L.f(CYL(5, 0.8), 0, 0.445, 0, 0.13, 0.07, 0.13, '#4A3328');
    return L.geo();
  }
  // l'enseigne dorée de la Boutique d'or : un panneau doré sur le bord du toit, son étoile, ses deux montants (le soir, le panneau s'allume)
  function geoOr() {
    const L = new Lot(false);
    for (const sx of [-0.42, 0.42]) L.f(BOITE, sx, -0.05, 0, 0.05, 0.16, 0.05, '#B9851F');
    L.f(BOITE, 0, 0.07, 0, 1.04, 0.34, 0.07, '#C9932E'); // le cadre
    L.f(QUAD, 0, 0.1, 0.036, 0.94, 0.28, 1, '#FFC84A'); L.f(QUAD, 0, 0.1, -0.036, 0.94, 0.28, 1, '#FFC84A', Math.PI); // le panneau d'or, des deux côtés
    L.f(ETOILE5, 0, 0.24, 0.04, 0.27, 0.27, 1, '#FFF6DA'); L.f(ETOILE5, 0, 0.24, -0.04, 0.27, 0.27, 1, '#FFF6DA', Math.PI); // l'étoile (le soir, elle luit)
    L.f(CONE(5), 0, 0.41, 0, 0.13, 0.16, 0.13, '#FFC84A');
    return L.geo();
  }
  const ECHELLE_BOUTIQUE = [0.1, 0.102, 0.104, 0.106, 0.108, 0.11]; // (× sa largeur et sa hauteur : du palier 0 au palais)
  const HAUTEUR_BOUTIQUE = [1.02, 1.06, 1.45, 1.6, 1.62, 2.05]; // le haut de la boutique (unités locales) : le pied de son fanion
  const ECHELLE_NIV = [1, 0.72, 0.58, 0.48, 0.4]; // les places resserrées (§ placesDe) : les boutiques qui s'y posent, plus petites
  const hauteurDe = (s, or) => Math.max(HAUTEUR_BOUTIQUE[s], or ? 0.1 + DIM.haut[s] + 0.52 * DIM.larg[s] * 0.6 : 0); // (l'enseigne dorée, sur le bord du toit, dépasse rarement le faîte)

  // ─── le décor : les modèles procéduraux (unités locales, posés sur y = 0, hauteur ~1, façade vers +z) ───
  const VERTS = ['#79C46A', '#6AB95E', '#8BCF73', '#5FAE57'];
  const MODELES = {
    arbre(L, r) { L.f(TUBE(5, 0.7), 0, 0, 0, 0.12, 0.42, 0.12, '#A07050'); L.f(ICO(0), 0, 0.3, 0, 0.62, 0.66, 0.62, VERTS[Math.floor(r() * 4)], r() * 3); },
    platane(L, r) { L.f(TUBE(5, 0.7), 0, 0, 0, 0.1, 0.5, 0.1, '#B59A7A'); L.f(ICO(0), 0, 0.38, 0, 0.58, 0.5, 0.58, r() > 0.5 ? '#A8D67E' : '#97CC70', r() * 3); },
    sapin(L, r, neige) {
      L.f(TUBE(4, 0.7), 0, 0, 0, 0.1, 0.22, 0.1, '#8A5A3C'); const v = r() > 0.5 ? '#3F8F5A' : '#4C9C62';
      for (let k = 0; k < 3; k++) { const y = 0.16 + k * 0.26, rr = 0.62 - k * 0.15; L.f(CONE(6), 0, y, 0, rr, 0.42, rr, v, k * 0.5); if (neige) L.f(CONE(6), 0, y + 0.2, 0, rr * 0.62, 0.24, rr * 0.62, '#F4F8FC', k * 0.5); }
    },
    palmier(L, r) {
      let x = 0, y = 0; const pen = 0.1 + r() * 0.12;
      for (let k = 0; k < 3; k++) { L.f(TUBE(4, 0.85), x, y, 0, 0.1 - k * 0.012, 0.37, 0.1 - k * 0.012, k % 2 ? '#B48A5E' : '#A67C52', 0, 0, -pen * k * 0.8); x += Math.sin(pen * k * 0.8) * 0.37; y += Math.cos(pen * k * 0.8) * 0.36; }
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + r() * 0.4; L.f(QUAD2, x + Math.cos(a) * 0.22, y - 0.05, Math.sin(a) * 0.22, 0.28, 0.54, 1, k % 2 ? '#5DBB63' : '#49A955', -a + Math.PI / 2, 0, -1.2); }
    },
    buisson(L, r) { L.f(ICO(0), 0, 0, 0, 0.5, 0.36, 0.5, VERTS[Math.floor(r() * 4)], r() * 3); },
    rocher(L, r) { L.f(ICO(0), 0, -0.05, 0, 0.6, 0.38, 0.5, r() > 0.5 ? '#BDB6AE' : '#ADA69E', r() * 3); },
    maison(L, r) { // une petite maison de village : murs crème, toit de tuiles, porte et fenêtre
      const toit = ['#E07A5F', '#D9725A', '#C9785B', '#E58A63'][Math.floor(r() * 4)];
      L.f(BOITE, 0, -0.2, 0, 0.84, 0.75, 0.62, '#FFF4E4'); L.f(PANS, 0, 0.55, 0, 0.96, 0.4, 0.74, toit); L.f(PIGNONS, 0, 0.55, 0, 0.84, 0.4, 0.62, '#FFF4E4');
      L.f(QUAD, 0.18, 0, 0.312, 0.16, 0.3, 1, PORTE); L.f(QUAD, -0.18, 0.22, 0.312, 0.18, 0.16, 1, VITRE);
    },
    meule(L) { L.f(CYL(8, 1), 0, 0.25, -0.2, 0.5, 0.4, 0.5, '#EDCB6C', 0, Math.PI / 2); },
    haussmann(L, r) { // l'immeuble parisien : pierre crème, deux balcons filants, le toit de zinc et ses lucarnes
      const w = 0.9 + r() * 0.3; L.f(BOITE, 0, -0.2, 0, w, 1.3, 0.72, '#F6EEDC'); L.f(BOITE, 0, 1.1, 0, w + 0.04, 0.04, 0.76, '#E9DCC2');
      L.f(croupes(0.32), 0, 1.14, 0, w, 0.32, 0.72, '#7D8BA6');
      for (const y of [0.42, 0.76]) L.f(BOITE, 0, y, 0.37, w * 0.96, 0.035, 0.04, '#4A4A58');
      for (let k = 0; k < 3; k++) for (const y of [0.48, 0.82]) { L.f(QUAD, (k - 1) * w * 0.3, y, 0.362, 0.12, 0.2, 1, '#A9CBE0'); L.f(QUAD, (k - 1) * w * 0.3, y, -0.362, 0.12, 0.2, 1, '#A9CBE0', Math.PI); }
      L.f(QUAD, 0, 0, 0.362, w * 0.8, 0.3, 1, '#FFE9B8');
    },
    cafe(L, r) { // une terrasse : deux parasols et leurs tables
      for (const sx of [-0.35, 0.35]) { const c = r() > 0.5 ? '#E8505B' : '#3A86C8'; L.f(TUBE(4, 1), sx, 0, 0, 0.03, 0.55, 0.03, '#5A5A66'); L.f(CONE(8), sx, 0.5, 0, 0.6, 0.16, 0.6, c); L.f(CYL(6, 1), sx, 0, 0, 0.22, 0.2, 0.22, '#F2F2F2'); }
    },
    lampadaire(L) { L.f(TUBE(4, 1), 0, 0, 0, 0.05, 0.9, 0.05, '#3C3F4C'); L.f(ICO(0), 0, 0.86, 0, 0.14, 0.16, 0.14, '#FFE6A0'); },
    tour(L, r) { // une tour de la grande ville : pastel, ses bandes de fenêtres, son toit technique
      const c = ['#F4C6B5', '#BFE3D0', '#CAC3EE', '#F5E2A4', '#BCD6F1', '#F3C9DD'][Math.floor(r() * 6)], h = 1.4 + r() * 1.4, w = 0.6 + r() * 0.25;
      L.f(BOITE, 0, -0.1, 0, w, h + 0.1, w, c);
      for (let y = 0.2; y < h - 0.15; y += 0.24) L.f(BOITE, 0, y, 0, w + 0.02, 0.07, w + 0.02, '#A9D2EC');
      L.f(BOITE, 0, h, 0, w * 0.4, 0.14, w * 0.4, '#9A9FB0'); if (r() > 0.6) L.f(CYL(4, 1), w * 0.2, h, w * 0.2, 0.03, 0.4, 0.03, '#9A9FB0');
    },
    cabine(L, r) { // les cabines de plage, rayées
      const c = ['#3A86C8', '#E8505B', '#5FD3A4', '#FFC84A'][Math.floor(r() * 4)];
      L.f(BOITE, 0, 0, 0, 0.4, 0.55, 0.4, '#FFFFFF'); for (const sx of [-0.13, 0.13]) L.f(BOITE, sx, 0, 0.003, 0.07, 0.55, 0.402, c); L.f(PANS, 0, 0.55, 0, 0.46, 0.2, 0.46, c, Math.PI / 2);
    },
    parasol(L, r) { const c = ['#FF8A80', '#FFD66B', '#5FD3A4', '#B8A6FF'][Math.floor(r() * 4)]; L.f(TUBE(4, 1), 0, 0, 0, 0.04, 0.6, 0.04, '#FFFFFF'); L.f(CONE(8), 0, 0.5, 0, 0.7, 0.2, 0.7, c); L.f(BOITE, 0.25, 0, 0.1, 0.22, 0.01, 0.4, '#FFFFFF'); },
    voilier(L) { // la coque, le mât, deux voiles
      L.f(BOITE, 0, 0, 0, 0.24, 0.14, 0.7, '#FFFFFF'); L.f(CYL(4, 1), 0, 0, 0.35, 0.24, 0.14, 0.18, '#FFFFFF', Math.PI / 4); L.f(BOITE, 0, 0.13, 0, 0.25, 0.03, 0.71, '#3A86C8');
      L.f(TUBE(4, 1), 0, 0.14, 0.02, 0.03, 1.0, 0.03, '#8A6A4A'); L.f(TRI2, 0, 0.22, 0.04, 0.02, 0.85, 0.5, '#FFF8EE', Math.PI / 2); L.f(TRI2, 0, 0.22, 0.0, 0.02, 0.7, 0.36, '#FFE3EA', -Math.PI / 2);
    },
    bouee(L) { L.f(CYL(6, 0.7), 0, 0, 0, 0.3, 0.4, 0.3, '#E8505B'); L.f(CYL(6, 1), 0, 0.14, 0, 0.27, 0.1, 0.27, '#FFFFFF'); },
    ponton(L) { L.f(BOITE, 0, 0.1, 0, 0.3, 0.05, 1.4, '#C49A6C'); for (const z of [-0.6, 0, 0.6]) for (const sx of [-0.12, 0.12]) L.f(TUBE(4, 1), sx, -0.3, z, 0.04, 0.42, 0.04, '#8A6A4A'); },
    paillote(L) { for (const sx of [-0.25, 0.25]) for (const sz of [-0.25, 0.25]) L.f(TUBE(4, 1), sx, 0, sz, 0.05, 0.45, 0.05, '#A67C52'); L.f(CONE(6), 0, 0.4, 0, 0.9, 0.45, 0.9, '#E3C07A'); },
    chalet(L, r, neige) { // un chalet : rondins, toit à larges débords (enneigé aux cimes), balcon
      L.f(BOITE, 0, -0.2, 0, 0.9, 0.36, 0.7, '#BDB4A8'); L.f(BOITE, 0, 0.16, 0, 0.86, 0.42, 0.66, '#C99A6B'); L.f(BOITE, 0, 0.34, 0.36, 0.9, 0.04, 0.12, '#8B5E3C');
      L.f(PANS, 0, 0.58, 0, 1.1, 0.42, 0.9, neige === 'rouge' ? '#C4473C' : '#7A4E31', Math.PI / 2); L.f(PIGNONS, 0, 0.58, 0, 0.86, 0.42, 0.66, '#C99A6B', Math.PI / 2);
      if (neige) L.f(PANS, 0, 0.84, 0, 0.9, 0.17, 0.42, '#FAFCFF', Math.PI / 2); // la neige sur le faîte
      L.f(QUAD, -0.2, 0.2, 0.332, 0.18, 0.14, 1, VITRE_LUIT); L.f(QUAD, 0.2, 0.2, 0.332, 0.18, 0.14, 1, VITRE_LUIT);
    },
    bonhomme(L) { L.f(ICO(0), 0, 0, 0, 0.5, 0.48, 0.5, '#FFFFFF'); L.f(ICO(0), 0, 0.4, 0, 0.36, 0.34, 0.36, '#FFFFFF'); L.f(CONE(5), 0, 0.58, 0.16, 0.06, 0.16, 0.06, '#FF8C42', 0, Math.PI / 2); L.f(CYL(6, 1), 0, 0.7, 0, 0.22, 0.18, 0.22, '#3C3F4C'); },
    // les repères des régions
    moulin(L, eco) { // la tour blanche, le toit de tuiles, les ailes (à part, animées, sauf en éco)
      L.f(CYL(8, 0.82), 0, 0, 0, 0.9, 1.05, 0.9, '#F5EBDA'); L.f(CYL(8, 1), 0, 0, 0, 0.95, 0.14, 0.95, '#D9C9B0');
      L.f(QUAD, 0, 0.1, 0.45, 0.18, 0.32, 1, PORTE); L.f(QUAD, 0, 0.62, 0.4, 0.14, 0.16, 1, VITRE);
      L.f(CONE(8), 0, 1.04, 0, 0.86, 0.5, 0.86, '#D46A4C'); L.f(ICO(0), 0, 1.5, 0, 0.12, 0.12, 0.12, OR);
      if (eco) this.ailes(L, 0.3);
    },
    ailes(L, a) { // les quatre ailes du moulin autour de leur moyeu (x, y, z du lot), tournées de a
      const M0 = L.M.clone(); L.M.multiply(new THREE.Matrix4().makeTranslation(0, 0.9, 0.46)).multiply(new THREE.Matrix4().makeRotationZ(a || 0));
      L.f(CYL(6, 1), 0, 0, -0.05, 0.12, 0.1, 0.12, '#8B5E3C', 0, Math.PI / 2);
      for (let k = 0; k < 4; k++) { // (une boîte posée part de son point et s'allonge le long de y : tournée de b − 90°, le long de l'aile)
        const b = k * Math.PI / 2 + 0.3, c = Math.cos(b), sn = Math.sin(b), rz = b - Math.PI / 2;
        L.f(BOITE, 0, 0, 0.05, 0.05, 0.82, 0.04, '#B98A5E', 0, 0, rz); L.f(BOITE, c * 0.2 - sn * 0.12, sn * 0.2 + c * 0.12, 0.06, 0.22, 0.6, 0.02, '#FFF9EE', 0, 0, rz);
        for (const u of [0.32, 0.52, 0.72]) L.f(BOITE, c * u - sn * 0.12, sn * u + c * 0.12, 0.072, 0.24, 0.02, 0.012, '#C9A27A', 0, 0, rz);
      }
      L.M.copy(M0);
    },
    angle(L) { // l'immeuble d'angle parisien : deux ailes, la rotonde au coin et son petit dôme d'ardoise, le café au pied
      for (const [x, z, ry] of [[-0.55, 0, 0], [0, -0.55, Math.PI / 2]]) { L.f(BOITE, x, -0.2, z, 1.1, 1.5, 0.7, '#F2E7D2', ry); L.f(croupes(0.38), x, 1.3, z, 1.1, 0.3, 0.7, '#7D8BA6', ry); }
      L.f(CYL(10, 1), 0.08, -0.2, 0.08, 0.8, 1.6, 0.8, '#F4EAD6'); L.f(DOME(8), 0.08, 1.4, 0.08, 0.8, 0.7, 0.8, '#6E7C98'); L.f(CONE(4), 0.08, 1.74, 0.08, 0.08, 0.3, 0.08, OR);
      for (const y of [0.42, 0.82]) { L.f(TUBE(10, 1), 0.08, y, 0.08, 0.86, 0.04, 0.86, '#4A4A58'); L.f(BOITE, -0.55, y, 0.36, 1.06, 0.035, 0.04, '#4A4A58'); L.f(BOITE, 0.36, y, -0.55, 0.04, 0.035, 1.06, '#4A4A58'); }
      for (let k = 0; k < 3; k++) for (const y of [0.5, 0.9]) { L.f(QUAD, -0.85 + k * 0.28, y, 0.352, 0.13, 0.22, 1, '#A9CBE0'); L.f(QUAD, 0.352, y, -0.85 + k * 0.28, 0.13, 0.22, 1, '#A9CBE0', Math.PI / 2); }
      for (const [x, z] of [[-0.45, 0.78], [0.78, -0.45]]) { const M0 = L.M.clone(); L.M.multiply(_m.makeTranslation(x, 0, z)); this.cafe(L, () => 0.3 + 0.4 * Math.abs(x)); L.M.copy(M0); }
    },
    phare(L) { // le phare rayé sur son rocher
      L.f(ICO(0), 0, -0.25, 0, 1.0, 0.5, 0.9, '#B9B2AA');
      for (let k = 0; k < 4; k++) L.f(CYL(8, 0.93), 0, 0.15 + k * 0.32, 0, 0.5 - k * 0.04, 0.32, 0.5 - k * 0.04, k % 2 ? '#E8505B' : '#FFFFFF');
      L.f(CYL(8, 1), 0, 1.43, 0, 0.5, 0.06, 0.5, '#4A4E5A'); L.f(CYL(8, 1), 0, 1.49, 0, 0.3, 0.22, 0.3, '#FFE69A'); L.f(CONE(8), 0, 1.71, 0, 0.42, 0.24, 0.42, '#E8505B');
    },
    hotel(L) { // le grand chalet de la vallée : soubassement de pierre, bois clair, balcons blancs fleuris, son clocher
      L.f(BOITE, 0, -0.2, 0, 1.4, 0.45, 0.9, '#C9C1B6'); L.f(BOITE, 0, 0.25, 0, 1.36, 0.62, 0.86, '#E0B07E');
      for (const y of [0.42, 0.72]) { L.f(BOITE, 0, y, 0.46, 1.4, 0.05, 0.14, '#FFFFFF'); L.f(BOITE, 0, y + 0.05, 0.52, 1.36, 0.04, 0.03, '#FF8FA3'); }
      L.f(PANS, 0, 0.87, 0, 1.52, 0.56, 1.06, '#9A6440'); L.f(PIGNONS, 0, 0.87, 0, 1.36, 0.56, 0.86, '#E0B07E');
      for (let k = 0; k < 4; k++) for (const y of [0.32, 0.62]) L.f(QUAD, -0.5 + k * 0.33, y, 0.432, 0.16, 0.14, 1, VITRE_LUIT);
      L.f(BOITE, 0.9, -0.2, -0.1, 0.3, 1.35, 0.3, '#FFFFFF'); L.f(CYL(8, 1), 0.9, 1.15, -0.1, 0.3, 0.12, 0.3, '#8B5E3C'); L.f(ICO(0), 0.9, 1.22, -0.1, 0.3, 0.3, 0.3, '#7A4E31'); L.f(CONE(6), 0.9, 1.46, -0.1, 0.08, 0.34, 0.08, '#7A4E31');
    },
    gratteciel(L) { // le gratte-ciel de la grande ville : trois gradins, ses fenêtres, sa flèche
      const c = '#C9C2EE'; let y = -0.1;
      for (const [w, h] of [[1.0, 1.3], [0.76, 0.9], [0.52, 0.6]]) { L.f(BOITE, 0, y, 0, w, h + (y < 0 ? 0.1 : 0), w, c); for (let k = y + 0.2; k < y + h - 0.1; k += 0.22) L.f(BOITE, 0, k, 0, w + 0.02, 0.07, w + 0.02, '#A9D2EC'); y += h + (y < 0 ? 0.1 : 0); }
      L.f(CYL(6, 0.2), 0, y, 0, 0.14, 0.7, 0.14, '#E6E2F5'); L.f(ICO(0), 0, y + 0.66, 0, 0.08, 0.08, 0.08, '#FF6B8B');
    },
    halle(L) { // la gare : le bâtiment des voyageurs, la grande verrière, la tour de l'horloge
      L.f(BOITE, 0, -0.2, 0.35, 1.7, 0.75, 0.6, '#F1E3C8'); L.f(croupes(0.6), 0, 0.55, 0.35, 1.76, 0.3, 0.66, '#4E8A6E');
      for (let k = 0; k < 5; k++) L.f(QUAD, -0.64 + k * 0.32, 0.12, 0.652, 0.16, 0.3, 1, k === 2 ? PORTE : VITRE);
      L.f(VOUTE, 0, 0.1, -0.3, 1.6, 0.9, 0.9, '#A8D4C6'); for (let k = -1; k <= 1; k++) L.f(ARCHE, k * 0.6, 0.1, -0.3, 0.92, 0.92, 1.4, '#3F6B57', Math.PI / 2);
      L.f(BOITE, 0, -0.2, 0.72, 0.32, 1.5, 0.32, '#F1E3C8'); L.f(CYL(12, 1), 0, 1.0, 0.885, 0.24, 0.24, 0.02, '#FFFFFF', 0, Math.PI / 2); L.f(croupes(0), 0, 1.3, 0.72, 0.38, 0.32, 0.38, '#4E8A6E');
    },
    locomotive(L) { // le petit train : la loco rouge (chaudière, cabine, cheminée)
      L.f(BOITE, 0, 0.06, 0, 0.34, 0.06, 0.95, '#3B3B48'); L.f(CYL(8, 1), 0, 0.3, 0.14, 0.32, 0.55, 0.32, '#E8505B', 0, Math.PI / 2);
      L.f(BOITE, 0, 0.12, -0.28, 0.36, 0.42, 0.34, '#E8505B'); L.f(BOITE, 0, 0.54, -0.28, 0.42, 0.05, 0.4, '#3B3B48'); L.f(CYL(6, 1.3), 0, 0.42, 0.3, 0.1, 0.2, 0.1, '#3B3B48'); L.f(QUAD, 0.181, 0.32, -0.28, 0.16, 0.12, 1, VITRE, Math.PI / 2);
    },
    wagon(L, r, c) { L.f(BOITE, 0, 0.06, 0, 0.32, 0.06, 0.78, '#3B3B48'); L.f(BOITE, 0, 0.1, 0, 0.34, 0.36, 0.74, c || '#5FAE8B'); L.f(BOITE, 0, 0.46, 0, 0.38, 0.05, 0.8, '#F5F0E6'); for (const z of [-0.2, 0.15]) L.f(QUAD, 0.171, 0.24, z, 0.2, 0.12, 1, VITRE, Math.PI / 2); },
    chateau(L) { // le château de conte de fées : la muraille, ses quatre tours aux toits violets, le donjon, la grande tour
      const pierre = '#F3EBDD', toit = '#8C6BC2', creneau = '#E8DFCF';
      for (const [x, z, ry] of [[0, 0.5, 0], [0, -0.5, 0], [0.5, 0, Math.PI / 2], [-0.5, 0, Math.PI / 2]]) { L.f(BOITE, x, -0.2, z, 1.0, 0.65, 0.12, pierre, ry); for (let k = -1; k <= 1; k++) L.f(BOITE, x + (ry ? 0 : k * 0.3), 0.45, z + (ry ? k * 0.3 : 0), 0.1, 0.09, 0.14, creneau, ry); }
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) { L.f(CYL(8, 1), sx, -0.2, sz, 0.28, 1.05, 0.28, pierre); L.f(CONE(8), sx, 0.85, sz, 0.36, 0.42, 0.36, toit); }
      L.f(BOITE, -0.05, -0.2, -0.05, 0.5, 1.3, 0.5, pierre); L.f(croupes(0), -0.05, 1.1, -0.05, 0.56, 0.42, 0.56, toit);
      L.f(CYL(8, 1), 0.2, -0.2, 0.15, 0.22, 1.75, 0.22, pierre); L.f(CONE(8), 0.2, 1.55, 0.15, 0.3, 0.55, 0.3, toit); L.f(CYL(4, 1), 0.2, 2.1, 0.15, 0.02, 0.25, 0.02, '#8A8F9C'); L.f(QUAD2, 0.28, 2.22, 0.15, 0.16, 0.1, 1, '#FF8FA3');
      L.f(QUAD, 0, -0.0, 0.562, 0.22, 0.34, 1, '#6B4A35');
    },
    eiffel(L) { // la tour Eiffel : quatre pieds, deux plateformes, le fût et l'antenne
      const c = '#B08F78', A = new V3(), B = new V3();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { L.poutre(A.set(sx * 0.5, 0, sz * 0.5), B.set(sx * 0.22, 0.62, sz * 0.22), 0.13, c); L.poutre(A.set(sx * 0.22, 0.62, sz * 0.22), B.set(sx * 0.1, 1.42, sz * 0.1), 0.08, c); }
      for (const [w, y] of [[0.6, 0.6], [0.3, 1.4]]) { L.f(BOITE, 0, y, 0, w, 0.06, w, '#9C7C66'); }
      for (const [sx, sz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]]) L.f(ARCHE, sx * 0.36, 0.0, sz * 0.36, 0.7, 0.62, 1.2, c, ry, 0, 0);
      L.f(CYL(4, 0.25), 0, 1.45, 0, 0.16, 1.05, 0.16, c, Math.PI / 4); L.f(CYL(4, 0.3), 0, 2.48, 0, 0.04, 0.3, 0.04, c);
    },
    arc(L) { L.f(BOITE, -0.36, -0.2, 0, 0.28, 1.05, 0.4, '#F0E6D2'); L.f(BOITE, 0.36, -0.2, 0, 0.28, 1.05, 0.4, '#F0E6D2'); L.f(BOITE, 0, 0.62, 0, 1.0, 0.42, 0.42, '#F0E6D2'); L.f(BOITE, 0, 1.04, 0, 1.04, 0.05, 0.46, '#E1D3B8'); },
    invalides(L) { L.f(BOITE, 0, -0.2, 0, 1.2, 0.6, 0.6, '#F2E8D6'); L.f(CYL(10, 1), 0, 0.4, 0, 0.5, 0.3, 0.5, '#F2E8D6'); L.f(DOME(10), 0, 0.7, 0, 0.56, 0.5, 0.56, OR); L.f(CYL(6, 0.2), 0, 0.94, 0, 0.08, 0.36, 0.08, OR); },
    fontaine(L) { L.f(CYL(10, 1), 0, 0, 0, 0.9, 0.14, 0.9, '#E6DDCF'); L.f(CYL(10, 1), 0, 0.02, 0, 0.78, 0.13, 0.78, '#8FD3F0'); L.f(CYL(6, 1), 0, 0, 0, 0.16, 0.5, 0.16, '#E6DDCF'); L.f(CYL(8, 0.6), 0, 0.46, 0, 0.42, 0.08, 0.42, '#E6DDCF'); L.f(ICO(0), 0, 0.52, 0, 0.12, 0.2, 0.12, '#BDE8F7'); },
    gare_station(L, neige) { L.f(BOITE, 0, -0.2, 0, 0.8, 0.6, 0.6, '#C99A6B'); L.f(PANS, 0, 0.4, 0, 0.96, 0.3, 0.76, neige ? '#F7FAFE' : '#7A4E31'); L.f(PIGNONS, 0, 0.4, 0, 0.8, 0.3, 0.6, '#C99A6B'); },
    nuage(L, r) { const n = 3; for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * 0.42 + (r() - 0.5) * 0.1, s = 0.55 + 0.35 * Math.sin(Math.PI * (k + 0.5) / n) + r() * 0.15; L.f(ICO(k === 1 ? 1 : 0), x, -s * 0.35 + r() * 0.06, (r() - 0.5) * 0.2, s, s * 0.8, s * 0.85, k % 2 ? '#FFFFFF' : '#FBF8FF', r() * 3); } },
  };

  // ─── le kit de modèles libres (qualité haute et moyenne, la HD permise) : fournil/hd/planete/planete.glb, lu une fois par HDM (src/hd.js,
  //     le lot « planete »), puis gardé ici en tableaux (triangles et couleurs de sommets, posés sur y = 0, la plus grande cote ramenée à 1) ───
  let KIT = null;
  const kitPermis = () => typeof HDM !== 'undefined' && HDM.actif && !HDM.coupe() && HDM.LOTS && HDM.LOTS.planete;
  function lireKit() {
    if (KIT) return KIT; const sc = typeof HDM !== 'undefined' && HDM.scene ? HDM.scene('planete') : null; if (!sc) return null;
    const o = {}; sc.updateMatrixWorld(true);
    sc.traverse((m) => {
      if (!m.isMesh) return; const g = m.geometry, pos = g.attributes.position, col = g.attributes.color, idx = g.index, n = idx ? idx.count : pos.count, P = new Float32Array(n * 3), C = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { const i = idx ? idx.getX(k) : k; _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); P[k * 3] = _v.x; P[k * 3 + 1] = _v.y; P[k * 3 + 2] = _v.z; C[k * 3] = col ? col.getX(i) : 1; C[k * 3 + 1] = col ? col.getY(i) : 1; C[k * 3 + 2] = col ? col.getZ(i) : 1; }
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < P.length; k++) { mn[k % 3] = Math.min(mn[k % 3], P[k]); mx[k % 3] = Math.max(mx[k % 3], P[k]); }
      const t = Math.max(1e-6, mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]), cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
      for (let k = 0; k < P.length; k += 3) { P[k] = (P[k] - cx) / t; P[k + 1] = (P[k + 1] - mn[1]) / t; P[k + 2] = (P[k + 2] - cz) / t; }
      o[m.name] = { P, C };
    });
    KIT = o; return KIT;
  }

  // ─── l'état de la planète ouverte ───
  let E = null;
  const CAM = { fov: 30, fovPres: 44, pres: 0.62, inclin: 60 * DEG, penche: 0.36, choix: 0.72, choixMin: 0.24, inclChoix: 48 * DEG }; // (choix : le zoom d'une boutique choisie, au plus ; inclChoix : son inclinaison, au moins ; voir cadrage)
  const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  // une fiche de CHAINE.liste, bornée : ce que la planète en garde (le reste, la caisse, le rythme, ne la regarde pas)
  function normaliser(f) {
    f = f || {}; const n = Math.max(1, Math.floor(+f.n) || 1);
    let q = typeof f.quartier === 'string' ? REG.findIndex((R) => R.id === f.quartier) : Number.isInteger(f.q) ? f.q : -1; if (q < 0 || q >= REG.length) q = quartierDe(n);
    const s = Number.isInteger(f.standing) ? borne(f.standing, 0, 5) : standingDe(n);
    const j = f.jauge && +f.jauge.max > 0 ? { fait: borne(Math.floor(+f.jauge.fait) || 0, 0, Math.floor(+f.jauge.max)), max: Math.floor(+f.jauge.max), niv: Math.max(0, Math.floor(+f.jauge.niv) || 0) } : null;
    const g = f.gerant && typeof f.gerant === 'object' ? { rythme: Math.max(0, Math.floor(+f.gerant.rythme) || 0), duree: Math.max(0, Math.floor(+f.gerant.duree) || 0),
      part: Number.isFinite(+f.gerant.part) ? +f.gerant.part : null, heures: Number.isFinite(+f.gerant.heures) ? +f.gerant.heures : null, reste: Number.isFinite(+f.gerant.reste) ? Math.max(0, +f.gerant.reste) : null } : null;
    const nom = typeof f.nom === 'string' && f.nom.trim() ? f.nom.trim().slice(0, 40) : (QS[q] && QS[q].enseigne) || `Boutique n°${n}`;
    return { n, q, s, jetons: Math.max(0, Math.floor(+f.jetons) || 0), gerant: g, or: !!f.or, nom, jauge: j };
  }
  const lireFiches = (fiches) => (Array.isArray(fiches) ? fiches : []).map(normaliser).filter((f, i, a) => a.findIndex((g) => g.n === f.n) === i).sort((a, b) => a.n - b.n);

  // ─── le sol : une icosphère à facettes, chaque facette colorée selon sa région, son altitude et sa pente, rangée dans le lot de sa région ───
  // l'icosphère : les vingt faces de l'icosaèdre, chacune découpée en (n + 1)² triangles, ramenés sur la sphère ; seulement les positions
  // (THREE.IcosahedronGeometry calcule aussi ses UV et ses normales : quatre fois plus lent, pour rien ici)
  const ICOS = new Map();
  function icosphere(detail) {
    let P = ICOS.get(detail); if (P) return P;
    const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const n = detail + 1, out = new Float32Array(20 * n * n * 9), q = new V3(); let o = 0;
    const pt = (a, b, c, i, j) => { const u = i / n, w = j / n; q.set(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * w, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * w, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * w).normalize(); out[o++] = q.x; out[o++] = q.y; out[o++] = q.z; };
    for (const [ia, ib, ic] of f) {
      const a = v[ia], b = v[ib], c = v[ic];
      for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
        pt(a, b, c, i, j); pt(a, b, c, i + 1, j); pt(a, b, c, i, j + 1);
        if (i + j < n - 1) { pt(a, b, c, i + 1, j); pt(a, b, c, i + 1, j + 1); pt(a, b, c, i, j + 1); }
      }
    }
    ICOS.set(detail, out); return out;
  }
  function sol(lots, detail) {
    const P = icosphere(detail);
    const cache = new Map(), p = new V3(), alts = new Float32Array(P.length / 3);
    for (let i = 0; i < alts.length; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], k = Math.round((x + 1) * 4000) * 64016001 + Math.round((y + 1) * 4000) * 8001 + Math.round((z + 1) * 4000);
      let h = cache.get(k); if (h === undefined) { h = altitude(p.set(x, y, z).normalize()); cache.set(k, h); } alts[i] = h;
    }
    const o = {}, a = new V3(), b = new V3(), c = new V3(), m = new V3(), SABLE = couleur('#F6EAC6'), FOND = couleur('#E5DAB0'), LAGON = couleur('#A6DED6'), ECUME = couleur('#FBFAF2'), BERGE = couleur('#CDBFA5'), LIT = couleur('#8ACDD2');
    for (let f = 0, nf = P.length / 9; f < nf; f++) {
      const i = f * 9; a.set(P[i], P[i + 1], P[i + 2]).normalize(); b.set(P[i + 3], P[i + 4], P[i + 5]).normalize(); c.set(P[i + 6], P[i + 7], P[i + 8]).normalize();
      const ha = alts[f * 3], hb = alts[f * 3 + 1], hc = alts[f * 3 + 2], h = (ha + hb + hc) / 3, pente = Math.max(ha, hb, hc) - Math.min(ha, hb, hc);
      m.copy(a).add(b).add(c).normalize(); plusProches(m, o); const R = REG[o.i1];
      let k;
      if (R.id === 'capitale' && h < 1.013) k = h < MER - 0.0026 ? LIT : BERGE; // la Seine : son lit et ses berges de pierre (ni plage ni écume)
      else if (h < MER - 0.0026) k = melange(SABLE, melange(FOND, LAGON, 0.55), lisse(MER - 0.003, MER - 0.022, h));
      else if (h < MER + 0.0012) k = ECUME; // l'écume, là où les vagues viennent mourir
      else if (h < MER + 0.0042) k = SABLE;
      else {
        k = couleur(SOL[R.id](m, h, pente, angle(m, R.c)));
        const ec = o.d2 - o.d1; if (ec < 0.024) { const R2 = REG[o.i2]; k = melange(k, couleur(SOL[R2.id](m, h, pente, angle(m, R2.c))), 0.5 * (1 - ec / 0.024)); }
      }
      if (!E.gagne[o.i1]) k = melange(k, BRUME, 0.5);
      const v = 0.955 + 0.075 * hache(m.x * 91.7, m.y * 91.7, m.z * 91.7), L = lots[o.i1];
      L.p.push(a.x * ha, a.y * ha, a.z * ha, b.x * hb, b.y * hb, b.z * hb, c.x * hc, c.y * hc, c.z * hc);
      for (let j = 0; j < 3; j++) L.c.push(k[0] * v, k[1] * v, k[2] * v);
    }
  }

  // le phare du bord de mer : sur la côte, le long d'un méridien du village décalé vers l'île (le dernier point de terre avant l'eau), à
  // l'écart des premières boutiques
  let PHARE = null;
  function phare() {
    if (PHARE) return PHARE; const v = new V3(), az = 205 * DEG;
    for (let a = 0.7; a < 1.4; a += 0.006) { v.set(Math.sin(a) * Math.sin(az), Math.sin(a) * Math.cos(az), Math.cos(a)); if (altitude(v) < MER + 0.009) break; PHARE = v.clone(); }
    return PHARE || (PHARE = RI.mer.c.clone());
  }
  // ─── les places des boutiques d'un quartier : d'abord des anneaux autour de son repère (espacés de 0,16 rad), puis une spirale qui remplit
  //     le reste (0,13 rad), sur la terre ferme, à plat, loin des frontières ; les premières du côté de l'avant de la planète. Quand il en
  //     faut plus (une chaîne de plus de cent boutiques), des étapes s'ajoutent, toujours à la fin de la liste (une boutique ne change jamais
  //     de place) : un îlot de plus (l'île et le bord de mer : trois places en triangle), ou une spirale plus serrée (0,105, 0,085, 0,07,
  //     0,058 rad), dont les boutiques sont plus petites (ECHELLE_NIV). La façade regarde dehors (le repère derrière elle) ; au bord de mer,
  //     la mer ───
  const ANNEAUX = { ile: [[0.12, 5, 0.1], [0.2, 7, 0.35]], gare: [[0.2, 6, 0], [0.3, 8, 0.25]], mer: [[0.16, 8, 0], [0.28, 9, 0.3], [0.39, 10, 0.1]] };
  const DENSITES = [0.105, 0.085, 0.07, 0.058];
  // les étapes de chaque quartier : l'île lève ses îlots d'abord (deux par spirale serrée), le bord de mer resserre d'abord ; les autres resserrent
  const ETAPES = {};
  for (const R of REG) {
    const L = ILOTS[R.id], d = DENSITES.map((s, k) => ({ d: s, niv: k + 1 }));
    if (!L) { ETAPES[R.id] = d; continue; }
    const i = L.slice(ILOTS_ACTIFS[R.id]).map(() => ({ ilot: true })), o = R.id === 'mer' ? [d.shift()] : [];
    while (i.length || d.length) { o.push(...i.splice(0, 2)); if (d.length) o.push(d.shift()); }
    ETAPES[R.id] = o;
  }
  const PLACES = new Map(); // R.i → { liste, etape } : gardé pour la session (quelques dizaines de points par quartier)
  function placesDe(R, besoin) {
    let c = PLACES.get(R.i); if (!c) { c = { liste: placesBase(R), etape: 0 }; PLACES.set(R.i, c); }
    const et = ETAPES[R.id];
    while (c.liste.length < besoin && c.etape < et.length) { etendre(R, c, et[c.etape]); c.etape++; }
    return c.liste;
  }
  const _o = {};
  // une place possible en p : dans son quartier, loin d'une frontière (bord), sur la terre, loin du repère, à plat (pente : l'écart d'altitude
  // permis à 0,035 rad autour) ; null sinon
  function essaiPlace(R, p, rho, b, bord, pente, repere) {
    const h = altitude(p, _o), d = new V3();
    if (_o.i1 !== R.i || _o.d2 - _o.d1 < bord || h < MER + 0.007 || (repere && angle(p, repere) < (R.id === 'mer' ? 0.11 : 0.13)) || (R.id === 'gare' && Math.abs(rho - 0.41) < 0.055)) return null;
    for (let j = 0; j < 4; j++) { if (Math.abs(altitude(autour(R, rho + 0.035 * Math.cos(j * 1.57), b + 0.035 * Math.sin(j * 1.57) / Math.max(0.1, rho), d)) - h) > pente) return null; }
    return { p, h, rho, b, niv: 0 };
  }
  const repereDe = (R) => (R.id === 'mer' ? phare() : R.id === 'ile' ? null : R.c);
  function facade(R, x) { const loin = R.id === 'mer' ? RI.village.c : R.c; x.f = x.p.clone().sub(loin); x.f.addScaledVector(x.p, -x.f.dot(x.p)).normalize(); if (x.f.lengthSq() < 0.5) x.f.copy(R.e1).negate(); return x; }
  function placesBase(R) {
    const anneaux = ANNEAUX[R.id] || [[0.22, 6, 0], [0.35, 8, 0.3], [0.47, 9, 0.1]], repere = repereDe(R);
    const premiers = [], suite = [];
    for (const [rho, n, dec] of anneaux) for (let k = 0; k < n; k++) { const b = (k + dec) * TAU / n, x = essaiPlace(R, autour(R, rho, b), rho, b, 0.07, 0.009, repere); if (x) { x.cle = rho * 0.8 - x.p.z; premiers.push(x); } }
    for (let k = 0; k < 160; k++) { const rho = 0.12 + 0.5 * Math.sqrt((k + 0.5) / 160), b = k * 2.39996, x = essaiPlace(R, autour(R, rho, b), rho, b, 0.045, 0.012, repere); if (x) { x.cle = rho * 0.8 - x.p.z; suite.push(x); } }
    premiers.sort((x, y) => x.cle - y.cle); suite.sort((x, y) => x.cle - y.cle);
    const out = [];
    for (const x of premiers) if (!out.some((y) => angle(x.p, y.p) < 0.16)) out.push(x);
    for (const x of suite) if (!out.some((y) => angle(x.p, y.p) < 0.13)) out.push(x);
    return out.map((x) => facade(R, x));
  }
  function etendre(R, c, et) {
    const repere = repereDe(R), neuves = [];
    const loinDe = (x, marge) => c.liste.every((y) => angle(x.p, y.p) >= marge + (y.niv ? 0 : 0.012)) && neuves.every((y) => angle(x.p, y.p) >= marge); // (une place serrée garde un peu plus d'écart avec une boutique de taille entière)
    if (et.ilot) { // un îlot de plus : ses trois places en triangle, à 0,065 rad de son centre
      const it = ILOTS[R.id][ILOTS_ACTIFS[R.id]]; if (!it) return; ILOTS_ACTIFS[R.id]++;
      const e1 = R.c.clone().addScaledVector(it.c, -R.c.dot(it.c)).normalize(), loc = { c: it.c, e1, e2: new V3().crossVectors(it.c, e1) };
      for (let k = 0; k < 3; k++) {
        const b = k * TAU / 3 + 0.4, p = autour(loc, 0.065, b), d = angle(p, R.c), bb = Math.atan2(p.dot(R.e2), p.dot(R.e1)), x = essaiPlace(R, p, d, bb, 0.05, 0.013, repere);
        if (x && loinDe(x, 0.1)) { x.niv = 1; neuves.push(x); }
      }
    } else { // une spirale plus serrée
      const nb = Math.ceil(2.4 / (et.d * et.d)), cands = [];
      for (let k = 0; k < nb; k++) { const rho = 0.1 + 0.56 * Math.sqrt((k + 0.5) / nb), b = k * 2.39996 + et.niv, x = essaiPlace(R, autour(R, rho, b), rho, b, 0.04, 0.014, repere); if (x) { x.cle = rho * 0.8 - x.p.z; cands.push(x); } }
      cands.sort((x, y) => x.cle - y.cle);
      for (const x of cands) if (loinDe(x, et.d)) { x.niv = et.niv; neuves.push(x); }
    }
    for (const x of neuves) c.liste.push(facade(R, x));
  }

  // ─── le décor d'une région : son repère, puis des objets semés (graine fixe), loin des boutiques, du repère, des frontières et de l'eau ───
  function decorDe(R, L, r, D, Lf) { // L : le décor de la région ; Lf : ses petits objets (montrés seulement quand on s'approche)
    const eco = E.eco, places = E.placesQ[R.i].slice(0, E.parQ[R.i]), poses = [], o = {}, ombres = D.ombres, kit = E.kit;
    const occupe = (p, rayon) => places.some((x) => angle(p, x.p) < 0.07 * ECHELLE_NIV[x.niv] + rayon) || poses.some((x) => angle(p, x.p) < x.r + rayon);
    function poserObjet(type, p, h, f, s, rayon, ombre, arg, fin) {
      const LL = fin ? Lf : L; poser(LL.M, p, h, f, s);
      if (type.startsWith('kit:')) { const k = kit && kit[type.slice(4)]; if (!k) return false; LL.brut(k.P, LL.M, [1, 1, 1], 0, k.C); }
      else MODELES[type](LL, r, arg);
      poses.push({ p: p.clone(), r: rayon }); if (ombre) ombres.push({ p: p.clone(), h, f: f.clone(), s: ombre }); return true;
    }
    const repere = (type, p, s, rayon, ombre, arg) => { const h = altitude(p, o), f = R.e1.clone().negate(); poserObjet(type, p, h - 0.003, f, s, rayon, ombre, arg); return { p, h, f, s }; };
    // semer(type, nombre, ρ min, ρ max, échelle min, max, options) ; options : eau (sur l'eau), plage, plat, ombre, neige, eco (part gardée en éco),
    // sur (un prédicat de plus), fin (un petit objet : dans le décor fin)
    function semer(type, nb, r0, r1, s0, s1, op) {
      op = op || {}; const n = eco ? Math.round(nb * (op.eco == null ? 0.3 : op.eco)) : nb;
      let k = 0; for (let essais = 0; k < n && essais < n * 25; essais++) {
        const rho = Math.sqrt(lerp(r0 * r0, r1 * r1, r())), p = autour(R, rho, r() * TAU), h = altitude(p, o), s = lerp(s0, s1, r()), rayon = s * (op.place || 0.55);
        if (!op.libre && (o.i1 !== R.i || o.d2 - o.d1 < 0.035)) continue;
        if (op.eau ? h > MER - 0.004 : op.plage ? h < MER + 0.0015 || h > MER + 0.013 : h < MER + 0.005) continue;
        if (op.haut != null && h > op.haut) continue;
        if (op.sur && !op.sur(p)) continue;
        if (occupe(p, rayon)) continue;
        if (op.plat) { const h2 = altitude(autour(R, rho + 0.03, 0.3), o); if (Math.abs(h2 - h) > 0.012) continue; }
        const f = op.face ? op.face(p) : capAleatoire(p, r() * TAU);
        if (poserObjet(type, p, (op.eau ? MER : h) - (op.enfonce == null ? 0.003 : op.enfonce), f, s, rayon, op.ombre ? s * op.ombre : 0, op.neige, op.fin)) k++;
      }
      if (E.journal) E.journal.push(`${R.id} ${type} ${k}/${n}`);
    }
    const versCentre = (p) => R.c.clone().sub(p).addScaledVector(p, -(R.c.clone().sub(p)).dot(p)).normalize();
    switch (R.id) {
      case 'village': {
        const m = repere('moulin', R.c, 0.15, 0.13, 0.14); if (!eco) D.animer.moulin = m;
        semer('maison', 9, 0.27, 0.58, 0.05, 0.062, { ombre: 1.1, plat: true, eco: 0.35 });
        if (kit) { semer('kit:etal_rouge', 1, 0.12, 0.16, 0.04, 0.04, { plat: true, ombre: 1, face: versCentre, fin: true }); semer('kit:etal_vert', 1, 0.12, 0.16, 0.04, 0.04, { plat: true, ombre: 1, face: versCentre, fin: true }); for (const fl of ['rouges', 'jaunes', 'mauves']) semer('kit:fleurs_' + fl, 3, 0.14, 0.58, 0.016, 0.022, { place: 0.3, fin: true }); }
        for (let k = 0; k < 6; k++) { const b = (k + 0.5) * TAU / 6, pts = [], hs = []; for (let j = 0; j <= 14; j++) { const q = autour(R, 0.075 + j * 0.03, b + 0.06 * Math.sin(j * 0.9 + k)); pts.push(q); hs.push(altitude(q)); } L.ruban(pts, hs, 0.018, '#E9D4A9'); for (const q of pts) poses.push({ p: q, r: 0.012 }); } // les chemins
        semer('arbre', 24, 0.22, 0.62, 0.042, 0.06, { ombre: 0.8 }); semer('meule', 9, 0.3, 0.6, 0.026, 0.032, { eco: 0, fin: true }); semer('buisson', 12, 0.2, 0.6, 0.02, 0.03, { eco: 0, fin: true });
        break;
      }
      case 'paris':
        repere('angle', R.c, 0.09, 0.14, 0.16);
        semer('haussmann', 16, 0.13, 0.5, 0.064, 0.076, { ombre: 1.1, plat: true, face: versCentre, eco: 0.3, place: 0.5 });
        semer('platane', 16, 0.22, 0.6, 0.042, 0.052, { ombre: 0.8, eco: 0.3 }); semer('lampadaire', 6, 0.2, 0.45, 0.04, 0.045, { eco: 0, fin: true }); semer('cafe', 4, 0.22, 0.42, 0.045, 0.05, { eco: 0, plat: true, fin: true });
        break;
      case 'mer': {
        // le phare : sur la côte, du côté de la mer
        repere('phare', phare(), 0.12, 0.08, 0.08);
        semer('cabine', 7, 0.0, 0.42, 0.035, 0.04, { plage: true, eco: 0.3, face: (p) => p.clone().sub(RI.village.c).addScaledVector(p, -(p.clone().sub(RI.village.c)).dot(p)).normalize() });
        semer('parasol', 9, 0.0, 0.45, 0.03, 0.036, { plage: true, eco: 0, fin: true });
        if (kit) semer('kit:voilier', 2, 0.15, 0.45, 0.085, 0.095, { eau: true, libre: true, enfonce: 0 }); semer('voilier', kit ? 2 : 4, 0.15, 0.6, 0.075, 0.085, { eau: true, libre: true, eco: 0.25, enfonce: 0 }); semer('bouee', 4, 0.1, 0.5, 0.016, 0.02, { eau: true, libre: true, eco: 0, enfonce: 0, fin: true }); // (deux voiliers du kit, 390 triangles pièce ; les autres faits main, 44)
        semer('arbre', 10, 0.0, 0.5, 0.04, 0.05, { ombre: 0.8, haut: 1.03 }); semer('maison', 4, 0.1, 0.45, 0.045, 0.055, { plat: true, ombre: 1.1, eco: 0.25 });
        if (ILOTS_ACTIFS.mer) semer('palmier', 2 * ILOTS_ACTIFS.mer, 0.1, 0.66, 0.045, 0.06, { ombre: 0.6, eco: 0.3, sur: (p) => cote(p) > 0.06 }); // (les îlots du bord de mer)
        break;
      }
      case 'montagne':
        repere('hotel', R.c, 0.095, 0.12, 0.14);
        semer('sapin', 34, 0.13, 0.64, 0.04, 0.065, { haut: 1.085, eco: 0.3 }); semer('chalet', 5, 0.2, 0.42, 0.045, 0.055, { plat: true, ombre: 1.1, eco: 0.2 }); semer('rocher', 8, 0.28, 0.6, 0.03, 0.045, { eco: 0, fin: true });
        break;
      case 'ville':
        repere('gratteciel', R.c, 0.12, 0.1, 0.12);
        if (kit) for (const im of ['immeuble_a', 'immeuble_b', 'immeuble_c']) semer('kit:' + im, 1, 0.12, 0.42, 0.095, 0.11, { plat: true, ombre: 0.75, face: versCentre, place: 0.45 }); // (un de chaque : 400 à 700 triangles pièce)
        semer('tour', kit ? 15 : 18, 0.12, 0.55, 0.055, 0.065, { plat: true, ombre: 0.9, eco: 0.33 }); semer('arbre', 10, 0.2, 0.6, 0.04, 0.05, { ombre: 0.8, eco: 0.2 });
        break;
      case 'gare': {
        repere('halle', R.c, 0.095, 0.12, 0.16);
        const RAIL = 0.41, N = eco ? 24 : 48, pts = [], hs = [];
        for (let k = 0; k <= N; k++) { const p = autour(R, RAIL, k * TAU / N); pts.push(p); hs.push(altitude(p) + 0.0015); }
        L.ruban(pts, hs, 0.024, '#B9A58A'); // le ballast, puis les deux rails (des rubans : 2 triangles par tronçon ; des boîtes en coûtaient 30)
        if (!eco) for (const c2 of [-0.0065, 0.0065]) { const pr = [], hr = []; for (let k = 0; k <= N; k++) { pr.push(autour(R, RAIL + c2, k * TAU / N)); hr.push(hs[k] + 0.0012); } L.ruban(pr, hr, 0.0028, '#6E6A78'); }
        poses.push(...pts.map((p) => ({ p, r: 0.03 })));
        D.rails = { i: R.i, rho: RAIL };
        semer('arbre', 14, 0.42, 0.62, 0.04, 0.055, { ombre: 0.8 }); semer('maison', 5, 0.25, 0.6, 0.045, 0.055, { plat: true, ombre: 1.1, eco: 0.2 });
        if (eco) { for (const [k, type] of [[0, 'locomotive'], [1, 'wagon'], [2, 'wagon']]) { const b = 1.2 - k * 0.075, p = autour(R, RAIL, b), t = autour(R, RAIL, b + 0.01).sub(p).normalize(); poser(L.M, p, altitude(p) + 0.006, t, 0.06); MODELES[type](L, r, k === 2 ? '#FFC84A' : null); } }
        break;
      }
      case 'ile':
        repere('paillote', autour(R, 0.03, 2.2), 0.05, 0.05, 0.06);
        semer('palmier', 10, 0.02, 0.2, 0.055, 0.075, { ombre: 0.6, eco: 0.4 }); semer('palmier', 2 * ILOTS_ACTIFS.ile, 0.3, 0.66, 0.045, 0.06, { ombre: 0.6, eco: 0.3, sur: (p) => angle(p, R.c) > 0.33 }); // (l'île, puis ses îlots)
        semer('ponton', 1, 0.19, 0.22, 0.05, 0.05, { libre: true, plage: true, eco: 0, face: versCentre, fin: true }); semer('paillote', 2, 0.05, 0.17, 0.04, 0.045, { eco: 0, ombre: 0.9, fin: true });
        if (kit) semer('kit:coffre', 1, 0.12, 0.28, 0.022, 0.024, { plage: true, ombre: 0.8, fin: true }); // le coffre au trésor sur la plage (le kit : 232 triangles, de près seulement)
        break;
      case 'chateau':
        repere('chateau', R.c, 0.125, 0.13, 0.14);
        semer('arbre', 22, 0.24, 0.64, 0.04, 0.06, { ombre: 0.8 }); semer('sapin', 12, 0.3, 0.64, 0.045, 0.06, { eco: 0.25 }); semer('maison', 3, 0.26, 0.5, 0.045, 0.05, { plat: true, ombre: 1.1, eco: 0 });
        break;
      case 'cimes': {
        repere('chalet', R.c, 0.11, 0.1, 0.13, 'rouge');
        semer('sapin', 24, 0.14, 0.62, 0.04, 0.06, { neige: true, haut: 1.12, eco: 0.3 }); semer('chalet', 5, 0.18, 0.4, 0.04, 0.05, { neige: true, plat: true, ombre: 1.1, eco: 0.2 });
        semer('bonhomme', 3, 0.15, 0.4, 0.022, 0.026, { eco: 0, ombre: 0.7, fin: true });
        // le télésiège : de la station du plateau au plus haut sommet, ses pylônes et son câble (les sièges, animés, à part)
        const sommet = PICS.cimes.reduce((a, b) => (b.h > a.h ? b : a)), A = autour(R, 0.1, Math.atan2(sommet.d.dot(R.e2), sommet.d.dot(R.e1))), hA = altitude(A), hB = altitude(sommet.d);
        poser(L.M, A, hA - 0.003, R.e1, 0.05); MODELES.gare_station(L, true); ombres.push({ p: A.clone(), h: hA, f: R.e1.clone(), s: 0.06 });
        const PA = A.clone().multiplyScalar(hA + 0.05), PB = sommet.d.clone().multiplyScalar(hB + 0.02); D.cable = { A: PA, B: PB };
        L.M.identity(); L.poutre(PA, PB, 0.0025, '#4A4E5A');
        for (const t of [0.3, 0.55, 0.8]) { const q = PA.clone().lerp(PB, t), n = q.clone().normalize(), hs = altitude(n); L.poutre(n.clone().multiplyScalar(hs - 0.01), q, 0.006, '#7C8090'); }
        break;
      }
      case 'capitale': {
        repere('eiffel', R.c, 0.12, 0.1, 0.13);
        repere('arc', ETOILE, 0.055, 0.05, 0.07); repere('invalides', autour(R, 0.3, -0.95), 0.06, 0.07, 0.08);
        const plan = (u, v) => R.c.clone().addScaledVector(R.e2, Math.tan(u)).addScaledVector(R.e1, Math.tan(v)).normalize(); // (u, v) du plan tangent → la sphère
        const libre = (q, marge) => !places.some((x) => angle(q, x.p) < marge) && altitude(q, o) > MER + 0.012 && o.i1 === R.i; // ni sur une boutique, ni dans la Seine, ni hors du quartier
        const route = (pts, larg, col, marge) => { // une voie posée au sol (null : une coupure), interrompue là où passerait une boutique
          let run = []; const fin = () => { if (run.length > 1) L.ruban(run, run.map((q) => altitude(q)), larg, col); run = []; };
          for (const q of pts) { if (q && libre(q, marge)) { run.push(q); poses.push({ p: q, r: larg * 0.6 }); } else fin(); } fin();
        };
        // deux ponts sur la Seine (de pierre claire, une arche dessous)
        const PONTS = [-0.17, 0.24];
        for (const u of PONTS) { const p = plan(u, SEINE(u)); poser(L.M, p, 1.011, R.e1, 0.05); L.f(BOITE, 0, 0, 0, 0.45, 0.08, 2.2, '#F0E6D2'); L.f(BOITE, 0, 0.08, 0, 0.5, 0.06, 2.2, '#E2D5BC'); L.f(ARCHE, 0, -0.2, 0, 0.5, 0.42, 1.3, '#E2D5BC', Math.PI / 2); poses.push({ p, r: 0.05 }); }
        // les quais : des platanes en rang, puis le pavé (vus d'en haut, la Seine et ses berges dessinent la ville)
        for (const sens of [-1, 1]) {
          if (!eco) for (let u = -0.6 + (sens > 0 ? 0.035 : 0); u < 0.6; u += 0.075) { const q = plan(u, SEINE(u) + sens * 0.086); if (libre(q, 0.07) && !occupe(q, 0.015)) poserObjet('platane', q, altitude(q) - 0.003, capAleatoire(q, r() * TAU), 0.04 + 0.006 * r(), 0.018, 0.032); }
          const pts = []; for (let u = -0.64; u <= 0.641; u += 0.032) pts.push(PONTS.some((b) => Math.abs(u - b) < 0.035) ? null : plan(u, SEINE(u) + sens * 0.056));
          route(pts, 0.011, '#E2D7C3', 0.06);
        }
        // le Champ-de-Mars : la pelouse au pied de la tour et ses deux allées ; l'Étoile : huit avenues autour de l'arc
        route([0.075, 0.105, 0.135, 0.165].map((v) => plan(0, v)), 0.085, '#A9DB8C', 0.075);
        for (const u of [-0.024, 0.024]) route([0.075, 0.12, 0.165].map((v) => plan(u, v)), 0.008, '#F4E8C8', 0.07);
        const et = { c: ETOILE, e1: R.e1.clone().addScaledVector(ETOILE, -R.e1.dot(ETOILE)).normalize() }; et.e2 = new V3().crossVectors(ETOILE, et.e1);
        for (let k = 0; k < 8; k++) { const b = k * TAU / 8 + 0.2; route([0, 1, 2, 3, 4, 5].map((j) => autour(et, 0.042 + j * 0.024, b)), 0.014, '#D8D2E0', 0.06); }
        semer('platane', 8, 0.2, 0.6, 0.04, 0.05, { ombre: 0.8, eco: 0.3 }); semer('haussmann', 16, 0.26, 0.6, 0.055, 0.065, { plat: true, ombre: 1.1, face: versCentre, eco: 0.25 }); semer(kit ? 'kit:fontaine' : 'fontaine', 2, 0.16, 0.3, kit ? 0.06 : 0.035, kit ? 0.065 : 0.04, { eco: 0, plat: true });
        break;
      }
    }
  }
  Lot.prototype.ruban = function (pts, hs, larg, col) { // une bande à plat sur le sol, le long de points (un chemin) : deux triangles par tronçon, sans jour aux coudes
    const k = couleur(col), P = this.p, C = this.c, g = [], d = [], a = new V3(), n = new V3(), t = new V3();
    for (let i = 0; i < pts.length; i++) {
      t.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]); n.crossVectors(t, pts[i]).normalize().multiplyScalar(larg / 2); // (la tangente moyenne : les deux tronçons voisins partagent leurs coins)
      a.copy(pts[i]).multiplyScalar(hs[i] + 0.0025); g.push(a.clone().add(n)); d.push(a.clone().sub(n));
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const c = [d[i], g[i], g[i + 1], d[i + 1]];
      for (const j of [0, 1, 2, 0, 2, 3]) { P.push(c[j].x, c[j].y, c[j].z); C.push(k[0], k[1], k[2]); if (this.t) this.t.push(0); } // (tournés vers le ciel)
    }
  };
  Lot.prototype.dalle = function (A, hA, B, hB, larg, ep, col, decal) { // une bande posée sur le sol de A à B (un rail, son ballast) ; decal : décalée de côté
    const a = _t.copy(A).multiplyScalar(hA), b = _v2.copy(B).multiplyScalar(hB), dz = _v.subVectors(b, a), len = dz.length(); dz.normalize();
    _ay.copy(A).add(B).normalize(); _ax.crossVectors(_ay, dz).normalize(); _az.crossVectors(_ax, _ay);
    _m.makeBasis(_ax, _ay, _az); _m.scale(_s.set(larg, ep, len)); const cx = (a.x + b.x) / 2 + _ax.x * (decal || 0), cy = (a.y + b.y) / 2 + _ax.y * (decal || 0), cz = (a.z + b.z) / 2 + _ax.z * (decal || 0); _m.setPosition(cx, cy, cz);
    this.brut(BOITE, _m, couleur(col), 0);
  };

  // ─── les matériaux : mats, à facettes (les normales viennent des dérivées : le kit n'en a pas), un liseré clair au bord de la planète ───
  function materiaux() {
    const T = E.uniformes = { uLisere: { value: new THREE.Color('#FFF1E4').multiplyScalar(E.eco ? 0.18 : 0.3) }, uT: { value: 0 }, uLueur: { value: 0 }, uLueurCol: { value: new THREE.Color('#FFC66E') }, uNuage: { value: 1 } };
    const lisere = (sh) => { sh.uniforms.uLisere = T.uLisere; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLisere;').replace('#include <opaque_fragment>', 'outgoingLight += uLisere * pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 );\n#include <opaque_fragment>'); };
    // la lueur des vitres : la marque des sommets (rouge + 10) retirée, puis, le soir, la vitre prend la couleur d'une lampe
    const DECODE = 'float luM = floor( vColor.r * 0.1 ); vColor.r -= 10.0 * luM; vLueur = luM > 1.5 ? 0.55 : luM;';
    const lueur = (sh) => {
      sh.uniforms.uLueur = T.uLueur; sh.uniforms.uLueurCol = T.uLueurCol;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLueur;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLueur;\nuniform vec3 uLueurCol;\nvarying float vLueur;').replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, uLueurCol, vLueur * uLueur );\n#include <opaque_fragment>');
    };
    const sol = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    sol.onBeforeCompile = (sh) => { lisere(sh); lueur(sh); sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n' + DECODE); };
    sol.customProgramCacheKey = () => 'planete-sol';
    const bout = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    bout.onBeforeCompile = (sh) => {
      lisere(sh); lueur(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float teinte;\nattribute vec3 cMur;\nattribute vec3 cToit;\nattribute vec3 cAccent;\nattribute float cEclat;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n' + DECODE + '\nvColor.xyz *= teinte < 0.5 ? vec3( 1.0 ) : teinte < 1.5 ? cMur : teinte < 2.5 ? cToit : cAccent;\nvColor.xyz = mix( vColor.xyz, vec3( 1.0, 0.97, 0.9 ), cEclat * 0.22 );');
    };
    bout.customProgramCacheKey = () => 'planete-boutique';
    const eau = new THREE.MeshLambertMaterial({ color: '#62CFE6', flatShading: true, transparent: !E.eco, opacity: 0.86 });
    if (!E.eco) {
      eau.onBeforeCompile = (sh) => {
        lisere(sh); sh.uniforms.uT = T.uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= 1.0 + 0.0013 * ( sin( uT * 1.6 + position.x * 31.0 + position.z * 17.0 ) + sin( uT * 1.1 + position.y * 27.0 - position.x * 9.0 ) );');
      };
      eau.customProgramCacheKey = () => 'planete-eau';
    } else eau.onBeforeCompile = lisere;
    // les nuages : opaques (des bouffées transparentes qui se chevauchent laissent voir leurs ronds) ; quand on zoome, chacun se résorbe en son centre
    const nuage = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    nuage.onBeforeCompile = (sh) => { sh.uniforms.uNuage = T.uNuage; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uNuage;\nattribute vec3 centre;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = centre + ( transformed - centre ) * uNuage;'); };
    nuage.customProgramCacheKey = () => 'planete-nuage';
    return { sol, bout, eau, nuage };
  }
  // une petite texture en dégradé radial (les ombres au sol, le halo)
  function degrade(stops, taille) {
    const cv = document.createElement('canvas'); cv.width = cv.height = taille || 64; const x = cv.getContext('2d'), g = x.createRadialGradient(cv.width / 2, cv.height / 2, 0, cv.width / 2, cv.height / 2, cv.width / 2);
    for (const [o, c] of stops) g.addColorStop(o, c); x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ─── le sol et le décor calculés, gardés d'une ouverture à l'autre (MEMO) : les tableaux de chaque région, leurs ombres, les pièces animées.
  //     La clé dit tout ce dont ils dépendent ; 90 s après la dernière fermeture, ils partent (le ramasse-miettes les reprend) ───
  let MEMO = null, memoMinuteur = 0;
  const MEMO_MS = 90000;
  const oublier = () => { MEMO = null; memoMinuteur = 0; };

  // ─── tout bâtir (à l'ouverture, ou quand le kit arrive, ou quand la chaîne change de boutiques) ───
  function placer() { // chaque fiche prend sa place, dans l'ordre des numéros de son quartier (ses places sont étendues s'il le faut)
    E.places = {}; E.placesQ = []; E.parQ = REG.map(() => 0);
    const parQ = REG.map(() => []); for (const f of E.fiches) parQ[f.q].push(f);
    for (const R of REG) { const pl = placesDe(R, parQ[R.i].length); E.placesQ[R.i] = pl; parQ[R.i].sort((a, b) => a.n - b.n).forEach((f, k) => { if (pl[k]) { E.places[f.n] = pl[k]; E.parQ[R.i] = k + 1; } }); }
  }
  function batir() {
    defaire();
    const eco = E.eco, M = E.mats, monde = E.monde; E.journal = [];
    E.gagne = REG.map((R) => !R.gagneA || R.gagneA <= E.N);
    E.kit = !eco && E.kitOk ? lireKit() : null;
    const t0 = performance.now(); placer(); const t1 = performance.now();
    const cle = [E.qualite, E.kit ? 1 : 0, E.gagne.map(Number).join(''), E.parQ.join(','), ILOTS_ACTIFS.ile, ILOTS_ACTIFS.mer].join('|');
    let D = MEMO && MEMO.cle === cle ? MEMO : null; E.memo = !!D;
    if (!D) { // le sol, puis le décor de chaque région (graine fixe : le même à chaque fois)
      D = { cle, regions: [], ombres: [], animer: {}, rails: null, cable: null };
      const lots = REG.map(() => new Lot(false)), fins = REG.map(() => new Lot(false)); sol(lots, eco ? 11 : E.qualite === 'moyenne' ? 16 : 18); const t2 = performance.now();
      for (const R of REG) { lots[R.i].M.identity(); decorDe(R, lots[R.i], tirage(1000 + R.i * 77), D, fins[R.i]); }
      D.fins = fins.map((L) => (L.n ? L.tableaux() : null));
      // la portée de chaque région : jusqu'où, de son centre, un de ses sommets peut encore dépasser l'horizon (son écart au centre, plus ce
      // que sa hauteur lui fait voir au-delà) ; la région est cachée quand son centre passe plus loin que l'horizon de la caméra plus cette portée
      D.regions = lots.map((L, i) => { const a = L.tableaux(), c = REG[i].c; let portee = 0;
        for (let k = 0; k < a.p.length; k += 3) { const x = a.p[k], y = a.p[k + 1], z = a.p[k + 2], l = Math.hypot(x, y, z), v = Math.acos(borne((x * c.x + y * c.y + z * c.z) / l, -1, 1)) + Math.acos(Math.min(1, 1 / Math.max(1, l))); if (v > portee) portee = v; }
        a.portee = portee; return a; });
      D.temps = { places: +(t1 - t0).toFixed(1), sol: +(t2 - t1).toFixed(1), decor: +(performance.now() - t2).toFixed(1) };
      MEMO = D;
    }
    E.temps = Object.assign({ memo: E.memo }, D.temps); E.ombres = D.ombres; E.animer = D.animer; E.rails = D.rails; E.cable = D.cable;
    E.regions = D.regions.map((a, i) => { const m = new THREE.Mesh(geoDe(a), M.sol); m.userData.region = i; m.userData.portee = a.portee; monde.add(m); return m; });
    E.fins = D.fins.map((a, i) => { if (!a) return null; const m = new THREE.Mesh(geoDe(a), M.sol); m.userData.region = i; m.visible = false; monde.add(m); return m; }); // (les petits objets : de près seulement)
    // l'eau
    E.eau = new THREE.Mesh(new THREE.IcosahedronGeometry(MER, eco ? 5 : 6), M.eau); monde.add(E.eau);
    magasins();
    // les ombres au sol : des taches douces sous les boutiques, les maisons, les arbres
    const tache = degrade([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]); E.textures.push(tache);
    const mo = new THREE.MeshBasicMaterial({ map: tache, color: '#4E3D63', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const os = E.ombres.concat(E.magasins.map((x) => ({ p: x.p, h: x.h, f: x.pl.f, s: x.k * 1.6 })));
    E.taches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mo, Math.max(1, os.length)); E.taches.count = os.length;
    os.forEach((x, k) => { poser(_m, x.p, x.h + 0.0012, x.f, x.s); E.taches.setMatrixAt(k, _m); }); E.taches.renderOrder = 1; monde.add(E.taches);
    // les pièces animées (en haute et moyenne) : les ailes du moulin, le petit train, les sièges du télésiège
    if (!eco) animes(tirage(20261023));
    // les nuages (pas en éco) : quelques gros nuages qui tournent autour de la planète
    if (!eco) {
      const L = new Lot(false), rn = tirage(7), centres = [];
      for (let k = 0; k < 5; k++) {
        const p = new V3().setFromSphericalCoords(1, Math.acos(lerp(-0.8, 0.8, (k + rn()) / 5)), k * 2.4 + rn()), d = L.p.length; poser(L.M, p, 1.3 + rn() * 0.07, capAleatoire(p, rn() * TAU), 0.1 + rn() * 0.04); MODELES.nuage(L, rn);
        const n = (L.p.length - d) / 3, c = new V3(); for (let i = d; i < L.p.length; i += 3) c.x += L.p[i] / n, c.y += L.p[i + 1] / n, c.z += L.p[i + 2] / n; for (let i = 0; i < n; i++) centres.push(c.x, c.y, c.z);
      }
      const g = L.geo(); g.setAttribute('centre', new THREE.Float32BufferAttribute(centres, 3)); // (chaque sommet connaît le centre de son nuage : de près, le nuage s'y résorbe)
      E.nuages = new THREE.Mesh(g, M.nuage); E.nuages.renderOrder = 3; monde.add(E.nuages);
    }
    // le halo : une couronne de lumière douce autour de la planète
    const th = degrade([[0, 'rgba(255,255,255,0)'], [0.68, 'rgba(255,255,255,0)'], [0.74, 'rgba(255,250,244,.85)'], [0.8, 'rgba(250,240,255,.4)'], [1, 'rgba(240,235,255,0)']], 256); E.textures.push(th);
    // (un plan tourné vers la caméra à chaque image, pas un THREE.Sprite : la géométrie partagée des sprites garderait en vie le contexte de chaque ouverture)
    E.halo = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 2.86), new THREE.MeshBasicMaterial({ map: th, transparent: true, depthWrite: false })); E.halo.renderOrder = -1; E.scene.add(E.halo);
    eclairer(); // (la lumière et le halo à l'heure)
  }

  // ─── les boutiques : une instance chacune. Par standing, deux maillages : la forme riche (les plus grandes à l'écran, dans un budget de
  //     triangles) et la forme simple ; au loin, une forme minuscule commune. Seules les boutiques de ce côté de l'horizon sont dessinées, et
  //     les listes d'instances ne sont refaites que quand ce qu'on voit change (LOD) ; les gérants et les enseignes d'or suivent leur boutique.
  //     Aux teintes de leur quartier (façade, toit, store) ; une Boutique d'or prend l'or au store et aux drapeaux ───
  // les seuils (la taille d'une unité de la boutique à l'écran, en px) et les budgets de triangles de chaque forme : quelle que soit la chaîne
  // (cent, trois cents boutiques), les boutiques ne dépassent jamais leur part du budget ; au-delà, les plus petites à l'écran (au bord de la
  // planète) ne sont pas dessinées. Le gérant se montre de près, l'enseigne dorée dès qu'on la distingue.
  const LOD = {
    haute: { riche: 54, simple: 16, gerant: 22, or: 10, budget: { riche: 4000, simple: 3500, micro: 2200, gerants: 900, ors: 900 } },
    moyenne: { riche: 60, simple: 16, gerant: 24, or: 10, budget: { riche: 3000, simple: 3000, micro: 1800, gerants: 600, ors: 600 } },
    eco: { riche: 1e9, simple: 16, gerant: 30, or: 12, budget: { riche: 0, simple: 2400, micro: 1000, gerants: 300, ors: 300 } },
  };
  const accentDe = (f) => { if (f.or) return '#FFC84A'; const d = VI && VI.decor ? VI.decor(QS[f.q], f.s) : null; return d && d.accent ? d.accent : REG[f.q].accent; };
  function teintes(x) { // les couleurs d'une instance (façade, toit, store) : son quartier, son standing, l'or
    const f = x.f, R = REG[f.q], d = VI && VI.decor ? VI.decor(QS[f.q], f.s) : null;
    let mur = couleur(d && d.mur ? d.mur : R.mur), toit = couleur(R.toit), acc = couleur(f.or ? OR : d && d.accent ? d.accent : R.accent);
    if (!E.gagne[f.q]) { mur = melange(mur, BRUME, 0.5); toit = melange(toit, BRUME, 0.5); acc = melange(acc, BRUME, 0.5); }
    x.mur = mur; x.toit = toit; x.acc = acc;
  }
  function instances(geo, mat, n, teinte) { // un maillage d'instances, sa propre géométrie (qui partage les sommets) et ses attributs d'instance
    const g = new THREE.BufferGeometry(); for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.getAttribute(k));
    const A = {}; if (teinte) for (const [k, t] of [['cMur', 3], ['cToit', 3], ['cAccent', 3], ['cEclat', 1]]) { A[k] = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * t), t); A[k].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, A[k]); }
    if (!geo.boundingSphere) geo.computeBoundingSphere(); g.boundingSphere = geo.boundingSphere.clone();
    const im = new THREE.InstancedMesh(g, mat, Math.max(1, n)); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.userData.A = A;
    E.monde.add(im); E.maillesB.push(im); return im;
  }
  function magasins() {
    for (const im of E.maillesB || []) { E.monde.remove(im); im.geometry.dispose(); im.dispose(); } E.maillesB = [];
    E.magasins = []; E.parN = {}; E.cleLod = '';
    const par = [[], [], [], [], [], []];
    for (const f of E.fiches) { const pl = E.places[f.n]; if (!pl) continue; const k = ECHELLE_BOUTIQUE[f.s] * ECHELLE_NIV[pl.niv]; const x = { n: f.n, f, s: f.s, pl, p: pl.p, h: pl.h, k, lod: 1, taille: 0 }; par[f.s].push(x); E.magasins.push(x); E.parN[f.n] = x; }
    const geos = E.geos;
    E.groupes = par.map((liste, s) => {
      if (!liste.length) return null;
      const P = geos.P[s] || (geos.P[s] = geoBoutique(s, E.eco)), L = E.eco ? P : (geos.L[s] || (geos.L[s] = geoBoutique(s, true)));
      return { s, P: E.eco ? null : instances(P, E.mats.bout, liste.length, true), L: instances(L, E.mats.bout, liste.length, true), triP: P.attributes.position.count / 3, triL: L.attributes.position.count / 3 };
    });
    const n = E.magasins.length;
    E.micro = instances(geos.micro || (geos.micro = geoMicro()), E.mats.bout, n, true);
    E.gerants = instances(geos.gerant || (geos.gerant = geoGerant()), E.mats.sol, n, false);
    E.ors = instances(geos.or || (geos.or = geoOr()), E.mats.sol, n, false);
    E.triMicro = geos.micro.attributes.position.count / 3; E.triGerant = geos.gerant.attributes.position.count / 3; E.triOr = geos.or.attributes.position.count / 3;
    for (const x of E.magasins) { // les matrices : la boutique, sa forme minuscule (à ses dimensions), son gérant devant la vitrine, son enseigne sur le toit
      const s = x.s; x.mat = poser(new THREE.Matrix4(), x.p, x.h - 0.002, x.pl.f, x.k);
      x.matMicro = x.mat.clone().multiply(_m.makeScale(DIM.larg[s], (0.08 + DIM.haut[s]) / 1, DIM.prof[s]));
      x.matGerant = x.mat.clone().multiply(_m.makeTranslation(-DIM.larg[s] * 0.3, 0, DIM.prof[s] / 2 + 0.28));
      x.matOr = x.mat.clone().multiply(_m.makeTranslation(0, 0.08 + DIM.haut[s] + 0.02, DIM.prof[s] / 2 - 0.08)).multiply(_m2.makeScale(DIM.larg[s] * 0.6, DIM.larg[s] * 0.6, DIM.larg[s] * 0.6));
      x.haut = hauteurDe(s, x.f.or) * x.k; x.avant = (DIM.prof[s] / 2 + 0.62) * x.k; // (le pied de l'étiquette : devant le gérant, la devanture reste visible)
      teintes(x);
    }
  }
  const _cl = new V3();
  function trierBoutiques() { // le LOD de chaque boutique tournée vers nous ; les listes d'instances refaites seulement si elles changent
    const cl = E.camLocal, fpx = E.fpx, Ld = LOD[E.qualite], Bu = Ld.budget, vis = [];
    for (const x of E.magasins) {
      const d = x.p.x * cl.x + x.p.y * cl.y + x.p.z * cl.z; if (d <= x.h * 0.86) { x.vu = false; x.lod = 3; continue; } // (de ce côté de l'horizon, avec de la marge pour les toits)
      x.vu = true; _cl.copy(x.p).multiplyScalar(x.h).sub(cl); x.taille = x.k * fpx / Math.max(1e-3, _cl.length()); vis.push(x);
    }
    vis.sort((a, b) => b.taille - a.taille);
    const pris = { riche: 0, simple: 0, micro: 0, gerants: 0, ors: 0 }, triM = E.triMicro, triG = E.triGerant, triO = E.triOr; let cle = E.choisi + '|';
    for (const x of vis) {
      const G = E.groupes[x.s]; let lod = 3; // (un peu d'hystérésis : une boutique au seuil ne clignote pas d'une forme à l'autre)
      if (G.P && x.taille >= Ld.riche * (x.lod === 0 ? 0.85 : 1) && pris.riche + G.triP <= Bu.riche) { lod = 0; pris.riche += G.triP; }
      else if (x.taille >= Ld.simple * (x.lod <= 1 ? 0.85 : 1) && pris.simple + G.triL <= Bu.simple) { lod = 1; pris.simple += G.triL; }
      else if (pris.micro + triM <= Bu.micro) { lod = 2; pris.micro += triM; }
      x.lod = lod; x.ger = lod < 2 && !!x.f.gerant && x.taille >= Ld.gerant && pris.gerants + triG <= Bu.gerants; if (x.ger) pris.gerants += triG;
      x.dore = lod < 2 && x.f.or && x.taille >= Ld.or && pris.ors + triO <= Bu.ors; if (x.dore) pris.ors += triO;
      cle += x.n + 'rsmx'[lod] + (x.ger ? 'g' : '') + (x.dore ? 'o' : '');
    }
    if (cle === E.cleLod) return; E.cleLod = cle;
    const L = E.groupes.map((G) => (G ? { P: [], L: [] } : null)), micro = [], ger = [], ors = [];
    for (const x of vis) { if (x.lod === 2) micro.push(x); else if (x.lod < 2) L[x.s][x.lod === 0 ? 'P' : 'L'].push(x); if (x.ger) ger.push(x); if (x.dore) ors.push(x); }
    const remplir = (im, liste, mat) => {
      const A = im.userData.A;
      liste.forEach((x, k) => { im.setMatrixAt(k, x[mat]); if (A.cMur) { A.cMur.array.set(x.mur, k * 3); A.cToit.array.set(x.toit, k * 3); A.cAccent.array.set(x.acc, k * 3); A.cEclat.array[k] = x.n === E.choisi ? 1 : 0; } });
      im.count = liste.length; im.instanceMatrix.needsUpdate = true; for (const a of Object.values(A)) a.needsUpdate = true;
    };
    E.groupes.forEach((G, s) => { if (!G) return; if (G.P) remplir(G.P, L[s].P, 'mat'); remplir(G.L, L[s].L, 'mat'); });
    remplir(E.micro, micro, 'matMicro'); remplir(E.gerants, ger, 'matGerant'); remplir(E.ors, ors, 'matOr');
    E.lod = { riche: vis.filter((x) => x.lod === 0).length, simple: vis.filter((x) => x.lod === 1).length, micro: micro.length, caches: vis.filter((x) => x.lod === 3).length, gerants: ger.length, ors: ors.length, triangles: pris };
  }
  function animes(r) {
    const A = E.anime = [];
    const mo = E.animer.moulin;
    if (mo) { // les ailes du moulin, autour de leur moyeu
      const L = new Lot(false); MODELES.ailes(L, 0); const g = L.geo(), m = new THREE.Mesh(g, E.mats.sol); m.matrixAutoUpdate = false; E.monde.add(m);
      const base = poser(new THREE.Matrix4(), mo.p, mo.h - 0.003, mo.f, mo.s); A.push((t) => { m.matrix.copy(base).multiply(_m.makeTranslation(0, 0.9, 0.46)).multiply(_m2.makeRotationZ(-t * 0.9)).multiply(_m.makeTranslation(0, -0.9, -0.46)); });
    }
    if (E.rails) { // le petit train fait le tour de la gare (fait main : 140 triangles ; celui d'un kit en coûtait 1 800 pour quelques pixels)
      const R = REG[E.rails.i], rho = E.rails.rho, wagons = [];
      for (const [type, c] of [['locomotive', null], ['wagon', '#5FAE8B'], ['wagon', '#FFC84A']]) {
        const L = new Lot(false); MODELES[type](L, r, c);
        const m = new THREE.Mesh(L.geo(), E.mats.sol); m.matrixAutoUpdate = false; E.monde.add(m); wagons.push(m);
      }
      const p = new V3(), q = new V3();
      A.push((t) => { let b = t * 0.16; wagons.forEach((m, k) => { b -= k ? 0.075 : 0; autour(R, rho, b, p); autour(R, rho, b + 0.01, q).sub(p).normalize(); poser(m.matrix, p, altitude(p) + 0.0055, q, 0.06); }); });
    }
    if (E.cable) { // les sièges du télésiège montent le long du câble
      const { A: PA, B: PB } = E.cable, L = new Lot(false); L.f(BOITE, 0, -0.5, 0, 0.06, 0.5, 0.06, '#4A4E5A'); L.f(BOITE, 0, -0.75, 0.06, 0.55, 0.08, 0.32, '#E63946'); L.f(BOITE, 0, -0.72, -0.08, 0.55, 0.3, 0.06, '#E63946');
      const n = 6, im = new THREE.InstancedMesh(L.geo(), E.mats.sol, n); E.monde.add(im); const p = new V3(), up = new V3();
      A.push((t) => { for (let k = 0; k < n; k++) { const u = ((t * 0.05 + k / n) % 1); p.lerpVectors(PA, PB, u); up.copy(p).normalize(); _q.setFromUnitVectors(HAUT, up); _m.compose(p, _q, _s.set(0.02, 0.02, 0.02)); im.setMatrixAt(k, _m); } im.instanceMatrix.needsUpdate = true; });
      im.frustumCulled = false;
    }
  }
  function defaire() { // libère tout ce que batir a fait (les géométries des boutiques, partagées, restent jusqu'à la fermeture)
    if (!E || !E.monde) return;
    const partages = new Set(Object.values(E.mats));
    for (const o of [...E.monde.children]) { E.monde.remove(o); if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); if (o.material && !partages.has(o.material)) o.material.dispose(); }
    E.maillesB = []; E.groupes = []; E.magasins = []; E.parN = {};
    if (E.halo) { E.scene.remove(E.halo); E.halo.geometry.dispose(); E.halo.material.dispose(); E.halo = null; }
    for (const t of E.textures) t.dispose(); E.textures = []; E.anime = []; E.nuages = null; E.regions = []; E.fins = [];
  }

  // ─── la caméra : elle vise le sol au centre de l'écran ; de loin (zoom 0) toute la planète, de près (zoom 1) elle se penche vers l'horizon
  //     comme un regard de promeneur. La planète tourne (son quaternion E.q), la caméra et les lumières restent : le soleil vient toujours d'en haut à gauche ───
  // (de loin, un téléobjectif : la planète presque sans déformation ; de près, l'angle s'ouvre, comme un regard de promeneur)
  const fovDe = (z) => lerp(CAM.fov, CAM.fovPres, lisse(0.2, 1, z));
  const distance = (z) => E.loin * Math.pow(CAM.pres / E.loin, borne(z, -0.35, 1.2));
  const inclinaison = (z) => CAM.inclin * lisse(0.12, 0.9, z);
  const _qi = new THREE.Quaternion(), _va = new V3();
  // une caméra au zoom z, sa cible (le sol au rayon rs, devant la planète) à la hauteur cadre de l'écran (fraction depuis le haut)
  function cameraPour(cam, z, cadre, rs, incl) {
    const d = distance(z), t = inclinaison(z) + (incl || 0), fov = fovDe(z);
    cam.fov = fov; cam.aspect = E.camera.aspect;
    cam.position.set(0, -Math.sin(t) * d, rs + Math.cos(t) * d); cam.up.set(0, 1, 0); cam.lookAt(0, 0, rs);
    cam.rotateX(-Math.atan((1 - 2 * cadre) * Math.tan(fov * DEG / 2)));
    cam.near = Math.max(0.004, d * 0.06); cam.far = d + 4; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return d;
  }
  function placerCamera() {
    const cam = E.camera, d = cameraPour(cam, E.z, E.cadre, E.rs, E.incl);
    E.fpx = (E.H / 2) / Math.tan(cam.fov * DEG / 2);
    E.camLocal.copy(cam.position).applyQuaternion(_qi.copy(E.q).invert()); // (la caméra dans le repère de la planète : l'horizon, le LOD)
    // la lumière d'appoint vient de la caméra, un peu sur la gauche, vers ce qu'elle regarde : faible de loin (la planète garde son volume),
    // plus forte de près (les devantures, tournées vers nous, ne restent pas dans l'ombre du soleil qui vient d'en haut)
    E.appoint.position.copy(cam.position).add(_va.set(-0.6 * d, 0.25 * d, 0)); E.appoint.target.position.set(0, 0, E.rs); E.appoint.target.updateMatrixWorld();
    E.appoint.intensity = E.appointMax * lerp(0.12, 1, lisse(0.2, 0.75, E.z));
  }
  // l'orientation qui amène le point p devant la caméra, la tangente « nord » vers le haut de l'écran
  function orientationVers(p, nord, out) {
    const zt = _az.copy(p).normalize(), yt = _ay.copy(nord).addScaledVector(zt, -nord.dot(zt)); if (yt.lengthSq() < 1e-8) yt.set(0, 1, 0).addScaledVector(zt, -zt.y); yt.normalize(); const xt = _ax.crossVectors(yt, zt);
    _m.makeBasis(xt, yt, zt); return (out || new THREE.Quaternion()).setFromRotationMatrix(_m).invert();
  }
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), AXE_X = new V3(1, 0, 0), AXE_Z = new V3(0, 0, 1);
  function tourner(ax, ay) { _qa.setFromAxisAngle(HAUT, ax); _qb.setFromAxisAngle(AXE_X, ay); E.q.premultiply(_qb).premultiply(_qa).normalize(); }
  // le point du sol au centre de l'écran (en coordonnées de la planète)
  const _devant = new V3();
  const devant = () => _devant.copy(AVANT).applyQuaternion(_qi.copy(E.q).invert());

  function controle(dt) {
    const T = E.tween;
    if (T) {
      T.t += dt; const k = T.mou ? 1 - Math.pow(1 - Math.min(1, T.t / T.duree), 3) : T.entre ? Math.pow(Math.min(1, T.t / T.duree), 2.2) : doux(Math.min(1, T.t / T.duree));
      E.q.slerpQuaternions(T.q0, T.q1, k); E.z = lerp(T.z0, T.z1, k); E.cadre = lerp(T.c0, T.c1, k); if (T.i1 != null) E.incl = lerp(T.i0, T.i1, k);
      if (T.t >= T.duree) { E.tween = null; if (T.fin) T.fin(); }
    } else if (!E.doigts.size && !E.entree) {
      if (Math.abs(E.vx) + Math.abs(E.vy) > 0.002) { tourner(E.vx * dt, E.vy * dt); const k = Math.exp(-dt * 3.4); E.vx *= k; E.vy *= k; } else { E.vx = 0; E.vy = 0; }
      // le retour doux : le zoom revient dans ses bornes, la planète se redresse (son nord en haut), et, au repos, tourne lentement
      const zr = borne(E.z, 0, 1); if (zr !== E.z) E.z += (zr - E.z) * (1 - Math.exp(-dt * 9));
      if (E.z < 0.4 && !E.choisi) {
        const n = _v.set(0, 1, 0).applyQuaternion(E.q), l = Math.hypot(n.x, n.y);
        if (l > 0.3) { const a = Math.atan2(n.x, n.y); if (Math.abs(a) > 0.002) { _qa.setFromAxisAngle(AXE_Z, a * (1 - Math.exp(-dt * 1.6))); E.q.premultiply(_qa).normalize(); } }
        if (performance.now() - E.geste > 7000 && !E.essai && !E.reduit) tourner(0.03 * dt, 0);
      }
      if (!E.choisi) E.cadre += (E.cadreBase - E.cadre) * (1 - Math.exp(-dt * 6));
      if (E.incl && !E.etiquetteVue) { E.incl *= Math.exp(-dt * 3); if (E.incl < 1e-3) E.incl = 0; } // (on a quitté la boutique choisie du doigt : la caméra se redresse)
    }
    // le rayon visé suit le sol sous le centre de l'écran (de près, la caméra garde sa hauteur au-dessus des collines)
    const rs = altitude(devant()); E.rs += (Math.max(MER, rs) - E.rs) * (1 - Math.exp(-dt * 7));
  }

  // ─── les gestes : un doigt tourne la planète (le sol suit le doigt), deux doigts pincent (zoom) ; un toucher bref choisit une boutique ───
  function vitesse() { return distance(E.z) / (E.fpx || E.f) / Math.max(0.9, E.rs); } // radians par pixel : le sol sous le doigt le suit
  function doigtBas(e) {
    if (!E || E.entree) return; e.preventDefault(); try { E.cv.setPointerCapture(e.pointerId); } catch (x) { /* rien */ }
    E.doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    E.vx = 0; E.vy = 0; E.geste = performance.now(); E.echant = []; E.pince = 0; E.tap = E.doigts.size === 1;
    if (E.tween && !E.tween.fige) E.tween = null;
    if (!E.touche) { E.touche = true; majLegende(true); } // (le premier geste : la légende quitte l'indice et nomme la région)
  }
  function doigtBouge(e) {
    if (!E) return; const d = E.doigts.get(e.pointerId); if (!d) return; e.preventDefault();
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; E.geste = performance.now();
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > 8) { E.tap = false; if (E.choisi && E.etiquetteVue) cacherEtiquette(); }
    if (E.doigts.size === 1) {
      const k = vitesse(), ax = dx * k, ay = dy * k / Math.max(0.4, Math.cos(inclinaison(E.z) + E.incl));
      tourner(ax, ay); const t = e.timeStamp || performance.now(); E.echant.push({ t, ax, ay }); while (E.echant.length > 2 && t - E.echant[1].t > 160) E.echant.shift(); // (l'heure de l'événement, pas celle de son traitement : un téléphone occupé les livre en paquets)
    } else if (E.doigts.size === 2) {
      const [a, b] = [...E.doigts.values()], l = Math.hypot(a.x - b.x, a.y - b.y);
      if (E.pince) { let dz = Math.log(l / E.pince) * 0.7; if (E.z > 1 || E.z < 0) dz *= 0.35; E.z = borne(E.z + dz, -0.3, 1.12); }
      E.pince = l; const k = vitesse() * 0.5; tourner(dx * k, dy * k);
    }
  }
  function doigtHaut(e) {
    if (!E) return; const d = E.doigts.get(e.pointerId); if (!d) return; E.doigts.delete(e.pointerId); E.pince = 0;
    if (!E.doigts.size) {
      const t = e.timeStamp || performance.now(), der = E.echant[E.echant.length - 1];
      if (E.tap && performance.now() - d.t0 < 450) toucher(e.clientX, e.clientY);
      else if (E.echant.length > 1 && t - der.t < 160) { // l'élan du lâcher : le chemin des derniers mouvements sur leur durée (≤ 160 ms)
        const dt = Math.max(0.016, (der.t - E.echant[0].t) / 1000); let ax = 0, ay = 0; for (let k = 1; k < E.echant.length; k++) { ax += E.echant[k].ax; ay += E.echant[k].ay; }
        E.vx = borne(ax / dt, -6, 6); E.vy = borne(ay / dt, -6, 6);
      }
      E.echant = [];
    }
  }
  function molette(e) { if (!E || E.entree) return; e.preventDefault(); E.z = borne(E.z - e.deltaY * 0.0014, -0.1, 1.05); E.geste = performance.now(); if (E.tween && !E.tween.fige) E.tween = null; }

  // ─── choisir une boutique : la planète tourne pour l'amener devant, façade vers nous, la caméra s'approche, puis l'étiquette ───
  function plusProche(x, y) {
    const r = E.cv.getBoundingClientRect(); x -= r.left; y -= r.top; let best = 0, bd = 34;
    for (const dr of E.drapeaux) {
      if (!dr.vu || dr.a < 0.35) continue;
      const dx = Math.max(0, Math.abs(x - (dr.x + (dr.gauche ? -dr.w / 2 : dr.w / 2))) - dr.w / 2 - 4), dy = Math.max(0, Math.abs(y - (dr.y - 22)) - 12), d1 = Math.hypot(dx, dy), d2 = Math.hypot(x - dr.bx, y - dr.by) - 8; // le fanion ou la boutique
      const d = Math.min(d1, d2); if (d < bd) { bd = d; best = dr.n; }
    }
    return best;
  }
  function toucher(x, y) {
    const n = plusProche(x, y); if (n) { choisir(n, true); return; }
    if (!E.choisi) return;
    // la boutique choisie elle-même (son fanion s'est effacé sous son étiquette) : la toucher de nouveau ne la lâche pas ; ailleurs, oui
    const d = E.etiquetteVue && E.drapeaux.find((v) => v.n === E.choisi), r = E.cv.getBoundingClientRect();
    if (d && Math.hypot(x - r.left - d.bx, y - r.top - d.by + 24) < 44) return;
    relacher();
  }
  // le cadrage d'une boutique choisie : à quelle hauteur de l'écran la poser et de combien s'approcher, pour qu'elle tienne entre le titre
  // (opts.haut) et son étiquette, dessous, sans être démesurée. La planète de l'écran « Ma chaîne » (340 à 490 px de haut)
  // s'approche donc moins qu'une planète en plein écran, et un palais moins qu'une boutique de quartier. Mesuré avec une caméra d'essai, la
  // boutique déjà devant (là où le tour l'amène : sa façade vers nous, sa place au centre, son sol au rayon visé)
  const _camC = new THREE.PerspectiveCamera(), _pc2 = new V3();
  function cadrage(x, hEt) {
    const H = E.H, titre = E.haut + 8, yPiedMax = H - 18 - hEt, hMax = borne(H * 0.3, 70, 170), a = Math.atan(x.avant);
    const incl = (z) => Math.max(0, CAM.inclChoix - inclinaison(z)); // (de moins près, la caméra se penche quand même : on voit sa façade, pas son toit)
    const yDe = (z, cadre, y, r) => { cameraPour(_camC, z, cadre, x.h, incl(z)); _pc2.set(0, y, r).project(_camC); return (1 - _pc2.y) * H / 2; };
    const tient = (z, cadre) => { const yt = yDe(z, cadre, 0, x.h + x.haut + 0.002); return yt >= titre && cadre * H - yt <= hMax; }; // (son toit sous le titre ; son fanion s'efface quand l'étiquette paraît)
    let cadre = Math.min(0.5, (yPiedMax - 14) / H), z = CAM.choix;
    for (let passe = 0; passe < 2; passe++) {
      for (z = CAM.choix; z > CAM.choixMin && !tient(z, cadre); z -= 0.02);
      z = Math.max(z, CAM.choixMin);
      const ecart = yDe(z, cadre, -Math.sin(a) * (x.h + 0.004), Math.cos(a) * (x.h + 0.004)) - cadre * H; // (le pied, devant la devanture : là où pointe l'étiquette)
      cadre = borne((yPiedMax - ecart) / H, 0.3, 0.5);
    }
    return { z, cadre, incl: incl(z) };
  }
  // la hauteur de l'étiquette d'une boutique, mesurée cachée (son contenu dépend de la boutique : un nom, une jauge ou l'or)
  function mesurerEtiquette(f) {
    const el = E.etiquette; el.innerHTML = contenuEtiquette(f); el.classList.toggle('or', f.or);
    el.style.visibility = 'hidden'; el.hidden = false; const h = el.offsetHeight; el.hidden = true; el.style.visibility = '';
    return h || (E.compacte ? 132 : 160);
  }
  function choisir(n, signaler) {
    const x = E.parN[n]; if (!x || E.entree) return false;
    if (!E.choisi) E.zAvant = E.z; E.choisi = n; cacherEtiquette(); E.cleLod = ''; majDrapeaux(); E.touche = true;
    const c = E.choix = cadrage(x, mesurerEtiquette(x.f));
    const q1 = orientationVers(x.p, _v2.copy(x.pl.f).negate()), a = 2 * Math.acos(borne(Math.abs(q1.dot(E.q)), 0, 1));
    E.tween = { q0: E.q.clone(), q1, z0: E.z, z1: c.z, c0: E.cadre, c1: c.cadre, i0: E.incl, i1: c.incl, t: 0, duree: E.reduit ? 0.3 : 0.75 + 0.45 * a / Math.PI, fin: () => { if (E && E.choisi === n) montrerEtiquette(n); } };
    E.vx = 0; E.vy = 0; E.geste = performance.now();
    if (signaler && E.opts.onToucher) try { E.opts.onToucher(n); } catch (e) { /* rien */ }
    return true;
  }
  function relacher() {
    if (!E || !E.choisi || E.entree) return; E.choisi = 0; E.cleLod = ''; cacherEtiquette(); majDrapeaux();
    E.tween = { q0: E.q.clone(), q1: E.q.clone(), z0: E.z, z1: Math.min(E.z, E.zAvant == null ? 0 : E.zAvant), c0: E.cadre, c1: E.cadreBase, i0: E.incl, i1: 0, t: 0, duree: E.reduit ? 0.3 : 0.8 };
  }
  // « Entrer » : la caméra plonge vers la porte, le ciel voile l'écran, puis onEntrer(n) ; si l'écran garde la planète ouverte (il n'est pas
  // entré), elle revient à l'étiquette au bout d'un moment. Pas d'entrée en rafale : un seul plongeon à la fois, et une seconde de garde après.
  function entrer(n) {
    if (!E || E.entree || performance.now() - (E.sortie || 0) < 1000 || !E.parN[n]) return;
    const e0 = E; E.entree = n; cacherEtiquette(); E.conteneur.classList.add('pl-entree');
    E.tween = { q0: E.q.clone(), q1: E.q.clone(), z0: E.z, z1: 1.16, c0: E.cadre, c1: 0.56, i0: E.incl, i1: 0, t: 0, duree: E.reduit ? 0.2 : 0.55, entre: true, fige: true, fin: () => {
      if (E !== e0) return;
      try { if (E.opts.onEntrer) E.opts.onEntrer(n); } catch (x) { /* rien */ }
      if (E !== e0) return; // (l'écran a fermé la planète : elle est partie)
      E.minuteurEntree = setTimeout(() => { if (E !== e0) return; E.entree = 0; E.sortie = performance.now(); E.conteneur.classList.remove('pl-entree'); const c = E.choix || { z: CAM.choix, cadre: 0.47, incl: 0 }; E.tween = { q0: E.q.clone(), q1: E.q.clone(), z0: E.z, z1: c.z, c0: E.cadre, c1: c.cadre, i0: E.incl, i1: c.incl, t: 0, duree: 0.5, fin: () => { if (E === e0 && E.choisi === n) montrerEtiquette(n); } }; }, 1200);
    } };
  }

  // ─── les fanions numérotés (en HTML, nets à toutes les tailles) au-dessus des boutiques ; l'étiquette ; la légende ───
  const ico = (id, repli) => { try { if (typeof ICONS !== 'undefined' && ICONS.UI && ICONS.UI[id]) return ICONS.UI[id]; } catch (e) { /* rien */ } return repli; };
  const SVG = (c) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#4A3328" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c}</svg>`;
  const SVG_GERANT = SVG('<circle cx="12" cy="8.2" r="3.6" fill="#FFD7B5" stroke-width="1.8"/><path d="M5 20c.6-4 3.4-6.2 7-6.2s6.4 2.2 7 6.2" fill="#B8A6FF" stroke-width="1.8"/><path d="M10.6 14.2l1.4 2.4 1.4-2.4" stroke-width="1.4"/>');
  const SVG_CLE = SVG('<circle cx="8" cy="12" r="4.4" fill="#FFC84A" stroke-width="1.8"/><circle cx="8" cy="12" r="1.5" fill="#FFF3C4" stroke="none"/><path d="M12.4 12H21M18 12v3M15.4 12v2.2" stroke-width="1.8"/>');
  const SVG_OR = SVG('<path d="M12 2.5v3"/><path d="M4 7.5h16"/><rect x="5" y="9.5" width="14" height="8" rx="2" fill="#FFC84A"/><path d="M7 7.5v2M17 7.5v2"/><path d="M12 11.3l.8 1.6 1.8.3-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.3z" fill="#FFF3C4" stroke-width="1"/><path d="M8.5 21h7" stroke="#E0A61E"/>');
  const SVG_MAIN = SVG('<path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5V4a1.5 1.5 0 013 0v6m0-1a1.5 1.5 0 013 0v4.5c0 4-2.4 7-6.5 7-3.2 0-4.6-1.6-6.4-4.4L4.7 13a1.6 1.6 0 012.5-1.9L9 13" fill="#FFE0C7" stroke-width="1.7"/>');
  const ETOILE_SVG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .6l1.3 2.7 3 .4-2.2 2.1.5 3L5 7.4 2.4 8.8l.5-3L.7 3.7l3-.4z" fill="#FFF3C4" stroke="#B9851F" stroke-width=".8" stroke-linejoin="round"/></svg>';
  const clair = (hex) => { const k = couleur(hex); return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2] > 0.45; };
  const pluriel = (n, un) => `${n} ${un}${n > 1 ? 's' : ''}`;
  const duree = (s) => (G && G.fmtDuree ? G.fmtDuree(s) : s >= 3600 ? `${Math.floor(s / 3600)} h${Math.round((s % 3600) / 60) ? ' ' + String(Math.round((s % 3600) / 60)).padStart(2, '0') : ''}` : `${Math.max(1, Math.round(s / 60))} min`);
  function drapeaux() {
    for (const d of E.drapeaux || []) d.el.remove(); E.drapeaux = [];
    for (const x of E.magasins) {
      const el = document.createElement('div'); el.setAttribute('aria-hidden', 'true'); E.calque.appendChild(el);
      const d = { n: x.n, x0: x, el, local: x.p.clone().multiplyScalar(x.h + x.haut + 0.002), base: x.p.clone().multiplyScalar(x.h + 0.004), pied: x.p.clone().addScaledVector(x.pl.f, x.avant).normalize().multiplyScalar(x.h + 0.004), normale: x.p.clone(), vu: false, a: 0, x: 0, y: 0, w: 24, bx: 0, by: 0, cle: '', html: '' }; // (le pied : le sol devant la devanture, où pointe l'étiquette)
      E.drapeaux.push(d); habiller(d);
    }
    majDrapeaux();
  }
  function habiller(d) { // le contenu d'un fanion : son numéro (une étoile s'il est d'or), le filet de sa jauge, le point des jetons à prendre
    const f = d.x0.f, acc = accentDe(f), j = f.jauge, part = f.or ? 1 : j ? j.fait / j.max : 0;
    const cls = 'pl-drap' + (E.gagne[f.q] ? '' : ' brume') + (f.or ? ' or' : '') + (d.n === E.choisi ? ' choisi' : '') + (d.gauche ? ' gauche' : '');
    const html = `<span><b${!f.or && j ? ' class="jg"' : ''}>${f.or ? ETOILE_SVG : ''}${f.n}${!f.or && j ? `<i class="pl-jg"><i style="width:${(part * 100).toFixed(0)}%"></i></i>` : ''}</b>${f.jetons ? '<i class="pl-jet"></i>' : ''}</span>`;
    if (d.el.className !== cls) d.el.className = cls;
    d.el.style.setProperty('--acc', acc); d.el.style.setProperty('--enc', clair(acc) ? '#4A3328' : '#FFFFFF');
    if (html !== d.html) { d.html = html; d.el.innerHTML = html; d.w = 18 + 7.6 * String(f.n).length + (f.or ? 12 : 0); }
  }
  function majDrapeaux() { for (const d of E.drapeaux) habiller(d); }
  // les fanions qui se chevauchent : le plus important reste (la boutique choisie, puis celles qui ont des jetons à prendre, les Boutiques
  // d'or, les plus proches), les autres s'effacent le temps qu'on tourne ; ainsi une chaîne de cent boutiques reste lisible
  const rang = (d) => (d.n === E.choisi ? 1e6 : 0) + (d.x0.f.jetons ? 1e5 : 0) + (d.x0.f.or ? 5e4 : 0) + d.x0.taille * 10 - d.n * 1e-3;
  const _p = new V3(), _n = new V3(), _vers = new V3();
  function placerDrapeaux() {
    const cam = E.camera, W = E.W, H = E.H, mw = E.monde.matrixWorld, loin = E.z > 0.45, cand = [];
    for (const d of E.drapeaux) {
      _n.copy(d.normale).applyQuaternion(E.q); _p.copy(d.local).applyMatrix4(mw); _vers.copy(cam.position).sub(_p); const dist = _vers.length(); _vers.divideScalar(dist);
      let a = d.x0.vu && d.x0.lod < 3 ? lisse(0.06, 0.32, _n.dot(_vers)) : 0; if (loin && d.n !== E.choisi) a *= lisse(2.2, 1.2, dist); if (E.choisi && d.n !== E.choisi && E.etiquetteVue) a *= 0.35;
      if (E.entree || (d.n === E.choisi && E.etiquetteVue)) a = 0; // (la boutique choisie : son étiquette porte son numéro, son fanion s'efface)
      if (a >= 0.03) { _p.project(cam); const px = (_p.x + 1) * W / 2; a *= lisse(-8, 4, px) * lisse(W + 8, W - 4, px); d.px = Math.round((_p.x + 1) * W / 2 * 2) / 2; d.py = Math.round((1 - _p.y) * H / 2 * 2) / 2; } // (contre un bord de l'écran, le fanion qui en sortirait s'efface)
      d.ac = a; d.dist = dist; if (a >= 0.03) cand.push(d);
    }
    // le tri des chevauchements (le fanion : w × 19 px au-dessus de son pied, à droite de sa hampe ; à gauche contre le bord droit)
    cand.sort((a, b) => rang(b) - rang(a)); const pris = [];
    for (const d of cand) {
      const g = d.px > W - 42, x0 = g ? d.px - d.w : d.px, r = { x0: x0 - 2, x1: x0 + d.w + 2, y0: d.py - 33, y1: d.py - 12 };
      if (d.n !== E.choisi && pris.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) { d.ac = 0; continue; }
      pris.push(r); d.gaucheVoulu = g;
    }
    let vus = 0;
    for (const d of E.drapeaux) {
      const a = d.ac;
      if (a < 0.03) { if (d.vu) { d.el.style.visibility = 'hidden'; d.vu = false; } d.a = 0; continue; }
      vus++;
      _p.copy(d.base).applyMatrix4(mw).project(cam); d.bx = (_p.x + 1) * W / 2; d.by = (1 - _p.y) * H / 2;
      const s = d.n === E.choisi ? 1.2 : loin ? borne(1.25 / d.dist, 0.75, 1.1) : 1, cle = `${d.px}|${d.py}|${a.toFixed(2)}|${s.toFixed(2)}`;
      d.x = d.px; d.y = d.py; d.a = a;
      if (!d.vu) { d.el.style.visibility = ''; d.vu = true; }
      if (cle !== d.cle) {
        d.cle = cle; d.el.style.transform = `translate3d(${d.px}px, ${d.py}px, 0) scale(${s})`; d.el.style.opacity = a.toFixed(2); d.el.style.zIndex = String(Math.round(1000 - d.dist * 50));
        if (d.gaucheVoulu !== d.gauche) { d.gauche = d.gaucheVoulu; d.el.classList.toggle('gauche', d.gauche); } // (contre le bord droit, le fanion flotte de l'autre côté de sa hampe)
      }
    }
    E.drapeauxVus = vus;
  }
  // l'étiquette d'une boutique : son numéro, son nom, son quartier et son standing ; la jauge vers la Boutique d'or (ou l'or) ; son gérant (le
  // temps qu'il lui reste, ou « à l'arrêt » : passer le voir) et ses jetons à prendre, l'un sous l'autre, « Entrer » à côté. Une mise en
  // page, deux tailles : compacte dans la planète de l'écran « Ma chaîne » (340 à 490 px de haut, l'étiquette y fait 130 px environ)
  function texteGerant(f) {
    const g = f.gerant; if (!g) return { t: 'Pas de gérant', c: 'sans' };
    if (g.reste != null) { const r = Math.max(0, g.reste - (performance.now() - E.tFiches) / 1000); return r > 0 ? { t: `Gérant · encore ${duree(r)}`, c: '' } : { t: 'Gérant à l’arrêt', c: 'arret' }; } // (le temps qu'il lui restait à la fiche, moins le temps passé depuis)
    return { t: g.heures != null ? `Gérant · ${g.heures} h au plus` : 'Gérant', c: '' };
  }
  function contenuEtiquette(f) {
    const R = REG[f.q], j = f.jauge, ger = texteGerant(f);
    const jauge = f.or ? `<div class="pl-et-or">${ico('enseigneOr', SVG_OR)}<b>Boutique d’or</b><small>l’enseigne brille</small></div>`
      : j ? `<div class="pl-et-jauge"><span>Vers l’or</span><i><i style="width:${Math.min(100, j.fait / j.max * 100).toFixed(1)}%"></i></i><b>${j.fait}/${j.max}</b></div>` : '';
    return `<i class="pl-pointe"></i><div class="pl-et-tete"><b class="pl-et-num">${f.n}</b><div><b class="pl-et-nom">${esc(f.nom)}</b><small>${esc(capital(R.nom))} · ${esc(NOMS_STANDING[f.s])}</small></div></div>${jauge}
      <div class="pl-et-bas"><div class="pl-et-infos"><span class="pl-et-ger ${ger.c}">${ico('gerant', SVG_GERANT)}<span>${ger.t}</span></span>
        <span class="pl-et-jet ${f.jetons ? 'a' : 'sans'}">${ico('cleChaine', SVG_CLE)}<span>${f.jetons ? `${pluriel(f.jetons, 'jeton')} à prendre` : 'Aucun jeton'}</span></span></div>
        <button type="button" class="btn pl-et-entrer"><b>Entrer</b></button></div>`;
  }
  function montrerEtiquette(n) {
    const x = E.parN[n]; if (!x) return; const f = x.f, R = REG[f.q], acc = accentDe(f), el = E.etiquette;
    el.style.setProperty('--acc', acc); el.style.setProperty('--enc', clair(acc) ? '#4A3328' : '#FFFFFF');
    el.innerHTML = contenuEtiquette(f); el.classList.toggle('or', f.or);
    el.querySelector('.pl-et-entrer').addEventListener('click', (e) => { e.stopPropagation(); entrer(n); });
    el.setAttribute('aria-label', `Boutique n°${f.n}, ${f.nom}, ${R.nom}`); el.hidden = false; E.etiquetteVue = true; E.gerantVu = 0; placerEtiquette(); void el.offsetWidth; el.classList.add('pl-vue'); // (le fondu part de la mise en page qui vient d'être calculée, sans attendre une image)
    E.legende.classList.add('cache');
  }
  function majGerantEtiquette() { // une fois par seconde, l'étiquette ouverte : le temps qu'il reste au gérant
    const now = performance.now(); if (!E.etiquetteVue || now - E.gerantVu < 1000) return; E.gerantVu = now;
    const x = E.parN[E.choisi], s = x && x.f.gerant && E.etiquette.querySelector('.pl-et-ger'); if (!s) return;
    const g = texteGerant(x.f), t = s.lastElementChild; if (t.textContent !== g.t) { t.textContent = g.t; s.className = 'pl-et-ger ' + g.c; }
  }
  function cacherEtiquette() { if (!E || !E.etiquette) return; E.etiquette.classList.remove('pl-vue'); E.etiquette.hidden = true; E.etiquetteVue = false; E.legende.classList.remove('cache'); }
  function placerEtiquette() { // sous l'avant de la boutique (sa devanture reste visible) ; s'il n'y a pas la place dessous, au-dessus de son fanion
    if (!E.etiquetteVue) return; const d = E.drapeaux.find((x) => x.n === E.choisi); if (!d) return;
    _p.copy(d.pied).applyMatrix4(E.monde.matrixWorld).project(E.camera); const px = (_p.x + 1) * E.W / 2, py = (1 - _p.y) * E.H / 2;
    const el = E.etiquette, w = el.offsetWidth || 280, h = el.offsetHeight || 190, x = borne(px - w / 2, 12, E.W - w - 12);
    let y = py + 10, dessus = false; if (y + h > E.H - 8) { const y2 = (d.y || py) - 44 - h; if (y2 >= 8) { y = y2; dessus = true; } else y = Math.max(8, E.H - h - 8); }
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`; el.style.setProperty('--pointe', `${Math.round(borne(px - x, 24, w - 24))}px`); el.classList.toggle('dessus', dessus);
  }
  function majLegende(force) {
    if (!E.touche && E.t > 6) E.touche = true;
    if (!E.touche) { if (force || !E.legende.dataset.indice) { E.legende.dataset.indice = '1'; E.legende.classList.add('indice'); E.legende.innerHTML = `${SVG_MAIN}<small>${E.fiches.length ? 'Tourne la planète du doigt, touche une boutique' : 'Tourne la planète du doigt'}</small>`; } return; }
    const p = devant(); let best = 0, bd = -2; for (const R of REG) { const d = p.dot(R.c); if (d > bd) { bd = d; best = R.i; } }
    if (best === E.legendeQ && !force) return; E.legendeQ = best; delete E.legende.dataset.indice; E.legende.classList.remove('indice');
    const R = REG[best], nb = E.fiches.filter((f) => f.q === best).length;
    const sous = !E.gagne[best] ? `À gagner à la n°${R.gagneA}` : nb ? pluriel(nb, 'boutique') : 'Pas encore de boutique';
    E.legende.innerHTML = `<i style="--acc:${R.accent}"></i><b>${esc(capital(R.nom))}</b><small>${sous}</small>`;
  }

  // ─── une image : les gestes, l'inertie, les animations, les régions sous l'horizon cachées, le rendu, les fanions ───
  function visibilites() {
    const c = E.camLocal, dc = c.length(), hor = Math.acos(Math.min(1, 1 / dc));
    let vues = 0;
    for (const m of E.regions) { const R = REG[m.userData.region], a = Math.acos(borne(R.c.dot(c) / dc, -1, 1)); m.visible = a < hor + m.userData.portee + 0.02; if (m.visible) vues++; }
    E.regionsVues = vues; const fin = E.z >= 0.28;
    for (const m of E.fins) if (m) m.visible = fin && E.regions[m.userData.region].visible;
    if (E.nuages) { const o = lisse(0.5, 0.22, E.z); E.uniformes.uNuage.value = o * (2 - o); E.nuages.visible = o > 0.02; }
    if (E.halo) { E.halo.material.opacity = lisse(0.9, 0.4, E.z); E.halo.quaternion.copy(E.camera.quaternion); }
  }
  function image(dt) {
    E.t += dt; E.uniformes.uT.value = E.t;
    controle(dt);
    E.monde.quaternion.copy(E.q); E.monde.updateMatrixWorld(true);
    placerCamera();
    trierBoutiques(); for (const f of E.anime) f(E.t);
    if (E.nuages) E.nuages.rotation.y = E.t * 0.012;
    visibilites();
    E.renderer.render(E.scene, E.camera);
    placerDrapeaux(); placerEtiquette(); majGerantEtiquette(); if (!E.choisi) majLegende();
    E.images++;
  }
  function boucle(now) {
    if (!E || E.pause) return; E.raf = requestAnimationFrame(boucle);
    const vif = E.doigts.size || E.tween || Math.abs(E.vx) + Math.abs(E.vy) > 0.002 || Math.abs(E.z - borne(E.z, 0, 1)) > 0.001;
    const cadence = vif ? 0 : E.eco ? 20 : 30; // au repos (la planète tourne lentement, le moulin, le train) : 30 images par seconde, 20 en éco
    if (cadence && now - E.derniere < 1000 / cadence - 2) return;
    const dt = Math.min(0.1, Math.max(0, (now - E.derniere) / 1000)); E.derniere = now;
    const t0 = performance.now(); image(dt); E.ms = E.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  // la taille de la planète : elle tient entre le titre (opts.haut, 64 px : celui de l'écran flotte sur elle) et la légende (opts.bas, 54 px),
  // et dans la largeur ; son centre au milieu de cette bande. Choisie, une boutique se pose à mi-hauteur, son étiquette dessous.
  function redimensionner() {
    if (!E) return; const r = E.conteneur.getBoundingClientRect(), W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height)); if (W === E.W && H === E.H) return;
    E.W = W; E.H = H; E.renderer.setSize(W, H, false); E.camera.aspect = W / H; E.camera.updateProjectionMatrix();
    const haut = E.haut = Number.isFinite(+E.opts.haut) ? +E.opts.haut : 64, bas = Number.isFinite(+E.opts.bas) ? +E.opts.bas : 54;
    E.f = (H / 2) / Math.tan(CAM.fov * DEG / 2); const rpx = Math.max(50, Math.min(W * 0.45, (H - haut - bas) * 0.48)), Dc = Math.sqrt(Math.pow(E.f / rpx, 2) + 1); E.loin = Dc - 1.02;
    E.cadreBase = borne((haut + (H - bas)) / 2 / H, 0.3, 0.6);
    if (!E.tween && !E.choisi) E.cadre = E.cadreBase;
    E.compacte = H < 620; E.etiquette.classList.toggle('pl-compacte', E.compacte); // (la planète de l'écran « Ma chaîne » : 340 à 490 px de haut)
    for (const d of E.drapeaux || []) d.cle = '';
    // une boutique choisie (l'écran a tourné, la fenêtre a changé) : son cadrage refait, l'étiquette replacée
    const x = E.choisi && !E.entree && E.parN[E.choisi];
    if (x) {
      const vue = E.etiquetteVue; if (vue) cacherEtiquette();
      const c = E.choix = cadrage(x, mesurerEtiquette(x.f));
      if (E.tween && E.tween.fin) { E.tween.z1 = c.z; E.tween.c1 = c.cadre; E.tween.i1 = c.incl; if (E.tween.i0 == null) E.tween.i0 = E.incl; } else { E.tween = null; E.z = c.z; E.cadre = c.cadre; E.incl = c.incl; } // (en route vers elle : le tour continue, vers le nouveau cadrage)
      if (vue) montrerEtiquette(E.choisi);
    }
  }

  // ─── le repos : la planète tournée vers ses boutiques (leur centre), son nord en haut ; sans boutique, le village ───
  function centreBoutiques() {
    const s = new V3(); let der = null; for (const x of E.magasins) { s.add(x.p); der = x; }
    if (s.length() > 0.35 * Math.max(1, E.magasins.length)) return s.normalize();
    return der ? REG[der.f.q].c.clone() : RI.village.c.clone();
  }
  const ecoute = (cible, type, f, o) => { cible.addEventListener(type, f, o); E.ecoutes.push([cible, type, f, o]); };
  // ─── l'heure (option heure, en heures de Paris) : cinq phases du ciel, comme la boutique (src/scene.js), fondues un quart d'heure de part et
  //     d'autre de chaque borne ; le soir et la nuit, les vitres, les lanternes et les lampadaires s'allument, le fond du ciel suit (CSS) ───
  const CIELS = {
    nuit: { hemi: ['#C4CAF2', '#6A6196', 1.12], soleil: ['#CFD8FF', 0.95], lueur: 1, lisere: '#CFD8FF', halo: '#CBD2FF', fond: ['#E8E8FA', '#A2A6DC'] }, // (une nuit claire de conte, pas le noir)
    aube: { hemi: ['#FFF0E8', '#D6BFCB', 1.3], soleil: ['#FFD9C2', 1.8], lueur: 0.3, lisere: '#FFE6DC', halo: '#FFEDE6', fond: ['#FFFBF6', '#F6E4F2'] },
    jour: { hemi: ['#FFF6EA', '#D6CBE0', 1.4], soleil: ['#FFEED8', 2.0], lueur: 0, lisere: '#FFF1E4', halo: '#FFFFFF', fond: ['#FFFDF8', '#E2EBFF'] },
    soir: { hemi: ['#FFE6D4', '#CDB4C8', 1.3], soleil: ['#FFC792', 1.9], lueur: 0.4, lisere: '#FFE0C4', halo: '#FFE6D6', fond: ['#FFF8F0', '#F8D6E2'] },
    crepuscule: { hemi: ['#DCD3F4', '#8C7DAA', 1.08], soleil: ['#E8CFFF', 1.15], lueur: 0.85, lisere: '#E6D8FF', halo: '#E6DCFF', fond: ['#F4EFFF', '#C2B9E9'] },
  };
  const BORNES = [[6, 'nuit', 'aube'], [8, 'aube', 'jour'], [18, 'jour', 'soir'], [20, 'soir', 'crepuscule'], [21, 'crepuscule', 'nuit']];
  function ciel(h) { // → la phase a, la suivante b, et le fondu k de l'une à l'autre
    h = ((h % 24) + 24) % 24; let a = h < 6 || h >= 21 ? 'nuit' : h < 8 ? 'aube' : h < 18 ? 'jour' : h < 20 ? 'soir' : 'crepuscule', b = a, k = 0;
    for (const [x, p, q] of BORNES) { const d = h - x; if (Math.abs(d) < 0.25) { a = p; b = q; k = (d + 0.25) / 0.5; } }
    return { a, b, k };
  }
  const _c3 = new THREE.Color();
  function eclairer() {
    const { a, b, k } = ciel(E.heure), A = CIELS[a], B = CIELS[b], mix = (u, v) => u + (v - u) * k, teinte = (c, u, v) => c.set(u).lerp(_c3.set(v), k);
    teinte(E.hemi.color, A.hemi[0], B.hemi[0]); teinte(E.hemi.groundColor, A.hemi[1], B.hemi[1]); E.hemi.intensity = mix(A.hemi[2], B.hemi[2]);
    teinte(E.soleil.color, A.soleil[0], B.soleil[0]); E.soleil.intensity = mix(A.soleil[1], B.soleil[1]); teinte(E.appoint.color, A.soleil[0], B.soleil[0]); E.appointMax = 0.45 * E.soleil.intensity;
    const U = E.uniformes; U.uLueur.value = mix(A.lueur, B.lueur); teinte(U.uLisere.value, A.lisere, B.lisere).multiplyScalar(E.eco ? 0.18 : 0.3);
    if (E.halo) teinte(E.halo.material.color, A.halo, B.halo);
    const phase = k < 0.5 ? a : b; if (phase !== E.phase) { if (E.phase) E.conteneur.classList.remove('pl-' + E.phase); E.phase = phase; E.conteneur.classList.add('pl-' + phase); } // (le fond du ciel : .pl-conteneur.pl-nuit…)
  }
  function changerHeure(h) { if (!E || !Number.isFinite(+h)) return; E.heure = +h; eclairer(); }

  function ouvrir(conteneur, fiches, opts) {
    if (E) fermer(); if (!conteneur || !conteneur.appendChild) return false; opts = opts || {};
    const qualite = ['haute', 'moyenne', 'eco'].includes(opts.qualite) ? opts.qualite : 'haute';
    const cv = document.createElement('canvas'); cv.className = 'pl-toile'; cv.setAttribute('role', 'img');
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { renderer = null; }
    if (!renderer || !renderer.getContext()) return false;
    feuille();
    if (memoMinuteur) { clearTimeout(memoMinuteur); memoMinuteur = 0; }
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(qualite === 'haute' ? 2 : qualite === 'moyenne' ? 1.5 : 1, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.01, 30), monde = new THREE.Group(); scene.add(monde);
    const hemi = new THREE.HemisphereLight('#FFF6EA', '#D6CBE0', 1.4); scene.add(hemi); // (le jour : le ciel crème, le reflet du sol lavande ; eclairer() suit l'heure)
    const soleil = new THREE.DirectionalLight('#FFEED8', 2.0); soleil.position.set(-3.0, 3.4, 3.0); scene.add(soleil); // le soleil en haut à gauche : la planète a du volume
    const appoint = new THREE.DirectionalLight('#FFF4EA', 0.2); scene.add(appoint); scene.add(appoint.target); // (la lumière d'appoint : depuis la caméra ; voir placerCamera)
    const div = (c) => { const d = document.createElement('div'); d.className = c; return d; };
    const calque = div('pl-calque'), etiquette = div('pl-etiquette'), legende = div('pl-legende'), voile = div('pl-voile');
    etiquette.hidden = true; etiquette.setAttribute('role', 'group'); legende.setAttribute('aria-live', 'polite'); calque.setAttribute('aria-hidden', 'true');
    conteneur.classList.add('pl-conteneur'); conteneur.append(cv, calque, etiquette, legende, voile);
    E = { conteneur, cv, renderer, scene, camera, monde, hemi, soleil, appoint, calque, etiquette, legende, voile, qualite, eco: qualite === 'eco', opts, reduit: reduit(), textures: [], geos: { P: [], L: [] }, groupes: [], maillesB: [], magasins: [], parN: {}, anime: [], drapeaux: [], regions: [], fins: [], ecoutes: [],
      doigts: new Map(), echant: [], q: new THREE.Quaternion(), camLocal: new V3(0, 0, 5), z: 0, cadre: 0.5, cadreBase: 0.5, choix: null, haut: 64, compacte: false, incl: 0, rs: 1.02, vx: 0, vy: 0, t: 0, images: 0, ms: 0, derniere: performance.now(), geste: performance.now(),
      W: 0, H: 0, f: 1, fpx: 1, loin: 8, appointMax: 0.9, choisi: 0, entree: 0, legendeQ: -1, kitOk: false, tap: false, pince: 0, touche: false, lod: null, regionsVues: 0, drapeauxVus: 0 };
    E.fiches = lireFiches(fiches); E.tFiches = performance.now();
    E.N = Math.max(Math.floor(+opts.boutiques) || 0, E.fiches.reduce((m, f) => Math.max(m, f.n + 1), 1));
    E.kitOk = !E.eco && !!kitPermis() && renderer.capabilities.isWebGL2;
    cv.setAttribute('aria-label', `La petite planète de ta chaîne : ${pluriel(E.fiches.length, 'boutique')} dans les quartiers.`);
    E.mats = materiaux();
    E.heure = Number.isFinite(+opts.heure) && opts.heure !== null ? +opts.heure : 12; // (sans heure : le plein jour)
    redimensionner(); batir(); drapeaux(); majLegende(true);
    E.qRepos = orientationVers(centreBoutiques(), HAUT).premultiply(_qa.setFromAxisAngle(AXE_X, -CAM.penche)); E.rs = 1.02; // le centre des boutiques au-dessus du milieu : vues de biais, elles se détachent sur le ciel
    if (E.reduit) E.q.copy(E.qRepos); else { _qa.setFromAxisAngle(HAUT, -0.85); E.q.copy(E.qRepos).premultiply(_qa); E.z = -0.3; // l'arrivée : de plus loin, un quart de tour, puis elle se pose
      E.tween = { q0: E.q.clone(), q1: E.qRepos.clone(), z0: -0.3, z1: 0, c0: E.cadreBase, c1: E.cadreBase, t: 0, duree: 1.35, mou: true }; }
    ecoute(cv, 'pointerdown', doigtBas); ecoute(cv, 'pointermove', doigtBouge); ecoute(cv, 'pointerup', doigtHaut); ecoute(cv, 'pointercancel', doigtHaut); ecoute(cv, 'wheel', molette, { passive: false });
    ecoute(cv, 'contextmenu', (e) => e.preventDefault());
    ecoute(cv, 'webglcontextlost', (e) => { e.preventDefault(); if (E) { E.perdu = true; E.pause = true; } });
    if (typeof ResizeObserver !== 'undefined') { E.ro = new ResizeObserver(() => { if (E) redimensionner(); }); E.ro.observe(conteneur); } else ecoute(window, 'resize', redimensionner);
    // le kit (qualité haute et moyenne) : demandé à la première ouverture ; arrivé, le décor est rebâti avec lui (la planète garde sa pose)
    if (E.kitOk && !lireKit()) { const e0 = E; HDM.charger('planete').then((ok) => { if (ok && E === e0 && lireKit()) rebatir(); }); }
    E.raf = requestAnimationFrame(boucle);
    API.ouvert = true; return true;
  }
  function rebatir() { batir(); drapeaux(); E.legendeQ = -1; if (E.choisi && E.etiquetteVue) montrerEtiquette(E.choisi); }
  // les fiches changent (une action dans l'écran) : les mêmes boutiques aux mêmes places → seuls les fanions, les teintes (l'or), les gérants
  // et l'étiquette ; une boutique de plus ou de moins, ou un autre standing → tout est rebâti (le sol et le décor viennent alors du cache)
  function maj(fiches) {
    if (!E) return; const nv = lireFiches(fiches);
    const memes = nv.length === E.fiches.length && nv.every((f, i) => f.n === E.fiches[i].n && f.q === E.fiches[i].q && f.s === E.fiches[i].s);
    E.fiches = nv; E.tFiches = performance.now();
    if (!memes) { E.N = Math.max(Math.floor(+E.opts.boutiques) || 0, nv.reduce((m, f) => Math.max(m, f.n + 1), 1)); rebatir(); if (E.choisi && !E.parN[E.choisi]) { E.choisi = 0; cacherEtiquette(); } return; }
    for (const f of nv) { const x = E.parN[f.n]; if (x) { x.f = f; teintes(x); x.haut = hauteurDe(x.s, f.or) * x.k; } }
    for (const d of E.drapeaux) d.local.copy(d.x0.p).multiplyScalar(d.x0.h + d.x0.haut + 0.002);
    E.cleLod = ''; majDrapeaux(); E.legendeQ = -1;
    if (E.choisi && E.etiquetteVue) montrerEtiquette(E.choisi);
  }
  // la carte postale d'une région : sa vue rapprochée, un peu penchée vers son repère, rendue à part (540 × 360) sur le ciel de l'heure (le
  // même cadrage quelle que soit la taille de l'écran), puis un bord blanc et le nom du quartier dessous, comme une vraie carte
  function photo(q) {
    if (!E) return Promise.resolve(null); const R = REG[typeof q === 'string' ? REG.findIndex((x) => x.id === q) : q]; if (!R) return Promise.resolve(null);
    let rt = null, fond = null; const garde = { q: E.q.clone(), z: E.z, cadre: E.cadre, rs: E.rs, incl: E.incl, aspect: E.camera.aspect, H: E.H, loin: E.loin };
    try {
      const w = 540, h = 360; rt = new THREE.WebGLRenderTarget(w, h, { samples: E.renderer.capabilities.isWebGL2 ? 4 : 0 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
      const c = (CIELS[E.phase] || CIELS.jour).fond, cv0 = document.createElement('canvas'); cv0.width = 4; cv0.height = 64; const x0 = cv0.getContext('2d'), g0 = x0.createLinearGradient(0, 0, 0, 64);
      g0.addColorStop(0, c[0]); g0.addColorStop(1, c[1]); x0.fillStyle = g0; x0.fillRect(0, 0, 4, 64); fond = new THREE.CanvasTexture(cv0); fond.colorSpace = THREE.SRGBColorSpace;
      E.H = h; E.loin = Math.sqrt(Math.pow((h / 2) / Math.tan(CAM.fov * DEG / 2) / (h * 0.48), 2) + 1) - 1.02;
      E.q.copy(orientationVers(R.c, HAUT)).premultiply(_qa.setFromAxisAngle(AXE_X, -0.12)); E.z = 0.58; E.cadre = 0.56; E.incl = 0; E.rs = altitude(R.c); E.monde.quaternion.copy(E.q); E.monde.updateMatrixWorld(true);
      E.camera.aspect = w / h; E.camera.updateProjectionMatrix(); placerCamera(); E.cleLod = ''; trierBoutiques(); visibilites(); if (E.halo) E.halo.visible = false;
      E.scene.background = fond; E.renderer.setRenderTarget(rt); E.renderer.render(E.scene, E.camera); E.renderer.setRenderTarget(null); E.scene.background = null;
      const px = new Uint8Array(w * h * 4); E.renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
      // la carte : le bord blanc, la vue, la légende (le nom du quartier, la pastille de sa couleur, « Ma chaîne »)
      const B = 14, cv = document.createElement('canvas'); cv.width = w + 2 * B; cv.height = h + 2 * B + 34; const x = cv.getContext('2d');
      x.fillStyle = '#FFFDF8'; x.fillRect(0, 0, cv.width, cv.height);
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const tx = tmp.getContext('2d'), im = tx.createImageData(w, h);
      for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      tx.putImageData(im, 0, 0); x.drawImage(tmp, B, B);
      x.strokeStyle = 'rgba(74, 51, 40, .12)'; x.lineWidth = 1; x.strokeRect(B + 0.5, B + 0.5, w - 1, h - 1);
      const police = (getComputedStyle(document.documentElement).getPropertyValue('--titre') || '').trim() || 'system-ui, sans-serif';
      x.fillStyle = '#4A3328'; x.font = `700 21px ${police}`; x.textBaseline = 'middle'; x.fillText(capital(R.nom), B + 4, h + B + 22);
      x.fillStyle = R.accent; x.beginPath(); x.arc(cv.width - B - 10, h + B + 22, 7, 0, TAU); x.fill();
      x.fillStyle = '#8C6F62'; x.font = `700 13px ${police}`; x.textAlign = 'right'; x.fillText('Ma chaîne', cv.width - B - 24, h + B + 22);
      return Promise.resolve(cv.toDataURL('image/jpeg', 0.88));
    } catch (e) { return Promise.resolve(null); } finally {
      if (rt) rt.dispose(); if (fond) fond.dispose(); if (E) { E.scene.background = null; if (E.halo) E.halo.visible = true;
        Object.assign(E, { q: garde.q, z: garde.z, cadre: garde.cadre, rs: garde.rs, incl: garde.incl, H: garde.H, loin: garde.loin }); E.camera.aspect = garde.aspect; E.camera.updateProjectionMatrix(); E.cleLod = ''; placerCamera(); trierBoutiques(); }
    }
  }
  function fermer() {
    if (!E) return; const e = E;
    cancelAnimationFrame(e.raf); clearTimeout(e.minuteurEntree); for (const [c, t, f, o] of e.ecoutes) c.removeEventListener(t, f, o); if (e.ro) e.ro.disconnect();
    defaire(); for (const g of [...e.geos.P, ...e.geos.L, e.geos.micro, e.geos.gerant, e.geos.or]) if (g) g.dispose(); for (const m of Object.values(e.mats)) m.dispose();
    try { e.renderer.dispose(); e.renderer.forceContextLoss(); } catch (x) { /* rien */ }
    for (const el of [e.cv, e.calque, e.etiquette, e.legende, e.voile]) if (el) el.remove(); e.conteneur.classList.remove('pl-conteneur', 'pl-entree', 'pl-' + e.phase);
    E = null; API.ouvert = false;
    memoMinuteur = setTimeout(oublier, MEMO_MS); // (le sol et le décor calculés, gardés un moment : rouvrir la planète ne les recalcule pas)
  }

  // ─── la feuille de style de la planète : posée en tête du document (la feuille du jeu, après elle, peut l'ajuster) ───
  const CSS = `.pl-conteneur { position: relative; overflow: hidden; touch-action: none; -webkit-user-select: none; user-select: none; }
.pl-toile { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; outline: none; }
.pl-calque { position: absolute; inset: 0; pointer-events: none; overflow: hidden; contain: strict; }
.pl-drap { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform, opacity; }
.pl-drap span { position: absolute; left: -1px; bottom: 0; display: block; padding: 0 0 12px 2px; }
.pl-drap span::before { content: ''; position: absolute; left: 0; top: 2px; bottom: 0; width: 2px; border-radius: 1px; background: #6E5B52; }
.pl-drap b { position: relative; display: block; min-width: 21px; padding: 2px 7px 2px 5px; border-radius: 2px 9px 9px 2px; background: var(--acc); color: var(--enc); overflow: hidden;
  font: 700 12.5px/1.15 var(--titre, "Fredoka", "Nunito", system-ui, sans-serif); text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 1.5px rgba(255, 255, 255, .95), 0 2px 4px rgba(74, 51, 40, .22); }
.pl-drap b.jg { padding-bottom: 6px; }
.pl-drap .pl-jg { position: absolute; left: 5px; right: 7px; bottom: 2.5px; height: 2.5px; }
.pl-drap .pl-jg::before { content: ''; position: absolute; inset: 0; border-radius: 2px; background: var(--enc); opacity: .25; }
.pl-drap .pl-jg i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--enc); }
.pl-drap.gauche .pl-jg { left: 7px; right: 5px; }
.pl-drap.gauche span { left: auto; right: -1px; padding: 0 2px 12px 0; }
.pl-drap.gauche span::before { left: auto; right: 0; }
.pl-drap.gauche b { border-radius: 9px 2px 2px 9px; padding: 2px 5px 2px 7px; }
.pl-drap.gauche .pl-jet { right: auto; left: -6px; }
.pl-drap .pl-jet { position: absolute; top: -5px; right: -6px; width: 11px; height: 11px; border-radius: 50%; background: var(--beurre, #FFC84A); box-shadow: 0 0 0 2px #fff, 0 1px 2px rgba(74, 51, 40, .3); }
.pl-drap.choisi b { box-shadow: 0 0 0 2.5px #fff, 0 0 0 5px var(--acc), 0 4px 10px rgba(74, 51, 40, .3); }
.pl-drap.brume b { filter: saturate(.35) brightness(1.08); }
.pl-drap.or b { background: linear-gradient(180deg, #FFE493 0%, #FFC84A 55%, #F2A93B 100%); color: #4A3328; box-shadow: 0 0 0 1.5px #fff, 0 0 9px 1px rgba(255, 196, 64, .85), 0 2px 4px rgba(74, 51, 40, .22); }
.pl-drap.or.choisi b { box-shadow: 0 0 0 2.5px #fff, 0 0 0 5px #F2A93B, 0 0 14px 3px rgba(255, 196, 64, .8); }
.pl-drap.or b svg { display: inline-block; width: 10px; height: 10px; margin: 0 2px -1px 0; vertical-align: baseline; }
.pl-etiquette { position: absolute; left: 0; top: 0; width: min(310px, calc(100% - 20px)); padding: 12px; border-radius: 22px; background: #fff; color: var(--texte, #4A3328);
  box-shadow: 0 12px 30px rgba(74, 51, 40, .2), 0 2px 0 rgba(74, 51, 40, .05); opacity: 0; transition: opacity .2s ease-out; pointer-events: auto; will-change: transform; z-index: 3; }
.pl-etiquette.pl-vue { opacity: 1; }
.pl-etiquette.or { background: linear-gradient(160deg, #FFFFFF 40%, #FFF8E2); }
.pl-pointe { position: absolute; top: -7px; left: var(--pointe, 50%); width: 16px; height: 16px; margin-left: -8px; border-radius: 3px; background: #fff; transform: rotate(45deg); }
.pl-etiquette.dessus .pl-pointe { top: auto; bottom: -7px; }
.pl-et-tete { position: relative; display: flex; align-items: center; gap: 10px; }
.pl-et-tete > div { min-width: 0; }
.pl-et-tete .pl-et-nom { display: block; font: 700 17px/1.15 var(--titre, "Fredoka", system-ui, sans-serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-et-tete small { display: block; margin-top: 2px; font: 700 12.5px/1.25 var(--texte-font, "Nunito", system-ui, sans-serif); color: var(--texte-2, #8C6F62); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-et-tete .pl-et-num { flex: 0 0 auto; display: grid; place-items: center; min-width: 42px; height: 42px; padding: 0 6px; border-radius: 13px 13px 13px 4px; background: var(--acc); color: var(--enc);
  font: 700 20px/1 var(--titre, "Fredoka", system-ui, sans-serif); box-shadow: 0 3px 0 rgba(74, 51, 40, .14); }
.pl-et-jauge { display: flex; align-items: center; gap: 8px; margin-top: 10px; font: 800 12px/1 var(--texte-font, "Nunito", system-ui, sans-serif); color: var(--texte-2, #8C6F62); white-space: nowrap; }
.pl-et-jauge > i { position: relative; flex: 1 1 auto; height: 7px; border-radius: 4px; background: var(--creme, #FFF7EC); box-shadow: inset 0 0 0 1px rgba(74, 51, 40, .06); overflow: hidden; }
.pl-et-jauge > i > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(90deg, var(--beurre, #FFC84A), #F2A93B); }
.pl-et-jauge b { color: var(--texte, #4A3328); font-variant-numeric: tabular-nums; }
.pl-et-or { display: flex; align-items: center; gap: 7px; margin-top: 10px; padding: 4px 10px 4px 6px; border-radius: 12px; background: var(--or-clair, #FFF3C4); white-space: nowrap; }
.pl-et-or svg { width: 22px; height: 22px; flex: 0 0 auto; }
.pl-et-or b { flex: 0 0 auto; font: 700 14px/1.1 var(--titre, "Fredoka", system-ui, sans-serif); }
.pl-et-or small { min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 700 12px/1.1 var(--texte-font, "Nunito", system-ui, sans-serif); color: var(--texte-2, #8C6F62); }
.pl-et-bas { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.pl-et-infos { flex: 1 1 auto; min-width: 0; display: grid; gap: 5px; }
.pl-et-infos > span { display: flex; align-items: center; gap: 5px; min-width: 0; font: 800 12.5px/1.2 var(--texte-font, "Nunito", system-ui, sans-serif); white-space: nowrap; }
.pl-et-infos > span > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pl-et-infos svg { width: 17px; height: 17px; flex: 0 0 auto; }
.pl-et-infos .sans { color: var(--texte-2, #8C6F62); }
.pl-et-infos .sans svg { opacity: .5; filter: grayscale(1); }
.pl-et-infos .arret > span { color: var(--fraise-sombre, #E1496C); }
.pl-et-infos .a > span { padding: 1px 6px; border-radius: 6px; background: var(--or-clair, #FFF3C4); }
.pl-etiquette .pl-et-entrer { flex: 0 0 auto; min-width: 84px; min-height: 44px; padding: 0 14px; border-radius: 15px; }
.pl-etiquette .pl-et-entrer b { font: 700 17px/1 var(--titre, "Fredoka", system-ui, sans-serif); }
.pl-etiquette.pl-compacte { padding: 10px 10px 10px 11px; border-radius: 20px; }
.pl-etiquette.pl-compacte .pl-et-tete .pl-et-num { min-width: 36px; height: 36px; font-size: 18px; border-radius: 11px 11px 11px 4px; }
.pl-etiquette.pl-compacte .pl-et-tete .pl-et-nom { font-size: 15.5px; }
.pl-etiquette.pl-compacte .pl-et-tete small { font-size: 12px; }
.pl-etiquette.pl-compacte :is(.pl-et-jauge, .pl-et-or, .pl-et-bas) { margin-top: 8px; }
.pl-etiquette.pl-compacte .pl-et-or { padding-top: 3px; padding-bottom: 3px; }
.pl-etiquette.pl-compacte .pl-et-or svg { width: 20px; height: 20px; }
.pl-legende { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; max-width: calc(100% - 32px); padding: 8px 14px; border-radius: 999px;
  background: rgba(255, 255, 255, .88); box-shadow: 0 4px 14px rgba(74, 51, 40, .1); white-space: nowrap; pointer-events: none; transition: opacity .2s; }
.pl-legende i { flex: 0 0 auto; width: 11px; height: 11px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 0 2px #fff; }
.pl-legende b { font: 700 16px/1 var(--titre, "Fredoka", system-ui, sans-serif); overflow: hidden; text-overflow: ellipsis; }
.pl-legende small { font-size: 12.5px; color: var(--texte-2, #8C6F62); overflow: hidden; text-overflow: ellipsis; }
.pl-legende svg { width: 20px; height: 20px; flex: 0 0 auto; }
.pl-legende.indice { white-space: normal; border-radius: 18px; padding: 7px 14px 7px 10px; }
.pl-legende.indice small { font-size: 13px; line-height: 1.25; color: var(--texte, #4A3328); text-wrap: balance; }
.pl-legende.cache { opacity: 0; }
.pl-voile { position: absolute; inset: 0; z-index: 4; pointer-events: none; opacity: 0; background: radial-gradient(60% 50% at 50% 55%, #FFFDF8, #FFF1E2); transition: opacity .45s ease-in; }
.pl-conteneur.pl-entree .pl-voile { opacity: 1; }
.pl-conteneur.pl-aube { background: radial-gradient(115% 62% at 50% 46%, #FFFBF6 0%, #FFEFE8 36%, #F6E4F2 64%, #FFE3D4 100%); }
.pl-conteneur.pl-soir { background: radial-gradient(115% 62% at 50% 46%, #FFF8F0 0%, #FFE8DA 34%, #F8D6E2 62%, #F1C8D2 100%); }
.pl-conteneur.pl-crepuscule { background: radial-gradient(1.5px 1.5px at 12% 18%, #fff 60%, transparent), radial-gradient(2px 2px at 82% 12%, #fff 60%, transparent), radial-gradient(2px 2px at 24% 78%, #fff 60%, transparent),
  radial-gradient(115% 62% at 50% 46%, #F4EFFF 0%, #DDD5F6 36%, #C2B9E9 64%, #CDAED8 100%); }
.pl-conteneur.pl-nuit { background: radial-gradient(1.5px 1.5px at 12% 18%, #fff 60%, transparent), radial-gradient(2px 2px at 82% 12%, #fff 60%, transparent), radial-gradient(1.5px 1.5px at 70% 26%, #fff 60%, transparent),
  radial-gradient(2px 2px at 24% 78%, #fff 60%, transparent), radial-gradient(1.5px 1.5px at 88% 70%, #fff 60%, transparent), radial-gradient(1.5px 1.5px at 8% 60%, #fff 60%, transparent),
  radial-gradient(2.5px 2.5px at 40% 9%, #fff 60%, transparent), radial-gradient(1.5px 1.5px at 58% 88%, #fff 60%, transparent), radial-gradient(2px 2px at 93% 40%, #fff 60%, transparent),
  radial-gradient(115% 62% at 50% 46%, #E8E8FA 0%, #C6C8EE 34%, #A2A6DC 62%, #8C89C6 100%); }
.pl-conteneur:is(.pl-nuit, .pl-crepuscule) .pl-legende.indice small { color: #3F3A72; }
@media (prefers-reduced-motion: reduce) { .pl-voile, .pl-etiquette, .pl-legende { transition: none; } }`;
  function feuille() {
    if (document.getElementById('pl-style')) return;
    const s = document.createElement('style'); s.id = 'pl-style'; s.textContent = CSS; (document.head || document.documentElement).insertBefore(s, (document.head || document.documentElement).firstChild);
  }

  const API = {
    actif: true, ouvert: false, ouvrir, maj, viser: (n) => (E ? choisir(Math.floor(+n) || 0, false) : false), relacher: () => relacher(), photo, fermer, heure: changerHeure, REG, placesDe,
    get stats() {
      if (!E) return null; const i = E.renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programmes: (i.programs || []).length, ms: +E.ms.toFixed(3), images: E.images,
        qualite: E.qualite, boutiques: E.fiches.length, placees: E.magasins.length, choisi: E.choisi, etiquette: !!E.etiquetteVue, entree: E.entree, z: +E.z.toFixed(3), kit: !!E.kit, memo: !!E.memo,
        regionsVues: E.regionsVues, drapeauxVus: E.drapeauxVus, lod: E.lod, ilots: Object.assign({}, ILOTS_ACTIFS), legende: E.legende.textContent, heure: E.heure, phase: E.phase, lueur: +E.uniformes.uLueur.value.toFixed(2), temps: E.temps };
    },
    // pour les tests et les captures : la boucle suspendue, des images à la main, où est une boutique à l'écran
    essai: {
      pause(on) { if (!E) return; E.pause = !!on; E.essai = !!on; cancelAnimationFrame(E.raf); if (!on) { E.derniere = performance.now(); E.raf = requestAnimationFrame(boucle); } },
      image(dt, n) { if (!E) return; for (let k = 0; k < (n || 1); k++) image(dt == null ? 1 / 60 : dt); },
      ecran(n) { const d = E && E.drapeaux.find((x) => x.n === n); if (!d) return null; const r = E.cv.getBoundingClientRect(); return { x: r.left + d.x + (d.gauche ? -d.w / 2 : d.w / 2), y: r.top + d.y - 22, bx: r.left + d.bx, by: r.top + d.by, vu: d.vu && d.a > 0.35 }; },
      journal() { return E ? E.journal : null; }, temps() { return E ? E.temps : null; },
      etat() { return E ? { q: E.q.toArray().map((v) => +v.toFixed(4)), z: E.z, choisi: E.choisi, etiquette: !!E.etiquetteVue, tween: !!E.tween, vx: E.vx, vy: E.vy, entree: E.entree } : null; },
      repos() { if (!E) return; E.tween = null; E.q.copy(E.qRepos); E.z = 0; E.incl = 0; E.vx = 0; E.vy = 0; E.cadre = E.cadreBase; },
      regarder(i, z, penche) { if (!E) return; const R = REG[i]; E.tween = null; E.incl = 0; E.q.copy(orientationVers(R.c, HAUT)).premultiply(_qa.setFromAxisAngle(AXE_X, -(penche || 0))); E.z = z == null ? 0.6 : z; E.vx = 0; E.vy = 0; E.rs = altitude(R.c); },
      tourner(ax, ay) { if (E) tourner(ax, ay); }, zoom(z) { if (E) E.z = z; }, cadre(c) { if (E) E.cadre = c; },
      scene() { return E ? E.scene : null; }, entrer(n) { if (E) entrer(n); }, touche() { if (E && !E.touche) { E.touche = true; majLegende(true); } },
      geoBoutique: (s, eco) => geoBoutique(s, eco), modele(type, arg) { const L = new Lot(false); MODELES[type](L, tirage(3), arg); return L.geo(); }, materiaux: () => (E ? E.mats : null),
      places(i) { const c = PLACES.get(i); return c ? c.liste.length : 0; }, oublier,
      comptes() { // les triangles de chaque maillage (instances comprises)
        if (!E) return null; const o = {}, tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1);
        E.regions.forEach((m) => { o['region-' + REG[m.userData.region].id] = m.visible ? tri(m) : 0; }); E.fins.forEach((m) => { if (m) o['fin-' + REG[m.userData.region].id] = m.visible ? tri(m) : 0; }); E.maillesB.forEach((m, k) => { o['boutiques-' + k] = tri(m); });
        if (E.eau) o.eau = tri(E.eau); if (E.nuages) o.nuages = E.nuages.visible ? tri(E.nuages) : 0; if (E.taches) o.taches = tri(E.taches); let a = 0; for (const m of E.monde.children) if (m.isMesh && !E.regions.includes(m) && !E.fins.includes(m) && !E.maillesB.includes(m) && m !== E.eau && m !== E.nuages && m !== E.taches) a += tri(m); o.animes = a;
        o.total = Object.values(o).reduce((x, y) => x + y, 0); return o;
      },
    },
  };
  return API;
})();
if (typeof module !== 'undefined') module.exports = PLANETE;
