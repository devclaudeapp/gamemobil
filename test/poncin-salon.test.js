#!/usr/bin/env node
// Opération Poncin — les réglages du salon (PREGLES.normaliserReglages, equipementDe ; conception du lot Gameplay, § 6) : défauts,
// bornes, valeurs inconnues, robots ≤ 6 − humains, au moins une principale et une secondaire autorisées ; l'arsenal (les neuf vraies
// armes de la livraison 2, leurs champs, classes et viseurs) et l'équipement des robots. Sortie « ok / FAIL ».
'use strict';
const R = require('../src-poncin/regles.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const N = R.normaliserReglages, D = R.DEFAUT_REGLAGES;

titre('Les tables');
check(R.ARMES.length === 9 && R.ARMES_ID.join() === 'ak74,m4,ump,mp9,pompe,m24,awm,m1911,p226' && R.ARMES.every((a, i) => a.id === R.ARMES_ID[i]), 'ARMES : les 9 vraies armes dans l\'ordre du réseau (ARMES_ID, reparti à zéro avec la VERSION 2)');
const champs = ['id', 'nom', 'classe', 'role', 'modele', 'degats', 'plombs', 'cadence', 'semiAuto', 'chargeur', 'reserve', 'recharge', 'dispersion', 'dispersionMouvement', 'portee', 'chute', 'tete', 'recul', 'vitesse', 'changement', 'gonfle', 'visee'];
check(R.ARMES.every((a) => champs.every((k) => k in a) && a.modele === a.id && R.CLASSES[a.classe] && ['lunette', 'point', 'fer'].indexOf(a.visee.viseur) >= 0 && ['zoom', 'dispersion', 'vitesse', 'entree', 'oeil'].every((k) => k in a.visee)), 'chaque arme a tous ses champs (classe, role, modele = id, semiAuto, vitesse, changement, gonfle, visee { viseur, zoom, dispersion, vitesse, entree, oeil }…)');
const classes = R.ARMES.map((a) => a.id + ':' + a.classe).join();
check(classes === 'ak74:fusil,m4:fusil,ump:mitraillette,mp9:mitraillette,pompe:pompe,m24:sniper,awm:sniper,m1911:pistolet,p226:pistolet' && R.ARMES.filter((a) => a.role === 'secondaire').map((a) => a.id).join() === 'm1911,p226', 'classes : fusils AK-74 et M4, mitraillettes UMP et MP9, pompe, fusils de précision M24 et AWM ; secondaires : les pistolets M1911 et P226');
check(R.ARMES.every((a) => (a.classe === 'sniper' ? a.visee.viseur === 'lunette' && a.visee.zoom >= 3.5 && a.visee.zoom <= 4.5 : a.classe === 'fusil' || a.classe === 'mitraillette' ? a.visee.viseur === 'point' && Math.abs(a.visee.zoom - 1.5) <= 0.11 : a.visee.viseur === 'fer' && Math.abs(a.visee.zoom - 1.25) <= 0.05)), 'viseurs : lunette ~4× (M24, AWM), point ~1,5× (fusils, mitraillettes), fer ~1,25× (pompe, pistolets)');
check(R.ARMES.every((a) => a.role === 'secondaire' ? a.semiAuto : true) && R.ARMES.every((a) => a.nom && typeof a.nom === 'string') && Object.keys(R.CLASSES).join() === 'fusil,mitraillette,pompe,sniper,pistolet', 'pistolets semi-automatiques ; un nom et une classe (PREGLES.CLASSES : libellés) pour chacune');
check(R.arme('constructor') === R.ARMES[0] && R.arme('inconnue').id === 'ak74' && R.arme('rafale').id === 'ak74', 'PREGLES.arme : un id inconnu (dont les anciens blasters) rend l\'AK-74');
const P = R.JOUEUR.postures;
check(P.debout.oeil === 1.6 && P.accroupi.vitesse === 2.6 && P.couche.oeil === 0.42 && R.JOUEUR.course === 7 && R.JOUEUR.oeil === 1.6 && R.JOUEUR.oeilAccroupi === 1.0 && R.JOUEUR.tailleAccroupi === 1.2 && R.JOUEUR.vitesseAccroupi === 2.4, 'JOUEUR v2 (postures, course 7,0) ; les anciens champs restent lisibles');
check(R.OBJETS.munitions.type === 'munitions' && R.OBJETS.munitions.retour === 15 && R.OBJETS.pompe.arme === 'pompe' && R.OBJETS.awm.type === 'arme' && R.ARMES.every((a) => (R.OBJETS[a.id] ? 1 : 0) === (a.role === 'principale' ? 1 : 0)) && R.OBJETS.precision.alias && R.OBJETS.precision.arme === 'm24', 'OBJETS v2 : caisse de munitions (15 s), une arme réelle par principale ; \'precision\' (vieilles cartes) = un fusil de précision');
check(R.SALON.max === 6 && R.SALON.zones.join() === 'place,centre,eglise,bourg,rivieres,tout' && R.SALON.reapparitions.aucune === -1 && R.SALON.manches.join() === '1,3,5', 'SALON : 6 joueurs, zones, réapparitions, manches 1 / 3 / 5');

titre('normaliserReglages');
{
  const d = N();
  check(JSON.stringify(d) === JSON.stringify(Object.assign({}, D, { armes: D.armes.slice() })) && d.v === 2 && d.manches === 3, 'sans rien : les défauts (v: 2, centre, 180 s, 25, jour, clair, 4 robots, manches 3)');
  const r = { zone: 'lune', duree: 42, score: '50', heure: 'midi', meteo: 'pluie', equipes: 'oui', bots: 9, niveau: 'expert', tirAllie: 1, vie: 'unCoup', reapparition: 'aucune', manches: 5, objets: false, aide: false, armes: ['splash', 'awm', 'awm', 'pistolet', 'rafale'], mode: '__proto__' };
  const gel = JSON.stringify(r), n = N(r, { humains: 2 });
  check(JSON.stringify(r) === gel, 'l\'entrée n\'est jamais modifiée (copie)');
  check(n.zone === 'centre' && n.duree === 180 && n.score === 50 && n.heure === 'jour' && n.meteo === 'pluie' && n.equipes === false && n.niveau === 'normal' && n.tirAllie === false && n.mode === 'arene', 'valeurs inconnues → défaut ; « 50 » en texte accepté ; booléens stricts');
  check(n.bots === 4 && N({ bots: 9 }, { humains: 5 }).bots === 1 && N({ bots: 3 }, { humains: 6 }).bots === 0 && N({ bots: -2 }).bots === 0 && N({ bots: 'x' }).bots === 4 && N({ bots: 2.6 }).bots === 3, 'robots ≤ 6 − humains (9 → 4 à deux, 1 à cinq, 0 à six), jamais négatifs');
  check(n.vie === 'unCoup' && n.reapparition === 'aucune' && n.manches === 5 && n.objets === false && n.aide === false && N({ manches: 2 }).manches === 3, 'vie, réapparition « aucune », manches (1 / 3 / 5), objets, aide');
  check(n.armes.join() === 'awm,p226', `armes : connues, sans doublon, + une secondaire ajoutée (${n.armes.join(', ')})`);
  check(N({ armes: ['m1911'] }).armes.join() === 'ak74,m1911' && N({ armes: [] }).armes.join() === 'ak74,p226' && N({ armes: 'ak74' }).armes.join() === D.armes.join() && D.armes.join() === R.ARMES_ID.join(), 'au moins une principale et une secondaire ; une liste qui n\'en est pas une → défaut (les 9)');
  check(N({ duree: 0 }).duree === 0 && N({ duree: 600 }).duree === 600 && N({ score: 10 }).score === 10, 'durée 0 (sans limite) et 600 s, score 10');
  check(JSON.stringify({ k: 1, enJeu: false, pings: {}, voies: {}, r: N(r, { humains: 6 }) }).length < 450, 'un message « reglages » tient sous 450 octets');
}

titre('equipementDe');
{
  const E = R.equipementDe;
  check(JSON.stringify(E()) === JSON.stringify(R.DEFAUT_EQUIP) && R.DEFAUT_EQUIP.p === 'ak74' && R.DEFAUT_EQUIP.s === 'p226' && E({ p: 'm4', s: 'm1911' }).p === 'm4' && E('pompe+m1911').s === 'm1911', 'défaut AK-74 + P226 ; demande { p, s } ou « p+s »');
  check(E({ p: 'p226', s: 'ak74' }).p === 'ak74' && E({ p: 'p226', s: 'ak74' }).s === 'p226', 'une arme dans le mauvais emplacement → l\'arme permise de l\'emplacement');
  const reg = N({ armes: ['ump', 'm24', 'm1911'] });
  check(E({ p: 'ak74', s: 'p226' }, reg).p === 'ump' && E({ p: 'ak74', s: 'p226' }, reg).s === 'm1911' && E({ p: 'm24' }, reg).p === 'm24', 'une arme non autorisée → la première autorisée de l\'emplacement (dans l\'ordre du réseau)');
  check(E({ p: 'rafale', s: 'petoire' }).p === 'ak74' && E({ p: 'rafale', s: 'petoire' }).s === 'p226', 'les anciens blasters (rafale, pétoire) → l\'équipement par défaut');
}

titre('equipementRobot');
{
  const rnd = R.mulberry32(7), vus = {}, reg = N({ armes: ['m4', 'mp9', 'awm', 'm1911', 'p226'] });
  let horsListe = 0;
  for (let i = 0; i < 2000; i++) { const q = R.equipementRobot(rnd, reg, 'normal'); vus[q.p] = (vus[q.p] || 0) + 1; vus[q.s] = (vus[q.s] || 0) + 1; if (reg.armes.indexOf(q.p) < 0 || reg.armes.indexOf(q.s) < 0 || R.arme(q.p).role !== 'principale' || R.arme(q.s).role !== 'secondaire') horsListe++; }
  check(horsListe === 0 && vus.m4 > vus.mp9 && vus.mp9 > vus.awm && vus.awm > 0 && vus.m1911 > 600 && vus.p226 > 600, `parmi les armes permises seulement, pondérées par classe (M4 ${vus.m4}, MP9 ${vus.mp9}, AWM ${vus.awm} ; M1911 ${vus.m1911}, P226 ${vus.p226})`);
  const a = R.equipementRobot(R.mulberry32(3), null, 'fort'), b = R.equipementRobot(R.mulberry32(3), null, 'fort');
  let snN = 0, snF = 0; const r1 = R.mulberry32(9), r2 = R.mulberry32(9);
  for (let i = 0; i < 2000; i++) { if (R.arme(R.equipementRobot(r1, null, 'normal').p).classe === 'sniper') snN++; if (R.arme(R.equipementRobot(r2, null, 'fort').p).classe === 'sniper') snF++; }
  check(a.p === b.p && a.s === b.s && snF > snN * 1.5, `rejouable (même hasard, même équipement) ; les « fort » prennent plus souvent un fusil de précision (${snF} contre ${snN} sur 2000)`);
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
