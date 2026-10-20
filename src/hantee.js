/* LE FOURNIL — l'événement d'Halloween « La Maison hantée » : les règles pures du Manoir, la seconde boutique à part de l'automne (du
   mardi 27 octobre 2026 à midi au lundi 2 novembre 2026 à 20 h, heure de Paris), juste après « Le Quartier » (src/quartier.js, qui
   finit le 27 à midi). Pour tous les âges : mignon-effrayant, des fantômes gourmands et des citrouilles qui grimacent, rien d'autre.
   Tout le monde part de zéro, avec sa propre monnaie (les bonbons), ses six friandises (et deux recettes de plus après le maître), ses postes, ses monstres « apprentis », ses
   améliorations (les Sortilèges), ses coups de pouce ; les gains d'absence sont plafonnés comme ceux de la boulangerie (sur l'horloge de
   confiance : « maintenant » est toujours donné par l'appelant, jamais lu ici). Douze paliers de bonbons gagnés, les mêmes pour tous,
   donnent des récompenses POUR LA BOULANGERIE (étoiles, boosts en réserve, décos d'Halloween, la tenue d'Halloween, le chat noir) : voir
   PALIERS ; huit paliers bonus « après le maître » (13 à 20), sept Sortilèges de plus (dont le Marché des sorcières : les niveaux à
   moitié prix) et deux nouvelles recettes (les gâteaux du cimetière au 13e, les œufs de dragon au 16e) attendent ceux qui ont franchi le 12e tôt. À la fin, le Manoir ferme ; tout le reste reste à vie. Aucune dépendance au DOM ni à game.js : tourne aussi dans Node
   (test/fournil-hantee.test.js, qui simule le rythme).

   La même forme d'API que src/quartier.js (QUARTIER), mot pour mot : DEBUT, FIN, GRACE, CLASSEMENT_JUSQUA, fenetre, fenetreSure,
   envoiBillets (alias d'envoiBonbons), PRODUITS, PALIERS_POSTE, AMELIORATIONS, EVENEMENTS, PALIERS, VETEMENTS, VETEMENTS_OR, DECOS, neuf,
   etat, tick, absence, acheter, embaucher, lancer, amelioration, lancerEvenement, planquer, livrer, attraper, paliersDus, marquerPalier,
   simuler, fmt, fmtEur… : un moteur d'écran écrit pour le Quartier sert la Maison hantée en changeant d'objet de règles. Différences :
     · l'état vit dans st.hantee (pas st.quartier), et n'a pas de porte « 18 ans et + » (q.majeur est toujours vrai) ;
     · les coups de pouce gardent les CLÉS DE MÉCANIQUE du Quartier ('descente', 'grosclient', 'soiree', 'scooter') et les mêmes
       actions (planquer, livrer, attraper) ; leur habillage d'Halloween est dans FICHE.evenements (une nuée de chauves-souris à
       chasser, un cortège d'enfants déguisés, la pleine lune, le balai de la sorcière) ;
     · un palier peut donner le chat noir (p.chat === 'noir' : GAME.donnerChatNoir) ;
     · fmtEur écrit des bonbons (« 1,2 k bonbons ») ; fmt seul, le nombre.

   HT.FICHE — la fiche de l'événement, pour l'écran (src/evenement.js paramétré) et le classement :
     { id: 'hantee'               l'identifiant (st.hantee, la période du classement, p_evt du serveur),
       nom: 'La Maison hantée', lieu: 'le Manoir' (la boutique à part, comme « la Planque »), adulte: false (pas de porte 18+),
       cle: 'hantee'              la clé de l'état dans la sauvegarde (st[cle]),
       classement: { periode: 'hantee', onglet: 'Halloween', evt: 'hantee' }  (onglet du classement ; p_evt envoyé au serveur),
       devise: { nom: 'bonbons', un: 'bonbon', icone: 'bonbons' (la clé de l'icône, ICONS.HANTEE.bonbons), svg: un bonbon en SVG
                 (repli tant que l'icône n'existe pas) },
       couleurs: { nuit, nuit2, citrouille, violet, slime, lune, texte, doux } (le fond du Manoir, l'accent, le second accent…),
       dates: { debut, fin, texteFin: 'lundi 2 novembre à 20 h', texteDebut: 'mardi 27 octobre à midi' },
       produits: PRODUITS (id, nom, pl, desc, staffNom, staffDesc, poste…), paliers: PALIERS, ameliorations: AMELIORATIONS,
       evenements: { descente | grosclient | soiree | scooter: { nom, annonce, action, bouton, fin } } (l'habillage des coups de pouce),
       vetements: { id: { nom, piece, forme } }, decos: { id: texte }, chat: 'noir',
       textes: { titre, sousTitre, annonceTitre, annonce, ouvrir, fermer, absence(dur, montant), bilanTitre, bilan, palier12,
                 paliersNote, ameliorations: 'Sortilèges', equipe: 'Les monstres', manuel: 'Touche !', ferme } }
   Les vêtements (src/game.js, GARDEROBE) : collection 'hantee' (paliers 3, 6, 9, 12) et 'hantee-or' (le podium final), formes pour
   persos.js : 'chapeau' (chapeau pointu de sorcière), 'cape', 'bottes', 'lanterne' (une petite citrouille-lanterne à la main).
   FICHE.activites : l'habillage d'Halloween des activités (src/activites.js, le moteur commun à tous les événements : les mini-jeux « Le
   guet », « Le compte », « La tournée », les contrats de la nuit, les opérations) ; leur API est exportée telle quelle, comme au Quartier.
   Lot 6 (19 octobre), le Manoir « qui choque » : des choses à FAIRE dans la boutique hantée (voir « des choses à FAIRE », plus bas) : le ×6
   de présence s'endort sans toucher (toucher, eveil, presence), les clients-monstres (servir), les fournées parfaites (parfait), les
   apparitions (attraper(q, id)), les commandes de la nuit (livrerCommande) ; FICHE.manoir, leurs mots ; SORTES, les neuf clients.
   Lot 6, le bestiaire (20 octobre) : les clients-monstres servis remplissent un bestiaire (BESTIAIRE, bestiaire, verserBestiaire, plus bas) ;
   dix servis d'une sorte la complètent (des étoiles pour la boulangerie), cinq sortes : un décor pour la boutique, les neuf : la chauve-souris. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./activites.js'));
  else root.HANTEE = factory(root.ACTIVITES);
})(typeof self !== 'undefined' ? self : this, function (ACT) {
  'use strict';

  // ─── l'heure de Paris (la même règle que game.js, classement.js et quartier.js) ───
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

  // ─── la fenêtre : du mardi 27 octobre 2026 à 12 h au lundi 2 novembre 2026 à 20 h, heure de Paris (heure d'hiver : 11 h et 19 h UTC) ───
  const DEBUT = parisMs(2026, 10, 27, 12), FIN = parisMs(2026, 11, 2, 20), JOUR = 864e5, JOURS = 7;
  const CLASSEMENT_JUSQUA = FIN + 14 * JOUR; // l'onglet « Halloween » du classement reste visible deux semaines après la fin (le podium final)
  function fenetre(now) {
    const t = Number.isFinite(now) ? now : 0;
    const avant = t < DEBUT, fini = t >= FIN, ouvert = !avant && !fini;
    const jour = avant ? 0 : fini ? JOURS : Math.min(JOURS, Math.round((Date.parse(dayKey(t) + 'T12:00:00Z') - Date.parse(dayKey(DEBUT) + 'T12:00:00Z')) / JOUR) + 1); // le jour de Paris : du 27 (1) au 2 novembre (7)
    return { avant, ouvert, fini, reste: ouvert ? FIN - t : 0, dans: avant ? DEBUT - t : 0, jour, jours: JOURS, classement: t >= DEBUT && t < CLASSEMENT_JUSQUA };
  }
  // l'ouverture se lit aussi sur l'HEURE SÛRE (HORLOGE.etat().sure) : une horloge avancée hors ligne n'ouvre pas le Manoir avant mardi midi
  // (sans heure sûre connue, l'artefact Claude : le « maintenant » du jeu seul). La fin se lit toujours sur le « maintenant » du jeu.
  function fenetreSure(now, sure) {
    const f = fenetre(now);
    return f.ouvert && Number.isFinite(sure) && sure > 0 && sure < DEBUT ? fenetre(sure) : f;
  }
  const GRACE = 3600e3; // le serveur compte encore les bonbons une heure après la fin (ceux d'avant la fin, plafonnés à l'enveloppe de la fin)
  const envoiBonbons = (now) => Number.isFinite(now) && now >= DEBUT && now < FIN + GRACE;

  // ─── les six friandises du Manoir, dans l'ordre où on les débloque ; leurs monstres (les « apprentis ») ───
  // Les chiffres sont ceux du Quartier, resserrés pour six jours et demi (croissance des prix plus douce, déblocages plus proches) :
  // réglés sur la simulation (test/fournil-hantee.test.js). Après le maître, deux recettes de plus (apres : le palier qui les ouvre, comme
  // les Sortilèges), comme au Quartier : elles repartent du bas, leurs premiers niveaux tombent vite. v6.3 (17 octobre) : de vraies
  // recettes, comme au Quartier (rev 1 000 et 8 000 avant : des gains tout petits devant ceux des citrouilles) ; ×18 pour les gâteaux,
  // ×87,5 pour les œufs : pour le très actif, un niveau se rembourse en à peu près autant de temps qu'un niveau de citrouilles (×1,7 à
  // ×2,9) et, montées, elles font ~30 % de ses gains à la fin (gâteaux ~13 %, œufs ~16 %). Les niveaux achetés restent. L'enveloppe du
  // serveur (fournil_evts, SQL v6.3) a été élargie d'autant : le marathon simulé reste ×2 dessous.
  // v6.4 (18 octobre), comme au Quartier : encore ×4 pour les gâteaux (18 000 → 72 000), ×1,5 pour les œufs (700 000 → 1 050 000) :
  // sans leur Sortilège ×3, un niveau se rembourse à peu près comme un niveau de citrouilles (le prochain niveau ÷ ce qu'un niveau de
  // plus rapporte par seconde) ; avec, c'est la meilleure affaire du moment. Montées, ~50-55 % des gains du très actif à la fin.
  // L'enveloppe du serveur (fournil_evts, SQL v6.4) a été élargie d'autant.
  const PRODUITS = [
    { id: 'acidule', nom: 'Bonbons acidulés', pl: 'sachets de bonbons acidulés', cout: 4, debloquer: 0, rev: 1, temps: 1.5, croiss: 1.07, staff: 1500, staffNom: 'Hubert le fantôme', staffDesc: 'Il passe à travers les murs pour livrer plus vite. Il dit « Bouh » aux clients, poliment.', poste: 'Le grenier qui grince', desc: 'Ça pique la langue et ça fait faire des grimaces.' },
    { id: 'pomme', nom: 'Pommes d’amour', pl: 'pommes d’amour', cout: 60, debloquer: 120, rev: 20, temps: 3, croiss: 1.14, staff: 22500, staffNom: 'Ramsès la momie', staffDesc: 'Emballe chaque pomme comme elle s’emballe elle-même : avec beaucoup de bandelettes.', poste: 'La crypte du sous-sol', desc: 'Rouges, brillantes, et elles collent aux dents.' },
    { id: 'cookie', nom: 'Cookies fantômes', pl: 'cookies fantômes', cout: 720, debloquer: 1440, rev: 150, temps: 6, croiss: 1.13, staff: 150000, staffNom: 'Osvaldo le squelette', staffDesc: 'Pétrit avec ses doigts tout fins. Il n’a pas d’estomac, alors il ne goûte jamais.', poste: 'La cuisine aux casseroles volantes', desc: 'Ils disparaissent dès qu’on a le dos tourné.' },
    { id: 'toile', nom: 'Toiles d’araignée en sucre', pl: 'toiles d’araignée en sucre', cout: 8640, debloquer: 17280, rev: 1200, temps: 12, croiss: 1.12, staff: 750000, staffNom: 'Comte Vladimir', staffDesc: 'Un vampire très chic qui ne mord que dans la barbe à papa. Il travaille de nuit, forcément.', poste: 'La tour de l’horloge', desc: 'Filées par une araignée très gourmande. Elle a dit oui.' },
    { id: 'potion', nom: 'Potions fumantes', pl: 'potions fumantes', cout: 1e5, debloquer: 2e8, rev: 10000, temps: 24, croiss: 1.11, staff: 4e8, staffNom: 'Berthe la sorcière', staffDesc: 'Touille le chaudron en chantant faux. Les potions adorent ça.', poste: 'Le chaudron du salon', desc: 'Goût fraise-citrouille. La fumée verte est offerte.' },
    { id: 'citrouille', nom: 'Citrouilles sculptées', pl: 'citrouilles sculptées', cout: 1.2e6, debloquer: 1e10, rev: 9e4, temps: 96, croiss: 1.1, staff: 3e10, staffNom: 'Jack la Lanterne', staffDesc: 'Une citrouille qui sculpte des citrouilles. Elle a toujours le sourire, il est gravé.', poste: 'Le potager au clair de lune', desc: 'Chacune a sa grimace. Aucune ne se ressemble.' },
    { id: 'cimetiere', nom: 'Gâteaux du cimetière', pl: 'gâteaux du cimetière', apres: 13, cout: 1e12, debloquer: 2e13, rev: 72000, temps: 120, croiss: 1.02, staff: 5e13, staffNom: 'Gaston le loup-garou', staffDesc: 'Il ne se transforme qu’à l’heure du goûter. Il remue la pâte avec la queue, très proprement.', poste: 'Le petit cimetière du jardin', desc: 'Des vers en gélatine sortent de la terre en chocolat.' },
    { id: 'dragon', nom: 'Œufs de dragon en chocolat', pl: 'œufs de dragon en chocolat', apres: 16, cout: 1e13, debloquer: 2e14, rev: 1050000, temps: 240, croiss: 1.025, staff: 5e14, staffNom: 'Bérénice la dragonne', staffDesc: 'Une toute petite dragonne qui couve les œufs pour les garder tièdes. Elle éternue des étincelles.', poste: 'Le donjon de la tour nord', desc: 'Ils sont tièdes et ils bougent un peu. C’est normal.' },
  ];
  // les paliers des postes : au palier franchi le plus haut, les gains sont multipliés par 2^exposant. Les anciens (25, 50, 100, 200…
  // 5000) gardent leur exposant entier (le même multiplicateur cumulé qu'avant : ×2 à chacun) ; v6.2, ceux qu'on a intercalés (75, 125,
  // 150, 175, 250…, les mêmes que la boulangerie) ont un exposant fractionnaire : un palier bien plus souvent pour le joueur constant, un
  // petit ×1,41 ou ×1,19 à chaque fois, sur les huit recettes. Ils montent les gains entre deux anciens paliers : l'enveloppe du serveur
  // a été élargie d'autant (supabase/fournil-classement.sql, « v6.2 : paliers intercalés » ; le marathon simulé reste ×2 dessous).
  const PALIERS_EXPOSANTS = [[25, 1], [50, 2], [75, 2.5], [100, 3], [125, 3.25], [150, 3.5], [175, 3.75], [200, 4], [250, 4.5], [300, 5], [350, 5.5], [400, 6], [450, 6.5],
    [500, 7], [625, 7.5], [750, 8], [875, 8.5], [1000, 9], [1250, 9.5], [1500, 10], [1750, 10.5], [2000, 11], [2500, 11.5], [3000, 12], [4000, 12.5], [5000, 13]];
  const PALIERS_POSTE = PALIERS_EXPOSANTS.map((x) => x[0]);
  const AMELIORATIONS = [ // les Sortilèges
    { id: 'petillant', nom: 'Sucre qui pétille', cout: 50000, cible: ['acidule'], mult: 3, desc: 'Bonbons acidulés ×3' },
    { id: 'caramel', nom: 'Caramel enchanté', cout: 600000, cible: ['pomme'], mult: 3, desc: 'Pommes d’amour ×3' },
    { id: 'balai', nom: 'Balai à réaction', cout: 3e6, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'four', nom: 'Four hanté', cout: 8e6, cible: ['cookie'], mult: 3, desc: 'Cookies fantômes ×3' },
    { id: 'araignee', nom: 'Araignée pâtissière', cout: 6e7, cible: ['toile'], mult: 3, desc: 'Toiles en sucre ×3' },
    { id: 'lune', nom: 'Pleine lune de sucre', cout: 1.5e8, cible: ['acidule', 'pomme'], mult: 5, desc: 'Acidulés et pommes d’amour ×5' },
    { id: 'grimoire', nom: 'Grimoire des recettes', cout: 4e8, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'chaudron', nom: 'Chaudron géant', cout: 3e9, cible: ['potion'], mult: 3, desc: 'Potions ×3' },
    { id: 'graines', nom: 'Graines de citrouille magiques', cout: 6e10, cible: ['citrouille'], mult: 3, desc: 'Citrouilles ×3' },
    { id: 'bal', nom: 'Le grand bal des monstres', cout: 1e12, cible: null, mult: 3, desc: 'Tout ×3' },
    // après le maître du Manoir (palier 12 franchi) : quatre Sortilèges chers qui ne multiplient pas les ventes (l'enveloppe du serveur,
    // fournil_evts() de la v5 : le marathon simulé doit rester ×2 dessous) ; ils adoucissent les coups de pouce et l'absence (effet) ; et,
    // depuis la version 2 des récompenses, chacun PAIE la boulangerie à l'achat : prime (heures de son rythme) et étoiles (ACT.RECOMPENSES).
    // Le Marché des sorcières (effet remise) : tous les niveaux de recettes à moitié prix (pas les déblocages) ; deux Sortilèges ×3 pour les
    // recettes d'après le maître, ouverts avec elles (13e et 16e) : les seuls d'après le maître qui multiplient des ventes.
    { id: 'marche', nom: 'Le Marché des sorcières', cout: 6e14, apres: 12, cible: [], mult: 1, effet: { remise: 0.5 }, prime: 4, etoiles: 1, desc: 'Tous les niveaux de recettes à moitié prix' },
    { id: 'epouvantail', nom: 'Épouvantail à chauves-souris', cout: 8e14, apres: 12, cible: [], mult: 1, effet: { descenteN: 8, descentePart: 0.05 }, prime: 6, etoiles: 1, desc: 'Chauves-souris : 8 touches suffisent, elles n’emportent plus que 5 %' },
    { id: 'couette', nom: 'Couette des fantômes', cout: 1.5e15, apres: 12, cible: [], mult: 1, effet: { absenceH: 12, absencePart: 0.2 }, prime: 10, etoiles: 2, desc: 'Absence : les monstres travaillent 12 h, à 20 % du rythme' },
    { id: 'pelle', nom: 'La pelle du fossoyeur gourmand', cout: 2e15, apres: 13, cible: ['cimetiere'], mult: 3, prime: 12, etoiles: 2, desc: 'Gâteaux du cimetière ×3' },
    { id: 'nuages', nom: 'Nuages chassés d’un coup de baguette', cout: 3e15, apres: 12, cible: [], mult: 1, effet: { soireeDuree: 150 }, prime: 16, etoiles: 2, desc: 'Pleine lune : 2 min 30 au lieu de 2' }, // 2 min 30 (et non 3) : la place du Marché des sorcières dans l'enveloppe
    { id: 'turbo', nom: 'Balai à turbo', cout: 6e15, apres: 12, cible: [], mult: 1, effet: { scooterDuree: 20, scooterPrime: 3 }, prime: 24, etoiles: 3, desc: 'Le balai attend 20 s, son sac ×3' },
    { id: 'nid', nom: 'Le nid douillet de la dragonne', cout: 9e15, apres: 16, cible: ['dragon'], mult: 3, prime: 20, etoiles: 3, desc: 'Œufs de dragon ×3' },
  ];
  const effet = (q, cle, defaut) => { for (const a of AMELIORATIONS) if (a.effet && a.effet[cle] != null && q.ameliorations && q.ameliorations[a.id]) return a.effet[cle]; return defaut; }; // un Sortilège « après le maître » acheté change ce réglage
  const ABSENCE_MAX_H = 8;   // les monstres travaillent 8 h au plus pendant une absence, comme à la boulangerie…
  const ABSENCE_PART = 0.1;  // … mais au ralenti : sans toi, le Manoir somnole (10 % du rythme)
  const PRESENCE = 6;        // tu es là : toutes les ventes ×6 tant que le Manoir est ouvert (c'est en jouant qu'on grimpe)
  const REPUTATION = 1.5;    // chaque palier franchi fait la réputation du Manoir : toutes les ventes ×1,5 de plus
  const EVENEMENTS = { // les clés de mécanique du Quartier (voir l'en-tête) ; l'habillage d'Halloween : FICHE.evenements
    descente: { duree: 15, n: 12, part: 0.1 },  // une nuée de chauves-souris : 12 touches en 15 s pour les chasser (prime) ; sinon elles emportent 10 % des bonbons
    grosclient: { duree: 180, prime: 6 },        // un cortège d'enfants déguisés : N friandises en 3 min, payées 6 fois
    soiree: { duree: 120, mult: 2 },             // la pleine lune : toutes les ventes ×2 pendant 2 min
    scooter: { duree: 10 },                      // le balai de la sorcière passe : attraper le bonus en 10 s
  };

  // ─── les douze paliers : des bonbons gagnés (total), les mêmes pour tous ; chacun donne une récompense pour la boulangerie ───
  // Réglés sur la simulation (test/fournil-hantee.test.js) : un assidu (80 min par jour, en quatre sessions) franchit le 12e le
  // dernier jour (le 6e ou le 7e jour de Paris) ; un quotidien (36 min) va jusqu'au 8e-9e ; un occasionnel (17 min) passe le 5e.
  // Après le maître (bonus: true), les paliers 13 à 20 : un très actif (8 h par jour, le 12e au 2e jour) en franchit un par jour ou
  // presque ; le marathon (24 h/24) n'atteint le 20e que le 5e jour (le 6e avant la v6.3). Ils ne font plus la réputation (REPUTATION ne compte que
  // les douze premiers : l'enveloppe du serveur ne bouge pas) ; étoiles, boosts, primes, un titre, et au 20e le chapeau phosphorescent (un
  // trophée de la garde-robe, distinct de la tenue en or du podium final). Version 2 des récompenses (16 octobre), les mêmes principes
  // qu'au Quartier (src/quartier.js) : les seuils ne bougent pas ; prime : des heures du rythme de la boulangerie ; les douze premiers un
  // peu plus généreux (10 étoiles, 16 h de primes), les huit bonus bien plus (29 étoiles, des ×5 et des ×10, 54 h de primes).
  const PALIERS = [
    { n: 1, total: 4e8, etoiles: 1, boost: { mult: 2, secs: 1800 }, titre: 'Premiers bonbons' },
    { n: 2, total: 1e10, deco: 'citrouilles', prime: 1, titre: 'Les citrouilles du perron' },
    { n: 3, total: 1.5e11, vetement: 'hantee-chapeau', titre: 'Le chapeau pointu' },
    { n: 4, total: 6e11, chat: 'noir', etoiles: 1, titre: 'Le chat noir' },
    { n: 5, total: 2e12, deco: 'toiles', prime: 2, titre: 'Les toiles d’araignée' },
    { n: 6, total: 5e12, vetement: 'hantee-cape', titre: 'La cape de minuit' },
    { n: 7, total: 1e13, etoiles: 1, boost: { mult: 5, secs: 900 }, titre: 'La nuit des farces' },
    { n: 8, total: 1.5e13, deco: 'chaudron', prime: 3, titre: 'Le chaudron qui bouillonne' },
    { n: 9, total: 4e13, vetement: 'hantee-bottes', titre: 'Les bottes qui claquent' },
    { n: 10, total: 1.2e14, etoiles: 2, boost: { mult: 2, secs: 3600 }, titre: 'Le Manoir affiche complet' },
    { n: 11, total: 2.5e14, etoiles: 1, boost: { mult: 2, secs: 1800 }, prime: 4, titre: 'Le bal des citrouilles' },
    { n: 12, total: 4e14, vetement: 'hantee-lanterne', etoiles: 4, boost: { mult: 5, secs: 3600 }, prime: 6, titre: 'Le maître du Manoir' },
    { n: 13, total: 1.2e15, bonus: true, etoiles: 2, boost: { mult: 5, secs: 1800 }, prime: 4, titre: 'Hubert fait des heures sup’' },
    { n: 14, total: 2.5e15, bonus: true, etoiles: 2, prime: 6, titre: 'Les citrouilles t’applaudissent' },
    { n: 15, total: 4.5e15, bonus: true, etoiles: 3, boost: { mult: 5, secs: 2700 }, titre: 'Le comte Vladimir veut un autographe' },
    { n: 16, total: 7e15, bonus: true, etoiles: 3, prime: 8, titre: 'Ramsès se déroule de joie' },
    { n: 17, total: 1e16, bonus: true, etoiles: 3, boost: { mult: 10, secs: 1800 }, titre: 'Osvaldo en rit jusqu’aux os' },
    { n: 18, total: 1.3e16, bonus: true, etoiles: 4, prime: 12, titre: 'Berthe chante juste (une fois)' },
    { n: 19, total: 2.5e16, bonus: true, etoiles: 4, boost: { mult: 10, secs: 2700 }, titre: 'La lune se lève rien que pour toi' },
    { n: 20, total: 6e16, bonus: true, vetement: 'hantee-lueur-chapeau', etoiles: 8, boost: { mult: 10, secs: 3600 }, prime: 24, titre: 'La légende phosphorescente' },
  ];
  const ANCIENS = { // les récompenses d'avant la version 2 (étoiles, boost ; aucune prime) : la revue donne la différence (ACT.RECOMPENSES.revue)
    1: { etoiles: 1, boost: { mult: 2, secs: 1800 } }, 4: { etoiles: 1 }, 7: { boost: { mult: 5, secs: 900 } }, 10: { etoiles: 2, boost: { mult: 2, secs: 3600 } }, 11: { etoiles: 1, boost: { mult: 2, secs: 1800 } },
    12: { etoiles: 3, boost: { mult: 5, secs: 1800 } }, 13: { boost: { mult: 2, secs: 1800 } }, 14: { etoiles: 1 }, 15: { boost: { mult: 2, secs: 3600 } }, 16: { etoiles: 1 },
    17: { boost: { mult: 5, secs: 900 } }, 18: { etoiles: 1 }, 19: { boost: { mult: 2, secs: 3600 } }, 20: { etoiles: 2, boost: { mult: 5, secs: 1800 } },
  };
  const PALIERS_BOSS = 12; // le dernier palier « normal » ; après lui, les paliers bonus
  const TROPHEE = 'hantee-lueur-chapeau'; // le chapeau phosphorescent du palier 20 (garde-robe : collection « hantee-lueur »)
  const VETEMENTS = ['hantee-chapeau', 'hantee-cape', 'hantee-bottes', 'hantee-lanterne'];
  const VETEMENTS_OR = ['hantee-or-chapeau', 'hantee-or-cape', 'hantee-or-bottes', 'hantee-or-lanterne']; // le podium final
  const DECOS = ['citrouilles', 'toiles', 'chaudron'];

  // ─── l'état : st.hantee, créé à la première visite (dans la sauvegarde du jeu) ───
  function postesNeufs() { return PRODUITS.map((p, i) => ({ niv: i === 0 ? 1 : 0, staff: false, prog: 0, actif: false })); }
  function neuf(now) {
    return { v: 1, majeur: true, masque: false, annonce: false, bilan: false, billets: 0, total: 0, postes: postesNeufs(), ameliorations: {}, mode: 1,
      ev: null, evTimer: 150, dernierEv: '', boost: null, lastSeen: now, now, actif: now, ouvertLe: 0, paliers: [], vetements: [], decos: [], recompensesV2: true, heures: 0, chat: false, etoiles: 0, boosts: 0,
      stats: Object.assign({ ventes: 0, taps: 0, descentes: 0, descentesRatees: 0, grosClients: 0, scooters: 0, soirees: 0, embauches: 0, saisi: 0 }, statsManoir()), carnet: [], mini: null, contrats: null, operation: null, manoir: manoirNeuf(now) };
  }
  // q.billets / q.total : les bonbons en poche / gagnés en tout (les mêmes noms qu'au Quartier, pour le moteur d'écran) ; bonbons(q) les lit
  function etat(st, now) { // l'état de l'événement, remis d'aplomb
    let q = st.hantee;
    if (!q || typeof q !== 'object' || !Array.isArray(q.postes)) q = st.hantee = neuf(now);
    while (q.postes.length < PRODUITS.length) q.postes.push({ niv: 0, staff: false, prog: 0, actif: false });
    if (q.postes.length > PRODUITS.length) q.postes.length = PRODUITS.length;
    for (const k of ['paliers', 'vetements', 'decos', 'carnet']) if (!Array.isArray(q[k])) q[k] = [];
    if (!q.stats || typeof q.stats !== 'object') q.stats = neuf(now).stats;
    if (!q.ameliorations || typeof q.ameliorations !== 'object') q.ameliorations = {};
    if (!(q.billets >= 0)) q.billets = 0; if (!(q.total >= 0)) q.total = 0;
    q.majeur = true; // pas de porte : tous âges
    A.reparer(q); // les activités : q.mini, q.contrats, q.operation, et leurs compteurs (une vieille sauvegarde n'en a pas)
    reparerManoir(q, now); // lot 6 : q.actif (absent : actif maintenant), q.manoir (clients, apparitions, commande, plafonds) et ses compteurs
    return q;
  }
  const bonbons = (q) => (q ? q.billets : 0);
  const note = (q, txt) => { q.carnet.push({ t: q.now, txt }); if (q.carnet.length > 12) q.carnet.shift(); };

  // ─── calculs (les mêmes formules qu'au Quartier) ───
  const paliersPoste = () => PALIERS_POSTE; // les mêmes pour toutes les recettes (i accepté, pour l'écran)
  const exposantPalier = (niv) => { let e = 0; for (const [p, x] of PALIERS_EXPOSANTS) if (niv >= p) e = x; return e; }; // l'exposant du plus haut palier franchi
  const palierMult = (niv) => Math.pow(2, exposantPalier(niv));
  const prochainPalier = (niv) => PALIERS_POSTE.find((p) => p > niv) || null;
  const gainPalier = (p) => palierMult(p) / palierMult(p - 1); // ce que ce palier ajoute (×2 aux anciens, ×1,41 ou ×1,19 aux intercalés) : pour l'écran
  function ameliorationMult(q, i) { let m = 1; for (const a of AMELIORATIONS) if (q.ameliorations[a.id] && (a.cible === null || a.cible.includes(PRODUITS[i].id))) m *= a.mult; return m; }
  // en ta présence : le ×6 (×12 sous la pleine lune) tant que le Manoir est éveillé ; lot 6, il s'endort sans toucher (eveil, plus bas)
  function boostMult(q) { let m = 1 + (PRESENCE - 1) * eveil(q); if (q.ev && q.ev.type === 'soiree' && q.ev.fin > q.now) m *= EVENEMENTS.soiree.mult; return m; }
  const reputationMult = (q) => Math.pow(REPUTATION, paliersAtteints(q).filter((p) => !p.bonus).length); // les paliers bonus ne font plus la réputation
  const temps = (q, i) => PRODUITS[i].temps;
  const revenuBase = (q, i) => { const s = q.postes[i]; return s.niv <= 0 ? 0 : PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(q, i) * reputationMult(q); };
  const revenu = (q, i) => revenuBase(q, i) * boostMult(q);
  const revenuFournee = (q, i) => revenu(q, i) * (q.postes[i].staff ? 1 : 1.5); // à la main, on sert un client de plus
  // les prix catalogue (sans q) ; ce que paie le joueur passe par prixNiveaux / quantite, qui lisent la remise du Marché des sorcières (q)
  const coutNiveau = (i, niv) => (niv === 0 ? PRODUITS[i].debloquer : PRODUITS[i].cout * Math.pow(PRODUITS[i].croiss, niv));
  function coutNiveaux(i, niv, n) { if (niv === 0) return PRODUITS[i].debloquer; const r = PRODUITS[i].croiss; return PRODUITS[i].cout * Math.pow(r, niv) * (Math.pow(r, n) - 1) / (r - 1); }
  function maxNiveaux(i, niv, billets) { const r = PRODUITS[i].croiss, a = PRODUITS[i].cout * Math.pow(r, niv); if (billets < a) return 0; return Math.floor(Math.log(billets * (r - 1) / a + 1) / Math.log(r)); }
  const remise = (q) => (q ? effet(q, 'remise', 1) : 1); // le Marché des sorcières : 0,5 (les niveaux à moitié prix ; un déblocage garde son prix)
  const maxAchetables = (q, i) => maxNiveaux(i, q.postes[i].niv, q.billets / remise(q)); // ce que les bonbons paient, remise comprise
  function quantite(q, i) { const s = q.postes[i]; if (s.niv === 0) return 1; if (q.mode === 'max') return Math.max(1, maxAchetables(q, i)); return q.mode; }
  const prixNiveaux = (q, i, n) => { const niv = q.postes[i].niv; return niv === 0 ? coutNiveaux(i, 0, n) : coutNiveaux(i, niv, n) * remise(q); };
  const recetteOuverte = (q, i) => !PRODUITS[i].apres || q.total >= PALIERS[PRODUITS[i].apres - 1].total; // les recettes « après le maître » : une fois leur palier franchi
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
    if (s.niv === 0 && !recetteOuverte(q, i)) return { ok: false, prix, verrou: true, apres: PRODUITS[i].apres }; // après le maître : pas avant son palier
    if (i > 0 && s.niv === 0 && q.postes[i - 1].niv === 0) return { ok: false, prix, verrou: true };
    if (q.billets < prix) return { ok: false, prix };
    q.billets -= prix; const deblocage = s.niv === 0; s.niv += n;
    if (deblocage) note(q, `${PRODUITS[i].nom} : nouvelle friandise`);
    return { ok: true, n, prix, deblocage };
  }
  function embaucher(q, i) {
    const s = q.postes[i], prix = prixStaff(q, i);
    if (s.staff || s.niv <= 0 || q.billets < prix) return { ok: false, prix };
    q.billets -= prix; s.staff = true; s.actif = true; q.stats.embauches++; note(q, `${PRODUITS[i].staffNom} rejoint le Manoir`);
    return { ok: true, prix };
  }
  function lancer(q, i) { // une fournée à la main ; lot 6 : son « parfait » se tire de l'instant du lancement (s.lance), un seul essai (s.essai)
    const s = q.postes[i]; if (s.niv <= 0 || s.actif) return false;
    s.actif = true; s.prog = 0; s.lance = Number.isFinite(q.now) ? q.now : 0; s.essai = false; s.parfait = false; q.stats.taps++; return true;
  }
  const combineOuverte = (q, a) => !a.apres || q.total >= PALIERS[a.apres - 1].total; // les Sortilèges « après le maître » : une fois le palier franchi
  function amelioration(q, id) {
    const a = AMELIORATIONS.find((x) => x.id === id), prix = a ? a.cout : 0;
    if (a && !combineOuverte(q, a)) return { ok: false, prix, verrou: true };
    if (!a || q.ameliorations[id] || q.billets < prix) return { ok: false, prix };
    q.billets -= prix; q.ameliorations[id] = true; note(q, `${a.nom} : ${a.desc}`);
    if (a.etoiles) q.etoiles = (q.etoiles || 0) + a.etoiles; if (a.prime) q.heures = (q.heures || 0) + a.prime; // après le boss : elle paie aussi la boulangerie (l'écran verse la prime et les étoiles)
    return { ok: true, a, prix };
  }

  // ─── les coups de pouce : un toutes les 2 à 5 minutes de jeu dans le Manoir, jamais deux fois le même d'affilée ───
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
  function planquer(q) { // les chauves-souris : une touche ; à la 12e, elles sont toutes chassées et la prime tombe
    const ev = q.ev; if (!ev || ev.type !== 'descente' || ev.fin <= q.now) return { ok: false };
    ev.taps++; if (ev.taps < ev.n) return { ok: true, fini: false, taps: ev.taps };
    gagner(q, ev.prime); q.stats.descentes++; note(q, `Chauves-souris chassées : +${fmt(ev.prime)} bonbons`); q.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function livrer(q) { // le cortège d'enfants déguisés : la commande servie
    const ev = q.ev; if (!ev || ev.type !== 'grosclient' || ev.fait < ev.n || ev.livree) return { ok: false };
    ev.livree = true; gagner(q, ev.prime); q.stats.grosClients++; note(q, `Cortège servi : +${fmt(ev.prime)} bonbons`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function attraper(q, id) { // le balai de la sorcière : on attrape le sac de bonbons avant qu'il reparte ; lot 6 : avec un id, une apparition (attraperApparition)
    if (id != null) return attraperApparition(q, id);
    const ev = q.ev; if (!ev || ev.type !== 'scooter' || ev.fin <= q.now) return { ok: false };
    gagner(q, ev.prime); q.stats.scooters++; note(q, `Le balai a lâché +${fmt(ev.prime)} bonbons`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function finEvenement(q, ev) { // un coup de pouce qui finit sans toi : les chauves-souris emportent leur part de bonbons
    if (ev.type === 'descente') { const saisi = Math.min(q.billets, ev.enjeu || 0); q.billets -= saisi; q.stats.descentesRatees++; q.stats.saisi += saisi; note(q, `Les chauves-souris emportent ${fmt(saisi)} bonbons`); return { saisi }; }
    if (ev.type === 'soiree') q.stats.soirees++;
    return {};
  }

  // ═══ lot 6 (19 octobre) : le Manoir « qui choque » — des choses à FAIRE, pour qu'on n'y laisse plus le téléphone tourner seul ═══
  // Cinq règles, toutes pures (le « maintenant » vient de l'appelant : tick, ou q.now, le dernier pas), plafonnées à l'heure ou au jour,
  // proportionnelles au rythme de référence (rythme(q) : les monstres, sans la présence) comme les activités de src/activites.js ; aucune
  // ne paie pendant l'absence ; le hasard se tire de q.manoir.graine (et de son compteur) : la même sauvegarde donne la même suite, et les
  // coups de pouce (le hasard de tick) ne changent pas. Les apprentis et revenuFournee ne changent pas.
  //   1. LE ×6 QUI S'ENDORT (EVEIL, toucher, eveil, presence) : l'écran pose q.actif (un « maintenant ») à chaque toucher utile
  //      (toucher(q, now)) ; le plein ×6 (×12 sous la pleine lune) dure EVEIL.plein secondes après le dernier, puis descend en ligne droite
  //      jusqu'à ×1 en EVEIL.sommeil secondes ; un seul toucher le remet au plein. eveil(q) : 0..1 (la jauge ; BOUTIQUE_HANTEE.ambiance).
  //      Vieille sauvegarde (q.actif absent) : actif maintenant ; revenir (absence) réveille le Manoir.
  //   2. LES CLIENTS-MONSTRES (CLIENTS, SORTES, servir) : une file de trois au plus ; un client toutes les 8 à 20 s (sa sorte parmi les
  //      neuf, sa commande : une à trois friandises ouvertes, une à trois de chaque) ; il attend 40 s, puis repart sans rien (aucune
  //      pénalité). servir(q, id, produit) sert une ligne de sa commande (le bon produit, sinon refusé : faux) ; la dernière servie, il
  //      paie un pourboire : CLIENTS.minutes minutes du rythme par friandise, jusqu'à ×1,5 s'il est servi tout de suite (rien de plus après
  //      40 s d'attente) ; plafonds : CLIENTS.parHeure et CLIENTS.parJour minutes.
  //   3. LES FOURNÉES PARFAITES (PARFAIT, fenetreParfait, parfait) : une fournée lancée à la main (un poste sans son monstre, ou la recette
  //      du jour : i = -1) d'au moins 6 s a une fenêtre « parfait » de 15 % de sa durée, placée entre 30 % et 90 % par le hasard de son
  //      lancement (déterministe : l'instant du lancement et le poste) ; parfait(q, i, now) dedans : la fournée vaut ×2 (le double est payé
  //      tout de suite) ; dehors : rien de perdu, mais un seul essai par fournée. Plafonds : PARFAIT.parHeure fournées parfaites par heure,
  //      et leur double rogné à PARFAIT.minutes minutes du rythme l'heure, PARFAIT.minutesJour le jour (une fournée de la recette du jour,
  //      à la part 0,25, vaut plusieurs minutes : sans ce plafond, les parfaites pesaient 12 % des bonbons du très actif).
  //   L'équilibre (20 octobre, la recette du jour à la part 0,25) : ensemble, les quatre activités ajoutent environ +21 % au très actif
  //   (médiane de huit graines, de +10 % à +28 % selon le hasard des coups de pouce ; +27 % sur la graine 7 : 64 → 82 Bd), aucune plus de
  //   40 % de ce qu'elles rapportent (clients 33 %, apparitions 26 %, parfaites 22 %, commandes 19 %), et son 20e reste au 7e et dernier
  //   jour sur chaque graine (test/fournil-hantee.test.js). Pas plus : sans elles, il finit le 6e jour à 76-84 % du seuil du 20e ; au-delà
  //   de +24 % environ, le 20e tomberait le 6e soir pour une partie des joueurs.
  //   4. LES APPARITIONS (APPARITIONS, TYPES_APPARITION, attraper(q, id)) : une toutes les 20 à 60 s ('fantome', 'citrouille',
  //      'chauve-souris'), qui vit 6 à 10 s ; attrapée : APPARITIONS.minutes minutes du rythme, ×1,5 dès la troisième d'affilée (une qui
  //      s'échappe casse la série) ; plafonds à l'heure et au jour. attraper(q) sans id reste le balai de la sorcière (le coup de pouce).
  //   5. LES COMMANDES DE LA NUIT (COMMANDES, commandeManoir, livrerCommande) : une à la fois, tirée parmi les postes ouverts (« 240 bonbons
  //      acidulés en 10 min » : ce que le poste fait dans ce temps, ×0,6 avec son monstre, ×0,3 à la main), comptée sur les ventes (comme
  //      le cortège) ; livrée au bouton avant l'heure : la prime (COMMANDES.part minute du rythme par minute de commande) ; ratée : rien,
  //      et la suivante une à trois minutes plus tard. Plafonds à l'heure et au jour.
  //   6. LE BESTIAIRE (BESTIAIRE, bestiaire, verserBestiaire) : chaque client servi en entier (servir : sa dernière ligne, payée ou non
  //      par les plafonds) compte pour sa sorte, q.bestiaire[sorte] += 1 ; à BESTIAIRE.par servis, la sorte est complétée. Chaque sorte
  //      complétée, dans l'ordre (q.bestiaireFaits fait foi : jamais deux fois), donne des étoiles POUR LA BOULANGERIE, 1 ou 2 selon son rang
  //      (BESTIAIRE.etoiles : 2 pour la 5e et la 9e, 11 en tout), comptées dans q.etoiles (le bilan) et dans q.bestiaireAVerser, que l'écran
  //      verse dans la boulangerie puis remet à zéro (verserBestiaire, comme les étapes de la recette du jour) ; à la 5e, un décor pour la
  //      boutique (q.decos : 'bestiaire', l'étagère aux bocaux de monstres, posée comme ceux des paliers) ; aux neuf, le compagnon
  //      chauve-souris (q.chauvesouris : GAME.COMPAGNONS, « chauve-souris », le lit). Aucun bonbon : l'enveloppe du serveur ne bouge pas.
  //      Vieille sauvegarde : q.bestiaire absent → vide (rien n'est inventé ; les servis d'avant ne comptent pas).
  // L'état : q.manoir = { graine, tirages, file, prochainClient, seqClient, apps, prochaineApp, seqApp, serie, commande, prochaineCommande,
  // seqCommande, heure, jour, h, j (ce que chacune a payé cette heure et ce jour, en minutes du rythme ; les parfaites, en fournées, et
  // minParfaits, leurs minutes),
  // bilan: { clients | apparitions | parfaits | commandes: { n, gain, min } } } ; tick rend out.manoir = { arrives, partis, apparitions,
  // perdues, commande, ratee } pour l'écran (BOUTIQUE_HANTEE.client, .fache, .apparition…).
  const EVEIL = { plein: 60, sommeil: 180 }; // secondes : le plein après le dernier toucher, puis la descente jusqu'à ×1
  const SORTES = ['squelette', 'squelette-sorcier', 'zombie', 'citrouille', 'fantome', 'momie', 'sorciere', 'vampire', 'loup']; // les mêmes que la scène (BOUTIQUE_HANTEE.SORTES)
  const NOMS_SORTES = { squelette: 'Le squelette', 'squelette-sorcier': 'Le squelette sorcier', zombie: 'Le zombie', citrouille: 'La tête-citrouille', fantome: 'Le fantôme', momie: 'La momie', sorciere: 'La sorcière', vampire: 'Le vampire', loup: 'Le loup-garou' };
  const NOMS_COURTS = { squelette: 'Squelette', 'squelette-sorcier': 'Squelette sorcier', zombie: 'Zombie', citrouille: 'Tête-citrouille', fantome: 'Fantôme', momie: 'Momie', sorciere: 'Sorcière', vampire: 'Vampire', loup: 'Loup-garou' }; // (le bestiaire : « Zombie 4/10 »)
  const CLIENTS = { file: 3, arrivee: [8, 20], patience: 40, lignes: 3, minutes: 0.014, vite: 0.5, parHeure: 22, parJour: 170 };
  const PARFAIT = { tempsMin: 6, largeur: 0.15, de: [0.3, 0.75], parHeure: 40, minutes: 11, minutesJour: 80 };
  const TYPES_APPARITION = ['fantome', 'citrouille', 'chauve-souris'];
  const APPARITIONS = { intervalle: [20, 60], vie: [6, 10], minutes: 0.09, serie: 3, mult: 1.5, parHeure: 27, parJour: 180 };
  const COMMANDES = { durees: [5, 10, 15], part: 0.12, pause: [60, 180], premiere: 90, staff: 0.6, main: 0.3, parHeure: 18, parJour: 120 };
  const PLAFONDS = { clients: CLIENTS, apparitions: APPARITIONS, commandes: COMMANDES };
  const ACTIVITES_MANOIR = ['clients', 'apparitions', 'parfaits', 'commandes'];
  const BESTIAIRE = { par: 10, etoiles: [1, 1, 1, 1, 2, 1, 1, 1, 2], deco: 5, decoId: 'bestiaire', compagnon: 9 }; // etoiles : par rang de la sorte complétée (11 en tout)
  const STATS_MANOIR = ['clientsServis', 'clientsPartis', 'apparitions', 'apparitionsRatees', 'parfaits', 'parfaitsRates', 'commandes', 'commandesRatees'];
  function statsManoir() { const o = {}; for (const k of STATS_MANOIR) o[k] = 0; return o; }
  const compteursNeufs = () => ({ clients: 0, apparitions: 0, parfaits: 0, commandes: 0, minParfaits: 0 }); // (parfaits : des fournées ; minParfaits : ce qu'elles ont payé, en minutes)
  const bilanNeuf = () => { const o = {}; for (const k of ACTIVITES_MANOIR) o[k] = { n: 0, gain: 0, min: 0 }; return o; };
  function manoirNeuf(now) {
    return { graine: ACT.hacher(`${Number.isFinite(now) ? now : 0}|hantee|manoir`), tirages: 0, file: [], prochainClient: 0, seqClient: 0, apps: [], prochaineApp: 0, seqApp: 0, serie: 0,
      commande: null, prochaineCommande: 0, seqCommande: 0, heure: -1, jour: '', h: compteursNeufs(), j: compteursNeufs(), bilan: bilanNeuf() };
  }
  const fini = (x) => typeof x === 'number' && Number.isFinite(x);
  const posteOk = (i) => Number.isInteger(i) && i >= 0 && i < PRODUITS.length;
  function reparerManoir(q, now) { // une vieille sauvegarde (rien de tout ça), ou des champs abîmés : remis d'aplomb sans rien inventer
    if (!fini(q.actif)) q.actif = fini(now) ? now : (fini(q.now) ? q.now : 0);
    if (!q.stats || typeof q.stats !== 'object') q.stats = {}; for (const k of STATS_MANOIR) if (!(q.stats[k] >= 0)) q.stats[k] = 0;
    const M = q.manoir && typeof q.manoir === 'object' ? q.manoir : (q.manoir = manoirNeuf(now));
    if (!fini(M.graine)) M.graine = ACT.hacher(`${fini(now) ? now : 0}|hantee|manoir`); M.graine >>>= 0;
    for (const k of ['tirages', 'prochainClient', 'seqClient', 'prochaineApp', 'seqApp', 'serie', 'prochaineCommande', 'seqCommande']) if (!fini(M[k]) || M[k] < 0) M[k] = 0;
    if (!fini(M.heure)) M.heure = -1; if (typeof M.jour !== 'string') M.jour = '';
    for (const k of ['h', 'j']) { if (!M[k] || typeof M[k] !== 'object') M[k] = compteursNeufs(); for (const a of Object.keys(compteursNeufs())) if (!(M[k][a] >= 0)) M[k][a] = 0; }
    if (!M.bilan || typeof M.bilan !== 'object') M.bilan = bilanNeuf(); for (const a of ACTIVITES_MANOIR) { const b = M.bilan[a] && typeof M.bilan[a] === 'object' ? M.bilan[a] : (M.bilan[a] = { n: 0, gain: 0, min: 0 }); for (const k of ['n', 'gain', 'min']) if (!(b[k] >= 0)) b[k] = 0; }
    const ligneOk = (l) => l && typeof l === 'object' && posteOk(l.i) && l.n >= 1 && l.n <= 9;
    M.file = (Array.isArray(M.file) ? M.file : []).filter((c) => c && typeof c === 'object' && fini(c.id) && SORTES.includes(c.sorte) && fini(c.arrive) && Array.isArray(c.commande) && c.commande.length >= 1 && c.commande.length <= CLIENTS.lignes && c.commande.every(ligneOk)).slice(0, CLIENTS.file);
    for (const c of M.file) for (const l of c.commande) l.servi = !!l.servi;
    M.apps = (Array.isArray(M.apps) ? M.apps : []).filter((a) => a && typeof a === 'object' && fini(a.id) && TYPES_APPARITION.includes(a.type) && fini(a.debut) && fini(a.fin)).slice(0, 3);
    const c = M.commande; if (c !== null && !(c && typeof c === 'object' && posteOk(c.i) && c.n >= 1 && fini(c.fait) && fini(c.debut) && fini(c.fin) && COMMANDES.durees.includes(c.duree))) M.commande = null;
    reparerBestiaire(q);
    return M;
  }
  function reparerBestiaire(q) { // le bestiaire : absent (une vieille sauvegarde) → vide ; des comptes abîmés → 0 ; les sortes faites, sans doublon ni inconnue
    const b = q.bestiaire && typeof q.bestiaire === 'object' && !Array.isArray(q.bestiaire) ? q.bestiaire : (q.bestiaire = {});
    for (const k of Object.keys(b)) if (!SORTES.includes(k)) delete b[k];
    for (const k of SORTES) b[k] = Number.isFinite(b[k]) && b[k] > 0 ? Math.floor(b[k]) : 0;
    const vus = new Set(); q.bestiaireFaits = (Array.isArray(q.bestiaireFaits) ? q.bestiaireFaits : []).filter((k) => SORTES.includes(k) && !vus.has(k) && (vus.add(k), true));
    if (!(q.bestiaireAVerser >= 0) || !Number.isFinite(q.bestiaireAVerser)) q.bestiaireAVerser = 0;
    q.chauvesouris = q.chauvesouris === true;
    return b;
  }
  function hasard(M) { return ACT.alea(M.graine, M.tirages++); } // le hasard du Manoir : la graine de la partie et son compteur (sauvegardés)
  const entre = (M, ab) => ab[0] + (ab[1] - ab[0]) * hasard(M);

  // ─── 1. le ×6 qui s'endort ───
  function eveil(q, now) { // 0..1 : 1 (le plein) jusqu'à EVEIL.plein s après le dernier toucher, puis en ligne droite jusqu'à 0 (×1)
    const t = fini(now) ? now : q.now, a = q.actif; if (!fini(a) || !fini(t)) return 1;
    const d = (t - a) / 1000; return d <= EVEIL.plein ? 1 : Math.max(0, 1 - (d - EVEIL.plein) / EVEIL.sommeil);
  }
  function toucher(q, now) { const t = fini(now) ? now : q.now; if (fini(t)) q.actif = t; return eveil(q, t); } // un toucher utile : le plein, tout de suite
  function presence(q, now) { // pour la jauge et l'ambiance : { eveil (0..1), mult (le multiplicateur de présence, sans la lune), plein (ms avant que ça baisse), zero (ms avant ×1) }
    const t = fini(now) ? now : q.now, e = eveil(q, t), d = fini(q.actif) && fini(t) ? t - q.actif : 0;
    return { eveil: e, mult: 1 + (PRESENCE - 1) * e, plein: Math.max(0, EVEIL.plein * 1000 - d), zero: Math.max(0, (EVEIL.plein + EVEIL.sommeil) * 1000 - d), dort: e <= 0 };
  }

  // ─── les plafonds (minutes du rythme payées dans l'heure et le jour de Paris ; les fournées parfaites, en nombre) ───
  function compteurs(M, now) { const h = Math.floor((fini(now) ? now : 0) / 3600e3), j = dayKey(fini(now) ? now : 0); if (M.heure !== h) { M.heure = h; M.h = compteursNeufs(); } if (M.jour !== j) { M.jour = j; M.j = compteursNeufs(); } return M; }
  const manoirOuvert = (now) => fenetre(now).ouvert;
  function payerMinutes(q, act, minutes) { // paie « minutes » du rythme, rognées aux plafonds de l'heure et du jour → { gain, min, plafond }
    const M = compteurs(q.manoir, q.now), P = PLAFONDS[act];
    const m = manoirOuvert(q.now) ? Math.max(0, Math.min(minutes, P.parHeure - M.h[act], P.parJour - M.j[act])) : 0, gain = m > 0 ? arrondi(Math.max(1, rythme(q) * m * 60)) : 0;
    M.h[act] += m; M.j[act] += m; if (gain > 0) gagner(q, gain);
    const b = M.bilan[act]; b.n++; b.gain += gain; b.min += m;
    return { gain, min: m, plafond: m < minutes - 1e-9 };
  }
  function plafondsManoir(q, now) { // ce que l'écran peut afficher : pour chaque activité, payé / plafond, cette heure et ce jour
    const M = compteurs(q.manoir, fini(now) ? now : q.now), o = {};
    for (const a of ['clients', 'apparitions', 'commandes']) o[a] = { heure: M.h[a], parHeure: PLAFONDS[a].parHeure, jour: M.j[a], parJour: PLAFONDS[a].parJour, plein: M.h[a] >= PLAFONDS[a].parHeure - 1e-9 || M.j[a] >= PLAFONDS[a].parJour - 1e-9 };
    o.parfaits = { heure: M.h.parfaits, parHeure: PARFAIT.parHeure, minutes: M.h.minParfaits, parHeureMin: PARFAIT.minutes, jour: M.j.minParfaits, parJour: PARFAIT.minutesJour, plein: M.h.parfaits >= PARFAIT.parHeure || M.h.minParfaits >= PARFAIT.minutes - 1e-9 || M.j.minParfaits >= PARFAIT.minutesJour - 1e-9 };
    return o;
  }

  // ─── 2. les clients-monstres ───
  function nouveauClient(q, now) {
    const M = q.manoir, ouverts = q.postes.map((s, i) => i).filter((i) => q.postes[i].niv > 0); if (!ouverts.length) return null;
    const sorte = SORTES[Math.floor(hasard(M) * SORTES.length)], nl = 1 + Math.floor(hasard(M) * Math.min(CLIENTS.lignes, ouverts.length)), commande = [];
    for (let k = 0; k < nl; k++) {
      const reste = ouverts.filter((i) => !commande.some((l) => l.i === i)), i = reste[Math.floor(hasard(M) * reste.length)], T = PRODUITS[i].temps;
      commande.push({ i, n: 1 + Math.floor(hasard(M) * (T <= 6 ? 3 : T <= 24 ? 2 : 1)), servi: false }); // des quantités modestes : moins des friandises longues
    }
    const c = { id: ++M.seqClient, sorte, commande, arrive: now };
    M.file.push(c); return c;
  }
  const clientsManoir = (q) => (q.manoir ? q.manoir.file : []);
  function pourboire(q, c) { // ce que paierait ce client servi maintenant (minutes du rythme, avant les plafonds)
    const attente = Math.max(0, (q.now - c.arrive) / 1000), unites = c.commande.reduce((s, l) => s + l.n, 0);
    return CLIENTS.minutes * unites * (1 + CLIENTS.vite * Math.max(0, 1 - attente / CLIENTS.patience));
  }
  function servir(q, id, produit) { // une ligne de la commande du client id ; la dernière : il paie et repart content
    const M = q.manoir, c = M && M.file.find((x) => x.id === id); if (!c) return { ok: false };
    const i = typeof produit === 'string' ? PRODUITS.findIndex((p) => p.id === produit) : Number(produit);
    const l = c.commande.find((x) => x.i === i && !x.servi); if (!l) return { ok: false, faux: true, client: c };
    l.servi = true; toucher(q, q.now);
    const reste = c.commande.filter((x) => !x.servi).length; if (reste > 0) return { ok: true, fini: false, reste, client: c };
    const min = pourboire(q, c); M.file.splice(M.file.indexOf(c), 1); q.stats.clientsServis++;
    const p = payerMinutes(q, 'clients', min), be = compterBestiaire(q, c.sorte);
    return { ok: true, fini: true, prime: p.gain, plafond: p.plafond, client: c, bestiaire: be };
  }

  // ─── 6. le bestiaire ───
  function compterBestiaire(q, sorte) { // un client de cette sorte servi en entier → { sorte, n, par, complete: null | { sorte, rang, etoiles, deco, compagnon } }
    const b = reparerBestiaire(q); if (!SORTES.includes(sorte)) return null;
    b[sorte]++;
    const dus = bestiaireDus(q);
    return { sorte, n: b[sorte], par: BESTIAIRE.par, complete: dus.find((x) => x.sorte === sorte) || dus[0] || null, completes: dus };
  }
  function bestiaireDus(q) { // les sortes arrivées à BESTIAIRE.par et pas encore payées : payées ici, une fois, dans l'ordre (q.bestiaireFaits fait foi)
    const b = reparerBestiaire(q), dus = [];
    for (const k of SORTES) {
      if (b[k] < BESTIAIRE.par || q.bestiaireFaits.includes(k)) continue;
      q.bestiaireFaits.push(k); const rang = q.bestiaireFaits.length, et = BESTIAIRE.etoiles[rang - 1] || 1;
      q.etoiles = (q.etoiles || 0) + et; q.bestiaireAVerser += et; // (le bilan, et ce que l'écran doit verser dans la boulangerie)
      const x = { sorte: k, rang, etoiles: et, deco: null, compagnon: false };
      if (rang === BESTIAIRE.deco && !q.decos.includes(BESTIAIRE.decoId)) { q.decos.push(BESTIAIRE.decoId); x.deco = BESTIAIRE.decoId; }
      if (rang === BESTIAIRE.compagnon && !q.chauvesouris) { q.chauvesouris = true; x.compagnon = true; }
      note(q, `Bestiaire : ${NOMS_COURTS[k]}, ${rang}/${SORTES.length} sortes, +${et} ★`);
      dus.push(x);
    }
    return dus;
  }
  function bestiaire(q) { // pour l'écran : { sortes: [{ sorte, nom, court, n (0..par), par, fait }], faits, total (9), deco, chauvesouris, aVerser }
    const b = reparerBestiaire(q), sortes = SORTES.map((k) => ({ sorte: k, nom: NOMS_SORTES[k], court: NOMS_COURTS[k], n: Math.min(BESTIAIRE.par, b[k]), par: BESTIAIRE.par, fait: q.bestiaireFaits.includes(k) }));
    return { sortes, faits: q.bestiaireFaits.length, total: SORTES.length, deco: q.decos.includes(BESTIAIRE.decoId), chauvesouris: q.chauvesouris, aVerser: q.bestiaireAVerser };
  }
  function verserBestiaire(q) { reparerBestiaire(q); const n = q.bestiaireAVerser; q.bestiaireAVerser = 0; return n; } // les étoiles du bestiaire, à verser dans la boulangerie (l'écran)

  // ─── 3. les fournées parfaites ───
  function fenetreParfait(q, i) { // → { debut, fin (parts de la durée), duree (s), essai, parfait } ou null (pas une fournée à la main d'au moins 6 s en cours)
    const rec = i === -1 || i === 'recette', o = rec ? q.recettes && q.recettes.four : q.postes[i];
    if (!o) return null;
    let T, lance;
    if (rec) { T = (o.fin - o.debut) / 1000; lance = o.debut; }
    else { if (o.niv <= 0 || o.staff || !o.actif) return null; T = temps(q, i); lance = fini(o.lance) ? o.lance : 0; }
    if (!(T >= PARFAIT.tempsMin)) return null;
    const de = PARFAIT.de[0] + (PARFAIT.de[1] - PARFAIT.de[0]) * ACT.alea(ACT.hacher(`${lance}|${rec ? 'recette' : i}|parfait`), 0);
    return { debut: de, fin: de + PARFAIT.largeur, duree: T, essai: !!o.essai, parfait: !!o.parfait };
  }
  function parfait(q, i, now) { // le toucher « parfait » sur la fournée i (-1 : la recette du jour) à l'instant now
    const w = fenetreParfait(q, i); if (!w) return { ok: false };
    const rec = i === -1 || i === 'recette', o = rec ? q.recettes.four : q.postes[i], t = fini(now) ? now : q.now;
    if (o.essai) return { ok: false, deja: true };
    const part = rec ? (t - o.debut) / (o.fin - o.debut) : (o.prog + Math.max(0, (t - q.now) / 1000)) / w.duree;
    o.essai = true; toucher(q, t);
    if (part < w.debut || part > w.fin) { q.stats.parfaitsRates++; return { ok: true, parfait: false, tot: part < w.debut, part }; }
    o.parfait = true; q.stats.parfaits++;
    const M = compteurs(q.manoir, t), b = M.bilan.parfaits; b.n++;
    if (M.h.parfaits >= PARFAIT.parHeure || !manoirOuvert(t)) return { ok: true, parfait: true, prime: 0, plafond: true, part };
    // ×2 : la même fournée encore une fois, tout de suite (la recette : son gain fixé au lancement), rognée au plafond en minutes du rythme
    // (PARFAIT.minutes l'heure, PARFAIT.minutesJour le jour : une fournée de la recette du jour, à la part 0,25, vaut plusieurs minutes)
    const brut = rec ? o.gain : revenuFournee(q, i), r60 = Math.max(1e-9, rythme(q) * 60);
    const m = Math.max(0, Math.min(brut / r60, PARFAIT.minutes - M.h.minParfaits, PARFAIT.minutesJour - M.j.minParfaits)), prime = m > 0 ? Math.min(brut, arrondi(Math.max(1, r60 * m))) : 0;
    M.h.parfaits++; M.j.parfaits++; M.h.minParfaits += m; M.j.minParfaits += m;
    if (prime > 0) { gagner(q, prime); b.gain += prime; b.min += m; }
    return { ok: true, parfait: true, prime, part, plafond: m < brut / r60 - 1e-9 };
  }

  // ─── 4. les apparitions ───
  function attraperApparition(q, id) {
    const M = q.manoir, a = M && M.apps.find((x) => x.id === id); if (!a || !(a.fin > q.now)) return { ok: false };
    M.apps.splice(M.apps.indexOf(a), 1); M.serie++; q.stats.apparitions++; toucher(q, q.now);
    const mult = M.serie >= APPARITIONS.serie ? APPARITIONS.mult : 1, p = payerMinutes(q, 'apparitions', APPARITIONS.minutes * mult);
    return { ok: true, prime: p.gain, plafond: p.plafond, serie: M.serie, mult, type: a.type, apparition: a };
  }

  // ─── 5. les commandes de la nuit ───
  function lancerCommande(q, now) { // une commande tirée parmi les postes ouverts (null : aucun ne peut la faire) ; une seule à la fois
    const M = q.manoir; if (M.commande) return null;
    const duree = COMMANDES.durees[Math.floor(hasard(M) * COMMANDES.durees.length)];
    const ok = q.postes.map((s, i) => i).filter((i) => q.postes[i].niv > 0 && PRODUITS[i].temps * 3 <= duree * 60); if (!ok.length) return null;
    const i = ok[Math.floor(hasard(M) * ok.length)], s = q.postes[i], n = Math.max(1, arrondi(duree * 60 / PRODUITS[i].temps * (s.staff ? COMMANDES.staff : COMMANDES.main)));
    M.commande = { id: ++M.seqCommande, i, n, fait: 0, duree, debut: now, fin: now + duree * 60e3, minutes: duree * COMMANDES.part };
    return M.commande;
  }
  const commandeManoir = (q) => (q.manoir ? q.manoir.commande : null);
  const primeCommande = (q) => { const c = commandeManoir(q); return c ? arrondi(Math.max(1, rythme(q) * c.minutes * 60)) : 0; }; // ce qu'elle paierait livrée maintenant (avant les plafonds)
  function livrerCommande(q) { // au bouton : toutes les friandises faites, avant l'heure
    const M = q.manoir, c = M && M.commande; if (!c || c.fait < c.n || !(q.now < c.fin)) return { ok: false };
    M.commande = null; M.prochaineCommande = q.now + entre(M, COMMANDES.pause) * 1000; q.stats.commandes++; toucher(q, q.now);
    const p = payerMinutes(q, 'commandes', c.minutes); note(q, `Commande de la nuit livrée : +${fmt(p.gain)} bonbons`);
    return { ok: true, prime: p.gain, plafond: p.plafond, commande: c };
  }

  // ─── le pas du Manoir (dans tick) : départs, arrivées ; et l'oubli après une longue sortie ───
  function pasManoir(q, now) {
    const M = q.manoir, o = { arrives: [], partis: [], apparitions: [], perdues: [], commande: null, ratee: null };
    if (!M) return o;
    for (const c of M.file.slice()) if (now - c.arrive >= CLIENTS.patience * 1000) { M.file.splice(M.file.indexOf(c), 1); q.stats.clientsPartis++; o.partis.push(c.id); } // il a trop attendu : il part, c'est tout
    for (const a of M.apps.slice()) if (now >= a.fin) { M.apps.splice(M.apps.indexOf(a), 1); M.serie = 0; q.stats.apparitionsRatees++; o.perdues.push(a.id); }
    if (M.commande && now >= M.commande.fin) { o.ratee = M.commande; M.commande = null; q.stats.commandesRatees++; M.prochaineCommande = now + entre(M, COMMANDES.pause) * 1000; }
    if (!manoirOuvert(now)) return o;
    if (!(M.prochainClient > 0)) M.prochainClient = now + 2000; // le premier, deux secondes après l'ouverture
    else if (now >= M.prochainClient) { if (M.file.length < CLIENTS.file) { const c = nouveauClient(q, now); if (c) o.arrives.push(c); } M.prochainClient = now + entre(M, CLIENTS.arrivee) * 1000; }
    if (!(M.prochaineApp > 0)) M.prochaineApp = now + entre(M, APPARITIONS.intervalle) * 1000;
    else if (now >= M.prochaineApp) {
      const a = { id: ++M.seqApp, type: TYPES_APPARITION[Math.floor(hasard(M) * TYPES_APPARITION.length)], debut: now, fin: now + entre(M, APPARITIONS.vie) * 1000 };
      M.apps.push(a); o.apparitions.push(a); M.prochaineApp = now + entre(M, APPARITIONS.intervalle) * 1000;
    }
    if (!M.commande) {
      if (!(M.prochaineCommande > 0)) M.prochaineCommande = now + COMMANDES.premiere * 1000;
      else if (now >= M.prochaineCommande) { o.commande = lancerCommande(q, now); if (!o.commande) M.prochaineCommande = now + 60e3; }
    }
    return o;
  }
  function oublierManoir(q, now, silence) { // une longue sortie (plus que PAUSE_EV) : la commande s'efface sans rien coûter ; à l'absence, la file et les apparitions aussi
    const M = q.manoir; if (!M) return;
    if (M.commande) { M.commande = null; M.prochaineCommande = now + COMMANDES.premiere * 1000; }
    if (silence) { M.file = []; M.apps = []; M.serie = 0; M.prochainClient = 0; M.prochaineApp = 0; }
  }

  // ─── les paliers franchis : ce qu'il reste à donner (chaque palier une seule fois, dans l'ordre) ───
  const paliersAtteints = (q) => PALIERS.filter((p) => q.total >= p.total);
  function paliersDus(q) { return PALIERS.filter((p) => q.total >= p.total && !q.paliers.includes(p.n)); }
  function marquerPalier(q, n) { // le palier n est réclamé : on note ce qu'il donne (l'interface le distribue dans la boulangerie)
    const p = PALIERS.find((x) => x.n === n); if (!p || q.paliers.includes(n) || q.total < p.total) return null;
    q.paliers.push(n);
    if (p.vetement && !q.vetements.includes(p.vetement)) q.vetements.push(p.vetement);
    if (p.deco && !q.decos.includes(p.deco)) q.decos.push(p.deco);
    if (p.chat) q.chat = true;
    if (p.etoiles) q.etoiles += p.etoiles; if (p.boost) q.boosts++; if (p.prime) q.heures = (q.heures || 0) + p.prime; // la prime : des heures du rythme de la boulangerie, versées par l'écran
    note(q, `Palier ${n} : ${p.titre}`);
    return p;
  }
  const ensembleComplet = (q) => VETEMENTS.every((v) => q.vetements.includes(v));
  const NOMS_DECOS = { citrouilles: 'des citrouilles sur le perron', toiles: 'des toiles d’araignée aux fenêtres', chaudron: 'un chaudron qui bouillonne', bestiaire: 'l’étagère aux bocaux de monstres (le bestiaire)' };
  const NOMS_VETEMENTS = { 'hantee-chapeau': 'chapeau pointu de sorcière', 'hantee-cape': 'cape de minuit', 'hantee-bottes': 'bottes qui claquent', 'hantee-lanterne': 'citrouille-lanterne (la tenue complète)', 'hantee-lueur-chapeau': 'le chapeau phosphorescent (le trophée)' };
  function phrasePalier(p) { // ce que donne un palier, en une ligne
    const l = [];
    if (p.etoiles) l.push(`${p.etoiles} étoile${p.etoiles > 1 ? 's' : ''}`);
    if (p.boost) l.push(`boost ×${p.boost.mult} ${fmtDuree(p.boost.secs)}`);
    if (p.prime) l.push(`${p.prime} h de gains`);
    if (p.chat) l.push('le chat noir');
    if (p.deco) l.push(NOMS_DECOS[p.deco]);
    if (p.vetement) l.push(NOMS_VETEMENTS[p.vetement]);
    return l.join(' · ');
  }

  // ─── un pas de jeu dans le Manoir (dt en secondes, nowMs sur l'horloge de confiance) ───
  const TROU = 10000, REPRISE = 90; // un trou de plus de 10 s entre deux pas (téléphone verrouillé, autre appli) : c'était une absence
  // une sortie de 10 min au plus (l'appli quittée sans le vouloir, l'écran refermé un instant) : le coup de pouce en cours, et le boost de
  // l'événement s'il y en a un, sont EN PAUSE : leurs échéances avancent de la durée de la sortie, on les retrouve tels quels au retour
  const PAUSE_EV = 600e3; // la même que celle de la boutique (G.PAUSE_EV, 600 s, src/game.js), en millisecondes : ce fichier ne dépend pas de game.js
  function pauseCoup(q, ms) { if (!(ms > 0)) return; for (const o of [q.ev, q.boost, q.manoir && q.manoir.commande]) if (o && typeof o === 'object') for (const k of ['debut', 'fin']) if (Number.isFinite(o[k])) o[k] += ms; } // (lot 6 : la commande de la nuit aussi)
  function tick(q, dt, nowMs, rnd) {
    rnd = rnd || Math.random;
    if (q.now && nowMs - q.now > TROU) { // un trou : une courte sortie (PAUSE_EV) met le coup de pouce en pause ; plus longue, il s'efface sans pénalité (pas de descente ratée sans toi), et rien ne surgit au retour
      const ecart = nowMs - q.now;
      if (ecart <= PAUSE_EV) pauseCoup(q, ecart); else { q.ev = null; q.evTimer = Math.max(q.evTimer, REPRISE + rnd() * 60); oublierManoir(q, nowMs); }
    }
    q.now = nowMs;
    const out = { ventes: [], nouvelEv: null, finEv: null, paliers: [], manoir: null };
    const cmd = q.manoir && q.manoir.commande; // lot 6 : la commande de la nuit compte les ventes de sa friandise (comme le cortège)
    q.postes.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(q, i); s.prog += dt; if (s.prog < T) return;
      let n = Math.floor(s.prog / T);
      if (!s.staff) { n = 1; s.prog = 0; s.actif = false; } else s.prog -= n * T;
      const m = revenuFournee(q, i) * n; gagner(q, m); q.stats.ventes += n; q.stats.vendus[i] += n;
      if (q.ev && q.ev.type === 'grosclient' && q.ev.i === i) q.ev.fait = Math.min(q.ev.n, q.ev.fait + n);
      if (cmd && cmd.i === i) cmd.fait = Math.min(cmd.n, cmd.fait + n);
      out.ventes.push({ i, montant: m, n });
    });
    out.manoir = pasManoir(q, nowMs); // lot 6 : les clients-monstres, les apparitions, la commande de la nuit (leurs arrivées et départs, pour l'écran)
    if (q.ev && q.ev.fin <= nowMs && !(q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n)) { out.finEv = q.ev; out.fin = finEvenement(q, q.ev); q.ev = null; }
    if (!q.ev) { q.evTimer -= dt; if (q.evTimer <= 0) { q.evTimer = 120 + rnd() * 180; out.nouvelEv = lancerEvenement(q, rnd); } }
    out.paliers = paliersDus(q);
    return out;
  }
  // ─── l'absence : les monstres ont travaillé (8 h au plus, 12 h sous la couette), les fournées en cours se terminent ; pas de coup de pouce sans toi ───
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
    if (court) { q.ev = garde.ev; pauseCoup(q, ecart); } else { q.evTimer = Math.max(q.evTimer || 0, REPRISE); oublierManoir(q, nowMs, true); }
    q.lastSeen = nowMs; q.actif = nowMs; // lot 6 : revenir, c'est être là (le Manoir se réveille) ; l'absence ne paie aucune des activités du Manoir
    return { secs, total, detail };
  }

  // ─── la simulation du rythme (pour les tests et le réglage des paliers) : des sessions par jour, une politique gloutonne ───
  const PROFILS = { // comme test/longevite.js : les heures de Paris des sessions et leur durée en minutes
    assidu: { sessions: [[7.5, 15], [12.25, 15], [18, 20], [22, 30]] },
    quotidien: { sessions: [[7.75, 8], [12.5, 8], [21, 20]] },
    occasionnel: { sessions: [[8, 5], [20.5, 12]] },
    marathon: { sessions: [[0, 714], [12, 714]] }, // 23 h 48 sur 24 (deux sessions, l'une à midi) : l'enveloppe du serveur
    tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]] }, // 8 h par jour : le 12e au 2e jour, comme les plus mordus (puis les paliers bonus)
  };
  // lot 6 : comment chaque profil joue le Manoir. Le marathon et le très actif jouent tout au mieux (le pire cas de l'enveloppe) : toujours là
  // (le ×6 ne s'endort jamais), chaque client servi (reaction : secondes avant la première ligne, puis une par seconde), chaque apparition
  // attrapée, chaque fournée parfaite, chaque commande livrée. Les autres ont des trous (trous : chaque seconde, la chance de lever les yeux
  // du téléphone, de « de » à « a » secondes : ni toucher, ni achat, ni fournée lancée ; le ×6 s'endort), et servent, attrapent, réussissent
  // une part de ce qui passe. opts.manoir === false : comme avant le lot 6 (toujours là, aucune de ces activités jouée).
  const JEU_MANOIR = {
    marathon: { trous: null, sert: 1, attrape: 1, parfait: 1, reaction: 2 },
    tresactif: { trous: null, sert: 1, attrape: 1, parfait: 1, reaction: 2 },
    assidu: { trous: { chance: 1 / 300, de: 60, a: 300 }, sert: 0.8, attrape: 0.75, parfait: 0.6, reaction: 4 },
    quotidien: { trous: { chance: 1 / 240, de: 60, a: 300 }, sert: 0.7, attrape: 0.65, parfait: 0.5, reaction: 5 },
    occasionnel: { trous: { chance: 1 / 180, de: 60, a: 300 }, sert: 0.6, attrape: 0.55, parfait: 0.4, reaction: 6 },
  };
  function jouerManoir(q, now, pol, rnd, vu) { // une seconde de jeu : servir, attraper, réussir les fournées, livrer (vu : les décisions déjà tirées)
    const M = q.manoir;
    for (const c of M.file.slice()) {
      let d = vu.get('c' + c.id); if (d === undefined) { d = rnd() < pol.sert ? c.arrive + pol.reaction * 1000 : -1; vu.set('c' + c.id, d); }
      if (d >= 0 && now >= d) { const l = c.commande.find((x) => !x.servi); if (l) servir(q, c.id, l.i); }
    }
    for (const a of M.apps.slice()) {
      let d = vu.get('a' + a.id); if (d === undefined) { d = rnd() < pol.attrape ? a.debut + (1 + 2 * rnd()) * 1000 : -1; vu.set('a' + a.id, d); }
      if (d >= 0 && now >= d && now < a.fin) attraperApparition(q, a.id);
    }
    if (M.commande && M.commande.fait >= M.commande.n) livrerCommande(q);
    const viser = (i, o, debut, T, cle) => { // toucher au milieu de la fenêtre, s'il tombe dans la seconde qui vient
      const w = fenetreParfait(q, i); if (!w || o.essai) return;
      let d = vu.get(cle); if (d === undefined) { d = rnd() < pol.parfait; vu.set(cle, d); } if (!d) return;
      const t = debut + (w.debut + PARFAIT.largeur / 2) * T * 1000; if (t >= now && t < now + 1000) parfait(q, i, t);
    };
    q.postes.forEach((s, i) => { if (s.niv > 0 && !s.staff && s.actif && PRODUITS[i].temps >= PARFAIT.tempsMin) viser(i, s, now - s.prog * 1000, PRODUITS[i].temps, `p${i}|${s.lance}`); });
    const fo = q.recettes && q.recettes.four; if (fo) viser(-1, fo, fo.debut, (fo.fin - fo.debut) / 1000, `r${fo.debut}`);
    if (vu.size > 4000) vu.clear(); // (les décisions passées ne servent plus : celles en cours se retirent, au même hasard près)
  }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function decider(q) { // acheter : monstre, déblocage, sortilège, puis le meilleur rapport gain / prix
    let fait = false;
    for (let i = 0; i < PRODUITS.length; i++) { const s = q.postes[i]; if (s.niv > 0 && !s.staff && q.billets >= prixStaff(q, i)) { embaucher(q, i); fait = true; } }
    for (let i = 1; i < PRODUITS.length; i++) { const s = q.postes[i]; if (s.niv === 0 && q.postes[i - 1].niv > 0 && recetteOuverte(q, i) && q.billets >= PRODUITS[i].debloquer) { acheter(q, i); fait = true; break; } }
    for (const a of AMELIORATIONS) if (!q.ameliorations[a.id] && combineOuverte(q, a) && q.billets >= a.cout * 1.2) { amelioration(q, a.id); fait = true; }
    const next = q.postes.findIndex((s, i) => s.niv === 0 && recetteOuverte(q, i)), taux = tauxParSeconde(q); // une recette encore fermée (avant son palier) : on n'économise pas pour elle
    if (next > 0 && q.billets < PRODUITS[next].debloquer && q.billets + taux * 600 >= PRODUITS[next].debloquer) return fait; // on économise pour la prochaine friandise
    const vise = AMELIORATIONS.find((a) => a.apres && !q.ameliorations[a.id] && combineOuverte(q, a)); // après le maître : on met de côté pour le Sortilège suivant (huit heures de ventes au plus)
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
  function simuler(profil, jours, opts) { // rend { total, parJour: [{ j, total, billets, taux }], paliersJour: { n: jour }, trace: [{ t (jours depuis l'ouverture), total }] } ; opts : { graine, debut, offertes, activites, recette } (recette : false, sans la recette du jour ; true, jouée même par un profil qui ne la joue pas d'office)
    opts = opts || {}; const prof = PROFILS[profil] || PROFILS.assidu, rnd = mulberry32(opts.graine || 7), st = {}, t0 = opts.debut || DEBUT;
    const jeu = opts.activites === false ? null : A.politique(profil, opts.recette), rndA = mulberry32((opts.graine || 7) + 101); // les activités, jouées comme ce profil (leur propre hasard : les coups de pouce ne changent pas)
    const pm = opts.manoir === false ? null : JEU_MANOIR[profil] || JEU_MANOIR.assidu, rndM = mulberry32((opts.graine || 7) + 303), rndT = mulberry32((opts.graine || 7) + 404), vu = new Map(); let reveil = 0; // lot 6 : le Manoir, joué comme ce profil (son propre hasard)
    const q = etat(st, t0), parJour = [], paliersJour = {}, trace = []; q.lastSeen = t0;
    const H = 3600e3, nJ = jours || JOURS;
    const minuit0 = t0 - (paris(t0).getUTCHours() * 3600e3 + paris(t0).getUTCMinutes() * 60e3); // minuit, heure de Paris, du premier jour
    for (let j = 0; j < nJ; j++) {
      const jourDebut = minuit0 + j * JOUR;
      for (const [h, minutes] of prof.sessions) {
        const debut = jourDebut + h * H; // les sessions sont des heures de Paris ; le premier jour, l'événement ouvre à midi : celles du matin sont perdues
        if (debut < t0 || debut >= FIN) continue;
        absence(q, debut);
        for (let s = 0; s < minutes * 60; s++) {
          const now = debut + s * 1000; if (now >= FIN) break;
          let la = true; // lot 6 : le joueur est-il là (un trou : il a levé les yeux du téléphone) ?
          if (pm && pm.trous) { if (now < reveil) la = false; else if (rndT() < pm.trous.chance) { reveil = now + (pm.trous.de + (pm.trous.a - pm.trous.de) * rndT()) * 1000; la = false; } } // (les trous ont leur hasard à eux)
          if (la) toucher(q, now);
          let lances = 0; if (la) q.postes.forEach((x, i) => { if (x.niv > 0 && !x.staff && !x.actif && lances < 2) { lancer(q, i); lances++; } });
          const out = tick(q, 1, now, rnd);
          if (q.ev && la) {
            if (q.ev.type === 'descente') { planquer(q); if (rnd() < 0.7) planquer(q); }
            else if (q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n) livrer(q);
            else if (q.ev.type === 'scooter' && rnd() < 0.5) attraper(q);
          }
          for (const p of out.paliers) { marquerPalier(q, p.n); paliersJour[p.n] = j + 1; if (opts.offertes && p.n === PALIERS_BOSS) for (const a of AMELIORATIONS) if (a.apres) q.ameliorations[a.id] = true; } // offertes : le pire cas de l'enveloppe (tous les Sortilèges dès le 12e, sans les payer)
          if (jeu) A.sim.recette(q, now, jeu); // la recette du jour, chaque seconde (avant les achats : elle passe d'abord ; comme les autres activités de src/activites.js, jouée selon sa politique, trous ou pas)
          if (pm && la) jouerManoir(q, now, pm, rndM, vu);
          if (la && s % 3 === 0) decider(q);
          if (jeu && s % 20 === 0) A.sim.pas(q, now, jeu, rndA);
          if (s % 60 === 0) trace.push({ t: (now - t0) / JOUR, total: q.total });
        }
        q.lastSeen = Math.min(debut + minutes * 60e3, FIN); if (jeu) A.sim.fin(q, Math.min(q.lastSeen, FIN - 1), jeu, rndA); trace.push({ t: (q.lastSeen - t0) / JOUR, total: q.total });
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
  const fmtDevise = (n) => `${fmt(n)} bonbon${Math.abs(n) >= 2 ? 's' : ''}`;
  const fmtEur = fmtDevise; // le nom du Quartier : le moteur d'écran écrit la monnaie de l'événement actif avec fmtEur
  function fmtDuree(s) { if (s < 59.5) return Math.round(s) + ' s'; const mn = Math.round(s / 60); if (mn < 60) return mn + ' min'; const h = Math.floor(mn / 60), m = mn % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  const fmtChrono = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
  function fmtReste(ms) { // « 6 j 4 h », « 4 h 12 », « 12 min »
    const mn = Math.max(0, Math.round(ms / 60e3)), j = Math.floor(mn / 1440), h = Math.floor((mn % 1440) / 60), m = mn % 60;
    if (j > 0) return `${j} j ${h} h`; if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`; return `${m} min`;
  }

  // ─── la fiche de l'événement (voir l'en-tête) ───
  const BONBON_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 14 15 21 8 24 15 27 8 34 4 24Z" fill="#8E5CF7"/><path d="M40 14 33 21 40 24 33 27 40 34 44 24Z" fill="#8E5CF7"/><circle cx="24" cy="24" r="10" fill="#FF8A1F"/><path d="M17 20c4 3 10 3 14 0M17 28c4-3 10-3 14 0" stroke="#FFE7C2" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';
  const FICHE = {
    id: 'hantee', nom: 'La Maison hantée', lieu: 'le Manoir', Lieu: 'Le Manoir', adulte: false, cle: 'hantee',
    classement: { periode: 'hantee', onglet: 'Halloween', evt: 'hantee' },
    devise: { nom: 'bonbons', un: 'bonbon', icone: 'bonbons', svg: BONBON_SVG },
    couleurs: { nuit: '#1B1530', nuit2: '#2A2047', citrouille: '#FF8A1F', violet: '#8E5CF7', slime: '#7CD992', lune: '#FFE7A3', texte: '#F6EEDD', doux: '#B9AED6' },
    dates: { debut: DEBUT, fin: FIN, texteDebut: 'mardi 27 octobre à midi', texteFin: 'lundi 2 novembre à 20 h' },
    produits: PRODUITS, paliers: PALIERS, ameliorations: AMELIORATIONS,
    evenements: {
      descente: { nom: 'Une nuée de chauves-souris !', annonce: 'Des chauves-souris foncent sur les bonbons : chasse-les, vite !', action: 'chasser', bouton: 'Ouste !', detail: (ev) => `${ev.n} touches pour les chasser · prime ${fmtDevise(ev.prime)} · sinon elles emportent ${fmtDevise(ev.enjeu)}`, fin: 'Les chauves-souris sont reparties avec leur butin.' },
      grosclient: { nom: 'Un cortège d’enfants déguisés', annonce: 'Un cortège d’enfants déguisés frappe à la porte : « Des bonbons ou un sort ! »', action: 'servir', bouton: 'Servir !', detail: (ev) => `${ev.n} ${PRODUITS[ev.i] ? PRODUITS[ev.i].pl : ''} · prime ${fmtDevise(ev.prime)}`, fin: 'Le cortège est allé sonner ailleurs.' },
      soiree: { nom: 'La pleine lune', annonce: 'Pleine lune sur le Manoir : tout se vend ×2 !', action: null, bouton: null, detail: () => `Toutes les ventes ×${EVENEMENTS.soiree.mult}`, fin: 'La lune se cache derrière un nuage.' },
      scooter: { nom: 'Le balai de la sorcière', annonce: 'Le balai de la sorcière passe en rase-motte : attrape le sac de bonbons !', action: 'attraper', bouton: 'Attraper', detail: (ev) => `Attrape le sac avant qu’il reparte : ${fmtDevise(ev.prime)}`, fin: 'Le balai est reparti dans la nuit.' },
    },
    vetements: { 'hantee-chapeau': { nom: 'Chapeau pointu', piece: 'tete', forme: 'chapeau' }, 'hantee-cape': { nom: 'Cape de minuit', piece: 'haut', forme: 'cape' }, 'hantee-bottes': { nom: 'Bottes qui claquent', piece: 'pieds', forme: 'bottes' }, 'hantee-lanterne': { nom: 'Citrouille-lanterne', piece: 'accessoire', forme: 'lanterne' }, 'hantee-lueur-chapeau': { nom: 'Chapeau phosphorescent', piece: 'tete', forme: 'chapeau' } },
    decos: NOMS_DECOS, chat: 'noir',
    textes: {
      titre: 'La Maison hantée', sousTitre: 'Le Manoir · Halloween',
      annonceTitre: 'La Maison hantée ouvre ses portes !',
      annonce: 'Jusqu’au lundi 2 novembre à 20 h : une boutique à part, « le Manoir », où tout le monde part de zéro. Ses bonbons rapportent des récompenses pour ta boulangerie : étoiles, boosts, décos d’Halloween, le chat noir et une tenue de sorcière à vie.',
      ouvrir: 'Entrer dans le Manoir', fermer: 'Retour à la boulangerie', ameliorations: 'Sortilèges', equipe: 'Les monstres', manuel: 'Touche !',
      absence: (dur, montant) => `Pendant ton absence (${dur}) : +${montant}, les monstres ont travaillé au ralenti.`,
      bilanTitre: 'Bilan de la Maison hantée', bilan: 'Le Manoir a fermé ses volets. Tout ce que tu as gagné reste à vie.',
      palier12: 'Le maître du Manoir, c’est toi. Tout ça reste à vie, même après Halloween.',
      paliersNote: 'Les boosts se lancent quand tu veux dans la boutique (la pastille sous les objectifs). Les heures de gains tombent tout de suite dans la caisse de la boulangerie. La tenue d’Halloween se porte depuis la garde-robe du boulanger, et le chat noir se choisit dans la garde-robe ou les Réglages.',
      ferme: 'Le Manoir est fermé.', classementInfo: 'Les bonbons gagnés au Manoir · podium final le 2 nov. à 20 h', classementFini: 'La Maison hantée est finie : le podium final est figé',
      vide: 'Personne encore au Manoir', videSous: 'Les bonbons du Manoir arrivent avec le prochain envoi.', podium: (rang) => `${rang === 1 ? '1er' : rang + 'e'} du Manoir`,
      podiumFinal: 'Podium final de la Maison hantée : la tenue d’Halloween en or est dans ta garde-robe !',
    },
    // lot 6 : les mots des activités du Manoir (le ×6 qui s'endort, les clients-monstres, les fournées parfaites, les apparitions, les
    // commandes de la nuit) ; sortes : les neuf clients (les mêmes clés que la scène), apparitions : les trois qui traversent la boutique
    manoir: {
      sortes: NOMS_SORTES, courts: NOMS_COURTS,
      apparitions: { fantome: 'Un petit fantôme', citrouille: 'Une citrouille volante', 'chauve-souris': 'Une chauve-souris' },
      textes: {
        jauge: 'Réveillé : ×6 avec toi', jaugeBasse: 'Le boss s’endort…', jaugeDort: 'Le boss dort : touche !', reveil: 'Zzz… touche le Manoir pour le réveiller', jaugeNote: 'Tant que tu touches, tout se vend ×6. Sans toi, ça retombe peu à peu.',
        clients: 'Les clients-monstres', servi: (m) => `Merci ! +${m}`, parti: 'Il en a eu assez d’attendre.', faux: 'Ce n’est pas sa commande !',
        parfait: 'Fournée parfaite ! ×2', parfaitRate: 'Pas cette fois : la prochaine sera la bonne.', parfaitNote: 'Touche la fournée quand elle brille.',
        apparition: 'Attrape-la !', serie: (n) => `Série de ${n} : ×1,5`, attrape: (m) => `Attrapée ! +${m}`,
        commandeTitre: 'La commande de la nuit', commande: (c) => `${fmt(c.n)} ${PRODUITS[c.i] ? PRODUITS[c.i].pl : 'friandises'} en ${c.duree} min`, livrer: 'Livrer !',
        commandeLivree: (m) => `Commande livrée : +${m}`, commandeRatee: 'Trop tard : la commande est partie chez les voisins.',
        plafond: 'Pour le plaisir : le plein de l’heure est fait',
        // le bestiaire (6) : la carte du tiroir, sa feuille, le petit mot à chaque servi, la fête d'une sorte complétée
        bestiaire: 'Le bestiaire', bestiaireSous: 'Sers dix clients de chaque sorte de monstre pour les ajouter au bestiaire.',
        bestiaireAvance: (nom, n, par) => `${nom} ${n}/${par}`, bestiaireFait: (nom) => `${nom} rejoint le bestiaire !`,
        bestiaireDeco: 'l’étagère aux bocaux de monstres, accrochée au mur de ta boutique', bestiaireCompagnon: 'Myrtille la chauve-souris, un compagnon pour ta boutique (à choisir dans « Les compagnons »)',
      },
    },
    // les activités (src/activites.js) : l'habillage d'Halloween ; les réglages des gains sont ceux du moteur commun (l'enveloppe du serveur)
    activites: {
      jeux: {
        guet: { nom: 'Le guet', desc: 'Éclaire le petit fantôme quand il passe devant la lanterne.', regles: ['Un petit fantôme flotte dans le couloir : touche quand il passe devant la lanterne.', 'Pile dans la lueur : bouh parfait, et le combo grimpe.', 'Trop tôt ou trop tard, le combo retombe. Et il file de plus en plus vite !'], consigne: 'Touche quand il est dans la lueur !' },
        compte: { nom: 'Le compte', desc: 'Compte les bonbons d’un coup d’œil.', regles: ['Des bonbons tombent du chaudron, une seconde à peine.', 'Combien y en avait-il ? Touche le bon nombre.', 'Vite et juste : la série rapporte plus. Quarante secondes.'], consigne: 'Combien de bonbons ?', objets: 'bonbons' },
        tournee: { nom: 'La tournée', desc: 'Trace la tournée des bonbons, citrouille après citrouille.', regles: ['Six citrouilles numérotées : relie-les au doigt, dans l’ordre.', 'Tu peux lever le doigt et reprendre où tu t’es arrêté.', 'Trois tournées de douze secondes : plus tu es rapide, plus ça paie.'], consigne: 'Relie les citrouilles dans l’ordre !' },
      },
      decor: { motif: 'hantee', fond: '#1F1A2E', sol: '#2E2742', accent: '#FF8A1F', accent2: '#7CD992', clair: '#B9AED6', texte: '#F6EEDD' },
      contrats: { textes: {
        descentes: (n) => `Chasse ${n} nuée${n > 1 ? 's' : ''} de chauves-souris`, grosClients: (n) => `Sers ${n} cortège${n > 1 ? 's' : ''} d’enfants déguisés`,
        scooters: (n) => `Attrape ${n} fois le sac du balai`, soirees: (n) => `Profite de ${n} pleine${n > 1 ? 's' : ''} lune${n > 1 ? 's' : ''} jusqu’au bout`,
        vente: (n, p) => `Vends ${n} ${p ? p.pl : 'friandises'}`, mini: (n) => `Réussis ${n} mini-jeu${n > 1 ? 'x' : ''} (la moitié des points au moins)`,
        operation: (n) => `Réussis ${n} opération${n > 1 ? 's' : ''} bonbons sans rien perdre` } },
      operations: [
        { id: 'court', nom: 'Le tour de la rue', desc: 'Cinq minutes de porte-à-porte. Presque rien ne peut arriver.' },
        { id: 'moyen', nom: 'Le tour du village', desc: 'Un quart d’heure de sonnettes, sacs bien serrés.' },
        { id: 'long', nom: 'La grande tournée de la forêt', desc: 'Une heure au clair de lune : le plus gros sac, et des chauves-souris gourmandes.' },
      ],
      textes: { saisie: 'Des chauves-souris gourmandes', saisieTxt: (m) => `Des chauves-souris gourmandes ont chipé ${m}.`, operation: 'Opération', enCours: 'Les monstres font du porte-à-porte', recette: 'La recette du jour', cuisine: 'La cuisine du Manoir' },
      // la recette du jour (src/activites.js, RECETTE_JOUR) : la cuisine du Manoir, une recette par jour ; courtes (20 à 50 s : l'événement
      // dure sept jours, l'occasionnel atteint la première étape) ; à la 500e fournée, la toque-citrouille
      recettes: [
        { id: 'meringues-fantomes', nom: 'Les meringues fantômes', desc: 'Deux yeux en chocolat et un « bouh » tout doux.', temps: 20, icone: 'meringues-fantomes' },
        { id: 'barbe-toile', nom: 'La barbe à papa toile d’araignée', desc: 'Une araignée très gentille la file, un tour après l’autre.', temps: 25, icone: 'barbe-toile' },
        { id: 'soupe-citrouille', nom: 'La soupe de citrouille', desc: 'Orange, onctueuse, et elle fait des bulles toute seule.', temps: 30, icone: 'soupe-citrouille' },
        { id: 'cookies-chauve-souris', nom: 'Les cookies chauves-souris', desc: 'Les ailes en chocolat, les yeux en sucre.', temps: 35, icone: 'cookies-chauve-souris' },
        { id: 'chapeaux-sorciere', nom: 'Les chapeaux de sorcière', desc: 'Un biscuit, un cône en chocolat et une étoile en sucre.', temps: 40, icone: 'chapeaux-sorciere' },
        { id: 'pommes-ver', nom: 'Les pommes d’amour du Manoir', desc: 'Rouges, brillantes, et un ver en gélatine qui fait coucou.', temps: 45, icone: 'pommes-ver' },
        { id: 'potion-chocolat', nom: 'La potion chocolatée', desc: 'Un chocolat chaud à la pomme verte, qui fume dans le chaudron.', temps: 50, icone: 'potion-chocolat' },
      ],
      recetteDeco: 'toque-citrouille', recetteDecoTxt: 'la toque-citrouille du chef du Manoir, accrochée à la porte de l’arrière-boutique',
    },
  };
  const A = ACT.equiper({ id: 'hantee', rythme, gagner, note, dayKey, fmt: fmtDevise, arrondi, fenetre, PRODUITS, boostMult, remise, debut: DEBUT }, FICHE.activites); // les activités (src/activites.js)

  // ─── les récompenses version 2 (src/activites.js, RECOMPENSES) : ce qu'une combine paie à la boulangerie ; la revue d'une vieille sauvegarde ───
  const R2 = ACT.RECOMPENSES;
  const phraseCombine = (a) => R2.phraseLot(R2.lotCombine(a)); // « + 16 h de gains à la boulangerie, +2 ★ » ('' : une combine d'avant le boss)
  const revueRecompenses = (q) => R2.revue(q, PALIERS, AMELIORATIONS, ANCIENS); // une fois (q.recompensesV2) : la différence avec les anciennes

  return { FICHE, ...A.api, ANCIENS, phraseCombine, revueRecompenses, lotCombine: R2.lotCombine, phraseLot: R2.phraseLot, DEBUT, FIN, CLASSEMENT_JUSQUA, JOUR, JOURS, GRACE, fenetreSure, envoiBonbons, envoiBillets: envoiBonbons, ABSENCE_PART, PRESENCE, REPUTATION, reputationMult, fenetre, decalageParis, paris, parisMs, dayKey, PRODUITS, PALIERS_POSTE, AMELIORATIONS, ABSENCE_MAX_H, EVENEMENTS, PALIERS, PALIERS_BOSS, TROPHEE, VETEMENTS, VETEMENTS_OR, DECOS,
    PAUSE_EV, pauseCoup, neuf, etat, bonbons, palierMult, prochainPalier, gainPalier, exposantPalier, paliersPoste, PALIERS_EXPOSANTS, ameliorationMult, boostMult, temps, revenuBase, revenu, revenuFournee, coutNiveau, coutNiveaux, maxNiveaux, remise, maxAchetables, recetteOuverte, quantite, prixNiveaux, prixStaff, tauxBase, tauxParSeconde, rythme, arrondi, heuresAbsence, partAbsence, effet, combineOuverte,
    gagner, acheter, embaucher, lancer, amelioration, lancerEvenement, planquer, chasser: planquer, livrer, attraper, tick, absence, paliersAtteints, paliersDus, marquerPalier, ensembleComplet, phrasePalier,
    PROFILS, simuler, decider, fmt, fmtEur, fmtDevise, fmtDuree, fmtChrono, fmtReste,
    // lot 6 : le Manoir « qui choque » (voir plus haut, « des choses à FAIRE »)
    EVEIL, SORTES, NOMS_SORTES, NOMS_COURTS, CLIENTS, PARFAIT, TYPES_APPARITION, APPARITIONS, COMMANDES, JEU_MANOIR, manoirNeuf, reparerManoir, eveil, toucher, presence, plafondsManoir,
    clientsManoir, pourboire, servir, fenetreParfait, parfait, attraperApparition, lancerCommande, commandeManoir, primeCommande, livrerCommande, pasManoir,
    BESTIAIRE, bestiaire, verserBestiaire, bestiaireDus, reparerBestiaire };
});
