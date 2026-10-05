#!/usr/bin/env node
// Rythme de la boulangerie, objectifs du jour, événements, absence, formats.
'use strict';
const G = require('../src/game.js');
const { PRODUITS } = G;
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const fmtT = (s) => s < 90 ? Math.round(s) + ' s' : s < 5400 ? (s / 60).toFixed(1) + ' min' : (s / 3600).toFixed(1) + ' h';
const T0 = Date.UTC(2026, 9, 7, 8, 0); // un mercredi : pas de jour de marché
const seeded = (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

function run(hours, policy, start = T0) {
  const st = G.newState(start); st.mode = 'max';
  const unlockAt = {}, staffAt = {}, dt = 0.5; let t = 0, taps = 0, evs = { mystere: 0 };
  const rnd = seeded(7);
  while (t < hours * 3600) {
    st.stations.forEach((s, i) => { if (s.niv > 0 && !s.staff && !s.actif) { G.lancer(st, i); taps++; } });
    const out = G.tick(st, dt, start + t * 1000, rnd); t += dt;
    if (out.nouvelEv) evs[out.nouvelEv.type] = (evs[out.nouvelEv.type] || 0) + 1;
    if (out.mystere) evs.mystere++;
    if (st.ev && st.ev.type === 'commande' && st.ev.fait >= st.ev.n) G.livrer(st);
    if (st.ev && st.ev.type === 'critique') st.ev.restants.slice().forEach((i) => G.servir(st, i));
    if (st.ev && st.ev.type === 'petrissage') { G.petrir(st); G.petrir(st); } // 4 touches par seconde
    if (st.ev && st.ev.type === 'panne') G.reparer(st);
    if (Math.round(t / dt) % 4 === 0) policy(st, t, { unlockAt, staffAt });
  }
  return { st, unlockAt, staffAt, taps, evs };
}
const greedy = (st, t, m) => {
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv > 0 && !s.staff && st.coins >= PRODUITS[i].staff) { G.embaucher(st, i); m.staffAt[i] = m.staffAt[i] || t; } }
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv === 0 && st.coins >= PRODUITS[i].debloquer) { G.acheter(st, i); m.unlockAt[i] = t; break; } }
  for (const a of G.AMELIORATIONS) if (!st.ameliorations[a.id] && st.coins >= a.cout * 1.2) G.amelioration(st, a.id);
  const next = st.stations.findIndex((s) => s.niv === 0), taux = G.tauxParSeconde(st);
  if (next > 0 && st.coins < PRODUITS[next].debloquer && st.coins + taux * 600 >= PRODUITS[next].debloquer) return; // on économise pour la prochaine recette
  let best = -1, bestRatio = 0;
  for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv === 0) continue; const n = G.quantite(st, i), prix = G.coutNiveaux(i, s.niv, n); if (prix > st.coins) continue; const gain = PRODUITS[i].rev * n * G.palierMult(s.niv + n) * G.ameliorationMult(st, i) / PRODUITS[i].temps; const r = gain / prix; if (r > bestRatio) { bestRatio = r; best = i; } }
  if (best >= 0) G.acheter(st, best);
};
console.log('── joueur actif, 3 h (mercredi) ──');
const R = run(3, greedy);
PRODUITS.forEach((p, i) => console.log(`  ${p.nom.padEnd(18)} débloqué ${R.unlockAt[i] != null ? fmtT(R.unlockAt[i]).padStart(9) : '        —'} · apprenti ${R.staffAt[i] != null ? fmtT(R.staffAt[i]).padStart(9) : '        —'} · niveau ${R.st.stations[i].niv}`));
console.log(`  taux final ${G.fmtEur(G.tauxParSeconde(R.st))}/s · gagné ${G.fmtEur(R.st.lifetime)} · étoiles gagnables ${G.etoilesGagnables(R.st)} · touches ${R.taps} · événements ${JSON.stringify(R.evs)}`);
check(R.unlockAt[1] < 90, 'croissants en moins de 90 s');
check(R.staffAt[0] < 180, 'premier apprenti en moins de 3 min');
check(R.unlockAt[3] != null && R.unlockAt[3] < 30 * 60, 'tarte en moins de 30 min');
check(R.unlockAt[4] != null && R.unlockAt[4] < 3 * 3600, 'éclairs en moins de 3 h');
check(G.etoilesGagnables(R.st) <= 2 && R.st.lifetime > 5e8, 'après 3 h, la première boutique a gagné plus de 500 M € mais pas encore de quoi repartir (au plus 2 étoiles)');
check(G.etoilesPour(3e10, 0) === 1 && G.etoilesPour(3e12, 0) === 10 && G.etoilesPour(3e12, 25) === 7 && G.etoilesPour(3e12, 100) === 4, 'étoiles : 1 à 30 Md €, 10 à 3 Bn €, et plus chères quand on en possède déjà');
// chaque niveau doit valoir le coup : il se rembourse vite, quel que soit le produit
{
  const cycles = (i, niv) => G.coutNiveau(i, niv) / (PRODUITS[i].rev * G.palierMult(niv + 1)); // fournées nécessaires pour rembourser un niveau
  const pire1 = Math.max(...PRODUITS.map((p, i) => cycles(i, 1))), pire25 = Math.max(...[0, 1, 2, 3].map((i) => cycles(i, 25)));
  check(pire1 <= 30, `au niveau 1, un niveau se rembourse en 30 fournées au plus, quel que soit le produit (pire : ${pire1.toFixed(0)})`);
  check(pire25 <= 100, `au niveau 25, les quatre premiers produits se remboursent en 100 fournées au plus (pire : ${pire25.toFixed(0)})`);
  check(PRODUITS.every((p) => p.debloquer >= p.cout), 'débloquer une recette coûte au moins autant qu’un niveau');
}
const TYPES = ['rush', 'commande', 'critique', 'meunier', 'petrissage', 'panne', 'anniversaire'], nEv = TYPES.reduce((a, t) => a + (R.evs[t] || 0), 0);
check(nEv >= 20 && nEv <= 60, `entre 20 et 60 événements en 3 h (${nEv})`);
check(TYPES.every((t) => R.evs[t] >= 1), 'chacun des sept types d’événement est arrivé au moins une fois');
check(R.evs.mystere >= 20, 'client mystère régulier');

console.log('── objectifs du jour ──');
{
  const st = G.newState(T0); st.now = T0;
  const j = G.objectifsDuJour(st, T0);
  console.log('  ' + j.objectifs.map((o) => `${o.txt} (prime ${G.fmtEur(o.prime)})`).join(' · '));
  check(j.objectifs.length === 3 && j.objectifs[0].type === 'gagner', 'trois objectifs, le premier est « gagner »');
  check(j.objectifs.every((o) => o.cible >= 1 && o.prime >= 40), 'cibles et primes positives');
  const j2 = G.objectifsDuJour(G.newState(T0), T0);
  check(JSON.stringify(j2.objectifs.map((o) => o.txt)) === JSON.stringify(j.objectifs.map((o) => o.txt)), 'les mêmes objectifs pour la même date et la même boutique');
  for (let k = 0; k < 400; k++) { G.lancer(st, 0); G.tick(st, 1.01, T0 + k * 1010); }
  const g = j.objectifs[0];
  check(g.progres > 0, `progrès « gagner » : ${G.fmtEur(g.progres)} / ${G.fmtEur(g.cible)}`);
  g.progres = g.cible; g.fait = true;
  const r = G.reclamer(st, 0);
  check(r.ok && st.coins >= g.prime, 'prime réclamée');
  check(!G.reclamer(st, 0).ok, 'une prime ne se réclame qu’une fois');
  j.objectifs.forEach((o, k) => { o.progres = o.cible; o.fait = true; if (k) G.reclamer(st, k); });
  check(st.etoiles === 1 && st.serie === 1 && j.etoileDonnee, 'les trois objectifs : une étoile et une série de 1');
  const R2 = run(1, greedy, T0 + 10 * 3600 * 1000); // le lendemain
  const st2 = R2.st; st2.serie = 1; st2.dernierJourComplet = G.dayKey(T0);
  const next = G.objectifsDuJour(st2, T0 + 864e5 + 3600 * 1000);
  console.log('  lendemain (après 1 h de jeu) : ' + next.objectifs.map((o) => o.txt).join(' · '));
  check(next.objectifs[0].cible > j.objectifs[0].cible, 'les cibles suivent la boutique');
}
console.log('── événements ──');
{
  const st = G.newState(T0); st.now = T0; st.stations[1].niv = 5; st.stations[1].staff = true; st.stations[1].actif = true;
  const base = G.revenu(st, 1);
  G.lancerRush(st);
  check(Math.abs(G.revenu(st, 1) / base - 3) < 1e-9, 'coup de feu : ventes ×3');
  st.now = T0 + 61000; check(Math.abs(G.revenu(st, 1) / base - 1) < 1e-9, 'le coup de feu s’arrête après 60 s');
  const ev = G.lancerCommande(st, () => 0.5);
  console.log(`  commande : ${ev.n} ${PRODUITS[ev.i].nom} en 3 min, prime ${G.fmtEur(ev.prime)}`);
  check(ev.type === 'commande' && ev.prime > G.revenuBase(st, ev.i) * ev.n * 5, 'la commande paie plus de 5 fois le prix');
  ev.fait = ev.n; const l = G.livrer(st); check(l.ok && !st.ev, 'livraison : prime versée, événement clos');
  const sam = Date.UTC(2026, 9, 10, 12, 0); st.now = sam; check(G.jourDeMarche(sam) && Math.abs(G.boostMult(st) - 1.5) < 1e-9, 'samedi : jour de marché ×1,5');
  check(G.pourboire(st) >= 20, 'pourboire du client mystère ≥ 20 €');
  // le critique : trois recettes vendues → tout ×2 pendant 5 min
  st.now = T0; st.ev = null; st.boost = null; [0, 1, 2].forEach((i) => { st.stations[i].niv = 1; st.stations[i].staff = true; st.stations[i].actif = true; st.stations[i].prog = PRODUITS[i].temps - 0.01; });
  const cr = G.lancerCritique(st, () => 0); check(cr.type === 'critique' && cr.restants.length === 3, 'le critique demande trois recettes : ' + cr.restants.map((i) => PRODUITS[i].nom).join(', '));
  G.tick(st, 0.05, T0 + 50); check(st.ev && st.ev.restants.length === 3, 'les ventes automatiques ne comptent pas : il faut le servir');
  check(!G.servir(st, 7).ok && G.servir(st, cr.restants[0]).ok && st.ev.restants.length === 2, 'on sert une recette en touchant sa carte');
  cr.restants.slice().forEach((i) => G.servir(st, i)); check(!st.ev && st.boost && st.boost.mult === 2 && Math.abs(G.boostMult(st) - 2) < 1e-9, 'le critique conquis : tout ×2');
  st.now = T0 + 301000; check(Math.abs(G.boostMult(st) - 1) < 1e-9, 'la bonne critique dure 5 min'); st.boost = null;
  // le meunier : −40 %
  st.now = T0; const plein = G.coutNiveaux(0, st.stations[0].niv, 1); G.lancerMeunier(st);
  check(Math.abs(G.prixNiveaux(st, 0, 1) / plein - 0.6) < 1e-9, 'le meunier : niveaux à −40 %');
  st.coins = plein * 0.7; st.mode = 1; check(G.acheter(st, 0).ok && st.coins < plein * 0.2, 'on achète au prix remisé');
  st.now = T0 + 91000; check(Math.abs(G.prixNiveaux(st, 0, 1) / G.coutNiveaux(0, st.stations[0].niv, 1) - 1) < 1e-9, 'la remise s’arrête après 90 s'); st.ev = null;
  // pétrissage : 30 touches
  st.now = T0; st.coins = 0; const pe = G.lancerPetrissage(st); for (let k = 0; k < 29; k++) G.petrir(st);
  check(st.ev && st.ev.taps === 29, '29 touches : pas encore'); const fin = G.petrir(st); check(fin.fini && !st.ev && st.coins === pe.prime && pe.prime >= 30, `30 touches : prime ${G.fmtEur(pe.prime)}`);
  st.now = T0 + 21000; G.lancerPetrissage(st); st.now = T0 + 42000; check(!G.petrir(st).ok, 'trop tard, plus de touches comptées'); st.ev = null;
  // panne de four : le produit s'arrête, 8 touches pour réparer
  st.now = T0; st.coins = 0; const pa = G.lancerPanne(st, () => 0); const sta = st.stations[pa.i]; sta.prog = 0.5;
  G.tick(st, 1, T0 + 1000); check(sta.prog === 0.5, `panne : ${PRODUITS[pa.i].nom} à l’arrêt`);
  for (let k = 0; k < 7; k++) G.reparer(st); check(st.ev && st.ev.coups === 7, '7 touches : toujours en panne');
  const rep = G.reparer(st); check(rep.fini && !st.ev && st.coins === pa.prime, `réparé : prime ${G.fmtEur(pa.prime)}`);
  G.tick(st, 0.3, T0 + 1300); check(Math.abs(sta.prog - 0.8) < 1e-9, 'la production repart');
  // goûter d'anniversaire : un seul produit ×5
  st.now = T0; st.jour.pain = 99; st.specialite = null; const an = G.lancerAnniversaire(st, () => 0.99); const autre = st.stations.findIndex((x, i) => x.niv > 0 && i !== an.i);
  check(Math.abs(G.revenu(st, an.i) / G.revenuBase(st, an.i) - 5) < 1e-9 && Math.abs(G.revenu(st, autre) / G.revenuBase(st, autre) - 1) < 1e-9, `anniversaire : ${PRODUITS[an.i].nom} ×5, les autres ×1`); st.ev = null;
  // jamais deux fois le même d'affilée, et tous les types finissent par sortir
  const vus = {}, r2 = seeded(3); let prev = ''; let repete = false;
  for (let k = 0; k < 60; k++) { st.now = T0 + k * 1000; const e = G.lancerEvenement(st, r2); if (e.type === prev) repete = true; prev = e.type; vus[e.type] = true; st.ev = null; }
  check(!repete && Object.keys(vus).length === 7, 'tirage : jamais deux fois le même type d’affilée, les sept sortent');
}
console.log('── le boulanger ──');
{
  const st = G.newState(T0); st.now = T0;
  check(G.niveau(st) === 1 && G.titre(st) === 'Apprenti' && G.ptsTalents(st) === 0 && !G.apprendre(st, 'mains').ok, 'départ : apprenti niveau 1, aucun point, rien à apprendre');
  G.gagnerXp(st, G.XP_NIVEAU(1)); check(G.niveau(st) === 2 && G.ptsTalents(st) === 1, 'premier niveau : un point de talent');
  const t0 = G.temps(st, 1); check(G.apprendre(st, 'mains').ok && Math.abs(G.temps(st, 1) / t0 - 0.95) < 1e-9 && G.ptsTalents(st) === 0, 'mains rapides : fournées 5 % plus rapides, point dépensé');
  st.xp = 1e6; check(G.niveau(st) >= 26 && G.titre(st) === 'Meilleur Ouvrier de France', 'beaucoup de savoir-faire : Meilleur Ouvrier de France');
  for (const t of G.TALENTS) while (G.talent(st, t.id) < t.max) G.apprendre(st, t.id);
  check(G.TALENTS.every((t) => G.talent(st, t.id) === t.max) && !G.apprendre(st, 'mains').ok, 'tous les talents au maximum, plus rien à apprendre');
  check(Math.abs(G.tempsMult(st) - 0.75) < 1e-9 && G.heuresAbsence(st) === 12 && Math.abs(G.affluenceMult(st) - 3) < 1e-9, 'au maximum : fournées −25 %, absence 12 h, fournées à la main ×3');
  check(Math.abs(G.prixStaff(st, 0) / PRODUITS[0].staff - 0.6) < 1e-9 && Math.abs(G.prixBonus(st, G.AMELIORATIONS[0]) / G.AMELIORATIONS[0].cout - 0.68) < 1e-9 && Math.abs(G.primeMult(st) - 1.75) < 1e-9, 'embauches −40 %, bonus −32 %, primes d’événement +75 %');
  st.lifetimeRun = 1e12; G.nouvelleBoutique(st, T0); check(st.stations.filter((s) => s.niv > 0).length === 5 && G.talent(st, 'mains') === 5 && st.xp > 1e6, 'nouvelle boutique : 5 recettes d’emblée, talents gardés, savoir-faire gagné');
  st.stations[0].actif = true; st.stations[0].prog = 0.99; const avant = st.coins; G.tick(st, 0.02, T0 + 20);
  check(Math.abs(st.coins - avant - G.revenu(st, 0) * 3) < 1e-6, 'bouche-à-oreille : la fournée à la main rapporte ×3');
  const s2 = G.newState(T0); s2.now = T0; s2.coins = 1e9; G.acheter(s2, 1); G.embaucher(s2, 0); check(s2.xp === 25, 'débloquer les croissants : +20 de savoir-faire ; embaucher Léo : +5');
}
console.log('── quartiers, nom, saisons ──');
{
  const st = G.newState(T0);
  check(G.quartier(st) === 0 && G.nomBoutique(st) === 'Au Fournil du Village', 'première boutique : le village, nom par défaut');
  st.boutiques = 2; check(G.QUARTIERS[G.quartier(st)].id === 'paris' && G.nomBoutique(st) === 'Le Fournil de la Rue', 'deuxième boutique : le coin de rue parisien');
  st.boutiques = 6; check(G.quartier(st) === 0, 'sixième boutique : retour au village');
  check(G.renommer(st, '  <b>Chez  Mamie</b>  ') === 'bChez Mamie/b' && G.renommer(st, 'x'.repeat(40)).length === 24 && G.renommer(st, '') === 'Au Fournil du Village', 'nom nettoyé, 24 caractères au plus, vide → nom par défaut');
  const tags = (y, m, d) => G.saison(new Date(y, m - 1, d, 12).getTime()).join(',');
  check(tags(2026, 12, 20) === 'neige,noel' && tags(2026, 1, 10) === 'neige,galette' && tags(2026, 2, 14) === 'neige,coeurs' && tags(2026, 4, 5) === 'paques' && tags(2026, 7, 14) === 'ete,fete' && tags(2026, 10, 25) === 'halloween,feuilles' && tags(2026, 5, 3) === '', `saisons : ${tags(2026, 12, 20)} / ${tags(2026, 1, 10)} / ${tags(2026, 7, 14)} / ${tags(2026, 10, 25)}`);
}
console.log('── pain du jour, défi de la semaine, habitués, spécialité, trophées ──');
{
  const st = G.newState(T0); st.now = T0; st.coins = 1e9; for (const i of [1, 2, 3]) G.acheter(st, i);
  const j = G.objectifsDuJour(st, T0), pain = j.pain;
  check(pain >= 0 && pain < 8 && G.objectifsDuJour(G.newState(T0), T0).pain === pain, `pain du jour : ${PRODUITS[pain].nom}, le même pour la même date`);
  st.specialite = null; check(st.stations[pain].niv > 0 ? Math.abs(G.revenu(st, pain) / G.revenuBase(st, pain) - 1.5) < 1e-9 : true, 'le pain du jour rapporte ×1,5');
  const autre = [0, 1, 2, 3].find((i) => i !== pain); check(Math.abs(G.revenu(st, autre) / G.revenuBase(st, autre) - 1) < 1e-9, 'les autres produits ×1');
  check(G.choisirSpecialite(st, autre).ok && !G.choisirSpecialite(st, 0).ok && Math.abs(G.revenu(st, autre) / G.revenuBase(st, autre) - 2) < 1e-9, `spécialité : ${PRODUITS[autre].nom} ×2, choisie une seule fois`);
  const sm = G.semaineEnCours(st, T0); check(sm && sm.key === '2026-10-05' && sm.cible >= 1 && !sm.fait, `défi de la semaine du lundi 5 : ${sm.txt}`);
  check(G.semaineKey(Date.UTC(2026, 9, 11, 20, 0)) === '2026-10-05' && G.semaineKey(Date.UTC(2026, 9, 12, 6, 0)) === '2026-10-12', 'la semaine va du lundi au dimanche');
  sm.type = 'commandes'; sm.cible = 2; sm.progres = 0; G.noterSemaine(st, 'commandes'); G.noterSemaine(st, 'critiques'); check(sm.progres === 1 && !sm.fait, 'seul le type du défi compte'); G.noterSemaine(st, 'commandes'); check(sm.fait, 'défi réussi');
  const et = st.etoiles, c0 = st.coins, r = G.reclamerSemaine(st); check(r.ok && st.etoiles === et + 1 && st.coins > c0 && !G.reclamerSemaine(st).ok && st.stats.semaines === 1, `récompense : +1 étoile, ${G.fmtEur(r.prime)}, une seule fois`);
  // les habitués
  const h8 = Date.UTC(2026, 9, 7, 6, 30); st.now = h8; const hb = G.habitueAttendu(st, h8); check(hb && hb.id === 'dupuis', 'à 8 h 30, Mme Dupuis est attendue');
  check(G.habitueAttendu(st, Date.UTC(2026, 9, 7, 9, 0)) === null, 'à 11 h, personne');
  const s1 = G.servirHabitue(st, 'dupuis'); check(s1.ok && s1.jours === 1 && !G.servirHabitue(st, 'dupuis').ok, 'servie une fois par jour');
  for (let d = 1; d <= 4; d++) { st.now = h8 + d * 864e5; G.servirHabitue(st, 'dupuis'); }
  check(st.habitues.dupuis.jours === 5 && st.coins > 0 && /fidèle depuis 5 jours/.test(st.carnetEv[st.carnetEv.length - 1].txt), 'cinq jours de suite : un cadeau');
  st.now = h8 + 7 * 864e5; check(G.servirHabitue(st, 'dupuis').jours === 1, 'un jour manqué : la série repart');
  // les trophées
  const s2 = G.newState(T0); s2.now = T0; check(G.verifierTrophees(s2).length === 0, 'au départ, aucun trophée');
  s2.stats.ventes = 1; const tr = G.verifierTrophees(s2); check(tr.length === 1 && tr[0].id === 'premiere' && s2.xp === 10 && s2.trophees.premiere, 'première fournée : trophée et savoir-faire');
  s2.etoiles = 150; s2.boutiques = 5; check(G.verifierTrophees(s2).map((t) => t.id).join(',') === 'etoiles10,etoiles100,boutique2,boutique5', 'plusieurs trophées d’un coup, chacun une seule fois');
}
console.log('── absence de 8 h après 1 h de jeu ──');
const R1 = run(1, greedy);
const before = R1.st.coins;
const abs = G.absence(R1.st, R1.st.lastSeen + 8 * 3600 * 1000);
console.log(`  gagné pendant l'absence ${G.fmtEur(abs.total)} (avant : ${G.fmtEur(before)})`);
check(abs.total > before * 0.5, 'une absence de 8 h rapporte au moins la moitié de la cagnotte');
console.log('── formats ──');
for (const [n, s] of [[0, '0'], [7.5, '7,5'], [999, '999'], [1234, '1,2 k'], [12345, '12,3 k'], [123456, '123 k'], [2.1e9, '2,1 Md'], [5e15, '5 Bd']]) check(G.fmt(n) === s, `${n} → ${G.fmt(n)}`);
console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
process.exit(fails ? 1 : 0);
