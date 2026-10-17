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
