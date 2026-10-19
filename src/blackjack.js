/* LE FOURNIL — l'arrière-salle : les règles du BlackJack caché (pures, sans DOM : tournent aussi dans Node, test/fournil-blackjack.test.js).
   Sabot de six jeux mélangé (re-mélangé passé 75 %), tirer, rester, doubler sur les deux premières cartes ; le croupier tire jusqu'à 17 et
   reste sur 17 souple ; le BlackJack paie 3 pour 2 ; l'égalité rend la mise ; ni partage ni assurance. Deux mises annexes facultatives,
   posées avant la donne : Perfect Pairs (tes deux cartes) et 21+3 (tes deux cartes et la carte visible du croupier).
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
    if (!a.stats || typeof a.stats !== 'object') a.stats = { mains: 0, gagnees: 0, perdues: 0, egalites: 0, blackjacks: 0, annexes: 0, plusGrosGain: 0, solde: 0 };
    return a;
  }
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
    st.coins = Math.max(0, st.coins - m.total);
    a.mises = { main: m.main, paires: m.paires, plus3: m.plus3 };
    const j = [], c = [];
    j.push(tirerCarte(a, rng)); c.push(tirerCarte(a, rng)); j.push(tirerCarte(a, rng)); c.push(tirerCarte(a, rng));
    const h = { joueur: j, croupier: c, mise: m.main, mises: { paires: m.paires, plus3: m.plus3 }, double: false, cachee: true, fin: false, resultat: null, gain: 0, annexes: [], tapis: m.tapis, debut: m.total };
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
  function peutDoubler(st) { const h = enCours(st); return !!h && h.joueur.length === 2 && !h.double && fini(st.coins) >= h.mise; }
  function tirer(st, rng) {
    const h = enCours(st); if (!h) return { ok: false };
    const a = etat(st); h.joueur.push(tirerCarte(a, rng));
    const v = valeur(h.joueur);
    if (v.brule) regler(st, 'brule'); else if (v.total === 21) jouerCroupier(st, rng); // à 21, on reste d'office
    return { ok: true, main: h };
  }
  function rester(st, rng) { const h = enCours(st); if (!h) return { ok: false }; jouerCroupier(st, rng); return { ok: true, main: h }; }
  function doubler(st, rng) { // la mise doublée (prise dans la caisse), une seule carte, puis le croupier
    if (!peutDoubler(st)) return { ok: false };
    const h = enCours(st), a = etat(st);
    st.coins = Math.max(0, st.coins - h.mise); h.mise *= 2; h.double = true;
    h.joueur.push(tirerCarte(a, rng));
    if (valeur(h.joueur).brule) regler(st, 'brule'); else jouerCroupier(st, rng);
    return { ok: true, main: h };
  }
  function jouerCroupier(st, rng) {
    const h = enCours(st), a = etat(st); h.cachee = false;
    while (croupierTire(h.croupier)) h.croupier.push(tirerCarte(a, rng));
    const j = valeur(h.joueur).total, c = valeur(h.croupier);
    regler(st, c.brule ? 'croupierBrule' : j > c.total ? 'gagne' : j < c.total ? 'perdu' : 'egalite');
  }
  // le règlement : ce qui revient dans la caisse (mise comprise) ; rien d'autre que st.coins ne bouge
  const RETOUR = { blackjack: 1 + BJ, gagne: 2, croupierBrule: 2, egalite: 1, perdu: 0, brule: 0, croupierBJ: 0 };
  function regler(st, resultat) {
    const h = enCours(st), a = etat(st); if (!h) return;
    h.cachee = false; h.fin = true; h.resultat = resultat;
    h.gain = h.mise * RETOUR[resultat];
    st.coins += h.gain;
    const annexes = h.annexes.reduce((s, x) => s + x.gain, 0);
    h.net = h.gain + annexes - h.mise - h.annexes.reduce((s, x) => s + x.mise, 0); // le bilan de la main, annexes comprises
    const S = a.stats;
    if (resultat === 'egalite') S.egalites++; else if (RETOUR[resultat] > 1) S.gagnees++; else S.perdues++;
    if (resultat === 'blackjack') S.blackjacks++;
    S.solde += h.net; if (h.net > S.plusGrosGain) S.plusGrosGain = h.net;
  }
  const MOTS = { blackjack: 'BlackJack !', gagne: 'Gagné !', croupierBrule: 'Gagné !', egalite: 'Égalité', perdu: 'Perdu', brule: 'Perdu', croupierBJ: 'Perdu' };
  const gagnant = (r) => RETOUR[r] > 1;

  return { JEUX, CARTES, REMELANGE, BJ, PAIRES, VINGT_ET_UN_PLUS_TROIS, NOMS, ENSEIGNES, SYMBOLES, RANGS, MISE_MIN, RETOUR, MOTS,
    hauteur, enseigne, rouge, points, nomCarte, hasard, nouveauSabot, valeur, estBlackjack, croupierTire, perfectPairs, vingtEtUnPlusTrois,
    etat, borner, estTapis, jeton, pas, arrondiJoli, distribuer, enCours, peutDoubler, tirer, rester, doubler, gagnant };
});
