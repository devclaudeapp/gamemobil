/* DERNIER REMPART — la simulation d'une partie, à pas fixe (1/60 s), sans DOM ni THREE : elle tourne telle quelle dans Node (tests) et,
   plus tard, chez l'hôte d'un salon (les joueurs sont déjà une liste). Le hasard passe par un générateur à graine (mulberry32) : même
   graine, mêmes entrées → même partie.
   API :
     ZJEU.creer({ arene: 'jardin', graine, joueurs: [{ id, pseudo }] }) → jeu
     ZJEU.pas(jeu, entrees, dt)      entrees : { idJoueur: { mx, mz } } (déplacement voulu, vecteur du monde de longueur ≤ 1) ; rend jeu.evs (événements du pas)
     ZJEU.construire(jeu, id, type)  → { ok, raison? }   pose une défense devant le survivant (ferraille, nombre permis par vague)
     ZJEU.ameliorer(jeu, id, type)   → { ok, raison? }
     ZJEU.changerArme(jeu, id, i)    → bool              (emplacement 0 : le pistolet ; 1 : l'arme trouvée)
     ZJEU.passer(jeu)                                    lance la vague suivante sans attendre la fin de la pause
     ZJEU.prixDefense / prixAmelioration / maxDefenses / compteDefenses : pour l'interface
   Événements (jeu.evs, vidés à chaque pas) : tir { de, arme, x, z, a, l, touche }, touche { cible, x, z, degats }, mort { id, type, x, z, points },
   blesse { id, degats }, ramasse { id, quoi, valeur, arme? }, construit { type, x, z }, casse { type, x, z }, boum { x, z, r }, crachat { x, z },
   vague { n, total }, vagueFinie { n, prime }, serie { mult }, fin { score, vague, tues }, arme { id, arme }, vide { id }.
   Unités : mètres, secondes. Angles : 0 vers +x, sens trigonométrique dans le plan (x, z) (a = atan2(dz, dx)). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./donnees.js'), require('./monde.js'), require('../src-poncin/nav.js'));
  else root.ZJEU = factory(root.ZDONNEES, root.ZMONDE, root.PNAV);
})(typeof self !== 'undefined' ? self : this, function (D, M, PNAV) {
  'use strict';
  const TAU = Math.PI * 2;
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const angleVers = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return Math.abs(d) <= k ? b : a + Math.sign(d) * k; };
  const ecartAngle = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return Math.abs(d); };
  const NAV_PAR_PAS = 6;      // au plus six recherches de chemin par pas (les autres attendent le pas suivant)
  const DUREE_FERRAILLE = 45; // une ferraille au sol disparaît au bout de 45 s
  const MAX_OBJETS = 160;
  const SORTIE = 0.7;          // un zombie met 0,7 s à sortir de terre

  function creer(o) {
    o = o || {};
    const id = D.ARENES[o.arene] ? o.arene : D.ORDRE_ARENES[0], A = D.ARENES[id];
    const monde = M.creer(A);
    // deux grilles de navigation : les zombies ordinaires, et les gros (Costaud, Mastodonte), qui ne passent pas entre deux voitures
    const nav = PNAV ? PNAV.creer(monde, { pas: 0.75, marge: 0.5, reperes: 4 }) : null;
    const navGros = PNAV ? PNAV.creer(monde, { pas: 0.75, marge: 1.1, reperes: 4 }) : null;
    const rnd = mulberry32((o.graine >>> 0) || 1);
    const jeu = {
      arene: id, A, monde, nav, navGros, rnd, graine: (o.graine >>> 0) || 1,
      t: 0, n: 0, prochainId: 1,
      vague: 0, phase: 'pause', chrono: o.attente != null ? o.attente : 4, aSortir: 0, totalVague: 0, sortieT: 0, bossAVenir: false,
      joueurs: [], zombies: [], defenses: [], objets: [], crachats: [], obus: [],
      serie: { n: 0, t: -99, mult: 1 },
      stats: { tues: 0, ferraille: 0, tirs: 0, construits: 0, parType: {} },
      navPas: 0, evs: [], fini: false,
    };
    const liste = o.joueurs && o.joueurs.length ? o.joueurs : [{ id: 'moi', pseudo: 'Moi' }];
    liste.forEach((j, k) => {
      const a = (k / liste.length) * TAU, p = monde.libreProche(A.depart[0] + (liste.length > 1 ? Math.cos(a) * 1.2 : 0), A.depart[1] + (liste.length > 1 ? Math.sin(a) * 1.2 : 0), D.JOUEUR.rayon, 6) || A.depart;
      jeu.joueurs.push({
        id: j.id, pseudo: j.pseudo || 'Survivant', x: p[0], z: p[1], vx: 0, vz: 0, angle: -Math.PI / 2, rayon: D.JOUEUR.rayon,
        vie: D.JOUEUR.vie, vieMax: D.JOUEUR.vie, vivant: true, invul: 0,
        armes: [{ id: D.ARME_DE_BASE, mun: Infinity }, null], main: 0, attente: 0, cible: 0, visee: 0,
        ferraille: o.ferraille != null ? o.ferraille : 0, score: 0, tues: 0, niveaux: {}, bouge: 0,
      });
    });
    return jeu;
  }

  // ─── utilitaires ───
  const nouvelId = (jeu) => jeu.prochainId++;
  const ev = (jeu, e) => { jeu.evs.push(e); };
  const niveau = (j, type) => j.niveaux[type] || 0;
  const multDegats = (j) => 1 + niveau(j, 'degats') * D.AMELIORATIONS.degats.par;
  const multCadence = (j) => 1 + niveau(j, 'cadence') * D.AMELIORATIONS.cadence.par;
  const multDefense = (jeu) => { let m = 0; for (const j of jeu.joueurs) m = Math.max(m, niveau(j, 'defense')); return 1 + m * D.AMELIORATIONS.defense.par; };
  const aimant = (j) => D.JOUEUR.aimant + niveau(j, 'aimant') * D.AMELIORATIONS.aimant.par;
  function maxDefenses(jeu, type) { const d = D.DEFENSES[type]; if (!d || Math.max(1, jeu.vague) < d.depuis) return 0; return d.max + Math.floor(Math.max(0, jeu.vague - 1) / d.plus); }
  function compteDefenses(jeu, type) { let n = 0; for (const d of jeu.defenses) if (d.type === type) n++; return n; }
  const prixDefense = (jeu, type) => (D.DEFENSES[type] ? D.DEFENSES[type].prix : Infinity);
  function prixAmelioration(j, type) { const a = D.AMELIORATIONS[type]; if (!a) return Infinity; const n = niveau(j, type); return n >= a.crans ? Infinity : Math.round(a.prix * Math.pow(a.facteur, n)); }
  const trouverJoueur = (jeu, id) => jeu.joueurs.find((j) => j.id === id) || null;
  const armeDe = (j) => { const s = j.armes[j.main]; return s ? D.ARMES[s.id] : D.ARMES[D.ARME_DE_BASE]; };

  // ─── les vagues ───
  function lancerVague(jeu) {
    const V = D.VAGUES; jeu.vague++; jeu.phase = 'vague';
    jeu.totalVague = V.nombre(jeu.vague); jeu.aSortir = jeu.totalVague; jeu.sortieT = 0.6; jeu.bossAVenir = V.boss(jeu.vague);
    for (let k = 0; k < V.caisse(jeu.vague); k++) poserCaisse(jeu);
    ev(jeu, { t: 'vague', n: jeu.vague, total: jeu.totalVague, boss: jeu.bossAVenir });
  }
  function poserCaisse(jeu) {
    const A = jeu.A, demi = A.taille / 2 - 3, rnd = jeu.rnd, j0 = jeu.joueurs.find((j) => j.vivant) || jeu.joueurs[0];
    for (let essai = 0; essai < 30; essai++) {
      const x = (rnd() * 2 - 1) * demi, z = (rnd() * 2 - 1) * demi;
      const d = Math.hypot(x - j0.x, z - j0.z);
      if (d < 5 || d > 16 || jeu.monde.bloque(x, z, 0.8)) continue;
      jeu.objets.push({ id: nouvelId(jeu), type: 'caisse', x, z, valeur: 0, age: 0, vole: false });
      return true;
    }
    return false;
  }
  function tirerType(jeu) {
    const n = jeu.vague, rnd = jeu.rnd; let somme = 0;
    for (const k in D.ZOMBIES) { const z = D.ZOMBIES[k]; if (z.depuis <= n && z.poids > 0) somme += z.poids * (k === 'trainard' ? 1 : Math.min(2, 1 + (n - z.depuis) * 0.12)); }
    let r = rnd() * somme;
    for (const k in D.ZOMBIES) { const z = D.ZOMBIES[k]; if (z.depuis <= n && z.poids > 0) { r -= z.poids * (k === 'trainard' ? 1 : Math.min(2, 1 + (n - z.depuis) * 0.12)); if (r <= 0) return k; } }
    return 'trainard';
  }
  function fairesortir(jeu, type) {
    const A = jeu.A, rnd = jeu.rnd, Z = D.ZOMBIES[type];
    // une sortie loin des survivants (plus de 9 m), au hasard parmi elles
    const vivants = jeu.joueurs.filter((j) => j.vivant);
    const bonnes = A.sorties.filter((s) => vivants.every((j) => Math.hypot(s[0] - j.x, s[1] - j.z) > 9));
    const l = bonnes.length ? bonnes : A.sorties, s = l[Math.floor(rnd() * l.length) % l.length];
    const p = jeu.monde.libreProche(s[0] + (rnd() - 0.5) * 2, s[1] + (rnd() - 0.5) * 2, Z.rayon, 5); if (!p) return false;
    const kv = D.VAGUES.vie(jeu.vague), kx = D.VAGUES.vitesse(jeu.vague) * (0.92 + rnd() * 0.16);
    const vie = Math.round(Z.vie * kv * (Z.boss ? 1 + Math.max(0, jeu.joueurs.length - 1) * 0.6 : 1));
    jeu.zombies.push({
      id: nouvelId(jeu), type, x: p[0], z: p[1], vie, vieMax: vie, vitesse: Z.vitesse * kx, rayon: Z.rayon, angle: 0,
      chemin: null, ci: 0, repense: rnd() * 0.4, coinceT: 0, coince: 0, cx: p[0], cz: p[1], coup: 0.3 + rnd() * 0.5, crache: 1 + rnd(), flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: jeu.t,
    });
    return true;
  }

  function ressortir(jeu, zb) {
    const A = jeu.A, l = A.sorties.filter((s) => jeu.joueurs.every((j) => !j.vivant || Math.hypot(s[0] - j.x, s[1] - j.z) > 9)), L = l.length ? l : A.sorties;
    const s = L[Math.floor(jeu.rnd() * L.length) % L.length], p = jeu.monde.libreProche(s[0], s[1], zb.rayon, 6); if (!p) return;
    zb.x = p[0]; zb.z = p[1]; zb.cx = p[0]; zb.cz = p[1]; zb.coince = 0; zb.chemin = null; zb.repense = 0; zb.naissance = jeu.t;
    ev(jeu, { t: 'ressort', id: zb.id });
  }

  // ─── les tirs (balles instantanées) ───
  const _touches = [];
  function rafale(jeu, de, x, z, a, arme, mult, estJoueur) {
    const rnd = jeu.rnd;
    for (let b = 0; b < arme.balles; b++) {
      const ab = a + (rnd() - 0.5) * arme.dispersion * (arme.balles > 1 ? 1 : 2);
      const dx = Math.cos(ab), dz = Math.sin(ab);
      const portee = jeu.monde.tir(x, z, dx, dz, arme.portee);
      // les zombies sur le rayon, du plus proche au plus loin
      _touches.length = 0;
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0) continue;
        const fx = zb.x - x, fz = zb.z - z, t = fx * dx + fz * dz; if (t < 0 || t > portee + zb.rayon) continue;
        const px = fx - t * dx, pz = fz - t * dz, R = zb.rayon + 0.12; if (px * px + pz * pz > R * R) continue;
        _touches.push([t, zb]);
      }
      _touches.sort((p, q) => p[0] - q[0]);
      let l = portee, n = 0;
      for (const [t, zb] of _touches) {
        if (n > arme.perce) break;
        const deg = arme.degats * mult * (estJoueur && n > 0 ? 0.7 : 1);
        blesserZombie(jeu, zb, deg, dx * arme.recul, dz * arme.recul, de);
        n++; l = t;
      }
      if (n > arme.perce) { /* arrêtée par le dernier zombie traversé */ } else l = portee;
      jeu.stats.tirs++;
      ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a: ab, l, touche: n > 0, b });
    }
  }
  function blesserZombie(jeu, zb, deg, px, pz, de) {
    if (zb.vie <= 0) return;
    zb.vie -= deg; zb.flash = 0.12;
    const Z = D.ZOMBIES[zb.type], masse = Z.boss ? 0.15 : Z.rayon > 0.6 ? 0.4 : 1;
    zb.rx += px * masse * 4; zb.rz += pz * masse * 4;
    ev(jeu, { t: 'touche', cible: zb.id, x: zb.x, z: zb.z, degats: Math.round(deg) });
    if (zb.vie <= 0) tuer(jeu, zb, de);
  }
  function tuer(jeu, zb, de) {
    const Z = D.ZOMBIES[zb.type], rnd = jeu.rnd;
    // la série : tuer vite multiplie les points
    const S = jeu.serie, avant = S.mult;
    S.n = jeu.t - S.t <= D.SERIE.fenetre ? S.n + 1 : 1; S.t = jeu.t;
    S.mult = 1; for (const [seuil, m] of D.SERIE.paliers) if (S.n >= seuil) { S.mult = m; break; }
    if (S.mult > avant) ev(jeu, { t: 'serie', mult: S.mult, n: S.n });
    const points = Z.points * S.mult;
    // le tueur (un survivant, ou une défense : les points vont au plus proche des survivants)
    let j = trouverJoueur(jeu, de);
    if (!j) { let best = Infinity; for (const k of jeu.joueurs) { const d = Math.hypot(k.x - zb.x, k.z - zb.z); if (k.vivant && d < best) { best = d; j = k; } } }
    if (j) { j.score += points; j.tues++; }
    jeu.stats.tues++; jeu.stats.parType[zb.type] = (jeu.stats.parType[zb.type] || 0) + 1;
    // ce qu'il laisse : de la ferraille (en quelques morceaux), parfois un soin
    let reste = Z.ferraille; const morceaux = Math.min(5, Math.max(1, Math.ceil(reste / 5)));
    for (let k = 0; k < morceaux && jeu.objets.length < MAX_OBJETS; k++) {
      const v = k === morceaux - 1 ? reste : Math.ceil(Z.ferraille / morceaux); reste -= v;
      const a = rnd() * TAU, r = morceaux > 1 ? 0.3 + rnd() * 0.6 : 0;
      jeu.objets.push({ id: nouvelId(jeu), type: 'ferraille', x: zb.x + Math.cos(a) * r, z: zb.z + Math.sin(a) * r, valeur: v, age: 0, vole: false });
    }
    if (rnd() < (Z.boss ? 1 : 0.035) && jeu.objets.length < MAX_OBJETS) jeu.objets.push({ id: nouvelId(jeu), type: 'soin', x: zb.x + 0.4, z: zb.z, valeur: 30, age: 0, vole: false });
    if (Z.boss) poserCaisse(jeu);
    ev(jeu, { t: 'mort', id: zb.id, type: zb.type, x: zb.x, z: zb.z, a: zb.angle, points, par: de });
  }
  function explosion(jeu, x, z, r, degats, de) {
    for (const zb of jeu.zombies) {
      if (zb.vie <= 0) continue;
      const d = Math.hypot(zb.x - x, zb.z - z); if (d > r + zb.rayon) continue;
      const k = 1 - Math.min(1, d / (r + zb.rayon)) * 0.6, n = d > 1e-3 ? 1 / d : 0;
      blesserZombie(jeu, zb, degats * k, (zb.x - x) * n * 1.5, (zb.z - z) * n * 1.5, de);
    }
    ev(jeu, { t: 'boum', x, z, r });
  }

  // ─── un pas de simulation ───
  function pas(jeu, entrees, dt) {
    dt = dt || 1 / 60; jeu.evs.length = 0;
    if (jeu.fini) return jeu.evs;
    jeu.t += dt; jeu.n++; jeu.navPas = 0;
    entrees = entrees || {};
    // la pause entre deux vagues
    if (jeu.phase === 'pause') { jeu.chrono -= dt; if (jeu.chrono <= 0) lancerVague(jeu); }
    else if (jeu.phase === 'vague') {
      const V = D.VAGUES;
      if (jeu.aSortir > 0) {
        jeu.sortieT += V.cadence(jeu.vague) * dt;
        let vivants = 0; for (const zb of jeu.zombies) if (zb.vie > 0) vivants++;
        while (jeu.sortieT >= 1 && jeu.aSortir > 0 && vivants < V.simultanes(jeu.vague)) {
          const type = jeu.bossAVenir && jeu.aSortir <= Math.ceil(jeu.totalVague * 0.6) ? 'mastodonte' : tirerType(jeu);
          if (!fairesortir(jeu, type)) break;
          if (type === 'mastodonte') jeu.bossAVenir = false;
          jeu.sortieT -= 1; jeu.aSortir--; vivants++;
        }
        if (jeu.sortieT > 3) jeu.sortieT = 3;
      } else if (!jeu.zombies.length) {
        const prime = V.prime(jeu.vague);
        for (const j of jeu.joueurs) if (j.vivant) j.score += prime;
        jeu.phase = 'pause'; jeu.chrono = V.pause;
        ev(jeu, { t: 'vagueFinie', n: jeu.vague, prime });
      }
    }
    for (const j of jeu.joueurs) majJoueur(jeu, j, entrees[j.id] || null, dt);
    majZombies(jeu, dt);
    majDefenses(jeu, dt);
    majProjectiles(jeu, dt);
    majObjets(jeu, dt);
    // fin : plus aucun survivant debout
    if (!jeu.joueurs.some((j) => j.vivant)) {
      jeu.fini = true; jeu.phase = 'fin';
      const score = jeu.joueurs.reduce((s, j) => s + j.score, 0);
      ev(jeu, { t: 'fin', score, vague: jeu.vague, tues: jeu.stats.tues });
    }
    return jeu.evs;
  }

  function majJoueur(jeu, j, e, dt) {
    if (!j.vivant) return;
    if (j.invul > 0) j.invul -= dt;
    // le déplacement
    let mx = e ? +e.mx || 0 : 0, mz = e ? +e.mz || 0 : 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    const v = D.JOUEUR.vitesse;
    j.vx = mx * v; j.vz = mz * v; j.x += j.vx * dt; j.z += j.vz * dt;
    j.bouge = l > 0.05 ? Math.min(1, l) : 0;
    // les défenses sont dures pour lui aussi (sauf les mines)
    for (const d of jeu.defenses) { if (d.type === 'mine') continue; pousserCercle(j, d.x, d.z, D.DEFENSES[d.type].rayon); }
    jeu.monde.pousser(j);
    // la cible : le zombie le plus proche à portée et en vue (relue tous les 0,1 s)
    const arme = armeDe(j);
    j.cible -= dt;
    if (j.cible <= 0) {
      j.cible = 0.1; j.viseId = 0; let best = arme.portee * arme.portee;
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0) continue;
        const d2 = (zb.x - j.x) ** 2 + (zb.z - j.z) ** 2; if (d2 >= best) continue;
        if (!jeu.monde.vue(j.x, j.z, zb.x, zb.z)) continue;
        best = d2; j.viseId = zb.id;
      }
    }
    const cible = j.viseId ? jeu.zombies.find((zb) => zb.id === j.viseId && zb.vie > 0) : null;
    const voulu = cible ? Math.atan2(cible.z - j.z, cible.x - j.x) : (l > 0.05 ? Math.atan2(mz, mx) : j.angle);
    j.angle = angleVers(j.angle, voulu, 14 * dt);
    j.visee = cible ? 1 : 0;
    // le tir automatique
    if (j.attente > 0) j.attente -= dt;
    if (cible && j.attente <= 0 && ecartAngle(j.angle, voulu) < 0.35) {
      const s = j.armes[j.main];
      j.attente += 1 / (arme.cadence * multCadence(j)); if (j.attente < 0) j.attente = 0;
      const bx = j.x + Math.cos(j.angle) * 0.5, bz = j.z + Math.sin(j.angle) * 0.5;
      rafale(jeu, j.id, bx, bz, j.angle, Object.assign(_armeTir, arme, { cle: s ? s.id : D.ARME_DE_BASE }), multDegats(j), true);
      if (s && s.mun !== Infinity) { s.mun--; if (s.mun <= 0) { j.armes[j.main] = null; j.main = 0; ev(jeu, { t: 'vide', id: j.id }); } }
    }
  }
  const _armeTir = {};
  function pousserCercle(c, x, z, R) {
    const ex = c.x - x, ez = c.z - z, d2 = ex * ex + ez * ez, m = R + c.rayon; if (d2 >= m * m) return false;
    const d = Math.sqrt(d2) || 1e-6, k = (m - d) / d; c.x += (d2 > 1e-12 ? ex : 1) * k; c.z += (d2 > 1e-12 ? ez : 0) * k; return true;
  }
  function blesserJoueur(jeu, j, deg) {
    if (!j.vivant || j.invul > 0) return;
    j.vie -= deg; j.invul = D.JOUEUR.invulnerable;
    ev(jeu, { t: 'blesse', id: j.id, degats: Math.round(deg) });
    if (j.vie <= 0) { j.vie = 0; j.vivant = false; ev(jeu, { t: 'tombe', id: j.id }); }
  }

  function majZombies(jeu, dt) {
    const Zs = jeu.zombies, monde = jeu.monde, vivants = jeu.joueurs.filter((j) => j.vivant);
    const epouvantails = jeu.defenses.filter((d) => d.type === 'epouvantail');
    for (let i = 0; i < Zs.length; i++) {
      const zb = Zs[i]; if (zb.vie <= 0) continue;
      const Z = D.ZOMBIES[zb.type];
      if (zb.flash > 0) zb.flash -= dt;
      if (jeu.t - zb.naissance < SORTIE) { zb.bouge = 0; continue; } // il sort de terre : ni pas ni coup
      // la proie : le survivant le plus proche, ou un épouvantail tout près
      let cx = 0, cz = 0, proie = null, best = Infinity;
      for (const j of vivants) { const d = (j.x - zb.x) ** 2 + (j.z - zb.z) ** 2; if (d < best) { best = d; proie = j; } }
      for (const d of epouvantails) { const r = D.DEFENSES.epouvantail.attire, dd = (d.x - zb.x) ** 2 + (d.z - zb.z) ** 2; if (dd < r * r && dd < best * 1.6) { best = dd; proie = d; } }
      if (!proie) { zb.bouge = 0; continue; }
      cx = proie.x; cz = proie.z;
      const dist = Math.sqrt(best);
      // le cracheur s'arrête à portée et crache
      let avance = true;
      if (Z.crache && proie.vivant !== undefined && dist < Z.crache.portee && monde.vue(zb.x, zb.z, cx, cz)) {
        avance = dist > Z.crache.portee * 0.75;
        zb.crache -= dt;
        if (zb.crache <= 0) {
          zb.crache = 1 / Z.crache.cadence; const a = Math.atan2(cz - zb.z, cx - zb.x);
          jeu.crachats.push({ x: zb.x + Math.cos(a) * 0.5, z: zb.z + Math.sin(a) * 0.5, vx: Math.cos(a) * Z.crache.vitesse, vz: Math.sin(a) * Z.crache.vitesse, vie: Z.crache.portee * 1.3 / Z.crache.vitesse, degats: Z.crache.degats });
          ev(jeu, { t: 'crachat', x: zb.x, z: zb.z });
        }
      }
      // où aller : tout droit si la voie est libre, sinon le chemin A* (recalculé de temps en temps)
      let tx = cx, tz = cz;
      zb.repense -= dt;
      if (zb.repense <= 0 && jeu.navPas < NAV_PAR_PAS) {
        zb.repense = 0.45 + jeu.rnd() * 0.3;
        if (monde.passe(zb.x, zb.z, cx, cz, Math.min(zb.rayon, 0.5) * 0.9)) zb.chemin = null;
        else if (jeu.nav) { jeu.navPas++; zb.chemin = (zb.rayon >= 0.6 && jeu.navGros ? jeu.navGros : jeu.nav).chemin(zb.x, zb.z, cx, cz); zb.ci = 1; }
      }
      if (zb.chemin && zb.chemin.length > 1) {
        while (zb.ci < zb.chemin.length - 1 && Math.hypot(zb.chemin[zb.ci][0] - zb.x, zb.chemin[zb.ci][1] - zb.z) < 0.6) zb.ci++;
        if (zb.ci < zb.chemin.length) { tx = zb.chemin[zb.ci][0]; tz = zb.chemin[zb.ci][1]; }
        if (zb.ci >= zb.chemin.length - 1) { tx = cx; tz = cz; }
      }
      const dx = tx - zb.x, dz = tz - zb.z, l = Math.hypot(dx, dz) || 1;
      const contact = dist < zb.rayon + (proie.rayon || D.DEFENSES.epouvantail.rayon) + 0.25;
      let vx = 0, vz = 0;
      if (avance && !contact) { vx = dx / l * zb.vitesse; vz = dz / l * zb.vitesse; }
      zb.angle = angleVers(zb.angle, Math.atan2(contact ? cz - zb.z : dz, contact ? cx - zb.x : dx), 8 * dt);
      // le recul des balles s'éteint vite
      zb.x += (vx + zb.rx) * dt; zb.z += (vz + zb.rz) * dt;
      const am = Math.exp(-10 * dt); zb.rx *= am; zb.rz *= am;
      zb.bouge = avance && !contact ? 1 : 0;
      // coincé (il veut avancer mais n'a pas fait 0,6 m en 3 s, deux fois de suite) : il ressort de terre ailleurs
      zb.coinceT += dt;
      if (zb.coinceT >= 3) {
        const d = Math.hypot(zb.x - zb.cx, zb.z - zb.cz); zb.coinceT = 0; zb.cx = zb.x; zb.cz = zb.z;
        zb.coince = zb.bouge && d < 0.6 ? zb.coince + 1 : 0;
        if (zb.coince >= 2) ressortir(jeu, zb);
      }
      // les coups : au contact de la proie, ou d'une défense qui barre la route
      zb.coup -= dt; zb.attaque = Math.max(0, zb.attaque - dt);
      let frappe = null;
      if (contact) frappe = proie;
      for (const d of jeu.defenses) {
        if (d.type === 'mine') { if (Math.hypot(d.x - zb.x, d.z - zb.z) < D.DEFENSES.mine.rayon + zb.rayon) { d.vie = 0; d.declenche = true; } continue; }
        if (pousserCercle(zb, d.x, d.z, D.DEFENSES[d.type].rayon + 0.02) && !frappe) frappe = d;
      }
      if (frappe && zb.coup <= 0) {
        zb.coup = 1 / Z.cadence; zb.attaque = 0.3;
        if (frappe.vivant !== undefined) blesserJoueur(jeu, frappe, Z.degats);
        else { frappe.vie -= Z.degats; frappe.flash = 0.15; }
      }
    }
    // ils se poussent entre eux, et poussent un peu les survivants
    for (let i = 0; i < Zs.length; i++) {
      const a = Zs[i]; if (a.vie <= 0) continue;
      for (let k = i + 1; k < Zs.length; k++) {
        const b = Zs[k]; if (b.vie <= 0) continue;
        const ex = b.x - a.x, ez = b.z - a.z, m = a.rayon + b.rayon; if (ex > m || ex < -m || ez > m || ez < -m) continue;
        const d2 = ex * ex + ez * ez; if (d2 >= m * m) continue;
        const d = Math.sqrt(d2) || 1e-4, p = (m - d) / d * 0.5, ma = a.rayon * a.rayon, mb = b.rayon * b.rayon, ka = mb / (ma + mb), kb = ma / (ma + mb);
        const ux = d2 > 1e-8 ? ex : (i % 2 ? 0.01 : -0.01), uz = d2 > 1e-8 ? ez : 0.01;
        a.x -= ux * p * ka * 2; a.z -= uz * p * ka * 2; b.x += ux * p * kb * 2; b.z += uz * p * kb * 2;
      }
      for (const j of vivants) {
        const ex = j.x - a.x, ez = j.z - a.z, m = a.rayon + j.rayon, d2 = ex * ex + ez * ez; if (d2 >= m * m) continue;
        const d = Math.sqrt(d2) || 1e-4, p = (m - d) / d; j.x += ex * p * 0.35; j.z += ez * p * 0.35; a.x -= ex * p * 0.65; a.z -= ez * p * 0.65;
      }
      monde.pousser(a);
    }
    for (const j of vivants) monde.pousser(j);
    // les morts sortent de la liste
    for (let i = Zs.length - 1; i >= 0; i--) if (Zs[i].vie <= 0) Zs.splice(i, 1);
  }

  function majDefenses(jeu, dt) {
    const km = multDefense(jeu), monde = jeu.monde;
    for (const d of jeu.defenses) {
      const T = D.DEFENSES[d.type]; if (d.flash > 0) d.flash -= dt;
      if (d.type === 'tourelle' || d.type === 'mortier') {
        d.attente -= dt;
        let cible = null, best = T.portee * T.portee;
        if (d.type === 'tourelle') {
          for (const zb of jeu.zombies) { if (zb.vie <= 0) continue; const d2 = (zb.x - d.x) ** 2 + (zb.z - d.z) ** 2; if (d2 < best && monde.vue(d.x, d.z, zb.x, zb.z)) { best = d2; cible = zb; } }
        } else { // le mortier vise le zombie qui a le plus de voisins, hors de sa distance minimale
          let score = -1; const mn = T.minimum * T.minimum, s2 = T.souffle * T.souffle;
          for (let i = 0; i < jeu.zombies.length; i += Math.max(1, Math.floor(jeu.zombies.length / 14))) {
            const zb = jeu.zombies[i]; const d2 = (zb.x - d.x) ** 2 + (zb.z - d.z) ** 2; if (d2 > best || d2 < mn) continue;
            let n = 0; for (const o of jeu.zombies) if ((o.x - zb.x) ** 2 + (o.z - zb.z) ** 2 < s2) n++;
            if (n > score) { score = n; cible = zb; }
          }
        }
        if (cible) {
          const a = Math.atan2(cible.z - d.z, cible.x - d.x); d.angle = angleVers(d.angle, a, 9 * dt);
          if (d.attente <= 0 && ecartAngle(d.angle, a) < 0.25) {
            d.attente = 1 / T.cadence;
            if (d.type === 'tourelle') rafale(jeu, 'def' + d.id, d.x + Math.cos(d.angle) * 0.5, d.z + Math.sin(d.angle) * 0.5, d.angle, Object.assign(_armeTir, { degats: T.degats, balles: 1, dispersion: 0.06, portee: T.portee, perce: 0, recul: 0.15, classe: 'mitraillette', cle: 'tourelle' }), km, false);
            else { const duree = 0.9 + Math.hypot(cible.x - d.x, cible.z - d.z) * 0.04; jeu.obus.push({ x0: d.x, z0: d.z, x1: cible.x + (jeu.rnd() - 0.5), z1: cible.z + (jeu.rnd() - 0.5), t: 0, duree, degats: T.degats * km, souffle: T.souffle }); ev(jeu, { t: 'mortier', x: d.x, z: d.z }); }
          }
        } else if (d.attente < 0) d.attente = 0;
      }
    }
    for (let i = jeu.defenses.length - 1; i >= 0; i--) {
      const d = jeu.defenses[i]; if (d.vie > 0) continue;
      jeu.defenses.splice(i, 1);
      if (d.type === 'mine') explosion(jeu, d.x, d.z, D.DEFENSES.mine.souffle, D.DEFENSES.mine.degats * km, 'def' + d.id);
      else ev(jeu, { t: 'casse', type: d.type, x: d.x, z: d.z });
    }
  }

  function majProjectiles(jeu, dt) {
    for (let i = jeu.crachats.length - 1; i >= 0; i--) {
      const c = jeu.crachats[i]; c.x += c.vx * dt; c.z += c.vz * dt; c.vie -= dt;
      let fini = c.vie <= 0 || jeu.monde.bloque(c.x, c.z, 0.05);
      if (!fini) for (const j of jeu.joueurs) if (j.vivant && Math.hypot(j.x - c.x, j.z - c.z) < j.rayon + 0.2) { blesserJoueur(jeu, j, c.degats); fini = true; break; }
      if (!fini) for (const d of jeu.defenses) if (d.type !== 'mine' && Math.hypot(d.x - c.x, d.z - c.z) < D.DEFENSES[d.type].rayon + 0.15) { d.vie -= c.degats; d.flash = 0.15; fini = true; break; }
      if (fini) { jeu.crachats.splice(i, 1); ev(jeu, { t: 'flaque', x: c.x, z: c.z }); }
    }
    for (let i = jeu.obus.length - 1; i >= 0; i--) {
      const o = jeu.obus[i]; o.t += dt;
      if (o.t >= o.duree) { jeu.obus.splice(i, 1); explosion(jeu, o.x1, o.z1, o.souffle, o.degats, 'mortier'); }
    }
  }

  function majObjets(jeu, dt) {
    for (let i = jeu.objets.length - 1; i >= 0; i--) {
      const o = jeu.objets[i]; o.age += dt;
      if (o.type === 'ferraille' && o.age > DUREE_FERRAILLE) { jeu.objets.splice(i, 1); continue; }
      let pris = null;
      for (const j of jeu.joueurs) {
        if (!j.vivant) continue;
        const dx = j.x - o.x, dz = j.z - o.z, d = Math.hypot(dx, dz);
        if (o.type === 'ferraille') {
          if (d < aimant(j) || o.vole) { o.vole = true; const v = Math.min(d, (8 + o.age * 4) * dt); if (d > 1e-4) { o.x += dx / d * v; o.z += dz / d * v; } }
          if (d < 0.55) { pris = j; break; }
        } else if (o.type === 'soin') { if (d < 0.9 && j.vie < j.vieMax) { pris = j; break; } }
        else if (d < 1.0) { pris = j; break; }
      }
      if (!pris) continue;
      jeu.objets.splice(i, 1);
      if (o.type === 'ferraille') { pris.ferraille += o.valeur; jeu.stats.ferraille += o.valeur; ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'ferraille', valeur: o.valeur }); }
      else if (o.type === 'soin') { pris.vie = Math.min(pris.vieMax, pris.vie + o.valeur); ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'soin', valeur: o.valeur }); }
      else if (o.type === 'caisse') { const a = ouvrirCaisse(jeu, pris); ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'caisse', arme: a }); }
    }
  }
  function ouvrirCaisse(jeu, j) {
    // une arme au hasard parmi celles permises à cette vague (pondérées par leur rareté)
    const n = Math.max(1, jeu.vague), l = Object.keys(D.ARMES).filter((k) => D.ARMES[k].rarete > 0 && D.ARMES[k].depuis <= n);
    let s = 0; for (const k of l) s += D.ARMES[k].rarete; let r = jeu.rnd() * s, id = l[0];
    for (const k of l) { r -= D.ARMES[k].rarete; if (r <= 0) { id = k; break; } }
    const A = D.ARMES[id], slot = j.armes[1];
    if (slot && slot.id === id) slot.mun += A.munitions; else j.armes[1] = { id, mun: A.munitions };
    j.main = 1; j.attente = Math.min(j.attente, 0.15);
    ev(jeu, { t: 'arme', id: j.id, arme: id });
    return id;
  }

  // ─── les actions du joueur (boutons du HUD ; plus tard, des messages du salon) ───
  function construire(jeu, idJ, type) {
    const j = trouverJoueur(jeu, idJ), T = D.DEFENSES[type];
    if (!j || !T || jeu.fini) return { ok: false, raison: 'inconnu' };
    if (!j.vivant) return { ok: false, raison: 'mort' };
    if (Math.max(1, jeu.vague) < T.depuis) return { ok: false, raison: 'verrou' };
    if (compteDefenses(jeu, type) >= maxDefenses(jeu, type)) return { ok: false, raison: 'max' };
    if (j.ferraille < T.prix) return { ok: false, raison: 'ferraille' };
    // devant lui, sinon à côté : une place libre, loin des autres défenses et des survivants
    const r = T.rayon, essais = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
    let p = null;
    for (const da of essais) {
      const a = j.angle + da, x = j.x + Math.cos(a) * (j.rayon + r + 0.35), z = j.z + Math.sin(a) * (j.rayon + r + 0.35);
      if (jeu.monde.bloque(x, z, r)) continue;
      if (jeu.defenses.some((d) => Math.hypot(d.x - x, d.z - z) < D.DEFENSES[d.type].rayon + r + 0.1)) continue;
      if (type !== 'mine' && jeu.joueurs.some((k) => k.vivant && Math.hypot(k.x - x, k.z - z) < k.rayon + r)) continue;
      p = [x, z]; break;
    }
    if (!p) return { ok: false, raison: 'place' };
    const km = multDefense(jeu), vie = Math.round(T.vie * km);
    j.ferraille -= T.prix; jeu.stats.construits++;
    jeu.defenses.push({ id: nouvelId(jeu), type, x: p[0], z: p[1], vie, vieMax: vie, angle: j.angle, attente: 0.3, flash: 0, par: j.id });
    ev(jeu, { t: 'construit', type, x: p[0], z: p[1], par: j.id });
    return { ok: true };
  }
  function ameliorer(jeu, idJ, type) {
    const j = trouverJoueur(jeu, idJ), A = D.AMELIORATIONS[type];
    if (!j || !A || jeu.fini) return { ok: false, raison: 'inconnu' };
    const prix = prixAmelioration(j, type);
    if (prix === Infinity) return { ok: false, raison: 'max' };
    if (j.ferraille < prix) return { ok: false, raison: 'ferraille' };
    j.ferraille -= prix; j.niveaux[type] = niveau(j, type) + 1;
    if (type === 'vie') { j.vieMax += A.par; j.vie = Math.min(j.vieMax, j.vie + A.par); }
    if (type === 'defense') for (const d of jeu.defenses) { const T = D.DEFENSES[d.type], n = Math.round(T.vie * multDefense(jeu)); d.vie += n - d.vieMax; d.vieMax = n; }
    ev(jeu, { t: 'ameliore', id: j.id, type, niveau: j.niveaux[type] });
    return { ok: true };
  }
  function changerArme(jeu, idJ, i) {
    const j = trouverJoueur(jeu, idJ); if (!j || !j.armes[i] || j.main === i) return false;
    j.main = i; j.attente = Math.max(j.attente, 0.2); ev(jeu, { t: 'arme', id: j.id, arme: j.armes[i].id }); return true;
  }
  function passer(jeu) { if (jeu.phase === 'pause' && !jeu.fini) { jeu.chrono = 0; return true; } return false; }
  // ce qu'il reste à tuer dans la vague
  const restants = (jeu) => jeu.aSortir + jeu.zombies.length;

  return { creer, pas, construire, ameliorer, changerArme, passer, restants, prixDefense, prixAmelioration, maxDefenses, compteDefenses, armeDe, mulberry32, DUREE_FERRAILLE };
});
