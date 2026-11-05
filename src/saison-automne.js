/* LE FOURNIL — la première saison gratuite, « Automne » (docs/marche-contrat.md § 7) : la fiche, posée dans le moteur (src/saison.js,
   SAISONS.ajouter). Du vendredi 13 novembre 2026 à midi au lundi 30 novembre 2026 à 23 h 59 59 (heure de Paris) ; la saison d'hiver (l'Avent,
   src/saison-hiver.js) partira le 1er décembre à 0 h sur le même moteur. 22 crans de 45 XP (990 XP), puis le titre « Feuille d'or 2026 »
   à 1 240 XP. Les récompenses (à vie) : 16 étoiles, 3 petits boosts (×2, ×2, ×3, 30 min), AUCUNE heure de gains, la tenue de saison (4 pièces
   cosmétiques SANS bonus : collection 'automne', src/game.js), 5 décos, le trophée de fin de saison, le titre. Réglée par la simulation
   (outils/marche/saison.js, refaite sur ce moteur par test/fournil-saison.test.js) : quotidien 1 h → finie le 28 nov. ; occasionnel 17 min
   quatre jours sur sept → 13/22 ; et sans effet notable sur le rythme des boutiques (outils/marche/longevite-saison.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./saison.js'));
  else root.SAISON_AUTOMNE = factory(root.SAISONS);
})(typeof self !== 'undefined' ? self : this, function (SAISONS) {
  'use strict';
  const M = 1800; // trente minutes
  const CRANS = [
    { boost: { mult: 2, secs: M } },                                   // 1
    { etoiles: 1 },                                                    // 2
    { deco: 'couronne-feuilles' },                                     // 3 : la couronne de feuilles (la porte)
    { etoiles: 1 },                                                    // 4
    { vetement: 'automne-gavroche' },                                  // 5 : la casquette de tweed
    { etoiles: 1 },                                                    // 6
    { deco: 'guirlande-feuilles' },                                    // 7 : la guirlande de feuilles (le rebord)
    { etoiles: 1 },                                                    // 8
    { vetement: 'automne-echarpe' },                                   // 9 : l'écharpe tricotée
    { etoiles: 1, boost: { mult: 2, secs: M } },                       // 10
    { etoiles: 1 },                                                    // 11
    { etoiles: 1 },                                                    // 12
    { vetement: 'automne-pull' },                                      // 13 : le pull jacquard
    { etoiles: 2 },                                                    // 14
    { deco: 'lanterne-automne' },                                      // 15 : la lanterne d'automne (le comptoir)
    { etoiles: 1 },                                                    // 16
    { vetement: 'automne-bottines' },                                  // 17 : les bottines, la tenue de saison complète
    { etoiles: 2 },                                                    // 18
    { deco: 'epouvantail' },                                           // 19 : l'épouvantail (le sol)
    { boost: { mult: 3, secs: M } },                                   // 20
    { etoiles: 2 },                                                    // 21
    { deco: 'trophee-automne-2026', trophee: 'trophee-automne-2026', etoiles: 2 }, // 22 : le trophée de fin de saison (déco du comptoir et vitrine)
  ];
  const NOMS = { // pour la feuille et le carnet
    'couronne-feuilles': 'la couronne de feuilles, pour la porte', 'guirlande-feuilles': 'la guirlande de feuilles, pour le rebord', 'lanterne-automne': 'la lanterne d’automne, pour le comptoir',
    epouvantail: 'l’épouvantail, pour la boutique', 'trophee-automne-2026': 'le trophée de la saison d’automne 2026',
    'automne-gavroche': 'la casquette de tweed', 'automne-echarpe': 'l’écharpe tricotée', 'automne-pull': 'le pull jacquard', 'automne-bottines': 'les bottines (la tenue de saison complète)',
    'feuille-or-2026': 'le titre « Feuille d’or 2026 »',
  };
  return SAISONS.ajouter({
    id: 'automne-2026', nom: 'La saison d’automne', court: 'Saison d’automne', annee: 2026,
    debut: SAISONS.parisMs(2026, 11, 13, 12), fin: SAISONS.parisMs(2026, 12, 1, 0),
    sources: SAISONS.SOURCES, crans: CRANS, xpCran: 45,
    titre: { xp: 250, distinction: 'feuille-or-2026', nom: 'Feuille d’or 2026' },
    evenements: ['marche'], // les paliers d'événement qui comptent (st.marche.paliers) ; l'Avent ajoutera sa clé dans sa propre fiche
    famille: 'piste-automne', tenue: 'automne', // le carnet (src/chaine.js) et la garde-robe (src/game.js)
    couleurs: { fond: '#FFF4E4', accent: '#D9622B', or: '#E8B33A', vert: '#7A9A3A', texte: '#4A2E1C', doux: '#9C7B5E' },
    noms: NOMS,
    textes: {
      titre: 'La saison d’automne', carte: 'Saison d’automne', annonceTitre: 'Nouveau : la saison d’automne !',
      annonce: 'Jusqu’au 30 novembre, une piste de récompenses gratuite : les objectifs du jour, le défi de la semaine, ta série et les paliers du Marché la font avancer. Tout ce que tu reçois reste à vie.',
      fin: 'La saison d’automne est finie : voici ce qui t’attendait.', carnet: 'Saison d’automne 2026',
      recevoir: 'Recevoir', toutRecevoir: 'Tout recevoir',
    },
  });
});
