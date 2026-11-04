/* LE FOURNIL — la boutique du Marché d'automne (docs/marche-contrat.md § 6, constructeur C) : AMORCE. La même API que BOUTIQUE_HANTEE
   (src/boutiquehantee.js) ; tant que la vraie n'est pas là, actif() rend toujours faux : l'écran de la Halle (src/evenement.js) garde sa
   scène dessinée, et rien d'autre ne change. Le constructeur C remplace ce fichier entier. */
const BOUTIQUE_MARCHE = (() => {
  'use strict';
  const SORTES = ['ecureuil', 'herisson', 'lapin', 'renard', 'blaireau', 'chouette', 'faon', 'marcassin', 'ourson'];
  const rien = () => null, vide = () => [];
  return { actif: () => false, demande: () => false, scene: rien, etatVue: rien, stations: vide, mobilier: vide, EQUIPE: [], CLIENTS: SORTES, SORTES, GARDE: null, HD: null,
    acteurs: vide, client: rien, entrer: rien, servir: rien, fache: rien, apparition: rien, apparitions: vide, attraper: rien, retirer: rien, surToucher: () => false,
    vise: () => false, fete: rien, ambiance: rien, precharger: rien, detruire: rien, get ouverte() { return false; } };
})();
