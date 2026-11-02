/* DERNIER REMPART — les données du jeu, séparées de la logique : armes, zombies, défenses, améliorations, arènes, vagues.
   Rien ici ne calcule une partie : jeu.js lit ces tables. Pour équilibrer, on ne touche qu'à ce fichier (test/zombies.test.js vérifie
   leur forme). Unités : mètres, secondes, points de vie. Axes : x vers l'est, z vers le sud (comme Opération Poncin et Three.js).
   Module pur (aucun DOM, aucun THREE), gabarit UMD : ZDONNEES dans la page, require() dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZDONNEES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── le survivant ───
  const JOUEUR = { vie: 100, vitesse: 5.2, rayon: 0.42, aimant: 2.2, regen: 0, invulnerable: 0.35 };

  // ─── les armes ───
  // degats par balle, cadence (tirs/s), portee (m), balles par tir et dispersion (rad), munitions trouvées dans une caisse (Infinity : sans fin),
  // perce : nombre de zombies traversés, recul : poussée sur le zombie touché, classe : le son (src-poncin/sons.js), rarete : poids dans les caisses
  const ARMES = {
    pistolet:     { nom: 'Pistolet',      degats: 14, cadence: 3.2,  portee: 9,  balles: 1, dispersion: 0.03, munitions: Infinity, perce: 0, recul: 0.25, classe: 'pistolet',     couleur: '#5B8BD9', rarete: 0,  depuis: 1 },
    revolver:     { nom: 'Revolver',      degats: 38, cadence: 1.6,  portee: 11, balles: 1, dispersion: 0.02, munitions: 48,       perce: 1, recul: 0.6,  classe: 'pistolet',     couleur: '#C9563C', rarete: 30, depuis: 1 },
    pompe:        { nom: 'Fusil à pompe', degats: 13, cadence: 1.15, portee: 7,  balles: 7, dispersion: 0.32, munitions: 30,       perce: 0, recul: 1.0,  classe: 'pompe',        couleur: '#8A5A2B', rarete: 26, depuis: 2 },
    mitraillette: { nom: 'Mitraillette',  degats: 11, cadence: 10,   portee: 9,  balles: 1, dispersion: 0.09, munitions: 220,      perce: 0, recul: 0.12, classe: 'mitraillette', couleur: '#3E9C6B', rarete: 24, depuis: 3 },
    fusil:        { nom: 'Fusil d’assaut', degats: 19, cadence: 6.5, portee: 12, balles: 1, dispersion: 0.05, munitions: 180,      perce: 1, recul: 0.2,  classe: 'fusil',        couleur: '#6C6F7D', rarete: 18, depuis: 4 },
    precision:    { nom: 'Carabine',      degats: 95, cadence: 0.9,  portee: 16, balles: 1, dispersion: 0.0,  munitions: 28,       perce: 4, recul: 1.2,  classe: 'sniper',       couleur: '#9B6BD6', rarete: 10, depuis: 5 },
  };
  const ARME_DE_BASE = 'pistolet';

  // ─── les zombies ───
  // vie, vitesse (m/s), degats par coup et coups/s, rayon, ferraille laissée, points, taille (rendu), couleurs : peau, haut, bas ;
  // crache : attaque à distance (portee, cadence, degats, vitesse du crachat) ; depuis : la première vague où il paraît ; poids : sa part dans une vague
  const ZOMBIES = {
    trainard:   { nom: 'Traînard',   vie: 34,   vitesse: 1.55, degats: 9,  cadence: 1.0, rayon: 0.42, ferraille: 1,  points: 10,  taille: 1.0,  peau: '#8DBF6A', haut: '#7C6A9E', bas: '#4D5A7A', depuis: 1, poids: 10 },
    coureur:    { nom: 'Coureur',    vie: 22,   vitesse: 3.6,  degats: 6,  cadence: 1.6, rayon: 0.36, ferraille: 1,  points: 15,  taille: 0.88, peau: '#A6C97A', haut: '#D9824B', bas: '#3F3F4A', depuis: 2, poids: 5 },
    costaud:    { nom: 'Costaud',    vie: 180,  vitesse: 1.1,  degats: 22, cadence: 0.7, rayon: 0.7,  ferraille: 4,  points: 40,  taille: 1.45, peau: '#6FA35A', haut: '#5A6E8C', bas: '#3B3B3B', depuis: 3, poids: 2 },
    cracheur:   { nom: 'Cracheur',   vie: 46,   vitesse: 1.35, degats: 7,  cadence: 1.0, rayon: 0.42, ferraille: 2,  points: 25,  taille: 1.0,  peau: '#B7D35A', haut: '#4E8A6E', bas: '#5C4A3A', depuis: 4, poids: 2, crache: { portee: 7.5, cadence: 0.45, degats: 10, vitesse: 7 } },
    mastodonte: { nom: 'Mastodonte', vie: 1400, vitesse: 1.0,  degats: 35, cadence: 0.6, rayon: 1.05, ferraille: 25, points: 400, taille: 2.2,  peau: '#5F8F4E', haut: '#8C3B3B', bas: '#2F2F36', depuis: 5, poids: 0, boss: true },
  };

  // ─── les défenses (achetées avec la ferraille, posées aux pieds du survivant) ───
  // max : combien on peut en avoir en même temps à la vague 1, puis +1 toutes les « plus » vagues ; vie : les zombies les cassent
  const DEFENSES = {
    tourelle:  { nom: 'Tourelle',  prix: 15,  vie: 140, rayon: 0.55, max: 1, plus: 3, portee: 8.5, cadence: 4,   degats: 9,  depuis: 1, desc: 'Tire seule sur le zombie le plus proche.' },
    barricade: { nom: 'Barricade', prix: 10,  vie: 260, rayon: 0.9,  max: 2, plus: 2,                                      depuis: 1, desc: 'Un mur de planches : les zombies doivent le casser.' },
    mine:      { nom: 'Mine',      prix: 12,  vie: 1,   rayon: 0.4,  max: 2, plus: 2, souffle: 3.2, degats: 160,           depuis: 2, desc: 'Explose quand un zombie marche dessus.' },
    mortier:   { nom: 'Mortier',   prix: 40,  vie: 120, rayon: 0.6,  max: 1, plus: 5, portee: 14, cadence: 0.45, degats: 70, souffle: 2.6, minimum: 3, depuis: 4, desc: 'Lance des obus sur les groupes, de loin.' },
    epouvantail: { nom: 'Épouvantail', prix: 120, vie: 500, rayon: 0.6, max: 1, plus: 99, attire: 9,                  depuis: 6, desc: 'Attire les zombies proches pendant que tu tires.' },
  };

  // ─── les améliorations (permanentes pour la partie ; le prix monte à chaque cran) ───
  const AMELIORATIONS = {
    degats:  { nom: 'Dégâts',      prix: 30, facteur: 1.5, crans: 8, par: 0.15, desc: '+15 % de dégâts' },
    cadence: { nom: 'Cadence',     prix: 35, facteur: 1.5, crans: 6, par: 0.10, desc: '+10 % de cadence' },
    vie:     { nom: 'Vie max',     prix: 25, facteur: 1.45, crans: 8, par: 20,  desc: '+20 points de vie (et soigne)' },
    aimant:  { nom: 'Aimant',      prix: 20, facteur: 1.6, crans: 4, par: 1.2,  desc: 'Ramasse la ferraille de plus loin' },
    defense: { nom: 'Atelier',     prix: 45, facteur: 1.7, crans: 5, par: 0.2,  desc: '+20 % de vie et de dégâts aux défenses' },
  };

  // ─── les vagues ───
  // nombre de zombies de la vague n, combien peuvent être debout en même temps, la pause avant la suivante, le renfort de vie et de vitesse
  const VAGUES = {
    nombre: (n) => Math.round(12 + n * 7 + n * n * 0.6),
    simultanes: (n) => Math.min(42, 14 + n * 3),
    cadence: (n) => Math.min(6, 1.4 + n * 0.35), // zombies qui sortent par seconde
    pause: 9,           // secondes entre deux vagues (on peut passer)
    vie: (n) => 1 + Math.max(0, n - 1) * 0.11,
    vitesse: (n) => 1 + Math.min(0.35, Math.max(0, n - 1) * 0.025),
    boss: (n) => n % 5 === 0, // un Mastodonte toutes les cinq vagues
    caisse: (n) => (n === 1 ? 1 : n % 2 === 0 ? 2 : 1), // caisses d'armes posées au début de la vague
    prime: (n) => 20 + n * 10, // points de fin de vague
  };
  // la série : tuer vite donne un multiplicateur de points (fenêtre en secondes, paliers de victimes)
  const SERIE = { fenetre: 2.2, paliers: [[25, 4], [12, 3], [5, 2]] };

  // ─── les arènes ───
  // taille : le côté du carré jouable (m) ; sol et herbe : couleurs ; obstacles : murs et caisses (r : rectangle centré [x, z, largeur, profondeur, hauteur]),
  // rochers et arbres (c : cercle [x, z, rayon]) ; sorties : où entrent les zombies (sur les bords) ; depart : où commence le survivant
  const ARENES = {
    jardin: {
      nom: 'Le Jardin', desc: 'Un potager clos de murets, des rochers et deux vieux chênes.', taille: 44,
      sol: '#9DBF5C', sol2: '#8DB052', bord: '#C9B48A', ciel: '#BFE3F2', brume: '#CFE7D9',
      depart: [0, 0],
      obstacles: [
        { type: 'muret', r: [-12, -3, 1.4, 16, 1.1] }, { type: 'muret', r: [12, -3, 1.4, 16, 1.1] },
        { type: 'muret', r: [-11.3, 5.4, 2.8, 1.4, 0.7] },
        { type: 'caisses', r: [-4.5, 6.5, 3, 3, 0.9] },
        { type: 'rocher', c: [-8, -11, 1.3] }, { type: 'rocher', c: [6, 7, 1.6] }, { type: 'rocher', c: [-14.5, 12, 1.1] }, { type: 'rocher', c: [9.5, -14, 1.0] },
        { type: 'arbre', c: [-15, 16.5, 1.0] }, { type: 'arbre', c: [16, 15, 1.0] }, { type: 'arbre', c: [17, -17, 0.9] },
        { type: 'puits', c: [3, -9, 1.1] },
      ],
      sorties: [[0, -21], [-21, 0], [21, 0], [0, 21], [-19, -19], [19, 19], [19, -19], [-19, 19]],
    },
    parking: {
      nom: 'Le Parking', desc: 'Des voitures abandonnées devant le supermarché. Attention aux coins.', taille: 50,
      sol: '#8C9096', sol2: '#7F838A', bord: '#5E6168', ciel: '#C9D6E3', brume: '#C4CBD3',
      depart: [0, 4],
      obstacles: [
        { type: 'voiture', r: [-10, -6, 2.0, 4.0, 1.4], couleur: '#D9534F' }, { type: 'voiture', r: [-6.5, -6, 2.0, 4.0, 1.4], couleur: '#4F7BD9' },
        { type: 'voiture', r: [6.5, -6, 2.0, 4.0, 1.4], couleur: '#E8C547' }, { type: 'voiture', r: [10, -6.5, 2.0, 4.0, 1.4], couleur: '#EDEDED' },
        { type: 'voiture', r: [-9, 10, 4.0, 2.0, 1.4], couleur: '#5BB37A' }, { type: 'voiture', r: [9, 11, 4.0, 2.0, 1.4], couleur: '#8E6BD1' },
        { type: 'muret', r: [0, -16, 18, 1.2, 1.6] },
        { type: 'caddie', c: [3, 2, 0.6] }, { type: 'caddie', c: [-2.5, 15, 0.6] },
        { type: 'benne', r: [-19, 18, 3.2, 1.8, 1.6] }, { type: 'benne', r: [19, -2, 1.8, 3.2, 1.6] },
        { type: 'lampadaire', c: [0, -6, 0.35] }, { type: 'lampadaire', c: [0, 10.5, 0.35] },
      ],
      sorties: [[-24, -10], [24, -10], [-24, 12], [24, 12], [0, 24], [-12, 24], [12, 24], [-20, -22], [20, -22]],
    },
    ferme: {
      nom: 'La Ferme', desc: 'Des bottes de foin, une grange et des clôtures. Les zombies arrivent des champs.', taille: 56,
      sol: '#B5C467', sol2: '#A4B65A', bord: '#9A7B4F', ciel: '#F2D9B5', brume: '#EBD9B8',
      depart: [0, 6],
      obstacles: [
        { type: 'grange', r: [0, -12, 10, 7, 4.2] },
        { type: 'foin', c: [-9, 2, 1.0] }, { type: 'foin', c: [-7.2, 3.4, 1.0] }, { type: 'foin', c: [8.5, 5, 1.0] }, { type: 'foin', c: [12, -2, 1.0] },
        { type: 'cloture', r: [-16, 10, 10, 0.4, 0.9] }, { type: 'cloture', r: [16, 10, 10, 0.4, 0.9] },
        { type: 'cloture', r: [-21, -2, 0.4, 12, 0.9] }, { type: 'cloture', r: [21, -2, 0.4, 12, 0.9] },
        { type: 'tracteur', r: [10, 16, 2.4, 3.6, 2.2] },
        { type: 'arbre', c: [-18, 20, 1.1] }, { type: 'arbre', c: [-22, -20, 1.1] }, { type: 'arbre', c: [22, -18, 1.0] },
        { type: 'rocher', c: [-4, 15, 1.2] }, { type: 'puits', c: [-12, -10, 1.1] },
      ],
      sorties: [[-27, 0], [27, 0], [0, 27], [-14, 27], [14, 27], [-27, -24], [27, -24], [-27, 22], [27, 22]],
    },
  };
  const ORDRE_ARENES = ['jardin', 'parking', 'ferme'];
  // une arène se débloque quand on a atteint cette vague sur la précédente (records de la sauvegarde)
  const DEBLOCAGE = { jardin: 0, parking: 5, ferme: 8 };

  return { JOUEUR, ARMES, ARME_DE_BASE, ZOMBIES, DEFENSES, AMELIORATIONS, VAGUES, SERIE, ARENES, ORDRE_ARENES, DEBLOCAGE };
});
