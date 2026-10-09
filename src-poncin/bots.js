/* OPÉRATION PONCIN — les robots. PBOTS.penser(bot, jeu, dt, rnd) → une entrée de la même forme que celle d'un humain : le robot « joue »
   au joystick (avant, côté, dyaw, dpitch, tir, saut, accroupi, recharge, arme), jamais en trichant sur sa position.
   Perception (toutes les 0,1 s) : un cône de PREGLES.BOTS[niveau].champ radians devant lui, 45 m au plus, en ligne de vue (monde.vue,
   vers la poitrine ou la tête) ; il sent quelqu'un collé à lui (2,5 m) ; il entend les tirs à 30 m et les pas (debout) à 10 m
   (jeu.bruits) ; touché, il voit son agresseur jusqu'à 160 m pendant 6 s (pas de long-tir sans riposte) ; touché par quelqu'un qu'il
   ne voit pas, il se retourne vers lui et va le chercher.
   États : patrouille (chemin PNAV vers un objet utile, un point libre, ou vers là où ça se passe), chasse (dernière position vue ou bruit
   entendu, puis un tour d'horizon), combat (temps de réaction, erreur de visée qui se resserre, vitesse de rotation bornée ; tir par
   rafales ; pas de côté ; garde la bonne distance pour son arme : 8–20 m au blaster ; recharge à l'abri), fuite vers un soin sous 25 %
   de vie. Jamais coincé : s'il voulait avancer et n'a presque pas bougé en une seconde, il saute, se dégage de côté et refait son
   chemin ; trois fois de suite, il change de but. Les requêtes de chemin passent par jeu.budgetNav (2 par image pour tous les bots).
   L'état du robot est rangé dans bot.ia (et son entrée, réutilisée d'une image à l'autre). Module pur (aucun DOM, aucun THREE).
   Voir src-poncin/ARCHITECTURE.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PBOTS = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const J = REGLES.JOUEUR;
  const VUE = 45, SENT = 2.5, PERCEPTION = 0.1;  // portée de vue (m), « on le sent dans son dos » (m), période de perception (s)
  const VUE_AGRESSEUR = 160, AGRESSEUR = 6;      // celui qui vient de le toucher : vu jusqu'à 160 m (le long-tir) pendant 6 s
  const BANDE = { rafale: [8, 20], pompe: [2.5, 7], precision: [20, 42] }; // la distance que le robot cherche à garder selon son arme
  const PORTEE = { rafale: 50, pompe: 18, precision: 140 };                // au-delà, il ne tire pas
  const VIE_FUITE = 25, VIE_RASSURE = 50;
  const R_PASSE = 0.38;                          // le couloir vérifié pour couper au plus court (un peu plus que le rayon d'un joueur)
  const MEMOIRE = 7;                             // on chasse une cible perdue (ou un bruit) pendant 7 s
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const angle = (a) => { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };
  const oeil = (e) => (e.accroupi ? J.oeilAccroupi : J.oeil);
  const DIR8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];

  function cerveau(jeu, rnd) {
    return {
      jeu, ne: -1, entree: { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null },
      etat: 'patrouille', etatA: 0,
      cible: null, vuA: -1e9, reagitA: 0, cx: 0, cy: 0, cz: 0, cvx: 0, cvz: 0, erreur: 0, ex: 0, ey: 0,
      alerteA: -1e9, ax: 0, az: 0, retourne: false, bruitN: 0, toucheVu: -1, agresseur: null, agresseurA: -1e9,
      chemin: null, ic: 0, but: '', butX: 0, butZ: 0, butObjet: null, veut: false, raccourciA: 0, fouilleA: -1, fouilleSens: 1,
      mx: 0, mz: 0, vit: 1,
      strafe: 1, strafeA: 0, derive: 0, rafale: false, rafaleA: 0, changeA: 0, directA: 0, direct: true, approcheA: 0,
      abri: false, abriX: 0, abriZ: 0, abriEssai: -1,
      percoA: jeu.temps + rnd() * PERCEPTION, regard: 0, regardA: 0,
      sx: 0, sz: 0, surveilleA: 0, envie: 0, nEnvie: 0, coince: 0, decoinceA: 0, ddx: 0, ddz: 0, echecs: 0, grilleA: 0,
      fuiteA: -1e9, pasDeFuiteAvant: 0, proie: null, flairA: 0, fox: 0, foz: 0,
    };
  }
  function renaitre(bot, ia, jeu) { // (ré)apparu : on repart de zéro
    ia.ne = bot.apparuA; ia.etat = 'patrouille'; ia.etatA = jeu.temps; ia.cible = null; ia.vuA = -1e9; ia.alerteA = -1e9; ia.chemin = null; ia.veut = false; ia.but = '';
    ia.fouilleA = -1; ia.abri = false; ia.coince = 0; ia.decoinceA = 0; ia.sx = bot.x; ia.sz = bot.z; ia.surveilleA = jeu.temps + 1; ia.envie = 0; ia.nEnvie = 0;
    ia.toucheVu = bot.toucheA; ia.bruitN = jeu.nBruits; ia.fuiteA = -1e9; ia.pasDeFuiteAvant = 0; ia.rafale = false; ia.echecs = 0; ia.agresseur = null; ia.agresseurA = -1e9;
  }

  // ─── tourner le regard vers (yaw, pitch), à vitesse bornée, en ralentissant à l'arrivée (comme une main) ───
  function tourner(bot, en, yaw, pitch, vitesse, dt) {
    const gy = angle(yaw - bot.yaw), gp = Math.max(-1.45, Math.min(1.45, pitch)) - bot.pitch, g = Math.sqrt(gy * gy + gp * gp);
    if (!(g > 1e-6)) return;
    let pas = vitesse * dt * (0.35 + 0.65 * Math.min(1, g / 0.35)); if (pas > g) pas = g;
    en.dyaw = gy * pas / g; en.dpitch = gp * pas / g;
  }

  // ─── percevoir : voir, entendre, sentir les coups ───
  function percevoir(bot, ia, jeu, niv, rnd) {
    const T = jeu.temps, monde = jeu.monde, es = jeu.entites;
    const ox = bot.x, oy = bot.y + oeil(bot), oz = bot.z, fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw), cosC = Math.cos(niv.champ / 2);
    let best = null, bs = Infinity;
    const agr = ia.agresseur && T - ia.agresseurA < AGRESSEUR ? ia.agresseur : null; // celui qui vient de le toucher : vu bien plus loin
    for (let k = 0; k < es.length; k++) {
      const c = es[k]; if (c === bot || !c.vivant || !jeu.ennemis(bot, c)) continue;
      const dx = c.x - ox, dz = c.z - oz, d2 = dx * dx + dz * dz, vue = c === agr ? VUE_AGRESSEUR : VUE; if (d2 > vue * vue) continue;
      const d = Math.sqrt(d2);
      if (d > SENT && dx * fx + dz * fz < cosC * d) continue; // hors du cône
      const h = c.accroupi ? J.tailleAccroupi : J.taille;
      if (!monde.vue(ox, oy, oz, c.x, c.y + h * 0.65, c.z) && !monde.vue(ox, oy, oz, c.x, c.y + h - 0.15, c.z)) continue;
      let s = d; if (c === ia.cible) s -= 10; if (bot.parQui === c.id && T - bot.toucheA < 2) s -= 6;
      if (s < bs) { bs = s; best = c; }
    }
    if (best) {
      if (best !== ia.cible || T - ia.vuA > 1.5) { // nouvelle cible (ou revue après un moment) : le temps de réagir, l'erreur pleine
        ia.cible = best; ia.reagitA = T + niv.reaction * (0.75 + 0.5 * rnd());
        ia.erreur = niv.erreur * (0.8 + 0.6 * rnd()); const a = rnd() * 2 * Math.PI; ia.ex = Math.cos(a); ia.ey = Math.sin(a) * 0.6;
        ia.rafale = false; ia.rafaleA = 0;
      }
      ia.vuA = T; ia.cx = best.x; ia.cy = best.y; ia.cz = best.z; ia.cvx = best.vx; ia.cvz = best.vz;
    }
    // l'ouïe : les tirs et les pas des ennemis depuis la dernière écoute
    const B = jeu.bruits;
    if (!best) for (let k = 0; k < B.length; k++) {
      const b = B[k]; if (b.n <= ia.bruitN || !b.e || b.e === bot || !jeu.ennemis(bot, b.e)) continue;
      const dx = b.x - ox, dz = b.z - oz; if (dx * dx + dz * dz > b.portee * b.portee) continue;
      if (b.n > ia.bruitN && (T - ia.alerteA > 0.5 || !ia.retourne)) { ia.alerteA = T; ia.ax = b.x; ia.az = b.z; ia.retourne = false; }
    }
    ia.bruitN = jeu.nBruits;
    // touché : on retient l'agresseur (vu jusqu'à 160 m pendant 6 s, même au long-tir) ; si on ne le voit pas, on se retourne vers lui
    // et on va le chercher
    if (bot.toucheA > ia.toucheVu) {
      ia.toucheVu = bot.toucheA;
      const a = jeu.trouver(bot.parQui);
      if (a && a.vivant) { ia.agresseur = a; ia.agresseurA = T; if (a !== best) { ia.alerteA = T; ia.ax = a.x; ia.az = a.z; ia.retourne = true; } }
    }
    if (ia.agresseur && (!ia.agresseur.vivant || ia.agresseur.retire)) ia.agresseur = null;
  }

  // ─── les chemins (jeu.budgetNav : 2 requêtes par image pour tous les bots) ───
  function demander(bot, ia, jeu, x, z) { // vrai si la requête a eu lieu (chemin trouvé ou non), faux si elle attend son tour
    ia.butX = x; ia.butZ = z;
    if (!jeu.nav) { ia.chemin = [[bot.x, bot.z], [x, z]]; ia.ic = 1; ia.veut = false; return true; }
    if (jeu.budgetNav <= 0 || jeu.temps < ia.decoinceA) { ia.veut = true; return false; } // pas pendant qu'il se dégage
    jeu.budgetNav--; ia.veut = false;
    let c = null; try { c = jeu.nav.chemin(bot.x, bot.z, x, z); } catch (e) { c = null; }
    if (!c || !c.length) { ia.chemin = null; ia.echecs++; return true; }
    ia.chemin = c; ia.ic = c.length > 1 ? 1 : 0; ia.raccourciA = jeu.temps + 0.3; ia.echecs = 0;
    return true;
  }
  function surGrille(bot, jeu) { // sur la composante principale de la navigation, ou à une case d'elle
    const acc = jeu.nav && typeof jeu.monde.accessible === 'function' ? jeu.monde.accessible : null; if (!acc) return true;
    if (acc(bot.x, bot.z)) return true;
    if (jeu.nav.libre(bot.x, bot.z)) return false; // sa case est libre mais d'une autre composante : les chemins partiraient de la poche
    const p = jeu.nav.pas || 1.5;
    for (let k = 0; k < 8; k++) { const x = bot.x + DIR8[k][0] * p, z = bot.z + DIR8[k][1] * p; if (acc(x, z) && jeu.monde.passe(bot.x, bot.z, x, z, J.rayon)) return true; } // et joignable tout droit (pas derrière un mur)
    return false;
  }
  // perdu hors de la grille principale (poussé dans un passage plus étroit que la marge de la navigation) : on rejoint tout droit le
  // point le plus proche de la composante principale, vers lequel la capsule passe
  function sortir(bot, ia, jeu) {
    const monde = jeu.monde, acc = typeof monde.accessible === 'function' ? monde.accessible : null;
    for (let r = 1; r <= 10; r++) for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a), x = bot.x + dx * r, z = bot.z + dz * r;
      if ((!acc || acc(x, z)) && monde.passe(bot.x, bot.z, x, z, J.rayon + 0.01)) { ia.ddx = dx; ia.ddz = dz; ia.decoinceA = jeu.temps + r / J.vitesse + 0.35; return true; }
    }
    return false;
  }
  function suivre(bot, ia, jeu) { // vers le point courant du chemin → ia.mx, ia.mz ; vrai à l'arrivée
    ia.mx = 0; ia.mz = 0;
    const c = ia.chemin; if (!c) return false;
    let p = c[ia.ic], dx = p[0] - bot.x, dz = p[1] - bot.z, d = Math.sqrt(dx * dx + dz * dz);
    while (d < 0.7 && ia.ic < c.length - 1) { ia.ic++; p = c[ia.ic]; dx = p[0] - bot.x; dz = p[1] - bot.z; d = Math.sqrt(dx * dx + dz * dz); }
    if (ia.ic >= c.length - 1 && d < 0.9) { ia.chemin = null; return true; }
    if (jeu.temps >= ia.raccourciA && ia.ic < c.length - 1) { // couper au plus court si le point d'après est en vue directe
      ia.raccourciA = jeu.temps + 0.5;
      const q = c[ia.ic + 1];
      if (jeu.monde.passe(bot.x, bot.z, q[0], q[1], R_PASSE)) { ia.ic++; p = q; dx = p[0] - bot.x; dz = p[1] - bot.z; d = Math.sqrt(dx * dx + dz * dz); }
    }
    if (d > 1e-6) { ia.mx = dx / d; ia.mz = dz / d; }
    return false;
  }

  // ─── un but de patrouille : un objet utile, là où ça se passe (le « flair »), ou un point libre ───
  function choisirBut(bot, ia, jeu, rnd) {
    const objs = jeu.mode && jeu.mode.objets ? jeu.mode.objets(jeu) || [] : [];
    let ob = null, bd = Infinity;
    for (let k = 0; k < objs.length; k++) {
      const o = objs[k]; if (!o.dispo) continue;
      const O = REGLES.OBJETS[o.objet]; if (!O) continue;
      const interet = O.type === 'arme' ? (bot.armes.indexOf(O.arme) < 0 ? 1 : 0) : O.type === 'soin' ? (bot.vie < 70 ? 1.5 : 0) : O.type === 'armure' ? (bot.armure < 25 ? 0.6 : 0) : 0;
      if (!interet) continue;
      const d = Math.sqrt((o.x - bot.x) ** 2 + (o.z - bot.z) ** 2); if (d > 60 * interet) continue; // un détour raisonnable
      if (d / interet < bd) { bd = d / interet; ob = o; }
    }
    const r = rnd();
    if (ob && r < 0.55) { ia.but = 'objet'; ia.butObjet = ob; return [ob.x, ob.z]; }
    ia.butObjet = null;
    if (r < 0.9) { // le flair : vers l'ennemi le plus proche (ou un autre, une fois sur trois), à une dizaine de mètres près
      let n = 0, proche = null, dp = Infinity;
      for (const c of jeu.entites) if (c.vivant && jeu.ennemis(bot, c)) { n++; const d = ((c.x - bot.x) ** 2 + (c.z - bot.z) ** 2) * (c.humain ? 0.5 : 1); if (d < dp) { dp = d; proche = c; } } // un humain compte pour plus proche : c'est lui qui veut de l'action
      if (n) {
        let i = Math.floor(rnd() * n), cible = proche;
        if (rnd() < 0.33) for (const c of jeu.entites) if (c.vivant && jeu.ennemis(bot, c) && i-- === 0) { cible = c; break; }
        ia.but = 'flair'; ia.proie = cible; ia.flairA = jeu.temps + 3; const a = rnd() * 2 * Math.PI, d = 3 + 8 * rnd(); ia.fox = Math.cos(a) * d; ia.foz = Math.sin(a) * d;
        return [cible.x + ia.fox, cible.z + ia.foz];
      }
    }
    ia.but = 'balade';
    return jeu.monde.libre(rnd);
  }

  function soinProche(bot, jeu, dmax) { // un soin disponible à moins de dmax mètres ?
    const objs = jeu.mode && jeu.mode.objets ? jeu.mode.objets(jeu) || [] : [];
    for (let k = 0; k < objs.length; k++) { const o = objs[k]; if (o.dispo && o.objet === 'soin' && (o.x - bot.x) ** 2 + (o.z - bot.z) ** 2 < dmax * dmax) return true; }
    return false;
  }

  // ─── se dégager : une direction libre (vers la grille de navigation si on en est sorti), au hasard rejouable ───
  function degager(bot, ia, jeu, rnd) {
    const monde = jeu.monde;
    if (jeu.nav && !jeu.nav.libre(bot.x, bot.z)) { const p = jeu.nav.proche(bot.x, bot.z), dx = p[0] - bot.x, dz = p[1] - bot.z, d = Math.sqrt(dx * dx + dz * dz); if (d > 0.05) { ia.ddx = dx / d; ia.ddz = dz / d; return; } }
    const k0 = Math.floor(rnd() * 8);
    for (let k = 0; k < 8; k++) {
      const [dx, dz] = DIR8[(k0 + k) % 8];
      if (dx * ia.mx + dz * ia.mz > 0.8) continue; // pas droit dans le mur qui nous bloque
      if (monde.passe(bot.x, bot.z, bot.x + dx * 2.5, bot.z + dz * 2.5, J.rayon + 0.02)) { ia.ddx = dx; ia.ddz = dz; return; }
    }
    const a = rnd() * 2 * Math.PI; ia.ddx = Math.cos(a); ia.ddz = Math.sin(a);
  }

  // ─── un abri pour recharger : à 3–7 m, joignable tout droit, hors de la vue de la cible ───
  function chercherAbri(bot, ia, jeu, c, rnd) {
    const monde = jeu.monde, cy = c.y + J.oeil, k0 = Math.floor(rnd() * 8);
    for (const d of [3.5, 6.5]) for (let k = 0; k < 8; k++) {
      const [dx, dz] = DIR8[(k0 + k) % 8], px = bot.x + dx * d, pz = bot.z + dz * d;
      if (!monde.passe(bot.x, bot.z, px, pz, R_PASSE)) continue;
      if (monde.vue(c.x, cy, c.z, px, monde.hauteur(px, pz) + 1.2, pz)) continue;
      ia.abri = true; ia.abriX = px; ia.abriZ = pz; return true;
    }
    return false;
  }

  // ─── viser et tirer sur la cible : réaction, erreur qui se resserre, rafales ───
  function viser(bot, ia, jeu, niv, rnd, dt, en) {
    const T = jeu.temps, c = ia.cible; if (!c) return false;
    const vu = T - ia.vuA < 0.2 && c.vivant;
    const px = vu ? c.x : ia.cx, pz = vu ? c.z : ia.cz, py = (vu ? c.y : ia.cy) + (c.accroupi ? 0.72 : 1.12);
    const ox = bot.x, oy = bot.y + oeil(bot), oz = bot.z, dx = px - ox, dz = pz - oz, hz = Math.sqrt(dx * dx + dz * dz);
    if (T < ia.reagitA) return false; // il ne l'a pas encore « vu »
    ia.erreur *= Math.exp(-niv.resserre * dt);
    const yawC = Math.atan2(-dx, -dz) + ia.ex * ia.erreur, pitchC = Math.atan2(py - oy, hz) + ia.ey * ia.erreur;
    tourner(bot, en, yawC, pitchC, niv.vise, dt);
    // l'arme qui convient à la distance
    let voulue = 'rafale';
    if (bot.armes.indexOf('pompe') >= 0 && ((bot.munitions.pompe | 0) + (bot.reserve.pompe | 0)) > 0 && hz < 11) voulue = 'pompe';
    else if (bot.armes.indexOf('precision') >= 0 && ((bot.munitions.precision | 0) + (bot.reserve.precision | 0)) > 0 && hz > 26) voulue = 'precision';
    if (voulue !== bot.arme && T >= ia.changeA) { en.arme = voulue; ia.changeA = T + 1.5; }
    // les rafales : des fenêtres de tir et de pause ; une fenêtre sur (1 − precision) est une hésitation
    if (T >= ia.rafaleA) {
      if (ia.rafale) { ia.rafale = false; ia.rafaleA = T + (bot.arme === 'rafale' ? 0.15 + 0.35 * rnd() : 0.05 + 0.15 * rnd()); }
      else { ia.rafale = rnd() < niv.precision; ia.rafaleA = T + (bot.arme === 'rafale' ? 0.35 + 0.6 * rnd() : 0.45); }
    }
    const ry = angle(bot.yaw + en.dyaw - yawC), rp = bot.pitch + en.dpitch - pitchC, tol = Math.atan(0.5 / Math.max(1, hz)) + 0.02;
    const aligne = Math.abs(ry) < tol && Math.abs(rp) < tol * 1.5;
    en.tir = ia.rafale && aligne && vu && hz <= (PORTEE[bot.arme] || 50) && !bot.enRecharge;
    return true;
  }

  // ─── l'entrée de l'image ───
  function penser(bot, jeu, dt, rnd) {
    let ia = bot.ia;
    if (!ia || ia.jeu !== jeu) { ia = bot.ia = cerveau(jeu, rnd); }
    const en = ia.entree;
    en.avant = 0; en.cote = 0; en.dyaw = 0; en.dpitch = 0; en.tir = false; en.saut = false; en.accroupi = false; en.recharge = false; en.arme = null;
    if (!bot.vivant || jeu.fini) return en;
    if (ia.ne !== bot.apparuA) renaitre(bot, ia, jeu);
    const T = jeu.temps, niv = REGLES.BOTS[bot.niveau] || REGLES.BOTS.normal, monde = jeu.monde;
    if (T >= ia.percoA) { ia.percoA = T + PERCEPTION; percevoir(bot, ia, jeu, niv, rnd); }
    if (ia.cible && !ia.cible.vivant) { ia.cible = null; ia.vuA = -1e9; }
    const voit = !!ia.cible && T - ia.vuA < 0.35;

    // ─── l'état ───
    if (ia.etat === 'fuite' && (bot.vie >= VIE_RASSURE || T - ia.fuiteA > 9)) { ia.pasDeFuiteAvant = T + 8; ia.etat = ''; }
    let etat;
    if (ia.etat === 'fuite' || (bot.vie < VIE_FUITE && bot.invincible <= 0 && T >= ia.pasDeFuiteAvant && soinProche(bot, jeu, 50))) etat = 'fuite';
    else if (voit) etat = 'combat';
    else if ((ia.cible && T - ia.vuA < MEMOIRE) || T - ia.alerteA < MEMOIRE) etat = 'chasse';
    else etat = 'patrouille';
    if (etat !== ia.etat) {
      if (etat === 'fuite') ia.fuiteA = T;
      if (etat !== 'combat' || ia.etat === 'fuite') { ia.chemin = null; ia.veut = false; ia.but = ''; }
      ia.fouilleA = -1; ia.abri = false; ia.etat = etat; ia.etatA = T;
    }
    const A = REGLES.arme(bot.arme), mun = bot.munitions[bot.arme] | 0;
    let regarde = true; // regarder là où l'on marche (sauf en combat)
    ia.vit = 1; ia.mx = 0; ia.mz = 0;

    if (etat === 'patrouille') {
      if (!ia.chemin && !ia.veut) { const p = choisirBut(bot, ia, jeu, rnd); demander(bot, ia, jeu, p[0], p[1]); }
      else if (ia.veut) demander(bot, ia, jeu, ia.butX, ia.butZ);
      if (ia.but === 'objet' && ia.butObjet && !ia.butObjet.dispo) { ia.chemin = null; ia.veut = false; } // quelqu'un l'a pris
      if (ia.but === 'flair' && ia.chemin && T >= ia.flairA) { // la proie a bougé : on suit sa trace
        ia.flairA = T + 3; const p = ia.proie;
        if (!p || !p.vivant) { ia.chemin = null; ia.veut = false; }
        else if ((p.x + ia.fox - ia.butX) ** 2 + (p.z + ia.foz - ia.butZ) ** 2 > 64) demander(bot, ia, jeu, p.x + ia.fox, p.z + ia.foz);
      }
      suivre(bot, ia, jeu);
      if (mun < A.chargeur * 0.5 && !bot.enRecharge) en.recharge = true;
      if (T >= ia.regardA) { ia.regardA = T + 1.5 + 2.5 * rnd(); ia.regard = rnd() < 0.45 ? 0 : (rnd() * 2 - 1) * 0.8; }
    } else if (etat === 'chasse') {
      const recente = ia.cible && ia.vuA >= ia.alerteA;
      const gx = recente ? ia.cx + ia.cvx * 0.8 : ia.ax, gz = recente ? ia.cz + ia.cvz * 0.8 : ia.az;
      if (ia.fouilleA < 0) {
        if ((!ia.chemin && !ia.veut) || (ia.butX - gx) ** 2 + (ia.butZ - gz) ** 2 > 25) { if (demander(bot, ia, jeu, gx, gz) && !ia.chemin) { ia.cible = null; ia.alerteA = -1e9; } }
        else if (ia.veut) demander(bot, ia, jeu, ia.butX, ia.butZ);
        if (suivre(bot, ia, jeu)) { ia.fouilleA = T + 1 + rnd(); ia.fouilleSens = rnd() < 0.5 ? -1 : 1; }
        if (ia.retourne && T - ia.alerteA < 1.6) { // touché de dos : on fait face à l'agresseur
          regarde = false; tourner(bot, en, Math.atan2(-(ia.ax - bot.x), -(ia.az - bot.z)), 0, niv.vise, dt); ia.vit = 0.5;
        }
      } else { // arrivé : un tour d'horizon, puis on oublie
        regarde = false; en.dyaw = ia.fouilleSens * 2.2 * dt;
        if (T >= ia.fouilleA) { ia.cible = null; ia.vuA = -1e9; ia.alerteA = -1e9; ia.fouilleA = -1; }
      }
      if (mun < A.chargeur * 0.3 && !bot.enRecharge) en.recharge = true;
    } else if (etat === 'fuite') {
      if (!ia.chemin && !ia.veut) { // le soin disponible le plus proche ; sinon loin de la menace
        const objs = jeu.mode && jeu.mode.objets ? jeu.mode.objets(jeu) || [] : [];
        let ob = null, bd = Infinity;
        for (const o of objs) { if (!o.dispo || o.objet !== 'soin') continue; const d = (o.x - bot.x) ** 2 + (o.z - bot.z) ** 2; if (d < bd) { bd = d; ob = o; } }
        if (ob) { ia.but = 'soin'; ia.butObjet = ob; demander(bot, ia, jeu, ob.x, ob.z); }
        else {
          let bx = 0, bz = 0, bv = -1;
          for (let k = 0; k < 3; k++) { const p = monde.libre(rnd), v = (p[0] - ia.cx) ** 2 + (p[1] - ia.cz) ** 2; if (v > bv) { bv = v; bx = p[0]; bz = p[1]; } }
          ia.but = 'loin'; ia.butObjet = null; demander(bot, ia, jeu, bx, bz);
        }
      } else if (ia.veut) demander(bot, ia, jeu, ia.butX, ia.butZ);
      if (ia.but === 'soin' && ia.butObjet && !ia.butObjet.dispo) { ia.chemin = null; ia.veut = false; }
      if (suivre(bot, ia, jeu) && ia.but === 'loin') { ia.chemin = null; }
      if (voit && (ia.cx - bot.x) ** 2 + (ia.cz - bot.z) ** 2 < 22 * 22) { regarde = false; viser(bot, ia, jeu, niv, rnd, dt, en); } // il se défend en courant
      if (mun <= 0 && !bot.enRecharge) en.recharge = true;
    } else { // combat
      const c = ia.cible, dx = c.x - bot.x, dz = c.z - bot.z, d = Math.sqrt(dx * dx + dz * dz) || 1e-6, ux = dx / d, uz = dz / d;
      if (viser(bot, ia, jeu, niv, rnd, dt, en)) {
        regarde = false;
        if (mun <= 0 && !bot.enRecharge) en.recharge = true;
        const bande = BANDE[bot.arme] || BANDE.rafale;
        // à l'abri pour recharger
        if (bot.enRecharge && !ia.abri && T >= ia.abriEssai) { ia.abriEssai = T + 0.8; chercherAbri(bot, ia, jeu, c, rnd); }
        if (!bot.enRecharge) ia.abri = false;
        if (ia.abri) {
          const ax = ia.abriX - bot.x, az = ia.abriZ - bot.z, ad = Math.sqrt(ax * ax + az * az);
          if (ad > 0.5) { ia.mx = ax / ad; ia.mz = az / ad; } else { ia.mx = 0; ia.mz = 0; en.accroupi = true; }
        } else {
          if (T >= ia.strafeA) { ia.strafeA = T + 0.5 + 1.1 * rnd(); const r = rnd(); ia.strafe = r < 0.15 ? 0 : r < 0.575 ? -1 : 1; ia.derive = (rnd() * 2 - 1) * 0.3; }
          let radial = d > bande[1] ? 1 : d < bande[0] ? -1 : ia.derive;
          if (bot.enRecharge) radial = -0.8; // pas d'abri : on recule en rechargeant
          let strafe = ia.strafe;
          if (bot.arme === 'precision' && !bot.enRecharge) { strafe = 0; if (radial > 0) radial = 0; if (niv !== REGLES.BOTS.facile) en.accroupi = true; } // le long-tir se tire posé
          // trop loin et pas de passage direct : on suit un chemin vers elle
          if (radial > 0 && T >= ia.directA) { ia.directA = T + 0.6; ia.direct = monde.passe(bot.x, bot.z, c.x, c.z, R_PASSE); }
          if (radial > 0 && !ia.direct) {
            if ((!ia.chemin && !ia.veut && T >= ia.approcheA) || ia.veut) { ia.approcheA = T + 1.5; demander(bot, ia, jeu, c.x, c.z); }
            suivre(bot, ia, jeu); ia.mx += -uz * strafe * 0.3; ia.mz += ux * strafe * 0.3;
          } else { ia.chemin = null; ia.mx = ux * radial - uz * strafe; ia.mz = uz * radial + ux * strafe; }
          const l = Math.sqrt(ia.mx * ia.mx + ia.mz * ia.mz); if (l > 1) { ia.mx /= l; ia.mz /= l; }
          if (bot.auSol && rnd() < dt * (niv === REGLES.BOTS.fort ? 0.3 : niv === REGLES.BOTS.normal ? 0.1 : 0)) en.saut = true; // un saut de côté, pour surprendre
        }
      } else suivre(bot, ia, jeu); // pas encore réagi : il continue sa route
    }

    // ─── jamais coincé : il voulait bouger et n'a presque pas bougé en une seconde ───
    const veutBouger = ia.mx * ia.mx + ia.mz * ia.mz > 0.25;
    ia.envie += veutBouger ? 1 : 0; ia.nEnvie++;
    if (T >= ia.surveilleA) {
      const bouge = Math.sqrt((bot.x - ia.sx) ** 2 + (bot.z - ia.sz) ** 2), voulait = ia.nEnvie > 0 && ia.envie > 0.6 * ia.nEnvie;
      ia.coince = voulait && bouge < 0.6 ? ia.coince + 1 : 0;
      ia.sx = bot.x; ia.sz = bot.z; ia.envie = 0; ia.nEnvie = 0; ia.surveilleA = T + 1;
      if (ia.coince) {
        degager(bot, ia, jeu, rnd); ia.decoinceA = T + 0.5 + 0.4 * rnd(); if (bot.auSol) en.saut = true;
        ia.chemin = null; ia.veut = false; ia.abri = false;
        if (ia.etat === 'chasse' || ia.etat === 'patrouille') { if (ia.coince >= 3) { ia.but = ''; ia.cible = null; ia.vuA = -1e9; ia.alerteA = -1e9; ia.fouilleA = -1; } else if (ia.etat === 'chasse' || ia.but) ia.veut = true; }
        if (ia.coince >= 3) ia.coince = 0;
      }
    }
    // deux chemins introuvables de suite, ou plus sur la composante principale de la grille (une poche où ses chemins ne mènent
    // nulle part) : il y retourne tout droit
    if (T >= ia.grilleA && T >= ia.decoinceA) { ia.grilleA = T + 0.5; if (etat !== 'combat' && !surGrille(bot, jeu)) ia.echecs = 2; }
    if (ia.echecs >= 2 && T >= ia.decoinceA) { if (!sortir(bot, ia, jeu)) { degager(bot, ia, jeu, rnd); ia.decoinceA = T + 0.6; } ia.echecs = 0; ia.chemin = null; ia.veut = true; }
    if (T < ia.decoinceA) { ia.mx = ia.ddx; ia.mz = ia.ddz; }

    // ─── le regard en marchant : vers où l'on va (plus un coup d'œil de côté en patrouille) ───
    if (regarde && (ia.mx !== 0 || ia.mz !== 0)) tourner(bot, en, Math.atan2(-ia.mx, -ia.mz) + (etat === 'patrouille' ? ia.regard : 0), -0.04, Math.min(niv.vise, 4.5) * 0.8, dt);

    // ─── la marche : direction voulue (dans le monde) → avant / côté dans le repère du regard après rotation ───
    const yaw = bot.yaw + en.dyaw, s = Math.sin(yaw), co = Math.cos(yaw);
    en.avant = (-s * ia.mx - co * ia.mz) * ia.vit; en.cote = (co * ia.mx - s * ia.mz) * ia.vit;
    if (!fini(en.avant) || !fini(en.cote)) { en.avant = 0; en.cote = 0; }
    if (!fini(en.dyaw) || !fini(en.dpitch)) { en.dyaw = 0; en.dpitch = 0; }
    return en;
  }

  return { penser, BANDE, PORTEE, VUE };
});
