/* LE FOURNIL — économie, état, absence, étoiles, objectifs du jour, événements. Aucune dépendance au DOM : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GAME = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── les produits, dans l'ordre où on les débloque ───
  const PRODUITS = [
    { id: 'baguette', pl: 'baguettes', nom: 'Baguette', cout: 4, rev: 1, temps: 1, croiss: 1.07, staff: 1000, staffNom: 'Apprenti Léo', desc: 'Croustillante, chaude, la base.' },
    { id: 'croissant', pl: 'croissants', nom: 'Croissant', cout: 60, rev: 20, temps: 3, croiss: 1.15, staff: 15000, staffNom: 'Apprentie Inès', desc: 'Pur beurre, feuilleté.' },
    { id: 'painchoc', pl: 'pains au chocolat', nom: 'Pain au chocolat', cout: 720, rev: 150, temps: 6, croiss: 1.14, staff: 100000, staffNom: 'Mitron Sami', desc: 'Deux barres, pas une.' },
    { id: 'tarte', pl: 'tartes aux pommes', nom: 'Tarte aux pommes', cout: 8640, rev: 1200, temps: 12, croiss: 1.13, staff: 500000, staffNom: 'Pâtissière Rose', desc: 'La recette de mamie.' },
    { id: 'eclair', pl: 'éclairs au café', nom: 'Éclair au café', cout: 2e7, rev: 10000, temps: 24, croiss: 1.12, staff: 8e7, staffNom: 'Pâtissier Malik', desc: 'Glacé, fondant, parfait.' },
    { id: 'macaron', pl: 'macarons', nom: 'Macarons', cout: 1e9, rev: 90000, temps: 96, croiss: 1.11, staff: 4e9, staffNom: 'Cheffe Agathe', desc: 'Six parfums, zéro regret.' },
    { id: 'millefeuille', pl: 'mille-feuilles', nom: 'Mille-feuille', cout: 5e10, rev: 8e5, temps: 384, croiss: 1.1, staff: 2e11, staffNom: 'Chef Augustin', desc: 'Mille, on a compté.' },
    { id: 'piece', pl: 'pièces montées', nom: 'Pièce montée', cout: 2e12, rev: 7e6, temps: 1536, croiss: 1.09, staff: 8e12, staffNom: 'Maître Paulin', desc: 'Pour les grands jours.' },
  ];
  const PALIERS = [25, 50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];
  const AMELIORATIONS = [
    { id: 'farine', nom: 'Farine de tradition', cout: 25000, cible: ['baguette'], mult: 3, desc: 'Baguettes ×3' },
    { id: 'beurre', nom: 'Beurre AOP', cout: 300000, cible: ['croissant'], mult: 3, desc: 'Croissants ×3' },
    { id: 'enseigne', nom: 'Enseigne lumineuse', cout: 1.5e6, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'chocolat', nom: 'Chocolat noir 70 %', cout: 4e6, cible: ['painchoc'], mult: 3, desc: 'Pains au chocolat ×3' },
    { id: 'pommes', nom: 'Pommes du verger', cout: 4e7, cible: ['tarte'], mult: 3, desc: 'Tartes ×3' },
    { id: 'four', nom: 'Four à sole', cout: 1e8, cible: ['baguette', 'croissant'], mult: 5, desc: 'Baguettes et croissants ×5' },
    { id: 'terrasse', nom: 'Terrasse ensoleillée', cout: 2.5e8, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'cafe', nom: 'Café torréfié maison', cout: 2e9, cible: ['eclair'], mult: 3, desc: 'Éclairs ×3' },
    { id: 'amandes', nom: 'Amandes de Provence', cout: 5e10, cible: ['macaron'], mult: 3, desc: 'Macarons ×3' },
    { id: 'vitrine', nom: 'Vitrine réfrigérée', cout: 2e11, cible: ['tarte', 'eclair', 'macaron'], mult: 5, desc: 'Tartes, éclairs, macarons ×5' },
    { id: 'fidelite', nom: 'Carte de fidélité', cout: 1e12, cible: null, mult: 3, desc: 'Tout ×3' },
    { id: 'feuilletage', nom: 'Pâte feuilletée maison', cout: 5e12, cible: ['millefeuille'], mult: 3, desc: 'Mille-feuilles ×3' },
    { id: 'robot', nom: 'Robot pâtissier', cout: 5e13, cible: ['piece'], mult: 3, desc: 'Pièces montées ×3' },
    { id: 'franchise', nom: 'Réseau de franchises', cout: 5e14, cible: null, mult: 5, desc: 'Tout ×5' },
  ];
  const ETOILE_BONUS = 0.05;     // +5 % par étoile, pour toujours
  const ETOILE_BASE = 2e9;       // la première étoile demande ~2 Md € gagnés dans la boutique
  const ETOILE_FREIN = 25;       // chaque tranche de 25 étoiles possédées rend les suivantes 2 fois plus chères (pas d'emballement)
  const ABSENCE_MAX_H = 8;       // les apprentis travaillent 8 h au plus pendant une absence
  const RUSH = { duree: 60, mult: 3 };          // coup de feu : toutes les ventes ×3 pendant 60 s
  const COMMANDE = { duree: 180, prime: 6 };    // commande spéciale : N fournées en 3 min, payées 6 fois le prix
  const CRITIQUE = { duree: 120, mult: 2, boost: 300 }; // le critique : vends trois recettes différentes en 2 min → tout ×2 pendant 5 min
  const MEUNIER = { duree: 90, remise: 0.4 };   // le meunier passe : niveaux et recettes à −40 % pendant 90 s
  const PETRISSAGE = { duree: 20, n: 30 };      // concours de pétrissage : 30 touches en 20 s → prime
  const PANNE = { duree: 60, n: 8 };            // panne de four : un produit à l'arrêt ; 8 touches pour réparer (prime), sinon réparé seul après 60 s
  const ANNIVERSAIRE = { duree: 120, mult: 5 }; // goûter d'anniversaire : un produit ×5 pendant 2 min
  const EVENEMENTS = { rush: RUSH, commande: COMMANDE, critique: CRITIQUE, meunier: MEUNIER, petrissage: PETRISSAGE, panne: PANNE, anniversaire: ANNIVERSAIRE };
  const MARCHE_MULT = 1.5;                      // jour de marché (samedi, dimanche) : ×1,5

  // ─── état ───
  function stationsNeuves() { return PRODUITS.map((p, i) => ({ niv: i === 0 ? 1 : 0, staff: false, prog: 0, actif: false })); }
  function newState(nowMs) {
    return {
      v: 2, coins: 0, lifetime: 0, lifetimeRun: 0, etoiles: 0, boutiques: 1,
      stations: stationsNeuves(), ameliorations: {}, tuto: 0, lastSeen: nowMs, created: nowMs, son: true, vibre: true, mode: 1, now: nowMs,
      stats: { taps: 0, ventes: 0, clients: 0 },
      jour: null, serie: 0, dernierJourComplet: '', ev: null, evTimer: 180, dernierEv: '', boost: null, mystereTimer: 150, carnetEv: [],
    };
  }

  // ─── temps, hasard déterministe ───
  const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hier = (ms) => dayKey(ms - 864e5);
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const jourDeMarche = (ms) => { const d = new Date(ms).getDay(); return d === 0 || d === 6; };
  const heureDePointe = (ms) => { const h = new Date(ms).getHours(); return (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 19); };
  function arrondi(n) { if (n < 10) return Math.max(1, Math.round(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }

  // ─── calculs ───
  const palierMult = (niv) => Math.pow(2, PALIERS.filter((p) => niv >= p).length);
  const prochainPalier = (niv) => PALIERS.find((p) => p > niv) || null;
  function ameliorationMult(st, i) {
    let m = 1;
    for (const a of AMELIORATIONS) if (st.ameliorations[a.id] && (a.cible === null || a.cible.includes(PRODUITS[i].id))) m *= a.mult;
    return m;
  }
  const etoileMult = (st) => 1 + st.etoiles * ETOILE_BONUS;
  function boostMult(st, i) { // événements et bonus temporaires, à l'instant st.now (i : pour les bonus propres à un produit)
    let m = 1;
    const ev = st.ev;
    if (ev && ev.fin > st.now) { if (ev.type === 'rush') m *= RUSH.mult; if (ev.type === 'anniversaire' && i != null && ev.i === i) m *= ANNIVERSAIRE.mult; }
    if (st.boost && st.boost.fin > st.now) m *= st.boost.mult;
    if (jourDeMarche(st.now)) m *= MARCHE_MULT;
    return m;
  }
  function revenuBase(st, i) { const s = st.stations[i]; return s.niv <= 0 ? 0 : PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(st, i) * etoileMult(st); }
  function revenu(st, i) { return revenuBase(st, i) * boostMult(st, i); } // par fournée, maintenant
  const coutNiveau = (i, niv) => PRODUITS[i].cout * Math.pow(PRODUITS[i].croiss, niv);
  function coutNiveaux(i, niv, n) { const r = PRODUITS[i].croiss; return PRODUITS[i].cout * Math.pow(r, niv) * (Math.pow(r, n) - 1) / (r - 1); }
  function maxNiveaux(i, niv, coins) { const r = PRODUITS[i].croiss, a = PRODUITS[i].cout * Math.pow(r, niv); if (coins < a) return 0; return Math.floor(Math.log(coins * (r - 1) / a + 1) / Math.log(r)); }
  const remise = (st) => (st.ev && st.ev.type === 'meunier' && st.ev.fin > st.now ? 1 - MEUNIER.remise : 1); // le meunier : tout moins cher
  const prixNiveaux = (st, i, n) => coutNiveaux(i, st.stations[i].niv, n) * remise(st); // prix réel maintenant (remise comprise)
  function quantite(st, i) {
    const s = st.stations[i];
    if (s.niv === 0) return 1;
    if (st.mode === 'max') return Math.max(1, maxNiveaux(i, s.niv, st.coins / remise(st)));
    return st.mode;
  }
  function tauxParSeconde(st) { let t = 0; st.stations.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenu(st, i) / PRODUITS[i].temps; }); return t; }
  function tauxBase(st) { let t = 0; st.stations.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenuBase(st, i) / PRODUITS[i].temps; }); return t; }
  // rythme de référence pour calibrer objectifs et primes : les apprentis, sinon la première fournée à la main
  function rythme(st) { const t = tauxBase(st); if (t > 0) return t; let best = 0; st.stations.forEach((s, i) => { if (s.niv > 0) best = Math.max(best, revenuBase(st, i) / Math.max(1, PRODUITS[i].temps) * 0.5); }); return Math.max(0.5, best); }
  function etoilesPour(lifetimeRun, etoiles) { return Math.floor(Math.sqrt(Math.max(0, lifetimeRun) / (ETOILE_BASE * (1 + (etoiles || 0) / ETOILE_FREIN)))); }
  const etoilesGagnables = (st) => Math.max(0, etoilesPour(st.lifetimeRun, st.etoiles));

  // ─── objectifs du jour : trois par jour, tirés de la date, calibrés sur ta boutique ───
  const TYPES_OBJ = {
    gagner: (st, r) => ({ cible: arrondi(Math.max(50, r * 1500)), txt: (c) => `Gagne ${fmtEur(c)}` }),
    // vendre : dix minutes de production d'un produit rapide (les ventes pendant l'absence ne comptent pas)
    vendre: (st, r, rnd) => { const idx = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0 && PRODUITS[i].temps <= 120); if (!idx.length) return null; const i = idx[Math.floor(rnd() * idx.length)]; const s = st.stations[i]; const n = Math.max(2, Math.min(s.staff ? 600 : 40, arrondi(600 / PRODUITS[i].temps * (s.staff ? 1 : 0.4)))); return { i, cible: n, txt: (c) => `Vends ${fmt(c)} fournées de ${PRODUITS[i].pl}` }; },
    niveaux: (st) => ({ cible: Math.min(30, 8 + 3 * st.stations.filter((s) => s.niv > 0).length), txt: (c) => `Achète ${c} niveaux` }),
    clients: () => ({ cible: 50, txt: (c) => `Sers ${c} clients` }),
    mains: (st) => (st.stations.some((s) => s.niv > 0 && !s.staff) ? { cible: 25, txt: (c) => `Cuis ${c} fournées à la main` } : null),
    embaucher: (st) => (st.stations.some((s) => s.niv > 0 && !s.staff) ? { cible: 1, txt: () => 'Embauche un apprenti' } : null),
    bonus: (st, r) => (AMELIORATIONS.some((a) => !st.ameliorations[a.id] && a.cout < st.coins + r * 3600) ? { cible: 1, txt: () => 'Achète un bonus' } : null),
    recette: (st, r) => { const i = st.stations.findIndex((s) => s.niv === 0); return i > 0 && PRODUITS[i].cout < st.coins + r * 3600 ? { cible: 1, txt: () => `Débloque : ${PRODUITS[i].nom}` } : null; },
  };
  function tirerObjectifs(st, key) {
    const rnd = mulberry32(hashStr(key + ':' + st.boutiques + ':' + st.created)), r = rythme(st);
    const choix = ['gagner'], pool = ['vendre', 'niveaux', 'clients', 'mains', 'embaucher', 'bonus', 'recette'];
    while (choix.length < 3 && pool.length) { const k = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; if (TYPES_OBJ[k](st, r, rnd)) choix.push(k); }
    return choix.map((type) => { const o = TYPES_OBJ[type](st, r, rnd); return { type, i: o.i, cible: o.cible, txt: o.txt(o.cible), progres: 0, fait: false, reclame: false, prime: arrondi(Math.max(40, r * 600)) }; });
  }
  function possible(st, o) {
    if (o.type === 'mains' || o.type === 'embaucher') return st.stations.some((s) => s.niv > 0 && !s.staff);
    if (o.type === 'recette') return st.stations.some((s) => s.niv === 0);
    if (o.type === 'bonus') return AMELIORATIONS.some((a) => !st.ameliorations[a.id]);
    if (o.type === 'vendre') return st.stations[o.i] && st.stations[o.i].niv > 0;
    return true;
  }
  // un défi devenu impossible (tout le monde est embauché, tout est débloqué…) est remplacé par un autre, progrès à zéro
  function remplacerImpossibles(st) {
    const j = st.jour;
    j.objectifs.forEach((o, k) => {
      if (o.fait || possible(st, o)) return;
      const rnd = mulberry32(hashStr(j.date + ':r' + k + ':' + st.boutiques)), r = rythme(st);
      const pris = j.objectifs.map((x) => x.type);
      for (const type of ['clients', 'niveaux', 'vendre', 'gagner']) {
        if (pris.includes(type) && type !== 'gagner') continue;
        const n = TYPES_OBJ[type](st, r, rnd); if (!n) continue;
        j.objectifs[k] = { type, i: n.i, cible: n.cible, txt: n.txt(n.cible), progres: 0, fait: false, reclame: false, prime: o.prime };
        return;
      }
    });
  }
  function objectifsDuJour(st, nowMs) {
    const key = dayKey(nowMs);
    if (!st.jour || st.jour.date !== key) st.jour = { date: key, objectifs: tirerObjectifs(st, key), etoileDonnee: false };
    remplacerImpossibles(st);
    return st.jour;
  }
  function noter(st, type, n, i) {
    if (!st.jour) return;
    for (const o of st.jour.objectifs) {
      if (o.fait || o.type !== type) continue;
      if (type === 'vendre' && o.i !== i) continue;
      o.progres = Math.min(o.cible, o.progres + n);
      if (o.progres >= o.cible) o.fait = true;
    }
  }
  function reclamer(st, k) {
    const o = st.jour && st.jour.objectifs[k];
    if (!o || !o.fait || o.reclame) return { ok: false };
    o.reclame = true; gagner(st, o.prime, true);
    let etoile = false;
    if (st.jour.objectifs.every((x) => x.reclame) && !st.jour.etoileDonnee) {
      st.jour.etoileDonnee = true; st.etoiles++; etoile = true;
      st.serie = st.dernierJourComplet === hier(st.now) ? st.serie + 1 : 1; st.dernierJourComplet = st.jour.date;
    }
    return { ok: true, prime: o.prime, etoile };
  }
  const serieEnCours = (st) => (st.dernierJourComplet === dayKey(st.now) || st.dernierJourComplet === hier(st.now)) ? st.serie : 0;

  // ─── événements : sept types, un toutes les 3 à 7 minutes de jeu actif, jamais deux fois le même d'affilée ───
  const rapides = (st) => st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0 && PRODUITS[i].temps <= 120);
  const TYPES_EV = [
    { type: 'rush', poids: (st) => (heureDePointe(st.now) ? 5 : 2.5), ok: () => true },
    { type: 'commande', poids: 2, ok: (st) => st.stations.some((s, i) => s.niv > 0 && PRODUITS[i].temps <= 60) },
    { type: 'critique', poids: 1.5, ok: (st) => rapides(st).length >= 3 },
    { type: 'meunier', poids: 1.5, ok: () => true },
    { type: 'petrissage', poids: 1.5, ok: () => true },
    { type: 'panne', poids: 1, ok: (st) => st.stations.some((s) => s.staff) },
    { type: 'anniversaire', poids: 1.5, ok: (st) => st.stations.filter((s) => s.niv > 0).length >= 2 },
  ];
  function note(st, txt) { st.carnetEv.push({ t: st.now, txt }); if (st.carnetEv.length > 20) st.carnetEv.shift(); }
  function lancerEvenement(st, rnd, type) {
    rnd = rnd || Math.random;
    if (!type) {
      const choix = TYPES_EV.filter((t) => t.ok(st) && t.type !== st.dernierEv);
      let total = 0; const poids = choix.map((t) => { const w = typeof t.poids === 'function' ? t.poids(st) : t.poids; total += w; return w; });
      let r = rnd() * total; type = choix[choix.length - 1].type;
      for (let k = 0; k < choix.length; k++) { r -= poids[k]; if (r <= 0) { type = choix[k].type; break; } }
    }
    st.dernierEv = type;
    const L = { rush: lancerRush, commande: lancerCommande, critique: lancerCritique, meunier: lancerMeunier, petrissage: lancerPetrissage, panne: lancerPanne, anniversaire: lancerAnniversaire };
    return (L[type] || lancerRush)(st, rnd);
  }
  function lancerRush(st) { st.ev = { type: 'rush', debut: st.now, fin: st.now + RUSH.duree * 1000 }; return st.ev; }
  function lancerCritique(st, rnd) {
    const idx = rapides(st), restants = [];
    while (restants.length < 3 && idx.length) restants.push(idx.splice(Math.floor((rnd || Math.random)() * idx.length), 1)[0]);
    st.ev = { type: 'critique', restants, debut: st.now, fin: st.now + CRITIQUE.duree * 1000 };
    return st.ev;
  }
  function lancerMeunier(st) { st.ev = { type: 'meunier', debut: st.now, fin: st.now + MEUNIER.duree * 1000 }; return st.ev; }
  function lancerPetrissage(st) { st.ev = { type: 'petrissage', n: PETRISSAGE.n, taps: 0, debut: st.now, fin: st.now + PETRISSAGE.duree * 1000, prime: arrondi(Math.max(30, rythme(st) * 240)) }; return st.ev; }
  function lancerPanne(st, rnd) {
    const idx = st.stations.map((s, i) => i).filter((i) => st.stations[i].staff);
    if (!idx.length) return lancerRush(st);
    const i = idx[Math.floor((rnd || Math.random)() * idx.length)];
    st.ev = { type: 'panne', i, coups: 0, n: PANNE.n, debut: st.now, fin: st.now + PANNE.duree * 1000, prime: arrondi(Math.max(20, rythme(st) * 90)) };
    return st.ev;
  }
  function lancerAnniversaire(st, rnd) {
    const idx = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0);
    const i = idx[Math.floor((rnd || Math.random)() * idx.length)];
    st.ev = { type: 'anniversaire', i, mult: ANNIVERSAIRE.mult, debut: st.now, fin: st.now + ANNIVERSAIRE.duree * 1000 };
    return st.ev;
  }
  // le critique : on lui sert chaque recette demandée en touchant sa carte ; les trois servies → tout ×2 pendant 5 min
  function servir(st, i) {
    const ev = st.ev; if (!ev || ev.type !== 'critique' || ev.fin <= st.now) return { ok: false };
    const k = ev.restants.indexOf(i); if (k < 0) return { ok: false };
    ev.restants.splice(k, 1);
    if (ev.restants.length) return { ok: true, fini: false, restants: ev.restants.length };
    donnerBoost(st, CRITIQUE.mult, CRITIQUE.boost); note(st, `Bonne critique : tout ×${CRITIQUE.mult} pendant ${CRITIQUE.boost / 60} min`); st.ev = null;
    return { ok: true, fini: true };
  }
  function petrir(st) {
    const ev = st.ev; if (!ev || ev.type !== 'petrissage' || ev.fin <= st.now) return { ok: false };
    ev.taps++; if (ev.taps < ev.n) return { ok: true, fini: false, taps: ev.taps };
    gagner(st, ev.prime, true); note(st, `Concours de pétrissage gagné : ${fmtEur(ev.prime)}`); st.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function reparer(st) {
    const ev = st.ev; if (!ev || ev.type !== 'panne') return { ok: false };
    ev.coups++; if (ev.coups < ev.n) return { ok: true, fini: false, coups: ev.coups };
    gagner(st, ev.prime, true); note(st, `Four réparé : ${fmtEur(ev.prime)}`); st.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function lancerCommande(st, rnd) {
    const idx = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0 && PRODUITS[i].temps <= 60);
    if (!idx.length) return lancerRush(st);
    const i = idx[Math.floor(rnd() * idx.length)], s = st.stations[i];
    const n = Math.max(3, Math.min(s.staff ? 500 : 30, arrondi(COMMANDE.duree / PRODUITS[i].temps * (s.staff ? 0.7 : 0.35))));
    st.ev = { type: 'commande', i, n, fait: 0, debut: st.now, fin: st.now + COMMANDE.duree * 1000, prime: arrondi(revenuBase(st, i) * n * COMMANDE.prime), livree: false };
    return st.ev;
  }
  function livrer(st) {
    const ev = st.ev;
    if (!ev || ev.type !== 'commande' || ev.fait < ev.n || ev.livree) return { ok: false };
    ev.livree = true; gagner(st, ev.prime, true); note(st, `Commande livrée : ${fmtEur(ev.prime)}`);
    st.ev = null;
    return { ok: true, prime: ev.prime };
  }
  const pourboire = (st) => arrondi(Math.max(20, rythme(st) * 120));
  function donnerBoost(st, mult, secs) { st.boost = { mult, fin: st.now + secs * 1000 }; }

  // ─── actions ───
  function gagner(st, montant, horsObjectif) { st.coins += montant; st.lifetime += montant; st.lifetimeRun += montant; if (!horsObjectif) noter(st, 'gagner', montant); }
  function acheter(st, i) {
    const s = st.stations[i], n = quantite(st, i), prix = prixNiveaux(st, i, n);
    if (st.coins < prix) return { ok: false, prix };
    st.coins -= prix;
    if (s.niv === 0) noter(st, 'recette', 1); else noter(st, 'niveaux', n);
    s.niv += n;
    return { ok: true, n, prix };
  }
  function embaucher(st, i) {
    const s = st.stations[i], prix = PRODUITS[i].staff;
    if (s.staff || s.niv <= 0 || st.coins < prix) return { ok: false, prix };
    st.coins -= prix; s.staff = true; s.actif = true; noter(st, 'embaucher', 1);
    return { ok: true };
  }
  function lancer(st, i) {
    const s = st.stations[i];
    if (s.niv <= 0 || s.actif) return false;
    s.actif = true; s.prog = 0; st.stats.taps++; noter(st, 'mains', 1);
    return true;
  }
  function amelioration(st, id) {
    const a = AMELIORATIONS.find((x) => x.id === id);
    if (!a || st.ameliorations[id] || st.coins < a.cout) return { ok: false };
    st.coins -= a.cout; st.ameliorations[id] = true; noter(st, 'bonus', 1);
    return { ok: true, a };
  }
  function nouvelleBoutique(st, nowMs) {
    const gain = etoilesGagnables(st);
    if (gain <= 0) return { ok: false };
    st.etoiles += gain; st.boutiques++;
    st.coins = 0; st.lifetimeRun = 0; st.ameliorations = {}; st.stations = stationsNeuves(); st.ev = null; st.boost = null;
    st.lastSeen = nowMs;
    // les objectifs du jour pas encore réclamés sont retirés à la taille de la nouvelle boutique (les réussis restent acquis)
    if (st.jour) { const neufs = tirerObjectifs(st, st.jour.date); st.jour.objectifs = st.jour.objectifs.map((o, k) => (o.reclame ? o : neufs[k])); }
    return { ok: true, gain };
  }

  // ─── un pas de jeu ; rend {ventes, nouvelEv, finEv, mystere} ───
  function tick(st, dt, nowMs, rnd) {
    st.now = nowMs; rnd = rnd || Math.random;
    const out = { ventes: [], nouvelEv: null, finEv: null, mystere: false };
    objectifsDuJour(st, nowMs);
    st.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      if (st.ev && st.ev.type === 'panne' && st.ev.i === i) return; // le four est en panne
      const T = PRODUITS[i].temps;
      s.prog += dt;
      if (s.prog < T) return;
      let n = Math.floor(s.prog / T);
      if (!s.staff) { n = 1; s.prog = 0; s.actif = false; } else s.prog -= n * T;
      const montant = revenu(st, i) * n;
      gagner(st, montant); st.stats.ventes += n; noter(st, 'vendre', n, i);
      if (st.ev && st.ev.type === 'commande' && st.ev.i === i) st.ev.fait = Math.min(st.ev.n, st.ev.fait + n);
      out.ventes.push({ i, montant, n });
    });
    // fin d'événement (la commande prête attend sa livraison) ; puis le suivant dans 3 à 7 minutes
    if (st.ev && st.ev.fin <= nowMs && !(st.ev.type === 'commande' && st.ev.fait >= st.ev.n)) { out.finEv = st.ev; st.ev = null; }
    if (!st.ev) {
      st.evTimer -= dt;
      if (st.evTimer <= 0) { st.evTimer = 180 + rnd() * 240; out.nouvelEv = lancerEvenement(st, rnd); }
    }
    if (st.boost && st.boost.fin <= nowMs) st.boost = null;
    st.mystereTimer -= dt;
    if (st.mystereTimer <= 0) { st.mystereTimer = 150 + rnd() * 200; out.mystere = true; }
    return out;
  }
  // ─── absence : les apprentis ont travaillé (8 h au plus), les fournées en cours se terminent ; pas d'événement sans toi ───
  function absence(st, nowMs) {
    st.now = nowMs; st.ev = null; st.boost = null;
    const secs = Math.min(ABSENCE_MAX_H * 3600, Math.max(0, (nowMs - st.lastSeen) / 1000));
    let total = 0; const detail = [];
    st.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = PRODUITS[i].temps;
      if (s.staff) {
        const n = Math.floor((s.prog + secs) / T);
        s.prog = (s.prog + secs) % T;
        if (n > 0) { const m = revenu(st, i) * n; total += m; detail.push({ i, n, m }); st.stats.ventes += n; }
      } else if (s.prog + secs >= T) { const m = revenu(st, i); total += m; detail.push({ i, n: 1, m }); s.prog = 0; s.actif = false; st.stats.ventes++; }
      else s.prog += secs;
    });
    if (total > 0) gagner(st, total, true);
    st.lastSeen = nowMs;
    return { secs, total, detail };
  }

  // ─── format des nombres : 1 234 €, 12,5 k €, 3,4 M €, 2,1 Md € ───
  const SUFF = ['', 'k', 'M', 'Md', 'Bn', 'Bd', 'Tn', 'Td', 'Qa', 'Qi'];
  function fmt(n) {
    if (!Number.isFinite(n)) return '∞';
    if (n < 0) return '−' + fmt(-n);
    if (n < 1000) return (n < 10 && n !== Math.floor(n) ? n.toFixed(1) : Math.floor(n).toString()).replace('.', ',');
    let k = 0; let v = n;
    while (v >= 1000 && k < SUFF.length - 1) { v /= 1000; k++; }
    if (v >= 1000) return n.toExponential(1).replace('.', ',').replace('e+', ' e');
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace('.0', '').replace('.', ',') + ' ' + SUFF[k];
  }
  const fmtEur = (n) => fmt(n) + ' €';
  function fmtDuree(s) { if (s < 60) return Math.round(s) + ' s'; if (s < 3600) return Math.round(s / 60) + ' min'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  const fmtChrono = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  return { PRODUITS, PALIERS, AMELIORATIONS, ETOILE_BONUS, ETOILE_BASE, ETOILE_FREIN, ABSENCE_MAX_H, RUSH, COMMANDE, CRITIQUE, MEUNIER, PETRISSAGE, PANNE, ANNIVERSAIRE, EVENEMENTS, MARCHE_MULT, newState, dayKey, jourDeMarche, heureDePointe, arrondi,
    palierMult, prochainPalier, ameliorationMult, etoileMult, boostMult, revenu, revenuBase, coutNiveau, coutNiveaux, maxNiveaux, remise, prixNiveaux, quantite, tauxParSeconde, tauxBase, rythme, etoilesPour, etoilesGagnables,
    objectifsDuJour, noter, reclamer, serieEnCours, lancerEvenement, lancerRush, lancerCommande, lancerCritique, lancerMeunier, lancerPetrissage, lancerPanne, lancerAnniversaire, livrer, servir, petrir, reparer, pourboire, donnerBoost,
    gagner, acheter, embaucher, lancer, amelioration, nouvelleBoutique, tick, absence, fmt, fmtEur, fmtDuree, fmtChrono };
});
