/* OPÉRATION PONCIN — le mode Arène : chacun pour soi ou deux contre deux, dans la zone choisie (jeu.zone, préparée par PJEU : par
   défaut le cœur du village autour de la place Bichat). Les réglages du salon (jeu.reglages, normalisés) : durée (180, 300, 600 s ;
   0 = sans limite) ou score (10, 25, 50 repeints, par joueur ou par équipe : le classement suit les repeints, départagés par les
   points) ; réapparition rapide 3 s, normale 6 s, lente 10 s, à clamp(0,32 · rayon englobant de la zone, 15, 60) m des ennemis (~35 m
   dans l'arène), de préférence hors de leur vue (invincible 1,5 s, jusqu'au premier tir) ; points : élimination 100, série de 3 (à
   chaque multiple de 3 sans mourir) 50, élimination à la tête 25 (rien pour un équipier repeint au tir allié : PJEU retire 100 points) ;
   objets de la zone (armes réelles permises par l'hôte : 'precision' devient un fusil de précision, une arme non permise une autre de
   sa classe ; soin et armure, sauf en « un coup » ; caisses de munitions si la zone n'en a pas), qui réapparaissent (aucun si objets
   est faux) ; robots listés par l'hôte (jeu.robots) ou équipés au hasard rejouable parmi les armes permises (PREGLES.equipementRobot) ;
   jeu.arene.robots : leur liste pour le message 'lancer' ; murs invisibles au bord de la zone (monde.limite) ; annonces (premier
   repeint, séries, prise de tête, dernière minute…).
   « Dernier debout » (réapparition 'aucune') : des manches (réglage manches : 1, 3, 5) sans réapparition. jeu.manche = { n, total,
   enLice: [ids des vivants], gagnees: { camp: manches }, debut, fin: null | t (la manche est jouée : trêve), vainqueur: camp | null }
   (camp : l'id en chacun pour soi, l'équipe 0 / 1 en 2 contre 2). Événements : { t: 'manche', quoi: 'debut', n, total }, { t:
   'manche', quoi: 'fin', n, total, vainqueur, nom, equipes, gagnees }, { t: 'elimine', id, par, enLice: N } (« Encore en lice : N »).
   Une manche finit quand il ne reste qu'un camp en lice (après 5 s de jeu), ou au bout de la durée (le camp qui a le plus de joueurs en
   lice, puis le plus de vie ; à égalité, nul) ; trêve de 4 s (jeu.treve : personne n'est blessé), puis tout le monde réapparaît et le
   chrono repart (jeu.debutChrono). Score de la partie = manches gagnées (e.score.manches, chaque membre du camp) ; elle finit 2 s après
   la dernière manche, ou dès que le premier ne peut plus être rattrapé ; resultat(jeu).manches = { total, jouees, gagnees }.
   Un mode est un jeu de crochets appelés par PJEU (voir src-poncin/ARCHITECTURE.md) : zones (vrai : PJEU prépare jeu.zone avant init),
   init(jeu), tick(jeu, dt, evs), surMort(jeu, victime, tueur, evs), apparition(jeu, entite) → [x, z, yaw], objets(jeu) → [{ id, x, z,
   objet, dispo }], fini(jeu), resultat(jeu). L'état de la partie est rangé dans jeu.arene. Sans zone (PJEU sans PZONES), celle de
   jeu.carte (carte v1) ; sans carte, une arène de secours est tirée au hasard rejouable autour de (0, 0). Module pur (aucun DOM, aucun
   THREE) : tourne aussi dans Node. */
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
    const monde = jeu.monde, rnd = jeu.rnd, carte = jeu.carte, z = (carte && carte.zones) || {}, R = jeu.reglages || jeu.options;
    // la zone : celle que PJEU a préparée (jeu.zone : limite, apparitions, objets), sinon celle de la carte, sinon 110 m autour de (0, 0)
    const zone = jeu.zone && jeu.zone.limite ? jeu.zone : null;
    let centre, rayon, sources, objetsSrc;
    if (zone) {
      monde.limite = zone.limite; centre = zone.englobant.centre.slice(); rayon = zone.englobant.rayon;
      sources = zone.apparitions; objetsSrc = zone.objets.map((o) => ({ x: o[0], z: o[1], arme: o[2] }));
    } else {
      const a = z.arene;
      centre = a && a.centre && fin(+a.centre[0]) && fin(+a.centre[1]) ? [+a.centre[0], +a.centre[1]] : [0, 0];
      rayon = a && fin(+a.rayon) && a.rayon > 10 ? +a.rayon : 110;
      monde.limite = { centre, rayon }; sources = z.apparitions || VIDE; objetsSrc = z.armes || VIDE;
    }
    const lim = monde.limite, v2 = !!(lim && lim.forme && lim.forme !== 'cercle' && typeof lim.dedans === 'function');
    const lc = v2 ? lim.centre : centre, lr = v2 ? lim.rayon : lim.rayon;
    const dedans = v2 ? (x, zz, m) => lim.dedans(x, zz) && !lim.pres(x, zz, m)
      : (x, zz, m) => { const dx = x - lc[0], dz = zz - lc[1]; return dx * dx + dz * dz <= (lr - m) * (lr - m); };
    // les points d'apparition (libres, dans la zone) ; s'il en manque, on en tire d'autres, bien écartés
    const apparitions = [];
    for (const p of sources) if (p && fin(+p[0]) && fin(+p[1]) && dedans(+p[0], +p[1], 1.5) && !monde.bloque(+p[0], +p[1], 0.6)) apparitions.push([+p[0], +p[1]]);
    for (let k = 0; apparitions.length < 12 && k < 400; k++) {
      const p = monde.libre(rnd);
      if (dedans(p[0], p[1], 3) && apparitions.every((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 > 18 * 18)) apparitions.push([p[0], p[1]]);
    }
    // les objets : ceux de la zone (les armes devenues de vraies armes permises) ; sans rien, deux de chaque tirés au hasard ; plus une
    // caisse de munitions pour deux armes au sol (deux au moins) si la zone n'en a pas ; en « un coup », ni soin ni armure
    const objets = [], ajouter = (x, zz, nom) => objets.push({ id: 'o' + objets.length, x, z: zz, y: null, objet: nom, dispo: true, revient: 0 });
    const garde = (nom) => !((nom === 'soin' && jeu.vieMax <= 1) || (nom === 'armure' && jeu.armureMax <= 0));
    if (R.objets !== false) {
      for (const o of objetsSrc) if (o && REGLES.OBJETS[o.arme] && fin(+o.x) && fin(+o.z) && dedans(+o.x, +o.z, 1)) { const nom = armeReelle(jeu, o.arme, rnd); if (garde(nom)) ajouter(+o.x, +o.z, nom); }
      if (!objets.length) for (const nom of ['precision', 'pompe', 'soin', 'armure', 'precision', 'pompe', 'soin', 'armure']) { const p = monde.libre(rnd); const n2 = armeReelle(jeu, nom, rnd); if (garde(n2)) ajouter(p[0], p[1], n2); }
      if (!objets.some((o) => o.objet === 'munitions')) {
        const nArmes = objets.filter((o) => REGLES.OBJETS[o.objet].type === 'arme').length;
        for (let k = 0, n = Math.max(2, Math.ceil(nArmes / 2)), essais = 0; k < n && essais < 60; essais++) {
          const p = monde.libre(rnd, v2 ? null : centre, v2 ? null : rayon - 4);
          if (!dedans(p[0], p[1], 2) || objets.some((o) => (o.x - p[0]) ** 2 + (o.z - p[1]) ** 2 < 12 * 12)) continue; // pas collée à un autre objet
          ajouter(p[0], p[1], 'munitions'); k++;
        }
      }
    }
    // les réglages de la partie : durée (0 : sans limite), score, réapparition (−1 : « dernier debout », en manches)
    jeu.duree = R.duree >= 0 ? R.duree : M.duree;
    const reap = REGLES.SALON.reapparitions[R.reapparition], dernier = reap < 0;
    jeu.arene = { centre, rayon, apparitions, objets, victoire: R.score > 0 ? R.score : M.scoreVictoire, equipes: !!R.equipes, premier: false, meneur: null, meneurA: -1e9, chrono: {}, proche: {},
      reapparition: dernier ? -1 : reap >= 0 ? reap : M.reapparition, distance: Math.max(15, Math.min(60, 0.32 * rayon)), dernier, termine: false, robots: [] };
    if (dernier) jeu.manche = { n: 1, total: R.manches > 0 ? R.manches : 1, enLice: [], gagnees: {}, debut: 0, fin: null, vainqueur: null, annoncee: false };
    // les robots : ceux que l'hôte a listés (jeu.robots), sinon noms et couleurs tirés au sort (rejouable) ; en 2 contre 2, le premier va
    // en face, le deuxième avec le joueur…
    if (Array.isArray(jeu.robots)) {
      jeu.robots.forEach((r, k) => {
        const equipe = R.equipes ? (r.equipe === 0 || r.equipe === 1 ? r.equipe : k % 2 === 0 ? 1 : 0) : undefined;
        jeu.ajouterJoueur({ id: typeof r.id === 'string' && r.id ? r.id : 'bot' + (k + 1), nom: typeof r.nom === 'string' ? r.nom : REGLES.NOMS_BOTS[k % REGLES.NOMS_BOTS.length], couleur: typeof r.couleur === 'string' ? r.couleur : R.equipes ? COULEURS_EQUIPES[equipe] : REGLES.COULEURS[k % REGLES.COULEURS.length],
          equipe, bot: true, niveau: REGLES.BOTS[r.niveau] ? r.niveau : R.niveau, equip: r.equip });
      });
    } else {
      const noms = REGLES.NOMS_BOTS.slice();
      for (let i = noms.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = noms[i]; noms[i] = noms[j]; noms[j] = t; }
      const couleurs = REGLES.COULEURS.filter((c) => c !== COULEURS_EQUIPES[0]), dc = Math.floor(rnd() * couleurs.length);
      for (let k = 0; k < R.bots; k++) {
        const equipe = R.equipes ? (k % 2 === 0 ? 1 : 0) : undefined;
        const equip = REGLES.equipementRobot(rnd, R, R.niveau); // parmi les armes permises, tiré par jeu.rnd
        jeu.ajouterJoueur({ id: 'bot' + (k + 1), nom: noms[k % noms.length], couleur: R.equipes ? COULEURS_EQUIPES[equipe] : couleurs[(dc + k) % couleurs.length], equipe, bot: true, niveau: R.niveau, equip });
      }
    }
    // la liste des robots, pour le message 'lancer' (la façade les ajoute tels quels)
    for (const e of jeu.entites) if (e.bot) jeu.arene.robots.push({ id: e.id, nom: e.nom, couleur: e.couleur, equipe: R.equipes ? e.equipe : undefined, equip: e.equip.p + '+' + e.equip.s, niveau: e.niveau });
  }

  // l'arme réelle posée à la place d'un objet de carte : 'precision' (l'ancien nom) → un fusil de précision permis ; une arme non
  // permise → une arme permise de sa classe, sinon une principale permise ; les autres objets restent tels quels
  function armeReelle(jeu, nom, rnd) {
    const O = REGLES.OBJETS[nom]; if (!O || O.type !== 'arme') return nom;
    const permises = (jeu.options.armes || REGLES.ARMES_ID).filter((id) => REGLES.OBJETS[id] && REGLES.OBJETS[id].type === 'arme');
    if (!O.alias && permises.indexOf(O.arme) >= 0) return O.arme;
    const classe = REGLES.arme(O.arme).classe, memes = permises.filter((id) => REGLES.arme(id).classe === classe), liste = memes.length ? memes : permises;
    return liste.length ? liste[Math.floor(rnd() * liste.length)] : 'munitions';
  }

  // le point d'apparition à bonne distance des ennemis vivants (~35 m, jamais à moins de 15 m ; un peu de hasard départage), jamais sur quelqu'un,
  // et de préférence hors de leur vue (monde.vue, jusqu'à VU_MAX m) : on ne se fait pas repeindre dès la fin de l'invincibilité ; regard vers le plus dégagé
  const VU_MAX = 75, CACHE = 25; // au-delà de 75 m, un ennemi ne gêne plus ; être caché vaut 25 m d'écart au « bon » 35 m
  function vuPar(jeu, e, x, z) { // un ennemi vivant voit-il ce point (sa poitrine) ?
    const monde = jeu.monde, es = jeu.entites, y = monde.hauteur(x, z) + 1.2;
    for (let k = 0; k < es.length; k++) {
      const c = es[k]; if (c === e || !c.vivant || c.equipe === e.equipe) continue;
      const dx = c.x - x, dz = c.z - z; if (dx * dx + dz * dz > VU_MAX * VU_MAX) continue;
      if (monde.vue(c.x, c.y + (c.oeil || J.oeil), c.z, x, y, z)) return true;
    }
    return false;
  }
  function apparition(jeu, e) {
    const monde = jeu.monde, A = jeu.arene, rnd = jeu.rnd, es = jeu.entites;
    let bx = 0, bz = 0, bs = -Infinity;
    const pts = A ? A.apparitions : VIDE, ideal = A && A.distance > 0 ? A.distance : 35; // clamp(0,32 · rayon englobant, 15, 60) : ~35 m dans l'arène
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
      let s = dmin < 15 ? dmin - 100 : -Math.abs(dmin - ideal) + 6 * rnd(); // ni sur l'ennemi, ni au bout de l'arène : à ~35 m, l'action reprend vite
      if (dmin < VU_MAX && s > bs && vuPar(jeu, e, x, z)) s -= CACHE; // en vue d'un ennemi : choisi seulement s'il n'y a pas mieux caché (vue testée seulement si le point peut gagner)
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
  const cle = (e) => e.score.kills * 1e6 + e.score.points; // le classement : les repeints (le critère de fin), départagés par les points
  function meneur(jeu) { // le premier du classement (s'il est seul en tête)
    let m = null, s = -1, ex = false;
    for (const e of jeu.entites) { const p = cle(e); if (p > s) { s = p; m = e; ex = false; } else if (p === s) ex = true; }
    return ex ? null : m;
  }

  // les camps : l'équipe en 2 contre 2, sinon chacun (son id)
  const camp = (jeu, e) => (jeu.arene && jeu.arene.equipes ? e.equipe : e.id);
  const nomCamp = (jeu, c) => { if (jeu.arene && jeu.arene.equipes) { const n = NOMS_EQUIPES[c] || 'une équipe'; return n[0].toUpperCase() + n.slice(1); } const e = jeu.trouver(c); return e ? nomDe(e) : String(c); };

  function tick(jeu, dt, evs) {
    const A = jeu.arene; if (!A) return;
    if (A.dernier) { manches(jeu, evs); return; }
    // les réapparitions (rapide 3 s, normale 6 s, lente 10 s)
    for (const e of jeu.entites) if (!e.vivant && jeu.temps - e.mortDepuis >= A.reapparition) jeu.reapparaitre(e, evs);
    chrono(jeu, A, evs);
  }
  function chrono(jeu, A, evs) { // le chrono (sans limite : rien)
    const reste = jeu.reste; if (reste === undefined) return;
    for (const [s, texte] of [[60, 'Plus qu’une minute !'], [30, '30 secondes !'], [10, '10 secondes !']]) if (reste <= s && reste > 0 && !A.chrono[s] && jeu.duree > s) { A.chrono[s] = true; annonce(evs, texte); }
  }

  // ─── « dernier debout » (réapparition 'aucune') : des manches sans réapparition ; une manche finit quand il ne reste qu'un camp en
  // lice (après DEBUT_MIN s de jeu), ou au bout de la durée (le camp qui a le plus de joueurs en lice, puis le plus de vie) ; une trêve
  // de PAUSE_MANCHE s, puis tout le monde réapparaît pour la suivante ; la partie finit quand toutes les manches sont jouées ou que le
  // premier ne peut plus être rattrapé (score de la partie = manches gagnées : e.score.manches) ───
  const DEBUT_MIN = 5, PAUSE_MANCHE = 4, FIN_DELAI = 2;
  function manches(jeu, evs) {
    const A = jeu.arene, Mn = jeu.manche; if (!Mn) return;
    if (!Mn.annoncee) {
      Mn.annoncee = true;
      evs.push({ t: 'manche', quoi: 'debut', n: Mn.n, total: Mn.total });
      annonce(evs, Mn.total > 1 ? `Manche ${Mn.n}/${Mn.total} : dernier debout !` : 'Dernier debout !');
    }
    Mn.enLice.length = 0;
    const vivants = new Map(), presents = new Set();
    for (const e of jeu.entites) { const c = camp(jeu, e); presents.add(c); if (e.vivant) { Mn.enLice.push(e.id); const v = vivants.get(c) || { n: 0, vie: 0 }; v.n++; v.vie += e.vie + e.armure; vivants.set(c, v); } }
    if (Mn.fin == null) {
      const t = jeu.temps - Mn.debut;
      if (presents.size >= 2 && t >= DEBUT_MIN && vivants.size <= 1) finirManche(jeu, vivants.size ? vivants.keys().next().value : null, evs);
      else if (jeu.duree > 0 && t >= jeu.duree) { // au temps : le camp qui a le plus de joueurs en lice, puis le plus de vie ; à égalité, nul
        let best = null, bn = -1, bv = -1, egal = false;
        for (const [c, v] of vivants) { if (v.n > bn || (v.n === bn && v.vie > bv)) { best = c; bn = v.n; bv = v.vie; egal = false; } else if (v.n === bn && v.vie === bv) egal = true; }
        finirManche(jeu, egal ? null : best, evs);
      } else chrono(jeu, A, evs);
    } else if (!A.termine && jeu.temps - Mn.fin >= PAUSE_MANCHE) nouvelleManche(jeu, evs);
  }
  function finirManche(jeu, vainqueur, evs) {
    const A = jeu.arene, Mn = jeu.manche;
    Mn.fin = jeu.temps; Mn.vainqueur = vainqueur; jeu.treve = true;
    if (vainqueur != null) {
      Mn.gagnees[vainqueur] = (Mn.gagnees[vainqueur] || 0) + 1;
      for (const e of jeu.entites) if (camp(jeu, e) === vainqueur) e.score.manches = (e.score.manches | 0) + 1;
    }
    const nom = vainqueur != null ? nomCamp(jeu, vainqueur) : null;
    evs.push({ t: 'manche', quoi: 'fin', n: Mn.n, total: Mn.total, vainqueur, nom, equipes: A.equipes, gagnees: Object.assign({}, Mn.gagnees) });
    const qui = vainqueur == null ? null : A.equipes ? `${nom} gagne` : (() => { const e = jeu.trouver(vainqueur); return e ? `${nomDe(e)} ${verbe(e, 'gagnes', 'gagne')}` : `${nom} gagne`; })();
    annonce(evs, qui ? (Mn.total > 1 ? `${qui} la manche ${Mn.n} !` : `${qui} !`) : `Manche ${Mn.n} : personne ne gagne`);
    // la partie : toutes les manches jouées, ou le premier hors d'atteinte
    const v = Object.values(Mn.gagnees).sort((a, b) => b - a), restantes = Mn.total - Mn.n;
    if (restantes <= 0 || (v[0] || 0) - (v[1] || 0) > restantes) A.termine = true;
  }
  function nouvelleManche(jeu, evs) {
    const A = jeu.arene, Mn = jeu.manche;
    Mn.n++; Mn.debut = jeu.temps; Mn.fin = null; Mn.vainqueur = null; Mn.annoncee = false;
    jeu.treve = false; jeu.debutChrono = jeu.temps; A.chrono = {};
    for (const o of A.objets) { o.dispo = true; o.revient = 0; }
    for (const e of jeu.entites) jeu.reapparaitre(e, evs); // tout le monde, vivant ou non
  }

  function surMort(jeu, v, k, evs) {
    const A = jeu.arene, P = M.points; if (!A) return;
    if (A.dernier && jeu.manche) { // « Encore en lice : N »
      let n = 0; for (const e of jeu.entites) if (e.vivant) n++;
      evs.push({ t: 'elimine', id: v.id, par: k && k !== v ? k.id : null, enLice: n });
      if (n === 2 && !A.equipes && jeu.entites.length > 2 && jeu.manche.fin == null) annonce(evs, 'Duel final !');
    }
    if (!k || k === v || !jeu.ennemis(k, v)) return; // un équipier repeint (tir allié) : PJEU a déjà compté la pénalité
    k.score.points += P.kill;
    if (v.tueTete) k.score.points += P.tete;
    if (k.serie >= 3 && k.serie % 3 === 0) { k.score.points += P.serie3; annonce(evs, `${nomDe(k)} ${verbe(k, 'enchaînes', 'enchaîne')} ${k.serie} repeints !`); }
    else if (!A.premier) annonce(evs, `Premier repeint : ${k.humain && k.nom === 'Toi' ? 'toi' : k.nom} !`);
    A.premier = true;
    if (A.dernier) return; // en manches, le score de la partie, ce sont les manches gagnées
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
    if (A.dernier) return A.termine && !!jeu.manche && jeu.temps - jeu.manche.fin >= FIN_DELAI;
    if (jeu.duree > 0 && jeu.temps >= jeu.duree) return true;
    if (A.equipes) { const [a, b] = scoresEquipes(jeu); return a >= A.victoire || b >= A.victoire; }
    for (const e of jeu.entites) if (e.score.kills >= A.victoire) return true;
    return false;
  }

  function resultat(jeu) {
    const A = jeu.arene, classement = jeu.resume ? jeu.resume() : jeu.classement(), Mn = jeu.manche;
    let gagnant = null, scores = null;
    const c = (l) => (l.score ? l.score.manches | 0 : l.manches | 0) * 1e12 + (l.score ? l.score.kills : l.kills || 0) * 1e6 + (l.score ? l.score.points : l.points || 0);
    if (A && A.equipes) {
      scores = A.dernier && Mn ? [Mn.gagnees[0] || 0, Mn.gagnees[1] || 0] : scoresEquipes(jeu);
      gagnant = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null;
    } else if (A && A.dernier && Mn) { // au plus de manches gagnées ; à égalité, pas de gagnant
      const v = classement.map((l) => (l.score ? l.score.manches | 0 : l.manches | 0));
      if (classement.length && v[0] > 0 && (classement.length < 2 || v[0] > v[1])) gagnant = classement[0].id;
    } else { // chacun pour soi : le même critère que la fin (les repeints), départagé par les points ; à égalité parfaite, pas de gagnant
      if (classement.length && (classement.length < 2 || c(classement[0]) > c(classement[1]))) gagnant = classement[0].id;
    }
    const r = { classement, gagnant, duree: jeu.duree > 0 && !(A && A.dernier) ? Math.min(jeu.temps, jeu.duree) : jeu.temps, equipes: !!(A && A.equipes), scores };
    if (A && A.dernier && Mn) r.manches = { total: Mn.total, jouees: Mn.fin != null ? Mn.n : Mn.n - 1, gagnees: Object.assign({}, Mn.gagnees) };
    return r;
  }

  return { id: 'arene', nom: 'Arène', zones: true, init, tick, surMort, apparition, objets, fini, resultat, COULEURS_EQUIPES, NOMS_EQUIPES, DEBUT_MIN, PAUSE_MANCHE };
});
