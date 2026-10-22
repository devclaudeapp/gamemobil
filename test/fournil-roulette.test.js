#!/usr/bin/env node
// L'arrière-salle du Fournil (src/roulette.js) : la roulette européenne, ses règles pures. L'ordre de la roue (le même que la roue 3D),
// les couleurs, chaque mise (rouge / noir, pair / impair, manque / passe 1 pour 1 ; douzaines, colonnes 2 pour 1 ; plein 35 pour 1) payée
// sur les 37 numéros, le rendement exact de chaque mise (−1/37 = −2,70 %) et un Monte-Carlo, les mises bornées à la caisse (tapis compris),
// les mises absurdes écartées, le tirage d'abord (rien en suspens), le hasard sans horloge, une vieille sauvegarde remise d'aplomb,
// et surtout : AUCUNE incidence sur la fortune (lifetime, lifetimeRun), les étoiles, les objectifs, les défis ou les points de boulanger.
// Lancer : TZ=Europe/Paris node test/fournil-roulette.test.js
'use strict';
const G = require('../src/game.js'), R = require('../src/roulette.js');
const fs = require('fs'), path = require('path');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 14, 8, 0);
const proche = (a, b) => Math.abs(a - b) < 1e-6;
function boutique(coins) { const st = G.newState(T0); st.coins = coins; st.lifetime = 123456; st.lifetimeRun = 65432; st.etoiles = 3; return st; }
const sur = (num) => () => (num + 0.5) / 37; // le tirage forcé (comme le commutateur de test window.__rouletteTirage d'arriere.js)
const empreinte = (st) => JSON.stringify({ lifetime: st.lifetime, lifetimeRun: st.lifetimeRun, etoiles: st.etoiles, jour: st.jour, points: st.points, semaine: st.semaine, stats: st.stats, trophees: st.trophees, atelier: st.atelier, xp: st.xp, distinctions: st.distinctions });

console.log('── la roue et les couleurs ──');
check(R.ORDRE.length === 37 && new Set(R.ORDRE).size === 37 && R.ORDRE.every((x) => Number.isInteger(x) && x >= 0 && x <= 36) && R.ORDRE[0] === 0 && R.ORDRE[1] === 32 && R.ORDRE[36] === 26, 'l’ordre de la roue : les 37 cases, chacune une fois, 0 puis 32 … 26');
{ const roue = '/tmp/claude-0/-home-user-gamemobil/41d35c83-7751-5490-8f33-9fca376790e6/scratchpad/casino/rendu/roue.js';
  const attendu = '0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26';
  const m = fs.existsSync(roue) ? /export const ORDRE = \[([^\]]+)\]/.exec(fs.readFileSync(roue, 'utf8')) : null;
  check(R.ORDRE.join(', ') === (m ? m[1] : attendu), `le même ordre que la roue 3D du repérage${m ? '' : ' (recopié ici)'}`); }
check(R.ROUGES.length === 18 && R.couleur(0) === 'vert' && R.couleur(1) === 'rouge' && R.couleur(2) === 'noir' && R.couleur(32) === 'rouge' && R.couleur(26) === 'noir' && R.couleur(19) === 'rouge' && R.couleur(10) === 'noir',
  'les couleurs : 18 rouges, 18 noirs, le zéro vert (1 rouge, 2 noir, 19 rouge, 10 noir)');
{ let alt = true; for (let i = 1; i < 37; i++) if (R.couleur(R.ORDRE[i]) === R.couleur(R.ORDRE[i === 36 ? 1 : i + 1])) alt = false; check(alt, 'sur la roue, rouge et noir alternent tout le tour'); }

console.log('── les mises, leur nom et ce qu’elles couvrent ──');
const MISES = [{ type: 'rouge' }, { type: 'noir' }, { type: 'pair' }, { type: 'impair' }, { type: 'manque' }, { type: 'passe' },
  { type: 'douzaine', k: 1 }, { type: 'douzaine', k: 2 }, { type: 'douzaine', k: 3 }, { type: 'colonne', k: 1 }, { type: 'colonne', k: 2 }, { type: 'colonne', k: 3 },
  ...Array.from({ length: 37 }, (_, i) => ({ type: 'plein', n: i }))];
check(MISES.every((m) => R.couvre(m).length === { rouge: 18, noir: 18, pair: 18, impair: 18, manque: 18, passe: 18, douzaine: 12, colonne: 12, plein: 1 }[m.type]), 'rouge, noir, pair, impair, manque, passe : 18 numéros ; douzaine, colonne : 12 ; plein : 1');
check(MISES.filter((m) => R.TYPES[m.type].paie === 1).every((m) => !R.gagne(m, 0)) && R.gagne({ type: 'plein', n: 0 }, 0) && !R.gagne({ type: 'douzaine', k: 1 }, 0) && !R.gagne({ type: 'colonne', k: 1 }, 0), 'le zéro fait perdre toutes les chances simples, les douzaines et les colonnes ; seul le plein sur 0 le gagne');
check(R.couvre({ type: 'colonne', k: 1 }).join() === '1,4,7,10,13,16,19,22,25,28,31,34' && R.couvre({ type: 'douzaine', k: 2 })[0] === 13 && R.couvre({ type: 'douzaine', k: 2 })[11] === 24 && R.couvre({ type: 'manque' })[17] === 18 && R.couvre({ type: 'passe' })[0] === 19, 'colonne 1 : 1, 4 … 34 ; 2e douzaine : 13 à 24 ; manque 1–18, passe 19–36');
check(R.cle({ type: 'rouge' }) === 'rouge' && R.cle({ type: 'douzaine', k: 2 }) === 'douzaine-2' && R.cle({ type: 'colonne', k: 1 }) === 'colonne-1' && R.cle({ type: 'plein', n: 17 }) === 'plein-17', 'les clés : rouge, douzaine-2, colonne-1, plein-17');
check(R.nomMise({ type: 'rouge' }) === 'Rouge' && R.nomMise({ type: 'douzaine', k: 2 }) === '2e douzaine (13–24)' && R.nomMise({ type: 'colonne', k: 1 }) === 'Colonne 1' && R.nomMise({ type: 'plein', n: 17 }) === 'Plein 17' && R.nomMise({ type: 'x' }) === '', 'les noms : Rouge, 2e douzaine (13–24), Colonne 1, Plein 17');
check(R.TYPES.rouge.paie === 1 && R.TYPES.manque.paie === 1 && R.TYPES.douzaine.paie === 2 && R.TYPES.colonne.paie === 2 && R.TYPES.plein.paie === 35 && Object.isFrozen(R.TYPES), 'les paiements : 1 pour 1, 2 pour 1, 35 pour 1');

console.log('── chaque mise payée sur les 37 numéros ; le rendement exact ──');
{ let ok = 0, tout = 0; const rend = {};
  for (const m of MISES) {
    let rendu = 0;
    for (let num = 0; num <= 36; num++) {
      const st = boutique(1000), r = R.lancer(st, [Object.assign({ mise: 10 }, m)], sur(num));
      const attendu = R.couvre(m).includes(num) ? 10 * (R.TYPES[m.type].paie + 1) : 0;
      tout++; if (r.ok && r.tour.numero === num && proche(r.tour.gain, attendu) && proche(st.coins, 990 + attendu) && proche(r.tour.net, attendu - 10) && r.tour.mises[0].gagne === attendu > 0) ok++;
      rendu += attendu;
    }
    rend[R.cle(m)] = rendu / (37 * 10) - 1;
  }
  check(ok === tout && tout === 49 * 37, `${tout} tirages forcés (49 mises × 37 numéros) : chaque gain exact, la caisse au centime`);
  check(Object.values(rend).every((x) => proche(x, -1 / 37)), `le rendement exact de chaque mise : −1/37 = ${(-100 / 37).toFixed(2)} %`); }
{ const st = boutique(1000), r = R.lancer(st, [{ type: 'rouge', mise: 100 }, { type: 'noir', mise: 100 }, { type: 'plein', n: 7, mise: 10 }, { type: 'douzaine', k: 1, mise: 50 }], sur(7)).tour;
  check(proche(r.mise, 260) && proche(r.gain, 200 + 360 + 150) && proche(st.coins, 1000 - 260 + 710) && r.couleur === 'rouge' && r.mises.length === 4, 'plusieurs mises au même tour (7 rouge) : rouge 200, plein 360, 1re douzaine 150, noir perdu');
  const z = boutique(1000), t0 = R.lancer(z, [{ type: 'rouge', mise: 100 }, { type: 'noir', mise: 100 }], sur(0)).tour;
  check(t0.numero === 0 && t0.couleur === 'vert' && t0.gain === 0 && proche(z.coins, 800), 'le zéro : rouge et noir perdus tous les deux (pas de partage)'); }

console.log('── Monte-Carlo : le hasard réel ──');
{ const st = boutique(1e15), c0 = st.coins, N = 400000; let mise = 0; const vus = new Array(37).fill(0);
  for (let i = 0; i < N; i++) { const r = R.lancer(st, [{ type: i % 2 ? 'rouge' : 'impair', mise: 100 }, { type: 'douzaine', k: 1 + (i % 3), mise: 50 }]); mise += 150; vus[r.tour.numero]++; }
  const rend = (st.coins - c0) / mise;
  check(Math.abs(rend + 1 / 37) < 0.006, `${N.toLocaleString('fr')} tours au hasard (chances simples et douzaines) : rendement ${(100 * rend).toFixed(2)} % (attendu −2,70 %)`);
  const att = N / 37, chi2 = vus.reduce((s, k) => s + (k - att) ** 2 / att, 0);
  check(chi2 < 80, `les 37 numéros sortent également (khi² ${chi2.toFixed(1)} pour 36 degrés de liberté, seuil 80)`);
  const S = R.etat(st).stats; check(S.tours === N && S.gagnes + S.perdus + S.egalites === N && proche(S.solde, st.coins - c0) && proche(S.mise, mise), 'les statistiques : tours, gagnés + perdus + égalités, solde, total misé'); }

console.log('── les mises bornées à la caisse ; les mises absurdes ──');
{ const st = boutique(500);
  const b = R.borner(st, [{ type: 'rouge', mise: 300 }, { type: 'noir', mise: 300 }, { type: 'plein', n: 3, mise: 50 }]);
  check(b.mises.length === 2 && proche(b.mises[0].mise, 300) && proche(b.mises[1].mise, 200) && proche(b.total, 500) && b.tapis, 'bornées dans l’ordre où elles sont posées : 300 + 200, le plein n’a plus rien (tapis)');
  const f = R.borner(st, [{ type: 'rouge', mise: 10 }, { type: 'rouge', mise: 15 }, { type: 'plein', n: 3, mise: 5 }, { type: 'plein', n: 3, mise: 5 }]);
  check(f.mises.length === 2 && proche(f.mises[0].mise, 25) && proche(f.mises[1].mise, 10) && !f.tapis, 'deux mises sur la même case : fusionnées (rouge 25, plein 3 : 10)');
  const absurdes = [null, 42, 'rouge', { type: 'bleu', mise: 10 }, { type: 'douzaine', k: 4, mise: 10 }, { type: 'colonne', mise: 10 }, { type: 'plein', n: 37, mise: 10 }, { type: 'plein', n: 1.5, mise: 10 },
    { type: 'plein', n: -1, mise: 10 }, { type: 'rouge', mise: -5 }, { type: 'rouge', mise: NaN }, { type: 'rouge', mise: Infinity }, { type: 'rouge', mise: '10' }, { type: '__proto__', mise: 10 }, { type: 'constructor', mise: 10 }];
  check(R.borner(st, absurdes).mises.length === 0 && R.borner(st, 'x').total === 0 && R.borner(st, null).total === 0, 'les mises absurdes (type inconnu, k ou n hors des cases, montants négatifs, NaN, infinis, texte) : écartées');
  const r = R.lancer(st, absurdes); check(!r.ok && r.raison === 'vide' && st.coins === 500 && R.etat(st).historique.length === 0, 'un tour sans mise valable : refusé (vide), rien ne bouge');
  check(R.lancer(st, []).raison === 'vide' && R.lancer(st, [{ type: 'rouge', mise: 0.4 }]).raison === 'mise' && st.coins === 500, 'il faut 1 € au moins sur une case');
  const nettoye = R.borner(st, [{ type: 'plein', n: 4, mise: 5, pirate: 'x', k: 2 }]).mises[0]; check(nettoye && !('pirate' in nettoye) && !('k' in nettoye) && nettoye.n === 4, 'une mise nettoyée : seulement type, k ou n, mise');
  const beaucoup = MISES.map((m) => Object.assign({ mise: 1 }, m)); // 49 cases différentes
  check(R.borner(boutique(1e6), beaucoup).mises.length === R.MAX_MISES && R.lancer(boutique(1e6), beaucoup).tour.mises.length === R.MAX_MISES, `au plus ${R.MAX_MISES} cases au même tour (49 posées)`); }
{ const st = boutique(300); const r = R.lancer(st, [{ type: 'noir', mise: 1e9 }], sur(1)).tour;
  check(r.tapis && proche(r.mise, 300) && st.coins === 0 && r.caisse === 300, 'tapis perdu (1 rouge, sur noir) : la caisse est à zéro');
  check(!R.lancer(st, [{ type: 'rouge', mise: 10 }]).ok && R.lancer(st, [{ type: 'rouge', mise: 10 }]).raison === 'mise', 'caisse vide : plus de tour possible');
  const s2 = boutique(777.5); R.lancer(s2, [{ type: 'rouge', mise: 777.5 }], sur(1)); check(proche(s2.coins, 1555), 'tapis gagné sur rouge : la caisse double'); }

console.log('── le tirage d’abord : rien en suspens ; le hasard sans horloge ──');
{ const st = boutique(1000), r = R.lancer(st, [{ type: 'plein', n: 17, mise: 10 }], sur(17), T0);
  const st2 = JSON.parse(JSON.stringify(st));
  check(r.ok && proche(st.coins, 1350) && R.etat(st).dernier.numero === 17 && proche(st2.coins, 1350) && R.etat(st2).dernier.gain === 360 && r.tour.quand === T0, 'le numéro, la mise et le gain dans le même appel : la sauvegarde d’après ne garde rien en suspens');
  st2.lifetimeRun = 1e15; const nb = G.nouvelleBoutique(st2, T0); check(nb.ok && !nb.main, 'une nouvelle boutique n’a aucun tour à annuler'); }
check(R.tirer(() => 0) === 0 && R.tirer(() => 0.999999999) === 36 && R.tirer(() => 1) === 36 && R.tirer(() => NaN) === 0 && R.tirer(() => -1) === 0 && [...Array(37).keys()].every((k) => R.tirer(sur(k)) === k), 'tirer : 0 … 36, le tirage forcé tombe juste sur chaque case, bornes tenues');
{ const dn = Date.now; Date.now = () => 1234567890000; const a = Array.from({ length: 40 }, () => R.tirer()).join(), b = Array.from({ length: 40 }, () => R.tirer()).join(); Date.now = dn;
  check(a !== b, 'horloge figée : les tirages restent imprévisibles (crypto.getRandomValues)');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'roulette.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check(!/Date\.now|new Date|performance\.now|HORLOGE/.test(src) && /getRandomValues/.test(src), 'src/roulette.js ne lit jamais l’heure ; il tire crypto.getRandomValues');
  check(!/gagner|lifetime|etoiles|noter|objectif|points|\.xp\b|\bdefis?\b/.test(src), 'src/roulette.js n’appelle ni gagner(), ni noter(), et n’écrit ni lifetime, ni étoiles, ni points'); }

console.log('── l’état dans la sauvegarde ──');
{ const st = boutique(1000); st.arriere = { trouvee: true, stats: { mains: 3 } }; const r = R.etat(st);
  check(r.mises.length === 0 && r.dernier === null && r.historique.length === 0 && R.STATS.every((k) => r.stats[k] === 0) && st.arriere.trouvee === true && st.arriere.stats.mains === 3, 'une vieille sauvegarde (sans roulette) : une table neuve, le reste de l’arrière-salle gardé');
  st.arriere.roulette = { mises: [{ type: 'rouge', mise: 5 }, { type: 'bleu', mise: 5 }, 'x'], dernier: { numero: 99 }, historique: [1, 99, 'x', 5, 36], stats: { tours: 'x', solde: -40 } }; const r2 = R.etat(st);
  check(r2.mises.length === 1 && r2.dernier === null && r2.historique.join() === '1,5,36' && r2.stats.tours === 0 && r2.stats.solde === -40, 'une table abîmée : remise d’aplomb (mises, dernier tour, historique, statistiques)');
  const s3 = boutique(1e6); for (let k = 0; k < 20; k++) R.lancer(s3, [{ type: 'plein', n: k % 37, mise: 1 }], sur(k));
  const r3 = R.etat(s3); check(r3.historique.length === 12 && r3.historique[11] === 19 && r3.historique[0] === 8 && r3.dernier.numero === 19 && r3.mises.length === 1 && r3.mises[0].n === 19, 'l’historique : les 12 derniers numéros, le plus récent à la fin ; « même mise » : les dernières mises'); }
{ const st = boutique(1e6); const S = R.etat(st).stats;
  R.lancer(st, [{ type: 'rouge', mise: 10 }], sur(1)); R.lancer(st, [{ type: 'rouge', mise: 10 }, { type: 'noir', mise: 10 }], sur(2)); R.lancer(st, [{ type: 'plein', n: 5, mise: 10 }], sur(5));
  check(S.serie === 2 && S.meilleureSerie === 2 && S.egalites === 1 && S.pleins === 1 && proche(S.plusGrosGain, 350), 'gagné, égalité (rouge et noir), plein gagné : la série à 2, l’égalité ne la casse pas ; plus gros gain 350');
  R.lancer(st, [{ type: 'rouge', mise: 10 }], sur(0)); check(S.serie === 0 && S.meilleureSerie === 2 && S.perdus === 1, 'le zéro : perdu, la série cassée'); }

console.log('── aucune incidence sur la fortune, les étoiles, les objectifs, les points ──');
{ const st = boutique(1e6); G.objectifsDuJour(st, T0); const avant = empreinte(st), pts = JSON.stringify(G.detailPoints ? G.detailPoints(st) : null), c0 = st.coins; let net = 0;
  const autres = JSON.stringify(Object.assign({}, st, { coins: 0, arriere: 0 }));
  for (let k = 0; k < 10000; k++) { const r = R.lancer(st, [MISES[k % MISES.length]].map((m) => Object.assign({ mise: 1 + (k % 50) }, m)).concat(k % 3 ? [] : [{ type: 'rouge', mise: 7 }])); if (r.ok) net += r.tour.net; }
  check(empreinte(st) === avant && JSON.stringify(G.detailPoints ? G.detailPoints(st) : null) === pts, '10 000 tours : lifetime, lifetimeRun, étoiles, objectifs du jour, points, statistiques, trophées, Atelier, expérience : inchangés');
  check(JSON.stringify(Object.assign({}, st, { coins: 0, arriere: 0 })) === autres, 'tout l’état de la partie, hors st.coins et st.arriere, à l’identique');
  check(proche(st.coins, c0 + net), `seule la caisse bouge, du bilan exact des tours (${Math.round(net)} €)`); }
{ const build = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  check(build.indexOf("'blackjack.js', 'roulette.js', 'casino.js'") > 0 && build.indexOf("'roulette.js'") < build.indexOf("'arriere.js'") && build.indexOf("'casino.js'") < build.indexOf("'ui.js'"), 'build.js charge src/roulette.js et src/casino.js juste après blackjack.js, avant l’arrière-salle et l’interface'); }

console.log(`\n${n - fails}/${n} ${fails ? 'ÉCHECS : ' + fails : 'tout est vert'}`);
process.exit(fails ? 1 : 0);
