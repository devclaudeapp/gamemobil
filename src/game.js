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
  const PAUSE_EV = 600;          // une sortie de 10 min au plus (autre appli, écran verrouillé sans le vouloir) : l'événement en cours et le coup de feu attendent
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
    const d = paris(ms), m = d.getUTCMonth() + 1, j = d.getUTCDate(), tags = [];
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
  const APPRENTI_NIVEAUX = [0, 129600, 518400, 1555200, 4860000]; // grades 1 à 5 : 36 h, 144 h, 432 h puis 1 350 h de fournil, en secondes réelles de cuisson
  const APPRENTI_VITESSE = 0.02;                                 // −2 % de temps de cuisson par grade au-delà du premier
  const APPRENTI_ABSENCE = 0.5;                                  // pendant une absence, la moitié du temps compte (réglés sur les garde-fous de longévité, à plusieurs dates de départ)
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
  function creditApprenti(st, i, n, part) { // n fournées cuites par l'apprenti du produit i (part : la fraction qui compte) ; rend { i, niv, talent } s'il monte de grade
    st.apprentis = st.apprentis || {}; const a = st.apprentis[PRODUITS[i].id] || (st.apprentis[PRODUITS[i].id] = { xp: 0 });
    const avant = gradeApprenti(st, i); a.xp += n * temps(st, i) * (part == null ? 1 : part); const niv = gradeApprenti(st, i);
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
  // le pelage du chat : roux depuis toujours ; noir d'office pendant la Maison hantée (src/hantee.js : l'appelant dit si elle est ouverte),
  // et, une fois le chat noir gagné (un palier de l'événement : donnerChatNoir), un compagnon au choix (voir COMPAGNONS plus bas).
  // st.chatNoir : gagné (à vie) ; st.chatPelage : l'ancien choix ('roux' par défaut), tenu à jour pour les cartes qui le lisent encore.
  const PELAGES = ['roux', 'noir'];
  function donnerChatNoir(st) { const nouveau = !st.chatNoir; st.chatNoir = true; if (nouveau) note(st, 'Le chat noir : un nouveau compagnon pour la boutique'); return { nouveau }; }
  function choisirPelage(st, p) { if (!PELAGES.includes(p) || (p === 'noir' && !st.chatNoir)) return false; st.chatPelage = p; st.compagnon = p === 'noir' ? 'chat-noir' : 'chat-roux'; return true; } // l'ancien choix du pelage : un des deux chats
  const pelagesChat = (st) => (st.chatNoir ? PELAGES.slice() : ['roux']); // les pelages au choix
  function pelageChat(st, halloween) { return modeleCompagnon(st, halloween) === 'chat-noir' ? 'noir' : 'roux'; } // le pelage du chat montré (un autre animal : 'roux', sans objet)
  const nomChat = (nom, defaut) => String(nom || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || defaut || CHAT.defaut;
  const chatPossible = (st) => !st.chat && !!st.stations[4] && st.stations[4].niv > 0 && st.chatRefuse !== dayKey(st.now);
  function adopterChat(st, nom, id) { // le compagnon arrive : le chat à la porte, ou l'animal choisi avant lui (id) ; st.chat garde nom, caresses et chance, quel que soit l'animal
    if (st.chat) return { ok: false };
    const c = compagnon(id) || compagnon(compagnonActif(st));
    st.chat = { nom: nomChat(nom, c.nomDefaut), caresses: 0, dernier: 0, adopte: st.now }; st.compagnon = c.id; gagnerXp(st, 10); note(st, `${st.chat.nom} a adopté la boutique`);
    return { ok: true, chat: st.chat, compagnon: c };
  }
  function refuserChat(st) { st.chatRefuse = dayKey(st.now); st.chatAttente = CHAT.apparition; }
  function renommerChat(st, nom) { if (!st.chat) return null; st.chat.nom = nomChat(nom, compagnon(compagnonActif(st)).nomDefaut); return st.chat.nom; }
  function caresser(st) { // une caresse ; au plus une fois par minute, il porte chance : le client mystère arrive 20 % plus tôt
    if (!st.chat) return { ok: false };
    st.chat.caresses++; let chance = false;
    if (st.now - (st.chat.dernier || 0) >= CHAT.attente) { st.chat.dernier = st.now; st.mystereTimer *= 1 - CHAT.chance; gagnerXp(st, 1); chance = true; }
    return { ok: true, chance, caresses: st.chat.caresses };
  }
  // ─── les compagnons : l'animal de la boutique, au choix (le chat roux de toujours, un chien, un lapin… jusqu'au mini-dragon) ───
  // st.chat reste LE compagnon (nom, caresses, chance du client mystère, trophée Ronron), quel que soit l'animal. st.compagnon : l'id de
  // l'animal montré (null avant le premier compagnon ; une vieille sauvegarde : le chat roux, ou noir s'il l'avait choisi) ; st.compagnons :
  // les ids ACHETÉS, à vie (une nouvelle boutique n'y touche pas). Les gratuits sont à tout le monde ; le chat noir se gagne à la Maison
  // hantée (st.chatNoir), le chien du quartier au palier 11 du Quartier (st.quartier). Les payants coûtent des minutes des gains de la boutique, comme les primes : max(plancher, rythme × 60 × minutes),
  // arrondi. Le plancher (COMPAGNON_PLANCHER € par minute de prix) tient le tout début, quand le rythme ne vaut que quelques euros par
  // seconde : la poule y coûte 20 000 €, à peu près l'embauche d'Inès (22 500 €), le mini-dragon 480 000 € ; passé ~17 €/s de rythme
  // (la première heure), seul compte le temps de gains. Aucun point de boulanger : un compagnon fait de la compagnie, et donne son petit bonus (bonus, plus bas).
  // Pour scene.js / persos.js : modeleCompagnon(st, halloween) (pendant la Maison hantée, un chat est noir ; les autres restent eux-mêmes).
  // cri : le son de la caresse (src/sons.js) ; null : le ronron.
  // bonus : un petit avantage, propre à chaque animal, seulement pour celui qu'on montre (le compagnon actif, une fois adopté), à vie et sans
  // point de boulanger : { gains: { pct } } tous les gains, { vitesse } % de cuisson plus rapide, { absence } heures d'absence en plus,
  // { pourboire } % de pourboires du client mystère. Les mêmes formes que la garde-robe (texteBonus) ; de 2 à 7 %, ou une demi-heure à 1 h 30.
  const COMPAGNON_PLANCHER = 1000;
  // le chien du quartier : gagné au palier 11 du Quartier (src/quartier.js : la déco « chien », ou le palier marqué). Lu sur st.quartier, qui
  // reste dans la sauvegarde après l'événement : qui a fini le Quartier avant cette version l'a aussi, sans rien refaire.
  const chienDuQuartier = (st) => { const q = st && st.quartier; return !!q && typeof q === 'object' && ((Array.isArray(q.decos) && q.decos.includes('chien')) || (Array.isArray(q.paliers) && q.paliers.includes(11))); };
  const COMPAGNONS = [
    { id: 'chat-roux', nom: 'Chat roux', espece: 'chat', prix: null, condition: null, nomDefaut: 'Brioche', cri: null, bonus: { pourboire: 5 }, phrase: 'Le chat de toujours : il dort sur le comptoir et ronronne pour un rien.' },
    { id: 'chien', nom: 'Chien', espece: 'chien', prix: null, condition: null, nomDefaut: 'Biscotte', cri: 'wouf', bonus: { absence: 0.5 }, phrase: 'Un petit corniaud beige. Il remue tout l’arrière-train quand on entre.' },
    { id: 'lapin', nom: 'Lapin', espece: 'lapin', prix: null, condition: null, nomDefaut: 'Pompon', cri: 'couic', bonus: { vitesse: 2 }, phrase: 'Il sautille entre les tables et grignote les miettes de pain d’épices.' },
    { id: 'chat-noir', nom: 'Chat noir', espece: 'chat', prix: null, condition: (st) => !!st.chatNoir, gagne: 'Gagné à la Maison hantée', verrou: 'Pendant Halloween', nomDefaut: 'Réglisse', cri: null, bonus: { gains: { pct: 2 } }, phrase: 'Robe noire, yeux jaunes : le souvenir de la Maison hantée.' },
    { id: 'chien-quartier', nom: 'Chien du quartier', espece: 'chien', prix: null, condition: chienDuQuartier, gagne: 'Gagné au Quartier', verrou: 'Au palier 11 du Quartier', nomDefaut: 'Caïd', cri: 'woufgrave', bonus: { gains: { pct: 5 } }, phrase: 'Bandana, chaîne en or et regard de videur : il garde la vitrine, et il n’a jamais rendu une baballe.' },
    { id: 'poule', nom: 'Poule', espece: 'poule', prix: 20, condition: null, nomDefaut: 'Cocotte', cri: 'cotcot', bonus: { gains: { pct: 2 } }, phrase: 'Elle picore les miettes et surveille le four d’un œil sévère.' },
    { id: 'canard', nom: 'Canard', espece: 'canard', prix: 30, condition: null, nomDefaut: 'Coincoin', cri: 'coincoin', bonus: { pourboire: 10 }, phrase: 'Il cancane à chaque client. On dit qu’il préfère la brioche.' },
    { id: 'herisson', nom: 'Hérisson', espece: 'herisson', prix: 45, condition: null, nomDefaut: 'Châtaigne', cri: null, bonus: { absence: 1 }, phrase: 'Tout rond, tout piquant : il se roule en boule sous les tables.' },
    { id: 'pingouin', nom: 'Pingouin', espece: 'pingouin', prix: 60, condition: null, nomDefaut: 'Smoking', cri: 'couac', bonus: { vitesse: 3 }, phrase: 'Toujours en tenue de soirée. Il adore la chambre froide.' },
    { id: 'raton', nom: 'Raton laveur', espece: 'raton', prix: 90, condition: null, nomDefaut: 'Filou', cri: null, bonus: { gains: { pct: 3 } }, phrase: 'Masque de bandit, mains propres : il lave chaque croissant avant de le chiper.' },
    { id: 'escargot', nom: 'Escargot géant', espece: 'escargot', prix: 120, condition: null, nomDefaut: 'Turbo', cri: null, bonus: { absence: 1.5 }, phrase: 'Gros comme une miche, lent comme un dimanche. Il glisse.' },
    { id: 'teckel', nom: 'Teckel-baguette', espece: 'teckel', prix: 180, condition: null, nomDefaut: 'Tradition', cri: 'wouf', bonus: { gains: { pct: 4 } }, phrase: 'Son corps est une baguette dorée. Croustillant dehors, fidèle dedans.' },
    { id: 'croissant', nom: 'Croissant vivant', espece: 'croissant', prix: 300, condition: null, nomDefaut: 'Feuilleté', cri: null, bonus: { vitesse: 5 }, phrase: 'Pur beurre, sur pattes. Il rebondit partout et refuse qu’on le trempe.' },
    { id: 'dragon', nom: 'Mini-dragon', espece: 'dragon', prix: 480, condition: null, nomDefaut: 'Fournaise', cri: null, bonus: { vitesse: 7 }, phrase: 'Il allume le four d’un hoquet et crache un nuage de farine quand on le caresse.' },
  ];
  const COMPAGNON_PAR_ID = new Map(COMPAGNONS.map((c) => [c.id, c]));
  const compagnon = (id) => (id && COMPAGNON_PAR_ID.get(id)) || null; // (lu à chaque fournée, par bonusCompagnon : une table, sans rien allouer)
  const estChat = (id) => { const c = compagnon(id); return !!c && c.espece === 'chat'; };
  const prixCompagnon = (st, id) => { const c = compagnon(id); return c && c.prix != null ? arrondi(Math.max(COMPAGNON_PLANCHER * c.prix, rythme(st) * 60 * c.prix)) : null; }; // null : il ne s'achète pas
  function aCompagnon(st, id) { // à soi : un gratuit, le chat noir gagné, ou un payant acheté
    const c = compagnon(id); if (!c) return false;
    if (c.prix == null) return !c.condition || c.condition(st);
    return Array.isArray(st.compagnons) && st.compagnons.includes(id);
  }
  function compagnonActif(st) { // l'id de l'animal choisi ; une vieille sauvegarde : le chat, noir s'il l'avait choisi
    if (st.compagnon && aCompagnon(st, st.compagnon)) return st.compagnon;
    return st.chatNoir && st.chatPelage === 'noir' ? 'chat-noir' : 'chat-roux';
  }
  const BONUS_VIDE = Object.freeze({});
  const bonusCompagnon = (st) => { if (!st || !st.chat) return BONUS_VIDE; const c = compagnon(compagnonActif(st)); return (c && c.bonus) || BONUS_VIDE; }; // le compagnon actif ; pas encore adopté : rien
  const compagnonGains = (st) => { const x = bonusCompagnon(st); return x.gains ? 1 + x.gains.pct / 100 : 1; };
  const modeleCompagnon = (st, halloween) => { const id = compagnonActif(st); return halloween && estChat(id) ? 'chat-noir' : id; };
  function compagnons(st) { // les compagnons remis d'aplomb (une vieille sauvegarde, un id disparu, un doublon) ; rend la liste des achetés
    const vus = new Set(); st.compagnons = (Array.isArray(st.compagnons) ? st.compagnons : []).filter((id) => { const c = compagnon(id); if (!c || c.prix == null || vus.has(id)) return false; vus.add(id); return true; });
    if (st.compagnon != null && !aCompagnon(st, st.compagnon)) st.compagnon = null;
    if (st.compagnon == null && st.chat) st.compagnon = compagnonActif(st); // un chat déjà adopté devient le compagnon « chat-roux » (ou « chat-noir »)
    return st.compagnons;
  }
  function choisirCompagnon(st, id) { // montrer cet animal ; choisi avant que le chat n'arrive : il est adopté tout de suite
    const c = compagnon(id); if (!c || !aCompagnon(st, id)) return { ok: false };
    compagnons(st); const adopte = !st.chat;
    if (adopte) adopterChat(st, '', id); else st.compagnon = id;
    if (c.espece === 'chat') st.chatPelage = id === 'chat-noir' ? 'noir' : 'roux'; // l'ancien champ suit
    return { ok: true, compagnon: c, adopte };
  }
  function acheterCompagnon(st, id) { // payé une fois, à soi pour toujours, et choisi tout de suite
    const c = compagnon(id); if (!c) return { ok: false, raison: 'inconnu' };
    if (aCompagnon(st, id)) return { ok: false, raison: 'possede' };
    const prix = prixCompagnon(st, id); if (prix == null) return { ok: false, raison: 'gratuit' }; // le chat noir pas encore gagné
    if (st.coins < prix) return { ok: false, raison: 'argent', prix };
    st.coins -= prix; compagnons(st).push(id); inc(st, 'compagnons'); gagnerXp(st, 5); note(st, `${c.nom} : un nouveau compagnon pour la boutique`);
    return { ok: true, prix, compagnon: c, adopte: choisirCompagnon(st, id).adopte };
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
  // une fournée rapporte le temps qu'elle a pris, au rythme des apprentis (×1 au niveau 1, ×1,9 au niveau 10) : jouer la saison double au plus les gains de la session
  const SAISON = { part: 1, pas: 0.1, coutSec: 300, croiss: 1.5, nivMax: 10, maitrise: 100 };
  let recetteForcee = null;
  const forcerRecette = (id) => { recetteForcee = id || null; }; // tests et captures seulement
  const recetteDeSaison = (ms) => (recetteForcee && RECETTES_SAISON.find((r) => r.id === recetteForcee)) || RECETTES_SAISON.find((r) => saison(ms).includes(r.tag)) || null;
  const recetteSaison = (st) => (st.saison ? RECETTES_SAISON.find((r) => r.id === st.saison.id) || null : null);
  function saisonDuJour(st, nowMs) { // la recette de la saison en cours ; une nouvelle saison (ou la même, l'année suivante) repart du niveau 0
    const r = recetteDeSaison(nowMs), an = paris(nowMs).getUTCFullYear(), s = st.saison;
    if (s && s.actif && (!r || s.id !== r.id || s.annee !== an)) cuireSaison(st, null); // la fournée au four sort quand même, comme pendant une absence
    if (!r) { st.saison = null; return null; }
    if (!st.saison || st.saison.id !== r.id || st.saison.annee !== an) st.saison = { id: r.id, annee: an, niv: 0, prog: 0, actif: false };
    return st.saison;
  }
  const tempsSaison = (st) => { const r = recetteSaison(st); return r ? r.temps * tempsMult(st) : 0; };
  const revenuSaison = (st) => { const s = st.saison; return s && s.niv > 0 ? rythme(st) * tempsSaison(st) * SAISON.part * (1 + SAISON.pas * (s.niv - 1)) * boostMult(st) : 0; };
  const coutSaison = (st) => arrondi(rythme(st) * SAISON.coutSec * Math.pow(SAISON.croiss, st.saison ? st.saison.niv : 0)) * remise(st);
  function preparerSaison(st) { // niveau 0 → 1 : préparer la recette ; ensuite l'améliorer, jusqu'au niveau 10
    const s = st.saison; if (!s || s.niv >= SAISON.nivMax) return { ok: false };
    const prix = coutSaison(st); if (st.coins < prix) return { ok: false, prix };
    const points = marquerAmelioration(st, prix, rythme(st), 0);
    st.coins -= prix; s.niv++; noter(st, 'niveaux', 1); if (s.niv === 1) gagnerXp(st, 6);
    return { ok: true, prix, niv: s.niv, points };
  }
  function lancerSaison(st) { const s = st.saison; if (!s || s.niv <= 0 || s.actif) return false; s.actif = true; s.prog = 0; st.stats.taps++; noter(st, 'mains', 1); return true; }
  function cuireSaison(st, out, differe) { // une fournée de saison sortie du four : gains (sauf si l'absence les compte elle-même), collection, maîtrise
    const s = st.saison, r = recetteSaison(st), m = revenuSaison(st);
    s.prog = 0; s.actif = false; if (!differe) gagner(st, m); st.stats.ventes++; inc(st, 'fourneesSaison');
    st.collection = st.collection || {}; const c = st.collection[s.id] || (st.collection[s.id] = { annee: s.annee, fournees: 0, maitrisee: false });
    c.fournees++; if (!c.maitrisee) c.annee = s.annee; // l'année de la maîtrise reste celle où elle a été obtenue
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
    const points = marquerAmelioration(st, prix, rythme(st), 0);
    st.mobilier = st.mobilier || {}; st.coins -= prix; st.mobilier[id] = cran + 1;
    noter(st, 'meuble', 1); gagnerXp(st, 3); inc(st, 'meubles');
    return { ok: true, m, cran: cran + 1, prix, points };
  }
  // ─── la garde-robe : quatre pièces (couvre-chef, haut, chaussures, accessoire) gagnées aux podiums du classement et aux événements ───
  // Chaque pièce porte un bonus modeste qui grandit avec son niveau (1 à 5, payé en étoiles : 1, 1, 2, 2 — une étoile dépensée ne compte
  // plus dans les +5 % par étoile) ; les quatre pièces d'une même collection portées ensemble ajoutent le bonus de l'ensemble.
  // Tout équipé au maximum, les gains par seconde montent d'environ +41 % (collection d'or, ou celle du quartier ou d'Halloween en or), +31 % (argent),
  // +23 % (bronze), +22 % (quartier, plus les pains au chocolat ×1,24 ; Halloween, plus les tartes ×1,24) : le mélange des meilleures pièces sans ensemble fait moins
  // (+26 %), si bien que le plafond est à +41 % (mesuré dans test/fournil-garderobe.test.js). Le classement en points n'en dépend pas.
  // Les pièces de base (toque et tablier blancs, sabots, lunettes rondes) sont à tout le monde dès le départ, sans bonus.
  // Pour persos.js : chaque objet a une forme (toque, casquette, tablier, sweat, chaussures, baskets, foulard, chaine, lunettes ; Halloween :
  // chapeau (le chapeau pointu de sorcière), cape, bottes, lanterne (une petite citrouille-lanterne à la main)) et sa
  // collection sert de métal ('base' : la tenue blanche de toujours). Les bonus (au niveau 1) : gains { produit: id | null, pct }, vitesse
  // (pct de temps de cuisson en moins), absence (heures de gains hors ligne en plus) ; multipliés par 1, 1,5, 2, 2,5 et 3 selon le niveau.
  const GR_PIECES = ['tete', 'haut', 'pieds', 'accessoire'];
  const GR_NIVEAUX = [1, 1.5, 2, 2.5, 3], GR_COUTS = [1, 1, 2, 2], GR_NIV_MAX = 5;
  const GR_BASE = { tete: 'toque-blanche', haut: 'tablier-blanc', pieds: 'sabots', accessoire: null };
  const vet = (id, nom, piece, collection, forme, bonus, rarete, desc) => ({ id, nom, piece, collection, forme, bonus, rarete, desc });
  const METAUX_PODIUM = { or: ['d’or', 'legendaire', [3, 3, 2, 0.5]], argent: ['d’argent', 'epique', [2.5, 2.5, 1.5, 0.5]], bronze: ['de bronze', 'rare', [2, 2, 1, 0.5]] };
  const GARDEROBE = (() => {
    const objets = {};
    const ajouter = (o) => { objets[o.id] = o; };
    ajouter(vet('toque-blanche', 'Toque blanche', 'tete', 'base', 'toque', {}, 'commun', 'La toque de toujours.'));
    ajouter(vet('tablier-blanc', 'Tablier blanc', 'haut', 'base', 'tablier', {}, 'commun', 'Propre chaque matin.'));
    ajouter(vet('sabots', 'Sabots de bois', 'pieds', 'base', 'chaussures', {}, 'commun', 'Ils claquent sur le carrelage.'));
    ajouter(vet('lunettes-rondes', 'Lunettes rondes', 'accessoire', 'base', 'lunettes', {}, 'commun', 'Pour lire les recettes de mamie.'));
    for (const m of Object.keys(METAUX_PODIUM)) { // les tenues du podium du classement : les trois premiers de la semaine
      const [de, rarete, [a, b, c, d]] = METAUX_PODIUM[m];
      ajouter(vet(`${m}-toque`, `Toque ${de}`, 'tete', m, 'toque', { gains: { produit: null, pct: a } }, rarete, 'Celle des premiers de la semaine.'));
      ajouter(vet(`${m}-tablier`, `Tablier ${de}`, 'haut', m, 'tablier', { gains: { produit: null, pct: b } }, rarete, 'Brodé au nom de la boutique.'));
      ajouter(vet(`${m}-chaussures`, `Chaussures ${de}`, 'pieds', m, 'chaussures', { vitesse: c }, rarete, 'On court plus vite au four.'));
      ajouter(vet(`${m}-foulard`, `Foulard ${de}`, 'accessoire', m, 'foulard', { absence: d }, rarete, 'Les apprentis veillent plus tard.'));
    }
    // l'événement « Le Quartier » : les quatre pièces aux paliers, l'ensemble en or pour le podium final
    ajouter(vet('quartier-casquette', 'Casquette du quartier', 'tete', 'quartier', 'casquette', { gains: { produit: 'painchoc', pct: 8 } }, 'rare', 'Visière derrière, comme il faut.'));
    ajouter(vet('quartier-sweat', 'Sweat à capuche', 'haut', 'quartier', 'sweat', { gains: { produit: null, pct: 2.5 } }, 'rare', 'Capuche sur la toque, ça passe.'));
    ajouter(vet('quartier-baskets', 'Baskets du quartier', 'pieds', 'quartier', 'baskets', { vitesse: 1.5 }, 'rare', 'Blanches, enfin presque.'));
    ajouter(vet('quartier-chaine', 'Chaîne du quartier', 'accessoire', 'quartier', 'chaine', { absence: 0.5 }, 'rare', 'Elle brille sous les néons.'));
    ajouter(vet('quartier-or-casquette', 'Casquette dorée', 'tete', 'quartier-or', 'casquette', { gains: { produit: null, pct: 3 } }, 'legendaire', 'Le podium final du quartier.'));
    ajouter(vet('quartier-or-sweat', 'Sweat doré', 'haut', 'quartier-or', 'sweat', { gains: { produit: null, pct: 3 } }, 'legendaire', 'Noir et or, rien d’autre.'));
    ajouter(vet('quartier-or-baskets', 'Baskets dorées', 'pieds', 'quartier-or', 'baskets', { vitesse: 2 }, 'legendaire', 'Édition limitée, une seule paire.'));
    ajouter(vet('quartier-or-chaine', 'Chaîne en or', 'accessoire', 'quartier-or', 'chaine', { absence: 0.5 }, 'legendaire', 'La vraie, pas la plaquée.'));
    // le trophée du palier bonus 20 du Quartier (après le boss) : une seule pièce, sans ensemble, distincte de la tenue en or du podium
    ajouter(vet('quartier-neon-casquette', 'Casquette néon', 'tete', 'quartier-neon', 'casquette', { vitesse: 1 }, 'epique', 'Le palier 20 du quartier. Elle clignote un peu.'));
    // l'événement « La Maison hantée » (src/hantee.js) : la tenue d'Halloween aux paliers 3, 6, 9 et 12, la même en or pour le podium final
    ajouter(vet('hantee-chapeau', 'Chapeau pointu', 'tete', 'hantee', 'chapeau', { gains: { produit: 'tarte', pct: 8 } }, 'rare', 'Pointu, étoilé, et il tient même dans le vent du four.'));
    ajouter(vet('hantee-cape', 'Cape de minuit', 'haut', 'hantee', 'cape', { gains: { produit: null, pct: 2.5 } }, 'rare', 'Doublée de violet. Elle fait « whoosh » quand on se retourne.'));
    ajouter(vet('hantee-bottes', 'Bottes qui claquent', 'pieds', 'hantee', 'bottes', { vitesse: 1.5 }, 'rare', 'Clac, clac, clac : on les entend arriver du fournil.'));
    ajouter(vet('hantee-lanterne', 'Citrouille-lanterne', 'accessoire', 'hantee', 'lanterne', { absence: 0.5 }, 'rare', 'Une petite citrouille qui éclaire les fournées de nuit.'));
    ajouter(vet('hantee-or-chapeau', 'Chapeau pointu doré', 'tete', 'hantee-or', 'chapeau', { gains: { produit: null, pct: 3 } }, 'legendaire', 'Le podium final de la Maison hantée.'));
    ajouter(vet('hantee-or-cape', 'Cape dorée', 'haut', 'hantee-or', 'cape', { gains: { produit: null, pct: 3 } }, 'legendaire', 'Noire dehors, dorée dedans.'));
    ajouter(vet('hantee-or-bottes', 'Bottes dorées', 'pieds', 'hantee-or', 'bottes', { vitesse: 2 }, 'legendaire', 'Elles claquent en or massif.'));
    ajouter(vet('hantee-or-lanterne', 'Lanterne dorée', 'accessoire', 'hantee-or', 'lanterne', { absence: 0.5 }, 'legendaire', 'Une citrouille en or qui ne s’éteint jamais.'));
    // le trophée du palier bonus 20 de la Maison hantée (après le maître) : une seule pièce, sans ensemble, distincte de la tenue en or
    ajouter(vet('hantee-lueur-chapeau', 'Chapeau phosphorescent', 'tete', 'hantee-lueur', 'chapeau', { vitesse: 1 }, 'epique', 'Le palier 20 du Manoir. Il brille dans le noir.'));
    const ensembles = {
      or: { nom: 'Tenue d’or', bonus: { gains: { produit: null, pct: 8 }, vitesse: 3, absence: 1 } },
      argent: { nom: 'Tenue d’argent', bonus: { gains: { produit: null, pct: 6 }, vitesse: 2, absence: 1 } },
      bronze: { nom: 'Tenue de bronze', bonus: { gains: { produit: null, pct: 4 }, vitesse: 2, absence: 0.5 } },
      quartier: { nom: 'Tenue du quartier', bonus: { gains: { produit: null, pct: 6 }, vitesse: 2, absence: 1 } },
      'quartier-or': { nom: 'Tenue du quartier en or', bonus: { gains: { produit: null, pct: 8 }, vitesse: 3, absence: 1 } },
      hantee: { nom: 'Tenue d’Halloween', bonus: { gains: { produit: null, pct: 6 }, vitesse: 2, absence: 1 } },
      'hantee-or': { nom: 'Tenue d’Halloween en or', bonus: { gains: { produit: null, pct: 8 }, vitesse: 3, absence: 1 } },
    };
    return { pieces: GR_PIECES, objets, ensembles, niveaux: GR_NIVEAUX, couts: GR_COUTS, nivMax: GR_NIV_MAX, base: GR_BASE };
  })();
  const vetement = (id) => (id && GARDEROBE.objets[id]) || null;
  const IDS_BASE = Object.keys(GARDEROBE.objets).filter((id) => GARDEROBE.objets[id].collection === 'base');
  const garderobeNeuve = () => { const o = {}; for (const id of IDS_BASE) o[id] = { niv: 1, depuis: 0 }; return { v: 0, objets: o, equipe: Object.assign({}, GR_BASE) }; };
  function garderobe(st) { // la garde-robe remise d'aplomb (une vieille sauvegarde, un id disparu, une pièce portée qu'on n'a pas)
    let g = st.garderobe;
    if (!g || typeof g !== 'object' || Array.isArray(g)) g = st.garderobe = garderobeNeuve();
    if (!g.objets || typeof g.objets !== 'object') g.objets = {};
    if (!g.equipe || typeof g.equipe !== 'object') g.equipe = Object.assign({}, GR_BASE);
    if (!(Number(g.v) >= 0)) g.v = 0;
    for (const id of IDS_BASE) if (!g.objets[id]) g.objets[id] = { niv: 1, depuis: 0 };
    for (const id of Object.keys(g.objets)) { const o = g.objets[id]; if (!vetement(id) || !o || typeof o !== 'object') { delete g.objets[id]; continue; } o.niv = Math.max(1, Math.min(GR_NIV_MAX, Math.floor(Number(o.niv)) || 1)); }
    for (const p of GR_PIECES) { const id = g.equipe[p], v = vetement(id); if (id != null && (!v || v.piece !== p || !g.objets[id])) g.equipe[p] = GR_BASE[p]; if (g.equipe[p] === undefined) g.equipe[p] = GR_BASE[p]; }
    return g;
  }
  const possede = (st, id) => !!garderobe(st).objets[id];
  const niveauVetement = (st, id) => { const o = garderobe(st).objets[id]; return o ? o.niv : 0; };
  function donnerVetement(st, id) { // une pièce gagnée (podium, palier de l'événement) ; déjà possédée : rien ne change
    const v = vetement(id); if (!v) return { nouveau: false, objet: null };
    const g = garderobe(st); if (g.objets[id]) return { nouveau: false, objet: v };
    g.objets[id] = { niv: 1, depuis: st.now || 0 }; g.v++; inc(st, 'vetements'); note(st, `Garde-robe : ${v.nom}`);
    return { nouveau: true, objet: v };
  }
  const donnerCollection = (st, collection) => Object.values(GARDEROBE.objets).filter((v) => v.collection === collection).map((v) => donnerVetement(st, v.id)).filter((r) => r.nouveau).map((r) => r.objet); // les quatre pièces d'un coup ; rend les nouvelles
  function equiper(st, piece, id) { // porter une pièce (null : rien pour l'accessoire, la pièce de base pour les autres)
    if (!GR_PIECES.includes(piece)) return { ok: false };
    const g = garderobe(st), cible = id == null ? GR_BASE[piece] : id, v = vetement(cible);
    if (cible != null && (!v || v.piece !== piece || !g.objets[cible])) return { ok: false };
    if (g.equipe[piece] !== cible) { g.equipe[piece] = cible; g.v++; }
    return { ok: true, id: cible, objet: v };
  }
  const equiperCollection = (st, collection) => { let n = 0; for (const v of Object.values(GARDEROBE.objets)) if (v.collection === collection && possede(st, v.id) && equiper(st, v.piece, v.id).ok) n++; return n; }; // tout ce qu'on a de cette collection
  const coutVetement = (st, id) => { const n = niveauVetement(st, id); return n > 0 && n < GR_NIV_MAX ? GR_COUTS[n - 1] : 0; }; // les étoiles du niveau suivant (0 : au maximum ou pas possédée)
  function ameliorerVetement(st, id) {
    const v = vetement(id), g = garderobe(st), o = g.objets[id]; if (!v || !o) return { ok: false };
    if (o.niv >= GR_NIV_MAX) return { ok: false, max: true, niv: o.niv };
    const cout = GR_COUTS[o.niv - 1]; if (st.etoiles < cout) return { ok: false, cout, niv: o.niv, etoiles: st.etoiles };
    st.etoiles -= cout; o.niv++; g.v++; inc(st, 'etoilesCousues', cout); gagnerXp(st, 5); note(st, `${v.nom} au niveau ${o.niv}`);
    return { ok: true, cout, niv: o.niv, objet: v };
  }
  const bonusPiece = (id, niv) => { // le bonus d'une pièce à ce niveau (pct et heures déjà multipliés)
    const v = vetement(id), k = GR_NIVEAUX[Math.max(1, Math.min(GR_NIV_MAX, niv || 1)) - 1], b = v ? v.bonus : {}, out = {};
    if (b.gains) out.gains = { produit: b.gains.produit || null, pct: +(b.gains.pct * k).toFixed(2) };
    if (b.vitesse) out.vitesse = +(b.vitesse * k).toFixed(2);
    if (b.absence) out.absence = +(b.absence * k).toFixed(2);
    return out;
  };
  function ensembleComplet(st) { // la collection dont les quatre pièces sont portées, sinon null
    const e = garderobe(st).equipe, c = e.tete && vetement(e.tete) ? vetement(e.tete).collection : null;
    return c && GARDEROBE.ensembles[c] && GR_PIECES.every((p) => e[p] && vetement(e[p]) && vetement(e[p]).collection === c) ? c : null;
  }
  const GR_CACHE = new WeakMap(); // le bonus total par garde-robe, recalculé quand elle change (g.v) : revenuBase le lit à chaque fournée
  function bonusGardeRobe(st) { // { gains: { produit → mult }, gainsTous: mult, vitesse: mult du temps de cuisson (0,91 = 9 % plus vite), absenceH: heures en plus }
    const g0 = st.garderobe, c0 = g0 ? GR_CACHE.get(g0) : null; if (c0 && c0.v === g0.v) return c0.bonus; // le chemin court : rien n'a changé
    const g = garderobe(st), c = GR_CACHE.get(g); if (c && c.v === g.v) return c.bonus;
    const b = { gains: {}, gainsTous: 1, vitesse: 1, absenceH: 0 };
    const appliquer = (x) => { if (!x) return; if (x.gains) { if (x.gains.produit) b.gains[x.gains.produit] = (b.gains[x.gains.produit] || 1) * (1 + x.gains.pct / 100); else b.gainsTous *= 1 + x.gains.pct / 100; } if (x.vitesse) b.vitesse -= x.vitesse / 100; if (x.absence) b.absenceH += x.absence; };
    for (const p of GR_PIECES) { const id = g.equipe[p]; if (id && g.objets[id]) appliquer(bonusPiece(id, g.objets[id].niv)); }
    const ens = ensembleComplet(st); if (ens) appliquer(GARDEROBE.ensembles[ens].bonus);
    b.vitesse = Math.max(0.5, +b.vitesse.toFixed(4)); b.gainsTous = +b.gainsTous.toFixed(4); b.absenceH = +b.absenceH.toFixed(2);
    GR_CACHE.set(g, { v: g.v, bonus: b }); return b;
  }
  const garderobeMult = (st, i) => { const b = bonusGardeRobe(st); return b.gainsTous * (b.gains[PRODUITS[i].id] || 1); };
  const accessoiresMult = (st, i) => garderobeMult(st, i) * compagnonGains(st); // la garde-robe et le compagnon
  function texteBonus(x) { // pour l'interface : « Tous les gains +3 % », « Pains au chocolat +8 % », « Cuisson 2 % plus rapide », « +0,5 h d’absence »
    const t = [], v = (n) => String(+n.toFixed(2)).replace('.', ',');
    if (x && x.gains) { const p = x.gains.produit ? PRODUITS.find((q) => q.id === x.gains.produit) : null; t.push(`${p ? p.pl[0].toUpperCase() + p.pl.slice(1) : 'Tous les gains'} +${v(x.gains.pct)} %`); }
    if (x && x.vitesse) t.push(`Cuisson ${v(x.vitesse)} % plus rapide`);
    if (x && x.absence) t.push(`+${v(x.absence)} h d’absence`);
    if (x && x.pourboire) t.push(`Pourboires +${v(x.pourboire)} %`);
    return t;
  }
  function tenueBoulanger(st) { // ce que porte le boulanger, pour persos.js et les icônes : { tete, haut, pieds, accessoire: { forme, metal } | null, cle }
    const g = garderobe(st), t = {}, cle = [];
    for (const p of GR_PIECES) { const v = vetement(g.equipe[p]); t[p] = v ? { forme: v.forme, metal: v.collection === 'base' ? null : v.collection } : null; cle.push(g.equipe[p] || ''); }
    t.cle = cle.join('|'); return t;
  }
  const toqueMetal = (st) => { const v = vetement(garderobe(st).equipe.tete); return v && METAUX_PODIUM[v.collection] ? v.collection : null; }; // la toque du podium portée, vue des autres (null : pas une toque de podium)
  const garderobeCle = (st) => { const g = garderobe(st); return `${g.v}|${st.etoiles}|${Object.keys(g.objets).length}`; }; // pour redessiner la page quand elle change
  // effets des talents, du mobilier et de la garde-robe
  const tempsMult = (st) => (1 - 0.05 * talent(st, 'mains')) * (1 - 0.03 * mobilierCran(st, 'four')) * bonusGardeRobe(st).vitesse * (1 - (bonusCompagnon(st).vitesse || 0) / 100);
  const temps = (st, i) => PRODUITS[i].temps * tempsMult(st) * apprentiTempsMult(st, i);
  const heuresAbsence = (st) => ABSENCE_MAX_H + talent(st, 'levetot') + mobilierCran(st, 'froid') + bonusGardeRobe(st).absenceH + (bonusCompagnon(st).absence || 0);
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
      apprentis: {}, chat: null, chatRefuse: '', chatAttente: 45, chatNoir: false, chatPelage: 'roux', compagnons: [], compagnon: null, saison: null, saisonAnnoncee: '', collection: {},
      // st.quartier (src/quartier.js) et st.hantee (src/hantee.js) : l'état des événements, créés à la première visite par leurs règles
      atelier: atelierNeuf(), points: pointsNeufs(semaineKey(nowMs), dayKey(nowMs)), garderobe: garderobeNeuve(), boosts: boostsNeufs(),
    };
  }

  // ─── temps, hasard déterministe ───
  // Les jours, les semaines, le marché, les heures de pointe, les habitués et les saisons du jeu se comptent à l'heure de
  // PARIS, quel que soit le fuseau du téléphone (comme le classement et son serveur) : changer de fuseau dans les réglages
  // ne fait plus naître de nouvelle journée, ni avancer le marché du samedi. Règle européenne : l'heure d'été va du dernier
  // dimanche de mars au dernier dimanche d'octobre, à 1 h UTC (la même que src/classement.js).
  function decalageParis(ms) {
    const a = new Date(ms).getUTCFullYear();
    const dernierDimanche = (mois) => { const d = new Date(Date.UTC(a, mois + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
    return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 * 3600e3 : 3600e3;
  }
  const paris = (ms) => new Date(ms + decalageParis(ms)); // à lire avec les getUTC… : l'heure qu'il est à Paris
  const heureParis = (ms) => { const d = paris(ms); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const dayKey = (ms) => { const d = paris(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
  const hier = (ms) => dayKey(ms - 864e5);
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const jourDeMarche = (ms) => { const d = paris(ms).getUTCDay(); return d === 0 || d === 6; };
  const heureDePointe = (ms) => { const h = paris(ms).getUTCHours(); return (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 19); };
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
    if (st.boosts && st.boosts.actif && st.boosts.actif.fin > st.now) m *= st.boosts.actif.mult; // un boost de la réserve (l'événement du quartier), lancé quand on veut
    if (jourDeMarche(st.now)) m *= MARCHE_MULT;
    return m;
  }
  function revenuBase(st, i) { const s = st.stations[i]; return s.niv <= 0 ? 0 : PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(st, i) * etoileMult(st) * mobilierMult(st) * apprentiRevMult(st, i) * accessoiresMult(st, i); }
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
    // acheter des niveaux : autant que 25 min du rythme de la boutique en paient (les moins chers d'abord), 30 au plus, 5 au moins ;
    // en fin de boutique, quand chaque niveau coûte cher, l'objectif reste à la portée d'une journée (les points du classement en dépendent)
    niveaux: (st, r) => ({ cible: Math.max(5, Math.min(30, 8 + 3 * st.stations.filter((s) => s.niv > 0).length, niveauxAbordables(st, r * 1500, 30))), txt: (c) => `Achète ${c} niveaux` }),
    clients: () => ({ cible: 50, txt: (c) => `Sers ${c} clients` }),
    // à la main : vingt minutes de cuisson de la recette sans apprenti la plus rapide, 25 fournées au plus (en fin de boutique,
    // la seule recette sans apprenti est souvent la pièce montée : 25 à la main, ce serait dix heures ; la cible tombe à 1)
    mains: (st) => {
      const t = st.stations.reduce((m, s, i) => (s.niv > 0 && !s.staff ? Math.min(m, temps(st, i)) : m), Infinity);
      if (!Number.isFinite(t)) return null;
      const c = Math.max(1, Math.min(25, Math.floor(1200 / t)));
      return { cible: c, txt: (n) => `Cuis ${n} fournée${n > 1 ? 's' : ''} à la main` };
    },
    // embaucher : seulement si un apprenti est à portée (moins d'une heure du rythme de la boutique), comme les bonus et le mobilier
    embaucher: (st, r) => (st.stations.some((s, i) => s.niv > 0 && !s.staff && prixStaff(st, i) < st.coins + r * 3600) ? { cible: 1, txt: () => 'Embauche un apprenti' } : null),
    bonus: (st, r) => (AMELIORATIONS.some((a) => !st.ameliorations[a.id] && a.cout < st.coins + r * 3600) ? { cible: 1, txt: () => 'Achète un bonus' } : null),
    meuble: (st, r) => (MOBILIER.some((m) => mobilierCran(st, m.id) < m.max && prixMeuble(st, m.id) < st.coins + r * 3600) ? { cible: 1, txt: () => 'Améliore un meuble de la boutique' } : null),
    recette: (st, r) => { const i = st.stations.findIndex((s) => s.niv === 0); return i > 0 && PRODUITS[i].debloquer < st.coins + r * 3600 ? { cible: 1, txt: () => `Débloque : ${PRODUITS[i].nom}` } : null; },
  };
  function niveauxAbordables(st, budget, max) { // combien de niveaux paie ce budget, en prenant toujours le moins cher
    const niv = st.stations.map((s) => s.niv); let n = 0, reste = budget;
    while (n < max) {
      let best = -1, bp = Infinity;
      niv.forEach((v, i) => { if (v > 0) { const p = coutNiveau(i, v); if (p < bp) { bp = p; best = i; } } });
      if (best < 0 || bp > reste) break;
      reste -= bp; niv[best]++; n++;
    }
    return n;
  }
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
  const semaineKey = (ms) => { const d = paris(ms), j = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - j)).toISOString().slice(0, 10); };
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
    sm.reclame = true; st.etoiles++; inc(st, 'semaines'); marquerDefi(st); const prime = arrondi(Math.max(100, rythme(st) * 1800)); gagner(st, prime, true); gagnerXp(st, 150); note(st, `Défi de la semaine réussi : ${fmtEur(prime)} et une étoile`);
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
    let etoile = false, points = 0;
    if (st.jour.objectifs.every((x) => x.reclame) && !st.jour.etoileDonnee) {
      st.jour.etoileDonnee = true; st.etoiles++; etoile = true; gagnerXp(st, 40); noterSemaine(st, 'jours'); points = marquerJournee(st);
      st.serie = st.dernierJourComplet === hier(st.now) ? st.serie + 1 : 1; st.dernierJourComplet = st.jour.date; st.stats.serieMax = Math.max(st.stats.serieMax || 0, st.serie);
    }
    return { ok: true, prime: o.prime, etoile, points };
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
    donnerBoost(st, CRITIQUE.mult, CRITIQUE.boost); gagnerXp(st, 20); inc(st, 'critiques'); marquerEvenement(st); noterSemaine(st, 'critiques'); note(st, `Bonne critique : tout ×${CRITIQUE.mult} pendant ${CRITIQUE.boost / 60} min`); st.ev = null;
    return { ok: true, fini: true };
  }
  function petrir(st) {
    const ev = st.ev; if (!ev || ev.type !== 'petrissage' || ev.fin <= st.now) return { ok: false };
    ev.taps++; if (ev.taps < ev.n) return { ok: true, fini: false, taps: ev.taps };
    gagner(st, ev.prime, true); gagnerXp(st, 10); inc(st, 'petrissages'); marquerEvenement(st); noterSemaine(st, 'petrissages'); const duree = (st.now - ev.debut) / 1000; if (!st.stats.petrissageRecord || duree < st.stats.petrissageRecord) st.stats.petrissageRecord = duree; note(st, `Concours de pétrissage gagné : ${fmtEur(ev.prime)}`); st.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function reparer(st) {
    const ev = st.ev; if (!ev || ev.type !== 'panne') return { ok: false };
    ev.coups++; if (ev.coups < ev.n) return { ok: true, fini: false, coups: ev.coups };
    gagner(st, ev.prime, true); gagnerXp(st, 8); inc(st, 'pannes'); marquerEvenement(st); noterSemaine(st, 'pannes'); note(st, `Four réparé : ${fmtEur(ev.prime)}`); st.ev = null;
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
    ev.livree = true; gagner(st, ev.prime, true); gagnerXp(st, 10); inc(st, 'commandes'); marquerEvenement(st); st.stats.meilleureCommande = Math.max(st.stats.meilleureCommande || 0, ev.prime); noterSemaine(st, 'commandes'); note(st, `Commande livrée : ${fmtEur(ev.prime)}`);
    st.ev = null;
    return { ok: true, prime: ev.prime };
  }
  const pourboire = (st) => arrondi(Math.max(20, rythme(st) * 120) * (1 + 0.5 * talent(st, 'pourboire')) * (1 + 0.3 * mobilierCran(st, 'caisse')) * (1 + (bonusCompagnon(st).pourboire || 0) / 100));
  function encaisserPourboire(st) { const tip = pourboire(st); gagner(st, tip, true); gagnerXp(st, 3); inc(st, 'pourboires'); marquerEvenement(st); st.stats.meilleurPourboire = Math.max(st.stats.meilleurPourboire || 0, tip); noterSemaine(st, 'pourboires'); note(st, `Pourboire du client mystère : ${fmtEur(tip)}`); return tip; }
  // ─── les habitués : trois clients fidèles qui passent à heure fixe, une fois par jour ; cinq jours de suite, un cadeau ───
  const HABITUES = [
    { id: 'dupuis', nom: 'Mme Dupuis', debut: 7, fin: 10, haut: '#8A2B3A', cheveux: '#D9D9D9', peau: '#FFD7B5', coiffure: 2, phrase: 'Ma baguette bien cuite, comme toujours !' },
    { id: 'marco', nom: 'Marco', debut: 12, fin: 14.5, haut: '#2B5BD7', cheveux: '#2B2118', peau: '#C68B59', coiffure: 0, phrase: 'Deux croissants, et vite, j’ai une réunion.' },
    { id: 'lena', nom: 'Léna', debut: 17, fin: 20, haut: '#5FD3A4', cheveux: '#B8762E', peau: '#F1B990', coiffure: 1, phrase: 'Un éclair pour fêter la fin de la journée !' },
  ];
  function habitueAttendu(st, nowMs) {
    const h = heureParis(nowMs), key = dayKey(nowMs);
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
    { id: 'ronron', nom: 'Ronron', desc: 'Caresser le compagnon 100 fois', xp: 30, cond: (st) => !!st.chat && st.chat.caresses >= 100 },
    { id: 'saison1', nom: 'Recette de saison', desc: 'Maîtriser une recette de saison', xp: 30, cond: (st) => Object.values(st.collection || {}).some((c) => c.maitrisee) },
    { id: 'saisons4', nom: 'Quatre saisons', desc: 'Maîtriser quatre recettes de saison', xp: 80, cond: (st) => Object.values(st.collection || {}).filter((c) => c.maitrisee).length >= 4 },
  ];
  function verifierTrophees(st) {
    st.trophees = st.trophees || {}; const neufs = [];
    for (const t of TROPHEES) if (!st.trophees[t.id] && t.cond(st)) { st.trophees[t.id] = st.now; gagnerXp(st, t.xp); note(st, `Trophée : ${t.nom}`); neufs.push(t); }
    return neufs;
  }
  function donnerBoost(st, mult, secs) { st.boost = { mult, fin: st.now + secs * 1000 }; }
  // ─── la réserve de boosts : des ×2 et des ×5 gagnés aux paliers de l'événement « Le Quartier » (src/quartier.js), à lancer quand on veut ───
  // dans la boulangerie, un seul à la fois ; il tourne sur l'horloge du jeu (une absence plus courte que lui en profite, une plus longue l'éteint)
  const boostsNeufs = () => ({ reserve: [], actif: null });
  const boosts = (st) => { if (!st.boosts || typeof st.boosts !== 'object' || !Array.isArray(st.boosts.reserve)) st.boosts = boostsNeufs(); return st.boosts; };
  // ─── la prime en heures : les récompenses des événements (paliers, combines « après le boss », src/activites.js RECOMPENSES) versent N heures
  // du rythme de la boutique, comme les autres primes (le défi de la semaine : 30 min, rythme(st) × 1800) : rythme × 3600 × N, arrondi, avec
  // un plancher pour une boutique qui démarre (PRIME_HEURE_PLANCHER € par heure : 1 000 € la minute, le plancher des compagnons). Le
  // rythme de référence, sans boost : un ×10 lancé ne gonfle pas la prime. Hors objectifs (gagner(…, true)), aucun point de boulanger.
  const PRIME_HEURE_PLANCHER = 60000;
  const primeHeures = (st, h) => (h > 0 ? arrondi(Math.max(PRIME_HEURE_PLANCHER * h, rythme(st) * 3600 * h)) : 0);
  function donnerPrimeHeures(st, h) { const x = primeHeures(st, h); if (x > 0) { gagner(st, x, true); note(st, `Prime de l’événement : ${h} h de gains, ${fmtEur(x)}`); } return x; }
  function donnerBoostReserve(st, mult, secs) { const b = boosts(st); if (!(mult > 1) || !(secs > 0)) return null; const o = { mult, secs }; b.reserve.push(o); return o; }
  function lancerBoostReserve(st, k) {
    const b = boosts(st), o = b.reserve[k];
    if (!o || (b.actif && b.actif.fin > st.now)) return { ok: false };
    b.reserve.splice(k, 1); b.actif = { mult: o.mult, fin: st.now + o.secs * 1000 }; note(st, `Boost ×${o.mult} lancé pour ${fmtDuree(o.secs)}`);
    return { ok: true, boost: b.actif };
  }

  // ─── l'Atelier : trois mini-jeux lancés à volonté (jamais en surprise), chacun son record ───
  // Les gains sont modestes et plafonnés : une partie réussie paie au plus 90 s du rythme de la boutique (le concours de pétrissage en paie 240,
  // le client mystère 120), trois parties payées par mini-jeu et par jour (heure de Paris) ; au-delà, on joue pour le record, sans gain.
  // Au pire, neuf parties parfaites par jour : 13 min 30 de rythme, moins que la moitié des seuls objectifs du jour (3 × 10 min).
  const ATELIER = { parJour: 3, secondes: 90, plancher: 10, seuil: 0.1, xp: 2 };
  const JEUX_ATELIER = [
    { id: 'four', nom: 'Enfournement en rythme', court: 'Enfournement', desc: 'Enfourne la plaque au passage, sors-la au doré parfait.', plein: 450, max: 20000, unite: 'points' },
    { id: 'faconnage', nom: 'Façonnage au doigt', court: 'Façonnage', desc: 'Trace l’entaille, la spirale et la tresse du modèle.', plein: 225, max: 300, unite: 'points' },
    { id: 'memoire', nom: 'Mémoire du pâtissier', court: 'Mémoire', desc: 'Retiens la recette, remets les ingrédients dans l’ordre.', plein: 25, max: 2000, unite: 'points' },
  ];
  const jeuAtelier = (id) => JEUX_ATELIER.find((j) => j.id === id) || null;
  const zeroJeux = () => { const o = {}; JEUX_ATELIER.forEach((j) => { o[j.id] = 0; }); return o; };
  const atelierNeuf = () => ({ jour: '', payees: zeroJeux(), gains: zeroJeux(), records: zeroJeux(), parties: zeroJeux() });
  function atelierDuJour(st) { // les records restent ; les parties payées et les gains repartent de zéro à minuit, heure de Paris
    const a = st.atelier && typeof st.atelier === 'object' ? st.atelier : (st.atelier = atelierNeuf());
    ['payees', 'gains', 'records', 'parties'].forEach((k) => { if (!a[k] || typeof a[k] !== 'object') a[k] = {}; JEUX_ATELIER.forEach((j) => { if (!(Number(a[k][j.id]) >= 0)) a[k][j.id] = 0; }); });
    const key = dayKey(st.now);
    if (a.jour !== key) { a.jour = key; a.payees = zeroJeux(); a.gains = zeroJeux(); }
    return a;
  }
  const qualiteAtelier = (id, score) => { const j = jeuAtelier(id); return j ? Math.max(0, Math.min(1, (Number(score) || 0) / j.plein)) : 0; };
  const primePleineAtelier = (st) => arrondi(Math.max(ATELIER.plancher, rythme(st) * ATELIER.secondes)); // ce que paie une partie parfaite, maintenant
  const primeAtelier = (st, id, score) => { const q = qualiteAtelier(id, score); return q < ATELIER.seuil ? 0 : arrondi(primePleineAtelier(st) * q); };
  const restantesAtelier = (st, id) => Math.max(0, ATELIER.parJour - atelierDuJour(st).payees[id]);
  function finirAtelier(st, id, score) { // une partie terminée : le record, puis la prime tant que le plafond du jour n'est pas atteint
    const j = jeuAtelier(id); if (!j) return { ok: false };
    const a = atelierDuJour(st), s = Math.max(0, Math.min(j.max, Math.floor(Number.isFinite(Number(score)) ? Number(score) : 0)));
    const ancien = a.records[id] || 0, record = s > ancien; if (record) a.records[id] = s;
    a.parties[id]++; inc(st, 'atelier'); const points = marquerAtelier(st, id, s); // le meilleur score de la semaine compte au classement, partie payée ou non
    const pourLeRecord = a.payees[id] >= ATELIER.parJour, prime = pourLeRecord ? 0 : primeAtelier(st, id, s); // plafond déjà atteint : la partie compte pour le record seulement
    if (prime > 0) { a.payees[id]++; a.gains[id] += prime; gagner(st, prime, true); gagnerXp(st, ATELIER.xp); note(st, `Atelier, ${j.court.toLowerCase()} : ${fmt(s)} points, ${fmtEur(prime)}`); }
    return { ok: true, id, score: s, record, ancien, prime, points, pourLeRecord, plafond: a.payees[id] >= ATELIER.parJour, payees: a.payees[id], reste: ATELIER.parJour - a.payees[id], qualite: qualiteAtelier(id, s) };
  }

  // 1. Enfournement en rythme : les plaques défilent sur le tapis ; toucher quand la plaque passe devant la bouche du four pour l'enfourner,
  // puis toucher quand elle est dorée pour la sortir (ni pâle ni brûlée). Les cuissons parfaites d'affilée font un combo. Ça accélère.
  // Moteur pur, mené par le temps (t en secondes) : l'interface avance et touche, les tests aussi.
  const FOUR = { duree: 45, porte: 0.62, brule: 1.7, pause: 0.45, debut: 0.6 };
  const fourNiveau = (k) => ({ vitesse: Math.min(0.95, 0.32 + 0.035 * k), cuisson: Math.max(0.75, 1.7 - 0.065 * k), tolPorte: Math.max(0.05, 0.11 - 0.004 * k), tolDore: Math.max(0.1, 0.24 - 0.009 * k) });
  const fourNouveau = () => ({ t: 0, fini: false, k: 0, phase: 'attente', attente: FOUR.debut, x: 0, c: 0, perdue: false, score: 0, combo: 0, comboMax: 0, parfaits: 0, bons: 0, rates: 0, enfournes: 0, dernier: null, niv: fourNiveau(0) });
  function fourRate(e, type) { e.combo = 0; e.rates++; e.dernier = { type, points: 0, t: e.t }; return e.dernier; }
  function fourAvancer(e, dt) { // rend l'événement survenu (plaque passée, plaque brûlée), sinon null
    if (e.fini) return null;
    e.t += dt; let ev = null;
    if (e.t >= FOUR.duree) { e.fini = true; e.phase = 'fin'; return { type: 'fin' }; }
    if (e.phase === 'attente') { e.attente -= dt; if (e.attente <= 0) { e.phase = 'tapis'; e.x = 0; e.perdue = false; e.niv = fourNiveau(e.k); } }
    else if (e.phase === 'tapis') {
      e.x += e.niv.vitesse * dt;
      if (!e.perdue && e.x > FOUR.porte + e.niv.tolPorte) { e.perdue = true; ev = fourRate(e, 'passee'); }
      if (e.x >= 1.08) { e.k++; e.phase = 'attente'; e.attente = FOUR.pause; }
    } else if (e.phase === 'four') {
      e.c += dt / e.niv.cuisson;
      if (e.c >= FOUR.brule) { ev = fourRate(e, 'brulee'); e.k++; e.phase = 'attente'; e.attente = FOUR.pause; }
    }
    return ev;
  }
  function fourToucher(e) { // une touche : enfourner (plaque sur le tapis) ou sortir (plaque au four) ; rend le verdict, ou null si la touche ne compte pas
    if (e.fini) return null;
    if (e.phase === 'tapis' && !e.perdue) {
      const ecart = Math.abs(e.x - FOUR.porte), tol = e.niv.tolPorte;
      if (ecart > tol) { e.perdue = true; return fourRate(e, 'tot'); } // trop tôt : la plaque glisse et tombe (trop tard, elle est déjà passée)
      const parfait = ecart <= tol * 0.4, pts = parfait ? 5 : 2;
      e.score += pts; e.enfournes++; e.phase = 'four'; e.c = 0;
      e.dernier = { type: 'enfournee', parfait, points: pts, t: e.t }; return e.dernier;
    }
    if (e.phase === 'four') {
      const d = e.c - 1, tol = e.niv.tolDore; let v;
      if (Math.abs(d) <= tol * 0.4) { e.combo++; e.comboMax = Math.max(e.comboMax, e.combo); e.parfaits++; const pts = 20 + 5 * Math.min(e.combo, 10); e.score += pts; v = { type: 'sortie', verdict: 'parfait', points: pts, combo: e.combo, t: e.t }; }
      else if (Math.abs(d) <= tol) { e.combo = 0; e.bons++; e.score += 10; v = { type: 'sortie', verdict: 'bon', points: 10, combo: 0, t: e.t }; }
      else { fourRate(e, d < 0 ? 'pale' : 'brulee'); v = { type: 'sortie', verdict: d < 0 ? 'pale' : 'brulee', points: 0, combo: 0, t: e.t }; }
      e.dernier = v; e.k++; e.phase = 'attente'; e.attente = FOUR.pause;
      return v;
    }
    return null;
  }

  // 2. Façonnage au doigt : chaque modèle est fait de traits (points dans un carré de côté 1, y vers le bas), à tracer dans l'ordre et dans le sens.
  // La note (sur 100) : la distance moyenne entre le tracé et le modèle (dans les deux sens : rien d'oublié, rien en trop), divisée par deux
  // pour un trait tracé à l'envers, ×0,75 pour un trait tracé dans le désordre, −8 par trait en trop ; un trait oublié vaut 0.
  // Un trait qui reprend à moins de `accroche` de la fin du précédent le prolonge (le doigt s'est levé en route) ; la forme est notée dès que
  // les tracés couvrent `couvert` du modèle (chaque point du modèle à moins de `couvre` d'un tracé), sinon après un moment sans toucher.
  const FACONNAGE = { parForme: 15, ordre: ['entailles', 'spirale', 'tresse'], tolBon: 0.015, tolZero: 0.11, minTrait: 0.04, accroche: 0.06, couvre: 0.06, couvert: 0.85 };
  const MODELES_FACONNAGE = (() => {
    const spirale = []; for (let k = 0; k <= 80; k++) { const u = k / 80, a = u * Math.PI * 2 * 2.25 - Math.PI / 2, r = 0.05 + 0.33 * u; spirale.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]); }
    // les deux brins partent côte à côte (pas du même point : on voit lequel est le premier), se croisent et se rejoignent en bas
    const brin = (s) => { const p = []; for (let k = 0; k <= 60; k++) { const u = k / 60; p.push([0.5 + s * 0.07 * (1 - u) + s * 0.2 * Math.sin(u * Math.PI * 3), 0.1 + 0.8 * u]); } return p; };
    const entaille = (x0) => [[x0, 0.57], [x0 + 0.085, 0.5], [x0 + 0.17, 0.43]];
    return {
      entailles: { id: 'entailles', nom: 'Les entailles de la baguette', consigne: 'Quatre coups de lame, de gauche à droite, chacun vers le haut.', traits: [0.11, 0.3, 0.49, 0.68].map(entaille) },
      spirale: { id: 'spirale', nom: 'La spirale du pain aux raisins', consigne: 'D’un seul geste, du cœur vers le bord, dans le sens des aiguilles d’une montre.', traits: [spirale] },
      tresse: { id: 'tresse', nom: 'La tresse de la brioche', consigne: 'Deux brins, de haut en bas : le brin 1, puis le brin 2 qui le croise.', traits: [brin(1), brin(-1)] },
    };
  })();
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const longueur = (pts) => { let l = 0; for (let k = 1; k < pts.length; k++) l += dist2(pts[k - 1], pts[k]); return l; };
  function reechantillonner(pts, n) { // n points régulièrement espacés le long du trait
    if (!pts.length) return [];
    const L = longueur(pts); if (L <= 0 || pts.length < 2) return Array.from({ length: n }, () => pts[0].slice());
    const out = [pts[0].slice()], pas = L / (n - 1); let acc = 0, k = 1, prec = pts[0];
    while (k < pts.length && out.length < n) {
      const d = dist2(prec, pts[k]);
      if (acc + d >= pas && d > 0) { const f = (pas - acc) / d, q = [prec[0] + f * (pts[k][0] - prec[0]), prec[1] + f * (pts[k][1] - prec[1])]; out.push(q); prec = q; acc = 0; }
      else { acc += d; prec = pts[k]; k++; }
    }
    while (out.length < n) out.push(pts[pts.length - 1].slice());
    return out;
  }
  function distSegment(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  const distTrait = (p, trait) => { let m = Infinity; for (let k = 1; k < trait.length; k++) m = Math.min(m, distSegment(p, trait[k - 1], trait[k])); return trait.length === 1 ? dist2(p, trait[0]) : m; };
  const ecartMoyen = (A, B) => A.reduce((s, p) => s + distTrait(p, B), 0) / A.length;
  const ecartTraits = (T, M) => (ecartMoyen(T, M) + ecartMoyen(M, T)) / 2;
  const ecartPointAPoint = (A, B) => A.reduce((s, p, k) => s + dist2(p, B[k]), 0) / A.length;
  function noterFaconnage(modeleId, traces) {
    const m = MODELES_FACONNAGE[modeleId]; if (!m) return { note: 0, traits: [] };
    const N = 40, M = m.traits.map((t) => reechantillonner(t, N));
    const T = (traces || []).filter((t) => Array.isArray(t) && t.length >= 2 && longueur(t) >= FACONNAGE.minTrait).map((t) => reechantillonner(t, N));
    const paires = [], libresT = new Set(T.map((x, k) => k)), libresM = new Set(M.map((x, i) => i)), cout = T.map((t) => M.map((mm) => ecartTraits(t, mm)));
    while (libresT.size && libresM.size) { // le meilleur couple tracé ↔ trait du modèle d'abord
      let best = null; libresT.forEach((k) => libresM.forEach((i) => { if (!best || cout[k][i] < best.c) best = { k, i, c: cout[k][i] }; }));
      paires.push(best); libresT.delete(best.k); libresM.delete(best.i);
    }
    const traits = M.map((mm, i) => {
      const p = paires.find((x) => x.i === i); if (!p) return { i, oublie: true, precision: 0, envers: false, desordre: false, valeur: 0 };
      const precision = Math.max(0, Math.min(1, 1 - (p.c - FACONNAGE.tolBon) / (FACONNAGE.tolZero - FACONNAGE.tolBon)));
      const envers = ecartPointAPoint(T[p.k], mm.slice().reverse()) < ecartPointAPoint(T[p.k], mm);
      const desordre = M.length > 1 && p.k !== i;
      return { i, oublie: false, precision, envers, desordre, valeur: precision * (envers ? 0.5 : 1) * (desordre ? 0.75 : 1) };
    });
    const enTrop = T.length - paires.length;
    const note = Math.max(0, Math.min(100, Math.round(100 * traits.reduce((s, x) => s + x.valeur, 0) / M.length - 8 * enTrop)));
    return { note, traits, enTrop, precision: traits.reduce((s, x) => s + x.precision, 0) / M.length, envers: traits.filter((x) => x.envers).length, desordre: traits.some((x) => x.desordre), oublies: traits.filter((x) => x.oublie).length };
  }

  function ajouterTrait(traces, pts) { // pose un tracé : il prolonge le précédent s'il reprend là où celui-ci s'arrêtait ; rend la liste et si on a accroché
    const t = (traces || []).slice(), der = t[t.length - 1];
    if (der && der.length && pts && pts.length && dist2(der[der.length - 1], pts[0]) <= FACONNAGE.accroche) { t[t.length - 1] = der.concat(pts); return { traces: t, accroche: true }; }
    if (pts && pts.length) t.push(pts.slice());
    return { traces: t, accroche: false };
  }
  function couvertureFaconnage(modeleId, traces) { // la part du modèle déjà couverte par les tracés (moyenne sur ses traits), de 0 à 1
    const m = MODELES_FACONNAGE[modeleId]; if (!m) return 0;
    const T = (traces || []).filter((t) => Array.isArray(t) && t.length >= 1); if (!T.length) return 0;
    const parTrait = m.traits.map((t) => { const M = reechantillonner(t, 40); return M.filter((p) => T.some((tr) => (tr.length === 1 ? dist2(p, tr[0]) : distTrait(p, tr)) <= FACONNAGE.couvre)).length / M.length; });
    return parTrait.reduce((a, b) => a + b, 0) / parTrait.length;
  }

  // 3. Mémoire du pâtissier : la recette s'affiche quelques secondes, puis on remet les ingrédients dans l'ordre ; chaque manche réussie
  // l'allonge d'un ingrédient (la même recette, une étape de plus). Une erreur, ou la minute écoulée, et la partie s'arrête.
  // Le score : la somme des longueurs des recettes réussies (3 + 4 + 5 + … ).
  const INGREDIENTS = [
    { id: 'farine', nom: 'Farine' }, { id: 'beurre', nom: 'Beurre' }, { id: 'oeufs', nom: 'Œufs' }, { id: 'sucre', nom: 'Sucre' },
    { id: 'lait', nom: 'Lait' }, { id: 'levure', nom: 'Levure' }, { id: 'chocolat', nom: 'Chocolat' }, { id: 'sel', nom: 'Sel' },
  ];
  const MEMOIRE = { duree: 60, debut: 3 };
  const memoireMontre = (n) => +(1.2 + 0.55 * n).toFixed(2); // secondes d'affichage d'une recette de n ingrédients
  function memoireRecette(graine, n) { // les n premières étapes d'une recette tirée de la graine : allonger n garde le début
    const rnd = mulberry32(hashStr('recette:' + graine)), r = [];
    while (r.length < n) { const id = INGREDIENTS[Math.floor(rnd() * INGREDIENTS.length)].id; if (id !== r[r.length - 1]) r.push(id); }
    return r;
  }
  function memoireSaisir(recette, saisie) { // la saisie en cours : juste jusqu'ici ? complète ?
    let justes = 0; while (justes < saisie.length && saisie[justes] === recette[justes]) justes++;
    const ok = justes === saisie.length;
    return { ok, justes, complet: ok && saisie.length === recette.length };
  }
  const memoireScore = (manches) => { let s = 0; for (let k = 0; k < manches; k++) s += MEMOIRE.debut + k; return s; };

  // ─── les points de boulanger : le classement récompense la façon de jouer, pas l'ancienneté ───
  // Chaque semaine (du lundi au dimanche, heure de Paris, sur l'horloge de confiance) :
  //   · journée complète (les trois objectifs du jour réclamés) : 10 points, une fois par jour ;
  //   · défi de la semaine réclamé : 30 points ;
  //   · événement réussi (pétrissage gagné, commande livrée, four réparé, bonne critique, pourboire du client mystère) : 2 points,
  //     20 au plus par jour ;
  //   · Atelier : le meilleur score de la semaine de chaque mini-jeu, converti en 0 à 20 points (20 au score « plein » du jeu) ;
  //   · améliorations : 1 point par tranche d'achats valant 10 minutes de SES PROPRES gains au moment de l'achat (le prix divisé par
  //     le rythme de la boutique, rythme(st)), + 5 à chaque palier ×2 franchi (niveaux 25, 50, 100…), 30 au plus par jour.
  //     Comptent : niveaux et déblocage des recettes, embauches, bonus, mobilier, recette de saison.
  // Un achat cher pour un joueur riche coûte autant de minutes de ses gains qu'un achat modeste pour un débutant : les points ne
  // dépendent pas du niveau. Au plus 60 points par jour et 510 par semaine (7 × 60 + 30 + 3 × 20) ; le serveur applique les mêmes plafonds.
  const POINTS = { journee: 10, defi: 30, evenement: 2, evenementsJour: 20, atelier: 20, tranche: 600, palier: 5, ameliorationsJour: 30, semaines: 12 };
  POINTS.jour = POINTS.journee + POINTS.evenementsJour + POINTS.ameliorationsJour;               // 60
  POINTS.semaine = 7 * POINTS.jour + POINTS.defi + POINTS.atelier * JEUX_ATELIER.length;          // 510
  const pointsNeufs = (semaine, jour) => ({ semaine, jour, journees: 0, evenements: 0, ameliorations: 0, defi: 0, atelier: zeroJeux(), jJournee: 0, jEvenements: 0, jAmeliorations: 0, reste: 0, avant: 0, semaines: [] });
  const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;
  const pointsAtelier = (id, score) => Math.round(POINTS.atelier * qualiteAtelier(id, score));
  const entierPos = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
  function pointsDuJour(st) { // le carnet de points, remis d'aplomb ; une nouvelle semaine ou un nouveau jour (heure de Paris) repart de zéro
    const sem = semaineKey(st.now), jour = dayKey(st.now);
    let p = st.points;
    if (!p || typeof p !== 'object' || Array.isArray(p)) p = st.points = pointsNeufs(sem, jour);
    if (!JOUR_ISO.test(p.semaine)) p.semaine = sem;
    if (!JOUR_ISO.test(p.jour)) p.jour = jour;
    p.journees = entierPos(p.journees, 7 * POINTS.journee); p.evenements = entierPos(p.evenements, 7 * POINTS.evenementsJour); p.ameliorations = entierPos(p.ameliorations, 7 * POINTS.ameliorationsJour);
    p.defi = entierPos(p.defi, POINTS.defi); p.jJournee = entierPos(p.jJournee, POINTS.journee); p.jEvenements = entierPos(p.jEvenements, POINTS.evenementsJour); p.jAmeliorations = entierPos(p.jAmeliorations, POINTS.ameliorationsJour);
    p.avant = entierPos(p.avant, 1e9); p.reste = Number(p.reste) >= 0 && Number(p.reste) < 1 ? Number(p.reste) : 0;
    if (!p.atelier || typeof p.atelier !== 'object') p.atelier = zeroJeux();
    JEUX_ATELIER.forEach((j) => { p.atelier[j.id] = entierPos(p.atelier[j.id], j.max); });
    if (!Array.isArray(p.semaines)) p.semaines = [];
    if (sem > p.semaine) { // une nouvelle semaine : celle qui finit rejoint l'historique (les 12 dernières), puis tout repart de zéro
      const total = pointsSemaineDe(p);
      p.avant += total; if (total > 0) { p.semaines.push({ semaine: p.semaine, points: total }); p.semaines = p.semaines.slice(-POINTS.semaines); }
      const n = pointsNeufs(sem, jour); n.avant = p.avant; n.semaines = p.semaines; p = st.points = n;
    } else if (jour > p.jour) { p.jour = jour; p.jJournee = 0; p.jEvenements = 0; p.jAmeliorations = 0; }
    return p;
  }
  const pointsSemaineDe = (p) => p.journees + p.evenements + p.ameliorations + p.defi + JEUX_ATELIER.reduce((s, j) => s + pointsAtelier(j.id, p.atelier[j.id]), 0);
  const pointsSemaine = (st) => Math.min(POINTS.semaine, pointsSemaineDe(pointsDuJour(st)));
  const pointsTotal = (st) => pointsDuJour(st).avant + pointsSemaine(st); // depuis le début de la partie (le serveur compte, lui, depuis l'arrivée au classement)
  function detailPoints(st) { // pour l'interface : la semaine en cours, catégorie par catégorie, et ce qu'il reste à prendre aujourd'hui
    const p = pointsDuJour(st);
    return { semaine: p.semaine, jour: p.jour, total: pointsSemaine(st), cumul: pointsTotal(st), journees: p.journees, evenements: p.evenements, ameliorations: p.ameliorations, defi: p.defi,
      atelier: JEUX_ATELIER.map((j) => ({ id: j.id, nom: j.court, score: p.atelier[j.id], points: pointsAtelier(j.id, p.atelier[j.id]) })),
      aujourdhui: { journee: p.jJournee, evenements: p.jEvenements, ameliorations: p.jAmeliorations, max: POINTS.jour }, semaines: p.semaines.slice() };
  }
  function marquerJournee(st) { const p = pointsDuJour(st); if (p.jJournee) return 0; p.jJournee = POINTS.journee; p.journees += POINTS.journee; return POINTS.journee; }
  function marquerDefi(st) { const p = pointsDuJour(st); if (p.defi) return 0; p.defi = POINTS.defi; return POINTS.defi; }
  function marquerEvenement(st) { const p = pointsDuJour(st), n = Math.max(0, Math.min(POINTS.evenement, POINTS.evenementsJour - p.jEvenements)); p.jEvenements += n; p.evenements += n; return n; }
  function marquerAtelier(st, id, score) { const p = pointsDuJour(st), j = jeuAtelier(id); if (!j) return 0; const avant = pointsAtelier(id, p.atelier[id]); p.atelier[id] = Math.max(p.atelier[id], entierPos(score, j.max)); return pointsAtelier(id, p.atelier[id]) - avant; }
  // un achat d'amélioration : prix payé, rythme de la boutique juste AVANT l'achat (€/s), paliers ×2 franchis
  function marquerAmelioration(st, prix, r, paliers) {
    const p = pointsDuJour(st);
    let n = 0;
    if (Number.isFinite(prix) && prix > 0 && Number.isFinite(r) && r > 0) { p.reste += Math.min(1e6, prix / (r * POINTS.tranche)); n = Math.floor(p.reste); p.reste -= n; }
    n += POINTS.palier * Math.max(0, Math.floor(paliers || 0));
    n = Math.min(n, Math.max(0, POINTS.ameliorationsJour - p.jAmeliorations)); // au plafond du jour, le surplus est perdu
    p.jAmeliorations += n; p.ameliorations += n;
    return n;
  }

  // ─── actions ───
  function gagner(st, montant, horsObjectif) { st.coins += montant; st.lifetime += montant; st.lifetimeRun += montant; if (!horsObjectif) noter(st, 'gagner', montant); }
  function acheter(st, i) {
    const s = st.stations[i], n = quantite(st, i), prix = prixNiveaux(st, i, n);
    if (st.coins < prix) return { ok: false, prix };
    const r0 = rythme(st), paliers = s.niv === 0 ? 0 : PALIERS.filter((p) => s.niv + n >= p && s.niv < p).length;
    st.coins -= prix;
    let xp = 0;
    if (s.niv === 0) { noter(st, 'recette', 1); xp = 10 + 10 * i; st.stats.recetteMax = Math.max(st.stats.recetteMax || 0, i); } else { noter(st, 'niveaux', n); xp = 8 * (PALIERS.filter((p) => s.niv + n >= p).length - PALIERS.filter((p) => s.niv >= p).length); }
    s.niv += n;
    if (xp) gagnerXp(st, xp);
    const points = marquerAmelioration(st, prix, r0, paliers);
    return { ok: true, n, prix, xp, points };
  }
  function embaucher(st, i) {
    const s = st.stations[i], prix = prixStaff(st, i);
    if (s.staff || s.niv <= 0 || st.coins < prix) return { ok: false, prix };
    const points = marquerAmelioration(st, prix, rythme(st), 0);
    st.coins -= prix; s.staff = true; s.actif = true; noter(st, 'embaucher', 1); gagnerXp(st, 5 + 3 * i); inc(st, 'embauches');
    return { ok: true, prix, points };
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
    const points = marquerAmelioration(st, prix, rythme(st), 0);
    st.coins -= prix; st.ameliorations[id] = true; noter(st, 'bonus', 1); gagnerXp(st, 6); if (id === 'franchise') st.stats.franchise = true;
    return { ok: true, a, prix, points };
  }
  function nouvelleBoutique(st, nowMs) {
    const gain = etoilesGagnables(st);
    if (gain <= 0) return { ok: false };
    st.etoiles += gain; st.boutiques++; st.nomBoutique = ''; st.specialite = null; gagnerXp(st, 80 + Math.min(120, 2 * gain)); noterSemaine(st, 'boutique');
    st.coins = 0; st.lifetimeRun = 0; st.ameliorations = {}; st.mobilier = {}; st.stations = stationsNeuves(1 + talent(st, 'memoire')); st.ev = null; st.boost = null;
    if (st.saison) st.saison = { id: st.saison.id, annee: st.saison.annee, niv: 0, prog: 0, actif: false }; // les grades des apprentis, le compagnon (et ceux achetés) et la collection restent
    st.lastSeen = nowMs;
    // les objectifs du jour pas encore réclamés sont retirés à la taille de la nouvelle boutique (les réussis restent acquis)
    if (st.jour) { const neufs = tirerObjectifs(st, st.jour.date); st.jour.objectifs = st.jour.objectifs.map((o, k) => (o.reclame ? o : neufs[k])); }
    return { ok: true, gain };
  }

  // ─── un pas de jeu ; rend {ventes, nouvelEv, finEv, mystere} ───
  function tick(st, dt, nowMs, rnd) {
    st.now = nowMs; rnd = rnd || Math.random;
    const out = { ventes: [], nouvelEv: null, finEv: null, mystere: false, habitue: null, trophees: [], grades: [], chat: false, saison: null, venteSaison: null, maitrise: null };
    objectifsDuJour(st, nowMs);
    if (st.saison && st.saisonAnnoncee !== st.saison.id + ':' + st.saison.annee) { st.saisonAnnoncee = st.saison.id + ':' + st.saison.annee; out.saison = recetteSaison(st); } // une nouvelle recette de saison, annoncée une fois (même à l'ouverture du jeu)
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
    if (st.boosts && st.boosts.actif && st.boosts.actif.fin <= nowMs) st.boosts.actif = null;
    const ss = st.saison; // la fournée de saison
    if (ss && ss.actif) { ss.prog += dt; if (ss.prog >= tempsSaison(st)) out.venteSaison = { id: ss.id, montant: cuireSaison(st, out) }; }
    if (chatPossible(st) && !st.ev) { st.chatAttente = (st.chatAttente == null ? CHAT.apparition : st.chatAttente) - dt; if (st.chatAttente <= 0) { st.chatAttente = CHAT.rappel; out.chat = true; } } // un chat miaule à la porte
    st.mystereTimer -= dt;
    if (st.mystereTimer <= 0) { st.mystereTimer = (150 + rnd() * 200) * (1 - 0.15 * talent(st, 'pourboire')) * (1 - 0.08 * mobilierCran(st, 'caisse')); out.mystere = true; }
    const hb = habitueAttendu(st, nowMs); // un habitué passe une fois par jour, pendant son créneau, après quelques secondes de jeu
    if (hb && rnd() < dt / 25) { st.habitues[hb.id] = st.habitues[hb.id] || { jours: 0, dernier: '', vuLe: '' }; st.habitues[hb.id].vuLe = dayKey(nowMs); out.habitue = hb; }
    out.trophees = verifierTrophees(st);
    return out;
  }
  // ─── absence : les apprentis ont travaillé (8 h au plus), les fournées en cours se terminent ; pas d'événement sans toi ───
  // Une sortie courte (PAUSE_EV) met l'événement en cours et le coup de feu (st.boost) EN PAUSE : leurs échéances sont repoussées de la
  // durée de la sortie, on les retrouve tels quels ; l'absence elle-même se paie sans eux. Une sortie plus longue les efface (sans pénalité).
  function absence(st, nowMs) {
    const sortie = Math.max(0, nowMs - st.lastSeen), garder = sortie <= PAUSE_EV * 1000;
    const ev = garder ? st.ev : null, boost = garder ? st.boost : null;
    st.now = nowMs; st.ev = null; st.boost = null;
    if (st.boosts && st.boosts.actif && st.boosts.actif.fin <= nowMs) st.boosts.actif = null; // un boost de la réserve fini pendant l'absence s'éteint (le reste de l'absence est sans lui)
    const secs = Math.min(heuresAbsence(st) * 3600, Math.max(0, (nowMs - st.lastSeen) / 1000));
    let total = 0; const detail = [], grades = [];
    st.stations.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(st, i);
      if (s.staff) {
        const n = Math.floor((s.prog + secs) / T);
        s.prog = (s.prog + secs) % T;
        if (n > 0) { const m = revenu(st, i) * n; total += m; detail.push({ i, n, m }); st.stats.ventes += n; const g = creditApprenti(st, i, n, APPRENTI_ABSENCE); if (g) grades.push(g); }
      } else if (s.prog + secs >= T) { const m = revenuFournee(st, i); total += m; detail.push({ i, n: 1, m }); s.prog = 0; s.actif = false; st.stats.ventes++; }
      else s.prog += secs;
    });
    const ss = st.saison; // une fournée de saison lancée avant de partir se termine
    if (ss && ss.actif && ss.prog + secs >= tempsSaison(st)) { const r = recetteSaison(st), m = cuireSaison(st, null, true); total += m; detail.push({ i: -1, nom: r.nom, n: 1, m }); } else if (ss && ss.actif) ss.prog += secs;
    if (total > 0) gagner(st, total, true);
    if (ev) { if (Number.isFinite(ev.debut)) ev.debut += sortie; if (Number.isFinite(ev.fin)) ev.fin += sortie; st.ev = ev; } // en pause : il reprend où on l'a laissé
    if (boost) { boost.fin += sortie; st.boost = boost; }
    st.lastSeen = nowMs;
    return { secs, total, detail, grades, pause: !!(ev || boost) };
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
  function fmtDuree(s) { if (s < 59.5) return Math.round(s) + ' s'; const mn = Math.round(s / 60); if (mn < 60) return mn + ' min'; const h = Math.floor(mn / 60), m = mn % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; } // arrondi à la minute d'abord : 7 h 59 min 45 s → « 8 h », pas « 7 h 60 »
  const fmtChrono = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  return { APPRENTIS, APPRENTI_NIVEAUX, APPRENTI_VITESSE, APPRENTI_ABSENCE, xpApprenti, gradeApprenti, progresApprenti, creditApprenti, apprentiTempsMult, apprentiRevMult, effetTalentApprenti,
    CHAT, chatPossible, adopterChat, refuserChat, renommerChat, caresser, PELAGES, donnerChatNoir, choisirPelage, pelagesChat, pelageChat,
    COMPAGNONS, COMPAGNON_PLANCHER, compagnon, estChat, prixCompagnon, aCompagnon, compagnonActif, bonusCompagnon, compagnonGains, modeleCompagnon, compagnons, choisirCompagnon, acheterCompagnon,
    RECETTES_SAISON, SAISON, recetteDeSaison, forcerRecette, recetteSaison, saisonDuJour, tempsSaison, revenuSaison, coutSaison, preparerSaison, lancerSaison,
    PRODUITS, PALIERS, AMELIORATIONS, MOBILIER, mobilierCran, prixMeuble, mobilierMult, ameliorerMeuble, ETOILE_BONUS, ETOILE_BASE, ETOILE_FREIN, ABSENCE_MAX_H, PAUSE_EV, TITRES, TALENTS, XP_NIVEAU, QUARTIERS, quartier, nomBoutique, renommer, saison, HABITUES, TROPHEES, PAIN_DU_JOUR_MULT, SPECIALITE_MULT, RUSH, COMMANDE, CRITIQUE, MEUNIER, PETRISSAGE, PANNE, ANNIVERSAIRE, EVENEMENTS, MARCHE_MULT, newState, dayKey, paris, heureParis, jourDeMarche, heureDePointe, arrondi,
    palierMult, prochainPalier, ameliorationMult, etoileMult, boostMult, revenu, revenuBase, revenuFournee, coutNiveau, coutNiveaux, maxNiveaux, remise, prixNiveaux, prixStaff, prixBonus, primeMult, temps, tempsMult, heuresAbsence, affluenceMult, quantite,
    talent, niveauPour, niveau, titre, rangTitre, ptsTalents, gagnerXp, apprendre, tauxParSeconde, tauxBase, rythme, etoilesPour, etoilesGagnables,
    objectifsDuJour, noter, reclamer, serieEnCours, painDuJour, semaineKey, semaineEnCours, noterSemaine, reclamerSemaine, habitueAttendu, servirHabitue, choisirSpecialite, verifierTrophees, lancerEvenement, lancerRush, lancerCommande, lancerCritique, lancerMeunier, lancerPetrissage, lancerPanne, lancerAnniversaire, livrer, servir, petrir, reparer, pourboire, encaisserPourboire, donnerBoost, boostsNeufs, donnerBoostReserve, PRIME_HEURE_PLANCHER, primeHeures, donnerPrimeHeures, lancerBoostReserve,
    gagner, acheter, embaucher, lancer, amelioration, nouvelleBoutique, tick, absence, fmt, fmtEur, fmtDuree, fmtChrono,
    ATELIER, JEUX_ATELIER, jeuAtelier, atelierDuJour, qualiteAtelier, primePleineAtelier, primeAtelier, restantesAtelier, finirAtelier,
    FOUR, fourNiveau, fourNouveau, fourAvancer, fourToucher, FACONNAGE, MODELES_FACONNAGE, reechantillonner, noterFaconnage, ajouterTrait, couvertureFaconnage,
    INGREDIENTS, MEMOIRE, memoireMontre, memoireRecette, memoireSaisir, memoireScore,
    POINTS, pointsDuJour, pointsAtelier, pointsSemaine, pointsTotal, detailPoints, marquerJournee, marquerDefi, marquerEvenement, marquerAtelier, marquerAmelioration,
    GARDEROBE, garderobe, garderobeNeuve, vetement, possede, niveauVetement, donnerVetement, donnerCollection, equiper, equiperCollection, coutVetement, ameliorerVetement, bonusPiece, ensembleComplet, bonusGardeRobe, garderobeMult, texteBonus, tenueBoulanger, toqueMetal, garderobeCle };
});
