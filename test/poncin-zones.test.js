#!/usr/bin/env node
// Opération Poncin — les zones de la carte (PZONES, zones.js) et la limite v2 (PMONDE.limiteDe ; conception du lot Gameplay, § 7, et
// décision du joueur : « rivières » = le Veyron dans le bourg et ses deux ponts). Pour chaque zone et chaque carte : durée de préparation
// (navigation comprise), apparitions (nombre, joignables, dans la limite, à 1 m des murs, espacement), objets (nombre du § 7, types
// tournants, loin des apparitions), aire joignable, chemins entre apparitions ; les ponts du Veyron ; la limite qui arrête les pas mais
// pas les tirs ; le hasard à part (même graine, même zone) ; le format réseau. Sortie « ok / FAIL ».
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PN = require('../src-poncin/nav.js'), PZ = require('../src-poncin/zones.js'), PC = require('../src-poncin/carte-provisoire.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const f1 = (v) => (Math.round(v * 10) / 10).toString(), ha = (m2) => (m2 / 1e4).toFixed(2) + ' ha';
const carteF = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
const cartes = [['carte provisoire', PC.creer(1), false]];
if (fs.existsSync(carteF)) cartes.push(['vraie carte', JSON.parse(fs.readFileSync(carteF, 'utf8')), true]);
const graine = 1, rndZone = (g) => R.mulberry32((g ^ 0x2F6E2B1) >>> 0);
const NAV = { pas: 1.5, marge: 0.45 };
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// les budgets de préparation sont ceux d'une machine au repos : quand d'autres tests tournent en même temps (charge > nombre de cœurs),
// ils suivent la charge
const cpu = (a) => (typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage(a) : process.cpuUsage(a)); // le temps de calcul du fil principal
const os = require('os'), CHARGE = Math.max(1, Math.min(3, os.loadavg()[0] / Math.max(1, os.cpus().length)));

titre('PMONDE.limiteDe : les formes');
{
  const c = PM.limiteDe({ forme: 'cercle', centre: [10, -5], rayon: 50 });
  check(c && c.v === 2 && c.forme === 'cercle' && c.rayon === 50 && c.centre[0] === 10 && c.n >= 24 && c.n <= 1500 && c.dedans(10, -5) && c.dedans(59, -5) && !c.dedans(61, -5) && !PM.limiteV2(c),
    `cercle : ${c.n} arêtes pour le dessin, dedans exact, chemin rapide de monde.js (pas une limite « v2 »)`);
  const u = PM.limiteDe({ forme: 'cercles', cercles: [[0, 0, 40], [60, 0, 40]] });
  const milieu = u.dedans(30, 0), trouDehors = !u.dedans(30, 40) && !u.dedans(30, -40);
  let dansLAutre = 0; for (let k = 0; k < u.n; k++) { const ax = u.aretes[4 * k], az = u.aretes[4 * k + 1]; if (Math.hypot(ax, az) < 40 - 0.05 && Math.hypot(ax - 60, az) < 40 - 0.05) dansLAutre++; }
  check(u && PM.limiteV2(u) && milieu && trouDehors && dansLAutre === 0 && Math.abs(u.rayon - 70) < 1e-9 && u.boite.join() === '-40,-40,100,40', `cercles : l'union (${u.n} arêtes, aucune dans l'intersection), boîte et cercle englobant`);
  const aireVraie = 2 * Math.PI * 1600 - 2 * (1600 * Math.acos(30 / 40) - 30 * Math.sqrt(700));
  check(Math.abs(u.distance(0, 0) - 40) < 0.1 && u.distance(-45, 0) < -4.9 && u.distance(-45, 0) > -5.1 && Math.abs(u.aire - aireVraie) / aireVraie < 0.03, `distance au bord signée (${f1(u.distance(0, 0))} dedans, ${f1(u.distance(-45, 0))} dehors) ; aire du masque à 3 % près (${Math.round(u.aire)} m² pour ${Math.round(aireVraie)})`);
  const p = PM.limiteDe({ forme: 'poly', p: [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]] }), q = PM.limiteDe({ forme: 'carre', centre: [0, 0], cote: 200 });
  check(p && p.n === 4 && p.dedans(50, 25) && !p.dedans(50, 55) && q && q.n === 4 && q.dedans(99, -99) && !q.dedans(101, 0) && Math.abs(q.distance(90, 0) - 10) < 1e-9 && q.pres(99.5, 0, 1) && !q.pres(98, 0, 1),
    'poly (point final répété enlevé) et carré : dedans, distance, pres');
  check([null, {}, { forme: 'cercles', cercles: [] }, { forme: 'poly', p: [[0, 0], [1, 1]] }, { forme: 'carre', centre: [0, 0], cote: 0 }, { forme: 'lune' }].every((x) => PM.limiteDe(x) === null), 'formes vides ou inconnues : null');
  const u2 = PM.limiteDe(JSON.parse(JSON.stringify(u.def)));
  check(u2.n === u.n && u2.aretes.every((v, i) => v === u.aretes[i]), 'le def voyage en JSON et redonne la même limite');
}

titre('La limite v2 dans le monde : elle arrête les pas, pas les tirs');
{
  const n = 41, carte = { v: 1, taille: 400, relief: { pas: 10, n, h: new Array(n * n).fill(0) }, batiments: [], rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], zones: { arene: { centre: [0, 0], rayon: 150 }, apparitions: [], armes: [] } };
  const m = PM.creer(carte), u = PM.limiteDe({ forme: 'cercles', cercles: [[-40, 0, 45], [20, 0, 45], [80, 0, 45]] });
  m.limite = u;
  check(m.bloque(0, 60, 0.35) && !m.bloque(0, 0, 0.35) && m.bloque(-40, 44.8, 0.35) && !m.passe(0, 0, 0, 80, 0.35) && m.passe(-40, 0, 80, 0, 0.35), 'bloque et passe : dehors et contre le bord, oui ; d\'un bout à l\'autre de l\'union, non');
  const rnd = R.mulberry32(5); let dehors = 0, coupe = 0, pas = 0, x = 0, z = 0;
  for (let i = 0; i < 6000; i++) {
    const a = rnd() * 2 * Math.PI, lg = 0.05 + rnd() * 1.2, r = m.deplacer(x, z, Math.cos(a) * lg, Math.sin(a) * lg, 0.35);
    if (!u.dedans(r[0], r[1]) || u.pres(r[0], r[1], 0.34)) dehors++;
    if (u.touche(x, z, r[0], r[1], 0)) coupe++;
    x = r[0]; z = r[1]; pas++;
    if (i % 500 === 0) { const q = m.libre(rnd); x = q[0]; z = q[1]; }
  }
  // poussé droit contre le bord, et dans le creux entre deux cercles (là où deux cordes se rejoignent)
  let xb = -40, zb = 0; for (let i = 0; i < 200; i++) { const r = m.deplacer(xb, zb, 0, 0.3, 0.35); xb = r[0]; zb = r[1]; }
  let xc = -10, zc = 0; for (let i = 0; i < 200; i++) { const r = m.deplacer(xc, zc, 0.05, 0.3, 0.35); xc = r[0]; zc = r[1]; }
  check(dehors === 0 && coupe === 0 && zb < 45 && zb > 44 && u.dedans(xc, zc) && !u.pres(xc, zc, 0.34), `${pas} pas au hasard : jamais dehors ni à travers une arête ; contre le bord : arrêté à ${f1(zb)} m ; dans le creux entre deux cercles : retenu (${f1(xc)}, ${f1(zc)})`);
  const h = m.rayon(0, 1.6, 0, 0, -0.015, 1, 150), vue = m.vue(0, 1.6, 0, 0, 1.6, 120);
  check(h && h.quoi === 'sol' && h.t > 90 && vue, `les tirs et les vues traversent la limite (le tir touche le ${h ? h.quoi + ' à ' + f1(h.t) + ' m' : 'vide'}, vue à 120 m)`);
  let ok = 0; for (let i = 0; i < 300; i++) { const q = m.libre(rnd); if (u.dedans(q[0], q[1]) && !u.pres(q[0], q[1], 1)) ok++; }
  check(ok === 300, 'monde.libre : 300 points tirés dans la boîte de la limite, tous dedans à 1 m du bord');
  const nav = PN.creer(m, NAV), ch = nav.chemin(-60, 0, 100, 0);
  check(nav.stats.principale * 2.25 > 0.85 * u.aire && ch && ch.every((q) => u.dedans(q[0], q[1])) && !nav.libre(0, 60) && nav.libre(20, 30), `la navigation suit la limite v2 (${ha(nav.stats.principale * 2.25)} joignables pour ${ha(u.aire)}) ; chemin d'un bout à l'autre, dedans`);
  m.limite = { centre: [0, 0], rayon: 30 }; const ch2 = nav.chemin(-20, 0, 20, 0);
  check(!nav.libre(-40, 0) && ch2 && ch2.length >= 2, 'la navigation revient à un cercle simple quand la limite change');
}

const mesures = [];
for (const [nom, carte, vraie] of cartes) {
  titre(`'centre' sur la ${nom} (l'arène d'avant, telle quelle)`);
  {
    const monde = PM.creer(carte), z = PZ.preparer(carte, monde, null, 'centre', rndZone(graine)), Z = carte.zones;
    check(z.id === 'centre' && !z.avertissement && z.limite.rayon === Z.arene.rayon && z.limite.centre[0] === Z.arene.centre[0] && z.limite.centre[1] === Z.arene.centre[1] && z.englobant.rayon === Z.arene.rayon && monde.limite === z.limite && z.limite.forme === 'cercle', `limite = zones.arene (${Z.arene.centre.map(Math.round)}, r ${Z.arene.rayon}), posée sur monde.limite (forme 'cercle' : le chemin rapide)`);
    check(z.apparitions.length === Z.apparitions.length && z.apparitions.every((p, i) => p[0] === Z.apparitions[i][0] && p[1] === Z.apparitions[i][1]), `les ${z.apparitions.length} apparitions de la carte, telles quelles`);
    check(z.objets.length === Z.armes.length && z.objets.every((o, i) => o[0] === Z.armes[i].x && o[1] === Z.armes[i].z && o[2] === Z.armes[i].arme), `les ${z.objets.length} objets de la carte, au format [x, z, objet]`);
    check(Math.abs(PZ.distanceReapparition(z) - Math.max(15, Math.min(60, 0.32 * Z.arene.rayon))) < 1e-9 && z.aire > 0 && z.aire < Math.PI * Z.arene.rayon ** 2, `distance de réapparition ${f1(PZ.distanceReapparition(z))} m ; ${ha(z.aire)} joignables`);
    z.apparitions[0][0] = 1e9; check(Z.apparitions[0][0] !== 1e9, 'des copies : la carte n\'est pas modifiée');
  }

  titre(`Les six zones sur la ${nom}`);
  // une préparation de chauffe, non comptée : la première compile tout le code de la préparation (le JIT de V8), quelle que soit la zone
  PZ.preparer(carte, PM.creer(carte), null, R.SALON.zones[0], rndZone(graine), { armes: R.DEFAUT_REGLAGES.armes });
  for (const id of R.SALON.zones) {
    // un monde neuf : la navigation est construite dans la préparation (comptée dans le temps) ; le temps de calcul du fil principal
    // (process.threadCpuUsage : ni les fils du ramasse-miettes et du compilateur de V8, ni les autres tests qui tournent en même temps sur
    // la machine ; process.cpuUsage, tout le processus, sur un Node qui ne l'a pas), le meilleur de trois préparations
    let monde = null, z = null, ms = Infinity;
    for (let essai = 0; essai < 3; essai++) {
      monde = PM.creer(carte); const c0 = cpu();
      z = PZ.preparer(carte, monde, null, id, rndZone(graine), { armes: R.DEFAUT_REGLAGES.armes });
      const c = cpu(c0); ms = Math.min(ms, (c.user + c.system) / 1000);
    }
    const budget = (id === 'tout' || id === 'rivieres' ? 500 : 150) * CHARGE;
    const nav = PN.creer(monde, NAV), lim = z.limite;
    const esp = id === 'centre' ? 0 : id === 'place' ? 14 : 18;
    let espMin = Infinity; for (let i = 0; i < z.apparitions.length; i++) for (let j = i + 1; j < z.apparitions.length; j++) espMin = Math.min(espMin, d(z.apparitions[i], z.apparitions[j]));
    const dansZone = z.apparitions.every((p) => lim.dedans(p[0], p[1])), joignables = z.apparitions.filter((p) => nav.accessible(p[0], p[1])).length, murs = z.apparitions.every((p) => !monde.bloque(p[0], p[1], id === 'centre' ? 0.6 : 1));
    mesures.push([nom, id, ms, z]);
    check(z.id === id && !z.avertissement && z.nom === PZ.NOMS[id] && ms <= budget && lim.n <= 1500, `${id} « ${z.nom} » : ${f1(ms)} ms de calcul (≤ ${Math.round(budget)}${CHARGE > 1 ? ', charge × ' + CHARGE.toFixed(2) : ''}, navigation comprise), limite '${lim.forme}' de ${lim.n} arêtes, englobant r ${f1(z.englobant.rayon)} m`);
    // ('centre' : celles de la carte, telles quelles ; sur la vraie carte, une est dans une cour que la navigation ne joint pas)
    const tous = id === 'centre' ? joignables >= z.apparitions.length - 1 : joignables === z.apparitions.length;
    check(z.apparitions.length >= 12 && z.apparitions.length <= 180 && dansZone && tous && murs && espMin >= esp - 1e-6,
      `${id} : ${z.apparitions.length} apparitions (12 à 180), dans la limite, ${joignables === z.apparitions.length ? 'toutes' : joignables} joignables, à 1 m des murs, espacées de ${f1(espMin)} m (≥ ${esp})`);
    const nObj = id === 'centre' ? carte.zones.armes.length : Math.max(4, Math.min(16, Math.round(z.aire / 2500)));
    const loin = id === 'centre' ? Infinity : Math.min(...z.objets.map((o) => Math.min(...z.apparitions.map((p) => d(o, p)))));
    const types = id === 'centre' || z.objets.every((o, i) => o[2] === ['soin', 'armure', 'munitions'][i % 4] || (i % 4 === 3 && R.OBJETS[o[2]] && R.OBJETS[o[2]].type === 'arme'));
    const objJ = z.objets.filter((o) => nav.accessible(o[0], o[1])).length;
    check(z.objets.length === nObj && types && z.objets.every((o) => lim.dedans(o[0], o[1])) && (id === 'centre' ? objJ >= nObj - 1 : objJ === nObj && loin >= 6),
      `${id} : ${z.objets.length} objets (clamp(arrondi(${ha(z.aire)} / 2500 m²), 4, 16) = ${nObj}), soin / armure / munitions / arme à tour de rôle, joignables, à ${id === 'centre' ? '—' : f1(loin)} m au moins des apparitions`);
    // des chemins entre 10 paires d'apparitions tirées au hasard
    const rnd = R.mulberry32(9), app = z.apparitions.filter((p) => nav.accessible(p[0], p[1])); let chemins = 0;
    for (let k = 0; k < 10; k++) { const a = app[Math.floor(rnd() * app.length)], b = app[Math.floor(rnd() * app.length)]; const c = nav.chemin(a[0], a[1], b[0], b[1]); if (c && c.length >= 1 && d(c[c.length - 1], b) < 0.01 && c.every((p) => lim.dedans(p[0], p[1]))) chemins++; }
    check(chemins === 10, `${id} : un chemin dans la zone entre 10 paires d'apparitions (${chemins}/10)`);
  }

  if (vraie) {
    titre('Les mesures sur la vraie carte (aire joignable)');
    const A = Object.fromEntries(mesures.filter((m) => m[0] === nom).map((m) => [m[1], m[3]]));
    const seuils = { place: [0.25, 0.6], centre: [1.6, 2.3], eglise: [0.5, 1.2], bourg: [6.5, 9], rivieres: [2, 4.5], tout: [40, 50] };
    for (const id of R.SALON.zones) { const a = A[id].aire / 1e4, [lo, hi] = seuils[id]; check(a >= lo && a <= hi, `${id} : ${ha(A[id].aire)} joignables (attendu ${lo} à ${hi} ha ; conception : place 0,33, centre 1,88, église 0,8, bourg 7,56, tout 45)`); }

    titre('« Le Veyron » : le Veyron dans le bourg et ses deux ponts');
    const monde = PM.creer(carte), z = PZ.preparer(carte, monde, null, 'rivieres', rndZone(graine)), nav = PN.creer(monde, NAV), lim = z.limite;
    const ve = carte.eau.find((e) => /veyron/i.test(e.n || '')), ponts = carte.ponts.map((p) => [(p.l[0][0] + p.l[1][0]) / 2, (p.l[0][1] + p.l[1][1]) / 2]);
    check(lim.forme === 'cercles' && PM.limiteV2(lim) && lim.cercles.length >= 15 && ponts.length === 2, `une union de ${lim.cercles.length} cercles de 45 m sur les berges (${lim.n} arêtes)`);
    const tetes = carte.ponts.flatMap((p) => [p.l[0], p.l[1]]);
    check(ponts.every((p) => lim.dedans(p[0], p[1]) && nav.accessible(p[0], p[1])) && tetes.every((t) => lim.dedans(t[0], t[1])), `les deux ponts (${ponts.map((p) => p.map(Math.round).join(' ; ')).join(' et ')}) dans la zone, leurs tabliers joignables`);
    // les deux rives : un point est « au sud » si la demi-droite vers le nord coupe le bord du Veyron un nombre impair de fois… deux fois
    // ici (la rivière file d'est en ouest) : on compte les coupures au nord du point
    const coupures = (p) => { let n = 0; const P = ve.p; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[0] > p[0]) !== (b[0] > p[0])) { const zc = a[1] + (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0]); if (zc < p[1]) n++; } } return n; };
    const entre = z.apparitions.filter((p) => p[0] > ponts[0][0] + 10 && p[0] < ponts[1][0] - 10); // entre les deux ponts : la rivière file d'est en ouest
    const S = entre.filter((p) => coupures(p) === 2), N = entre.filter((p) => coupures(p) === 0);
    check(S.length >= 8 && N.length >= 8, `des apparitions sur les deux rives entre les ponts (${N.length} au nord, ${S.length} au sud)`);
    let parPont = 0, trouves = 0; const rnd = R.mulberry32(4);
    for (let k = 0; k < 12; k++) {
      const a = N[Math.floor(rnd() * N.length)], b = S[Math.floor(rnd() * S.length)], c = nav.chemin(a[0], a[1], b[0], b[1]);
      if (!c) continue; trouves++;
      let pont = false;
      for (let i = 1; i < c.length && !pont; i++) for (const q of ponts) { const ex = c[i][0] - c[i - 1][0], ez = c[i][1] - c[i - 1][1], l2 = ex * ex + ez * ez || 1; let t = ((q[0] - c[i - 1][0]) * ex + (q[1] - c[i - 1][1]) * ez) / l2; t = Math.max(0, Math.min(1, t)); if (Math.hypot(c[i - 1][0] + ex * t - q[0], c[i - 1][1] + ez * t - q[1]) < 6) pont = true; }
      if (pont) parPont++;
    }
    check(trouves === 12 && parPont === 12, `d'une rive à l'autre : ${trouves}/12 chemins, ${parPont} par un pont`);
    const p0 = z.apparitions[0]; let x = p0[0], zz = p0[1], sorti = false;
    for (let i = 0; i < 3000; i++) { const a = i * 0.37, r = monde.deplacer(x, zz, Math.cos(a) * 0.5 + 0.2, Math.sin(a) * 0.5 + 0.3, 0.35); x = r[0]; zz = r[1]; if (!lim.dedans(x, zz)) sorti = true; }
    check(!sorti, 'on ne sort jamais de la zone en marchant (3000 pas poussés vers le sud-est)');
  }
}

titre('Le hasard à part et le format réseau');
{
  const carte = cartes[cartes.length - 1][1];
  const m1 = PM.creer(carte), m2 = PM.creer(carte);
  const a = PZ.preparer(carte, m1, null, 'eglise', rndZone(42)), b = PZ.preparer(carte, m2, null, 'eglise', rndZone(42)), c = PZ.preparer(carte, m2, null, 'eglise', rndZone(43));
  check(JSON.stringify(PZ.pourReseau(a)) === JSON.stringify(PZ.pourReseau(b)) && JSON.stringify(a.apparitions) !== JSON.stringify(c.apparitions), 'même graine : la même zone (deux mondes neufs) ; autre graine : d\'autres apparitions');
  const m3 = PM.creer(carte); PZ.preparer(carte, m3, null, 'tout', rndZone(1)); const d2 = PZ.preparer(carte, m3, null, 'eglise', rndZone(42));
  check(JSON.stringify(PZ.pourReseau(d2)) === JSON.stringify(PZ.pourReseau(a)), 'une navigation déjà en cache (préparée pour « tout ») donne la même zone');
  const z = PZ.preparer(carte, PM.creer(carte), null, 'rivieres', rndZone(7)), txt = JSON.stringify(PZ.pourReseau(z));
  const m4 = PM.creer(carte), z2 = PZ.adopter(JSON.parse(txt), m4);
  const rnd = R.mulberry32(1); let pareil = 0; for (let i = 0; i < 2000; i++) { const x = -300 + 600 * rnd(), y = -300 + 600 * rnd(); if (z.limite.dedans(x, y) === z2.limite.dedans(x, y)) pareil++; }
  check(z2 && z2.id === 'rivieres' && m4.limite === z2.limite && z2.limite.n === z.limite.n && pareil === 2000 && z2.apparitions.length === z.apparitions.length && z2.objets.length === z.objets.length && txt.length < 8000,
    `pourReseau / adopter : la zone en JSON (${txt.length} o), la limite reconstruite depuis son def, posée sur le monde`);
  check(PZ.adopter(null) === null && PZ.adopter({ id: 'place', limite: { forme: 'lune' } }) === null, 'adopter : une zone inutilisable → null');
  const armes = PZ.preparer(carte, PM.creer(carte), null, 'bourg', rndZone(3), { armes: ['m4', 'awm', 'm1911'] }).objets.filter((o) => R.OBJETS[o[2]].type === 'arme').map((o) => o[2]);
  check(armes.length >= 3 && armes.every((a2) => a2 === 'm4' || a2 === 'awm'), `les armes au sol : seulement les principales permises (${armes.join(', ')})`);
}

titre('Zones inconnues ou impossibles');
{
  const carte = cartes[cartes.length - 1][1];
  const x = PZ.preparer(carte, PM.creer(carte), null, 'lune', rndZone(1));
  check(x.id === 'centre' && x.demande === 'lune' && x.avertissement, 'une zone inconnue : « centre », avec un avertissement');
  const sansMonde = PZ.preparer(carte, null, null, 'bourg', rndZone(1));
  check(sansMonde.id === 'centre' && sansMonde.avertissement, 'sans monde : « centre », avec un avertissement');
  const sec = Object.assign({}, carte, { eau: [], ponts: [] }), r = PZ.preparer(sec, PM.creer(sec), null, 'rivieres', rndZone(1));
  check(r.id === 'centre' && /introuvable/.test(r.avertissement), 'une carte sans rivière : « rivieres » retombe sur « centre », avec un avertissement');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
