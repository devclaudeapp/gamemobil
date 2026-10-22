/* LE FOURNIL — l'arrière-salle : les règles de la roulette (pures, sans DOM : tournent aussi dans Node, test/fournil-roulette.test.js).
   Roulette européenne, un seul zéro : 37 cases (0 à 36), dans l'ordre d'une vraie roue (ORDRE, le même que la roue 3D d'arriere.js).
   Les mises : rouge / noir, pair / impair, manque (1–18) / passe (19–36) payées 1 pour 1 ; les douzaines et les colonnes 2 pour 1 ;
   le plein (un numéro) 35 pour 1. Le zéro fait perdre toutes les chances simples (pas de « partage », pas de prison). Chaque mise rend
   −1/37 = −2,70 % en moyenne : la maison garde le zéro, rien de plus.
   L'ÉCONOMIE (la même que le BlackJack, src/blackjack.js) : on joue l'argent de la caisse (st.coins), tapis compris ; les gains et les pertes
   ne touchent QUE st.coins : jamais la fortune (lifetime, lifetimeRun), ni les étoiles, ni les points de boulanger, ni les objectifs du jour.
   LE TIRAGE D'ABORD : lancer() tire le numéro (crypto.getRandomValues, sinon Math.random, jamais l'heure), prend les mises et paie les
   gains dans le même appel : rien n'est jamais en suspens. La roue qui tourne à l'écran ne fait que montrer un numéro déjà tiré ; fermer
   l'application pendant l'animation ne change rien, et une nouvelle boutique n'a aucun tour à annuler.
   L'état vit dans la sauvegarde (st.arriere.roulette) : les dernières mises posées (« même mise »), le dernier tour, les douze derniers
   numéros, et les statistiques de la table. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROULETTE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // les 37 cases dans l'ordre de la roue, en partant du zéro et dans le sens des aiguilles d'une montre (vue de dessus)
  const ORDRE = Object.freeze([0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]);
  const ROUGES = Object.freeze([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const ROUGE = new Set(ROUGES);
  const couleur = (n) => (n === 0 ? 'vert' : ROUGE.has(n) ? 'rouge' : 'noir');
  // les mises : ce que paie chacune pour 1 misé (la mise est rendue en plus) et la règle qui dit si un numéro la gagne (le zéro : aucune chance simple)
  const TYPES = Object.freeze({
    rouge: { paie: 1, nom: 'Rouge' }, noir: { paie: 1, nom: 'Noir' },
    pair: { paie: 1, nom: 'Pair' }, impair: { paie: 1, nom: 'Impair' },
    manque: { paie: 1, nom: 'Manque (1–18)' }, passe: { paie: 1, nom: 'Passe (19–36)' },
    douzaine: { paie: 2, nom: 'Douzaine' }, colonne: { paie: 2, nom: 'Colonne' }, plein: { paie: 35, nom: 'Plein' },
  });
  const SIMPLES = ['rouge', 'noir', 'pair', 'impair', 'manque', 'passe'];
  const REGLES = {
    rouge: (n) => n > 0 && ROUGE.has(n), noir: (n) => n > 0 && !ROUGE.has(n),
    pair: (n) => n > 0 && n % 2 === 0, impair: (n) => n % 2 === 1,
    manque: (n) => n >= 1 && n <= 18, passe: (n) => n >= 19 && n <= 36,
    douzaine: (n, m) => n > 0 && Math.ceil(n / 12) === m.k, colonne: (n, m) => n > 0 && ((n - 1) % 3) + 1 === m.k,
    plein: (n, m) => n === m.n,
  };
  const MISE_MIN = 1, MAX_MISES = 40, HISTORIQUE = 12;
  const fini = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const numeroOk = (n) => Number.isInteger(n) && n >= 0 && n <= 36;

  // ─── une mise : { type, k?: 1 | 2 | 3 (douzaine, colonne), n?: 0…36 (plein), mise } ───
  // valide : le type connu, le k ou le n qu'il demande ; rend la mise propre (sans champ en trop), ou null
  function propre(m) {
    if (!m || typeof m !== 'object' || !Object.prototype.hasOwnProperty.call(TYPES, m.type)) return null;
    const o = { type: m.type };
    if (m.type === 'douzaine' || m.type === 'colonne') { if (!(m.k === 1 || m.k === 2 || m.k === 3)) return null; o.k = m.k; }
    if (m.type === 'plein') { if (!numeroOk(m.n)) return null; o.n = m.n; }
    o.mise = fini(m.mise);
    return o;
  }
  const cle = (m) => (m.type === 'douzaine' || m.type === 'colonne' ? `${m.type}-${m.k}` : m.type === 'plein' ? `plein-${m.n}` : m.type);
  const gagne = (m, numero) => !!(m && REGLES[m.type] && numeroOk(numero) && REGLES[m.type](numero, m));
  function couvre(m) { const r = []; for (let n = 0; n <= 36; n++) if (gagne(m, n)) r.push(n); return r; }
  const DOUZAINES = ['', '1re douzaine (1–12)', '2e douzaine (13–24)', '3e douzaine (25–36)'];
  function nomMise(m) {
    if (!m || !TYPES[m.type]) return '';
    if (m.type === 'douzaine') return DOUZAINES[m.k] || 'Douzaine';
    if (m.type === 'colonne') return `Colonne ${m.k}`;
    if (m.type === 'plein') return `Plein ${m.n}`;
    return TYPES[m.type].nom;
  }

  // ─── le hasard : un nombre de [0, 1) tiré du générateur cryptographique du navigateur (ou de Node), jamais de l'heure ───
  function hasard() {
    try { const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null; if (c && c.getRandomValues) { const a = new Uint32Array(2); c.getRandomValues(a); return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992; } } catch (e) { /* rien */ }
    return Math.random();
  }
  function tirer(rng) { const x = (rng || hasard)(); const n = Math.floor((Number.isFinite(x) ? x : 0) * 37); return Math.max(0, Math.min(36, n)); }

  // ─── l'état de la table, dans la sauvegarde (une vieille sauvegarde, ou une abîmée, est remise d'aplomb) ───
  const STATS = ['tours', 'gagnes', 'perdus', 'egalites', 'solde', 'plusGrosGain', 'serie', 'meilleureSerie', 'pleins', 'mise'];
  function etat(st) {
    let a = st.arriere;
    if (!a || typeof a !== 'object') a = st.arriere = {};
    let r = a.roulette;
    if (!r || typeof r !== 'object') r = a.roulette = {};
    if (!Array.isArray(r.mises)) r.mises = [];
    r.mises = r.mises.map(propre).filter((m) => m && m.mise > 0).slice(0, MAX_MISES);
    if (r.dernier !== null && (!r.dernier || typeof r.dernier !== 'object' || !numeroOk(r.dernier.numero))) r.dernier = null;
    r.historique = Array.isArray(r.historique) ? r.historique.filter(numeroOk).slice(-HISTORIQUE) : [];
    if (!r.stats || typeof r.stats !== 'object') r.stats = {};
    for (const k of STATS) if (!Number.isFinite(r.stats[k])) r.stats[k] = 0;
    return r;
  }

  // ─── les mises : fusionnées par case, les invalides retirées, bornées à la caisse dans l'ordre où elles ont été posées ───
  function borner(st, mises) {
    const caisse = fini(st.coins), par = new Map();
    for (const x of Array.isArray(mises) ? mises.slice(0, 500) : []) {
      const m = propre(x); if (!m || !(m.mise > 0)) continue;
      const k = cle(m), d = par.get(k);
      if (d) d.mise += m.mise; else if (par.size < MAX_MISES) par.set(k, m);
    }
    let reste = caisse; const out = [];
    for (const m of par.values()) {
      const v = Math.min(m.mise, reste);
      if (v < MISE_MIN) continue; // moins d'1 € sur une case (la caisse ne suit plus) : la case est retirée
      out.push(Object.assign({}, m, { mise: v })); reste -= v;
    }
    const total = out.reduce((s, m) => s + m.mise, 0);
    return { mises: out, total, tapis: caisse > 0 && total >= caisse - 1e-9 };
  }

  // ─── un tour : le numéro d'abord, puis les mises prises et les gains payés, d'un seul coup ───
  // rng : pour les tests (et le commutateur de test window.__rouletteTirage d'arriere.js) ; quand : l'instant du tour (affichage seulement)
  function lancer(st, mises, rng, quand) {
    const r = etat(st);
    const valides = (Array.isArray(mises) ? mises : []).map(propre).filter((m) => m && m.mise > 0);
    if (!valides.length) return { ok: false, raison: 'vide' };
    const b = borner(st, valides);
    if (!b.mises.length || b.total < MISE_MIN) return { ok: false, raison: 'mise' };
    const numero = tirer(rng); // le tirage d'abord
    const caisse = fini(st.coins);
    st.coins = Math.max(0, st.coins - b.total);
    let gain = 0, pleins = 0;
    const detail = b.mises.map((m) => {
      const g = gagne(m, numero), x = g ? m.mise * (TYPES[m.type].paie + 1) : 0;
      gain += x; if (g && m.type === 'plein') pleins++;
      const o = { type: m.type, mise: m.mise, gagne: g, gain: x };
      if (m.k) o.k = m.k; if (m.type === 'plein') o.n = m.n;
      return o;
    });
    st.coins += gain;
    const net = gain - b.total;
    const tour = { numero, couleur: couleur(numero), mises: detail, mise: b.total, gain, net, caisse, tapis: b.tapis, quand: Number.isFinite(quand) ? quand : 0 };
    r.mises = b.mises.map((m) => Object.assign({}, m)); // « même mise » : les dernières mises posées
    r.dernier = tour;
    r.historique.push(numero); if (r.historique.length > HISTORIQUE) r.historique.splice(0, r.historique.length - HISTORIQUE);
    const S = r.stats;
    S.tours++; S.mise += b.total; S.solde += net; S.pleins += pleins;
    if (net > 1e-9) { S.gagnes++; S.serie++; if (S.serie > S.meilleureSerie) S.meilleureSerie = S.serie; }
    else if (net < -1e-9) { S.perdus++; S.serie = 0; }
    else S.egalites++; // rouge et noir à la fois, par exemple : rien de perdu, la série continue
    if (net > S.plusGrosGain) S.plusGrosGain = net;
    return { ok: true, tour };
  }

  return { ORDRE, ROUGES, TYPES, SIMPLES, MISE_MIN, MAX_MISES, HISTORIQUE, STATS, couleur, cle, couvre, gagne, nomMise, hasard, tirer, etat, borner, lancer };
});
