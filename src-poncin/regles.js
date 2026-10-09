/* OPÉRATION PONCIN — les règles chiffrées : le joueur, les blasters à peinture, les modes, le niveau des bots, le hasard rejouable.
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node pour les tests. Voir src-poncin/ARCHITECTURE.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PREGLES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ─── le joueur (mètres, secondes) ───
  const JOUEUR = { rayon: 0.35, taille: 1.8, tailleAccroupi: 1.2, oeil: 1.6, oeilAccroupi: 1.0, vitesse: 5.2, vitesseAccroupi: 2.4, vitesseRecul: 0.8, saut: 5.0, gravite: 14, vie: 100, armureMax: 50, marche: 0.45 /* hauteur de marche franchie */ };

  // ─── les blasters à peinture : rafale (polyvalent), pompe (au contact), long-tir (de loin) ───
  // chute : [début, fin, minimum] — pleine puissance jusqu'à début, puis baisse linéaire jusqu'à minimum (fraction) à fin
  const ARMES = [
    { id: 'rafale', nom: 'Blaster rafale', degats: 13, plombs: 1, cadence: 9, chargeur: 30, reserve: 120, recharge: 1.6, dispersion: 0.022, dispersionMouvement: 0.02, portee: 70, chute: [18, 45, 0.55], tete: 1.5, recul: 0.012, couleur: '#FF6B8B' },
    { id: 'pompe', nom: 'Pompe à peinture', degats: 11, plombs: 8, cadence: 1.15, chargeur: 6, reserve: 24, recharge: 2.2, dispersion: 0.085, dispersionMouvement: 0.02, portee: 28, chute: [6, 20, 0.25], tete: 1.25, recul: 0.06, couleur: '#5FD3A4' },
    { id: 'precision', nom: 'Long-tir', degats: 72, plombs: 1, cadence: 0.85, chargeur: 5, reserve: 20, recharge: 2.4, dispersion: 0.0015, dispersionMouvement: 0.06, portee: 160, chute: [80, 160, 0.8], tete: 1.6, recul: 0.05, couleur: '#B8A6FF' },
  ];
  const arme = (id) => ARMES.find((a) => a.id === id) || ARMES[0];
  function degatsA(a, distance, tete) { // dégâts d'un plomb à cette distance
    const [d0, d1, mini] = a.chute, k = distance <= d0 ? 1 : distance >= d1 ? mini : 1 - (1 - mini) * (distance - d0) / (d1 - d0);
    return Math.round(a.degats * k * (tete ? a.tete : 1));
  }
  // les objets à ramasser : armes, soin, armure
  const OBJETS = {
    pompe: { type: 'arme', arme: 'pompe', retour: 20 }, precision: { type: 'arme', arme: 'precision', retour: 25 },
    soin: { type: 'soin', vie: 50, retour: 15 }, armure: { type: 'armure', armure: 50, retour: 25 },
  };

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

  // ─── hasard rejouable ───
  function mulberry32(a) { a = a >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  return { JOUEUR, ARMES, arme, degatsA, OBJETS, MODES, BOTS, NOMS_BOTS, COULEURS, mulberry32, hash };
});
