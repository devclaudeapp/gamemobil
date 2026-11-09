#!/usr/bin/env node
// La saison gratuite « Automne » (src/saison.js, le moteur ; src/saison-automne.js, sa fiche ; docs/marche-contrat.md § 7, 10.2) :
// la saison active à ses bornes (13 nov. 2026 à midi → 30 nov. 23 h 59 59), l'XP par constat (chaque source et son plafond, le défi une
// fois par semaine, la série d'aujourd'hui et d'hier, ou celle du classement, les paliers du Marché, l'arrière-salle ; deux pas : rien de
// plus), st.piste créée seulement pendant une saison, remise d'aplomb (null, [], { xp: 'x', recus: -1, j: 3 }…) sans rien compter deux
// fois, recevoir une fois par cran et le lot exact (§ 7.3), le titre à 1 240 XP, verser dans la boulangerie (étoiles, boosts, vêtements
// sans bonus, le titre), possede (le carnet), la fin (les crans dus donnés d'office, l'archive) ; le déblocage « piste » de l'accueil ;
// puis la piste simulée sur ce moteur (test/fournil-saison-sim.js : quotidien finie du 25 au 27 nov. (45 XP le cran, choix du joueur du 5 nov.), occasionnel quatre jours sur sept
// de 40 à 65 %, très actif avant le 26) et la longévité (aucun effet notable sur le rythme des boutiques ; les garde-fous de test/longevite.js).
// Puis la saison d'hiver (src/saison-hiver.js, docs/noel-contrat.md § 3, § 12.2), chargée après : la fiche et ses 46 crans, le masque au-delà
// de 32 bits (une piste d'automne lue à l'identique, 2⁴⁶ − 1, 2⁵⁰ refusé), les lecteurs (l'Avent : 10 XP la case, une fois), active aux bornes,
// l'enchaînement automne → hiver (les dus d'automne, l'hiver ouvert au même pas, le défi du 30 nov. pas recompté, la feuille de fin d'abord),
// le recul d'horloge, la fin de l'hiver ; la piste simulée (quotidien finie du 30 déc. au 1er janv., occasionnel de 50 à 70 %, très actif
// avant le 26) et la longévité sur 4 graines moyennées (FOURNIL_SAISON_GRAINES ; § 8.3 : le coup de pouce de l'occasionnel du 1er déc. gardé).
// Lancer : TZ=Europe/Paris node test/fournil-saison.test.js
'use strict';
const SA = require('../src/saison.js'), AU = require('../src/saison-automne.js'), G = require('../src/game.js'), MC = require('../src/marche.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const P = (j, h, mn = 0, s = 0) => Date.parse(`2026-${j >= 100 ? '12-' + String(j - 100).padStart(2, '0') : '11-' + String(j).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}+01:00`); // novembre (j) ou décembre (100 + j) 2026, heure de Paris
const dk = SA.dayKey;
// un état de jeu minimal : ce que lit le moteur des saisons
function partie(now, o) {
  o = o || {};
  return { jour: { date: dk(now), objectifs: [0, 1, 2].map((k) => ({ reclame: k < (o.obj || 0), fait: k < (o.obj || 0) })), etoileDonnee: !!o.etoile },
    semaine: { key: o.sem || '2026-11-09', reclame: !!o.defi }, marche: o.paliers ? { paliers: o.paliers } : undefined,
    arriere: o.casino != null ? { casino: { jour: dk(now), objectifs: [0, 1, 2].map((k) => ({ fait: k < o.casino })) } } : undefined };
}

console.log('── la fiche et la saison active ──');
check(AU.id === 'automne-2026' && SA.fiche('automne-2026') === AU && AU.debut === P(13, 12) && AU.fin === P(101, 0) && AU.crans.length === 22 && AU.xpCran === 45 && AU.titre.xp === 250 && AU.xpTitre === 1240 && AU.titre.distinction === 'feuille-or-2026', 'la saison d’automne : du 13 nov. midi au 1er déc. 0 h, 22 crans de 45 XP, le titre « Feuille d’or 2026 » à 1 240 XP');
check(!SA.active(P(13, 11, 59, 59)) && SA.active(P(13, 12)) === AU && SA.active(P(30, 23, 59, 59)) === AU && !SA.active(P(101, 0)), 'active : rien le 13 à 11:59:59, l’automne à 12:00 et jusqu’au 30 à 23:59:59, rien le 1er décembre à 0 h (l’hiver n’existe pas encore)');
check(MC.DEBUT === AU.debut && JSON.stringify(AU.evenements) === '["marche"]', 'elle s’ouvre avec le Marché d’automne, dont les paliers comptent (st.marche)');
check(JSON.stringify(Object.fromEntries(Object.entries(SA.SOURCES).map(([k, v]) => [k, [v.xp, v.parJour || v.parSemaine || null]]))) === JSON.stringify({ objectif: [5, 3], journee: [10, 1], defi: [75, 1], serie: [10, 1], palier: [20, null], casino: [5, 3] }), 'les sources du contrat (§ 7.2) : objectif 5 (3/j), journée 10, défi 75 (1/semaine), série 10, palier 20 (sans plafond), arrière-salle 5 (3/j)');
{ let err = ''; try { SA.ajouter({ id: 'x', debut: P(20, 0), fin: P(25, 0), crans: [{}], xpCran: 1 }); } catch (e) { err = e.message; } check(/chevauchent/.test(err), 'deux saisons ne se chevauchent jamais (ajouter refuse)'); }

console.log('── st.piste : créée seulement pendant la saison ──');
{ const st = partie(P(13, 9)); check(SA.etat(st, P(13, 9)) === null && !('piste' in st) && SA.pas(st, P(13, 9)).xp === 0, 'le 13 à 9 h : rien n’est créé (pas de saison)');
  const st2 = partie(P(102, 10)); check(SA.etat(st2, P(102, 10)) === null && !('piste' in st2) && SA.aRecevoir(st2).length === 0, 'une vieille sauvegarde rouverte le 2 décembre sans st.piste : rien à recevoir (elle n’a pas joué la saison)');
  const st3 = partie(P(13, 12, 30), { obj: 2, defi: true, paliers: [1] }), o = SA.pas(st3, P(13, 12, 30));
  check(st3.piste && st3.piste.v === 1 && st3.piste.id === 'automne-2026' && o.xp === 2 * 5 + 75 + 20 && st3.piste.xp === 105, `créée au premier pas pendant la saison ; ce qui est déjà réclamé compte (deux objectifs, le défi de la semaine, le 1er palier : ${o.xp} XP)`);
  check(SA.pas(st3, P(13, 12, 31)).xp === 0 && st3.piste.xp === 105, 'un deuxième pas : rien de plus (par constat, jamais deux fois)'); }

console.log('── l’XP : chaque source et son plafond ──');
{ const t = P(14, 10), st = partie(t); SA.pas(st, t);
  st.jour.objectifs.forEach((x) => { x.reclame = true; }); let o = SA.pas(st, t + 1000);
  check(o.sources.objectif === 15 && !o.sources.journee, 'trois objectifs réclamés : 15 XP (3 au plus par jour)');
  st.jour.objectifs.push({ reclame: true }); o = SA.pas(st, t + 2000); check(!o.xp, 'un quatrième (un objectif retiré puis réclamé) : rien, le plafond est fait');
  st.jour.etoileDonnee = true; o = SA.pas(st, t + 3000); check(o.sources.journee === 10 && SA.pas(st, t + 4000).xp === 0, 'la journée complète : 10 XP, une fois');
  st.arriere = { casino: { jour: dk(t), objectifs: [{ fait: true }, { fait: true }, { fait: false }] } }; o = SA.pas(st, t + 5000);
  st.arriere.casino.objectifs[2].fait = true; const o2 = SA.pas(st, t + 6000);
  check(o.sources.casino === 10 && o2.sources.casino === 5 && SA.pas(st, t + 7000).xp === 0, 'l’arrière-salle : 5 XP par mini-objectif réussi, 3 par jour');
  st.semaine.reclame = true; o = SA.pas(st, t + 8000); check(o.sources.defi === 75, 'le défi de la semaine : 75 XP');
  o = SA.pas(st, P(15, 10)); st.jour = partie(P(15, 10)).jour; check(!SA.pas(st, P(15, 10, 1)).sources.defi, 'le lendemain, la même semaine : rien de plus pour le défi');
  st.semaine = { key: '2026-11-16', reclame: true }; o = SA.pas(st, P(16, 9)); check(o.sources.defi === 75, 'la semaine suivante, réclamé : 75 XP de nouveau (une fois par semaine)');
  st.marche = { paliers: [1, 2, 3, 3, 99, 'x'] }; o = SA.pas(st, P(16, 9, 1)); check(o.sources.palier === 80, `les paliers du Marché reçus : 20 XP chacun, sans plafond (1, 2, 3, et 99 est hors de la fiche du moteur mais sans doublon : ${o.sources.palier})`);
  st.marche.paliers.push(4); o = SA.pas(st, P(16, 9, 2)); check(o.sources.palier === 20 && SA.pas(st, P(16, 9, 3)).xp === 0, 'un palier de plus : 20 XP, une fois'); }
{ // la série : sans classement, un objectif réclamé aujourd'hui et hier ; avec, le classement le dit
  const st = partie(P(14, 9), { obj: 1 }); SA.pas(st, P(14, 9));
  const a = SA.pas(Object.assign(st, partie(P(15, 9), { obj: 1 }), { piste: st.piste }), P(15, 9));
  check(a.sources.serie === 10 && SA.pas(st, P(15, 9, 1)).xp === 0, 'série locale : un objectif réclamé hier et aujourd’hui : 10 XP, une fois par jour');
  Object.assign(st, partie(P(17, 9), { obj: 1 })); const b = SA.pas(st, P(17, 9));
  check(!b.sources.serie && b.sources.objectif === 5, 'un jour sauté (le 16) : pas de série le 17');
  const st2 = partie(P(14, 9)); SA.pas(st2, P(14, 9)); const c = SA.pas(st2, P(14, 9, 1), { serie: { jours: 4, aujourdhui: true } });
  check(c.sources.serie === 10 && !SA.pas(st2, P(14, 9, 2), { serie: { jours: 5, aujourdhui: true } }).xp, 'série du classement (resume().serie : 4 jours, aujourd’hui compté) : 10 XP, même sans objectif ; une fois par jour');
  const st3 = partie(P(14, 9), { obj: 1 }); st3.piste = undefined; SA.pas(st3, P(14, 9));
  check(!SA.pas(Object.assign(st3, { jour: partie(P(15, 9), { obj: 1 }).jour }), P(15, 9), { serie: { jours: 1, aujourdhui: true } }).sources.serie, 'le classement dit 1 jour (la série repart) : pas de série, même si la série locale dirait oui'); }
{ const st = partie(P(101, 9), { obj: 3, etoile: true, defi: true }); st.piste = { v: 1, id: 'automne-2026', xp: 100, recus: 0, titre: 0, j: { d: dk(P(30, 9)), o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '', ev: { marche: 0 }, passees: {} };
  const o = SA.pas(st, P(101, 9)); check(o.xp === 0 && st.piste.id === '' && st.piste.passees['automne-2026'].xp === 100, 'après la fin : plus rien ne compte (la saison est archivée)'); }

console.log('── la réparation (jamais d’exception, rien compté deux fois) ──');
for (const mauvais of [null, [], 3, 'x', { xp: 'x', recus: -1, j: 3 }, { id: 'automne-2026', xp: -5, recus: 1.5, j: { d: 'hier', o: 'x' }, ev: [], sem: 4, veille: {}, passees: [] }]) {
  const t = P(18, 10), st = partie(t, { obj: 2, defi: true, paliers: [1, 2] }); st.piste = JSON.parse(JSON.stringify(mauvais)); let ok = true, o = null;
  try { SA.etat(st, t); o = SA.pas(st, t); } catch (e) { ok = false; }
  const p = st.piste;
  check(ok && p && p.v === 1 && p.id === 'automne-2026' && Number.isFinite(p.xp) && p.xp >= 0 && Number.isInteger(p.recus) && p.recus >= 0 && p.j && p.j.d === dk(t) && typeof p.sem === 'string' && typeof p.passees === 'object' && !Array.isArray(p.passees) && o && o.sources.objectif === undefined && o.sources.defi === undefined,
    `st.piste = ${JSON.stringify(mauvais)} : remise d’aplomb (xp ${p && p.xp}, recus ${p && p.recus}) ; les objectifs et le défi déjà là ne sont pas recomptés (${JSON.stringify(o && o.sources)})`);
}
{ const t = P(18, 10), st = partie(t); st.piste = { v: 1, id: 'automne-2026', xp: 333, recus: (1 << 3) | (1 << 25), titre: 1, j: { d: dk(t), o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '2026-11-17', ev: { marche: 2 }, passees: { 'x-2025': { xp: 10, crans: 99, titre: 'oui' }, bad: 3 } };
  SA.etat(st, t); check(st.piste.xp === 333 && st.piste.recus === ((1 << 3) | (1 << 25)) && st.piste.titre === 1 && st.piste.ev.marche === 2 && JSON.stringify(st.piste.passees) === JSON.stringify({ 'x-2025': { xp: 10, crans: 50, titre: 1 } }), 'une piste saine se relit telle quelle (les bits au-delà des crans gardés) ; les saisons passées remises d’aplomb une à une'); }

console.log('── recevoir, le lot exact, le titre ──');
const LOTS = { 1: { boost: [2, 1800] }, 2: { etoiles: 1 }, 3: { deco: 'couronne-feuilles' }, 4: { etoiles: 1 }, 5: { vetement: 'automne-gavroche' }, 6: { etoiles: 1 }, 7: { deco: 'guirlande-feuilles' }, 8: { etoiles: 1 }, 9: { vetement: 'automne-echarpe' },
  10: { etoiles: 1, boost: [2, 1800] }, 11: { etoiles: 1 }, 12: { etoiles: 1 }, 13: { vetement: 'automne-pull' }, 14: { etoiles: 2 }, 15: { deco: 'lanterne-automne' }, 16: { etoiles: 1 }, 17: { vetement: 'automne-bottines' }, 18: { etoiles: 2 },
  19: { deco: 'epouvantail' }, 20: { boost: [3, 1800] }, 21: { etoiles: 2 }, 22: { deco: 'trophee-automne-2026', trophee: 'trophee-automne-2026', etoiles: 2 } };
check(AU.crans.every((c, k) => { const a = LOTS[k + 1]; return c.n === k + 1 && (c.etoiles || undefined) === a.etoiles && JSON.stringify(c.boost ? [c.boost.mult, c.boost.secs] : undefined) === JSON.stringify(a.boost) && c.deco === a.deco && c.vetement === a.vetement && c.trophee === a.trophee && !c.prime; }), 'les 22 crans du contrat (§ 7.3), aucune heure de gains');
check(AU.crans.reduce((s, c) => s + (c.etoiles || 0), 0) === 16 && AU.crans.filter((c) => c.boost).length === 3 && AU.crans.filter((c) => c.deco).length === 5 && AU.crans.filter((c) => c.trophee).length === 1 && AU.crans.filter((c) => c.vetement).length === 4, '16 étoiles, 3 boosts, 5 décos (dont le trophée de fin de saison, au 22e), la tenue de saison en 4 pièces');
{ const t = P(20, 10), st = partie(t); SA.pas(st, t); st.piste.xp = 314;
  check(SA.crans(st) === 6 && SA.aRecevoir(st).join() === '1,2,3,4,5,6' && SA.recevoir(st, 7) === null, '314 XP : six crans atteints, à recevoir ; le 7e pas encore');
  const l1 = SA.recevoir(st, 1), l1b = SA.recevoir(st, 1);
  check(l1 && l1.n === 1 && l1.boost.mult === 2 && l1.boost.secs === 1800 && l1b === null && SA.aRecevoir(st).join() === '2,3,4,5,6' && st.piste.recus === 1, 'recevoir le cran 1 : son lot (boost ×2 30 min), une fois ; il n’est plus à recevoir');
  const s = G.newState(t); s.now = t; const e0 = s.etoiles;
  const lots = SA.toutRecevoir(st); for (const l of lots) SA.verser(s, l, G);
  check(lots.map((l) => l.n).join() === '2,3,4,5,6' && s.etoiles === e0 + 3 && G.garderobe(s).objets['automne-gavroche'] && SA.possede(st, 'couronne-feuilles') && !SA.possede(st, 'guirlande-feuilles') && SA.aRecevoir(st).length === 0, '« Tout recevoir » : 2 à 6 versés (3 étoiles, la casquette de tweed dans la garde-robe, la couronne de feuilles possédée)');
  const b = SA.verser(s, AU.crans[19], G); check(b.boost && s.boosts.reserve.some((x) => x.mult === 3 && x.secs === 1800), 'un boost de la piste va dans la réserve (lancé quand on veut)');
  st.piste.xp = 1239; const r = SA.aRecevoir(st); check(SA.crans(st) === 22 && !r.includes(23) && !SA.titre(st).atteint && SA.titre(st).reste === 1, '1 239 XP : les 22 crans, pas encore le titre (encore 1 XP)');
  st.piste.xp = 1240; check(SA.aRecevoir(st).includes(23) && SA.titre(st).atteint && !SA.titre(st).recu, '1 240 XP : le titre est à recevoir (n = 23)');
  const lt = SA.recevoir(st, 23); SA.verser(s, lt, G);
  check(lt && lt.titre && lt.distinction === 'feuille-or-2026' && SA.recevoir(st, 23) === null && st.piste.titre === 1 && G.distinctions(s).includes('feuille-or-2026') && SA.possede(st, 'feuille-or-2026'), 'reçu : la distinction « Feuille d’or 2026 » (au classement, à côté du pseudo), une fois');
  const v = SA.vue(st, t); check(v && v.cran === 22 && v.crans === 22 && v.piste.length === 22 && v.piste[0].etat === 'recu' && v.piste[6].etat === 'aRecevoir' && v.titre.recu && v.resteMs === AU.fin - t, 'la vue de l’écran : cran 22/22, chaque cran son état (reçu, à recevoir), le titre, ce qu’il reste de temps'); }
{ const t = P(21, 10), st = partie(t, { obj: 1 }); SA.pas(st, t); const r = SA.restes(st, t);
  check(r.length === 6 && r.find((x) => x.id === 'objectif').reste === 2 && r.find((x) => x.id === 'palier').max === null && r.find((x) => x.id === 'defi').parSemaine, '« D’où vient l’XP » : les six sources, ce qu’il reste à prendre aujourd’hui'); }

console.log('── la fin de la saison ──');
{ const t = P(25, 10), st = partie(t); SA.pas(st, t); st.piste.xp = 560; SA.recevoir(st, 1); SA.recevoir(st, 2);
  const o = SA.pas(st, P(101, 0, 0, 1)), d = SA.finDue(st);
  check(st.piste.id === '' && st.piste.passees['automne-2026'] && st.piste.passees['automne-2026'].crans === 12 && st.piste.passees['automne-2026'].xp === 560 && st.piste.passees['automne-2026'].titre === 0, 'le 1er décembre à 0 h : la saison archivée ({ xp 560, crans 12, titre 0 }), la piste repart sans saison (id « »)');
  check(o.fin && d && d.id === 'automne-2026' && d.lots.map((l) => l.n).join() === '3,4,5,6,7,8,9,10,11,12', 'les crans atteints et pas reçus (3 à 12) sont donnés d’office : leur lot attend l’écran (finDue), qui les distribue et montre la feuille');
  check(SA.recevoirFin(st) === d && SA.finDue(st) === null && SA.pas(st, P(101, 1)).fin === null, 'recevoirFin : la feuille montrée une fois');
  check(SA.possede(st, 'automne-bottines') === false && SA.possede(st, 'automne-gavroche') && SA.possede(st, 'couronne-feuilles'), 'le carnet lit l’archive : la casquette (cran 5) et la couronne (cran 3) à vie ; pas les bottines (cran 17, jamais atteint)'); }
{ // une horloge reculée après la fin (src/horloge.js, le recul : 1er déc. 0:00:30 → 30 nov. 23:54) : la saison finie ne se rouvre pas, l'archive reste
  const t = P(30, 20), st = partie(t, { obj: 3, etoile: true, defi: true, paliers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }); SA.pas(st, t); st.piste.xp = 1400; SA.toutRecevoir(st);
  const ids = ['couronne-feuilles', 'guirlande-feuilles', 'lanterne-automne', 'epouvantail', 'trophee-automne-2026', 'automne-bottines', 'feuille-or-2026'];
  const avant = ids.every((i) => SA.possede(st, i)); SA.pas(st, P(101, 0, 0, 30)); SA.recevoirFin(st);
  const o = SA.pas(st, P(30, 23, 54));
  check(avant && st.piste.id === '' && o.xp === 0 && SA.aRecevoir(st).length === 0 && st.piste.xp === 0, 'un recul de 6 min après la fin (30 nov. 23:54) : la saison d’automne ne se rouvre pas (aucune XP recomptée, rien à recevoir de nouveau)');
  SA.pas(st, P(101, 0, 0, 10));
  check(JSON.stringify(st.piste.passees['automne-2026']) === JSON.stringify({ xp: 1400, crans: 22, titre: 1 }) && SA.finDue(st) === null && ids.every((i) => SA.possede(st, i)), 'minuit de nouveau : l’archive intacte ({ xp 1400, crans 22, titre 1 }), aucune feuille de fin de plus, les décos, le trophée, la tenue et le titre toujours au carnet');
  const st2 = partie(P(30, 20)); st2.piste = { v: 1, id: 'automne-2026', xp: 120, recus: 0, titre: 0, j: { d: '', o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '', ev: { marche: 0 }, passees: { 'automne-2026': { xp: 1400, crans: 22, titre: 1 } } };
  SA.etat(st2, P(101, 0, 0, 5)); check(JSON.stringify(st2.piste.passees['automne-2026']) === JSON.stringify({ xp: 1400, crans: 22, titre: 1 }) && SA.possede(st2, 'trophee-automne-2026'), 'une seconde fin de la même saison : l’archive fusionnée au plus haut, jamais écrasée'); }
{ const t = P(102, 10), st = partie(t); st.piste = { v: 1, id: 'printemps-2031', xp: 77, recus: 0, titre: 0, j: { d: '', o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '', ev: {}, passees: {} };
  SA.etat(st, t); check(st.piste.id === '' && st.piste.passees['printemps-2031'] && st.piste.passees['printemps-2031'].xp === 77, 'une saison inconnue (une version future) : archivée telle quelle, sans exception'); }

console.log('── le déblocage de l’accueil ──');
{ const d = G.ACCUEIL.deblocages.find((x) => x.id === 'piste'), s = G.newState(P(14, 9));
  check(d && d.bit === 15 && (G.ACCUEIL.TOUS & (1 << 15)) && !d.seuil(s, { r: 0 }) && d.seuil(s, { r: 1 }) && d.seuil(Object.assign(s, { lifetime: 1e6 }), { r: 0 }), 'le déblocage « piste » (bit 15) : après « Ton premier jour » réussi, ou à 1 M€'); }

// ═══ la saison d'hiver (docs/noel-contrat.md § 3, § 12.2) : chargée ICI, après les vérifications de l'automne (qui la croient absente) ═══
const HV = require('../src/saison-hiver.js'), AV = require('../src/avent.js');
const D = (j, h, mn = 0, s = 0, m = 12, a = 2026) => SA.parisMs(a, m, j, h) + mn * 60e3 + s * 1e3; // décembre (ou m/a), heure de Paris
console.log('── la saison d’hiver : la fiche ──');
check(HV.id === 'hiver-2026' && SA.fiche('hiver-2026') === HV && HV.debut === D(1, 0) && HV.fin === D(4, 0, 0, 0, 1, 2027) && HV.debut === AU.fin && HV.crans.length === 46 && HV.xpCran === 45 && HV.titre.xp === 250 && HV.xpTitre === 2320 && HV.titre.distinction === 'flocon-or-2026' && HV.titre.nom === 'Flocon d’or 2026', 'la saison d’hiver : du 1er déc. 0 h au 4 janv. 0 h (le 3 à 23 h 59 59), juste après l’automne ; 46 crans de 45 XP, le titre « Flocon d’or 2026 » à 2 320 XP');
check(JSON.stringify(HV.evenements) === '["noel"]' && HV.sources.avent && HV.sources.avent.xp === 10 && HV.sources.avent.nom === 'Calendrier de l’Avent' && !HV.sources.avent.parJour && ['objectif', 'journee', 'defi', 'serie', 'palier', 'casino'].every((k) => HV.sources[k] === SA.SOURCES[k]) && typeof HV.lecteurs.avent === 'function' && HV.famille === 'piste-hiver' && HV.tenue === null, 'les sources de l’automne, plus le calendrier de l’Avent (10 XP la case, lu par un lecteur) ; les paliers du Marché de Noël (st.noel) ; la famille piste-hiver, aucune tenue');
{ const E = [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42], B = { 1: [2, 1800], 13: [2, 1800], 25: [2, 3600], 37: [3, 1800] }, DC = { 5: 'luge', 11: 'lanterne-givre', 17: 'guirlande-givre', 23: 'traineau', 29: 'cheminee', 35: 'patins' };
  const ko = HV.crans.filter((c) => { const k = c.n; if (k === 46) return !(c.deco === 'trophee-hiver-2026' && c.trophee === 'trophee-hiver-2026' && c.etoiles === 2 && !c.flocon); if (E.includes(k)) return !(c.etoiles === 1 && Object.keys(c).length === 2); if (B[k]) return !(c.boost && c.boost.mult === B[k][0] && c.boost.secs === B[k][1] && !c.etoiles); if (DC[k]) return !(c.deco === DC[k] && !c.etoiles); return !(c.flocon === k && Object.keys(c).length === 2); });
  check(!ko.length && HV.crans.reduce((a, c) => a + (c.etoiles || 0), 0) === 13 && HV.crans.filter((c) => c.boost).length === 4 && HV.crans.filter((c) => c.deco).length === 7 && HV.crans.filter((c) => c.flocon).length === 24 && HV.crans.every((c) => !c.vetement && !c.prime), `les 46 crans du contrat (§ 3.3) : 13 ★, 4 boosts (×2, ×2, ×2 1 h, ×3), 6 décos et le trophée, 24 flocons, aucune tenue ni heure de gains${ko.length ? ' — ' + ko.map((c) => c.n).join(', ') : ''}`); }
check(SA.active(D(30, 23, 59, 59, 11)) === AU && SA.active(D(1, 0)) === HV && SA.active(D(3, 23, 59, 59, 1, 2027)) === HV && SA.active(D(4, 0, 0, 0, 1, 2027)) === null, 'active : le 30 nov. à 23:59:59 l’automne ; le 1er déc. à 0 h l’hiver ; le 3 janv. à 23:59:59 l’hiver ; le 4 janv. à 0 h, rien');
{ let err = ''; try { SA.ajouter({ id: 'essai-51', debut: SA.parisMs(2031, 3, 1, 0), fin: SA.parisMs(2031, 4, 1, 0), crans: Array.from({ length: 51 }, () => ({ etoiles: 1 })), xpCran: 10 }); } catch (e) { err = e.message; }
  check(/50 crans au plus/.test(err) && !SA.fiche('essai-51') && SA.PISTE.maxCrans === 50, 'le moteur : 46 crans acceptés (l’hiver), 51 refusés (50 au plus, le masque des reçus en arithmétique)'); }

console.log('── le masque des crans reçus au-delà de 32 bits ──');
{ let ok = true; const t = P(20, 10); // une piste d'automne (recus < 2 ** 22) se lit à l'identique : chaque masque tiré, cran par cran, comme les opérateurs de bits d'avant
  for (let i = 0; i < 300 && ok; i++) { const m = Math.floor(Math.random() * 2 ** 22), st = partie(t); st.piste = { v: 1, id: 'automne-2026', xp: 22 * 45, recus: m, titre: 0, j: { d: dk(t), o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '', ev: { marche: 0 }, passees: {} };
    SA.etat(st, t); const v = SA.vue(st, t), l = SA.aRecevoir(st); for (let k = 0; k < 22; k++) { const b = (m & (1 << k)) !== 0; if ((v.piste[k].etat === 'recu') !== b || l.includes(k + 1) === b) ok = false; } if (st.piste.recus !== m) ok = false; }
  check(ok, 'une piste d’automne (300 masques < 2²² tirés) se lit à l’identique : les mêmes crans reçus, les mêmes à recevoir ; aucune sauvegarde touchée'); }
{ const t = D(20, 10), mk = (recus) => { const st = partie(t); st.piste = { v: 1, id: 'hiver-2026', xp: 2320, recus, titre: 0, j: { d: dk(t), o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '', ev: { noel: 0, avent: 0 }, passees: {} }; SA.etat(st, t); return st; };
  const a = mk(2 ** 46 - 1), b = mk(2 ** 50), c = mk(2 ** 50 - 1), d = mk(2 ** 45 + 2 ** 31 + 1);
  check(a.piste.recus === 2 ** 46 - 1 && SA.aRecevoir(a).join() === '47' && b.piste.recus === 0 && c.piste.recus === 2 ** 50 - 1 && SA.vue(d, t).piste.filter((x) => x.etat === 'recu').map((x) => x.n).join() === '1,32,46', 'recus = 2⁴⁶ − 1 relu tel quel (46 crans reçus, seul le titre reste) ; 2⁵⁰ refusé (0) ; 2⁵⁰ − 1 gardé ; les crans 1, 32 et 46 reçus se lisent (au-delà de 32 bits)');
  const st = mk(0); st.piste.xp = 46 * 45; const l = SA.toutRecevoir(st); check(l.length === 46 && st.piste.recus === 2 ** 46 - 1 && SA.recevoir(st, 40) === null && SA.recevoir(st, 47) === null, 'recevoir les 46 : chacun une fois (2⁴⁶ − 1), le 40e pas deux fois ; le titre attend ses 2 320 XP'); }

console.log('── les lecteurs d’une fiche (l’Avent) ──');
{ const F = SA.ajouter({ id: 'essai-lecteurs', debut: SA.parisMs(2031, 1, 1, 0), fin: SA.parisMs(2031, 2, 1, 0), crans: [{ etoiles: 1 }], xpCran: 100, sources: Object.assign({}, SA.SOURCES, { x: { xp: 3, nom: 'x' }, y: { xp: 2, nom: 'y' } }), lecteurs: { x: () => { throw new Error('boum'); }, y: (st) => st.y } });
  const t = SA.parisMs(2031, 1, 5, 10), st = { y: 2 }; const o1 = SA.pas(st, t); st.y = 'cinq'; const o2 = SA.pas(st, t + 1000); st.y = 5; const o3 = SA.pas(st, t + 2000); st.y = 1; const o4 = SA.pas(st, t + 3000); st.y = 6; const o5 = SA.pas(st, t + 4000);
  check(F && o1.sources.y === 4 && !o1.sources.x && !o2.xp && o3.sources.y === 6 && !o4.xp && o5.sources.y === 2 && st.piste.ev.y === 6 && st.piste.ev.x === 0, 'un lecteur qui jette compte 0 ; ce qui n’est pas un entier ≥ 0 compte 0 ; l’augmentation seulement, une fois (2 → 5 → 1 → 6 : 4, 6, rien, 2 XP) ; ce qui est fait avant le premier pas compte au premier pas');
  const r = SA.restes(st, t + 4000); check(r.map((x) => x.id).join() === 'objectif,journee,defi,serie,palier,casino,x,y' && r[7].fait === 6 && r[7].max === null && st.piste.j.a === 6, '« D’où vient l’XP » : la ligne de chaque lecteur, après les six sources (faites aujourd’hui : j.a, le compteur du jour des lecteurs, sans plafond ; une fiche du jeu n’en a qu’un, l’Avent)');
  st.piste.j = { d: dk(t), o: 0, c: 0, k: 0, s: 0, p: 0 }; delete st.piste.ev.y; SA.etat(st, t + 5000); check(st.piste.j.a === 0 && st.piste.ev.y === 6 && !SA.pas(st, t + 6000).xp, 'réparés comme les paliers : un j sans compteur a (une piste d’automne), un marqueur perdu repris au compteur du moment (rien recompté)'); }
{ const t = D(2, 9), st = partie(t); AV.ouvrir(st, 2, t); AV.ouvrir(st, 1, t + 1000); const o = SA.pas(st, t + 2000);
  check(st.piste.id === 'hiver-2026' && o.sources.avent === 20 && st.piste.ev.avent === 2, 'le 2 déc. : deux cases ouvertes AVANT la création de la piste comptent au premier pas (20 XP)');
  check(!SA.pas(st, t + 3000).xp && SA.restes(st, t + 3000).find((x) => x.id === 'avent').fait === 2, 'rien de plus au pas suivant ; « Calendrier de l’Avent » : 2 ouvertes aujourd’hui');
  AV.ouvrir(st, 3, D(3, 9)); const o3 = SA.pas(st, D(3, 9, 1)); check(o3.sources.avent === 10 && SA.restes(st, D(3, 9, 1)).find((x) => x.id === 'avent').fait === 1, 'le 3 : la case du jour, 10 XP ; le compteur du jour repart');
  st.avent = 'abîmé'; check(!SA.pas(st, D(3, 9, 2)).xp && st.piste.ev.avent === 3, 'un st.avent abîmé : le lecteur rend 0, rien n’est retiré ni recompté'); }

console.log('── l’enchaînement automne → hiver (le 1er déc. à 0 h, sans trou ni double compte) ──');
{ const t = P(30, 20), st = partie(t, { obj: 3, etoile: true, defi: true, sem: '2026-11-30' }); SA.pas(st, t); st.piste.xp = 560; SA.recevoir(st, 1); SA.recevoir(st, 2);
  const xpA = st.piste.xp, semA = st.piste.sem; AV.ouvrir(st, 1, D(1, 0, 0, 5)); // (la case 1 ouverte à 0 h 00 05, avant le premier pas de décembre)
  const o = SA.pas(st, D(1, 0, 0, 10)), d = SA.finDue(st);
  check(semA === '2026-11-30' && st.piste.id === 'hiver-2026' && st.piste.passees['automne-2026'] && st.piste.passees['automne-2026'].xp === xpA && d && d.id === 'automne-2026' && d.lots.map((l) => l.n).join() === '3,4,5,6,7,8,9,10,11,12', 'au premier pas du 1er déc. : l’automne archivé, ses crans dus (3 à 12) rangés pour la feuille de fin, l’hiver ouvert au même pas');
  check(o.sources.avent === 10 && !o.sources.defi && !o.sources.objectif && !o.sources.journee && st.piste.xp === 10 && st.piste.sem === '2026-11-30', `le défi de la semaine du 30 nov., déjà compté à l’automne, ne compte pas pour l’hiver ; les objectifs du 30 nov. non plus ; la case 1 de l’Avent, oui (${JSON.stringify(o.sources)})`);
  check(o.fin && o.fin.id === 'automne-2026' && st.piste.id === 'hiver-2026', 'la feuille de fin d’automne est due (finDue) au moment où l’hiver s’ouvre : l’écran la montre AVANT l’annonce de décembre');
  SA.recevoirFin(st); st.jour = partie(D(1, 9), { obj: 1 }).jour; const o2 = SA.pas(st, D(1, 9)); check(o2.sources.objectif === 5 && !SA.finDue(st), 'le 1er déc. à 9 h : un objectif du jour compte pour l’hiver ; la feuille de fin, montrée une fois');
  check(o2.sources.serie === 10 && st.piste.veille === '2026-12-01' && !SA.pas(st, D(1, 9, 0, 1)).xp && !SA.pas(st, D(1, 21)).xp, `et la série locale continue : un objectif le 30 nov. (à l’automne) puis le 1er déc. (veille reprise par l’hiver), 10 XP, une fois (${JSON.stringify(o2.sources)})`);
  st.semaine = { key: '2026-12-07', reclame: true }; const o3 = SA.pas(st, D(7, 9)); check(o3.sources.defi === 75, 'le défi de la semaine du 7 déc. : 75 XP pour l’hiver');
  // une horloge reculée après l'ouverture de l'hiver (le 30 nov. à 23 h 54) : l'automne ne se rouvre pas, l'hiver attend, rien n'est compté
  const xpH = st.piste.xp, ob = SA.pas(st, P(30, 23, 54)); check(!ob.xp && st.piste.id === 'hiver-2026' && st.piste.xp === xpH && JSON.stringify(st.piste.passees['automne-2026']) === JSON.stringify({ xp: 560, crans: 12, titre: 0 }) && !SA.finDue(st), 'un recul d’horloge au 30 nov. 23 h 54 : l’automne ne se rouvre pas, l’hiver garde son XP, aucune feuille de plus'); }
{ const st = partie(P(30, 20), { defi: false, sem: '2026-11-30' }); SA.pas(st, P(30, 20)); st.semaine.reclame = true; const o = SA.pas(st, D(2, 9));
  check(o.sources.defi === 75 && st.piste.id === 'hiver-2026', 'le défi de la semaine du 30 nov. réclamé APRÈS le 1er déc. : il compte pour l’hiver (une fois)'); }
{ const st = partie(D(10, 9)); st.piste = { v: 1, id: 'automne-2026', xp: 300, recus: 1, titre: 0, j: { d: dk(P(28, 9)), o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '2026-11-23', veille: '', ev: { marche: 4 }, passees: {} };
  SA.pas(st, D(10, 9)); check(st.piste.id === 'hiver-2026' && st.piste.passees['automne-2026'].crans === 6 && SA.finDue(st) && SA.finDue(st).lots.length === 5, 'un joueur absent du 28 nov. au 10 déc. : au lancement, la fin d’automne (5 crans dus) puis l’hiver, dans le même pas'); }

console.log('── la fin de l’hiver ──');
{ const t = D(20, 10), st = partie(t); SA.pas(st, t); st.piste.xp = 2400; SA.recevoir(st, 1); for (let n = 2; n <= 30; n++) SA.recevoir(st, n);
  const o = SA.pas(st, D(4, 0, 0, 1, 1, 2027)), d = SA.finDue(st);
  check(st.piste.id === '' && JSON.stringify(st.piste.passees['hiver-2026']) === JSON.stringify({ xp: 2400, crans: 46, titre: 1 }) && d && d.id === 'hiver-2026' && d.lots.length === 17 && d.lots[16].titre, 'le 4 janv. à 0 h : les crans 31 à 46 et le titre donnés d’office (la feuille de fin), l’archive { xp 2400, crans 46, titre 1 }, id « » (pas de saison au printemps)');
  check(SA.possede(st, 'trophee-hiver-2026') && SA.possede(st, 'cheminee') && SA.possede(st, 'flocon-or-2026') && !SA.pas(st, D(5, 9, 0, 0, 1, 2027)).xp, 'le carnet lit l’archive : le trophée, la cheminée, le titre, à vie ; plus rien ne compte');
  const CH = require('../src/chaine.js'), c = CH.carnet(st, {}).find((f) => f.id === 'piste-hiver'); check(c && c.gagnes === 7 && c.total === 7, `Mes décos : la famille « La saison d’hiver 2026 » (${c && c.gagnes}/${c && c.total})`); }
{ const s = G.newState(D(20, 10)); s.now = D(20, 10); const l = SA.verser(s, { n: 47, titre: true, distinction: 'flocon-or-2026' }, G); check(l.distinction === 'flocon-or-2026' && G.distinctions(s).includes('flocon-or-2026'), 'le titre versé : la distinction « Flocon d’or 2026 »'); }

// ─── la piste simulée sur ce moteur, et la longévité (en parallèle) ───
const SIM = require('./fournil-saison-sim.js');
(async () => {
  const t0 = Date.now();
  const R = await SIM.toutEnParallele([{ nom: 'quotidien' }, { nom: 'occasionnel' }, { nom: 'tresactif' }, { nom: 'assidu' }]);
  const [q, o, ta, as] = R.pistes;
  console.log(`── la piste simulée (le joueur de test/longevite.js, déjà là depuis le 5 oct. ; les récompenses versées ; ${((Date.now() - t0) / 1000).toFixed(0)} s avec la longévité) ──`);
  for (const r of R.pistes) console.log(`  ${r.profil.padEnd(11)} ${r.xp} XP · ${r.crans}/22 · finie ${r.fini || '—'} · titre ${r.titre ? 'oui' : 'non'} · +${r.etoiles} ★, ${r.boosts} boosts · ${Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  check(q.fini && q.fini >= '2026-11-25' && q.fini <= '2026-11-27', `le quotidien (1 h) finit la piste du 25 au 27 novembre (${q.fini})`);
  check(o.crans / 22 >= 0.4 && o.crans / 22 <= 0.65 && !o.fini, `l’occasionnel (17 min, quatre jours sur sept) : de 40 à 65 % de la piste (${o.crans}/22, ${Math.round(o.crans / 22 * 100)} %)`);
  check(ta.fini && ta.fini < '2026-11-26' && ta.titre, `le très actif (8 h) la finit avant le 26 (${ta.fini}), et le titre`);
  check(as.fini && as.fini <= '2026-11-28', `l’assidu (2 h) la finit (${as.fini})`);
  check(R.pistes.every((r) => r.etoiles <= 16 && r.boosts <= 3), 'jamais plus de 16 étoiles ni de 3 boosts');
  console.log('── la longévité (outils/marche/longevite-saison.js sur ce moteur : sans → avec la piste, le bruit d’une étoile) ──');
  for (const l of R.longevite.lignes) console.log('  ' + l);
  const L = R.longevite;
  check(L.ok, `aucun effet notable sur le rythme des boutiques, une fois ôté le bruit d’une seule étoile : étoiles ${(L.pire.etoiles * 100).toFixed(1)} % (6 % au plus), boutiques ${L.pire.boutiques} (1), première boutique ${L.pire.premiere} j (1), franchise ${L.pire.franchise} j (2) ; garde-fous de test/longevite.js : ${L.horsCibles ? L.horsCibles + ' cas hors' : 'tous tenus'}`);
  // ─── l'hiver sur le vrai moteur (test/fournil-saison-sim.js : la logique de outils/noel/hiver.js), l'Avent compris, et la longévité sur
  //     plusieurs graines moyennées (FOURNIL_SAISON_GRAINES, 11,3,5,7 par défaut : § 8.3) ───
  const t1 = Date.now(), GR = (process.env.FOURNIL_SAISON_GRAINES != null ? process.env.FOURNIL_SAISON_GRAINES : '11,3,5,7').split(',').filter(Boolean).map(Number);
  const H = await SIM.toutHiver([{ nom: 'quotidien' }, { nom: 'occasionnel' }, { nom: 'tresactif' }, { nom: 'assidu' }, { nom: 'occasionnel', o: { departParis: [2026, 12, 1, 0] } }], GR, ['1er déc.|occasionnel']);
  const [hq, ho, ht, ha, hn] = H.pistes;
  console.log(`── la piste d’hiver simulée (le joueur de test/longevite.js, là depuis le 1er nov. : l’automne puis l’hiver dans le même st.piste ; les récompenses versées ; ${((Date.now() - t1) / 1000).toFixed(0)} s avec la longévité) ──`);
  for (const r of H.pistes) console.log(`  ${r.profil.padEnd(11)} ${r.hiver.xp} XP · ${r.hiver.crans}/46 · finie ${r.hiver.fini || '—'} · titre ${r.hiver.titre ? 'oui' : 'non'} · +${r.hiver.etoiles} ★, ${r.hiver.boosts} boosts · Avent ${r.avent.n}/24 (le 24 : ${r.avent.le24}, au plus ${r.avent.maxParJour} par jour) · ${Object.entries(r.hiver.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  check(hq.hiver.fini && hq.hiver.fini >= '2026-12-30' && hq.hiver.fini <= '2027-01-01' && hq.automne.fini === '2026-11-25', `le quotidien (1 h) finit la piste d’hiver du 30 déc. au 1er janv. (${hq.hiver.fini}), après l’automne fini le 25 nov. (${hq.automne.fini})`);
  check(ho.hiver.crans / 46 >= 0.5 && ho.hiver.crans / 46 <= 0.7 && !ho.hiver.fini && ho.avent.le24 === 22 && ho.avent.le31 === 24 && ho.avent.maxParJour === 2, `l’occasionnel (17 min, quatre jours sur sept) : de 50 à 70 % de la piste (${ho.hiver.crans}/46, ${Math.round(ho.hiver.crans / 46 * 100)} %) ; l’Avent 22 le 24, 24 le 31, au plus deux le même jour`);
  check(ht.hiver.fini && ht.hiver.fini < '2026-12-26' && ht.hiver.titre && ha.hiver.fini && ha.hiver.titre, `le très actif (8 h) la finit avant le 26 (${ht.hiver.fini}), l’assidu (${ha.hiver.fini}) : le titre « Flocon d’or 2026 »`);
  check(H.pistes.every((r) => r.hiver.etoiles <= 13 && r.hiver.boosts <= 4 && r.avent.etoiles <= 8 && r.avent.boosts <= 3 && r.hiver.sources.avent <= 240), 'jamais plus de 13 étoiles ni de 4 boosts à la piste, 8 et 3 à l’Avent, 240 XP de l’Avent');
  check(hn.hiver.crans >= 25 && hn.hiver.crans <= 31, `l’occasionnel arrivé le 1er décembre : ${hn.hiver.crans}/46 (28 en conception)`);
  if (H.longevite) {
    console.log(`── la longévité de l’Avent et de l’hiver (graines ${GR.join(', ')}, résumés moyennés ; sans → avec l’Avent → avec tout) ──`);
    for (const l of H.longevite.lignes) console.log('  ' + l);
    const Lh = H.longevite, ex = Lh.exceptions['1er déc.|occasionnel'];
    check(Lh.ok, `aucun effet notable pour les joueurs déjà là et le régulier et l’assidu du 1er déc., une fois ôté le bruit d’une étoile : étoiles ${(Lh.pire.etoiles * 100).toFixed(1)} % avec tout (6 % au plus), ${(Lh.pire.etoilesAvent * 100).toFixed(1)} % avec l’Avent seul ; boutiques ${Lh.pire.boutiques.toFixed(1)} (1) ; première boutique ${Lh.pire.premiere.toFixed(1)} j (1) ; franchise ${Lh.pire.franchise.toFixed(1)} j (2) ; garde-fous de test/longevite.js : ${Lh.horsCibles ? Lh.horsCibles + ' cas hors' : 'tous tenus'}`);
    check(ex && ex.j30 >= 0 && ex.j30 <= 0.45 && Math.abs(ex.fin) <= 0.06 && ex.dFranchise <= 1, `le coup de pouce GARDÉ par le joueur (§ 15.1) : l’occasionnel arrivé le 1er décembre, étoiles au 30e jour ${ex ? (ex.j30 * 100).toFixed(1) : '?'} % (≤ 45 % ; + 35,6 % en conception), à la fin ${ex ? (ex.fin * 100).toFixed(1) : '?'} % (≤ 6 %), franchise ${ex ? (ex.dFranchise > 0 ? '+' : '') + ex.dFranchise.toFixed(1) : '?'} j (jamais plus tard), ses garde-fous tenus`);
  }
  console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
