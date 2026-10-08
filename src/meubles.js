/* LE FOURNIL — le mobilier et la salle en 3D (provisoire : rempli par l'atelier). */
const MEUBLES = (() => {
  'use strict';
  const M = MODELES;
  function salle(ctx) { const g = new THREE.Group(); const sol = M.mesh(M.plan(ctx.W, ctx.wd(ctx.H - ctx.LAY.murH)), M.mat(ctx.Q.sol), { x: ctx.W / 2, y: 0, z: ctx.wd(ctx.H - ctx.LAY.murH) / 2, rx: -Math.PI / 2 }, { ombre: false, recoit: true }); const mur = M.mesh(M.plan(ctx.W, ctx.wy(ctx.LAY.murH)), M.mat(ctx.Q.mur), { x: ctx.W / 2, y: ctx.wy(ctx.LAY.murH) / 2, z: 0 }, { ombre: false, recoit: true }); g.add(sol, mur); return g; }
  function four(k, ctx) { const f = ctx.LAY.four, g = new THREE.Group(); g.userData.zone = 'four'; const d = ctx.wd(f.h * 0.35), h = ctx.wy(f.h * 0.65); g.add(M.mesh(M.boite(f.w, h, d, 4), M.mat(k >= 4 ? '#B07A52' : '#7A655C'), { x: f.x + f.w / 2, z: ctx.wz(f.y + f.h) - d / 2 })); return g; }
  return { salle, four };
})();
if (typeof module !== 'undefined') module.exports = MEUBLES;
