/* OPÉRATION PONCIN — les règles chiffrées : le joueur (et ses postures), l'arsenal (neuf vraies armes, deux emplacements), les objets,
   les modes, les réglages du salon (défauts, bornes, normalisation), le niveau et l'équipement des robots, le hasard rejouable.
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node pour les tests. Voir src-poncin/ARCHITECTURE.md (« Lot Gameplay : contrat »)
   et, pour l'origine des chiffres, la conception du lot Gameplay (§ 3, 5, 6). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PREGLES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ─── le joueur (mètres, secondes) ───
  // Les champs « historiques » (taille, tailleAccroupi, oeil, oeilAccroupi, vitesseAccroupi) restent : la partie actuelle (entrée sans
  // niveaux course / couche / vise) les utilise tels quels. Les postures v2 (table ci-dessous) servent dès que l'entrée les demande.
  const JOUEUR = {
    rayon: 0.35, taille: 1.8, tailleAccroupi: 1.2, oeil: 1.6, oeilAccroupi: 1.0, vitesse: 5.2, vitesseAccroupi: 2.4, vitesseRecul: 0.8,
    saut: 5.0, gravite: 14, vie: 100, armureMax: 50, marche: 0.45 /* hauteur de marche franchie */,
    // ─── v2 (§ 3) ───
    course: 7.0,
    accel: { sol: 14, air: 2.2 },     // k = 1 − e^(−accel·dt) : la vitesse rejoint la consigne au même rythme quel que soit le pas
    // œil, haut de capsule, bande de la tête (couché : rayon de la sphère de la tête), vitesse (null : élan de la glissade),
    // dispersion × (null : pas de tir en course), bruit (portée en m, l'ouïe des robots)
    postures: {
      debout: { oeil: 1.60, haut: 1.80, tete: 0.35, vitesse: 5.2, dispersion: 1.0, bruit: 10 },
      course: { oeil: 1.60, haut: 1.80, tete: 0.35, vitesse: 7.0, dispersion: null, bruit: 16 },
      accroupi: { oeil: 1.05, haut: 1.25, tete: 0.32, vitesse: 2.6, dispersion: 0.7, bruit: 4 },
      glisse: { oeil: 0.85, haut: 1.00, tete: 0.30, vitesse: null, dispersion: 1.3, bruit: 12 },
      couche: { oeil: 0.42, haut: 0.55, tete: 0.2, vitesse: 1.1, dispersion: 0.5, bruit: 0 },
    },
    // durées des transitions (s) : debout ↔ accroupi, vers et depuis couché (depuis debout / depuis accroupi), le corps qui se relève
    // pour sauter d'accroupi, l'entrée et la sortie de la glissade ; pendant une transition vers ou depuis couché : vitesse × 0,3, pas de tir
    transitions: { accroupi: 0.18, coucheDebout: 0.6, coucheAccroupi: 0.45, sautAccroupi: 0.1, glisse: 0.18, vitesseCouche: 0.3 },
    // la course : niveau demandé, debout, au sol, avant ≥ 0,7, |atan2(côté, avant)| ≤ 40°, vise < 0,1, pas de tir ; tirer la coupe et
    // repousse le premier tir de 0,18 s (le temps de remonter l'arme)
    courir: { avant: 0.7, angle: 40 * Math.PI / 180, vise: 0.1, remonte: 0.18 },
    // la glissade : départ en course à |v| ≥ 6 m/s (au moins 0,8 s après la précédente), à min(11 ; |v| + 1,6) ; a = −(2 + 0,6·v) −
    // 0,8·g·p/√(1 + p²) ; le côté infléchit de 1,2 m/s² au plus ; fin sous 3 m/s, contre un mur, ou par un saut qui garde 90 %
    glissade: { vMin: 6.0, elan: 1.6, vMax: 11, f0: 2.0, kf: 0.6, gPente: 0.8, fin: 3.0, attente: 0.8, inflechir: 1.2, sautGarde: 0.9, mur: 0.5 },
    couche: { penteMax: 0.35, place: 0.8 },       // se coucher : au sol, pente ≤ 35 %, et la place (!monde.bloque(x, z, 0,8))
    reception: { vy: -7, facteur: 0.5, duree: 0.25 }, // une chute à plus de 7 m/s : vitesse × 0,5 pendant 0,25 s
    pente: { montee: 0.8, plancher: 0.6, descente: 0.3, plafond: 1.15 }, // montée ×(1 − 0,8·p) ≥ 0,6 ; descente ×(1 + 0,3·|p|) ≤ 1,15
  };

  // ─── l'arsenal (§ 5, livraison 2 « Vraies armes ») : neuf armes réelles, deux emplacements ───
  // Champs : id, nom, classe (PREGLES.CLASSES), role ('principale' | 'secondaire'), modele (= id : poncin/armes/<id>.glb), degats (par
  // balle, ou par plomb), plombs, cadence (tirs/s), semiAuto (garder le doigt appuyé tire au rythme maximal), chargeur, reserve,
  // recharge (s), dispersion (rad, à la hanche), dispersionMouvement (rad, en plus à 5,2 m/s), portee (m), chute : [début, fin, minimum]
  // (pleine puissance jusqu'à début, puis baisse linéaire jusqu'à minimum à fin), tete (multiplicateur), recul (rad : le regard se
  // relève de recul × 0,6), vitesse (facteur de déplacement arme en main), changement (temps pour la sortir, s), gonfle (ouverture du
  // viseur par tir, retombe de 3,2/s), visee : { viseur: 'lunette' | 'point' | 'fer', zoom, dispersion (facteur de la dispersion de
  // hanche), vitesse (facteur de déplacement), entree (mise en joue, s), oeil (point de mire du modèle, mesuré par le rendu : null) },
  // couleur (la pastille du HUD, par classe).
  // Temps pour éliminer 100 PV (sans armure, au corps, à portée utile ; ⌈100 / dégâts⌉ balles, (n − 1) / cadence) — les duels de
  // test/poncin-armes.test.js le vérifient dans la simulation :
  //   AK-74 5 × 24, 8,5/s → 0,47 s ; M4 5 × 22, 8,8/s → 0,45 s ; UMP 5 × 22, 10/s → 0,40 s ; MP9 7 × 15, 15/s → 0,40 s ;
  //   pompe 9 plombs × 15 → un coup jusqu'à 8 m (plus à 10 m : la gerbe s'ouvre, les plombs faiblissent) ; M24 75 (tête × 2 = 150), 0,8/s, et AWM 90 (× 2), 0,75/s, plus lourd : un coup à la tête, deux au corps ;
  //   M1911 4 × 30, 3,3/s → 0,91 s ; P226 5 × 22, 4,5/s → 0,89 s.
  const CLASSES = { fusil: 'Fusil d’assaut', mitraillette: 'Mitraillette', pompe: 'Fusil à pompe', sniper: 'Fusil de précision', pistolet: 'Pistolet' };
  const VISEE = (viseur, zoom, dispersion, vitesse, entree) => ({ viseur, zoom, dispersion, vitesse, entree, oeil: null });
  const ARMES = [
    { id: 'ak74', nom: 'AK-74', classe: 'fusil', role: 'principale', modele: 'ak74', degats: 24, plombs: 1, cadence: 8.5, semiAuto: false, chargeur: 30, reserve: 120, recharge: 2.3, dispersion: 0.034, dispersionMouvement: 0.032, portee: 150, chute: [30, 90, 0.7], tete: 1.5, recul: 0.016, vitesse: 1, changement: 0.45, gonfle: 0.26, visee: VISEE('point', 1.5, 0.28, 0.6, 0.24), couleur: '#E8A25A' },
    { id: 'm4', nom: 'M4', classe: 'fusil', role: 'principale', modele: 'm4', degats: 22, plombs: 1, cadence: 8.8, semiAuto: false, chargeur: 30, reserve: 120, recharge: 2.1, dispersion: 0.028, dispersionMouvement: 0.028, portee: 150, chute: [35, 100, 0.72], tete: 1.5, recul: 0.012, vitesse: 1, changement: 0.42, gonfle: 0.2, visee: VISEE('point', 1.5, 0.26, 0.62, 0.22), couleur: '#E8A25A' },
    { id: 'ump', nom: 'UMP', classe: 'mitraillette', role: 'principale', modele: 'ump', degats: 22, plombs: 1, cadence: 10, semiAuto: false, chargeur: 25, reserve: 125, recharge: 2.0, dispersion: 0.036, dispersionMouvement: 0.018, portee: 80, chute: [12, 35, 0.5], tete: 1.4, recul: 0.011, vitesse: 1.03, changement: 0.36, gonfle: 0.18, visee: VISEE('point', 1.45, 0.5, 0.72, 0.18), couleur: '#5FC2D9' },
    { id: 'mp9', nom: 'MP9', classe: 'mitraillette', role: 'principale', modele: 'mp9', degats: 15, plombs: 1, cadence: 15, semiAuto: false, chargeur: 30, reserve: 120, recharge: 1.8, dispersion: 0.042, dispersionMouvement: 0.014, portee: 70, chute: [10, 30, 0.45], tete: 1.4, recul: 0.008, vitesse: 1.05, changement: 0.32, gonfle: 0.11, visee: VISEE('point', 1.4, 0.55, 0.75, 0.16), couleur: '#5FC2D9' },
    { id: 'pompe', nom: 'Fusil à pompe', classe: 'pompe', role: 'principale', modele: 'pompe', degats: 15, plombs: 9, cadence: 1.2, semiAuto: false, chargeur: 6, reserve: 30, recharge: 2.8, dispersion: 0.055, dispersionMouvement: 0.02, portee: 40, chute: [6, 22, 0.15], tete: 1.25, recul: 0.07, vitesse: 0.97, changement: 0.5, gonfle: 0.8, visee: VISEE('fer', 1.25, 0.85, 0.7, 0.2), couleur: '#7FCF7A' },
    { id: 'm24', nom: 'M24', classe: 'sniper', role: 'principale', modele: 'm24', degats: 75, plombs: 1, cadence: 0.8, semiAuto: false, chargeur: 5, reserve: 25, recharge: 3.0, dispersion: 0.06, dispersionMouvement: 0.08, portee: 300, chute: [120, 300, 0.85], tete: 2, recul: 0.06, vitesse: 0.92, changement: 0.6, gonfle: 1, visee: VISEE('lunette', 4, 0.02, 0.42, 0.3), couleur: '#B8A6FF' },
    { id: 'awm', nom: 'AWM', classe: 'sniper', role: 'principale', modele: 'awm', degats: 90, plombs: 1, cadence: 0.75, semiAuto: false, chargeur: 5, reserve: 20, recharge: 3.4, dispersion: 0.065, dispersionMouvement: 0.09, portee: 300, chute: [140, 300, 0.85], tete: 2, recul: 0.075, vitesse: 0.88, changement: 0.65, gonfle: 1, visee: VISEE('lunette', 4, 0.016, 0.38, 0.3), couleur: '#B8A6FF' },
    { id: 'm1911', nom: 'M1911', classe: 'pistolet', role: 'secondaire', modele: 'm1911', degats: 30, plombs: 1, cadence: 3.3, semiAuto: true, chargeur: 7, reserve: 35, recharge: 1.6, dispersion: 0.02, dispersionMouvement: 0.015, portee: 60, chute: [15, 45, 0.6], tete: 1.6, recul: 0.04, vitesse: 1.05, changement: 0.3, gonfle: 0.4, visee: VISEE('fer', 1.25, 0.5, 0.85, 0.14), couleur: '#7FB3FF' },
    { id: 'p226', nom: 'P226', classe: 'pistolet', role: 'secondaire', modele: 'p226', degats: 22, plombs: 1, cadence: 4.5, semiAuto: true, chargeur: 15, reserve: 45, recharge: 1.5, dispersion: 0.018, dispersionMouvement: 0.013, portee: 60, chute: [18, 50, 0.6], tete: 1.6, recul: 0.03, vitesse: 1.05, changement: 0.28, gonfle: 0.3, visee: VISEE('fer', 1.25, 0.5, 0.85, 0.13), couleur: '#7FB3FF' },
  ];
  // l'ordre du réseau (indices dans l'instantané) : repart à zéro avec la VERSION 2 du réseau, puis ne fait que s'allonger
  const ARMES_ID = ['ak74', 'm4', 'ump', 'mp9', 'pompe', 'm24', 'awm', 'm1911', 'p226'];
  const PAR_ID = Object.create(null); for (const a of ARMES) PAR_ID[a.id] = a;
  const arme = (id) => PAR_ID[id] || ARMES[0]; // un id inconnu rend la première arme (l'AK-74)
  const estArme = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PAR_ID, id);
  function degatsA(a, distance, tete) { // dégâts d'un plomb à cette distance
    const [d0, d1, mini] = a.chute, k = distance <= d0 ? 1 : distance >= d1 ? mini : 1 - (1 - mini) * (distance - d0) / (d1 - d0);
    return Math.round(a.degats * k * (tete ? a.tete : 1));
  }
  // les objets à ramasser : soin, armure, caisse de munitions (remplit les deux réserves), armes réelles (une par principale, sous son
  // id). Une arme au sol remplace la principale jusqu'à la mort (ou remplit sa réserve si c'est déjà la sienne). 'precision' : l'ancien
  // nom des cartes (zones.armes), un fusil de précision que le mode remplace par une vraie arme (alias: true, jamais posé tel quel).
  const OBJETS = {
    soin: { type: 'soin', vie: 50, retour: 15 }, armure: { type: 'armure', armure: 50, retour: 25 },
    munitions: { type: 'munitions', retour: 15 },
  };
  for (const a of ARMES) if (a.role === 'principale') OBJETS[a.id] = { type: 'arme', arme: a.id, retour: a.classe === 'sniper' ? 25 : 20 };
  OBJETS.precision = { type: 'arme', arme: 'm24', retour: 25, alias: true };

  // ─── les modes ───
  const MODES = {
    arene: { duree: 180, reapparition: 3, scoreVictoire: 25, bots: { min: 3, max: 5, defaut: 4 }, invincible: 1.5, points: { kill: 100, serie3: 50, tete: 25 } },
    // l'Extraction (8 min) : 1 à 3 humains ensemble (equipes vrai, le défaut) ou chacun pour soi, contre des robots gardiens (leur
    // nombre suit le niveau, pas le réglage bots) ; coffres à ouvrir (ouverture s, à distance m), deux points d'extraction qui s'ouvrent
    // à mi-partie (rester duree s dans le cercle de rayon m sans être touché) ; à terre en équipe : relever (duree s à distance m) dans
    // les delai s ; détail : extraction.js et butin.js
    extraction: { duree: 480, durees: [300, 480, 720], zone: 'bourg', zones: ['bourg', 'tout'], humains: [1, 3], invincible: 1.5,
      coffres: { aire: 2500, min: 20, max: 40, ecart: 10 }, ouverture: { duree: 1.2, distance: 1.8, bouge: 0.6 }, ramasser: { duree: 0.5, distance: 1.6 },
      extraction: { duree: 8, rayon: 10, ouvre: 0.5 }, relever: { duree: 4, distance: 2, delai: 30, vie: 0.3 },
      gardiens: { facile: { legendaire: 2, epique: 1, rare: 0, patrouilles: 1, max: 10 }, normal: { legendaire: 3, epique: 2, rare: 0.5, patrouilles: 2, max: 14 }, fort: { legendaire: 3, epique: 2, rare: 1, patrouilles: 3, max: 18 }, parHumain: 2, plafond: 24 },
      formats: ['ensemble', 'equipes', 'chacun'], nEquipes: [2, 3], // ensemble : tous les humains contre les robots ; equipes : 2 ou 3 équipes rivales ; chacun pour soi
      largage: { decalage: 30, gardes: 2, arrivee: 20, legendaire: 0.4 },                 // la caisse tombe 30 s après l'ouverture des extractions ; 2 gardes 20 s après
      coffreFort: { duree: 4 },                                                          // il faut la clé (dans un coffre rare ou mieux) ; 4 s pour l'ouvrir
      boss: { vie: 6, armure: 1, ralenti: 0.3, renforts: 0.5, nRenforts: { facile: 1, normal: 2, fort: 3 }, points: 100 }, // le Gardien : vie × 6, armure pleine, 30 % plus lent ; renforts à 50 %
      poids: { seuil: 4, parCase: 0.025, max: 0.2 },                                     // au-delà de 4 cases, −2,5 % de vitesse par case, −20 % au plus
      bruits: { ouvrir: 18, coffreFort: 30, tirSilencieux: 8, tir: 30 },                 // la portée (m) à laquelle les robots entendent
      prime: { periode: 30, premier: 60, seuil: 150, part: 0.25, min: 25, max: 250 } },  // le plus riche révélé toutes les 30 s ; prime = 25 % de ce qu'il porte, 25 à 250
  };
  // ─── le niveau des bots : temps de réaction (s), erreur de visée (rad, qui se resserre en visant), probabilité de tirer quand la cible est dans le viseur ───
  const BOTS = {
    facile: { reaction: 0.65, erreur: 0.10, resserre: 1.2, precision: 0.55, vise: 2.2, champ: 1.75 },
    normal: { reaction: 0.42, erreur: 0.065, resserre: 1.8, precision: 0.75, vise: 3.2, champ: 1.9 },
    fort: { reaction: 0.26, erreur: 0.04, resserre: 2.6, precision: 0.9, vise: 4.5, champ: 2.0 },
  };
  const NOMS_BOTS = ['Boulon', 'Clé-à-molette', 'Pixel', 'Ressort', 'Turbo', 'Biscotte', 'Gyro', 'Tournevis', 'Cerdon', 'Veyron'];
  const COULEURS = ['#FF6B8B', '#5FD3A4', '#7FB3FF', '#FFC84A', '#B8A6FF', '#FF9F5A', '#4FD1E0', '#F48FD8'];

  // ─── les réglages du salon (§ 6) : l'hôte décide ; en solo, le même panneau ───
  const SALON = {
    max: 6, zones: ['place', 'centre', 'eglise', 'bourg', 'rivieres', 'tout'], durees: [180, 300, 600, 0], scores: [10, 25, 50],
    heures: ['jour', 'soir', 'nuit'], meteos: ['clair', 'brouillard', 'pluie'],
    vies: { normale: { vie: 100, armureMax: 50 }, unCoup: { vie: 1, armureMax: 0 }, costaud: { vie: 200, armureMax: 100 } },
    reapparitions: { rapide: 3, normale: 6, lente: 10, aucune: -1 },
    manches: [1, 3, 5], // « dernier debout » (réapparition 'aucune') : nombre de manches
    modes: ['arene', 'extraction'], // les modes jouables (l'ordre des menus)
  };
  // bots : 4 en solo, 0 dans un salon (l'hôte les ajoute) ; manches : lu seulement quand reapparition = 'aucune'
  const DEFAUT_REGLAGES = Object.freeze({
    v: 2, mode: 'arene', zone: 'centre', duree: 180, score: 25, heure: 'jour', meteo: 'clair', equipes: false,
    bots: 4, niveau: 'normal', tirAllie: false, vie: 'normale', reapparition: 'rapide', manches: 3, objets: true, aide: true,
    armes: Object.freeze(ARMES_ID.slice()), formatExtraction: 'ensemble', equipesExtraction: 2,
  });
  const DEFAUT_EQUIP = Object.freeze({ p: 'ak74', s: 'p226' });
  const dans = (v, liste, defaut) => (liste.indexOf(v) >= 0 ? v : defaut);
  const cle = (v, obj, defaut) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(obj, v) ? v : defaut);
  const bool = (v, defaut) => (typeof v === 'boolean' ? v : defaut);
  // la liste des armes autorisées : connues, sans doublon, dans l'ordre du réseau, au moins une principale et une secondaire
  function armesPermises(liste) {
    const vues = Array.isArray(liste) ? liste : DEFAUT_REGLAGES.armes, out = [];
    for (const id of ARMES_ID) if (estArme(id) && vues.indexOf(id) >= 0) out.push(id);
    if (!out.some((id) => PAR_ID[id].role === 'principale')) out.unshift(DEFAUT_EQUIP.p);
    if (!out.some((id) => PAR_ID[id].role === 'secondaire')) out.push(DEFAUT_EQUIP.s);
    return ARMES_ID.filter((id) => out.indexOf(id) >= 0);
  }
  // normaliserReglages(r, { humains }) → copie bornée (r n'est jamais modifié) : une valeur inconnue prend le défaut ; bots ≤ 6 − humains
  function normaliserReglages(r, o) {
    r = r && typeof r === 'object' ? r : {};
    const D = DEFAUT_REGLAGES;
    let humains = o && o.humains != null && Number.isFinite(+o.humains) ? Math.round(+o.humains) : 1; humains = Math.max(0, Math.min(SALON.max, humains)); // 0 : une partie de robots seuls (PJEU, tests)
    const n = (v, liste, defaut) => { const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN; return liste.indexOf(x) >= 0 ? x : defaut; };
    let bots = typeof r.bots === 'number' || (typeof r.bots === 'string' && r.bots.trim() !== '') ? Math.round(+r.bots) : D.bots;
    if (!Number.isFinite(bots)) bots = D.bots;
    bots = Math.max(0, Math.min(SALON.max - humains, bots));
    // l'Extraction : zone 'bourg' par défaut, durée 300 / 480 / 720 s (480 par défaut ; jamais sans limite) ; formatExtraction
    // ('ensemble' par défaut, 'equipes' : equipesExtraction 2 | 3 équipes rivales, 'chacun' : chacun pour soi) ; equipes = format ≠ 'chacun'
    const mode = dans(r.mode, SALON.modes, D.mode), X = mode === 'extraction' ? MODES.extraction : null;
    return {
      v: 2, mode, zone: dans(r.zone, SALON.zones, X ? X.zone : D.zone), duree: X ? n(r.duree, X.durees, X.duree) : n(r.duree, SALON.durees, D.duree), score: n(r.score, SALON.scores, D.score),
      heure: dans(r.heure, SALON.heures, D.heure), meteo: dans(r.meteo, SALON.meteos, D.meteo), equipes: X ? dans(r.formatExtraction, X.formats, 'ensemble') !== 'chacun' : bool(r.equipes, D.equipes),
      bots, niveau: cle(r.niveau, BOTS, D.niveau), tirAllie: bool(r.tirAllie, D.tirAllie), vie: cle(r.vie, SALON.vies, D.vie),
      reapparition: cle(r.reapparition, SALON.reapparitions, D.reapparition), manches: n(r.manches, SALON.manches, D.manches),
      objets: bool(r.objets, D.objets), aide: bool(r.aide, D.aide), armes: armesPermises(r.armes),
      formatExtraction: dans(r.formatExtraction, MODES.extraction.formats, 'ensemble'), equipesExtraction: n(r.equipesExtraction, MODES.extraction.nEquipes, 2),
    };
  }
  // equipementDe(demande, reglages) → { p, s } : demande { p, s } ou 'm4+m1911' ; une arme non autorisée (ou du mauvais
  // emplacement) devient la première arme autorisée de l'emplacement (DEFAUT_EQUIP d'abord, s'il est autorisé)
  function equipementDe(demande, reglages) {
    const permises = armesPermises(reglages && Array.isArray(reglages.armes) ? reglages.armes : DEFAUT_REGLAGES.armes);
    let p = null, s = null;
    if (typeof demande === 'string') { const m = demande.split('+'); p = m[0]; s = m[1]; } else if (demande && typeof demande === 'object') { p = demande.p; s = demande.s; }
    const choisir = (id, role, defaut) => {
      if (estArme(id) && PAR_ID[id].role === role && permises.indexOf(id) >= 0) return id;
      if (permises.indexOf(defaut) >= 0) return defaut;
      for (const a of permises) if (PAR_ID[a].role === role) return a;
      return defaut;
    };
    return { p: choisir(p, 'principale', DEFAUT_EQUIP.p), s: choisir(s, 'secondaire', DEFAUT_EQUIP.s) };
  }
  // l'équipement d'un robot (§ 11) : tiré au hasard rejouable parmi les armes permises, pondéré par classe (les fusils de précision
  // plus souvent chez les « fort ») ; rend { p, s }
  const POIDS_ROBOTS = { fusil: 3, mitraillette: 2, pompe: 2, sniper: 1, pistolet: 1 };
  function equipementRobot(rnd, reglages, niveau) {
    const permises = armesPermises(reglages && Array.isArray(reglages.armes) ? reglages.armes : DEFAUT_REGLAGES.armes);
    const tirer = (role) => {
      let total = 0; const ps = [];
      for (const id of permises) { const a = PAR_ID[id]; if (a.role !== role) continue; const w = a.classe === 'sniper' && niveau === 'fort' ? 2 : POIDS_ROBOTS[a.classe] || 1; ps.push(id, w); total += w; }
      let r = rnd() * total;
      for (let i = 0; i < ps.length; i += 2) { r -= ps[i + 1]; if (r < 0) return ps[i]; }
      return ps.length ? ps[ps.length - 2] : null;
    };
    return equipementDe({ p: tirer('principale'), s: tirer('secondaire') }, { armes: permises });
  }

  // ─── hasard rejouable ───
  function mulberry32(a) { a = a >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  return { JOUEUR, ARMES, ARMES_ID, CLASSES, arme, estArme, degatsA, OBJETS, MODES, BOTS, NOMS_BOTS, COULEURS, SALON, DEFAUT_REGLAGES, DEFAUT_EQUIP, normaliserReglages, equipementDe, armesPermises, equipementRobot, mulberry32, hash };
});
