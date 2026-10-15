/* LE FOURNIL — les activités des événements : trois choses à faire dans la boutique à part d'un événement (la Planque, le Manoir…),
   pour qu'on n'y attende pas seulement le ×6 de présence. Un seul moteur pur, partagé par TOUS les événements du Fournil : chaque fichier
   de règles (src/quartier.js, src/hantee.js, et les suivants) l'équipe d'un appel, avec ses propres fonctions et sa fiche ; l'écran
   (src/evenement.js) les sert sans savoir de quel événement il s'agit. Aucune dépendance au DOM ni à game.js : tourne aussi dans Node.
     1. LES MINI-JEUX (MINI, MOTEURS) : « Le guet » (toucher au bon moment, en rythme), « Le compte » (compter d'un coup d'œil) et « La
        tournée » (tracer au doigt), de 30 à 45 s. Ici, leur logique seule, par pas de temps (l'écran les avance par pas de 1/60 s, comme
        l'Atelier, src/atelier.js) ; une partie payée rapporte, selon le score, jusqu'à MINI.minutes minutes du rythme de référence de
        l'événement (rythme(q) : celui des apprentis, sans la présence) ; trois parties payées par heure (des jetons : MINI.stock, un de
        plus toutes les MINI.periode minutes) et MINI.parJour par jour de Paris ; au-delà, on joue pour le record.
     2. LES CONTRATS DE LA NUIT (contratsDuJour, etatContrats, reclamerContrat) : trois objectifs tirés du jour de Paris (la graine du jour
        et de l'événement : les mêmes pour tout le monde), comptés sur q.stats depuis le premier regard du jour ; chacun se réclame une
        fois : des billets (CONTRATS.minutes minutes du rythme) et, parfois, un boost pour la boulangerie (la réserve st.boosts des paliers :
        l'écran le donne avec GAME.donnerBoostReserve).
     3. LES OPÉRATIONS (OPERATIONS, lancerOperation, ramasserOperation) : un coup de 5, 15 ou 60 min, un seul à la fois, qui tourne même
        hors de l'écran et pendant l'absence (son début et sa fin sont des « maintenant » de l'horloge de confiance, HORLOGE, donnés par
        l'appelant). Le gain est fixé au lancement (une part du rythme × la durée) ; un petit risque, tiré au lancement lui aussi (ni une
        relecture de la sauvegarde ni un retour en arrière ne le relancent), en saisit une partie ; on ramasse à l'ouverture suivante.
   Tout est plafonné, à l'heure ou au jour, et proportionnel au rythme : le marathon simulé (24 h/24, toutes les activités jouées au mieux,
   test/fournil-quartier.test.js et test/fournil-hantee.test.js) reste au moins ×2 sous l'enveloppe du serveur, sans changer le SQL.

   Pour un futur événement : sa fiche déclare `activites` (tout est facultatif, les valeurs par défaut sont ici, DEFAUTS) et son fichier de
   règles appelle, une fois ses fonctions écrites :
     const A = ACTIVITES.equiper({ id, rythme, gagner, note, dayKey, fmt, fenetre, PRODUITS, stats }, FICHE.activites);
   puis A.reparer(q) dans etat() (les vieilles sauvegardes : q.mini, q.contrats, q.operation et les compteurs manquants), q.stats.vendus[i]
   += n à chaque vente, et ...A.api dans ce qu'il exporte. Sa simulation joue les activités avec A.sim (debut, pas, fin). La fiche :
     activites: {
       mini: { minutes, stock, periode, parJour, seuil, plancher },          les réglages des gains (minutes du rythme, jetons, plafond du jour)
       jeux: { guet | compte | tournee: { nom, desc, regles: [3 lignes], consigne, bilan } },  l'habillage des trois mini-jeux
       decor: { motif, fond, sol, accent, accent2, clair, texte },          les couleurs des toiles ; motif : 'quartier', 'hantee' ou autre (formes neutres)
       contrats: { minutes: [facile, moyen, dur], boost: { mult, secs }, chanceBoost, modeles: [ids], textes: { id: (n, produit) => phrase } },
       operations: [{ id, nom, desc, min, part, risque }], saisie,           trois coups (5, 15, 60 min) ; part : du rythme ; risque : la chance d'une saisie
       textes: { mini, contrats, operation, saisie(m), reussite(m), … }     les mots de l'écran (src/evenement.js en a d'autres par défaut)
     } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ACTIVITES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── un hasard déterministe (graine, rang) → [0, 1) : les mini-jeux, les contrats du jour, le risque d'une opération ───
  function alea(graine, k) { let a = ((graine >>> 0) ^ Math.imul((k >>> 0) + 1, 0x9E3779B1)) | 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function hacher(txt) { let h = 2166136261; for (const c of String(txt)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; } // FNV-1a : « 2026-10-15|quartier » → une graine
  const borne = (x, a, b) => Math.max(a, Math.min(b, x));

  // ═══ 1. Les trois mini-jeux : la logique seule (l'écran dessine et lit le doigt) ═══
  // Le guet : un passant (la patrouille, le petit fantôme…) longe la bande de 0 à 1 ; on touche quand il est dans la zone (la lumière du
  // lampadaire, de la lanterne). Pile dedans : « parfait », 3 points et le combo grimpe (un point de plus tous les trois parfaits, jusqu'à 3) ;
  // dans la zone : 1 point ; trop tôt, trop tard ou laissé passer : le combo retombe. Chaque parfait accélère le suivant ; 30 s.
  const GUET = { duree: 30, vitesse: 0.5, accel: 0.035, vmax: 1.15, tol: 0.1, tolMin: 0.055, pause: 0.45, depart: -0.06, plein: 60 };
  const cibleGuet = (g, k) => 0.42 + 0.36 * alea(g, k);
  function guetNouveau(graine) { const g = graine >>> 0; return { jeu: 'guet', graine: g, t: 0, k: 0, x: GUET.depart, vitesse: GUET.vitesse, cible: cibleGuet(g, 0), tol: GUET.tol, phase: 'passe', pause: 0, score: 0, combo: 0, comboMax: 0, parfaits: 0, bons: 0, rates: 0, fini: false }; }
  function guetSuivant(e) { e.k++; e.phase = 'pause'; e.pause = GUET.pause; }
  function guetAvancer(e, dt) {
    if (e.fini) return null; e.t += dt;
    if (e.t >= GUET.duree) { e.fini = true; return { type: 'fin' }; }
    if (e.phase === 'pause') { e.pause -= dt; if (e.pause <= 0) { e.phase = 'passe'; e.x = GUET.depart; e.cible = cibleGuet(e.graine, e.k); e.tol = Math.max(GUET.tolMin, GUET.tol - 0.005 * e.combo); } return null; }
    e.x += e.vitesse * dt;
    if (e.x > e.cible + e.tol) { e.rates++; e.combo = 0; e.vitesse = Math.max(GUET.vitesse, e.vitesse - GUET.accel); guetSuivant(e); return { type: 'passe' }; } // laissé passer
    return null;
  }
  function guetToucher(e) {
    if (e.fini || e.phase !== 'passe') return null;
    const d = Math.abs(e.x - e.cible);
    if (d <= e.tol * 0.4) { e.combo++; e.comboMax = Math.max(e.comboMax, e.combo); e.parfaits++; const pts = 3 + Math.min(3, Math.floor(e.combo / 3)); e.score += pts; e.vitesse = Math.min(GUET.vmax, e.vitesse + GUET.accel); guetSuivant(e); return { type: 'parfait', pts, combo: e.combo }; }
    if (d <= e.tol) { e.bons++; e.score += 1; guetSuivant(e); return { type: 'bon', pts: 1, combo: e.combo }; }
    e.rates++; e.combo = 0; guetSuivant(e); return { type: e.x < e.cible ? 'tot' : 'tard', pts: 0, combo: 0 };
  }
  const guetBilan = (e) => ({ parfaits: e.parfaits, bons: e.bons, rates: e.rates, comboMax: e.comboMax });

  // Le compte : des objets (billets, bonbons…) s'étalent un instant, puis quatre nombres : le bon compte, vite. 2 points, +1 sous 1,5 s,
  // +1 dès trois bons d'affilée ; une erreur ou 5 s sans réponse : la série retombe. Plus on avance, plus il y en a et moins on les voit ; 40 s.
  const COMPTE = { duree: 40, montre: 1.7, montreMin: 0.9, choix: 5, verdict: 0.7, min: 3, max: 12, plein: 32 };
  const montreCompte = (k) => Math.max(COMPTE.montreMin, COMPTE.montre - 0.07 * k);
  function compteManche(graine, k) { // n objets écartés dans le carré unité (x, y, variante, angle) et quatre réponses, en ordre croissant
    let j = 0; const r = () => alea(graine, k * 977 + (j++));
    const n = Math.min(COMPTE.max, COMPTE.min + Math.floor(r() * 4) + Math.floor(k / 2)), objets = [];
    for (let essai = 0; objets.length < n && essai < 600; essai++) {
      const x = 0.1 + 0.8 * r(), y = 0.12 + 0.76 * r(), ecart = essai < 300 ? 0.17 : 0.12;
      if (objets.every((o) => Math.hypot(o[0] - x, o[1] - y) >= ecart)) objets.push([x, y, Math.floor(r() * 3), (r() - 0.5) * 0.9]);
    }
    const vrai = objets.length, autres = [vrai - 2, vrai - 1, vrai + 1, vrai + 2].filter((v) => v >= 1);
    while (autres.length > 3) autres.splice(Math.floor(r() * autres.length), 1);
    return { n: vrai, objets, choix: [vrai].concat(autres).sort((a, b) => a - b) };
  }
  function compteNouveau(graine) { const g = graine >>> 0; return { jeu: 'compte', graine: g, t: 0, k: 0, phase: 'montre', reste: montreCompte(0), manche: compteManche(g, 0), score: 0, bons: 0, rates: 0, serie: 0, serieMax: 0, dernier: null, fini: false }; }
  function compteAvancer(e, dt) {
    if (e.fini) return null; e.t += dt;
    if (e.t >= COMPTE.duree && e.phase !== 'verdict') { e.fini = true; return { type: 'fin' }; } // le temps est écoulé : la manche en cours ne compte pas
    e.reste -= dt; if (e.reste > 0) return null;
    if (e.phase === 'montre') { e.phase = 'choix'; e.reste = COMPTE.choix; return { type: 'choix' }; }
    if (e.phase === 'choix') { e.rates++; e.serie = 0; e.dernier = { ok: false, v: null, n: e.manche.n }; e.phase = 'verdict'; e.reste = COMPTE.verdict; return { type: 'temps' }; }
    if (e.t >= COMPTE.duree) { e.fini = true; return { type: 'fin' }; }
    e.k++; e.manche = compteManche(e.graine, e.k); e.phase = 'montre'; e.reste = montreCompte(e.k); return { type: 'manche' };
  }
  function compteRepondre(e, v) {
    if (e.fini || e.phase !== 'choix') return null;
    const ok = Number(v) === e.manche.n; let pts = 0;
    if (ok) { e.bons++; e.serie++; e.serieMax = Math.max(e.serieMax, e.serie); pts = 2 + (COMPTE.choix - e.reste < 1.5 ? 1 : 0) + (e.serie >= 3 ? 1 : 0); e.score += pts; }
    else { e.rates++; e.serie = 0; }
    e.dernier = { ok, v: Number(v), n: e.manche.n }; e.phase = 'verdict'; e.reste = COMPTE.verdict;
    return { ok, pts, n: e.manche.n };
  }
  const compteBilan = (e) => ({ bons: e.bons, rates: e.rates, serieMax: e.serieMax });

  // La tournée : six arrêts numérotés ; on les relie au doigt, dans l'ordre (un trait peut s'interrompre et reprendre). 10 points par
  // arrêt, et quand la tournée est bouclée, un point par seconde qui reste ; trois tournées de 12 s au plus.
  const TOURNEE = { tournees: 3, parTournee: 12, arrets: 6, rayon: 0.075, verdict: 1, plein: 150 };
  function tourneeArrets(graine, k) { // six arrêts dans [0,1]², assez loin les uns des autres, chacun à une distance raisonnable du précédent
    let j = 0; const r = () => alea(graine, 5000 + k * 977 + (j++)), pts = [[0.12 + 0.3 * r(), 0.12 + 0.76 * r()]];
    for (let essai = 0; pts.length < TOURNEE.arrets && essai < 800; essai++) {
      const p = [0.1 + 0.8 * r(), 0.1 + 0.8 * r()], der = pts[pts.length - 1], d = Math.hypot(p[0] - der[0], p[1] - der[1]);
      if (d >= 0.2 && d <= (essai < 500 ? 0.48 : 0.75) && pts.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) >= 0.19)) pts.push(p);
    }
    while (pts.length < TOURNEE.arrets) pts.push([0.15 + 0.7 * r(), 0.15 + 0.7 * r()]); // (jamais en pratique)
    return pts;
  }
  function tourneeNouvelle(graine) { const g = graine >>> 0; return { jeu: 'tournee', graine: g, t: 0, k: 0, arrets: tourneeArrets(g, 0), suivant: 0, reste: TOURNEE.parTournee, phase: 'trace', pause: 0, score: 0, notes: [], fini: false }; }
  function tourneeNoter(e, bouclee) { const bonus = bouclee ? Math.ceil(Math.max(0, e.reste)) : 0; e.score += bonus; e.notes.push({ arrets: e.suivant, bonus }); e.phase = 'verdict'; e.pause = TOURNEE.verdict; return { type: 'tournee', arrets: e.suivant, bonus, bouclee }; }
  function tourneeAvancer(e, dt) {
    if (e.fini) return null; e.t += dt;
    if (e.phase === 'trace') { e.reste -= dt; return e.reste <= 0 ? tourneeNoter(e, false) : null; }
    e.pause -= dt; if (e.pause > 0) return null;
    e.k++; if (e.k >= TOURNEE.tournees) { e.fini = true; return { type: 'fin' }; }
    e.arrets = tourneeArrets(e.graine, e.k); e.suivant = 0; e.reste = TOURNEE.parTournee; e.phase = 'trace'; return { type: 'nouvelle' };
  }
  const distSegment = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = l2 > 0 ? borne(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0; return Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]); };
  function tourneeTracer(e, a, b) { // le doigt est passé de a à b (coordonnées du carré unité) : les arrêts touchés dans l'ordre
    if (e.fini || e.phase !== 'trace') return null; b = b || a; const out = { arrets: 0, bouclee: false };
    while (e.suivant < e.arrets.length && distSegment(e.arrets[e.suivant], a, b) <= TOURNEE.rayon) { e.suivant++; e.score += 10; out.arrets++; }
    if (e.suivant >= e.arrets.length) { out.bouclee = true; out.note = tourneeNoter(e, true); }
    return out.arrets ? out : null;
  }
  const tourneeBilan = (e) => ({ notes: e.notes.slice(), arrets: e.notes.reduce((s, x) => s + x.arrets, 0) });

  const MOTEURS = {
    guet: { regles: GUET, nouveau: guetNouveau, avancer: guetAvancer, toucher: guetToucher, bilan: guetBilan },
    compte: { regles: COMPTE, nouveau: compteNouveau, avancer: compteAvancer, repondre: compteRepondre, manche: compteManche, bilan: compteBilan },
    tournee: { regles: TOURNEE, nouveau: tourneeNouvelle, avancer: tourneeAvancer, tracer: tourneeTracer, arrets: tourneeArrets, bilan: tourneeBilan },
  };

  // ═══ les valeurs par défaut d'une fiche (un futur événement n'a rien à déclarer pour avoir les trois activités) ═══
  const DEFAUTS = {
    // une partie parfaite paie 4 min du rythme (au prorata du score, rien sous 10 %) ; 3 jetons, un de plus toutes les 20 min ; 12 parties payées par jour
    mini: { minutes: 4, stock: 3, periode: 20, parJour: 12, seuil: 0.1, plancher: 20, reussi: 0.5, desLeJour: 2 },
    jeux: {
      guet: { nom: 'Le guet', desc: 'Touche quand il passe dans la lumière.', regles: ['Quelqu’un longe la rue : touche quand il passe dans la lumière.', 'Pile au milieu : parfait, et le combo grimpe.', 'Trop tôt ou trop tard, le combo retombe. Ça accélère !'], consigne: 'Touche quand il est dans la lumière !' },
      compte: { nom: 'Le compte', desc: 'Compte d’un coup d’œil.', regles: ['Des objets s’étalent une seconde à peine.', 'Combien y en avait-il ? Touche le bon nombre.', 'Vite et juste : la série rapporte plus.'], consigne: 'Combien ?', objets: 'objets' },
      tournee: { nom: 'La tournée', desc: 'Relie les arrêts au doigt, dans l’ordre.', regles: ['Six arrêts numérotés : relie-les au doigt, dans l’ordre.', 'Tu peux lever le doigt et reprendre là où tu t’es arrêté.', 'Trois tournées de douze secondes : plus tu es rapide, plus ça paie.'], consigne: 'Relie les arrêts dans l’ordre !' },
    },
    decor: { motif: '', fond: '#2E2B3A', sol: '#3F3A50', accent: '#FFC84A', accent2: '#5FD3A4', clair: '#C7B8FF', texte: '#FFF7EC' },
    // trois contrats par jour : facile, moyen, dur ; le dur donne une fois sur deux un boost de 15 min pour la boulangerie
    contrats: { minutes: [5, 8, 12], boost: { mult: 2, secs: 900 }, chanceBoost: 0.5, modeles: null, textes: {} },
    // les opérations : un seul coup à la fois ; le gain, une part du rythme pendant la durée ; le risque : la moitié saisie
    operations: [
      { id: 'court', nom: 'Le petit coup', desc: 'Vite fait, presque sans risque.', min: 5, part: 0.15, risque: 0.05 },
      { id: 'moyen', nom: 'Le coup du quart d’heure', desc: 'Un peu plus long, un peu plus risqué.', min: 15, part: 0.15, risque: 0.1 },
      { id: 'long', nom: 'Le gros coup', desc: 'Une heure, le meilleur gain, le plus de risque.', min: 60, part: 0.2, risque: 0.15 },
    ],
    saisie: 0.5,
    textes: {},
  };
  // les modèles de contrats : une statistique de q.stats, trois exigences (facile, moyen, dur) ; « vente » vise un des trois premiers produits
  const MODELES = {
    descentes: { stat: 'descentes', n: [2, 3, 5], texte: (n) => `Réussis ${n} coup${n > 1 ? 's' : ''} de pouce à toucher` },
    grosClients: { stat: 'grosClients', n: [1, 2, 3], texte: (n) => `Livre ${n} grosse${n > 1 ? 's' : ''} commande${n > 1 ? 's' : ''}` },
    scooters: { stat: 'scooters', n: [1, 2, 3], texte: (n) => `Attrape ${n} bonus au vol` },
    soirees: { stat: 'soirees', n: [1, 2, 3], texte: (n) => `Profite de ${n} fête${n > 1 ? 's' : ''} jusqu’au bout` },
    vente: { stat: 'vendus', n: [1, 2, 4], parProduit: [300, 120, 40], texte: (n, p) => `Vends ${n} ${p ? p.pl : 'produits'}` },
    mini: { stat: 'miniReussis', n: [1, 2, 4], texte: (n) => `Réussis ${n} mini-jeu${n > 1 ? 'x' : ''} (la moitié des points au moins)` },
    operation: { stat: 'operations', n: [1, 2, 3], texte: (n) => `Réussis ${n} opération${n > 1 ? 's' : ''} sans saisie` },
  };
  const STATS = ['miniParties', 'miniReussis', 'operations', 'operationsSaisies', 'contrats']; // les compteurs que les activités ajoutent à q.stats

  // ═══ équiper un événement : ses fonctions (R) et sa fiche → l'API des activités ═══
  function equiper(R, fiche) {
    const f = fiche || {}, id = R.id || 'evenement';
    const MINI = Object.assign({}, DEFAUTS.mini, f.mini || {});
    MINI.jeux = ['guet', 'compte', 'tournee'].map((jid) => { const h = Object.assign({}, DEFAUTS.jeux[jid], (f.jeux || {})[jid] || {}), r = MOTEURS[jid].regles;
      return Object.assign(h, { id: jid, court: h.court || h.nom, duree: jid === 'tournee' ? r.tournees * r.parTournee : r.duree, plein: r.plein }); });
    MINI.decor = Object.assign({}, DEFAUTS.decor, f.decor || {});
    const CONTRATS = Object.assign({}, DEFAUTS.contrats, f.contrats || {}); CONTRATS.textes = Object.assign({}, (f.contrats || {}).textes || {});
    const OPERATIONS = (f.operations || DEFAUTS.operations).map((o, k) => Object.assign({}, DEFAUTS.operations[k] || DEFAUTS.operations[0], o));
    const SAISIE = f.saisie != null ? f.saisie : DEFAUTS.saisie;
    const TEXTES = Object.assign({}, DEFAUTS.textes, f.textes || {});
    const jeuMini = (jid) => MINI.jeux.find((j) => j.id === jid) || null;
    const arrondi = R.arrondi || ((n) => Math.round(n));
    // le jour de l'ouverture (une demi-journée), les activités ne paient pas encore : c'est là que l'économie de l'événement grimpe le plus
    // vite (tout le monde part de zéro), et le moindre gain en plus s'y multiplie (l'enveloppe du serveur) ; elles ouvrent le lendemain à minuit
    const ouvertes = (now) => !R.fenetre || R.fenetre(Number.isFinite(now) ? now : 0).jour >= MINI.desLeJour;
    const minutesDe = (q, minutes) => arrondi(Math.max(MINI.plancher, R.rythme(q) * minutes * 60)); // N minutes du rythme de référence, maintenant

    // ─── l'état : q.mini, q.contrats, q.operation, et les compteurs de q.stats (une vieille sauvegarde se relit sans rien perdre) ───
    const zero = () => ({ guet: 0, compte: 0, tournee: 0 });
    const miniNeuf = () => ({ jour: '', payees: 0, gains: 0, jetons: MINI.stock, recharge: 0, records: zero(), parties: zero() });
    function reparer(q) {
      const m = q.mini && typeof q.mini === 'object' ? q.mini : (q.mini = miniNeuf());
      for (const k of ['records', 'parties']) { if (!m[k] || typeof m[k] !== 'object') m[k] = zero(); for (const j of MINI.jeux) if (!(Number(m[k][j.id]) >= 0)) m[k][j.id] = 0; }
      if (!(m.payees >= 0)) m.payees = 0; if (!(m.gains >= 0)) m.gains = 0; if (!(m.jetons >= 0)) m.jetons = MINI.stock; if (!Number.isFinite(m.recharge)) m.recharge = 0; if (typeof m.jour !== 'string') m.jour = '';
      if (!q.contrats || typeof q.contrats !== 'object' || !Array.isArray(q.contrats.reclames)) q.contrats = { jour: '', base: {}, reclames: [] };
      if (q.operation && (typeof q.operation !== 'object' || !Number.isFinite(q.operation.fin) || !OPERATIONS.some((o) => o.id === q.operation.id))) q.operation = null;
      if (q.operation === undefined) q.operation = null;
      const s = q.stats; if (s && typeof s === 'object') { for (const k of STATS) if (!(s[k] >= 0)) s[k] = 0; if (!Array.isArray(s.vendus)) s.vendus = []; while (s.vendus.length < R.PRODUITS.length) s.vendus.push(0); }
      return q;
    }

    // ─── 1. les mini-jeux : les jetons (3 par heure), le plafond du jour de Paris, les records ───
    function miniDuJour(q, now) { // remet les jetons à l'heure (sur le « maintenant » de confiance) et le compteur du jour à minuit, heure de Paris
      reparer(q); const m = q.mini, per = MINI.periode * 60e3, t = Number.isFinite(now) ? now : 0;
      const key = R.dayKey(t); if (m.jour !== key) { m.jour = key; m.payees = 0; m.gains = 0; }
      if (!(m.recharge > 0)) m.recharge = t;
      if (t < m.recharge) return m; // une heure qui recule ne rend rien (et ne recule pas la recharge)
      if (m.jetons >= MINI.stock) { m.jetons = MINI.stock; m.recharge = t; }
      else { const n = Math.floor((t - m.recharge) / per); if (n > 0) { m.jetons = Math.min(MINI.stock, m.jetons + n); m.recharge = m.jetons >= MINI.stock ? t : m.recharge + n * per; } }
      return m;
    }
    function jetonsMini(q, now) { // ce que l'écran affiche : jetons, prochain jeton dans (ms), parties payées du jour
      const m = miniDuJour(q, now), plafond = m.payees >= MINI.parJour;
      return { jetons: m.jetons, stock: MINI.stock, prochain: m.jetons >= MINI.stock ? 0 : Math.max(0, m.recharge + MINI.periode * 60e3 - now), payees: m.payees, parJour: MINI.parJour, gains: m.gains, plafond, ouvertes: ouvertes(now), payable: !plafond && m.jetons >= 1 && ouvertes(now) };
    }
    const qualiteMini = (jid, score) => { const j = jeuMini(jid); return j ? borne((Number(score) || 0) / j.plein, 0, 1) : 0; };
    const primePleineMini = (q) => minutesDe(q, MINI.minutes); // ce que paie une partie parfaite, maintenant
    const primeMini = (q, jid, score) => { const k = qualiteMini(jid, score); return k < MINI.seuil ? 0 : arrondi(primePleineMini(q) * k); };
    function finirMini(q, jid, score, now) { // une partie terminée (l'heure de confiance lue à la fin seulement) : le record, puis la prime s'il reste un jeton
      const j = jeuMini(jid); if (!j) return { ok: false };
      const m = miniDuJour(q, now), s = Math.max(0, Math.min(j.plein * 10, Math.floor(Number.isFinite(Number(score)) ? Number(score) : 0)));
      const ancien = m.records[jid] || 0, record = s > ancien; if (record) m.records[jid] = s;
      m.parties[jid]++; q.stats.miniParties++;
      const qualite = qualiteMini(jid, s); if (qualite >= MINI.reussi) q.stats.miniReussis++;
      const pourLeRecord = m.payees >= MINI.parJour || m.jetons < 1 || !ouvertes(now), prime = pourLeRecord ? 0 : primeMini(q, jid, s);
      if (prime > 0) { if (m.jetons >= MINI.stock) m.recharge = now; m.jetons--; m.payees++; m.gains += prime; R.gagner(q, prime); R.note(q, `${j.nom} : ${s} points, +${R.fmt(prime)}`); }
      return { ok: true, id: jid, score: s, record, ancien, prime, qualite, reussi: qualite >= MINI.reussi, pourLeRecord, ferme: !ouvertes(now), plafond: m.payees >= MINI.parJour, jetons: m.jetons, payees: m.payees };
    }

    // ─── 2. les contrats de la nuit : trois par jour de Paris, les mêmes pour tous (la graine du jour et de l'événement) ───
    const jourDe = (x) => (typeof x === 'string' ? x : R.dayKey(Number.isFinite(x) ? x : 0));
    function contratsDuJour(x) { // → [{ k, modele, stat, n, produit, texte, minutes, boost }] : facile, moyen, dur
      const jour = jourDe(x), g = hacher(`${jour}|${id}`), ids = (CONTRATS.modeles || Object.keys(MODELES)).filter((m) => MODELES[m]);
      const pris = []; for (let j = 0; pris.length < 3 && j < 50; j++) { const m = ids[Math.floor(alea(g, j) * ids.length)]; if (!pris.includes(m)) pris.push(m); }
      const f = R.fenetre ? R.fenetre(Date.parse(jour + 'T12:00:00Z')) : null, rang = f && f.jour > 0 ? f.jour : 1; // le jour de l'événement (1 : le premier, où l'on part de zéro)
      return pris.map((modele, k) => {
        const M = MODELES[modele];
        let n = M.n[k], produit = null;
        if (modele === 'vente') { produit = Math.floor(alea(g, 90) * Math.min(3, R.PRODUITS.length)); n = Math.round(M.parProduit[produit] * M.n[k] * (rang <= 1 ? 0.5 : 1)); }
        const p = produit != null ? R.PRODUITS[produit] : null, txt = CONTRATS.textes[modele] || M.texte;
        const boost = k === 2 && alea(g, 77) < CONTRATS.chanceBoost ? Object.assign({}, CONTRATS.boost) : null;
        return { k, modele, stat: M.stat, n, produit, texte: txt(n, p), minutes: CONTRATS.minutes[k], boost };
      });
    }
    const valeurStat = (q, c) => { const s = q.stats || {}; return c.produit != null ? Number((s.vendus || [])[c.produit]) || 0 : Number(s[c.stat]) || 0; };
    const cleBase = (c) => (c.produit != null ? `vendus${c.produit}` : c.stat);
    function contratsActuels(q, now) { // le jour roule : les contrats d'hier s'effacent, les compteurs repartent de ce qui est déjà fait
      reparer(q); const jour = R.dayKey(Number.isFinite(now) ? now : 0), C = q.contrats, liste = contratsDuJour(jour);
      if (C.jour !== jour) { C.jour = jour; C.base = {}; C.reclames = [false, false, false]; for (const c of liste) C.base[cleBase(c)] = valeurStat(q, c); }
      return liste;
    }
    function etatContrats(q, now) { // → les trois, avec leur avancée, s'ils sont prêts ou déjà réclamés, et ce qu'ils paieraient maintenant ([] le jour de l'ouverture)
      if (!ouvertes(now)) return [];
      const liste = contratsActuels(q, now), C = q.contrats;
      return liste.map((c) => { const fait = Math.max(0, Math.min(c.n, valeurStat(q, c) - (C.base[cleBase(c)] || 0))), reclame = !!C.reclames[c.k];
        return Object.assign({}, c, { fait, pret: fait >= c.n && !reclame, reclame, prime: minutesDe(q, c.minutes) }); });
    }
    const aReclamer = (q, now) => etatContrats(q, now).filter((c) => c.pret).length;
    function reclamerContrat(q, k, now) { // une fois chacun : la prime (minutes du rythme, maintenant) ; le boost, l'écran le met dans la réserve de la boulangerie
      const c = etatContrats(q, now).find((x) => x.k === k);
      if (!c || !c.pret) return { ok: false, deja: !!(c && c.reclame) };
      q.contrats.reclames[k] = true; R.gagner(q, c.prime); q.stats.contrats++; if (c.boost) q.boosts = (q.boosts || 0) + 1;
      R.note(q, `Contrat rempli : ${c.texte}, +${R.fmt(c.prime)}`);
      return { ok: true, contrat: c, prime: c.prime, boost: c.boost };
    }

    // ─── 3. les opérations : une à la fois, même hors de l'écran et pendant l'absence ───
    const operation = (oid) => OPERATIONS.find((o) => o.id === oid) || null;
    const gainOperation = (q, o) => arrondi(Math.max(MINI.plancher, R.rythme(q) * o.part * o.min * 60));
    function lancerOperation(q, oid, now, rnd) { // le gain et le risque sont fixés au lancement ; refusé si une autre tourne, ou si l'événement ferme avant la fin
      reparer(q); const o = operation(oid); if (!o) return { ok: false };
      if (q.operation) return { ok: false, occupe: true };
      if (!ouvertes(now)) return { ok: false, ferme: true };
      const f = R.fenetre ? R.fenetre(now) : null; if (f && (!f.ouvert || f.reste < o.min * 60e3)) return { ok: false, tard: true };
      const gain = gainOperation(q, o), tirage = typeof rnd === 'function' ? rnd() : alea(hacher(`${now}|${oid}|${id}`), q.stats.operations + q.stats.operationsSaisies);
      const saisi = tirage < o.risque ? arrondi(gain * SAISIE) : 0;
      q.operation = { id: oid, debut: now, fin: now + o.min * 60e3, gain, saisi };
      return { ok: true, op: q.operation, o };
    }
    function etatOperation(q, now) { // → null, ou { op, o, reste (ms), finie }
      reparer(q); const op = q.operation; if (!op) return null;
      return { op, o: operation(op.id), reste: Math.max(0, op.fin - now), finie: now >= op.fin, part: borne((now - op.debut) / Math.max(1, op.fin - op.debut), 0, 1) };
    }
    function ramasserOperation(q, now) { // finie (sur le « maintenant » de confiance) : le gain, moins la saisie ; une seule fois
      const e = etatOperation(q, now); if (!e || !e.finie) return null;
      const op = e.op, net = Math.max(0, op.gain - op.saisi); q.operation = null;
      if (net > 0) R.gagner(q, net);
      if (op.saisi > 0) { q.stats.operationsSaisies++; R.note(q, `${e.o.nom} : ${R.fmt(op.saisi)} saisis, +${R.fmt(net)}`); }
      else { q.stats.operations++; R.note(q, `${e.o.nom} : +${R.fmt(net)}`); }
      return { op, o: e.o, gain: op.gain, saisi: op.saisi, net };
    }

    // ─── la simulation (src/quartier.js, src/hantee.js : simuler) : les activités jouées comme ce profil les jouerait ───
    // qualite : la part du score plein d'une partie ; mini : joue dès qu'un jeton est là ; op : l'opération lancée (la plus longue) ; on
    // réclame les contrats dès qu'ils sont prêts. Le marathon et le très actif jouent tout au mieux (le pire cas de l'enveloppe).
    const POLITIQUES = {
      marathon: { qualite: 1, op: 'long' }, tresactif: { qualite: 1, op: 'long' },
      assidu: { qualite: 0.8, op: 'long' }, quotidien: { qualite: 0.7, op: 'long' }, occasionnel: { qualite: 0.6, op: 'long' },
    };
    const politique = (profil) => POLITIQUES[profil] || POLITIQUES.assidu;
    const sim = {
      pas(q, now, pol, rnd, s) { // toutes les 20 s de jeu : ramasser, relancer, une partie si un jeton attend (une par minute au plus), les contrats prêts
        if (!pol) return; rnd = rnd || Math.random;
        const e = etatOperation(q, now); if (e && e.finie) ramasserOperation(q, now);
        if (!q.operation && pol.op) lancerOperation(q, pol.op, now, rnd);
        const m = jetonsMini(q, now);
        if (m.payable && !(now - (q.mini.derniere || 0) < 60e3)) { const j = MINI.jeux[Math.floor(rnd() * MINI.jeux.length)]; q.mini.derniere = now; finirMini(q, j.id, j.plein * Math.min(1, pol.qualite * (0.9 + 0.2 * rnd())), now); }
        for (const c of etatContrats(q, now)) if (c.pret) reclamerContrat(q, c.k, now);
      },
      fin(q, now, pol, rnd) { if (!pol) return; const e = etatOperation(q, now); if (e && e.finie) ramasserOperation(q, now); if (!q.operation && pol.op) lancerOperation(q, pol.op, now, rnd || Math.random); }, // en partant : une opération pour l'absence
    };

    const api = { activitesOuvertes: ouvertes, MINI, MOTEURS, OPERATIONS, CONTRATS, SAISIE, TEXTES_ACTIVITES: TEXTES, jeuMini, miniDuJour, jetonsMini, qualiteMini, primePleineMini, primeMini, finirMini,
      contratsDuJour, etatContrats, aReclamer, reclamerContrat, operation, gainOperation, lancerOperation, etatOperation, ramasserOperation };
    return Object.assign({ api, reparer, sim, politique }, api);
  }

  return { equiper, MOTEURS, DEFAUTS, MODELES, STATS, GUET, COMPTE, TOURNEE, alea, hacher };
});
