/* OPÉRATION PONCIN — les règles chiffrées : le joueur (et ses postures), les blasters à peinture, les objets, les modes, les réglages du
   salon (défauts, bornes, normalisation), le niveau des bots, le hasard rejouable.
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

  // ─── les blasters à peinture (§ 5) ───
  // chute : [début, fin, minimum] — pleine puissance jusqu'à début, puis baisse linéaire jusqu'à minimum (fraction) à fin.
  // role : 'principale' | 'secondaire' ; modele : le modèle du pack (Blaster Kit) ; semiAuto : garder le doigt appuyé tire au rythme
  // maximal ; vitesse : facteur de déplacement arme en main ; changement : temps pour la sortir (s) ; gonfle : ouverture du viseur par tir
  // (retombe de 3,2/s) ; visee : { viseur, zoom, dispersion (facteur de la dispersion de hanche), vitesse (facteur de déplacement),
  // entree (mise en joue, s), oeil (point de mire du modèle, donné par le lot du pack : null en attendant) }.
  // option : hors de la liste des armes autorisées par défaut.
  const ARMES = [
    { id: 'rafale', nom: 'Blaster rafale', role: 'principale', modele: 'blaster-d', degats: 13, plombs: 1, cadence: 9, semiAuto: false, chargeur: 30, reserve: 120, recharge: 1.6, dispersion: 0.022, dispersionMouvement: 0.02, portee: 70, chute: [18, 45, 0.55], tete: 1.5, recul: 0.012, vitesse: 1, changement: 0.36, gonfle: 0.22, visee: { viseur: 'aucun', zoom: 1.25, dispersion: 0.45, vitesse: 0.6, entree: 0.18, oeil: null }, couleur: '#FF6B8B' },
    { id: 'pompe', nom: 'Pompe à peinture', role: 'principale', modele: 'blaster-h', degats: 11, plombs: 8, cadence: 1.15, semiAuto: false, chargeur: 6, reserve: 24, recharge: 2.2, dispersion: 0.085, dispersionMouvement: 0.02, portee: 28, chute: [6, 20, 0.25], tete: 1.25, recul: 0.06, vitesse: 1, changement: 0.36, gonfle: 0.8, visee: { viseur: 'aucun', zoom: 1.1, dispersion: 0.8, vitesse: 0.7, entree: 0.15, oeil: null }, couleur: '#5FD3A4' },
    // Long-tir : la dispersion de hanche v2 est 0,03 (× 0,05 en visée = 0,0015). TANT QUE LA VISÉE N'EST PAS BRANCHÉE (lot 2/2), la partie
    // actuelle garde l'ancienne dispersion de hanche, dispersionAvantVisee = 0,0015 (PARMES.dispersion, mode historique) : le Long-tir
    // tire comme aujourd'hui. À retirer au branchement de la visée (et les robots viseront, § 11).
    { id: 'precision', nom: 'Long-tir', role: 'principale', modele: 'blaster-e', degats: 72, plombs: 1, cadence: 0.85, semiAuto: false, chargeur: 5, reserve: 20, recharge: 2.4, dispersion: 0.03, dispersionAvantVisee: 0.0015, dispersionMouvement: 0.06, portee: 160, chute: [80, 160, 0.8], tete: 1.6, recul: 0.05, vitesse: 0.95, changement: 0.4, gonfle: 1, visee: { viseur: 'lunette', zoom: 3, dispersion: 0.05, vitesse: 0.45, entree: 0.25, oeil: null }, couleur: '#B8A6FF' },
    { id: 'carabine', nom: 'Carabine Marqueur', role: 'principale', modele: 'blaster-f', degats: 30, plombs: 1, cadence: 3.2, semiAuto: true, chargeur: 10, reserve: 40, recharge: 1.9, dispersion: 0.012, dispersionMouvement: 0.035, portee: 110, chute: [40, 100, 0.7], tete: 1.5, recul: 0.03, vitesse: 0.95, changement: 0.36, gonfle: 0.45, visee: { viseur: 'point rouge', zoom: 1.6, dispersion: 0.25, vitesse: 0.55, entree: 0.2, oeil: null }, couleur: '#FFC84A' },
    { id: 'petoire', nom: 'Pistolet Pétoire', role: 'secondaire', modele: 'blaster-b', degats: 24, plombs: 1, cadence: 4, semiAuto: true, chargeur: 12, reserve: 48, recharge: 1.1, dispersion: 0.012, dispersionMouvement: 0.012, portee: 55, chute: [15, 40, 0.6], tete: 1.6, recul: 0.035, vitesse: 1.05, changement: 0.22, gonfle: 0.35, visee: { viseur: 'aucun', zoom: 1.2, dispersion: 0.4, vitesse: 0.75, entree: 0.12, oeil: null }, couleur: '#7FB3FF' },
    { id: 'arroseuse', nom: 'Mitraillette Arroseuse', role: 'secondaire', modele: 'blaster-k', degats: 8, plombs: 1, cadence: 14, semiAuto: false, chargeur: 24, reserve: 96, recharge: 1.3, dispersion: 0.04, dispersionMouvement: 0.008, portee: 30, chute: [8, 24, 0.45], tete: 1.4, recul: 0.008, vitesse: 1.05, changement: 0.25, gonfle: 0.15, visee: { viseur: 'aucun', zoom: 1.15, dispersion: 0.6, vitesse: 0.75, entree: 0.12, oeil: null }, couleur: '#4FD1E0' },
    { id: 'arrosoir', nom: 'Arrosoir', role: 'principale', option: true, modele: 'blaster-p', degats: 11, plombs: 1, cadence: 11, semiAuto: false, chargeur: 60, reserve: 120, recharge: 3.2, dispersion: 0.032, dispersionMouvement: 0.04, portee: 60, chute: [15, 45, 0.5], tete: 1.3, recul: 0.009, vitesse: 0.85, changement: 0.5, gonfle: 0.2, visee: { viseur: 'aucun', zoom: 1.2, dispersion: 0.6, vitesse: 0.5, entree: 0.25, oeil: null }, couleur: '#FF9F5A' },
  ];
  // l'ordre du réseau (indices dans l'instantané) : il ne fait que s'allonger ; 'splash' (Lance-bombes) est réservé, pas encore une arme
  const ARMES_ID = ['rafale', 'pompe', 'precision', 'carabine', 'petoire', 'arroseuse', 'arrosoir', 'splash'];
  const PAR_ID = Object.create(null); for (const a of ARMES) PAR_ID[a.id] = a;
  const arme = (id) => PAR_ID[id] || ARMES[0];
  const estArme = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PAR_ID, id);
  function degatsA(a, distance, tete) { // dégâts d'un plomb à cette distance
    const [d0, d1, mini] = a.chute, k = distance <= d0 ? 1 : distance >= d1 ? mini : 1 - (1 - mini) * (distance - d0) / (d1 - d0);
    return Math.round(a.degats * k * (tete ? a.tete : 1));
  }
  // les objets à ramasser : soin, armure, munitions (remplit les deux réserves), armes.
  // Une arme au sol (type 'arme') : aujourd'hui (mode historique) elle s'ajoute aux armes possédées ; avec les emplacements (v2), elle
  // remplace la principale jusqu'à la mort (ou remplit sa réserve si c'est déjà la sienne). 'arme' : l'arme posée est dite par la zone.
  const OBJETS = {
    pompe: { type: 'arme', arme: 'pompe', retour: 20 }, precision: { type: 'arme', arme: 'precision', retour: 25 },
    soin: { type: 'soin', vie: 50, retour: 15 }, armure: { type: 'armure', armure: 50, retour: 25 },
    munitions: { type: 'munitions', retour: 15 },
  };
  for (const a of ARMES) if (a.role === 'principale' && !OBJETS[a.id]) OBJETS[a.id] = { type: 'arme', arme: a.id, retour: 20 };

  // ─── les modes ───
  const MODES = {
    arene: { duree: 180, reapparition: 3, scoreVictoire: 25, bots: { min: 3, max: 5, defaut: 4 }, invincible: 1.5, points: { kill: 100, serie3: 50, tete: 25 } },
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
  };
  // bots : 4 en solo, 0 dans un salon (l'hôte les ajoute) ; manches : lu seulement quand reapparition = 'aucune'
  const DEFAUT_REGLAGES = Object.freeze({
    v: 2, mode: 'arene', zone: 'centre', duree: 180, score: 25, heure: 'jour', meteo: 'clair', equipes: false,
    bots: 4, niveau: 'normal', tirAllie: false, vie: 'normale', reapparition: 'rapide', manches: 3, objets: true, aide: true,
    armes: Object.freeze(['rafale', 'pompe', 'precision', 'carabine', 'petoire', 'arroseuse']),
  });
  const DEFAUT_EQUIP = Object.freeze({ p: 'rafale', s: 'petoire' });
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
    let humains = o && Number.isFinite(+o.humains) ? Math.round(+o.humains) : 1; humains = Math.max(1, Math.min(SALON.max, humains));
    const n = (v, liste, defaut) => { const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN; return liste.indexOf(x) >= 0 ? x : defaut; };
    let bots = typeof r.bots === 'number' || (typeof r.bots === 'string' && r.bots.trim() !== '') ? Math.round(+r.bots) : D.bots;
    if (!Number.isFinite(bots)) bots = D.bots;
    bots = Math.max(0, Math.min(SALON.max - humains, bots));
    return {
      v: 2, mode: cle(r.mode, MODES, D.mode), zone: dans(r.zone, SALON.zones, D.zone), duree: n(r.duree, SALON.durees, D.duree), score: n(r.score, SALON.scores, D.score),
      heure: dans(r.heure, SALON.heures, D.heure), meteo: dans(r.meteo, SALON.meteos, D.meteo), equipes: bool(r.equipes, D.equipes),
      bots, niveau: cle(r.niveau, BOTS, D.niveau), tirAllie: bool(r.tirAllie, D.tirAllie), vie: cle(r.vie, SALON.vies, D.vie),
      reapparition: cle(r.reapparition, SALON.reapparitions, D.reapparition), manches: n(r.manches, SALON.manches, D.manches),
      objets: bool(r.objets, D.objets), aide: bool(r.aide, D.aide), armes: armesPermises(r.armes),
    };
  }
  // equipementDe(demande, reglages) → { p, s } : demande { p, s } ou 'carabine+arroseuse' ; une arme non autorisée (ou du mauvais
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

  // ─── hasard rejouable ───
  function mulberry32(a) { a = a >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  return { JOUEUR, ARMES, ARMES_ID, arme, estArme, degatsA, OBJETS, MODES, BOTS, NOMS_BOTS, COULEURS, SALON, DEFAUT_REGLAGES, DEFAUT_EQUIP, normaliserReglages, equipementDe, armesPermises, mulberry32, hash };
});
