/* LE FOURNIL — économie, état, sauvegarde, absence, étoiles. Aucune dépendance au DOM : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GAME = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── les produits, dans l'ordre où on les débloque ───
  const PRODUITS = [
    { id: 'baguette', nom: 'Baguette', cout: 4, rev: 1, temps: 1, croiss: 1.07, staff: 1000, staffNom: 'Apprenti Léo', desc: 'Croustillante, chaude, la base.' },
    { id: 'croissant', nom: 'Croissant', cout: 60, rev: 20, temps: 3, croiss: 1.15, staff: 15000, staffNom: 'Apprentie Inès', desc: 'Pur beurre, feuilleté.' },
    { id: 'painchoc', nom: 'Pain au chocolat', cout: 720, rev: 150, temps: 6, croiss: 1.14, staff: 100000, staffNom: 'Mitron Sami', desc: 'Deux barres, pas une.' },
    { id: 'tarte', nom: 'Tarte aux pommes', cout: 8640, rev: 1200, temps: 12, croiss: 1.13, staff: 500000, staffNom: 'Pâtissière Rose', desc: 'La recette de mamie.' },
    { id: 'eclair', nom: 'Éclair au café', cout: 103680, rev: 10000, temps: 24, croiss: 1.12, staff: 1.2e6, staffNom: 'Pâtissier Malik', desc: 'Glacé, fondant, parfait.' },
    { id: 'macaron', nom: 'Macarons', cout: 1.24e6, rev: 90000, temps: 96, croiss: 1.11, staff: 1e7, staffNom: 'Cheffe Agathe', desc: 'Six parfums, zéro regret.' },
    { id: 'millefeuille', nom: 'Mille-feuille', cout: 1.5e7, rev: 8e5, temps: 384, croiss: 1.1, staff: 1.11e8, staffNom: 'Chef Augustin', desc: 'Mille, on a compté.' },
    { id: 'piece', nom: 'Pièce montée', cout: 1.8e8, rev: 7e6, temps: 1536, croiss: 1.09, staff: 5.55e8, staffNom: 'Maître Paulin', desc: 'Pour les grands jours.' },
  ];
  const PALIERS = [25, 50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];
  // ─── améliorations : une seule fois chacune ───
  const AMELIORATIONS = [
    { id: 'farine', nom: 'Farine de tradition', cout: 25000, cible: ['baguette'], mult: 3, desc: 'Baguettes ×3' },
    { id: 'beurre', nom: 'Beurre AOP', cout: 300000, cible: ['croissant'], mult: 3, desc: 'Croissants ×3' },
    { id: 'enseigne', nom: 'Enseigne lumineuse', cout: 1.5e6, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'chocolat', nom: 'Chocolat noir 70 %', cout: 4e6, cible: ['painchoc'], mult: 3, desc: 'Pains au chocolat ×3' },
    { id: 'pommes', nom: 'Pommes du verger', cout: 4e7, cible: ['tarte'], mult: 3, desc: 'Tartes ×3' },
    { id: 'four', nom: 'Four à sole', cout: 1e8, cible: ['baguette', 'croissant'], mult: 5, desc: 'Baguettes et croissants ×5' },
    { id: 'terrasse', nom: 'Terrasse ensoleillée', cout: 2.5e8, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'cafe', nom: 'Café torréfié maison', cout: 6e8, cible: ['eclair'], mult: 3, desc: 'Éclairs ×3' },
    { id: 'amandes', nom: 'Amandes de Provence', cout: 7e9, cible: ['macaron'], mult: 3, desc: 'Macarons ×3' },
    { id: 'vitrine', nom: 'Vitrine réfrigérée', cout: 1e10, cible: ['tarte', 'eclair', 'macaron'], mult: 5, desc: 'Tartes, éclairs, macarons ×5' },
    { id: 'fidelite', nom: 'Carte de fidélité', cout: 2.5e10, cible: null, mult: 3, desc: 'Tout ×3' },
    { id: 'feuilletage', nom: 'Pâte feuilletée maison', cout: 9e10, cible: ['millefeuille'], mult: 3, desc: 'Mille-feuilles ×3' },
    { id: 'robot', nom: 'Robot pâtissier', cout: 1e12, cible: ['piece'], mult: 3, desc: 'Pièces montées ×3' },
    { id: 'franchise', nom: 'Réseau de franchises', cout: 2.5e13, cible: null, mult: 5, desc: 'Tout ×5' },
  ];
  const ETOILE_BONUS = 0.05;     // +5 % par étoile, pour toujours
  const ABSENCE_MAX_H = 8;       // les apprentis travaillent 8 h au plus pendant une absence

  // ─── état ───
  function newState(nowMs) {
    return {
      v: 2, coins: 0, lifetime: 0, lifetimeRun: 0, etoiles: 0, boutiques: 1,
      stations: PRODUITS.map((p, i) => ({ niv: i === 0 ? 1 : 0, staff: false, prog: 0, actif: false })), // on commence avec une fournée de baguettes
      ameliorations: {}, tuto: 0, lastSeen: nowMs, created: nowMs, son: true, vibre: true, mode: 1,
      stats: { taps: 0, ventes: 0, clients: 0 },
    };
  }

  // ─── calculs ───
  const palierMult = (niv) => Math.pow(2, PALIERS.filter((p) => niv >= p).length);
  const prochainPalier = (niv) => PALIERS.find((p) => p > niv) || null;
  function ameliorationMult(st, i) {
    let m = 1;
    for (const a of AMELIORATIONS) if (st.ameliorations[a.id] && (a.cible === null || a.cible.includes(PRODUITS[i].id))) m *= a.mult;
    return m;
  }
  const etoileMult = (st) => 1 + st.etoiles * ETOILE_BONUS;
  function revenu(st, i) { // par fournée
    const s = st.stations[i];
    if (s.niv <= 0) return 0;
    return PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(st, i) * etoileMult(st);
  }
  const coutNiveau = (i, niv) => PRODUITS[i].cout * Math.pow(PRODUITS[i].croiss, niv); // prix du niveau niv+1
  function coutNiveaux(i, niv, n) { const r = PRODUITS[i].croiss; return PRODUITS[i].cout * Math.pow(r, niv) * (Math.pow(r, n) - 1) / (r - 1); }
  function maxNiveaux(i, niv, coins) {
    const r = PRODUITS[i].croiss, a = PRODUITS[i].cout * Math.pow(r, niv);
    if (coins < a) return 0;
    return Math.floor(Math.log(coins * (r - 1) / a + 1) / Math.log(r));
  }
  function quantite(st, i) { // combien de niveaux pour le mode d'achat courant
    const s = st.stations[i];
    if (s.niv === 0) return 1; // débloquer = toujours un seul niveau
    if (st.mode === 'max') return Math.max(1, maxNiveaux(i, s.niv, st.coins));
    return st.mode;
  }
  function tauxParSeconde(st) { let t = 0; st.stations.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenu(st, i) / PRODUITS[i].temps; }); return t; }
  function etoilesPour(lifetimeRun) { return Math.floor(Math.sqrt(Math.max(0, lifetimeRun) / 8e6)); }
  const etoilesGagnables = (st) => Math.max(0, etoilesPour(st.lifetimeRun) - etoilesPour(st.lifetimeRunDebut || 0));

  // ─── actions ───
  function gagner(st, montant) { st.coins += montant; st.lifetime += montant; st.lifetimeRun += montant; }
  function acheter(st, i) {
    const s = st.stations[i], n = quantite(st, i), prix = coutNiveaux(i, s.niv, n);
    if (st.coins < prix) return { ok: false, prix };
    st.coins -= prix; s.niv += n;
    return { ok: true, n, prix };
  }
  function embaucher(st, i) {
    const s = st.stations[i], prix = PRODUITS[i].staff;
    if (s.staff || s.niv <= 0 || st.coins < prix) return { ok: false, prix };
    st.coins -= prix; s.staff = true; s.actif = true;
    return { ok: true };
  }
  function lancer(st, i) { // touche sur un produit sans apprenti
    const s = st.stations[i];
    if (s.niv <= 0 || s.actif) return false;
    s.actif = true; s.prog = 0; st.stats.taps++;
    return true;
  }
  function amelioration(st, id) {
    const a = AMELIORATIONS.find((x) => x.id === id);
    if (!a || st.ameliorations[id] || st.coins < a.cout) return { ok: false };
    st.coins -= a.cout; st.ameliorations[id] = true;
    return { ok: true, a };
  }
  function nouvelleBoutique(st, nowMs) {
    const gain = etoilesGagnables(st);
    if (gain <= 0) return { ok: false };
    st.etoiles += gain; st.boutiques++;
    st.coins = 0; st.lifetimeRun = 0; st.lifetimeRunDebut = 0; st.ameliorations = {};
    st.stations = PRODUITS.map((p, i) => ({ niv: i === 0 ? 1 : 0, staff: false, prog: 0, actif: false }));
    st.lastSeen = nowMs;
    return { ok: true, gain };
  }

  // ─── un pas de jeu ; rend les ventes réalisées [{i, montant}] ───
  function tick(st, dt) {
    const ventes = [];
    st.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = PRODUITS[i].temps;
      s.prog += dt;
      if (s.prog < T) return;
      let n = Math.floor(s.prog / T);
      if (!s.staff) { n = 1; s.prog = 0; s.actif = false; } else s.prog -= n * T;
      const montant = revenu(st, i) * n;
      gagner(st, montant); st.stats.ventes += n;
      ventes.push({ i, montant, n });
    });
    return ventes;
  }
  // ─── absence : les apprentis ont travaillé (8 h au plus), les fournées en cours se terminent ───
  function absence(st, nowMs) {
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
    if (total > 0) gagner(st, total);
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

  return { PRODUITS, PALIERS, AMELIORATIONS, ETOILE_BONUS, ABSENCE_MAX_H, newState, palierMult, prochainPalier, ameliorationMult, etoileMult, revenu, coutNiveau, coutNiveaux, maxNiveaux, quantite, tauxParSeconde, etoilesPour, etoilesGagnables, gagner, acheter, embaucher, lancer, amelioration, nouvelleBoutique, tick, absence, fmt, fmtEur, fmtDuree };
});
