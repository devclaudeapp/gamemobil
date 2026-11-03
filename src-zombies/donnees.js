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
  };
  const ORDRE_ARENES = ['jardin', 'parking', 'ferme'];
  // une arène se débloque quand on a atteint cette vague sur la précédente (records de la sauvegarde)
  const DEBLOCAGE = { jardin: 0, parking: 5, ferme: 8 };

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

  return { RARETE, DEFI, BOSS, XP, ATOUTS, CRITIQUE, GRENADE, MEDAILLES, BUNKER, JOUEUR, ARMES, ARME_DE_BASE, ZOMBIES, DEFENSES, AMELIORATIONS, VAGUES, SERIE, ARENES, ORDRE_ARENES, DEBLOCAGE };
});
