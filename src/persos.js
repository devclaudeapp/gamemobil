/* LE FOURNIL — les personnages en 3D (provisoire : rempli par l'atelier). */
const PERSOS = (() => {
  'use strict';
  const M = MODELES;
  function creer(o) { const g = new THREE.Group(); g.add(M.maille([M.part(M.capsule(11, 14), o.haut, { y: 30 }), M.part(M.sphere(10), o.peau, { y: 54 })])); return g; }
  return { creer };
})();
if (typeof module !== 'undefined') module.exports = PERSOS;
