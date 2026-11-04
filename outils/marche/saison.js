#!/usr/bin/env node
// La première saison gratuite, « Automne » (point 6, docs/marche-contrat.md § 8) : la piste de récompenses simulée sur quatre profils.
// Du vendredi 13 novembre 2026 à midi au lundi 30 novembre 2026 à 23 h 59, heure de Paris. L'XP de saison ne vient que de mini-objectifs
// plafonnés (SOURCES, ci-dessous, la copie exacte du contrat) : les objectifs du jour, le défi de la semaine, la série, les paliers
// d'événement (le Marché d'automne, du 13 au 20 : leur jour vient de outils/marche/rythme.js, médiane du profil) et les mini-objectifs du
// casino (l'arrière-salle : jamais de quoi miser gros, src/casino.js). Le joueur de la boulangerie est celui de test/longevite.js (ses
// objectifs du jour et son défi de la semaine, réclamés dès qu'ils sont faits), parti le 5 octobre (un joueur déjà là) ou le jour dit
// (un nouveau joueur : --nouveau 13, --nouveau 20).
// Lancer : TZ=Europe/Paris node outils/marche/saison.js [--json fichier]
'use strict';
const path = require('path'), fs = require('fs');
const G = require('../../src/game.js'), L = require('../../test/longevite.js');
const M = require('./proto.js').charger();

// ─── la piste (la copie exacte du contrat, § 8.2 et 8.3) ───
const SOURCES = {
  objectif: { xp: 5, parJour: 3 },   // chaque objectif du jour réclamé
  journee: { xp: 10, parJour: 1 },   // les trois du jour réclamés (la journée complète)
  defi: { xp: 75, parJour: 1 },      // le défi de la semaine réclamé (une fois par semaine : il n'y en a qu'un)
  serie: { xp: 10, parJour: 1 },     // un jour de SUITE dans la série (la veille comptait aussi) ; classement : serie_auj et serie ≥ 2 ; sans classement : la série locale (§ 8.2)
  palier: { xp: 20, parJour: 4 },    // un palier d'événement franchi (le Marché d'automne ; plus tard l'Avent)
  casino: { xp: 5, parJour: 3 },     // un mini-objectif de l'arrière-salle réussi
};
const CRANS = 22, XP_CRAN = 50, XP_TITRE = 250; // 22 crans de 50 XP (1 100 XP), puis le titre de la saison à +250 (1 350 XP)
const DEBUT = M.parisMs(2026, 11, 13, 12), FIN = M.parisMs(2026, 12, 1, 0); // (la fin : le 30 à 23 h 59 59, la saison d'hiver part le 1er décembre à 0 h)
const PROFILS = { // les mêmes sessions que outils/marche/proto.js (le Marché) ; casino : mini-objectifs de l'arrière-salle réussis par jour, une fois ouverte
  occasionnel: { sessions: [[8, 5], [20.5, 12]], casino: 0, marche: 'occasionnel', jours: [3, 5, 6, 0] }, // 17 min, quatre jours sur sept (mercredi, vendredi, samedi, dimanche)
  quotidien: { sessions: [[7.75, 10], [12.5, 15], [21, 35]], casino: 1, marche: 'quotidien' },
  assidu: { sessions: [[7.5, 20], [12.25, 25], [18, 30], [21.5, 45]], casino: 2, marche: 'assidu' },
  tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]], casino: 3, marche: 'tresactif' },
  'occasionnel-7j': { sessions: [[8, 5], [20.5, 12]], casino: 0, marche: 'occasionnel' }, // (repère) le même, mais tous les jours
};
const PALIERS_MARCHE = (() => { // le jour (1 = le vendredi 13) de chaque palier du Marché, par profil : la graine médiane de outils/marche/rythme.js
  let r = null; try { r = JSON.parse(fs.readFileSync(path.join(__dirname, 'rythme-resultats.json'), 'utf8')); } catch (e) { r = null; }
  const o = {}; for (const p of Object.keys(PROFILS)) o[p] = r && r.profils[p] ? r.profils[p].paliersJour : M.simuler(p, 8, { graine: 1 }).paliersJour;
  return o;
})();
const JOURS_SEMAINE = (ms) => M.paris(ms).getUTCDay(); // 0 dimanche … 6 samedi, heure de Paris
const dayKey = M.dayKey, jourSaison = (ms) => Math.floor((ms - M.parisMs(2026, 11, 13, 0)) / 864e5) + 13; // le jour de novembre (13 → 30)

function simuler(nom, o) {
  o = o || {};
  const P = Object.assign({}, PROFILS[nom] || {}, o.profil || {}); L.PROFILS['saison-' + nom] = { sessions: P.sessions };
  const t0 = o.depart || L.T0; // minuit à Paris du jour de départ
  const jours = o.jours || Math.ceil((FIN - t0) / 864e5); let stC = null;
  const xpJ = {}, sources = { objectif: 0, journee: 0, defi: 0, serie: 0, palier: 0, casino: 0 }, crans = [];
  let xp = 0, vu = { jour: '', obj: 0, complet: false, sem: '', semRec: false, joue: '', veille: '' };
  const ajouter = (src, n, now) => { if (now < DEBUT || now >= FIN || n <= 0) return; const j = dayKey(now); xpJ[j] = xpJ[j] || {}; const deja = xpJ[j][src] || 0, cap = SOURCES[src].parJour; const k = cap ? Math.min(n, cap - deja) : n; if (k <= 0) return; xpJ[j][src] = deja + k; sources[src] += k * SOURCES[src].xp; const avant = Math.floor(xp / XP_CRAN); xp += k * SOURCES[src].xp; const apres = Math.floor(xp / XP_CRAN); for (let c = avant + 1; c <= Math.min(apres, CRANS); c++) { crans.push({ c, t: now }); if (o.recompense) o.recompense(c, now, stC); } };
  const marche = PALIERS_MARCHE[P.marche] || {}, paliersFaits = new Set();
  const R = L.simuler('saison-' + nom, jours, Object.assign({ t0 }, {
    chaqueSeconde(st, now) {
      stC = st; if (o.chaqueSeconde) o.chaqueSeconde(st, now);
      if (now < DEBUT || now >= FIN) return;
      if (P.jours && !P.jours.includes(JOURS_SEMAINE(now))) return; // un jour sans jeu : rien ne compte (la boulangerie du joueur simulé avance quand même : un léger avantage, sans effet sur l'XP)
      const j = st.jour; if (!j) return;
      if (vu.jour !== j.date) vu = Object.assign(vu, { jour: j.date, obj: 0, complet: false });
      const rec = j.objectifs.filter((x) => x.reclame).length;
      if (rec > vu.obj) { ajouter('objectif', rec - vu.obj, now); vu.obj = rec; if (vu.joue !== j.date) { if (vu.joue && vu.joue === dayKey(now - 864e5)) ajouter('serie', 1, now); vu.joue = j.date; } }
      if (j.etoileDonnee && !vu.complet) { vu.complet = true; ajouter('journee', 1, now); }
      const sm = st.semaine; if (sm) { if (vu.sem !== sm.key) { vu.sem = sm.key; vu.semRec = !!sm.reclame && now < DEBUT; } if (sm.reclame && !vu.semRec) { vu.semRec = true; ajouter('defi', 1, now); } }
      // les paliers du Marché : le soir de leur jour (la dernière session du profil), au plus SOURCES.palier.parJour
      // (l'heure de la session sur le jour de la simulation, pas l'heure de Paris : test/longevite.js compte ses jours par 24 h depuis le départ, et
      //  le passage à l'heure d'hiver du 25 octobre décale ses sessions d'une heure)
      const jn = jourSaison(now) - 12, h = (((now - t0) % 864e5) + 864e5) % 864e5 / 3600e3, derniere = P.sessions[P.sessions.length - 1][0];
      if (jn >= 1 && jn <= 8 && h >= derniere) for (const [n, jp] of Object.entries(marche)) if (jp <= jn && !paliersFaits.has(+n) && (!o.arrivee || now >= o.arrivee)) { paliersFaits.add(+n); ajouter('palier', 1, now); }
      // le casino : ses mini-objectifs, une fois l'arrière-salle ouverte (dès la 2e boutique, ou 100 M€ gagnés : GAME.ACCUEIL, 'casino')
      if (P.casino && h >= derniere && vu.casino !== dayKey(now) && (st.boutiques >= 2 || st.lifetime >= 1e8)) { vu.casino = dayKey(now); ajouter('casino', P.casino, now); }
    },
  }));
  const fini = crans.find((x) => x.c === CRANS), titre = xp >= CRANS * XP_CRAN + XP_TITRE;
  if (o.sansSaison) return { R };
  return { profil: nom, xp, crans: Math.min(CRANS, Math.floor(xp / XP_CRAN)), fini: fini ? dayKey(fini.t) : null, titre, sources, parCran: crans.map((x) => dayKey(x.t)), R };
}
module.exports = { SOURCES, CRANS, XP_CRAN, XP_TITRE, DEBUT, FIN, PROFILS, simuler };
if (require.main === module) {
  const iJ = process.argv.indexOf('--json'), SORTIE = iJ > 0 ? process.argv[iJ + 1] : null, out = {};
  console.log(`── la piste « Automne » : ${CRANS} crans de ${XP_CRAN} XP (${CRANS * XP_CRAN} XP), le titre à +${XP_TITRE} ; du 13 nov. midi au 30 nov. 23 h 59 ──`);
  const ligne = (r, quoi) => console.log(`  ${quoi.padEnd(34)} ${String(r.xp).padStart(5)} XP · ${String(r.crans).padStart(2)}/${CRANS} crans (${Math.round(r.crans / CRANS * 100)} %) · finie ${r.fini || '—'} · titre ${r.titre ? 'oui' : 'non'} · ${Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const p of Object.keys(PROFILS)) { const r = simuler(p); ligne(r, `${p} (déjà là depuis le 5 oct.)`); out[p] = { xp: r.xp, crans: r.crans, fini: r.fini, titre: r.titre, sources: r.sources, parCran: r.parCran }; }
  for (const [d, quand] of [[13, M.parisMs(2026, 11, 13, 0)], [20, M.parisMs(2026, 11, 20, 0)]]) for (const p of ['occasionnel', 'quotidien']) {
    const r = simuler(p, { depart: quand, arrivee: quand }); ligne(r, `${p}, nouveau le ${d} nov.`); out[`${p}-nouveau${d}`] = { xp: r.xp, crans: r.crans, fini: r.fini, sources: r.sources };
  }
  if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(out, null, 1));
}
