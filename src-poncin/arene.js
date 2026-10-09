/* OPÉRATION PONCIN — le mode Arène : chacun pour soi ou deux contre deux autour de la place Bichat. 180 s ou 25 repeints (par joueur,
   ou par équipe en 2 contre 2) ; réapparition au bout de 3 s au point d'apparition le plus loin des ennemis (invincible 1,5 s, jusqu'au
   premier tir) ; points : élimination 100, série de 3 (à chaque multiple de 3 sans mourir) 50, élimination à la tête 25 ; objets de
   carte.zones.armes (long-tir, pompe, soin, armure) qui réapparaissent ; murs invisibles au bord de zones.arene (monde.limite) ;
   annonces (premier repeint, séries, prise de tête, dernière minute…).
   Un mode est un jeu de crochets appelés par PJEU (voir src-poncin/ARCHITECTURE.md) : init(jeu), tick(jeu, dt, evs), surMort(jeu,
   victime, tueur, evs), apparition(jeu, entite) → [x, z, yaw], objets(jeu) → [{ id, x, z, objet, dispo }], fini(jeu), resultat(jeu).
   L'état de la manche est rangé dans jeu.arene. Les zones viennent de jeu.carte (carte v1) ; sans carte, une arène de secours est
   tirée au hasard rejouable autour de (0, 0). Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PARENE = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const M = REGLES.MODES.arene, J = REGLES.JOUEUR;
  const COULEURS_EQUIPES = ['#FFC84A', '#FF6B8B'];           // l'équipe 0 (celle du joueur, jaune comme lui) et l'équipe 1
  const NOMS_EQUIPES = ['l’équipe jaune', 'l’équipe rose'];      // par leur couleur : celle des pastilles du HUD
  const VIDE = [];
  const fin = (v) => typeof v === 'number' && v - v === 0; // un nombre fini
  const DIRS = 12; // les directions essayées pour le regard à l'apparition

  const nomDe = (e) => (e.humain && e.nom === 'Toi' ? 'Tu' : e.nom); // « Toi » est le nom par défaut du joueur
  const verbe = (e, tu, il) => (e.humain && e.nom === 'Toi' ? tu : il);
  function annonce(evs, texte) { evs.push({ t: 'annonce', texte }); }

  function init(jeu) {
    const monde = jeu.monde, rnd = jeu.rnd, carte = jeu.carte, z = (carte && carte.zones) || {};
    // la zone : celle de la carte, sinon 110 m autour de (0, 0)
    const a = z.arene;
    const centre = a && a.centre && fin(+a.centre[0]) && fin(+a.centre[1]) ? [+a.centre[0], +a.centre[1]] : [0, 0];
    const rayon = a && fin(+a.rayon) && a.rayon > 10 ? +a.rayon : 110;
    monde.limite = { centre, rayon };
    const dedans = (x, zz, m) => { const dx = x - centre[0], dz = zz - centre[1]; return dx * dx + dz * dz <= (rayon - m) * (rayon - m); };
    // les points d'apparition (libres, dans l'arène) ; s'il en manque, on en tire d'autres, bien écartés
    const apparitions = [];
    for (const p of z.apparitions || VIDE) if (p && fin(+p[0]) && fin(+p[1]) && dedans(+p[0], +p[1], 1.5) && !monde.bloque(+p[0], +p[1], 0.6)) apparitions.push([+p[0], +p[1]]);
    for (let k = 0; apparitions.length < 12 && k < 400; k++) {
      const p = monde.libre(rnd);
      if (dedans(p[0], p[1], 3) && apparitions.every((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 > 18 * 18)) apparitions.push([p[0], p[1]]);
    }
    // les objets : ceux de la carte dans l'arène ; sans rien, deux de chaque tirés au hasard
    const objets = [];
    for (const o of z.armes || VIDE) if (o && REGLES.OBJETS[o.arme] && fin(+o.x) && fin(+o.z) && dedans(+o.x, +o.z, 1)) objets.push({ id: 'o' + objets.length, x: +o.x, z: +o.z, y: null, objet: o.arme, dispo: true, revient: 0 });
    if (!objets.length) for (const nom of ['precision', 'pompe', 'soin', 'armure', 'precision', 'pompe', 'soin', 'armure']) { const p = monde.libre(rnd); objets.push({ id: 'o' + objets.length, x: p[0], z: p[1], y: null, objet: nom, dispo: true, revient: 0 }); }
    jeu.duree = M.duree;
    jeu.arene = { centre, rayon, apparitions, objets, victoire: M.scoreVictoire, equipes: !!jeu.options.equipes, premier: false, meneur: null, meneurA: -1e9, chrono: {}, proche: {} };
    // les robots : noms et couleurs tirés au sort (rejouable) ; en 2 contre 2, le premier va en face, le deuxième avec le joueur…
    const noms = REGLES.NOMS_BOTS.slice();
    for (let i = noms.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = noms[i]; noms[i] = noms[j]; noms[j] = t; }
    const couleurs = REGLES.COULEURS.filter((c) => c !== COULEURS_EQUIPES[0]), dc = Math.floor(rnd() * couleurs.length);
    for (let k = 0; k < jeu.options.bots; k++) {
      const equipe = jeu.options.equipes ? (k % 2 === 0 ? 1 : 0) : undefined;
      jeu.ajouterJoueur({ id: 'bot' + (k + 1), nom: noms[k % noms.length], couleur: jeu.options.equipes ? COULEURS_EQUIPES[equipe] : couleurs[(dc + k) % couleurs.length], equipe, bot: true, niveau: jeu.options.niveau });
    }
  }

  // le point d'apparition le plus loin des ennemis vivants (un peu de hasard départage), jamais sur quelqu'un ; regard vers le plus dégagé
  function apparition(jeu, e) {
    const monde = jeu.monde, A = jeu.arene, rnd = jeu.rnd, es = jeu.entites;
    let bx = 0, bz = 0, bs = -Infinity;
    const pts = A ? A.apparitions : VIDE;
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0], z = pts[i][1]; if (monde.bloque(x, z, J.rayon)) continue;
      let dmin = 400, pris = false;
      for (let k = 0; k < es.length; k++) {
        const c = es[k]; if (c === e || !c.vivant) continue;
        const d = Math.sqrt((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z));
        if (d < 2) pris = true;
        if (c.equipe !== e.equipe && d < dmin) dmin = d;
      }
      if (pris) continue;
      const s = dmin + 6 * rnd();
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
    if (bs === -Infinity) { const p = monde.libre(rnd); bx = p[0]; bz = p[1]; }
    // le regard : la direction la plus dégagée, de préférence vers le cœur de l'arène
    const cx = A ? A.centre[0] - bx : -bx, cz = A ? A.centre[1] - bz : -bz, cl = Math.sqrt(cx * cx + cz * cz) || 1, oy = monde.hauteur(bx, bz) + J.oeil;
    let byaw = Math.atan2(-cx, -cz), bv = -Infinity; const y0 = rnd() * 2 * Math.PI / DIRS;
    for (let k = 0; k < DIRS; k++) {
      const yaw = y0 + k * 2 * Math.PI / DIRS, dx = -Math.sin(yaw), dz = -Math.cos(yaw), h = monde.rayon(bx, oy, bz, dx, 0, dz, 40);
      const v = (h ? h.t : 40) + 12 * (dx * cx + dz * cz) / cl;
      if (v > bv) { bv = v; byaw = yaw; }
    }
    return [bx, bz, byaw > Math.PI ? byaw - 2 * Math.PI : byaw];
  }

  function objets(jeu) { return jeu.arene ? jeu.arene.objets : VIDE; }

  function scoresEquipes(jeu) { let a = 0, b = 0; for (const e of jeu.entites) { if (e.equipe === 0) a += e.score.kills; else if (e.equipe === 1) b += e.score.kills; } return [a, b]; }
  function meneur(jeu) { // le premier du classement (s'il est seul en tête)
    let m = null, s = -1, ex = false;
    for (const e of jeu.entites) { const p = e.score.points; if (p > s) { s = p; m = e; ex = false; } else if (p === s) ex = true; }
    return ex ? null : m;
  }

  function tick(jeu, dt, evs) {
    const A = jeu.arene; if (!A) return;
    // les réapparitions
    for (const e of jeu.entites) if (!e.vivant && jeu.temps - e.mortDepuis >= M.reapparition) jeu.reapparaitre(e, evs);
    // le chrono
    const reste = M.duree - jeu.temps;
    for (const [s, texte] of [[60, 'Plus qu’une minute !'], [30, '30 secondes !'], [10, '10 secondes !']]) if (reste <= s && reste > 0 && !A.chrono[s]) { A.chrono[s] = true; annonce(evs, texte); }
  }

  function surMort(jeu, v, k, evs) {
    const A = jeu.arene, P = M.points; if (!A || !k || k === v) return;
    k.score.points += P.kill;
    if (v.tueTete) k.score.points += P.tete;
    if (k.serie >= 3 && k.serie % 3 === 0) { k.score.points += P.serie3; annonce(evs, `${nomDe(k)} ${verbe(k, 'enchaînes', 'enchaîne')} ${k.serie} repeints !`); }
    else if (!A.premier) annonce(evs, `Premier repeint : ${k.humain && k.nom === 'Toi' ? 'toi' : k.nom} !`);
    A.premier = true;
    if (A.equipes) {
      const [a, b] = scoresEquipes(jeu), e = k.equipe === 0 ? a : b, m = a > b ? 0 : b > a ? 1 : null;
      if (e === A.victoire - 5 && !A.proche['e' + k.equipe]) { A.proche['e' + k.equipe] = true; annonce(evs, `Plus que 5 repeints pour ${NOMS_EQUIPES[k.equipe]} !`); }
      else if (m !== null && m !== A.meneur && a + b >= 3 && jeu.temps - A.meneurA > 6) { A.meneur = m; A.meneurA = jeu.temps; const n = NOMS_EQUIPES[m]; annonce(evs, `${n[0].toUpperCase()}${n.slice(1)} passe devant !`); }
    } else {
      if (k.score.kills === A.victoire - 5 && !A.proche[k.id]) { A.proche[k.id] = true; annonce(evs, `Plus que 5 repeints pour ${k.humain && k.nom === 'Toi' ? 'toi' : k.nom} !`); }
      const m = meneur(jeu);
      if (m && m !== A.meneur && m.score.kills >= 3 && jeu.temps - A.meneurA > 6) { A.meneur = m; A.meneurA = jeu.temps; annonce(evs, `${nomDe(m)} ${verbe(m, 'prends', 'prend')} la tête !`); }
    }
  }

  function fini(jeu) {
    const A = jeu.arene; if (!A) return jeu.temps >= M.duree;
    if (jeu.temps >= M.duree) return true;
    if (A.equipes) { const [a, b] = scoresEquipes(jeu); return a >= A.victoire || b >= A.victoire; }
    for (const e of jeu.entites) if (e.score.kills >= A.victoire) return true;
    return false;
  }

  function resultat(jeu) {
    const A = jeu.arene, classement = jeu.resume ? jeu.resume() : jeu.classement();
    let gagnant = null, scores = null;
    if (A && A.equipes) { scores = scoresEquipes(jeu); gagnant = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null; }
    else if (classement.length && (classement.length < 2 || (classement[0].points || (classement[0].score && classement[0].score.points) || 0) > (classement[1].points || (classement[1].score && classement[1].score.points) || 0))) gagnant = classement[0].id;
    return { classement, gagnant, duree: Math.min(jeu.temps, M.duree), equipes: !!(A && A.equipes), scores };
  }

  return { id: 'arene', nom: 'Arène', init, tick, surMort, apparition, objets, fini, resultat, COULEURS_EQUIPES, NOMS_EQUIPES };
});
