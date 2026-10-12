/* OPÉRATION PONCIN — le corps d'un joueur (robot ou humain) : déplacement (regard, marche, glissement le long des murs, marche de
   0,45 m, pente, saut, gravité), postures (debout, accroupi, glissade, couché) et leurs transitions, course, réception, capsules
   touchables et rayons de tir contre elles, et la caméra subjective (balancement calé sur la foulée, œil lissé par un filtre de Holt,
   creux d'atterrissage). Conception du lot Gameplay, § 1 (C1, C2) et § 3.
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. Utilisé par jeu.js (la simulation), par la prédiction du client en
   ligne (enligne.js, via PJEU.deplacer qui en est un alias) et par rendu.js (PCORPS.camera). Voir src-poncin/ARCHITECTURE.md.

   Deux régimes, choisis à chaque pas par l'entrée :
   - entrée « historique » (sans aucun des niveaux course / couche / vise : la partie actuelle, commandes et robots) : le déplacement
     d'avant le lot Gameplay, à l'identique, sauf l'accélération devenue indépendante du pas (k = 1 − e^(−14·dt) au sol, 1 − e^(−2,2·dt)
     en l'air, au lieu de min(1, 14·dt)) ; accroupi est immédiat (2,4 m/s, œil 1,0 m, capsule 1,2 m) ;
   - entrée v2 (au moins un des niveaux course / couche / vise présent, même à false) : les postures du § 3 avec leurs transitions, la
     course, la glissade, le couché, la réception, les facteurs de vitesse (arme, visée, pente).
   e.corpsV2 dit quel régime a joué le dernier pas ; capsule et œil d'une entité « historique » se lisent sur e.accroupi (comme avant).
   Les minuteries du corps (relanceA, receptionA, remonte) sont des durées restantes en secondes : pas d'horloge, rien ne dépend du pas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PCORPS = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const J = REGLES.JOUEUR, P = J.postures, TR = J.transitions, GL = J.glissade, CO = J.couche, RE = J.reception, PE = J.pente, CR = J.courir;
  const POSTURES = ['debout', 'accroupi', 'glisse', 'couche'];
  const PENTE_MAX = J.marche / 0.3;     // la pente la plus raide qu'on monte (une marche de 0,45 m sur 30 cm, ≈ 56°)
  const R_CAPSULE = 0.4, TETE = 0.35;   // la capsule debout : rayon 0,4 m ; la tête = les 35 derniers cm (régime historique)
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, a, b) => { v = +v; return fini(v) ? borne(v, a, b) : 0; };
  const angle = (a) => { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };
  const NEUTRE = Object.freeze({ avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null });
  const estV2 = (en) => en.course !== undefined || en.couche !== undefined || en.vise !== undefined;

  // ─── l'œil et la hauteur du corps (au-dessus des pieds) ───
  function oeil(e) { return e.corpsV2 ? e.oeil : (e.accroupi ? J.oeilAccroupi : J.oeil); }
  function haut(e) { return e.corpsV2 ? e.hautCapsule : (e.accroupi ? J.tailleAccroupi : J.taille); }
  const couche = (e) => e.corpsV2 && e.posture === 'couche' && e.vers === 'couche'; // couché pour de bon : capsule couchée
  const bandeTete = (e) => (e.corpsV2 ? P[e.vers || e.posture || 'debout'].tete : TETE);

  // ─── la capsule touchable (§ 3) : rend un objet RÉUTILISÉ ───
  // debout, accroupi, glissade : axe vertical de y + 0,4 à y + haut − 0,4, rayon 0,4 ; la tête est la bande du haut (tete.haut) ;
  // couché : axe le long du regard f, de −0,65·f à +0,55·f, à y + 0,28, rayon 0,28 ; la tête est une sphère de 0,2 m à +0,75·f, y + 0,3
  const CAPS = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: R_CAPSULE, tete: { haut: TETE, x: 0, y: 0, z: 0, r: 0 } };
  function capsule(e) {
    const t = CAPS.tete;
    if (couche(e)) {
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), y = e.y + 0.28;
      CAPS.ax = e.x - 0.65 * fx; CAPS.az = e.z - 0.65 * fz; CAPS.bx = e.x + 0.55 * fx; CAPS.bz = e.z + 0.55 * fz; CAPS.ay = CAPS.by = y; CAPS.r = 0.28;
      t.haut = 0; t.x = e.x + 0.75 * fx; t.y = e.y + 0.3; t.z = e.z + 0.75 * fz; t.r = P.couche.tete;
    } else {
      const h = haut(e);
      CAPS.ax = CAPS.bx = e.x; CAPS.az = CAPS.bz = e.z; CAPS.ay = e.y + R_CAPSULE; CAPS.by = Math.max(CAPS.ay, e.y + h - R_CAPSULE); CAPS.r = R_CAPSULE;
      t.haut = bandeTete(e); t.r = 0; t.x = e.x; t.y = e.y + h; t.z = e.z;
    }
    return CAPS;
  }

  // ─── un rayon contre la capsule d'une entité : t du premier contact (≤ tMax), ou −1 ───
  // TOUCHE (réutilisé) : y du point touché, tete (la bande du haut, ou la sphère du couché), cx / cy / cz le point de l'axe (ou le centre
  // de la tête) le plus proche, pour la normale de l'impact.
  const TOUCHE = { y: 0, tete: false, cx: 0, cy: 0, cz: 0 };
  function rayonVertical(ox, oy, oz, dx, dy, dz, e, tMax) { // l'algorithme d'avant le lot Gameplay, inchangé
    const y0 = e.y + R_CAPSULE, y1 = Math.max(y0, e.y + haut(e) - R_CAPSULE), R2 = R_CAPSULE * R_CAPSULE;
    const px = ox - e.x, pz = oz - e.z;
    // dégrossi : la droite passe-t-elle à moins de R du fût (dans le plan) ?
    const a = dx * dx + dz * dz, b = px * dx + pz * dz, c = px * px + pz * pz - R2;
    let best = -1, by = 0;
    if (a > 1e-12) {
      const disc = b * b - a * c; if (disc < 0) return -1;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= tMax) { const y = oy + dy * t; if (y >= y0 && y <= y1) { best = t; by = y; } }
      else if (t < 0 && c <= 0) { const y = oy; if (y >= y0 && y <= y1) { best = 0; by = y; } } // l'origine est dans le fût
    } else if (c > 0) return -1;
    // les deux demi-sphères
    for (let k = 0; k < 2; k++) {
      const cy = k ? y1 : y0, qy = oy - cy, bb = px * dx + qy * dy + pz * dz, cc = px * px + qy * qy + pz * pz - R2, disc = bb * bb - cc;
      if (disc < 0) continue;
      let t = -bb - Math.sqrt(disc); if (t < 0) { if (cc > 0) continue; t = 0; }
      if (t > tMax || (best >= 0 && t >= best)) continue;
      const y = oy + dy * t; if (k ? y < y1 - 1e-9 : y > y0 + 1e-9) continue; // la partie de la sphère hors du fût
      best = t; by = y;
    }
    if (best >= 0) {
      TOUCHE.y = by; TOUCHE.tete = by >= e.y + haut(e) - bandeTete(e);
      TOUCHE.cx = e.x; TOUCHE.cy = borne(by, y0, y1); TOUCHE.cz = e.z;
    }
    return best;
  }
  // rayon (direction unitaire) contre une capsule quelconque [a, b], rayon r : t ≥ 0 ou −1 (0 si l'origine est dedans)
  function rayonSegment(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
    const bax = bx - ax, bay = by - ay, baz = bz - az, oax = ox - ax, oay = oy - ay, oaz = oz - az;
    const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
    // l'origine dans la capsule
    const u = baba > 0 ? borne(baoa / baba, 0, 1) : 0, qx = oax - bax * u, qy = oay - bay * u, qz = oaz - baz * u;
    if (qx * qx + qy * qy + qz * qz <= r * r) return 0;
    const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
    let h = B * B - A * C;
    if (h >= 0 && A > 1e-12) {
      const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
      if (y > 0 && y < baba) return t >= 0 ? t : -1;
    }
    // les bouts : la sphère la plus proche du point d'entrée
    let best = -1;
    for (let k = 0; k < 2; k++) {
      const cx = k ? bx : ax, cy = k ? by : ay, cz = k ? bz : az, px = ox - cx, py = oy - cy, pz = oz - cz;
      const b2 = px * dx + py * dy + pz * dz, c2 = px * px + py * py + pz * pz - r * r; h = b2 * b2 - c2;
      if (h < 0) continue; const t = -b2 - Math.sqrt(h); if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }
  function rayonSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const px = ox - cx, py = oy - cy, pz = oz - cz, b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
    if (c <= 0) return 0; const h = b * b - c; if (h < 0) return -1; const t = -b - Math.sqrt(h); return t >= 0 ? t : -1;
  }
  function rayon(ox, oy, oz, dx, dy, dz, e, tMax) {
    if (!couche(e)) return rayonVertical(ox, oy, oz, dx, dy, dz, e, tMax);
    const c = capsule(e), t = c.tete;
    const tc = rayonSegment(ox, oy, oz, dx, dy, dz, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r), tt = rayonSphere(ox, oy, oz, dx, dy, dz, t.x, t.y, t.z, t.r);
    let best = -1, tete = false;
    if (tc >= 0 && tc <= tMax) best = tc;
    if (tt >= 0 && tt <= tMax && (best < 0 || tt <= best)) { best = tt; tete = true; }
    if (best < 0) return -1;
    TOUCHE.y = oy + dy * best; TOUCHE.tete = tete;
    if (tete) { TOUCHE.cx = t.x; TOUCHE.cy = t.y; TOUCHE.cz = t.z; } else {
      const hx = ox + dx * best - c.ax, hz = oz + dz * best - c.az, bax = c.bx - c.ax, baz = c.bz - c.az, u = borne((hx * bax + hz * baz) / (bax * bax + baz * baz), 0, 1);
      TOUCHE.cx = c.ax + bax * u; TOUCHE.cy = c.ay; TOUCHE.cz = c.az + baz * u;
    }
    return best;
  }

  // ─── vitesses ───
  // la pente p (montée > 0) le long d'une direction unitaire (dx, dz)
  function penteLe(monde, x, z, dx, dz) { if (!monde.pente) return 0; const g = monde.pente(x, z); return g[0] * dx + g[1] * dz; }
  function facteurPente(p) { return p > 0 ? Math.max(PE.plancher, 1 - PE.montee * p) : Math.min(PE.plafond, 1 - PE.descente * p); }
  const transCouche = (e) => e.transition > 0 && (e.vers === 'couche' || e.posture === 'couche');
  // la vitesse de consigne d'une posture v2 (m/s, avant les facteurs) ; glissade : son élan
  function vitesseBase(e) {
    if (e.vers === 'glisse' || e.posture === 'glisse') return e.gv || 0;
    if (transCouche(e)) return P[e.vers === 'couche' ? e.posture : e.vers].vitesse * TR.vitesseCouche;
    if (e.course) return J.course;
    return P[e.vers || 'debout'].vitesse;
  }
  // PCORPS.vitesseMax(e, A, monde, dx?, dz?) : la vitesse maximale (m/s) de l'entité dans sa posture, avec l'arme A en main, sa visée,
  // la réception et la pente le long de (dx, dz) (par défaut : sa vitesse actuelle). Régime historique : 5,2 ou 2,4 m/s.
  function vitesseMax(e, A, monde, dx, dz) {
    if (!e.corpsV2) return e.accroupi ? J.vitesseAccroupi : J.vitesse;
    let v = vitesseBase(e);
    if (e.posture === 'glisse' || e.vers === 'glisse') return v;
    if (A) { v *= A.vitesse || 1; if (A.visee && e.vise > 0) v *= 1 + ((A.visee.vitesse || 1) - 1) * e.vise; }
    if (e.receptionA > 0) v *= RE.facteur;
    if (monde) {
      if (dx === undefined) { const l = Math.sqrt(e.vx * e.vx + e.vz * e.vz); if (l > 1e-6) { dx = e.vx / l; dz = e.vz / l; } else { dx = 0; dz = 0; } }
      if (dx || dz) v *= facteurPente(penteLe(monde, e.x, e.z, dx, dz));
    }
    return v;
  }
  // se coucher : au sol, pente ≤ 35 %, et la place pour le corps
  function peutCoucher(e, monde) {
    if (!e.auSol) return false;
    if (monde.pente) { const g = monde.pente(e.x, e.z); if (g[0] * g[0] + g[1] * g[1] > CO.penteMax * CO.penteMax) return false; }
    return !monde.bloque(e.x, e.z, CO.place);
  }
  // une transition de posture (linéaire, durée d) ; d ≤ 0 : immédiate
  function changerPosture(e, vers, d) {
    if (e.transition > 0) e.posture = e.vers; // une transition interrompue : on repart d'où on en est (œil et capsule continus)
    if (vers === e.posture && vers === e.vers) { e.transition = 0; return; }
    e.vers = vers; e.transition = d > 0 ? d : 0;
    if (!(d > 0)) { e.posture = vers; e.oeil = P[vers].oeil; e.hautCapsule = P[vers].haut; }
  }
  function finirGlissade(e, versAcc) {
    e.gv = 0; e.relanceA = GL.attente; changerPosture(e, versAcc ? 'accroupi' : 'debout', TR.glisse);
  }

  // ─── le déplacement (§ 3) ───
  // PCORPS.deplacer(e, en, dt, monde, A) → MV (RÉUTILISÉ) { dep, saut, glisse (début de glissade), atterrit (vy à l'atterrissage, ou 0),
  // refus ('couche' si l'entrée demande de se coucher sans la place, ou null) }. A : l'arme en main (facteur de vitesse et visée, v2).
  // Fonction pure, partagée par la simulation (jeu.etape) et la prédiction du client en ligne : même entrée, même dt → même résultat.
  // L'entrée peut donner le regard en absolu (yaw, pitch : le client en ligne) ou en variation (dyaw, dpitch).
  const MV = { dep: 0, saut: false, glisse: false, atterrit: 0, refus: null };
  function deplacer(e, en, dt, monde, A) {
    MV.dep = 0; MV.saut = false; MV.glisse = false; MV.atterrit = 0; MV.refus = null;
    if (!en || typeof en !== 'object') en = NEUTRE;
    // le regard
    if (fini(en.yaw)) e.yaw = angle(en.yaw); else e.yaw = angle(e.yaw + num(en.dyaw, -Math.PI, Math.PI));
    if (fini(en.pitch)) e.pitch = borne(en.pitch, -1.45, 1.45); else e.pitch = borne(e.pitch + num(en.dpitch, -Math.PI, Math.PI), -1.45, 1.45);
    if (!estV2(en)) return deplacerHistorique(e, en, dt, monde);
    return deplacerV2(e, en, dt, monde, A);
  }

  // le régime historique : le déplacement d'avant le lot Gameplay (seul k change)
  function deplacerHistorique(e, en, dt, monde) {
    e.corpsV2 = false;
    e.accroupi = !!en.accroupi;
    e.posture = e.vers = e.accroupi ? 'accroupi' : 'debout'; e.transition = 0; e.course = false; e.gv = 0;
    e.oeil = e.accroupi ? J.oeilAccroupi : J.oeil; e.hautCapsule = e.accroupi ? J.tailleAccroupi : J.taille;
    e.accroupiPrec = e.accroupi; e.couchePrec = false;
    // la marche : consigne dans le repère du regard, rejointe en douceur
    let av = num(en.avant, -1, 1), co = num(en.cote, -1, 1); const l = Math.sqrt(av * av + co * co); if (l > 1) { av /= l; co /= l; }
    const vmax = e.accroupi ? J.vitesseAccroupi : J.vitesse; if (av < 0) av *= J.vitesseRecul;
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
    const cvx = (-sy * av + cy * co) * vmax, cvz = (-cy * av - sy * co) * vmax, k = 1 - Math.exp(-dt * (e.auSol ? J.accel.sol : J.accel.air));
    e.vx += (cvx - e.vx) * k; e.vz += (cvz - e.vz) * k;
    const dep = avancer(e, dt, monde);
    if (e.auSol) { e.vx = MV_MX / dt; e.vz = MV_MZ / dt; } // un mur a mangé une partie de l'élan
    e.vitesse = dep / dt;
    // saut et gravité ; au sol, on suit le relief (une pente qui descend trop vite : on tombe)
    if (en.saut && e.auSol) { e.vy = J.saut; e.auSol = false; MV.saut = true; }
    gravite(e, dt, monde);
    MV.dep = dep;
    return MV;
  }
  // un pas de déplacement horizontal (vx, vz) : monde.deplacer, puis les refus (marche trop haute, talus trop raide) ; rend la distance
  let MV_MX = 0, MV_MZ = 0;
  function avancer(e, dt, monde) {
    const x0 = e.x, z0 = e.z;
    if (e.vx * e.vx + e.vz * e.vz > 1e-8) {
      const p = monde.deplacer(e.x, e.z, e.vx * dt, e.vz * dt, J.rayon), px = p[0] - e.x, pz = p[1] - e.z, pl = Math.sqrt(px * px + pz * pz);
      let ok = monde.hauteur(p[0], p[1]) - e.y <= J.marche; // plus haut qu'une marche d'un coup : on ne monte pas
      if (ok && pl > 1e-6 && monde.pente) { const g = monde.pente(p[0], p[1]); if ((g[0] * px + g[1] * pz) / pl > PENTE_MAX) ok = false; } // un talus plus raide qu'une marche de 0,45 m sur 30 cm
      if (ok) { e.x = p[0]; e.z = p[1]; }
    }
    MV_MX = e.x - x0; MV_MZ = e.z - z0;
    return Math.sqrt(MV_MX * MV_MX + MV_MZ * MV_MZ);
  }
  // collage au sol (on décolle seulement si le sol est plus bas de plus de 0,6 m), puis la parabole exacte : même saut à 30 ou 120 images/s
  function gravite(e, dt, monde) {
    const sol = monde.hauteur(e.x, e.z);
    if (e.auSol) { if (sol < e.y - 0.6) { e.auSol = false; e.vy = 0; } else { e.y = sol; e.vy = 0; } }
    if (!e.auSol) {
      e.y += e.vy * dt - 0.5 * J.gravite * dt * dt; e.vy -= J.gravite * dt;
      if (e.y <= sol) { MV.atterrit = e.vy; e.y = sol; e.vy = 0; e.auSol = true; }
    }
  }

  // le régime v2 : postures, course, glissade, couché, réception, facteurs de vitesse
  function deplacerV2(e, en, dt, monde, A) {
    if (!e.corpsV2) { // on arrive du régime historique : la posture d'où l'on part
      e.corpsV2 = true; const p = e.accroupi ? 'accroupi' : 'debout';
      e.posture = e.vers = p; e.transition = 0; e.oeil = P[p].oeil; e.hautCapsule = P[p].haut; e.course = false; e.gv = 0;
      if (!(e.relanceA >= 0)) e.relanceA = 0; if (!(e.receptionA >= 0)) e.receptionA = 0; if (!(e.remonte >= 0)) e.remonte = 0; if (!(e.vise >= 0)) e.vise = 0;
    }
    if (e.relanceA > 0) e.relanceA = Math.max(0, e.relanceA - dt);
    if (e.receptionA > 0) e.receptionA = Math.max(0, e.receptionA - dt);
    if (e.remonte > 0) e.remonte = Math.max(0, e.remonte - dt);
    let av = num(en.avant, -1, 1), co = num(en.cote, -1, 1); const l = Math.sqrt(av * av + co * co); if (l > 1) { av /= l; co /= l; }
    const veutAcc = !!en.accroupi, veutCou = !!en.couche, frontAcc = veutAcc && !e.accroupiPrec, frontCou = veutCou && !e.couchePrec;
    e.accroupiPrec = veutAcc; e.couchePrec = veutCou;
    const vise = e.vise || 0, vh = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    let glisse = e.vers === 'glisse';
    // ─ les postures (au sol) ─
    if (!glisse && e.auSol) {
      const pos = e.vers;
      if (frontAcc && e.course && vh >= GL.vMin && e.relanceA <= 0 && pos === 'debout') { // la glissade : passer accroupi en courant
        e.gv = Math.min(GL.vMax, vh + GL.elan); e.gdx = e.vx / vh; e.gdz = e.vz / vh; e.course = false;
        changerPosture(e, 'glisse', TR.glisse); glisse = true; MV.glisse = true;
      } else if (veutCou) {
        if (pos !== 'couche') { if (peutCoucher(e, monde)) changerPosture(e, 'couche', pos === 'accroupi' ? TR.coucheAccroupi : TR.coucheDebout); else if (frontCou) MV.refus = 'couche'; }
      } else if (pos === 'couche') changerPosture(e, veutAcc ? 'accroupi' : 'debout', veutAcc ? TR.coucheAccroupi : TR.coucheDebout);
      else { const v = veutAcc ? 'accroupi' : 'debout'; if (v !== pos) changerPosture(e, v, TR.accroupi); }
    }
    // ─ la course ─
    const etaitCourse = e.course;
    e.course = !glisse && !!en.course && e.vers === 'debout' && e.posture === 'debout' && e.transition <= 0 && e.auSol && av >= CR.avant && Math.abs(Math.atan2(co, av)) <= CR.angle && vise < CR.vise && !en.tir;
    if (etaitCourse && en.tir) e.remonte = CR.remonte; // tirer coupe la course : le temps de remonter l'arme
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
    let dep;
    if (glisse) {
      // ─ la glissade : l'élan décroît (frottement + pente), le côté infléchit la trajectoire, le regard reste libre ─
      const p = penteLe(monde, e.x, e.z, e.gdx, e.gdz);
      e.gv = Math.min(GL.vMax, Math.max(0, e.gv + (-(GL.f0 + GL.kf * e.gv) - GL.gPente * J.gravite * p / Math.sqrt(1 + p * p)) * dt));
      if (co !== 0 && e.gv > 0.5) { // l'accélération de côté (repère du regard), projetée sur la normale de la trajectoire
        // côté du joystick = droite du regard (cos yaw, −sin yaw) ; n = normale de la trajectoire ; l'angle tourne de a_n·dt/v
        const nx = -e.gdz, nz = e.gdx, an = GL.inflechir * co * (cy * nx - sy * nz), w = an * dt / e.gv;
        const gx = e.gdx + nx * w, gz = e.gdz + nz * w, gl = Math.sqrt(gx * gx + gz * gz); e.gdx = gx / gl; e.gdz = gz / gl;
      }
      e.vx = e.gdx * e.gv; e.vz = e.gdz * e.gv;
      dep = avancer(e, dt, monde);
      e.vitesse = dep / dt;
      if (en.saut && e.auSol) { // un saut garde 90 % de l'élan
        const g = e.gv * GL.sautGarde; e.vx = e.gdx * g; e.vz = e.gdz * g; e.gv = 0; e.relanceA = GL.attente; changerPosture(e, 'debout', TR.sautAccroupi);
        e.vy = J.saut; e.auSol = false; MV.saut = true;
      } else if (dep < GL.mur * e.gv * dt) { e.vx = MV_MX / dt; e.vz = MV_MZ / dt; finirGlissade(e, veutAcc); } // contre un mur
      else if (e.gv <= GL.fin) finirGlissade(e, veutAcc);
      else { e.vx = MV_MX / dt; e.vz = MV_MZ / dt; }
    } else {
      // ─ la marche, la course, l'accroupi, le rampé ─
      if (av < 0) av *= J.vitesseRecul;
      let dx = -sy * av + cy * co, dz = -cy * av - sy * co; const dl = Math.sqrt(dx * dx + dz * dz);
      const vmax = dl > 1e-9 ? vitesseMax(e, A, monde, dx / dl, dz / dl) : 0;
      const cvx = dx * vmax, cvz = dz * vmax, k = 1 - Math.exp(-dt * (e.auSol ? J.accel.sol : J.accel.air));
      e.vx += (cvx - e.vx) * k; e.vz += (cvz - e.vz) * k;
      dep = avancer(e, dt, monde);
      if (e.auSol) { e.vx = MV_MX / dt; e.vz = MV_MZ / dt; }
      e.vitesse = dep / dt;
      if (en.saut && e.auSol) {
        if (e.vers === 'couche' || e.posture === 'couche') changerPosture(e, 'accroupi', TR.coucheAccroupi); // couché, sauter fait passer accroupi
        else {
          if (e.vers !== 'debout' || e.transition > 0) changerPosture(e, 'debout', TR.sautAccroupi); // accroupi : le corps se relève en 0,1 s
          e.vy = J.saut; e.auSol = false; MV.saut = true; e.course = false;
        }
      }
    }
    if (!e.auSol && e.vers === 'glisse') finirGlissade(e, veutAcc); // une glissade qui quitte le sol
    const avant = e.auSol;
    gravite(e, dt, monde);
    if (!avant && e.auSol && MV.atterrit < RE.vy) e.receptionA = RE.duree; // une chute dure : vitesse × 0,5 pendant 0,25 s
    // ─ la transition : œil et capsule suivent de façon linéaire ─
    if (e.transition > 0) {
      const c = P[e.vers], u = Math.min(1, dt / e.transition);
      e.oeil += (c.oeil - e.oeil) * u; e.hautCapsule += (c.haut - e.hautCapsule) * u; e.transition -= dt;
      if (e.transition <= 1e-9) { e.transition = 0; e.posture = e.vers; e.oeil = c.oeil; e.hautCapsule = c.haut; }
    }
    e.accroupi = e.posture !== 'debout';
    MV.dep = dep;
    return MV;
  }

  // ─── la caméra subjective (C1 + C2, § 1) ───
  // PCORPS.camera(opts?) → fonction (e, dt) → { y, cote, roulis, k, phase } (objet RÉUTILISÉ) : chaque appel de PCORPS.camera crée une
  // caméra avec son propre état (une par vue). e : x, y, z, auSol, vy (et posture, course, vise, corpsV2 s'ils sont là) ; dt : l'image.
  // y : hauteur absolue de l'œil affiché = œil lissé (Holt : niveau + tendance, aucun retard sur une pente régulière ; net au-delà de
  // 0,6 m d'écart) + balancement vertical + creux d'atterrissage ; cote : décalage de côté (m, vers la droite) ; roulis (rad) ;
  // k : part du balancement (0 à l'arrêt ou en l'air, 1 à 5,2 m/s) ; phase : la phase φ de la foulée (pour l'arme et les avatars, C3).
  // opts : { balancement: 'normal' | 'doux' (× 0,5) | 'aucun' }. Le tir part toujours de l'œil de la simulation, pas de cet œil-ci.
  const BAL = { normal: 1, doux: 0.5, aucun: 0 };
  const AMPL = { debout: 0.012, course: 0.018, accroupi: 0.006, glisse: 0, couche: 0 };
  function camera(opts) {
    const o = opts || {};
    const C = { niveau: NaN, tendance: 0, phase: 0, vit: 0, px: 0, pz: 0, creux: 0, vcreux: 0, vyAir: 0, enAir: false, bal: BAL[o.balancement] != null ? BAL[o.balancement] : 1 };
    const OUT = { y: 0, cote: 0, roulis: 0, k: 0, phase: 0 };
    const f = function (e, dt) {
      const vrai = e.y + oeil(e);
      if (!(dt > 0)) dt = 1e-4;
      if (C.niveau !== C.niveau) { C.niveau = vrai; C.tendance = 0; C.px = e.x; C.pz = e.z; }
      // C2 — Holt : prévision, correction vers la mesure ; constantes de temps indépendantes de l'image
      const prev = C.niveau + C.tendance * dt, a = 1 - Math.exp(-dt / 0.05), b = 1 - Math.exp(-dt / 0.09);
      const niveau = prev + a * (vrai - prev); C.tendance += b * ((niveau - C.niveau) / dt - C.tendance); C.niveau = niveau;
      if (Math.abs(C.niveau - vrai) > 0.6) { C.niveau = vrai; C.tendance = 0; } // téléportation, réapparition : net
      // le creux d'atterrissage : −min(0,10 ; 0,02·|vy|), résorbé par un ressort amorti critique (ω = 14/s), en solution exacte
      if (e.auSol === false) { C.enAir = true; C.vyAir = e.vy || 0; }
      else if (C.enAir) { C.enAir = false; C.creux = -Math.min(0.10, 0.02 * Math.abs(C.vyAir)); C.vcreux = 0; }
      if (C.creux !== 0 || C.vcreux !== 0) {
        const w = 14, ex = Math.exp(-w * dt), c2 = C.vcreux + w * C.creux;
        C.creux = (C.creux + c2 * dt) * ex; C.vcreux = (C.vcreux - w * c2 * dt) * ex;
        if (Math.abs(C.creux) < 1e-5 && Math.abs(C.vcreux) < 1e-4) { C.creux = 0; C.vcreux = 0; }
      }
      // C1 — la foulée : longueur de pas 0,75 + 0,2·v (m), φ += π·d/pas (une foulée de deux pas = 2π)
      const dx = e.x - C.px, dz = e.z - C.pz, d = Math.sqrt(dx * dx + dz * dz); C.px = e.x; C.pz = e.z;
      const v = d < 3 ? d / dt : 0; C.vit += (Math.min(9, v) - C.vit) * (1 - Math.exp(-dt * 8));
      if (d < 3) { C.phase += Math.PI * d / (0.75 + 0.2 * C.vit); if (C.phase > 1e4) C.phase -= 2 * Math.PI * Math.floor(C.phase / (2 * Math.PI)); }
      const k = Math.min(1, C.vit / J.vitesse) * (e.auSol === false ? 0 : 1);
      const post = e.corpsV2 ? (e.course ? 'course' : e.vers || 'debout') : (e.accroupi ? 'accroupi' : 'debout');
      const ampl = AMPL[post] != null ? AMPL[post] : AMPL.debout, vise = e.vise > 0 ? e.vise : 0, m = C.bal * k * (1 - 0.8 * vise);
      const s = Math.sin(C.phase);
      OUT.y = C.niveau - ampl * m * (1 - Math.cos(2 * C.phase)) / 2 + C.creux;
      OUT.cote = 0.006 * m * (ampl > 0 ? 1 : 0) * s; OUT.roulis = 0.0025 * m * (ampl > 0 ? 1 : 0) * s; OUT.k = k; OUT.phase = C.phase;
      return OUT;
    };
    f.regler = (op) => { if (op && BAL[op.balancement] != null) C.bal = BAL[op.balancement]; };
    f.remettre = () => { C.niveau = NaN; C.creux = 0; C.vcreux = 0; C.enAir = false; C.vit = 0; };
    return f;
  }

  return { deplacer, capsule, rayon, TOUCHE, oeil, haut, vitesseMax, peutCoucher, changerPosture, camera, estV2, POSTURES, NEUTRE, R_CAPSULE, TETE, PENTE_MAX };
});
