#!/usr/bin/env node
// Opération Poncin — les armes (PARMES, armes.js ; chiffres de PREGLES.ARMES). Le régime historique (la partie actuelle) tire
// exactement comme avant : temps pour éliminer du rafale, de la pompe et du Long-tir, dispersion de hanche du Long-tir à 0,0015 tant que
// la visée n'est pas branchée, rafale qui ne tombe jamais en panne. Les emplacements (lot Gameplay, § 5) : équipement, secondaire jamais
// à sec, durées de changement, visée et dispersion v2, objets munitions et arme. Sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PJ = require('../src-poncin/jeu.js'), PAR = require('../src-poncin/armes.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const f2 = (v) => (Math.round(v * 100) / 100).toString(), f4 = (v) => (Math.round(v * 1e4) / 1e4).toString();
const J = R.JOUEUR, DT = 1 / 60;
const NUL = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null };
const entree = (o) => Object.assign({}, NUL, o || {});
function cartePlate() {
  const n = 41;
  return { v: 1, nom: 'Plat', source: 'test', taille: 400, relief: { pas: 10, n, h: new Array(n * n).fill(0) }, batiments: [], rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], sol: null,
    zones: { arene: { centre: [0, 0], rayon: 190 }, apparitions: [[0, 0]], armes: [], extraction: [], base: [0, 0] } };
}
const monde = PM.creer(cartePlate());
function partie(ids, equips) {
  const jeu = PJ.creer({ monde, graine: 3, options: { bots: 0 }, nav: false });
  const es = ids.map((id) => jeu.ajouterJoueur({ id, nom: id, humain: true, equip: equips && equips[id] }));
  for (const e of es) e.invincible = 0;
  return { jeu, es };
}
function poser(jeu, e, x, z) { e.x = x; e.z = z; e.y = 0; e.vx = e.vz = e.vy = 0; e.vitesse = 0; e.auSol = true; e.pitch = 0; e.gonfle = 0; e.prochainTir = 0; e.invincible = 0; e.vivant = true; e.vie = J.vie; e.armure = 0; }
function donner(e, arme) { const A = R.arme(arme); if (e.armes.indexOf(arme) < 0) e.armes.push(arme); e.arme = arme; e.munitions[arme] = A.chargeur; e.reserve[arme] = A.reserve; e.enRecharge = false; e.rechargeJusqua = 0; e.prochainTir = 0; }
function viser(e, c, h) { const dx = c.x - e.x, dz = c.z - e.z, dy = c.y + h - (e.y + J.oeil); e.yaw = Math.atan2(-dx, -dz); e.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
// le temps pour éliminer : le tireur vise (la poitrine ou la tête) à chaque pas et tire ; du premier tir à la mort
function tempsPourEliminer(arme, dist, h) {
  const { jeu, es } = partie(['a', 'b']), [a, b] = es;
  poser(jeu, a, 0, 100); poser(jeu, b, 0, 100 - dist); donner(a, arme);
  let t0 = -1, tMort = -1, tirs = 0;
  for (let i = 0; i < 600 && tMort < 0; i++) {
    viser(a, b, h);
    for (const v of jeu.etape(DT, { a: entree({ tir: true }) })) { if (v.t === 'tir' && v.id === 'a') { if (t0 < 0) t0 = jeu.temps; } if (v.t === 'mort' && v.a === 'b') tMort = jeu.temps; }
    tirs = R.arme(arme).chargeur - (a.munitions[arme] | 0);
  }
  return { t: tMort - t0, tirs };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
titre('Régime historique : la partie actuelle tire comme avant');
{
  const r = tempsPourEliminer('rafale', 10, 1.1), p = tempsPourEliminer('pompe', 5, 1.0), lc = tempsPourEliminer('precision', 25, 1.0), lt = tempsPourEliminer('precision', 25, 1.72);
  const pres = (v, c) => Math.abs(v - c) <= DT + 1e-9;
  check(r.tirs === 8 && pres(r.t, 7 / 9), `rafale à 10 m : ${r.tirs} touches en ${f2(r.t)} s (8 touches, 0,78 s)`);
  check(p.tirs === 2 && pres(p.t, 1 / 1.15), `pompe à 5 m : ${p.tirs} coups en ${f2(p.t)} s (2 coups, 0,87 s)`);
  check(lc.tirs === 2 && pres(lc.t, 1 / 0.85) && lt.tirs === 1 && lt.t === 0, `Long-tir à 25 m : corps ${lc.tirs} coups en ${f2(lc.t)} s (1,18 s) ; tête en ${lt.tirs} coup`);
  const { jeu, es } = partie(['a']), a = es[0];
  check(a.equip === null && a.arme === 'rafale' && a.armes.join() === 'rafale' && a.munitions.rafale === 30 && a.reserve.rafale === 120, 'équipement historique : rafale seul, 30 + 120');
  donner(a, 'precision'); a.vitesse = 0; a.gonfle = 0;
  check(Math.abs(PAR.dispersion(a, R.arme('precision')) - 0.0015) < 1e-12 && R.arme('precision').dispersion === 0.03, 'Long-tir : 0,0015 rad à la hanche tant que la visée n\'est pas branchée (la table v2 dit 0,03)');
  check(PJ.dispersion === PAR.dispersion && PJ.tirVisuel === PAR.tirVisuel, 'PJEU.dispersion et PJEU.tirVisuel sont des alias de PARMES');
  // le rafale ne tombe jamais en panne ; une autre arme vide de tout est lâchée
  donner(a, 'rafale'); a.munitions.rafale = 0; a.reserve.rafale = 0; jeu.etape(DT, { a: entree({ recharge: true }) });
  for (let i = 0; i < 120; i++) jeu.etape(DT, { a: entree() });
  check(a.munitions.rafale === 30 && a.reserve.rafale >= 30, `rafale à sec : recharge quand même (${a.munitions.rafale} + ${a.reserve.rafale})`);
  donner(a, 'pompe'); a.munitions.pompe = 0; a.reserve.pompe = 0; jeu.etape(DT, { a: entree({ tir: true }) });
  check(a.armes.indexOf('pompe') < 0 && a.arme === 'rafale', 'pompe vide de tout : lâchée, retour au rafale');
  const t0 = jeu.temps; donner(a, 'precision'); a.prochainTir = 0; jeu.etape(DT, { a: entree({ arme: 'rafale' }) });
  check(a.arme === 'rafale' && Math.abs(a.prochainTir - (t0 + DT + 0.3)) < 1e-9, 'changement par id (entrée arme: \'rafale\') : 0,3 s');
}

titre('Emplacements : équipement, secondaire jamais à sec, changement');
{
  const { jeu, es } = partie(['a', 'b'], { a: { p: 'carabine', s: 'arroseuse' }, b: 'precision+petoire' }), [a, b] = es;
  check(a.equip.p === 'carabine' && a.equip.s === 'arroseuse' && a.armes.join() === 'carabine,arroseuse' && a.arme === 'carabine' && a.slot === 0 && a.munitions.carabine === 10 && a.reserve.arroseuse === 96, 'ajouterJoueur({ equip }) : principale en main, deux chargeurs et deux réserves pleins');
  check(b.equip.p === 'precision' && b.equip.s === 'petoire', 'équipement en texte « precision+petoire »');
  const T = jeu.temps; jeu.etape(DT, { a: entree({ arme: 1 }) });
  check(a.arme === 'arroseuse' && a.slot === 1 && Math.abs(a.prochainTir - (T + DT + 0.25)) < 1e-9 && Math.abs(a.changeJusqua - (T + DT + 0.25)) < 1e-9, 'emplacement 1 (entrée arme: 1) : la secondaire sort en 0,25 s (A.changement)');
  const T2 = jeu.temps; jeu.etape(DT, { a: entree({ changer: true }) });
  check(a.arme === 'carabine' && a.slot === 0 && Math.abs(a.prochainTir - (T2 + DT + 0.36)) < 1e-9, 'changer (front) : retour à la principale en 0,36 s');
  // la secondaire ne tombe jamais en panne ; la principale vide n'est pas lâchée
  jeu.etape(DT, { a: entree({ arme: 1 }) }); a.munitions.arroseuse = 0; a.reserve.arroseuse = 0; a.prochainTir = 0;
  for (let i = 0; i < 200; i++) jeu.etape(DT, { a: entree() });
  check(a.munitions.arroseuse === 24 && a.reserve.arroseuse >= 24, `secondaire à sec : rechargée quand même (${a.munitions.arroseuse} + ${a.reserve.arroseuse}), plancher d'un chargeur`);
  jeu.etape(DT, { a: entree({ arme: 0 }) }); a.munitions.carabine = 0; a.reserve.carabine = 0; a.prochainTir = 0;
  for (let i = 0; i < 200; i++) jeu.etape(DT, { a: entree({ tir: true }) });
  check(a.armes.join() === 'carabine,arroseuse' && a.munitions.carabine === 0 && !a.enRecharge, 'principale vide de tout : gardée, ni tir ni recharge (il faut des munitions)');
  // l'objet munitions remplit les deux réserves ; une arme ramassée remplace la principale jusqu'à la mort
  PAR.prendre(a, R.OBJETS.munitions, jeu);
  check(a.reserve.carabine === 40 && a.reserve.arroseuse >= 96, 'munitions : les deux réserves pleines');
  PAR.prendre(a, R.OBJETS.pompe, jeu);
  check(a.armes[0] === 'pompe' && a.armes[1] === 'arroseuse' && a.munitions.pompe === 6 && a.munitions.carabine === undefined && a.equip.p === 'carabine', 'une pompe ramassée remplace la principale (l\'équipement choisi reste)');
  jeu.reapparaitre(a);
  check(a.armes.join() === 'carabine,arroseuse' && a.arme === 'carabine', 'à la réapparition : l\'équipement choisi, la principale en main');
  check(PAR.utile(a, R.OBJETS.munitions) === false && PAR.utile(a, R.OBJETS.pompe) === true, 'utile : munitions déjà pleines non, une autre arme oui');
}

titre('Visée (prête, pas encore branchée dans l\'interface)');
{
  const { jeu, es } = partie(['a'], { a: { p: 'precision', s: 'petoire' } }), a = es[0];
  const V2 = (o) => entree(Object.assign({ course: false, couche: false, vise: false }, o));
  let n = 0; while (a.vise < 1 && n < 100) { jeu.etape(DT, { a: V2({ vise: true }) }); n++; }
  check(n === Math.ceil(0.25 / DT - 1e-9), `mise en joue du Long-tir en ${n} pas (0,25 s)`);
  const A = R.arme('precision'), d0 = PAR.dispersion(a, A);
  for (let i = 0; i < 30; i++) jeu.etape(DT, { a: V2({ vise: true }) });
  const d1 = PAR.dispersion(a, A);
  check(d0 > 0.0015 * 2.8 && d0 <= 0.0015 * 3 + 1e-12 && Math.abs(d1 - 0.0015) < 1e-9, `lunette : ${f4(d0)} rad en entrant (×3 avant stabilisation), ${f4(d1)} rad stabilisée après 0,35 s immobile (0,03 × 0,05)`);
  jeu.etape(DT, { a: V2({ vise: true, arme: 1 }) });
  check(a.vise === 0 && a.arme === 'petoire', 'changer d\'arme remet la visée à 0');
  let m = 0; jeu.etape(DT, { a: V2({ vise: true }) }); while (a.vise > 0 && m < 100) { jeu.etape(DT, { a: V2({}) }); m++; }
  const h = partie(['h']).es[0];
  check(h.vise === 0 && PAR.majVisee(h, entree(), DT) === 0, 'régime historique : sans le niveau vise, la visée reste à 0');
}

titre('PARMES : l\'API');
{
  const noms = ['dispersion', 'tirer', 'tirVisuel', 'majVisee', 'changer', 'recharger', 'equiper', 'agir', 'utile', 'prendre'];
  check(noms.every((k) => typeof PAR[k] === 'function'), 'PARMES.' + noms.join(', '));
  const e = { x: 0, y: 0, z: 0 }; PAR.equiper(e, { p: 'splash', s: 'rafale' }, { armes: ['carabine', 'petoire'] });
  check(e.equip.p === 'carabine' && e.equip.s === 'petoire', 'equiper : une demande non autorisée devient la première arme permise de l\'emplacement');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
