/* LE FOURNIL — la boutique du Marché d'automne : BOUCHON (amorce vide, docs/marche-contrat.md § 9) en attendant le constructeur C.
   actif() → false : l'écran du Marché prend son repli (la scène dessinée de src/evenement.js). La version de C le REMPLACE à la fusion. */
const BOUTIQUE_MARCHE = (() => {
  'use strict';
  const non = () => false, rien = () => null, vide = () => [];
  return { actif: non, demande: non, scene: rien, SORTES: ['ecureuil', 'herisson', 'lapin', 'renard', 'blaireau', 'chouette', 'faon', 'marcassin', 'ourson'], acteurs: vide, client: rien, entrer: rien, servir: rien, fache: rien, apparition: rien, apparitions: vide, attraper: non, retirer: rien, surToucher: rien, vise: non, fete: non, ambiance: () => 1, precharger: rien, get ouverte() { return false; } };
})();
if (typeof module !== 'undefined') module.exports = BOUTIQUE_MARCHE;
