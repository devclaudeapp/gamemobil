#!/usr/bin/env node
// Opération Poncin — la simulation d'une partie (PJEU), les robots (PBOTS) et le mode Arène (PARENE). Un terrain plat synthétique pour
// la balistique (portée, dispersion, chute de dégâts, tête, pompe, cadence, recharge, armure), puis la carte provisoire (PCARTEPROV)
// pour les murs, la mort et la réapparition, les objets, l'aide à la visée, 30 parties de robots complètes, la rejouabilité et le temps ;
// la vraie carte de Poncin si elle est là. Sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PN = require('../src-poncin/nav.js');
const PJ = require('../src-poncin/jeu.js'), PB = require('../src-poncin/bots.js'), PA = require('../src-poncin/arene.js'), PC = require('../src-poncin/carte-provisoire.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const f2 = (v) => (Math.round(v * 100) / 100).toString(), deg = (r) => f2(r * 180 / Math.PI) + '°';
const J = R.JOUEUR, DT = 1 / 60;
const NUL = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null };
const entree = (o) => Object.assign({}, NUL, o || {});
const finiNb = (v) => typeof v === 'number' && Number.isFinite(v);

// ─── un terrain plat de 400 m, deux maisons, des objets (pour la balistique) ───
function cartePlate() {
  const n = 41, h = new Array(n * n).fill(0);
  return {
    v: 1, nom: 'Plat', source: 'test', taille: 400, relief: { pas: 10, n, h },
    batiments: [{ p: [[40, -10], [50, -10], [50, 10], [40, 10]], h: 8, t: 'maison' }, { p: [[-60, 40], [-50, 40], [-50, 50], [-60, 50]], h: 6, t: 'maison' }],
    rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], sol: null,
    zones: { arene: { centre: [0, 0], rayon: 190 }, apparitions: [[-120, -120], [120, -120], [-120, 120], [120, 120], [0, 160], [0, -160], [160, 0], [-160, 0], [70, 70], [-70, -70], [70, -70], [-70, 70], [300, 0]],
      armes: [{ x: 20, z: 20, arme: 'soin' }, { x: -20, z: 20, arme: 'armure' }, { x: 20, z: -20, arme: 'pompe' }, { x: -20, z: -20, arme: 'precision' }], extraction: [], base: [0, 0] },
  };
}
const mondePlat = PM.creer(cartePlate()), cartePl = cartePlate();
// une partie d'essai sans robots, avec des humains placés à la main
function partie(monde, carte, ids, opts) {
  const jeu = PJ.creer({ monde, carte, mode: PA, graine: (opts && opts.graine) || 1, options: Object.assign({ bots: 0 }, opts || {}) });
  const es = ids.map((id) => jeu.ajouterJoueur({ id, nom: id, humain: true, equipe: opts && opts.equipesDe ? opts.equipesDe[id] : undefined }));
  for (const e of es) e.invincible = 0;
  return { jeu, es };
}
function poser(jeu, e, x, z, yaw) { e.x = x; e.z = z; e.y = jeu.monde.hauteur(x, z); e.vx = e.vz = e.vy = 0; e.auSol = true; if (yaw != null) e.yaw = yaw; e.pitch = 0; e.gonfle = 0; e.prochainTir = 0; e.invincible = 0; }
function viserSur(e, c, hauteur) { const dx = c.x - e.x, dz = c.z - e.z, dy = c.y + hauteur - (e.y + (e.accroupi ? J.oeilAccroupi : J.oeil)); e.yaw = Math.atan2(-dx, -dz); e.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
function cible(jeu, e, x, z) { poser(jeu, e, x, z); e.vivant = true; e.vie = 100; e.armure = 0; e.accroupi = false; }
function donner(e, arme) { const A = R.arme(arme); if (e.armes.indexOf(arme) < 0) e.armes.push(arme); e.arme = arme; e.munitions[arme] = A.chargeur; e.reserve[arme] = A.reserve; e.enRecharge = false; e.rechargeJusqua = 0; e.prochainTir = 0; }
function pas(jeu, n, entrees, surEvs) { for (let i = 0; i < n; i++) { const evs = jeu.etape(DT, entrees); if (surEvs) for (const v of evs) surEvs(v); } }
const evsDe = (jeu, n, entrees) => { const out = []; pas(jeu, n, entrees, (v) => out.push(v)); return out; };

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
titre('Création, joueurs, API');
{
  const { jeu, es } = partie(mondePlat, cartePl, ['a', 'b']);
  const a = es[0];
  check(typeof jeu.etape === 'function' && typeof jeu.ajouterJoueur === 'function' && typeof jeu.classement === 'function' && typeof jeu.aideVisee === 'function' && Array.isArray(jeu.entites) && jeu.temps === 0 && jeu.fini === false, 'PJEU.creer → etape, ajouterJoueur, entites, temps, fini, classement, aideVisee');
  const champs = ['id', 'nom', 'couleur', 'equipe', 'humain', 'bot', 'x', 'y', 'z', 'vy', 'yaw', 'pitch', 'auSol', 'accroupi', 'vie', 'armure', 'vivant', 'mortDepuis', 'invincible', 'arme', 'armes', 'munitions', 'reserve', 'rechargeJusqua', 'prochainTir', 'score', 'serie'];
  check(champs.every((k) => k in a) && a.arme === 'rafale' && a.armes.join() === 'rafale' && a.munitions.rafale === 30 && a.reserve.rafale === R.arme('rafale').reserve && a.score.kills === 0 && a.score.points === 0 && a.vie === 100 && a.armure === 0, 'entité au format du contrat (rafale 30 + réserve ' + R.arme('rafale').reserve + ', vie 100)');
  check(jeu.ajouterJoueur({ id: 'a' }) === a && jeu.entites.length === 2, 'ajouter deux fois le même id rend la même entité');
  check(Math.abs(jeu.monde.limite.rayon - 190) < 1e-9 && jeu.duree === 180 && jeu.reste === 180 && jeu.mode === PA && jeu.options.bots === 0, 'Arène : monde.limite = zones.arene, durée 180 s');
  const evs = jeu.etape(DT, {}); const evs2 = jeu.etape(DT, {});
  check(evs === evs2 && Array.isArray(evs), 'le tableau d\'événements est réutilisé d\'une image à l\'autre');
  const j2 = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 5, options: { bots: 4, niveau: 'fort', equipes: true } });
  const moi = j2.ajouterJoueur({ id: 'moi', nom: 'Toi', couleur: '#FFC84A', equipe: 0, humain: true });
  const eq = [0, 1].map((k) => j2.entites.filter((e) => e.equipe === k).length);
  check(j2.entites.filter((e) => e.bot).length === 4 && j2.entites.every((e) => !e.bot || e.niveau === 'fort') && eq[0] === 3 && eq[1] === 2 && moi.equipe === 0, `2 contre 2 : robots répartis (équipe 0 : ${eq[0]}, équipe 1 : ${eq[1]}), niveau transmis`);
  const j3 = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 5, options: { bots: 3 } });
  const m3 = j3.ajouterJoueur({ id: 'moi', nom: 'Toi', equipe: 'moi', humain: true });
  check(new Set(j3.entites.map((e) => e.equipe)).size === 4 && new Set(j3.entites.map((e) => e.nom)).size === 4 && m3.equipe === 'moi', 'chacun pour soi : une équipe par joueur, noms des robots différents');
  check(j3.entites.every((e) => !mondePlat.bloque(e.x, e.z, J.rayon)) && new Set(j3.entites.map((e) => e.x + ',' + e.z)).size === 4, 'apparitions libres et distinctes');
}

titre('Déplacements');
{
  const { jeu, es: [a] } = partie(mondePlat, cartePl, ['a']);
  poser(jeu, a, 0, 100, 0); // regarde vers le nord (−z)
  pas(jeu, 120, { a: entree({ avant: 1 }) });
  check(Math.abs(a.x) < 1e-6 && Math.abs(-(a.z - 100) - J.vitesse * 2) < 0.5 && Math.abs(a.vitesse - J.vitesse) < 0.01, `avant : ${f2(100 - a.z)} m en 2 s vers le nord (vitesse ${f2(a.vitesse)} m/s)`);
  poser(jeu, a, 0, 100, Math.PI / 2); // regarde vers l'ouest
  pas(jeu, 60, { a: entree({ cote: 1 }) });
  check(a.z < 100 - J.vitesse + 0.4 && Math.abs(a.x) < 1e-6, `côté droit en regardant à l'ouest : vers le nord (${f2(100 - a.z)} m en 1 s)`);
  poser(jeu, a, 0, 100, 0); pas(jeu, 60, { a: entree({ avant: -1 }) });
  check(Math.abs(a.vitesse - J.vitesse * J.vitesseRecul) < 0.01, `à reculons : ${f2(a.vitesse)} m/s (×${J.vitesseRecul})`);
  poser(jeu, a, 0, 100, 0); pas(jeu, 60, { a: entree({ avant: 1, accroupi: true }) });
  check(Math.abs(a.vitesse - J.vitesseAccroupi) < 0.01 && a.accroupi, `accroupi : ${f2(a.vitesse)} m/s`);
  poser(jeu, a, 0, 100, 0); pas(jeu, 60, { a: entree({ avant: 1, cote: 1 }) });
  check(Math.abs(a.vitesse - J.vitesse) < 0.01, 'en diagonale, pas plus vite');
  // le saut
  poser(jeu, a, 0, 100, 0);
  let hMax = 0, tAir = 0, sauts = 0, atterri = -1;
  for (let i = 0; i < 90; i++) { const evs = jeu.etape(DT, { a: entree({ saut: i === 0 }) }); sauts += evs.filter((v) => v.t === 'saut').length; hMax = Math.max(hMax, a.y); if (!a.auSol) tAir += DT; else if (i > 0 && atterri < 0) atterri = i; }
  const hTh = J.saut * J.saut / (2 * J.gravite), tTh = 2 * J.saut / J.gravite;
  check(sauts === 1 && Math.abs(hMax - hTh) < 0.04 && Math.abs(tAir - tTh) < 0.04 && a.auSol && a.y === 0, `saut : ${f2(hMax)} m (théorie ${f2(hTh)}), ${f2(tAir)} s en l'air (${f2(tTh)}), un événement « saut », retombé au sol`);
  // on ne resaute pas en l'air
  poser(jeu, a, 0, 100, 0); let n2 = 0; for (let i = 0; i < 30; i++) n2 += jeu.etape(DT, { a: entree({ saut: true }) }).filter((v) => v.t === 'saut').length;
  check(n2 === 1, 'pas de double saut (saut tenu)');
  // la gravité : lâché à 3 m
  poser(jeu, a, 0, 100, 0); a.y = 3; a.auSol = false;
  let tChute = 0; while (!a.auSol && tChute < 3) { jeu.etape(DT, {}); tChute += DT; }
  check(Math.abs(tChute - Math.sqrt(2 * 3 / J.gravite)) < 0.04 && a.y === 0, `chute de 3 m en ${f2(tChute)} s (théorie ${f2(Math.sqrt(6 / J.gravite))})`);
  // les pas
  poser(jeu, a, 0, 100, 0); let nPas = 0; pas(jeu, 120, { a: entree({ avant: 1 }) }, (v) => { if (v.t === 'pas') nPas++; });
  let nPasAcc = 0; poser(jeu, a, 0, 100, 0); pas(jeu, 120, { a: entree({ avant: 1, accroupi: true }) }, (v) => { if (v.t === 'pas') nPasAcc++; });
  check(nPas >= 5 && nPas <= 7 && nPasAcc === 0, `événements « pas » : ${nPas} en 10 m debout, ${nPasAcc} accroupi (discret)`);
  // contre une maison : on glisse, on ne traverse pas
  poser(jeu, a, 30, 0, -Math.PI / 2); // regarde vers l'est, la maison [40, 50] × [−10, 10]
  let dedansJamais = true; for (let i = 0; i < 240; i++) { jeu.etape(DT, { a: entree({ avant: 1 }) }); if (mondePlat.dedans(a.x, a.z) || a.x > 40 - J.rayon + 1e-3) dedansJamais = false; }
  check(dedansJamais && Math.abs(a.x - (40 - J.rayon)) < 0.01, `contre un mur : arrêté à ${f2(40 - a.x)} m du mur (rayon ${J.rayon})`);
  poser(jeu, a, 30, 0, -Math.PI / 2 + 0.5); let xMur = 0, zMur = 0;
  for (let i = 0; i < 380; i++) { jeu.etape(DT, { a: entree({ avant: 1 }) }); if (i === 200) { xMur = a.x; zMur = a.z; } }
  check(Math.abs(xMur - (40 - J.rayon)) < 1e-3 && zMur < -6 && a.z < -10.3 && a.x > 41 && !mondePlat.dedans(a.x, a.z), `en biais contre le mur : on glisse le long (${f2(xMur)}, ${f2(zMur)}), puis on contourne le coin (${f2(a.x)}, ${f2(a.z)})`);
  // la limite de l'arène : un mur invisible
  poser(jeu, a, 0, -180, 0); for (let i = 0; i < 240; i++) jeu.etape(DT, { a: entree({ avant: 1 }) });
  check(Math.hypot(a.x, a.z) <= 190 - J.rayon + 1e-3, `mur invisible au bord de l'arène (${f2(Math.hypot(a.x, a.z))} m du centre)`);
}

titre('Déplacements sur la carte provisoire : jamais à travers un mur');
const carteP = PC.creer(), mondeP = PM.creer(carteP);
{
  const { jeu, es: [a] } = partie(mondeP, carteP, ['a']);
  const rnd = R.mulberry32(42); let traverse = 0, dedans = 0, nan = 0, essais = 0, metres = 0;
  for (let k = 0; k < 120; k++) {
    const p = mondeP.libre(rnd); poser(jeu, a, p[0], p[1], rnd() * 6.28);
    const e = entree({ avant: rnd() * 2 - 1, cote: rnd() * 2 - 1 });
    for (let i = 0; i < 120; i++) {
      const x0 = a.x, z0 = a.z; e.dyaw = (rnd() - 0.5) * 0.2; e.saut = rnd() < 0.02; e.accroupi = rnd() < 0.1;
      jeu.etape(DT, { a: e }); essais++; metres += Math.hypot(a.x - x0, a.z - z0);
      if (!finiNb(a.x) || !finiNb(a.y) || !finiNb(a.z)) nan++;
      if (mondeP.dedans(a.x, a.z) || mondeP.bloque(a.x, a.z, J.rayon - 0.01)) dedans++;
      if (!mondeP.passe(x0, z0, a.x, a.z, 0.01)) traverse++;
    }
  }
  check(traverse === 0 && dedans === 0 && nan === 0, `${essais} pas au hasard (${Math.round(metres)} m) contre les murs du bourg : 0 traversée, 0 position dans un mur, 0 NaN`);
  // le relief : les pieds suivent le sol
  const p = mondeP.libre(rnd); poser(jeu, a, p[0], p[1], 1); let ecart = 0;
  for (let i = 0; i < 300; i++) { jeu.etape(DT, { a: entree({ avant: 1, dyaw: 0.01 }) }); if (a.auSol) ecart = Math.max(ecart, Math.abs(a.y - mondeP.hauteur(a.x, a.z))); }
  check(ecart < 1e-9, 'au sol, les pieds suivent le relief (monde.hauteur)');
}
{ // un talus trop raide ne se monte pas, une pente douce si (relief au pas de 2 m)
  const n = 51, h = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -50 + i * 2; h.push(x < 0 ? 0 : x < 2 ? 4 : 4 + (x - 2) * 0.5); }
  const c = { v: 1, taille: 100, relief: { pas: 2, n, h }, batiments: [], zones: { arene: { centre: [0, 0], rayon: 49 }, apparitions: [[-20, 0]], armes: [] } };
  const m = PM.creer(c), { jeu, es: [a] } = partie(m, c, ['a']);
  poser(jeu, a, -3, 0, -Math.PI / 2); pas(jeu, 120, { a: entree({ avant: 1 }) });
  check(a.x < 0.05 && a.y < 0.5, `talus de pente 2 (4 m sur 2 m) : bloqué au pied (x = ${f2(a.x)})`);
  poser(jeu, a, 3, 0, -Math.PI / 2); pas(jeu, 120, { a: entree({ avant: 1 }) });
  check(a.x > 10 && Math.abs(a.y - m.hauteur(a.x, a.z)) < 1e-9, `pente de 0,5 : on la monte (x = ${f2(a.x)}, y = ${f2(a.y)})`);
  poser(jeu, a, 1.9, 0, Math.PI / 2); pas(jeu, 60, { a: entree({ avant: 1 }) });
  check(a.x < 0 && a.auSol, 'on redescend du talus');
}

titre('Tirs : portée, dispersion, chute de dégâts, tête, pompe, cadence, recharge, armure');
{
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  // portée du long-tir
  const P = R.arme('precision');
  poser(jeu, a, 0, 170, 0); donner(a, 'precision'); poser(jeu, b, 0, 170 - (P.portee - 2)); viserSur(a, b, 1.1);
  let evs = evsDe(jeu, 1, { a: entree({ tir: true }) });
  const t1 = evs.find((v) => v.t === 'tir'), h1 = evs.find((v) => v.t === 'touche');
  check(t1 && h1 && h1.a === 'b' && h1.degats === R.degatsA(P, Math.hypot(t1.fin[0] - t1.o[0], t1.fin[1] - t1.o[1], t1.fin[2] - t1.o[2]), false) && t1.impact && t1.impact.quoi === 'entite' && t1.impact.id === 'b',
    `long-tir à ${P.portee - 2} m : touché, ${h1 ? h1.degats : '?'} dégâts (= degatsA), impact sur l'entité`);
  b.vie = 100; poser(jeu, a, 0, 170, 0); donner(a, 'precision'); poser(jeu, b, 0, 170 - (P.portee + 2)); viserSur(a, b, 1.1);
  evs = evsDe(jeu, 1, { a: entree({ tir: true }) });
  const t2 = evs.find((v) => v.t === 'tir');
  check(t2 && !evs.some((v) => v.t === 'touche') && Math.abs(Math.hypot(t2.fin[0] - t2.o[0], t2.fin[1] - t2.o[1], t2.fin[2] - t2.o[2]) - P.portee) < 1e-6 && t2.impact === null, `à ${P.portee + 2} m : hors de portée, le tir s'arrête à ${P.portee} m`);
  // portée du blaster : jamais touché à 72 m
  const A = R.arme('rafale');
  poser(jeu, a, 0, 100, 0); donner(a, 'rafale'); poser(jeu, b, 0, 100 - (A.portee + 2)); b.vie = 100;
  let touches = 0, tirs = 0;
  for (let k = 0; k < 40; k++) { viserSur(a, b, 1.1); a.gonfle = 0; const e = evsDe(jeu, 8, { a: entree({ tir: true }) }); tirs += e.filter((v) => v.t === 'tir').length; touches += e.filter((v) => v.t === 'touche').length; if (a.munitions.rafale < 3) donner(a, 'rafale'); }
  check(tirs > 30 && touches === 0, `blaster à ${A.portee + 2} m : ${tirs} tirs, 0 touche (portée ${A.portee} m)`);
}
{
  // dispersion : debout immobile, en marchant, en l'air, accroupi (tirs isolés, l'ouverture retombée)
  const { jeu, es: [a] } = partie(mondePlat, cartePl, ['a']);
  const A = R.arme('rafale');
  function mesure(cfg) {
    const ecarts = [];
    for (let k = 0; k < 160; k++) {
      poser(jeu, a, 0, 150, 0); donner(a, 'rafale'); a.pitch = 0.3; a.accroupi = !!cfg.accroupi;
      if (cfg.marche) { a.vx = 0; a.vz = -J.vitesse; a.vitesse = J.vitesse; }
      if (cfg.air) { a.auSol = false; a.y = 1; a.vy = 2; }
      const yaw = a.yaw, pitch = a.pitch, d = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      const e = jeu.etape(DT, { a: entree({ tir: true, avant: cfg.marche ? 1 : 0, accroupi: !!cfg.accroupi }) }).find((v) => v.t === 'tir');
      if (!e) continue;
      const v = [e.fin[0] - e.o[0], e.fin[1] - e.o[1], e.fin[2] - e.o[2]], l = Math.hypot(...v);
      ecarts.push(Math.acos(Math.min(1, (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / l)));
    }
    return { max: Math.max(...ecarts), moy: ecarts.reduce((s, x) => s + x, 0) / ecarts.length, n: ecarts.length };
  }
  const imm = mesure({}), mar = mesure({ marche: true }), air = mesure({ air: true }), acc = mesure({ accroupi: true });
  check(imm.n === 160 && imm.max <= A.dispersion + 1e-9 && Math.abs(imm.moy - A.dispersion * 2 / 3) < A.dispersion * 0.12, `immobile : écart ≤ ${deg(A.dispersion)} (max ${deg(imm.max)}, moyenne ${deg(imm.moy)} ≈ 2/3 du cône)`);
  check(mar.max > A.dispersion && mar.moy > imm.moy * 1.5 && mar.max <= A.dispersion + A.dispersionMouvement + 1e-9, `en courant : plus large (moyenne ${deg(mar.moy)}, max ${deg(mar.max)})`);
  check(air.moy > imm.moy * 1.2, `en l'air : plus large (moyenne ${deg(air.moy)})`);
  check(acc.max <= A.dispersion * 0.7 + 1e-9 && acc.moy < imm.moy, `accroupi : plus serré (max ${deg(acc.max)})`);
  // l'ouverture des tirs en rafale et le recul qui relève le regard
  poser(jeu, a, 0, 150, 0); donner(a, 'rafale'); a.pitch = 0.3; const p0 = a.pitch;
  pas(jeu, 30, { a: entree({ tir: true }) });
  check(a.gonfle > 0 && a.dispersion > A.dispersion && a.pitch > p0, `en rafale : le viseur s'ouvre (${deg(a.dispersion)}, comme le HUD) et le regard monte de ${deg(a.pitch - p0)}`);
}
{
  // chute de dégâts et tête, blaster et long-tir
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  const A = R.arme('rafale'), P = R.arme('precision');
  let bons = 0, total = 0, tetes = 0, mauvais = [];
  for (const d of [5, 15, 25, 35, 50, 65]) {
    for (let k = 0; k < 12; k++) {
      poser(jeu, a, 0, 150, 0); donner(a, 'rafale'); poser(jeu, b, 0, 150 - d); b.vie = 100; b.armure = 0; b.vivant = true; viserSur(a, b, 1.1);
      const evs = evsDe(jeu, 1, { a: entree({ tir: true }) }), t = evs.find((v) => v.t === 'tir'), h = evs.find((v) => v.t === 'touche');
      if (!h) continue; total++; if (h.tete) tetes++;
      const dist = Math.hypot(t.fin[0] - t.o[0], t.fin[1] - t.o[1], t.fin[2] - t.o[2]), att = R.degatsA(A, dist, h.tete);
      if (h.degats === att && b.vie === 100 - att) bons++; else mauvais.push([d, h.degats, att]);
    }
  }
  check(total > 40 && bons === total, `blaster de 5 à 65 m : ${total} touches, dégâts = degatsA(distance) pour toutes ${mauvais.length ? JSON.stringify(mauvais.slice(0, 3)) : ''}`);
  const premiereTouche = (d, haut) => { for (let k = 0; k < 40; k++) { poser(jeu, a, 0, 150, 0); donner(a, 'rafale'); cible(jeu, b, 0, 150 - d); viserSur(a, b, haut); const h = evsDe(jeu, 1, { a: entree({ tir: true }) }).find((v) => v.t === 'touche'); if (h && !h.tete) return h; } return null; };
  const h10 = premiereTouche(10, 1.0), h40 = premiereTouche(40, 1.0);
  check(h10 && h10.degats === A.degats && h40 && h40.degats < A.degats && h40.degats === R.degatsA(A, 40, false) || (h40 && Math.abs(h40.degats - R.degatsA(A, 40, false)) <= 1), `chute : ${h10 ? h10.degats : '?'} à 10 m, ${h40 ? h40.degats : '?'} à 40 m (degatsA : ${R.degatsA(A, 40, false)})`);
  let h;
  // la tête au long-tir (immobile : dispersion de ${P.dispersion} rad)
  poser(jeu, a, 0, 150, 0); donner(a, 'precision'); cible(jeu, b, 0, 130); viserSur(a, b, J.taille - 0.12);
  let evs = evsDe(jeu, 1, { a: entree({ tir: true }) }); h = evs.find((v) => v.t === 'touche');
  check(h && h.tete && h.degats === R.degatsA(P, 20, true) && h.mort && !b.vivant && evs.some((v) => v.t === 'mort' && v.a === 'b' && v.par === 'a' && v.arme === 'precision' && v.tete),
    `long-tir à la tête à 20 m : ${h ? h.degats : '?'} dégâts (×${P.tete}), éliminé d'un coup`);
  poser(jeu, a, 0, 150, 0); donner(a, 'precision'); cible(jeu, b, 0, 130); viserSur(a, b, 1.0);
  h = evsDe(jeu, 1, { a: entree({ tir: true }) }).find((v) => v.t === 'touche');
  check(h && !h.tete && h.degats === P.degats && b.vie === 100 - P.degats, `au corps : ${h ? h.degats : '?'} dégâts, il reste ${b.vie} de vie`);
  // accroupi, la tête descend
  cible(jeu, b, 0, 130); b.accroupi = true; poser(jeu, a, 0, 150, 0); donner(a, 'precision'); viserSur(a, b, J.tailleAccroupi - 0.12);
  h = evsDe(jeu, 1, { a: entree({ tir: true }), b: entree({ accroupi: true }) }).find((v) => v.t === 'touche');
  check(h && h.tete, 'cible accroupie : la tête est à 1,2 m');
  cible(jeu, b, 0, 130); poser(jeu, a, 0, 150, 0); donner(a, 'precision'); viserSur(a, b, J.taille + 0.15);
  h = evsDe(jeu, 1, { a: entree({ tir: true }) }).find((v) => v.t === 'touche');
  check(!h && b.vivant && b.vie === 100, 'au-dessus de la tête : raté');
  // l'armure absorbe 60 %
  cible(jeu, b, 0, 130); b.armure = 50; poser(jeu, a, 0, 150, 0); donner(a, 'precision'); viserSur(a, b, 1.0);
  h = evsDe(jeu, 1, { a: entree({ tir: true }) }).find((v) => v.t === 'touche');
  const abs = Math.min(50, Math.round(P.degats * 0.6));
  check(h && b.armure === 50 - abs && b.vie === 100 - (P.degats - abs), `armure : ${abs} absorbés, vie ${b.vie}, armure ${b.armure}`);
}
{
  // la pompe : 8 plombs, un seul « touche » par victime, chute rapide
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  const Q = R.arme('pompe');
  poser(jeu, a, 0, 150, 0); donner(a, 'pompe'); poser(jeu, b, 0, 145); b.vie = 100; viserSur(a, b, 1.0);
  let evs = evsDe(jeu, 1, { a: entree({ tir: true }) });
  const tirs = evs.filter((v) => v.t === 'tir'), hs = evs.filter((v) => v.t === 'touche');
  const somme = tirs.filter((t) => t.impact && t.impact.id === 'b').reduce((s, t) => s + R.degatsA(Q, Math.hypot(t.fin[0] - t.o[0], t.fin[1] - t.o[1], t.fin[2] - t.o[2]), t.fin[1] >= b.y + J.taille - 0.35), 0);
  check(tirs.length === Q.plombs && hs.length === 1 && hs[0].degats === somme && somme >= 4 * Q.degats && a.munitions.pompe === Q.chargeur - 1, `pompe à 5 m : ${tirs.length} plombs, un seul « touche » de ${hs[0] ? hs[0].degats : '?'} (somme des plombs), une cartouche`);
  let moy25 = 0; for (let k = 0; k < 10; k++) { b.vie = 100; b.vivant = true; poser(jeu, a, 0, 150, 0); donner(a, 'pompe'); poser(jeu, b, 0, 125); viserSur(a, b, 1.0); const e = evsDe(jeu, 1, { a: entree({ tir: true }) }).find((v) => v.t === 'touche'); moy25 += e ? e.degats : 0; }
  moy25 /= 10;
  check(moy25 < hs[0].degats / 3, `pompe à 25 m : ${f2(moy25)} dégâts en moyenne (bien moins qu'à 5 m)`);
}
{
  // cadence et recharge
  const { jeu, es: [a] } = partie(mondePlat, cartePl, ['a']);
  const cad = {};
  for (const id of ['rafale', 'pompe', 'precision']) {
    poser(jeu, a, 0, 150, 0); donner(a, id); a.pitch = 0.5; const A = R.arme(id);
    const n = evsDe(jeu, 120, { a: entree({ tir: true }) }).filter((v) => v.t === 'tir').length / A.plombs;
    cad[id] = n; // 2 s
  }
  check(Math.abs(cad.rafale - 1 - 2 * R.arme('rafale').cadence) <= 1 && cad.pompe === 3 && cad.precision === 2, `cadence sur 2 s : rafale ${cad.rafale} tirs (${R.arme('rafale').cadence}/s), pompe ${cad.pompe}, long-tir ${cad.precision}`);
  poser(jeu, a, 0, 150, 0); donner(a, 'rafale'); a.pitch = 0.5; const A = R.arme('rafale');
  let n = 0, tRech = -1, tFin = -1, tirPendant = 0, rech = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const evs = jeu.etape(DT, { a: entree({ tir: true }) });
    for (const v of evs) { if (v.t === 'tir') { n++; if (a.enRecharge) tirPendant++; } if (v.t === 'recharge') { rech++; if (tRech < 0) tRech = jeu.temps; } }
    if (tRech >= 0 && tFin < 0 && !a.enRecharge) tFin = jeu.temps;
  }
  check(rech >= 1 && tirPendant === 0 && Math.abs(tFin - tRech - A.recharge) < 2 * DT, `chargeur vide : recharge seule, ${f2(tFin - tRech)} s sans tirer (${A.recharge} s)`);
  donner(a, 'rafale'); a.munitions.rafale = 10; a.reserve.rafale = 50;
  let e = evsDe(jeu, 1, { a: entree({ recharge: true }) });
  const r0 = e.some((v) => v.t === 'recharge' && v.id === 'a') && a.rechargeJusqua > jeu.temps;
  pas(jeu, Math.ceil(A.recharge / DT) + 2, {});
  check(r0 && a.munitions.rafale === 30 && a.reserve.rafale === 30 && a.rechargeJusqua <= jeu.temps, `recharge demandée : 10 + 20 de la réserve → 30, réserve 50 → ${a.reserve.rafale}`);
  { // le blaster rafale recharge à l'infini : sa réserve ne descend jamais sous un chargeur (le HUD n'affiche jamais « / 0 »)
    donner(a, 'rafale'); a.pitch = 0.5; let mini = Infinity;
    for (let i = 0; i < 60 * 40; i++) { jeu.etape(DT, { a: entree({ tir: true }) }); mini = Math.min(mini, a.reserve.rafale); }
    check(mini >= A.chargeur && a.munitions.rafale >= 0, `blaster rafale : 40 s de tir continu, la réserve ne descend pas sous ${A.chargeur} (minimum ${mini})`);
    donner(a, 'rafale');
  }
  e = evsDe(jeu, 1, { a: entree({ recharge: true }) });
  check(!e.some((v) => v.t === 'recharge'), 'chargeur plein : pas de recharge');
  donner(a, 'pompe'); a.munitions.pompe = 0; a.reserve.pompe = 0; pas(jeu, 30, { a: entree({ tir: true }) });
  check(a.arme === 'rafale' && a.armes.indexOf('pompe') < 0, 'pompe vide de tout : lâchée, retour au blaster');
  donner(a, 'rafale'); a.munitions.rafale = 0; a.reserve.rafale = 0; pas(jeu, Math.ceil(A.recharge / DT) + 30, { a: entree({}) });
  check(a.munitions.rafale === 30, 'le blaster de base ne tombe jamais en panne (réserve de secours)');
  donner(a, 'precision'); donner(a, 'rafale'); pas(jeu, 1, { a: entree({ arme: 'precision' }) });
  const pt = a.prochainTir - jeu.temps;
  check(a.arme === 'precision' && pt > 0.2, `changer d'arme : ${f2(pt)} s avant de pouvoir tirer`);
  pas(jeu, 1, { a: entree({ arme: 'pompe' }) });
  check(a.arme === 'precision', 'une arme qu\'on n\'a pas ne se prend pas');
}
{
  // les murs arrêtent les tirs ; l'invincibilité ; les alliés ne se touchent pas
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  poser(jeu, a, 30, 0, 0); poser(jeu, b, 60, 0); viserSur(a, b, 1.1); donner(a, 'precision');
  let evs = evsDe(jeu, 1, { a: entree({ tir: true }) }); const t = evs.find((v) => v.t === 'tir');
  check(t && t.impact && t.impact.quoi === 'mur' && Math.abs(t.impact.x - 40) < 1e-6 && !evs.some((v) => v.t === 'touche') && b.vie === 100, 'une maison entre les deux : impact sur le mur à x = 40, pas de touche');
  poser(jeu, a, 0, 100, 0); poser(jeu, b, 0, 80); b.invincible = 1.5; donner(a, 'precision'); viserSur(a, b, 1.0);
  evs = evsDe(jeu, 1, { a: entree({ tir: true }) });
  check(!evs.some((v) => v.t === 'touche') && b.vie === 100, 'invincible : aucun dégât');
  donner(b, 'rafale'); b.prochainTir = 0; b.pitch = 0.4; pas(jeu, 1, { b: entree({ tir: true }) });
  check(b.invincible === 0, 'l\'invincibilité cesse au premier tir');
  const j2 = partie(mondePlat, cartePl, ['a', 'b', 'c'], { equipes: true, equipesDe: { a: 0, b: 0, c: 1 } });
  const [a2, b2, c2] = j2.es; poser(j2.jeu, a2, 0, 100, 0); poser(j2.jeu, b2, 0, 90); poser(j2.jeu, c2, 0, 80); donner(a2, 'precision'); viserSur(a2, c2, 1.0);
  evs = evsDe(j2.jeu, 1, { a: entree({ tir: true }) });
  check(evs.some((v) => v.t === 'touche' && v.a === 'c') && !evs.some((v) => v.t === 'touche' && v.a === 'b') && b2.vie === 100, '2 contre 2 : le tir traverse l\'allié et touche l\'ennemi derrière');
  check(j2.jeu.aideVisee('a', 1).surCible === true && j2.jeu.ennemis(a2, c2) && !j2.jeu.ennemis(a2, b2), 'jeu.ennemis : équipes respectées');
}

titre('Mort, points, réapparition');
{
  const { jeu, es: [a, b, c] } = partie(mondePlat, cartePl, ['a', 'b', 'c']);
  poser(jeu, a, 0, 100, 0); poser(jeu, b, 0, 80); poser(jeu, c, -100, -100);
  donner(a, 'precision'); viserSur(a, b, 1.0);
  let evs = []; for (let i = 0; i < 120 && b.vivant; i++) { viserSur(a, b, 1.0); for (const v of jeu.etape(DT, { a: entree({ tir: true }) })) evs.push(v); }
  const mort = evs.find((v) => v.t === 'mort'), t0 = jeu.temps;
  check(mort && mort.a === 'b' && mort.par === 'a' && mort.arme === 'precision' && !b.vivant && b.vie === 0 && b.mortDepuis === jeu.temps, 'deux long-tirs au corps : « mort » de b par a au long-tir');
  check(a.score.kills === 1 && a.score.points === R.MODES.arene.points.kill && a.serie === 1 && b.score.morts === 1 && b.serie === 0, `points : +${R.MODES.arene.points.kill} pour l'élimination, série 1, une mort pour b`);
  check(evs.some((v) => v.t === 'annonce' && /Premier repeint/.test(v.texte)), 'annonce du premier repeint');
  // pas de dégâts aux morts, pas de mouvement
  const x0 = b.x; pas(jeu, 30, { b: entree({ avant: 1, tir: true }) });
  check(b.x === x0 && !b.vivant, 'un mort ne bouge pas et ne tire pas');
  let rea = null; for (let i = 0; i < 4 * 60 && !rea; i++) { const e = jeu.etape(DT, {}).find((v) => v.t === 'reapparition'); if (e) rea = e; }
  const pts = jeu.arene.apparitions, distEnn = (p) => Math.min(Math.hypot(p[0] - a.x, p[1] - a.z), Math.hypot(p[0] - c.x, p[1] - c.z)), meilleur = Math.max(...pts.map(distEnn));
  check(rea && rea.id === 'b' && Math.abs(jeu.temps - t0 - R.MODES.arene.reapparition) < 2 * DT && b.vivant && b.vie === 100 && b.armure === 0 && b.arme === 'rafale' && b.armes.length === 1, `réapparition au bout de ${f2(jeu.temps - t0)} s, vie 100, blaster seul`);
  // la règle : un point d'apparition à ~35 m de l'ennemi le plus proche (jamais à moins de 15 m s'il existe mieux), pour que l'action reprenne vite,
  // et de préférence hors de la vue des ennemis (un point vu compte comme 25 m plus loin de l'idéal)
  const vuDe = (p) => [a, c].some((q) => q.vivant && Math.hypot(q.x - p[0], q.z - p[1]) < 75 && mondePlat.vue(q.x, q.y + J.oeil, q.z, p[0], mondePlat.hauteur(p[0], p[1]) + 1.2, p[1]));
  const ecart = (p) => { const d = distEnn(p); return (d < 15 ? 1000 + (15 - d) : Math.abs(d - 35)) + (vuDe(p) ? 25 : 0); }, ideal = Math.min(...pts.map(ecart));
  check(pts.some((p) => Math.abs(p[0] - b.x) < 1e-9 && Math.abs(p[1] - b.z) < 1e-9) && ecart([b.x, b.z]) <= ideal + 6 && (distEnn([b.x, b.z]) >= 15 || meilleur < 15), `au point d'apparition à bonne distance des ennemis (${f2(distEnn([b.x, b.z]))} m ; visé ~35 m, jamais < 15 m, de préférence caché ; le plus loin possible : ${f2(meilleur)} m)`);
  check(b.invincible === R.MODES.arene.invincible && pts.length === 12, `invincible ${R.MODES.arene.invincible} s après la réapparition ; le point hors de l'arène est écarté (${pts.length} points)`);
  // série de 3 et tête : les points
  const { jeu: j2, es: [k, ...vs] } = partie(mondePlat, cartePl, ['k', 'v1', 'v2', 'v3']);
  poser(j2, k, 0, 100, 0); let pAvant = 0; const gains = [];
  for (let i = 0; i < 3; i++) {
    const v = vs[i]; poser(j2, v, (i - 1) * 3, 85); donner(k, 'precision'); viserSur(k, v, i === 2 ? J.taille - 0.1 : 1.0);
    let n = 0; while (v.vivant && n++ < 200) { viserSur(k, v, i === 2 ? J.taille - 0.1 : 1.0); j2.etape(DT, { k: entree({ tir: true }) }); }
    gains.push(k.score.points - pAvant); pAvant = k.score.points;
  }
  const P = R.MODES.arene.points;
  check(gains[0] === P.kill && gains[1] === P.kill && gains[2] === P.kill + P.serie3 + P.tete && k.serie === 3, `points : ${gains.join(', ')} (la 3e à la tête : élimination + série de 3 + tête)`);
}

{
  const { jeu } = partie(mondePlat, cartePl, ['zz'], { bots: 3 });
  check(jeu.classement()[0].id === 'zz' && jeu.resume()[0].id === 'zz', 'à égalité parfaite, l\'humain passe devant les robots au classement');
}

titre('Objets à ramasser');
{
  const { jeu, es: [a] } = partie(mondePlat, cartePl, ['a']);
  const objs = PA.objets(jeu), soin = objs.find((o) => o.objet === 'soin'), armure = objs.find((o) => o.objet === 'armure'), pompe = objs.find((o) => o.objet === 'pompe');
  check(objs.length === 4 && objs.every((o) => o.id && finiNb(o.x) && finiNb(o.z) && o.dispo === true && R.OBJETS[o.objet]) && PA.objets(jeu) === objs, 'PARENE.objets : les objets de zones.armes, { id, x, z, objet, dispo }, toujours le même tableau');
  poser(jeu, a, soin.x, soin.z + 5, 0); a.vie = 100;
  pas(jeu, 120, { a: entree({ avant: 1 }) });
  check(soin.dispo && a.vie === 100, 'vie pleine : le soin reste là');
  a.vie = 40; poser(jeu, a, soin.x, soin.z + 3, 0);
  let tPris = -1, evs = [];
  for (let i = 0; i < 60; i++) for (const v of jeu.etape(DT, { a: entree({ avant: 1 }) })) { evs.push(v); if (v.t === 'ramasse') tPris = jeu.temps; }
  const r = evs.find((v) => v.t === 'ramasse');
  check(r && r.id === 'a' && r.objet === 'soin' && r.oid === soin.id && a.vie === 40 + R.OBJETS.soin.vie && !soin.dispo, `soin ramassé en passant : vie 40 → ${a.vie}`);
  let tRetour = -1;
  for (let i = 0; i < 20 * 60 && tRetour < 0; i++) { jeu.etape(DT, {}); if (soin.dispo) tRetour = jeu.temps; }
  check(Math.abs(tRetour - tPris - R.OBJETS.soin.retour) < 2 * DT, `le soin revient au bout de ${f2(tRetour - tPris)} s (${R.OBJETS.soin.retour} s)`);
  poser(jeu, a, armure.x, armure.z, 0); evs = evsDe(jeu, 2, {});
  check(a.armure === J.armureMax && evs.some((v) => v.t === 'ramasse' && v.objet === 'armure'), `armure ramassée : ${a.armure}`);
  poser(jeu, a, pompe.x, pompe.z, 0); evs = evsDe(jeu, 2, {});
  check(a.armes.indexOf('pompe') >= 0 && a.arme === 'pompe' && a.munitions.pompe === R.arme('pompe').chargeur && a.reserve.pompe === R.arme('pompe').reserve, 'pompe ramassée : en main, chargeur et réserve pleins');
  // le HUD et le rendu lisent jeu.mode.objets
  check(jeu.mode.objets(jeu) === objs, 'jeu.mode.objets(jeu) : les mêmes objets');
}

titre('Aide à la visée');
{
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  const DEG = Math.PI / 180;
  poser(jeu, a, 0, 100, 0); poser(jeu, b, 0, 80);
  viserSur(a, b, 1.1); let r = jeu.aideVisee('a', 1);
  check(r.surCible === true && r.ralentir > 0.3 && r.ralentir <= 0.5, `en plein dessus à 20 m : surCible, ralentir ${f2(r.ralentir)}`);
  viserSur(a, b, 1.1); a.yaw -= 3 * DEG; r = jeu.aideVisee('a', 1);
  const max20 = 2.5 * DEG * (1 - 20 / 50);
  check(!r.surCible && r.dyaw > 0 && Math.hypot(r.dyaw, r.dpitch) <= max20 + 1e-9 && Math.hypot(r.dyaw, r.dpitch) > max20 * 0.9 && r.ralentir > 0.3, `3° à droite : pas sur la cible, aimant vers elle (${deg(Math.hypot(r.dyaw, r.dpitch))} ≤ ${deg(max20)}), ralentit`);
  viserSur(a, b, 1.1); a.yaw += 3 * DEG; r = jeu.aideVisee('a', 1);
  check(r.dyaw < 0, '3° à gauche : l\'aimant tire vers la droite');
  viserSur(a, b, 1.1); a.yaw += 6 * DEG; r = jeu.aideVisee('a', 1);
  check(!r.surCible && r.dyaw === 0 && r.dpitch === 0 && r.ralentir === 0, '6° à côté : rien');
  viserSur(a, b, 1.1); a.yaw -= 3 * DEG; r = jeu.aideVisee('a', 0);
  check(r.dyaw === 0 && r.dpitch === 0 && r.ralentir === 0, 'force 0 (souris) : ni aimant ni ralenti');
  viserSur(a, b, 1.1); r = jeu.aideVisee('a', 0);
  check(r.surCible === true, 'force 0 : surCible quand même (le viseur rougit)');
  viserSur(a, b, 1.1); a.yaw -= 3 * DEG; r = jeu.aideVisee('a', 0.5);
  check(Math.abs(r.ralentir - 0.2) < 1e-9 && Math.hypot(r.dyaw, r.dpitch) <= max20 * 0.5 + 1e-9, 'force 0,5 : moitié moins');
  poser(jeu, b, 0, 55); viserSur(a, b, 1.1); a.yaw -= 2 * DEG; r = jeu.aideVisee('a', 1);
  check(r.dyaw === 0 && r.ralentir === 0, 'à 45 m : plus d\'aimant (≤ 40 m)');
  poser(jeu, b, 0, 80); b.vivant = false; viserSur(a, b, 1.1); r = jeu.aideVisee('a', 1);
  check(!r.surCible && r.ralentir === 0, 'une cible éliminée : rien'); b.vivant = true;
  poser(jeu, a, 30, 0, 0); poser(jeu, b, 60, 0); viserSur(a, b, 1.1); r = jeu.aideVisee('a', 1);
  check(!r.surCible && r.ralentir === 0, 'derrière un mur : rien');
  const jb = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 2, options: { bots: 1 } }); const bot = jb.entites[0], h = jb.ajouterJoueur({ id: 'h', humain: true });
  poser(jb, bot, 0, 100, 0); poser(jb, h, 0, 80); h.invincible = 0; viserSur(bot, h, 1.1); r = jb.aideVisee(bot.id, 1);
  check(!r.surCible && r.dyaw === 0 && r.ralentir === 0, 'un robot n\'a pas d\'aide');
  check(jeu.aideVisee('personne', 1).surCible === false, 'id inconnu : rien, pas d\'erreur');
  poser(jeu, a, 0, 100, 0); poser(jeu, b, 0, 70); donner(a, 'pompe'); viserSur(a, b, 1.1); const rp = jeu.aideVisee('a', 1).surCible;
  donner(a, 'rafale'); viserSur(a, b, 1.1); const rr = jeu.aideVisee('a', 1).surCible;
  check(!rp && rr, 'à 30 m : pas de tir auto à la pompe (inutile si loin), oui au blaster');
}

titre('Robots : perception, combat, fuite, déblocage');
{
  const { jeu, es: [h] } = partie(mondePlat, cartePl, ['h']);
  const bot = jeu.ajouterJoueur({ id: 'r', nom: 'Robot', bot: true, niveau: 'normal' });
  check(bot.bot && !bot.humain && bot.niveau === 'normal', 'un robot ajouté à la main');
  // il voit devant lui (cône), pas derrière ; il vise avec un temps de réaction, puis touche
  poser(jeu, bot, 0, 100, 0); poser(jeu, h, 0, 75); h.invincible = 0; bot.invincible = 0;
  let premierTir = -1, premiereTouche = -1; const t0 = jeu.temps;
  for (let i = 0; i < 4 * 60; i++) { for (const v of jeu.etape(DT, {})) { if (v.t === 'tir' && v.id === 'r' && premierTir < 0) premierTir = jeu.temps - t0; if (v.t === 'touche' && v.de === 'r' && premiereTouche < 0) premiereTouche = jeu.temps - t0; } }
  const niv = R.BOTS.normal;
  check(premierTir >= niv.reaction * 0.7 && premierTir < 1.5 && premiereTouche > 0 && h.vie < 100, `ennemi à 25 m devant : premier tir après ${f2(premierTir)} s (réaction ${niv.reaction} s), touché à ${f2(premiereTouche)} s, vie ${h.vie}`);
  // derrière : il ne le voit pas… mais il l'entend tirer et se retourne
  cible(jeu, h, 0, 125); bot.vie = 100; poser(jeu, bot, 0, 100, 0); bot.ia = null;
  let tirsBot = 0; pas(jeu, 12, {}, (v) => { if (v.t === 'tir' && v.id === 'r') tirsBot++; });
  check(tirsBot === 0 && bot.ia.etat !== 'combat' && !bot.ia.cible, 'ennemi immobile dans le dos (hors du cône) : pas vu');
  cible(jeu, h, 0, 125); poser(jeu, bot, 0, 100, 0); bot.ia = null; pas(jeu, 2, {}); poser(jeu, bot, 0, 100, 0);
  h.pitch = 0.5; h.prochainTir = 0; pas(jeu, 1, { h: entree({ tir: true }) }); pas(jeu, 8, {});
  const entendu = jeu.temps - bot.ia.alerteA < 0.3 && Math.hypot(bot.ia.ax - h.x, bot.ia.az - h.z) < 1;
  let vu = false; for (let i = 0; i < 2 * 60 && !vu; i++) { jeu.etape(DT, {}); if (bot.ia.etat === 'combat') vu = true; }
  check(entendu && vu, 'il l\'entend tirer à 25 m (≤ 30 m), se retourne et le voit');
  cible(jeu, h, 0, 140); poser(jeu, bot, 0, 100, 0); bot.ia = null; pas(jeu, 2, {}); poser(jeu, bot, 0, 100, 0); const al0 = bot.ia.alerteA;
  h.pitch = 0.5; h.prochainTir = 0; pas(jeu, 1, { h: entree({ tir: true }) }); pas(jeu, 8, {});
  check(bot.ia.alerteA === al0, 'un tir à 40 m : pas entendu');
  // un mur entre les deux : rien
  cible(jeu, h, 60, 0); bot.vie = 100; poser(jeu, bot, 30, 0, -Math.PI / 2); bot.ia = null;
  pas(jeu, 60, {});
  check(bot.ia.etat !== 'combat' && h.vie === 100, 'un mur entre eux : pas vu, pas touché');
  // l'erreur de visée se resserre : plus de touches en fin de combat qu'au début
  const stats = { facile: 0, normal: 0, fort: 0 };
  for (const nv of ['facile', 'normal', 'fort']) {
    let total = 0;
    for (let k = 0; k < 6; k++) {
      const j = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 100 + k, options: { bots: 0 } });
      const cible = j.ajouterJoueur({ id: 'h', humain: true }), r = j.ajouterJoueur({ id: 'r', bot: true, niveau: nv });
      poser(j, r, 0, 100, 0); poser(j, cible, 0, 82); cible.invincible = 0; r.invincible = 0;
      for (let i = 0; i < 2 * 60; i++) { cible.vie = 100; cible.armure = 0; for (const v of j.etape(DT, { h: entree({ cote: i % 120 < 60 ? 1 : -1 }) })) if (v.t === 'touche' && v.de === 'r') total += v.degats; }
    }
    stats[nv] = total / 6;
  }
  check(stats.facile < stats.normal && stats.normal < stats.fort, `dégâts infligés en 2 s à une cible qui se décale à 18 m : facile ${f2(stats.facile)}, normal ${f2(stats.normal)}, fort ${f2(stats.fort)}`);
  // fuite vers un soin à moins de 25 % de vie
  const jf = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 9, options: { bots: 0 } });
  const rf = jf.ajouterJoueur({ id: 'r', bot: true }), hf = jf.ajouterJoueur({ id: 'h', humain: true });
  poser(jf, rf, 10, 10, 0); poser(jf, hf, -120, -120); rf.vie = 20; rf.invincible = 0;
  let soigne = false; for (let i = 0; i < 20 * 60 && !soigne; i++) { for (const v of jf.etape(DT, {})) if (v.t === 'ramasse' && v.id === 'r' && v.objet === 'soin') soigne = true; }
  check(soigne && rf.vie === 70, `à 20 de vie : il file au soin (vie ${rf.vie})`);
  // coincé dans un coin : il s'en sort
  const jc = PJ.creer({ monde: mondeP, carte: carteP, mode: PA, graine: 3, options: { bots: 1 } }); const rc = jc.entites[0];
  const coin = (() => { const rnd = R.mulberry32(5); for (let k = 0; k < 4000; k++) { const p = mondeP.libre(rnd); let murs = 0; for (let a = 0; a < 8; a++) if (mondeP.bloque(p[0] + Math.cos(a * Math.PI / 4) * 1.2, p[1] + Math.sin(a * Math.PI / 4) * 1.2, 0.3)) murs++; if (murs >= 4) return p; } return null; })();
  if (coin) {
    poser(jc, rc, coin[0], coin[1], 0); const x0 = rc.x, z0 = rc.z; let dm = 0;
    for (let i = 0; i < 10 * 60; i++) { jc.etape(DT, {}); dm = Math.max(dm, Math.hypot(rc.x - x0, rc.z - z0)); }
    check(dm > 5, `posé dans un recoin (4 directions sur 8 bouchées à 1,2 m) : il en sort (${f2(dm)} m en 10 s)`);
  } else check(false, 'pas de recoin trouvé sur la carte provisoire');
  // les requêtes de chemin : au plus 2 par image pour tous les robots
  const jn = PJ.creer({ monde: mondeP, carte: carteP, mode: PA, graine: 4, options: { bots: 9 } });
  const nav = jn.nav, vrai = nav.chemin; let parImage = 0, maxImage = 0, total = 0;
  nav.chemin = function () { parImage++; total++; return vrai.apply(this, arguments); };
  for (let i = 0; i < 20 * 60; i++) { parImage = 0; jn.etape(DT, {}); maxImage = Math.max(maxImage, parImage); }
  nav.chemin = vrai;
  check(maxImage <= 2 && total > 20, `9 robots, 20 s : ${total} requêtes de chemin, au plus ${maxImage} par image`);
}

titre('Jeu en ligne : regard absolu, prédiction du client, historique et compensation de latence, instantané');
{
  const { jeu, es: [a] } = partie(mondePlat, cartePl, ['a']);
  poser(jeu, a, 0, 100, 0);
  pas(jeu, 3, { a: entree({ yaw: 1.2, pitch: 0.3, dyaw: 0.5, dpitch: 0.5 }) });
  check(Math.abs(a.yaw - 1.2) < 1e-12 && Math.abs(a.pitch - 0.3) < 1e-12, 'entrée avec yaw / pitch absolus : appliqués tels quels (dyaw / dpitch ignorés), sans s\'additionner d\'une image à l\'autre');
  pas(jeu, 1, { a: entree({ yaw: 7, pitch: 3 }) });
  check(Math.abs(a.yaw - (7 - 2 * Math.PI)) < 1e-9 && a.pitch === 1.45, 'yaw absolu ramené dans ]−π, π], pitch borné à 1,45');
  pas(jeu, 1, { a: entree({ yaw: NaN, dyaw: 0.1, pitch: 'x', dpitch: 0 }) });
  check(Math.abs(a.yaw - (7 - 2 * Math.PI + 0.1)) < 1e-9, 'yaw absolu invalide : on retombe sur dyaw');
}
{
  // la prédiction : PJEU.deplacer (pure) refait exactement le déplacement de etape (marche, murs, pente, saut, gravité)
  const { jeu, es: [a] } = partie(mondeP, carteP, ['a']);
  const rnd = R.mulberry32(9); let ecartMax = 0, n = 0;
  for (let k = 0; k < 20; k++) {
    const p = mondeP.libre(rnd); poser(jeu, a, p[0], p[1], rnd() * 6.28);
    const ombre = { x: a.x, y: a.y, z: a.z, vx: 0, vz: 0, vy: 0, vitesse: 0, yaw: a.yaw, pitch: 0, auSol: true, accroupi: false };
    for (let i = 0; i < 150; i++) {
      const e = entree({ avant: Math.sin(i / 17 + k), cote: Math.cos(i / 23), yaw: Math.sin(i / 40 + k) * 3, pitch: 0.1, saut: i % 47 === 0, accroupi: i % 90 > 70 });
      jeu.etape(DT, { a: e }); PJ.deplacer(ombre, e, DT, mondeP); n++;
      ecartMax = Math.max(ecartMax, Math.abs(ombre.x - a.x) + Math.abs(ombre.y - a.y) + Math.abs(ombre.z - a.z) + Math.abs(ombre.yaw - a.yaw));
    }
  }
  check(ecartMax < 1e-9, `PJEU.deplacer : ${n} pas avec murs, relief et sauts, identiques à la simulation (écart max ${ecartMax})`);
  const o = { x: 0, y: 0, z: 100, vx: 0, vz: 0, vy: 0, vitesse: 0, yaw: 0, pitch: 0, auSol: true, accroupi: false };
  const mv = PJ.deplacer(o, entree({ saut: true, avant: 1 }), DT, mondePlat);
  check(mv.saut === true && !o.auSol && mv.dep > 0, 'PJEU.deplacer rend { dep, saut } (pour les sons « pas » et « saut »)');
}
{
  // l'historique (≈ 1 s) et la compensation de latence : b court de côté, a le vise là où il était il y a 0,2 s
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  poser(jeu, a, 0, 100, 0); poser(jeu, b, -6, 80, Math.PI / 2); // b regarde vers l'ouest et court en pas chassé vers le sud : il traverse la ligne de mire de a
  const pos = [];
  for (let i = 0; i < 90; i++) { jeu.etape(DT, { b: entree({ cote: -1 }) }); pos.push({ t: jeu.temps, x: b.x, z: b.z }); }
  const h = jeu.historique('b', jeu.temps - 0.2), vrai = pos.find((p) => Math.abs(p.t - (jeu.temps - 0.2)) < DT / 2);
  check(h && vrai && Math.abs(h.x - vrai.x) < 0.05 && Math.abs(h.z - vrai.z) < 1e-6 && h.vivant, `historique : b il y a 0,2 s retrouvé (z ${h ? f2(h.z) : '?'} ; vrai ${vrai ? f2(vrai.z) : '?'} ; maintenant ${f2(b.z)})`);
  check(jeu.historique('b', jeu.temps - 0.9) && !jeu.historique('b', jeu.temps - 1.6), 'l\'historique remonte à ~1 s, pas plus');
  const tirSur = (retard) => {
    // on fige b là où il est (il court toujours pendant l'image du tir), on vise sa position d'il y a 0,2 s, au long-tir
    const passe = jeu.historique('b', jeu.temps - 0.2); const px = passe.x, pz = passe.z, py = passe.y;
    donner(a, 'precision'); a.gonfle = 0; jeu.reglerRetard('a', retard); b.vie = 100; b.armure = 0; b.invincible = 0;
    const dx = px - a.x, dz = pz - a.z; a.yaw = Math.atan2(-dx, -dz); a.pitch = Math.atan2(py + 1.1 - (a.y + J.oeil), Math.hypot(dx, dz));
    const evs = evsDe(jeu, 1, { a: entree({ tir: true }), b: entree({ cote: -1 }) });
    return evs.some((v) => v.t === 'touche' && v.a === 'b');
  };
  const sansRetard = tirSur(0), avecRetard = tirSur(0.2);
  check(!sansRetard && avecRetard, `compensation de latence : visé là où b était il y a 0,2 s → raté sans retard, touché avec reglerRetard('a', 0.2)`);
  check(Math.abs(b.x - pos[pos.length - 1].x) < 2 && jeu.retardDe('a') === 0.2 && jeu.reglerRetard('a', 3) === 0.25 && jeu.reglerRetard('a', -1) === 0 && jeu.retardDe('a') === 0, 'après le tir, b est rendu à sa vraie place ; retard borné à [0, 0,25 s]');
  // un mort qui vient de réapparaître n'est pas touchable à son ancienne place
  poser(jeu, b, 0, 80); b.vivant = true; pas(jeu, 30, {}); b.vivant = false; pas(jeu, 6, {}); b.vivant = true; poser(jeu, b, 100, 100); b.invincible = 0; pas(jeu, 3, {});
  donner(a, 'precision'); a.gonfle = 0; jeu.reglerRetard('a', 0.06); a.yaw = 0; a.pitch = Math.atan2(1.1 - J.oeil, 20);
  const fantome = evsDe(jeu, 1, { a: entree({ tir: true }) }).some((v) => v.t === 'touche');
  check(!fantome, 'rembobiné à un moment où la cible était morte : intouchable (pas de « fantôme »)');
}
{
  // l'instantané compact et son application dans un autre jeu (le client), à l'arrondi près
  const j1 = PJ.creer({ monde: mondeP, carte: carteP, mode: PA, graine: 21, options: { bots: 3, niveau: 'fort' } });
  const h1 = j1.ajouterJoueur({ id: 'h1', nom: 'Castor Turbo 42', humain: true });
  for (let i = 0; i < 60 * 25; i++) j1.etape(DT, { h1: entree({ avant: 1, yaw: Math.sin(i / 50), tir: i % 60 < 20 }) });
  h1.armes.push('pompe'); h1.munitions.pompe = 4; h1.reserve.pompe = 12;
  const inst = j1.instantane({ h1: 77 }), txt = JSON.stringify(inst);
  const j2 = PJ.creer({ monde: mondeP, carte: carteP, mode: PA, graine: 21, options: { bots: 3, niveau: 'fort' }, nav: false });
  j2.ajouterJoueur({ id: 'h1', nom: 'Castor Turbo 42', humain: true });
  let lus = 0; for (const l of inst.e) if (PJ.lireLigne(l, j2.trouver(l[0]), j2.temps, 'tout')) lus++;
  const pareil = j1.entites.every((e) => { const f = j2.trouver(e.id); return f && Math.abs(f.x - e.x) <= 0.005 && Math.abs(f.z - e.z) <= 0.005 && Math.abs(f.y - e.y) <= 0.005 && Math.abs(f.yaw - e.yaw) < 6e-4 && f.vivant === e.vivant && f.vie === Math.max(0, Math.round(e.vie)) && f.arme === e.arme && f.score.kills === e.score.kills && f.score.points === e.score.points && f.score.morts === e.score.morts; });
  const f1 = j2.trouver('h1');
  check(lus === 4 && pareil && f1.armes.join() === h1.armes.join() && f1.munitions.pompe === 4 && f1.reserve.pompe === 12 && inst.e.find((l) => l[0] === 'h1')[20] === 77, `instantané : 4 entités relues à l'arrondi près (positions au cm, regard, vie, scores, armes et munitions, ack) ; ${txt.length} octets en JSON`);
  check(txt.length < 1200 && inst.o.length === j1.arene.objets.length && /^[01]+$/.test(inst.o) && Math.abs(inst.r - j1.reste) < 0.01 && !j2.nav, 'compact (< 1,2 Ko pour 4 entités), objets disponibles en 0/1, reste ; un jeu « client » sans navigation (nav: false)');
  const ev = []; PJ.tirVisuel(f1, mondeP, j2.entites, R.mulberry32(1), ev);
  check(ev.length === R.arme(f1.arme).plombs && ev.every((v) => v.t === 'tir' && v.id === 'h1' && v.o.length === 3 && v.fin.length === 3) && j2.entites.every((e) => e.vie === j2.trouver(e.id).vie), 'PJEU.tirVisuel : les traînées d\'un tir pour l\'image, sans effet sur le jeu');
}

titre('Corrections de la relecture');
{
  // (a) la réapparition préfère un point hors de la vue des ennemis (à distance comparable)
  const c = cartePlate(); c.batiments.push({ p: [[-4, -46], [4, -46], [4, -40], [-4, -40]], h: 6, t: 'maison' });
  c.zones.apparitions = [[30, 0], [0, -52]]; // (30, 0) : à 35 m de l'ennemi, en vue ; (0, -52) : à 37 m, derrière la maison
  const m = PM.creer(c), jeu = PJ.creer({ monde: m, carte: c, mode: PA, graine: 3, options: { bots: 0 } });
  const en = jeu.ajouterJoueur({ id: 'en', humain: true }), v = jeu.ajouterJoueur({ id: 'v', humain: true });
  let caches = 0;
  for (let k = 0; k < 20; k++) { poser(jeu, en, 0, -15, 0); en.vivant = true; const p = PA.apparition(jeu, v); if (p[0] === 0 && p[1] === -52) caches++; }
  check(m.vue(0, J.oeil, -15, 30, 1.2, 0) && !m.vue(0, J.oeil, -15, 0, 1.2, -52) && caches === 20, `réapparition : le point caché derrière la maison (37 m) plutôt que celui en vue (33 m) : ${caches}/20`);
}
{
  // (b) un robot touché de loin (au-delà de ses 45 m de vue) se tourne vers le tireur et le prend en chasse
  const jeu = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 4, options: { bots: 0 } });
  const h = jeu.ajouterJoueur({ id: 'h', humain: true }), bot = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'normal' });
  poser(jeu, bot, 0, 30, 0); poser(jeu, h, 0, 100, 0); bot.invincible = 0; h.invincible = 0; // le robot regarde au nord, le tireur est à 70 m dans son dos
  pas(jeu, 10, {});
  donner(h, 'precision'); viserSur(h, bot, 1.0); h.gonfle = 0;
  const touche = evsDe(jeu, 1, { h: entree({ tir: true }) }).some((v) => v.t === 'touche' && v.a === 'r');
  const d0 = Math.hypot(bot.x - h.x, bot.z - h.z); let combat = false, tirs = 0, dMin = d0;
  for (let i = 0; i < 6 * 60; i++) { for (const v of jeu.etape(DT, {})) if (v.t === 'tir' && v.id === 'r') tirs++; if (bot.ia.etat === 'combat' && bot.ia.cible === h) combat = true; dMin = Math.min(dMin, Math.hypot(bot.x - h.x, bot.z - h.z)); h.vie = 100; }
  check(touche && combat && dMin < d0 - 15 && tirs > 0, `robot touché au long-tir à ${f2(d0)} m : il voit le tireur, le prend en chasse (${f2(d0 - dMin)} m gagnés en 6 s) et riposte (${tirs} tirs)`);
}
{
  // (c) le tir auto s'arrête à la portée utile de l'arme : la pompe à ~12 m
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  const sur = (d, arme) => { poser(jeu, a, 0, 100, 0); poser(jeu, b, 0, 100 - d); donner(a, arme); viserSur(a, b, 1.1); return jeu.aideVisee('a', 1).surCible; };
  check(sur(8, 'pompe') && sur(11.5, 'pompe') && !sur(14, 'pompe') && !sur(20, 'pompe') && sur(20, 'rafale') && sur(40, 'rafale') && sur(55, 'precision'), 'tir auto : pompe jusqu\'à 12 m (pas à 14 ni 20 m), blaster à 40 m, long-tir à 55 m');
}
{
  // (e) chacun pour soi : la fin et la victoire suivent le même critère (les repeints, départagés par les points)
  const { jeu, es: [a, b] } = partie(mondePlat, cartePl, ['a', 'b']);
  a.score.kills = 25; a.score.points = 2500; b.score.kills = 24; b.score.points = 3100;
  pas(jeu, 1, {});
  const res = PA.resultat(jeu);
  check(jeu.fini && res.gagnant === 'a' && jeu.classement()[0].id === 'a' && res.classement[0].id === 'a', `premier à 25 repeints : la partie s'arrête et c'est lui qui gagne, même avec moins de points (gagnant ${res.gagnant})`);
  const j2 = partie(mondePlat, cartePl, ['a', 'b']); j2.es[0].score.kills = 10; j2.es[0].score.points = 1000; j2.es[1].score.kills = 10; j2.es[1].score.points = 1050;
  check(PA.resultat(j2.jeu).gagnant === 'b', 'à repeints égaux, les points départagent');
}
{
  // (f) retirer un joueur : il disparaît vraiment, les robots ne chassent plus son fantôme
  const jeu = PJ.creer({ monde: mondePlat, carte: cartePl, mode: PA, graine: 6, options: { bots: 0 } });
  const h = jeu.ajouterJoueur({ id: 'h', humain: true }), bot = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'fort' });
  poser(jeu, bot, 0, 100, 0); poser(jeu, h, 0, 80); h.invincible = 0; bot.invincible = 0;
  pas(jeu, 60, {}); const vise = bot.ia.cible === h;
  h.prochainTir = 0; h.pitch = 0.4; pas(jeu, 1, { h: entree({ tir: true }) });
  const ok = jeu.retirerJoueur('h');
  let refs = 0; const evs = []; for (let i = 0; i < 120; i++) for (const v of jeu.etape(DT, {})) { evs.push(v); if (v.t === 'tir' && v.id === 'r') refs++; }
  check(vise && ok && !h.vivant && !jeu.trouver('h') && jeu.entites.length === 1 && bot.ia.cible !== h && bot.ia.proie !== h && jeu.bruits.every((b) => b.e !== h) && refs === 0 && !evs.some((v) => v.a === 'h' || v.id === 'h'), 'retirerJoueur : plus dans le jeu, plus vivant, plus visé ni entendu ; le robot arrête de tirer');
  check(jeu.retirerJoueur('h') === false && jeu.aideVisee('h', 1).surCible === false, 'retirer deux fois, viser avec un retiré : rien ne casse');
}

titre('Entrées abîmées, dt extrêmes : jamais d\'exception ni de NaN');
{
  const { jeu, es: [a] } = partie(mondeP, carteP, ['a'], { bots: 3 });
  let ok = true;
  try {
    for (const e of [null, undefined, 42, 'x', {}, { avant: NaN, cote: Infinity, dyaw: 1e9, dpitch: -1e9, tir: 'oui', saut: 1, arme: 'bazooka' }, { avant: '1', cote: [], dyaw: {}, recharge: true, arme: 'pompe' }])
      for (const dt of [DT, 0, -1, NaN, 5, 1e-9, '0.016']) jeu.etape(dt, { a: e });
  } catch (err) { ok = false; console.log('     ', err.stack); }
  const propres = jeu.entites.every((e) => [e.x, e.y, e.z, e.yaw, e.pitch, e.vie].every(finiNb));
  check(ok && propres && jeu.erreurs === 0, 'entrées NaN / Infinity / mauvais types, dt négatif, nul, NaN, énorme : rien ne casse');
  check(Math.abs(a.pitch) <= 1.45 && Math.abs(a.yaw) <= Math.PI, 'pitch borné à ±1,45, yaw dans ]−π, π]');
  let ok2 = true;
  try { const j = PJ.creer({ monde: mondeP, graine: 'abc', options: { bots: 'beaucoup', niveau: 'extrême' } }); j.ajouterJoueur(); j.ajouterJoueur(null); for (let i = 0; i < 300; i++) j.etape(DT, null); j.classement(); j.aideVisee(undefined); }
  catch (err) { ok2 = false; console.log('     ', err.stack); }
  check(ok2, 'sans mode ni carte, options absurdes : le jeu tourne quand même');
  const jsc = PJ.creer({ monde: mondeP, mode: PA, graine: 3, options: { bots: 3 } });
  check(jsc.monde.limite && jsc.arene.apparitions.length >= 12 && jsc.arene.objets.length > 0 && jsc.entites.every((e) => !mondeP.bloque(e.x, e.z, J.rayon)), 'Arène sans carte : une zone et des points de secours (12 apparitions, objets)');
  mondeP.limite = { centre: carteP.zones.arene.centre, rayon: carteP.zones.arene.rayon };
}

// ─── 30 parties de robots complètes ───
function jouer(monde, carte, graine, opts, suivre) {
  const jeu = PJ.creer({ monde, carte, mode: PA, graine, options: opts });
  const log = [], bots = jeu.entites.filter((e) => e.bot), sondes = new Map();
  let fins = 0, nan = 0, dansMur = 0, hors = 0, coinces = [], tirs = 0;
  const lim = monde.limite;
  for (const b of bots) sondes.set(b.id, []);
  let k = 0;
  while (!jeu.fini && jeu.temps < 200) {
    const evs = jeu.etape(opts.dt || 1 / 30, {});
    for (const v of evs) { if (v.t === 'fin') fins++; if (v.t === 'tir') tirs++; if (v.t === 'mort' || v.t === 'touche' || v.t === 'reapparition' || v.t === 'fin' || v.t === 'ramasse') log.push(v); }
    if (++k % 3) continue;
    for (const e of jeu.entites) {
      if (![e.x, e.y, e.z, e.yaw, e.pitch].every(finiNb)) nan++;
      if (e.vivant && monde.dedans(e.x, e.z)) dansMur++;
      if (e.vivant && Math.hypot(e.x - lim.centre[0], e.z - lim.centre[1]) > lim.rayon + 1e-6) hors++;
    }
    // le « coincé » : hors combat pendant 10 s, vivant, il doit s'être éloigné d'au moins 3 m de son point de départ
    for (const b of bots) {
      const s = sondes.get(b.id), combat = !b.ia || b.ia.etat === 'combat' || !b.vivant || jeu.temps - b.apparuA < 0.2;
      s.push({ t: jeu.temps, x: b.x, z: b.z, c: combat });
      while (s.length && s[0].t < jeu.temps - 10) s.shift();
      if (s.length && jeu.temps - s[0].t >= 9.9 && !s.some((p) => p.c)) {
        const dm = Math.max(...s.map((p) => Math.hypot(p.x - s[0].x, p.z - s[0].z)));
        if (dm < 3) { coinces.push({ id: b.id, t: f2(jeu.temps), x: f2(b.x), z: f2(b.z), etat: b.ia.etat, but: b.ia.but }); s.length = 0; }
      }
    }
  }
  if (suivre) suivre(jeu);
  return { jeu, log, fins, nan, dansMur, hors, coinces, tirs };
}
function coherent(jeu, log) { // les scores refaits à partir des événements
  const P = R.MODES.arene.points, sc = new Map(); for (const e of jeu.entites) sc.set(e.id, { kills: 0, morts: 0, points: 0, serie: 0 });
  let tkA = 0;
  for (const v of log) {
    if (v.t !== 'mort') continue;
    const vi = sc.get(v.a), ki = sc.get(v.par); vi.morts++; vi.serie = 0;
    if (ki && v.par !== v.a) { ki.kills++; ki.serie++; ki.points += P.kill + (v.tete ? P.tete : 0) + (ki.serie % 3 === 0 ? P.serie3 : 0); }
    const ve = jeu.trouver(v.a), ke = jeu.trouver(v.par); if (ke && ve && ke.equipe === ve.equipe) tkA++;
  }
  const ok = jeu.entites.every((e) => { const s = sc.get(e.id); return s.kills === e.score.kills && s.morts === e.score.morts && s.points === e.score.points && s.serie === e.serie; });
  const cl = jeu.classement(), trie = cl.every((e, i) => i === 0 || cl[i - 1].score.kills > e.score.kills || (cl[i - 1].score.kills === e.score.kills && cl[i - 1].score.points >= e.score.points));
  return ok && tkA === 0 && trie;
}

titre('30 parties de robots contre robots (carte provisoire, 180 s ou 25 repeints)');
{
  const t0 = Date.now(); let finsOk = 0, elimsOk = 0, coherents = 0, totalElims = 0, totalCoinces = 0, propres = 0, erreurs = 0, finFin = 0, dureeOk = 0;
  const niveaux = ['facile', 'normal', 'fort'], details = [];
  for (let g = 1; g <= 30; g++) {
    const equipes = g % 5 === 0, opts = { bots: equipes ? 4 : 3 + (g % 3), niveau: niveaux[g % 3], equipes };
    const r = jouer(mondeP, carteP, g, opts);
    const elims = r.log.filter((v) => v.t === 'mort').length; totalElims += elims; totalCoinces += r.coinces.length;
    const fin = r.log.filter((v) => v.t === 'fin');
    if (r.jeu.fini && r.fins === 1 && fin.length === 1 && fin[0].classement.length === r.jeu.entites.length) finsOk++;
    if (fin.length && fin[0].classement.map((x) => x.id).join() === r.jeu.classement().map((e) => e.id).join()) finFin++;
    const vic = R.MODES.arene.scoreVictoire, kmax = equipes ? Math.max(...[0, 1].map((q) => r.jeu.entites.filter((e) => e.equipe === q).reduce((s, e) => s + e.score.kills, 0))) : Math.max(...r.jeu.entites.map((e) => e.score.kills));
    if ((r.jeu.temps >= 180 - 1e-6 && r.jeu.temps < 180 + 0.04) || (kmax >= vic && r.jeu.temps < 180)) dureeOk++;
    if (elims > 0) elimsOk++;
    if (coherent(r.jeu, r.log)) coherents++;
    if (!r.nan && !r.dansMur && !r.hors) propres++;
    erreurs += r.jeu.erreurs;
    if (r.coinces.length) console.log('      coincé :', JSON.stringify(r.coinces.slice(0, 3)));
    if (r.jeu.erreurs) console.log('      erreur :', r.jeu.derniereErreur);
    details.push(`${opts.bots}${equipes ? 'éq' : ''}/${opts.niveau.slice(0, 2)}:${elims}`);
  }
  const ms = Date.now() - t0;
  console.log('      (robots / niveau : éliminations) ' + details.join(' '));
  check(finsOk === 30 && dureeOk === 30 && finFin === 30, `30 parties finies proprement : un seul événement « fin » avec le classement, à 180 s ou au score de victoire`);
  check(elimsOk === 30, `éliminations dans chaque partie (${totalElims} en tout, ${f2(totalElims / 30)} par partie)`);
  check(coherents === 30, 'scores cohérents avec les événements (éliminations, morts, points avec séries et têtes, classement trié, aucun tir ami)');
  check(propres === 30 && erreurs === 0, 'jamais de NaN, personne dans un mur ni hors de l\'arène, aucune erreur de robot');
  check(totalCoinces === 0, `aucun robot coincé : hors combat, chacun bouge d'au moins 3 m toutes les 10 s (${totalCoinces} cas)`);
  console.log(`      (30 parties en ${f2(ms / 1000)} s, pas de 1/30 s)`);
}

titre('Rejouabilité et temps de simulation');
{
  const empreinte = (jeu, log) => { let h = 0; const s = JSON.stringify(log) + jeu.entites.map((e) => [e.id, e.x, e.y, e.z, e.yaw, e.vie, e.score.points].join()).join(';'); for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h + ':' + s.length; };
  function partieAvecHumain(graine) {
    const jeu = PJ.creer({ monde: mondeP, carte: carteP, mode: PA, graine, options: { bots: 5, niveau: 'normal' } });
    const moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi', couleur: '#FFC84A', equipe: 'moi', humain: true });
    const log = [], e = entree({}); let k = 0;
    while (!jeu.fini) { // un « humain » scripté : il tourne, avance, tire, saute
      k++; e.avant = (k % 240) < 180 ? 1 : -1; e.cote = (k % 100) < 50 ? 0.5 : -0.5; e.dyaw = 0.012 * Math.sin(k / 50); e.dpitch = 0; e.tir = (k % 90) < 30; e.saut = k % 300 === 0; e.recharge = k % 600 === 0;
      const a = jeu.aideVisee('moi', 1); e.dyaw += a.dyaw * 0.1; e.dpitch += a.dpitch * 0.1;
      for (const v of jeu.etape(DT, { moi: e })) if (v.t !== 'pas') log.push(v);
    }
    return { jeu, log, moi };
  }
  const t0 = Date.now(); const a = partieAvecHumain(77); const ms = Date.now() - t0;
  const b = partieAvecHumain(77), c = partieAvecHumain(78);
  check(empreinte(a.jeu, a.log) === empreinte(b.jeu, b.log) && a.log.length > 100, `même graine, mêmes entrées : partie identique (${a.log.length} événements, empreinte ${empreinte(a.jeu, a.log)})`);
  check(empreinte(a.jeu, a.log) !== empreinte(c.jeu, c.log), 'autre graine : autre partie');
  check(ms < 2000, `3 minutes à 60 images/s avec 6 entités (5 robots + 1 humain) : ${ms} ms (< 2 s)`);
  check(a.jeu.erreurs === 0 && a.moi.score.morts + a.moi.score.kills > 0, `l'humain scripté a joué (${a.moi.score.kills} éliminations, ${a.moi.score.morts} morts)`);
  const r1 = jouer(mondeP, carteP, 5, { bots: 4, niveau: 'fort', dt: 1 / 60 }), r2 = jouer(mondeP, carteP, 5, { bots: 4, niveau: 'fort', dt: 1 / 60 });
  check(JSON.stringify(r1.log) === JSON.stringify(r2.log), 'robots seuls à 60 images/s : rejouables à l\'identique');
}

// ─── la vraie carte, si elle est là ───
const vraie = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
if (fs.existsSync(vraie)) {
  titre('Vraie carte de Poncin (IGN + OSM) : 3 parties de robots');
  const carte = JSON.parse(fs.readFileSync(vraie, 'utf8')), monde = PM.creer(carte);
  let ok = 0, elims = 0, coinces = 0, ms = 0, centreOk = true;
  for (let g = 1; g <= 3; g++) {
    const t0 = Date.now(); const r = jouer(monde, carte, g, { bots: 4 + (g % 2), niveau: ['facile', 'normal', 'fort'][g % 3], equipes: g === 3 }); ms += Date.now() - t0;
    const e = r.log.filter((v) => v.t === 'mort').length; elims += e; coinces += r.coinces.length;
    if (r.jeu.fini && r.fins === 1 && e > 0 && !r.nan && !r.dansMur && !r.hors && r.jeu.erreurs === 0 && coherent(r.jeu, r.log)) ok++;
    if (Math.abs(monde.limite.centre[0] - carte.zones.arene.centre[0]) > 1e-9) centreOk = false;
    if (r.coinces.length) console.log('      coincé :', JSON.stringify(r.coinces.slice(0, 3)));
  }
  check(ok === 3 && centreOk, `3 parties propres sur la vraie carte (arène centrée sur ${carte.zones.arene.n || 'zones.arene'}), ${elims} éliminations, ${f2(ms / 1000)} s`);
  check(coinces === 0, `aucun robot coincé sur la vraie carte (${coinces} cas)`);
} else console.log('\n── (pas de poncin/carte/poncin.json : épreuve sautée)');

titre('Modules purs');
{
  const PURS = ['corps.js', 'armes.js', 'zones.js', 'jeu.js', 'bots.js', 'arene.js'];
  const src = PURS.map((f) => fs.readFileSync(path.join(__dirname, '..', 'src-poncin', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
  check(src.every((s) => !/Math\.random|Date\.now|performance\.now|document\.|window\.|THREE\./.test(s)), 'ni Math.random, ni horloge, ni DOM, ni THREE dans ' + PURS.join(', '));
  const vm = require('vm'), ctx = { self: {} }; vm.createContext(ctx);
  for (const f of ['regles.js', 'monde.js', 'nav.js', 'corps.js', 'armes.js', 'zones.js', 'bots.js', 'jeu.js', 'arene.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src-poncin', f), 'utf8'), ctx);
  const S = ctx.self;
  check(S.PCORPS && typeof S.PCORPS.deplacer === 'function' && S.PARMES && typeof S.PARMES.tirer === 'function' && S.PZONES && typeof S.PZONES.preparer === 'function' && S.PJEU.deplacer === S.PCORPS.deplacer, 'globales PCORPS, PARMES, PZONES (PJEU.deplacer = PCORPS.deplacer)');
  check(S.PBOTS && typeof S.PBOTS.penser === 'function' && S.PJEU && typeof S.PJEU.creer === 'function' && S.PARENE && S.PARENE.id === 'arene' && ['init', 'tick', 'surMort', 'apparition', 'objets', 'fini', 'resultat'].every((k) => typeof S.PARENE[k] === 'function'),
    'chargés comme dans la page (globales PBOTS, PJEU, PARENE ; crochets du mode)');
  let okPage = true; try { const m = S.PMONDE.creer(carteP), j = S.PJEU.creer({ monde: m, carte: carteP, mode: S.PARENE, graine: 1, options: { bots: 3 } }); j.ajouterJoueur({ id: 'moi', humain: true }); for (let i = 0; i < 600; i++) j.etape(DT, {}); okPage = j.erreurs === 0 && !!j.nav; } catch (e) { okPage = false; console.log('     ', e.stack); }
  check(okPage, 'une partie tourne avec les globales de la page (PNAV et PBOTS trouvés)');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
