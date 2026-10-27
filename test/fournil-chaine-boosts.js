#!/usr/bin/env node
// « Ma chaîne de boutiques » : les boosts achetés en jetons de chaîne sont la seule chose de la chaîne qui touche la boulangerie. Un par
// semaine (CHAINE.BOOSTS_SEMAINE), ×2 de 30 min ou ×5 de 10 min (CHAINE.BOOSTS). Ce test vérifie qu'ils n'accélèrent pas les étoiles :
// la même partie (le joueur simulé de test/longevite.js, 30 jours), avec et sans un boost de plus par semaine, sur 12 parties (4 départs ×
// 3 graines) ; la moyenne GÉOMÉTRIQUE des rapports (la moyenne des rapports est biaisée vers le haut quand le bruit est grand : un seul boost
// de plus déplace les étoiles d'une partie de −13 % à +33 %, parce qu'il décale ses prestiges) doit rester sous +5 %, pour chacun des deux
// boosts, pour l'occasionnel (20 min/j) et le joueur d'une heure par jour. Mesuré à la conception : entre +2,2 % et +2,9 %.
// Long (≈ 10 min) : lancé à la main avant chaque changement de réglage des boosts, pas dans le déploiement.
// Lancer : TZ=Europe/Paris node test/fournil-chaine-boosts.js --test   [occasionnel|heure] (un seul profil)
'use strict';
const L = require('./longevite.js'), G = require('../src/game.js'), R = require('../src/chaine.js');
G.brancherPrestige(null); // la boulangerie seule, sans la chaîne (le crochet n'y change rien, mais ces parties ne la jouent pas)
const PROFILS = { occasionnel: { nom: 'occasionnel (20 min/j)', sessions: [[8, 6], [20.5, 14]] }, heure: { nom: '1 h/j', sessions: [[7.75, 15], [12.5, 15], [21, 30]] } };
for (const [id, p] of Object.entries(PROFILS)) L.PROFILS['boosts-' + id] = { sessions: p.sessions };
const args = process.argv.slice(2), seul = args.find((a) => PROFILS[a]);
const PLAFOND = 1.05;
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
// une partie de 30 jours ; boost : { mult, secs } donné une fois par semaine (lundi → dimanche, heure de Paris), ou null ; les boosts de la
// réserve sont lancés au début des sessions, avec ou sans (le joueur de longevite ne les lance jamais : ce serait injuste pour l'une des deux)
function partie(id, seed, t0, boost) {
  let semaine = '';
  return L.simuler('boosts-' + id, 30, { t0, seed, chaqueSeconde: (st, now, s) => {
    if (s !== 0) return;
    if (boost) { const k = G.semaineKey(now); if (k !== semaine) { semaine = k; G.donnerBoostReserve(st, boost.mult, boost.secs); } }
    const b = st.boosts; if (b && b.reserve.length && !(b.actif && b.actif.fin > now)) G.lancerBoostReserve(st, 0);
  } }).st.etoiles;
}
const geo = (l) => Math.exp(l.reduce((x, y) => x + Math.log(y), 0) / l.length);
const t0 = Date.now();
for (const id of seul ? [seul] : Object.keys(PROFILS)) {
  console.log(`── ${PROFILS[id].nom} ──`);
  const sans = {}; // les parties sans boost, une fois pour les deux boosts
  for (const [quand, depart] of Object.entries(L.DEPARTS)) for (const seed of [11, 23, 37]) sans[`${quand}|${seed}`] = partie(id, seed, depart, null);
  for (const b of R.BOOSTS) {
    const rapports = [];
    for (const [quand, depart] of Object.entries(L.DEPARTS)) for (const seed of [11, 23, 37]) {
      const a = sans[`${quand}|${seed}`], x = partie(id, seed, depart, b); rapports.push(x / a);
      console.log(`     ${b.nom}, ${quand}, graine ${seed} : sans ${a} · avec ${x} (×${(x / a).toFixed(3)})`);
    }
    const g = geo(rapports);
    check(g < PLAFOND, `${PROFILS[id].nom}, ${b.nom} par semaine (${b.prix} jetons) : les étoiles au 30e jour ×${g.toFixed(3)} en moyenne géométrique de ${rapports.length} parties (de ×${Math.min(...rapports).toFixed(3)} à ×${Math.max(...rapports).toFixed(3)}), sous ×${PLAFOND}`);
  }
}
console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
process.exit(fails && args.includes('--test') ? 1 : 0);
