#!/usr/bin/env node
// Opération Poncin — les armes (PARMES, armes.js ; chiffres de PREGLES.ARMES : les neuf vraies armes de la livraison 2). Les emplacements
// (§ 5) : équipement, secondaire jamais à sec, durées de changement, visée et dispersion v2, objets munitions et arme ; les temps pour
// éliminer (duels scriptés, visée posée : fusils 0,45–0,6 s, mitraillettes 0,35–0,5 s de près, pompe un coup jusqu'à 8 m, fusils de
// précision un coup à la tête et deux au corps, pistolets 0,8–1,1 s) ; les événements de tir pour les impacts (point, normale, matière,
// arme) ; les duels robot contre robot (chaque arme tient sa bande, les robots visent à la lunette, se posent, passent à la secondaire) ;
// le régime historique, gardé dans le module pour les vieux tests (plus aucun chemin du jeu ne le prend). Sortie « ok / FAIL ».
'use strict';
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PJ = require('../src-poncin/jeu.js'), PAR = require('../src-poncin/armes.js'), PB = require('../src-poncin/bots.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const f2 = (v) => (Math.round(v * 100) / 100).toString(), f4 = (v) => (Math.round(v * 1e4) / 1e4).toString();
const J = R.JOUEUR, DT = 1 / 60;
const NUL = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null, course: false, couche: false, vise: false };
const entree = (o) => Object.assign({}, NUL, o || {});
function cartePlate(plus) {
  const n = 41;
  return Object.assign({ v: 1, nom: 'Plat', source: 'test', taille: 400, relief: { pas: 10, n, h: new Array(n * n).fill(0) }, batiments: [], rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], sol: null,
    zones: { arene: { centre: [0, 0], rayon: 190 }, apparitions: [[0, 0]], armes: [], extraction: [], base: [0, 0] } }, plus || {});
}
const monde = PM.creer(cartePlate());
function partie(ids, equips, m) {
  const jeu = PJ.creer({ monde: m || monde, graine: 3, options: { bots: 0 }, nav: false });
  const es = ids.map((id) => jeu.ajouterJoueur({ id, nom: id, humain: true, equip: equips && equips[id] }));
  for (const e of es) e.invincible = 0;
  return { jeu, es };
}
function poser(jeu, e, x, z) { e.x = x; e.z = z; e.y = jeu.monde.hauteur(x, z); e.vx = e.vz = e.vy = 0; e.vitesse = 0; e.auSol = true; e.pitch = 0; e.gonfle = 0; e.prochainTir = 0; e.invincible = 0; e.vivant = true; e.vie = J.vie; e.armure = 0; }
// donner une arme : à son emplacement (principale ou secondaire), en main, chargeur et réserve pleins
function donner(e, arme) {
  const A = R.arme(arme);
  if (e.equip) { const s = A.role === 'secondaire' ? 1 : 0; e.armes[s] = arme; e.slot = s; } else if (e.armes.indexOf(arme) < 0) e.armes.push(arme);
  e.arme = arme; e.munitions[arme] = A.chargeur; e.reserve[arme] = A.reserve; e.enRecharge = false; e.rechargeJusqua = 0; e.prochainTir = 0;
}
function viser(e, c, h) { const dx = c.x - e.x, dz = c.z - e.z, dy = c.y + h - (e.y + e.oeil); e.yaw = Math.atan2(-dx, -dz); e.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
titre('Le jeu équipe tout le monde (régime v2)');
{
  const { jeu, es: [a, b] } = partie(['a', 'b'], { b: 'm24+m1911' });
  check(a.equip && a.equip.p === 'ak74' && a.equip.s === 'p226' && a.armes.join() === 'ak74,p226' && a.arme === 'ak74' && a.slot === 0 && a.munitions.ak74 === 30 && a.reserve.p226 === 45 && a.corpsV2,
    'ajouterJoueur sans equip : l\'équipement par défaut (AK-74 + P226), la principale en main, corps v2');
  check(b.equip.p === 'm24' && b.equip.s === 'm1911' && b.arme === 'm24', 'equip en texte « m24+m1911 »');
  const j2 = PJ.creer({ monde, graine: 3, options: { bots: 0, armes: ['ump', 'm1911'] }, nav: false }), c = j2.ajouterJoueur({ id: 'c', humain: true, equip: { p: 'ak74', s: 'p226' } });
  check(c.equip.p === 'ump' && c.equip.s === 'm1911' && j2.options.armes.join() === 'ump,m1911', 'options.armes (permises par l\'hôte) : une demande non permise devient la première arme permise de l\'emplacement');
  jeu.etape(DT, { a: { avant: 1 } }); // une entrée sans les niveaux v2 (vieux client) : jouée en v2
  check(a.corpsV2 === true && a.posture === 'debout', 'une entrée sans course / couche / vise est jouée en v2 (jamais le régime historique)');
}

titre('Emplacements : secondaire jamais à sec, changement, objets');
{
  const { jeu, es: [a] } = partie(['a'], { a: { p: 'm4', s: 'm1911' } });
  check(a.armes.join() === 'm4,m1911' && a.munitions.m4 === 30 && a.reserve.m1911 === 35, 'm4 + m1911 : deux chargeurs et deux réserves pleins');
  const T = jeu.temps; jeu.etape(DT, { a: entree({ arme: 1 }) });
  check(a.arme === 'm1911' && a.slot === 1 && Math.abs(a.prochainTir - (T + DT + 0.3)) < 1e-9 && Math.abs(a.changeJusqua - (T + DT + 0.3)) < 1e-9, 'emplacement 1 (entrée arme: 1) : le pistolet sort en 0,3 s (A.changement)');
  const T2 = jeu.temps; jeu.etape(DT, { a: entree({ changer: true }) });
  check(a.arme === 'm4' && a.slot === 0 && Math.abs(a.prochainTir - (T2 + DT + R.arme('m4').changement)) < 1e-9, `changer (front) : retour à la principale en ${R.arme('m4').changement} s`);
  jeu.etape(DT, { a: entree({ arme: 'm1911' }) });
  check(a.arme === 'm1911', 'entrée arme: id (compatibilité) : l\'arme possédée sort');
  a.munitions.m1911 = 0; a.reserve.m1911 = 0; a.prochainTir = 0;
  for (let i = 0; i < 200; i++) jeu.etape(DT, { a: entree() });
  check(a.munitions.m1911 === 7 && a.reserve.m1911 >= 7, `secondaire à sec : rechargée quand même (${a.munitions.m1911} + ${a.reserve.m1911}), plancher d'un chargeur`);
  jeu.etape(DT, { a: entree({ arme: 0 }) }); a.munitions.m4 = 0; a.reserve.m4 = 0; a.prochainTir = 0;
  for (let i = 0; i < 200; i++) jeu.etape(DT, { a: entree({ tir: true }) });
  check(a.armes.join() === 'm4,m1911' && a.munitions.m4 === 0 && !a.enRecharge, 'principale vide de tout : gardée, ni tir ni recharge (il faut une caisse de munitions)');
  PAR.prendre(a, R.OBJETS.munitions, jeu);
  check(a.reserve.m4 === 120 && a.reserve.m1911 >= 35, 'caisse de munitions : les deux réserves pleines');
  PAR.prendre(a, R.OBJETS.pompe, jeu);
  check(a.armes[0] === 'pompe' && a.armes[1] === 'm1911' && a.arme === 'pompe' && a.munitions.pompe === 6 && a.munitions.m4 === undefined && a.equip.p === 'm4', 'un fusil à pompe ramassé remplace la principale (l\'équipement choisi reste)');
  jeu.reapparaitre(a);
  check(a.armes.join() === 'm4,m1911' && a.arme === 'm4', 'à la réapparition : l\'équipement choisi, la principale en main');
  check(PAR.utile(a, R.OBJETS.munitions) === false && PAR.utile(a, R.OBJETS.awm) === true && PAR.utile(a, R.OBJETS.m4) === false, 'utile : munitions déjà pleines non, une autre arme oui, la sienne pleine non');
  const OBJ = [{ id: 'o0', x: 0, z: 0, objet: 'awm', dispo: true }];
  const j2 = PJ.creer({ monde, graine: 3, options: { bots: 0, armes: ['m4', 'p226'] }, nav: false, mode: { id: 'essai', objets: () => OBJ } });
  const c = j2.ajouterJoueur({ id: 'c', humain: true }); poser(j2, c, 0, 0); j2.etape(DT, {});
  check(OBJ[0].dispo && c.armes[0] === 'm4', 'une arme que l\'hôte n\'a pas permise ne se ramasse pas');
}

titre('Visée');
{
  const { jeu, es: [a] } = partie(['a'], { a: { p: 'm24', s: 'p226' } }), A = R.arme('m24');
  let n = 0; while (a.vise < 1 && n < 100) { jeu.etape(DT, { a: entree({ vise: true }) }); n++; }
  check(n === Math.ceil(A.visee.entree / DT - 1e-9), `mise en joue du M24 en ${n} pas (${A.visee.entree} s)`);
  const d0 = PAR.dispersion(a, A);
  for (let i = 0; i < 30; i++) jeu.etape(DT, { a: entree({ vise: true }) });
  const d1 = PAR.dispersion(a, A), cible = A.dispersion * A.visee.dispersion;
  check(d0 > cible * 2.8 && d0 <= cible * 3 + 1e-12 && Math.abs(d1 - cible) < 1e-9, `lunette : ${f4(d0)} rad en entrant (×3 avant stabilisation), ${f4(d1)} rad stabilisée après 0,35 s immobile (${A.dispersion} × ${A.visee.dispersion})`);
  a.vise = 0; a.viseStable = 0;
  check(PAR.dispersion(a, A) >= A.dispersion - 1e-12, `à la hanche, le fusil de précision ne vaut rien (${A.dispersion} rad)`);
  jeu.etape(DT, { a: entree({ vise: true }) }); jeu.etape(DT, { a: entree({ vise: true, arme: 1 }) });
  check(a.vise === 0 && a.arme === 'p226', 'changer d\'arme remet la visée à 0');
  poser(jeu, a, 0, 100); for (let i = 0; i < 30; i++) jeu.etape(DT, { a: entree({ vise: true, course: true, avant: 1 }) });
  check(a.vise > 0 && !a.course, 'viser coupe la course');
}

// ─── les temps pour éliminer : un tireur posé (visée) vise la poitrine (ou la tête) à chaque pas et tire ; du premier tir à la mort ───
function tempsPourEliminer(arme, dist, h, o) {
  o = o || {};
  const A = R.arme(arme), sec = A.role === 'secondaire';
  const jeu = PJ.creer({ monde, graine: o.graine || 3, options: { bots: 0 }, nav: false });
  const a = jeu.ajouterJoueur({ id: 'a', humain: true, equip: sec ? { s: arme } : { p: arme } }), b = jeu.ajouterJoueur({ id: 'b', humain: true });
  poser(jeu, a, 0, 100); poser(jeu, b, 0, 100 - dist); if (sec) { a.arme = arme; a.slot = 1; }
  const vise = o.vise !== false;
  for (let i = 0; i < 60; i++) { viser(a, b, h); jeu.etape(DT, { a: entree({ vise }) }); } // la mise en joue (et la lunette posée)
  poser(jeu, b, 0, 100 - dist); a.prochainTir = 0;
  let t0 = -1, tMort = -1, tirs = 0;
  for (let i = 0; i < 900 && tMort < 0; i++) {
    viser(a, b, h);
    for (const v of jeu.etape(DT, { a: entree({ vise, tir: true }) })) { if (v.t === 'tir' && v.id === 'a' && t0 < 0) t0 = jeu.temps; if (v.t === 'mort' && v.a === 'b') tMort = jeu.temps; }
    tirs = A.chargeur - (a.munitions[arme] | 0);
  }
  return { t: tMort - t0, tirs, mort: tMort >= 0 };
}
titre('Temps pour éliminer (100 PV, sans armure, visée posée) : les fourchettes de la livraison 2');
{
  const FOURCHETTE = { fusil: [0.45, 0.6, 20], mitraillette: [0.35, 0.5, 8], pistolet: [0.8, 1.1, 10] }; // [min, max, distance utile]
  const lignes = [];
  for (const A of R.ARMES) {
    const F = FOURCHETTE[A.classe];
    if (F) {
      const r = tempsPourEliminer(A.id, F[2], 1.1), n = Math.ceil(100 / A.degats), th = (n - 1) / A.cadence;
      check(r.mort && r.t >= F[0] - 1e-9 && r.t <= F[1] + 1e-9 && r.tirs === n, `${A.nom} à ${F[2]} m : ${r.tirs} balles en ${f2(r.t)} s (${n} × ${A.degats}, théorie ${f2(th)} s ; fourchette ${F[0]}–${F[1]} s)`);
    }
    lignes.push(`${A.id} ${[10, 25, 50].map((d) => { const r = tempsPourEliminer(A.id, d, 1.1); return r.mort ? f2(r.t) + ' s' : '—'; }).join(' / ')}`);
  }
  console.log('      (à 10 / 25 / 50 m) ' + lignes.join(' ; '));
  // les mitraillettes : la chute est rapide
  const u25 = tempsPourEliminer('ump', 25, 1.1), m25 = tempsPourEliminer('mp9', 25, 1.1);
  check(u25.t > 0.5 && m25.t > 0.5, `mitraillettes à 25 m : plus lentes (UMP ${f2(u25.t)} s, MP9 ${f2(m25.t)} s : la chute est rapide)`);
  // la pompe : un coup jusqu'à 8 m (à la hanche comme en visée, sur 20 graines), plus jamais à 12 m
  let un = 0, unH = 0, loin = 0;
  for (let g = 1; g <= 20; g++) {
    for (const d of [3, 5.5, 8]) { if (tempsPourEliminer('pompe', d, 1.1, { graine: g }).tirs === 1) un++; if (tempsPourEliminer('pompe', d, 1.1, { graine: g, vise: false }).tirs === 1) unH++; }
    if (tempsPourEliminer('pompe', 12, 1.1, { graine: g }).tirs === 1) loin++;
  }
  check(un === 60 && unH === 60 && loin === 0, `fusil à pompe : un coup à 3, 5,5 et 8 m (${un}/60 en visée, ${unH}/60 à la hanche), jamais à 12 m (${loin}/20)`);
  // les fusils de précision : un coup à la tête, deux au corps (à 25 et 80 m)
  for (const id of ['m24', 'awm']) {
    const t25 = tempsPourEliminer(id, 25, 1.65), c25 = tempsPourEliminer(id, 25, 1.1), t80 = tempsPourEliminer(id, 80, 1.65), c80 = tempsPourEliminer(id, 80, 1.1);
    check(t25.tirs === 1 && t80.tirs === 1 && c25.tirs === 2 && c80.tirs === 2 && Math.abs(c25.t - 1 / R.arme(id).cadence) < 2 * DT, `${R.arme(id).nom} : un coup à la tête (25 et 80 m), deux au corps (${f2(c25.t)} s)`);
  }
}

titre('Événements de tir : ce qu\'il faut au rendu pour les impacts (point, normale, matière, arme)');
{
  const c = cartePlate({
    batiments: [{ p: [[40, -10], [50, -10], [50, 10], [40, 10]], h: 8, t: 'maison', toit: 'zinc' }],
    murs: [{ l: [[-10, 60], [10, 60]], h: 2, e: 0.3, t: 'cloture' }, { l: [[-10, -60], [10, -60]], h: 2, e: 0.5, t: 'pierre' }],
    mobilier: [{ x: -40, z: 100, t: 'fontaine' }],
  });
  const m = PM.creer(c), { jeu, es: [a, b] } = partie(['a', 'b'], null, m);
  const unit = (i) => Math.abs(Math.hypot(i.nx, i.ny, i.nz) - 1) < 1e-6;
  const tirVers = (x, y, z) => { // depuis (0, 100), au M24 posé (précis), vers un point
    poser(jeu, a, 0, 100); poser(jeu, b, 150, 150); donner(a, 'm24'); a.vise = 1; a.viseStable = 1;
    const dx = x - a.x, dz = z - a.z; a.yaw = Math.atan2(-dx, -dz); a.pitch = Math.atan2(y - a.y - a.oeil, Math.hypot(dx, dz));
    return jeu.etape(DT, { a: entree({ tir: true, vise: true }) }).filter((v) => v.t === 'tir')[0];
  };
  let t = tirVers(0, 1, 60);
  check(t && t.arme === 'm24' && t.o.length === 3 && t.fin.length === 3 && t.impact && t.impact.mat === 'metal' && t.impact.quoi === 'mur' && Math.abs(t.impact.z - 60.15) < 0.05 && unit(t.impact) && t.impact.nz > 0.9,
    `une clôture : impact { x, y, z, nx, ny, nz (unitaire, vers le tireur), quoi: 'mur', mat: 'metal' } (${t && t.impact ? t.impact.mat + ' à z = ' + f2(t.impact.z) : '?'})`);
  t = tirVers(0, 0, 90);
  check(t && t.impact && t.impact.mat === 'sol' && t.impact.quoi === 'sol' && t.impact.ny > 0.9, 'le sol : mat \'sol\', normale vers le haut');
  t = tirVers(-40, 0.6, 100);
  check(t && t.impact && t.impact.mat === 'mur' && Math.abs(t.impact.x - -40) < 1.5, `la fontaine : mat 'mur' (pierre) (${t && t.impact ? t.impact.mat + ' à x = ' + f2(t.impact.x) : '?'})`);
  poser(jeu, a, 30, 0); donner(a, 'm24'); a.yaw = -Math.PI / 2; a.pitch = 0; a.vise = 1; a.viseStable = 1;
  t = jeu.etape(DT, { a: entree({ tir: true, vise: true }) }).filter((v) => v.t === 'tir')[0];
  check(t && t.impact && t.impact.quoi === 'mur' && t.impact.mat === 'mur' && Math.abs(t.impact.x - 40) < 1e-6 && t.impact.nx < -0.99, 'le mur d\'une maison : mat \'mur\', normale vers l\'ouest (le tireur)');
  poser(jeu, a, 45, 30); donner(a, 'm24'); a.y = 12; a.auSol = false; a.vy = 0; a.yaw = 0; a.pitch = -Math.atan2(12 + a.oeil - 8, 25); a.vise = 1; a.viseStable = 1; // en l'air au-dessus, vers le toit
  t = jeu.etape(DT, { a: entree({ tir: true, vise: true }) }).filter((v) => v.t === 'tir')[0];
  check(t && t.impact && t.impact.quoi === 'toit' && t.impact.mat === 'metal' && PAR.matiere({ de: 'batiment', i: 0, quoi: 'mur', k: -1 }, m) === 'mur', `un toit de zinc : quoi 'toit', mat 'metal' (${t && t.impact ? t.impact.quoi + ', ' + t.impact.mat : '?'}) ; le mur de la même maison : 'mur'`);
  poser(jeu, a, 0, 100); poser(jeu, b, 0, 80); donner(a, 'ak74'); viser(a, b, 1.1); a.vise = 1;
  const evs = jeu.etape(DT, { a: entree({ tir: true, vise: true }) }); t = evs.find((v) => v.t === 'tir'); const h = evs.find((v) => v.t === 'touche');
  check(t && t.impact && t.impact.mat === 'corps' && t.impact.quoi === 'entite' && t.impact.id === 'b' && unit(t.impact) && h && h.arme === 'ak74', 'une entité : mat \'corps\' (jamais de sang : le rendu met un marqueur), id ; « touche » porte l\'arme');
  poser(jeu, a, 0, 100); donner(a, 'pompe'); a.yaw = 0; a.pitch = 0.6; const ps = jeu.etape(DT, { a: entree({ tir: true }) }).filter((v) => v.t === 'tir');
  check(ps.length === R.arme('pompe').plombs && ps.every((v) => v.impact === null && v.arme === 'pompe'), 'pompe en l\'air : un événement par plomb, impact null (dans le vide)');
  poser(jeu, a, 0, 100); poser(jeu, b, 150, 150); donner(a, 'm4'); a.yaw = 0; a.pitch = Math.atan2(1 - a.oeil, 40); a.vise = 1; const ev = []; PAR.tirVisuel(a, m, jeu.entites, R.mulberry32(1), ev);
  check(ev.length === 1 && ev[0].local && ev[0].impact && ev[0].impact.mat === 'metal', 'PARMES.tirVisuel (le tir du client, pour l\'image) : la même matière (la clôture : metal)');
  check(PAR.matiere({ de: 'mobilier', k: -1, quoi: 'mur' }, m) === 'metal' && PAR.matiere({ de: 'arbre', k: 0, quoi: 'mur' }, m) === 'mur' && PAR.matiere({ de: 'voute', i: 0, quoi: 'mur' }, m) === 'mur' && PAR.matiere({ de: 'mur', k: 1, quoi: 'mur' }, m) === 'mur' && PAR.matiere(null, m) === null,
    'PARMES.matiere : banc → metal, tronc, voûte et mur de pierre → mur');
}

// ─── les duels robot contre robot : x (arme ax) et y (arme ay) face à face à d m sur le plat, jusqu'à la première élimination (12 s) ───
function duel(ax, ay, d, graine, niveau, st) {
  const jeu = PJ.creer({ monde, graine, options: { bots: 0 }, nav: false });
  const eq = (id) => (R.arme(id).role === 'secondaire' ? { p: 'ak74', s: id } : { p: id });
  const x = jeu.ajouterJoueur({ id: 'x', bot: true, niveau, equip: eq(ax) }), y = jeu.ajouterJoueur({ id: 'y', bot: true, niveau, equip: eq(ay) });
  const a = jeu.rnd() * Math.PI * 2, cx = Math.cos(a) * d / 2, cz = Math.sin(a) * d / 2;
  for (const [e, s] of [[x, 1], [y, -1]]) {
    poser(jeu, e, s * cx, s * cz); e.yaw = Math.atan2(s * cx, s * cz);
    if (R.arme(e === x ? ax : ay).role === 'secondaire') { e.arme = e.armes[1]; e.slot = 1; e.munitions.ak74 = 0; e.reserve.ak74 = 0; } // un duel au pistolet : la principale vide
  }
  for (let i = 0; i < 12 * 60; i++) {
    for (const v of jeu.etape(DT, {})) {
      if (v.t === 'tir' && st && R.arme(v.arme).classe === 'sniper') { st.sniper++; if (jeu.trouver(v.id).vise >= 1) st.sniperVise++; }
      if (v.t === 'mort') return v.a === 'x' ? 'y' : 'x';
    }
    if (st) for (const e of [x, y]) { if (e.vers === 'couche') st.couche++; if (e.vers === 'accroupi') st.accroupi++; if (e.slot === 1 && e.equip.p !== 'ak74') st.secondaire++; }
  }
  return null;
}
titre('Duels robot contre robot (40 par paire, « normal ») : chaque arme tient sa bande');
{
  const t0 = Date.now(), st = { sniper: 0, sniperVise: 0, couche: 0, accroupi: 0, secondaire: 0 };
  const serie = (ax, ay, d) => { let gx = 0, gy = 0; for (let g = 1; g <= 40; g++) { const r = duel(ax, ay, d, 1000 + 7 * g, 'normal', st); if (r === 'x') gx++; else if (r === 'y') gy++; } return [gx, gy]; };
  const egal = (ax, ay, d) => { const [a, b] = serie(ax, ay, d), p = a / Math.max(1, a + b); check(a + b >= 36 && p >= 0.35 && p <= 0.65, `${R.arme(ax).nom} contre ${R.arme(ay).nom} à ${d} m : ${a} – ${b} (de 35 à 65 %)`); };
  const domine = (ax, ay, d, min) => { const [a, b] = serie(ax, ay, d), p = a / Math.max(1, a + b); check(a + b >= 36 && p >= min, `${R.arme(ax).nom} contre ${R.arme(ay).nom} à ${d} m (sa bande) : ${a} – ${b} (≥ ${Math.round(min * 100)} %)`); };
  egal('ak74', 'm4', 20); egal('ump', 'mp9', 8); egal('m24', 'awm', 60); egal('m1911', 'p226', 10);
  domine('pompe', 'ak74', 5, 0.6); domine('ump', 'ak74', 7, 0.5); domine('mp9', 'ak74', 7, 0.5);
  domine('ak74', 'ump', 30, 0.5); domine('m4', 'mp9', 25, 0.5); domine('ak74', 'pompe', 20, 0.75); domine('m24', 'ak74', 60, 0.7);
  check(st.sniper > 50 && st.sniperVise === st.sniper, `au fusil de précision, les robots ne tirent qu'en visée (${st.sniperVise}/${st.sniper} tirs, lunette posée)`);
  check(st.accroupi > 0 && st.secondaire > 0, `ils se posent pour tirer (accroupi ${st.accroupi} pas) et passent à la secondaire quand la principale ne convient pas (${st.secondaire} pas)`);
  const sf = { sniper: 0, sniperVise: 0, couche: 0, accroupi: 0, secondaire: 0 }; let gf = 0;
  for (let g = 1; g <= 10; g++) if (duel('m24', 'ak74', 60, 2000 + g, 'fort', sf) === 'x') gf++;
  check(sf.couche > 0 && gf >= 6, `« fort » au fusil de précision, de loin : il se couche (${sf.couche} pas) et gagne ${gf}/10`);
  console.log(`      (duels en ${f2((Date.now() - t0) / 1000)} s)`);
}

titre('Robots : la secondaire, l\'entrée v2');
{
  // un robot au fusil à pompe, une cible à 30 m : il passe au pistolet ; un robot au fusil de précision, une cible à 5 m : aussi
  const jeu = PJ.creer({ monde, graine: 5, options: { bots: 0 }, nav: false });
  const h = jeu.ajouterJoueur({ id: 'h', humain: true }), r = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'normal', equip: { p: 'pompe', s: 'm1911' } });
  poser(jeu, r, 0, 100); poser(jeu, h, 0, 70); r.yaw = 0;
  let sec = -1; for (let i = 0; i < 4 * 60 && sec < 0; i++) { h.vie = 100; jeu.etape(DT, {}); if (r.arme === 'm1911') sec = jeu.temps; }
  check(sec > 0, `fusil à pompe, cible à 30 m : il sort son pistolet (au bout de ${f2(sec)} s)`);
  const r2 = jeu.ajouterJoueur({ id: 'r2', bot: true, niveau: 'normal', equip: { p: 'awm', s: 'p226' } }); jeu.retirerJoueur('r');
  poser(jeu, r2, 0, 100); poser(jeu, h, 0, 95); r2.yaw = 0; r2.ia = null;
  let sec2 = false; for (let i = 0; i < 3 * 60 && !sec2; i++) { h.vie = 100; jeu.etape(DT, {}); if (r2.arme === 'p226') sec2 = true; }
  check(sec2, 'fusil de précision, cible à 5 m : il passe au pistolet');
  const en = PB.penser(r2, jeu, DT, jeu.rndBots);
  check(['course', 'couche', 'vise', 'changer'].every((k) => typeof en[k] === 'boolean') && (en.arme === null || en.arme === 0 || en.arme === 1), 'PBOTS.penser rend une entrée v2 (course, couche, vise, changer ; arme : emplacement 0 / 1 ou null)');
}

titre('Régime historique (gardé dans le module pour les vieux tests ; le jeu ne le prend plus)');
{
  const { jeu, es: [a, b] } = partie(['a', 'b']);
  PAR.equiper(a, null);
  check(a.equip === null && a.arme === 'ak74' && a.armes.join() === 'ak74' && a.munitions.ak74 === 30 && a.reserve.ak74 === 120, 'PARMES.equiper(e, null) : l\'arme de base seule (DEFAUT_EQUIP.p), 30 + 120');
  donner(a, 'ak74'); a.munitions.ak74 = 0; a.reserve.ak74 = 0; jeu.etape(DT, { a: entree({ recharge: true }) });
  for (let i = 0; i < 160; i++) jeu.etape(DT, { a: entree() });
  check(a.munitions.ak74 === 30 && a.reserve.ak74 >= 30, `l'arme de base à sec : recharge quand même (${a.munitions.ak74} + ${a.reserve.ak74})`);
  donner(a, 'pompe'); a.munitions.pompe = 0; a.reserve.pompe = 0; jeu.etape(DT, { a: entree({ tir: true }) });
  check(a.armes.indexOf('pompe') < 0 && a.arme === 'ak74', 'pompe vide de tout : lâchée, retour à l\'arme de base');
  const t0 = jeu.temps; donner(a, 'm24'); a.prochainTir = 0; jeu.etape(DT, { a: entree({ arme: 'ak74' }) });
  check(a.arme === 'ak74' && Math.abs(a.prochainTir - (t0 + DT + 0.3)) < 1e-9, 'changement par id : 0,3 s');
  donner(a, 'm24'); a.vitesse = 0; a.gonfle = 0; a.vise = 1;
  check(Math.abs(PAR.dispersion(a, R.arme('m24')) - R.arme('m24').dispersion) < 1e-12, 'dispersion d\'avant la visée (l\'arme à la hanche, quelle que soit e.vise)');
  check(b.equip !== null, 'les autres entités du jeu restent équipées (v2)');
}

titre('PARMES : l\'API');
{
  const noms = ['dispersion', 'tirer', 'tirVisuel', 'majVisee', 'changer', 'recharger', 'equiper', 'agir', 'utile', 'prendre', 'matiere'];
  check(noms.every((k) => typeof PAR[k] === 'function'), 'PARMES.' + noms.join(', '));
  check(PJ.dispersion === PAR.dispersion && PJ.tirVisuel === PAR.tirVisuel, 'PJEU.dispersion et PJEU.tirVisuel sont des alias de PARMES');
  const e = { x: 0, y: 0, z: 0 }; PAR.equiper(e, { p: 'splash', s: 'ak74' }, { armes: ['ump', 'm1911'] });
  check(e.equip.p === 'ump' && e.equip.s === 'm1911', 'equiper : une demande non autorisée devient la première arme permise de l\'emplacement');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
