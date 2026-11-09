#!/usr/bin/env node
// La saison « Automne » simulée sur le VRAI moteur (src/saison.js, src/saison-automne.js) : la logique de outils/marche/saison.js (le joueur
// de test/longevite.js, ses objectifs du jour et son défi de la semaine réclamés dès qu'ils sont faits ; les paliers du Marché le soir de
// leur jour, ceux de la médiane de son profil sur les vraies règles, outils/marche/rythme-reel-resultats.json ; les mini-objectifs de
// l'arrière-salle une fois ouverte), mais l'XP comptée par SAISONS.pas (par constat, plafonnée), les crans reçus par SAISONS.recevoir et
// versés dans la boulangerie par SAISONS.verser (étoiles, boosts LANCÉS aussitôt : le pire cas, vêtements). Et la longévité de
// outils/marche/longevite-saison.js sur ce moteur (sans puis avec la piste, le bruit d'une seule étoile ; les garde-fous de
// test/longevite.js). Pour test/fournil-saison.test.js ; les parties tournent en parallèle (une par cœur, worker_threads).
//   simuler(nom, o) → { profil, xp, crans, fini, titre, sources, parCran, R, piste }
//   o : { depart (ms, minuit à Paris), jours, arrivee, profil: { sessions, casino, marche, jours }, piste: false (sans les récompenses),
//         etoileAuCran: k (le bruit : une étoile de plus au cran k, rien d'autre), chaqueSeconde }
//   longevite() → { lignes, pire, horsCibles, ok } (en parallèle)
'use strict';
const path = require('path'), fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads'), os = require('os');
const G = require('../src/game.js'), L = require('./longevite.js'), SAISONS = require('../src/saison.js'), AUTOMNE = require('../src/saison-automne.js');
const F = AUTOMNE, DEBUT = F.debut, FIN = F.fin;
const PROFILS = { // les sessions de outils/marche/proto.js (le Marché) ; casino : mini-objectifs de l'arrière-salle réussis par jour, une fois ouverte
  occasionnel: { sessions: [[8, 5], [20.5, 12]], casino: 0, marche: 'occasionnel', jours: [3, 5, 6, 0] }, // 17 min, quatre jours sur sept (mercredi, vendredi, samedi, dimanche)
  quotidien: { sessions: [[7.75, 10], [12.5, 15], [21, 35]], casino: 1, marche: 'quotidien' },
  assidu: { sessions: [[7.5, 20], [12.25, 25], [18, 30], [21.5, 45]], casino: 2, marche: 'assidu' },
  tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]], casino: 3, marche: 'tresactif' },
  'occasionnel-7j': { sessions: [[8, 5], [20.5, 12]], casino: 0, marche: 'occasionnel' },
};
const PALIERS_MARCHE = (() => { // le jour (1 = le vendredi 13) de chaque palier du Marché, par profil : la première graine des vraies règles
  let r = null; try { r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'outils', 'marche', 'rythme-reel-resultats.json'), 'utf8')); } catch (e) { r = null; }
  const o = {}; for (const p of ['occasionnel', 'quotidien', 'assidu', 'tresactif']) o[p] = r && r.profils[p] ? r.profils[p].paliersJour : null;
  if (Object.values(o).some((x) => !x)) { const MC = require('../src/marche.js'); for (const p of Object.keys(o)) if (!o[p]) o[p] = MC.simuler(p, MC.JOURS, { graine: 1 }).paliersJour; }
  return o;
})();
const jourSemaine = (ms) => SAISONS.paris(ms).getUTCDay();
const dayKey = SAISONS.dayKey;

function simuler(nom, o) {
  o = o || {};
  const P = Object.assign({}, PROFILS[nom] || {}, o.profil || {}); L.PROFILS['saison-' + nom] = { sessions: P.sessions };
  const t0 = o.depart || L.T0, jours = o.jours || Math.ceil((FIN - t0) / 864e5);
  // la vue que lit le moteur des saisons : le jour, la semaine (ceux du jeu), les paliers du Marché et l'arrière-salle (posés ici), la piste
  const vue = { jour: null, semaine: null, marche: { paliers: [] }, arriere: { casino: { jour: '', objectifs: [] } } };
  const sources = { objectif: 0, journee: 0, defi: 0, serie: 0, palier: 0, casino: 0 }, crans = [], lots = [];
  const marche = PALIERS_MARCHE[P.marche] || {}, derniere = P.sessions[P.sessions.length - 1][0];
  const R = L.simuler('saison-' + nom, jours, {
    t0,
    chaqueSeconde(st, now) {
      if (o.chaqueSeconde) o.chaqueSeconde(st, now);
      if (now < DEBUT - 864e5 || now >= FIN + 864e5) return;
      if (P.jours && !P.jours.includes(jourSemaine(now))) return; // un jour sans jeu : l'appli n'est pas ouverte, rien n'est constaté
      vue.jour = st.jour; vue.semaine = st.semaine;
      const h = (((now - t0) % 864e5) + 864e5) % 864e5 / 3600e3, jn = Math.floor((now - SAISONS.parisMs(2026, 11, 13, 0)) / 864e5) + 1; // (l'heure de la simulation : test/longevite.js compte ses jours par 24 h)
      if (jn >= 1 && jn <= 8 && h >= derniere) for (const [n, jp] of Object.entries(marche)) if (jp <= jn && !vue.marche.paliers.includes(+n) && (!o.arrivee || now >= o.arrivee)) vue.marche.paliers.push(+n);
      if (P.casino && h >= derniere && vue.arriere.casino.jour !== dayKey(now) && (st.boutiques >= 2 || st.lifetime >= 1e8)) vue.arriere.casino = { jour: dayKey(now), objectifs: Array.from({ length: 3 }, (x, k) => ({ fait: k < P.casino })) };
      const out = SAISONS.pas(vue, now, null);
      for (const [k, v] of Object.entries(out.sources)) sources[k] += v;
      for (const n of out.nouveaux) {
        crans.push({ c: n, t: now });
        if (o.etoileAuCran === n) st.etoiles += 1; // le bruit : une seule étoile, rien d'autre
        if (o.piste !== false && o.etoileAuCran == null) { const lot = SAISONS.recevoir(vue, n); lots.push(lot); SAISONS.verser(st, lot, G); }
      }
      if (o.piste !== false && o.etoileAuCran == null) { const b = st.boosts; if (b && Array.isArray(b.reserve) && b.reserve.length && !(b.actif && b.actif.fin > st.now)) G.lancerBoostReserve(st, b.reserve.length - 1); } // (les boosts de la piste : lancés tout de suite)
    },
  });
  const p = vue.piste && vue.piste.passees && vue.piste.passees[F.id] ? Object.assign({}, vue.piste.passees[F.id], { id: F.id }) : vue.piste || { xp: 0 }, fini = crans.find((x) => x.c === F.crans.length); // (la saison finie : son archive)
  return { profil: nom, xp: p.xp, crans: p.crans != null ? p.crans : SAISONS.crans(vue), fini: fini ? dayKey(fini.t) : null, titre: p.xp >= F.xpTitre, sources, parCran: crans.map((x) => dayKey(x.t)), lots, R, piste: p };
}

// ─── la longévité (outils/marche/longevite-saison.js, sur le vrai moteur) ───
const CIBLES = (() => { const t = fs.readFileSync(path.join(__dirname, 'longevite.js'), 'utf8'), m = /const CIBLES = (\{[\s\S]*?\n\});/.exec(t); return m ? Function(`return (${m[1]});`)() : null; })();
const PROFILS_LONG = { occasionnel: { casino: 0, marche: 'occasionnel' }, regulier: { casino: 1, marche: 'quotidien' }, assidu: { casino: 2, marche: 'assidu' } };
const resumer = (nom, R) => { const r = L.resume(nom, R), d = R.M.prestiges.slice(1).map((x) => x.duree); return { premiere: r.premierPrestige ? r.premierPrestige.jour : null, boutiques: R.st.boutiques, plusLongue: d.length ? Math.max(...d) : 0, franchise: r.franchise, piece: r.piece, etoilesJ30: r.etoiles.j30, etoilesFin: r.etoiles.fin, niveau: r.niveau.fin, attente: r.attente }; };
function partieLongevite(quand, nom, variante) { // variante : 'sans' | 'avec' | k (une étoile au cran k)
  const base = { profil: Object.assign({ sessions: L.PROFILS[nom].sessions }, PROFILS_LONG[nom]), depart: L.DEPARTS[quand], jours: 60 };
  const o = variante === 'sans' ? Object.assign({}, base, { piste: false }) : variante === 'avec' ? base : Object.assign({}, base, { etoileAuCran: variante });
  const s = simuler(nom, o); return { resume: resumer(nom, s.R), crans: s.crans, etoiles: s.lots.reduce((a, l) => a + (l.etoiles || 0), 0), boosts: s.lots.filter((l) => l.boost).length };
}
function lancer(taches, hiver) { // hiver : des travailleurs qui chargent aussi la fiche d'hiver (src/saison-hiver.js)
  return new Promise((ok, ko) => {
    const res = new Array(taches.length), n = Math.max(1, Math.min(taches.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    let suivante = 0, finis = 0; if (!taches.length) ok(res);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename, { workerData: { travailleur: true, hiver: !!hiver } });
      const donner = () => { if (suivante < taches.length) { const k = suivante++; wk.postMessage({ k, t: taches[k] }); } else wk.terminate(); };
      wk.on('message', ({ k, r }) => { res[k] = r; if (++finis === taches.length) ok(res); donner(); });
      wk.on('error', ko); donner();
    }
  });
}
const resumePiste = (r) => ({ profil: r.profil, xp: r.xp, crans: r.crans, fini: r.fini, titre: r.titre, sources: r.sources, parCran: r.parCran, etoiles: r.lots.reduce((a, l) => a + (l.etoiles || 0), 0), boosts: r.lots.filter((l) => l.boost).length });
// tout en parallèle : les pistes (pistes : [{ nom, o }] → résumés, sans R) et la longévité ; → { pistes: [...], longevite }
async function toutEnParallele(pistes) {
  const taches = pistes.map((x) => ({ type: 'piste', nom: x.nom, o: x.o || {} }));
  for (const quand of ['5 oct.', '1er nov.']) for (const nom of Object.keys(PROFILS_LONG)) for (const v of ['sans', 'avec', 2, 6, 12, 18]) taches.push({ type: 'long', quand, nom, v });
  const res = await lancer(taches);
  return { pistes: res.slice(0, pistes.length), longevite: jugerLongevite(taches.slice(pistes.length), res.slice(pistes.length)) };
}
async function longevite() {
  const taches = [];
  for (const quand of ['5 oct.', '1er nov.']) for (const nom of Object.keys(PROFILS_LONG)) for (const v of ['sans', 'avec', 2, 6, 12, 18]) taches.push({ type: 'long', quand, nom, v });
  return jugerLongevite(taches, await lancer(taches));
}
function jugerLongevite(taches, res) {
  const R = {}; taches.forEach((t, k) => { R[`${t.quand}|${t.nom}|${t.v}`] = res[k]; });
  let pire = { etoiles: 0, boutiques: 0, premiere: 0, franchise: 0 }, horsCibles = 0; const lignes = [];
  const entre = (v, c) => !c || (v != null && v >= c[0] && v <= c[1]);
  for (const quand of ['5 oct.', '1er nov.']) for (const nom of Object.keys(PROFILS_LONG)) {
    const a = R[`${quand}|${nom}|sans`].resume, av = R[`${quand}|${nom}|avec`], b = av.resume, bruit = [2, 6, 12, 18].map((k) => R[`${quand}|${nom}|${k}`].resume);
    const ecart = (x, y) => Math.abs(y / x - 1), bruitE = Math.max(...bruit.map((z) => Math.max(ecart(a.etoilesJ30, z.etoilesJ30), ecart(a.etoilesFin, z.etoilesFin))));
    const bruitF = Math.max(...bruit.map((z) => Math.abs((z.franchise || 0) - (a.franchise || 0)))), bruitB = Math.max(...bruit.map((z) => Math.abs(z.boutiques - a.boutiques)));
    lignes.push(`${nom.padEnd(11)} départ ${quand.padEnd(8)} crans ${av.crans}/22 (+${av.etoiles} ★, ${av.boosts} boosts) : boutiques ${a.boutiques} → ${b.boutiques} · 1re j${a.premiere} → j${b.premiere} · franchise j${a.franchise} → j${b.franchise} · étoiles j30 ${a.etoilesJ30} → ${b.etoilesJ30}, fin ${a.etoilesFin} → ${b.etoilesFin} (${((b.etoilesFin / a.etoilesFin - 1) * 100).toFixed(1)} %) · bruit d’une étoile ${(bruitE * 100).toFixed(1)} %`);
    const c = CIBLES && CIBLES[nom], cib = !c ? 'CIBLES illisibles' : [['premiere', 'premierPrestige'], ['franchise', 'franchise'], ['etoilesJ30', 'etoilesJ30'], ['piece', 'piece'], ['niveau', 'niveauFin']].filter(([k, kc]) => !entre(b[k], c[kc])).map(([k]) => k).concat(b.plusLongue > (c.dureeMax || 99) ? ['plusLongue'] : []).join(', ');
    if (cib) { horsCibles++; lignes.push(`      hors des garde-fous de test/longevite.js : ${cib}`); }
    pire = { etoiles: Math.max(pire.etoiles, Math.max(ecart(a.etoilesFin, b.etoilesFin), ecart(a.etoilesJ30, b.etoilesJ30)) - Math.max(0.05, 1.5 * bruitE) + 0.05), boutiques: Math.max(pire.boutiques, Math.abs(b.boutiques - a.boutiques) - Math.max(1, bruitB) + 1), premiere: Math.max(pire.premiere, Math.abs((b.premiere || 0) - (a.premiere || 0))), franchise: Math.max(pire.franchise, Math.abs((b.franchise || 0) - (a.franchise || 0)) - Math.max(2, Math.ceil(1.5 * bruitF)) + 2) };
  }
  // (6 % au plus pour les étoiles depuis le 5 nov. : à 45 XP le cran, choix du joueur, les mêmes 16 étoiles arrivent deux jours plus tôt ; l'assidu parti le 1er nov. dépasse de peu 5 %)
  const ok = pire.etoiles <= 0.06 && pire.boutiques <= 1 && pire.premiere <= 1 && pire.franchise <= 2 && !horsCibles;
  return { lignes, pire, horsCibles, ok };
}

// ─── la saison d'hiver et le calendrier de l'Avent (docs/noel-contrat.md § 3, § 8.2, § 8.3) sur le VRAI moteur : src/saison.js (50 crans, les
//     lecteurs), src/saison-automne.js PUIS src/saison-hiver.js (l'enchaînement du 1er décembre joué dans le même st.piste), src/avent.js.
//     La logique de outils/noel/hiver.js (la référence de conception), mot pour mot : le joueur de test/longevite.js, ses objectifs du jour et
//     son défi réclamés ; les paliers du Marché d'automne et du Marché de Noël le soir de leur jour (outils/marche/rythme-reel-resultats.json,
//     outils/noel/rythme-resultats.json) ; l'arrière-salle une fois ouverte ; l'Avent : à la première seconde d'un jour joué, la case du jour
//     et UNE oubliée ; les crans reçus et VERSÉS (étoiles, boosts LANCÉS aussitôt : le pire cas). Ces parties tournent dans des travailleurs
//     à part (workerData.hiver : la fiche d'hiver n'y est chargée que là ; les parties d'automne n'en voient rien).
const AVENT = require('../src/avent.js');
const HIVER = () => SAISONS.fiche('hiver-2026');
const PALIERS_NOEL = (() => { let r = null; try { r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'outils', 'noel', 'rythme-resultats.json'), 'utf8')); } catch (e) { r = null; } const o = {}; for (const p of ['occasionnel', 'quotidien', 'assidu', 'tresactif']) o[p] = r && r.profils[p] ? r.profils[p].paliersJour : PALIERS_MARCHE[p]; return o; })();
const OUV = { marche: SAISONS.parisMs(2026, 11, 13, 0), noel: SAISONS.parisMs(2026, 12, 18, 0) }; // minuit du jour 1 de chaque marché
// o : { depart, jours, arrivee, profil, recompenses: 'automne' | 'avent' | 'tout', bruitJour: d (une étoile le d décembre, rien d'autre que l'automne), seed }
function simulerHiver(nom, o) {
  o = o || {}; const HV = HIVER(); if (!HV) throw new Error('la fiche d’hiver n’est pas chargée (workerData.hiver)');
  const P = Object.assign({}, PROFILS[nom] || {}, o.profil || {}), cle = 'hiver-' + nom; L.PROFILS[cle] = { sessions: P.sessions };
  const t0 = o.depart || L.DEPARTS['1er nov.'], jours = o.jours || Math.ceil((HV.fin - t0) / 864e5), rec = o.recompenses || 'tout';
  const versePiste = (id) => rec === 'tout' || (id === F.id && rec !== 'aucune'), verseAvent = rec === 'avent' || rec === 'tout';
  const vue = { jour: null, semaine: null, marche: { paliers: [] }, noel: { paliers: [] }, arriere: { casino: { jour: '', objectifs: [] } } };
  const S = { [F.id]: { sources: {}, crans: [], etoiles: 0, boosts: 0 }, [HV.id]: { sources: {}, crans: [], etoiles: 0, boosts: 0 } };
  const avent = { ouvertes: [], parJour: {}, etoiles: 0, boosts: 0, le24: 0, le31: 0 }, PAL = { marche: PALIERS_MARCHE[P.marche] || {}, noel: PALIERS_NOEL[P.marche] || {} };
  const derniere = P.sessions[P.sessions.length - 1][0]; let bruitFait = false, vuJour = '';
  const R = L.simuler(cle, jours, {
    t0, seed: o.seed || 11,
    chaqueSeconde(st, now) {
      if (o.bruitJour && !bruitFait && now >= SAISONS.parisMs(2026, 12, o.bruitJour, 0)) { st.etoiles += 1; bruitFait = true; }
      if (now < F.debut - 864e5 || now >= HV.fin) return;
      if (P.jours && !P.jours.includes(jourSemaine(now))) return; // un jour sans jeu : l'appli n'est pas ouverte
      if (o.arrivee && now < o.arrivee) return;
      vue.jour = st.jour; vue.semaine = st.semaine;
      const h = (((now - t0) % 864e5) + 864e5) % 864e5 / 3600e3;
      for (const ev of ['marche', 'noel']) { const jn = Math.floor((now - OUV[ev]) / 864e5) + 1; if (jn >= 1 && jn <= 8 && h >= derniere) for (const [n, jp] of Object.entries(PAL[ev])) if (jp <= jn && !vue[ev].paliers.includes(+n)) vue[ev].paliers.push(+n); }
      if (P.casino && h >= derniere && vue.arriere.casino.jour !== dayKey(now) && (st.boutiques >= 2 || st.lifetime >= 1e8)) vue.arriere.casino = { jour: dayKey(now), objectifs: Array.from({ length: 3 }, (x, k) => ({ fait: k < P.casino })) };
      const dk = dayKey(now); // l'Avent : à la première seconde d'un jour joué, la case du jour et une oubliée (la plus ancienne)
      if (dk !== vuJour && now >= AVENT.DEBUT && now < AVENT.FIN) {
        vuJour = dk; const ou = AVENT.ouvrables(vue, now, now), l = [];
        if (ou.du) l.push(ou.du); if (ou.rattrapage.length) l.push(ou.rattrapage[0]);
        for (const n of l) { const r = AVENT.ouvrir(vue, n, now, now); if (!r.ok) continue; avent.ouvertes.push(n); avent.parJour[dk] = (avent.parJour[dk] || 0) + 1;
          if (verseAvent) { const f = AVENT.verser(st, r.lot, G); avent.etoiles += f.etoiles; if (f.boost) avent.boosts++; } }
        if (now < AVENT.FIN_CASES) avent.le24 = avent.ouvertes.length; avent.le31 = avent.ouvertes.length;
      }
      const id0 = vue.piste && vue.piste.id, out = SAISONS.pas(vue, now, null), id = vue.piste && vue.piste.id;
      if (out.fin) SAISONS.recevoirFin(vue); // (les dus d'une saison finie : rien d'autre ici, les crans sont reçus aussitôt)
      const x = S[id] || S[id0]; if (!x) return;
      for (const [k, v] of Object.entries(out.sources)) x.sources[k] = (x.sources[k] || 0) + v;
      for (const n of out.nouveaux) { x.crans.push({ c: n, t: now }); const lot = SAISONS.recevoir(vue, n); if (lot && versePiste(id)) { const f = SAISONS.verser(st, lot, G); x.etoiles += f.etoiles; if (f.boost) x.boosts++; } }
      if (rec !== 'aucune') { const b = st.boosts; if (b && Array.isArray(b.reserve) && b.reserve.length && !(b.actif && b.actif.fin > st.now)) G.lancerBoostReserve(st, b.reserve.length - 1); } // (lancés tout de suite : le pire cas)
    },
  });
  const res = {};
  for (const Fx of [F, HV]) {
    const arch = vue.piste && vue.piste.passees && vue.piste.passees[Fx.id], cur = vue.piste && vue.piste.id === Fx.id ? vue.piste : null;
    const xp = arch ? arch.xp : cur ? cur.xp : 0, x = S[Fx.id], fini = x.crans.find((c) => c.c === Fx.crans.length);
    res[Fx.id] = { xp, crans: Math.min(Fx.crans.length, Math.floor(xp / Fx.xpCran)), sur: Fx.crans.length, fini: fini ? dayKey(fini.t) : null, titre: xp >= Fx.xpTitre, sources: x.sources, etoiles: x.etoiles, boosts: x.boosts };
  }
  return { profil: nom, automne: res[F.id], hiver: res[HV.id], avent: { n: avent.ouvertes.length, le24: avent.le24, le31: avent.le31, etoiles: avent.etoiles, boosts: avent.boosts, maxParJour: Math.max(0, ...Object.values(avent.parJour)) }, R };
}
// la longévité (outils/noel/hiver.js --longevite, ses seuils) : sans → avec l'Avent → avec tout, le bruit d'une étoile (2, 8, 14, 20 déc.),
// chaque partie sur plusieurs graines du hasard de test/longevite.js, les résumés MOYENNÉS (une partie seule est chaotique, § 8.3)
const PROFILS_LONG_H = { occasionnel: { casino: 0, marche: 'occasionnel' }, regulier: { casino: 1, marche: 'quotidien' }, assidu: { casino: 2, marche: 'assidu' } };
const DEPARTS_LONG_H = { '5 oct.': 91, '1er nov.': 60, '1er déc.': 60 };
const VARIANTES_H = ['sans', 'avent', 'tout', 2, 8, 14, 20];
function partieLongeviteHiver(quand, nom, v, seed) {
  const base = { profil: Object.assign({ sessions: L.PROFILS[nom].sessions }, PROFILS_LONG_H[nom]), depart: L.DEPARTS[quand], jours: DEPARTS_LONG_H[quand], seed: seed || 11 };
  const o = Object.assign({}, base, typeof v === 'number' ? { recompenses: 'automne', bruitJour: v } : { recompenses: v === 'sans' ? 'automne' : v });
  const s = simulerHiver(nom, o);
  return { resume: resumer(nom, s.R), hiver: s.hiver.crans, etoiles: s.hiver.etoiles + s.avent.etoiles, boostsH: s.hiver.boosts, avent: s.avent.n, etoilesAvent: s.avent.etoiles };
}
// le jugement de outils/noel/hiver.js (juger), avec l'exception que le joueur a GARDÉE le 9 novembre (docs/noel-contrat.md § 15.1) : le
// nouveau joueur occasionnel de décembre (départ du 1er déc.) a plus d'étoiles au 30e jour ; on le mesure à part (exception), ses garde-fous restent
function jugerLongeviteHiver(taches, res, exceptions) {
  const G0 = {}; taches.forEach((t, k) => { (G0[`${t.quand}|${t.nom}|${t.v}`] = G0[`${t.quand}|${t.nom}|${t.v}`] || []).push(res[k]); });
  const moy = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0) / l.length;
  const R = {}; for (const [c, l] of Object.entries(G0)) { const r0 = l[0]; R[c] = Object.assign({}, r0, { resume: Object.fromEntries(Object.keys(r0.resume).map((k) => [k, typeof r0.resume[k] === 'number' ? +moy(l, (x) => x.resume[k]).toFixed(k === 'boutiques' || k === 'premiere' || k === 'franchise' ? 1 : 0) : r0.resume[k]])) }); }
  let pire = { etoiles: 0, boutiques: 0, premiere: 0, franchise: 0, etoilesAvent: 0 }, horsCibles = 0; const lignes = [], exc = {};
  const entre = (v, c) => !c || (v != null && v >= c[0] && v <= c[1]);
  for (const quand of Object.keys(DEPARTS_LONG_H)) for (const nom of Object.keys(PROFILS_LONG_H)) {
    const a = R[`${quand}|${nom}|sans`].resume, av = R[`${quand}|${nom}|avent`], b = R[`${quand}|${nom}|tout`].resume, tt = R[`${quand}|${nom}|tout`], bruit = [2, 8, 14, 20].map((k) => R[`${quand}|${nom}|${k}`].resume);
    const ecart = (x, y) => Math.abs(y / x - 1), bruitE = Math.max(...bruit.map((z) => Math.max(ecart(a.etoilesJ30, z.etoilesJ30), ecart(a.etoilesFin, z.etoilesFin))));
    const bruitF = Math.max(...bruit.map((z) => Math.abs((z.franchise || 0) - (a.franchise || 0)))), bruitB = Math.max(...bruit.map((z) => Math.abs(z.boutiques - a.boutiques)));
    const pc = (x, y) => `${((y / x - 1) * 100).toFixed(1)} %`;
    lignes.push(`${nom.padEnd(11)} départ ${quand.padEnd(8)} (${DEPARTS_LONG_H[quand]} j) Avent ${tt.avent}/24 (+${tt.etoilesAvent} ★), hiver ${tt.hiver} crans (+${tt.etoiles - tt.etoilesAvent} ★, ${tt.boostsH} boosts) : boutiques ${a.boutiques} → ${av.resume.boutiques} → ${b.boutiques} · franchise j${a.franchise} → j${b.franchise} · étoiles j30 ${a.etoilesJ30} → ${b.etoilesJ30} (${pc(a.etoilesJ30, b.etoilesJ30)}), fin ${a.etoilesFin} → ${av.resume.etoilesFin} → ${b.etoilesFin} (${pc(a.etoilesFin, b.etoilesFin)}) · bruit d’une étoile ${(bruitE * 100).toFixed(1)} %`);
    const c = CIBLES && CIBLES[nom], fin60 = DEPARTS_LONG_H[quand] === 60;
    const cib = !c ? 'CIBLES illisibles' : [['premiere', 'premierPrestige'], ['franchise', 'franchise'], ['etoilesJ30', 'etoilesJ30'], ['piece', 'piece']].concat(fin60 ? [['niveau', 'niveauFin']] : []).filter(([k, kc]) => !entre(b[k], c[kc]) && entre(a[k], c[kc])).map(([k]) => k).concat(fin60 && b.plusLongue > (c.dureeMax || 99) && !(a.plusLongue > (c.dureeMax || 99)) ? ['plusLongue'] : []).join(', ');
    if (cib) { horsCibles++; lignes.push(`      hors des garde-fous de test/longevite.js : ${cib}`); }
    const cle = `${quand}|${nom}`, e = { etoiles: 0, etoilesAvent: 0, boutiques: 0, premiere: 0, franchise: 0 };
    for (const [y, k] of [[b, 'etoiles'], [av.resume, 'etoilesAvent']]) e[k] = Math.max(ecart(a.etoilesFin, y.etoilesFin), ecart(a.etoilesJ30, y.etoilesJ30)) - Math.max(0.05, 1.5 * bruitE) + 0.05;
    e.boutiques = Math.abs(b.boutiques - a.boutiques) - Math.max(1, bruitB) + 1; e.premiere = Math.abs((b.premiere || 0) - (a.premiere || 0)); e.franchise = Math.abs((b.franchise || 0) - (a.franchise || 0)) - Math.max(2, Math.ceil(1.5 * bruitF)) + 2;
    if ((exceptions || []).includes(cle)) { exc[cle] = Object.assign({}, e, { j30: b.etoilesJ30 / a.etoilesJ30 - 1, fin: b.etoilesFin / a.etoilesFin - 1, dFranchise: (b.franchise || 0) - (a.franchise || 0) }); /* (dFranchise < 0 : la franchise plus tôt) */ lignes.push(`      (exception gardée par le joueur, § 15.1 : étoiles j30 ${pc(a.etoilesJ30, b.etoilesJ30)}, fin ${pc(a.etoilesFin, b.etoilesFin)})`); continue; }
    for (const k of Object.keys(pire)) pire[k] = Math.max(pire[k], e[k]);
  }
  const ok = pire.etoiles <= 0.06 && pire.boutiques <= 1 && pire.premiere <= 1 && pire.franchise <= 2 && !horsCibles;
  return { lignes, pire, horsCibles, ok, exceptions: exc };
}
// tout l'hiver en parallèle : les pistes (pistes : [{ nom, o }]) et, si graines, la longévité ; → { pistes, longevite }
async function toutHiver(pistes, graines, exceptions) {
  const taches = pistes.map((x) => ({ type: 'hiver', nom: x.nom, o: x.o || {} })), np = taches.length;
  if (graines && graines.length) for (const seed of graines) for (const quand of Object.keys(DEPARTS_LONG_H)) for (const nom of Object.keys(PROFILS_LONG_H)) for (const v of VARIANTES_H) taches.push({ type: 'long-hiver', quand, nom, v, seed });
  const res = await lancer(taches, true);
  return { pistes: res.slice(0, np), longevite: graines && graines.length ? jugerLongeviteHiver(taches.slice(np), res.slice(np), exceptions) : null };
}
const resumeHiver = (r) => ({ profil: r.profil, automne: { xp: r.automne.xp, crans: r.automne.crans, fini: r.automne.fini }, hiver: r.hiver, avent: r.avent });
module.exports = { PROFILS, PALIERS_MARCHE, simuler, longevite, toutEnParallele, resumePiste, DEBUT, FIN, simulerHiver, toutHiver, jugerLongeviteHiver, PALIERS_NOEL };

if (!isMainThread && workerData && workerData.travailleur) {
  if (workerData.hiver) require('../src/saison-hiver.js'); // (seulement dans ces travailleurs : les parties d'automne ne voient pas l'hiver)
  parentPort.on('message', ({ k, t }) => parentPort.postMessage({ k, r: t.type === 'hiver' ? resumeHiver(simulerHiver(t.nom, Object.assign({}, t.o, t.o && t.o.departParis ? { depart: SAISONS.parisMs(...t.o.departParis), arrivee: SAISONS.parisMs(...t.o.departParis) } : {}))) : t.type === 'long-hiver' ? partieLongeviteHiver(t.quand, t.nom, t.v, t.seed) : t.type === 'piste' ? resumePiste(simuler(t.nom, Object.assign({}, t.o, t.o && t.o.departParis ? { depart: SAISONS.parisMs(...t.o.departParis), arrivee: SAISONS.parisMs(...t.o.departParis) } : {}))) : partieLongevite(t.quand, t.nom, t.v) }));
} else if (isMainThread && require.main === module) {
  (async () => {
    for (const p of Object.keys(PROFILS)) { const r = simuler(p); console.log(`${p.padEnd(15)} ${r.xp} XP · ${r.crans}/22 · finie ${r.fini || '—'} · titre ${r.titre ? 'oui' : 'non'} · ${Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`); }
    const l = await longevite(); console.log(l.lignes.join('\n')); console.log(JSON.stringify(l.pire), l.ok ? 'aucun effet notable' : 'À REVOIR');
  })().catch((e) => { console.error(e); process.exit(1); });
}
