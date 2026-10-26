/* LE FOURNIL — « Ma chaîne de boutiques » : les règles (st.chaine), les jetons de chaîne, les gérants, la boutique des jetons, et le carnet
   « Mes décos » (catalogue, places typées, disposition, code de la photo). Aucune dépendance au DOM : tourne aussi dans Node.
   Global CHAINE, chargé dans build.js juste après game.js : il lit GAME, n'y écrit jamais rien d'autre que st.chaine (et la réserve de boosts
   par GAME.donnerBoostReserve, la tenue de la chaîne par GAME.donnerVetement), et se branche au prestige (GAME.brancherPrestige, tout en bas).
   Conception, simulation et réglages : le contrat du lot « Ma chaîne de boutiques » ; test : test/fournil-chaine.test.js.

   Les décisions du joueur (plan, 20-22 oct.), sans changement :
   - le prestige est gardé : ouvrir une boutique donne toujours des étoiles ; l'ancienne rejoint la chaîne au lieu d'être effacée (rejoindre) ;
   - les boutiques déjà fermées sont rouvertes À NEUF, une seule fois (etat : n°1 à st.boutiques − 1, niveau 1, quartierDe(n), standingDe(n)) ;
   - les jetons de chaîne : un par palier de recette franchi dans une ancienne boutique, et un paquet à la « Boutique d'or » ;
   - les gérants : l'ancienne boutique tourne sans le joueur à ~10 % de son rythme, 8 h au plus ; leurs niveaux montent l'un et l'autre ;
   - les gains restent dans la caisse de chaque boutique : jamais d'étoiles, ni lifetime, ni lifetimeRun, ni points de classement, ni objectifs,
     ni st.stats, ni grades d'apprentis (ce module n'appelle JAMAIS GAME.gagner, acheter, embaucher, amelioration, ameliorerMeuble, tick, noter,
     marquerAmelioration, creditApprenti, gagnerXp) ;
   - les jetons ne s'achètent pas avec de l'argent : ils se gagnent dans les boutiques de la chaîne.

   La forme compacte d’une boutique de la chaîne (st.chaine.b[k] ; mesuré : environ 85 octets neuve, 300 tout au max) :
     { n: son numéro (1, 2…), q: son quartier (indice de GAME.QUARTIERS, posé une fois), c: sa caisse (€),
       s: [niv…] les niveaux des recettes dans l'ordre de GAME.PRODUITS (les zéros de la fin retirés), a: les apprentis (masque de bits),
       b: les bonus achetés (masque de bits dans l'ordre de GAME.AMELIORATIONS), m: les crans du mobilier (un chiffre par meuble, ordre de
       GAME.MOBILIER, '' : rien), am: le code d'aménagement (19 car., GAME.codeAmenagement ; absent : le plan d'origine),
       g: [rythme, durée] les niveaux du gérant (absent : pas de gérant), vu: l'heure (ms) jusqu'où le gérant a été payé,
       pj: les paliers déjà comptés en jetons, jp: les jetons à prendre (paliers + paquet d'or), or: 1 si Boutique d'or,
       d: les décos posées, en code (codeDecos : 3 caractères par déco, le même que la photo ; absent : la déco d'office, son souvenir de quartier),
       nm: le nom donné (absent : l'enseigne) }
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./game.js'));
  } else root.CHAINE = factory(root.GAME);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  const { PRODUITS, AMELIORATIONS, MOBILIER, PALIERS, QUARTIERS } = G;

  // ─── les réglages (chiffrés par la simulation : sim/sim-chaine.js ; à valider avec le joueur sur la page de validation) ───
  const JETONS_PALIER = 1;      // un jeton par palier de recette franchi (25, 50, 75… 5000 : 26 paliers par recette, 416 par boutique)
  // la boutique qui rejoint la chaîne au prestige : ses paliers déjà franchis deviennent-ils des jetons à prendre ('a-prendre', recommandé :
  // 35 à 130 jetons à chaque prestige, un flux régulier, surtout pour un joueur arrivé après le lot) ou sont-ils comptés sans jetons
  // ('comptes' : seuls les paliers franchis APRÈS comptent ; la chaîne d'un nouveau joueur rapporte 4 à 10 jetons par jour) ? Question au joueur.
  const REJOINDRE = { paliers: (typeof process !== 'undefined' && process.env && process.env.CHAINE_REJOINDRE) || 'a-prendre' };
  // la Boutique d'or : chaque recette gagnée au niveau OR_NIV[standing] au moins ; plus la boutique est luxueuse (son numéro), plus elle
  // demande (n°1-5 : 175, soit 7 paliers par recette ; n°26 et plus : 400, 12 paliers) ; le paquet grandit avec elle (40 à 140 jetons)
  const OR_NIV = [175, 200, 250, 300, 350, 400];
  const PAQUET_OR = [40, 60, 80, 100, 120, 140];
  const GERANT = {
    part: [0.10, 0.14, 0.18, 0.22, 0.26, 0.30],  // le rythme du gérant, par niveau (0 : à l'embauche, ~10 % comme le Quartier et le Manoir)
    heures: [8, 10, 12, 14, 16],                  // ses heures au plus par absence (0 : 8 h, comme les apprentis de la boulangerie)
    prixRythme: [8, 15, 25, 40, 60],              // en jetons : le niveau suivant du rythme (de 0→1 à 4→5)
    prixDuree: [8, 15, 25, 40],                   // en jetons : le niveau suivant de la durée (de 0→1 à 3→4)
  };
  const prixGerant = (k) => (k <= 0 ? 0 : Math.min(60, 5 * k)); // le (k + 1)-ième gérant : le premier offert, puis 5, 10, 15… jetons, 60 au plus (dès le 13e)
  const BOOSTS = [ // dans la réserve de la boulangerie principale (GAME.donnerBoostReserve), lancés quand on veut ; un achat par semaine au plus
    { id: 'x2', mult: 2, secs: 1800, prix: 20, nom: 'Boost ×2 de 30 min' },
    { id: 'x5', mult: 5, secs: 600, prix: 40, nom: 'Boost ×5 de 10 min' },
  ];
  // achats de boost par semaine (GAME.semaineKey, heure de Paris) : la chaîne ne doit pas accélérer les étoiles (≤ +5 %). Simulé
  // (sim/sensibilite.js, moyenne géométrique de 12 parties : 4 départs × 3 graines, sans la chaîne, un boost de plus par semaine) :
  //   ×5 de 30 min par JOUR : +25 % (occasionnel) ; ×5 de 30 min par semaine : +4,3 % (occasionnel), +10,9 % (1 h/j) : trop ;
  //   ×2 de 30 min par semaine : +2,8 % et +2,9 % ; ×5 de 10 min par semaine : +2,8 % et +2,2 %. D'où ces deux-là, un par semaine.
  const BOOSTS_SEMAINE = 1;
  // les objets rares de la chaîne : rien qui accélère la boulangerie (des décos, une tenue sans bonus, un compagnon sans bonus) ;
  // famille : 'deco' (Mes décos), 'tenue' (garde-robe, collection « chaine » à ajouter à GAME.GARDEROBE), 'compagnon' (GAME.COMPAGNONS)
  const OBJETS = [
    { id: 'chaine-plan', famille: 'deco', prix: 30, nom: 'Le plan de la chaîne', desc: 'Une carte encadrée, une punaise par boutique.' },
    { id: 'chaine-cloche', famille: 'deco', prix: 45, nom: 'La cloche du gérant', desc: 'Un coup de sonnette, et toute la chaîne se met au travail.' },
    { id: 'chaine-globe', famille: 'deco', prix: 90, nom: 'Le globe de la petite planète', desc: 'Ta planète en miniature, sous une cloche de verre.' },
    { id: 'chaine-statue', famille: 'deco', prix: 160, nom: 'La statue du fondateur', desc: 'Toi, en bronze, une baguette à la main.' },
    { id: 'chaine-toque', famille: 'tenue', prix: 60, nom: 'Toque à galon', desc: 'Celle du patron de la chaîne.' },
    { id: 'chaine-veste', famille: 'tenue', prix: 60, nom: 'Veste de patron', desc: 'Croisée, boutons dorés.' },
    { id: 'chaine-souliers', famille: 'tenue', prix: 60, nom: 'Souliers vernis', desc: 'Pour passer d’une boutique à l’autre.' },
    { id: 'chaine-cles', famille: 'tenue', prix: 60, nom: 'Trousseau de clés', desc: 'Une clé par boutique : il tinte à chaque pas.' },
    { id: 'pigeon', famille: 'compagnon', prix: 120, nom: 'Pigeon voyageur', desc: 'Il porte les nouvelles d’une boutique à l’autre.' },
  ];
  // gagnés, jamais achetés : l'enseigne dorée (la première Boutique d'or) ; le souvenir de chaque quartier (une boutique de la chaîne dans ce quartier)
  const ENSEIGNE_OR = 'chaine-enseigne';
  const SOUVENIRS = [ // un par quartier (ordre de GAME.QUARTIERS) : la déco d'office de chaque boutique de la chaîne de ce quartier
    { id: 'souvenir-village', nom: 'Le petit moulin', place: 'comptoir' }, { id: 'souvenir-paris', nom: 'Le réverbère parisien', place: 'sol' },
    { id: 'souvenir-mer', nom: 'Le bateau en bouteille', place: 'rebord' }, { id: 'souvenir-montagne', nom: 'La cloche de vache', place: 'mur' },
    { id: 'souvenir-ville', nom: 'Le tramway miniature', place: 'rebord' }, { id: 'souvenir-gare', nom: 'L’horloge de quai', place: 'mur' },
    { id: 'souvenir-ile', nom: 'Le coquillage', place: 'comptoir' }, { id: 'souvenir-chateau', nom: 'Le blason', place: 'mur' },
    { id: 'souvenir-cimes', nom: 'Les skis croisés', place: 'mur' }, { id: 'souvenir-capitale', nom: 'La tour Eiffel miniature', place: 'comptoir' },
  ];

  // ─── petits outils ───
  const entier = (v, min, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; };
  const fini = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; };
  const NB = PRODUITS.length, NB_BONUS = AMELIORATIONS.length;
  const paliersDe = (niv) => { let k = 0; while (k < PALIERS.length && niv >= PALIERS[k]) k++; return k; }; // les paliers franchis à ce niveau
  const orNiv = (n) => OR_NIV[G.standingDe(n)], orPaliers = (n) => paliersDe(orNiv(n)), paquetOr = (n) => PAQUET_OR[G.standingDe(n)];
  const bit = (masque, i) => Math.floor(masque / Math.pow(2, i)) % 2 === 1; // (jusqu'à 2^53 : les 23 bonus tiennent)
  const avecBit = (masque, i) => (bit(masque, i) ? masque : masque + Math.pow(2, i));

  // ─── l'état : st.chaine ───
  // newState (src/game.js) porte chaine: chaineNeuve() avec cree: 0 ; une vieille sauvegarde la reçoit de newState par ui.js lire() ;
  // etat() la remet d'aplomb et, une seule fois (cree), y rouvre à neuf les boutiques n°1 à st.boutiques − 1.
  const chaineNeuve = () => ({ v: 1, cree: 0, jetons: 0, gagnes: 0, objets: [], bj: '', bn: 0, b: [] }); // bj, bn : la semaine du dernier boost acheté, combien
  function boutiqueNeuve(n, now) { return { n, q: G.quartierDe(n), c: 0, s: [1], a: 0, b: 0, m: '', vu: now, pj: 0, jp: 0 }; }
  function nettoyerBoutique(x, max, now) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const n = entier(x.n, 0, 1e6); if (n < 1 || n > max) return null;
    const s = (Array.isArray(x.s) ? x.s.slice(0, NB) : []).map((v) => entier(v, 0, 1e6));
    if (!s.length || s[0] < 1) s[0] = Math.max(1, s[0] || 0);
    while (s.length > 1 && s[s.length - 1] === 0) s.pop();
    const b = { n, q: Number.isInteger(x.q) && x.q >= 0 && x.q < QUARTIERS.length ? x.q : G.quartierDe(n), c: fini(x.c, 0, 1e300), s,
      a: entier(x.a, 0, Math.pow(2, NB) - 1), b: entier(x.b, 0, Math.pow(2, NB_BONUS) - 1), m: '', vu: Number.isFinite(x.vu) ? x.vu : now, pj: entier(x.pj, 0, 1e6), jp: entier(x.jp, 0, 1e6) };
    for (let i = 0; i < NB; i++) if (bit(b.a, i) && !(s[i] > 0)) b.a -= Math.pow(2, i); // pas d'apprenti sur une recette pas débloquée
    { const m = typeof x.m === 'string' ? x.m.slice(0, MOBILIER.length) : ''; let t = ''; for (let k = 0; k < m.length; k++) t += String(Math.min(MOBILIER[k].max, entier(m[k], 0, 9))); b.m = t.replace(/0+$/, ''); }
    if (typeof x.am === 'string' && G.amenagementDepuisCode(x.am)) b.am = x.am;
    if (Array.isArray(x.g) && x.g.length === 2) b.g = [entier(x.g[0], 0, GERANT.part.length - 1), entier(x.g[1], 0, GERANT.heures.length - 1)];
    if (x.or === 1 || x.or === true) b.or = 1;
    if (typeof x.d === 'string') { const l = decosDepuisCode(x.d); if (l) b.d = codeDecos(l); } else if (Array.isArray(x.d)) b.d = codeDecos(x.d); // (une liste : remise en code)
    if (typeof x.nm === 'string' && x.nm.trim()) b.nm = x.nm.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return b;
  }
  // etat() est appelé partout (à chaque action) : la réparation complète ne se fait qu'une fois par objet st.chaine (au chargement d'une
  // sauvegarde, ui.js lire() ; ou à la première lecture), ensuite les boutiques restent LES MÊMES objets (une vue ouverte garde sa boutique).
  const REPAREES = typeof WeakSet === 'function' ? new WeakSet() : null;
  // plafond : le dernier numéro à rouvrir (le crochet du prestige : la boutique quittée, comptée dans st.boutiques − 1, rejoint avec ses niveaux)
  function etat(st, now, plafond) { // st.chaine remise d'aplomb ; la chaîne recréée à neuf une seule fois ; rend st.chaine
    let c = st.chaine;
    if (c && REPAREES && REPAREES.has(c) && Array.isArray(c.b)) return c;
    now = Number.isFinite(now) ? now : st.now || Date.now();
    if (!c || typeof c !== 'object' || Array.isArray(c)) c = st.chaine = chaineNeuve();
    c.v = 1; c.jetons = entier(c.jetons, 0, 1e9); c.gagnes = entier(c.gagnes, 0, 1e12);
    c.objets = Array.isArray(c.objets) ? [...new Set(c.objets.filter((id) => typeof id === 'string' && (OBJETS.some((o) => o.id === id) || id === ENSEIGNE_OR)))] : [];
    if (typeof c.bj !== 'string') c.bj = ''; c.bn = entier(c.bn, 0, 99);
    const max = Math.max(0, (st.boutiques || 1) - 1), vus = new Set();
    c.b = (Array.isArray(c.b) ? c.b : []).map((x) => nettoyerBoutique(x, max, now)).filter((b) => b && !vus.has(b.n) && vus.add(b.n));
    if (!c.cree) { const haut = Number.isFinite(plafond) ? Math.min(max, plafond) : max; for (let n = 1; n <= haut; n++) if (!vus.has(n)) c.b.push(boutiqueNeuve(n, now)); c.cree = 1; } // une vieille sauvegarde : rouvertes à neuf, une fois
    c.b.sort((x, y) => x.n - y.n);
    if (REPAREES) REPAREES.add(c);
    return c;
  }
  const boutique = (st, n) => etat(st).b.find((b) => b.n === n) || null;
  const nbGerants = (st) => etat(st).b.filter((b) => b.g).length;

  // ─── le crochet du prestige (GAME.nouvelleBoutique, juste après annulerMainArriere et AVANT l'effacement) ───
  // quittee : { n, nom, q }, ce que GAME.nouvelleBoutique a lu de la boutique quittée avant de poser la nouvelle (st.boutiques, st.nomBoutique et
  // st.quartierFixe sont déjà ceux de la nouvelle quand le crochet est appelé). Sans quittee (appelé avant nouvelleBoutique) : lus dans st.
  // L'ancienne boutique rejoint la chaîne telle qu'elle est (niveaux, apprentis, bonus, meubles, plan, nom, caisse) : elle n'est plus effacée.
  // Ses paliers déjà franchis sont comptés (pj) et deviennent ses jetons à prendre (REJOINDRE.paliers) ; la Boutique d'or, si elle y est déjà, donne son paquet.
  // Ne touche à rien d'autre de st (ni étoiles, ni lifetime, ni stations : nouvelleBoutique les remet à zéro juste après).
  function rejoindre(st, now, quittee) {
    const q0 = quittee && typeof quittee === 'object' ? quittee : null;
    const n = q0 && Number.isInteger(q0.n) && q0.n >= 1 ? q0.n : st.boutiques || 1;
    const c = etat(st, now, n - 1); // (une chaîne jamais lue : les n°1 à n − 1 rouvertes à neuf, celle-ci rejoint telle qu'elle est)
    if (c.b.some((b) => b.n === n)) return null;
    const s = st.stations.map((x) => entier(x.niv, 0, 1e6)); while (s.length > 1 && s[s.length - 1] === 0) s.pop(); if (!(s[0] >= 1)) s[0] = 1;
    let a = 0; st.stations.forEach((x, i) => { if (x.staff && x.niv > 0 && i < NB) a = avecBit(a, i); });
    let b = 0; AMELIORATIONS.forEach((x, i) => { if (st.ameliorations && st.ameliorations[x.id]) b = avecBit(b, i); });
    const m = MOBILIER.map((x) => String(Math.min(x.max, G.mobilierCran(st, x.id)))).join('').replace(/0+$/, '');
    const q = q0 && Number.isInteger(q0.q) && q0.q >= 0 && q0.q < QUARTIERS.length ? q0.q : G.quartier(st);
    const r = { n, q, c: Math.max(0, Number.isFinite(st.coins) ? st.coins : 0), s, a, b, m, vu: now, pj: 0, jp: 0 };
    const am = G.codeAmenagement(st.amenagement); if (am) r.am = am;
    { const nm = String((q0 ? q0.nom : st.nomBoutique) || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); if (nm) r.nm = nm; }
    r.pj = paliersBoutique(r); if (REJOINDRE.paliers === 'a-prendre') r.jp = r.pj * JETONS_PALIER;
    c.b.push(r); c.b.sort((x, y) => x.n - y.n);
    verifierOr(st, r);
    return r;
  }

  // ─── la boutique de la chaîne « dépliée » (pour les calculs et pour la scène) ───
  const niv = (b, i) => (i < b.s.length ? b.s[i] : 0);
  const cran = (b, id) => { const k = MOBILIER.findIndex((x) => x.id === id); return k >= 0 && k < b.m.length ? +b.m[k] : 0; };
  const bonusDe = (b) => { const o = {}; AMELIORATIONS.forEach((x, i) => { if (bit(b.b, i)) o[x.id] = true; }); return o; };
  const paliersBoutique = (b) => { let k = 0; for (let i = 0; i < NB; i++) k += paliersDe(niv(b, i)); return k; };
  // la jauge (l'écran, la planète) : les paliers franchis jusqu'au niveau OR_NIV de son standing, sur les recettes gagnées par la boulangerie
  function jauge(st, b) {
    let fait = 0, max = 0;
    const k = orPaliers(b.n);
    for (let i = 0; i < NB; i++) { if (!G.recetteGagnee(st, i)) continue; max += k; fait += Math.min(k, paliersDe(niv(b, i))); }
    return { fait, max, part: max ? fait / max : 0, niv: orNiv(b.n) };
  }
  function verifierOr(st, b) { // la Boutique d'or : la jauge pleine (au moins les huit recettes de toujours) ; le paquet une fois
    if (b.or) return false; const j = jauge(st, b);
    if (j.max < 8 * orPaliers(b.n) || j.fait < j.max) return false;
    b.or = 1; b.jp += paquetOr(b.n); const c = etat(st); if (!c.objets.includes(ENSEIGNE_OR)) c.objets.push(ENSEIGNE_OR);
    return true;
  }

  // ─── l'économie d'une boutique de la chaîne : celle de la boulangerie, réduite ───
  // Les étoiles de la boulangerie comptent (GAME.etoileMult : le savoir-faire du patron), et ses recettes gagnées (GAME.recetteGagnee) ;
  // rien d'autre de la boulangerie : ni talents, ni garde-robe, ni compagnon, ni grades d'apprentis, ni parcours, ni boost, ni pain du jour.
  // Le mobilier de la boutique : tables (gains), four (cuisson), vitrine et bar (fournées à la main). Ni événement, ni client mystère.
  const ameliorationMult = (b, i) => { let m = 1; AMELIORATIONS.forEach((a, k) => { if (bit(b.b, k) && (a.cible === null || a.cible.includes(PRODUITS[i].id))) m *= a.mult; }); return m; };
  const temps = (b, i) => PRODUITS[i].temps * (1 - 0.03 * cran(b, 'four'));
  const affluence = (b) => 1 + 0.25 * cran(b, 'vitrine') + 0.05 * cran(b, 'bar');
  function revenuBase(st, b, i) { const k = niv(b, i); return k <= 0 ? 0 : PRODUITS[i].rev * k * G.palierMult(k) * ameliorationMult(b, i) * G.etoileMult(st) * (1 + 0.08 * cran(b, 'tables')); }
  function tauxBase(st, b) { let t = 0; for (let i = 0; i < NB; i++) if (bit(b.a, i) && niv(b, i) > 0) t += revenuBase(st, b, i) / temps(b, i); return t; }
  // le rythme (€/s) : les apprentis ; sans apprenti, la meilleure fournée à la main, à moitié (comme GAME.rythme) : le gérant cuit lui-même
  function rythme(st, b) { const t = tauxBase(st, b); if (t > 0) return t; let best = 0; for (let i = 0; i < NB; i++) if (niv(b, i) > 0) best = Math.max(best, revenuBase(st, b, i) / Math.max(1, temps(b, i)) * 0.5); return Math.max(0.5, best); }

  // ─── le gérant ───
  const partGerant = (b) => (b.g ? GERANT.part[b.g[0]] : 0);
  const heuresGerant = (b) => (b.g ? GERANT.heures[b.g[1]] : 0);
  // ce que le gérant a gagné depuis vu (sa durée au plus : 8 à 16 h), sans le verser ; idempotent, sur l'horloge du jeu (l'heure sûre :
  // HORLOGE.maintenant()). plafondMs (facultatif) : ce qu'il reste à payer pour la même absence (voir encaisserTout)
  function enAttente(st, b, now, plafondMs) {
    if (!b.g) return { secs: 0, gain: 0 };
    let secs = Math.min(heuresGerant(b) * 3600, Math.max(0, (now - b.vu) / 1000));
    if (plafondMs != null) secs = Math.min(secs, Math.max(0, Number.isFinite(plafondMs) ? plafondMs / 1000 : 0));
    return { secs, gain: partGerant(b) * rythme(st, b) * secs };
  }
  // verser à la caisse ce qu'a gagné le gérant, et remettre vu à maintenant. Sans gérant : vu suit l'heure (rien ne s'accumule).
  // Appelé au lancement, au retour, aux sauts d'heure (aux mêmes endroits que GAME.absence) et à l'ouverture de « Ma chaîne » : comme vu
  // avance à chaque versement, l'appeler deux fois ne paie jamais deux fois. Une heure qui recule (vu dans le futur) : vu = maintenant, rien de versé.
  // plafondMs : voir encaisserTout ; vu revient à maintenant dans tous les cas (ce qui dépasse le plafond est perdu, comme pour les apprentis)
  function encaisser(st, b, now, plafondMs) {
    const x = enAttente(st, b, now, plafondMs);
    if (x.gain > 0) b.c += x.gain;
    b.vu = now; // (une heure revenue en arrière : vu revient à maintenant, rien n'est versé)
    return { n: b.n, secs: x.secs, gain: x.gain };
  }
  // la ligne « Tes gérants ont rapporté… » de la feuille du retour ; rend { total, detail }.
  // plafond : 8 h au plus PAR ABSENCE (contrat § 1.5), même quand elle est payée en deux fois. Sans plafond (le lancement, le retour) : depuis vu,
  // la durée du gérant au plus. Un nombre (ms) : le même pour tous (en jouant, une fois par minute : un trou plus long est une absence que le
  // lancement, le retour ou le saut d'heure ont déjà réglée). Une fonction (b) → ms : le reste de chaque gérant pour cette absence (le saut
  // d'une heure sûre arrivée en retard, après ce que le lancement a déjà payé).
  function encaisserTout(st, now, plafond) {
    const c = etat(st, now), detail = []; let total = 0;
    for (const b of c.b) {
      if (VUE.ouverte === b.n) continue;
      const p = typeof plafond === 'function' ? plafond(b) : plafond;
      const r = encaisser(st, b, now, p); if (r.gain > 0) { detail.push(r); total += r.gain; }
    }
    return { total, detail };
  }
  function embaucherGerant(st, n, now) {
    const c = etat(st, now), b = boutique(st, n); if (!b) return { ok: false };
    if (b.g) return { ok: false, raison: 'deja' };
    const prix = prixGerant(nbGerants(st)); if (c.jetons < prix) return { ok: false, raison: 'jetons', prix };
    c.jetons -= prix; b.g = [0, 0]; b.vu = now; // il commence maintenant (rien de rétroactif)
    return { ok: true, prix };
  }
  function ameliorerGerant(st, n, quoi) { // quoi : 'rythme' ou 'duree'
    const c = etat(st), b = boutique(st, n); if (!b || !b.g) return { ok: false };
    const k = quoi === 'duree' ? 1 : 0, table = k ? GERANT.prixDuree : GERANT.prixRythme, nivAct = b.g[k];
    if (nivAct >= table.length) return { ok: false, raison: 'max' };
    const prix = table[nivAct]; if (c.jetons < prix) return { ok: false, raison: 'jetons', prix };
    c.jetons -= prix; b.g[k] = nivAct + 1;
    return { ok: true, prix, niveau: nivAct + 1 };
  }

  // ─── jouer dans une boutique de la chaîne : la vue (comme la visite d'un copain, src/classement.js boutiqueDepuisPhoto) ───
  // ouvrir() bâtit un état jetable pour la scène et l'écran (GAME.newState + st.visite + quartierFixe + standingFixe, les postes, les bonus,
  // les meubles et le plan de cette boutique, la tenue, le compagnon et le grade du boulanger en lecture seule) ; v.b : la boutique compacte,
  // seule écrite. Une seule vue ouverte à la fois (VUE.ouverte) : son gérant n'est pas payé tant qu'on y est (on la fait tourner soi-même).
  const VUE = { ouverte: 0 };
  function ouvrir(st, n, now) {
    const b = boutique(st, n); if (!b) return null;
    encaisser(st, b, now); VUE.ouverte = n;
    const v = G.newState(now);
    v.visite = true; v.chaineN = n; v.boutiques = n; v.quartierFixe = b.q; v.standingFixe = G.standingDe(n); v.nomBoutique = b.nm || '';
    v.stations.forEach((s, i) => { s.niv = niv(b, i); s.staff = bit(b.a, i) && s.niv > 0; s.prog = 0; s.actif = s.staff; });
    v.ameliorations = bonusDe(b); v.mobilier = {}; MOBILIER.forEach((x) => { v.mobilier[x.id] = cran(b, x.id); });
    { const a = b.am ? G.amenagementDepuisCode(b.am) : null; if (a) v.amenagement = a; else delete v.amenagement; }
    v.garderobe = st.garderobe; v.chat = st.chat; v.compagnon = st.compagnon; v.compagnons = st.compagnons; v.chatNoir = st.chatNoir; v.chatPelage = st.chatPelage;
    v.xp = st.xp; v.etoiles = st.etoiles; v.recettesBoutique = (st.recettesBoutique || []).slice(); // (la scène lit le grade ; aucun calcul de gains ne passe par v)
    v.evTimer = 1e9; v.mystereTimer = 1e9; v.chatAttente = null; v.mode = 1;
    v.coins = b.c; v.b = b;
    return v;
  }
  function fermer(st, v, now) { if (!v || !v.b) return; v.b.c = v.coins; v.b.vu = now; if (VUE.ouverte === v.b.n) VUE.ouverte = 0; }
  // un pas de jeu dans la vue : les fournées (apprentis, et la main), la caisse de la boutique ; rien d'autre (ni événement, ni st)
  function tick(st, v, dt, now) {
    const b = v.b, out = { ventes: [] }; v.now = now;
    v.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(b, i); s.prog += dt; if (s.prog < T) return;
      let k = Math.floor(s.prog / T);
      if (!s.staff) { k = 1; s.prog = 0; s.actif = false; } else s.prog -= k * T;
      const m = revenuBase(st, b, i) * k * (s.staff ? 1 : affluence(b));
      v.coins += m; out.ventes.push({ i, montant: m, n: k });
    });
    b.c = v.coins; b.vu = now;
    return out;
  }
  function lancer(v, i) { const s = v.stations[i]; if (!s || s.niv <= 0 || s.actif) return false; s.actif = true; s.prog = 0; return true; }
  const quantite = (v, i) => { const s = v.stations[i]; if (s.niv === 0) return 1; if (v.mode === 'max') return Math.max(1, G.maxNiveaux(i, s.niv, v.coins)); return entier(v.mode, 1, 1000); };
  const prixNiveaux = (v, i, k) => G.coutNiveaux(i, v.stations[i].niv, k);
  // acheter des niveaux (ou débloquer la recette) avec la caisse de la boutique ; les paliers franchis deviennent des jetons à prendre
  function acheter(st, v, i) {
    const b = v.b, s = v.stations[i]; if (!s) return { ok: false };
    if (s.niv === 0 && !G.recetteGagnee(st, i)) return { ok: false, verrou: true, boutique: PRODUITS[i].boutique };
    const k = quantite(v, i), prix = prixNiveaux(v, i, k);
    if (v.coins < prix) return { ok: false, prix };
    const avant = paliersDe(s.niv);
    v.coins -= prix; s.niv += k; b.c = v.coins;
    b.s = v.stations.map((x) => x.niv); while (b.s.length > 1 && b.s[b.s.length - 1] === 0) b.s.pop();
    const neufs = paliersDe(s.niv) - avant; b.pj += neufs; b.jp += neufs * JETONS_PALIER;
    const or = verifierOr(st, b);
    return { ok: true, n: k, prix, jetons: neufs * JETONS_PALIER, or };
  }
  function embaucher(st, v, i) {
    const b = v.b, s = v.stations[i], prix = PRODUITS[i] ? PRODUITS[i].staff : Infinity;
    if (!s || s.staff || s.niv <= 0 || v.coins < prix) return { ok: false, prix };
    v.coins -= prix; b.c = v.coins; s.staff = true; s.actif = true; b.a = avecBit(b.a, i);
    return { ok: true, prix };
  }
  function amelioration(st, v, id) {
    const b = v.b, k = AMELIORATIONS.findIndex((x) => x.id === id), a = AMELIORATIONS[k], prix = a ? a.cout : 0;
    if (!a || bit(b.b, k) || !G.ameliorationOuverte(st, a) || v.coins < prix) return { ok: false, prix };
    v.coins -= prix; b.c = v.coins; b.b = avecBit(b.b, k); v.ameliorations[id] = true;
    return { ok: true, a, prix };
  }
  const prixMeuble = (b, id) => { const m = MOBILIER.find((x) => x.id === id); return m ? m.cout * Math.pow(m.croiss, cran(b, id)) : Infinity; };
  function ameliorerMeuble(st, v, id) {
    const b = v.b, k = MOBILIER.findIndex((x) => x.id === id), m = MOBILIER[k]; if (!m) return { ok: false };
    const c0 = cran(b, id), prix = prixMeuble(b, id);
    if (c0 >= m.max || v.coins < prix) return { ok: false, prix, cran: c0 };
    v.coins -= prix; b.c = v.coins;
    const t = MOBILIER.map((x, j) => (j === k ? c0 + 1 : cran(b, x.id))).join('').replace(/0+$/, ''); b.m = t; v.mobilier[id] = c0 + 1;
    return { ok: true, m, cran: c0 + 1, prix };
  }
  function amenager(st, v, a) { const code = G.codeAmenagement(a); if (code) v.b.am = code; else delete v.b.am; if (a && code) v.amenagement = G.amenagementDepuisCode(code); else delete v.amenagement; return code; } // le mode Déplacer de cette boutique
  function renommer(st, n, nom) { const b = boutique(st, n); if (!b) return ''; const t = String(nom || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); if (t) b.nm = t; else delete b.nm; return nomDe(b); }
  const nomDe = (b) => b.nm || `${QUARTIERS[b.q].enseigne} n°${b.n}`;

  // ─── les jetons de chaîne ───
  function prendreJetons(st, n) { const c = etat(st), b = boutique(st, n); if (!b || !b.jp) return 0; const k = b.jp; b.jp = 0; c.jetons += k; c.gagnes += k; return k; }
  function prendreTout(st) { let k = 0; for (const b of etat(st).b) k += prendreJetons(st, b.n); return k; }
  function boostsRestants(st, now) { const c = etat(st), j = G.semaineKey(now); return c.bj === j ? Math.max(0, BOOSTS_SEMAINE - c.bn) : BOOSTS_SEMAINE; }
  function acheterBoost(st, id, now) {
    const c = etat(st, now), o = BOOSTS.find((x) => x.id === id); if (!o) return { ok: false };
    if (boostsRestants(st, now) <= 0) return { ok: false, raison: 'semaine' };
    if (c.jetons < o.prix) return { ok: false, raison: 'jetons', prix: o.prix };
    const j = G.semaineKey(now); if (c.bj !== j) { c.bj = j; c.bn = 0; }
    c.jetons -= o.prix; c.bn++; G.donnerBoostReserve(st, o.mult, o.secs);
    return { ok: true, prix: o.prix, boost: o };
  }
  // un objet rare : une déco (le carnet), une pièce de la tenue de la chaîne (GAME.donnerVetement, si game.js la connaît), le pigeon (compagnon)
  function acheterObjet(st, id) {
    const c = etat(st), o = OBJETS.find((x) => x.id === id); if (!o) return { ok: false };
    if (c.objets.includes(id)) return { ok: false, raison: 'possede' };
    if (c.jetons < o.prix) return { ok: false, raison: 'jetons', prix: o.prix };
    c.jetons -= o.prix; c.objets.push(id);
    // la pièce rejoint la garde-robe, sans compter dans st.stats ni écrire au journal de la boulangerie (contrat § 1.7)
    if (o.famille === 'tenue' && typeof G.donnerVetement === 'function' && G.vetement && G.vetement(id)) G.donnerVetement(st, id, { muet: true });
    return { ok: true, prix: o.prix, objet: o };
  }

  // ─── ce que l'écran « Ma chaîne » et la planète montrent d'une boutique ───
  function fiche(st, b, now) {
    const q = QUARTIERS[b.q], j = jauge(st, b), x = enAttente(st, b, now);
    return { n: b.n, nom: nomDe(b), quartier: q.id, quartierNom: q.nom, standing: G.standingDe(b.n), jauge: j, jetons: b.jp, or: !!b.or, caisse: b.c, enAttente: x.gain,
      gerant: b.g ? { rythme: b.g[0], duree: b.g[1], part: partGerant(b), heures: heuresGerant(b), reste: Math.max(0, heuresGerant(b) * 3600 - Math.max(0, (now - b.vu) / 1000)) } : null,
      rythme: rythme(st, b), paliers: paliersBoutique(b) };
  }
  const liste = (st, now) => etat(st, now).b.map((b) => fiche(st, b, now));
  function resume(st, now) { const c = etat(st, now); return { boutiques: c.b.length, gerants: c.b.filter((b) => b.g).length, or: c.b.filter((b) => b.or).length, jetons: c.jetons, gagnes: c.gagnes, aPrendre: c.b.reduce((k, b) => k + b.jp, 0), prochainGerant: prixGerant(nbGerants(st)) }; }

  // ─── « Mes décos » : le carnet de collection (tout ce qui existe déjà) et les décos posées ───
  // Une famille : { id, nom, items: [{ id, nom, obtenir, place?, appels? }], possede(st, id, ext) } ; ext : ce qui vit hors de la sauvegarde
  // (le classement, src/classement.js recompenses() : { coupes: ['or'…], badge }). place : le type de place d'une déco posable (mur, sol,
  // comptoir, rebord, dehors : fixe) ; mesure : ses appels de dessin AUJOURD'HUI, chacune son groupe (sonde/appels.json, master 366e8cb ;
  // null : à faire) ; lueur / anime : sa part lumineuse ou animée. Après le lot, toutes les décos posées et les petits décors fixes
  // (cadre, horloge, diplôme, plante, ardoise, fleurs, paillasson, plan) sont FUSIONNÉS : un maillage « petits » (1 appel), un maillage
  // « lueurs » (1 appel, s'il y a une lueur) et un maillage « animés » (1 appel en haute, figé dans « petits » en éco).
  // ─── textes ───
  const OBTENIR_TENUE = { base: 'Offerte dès le début', or: 'La 1re place du classement de la semaine', argent: 'La 2e place du classement de la semaine', bronze: 'La 3e place du classement de la semaine',
    quartier: 'Le Quartier, paliers 3, 6, 9 et 12', 'quartier-or': 'Le podium final du Quartier', 'quartier-neon': 'Le Quartier, palier 20', parcours: 'Le parcours du boulanger : boutiques n°11, 17, 23 et 29',
    hantee: 'La Maison hantée, paliers 3, 5, 7 et 9', 'hantee-or': 'Le podium final de la Maison hantée', 'hantee-lueur': 'La Maison hantée, palier 20', chaine: 'La boutique des jetons : 60 jetons' };
  const TITRES_PARCOURS = { 16: 'Boulanger de quartier', 22: 'Fournisseur officiel', 28: 'Grand maître du fournil', 30: 'Légende du Fournil' };
  const decosDe = (st, k) => { const q = st && st[k]; return q && typeof q === 'object' && Array.isArray(q.decos) ? q.decos : []; };
  const FAMILLES = [
    { id: 'quartier', nom: 'Le Quartier', posable: true, items: [
      { id: 'graffiti', nom: 'Le tag sur la porte', place: 'mur', mesure: 1, obtenir: 'Le Quartier, palier 2' },
      { id: 'neon', nom: 'L’enseigne néon', place: 'mur', mesure: 3, lueur: true, obtenir: 'Le Quartier, palier 5' },
      { id: 'scooter', nom: 'Le scooter', place: 'dehors', mesure: 0, obtenir: 'Le Quartier, palier 8' },
      { id: 'chien', nom: 'Le chien du quartier', place: 'sol', mesure: 2, anime: true, obtenir: 'Le Quartier, palier 11' },
      { id: 'toque-or', nom: 'La toque d’or de la recette du jour', place: 'mur', mesure: 1, obtenir: 'Le Quartier : la 500e fournée de la recette du jour' },
    ], possede: (st, id) => decosDe(st, 'quartier').includes(id) },
    { id: 'hantee', nom: 'La Maison hantée', posable: true, items: [
      { id: 'citrouilles', nom: 'Les citrouilles du perron', place: 'sol', mesure: 2, lueur: true, obtenir: 'La Maison hantée, palier 2' },
      { id: 'toiles', nom: 'Les toiles d’araignée', place: 'rebord', mesure: 3, obtenir: 'La Maison hantée, palier 6' },
      { id: 'chaudron', nom: 'Le chaudron qui bouillonne', place: 'sol', mesure: 5, lueur: true, anime: true, obtenir: 'La Maison hantée, palier 8' },
      { id: 'bestiaire', nom: 'L’étagère aux bocaux de monstres', place: 'mur', mesure: 1, obtenir: 'Le bestiaire du Manoir : la 5e sorte de monstre complétée' },
      { id: 'legende', nom: 'La lanterne de la légende', place: 'sol', mesure: 2, lueur: true, obtenir: 'La Maison hantée, palier 20' },
      { id: 'toque-citrouille', nom: 'La toque citrouille de la recette du jour', place: 'mur', mesure: 1, obtenir: 'La Maison hantée : la 500e fournée de la recette du jour' },
    ], possede: (st, id) => decosDe(st, 'hantee').includes(id) },
    { id: 'podium', nom: 'Le classement', posable: true, items: [
      { id: 'vitrine-coupes', nom: 'La vitrine des coupes', place: 'sol', mesure: 1, obtenir: 'Une place sur le podium de la semaine (1er, 2e ou 3e)' },
      { id: 'rosette', nom: 'La rosette « Esprit d’équipe »', place: 'mur', mesure: 1, obtenir: 'L’objectif commun de la semaine réussi' },
    ], possede: (st, id, ext) => (id === 'vitrine-coupes' ? !!(ext && Array.isArray(ext.coupes) && ext.coupes.length) : !!(ext && ext.badge)) },
    { id: 'chaine', nom: 'Ma chaîne', posable: true, items: [
      ...SOUVENIRS.map((s, k) => ({ id: s.id, nom: s.nom, place: s.place, mesure: null, obtenir: `Une boutique de la chaîne : ${QUARTIERS[k].nom}` })),
      ...OBJETS.filter((o) => o.famille === 'deco').map((o) => ({ id: o.id, nom: o.nom, place: o.id === 'chaine-statue' ? 'sol' : o.id === 'chaine-plan' ? 'mur' : 'comptoir', mesure: null, obtenir: `La boutique des jetons : ${o.prix} jetons` })),
      { id: ENSEIGNE_OR, nom: 'L’enseigne dorée', place: 'mur', mesure: null, lueur: true, obtenir: 'Ta première Boutique d’or' },
    ], possede: (st, id) => { const c = st && st.chaine; if (!c || typeof c !== 'object') return false; const k = SOUVENIRS.findIndex((s) => s.id === id); if (k >= 0) return Array.isArray(c.b) && c.b.some((b) => b.q === k); return Array.isArray(c.objets) && c.objets.includes(id); } },
    // les collections du carnet sans objet 3D (vignettes ~256 px : images Grok plus tard, une icône dessinée en attendant)
    { id: 'trophees', nom: 'Les trophées de la boutique', items: G.TROPHEES.map((t) => ({ id: t.id, nom: t.nom, obtenir: t.desc })), possede: (st, id) => !!(st.trophees && st.trophees[id]) },
    { id: 'compagnons', nom: 'Les compagnons', items: [...G.COMPAGNONS.filter((x) => x.id !== 'pigeon').map((x) => ({ id: x.id, nom: x.nom, obtenir: x.prix != null ? `À acheter avec l’argent de la boutique (${x.prix} min de rythme)` : x.gagne ? `${x.gagne} (${x.verrou})` : 'Offert dès le début' })), { id: 'pigeon', nom: 'Pigeon voyageur', obtenir: 'La boutique des jetons : 120 jetons' }],
      possede: (st, id) => (id === 'pigeon' ? !!(st.chaine && Array.isArray(st.chaine.objets) && st.chaine.objets.includes('pigeon')) : G.aCompagnon(st, id)) },
    { id: 'tenues', nom: 'La garde-robe', items: [...Object.values(G.GARDEROBE.objets).filter((v) => v.collection !== 'chaine').map((v) => ({ id: v.id, nom: v.nom, obtenir: OBTENIR_TENUE[v.collection] || v.collection })), ...OBJETS.filter((o) => o.famille === 'tenue').map((o) => ({ id: o.id, nom: o.nom, obtenir: `La boutique des jetons : ${o.prix} jetons` })), ...Object.values(G.AURAS).map((a) => ({ id: 'aura-' + a.id, nom: a.nom, obtenir: a.desc }))],
      possede: (st, id) => { if (id.startsWith('aura-')) { const g = st.garderobe; return !!(g && Array.isArray(g.auras) && g.auras.includes(id.slice(5))); } if (id.startsWith('chaine-')) return !!(st.chaine && Array.isArray(st.chaine.objets) && st.chaine.objets.includes(id)); return G.possede(st, id); } },
    { id: 'titres', nom: 'Les titres', items: [...Object.values(G.DISTINCTIONS).map((d) => ({ id: d.id, nom: d.nom, obtenir: d.desc })), ...Object.entries(TITRES_PARCOURS).map(([n, t]) => ({ id: 'parcours-' + n, nom: t, obtenir: `Le parcours du boulanger : la boutique n°${n}` }))],
      possede: (st, id) => { if (id.startsWith('parcours-')) return (st.boutiques || 1) >= +id.slice(9); return (G.distinctions(st) || []).includes(id); } },
    { id: 'saison', nom: 'Les recettes de saison', items: G.RECETTES_SAISON.map((r) => ({ id: r.id, nom: r.nom, obtenir: `La saison : ${r.saison || 'à sa date'}, cent fournées pour la maîtriser` })), possede: (st, id) => !!(st.collection && st.collection[id] && st.collection[id].maitrisee) },
    { id: 'cartes', nom: 'Les cartes postales des régions', items: QUARTIERS.map((q, k) => ({ id: 'carte-' + q.id, nom: `Carte postale : ${q.nom}`, obtenir: q.boutique ? `Ouvrir la boutique n°${q.boutique}, puis la photographier sur la petite planète` : 'Une boutique dans ce quartier, photographiée sur la petite planète' })),
      possede: (st, id) => !!(st.chaine && Array.isArray(st.chaine.cartes) && st.chaine.cartes.includes(id.slice(6))) },
  ];
  // (les trophées et les skins du casino s'ajoutent quand src/casino.js est chargé : CASINO.TROPHEES, CASINO.SKINS ; voir familleCasino)
  function familleCasino(C) {
    if (!C || !C.TROPHEES) return [];
    const skins = []; for (const [cat, l] of Object.entries(C.SKINS)) for (const s of l) if (!s.defaut) skins.push({ id: `${cat}-${s.id}`, nom: `${C.NOMS_CATEGORIES[cat] || cat} : ${s.nom}`, obtenir: s.trophee ? `Le trophée « ${(C.TROPHEES.find((t) => t.id === s.trophee) || {}).nom || s.trophee} »` : `${s.prix} jetons d’or de l’arrière-salle` });
    return [
      { id: 'casino-trophees', nom: 'Les trophées de l’arrière-salle', items: C.TROPHEES.map((t) => ({ id: t.id, nom: t.nom, obtenir: t.desc })), possede: (st, id) => { const c = st.arriere && st.arriere.casino; return !!(c && c.trophees && c.trophees[id] > 0); } }, // (lu sans créer st.arriere : CASINO.etat le créerait)
      { id: 'casino-skins', nom: 'Les habillages de l’arrière-salle', items: skins, possede: (st, id) => { if (!(st.arriere && st.arriere.casino)) return false; const cat = id.slice(0, id.indexOf('-')), x = id.slice(id.indexOf('-') + 1); try { return (C.skins(st)[cat] || []).some((k) => k.id === x && k.debloque); } catch (e) { return false; } } },
    ];
  }
  function carnet(st, ext, C) { // le carnet : chaque famille, son compteur (« 34/52 ») et ce qui manque, avec comment l'obtenir
    return [...FAMILLES, ...familleCasino(C)].map((f) => { const items = f.items.map((x) => Object.assign({}, x, { gagne: !!f.possede(st, x.id, ext) })); return { id: f.id, nom: f.nom, posable: !!f.posable, gagnes: items.filter((x) => x.gagne).length, total: items.length, items }; });
  }

  // ─── les places typées (src/vie.js LAY, coordonnées du plan) et la disposition ───
  // Chaque place a un code d'une lettre (pour la photo) ; « Plan d'origine » : les décos gagnées aux places d'aujourd'hui (CONDS de src/scene.js).
  const PLACES = [
    { id: 'm1', type: 'mur', lay: 'cadre2', code: 'a' }, { id: 'm2', type: 'mur', lay: 'au-dessus de l’étagère (le néon)', code: 'b' }, { id: 'm3', type: 'mur', lay: 'porte de l’arrière-boutique', code: 'c' }, { id: 'm4', type: 'mur', lay: 'entre l’horloge et le diplôme', code: 'd' },
    { id: 's1', type: 'sol', lay: 'deco (coin du meuble Décoration)', code: 'e' }, { id: 's2', type: 'sol', lay: 'sapin', code: 'f' }, { id: 's3', type: 'sol', lay: 'coin de la porte (le chien)', code: 'g' },
    { id: 'c1', type: 'comptoir', lay: 'fleurs', code: 'h' }, { id: 'c2', type: 'comptoir', lay: 'saison', code: 'i' },
    { id: 'r1', type: 'rebord', lay: 'fenetre, à gauche', code: 'j' }, { id: 'r2', type: 'rebord', lay: 'fenetre, à droite', code: 'k' },
    { id: 'x1', type: 'dehors', lay: 'trottoir (le scooter)', code: 'l' },
  ];
  // le nombre de décos posées par boutique : 6 (affiché à l'écran). Le budget d'appels de dessin tient par la fusion : quelles que soient les
  // 6 décos, elles coûtent au plus 3 appels (petits, lueurs, animés), et la fusion des petits décors fixes en rend une dizaine (mesuré :
  // horloge 3, cadre 2, lampe 2, plante, ardoise, fleurs, paillasson, plan, 1 chacun). Contrat, § 4 : le pire cas mesuré sur master
  // (capitale, palier 1, tout au max) fait 72 en éco (≤ 72) et 79 en haute (≤ 80), 78 et 82 à Noël ; avec toutes les décos d'aujourd'hui, 93.
  const DECOS_MAX = 6, BUDGET_DECOS = 3;
  const idDeco = new Map(); FAMILLES.filter((f) => f.posable).forEach((f) => f.items.forEach((x) => idDeco.set(x.id, x)));
  const placeDe = (id) => PLACES.find((p) => p.id === id) || null;
  function nettoyerPoses(l) { // [[id, place]…] : déco connue et posable, place connue de son type, une place par déco, DECOS_MAX au plus
    const prises = new Set(), vues = new Set(), out = [];
    for (const x of Array.isArray(l) ? l : []) {
      if (!Array.isArray(x) || x.length !== 2) continue; const d = idDeco.get(x[0]), p = placeDe(x[1]);
      if (!d || !p || d.place !== p.type || prises.has(p.id) || vues.has(d.id)) continue;
      prises.add(p.id); vues.add(d.id); out.push([d.id, p.id]); if (out.length >= DECOS_MAX) break;
    }
    return out;
  }
  // les appels de dessin des décos posées, après la fusion : « petits » (toujours là : les petits décors fixes y sont), « lueurs », « animés » (haute)
  const appelsPoses = (l, qualite) => { const p = nettoyerPoses(l).map(([id]) => idDeco.get(id)); return 1 + (p.some((d) => d.lueur) ? 1 : 0) + (qualite === 'haute' && p.some((d) => d.anime) ? 1 : 0); };
  function peutPoser(l, id, place, qualite) { // l'écran : vert / rouge en mode Déplacer
    const d = idDeco.get(id), p = placeDe(place); if (!d || !p) return { ok: false, raison: 'inconnue' };
    if (d.place !== p.type) return { ok: false, raison: 'type' };
    const reste = nettoyerPoses(l).filter(([x, pl]) => x !== id && pl !== place);
    if (reste.length >= DECOS_MAX) return { ok: false, raison: 'max' };
    if (appelsPoses([...reste, [id, place]], qualite) > BUDGET_DECOS) return { ok: false, raison: 'budget' }; // (ne peut pas arriver après la fusion : gardé pour une déco future plus lourde)
    return { ok: true };
  }
  // le code de la photo (champ dc) : 3 caractères par déco (2 pour l'id, son rang dans le catalogue en base 36 ; 1 pour la place) ; ≤ 18 caractères
  const ORDRE = [...idDeco.keys()];
  function codeDecos(l) { return nettoyerPoses(l).map(([id, p]) => ORDRE.indexOf(id).toString(36).padStart(2, '0') + placeDe(p).code).join(''); }
  function decosDepuisCode(s) {
    if (typeof s !== 'string' || s.length > 3 * DECOS_MAX || s.length % 3 || !/^[0-9a-z]*$/.test(s)) return null;
    const l = []; for (let k = 0; k < s.length; k += 3) { const id = ORDRE[parseInt(s.slice(k, k + 2), 36)], p = PLACES.find((x) => x.code === s[k + 2]); if (!id || !p) return null; l.push([id, p.id]); }
    return nettoyerPoses(l);
  }
  // la disposition d'office d'une boutique de la chaîne : son souvenir de quartier, à la première place libre de son type. Sur le comptoir, la
  // place de la recette (c2) avant celle des fleurs (c1) : les fleurs du standing tiennent c1 toute l'année, la recette c2 le temps d'une saison
  const OFFICE_ORDRE = { comptoir: ['c2', 'c1'] };
  function posesDOffice(b) {
    const s = SOUVENIRS[b.q], ordre = OFFICE_ORDRE[s.place];
    const p = (ordre && PLACES.find((x) => x.id === ordre[0])) || PLACES.find((x) => x.type === s.place);
    return p ? [[s.id, p.id]] : [];
  }
  const posesDe = (b) => { const l = b && typeof b.d === 'string' ? decosDepuisCode(b.d) : null; return l || posesDOffice(b); };
  function poser(st, n, l) { const b = boutique(st, n); if (!b) return null; const p = nettoyerPoses(l); b.d = codeDecos(p); return p; } // n : une boutique de la chaîne (la principale : st.decos = { d: code } , même code)

  // le prestige : l'ancienne boutique rejoint la chaîne au lieu d'être effacée (GAME.nouvelleBoutique appelle ce crochet avant l'effacement)
  if (typeof G.brancherPrestige === 'function') G.brancherPrestige(rejoindre);

  return { JETONS_PALIER, REJOINDRE, OR_NIV, PAQUET_OR, orNiv, orPaliers, paquetOr, GERANT, prixGerant, BOOSTS, BOOSTS_SEMAINE, OBJETS, ENSEIGNE_OR, SOUVENIRS, VUE,
    chaineNeuve, boutiqueNeuve, nettoyerBoutique, etat, boutique, nbGerants, rejoindre, paliersDe, paliersBoutique, jauge, verifierOr,
    niv, cran, bonusDe, ameliorationMult, temps, affluence, revenuBase, tauxBase, rythme,
    partGerant, heuresGerant, enAttente, encaisser, encaisserTout, embaucherGerant, ameliorerGerant,
    ouvrir, fermer, tick, lancer, quantite, prixNiveaux, acheter, embaucher, amelioration, prixMeuble, ameliorerMeuble, amenager, renommer, nomDe,
    prendreJetons, prendreTout, boostsRestants, acheterBoost, acheterObjet, fiche, liste, resume,
    FAMILLES, familleCasino, carnet, PLACES, DECOS_MAX, BUDGET_DECOS, nettoyerPoses, appelsPoses, peutPoser, codeDecos, decosDepuisCode, posesDOffice, posesDe, poser };
});
