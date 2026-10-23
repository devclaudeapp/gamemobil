#!/usr/bin/env node
// Simulation de « Ma chaîne de boutiques » sur 30 jours, 4 profils, avec le joueur simulé de test/longevite.js (simuler, sa politique d'achat,
// ses prestiges) pour la boulangerie, et une politique de chaîne ici (chaineSession) pour les anciennes boutiques.
//   Scénarios : « nouveau » (partie neuve le 5 oct., la chaîne naît au 1er prestige) ; « existant » (30 jours de jeu sans la chaîne, puis le
//   lot arrive : la chaîne est recréée à neuf, n°1 à st.boutiques − 1, et 30 jours avec elle).
//   Variantes : A « sans » (le temps entier dans la boulangerie) ; B « chaîne » (une part du temps dans la chaîne, retirée de la boulangerie) ;
//   C « chaîne en plus » (la boulangerie garde tout son temps ; la chaîne s'ajoute : la borne haute de ce qu'elle peut accélérer, par ses boosts).
//   Les trois lancent les boosts de la réserve au début de chaque session (le joueur de longevite ne les lance jamais : ce serait injuste pour B et C).
// La chaîne passe par le VRAI crochet du prestige (GAME.brancherPrestige, posé par src/chaine.js) : branché pour les parties avec la chaîne,
// débranché pour celles sans (la variante A0, les 30 jours d'avant le lot, la référence de longevite).
// Sortie : le résumé à l'écran ; avec --sortie <dossier> : courbes.csv (une ligne par jour) et resultats.json (les chiffres clés).
// Lancer : TZ=Europe/Paris node test/fournil-chaine-sim.js --test           (la passe complète, 4 profils : ≈ 25 min, à la main avant chaque changement de réglage)
//          TZ=Europe/Paris node test/fournil-chaine-sim.js --court --test   (le 1 h/j seul : ≈ 1 min, dans le déploiement)
'use strict';
const path = require('path'), fs = require('fs');
const L = require('./longevite.js'), G = require('../src/game.js'), R = require('../src/chaine.js');
// le crochet du prestige, branché ou non le temps d'une partie simulée (L.simuler est synchrone)
const avecCrochet = (oui, f) => { G.brancherPrestige(oui ? R.rejoindre : null); try { return f(); } finally { G.brancherPrestige(R.rejoindre); } };
const { PRODUITS, AMELIORATIONS, MOBILIER } = G;
const J = 864e5, H = 3600e3, T0 = L.T0;
const args = process.argv.slice(2), court = args.includes('--court'), sortie = args.includes('--sortie') ? args[args.indexOf('--sortie') + 1] : null;

// ─── les 4 profils du plan : sessions [heure de Paris, minutes] ; part : la part de chaque session passée dans la chaîne ───
const PROFILS = {
  occasionnel: { sessions: [[8, 6], [20.5, 14]], part: 0.25, nom: 'occasionnel (20 min/j)' },
  heure: { sessions: [[7.75, 15], [12.5, 15], [21, 30]], part: 0.33, nom: '1 h/j' },
  quatre: { sessions: [[7.5, 45], [12, 45], [17.5, 60], [21, 90]], part: 0.4, nom: '4 h/j' },
  acharne: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]], part: 0.5, nom: 'acharné (8 h/j)' },
};
for (const [id, p] of Object.entries(PROFILS)) {
  L.PROFILS[id] = { sessions: p.sessions };
  L.PROFILS[id + '-m'] = { sessions: p.sessions.map(([h, m]) => [h, Math.max(1, Math.round(m * (1 - p.part)))]) }; // la boulangerie, sans le temps de la chaîne
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const heureDe = (ms) => { const d = G.paris(ms); return d.getUTCHours() + d.getUTCMinutes() / 60; };

// ─── la politique du joueur dans une boutique de la chaîne (comme le decider de longevite, sans talents ni objectifs) ───
function acheterDans(st, v) {
  let fait = 0;
  const next = v.stations.findIndex((s, i) => s.niv === 0 && G.recetteGagnee(st, i));
  if (next > 0 && v.coins >= PRODUITS[next].debloquer) { if (R.acheter(st, v, next).ok) fait++; }
  for (let i = 0; i < PRODUITS.length; i++) { const s = v.stations[i]; if (s.niv > 0 && !s.staff && v.coins >= PRODUITS[i].staff) { if (R.embaucher(st, v, i).ok) fait++; } }
  for (const a of AMELIORATIONS) if (!v.ameliorations[a.id] && G.ameliorationOuverte(st, a) && v.coins >= a.cout) { if (R.amelioration(st, v, a.id).ok) fait++; }
  { let mm = null, mp = Infinity; for (const m of MOBILIER) if (R.cran(v.b, m.id) < m.max) { const p = R.prixMeuble(v.b, m.id); if (p < mp) { mp = p; mm = m; } } if (mm && mp <= v.coins * 0.2) { if (R.ameliorerMeuble(st, v, mm.id).ok) fait++; } }
  const taux = R.tauxBase(st, v.b);
  let cible = Infinity; if (next > 0) cible = Math.min(cible, PRODUITS[next].debloquer);
  v.stations.forEach((s, i) => { if (s.niv > 0 && !s.staff) cible = Math.min(cible, PRODUITS[i].staff); });
  for (const a of AMELIORATIONS) if (!v.ameliorations[a.id] && G.ameliorationOuverte(st, a)) cible = Math.min(cible, a.cout);
  const economise = cible < Infinity && cible > v.coins && cible <= v.coins + taux * 300;
  for (let k = 0; k < 6; k++) {
    let best = -1, bestR = 0, bestN = 1;
    for (let i = 0; i < PRODUITS.length; i++) {
      const s = v.stations[i]; if (s.niv === 0) continue;
      const n = Math.min(25, G.maxNiveaux(i, s.niv, v.coins)); if (n < 1) continue;
      const prix = G.coutNiveaux(i, s.niv, n); if (economise && prix > v.coins * 0.05) continue;
      const gain = (PRODUITS[i].rev * (s.niv + n) * G.palierMult(s.niv + n) - PRODUITS[i].rev * s.niv * G.palierMult(s.niv)) * R.ameliorationMult(v.b, i) / PRODUITS[i].temps * (s.staff ? 1 : 0.3);
      const r = gain / prix; if (r > bestR) { bestR = r; best = i; bestN = n; }
    }
    if (best < 0) break;
    v.mode = bestN; if (R.acheter(st, v, best).ok) fait++; else break;
  }
  return fait;
}
// les jetons : d'abord un gérant (là où le rythme est le plus fort), le boost du jour (×5) s'il en reste assez, ses niveaux, puis les objets
function depenserJetons(st, now, J0) {
  const c = R.etat(st);
  for (let garde = 0; garde < 200; garde++) {
    const sans = c.b.filter((b) => !b.g).sort((a, b) => R.rythme(st, b) - R.rythme(st, a));
    if (sans.length && c.jetons >= R.prixGerant(R.nbGerants(st))) { R.embaucherGerant(st, sans[0].n, now); J0.gerants.push(now); continue; }
    if (R.boostsRestants(st, now) > 0 && c.jetons >= 40) { R.acheterBoost(st, 'x5', now); J0.boosts++; continue; } // le boost de la semaine d'abord : la borne haute de ce que la chaîne peut accélérer
    if (sans.length) break; // on économise pour le gérant suivant
    let mieux = null; // le niveau de gérant le moins cher, dans la boutique au plus fort rythme
    for (const b of c.b.slice().sort((a, x) => R.rythme(st, x) - R.rythme(st, a)).slice(0, 3)) for (const [q, t, k] of [['rythme', R.GERANT.prixRythme, 0], ['duree', R.GERANT.prixDuree, 1]]) if (b.g[k] < t.length && (!mieux || t[b.g[k]] < mieux.prix)) mieux = { n: b.n, q, prix: t[b.g[k]] };
    if (mieux && c.jetons >= mieux.prix) { R.ameliorerGerant(st, mieux.n, mieux.q); continue; }
    const o = R.OBJETS.filter((x) => !c.objets.includes(x.id)).sort((a, b) => a.prix - b.prix)[0];
    if (!mieux && o && c.jetons >= o.prix) { R.acheterObjet(st, o.id); continue; }
    break;
  }
}
// une session dans la chaîne : encaisser les gérants, prendre les jetons, passer dépenser la caisse de chaque boutique (15 s chacune),
// puis jouer la boutique « en cours » (la plus avancée qui n'est pas d'or) le reste du temps, à la main et avec ses apprentis
function chaineSession(st, now, secs, J0) {
  const c = R.etat(st, now); if (!c.b.length || secs <= 0) return;
  R.encaisserTout(st, now); R.prendreTout(st); depenserJetons(st, now, J0);
  let t = 0;
  for (const b of c.b) {
    if (t + 15 > secs * 0.5) break; // au plus la moitié du temps en tournée des caisses
    const v = R.ouvrir(st, b.n, now + t * 1000); if (acheterDans(st, v)) J0.visites++; R.fermer(st, v, now + t * 1000); R.prendreJetons(st, b.n); t += 15;
  }
  depenserJetons(st, now, J0);
  const cible = c.b.filter((b) => !b.or).sort((a, b) => R.jauge(st, b).part - R.jauge(st, a).part || a.n - b.n)[0];
  if (cible) {
    const v = R.ouvrir(st, cible.n, now + t * 1000), b = cible;
    for (; t < secs; t++) {
      const ms = now + t * 1000; let lances = 0;
      v.stations.forEach((x, i) => { if (x.niv > 0 && !x.staff && !x.actif && lances < 2) { R.lancer(v, i); lances++; } });
      R.tick(st, v, 1, ms);
      if (t % 3 === 0) acheterDans(st, v);
      J0.actif[b.n] = (J0.actif[b.n] || 0) + 1;
      if (b.or && !J0.orA[b.n]) { J0.orA[b.n] = ms; break; }
    }
    R.fermer(st, v, now + secs * 1000); R.prendreJetons(st, b.n);
  }
  depenserJetons(st, now, J0);
  for (const b of c.b) if (b.or && !J0.orA[b.n]) J0.orA[b.n] = now;
}

// ─── une simulation : nom du profil, variante (A, B, C), départ, état de départ (existant) ───
function lancer(id, variante, jours, o) {
  const p = PROFILS[id], profilMain = variante === 'B' ? id + '-m' : id, J0 = { gerants: [], boosts: 0, visites: 0, actif: {}, orA: {}, lignes: [], jour: -1 };
  let st0 = o.st ? clone(o.st) : null; const t0 = o.t0;
  if (st0 && variante !== 'A0') R.etat(st0, t0); // le lot arrive : la chaîne recréée à neuf, une fois
  const sessions = p.sessions;
  const opts = { t0, st: st0 || undefined, seed: 11,
    chaqueSeconde: (st, now, s) => {
      if (s !== 0) return;
      const j = Math.floor((now - t0) / J);
      if (j !== J0.jour) { // une ligne par jour, prise au début de la première session
        if (J0.jour >= 0) J0.lignes.push(ligne(st, J0, J0.jour + 1));
        J0.jour = j;
      }
      if (variante !== 'A' && variante !== 'A0') { const h = ((now - t0) % J) / H, sess = sessions.find(([hh]) => Math.abs(hh - h) < 0.02); if (sess) chaineSession(st, now, Math.round(sess[1] * p.part * 60), J0); }
      if (variante !== 'A0') { const b = st.boosts; if (b && b.reserve.length && !(b.actif && b.actif.fin > now)) { let k = 0; b.reserve.forEach((x, i) => { if (x.mult * x.secs > b.reserve[k].mult * b.reserve[k].secs) k = i; }); G.lancerBoostReserve(st, k); } }
    } };
  const Rs = avecCrochet(variante !== 'A0', () => L.simuler(profilMain, jours, opts));
  J0.lignes.push(ligne(Rs.st, J0, jours));
  return { R: Rs, J0, res: L.resume(profilMain, Rs) };
}
function ligne(st, J0, jour) {
  const c = st.chaine && st.chaine.b ? R.etat(st) : null;
  return { jour, etoiles: st.etoiles, boutiques: st.boutiques, lifetime: st.lifetime, jetonsGagnes: c ? c.gagnes : 0, jetonsMain: c ? c.jetons : 0, gerants: c ? c.b.filter((b) => b.g).length : 0, or: c ? c.b.filter((b) => b.or).length : 0,
    chaine: c ? c.b.length : 0, paliers: c ? c.b.reduce((k, b) => k + R.paliersBoutique(b), 0) : 0, jauge: c ? +(c.b.reduce((k, b) => k + R.jauge(st, b).part, 0) / Math.max(1, c.b.length)).toFixed(3) : 0, boosts: J0.boosts };
}

// ─── 1) rien ne change pour qui ne l'ouvre pas : longevite (son joueur, ses 3 profils, départ du 5 oct., 60 jours) avec et sans le hook ───
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
console.log('── 1) le crochet du prestige (rejoindre) ne change rien à la boulangerie ──');
for (const nom of court ? ['regulier'] : ['occasionnel', 'regulier', 'assidu']) {
  const a = L.resume(nom, avecCrochet(false, () => L.simuler(nom, 60, { t0: T0 }))), Rb = avecCrochet(true, () => L.simuler(nom, 60, { t0: T0 })), b = L.resume(nom, Rb);
  check(JSON.stringify(a) === JSON.stringify(b), `${nom} : le résumé de longevite est identique avec la chaîne qui se remplit à chaque prestige (${b.prestiges} boutiques rejointes, ${b.etoiles.fin} étoiles au 60e jour)`);
  const taille = JSON.stringify(Rb.st.chaine).length;
  check(taille < 12000 && Rb.st.chaine.b.length === Rb.st.boutiques - 1 && Rb.st.chaine.b.some((b) => b.s[0] > 1), `${nom} : st.chaine pèse ${taille} octets pour ${Rb.st.chaine.b.length} boutiques gardées avec leurs niveaux (≤ 12 Ko)`);
}

// ─── 2) les 4 profils, 2 scénarios, 3 variantes ───
const OUT = { profils: {}, regles: { REJOINDRE: R.REJOINDRE.paliers, OR_NIV: R.OR_NIV, PAQUET_OR: R.PAQUET_OR, GERANT: R.GERANT, BOOSTS: R.BOOSTS, BOOSTS_SEMAINE: R.BOOSTS_SEMAINE, prixGerant: [0, 1, 2, 3, 4, 5, 10, 11, 20].map((k) => R.prixGerant(k)) } };
const csv = ['scenario,profil,variante,jour,etoiles,boutiques,jetonsGagnes,jetonsMain,gerants,or,chaine,paliers,jaugeMoy,boosts'];
const jourDe = (ms, t0) => (ms ? +((ms - t0) / J).toFixed(1) : null);
for (const id of court ? ['heure'] : Object.keys(PROFILS)) {
  console.log(`\n── ${PROFILS[id].nom} ──`);
  const res = {};
  // nouveau joueur
  for (const v of ['A', 'B', 'C']) res['nouveau-' + v] = lancer(id, v, 30, { t0: T0 });
  // joueur existant : 30 jours sans la chaîne (la variante A0, sans boosts lancés, comme longevite), puis le lot
  const avant = avecCrochet(false, () => L.simuler(id, 30, { t0: T0 })).st, t1 = T0 + 30 * J;
  for (const v of ['A', 'B', 'C']) res['existant-' + v] = lancer(id, v, 30, { t0: t1, st: avant });
  const o = OUT.profils[id] = { nom: PROFILS[id].nom, part: PROFILS[id].part, boutiquesAuLot: avant.boutiques };
  for (const sc of ['nouveau', 'existant']) {
    const t0 = sc === 'nouveau' ? T0 : t1, A = res[sc + '-A'], B = res[sc + '-B'], C = res[sc + '-C'], fin = (x) => x.J0.lignes[x.J0.lignes.length - 1];
    for (const [v, x] of [['A', A], ['B', B], ['C', C]]) for (const l of x.J0.lignes) csv.push([sc, id, v, l.jour, l.etoiles, l.boutiques, l.jetonsGagnes, l.jetonsMain, l.gerants, l.or, l.chaine, l.paliers, l.jauge, l.boosts].join(','));
    const ors = Object.entries(B.J0.orA).map(([n, ms]) => ({ n: +n, jour: jourDe(ms, t0), actifMin: Math.round((B.J0.actif[n] || 0) / 60) })).sort((a, b) => a.jour - b.jour);
    const montees = ors.filter((x) => B.R.st.chaine.b.find((b) => b.n === x.n && b.pj < 300)); // (toutes)
    const r = o[sc] = {
      etoiles: { A: fin(A).etoiles, B: fin(B).etoiles, C: fin(C).etoiles, BsurA: +(fin(B).etoiles / Math.max(1, fin(A).etoiles)).toFixed(3), CsurA: +(fin(C).etoiles / Math.max(1, fin(A).etoiles)).toFixed(3) },
      boutiques: { A: fin(A).boutiques, B: fin(B).boutiques, C: fin(C).boutiques },
      jetons30: fin(B).jetonsGagnes, jetonsParJour: +(fin(B).jetonsGagnes / 30).toFixed(1),
      jetonsParSemaine: [7, 14, 21, 28].map((j) => { const a = B.J0.lignes.find((l) => l.jour === j - 6) || { jetonsGagnes: 0 }, b = B.J0.lignes.find((l) => l.jour === j) || fin(B); return b.jetonsGagnes - (j === 7 ? 0 : a.jetonsGagnes); }),
      premierGerant: jourDe(B.J0.gerants[0], t0), gerants: fin(B).gerants, chaine: fin(B).chaine, boosts: B.J0.boosts, boostsC: C.J0.boosts,
      premiereOr: ors.length ? ors[0].jour : null, ors: ors.length, montees: ors.slice(0, 6), jaugeMoy: fin(B).jauge,
    };
    console.log(`  ${sc} : étoiles au 30e jour A ${r.etoiles.A} · B ${r.etoiles.B} (×${r.etoiles.BsurA}) · C ${r.etoiles.C} (×${r.etoiles.CsurA}) ; boutiques ${r.boutiques.A}/${r.boutiques.B}/${r.boutiques.C}`);
    console.log(`     jetons : ${r.jetons30} en 30 j (${r.jetonsParJour}/j ; par semaine ${r.jetonsParSemaine.join(', ')}) ; 1er gérant jour ${r.premierGerant} ; ${r.gerants}/${r.chaine} gérants ; ${r.boosts} boosts achetés (C : ${r.boostsC}) ; jauge moyenne ${Math.round(r.jaugeMoy * 100)} %`);
    console.log(`     Boutiques d’or : ${r.ors} (la 1re le jour ${r.premiereOr})${ors.length ? ' → ' + ors.slice(0, 6).map((x) => `n°${x.n} j${x.jour} (${x.actifMin} min jouées)`).join(', ') : ''}`);
    // (B/A et C/A sur UNE partie ne prouvent rien : le joueur simulé de longevite est très sensible au moment de ses prestiges, un seul boost
    //  de plus déplace ses étoiles de −13 % à +33 % d'une partie à l'autre ; la preuve est la moyenne de sim/sensibilite.js, 12 parties)
    console.log(`  info ${PROFILS[id].nom}, ${sc} : étoiles B/A ×${r.etoiles.BsurA}, C/A ×${r.etoiles.CsurA} (une partie : indicatif)`);
    check(r.premierGerant != null && (sc === 'nouveau' || r.premierGerant <= 1), `${PROFILS[id].nom}, ${sc} : un premier gérant (jour ${r.premierGerant})`);
  }
}
if (sortie) { // (CHAINE_REJOINDRE=comptes : la variante « comptés », suffixée)
  const SUF = process.env.CHAINE_REJOINDRE === 'comptes' ? '-comptes' : '';
  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, 'courbes' + SUF + '.csv'), csv.join('\n') + '\n');
  fs.writeFileSync(path.join(sortie, 'resultats' + SUF + '.json'), JSON.stringify(OUT, null, 1) + '\n');
}
console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
process.exit(fails && args.includes('--test') ? 1 : 0); // (sans --test : le résumé seul)
