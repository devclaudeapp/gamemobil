#!/usr/bin/env node
// La saison d'hiver et le calendrier de l'Avent (point 7, docs/noel-contrat.md § 3 et § 8) : la piste réglée sur cinq semaines, et l'effet
// des récompenses (Avent et piste) sur le rythme des boutiques. Rien ici n'est le jeu.
//   · Le moteur : outils/noel/saison-proto.js (src/saison.js tel quel + les deux changements du contrat : 50 crans, les lecteurs), la fiche
//     d'automne (src/saison-automne.js, telle quelle) et la fiche d'hiver ci-dessous (FICHE_HIVER, la copie du contrat § 3.3) : du mardi
//     1er décembre 2026 à 0 h au dimanche 3 janvier 2027 à 23 h 59 59 (heure de Paris) ; l'enchaînement du 1er décembre est donc JOUÉ.
//   · Le calendrier de l'Avent : outils/noel/avent.js (la référence des règles et des 24 cases).
//   · Le joueur : celui de test/longevite.js (ses objectifs du jour et son défi de la semaine réclamés dès qu'ils sont faits), comme
//     test/fournil-saison-sim.js (l'XP comptée par SAISONS.pas, plafonnée ; les crans reçus et VERSÉS : étoiles, boosts LANCÉS aussitôt, le
//     pire cas) ; les paliers du Marché d'automne (outils/marche/rythme-reel-resultats.json) et du Marché de Noël (outils/noel/rythme-resultats.json)
//     le soir de leur jour ; l'arrière-salle une fois ouverte ; l'Avent : à la première minute d'un jour joué, la case du jour et UNE oubliée.
// Lancer : TZ=Europe/Paris node outils/noel/hiver.js [--piste] [--longevite] [--json fichier] [--crans N] [--titre X]
//   --piste : les profils et les nouveaux joueurs (≈ 3 min sur 4 cœurs) ; --longevite : test/longevite.js sans / avec l'Avent / avec tout
//   (≈ 10 min sur 4 cœurs) ; sans l'un ni l'autre : les deux.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const G = require('../../src/game.js'), L = require('../../test/longevite.js'), AV = require('./avent.js');
const { SAISONS, AUTOMNE } = require('./saison-proto.js').charger();
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

// ─── la fiche d'hiver (la copie du contrat, § 3.3) ───
const M30 = 1800, H1 = 3600;
const CRANS_HIVER = [ // 46 crans de 45 XP (2 070 XP), le titre « Flocon d'or 2026 » à +250 (2 320 XP) ; « flocon » : un flocon unique pour la collection (cosmétique, dessiné)
  { boost: { mult: 2, secs: M30 } }, // 1
  { etoiles: 1 }, // 2
  { flocon: 3 }, // 3
  { flocon: 4 }, // 4
  { deco: 'luge' }, // 5
  { etoiles: 1 }, // 6
  { flocon: 7 }, // 7
  { flocon: 8 }, // 8
  { flocon: 9 }, // 9
  { etoiles: 1 }, // 10
  { deco: 'lanterne-givre' }, // 11
  { flocon: 12 }, // 12
  { boost: { mult: 2, secs: M30 } }, // 13
  { etoiles: 1 }, // 14
  { flocon: 15 }, // 15
  { flocon: 16 }, // 16
  { deco: 'guirlande-givre' }, // 17
  { etoiles: 1 }, // 18
  { flocon: 19 }, // 19
  { flocon: 20 }, // 20
  { flocon: 21 }, // 21
  { etoiles: 1 }, // 22
  { deco: 'traineau' }, // 23
  { flocon: 24 }, // 24
  { boost: { mult: 2, secs: H1 } }, // 25
  { etoiles: 1 }, // 26
  { flocon: 27 }, // 27
  { flocon: 28 }, // 28
  { deco: 'cheminee' }, // 29
  { etoiles: 1 }, // 30
  { flocon: 31 }, // 31
  { flocon: 32 }, // 32
  { flocon: 33 }, // 33
  { etoiles: 1 }, // 34
  { deco: 'patins' }, // 35
  { flocon: 36 }, // 36
  { boost: { mult: 3, secs: M30 } }, // 37
  { etoiles: 1 }, // 38
  { flocon: 39 }, // 39
  { flocon: 40 }, // 40
  { flocon: 41 }, // 41
  { etoiles: 1 }, // 42
  { flocon: 43 }, // 43
  { flocon: 44 }, // 44
  { flocon: 45 }, // 45
  { deco: 'trophee-hiver-2026', trophee: 'trophee-hiver-2026', etoiles: 2 }, // 46
];
// (v1 du 9 nov., écartée : 27 ★ et 8 boosts ; docs/noel-contrat.md § 8.3)
function ficheHiver(n, titreXp) {
  const crans = CRANS_HIVER.slice(0, n); while (crans.length < n) crans.push({ etoiles: 1 });
  return { id: 'hiver-2026', nom: 'La saison d’hiver', debut: SAISONS.parisMs(2026, 12, 1, 0), fin: SAISONS.parisMs(2027, 1, 4, 0), crans, xpCran: 45,
    titre: { xp: titreXp, distinction: 'flocon-or-2026', nom: 'Flocon d’or 2026' }, evenements: ['noel'],
    sources: Object.assign({}, SAISONS.SOURCES, { avent: { xp: 10, nom: 'Calendrier de l’Avent', txt: 'une case du calendrier ouverte' } }),
    lecteurs: { avent: (st) => (st.avent ? AV.nOuvertes(st.avent) : 0) } };
}
// (réglage) --lots-avent f.json / --lots-hiver f.json : d'autres lots (les mêmes clés que AV.LOTS / CRANS_HIVER), pour comparer
if (arg('--lots-avent')) { const l = JSON.parse(fs.readFileSync(arg('--lots-avent'), 'utf8')); AV.LOTS.splice(0, AV.LOTS.length, ...l.map((x, k) => Object.assign({ n: k + 1 }, x))); }
if (arg('--lots-hiver')) { const l = JSON.parse(fs.readFileSync(arg('--lots-hiver'), 'utf8')); CRANS_HIVER.splice(0, CRANS_HIVER.length, ...l); }
const NCRANS = +arg('--crans', CRANS_HIVER.length), TITRE = +arg('--titre', 250);
const HIVER = SAISONS.ajouter(ficheHiver(NCRANS, TITRE));
const FIN_SIM = HIVER.fin;

const PROFILS = { // les sessions de outils/marche/proto.js ; casino : mini-objectifs de l'arrière-salle réussis par jour ; jours : les jours joués (0 dimanche)
  occasionnel: { sessions: [[8, 5], [20.5, 12]], casino: 0, ev: 'occasionnel', jours: [3, 5, 6, 0] }, // 17 min, quatre jours sur sept
  quotidien: { sessions: [[7.75, 10], [12.5, 15], [21, 35]], casino: 1, ev: 'quotidien' },
  assidu: { sessions: [[7.5, 20], [12.25, 25], [18, 30], [21.5, 45]], casino: 2, ev: 'assidu' },
  tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]], casino: 3, ev: 'tresactif' },
  'occasionnel-7j': { sessions: [[8, 5], [20.5, 12]], casino: 0, ev: 'occasionnel' },
};
const lireJ = (f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); } catch (e) { return null; } };
const RM = lireJ('../marche/rythme-reel-resultats.json'), RN = lireJ('rythme-resultats.json') || RM;
const PALIERS = { marche: {}, noel: {} }; for (const p of ['occasionnel', 'quotidien', 'assidu', 'tresactif']) { PALIERS.marche[p] = RM.profils[p].paliersJour; PALIERS.noel[p] = RN.profils[p].paliersJour; }
const OUV = { marche: SAISONS.parisMs(2026, 11, 13, 0), noel: SAISONS.parisMs(2026, 12, 18, 0) }; // minuit du jour 1 de chaque marché
const jourSemaine = (ms) => SAISONS.paris(ms).getUTCDay(), dayKey = SAISONS.dayKey;

// o : { depart, jours, arrivee, profil, recompenses: 'aucune' | 'automne' | 'avent' | 'tout', bruitJour: d (une étoile le d décembre, rien d'autre que l'automne) }
function simuler(nom, o) {
  o = o || {};
  const P = Object.assign({}, PROFILS[nom] || {}, o.profil || {}); const cle = 'hiver-' + nom; L.PROFILS[cle] = { sessions: P.sessions };
  const t0 = o.depart || L.DEPARTS['1er nov.'], jours = o.jours || Math.ceil((FIN_SIM - t0) / 864e5), rec = o.recompenses || 'tout';
  const versePiste = (id) => rec === 'tout' || (id === AUTOMNE.id && rec !== 'aucune'), verseAvent = rec === 'avent' || rec === 'tout';
  const vue = { jour: null, semaine: null, marche: { paliers: [] }, noel: { paliers: [] }, arriere: { casino: { jour: '', objectifs: [] } } };
  const S = { [AUTOMNE.id]: { sources: {}, crans: [], etoiles: 0, boosts: 0 }, [HIVER.id]: { sources: {}, crans: [], etoiles: 0, boosts: 0 } };
  const avent = { ouvertes: [], parJour: {}, etoiles: 0, boosts: 0, le24: 0, le31: 0 };
  const derniere = P.sessions[P.sessions.length - 1][0]; let bruitFait = false, vuJour = '';
  const R = L.simuler(cle, jours, {
    t0, seed: o.seed || 11,
    chaqueSeconde(st, now, s) {
      if (o.bruitJour && !bruitFait && now >= SAISONS.parisMs(2026, 12, o.bruitJour, 0)) { st.etoiles += 1; bruitFait = true; }
      if (now < AUTOMNE.debut - 864e5 || now >= FIN_SIM) return;
      if (P.jours && !P.jours.includes(jourSemaine(now))) return; // un jour sans jeu : l'appli n'est pas ouverte
      if (o.arrivee && now < o.arrivee) return;
      vue.jour = st.jour; vue.semaine = st.semaine;
      const h = (((now - t0) % 864e5) + 864e5) % 864e5 / 3600e3;
      for (const ev of ['marche', 'noel']) { const jn = Math.floor((now - OUV[ev]) / 864e5) + 1; if (jn >= 1 && jn <= 8 && h >= derniere) for (const [n, jp] of Object.entries(PALIERS[ev][P.ev] || {})) if (jp <= jn && !vue[ev].paliers.includes(+n)) vue[ev].paliers.push(+n); }
      if (P.casino && h >= derniere && vue.arriere.casino.jour !== dayKey(now) && (st.boutiques >= 2 || st.lifetime >= 1e8)) vue.arriere.casino = { jour: dayKey(now), objectifs: Array.from({ length: 3 }, (x, k) => ({ fait: k < P.casino })) };
      // l'Avent : à la première seconde d'un jour joué, la case du jour et une oubliée (la plus ancienne)
      const dk = dayKey(now);
      if (dk !== vuJour && now >= AV.DEBUT && now < AV.FIN) {
        vuJour = dk; const ou = AV.ouvrables(vue, now, now), l = [];
        if (ou.du) l.push(ou.du); if (ou.rattrapage.length) l.push(ou.rattrapage[0]);
        for (const n of l) { const r = AV.ouvrir(vue, n, now, now); if (!r.ok) continue; avent.ouvertes.push(n); avent.parJour[dk] = (avent.parJour[dk] || 0) + 1;
          if (verseAvent) { const f = AV.verser(st, r.lot, G); avent.etoiles += f.etoiles; if (f.boost) avent.boosts++; } }
        if (now < AV.FIN_CASES) avent.le24 = avent.ouvertes.length; avent.le31 = avent.ouvertes.length;
      }
      const id0 = vue.piste && vue.piste.id, out = SAISONS.pas(vue, now, null), id = vue.piste && vue.piste.id;
      if (out.fin) SAISONS.recevoirFin(vue); // (les dus d'une saison finie : le titre, déjà distinctif ; rien d'autre ici, les crans sont reçus aussitôt)
      const x = S[id] || S[id0]; if (!x) return;
      for (const [k, v] of Object.entries(out.sources)) x.sources[k] = (x.sources[k] || 0) + v;
      for (const n of out.nouveaux) {
        x.crans.push({ c: n, t: now });
        const lot = SAISONS.recevoir(vue, n);
        if (lot && versePiste(id)) { const f = SAISONS.verser(st, lot, G); x.etoiles += f.etoiles; if (f.boost) x.boosts++; }
      }
      if (rec !== 'aucune') { const b = st.boosts; if (b && Array.isArray(b.reserve) && b.reserve.length && !(b.actif && b.actif.fin > st.now)) G.lancerBoostReserve(st, b.reserve.length - 1); } // (lancés tout de suite : le pire cas)
    },
  });
  const res = {};
  for (const F of [AUTOMNE, HIVER]) {
    const arch = vue.piste && vue.piste.passees && vue.piste.passees[F.id], cur = vue.piste && vue.piste.id === F.id ? vue.piste : null;
    const xp = arch ? arch.xp : cur ? cur.xp : 0, x = S[F.id], fini = x.crans.find((c) => c.c === F.crans.length);
    res[F.id] = { xp, crans: Math.min(F.crans.length, Math.floor(xp / F.xpCran)), sur: F.crans.length, fini: fini ? dayKey(fini.t) : null, titre: xp >= F.xpTitre, sources: x.sources, etoiles: x.etoiles, boosts: x.boosts, parCran: x.crans.map((c) => dayKey(c.t)) };
  }
  return { profil: nom, automne: res[AUTOMNE.id], hiver: res[HIVER.id], avent: { n: avent.ouvertes.length, le24: avent.le24, le31: avent.le31, etoiles: avent.etoiles, boosts: avent.boosts, maxParJour: Math.max(0, ...Object.values(avent.parJour)) }, R };
}

// ─── la longévité (comme outils/marche/longevite-saison.js) ───
const CIBLES = (() => { const t = fs.readFileSync(path.join(__dirname, '..', '..', 'test', 'longevite.js'), 'utf8'), m = /const CIBLES = (\{[\s\S]*?\n\});/.exec(t); return m ? Function(`return (${m[1]});`)() : null; })();
const PROFILS_LONG = { occasionnel: { casino: 0, ev: 'occasionnel' }, regulier: { casino: 1, ev: 'quotidien' }, assidu: { casino: 2, ev: 'assidu' } };
const DEPARTS_LONG = { '5 oct.': 91, '1er nov.': 60, '1er déc.': 60 }; // (le 5 oct. sur 91 jours, jusqu'au 4 janv. : ses garde-fous de fin de partie, réglés pour 60 jours, ne s'y lisent pas)
const VARIANTES = arg('--variantes') ? arg('--variantes').split(',').map((v) => (/^\d+$/.test(v) ? +v : v)) : ['sans', 'avent', 'tout', 2, 8, 14, 20];
// --graines 11,3,5,7 : chaque partie rejouée avec plusieurs graines du hasard de test/longevite.js (les mystères, les critiques, les pannes…),
// et les résumés MOYENNÉS avant la comparaison : le joueur simulé ouvre ses boutiques sur des seuils, une partie seule est chaotique
const GRAINES = (arg('--graines') || '11').split(',').map(Number);
if (arg('--profils')) for (const k of Object.keys(PROFILS_LONG)) if (!arg('--profils').split(',').includes(k)) delete PROFILS_LONG[k];
if (arg('--departs')) for (const k of Object.keys(DEPARTS_LONG)) if (!arg('--departs').split(',').includes(k)) delete DEPARTS_LONG[k];
const resumer = (nom, R) => { const r = L.resume(nom, R), d = R.M.prestiges.slice(1).map((x) => x.duree); return { premiere: r.premierPrestige ? r.premierPrestige.jour : null, boutiques: R.st.boutiques, plusLongue: d.length ? Math.max(...d) : 0, franchise: r.franchise, piece: r.piece, etoilesJ30: r.etoiles.j30, etoilesFin: r.etoiles.fin, niveau: r.niveau.fin, attente: r.attente }; };
function partieLongevite(quand, nom, v, seed) {
  const base = { profil: Object.assign({ sessions: L.PROFILS[nom].sessions }, PROFILS_LONG[nom]), depart: L.DEPARTS[quand], jours: DEPARTS_LONG[quand], seed: seed || 11 };
  const o = Object.assign({}, base, typeof v === 'number' ? { recompenses: 'automne', bruitJour: v } : { recompenses: v === 'sans' ? 'automne' : v });
  const s = simuler(nom, o);
  return { resume: resumer(nom, s.R), hiver: s.hiver.crans, etoiles: s.hiver.etoiles + s.avent.etoiles, boostsH: s.hiver.boosts, avent: s.avent.n, etoilesAvent: s.avent.etoiles };
}
function juger(taches, res) {
  const G0 = {}; taches.forEach((t, k) => { (G0[`${t.quand}|${t.nom}|${t.v}`] = G0[`${t.quand}|${t.nom}|${t.v}`] || []).push(res[k]); });
  const moy = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0) / l.length;
  const R = {}; for (const [c, l] of Object.entries(G0)) { const r0 = l[0]; R[c] = Object.assign({}, r0, { resume: Object.fromEntries(Object.keys(r0.resume).map((k) => [k, typeof r0.resume[k] === 'number' ? +moy(l, (x) => x.resume[k]).toFixed(k === 'boutiques' || k === 'premiere' || k === 'franchise' ? 1 : 0) : r0.resume[k]])) }); }
  let pire = { etoiles: 0, boutiques: 0, premiere: 0, franchise: 0, etoilesAvent: 0 }, horsCibles = 0; const lignes = [];
  const entre = (v, c) => !c || (v != null && v >= c[0] && v <= c[1]);
  for (const quand of Object.keys(DEPARTS_LONG)) for (const nom of Object.keys(PROFILS_LONG)) {
    const a = R[`${quand}|${nom}|sans`].resume, av = R[`${quand}|${nom}|avent`], b = R[`${quand}|${nom}|tout`].resume, tt = R[`${quand}|${nom}|tout`], bruit = [2, 8, 14, 20].map((k) => R[`${quand}|${nom}|${k}`].resume);
    const ecart = (x, y) => Math.abs(y / x - 1), bruitE = Math.max(...bruit.map((z) => Math.max(ecart(a.etoilesJ30, z.etoilesJ30), ecart(a.etoilesFin, z.etoilesFin))));
    const bruitF = Math.max(...bruit.map((z) => Math.abs((z.franchise || 0) - (a.franchise || 0)))), bruitB = Math.max(...bruit.map((z) => Math.abs(z.boutiques - a.boutiques)));
    const pc = (x, y) => `${((y / x - 1) * 100).toFixed(1)} %`;
    lignes.push(`${nom.padEnd(11)} départ ${quand.padEnd(8)} (${DEPARTS_LONG[quand]} j) Avent ${tt.avent}/24 (+${tt.etoilesAvent} ★), hiver ${tt.hiver} crans (+${tt.etoiles - tt.etoilesAvent} ★, ${tt.boostsH} boosts) : boutiques ${a.boutiques} → ${av.resume.boutiques} → ${b.boutiques} · 1re j${a.premiere} → j${b.premiere} · franchise j${a.franchise} → j${av.resume.franchise} → j${b.franchise} · étoiles j30 ${a.etoilesJ30} → ${av.resume.etoilesJ30} → ${b.etoilesJ30} (${pc(a.etoilesJ30, b.etoilesJ30)}), fin ${a.etoilesFin} → ${av.resume.etoilesFin} → ${b.etoilesFin} (Avent seul ${pc(a.etoilesFin, av.resume.etoilesFin)}, tout ${pc(a.etoilesFin, b.etoilesFin)}) · bruit d’une étoile ${(bruitE * 100).toFixed(1)} %, franchise ${bruitF} j, boutiques ${bruitB}`);
    const c = CIBLES && CIBLES[nom], fin60 = DEPARTS_LONG[quand] === 60;
    const cib = !c ? 'CIBLES illisibles' : [['premiere', 'premierPrestige'], ['franchise', 'franchise'], ['etoilesJ30', 'etoilesJ30'], ['piece', 'piece']].concat(fin60 ? [['niveau', 'niveauFin']] : []).filter(([k, kc]) => !entre(b[k], c[kc]) && entre(a[k], c[kc])).map(([k]) => k).concat(fin60 && b.plusLongue > (c.dureeMax || 99) && !(a.plusLongue > (c.dureeMax || 99)) ? ['plusLongue'] : []).join(', '); // (seulement ce que la partie sans tenait : la faute de l'hiver)
    if (cib) { horsCibles++; lignes.push(`      hors des garde-fous de test/longevite.js : ${cib}`); }
    for (const [y, k] of [[b, 'etoiles'], [av.resume, 'etoilesAvent']]) pire[k] = Math.max(pire[k], Math.max(ecart(a.etoilesFin, y.etoilesFin), ecart(a.etoilesJ30, y.etoilesJ30)) - Math.max(0.05, 1.5 * bruitE) + 0.05);
    pire.boutiques = Math.max(pire.boutiques, Math.abs(b.boutiques - a.boutiques) - Math.max(1, bruitB) + 1); pire.premiere = Math.max(pire.premiere, Math.abs((b.premiere || 0) - (a.premiere || 0)));
    pire.franchise = Math.max(pire.franchise, Math.abs((b.franchise || 0) - (a.franchise || 0)) - Math.max(2, Math.ceil(1.5 * bruitF)) + 2);
  }
  const ok = pire.etoiles <= 0.06 && pire.boutiques <= 1 && pire.premiere <= 1 && pire.franchise <= 2 && !horsCibles;
  return { lignes, pire, horsCibles, ok };
}
const resumePiste = (r) => ({ profil: r.profil, automne: r.automne, hiver: r.hiver, avent: r.avent });

function lancer(taches) {
  return new Promise((ok, ko) => {
    const res = new Array(taches.length), n = Math.max(1, Math.min(taches.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    let suivante = 0, finis = 0; if (!taches.length) ok(res);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename, { workerData: { travailleur: true }, argv: process.argv.slice(2) });
      const donner = () => { if (suivante < taches.length) { const k = suivante++; wk.postMessage({ k, t: taches[k] }); } else wk.terminate(); };
      wk.on('message', ({ k, r }) => { res[k] = r; process.stderr.write('.'); if (++finis === taches.length) { process.stderr.write('\n'); ok(res); } donner(); });
      wk.on('error', ko); donner();
    }
  });
}
module.exports = { simuler, PROFILS, HIVER, AUTOMNE, SAISONS, CRANS_HIVER, ficheHiver };

if (!isMainThread && workerData && workerData.travailleur) {
  parentPort.on('message', ({ k, t }) => {
    if (t.type === 'piste') { const o = Object.assign({}, t.o); if (t.o.departParis) { o.depart = SAISONS.parisMs(...t.o.departParis); o.arrivee = o.depart; } parentPort.postMessage({ k, r: resumePiste(simuler(t.nom, o)) }); }
    else parentPort.postMessage({ k, r: partieLongevite(t.quand, t.nom, t.v, t.seed) });
  });
} else if (isMainThread && require.main === module) {
  (async () => {
    const t0 = Date.now(), tout = !process.argv.includes('--piste') && !process.argv.includes('--longevite'), out = { fiche: { crans: HIVER.crans.length, xpCran: HIVER.xpCran, xpTitre: HIVER.xpTitre } };
    const fmt = (r) => `${String(r.xp).padStart(5)} XP · ${String(r.crans).padStart(2)}/${r.sur} (${Math.round(r.crans / r.sur * 100)} %) · finie ${r.fini || '—'} · titre ${r.titre ? 'oui' : 'non'} · +${r.etoiles} ★ ${r.boosts} boosts · ${Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`;
    if (tout || process.argv.includes('--piste')) {
      const taches = Object.keys(PROFILS).map((nom) => ({ type: 'piste', nom, o: {} }))
        .concat([['occasionnel', [2026, 12, 1, 0]], ['quotidien', [2026, 12, 1, 0]], ['occasionnel', [2026, 12, 15, 0]], ['quotidien', [2026, 12, 15, 0]]].map(([nom, d]) => ({ type: 'piste', nom, o: { departParis: d }, nouveau: d[2] })));
      const res = await lancer(taches); out.pistes = {};
      console.log(`── la saison d'hiver : ${HIVER.crans.length} crans de ${HIVER.xpCran} XP (${HIVER.crans.length * HIVER.xpCran} XP), le titre à ${HIVER.xpTitre} XP ; du 1er déc. 0 h au 3 janv. 23 h 59 ; l'Avent compté (10 XP la case) ; ${((Date.now() - t0) / 1000).toFixed(0)} s ──`);
      taches.forEach((t, k) => { const r = res[k], quoi = t.nouveau ? `${t.nom}, nouveau le ${t.nouveau} déc.` : `${t.nom} (là depuis le 1er nov.)`;
        console.log(`  ${quoi.padEnd(30)} hiver ${fmt(r.hiver)}`);
        console.log(`  ${''.padEnd(30)} Avent ${r.avent.n}/24 (le 24 : ${r.avent.le24}, le 31 : ${r.avent.le31} ; au plus ${r.avent.maxParJour} par jour ; +${r.avent.etoiles} ★, ${r.avent.boosts} boosts)` + (t.nouveau ? '' : ` · automne ${r.automne.crans}/${r.automne.sur} (finie ${r.automne.fini || '—'})`));
        out.pistes[t.nouveau ? `${t.nom}-nouveau${t.nouveau}` : t.nom] = { hiver: Object.assign({}, r.hiver), avent: r.avent, automne: { xp: r.automne.xp, crans: r.automne.crans, fini: r.automne.fini } }; });
    }
    if (tout || process.argv.includes('--longevite')) {
      const t1 = Date.now(), taches = []; for (const seed of GRAINES) for (const quand of Object.keys(DEPARTS_LONG)) for (const nom of Object.keys(PROFILS_LONG)) for (const v of VARIANTES) taches.push({ type: 'long', quand, nom, v, seed });
      const res = await lancer(taches), J = juger(taches, res);
      console.log(`── l'Avent et la saison d'hiver et le rythme des boutiques (test/longevite.js ; sans → avec l'Avent → avec tout ; graines ${GRAINES.join(', ')}, résumés moyennés ; ${((Date.now() - t1) / 1000).toFixed(0)} s) ──`);
      for (const l of J.lignes) console.log('  ' + l);
      console.log(`  le plus grand écart, une fois ôté le bruit d’une seule étoile : étoiles ${(J.pire.etoiles * 100).toFixed(1)} % avec tout (6 % au plus), ${(J.pire.etoilesAvent * 100).toFixed(1)} % avec l’Avent seul ; boutiques ${J.pire.boutiques} (1) ; première boutique ${J.pire.premiere} j (1) ; franchise ${J.pire.franchise} j (2) ; garde-fous de test/longevite.js : ${J.horsCibles ? J.horsCibles + ' cas hors' : 'tous tenus'} : ${J.ok ? 'aucun effet notable' : 'À REVOIR'}`);
      out.longevite = { pire: J.pire, horsCibles: J.horsCibles, ok: J.ok, lignes: J.lignes };
    }
    const S = arg('--json'); if (S) fs.writeFileSync(S, JSON.stringify(out, null, 1));
  })().catch((e) => { console.error(e); process.exit(1); });
}
