#!/usr/bin/env node
// Le Marché d'automne (point 6) : un PROTOTYPE des règles, pour les simulations de conception (docs/marche-contrat.md). Rien ici n'est le
// jeu : src/marche.js n'existe pas encore. Le prototype est le moteur de la Maison hantée (src/hantee.js, lu tel quel sur le disque)
// avec ce que le contrat change et qui touche au rythme ou à l'enveloppe du serveur :
//   · la fenêtre : du vendredi 13 novembre 2026 à midi au vendredi 20 novembre 2026 à 20 h, heure de Paris (8 jours de Paris, JOURS = 8) ;
//   · les paliers : leurs seuils (total) et leur jour d'ouverture (jour : 1 = le vendredi 13 dès midi, puis à minuit, heure de Paris) ;
//   · les profils de la simulation : occasionnel 17 min, quotidien 1 h, assidu 2 h, très actif 8 h, marathon 23 h 48 (l'enveloppe) ;
//   · l'identifiant des activités ('marche' : les graines de la recette du jour et des mini-jeux en dépendent).
// Les recettes, les prix, les Sortilèges (au Marché : les « Astuces »), les coups de pouce, le ×6 de présence, les activités et la
// collection gardent EXACTEMENT les chiffres du Manoir (le contrat le demande : même moteur ; seul l'habillage change).
// Usage : const M = require('./proto.js').charger(); M.simuler('quotidien', 8, { graine: 3 })
'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');
const RACINE = path.join(__dirname, '..', '..');

// les paliers du Marché : [seuil (noisettes gagnées), jour d'ouverture] ; les récompenses sont dans le contrat (§ 3), sans effet sur le rythme
// (elles vont à la boulangerie). Réglés par outils/marche/rythme.js (médiane sur 8 graines) : voir docs/marche-contrat.md § 4.
const PALIERS = [
  [5e7, 1], [5e9, 1], [5e10, 1],
  [2.5e11, 2], [8e11, 2], [1.6e12, 2],
  [3e12, 3], [6e12, 3], [1.2e13, 3],
  [6e13, 4], [3e14, 4], [5e14, 4],
  [8e14, 5], [1.4e15, 5],
  [2.6e15, 6], [3.6e15, 6],
  [5.5e15, 7], [9e15, 7],
  [1.5e16, 8], [2.6e16, 8],
];
// les profils (heures de Paris des sessions, minutes) : le contrat parle d'un « quotidien d'une heure » et d'un assidu de deux heures
const PROFILS = {
  occasionnel: [[8, 5], [20.5, 12]], // 17 min
  quotidien: [[7.75, 10], [12.5, 15], [21, 35]], // 1 h
  assidu: [[7.5, 20], [12.25, 25], [18, 30], [21.5, 45]], // 2 h
  tresactif: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]], // 8 h
  marathon: [[0, 714], [12, 714]], // 23 h 48 sur 24 : l'enveloppe du serveur
};

function remplacer(src, avant, apres) {
  const i = src.indexOf(avant); if (i < 0) throw new Error('proto : ancre introuvable dans src/hantee.js : ' + avant.slice(0, 80));
  return src.slice(0, i) + apres + src.slice(i + avant.length);
}
function texte(o) {
  const paliers = (o && o.paliers) || PALIERS, profils = (o && o.profils) || PROFILS;
  let src = fs.readFileSync(path.join(RACINE, 'src', 'hantee.js'), 'utf8');
  src = remplacer(src, 'const DEBUT = parisMs(2026, 10, 27, 12), FIN = parisMs(2026, 11, 2, 20), JOUR = 864e5, JOURS = 7;',
    'const DEBUT = parisMs(2026, 11, 13, 12), FIN = parisMs(2026, 11, 20, 20), JOUR = 864e5, JOURS = 8;');
  src = remplacer(src, 'parisMs(2026, 10, 26 + p.jour, 0)', 'parisMs(2026, 11, 12 + p.jour, 0)');
  src = remplacer(src, "ACT.equiper({ id: 'hantee',", "ACT.equiper({ id: 'marche',");
  // les seuils et les jours des vingt paliers (les récompenses restent celles du Manoir : sans effet sur le rythme)
  const debut = src.indexOf('  const PALIERS = ['), fin = src.indexOf('  const ANCIENS');
  let bloc = src.slice(debut, fin), k = 0;
  bloc = bloc.replace(/total: [\d.e+]+, jour: \d+/g, () => { const [t, j] = paliers[k++]; return `total: ${t}, jour: ${j}`; });
  if (k !== 20) throw new Error('proto : 20 paliers attendus, ' + k + ' trouvés');
  src = src.slice(0, debut) + bloc + src.slice(fin);
  // les profils
  const d2 = src.indexOf('  const PROFILS = {'), f2 = src.indexOf('  };', d2) + 4;
  src = src.slice(0, d2) + '  const PROFILS = {\n' + Object.entries(profils).map(([n, s]) => `    ${n}: { sessions: ${JSON.stringify(s)} },`).join('\n') + '\n  };' + src.slice(f2);
  return src;
}
function charger(o) {
  const fichier = path.join(RACINE, 'src', '__marche-proto.js'); // (jamais écrit : seulement le nom, pour que require('./activites.js') se résolve)
  const m = new Module(fichier, null); m.filename = fichier; m.paths = Module._nodeModulePaths(path.dirname(fichier));
  m._compile(texte(o), fichier);
  return m.exports;
}
module.exports = { charger, texte, PALIERS, PROFILS };
if (require.main === module) {
  const M = charger();
  console.log('fenêtre :', new Date(M.DEBUT).toISOString(), '→', new Date(M.FIN).toISOString(), `(${(M.FIN - M.DEBUT) / 3600e3} h, ${M.JOURS} jours de Paris)`);
  console.log('ouvertures des paliers :', M.PALIERS.map((p) => `${p.n}:${new Date(M.ouverturePalier(p)).toISOString().slice(5, 16)}`).join(' '));
}
