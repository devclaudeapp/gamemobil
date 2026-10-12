#!/usr/bin/env node
// Opération Poncin — les réglages du salon (PREGLES.normaliserReglages, equipementDe ; conception du lot Gameplay, § 6) : défauts,
// bornes, valeurs inconnues, robots ≤ 6 − humains, au moins une principale et une secondaire autorisées. Sortie « ok / FAIL ».
'use strict';
const R = require('../src-poncin/regles.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const N = R.normaliserReglages, D = R.DEFAUT_REGLAGES;

titre('Les tables');
check(R.ARMES.length === 7 && R.ARMES_ID.join() === 'rafale,pompe,precision,carabine,petoire,arroseuse,arrosoir,splash' && R.ARMES.every((a, i) => a.id === R.ARMES_ID[i]), 'ARMES : 7 armes dans l\'ordre du réseau (ARMES_ID, \'splash\' réservé)');
const champs = ['id', 'nom', 'role', 'modele', 'degats', 'plombs', 'cadence', 'semiAuto', 'chargeur', 'reserve', 'recharge', 'dispersion', 'dispersionMouvement', 'portee', 'chute', 'tete', 'recul', 'vitesse', 'changement', 'gonfle', 'visee'];
check(R.ARMES.every((a) => champs.every((k) => k in a) && ['aucun', 'point rouge', 'lunette'].indexOf(a.visee.viseur) >= 0 && ['zoom', 'dispersion', 'vitesse', 'entree', 'oeil'].every((k) => k in a.visee)), 'chaque arme a tous ses champs (role, modele, semiAuto, vitesse, changement, gonfle, visee { viseur, zoom, dispersion, vitesse, entree, oeil }…)');
check(R.ARMES.filter((a) => a.role === 'secondaire').map((a) => a.id).join() === 'petoire,arroseuse' && R.arme('carabine').visee.viseur === 'point rouge' && R.arme('precision').visee.viseur === 'lunette' && R.arme('carabine').semiAuto && R.arme('arrosoir').option, 'secondaires : petoire, arroseuse ; carabine au point rouge (semi-auto), Long-tir à la lunette ; arrosoir en option');
check(R.arme('constructor') === R.ARMES[0] && R.arme('inconnue').id === 'rafale', 'PREGLES.arme : un id inconnu rend le rafale');
const P = R.JOUEUR.postures;
check(P.debout.oeil === 1.6 && P.accroupi.vitesse === 2.6 && P.couche.oeil === 0.42 && R.JOUEUR.course === 7 && R.JOUEUR.oeil === 1.6 && R.JOUEUR.oeilAccroupi === 1.0 && R.JOUEUR.tailleAccroupi === 1.2 && R.JOUEUR.vitesseAccroupi === 2.4, 'JOUEUR v2 (postures, course 7,0) ; les anciens champs restent lisibles');
check(R.OBJETS.munitions.type === 'munitions' && R.OBJETS.munitions.retour === 15 && R.OBJETS.pompe.arme === 'pompe' && R.OBJETS.carabine.type === 'arme', 'OBJETS v2 : munitions (15 s), armes');
check(R.SALON.max === 6 && R.SALON.zones.join() === 'place,centre,eglise,bourg,rivieres,tout' && R.SALON.reapparitions.aucune === -1 && R.SALON.manches.join() === '1,3,5', 'SALON : 6 joueurs, zones, réapparitions, manches 1 / 3 / 5');

titre('normaliserReglages');
{
  const d = N();
  check(JSON.stringify(d) === JSON.stringify(Object.assign({}, D, { armes: D.armes.slice() })) && d.v === 2 && d.manches === 3, 'sans rien : les défauts (v: 2, centre, 180 s, 25, jour, clair, 4 robots, manches 3)');
  const r = { zone: 'lune', duree: 42, score: '50', heure: 'midi', meteo: 'pluie', equipes: 'oui', bots: 9, niveau: 'expert', tirAllie: 1, vie: 'unCoup', reapparition: 'aucune', manches: 5, objets: false, aide: false, armes: ['splash', 'precision', 'precision', 'pistolet'], mode: '__proto__' };
  const gel = JSON.stringify(r), n = N(r, { humains: 2 });
  check(JSON.stringify(r) === gel, 'l\'entrée n\'est jamais modifiée (copie)');
  check(n.zone === 'centre' && n.duree === 180 && n.score === 50 && n.heure === 'jour' && n.meteo === 'pluie' && n.equipes === false && n.niveau === 'normal' && n.tirAllie === false && n.mode === 'arene', 'valeurs inconnues → défaut ; « 50 » en texte accepté ; booléens stricts');
  check(n.bots === 4 && N({ bots: 9 }, { humains: 5 }).bots === 1 && N({ bots: 3 }, { humains: 6 }).bots === 0 && N({ bots: -2 }).bots === 0 && N({ bots: 'x' }).bots === 4 && N({ bots: 2.6 }).bots === 3, 'robots ≤ 6 − humains (9 → 4 à deux, 1 à cinq, 0 à six), jamais négatifs');
  check(n.vie === 'unCoup' && n.reapparition === 'aucune' && n.manches === 5 && n.objets === false && n.aide === false && N({ manches: 2 }).manches === 3, 'vie, réapparition « aucune », manches (1 / 3 / 5), objets, aide');
  check(n.armes.join() === 'precision,petoire', `armes : connues, sans doublon, + une secondaire ajoutée (${n.armes.join(', ')})`);
  check(N({ armes: ['arroseuse'] }).armes.join() === 'rafale,arroseuse' && N({ armes: [] }).armes.join() === 'rafale,petoire' && N({ armes: 'rafale' }).armes.join() === D.armes.join(), 'au moins une principale et une secondaire ; une liste qui n\'en est pas une → défaut');
  check(N({ duree: 0 }).duree === 0 && N({ duree: 600 }).duree === 600 && N({ score: 10 }).score === 10, 'durée 0 (sans limite) et 600 s, score 10');
  check(JSON.stringify({ k: 1, enJeu: false, pings: {}, voies: {}, r: N(r, { humains: 6 }) }).length < 450, 'un message « reglages » tient sous 450 octets');
}

titre('equipementDe');
{
  const E = R.equipementDe;
  check(JSON.stringify(E()) === JSON.stringify(R.DEFAUT_EQUIP) && E({ p: 'carabine', s: 'arroseuse' }).p === 'carabine' && E('pompe+arroseuse').s === 'arroseuse', 'défaut rafale + petoire ; demande { p, s } ou « p+s »');
  check(E({ p: 'petoire', s: 'rafale' }).p === 'rafale' && E({ p: 'petoire', s: 'rafale' }).s === 'petoire', 'une arme dans le mauvais emplacement → l\'arme permise de l\'emplacement');
  const reg = N({ armes: ['carabine', 'precision', 'arroseuse'] });
  check(E({ p: 'rafale', s: 'petoire' }, reg).p === 'precision' && E({ p: 'rafale', s: 'petoire' }, reg).s === 'arroseuse' && E({ p: 'carabine' }, reg).p === 'carabine', 'une arme non autorisée → la première autorisée de l\'emplacement (dans l\'ordre du réseau)');
  check(E({ p: 'arrosoir' }).p === 'rafale' && E({ p: 'arrosoir' }, N({ armes: ['arrosoir', 'petoire'] })).p === 'arrosoir', 'l\'arrosoir (option) seulement s\'il est autorisé');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
