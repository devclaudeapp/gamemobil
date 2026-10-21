#!/usr/bin/env node
// Le Fournil : les points de boulanger (src/game.js), ce que classe le classement en ligne.
// 1. Le barème, règle par règle : journée complète 10, défi de la semaine 30, événements 2 chacun (20 au plus par jour), Atelier
//    (meilleur score de la semaine de chaque mini-jeu → 0 à 20), améliorations (1 point par tranche d'achats valant 10 min de ses
//    propres gains, + 5 par palier ×2 franchi, 30 au plus par jour) ; jours et semaines à l'heure de Paris ; sauvegardes abîmées ;
//    triche par la console bornée par les plafonds.
// 2. L'équité : un débutant et un joueur en fin de boutique 3 qui jouent pareil (mêmes sessions, mêmes décisions : test/longevite.js)
//    marquent à peu près autant, sur quatre semaines de l'année et pour les trois profils.
// Lancer : TZ=Europe/Paris node test/fournil-points.test.js
'use strict';
const G = require('../src/game.js');
const LG = require('./longevite.js');
let n = 0, fails = 0;
const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const titre = (t) => console.log(`── ${t} ──`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const H = 3600e3, LUNDI = Date.UTC(2026, 9, 11, 22); // lundi 12 octobre 2026, minuit à Paris (heure d'été)
const P = G.POINTS;

// une boutique jouable : quelques recettes, deux apprentis, un rythme connu
function boutique(t) {
  const st = G.newState(t); st.now = t;
  st.stations[0].niv = 30; st.stations[0].staff = true; st.stations[1].niv = 10; st.stations[1].staff = true; st.stations[2].niv = 1;
  G.objectifsDuJour(st, t);
  return st;
}

titre('le barème');
check(P.journee === 10 && P.defi === 30 && P.evenement === 2 && P.evenementsJour === 20 && P.atelier === 20 && P.tranche === 600 && P.palier === 5 && P.ameliorationsJour === 30, 'les chiffres du barème : 10, 30, 2 (20/jour), Atelier 20 par mini-jeu, 10 min de gains par point, +5 par palier, 30/jour');
check(P.jour === 60 && P.semaine === 510, `au plus ${P.jour} points par jour et ${P.semaine} par semaine (7 × 60 + 30 + 3 × 20)`);
{ const st = G.newState(LUNDI + 9 * H); const d = G.detailPoints(st);
  check(d.total === 0 && d.cumul === 0 && d.semaine === '2026-10-12' && d.jour === '2026-10-12' && d.atelier.length === 3 && d.atelier.every((a) => a.points === 0), 'une partie neuve : 0 point, semaine du lundi 12 octobre'); }

titre('journée complète : 10 points, une fois par jour');
{ const t = LUNDI + 10 * H, st = boutique(t);
  st.jour.objectifs.forEach((o) => { o.fait = true; o.progres = o.cible; });
  const r1 = G.reclamer(st, 0), r2 = G.reclamer(st, 1), r3 = G.reclamer(st, 2);
  check(r1.points === 0 && r2.points === 0 && r3.points === 10 && r3.etoile && G.pointsSemaine(st) === 10, `les deux premiers objectifs ne marquent rien, le troisième fait la journée : +10 (${G.pointsSemaine(st)})`);
  st.jour.etoileDonnee = false; // une étoile qui se redonnerait (sauvegarde bricolée) ne remarque pas la journée
  st.jour.objectifs.forEach((o) => { o.reclame = false; }); G.reclamer(st, 0); G.reclamer(st, 1); G.reclamer(st, 2);
  check(G.pointsSemaine(st) === 10, 'la même journée ne compte qu’une fois');
  st.now = LUNDI + 34 * H; G.objectifsDuJour(st, st.now); st.jour.objectifs.forEach((o) => { o.fait = true; });
  [0, 1, 2].forEach((k) => G.reclamer(st, k));
  check(G.pointsSemaine(st) === 20 && G.detailPoints(st).journees === 20, 'le lendemain : encore 10 (20 dans la semaine)'); }

titre('défi de la semaine : 30 points');
{ const st = boutique(LUNDI + 10 * H); st.semaine.fait = true;
  const r = G.reclamerSemaine(st), r2 = G.reclamerSemaine(st);
  check(r.ok && !r2.ok && G.pointsSemaine(st) === 30 && G.detailPoints(st).defi === 30, 'réclamé : +30, une fois');
  G.marquerDefi(st); check(G.pointsSemaine(st) === 30, 'marqué deux fois (console) : toujours 30'); }

titre('événements réussis : 2 chacun, 20 au plus par jour');
{ const st = boutique(LUNDI + 11 * H), rnd = () => 0.3;
  G.lancerPetrissage(st); for (let k = 0; k < G.PETRISSAGE.n; k++) G.petrir(st);
  check(G.pointsSemaine(st) === 2, 'pétrissage gagné : +2');
  G.lancerPetrissage(st); for (let k = 0; k < 5; k++) G.petrir(st); st.ev = null;
  check(G.pointsSemaine(st) === 2, 'pétrissage abandonné : rien');
  G.lancerCommande(st, rnd); st.ev.fait = st.ev.n; G.livrer(st);
  check(G.pointsSemaine(st) === 4, 'commande livrée : +2');
  G.lancerPanne(st, rnd); for (let k = 0; k < G.PANNE.n; k++) G.reparer(st);
  check(G.pointsSemaine(st) === 6, 'four réparé : +2');
  st.stations[3].niv = 1; st.stations[2].niv = 2; G.lancerCritique(st, rnd); [...st.ev.restants].forEach((i) => G.servir(st, i));
  check(G.pointsSemaine(st) === 8, 'bonne critique : +2');
  G.encaisserPourboire(st);
  check(G.pointsSemaine(st) === 10, 'client mystère (pourboire) : +2');
  G.lancerRush(st); G.lancerMeunier(st); G.lancerAnniversaire(st, rnd);
  check(G.pointsSemaine(st) === 10, 'coup de feu, meunier, anniversaire (rien à réussir) : rien');
  for (let k = 0; k < 30; k++) G.encaisserPourboire(st);
  check(G.detailPoints(st).evenements === 20 && G.detailPoints(st).aujourdhui.evenements === 20, `trente pourboires de plus : plafonné à 20 dans la journée (${G.detailPoints(st).evenements})`);
  st.now = LUNDI + 24 * H + 60e3; G.encaisserPourboire(st);
  check(G.detailPoints(st).evenements === 22 && G.detailPoints(st).aujourdhui.evenements === 2, 'minuit passé à Paris : le plafond repart (22 dans la semaine)'); }

titre('Atelier : le meilleur score de la semaine de chaque mini-jeu → 0 à 20');
{ const st = boutique(LUNDI + 12 * H);
  check(G.JEUX_ATELIER.every((j) => G.pointsAtelier(j.id, j.plein) === 20 && G.pointsAtelier(j.id, j.max) === 20 && G.pointsAtelier(j.id, 0) === 0 && G.pointsAtelier(j.id, j.plein / 2) === 10), 'au score « plein » du jeu (game.js) : 20 ; au-delà, 20 ; à mi-chemin, 10 ; à zéro, 0');
  check(G.pointsAtelier('inconnu', 1e9) === 0 && G.pointsAtelier('four', NaN) === 0 && G.pointsAtelier('four', -5) === 0, 'un jeu inconnu, un score absurde : 0');
  let r = G.finirAtelier(st, 'four', 225);
  check(r.points === 10 && G.pointsSemaine(st) === 10, `enfournement à 225 (plein 450) : +10 (${r.points})`);
  r = G.finirAtelier(st, 'four', 100);
  check(r.points === 0 && G.pointsSemaine(st) === 10, 'une partie moins bonne ne retire rien');
  for (let k = 0; k < 4; k++) G.finirAtelier(st, 'memoire', 25);
  check(G.atelierDuJour(st).payees.memoire === 3 && G.detailPoints(st).atelier.find((a) => a.id === 'memoire').points === 20 && G.pointsSemaine(st) === 30, 'mémoire au score plein, quatre fois (la quatrième ne paie plus) : 20 points, pas 80');
  G.finirAtelier(st, 'four', 20000); G.finirAtelier(st, 'faconnage', 300);
  check(G.pointsSemaine(st) === 60, 'les trois mini-jeux au plus haut : 60 points d’Atelier, pas plus');
  st.now = LUNDI + 7 * 24 * H + H; G.finirAtelier(st, 'four', 45);
  check(G.pointsSemaine(st) === 2 && G.atelierDuJour(st).records.four === 20000, 'lundi suivant : les meilleurs scores de la semaine repartent de zéro (les records, eux, restent)'); }

titre('améliorations : 1 point par tranche de 10 min de ses propres gains, + 5 par palier, 30 au plus par jour');
{ const st = boutique(LUNDI + 13 * H), r = G.rythme(st);
  check(G.marquerAmelioration(st, r * 600, r, 0) === 1, 'un achat qui coûte 10 min de son rythme : 1 point');
  check(G.marquerAmelioration(st, r * 900, r, 0) === 1 && G.marquerAmelioration(st, r * 300, r, 0) === 1, '15 min puis 5 min : 1 puis 1 (les fractions s’ajoutent)');
  check(G.marquerAmelioration(st, r * 60, r, 2) === 10, 'deux paliers franchis : +10');
  check(G.marquerAmelioration(st, 1e30, r, 0) === 30 - 13 && G.detailPoints(st).aujourdhui.ameliorations === 30, 'un achat énorme : le reste du plafond du jour (30)');
  check(G.marquerAmelioration(st, r * 6000, r, 3) === 0, 'plafond atteint : plus rien aujourd’hui');
  st.now += 24 * H; check(G.marquerAmelioration(st, r * 1200, r, 0) === 2, 'le lendemain : ça repart');
  check(G.marquerAmelioration(st, NaN, r, 0) === 0 && G.marquerAmelioration(st, 100, 0, 0) === 0 && G.marquerAmelioration(st, -5, r, 0) === 0, 'prix ou rythme absurdes : rien'); }
{ // le même achat, relatif : une boutique 1000 fois plus riche paie 1000 fois plus pour les mêmes points
  const a = boutique(LUNDI + 14 * H), b = boutique(LUNDI + 14 * H); b.etoiles = 19980; // ×1000
  const ra = G.rythme(a), rb = G.rythme(b);
  check(Math.abs(rb / ra - 1000) < 1e-6 && G.marquerAmelioration(a, ra * 3000, ra, 0) === G.marquerAmelioration(b, rb * 3000, rb, 0), `rythme ×1000 (${G.fmtEur(ra)}/s → ${G.fmtEur(rb)}/s) : 50 min de ses gains valent 5 points pour l’un comme pour l’autre`); }
{ const st = boutique(LUNDI + 15 * H); st.coins = 1e12; st.mode = 1;
  const avant = G.detailPoints(st).ameliorations, r0 = G.rythme(st), prix = G.prixNiveaux(st, 1, 1);
  const res = G.acheter(st, 1);
  check(res.ok && res.points === Math.floor(prix / (r0 * 600)) && G.detailPoints(st).ameliorations === avant + res.points, `acheter un niveau : prix / rythme d’avant l’achat (${res.points} point)`);
  st.stations[0].niv = 24; st.mode = 1; const r24 = G.acheter(st, 0);
  check(r24.ok && r24.points >= 5, `passer le niveau 25 (palier ×2) : +5 au moins (${r24.points})`);
  const fresh = boutique(LUNDI + 15 * H); fresh.coins = 1e12; fresh.mode = 100; fresh.stations[0].niv = 1;
  const rf = G.rythme(fresh), rr = G.acheter(fresh, 0);
  check(rr.ok && rr.n === 100 && G.detailPoints(fresh).ameliorations === Math.min(30, 5 * 3 + Math.floor(rr.prix / (rf * 600))), `×100 d’un coup (niveaux 1 → 101, paliers 25, 50 et 100) : +15 de paliers, plafonné à 30 (${G.detailPoints(fresh).ameliorations})`); }
{ const st = boutique(LUNDI + 16 * H); st.coins = 1e15;
  const e = G.embaucher(st, 2), b = G.amelioration(st, 'farine'), m = G.ameliorerMeuble(st, 'tables');
  check(e.ok && b.ok && m.ok && [e, b, m].every((x) => Number.isInteger(x.points) && x.points >= 0) && G.detailPoints(st).ameliorations === e.points + b.points + m.points, `embauche, bonus, mobilier comptent aussi (${e.points} + ${b.points} + ${m.points})`);
  G.forcerRecette('citrouille'); G.saisonDuJour(st, st.now); const s = G.preparerSaison(st); G.forcerRecette(null);
  check(s.ok && Number.isInteger(s.points), `la recette de saison aussi (${s.points})`); }
{ const st = boutique(LUNDI + 17 * H); st.coins = 1e12; st.mode = 1; G.lancerMeunier(st);
  const r0 = G.rythme(st), plein = G.coutNiveaux(1, st.stations[1].niv, 1), res = G.acheter(st, 1);
  check(res.ok && Math.abs(res.prix - 0.6 * plein) < 1e-6 * plein, 'le meunier (−40 %) : le point se compte sur le prix payé'); void r0; }

titre('semaines et jours, heure de Paris');
{ const st = boutique(LUNDI + 20 * H); G.marquerDefi(st); G.marquerEvenement(st);
  st.now = LUNDI + 7 * 24 * H - 60e3; // dimanche 23 h 59 à Paris
  check(G.pointsSemaine(st) === 32, 'dimanche 23 h 59 : la semaine tient encore (32)');
  st.now = LUNDI + 7 * 24 * H + 60e3; // lundi 0 h 01
  const d = G.detailPoints(st);
  check(d.total === 0 && d.cumul === 32 && d.semaine === '2026-10-19' && d.semaines.length === 1 && d.semaines[0].semaine === '2026-10-12' && d.semaines[0].points === 32, 'lundi 0 h 01 : la semaine repart de 0, la précédente rejoint l’historique, le cumul garde 32');
  st.now = LUNDI + 3 * H; G.marquerEvenement(st);
  check(G.detailPoints(st).semaine === '2026-10-19' && G.pointsSemaine(st) === 2, 'une horloge qui recule (impossible avec l’horloge de confiance) ne refait pas naître une semaine finie'); }
{ // le passage à l'heure d'hiver : dimanche 25 octobre 2026 ; la semaine du lundi 26 commence à minuit, heure d'hiver (23 h UTC)
  const st = boutique(Date.UTC(2026, 9, 25, 22, 59)); G.marquerEvenement(st);
  check(G.detailPoints(st).semaine === '2026-10-19', 'dimanche 25 octobre, 23 h 59 heure d’hiver : encore la semaine du 19');
  st.now = Date.UTC(2026, 9, 25, 23, 1);
  check(G.detailPoints(st).semaine === '2026-10-26' && G.pointsSemaine(st) === 0, 'lundi 26, 0 h 01 heure d’hiver : nouvelle semaine'); }
{ const st = boutique(LUNDI + H);
  for (let w = 0; w < 15; w++) { st.now = LUNDI + w * 7 * 24 * H + H; G.marquerEvenement(st); }
  st.now += 7 * 24 * H; const d = G.detailPoints(st);
  check(d.semaines.length === 12 && d.cumul === 30, 'l’historique garde les 12 dernières semaines, le cumul garde tout'); }

titre('sauvegardes abîmées, anciennes sauvegardes, triche par la console');
{ const st = boutique(LUNDI + 9 * H); delete st.points;
  check(G.pointsSemaine(st) === 0 && G.detailPoints(st).semaine === '2026-10-12', 'une sauvegarde d’avant les points : le carnet se crée');
  st.points = { semaine: 'n’importe quoi', jour: 12, journees: '9999', evenements: -4, ameliorations: NaN, defi: 1e9, atelier: { four: 1e99, memoire: 'x' }, avant: -1, reste: 7, semaines: 'non' };
  const d = G.detailPoints(st);
  check(d.journees === 70 && d.evenements === 0 && d.ameliorations === 0 && d.defi === 30 && d.atelier.find((a) => a.id === 'four').points === 20 && d.atelier.find((a) => a.id === 'memoire').points === 0 && d.cumul === d.total && Array.isArray(d.semaines), `champs absurdes remis d’aplomb, bornés par le barème (${d.total} points)`);
  check(d.total <= P.semaine, `la semaine ne dépasse jamais ${P.semaine}`);
  st.points = 'cassé'; check(G.pointsSemaine(st) === 0, 'un carnet illisible repart de zéro'); }
{ const st = boutique(LUNDI + 9 * H);
  for (let k = 0; k < 500; k++) { G.marquerEvenement(st); G.marquerJournee(st); G.marquerDefi(st); G.marquerAmelioration(st, 1e40, 1, 50); G.marquerAtelier(st, 'four', 1e9); G.marquerAtelier(st, 'faconnage', 1e9); G.marquerAtelier(st, 'memoire', 1e9); }
  check(G.pointsSemaine(st) === 60 + 30 + 60, `la console, 500 fois chaque règle, le lundi : ${G.pointsSemaine(st)} points (60 du jour + défi + Atelier : les plafonds tiennent)`);
  for (let j = 1; j < 7; j++) { st.now = LUNDI + j * 24 * H + 9 * H; for (let k = 0; k < 100; k++) { G.marquerEvenement(st); G.marquerJournee(st); G.marquerAmelioration(st, 1e40, 1, 50); } }
  check(G.pointsSemaine(st) === P.semaine, `toute la semaine : ${G.pointsSemaine(st)}, le maximum du barème (${P.semaine}) — le serveur applique les mêmes plafonds, jour par jour`); }

titre('les objectifs du jour à la portée de tous (les points du classement en dépendent)');
{ const st = boutique(LUNDI + 9 * H); const r = G.rythme(st);
  // en fin de boutique, les niveaux coûtent cher : l'objectif « Achète N niveaux » se règle sur 25 min du rythme
  st.stations.forEach((s, i) => { s.niv = 150 + 10 * i; s.staff = true; });
  const rr = G.rythme(st), cibles = [];
  for (let d = 0; d < 40; d++) { st.jour = null; G.objectifsDuJour(st, LUNDI + d * 24 * H + 9 * H); for (const o of st.jour.objectifs) if (o.type === 'niveaux') cibles.push(o.cible); }
  check(cibles.length > 0 && cibles.every((c) => c >= 5 && c <= 30), `« Achète N niveaux » en fin de boutique : N entre 5 et 30 (${[...new Set(cibles)].join(', ')})`);
  void r; void rr; }

// ─── 2. l'équité : débutant contre fin de boutique 3, mêmes sessions, mêmes décisions ───
titre('équité : un débutant et un joueur en fin de boutique 3 qui jouent pareil');
const SEMAINES = [Date.UTC(2026, 9, 11, 22), Date.UTC(2026, 10, 1, 23), Date.UTC(2027, 2, 7, 23), Date.UTC(2027, 5, 13, 22)]; // lundis à minuit, Paris : octobre, novembre, mars, juin
function capturer(profil) { // la partie du profil, rejouée depuis le 5 octobre : en boutique 3 à +81 M€/s (comme le joueur), et au moment d'ouvrir la boutique 4
  const out = {};
  try {
    LG.simuler(profil, 60, { t0: LG.DEPARTS['5 oct.'],
      chaqueSeconde: (st, now) => { if (!out.b3 && st.boutiques === 3 && G.tauxParSeconde(st) >= 8.1e7) out.b3 = { st: clone(st), now }; },
      avantPrestige: (st, now) => { if (st.boutiques === 3 && !out.fin) { out.fin = { st: clone(st), now }; throw new Error('fin'); } } });
  } catch (e) { if (e.message !== 'fin') throw e; }
  return out;
}
// Les mêmes tirages pour tous (st.created = t0, comme le débutant, newState(t0)) : le défi de la semaine, le pain du jour et la graine des objectifs
// se tirent sur st.created. Sans cela, le joueur comparé tirait un autre défi de la semaine que le débutant (« Ouvre une nouvelle boutique »,
// impossible ici, contre « Reçois 12 pourboires ») : 30 points de hasard, sans rapport avec l'équité, qui faisaient basculer le contrôle à 90 %
// au moindre changement de règle (les pourboires comptés dans « Réussis 15 événements » : ×0,88 une semaine). Vérifié sur huit captures du
// régulier (graines 11 à 18), avant et après ce changement de règle : de ×0,98 à ×1,27, toutes au-dessus de 0,9 (contre ×0,88 à ×1,27 avant).
function semaine(profil, t0, depart, prestige) { // une semaine de jeu, du lundi au dimanche ; rend le détail des points
  let st; if (depart) { st = clone(depart.st); st.lastSeen = t0; st.now = t0; st.created = t0; }
  const r = LG.simuler(profil, 7, { t0, st, prestige, seed: 7 });
  r.st.now = t0 + 7 * 24 * H - 1000; return G.detailPoints(r.st);
}
const f = (d) => `${String(d.total).padStart(3)} (journées ${d.journees}, événements ${d.evenements}, améliorations ${d.ameliorations}, défi ${d.defi})`;
const bilan = [], caps = {};
for (const profil of ['occasionnel', 'regulier', 'assidu']) {
  const cap = caps[profil] = capturer(profil);
  const sF = cap.fin.st, sB = cap.b3 ? cap.b3.st : null;
  console.log(`  ${profil} (${LG.PROFILS[profil].sessions.map(([, m]) => m + ' min').join(' + ')} par jour)`);
  console.log(`    fin de boutique 3 : jour ${((cap.fin.now - LG.DEPARTS['5 oct.']) / 864e5).toFixed(1)}, ${G.fmtEur(sF.lifetime)} gagnés, +${G.fmtEur(G.tauxParSeconde(sF))}/s, niveaux ${sF.stations.map((s) => s.niv).join(',')}`);
  if (sB) console.log(`    boutique 3 à +81 M€/s : jour ${((cap.b3.now - LG.DEPARTS['5 oct.']) / 864e5).toFixed(1)}, ${G.fmtEur(sB.lifetime)} gagnés, +${G.fmtEur(G.tauxParSeconde(sB))}/s`);
  const R = { debutant: [], fin: [], finNormal: [], b3: [] };
  for (const t0 of SEMAINES) {
    const deb = semaine(profil, t0, null), fin = semaine(profil, t0, cap.fin, false), finN = semaine(profil, t0, cap.fin), b3 = sB ? semaine(profil, t0, cap.b3, false) : null;
    R.debutant.push(deb.total); R.fin.push(fin.total); R.finNormal.push(finN.total); if (b3) R.b3.push(b3.total);
    console.log(`    semaine du ${new Date(t0 + 3 * H).toISOString().slice(0, 10)} : débutant ${f(deb)}`);
    console.log(`                            fin de B3 qui y reste ${f(fin)}`);
    console.log(`                            fin de B3 qui ouvre la suivante ${f(finN)}`);
    if (b3) console.log(`                            B3 à 81 M€/s qui y reste ${f(b3)}`);
  }
  const moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ratio = moy(R.fin) / moy(R.debutant), ratioN = moy(R.finNormal) / moy(R.debutant), ratioB = R.b3.length ? moy(R.b3) / moy(R.debutant) : 1;
  bilan.push({ profil, debutant: moy(R.debutant), fin: moy(R.fin), finNormal: moy(R.finNormal), b3: R.b3.length ? moy(R.b3) : null });
  check(ratio >= 0.85 && ratio <= 1.15, `${profil} : fin de boutique 3 qui y reste ${moy(R.fin).toFixed(0)} points par semaine en moyenne, débutant ${moy(R.debutant).toFixed(0)} (×${ratio.toFixed(2)}, attendu 0,85 à 1,15)`);
  check(ratioN >= 0.85 && ratioN <= 1.15, `${profil} : fin de boutique 3 qui ouvre la suivante ${moy(R.finNormal).toFixed(0)} (×${ratioN.toFixed(2)})`);
  if (R.b3.length) check(ratioB >= 0.85 && ratioB <= 1.15, `${profil} : boutique 3 à +81 M€/s ${moy(R.b3).toFixed(0)} (×${ratioB.toFixed(2)})`);
  check(R.fin.every((v, k) => v >= 0.8 * R.debutant[k]), `${profil} : chaque semaine, la fin de boutique 3 marque au moins 80 % du débutant (${R.fin.map((v, k) => (v / R.debutant[k]).toFixed(2)).join(', ')})`);
  bilan[bilan.length - 1].R = R;
}

// ─── 3. un état construit COMME LE JOUEUR : fin de boutique 3, ~81 M€/s, 76 Md€ ───
// Les niveaux de la fin de boutique 3 du régulier (368, 161, 151…), mais un rythme de 81 M€/s : peu d'étoiles et sans les bonus
// les plus chers (les étoiles seules ne suffisent pas : à zéro étoile, cette boutique fait encore 600 M€/s). Chaque niveau,
// chaque apprenti coûte alors très cher par rapport à ses gains (ce que vit le joueur : le niveau suivant le moins cher vaut
// près d'une heure de son rythme). Il joue comme le débutant, sans ouvrir la boutique suivante ; chaque semaine, il doit
// marquer au moins 90 % du débutant.
titre('équité : un joueur comme lui (fin de boutique 3, ~81 M€/s, 76 Md€)');
const joueur = (() => {
  const st = clone(caps.regulier.fin.st); st.etoiles = 0;
  for (const a of [...G.AMELIORATIONS].sort((x, y) => y.cout - x.cout)) { if (G.rythme(st) <= 81e6) break; delete st.ameliorations[a.id]; }
  const r0 = G.rythme(st); st.etoiles = Math.max(0, Math.round((81e6 / r0 - 1) / G.ETOILE_BONUS));
  st.lifetime = 76e9; st.lifetimeRun = Math.min(st.lifetimeRun, 30e9); st.coins = 0;
  return st;
})();
{ const r = G.rythme(joueur), sansApprenti = joueur.stations.map((s, i) => (s.niv > 0 && !s.staff ? i : -1)).filter((i) => i >= 0);
  console.log(`  l’état : ${joueur.etoiles} étoiles, +${G.fmtEur(G.tauxParSeconde(joueur))}/s (rythme ${G.fmtEur(r)}/s), ${G.fmtEur(joueur.lifetime)} gagnés, niveaux ${joueur.stations.map((s) => s.niv).join(',')}, bonus manquants : ${G.AMELIORATIONS.filter((a) => !joueur.ameliorations[a.id]).map((a) => a.id).join(', ')}`);
  console.log(`    niveau suivant de chaque recette, en minutes de son rythme : ${joueur.stations.map((s, i) => (s.niv > 0 ? Math.round(G.coutNiveaux(i, s.niv, 1) / r / 60) : '-')).join(', ')}`);
  console.log(`    sans apprenti : ${sansApprenti.map((i) => `${G.PRODUITS[i].nom} (apprenti : ${(G.prixStaff(joueur, i) / r / 3600).toFixed(1)} h de rythme)`).join(', ') || 'aucune'}`);
  check(r > 7e7 && r < 9.5e7, `rythme proche de celui du joueur (${G.fmtEur(r)}/s)`);
  // l'objectif « à la main » se règle sur la recette sans apprenti la plus rapide : jamais plus de 20 minutes de cuisson
  const cibles = [];
  for (let d = 0; d < 60; d++) { const st = clone(joueur); st.jour = null; G.objectifsDuJour(st, LUNDI + d * 24 * H + 9 * H); for (const o of st.jour.objectifs) if (o.type === 'mains') cibles.push(o.cible); }
  const tMin = Math.min(...sansApprenti.map((i) => G.temps(joueur, i)));
  check(!sansApprenti.length || (cibles.length > 0 && cibles.every((c) => c * tMin <= 1200 + tMin)), `« Cuis N fournées à la main » réglé sur 20 min de la recette sans apprenti la plus rapide (${G.fmtDuree(tMin)} la fournée) : N = ${[...new Set(cibles)].join(', ')}, au lieu de 25 (${G.fmtDuree(25 * tMin)})`);
}
const bilanJoueur = [];
for (const b of bilan) {
  const R = [];
  for (const [k, t0] of SEMAINES.entries()) { const d = semaine(b.profil, t0, { st: joueur }, false); R.push(d.total); console.log(`    ${b.profil}, semaine du ${new Date(t0 + 3 * H).toISOString().slice(0, 10)} : comme le joueur ${f(d)} ; débutant ${b.R.debutant[k]}`); }
  const ratios = R.map((v, k) => v / b.R.debutant[k]);
  bilanJoueur.push(`${b.profil} ${R.join('/')} (débutant ${b.R.debutant.join('/')})`);
  check(ratios.every((x) => x >= 0.9), `${b.profil} : comme le joueur, chaque semaine au moins 90 % du débutant (${ratios.map((x) => '×' + x.toFixed(2)).join(', ')})`);
}
console.log('  bilan « comme le joueur » (points par semaine, 4 semaines) : ' + bilanJoueur.join(' ; '));
console.log('  bilan (points par semaine, moyenne de 4 semaines ; l’Atelier, identique pour tous, en plus) : ' + bilan.map((b) => `${b.profil} débutant ${b.debutant.toFixed(0)} · fin B3 ${b.fin.toFixed(0)} · fin B3 qui avance ${b.finNormal.toFixed(0)}${b.b3 != null ? ` · B3 à 81 M€/s ${b.b3.toFixed(0)}` : ''}`).join(' ; '));

console.log(`\n${n - fails}/${n} vérifications.`);
console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
process.exit(fails ? 1 : 0);
