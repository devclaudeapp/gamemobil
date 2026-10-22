/* LE FOURNIL — l'arrière-salle : les règles du BlackJack caché (pures, sans DOM : tournent aussi dans Node, test/fournil-blackjack.test.js).
   Sabot de six jeux mélangé (re-mélangé passé 75 %), tirer, rester, doubler sur les deux premières cartes ; le croupier tire jusqu'à 17 et
   reste sur 17 souple ; le BlackJack paie 3 pour 2 ; l'égalité rend la mise ; pas d'assurance. Deux mises annexes facultatives,
   posées avant la donne : Perfect Pairs (tes deux cartes) et 21+3 (tes deux cartes et la carte visible du croupier).
   SÉPARER (lot 7, la variante C du repérage) : deux premières cartes de même valeur (10, V, D, R entre eux), une seule fois (deux mains),
   jamais après avoir doublé ; la seconde mise, égale à la première, est prise dans la caisse ; chaque main reçoit sa deuxième carte au
   partage ; as séparés : une carte chacun, puis le croupier ; pas de double après partage ; 21 après partage = une main gagnée 1 pour 1,
   jamais un BlackJack. On joue la main 1, puis la main 2 ; le croupier ne tire que si une main tient debout. Avec la stratégie de base,
   le rendement passe de −0,97 % à −0,60 % (40 millions de mains par variante, repérage du lot 7).
   LE BON COUP (conseil) : la stratégie de base pour ces règles exactes (6 jeux, croupier sur 17 souple, il regarde sous sa carte, double
   sur deux cartes quelconques, pas de double après partage), vérifiée sans un écart sur 7 520 situations contre blackjack-strategy 1.4.0.
   L'ÉCONOMIE : on joue l'argent de la caisse (st.coins), tout ou rien, tapis compris. Les gains et les pertes ne touchent QUE st.coins :
   jamais gagner(), ni la fortune (lifetime, lifetimeRun), ni les étoiles, ni les objectifs, ni les défis, ni les points de boulanger ;
   la fortune publiée au classement (st.lifetime) ne bouge pas d'un centime.
   LE HASARD : crypto.getRandomValues (sinon Math.random), jamais tiré de l'horloge ; le sabot et la main en cours vivent dans la sauvegarde
   (st.arriere) : fermer l'application au milieu d'une main ne rend pas la mise, et recharger ne re-mélange rien. Une nouvelle boutique annule
   la main en cours (GAME.annulerMainArriere) : la mise revient à la caisse d'avant, qui repart à zéro avec elle. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BLACKJACK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const JEUX = 6, CARTES = 52 * JEUX, REMELANGE = 0.75; // le sabot, et la part jouée au-delà de laquelle on le re-mélange avant la donne
  const BJ = 1.5; // le BlackJack naturel paie 3 pour 2
  // les mises annexes : ce que paie chaque combinaison, pour 1 misé (la mise est rendue en plus)
  const PAIRES = { parfaite: 25, couleur: 12, mixte: 5 };
  const VINGT_ET_UN_PLUS_TROIS = { brelanCouleur: 100, quinteCouleur: 40, brelan: 30, quinte: 10, couleur: 5 };
  const NOMS = { parfaite: 'Paire parfaite', couleur: 'Paire de couleur', mixte: 'Paire mixte', brelanCouleur: 'Brelan de même enseigne', quinteCouleur: 'Quinte couleur', brelan: 'Brelan', quinte: 'Quinte', couleurs: 'Couleur' };
  // une carte : un entier de 0 à 51 ; sa hauteur 1 (as) … 13 (roi), son enseigne 0 pique, 1 cœur, 2 carreau, 3 trèfle (cœur et carreau sont rouges)
  const hauteur = (c) => (c % 13) + 1, enseigne = (c) => Math.floor(c / 13) % 4, rouge = (c) => enseigne(c) === 1 || enseigne(c) === 2;
  const ENSEIGNES = ['pique', 'coeur', 'carreau', 'trefle'], SYMBOLES = ['♠', '♥', '♦', '♣'], RANGS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
  const points = (c) => Math.min(10, hauteur(c)); // l'as compte 1 ici ; valeur() le passe à 11 quand c'est possible
  const nomCarte = (c) => `${RANGS[hauteur(c)]}${SYMBOLES[enseigne(c)]}`;

  // ─── le hasard : un nombre de [0, 1) tiré du générateur cryptographique du navigateur (ou de Node), jamais de l'heure ───
  function hasard() {
    try { const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null; if (c && c.getRandomValues) { const a = new Uint32Array(2); c.getRandomValues(a); return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992; } } catch (e) { /* rien */ }
    return Math.random();
  }
  // un sabot neuf : six jeux mélangés (Fisher-Yates)
  function nouveauSabot(rng) {
    const r = rng || hasard, s = [];
    for (let j = 0; j < JEUX; j++) for (let c = 0; c < 52; c++) s.push(c);
    for (let i = s.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); const t = s[i]; s[i] = s[k]; s[k] = t; }
    return s;
  }

  // ─── la valeur d'une main : l'as vaut 11 tant que la main ne dépasse pas 21, sinon 1 ───
  function valeur(main) {
    let t = 0, as = false;
    for (const c of main) { t += points(c); if (hauteur(c) === 1) as = true; }
    const souple = as && t + 10 <= 21;
    return { total: souple ? t + 10 : t, souple, brule: t > 21, blackjack: main.length === 2 && as && t === 11 };
  }
  const estBlackjack = (main) => valeur(main).blackjack;
  const croupierTire = (main) => valeur(main).total < 17; // il tire jusqu'à 17 et reste sur tous les 17, souples compris

  // ─── les mises annexes ───
  function perfectPairs(c1, c2) { // { type, mult } ou null : même hauteur ; même enseigne : parfaite ; même couleur : de couleur ; sinon mixte
    if (hauteur(c1) !== hauteur(c2)) return null;
    const type = enseigne(c1) === enseigne(c2) ? 'parfaite' : rouge(c1) === rouge(c2) ? 'couleur' : 'mixte';
    return { type, mult: PAIRES[type], nom: NOMS[type] };
  }
  function vingtEtUnPlusTrois(c1, c2, c3) { // la meilleure combinaison de poker à trois cartes, ou null
    const h = [c1, c2, c3].map(hauteur).sort((a, b) => a - b), e = [c1, c2, c3].map(enseigne);
    const memeEnseigne = e[0] === e[1] && e[1] === e[2], brelan = h[0] === h[1] && h[1] === h[2];
    const suite = (h[1] === h[0] + 1 && h[2] === h[1] + 1) || (h[0] === 1 && h[1] === 12 && h[2] === 13); // l'as en bas (A-2-3) ou en haut (D-R-A), jamais R-A-2
    const type = brelan && memeEnseigne ? 'brelanCouleur' : suite && memeEnseigne ? 'quinteCouleur' : brelan ? 'brelan' : suite ? 'quinte' : memeEnseigne ? 'couleur' : null;
    return type ? { type, mult: VINGT_ET_UN_PLUS_TROIS[type], nom: NOMS[type === 'couleur' ? 'couleurs' : type] } : null;
  }

  // ─── l'état de l'arrière-salle, dans la sauvegarde ───
  function etat(st) {
    let a = st.arriere;
    if (!a || typeof a !== 'object') a = st.arriere = {};
    if (typeof a.trouvee !== 'boolean') a.trouvee = false; // la porte du fond a été trouvée (la carte du Journal paraît)
    if (typeof a.accueil !== 'boolean') a.accueil = false; // le petit mot de la première fois a été lu
    if (!Array.isArray(a.sabot) || a.sabot.length !== CARTES || !a.sabot.every((c) => Number.isInteger(c) && c >= 0 && c < 52)) { a.sabot = nouveauSabot(); a.pos = 0; }
    if (!Number.isInteger(a.pos) || a.pos < 0 || a.pos > CARTES) a.pos = 0;
    if (a.main !== null && (typeof a.main !== 'object' || !a.main || !Array.isArray(a.main.joueur))) a.main = null;
    if (!a.mises || typeof a.mises !== 'object') a.mises = { main: 0, paires: 0, plus3: 0 }; // les dernières mises posées (pour « même mise »)
    if (a.main && a.main.separee && !mainsOk(a.main)) a.main = null; // un partage abîmé : la main est perdue (elle ne se rejouerait pas)
    if (!a.stats || typeof a.stats !== 'object') a.stats = {};
    for (const k of STATS) if (!Number.isFinite(a.stats[k])) a.stats[k] = 0; // une vieille sauvegarde : les compteurs du lot 7 (série, partages, doubles, 21 à cinq cartes) à zéro
    return a;
  }
  // les statistiques de la salle (st.arriere.stats) ; serie : les mains gagnées de suite (une égalité ne la casse pas), meilleureSerie : la plus longue
  const STATS = ['mains', 'gagnees', 'perdues', 'egalites', 'blackjacks', 'annexes', 'plusGrosGain', 'solde', 'serie', 'meilleureSerie', 'separees', 'doubles', 'cinqCartes'];
  const mainOk = (m) => m && typeof m === 'object' && Array.isArray(m.cartes) && m.cartes.length >= 1 && m.cartes.every((c) => Number.isInteger(c) && c >= 0 && c < 52) && Number.isFinite(m.mise);
  const mainsOk = (h) => Array.isArray(h.mains) && h.mains.length === 2 && h.mains.every(mainOk) && (h.active === 0 || h.active === 1);
  const dejaJoue = (a) => a.pos / CARTES; // la part du sabot déjà sortie
  function tirerCarte(a, rng) { // une carte du sabot ; s'il est vide (une très longue série de mains), on en mélange un neuf
    if (a.pos >= a.sabot.length) { a.sabot = nouveauSabot(rng); a.pos = 0; a.melange = (a.melange || 0) + 1; }
    return a.sabot[a.pos++];
  }
  const fini = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

  // ─── les mises : bornées à la caisse ; tout ou rien possible ───
  // borner : la mise principale et les deux annexes, ramenées à ce que la caisse peut couvrir (l'annexe passe après la principale)
  function borner(st, m) {
    const caisse = fini(st.coins); let main = Math.min(fini(m && m.main), caisse), reste = caisse - main;
    const paires = Math.min(fini(m && m.paires), reste); reste -= paires;
    const plus3 = Math.min(fini(m && m.plus3), reste);
    return { main, paires, plus3, total: main + paires + plus3, tapis: caisse > 0 && main + paires + plus3 >= caisse - 1e-9 };
  }
  const estTapis = (st, m) => borner(st, m).tapis;
  // un jeton : la part de la caisse arrondie à un montant rond (1 %, 10 %, 50 %), au moins 1 € ; le tapis, la caisse entière
  function arrondiJoli(n) { if (!(n > 0)) return 0; if (n < 10) return Math.max(1, Math.floor(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.floor(n / p) * p; }
  function jeton(st, part) { const c = fini(st.coins); return part >= 1 ? c : Math.min(c, arrondiJoli(c * part)); }
  // le pas du réglage fin, à partir d'un montant : un cran « rond » (1, 2, 5 × 10ⁿ) d'environ un vingtième de ce montant, au moins 1 €
  function pas(montant) { const m = Math.max(1, fini(montant) / 20), p = Math.pow(10, Math.floor(Math.log10(m))), r = m / p; return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * p; }
  const MISE_MIN = 1; // il faut au moins 1 € sur la mise principale

  // ─── une main ───
  // distribuer : prend les mises dans la caisse, re-mélange au besoin, donne joueur / croupier / joueur / croupier (la seconde cachée),
  // règle tout de suite les annexes, puis le BlackJack (le croupier regarde sa carte cachée : un BlackJack chez lui finit la main)
  function distribuer(st, mises, rng) {
    const a = etat(st);
    if (a.main && !a.main.fin) return { ok: false, raison: 'main' };
    const m = borner(st, mises);
    if (m.main < MISE_MIN || m.main > fini(st.coins)) return { ok: false, raison: 'mise' };
    let melange = false;
    if (dejaJoue(a) >= REMELANGE) { a.sabot = nouveauSabot(rng); a.pos = 0; melange = true; }
    const caisse = fini(st.coins); // la caisse d'avant les mises (les mini-objectifs du casino comptent une main par sa part de la caisse)
    st.coins = Math.max(0, st.coins - m.total);
    a.mises = { main: m.main, paires: m.paires, plus3: m.plus3 };
    const j = [], c = [];
    j.push(tirerCarte(a, rng)); c.push(tirerCarte(a, rng)); j.push(tirerCarte(a, rng)); c.push(tirerCarte(a, rng));
    const h = { joueur: j, croupier: c, mise: m.main, mises: { paires: m.paires, plus3: m.plus3 }, double: false, cachee: true, fin: false, resultat: null, gain: 0, annexes: [], tapis: m.tapis, debut: m.total, caisse, separee: false, active: 0 };
    a.main = h;
    // les annexes : payées (ou perdues) dès la donne
    const pp = m.paires > 0 ? perfectPairs(j[0], j[1]) : null, p3 = m.plus3 > 0 ? vingtEtUnPlusTrois(j[0], j[1], c[0]) : null;
    if (m.paires > 0) h.annexes.push({ id: 'paires', nom: 'Perfect Pairs', mise: m.paires, combinaison: pp, gain: pp ? m.paires * (pp.mult + 1) : 0 });
    if (m.plus3 > 0) h.annexes.push({ id: 'plus3', nom: '21+3', mise: m.plus3, combinaison: p3, gain: p3 ? m.plus3 * (p3.mult + 1) : 0 });
    for (const x of h.annexes) { st.coins += x.gain; if (x.gain > 0) a.stats.annexes++; }
    a.stats.mains++;
    const bjJ = estBlackjack(j), bjC = estBlackjack(c);
    if (bjJ || bjC) regler(st, bjJ && bjC ? 'egalite' : bjJ ? 'blackjack' : 'croupierBJ');
    return { ok: true, main: h, melange };
  }
  function enCours(st) { const a = etat(st); return a.main && !a.main.fin ? a.main : null; }
  function peutDoubler(st) { const h = enCours(st); return !!h && !h.separee && h.joueur.length === 2 && !h.double && fini(st.coins) >= h.mise; } // pas de double après partage
  const pts = (c) => points(c);
  const paire = (cartes) => cartes.length === 2 && pts(cartes[0]) === pts(cartes[1]); // deux cartes de même valeur : 8 et 8, mais aussi valet et roi
  function peutSeparer(st) { const h = enCours(st); return !!h && !h.separee && !h.double && paire(h.joueur) && fini(st.coins) >= h.mise; }
  function tirer(st, rng) {
    const h = enCours(st); if (!h) return { ok: false };
    const a = etat(st);
    if (h.separee) { // la main active du partage : brûlée ou à 21, elle est finie et l'on passe à la suivante
      const m = h.mains[h.active]; m.cartes.push(tirerCarte(a, rng));
      const v = valeur(m.cartes); if (v.brule || v.total >= 21) m.fin = true;
      avancer(st, rng); return { ok: true, main: h };
    }
    h.joueur.push(tirerCarte(a, rng));
    const v = valeur(h.joueur);
    if (v.brule) regler(st, 'brule'); else if (v.total === 21) jouerCroupier(st, rng); // à 21, on reste d'office
    return { ok: true, main: h };
  }
  function rester(st, rng) {
    const h = enCours(st); if (!h) return { ok: false };
    if (h.separee) { h.mains[h.active].fin = true; avancer(st, rng); return { ok: true, main: h }; }
    jouerCroupier(st, rng); return { ok: true, main: h };
  }
  function doubler(st, rng) { // la mise doublée (prise dans la caisse), une seule carte, puis le croupier
    if (!peutDoubler(st)) return { ok: false };
    const h = enCours(st), a = etat(st);
    st.coins = Math.max(0, st.coins - h.mise); h.mise *= 2; h.double = true; a.stats.doubles++;
    h.joueur.push(tirerCarte(a, rng));
    if (valeur(h.joueur).brule) regler(st, 'brule'); else jouerCroupier(st, rng);
    return { ok: true, main: h };
  }
  // séparer : la paire devient deux mains, chacune avec la mise de départ (la seconde prise dans la caisse) et sa deuxième carte tout de suite ;
  // h.joueur garde la paire d'origine, h.mise la mise totale des deux mains (GAME.annulerMainArriere la rend telle quelle)
  function separer(st, rng) {
    const h = enCours(st);
    if (!h) return { ok: false, raison: 'main' };
    if (h.separee) return { ok: false, raison: 'deja' };
    if (h.double) return { ok: false, raison: 'double' };
    if (!paire(h.joueur)) return { ok: false, raison: 'paire' };
    if (fini(st.coins) < h.mise) return { ok: false, raison: 'caisse' };
    const a = etat(st), mise = h.mise, as = hauteur(h.joueur[0]) === 1;
    st.coins = Math.max(0, st.coins - mise); h.mise = 2 * mise; h.separee = true; h.active = 0; a.stats.separees++;
    h.mains = h.joueur.map((c) => ({ cartes: [c], mise, resultat: null, gain: 0, fin: as, as }));
    for (const m of h.mains) m.cartes.push(tirerCarte(a, rng)); // as séparés : une carte chacun, et c'est tout (fin d'office)
    avancer(st, rng);
    return { ok: true, main: h };
  }
  // la suite d'un partage : une main à 21 reste d'office ; la première main pas finie devient l'active ; les deux finies : le croupier
  function avancer(st, rng) {
    const h = enCours(st); if (!h || !h.separee) return;
    for (const m of h.mains) if (!m.fin && valeur(m.cartes).total >= 21) m.fin = true;
    const k = h.mains.findIndex((m) => !m.fin);
    if (k >= 0) { h.active = k; return; }
    h.active = 1; regler(st, null, rng);
  }
  function jouerCroupier(st, rng) {
    const h = enCours(st), a = etat(st); h.cachee = false;
    while (croupierTire(h.croupier)) h.croupier.push(tirerCarte(a, rng));
    const j = valeur(h.joueur).total, c = valeur(h.croupier);
    regler(st, c.brule ? 'croupierBrule' : j > c.total ? 'gagne' : j < c.total ? 'perdu' : 'egalite');
  }
  // une main face au croupier (déjà joué) : son résultat, sans BlackJack (21 après partage paie 1 pour 1)
  function resultatContre(cartes, croupier) {
    const j = valeur(cartes), c = valeur(croupier);
    return j.brule ? 'brule' : c.brule ? 'croupierBrule' : j.total > c.total ? 'gagne' : j.total < c.total ? 'perdu' : 'egalite';
  }
  const cinq = (cartes) => cartes.length >= 5 && valeur(cartes).total === 21; // 21 avec cinq cartes ou plus
  // le règlement : ce qui revient dans la caisse (mise comprise) ; rien d'autre que st.coins ne bouge.
  // Après un partage (resultat null) : le croupier ne tire que si une main tient debout, chaque main est réglée à part,
  // et h.resultat dit le bilan des deux : 'gagne', 'perdu' ou 'egalite' selon le signe de (leurs gains − h.mise)
  const RETOUR = { blackjack: 1 + BJ, gagne: 2, croupierBrule: 2, egalite: 1, perdu: 0, brule: 0, croupierBJ: 0 };
  function regler(st, resultat, rng) {
    const h = enCours(st), a = etat(st); if (!h) return;
    h.cachee = false;
    if (h.separee) {
      if (h.mains.some((m) => !valeur(m.cartes).brule)) while (croupierTire(h.croupier)) h.croupier.push(tirerCarte(a, rng));
      for (const m of h.mains) { m.fin = true; m.resultat = resultatContre(m.cartes, h.croupier); m.gain = m.mise * RETOUR[m.resultat]; }
      h.gain = h.mains.reduce((s, m) => s + m.gain, 0);
      resultat = h.gain > h.mise + 1e-9 ? 'gagne' : h.gain < h.mise - 1e-9 ? 'perdu' : 'egalite';
    } else h.gain = h.mise * RETOUR[resultat];
    h.fin = true; h.resultat = resultat;
    st.coins += h.gain;
    const annexes = h.annexes.reduce((s, x) => s + x.gain, 0);
    h.net = h.gain + annexes - h.mise - h.annexes.reduce((s, x) => s + x.mise, 0); // le bilan de la main, annexes comprises
    const S = a.stats;
    if (resultat === 'egalite') S.egalites++; else if (RETOUR[resultat] > 1) { S.gagnees++; S.serie++; if (S.serie > S.meilleureSerie) S.meilleureSerie = S.serie; } else { S.perdues++; S.serie = 0; }
    if (resultat === 'blackjack') S.blackjacks++;
    S.cinqCartes += (h.separee ? h.mains.map((m) => m.cartes) : [h.joueur]).filter(cinq).length;
    S.solde += h.net; if (h.net > S.plusGrosGain) S.plusGrosGain = h.net;
  }

  // ─── ce que voit l'écran : les mains du joueur (une, ou deux après partage) et la main active ───
  function mains(h) {
    if (!h || !Array.isArray(h.joueur)) return [];
    if (!h.separee || !Array.isArray(h.mains)) return [{ cartes: h.joueur, mise: h.mise, double: !!h.double, fin: !!h.fin, resultat: h.resultat || null, gain: h.gain || 0, active: !h.fin, as: false }];
    return h.mains.map((m, k) => ({ cartes: m.cartes, mise: m.mise, double: false, fin: !!(m.fin || h.fin), resultat: h.fin ? m.resultat : null, gain: h.fin ? m.gain : 0, active: !h.fin && k === h.active, as: !!m.as }));
  }
  const mainActive = (h) => (h && h.separee && h.active === 1 ? 1 : 0);

  // ─── le bon coup : la stratégie de base de ces règles (le repérage du lot 7, bjsplit.js) ───
  // colonnes : la carte visible du croupier, 2 … 10 puis l'as. H tirer, S rester, D doubler (sinon tirer), T doubler (sinon rester), P séparer,
  // - : la paire se joue comme son total (5-5 : un 10 dur ; 10-10 : un 20 dur)
  const ligne = (t) => Object.freeze(t.split(''));
  const TABLE = Object.freeze({
    dur: Object.freeze({ 5: ligne('HHHHHHHHHH'), 6: ligne('HHHHHHHHHH'), 7: ligne('HHHHHHHHHH'), 8: ligne('HHHHHHHHHH'), 9: ligne('HDDDDHHHHH'), 10: ligne('DDDDDDDDHH'), 11: ligne('DDDDDDDDDH'),
      12: ligne('HHSSSHHHHH'), 13: ligne('SSSSSHHHHH'), 14: ligne('SSSSSHHHHH'), 15: ligne('SSSSSHHHHH'), 16: ligne('SSSSSHHHHH'), 17: ligne('SSSSSSSSSS') }), // 4 et moins : comme 5 ; 17 et plus : rester
    souple: Object.freeze({ 13: ligne('HHHDDHHHHH'), 14: ligne('HHHDDHHHHH'), 15: ligne('HHDDDHHHHH'), 16: ligne('HHDDDHHHHH'), 17: ligne('HDDDDHHHHH'), 18: ligne('STTTTSSHHH'), 19: ligne('SSSSSSSSSS'), 20: ligne('SSSSSSSSSS') }),
    paires: Object.freeze({ 1: ligne('PPPPPPPPPP'), 2: ligne('HHPPPPHHHH'), 3: ligne('HHPPPPHHHH'), 4: ligne('----------'), 5: ligne('----------'), 6: ligne('HPPPPHHHHH'), 7: ligne('PPPPPPHHHH'),
      8: ligne('PPPPPPPPPP'), 9: ligne('PPPPPSPPSS'), 10: ligne('----------') }), // la paire par sa valeur : 1 = deux as, 10 = deux cartes qui valent 10
  });
  const COUPS = { H: 'tirer', S: 'rester', D: 'doubler', P: 'separer' }, VERBES = { tirer: 'Tire', rester: 'Reste', doubler: 'Double', separer: 'Sépare' };
  const nomCol = (up) => (up === 11 ? 'A' : String(up));
  // le coup conseillé pour des cartes face à la carte visible (up : 2 … 11, 11 = l'as) ; doublerOk / separerOk : ce qui est permis
  function coupTable(cartes, up, doublerOk, separerOk) {
    const v = valeur(cartes), k = up - 2;
    if (paire(cartes)) {
      const r = pts(cartes[0]), x = TABLE.paires[r][k];
      if (x === 'P' && separerOk) return { code: 'P', cle: `paire-${r === 1 ? 'A' : r}-${nomCol(up)}` };
    }
    let c, cle;
    if (v.souple && v.total >= 13 && v.total <= 20) { c = TABLE.souple[v.total][k]; cle = `souple-${v.total}-${nomCol(up)}`; }
    else if (v.souple) { c = v.total < 13 ? 'H' : 'S'; cle = `souple-${v.total}-${nomCol(up)}`; }
    else { c = TABLE.dur[Math.max(5, Math.min(17, v.total))][k]; cle = `dur-${v.total}-${nomCol(up)}`; }
    return { code: c === 'D' ? (doublerOk ? 'D' : 'H') : c === 'T' ? (doublerOk ? 'D' : 'S') : c, cle };
  }
  // conseil(st) : null hors d'une main en cours ; sinon { coup, ideal, texte, cle }. ideal : le coup des règles seules (sans regarder la caisse) ;
  // coup : celui qu'on peut jouer (caisse trop courte pour doubler : D tire, T reste ; pour séparer : la paire se joue comme son total)
  function conseil(st) {
    const h = enCours(st); if (!h) return null;
    const cartes = h.separee ? h.mains[h.active].cartes : h.joueur;
    const up = hauteur(h.croupier[0]) === 1 ? 11 : pts(h.croupier[0]);
    const deux = !h.separee && cartes.length === 2 && !h.double;
    const regles = coupTable(cartes, up, deux, deux), ideal = COUPS[regles.code]; // les règles seules (deux cartes, ni partage ni double avant)
    const r = ideal === 'separer' || ideal === 'doubler' ? coupTable(cartes, up, peutDoubler(st), peutSeparer(st)) : regles; // puis la caisse
    const coup = COUPS[r.code];
    const v = valeur(cartes), contre = up === 11 ? 'un as' : `un ${up}`;
    const quoi = regles.cle.startsWith('paire') ? `paire de ${pts(cartes[0]) === 1 ? 'as' : pts(cartes[0])}` : `${v.total} ${v.souple ? 'souple' : 'dur'}`;
    let texte = `${VERBES[coup]} : ${quoi} contre ${contre}.`;
    if (coup !== ideal) texte = `${VERBES[coup]} (${ideal === 'doubler' ? 'doubler' : 'séparer'} si la caisse suivait) : ${quoi} contre ${contre}.`;
    return { coup, ideal, texte: texte.slice(0, 70), cle: regles.cle };
  }
  const MOTS = { blackjack: 'BlackJack !', gagne: 'Gagné !', croupierBrule: 'Gagné !', egalite: 'Égalité', perdu: 'Perdu', brule: 'Perdu', croupierBJ: 'Perdu' };
  const gagnant = (r) => RETOUR[r] > 1;

  return { JEUX, CARTES, REMELANGE, BJ, PAIRES, VINGT_ET_UN_PLUS_TROIS, NOMS, ENSEIGNES, SYMBOLES, RANGS, MISE_MIN, RETOUR, MOTS,
    hauteur, enseigne, rouge, points, nomCarte, hasard, nouveauSabot, valeur, estBlackjack, croupierTire, perfectPairs, vingtEtUnPlusTrois,
    etat, borner, estTapis, jeton, pas, arrondiJoli, distribuer, enCours, peutDoubler, tirer, rester, doubler, gagnant,
    STATS, TABLE, peutSeparer, separer, mains, mainActive, conseil };
});
