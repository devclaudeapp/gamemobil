/* LE FOURNIL — économie, état, absence, étoiles, objectifs du jour, événements. Aucune dépendance au DOM : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GAME = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── les produits, dans l'ordre où on les débloque ───
  const PRODUITS = [
    { id: 'baguette', pl: 'baguettes', nom: 'Baguette', cout: 4, debloquer: 4, rev: 1, temps: 1, croiss: 1.07, staff: 1500, staffNom: 'Apprenti Léo', desc: 'Croustillante, chaude, la base.' },
    { id: 'croissant', pl: 'croissants', nom: 'Croissant', cout: 60, debloquer: 120, rev: 20, temps: 3, croiss: 1.15, staff: 22500, staffNom: 'Apprentie Inès', desc: 'Pur beurre, feuilleté.' },
    { id: 'painchoc', pl: 'pains au chocolat', nom: 'Pain au chocolat', cout: 720, debloquer: 1440, rev: 150, temps: 6, croiss: 1.14, staff: 150000, staffNom: 'Mitron Sami', desc: 'Deux barres, pas une.' },
    { id: 'tarte', pl: 'tartes aux pommes', nom: 'Tarte aux pommes', cout: 8640, debloquer: 17280, rev: 1200, temps: 12, croiss: 1.13, staff: 750000, staffNom: 'Pâtissière Rose', desc: 'La recette de mamie.' },
    { id: 'eclair', pl: 'éclairs au café', nom: 'Éclair au café', cout: 1e5, debloquer: 2e8, rev: 10000, temps: 24, croiss: 1.12, staff: 6e8, staffNom: 'Pâtissier Malik', desc: 'Glacé, fondant, parfait.' },
    { id: 'macaron', pl: 'macarons', nom: 'Macarons', cout: 1.2e6, debloquer: 2e10, rev: 90000, temps: 96, croiss: 1.11, staff: 6e10, staffNom: 'Cheffe Agathe', desc: 'Six parfums, zéro regret.' },
    { id: 'millefeuille', pl: 'mille-feuilles', nom: 'Mille-feuille', cout: 1.5e7, debloquer: 6e11, rev: 8e5, temps: 384, croiss: 1.1, staff: 3e12, staffNom: 'Chef Augustin', desc: 'Mille, on a compté.' },
    { id: 'piece', pl: 'pièces montées', nom: 'Pièce montée', cout: 1.8e8, debloquer: 4e13, rev: 7e6, temps: 1536, croiss: 1.09, staff: 1.2e14, staffNom: 'Maître Paulin', desc: 'Pour les grands jours.' },
  ];
  const PALIERS = [25, 50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];
  const AMELIORATIONS = [
    { id: 'farine', nom: 'Farine de tradition', cout: 50000, cible: ['baguette'], mult: 3, desc: 'Baguettes ×3' },
    { id: 'beurre', nom: 'Beurre AOP', cout: 600000, cible: ['croissant'], mult: 3, desc: 'Croissants ×3' },
    { id: 'enseigne', nom: 'Enseigne lumineuse', cout: 3e6, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'chocolat', nom: 'Chocolat noir 70 %', cout: 8e6, cible: ['painchoc'], mult: 3, desc: 'Pains au chocolat ×3' },
    { id: 'pommes', nom: 'Pommes du verger', cout: 8e7, cible: ['tarte'], mult: 3, desc: 'Tartes ×3' },
    { id: 'four', nom: 'Levain maison', cout: 2e8, cible: ['baguette', 'croissant'], mult: 5, desc: 'Baguettes et croissants ×5' },
    { id: 'terrasse', nom: 'Terrasse ensoleillée', cout: 5e8, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'cafe', nom: 'Café torréfié maison', cout: 1e10, cible: ['eclair'], mult: 3, desc: 'Éclairs ×3' },
    { id: 'amandes', nom: 'Amandes de Provence', cout: 3e11, cible: ['macaron'], mult: 3, desc: 'Macarons ×3' },
    { id: 'vitrine', nom: 'Crème fraîche fermière', cout: 1.2e12, cible: ['tarte', 'eclair', 'macaron'], mult: 5, desc: 'Tartes, éclairs, macarons ×5' },
    { id: 'fidelite', nom: 'Carte de fidélité', cout: 6e12, cible: null, mult: 3, desc: 'Tout ×3' },
    { id: 'feuilletage', nom: 'Pâte feuilletée maison', cout: 3e13, cible: ['millefeuille'], mult: 3, desc: 'Mille-feuilles ×3' },
    { id: 'robot', nom: 'Robot pâtissier', cout: 3e14, cible: ['piece'], mult: 3, desc: 'Pièces montées ×3' },
    { id: 'franchise', nom: 'Réseau de franchises', cout: 2e15, cible: null, mult: 5, desc: 'Tout ×5' },
  ];
  const ETOILE_BONUS = 0.05;     // +5 % par étoile, pour toujours
  const ETOILE_BASE = 4e10;      // la première étoile demande ~40 Md € gagnés dans la boutique (le mobilier accélère chaque boutique)
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
  const PAIN_DU_JOUR_MULT = 1.5;                // le pain du jour : un produit ×1,5 toute la journée
  const SPECIALITE_MULT = 2;                    // la spécialité de la boutique : un produit ×2 le temps de la boutique

  // ─── les quartiers : chaque nouvelle boutique change de décor ; le nom de la boutique ; les saisons selon la date réelle ───
  const QUARTIERS = [
    { id: 'village', nom: 'le village', enseigne: 'Au Fournil du Village' },
    { id: 'paris', nom: 'le coin de rue parisien', enseigne: 'Le Fournil de la Rue' },
    { id: 'mer', nom: 'le bord de mer', enseigne: 'Le Fournil de la Plage' },
    { id: 'montagne', nom: 'le chalet de montagne', enseigne: 'Le Fournil du Chalet' },
    { id: 'ville', nom: 'la grande ville', enseigne: 'Le Grand Fournil' },
  ];
  const inc = (st, k, n) => { st.stats[k] = (st.stats[k] || 0) + (n == null ? 1 : n); };
  const quartier = (st) => (Math.max(1, st.boutiques || 1) - 1) % QUARTIERS.length;
  const nomBoutique = (st) => st.nomBoutique || QUARTIERS[quartier(st)].enseigne;
  function renommer(st, nom) { const n = String(nom || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); st.nomBoutique = n; return nomBoutique(st); }
  function saison(ms) {
    const d = new Date(ms), m = d.getMonth() + 1, j = d.getDate(), tags = [];
    if (m === 12 || m <= 2) tags.push('neige');
    if (m === 12) tags.push('noel');
    if (m === 1 && j <= 20) tags.push('galette');
    if (m === 2 && j <= 9) tags.push('chandeleur');
    if (m === 2 && j >= 10 && j <= 15) tags.push('coeurs');
    if (m === 4) tags.push('paques');
    if (m >= 6 && m <= 8) tags.push('ete');
    if (m === 7 && j >= 10 && j <= 16) tags.push('fete');
    if (m === 10 && j >= 15) tags.push('halloween');
    if (m === 10 || m === 11) tags.push('feuilles');
    return tags;
  }

  // ─── le boulanger : savoir-faire, niveaux, titres et talents permanents (rien de tout ça ne se perd en changeant de boutique) ───
  const TITRES = [[1, 'Apprenti'], [4, 'Mitron'], [8, 'Boulanger'], [13, 'Compagnon'], [19, 'Maître boulanger'], [26, 'Meilleur Ouvrier de France']];
  const XP_NIVEAU = (n) => Math.round(40 * Math.pow(n, 1.4)); // savoir-faire pour passer du niveau n au suivant
  const TALENTS = [
    { id: 'affluence', nom: 'Bouche-à-oreille', max: 4, desc: (k) => `Les fournées cuites à la main servent plus de clients : ×${1 + k * 0.5}`.replace('.', ',') },
    { id: 'mains', nom: 'Mains rapides', max: 5, desc: (k) => `Toutes les fournées cuisent ${k * 5} % plus vite` },
    { id: 'memoire', nom: 'Mémoire des recettes', max: 4, desc: (k) => `Chaque nouvelle boutique démarre avec ${k + 1} recette${k ? 's' : ''}` },
    { id: 'levetot', nom: 'Lève-tôt', max: 4, desc: (k) => `Les apprentis travaillent ${k} h de plus pendant ton absence` },
    { id: 'zele', nom: 'Apprentis zélés', max: 4, desc: (k) => `Embauches ${k * 10} % moins chères` },
    { id: 'negoce', nom: 'Négociateur', max: 4, desc: (k) => `Bonus ${k * 8} % moins chers` },
    { id: 'charme', nom: 'Charme', max: 3, desc: (k) => `Événements ${k * 12} % plus fréquents, primes +${k * 25} %` },
    { id: 'pourboire', nom: 'Pourboires', max: 3, desc: (k) => `Client mystère ${k * 50} % plus généreux, ${k * 15} % plus fréquent` },
    { id: 'carnet', nom: 'Carnet de commandes', max: 3, desc: (k) => `Primes des défis du jour +${k * 50} %` },
  ];
  const talent = (st, id) => (st.talents && st.talents[id]) || 0;
  function niveauPour(xp) { let n = 1, reste = Math.max(0, xp || 0); while (reste >= XP_NIVEAU(n)) { reste -= XP_NIVEAU(n); n++; } return { n, reste, prochain: XP_NIVEAU(n) }; }
  const niveau = (st) => niveauPour(st.xp).n;
  function titre(st) { const n = niveau(st); let t = TITRES[0]; for (const x of TITRES) if (n >= x[0]) t = x; return t[1]; }
  const rangTitre = (st) => { const n = niveau(st); let r = 0; TITRES.forEach((x, k) => { if (n >= x[0]) r = k; }); return r; };
  const ptsTalents = (st) => Math.max(0, niveau(st) - 1 - Object.values(st.talents || {}).reduce((a, b) => a + b, 0));
  function gagnerXp(st, n) { const avant = niveau(st); st.xp = (st.xp || 0) + n; return { xp: n, niveau: niveau(st), monte: niveau(st) > avant }; }
  function apprendre(st, id) {
    const t = TALENTS.find((x) => x.id === id);
    if (!t || talent(st, id) >= t.max || ptsTalents(st) <= 0) return { ok: false };
    st.talents = st.talents || {}; st.talents[id] = talent(st, id) + 1;
    return { ok: true, cran: st.talents[id], talent: t };
  }
  // ─── les apprentis montent en grade : leur savoir-faire grandit avec leurs fournées (hors ligne compris) et les suit d'une boutique à l'autre ───
  const APPRENTI_NIVEAUX = [0, 43200, 172800, 518400, 1620000]; // grades 1 à 5 : 12 h, 48 h, 144 h puis 450 h de fournil (réglés sur les garde-fous de longévité)
  const APPRENTI_VITESSE = 0.02;                                 // −2 % de temps de cuisson par grade au-delà du premier
  const APPRENTIS = [ // le talent propre de chacun, acquis au grade 3 : tantôt des gains, tantôt de la vitesse
    { prenom: 'Léo', talent: 'Pétrin bien réglé', rev: 1.1 }, { prenom: 'Inès', talent: 'Tourage express', temps: 0.92 },
    { prenom: 'Sami', talent: 'Deux barres, toujours', rev: 1.1 }, { prenom: 'Rose', talent: 'La pâte de mamie', temps: 0.92 },
    { prenom: 'Malik', talent: 'Glaçage parfait', rev: 1.1 }, { prenom: 'Agathe', talent: 'Coques régulières', temps: 0.92 },
    { prenom: 'Augustin', talent: 'Mille couches', rev: 1.1 }, { prenom: 'Paulin', talent: 'Main sûre', temps: 0.92 },
  ];
  const effetTalentApprenti = (i) => { const a = APPRENTIS[i], pl = PRODUITS[i].pl; return a.rev ? `${pl[0].toUpperCase() + pl.slice(1)} ×${virgule(a.rev)}` : `${pl[0].toUpperCase() + pl.slice(1)} : cuisson ${Math.round((1 - a.temps) * 100)} % plus rapide`; };
  const virgule = (x) => String(+x.toFixed(2)).replace('.', ',');
  const xpApprenti = (st, i) => (st.apprentis && st.apprentis[PRODUITS[i].id] && st.apprentis[PRODUITS[i].id].xp) || 0;
  function gradeApprenti(st, i) { const x = xpApprenti(st, i); let n = 1; while (n < 5 && x >= APPRENTI_NIVEAUX[n]) n++; return n; }
  function progresApprenti(st, i) { const n = gradeApprenti(st, i), x = xpApprenti(st, i); return { n, reste: x - APPRENTI_NIVEAUX[n - 1], prochain: n < 5 ? APPRENTI_NIVEAUX[n] - APPRENTI_NIVEAUX[n - 1] : 0 }; }
  function creditApprenti(st, i, n) { // n fournées cuites par l'apprenti du produit i ; rend { i, niv, talent } s'il monte de grade
    st.apprentis = st.apprentis || {}; const a = st.apprentis[PRODUITS[i].id] || (st.apprentis[PRODUITS[i].id] = { xp: 0 });
    const avant = gradeApprenti(st, i); a.xp += n * PRODUITS[i].temps; const niv = gradeApprenti(st, i);
    if (niv <= avant) return null;
    gagnerXp(st, 10 * niv); inc(st, 'gradesApprentis');
    note(st, `${APPRENTIS[i].prenom} passe au grade ${niv}${niv === 3 ? ' : ' + APPRENTIS[i].talent : ''}`);
    return { i, niv, talent: niv === 3 };
  }
  // seulement quand l'apprenti est là : à la main, rien ne change
  const apprentiTempsMult = (st, i) => { if (!st.stations[i] || !st.stations[i].staff) return 1; const n = gradeApprenti(st, i), t = APPRENTIS[i].temps; return (1 - APPRENTI_VITESSE * (n - 1)) * (n >= 3 && t ? t : 1); };
  const apprentiRevMult = (st, i) => { if (!st.stations[i] || !st.stations[i].staff) return 1; const r = APPRENTIS[i].rev; return gradeApprenti(st, i) >= 3 && r ? r : 1; };

  // ─── le chat de la boutique : il miaule à la porte quand les éclairs sont au menu ; adopté, on le caresse et il porte chance ───
  const CHAT = { chance: 0.2, attente: 60e3, defaut: 'Brioche', apparition: 45, rappel: 30 };
  const nomChat = (nom) => String(nom || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || CHAT.defaut;
  const chatPossible = (st) => !st.chat && !!st.stations[4] && st.stations[4].niv > 0 && st.chatRefuse !== dayKey(st.now);
  function adopterChat(st, nom) { if (st.chat) return { ok: false }; st.chat = { nom: nomChat(nom), caresses: 0, dernier: 0, adopte: st.now }; gagnerXp(st, 10); note(st, `${st.chat.nom} a adopté la boutique`); return { ok: true, chat: st.chat }; }
  function refuserChat(st) { st.chatRefuse = dayKey(st.now); st.chatAttente = CHAT.apparition; }
  function renommerChat(st, nom) { if (!st.chat) return null; st.chat.nom = nomChat(nom); return st.chat.nom; }
  function caresser(st) { // une caresse ; au plus une fois par minute, il porte chance : le client mystère arrive 20 % plus tôt
    if (!st.chat) return { ok: false };
    st.chat.caresses++; let chance = false;
    if (st.now - (st.chat.dernier || 0) >= CHAT.attente) { st.chat.dernier = st.now; st.mystereTimer *= 1 - CHAT.chance; gagnerXp(st, 1); chance = true; }
    return { ok: true, chance, caresses: st.chat.caresses };
  }

  // ─── les recettes de saison : une station à part, cuite à la main, le temps de sa saison ; cent fournées pour la maîtriser ───
  const RECETTES_SAISON = [
    { id: 'galette', nom: 'Galette des rois', pl: 'galettes', tag: 'galette', temps: 8, fin: [1, 20], desc: 'Qui aura la fève ?' },
    { id: 'crepe', nom: 'Crêpes de la Chandeleur', pl: 'crêpes', tag: 'chandeleur', temps: 6, fin: [2, 9], desc: 'Sautées d’une main, la pièce dans l’autre.' },
    { id: 'paques', nom: 'Chocolats de Pâques', pl: 'chocolats', tag: 'paques', temps: 10, fin: [4, 30], desc: 'Des œufs, des poules et des cloches.' },
    { id: 'glace', nom: 'Glaces artisanales', pl: 'glaces', tag: 'ete', temps: 6, fin: [8, 31], desc: 'Deux boules, un cornet.' },
    { id: 'citrouille', nom: 'Tarte à la citrouille', pl: 'tartes à la citrouille', tag: 'halloween', temps: 10, fin: [10, 31], desc: 'Épicée, orange, un peu effrayante.' },
    { id: 'buche', nom: 'Bûche de Noël', pl: 'bûches', tag: 'noel', temps: 12, fin: [12, 31], desc: 'Chocolat, meringue et houx.' },
  ];
  const SAISON = { revSec: 30, coutSec: 300, croiss: 1.5, nivMax: 10, maitrise: 100 };
  let recetteForcee = null;
  const forcerRecette = (id) => { recetteForcee = id || null; }; // tests et captures seulement
  const recetteDeSaison = (ms) => (recetteForcee && RECETTES_SAISON.find((r) => r.id === recetteForcee)) || RECETTES_SAISON.find((r) => saison(ms).includes(r.tag)) || null;
  const recetteSaison = (st) => (st.saison ? RECETTES_SAISON.find((r) => r.id === st.saison.id) || null : null);
  function saisonDuJour(st, nowMs) { // la recette de la saison en cours ; une nouvelle saison repart du niveau 0
    const r = recetteDeSaison(nowMs);
    if (!r) { st.saison = null; return null; }
    if (!st.saison || st.saison.id !== r.id) st.saison = { id: r.id, annee: new Date(nowMs).getFullYear(), niv: 0, prog: 0, actif: false };
    return st.saison;
  }
  const tempsSaison = (st) => { const r = recetteSaison(st); return r ? r.temps * tempsMult(st) : 0; };
  const revenuSaison = (st) => { const s = st.saison; return s && s.niv > 0 ? rythme(st) * SAISON.revSec * (1 + 0.15 * (s.niv - 1)) * boostMult(st) * affluenceMult(st) : 0; };
  const coutSaison = (st) => arrondi(rythme(st) * SAISON.coutSec * Math.pow(SAISON.croiss, st.saison ? st.saison.niv : 0)) * remise(st);
  function preparerSaison(st) { // niveau 0 → 1 : préparer la recette ; ensuite l'améliorer, jusqu'au niveau 10
    const s = st.saison; if (!s || s.niv >= SAISON.nivMax) return { ok: false };
    const prix = coutSaison(st); if (st.coins < prix) return { ok: false, prix };
    st.coins -= prix; s.niv++; noter(st, 'niveaux', 1); if (s.niv === 1) gagnerXp(st, 6);
    return { ok: true, prix, niv: s.niv };
  }
  function lancerSaison(st) { const s = st.saison; if (!s || s.niv <= 0 || s.actif) return false; s.actif = true; s.prog = 0; st.stats.taps++; noter(st, 'mains', 1); return true; }
  function cuireSaison(st, out, differe) { // une fournée de saison sortie du four : gains (sauf si l'absence les compte elle-même), collection, maîtrise
    const s = st.saison, r = recetteSaison(st), m = revenuSaison(st);
    s.prog = 0; s.actif = false; if (!differe) gagner(st, m); st.stats.ventes++; inc(st, 'fourneesSaison');
    st.collection = st.collection || {}; const c = st.collection[s.id] || (st.collection[s.id] = { annee: s.annee, fournees: 0, maitrisee: false });
    c.fournees++; c.annee = s.annee;
    if (!c.maitrisee && c.fournees >= SAISON.maitrise) { c.maitrisee = true; gagnerXp(st, 50); note(st, `${r.nom} : recette maîtrisée`); if (out) out.maitrise = r; }
    return m;
  }

  // ─── le mobilier : six meubles de la boutique, améliorables cran par cran ; tout repart de zéro à chaque boutique ───
  const virg = (x) => String(+x.toFixed(2)).replace('.', ',');
  const MOBILIER = [
    { id: 'tables', nom: 'Tables et chaises', max: 4, cout: 6000, croiss: 40, desc: (k) => `Salon de thé : ${k} table${k > 1 ? 's' : ''}, tous les gains ×${virg(1 + 0.08 * k)}` },
    { id: 'four', nom: 'Four', max: 4, cout: 20000, croiss: 40, desc: (k) => `Toutes les fournées cuisent ${3 * k} % plus vite` },
    { id: 'vitrine', nom: 'Vitrine', max: 3, cout: 30000, croiss: 40, desc: (k) => `Les fournées à la main servent ${25 * k} % de clients en plus` },
    { id: 'caisse', nom: 'Caisse enregistreuse', max: 3, cout: 120000, croiss: 50, desc: (k) => `Pourboires ×${virg(1 + 0.3 * k)}, client mystère ${8 * k} % plus fréquent` },
    { id: 'froid', nom: 'Chambre froide', max: 3, cout: 600000, croiss: 50, desc: (k) => `Les apprentis travaillent ${k} h de plus pendant ton absence` },
    { id: 'deco', nom: 'Décoration', max: 4, cout: 300000, croiss: 40, desc: (k) => `Primes des événements et des défis +${15 * k} %` },
  ];
  const mobilierCran = (st, id) => (st.mobilier && st.mobilier[id]) || 0;
  const prixMeuble = (st, id) => { const m = MOBILIER.find((x) => x.id === id); return m.cout * Math.pow(m.croiss, mobilierCran(st, id)) * (1 - 0.08 * talent(st, 'negoce')); };
  const mobilierMult = (st) => 1 + 0.08 * mobilierCran(st, 'tables');
  function ameliorerMeuble(st, id) {
    const m = MOBILIER.find((x) => x.id === id); if (!m) return { ok: false };
    const cran = mobilierCran(st, id), prix = prixMeuble(st, id);
    if (cran >= m.max || st.coins < prix) return { ok: false, prix, cran, m };
    st.mobilier = st.mobilier || {}; st.coins -= prix; st.mobilier[id] = cran + 1;
    noter(st, 'meuble', 1); gagnerXp(st, 3); inc(st, 'meubles');
    return { ok: true, m, cran: cran + 1, prix };
  }
  // effets des talents et du mobilier
  const tempsMult = (st) => (1 - 0.05 * talent(st, 'mains')) * (1 - 0.03 * mobilierCran(st, 'four'));
  const temps = (st, i) => PRODUITS[i].temps * tempsMult(st) * apprentiTempsMult(st, i);
  const heuresAbsence = (st) => ABSENCE_MAX_H + talent(st, 'levetot') + mobilierCran(st, 'froid');
  const affluenceMult = (st) => 1 + 0.5 * talent(st, 'affluence') + 0.25 * mobilierCran(st, 'vitrine');
  const prixStaff = (st, i) => PRODUITS[i].staff * (1 - 0.1 * talent(st, 'zele'));
  const prixBonus = (st, a) => a.cout * (1 - 0.08 * talent(st, 'negoce'));
  const primeMult = (st) => (1 + 0.25 * talent(st, 'charme')) * (1 + 0.15 * mobilierCran(st, 'deco'));

  // ─── état ───
  function stationsNeuves(ouvertes) { const n = Math.max(1, ouvertes || 1); return PRODUITS.map((p, i) => ({ niv: i < n ? 1 : 0, staff: false, prog: 0, actif: false })); }
  function newState(nowMs) {
    return {
      v: 2, coins: 0, lifetime: 0, lifetimeRun: 0, etoiles: 0, boutiques: 1, xp: 0, talents: {}, nomBoutique: '',
      stations: stationsNeuves(), ameliorations: {}, mobilier: {}, tuto: 0, lastSeen: nowMs, created: nowMs, son: true, vibre: true, mode: 1, now: nowMs,
      stats: { taps: 0, ventes: 0, clients: 0, embauches: 0, commandes: 0, critiques: 0, petrissages: 0, pannes: 0, pourboires: 0, petrissageRecord: 0, meilleurPourboire: 0, meilleureCommande: 0, serieMax: 0, semaines: 0, recetteMax: 0, franchise: false, meubles: 0 },
      jour: null, serie: 0, dernierJourComplet: '', ev: null, evTimer: 180, dernierEv: '', boost: null, mystereTimer: 150, carnetEv: [],
      semaine: null, trophees: {}, habitues: {}, specialite: null, tiroir: 'mi',
      apprentis: {}, chat: null, chatRefuse: '', chatAttente: 45, saison: null, collection: {},
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
    if (i != null && st.jour && st.jour.pain === i) m *= PAIN_DU_JOUR_MULT; // le pain du jour
    if (i != null && st.specialite === i) m *= SPECIALITE_MULT;   // la spécialité de la boutique
    if (st.boost && st.boost.fin > st.now) m *= st.boost.mult;
    if (jourDeMarche(st.now)) m *= MARCHE_MULT;
    return m;
  }
  function revenuBase(st, i) { const s = st.stations[i]; return s.niv <= 0 ? 0 : PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(st, i) * etoileMult(st) * mobilierMult(st) * apprentiRevMult(st, i); }
  function revenu(st, i) { return revenuBase(st, i) * boostMult(st, i); } // par fournée, maintenant
  // niv 0 : débloquer la recette (un cap, cher) ; ensuite chaque niveau coûte quelques fournées de plus que le précédent
  const coutNiveau = (i, niv) => (niv === 0 ? PRODUITS[i].debloquer : PRODUITS[i].cout * Math.pow(PRODUITS[i].croiss, niv));
  function coutNiveaux(i, niv, n) { if (niv === 0) return PRODUITS[i].debloquer; const r = PRODUITS[i].croiss; return PRODUITS[i].cout * Math.pow(r, niv) * (Math.pow(r, n) - 1) / (r - 1); }
  function maxNiveaux(i, niv, coins) { const r = PRODUITS[i].croiss, a = PRODUITS[i].cout * Math.pow(r, niv); if (coins < a) return 0; return Math.floor(Math.log(coins * (r - 1) / a + 1) / Math.log(r)); }
  const remise = (st) => (st.ev && st.ev.type === 'meunier' && st.ev.fin > st.now ? 1 - MEUNIER.remise : 1); // le meunier : tout moins cher
  const prixNiveaux = (st, i, n) => coutNiveaux(i, st.stations[i].niv, n) * remise(st); // prix réel maintenant (remise comprise)
  function quantite(st, i) {
    const s = st.stations[i];
    if (s.niv === 0) return 1;
    if (st.mode === 'max') return Math.max(1, maxNiveaux(i, s.niv, st.coins / remise(st)));
    return st.mode;
  }
  function tauxParSeconde(st) { let t = 0; st.stations.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenu(st, i) / temps(st, i); }); return t; }
  function tauxBase(st) { let t = 0; st.stations.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenuBase(st, i) / temps(st, i); }); return t; }
  // ce que rapporte une fournée maintenant : à la main, le bouche-à-oreille sert plus de clients
  const revenuFournee = (st, i) => revenu(st, i) * (st.stations[i].staff ? 1 : affluenceMult(st));
  // rythme de référence pour calibrer objectifs et primes : les apprentis, sinon la première fournée à la main
  function rythme(st) { const t = tauxBase(st); if (t > 0) return t; let best = 0; st.stations.forEach((s, i) => { if (s.niv > 0) best = Math.max(best, revenuBase(st, i) / Math.max(1, temps(st, i)) * 0.5); }); return Math.max(0.5, best); }
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
    meuble: (st, r) => (MOBILIER.some((m) => mobilierCran(st, m.id) < m.max && prixMeuble(st, m.id) < st.coins + r * 3600) ? { cible: 1, txt: () => 'Améliore un meuble de la boutique' } : null),
    recette: (st, r) => { const i = st.stations.findIndex((s) => s.niv === 0); return i > 0 && PRODUITS[i].debloquer < st.coins + r * 3600 ? { cible: 1, txt: () => `Débloque : ${PRODUITS[i].nom}` } : null; },
  };
  function tirerObjectifs(st, key) {
    const rnd = mulberry32(hashStr(key + ':' + st.boutiques + ':' + st.created)), r = rythme(st);
    const choix = ['gagner'], pool = ['vendre', 'niveaux', 'clients', 'mains', 'embaucher', 'bonus', 'recette', 'meuble'];
    while (choix.length < 3 && pool.length) { const k = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; if (TYPES_OBJ[k](st, r, rnd)) choix.push(k); }
    return choix.map((type) => { const o = TYPES_OBJ[type](st, r, rnd); return { type, i: o.i, cible: o.cible, txt: o.txt(o.cible), progres: 0, fait: false, reclame: false, prime: arrondi(Math.max(40, r * 600) * (1 + 0.5 * talent(st, 'carnet')) * (1 + 0.15 * mobilierCran(st, 'deco'))) }; });
  }
  function possible(st, o) {
    if (o.type === 'mains' || o.type === 'embaucher') return st.stations.some((s) => s.niv > 0 && !s.staff);
    if (o.type === 'recette') return st.stations.some((s) => s.niv === 0);
    if (o.type === 'bonus') return AMELIORATIONS.some((a) => !st.ameliorations[a.id]);
    if (o.type === 'meuble') return MOBILIER.some((m) => mobilierCran(st, m.id) < m.max);
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
  const painDuJour = (st, key) => hashStr(key + ':pain:' + st.created) % PRODUITS.length; // un produit ×2 toute la journée
  function objectifsDuJour(st, nowMs) {
    const key = dayKey(nowMs);
    if (!st.jour || st.jour.date !== key) st.jour = { date: key, objectifs: tirerObjectifs(st, key), etoileDonnee: false, pain: painDuJour(st, key) };
    if (st.jour.pain == null) st.jour.pain = painDuJour(st, key);
    remplacerImpossibles(st);
    semaineEnCours(st, nowMs);
    saisonDuJour(st, nowMs);
    return st.jour;
  }
  // ─── le défi de la semaine : un seul, plus long, du lundi au dimanche ; réussi : une étoile, du savoir-faire, une prime ───
  const semaineKey = (ms) => { const d = new Date(ms), j = (d.getDay() + 6) % 7; return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - j, 12).getTime()); };
  const TYPES_SEM = {
    commandes: () => ({ cible: 8, txt: 'Livre 8 commandes spéciales' }),
    critiques: () => ({ cible: 3, txt: 'Conquiers 3 critiques' }),
    pourboires: () => ({ cible: 12, txt: 'Reçois 12 pourboires du client mystère' }),
    evenements: () => ({ cible: 15, txt: 'Réussis 15 événements' }),
    jours: () => ({ cible: 4, txt: 'Réussis les trois objectifs du jour 4 jours' }),
    boutique: () => ({ cible: 1, txt: 'Ouvre une nouvelle boutique' }),
  };
  function semaineEnCours(st, nowMs) {
    const key = semaineKey(nowMs);
    if (!st.semaine || st.semaine.key !== key) {
      const types = Object.keys(TYPES_SEM), type = types[hashStr(key + ':sem:' + st.created) % types.length], d = TYPES_SEM[type]();
      st.semaine = { key, type, cible: d.cible, txt: d.txt, progres: 0, fait: false, reclame: false };
    }
    return st.semaine;
  }
  function noterSemaine(st, type, n) {
    const sm = st.semaine; if (!sm || sm.fait) return;
    if (sm.type === type || (sm.type === 'evenements' && ['commandes', 'critiques', 'petrissages', 'pannes'].includes(type))) { sm.progres = Math.min(sm.cible, sm.progres + (n == null ? 1 : n)); if (sm.progres >= sm.cible) sm.fait = true; }
  }
  function reclamerSemaine(st) {
    const sm = st.semaine; if (!sm || !sm.fait || sm.reclame) return { ok: false };
    sm.reclame = true; st.etoiles++; inc(st, 'semaines'); const prime = arrondi(Math.max(100, rythme(st) * 1800)); gagner(st, prime, true); gagnerXp(st, 150); note(st, `Défi de la semaine réussi : ${fmtEur(prime)} et une étoile`);
    return { ok: true, prime };
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
    o.reclame = true; gagner(st, o.prime, true); gagnerXp(st, 15);
    let etoile = false;
    if (st.jour.objectifs.every((x) => x.reclame) && !st.jour.etoileDonnee) {
      st.jour.etoileDonnee = true; st.etoiles++; etoile = true; gagnerXp(st, 40); noterSemaine(st, 'jours');
      st.serie = st.dernierJourComplet === hier(st.now) ? st.serie + 1 : 1; st.dernierJourComplet = st.jour.date; st.stats.serieMax = Math.max(st.stats.serieMax || 0, st.serie);
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
  function lancerPetrissage(st) { st.ev = { type: 'petrissage', n: PETRISSAGE.n, taps: 0, debut: st.now, fin: st.now + PETRISSAGE.duree * 1000, prime: arrondi(Math.max(30, rythme(st) * 240) * primeMult(st)) }; return st.ev; }
  function lancerPanne(st, rnd) {
    const idx = st.stations.map((s, i) => i).filter((i) => st.stations[i].staff);
    if (!idx.length) return lancerRush(st);
    const i = idx[Math.floor((rnd || Math.random)() * idx.length)];
    st.ev = { type: 'panne', i, coups: 0, n: PANNE.n, debut: st.now, fin: st.now + PANNE.duree * 1000, prime: arrondi(Math.max(20, rythme(st) * 90) * primeMult(st)) };
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
    donnerBoost(st, CRITIQUE.mult, CRITIQUE.boost); gagnerXp(st, 20); inc(st, 'critiques'); noterSemaine(st, 'critiques'); note(st, `Bonne critique : tout ×${CRITIQUE.mult} pendant ${CRITIQUE.boost / 60} min`); st.ev = null;
    return { ok: true, fini: true };
  }
  function petrir(st) {
    const ev = st.ev; if (!ev || ev.type !== 'petrissage' || ev.fin <= st.now) return { ok: false };
    ev.taps++; if (ev.taps < ev.n) return { ok: true, fini: false, taps: ev.taps };
    gagner(st, ev.prime, true); gagnerXp(st, 10); inc(st, 'petrissages'); noterSemaine(st, 'petrissages'); const duree = (st.now - ev.debut) / 1000; if (!st.stats.petrissageRecord || duree < st.stats.petrissageRecord) st.stats.petrissageRecord = duree; note(st, `Concours de pétrissage gagné : ${fmtEur(ev.prime)}`); st.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function reparer(st) {
    const ev = st.ev; if (!ev || ev.type !== 'panne') return { ok: false };
    ev.coups++; if (ev.coups < ev.n) return { ok: true, fini: false, coups: ev.coups };
    gagner(st, ev.prime, true); gagnerXp(st, 8); inc(st, 'pannes'); noterSemaine(st, 'pannes'); note(st, `Four réparé : ${fmtEur(ev.prime)}`); st.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function lancerCommande(st, rnd) {
    const idx = st.stations.map((s, i) => i).filter((i) => st.stations[i].niv > 0 && PRODUITS[i].temps <= 60);
    if (!idx.length) return lancerRush(st);
    const i = idx[Math.floor(rnd() * idx.length)], s = st.stations[i];
    const n = Math.max(3, Math.min(s.staff ? 500 : 30, arrondi(COMMANDE.duree / PRODUITS[i].temps * (s.staff ? 0.7 : 0.35))));
    st.ev = { type: 'commande', i, n, fait: 0, debut: st.now, fin: st.now + COMMANDE.duree * 1000, prime: arrondi(revenuBase(st, i) * n * COMMANDE.prime * primeMult(st)), livree: false };
    return st.ev;
  }
  function livrer(st) {
    const ev = st.ev;
    if (!ev || ev.type !== 'commande' || ev.fait < ev.n || ev.livree) return { ok: false };
    ev.livree = true; gagner(st, ev.prime, true); gagnerXp(st, 10); inc(st, 'commandes'); st.stats.meilleureCommande = Math.max(st.stats.meilleureCommande || 0, ev.prime); noterSemaine(st, 'commandes'); note(st, `Commande livrée : ${fmtEur(ev.prime)}`);
    st.ev = null;
    return { ok: true, prime: ev.prime };
  }
  const pourboire = (st) => arrondi(Math.max(20, rythme(st) * 120) * (1 + 0.5 * talent(st, 'pourboire')) * (1 + 0.3 * mobilierCran(st, 'caisse')));
  function encaisserPourboire(st) { const tip = pourboire(st); gagner(st, tip, true); gagnerXp(st, 3); inc(st, 'pourboires'); st.stats.meilleurPourboire = Math.max(st.stats.meilleurPourboire || 0, tip); noterSemaine(st, 'pourboires'); note(st, `Pourboire du client mystère : ${fmtEur(tip)}`); return tip; }
  // ─── les habitués : trois clients fidèles qui passent à heure fixe, une fois par jour ; cinq jours de suite, un cadeau ───
  const HABITUES = [
    { id: 'dupuis', nom: 'Mme Dupuis', debut: 7, fin: 10, haut: '#8A2B3A', cheveux: '#D9D9D9', peau: '#FFD7B5', coiffure: 2, phrase: 'Ma baguette bien cuite, comme toujours !' },
    { id: 'marco', nom: 'Marco', debut: 12, fin: 14.5, haut: '#2B5BD7', cheveux: '#2B2118', peau: '#C68B59', coiffure: 0, phrase: 'Deux croissants, et vite, j’ai une réunion.' },
    { id: 'lena', nom: 'Léna', debut: 17, fin: 20, haut: '#5FD3A4', cheveux: '#B8762E', peau: '#F1B990', coiffure: 1, phrase: 'Un éclair pour fêter la fin de la journée !' },
  ];
  function habitueAttendu(st, nowMs) {
    const d = new Date(nowMs), h = d.getHours() + d.getMinutes() / 60, key = dayKey(nowMs);
    st.habitues = st.habitues || {};
    return HABITUES.find((x) => h >= x.debut && h < x.fin && (!st.habitues[x.id] || st.habitues[x.id].vuLe !== key)) || null;
  }
  function servirHabitue(st, id) {
    const hb = HABITUES.find((x) => x.id === id); if (!hb) return { ok: false };
    st.habitues = st.habitues || {}; const e = st.habitues[id] || (st.habitues[id] = { jours: 0, dernier: '', vuLe: '' });
    const key = dayKey(st.now); if (e.dernier === key) return { ok: false };
    e.jours = e.dernier === hier(st.now) ? e.jours + 1 : 1; e.dernier = key; gagnerXp(st, 8);
    let cadeau = 0;
    if (e.jours % 5 === 0) { cadeau = arrondi(Math.max(50, rythme(st) * 600)); gagner(st, cadeau, true); note(st, `${hb.nom}, fidèle depuis ${e.jours} jours : cadeau de ${fmtEur(cadeau)}`); }
    return { ok: true, jours: e.jours, cadeau, hb };
  }
  // ─── la spécialité de la boutique : un produit ×2 le temps de cette boutique, choisi à l'ouverture ───
  function choisirSpecialite(st, i) { if (st.specialite != null || i < 0 || i >= PRODUITS.length) return { ok: false }; st.specialite = i; note(st, `Spécialité de la boutique : ${PRODUITS[i].nom}`); return { ok: true }; }
  // ─── les trophées : des succès permanents, chacun offre du savoir-faire ───
  const TROPHEES = [
    { id: 'premiere', nom: 'Première fournée', desc: 'Vendre une fournée', xp: 10, cond: (st) => st.stats.ventes >= 1 },
    { id: 'cent', nom: 'Cent fournées', desc: 'Vendre 100 fournées', xp: 20, cond: (st) => st.stats.ventes >= 100 },
    { id: 'dixmille', nom: 'Dix mille fournées', desc: 'Vendre 10 000 fournées', xp: 40, cond: (st) => st.stats.ventes >= 1e4 },
    { id: 'million', nom: 'Le million', desc: 'Vendre un million de fournées', xp: 100, cond: (st) => st.stats.ventes >= 1e6 },
    { id: 'equipe', nom: 'Une équipe', desc: 'Embaucher 4 apprentis', xp: 20, cond: (st) => (st.stats.embauches || 0) >= 4 },
    { id: 'grande-equipe', nom: 'Grande équipe', desc: 'Embaucher 24 apprentis en tout', xp: 50, cond: (st) => (st.stats.embauches || 0) >= 24 },
    { id: 'livreur', nom: 'Livreur', desc: 'Livrer 10 commandes spéciales', xp: 30, cond: (st) => (st.stats.commandes || 0) >= 10 },
    { id: 'traiteur', nom: 'Traiteur', desc: 'Livrer 100 commandes spéciales', xp: 80, cond: (st) => (st.stats.commandes || 0) >= 100 },
    { id: 'presse', nom: 'Bonne presse', desc: 'Conquérir un critique', xp: 20, cond: (st) => (st.stats.critiques || 0) >= 1 },
    { id: 'etoile', nom: 'Table étoilée', desc: 'Conquérir 10 critiques', xp: 60, cond: (st) => (st.stats.critiques || 0) >= 10 },
    { id: 'bras', nom: 'Bras d’acier', desc: 'Gagner 10 concours de pétrissage', xp: 30, cond: (st) => (st.stats.petrissages || 0) >= 10 },
    { id: 'eclair', nom: 'Rapide comme l’éclair', desc: 'Un pétrissage en moins de 8 s', xp: 40, cond: (st) => st.stats.petrissageRecord > 0 && st.stats.petrissageRecord <= 8 },
    { id: 'bricoleur', nom: 'Bricoleur', desc: 'Réparer 10 fours', xp: 30, cond: (st) => (st.stats.pannes || 0) >= 10 },
    { id: 'mystere', nom: 'Un mystère résolu', desc: '10 pourboires du client mystère', xp: 30, cond: (st) => (st.stats.pourboires || 0) >= 10 },
    { id: 'genereux', nom: 'Clients généreux', desc: '100 pourboires du client mystère', xp: 80, cond: (st) => (st.stats.pourboires || 0) >= 100 },
    { id: 'etoiles10', nom: 'Dix étoiles', desc: 'Posséder 10 étoiles', xp: 20, cond: (st) => st.etoiles >= 10 },
    { id: 'etoiles100', nom: 'Cent étoiles', desc: 'Posséder 100 étoiles', xp: 50, cond: (st) => st.etoiles >= 100 },
    { id: 'etoiles1000', nom: 'Mille étoiles', desc: 'Posséder 1 000 étoiles', xp: 100, cond: (st) => st.etoiles >= 1000 },
    { id: 'boutique2', nom: 'On déménage', desc: 'Ouvrir une deuxième boutique', xp: 20, cond: (st) => st.boutiques >= 2 },
    { id: 'boutique5', nom: 'Petite chaîne', desc: 'Ouvrir cinq boutiques', xp: 50, cond: (st) => st.boutiques >= 5 },
    { id: 'boutique10', nom: 'Dix boutiques', desc: 'Ouvrir dix boutiques', xp: 100, cond: (st) => st.boutiques >= 10 },
    { id: 'semaine', nom: 'Semaine parfaite', desc: 'Les trois objectifs du jour 7 jours d’affilée', xp: 60, cond: (st) => (st.stats.serieMax || 0) >= 7 },
    { id: 'defi', nom: 'Défi relevé', desc: 'Réussir un défi de la semaine', xp: 30, cond: (st) => (st.stats.semaines || 0) >= 1 },
    { id: 'piece', nom: 'Pièce montée', desc: 'Débloquer la pièce montée', xp: 40, cond: (st) => (st.stats.recetteMax || 0) >= 7 },
    { id: 'franchise', nom: 'Franchisé', desc: 'Acheter le Réseau de franchises', xp: 60, cond: (st) => !!st.stats.franchise },
    { id: 'compagnon', nom: 'Compagnon', desc: 'Atteindre le titre de Compagnon', xp: 40, cond: (st) => niveau(st) >= 13 },
    { id: 'mof', nom: 'Meilleur Ouvrier de France', desc: 'Atteindre le titre suprême', xp: 150, cond: (st) => niveau(st) >= 26 },
    { id: 'fidele', nom: 'Habitué fidèle', desc: 'Servir un habitué 5 jours de suite', xp: 40, cond: (st) => Object.values(st.habitues || {}).some((e) => e.jours >= 5) },
    { id: 'salon', nom: 'Salon de thé', desc: 'Tables et chaises au maximum', xp: 30, cond: (st) => mobilierCran(st, 'tables') >= 4 },
    { id: 'decorateur', nom: 'Décorateur', desc: 'Améliorer 40 meubles en tout', xp: 50, cond: (st) => (st.stats.meubles || 0) >= 40 },
    { id: 'grade', nom: 'Chef de partie', desc: 'Un apprenti au grade 3', xp: 30, cond: (st) => PRODUITS.some((p, i) => gradeApprenti(st, i) >= 3) },
    { id: 'brigade', nom: 'Brigade étoilée', desc: 'Quatre apprentis au grade 5', xp: 100, cond: (st) => PRODUITS.filter((p, i) => gradeApprenti(st, i) >= 5).length >= 4 },
    { id: 'ronron', nom: 'Ronron', desc: 'Caresser le chat 100 fois', xp: 30, cond: (st) => !!st.chat && st.chat.caresses >= 100 },
    { id: 'saison1', nom: 'Recette de saison', desc: 'Maîtriser une recette de saison', xp: 30, cond: (st) => Object.values(st.collection || {}).some((c) => c.maitrisee) },
    { id: 'saisons4', nom: 'Quatre saisons', desc: 'Maîtriser quatre recettes de saison', xp: 80, cond: (st) => Object.values(st.collection || {}).filter((c) => c.maitrisee).length >= 4 },
  ];
  function verifierTrophees(st) {
    st.trophees = st.trophees || {}; const neufs = [];
    for (const t of TROPHEES) if (!st.trophees[t.id] && t.cond(st)) { st.trophees[t.id] = st.now; gagnerXp(st, t.xp); note(st, `Trophée : ${t.nom}`); neufs.push(t); }
    return neufs;
  }
  function donnerBoost(st, mult, secs) { st.boost = { mult, fin: st.now + secs * 1000 }; }

  // ─── actions ───
  function gagner(st, montant, horsObjectif) { st.coins += montant; st.lifetime += montant; st.lifetimeRun += montant; if (!horsObjectif) noter(st, 'gagner', montant); }
  function acheter(st, i) {
    const s = st.stations[i], n = quantite(st, i), prix = prixNiveaux(st, i, n);
    if (st.coins < prix) return { ok: false, prix };
    st.coins -= prix;
    let xp = 0;
    if (s.niv === 0) { noter(st, 'recette', 1); xp = 10 + 10 * i; st.stats.recetteMax = Math.max(st.stats.recetteMax || 0, i); } else { noter(st, 'niveaux', n); xp = 8 * (PALIERS.filter((p) => s.niv + n >= p).length - PALIERS.filter((p) => s.niv >= p).length); }
    s.niv += n;
    if (xp) gagnerXp(st, xp);
    return { ok: true, n, prix, xp };
  }
  function embaucher(st, i) {
    const s = st.stations[i], prix = prixStaff(st, i);
    if (s.staff || s.niv <= 0 || st.coins < prix) return { ok: false, prix };
    st.coins -= prix; s.staff = true; s.actif = true; noter(st, 'embaucher', 1); gagnerXp(st, 5 + 3 * i); inc(st, 'embauches');
    return { ok: true, prix };
  }
  function lancer(st, i) {
    const s = st.stations[i];
    if (s.niv <= 0 || s.actif) return false;
    s.actif = true; s.prog = 0; st.stats.taps++; noter(st, 'mains', 1);
    return true;
  }
  function amelioration(st, id) {
    const a = AMELIORATIONS.find((x) => x.id === id), prix = a ? prixBonus(st, a) : 0;
    if (!a || st.ameliorations[id] || st.coins < prix) return { ok: false, prix };
    st.coins -= prix; st.ameliorations[id] = true; noter(st, 'bonus', 1); gagnerXp(st, 6); if (id === 'franchise') st.stats.franchise = true;
    return { ok: true, a, prix };
  }
  function nouvelleBoutique(st, nowMs) {
    const gain = etoilesGagnables(st);
    if (gain <= 0) return { ok: false };
    st.etoiles += gain; st.boutiques++; st.nomBoutique = ''; st.specialite = null; gagnerXp(st, 80 + Math.min(120, 2 * gain)); noterSemaine(st, 'boutique');
    st.coins = 0; st.lifetimeRun = 0; st.ameliorations = {}; st.mobilier = {}; st.stations = stationsNeuves(1 + talent(st, 'memoire')); st.ev = null; st.boost = null;
    if (st.saison) st.saison = { id: st.saison.id, annee: st.saison.annee, niv: 0, prog: 0, actif: false }; // les grades des apprentis, le chat et la collection restent
    st.lastSeen = nowMs;
    // les objectifs du jour pas encore réclamés sont retirés à la taille de la nouvelle boutique (les réussis restent acquis)
    if (st.jour) { const neufs = tirerObjectifs(st, st.jour.date); st.jour.objectifs = st.jour.objectifs.map((o, k) => (o.reclame ? o : neufs[k])); }
    return { ok: true, gain };
  }

  // ─── un pas de jeu ; rend {ventes, nouvelEv, finEv, mystere} ───
  function tick(st, dt, nowMs, rnd) {
    st.now = nowMs; rnd = rnd || Math.random;
    const out = { ventes: [], nouvelEv: null, finEv: null, mystere: false, habitue: null, trophees: [], grades: [], chat: false, saison: null, venteSaison: null, maitrise: null };
    const saisonAvant = st.saison && st.saison.id;
    objectifsDuJour(st, nowMs);
    if (st.saison && st.saison.id !== saisonAvant) out.saison = recetteSaison(st); // une nouvelle recette de saison
    st.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      if (st.ev && st.ev.type === 'panne' && st.ev.i === i) return; // le four est en panne
      const T = temps(st, i);
      s.prog += dt;
      if (s.prog < T) return;
      let n = Math.floor(s.prog / T);
      if (!s.staff) { n = 1; s.prog = 0; s.actif = false; } else s.prog -= n * T;
      const montant = revenuFournee(st, i) * n;
      gagner(st, montant); st.stats.ventes += n; noter(st, 'vendre', n, i);
      if (s.staff) { const g = creditApprenti(st, i, n); if (g) out.grades.push(g); }
      if (st.ev && st.ev.type === 'commande' && st.ev.i === i) st.ev.fait = Math.min(st.ev.n, st.ev.fait + n);
      out.ventes.push({ i, montant, n });
    });
    // fin d'événement (la commande prête attend sa livraison) ; puis le suivant dans 3 à 7 minutes
    if (st.ev && st.ev.fin <= nowMs && !(st.ev.type === 'commande' && st.ev.fait >= st.ev.n)) { out.finEv = st.ev; st.ev = null; }
    if (!st.ev) {
      st.evTimer -= dt;
      if (st.evTimer <= 0) { st.evTimer = (180 + rnd() * 240) * (1 - 0.12 * talent(st, 'charme')); out.nouvelEv = lancerEvenement(st, rnd); }
    }
    if (st.boost && st.boost.fin <= nowMs) st.boost = null;
    const ss = st.saison; // la fournée de saison
    if (ss && ss.actif) { ss.prog += dt; if (ss.prog >= tempsSaison(st)) out.venteSaison = { id: ss.id, montant: cuireSaison(st, out) }; }
    if (chatPossible(st)) { st.chatAttente = (st.chatAttente == null ? CHAT.apparition : st.chatAttente) - dt; if (st.chatAttente <= 0) { st.chatAttente = CHAT.rappel; out.chat = true; } } // un chat miaule à la porte
    st.mystereTimer -= dt;
    if (st.mystereTimer <= 0) { st.mystereTimer = (150 + rnd() * 200) * (1 - 0.15 * talent(st, 'pourboire')) * (1 - 0.08 * mobilierCran(st, 'caisse')); out.mystere = true; }
    const hb = habitueAttendu(st, nowMs); // un habitué passe une fois par jour, pendant son créneau, après quelques secondes de jeu
    if (hb && rnd() < dt / 25) { st.habitues[hb.id] = st.habitues[hb.id] || { jours: 0, dernier: '', vuLe: '' }; st.habitues[hb.id].vuLe = dayKey(nowMs); out.habitue = hb; }
    out.trophees = verifierTrophees(st);
    return out;
  }
  // ─── absence : les apprentis ont travaillé (8 h au plus), les fournées en cours se terminent ; pas d'événement sans toi ───
  function absence(st, nowMs) {
    st.now = nowMs; st.ev = null; st.boost = null;
    const secs = Math.min(heuresAbsence(st) * 3600, Math.max(0, (nowMs - st.lastSeen) / 1000));
    let total = 0; const detail = [], grades = [];
    st.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(st, i);
      if (s.staff) {
        const n = Math.floor((s.prog + secs) / T);
        s.prog = (s.prog + secs) % T;
        if (n > 0) { const m = revenu(st, i) * n; total += m; detail.push({ i, n, m }); st.stats.ventes += n; const g = creditApprenti(st, i, n); if (g) grades.push(g); }
      } else if (s.prog + secs >= T) { const m = revenuFournee(st, i); total += m; detail.push({ i, n: 1, m }); s.prog = 0; s.actif = false; st.stats.ventes++; }
      else s.prog += secs;
    });
    const ss = st.saison; // une fournée de saison lancée avant de partir se termine
    if (ss && ss.actif && ss.prog + secs >= tempsSaison(st)) { const r = recetteSaison(st), m = cuireSaison(st, null, true); total += m; detail.push({ i: -1, nom: r.nom, n: 1, m }); } else if (ss && ss.actif) ss.prog += secs;
    if (total > 0) gagner(st, total, true);
    st.lastSeen = nowMs;
    return { secs, total, detail, grades };
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

  return { APPRENTIS, APPRENTI_NIVEAUX, APPRENTI_VITESSE, xpApprenti, gradeApprenti, progresApprenti, creditApprenti, apprentiTempsMult, apprentiRevMult, effetTalentApprenti,
    CHAT, chatPossible, adopterChat, refuserChat, renommerChat, caresser,
    RECETTES_SAISON, SAISON, recetteDeSaison, forcerRecette, recetteSaison, saisonDuJour, tempsSaison, revenuSaison, coutSaison, preparerSaison, lancerSaison,
    PRODUITS, PALIERS, AMELIORATIONS, MOBILIER, mobilierCran, prixMeuble, mobilierMult, ameliorerMeuble, ETOILE_BONUS, ETOILE_BASE, ETOILE_FREIN, ABSENCE_MAX_H, TITRES, TALENTS, XP_NIVEAU, QUARTIERS, quartier, nomBoutique, renommer, saison, HABITUES, TROPHEES, PAIN_DU_JOUR_MULT, SPECIALITE_MULT, RUSH, COMMANDE, CRITIQUE, MEUNIER, PETRISSAGE, PANNE, ANNIVERSAIRE, EVENEMENTS, MARCHE_MULT, newState, dayKey, jourDeMarche, heureDePointe, arrondi,
    palierMult, prochainPalier, ameliorationMult, etoileMult, boostMult, revenu, revenuBase, revenuFournee, coutNiveau, coutNiveaux, maxNiveaux, remise, prixNiveaux, prixStaff, prixBonus, primeMult, temps, tempsMult, heuresAbsence, affluenceMult, quantite,
    talent, niveauPour, niveau, titre, rangTitre, ptsTalents, gagnerXp, apprendre, tauxParSeconde, tauxBase, rythme, etoilesPour, etoilesGagnables,
    objectifsDuJour, noter, reclamer, serieEnCours, painDuJour, semaineKey, semaineEnCours, noterSemaine, reclamerSemaine, habitueAttendu, servirHabitue, choisirSpecialite, verifierTrophees, lancerEvenement, lancerRush, lancerCommande, lancerCritique, lancerMeunier, lancerPetrissage, lancerPanne, lancerAnniversaire, livrer, servir, petrir, reparer, pourboire, encaisserPourboire, donnerBoost,
    gagner, acheter, embaucher, lancer, amelioration, nouvelleBoutique, tick, absence, fmt, fmtEur, fmtDuree, fmtChrono };
});
