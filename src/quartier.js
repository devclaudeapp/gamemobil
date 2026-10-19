/* LE FOURNIL — l'événement « Le Quartier » : les règles pures de la Planque, la boutique à part de l'événement (du mardi 13 octobre
   2026 à midi au mardi 27 octobre 2026 à midi, heure de Paris). Une parodie pour adultes, derrière une porte « 18 ans et + » : un petit
   trafic de quartier façon dessin animé, des noms, des gags et des mécaniques de jeu — jamais la moindre information réelle.
   Tout le monde part de zéro, avec sa propre monnaie (les billets), ses six produits (et deux recettes de plus après le boss), ses postes, ses « apprentis », ses améliorations,
   ses coups de pouce ; les gains d'absence sont plafonnés comme ceux de la boulangerie (sur l'horloge de confiance : « maintenant »
   est toujours donné par l'appelant, jamais lu ici). Douze paliers de billets gagnés, les mêmes pour tous, donnent des récompenses
   POUR LA BOULANGERIE (étoiles, boosts en réserve, décos du quartier, vêtements) : voir PALIERS ; huit paliers bonus « après le boss »
   (13 à 20), sept combines de plus (dont le Grossiste : les niveaux à moitié prix) et deux nouvelles recettes (le sirop violet au 13e,
   le cristal bleu au 16e) attendent ceux qui ont franchi le 12e avant la fin. À la fin, la Planque ferme ; tout le
   reste reste à vie. Aucune dépendance au DOM ni à game.js : tourne aussi dans Node (test/fournil-quartier.test.js, qui simule le rythme).
   Les activités (src/activites.js, le moteur commun à tous les événements) : les mini-jeux, les contrats de la nuit et les opérations ;
   leur habillage du quartier est dans FICHE.activites, plus bas ; leur API (MINI, finirMini, contratsDuJour, lancerOperation…) est
   exportée ici telle quelle, comme celle de la Maison hantée. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./activites.js'));
  else root.QUARTIER = factory(root.ACTIVITES);
})(typeof self !== 'undefined' ? self : this, function (ACT) {
  'use strict';

  // ─── l'heure de Paris (la même règle que game.js et classement.js : l'heure d'été du dernier dimanche de mars au dernier dimanche d'octobre, à 1 h UTC) ───
  function decalageParis(ms) {
    const a = new Date(ms).getUTCFullYear();
    const dernierDimanche = (mois) => { const d = new Date(Date.UTC(a, mois + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
    return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 * 3600e3 : 3600e3;
  }
  const paris = (ms) => new Date(ms + decalageParis(ms));
  function parisMs(a, m, j, h) { // une heure de Paris → ms (en deux passes : le décalage dépend de la date)
    let t = Date.UTC(a, m - 1, j, h) - 3600e3; t = Date.UTC(a, m - 1, j, h) - decalageParis(t); return Date.UTC(a, m - 1, j, h) - decalageParis(t);
  }
  const dayKey = (ms) => { const d = paris(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

  // ─── la fenêtre : du mardi 13 octobre 2026 à 12 h au mardi 27 octobre 2026 à 12 h, heure de Paris (le 25, l'heure d'hiver arrive : 11 h UTC) ───
  const DEBUT = parisMs(2026, 10, 13, 12), FIN = parisMs(2026, 10, 27, 12), JOUR = 864e5;
  const CLASSEMENT_JUSQUA = FIN + 14 * JOUR; // l'onglet « Événement » du classement reste visible deux semaines après la fin (le podium final)
  function fenetre(now) {
    const t = Number.isFinite(now) ? now : 0;
    const avant = t < DEBUT, fini = t >= FIN, ouvert = !avant && !fini;
    const jour = avant ? 0 : fini ? 15 : Math.min(15, Math.round((Date.parse(dayKey(t) + 'T12:00:00Z') - Date.parse(dayKey(DEBUT) + 'T12:00:00Z')) / JOUR) + 1); // le jour de Paris : du 13 (1) au 27 (15)
    return { avant, ouvert, fini, reste: ouvert ? FIN - t : 0, dans: avant ? DEBUT - t : 0, jour, jours: 15, classement: t >= DEBUT && t < CLASSEMENT_JUSQUA };
  }
  // l'ouverture se lit aussi sur l'HEURE SÛRE (HORLOGE.etat().sure : une borne basse du vrai temps) : une horloge du téléphone avancée
  // hors ligne (le jeu lui accorde jusqu'à une absence d'avance) n'ouvre pas la Planque avant mardi midi. Sans heure sûre connue
  // (artefact Claude, jamais en ligne) : le « maintenant » du jeu seul. La fin, elle, se lit toujours sur le « maintenant » du jeu.
  function fenetreSure(now, sure) {
    const f = fenetre(now);
    return f.ouvert && Number.isFinite(sure) && sure > 0 && sure < DEBUT ? fenetre(sure) : f;
  }
  const GRACE = 3600e3; // le serveur compte encore les billets une heure après la fin (ceux d'avant la fin, plafonnés à l'enveloppe de la fin)
  const envoiBillets = (now) => Number.isFinite(now) && now >= DEBUT && now < FIN + GRACE;

  // ─── les six produits de la Planque, dans l'ordre où on les débloque (les billets : en €, comme la boulangerie, mais un autre tiroir) ───
  // Après le boss, deux recettes de plus (apres : le palier qui les ouvre, comme les combines) : le très actif attendait jusqu'à une heure
  // par niveau vers le 10e jour (le prix grimpe en puissance, le gain en ligne droite) ; elles repartent du bas, leurs premiers niveaux
  // tombent en quelques secondes, puis en quelques minutes. v6.3 (17 octobre) : de vraies recettes. Leurs gains étaient gardés tout
  // petits (rev 1 000 et 8 000 : un niveau de sirop se remboursait en ~20 h contre ~15 min pour la Spécialité, ~1 % des gains) ; ×12 pour
  // le sirop, ×40 pour le cristal : pour le très actif, un niveau se rembourse en à peu près autant de temps qu'un niveau de Spécialité
  // (×1,5 à ×2,6 pour le sirop, Gobelets achetés) et, montées, elles font ~30 % de ses gains au dernier jour (sirop ~16 %, cristal ~14 %).
  // Les niveaux achetés restent : seul le gain par niveau change. L'enveloppe du serveur (fournil_quartier_table, SQL v6.3) a été élargie
  // d'autant ; le marathon simulé reste ×2 dessous (test/fournil-quartier.test.js).
  // v6.4 (18 octobre) : encore ×4 pour le sirop (12 000 → 48 000), ×2 pour le cristal (320 000 → 640 000). Un joueur réel (jour 6,
  // palier 13, Spécialité niveau 175, sirop niveau 135, sans les Gobelets) remboursait un niveau de sirop en ~450 h contre ~80 h pour la
  // Spécialité (le prochain niveau ÷ ce qu'un niveau de plus rapporte par seconde, paliers compris) : ×5,6 ; maintenant ×1,4 sans les
  // Gobelets, ×0,47 avec (la meilleure affaire du moment, c'est voulu). Le cristal sans le Camping-car : ×1 à ×1,4 pour le très actif
  // (dès le lendemain du 16e). Montées, avec les Gobelets, les deux recettes font ~55-65 % des gains du très actif au dernier jour. Seul rev
  // change ; l'enveloppe du serveur (fournil_quartier_table, SQL v6.4) a été élargie d'autant.
  const PRODUITS = [
    { id: 'herbe', nom: 'Herbe', pl: 'sachets d’herbe', cout: 4, debloquer: 0, rev: 1, temps: 1.5, croiss: 1.07, staff: 1500, staffNom: 'Guetteur Kévin', poste: 'Le banc du square', desc: 'Le classique. Ça sent jusqu’au troisième.' },
    { id: 'shit', nom: 'Shit', pl: 'barrettes', cout: 60, debloquer: 120, rev: 20, temps: 3, croiss: 1.15, staff: 22500, staffNom: 'Charbonneur Dylan', poste: 'Le hall du bâtiment B', desc: 'Emballé dans du papier alu, comme un sandwich.' },
    { id: 'champis', nom: 'Champis', pl: 'poignées de champis', cout: 720, debloquer: 1440, rev: 150, temps: 6, croiss: 1.14, staff: 150000, staffNom: 'Nourrice Mémé Jacqueline', poste: 'La cave de Mémé', desc: 'Cueillis « dans le pré d’à côté », paraît-il.' },
    { id: 'ecsta', nom: 'Ecsta', pl: 'pochons de cachetons', cout: 8640, debloquer: 17280, rev: 1200, temps: 12, croiss: 1.13, staff: 750000, staffNom: 'Rabatteur Momo', poste: 'Le parking de la boîte', desc: 'Roses, avec un petit cœur dessus.' },
    { id: 'coke', nom: 'Coke', pl: 'pochettes', cout: 1e5, debloquer: 2e8, rev: 10000, temps: 24, croiss: 1.12, staff: 6e8, staffNom: 'Comptable Tonton Serge', poste: 'L’arrière-salle du PMU', desc: 'La clientèle a des mocassins.' },
    { id: 'specialite', nom: 'La Spécialité du quartier', pl: 'Spécialités', cout: 1.2e6, debloquer: 2e10, rev: 9e4, temps: 96, croiss: 1.11, staff: 6e10, staffNom: 'Livreur Rachid', poste: 'Le camion à kebabs', desc: 'Personne ne sait ce qu’il y a dedans. Tout le monde en redemande.' },
    { id: 'sirop', nom: 'Sirop violet', pl: 'gobelets de sirop violet', apres: 13, cout: 1e12, debloquer: 2e13, rev: 48000, temps: 120, croiss: 1.02, staff: 5e13, staffNom: 'Pharmacien Gérard', poste: 'L’arrière-boutique de la pharmacie', desc: 'Ça se boit à la paille, et ça ralentit tout le square.' },
    { id: 'cristal', nom: 'Cristal bleu', pl: 'sachets de cristal bleu', apres: 16, cout: 1e13, debloquer: 2e14, rev: 640000, temps: 240, croiss: 1.025, staff: 5e14, staffNom: 'Chimiste Monsieur Blanc', poste: 'Le camping-car du terrain vague', desc: 'Bleu comme à la télé. Le chimiste jure qu’il est prof de chimie.' },
  ];
  // les paliers des postes : au palier franchi le plus haut, les gains sont multipliés par 2^exposant. Les anciens (25, 50, 100, 200…
  // 5000) gardent leur exposant entier (le même multiplicateur cumulé qu'avant : ×2 à chacun) ; v6.2, ceux qu'on a intercalés (75, 125,
  // 150, 175, 250…, les mêmes que la boulangerie) ont un exposant fractionnaire : un palier bien plus souvent pour le joueur constant, un
  // petit ×1,41 ou ×1,19 à chaque fois, sur les huit recettes. Ils montent les gains entre deux anciens paliers : l'enveloppe du serveur
  // a été élargie d'autant (supabase/fournil-classement.sql, « v6.2 : paliers intercalés » ; le marathon simulé reste ×2 dessous).
  const PALIERS_EXPOSANTS = [[25, 1], [50, 2], [75, 2.5], [100, 3], [125, 3.25], [150, 3.5], [175, 3.75], [200, 4], [250, 4.5], [300, 5], [350, 5.5], [400, 6], [450, 6.5],
    [500, 7], [625, 7.5], [750, 8], [875, 8.5], [1000, 9], [1250, 9.5], [1500, 10], [1750, 10.5], [2000, 11], [2500, 11.5], [3000, 12], [4000, 12.5], [5000, 13]];
  const PALIERS_POSTE = PALIERS_EXPOSANTS.map((x) => x[0]);
  const AMELIORATIONS = [
    { id: 'sachets', nom: 'Sachets zippés', cout: 50000, cible: ['herbe'], mult: 3, desc: 'Herbe ×3' },
    { id: 'alu', nom: 'Papier alu premium', cout: 600000, cible: ['shit'], mult: 3, desc: 'Shit ×3' },
    { id: 'balance', nom: 'Balance de précision', cout: 3e6, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'cave', nom: 'Cave humide', cout: 8e6, cible: ['champis'], mult: 3, desc: 'Champis ×3' },
    { id: 'soirees', nom: 'Soirées privées', cout: 8e7, cible: ['ecsta'], mult: 3, desc: 'Ecsta ×3' },
    { id: 'scooter', nom: 'Scooter débridé', cout: 2e8, cible: ['herbe', 'shit'], mult: 5, desc: 'Herbe et shit ×5' },
    { id: 'reseau', nom: 'Réseau du quartier', cout: 5e8, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'vip', nom: 'Clientèle VIP', cout: 1e10, cible: ['coke'], mult: 3, desc: 'Coke ×3' },
    { id: 'kebab', nom: 'Camion à kebabs blindé', cout: 3e11, cible: ['specialite'], mult: 3, desc: 'Spécialité ×3' },
    { id: 'cartel', nom: 'Franchise du cartel', cout: 6e12, cible: null, mult: 3, desc: 'Tout ×3' },
    // après le boss (palier 12 franchi) : quatre combines chères qui ne multiplient pas les ventes (l'enveloppe du serveur, voir
    // fournil_quartier_table : le marathon simulé doit rester ×2 dessous) ; elles adoucissent les coups de pouce et l'absence (effet) ; et,
    // depuis la version 2 des récompenses, chacune PAIE la boulangerie à l'achat : prime (heures de son rythme) et étoiles (ACT.RECOMPENSES).
    // Le Grossiste (effet remise) : tous les niveaux de recettes à moitié prix (pas les déblocages) ; deux combines ×3 pour les recettes
    // d'après le boss, ouvertes avec elles (13e et 16e) : les seules d'après le boss qui multiplient des ventes (l'enveloppe v6.3 les compte, offertes dès le 12e).
    { id: 'grossiste', nom: 'Le Grossiste', cout: 8e14, apres: 12, cible: [], mult: 1, effet: { remise: 0.5 }, prime: 4, etoiles: 1, desc: 'Tous les niveaux de recettes à moitié prix' },
    { id: 'guetteurs', nom: 'Guetteurs sur les toits', cout: 1e15, apres: 12, cible: [], mult: 1, effet: { descenteN: 8, descentePart: 0.05 }, prime: 6, etoiles: 1, desc: 'Descentes : 8 touches suffisent, la police n’embarque plus que 5 %' },
    { id: 'matelas', nom: 'Le matelas de Mémé Jacqueline', cout: 2e15, apres: 12, cible: [], mult: 1, effet: { absenceH: 12, absencePart: 0.2 }, prime: 10, etoiles: 2, desc: 'Absence : l’équipe bosse 12 h, à 20 % du rythme' },
    { id: 'gobelets', nom: 'Gobelets à double fond', cout: 3e15, apres: 13, cible: ['sirop'], mult: 3, prime: 12, etoiles: 2, desc: 'Sirop violet ×3' },
    { id: 'sono', nom: 'Sono qui fait trembler le square', cout: 4e15, apres: 12, cible: [], mult: 1, effet: { soireeDuree: 180 }, prime: 16, etoiles: 2, desc: 'Soirées : 3 min au lieu de 2' },
    { id: 'trottinette', nom: 'Trottinette électrique du livreur', cout: 8e15, apres: 12, cible: [], mult: 1, effet: { scooterDuree: 20, scooterPrime: 3 }, prime: 24, etoiles: 3, desc: 'Le livreur attend 20 s, son bonus ×3' },
    { id: 'campingcar', nom: 'Camping-car insonorisé', cout: 1.2e16, apres: 16, cible: ['cristal'], mult: 3, prime: 20, etoiles: 3, desc: 'Cristal bleu ×3' },
  ];
  const effet = (q, cle, defaut) => { for (const a of AMELIORATIONS) if (a.effet && a.effet[cle] != null && q.ameliorations && q.ameliorations[a.id]) return a.effet[cle]; return defaut; }; // une combine « après le boss » achetée change ce réglage
  const ABSENCE_MAX_H = 8;   // les apprentis bossent 8 h au plus pendant une absence, comme à la boulangerie…
  const ABSENCE_PART = 0.1;  // … mais au ralenti : sans le boss, le quartier dort (10 % du rythme)
  const PRESENCE = 6;        // le boss est là : toutes les ventes ×6 tant que la Planque est ouverte (c'est en jouant qu'on grimpe)
  const REPUTATION = 1.5;    // chaque palier franchi fait la réputation du quartier : toutes les ventes ×1,5 de plus (×1,5¹² au 12e)
  const EVENEMENTS = {
    descente: { duree: 15, n: 12, part: 0.1 },  // descente de police : 12 touches en 15 s pour tout planquer (prime) ; sinon la police embarque 10 % des billets
    grosclient: { duree: 180, prime: 6 },        // un gros client : N unités en 3 min, payées 6 fois
    soiree: { duree: 120, mult: 2 },             // soirée : toutes les ventes ×2 pendant 2 min
    scooter: { duree: 10 },                      // le livreur en scooter passe : attraper le bonus en 10 s
  };

  // ─── les douze paliers : des billets gagnés (total), les mêmes pour tous ; chacun donne une récompense pour la boulangerie ───
  // Réglés sur la simulation (test/fournil-quartier.test.js, et scratchpad quartier/evenement/regler.js) : un assidu (80 min par jour, en
  // quatre sessions) franchit le 12e le 11e jour ; un quotidien (36 min par jour) le 8e le 9e jour, le 9e le 11e, le 10e le dernier jour ;
  // un occasionnel (17 min) le 6e vers le 8e jour. C'est en jouant qu'on grimpe (PRESENCE) : les gains d'absence ne font que suivre.
  // Après le boss (bonus: true), les paliers 13 à 20 : pour ceux qui franchissent le 12e bien avant la fin. Un très actif (8 h par jour,
  // le 12e au 3e jour) en franchit un tous les jour ou deux ; le marathon (24 h/24) n'atteint le 20e que vers le 8e jour (le 10e avant la v6.3). Ils ne font
  // plus la réputation (REPUTATION ne compte que les douze premiers : l'enveloppe du serveur ne bouge pas) ; ils donnent des étoiles,
  // des boosts, une prime, un titre, et au 20e la casquette néon (un trophée de la garde-robe, distinct de la tenue en or du podium final).
  // Version 2 des récompenses (16 octobre) : les seuils (total) ne bougent pas ; tout ce qui s'ajoute va à la BOULANGERIE. prime : des
  // heures de son rythme (GAME.donnerPrimeHeures), versées à la remise. Les douze premiers, un peu plus généreux (10 étoiles au lieu de 8,
  // 16 h de primes) ; les huit bonus, bien plus (29 étoiles au lieu de 5, des ×5 et des ×10 de 30 à 60 min, 54 h de primes). ANCIENS : les
  // valeurs d'avant, pour la revue d'une sauvegarde déjà avancée (ACT.RECOMPENSES.revue : la différence, une fois).
  const PALIERS = [
    { n: 1, total: 1.2e8, etoiles: 1, boost: { mult: 2, secs: 1800 }, titre: 'Premiers billets' },
    { n: 2, total: 2.5e8, deco: 'graffiti', prime: 1, titre: 'Le mur du quartier' },
    { n: 3, total: 6e10, vetement: 'quartier-casquette', titre: 'La casquette' },
    { n: 4, total: 2e11, etoiles: 2, boost: { mult: 2, secs: 1800 }, titre: 'Le coin des habitués' },
    { n: 5, total: 1.4e12, deco: 'neon', prime: 2, titre: 'L’enseigne néon' },
    { n: 6, total: 3.5e12, vetement: 'quartier-sweat', titre: 'Le sweat à capuche' },
    { n: 7, total: 1.1e13, etoiles: 1, boost: { mult: 5, secs: 900 }, titre: 'Le gros coup' },
    { n: 8, total: 2.4e13, deco: 'scooter', prime: 3, titre: 'Le scooter' },
    { n: 9, total: 5e13, vetement: 'quartier-baskets', titre: 'Les baskets' },
    { n: 10, total: 1e14, etoiles: 2, boost: { mult: 2, secs: 3600 }, titre: 'Le caïd' },
    { n: 11, total: 2e14, deco: 'chien', prime: 4, titre: 'Le chien du quartier' }, // le chien : aussi un compagnon de la boutique (GAME.COMPAGNONS, « chien-quartier »)
    { n: 12, total: 5e14, vetement: 'quartier-chaine', etoiles: 4, boost: { mult: 5, secs: 3600 }, prime: 6, titre: 'Le boss du quartier' },
    { n: 13, total: 1.5e15, bonus: true, etoiles: 2, boost: { mult: 5, secs: 1800 }, prime: 4, titre: 'Le boss a pris des vacances (non)' },
    { n: 14, total: 3.5e15, bonus: true, etoiles: 2, prime: 6, titre: 'Les pigeons du square te saluent' },
    { n: 15, total: 6e15, bonus: true, etoiles: 3, boost: { mult: 5, secs: 2700 }, titre: 'Le PMU t’ouvre une ardoise' },
    { n: 16, total: 9e15, bonus: true, etoiles: 3, prime: 8, titre: 'Ta tête sur les tee-shirts du marché' },
    { n: 17, total: 1.3e16, bonus: true, etoiles: 3, boost: { mult: 10, secs: 1800 }, titre: 'Mémé Jacqueline te tricote un bonnet' },
    { n: 18, total: 1.8e16, bonus: true, etoiles: 4, prime: 12, titre: 'Le chien du quartier porte ton nom' },
    { n: 19, total: 2.2e16, bonus: true, etoiles: 4, boost: { mult: 10, secs: 2700 }, titre: 'La mairie parle d’une statue' },
    { n: 20, total: 1.1e17, bonus: true, vetement: 'quartier-neon-casquette', etoiles: 8, boost: { mult: 10, secs: 3600 }, prime: 24, titre: 'La légende en néon' },
  ];
  const ANCIENS = { // les récompenses d'avant la version 2 (étoiles, boost ; aucune prime) : la revue donne la différence
    1: { etoiles: 1, boost: { mult: 2, secs: 1800 } }, 4: { etoiles: 2, boost: { mult: 2, secs: 1800 } }, 7: { boost: { mult: 5, secs: 900 } }, 10: { etoiles: 2, boost: { mult: 2, secs: 3600 } },
    12: { etoiles: 3, boost: { mult: 5, secs: 1800 } }, 13: { boost: { mult: 2, secs: 1800 } }, 14: { etoiles: 1 }, 15: { boost: { mult: 2, secs: 3600 } }, 16: { etoiles: 1 },
    17: { boost: { mult: 5, secs: 900 } }, 18: { etoiles: 1 }, 19: { boost: { mult: 2, secs: 3600 } }, 20: { etoiles: 2, boost: { mult: 5, secs: 1800 } },
  };
  const PALIERS_BOSS = 12; // le dernier palier « normal » ; après lui, les paliers bonus
  const TROPHEE = 'quartier-neon-casquette'; // la casquette néon du palier 20 (garde-robe : collection « quartier-neon »)
  const VETEMENTS = ['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'quartier-chaine'];
  const VETEMENTS_OR = ['quartier-or-casquette', 'quartier-or-sweat', 'quartier-or-baskets', 'quartier-or-chaine']; // le podium final
  const DECOS = ['graffiti', 'neon', 'scooter', 'chien'];

  // ─── l'état : st.quartier, créé à la première visite (dans la sauvegarde du jeu) ───
  function postesNeufs() { return PRODUITS.map((p, i) => ({ niv: i === 0 ? 1 : 0, staff: false, prog: 0, actif: false })); }
  function neuf(now) {
    return { v: 1, majeur: false, masque: false, annonce: false, bilan: false, billets: 0, total: 0, postes: postesNeufs(), ameliorations: {}, mode: 1,
      ev: null, evTimer: 150, dernierEv: '', boost: null, lastSeen: now, now, ouvertLe: 0, paliers: [], vetements: [], decos: [], recompensesV2: true, heures: 0, etoiles: 0, boosts: 0,
      stats: { ventes: 0, taps: 0, descentes: 0, descentesRatees: 0, grosClients: 0, scooters: 0, soirees: 0, embauches: 0, saisi: 0 }, carnet: [], mini: null, contrats: null, operation: null };
  }
  function etat(st, now) { // l'état de l'événement, remis d'aplomb
    let q = st.quartier;
    if (!q || typeof q !== 'object' || !Array.isArray(q.postes)) q = st.quartier = neuf(now);
    while (q.postes.length < PRODUITS.length) q.postes.push({ niv: 0, staff: false, prog: 0, actif: false });
    for (const k of ['paliers', 'vetements', 'decos', 'carnet']) if (!Array.isArray(q[k])) q[k] = [];
    if (!q.stats || typeof q.stats !== 'object') q.stats = neuf(now).stats;
    if (!q.ameliorations || typeof q.ameliorations !== 'object') q.ameliorations = {};
    if (!(q.billets >= 0)) q.billets = 0; if (!(q.total >= 0)) q.total = 0;
    A.reparer(q); // les activités : q.mini, q.contrats, q.operation, et leurs compteurs (une vieille sauvegarde n'en a pas)
    return q;
  }
  const note = (q, txt) => { q.carnet.push({ t: q.now, txt }); if (q.carnet.length > 12) q.carnet.shift(); };

  // ─── calculs ───
  const paliersPoste = () => PALIERS_POSTE; // les mêmes pour toutes les recettes (i accepté, pour l'écran)
  const exposantPalier = (niv) => { let e = 0; for (const [p, x] of PALIERS_EXPOSANTS) if (niv >= p) e = x; return e; }; // l'exposant du plus haut palier franchi
  const palierMult = (niv) => Math.pow(2, exposantPalier(niv));
  const prochainPalier = (niv) => PALIERS_POSTE.find((p) => p > niv) || null;
  const gainPalier = (p) => palierMult(p) / palierMult(p - 1); // ce que ce palier ajoute (×2 aux anciens, ×1,41 ou ×1,19 aux intercalés) : pour l'écran
  function ameliorationMult(q, i) { let m = 1; for (const a of AMELIORATIONS) if (q.ameliorations[a.id] && (a.cible === null || a.cible.includes(PRODUITS[i].id))) m *= a.mult; return m; }
  function boostMult(q) { let m = PRESENCE; if (q.ev && q.ev.type === 'soiree' && q.ev.fin > q.now) m *= EVENEMENTS.soiree.mult; return m; } // en présence du boss
  const reputationMult = (q) => Math.pow(REPUTATION, paliersAtteints(q).filter((p) => !p.bonus).length); // les paliers bonus ne font plus la réputation
  const temps = (q, i) => PRODUITS[i].temps;
  const revenuBase = (q, i) => { const s = q.postes[i]; return s.niv <= 0 ? 0 : PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(q, i) * reputationMult(q); };
  const revenu = (q, i) => revenuBase(q, i) * boostMult(q);
  const revenuFournee = (q, i) => revenu(q, i) * (q.postes[i].staff ? 1 : 1.5); // à la main, on sert un client de plus
  // les prix catalogue (sans q) ; ce que paie le joueur passe par prixNiveaux / quantite, qui lisent la remise du Grossiste (q)
  const coutNiveau = (i, niv) => (niv === 0 ? PRODUITS[i].debloquer : PRODUITS[i].cout * Math.pow(PRODUITS[i].croiss, niv));
  function coutNiveaux(i, niv, n) { if (niv === 0) return PRODUITS[i].debloquer; const r = PRODUITS[i].croiss; return PRODUITS[i].cout * Math.pow(r, niv) * (Math.pow(r, n) - 1) / (r - 1); }
  function maxNiveaux(i, niv, billets) { const r = PRODUITS[i].croiss, a = PRODUITS[i].cout * Math.pow(r, niv); if (billets < a) return 0; return Math.floor(Math.log(billets * (r - 1) / a + 1) / Math.log(r)); }
  const remise = (q) => (q ? effet(q, 'remise', 1) : 1); // le Grossiste : 0,5 (les niveaux à moitié prix ; un déblocage garde son prix)
  const maxAchetables = (q, i) => maxNiveaux(i, q.postes[i].niv, q.billets / remise(q)); // ce que les billets paient, remise comprise
  function quantite(q, i) { const s = q.postes[i]; if (s.niv === 0) return 1; if (q.mode === 'max') return Math.max(1, maxAchetables(q, i)); return q.mode; }
  const prixNiveaux = (q, i, n) => { const niv = q.postes[i].niv; return niv === 0 ? coutNiveaux(i, 0, n) : coutNiveaux(i, niv, n) * remise(q); };
  const recetteOuverte = (q, i) => !PRODUITS[i].apres || q.total >= PALIERS[PRODUITS[i].apres - 1].total; // les recettes « après le boss » : une fois leur palier franchi
  const prixStaff = (q, i) => PRODUITS[i].staff;
  function tauxBase(q) { let t = 0; q.postes.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenuBase(q, i) / temps(q, i); }); return t; }
  function tauxParSeconde(q) { let t = 0; q.postes.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenu(q, i) / temps(q, i); }); return t; }
  function rythme(q) { const t = tauxBase(q); if (t > 0) return t; let best = 0; q.postes.forEach((s, i) => { if (s.niv > 0) best = Math.max(best, revenuBase(q, i) / Math.max(1, temps(q, i)) * 0.5); }); return Math.max(0.5, best); }
  function arrondi(n) { if (n < 10) return Math.max(1, Math.round(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }
  const heuresAbsence = (q) => (q ? effet(q, 'absenceH', ABSENCE_MAX_H) : ABSENCE_MAX_H);
  const partAbsence = (q) => (q ? effet(q, 'absencePart', ABSENCE_PART) : ABSENCE_PART);

  // ─── actions ───
  function gagner(q, montant) { q.billets += montant; q.total += montant; }
  function acheter(q, i) {
    const s = q.postes[i], n = quantite(q, i), prix = prixNiveaux(q, i, n);
    if (s.niv === 0 && !recetteOuverte(q, i)) return { ok: false, prix, verrou: true, apres: PRODUITS[i].apres }; // après le boss : pas avant son palier
    if (i > 0 && s.niv === 0 && q.postes[i - 1].niv === 0) return { ok: false, prix, verrou: true };
    if (q.billets < prix) return { ok: false, prix };
    q.billets -= prix; const deblocage = s.niv === 0; s.niv += n;
    if (deblocage) note(q, `${PRODUITS[i].nom} : nouveau produit`);
    return { ok: true, n, prix, deblocage };
  }
  function embaucher(q, i) {
    const s = q.postes[i], prix = prixStaff(q, i);
    if (s.staff || s.niv <= 0 || q.billets < prix) return { ok: false, prix };
    q.billets -= prix; s.staff = true; s.actif = true; q.stats.embauches++; note(q, `${PRODUITS[i].staffNom} rejoint l’équipe`);
    return { ok: true, prix };
  }
  function lancer(q, i) { const s = q.postes[i]; if (s.niv <= 0 || s.actif) return false; s.actif = true; s.prog = 0; q.stats.taps++; return true; }
  const combineOuverte = (q, a) => !a.apres || q.total >= PALIERS[a.apres - 1].total; // les combines « après le boss » : une fois le palier franchi
  function amelioration(q, id) {
    const a = AMELIORATIONS.find((x) => x.id === id), prix = a ? a.cout : 0;
    if (a && !combineOuverte(q, a)) return { ok: false, prix, verrou: true };
    if (!a || q.ameliorations[id] || q.billets < prix) return { ok: false, prix };
    q.billets -= prix; q.ameliorations[id] = true; note(q, `${a.nom} : ${a.desc}`);
    if (a.etoiles) q.etoiles = (q.etoiles || 0) + a.etoiles; if (a.prime) q.heures = (q.heures || 0) + a.prime; // après le boss : elle paie aussi la boulangerie (l'écran verse la prime et les étoiles)
    return { ok: true, a, prix };
  }

  // ─── les coups de pouce : un toutes les 2 à 5 minutes de jeu dans la Planque, jamais deux fois le même d'affilée ───
  const TYPES_EV = [
    { type: 'descente', poids: 2, ok: (q) => q.billets > 0 },
    { type: 'grosclient', poids: 2, ok: (q) => q.postes.some((s, i) => s.niv > 0 && PRODUITS[i].temps <= 15) },
    { type: 'soiree', poids: 2, ok: () => true },
    { type: 'scooter', poids: 1.5, ok: () => true },
  ];
  function lancerEvenement(q, rnd, type) {
    rnd = rnd || Math.random;
    if (!type) {
      const choix = TYPES_EV.filter((t) => t.ok(q) && t.type !== q.dernierEv);
      if (!choix.length) return null;
      let total = 0; const poids = choix.map((t) => { total += t.poids; return t.poids; });
      let r = rnd() * total; type = choix[choix.length - 1].type;
      for (let k = 0; k < choix.length; k++) { r -= poids[k]; if (r <= 0) { type = choix[k].type; break; } }
    }
    q.dernierEv = type;
    const E = EVENEMENTS;
    if (type === 'descente') q.ev = { type, taps: 0, n: effet(q, 'descenteN', E.descente.n), debut: q.now, fin: q.now + E.descente.duree * 1000, prime: arrondi(Math.max(20, rythme(q) * 240)), enjeu: Math.floor(q.billets * effet(q, 'descentePart', E.descente.part)) };
    else if (type === 'grosclient') {
      const idx = q.postes.map((s, i) => i).filter((i) => q.postes[i].niv > 0 && PRODUITS[i].temps <= 15);
      if (!idx.length) return lancerEvenement(q, rnd, 'soiree');
      const i = idx[Math.floor(rnd() * idx.length)], s = q.postes[i], n = Math.max(3, Math.min(s.staff ? 400 : 20, arrondi(E.grosclient.duree / PRODUITS[i].temps * (s.staff ? 0.7 : 0.3))));
      q.ev = { type, i, n, fait: 0, debut: q.now, fin: q.now + E.grosclient.duree * 1000, prime: arrondi(revenuBase(q, i) * n * E.grosclient.prime), livree: false };
    } else if (type === 'scooter') q.ev = { type, debut: q.now, fin: q.now + effet(q, 'scooterDuree', E.scooter.duree) * 1000, prime: arrondi(Math.max(10, rythme(q) * 120) * effet(q, 'scooterPrime', 1)) };
    else q.ev = { type: 'soiree', debut: q.now, fin: q.now + effet(q, 'soireeDuree', E.soiree.duree) * 1000 };
    return q.ev;
  }
  function planquer(q) { // la descente : une touche ; à la 12e, tout est planqué et la prime tombe
    const ev = q.ev; if (!ev || ev.type !== 'descente' || ev.fin <= q.now) return { ok: false };
    ev.taps++; if (ev.taps < ev.n) return { ok: true, fini: false, taps: ev.taps };
    gagner(q, ev.prime); q.stats.descentes++; note(q, `Descente déjouée : +${fmt(ev.prime)} €`); q.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function livrer(q) {
    const ev = q.ev; if (!ev || ev.type !== 'grosclient' || ev.fait < ev.n || ev.livree) return { ok: false };
    ev.livree = true; gagner(q, ev.prime); q.stats.grosClients++; note(q, `Gros client livré : +${fmt(ev.prime)} €`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function attraper(q) { // le livreur en scooter : on attrape le bonus avant qu'il reparte
    const ev = q.ev; if (!ev || ev.type !== 'scooter' || ev.fin <= q.now) return { ok: false };
    gagner(q, ev.prime); q.stats.scooters++; note(q, `Le livreur a laissé +${fmt(ev.prime)} €`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function finEvenement(q, ev) { // un coup de pouce qui finit sans toi : la descente ratée coûte sa part de billets
    if (ev.type === 'descente') { const saisi = Math.min(q.billets, ev.enjeu || 0); q.billets -= saisi; q.stats.descentesRatees++; q.stats.saisi += saisi; note(q, `Descente : la police embarque ${fmt(saisi)} €`); return { saisi }; }
    if (ev.type === 'soiree') q.stats.soirees++;
    return {};
  }

  // ─── les paliers franchis : ce qu'il reste à donner (chaque palier une seule fois, dans l'ordre) ───
  const paliersAtteints = (q) => PALIERS.filter((p) => q.total >= p.total);
  function paliersDus(q) { return PALIERS.filter((p) => q.total >= p.total && !q.paliers.includes(p.n)); }
  function marquerPalier(q, n) { // le palier n est réclamé : on note ce qu'il donne (l'interface le distribue dans la boulangerie)
    const p = PALIERS.find((x) => x.n === n); if (!p || q.paliers.includes(n) || q.total < p.total) return null;
    q.paliers.push(n);
    if (p.vetement && !q.vetements.includes(p.vetement)) q.vetements.push(p.vetement);
    if (p.deco && !q.decos.includes(p.deco)) q.decos.push(p.deco);
    if (p.etoiles) q.etoiles += p.etoiles; if (p.boost) q.boosts++; if (p.prime) q.heures = (q.heures || 0) + p.prime; // la prime : des heures du rythme de la boulangerie, versées par l'écran
    note(q, `Palier ${n} : ${p.titre}`);
    return p;
  }
  const ensembleComplet = (q) => VETEMENTS.every((v) => q.vetements.includes(v));
  function phrasePalier(p) { // ce que donne un palier, en une ligne
    const l = [];
    if (p.etoiles) l.push(`${p.etoiles} étoile${p.etoiles > 1 ? 's' : ''}`);
    if (p.boost) l.push(`boost ×${p.boost.mult} ${fmtDuree(p.boost.secs)}`);
    if (p.prime) l.push(`${p.prime} h de gains`);
    if (p.deco) l.push({ graffiti: 'graffiti sur le mur', neon: 'enseigne néon', scooter: 'scooter devant la porte', chien: 'le chien du quartier (et un compagnon)' }[p.deco]);
    if (p.vetement) l.push({ 'quartier-casquette': 'casquette du quartier', 'quartier-sweat': 'sweat à capuche', 'quartier-baskets': 'baskets', 'quartier-chaine': 'chaîne en or (l’ensemble complet)', 'quartier-neon-casquette': 'la casquette néon (le trophée)' }[p.vetement]);
    return l.join(' · ');
  }

  // ─── un pas de jeu dans la Planque (dt en secondes, nowMs sur l'horloge de confiance) ───
  const TROU = 10000, REPRISE = 90; // un trou de plus de 10 s entre deux pas (téléphone verrouillé, autre appli) : c'était une absence
  // une sortie de 10 min au plus (l'appli quittée sans le vouloir, l'écran refermé un instant) : le coup de pouce en cours, et le boost de
  // l'événement s'il y en a un, sont EN PAUSE : leurs échéances avancent de la durée de la sortie, on les retrouve tels quels au retour
  const PAUSE_EV = 600e3; // la même que celle de la boutique (G.PAUSE_EV, 600 s, src/game.js), en millisecondes : ce fichier ne dépend pas de game.js
  function pauseCoup(q, ms) { if (!(ms > 0)) return; for (const o of [q.ev, q.boost]) if (o && typeof o === 'object') for (const k of ['debut', 'fin']) if (Number.isFinite(o[k])) o[k] += ms; }
  function tick(q, dt, nowMs, rnd) {
    rnd = rnd || Math.random;
    if (q.now && nowMs - q.now > TROU) { // un trou : une courte sortie (PAUSE_EV) met le coup de pouce en pause ; plus longue, il s'efface sans pénalité (pas de descente ratée sans toi), et rien ne surgit au retour
      const ecart = nowMs - q.now;
      if (ecart <= PAUSE_EV) pauseCoup(q, ecart); else { q.ev = null; q.evTimer = Math.max(q.evTimer, REPRISE + rnd() * 60); }
    }
    q.now = nowMs;
    const out = { ventes: [], nouvelEv: null, finEv: null, paliers: [] };
    q.postes.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(q, i); s.prog += dt; if (s.prog < T) return;
      let n = Math.floor(s.prog / T);
      if (!s.staff) { n = 1; s.prog = 0; s.actif = false; } else s.prog -= n * T;
      const m = revenuFournee(q, i) * n; gagner(q, m); q.stats.ventes += n; q.stats.vendus[i] += n;
      if (q.ev && q.ev.type === 'grosclient' && q.ev.i === i) q.ev.fait = Math.min(q.ev.n, q.ev.fait + n);
      out.ventes.push({ i, montant: m, n });
    });
    if (q.ev && q.ev.fin <= nowMs && !(q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n)) { out.finEv = q.ev; out.fin = finEvenement(q, q.ev); q.ev = null; }
    if (!q.ev) { q.evTimer -= dt; if (q.evTimer <= 0) { q.evTimer = 120 + rnd() * 180; out.nouvelEv = lancerEvenement(q, rnd); } }
    out.paliers = paliersDus(q);
    return out;
  }
  // ─── l'absence : les apprentis ont bossé (8 h au plus, 12 h avec le matelas), les fournées en cours se terminent ; pas de coup de pouce sans toi ───
  function absence(q, nowMs) {
    // courte (PAUSE_EV) : le coup de pouce et le boost en pause, retrouvés tels quels ; plus longue : effacés sans pénalité, et au moins
    // 1 min 30 avant le prochain coup de pouce (REPRISE). Jamais de gain gratuit : l'absence se calcule sans eux (ni le ×2 d'une soirée).
    const ecart = q.now ? nowMs - q.now : Infinity, court = ecart >= 0 && ecart <= PAUSE_EV, garde = { ev: q.ev, boost: q.boost };
    q.ev = null; q.boost = null; q.now = nowMs;
    const secs = Math.min(heuresAbsence(q) * 3600, Math.max(0, (nowMs - q.lastSeen) / 1000)), part = partAbsence(q);
    let total = 0; const detail = [];
    q.postes.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(q, i);
      if (s.staff) { const n = Math.floor((s.prog + secs) / T); s.prog = (s.prog + secs) % T; if (n > 0) { const m = revenuBase(q, i) * n * part; total += m; detail.push({ i, n, m }); q.stats.ventes += n; q.stats.vendus[i] += n; } }
      else if (s.prog + secs >= T) { const m = revenuBase(q, i) * 1.5 * part; total += m; detail.push({ i, n: 1, m }); s.prog = 0; s.actif = false; q.stats.ventes++; q.stats.vendus[i]++; }
      else s.prog += secs;
    });
    if (total > 0) gagner(q, total);
    const rj = A.sortirRecette(q, nowMs); // la recette du jour : une fournée au four sort quand même (payée par sortirRecette ; rien ne se relance seul)
    if (rj) { total += rj.gain; detail.push({ i: -1, nom: rj.r ? rj.r.nom : '', n: 1, m: rj.gain }); }
    q.boost = garde.boost;
    if (court) { q.ev = garde.ev; pauseCoup(q, ecart); } else { q.evTimer = Math.max(q.evTimer || 0, REPRISE); }
    q.lastSeen = nowMs;
    return { secs, total, detail };
  }

  // ─── la simulation du rythme (pour les tests et le réglage des paliers) : des sessions par jour, une politique gloutonne ───
  const PROFILS = { // comme test/longevite.js : les heures de Paris des sessions et leur durée en minutes
    assidu: { sessions: [[7.5, 15], [12.25, 15], [18, 20], [22, 30]] },
    quotidien: { sessions: [[7.75, 8], [12.5, 8], [21, 20]] },
    occasionnel: { sessions: [[8, 5], [20.5, 12]] },
    marathon: { sessions: [[0, 714], [12, 714]] }, // 23 h 48 sur 24 (deux sessions, l'une à midi) : l'enveloppe du serveur
    tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]] }, // 8 h par jour : le 12e au 3e jour, comme les plus mordus (puis les paliers bonus)
  };
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function decider(q) { // acheter : apprenti, déblocage, amélioration, puis le meilleur rapport gain / prix
    let fait = false;
    for (let i = 0; i < PRODUITS.length; i++) { const s = q.postes[i]; if (s.niv > 0 && !s.staff && q.billets >= prixStaff(q, i)) { embaucher(q, i); fait = true; } }
    for (let i = 1; i < PRODUITS.length; i++) { const s = q.postes[i]; if (s.niv === 0 && q.postes[i - 1].niv > 0 && recetteOuverte(q, i) && q.billets >= PRODUITS[i].debloquer) { acheter(q, i); fait = true; break; } }
    for (const a of AMELIORATIONS) if (!q.ameliorations[a.id] && combineOuverte(q, a) && q.billets >= a.cout * 1.2) { amelioration(q, a.id); fait = true; }
    const next = q.postes.findIndex((s, i) => s.niv === 0 && recetteOuverte(q, i)), taux = tauxParSeconde(q); // une recette encore fermée (avant son palier) : on n'économise pas pour elle
    if (next > 0 && q.billets < PRODUITS[next].debloquer && q.billets + taux * 600 >= PRODUITS[next].debloquer) return fait; // on économise pour le prochain produit
    const vise = AMELIORATIONS.find((a) => a.apres && !q.ameliorations[a.id] && combineOuverte(q, a)); // après le boss : on met de côté pour la combine suivante (huit heures de ventes au plus)
    if (vise && q.billets < vise.cout * 1.2 && vise.cout <= taux * 8 * 3600) return fait;
    for (let k = 0; k < 3; k++) {
      let best = -1, bestR = 0, bestN = 1;
      for (let i = 0; i < PRODUITS.length; i++) {
        const s = q.postes[i]; if (s.niv === 0) continue; const n = Math.min(10, maxAchetables(q, i)); if (n < 1) continue;
        const prix = prixNiveaux(q, i, n), gain = (PRODUITS[i].rev * (s.niv + n) * palierMult(s.niv + n) - PRODUITS[i].rev * s.niv * palierMult(s.niv)) * ameliorationMult(q, i) / PRODUITS[i].temps * (s.staff ? 1 : 0.3);
        const r = gain / prix; if (r > bestR) { bestR = r; best = i; bestN = n; }
      }
      if (best < 0) break;
      q.mode = q.billets > 30 * prixNiveaux(q, best, bestN) ? 'max' : bestN;
      if (acheter(q, best).ok) fait = true;
    }
    return fait;
  }
  function simuler(profil, jours, opts) { // rend { total, parJour: [{ j, total, billets, taux }], paliersJour: { n: jour } } ; opts : { graine, debut, offertes, activites, recette } (recette : false, sans la recette du jour ; true, jouée même par un profil qui ne la joue pas d'office)
    opts = opts || {}; const prof = PROFILS[profil] || PROFILS.assidu, rnd = mulberry32(opts.graine || 7), st = {}, t0 = opts.debut || DEBUT;
    const jeu = opts.activites === false ? null : A.politique(profil, opts.recette), rndA = mulberry32((opts.graine || 7) + 101); // les activités, jouées comme ce profil (leur propre hasard : les coups de pouce ne changent pas)
    const q = etat(st, t0), parJour = [], paliersJour = {}, trace = []; q.lastSeen = t0;
    const H = 3600e3, nJ = jours || 14;
    const minuit0 = t0 - (paris(t0).getUTCHours() * 3600e3 + paris(t0).getUTCMinutes() * 60e3); // minuit, heure de Paris, du premier jour
    for (let j = 0; j < nJ; j++) {
      const jourDebut = minuit0 + j * JOUR;
      for (const [h, minutes] of prof.sessions) {
        const debut = jourDebut + h * H; // les sessions sont des heures de Paris ; le premier jour, l'événement ouvre à midi : celles du matin sont perdues
        if (debut < t0 || debut >= FIN) continue;
        absence(q, debut);
        for (let s = 0; s < minutes * 60; s++) {
          const now = debut + s * 1000; if (now >= FIN) break;
          let lances = 0; q.postes.forEach((x, i) => { if (x.niv > 0 && !x.staff && !x.actif && lances < 2) { lancer(q, i); lances++; } });
          const out = tick(q, 1, now, rnd);
          if (q.ev) {
            if (q.ev.type === 'descente') { planquer(q); if (rnd() < 0.7) planquer(q); }
            else if (q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n) livrer(q);
            else if (q.ev.type === 'scooter' && rnd() < 0.5) attraper(q);
          }
          for (const p of out.paliers) { marquerPalier(q, p.n); paliersJour[p.n] = j + 1; if (opts.offertes && p.n === PALIERS_BOSS) for (const a of AMELIORATIONS) if (a.apres) q.ameliorations[a.id] = true; } // offertes : le pire cas de l'enveloppe (toutes les combines dès le 12e, sans les payer)
          if (jeu) A.sim.recette(q, now, jeu); // la recette du jour, chaque seconde (avant les achats : elle passe d'abord)
          if (s % 3 === 0) decider(q);
          if (jeu && s % 20 === 0) A.sim.pas(q, now, jeu, rndA);
          if (s % 60 === 0) trace.push({ t: (now - t0) / JOUR, total: q.total });
        }
        q.lastSeen = debut + minutes * 60e3; if (jeu) A.sim.fin(q, Math.min(q.lastSeen, FIN - 1), jeu, rndA); trace.push({ t: (q.lastSeen - t0) / JOUR, total: q.total });
      }
      parJour.push({ j: j + 1, total: q.total, billets: q.billets, taux: tauxParSeconde(q), niv: q.postes.map((s) => s.niv), staff: q.postes.filter((s) => s.staff).length, remise: remise(q), ameliorations: { ...q.ameliorations } });
    }
    return { q, total: q.total, parJour, paliersJour, trace };
  }

  // ─── formats ───
  const SUFF = ['', 'k', 'M', 'Md', 'Bn', 'Bd', 'Tn', 'Td'];
  function fmt(n) {
    if (!Number.isFinite(n)) return '∞';
    if (n < 0) return '−' + fmt(-n);
    if (n < 1000) return (n < 10 && n !== Math.floor(n) ? n.toFixed(1) : Math.floor(n).toString()).replace('.', ',');
    let k = 0, v = n; while (v >= 1000 && k < SUFF.length - 1) { v /= 1000; k++; }
    if (v >= 1000) return n.toExponential(1).replace('.', ',').replace('e+', ' e');
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace('.0', '').replace('.', ',') + ' ' + SUFF[k];
  }
  const fmtEur = (n) => fmt(n) + ' €';
  function fmtDuree(s) { if (s < 59.5) return Math.round(s) + ' s'; const mn = Math.round(s / 60); if (mn < 60) return mn + ' min'; const h = Math.floor(mn / 60), m = mn % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  const fmtChrono = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
  function fmtReste(ms) { // « 13 j 4 h », « 4 h 12 », « 12 min »
    const mn = Math.max(0, Math.round(ms / 60e3)), j = Math.floor(mn / 1440), h = Math.floor((mn % 1440) / 60), m = mn % 60;
    if (j > 0) return `${j} j ${h} h`; if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`; return `${m} min`;
  }

  // ─── la fiche de l'événement (pour l'écran, src/evenement.js, qui a ses valeurs par défaut) : ici, l'habillage du quartier de ses activités ───
  // activites : voir src/activites.js (réglages des gains, mini-jeux, couleurs des toiles, contrats, opérations) ; tout ce qui manque prend
  // la valeur par défaut du moteur commun.
  const FICHE = {
    id: 'quartier', nom: 'Le Quartier', lieu: 'la Planque', cle: 'quartier', adulte: true,
    activites: {
      jeux: {
        guet: { nom: 'Le guet', desc: 'Siffle quand la patrouille passe sous le lampadaire.', regles: ['La patrouille longe la rue : touche quand elle passe sous le lampadaire.', 'Pile dans la lumière : coup de sifflet parfait, et le combo grimpe.', 'Trop tôt ou trop tard, le combo retombe. Et ça accélère !'], consigne: 'Siffle quand elle est sous le lampadaire !' },
        compte: { nom: 'Le compte', desc: 'Compte la liasse d’un coup d’œil.', regles: ['Des billets s’étalent sur la table, une seconde à peine.', 'Combien y en avait-il ? Touche le bon nombre.', 'Vite et juste : la série rapporte plus. Quarante secondes.'], consigne: 'Combien de billets ?', objets: 'billets' },
        tournee: { nom: 'La tournée', desc: 'Trace la tournée du livreur, porte après porte.', regles: ['Six portes numérotées : relie-les au doigt, dans l’ordre.', 'Tu peux lever le doigt et reprendre où tu t’es arrêté.', 'Trois tournées de douze secondes : plus tu es rapide, plus ça paie.'], consigne: 'Relie les portes dans l’ordre !' },
      },
      decor: { motif: 'quartier', fond: '#2E2B3A', sol: '#3F3A50', accent: '#FFC84A', accent2: '#5FD3A4', clair: '#C7B8FF', texte: '#FFF7EC' },
      contrats: { textes: {
        descentes: (n) => `Déjoue ${n} descente${n > 1 ? 's' : ''} de police`, grosClients: (n) => `Livre ${n} gros client${n > 1 ? 's' : ''}`,
        scooters: (n) => `Attrape ${n} fois le bonus du livreur`, soirees: (n) => `Tiens ${n} soirée${n > 1 ? 's' : ''} jusqu’au bout`,
        vente: (n, p) => `Vends ${n} ${p ? p.pl : 'produits'}`, mini: (n) => `Réussis ${n} mini-jeu${n > 1 ? 'x' : ''} (la moitié des points au moins)`,
        operation: (n) => `Réussis ${n} opération${n > 1 ? 's' : ''} sans contrôle` } },
      operations: [
        { id: 'court', nom: 'Le petit coup du square', desc: 'Un aller-retour au banc du square. Presque sans risque.' },
        { id: 'moyen', nom: 'La livraison du bâtiment C', desc: 'Un quart d’heure dans les escaliers : l’ascenseur est en panne.' },
        { id: 'long', nom: 'Le gros coup du PMU', desc: 'Une heure dans l’arrière-salle : le meilleur gain, le plus de risque.' },
      ],
      textes: { saisie: 'Contrôle de police', saisieTxt: (m) => `Contrôle de police : ${m} saisis.`, operation: 'Opération', enCours: 'L’équipe est sur le coup', recette: 'La recette du jour', cuisine: 'La cuisine de la Planque' },
      // la recette du jour (src/activites.js, RECETTE_JOUR) : la cuisine de la Planque, une recette par jour, de 20 à 90 s ; à la 500e fournée, la toque en or
      recettes: [
        { id: 'the-menthe', nom: 'Le thé à la menthe du hall', desc: 'Très sucré, versé de très haut, servi sur les marches du bâtiment B.', temps: 20, icone: 'the-menthe' },
        { id: 'chouquettes-pigeons', nom: 'Les chouquettes des pigeons', desc: 'Les pigeons du square en ont goûté une. Ils ne sont jamais repartis.', temps: 25, icone: 'chouquettes-pigeons' },
        { id: 'frites-camion', nom: 'Les frites du camion', desc: 'Double cuisson, une barquette qui tient chaud aux mains toute la nuit.', temps: 30, icone: 'frites-camion' },
        { id: 'crepe-pmu', nom: 'La crêpe Nutella du PMU', desc: 'Tonton Serge la retourne sans quitter le tiercé des yeux.', temps: 40, icone: 'crepe-pmu' },
        { id: 'kebab-samourai', nom: 'Le kebab sauce samouraï', desc: 'Salade, tomate, oignons, et la sauce qui fait pleurer les durs.', temps: 50, icone: 'kebab-samourai' },
        { id: 'tacos-geant', nom: 'Le tacos trois viandes', desc: 'Plié en quatre, il pèse autant qu’un pack d’eau.', temps: 70, icone: 'tacos-geant' },
        { id: 'space-cake', nom: 'Le space cake de Mémé', desc: 'La recette secrète de Mémé Jacqueline. Surtout, pas pour le chien.', temps: 90, icone: 'space-cake' },
      ],
      recetteDeco: 'toque-or', recetteDecoTxt: 'la toque en or du chef de la Planque, accrochée au mur de la boutique',
    },
  };
  const A = ACT.equiper({ id: 'quartier', rythme, gagner, note, dayKey, fmt: fmtEur, arrondi, fenetre, PRODUITS, boostMult, remise, debut: DEBUT }, FICHE.activites); // les activités (src/activites.js)

  // ─── les récompenses version 2 (src/activites.js, RECOMPENSES) : ce qu'une combine paie à la boulangerie ; la revue d'une vieille sauvegarde ───
  const R2 = ACT.RECOMPENSES;
  const phraseCombine = (a) => R2.phraseLot(R2.lotCombine(a)); // « + 16 h de gains à la boulangerie, +2 ★ » ('' : une combine d'avant le boss)
  const revueRecompenses = (q) => R2.revue(q, PALIERS, AMELIORATIONS, ANCIENS); // une fois (q.recompensesV2) : la différence avec les anciennes

  return { FICHE, ...A.api, ANCIENS, phraseCombine, revueRecompenses, lotCombine: R2.lotCombine, phraseLot: R2.phraseLot, DEBUT, FIN, CLASSEMENT_JUSQUA, JOUR, GRACE, fenetreSure, envoiBillets, ABSENCE_PART, PRESENCE, REPUTATION, reputationMult, fenetre, decalageParis, paris, parisMs, dayKey, PRODUITS, PALIERS_POSTE, AMELIORATIONS, ABSENCE_MAX_H, EVENEMENTS, PALIERS, PALIERS_BOSS, TROPHEE, VETEMENTS, VETEMENTS_OR, DECOS,
    PAUSE_EV, pauseCoup, neuf, etat, palierMult, prochainPalier, gainPalier, exposantPalier, paliersPoste, PALIERS_EXPOSANTS, ameliorationMult, boostMult, temps, revenuBase, revenu, revenuFournee, coutNiveau, coutNiveaux, maxNiveaux, remise, maxAchetables, recetteOuverte, quantite, prixNiveaux, prixStaff, tauxBase, tauxParSeconde, rythme, arrondi, heuresAbsence, partAbsence, effet, combineOuverte,
    gagner, acheter, embaucher, lancer, amelioration, lancerEvenement, planquer, livrer, attraper, tick, absence, paliersAtteints, paliersDus, marquerPalier, ensembleComplet, phrasePalier,
    PROFILS, simuler, decider, fmt, fmtEur, fmtDuree, fmtChrono, fmtReste };
});
