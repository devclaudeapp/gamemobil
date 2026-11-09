#!/usr/bin/env node
// Le calendrier de l'Avent 2026 (src/avent.js ; docs/noel-contrat.md § 2) : la règle (« Chaque jour, ouvre la case du jour. Tu en as oublié ?
// Tu peux en rattraper une par jour, jusqu'au 31 décembre. »), jouée sur les scénarios de la référence (outils/noel/avent.js) : fermé le
// 30 nov. à 23 h 59, ouvert le 1er à 0 h, jamais deux fois la même case, jamais une future, la case du jour et une oubliée mais pas deux,
// l'heure sûre en retard (fermé, la case attend), une horloge qui recule (pas de rattrapage de plus ; l'horloge du jeu recalée en
// arrière : rien ne s'ouvre avant de revenir au plus haut jour d'une ouverture, st.avent.j), du 25 au 31 un rattrapage par jour,
// rangé le 1er janvier ; les 24 lots du contrat (§ 2.3 : 8 ★, 3 boosts, les spéciales 6, 12, 18, 24) ; la réparation (null, [], 'x',
// { o: -1, r: 3 }, une version future) ; verser dans la boulangerie (étoiles, boost en réserve, pièce de la garde-robe, aura ; le renne et les
// décos par possede) ; aVerser (un écran tombé entre ouvrir et verser) ; la vue de l'écran ; le déblocage « avent » de l'accueil (bit 16, la
// fenêtre) ; le carnet (les familles avent et piste-hiver) ; la simulation des ouvertures (l'occasionnel quatre jours sur sept : 22 le 24,
// 24 le 31 ; jamais plus de deux le même jour) ; src/avent.js et la référence rendent la même chose sur 1 000 scénarios tirés au hasard.
// Lancer : TZ=Europe/Paris node test/fournil-avent.test.js
'use strict';
const A = require('../src/avent.js'), REF = require('../outils/noel/avent.js'), SA = require('../src/saison.js'), G = require('../src/game.js'), CH = require('../src/chaine.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const P = (j, h, mi = 0, m = 12, a = 2026) => SA.parisMs(a, m, j, h) + mi * 60e3; // le j (décembre par défaut) à h:mi, heure de Paris

console.log('── les dates, les constantes ──');
check(A.ID === 'avent-2026' && A.CASES === 24 && A.DEBUT === P(1, 0) && A.FIN_CASES === P(25, 0) && A.FIN === P(1, 0, 0, 1, 2027) && A.DEBUT === REF.DEBUT && A.FIN === REF.FIN && A.FIN_CASES === REF.FIN_CASES, 'du 1er déc. 2026 à 0 h (Paris) ; plus de case du jour le 25 à 0 h ; rangé le 1er janv. 2027 à 0 h (comme la référence)');
check(A.jour(P(30, 23, 59, 11)) === 0 && A.jour(P(1, 0)) === 1 && A.jour(P(24, 23, 59)) === 24 && A.jour(P(31, 23, 59)) === 31 && A.jour(P(1, 0, 0, 1, 2027)) === 0, 'le jour de l’Avent : 0 le 30 nov., 1 le 1er déc. à 0 h, 24 le 24, 31 le 31, 0 le 1er janvier');
check(A.TEXTES.regle === 'Chaque jour, ouvre la case du jour. Tu en as oublié ? Tu peux en rattraper une par jour, jusqu’au 31 décembre.' && A.TEXTES.future(14) === 'Patience ! Cette case s’ouvre le 14 décembre.' && A.TEXTES.future(1) === 'Patience ! Cette case s’ouvre le 1er décembre.' && A.TEXTES.rattrapage === 'Tu as déjà rattrapé une case aujourd’hui : la suivante demain.', 'les textes du contrat (§ 2.1, § 2.6) : la règle, « Patience ! », le refus du second rattrapage');

console.log('── les scénarios de la référence (outils/noel/avent.js), joués sur src/avent.js ──');
{ const st = {}; check(A.ouvrir(st, 1, P(30, 23, 59, 11)).raison === 'ferme' && st.avent === undefined, 'le 30 nov. 23 h 59 : fermé, rien n’est créé'); }
{ const st = {}; const r = A.ouvrir(st, 1, P(1, 0, 0)); check(r.ok && r.lot.etoiles === 1 && !r.rattrapage && A.nOuvertes(st.avent) === 1, 'le 1er déc. à 0 h : la case 1 s’ouvre (1 ★)');
  check(A.ouvrir(st, 1, P(1, 9)).raison === 'deja', 'jamais deux fois la même case'); check(A.ouvrir(st, 2, P(1, 23, 59)).raison === 'future', 'jamais une case future (la 2 le 1er à 23 h 59)'); }
{ const st = {}; A.ouvrir(st, 3, P(3, 8)); const a = A.ouvrir(st, 1, P(3, 9)), b = A.ouvrir(st, 2, P(3, 10));
  check(a.ok && a.rattrapage && b.raison === 'rattrapage', 'le 3 : la case du jour, plus UNE case oubliée (la 1) ; pas une deuxième (la 2 attend demain)');
  const c = A.ouvrir(st, 2, P(4, 0, 1)), d = A.ouvrir(st, 4, P(4, 0, 2)); check(c.ok && d.ok && A.nOuvertes(st.avent) === 4, 'le 4 : la 2 rattrapée et la case du jour : 4 cases'); }
{ const st = {}; const r = A.ouvrir(st, 1, P(1, 22), P(30, 23, 0, 11)); check(r.raison === 'ferme', 'heure du téléphone avancée hors ligne (heure sûre : 30 nov. 23 h) : le calendrier reste fermé');
  const st2 = {}; A.ouvrir(st2, 5, P(5, 9)); const r2 = A.ouvrir(st2, 6, P(6, 1), P(5, 21)); check(r2.raison === 'future', 'le 6 à 1 h au téléphone, l’heure sûre dit le 5 à 21 h : la case 6 (le renne) attend');
  const v = A.vue(st2, P(6, 1), P(5, 21)); check(v.attendHeure && v.jour === 5 && v.jourJeu === 6 && v.cases[5].etat === 'future', 'la vue le dit (attendHeure : « Ton téléphone n’a pas encore retrouvé l’heure… ») ; la case 6 reste future');
  check(A.ouvrir(st2, 6, P(6, 1), P(6, 0, 30)).ok, 'l’heure sûre revenue (le 6 à 0 h 30) : la case 6 s’ouvre'); }
{ const st = {}; A.ouvrir(st, 10, P(10, 9)); A.ouvrir(st, 1, P(10, 9, 5)); const r = A.ouvrir(st, 2, P(9, 23, 0));
  check(r.raison === 'rattrapage', 'une horloge qui recule au 9 après un rattrapage le 10 : pas de rattrapage de plus'); }
{ const st = {}; for (let d = 25; d <= 31; d++) A.ouvrir(st, d - 24, P(d, 12)); check(A.nOuvertes(st.avent) === 7 && A.ouvrir(st, 8, P(31, 13)).raison === 'rattrapage' && A.ouvrir(st, 8, P(1, 0, 0, 1, 2027)).raison === 'ferme', 'du 25 au 31 : un rattrapage par jour (7 cases) ; le 1er janvier, le calendrier est rangé'); }
{ const st = { avent: 'abîmé' }; A.reparer(st); check(st.avent.o === 0 && st.avent.id === A.ID, 'abîmé (pas un objet) : neuf'); const s2 = { avent: { v: 1, id: A.ID, o: 5, r: 3 } }; A.reparer(s2, P(4, 8)); check(s2.avent.o === 5 && A.ouvrir(s2, 2, P(4, 9)).raison === 'rattrapage' && A.ouvrir(s2, 4, P(4, 9)).ok && A.ouvrir(s2, 2, P(5, 9)).ok, 'r abîmé (le 4) : les cases gardées, pas de rattrapage ce jour-là, la case du jour oui ; le rattrapage revient le lendemain'); }
{ const st = {}; check(A.ouvrir(st, 0, P(5, 9)).raison === 'inconnue' && A.ouvrir(st, 25, P(5, 9)).raison === 'inconnue' && A.ouvrir(st, 2.5, P(5, 9)).raison === 'inconnue' && A.ouvrir(st, '3', P(5, 9)).raison === 'inconnue', 'une case inconnue (0, 25, 2,5, « 3 ») : refusée'); }
{ const st = {}; A.ouvrir(st, 24, P(24, 23, 59)); check(A.ouvrir(st, 23, P(24, 23, 59) + 30e3).ok && A.ouvrir(st, 22, P(25, 0, 1)).ok && A.ouvrir(st, 21, P(25, 10)).raison === 'rattrapage', 'le 24 à 23 h 59 : la 24 et une oubliée ; le 25 à 0 h 01, un nouveau rattrapage ; pas deux le 25'); }

console.log('── les 24 cases (§ 2.3) ──');
{ const L = A.LOTS, tot = L.reduce((a, l) => a + (l.etoiles || 0), 0), b = L.filter((l) => l.boost);
  check(L.length === 24 && L.every((l, k) => l.n === k + 1) && tot === 8 && b.length === 3 && b.map((l) => `${l.n}:×${l.boost.mult}:${l.boost.secs}`).join() === '3:×2:1800,14:×2:1800,22:×3:1800' && L.filter((l) => l.speciale).map((l) => l.n).join() === '6,12,18,24', `24 cases, ${tot} ★, ${b.length} boosts (×2, ×2, ×3, 30 min), spéciales 6, 12, 18, 24`);
  check(JSON.stringify(L) === JSON.stringify(REF.LOTS) && JSON.stringify(A.FRIANDISES) === JSON.stringify(REF.FRIANDISES) && JSON.stringify(A.ORDRE_CASES) === JSON.stringify(REF.ORDRE_CASES), 'les lots, les friandises et l’ordre des cases : la copie exacte de la référence');
  const d = (k) => L.filter((l) => l[k]).map((l) => `${l.n}:${l[k]}`).join();
  check(d('deco') === '2:couronne-avent,8:chaussettes,12:village-noel,15:bonhomme-neige,18:boule-neige' && d('vetement') === '5:avent-bonnet,11:avent-echarpe,17:avent-pull,24:avent-chaussons' && d('compagnon') === '6:renne' && d('aura') === '24:flocons' && L[23].etoiles === 2 && L[5].etoiles === 1 && L[11].etoiles === 1 && L[17].etoiles === 1, 'les décos (2, 8, 12, 15, 18), la tenue (5, 11, 17, 24), le renne (6), l’aura (24), 2 ★ le 24, 1 ★ aux autres spéciales');
  check(L.every((l) => !l.prime && !l.heures) && Object.isFrozen(L) && Object.isFrozen(L[0]), 'aucune heure de gains, rien de payant ; les lots figés (une ouverture rend une copie)');
  check(A.ORDRE_CASES.length === 24 && new Set(A.ORDRE_CASES).size === 24 && A.friandise(1).id === 'sucre-orge' && A.friandise(9).id === 'sucre-orge' && A.friandise(9).teinte === 1 && A.friandise(24).id === 'coeur-pain-epices' && A.friandise(24).teinte === 2, 'l’ordre mélangé (24 cases, chacune une fois) ; la friandise (n − 1) % 8 dans la teinte ⌊(n − 1) / 8⌋'); }

console.log('── l’état : créé dans la fenêtre seulement, la réparation ──');
{ const st = {}; check(A.etat(st, P(28, 9, 0, 11)) === null && !('avent' in st) && A.vue(st, P(28, 9, 0, 11)) === null, 'avant le 1er déc. : rien n’est créé (une vieille sauvegarde, un nouveau joueur)');
  check(A.etat(st, P(2, 9)) && st.avent.v === 1 && st.avent.id === A.ID && st.avent.o === 0 && st.avent.r === '', 'le 2 déc. : st.avent créé au premier appel { v: 1, id, o: 0, r: “” }');
  const s2 = {}; check(A.etat(s2, P(2, 9, 0, 1, 2027)) === null && !('avent' in s2) && A.vue(s2, P(2, 9, 0, 1, 2027)) === null && A.aVerser(s2, G).length === 0, 'après le 1er janvier sans st.avent : rien (pas d’Avent joué)'); }
for (const mauvais of [null, [], 'x', 3, { o: -1, r: 3 }, { id: 'avent-2031', o: 7 }, { v: 1, id: A.ID, o: 2 ** 24, r: 'hier' }, { v: 1, o: 1.5, r: '2026-12-02' }]) {
  const st = { avent: JSON.parse(JSON.stringify(mauvais)) }; let ok = true; try { A.etat(st, P(5, 9)); } catch (e) { ok = false; }
  const a = st.avent; check(ok && a && a.v === 1 && a.id === A.ID && Number.isSafeInteger(a.o) && a.o >= 0 && a.o < 2 ** 24 && typeof a.r === 'string' && (a.r === '' || /^\d{4}-\d{2}-\d{2}$/.test(a.r)), `st.avent = ${JSON.stringify(mauvais)} : remis d’aplomb (o ${a && a.o}, r « ${a && a.r} »), sans exception`);
}
{ const st = { avent: { v: 1, id: A.ID, o: 0b1011, r: '' } }; A.etat(st, P(5, 9)); check(st.avent.o === 0b1011 && A.nOuvertes(st.avent) === 3, 'un état sain se relit tel quel (les cases 1, 2, 4 ouvertes)');
  const s2 = { avent: { id: 'avent-2031', o: 7 } }; A.etat(s2, P(5, 9)); check(s2.avent.o === 0, 'un autre id (une version future) : neuf');
  const s3 = { avent: { v: 1, id: A.ID, o: 5, r: 3 } }; A.etat(s3, P(5, 9)); check(s3.avent.o === 5 && s3.avent.r === '2026-12-05' && A.ouvrables(s3, P(5, 10)).rattrapage.length === 0 && A.ouvrables(s3, P(6, 10)).rattrapage.length > 0, 'r abîmé : le jour de maintenant (pas de rattrapage aujourd’hui, il revient demain : jamais deux) ; les cases gardées');
  const s4 = { avent: null }; check(A.etat(s4, P(5, 9)).o === 0 && A.aVerser(s4, G).length === 0, 'st.avent === null : abîmé (neuf, rien à rendre)');
  check(A.nOuvertes(undefined) === 0 && A.nOuvertes({ o: -3 }) === 0 && A.nOuvertes('x') === 0 && A.nOuvertes({ o: 2 ** 30 }) === 0, 'nOuvertes (le lecteur de la saison d’hiver) ne jette jamais : 0 sur un état abîmé'); }

console.log('── ouvrables, la vue ──');
{ const st = {}; A.ouvrir(st, 1, P(1, 9)); A.ouvrir(st, 4, P(4, 9));
  let o = A.ouvrables(st, P(5, 9)); check(o.jour === 5 && o.du === 5 && o.rattrapage.join() === '2,3', 'le 5 : la case du jour (5), deux oubliées à rattraper (2, 3)');
  let v = A.vue(st, P(5, 9)); check(v.pastille && v.ouvertes === 2 && v.cases[4].etat === 'du' && v.cases[1].etat === 'rattrapage' && v.cases[2].etat === 'rattrapage' && v.cases[0].etat === 'ouverte' && v.cases[5].etat === 'future' && v.cases[5].raison === 'future' && v.rattrapageLibre && v.restant === 27, 'la vue : la case du jour luit, les oubliées ont leur ruban, les ouvertes, les futures (raison « future ») ; la pastille ; encore 27 j');
  A.ouvrir(st, 2, P(5, 10)); v = A.vue(st, P(5, 10)); o = A.ouvrables(st, P(5, 10));
  check(!v.rattrapageLibre && v.cases[2].etat === 'fermee' && v.cases[2].raison === 'rattrapage' && !v.cases[2].ouvrable && o.rattrapage.length === 0 && o.du === 5 && v.pastille, 'la 2 rattrapée : le ruban disparaît des autres (la 3 « fermée », raison « rattrapage ») ; la case du jour reste');
  A.ouvrir(st, 5, P(5, 11)); v = A.vue(st, P(5, 11)); check(!v.pastille && v.du === 0 && v.ouvertes === 4 && v.friandises === 4, 'tout ouvert pour aujourd’hui : plus de pastille ; 4 friandises dans la boîte');
  v = A.vue(st, P(28, 9)); check(v.du === 0 && v.rattrapage.length === 20 && v.restant === 4 && v.cases.every((c) => c.etat !== 'du' && c.etat !== 'future'), 'le 28 : plus de case du jour, 20 oubliées, encore 4 j (28, 29, 30, 31)');
  v = A.vue(st, P(2, 9, 0, 1, 2027)); check(v && !v.actif && v.ouvertes === 4 && v.cases.every((c) => !c.ouvrable && (c.etat === 'ouverte' || c.etat === 'rangee')) && !v.pastille && !('avent' in {}) , 'le 2 janvier : rangé (la feuille lisible depuis Mes récompenses : 4/24), rien d’ouvrable'); }

console.log('── l’horloge du jeu qui se recale en arrière (HORLOGE (e)) : pas de case de plus ──');
{ // la sonde de la revue : le compteur monotone d'un iPhone 1,5 × trop rapide ; le jeu croit le 10 à 0 h 30 quand il est le 9 à 23 h (Paris)
  const H = require('../src/horloge.js'); let vrai = SA.parisMs(2026, 12, 9, 20), perfV = 0;
  const m = H.creer({ tel: () => vrai, perf: () => perfV, avanceMax: () => 8 * 3600e3 }); m.noterHeureSure(vrai, perfV, 'page'); m.demarrer();
  vrai += 3 * 3600e3; perfV += 4.5 * 3600e3;
  const st = {}; let now = m.maintenant(), sure = m.etat().sure; const r10 = A.ouvrir(st, 10, now, sure), r3 = A.ouvrir(st, 3, now, sure);
  check(A.jour(now, sure) === 10 && r10.ok && r3.ok && st.avent.j === '2026-12-10', `le jeu en avance (le 10 à 0 h 30 au lieu du 9 à 23 h) : la case 10 et un rattrapage ; j « ${st.avent.j} »`);
  m.noterHeureSure(vrai, perfV, 'page'); now = m.maintenant(); sure = m.etat().sure; // (une heure sûre fraîche : le jeu revient au 9)
  const r9 = A.ouvrir(st, 9, now, sure), o = A.ouvrables(st, now, sure), v = A.vue(st, now, sure);
  check(A.jour(now, sure) === 9 && !r9.ok && r9.raison === 'heure' && A.nOuvertes(st.avent) === 2, `revenu au 9 : la case 9 ne s’ouvre pas (« ${r9.raison} ») : 2 cases ce jour-là, pas 3`);
  check(o.recul === true && o.du === 0 && o.rattrapage.length === 0 && !v.pastille && v.attendHeure && !v.rattrapageLibre && v.cases[8].etat === 'fermee' && v.cases[8].raison === 'heure' && v.cases.every((c) => !c.ouvrable), 'ouvrables : rien (recul) ; la vue : aucune case ouvrable, la 9 « fermée » (raison « heure »), pas de pastille, l’écran attend l’heure');
  check(A.TEXTES.heure && /retrouvé l’heure/.test(A.TEXTES.heure), 'le refus se dit par le texte de l’heure sûre (TEXTES.heure)');
  vrai += 3600e3; perfV += 3600e3; m.noterHeureSure(vrai, perfV, 'page'); now = m.maintenant(); sure = m.etat().sure; // (le 10 à 0 h pour de vrai)
  const r10b = A.ouvrir(st, 10, now, sure), r9b = A.ouvrir(st, 9, now, sure), r1 = A.ouvrir(st, 1, now, sure);
  check(A.jour(now, sure) === 10 && r10b.raison === 'deja' && r9b.raison === 'rattrapage' && r1.raison === 'rattrapage' && st.avent.j === '2026-12-10' && A.ouvrir(st, 9, SA.parisMs(2026, 12, 11, 9)).ok, 'le vrai 10 décembre : la 10 déjà ouverte, le rattrapage du jour déjà pris (la 3, à 0 h 31) ; j reste le 10 ; le 11, la 9 se rattrape'); }
{ const st = {}; A.ouvrir(st, 12, P(12, 9)); A.ouvrir(st, 5, P(12, 9, 1));
  const r = [A.ouvrir(st, 11, P(11, 22)), A.ouvrir(st, 6, P(11, 22, 1)), A.ouvrir(st, 8, P(8, 9))];
  check(r[0].raison === 'heure' && r[1].raison === 'rattrapage' && r[2].raison === 'heure' && st.avent.j === '2026-12-12' && A.nOuvertes(st.avent) === 2, `une horloge revenue au 11, puis au 8 : rien ne s’ouvre (${r.map((x) => x.raison).join(', ')}), j ne baisse jamais (« ${st.avent.j} »)`);
  check(A.ouvrir(st, 13, P(13, 9)).ok && st.avent.j === '2026-12-13', 'le 13 : la case du jour, j monte');
  const sans = { avent: { v: 1, id: A.ID, o: 2 ** 9, r: '' } }; A.etat(sans, P(10, 9)); check(!('j' in sans.avent) && A.ouvrir(sans, 9, P(10, 9, 1)).ok && sans.avent.j === '2026-12-10', 'une sauvegarde sans j reste valide (rien n’est ajouté) ; j posé à la première ouverture');
  const abime = { avent: { v: 1, id: A.ID, o: 0, r: '', j: 7 } }; A.etat(abime, P(10, 9)); check(abime.avent.j === '2026-12-10' && A.ouvrir(abime, 9, P(9, 9)).raison === 'heure' && A.ouvrir(abime, 10, P(10, 10)).ok, 'j abîmé : le jour de maintenant (rien avant aujourd’hui ; la case du jour s’ouvre)'); }

console.log('── verser, possede, aVerser ──');
{ const t = P(6, 10), s = G.newState(t); s.now = t; const e0 = s.etoiles;
  const tout = []; for (let k = 1; k <= 24; k++) tout.push(A.lotDe(k));
  const f1 = A.verser(s, A.lotDe(1), G), f3 = A.verser(s, A.lotDe(3), G), f5 = A.verser(s, A.lotDe(5), G), f24 = A.verser(s, A.lotDe(24), G), f6 = A.verser(s, A.lotDe(6), G);
  check(f1.etoiles === 1 && s.etoiles === e0 + 1 + 2 + 1, `les étoiles versées (case 1 : 1 ★, case 24 : 2 ★, case 6 : 1 ★ ; ${s.etoiles - e0} en tout)`);
  check(f3.boost && s.boosts.reserve.some((b) => b.mult === 2 && b.secs === 1800), 'le boost de la case 3 (×2, 30 min) dans la réserve (lancé quand on veut)');
  check(f5.vetement === 'avent-bonnet' && G.garderobe(s).objets['avent-bonnet'] && f24.vetement === 'avent-chaussons' && f24.aura === 'flocons' && G.garderobe(s).auras.includes('flocons') && G.garderobe(s).aura === 'flocons', 'la pièce dans la garde-robe (le bonnet, les chaussons) ; l’aura des flocons gagnée et portée d’office');
  check(f6.compagnon === 'renne' && !f6.vetement && !f6.boost, 'le renne : rien à verser (il se lit sur le masque)');
  const st = { avent: { v: 1, id: A.ID, o: 0, r: '' } }; for (const k of [2, 6, 24]) st.avent.o += 2 ** (k - 1);
  check(A.possede(st, 'couronne-avent') && A.possede(st, 'renne') && A.possede(st, 'flocons') && A.possede(st, 'avent-chaussons') && !A.possede(st, 'chaussettes') && !A.possede(st, 'x') && !A.possede({}, 'renne') && !A.possede({ avent: 'x' }, 'renne'), 'possede : la couronne (case 2), le renne (6), l’aura et les chaussons (24) par le masque ; pas la case 8 ; rien sur un état absent ou abîmé');
  const r = G.COMPAGNONS.find((c) => c.id === 'renne');
  check(r && r.nom === 'Petit renne' && r.espece === 'renne' && r.prix === null && r.nomDefaut === 'Grelot' && r.cri === 'grelot' && r.gagne === 'Gagné au calendrier de l’Avent' && r.verrou === 'La case du 6 décembre' && JSON.stringify(r.bonus) === JSON.stringify(G.COMPAGNONS.find((c) => c.id === 'ecureuil').bonus) && r.condition(st) && !r.condition({}) && !r.condition({ avent: { v: 1, id: A.ID, o: 1, r: '' } }), 'COMPAGNONS.renne « Grelot » : gagné à la case du 6 (AVENT.possede), le bonus de l’écureuil, rien à acheter');
  check(G.aCompagnon(Object.assign(G.newState(t), { avent: st.avent }), 'renne') && !G.aCompagnon(G.newState(t), 'renne'), 'G.aCompagnon : le renne avec la case 6, pas sans');
  // aVerser : l'écran est tombé entre ouvrir et verser (les cases 5 et 24 ouvertes, la garde-robe sans leurs pièces)
  const s2 = G.newState(t); s2.now = t; s2.avent = { v: 1, id: A.ID, o: 2 ** 4 + 2 ** 23 + 2 ** 10, r: '' }; G.donnerVetement(s2, 'avent-echarpe');
  const l = A.aVerser(s2, G); check(l.map((x) => `${x.n}:${x.vetement || ''}:${x.aura || ''}`).join() === '5:avent-bonnet:,24:avent-chaussons:flocons', `aVerser : les cases ouvertes dont la pièce (ou l’aura) n’est pas dans la garde-robe (${l.map((x) => x.n).join(', ')}) ; l’écharpe (case 11) déjà là, ni étoiles ni boosts redonnés`);
  for (const x of l) A.verser(s2, x, G); check(A.aVerser(s2, G).length === 0 && G.garderobe(s2).objets['avent-bonnet'] && G.garderobe(s2).auras.includes('flocons') && s2.etoiles === G.newState(t).etoiles, 'versés : plus rien à rendre ; aucune étoile de plus'); }

console.log('── la garde-robe, la distinction, l’accueil, le carnet ──');
{ const O = G.GARDEROBE.objets, ids = ['avent-bonnet', 'avent-echarpe', 'avent-pull', 'avent-chaussons'], f = { 'avent-bonnet': ['tete', 'bonnet'], 'avent-echarpe': ['accessoire', 'foulard'], 'avent-pull': ['haut', 'sweat'], 'avent-chaussons': ['pieds', 'chaussures'] };
  check(ids.every((id) => O[id] && O[id].collection === 'avent' && O[id].piece === f[id][0] && O[id].forme === f[id][1] && O[id].rarete === 'rare' && !Object.keys(O[id].bonus).length) && Object.values(O).filter((v) => v.collection === 'avent').length === 4, 'la tenue de Noël : bonnet (tête), écharpe (accessoire), pull (haut), chaussons (pieds), collection avent, rares, SANS bonus');
  check(G.GARDEROBE.ensembles.avent && G.GARDEROBE.ensembles.avent.nom === 'Tenue de Noël' && !Object.keys(G.GARDEROBE.ensembles.avent.bonus).length, 'l’ensemble « Tenue de Noël » : sans bonus');
  const s = G.newState(P(24, 10)); s.now = P(24, 10); const m0 = G.garderobeMult ? JSON.stringify(G.bonusGardeRobe(s)) : ''; for (const id of ids) { G.donnerVetement(s, id); G.equiper(s, O[id].piece, id); }
  check(!G.garderobeMult || JSON.stringify(G.bonusGardeRobe(s)) === m0, 'portée en entier : aucun bonus de plus (les gains, la vitesse, l’absence inchangés)');
  check(G.AURAS.flocons && G.AURAS.flocons.nom === 'Aura des flocons' && G.AURAS.flocons.couleur === '#DCEBFA', 'AURAS.flocons « Aura des flocons » (#DCEBFA)');
  check(G.DISTINCTIONS['flocon-or-2026'] && G.DISTINCTIONS['flocon-or-2026'].nom === 'Flocon d’or 2026', 'DISTINCTIONS « Flocon d’or 2026 »');
  const CL = require('../src/classement.js'); check(CL.TITRES && CL.TITRES['flocon-or-2026'] === 'Flocon d’or 2026', 'TITRES « Flocon d’or 2026 » (le classement, à côté du pseudo)'); }
{ const d = G.ACCUEIL.deblocages.find((x) => x.id === 'avent'), s = G.newState(P(5, 9));
  const a = (o) => Object.assign(G.newState(o.t), { now: o.t, lifetime: o.l || 0 });
  check(d && d.bit === 16 && (G.ACCUEIL.TOUS & (1 << 16)) && G.ACCUEIL.deblocages.map((x) => x.bit).join() === Array.from({ length: 17 }, (x, k) => k).join(), 'le déblocage « avent » : le bit 16, dans TOUS');
  check(!d.seuil(a({ t: P(5, 9) }), { r: 0 }) && d.seuil(a({ t: P(5, 9) }), { r: 1 }) && d.seuil(a({ t: P(5, 9), l: 1e6 }), { r: 0 }), 'le 5 déc. : après « Ton premier jour » réussi, ou à 1 M€ (le seuil de la piste)');
  check(!d.seuil(a({ t: P(30, 20, 0, 11), l: 1e6 }), { r: 1 }) && d.seuil(a({ t: P(1, 0), l: 1e6 }), { r: 1 }) && !d.seuil(a({ t: P(1, 0, 0, 1, 2027), l: 1e6 }), { r: 1 }), 'et la fenêtre : 1 M€ passé le 30 nov., la bulle attend le 1er déc. ; plus rien à partir du 1er janvier');
  const v = G.accueilAncien(Object.assign(s, { tuto: 7, lifetime: 1e9 }), P(5, 9)); check(v.t === 1 && (v.d & (1 << 16)), 'une vieille sauvegarde (t : 1) : l’Avent tout de suite'); s.tuto = 0;
  check(JSON.stringify(Object.keys(G.newState(P(5, 9))).filter((k) => /avent/i.test(k))) === '[]', 'newState inchangé : ni st.avent ni st.aventAnnonce dans une partie neuve (créés au premier appel)'); }
{ const fam = (id) => CH.FAMILLES.find((f) => f.id === id), av = fam('avent'), hv = fam('piste-hiver'), ids = CH.FAMILLES.map((f) => f.id);
  check(av && av.nom === 'Le calendrier de l’Avent 2026' && av.posable && av.items.map((x) => x.id).join() === 'couronne-avent,chaussettes,village-noel,bonhomme-neige,boule-neige' && av.items.map((x) => x.place).join() === 'comptoir,rebord,comptoir,sol,comptoir', 'la famille avent du carnet : les cinq décos, leurs places (comptoir, rebord, comptoir, sol, comptoir)');
  check(hv && hv.nom === 'La saison d’hiver 2026' && hv.posable && hv.items.map((x) => x.id).join() === 'luge,lanterne-givre,guirlande-givre,traineau,cheminee,patins,trophee-hiver-2026' && hv.items.map((x) => x.place).join() === 'sol,comptoir,rebord,sol,mur,mur,comptoir', 'la famille piste-hiver : les six décos et le trophée, leurs places');
  check(ids.slice(-2).join() === 'avent,piste-hiver', 'les deux en dernier (le code des photos ne change pas pour les décos d’avant)');
  const st = { avent: { v: 1, id: A.ID, o: 2 ** 1 + 2 ** 14, r: '' } }, c = CH.carnet(st, {}), cav = c.find((f) => f.id === 'avent');
  check(cav.gagnes === 2 && cav.items.filter((x) => x.gagne).map((x) => x.id).join() === 'couronne-avent,bonhomme-neige' && c.find((f) => f.id === 'compagnons').items.some((x) => x.id === 'renne'), 'le carnet lit AVENT.possede (cases 2 et 15 : la couronne, le bonhomme de neige) ; le renne parmi les compagnons');
  const lien = CH.codeDecos([['village-noel', 'c2'], ['cheminee', 'm1'], ['bonhomme-neige', 's1']]), l2 = CH.decosDepuisCode(lien);
  check(lien.length === 9 && JSON.stringify(l2) === JSON.stringify([['village-noel', 'c2'], ['cheminee', 'm1'], ['bonhomme-neige', 's1']]), `le code des photos (champ dc) porte les décos de Noël (« ${lien} »)`); }

console.log('── la simulation des ouvertures ──');
{ // chaque jour joué : à la première minute, la case du jour et UNE oubliée (la plus ancienne) ; jours : les jours de la semaine joués (0 dimanche)
  const simuler = (jours, depuis) => { const st = {}, par = {}, le = {}; for (let d = 1; d <= 31; d++) { const t = P(d, 9); if (d < (depuis || 1)) continue; if (jours && !jours.includes(SA.paris(t).getUTCDay())) { le[d] = A.nOuvertes(st.avent); continue; } const o = A.ouvrables(st, t, t), l = []; if (o.du) l.push(o.du); if (o.rattrapage.length) l.push(o.rattrapage[0]); for (const k of l) if (A.ouvrir(st, k, t, t).ok) par[d] = (par[d] || 0) + 1; le[d] = A.nOuvertes(st.avent); } return { le24: le[24], le31: le[31], max: Math.max(0, ...Object.values(par)) }; };
  const occ = simuler([3, 5, 6, 0]), quo = simuler(null), n15 = simuler([3, 5, 6, 0], 15), q15 = simuler(null, 15);
  check(occ.le24 === 22 && occ.le31 === 24 && occ.max === 2, `l’occasionnel quatre jours sur sept (mer., ven., sam., dim.) : ${occ.le24} cases le 24, ${occ.le31} le 31 ; au plus ${occ.max} le même jour`);
  check(quo.le24 === 24 && quo.le31 === 24 && quo.max === 1, `le quotidien : ${quo.le24} le 24, une par jour`);
  check(n15.le31 === 14 && q15.le31 === 24 && n15.max === 2 && q15.max === 2, `un nouveau joueur du 15 décembre : ${n15.le31} cases le 31 en occasionnel (pas de rafale : une oubliée par jour), ${q15.le31} en quotidien`); }

console.log('── src/avent.js et la référence : les mêmes réponses sur 1 000 scénarios tirés ──');
{ let graine = 7; const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  let ecarts = 0, ops = 0, premier = '';
  for (let s = 0; s < 1000; s++) {
    const sa = {}, sb = {}; let t = P(28, 0, 0, 11) + Math.floor(hasard() * 10 * 864e5);
    const nOps = 3 + Math.floor(hasard() * 30);
    for (let k = 0; k < nOps; k++) {
      const pas = hasard(); t += pas < 0.15 ? -Math.floor(hasard() * 20 * 3600e3) : Math.floor(hasard() * (pas < 0.6 ? 6 : 40) * 3600e3); // (une horloge qui recule parfois)
      const qs = hasard(), sure = qs < 0.35 ? undefined : qs < 0.7 ? t : qs < 0.9 ? t - Math.floor(hasard() * 30 * 3600e3) : t + Math.floor(hasard() * 10 * 3600e3);
      const nn = hasard() < 0.6 ? Math.max(1, A.jour(t, sure) - Math.floor(hasard() * 4)) : 1 + Math.floor(hasard() * 26);
      if (hasard() < 0.03) { sa.avent = { v: 1, id: A.ID, o: sa.avent ? sa.avent.o : 0, r: 7 }; sb.avent = JSON.parse(JSON.stringify(sa.avent)); A.reparer(sa, t); REF.reparer(sb, t); } // (un r abîmé de temps en temps)
      const ra = A.ouvrir(sa, nn, t, sure), rb = REF.ouvrir(sb, nn, t, sure); ops++;
      const oa = A.ouvrables(sa, t, sure), ob = REF.ouvrables(sb, t, sure);
      const ja = JSON.stringify([ra, sa.avent, oa, A.jour(t, sure)]), jb = JSON.stringify([rb, sb.avent, ob, REF.jour(t, sure)]);
      if (ja !== jb) { ecarts++; if (!premier) premier = `scénario ${s}, op ${k} : ${ja} ≠ ${jb}`; }
    }
  }
  check(!ecarts, `${ops} ouvertures sur 1 000 scénarios (les cases, les jours, l’heure sûre en retard ou en avance, l’horloge qui recule, r abîmé) : mêmes résultats, même état, mêmes cases ouvrables${premier ? ' — ' + premier : ''}`); }

console.log('── la saison d’hiver lit l’Avent ──');
{ const H = require('../src/saison-hiver.js'), st = {}, t = P(3, 9);
  SA.pas(st, t); A.ouvrir(st, 3, t); A.ouvrir(st, 1, t + 1000); const o = SA.pas(st, t + 2000);
  check(H.lecteurs && o.sources.avent === 20 && SA.pas(st, t + 3000).xp === 0 && st.piste.j.a === 2, 'deux cases ouvertes le 3 : +20 XP de saison (10 la case), une fois ; « ouvertes aujourd’hui » : 2'); }

console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
process.exitCode = fails ? 1 : 0;
