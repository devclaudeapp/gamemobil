/* LE FOURNIL — la deuxième saison gratuite, « Hiver » (docs/noel-contrat.md § 3) : la fiche, posée dans le moteur (src/saison.js,
   SAISONS.ajouter). Du mardi 1er décembre 2026 à 0 h au dimanche 3 janvier 2027 à 23 h 59 59 (heure de Paris), juste après la saison
   d'automne (fin le 30 novembre à 23 h 59 59 : les fenêtres se touchent, sans trou ni double compte). 46 crans de 45 XP (2 070 XP), puis le
   titre « Flocon d'or 2026 » à 2 320 XP. Les récompenses (à vie) : 13 étoiles, 4 petits boosts (×2, ×2, ×2 1 h, ×3), AUCUNE heure de gains,
   aucune tenue, 6 décos d'hiver, le trophée de fin de saison, une collection de flocons (cosmétique, dessinés : { flocon: n }, rien à
   verser), le titre. Les sources : celles de l'automne, plus le calendrier de l'Avent (10 XP par case ouverte, lu par un « lecteur » :
   src/avent.js, nOuvertes) et les paliers du Marché de Noël (st.noel.paliers). Réglée par la simulation (outils/noel/hiver.js, refaite sur
   ce moteur par test/fournil-saison.test.js) : quotidien 1 h → finie le 31 déc. ; occasionnel 17 min quatre jours sur sept → 31/46. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./saison.js'), () => require('./avent.js'));
  else root.SAISON_HIVER = factory(root.SAISONS, () => root.AVENT);
})(typeof self !== 'undefined' ? self : this, function (SAISONS, avent) {
  'use strict';
  const M = 1800, H = 3600; // trente minutes, une heure
  const CRANS = [ // « flocon » : un flocon de neige unique, dessiné à partir de son numéro (ICONS.flocon(n)), pour la collection
    { boost: { mult: 2, secs: M } },                                   // 1
    { etoiles: 1 },                                                    // 2
    { flocon: 3 },                                                     // 3
    { flocon: 4 },                                                     // 4
    { deco: 'luge' },                                                  // 5 : la luge de bois (le sol)
    { etoiles: 1 },                                                    // 6
    { flocon: 7 },                                                     // 7
    { flocon: 8 },                                                     // 8
    { flocon: 9 },                                                     // 9
    { etoiles: 1 },                                                    // 10
    { deco: 'lanterne-givre' },                                        // 11 : la lanterne givrée (le comptoir)
    { flocon: 12 },                                                    // 12
    { boost: { mult: 2, secs: M } },                                   // 13
    { etoiles: 1 },                                                    // 14
    { flocon: 15 },                                                    // 15
    { flocon: 16 },                                                    // 16
    { deco: 'guirlande-givre' },                                       // 17 : la guirlande de flocons (le rebord)
    { etoiles: 1 },                                                    // 18
    { flocon: 19 },                                                    // 19
    { flocon: 20 },                                                    // 20
    { flocon: 21 },                                                    // 21
    { etoiles: 1 },                                                    // 22
    { deco: 'traineau' },                                              // 23 : le traîneau chargé de paquets (le sol)
    { flocon: 24 },                                                    // 24
    { boost: { mult: 2, secs: H } },                                   // 25
    { etoiles: 1 },                                                    // 26
    { flocon: 27 },                                                    // 27
    { flocon: 28 },                                                    // 28
    { deco: 'cheminee' },                                              // 29 : la cheminée et ses bûches (le mur)
    { etoiles: 1 },                                                    // 30
    { flocon: 31 },                                                    // 31
    { flocon: 32 },                                                    // 32
    { flocon: 33 },                                                    // 33
    { etoiles: 1 },                                                    // 34
    { deco: 'patins' },                                                // 35 : les patins à glace (le mur)
    { flocon: 36 },                                                    // 36
    { boost: { mult: 3, secs: M } },                                   // 37
    { etoiles: 1 },                                                    // 38
    { flocon: 39 },                                                    // 39
    { flocon: 40 },                                                    // 40
    { flocon: 41 },                                                    // 41
    { etoiles: 1 },                                                    // 42
    { flocon: 43 },                                                    // 43
    { flocon: 44 },                                                    // 44
    { flocon: 45 },                                                    // 45
    { deco: 'trophee-hiver-2026', trophee: 'trophee-hiver-2026', etoiles: 2 }, // 46 : le trophée de fin de saison (déco du comptoir et vitrine)
  ];
  const FLOCONS = CRANS.filter((c) => c.flocon).map((c) => c.flocon); // les 24 flocons de la collection (« Mes flocons : 12/24 »)
  const NOMS = { // pour la feuille et le carnet
    luge: 'la luge de bois, pour la boutique', 'lanterne-givre': 'la lanterne givrée, pour le comptoir', 'guirlande-givre': 'la guirlande de flocons, pour le rebord',
    traineau: 'le traîneau chargé de paquets, pour la boutique', cheminee: 'la cheminée et ses bûches, pour le mur', patins: 'les patins à glace, pour le mur',
    'trophee-hiver-2026': 'le trophée de la saison d’hiver 2026', 'flocon-or-2026': 'le titre « Flocon d’or 2026 »', flocon: 'un flocon pour ta collection',
  };
  const F = SAISONS.ajouter({
    id: 'hiver-2026', nom: 'La saison d’hiver', court: 'Saison d’hiver', annee: 2026,
    debut: SAISONS.parisMs(2026, 12, 1, 0), fin: SAISONS.parisMs(2027, 1, 4, 0), // le 3 janv. à 23 h 59 59
    sources: Object.assign({}, SAISONS.SOURCES, { avent: Object.freeze({ xp: 10, nom: 'Calendrier de l’Avent', txt: 'une case du calendrier ouverte' }) }),
    lecteurs: { avent: (st) => { const A = avent(); return A ? A.nOuvertes(st.avent) : 0; } }, // (sans plafond de plus : la règle de l'Avent borne à deux par jour)
    crans: CRANS, xpCran: 45,
    titre: { xp: 250, distinction: 'flocon-or-2026', nom: 'Flocon d’or 2026' },
    evenements: ['noel'], // les paliers du Marché de Noël (st.noel.paliers), 20 XP chacun
    famille: 'piste-hiver', tenue: null, // le carnet (src/chaine.js) ; aucune tenue (décembre en a deux : celle de l'Avent et celle du Chalet)
    couleurs: { fond: '#F2F6FB', accent: '#2B4C7E', or: '#E8B33A', vert: '#2E7D4F', texte: '#1E2A3A', doux: '#6B7C93' },
    noms: NOMS, flocons: FLOCONS,
    textes: {
      titre: 'La saison d’hiver', carte: 'Saison d’hiver', annonceTitre: 'Nouveau : la saison d’hiver !',
      annonce: 'Jusqu’au 3 janvier, une piste de récompenses gratuite : le calendrier de l’Avent, les objectifs du jour, le défi de la semaine, ta série et le Marché de Noël la font avancer. Tout ce que tu reçois reste à vie.',
      fin: 'La saison d’hiver est finie : voici ce qui t’attendait.', carnet: 'Saison d’hiver 2026',
      recevoir: 'Recevoir', toutRecevoir: 'Tout recevoir', flocons: (k) => `Mes flocons : ${k}/${FLOCONS.length} — il n’y en a pas deux pareils`, flocon: 'Un flocon pour ta collection',
    },
  });
  return F;
});
