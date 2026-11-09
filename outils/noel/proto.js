#!/usr/bin/env node
// Le Marché de Noël (point 7, docs/noel-contrat.md § 4) : un PROTOTYPE des règles, pour les simulations de conception. Rien ici n'est le
// jeu : src/noel.js n'existe pas encore. Le prototype est le moteur du Marché d'automne (src/marche.js, lu tel quel sur le disque : le même
// moteur que la Maison hantée, ses recettes, ses Astuces, ses paliers et ses activités aux MÊMES chiffres) avec ce que le contrat change et
// qui touche au rythme ou à l'enveloppe du serveur :
//   · la fenêtre : du vendredi 18 décembre 2026 à midi au vendredi 25 décembre 2026 à 20 h, heure de Paris (176 h, 8 jours de Paris) ;
//   · les ouvertures des paliers : le 18 dès midi, puis chaque jour à minuit (le 17 + jour) ;
//   · l'identifiant des activités ('noel') et la graine du marché (« |noel|manoir ») : les tirages en dépendent.
// Les seuils des vingt paliers et leurs jours restent ceux du Marché d'automne (réglés par outils/marche/rythme.js : la même fenêtre de
// 176 h, le même moteur ; outils/noel/rythme.js le vérifie).
// Usage : const N = require('./proto.js').charger(); N.simuler('quotidien', 8, { graine: 3 })
'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');
const RACINE = path.join(__dirname, '..', '..');
function remplacer(src, avant, apres, fois) {
  const n = src.split(avant).length - 1; if (n !== (fois || 1)) throw new Error(`proto : ancre trouvée ${n} fois (${fois || 1} attendue) dans src/marche.js : ${avant.slice(0, 80)}`);
  return src.split(avant).join(apres);
}
function texte() {
  let src = fs.readFileSync(path.join(RACINE, 'src', 'marche.js'), 'utf8');
  src = remplacer(src, 'const DEBUT = parisMs(2026, 11, 13, 12), FIN = parisMs(2026, 11, 20, 20), JOUR = 864e5, JOURS = 8;', 'const DEBUT = parisMs(2026, 12, 18, 12), FIN = parisMs(2026, 12, 25, 20), JOUR = 864e5, JOURS = 8;');
  src = remplacer(src, 'parisMs(2026, 11, 12 + p.jour, 0)', 'parisMs(2026, 12, 17 + p.jour, 0)');
  src = remplacer(src, '|marche|manoir`', '|noel|manoir`', 2);
  src = remplacer(src, "ACT.equiper({ id: 'marche',", "ACT.equiper({ id: 'noel',");
  return src;
}
function charger() {
  const fichier = path.join(RACINE, 'src', '__noel-proto.js'); // (jamais écrit : seulement le nom, pour que require('./activites.js') se résolve)
  const m = new Module(fichier, null); m.filename = fichier; m.paths = Module._nodeModulePaths(path.dirname(fichier));
  m._compile(texte(), fichier);
  return m.exports;
}
module.exports = { charger, texte };
if (require.main === module) {
  const N = charger();
  console.log('fenêtre :', new Date(N.DEBUT).toISOString(), '→', new Date(N.FIN).toISOString(), `(${(N.FIN - N.DEBUT) / 3600e3} h, ${N.JOURS} jours de Paris)`);
  console.log('ouvertures des paliers :', N.PALIERS.map((p) => `${p.n}:${new Date(N.ouverturePalier ? N.ouverturePalier(p) : 0).toISOString().slice(5, 16)}`).join(' '));
  console.log('fenetre(24 déc. 23 h) :', JSON.stringify(N.fenetre(N.parisMs(2026, 12, 24, 23))));
}
