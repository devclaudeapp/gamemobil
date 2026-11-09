#!/usr/bin/env node
// La saison d'hiver (point 7, docs/noel-contrat.md § 3) : un PROTOTYPE du moteur des saisons, pour les simulations de conception. Rien ici
// n'est le jeu. C'est src/saison.js lu tel quel sur le disque, avec les DEUX changements que le contrat demande au constructeur A (§ 3.2) :
//   1. jusqu'à 50 crans (au lieu de 30) : le masque des crans reçus se lit et s'écrit en arithmétique (2 ** (n − 1)), et non plus avec les
//      opérateurs de bits de 32 bits ; un masque d'automne (< 2 ** 22) se lit à l'identique ;
//   2. les « lecteurs » d'une fiche (fiche.lecteurs : { source: (st) => un compteur qui ne fait que monter }) : une source d'XP de plus,
//      comptée par constat comme les paliers (le marqueur dans st.piste.ev[source]) ; la saison d'hiver s'en sert pour le calendrier de
//      l'Avent (avent : 10 XP par case ouverte ; la règle des cases borne déjà à deux par jour).
// Et la fiche d'automne (src/saison-automne.js, telle quelle) posée sur ce moteur, pour jouer l'enchaînement du 1er décembre.
// Usage : const P = require('./saison-proto.js').charger(); P.SAISONS, P.AUTOMNE ; P.SAISONS.ajouter(ficheHiver)
'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');
const RACINE = path.join(__dirname, '..', '..');
function remplacer(src, avant, apres) {
  const n = src.split(avant).length - 1; if (n !== 1) throw new Error(`saison-proto : ancre trouvée ${n} fois dans src/saison.js : ${avant.slice(0, 90)}`);
  return src.replace(avant, () => apres);
}
function texte() {
  let s = fs.readFileSync(path.join(RACINE, 'src', 'saison.js'), 'utf8');
  // 1. jusqu'à 50 crans
  s = remplacer(s, "if (f.crans.length > 30) throw new Error('SAISONS.ajouter : 30 crans au plus (le masque des reçus)');", "if (f.crans.length > 50) throw new Error('SAISONS.ajouter : 50 crans au plus (le masque des reçus)');");
  s = remplacer(s, 'crans: entier(x.crans) ? Math.min(x.crans, 30) : 0', 'crans: entier(x.crans) ? Math.min(x.crans, 50) : 0');
  s = remplacer(s, 'if (!(entier(p.recus) && p.recus <= 0x7fffffff)) p.recus = 0;', 'if (!(entier(p.recus) && p.recus < 2 ** 50)) p.recus = 0;');
  s = remplacer(s, 'const recu = (p, n) => n >= 1 && n <= 30 && (p.recus & (1 << (n - 1))) !== 0;', 'const recu = (p, n) => n >= 1 && n <= 50 && Math.floor(p.recus / 2 ** (n - 1)) % 2 === 1;');
  s = remplacer(s, 'p.recus |= 1 << (n - 1); return lotDe(F, n);', 'p.recus += 2 ** (n - 1); return lotDe(F, n);');
  s = remplacer(s, 'maxCrans: 30 })', 'maxCrans: 50 })');
  // 2. les lecteurs d'une fiche
  s = remplacer(s, 'const ev = {}; for (const cle of (F ? F.evenements : [])) ev[cle] = paliersDe(st, cle);',
    'const ev = {}; for (const cle of (F ? F.evenements : [])) ev[cle] = paliersDe(st, cle); for (const [cle, f] of Object.entries((F && F.lecteurs) || {})) ev[cle] = lireCompteur(f, st);');
  s = remplacer(s, '  function paliersDe(st, cle) {', '  function lireCompteur(f, st) { let n = 0; try { n = f(st); } catch (e) { n = 0; } return entier(n) ? n : 0; }\n  function paliersDe(st, cle) {');
  s = remplacer(s, 'for (const cle of F.evenements) n.ev[cle] = 0;', 'for (const cle of F.evenements) n.ev[cle] = 0; for (const cle of Object.keys(F.lecteurs || {})) n.ev[cle] = 0;');
  s = remplacer(s, '    // l\'arrière-salle\n', "    for (const cle of Object.keys(F.lecteurs || {})) { const n = c.ev[cle] || 0, avant = entier(p.ev[cle]) ? p.ev[cle] : 0; if (n > avant) crediter(cle, n - avant); p.ev[cle] = Math.max(avant, n); }\n    // l'arrière-salle\n");
  return s;
}
function compiler(src, fichier, S) {
  const m = new Module(fichier, null); m.filename = fichier; m.paths = Module._nodeModulePaths(path.dirname(fichier)); m.__S = S;
  m._compile(src, fichier); return m.exports;
}
function charger() {
  const SAISONS = compiler(texte(), path.join(RACINE, 'src', '__saison-proto.js'));
  const auto = fs.readFileSync(path.join(RACINE, 'src', 'saison-automne.js'), 'utf8').replace("factory(require('./saison.js'))", 'factory(module.__S)');
  const AUTOMNE = compiler(auto, path.join(RACINE, 'src', '__saison-automne-proto.js'), SAISONS);
  return { SAISONS, AUTOMNE };
}
module.exports = { charger, texte };
if (require.main === module) {
  const { SAISONS, AUTOMNE } = charger();
  const F = SAISONS.ajouter({ id: 'essai-hiver', nom: 'essai', debut: SAISONS.parisMs(2026, 12, 1, 0), fin: SAISONS.parisMs(2027, 1, 4, 0), crans: Array.from({ length: 48 }, () => ({ etoiles: 1 })), xpCran: 45,
    sources: Object.assign({}, SAISONS.SOURCES, { avent: { xp: 10, nom: 'Calendrier de l’Avent' } }), lecteurs: { avent: (st) => (st.avent ? st.avent.n : 0) }, evenements: ['noel'] });
  const st = { avent: { n: 0 } }, t = SAISONS.parisMs(2026, 12, 2, 9);
  SAISONS.pas(st, t); st.avent.n = 2; const o = SAISONS.pas(st, t + 1000); st.piste.xp = 48 * 45; const l = SAISONS.toutRecevoir(st);
  console.log(AUTOMNE.id, F.crans.length, JSON.stringify(o.sources), l.length, SAISONS.aRecevoir(st).length, st.piste.recus === 2 ** 48 - 1);
}
