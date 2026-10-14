#!/usr/bin/env node
// Opération Poncin — les réglages du salon (PREGLES.normaliserReglages, equipementDe ; conception du lot Gameplay, § 6) : défauts,
// bornes, valeurs inconnues, robots ≤ 6 − humains, au moins une principale et une secondaire autorisées ; l'arsenal (les neuf vraies
// armes de la livraison 2, leurs champs, classes et viseurs) et l'équipement des robots ; puis des parties simulées (PJEU + PARENE) où
// les réglages s'appliquent : durée (0 = sans limite), score, vie, réapparition, « dernier debout » en manches, tir allié, aide, objets,
// zone, robots listés, heure et météo (visibilité, lampes). Sortie « ok / FAIL ».
'use strict';
const R = require('../src-poncin/regles.js'), PZ = require('../src-poncin/zones.js'), PM = require('../src-poncin/monde.js'), PJ = require('../src-poncin/jeu.js'), PA = require('../src-poncin/arene.js'), PC2 = require('../src-poncin/corps.js');
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

// ─── des parties simulées ───
const DT = 1 / 60;
function cartePlate(rayon) {
  const n = 41, h = new Array(n * n).fill(0);
  return {
    v: 1, nom: 'Plat', source: 'test', taille: 400, relief: { pas: 10, n, h },
    batiments: [{ p: [[40, -10], [50, -10], [50, 10], [40, 10]], h: 8, t: 'maison' }, { p: [[-30, 20], [-20, 20], [-20, 30], [-30, 30]], h: 6, t: 'maison' }],
    rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [{ n: 'Église Saint-Martin', x: 20, z: -40 }], sol: null,
    zones: { arene: { centre: [0, 0], rayon: rayon || 90 }, apparitions: [[-40, -40], [40, -40], [-40, 40], [40, 40], [0, 60], [0, -60], [60, 0], [-60, 0], [25, 25], [-25, -25], [25, -25], [-25, 45]],
      armes: [{ x: 15, z: 15, arme: 'soin' }, { x: -15, z: 15, arme: 'armure' }, { x: 15, z: -15, arme: 'pompe' }, { x: -15, z: -15, arme: 'precision' }], extraction: [], base: [0, 0] },
  };
}
const cartePl = cartePlate(), mondePl = PM.creer(cartePl);
const creer = (options, plus) => PJ.creer(Object.assign({ monde: mondePl, carte: cartePl, mode: PA, graine: 7, options }, plus || {}));
function poser(jeu, e, x, z, yaw) { e.x = x; e.z = z; e.y = jeu.monde.hauteur(x, z); e.vx = e.vz = e.vy = 0; e.auSol = true; if (yaw != null) e.yaw = yaw; e.pitch = 0; e.gonfle = 0; e.prochainTir = 0; e.invincible = 0; PC2.changerPosture(e, 'debout', 0); e.accroupi = false; }
function viserSur(e, c) { const dx = c.x - e.x, dz = c.z - e.z, dy = c.y + 1.1 - (e.y + e.oeil); e.yaw = Math.atan2(-dx, -dz); e.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
const TIR = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: true, saut: false, accroupi: false, couche: false, course: false, vise: true, recharge: false, arme: null, changer: false };
const f1 = (v) => (Math.round(v * 10) / 10).toString();

titre('Partie simulée : les options SONT les réglages normalisés');
{
  const j = creer({ bots: 9, zone: 'lune', duree: 42, vie: 'costaud', heure: 'nuit', meteo: 'brouillard', objets: false, aide: false });
  check(j.reglages === j.options && j.reglages.v === 2 && j.reglages.zone === 'centre' && j.reglages.duree === 180 && j.reglages.bots === 6 && j.entites.length === 6, `jeu.reglages === jeu.options, normalisés (zone inconnue → centre, durée 42 → 180, 9 robots → ${j.entites.length} : 6 joueurs au plus)`);
  const j2 = creer({ bots: 6 }, { humains: 2 });
  check(j2.reglages.bots === 4 && j2.entites.length === 4, 'robots ≤ 6 − humains (params.humains : 2 → 4 robots)');
  check(j.vieMax === 200 && j.armureMax === 100 && j.entites.every((e) => e.vie === 200) && j.visibilite === 25 && j.visibiliteLampe === 30 && j.lampes && j.entites.every((e) => e.lampe && (PJ.ligneDe(e, 0, 0)[8] & 1024)), 'vie costaud (200 / 100) ; nuit + brouillard : visibilité 25 m, lampe 30 m ; lampes allumées (drapeau 1024)');
  const v = (h, m) => { const x = creer({ bots: 0, heure: h, meteo: m }); return [x.visibilite, x.visibiliteLampe, x.lampes]; };
  check(JSON.stringify(v('jour', 'clair')) === JSON.stringify([null, 0, false]) && v('jour', 'clair')[0] === Infinity && v('nuit', 'clair').join() === '25,45,true' && v('jour', 'brouillard').join() === '30,0,false' && v('soir', 'pluie')[0] === Infinity,
    'visibilité des robots : jour sans limite, nuit 25 m (lampe 45 m), brouillard 30 m, soir et pluie sans limite');
  const h = j.ajouterJoueur({ id: 'h', humain: true }), b = j.entites[0]; poser(j, h, 0, 0, 0); poser(j, b, 0, -10); viserSur(h, b);
  const a = j.aideVisee('h', 1);
  check(a.permise === false && a.dyaw === 0 && a.dpitch === 0 && a.ralentir === 0 && a.surCible === true, 'aide coupée par l\'hôte : ni ralenti ni aimant (permise: false), le viseur rouge reste (surCible)');
  check(PA.objets(j).length === 0, 'objets: false : rien au sol');
}

titre('Partie simulée : durée et score');
{
  const j = creer({ bots: 0, duree: 300 }); j.ajouterJoueur({ id: 'a', humain: true }); j.ajouterJoueur({ id: 'b', humain: true });
  check(j.duree === 300 && j.reste === 300, 'durée 300 s : jeu.duree, jeu.reste');
  const j0 = creer({ bots: 0, duree: 0 }); j0.ajouterJoueur({ id: 'a', humain: true }); j0.ajouterJoueur({ id: 'b', humain: true });
  for (let i = 0; i < 200 * 20; i++) j0.etape(1 / 20, {});
  check(j0.duree === 0 && j0.reste === undefined && !j0.fini && j0.instantane().r === -1, `durée 0 : sans limite (reste undefined, pas finie après ${Math.round(j0.temps)} s, r = −1 dans l'instantané)`);
  const j1 = creer({ bots: 0, score: 10 }); const a = j1.ajouterJoueur({ id: 'a', humain: true }), b = j1.ajouterJoueur({ id: 'b', humain: true });
  a.score.kills = 9; j1.etape(DT, {}); const pasFini = !j1.fini; a.score.kills = 10; j1.etape(DT, {});
  check(pasFini && j1.fini && j1.arene.victoire === 10 && PA.resultat(j1).gagnant === 'a', 'score 10 : la partie finit au 10e repeint (pas au 9e)');
  const ev = []; const j2 = creer({ bots: 0, duree: 180 }); j2.ajouterJoueur({ id: 'a', humain: true }); j2.ajouterJoueur({ id: 'b', humain: true });
  for (let i = 0; i < 181 * 20 && !j2.fini; i++) for (const v of j2.etape(1 / 20, {})) ev.push(v);
  check(j2.fini && Math.abs(j2.temps - 180) < 0.06 && ev.some((v) => v.t === 'annonce' && /minute/.test(v.texte)), `180 s : finie à ${f1(j2.temps)} s, annonces du chrono`);
}

titre('Partie simulée : vie et objets');
{
  const j = creer({ bots: 0, vie: 'unCoup' }); const a = j.ajouterJoueur({ id: 'a', humain: true }), b = j.ajouterJoueur({ id: 'b', humain: true });
  const objs = PA.objets(j).map((o) => o.objet);
  poser(j, a, 0, 30, 0); poser(j, b, 0, 10); viserSur(a, b); a.vise = 1; a.viseStable = 1; let mort = false;
  for (let i = 0; i < 30 && !mort; i++) { viserSur(a, b); for (const v of j.etape(DT, { a: TIR })) if (v.t === 'mort' && v.a === 'b') mort = true; }
  check(j.vieMax === 1 && j.armureMax === 0 && a.vie === 1 && mort && objs.indexOf('soin') < 0 && objs.indexOf('armure') < 0 && objs.length > 0, `« un coup » : vie 1, armure 0, une balle repeint ; ni soin ni armure au sol (${objs.join(', ')})`);
  const jc = creer({ bots: 0, vie: 'costaud' }); const c = jc.ajouterJoueur({ id: 'c', humain: true }); c.vie = 120;
  const soin = PA.objets(jc).find((o) => o.objet === 'soin'); poser(jc, c, soin.x, soin.z); jc.etape(DT, {});
  check(jc.vieMax === 200 && c.vie > 120 && c.vie <= 200 && !soin.dispo, `« costaud » : vie 200 ; un soin se prend sous 200 (${c.vie})`);
}

titre('Partie simulée : réapparition');
for (const [nom, s] of [['rapide', 3], ['normale', 6], ['lente', 10]]) {
  const j = creer({ bots: 0, reapparition: nom }); const a = j.ajouterJoueur({ id: 'a', humain: true }), b = j.ajouterJoueur({ id: 'b', humain: true });
  b.invincible = 0; const out = []; j.blesser(b, a, 500, false, 'ak74', out); const t0 = j.temps; let t = -1;
  for (let i = 0; i < 12 * 60 && t < 0; i++) if (j.etape(DT, {}).some((v) => v.t === 'reapparition' && v.id === 'b')) t = j.temps - t0;
  check(Math.abs(t - s) < 2 * DT, `réapparition ${nom} : au bout de ${f1(t)} s (${s} s)`);
}

titre('Partie simulée : tir allié (2 contre 2)');
{
  for (const tirAllie of [false, true]) {
    const j = creer({ bots: 0, equipes: true, tirAllie }); const a = j.ajouterJoueur({ id: 'a', humain: true, equipe: 0 }), b = j.ajouterJoueur({ id: 'b', humain: true, equipe: 0 }), c = j.ajouterJoueur({ id: 'c', humain: true, equipe: 1 });
    poser(j, a, 0, 30, 0); poser(j, b, 0, 15); poser(j, c, 0, -20); a.vise = 1; a.viseStable = 1; const evs = [];
    for (let i = 0; i < 60; i++) { viserSur(a, b); for (const v of j.etape(DT, { a: TIR })) evs.push(v); }
    const touches = evs.filter((v) => v.t === 'touche' && v.a === 'b').length;
    if (!tirAllie) check(touches === 0 && b.vie === 100 && j.peutBlesser(a, c) && !j.peutBlesser(a, b) && !j.peutBlesser(a, a), 'sans tir allié : un équipier dans la ligne n\'est pas touché (les balles le traversent) ; peutBlesser(a, b) faux');
    else {
      const mort = evs.find((v) => v.t === 'mort' && v.a === 'b');
      check(touches > 0 && mort && mort.allie === true && a.score.kills === 0 && a.score.points === -100 && j.peutBlesser(a, b), `tir allié : l'équipier est touché ; repeint, il coûte 100 points sans compter de repeint (points ${a.score.points}, repeints ${a.score.kills})`);
    }
  }
}

titre('Partie simulée : zone et robots listés');
{
  const j = creer({ bots: 3, zone: 'eglise' });
  check(j.zone && j.zone.id === 'eglise' && mondePl.limite === j.zone.limite && j.arene.apparitions.length >= 12 && j.entites.every((e) => j.zone.limite.dedans(e.x, e.z)) && j.arene.distance === Math.max(15, Math.min(60, 0.32 * 70)) && PA.objets(j).every((o) => j.zone.limite.dedans(o.x, o.z)),
    `zone « eglise » : jeu.zone (${j.zone.apparitions.length} apparitions, ${j.zone.objets.length} objets), monde.limite, robots placés dedans, distance de réapparition ${f1(j.arene.distance)} m`);
  const ja = creer({ bots: 3, zone: 'eglise' }), jb = creer({ bots: 3, zone: 'eglise' }, { graine: 8 });
  check(JSON.stringify(ja.zone.apparitions) === JSON.stringify(j.zone.apparitions) && JSON.stringify(jb.zone.apparitions) !== JSON.stringify(j.zone.apparitions) && ja.rnd() === j.rnd(), 'la zone vient de la graine, par son propre hasard (jeu.rnd reste le même)');
  const net = { id: j.zone.id, limite: j.zone.limite.def, apparitions: j.zone.apparitions, objets: j.zone.objets };
  const jf = creer({ bots: 3, zone: 'centre' }, { zone: JSON.parse(JSON.stringify(net)), robots: j.arene.robots, nav: false });
  check(jf.zone.id === 'eglise' && jf.entites.map((e) => e.id + e.nom + e.equip.p + e.equip.s + e.niveau).join() === j.entites.map((e) => e.id + e.nom + e.equip.p + e.equip.s + e.niveau).join() && PA.objets(jf).map((o) => o.objet).join() === PA.objets(j).map((o) => o.objet).join(),
    `une zone reçue (params.zone, JSON) et les robots listés (params.robots : ${j.arene.robots.map((r) => r.nom).join(', ')}) : les mêmes que chez l'hôte`);
  // la façade d'un client : un monde neuf (aucune navigation en cache), la zone reçue en JSON, les robots listés, nav: false
  const h0 = creer({ bots: 2 }), cF = cartePlate(), mF = PM.creer(cF);
  const f0 = PJ.creer({ monde: mF, carte: cF, mode: PA, graine: 7, options: { bots: 2 }, zone: JSON.parse(JSON.stringify(PZ.pourReseau(h0.zone))), robots: JSON.parse(JSON.stringify(h0.arene.robots)), nav: false });
  const pos = (j) => PA.objets(j).map((o) => [o.objet, o.x.toFixed(3), o.z.toFixed(3)].join(':')).join(' ');
  check(pos(f0) === pos(h0) && PA.objets(h0).some((o) => o.objet === 'munitions') && f0.entites.map((e) => e.id + e.equip.p).join() === h0.entites.map((e) => e.id + e.equip.p).join() && !f0.nav,
    `'centre' chez un client (monde neuf, nav: false) : les mêmes objets aux mêmes places que chez l'hôte, caisses de munitions comprises (${PA.objets(h0).length})`);
  const jt = creer({ bots: 2, zone: 'tout', duree: 0 });
  let dehors = 0; for (let i = 0; i < 20 * 60; i++) { jt.etape(DT, {}); for (const e of jt.entites) if (!jt.zone.limite.dedans(e.x, e.z)) dehors++; }
  check(jt.zone.limite.forme === 'carre' && dehors === 0 && jt.erreurs === 0, 'zone « tout » (limite v2 carrée) : 20 s de robots, jamais dehors, aucune erreur');
}

titre('Partie simulée : « dernier debout » en manches');
function dernierDebout(options, graine) {
  const j = PJ.creer({ monde: mondePl, carte: cartePl, mode: PA, graine, options: Object.assign({ reapparition: 'aucune', manches: 3, niveau: 'fort', duree: 180 }, options) });
  const evs = [], enLice = [];
  for (let i = 0; i < 700 * 60 && !j.fini; i++) { for (const v of j.etape(DT, {})) evs.push(Object.assign({ temps: j.temps, manche: j.manche.n }, v)); if (j.manche.fin == null) enLice.push(j.manche.enLice.length); }
  return { j, evs, enLice };
}
{
  const { j, evs } = dernierDebout({ bots: 4 }, 11);
  const debuts = evs.filter((v) => v.t === 'manche' && v.quoi === 'debut'), fins = evs.filter((v) => v.t === 'manche' && v.quoi === 'fin');
  const reap = evs.filter((v) => v.t === 'reapparition'), elim = evs.filter((v) => v.t === 'elimine');
  // pendant une manche, personne ne réapparaît : les réapparitions tombent toutes au début d'une manche (n ≥ 2), 4 à la fois
  const reapOk = reap.every((v) => debuts.some((d) => d.manche === v.manche && Math.abs(d.temps - v.temps) <= DT + 1e-9 && v.manche >= 2)) && reap.length === 4 * (debuts.length - 1);
  const gagnees = j.manche.gagnees, total = Object.values(gagnees).reduce((s, v) => s + v, 0), res = PA.resultat(j), top = j.classement()[0];
  check(j.fini && j.manche.total === 3 && debuts.length >= 2 && debuts.length <= 3 && fins.length === debuts.length && reapOk && j.erreurs === 0,
    `4 robots, 3 manches : ${debuts.length} manches jouées (annonces de début et de fin), aucune réapparition pendant une manche (${reap.length} au début des suivantes)`);
  const decroit = elim.every((v, i) => i === 0 || v.manche !== elim[i - 1].manche || v.enLice <= elim[i - 1].enLice);
  check(elim.length >= 3 * fins.filter((f) => f.vainqueur != null).length && decroit && elim.every((v) => typeof v.enLice === 'number' && v.id), `« elimine » à chaque élimination, « Encore en lice » qui descend (${elim.map((v) => v.enLice).join(' ')})`);
  check(fins.every((f) => f.vainqueur == null || (typeof f.nom === 'string' && j.trouver(f.vainqueur))) && total === fins.filter((f) => f.vainqueur != null).length && j.entites.every((e) => (e.score.manches | 0) === (gagnees[e.id] | 0)),
    `vainqueurs de manche (${fins.map((f) => f.nom || 'nul').join(', ')}) ; score de la partie = manches gagnées`);
  const v = Object.values(gagnees).sort((a, b) => b - a);
  check(res.manches && res.manches.total === 3 && res.manches.jouees === fins.length && top.score.manches === (v[0] || 0) && (v[0] > (v[1] || 0) ? res.gagnant === top.id : res.gagnant === null) && (fins.length === 3 || v[0] - (v[1] || 0) > 3 - fins.length),
    `résultat : classement par manches gagnées (gagnant ${res.gagnant}), la partie s'arrête quand le premier est hors d'atteinte`);
  const enTreve = evs.filter((x) => x.t === 'touche' && fins.some((f) => x.temps > f.temps && x.temps < f.temps + PA.PAUSE_MANCHE && x.manche === f.n));
  check(enTreve.length === 0, 'entre deux manches (trêve de 4 s), personne n\'est touché');
}
{
  const { j, evs } = dernierDebout({ bots: 4, equipes: true, manches: 1 }, 5);
  const fin = evs.find((v) => v.t === 'manche' && v.quoi === 'fin'), res = PA.resultat(j);
  check(j.fini && fin && (fin.vainqueur === 0 || fin.vainqueur === 1 || fin.vainqueur === null) && fin.equipes && (fin.vainqueur == null || j.entites.filter((e) => e.equipe === fin.vainqueur).every((e) => e.score.manches === 1)) && res.scores && res.scores[0] + res.scores[1] === (fin.vainqueur == null ? 0 : 1),
    `2 contre 2, une manche : le dernier camp debout gagne (${fin ? fin.nom || 'nul' : '?'}), chacun de ses membres marque la manche`);
}
{
  const j = PJ.creer({ monde: mondePl, carte: cartePl, mode: PA, graine: 3, options: { bots: 0, reapparition: 'aucune', manches: 3, duree: 180 } });
  const a = j.ajouterJoueur({ id: 'a', humain: true }), b = j.ajouterJoueur({ id: 'b', humain: true }), out = [];
  j.etape(DT, {}); a.invincible = b.invincible = 0; j.blesser(b, a, 500, false, 'ak74', out);
  const tot = []; for (let i = 0; i < 4 * 60; i++) for (const v of j.etape(DT, {})) tot.push(v);
  const finAvant = tot.find((v) => v.t === 'manche' && v.quoi === 'fin');
  for (let i = 0; i < 2 * 60; i++) for (const v of j.etape(DT, {})) tot.push(v);
  const fin1 = tot.find((v) => v.t === 'manche' && v.quoi === 'fin');
  check(!finAvant && fin1 && fin1.vainqueur === 'a' && j.manche.fin != null && j.treve && out.some((v) => v.t === 'elimine' && v.enLice === 1), 'la manche ne se termine pas avant 5 s de jeu ; puis « a » la gagne (trêve)');
  for (let i = 0; i < 5 * 60; i++) j.etape(DT, {});
  check(j.manche.n === 2 && j.manche.fin == null && !j.treve && a.vivant && b.vivant && j.manche.enLice.length === 2 && Math.abs(j.reste - (180 - (j.temps - j.debutChrono))) < 1e-9 && j.reste > 170, `manche 2 : tout le monde réapparaît, le chrono repart (${f1(j.reste)} s)`);
  // au temps : le camp qui a le plus de vie gagne
  b.vie = 40; for (let i = 0; i < 181 * 20 && j.manche.n === 2 && j.manche.fin == null; i++) j.etape(1 / 20, {});
  check(j.manche.vainqueur === 'a' && a.score.manches === 2 && j.fini === false, 'au bout de la durée : la manche va à qui a le plus de vie ; 2 manches sur 3 : hors d\'atteinte');
  for (let i = 0; i < 3 * 60 && !j.fini; i++) j.etape(DT, {});
  check(j.fini && PA.resultat(j).gagnant === 'a' && PA.resultat(j).manches.jouees === 2, 'la partie s\'arrête après la 2e manche (2 à 0 sur 3)');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
