/* OPÉRATION PONCIN — les armes d'une entité : deux emplacements (principale, secondaire), changement, recharge, visée, dispersion, tirs
   instantanés (un rayon par plomb, depuis l'œil, contre le monde puis les capsules des ennemis, compensation de latence), objets.
   Conception du lot Gameplay, § 4 et § 5 ; les chiffres sont dans regles.js (PREGLES.ARMES).
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. Utilisé par jeu.js (PJEU.tirVisuel et PJEU.dispersion en sont des alias).

   Deux régimes, choisis par entité :
   - historique (e.equip === null : la partie actuelle) : on commence au blaster rafale, les armes ramassées s'ajoutent (e.armes = les
     armes possédées), une arme vide de tout est lâchée, le rafale ne tombe jamais en panne, changement en 0,3 s, dispersion d'avant
     (le Long-tir garde sa dispersion de hanche de 0,0015 tant que la visée n'est pas branchée : A.dispersionAvantVisee) ;
   - emplacements (e.equip = { p, s }, posé par PARMES.equiper avec un équipement) : e.armes = [principale, secondaire], la secondaire
     jamais à sec, changement en A.changement, visée, dispersion v2 (§ 4), une arme ramassée remplace la principale jusqu'à la mort.
   Le tir a besoin de la partie : jeu.temps, jeu.dt (le pas en cours), jeu.rnd, jeu.monde, jeu.entites, jeu.ennemis, et des crochets que
   PJEU expose pour ce module : jeu.rembobiner(tireur), jeu.restaurer(), jeu.blesser(cible, de, degats, tete, arme, out), jeu.faireBruit(e, portee). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'), require('./corps.js'));
  else root.PARMES = factory(root.PREGLES, root.PCORPS);
})(typeof self !== 'undefined' ? self : this, function (REGLES, CORPS) {
  'use strict';
  const J = REGLES.JOUEUR, P = J.postures;
  const CHANGE_ARME = 0.3;  // historique : le temps de sortir une autre arme (s)
  const KICK = 0.6;         // la part du recul de l'arme qui relève le regard
  const BASE = 'rafale';    // historique : le blaster de base, qui ne tombe jamais en panne
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angle = (a) => { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };

  // l'arme qui ne tombe jamais en panne (sa réserve ne descend jamais sous un chargeur) : la secondaire, ou le rafale (historique)
  const secours = (e) => (e.equip ? e.armes[1] : BASE);

  // ─── la dispersion (rad) ───
  // historique : l'arme (×0,7 accroupi) + le mouvement et l'air + l'ouverture des tirs précédents ;
  // v2 (§ 4) : base = A.dispersion × posture × lerp(1, A.visee.dispersion × stab, vise), stab = 1 + 2·max(0, 1 − viseStable/0,35) à la
  // lunette ; + A.dispersionMouvement·(min(1,4 ; v/5,2) + 0,6 en l'air)·(1 − 0,5·vise) + gonfle·recul·1,6·(1 − 0,3·vise)
  function dispersion(e, A) {
    if (!e.equip) {
      const mvt = Math.min(1, e.vitesse / J.vitesse) + (e.auSol ? 0 : 0.6);
      const d = A.dispersionAvantVisee != null ? A.dispersionAvantVisee : A.dispersion; // le Long-tir, jusqu'au branchement de la visée
      return d * (e.accroupi ? 0.7 : 1) + (A.dispersionMouvement || 0) * mvt + e.gonfle * (A.recul || 0.02) * 1.6;
    }
    const vise = e.vise > 0 ? e.vise : 0, V = A.visee || null;
    const post = e.corpsV2 ? (P[e.vers] && P[e.vers].dispersion != null ? P[e.vers].dispersion : 1) : (e.accroupi ? 0.7 : 1);
    const stab = V && V.viseur === 'lunette' ? 1 + 2 * Math.max(0, 1 - (e.viseStable || 0) / 0.35) : 1;
    const base = A.dispersion * post * (1 + ((V ? V.dispersion : 1) * stab - 1) * vise);
    const mvt = Math.min(1.4, e.vitesse / J.vitesse) + (e.auSol ? 0 : 0.6);
    return base + (A.dispersionMouvement || 0) * mvt * (1 - 0.5 * vise) + e.gonfle * (A.recul || 0.02) * 1.6 * (1 - 0.3 * vise);
  }

  // ─── l'équipement ───
  // PARMES.equiper(e, equip, reglages) : equip null → l'équipement historique (rafale seul) ; sinon { p, s } (ou 'p+s'), validé par
  // PREGLES.equipementDe(equip, reglages) ; la principale en main, chargeurs pleins, réserves pleines
  function equiper(e, equip, reglages) {
    e.enRecharge = false; e.rechargeJusqua = 0; e.gonfle = 0; e.vise = 0; e.viseStable = 0; e.changeJusqua = 0; e.changeReste = 0; e.slot = 0;
    if (equip == null) {
      const A = REGLES.arme(BASE);
      e.equip = null; e.arme = BASE; e.armes = [BASE]; e.munitions = { [BASE]: A.chargeur }; e.reserve = { [BASE]: A.reserve }; e.dispersion = A.dispersion;
      return e;
    }
    const q = REGLES.equipementDe(equip, reglages), Ap = REGLES.arme(q.p), As = REGLES.arme(q.s);
    e.equip = { p: q.p, s: q.s }; e.arme = q.p; e.armes = [q.p, q.s];
    e.munitions = { [q.p]: Ap.chargeur, [q.s]: As.chargeur }; e.reserve = { [q.p]: Ap.reserve, [q.s]: As.reserve };
    e.dispersion = dispersion(e, Ap);
    return e;
  }

  // ─── le changement d'arme ───
  // PARMES.changer(e, slot, jeu) : slot 0 / 1 (emplacement), ou un id d'arme possédée (compatibilité) ; rend true si l'arme change.
  // Annule la recharge (et la visée) ; le premier tir attend le temps de sortie (0,3 s historique, A.changement avec les emplacements).
  function changer(e, slot, jeu) {
    const id = typeof slot === 'number' ? e.armes[slot] : slot;
    if (typeof id !== 'string' || id === e.arme || e.armes.indexOf(id) < 0) return false;
    const T = jeu.temps, d = e.equip ? REGLES.arme(id).changement : CHANGE_ARME;
    e.arme = id; e.slot = e.armes.indexOf(id); e.enRecharge = false; e.rechargeJusqua = 0; e.prochainTir = Math.max(e.prochainTir, T + d);
    if (e.equip) { e.vise = 0; e.viseStable = 0; e.changeJusqua = T + d; e.changeReste = d; }
    return true;
  }
  function lacher(e, id, jeu) { // historique : une arme vide de tout (chargeur et réserve) : on la lâche et on reprend le blaster
    if (id === BASE || e.equip) return;
    const i = e.armes.indexOf(id); if (i >= 0) e.armes.splice(i, 1);
    delete e.munitions[id]; delete e.reserve[id];
    if (e.arme === id) changer(e, BASE, jeu);
  }

  // ─── la recharge ───
  function recharger(e, jeu, out) {
    if (e.enRecharge) return;
    const A = REGLES.arme(e.arme), m = e.munitions[e.arme] | 0;
    if (m >= A.chargeur) return;
    if ((e.reserve[e.arme] | 0) <= 0 && e.arme !== secours(e)) { if (m <= 0) lacher(e, e.arme, jeu); return; } // l'arme de secours, elle, ne tombe jamais en panne
    e.enRecharge = true; e.rechargeJusqua = jeu.temps + A.recharge;
    out.push({ t: 'recharge', id: e.id });
  }
  function finirRecharge(e) {
    e.enRecharge = false;
    const A = REGLES.arme(e.arme), m = e.munitions[e.arme] | 0, res = e.reserve[e.arme] | 0, manque = A.chargeur - m, sec = e.arme === secours(e);
    const n = sec ? manque : Math.min(manque, res); // réserve de secours
    e.munitions[e.arme] = m + n; e.reserve[e.arme] = sec ? Math.max(A.chargeur, res - n) : Math.max(0, res - n); // jamais sous un chargeur de réserve
  }

  // ─── la visée (§ 4) ───
  // PARMES.majVisee(e, en, dt) : e.vise monte de dt / A.visee.entree si la visée est demandée et permise (pas en course, pas en glissade,
  // pas pendant un changement d'arme), redescend 1,4 fois plus vite ; e.viseStable compte l'immobilité en pleine visée (deux fois plus
  // vite couché). Sans le niveau vise dans l'entrée (partie actuelle) : rien ne bouge, e.vise reste à 0.
  function majVisee(e, en, dt) {
    if (e.changeReste > 0) e.changeReste = Math.max(0, e.changeReste - dt);
    if (!(e.vise > 0) && !(en && en.vise)) { e.vise = 0; e.viseStable = 0; return e.vise; }
    const A = REGLES.arme(e.arme), entree = (A.visee && A.visee.entree) || 0.2;
    const permis = !!(en && en.vise) && !e.course && e.vers !== 'glisse' && e.posture !== 'glisse' && !(e.changeReste > 0);
    e.vise = permis ? Math.min(1, e.vise + dt / entree) : Math.max(0, e.vise - 1.4 * dt / entree);
    if (e.vise > 1 - 1e-9) e.vise = 1; else if (e.vise < 1e-9) e.vise = 0; // (les arrondis : 15 pas de 1/60 s font bien 0,25 s)
    if (e.vise >= 1 && e.vitesse < 0.3) e.viseStable = (e.viseStable || 0) + dt * (e.posture === 'couche' ? 2 : 1); else e.viseStable = 0;
    return e.vise;
  }

  // peut-on tirer ? (course, arme qu'on remonte après la course, transition vers ou depuis couché : non)
  function peutTirer(e) {
    if (e.course || e.remonte > 0) return false;
    if (e.transition > 0 && (e.vers === 'couche' || e.posture === 'couche')) return false;
    return true;
  }

  // ─── un tir : un rayon par plomb, depuis l'œil, contre le monde puis les capsules ───
  const CIBLES = [], DEGATS = [], TETES = []; // les touchés d'un tir (agrégés par cible : la pompe fait un seul « touche » par victime)
  function tirer(e, jeu, out) {
    const A = REGLES.arme(e.arme), T = jeu.temps, dt = jeu.dt || 0, monde = jeu.monde, entites = jeu.entites;
    const m = e.munitions[e.arme] | 0;
    if (m <= 0) { recharger(e, jeu, out); return; }
    e.munitions[e.arme] = m - 1;
    e.prochainTir = (e.prochainTir > T - dt ? e.prochainTir : T) + 1 / A.cadence; // cadence exacte quelle que soit l'image
    e.invincible = 0; e.dernierTir = T;
    const rnd = jeu.rnd, disp = dispersion(e, A);
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw), sp = Math.sin(e.pitch), cp = Math.cos(e.pitch);
    const d0x = -sy * cp, d0y = sp, d0z = -cy * cp;             // le regard
    const rx = cy, rz = -sy;                                      // la droite
    const ux = sy * sp, uy = cp, uz = cy * sp;                    // le haut de l'écran
    const ox = e.x, oy = e.y + CORPS.oeil(e), oz = e.z;
    const rembobine = jeu.rembobiner(e); // compensation de latence (jeu en ligne) : les autres là où le tireur les voyait
    let nc = 0;
    for (let p = 0; p < A.plombs; p++) {
      const r = disp * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI, da = Math.tan(r) * Math.cos(a), db = Math.tan(r) * Math.sin(a);
      let dx = d0x + rx * da + ux * db, dy = d0y + uy * db, dz = d0z + rz * da + uz * db;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
      const h = monde.rayon(ox, oy, oz, dx, dy, dz, A.portee);
      let tMax = h ? h.t : A.portee, cible = null, tete = false, cx = 0, cyy = 0, cz = 0;
      for (let k = 0; k < entites.length; k++) {
        const c = entites[k]; if (!c.vivant || !jeu.ennemis(e, c)) continue;
        const ddx = c.x - ox, ddz = c.z - oz; if (ddx * ddx + ddz * ddz > (tMax + 1.5) * (tMax + 1.5)) continue;
        const t = CORPS.rayon(ox, oy, oz, dx, dy, dz, c, tMax);
        if (t >= 0 && t < tMax) { tMax = t; cible = c; tete = CORPS.TOUCHE.tete; cx = CORPS.TOUCHE.cx; cyy = CORPS.TOUCHE.cy; cz = CORPS.TOUCHE.cz; }
      }
      const fx = ox + dx * tMax, fy = oy + dy * tMax, fz = oz + dz * tMax;
      let impact = null;
      if (cible) {
        const nx = fx - cx, ny = fy - cyy, nz = fz - cz, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        impact = { x: fx, y: fy, z: fz, nx: nx / nl, ny: ny / nl, nz: nz / nl, quoi: 'entite', id: cible.id };
        const deg = REGLES.degatsA(A, tMax, tete);
        let i = 0; while (i < nc && CIBLES[i] !== cible) i++;
        if (i === nc) { CIBLES[nc] = cible; DEGATS[nc] = 0; TETES[nc] = false; nc++; }
        DEGATS[i] += deg; if (tete) TETES[i] = true;
      } else if (h) impact = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, quoi: h.quoi };
      out.push({ t: 'tir', id: e.id, arme: A.id, o: [ox, oy, oz], fin: [fx, fy, fz], impact });
    }
    if (rembobine) jeu.restaurer();
    // le recul : le viseur s'ouvre, le regard se relève un peu (moins en visée)
    const vise = e.equip && e.vise > 0 ? e.vise : 0, kr = 1 - 0.3 * vise;
    e.gonfle = Math.min(1, e.gonfle + (A.gonfle != null ? A.gonfle : 0.3));
    e.pitch = borne(e.pitch + (A.recul || 0) * kr * KICK * (0.7 + 0.3 * rnd()), -1.45, 1.45);
    e.yaw = angle(e.yaw + (A.recul || 0) * kr * KICK * 0.35 * (rnd() * 2 - 1));
    jeu.faireBruit(e, 30);
    for (let i = 0; i < nc; i++) { const c = CIBLES[i]; CIBLES[i] = null; jeu.blesser(c, e, DEGATS[i], TETES[i], A.id, out); }
  }

  // un tir « pour l'image » (client en ligne : l'éclair et la traînée tout de suite, l'hôte décide des dégâts) : mêmes rayons que la
  // simulation (dispersion, plombs, monde puis capsules des ennemis vivants), événements « tir » dans out, aucun effet sur le jeu
  function tirVisuel(e, monde, entites, rnd, out) {
    const A = REGLES.arme(e.arme), disp = dispersion(e, A), o = CORPS.oeil(e);
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw), sp = Math.sin(e.pitch), cp = Math.cos(e.pitch);
    const d0x = -sy * cp, d0y = sp, d0z = -cy * cp, rx = cy, rz = -sy, ux = sy * sp, uy = cp, uz = cy * sp, ox = e.x, oy = e.y + o, oz = e.z;
    for (let p = 0; p < A.plombs; p++) {
      const r = disp * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI, da = Math.tan(r) * Math.cos(a), db = Math.tan(r) * Math.sin(a);
      let dx = d0x + rx * da + ux * db, dy = d0y + uy * db, dz = d0z + rz * da + uz * db;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
      const h = monde.rayon(ox, oy, oz, dx, dy, dz, A.portee);
      let tMax = h ? h.t : A.portee, cible = null;
      for (let k = 0; k < entites.length; k++) {
        const c = entites[k]; if (c === e || !c.vivant || c.equipe === e.equipe) continue;
        const t = CORPS.rayon(ox, oy, oz, dx, dy, dz, c, tMax); if (t >= 0 && t < tMax) { tMax = t; cible = c; }
      }
      const fx = ox + dx * tMax, fy = oy + dy * tMax, fz = oz + dz * tMax;
      const impact = cible ? { x: fx, y: fy, z: fz, nx: -dx, ny: -dy, nz: -dz, quoi: 'entite', id: cible.id } : h ? { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, quoi: h.quoi } : null;
      out.push({ t: 'tir', id: e.id, arme: A.id, o: [ox, oy, oz], fin: [fx, fy, fz], impact, local: true });
    }
    return out;
  }

  // ─── les armes d'une entité pendant un pas (après le déplacement) ───
  // PARMES.agir(e, en, dt, jeu, out) : changement (en.arme : emplacement 0 / 1 ou id ; en.changer : l'autre emplacement), fin de
  // recharge, recharge demandée, tir (ou recharge automatique du chargeur vide), le viseur qui se referme, e.dispersion (pour le HUD)
  function agir(e, en, dt, jeu, out) {
    const T = jeu.temps;
    if (typeof en.arme === 'number') changer(e, en.arme, jeu);
    else if (en.arme && en.arme !== e.arme && e.armes.indexOf(en.arme) >= 0) changer(e, en.arme, jeu);
    if (en.changer && e.equip) changer(e, e.slot ? 0 : 1, jeu);
    if (e.enRecharge && T >= e.rechargeJusqua) finirRecharge(e);
    if (en.recharge) recharger(e, jeu, out);
    if (en.tir && !e.enRecharge && T >= e.prochainTir && peutTirer(e)) tirer(e, jeu, out);
    else if (!e.enRecharge && (e.munitions[e.arme] | 0) <= 0 && T >= e.prochainTir) recharger(e, jeu, out); // chargeur vide : on recharge tout seul
    e.gonfle = Math.max(0, e.gonfle - 3.2 * dt);
  }

  // ─── les objets (munitions, armes) ───
  // utile(e, O) : l'objet sert-il à l'entité ? prendre(e, O, jeu) : l'effet (soin et armure restent dans jeu.js)
  function utile(e, O) {
    if (O.type === 'munitions') { for (const id of e.armes) { if ((e.reserve[id] | 0) < REGLES.arme(id).reserve) return true; } return false; }
    if (O.type !== 'arme') return false;
    const A = REGLES.arme(O.arme);
    if (e.equip) return e.armes[0] !== O.arme || (e.munitions[O.arme] | 0) < A.chargeur || (e.reserve[O.arme] | 0) < A.reserve;
    return e.armes.indexOf(O.arme) < 0 || (e.munitions[O.arme] | 0) < A.chargeur || (e.reserve[O.arme] | 0) < A.reserve;
  }
  function prendre(e, O, jeu) {
    if (O.type === 'munitions') { for (const id of e.armes) e.reserve[id] = Math.max(e.reserve[id] | 0, REGLES.arme(id).reserve); return; }
    if (O.type !== 'arme') return;
    const A = REGLES.arme(O.arme);
    if (e.equip) { // la principale est remplacée jusqu'à la mort (ou sa réserve remplie si c'est déjà la sienne)
      const ancienne = e.armes[0];
      if (ancienne !== O.arme) { if (ancienne !== e.armes[1]) { delete e.munitions[ancienne]; delete e.reserve[ancienne]; } e.armes[0] = O.arme; }
      e.munitions[O.arme] = A.chargeur; e.reserve[O.arme] = Math.max(e.reserve[O.arme] | 0, A.reserve);
      if (e.slot === 0 && e.arme !== O.arme) { e.arme = null; changer(e, 0, jeu); }
      else if (e.arme === O.arme && e.enRecharge) { e.enRecharge = false; e.rechargeJusqua = 0; }
      return;
    }
    const neuve = e.armes.indexOf(O.arme) < 0;
    if (neuve) e.armes.push(O.arme);
    e.munitions[O.arme] = A.chargeur; e.reserve[O.arme] = Math.max(e.reserve[O.arme] | 0, A.reserve);
    if (neuve) changer(e, O.arme, jeu); // une arme neuve passe en main
    else if (e.arme === O.arme && e.enRecharge) { e.enRecharge = false; e.rechargeJusqua = 0; }
  }

  return { dispersion, tirer, tirVisuel, majVisee, changer, recharger, finirRecharge, equiper, agir, peutTirer, utile, prendre, secours, CHANGE_ARME, KICK };
});
