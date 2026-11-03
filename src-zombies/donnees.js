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
  // perce : nombre de zombies traversés, recul : poussée sur le zombie touché, classe : le son, rarete : poids dans les caisses, depuis : la
  // première vague où une caisse peut la donner ; modele : le blaster du Blaster Kit de Kenney (zombies/modeles/armes/), teinte : sa couleur ;
  // famille : l'icône du HUD. mode : 'balle' (instantanée, par défaut), 'flamme' (un cône continu ; feu : brûlure, gel : ralentit),
  // 'tesla' (un éclair qui saute de zombie en zombie : rebonds, saut), 'roquette' (part droit, explose : souffle), 'obus' (en cloche,
  // explose ; flaque : une flaque qui ronge), 'scie' (un disque qui traverse tout et revient). salve : balles tirées d'affilée ;
  // montee : secondes pour atteindre la pleine cadence ; sansPerte : traverse sans perdre de dégâts ; explose : petite explosion à l'impact.
  const ARMES = {
    pistolet:      { nom: 'Pistolet',          famille: 'pistolet', modele: 'r', teinte: '#7FA8E8', degats: 14, cadence: 3.2,  portee: 9,   balles: 1,  dispersion: 0.03, munitions: Infinity, perce: 0, recul: 0.25, classe: 'pistolet',     couleur: '#5B8BD9', rarete: 0,  depuis: 1 },
    revolver:      { nom: 'Revolver',          famille: 'pistolet', modele: 'a', teinte: '#C9C2B6', degats: 38, cadence: 1.6,  portee: 11,  balles: 1,  dispersion: 0.02, munitions: 48,  perce: 1, recul: 0.6,  classe: 'pistolet',     couleur: '#C9563C', rarete: 30, depuis: 1 },
    jumeaux:       { nom: 'Pistolets jumeaux', famille: 'pistolet', modele: 'r', teinte: '#F2C94C', degats: 12, cadence: 7,    portee: 8.5, balles: 1,  dispersion: 0.1,  munitions: 160, perce: 0, recul: 0.2,  classe: 'pistolet',     couleur: '#E0B23A', rarete: 24, depuis: 2 },
    mitraillette:  { nom: 'Mitraillette',      famille: 'mitraillette', modele: 'd', degats: 11, cadence: 10,  portee: 9,   balles: 1,  dispersion: 0.09, munitions: 220, perce: 0, recul: 0.12, classe: 'mitraillette', couleur: '#3E9C6B', rarete: 24, depuis: 3 },
    vipere:        { nom: 'Vipère',            famille: 'mitraillette', modele: 'j', teinte: '#7BD389', degats: 8,  cadence: 15,  portee: 7,   balles: 1,  dispersion: 0.14, munitions: 300, perce: 0, recul: 0.1,  classe: 'mitraillette', couleur: '#5DBB63', rarete: 18, depuis: 4 },
    pompe:         { nom: 'Fusil à pompe',     famille: 'pompe', modele: 'l', degats: 13, cadence: 1.15, portee: 7,   balles: 7,  dispersion: 0.32, munitions: 30,  perce: 0, recul: 1.0,  classe: 'pompe',        couleur: '#8A5A2B', rarete: 26, depuis: 2 },
    doublecanon:   { nom: 'Double canon',      famille: 'pompe', modele: 'o', teinte: '#B07A48', degats: 16, cadence: 0.8,  portee: 6.5, balles: 12, dispersion: 0.5,  munitions: 20,  perce: 0, recul: 1.6,  classe: 'pompe',        couleur: '#A0522D', rarete: 14, depuis: 5 },
    pompeauto:     { nom: 'Pompe automatique', famille: 'pompe', modele: 'q', degats: 10, cadence: 3,    portee: 6.5, balles: 6,  dispersion: 0.36, munitions: 60,  perce: 0, recul: 0.8,  classe: 'pompe',        couleur: '#7A4E2A', rarete: 10, depuis: 8 },
    cloueuse:      { nom: 'Cloueuse',          famille: 'pompe', modele: 'q', teinte: '#9AA7B8', degats: 11, cadence: 5,    portee: 9,   balles: 3,  dispersion: 0.18, munitions: 150, perce: 1, recul: 0.3,  classe: 'mitraillette', couleur: '#8E9AAB', rarete: 12, depuis: 6 },
    fusil:         { nom: 'Fusil d’assaut',    famille: 'fusil', modele: 'g', degats: 19, cadence: 6.5,  portee: 12,  balles: 1,  dispersion: 0.05, munitions: 180, perce: 1, recul: 0.2,  classe: 'fusil',        couleur: '#6C6F7D', rarete: 18, depuis: 4 },
    rafale:        { nom: 'Fusil à rafales',   famille: 'fusil', modele: 'p', degats: 24, cadence: 2.2,  portee: 13,  balles: 1,  dispersion: 0.03, munitions: 150, perce: 1, recul: 0.25, classe: 'fusil',        couleur: '#4F5D75', rarete: 14, depuis: 6, salve: 3 },
    minigun:       { nom: 'Minigun',           famille: 'mitraillette', modele: 'k', teinte: '#8C8C8C', degats: 10, cadence: 22,  portee: 10,  balles: 1,  dispersion: 0.12, munitions: 500, perce: 0, recul: 0.12, classe: 'mitraillette', couleur: '#5F6368', rarete: 6, depuis: 12, montee: 1.2 },
    precision:     { nom: 'Carabine',          famille: 'sniper', modele: 'e', degats: 95, cadence: 0.9,  portee: 16,  balles: 1,  dispersion: 0.0,  munitions: 28,  perce: 4, recul: 1.2,  classe: 'sniper',       couleur: '#9B6BD6', rarete: 10, depuis: 5 },
    canon:         { nom: 'Canon de précision', famille: 'sniper', modele: 'f', teinte: '#6E5AA8', degats: 240, cadence: 0.5, portee: 20,  balles: 1,  dispersion: 0.0,  munitions: 16,  perce: 10, recul: 2.0, classe: 'sniper',       couleur: '#5B3FA0', rarete: 6, depuis: 10, sansPerte: true },
    arbalete:      { nom: 'Arbalète',          famille: 'sniper', modele: 'n', teinte: '#A47148', degats: 70, cadence: 1.4,  portee: 13,  balles: 1,  dispersion: 0.01, munitions: 40,  perce: 3, recul: 0.9,  classe: 'arc',          couleur: '#8B5A2B', rarete: 12, depuis: 3 },
    roquettes:     { nom: 'Lance-roquettes',   famille: 'lanceur', modele: 'h', degats: 150, cadence: 0.8, portee: 14,  balles: 1,  dispersion: 0.0,  munitions: 12,  perce: 0, recul: 0,    classe: 'roquette',     couleur: '#C0392B', rarete: 8, depuis: 7, mode: 'roquette', souffle: 2.8, vitesse: 16 },
    lancegrenades: { nom: 'Lance-grenades',    famille: 'lanceur', modele: 'm', degats: 90, cadence: 1.4,  portee: 11,  balles: 1,  dispersion: 0.0,  munitions: 24,  perce: 0, recul: 0,    classe: 'roquette',     couleur: '#556B2F', rarete: 12, depuis: 5, mode: 'obus', souffle: 2.4 },
    acide:         { nom: 'Lance-acide',       famille: 'lanceur', modele: 'm', teinte: '#A8E04A', degats: 25, cadence: 1.6, portee: 10,  balles: 1,  dispersion: 0.0,  munitions: 30,  perce: 0, recul: 0,    classe: 'acide',        couleur: '#8CC63F', rarete: 10, depuis: 6, mode: 'obus', souffle: 1.6, flaque: { r: 1.9, dps: 26, duree: 4 } },
    scie:          { nom: 'Lance-scies',       famille: 'lanceur', modele: 'b', teinte: '#D0D6DE', degats: 45, cadence: 1.5, portee: 11,  balles: 1,  dispersion: 0.0,  munitions: 30,  perce: 99, recul: 0.4, classe: 'scie',         couleur: '#B8C2CC', rarete: 9, depuis: 8, mode: 'scie', vitesse: 13 },
    tesla:         { nom: 'Fusil Tesla',       famille: 'energie', modele: 'i', teinte: '#6FD3FF', degats: 32, cadence: 2.5, portee: 9,   balles: 1,  dispersion: 0.0,  munitions: 80,  perce: 0, recul: 0.2,  classe: 'tesla',        couleur: '#3BB7F0', rarete: 9, depuis: 6, mode: 'tesla', rebonds: 4, saut: 3.4 },
    laser:         { nom: 'Laser',             famille: 'energie', modele: 'n', teinte: '#FF5C8A', degats: 26, cadence: 4,   portee: 16,  balles: 1,  dispersion: 0.0,  munitions: 90,  perce: 99, recul: 0.1, classe: 'laser',        couleur: '#FF3D6E', rarete: 8, depuis: 9, sansPerte: true },
    plasma:        { nom: 'Fusil à plasma',    famille: 'energie', modele: 'c', teinte: '#B48CFF', degats: 30, cadence: 3,   portee: 12,  balles: 1,  dispersion: 0.02, munitions: 90,  perce: 0, recul: 0.3,  classe: 'laser',        couleur: '#9B6BFF', rarete: 8, depuis: 9, explose: { souffle: 1.4, degats: 28 } },
    flammes:       { nom: 'Lance-flammes',     famille: 'flamme', modele: 'b', teinte: '#FF8A3A', degats: 6,  cadence: 10,  portee: 4.8, balles: 1,  dispersion: 0.0,  munitions: 300, perce: 0, recul: 0.05, classe: 'flamme',       couleur: '#FF7A1A', rarete: 10, depuis: 4, mode: 'flamme', cone: 0.36, feu: { dps: 16, duree: 2.5 } },
    cryo:          { nom: 'Cryo-canon',        famille: 'flamme', modele: 'c', teinte: '#9FE7FF', degats: 3,  cadence: 10,  portee: 5,   balles: 1,  dispersion: 0.0,  munitions: 300, perce: 0, recul: 0,    classe: 'cryo',         couleur: '#7FD6F5', rarete: 9, depuis: 7, mode: 'flamme', cone: 0.32, gel: { ralenti: 0.4, duree: 2.5 } },
  };
  // les raretés, d'après le poids dans les caisses (l'écran de la collection et la couleur du nom à la caisse)
  const RARETE = (a) => (a.rarete === 0 || a.rarete >= 20 ? 'commune' : a.rarete >= 12 ? 'rare' : a.rarete >= 8 ? 'epique' : 'legendaire');
  const ARME_DE_BASE = 'pistolet';

  // ─── les zombies ───
  // vie, vitesse (m/s), degats par coup et coups/s, rayon, ferraille laissée, points, taille (rendu), couleurs : peau, haut, bas ;
  // crache : attaque à distance (portee, cadence, degats, vitesse du crachat) ; depuis : la première vague où il paraît ; poids : sa part dans une vague
  const ZOMBIES = {
    trainard:   { nom: 'Traînard',   vie: 34,   vitesse: 1.55, degats: 9,  cadence: 1.0, rayon: 0.42, ferraille: 1,  points: 10,  taille: 1.0,  peau: '#8DBF6A', haut: '#7C6A9E', bas: '#4D5A7A', depuis: 1, poids: 10, teinte: '#FFFFFF' },
    coureur:    { nom: 'Coureur',    vie: 22,   vitesse: 3.6,  degats: 6,  cadence: 1.6, rayon: 0.36, ferraille: 1,  points: 15,  taille: 0.88, peau: '#A6C97A', haut: '#D9824B', bas: '#3F3F4A', depuis: 2, poids: 5, teinte: '#F2E2A0' },
    costaud:    { nom: 'Costaud',    vie: 180,  vitesse: 1.1,  degats: 22, cadence: 0.7, rayon: 0.7,  ferraille: 4,  points: 40,  taille: 1.45, peau: '#6FA35A', haut: '#5A6E8C', bas: '#3B3B3B', depuis: 3, poids: 2, teinte: '#9FB0C8' },
    cracheur:   { nom: 'Cracheur',   vie: 46,   vitesse: 1.35, degats: 7,  cadence: 1.0, rayon: 0.42, ferraille: 2,  points: 25,  taille: 1.0,  peau: '#B7D35A', haut: '#4E8A6E', bas: '#5C4A3A', depuis: 4, poids: 2, crache: { portee: 7.5, cadence: 0.45, degats: 10, vitesse: 7 }, teinte: '#C8F07A' },
    // les talents : kamikaze (explose au contact ou à sa mort : souffle, degats), saut (bondit par-dessus les obstacles vers sa proie),
    // flamme (souffle du feu de près), pare (chance de parer une balle qui arrive de face), crochet (lance une chaîne qui tire le survivant
    // vers lui), invoque (relève les morts récents en traînards)
    kamikaze:   { nom: 'Kamikaze',   vie: 30,   vitesse: 2.7,  degats: 6,  cadence: 1.0, rayon: 0.4,  ferraille: 2,  points: 20,  taille: 0.95, peau: '#C9D86A', haut: '#C0392B', bas: '#3B3B3B', depuis: 6, poids: 2.5, teinte: '#FF8A6A', kamikaze: { souffle: 2.3, degats: 32 } },
    sauteur:    { nom: 'Sauteur',    vie: 40,   vitesse: 2.2,  degats: 8,  cadence: 1.4, rayon: 0.38, ferraille: 2,  points: 22,  taille: 0.9,  peau: '#9BCB5A', haut: '#5B7F3A', bas: '#3F3F4A', depuis: 7, poids: 2.5, teinte: '#B8F58A', saut: { portee: 9, duree: 0.6, recharge: 3.5, degats: 12 } },
    flammeur:   { nom: 'Cracheur de feu', vie: 70, vitesse: 1.4, degats: 8,  cadence: 1.0, rayon: 0.45, ferraille: 3,  points: 30,  taille: 1.05, peau: '#C9B26A', haut: '#8C3A1C', bas: '#4A3A2A', depuis: 8, poids: 1.8, teinte: '#FFB060', flamme: { portee: 4.2, cone: 0.42, dps: 18 } },
    sabreur:    { nom: 'Sabreur',    vie: 90,   vitesse: 1.9,  degats: 16, cadence: 1.2, rayon: 0.45, ferraille: 3,  points: 35,  taille: 1.05, peau: '#A9C08A', haut: '#4A5A78', bas: '#2B2F3A', depuis: 9, poids: 1.6, teinte: '#9DB8E8', pare: 0.6 },
    geolier:    { nom: 'Geôlier',    vie: 150,  vitesse: 1.25, degats: 14, cadence: 0.9, rayon: 0.55, ferraille: 4,  points: 45,  taille: 1.2,  peau: '#8FA878', haut: '#4A3A5A', bas: '#2B2230', depuis: 11, poids: 1.1, teinte: '#B49AD8', crochet: { portee: 9, vitesse: 15, recharge: 5.5, degats: 8 } },
    invocateur: { nom: 'Invocateur', vie: 110,  vitesse: 1.15, degats: 8,  cadence: 0.8, rayon: 0.45, ferraille: 5,  points: 55,  taille: 1.12, peau: '#D8E0C8', haut: '#5A2A6A', bas: '#2B2230', depuis: 12, poids: 0.9, teinte: '#E8D8FF', invoque: { portee: 11, recharge: 6, nombre: 3, distance: 6.5 } },
    // les boss : un toutes les cinq vagues, à tour de rôle (VAGUES.boss) ; modèles KayKit (src-zombies/modeles.js), squelette « large » ou « medium »
    golem:      { nom: 'Golem squelette', vie: 1400, vitesse: 1.0,  degats: 35, cadence: 0.6, rayon: 1.05, ferraille: 25, points: 400, taille: 2.2,  peau: '#C9C2B0', haut: '#5A6070', bas: '#3B3B44', depuis: 5, poids: 0, boss: true, modele: 'golem', rig: 'large' },
    loupgarou:  { nom: 'Loup-garou',      vie: 1000, vitesse: 2.3,  degats: 24, cadence: 1.1, rayon: 0.9,  ferraille: 25, points: 450, taille: 1.9,  peau: '#8A7560', haut: '#C0392B', bas: '#3B4A6B', depuis: 10, poids: 0, boss: true, modele: 'loup-garou', rig: 'medium' },
    golemglace: { nom: 'Golem de glace',  vie: 2300, vitesse: 0.85, degats: 45, cadence: 0.5, rayon: 1.15, ferraille: 30, points: 550, taille: 2.4,  peau: '#CFE6F5', haut: '#7FB3D9', bas: '#5A87B0', depuis: 15, poids: 0, boss: true, modele: 'golem-glace', rig: 'large' },
    vampire:    { nom: 'Vampire',         vie: 1700, vitesse: 1.7,  degats: 30, cadence: 0.9, rayon: 0.9,  ferraille: 30, points: 600, taille: 2.0,  peau: '#E8D9C8', haut: '#8C1C2C', bas: '#2B2230', depuis: 20, poids: 0, boss: true, modele: 'vampire', rig: 'medium' },
  };

  // ─── les défenses (achetées avec la ferraille, posées aux pieds du survivant) ───
  // max : combien on peut en avoir en même temps à la vague 1, puis +1 toutes les « plus » vagues ; vie : les zombies les cassent
  const DEFENSES = {
    tourelle:  { nom: 'Tourelle',  prix: 15,  vie: 140, rayon: 0.55, max: 1, plus: 3, portee: 8.5, cadence: 4,   degats: 9,  depuis: 1, desc: 'Tire seule sur le zombie le plus proche.' },
    barricade: { nom: 'Barricade', prix: 10,  vie: 260, rayon: 0.9,  max: 2, plus: 2,                                      depuis: 1, desc: 'Un mur de planches : les zombies doivent le casser.' },
    mine:      { nom: 'Mine',      prix: 12,  vie: 1,   rayon: 0.4,  max: 2, plus: 2, souffle: 3.2, degats: 160,           depuis: 2, desc: 'Explose quand un zombie marche dessus.' },
    mortier:   { nom: 'Mortier',   prix: 40,  vie: 120, rayon: 0.6,  max: 1, plus: 5, portee: 14, cadence: 0.45, degats: 70, souffle: 2.6, minimum: 3, depuis: 4, desc: 'Lance des obus sur les groupes, de loin.' },
    epouvantail: { nom: 'Épouvantail', prix: 120, vie: 500, rayon: 0.6, max: 1, plus: 99, attire: 9,                  depuis: 6, desc: 'Attire les zombies proches pendant que tu tires.' },
    // la deuxième colonne de l'atelier
    tourellefeu:   { nom: 'Tourelle à flammes', prix: 45, vie: 170, rayon: 0.55, max: 1, plus: 4, portee: 4.6, cadence: 8, degats: 5, cone: 0.42, feu: { dps: 12, duree: 2 }, depuis: 5, desc: 'Arrose de flammes ce qui s’approche.' },
    tourelletesla: { nom: 'Tourelle Tesla', prix: 60, vie: 150, rayon: 0.55, max: 1, plus: 5, portee: 7.5, cadence: 1.2, degats: 32, rebonds: 3, saut: 3.2, depuis: 8, desc: 'Un éclair qui saute de zombie en zombie.' },
    claymore:      { nom: 'Claymore', prix: 18, vie: 1, rayon: 0.4, max: 2, plus: 3, souffle: 4.8, cone: 0.75, declenche: 3.2, degats: 230, depuis: 3, desc: 'Explose vers l’avant quand un zombie passe devant.' },
    baril:         { nom: 'Baril explosif', prix: 8, vie: 40, rayon: 0.45, max: 3, plus: 2, souffle: 3.4, degats: 180, depuis: 2, desc: 'Une balle, un coup de griffe, une explosion : il saute.' },
    // le générateur à protéger (objectif de l'Ascension) : pas à l'atelier
    generateur:    { nom: 'Générateur', prix: Infinity, vie: 1600, rayon: 0.95, max: 0, plus: 999, attire: 15, depuis: 999, horsAtelier: true, desc: 'À protéger coûte que coûte.' },
    radio:         { nom: 'Poste radio', prix: 35, vie: 220, rayon: 0.45, max: 1, plus: 99, attire: 13, duree: 8, souffle: 3.2, degats: 200, depuis: 7, desc: 'Sa musique attire les zombies, puis il explose.' },
  };

  // ─── les améliorations (permanentes pour la partie ; le prix monte à chaque cran) ───
  const AMELIORATIONS = {
    degats:  { nom: 'Dégâts',      prix: 30, facteur: 1.5, crans: 8, par: 0.15, desc: '+15 % de dégâts' },
    cadence: { nom: 'Cadence',     prix: 35, facteur: 1.5, crans: 6, par: 0.10, desc: '+10 % de cadence' },
    vie:     { nom: 'Vie max',     prix: 25, facteur: 1.45, crans: 8, par: 20,  desc: '+20 points de vie (et soigne)' },
    aimant:  { nom: 'Aimant',      prix: 20, facteur: 1.6, crans: 4, par: 1.2,  desc: 'Ramasse la ferraille de plus loin' },
    defense: { nom: 'Atelier',     prix: 45, facteur: 1.7, crans: 5, par: 0.2,  desc: '+20 % de vie et de dégâts aux défenses' },
  };

  // ─── l'expérience de la partie : chaque zombie abattu en donne (ses points / 10) ; chaque niveau propose trois atouts au choix ───
  const XP = { parPoint: 0.1, pour: (n) => Math.round(6 + n * 5 + n * n * 0.9) }; // l'expérience qu'il faut pour passer du niveau n au suivant
  // les atouts (rangs cumulables, jusqu'à max) : par = l'effet d'un rang
  const ATOUTS = {
    degats:   { nom: 'Gros calibre',     desc: '+12 % de dégâts',                      max: 6, par: 0.12, ico: 'degats' },
    cadence:  { nom: 'Gâchette folle',   desc: '+10 % de cadence de tir',              max: 6, par: 0.10, ico: 'cadence' },
    multi:    { nom: 'Tir double',       desc: 'Une balle de plus à chaque tir',       max: 2, par: 1,    ico: 'multi' },
    perce:    { nom: 'Balles perforantes', desc: 'Chaque balle traverse un zombie de plus', max: 3, par: 1, ico: 'perce' },
    critique: { nom: 'Œil de lynx',      desc: '+8 % de chances de coup critique (×2)', max: 4, par: 0.08, ico: 'critique' },
    vie:      { nom: 'Cuir épais',       desc: '+25 points de vie (et soigne)',        max: 5, par: 25,   ico: 'vie' },
    regen:    { nom: 'Pansements',       desc: 'Récupère 1,5 point de vie par seconde', max: 3, par: 1.5, ico: 'regen' },
    vitesse:  { nom: 'Baskets',          desc: '+8 % de vitesse de course',            max: 3, par: 0.08, ico: 'vitesse' },
    portee:   { nom: 'Lunette',          desc: '+12 % de portée',                      max: 3, par: 0.12, ico: 'portee' },
    aimant:   { nom: 'Gros aimant',      desc: 'Ramasse la ferraille de 1,5 m plus loin', max: 3, par: 1.5, ico: 'aimant' },
    butin:    { nom: 'Fouilleur',        desc: '+30 % de ferraille sur les zombies',   max: 3, par: 0.3,  ico: 'butin' },
    grenade:  { nom: 'Artificier',       desc: 'Grenades plus fortes, rechargées plus vite', max: 3, par: 0.2, ico: 'grenade' },
  };
  // les coups critiques (balles du survivant) ; la grenade (un bouton : elle part vers le plus gros groupe de zombies)
  const CRITIQUE = { chance: 0.05, mult: 2 };
  const GRENADE = { recharge: 9, degats: 110, souffle: 2.9, portee: 10, vol: 0.55 };

  // ─── le Bunker : des améliorations permanentes, achetées entre les parties avec les médailles gagnées en jouant ───
  // médailles d'une partie : 2 par vague atteinte, 1 par tranche de 25 zombies, 5 par boss abattu
  const MEDAILLES = { parVague: 2, parZombies: 25, parBoss: 5 };
  const BUNKER = {
    vie:       { nom: 'Gilet renforcé',   desc: '+10 points de vie au départ',       crans: 5, prix: [6, 12, 20, 30, 45], par: 10 },
    ferraille: { nom: 'Caisse à outils',  desc: '+8 de ferraille au départ',         crans: 5, prix: [5, 10, 16, 24, 35], par: 8 },
    degats:    { nom: 'Munitions maison', desc: '+5 % de dégâts',                    crans: 5, prix: [8, 15, 25, 38, 55], par: 0.05 },
    xp:        { nom: 'Carnet de survie', desc: '+10 % d’expérience',                crans: 5, prix: [6, 12, 20, 30, 45], par: 0.1 },
    grenade:   { nom: 'Poudre sèche',     desc: '−10 % de recharge des grenades',    crans: 3, prix: [8, 18, 32], par: 0.1 },
    arme:      { nom: 'Planque d’armes',  desc: 'Commence avec une arme trouvée',    crans: 1, prix: [40], par: 1 },
  };

  // ─── les vagues ───
  const BOSS = ['golem', 'loupgarou', 'golemglace', 'vampire'];
  // nombre de zombies de la vague n, combien peuvent être debout en même temps, la pause avant la suivante, le renfort de vie et de vitesse
  const VAGUES = {
    nombre: (n) => Math.round(12 + n * 7 + n * n * 0.6),
    simultanes: (n) => Math.min(42, 14 + n * 3),
    cadence: (n) => Math.min(6, 1.4 + n * 0.35), // zombies qui sortent par seconde
    pause: 9,           // secondes entre deux vagues (on peut passer)
    vie: (n) => 1 + Math.max(0, n - 1) * 0.15,
    vitesse: (n) => 1 + Math.min(0.35, Math.max(0, n - 1) * 0.025),
    boss: (n) => (n % 5 === 0 ? BOSS[(n / 5 - 1) % BOSS.length] : null), // un boss toutes les cinq vagues, à tour de rôle, puis on recommence
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
    // ─── les arènes suivantes (une vague à atteindre dans la précédente pour les ouvrir : DEBLOCAGE) ───
    // laves : des rectangles [x, z, l, p] qui brûlent qui s'y tient (survivants et zombies) ; meteo : l'ambiance par défaut de l'arène
    cimetiere: {
      nom: 'Le Cimetière', desc: 'Des tombes basses (on tire par-dessus), une crypte et des grilles rouillées.', taille: 48,
      sol: '#6E8A5A', sol2: '#647F52', bord: '#4A4A52', ciel: '#9A9AB8', brume: '#8E8EA8', meteo: 'crepuscule',
      depart: [0, 3],
      obstacles: [
        { type: 'crypte', r: [0, -13, 8, 5, 3.6] },
        ...[-12, -8, -4, 4, 8, 12].flatMap((x) => [{ type: 'tombe', r: [x, -3, 1.1, 0.5, 0.8] }, { type: 'tombe', r: [x + 1, 9, 1.1, 0.5, 0.8] }]),
        { type: 'grille', r: [-17, 0, 0.3, 16, 1.6] }, { type: 'grille', r: [17, 0, 0.3, 16, 1.6] },
        { type: 'cypres', c: [-10, -14, 0.8] }, { type: 'cypres', c: [10, -14, 0.8] }, { type: 'cypres', c: [-19, 18, 0.8] }, { type: 'cypres', c: [19, 18, 0.8] },
        { type: 'rocher', c: [6, 15, 1.1] }, { type: 'puits', c: [-6, 15, 1.0] },
      ],
      sorties: [[0, -23], [-23, 0], [23, 0], [0, 23], [-21, -21], [21, 21], [21, -21], [-21, 21]],
    },
    port: {
      nom: 'Le Port', desc: 'Un labyrinthe de conteneurs sur les quais. On s’y perd, eux aussi.', taille: 52,
      sol: '#9AA0A8', sol2: '#8E949C', bord: '#3E6E9E', ciel: '#BFD8EE', brume: '#B8CCDD',
      depart: [0, 2],
      obstacles: [
        { type: 'conteneur', r: [-12, -8, 6, 2.4, 2.6], couleur: '#C0392B' }, { type: 'conteneur', r: [-12, -5.4, 6, 2.4, 2.6], couleur: '#2E86C1' },
        { type: 'conteneur', r: [12, -8, 6, 2.4, 2.6], couleur: '#27AE60' }, { type: 'conteneur', r: [6, 9, 2.4, 6, 2.6], couleur: '#E67E22' },
        { type: 'conteneur', r: [-6, 10, 2.4, 6, 2.6], couleur: '#8E44AD' }, { type: 'conteneur', r: [-19, 8, 6, 2.4, 2.6], couleur: '#F1C40F' },
        { type: 'conteneur', r: [19, 4, 2.4, 6, 2.6], couleur: '#16A085' }, { type: 'conteneur', r: [0, -16, 6, 2.4, 2.6], couleur: '#D35400' },
        { type: 'grue', r: [17, -17, 3, 3, 6] },
        { type: 'bitte', c: [-6, -14, 0.4] }, { type: 'bitte', c: [6, -14, 0.4] }, { type: 'bitte', c: [-21, -18, 0.4] },
        { type: 'caisses', r: [5, -2, 3, 3, 0.9] }, { type: 'caisses', r: [-15, 17, 3, 3, 0.9] },
      ],
      sorties: [[-25, -12], [25, -12], [-25, 14], [25, 14], [0, 25], [-14, 25], [14, 25], [-22, -24], [22, -24]],
    },
    place: {
      nom: 'La Place du village', desc: 'La fontaine, le kiosque à musique et les terrasses du café.', taille: 46,
      sol: '#C8B89A', sol2: '#BCAC8E', bord: '#8A7A64', ciel: '#CFE4F2', brume: '#D6DDE2',
      depart: [0, 6],
      obstacles: [
        { type: 'fontaine', c: [0, -2, 2.2] }, { type: 'kiosque', c: [-12, -11, 2.4] },
        { type: 'banc', r: [6, -2, 0.6, 2.2, 0.6] }, { type: 'banc', r: [-6, -2, 0.6, 2.2, 0.6] },
        { type: 'terrasse', r: [12, 10, 3, 3, 0.9] }, { type: 'terrasse', r: [-12, 11, 3, 3, 0.9] }, { type: 'terrasse', r: [13, -11, 3, 3, 0.9] },
        { type: 'arbre', c: [-18, 0, 1.0] }, { type: 'arbre', c: [18, 0, 1.0] }, { type: 'arbre', c: [0, 18, 1.0] }, { type: 'arbre', c: [0, -18, 1.0] },
        { type: 'lampadaire', c: [7, 7, 0.35] }, { type: 'lampadaire', c: [-7, 7, 0.35] },
      ],
      sorties: [[0, -22], [-22, 0], [22, 0], [-10, 22], [10, 22], [-20, -20], [20, 20], [20, -20], [-20, 20]],
    },
    plage: {
      nom: 'La Plage', desc: 'Du sable, des parasols, un bateau échoué. La marée monte… de zombies.', taille: 54,
      sol: '#E8D49A', sol2: '#DFC98C', bord: '#4AA3C8', ciel: '#BFE6F5', brume: '#CFEAF2',
      depart: [0, 4],
      obstacles: [
        { type: 'bateau', r: [-12, -10, 3.2, 9, 2.4] }, { type: 'cabane', r: [14, -12, 4, 3, 2.6] }, { type: 'cabane', r: [18, 12, 3, 4, 2.6] },
        ...[[-6, 6], [6, 8], [-15, 12], [10, -2], [-2, -12]].map(([x, z]) => ({ type: 'parasol', c: [x, z, 0.5] })),
        { type: 'rocher', c: [-22, 4, 1.6] }, { type: 'rocher', c: [-20, 8, 1.1] }, { type: 'rocher', c: [22, -2, 1.3] },
        { type: 'caisses', r: [3, 16, 3, 3, 0.9] },
      ],
      sorties: [[-26, -12], [26, -12], [-26, 14], [26, 14], [0, 26], [-14, 26], [14, 26], [0, -26]],
    },
    chantier: {
      nom: 'Le Chantier', desc: 'Parpaings, bétonnière et échafaudages : des recoins partout.', taille: 50,
      sol: '#B59C7A', sol2: '#A8906E', bord: '#E8A33A', ciel: '#D8DFE6', brume: '#D2CFC8',
      depart: [0, 3],
      obstacles: [
        { type: 'echafaudage', r: [0, -14, 14, 2.4, 4.5] }, { type: 'betonniere', c: [9, 4, 1.3] },
        { type: 'parpaings', r: [-9, -4, 3, 2, 1.2] }, { type: 'parpaings', r: [-14, 8, 2, 3, 1.2] }, { type: 'parpaings', r: [12, 12, 3, 2, 1.2] }, { type: 'parpaings', r: [5, -6, 2, 2, 1.2] },
        { type: 'muret', r: [-19, -6, 1.2, 12, 1.4] }, { type: 'muret', r: [19, 2, 1.2, 12, 1.4] },
        { type: 'benne', r: [-6, 15, 3.2, 1.8, 1.6] }, { type: 'conteneur', r: [16, -6, 2.4, 6, 2.6], couleur: '#E8A33A' },
      ],
      sorties: [[-23.5, -12], [23.5, -12], [-23.5, 14], [23.5, 14], [0, 23.5], [-14, 23.5], [14, 23.5], [-22, -23], [22, -23]],
    },
    supermarche: {
      nom: 'Le Supermarché', desc: 'Les rayons font des couloirs : gare aux allées sans issue.', taille: 48,
      sol: '#D8DCE0', sol2: '#CDD2D7', bord: '#7A828C', ciel: '#E8ECEF', brume: '#D9DEE3',
      depart: [0, 14],
      obstacles: [
        ...[-15, -9, -3, 3, 9, 15].map((x, i) => ({ type: 'rayon', r: [x, -3, 1.6, 16, 2.2], couleur: ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71', '#9B59B6', '#E67E22'][i] })),
        { type: 'comptoir', r: [-10, 15, 4, 1.4, 1.1] }, { type: 'comptoir', r: [10, 15, 4, 1.4, 1.1] },
        { type: 'caddie', c: [-5, 10, 0.6] }, { type: 'caddie', c: [6, 9, 0.6] }, { type: 'caddie', c: [-18, 13, 0.6] },
        { type: 'caisses', r: [18, -18, 3, 3, 0.9] },
      ],
      sorties: [[-23, -12], [23, -12], [-23, 0], [23, 0], [0, -23], [-12, -23], [12, -23], [-20, 22], [20, 22]],
    },
    foret: {
      nom: 'La Forêt', desc: 'Des sapins serrés et une cabane de bûcheron. On voit mal venir.', taille: 52,
      sol: '#5E8A44', sol2: '#557E3D', bord: '#4A3A28', ciel: '#A8C8B0', brume: '#9CB8A4', meteo: 'brouillard',
      depart: [0, 2],
      obstacles: [
        { type: 'cabane', r: [-10, -10, 5, 4, 3] },
        ...[[-16, 4], [-6, 10], [6, 12], [14, 4], [18, -8], [8, -14], [-2, -18], [-18, 16], [16, 18], [-20, -18], [3, -6], [-12, 18], [20, 14]].map(([x, z], i) => ({ type: 'sapin', c: [x, z, 0.8 + (i % 3) * 0.15] })),
        { type: 'rondins', r: [6, 2, 3, 1.2, 0.9] }, { type: 'rondins', r: [-4, 16, 1.2, 3, 0.9] },
        { type: 'rocher', c: [12, -3, 1.3] },
      ],
      sorties: [[-25, -12], [25, -12], [-25, 14], [25, 14], [0, 25], [-14, 25], [14, 25], [0, -25], [-22, -24], [22, -24]],
    },
    neon: {
      nom: 'Le Carrefour néon', desc: 'Un carrefour de nuit, entre les immeubles et leurs enseignes.', taille: 52,
      sol: '#3A3F4A', sol2: '#343843', bord: '#2A2E36', ciel: '#1C2433', brume: '#1C2433', meteo: 'nuit',
      depart: [0, 0],
      obstacles: [
        { type: 'immeuble', r: [-16, -16, 12, 12, 7], couleur: '#5A4A7A' }, { type: 'immeuble', r: [16, -16, 12, 12, 9], couleur: '#3A5A7A' },
        { type: 'immeuble', r: [-16, 16, 12, 12, 8], couleur: '#7A4A5A' }, { type: 'immeuble', r: [16, 16, 12, 12, 6], couleur: '#4A6A5A' },
        { type: 'voiture', r: [-4, -6, 2.0, 4.0, 1.4], couleur: '#FF3D9A' }, { type: 'voiture', r: [6, 5, 4.0, 2.0, 1.4], couleur: '#3DE0FF' },
        { type: 'neon', c: [-6, 6, 0.4], couleur: '#FF3D9A' }, { type: 'neon', c: [6, -6, 0.4], couleur: '#3DE0FF' }, { type: 'neon', c: [8, 9, 0.4], couleur: '#B8FF3D' },
        { type: 'benne', r: [-8, 2, 1.8, 3.2, 1.6] },
      ],
      sorties: [[0, -25], [0, 25], [-25, 0], [25, 0], [-4, -25], [4, 25], [-25, 4], [25, -4]],
    },
    volcan: {
      nom: 'Le Volcan', desc: 'Des rivières de lave entre les roches noires. Ne t’y arrête pas.', taille: 54,
      sol: '#5A4A44', sol2: '#4F403B', bord: '#2A2220', ciel: '#C87A5A', brume: '#A8705A', meteo: 'crepuscule',
      depart: [0, 4],
      obstacles: [
        { type: 'roche', c: [-10, -8, 1.8] }, { type: 'roche', c: [11, -10, 2.0] }, { type: 'roche', c: [-14, 12, 1.6] }, { type: 'roche', c: [14, 13, 1.7] },
        { type: 'roche', c: [0, -18, 2.4] }, { type: 'roche', c: [-20, -2, 1.5] }, { type: 'roche', c: [21, 2, 1.4] }, { type: 'roche', c: [4, 15, 1.2] },
      ],
      laves: [[-6, -4, 3, 12], [9, 10, 14, 2.6], [-15, 18, 10, 2.4], [16, -18, 2.4, 10]],
      sorties: [[-26, -12], [26, -12], [-26, 14], [26, 14], [0, 26], [-14, 26], [14, 26], [-22, -24], [22, -24]],
    },
  };
  const ORDRE_ARENES = ['jardin', 'parking', 'ferme', 'cimetiere', 'port', 'place', 'plage', 'chantier', 'supermarche', 'foret', 'neon', 'volcan'];
  // une arène se débloque quand on a atteint cette vague sur la précédente (records de la sauvegarde)
  const DEBLOCAGE = { jardin: 0, parking: 5, ferme: 8, cimetiere: 8, port: 9, place: 9, plage: 10, chantier: 10, supermarche: 11, foret: 11, neon: 12, volcan: 13 };

  // ─── le défi du jour : la même partie pour tout le monde ce jour-là (graine, arène et mutateur tirés de la date, heure de Paris),
  // sans les bonus du Bunker ; le meilleur score du jour part au classement (supabase/zombies-defi.sql)
  const DEFI = {
    mutateurs: [
      { id: 'ruee', nom: 'Ruée', texte: 'Les zombies courent 25 % plus vite. Points ×1,25.', zVitesse: 1.25, points: 1.25 },
      { id: 'cuir', nom: 'Peau dure', texte: 'Zombies 50 % plus résistants. Points ×1,5.', zVie: 1.5, points: 1.5 },
      { id: 'maree', nom: 'Marée', texte: '50 % de zombies en plus à chaque vague.', nombre: 1.5 },
      { id: 'artificier', nom: 'Artificier', texte: 'La grenade se recharge 2,5 fois plus vite.', grenade: 0.4 },
      { id: 'chevrotine', nom: 'Chevrotine', texte: 'Tu pars avec le fusil à pompe.', arme: 'pompe' },
      { id: 'lynx', nom: 'Œil de faucon', texte: 'Tu pars avec la carabine.', arme: 'precision' },
      { id: 'ferrailleur', nom: 'Ferrailleur', texte: 'Deux fois plus de ferraille sur les zombies.', ferraille: 2 },
      { id: 'disette', nom: 'Disette', texte: 'Moitié moins de ferraille, mais points ×2.', ferraille: 0.5, points: 2 },
    ],
    // le score le plus haut possible en atteignant la vague v (le serveur refuse au-delà) : chaque zombie compté comme un Costaud
    // (40 pts) en série ×4 avec les points ×2, la vague à 1,5 fois son nombre, un boss par vague (600 × 4 × 2), et la prime
    borneScore(v) { let s = 0; for (let n = 1; n <= v; n++) s += Math.ceil(VAGUES.nombre(n) * 1.5) * 40 * 4 * 2 + 600 * 4 * 2 + VAGUES.prime(n); return s; },
  };

  // ─── l'Ascension : une campagne d'échelons sans fin ; chaque échelon (tiré de son numéro, le même pour tout le monde) a sa horde (deux
  // vedettes), sa météo, sa règle et son objectif (jeu.js : echelon(n)). foudre / meteore : des impacts annoncés (un cercle au sol), puis
  // une explosion qui touche tout le monde
  const ASCENSION = {
    meteos: {
      clair: { nom: 'Grand beau' }, crepuscule: { nom: 'Crépuscule' }, nuit: { nom: 'Nuit noire' }, brouillard: { nom: 'Brouillard' },
      orage: { nom: 'Orage', chute: { cadence: 0.4, delai: 1.0, souffle: 1.7, degats: 15 } },
      meteores: { nom: 'Pluie de météores', chute: { cadence: 0.45, delai: 1.5, souffle: 2.2, degats: 20 } },
      blackout: { nom: 'Black-out' },
    },
    regles: [
      { id: 'normale', nom: 'Règles normales', texte: 'Rien de spécial : la horde, et toi.', poids: 3 },
      { id: 'unpv', nom: 'Un seul point de vie', texte: 'Le moindre coup est fatal.', unPV: true, depuis: 7 },
      { id: 'blackout', nom: 'Black-out', texte: 'Plus une lumière : seulement ta lampe.', meteo: 'blackout', depuis: 4 },
      { id: 'rapides', nom: 'Ils courent', texte: 'Zombies 30 % plus rapides.', zVitesse: 1.3, depuis: 2 },
      { id: 'blindes', nom: 'Blindés', texte: 'Zombies 60 % plus résistants.', zVie: 1.6, depuis: 3 },
      { id: 'disette', nom: 'Disette', texte: 'Moitié moins de ferraille.', ferraille: 0.5, depuis: 2 },
      { id: 'sansatelier', nom: 'Sans atelier', texte: 'Pas de défenses : rien que tes armes.', sansAtelier: true, depuis: 3 },
      { id: 'arsenal', nom: 'Arsenal', texte: 'Une arme rare dès le départ.', armeRare: true, depuis: 1 },
      { id: 'artifice', nom: 'Feu d’artifice', texte: 'Des kamikazes partout.', vedette: 'kamikaze', depuis: 5 },
      { id: 'maree', nom: 'Marée', texte: '60 % de zombies en plus.', nombre: 1.6, depuis: 4 },
    ],
    objectifs: { vagues: 'Tenir', tues: 'Carnage', chrono: 'Résister', contrat: 'Contrat', generateur: 'Générateur' },
    recompense: (n) => 3 + Math.floor(n / 2), // les médailles d'un échelon réussi
    finitionTous: 3, // une finition d'arme tous les trois échelons
  };

  // ─── la collection ───
  // les survivants (Blocky Characters de Kenney, texture a … r ; le Gardien est le fossoyeur du Graveyard Kit) ; pour les obtenir : prix (des
  // médailles, au Vestiaire), ou un exploit (echelon : l'échelon de l'Ascension atteint ; boss, vague, defis, coop : voir ui.js) — les
  // secrets restent « ??? » tant qu'on ne les a pas
  const SURVIVANTS = {
    gardien:     { nom: 'Le Gardien', texture: null, depart: true },
    grandpere:   { nom: 'Grand-père', texture: 'a', prix: 20 },
    marcel:      { nom: 'Marcel', texture: 'b', prix: 20 },
    gamer:       { nom: 'Le Gamer', texture: 'c', prix: 30 },
    lila:        { nom: 'Lila', texture: 'e', prix: 30 },
    jardinier:   { nom: 'Le Jardinier', texture: 'f', prix: 40 },
    mecano:      { nom: 'La Mécano', texture: 'k', prix: 40 },
    aventurier:  { nom: 'L’Aventurier', texture: 'm', prix: 60 },
    professeur:  { nom: 'Le Professeur', texture: 'i', exploit: { echelon: 4 }, texte: 'Atteindre l’échelon 4 de l’Ascension' },
    gendarme:    { nom: 'Le Gendarme', texture: 'j', exploit: { echelon: 8 }, texte: 'Atteindre l’échelon 8' },
    pirate:      { nom: 'Le Pirate', texture: 'p', exploit: { echelon: 13 }, texte: 'Atteindre l’échelon 13' },
    agent:       { nom: 'L’Agent secret', texture: 'q', exploit: { echelon: 20 }, texte: 'Atteindre l’échelon 20' },
    mannequin:   { nom: 'Mannequin de crash-test', texture: 'd', exploit: { vague: 15 }, texte: 'Atteindre la vague 15 en partie libre' },
    robotrouge:  { nom: 'Robot rouge', texture: 'g', exploit: { boss: 5 }, texte: 'Abattre 5 boss' },
    robotviolet: { nom: 'Robot violet', texture: 'h', exploit: { boss: 25 }, texte: 'Abattre 25 boss', secret: true },
    ninja:       { nom: 'Le Ninja', texture: 'r', exploit: { defis: 5 }, texte: 'Jouer le défi du jour 5 jours différents' },
    marin:       { nom: 'Le Marin des abysses', texture: 'o', exploit: { coop: 3 }, texte: 'Finir 3 parties à plusieurs' },
    loyal:       { nom: 'Monsieur Loyal', texture: 'n', exploit: { tues: 5000 }, texte: 'Abattre 5 000 zombies en tout', secret: true },
    repenti:     { nom: 'Le Zombie repenti', texture: 'l', exploit: { echelon: 30 }, texte: 'Atteindre l’échelon 30', secret: true },
  };
  // les finitions d'armes : une couleur (et parfois une lueur) pour une arme, au choix ; une tous les 3 échelons de l'Ascension, dans cet ordre,
  // secrètes jusque-là ; arcenciel : la teinte tourne, spectre : translucide
  const FINITIONS = {
    or: { nom: 'Or', couleur: '#FFD24A', lueur: 0.15 }, onyx: { nom: 'Onyx', couleur: '#2E2E36' }, givre: { nom: 'Givre', couleur: '#BDEBFF', lueur: 0.1 },
    camouflage: { nom: 'Camouflage', couleur: '#6B7A3A' }, rubis: { nom: 'Rubis', couleur: '#E0115F', lueur: 0.12 }, cuivre: { nom: 'Cuivre', couleur: '#C77B3A' },
    neon: { nom: 'Néon', couleur: '#39FF14', lueur: 0.5 }, ivoire: { nom: 'Ivoire', couleur: '#F2EBD9' }, emeraude: { nom: 'Émeraude', couleur: '#1FAA59', lueur: 0.12 },
    lave: { nom: 'Lave', couleur: '#FF5A1A', lueur: 0.45 }, spectre: { nom: 'Spectre', couleur: '#8FF0FF', lueur: 0.3, translucide: true }, arcenciel: { nom: 'Arc-en-ciel', couleur: '#FF0000', lueur: 0.25, arcenciel: true },
  };
  const ORDRE_FINITIONS = ['or', 'onyx', 'givre', 'camouflage', 'rubis', 'cuivre', 'neon', 'ivoire', 'emeraude', 'lave', 'spectre', 'arcenciel'];
  // les émotes (une bulle au-dessus du survivant, vue des copains en coop) ; prix : au Vestiaire (sans prix : dès le départ)
  const EMOTES = {
    pouce: { nom: 'Bien joué', signe: '👍' }, rire: { nom: 'Mort de rire', signe: '😂' }, parici: { nom: 'Par ici !', signe: '📍' }, aide: { nom: 'À l’aide !', signe: '🆘' },
    peur: { nom: 'Au secours', signe: '😱', prix: 15 }, feu: { nom: 'En feu', signe: '🔥', prix: 15 }, crane: { nom: 'Trop facile', signe: '💀', prix: 25 }, coeur: { nom: 'Merci', signe: '❤️', prix: 25 },
  };

  return { SURVIVANTS, FINITIONS, ORDRE_FINITIONS, EMOTES, ASCENSION, RARETE, DEFI, BOSS, XP, ATOUTS, CRITIQUE, GRENADE, MEDAILLES, BUNKER, JOUEUR, ARMES, ARME_DE_BASE, ZOMBIES, DEFENSES, AMELIORATIONS, VAGUES, SERIE, ARENES, ORDRE_ARENES, DEBLOCAGE };
});
