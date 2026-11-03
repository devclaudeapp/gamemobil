/* DERNIER REMPART — le mode Infection : c'est TOI l'épidémie. Tu es un gros zombie (au joystick) ; des survivants (l'ordinateur) fuient
   en te tirant dessus. Ceux que tu mords deviennent des zombies à ton service, qui traquent les autres. Tout le monde infecté avant la fin
   du chrono : l'épidémie gagne ; tombé sous les balles ou le temps écoulé : les survivants tiennent.
   L'état a la forme d'une partie ordinaire (src-zombies/jeu.js) pour que le rendu, les sons et la caméra servent tels quels : les survivants
   sont dans jeu.joueurs (avec leurs armes : leurs tirs font des traçantes), toi et tes infectés dans jeu.zombies ; jeu.camera : toi.
   Module pur (Node) : ZINFECTION.creer({ arene, graine, survivants }), pas(jeu, entree, dt) → événements, bondir(jeu). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./donnees.js'), require('./monde.js'), require('../src-poncin/nav.js'), require('./jeu.js'));
  else root.ZINFECTION = factory(root.ZDONNEES, root.ZMONDE, root.PNAV, root.ZJEU);
})(typeof self !== 'undefined' ? self : this, function (D, M, PNAV, J) {
  'use strict';
  const TAU = Math.PI * 2;
  const R = {
    duree: 150, survivants: 6, // le chrono, le nombre de survivants
    moi: { vie: 240, vitesse: 4.7, rayon: 0.62, regen: 6, calme: 3, bond: { vitesse: 12, duree: 0.38, recharge: 3.5 } },
    allie: { vitesse: 3.9, rayon: 0.42 },
    survivant: { vitesse: 4.15, rayon: 0.42, portee: 8.5, cadence: 2.2, degatsMoi: 7, degatsAllie: 16, vieAllie: 60 },
    morsure: 0.95, // la distance d'une morsure (au contact)
    points: { morsure: 100, allie: 60 },
  };
  const ARMES_BOTS = ['pistolet', 'revolver', 'mitraillette', 'pompe', 'fusil', 'jumeaux'];

  function creer(o) {
    o = o || {};
    const id = D.ARENES[o.arene] ? o.arene : 'jardin', A = D.ARENES[id], monde = M.creer(A);
    const rnd = J.mulberry32((o.graine >>> 0) || 7), n = o.survivants || R.survivants;
    const jeu = {
      mode: 'infection', arene: id, A, monde, rnd, graine: o.graine || 7, nav: PNAV ? PNAV.creer(monde, { pas: 0.75, marge: 0.5, reperes: 4 }) : null,
      t: 0, n: 0, prochainId: 10, vague: 1, phase: 'vague', chrono: 0, aSortir: 0, totalVague: n, fini: false, gagne: null, raison: '',
      joueurs: [], zombies: [], defenses: [], objets: [], crachats: [], obus: [], disques: [], zones: [], crochets: [], chutes: [], morts: [],
      meteo: A.meteo || 'clair', serie: { n: 0, t: -99, mult: 1 }, stats: { tues: 0, ferraille: 0, tirs: 0, construits: 0, parType: {}, crits: 0, grenades: 0, caisses: 0 },
      evs: [], reste: R.duree, mordus: 0, score: 0, bondT: 0, bond: 0, calme: 0, vedettes: [], mod: { zVie: 1, zVitesse: 1, nombre: 1, ferraille: 1, points: 1 },
    };
    // toi : un costaud, au départ de l'arène
    const moi = { id: 1, type: 'costaud', x: A.depart[0], z: A.depart[1], vie: R.moi.vie, vieMax: R.moi.vie, vitesse: R.moi.vitesse, rayon: R.moi.rayon, angle: -Math.PI / 2,
      flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, vx: 0, vz: 0, moi: true };
    jeu.zombies.push(moi); jeu.moiZ = moi; jeu.camera = moi;
    // les survivants : dispersés loin de toi, chacun avec son arme
    for (let k = 0; k < n; k++) {
      let p = null;
      for (let essai = 0; essai < 40 && !p; essai++) { const a = rnd() * TAU, r = 8 + rnd() * (A.taille / 2 - 10), x = Math.cos(a) * r, z = Math.sin(a) * r; if (!monde.bloque(x, z, 0.5) && Math.hypot(x - moi.x, z - moi.z) > 8) p = [x, z]; }
      if (!p) p = monde.libreProche(A.taille / 3 * (k % 2 ? 1 : -1), A.taille / 3 * (k % 3 - 1), 0.5, 6) || [0, 6];
      const arme = ARMES_BOTS[k % ARMES_BOTS.length], skins = Object.keys(D.SURVIVANTS);
      jeu.joueurs.push({ id: 'b' + k, pseudo: 'Survivant', x: p[0], z: p[1], vx: 0, vz: 0, angle: rnd() * TAU, rayon: R.survivant.rayon, vie: 1, vieMax: 1, vivant: true, invul: 0,
        armes: [{ id: arme, mun: Infinity }, null], main: 0, attente: rnd(), visee: 0, bouge: 0, skin: skins[(k * 5 + 2) % skins.length], finitions: {}, couleur: '#FF6B5B', emote: null, parti: false, peur: 0 });
    }
    return jeu;
  }

  const ev = (jeu, e) => jeu.evs.push(e);
  function bondir(jeu) { if (jeu.fini || jeu.bondT > 0) return false; jeu.bond = R.moi.bond.duree; jeu.bondT = R.moi.bond.recharge; ev(jeu, { t: 'saute', id: 1, x: jeu.moiZ.x, z: jeu.moiZ.z }); return true; }

  function pas(jeu, entree, dt) {
    dt = dt || 1 / 60; jeu.evs.length = 0; if (jeu.fini) return jeu.evs;
    jeu.t += dt; jeu.n++; jeu.reste -= dt;
    const moi = jeu.moiZ, monde = jeu.monde, vivants = jeu.joueurs.filter((j) => j.vivant);
    // toi : le joystick (et le bond)
    let mx = entree ? +entree.mx || 0 : 0, mz = entree ? +entree.mz || 0 : 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    if (jeu.bondT > 0) jeu.bondT -= dt;
    const v = jeu.bond > 0 ? R.moi.bond.vitesse : moi.vitesse; if (jeu.bond > 0) { jeu.bond -= dt; if (l < 0.1) { mx = Math.cos(moi.angle); mz = Math.sin(moi.angle); } }
    moi.vx = mx * v; moi.vz = mz * v; moi.x += moi.vx * dt; moi.z += moi.vz * dt; monde.pousser(moi);
    if (l > 0.05 || jeu.bond > 0) moi.angle = Math.atan2(mz, mx);
    moi.bouge = l > 0.05 || jeu.bond > 0 ? 1 : 0; if (moi.flash > 0) moi.flash -= dt; moi.attaque = Math.max(0, moi.attaque - dt);
    jeu.calme += dt; if (jeu.calme > R.moi.calme && moi.vie < moi.vieMax) moi.vie = Math.min(moi.vieMax, moi.vie + R.moi.regen * dt);
    // les morsures : toi et tes infectés, au contact d'un survivant
    for (const z of jeu.zombies) {
      if (z.vie <= 0) continue;
      for (const j of vivants) {
        if (!j.vivant || Math.hypot(j.x - z.x, j.z - z.z) > R.morsure + (z.moi ? 0.2 : 0)) continue;
        j.vivant = false; j.parti = true; jeu.mordus++; z.attaque = 0.3;
        jeu.score += z.moi ? R.points.morsure : R.points.allie; jeu.stats.tues++;
        const a = { id: jeu.prochainId++, type: 'coureur', x: j.x, z: j.z, vie: R.survivant.vieAllie, vieMax: R.survivant.vieAllie, vitesse: R.allie.vitesse, rayon: R.allie.rayon, angle: j.angle,
          flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: jeu.t, chemin: null, ci: 0, repense: 0 };
        jeu.zombies.push(a);
        ev(jeu, { t: 'infecte', id: j.id, x: j.x, z: j.z, par: z.moi ? 'moi' : 'allie' });
      }
    }
    // tes infectés : vers le survivant le plus proche (le chemin A* quand la voie n'est pas libre)
    const restants = jeu.joueurs.filter((j) => j.vivant);
    for (const z of jeu.zombies) {
      if (z.moi || z.vie <= 0) continue;
      if (jeu.t - z.naissance < 0.7) { z.bouge = 0; continue; }
      let cible = null, best = Infinity; for (const j of restants) { const d = (j.x - z.x) ** 2 + (j.z - z.z) ** 2; if (d < best) { best = d; cible = j; } }
      if (!cible) { z.bouge = 0; continue; }
      let tx = cible.x, tz = cible.z; z.repense -= dt;
      if (z.repense <= 0) { z.repense = 0.5; z.chemin = monde.passe(z.x, z.z, tx, tz, 0.4) || !jeu.nav ? null : jeu.nav.chemin(z.x, z.z, tx, tz); z.ci = 1; }
      if (z.chemin && z.chemin.length > 1) { while (z.ci < z.chemin.length - 1 && Math.hypot(z.chemin[z.ci][0] - z.x, z.chemin[z.ci][1] - z.z) < 0.6) z.ci++; tx = z.chemin[z.ci][0]; tz = z.chemin[z.ci][1]; }
      const dx = tx - z.x, dz = tz - z.z, dd = Math.hypot(dx, dz) || 1;
      z.x += dx / dd * z.vitesse * dt; z.z += dz / dd * z.vitesse * dt; z.angle = Math.atan2(dz, dx); z.bouge = 1; monde.pousser(z);
      if (z.flash > 0) z.flash -= dt;
    }
    // les survivants : ils fuient (loin des zombies, sans se coincer dans un coin) et tirent sur le plus proche
    const S = R.survivant;
    for (const j of restants) {
      let fx = 0, fz = 0, proche = null, pd = Infinity;
      for (const z of jeu.zombies) { if (z.vie <= 0) continue; const dx = j.x - z.x, dz = j.z - z.z, d2 = dx * dx + dz * dz + 0.05; if (d2 < 140) { fx += dx / d2 * (z.moi ? 2 : 1); fz += dz / d2 * (z.moi ? 2 : 1); } if (d2 < pd && monde.vue(j.x, j.z, z.x, z.z)) { pd = d2; proche = z; } }
      const demi = jeu.A.taille / 2, mur = 4; // les bords repoussent (sinon ils s'acculent)
      if (j.x > demi - mur) fx -= (j.x - demi + mur) * 0.4; if (j.x < -demi + mur) fx += (-demi + mur - j.x) * 0.4; if (j.z > demi - mur) fz -= (j.z - demi + mur) * 0.4; if (j.z < -demi + mur) fz += (-demi + mur - j.z) * 0.4;
      const fl = Math.hypot(fx, fz); let vx = 0, vz = 0;
      if (fl > 0.02) { vx = fx / fl; vz = fz / fl; if (monde.bloque(j.x + vx * 0.9, j.z + vz * 0.9, 0.45)) { const t = vx; vx = -vz; vz = t; if (monde.bloque(j.x + vx * 0.9, j.z + vz * 0.9, 0.45)) { vx = -vx; vz = -vz; } } }
      const vit = S.vitesse * (fl > 0.02 ? Math.min(1, fl * 8) : 0);
      j.x += vx * vit * dt; j.z += vz * vit * dt; monde.pousser(j); j.vx = vx * vit; j.vz = vz * vit; j.bouge = vit / S.vitesse;
      // le tir
      j.attente -= dt; j.visee = 0;
      if (proche && pd < S.portee * S.portee) {
        const a = Math.atan2(proche.z - j.z, proche.x - j.x); j.angle = a; j.visee = 1;
        if (j.attente <= 0) {
          j.attente = 1 / S.cadence * (0.8 + jeu.rnd() * 0.4); const d = Math.sqrt(pd), rate = jeu.rnd() < 0.25; // un quart des balles se perdent
          ev(jeu, { t: 'tir', de: j.id, arme: D.ARMES[j.armes[0].id].classe, cle: j.armes[0].id, x: j.x + Math.cos(a) * 0.5, z: j.z + Math.sin(a) * 0.5, a: a + (rate ? (jeu.rnd() - 0.5) * 0.4 : 0), l: d, touche: !rate, b: 0 });
          if (!rate) {
            const deg = proche.moi ? S.degatsMoi : S.degatsAllie; proche.vie -= deg; proche.flash = 0.12; if (proche.moi) jeu.calme = 0;
            ev(jeu, { t: 'touche', cible: proche.id, x: proche.x, z: proche.z, degats: deg, crit: false, de: j.id, boss: false });
            if (proche.vie <= 0 && !proche.moi) ev(jeu, { t: 'mort', id: proche.id, type: proche.type, x: proche.x, z: proche.z, a: proche.angle, points: 0, par: j.id, boss: false, kx: Math.cos(a), kz: Math.sin(a), fort: true });
          }
        }
      } else if (vit > 0.1) j.angle = Math.atan2(vz, vx);
    }
    for (let i = jeu.zombies.length - 1; i >= 0; i--) if (jeu.zombies[i].vie <= 0 && !jeu.zombies[i].moi) jeu.zombies.splice(i, 1);
    jeu.totalVague = jeu.joueurs.length; jeu.aSortir = 0;
    // la fin
    if (moi.vie <= 0) fin(jeu, false, 'abattu');
    else if (!jeu.joueurs.some((j) => j.vivant)) { jeu.score += Math.round(jeu.reste * 10); fin(jeu, true, ''); }
    else if (jeu.reste <= 0) fin(jeu, false, 'temps');
    return jeu.evs;
  }
  function fin(jeu, gagne, raison) { jeu.fini = true; jeu.gagne = gagne; jeu.raison = raison; jeu.phase = 'fin'; jeu.reste = Math.max(0, jeu.reste); ev(jeu, { t: gagne ? 'victoire' : 'echec', raison }); }
  const restants = (jeu) => jeu.joueurs.filter((j) => j.vivant).length;
  return { creer, pas, bondir, restants, R };
});
