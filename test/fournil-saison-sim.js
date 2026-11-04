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
function lancer(taches) {
  return new Promise((ok, ko) => {
    const res = new Array(taches.length), n = Math.max(1, Math.min(taches.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    let suivante = 0, finis = 0; if (!taches.length) ok(res);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename, { workerData: { travailleur: true } });
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
  const ok = pire.etoiles <= 0.05 && pire.boutiques <= 1 && pire.premiere <= 1 && pire.franchise <= 2 && !horsCibles;
  return { lignes, pire, horsCibles, ok };
}
module.exports = { PROFILS, PALIERS_MARCHE, simuler, longevite, toutEnParallele, resumePiste, DEBUT, FIN };

if (!isMainThread && workerData && workerData.travailleur) {
  parentPort.on('message', ({ k, t }) => parentPort.postMessage({ k, r: t.type === 'piste' ? resumePiste(simuler(t.nom, Object.assign({}, t.o, t.o && t.o.departParis ? { depart: SAISONS.parisMs(...t.o.departParis), arrivee: SAISONS.parisMs(...t.o.departParis) } : {}))) : partieLongevite(t.quand, t.nom, t.v) }));
} else if (isMainThread && require.main === module) {
  (async () => {
    for (const p of Object.keys(PROFILS)) { const r = simuler(p); console.log(`${p.padEnd(15)} ${r.xp} XP · ${r.crans}/22 · finie ${r.fini || '—'} · titre ${r.titre ? 'oui' : 'non'} · ${Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`); }
    const l = await longevite(); console.log(l.lignes.join('\n')); console.log(JSON.stringify(l.pire), l.ok ? 'aucun effet notable' : 'À REVOIR');
  })().catch((e) => { console.error(e); process.exit(1); });
}
