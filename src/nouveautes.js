/* LE FOURNIL — les nouveautés : le récap des mises à jour, pour le joueur (la pastille cadeau en haut, à côté de la cloche, et sa feuille).
   À CHAQUE MISE À JOUR VISIBLE PAR LE JOUEUR, on ajoute une entrée EN TÊTE de NOUVEAUTES (la plus récente d'abord) :
     { id: 'aaaa-mm-jj-x', date: 'aaaa-mm-jj', titre: '…', points: ['…', '…'] }
   - id : la date (heure de Paris) et une lettre ; deux entrées le même jour : 'a' pour la première, 'b' pour la suivante, etc. Les id se
     comparent comme des chaînes (src/ui.js : st.nouveautesVues garde l'id de la plus récente vue ; tout id plus grand est « Nouveau ») :
     on n'en change jamais un déjà publié, et on n'en invente pas un plus ancien que le dernier.
   - titre court, points en phrases simples, le ton du jeu, sans jargon (pas de SQL, de fichier ni de test : ce que le joueur voit et gagne).
   - les commits « Test : … », « CI : … », « Merge … » et le travail invisible ne sont pas des nouveautés.
   Une sauvegarde neuve voit tout comme vu, sauf la plus récente (vueNeuve). Le bandeau « Nouvelle version » recharge la page : la pastille
   montre alors son point si une entrée est apparue. test/fournil-nouveautes.cjs vérifie la liste (id uniques, dates triées) et l'écran.
   Aucune dépendance au DOM : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NOUVEAUTES = [
    {
      id: '2026-10-22-a', date: '2026-10-22', titre: 'Un classement plus juste, et du nouveau derrière la petite porte',
      points: [
        'À partir du lundi 26 octobre, jouer plus longtemps rapporte enfin plus de points : au-delà d’une heure, tes points continuent (de moins en moins vite), et réussir un pétrissage, éviter une descente, servir un client mystère, livrer une grosse commande, réclamer un objectif du jour ou franchir un palier d’événement en rapportent. L’Atelier compte chaque jour.',
        'La série de jours de suite démarre aussi le lundi 26 : +10 points au 3e jour, +20 au 7e. Laisser l’écran allumé sans jouer ne rapporte presque rien de plus : il faut être là.',
        'Cette semaine finit avec les règles d’avant, pour tout le monde.',
        'Derrière la petite porte du fond, la table a des nouveautés : on peut séparer une paire, un conseil discret aide à choisir le bon coup, et une roulette attend les plus chanceux. Trophées, mini-objectifs, statistiques et habillages à débloquer : tout est dans le carnet du croupier.',
      ],
    },
    {
      id: '2026-10-21-c', date: '2026-10-21', titre: 'Un grand ménage : les chiffres disent vrai',
      points: [
        'Les cartes, les talents et les meubles affichent leurs vrais effets : le gain réel d’une recette, les vraies fréquences, « 8 h 30 » au lieu de « 8.5 h ». Les primes de la Décoration et du Carnet comptent dès le jour de l’achat.',
        'Après la boutique n°30, le défi de passage est enfin affiché, avec sa progression. La pastille ★ ne clignote plus quand le défi n’est pas fait, et les points de talent ne restent plus affichés une fois tous les talents au maximum.',
        'Les pourboires du client mystère comptent aussi pour le défi de la semaine. Le nom de la boutique de la Capitale tient en entier.',
        'Les événements s’arrêtent proprement : un mini-jeu ou un contrat ne paie plus après la fermeture, une pause dure le vrai temps, et rien de la boutique ne s’écoule pendant que tu es dans la Planque ou le Manoir.',
        'Dans la boutique, les couverts sont bien posés sur les tables, et le néon du Quartier ne chevauche plus l’étagère aux bocaux. Les décors HD se chargent un peu plus vite.',
      ],
    },
    {
      id: '2026-10-21-b', date: '2026-10-21', titre: 'La Maison hantée arrive le 27 à midi',
      points: [
        'Du mardi 27 octobre à midi au lundi 2 novembre à 20 h : ta boutique, entièrement hantée. Murs, meubles, bougies et brume ; les clients sont des monstres, du squelette au loup-garou.',
        'Sers les monstres qui commandent, réussis tes fournées parfaites, attrape les apparitions et livre les commandes de la nuit. Le ×6 s’endort si tu ne touches plus l’écran : un toucher le réveille.',
        'Le bestiaire : sers dix fois chacun des neuf monstres pour des étoiles, un décor et une chauve-souris compagnon. Et la recette du jour, comme dans la Planque.',
        '20 paliers, qui s’ouvrent au fil des jours. Les quinze premiers du classement de l’événement sont récompensés ; au 20e palier, le titre « Légende du Manoir », une aura phosphorescente et une lanterne pour ta boutique.',
      ],
    },
    {
      id: '2026-10-21-a', date: '2026-10-21', titre: 'Choisis ta qualité et tes images par seconde',
      points: [
        'Dans Réglages › Le jeu, « Qualité graphique » : Auto (le jeu s’adapte à ton téléphone, comme avant), Haute, Moyenne ou Éco. Un choix fixe ne bouge plus ; il vaut aussi pour la Planque et la Maison hantée. En Éco, les décors HD ne se chargent pas.',
        '« Images par seconde » : Économie (30 en jouant, 10 au repos : la batterie dure le plus longtemps), Fluide (60, puis 20 au repos) ou Maximum (la vitesse de ton écran, jusqu’à 120 sur iPhone Pro).',
        'Tes choix s’appliquent tout de suite et sont gardés. Tes gains ne changent pas : tes apprentis vendent exactement autant.',
      ],
    },
    {
      id: '2026-10-20-b', date: '2026-10-20', titre: 'Le jeu consomme moins de batterie',
      points: [
        'La boutique se dessine 30 fois par seconde au plus pendant que tu joues (au lieu de 60, voire 120 sur les iPhone récents), et 10 fois après 15 secondes sans toucher l’écran. Elle reprend aussitôt au premier toucher.',
        'Tes gains ne changent pas : tes apprentis vendent exactement autant, quelle que soit la cadence.',
        'Les mini-jeux de l’Atelier et des événements, et le meuble que tu fais glisser en mode Déplacer, restent bien fluides.',
      ],
    },
    {
      id: '2026-10-20-a', date: '2026-10-20', titre: 'La recette du jour, et des récompenses jusqu’au 15e',
      points: [
        'Dans la Planque, la « Mise en pochon du jour » : une recette qui change chaque jour, à lancer à la main. Prépare-la, améliore-la jusqu’au niveau 10 : jouée sans arrêt, elle ajoute jusqu’à 40 % à tes gains.',
        'Conditionne 100, 250 puis 500 pochons (toutes recettes confondues) : des étoiles pour ta boulangerie, et un décor à la fin. La Maison hantée aura la sienne dès le 27.',
        'Chaque lundi, les quinze premiers du classement de la semaine sont récompensés : des étoiles et un boost, et toujours la tenue et la coupe pour le podium. Une feuille te dit ta place.',
        'Corrigé : une fin d’événement Planque ouverte paie bien ton absence ; un boost de la réserve fini pendant ton absence compte ; tes objectifs du jour finis sont réclamés avant une nouvelle boutique ; une main de BlackJack en cours ne suit plus dans la nouvelle boutique ; les pourboires ne se perdent plus quand le réseau coupe.',
        'L’interrupteur « Décors en HD » est maintenant dans Réglages › Le jeu.',
      ],
    },
    {
      id: '2026-10-18-b', date: '2026-10-18', titre: 'Le Sirop violet et le Cristal bleu, encore plus forts',
      points: [
        'Dans la Planque, le Sirop violet rapporte ×48 par niveau (4 fois plus qu’hier), le Cristal bleu ×80 (2 fois plus qu’hier) : sans ses Gobelets, un niveau de Sirop se rembourse à peu près aussi vite qu’un niveau de Spécialité ; avec, c’est la meilleure affaire.',
        'Tes niveaux déjà achetés restent : ils rapportent plus tout de suite. Les prix ne changent pas.',
        'À la Maison hantée (dès le 27) : les Gâteaux du cimetière ×72 par niveau, les Œufs de dragon en chocolat ×131.',
      ],
    },
    {
      id: '2026-10-18-a', date: '2026-10-18', titre: 'Ta boutique monte en gamme, et tu aménages ta salle',
      points: [
        'Ta boutique monte en gamme : toutes les cinq boutiques, ton décor devient plus beau, de la Belle boutique (n°6) jusqu’au Palais du goût (n°26). Parquet, marbre, colonnes dorées, tapis rouge, et même une statue !',
        'Ton quartier garde ses couleurs. Les feuilles Étoiles et Parcours montrent ton standing et le prochain palier.',
        'Aménage ta salle : dans Réglages, touche « Repeindre la boutique », puis « Déplacer ». Fais glisser du doigt tes tables, le bar, le coin salon et les tables de la terrasse.',
        'En vert, la place est libre. En rouge, le jeu te dit pourquoi : la file d’attente, l’allée, une autre table…',
        'Tes places sont gardées d’une boutique à l’autre, et tes copains voient ta salle quand ils te rendent visite. « Plan d’origine » remet tout comme avant.',
      ],
    },
    {
      id: '2026-10-17-h', date: '2026-10-17', titre: 'Le Sirop violet et le Cristal bleu rapportent enfin',
      points: [
        'Dans la Planque, le Sirop violet rapporte 12 fois plus par niveau, le Cristal bleu 40 fois plus : un niveau s’y rembourse presque aussi vite qu’un niveau de Spécialité.',
        'Tes niveaux déjà achetés restent : ils rapportent plus tout de suite. Les prix ne changent pas.',
        'À la Maison hantée (dès le 27) : les Gâteaux du cimetière et les Œufs de dragon en chocolat aussi.',
      ],
    },
    {
      id: '2026-10-17-g', date: '2026-10-17', titre: 'De nouvelles recettes à chaque boutique',
      points: [
        'Chaque nouvelle boutique t’apporte une recette, de la n°2 à la n°9 : le Paris-Brest, le Kouign-amann, la Tarte aux myrtilles, l’Opéra, puis le Canelé, le Saint-Honoré, le Fraisier et le Croquembouche.',
        'Une recette gagnée l’est pour toujours, avec son apprenti et son bonus ×3. Si tu as déjà plusieurs boutiques, les recettes sont déjà là.',
        'Le parcours du boulanger, jusqu’à la boutique n°30 : cinq nouveaux quartiers (la gare, l’île, le château, la station de ski, la capitale), une tenue, des étoiles, des boosts et des titres.',
        'Dès la boutique n°6, ouvrir la suivante demande aussi un défi de passage, annoncé à l’avance : une carte en haut de l’onglet Défis montre ton prochain objectif.',
      ],
    },
    {
      id: '2026-10-17-f', date: '2026-10-17', titre: 'Une boutique réaménagée',
      points: [
        'La salle s’agrandit : jusqu’à 6 tables. Les deux dernières font encore grimper tous tes gains (×1,48 en tout).',
        'Un bar et ses tabourets : des pourboires en plus, et des clients servis plus vite.',
        'Un coin salon pour tes habitués : ils arrivent plus vite et leurs cadeaux grossissent.',
        'Une terrasse devant la vitrine : plus de monde, surtout les jours de marché et d’avril à septembre.',
        'Touche un meuble dans la boutique, ou ouvre Bonus › Mobilier, pour les installer. Ils repartent de zéro à chaque nouvelle boutique, comme les autres.',
      ],
    },
    {
      id: '2026-10-17-e', date: '2026-10-17', titre: 'Idées, bugs et votes',
      points: [
        'Une ampoule à droite, sous la bulle du chat : propose une idée ou signale un bug, avec une capture si tu veux.',
        'Pour un bug, le jeu joint tout seul ce qui aide à comprendre : la version du jeu, ton téléphone, ton quartier.',
        'Des votes pour choisir la suite du Fournil : un bandeau dans la boutique te prévient, et tu peux changer d’avis tant que le vote est ouvert.',
        'Pour écrire et voter, il faut un pseudo au classement.',
      ],
    },
    {
      id: '2026-10-17-d', date: '2026-10-17', titre: 'Des événements qui avancent plus vite',
      points: [
        'Dans la Planque (et bientôt au Manoir), des paliers de recette plus serrés : 75, 125, 150, 175… chacun donne un coup de pouce.',
        'Après le boss, deux nouvelles recettes : le Sirop violet au palier 13, le Cristal bleu au palier 16, avec leur apprenti et leur combine ×3.',
        'Le Grossiste, une combine d’après le boss : tous les niveaux de recettes à moitié prix.',
        'À la Maison hantée (dès le 27) : les Gâteaux du cimetière et les Œufs de dragon en chocolat, et le Marché des sorcières.',
      ],
    },
    {
      id: '2026-10-17-c', date: '2026-10-17', titre: 'Le chat des boulangers',
      points: [
        'Une bulle à droite, sous l’événement : le chat de tous les boulangers, avec une pastille quand il y a du nouveau.',
        'Écris un message, envoie une photo ou une capture (elle est allégée toute seule), ou cherche un GIF.',
        'Pour écrire, il faut un pseudo au classement ; tout le monde peut lire.',
        'Un appui long sur un message : le signaler, ou effacer le tien. Les photos s’effacent après 7 jours.',
      ],
    },
    {
      id: '2026-10-17-b', date: '2026-10-17', titre: 'Les nouveautés',
      points: [
        'Le petit cadeau à côté de la cloche : tout ce qui a changé dans le Fournil, de la plus récente à la plus ancienne.',
        'Un point rouge te prévient quand il y a du nouveau.',
      ],
    },
    {
      id: '2026-10-17-a', date: '2026-10-17', titre: 'La jauge de la prochaine étoile',
      points: [
        'Dans la feuille Étoiles, une jauge montre où tu en es vers ta prochaine étoile.',
        'Elle dit ce qu’il reste à gagner dans la boutique, et en combien de temps à ton rythme actuel.',
        'Laisse la feuille ouverte : la jauge avance sous tes yeux.',
      ],
    },
    {
      id: '2026-10-16-d', date: '2026-10-16', titre: 'Des recettes qui grimpent plus vite',
      points: [
        'De nouveaux paliers de recette : 75, 125, 150, 175, puis 250… Entre 100 et 200, un cran tous les 25 niveaux au lieu d’un seul.',
        'Chaque palier fait grimper les ventes de la recette : ta boutique avance un peu plus vite qu’avant.',
        'Quand une mise à jour sort, un bandeau « Nouvelle version du Fournil » te prévient : touche-le, ta partie est sauvée et le jeu repart à jour.',
      ],
    },
    {
      id: '2026-10-16-c', date: '2026-10-16', titre: 'Les compagnons',
      points: [
        'Choisis l’animal de ta boutique : chat roux, chien ou lapin offerts, puis la poule, le canard, le hérisson… jusqu’au mini-dragon.',
        'Chaque compagnon donne un petit bonus tant qu’il est avec toi : des pourboires, des absences plus longues, des fournées plus rapides ou des gains en plus.',
        'Le chien du quartier, gagné au palier 11 du Quartier, devient un compagnon lui aussi (+5 % de gains). Le chat noir de la Maison hantée suivra.',
        'Tout se passe dans Réglages › Le compagnon, ou depuis la garde-robe.',
      ],
    },
    {
      id: '2026-10-16-b', date: '2026-10-16', titre: 'Des événements plus généreux',
      points: [
        'Les paliers des événements donnent plus d’étoiles et versent des heures de gains directement dans la caisse de ta boulangerie.',
        'Les paliers 13 à 20, après le boss, sont bien plus riches : des étoiles en pagaille et de gros boosts.',
        'Les combines achetées après le boss paient aussi ta boulangerie.',
        'Déjà bien avancé ? La différence t’est donnée une fois, sans rien perdre.',
      ],
    },
    {
      id: '2026-10-16-a', date: '2026-10-16', titre: 'Encore plus de copains',
      points: [
        'En visite chez un copain, « Ses recettes » montre le niveau de chacune, ses apprentis et leur grade. Son compagnon est là aussi.',
        'Dans le classement « Tous les temps », touche un copain pour voir sa fiche ; dans l’onglet de l’événement, visite sa Planque.',
        'Un pourboire laissé à un copain te rapporte une étoile.',
        'Les cadeaux peuvent maintenant contenir des étoiles.',
        'Les notifications sont prêtes : active-les dans Réglages pour savoir quand ta boutique est pleine, quand un copain t’a laissé un pourboire ou quand un événement commence.',
      ],
    },
    {
      id: '2026-10-15-b', date: '2026-10-15', titre: 'Les copains',
      points: [
        'Touche un boulanger dans le classement pour visiter sa boutique en 3D.',
        'Laisse-lui un pourboire (trois par jour) : il reçoit un boost ×2.',
        'Chaque semaine, un objectif commun à remplir tous ensemble ; réussi, il offre un boost ×5 à chacun.',
        'Le classement ouvert se met à jour tout seul, avec les boulangers en ligne.',
      ],
    },
    {
      id: '2026-10-15-a', date: '2026-10-15', titre: 'Les activités des événements',
      points: [
        'Dans un événement, trois boutons de plus : des mini-jeux, les contrats de la nuit et les opérations.',
        'Les paliers bonus de 13 à 20 et quatre combines de plus attendent ceux qui ont battu le boss.',
        'Partir quelques minutes sans le vouloir met l’événement en pause au lieu de tout perdre.',
        'La Maison hantée ouvre ses portes le mardi 27 octobre à midi : tenue d’Halloween et chat noir à gagner.',
      ],
    },
    {
      id: '2026-10-14-a', date: '2026-10-14', titre: 'Des personnages plus vivants',
      points: [
        'Les clients tournent la tête, respirent, s’impatientent dans la file et sautent de joie quand on les sert.',
        'Les apprentis pétrissent au four et saluent au comptoir ; le boulanger s’essuie le front et se frotte les mains.',
        'Dans la Planque, l’équipe s’installe sur le canapé, travaille et fait la fête à chaque palier.',
        'Tes gains comptent aussi quand le jeu reste ouvert en arrière-plan.',
      ],
    },
    {
      id: '2026-10-13-b', date: '2026-10-13', titre: 'De vrais sons et des confettis',
      points: [
        'De vrais bruitages pour les ventes, les achats et les surprises.',
        'Des confettis aux grandes occasions : déblocages, montée de niveau, podium, nouvelle boutique.',
        'La Planque passe en haute définition : meubles, néons et la rue de nuit par la fenêtre.',
      ],
    },
    {
      id: '2026-10-13-a', date: '2026-10-13', titre: 'Le Quartier et la garde-robe',
      points: [
        'L’événement « Le Quartier » est ouvert jusqu’au 27 octobre (18 ans et +) : une boutique à part, sa monnaie, douze paliers et un classement rien qu’à lui.',
        'Ses récompenses vont à ta boulangerie : des étoiles, des boosts, des décos et une tenue.',
        'La garde-robe du boulanger : tête, haut, chaussures et accessoire, chaque pièce avec son bonus, à améliorer avec des étoiles.',
        'L’interface est mieux rangée, avec des icônes redessinées.',
        'Il paraît qu’une petite porte, au fond de la boutique, cache quelque chose…',
      ],
    },
    {
      id: '2026-10-12-a', date: '2026-10-12', titre: 'L’Atelier et les points de boulanger',
      points: [
        'L’Atelier et ses trois mini-jeux : l’Enfournement en rythme, le Façonnage au doigt et la Mémoire du pâtissier.',
        'Le classement compte en points de boulanger : petit ou grand, chacun a sa chance.',
      ],
    },
  ];

  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  // « vendredi 16 octobre » ; l'année seulement si elle n'est pas celle d'aujourd'hui (annee : l'année en cours, facultative)
  function dateFr(date, annee) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
    if (!m) return '';
    const a = +m[1], mo = +m[2], j = +m[3], jour = new Date(Date.UTC(a, mo - 1, j)).getUTCDay();
    return `${JOURS[jour]} ${j === 1 ? '1er' : j} ${MOIS[mo - 1]}${annee && annee !== a ? ` ${a}` : ''}`;
  }
  const derniere = () => (NOUVEAUTES.length ? NOUVEAUTES[0].id : '');
  const vueNeuve = () => (NOUVEAUTES.length > 1 ? NOUVEAUTES[1].id : ''); // une sauvegarde neuve : tout vu, sauf la plus récente
  const nonVue = (n, vues) => typeof vues !== 'string' || n.id > vues; // les id se comparent comme des chaînes (aaaa-mm-jj-x)
  const nonVues = (vues) => NOUVEAUTES.filter((n) => nonVue(n, vues));

  return { NOUVEAUTES, dateFr, derniere, vueNeuve, nonVue, nonVues };
});
