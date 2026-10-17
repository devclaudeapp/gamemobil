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
   guet », « Le compte », « La tournée », les contrats de la nuit, les opérations) ; leur API est exportée telle quelle, comme au Quartier. */
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
  // les Sortilèges), comme au Quartier : elles repartent du bas, leurs premiers niveaux tombent vite ; leurs gains restent petits devant
  // ceux des citrouilles (l'enveloppe du serveur, fournil_evts : le marathon simulé reste ×2 dessous).
  const PRODUITS = [
    { id: 'acidule', nom: 'Bonbons acidulés', pl: 'sachets de bonbons acidulés', cout: 4, debloquer: 0, rev: 1, temps: 1.5, croiss: 1.07, staff: 1500, staffNom: 'Hubert le fantôme', staffDesc: 'Il passe à travers les murs pour livrer plus vite. Il dit « Bouh » aux clients, poliment.', poste: 'Le grenier qui grince', desc: 'Ça pique la langue et ça fait faire des grimaces.' },
    { id: 'pomme', nom: 'Pommes d’amour', pl: 'pommes d’amour', cout: 60, debloquer: 120, rev: 20, temps: 3, croiss: 1.14, staff: 22500, staffNom: 'Ramsès la momie', staffDesc: 'Emballe chaque pomme comme elle s’emballe elle-même : avec beaucoup de bandelettes.', poste: 'La crypte du sous-sol', desc: 'Rouges, brillantes, et elles collent aux dents.' },
    { id: 'cookie', nom: 'Cookies fantômes', pl: 'cookies fantômes', cout: 720, debloquer: 1440, rev: 150, temps: 6, croiss: 1.13, staff: 150000, staffNom: 'Osvaldo le squelette', staffDesc: 'Pétrit avec ses doigts tout fins. Il n’a pas d’estomac, alors il ne goûte jamais.', poste: 'La cuisine aux casseroles volantes', desc: 'Ils disparaissent dès qu’on a le dos tourné.' },
    { id: 'toile', nom: 'Toiles d’araignée en sucre', pl: 'toiles d’araignée en sucre', cout: 8640, debloquer: 17280, rev: 1200, temps: 12, croiss: 1.12, staff: 750000, staffNom: 'Comte Vladimir', staffDesc: 'Un vampire très chic qui ne mord que dans la barbe à papa. Il travaille de nuit, forcément.', poste: 'La tour de l’horloge', desc: 'Filées par une araignée très gourmande. Elle a dit oui.' },
    { id: 'potion', nom: 'Potions fumantes', pl: 'potions fumantes', cout: 1e5, debloquer: 2e8, rev: 10000, temps: 24, croiss: 1.11, staff: 4e8, staffNom: 'Berthe la sorcière', staffDesc: 'Touille le chaudron en chantant faux. Les potions adorent ça.', poste: 'Le chaudron du salon', desc: 'Goût fraise-citrouille. La fumée verte est offerte.' },
    { id: 'citrouille', nom: 'Citrouilles sculptées', pl: 'citrouilles sculptées', cout: 1.2e6, debloquer: 1e10, rev: 9e4, temps: 96, croiss: 1.1, staff: 3e10, staffNom: 'Jack la Lanterne', staffDesc: 'Une citrouille qui sculpte des citrouilles. Elle a toujours le sourire, il est gravé.', poste: 'Le potager au clair de lune', desc: 'Chacune a sa grimace. Aucune ne se ressemble.' },
    { id: 'cimetiere', nom: 'Gâteaux du cimetière', pl: 'gâteaux du cimetière', apres: 13, cout: 1e12, debloquer: 2e13, rev: 1000, temps: 120, croiss: 1.02, staff: 5e13, staffNom: 'Gaston le loup-garou', staffDesc: 'Il ne se transforme qu’à l’heure du goûter. Il remue la pâte avec la queue, très proprement.', poste: 'Le petit cimetière du jardin', desc: 'Des vers en gélatine sortent de la terre en chocolat.' },
    { id: 'dragon', nom: 'Œufs de dragon en chocolat', pl: 'œufs de dragon en chocolat', apres: 16, cout: 1e13, debloquer: 2e14, rev: 8000, temps: 240, croiss: 1.025, staff: 5e14, staffNom: 'Bérénice la dragonne', staffDesc: 'Une toute petite dragonne qui couve les œufs pour les garder tièdes. Elle éternue des étincelles.', poste: 'Le donjon de la tour nord', desc: 'Ils sont tièdes et ils bougent un peu. C’est normal.' },
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
  // presque ; le marathon (24 h/24) n'atteint le 20e que le 6e ou le 7e jour. Ils ne font plus la réputation (REPUTATION ne compte que
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
      ev: null, evTimer: 150, dernierEv: '', boost: null, lastSeen: now, now, ouvertLe: 0, paliers: [], vetements: [], decos: [], recompensesV2: true, heures: 0, chat: false, etoiles: 0, boosts: 0,
      stats: { ventes: 0, taps: 0, descentes: 0, descentesRatees: 0, grosClients: 0, scooters: 0, soirees: 0, embauches: 0, saisi: 0 }, carnet: [], mini: null, contrats: null, operation: null };
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
  function boostMult(q) { let m = PRESENCE; if (q.ev && q.ev.type === 'soiree' && q.ev.fin > q.now) m *= EVENEMENTS.soiree.mult; return m; } // en ta présence
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
  function lancer(q, i) { const s = q.postes[i]; if (s.niv <= 0 || s.actif) return false; s.actif = true; s.prog = 0; q.stats.taps++; return true; }
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
  function attraper(q) { // le balai de la sorcière : on attrape le sac de bonbons avant qu'il reparte
    const ev = q.ev; if (!ev || ev.type !== 'scooter' || ev.fin <= q.now) return { ok: false };
    gagner(q, ev.prime); q.stats.scooters++; note(q, `Le balai a lâché +${fmt(ev.prime)} bonbons`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function finEvenement(q, ev) { // un coup de pouce qui finit sans toi : les chauves-souris emportent leur part de bonbons
    if (ev.type === 'descente') { const saisi = Math.min(q.billets, ev.enjeu || 0); q.billets -= saisi; q.stats.descentesRatees++; q.stats.saisi += saisi; note(q, `Les chauves-souris emportent ${fmt(saisi)} bonbons`); return { saisi }; }
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
    if (p.chat) q.chat = true;
    if (p.etoiles) q.etoiles += p.etoiles; if (p.boost) q.boosts++; if (p.prime) q.heures = (q.heures || 0) + p.prime; // la prime : des heures du rythme de la boulangerie, versées par l'écran
    note(q, `Palier ${n} : ${p.titre}`);
    return p;
  }
  const ensembleComplet = (q) => VETEMENTS.every((v) => q.vetements.includes(v));
  const NOMS_DECOS = { citrouilles: 'des citrouilles sur le perron', toiles: 'des toiles d’araignée aux fenêtres', chaudron: 'un chaudron qui bouillonne' };
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
    tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]] }, // 8 h par jour : le 12e au 2e jour, comme les plus mordus (puis les paliers bonus)
  };
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
  function simuler(profil, jours, opts) { // rend { total, parJour: [{ j, total, billets, taux }], paliersJour: { n: jour }, trace: [{ t (jours depuis l'ouverture), total }] } ; opts : { graine, debut, offertes }
    opts = opts || {}; const prof = PROFILS[profil] || PROFILS.assidu, rnd = mulberry32(opts.graine || 7), st = {}, t0 = opts.debut || DEBUT;
    const jeu = opts.activites === false ? null : A.politique(profil), rndA = mulberry32((opts.graine || 7) + 101); // les activités, jouées comme ce profil (leur propre hasard : les coups de pouce ne changent pas)
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
          let lances = 0; q.postes.forEach((x, i) => { if (x.niv > 0 && !x.staff && !x.actif && lances < 2) { lancer(q, i); lances++; } });
          const out = tick(q, 1, now, rnd);
          if (q.ev) {
            if (q.ev.type === 'descente') { planquer(q); if (rnd() < 0.7) planquer(q); }
            else if (q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n) livrer(q);
            else if (q.ev.type === 'scooter' && rnd() < 0.5) attraper(q);
          }
          for (const p of out.paliers) { marquerPalier(q, p.n); paliersJour[p.n] = j + 1; if (opts.offertes && p.n === PALIERS_BOSS) for (const a of AMELIORATIONS) if (a.apres) q.ameliorations[a.id] = true; } // offertes : le pire cas de l'enveloppe (tous les Sortilèges dès le 12e, sans les payer)
          if (s % 3 === 0) decider(q);
          if (jeu && s % 20 === 0) A.sim.pas(q, now, jeu, rndA);
          if (s % 60 === 0) trace.push({ t: (now - t0) / JOUR, total: q.total });
        }
        q.lastSeen = Math.min(debut + minutes * 60e3, FIN); if (jeu) A.sim.fin(q, Math.min(q.lastSeen, FIN - 1), jeu, rndA); trace.push({ t: (q.lastSeen - t0) / JOUR, total: q.total });
      }
      parJour.push({ j: j + 1, total: q.total, billets: q.billets, taux: tauxParSeconde(q), niv: q.postes.map((s) => s.niv), staff: q.postes.filter((s) => s.staff).length, remise: remise(q) });
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
      textes: { saisie: 'Des chauves-souris gourmandes', saisieTxt: (m) => `Des chauves-souris gourmandes ont chipé ${m}.`, operation: 'Opération', enCours: 'Les monstres font du porte-à-porte' },
    },
  };
  const A = ACT.equiper({ id: 'hantee', rythme, gagner, note, dayKey, fmt: fmtDevise, arrondi, fenetre, PRODUITS }, FICHE.activites); // les activités (src/activites.js)

  // ─── les récompenses version 2 (src/activites.js, RECOMPENSES) : ce qu'une combine paie à la boulangerie ; la revue d'une vieille sauvegarde ───
  const R2 = ACT.RECOMPENSES;
  const phraseCombine = (a) => R2.phraseLot(R2.lotCombine(a)); // « + 16 h de gains à la boulangerie, +2 ★ » ('' : une combine d'avant le boss)
  const revueRecompenses = (q) => R2.revue(q, PALIERS, AMELIORATIONS, ANCIENS); // une fois (q.recompensesV2) : la différence avec les anciennes

  return { FICHE, ...A.api, ANCIENS, phraseCombine, revueRecompenses, lotCombine: R2.lotCombine, phraseLot: R2.phraseLot, DEBUT, FIN, CLASSEMENT_JUSQUA, JOUR, JOURS, GRACE, fenetreSure, envoiBonbons, envoiBillets: envoiBonbons, ABSENCE_PART, PRESENCE, REPUTATION, reputationMult, fenetre, decalageParis, paris, parisMs, dayKey, PRODUITS, PALIERS_POSTE, AMELIORATIONS, ABSENCE_MAX_H, EVENEMENTS, PALIERS, PALIERS_BOSS, TROPHEE, VETEMENTS, VETEMENTS_OR, DECOS,
    PAUSE_EV, pauseCoup, neuf, etat, bonbons, palierMult, prochainPalier, gainPalier, exposantPalier, paliersPoste, PALIERS_EXPOSANTS, ameliorationMult, boostMult, temps, revenuBase, revenu, revenuFournee, coutNiveau, coutNiveaux, maxNiveaux, remise, maxAchetables, recetteOuverte, quantite, prixNiveaux, prixStaff, tauxBase, tauxParSeconde, rythme, arrondi, heuresAbsence, partAbsence, effet, combineOuverte,
    gagner, acheter, embaucher, lancer, amelioration, lancerEvenement, planquer, chasser: planquer, livrer, attraper, tick, absence, paliersAtteints, paliersDus, marquerPalier, ensembleComplet, phrasePalier,
    PROFILS, simuler, decider, fmt, fmtEur, fmtDevise, fmtDuree, fmtChrono, fmtReste };
});
