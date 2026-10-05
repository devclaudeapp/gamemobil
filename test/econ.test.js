#!/usr/bin/env node
// Rythme de la boulangerie, objectifs du jour, événements, absence, formats.
'use strict';
const G = require('../src/game.js');
const { PRODUITS } = G;
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const fmtT = (s) => s < 90 ? Math.round(s) + ' s' : s < 5400 ? (s / 60).toFixed(1) + ' min' : (s / 3600).toFixed(1) + ' h';
const T0 = Date.UTC(2026, 9, 7, 8, 0); // un mercredi : pas de jour de marché
const seeded = (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

function run(hours, policy, start = T0) {
  const st = G.newState(start); st.mode = 'max';
  const unlockAt = {}, staffAt = {}, dt = 0.5; let t = 0, taps = 0, evs = { rush: 0, commande: 0, mystere: 0 };
  const rnd = seeded(7);
  while (t < hours * 3600) {
    st.stations.forEach((s, i) => { if (s.niv > 0 && !s.staff && !s.actif) { G.lancer(st, i); taps++; } });
    const out = G.tick(st, dt, start + t * 1000, rnd); t += dt;
    if (out.nouvelEv) evs[out.nouvelEv.type]++;
    if (out.mystere) evs.mystere++;
    if (st.ev && st.ev.type === 'commande' && st.ev.fait >= st.ev.n) G.livrer(st);
    if (Math.round(t / dt) % 4 === 0) policy(st, t, { unlockAt, staffAt });
  }
  return { st, unlockAt, staffAt, taps, evs };
}
const greedy = (st, t, m) => {
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv > 0 && !s.staff && st.coins >= PRODUITS[i].staff) { G.embaucher(st, i); m.staffAt[i] = m.staffAt[i] || t; } }
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv === 0 && st.coins >= PRODUITS[i].cout) { G.acheter(st, i); m.unlockAt[i] = t; break; } }
  for (const a of G.AMELIORATIONS) if (!st.ameliorations[a.id] && st.coins >= a.cout * 1.2) G.amelioration(st, a.id);
  let best = -1, bestRatio = 0;
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv === 0) continue; const n = G.quantite(st, i), prix = G.coutNiveaux(i, s.niv, n); if (prix > st.coins) continue; const gain = PRODUITS[i].rev * n * G.palierMult(s.niv + n) * G.ameliorationMult(st, i) / PRODUITS[i].temps; const r = gain / prix; if (r > bestRatio) { bestRatio = r; best = i; } }
  if (best >= 0) G.acheter(st, best);
};
console.log('── joueur actif, 3 h (mercredi) ──');
const R = run(3, greedy);
PRODUITS.forEach((p, i) => console.log(`  ${p.nom.padEnd(18)} débloqué ${R.unlockAt[i] != null ? fmtT(R.unlockAt[i]).padStart(9) : '        —'} · apprenti ${R.staffAt[i] != null ? fmtT(R.staffAt[i]).padStart(9) : '        —'} · niveau ${R.st.stations[i].niv}`));
console.log(`  taux final ${G.fmtEur(G.tauxParSeconde(R.st))}/s · gagné ${G.fmtEur(R.st.lifetime)} · étoiles gagnables ${G.etoilesGagnables(R.st)} · touches ${R.taps} · événements ${JSON.stringify(R.evs)}`);
check(R.unlockAt[1] < 90, 'croissants en moins de 90 s');
check(R.staffAt[0] < 180, 'premier apprenti en moins de 3 min');
check(R.unlockAt[3] != null && R.unlockAt[3] < 30 * 60, 'tarte en moins de 30 min');
check(R.unlockAt[4] != null && R.unlockAt[4] < 3 * 3600, 'éclairs en moins de 3 h');
check(G.etoilesGagnables(R.st) >= 3, 'au moins 3 étoiles gagnables après 3 h');
check(R.evs.rush + R.evs.commande >= 15 && R.evs.rush + R.evs.commande <= 50, 'entre 15 et 50 événements en 3 h');
check(R.evs.mystere >= 20, 'client mystère régulier');

console.log('── objectifs du jour ──');
{
  const st = G.newState(T0); st.now = T0;
  const j = G.objectifsDuJour(st, T0);
  console.log('  ' + j.objectifs.map((o) => `${o.txt} (prime ${G.fmtEur(o.prime)})`).join(' · '));
  check(j.objectifs.length === 3 && j.objectifs[0].type === 'gagner', 'trois objectifs, le premier est « gagner »');
  check(j.objectifs.every((o) => o.cible >= 1 && o.prime >= 40), 'cibles et primes positives');
  const j2 = G.objectifsDuJour(G.newState(T0), T0);
  check(JSON.stringify(j2.objectifs.map((o) => o.txt)) === JSON.stringify(j.objectifs.map((o) => o.txt)), 'les mêmes objectifs pour la même date et la même boutique');
  for (let k = 0; k < 400; k++) { G.lancer(st, 0); G.tick(st, 1.01, T0 + k * 1010); }
  const g = j.objectifs[0];
  check(g.progres > 0, `progrès « gagner » : ${G.fmtEur(g.progres)} / ${G.fmtEur(g.cible)}`);
  g.progres = g.cible; g.fait = true;
  const r = G.reclamer(st, 0);
  check(r.ok && st.coins >= g.prime, 'prime réclamée');
  check(!G.reclamer(st, 0).ok, 'une prime ne se réclame qu’une fois');
  j.objectifs.forEach((o, k) => { o.progres = o.cible; o.fait = true; if (k) G.reclamer(st, k); });
  check(st.etoiles === 1 && st.serie === 1 && j.etoileDonnee, 'les trois objectifs : une étoile et une série de 1');
  const R2 = run(1, greedy, T0 + 10 * 3600 * 1000); // le lendemain
  const st2 = R2.st; st2.serie = 1; st2.dernierJourComplet = G.dayKey(T0);
  const next = G.objectifsDuJour(st2, T0 + 864e5 + 3600 * 1000);
  console.log('  lendemain (après 1 h de jeu) : ' + next.objectifs.map((o) => o.txt).join(' · '));
  check(next.objectifs[0].cible > j.objectifs[0].cible, 'les cibles suivent la boutique');
}
console.log('── événements ──');
{
  const st = G.newState(T0); st.now = T0; st.stations[1].niv = 5; st.stations[1].staff = true; st.stations[1].actif = true;
  const base = G.revenu(st, 1);
  G.lancerRush(st);
  check(Math.abs(G.revenu(st, 1) / base - 3) < 1e-9, 'coup de feu : ventes ×3');
  st.now = T0 + 61000; check(Math.abs(G.revenu(st, 1) / base - 1) < 1e-9, 'le coup de feu s’arrête après 60 s');
  const ev = G.lancerCommande(st, () => 0.5);
  console.log(`  commande : ${ev.n} ${PRODUITS[ev.i].nom} en 3 min, prime ${G.fmtEur(ev.prime)}`);
  check(ev.type === 'commande' && ev.prime > G.revenuBase(st, ev.i) * ev.n * 5, 'la commande paie plus de 5 fois le prix');
  ev.fait = ev.n; const l = G.livrer(st); check(l.ok && !st.ev, 'livraison : prime versée, événement clos');
  const sam = Date.UTC(2026, 9, 10, 12, 0); st.now = sam; check(G.jourDeMarche(sam) && Math.abs(G.boostMult(st) - 1.5) < 1e-9, 'samedi : jour de marché ×1,5');
  check(G.pourboire(st) >= 20, 'pourboire du client mystère ≥ 20 €');
}
console.log('── absence de 8 h après 1 h de jeu ──');
const R1 = run(1, greedy);
const before = R1.st.coins;
const abs = G.absence(R1.st, R1.st.lastSeen + 8 * 3600 * 1000);
console.log(`  gagné pendant l'absence ${G.fmtEur(abs.total)} (avant : ${G.fmtEur(before)})`);
check(abs.total > before * 0.5, 'une absence de 8 h rapporte au moins la moitié de la cagnotte');
console.log('── formats ──');
for (const [n, s] of [[0, '0'], [7.5, '7,5'], [999, '999'], [1234, '1,2 k'], [12345, '12,3 k'], [123456, '123 k'], [2.1e9, '2,1 Md'], [5e15, '5 Bd']]) check(G.fmt(n) === s, `${n} → ${G.fmt(n)}`);
console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
process.exit(fails ? 1 : 0);
