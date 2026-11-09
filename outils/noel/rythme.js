#!/usr/bin/env node
// Le Marché de Noël (point 7, docs/noel-contrat.md § 4) : le rythme des paliers et l'enveloppe du serveur, simulés sur le prototype des
// règles (outils/noel/proto.js : src/marche.js aux dates de Noël, du ven. 18 déc. 12 h au ven. 25 déc. 20 h, graine « |noel|manoir »).
// La copie de outils/marche/rythme.js (même méthode, mêmes graines, mêmes profils), qui s'en distingue par :
//   · la ligne 'noel' de fournil_evts() (le SQL v7.0) ;
//   · --plancher : la table posée est le plus haut, pas par pas, de celle retirée ici et de la table v6.9 du Marché d'automne (le même
//     moteur sur la même fenêtre de 176 h : ses vraies règles ont demandé +0,05 à deux pas ; la table de Noël ne descend jamais sous elle),
//     puis ses marges sont recalculées ;
//   · --reel : sur src/noel.js (les vraies règles, quand elles existeront : la vérification du constructeur A, docs/noel-contrat.md § 4.1).
// Une simulation par cœur (worker_threads). Lancer : TZ=Europe/Paris node outils/noel/rythme.js [--vite] [--reel] [--plancher] [--json fichier] [--table "{…}"]
'use strict';
const { Worker, isMainThread, parentPort } = require('worker_threads'), os = require('os'), path = require('path'), fs = require('fs');
if (!isMainThread) {
  const M = process.argv.includes('--reel') || (require('worker_threads').workerData || {}).reel ? require('../../src/noel.js') : require('./proto.js').charger();
  parentPort.on('message', ({ k, t }) => {
    const s = M.simuler(t.profil, 8, { graine: t.graine, offertes: !!t.offertes });
    parentPort.postMessage({ k, r: { total: s.total, paliersJour: s.paliersJour, parJour: s.parJour.map((d) => d.total), trace: t.trace ? s.trace.map((x) => [x.t, x.total]) : undefined } });
  });
  return;
}
const VITE = process.argv.includes('--vite'), iJ = process.argv.indexOf('--json'), SORTIE = iJ > 0 ? process.argv[iJ + 1] : null;
const REEL = process.argv.includes('--reel'); // --reel : les VRAIES règles (src/noel.js), et non le prototype (la vérification du constructeur, docs/noel-contrat.md § 4.1)
const M = REEL ? require('../../src/noel.js') : require('./proto.js').charger();
const GRAINES = VITE ? [1, 2, 3] : [1, 2, 3, 4, 5, 6, 7, 8];
const GRAINES_ENV = VITE ? [7, 1, 2, 3] : [7, 1, 2, 3, 13, 17, 49, 78, 103, 111, 21, 34];
const GRAINES_CTRL = VITE ? [201, 202, 203, 204] : [201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212];
const MOYENS = ['occasionnel', 'quotidien', 'assidu', 'tresactif'];
function lancer(taches) {
  return new Promise((ok, ko) => {
    const res = new Array(taches.length), n = Math.max(1, Math.min(taches.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    let suivante = 0, finis = 0; if (!taches.length) ok(res);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename, { workerData: { reel: REEL } });
      const donner = () => { if (suivante < taches.length) { const k = suivante++; wk.postMessage({ k, t: taches[k] }); } else wk.terminate(); };
      wk.on('message', ({ k, r }) => { res[k] = r; process.stderr.write('.'); if (++finis === taches.length) { process.stderr.write('\n'); ok(res); } donner(); });
      wk.on('error', ko); donner();
    }
  });
}
const mediane = (a) => { const t = a.slice().sort((x, y) => x - y); return (t[(t.length - 1) >> 1] + t[t.length >> 1]) / 2; };
const haut = (pj) => Math.max(0, ...Object.keys(pj).map(Number));
const parJourDe = (pj) => [1, 2, 3, 4, 5, 6, 7, 8].map((j) => Object.values(pj).filter((x) => x === j).length);
const T0 = 11.65, L2 = Math.log10(2.2), PAS_H = 6, PAS_J = PAS_H / 24, N = Math.ceil((M.FIN - M.DEBUT) / 3600e3 / PAS_H) + 1; // 176 h → 31 valeurs (0 à 180 h)

(async () => {
  const t0 = Date.now(), taches = [];
  for (const p of MOYENS) for (const g of GRAINES) taches.push({ cle: `${p}${g}`, profil: p, graine: g });
  for (const g of GRAINES_ENV) for (const offertes of [false, true]) taches.push({ cle: `m${g}${offertes ? 'o' : ''}`, profil: 'marathon', graine: g, offertes, trace: true });
  for (const g of GRAINES_CTRL) for (const offertes of [false, true]) taches.push({ cle: `c${g}${offertes ? 'o' : ''}`, profil: 'marathon', graine: g, offertes, trace: true });
  const res = await lancer(taches), R = {}; taches.forEach((t, k) => { R[t.cle] = res[k]; });
  const out = { profils: {}, enveloppe: null };
  console.log(`── le rythme des paliers (${GRAINES.length} graines par profil ; ${((Date.now() - t0) / 1000).toFixed(0)} s) ──`);
  for (const p of MOYENS) {
    const l = GRAINES.map((g) => R[`${p}${g}`]), hs = l.map((x) => haut(x.paliersJour)), med = mediane(hs);
    const min = PROFILS_MIN(p), jours12 = l.map((x) => x.paliersJour[12] || null), jours20 = l.map((x) => x.paliersJour[20] || null);
    const pj = l[0].paliersJour, parJ = parJourDe(pj);
    out.profils[p] = { minutes: min, hauts: hs, mediane: med, jour12: jours12, jour20: jours20, parJour: parJ, totalMed: mediane(l.map((x) => x.total)), paliersJour: pj };
    console.log(`  ${p.padEnd(11)} ${String(min).padStart(3)} min/j : plus haut palier ${String(med).replace('.', ',')} en médiane (${Math.min(...hs)} à ${Math.max(...hs)} : ${hs.join(', ')}) · le 12e : jour ${jours12.map((x) => x || '—').join('/')} · le 20e : ${jours20.map((x) => x || '—').join('/')} · par jour (graine ${GRAINES[0]}) ${parJ.join(' ')} · ${M.fmtEur(mediane(l.map((x) => x.total)))}`);
  }
  // ─── l'enveloppe ───
  const traces = GRAINES_ENV.flatMap((g) => [false, true].map((o) => ({ g, o, tr: R[`m${g}${o ? 'o' : ''}`].trace })));
  const ctrl = GRAINES_CTRL.flatMap((g) => [false, true].map((o) => ({ g, o, tr: R[`c${g}${o ? 'o' : ''}`].trace })));
  const plafond = (v) => Math.ceil(v * 20 - 1e-9) / 20; // au 0,05 supérieur
  const T = new Array(N).fill(0);
  for (let k = 0; k < N; k++) { // le plus haut marathon jusqu'au pas k (les totaux ne font que monter) × 2,2
    let m = 0; for (const { tr } of traces) for (const [t, v] of tr) if (t <= k * PAS_J + 1e-9 && v > m) m = v;
    T[k] = Math.max(k ? T[k - 1] : T0, m > 0 ? plafond(Math.log10(m) + L2) : 0);
  }
  const borne = (T, t) => { const j = Math.min(t / PAS_J, T.length - 1), k = Math.floor(j); return k >= T.length - 1 ? T[T.length - 1] : T[k] + (T[k + 1] - T[k]) * (j - k); };
  // relever là où l'interpolation passe sous la marge (dans un pas où le marathon monte vite) : la valeur de fin du pas, puis tout ce qui suit
  for (let tour = 0; tour < 2000; tour++) {
    let pire = null;
    for (const { tr } of traces) for (const [t, v] of tr) if (v > 0) { const m = borne(T, t) - Math.log10(v); if (m < L2 - 1e-9 && (!pire || m < pire.m)) pire = { t, m }; }
    if (!pire) break;
    const k = Math.min(N - 1, Math.floor(pire.t / PAS_J) + 1); // la valeur de fin du pas (l'ouverture reste à T0 : un tricheur ne part pas de haut)
    T[k] = plafond(T[k] + 0.05); for (let i = k + 1; i < N; i++) T[i] = Math.max(T[i], T[i - 1]);
  }
  T[0] = T0;
  const MARCHE69 = [11.65, 16.05, 16.05, 16.3, 16.5, 16.65, 16.75, 16.85, 16.95, 17, 17.05, 17.1, 17.15, 17.2, 17.2, 17.3, 17.35, 17.4, 17.5, 17.55, 17.65, 17.75, 17.8, 17.85, 17.95, 18, 18.05, 18.1, 18.15, 18.15, 18.2]; // la ligne 'marche' de la v6.9
  const retiree = T.slice();
  if (process.argv.includes('--plancher')) { for (let k = 0; k < N; k++) T[k] = Math.max(T[k], MARCHE69[k]); console.log(`  (--plancher : la table retirée {${retiree.map((x) => +x.toFixed(2)).join(',')}}, relevée au moins à la table v6.9 du Marché d'automne)`); }
  const iV = process.argv.indexOf('--table'); // --table "{…}" : vérifier une table donnée (celle du SQL) au lieu de la retirée
  if (iV > 0) { const v = process.argv[iV + 1].replace(/[{}\s]/g, '').split(',').map(Number); if (v.length !== N) throw new Error(`--table : ${N} valeurs attendues`); for (let k = 0; k < N; k++) T[k] = v[k]; console.log('  (la table donnée par --table)'); }
  const marges = (lst) => { let min = Infinity, ou = '', max = -Infinity; for (const { g, o, tr } of lst) for (const [t, v] of tr) if (v > 0) { const m = borne(T, t) - Math.log10(v); if (m < min) { min = m; ou = `graine ${g}${o ? ', Astuces offertes' : ''}, ${(t * 24).toFixed(1)} h`; } if (t > 7.25 / 24) max = Math.max(max, m); } return { min: Math.pow(10, min), ou, max: Math.pow(10, max) }; };
  const mv = marges(traces), mc = marges(ctrl), fin = Math.max(...traces.map((x) => x.tr[x.tr.length - 1][1]));
  console.log(`── l'enveloppe du serveur : la ligne 'noel' de fournil_evts(), un pas de ${PAS_H} h, ${N} valeurs ──`);
  console.log(`  {${T.map((x) => +x.toFixed(2)).join(',')}}`);
  console.log(`  croissante : ${T.every((v, k) => !k || v >= T[k - 1])} · marathon le plus haut à la fin : ${M.fmtEur(fin)} (log10 ${Math.log10(fin).toFixed(2)})`);
  console.log(`  marge sur les ${traces.length} marathons du réglage : ×${mv.min.toFixed(2)} au plus juste (${mv.ou}), ×${mv.max.toFixed(1)} au plus large après 7 h 15`);
  console.log(`  marge sur ${ctrl.length} marathons qu'elle n'a pas vus : ×${mc.min.toFixed(2)} au plus juste (${mc.ou}), ×${mc.max.toFixed(1)} au plus large après 7 h 15`);
  const quot = MOYENS.map((p) => GRAINES.map((g) => R[`${p}${g}`].total)).flat();
  out.enveloppe = { retiree: retiree.map((x) => +x.toFixed(2)), pasH: PAS_H, table: T.map((x) => +x.toFixed(2)), margeMin: mv.min, margeMinOu: mv.ou, margeMax: mv.max, controle: { min: mc.min, ou: mc.ou, max: mc.max }, marathonFin: fin };
  if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(out, null, 1));
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s en tout)`);
  void quot;
})().catch((e) => { console.error(e); process.exit(1); });
function PROFILS_MIN(p) { return M.PROFILS[p].sessions.reduce((a, s) => a + s[1], 0); }
