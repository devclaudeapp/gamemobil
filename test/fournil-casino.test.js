#!/usr/bin/env node
// L'arrière-salle du Fournil (src/casino.js) : les trophées, les mini-objectifs, les statistiques et les skins du casino (lot 7), purs.
// Chaque trophée gagné par une vraie main (sabot préparé) ou un vrai tour (tirage forcé), l'idempotence d'apresMain / apresTour, les
// mini-objectifs (tirage du jour, renouvellement à minuit heure de Paris, difficulté selon le n° de boutique, la mise à 0,5 % de la caisse,
// 4 jetons d'or au plus par jour), les skins (achat, choix, refus), une vieille sauvegarde sans casino, et surtout l'économie :
// 10 000 actions au hasard ne changent que st.coins, st.arriere et st.distinctions (le titre, avec sa ligne au carnet).
// Lancer : TZ=Europe/Paris node test/fournil-casino.test.js
'use strict';
const G = require('../src/game.js'), B = require('../src/blackjack.js'), R = require('../src/roulette.js'), C = require('../src/casino.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 22, 10, 0), JOUR = G.dayKey(T0);
const carte = (s) => { const m = /^(A|[2-9]|10|V|D|R)([♠♥♦♣])$/.exec(s); if (!m) throw new Error(s); return B.SYMBOLES.indexOf(m[2]) * 13 + B.RANGS.indexOf(m[1]) - 1; };
const cartes = (t) => t.split(' ').map(carte);
function boutique(coins, boutiques) { const st = G.newState(T0); st.coins = coins; st.boutiques = boutiques || 1; st.lifetime = 123456; st.lifetimeRun = 65432; st.etoiles = 3; return st; }
function empiler(st, ordre) { const a = B.etat(st), c = cartes(ordre); a.sabot = c.concat(B.nouveauSabot(() => 0.5).slice(c.length)); a.pos = 0; return a; }
const sur = (num) => () => (num + 0.5) / 37;
const opts = (t) => ({ maintenant: t || T0, jour: G.dayKey(t || T0), G });
// une main jouée de bout en bout (sabot préparé, coups donnés), puis comptée par le casino
function main(st, ordre, coups, mise, m) { empiler(st, ordre); B.distribuer(st, Object.assign({ main: mise || 100 }, m)); for (const c of coups || []) B[c](st); const h = B.etat(st).main; return { h, r: C.apresMain(st, h, opts()) }; }
function tour(st, mises, num, t) { const x = R.lancer(st, mises, sur(num)); return { t: x.tour, r: C.apresTour(st, x.tour, opts(t)) }; }
const ids = (r) => r.trophees.map((t) => t.id).join();
// des objectifs choisis (pour tester chaque type) : posés sur le jour en cours
function poser(st, types) { const c = C.etat(st); C.objectifs(st, JOUR); c.objectifs = types.map(([type, cible], k) => ({ id: `${JOUR}-${k}`, type, cible, progres: 0, fait: false, txt: C.TYPES[type].txt(cible) })); return c; }

console.log('── les trophées : 11, cosmétiques ──');
check(C.TROPHEES.length === 11 && new Set(C.TROPHEES.map((t) => t.id)).size === 11 && C.TROPHEES.map((t) => t.id).join() === 'premiere-main,blackjack,cinq-cartes,partage,double,paire-parfaite,plein,zero,habitue,serie-10,assidu', 'les 11 trophées du contrat, dans l’ordre');
check(C.TROPHEES.every((t) => t.nom && t.desc && ['blackjack', 'roulette', 'arriere'].includes(t.jeu) && Object.keys(t.recompense).every((k) => ['skin', 'categorie', 'titre'].includes(k))), 'chaque trophée : un nom, une description, son jeu ; sa récompense : un skin ou un titre, rien d’autre (ni argent, ni XP, ni points)');
check(C.TROPHEES.filter((t) => t.recompense.skin).every((t) => { const s = C.SKINS[t.recompense.categorie].find((x) => x.id === t.recompense.skin); return s && s.trophee === t.id && !s.prix; }) && C.TROPHEES.find((t) => t.id === 'serie-10').recompense.titre === 'main-de-velours',
  'chaque skin de trophée existe et se gagne par ce trophée seulement ; « Main de velours » donne le titre');
check(Object.keys(C.SKINS).join() === 'tapis,dos,jetons,roue,croupier' && Object.values(C.SKINS).reduce((s, l) => s + l.length, 0) === 20 && Object.values(C.SKINS).every((l) => l.filter((x) => x.defaut).length === 1 && l.every((x) => x.defaut || x.trophee || x.prix > 0)),
  '20 skins en cinq catégories (la liste du contrat : 5 tapis, 4 dos, 3 jetons, 4 roulettes, 4 croupiers) : un de base par catégorie, les autres par trophée ou jetons d’or');
check(G.DISTINCTIONS['main-de-velours'] && G.DISTINCTIONS['main-de-velours'].nom === 'Main de velours' && require('../src/classement.js').TITRES['main-de-velours'] === 'Main de velours' && require('../src/classement.js').titreOk('main-de-velours'), 'le titre « Main de velours » : une distinction du jeu, un titre connu du classement');

console.log('── chaque trophée, par une vraie main ou un vrai tour ──');
{ const st = boutique(1e6);
  let x = main(st, '10♠ 10♥ 9♦ 7♣', ['rester']); check(ids(x.r) === 'premiere-main' && C.skins(st).tapis.find((s) => s.id === 'bordeaux').debloque, 'Première main : 19 contre 17 ; le tapis bordeaux débloqué');
  x = main(st, 'A♠ 9♥ R♦ 7♣'); check(ids(x.r) === 'blackjack' && C.skins(st).dos.find((s) => s.id === 'or').debloque, 'BlackJack ! : as + roi d’entrée ; le dos doré');
  x = main(st, '2♠ 10♥ 3♦ 7♣ 4♥ 5♠ 7♦', ['tirer', 'tirer', 'tirer']); check(ids(x.r) === 'cinq-cartes' && C.skins(st).jetons.find((s) => s.id === 'nacre').debloque, 'Cinq cartes : 2 + 3 + 4 + 5 + 7 = 21 ; les jetons de nacre');
  x = main(st, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦', ['separer', 'tirer', 'rester']); check(ids(x.r) === 'partage' && C.skins(st).dos.find((s) => s.id === 'fournil').debloque, 'Coupé en deux : les deux mains d’un partage gagnées ; le dos « Le Fournil »');
  x = main(st, '6♠ 10♥ 5♦ 7♣ R♦', ['doubler']); check(ids(x.r) === 'double' && C.skins(st).croupier.find((s) => s.id === 'smoking').debloque, 'Quitte ou double : une main doublée gagnée ; le smoking du croupier');
  x = main(st, '7♠ 9♣ 7♠ 10♣', ['rester'], 100, { paires: 1 }); check(ids(x.r) === 'paire-parfaite' && C.skins(st).tapis.find((s) => s.id === 'bleu-nuit').debloque, 'Paire parfaite : 7♠ 7♠ aux Perfect Pairs (même perdue au tapis) ; le tapis bleu nuit');
  let y = tour(st, [{ type: 'plein', n: 17, mise: 1 }], 17); check(ids(y.r) === 'plein' && C.skins(st).roue.find((s) => s.id === 'ebene').debloque, 'Plein ! : le 17 au plein ; la roulette d’ébène');
  y = tour(st, [{ type: 'plein', n: 0, mise: 1 }], 0); check(ids(y.r) === 'zero' && C.skins(st).roue.find((s) => s.id === 'or').debloque, 'Le zéro : un plein sur le 0 ; la roulette dorée');
  const avant = C.trophees(st).filter((t) => t.gagne).length;
  x = main(st, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦', ['separer', 'tirer', 'rester']); check(x.r.trophees.length === 0 && C.trophees(st).filter((t) => t.gagne).length === avant, 'un trophée se gagne une fois : refaire le coup ne redonne rien');
  check(C.trophees(st).every((t) => t.gagne === 0 || t.gagne === T0) && C.trophees(st).length === 11, 'C.trophees : les 11, avec l’instant où chacun a été gagné (0 : à gagner)'); }
{ const st = boutique(1e6); B.etat(st).stats.mains = 60; R.etat(st).stats.tours = 38;
  let y = tour(st, [{ type: 'rouge', mise: 1 }], 2); check(!C.trophees(st).find((t) => t.id === 'habitue').gagne, '99 mains et tours : pas encore');
  y = tour(st, [{ type: 'rouge', mise: 1 }], 2); check(ids(y.r) === 'habitue' && C.skins(st).croupier.find((s) => s.id === 'canotier').debloque, 'Habitué du tapis : 100 mains et tours en tout ; le canotier'); }
{ const st = boutique(1e6); const c = C.etat(st);
  for (let k = 0; k < 9; k++) if (k % 2) main(st, '10♠ 10♥ 9♦ 7♣', ['rester']); else tour(st, [{ type: 'rouge', mise: 1 }], 1);
  main(st, '10♠ 10♥ 8♦ 8♣', ['rester']); tour(st, [{ type: 'rouge', mise: 1 }, { type: 'noir', mise: 1 }], 1);
  check(c.serie === 9 && !(st.distinctions || []).includes('main-de-velours'), '9 victoires (BlackJack et roulette mêlés), deux égalités au milieu : la série tient à 9');
  const y = tour(st, [{ type: 'impair', mise: 1 }], 3);
  check(ids(y.r) === 'serie-10' && G.distinctions(st).includes('main-de-velours') && (st.carnetEv || []).some((e) => /Main de velours/.test(e.txt)), 'Main de velours : la 10e victoire de suite ; le titre donné (GAME.donnerDistinction)');
  tour(st, [{ type: 'rouge', mise: 1 }], 0); check(c.serie === 0 && c.meilleureSerie === 10, 'une défaite casse la série ; la meilleure reste 10'); }
{ const st = boutique(1e6); const c = C.etat(st); c.serie = 9;
  const x = C.apresTour(st, R.lancer(st, [{ type: 'rouge', mise: 1 }], sur(1)).tour, { maintenant: T0, jour: JOUR });
  check(ids(x) === 'serie-10' && !(st.distinctions || []).includes('main-de-velours'), 'sans GAME sous la main : le trophée est noté, le titre attend');
  main(st, '10♠ 10♥ 7♦ 9♣', ['rester']); check(G.distinctions(st).includes('main-de-velours'), 'le titre est rendu à la main suivante'); }
{ const st = boutique(1e6); const c = C.etat(st); c.faits = 9; poser(st, [['tours', 1], ['mains', 9], ['gagnees', 9]]);
  const y = tour(st, [{ type: 'rouge', mise: 10000 }], 2); check(ids(y.r) === 'assidu' && c.faits === 10 && C.skins(st).tapis.find((s) => s.id === 'noir-or').debloque, 'Assidu de l’arrière-salle : le 10e mini-objectif réussi ; le tapis noir et or'); }
{ const st = boutique(1e6), t = { numero: 4, mises: [{ type: 'rouge', mise: 1, gagne: false, gain: 0 }], mise: 1, gain: 0, net: -1, caisse: 1e6 };
  const a = C.apresTour(st, t, opts()), b = C.apresTour(st, t, opts()); check(t.compte === true && JSON.stringify(b) === JSON.stringify({ trophees: [], objectifs: [], jetons: 0 }), 'apresTour est idempotent (tour.compte)');
  empiler(st, '10♠ 10♥ 9♦ 7♣'); B.distribuer(st, { main: 100 }); const h = B.etat(st).main;
  check(C.apresMain(st, h, opts()).trophees.length === 0 && !h.compte, 'une main pas finie : rien de compté (et compte reste absent)');
  B.rester(st); const r1 = C.apresMain(st, h, opts()), cliche = JSON.stringify(st.arriere.casino), r2 = C.apresMain(st, h, opts());
  check(ids(r1) === 'premiere-main' && h.compte === true && r2.trophees.length === 0 && r2.objectifs.length === 0 && JSON.stringify(st.arriere.casino) === cliche, 'apresMain est idempotent (h.compte) : la même main, deux fois, comptée une seule');
  check(C.apresMain(st, null, opts()).jetons === 0 && C.apresTour(st, { numero: 'x' }, opts()).jetons === 0 && C.apresMain(st, { fin: true }, opts()).trophees.length === 0, 'une main ou un tour absurde : rien'); }

console.log('── les mini-objectifs : le tirage du jour ──');
{ const st = boutique(1e6, 10), o1 = C.objectifs(st, JOUR).map((o) => o.type).join(), st2 = boutique(1e6, 10); st2.created = st.created;
  check(C.objectifs(st2, JOUR).map((o) => o.type).join() === o1, 'le même jour et la même partie : les mêmes trois objectifs (sur tous les appareils)');
  let differents = 0, bjRo = 0, serieAvant9 = 0, serieApres = 0, distincts = 0;
  for (let d = 0; d < 200; d++) {
    const jour = G.dayKey(T0 + d * 864e5), s = boutique(1, 1 + (d % 30)); s.created = st.created; const os = C.objectifs(s, jour), types = os.map((o) => o.type);
    if (types.join() !== o1) differents++;
    if (C.TYPES[types[0]].jeu === 'blackjack' && C.TYPES[types[1]].jeu === 'roulette') bjRo++;
    if (new Set(types).size === 3 && os.length === 3) distincts++;
    if (types.includes('serie')) { if (s.boutiques < 9) serieAvant9++; else serieApres++; }
  }
  check(differents > 150 && distincts === 200 && bjRo === 200, `200 jours : trois objectifs différents chaque jour, un du BlackJack et un de la roulette ; ils changent d’un jour à l’autre (${differents}/200)`);
  check(serieAvant9 === 0 && serieApres > 0, `l’objectif « 3 victoires de suite » seulement dès la boutique n°9 (${serieApres} fois)`);
  const autre = boutique(1e6, 10); autre.created = st.created + 1; let pareil = 0; for (let d = 0; d < 50; d++) { const j = G.dayKey(T0 + d * 864e5); const a = boutique(1, 10), b = boutique(1, 10); a.created = st.created; b.created = autre.created; if (C.objectifs(a, j).map((o) => o.type).join() === C.objectifs(b, j).map((o) => o.type).join()) pareil++; }
  check(pareil < 25, `deux parties différentes n’ont pas les mêmes objectifs (pareils ${pareil} jours sur 50)`); }
{ const st = boutique(1e6); const avantMinuit = Date.UTC(2026, 9, 22, 21, 59), apresMinuit = Date.UTC(2026, 9, 22, 22, 1); // minuit à Paris (UTC+2 en octobre)
  const j1 = G.dayKey(avantMinuit), j2 = G.dayKey(apresMinuit); C.objectifs(st, j1); const c = C.etat(st); c.objectifs[0].progres = 1; c.jetonsJour = 3;
  check(j1 !== j2 && C.objectifs(st, j1)[0].progres === 1, `le même jour (${j1}) : les objectifs gardent leur progression`);
  const o2 = C.objectifs(st, j2); check(c.jour === j2 && o2.every((o) => o.progres === 0 && !o.fait) && c.jetonsJour === 0 && o2[0].id.startsWith(j2), `minuit à Paris passé (${j2}) : trois objectifs neufs, les jetons du jour remis à zéro`);
  const st3 = boutique(1e6); empiler(st3, '10♠ 10♥ 9♦ 7♣'); B.distribuer(st3, { main: 100 }); B.rester(st3); C.apresMain(st3, B.etat(st3).main, { maintenant: apresMinuit, G });
  check(C.etat(st3).jour === j2, 'apresMain sans jour : le jour est pris de GAME.dayKey(maintenant)'); }
{ const cibles = (b) => { const s = boutique(1, b); return ['mains', 'tours', 'gagnees', 'couleur', 'douzaine', 'blackjack', 'serie'].map((t) => C.TYPES[t].cible(C.palier(s))).join(); };
  check(C.palier(boutique(1, 1)) === 0 && C.palier(boutique(1, 4)) === 0 && C.palier(boutique(1, 5)) === 1 && C.palier(boutique(1, 9)) === 2 && C.palier(boutique(1, 21)) === 5 && C.palier(boutique(1, 300)) === 5 && C.palier({}) === 0, 'le palier : min(5, ⌊(boutique − 1) / 4⌋)');
  check(cibles(1) === '5,5,3,2,1,1,3' && cibles(9) === '9,9,5,4,2,1,3' && cibles(21) === '15,15,8,7,3,1,3', `la difficulté suit la boutique : n°1 ${cibles(1)} ; n°9 ${cibles(9)} ; n°21 et plus ${cibles(21)}`);
  const s = boutique(1, 9); s.created = 7; const o = C.objectifs(s, JOUR); check(o.every((x) => x.cible === C.TYPES[x.type].cible(2) && /\d|un|une|Sépare|Fais/.test(x.txt)), 'les objectifs tirés portent la cible de leur palier et un texte'); }

console.log('── les mini-objectifs : la mise à 0,5 % de la caisse, jamais plus ──');
{ const st = boutique(100000); const c = poser(st, [['mains', 3], ['tours', 3], ['gagnees', 2]]);
  main(st, '10♠ 10♥ 9♦ 7♣', ['rester'], 400); check(c.objectifs[0].progres === 0 && c.objectifs[2].progres === 0, '400 € sur 100 000 (0,4 %) : la main ne compte pas');
  const caisse = st.coins; main(st, '10♠ 10♥ 9♦ 7♣', ['rester'], caisse * 0.005); check(c.objectifs[0].progres === 1 && c.objectifs[2].progres === 1, '0,5 % de la caisse tout juste : la main compte (jouée, gagnée)');
  main(st, '10♠ 10♥ 7♦ 9♣', ['rester'], 1e9); check(c.objectifs[0].progres === 2 && c.objectifs[2].progres === 1, 'le tapis compte comme une autre main (perdue : « gagne » n’avance pas)');
  check(C.seuil(100) === 1 && C.seuil(1e6) === 5000 && C.seuil(NaN) === Infinity && C.PART_MIN === 0.005, 'le seuil : 0,5 % de la caisse, au moins 1 € (100 € de caisse : 1 €)');
  const s2 = boutique(80); const c2 = poser(s2, [['mains', 3], ['tours', 3], ['couleur', 3]]); main(s2, '10♠ 10♥ 9♦ 7♣', ['rester'], 1); tour(s2, [{ type: 'rouge', mise: 1 }], 1);
  check(c2.objectifs[0].progres === 1 && c2.objectifs[1].progres === 1 && c2.objectifs[2].progres === 1, 'une petite caisse (80 €) : 1 € suffit');
  const s3 = boutique(1e6); const c3 = poser(s3, [['separer', 1], ['doubler', 1], ['blackjack', 1]]);
  main(s3, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦', ['separer', 'tirer', 'rester'], 2500); check(!c3.objectifs[0].fait, 'un partage à 2 500 € (0,25 % de 1 000 000) : ne compte pas');
  main(s3, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦', ['separer', 'tirer', 'rester'], 6000); check(c3.objectifs[0].fait, 'Sépare une paire : 6 000 € au départ (0,6 %), compté par la mise de départ (pas par le total des deux mains)');
  main(s3, '6♠ 10♥ 5♦ 7♣ R♦', ['doubler'], 2500); check(!c3.objectifs[1].fait, 'un double à 2 × 2 500 € : la mise de départ (0,25 %) ne compte pas');
  main(s3, '6♠ 10♥ 5♦ 7♣ R♦', ['doubler'], 6000); main(s3, 'A♠ 9♥ R♦ 7♣', [], 6000); check(c3.objectifs[1].fait && c3.objectifs[2].fait && c3.objectifs.every((o) => o.fait), 'Gagne une main doublée, Fais un BlackJack : comptés à 0,5 %'); }
{ const st = boutique(1e6); const c = poser(st, [['couleur', 2], ['douzaine', 2], ['tours', 2]]);
  tour(st, [{ type: 'rouge', mise: 1 }, { type: 'plein', n: 1, mise: 5000 }], 1); check(c.objectifs[0].progres === 0 && c.objectifs[2].progres === 1, 'gagner sur rouge avec 1 € (le tour, lui, compte) : « couleur » n’avance pas, la mise gagnante doit atteindre 0,5 %');
  tour(st, [{ type: 'noir', mise: 6000 }, { type: 'colonne', k: 2, mise: 6000 }], 2); check(c.objectifs[0].progres === 1 && c.objectifs[1].progres === 1 && c.objectifs[2].fait, 'noir et colonne 2 gagnés à 0,6 % : « couleur » et « douzaine » avancent');
  tour(st, [{ type: 'douzaine', k: 3, mise: 6000 }], 1); check(c.objectifs[1].progres === 1, 'une douzaine perdue : rien'); }
{ const st = boutique(1e6, 9); const c = poser(st, [['serie', 3], ['mains', 99], ['tours', 99]]);
  main(st, '10♠ 10♥ 9♦ 7♣', ['rester'], 10000); tour(st, [{ type: 'rouge', mise: 10000 }], 1); tour(st, [{ type: 'rouge', mise: 1 }], 2);
  check(c.objectifs[0].progres === 2, 'la série de l’objectif : deux victoires qui comptent ; une défaite à 1 € ne la casse pas (elle ne compte pas)');
  tour(st, [{ type: 'rouge', mise: 10000 }], 2); check(c.objectifs[0].progres === 0, 'une défaite qui compte la casse');
  for (let k = 0; k < 3; k++) tour(st, [{ type: 'rouge', mise: 10000 }], 1); check(c.objectifs[0].fait, 'trois victoires de suite qui comptent : réussi'); }

console.log('── les jetons d’or : 1 par objectif, +1 pour les trois, 4 au plus par jour ──');
{ const st = boutique(1e6); const c = poser(st, [['tours', 1], ['tours', 2], ['tours', 3]]);
  const a = tour(st, [{ type: 'rouge', mise: 5000 }], 2).r; check(a.jetons === 1 && a.objectifs.some((o) => o.nouveau && o.fait) && c.jetonsOr === 1 && c.faits === 1, '1er objectif : 1 jeton d’or (le toast : nouveau)');
  tour(st, [{ type: 'rouge', mise: 5000 }], 2); const b = tour(st, [{ type: 'rouge', mise: 5000 }], 2).r;
  check(b.jetons === 2 && c.jetonsOr === 4 && c.jetonsJour === 4 && c.faits === 3, 'le 3e : 1 + 1 pour les trois = 4 jetons d’or dans la journée');
  c.objectifs.forEach((o) => { o.fait = false; o.progres = 0; }); for (let k = 0; k < 5; k++) tour(st, [{ type: 'rouge', mise: 5000 }], 2);
  check(c.jetonsOr === 4 && c.jetonsJour === C.JETONS_JOUR_MAX, 'même trois objectifs de plus le même jour : 4 jetons d’or au plus');
  const demain = T0 + 864e5; C.objectifs(st, G.dayKey(demain)); check(c.jetonsJour === 0 && c.jetonsOr === 4, 'le lendemain : le compteur du jour repart, les jetons gagnés restent'); }
{ // un mois de jeu acharné : jamais plus de 4 jetons par jour
  const st = boutique(1e12, 30); const c = C.etat(st); let max = 0;
  for (let d = 0; d < 30; d++) { const t = T0 + d * 864e5, avant = c.jetonsOr;
    for (let k = 0; k < 60; k++) { const x = R.lancer(st, [{ type: ['rouge', 'douzaine', 'colonne'][k % 3], k: 1 + (k % 3), mise: st.coins * 0.01 }]); C.apresTour(st, x.tour, opts(t));
      const r = B.distribuer(st, { main: st.coins * 0.01 }); if (r.ok) { let g = 0; while (B.enCours(st) && g++ < 20) { const kk = B.conseil(st); B[kk.coup](st); } C.apresMain(st, B.etat(st).main, opts(t)); } }
    max = Math.max(max, c.jetonsOr - avant); }
  check(max <= 4 && c.jetonsOr <= 120 && c.faits >= 30, `30 jours de jeu acharné (60 mains et 60 tours par jour) : ${c.jetonsOr} jetons d’or, ${max} au plus en un jour, ${c.faits} objectifs réussis`); }

console.log('── les skins : acheter, choisir, refuser ──');
{ const st = boutique(1e6); const c = C.etat(st);
  check(Object.entries(C.DEFAUTS).every(([cat, id]) => C.skinChoisi(st, cat) === id) && C.skinChoisi(st, 'x') === null, 'une partie neuve : les skins de base (feutre vert, dos classique, jetons classiques, roulette acajou, gilet)');
  let r = C.acheterSkin(st, 'prune'); check(!r.ok && r.raison === 'jetons' && r.jetonsOr === 0, 'pas assez de jetons d’or : refusé');
  c.jetonsOr = 20; r = C.acheterSkin(st, 'prune'); check(r.ok && r.jetonsOr === 14 && C.skins(st).tapis.find((s) => s.id === 'prune').debloque, 'le tapis prune : 6 jetons d’or');
  r = C.acheterSkin(st, 'prune'); check(!r.ok && r.raison === 'deja' && c.jetonsOr === 14, 'déjà débloqué : rien n’est repris');
  check(C.acheterSkin(st, 'bordeaux').raison === 'trophee' && C.acheterSkin(st, 'dos:fournil').raison === 'trophee' && C.acheterSkin(st, 'licorne').raison === 'inconnu' && C.acheterSkin(st, 42).raison === 'inconnu' && C.acheterSkin(st, 'vert').raison === 'deja', 'un skin de trophée ne s’achète pas ; un inconnu non plus ; celui de base est déjà là');
  r = C.acheterSkin(st, 'fournil'); check(r.ok && r.categorie === 'roue' && c.jetonsOr === 9 && C.skins(st).roue.find((s) => s.id === 'fournil').debloque && !C.skins(st).dos.find((s) => s.id === 'fournil').debloque, '« fournil » seul : la finition de roulette à 5 jetons (le dos du même nom reste un trophée)');
  check(C.acheterSkin(st, 'damier', 'dos').ok && C.acheterSkin(st, 'jetons:pastel').ok && c.jetonsOr === 0 && C.acheterSkin(st, 'tablier').raison === 'jetons', 'damier 5, pastel 4 ; plus de jetons pour le tablier');
  check(C.choisirSkin(st, 'tapis', 'prune').ok && C.skinChoisi(st, 'tapis') === 'prune' && C.skins(st).tapis.find((s) => s.choisi).id === 'prune', 'choisir le tapis prune');
  check(C.choisirSkin(st, 'tapis', 'noir-or').raison === 'verrou' && C.choisirSkin(st, 'roue', 'ebene').raison === 'verrou' && C.skinChoisi(st, 'tapis') === 'prune', 'un skin pas débloqué : verrouillé');
  check(C.choisirSkin(st, 'tapis', 'licorne').raison === 'inconnu' && C.choisirSkin(st, 'chapeau', 'vert').raison === 'inconnu' && C.choisirSkin(st, 'dos', 'prune').raison === 'inconnu', 'une catégorie ou un skin inconnu : refusé');
  check(C.choisirSkin(st, 'tapis', 'vert').ok && C.choisirSkin(st, 'roue', 'fournil').ok && C.skinChoisi(st, 'roue') === 'fournil', 'revenir au tapis de base, choisir la roulette « Le Fournil »');
  const sk = C.skins(st); check(C.CATEGORIES.every((cat) => sk[cat].filter((s) => s.choisi).length === 1 && sk[cat].every((s) => typeof s.debloque === 'boolean' && Number.isFinite(s.prix))), 'C.skins : chaque catégorie, un seul choisi'); }

console.log('── une vieille sauvegarde ──');
{ const st = boutique(1000); delete st.arriere; const c = C.etat(st);
  check(c.v === 1 && Object.keys(c.trophees).length === 0 && c.objectifs.length === 0 && c.jetonsOr === 0 && c.skins.debloques.length === 0 && C.skinChoisi(st, 'tapis') === 'vert', 'sans arrière-salle : un casino neuf');
  const s2 = boutique(1000); s2.arriere = { trouvee: true, sabot: [], stats: { mains: 40, gagnees: 20, perdues: 18, egalites: 2, blackjacks: 2, annexes: 0, plusGrosGain: 150, solde: 80 } };
  const S = C.stats(s2); check(S.blackjack.mains === 40 && S.blackjack.solde === 80 && S.blackjack.serie === 0 && S.blackjack.separees === 0 && S.roulette.tours === 0 && S.roulette.pleins === 0, 'une sauvegarde d’avant le lot 7 : les statistiques BlackJack gardées, les nouvelles à zéro, la roulette à zéro');
  C.objectifs(s2, JOUR); check(s2.arriere.trouvee === true && s2.arriere.stats.mains === 40 && s2.arriere.casino.objectifs.length === 3, 'le casino s’ajoute sans rien effacer');
  s2.arriere.casino = { trophees: { plein: T0, licorne: 5, zero: 'x' }, objectifs: [{ type: 'x' }], faits: -3, jetonsOr: NaN, skins: { debloques: ['roue:ebene', 'tapis:vert', 'licorne', 'roue:or', 7], choisis: { tapis: 'noir-or', roue: 'ebene', chapeau: 'x' } } };
  const c2 = C.etat(s2);
  check(Object.keys(c2.trophees).join() === 'plein' && c2.objectifs.length === 0 && c2.faits === 0 && c2.jetonsOr === 0 && c2.skins.debloques.join() === 'roue:ebene,roue:or' && c2.skins.choisis.tapis === 'vert' && c2.skins.choisis.roue === 'ebene' && !('chapeau' in c2.skins.choisis),
    'un casino abîmé : trophées inconnus retirés, objectifs re-tirés, compteurs à zéro, skins inconnus retirés, un skin choisi verrouillé rendu à la base'); }

console.log('── les statistiques, BlackJack et roulette à part ──');
{ const st = boutique(1e6);
  main(st, '10♠ 10♥ 9♦ 7♣', ['rester']); main(st, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦', ['separer', 'tirer', 'rester']); main(st, '6♠ 10♥ 5♦ 7♣ R♦', ['doubler']); main(st, '10♠ 10♥ 7♦ 9♣', ['rester']); main(st, 'A♠ 9♥ R♦ 7♣');
  tour(st, [{ type: 'plein', n: 5, mise: 10 }], 5); tour(st, [{ type: 'rouge', mise: 10 }], 0);
  const S = C.stats(st);
  check(S.blackjack.mains === 5 && S.blackjack.gagnees === 4 && S.blackjack.perdues === 1 && S.blackjack.separees === 1 && S.blackjack.doubles === 1 && S.blackjack.blackjacks === 1 && S.blackjack.meilleureSerie === 3 && S.blackjack.serie === 1 && Object.keys(S.blackjack).length === 11,
    `BlackJack : 5 mains, 4 gagnées, 1 perdue, 1 partage, 1 double, 1 BlackJack, meilleure série 3 (${JSON.stringify(S.blackjack)})`);
  check(S.roulette.tours === 2 && S.roulette.gagnes === 1 && S.roulette.perdus === 1 && S.roulette.pleins === 1 && S.roulette.plusGrosGain === 350 && S.roulette.solde === 340 && Object.keys(S.roulette).length === 9, `roulette : 2 tours, un plein (+350), un zéro (−10) (${JSON.stringify(S.roulette)})`);
  check(Object.keys(C.stats({})).join() === 'blackjack,roulette' && C.stats({}).blackjack.mains === 0, 'sans arrière-salle : des zéros'); }

console.log('── l’économie : seuls st.coins, st.arriere et st.distinctions bougent ──');
{ const st = boutique(1e9, 12); G.objectifsDuJour(st, T0); st.distinctions = []; st.carnetEv = st.carnetEv || [];
  const autour = (s) => JSON.stringify(Object.assign({}, s, { coins: 0, arriere: 0, distinctions: 0, carnetEv: 0 }));
  const avant = autour(st), carnet = st.carnetEv.length, pts = JSON.stringify(G.detailPoints(st)), fortune = [st.lifetime, st.lifetimeRun, st.etoiles].join();
  let x = 0x2545F491; const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const C2 = ['rouge', 'noir', 'pair', 'impair', 'manque', 'passe', 'douzaine', 'colonne', 'plein'];
  for (let k = 0; k < 10000; k++) {
    const t = T0 + Math.floor(k / 400) * 864e5, a = r();
    if (a < 0.4) { if (!B.enCours(st)) B.distribuer(st, { main: Math.max(1, st.coins * (r() < 0.05 ? 1 : r() * 0.02)), paires: r() < 0.2 ? 5 : 0, plus3: r() < 0.2 ? 5 : 0 });
      else { const kk = B.conseil(st), coups = ['tirer', 'rester', 'doubler', 'separer']; B[r() < 0.7 ? kk.coup : coups[Math.floor(r() * 4)]](st); }
      if (B.etat(st).main && B.etat(st).main.fin) C.apresMain(st, B.etat(st).main, opts(t)); }
    else if (a < 0.8) { const ty = C2[Math.floor(r() * C2.length)], y = R.lancer(st, [{ type: ty, k: 1 + Math.floor(r() * 3), n: Math.floor(r() * 37), mise: Math.max(1, st.coins * r() * 0.02) }]); if (y.ok) C.apresTour(st, y.tour, opts(t)); }
    else if (a < 0.9) { const cat = C.CATEGORIES[Math.floor(r() * 5)], l = C.SKINS[cat], s = l[Math.floor(r() * l.length)]; if (r() < 0.5) C.acheterSkin(st, s.id, cat); else C.choisirSkin(st, cat, s.id); }
    else { C.objectifs(st, G.dayKey(t)); C.trophees(st); C.stats(st); C.skins(st); if (r() < 0.1) C.apresMain(st, B.etat(st).main, opts(t)); }
    if (st.coins < 1000) st.coins = 1e9; // la caisse renflouée (le test ne regarde pas le bilan, seulement ce qui bouge)
  }
  const ajout = st.carnetEv.slice(carnet);
  check(autour(st) === avant, '10 000 actions au hasard (mains, partages, doubles, tours, objectifs, trophées, skins) : tout l’état de la partie, hors st.coins, st.arriere et st.distinctions, à l’identique');
  check([st.lifetime, st.lifetimeRun, st.etoiles].join() === fortune && JSON.stringify(G.detailPoints(st)) === pts, 'la fortune (lifetime, lifetimeRun), les étoiles et les points de boulanger : inchangés');
  check(ajout.every((e) => /Main de velours/.test(e.txt)) && (st.distinctions || []).every((d) => d === 'main-de-velours'), `le carnet ne reçoit que la ligne du titre (${ajout.length}), et st.distinctions seulement « Main de velours »`);
  const c = C.etat(st); check(Object.keys(c.trophees).length >= 8 && c.jetonsOr >= 0 && c.faits > 0, `${Object.keys(c.trophees).length} trophées, ${c.faits} objectifs réussis, ${c.jetonsOr} jetons d’or : rien d’autre que du cosmétique`);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'casino.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check(!/coins|lifetime|etoiles|gagner\(|noter\(|\.xp\b|\bpoints\b|objectifsDuJour|Date\.now|new Date/.test(src), 'src/casino.js ne touche ni st.coins, ni la fortune, ni les étoiles, ni les points ; ne lit pas l’heure'); }

console.log(`\n${n - fails}/${n} ${fails ? 'ÉCHECS : ' + fails : 'tout est vert'}`);
process.exit(fails ? 1 : 0);
