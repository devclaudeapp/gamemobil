#!/usr/bin/env node
// Opération Poncin — le corps (PCORPS, corps.js) : vitesses par posture et facteurs de pente, transitions, glissade, couché, capsules
// touchables, pas fixe (PJEU.pasFixe : mêmes positions à 30, 60, 120 Hz et sur un téléphone irrégulier), aucun décollage sans saut sur
// les rues en pente du bourg, et la caméra subjective (PCORPS.camera : balancement calé sur la foulée, œil lissé) sur ces mêmes rues.
// Seuils : conception du lot Gameplay, § 1 et § 14. Sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PC = require('../src-poncin/corps.js');
const PJ = require('../src-poncin/jeu.js'), PA = require('../src-poncin/arene.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const f2 = (v) => (Math.round(v * 100) / 100).toString(), cm = (v) => (v * 100).toFixed(1) + ' cm';
const J = R.JOUEUR, DT = 1 / 60, TAU = Math.PI * 2, RAFALE = R.arme('rafale');

// ─── terrains synthétiques : plat (avec une maison), et des rampes de pente p le long de x (vers l'est) ───
function carteRampe(p) {
  const n = 41, h = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -200 + i * 10; h[j * n + i] = p * (x + 200); }
  return { v: 1, nom: 'Rampe', source: 'test', taille: 400, relief: { pas: 10, n, h },
    batiments: p ? [] : [{ p: [[40, -10], [50, -10], [50, 10], [40, 10]], h: 8, t: 'maison' }], rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], sol: null,
    zones: { arene: { centre: [0, 0], rayon: 190 }, apparitions: [[0, 0]], armes: [], extraction: [], base: [0, 0] } };
}
const plat = PM.creer(carteRampe(0));
const rampes = {}; for (const p of [0.15, 0.22, 0.3, 0.5]) rampes[p] = PM.creer(carteRampe(p));
function corps(monde, x, z, yaw) {
  return { x, z, y: monde.hauteur(x, z), vx: 0, vz: 0, vy: 0, vitesse: 0, yaw: yaw || 0, pitch: 0, auSol: true, accroupi: false,
    posture: 'debout', vers: 'debout', transition: 0, oeil: J.oeil, hautCapsule: J.taille, corpsV2: false, course: false, gv: 0, gdx: 0, gdz: 0,
    relanceA: 0, receptionA: 0, remonte: 0, vise: 0, viseStable: 0, accroupiPrec: false, couchePrec: false };
}
const V2 = (o) => Object.assign({ avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, couche: false, course: false, vise: false, recharge: false, arme: null }, o || {});
const EST = -Math.PI / 2, OUEST = Math.PI / 2; // yaw 0 = nord, positif vers l'ouest : regarder vers +x (est) = −π/2

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
titre('Vitesses par posture (plat, ±2 %) et facteurs de pente');
{
  const vit = (en, monde) => { const e = corps(monde || plat, -150, 100, EST); for (let i = 0; i < 150; i++) PC.deplacer(e, en, DT, monde || plat, RAFALE); return e.vitesse; };
  const vD = vit(V2({ avant: 1 })), vC = vit(V2({ avant: 1, course: true })), vA = vit(V2({ avant: 1, accroupi: true })), vK = vit(V2({ avant: 1, couche: true }));
  const pres = (v, c) => Math.abs(v - c) <= 0.02 * c;
  check(pres(vD, 5.2) && pres(vC, 7.0) && pres(vA, 2.6) && pres(vK, 1.1), `debout ${f2(vD)}, course ${f2(vC)}, accroupi ${f2(vA)}, couché ${f2(vK)} m/s (5,2 / 7,0 / 2,6 / 1,1)`);
  const vH = vit({ avant: 1, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: true, recharge: false, arme: null });
  check(pres(vH, 2.4), `entrée historique (sans niveaux course / couche / vise) : accroupi immédiat à ${f2(vH)} m/s, comme avant`);
  const att = { 0.15: [7 * 0.88, 7 * 1.045], 0.3: [7 * 0.76, 7 * 1.09] }, lignes = []; let ok = true;
  for (const p of [0.15, 0.3]) {
    const m = rampes[p], monte = vit(V2({ avant: 1, course: true }), m), e2 = corps(m, 150, 100, OUEST);
    for (let i = 0; i < 150; i++) PC.deplacer(e2, V2({ avant: 1, course: true }), DT, m, RAFALE);
    const descend = e2.vitesse; lignes.push(`${p * 100} % : montée ${f2(monte)}, descente ${f2(descend)}`);
    if (!pres(monte, att[p][0]) || !pres(descend, att[p][1])) ok = false;
  }
  check(ok, `course en pente (vitesse horizontale) : ${lignes.join(' ; ')} m/s (6,16 / 7,32 ; 5,32 / 7,63)`);
  const e = corps(plat, -150, 100, EST); for (let i = 0; i < 120; i++) PC.deplacer(e, V2({ avant: 1, cote: 1, course: true }), DT, plat, RAFALE);
  const e2 = corps(plat, -150, 100, EST); for (let i = 0; i < 120; i++) PC.deplacer(e2, V2({ avant: 1, course: true, tir: true }), DT, plat, RAFALE);
  const e3 = corps(plat, -150, 100, EST); e3.vise = 0.5; for (let i = 0; i < 120; i++) PC.deplacer(e3, V2({ avant: 1, course: true }), DT, plat, RAFALE);
  check(!e.course && !e2.course && !e3.course && e.vitesse < 5.3, `pas de course en diagonale à 45° (${f2(e.vitesse)} m/s), en tirant, en visant`);
  const e4 = corps(plat, -150, 100, EST); for (let i = 0; i < 60; i++) PC.deplacer(e4, V2({ avant: 1, course: true }), DT, plat, RAFALE);
  PC.deplacer(e4, V2({ avant: 1, course: true, tir: true }), DT, plat, RAFALE);
  check(!e4.course && Math.abs(e4.remonte - J.courir.remonte) < 1e-9, 'tirer coupe la course et repousse le tir de 0,18 s (e.remonte)');
}

titre('Transitions (durées exactes, œil et capsule linéaires)');
{
  const e = corps(plat, -150, 100, EST); PC.deplacer(e, V2(), DT, plat, RAFALE);
  const oeils = []; let n = 0;
  for (let i = 0; i < 40 && (i === 0 || e.transition > 0); i++) { PC.deplacer(e, V2({ accroupi: true }), DT, plat, RAFALE); oeils.push(e.oeil); n++; }
  const lin = Math.abs(oeils[4] - (1.6 + (1.05 - 1.6) * 5 * DT / 0.18)) < 1e-9;
  check(n === Math.ceil(0.18 / DT - 1e-9) && e.posture === 'accroupi' && e.accroupi && Math.abs(e.oeil - 1.05) < 1e-12 && Math.abs(e.hautCapsule - 1.25) < 1e-12 && lin, `debout → accroupi en ${n} pas (0,18 s), œil linéaire (${f2(oeils[4])} m au 5e pas), puis 1,05 / 1,25 m`);
  const d = (vers, init, enInit, en) => { const c = corps(plat, -150, 100, EST); for (let i = 0; i < 60; i++) PC.deplacer(c, enInit, DT, plat, RAFALE); let k = 0; PC.deplacer(c, en, DT, plat, RAFALE); k++; while (c.transition > 0 && k < 200) { PC.deplacer(c, en, DT, plat, RAFALE); k++; } return { k, c }; };
  const a = d('couche', 'debout', V2(), V2({ couche: true })), b = d('couche', 'accroupi', V2({ accroupi: true }), V2({ couche: true, accroupi: true })), c = d('debout', 'couche', V2({ couche: true }), V2());
  check(a.k === Math.ceil(0.6 / DT - 1e-9) && b.k === Math.ceil(0.45 / DT - 1e-9) && c.k === Math.ceil(0.6 / DT - 1e-9) && a.c.posture === 'couche' && b.c.posture === 'couche' && c.c.posture === 'debout' && Math.abs(a.c.oeil - 0.42) < 1e-12,
    `couché depuis debout en ${a.k} pas (0,6 s), depuis accroupi en ${b.k} (0,45 s), relevé en ${c.k} ; œil couché 0,42 m`);
  const t = corps(plat, -150, 100, EST); for (let i = 0; i < 10; i++) PC.deplacer(t, V2({ avant: 1, couche: true }), DT, plat, RAFALE);
  check(t.transition > 0 && Math.abs(t.vitesse - 5.2 * 0.3) < 0.2, `pendant la transition vers couché : vitesse × 0,3 (${f2(t.vitesse)} m/s)`);
}

titre('Glissade');
{
  // lancer : courir 1,5 s, puis toucher accroupi (front) ; on mesure la glissade
  function glissade(monde, x, yaw, opts) {
    opts = opts || {};
    const e = corps(monde, x, 100, yaw); let t = 0, d = 0, debut = false, fin = false, v0 = 0, x0 = 0, z0 = 0, mv, vCourse = 0;
    for (let i = 0; i < 90; i++) PC.deplacer(e, V2({ avant: 1, course: true }), DT, monde, RAFALE);
    vCourse = e.vitesse;
    if (opts.force) { e.gv = Math.min(11, vCourse + 1.6); e.gdx = e.vx / Math.hypot(e.vx, e.vz); e.gdz = e.vz / Math.hypot(e.vx, e.vz); e.course = false; PC.changerPosture(e, 'glisse', 0.18); e.accroupiPrec = true; }
    for (let i = 0; i < 600 && !fin; i++) {
      const vh = Math.hypot(e.vx, e.vz), px = e.x, pz = e.z;
      mv = PC.deplacer(e, V2({ avant: 1, course: true, accroupi: true, saut: opts.sautA != null && i === opts.sautA }), DT, monde, RAFALE);
      if (mv.glisse || (opts.force && i === 0)) { debut = true; v0 = opts.force ? Math.min(11, vCourse + 1.6) : Math.min(11, vh + 1.6); x0 = px; z0 = pz; }
      if (debut && e.vers === 'glisse') t += DT; else if (debut) fin = true;
      if (opts.sautA != null && i === opts.sautA) return { e, mv };
    }
    d = Math.hypot(e.x - x0, e.z - z0);
    return { t, d, v0, debut, e, vCourse };
  }
  const g = glissade(plat, -150, EST);
  check(g.debut && Math.abs(g.t - 1.07) <= 0.1 && Math.abs(g.d - 5.8) <= 0.5 && Math.abs(g.v0 - 8.6) < 0.1, `sur le plat : départ ${f2(g.v0)} m/s, ${f2(g.t)} s, ${f2(g.d)} m (1,07 ± 0,1 s ; 5,8 ± 0,5 m)`);
  check(g.e.posture === 'accroupi' || g.e.vers === 'accroupi', 'fin de glissade, accroupi tenu : on passe accroupi');
  const desc = glissade(rampes[0.22], 150, OUEST), mont = glissade(rampes[0.22], -150, EST), montF = glissade(rampes[0.22], -150, EST, { force: true });
  check(desc.debut && desc.d >= 9, `en descente à 22 % : ${f2(desc.t)} s, ${f2(desc.d)} m (≥ 9 m)`);
  // en montée à 22 %, la course ne fait que 7 × (1 − 0,8 × 0,22) = 5,77 m/s : sous les 6 m/s, pas de glissade ; lancée quand même
  // (élan de course + 1,6), elle tient au plus 4 m
  check(!mont.debut && mont.vCourse < 6 && montF.debut && montF.d <= 4, `en montée à 22 % : course à ${f2(mont.vCourse)} m/s, pas de glissade ; lancée de force : ${f2(montF.t)} s, ${f2(montF.d)} m (≤ 4 m)`);
  // pas de glissade sous 6 m/s : en marchant (sans course), accroupi ne lance rien
  const m = corps(plat, -150, 100, EST); for (let i = 0; i < 90; i++) PC.deplacer(m, V2({ avant: 1 }), DT, plat, RAFALE);
  const mv = PC.deplacer(m, V2({ avant: 1, accroupi: true }), DT, plat, RAFALE);
  check(!mv.glisse && m.vers === 'accroupi', 'à 5,2 m/s (sans courir) : accroupi, pas de glissade');
  // l'attente de 0,8 s
  const a = corps(plat, -150, 100, EST); let finA = -1, essais = [];
  for (let i = 0; i < 90; i++) PC.deplacer(a, V2({ avant: 1, course: true }), DT, plat, RAFALE);
  PC.deplacer(a, V2({ avant: 1, course: true, accroupi: true }), DT, plat, RAFALE);
  for (let i = 0; i < 400; i++) {
    const appui = finA >= 0 && (i - finA === 18 || i - finA === 19 || i - finA === 60 || i - finA === 61); // un toucher à 0,3 s, puis à 1,0 s
    const r = PC.deplacer(a, V2({ avant: 1, course: !appui || true, accroupi: appui }), DT, plat, RAFALE);
    if (finA < 0 && a.vers !== 'glisse') finA = i;
    if (r.glisse) essais.push(i - finA);
  }
  check(essais.length === 1 && essais[0] === 60, `l'attente de 0,8 s entre deux glissades : relancée à ${essais.map((k) => f2(k * DT) + ' s').join(', ')} après la fin (pas à 0,3 s)`);
  const s = glissade(plat, -150, EST, { sautA: 20 }), vh = Math.hypot(s.e.vx, s.e.vz);
  check(s.mv.saut && !s.e.auSol && s.e.vers === 'debout' && vh > 0, `un saut en glissade : en l'air à ${f2(vh)} m/s, le corps se relève`);
  const s3 = (function () { // le pas du saut : l'élan décroît pendant ce pas, puis 90 % passent en vitesse horizontale
    const e = corps(plat, -150, 100, EST); for (let i = 0; i < 90; i++) PC.deplacer(e, V2({ avant: 1, course: true }), DT, plat, RAFALE);
    for (let i = 0; i < 20; i++) PC.deplacer(e, V2({ avant: 1, course: true, accroupi: true }), DT, plat, RAFALE);
    const g0 = e.gv; PC.deplacer(e, V2({ avant: 1, course: true, accroupi: true, saut: true }), DT, plat, RAFALE); return { g0, vh: Math.hypot(e.vx, e.vz) };
  })();
  // l'élan du pas du saut : gv décroît pendant ce pas, puis 90 % passent en vitesse horizontale
  check(s3 && s3.vh > 0.85 * s3.g0 && s3.vh <= 0.9 * s3.g0 + 1e-9, `le saut garde 90 % de l'élan (${f2(s3.vh)} m/s pour ${f2(s3.g0)} m/s avant le pas)`);
}

titre('Couché : la place et la pente');
{
  // (MV est réutilisé d'un appel à l'autre : on lit refus aussitôt)
  const mur = corps(plat, 39.5, 0, EST); PC.deplacer(mur, V2(), DT, plat, RAFALE);
  const r1 = PC.deplacer(mur, V2({ couche: true }), DT, plat, RAFALE).refus, r1b = PC.deplacer(mur, V2({ couche: true }), DT, plat, RAFALE).refus;
  const loin = corps(plat, 38.5, 0, EST); PC.deplacer(loin, V2(), DT, plat, RAFALE); const r2 = PC.deplacer(loin, V2({ couche: true }), DT, plat, RAFALE).refus;
  check(r1 === 'couche' && r1b === null && mur.vers !== 'couche', `à 0,5 m d'un mur : refus { quoi: 'couche' }, une fois par appui (puis ${r1b})`);
  check(r2 === null && loin.vers === 'couche', 'à 1,5 m du mur : on se couche');
  const pente = corps(rampes[0.5], 0, 100, EST), rp = PC.deplacer(pente, V2({ couche: true }), DT, rampes[0.5], RAFALE).refus;
  const p30 = corps(rampes[0.3], 0, 100, EST), r30 = PC.deplacer(p30, V2({ couche: true }), DT, rampes[0.3], RAFALE).refus;
  check(rp === 'couche' && r30 === null && p30.vers === 'couche', 'refusé sur une pente de 50 %, accepté à 30 % (≤ 35 %)');
  const k = corps(plat, -150, 100, EST); for (let i = 0; i < 60; i++) PC.deplacer(k, V2({ couche: true }), DT, plat, RAFALE);
  const ks = PC.deplacer(k, V2({ couche: true, saut: true }), DT, plat, RAFALE);
  check(!ks.saut && k.vers === 'accroupi' && k.auSol, 'couché, sauter fait passer accroupi (pas de saut)');
}

titre('Capsules touchables (tête et corps pour chaque posture)');
{
  const cas = [];
  const vise = (e, h) => { const ox = e.x, oz = e.z - 10, dy = e.y + h - 1.6, l = Math.hypot(10, dy); return PC.rayon(ox, 1.6, oz, 0, dy / l, 10 / l, e, 50); };
  for (const [post, oeil, haut, tete] of [['debout', 1.6, 1.8, 0.35], ['accroupi', 1.05, 1.25, 0.32], ['glisse', 0.85, 1.0, 0.3]]) {
    const e = corps(plat, 0, 100, 0); e.corpsV2 = true; e.posture = e.vers = post; e.oeil = oeil; e.hautCapsule = haut; e.y = 0;
    const tb = vise(e, haut - tete / 2), tTete = PC.TOUCHE.tete, tc = vise(e, 0.6), tCorps = PC.TOUCHE.tete, tAu = vise(e, haut + 0.15);
    cas.push(`${post} ${tb >= 0 && tTete && tc >= 0 && !tCorps && tAu < 0 ? 'ok' : 'NON'}`);
  }
  // couché : vu de face (le regard de la cible vers le tireur) et de côté
  const k = corps(plat, 0, 100, Math.PI); k.corpsV2 = true; k.posture = k.vers = 'couche'; k.oeil = 0.42; k.hautCapsule = 0.55; k.y = 0; // regarde vers le sud (+z)
  const tf = PC.rayon(0, 0.3, 110, 0, 0, -1, k, 50), tfTete = PC.TOUCHE.tete; // depuis le sud, de face
  const tc = PC.rayon(10, 0.25, 100 - 0.2, -1, 0, 0, k, 50), tcTete = PC.TOUCHE.tete; // de côté, au milieu du corps
  const tHaut = PC.rayon(0, 0.9, 110, 0, 0, -1, k, 50); // au-dessus
  const cap = PC.capsule(k);
  cas.push(`couché ${tf >= 0 && tfTete && tc >= 0 && !tcTete && tHaut < 0 && Math.abs(cap.ay - 0.28) < 1e-9 && cap.r === 0.28 ? 'ok' : 'NON'}`);
  check(cas.every((c) => c.endsWith('ok')), 'tête et corps touchés, au-dessus manqué : ' + cas.join(', ') + ` (couché de face : t = ${f2(tf)} m, la tête)`);
  // le régime historique : capsule de 1,8 m (1,2 accroupi), tête = 35 cm, comme avant
  const h = corps(plat, 0, 100, 0); h.y = 0; h.accroupi = true;
  const th = vise(h, 1.2 - 0.12), thT = PC.TOUCHE.tete, th2 = vise(h, 1.5);
  check(th >= 0 && thT && th2 < 0 && PC.haut(h) === 1.2 && PC.oeil(h) === 1.0, 'régime historique : accroupi = capsule de 1,2 m, œil 1,0 m, tête 35 cm');
}

titre('Pas fixe : mêmes positions à 30, 60, 120 Hz et sur un téléphone (11 s)');
// horaires d'images (conception, § 1) : réguliers, et « téléphone » (60 Hz ± 1,5 ms, 12 % d'images de 33 ms, 2 % de 50 ms + une de 8 ms)
function horaire(nom, n, graine) {
  const rnd = R.mulberry32(graine || 12345), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (nom === '30') out[i] = 1 / 30; else if (nom === '60') out[i] = 1 / 60; else if (nom === '120') out[i] = 1 / 120;
    else if (nom === 'telephone') { const u = rnd(); if (u < 0.02) out[i] = 0.05; else if (u < 0.14) out[i] = 1 / 30; else if (u < 0.17) out[i] = 0.008; else out[i] = 1 / 60 + (rnd() - 0.5) * 0.003; }
    else if (nom === 'telephone120') { const u = rnd(); out[i] = u < 0.25 ? 1 / 60 : u < 0.3 ? 1 / 40 : 1 / 120 + (rnd() - 0.5) * 0.0015; }
  }
  return out;
}
const carteF = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
const carte = fs.existsSync(carteF) ? JSON.parse(fs.readFileSync(carteF, 'utf8')) : null;
{
  const monde = carte ? PM.creer(carte) : plat; monde.limite = null;
  const x0 = carte ? 92 : -150, z0 = carte ? -4 : 100;
  function commande(t) { // le programme de commandes de trace-pas.js (fonction du temps de simulation)
    const en = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null, yaw: 0 };
    if (t < 2) { en.avant = 1; en.yaw = 0.3; } else if (t < 3) { en.avant = 0; en.yaw = 0.3; }
    else if (t < 9) { en.avant = 1; en.cote = Math.sin(t * 3) > 0 ? 0.8 : -0.8; en.yaw = 1.2 + 0.8 * Math.sin(t * 0.7); }
    else { en.avant = 0.6; en.yaw = -2; en.saut = t > 9.5 && t < 9.52; }
    return en;
  }
  const res = {};
  for (const h of ['30', '60', '120', 'telephone', 'telephone120']) {
    const dts = horaire(h, 4000, 77), e = corps(monde, x0, z0, 0), boucle = PJ.pasFixe({ pas: 1 / 60, max: 4 }); let n = 0, alphaOk = true;
    const pas = (dt) => { if (n >= 660) return; PC.deplacer(e, commande(n * dt), dt, monde); n++; };
    for (let i = 0; i < dts.length && n < 660; i++) { const a = boucle.avancer(dts[i], pas); if (!(a >= 0 && a < 1)) alphaOk = false; }
    res[h] = { x: e.x, z: e.z, y: e.y, n, alphaOk };
  }
  const ref = res['120'], ecarts = Object.keys(res).map((h) => Math.hypot(res[h].x - ref.x, res[h].z - ref.z, res[h].y - ref.y));
  check(Object.values(res).every((r) => r.n === 660 && r.alphaOk) && Math.max(...ecarts) < 1e-9, `660 pas de 1/60 s à 30, 60, 120 Hz, téléphone et téléphone 120 Hz : écart max ${Math.max(...ecarts).toExponential(1)} m ; alpha dans [0 ; 1[`);
  const b = PJ.pasFixe({ pas: 1 / 60, max: 4 }); let np = 0; const al = b.avancer(1, () => np++);
  const b2 = PJ.pasFixe(); let np2 = 0; const a1 = b2.avancer(1 / 120, () => np2++), a2 = b2.avancer(1 / 120, () => np2++); b2.remettre(); const a3 = b2.avancer(1 / 240, () => np2++);
  check(np === 4 && al < 1e-9 && np2 === 1 && Math.abs(a1 - 0.5) < 1e-9 && a2 < 1e-6 && Math.abs(a3 - 0.25) < 1e-9, `une image de 1 s : 4 pas au plus (le reste est perdu) ; deux images de 1/120 s : un pas, alpha 0,5 puis 0 ; remettre()`);
}

// ─── les rues en pente du bourg (vraie carte) : décollages et caméra ───
if (carte) {
  const jeu = PJ.creer({ carte, monde: PM.creer(carte), mode: PA, graine: 7, options: { bots: 0 } });
  const monde = jeu.monde, nav = jeu.nav; monde.limite = null; // tout le bourg (pas seulement l'arène)
  const ROUTES = { 'place → église': [[100, 5], [86, 77], [58, 70]], 'église → place': [[58, 70], [86, 77], [100, 5]], '11 Novembre': [[231, -36], [159, 33], [111, 80]],
    'Mazet ↑': [[213, -18], [236, 3], [252, 27], [252, 55]], 'Mazet ↓': [[252, 55], [252, 27], [236, 3], [213, -18]], 'place, tour des façades': [[78, -6], [116, -8], [120, 13], [80, 9], [78, -6]] };
  const chemins = {};
  for (const [nom, pts] of Object.entries(ROUTES)) { const ch = []; for (let i = 0; i + 1 < pts.length; i++) for (const p of nav.chemin(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) || []) ch.push(p); chemins[nom] = ch; }
  const pilote = (chemin) => { let i = 0; return (e) => { while (i < chemin.length - 1 && Math.hypot(chemin[i][0] - e.x, chemin[i][1] - e.z) < 1.5) i++; const c = chemin[i], dx = c[0] - e.x, dz = c[1] - e.z; return { fin: i === chemin.length - 1 && Math.hypot(dx, dz) < 0.8, yaw: Math.atan2(-dx, -dz) }; }; };
  // un trajet au pas fixe de 1/60 s, images selon l'horaire ; à chaque image, ce que verrait le rendu (position interpolée) passe à la caméra
  function rouler(nom, allure, h, cam) {
    const ch = chemins[nom], pil = pilote(ch), a = nav.proche(ch[0][0], ch[0][1]);
    const e = corps(monde, a[0], a[1], pil({ x: a[0], z: a[1] }).yaw), boucle = PJ.pasFixe(), dts = horaire(h, 40000, 99), vue = { x: 0, y: 0, z: 0, auSol: true, vy: 0, accroupi: false, corpsV2: false, oeil: J.oeil, vers: 'debout', course: false, vise: 0 };
    let decol = 0, fin = false, n = 0, t = 0; const T = [], Y = [], OE = [];
    const pas = (dt) => {
      if (fin) return; const p = pil(e); if (p.fin) { fin = true; return; }
      e.ax = e.x; e.ay = e.y; e.az = e.z; e.aoeil = PC.oeil(e);
      const en = allure === 'marche' ? { avant: 1, cote: 0, yaw: p.yaw, pitch: 0 } : V2({ avant: 1, course: true, yaw: p.yaw, accroupi: allure === 'glisse' && (n % 150) >= 140 });
      const avant = e.auSol, mv = PC.deplacer(e, en, dt, monde); if (avant && !e.auSol && !mv.saut) decol++; n++;
    };
    for (let i = 0; i < dts.length && !fin; i++) {
      const al = boucle.avancer(dts[i], pas); t += dts[i]; if (!cam || n < 2) continue;
      vue.x = e.ax + (e.x - e.ax) * al; vue.y = e.ay + (e.y - e.ay) * al; vue.z = e.az + (e.z - e.az) * al; vue.auSol = e.auSol; vue.vy = e.vy; vue.accroupi = e.accroupi;
      const c = cam(vue, dts[i]); T.push(t); Y.push(c.y); OE.push(vue.y + J.oeil);
    }
    return { decol, n, T, Y, OE };
  }
  titre('Aucun décollage sans saut (6 trajets, à 5,2 et 7,0 m/s et en glissade)');
  {
    const lignes = []; let total = 0, pasTot = 0;
    for (const allure of ['marche', 'course', 'glisse']) { let d = 0; for (const nom of Object.keys(ROUTES)) { const r = rouler(nom, allure, '60'); d += r.decol; pasTot += r.n; } total += d; lignes.push(`${allure} ${d}`); }
    check(total === 0, `décollages : ${lignes.join(', ')} (${pasTot} pas)`);
  }
  titre('Caméra (PCORPS.camera) sur les rues en pente, à 5,2 m/s');
  {
    const reech = (t, v, f) => { const n = Math.floor((t[t.length - 1] - t[0]) * f), out = new Float64Array(n); let j = 0; for (let i = 0; i < n; i++) { const ti = t[0] + i / f; while (j < t.length - 2 && t[j + 1] < ti) j++; const u = (ti - t[j]) / Math.max(1e-9, t[j + 1] - t[j]); out[i] = v[j] + (v[j + 1] - v[j]) * Math.max(0, Math.min(1, u)); } return out; };
    const passeHaut = (s, f, w) => { const h = Math.max(1, Math.round(w * f / 2)), out = new Float64Array(s.length); let somme = 0, nb = 0; for (let i = 0; i <= Math.min(h, s.length - 1); i++) { somme += s[i]; nb++; } for (let i = 0; i < s.length; i++) { out[i] = s[i] - somme / nb; const en = i + h + 1, so = i - h; if (en < s.length) { somme += s[en]; nb++; } if (so >= 0) { somme -= s[so]; nb--; } } return out; };
    const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / Math.max(1, a.length)); };
    const freq = (s, f) => { let best = 0, bf = 0; for (let q = 0.5; q <= 15; q += 0.1) { let re = 0, im = 0; for (let i = 0; i < s.length; i++) { const a = TAU * q * i / f; re += s[i] * Math.cos(a); im += s[i] * Math.sin(a); } const p = re * re + im * im; if (p > best) { best = p; bf = q; } } return Math.round(bf * 10) / 10; };
    const acoups = (t, y, seuil) => { let n = 0, max = 0, vp = null; for (let i = 1; i < t.length; i++) { const v = (y[i] - y[i - 1]) / Math.max(1e-9, t[i] - t[i - 1]); if (vp !== null) { const d = Math.abs(v - vp); if (d > seuil) n++; if (d > max) max = d; } vp = v; } return { n, max }; };
    const F = 240, lignes = []; let okHP = true, okF = true, okAc = true, okEc = true;
    for (const nom of ['place → église', 'église → place', '11 Novembre', 'Mazet ↑', 'Mazet ↓']) {
      const mazet = nom.startsWith('Mazet');
      for (const h of ['60', 'telephone']) {
        const r = rouler(nom, 'marche', h, PC.camera()), hp = passeHaut(reech(r.T, r.Y, F), F, 0.5), hpRms = rms(hp);
        const s = rouler(nom, 'marche', h, PC.camera({ balancement: 'aucun' })); let ec = 0; for (let i = 0; i < s.Y.length; i++) ec = Math.max(ec, Math.abs(s.Y[i] - s.OE[i]));
        const bob = r.Y.map((y, i) => y - s.Y[i]), fq = freq(reech(r.T, bob, F).subarray(0, F * 8), F); // le balancement seul (même trajet, même horaire)
        const ac = acoups(s.T, s.Y, 0.25);
        if (hpRms > (mazet ? 0.015 : 0.010)) okHP = false;
        if (fq < 2 || fq > 3.5) okF = false;
        if (h === '60' && ac.n > (mazet ? 2 : 0)) okAc = false;
        if (ec > 0.035) okEc = false;
        lignes.push(`      ${(nom + ' (' + h + ')').padEnd(26)} passe-haut ${cm(hpRms)} rms, balancement à ${fq} Hz ; sans balancement : à-coups ${ac.n} (max ${f2(ac.max)} m/s), écart à l'œil ${cm(ec)}`);
      }
    }
    console.log(lignes.join('\n'));
    check(okHP, 'passe-haut 0,5 s ≤ 1,0 cm rms dans l\'arène, ≤ 1,5 cm rue du Mazet');
    check(okF, 'fréquence dominante du balancement entre 2 et 3,5 Hz');
    check(okAc, 'à-coups de vitesse verticale > 0,25 m/s à 60 Hz : 0 dans l\'arène, ≤ 2 rue du Mazet');
    check(okEc, 'écart de l\'œil lissé à l\'œil vrai ≤ 3,5 cm');
  }
} else console.log('\n── (pas de poncin/carte/poncin.json : trajets du bourg sautés)');

titre('Caméra : réglages, creux d\'atterrissage, aucune allocation');
{
  const e = { x: 0, y: 0, z: 0, auSol: true, vy: 0, accroupi: false }, cN = PC.camera(), cD = PC.camera({ balancement: 'doux' }), c0 = PC.camera({ balancement: 'aucun' });
  let mN = 0, mD = 0, m0 = 0;
  for (let i = 0; i < 300; i++) { e.z -= 5.2 * DT; mN = Math.max(mN, J.oeil - cN(e, DT).y); mD = Math.max(mD, J.oeil - cD(e, DT).y); m0 = Math.max(m0, Math.abs(J.oeil - c0(e, DT).y)); }
  check(Math.abs(mN - 0.012) < 0.002 && Math.abs(mD - 0.006) < 0.001 && m0 < 1e-6, `balancement normal ${cm(mN)}, doux ${cm(mD)}, aucun ${cm(m0)}`);
  const c = PC.camera(); const s = { x: 0, y: 2, z: 0, auSol: true, vy: 0, accroupi: false }; c(s, DT);
  s.auSol = false; s.vy = -6; c(s, DT); s.y = 0; s.auSol = true; s.vy = 0; let creux = 0; for (let i = 0; i < 60; i++) { const r = c(s, DT); creux = Math.min(creux, r.y - (s.y + J.oeil)); }
  const r = c(s, DT);
  check(creux < -0.05 && Math.abs(r.y - J.oeil) < 0.01, `atterrissage à 6 m/s : creux de ${cm(-creux)} (≤ 10 cm), résorbé en 1 s`);
  const o1 = c(s, DT), o2 = c(s, DT);
  check(o1 === o2, 'la caméra rend toujours le même objet (aucune allocation par image)');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
