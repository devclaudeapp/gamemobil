#!/usr/bin/env node
// Le Fournil : les points de boulanger (src/game.js), ce que classe le classement en ligne.
// 1. Le barème du lot 7, règle par règle : le socle d'avant (journée complète 10, défi de la semaine 30, événements 2 chacun, 20 au plus
//    par jour, améliorations : 1 point par tranche d'achats valant 10 min de ses propres gains, + 5 par palier ×2, 30 au plus par jour),
//    et les sources nouvelles : chaque objectif réclamé 2 (6/jour), la présence (pétrissage 4/48, descente 4/48, client mystère 1/80,
//    grosse commande 4/48), les paliers d'événement 3 (12/jour) ; la dégressivité du jour (plein jusqu'à 60, moitié jusqu'à 160, quart
//    jusqu'à 220 : 125 au plus), l'Atelier DU JOUR hors dégressivité (0 à 4 par mini-jeu, 12 par jour ; avant le lot 7 : 0 à 20 sur la
//    semaine), d'où 137 par jour et 989 par semaine ; jours et semaines à l'heure de Paris ; la migration d'une vieille sauvegarde (la
//    semaine en cours garde ses points au point près) ; carnets abîmés ; triche par la console bornée par les plafonds.
//    Les attentes d'avant le lot 7 (60 par jour, 510 par semaine, Atelier 20) ont changé avec la règle (validée par le joueur).
//    Le barème du lot 7 (et la série du serveur) démarre le lundi 26 octobre 2026 (G.BAREME_DEPUIS) : ses vérifications se font donc
//    la semaine du lundi 2 novembre 2026 (elles se faisaient celle du 12 octobre avant cette date de départ).
// 1 bis. Avant le 26 octobre : le barème d'avant le lot 7, EXACTEMENT (le carnet de master, rejoué contre son miroir sur des milliers
//    d'actions tirées au hasard) ; la bascule du dimanche 25 au lundi 26 (la semaine finie part dans l'historique, la nouvelle compte
//    au barème du lot 7) ; une vieille sauvegarde de la semaine du 19 (gardée telle quelle), un carnet version 2 d'une version de test
//    joué avant le 26 (ramené au barème d'avant, rien d'acquis ne se perd).
// 2. L'équité : un débutant et un joueur en fin de boutique 3 qui jouent pareil (mêmes sessions, mêmes décisions : test/longevite.js)
//    marquent à peu près autant, sur quatre semaines de l'année et pour les trois profils (bornes inchangées).
// 4. Les profils du lot 7 (la conception LOT7/bareme.js, ici sur le vrai carnet) : 4 h / 1 h ≥ ×1,40 ; écran allumé 12 h / 1 h ≤ ×1,06.
// Lancer : TZ=Europe/Paris node test/fournil-points.test.js
'use strict';
const G = require('../src/game.js');
const LG = require('./longevite.js');
let n = 0, fails = 0;
const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const titre = (t) => console.log(`── ${t} ──`);
const clone = (o) => JSON.parse(JSON.stringify(o));
const H = 3600e3, LUNDI = Date.UTC(2026, 10, 1, 23); // lundi 2 novembre 2026, minuit à Paris (heure d'hiver) : le barème du lot 7 (depuis le 26 octobre)
const P = G.POINTS;

// une boutique jouable : quelques recettes, deux apprentis, un rythme connu
function boutique(t) {
  const st = G.newState(t); st.now = t;
  st.stations[0].niv = 30; st.stations[0].staff = true; st.stations[1].niv = 10; st.stations[1].staff = true; st.stations[2].niv = 1;
  G.objectifsDuJour(st, t);
  return st;
}

titre('le barème');
check(P.journee === 10 && P.defi === 30 && P.evenement === 2 && P.evenementsJour === 20 && P.tranche === 600 && P.palier === 5 && P.ameliorationsJour === 30 && P.semaines === 12, 'le socle d’avant, inchangé : journée 10, défi 30, événements 2 (20/jour), 10 min de gains par point, +5 par palier, 30/jour, 12 semaines d’historique');
check(P.objectif === 2 && P.palierEvt === 3 && P.paliersEvtJour === 12 && P.atelier === 4 && JSON.stringify(P.presence) === JSON.stringify({ petrissage: [4, 48], descente: [4, 48], mystere: [1, 80], commande: [4, 48] }), 'les sources nouvelles : objectif 2, présence (pétrissage 4/48, descente 4/48, client mystère 1/80, grosse commande 4/48), palier d’événement 3 (12/jour), Atelier 4 par mini-jeu (et non plus 20)');
check(JSON.stringify(P.bandes) === '[[60,1],[160,0.5],[220,0.25]]' && P.jourCompte === 125 && P.atelierJour === 12 && P.jour === 137 && P.semaine === 989 && P.serie[3] === 10 && P.serie[7] === 20, `dégressivité 60 / 160 / 220 → ${P.jourCompte} comptés au plus par jour + Atelier ${P.atelierJour} = ${P.jour} ; semaine 7 × 137 + 30 = ${P.semaine} ; série (serveur) +10 au 3e jour, +20 au 7e`);
check(P.semaine + 30 === 1019, 'le maximum honnête d’une semaine, série comprise : 1 019 (le serveur v6.7 borne le tricheur au même chiffre)');
check(G.BAREME_DEPUIS === '2026-10-26' && P.depuis === '2026-10-26' && JSON.stringify(P.ancien) === '{"atelier":20,"jour":60,"semaine":510}' && P.annonce === 'Nouveau barème et série à partir du lundi 26 octobre'
  && G.baremeDe('2026-10-19') === 1 && G.baremeDe('2026-10-26') === 2 && G.baremeDe('2027-01-04') === 2, 'le départ : le lundi 26 octobre 2026 (heure de Paris) ; avant, le barème d’avant (Atelier 20, 60 par jour, 510 par semaine) ; l’annonce');
{ const st = G.newState(LUNDI + 9 * H); const d = G.detailPoints(st);
  check(d.total === 0 && d.cumul === 0 && d.semaine === '2026-11-02' && d.jour === '2026-11-02' && d.atelier.length === 3 && d.atelier.every((a) => a.points === 0) && st.points.v === 2 && d.bareme === 2 && d.atelierMax === 4, 'une partie neuve : 0 point, semaine du lundi 2 novembre, carnet version 2 (barème du lot 7)'); }

titre('la dégressivité du jour : plein jusqu’à 60, moitié jusqu’à 160, quart jusqu’à 220');
{ const D = G.degressif, cas = [[0, 0], [1, 1], [59, 59], [60, 60], [61, 60], [62, 61], [100, 80], [159, 109], [160, 110], [161, 110], [164, 111], [200, 120], [219, 124], [220, 125], [221, 125], [1e9, 125], [-5, 0], [NaN, 0]];
  const faux = cas.filter(([b, c]) => D(b) !== c);
  check(!faux.length, `brut → compté aux bornes : ${cas.map(([b, c]) => `${b}→${c}`).join(', ')}${faux.length ? ' ; FAUX : ' + faux.map(([b]) => `${b}→${D(b)}`).join(', ') : ''}`);
  let mono = true; for (let b = 1; b <= 300; b++) if (D(b) < D(b - 1) || D(b) - D(b - 1) > 1) mono = false;
  check(mono, 'le compté ne baisse jamais quand le brut monte, et jamais plus d’un point par point brut');
  const B = G.bandeDuJour;
  check(JSON.stringify([B(0), B(59), B(60), B(159), B(160), B(219), B(220), B(500)]) === JSON.stringify([{ taux: 1, reste: 60 }, { taux: 1, reste: 1 }, { taux: 0.5, reste: 100 }, { taux: 0.5, reste: 1 }, { taux: 0.25, reste: 60 }, { taux: 0.25, reste: 1 }, { taux: 0, reste: 0 }, { taux: 0, reste: 0 }]), 'la bande du prochain point : plein (encore 60), moitié à 60, quart à 160, plus rien à 220'); }

titre('journée complète : 10 points, une fois par jour ; chaque objectif réclamé : 2 points');
{ const t = LUNDI + 10 * H, st = boutique(t);
  st.jour.objectifs.forEach((o) => { o.fait = true; o.progres = o.cible; });
  const r1 = G.reclamer(st, 0), r2 = G.reclamer(st, 1), r3 = G.reclamer(st, 2);
  check(r1.points === 2 && r2.points === 2 && r3.points === 12 && r3.etoile && G.pointsSemaine(st) === 16, `les deux premiers objectifs : +2 chacun ; le troisième fait la journée : +2 +10 (${G.pointsSemaine(st)})`);
  st.jour.etoileDonnee = false; // une étoile qui se redonnerait (sauvegarde bricolée) ne remarque ni la journée ni les objectifs
  st.jour.objectifs.forEach((o) => { o.reclame = false; }); G.reclamer(st, 0); G.reclamer(st, 1); G.reclamer(st, 2);
  check(G.pointsSemaine(st) === 16 && G.detailPoints(st).aujourdhui.objectifs === 6, 'la même journée ne compte qu’une fois, les objectifs 6 au plus par jour');
  for (let k = 0; k < 50; k++) G.marquerObjectif(st);
  check(G.pointsSemaine(st) === 16, 'marquerObjectif répété à la console : toujours 6 par jour');
  st.now = LUNDI + 34 * H; G.objectifsDuJour(st, st.now); st.jour.objectifs.forEach((o) => { o.fait = true; });
  [0, 1, 2].forEach((k) => G.reclamer(st, k));
  const d = G.detailPoints(st);
  check(G.pointsSemaine(st) === 32 && d.journees === 20 && d.objectifs === 12, 'le lendemain : encore 16 (32 dans la semaine : journées 20, objectifs 12)'); }

titre('défi de la semaine : 30 points');
{ const st = boutique(LUNDI + 10 * H); st.semaine.fait = true;
  const r = G.reclamerSemaine(st), r2 = G.reclamerSemaine(st);
  check(r.ok && !r2.ok && G.pointsSemaine(st) === 30 && G.detailPoints(st).defi === 30, 'réclamé : +30, une fois');
  G.marquerDefi(st); check(G.pointsSemaine(st) === 30, 'marqué deux fois (console) : toujours 30'); }

titre('événements réussis : 2 chacun (20 au plus par jour), et la présence par-dessus');
{ const st = boutique(LUNDI + 11 * H), rnd = () => 0.3, brut = () => G.detailPoints(st).aujourdhui.brut;
  G.lancerPetrissage(st); for (let k = 0; k < G.PETRISSAGE.n; k++) G.petrir(st);
  check(G.pointsSemaine(st) === 6 && G.detailPoints(st).aujourdhui.presence.petrissage === 4, 'pétrissage gagné : +2 (événement) +4 (présence)');
  G.lancerPetrissage(st); for (let k = 0; k < 5; k++) G.petrir(st); st.ev = null;
  check(G.pointsSemaine(st) === 6, 'pétrissage abandonné : rien');
  G.lancerCommande(st, rnd); st.ev.fait = st.ev.n; G.livrer(st);
  check(G.pointsSemaine(st) === 12 && G.detailPoints(st).aujourdhui.presence.commande === 4, 'commande livrée : +2 +4 (grosse commande)');
  G.lancerPanne(st, rnd); for (let k = 0; k < G.PANNE.n; k++) G.reparer(st);
  check(G.pointsSemaine(st) === 14, 'four réparé : +2');
  st.stations[3].niv = 1; st.stations[2].niv = 2; G.lancerCritique(st, rnd); [...st.ev.restants].forEach((i) => G.servir(st, i));
  check(G.pointsSemaine(st) === 16, 'bonne critique : +2');
  G.encaisserPourboire(st);
  check(G.pointsSemaine(st) === 19 && G.detailPoints(st).aujourdhui.presence.mystere === 1, 'client mystère (pourboire) : +2 +1');
  G.lancerRush(st); G.lancerMeunier(st); G.lancerAnniversaire(st, rnd);
  check(G.pointsSemaine(st) === 19, 'coup de feu, meunier, anniversaire (rien à réussir) : rien');
  for (let k = 0; k < 30; k++) G.encaisserPourboire(st);
  const d = G.detailPoints(st);
  check(d.evenements === 20 && d.aujourdhui.evenements === 20 && d.aujourdhui.presence.mystere === 31 && brut() === 59 && d.total === 59, `trente pourboires de plus : les événements plafonnés à 20 dans la journée, le client mystère continue (+1 chacun) : brut ${brut()}`);
  st.now = LUNDI + 24 * H + 60e3; G.encaisserPourboire(st);
  check(G.detailPoints(st).evenements === 22 && G.detailPoints(st).aujourdhui.evenements === 2 && G.pointsSemaine(st) === 62, 'minuit passé à Paris : le plafond repart (22 dans la semaine, 62 points)'); }

titre('la présence : chaque source plafonnée par jour');
{ const st = boutique(LUNDI + 9 * H), r = {};
  for (const t of ['petrissage', 'descente', 'mystere', 'commande']) { r[t] = 0; for (let k = 0; k < 500; k++) r[t] += G.marquerPresence(st, t); }
  check(r.petrissage === 48 && r.descente === 48 && r.mystere === 80 && r.commande === 48, `500 fois chacune : pétrissage ${r.petrissage}, descente ${r.descente}, client mystère ${r.mystere}, grosse commande ${r.commande} (plafonds 48, 48, 80, 48)`);
  check(['autre', '__proto__', 'toString', 'constructor', '', null, undefined, 3].every((t) => G.marquerPresence(st, t) === 0) && !('autre' in G.detailPoints(st).presence), 'un type inconnu (ou piégé) : 0, rien d’ajouté au carnet');
  const d = G.detailPoints(st);
  check(d.aujourdhui.brut === 224 && d.aujourdhui.compte === 125 && d.total === 125, `brut 224 de présence → ${d.aujourdhui.compte} comptés (dégressivité : 60 + 50 + 15)`);
  st.now += 24 * H; check(G.marquerPresence(st, 'descente') === 4 && G.detailPoints(st).presence.descente === 52, 'le lendemain : ça repart (52 dans la semaine)'); }

titre('paliers d’événement franchis : 3 chacun, 12 par jour');
{ const st = boutique(LUNDI + 9 * H), r = [1, 2, 3, 4, 5].map(() => G.marquerPalierEvt(st));
  check(r.join(',') === '3,3,3,3,0' && G.pointsSemaine(st) === 12 && G.detailPoints(st).paliers === 12, `cinq paliers le même jour : ${r.join(', ')} (12 au plus)`);
  st.now += 24 * H; check(G.marquerPalierEvt(st) === 3 && G.pointsSemaine(st) === 15, 'le lendemain : +3'); }

titre('la dégressivité dans la journée, puis le jour fini rangé');
{ const st = boutique(LUNDI + 9 * H);
  for (let k = 0; k < 80; k++) G.marquerPresence(st, 'mystere'); for (let k = 0; k < 10; k++) G.marquerPresence(st, 'petrissage');
  let d = G.detailPoints(st);
  check(d.aujourdhui.brut === 120 && d.aujourdhui.compte === 90 && d.total === 90 && d.aujourdhui.bande.taux === 0.5 && d.aujourdhui.bande.reste === 40, `brut 120 → 90 comptés (60 + 60 / 2) ; les prochains points comptent pour moitié, encore 40 avant le quart`);
  st.now = LUNDI + 33 * H; d = G.detailPoints(st);
  check(d.total === 90 && st.points.comptes === 90 && d.aujourdhui.brut === 0 && d.aujourdhui.bande.taux === 1, 'mardi : la journée de lundi est rangée avec sa dégressivité (90), la nouvelle repart en plein');
  for (let k = 0; k < 61; k++) G.marquerPresence(st, 'mystere');
  check(G.pointsSemaine(st) === 150, `mardi, brut 61 → 60 (le 61e ne vaut qu’un demi-point, arrondi en dessous) : 150 dans la semaine (${G.pointsSemaine(st)})`); }

titre('Atelier : le meilleur score DU JOUR de chaque mini-jeu → 0 à 4, chaque jour, hors dégressivité');
{ const st = boutique(LUNDI + 12 * H);
  check(G.JEUX_ATELIER.every((j) => G.pointsAtelier(j.id, j.plein) === 4 && G.pointsAtelier(j.id, j.max) === 4 && G.pointsAtelier(j.id, 0) === 0 && G.pointsAtelier(j.id, j.plein / 2) === 2), 'au score « plein » du jeu (game.js) : 4 ; au-delà, 4 ; à mi-chemin, 2 ; à zéro, 0');
  check(G.pointsAtelier('inconnu', 1e9) === 0 && G.pointsAtelier('four', NaN) === 0 && G.pointsAtelier('four', -5) === 0, 'un jeu inconnu, un score absurde : 0');
  let r = G.finirAtelier(st, 'four', 225);
  check(r.points === 2 && G.pointsSemaine(st) === 2, `enfournement à 225 (plein 450) : +2 (${r.points})`);
  r = G.finirAtelier(st, 'four', 100);
  check(r.points === 0 && G.pointsSemaine(st) === 2, 'une partie moins bonne ne retire rien');
  for (let k = 0; k < 4; k++) G.finirAtelier(st, 'memoire', 25);
  check(G.atelierDuJour(st).payees.memoire === 3 && G.detailPoints(st).atelier.find((a) => a.id === 'memoire').points === 4 && G.pointsSemaine(st) === 6, 'mémoire au score plein, quatre fois (la quatrième ne paie plus) : 4 points, pas 16');
  G.finirAtelier(st, 'four', 20000); G.finirAtelier(st, 'faconnage', 300);
  check(G.pointsSemaine(st) === 12 && G.detailPoints(st).aujourdhui.atelier === 12, 'les trois mini-jeux au plus haut : 12 points d’Atelier dans la journée, pas plus');
  for (let k = 0; k < 400; k++) G.marquerPresence(st, ['petrissage', 'descente', 'mystere', 'commande'][k % 4]);
  check(G.pointsSemaine(st) === 137 && G.detailPoints(st).aujourdhui.total === 137, 'l’Atelier ne passe pas par la dégressivité : 125 comptés + 12 = 137, le maximum d’un jour');
  st.now = LUNDI + 36 * H; let d = G.detailPoints(st);
  check(d.atelier.every((a) => a.points === 0 && a.score === 0) && d.atelierSemaine === 12 && d.total === 137 && G.atelierDuJour(st).records.four === 20000, 'mardi : l’Atelier du jour repart de zéro (les 12 d’hier restent dans la semaine, les records aussi)');
  r = G.finirAtelier(st, 'four', 450);
  check(r.points === 4 && G.pointsSemaine(st) === 141 && G.detailPoints(st).atelierSemaine === 16, 'mardi, enfournement au score plein : +4 de nouveau (141)');
  st.now = LUNDI + 7 * 24 * H + H; G.finirAtelier(st, 'four', 225);
  check(G.pointsSemaine(st) === 2 && G.atelierDuJour(st).records.four === 20000, 'lundi suivant : la semaine repart de zéro (les records, eux, restent)'); }
{ const st = boutique(LUNDI + 9 * H);
  for (let j = 0; j < 7; j++) { st.now = LUNDI + j * 24 * H + 9 * H; G.JEUX_ATELIER.forEach((x) => G.marquerAtelier(st, x.id, x.plein)); }
  check(G.detailPoints(st).atelierSemaine === 84 && G.pointsSemaine(st) === 84, 'l’Atelier parfait sept jours : 84 dans la semaine (12 par jour ; 60 avant le lot 7)'); }

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
  check(d.total === 0 && d.cumul === 32 && d.semaine === '2026-11-09' && d.semaines.length === 1 && d.semaines[0].semaine === '2026-11-02' && d.semaines[0].points === 32, 'lundi 0 h 01 : la semaine repart de 0, la précédente rejoint l’historique, le cumul garde 32');
  st.now = LUNDI + 3 * H; G.marquerEvenement(st);
  check(G.detailPoints(st).semaine === '2026-11-09' && G.pointsSemaine(st) === 2, 'une horloge qui recule (impossible avec l’horloge de confiance) ne refait pas naître une semaine finie'); }
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
  check(G.pointsSemaine(st) === 0 && G.detailPoints(st).semaine === '2026-11-02', 'une sauvegarde d’avant les points : le carnet se crée');
  st.points = { semaine: 'n’importe quoi', jour: 12, journees: '9999', evenements: -4, ameliorations: NaN, defi: 1e9, atelier: { four: 1e99, memoire: 'x' }, avant: -1, reste: 7, semaines: 'non' };
  const d = G.detailPoints(st);
  check(d.journees === 70 && d.evenements === 0 && d.ameliorations === 0 && d.defi === 30 && d.atelierSemaine === 20 && d.atelier.every((a) => a.points === 0) && d.total === 70 + 20 + 30 && d.cumul === d.total && Array.isArray(d.semaines) && st.points.v === 2, `un vieux carnet (sans version) aux champs absurdes : remis d’aplomb, borné par le barème d’avant, passé en version 2 (${d.total} points)`);
  check(d.total <= P.semaine, `la semaine ne dépasse jamais ${P.semaine}`);
  st.points = { v: 2, semaine: 'x', jour: 3, comptes: 1e9, atelierSemaine: -5, presence: 'non', jPresence: { mystere: 1e9, autre: 7 }, jObjectifs: 99, jPaliers: -1, objectifs: 1e9, paliers: '12', atelier: { four: 1e99 }, defi: 1e9, semaines: [] };
  const d2 = G.detailPoints(st);
  check(d2.total <= P.semaine && st.points.comptes === 7 * P.jourCompte && d2.atelierSemaine === 4 && d2.aujourdhui.presence.mystere === 80 && d2.aujourdhui.objectifs === 6 && d2.aujourdhui.paliers === 0 && d2.objectifs === 42 && d2.paliers === 12 && d2.presence.mystere === 0, `un carnet version 2 abîmé : chaque champ borné par le barème (${d2.total} points, au plus ${P.semaine})`);
  st.points = { v: 2, presence: [], jPresence: [1, 2] }; const d3 = G.detailPoints(st);
  check(d3.total === 0 && Object.keys(d3.presence).join() === 'petrissage,descente,mystere,commande' && Object.values(d3.aujourdhui.presence).every((v) => v === 0), 'des tableaux à la place de la présence : remis à zéro');
  st.points = 'cassé'; check(G.pointsSemaine(st) === 0, 'un carnet illisible repart de zéro'); }

titre('une vieille sauvegarde (le carnet d’avant le lot 7) d’une semaine du nouveau barème garde sa semaine au point près');
{ // le carnet tel que l'écrivait le jeu d'avant (master 0412cc0), resté en cache sur un téléphone au-delà du 26 octobre : lundi 2 novembre,
  // journée complète, 14 événements (20 au plafond), 30 d'améliorations, le défi, l'Atelier (enfournement 400, mémoire 12) ; mardi, journée
  // complète, 7 événements, 18 d'améliorations ; mercredi matin, 3 événements et 5 d'améliorations. L'ancien total : 20 + 40 + 53 + 30 +
  // Atelier (round(20 × 400/450) = 18, round(20 × 12/25) = 10) = 171. (Avant le départ du 26 octobre, ce test se faisait la semaine du 19.)
  const L = Date.UTC(2026, 10, 1, 23), J = 24 * H, st = boutique(L + 2 * J + 10 * H);
  st.points = { semaine: '2026-11-02', jour: '2026-11-04', journees: 20, evenements: 40, ameliorations: 53, defi: 30, atelier: { four: 400, faconnage: 0, memoire: 12 },
    jJournee: 0, jEvenements: 6, jAmeliorations: 5, reste: 0.4, avant: 512, semaines: [{ semaine: '2026-10-26', points: 512 }] };
  const ancien = 20 + 40 + 53 + 30 + Math.round(20 * 400 / 450) + Math.round(20 * 12 / 25);
  const d = G.detailPoints(st);
  check(ancien === 171 && d.total === 171 && st.points.v === 2 && st.points.comptes === 102 && d.aujourdhui.brut === 11 && d.atelierSemaine === 28 && d.atelier.every((a) => a.score === 0), `le passage au carnet version 2 : ${d.total} points (avant : ${ancien}) = jours finis ${st.points.comptes} + aujourd’hui ${d.aujourdhui.brut} + Atelier de la semaine ${d.atelierSemaine} + défi ${d.defi}`);
  check(d.cumul === 512 + 171 && d.semaines.length === 1 && Math.abs(st.points.reste - 0.4) < 1e-9 && d.journees === 20 && d.evenements === 40 && d.ameliorations === 53, 'l’historique, le cumul, le reste d’améliorations et les compteurs de la semaine sont gardés');
  // elle continue : mercredi après-midi, de la présence au-delà de 60 ; jeudi, le jour fini est compté avec dégressivité ; puis une nouvelle semaine
  st.now = L + 2 * J + 15 * H; for (let k = 0; k < 40; k++) G.marquerPresence(st, 'mystere'); for (let k = 0; k < 6; k++) G.marquerPresence(st, 'petrissage'); G.marquerAtelier(st, 'four', 450);
  const mer = G.detailPoints(st);
  check(mer.aujourdhui.brut === 75 && mer.aujourdhui.compte === 67 && mer.aujourdhui.atelier === 4 && mer.total === 102 + 67 + 28 + 4 + 30, `mercredi : ${mer.aujourdhui.brut} brut → ${mer.aujourdhui.compte} comptés + Atelier ${mer.aujourdhui.atelier} : ${mer.total}`);
  st.now = L + 3 * J + 9 * H; const jeu = G.detailPoints(st);
  check(jeu.total === mer.total && st.points.comptes === 169 && jeu.atelierSemaine === 32, `jeudi matin : la semaine vaut toujours ${jeu.total} (mercredi rangé sans rien perdre)`);
  st.now = L + 7 * J + 9 * H; const lun = G.detailPoints(st);
  check(lun.total === 0 && lun.semaines.length === 2 && lun.semaines[1].points === jeu.total && lun.cumul === 512 + jeu.total, `le lundi suivant : 0, la semaine finie (${jeu.total}) rejoint l’historique`); }
{ const st = boutique(LUNDI + 9 * H), toutes = () => { G.marquerEvenement(st); G.marquerJournee(st); G.marquerDefi(st); G.marquerObjectif(st); G.marquerPalierEvt(st); G.marquerAmelioration(st, 1e40, 1, 50); for (const t of Object.keys(P.presence)) G.marquerPresence(st, t); G.JEUX_ATELIER.forEach((j) => G.marquerAtelier(st, j.id, 1e9)); };
  for (let k = 0; k < 500; k++) toutes();
  check(G.pointsSemaine(st) === 125 + 12 + 30, `la console, 500 fois chaque règle, le lundi : ${G.pointsSemaine(st)} points (125 comptés + Atelier 12 + défi 30 : les plafonds tiennent)`);
  for (let j = 1; j < 7; j++) { st.now = LUNDI + j * 24 * H + 9 * H; for (let k = 0; k < 500; k++) toutes(); }
  check(G.pointsSemaine(st) === P.semaine && P.semaine === 989, `toute la semaine : ${G.pointsSemaine(st)}, le maximum du barème (${P.semaine}) — le serveur v6.7 borne de même, jour par jour (137 × jours + 50), et ajoute la série`);
  st.now = LUNDI + 7 * 24 * H + 9 * H; const d = G.detailPoints(st);
  check(d.total === 0 && d.semaines[d.semaines.length - 1].points === 989, 'le lundi suivant : 989 dans l’historique'); }

titre('les objectifs du jour à la portée de tous (les points du classement en dépendent)');
{ const st = boutique(LUNDI + 9 * H); const r = G.rythme(st);
  // en fin de boutique, les niveaux coûtent cher : l'objectif « Achète N niveaux » se règle sur 25 min du rythme
  st.stations.forEach((s, i) => { s.niv = 150 + 10 * i; s.staff = true; });
  const rr = G.rythme(st), cibles = [];
  for (let d = 0; d < 40; d++) { st.jour = null; G.objectifsDuJour(st, LUNDI + d * 24 * H + 9 * H); for (const o of st.jour.objectifs) if (o.type === 'niveaux') cibles.push(o.cible); }
  check(cibles.length > 0 && cibles.every((c) => c >= 5 && c <= 30), `« Achète N niveaux » en fin de boutique : N entre 5 et 30 (${[...new Set(cibles)].join(', ')})`);
  void r; void rr; }

// ─── 1 bis. avant le lundi 26 octobre 2026 : le barème d'avant le lot 7, exactement ; la bascule ───
const LUNDI_A = Date.UTC(2026, 9, 11, 22); // lundi 12 octobre 2026, minuit à Paris (heure d'été) : une semaine d'avant le départ
titre('avant le 26 octobre : le barème d’avant le lot 7, règle par règle');
{ const st = G.newState(LUNDI_A + 9 * H), d = G.detailPoints(st);
  check(d.bareme === 1 && st.points.v === 1 && d.atelierMax === 20 && d.aujourdhui.max === 60 && d.semaine === '2026-10-12' && d.total === 0, 'une partie neuve la semaine du 12 octobre : carnet version 1 (le barème d’avant), Atelier 20, 60 au plus par jour'); }
{ const st = boutique(LUNDI_A + 10 * H);
  st.jour.objectifs.forEach((o) => { o.fait = true; o.progres = o.cible; });
  const r = [0, 1, 2].map((k) => G.reclamer(st, k).points);
  check(r.join(',') === '0,0,10' && G.pointsSemaine(st) === 10 && G.detailPoints(st).objectifs === 0, `les trois objectifs réclamés : ${r.join(', ')} (seule la journée complète compte, 10 ; pas de points par objectif)`);
  let n = 0; for (let k = 0; k < 500; k++) { n += G.marquerObjectif(st) + G.marquerPalierEvt(st); for (const t of Object.keys(P.presence)) n += G.marquerPresence(st, t); }
  const d = G.detailPoints(st);
  check(n === 0 && G.pointsSemaine(st) === 10 && d.paliers === 0 && Object.values(d.presence).every((v) => v === 0) && Object.values(d.aujourdhui.presence).every((v) => v === 0), 'objectifs, présence, paliers d’événement, 500 fois chacun : 0 (le lot 7 ne compte pas avant le 26)');
  G.lancerPetrissage(st); for (let k = 0; k < G.PETRISSAGE.n; k++) G.petrir(st); G.encaisserPourboire(st);
  check(G.pointsSemaine(st) === 14, 'pétrissage gagné, client mystère : +2 chacun (l’événement), pas de présence'); }
{ const st = boutique(LUNDI_A + 12 * H);
  let r = G.finirAtelier(st, 'four', 225);
  check(r.points === 10 && G.pointsSemaine(st) === 10 && G.detailPoints(st).atelier.find((a) => a.id === 'four').points === 10, `l’Atelier au barème d’avant : enfournement à 225 (plein 450) → ${r.points}/20`);
  st.now = LUNDI_A + 36 * H; let d = G.detailPoints(st);
  check(d.atelier.find((a) => a.id === 'four').score === 225 && d.total === 10, 'mardi : le meilleur score de la SEMAINE reste (pas de remise à zéro chaque jour)');
  r = G.finirAtelier(st, 'four', 450); G.JEUX_ATELIER.forEach((j) => G.marquerAtelier(st, j.id, j.max));
  d = G.detailPoints(st);
  check(r.points === 10 && d.total === 60 && d.atelierSemaine === 60, 'mardi, le score plein : +10 ; les trois mini-jeux au plus haut : 60 sur la semaine, pas plus');
  st.now = LUNDI_A + 4 * 24 * H + 9 * H; G.JEUX_ATELIER.forEach((j) => G.marquerAtelier(st, j.id, j.max));
  check(G.pointsSemaine(st) === 60, 'vendredi, rejoués au plus haut : toujours 60 (l’Atelier se compte sur la semaine)'); }
{ const st = boutique(LUNDI_A + 9 * H), toutes = () => { G.marquerEvenement(st); G.marquerJournee(st); G.marquerDefi(st); G.marquerObjectif(st); G.marquerPalierEvt(st); G.marquerAmelioration(st, 1e40, 1, 50); for (const t of Object.keys(P.presence)) G.marquerPresence(st, t); G.JEUX_ATELIER.forEach((j) => G.marquerAtelier(st, j.id, 1e9)); };
  for (let k = 0; k < 500; k++) toutes();
  const d = G.detailPoints(st);
  check(G.pointsSemaine(st) === 150 && d.aujourdhui.brut === 60 && d.aujourdhui.compte === 60 && d.aujourdhui.total === 60, `la console, 500 fois chaque règle, le lundi : ${G.pointsSemaine(st)} (60 du jour sans dégressivité + défi 30 + Atelier 60, comme avant le lot 7)`);
  for (let j = 1; j < 7; j++) { st.now = LUNDI_A + j * 24 * H + 9 * H; for (let k = 0; k < 500; k++) toutes(); }
  check(G.pointsSemaine(st) === 510 && P.ancien.semaine === 510, `toute la semaine : ${G.pointsSemaine(st)}, le maximum du barème d’avant (le serveur v6.7.1 borne de même avant le 26 : 60 × jours + 100, 510)`);
  st.now = LUNDI_A + 7 * 24 * H + 9 * H; const d2 = G.detailPoints(st);
  check(d2.total === 0 && d2.semaines[d2.semaines.length - 1].points === 510 && d2.bareme === 1 && d2.semaine === '2026-10-19', 'le lundi 19 : 510 dans l’historique, la nouvelle semaine encore au barème d’avant'); }

titre('avant le 26 octobre : le carnet rejoué contre le miroir du jeu d’avant le lot 7 (master), au hasard');
{ // le miroir : le carnet de points de master (src/game.js, 0412cc0), recopié règle par règle (jours et semaines de Paris : G.dayKey, G.semaineKey)
  const MA = { journee: 10, defi: 30, evenement: 2, evenementsJour: 20, atelier: 20, tranche: 600, palier: 5, ameliorationsJour: 30, semaines: 12, jour: 60, semaine: 510 };
  const zero = () => ({ four: 0, faconnage: 0, memoire: 0 }), jeu = (id) => G.JEUX_ATELIER.find((j) => j.id === id);
  const pa = (id, sc) => Math.round(MA.atelier * Math.max(0, Math.min(1, (Number(sc) || 0) / jeu(id).plein)));
  function miroir() {
    let p = null; const sd = (pp) => pp.journees + pp.evenements + pp.ameliorations + pp.defi + G.JEUX_ATELIER.reduce((x, j) => x + pa(j.id, pp.atelier[j.id]), 0);
    const neuf = (s, j) => ({ semaine: s, jour: j, journees: 0, evenements: 0, ameliorations: 0, defi: 0, atelier: zero(), jJ: 0, jE: 0, jA: 0, reste: 0, avant: 0, semaines: [] });
    const lire = (now) => { const s = G.semaineKey(now), j = G.dayKey(now); if (!p) p = neuf(s, j);
      if (s > p.semaine) { const t = sd(p); p.avant += t; if (t > 0) { p.semaines.push({ semaine: p.semaine, points: t }); p.semaines = p.semaines.slice(-MA.semaines); } const n = neuf(s, j); n.avant = p.avant; n.semaines = p.semaines; p = n; }
      else if (j > p.jour) { p.jour = j; p.jJ = 0; p.jE = 0; p.jA = 0; } return p; };
    return {
      journee: (now) => { const q = lire(now); if (q.jJ) return 0; q.jJ = MA.journee; q.journees += MA.journee; return MA.journee; },
      defi: (now) => { const q = lire(now); if (q.defi) return 0; q.defi = MA.defi; return MA.defi; },
      evenement: (now) => { const q = lire(now), n = Math.max(0, Math.min(MA.evenement, MA.evenementsJour - q.jE)); q.jE += n; q.evenements += n; return n; },
      atelier: (now, id, sc) => { const q = lire(now), j = jeu(id), a = pa(id, q.atelier[id]); q.atelier[id] = Math.max(q.atelier[id], Math.min(j.max, Math.max(0, Math.floor(sc)))); return pa(id, q.atelier[id]) - a; },
      amelioration: (now, prix, r, pal) => { const q = lire(now); if (prix > 0 && r > 0) q.reste += Math.min(1e6, prix / (r * MA.tranche)); if (pal > 0) q.reste += MA.palier * Math.min(pal, 20); let n = Math.floor(q.reste); q.reste -= n; n = Math.min(n, Math.max(0, MA.ameliorationsJour - q.jA)); q.jA += n; q.ameliorations += n; return n; },
      detail: (now) => { const q = lire(now); return { semaine: q.semaine, jour: q.jour, total: Math.min(MA.semaine, sd(q)), cumul: q.avant + Math.min(MA.semaine, sd(q)), journees: q.journees, evenements: q.evenements, ameliorations: q.ameliorations, defi: q.defi,
        atelier: G.JEUX_ATELIER.map((j) => [q.atelier[j.id], pa(j.id, q.atelier[j.id])]), auj: [q.jJ, q.jE, q.jA], semaines: q.semaines.slice() }; },
    };
  }
  const graine = (s) => () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  let pas = 0, ecarts = 0, premier = '', semaines = 0;
  for (let k = 1; k <= 200; k++) {
    const r = graine(k), t0 = Date.UTC(2026, 9, 4, 22) + Math.floor(r() * 20) * 864e5 + Math.floor(r() * 24) * H, st = G.newState(t0), m = miroir();
    let t = t0;
    for (let i = 0; i < 300; i++) {
      t = Math.min(t + Math.floor(r() * 3 * H), Date.UTC(2026, 9, 25, 22, 59)); st.now = t; // jusqu'au dimanche 25 octobre, 23 h 59 à Paris
      const x = r(), j = G.JEUX_ATELIER[Math.floor(r() * 3)], sc = Math.floor(r() * j.max * 1.2), prix = r() * 1e6, ry = r() * 1e3 + 1, pal = Math.floor(r() * 3);
      let a = 0, b = 0;
      if (x < 0.15) { a = G.marquerEvenement(st); b = m.evenement(t); } else if (x < 0.2) { a = G.marquerJournee(st); b = m.journee(t); } else if (x < 0.22) { a = G.marquerDefi(st); b = m.defi(t); }
      else if (x < 0.4) { a = G.marquerAtelier(st, j.id, sc); b = m.atelier(t, j.id, sc); } else if (x < 0.6) { a = G.marquerAmelioration(st, prix, ry, pal); b = m.amelioration(t, prix, ry, pal); }
      else if (x < 0.75) { a = G.marquerObjectif(st) + G.marquerPalierEvt(st) + G.marquerPresence(st, ['petrissage', 'descente', 'mystere', 'commande'][Math.floor(r() * 4)]); b = 0; } // (le lot 7 : rien avant le 26)
      const d = G.detailPoints(st), e = m.detail(t);
      const vu = JSON.stringify([a, d.semaine, d.jour, d.total, d.cumul, d.journees, d.evenements, d.ameliorations, d.defi, d.atelier.map((z) => [z.score, z.points]), [d.aujourdhui.journee, d.aujourdhui.evenements, d.aujourdhui.ameliorations], d.semaines, G.pointsSemaine(st), d.bareme]);
      const att = JSON.stringify([b, e.semaine, e.jour, e.total, e.cumul, e.journees, e.evenements, e.ameliorations, e.defi, e.atelier, e.auj, e.semaines, e.total, 1]);
      pas++; if (vu !== att) { ecarts++; if (!premier) premier = `graine ${k}, pas ${i} : ${vu} ≠ ${att}`; }
    }
    semaines += m.detail(t).semaines.length;
  }
  check(ecarts === 0 && pas === 60000 && semaines > 150, `${pas} actions tirées au hasard du 5 au 25 octobre (${semaines} semaines finies passées à l’historique) : le carnet, ses compteurs, l’Atelier, le total, le cumul et l’historique sont ceux de master, à chaque pas${premier ? ' — PREMIER ÉCART ' + premier : ''}`); }

titre('la bascule : du dimanche 25 octobre (barème d’avant) au lundi 26 (barème du lot 7)');
{ const st = boutique(Date.UTC(2026, 9, 25, 19)); // dimanche 25 octobre, 20 h à Paris (heure d'hiver depuis 3 h)
  st.points = { semaine: '2026-10-19', jour: '2026-10-25', journees: 70, evenements: 120, ameliorations: 180, defi: 30, atelier: { four: 450, faconnage: 0, memoire: 25 }, jJournee: 10, jEvenements: 20, jAmeliorations: 30, reste: 0, avant: 900, semaines: [{ semaine: '2026-10-12', points: 450 }] };
  let d = G.detailPoints(st);
  check(d.bareme === 1 && d.total === 70 + 120 + 180 + 30 + 40 && st.points.v === 1, `dimanche 25 au soir, une vieille sauvegarde de la semaine du 19 : ${d.total} points au barème d’avant`);
  check(G.marquerPresence(st, 'petrissage') === 0 && G.marquerObjectif(st) === 0 && G.marquerAtelier(st, 'faconnage', 1e9) === 20 && G.pointsSemaine(st) === 460, 'dimanche 23 h : pas de présence ni d’objectifs, l’Atelier de la semaine (+20) : 460');
  st.now = Date.UTC(2026, 9, 25, 22, 59); d = G.detailPoints(st);
  check(d.semaine === '2026-10-19' && d.bareme === 1 && d.total === 460, 'dimanche 23 h 59 (heure d’hiver) : encore la semaine du 19, au barème d’avant');
  st.now = Date.UTC(2026, 9, 25, 23, 1); d = G.detailPoints(st);
  check(d.semaine === '2026-10-26' && d.bareme === 2 && st.points.v === 2 && d.total === 0 && d.semaines.length === 2 && d.semaines[1].semaine === '2026-10-19' && d.semaines[1].points === 460 && d.cumul === 900 + 460 && d.atelierMax === 4 && d.aujourdhui.max === 137,
    `lundi 26 octobre, 0 h 01 : la semaine finie (460, barème d’avant) part dans l’historique, la nouvelle repart de 0 au barème du lot 7 (cumul ${d.cumul})`);
  const r = [G.marquerPresence(st, 'petrissage'), G.marquerObjectif(st), G.marquerPalierEvt(st), G.marquerAtelier(st, 'four', 450)];
  check(r.join(',') === '4,2,3,4' && G.pointsSemaine(st) === 13 && G.detailPoints(st).aujourdhui.brut === 9, `lundi 26 : la présence (+4), les objectifs (+2), les paliers (+3) et l’Atelier du jour (+4 sur 4) comptent : ${G.pointsSemaine(st)}`); }
{ // une partie neuve créée le dimanche 25, jouée jusqu'au lundi 26 : la semaine du 19 au barème d'avant, puis le nouveau
  const st = G.newState(Date.UTC(2026, 9, 25, 9)); st.now = Date.UTC(2026, 9, 25, 9);
  G.marquerJournee(st); G.marquerAtelier(st, 'memoire', 25); for (let k = 0; k < 100; k++) G.marquerPresence(st, 'mystere');
  check(st.points.v === 1 && G.pointsSemaine(st) === 30, 'une partie neuve le dimanche 25 : carnet version 1, journée 10 + Atelier 20 (semaine), pas de présence');
  st.now = Date.UTC(2026, 9, 26, 9); for (let k = 0; k < 100; k++) G.marquerPresence(st, 'mystere');
  const d = G.detailPoints(st);
  check(d.bareme === 2 && d.semaines[0].points === 30 && d.total === 70 && d.aujourdhui.brut === 80 && d.aujourdhui.compte === 70, `lundi 26 : 30 dans l’historique ; cent clients mystère : brut 80 → ${d.aujourdhui.compte} comptés (60 + 20 / 2 : la dégressivité du lot 7)`); }

titre('avant le 26 octobre : une vieille sauvegarde de la semaine du 19 octobre, gardée telle quelle');
{ // le carnet de master, mercredi 21 octobre (le même que plus haut, une semaine du barème d'avant) : rien ne change, ni le total, ni la forme
  const L = Date.UTC(2026, 9, 18, 22), J = 24 * H, st = boutique(L + 2 * J + 10 * H);
  st.points = { semaine: '2026-10-19', jour: '2026-10-21', journees: 20, evenements: 40, ameliorations: 53, defi: 30, atelier: { four: 400, faconnage: 0, memoire: 12 },
    jJournee: 0, jEvenements: 6, jAmeliorations: 5, reste: 0.4, avant: 512, semaines: [{ semaine: '2026-10-12', points: 512 }] };
  let d = G.detailPoints(st);
  check(d.total === 171 && d.bareme === 1 && st.points.v === 1 && st.points.atelier.four === 400 && st.points.atelier.memoire === 12 && d.atelier.map((a) => a.points).join() === '18,0,10' && d.cumul === 512 + 171 && Math.abs(st.points.reste - 0.4) < 1e-9 && d.aujourdhui.evenements === 6 && d.aujourdhui.ameliorations === 5,
    `mercredi 21 : ${d.total} points, comme le jeu d’avant (20 + 40 + 53 + 30 + Atelier 18 + 10) ; ses meilleurs scores de la semaine, ses compteurs du jour, le cumul gardés`);
  st.now = L + 2 * J + 15 * H; for (let k = 0; k < 40; k++) G.marquerPresence(st, 'mystere'); const g = G.marquerAtelier(st, 'four', 450);
  check(g === 2 && G.pointsSemaine(st) === 173 && G.detailPoints(st).aujourdhui.presence.mystere === 0, 'mercredi après-midi : la présence ne compte pas ; l’enfournement au score plein : +2 (18 → 20 sur la semaine) : 173');
  st.now = L + 3 * J + 9 * H; d = G.detailPoints(st);
  check(d.total === 173 && d.atelier.find((a) => a.id === 'four').score === 450 && d.aujourdhui.evenements === 0, 'jeudi : 173, l’Atelier de la semaine reste, les plafonds du jour repartent');
  st.now = L + 7 * J + 9 * H; d = G.detailPoints(st);
  check(d.total === 0 && d.bareme === 2 && d.semaines.length === 2 && d.semaines[1].points === 173 && d.cumul === 512 + 173, 'lundi 26 : 173 dans l’historique, le barème du lot 7 commence'); }
{ // un carnet version 2 d'une version de test du lot 7, joué la semaine du 19 : ramené au barème d'avant, sans rien perdre de ce qui comptait
  const L = Date.UTC(2026, 9, 18, 22), J = 24 * H, st = boutique(L + 2 * J + 10 * H);
  st.points = { v: 2, semaine: '2026-10-19', jour: '2026-10-21', journees: 20, evenements: 40, ameliorations: 53, defi: 30, objectifs: 12, presence: { petrissage: 16, descente: 0, mystere: 30, commande: 8 }, paliers: 6,
    comptes: 150, atelierSemaine: 28, atelier: { four: 450, faconnage: 0, memoire: 0 }, jJournee: 0, jEvenements: 6, jAmeliorations: 5, jObjectifs: 2, jPresence: { petrissage: 4, descente: 0, mystere: 10, commande: 0 }, jPaliers: 3,
    reste: 0.2, avant: 512, semaines: [{ semaine: '2026-10-12', points: 512 }] };
  let d = G.detailPoints(st);
  check(d.bareme === 1 && st.points.v === 1 && d.total === 20 + 40 + 53 + 30 + 28 && d.atelierSemaine === 28 && d.objectifs === 0 && d.paliers === 0 && Object.values(d.presence).every((v) => v === 0) && st.points.comptes === 0 && st.points.atelier.four === 450 && d.cumul === 512 + 171,
    `un carnet version 2 (version de test) la semaine du 19 : ramené au barème d’avant, ${d.total} points (journées, événements, améliorations, défi, et ses 28 points d’Atelier acquis) ; objectifs, présence et paliers ne comptent pas`);
  G.marquerAtelier(st, 'memoire', 25); d = G.detailPoints(st);
  check(d.total === 20 + 40 + 53 + 30 + 40 && d.atelierSemaine === 40 && d.atelier.map((a) => a.points).join() === '20,0,20', `puis l’Atelier au barème d’avant prend le relais dès qu’il dépasse l’acquis (20 + 20 = 40 > 28) : ${d.total}`);
  st.points.atelierSemaine = 1e9; check(G.pointsSemaine(st) <= 510 && G.detailPoints(st).atelierSemaine === 60, 'un acquis absurde : borné à 60 (l’Atelier du barème d’avant)');
  st.now = L + 7 * J + 9 * H; d = G.detailPoints(st);
  check(d.bareme === 2 && d.semaines[1].points === 203 && d.total === 0, `lundi 26 : la semaine finie (${d.semaines[1].points}) part dans l’historique, le carnet repart en version 2`); }

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

// ─── 4. les profils du lot 7 : une heure, quatre heures, l'écran allumé douze heures sans toucher ───
// La boucle de test/longevite.js reprise telle quelle (lue dans le fichier, adaptée par remplacements de texte : un remplacement manqué
// lève une erreur), avec un mode « écran allumé sans toucher » par session : le jeu tourne, la scène sert ses clients, mais personne ne
// touche rien (ni achat, ni événement, ni client mystère, ni objectif réclamé). Le VRAI carnet de points (G.detailPoints) fait le compte ;
// l'Atelier se joue une fois par jour à une qualité donnée (G.marquerAtelier, sans prime) ; la série du serveur (30 pour qui joue les
// sept jours) s'ajoute à tous. Une partie avancée (21 jours de régulier), la semaine du lundi 26 octobre 2026.
titre('les profils : 4 h nettement devant 1 h, l’écran allumé sans jouer presque rien de plus');
const simulerIdle = (() => {
  const fs = require('fs'), pathm = require('path');
  let src = fs.readFileSync(pathm.join(__dirname, 'longevite.js'), 'utf8');
  src = src.slice(src.indexOf('function simuler('), src.indexOf('function rapport('));
  const R = (a, b) => { if (!src.includes(a)) throw new Error('remplacement manqué dans test/longevite.js : ' + a); src = src.replace(a, b); };
  R('for (const [h, minutes] of prof.sessions) {', 'for (const [h, minutes, mode] of prof.sessions) { const idle = mode === \'idle\';');
  R('G.absence(st, debut); now = debut;', 'G.absence(st, debut); now = debut; if (opts.session) opts.session(st, j, idle);');
  R('const envie = opts.prestige !== false &&', 'const envie = !idle && opts.prestige !== false &&');
  R('let lances = 0;', 'let lances = 0; if (!idle)');
  R('if (st.saison && st.saison.niv > 0 && !st.saison.actif) G.lancerSaison(st);', 'if (!idle && st.saison && st.saison.niv > 0 && !st.saison.actif) G.lancerSaison(st);');
  R('const out = G.tick(st, 1, now, rnd);', 'const out = G.tick(st, 1, now, rnd); if (idle) { if (s % 4 === 0 && (G.tauxParSeconde(st) > 0 || st.stats.ventes > 0)) { st.stats.clients++; G.noter(st, \'clients\', 1); } M.actif++; dayInfo.actif++; continue; }');
  R('M.attenteDerniere = attenteSession / (minutes * 60);', 'if (idle) st.lastSeen = now + 1000; M.attenteDerniere = attenteSession / (minutes * 60);');
  // eslint-disable-next-line no-new-func
  return new Function('G', 'PRODUITS', 'AMELIORATIONS', 'seeded', 'H', 'PROFILS', 'T0_DEFAUT', `let t0 = T0_DEFAUT; ${src}; return simuler;`)(G, G.PRODUITS, G.AMELIORATIONS, (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }, H, LG.PROFILS, LG.T0);
})();
const PROFILS7 = {
  h1: { nom: '1 h/jour', sessions: [[8, 15], [12.5, 15], [19, 30]], q: 0.6 },
  h4: { nom: '4 h/jour', sessions: [[8, 60], [12.5, 60], [17, 60], [20.5, 60]], q: 0.8 },
  afk: { nom: 'écran allumé 12 h sans toucher (+1 h de jeu)', sessions: [[8, 15], [8.25, 720, 'idle'], [20.25, 45]], q: 0.6 },
};
const LUNDI7 = LG.T0 + 21 * 864e5, avancee = LG.simuler('regulier', 21).st;
function semaine7(id, seed) { // une semaine du profil (partie avancée) : les points du vrai carnet, jour par jour, + la série
  const p = PROFILS7[id], nom = '__lot7_' + id, st = clone(avancee); st.lastSeen = LUNDI7; st.now = LUNDI7; st.created = LUNDI7;
  LG.PROFILS[nom] = { sessions: p.sessions };
  const jours = [];
  try {
    simulerIdle(nom, 7, { t0: LUNDI7, st, seed, session: (s, j, idle) => {
      if (!idle) G.JEUX_ATELIER.forEach((x) => G.marquerAtelier(s, x.id, Math.round(p.q * x.plein)));
      jours[j] = G.detailPoints(s).aujourdhui; } });
  } finally { delete LG.PROFILS[nom]; }
  const d = G.detailPoints(st); // le dimanche soir, après la dernière session
  return { total: d.total + P.serie[3] + P.serie[7], jeu: d.total, d, auj: d.aujourdhui };
}
{ const t0 = Date.now(), R = {};
  for (const id of Object.keys(PROFILS7)) { R[id] = semaine7(id, 7); const x = R[id]; console.log(`    ${PROFILS7[id].nom.padEnd(46)} ${String(x.total).padStart(4)} (jeu ${x.jeu} + série 30 ; journées ${x.d.journees}, objectifs ${x.d.objectifs}, événements ${x.d.evenements}, présence ${Object.values(x.d.presence).reduce((a, b) => a + b, 0)}, améliorations ${x.d.ameliorations}, défi ${x.d.defi}, Atelier ${x.d.atelierSemaine} ; dimanche ${x.auj.brut} brut → ${x.auj.compte})`); }
  const r4 = R.h4.total / R.h1.total, ra = R.afk.total / R.h1.total;
  console.log(`    (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  check(r4 >= 1.4, `4 h nettement devant 1 h : ${R.h4.total} contre ${R.h1.total} (×${r4.toFixed(2)}, au moins ×1,40 ; ×1,02 avant le lot 7)`);
  check(ra <= 1.06, `l’écran allumé 12 h ne gagne presque rien de plus que 1 h : ${R.afk.total} (×${ra.toFixed(2)}, au plus ×1,06)`);
  check(Object.values(R).every((x) => x.jeu <= P.semaine && x.total <= P.semaine + 30), `aucun profil honnête au-delà du maximum (${P.semaine} + série 30)`);
  const s2 = { h1: semaine7('h1', 23).total, h4: semaine7('h4', 23).total };
  check(s2.h4 / s2.h1 >= 1.4, `un autre tirage du hasard (graine 23) : 4 h ${s2.h4} contre 1 h ${s2.h1} (×${(s2.h4 / s2.h1).toFixed(2)})`); }

console.log(`\n${n - fails}/${n} vérifications.`);
console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
process.exit(fails ? 1 : 0);
