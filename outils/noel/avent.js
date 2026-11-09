#!/usr/bin/env node
// Le calendrier de l'Avent (point 7, docs/noel-contrat.md § 2) : la RÉFÉRENCE des règles, pour les simulations de conception et pour le
// constructeur A (src/avent.js reprend ces fonctions et ces chiffres ; test/fournil-avent.test.js compare les deux sur les mêmes scénarios).
// Rien ici n'est le jeu. Sans DOM ni game.js ; le « maintenant » et l'heure sûre sont toujours donnés par l'appelant.
//
// LA RÈGLE (la plus juste et la plus simple à dire) : « Chaque jour, ouvre la case du jour. Tu en as oublié ? Tu peux en rattraper UNE par
// jour, jusqu'au 31 décembre. »
//   · du 1er au 24 décembre (heure de Paris), le jour D : la case D s'ouvre (si elle n'est pas ouverte), et UNE case passée non ouverte
//     (k < D) au choix : au plus deux ouvertures ce jour-là ;
//   · du 25 au 31 décembre : plus de case du jour, encore un rattrapage par jour ; le 1er janvier, le calendrier se range ;
//   · jamais deux fois la même case ; jamais une case future (n > D) ; jamais deux rattrapages le même jour, ni un rattrapage un jour
//     d'avant le dernier (une horloge qui recule ne rend pas un rattrapage) ;
//   · le jour D se lit sur l'heure SÛRE quand elle est connue (HORLOGE.etat().sure : comme MARCHE.fenetreSure) : avancer l'heure du
//     téléphone hors ligne n'ouvre pas la case de demain ; sans heure sûre (l'artefact Claude), sur le « maintenant » du jeu.
// L'état : st.avent = { v: 1, id: 'avent-2026', o: 0, r: '' } (o : le masque des cases ouvertes, bit n − 1 = case n ; r : le dernier jour
// de Paris où une case a été RATTRAPÉE, 'AAAA-MM-JJ').
'use strict';
const SA = require('../../src/saison.js'); // (l'heure de Paris : parisMs, dayKey, paris)
const ID = 'avent-2026', DEBUT = SA.parisMs(2026, 12, 1, 0), FIN_CASES = SA.parisMs(2026, 12, 25, 0), FIN = SA.parisMs(2027, 1, 1, 0), CASES = 24;
const M = 1800;
// les 24 cases (docs/noel-contrat.md § 2.3) ; speciale : les cases 6, 12, 18, 24
const LOTS = [ // (chaque case : une friandise, FRIANDISES, et 10 XP de saison ; en plus, le lot ci-dessous : « {} », rien de plus)
  { n: 1, etoiles: 1 },
  { n: 2, deco: 'couronne-avent' },                       // la couronne de l'Avent et ses quatre bougies (le comptoir, une lueur)
  { n: 3, boost: { mult: 2, secs: M } },
  { n: 4 },
  { n: 5, vetement: 'avent-bonnet' },                     // le bonnet de Noël (rouge, pompon blanc)
  { n: 6, speciale: true, compagnon: 'renne', etoiles: 1 }, // la Saint-Nicolas : le petit renne « Grelot »
  { n: 7 },
  { n: 8, deco: 'chaussettes' },                          // la guirlande de chaussettes (le rebord)
  { n: 9, etoiles: 1 },
  { n: 10 },
  { n: 11, vetement: 'avent-echarpe' },                   // l'écharpe rayée rouge et blanche
  { n: 12, speciale: true, deco: 'village-noel', etoiles: 1 }, // le village de Noël miniature (le comptoir, une lueur)
  { n: 13 },
  { n: 14, boost: { mult: 2, secs: M } },
  { n: 15, deco: 'bonhomme-neige' },                      // le bonhomme de neige (le sol)
  { n: 16 },
  { n: 17, vetement: 'avent-pull' },                      // le pull de Noël aux flocons
  { n: 18, speciale: true, deco: 'boule-neige', etoiles: 1 }, // la boule à neige (le comptoir)
  { n: 19 },
  { n: 20, etoiles: 1 },
  { n: 21 },
  { n: 22, boost: { mult: 3, secs: M } },
  { n: 23 },
  { n: 24, speciale: true, vetement: 'avent-chaussons', aura: 'flocons', etoiles: 2 }, // le réveillon : les chaussons, la tenue de Noël complète, l'aura des flocons
];
// les friandises (un dessin, aucun état) : la case n montre FRIANDISES[(n − 1) % 8], dans la teinte Math.floor((n − 1) / 8)
const FRIANDISES = ['sucre-orge', 'papillote', 'bonhomme-pain-epices', 'clementine', 'etoile-chocolat', 'guimauve', 'nougat', 'coeur-pain-epices'];
// l'ordre des cases sur la feuille (mélangé, le même pour tous)
const ORDRE_CASES = [12, 3, 19, 7, 22, 1, 15, 9, 6, 17, 2, 21, 10, 24, 5, 14, 20, 8, 13, 23, 4, 18, 11, 16];
// (v1 du 9 nov., écartée : 19 ★ et 4 boosts, des étoiles aux cases 1, 4, 7, 10, 13, 16, 19, 21, 22, 23 et 2 ★ aux spéciales : +30 % d'étoiles au
//  30e jour pour le nouveau joueur occasionnel du 1er décembre (4 graines) ; docs/noel-contrat.md § 8.3)
const objet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const JOUR_OK = /^\d{4}-\d{2}-\d{2}$/;
const ouverte = (a, n) => n >= 1 && n <= CASES && Math.floor(a.o / 2 ** (n - 1)) % 2 === 1;
const nOuvertes = (a) => { let k = 0; for (let n = 1; n <= CASES; n++) if (ouverte(a, n)) k++; return k; };
// le jour de l'Avent : 0 avant le 1er déc., 1 à 31 en décembre (Paris), 0 à partir du 1er janvier ; sur l'heure sûre quand elle est connue
function jour(now, sure) {
  const t = Number.isFinite(sure) && sure > 0 ? Math.min(now, sure) : now;
  if (!Number.isFinite(t) || t < DEBUT || t >= FIN || now >= FIN) return 0;
  return SA.paris(t).getUTCDate();
}
function neuf() { return { v: 1, id: ID, o: 0, r: '' }; }
function reparer(st, now) { // jamais d'exception ; un état abîmé : ce qui se lit est gardé (jamais une case rouverte)
  let a = st.avent;
  if (!objet(a)) { a = st.avent = neuf(); return a; }
  a.v = 1; if (a.id !== ID) { if (typeof a.id === 'string' && a.id && a.id !== ID) { st.avent = neuf(); return st.avent; } a.id = ID; }
  if (!(Number.isSafeInteger(a.o) && a.o >= 0 && a.o < 2 ** CASES)) a.o = 0;
  if (!(typeof a.r === 'string' && (a.r === '' || JOUR_OK.test(a.r)))) a.r = Number.isFinite(now) ? SA.dayKey(now) : ''; // (abîmé : pas de rattrapage avant demain ; jamais deux le même jour)
  return a;
}
function etat(st, now) { if (!st || typeof st !== 'object') return null; if (st.avent === undefined && !(now >= DEBUT && now < FIN)) return null; return reparer(st, now); }
// ce qui peut s'ouvrir maintenant : { du: n ou 0 (la case du jour), rattrapage: [k…] (les cases oubliées, si le rattrapage du jour est libre), jour }
function ouvrables(st, now, sure) {
  const D = jour(now, sure), a = st && objet(st.avent) ? st.avent : null, o = { jour: D, du: 0, rattrapage: [] };
  if (!D) return o; const A = a || neuf(), auj = SA.dayKey(Number.isFinite(sure) && sure > 0 ? Math.min(now, sure) : now);
  if (D <= CASES && !ouverte(A, D)) o.du = D;
  if (!(A.r && A.r >= auj)) for (let k = 1; k <= Math.min(D - 1, CASES); k++) if (!ouverte(A, k)) o.rattrapage.push(k);
  return o;
}
// ouvrir la case n : marque ET rend son lot (que l'écran distribue en même temps, dans le même geste : verser) ; { ok, lot, raison }
function ouvrir(st, n, now, sure) {
  if (!Number.isInteger(n) || n < 1 || n > CASES) return { ok: false, raison: 'inconnue' };
  const a = etat(st, now); if (!a) return { ok: false, raison: 'ferme' };
  const D = jour(now, sure); if (!D) return { ok: false, raison: 'ferme' };
  if (ouverte(a, n)) return { ok: false, raison: 'deja' };
  if (n > D) return { ok: false, raison: 'future' };
  const auj = SA.dayKey(Number.isFinite(sure) && sure > 0 ? Math.min(now, sure) : now);
  if (n !== D) { if (a.r && a.r >= auj) return { ok: false, raison: 'rattrapage' }; a.r = auj; }
  a.o += 2 ** (n - 1);
  return { ok: true, lot: Object.assign({}, LOTS[n - 1]), rattrapage: n !== D };
}
// verser un lot dans la boulangerie (G : GAME) : étoiles, boost dans la réserve, vêtement ; la déco, le compagnon et l'aura se lisent sur st.avent (possede)
function verser(st, lot, G) {
  const fait = { etoiles: 0, boost: null, vetement: null };
  if (!lot || !st) return fait;
  if (lot.etoiles > 0) { st.etoiles = (st.etoiles || 0) + lot.etoiles; fait.etoiles = lot.etoiles; }
  if (lot.boost && G && typeof G.donnerBoostReserve === 'function') fait.boost = G.donnerBoostReserve(st, lot.boost.mult, lot.boost.secs);
  if (lot.vetement && G && typeof G.donnerVetement === 'function') { try { G.donnerVetement(st, lot.vetement); fait.vetement = lot.vetement; } catch (e) { /* pièce inconnue */ } }
  return fait;
}
module.exports = { ID, DEBUT, FIN_CASES, FIN, CASES, LOTS, FRIANDISES, ORDRE_CASES, jour, neuf, reparer, etat, ouvrables, ouvrir, verser, ouverte, nOuvertes };

if (require.main === module) { // les scénarios de la règle (les mêmes que test/fournil-avent.test.js devra jouer sur src/avent.js)
  let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
  const P = (j, h, mi = 0, m = 12, a = 2026) => SA.parisMs(a, m, j, h) + mi * 60e3;
  { const st = {}; check(ouvrir(st, 1, P(30, 23, 59, 11)).raison === 'ferme' && st.avent === undefined, 'le 30 nov. 23 h 59 : fermé, rien n’est créé'); }
  { const st = {}; const r = ouvrir(st, 1, P(1, 0, 0)); check(r.ok && r.lot.etoiles === 1 && !r.rattrapage && nOuvertes(st.avent) === 1, 'le 1er déc. à 0 h : la case 1 s’ouvre (1 ★)');
    check(ouvrir(st, 1, P(1, 9)).raison === 'deja', 'jamais deux fois la même case'); check(ouvrir(st, 2, P(1, 23, 59)).raison === 'future', 'jamais une case future (la 2 le 1er à 23 h 59)'); }
  { const st = {}; ouvrir(st, 3, P(3, 8)); const a = ouvrir(st, 1, P(3, 9)), b = ouvrir(st, 2, P(3, 10));
    check(a.ok && a.rattrapage && b.raison === 'rattrapage', 'le 3 : la case du jour, plus UNE case oubliée (la 1) ; pas une deuxième (la 2 attend demain)');
    const c = ouvrir(st, 2, P(4, 0, 1)), d = ouvrir(st, 4, P(4, 0, 2)); check(c.ok && d.ok && nOuvertes(st.avent) === 4, 'le 4 : la 2 rattrapée et la case du jour : 4 cases'); }
  { const st = {}; const r = ouvrir(st, 1, P(1, 22), P(30, 23, 0, 11)); check(r.raison === 'ferme', 'heure du téléphone avancée hors ligne (heure sûre : 30 nov. 23 h) : le calendrier reste fermé');
    const st2 = {}; ouvrir(st2, 5, P(5, 9)); const r2 = ouvrir(st2, 6, P(6, 1), P(5, 21)); check(r2.raison === 'future', 'le 6 à 1 h au téléphone, l’heure sûre dit le 5 à 21 h : la case 6 (le renne) attend'); }
  { const st = {}; ouvrir(st, 10, P(10, 9)); ouvrir(st, 1, P(10, 9, 5)); const r = ouvrir(st, 2, P(9, 23, 0)); // (une horloge qui recule : un jour d'avant le dernier rattrapage)
    check(r.raison === 'rattrapage', 'une horloge qui recule au 9 après un rattrapage le 10 : pas de rattrapage de plus'); }
  { const st = {}; for (let d = 25; d <= 31; d++) ouvrir(st, d - 24, P(d, 12)); check(nOuvertes(st.avent) === 7 && ouvrir(st, 8, P(31, 13)).raison === 'rattrapage' && ouvrir(st, 8, P(1, 0, 0, 1, 2027)).raison === 'ferme', 'du 25 au 31 : un rattrapage par jour (7 cases) ; le 1er janvier, le calendrier est rangé'); }
  { const st = { avent: 'abîmé' }; reparer(st); check(st.avent.o === 0 && st.avent.id === ID, 'abîmé (pas un objet) : neuf'); const s2 = { avent: { v: 1, id: ID, o: 5, r: 3 } }; reparer(s2, P(4, 8)); check(s2.avent.o === 5 && ouvrir(s2, 2, P(4, 9)).raison === 'rattrapage' && ouvrir(s2, 4, P(4, 9)).ok && ouvrir(s2, 2, P(5, 9)).ok, 'r abîmé (le 4) : les cases gardées, pas de rattrapage ce jour-là, la case du jour oui ; le rattrapage revient le lendemain'); }
  { const tot = LOTS.reduce((a, l) => a + (l.etoiles || 0), 0), b = LOTS.filter((l) => l.boost).length; check(LOTS.length === 24 && LOTS.every((l, k) => l.n === k + 1) && tot === 8 && b === 3 && ORDRE_CASES.slice().sort((x, y) => x - y).join() === LOTS.map((l) => l.n).join() && LOTS.filter((l) => l.speciale).map((l) => l.n).join() === '6,12,18,24', `24 cases, ${tot} ★, ${b} boosts, spéciales 6, 12, 18, 24`); }
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.'); process.exitCode = fails ? 1 : 0;
}
