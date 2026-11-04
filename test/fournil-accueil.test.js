#!/usr/bin/env node
// L'accueil des nouveaux joueurs (src/game.js, docs/accueil-contrat.md) : st.accueil et sa réparation, les vieilles sauvegardes (tout
// ouvert), les sept étapes de « Ton premier jour », les quinze déblocages, la récompense (une seule fois), la tenue d'apprenti, le rythme
// du joueur simulé (test/longevite.js) et l'entrée des nouveautés.
// Lancer : TZ=Europe/Paris node test/fournil-accueil.test.js
'use strict';
const G = require('../src/game.js'), NV = require('../src/nouveautes.js'), L = require('./longevite.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 7, 8, 0), A = G.ACCUEIL;
const neuf = () => G.newState(T0);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('── 1. newState et réparation ──');
check(eq(neuf().accueil, { v: 1, o: 0, r: 0, d: 0, t: 0 }), 'newState : accueil { v: 1, o: 0, r: 0, d: 0, t: 0 }');
{ const s = neuf(); s.accueil = null; const a = G.accueil(s); check(s.accueil === a && a.t === 0 && a.r === 0 && a.o === 0 && a.d === 0, 'accueil(st) répare null (une partie neuve : t 0)'); }
{ const s = neuf(); s.accueil = [1, 2]; const a = G.accueil(s); check(!Array.isArray(a) && a.v === 1 && a.t === 0, 'accueil(st) répare un tableau'); }
{ const s = neuf(); s.accueil = { o: 'x', d: -3, r: 'oui', t: 0 }; const a = G.accueil(s); check(eq(a, { o: 0, d: 0, r: 1, t: 0, v: 1 }) || (a.o === 0 && a.d === 0 && a.r === 1 && a.t === 0 && a.v === 1), 'accueil(st) répare { o: "x", d: -3 } : o 0, d 0'); }
{ const s = neuf(); s.accueil = { v: 1, o: 999, r: 0, d: 1 << 20, t: 0 }; const a = G.accueil(s); check(a.o === 0 && a.d === (1 << 20), 'o hors bornes → 0 ; un bit inconnu (version future) gardé'); }

// un accueil abîmé sur une partie avancée : en cas de doute, comme une sauvegarde d'avant l'accueil (tout ouvert, sans carte ni annonce)
const avancee = () => { const s = G.newState(T0 - 90 * 864e5); Object.assign(s, { tuto: 7, boutiques: 35, lifetime: 1e20, etoiles: 1e6, now: T0 }); return s; };
for (const [nom, abime] of [['{}', {}], ['{ o: "x", d: -3 }', { o: 'x', d: -3 }], ['{ t: 2 }', { v: 1, o: 0, r: 0, d: 0, t: 2 }], ['{ t: "0" }', { v: 1, o: 5, r: 0, d: 3, t: '0' }], ['{ o: 1.5 }', { v: 1, o: 1.5, r: 0, d: 0, t: 0 }]]) {
  const s = avancee(); s.accueil = abime; const a = G.accueil(s);
  check(a.t === 1 && a.r === 1 && a.o === A.TOUTES && a.d === A.TOUS && G.deblocagesDus(s).length === 0, `partie avancée, accueil ${nom} → t 1, tout ouvert, rien de dû`);
}
{ const s = avancee(); s.accueil = { v: 1, o: 0, r: 0, d: 0, t: 0 }; check(G.accueil(s).t === 0, 'un accueil valide (t 0) n’est pas touché, même sur une partie avancée'); }
{ const s = neuf(); s.accueil = { o: 'x', d: 1 << 3, r: 1, t: 0 }; const a = G.accueil(s); check(a.t === 0 && a.r === 1 && a.d === (1 << 3), 'partie neuve, accueil abîmé : t 0, la récompense et les bits lisibles gardés'); }
{ const s = neuf(); s.accueil = { o: 'x', t: 1 }; const a = G.accueil(s); check(a.t === 1 && a.d === A.TOUS, 'abîmé mais t 1 : reste tout ouvert'); }
{ const s = avancee(); delete s.now; s.accueil = {}; check(G.accueil(s, T0).t === 1, 'accueil(st, now) : l’heure donnée sert (lire passe l’horloge)'); }

console.log('── 2. vieilles sauvegardes ──');
const ancien = (f) => { const s = neuf(); f(s); delete s.accueil; return G.accueilAncien(s, T0 + 600e3); };
{ const a = ancien((s) => { s.tuto = 7; }); check(a.t === 1 && a.r === 1 && a.o === 127 && a.d === A.TOUS, 'tuto 7 → t 1, r 1, o 127, d TOUS'); }
check(ancien((s) => { s.boutiques = 2; }).t === 1, 'boutiques 2 → t 1');
check(ancien((s) => { s.lifetime = 1e5; }).t === 1, 'lifetime 100 000 → t 1');
check(ancien((s) => { s.etoiles = 1; }).t === 1, 'une étoile → t 1');
check(ancien((s) => { s.created = T0 - 2 * 864e5; }).t === 1, 'créée il y a 2 jours → t 1');
check(ancien((s) => { delete s.created; }).t === 1, 'sans date de création → t 1 (dans le doute, tout ouvert)');
check(ancien((s) => { s.arriere = { trouvee: true }; }).t === 1, 'la petite porte déjà trouvée → t 1');
{ const a = ancien((s) => { s.tuto = 2; s.lifetime = 300; s.coins = 120; s.stations[1].niv = 1; s.stations[2].niv = 1; s.stats.meubles = 1; });
  check(a.t === 0 && a.r === 0 && a.d === 0 && a.o === ((1 << 0) | (1 << 4)), `une partie de 10 min (tuto 2, 300 €) → t 0, d 0, o = étapes faites (${a.o})`); }

{ const a = ancien((s) => { s.created = T0 - 2 * 3600e3; s.tuto = 3; s.lifetime = 9e4; s.stations[0].niv = 30; s.stations[1].niv = 12; });
  const ouverts = A.deblocages.filter((x) => a.d & (1 << x.bit)).map((x) => x.id);
  check(a.t === 0 && ['modes', 'bonus'].every((x) => ouverts.includes(x)) && !ouverts.includes('defis') && !ouverts.includes('classement'), `une partie de 2 h d'avant l'accueil (tuto 3, 90 000 €, Journal à 100 000 €) : ce qui est atteint s'ouvre en silence (${ouverts.join()})`);
  const s = neuf(); Object.assign(s, { created: T0 - 2 * 3600e3, tuto: 4, lifetime: 9e4 }); s.stations[0].niv = 30; s.stations[1].niv = 12; s.accueil = a;
  const dus = G.deblocagesDus(s); check(!['modes', 'bonus'].some((x) => dus.includes(x)), `fin des premiers pas : ces boutons ne sont pas réannoncés (dus : ${dus.join()})`); }
console.log('── 3. les étapes ──');
check(A.etapes.length === 7 && A.etapes.map((e) => e.id).join() === 'painchoc,baguette25,mystere,evenement,meuble,bonus,objectifs', 'sept étapes, dans l’ordre du contrat');
{ const faits = [(s) => { s.stations[2].niv = 1; }, (s) => { s.stations[0].niv = 25; }, (s) => { s.stats.pourboires = 1; }, (s) => { s.stats.critiques = 1; }, (s) => { s.stats.meubles = 1; }, (s) => { s.ameliorations.farine = true; }, (s) => { s.stats.serieMax = 1; }];
  let ok = true; faits.forEach((f, k) => { const s = neuf(); if (A.etapes[k].fait(s)) ok = false; f(s); if (!A.etapes[k].fait(s)) ok = false; A.etapes.forEach((e, j) => { if (j !== k && e.fait(s)) ok = false; }); });
  check(ok, 'chaque fait(st) : faux sur une partie neuve, vrai sur l’état fabriqué, et seulement celle-là');
  const s = neuf(); s.tuto = 4; faits.slice(0, 3).forEach((f) => f(s));
  const p1 = G.accueilPas(s); check(eq(p1.nouvelles, [0, 1, 2]) && !p1.toutes && s.accueil.o === 7, 'accueilPas : trois nouvelles étapes');
  const p2 = G.accueilPas(s); check(p2.nouvelles.length === 0 && s.accueil.o === 7, 'accueilPas : rien de nouveau au passage suivant');
  s.stations = s.stations.map(() => ({ niv: 0, staff: false, prog: 0, actif: false })); s.stations[0].niv = 1; // une boutique neuve
  const p3 = G.accueilPas(s); check(p3.nouvelles.length === 0 && s.accueil.o === 7, 'une boutique neuve qui remet les recettes à zéro ne retire aucun bit');
  faits.slice(3).forEach((f) => f(s)); const p4 = G.accueilPas(s); check(eq(p4.nouvelles, [3, 4, 5, 6]) && p4.toutes && s.accueil.o === 127, 'les sept faites : toutes'); }
{ const s = neuf(); s.accueil.t = 1; s.stations[2].niv = 1; const p = G.accueilPas(s); check(p.toutes && !p.nouvelles.length, 't 1 : accueilPas ne calcule rien'); }

console.log('── 4. les déblocages ──');
const ids = A.deblocages.map((d) => d.id), bits = A.deblocages.map((d) => d.bit);
check(ids.join() === 'boulanger,defis,modes,bonus,etoiles,journal,saison,classement,atelier,decos,evenements,garderobe,nouveautes,casino,chaine', 'quinze déblocages, dans l’ordre du contrat');
check(new Set(bits).size === bits.length && bits.every((b, k) => b === k) && A.TOUS === (1 << 15) - 1 && bits.every((b) => A.TOUS & (1 << b)), 'des bits uniques ; TOUS les couvre tous');
{ const s = neuf(); s.lifetime = 1e9; s.boutiques = 3; s.etoiles = 5; s.xp = 1e6; s.stations[0].niv = 10;
  for (const t of [0, 1, 2, 3]) { s.tuto = t; if (G.deblocagesDus(s).length) check(false, `tuto ${t} : rien ne s'ouvre`); }
  check(G.deblocagesDus(s).length === 0, 'deblocagesDus vide tant que tuto < 4');
  s.tuto = 4; const d = G.deblocagesDus(s, { chaine: 1 }); check(d.join() === ids.filter((x) => x !== 'garderobe').join(), `tuto 4 : tout ce qui est atteint, dans l’ordre (${d.join()})`);
  check(G.marquerDeblocage(s, 'atelier') && !G.marquerDeblocage(s, 'atelier') && !G.deblocagesDus(s).includes('atelier') && G.accueilOuvert(s, 'atelier') && !G.accueilOuvert(s, 'classement'), 'marquerDeblocage pose le bit une fois ; accueilOuvert le lit');
  s.accueil.t = 1; check(G.deblocagesDus(s).length === 0 && G.accueilOuvert(s, 'classement'), 't 1 : rien de dû, tout ouvert'); }
{ const s = neuf(); s.tuto = 4; check(G.deblocagesDus(s).join() === 'defis', 'premiers pas finis : seulement les Défis');
  s.lifetime = 6000; s.stations[0].niv = 10; check(G.deblocagesDus(s).join() === 'defis,modes,bonus', 'une recette au niveau 10 et 6 000 € : ×10/×100 et Bonus');
  s.lifetime = 2.5e5; check(['journal', 'saison', 'classement'].every((x) => G.deblocagesDus(s).includes(x)) && !G.deblocagesDus(s).includes('atelier'), '250 000 € : le Journal, la saison, le classement ; pas encore l’Atelier');
  check(!G.deblocagesDus(s).includes('chaine') && G.deblocagesDus(s, { chaine: 2 }).includes('chaine'), 'Ma chaîne : seulement avec une boutique de la chaîne (o.chaine) ou la boutique n°2');
  s.lifetime = 1e8; check(!G.deblocagesDus(s).includes('casino') && !G.deblocagesDus(s).includes('nouveautes'), '100 M€ sans la récompense : ni casino ni nouveautés');
  s.accueil.r = 1; check(G.deblocagesDus(s).includes('casino') && G.deblocagesDus(s).includes('nouveautes'), 'avec la récompense : le casino et les nouveautés'); }

console.log('── 5. la récompense ──');
{ const s = neuf(); s.tuto = 5;
  check(!G.recompenseAccueil(s).ok && s.accueil.r === 0, 'refusée avant 7/7');
  s.stations[2].niv = 1; s.stations[0].niv = 25; s.stats.pourboires = 1; s.stats.pannes = 1; s.stats.meubles = 1; s.ameliorations.farine = true; s.stats.serieMax = 1;
  const avant = s.boosts.reserve.length, r = G.recompenseAccueil(s);
  check(r.ok && s.accueil.r === 1 && r.vetements.map((v) => v.id).join() === 'apprenti-tablier,apprenti-foulard', 'donnée : r 1, les deux pièces');
  check(G.possede(s, 'apprenti-tablier') && G.possede(s, 'apprenti-foulard') && s.garderobe.equipe.haut === 'apprenti-tablier' && s.garderobe.equipe.accessoire === 'apprenti-foulard', 'possédées et portées d’office');
  const res = s.boosts.reserve; check(res.length === avant + 1 && res[res.length - 1].mult === 2 && res[res.length - 1].secs === 1800 && eq(r.boost, { mult: 2, secs: 1800 }), 'la réserve gagne { mult: 2, secs: 1800 }');
  check(s.stats.vetements === 2 && /Premier jour réussi/.test(s.carnetEv[s.carnetEv.length - 1].txt), 'compté (stats.vetements) et noté au journal');
  const r2 = G.recompenseAccueil(s); check(!r2.ok && s.boosts.reserve.length === avant + 1 && s.stats.vetements === 2, 'un second appel : { ok: false }, rien de plus'); }
{ const s = neuf(); s.accueil = { v: 1, o: 127, r: 0, d: 0, t: 1 }; check(!G.recompenseAccueil(s).ok && !G.possede(s, 'apprenti-tablier'), 'refusée si t 1'); }

console.log('── 6. la tenue d’apprenti ──');
{ const t = G.GARDEROBE.objets['apprenti-tablier'], f = G.GARDEROBE.objets['apprenti-foulard'];
  check(t && f && t.piece === 'haut' && t.forme === 'tablier' && f.piece === 'accessoire' && f.forme === 'foulard' && t.collection === 'apprenti' && f.collection === 'apprenti' && !Object.keys(t.bonus).length && !Object.keys(f.bonus).length && t.rarete === 'rare', 'deux pièces, formes tablier / foulard, collection apprenti, sans bonus, rares');
  check(!G.GARDEROBE.ensembles.apprenti, 'pas d’ensemble apprenti');
  const s = neuf(), b0 = JSON.stringify(G.bonusGardeRobe(s)); G.donnerVetement(s, 'apprenti-tablier'); G.donnerVetement(s, 'apprenti-foulard'); G.equiperCollection(s, 'apprenti');
  check(JSON.stringify(G.bonusGardeRobe(s)) === b0, 'bonusGardeRobe inchangé en les portant');
  check(!G.possede(neuf(), 'apprenti-tablier') && Object.keys(neuf().garderobe.objets).length === 4, 'pas possédées au départ (les 4 pièces de base seules)'); }

console.log('── 7. le rythme du joueur simulé ──');
for (const nom of Object.keys(L.PROFILS)) {
  let quand = null;
  L.simuler(nom, 1, { t0: L.DEPARTS['5 oct.'], chaqueSeconde: (st, now) => { if (quand != null) return; st.tuto = Math.max(st.tuto, 4); if (G.accueilPas(st).toutes) quand = (now - L.DEPARTS['5 oct.']) / 3600e3; } });
  check(quand != null && quand < 24, `${nom} : les sept étapes le premier jour (${quand == null ? 'jamais' : quand.toFixed(1) + ' h'})`);
}

console.log('── 8. les nouveautés ──');
{ const l = NV.NOUVEAUTES; check(l[0].id === '2026-11-04-a' && l[0].date === '2026-11-04' && /accueil/i.test(l[0].titre), 'l’entrée 2026-11-04-a en tête');
  check(new Set(l.map((x) => x.id)).size === l.length && l.every((x, k) => k === 0 || l[k - 1].id > x.id), 'ids uniques et triés'); }

console.log(fails ? `${fails} échec(s) sur ${n}` : `Tout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
