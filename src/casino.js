/* LE FOURNIL — l'arrière-salle : les trophées, les mini-objectifs, les statistiques et les skins du casino (purs, sans DOM : tournent aussi
   dans Node, test/fournil-casino.test.js). Le lot 7 donne une vie à la salle cachée, sans jamais toucher à l'économie de la boutique.
   LES TROPHÉES (11) : gagnés une fois pour toutes, rangés à l'écran avec ceux de la boutique ; ils ne rapportent QUE du cosmétique (un skin,
   ou le titre « Main de velours » montré au classement), jamais d'argent, d'XP ni de points. Aucun ne dépend du montant misé.
   LES MINI-OBJECTIFS : trois par jour, renouvelés à minuit (heure de Paris) comme les objectifs du jour, tirés sur le jour et la partie
   (st.created) ; leur difficulté suit le n° de boutique. Une main ou un tour ne compte que si sa mise atteint 0,5 % de la caisse d'avant la
   mise (au moins 1 €), jamais plus : aucun objectif ne demande de miser gros. Chacun rapporte 1 jeton d'or, les trois +1 : 4 au plus par
   jour. Les jetons d'or ne servent qu'à débloquer des skins.
   LES STATISTIQUES : tenues par blackjack.js (st.arriere.stats) et roulette.js (st.arriere.roulette.stats), lues ici, BlackJack et roulette à part.
   LES SKINS : le tapis, le dos des cartes, les jetons, la finition de la roulette et la tenue du croupier ; purement visuels.
   L'ÉCONOMIE : rien ici ne touche st.coins ni la fortune, les étoiles, les points, les objectifs ou les défis ; seuls st.arriere.casino
   (et st.distinctions, par GAME.donnerDistinction, pour le titre) changent.
   L'état vit dans la sauvegarde : st.arriere.casino ; une vieille sauvegarde (sans lui) le reçoit neuf. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CASINO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PART_MIN = 0.005, MISE_MIN = 1, JETONS_JOUR_MAX = 4, PAR_JOUR = 3, BONUS_TROIS = 1;

  // ─── les skins (le premier de chaque catégorie, defaut, est à tout le monde) ───
  const SKINS = Object.freeze({
    tapis: Object.freeze([{ id: 'vert', nom: 'Feutre vert', defaut: true }, { id: 'bordeaux', nom: 'Bordeaux', trophee: 'premiere-main' }, { id: 'bleu-nuit', nom: 'Bleu nuit', trophee: 'paire-parfaite' },
      { id: 'noir-or', nom: 'Noir et or', trophee: 'assidu' }, { id: 'prune', nom: 'Prune', prix: 6 }].map(Object.freeze)),
    dos: Object.freeze([{ id: 'classique', nom: 'Classique', defaut: true }, { id: 'or', nom: 'Dorure', trophee: 'blackjack' }, { id: 'fournil', nom: 'Le Fournil', trophee: 'partage' },
      { id: 'damier', nom: 'Damier', prix: 5 }].map(Object.freeze)),
    jetons: Object.freeze([{ id: 'classique', nom: 'Classiques', defaut: true }, { id: 'nacre', nom: 'Nacre', trophee: 'cinq-cartes' }, { id: 'pastel', nom: 'Pastel', prix: 4 }].map(Object.freeze)),
    roue: Object.freeze([{ id: 'classique', nom: 'Acajou', defaut: true }, { id: 'fournil', nom: 'Le Fournil', prix: 5 }, { id: 'ebene', nom: 'Ébène', trophee: 'plein' },
      { id: 'or', nom: 'Or', trophee: 'zero' }].map(Object.freeze)),
    croupier: Object.freeze([{ id: 'gilet', nom: 'Gilet', defaut: true }, { id: 'smoking', nom: 'Smoking', trophee: 'double' }, { id: 'canotier', nom: 'Canotier', trophee: 'habitue' },
      { id: 'tablier', nom: 'Tablier de boulanger', prix: 4 }].map(Object.freeze)),
  });
  const CATEGORIES = Object.freeze(Object.keys(SKINS));
  const NOMS_CATEGORIES = Object.freeze({ tapis: 'Tapis', dos: 'Dos des cartes', jetons: 'Jetons', roue: 'Roulette', croupier: 'Croupier' });
  const skinDe = (cat, id) => (SKINS[cat] || []).find((s) => s.id === id) || null;
  const DEFAUTS = Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c, SKINS[c].find((s) => s.defaut).id])));
  // un skin débloqué est noté 'categorie:id' (des ids se répètent d'une catégorie à l'autre : 'or', 'fournil', 'classique')
  const cleSkin = (cat, id) => `${cat}:${id}`;

  // ─── les trophées ───
  const TROPHEES = Object.freeze([
    { id: 'premiere-main', nom: 'Première main', desc: 'Gagner une main de BlackJack.', jeu: 'blackjack', recompense: { skin: 'bordeaux', categorie: 'tapis' } },
    { id: 'blackjack', nom: 'BlackJack !', desc: 'Un BlackJack naturel : un as et une figure (ou un 10) d’entrée.', jeu: 'blackjack', recompense: { skin: 'or', categorie: 'dos' } },
    { id: 'cinq-cartes', nom: 'Cinq cartes', desc: 'Faire 21 avec cinq cartes (ou plus).', jeu: 'blackjack', recompense: { skin: 'nacre', categorie: 'jetons' } },
    { id: 'partage', nom: 'Coupé en deux', desc: 'Gagner les deux mains d’un partage.', jeu: 'blackjack', recompense: { skin: 'fournil', categorie: 'dos' } },
    { id: 'double', nom: 'Quitte ou double', desc: 'Gagner une main doublée.', jeu: 'blackjack', recompense: { skin: 'smoking', categorie: 'croupier' } },
    { id: 'paire-parfaite', nom: 'Paire parfaite', desc: 'Une paire parfaite aux Perfect Pairs.', jeu: 'blackjack', recompense: { skin: 'bleu-nuit', categorie: 'tapis' } },
    { id: 'plein', nom: 'Plein !', desc: 'Gagner un plein à la roulette.', jeu: 'roulette', recompense: { skin: 'ebene', categorie: 'roue' } },
    { id: 'zero', nom: 'Le zéro', desc: 'Gagner un plein sur le 0.', jeu: 'roulette', recompense: { skin: 'or', categorie: 'roue' } },
    { id: 'habitue', nom: 'Habitué du tapis', desc: 'Jouer 100 mains et tours en tout.', jeu: 'arriere', recompense: { skin: 'canotier', categorie: 'croupier' } },
    { id: 'serie-10', nom: 'Main de velours', desc: 'Dix victoires de suite (BlackJack ou roulette ; une égalité ne casse pas la série, un tour qui couvre presque tout le tapis ne l’allonge pas).', jeu: 'arriere', recompense: { titre: 'main-de-velours' } },
    { id: 'assidu', nom: 'Assidu de l’arrière-salle', desc: 'Réussir 10 mini-objectifs.', jeu: 'arriere', recompense: { skin: 'noir-or', categorie: 'tapis' } },
  ].map((t) => Object.freeze(Object.assign(t, { recompense: Object.freeze(t.recompense) }))));
  const TROPHEE = Object.fromEntries(TROPHEES.map((t) => [t.id, t]));
  const HABITUE = 100, SERIE_VELOURS = 10, ASSIDU = 10;

  // ─── les mini-objectifs : leurs types, leur cible selon le palier (le n° de boutique), leur texte ───
  // jeu : 'blackjack', 'roulette' ou 'arriere' (les deux) ; des, la boutique à partir de laquelle il peut sortir
  const TYPES = Object.freeze({
    mains: { jeu: 'blackjack', cible: (p) => 5 + 2 * p, txt: (n) => `Joue ${n} mains de BlackJack` },
    gagnees: { jeu: 'blackjack', cible: (p) => 3 + p, txt: (n) => `Gagne ${n} mains de BlackJack` },
    blackjack: { jeu: 'blackjack', cible: () => 1, txt: () => 'Fais un BlackJack naturel' },
    doubler: { jeu: 'blackjack', cible: () => 1, txt: () => 'Gagne une main doublée' },
    separer: { jeu: 'blackjack', cible: () => 1, txt: () => 'Sépare une paire' },
    tours: { jeu: 'roulette', cible: (p) => 5 + 2 * p, txt: (n) => `Joue ${n} tours de roulette` },
    couleur: { jeu: 'roulette', cible: (p) => 2 + p, txt: (n) => `Gagne ${n} fois sur rouge ou noir` },
    douzaine: { jeu: 'roulette', cible: (p) => 1 + Math.floor(p / 2), txt: (n) => (n > 1 ? `Gagne ${n} fois sur une douzaine ou une colonne` : 'Gagne sur une douzaine ou une colonne') },
    serie: { jeu: 'arriere', des: 9, cible: () => 3, txt: () => 'Gagne 3 fois de suite (BlackJack ou roulette)' },
  });
  const palier = (st) => Math.max(0, Math.min(5, Math.floor(((Number.isFinite(st && st.boutiques) ? st.boutiques : 1) - 1) / 4)));
  // le hasard du jour : FNV-1a sur « jour|partie », puis mulberry32 (le même tirage toute la journée, sur tous les appareils)
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // les trois du jour : un du BlackJack, un de la roulette, un troisième parmi ceux qui restent (types tous différents)
  function tirerObjectifs(st, jour) {
    const r = mulberry32(hash(`${jour}|casino|${st && st.created}`)), p = palier(st), b = (st && st.boutiques) || 1;
    const possibles = Object.keys(TYPES).filter((t) => !TYPES[t].des || b >= TYPES[t].des);
    const pioche = (liste) => liste[Math.floor(r() * liste.length)];
    const bj = pioche(possibles.filter((t) => TYPES[t].jeu === 'blackjack')), ro = pioche(possibles.filter((t) => TYPES[t].jeu === 'roulette'));
    const trois = pioche(possibles.filter((t) => t !== bj && t !== ro));
    return [bj, ro, trois].map((type, k) => { const cible = TYPES[type].cible(p); return { id: `${jour}-${k}`, type, cible, progres: 0, fait: false, txt: TYPES[type].txt(cible) }; });
  }

  // ─── l'état, dans la sauvegarde (une vieille sauvegarde, ou une abîmée, est remise d'aplomb) ───
  const entier = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  function etat(st) {
    let a = st.arriere;
    if (!a || typeof a !== 'object') a = st.arriere = {};
    let c = a.casino;
    if (!c || typeof c !== 'object' || Array.isArray(c)) c = a.casino = {};
    c.v = 1;
    if (!c.trophees || typeof c.trophees !== 'object' || Array.isArray(c.trophees)) c.trophees = {};
    for (const k of Object.keys(c.trophees)) if (!TROPHEE[k] || !Number.isFinite(c.trophees[k])) delete c.trophees[k];
    if (typeof c.jour !== 'string') c.jour = '';
    if (!Array.isArray(c.objectifs) || c.objectifs.length !== PAR_JOUR || !c.objectifs.every((o) => o && TYPES[o.type] && Number.isFinite(o.cible) && o.cible >= 1)) { c.objectifs = []; c.jour = ''; }
    for (const o of c.objectifs) { o.progres = Math.min(o.cible, entier(o.progres)); o.fait = !!o.fait || o.progres >= o.cible; if (typeof o.txt !== 'string') o.txt = TYPES[o.type].txt(o.cible); }
    c.faits = entier(c.faits); c.jetonsOr = entier(c.jetonsOr); c.jetonsJour = Math.min(JETONS_JOUR_MAX, entier(c.jetonsJour));
    c.serie = entier(c.serie); c.meilleureSerie = Math.max(c.serie, entier(c.meilleureSerie)); // les victoires de suite, BlackJack et roulette mêlés
    if (!c.skins || typeof c.skins !== 'object') c.skins = {};
    const s = c.skins;
    s.debloques = Array.isArray(s.debloques) ? [...new Set(s.debloques.filter((k) => typeof k === 'string' && (() => { const [cat, id] = k.split(':'); const x = skinDe(cat, id); return x && !x.defaut; })()))] : [];
    if (!s.choisis || typeof s.choisis !== 'object') s.choisis = {};
    for (const cat of CATEGORIES) if (!debloque(c, cat, s.choisis[cat])) s.choisis[cat] = DEFAUTS[cat];
    for (const k of Object.keys(s.choisis)) if (!SKINS[k]) delete s.choisis[k];
    return c;
  }
  function debloque(c, cat, id) { const x = skinDe(cat, id); return !!x && (x.defaut || c.skins.debloques.includes(cleSkin(cat, id))); }

  // les trois objectifs du jour (renouvelés si le jour a changé ; sans jour, ceux qu'on a)
  function objectifs(st, jour) {
    const c = etat(st);
    if (typeof jour === 'string' && jour && c.jour !== jour) { c.jour = jour; c.objectifs = tirerObjectifs(st, jour); c.jetonsJour = 0; }
    return c.objectifs;
  }
  const jourDe = (opts) => (opts && typeof opts.jour === 'string' ? opts.jour : opts && opts.G && typeof opts.G.dayKey === 'function' && Number.isFinite(opts.maintenant) ? opts.G.dayKey(opts.maintenant) : null);
  const seuil = (caisse) => (Number.isFinite(caisse) && caisse >= 0 ? Math.max(MISE_MIN, PART_MIN * caisse) : Infinity); // la mise qui compte : 0,5 % de la caisse, au moins 1 €

  // ─── gagner un trophée : sa récompense (un skin débloqué, ou le titre par GAME.donnerDistinction) ───
  function gagnerTrophee(st, c, id, quand, G, out) {
    if (c.trophees[id]) return;
    const t = TROPHEE[id]; c.trophees[id] = Number.isFinite(quand) && quand > 0 ? quand : 1;
    if (t.recompense.skin) { const k = cleSkin(t.recompense.categorie, t.recompense.skin); if (!c.skins.debloques.includes(k)) c.skins.debloques.push(k); }
    donnerTitre(st, c, G);
    out.trophees.push({ id, nom: t.nom, recompense: t.recompense });
  }
  // le titre : donné avec le trophée ; s'il manque (un trophée gagné sans GAME sous la main), il est rendu à la prochaine main
  function donnerTitre(st, c, G) {
    if (c.trophees['serie-10'] && G && typeof G.donnerDistinction === 'function') G.donnerDistinction(st, TROPHEE['serie-10'].recompense.titre);
  }
  // un objectif avance (de n, ou jusqu'à progres si absolu) ; fini : 1 jeton d'or (4 par jour au plus), les trois finis : +1
  function avancer(c, o, k, n, out, absolu) {
    if (o.fait) return;
    const avant = o.progres;
    o.progres = Math.max(0, Math.min(o.cible, absolu ? n : o.progres + n));
    if (o.progres === avant) return;
    const e = { k, txt: o.txt, progres: o.progres, cible: o.cible, fait: false, nouveau: false };
    if (o.progres >= o.cible) {
      o.fait = true; e.fait = true; e.nouveau = true; c.faits++;
      out.jetons += donnerJetons(c, 1);
      if (c.objectifs.every((x) => x.fait)) out.jetons += donnerJetons(c, BONUS_TROIS);
    }
    out.objectifs.push(e);
  }
  function donnerJetons(c, n) { const x = Math.max(0, Math.min(n, JETONS_JOUR_MAX - c.jetonsJour)); c.jetonsJour += x; c.jetonsOr += x; return x; }
  // la série commune (trophée « Main de velours ») : une victoire l'allonge, une défaite la casse, une égalité ne change rien
  function serieCommune(c, signe) {
    if (signe > 0) { c.serie++; if (c.serie > c.meilleureSerie) c.meilleureSerie = c.serie; } else if (signe < 0) c.serie = 0;
  }
  // l'objectif « série » : les seules mains et tours qui comptent (la mise à 0,5 % de la caisse) l'allongent ou le cassent
  function objectifSerie(c, o, k, signe, out) {
    if (o.fait || !signe) return;
    if (signe > 0) avancer(c, o, k, 1, out); else if (o.progres > 0) { o.progres = 0; out.objectifs.push({ k, txt: o.txt, progres: 0, cible: o.cible, fait: false, nouveau: false }); }
  }
  // les trophées communs, après chaque main et chaque tour
  function communs(st, c, quand, G, out) {
    const a = st.arriere, mains = entier(a.stats && a.stats.mains), tours = entier(a.roulette && a.roulette.stats && a.roulette.stats.tours);
    if (mains + tours >= HABITUE) gagnerTrophee(st, c, 'habitue', quand, G, out);
    if (c.serie >= SERIE_VELOURS) gagnerTrophee(st, c, 'serie-10', quand, G, out);
    if (c.faits >= ASSIDU) gagnerTrophee(st, c, 'assidu', quand, G, out);
    donnerTitre(st, c, G);
  }
  const GAGNANTS = { blackjack: 1, gagne: 1, croupierBrule: 1 };
  const total21 = (cartes) => { let t = 0, as = false; for (const x of cartes) { const h = (x % 13) + 1; t += Math.min(10, h); if (h === 1) as = true; } return as && t + 10 <= 21 ? t + 10 : t; };
  const vide = () => ({ trophees: [], objectifs: [], jetons: 0 });

  // ─── après une main de BlackJack finie (h : st.arriere.main) ; idempotent : h.compte ───
  function apresMain(st, h, opts) {
    const out = vide();
    if (!h || typeof h !== 'object' || !h.fin || h.compte || !Array.isArray(h.joueur)) return out;
    const c = etat(st), o = opts || {}, quand = o.maintenant, jour = jourDe(o);
    objectifs(st, jour); h.compte = true;
    const separee = !!h.separee && Array.isArray(h.mains);
    const main = separee ? h.mains : [{ cartes: h.joueur, resultat: h.resultat }];
    const gagne = !!GAGNANTS[h.resultat], signe = gagne ? 1 : h.resultat === 'egalite' ? 0 : -1;
    serieCommune(c, signe);
    // les trophées du BlackJack (aucun ne regarde la mise)
    if (gagne || main.some((m) => GAGNANTS[m.resultat])) gagnerTrophee(st, c, 'premiere-main', quand, o.G, out);
    if (h.resultat === 'blackjack') gagnerTrophee(st, c, 'blackjack', quand, o.G, out);
    if (main.some((m) => Array.isArray(m.cartes) && m.cartes.length >= 5 && total21(m.cartes) === 21)) gagnerTrophee(st, c, 'cinq-cartes', quand, o.G, out);
    if (separee && h.mains.length === 2 && h.mains.every((m) => GAGNANTS[m.resultat])) gagnerTrophee(st, c, 'partage', quand, o.G, out);
    if (h.double && gagne) gagnerTrophee(st, c, 'double', quand, o.G, out);
    if (Array.isArray(h.annexes) && h.annexes.some((x) => x && x.id === 'paires' && x.combinaison && x.combinaison.type === 'parfaite')) gagnerTrophee(st, c, 'paire-parfaite', quand, o.G, out);
    // les objectifs : la mise de départ (avant un double ou un partage) doit atteindre 0,5 % de la caisse d'avant la donne
    const depart = separee ? (h.mains[0] && h.mains[0].mise) : h.double ? h.mise / 2 : h.mise;
    if (Number.isFinite(depart) && depart >= seuil(h.caisse) - 1e-9 && c.jour === jour) {
      c.objectifs.forEach((ob, k) => {
        if (ob.type === 'mains') avancer(c, ob, k, 1, out);
        else if (ob.type === 'gagnees' && gagne) avancer(c, ob, k, 1, out);
        else if (ob.type === 'blackjack' && h.resultat === 'blackjack') avancer(c, ob, k, 1, out);
        else if (ob.type === 'doubler' && h.double && gagne) avancer(c, ob, k, 1, out);
        else if (ob.type === 'separer' && separee) avancer(c, ob, k, 1, out);
        else if (ob.type === 'serie') objectifSerie(c, ob, k, signe, out);
      });
    }
    communs(st, c, quand, o.G, out);
    return out;
  }

  // ─── une vraie victoire à la roulette : pas un tour « couvert » (35 pleins, rouge + noir…) ───
  // le tour gagne (net > 0) ET ses mises couvrent au plus 18 numéros, ou il rapporte au moins la moitié de sa mise ; sinon, un tour gagnant
  // couvert compte comme une égalité : il n'allonge ni la série ni les objectifs « couleur », « douzaine » et « série », sans les casser
  const ROUGE = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const COUVRE = {
    rouge: (n) => n > 0 && ROUGE.has(n), noir: (n) => n > 0 && !ROUGE.has(n),
    pair: (n) => n > 0 && n % 2 === 0, impair: (n) => n % 2 === 1,
    manque: (n) => n >= 1 && n <= 18, passe: (n) => n >= 19 && n <= 36,
    douzaine: (n, m) => n > 0 && Math.ceil(n / 12) === m.k, colonne: (n, m) => n > 0 && ((n - 1) % 3) + 1 === m.k,
    plein: (n, m) => n === m.n,
  };
  const COUVERTS_MAX = 18, PART_NET = 0.5;
  function couverts(mises) { let k = 0; for (let n = 0; n <= 36; n++) if (mises.some((m) => m && COUVRE[m.type] && COUVRE[m.type](n, m))) k++; return k; }
  function signeTour(tour) {
    if (!(tour.net > 1e-9)) return tour.net < -1e-9 ? -1 : 0;
    return couverts(tour.mises) <= COUVERTS_MAX || (Number.isFinite(tour.mise) && tour.net >= PART_NET * tour.mise - 1e-9) ? 1 : 0;
  }

  // ─── après un tour de roulette (tour : le résultat de ROULETTE.lancer) ; idempotent : tour.compte ───
  function apresTour(st, tour, opts) {
    const out = vide();
    if (!tour || typeof tour !== 'object' || tour.compte || !Array.isArray(tour.mises) || !Number.isInteger(tour.numero)) return out;
    const c = etat(st), o = opts || {}, quand = o.maintenant, jour = jourDe(o);
    objectifs(st, jour); tour.compte = true;
    const signe = signeTour(tour);
    serieCommune(c, signe);
    const pleins = tour.mises.filter((m) => m && m.type === 'plein' && m.gagne);
    if (pleins.length) gagnerTrophee(st, c, 'plein', quand, o.G, out);
    if (pleins.some((m) => m.n === 0)) gagnerTrophee(st, c, 'zero', quand, o.G, out);
    // les objectifs : la mise du tour (ou, pour « couleur » et « douzaine », la mise gagnante de ce genre) doit atteindre 0,5 % de la caisse d'avant ;
    // « couleur » et « douzaine » demandent en plus une vraie victoire (signeTour), pas un tour couvert
    const s = seuil(tour.caisse), somme = (types) => tour.mises.filter((m) => m && m.gagne && types.includes(m.type)).reduce((x, m) => x + (m.mise || 0), 0);
    if (c.jour === jour) {
      const compte = Number.isFinite(tour.mise) && tour.mise >= s - 1e-9;
      c.objectifs.forEach((ob, k) => {
        if (ob.type === 'tours' && compte) avancer(c, ob, k, 1, out);
        else if (ob.type === 'couleur' && signe > 0 && somme(['rouge', 'noir']) >= s - 1e-9) avancer(c, ob, k, 1, out);
        else if (ob.type === 'douzaine' && signe > 0 && somme(['douzaine', 'colonne']) >= s - 1e-9) avancer(c, ob, k, 1, out);
        else if (ob.type === 'serie' && compte) objectifSerie(c, ob, k, signe, out);
      });
    }
    communs(st, c, quand, o.G, out);
    return out;
  }

  // ─── ce que montre le carnet du croupier ───
  function trophees(st) { const c = etat(st); return TROPHEES.map((t) => ({ id: t.id, nom: t.nom, desc: t.desc, jeu: t.jeu, gagne: c.trophees[t.id] || 0, recompense: t.recompense })); }
  const lire = (o, k) => (o && Number.isFinite(o[k]) ? o[k] : 0);
  function stats(st) {
    const a = (st && st.arriere) || {}, b = a.stats || {}, r = (a.roulette && a.roulette.stats) || {};
    const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, lire(o, k)]));
    return {
      blackjack: pick(b, ['mains', 'gagnees', 'perdues', 'egalites', 'solde', 'plusGrosGain', 'serie', 'meilleureSerie', 'blackjacks', 'separees', 'doubles']),
      roulette: pick(r, ['tours', 'gagnes', 'perdus', 'egalites', 'solde', 'plusGrosGain', 'serie', 'meilleureSerie', 'pleins']),
    };
  }
  function skins(st) {
    const c = etat(st), o = {};
    for (const cat of CATEGORIES) o[cat] = SKINS[cat].map((x) => ({ id: x.id, nom: x.nom, debloque: debloque(c, cat, x.id), choisi: c.skins.choisis[cat] === x.id, prix: x.prix || 0, trophee: x.trophee || null, defaut: !!x.defaut }));
    return o;
  }
  const skinChoisi = (st, cat) => (SKINS[cat] ? etat(st).skins.choisis[cat] : null);
  // trouver un skin : 'categorie:id', ou (id, categorie), ou un id seul (celui qui se débloque aux jetons d'or s'il y en a un : 'fournil' = la roulette)
  function trouver(id, cat) {
    if (typeof id !== 'string') return null;
    if (id.includes(':')) { const [c, i] = id.split(':'); return skinDe(c, i) ? { cat: c, x: skinDe(c, i) } : null; }
    if (cat) return skinDe(cat, id) ? { cat, x: skinDe(cat, id) } : null;
    const tous = CATEGORIES.map((c) => ({ cat: c, x: skinDe(c, id) })).filter((y) => y.x);
    return tous.find((y) => y.x.prix) || tous[0] || null;
  }
  function acheterSkin(st, id, categorie) {
    const c = etat(st), t = trouver(id, categorie);
    if (!t) return { ok: false, raison: 'inconnu', jetonsOr: c.jetonsOr };
    if (debloque(c, t.cat, t.x.id)) return { ok: false, raison: 'deja', jetonsOr: c.jetonsOr };
    if (!t.x.prix) return { ok: false, raison: 'trophee', jetonsOr: c.jetonsOr };
    if (c.jetonsOr < t.x.prix) return { ok: false, raison: 'jetons', jetonsOr: c.jetonsOr };
    c.jetonsOr -= t.x.prix; c.skins.debloques.push(cleSkin(t.cat, t.x.id));
    return { ok: true, categorie: t.cat, id: t.x.id, jetonsOr: c.jetonsOr };
  }
  function choisirSkin(st, categorie, id) {
    const c = etat(st);
    if (!SKINS[categorie] || !skinDe(categorie, id)) return { ok: false, raison: 'inconnu' };
    if (!debloque(c, categorie, id)) return { ok: false, raison: 'verrou' };
    c.skins.choisis[categorie] = id; return { ok: true };
  }

  return { PART_MIN, MISE_MIN, JETONS_JOUR_MAX, PAR_JOUR, BONUS_TROIS, HABITUE, SERIE_VELOURS, ASSIDU, TROPHEES, SKINS, CATEGORIES, NOMS_CATEGORIES, DEFAUTS, TYPES,
    palier, seuil, etat, objectifs, apresMain, apresTour, signeTour, trophees, stats, skins, skinChoisi, acheterSkin, choisirSkin, cleSkin };
});
