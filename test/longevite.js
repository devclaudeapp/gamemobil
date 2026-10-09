#!/usr/bin/env node
// Durabilité : un joueur simulé sur plusieurs semaines, avec des sessions réalistes et des absences.
// Mesure à quel moment il débloque chaque recette, embauche, achète les bonus, ouvre de nouvelles boutiques,
// combien de temps il attend sans rien pouvoir acheter, et si les objectifs du jour sont tenables.
// Les apprentis montent en grade tout seuls (leurs fournées comptent, absences comprises) : leur effet est mesuré ici.
// La recette de saison se joue à la main, comme les produits sans apprenti : le joueur simulé la prépare, l'améliore et la relance.
// Le chat n'a pas d'effet sur les gains. Le test rejoue tout à plusieurs dates de départ (les saisons changent tout au long de l'année).
'use strict';
const G = require('../src/game.js');
const { PRODUITS, AMELIORATIONS } = G;
const seeded = (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const H = 3600 * 1000, T0 = Date.UTC(2026, 9, 4, 22, 0); // lundi 5 octobre 2026, minuit à Paris (le rapport détaillé)
// les départs du test, minuit à Paris : la citrouille d'Halloween, la bûche de Noël, un printemps sans saison puis Pâques, les glaces de l'été
const DEPARTS = { '5 oct.': T0, '1er nov.': Date.UTC(2026, 9, 31, 23, 0), '1er mars': Date.UTC(2027, 1, 28, 23, 0), '7 juin': Date.UTC(2027, 5, 6, 22, 0) };
const PROFILS = {
  occasionnel: { sessions: [[8, 5], [20.5, 12]] },
  regulier: { sessions: [[7.75, 8], [12.5, 8], [21, 20]] },
  assidu: { sessions: [[7.5, 15], [12.25, 15], [18, 20], [22, 30]] },
};
const T0_DEFAUT = T0; let t0 = T0; // le départ de la simulation en cours
const fmtJ = (ms) => { const d = (ms - t0) / 864e5, h = (d % 1) * 24; return `j${Math.floor(d) + 1} ${String(Math.floor(h)).padStart(2, '0')}h${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };
const jourDe = (ms) => Math.floor((ms - t0) / 864e5) + 1;

function simuler(nomProfil, jours, opts = {}) {
  const prof = PROFILS[nomProfil], rnd = seeded(opts.seed || 11);
  const T0 = opts.t0 || T0_DEFAUT; t0 = T0;
  const st = G.newState(T0); st.mode = 10;
  const M = { unlock: {}, staff: {}, bonus: {}, meubles: {}, achatsMeubles: 0, prestiges: [], parJour: [], attente: 0, actif: 0, achats: 0, objectifsFaits: 0, joursComplets: 0, tauxMax: 0 };
  let now = T0, lastAchat = 0;
  M.saison = 0; M.saisonPassif = 0;
  const pr = (p) => rnd() < p;
  const ORDRE_TALENTS = ['affluence', 'mains', 'memoire', 'levetot', 'zele', 'negoce', 'charme', 'pourboire', 'carnet'];
  function apprendre(st) { // le cran le plus bas d'abord, dans l'ordre d'utilité
    while (G.ptsTalents(st) > 0) {
      let pick = null, best = 99;
      for (const id of ORDRE_TALENTS) { const t = G.TALENTS.find((x) => x.id === id), k = G.talent(st, id); if (k < t.max && k < best) { best = k; pick = id; } }
      if (!pick || !G.apprendre(st, pick).ok) break;
    }
  }
  function decider(st) {
    let fait = false;
    apprendre(st);
    for (let i = 0; i < PRODUITS.length; i++) { const s = st.stations[i]; if (s.niv > 0 && !s.staff && st.coins >= G.prixStaff(st, i)) { G.embaucher(st, i); M.staff[i] = M.staff[i] || now; fait = true; } }
    const next = st.stations.findIndex((s) => s.niv === 0);
    if (next > 0 && st.coins >= PRODUITS[next].debloquer) { G.acheter(st, next); M.unlock[next] = M.unlock[next] || now; fait = true; }
    for (const a of AMELIORATIONS) if (!st.ameliorations[a.id] && st.coins >= G.prixBonus(st, a)) { G.amelioration(st, a.id); M.bonus[a.id] = M.bonus[a.id] || now; fait = true; }
    // le mobilier : le cran le moins cher, quand il ne coûte qu'une petite part de la cagnotte (ou qu'un défi du jour le demande) ; ne compte pas comme « quelque chose à attendre »
    { let mm = null, mp = Infinity;
      for (const m of G.MOBILIER) if (G.mobilierCran(st, m.id) < m.max) { const p = G.prixMeuble(st, m.id); if (p < mp) { mp = p; mm = m; } }
      const defi = st.jour && st.jour.objectifs.some((o) => o.type === 'meuble' && !o.fait);
      if (mm && (mp <= st.coins * 0.2 || (defi && mp <= st.coins))) { G.ameliorerMeuble(st, mm.id); M.meubles[mm.id] = M.meubles[mm.id] || now; M.achatsMeubles++; } }
    // la recette de saison : préparée puis améliorée quand elle ne coûte qu'une petite part de la cagnotte, comme le mobilier
    if (st.saison && st.saison.niv < G.SAISON.nivMax && G.coutSaison(st) <= st.coins * 0.2) { G.preparerSaison(st); fait = true; }
    // économiser si un débloquage, une embauche ou un bonus est à moins de 5 min de revenus
    const taux = G.tauxParSeconde(st);
    let cible = Infinity;
    if (next > 0) cible = Math.min(cible, PRODUITS[next].debloquer);
    st.stations.forEach((s, i) => { if (s.niv > 0 && !s.staff) cible = Math.min(cible, G.prixStaff(st, i)); });
    for (const a of AMELIORATIONS) if (!st.ameliorations[a.id]) cible = Math.min(cible, G.prixBonus(st, a));
    const economise = cible < Infinity && cible > st.coins && cible <= st.coins + taux * 300;
    for (let k = 0; k < 3; k++) {
      let best = -1, bestR = 0, bestN = 1;
      for (let i = 0; i < PRODUITS.length; i++) {
        const s = st.stations[i]; if (s.niv === 0) continue;
        const n = Math.min(10, G.maxNiveaux(i, s.niv, st.coins)); if (n < 1) continue;
        const prix = G.coutNiveaux(i, s.niv, n);
        if (economise && prix > st.coins * 0.05) continue; // on garde ses sous pour le gros achat, sauf les petites dépenses
        const gain = (PRODUITS[i].rev * (s.niv + n) * G.palierMult(s.niv + n) - PRODUITS[i].rev * s.niv * G.palierMult(s.niv)) * G.ameliorationMult(st, i) / PRODUITS[i].temps * (s.staff ? 1 : 0.3);
        const r = gain / prix; if (r > bestR) { bestR = r; best = i; bestN = n; }
      }
      if (best < 0) break;
      const prix10 = G.coutNiveaux(best, st.stations[best].niv, bestN);
      st.mode = st.coins > 30 * prix10 ? 'max' : bestN;
      if (G.acheter(st, best).ok) { fait = true; M.achats++; }
    }
    return fait;
  }
  for (let j = 0; j < jours; j++) {
    const jourDebut = T0 + j * 864e5;
    const dayInfo = { objectifs: 0, achats: 0, attente: 0, actif: 0 };
    for (const [h, minutes] of prof.sessions) {
      const debut = jourDebut + h * H;
      G.absence(st, debut); now = debut;
      // ouvrir une nouvelle boutique au début d'une session : quand le gain vaut le coup et que la boutique stagne
      // (le gain d'étoiles n'a pas progressé de moitié depuis hier, ou la dernière session n'offrait plus rien à acheter)
      const gain = G.etoilesGagnables(st);
      const stagne = gain < 1.5 * (M.gainHier || 0) || M.attenteDerniere > 0.7;
      if (gain >= 5 && gain >= 0.25 * st.etoiles && stagne) { const run = st.lifetimeRun; G.nouvelleBoutique(st, now); M.prestiges.push({ t: now, gain, etoiles: st.etoiles, run, duree: (now - (M.debutRun || T0)) / 864e5 }); M.debutRun = now; M.gainHier = 0; }
      if (st.specialite == null) G.choisirSpecialite(st, Math.min(7, 1 + st.boutiques)); // la spécialité de la boutique : une recette de plus en plus avancée
      let enAttente = 0, attenteSession = 0;
      for (let s = 0; s < minutes * 60; s++) {
        now = debut + s * 1000;
        let lances = 0;
        st.stations.forEach((x, i) => { if (x.niv > 0 && !x.staff && !x.actif && lances < 2) { G.lancer(st, i); lances++; } });
        if (st.saison && st.saison.niv > 0 && !st.saison.actif) G.lancerSaison(st); // une touche dès que la fournée de saison est sortie
        const out = G.tick(st, 1, now, rnd);
        if (out.venteSaison) M.saison += out.venteSaison.montant;
        M.saisonPassif += G.tauxParSeconde(st);
        if (s % 4 === 0 && (G.tauxParSeconde(st) > 0 || st.stats.ventes > 0)) { st.stats.clients++; G.noter(st, 'clients', 1); } // la scène sert un client toutes les ~4 s
        if (out.mystere && pr(0.7)) G.encaisserPourboire(st);
        if (out.habitue) G.servirHabitue(st, out.habitue.id);
        if (st.semaine && st.semaine.fait && !st.semaine.reclame) G.reclamerSemaine(st);
        if (st.ev && st.ev.type === 'commande' && st.ev.fait >= st.ev.n) G.livrer(st);
        if (st.ev && st.ev.type === 'critique' && pr(0.5)) G.servir(st, st.ev.restants[0]);
        if (st.ev && st.ev.type === 'petrissage') { G.petrir(st); if (pr(0.7)) G.petrir(st); } // ~1,7 touche par seconde
        if (st.ev && st.ev.type === 'panne' && pr(0.8)) G.reparer(st);
        if (st.jour) st.jour.objectifs.forEach((o, k) => { if (o.fait && !o.reclame) { const r = G.reclamer(st, k); if (r.ok) { M.objectifsFaits++; dayInfo.objectifs++; } } });
        if (s % 3 === 0) { if (decider(st)) { lastAchat = now; enAttente = 0; } else enAttente += 3; }
        if (enAttente > 60) { M.attente++; dayInfo.attente++; attenteSession++; }
        M.actif++; dayInfo.actif++;
      }
      M.attenteDerniere = attenteSession / (minutes * 60);
      M.tauxMax = Math.max(M.tauxMax, G.tauxParSeconde(st));
    }
    M.gainHier = G.etoilesGagnables(st);
    if (st.jour && st.jour.etoileDonnee) M.joursComplets++;
    if (st.jour) for (const o of st.jour.objectifs) if (!o.fait) { M.rates = M.rates || {}; M.rates[o.type] = (M.rates[o.type] || 0) + 1; }
    M.parJour.push({ j: j + 1, niveau: G.niveau(st), etoiles: st.etoiles, boutiques: st.boutiques, lifetime: st.lifetime, taux: G.tauxParSeconde(st), debloques: st.stations.filter((s) => s.niv > 0).length, bonus: Object.keys(st.ameliorations).length, niv: st.stations.map((s) => s.niv), objectifs: dayInfo.objectifs, attente: dayInfo.attente / Math.max(1, dayInfo.actif), coins: st.coins });
  }
  return { st, M };
}

function rapport(nom, jours, R) {
  const { st, M } = R;
  console.log(`\n═══ ${nom} · ${jours} jours · ${PROFILS[nom].sessions.map(([h, m]) => `${m} min`).join(' + ')} par jour ═══`);
  console.log('  recette            débloquée      apprenti');
  PRODUITS.forEach((p, i) => console.log(`  ${p.nom.padEnd(18)} ${(i === 0 ? 'départ' : M.unlock[i] ? fmtJ(M.unlock[i]) : '—').padEnd(14)} ${M.staff[i] ? fmtJ(M.staff[i]) : '—'}`));
  console.log('  bonus : ' + AMELIORATIONS.map((a) => `${a.id} ${M.bonus[a.id] ? fmtJ(M.bonus[a.id]) : '—'}`).join(' · '));
  console.log('  mobilier (premier cran) : ' + G.MOBILIER.map((m) => `${m.id} ${M.meubles[m.id] ? fmtJ(M.meubles[m.id]) : '—'}`).join(' · ') + ` · ${M.achatsMeubles} crans achetés en tout`);
  console.log(`  nouvelles boutiques : ${M.prestiges.length}` + (M.prestiges.length ? ' → ' + M.prestiges.slice(0, 10).map((p) => `${fmtJ(p.t)} (+${p.gain}, ${p.duree.toFixed(1)} j, ${G.fmtEur(p.run)})`).join(', ') + (M.prestiges.length > 10 ? ' …' : '') : ''));
  console.log(`  objectifs réclamés : ${M.objectifsFaits} · jours aux 3 objectifs : ${M.joursComplets}/${jours} · attente sans achat possible : ${(M.attente / M.actif * 100).toFixed(0)} % du temps de jeu · achats de niveaux : ${M.achats}`);
  console.log(`  boulanger : niveau ${M.parJour[M.parJour.length - 1].niveau} (${G.titre(st)}) · talents ${JSON.stringify(st.talents)}`);
  console.log('  jour  niv  étoiles  boutique  gagné total     taux/s      recettes  bonus  obj  attente  niveaux');
  for (const d of M.parJour) if (d.j <= 7 || d.j % 7 === 0 || d.j === M.parJour.length) console.log(`  ${String(d.j).padStart(3)}  ${String(d.niveau).padStart(3)}   ${String(d.etoiles).padStart(6)}  ${String(d.boutiques).padStart(8)}  ${G.fmtEur(d.lifetime).padStart(12)}  ${G.fmtEur(d.taux).padStart(10)}  ${String(d.debloques).padStart(8)}  ${String(d.bonus).padStart(5)}  ${String(d.objectifs).padStart(3)}  ${(d.attente * 100).toFixed(0).padStart(5)} %  ${d.niv.join(',')}`);
  return M;
}
function resume(nom, R) {
  const { M } = R, d = (ms) => (ms ? jourDe(ms) : null), at = (j) => M.parJour[Math.min(j, M.parJour.length) - 1];
  return { profil: nom, saisonRatio: +(M.saison / Math.max(1, M.saisonPassif)).toFixed(2), tarte: d(M.unlock[3]), eclair: d(M.unlock[4]), macaron: d(M.unlock[5]), millefeuille: d(M.unlock[6]), piece: d(M.unlock[7]), premierPrestige: M.prestiges[0] ? { jour: jourDe(M.prestiges[0].t), gain: M.prestiges[0].gain } : null,
    etoiles: { j7: at(7).etoiles, j14: at(14).etoiles, j30: at(30).etoiles, fin: at(M.parJour.length).etoiles }, niveau: { j7: at(7).niveau, j14: at(14).niveau, j30: at(30).niveau, fin: at(M.parJour.length).niveau }, franchise: d(M.bonus.franchise), bonusJ7: at(7).bonus, meubles: M.achatsMeubles, attente: +(M.attente / M.actif).toFixed(2), joursComplets: M.joursComplets, rates: M.rates || {}, jours: M.parJour.length, lifetimeFin: at(M.parJour.length).lifetime, prestiges: M.prestiges.length };
}
// garde-fous du rythme : un joueur régulier (36 min par jour) découvre les 8 recettes en une dizaine de jours, repart
// pour une nouvelle boutique au bout de 2 à 4 jours puis tous les 2 à 4 jours, achète le dernier bonus en 3 à 7 semaines,
// n'attend pas trop souvent sans rien pouvoir acheter, réussit la plupart des objectifs du jour, et les chiffres restent lisibles.
const SAISON_MAX = 2; // jouer la saison au plus double les gains d'une session
// Deux bornes tiennent compte des quatre départs (le jeu sans le lot 1 fait de même) : partie un dimanche 1er novembre,
// l'occasionnel ouvre sa première boutique au jour 7 ; et la dernière boutique de l'assidu, qui se ferme vers le jour 60,
// dure de 10 à 11 jours (les boutiques s'allongent d'environ ×1,4 en fin de partie ; au départ du 5 octobre, elle restait ouverte au jour 60 et n'était pas comptée).
const CIBLES = {
  occasionnel: { piece: [6, 21], premierPrestige: [3, 7], dureeMax: 10, etoilesJ30: [150, 1500], franchise: [25, 60], attente: 0.3, joursComplets: 0.6, niveauJ30: [6, 20], niveauFin: [10, 28] },
  regulier: { dureeMax: 10, tarte: [1, 1], eclair: [1, 2], macaron: [1, 3], millefeuille: [2, 5], piece: [6, 12], premierPrestige: [2, 4], etoilesJ7: [12, 100], etoilesJ14: [60, 400], etoilesJ30: [300, 2000], franchise: [20, 45], attente: 0.35, joursComplets: 0.7, niveauJ30: [10, 24], niveauFin: [16, 34] },
  assidu: { dureeMax: 12, piece: [4, 10], premierPrestige: [2, 4], etoilesJ30: [500, 3000], franchise: [15, 40], attente: 0.5, joursComplets: 0.7, niveauJ30: [12, 30], niveauFin: [18, 40] },
};
function tester(jours) {
  let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
  const entre = (v, [a, b]) => v != null && v >= a && v <= b;
  for (const [quand, depart] of Object.entries(DEPARTS)) for (const nom of Object.keys(PROFILS)) {
    const R = simuler(nom, jours, { t0: depart }), r = resume(nom, R), c = CIBLES[nom];
    console.log(`── ${nom}, départ le ${quand} ──`);
    check(r.saisonRatio <= SAISON_MAX, `la recette de saison rapporte ${r.saisonRatio} fois les gains des apprentis pendant les sessions (max ${SAISON_MAX})`);
    for (const k of ['tarte', 'eclair', 'macaron', 'millefeuille', 'piece']) if (c[k]) check(entre(r[k], c[k]), `${k} débloqué le jour ${r[k]} (attendu ${c[k][0]}–${c[k][1]})`);
    check(r.premierPrestige && entre(r.premierPrestige.jour, c.premierPrestige), `première nouvelle boutique le jour ${r.premierPrestige && r.premierPrestige.jour} avec +${r.premierPrestige && r.premierPrestige.gain} (attendu jour ${c.premierPrestige[0]}–${c.premierPrestige[1]})`);
    const durees = R.M.prestiges.slice(1).map((p) => p.duree);
    check(durees.length >= 5 && durees.every((d) => d >= 1 && d <= c.dureeMax), `boutiques suivantes : ${durees.length} en ${jours} jours, de ${Math.min(...durees).toFixed(1)} à ${Math.max(...durees).toFixed(1)} jours chacune (max ${c.dureeMax})`);
    if (c.etoilesJ7) check(entre(r.etoiles.j7, c.etoilesJ7), `étoiles au jour 7 : ${r.etoiles.j7}`);
    if (c.etoilesJ14) check(entre(r.etoiles.j14, c.etoilesJ14), `étoiles au jour 14 : ${r.etoiles.j14}`);
    check(entre(r.etoiles.j30, c.etoilesJ30), `étoiles au jour 30 : ${r.etoiles.j30} (attendu ${c.etoilesJ30[0]}–${c.etoilesJ30[1]})`);
    check(entre(r.franchise, c.franchise), `dernier bonus (franchise) le jour ${r.franchise} (attendu ${c.franchise[0]}–${c.franchise[1]})`);
    check(r.attente <= c.attente, `attente sans rien à acheter : ${Math.round(r.attente * 100)} % du temps de jeu (max ${Math.round(c.attente * 100)} %)`);
    check(r.joursComplets >= c.joursComplets * jours, `jours aux trois objectifs : ${r.joursComplets}/${jours} (min ${Math.round(c.joursComplets * 100)} %)`);
    check(r.lifetimeFin < 1e24, `gagné en ${jours} jours : ${G.fmtEur(r.lifetimeFin)} (reste lisible)`);
    check(entre(r.niveau.j30, c.niveauJ30), `boulanger niveau ${r.niveau.j30} au jour 30 (attendu ${c.niveauJ30[0]}–${c.niveauJ30[1]})`);
    check(entre(r.niveau.fin, c.niveauFin), `boulanger niveau ${r.niveau.fin} au jour ${jours} (attendu ${c.niveauFin[0]}–${c.niveauFin[1]})`);
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
  process.exit(fails ? 1 : 0);
}
if (require.main === module) {
  const args = process.argv.slice(2), jours = +(args.find((a) => /^\d+$/.test(a)) || 60), court = args.includes('--court');
  if (args.includes('--test')) tester(jours);
  else for (const nom of Object.keys(PROFILS)) { const R = simuler(nom, jours); if (!court) rapport(nom, jours, R); console.log(JSON.stringify(resume(nom, R))); }
}
module.exports = { simuler, resume, PROFILS, T0, DEPARTS };
