#!/usr/bin/env node
// Le Marché d'automne : le rythme des paliers et l'enveloppe du serveur, simulés sur le prototype des règles (outils/marche/proto.js).
//   · le rythme : occasionnel (17 min par jour), quotidien (1 h), assidu (2 h), très actif (8 h), sur 8 graines du hasard (médiane) :
//     le plus haut palier, le jour de chacun, combien par jour ; et les noisettes gagnées ;
//   · l'enveloppe (fournil_evts(), la ligne 'marche' du SQL v6.9) : le marathon (23 h 48 par jour, tout joué au mieux), Astuces
//     achetées et offertes dès le 12e (le pire cas), sur les graines GRAINES_ENV, minute par minute ; la table (un pas de 6 h, log10)
//     = max(marathon) × 2,2 arrondi au 0,05 supérieur, croissante, relevée là où l'interpolation passerait sous la marge ; puis vérifiée
//     sur GRAINES_CTRL, des graines qu'elle n'a pas vues (au moins ×2), et la marge la plus large après les sept premières heures (≤ ×20).
// Une simulation par cœur (worker_threads). Lancer : TZ=Europe/Paris node outils/marche/rythme.js [--vite] [--json fichier]
// --vite : 3 graines par profil et 4 + 4 pour l'enveloppe (réglage) ; sans : 8 graines par profil, 12 + 12 pour l'enveloppe.
'use strict';
const { Worker, isMainThread, parentPort } = require('worker_threads'), os = require('os'), path = require('path'), fs = require('fs');
if (!isMainThread) {
  const M = require('./proto.js').charger();
  parentPort.on('message', ({ k, t }) => {
    const s = M.simuler(t.profil, 8, { graine: t.graine, offertes: !!t.offertes });
    parentPort.postMessage({ k, r: { total: s.total, paliersJour: s.paliersJour, parJour: s.parJour.map((d) => d.total), trace: t.trace ? s.trace.map((x) => [x.t, x.total]) : undefined } });
  });
  return;
}
const VITE = process.argv.includes('--vite'), iJ = process.argv.indexOf('--json'), SORTIE = iJ > 0 ? process.argv[iJ + 1] : null;
const M = require('./proto.js').charger();
const GRAINES = VITE ? [1, 2, 3] : [1, 2, 3, 4, 5, 6, 7, 8];
const GRAINES_ENV = VITE ? [7, 1, 2, 3] : [7, 1, 2, 3, 13, 17, 49, 78, 103, 111, 21, 34];
const GRAINES_CTRL = VITE ? [201, 202, 203, 204] : [201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212];
const MOYENS = ['occasionnel', 'quotidien', 'assidu', 'tresactif'];
function lancer(taches) {
  return new Promise((ok, ko) => {
    const res = new Array(taches.length), n = Math.max(1, Math.min(taches.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    let suivante = 0, finis = 0; if (!taches.length) ok(res);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename);
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
  const marges = (lst) => { let min = Infinity, ou = '', max = -Infinity; for (const { g, o, tr } of lst) for (const [t, v] of tr) if (v > 0) { const m = borne(T, t) - Math.log10(v); if (m < min) { min = m; ou = `graine ${g}${o ? ', Astuces offertes' : ''}, ${(t * 24).toFixed(1)} h`; } if (t > 7.25 / 24) max = Math.max(max, m); } return { min: Math.pow(10, min), ou, max: Math.pow(10, max) }; };
  const mv = marges(traces), mc = marges(ctrl), fin = Math.max(...traces.map((x) => x.tr[x.tr.length - 1][1]));
  console.log(`── l'enveloppe du serveur : la ligne 'marche' de fournil_evts(), un pas de ${PAS_H} h, ${N} valeurs ──`);
  console.log(`  {${T.map((x) => +x.toFixed(2)).join(',')}}`);
  console.log(`  croissante : ${T.every((v, k) => !k || v >= T[k - 1])} · marathon le plus haut à la fin : ${M.fmtEur(fin)} (log10 ${Math.log10(fin).toFixed(2)})`);
  console.log(`  marge sur les ${traces.length} marathons du réglage : ×${mv.min.toFixed(2)} au plus juste (${mv.ou}), ×${mv.max.toFixed(1)} au plus large après 7 h 15`);
  console.log(`  marge sur ${ctrl.length} marathons qu'elle n'a pas vus : ×${mc.min.toFixed(2)} au plus juste (${mc.ou}), ×${mc.max.toFixed(1)} au plus large après 7 h 15`);
  const quot = MOYENS.map((p) => GRAINES.map((g) => R[`${p}${g}`].total)).flat();
  out.enveloppe = { pasH: PAS_H, table: T.map((x) => +x.toFixed(2)), margeMin: mv.min, margeMinOu: mv.ou, margeMax: mv.max, controle: { min: mc.min, ou: mc.ou, max: mc.max }, marathonFin: fin };
  if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(out, null, 1));
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s en tout)`);
  void quot;
})().catch((e) => { console.error(e); process.exit(1); });
function PROFILS_MIN(p) { return M.PROFILS[p].sessions.reduce((a, s) => a + s[1], 0); }
