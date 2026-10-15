#!/usr/bin/env node
// Le Fournil : l'absence, partout, d'un seul coup d'œil (les règles pures ; l'heure sûre et le réveil sont dans test/fournil-reveil.cjs).
// La boutique (G.absence) : payée au rythme des apprentis, plafonnée (heuresAbsence), jamais négative, rien de payé deux fois ; un boost
// de la réserve encore en cours au retour compte, un boost fini pendant l'absence non. Les deux événements (Q : la Planque ; HT : la Maison
// hantée) : au ralenti (ABSENCE_PART), plafonnés à 8 h, et avec la combine d'absence « après le boss » à 12 h et 20 % ; une heure qui
// recule ne paie rien ; deux retours de suite ne paient qu'une fois ; parti avant la fermeture : payé jusqu'à la fermeture seulement.
// Usage : TZ=Europe/Paris node test/fournil-absence.test.js
'use strict';
const G = require('../src/game.js'), Q = require('../src/quartier.js'), HT = require('../src/hantee.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const H = 3600e3, copie = (o) => JSON.parse(JSON.stringify(o)), proche = (a, b, tol) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * (tol || 0.02));

console.log('── la boutique');
{
  const T0 = Date.parse('2026-10-15T08:00:00Z'), st = G.newState(T0); st.now = T0;
  G.gagner(st, 1e9, true);
  for (let i = 0; i < 3; i++) { for (let k = 0; k < 30; k++) G.acheter(st, i); G.embaucher(st, i); }
  const avec = st.stations.filter((s) => s.staff).length;
  check(avec >= 2, `une boutique avec ${avec} apprentis`);
  const base = copie(st); base.lastSeen = T0;
  const essai = (ms, prep) => { const s = copie(base); if (prep) prep(s); const c0 = s.coins, r = G.absence(s, T0 + ms); return { r, gain: s.coins - c0, s }; };
  const a1 = essai(1 * H), a8 = essai(8 * H), a30 = essai(30 * H);
  check(a1.gain > 0 && a1.r.secs === 3600 && proche(a1.gain, a1.r.total, 1e-9), `1 h : ${G.fmt(a1.gain)} € payés, la feuille dit la même chose`);
  check(a8.gain > a1.gain * 6, `8 h : ${G.fmt(a8.gain)} € (≈ 8 × 1 h)`);
  check(a30.r.secs === G.ABSENCE_MAX_H * 3600 || a30.r.secs <= 24 * 3600, `30 h : plafonnée à ${a30.r.secs / 3600} h`);
  const recule = essai(-2 * H);
  check(recule.gain === 0 && recule.r.secs === 0, 'une heure qui recule : rien de payé');
  { const s = copie(base); G.absence(s, T0 + 2 * H); const c1 = s.coins; const r2 = G.absence(s, T0 + 2 * H); check(r2.total === 0 && s.coins === c1, 'deux retours au même instant : payé une fois'); }
  // un boost de la réserve : encore en cours au retour → l'absence entière à son rythme ; fini pendant l'absence → sans lui
  const boost = (finDans) => (s) => { s.boosts = s.boosts || { reserve: [], actif: null }; s.boosts.actif = { mult: 2, fin: T0 + finDans, secs: 3600 }; };
  const enCours = essai(1 * H, boost(2 * H)), fini = essai(3 * H, boost(1 * H));
  check(enCours.gain > a1.gain * 1.5, `boost ×2 encore en cours au retour : ${G.fmt(enCours.gain)} € pour 1 h (sans : ${G.fmt(a1.gain)})`);
  check(fini.s.boosts.actif === null && fini.gain < essai(3 * H).gain * 1.01, 'boost fini pendant l’absence : éteint, l’absence payée sans lui (jamais plus)');
}

for (const [nom, M] of [['la Planque (Quartier)', Q], ['la Maison hantée', HT]]) {
  console.log('── ' + nom);
  const S = M.simuler('assidu', 6), q0 = copie(S.q), t0 = M.DEBUT + 3 * 24 * H;
  q0.lastSeen = t0;
  const taux = M.tauxBase ? M.tauxBase(q0) : M.tauxParSeconde(q0) / M.PRESENCE;
  const essai = (ms, prep) => { const q = copie(q0); if (prep) prep(q); const b0 = q.total, r = M.absence(q, t0 + ms); return { r, gain: q.total - b0, q }; };
  const a2 = essai(2 * H), a8 = essai(8 * H), a20 = essai(20 * H);
  check(a2.gain > 0 && proche(a2.gain, taux * 7200 * M.ABSENCE_PART, 0.05), `2 h : ${M.fmt(a2.gain)} (≈ ${M.ABSENCE_PART * 100} % du rythme)`);
  check(a20.r.secs === M.ABSENCE_MAX_H * 3600 && proche(a20.gain, a8.gain, 0.05), `20 h : plafonnée à ${M.ABSENCE_MAX_H} h (${M.fmt(a20.gain)} ≈ 8 h)`);
  const combine = M.AMELIORATIONS.find((a) => a.effet && a.effet.absenceH);
  check(!!combine, `la combine d'absence : « ${combine && combine.nom} »`);
  if (combine) {
    const c20 = essai(20 * H, (q) => { q.ameliorations[combine.id] = true; });
    check(c20.r.secs === combine.effet.absenceH * 3600 && proche(c20.gain, a20.gain * (combine.effet.absenceH / M.ABSENCE_MAX_H) * (combine.effet.absencePart / M.ABSENCE_PART), 0.06),
      `avec elle, 20 h : ${combine.effet.absenceH} h à ${combine.effet.absencePart * 100} % (${M.fmt(c20.gain)}, ×${(c20.gain / a20.gain).toFixed(1)})`);
  }
  const recule = essai(-3 * H);
  check(recule.gain === 0 && recule.r.secs === 0, 'une heure qui recule : rien de payé');
  { const q = copie(q0); M.absence(q, t0 + 2 * H); const b1 = q.total, r2 = M.absence(q, t0 + 2 * H); check(r2.total === 0 && q.total === b1, 'deux retours au même instant : payé une fois'); }
  // parti 3 h avant la fermeture, revenu bien après : l'écran du bilan paie jusqu'à M.FIN (src/evenement.js montrerBilan), pas au-delà
  { const q = copie(q0); q.lastSeen = M.FIN - 3 * H; const b0 = q.total, r = M.absence(q, M.FIN); check(r.secs === 3 * 3600 && q.total > b0 && q.lastSeen === M.FIN, `parti 3 h avant la fermeture : 3 h payées (${M.fmt(q.total - b0)}), pas plus`); }
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
