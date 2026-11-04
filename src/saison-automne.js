/* LE FOURNIL — la saison d'automne 2026 (la fiche de la piste) : BOUCHON DU CONSTRUCTEUR B, d'après docs/marche-contrat.md § 7.3.
   La version du constructeur A le REMPLACE à la fusion. */
(function (root) {
  'use strict';
  const S = typeof module === 'object' && module.exports ? require('./saison.js') : root.SAISONS;
  if (!S) return;
  function decalageParis(ms) { const a = new Date(ms).getUTCFullYear(); const dd = (m) => { const d = new Date(Date.UTC(a, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); }; return ms >= dd(2) && ms < dd(9) ? 2 * 3600e3 : 3600e3; }
  function parisMs(a, m, j, h) { let t = Date.UTC(a, m - 1, j, h) - 3600e3; t = Date.UTC(a, m - 1, j, h) - decalageParis(t); return Date.UTC(a, m - 1, j, h) - decalageParis(t); }
  const B = (mult, secs) => ({ mult, secs });
  const CRANS = [
    { boost: B(2, 1800) }, { etoiles: 1 }, { deco: 'couronne-feuilles' }, { etoiles: 1 }, { vetement: 'automne-gavroche' }, { etoiles: 1 },
    { deco: 'guirlande-feuilles' }, { etoiles: 1 }, { vetement: 'automne-echarpe' }, { etoiles: 1, boost: B(2, 1800) }, { etoiles: 1 }, { etoiles: 1 },
    { vetement: 'automne-pull' }, { etoiles: 2 }, { deco: 'lanterne-automne' }, { etoiles: 1 }, { vetement: 'automne-bottines' }, { etoiles: 2 },
    { deco: 'epouvantail' }, { boost: B(3, 1800) }, { etoiles: 2 }, { trophee: 'trophee-automne-2026', etoiles: 2 },
  ].map((c, k) => Object.assign({ n: k + 1 }, c));
  S.ajouter({
    id: 'automne-2026', nom: 'La saison d’automne', court: 'Saison d’automne', debut: parisMs(2026, 11, 13, 12), fin: parisMs(2026, 12, 1, 0),
    sources: S.SOURCES, crans: CRANS, xpCran: 50, titre: { xp: 250, distinction: 'feuille-or-2026', nom: 'Feuille d’or 2026' },
    couleurs: { fond: '#FFF4E4', accent: '#D9622B', or: '#E8B33A', vert: '#7A9A3A', texte: '#4A2E1C' },
    textes: { annonceTitre: 'Nouveau : la saison d’automne', annonce: 'Une piste de 22 récompenses gratuites, jusqu’au 30 novembre : tes objectifs du jour, le défi de la semaine, ta série et les paliers du Marché la font avancer. Tout ce que tu gagnes reste à vie.' },
  });
})(typeof self !== 'undefined' ? self : this);
