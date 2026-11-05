#!/usr/bin/env node
// La saison gratuite « Automne » (src/saison.js, le moteur ; src/saison-automne.js, sa fiche ; docs/marche-contrat.md § 7, 10.2) :
// la saison active à ses bornes (13 nov. 2026 à midi → 30 nov. 23 h 59 59), l'XP par constat (chaque source et son plafond, le défi une
// fois par semaine, la série d'aujourd'hui et d'hier, ou celle du classement, les paliers du Marché, l'arrière-salle ; deux pas : rien de
// plus), st.piste créée seulement pendant une saison, remise d'aplomb (null, [], { xp: 'x', recus: -1, j: 3 }…) sans rien compter deux
// fois, recevoir une fois par cran et le lot exact (§ 7.3), le titre à 1 350 XP, verser dans la boulangerie (étoiles, boosts, vêtements
// sans bonus, le titre), possede (le carnet), la fin (les crans dus donnés d'office, l'archive) ; le déblocage « piste » de l'accueil ;
// puis la piste simulée sur ce moteur (test/fournil-saison-sim.js : quotidien finie du 27 au 29 nov., occasionnel quatre jours sur sept
// de 40 à 65 %, très actif avant le 26) et la longévité (aucun effet notable sur le rythme des boutiques ; les garde-fous de test/longevite.js).
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
check(AU.id === 'automne-2026' && SA.fiche('automne-2026') === AU && AU.debut === P(13, 12) && AU.fin === P(101, 0) && AU.crans.length === 22 && AU.xpCran === 50 && AU.titre.xp === 250 && AU.xpTitre === 1350 && AU.titre.distinction === 'feuille-or-2026', 'la saison d’automne : du 13 nov. midi au 1er déc. 0 h, 22 crans de 50 XP, le titre « Feuille d’or 2026 » à 1 350 XP');
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
  SA.etat(st, t); check(st.piste.xp === 333 && st.piste.recus === ((1 << 3) | (1 << 25)) && st.piste.titre === 1 && st.piste.ev.marche === 2 && JSON.stringify(st.piste.passees) === JSON.stringify({ 'x-2025': { xp: 10, crans: 30, titre: 1 } }), 'une piste saine se relit telle quelle (les bits au-delà des crans gardés) ; les saisons passées remises d’aplomb une à une'); }

console.log('── recevoir, le lot exact, le titre ──');
const LOTS = { 1: { boost: [2, 1800] }, 2: { etoiles: 1 }, 3: { deco: 'couronne-feuilles' }, 4: { etoiles: 1 }, 5: { vetement: 'automne-gavroche' }, 6: { etoiles: 1 }, 7: { deco: 'guirlande-feuilles' }, 8: { etoiles: 1 }, 9: { vetement: 'automne-echarpe' },
  10: { etoiles: 1, boost: [2, 1800] }, 11: { etoiles: 1 }, 12: { etoiles: 1 }, 13: { vetement: 'automne-pull' }, 14: { etoiles: 2 }, 15: { deco: 'lanterne-automne' }, 16: { etoiles: 1 }, 17: { vetement: 'automne-bottines' }, 18: { etoiles: 2 },
  19: { deco: 'epouvantail' }, 20: { boost: [3, 1800] }, 21: { etoiles: 2 }, 22: { deco: 'trophee-automne-2026', trophee: 'trophee-automne-2026', etoiles: 2 } };
check(AU.crans.every((c, k) => { const a = LOTS[k + 1]; return c.n === k + 1 && (c.etoiles || undefined) === a.etoiles && JSON.stringify(c.boost ? [c.boost.mult, c.boost.secs] : undefined) === JSON.stringify(a.boost) && c.deco === a.deco && c.vetement === a.vetement && c.trophee === a.trophee && !c.prime; }), 'les 22 crans du contrat (§ 7.3), aucune heure de gains');
check(AU.crans.reduce((s, c) => s + (c.etoiles || 0), 0) === 16 && AU.crans.filter((c) => c.boost).length === 3 && AU.crans.filter((c) => c.deco).length === 5 && AU.crans.filter((c) => c.trophee).length === 1 && AU.crans.filter((c) => c.vetement).length === 4, '16 étoiles, 3 boosts, 5 décos (dont le trophée de fin de saison, au 22e), la tenue de saison en 4 pièces');
{ const t = P(20, 10), st = partie(t); SA.pas(st, t); st.piste.xp = 349;
  check(SA.crans(st) === 6 && SA.aRecevoir(st).join() === '1,2,3,4,5,6' && SA.recevoir(st, 7) === null, '349 XP : six crans atteints, à recevoir ; le 7e pas encore');
  const l1 = SA.recevoir(st, 1), l1b = SA.recevoir(st, 1);
  check(l1 && l1.n === 1 && l1.boost.mult === 2 && l1.boost.secs === 1800 && l1b === null && SA.aRecevoir(st).join() === '2,3,4,5,6' && st.piste.recus === 1, 'recevoir le cran 1 : son lot (boost ×2 30 min), une fois ; il n’est plus à recevoir');
  const s = G.newState(t); s.now = t; const e0 = s.etoiles;
  const lots = SA.toutRecevoir(st); for (const l of lots) SA.verser(s, l, G);
  check(lots.map((l) => l.n).join() === '2,3,4,5,6' && s.etoiles === e0 + 3 && G.garderobe(s).objets['automne-gavroche'] && SA.possede(st, 'couronne-feuilles') && !SA.possede(st, 'guirlande-feuilles') && SA.aRecevoir(st).length === 0, '« Tout recevoir » : 2 à 6 versés (3 étoiles, la casquette de tweed dans la garde-robe, la couronne de feuilles possédée)');
  const b = SA.verser(s, AU.crans[19], G); check(b.boost && s.boosts.reserve.some((x) => x.mult === 3 && x.secs === 1800), 'un boost de la piste va dans la réserve (lancé quand on veut)');
  st.piste.xp = 1349; const r = SA.aRecevoir(st); check(SA.crans(st) === 22 && !r.includes(23) && !SA.titre(st).atteint && SA.titre(st).reste === 1, '1 349 XP : les 22 crans, pas encore le titre (encore 1 XP)');
  st.piste.xp = 1350; check(SA.aRecevoir(st).includes(23) && SA.titre(st).atteint && !SA.titre(st).recu, '1 350 XP : le titre est à recevoir (n = 23)');
  const lt = SA.recevoir(st, 23); SA.verser(s, lt, G);
  check(lt && lt.titre && lt.distinction === 'feuille-or-2026' && SA.recevoir(st, 23) === null && st.piste.titre === 1 && G.distinctions(s).includes('feuille-or-2026') && SA.possede(st, 'feuille-or-2026'), 'reçu : la distinction « Feuille d’or 2026 » (au classement, à côté du pseudo), une fois');
  const v = SA.vue(st, t); check(v && v.cran === 22 && v.crans === 22 && v.piste.length === 22 && v.piste[0].etat === 'recu' && v.piste[6].etat === 'aRecevoir' && v.titre.recu && v.resteMs === AU.fin - t, 'la vue de l’écran : cran 22/22, chaque cran son état (reçu, à recevoir), le titre, ce qu’il reste de temps'); }
{ const t = P(21, 10), st = partie(t, { obj: 1 }); SA.pas(st, t); const r = SA.restes(st, t);
  check(r.length === 6 && r.find((x) => x.id === 'objectif').reste === 2 && r.find((x) => x.id === 'palier').max === null && r.find((x) => x.id === 'defi').parSemaine, '« D’où vient l’XP » : les six sources, ce qu’il reste à prendre aujourd’hui'); }

console.log('── la fin de la saison ──');
{ const t = P(25, 10), st = partie(t); SA.pas(st, t); st.piste.xp = 620; SA.recevoir(st, 1); SA.recevoir(st, 2);
  const o = SA.pas(st, P(101, 0, 0, 1)), d = SA.finDue(st);
  check(st.piste.id === '' && st.piste.passees['automne-2026'] && st.piste.passees['automne-2026'].crans === 12 && st.piste.passees['automne-2026'].xp === 620 && st.piste.passees['automne-2026'].titre === 0, 'le 1er décembre à 0 h : la saison archivée ({ xp 620, crans 12, titre 0 }), la piste repart sans saison (id « »)');
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

// ─── la piste simulée sur ce moteur, et la longévité (en parallèle) ───
const SIM = require('./fournil-saison-sim.js');
(async () => {
  const t0 = Date.now();
  const R = await SIM.toutEnParallele([{ nom: 'quotidien' }, { nom: 'occasionnel' }, { nom: 'tresactif' }, { nom: 'assidu' }]);
  const [q, o, ta, as] = R.pistes;
  console.log(`── la piste simulée (le joueur de test/longevite.js, déjà là depuis le 5 oct. ; les récompenses versées ; ${((Date.now() - t0) / 1000).toFixed(0)} s avec la longévité) ──`);
  for (const r of R.pistes) console.log(`  ${r.profil.padEnd(11)} ${r.xp} XP · ${r.crans}/22 · finie ${r.fini || '—'} · titre ${r.titre ? 'oui' : 'non'} · +${r.etoiles} ★, ${r.boosts} boosts · ${Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  check(q.fini && q.fini >= '2026-11-27' && q.fini <= '2026-11-29', `le quotidien (1 h) finit la piste du 27 au 29 novembre (${q.fini})`);
  check(o.crans / 22 >= 0.4 && o.crans / 22 <= 0.65 && !o.fini, `l’occasionnel (17 min, quatre jours sur sept) : de 40 à 65 % de la piste (${o.crans}/22, ${Math.round(o.crans / 22 * 100)} %)`);
  check(ta.fini && ta.fini < '2026-11-26' && ta.titre, `le très actif (8 h) la finit avant le 26 (${ta.fini}), et le titre`);
  check(as.fini && as.fini <= '2026-11-28', `l’assidu (2 h) la finit (${as.fini})`);
  check(R.pistes.every((r) => r.etoiles <= 16 && r.boosts <= 3), 'jamais plus de 16 étoiles ni de 3 boosts');
  console.log('── la longévité (outils/marche/longevite-saison.js sur ce moteur : sans → avec la piste, le bruit d’une étoile) ──');
  for (const l of R.longevite.lignes) console.log('  ' + l);
  const L = R.longevite;
  check(L.ok, `aucun effet notable sur le rythme des boutiques, une fois ôté le bruit d’une seule étoile : étoiles ${(L.pire.etoiles * 100).toFixed(1)} % (5 % au plus), boutiques ${L.pire.boutiques} (1), première boutique ${L.pire.premiere} j (1), franchise ${L.pire.franchise} j (2) ; garde-fous de test/longevite.js : ${L.horsCibles ? L.horsCibles + ' cas hors' : 'tous tenus'}`);
  console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
