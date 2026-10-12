/* OPÉRATION PONCIN — les zones de la carte où se joue une partie (conception du lot Gameplay, § 7) : 'place', 'centre' (l'arène
   d'aujourd'hui, par défaut), 'eglise', 'bourg', 'rivieres' (le Veyron dans le bourg et ses deux ponts), 'tout'.
   PZONES.preparer(carte, monde, nav, id, rnd) → { id, demande, limite, englobant: { centre, rayon }, apparitions: [[x, z], …],
   objets: [[x, z, objet], …], aire (m²), avertissement? }. Au lancement (hôte ou solo), après la navigation ; rnd est un générateur à
   part (mulberry32(graine ^ 0x2F6E2B1)) pour que jeu.rnd reste identique chez l'hôte et chez la façade.
   Aujourd'hui seule 'centre' est complète : elle reprend telles quelles les zones précalculées de la carte (carte.zones : arene,
   apparitions, armes). Les autres zones rendent 'centre' avec un avertissement (le lot 2/2 les fera, avec PMONDE.limiteDe).
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. Voir src-poncin/ARCHITECTURE.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PZONES = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const fin = (v) => typeof v === 'number' && v - v === 0;
  const IDS = REGLES.SALON.zones;
  const NOMS = { place: 'Place Bichat', centre: 'Cœur du village', eglise: 'Autour de l’église', bourg: 'Tout le bourg', rivieres: 'Le Veyron', tout: 'Tout Poncin' };
  const FAITES = { centre: true };

  // 'centre' : l'arène de la carte (110 m autour de (0, 0) sans carte, comme PARENE), ses apparitions et ses objets, tels quels
  function centre(carte) {
    const z = (carte && carte.zones) || {}, a = z.arene;
    const c = a && a.centre && fin(+a.centre[0]) && fin(+a.centre[1]) ? [+a.centre[0], +a.centre[1]] : [0, 0];
    const rayon = a && fin(+a.rayon) && a.rayon > 10 ? +a.rayon : 110;
    const apparitions = [], objets = [];
    for (const p of Array.isArray(z.apparitions) ? z.apparitions : []) if (p && fin(+p[0]) && fin(+p[1])) apparitions.push([+p[0], +p[1]]);
    for (const o of Array.isArray(z.armes) ? z.armes : []) if (o && fin(+o.x) && fin(+o.z) && typeof o.arme === 'string') objets.push([+o.x, +o.z, o.arme]);
    return { id: 'centre', demande: 'centre', nom: NOMS.centre, limite: { centre: [c[0], c[1]], rayon }, englobant: { centre: [c[0], c[1]], rayon }, apparitions, objets, aire: Math.PI * rayon * rayon };
  }

  function preparer(carte, monde, nav, id, rnd) { // monde, nav et rnd : pour les zones du lot 2/2
    const demande = typeof id === 'string' && IDS.indexOf(id) >= 0 ? id : 'centre';
    const z = centre(carte);
    z.demande = typeof id === 'string' ? id : demande;
    if (!FAITES[demande] || demande !== id) z.avertissement = `zone « ${typeof id === 'string' ? id : String(id)} » pas encore préparée : on joue « centre »`;
    return z;
  }
  // la distance idéale de réapparition : clamp(0,32 · rayon englobant, 15, 60) m (35 m pour 'centre')
  const distanceReapparition = (z) => Math.max(15, Math.min(60, 0.32 * (z && z.englobant ? z.englobant.rayon : 110)));

  return { preparer, distanceReapparition, IDS, NOMS };
});
