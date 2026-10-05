#!/usr/bin/env node
// Rythme de la boulangerie : un joueur qui touche, améliore et embauche dès qu'il peut. Mesure le temps d'accès à chaque produit.
'use strict';
const G = require('../src/game.js');
const { PRODUITS } = G;
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const fmtT = (s) => s < 90 ? Math.round(s) + ' s' : s < 5400 ? (s / 60).toFixed(1) + ' min' : (s / 3600).toFixed(1) + ' h';

function run(hours, policy) {
  const st = G.newState(0); st.mode = 'max';
  const unlockAt = {}, staffAt = {}, dt = 0.5; let t = 0, taps = 0; const log = [];
  const prestigeAt = [];
  while (t < hours * 3600) {
    // politique : toucher chaque produit manuel prêt
    st.stations.forEach((s, i) => { if (s.niv > 0 && !s.staff && !s.actif) { G.lancer(st, i); taps++; } });
    G.tick(st, dt); t += dt;
    if (Math.round(t / dt) % 4 === 0) policy(st, t, { unlockAt, staffAt, log, prestigeAt });
  }
  return { st, unlockAt, staffAt, taps, log, prestigeAt };
}
const greedy = (st, t, m) => {
  // embaucher d'abord, puis débloquer le produit suivant, puis améliorer le moins cher par euro de gain
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv > 0 && !s.staff && st.coins >= PRODUITS[i].staff) { G.embaucher(st, i); m.staffAt[i] = m.staffAt[i] || t; } }
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv === 0 && st.coins >= PRODUITS[i].cout) { G.acheter(st, i); m.unlockAt[i] = t; break; } }
  for (const a of G.AMELIORATIONS) if (!st.ameliorations[a.id] && st.coins >= a.cout * 1.2) G.amelioration(st, a.id);
  let best = -1, bestRatio = 0;
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv === 0) continue; const n = G.quantite(st, i), prix = G.coutNiveaux(i, s.niv, n); if (prix > st.coins) continue; const gain = PRODUITS[i].rev * n * G.palierMult(s.niv + n) * G.ameliorationMult(st, i) / PRODUITS[i].temps; const r = gain / prix; if (r > bestRatio) { bestRatio = r; best = i; } }
  if (best >= 0) G.acheter(st, best);
};
console.log('── joueur actif, 3 h ──');
const R = run(3, greedy);
PRODUITS.forEach((p, i) => console.log(`  ${p.nom.padEnd(18)} débloqué ${R.unlockAt[i] != null ? fmtT(R.unlockAt[i]).padStart(9) : '        —'} · apprenti ${R.staffAt[i] != null ? fmtT(R.staffAt[i]).padStart(9) : '        —'} · niveau ${R.st.stations[i].niv}`));
console.log(`  taux final ${G.fmtEur(G.tauxParSeconde(R.st))}/s · gagné ${G.fmtEur(R.st.lifetime)} · étoiles gagnables ${G.etoilesGagnables(R.st)} · touches ${R.taps}`);
check(R.unlockAt[1] < 90, 'croissants en moins de 90 s');
check(R.staffAt[0] < 180, 'premier apprenti en moins de 3 min');
check(R.unlockAt[3] != null && R.unlockAt[3] < 30 * 60, 'tarte en moins de 30 min');
check(R.unlockAt[4] != null && R.unlockAt[4] < 3 * 3600, 'éclairs en moins de 3 h');
check(G.etoilesGagnables(R.st) >= 3, 'au moins 3 étoiles gagnables après 3 h');

console.log('── absence de 8 h après 1 h de jeu ──');
const R1 = run(1, greedy);
const before = R1.st.coins;
const abs = G.absence(R1.st, R1.st.lastSeen + 8 * 3600 * 1000);
console.log(`  gagné pendant l'absence ${G.fmtEur(abs.total)} (avant : ${G.fmtEur(before)}), détail ${abs.detail.map((d) => PRODUITS[d.i].nom + ' ×' + d.n).join(', ')}`);
check(abs.total > before * 0.5, 'une absence de 8 h rapporte au moins la moitié de la cagnotte');

console.log('── formats ──');
for (const [n, s] of [[0, '0'], [7.5, '7,5'], [999, '999'], [1234, '1,2 k'], [12345, '12,3 k'], [123456, '123 k'], [2.1e9, '2,1 Md'], [5e15, '5 Bd']]) check(G.fmt(n) === s, `${n} → ${G.fmt(n)}`);
console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
process.exit(fails ? 1 : 0);
