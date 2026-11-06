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
     ZJEU.grenade(jeu, id)           → { ok, raison? }   lance une grenade vers le plus gros groupe de zombies (rechargement)
     ZJEU.choisirAtout(jeu, id, k)   → bool              au passage d'un niveau, jeu.choix = { id, options: [3 atouts] } : la partie attend ce choix
     creer({ ..., bonus })           les améliorations du Bunker : { vie, ferraille, degats, xp, grenade, arme } (des crans, voir ZDONNEES.BUNKER)
     ZJEU.prixDefense / prixAmelioration / maxDefenses / compteDefenses : pour l'interface
   Événements (jeu.evs, vidés à chaque pas) : tir { de, arme, x, z, a, l, touche }, touche { cible, x, z, degats }, mort { id, type, x, z, points },
   blesse { id, degats }, ramasse { id, quoi, valeur, arme? }, construit { type, x, z }, casse { type, x, z }, boum { x, z, r }, crachat { x, z },
   vague { n, total }, vagueFinie { n, prime }, serie { mult }, fin { score, vague, tues }, arme { id, arme }, vide { id },
   niveau { id, niveau }, atout { id, atout, rang }, grenade { id, x, z }. Les touches portent crit (coup critique) et de (le tireur).
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
    // deux grilles de navigation : les zombies ordinaires, et les gros (Costaud, boss), qui ne passent pas entre deux voitures
    const nav = PNAV ? PNAV.creer(monde, { pas: 0.75, marge: 0.5, reperes: 4 }) : null;
    const navGros = PNAV ? PNAV.creer(monde, { pas: 0.75, marge: 1.1, reperes: 4 }) : null;
    const rnd = mulberry32((o.graine >>> 0) || 1);
    const jeu = {
      arene: id, A, monde, nav, navGros, rnd, graine: (o.graine >>> 0) || 1,
      t: 0, n: 0, prochainId: 1,
      vague: 0, phase: 'pause', chrono: o.attente != null ? o.attente : 4, aSortir: 0, totalVague: 0, sortieT: 0, bossAVenir: false,
      joueurs: [], zombies: [], defenses: [], objets: [], crachats: [], obus: [], disques: [], zones: [], crochets: [], morts: [],
      serie: { n: 0, t: -99, mult: 1 },
      stats: { tues: 0, ferraille: 0, tirs: 0, construits: 0, parType: {}, crits: 0, grenades: 0, caisses: 0 },
      navPas: 0, evs: [], fini: false, choix: null,
      // le mutateur (défi du jour) : vie, vitesse et nombre des zombies, ferraille, points, recharge de la grenade, arme de départ
      mod: Object.assign({ zVie: 1, zVitesse: 1, nombre: 1, ferraille: 1, points: 1, grenade: 1, arme: null }, o.mod || {}),
      // l'Ascension : l'objectif de l'échelon, sa météo (les chutes : foudre, météores), ses vedettes ; gagne : true / false à la fin
      objectif: o.objectif ? Object.assign({}, o.objectif) : null, meteo: o.meteo || A.meteo || 'clair', chutes: [], vedettes: o.vedettes || [], vaguesFinies: 0, tempsVague: 0, gagne: null,
    };
    // le Lot 4 : un second tirage (bonus, largages, pièges : le premier reste celui d'avant, les parties à graine fixe ne changent pas),
    // les leurres posés, le ralenti en cours, le largage de la vague, les pièges de l'arène
    jeu.rndB = mulberry32(((jeu.graine ^ 0x5bd1e995) >>> 0) || 7); jeu.leurres = []; jeu.ralenti = 0; jeu.largage = null;
    jeu.vus = {}; jeu.pontes = []; jeu.trous = []; // (le Lot 5 : les types déjà sortis dans la partie, les couvées à faire éclore au pas suivant)
    if (o.vagueDepart > 1) jeu.vague = Math.min(40, o.vagueDepart) - 1;
    // les modes à plusieurs : « cps » (chacun pour soi : la même arme pour tous, pas de caisses, pas de relève, le dernier debout gagne) ;
    // « duel » (à deux : tes zombies abattus en envoient à l'autre, un atout offert à chaque vague, le dernier debout gagne)
    if (o.mode === 'cps' || o.mode === 'duel') jeu.mode = o.mode;
    jeu.gagnant = '';
    jeu.pieges = o.sansPieges || jeu.mode ? [] : poserPieges(jeu);
    // en solo, un niveau passé met la partie en pause le temps du choix ; à plusieurs, chacun choisit sans arrêter les autres
    jeu.pauseChoix = o.pauseChoix != null ? !!o.pauseChoix : !(o.joueurs && o.joueurs.length > 1);
    const liste = o.joueurs && o.joueurs.length ? o.joueurs : [{ id: 'moi', pseudo: 'Moi' }];
    liste.forEach((j, k) => {
      const a = (k / liste.length) * TAU, p = monde.libreProche(A.depart[0] + (liste.length > 1 ? Math.cos(a) * 1.2 : 0), A.depart[1] + (liste.length > 1 ? Math.sin(a) * 1.2 : 0), D.JOUEUR.rayon, 6) || A.depart;
      jeu.joueurs.push({
        id: j.id, pseudo: j.pseudo || 'Survivant', x: p[0], z: p[1], vx: 0, vz: 0, angle: -Math.PI / 2, rayon: D.JOUEUR.rayon,
        vie: D.JOUEUR.vie, vieMax: D.JOUEUR.vie, vivant: true, invul: 0, effets: {},
        armes: [{ id: D.ARME_DE_BASE, mun: Infinity }, null], main: 0, attente: 0, cible: 0, visee: 0,
        ferraille: o.ferraille != null ? o.ferraille : 0, score: 0, tues: 0, niveaux: {}, bouge: 0,
        xp: 0, niveau: 1, choixAttente: 0, atouts: {}, grenadeT: 0, regenR: 0, boss: 0,
        bonus: Object.assign({ vie: 0, ferraille: 0, degats: 0, xp: 0, grenade: 0, arme: 0 }, o.bonus || {}, j.bonus || {}),
        choix: null, releve: 0, mGrenade: 1, chauffe: 0, salve: 0, salveT: 0,
        skin: j.skin && D.SURVIVANTS[j.skin] ? j.skin : 'gardien', finitions: Object.assign({}, j.finitions || {}), emote: null, emoteCd: 0,
      });
    });
    // le Bunker : de la vie et de la ferraille en plus au départ, parfois une arme
    for (const j of jeu.joueurs) {
      if (jeu.mod.unPV) { j.vieMax = 1; j.vie = 1; continue; } // (le Bunker ne sauve personne ici)
      const B = D.BUNKER, b = j.bonus;
      j.vieMax += b.vie * B.vie.par; j.vie = j.vieMax; j.ferraille += b.ferraille * B.ferraille.par;
      j.mGrenade = jeu.mod.grenade;
      if (jeu.mod.armeRare) { const l = Object.keys(D.ARMES).filter((k) => D.ARMES[k].rarete > 0 && D.ARMES[k].rarete <= 10), id = l[Math.floor(rnd() * l.length) % l.length]; j.armes[1] = { id, mun: D.ARMES[id].munitions }; j.main = 1; continue; }
      if (jeu.mod.arme && D.ARMES[jeu.mod.arme]) { j.armes[1] = { id: jeu.mod.arme, mun: D.ARMES[jeu.mod.arme].munitions }; j.main = 1; continue; }
      if (b.arme > 0) { const l = Object.keys(D.ARMES).filter((k) => D.ARMES[k].rarete > 0 && D.ARMES[k].depuis <= 2), id = l[Math.floor(rnd() * l.length) % l.length]; j.armes[1] = { id, mun: D.ARMES[id].munitions }; j.main = 1; }
    }
    if (jeu.mode === 'cps') { const l = Object.keys(D.ARMES).filter((k) => D.ARMES[k].rarete > 0), a = l[Math.floor(rnd() * l.length) % l.length]; for (const j of jeu.joueurs) { j.armes[1] = { id: a, mun: Infinity }; j.main = 1; } jeu.armeCommune = a; }
    // le générateur à protéger, au départ de l'arène
    if (jeu.objectif && jeu.objectif.type === 'generateur') {
      const G = D.DEFENSES.generateur, p = monde.libreProche(A.depart[0] + 2.2, A.depart[1], G.rayon, 6) || A.depart;
      jeu.defenses.push({ id: jeu.prochainId++, type: 'generateur', x: p[0], z: p[1], vie: G.vie, vieMax: G.vie, angle: 0, attente: 0, flash: 0, par: null });
    }
    return jeu;
  }

  // ─── utilitaires ───
  const nouvelId = (jeu) => jeu.prochainId++;
  const ev = (jeu, e) => { jeu.evs.push(e); };
  const niveau = (j, type) => j.niveaux[type] || 0;
  const rang = (j, k) => j.atouts[k] || 0;
  const multDegats = (j) => (1 + niveau(j, 'degats') * D.AMELIORATIONS.degats.par) * (1 + rang(j, 'degats') * D.ATOUTS.degats.par) * (1 + j.bonus.degats * D.BUNKER.degats.par) * (j.effets && j.effets.rage > 0 ? D.BONUS.rage.facteur : 1);
  const multCadence = (j) => (1 + niveau(j, 'cadence') * D.AMELIORATIONS.cadence.par) * (1 + rang(j, 'cadence') * D.ATOUTS.cadence.par);
  const chanceCritique = (j) => D.CRITIQUE.chance + rang(j, 'critique') * D.ATOUTS.critique.par;
  const rechargeGrenade = (j) => D.GRENADE.recharge * (1 - rang(j, 'grenade') * 0.15) * (1 - j.bonus.grenade * D.BUNKER.grenade.par) * (j.mGrenade || 1);
  const multDefense = (jeu) => { let m = 0; for (const j of jeu.joueurs) m = Math.max(m, niveau(j, 'defense')); return 1 + m * D.AMELIORATIONS.defense.par; };
  const aimant = (j) => Math.max(D.JOUEUR.aimant + niveau(j, 'aimant') * D.AMELIORATIONS.aimant.par + rang(j, 'aimant') * D.ATOUTS.aimant.par, j.effets && j.effets.aimant > 0 ? D.BONUS.aimant.rayon : 0);
  function maxDefenses(jeu, type) { const d = D.DEFENSES[type]; if (!d || Math.max(1, jeu.vague) < d.depuis) return 0; return d.max + Math.floor(Math.max(0, jeu.vague - 1) / d.plus); }
  function compteDefenses(jeu, type) { let n = 0; for (const d of jeu.defenses) if (d.type === type) n++; return n; }
  const prixDefense = (jeu, type) => (D.DEFENSES[type] ? D.DEFENSES[type].prix : Infinity);
  function prixAmelioration(j, type) { const a = D.AMELIORATIONS[type]; if (!a) return Infinity; const n = niveau(j, type); return n >= a.crans ? Infinity : Math.round(a.prix * Math.pow(a.facteur, n)); }
  const trouverJoueur = (jeu, id) => jeu.joueurs.find((j) => j.id === id) || null;
  const armeDe = (j) => { const s = j.armes[j.main]; return s ? D.ARMES[s.id] : D.ARMES[D.ARME_DE_BASE]; };

  // ─── les vagues ───
  function lancerVague(jeu) {
    const V = D.VAGUES; jeu.vague++; jeu.phase = 'vague';
    jeu.totalVague = Math.ceil(V.nombre(jeu.vague) * jeu.mod.nombre); jeu.aSortir = jeu.totalVague; jeu.sortieT = 0.6; jeu.bossAVenir = V.boss(jeu.vague);
    if (jeu.mode !== 'cps') for (let k = 0; k < V.caisse(jeu.vague); k++) poserCaisse(jeu);
    if (jeu.mode === 'duel') for (const j of jeu.joueurs) { // un atout offert à chaque vague, au hasard
      if (!j.vivant) continue; const l = Object.keys(D.ATOUTS).filter((k) => rang(j, k) < D.ATOUTS[k].max); if (!l.length) continue;
      const k = l[Math.floor(jeu.rnd() * l.length) % l.length]; j.atouts[k] = rang(j, k) + 1; if (k === 'vie') { j.vieMax += D.ATOUTS.vie.par; j.vie += D.ATOUTS.vie.par; }
      ev(jeu, { t: 'atout', id: j.id, atout: k, rang: j.atouts[k], offert: true });
    }
    const O = jeu.objectif;
    if (O && O.type === 'contrat' && !O.lance) { O.lance = true; if (fairesortir(jeu, O.cible)) { const e = jeu.zombies[jeu.zombies.length - 1]; e.vie = e.vieMax = Math.round(e.vieMax * O.vie); e.elite = true; O.id = e.id; } }
    if (!jeu.mode && !jeu.mod.sansLargage && jeu.vague >= D.LARGAGE.depuis) { const L = D.LARGAGE; jeu.largage = { t: L.apres[0] + jeu.rndB() * (L.apres[1] - L.apres[0]), pose: false }; }
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
    const n = jeu.vague, rnd = jeu.rnd, V = jeu.vedettes; let somme = 0;
    const poids = (k, z) => (V.includes(k) ? Math.max(3, z.poids * 3) : z.depuis <= n ? z.poids * (k === 'trainard' ? 1 : Math.min(2, 1 + (n - z.depuis) * 0.12)) : 0);
    for (const k in D.ZOMBIES) { const z = D.ZOMBIES[k]; if (z.poids > 0) somme += poids(k, z); }
    let r = rnd() * somme;
    for (const k in D.ZOMBIES) { const z = D.ZOMBIES[k]; if (z.poids > 0) { r -= poids(k, z); if (r <= 0) return k; } }
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
    const vie = Math.round(Z.vie * kv * jeu.mod.zVie * (Z.boss ? 1 + Math.max(0, jeu.joueurs.length - 1) * 0.6 : 1));
    jeu.zombies.push({
      id: nouvelId(jeu), type, x: p[0], z: p[1], vie, vieMax: vie, vitesse: Z.vitesse * kx * jeu.mod.zVitesse, rayon: Z.rayon, angle: 0,
      chemin: null, ci: 0, repense: rnd() * 0.4, coinceT: 0, coince: 0, cx: p[0], cz: p[1], coup: 0.3 + rnd() * 0.5, crache: 1 + rnd(), flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: jeu.t,
    });
    lot5(jeu, jeu.zombies[jeu.zombies.length - 1], kv);
    return true;
  }

  // le Lot 5 : ce que porte un zombie à sa sortie (le bouclier du blindé, la phase du boss), et l'annonce d'un type encore jamais vu
  function lot5(jeu, zb, kv) {
    const Z = D.ZOMBIES[zb.type];
    if (Z.bouclier) zb.bouclier = Math.round(Z.bouclier.vie * (kv || 1) * jeu.mod.zVie);
    if (Z.terre) zb.dehors = 0.4;
    if (Z.boss) zb.phase = 1;
    if (jeu.vus && !jeu.vus[zb.type]) { jeu.vus[zb.type] = 1; if (Z.astuce) ev(jeu, { t: 'nouveau', type: zb.type }); }
  }
  // un zombie qui naît sur place (une larve, la meute du loup-garou) : la vie et la vitesse de la vague
  function rejeton(jeu, type, x, z) {
    const Z = D.ZOMBIES[type], p = jeu.monde.libreProche(x, z, Z.rayon, 2.5); if (!p) return null;
    const n = Math.max(1, jeu.vague), vie = Math.round(Z.vie * D.VAGUES.vie(n) * jeu.mod.zVie);
    const zb = { id: nouvelId(jeu), type, x: p[0], z: p[1], vie, vieMax: vie, vitesse: Z.vitesse * D.VAGUES.vitesse(n) * jeu.mod.zVitesse, rayon: Z.rayon, angle: 0, chemin: null, ci: 0, repense: 0.1, coinceT: 0, coince: 0, cx: p[0], cz: p[1], coup: 0.5, crache: 1, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: jeu.t };
    jeu.zombies.push(zb); lot5(jeu, zb, D.VAGUES.vie(n)); return zb;
  }
  // une couvée : n larves autour du point (les angles au second tirage)
  function pondre(jeu, x, z, n) {
    const pts = [];
    for (let k = 0; k < n && jeu.zombies.length < 64; k++) { const a = jeu.rndB() * TAU, r = 0.5 + jeu.rndB() * 0.6, l = rejeton(jeu, 'larve', x + Math.cos(a) * r, z + Math.sin(a) * r); if (l) pts.push([r2j(l.x), r2j(l.z)]); }
    if (pts.length) ev(jeu, { t: 'ponte', x: r2j(x), z: r2j(z), pts });
  }

  function ressortir(jeu, zb) {
    const A = jeu.A, l = A.sorties.filter((s) => jeu.joueurs.every((j) => !j.vivant || Math.hypot(s[0] - j.x, s[1] - j.z) > 9)), L = l.length ? l : A.sorties;
    const s = L[Math.floor(jeu.rnd() * L.length) % L.length], p = jeu.monde.libreProche(s[0], s[1], zb.rayon, 6); if (!p) return;
    zb.x = p[0]; zb.z = p[1]; zb.cx = p[0]; zb.cz = p[1]; zb.coince = 0; zb.chemin = null; zb.repense = 0; zb.naissance = jeu.t;
    ev(jeu, { t: 'ressort', id: zb.id });
  }

  // ─── les tirs (balles instantanées) ───
  const _touches = [];
  function rafale(jeu, de, x0, z0, a, arme, mult, estJoueur, tireur) {
    const rnd = jeu.rnd, extra = tireur ? rang(tireur, 'multi') : 0, nb = arme.balles + extra;
    for (let b = 0; b < nb; b++) {
      // les balles du tir double partent en éventail autour de l'axe
      const eventail = extra && arme.balles === 1 ? (b - (nb - 1) / 2) * 0.13 : 0;
      let ab = a + eventail + (rnd() - 0.5) * arme.dispersion * (arme.balles > 1 ? 1 : 2);
      let dx = Math.cos(ab), dz = Math.sin(ab), x = x0, z = z0, reste = arme.portee;
      for (let rb = 0; rb <= (arme.ricochets || 0); rb++) { // (le ricocheur : la balle repart du mur, autant de fois qu'il le dit)
      const portee = jeu.monde.tir(x, z, dx, dz, reste);
      // les zombies sur le rayon, du plus proche au plus loin
      _touches.length = 0;
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0 || zb.terre) continue;
        const fx = zb.x - x, fz = zb.z - z, t = fx * dx + fz * dz; if (t < 0 || t > portee + zb.rayon) continue;
        const px = fx - t * dx, pz = fz - t * dz, R = zb.rayon + 0.12; if (px * px + pz * pz > R * R) continue;
        _touches.push([t, zb]);
      }
      _touches.sort((p, q) => p[0] - q[0]);
      if (estJoueur) for (const d of jeu.defenses) { // un baril sur le trajet de la balle, avant le premier zombie : il prend
        if (d.type !== 'baril' || d.vie <= 0) continue;
        const fx = d.x - x, fz = d.z - z, t = fx * dx + fz * dz; if (t < 0 || t > portee || (_touches.length && t > _touches[0][0])) continue;
        const px = fx - t * dx, pz = fz - t * dz; if (px * px + pz * pz < 0.45 * 0.45) { d.vie -= arme.degats * mult; d.flash = 0.1; }
      }
      let l = portee, n = 0;
      for (const [t, zb] of _touches) {
        if (n > arme.perce) break;
        const Zp = D.ZOMBIES[zb.type];
        if (Zp.pare && estJoueur && jeu.t - zb.naissance > SORTIE && ecartAngle(zb.angle, ab + Math.PI) < 1.0 && rnd() < Zp.pare) { ev(jeu, { t: 'pare', id: zb.id, x: zb.x, z: zb.z }); l = t; n = arme.perce + 1; break; } // parée : la balle s'arrête là
        const crit = !!tireur && rnd() < chanceCritique(tireur);
        const deg = arme.degats * mult * (estJoueur && n > 0 && !arme.sansPerte ? 0.7 : 1) * (crit ? D.CRITIQUE.mult : 1);
        if (arme.toxine && !zb.terre) { zb.poisonDps = Math.max(zb.poison > 0 ? zb.poisonDps || 0 : 0, arme.toxine.dps * mult); zb.poison = arme.toxine.duree; zb.poisonDe = de; }
        blesserZombie(jeu, zb, deg, dx * arme.recul, dz * arme.recul, de, crit);
        n++; l = t;
      }
      if (n > arme.perce) { /* arrêtée par le dernier zombie traversé (ou parée) */ } else l = portee;
      if (arme.explose && (n > 0 || l < arme.portee - 0.05)) explosion(jeu, x + dx * l, z + dz * l, arme.explose.souffle, arme.explose.degats * mult, de, true);
      if (!rb) jeu.stats.tirs++;
      ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a: ab, l, touche: n > 0, b, rb });
      // un ricochet : la balle n'a touché personne et s'est arrêtée sur un mur avant sa portée
      reste -= l; if (n > 0 || reste < 0.6 || rb >= (arme.ricochets || 0)) break;
      const hx = x + dx * (l - 0.08), hz = z + dz * (l - 0.08), bx = jeu.monde.bloque(hx + dx * 0.22, hz, 0.02), bz = jeu.monde.bloque(hx, hz + dz * 0.22, 0.02);
      if (bx || !bz) dx = -dx; if (bz || !bx) dz = -dz; // (un coin : elle revient d'où elle vient)
      x = hx; z = hz; ab = Math.atan2(dz, dx);
      }
    }
  }
  // un tir de survivant, selon le mode de l'arme
  function tirer(jeu, j, arme, cible, cle) {
    const bx = j.x + Math.cos(j.angle) * 0.5, bz = j.z + Math.sin(j.angle) * 0.5, mult = multDegats(j), A = remplir(_armeTir, arme, { cle });
    if (arme.mode === 'flamme') souffler(jeu, j.id, bx, bz, j.angle, A, mult);
    else if (arme.mode === 'tesla') eclair(jeu, j.id, bx, bz, j.angle, A, mult, j, cible);
    else if (arme.mode === 'roquette' || arme.mode === 'obus') lancer(jeu, j.id, bx, bz, j.angle, A, mult, cible);
    else if (arme.mode === 'scie') scier(jeu, j.id, bx, bz, j.angle, A, mult);
    else if (arme.mode === 'lame') trancher(jeu, j.id, j.x, j.z, j.angle, A, mult, j);
    else if (arme.mode === 'onde') sonner(jeu, j.id, bx, bz, j.angle, A, mult);
    else rafale(jeu, j.id, bx, bz, j.angle, A, mult, true, j);
  }
  // le cône du lance-flammes (et du cryo-canon) : tout ce qui est dedans, à portée et en vue, prend un peu, et brûle (ou gèle)
  function souffler(jeu, de, x, z, a, arme, mult) {
    const portee = jeu.monde.tir(x, z, Math.cos(a), Math.sin(a), arme.portee);
    for (const zb of jeu.zombies) {
      if (zb.vie <= 0) continue;
      const fx = zb.x - x, fz = zb.z - z, d = Math.hypot(fx, fz); if (d > portee + zb.rayon) continue;
      if (ecartAngle(a, Math.atan2(fz, fx)) > arme.cone + zb.rayon / Math.max(d, 0.6)) continue;
      if (!jeu.monde.vue(x, z, zb.x, zb.z)) continue;
      if (arme.feu) { zb.feu = arme.feu.duree; zb.feuDps = Math.max(zb.feuDps || 0, arme.feu.dps * mult); zb.feuDe = de; }
      if (arme.gel) zb.gel = Math.max(zb.gel || 0, arme.gel.duree);
      blesserZombie(jeu, zb, arme.degats * mult, Math.cos(a) * arme.recul, Math.sin(a) * arme.recul, de, false, false, true);
    }
    jeu.stats.tirs++;
    ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a, l: portee, touche: true, b: 0 });
  }
  // la machette : un coup en arc devant le survivant, tout ce qui est dedans (à portée et en vue) prend, et recule
  function trancher(jeu, de, x, z, a, arme, mult, tireur) {
    let n = 0;
    for (const zb of jeu.zombies) {
      if (zb.vie <= 0 || zb.terre) continue;
      const fx = zb.x - x, fz = zb.z - z, d = Math.hypot(fx, fz); if (d > arme.portee + zb.rayon) continue;
      if (d > 0.3 && ecartAngle(a, Math.atan2(fz, fx)) > arme.cone + zb.rayon / Math.max(d, 0.6)) continue;
      if (!jeu.monde.vue(x, z, zb.x, zb.z)) continue;
      const crit = !!tireur && jeu.rnd() < chanceCritique(tireur), k = d > 1e-3 ? 1 / d : 0;
      blesserZombie(jeu, zb, arme.degats * mult * (crit ? D.CRITIQUE.mult : 1), fx * k * arme.recul, fz * k * arme.recul, de, crit); n++;
    }
    jeu.stats.tirs++;
    ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a, l: arme.portee, touche: n > 0, b: 0 });
  }
  // le canon sonique : un cône court ; ce qui est dedans prend un peu, est repoussé loin (selon sa masse) et reste étourdi un instant
  function sonner(jeu, de, x, z, a, arme, mult) {
    const portee = jeu.monde.tir(x, z, Math.cos(a), Math.sin(a), arme.portee); let n = 0;
    for (const zb of jeu.zombies) {
      if (zb.vie <= 0 || zb.terre) continue;
      const fx = zb.x - x, fz = zb.z - z, d = Math.hypot(fx, fz); if (d > portee + zb.rayon) continue;
      if (ecartAngle(a, Math.atan2(fz, fx)) > arme.cone + zb.rayon / Math.max(d, 0.6) || !jeu.monde.vue(x, z, zb.x, zb.z)) continue;
      const k = d > 1e-3 ? 1 / d : 0, boss = D.ZOMBIES[zb.type].boss, f = 1 - Math.min(0.6, d / arme.portee * 0.6);
      zb.etourdi = Math.max(zb.etourdi || 0, arme.etourdit * (boss ? 0.25 : 1)); zb.chemin = null;
      blesserZombie(jeu, zb, arme.degats * mult, fx * k * arme.recul * f, fz * k * arme.recul * f, de, false, true); n++;
    }
    jeu.stats.tirs++;
    ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a, l: portee, touche: n > 0, b: 0 });
  }
  // l'éclair du fusil Tesla : la cible, puis le zombie le plus proche de celle-ci (en vue, à « saut » mètres au plus), et ainsi de suite
  const r2j = (v) => Math.round(v * 100) / 100;
  function eclair(jeu, de, x, z, a, arme, mult, tireur, cible) {
    const pts = [[r2j(x), r2j(z)]], deja = new Set();
    let cur = cible && cible.vie > 0 && Math.hypot(cible.x - x, cible.z - z) <= arme.portee + cible.rayon ? cible : null, px = x, pz = z;
    for (let k = 0; cur && k <= arme.rebonds; k++) {
      deja.add(cur.id); pts.push([r2j(cur.x), r2j(cur.z)]);
      const crit = !!tireur && jeu.rnd() < chanceCritique(tireur), n = Math.hypot(cur.x - px, cur.z - pz) || 1;
      const nx = cur.x, nz = cur.z;
      blesserZombie(jeu, cur, arme.degats * mult * Math.pow(0.85, k) * (crit ? D.CRITIQUE.mult : 1), (cur.x - px) / n * 0.3, (cur.z - pz) / n * 0.3, de, crit);
      px = nx; pz = nz; let best = arme.saut * arme.saut, suivant = null;
      for (const o of jeu.zombies) { if (o.vie <= 0 || o.terre || deja.has(o.id)) continue; const d2 = (o.x - px) ** 2 + (o.z - pz) ** 2; if (d2 < best && jeu.monde.vue(px, pz, o.x, o.z)) { best = d2; suivant = o; } }
      cur = suivant;
    }
    jeu.stats.tirs++;
    ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a, l: 0, touche: pts.length > 1, b: 0, pts });
  }
  // la roquette part droit jusqu'au premier zombie (ou au mur) ; la grenade (et l'acide) part en cloche vers la cible
  function lancer(jeu, de, x, z, a, arme, mult, cible) {
    const dx = Math.cos(a), dz = Math.sin(a); let d;
    if (arme.mode === 'roquette') {
      d = jeu.monde.tir(x, z, dx, dz, arme.portee);
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0 || zb.terre) continue;
        const fx = zb.x - x, fz = zb.z - z, t = fx * dx + fz * dz; if (t < 0 || t > d) continue;
        const px = fx - t * dx, pz = fz - t * dz; if (px * px + pz * pz < (zb.rayon + 0.15) ** 2) d = Math.max(0.3, t - zb.rayon * 0.5);
      }
    } else d = cible ? Math.min(arme.portee, Math.hypot(cible.x - x, cible.z - z)) : arme.portee * 0.7;
    if (arme.trou) d = Math.min(d, jeu.monde.tir(x, z, dx, dz, d)); // (la singularité file droit : elle s'ouvre au mur s'il y en a un)
    const x1 = x + dx * d, z1 = z + dz * d;
    jeu.obus.push({ x0: x, z0: z, x1, z1, t: 0, duree: arme.mode === 'roquette' ? d / arme.vitesse : arme.trou ? 0.2 + d / 10 : 0.35 + d * 0.04, degats: arme.degats * mult, souffle: arme.souffle, de,
      droit: arme.mode === 'roquette' || !!arme.trou, flaque: arme.flaque ? { r: arme.flaque.r, dps: arme.flaque.dps * mult, duree: arme.flaque.duree } : null, cle: arme.cle || '',
      grappe: arme.grappe ? Object.assign({}, arme.grappe, { degats: arme.grappe.degats * mult }) : null, trou: arme.trou ? Object.assign({}, arme.trou, { dps: arme.trou.dps * mult, implose: arme.trou.implose * mult }) : null });
    jeu.stats.tirs++;
    ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a, l: 0, touche: false, b: 0 });
  }
  // le disque du lance-scies : il file, traverse tout (un coup par zombie toutes les 0,35 s), rebondit sur les murs, puis revient
  function scier(jeu, de, x, z, a, arme, mult) {
    jeu.disques.push({ id: nouvelId(jeu), x, z, vx: Math.cos(a) * arme.vitesse, vz: Math.sin(a) * arme.vitesse, v: arme.vitesse, t: 0, aller: arme.portee / arme.vitesse, degats: arme.degats * mult, recul: arme.recul, de, vus: {} });
    jeu.stats.tirs++;
    ev(jeu, { t: 'tir', de, arme: arme.classe, cle: arme.cle || '', x, z, a, l: 0, touche: false, b: 0 });
  }
  function blesserZombie(jeu, zb, deg, px, pz, de, crit, souffle, petit) {
    if (zb.vie <= 0 || zb.terre) return; // (sous terre : intouchable)
    const Zb = D.ZOMBIES[zb.type];
    if (Zb.bouclier && zb.bouclier > 0 && !souffle && !petit && jeu.t - zb.naissance > SORTIE) {
      // le coup vient-il de face ? (du tireur s'il est un survivant, sinon d'en face du recul)
      const j = trouverJoueur(jeu, de), ax = j ? j.x - zb.x : -px, az = j ? j.z - zb.z : -pz;
      if ((ax || az) && ecartAngle(zb.angle, Math.atan2(az, ax)) < Zb.bouclier.cone) {
        zb.bouclier -= deg * (1 - Zb.bouclier.passe); deg *= Zb.bouclier.passe; px *= 0.2; pz *= 0.2;
        if (zb.bouclier <= 0) { zb.bouclier = 0; ev(jeu, { t: 'brise', id: zb.id, x: zb.x, z: zb.z, a: r2j(zb.angle) }); }
        else if (!(zb.ricT > jeu.t)) { zb.ricT = jeu.t + 0.12; ev(jeu, { t: 'ricoche', id: zb.id, x: zb.x, z: zb.z, a: r2j(zb.angle) }); }
      }
    }
    zb.vie -= deg; zb.flash = 0.12;
    zb.dernier = { px, pz, fort: !!crit || !!souffle || deg >= 60 }; // le dernier coup : d'où il vient, et s'il était fort (le rendu fait voler les morceaux)
    const Z = D.ZOMBIES[zb.type], masse = Z.boss ? 0.15 : Z.rayon > 0.6 ? 0.4 : 1;
    zb.rx += px * masse * 4; zb.rz += pz * masse * 4;
    if (crit) jeu.stats.crits++;
    ev(jeu, { t: 'touche', cible: zb.id, x: zb.x, z: zb.z, degats: Math.max(1, Math.round(deg)), crit: !!crit, de, boss: !!D.ZOMBIES[zb.type].boss, petit: !!petit });
    if (zb.vie <= 0) tuer(jeu, zb, de);
  }
  function tuer(jeu, zb, de) {
    const Z = D.ZOMBIES[zb.type], rnd = jeu.rnd;
    // la série : tuer vite multiplie les points
    const S = jeu.serie, avant = S.mult;
    S.n = jeu.t - S.t <= D.SERIE.fenetre ? S.n + 1 : 1; S.t = jeu.t;
    S.mult = 1; for (const [seuil, m] of D.SERIE.paliers) if (S.n >= seuil) { S.mult = m; break; }
    if (S.mult > avant) ev(jeu, { t: 'serie', mult: S.mult, n: S.n });
    const points = Math.round(Z.points * S.mult * jeu.mod.points);
    // le tueur (un survivant, ou une défense : les points vont au plus proche des survivants)
    let j = trouverJoueur(jeu, de);
    if (!j) { let best = Infinity; for (const k of jeu.joueurs) { const d = Math.hypot(k.x - zb.x, k.z - zb.z); if (k.vivant && d < best) { best = d; j = k; } } }
    if (j) { j.score += points; j.tues++; if (Z.boss) j.boss++; gagnerXp(jeu, j, Z.points * D.XP.parPoint); }
    if (j && jeu.mode === 'duel' && !zb.envoye && (j.envois = (j.envois || 0) + 1) % 6 === 0) envoyer(jeu, j);
    jeu.stats.tues++; jeu.stats.parType[zb.type] = (jeu.stats.parType[zb.type] || 0) + 1;
    if (Z.ponte) jeu.pontes.push([zb.x, zb.z, Z.ponte.mort]);
    if (zb.poison > 0) { // la contagion : le poison passe aux zombies autour
      const T = D.ARMES.toxines.toxine; let n = 0;
      for (const o of jeu.zombies) if (o !== zb && o.vie > 0 && !o.terre && (o.x - zb.x) ** 2 + (o.z - zb.z) ** 2 < T.contagion * T.contagion) { o.poison = T.duree; o.poisonDps = Math.max(o.poisonDps || 0, zb.poisonDps); o.poisonDe = zb.poisonDe; n++; }
      ev(jeu, { t: 'contagion', x: r2j(zb.x), z: r2j(zb.z), r: T.contagion, n });
    }
    if (!Z.boss && zb.type !== 'kamikaze' && !Z.petit) { jeu.morts.push({ x: zb.x, z: zb.z, t: jeu.t }); if (jeu.morts.length > 24) jeu.morts.shift(); }
    // ce qu'il laisse : de la ferraille (en quelques morceaux), parfois un soin
    const fouille = j ? rang(j, 'butin') * D.ATOUTS.butin.par : 0;
    let reste = Math.floor(Z.ferraille * jeu.mod.ferraille * (1 + fouille) + rnd() * 0.999 * (Z.ferraille * fouille % 1 ? 1 : 0)); const total = reste; const morceaux = Math.min(5, Math.max(1, Math.ceil(reste / 5)));
    for (let k = 0; k < morceaux && jeu.objets.length < MAX_OBJETS; k++) {
      const v = k === morceaux - 1 ? reste : Math.ceil(total / morceaux); reste -= v;
      const a = rnd() * TAU, r = morceaux > 1 ? 0.3 + rnd() * 0.6 : 0;
      jeu.objets.push({ id: nouvelId(jeu), type: 'ferraille', x: zb.x + Math.cos(a) * r, z: zb.z + Math.sin(a) * r, valeur: v, age: 0, vole: false });
    }
    if (rnd() < (Z.boss ? 1 : 0.035) && jeu.objets.length < MAX_OBJETS) jeu.objets.push({ id: nouvelId(jeu), type: 'soin', x: zb.x + 0.4, z: zb.z, valeur: 30, age: 0, vole: false });
    if (!Z.boss && !jeu.mode && jeu.rndB() < (zb.elite ? D.BONUS_CHANCE.elite : D.BONUS_CHANCE.zombie) && jeu.objets.length < MAX_OBJETS) jeu.objets.push({ id: nouvelId(jeu), type: 'bonus', bonus: tirerBonus(jeu), x: zb.x - 0.3, z: zb.z + 0.2, valeur: 0, age: 0, vole: false });
    if (Z.boss) poserCaisse(jeu);
    const dc = zb.dernier || { px: 0, pz: 0, fort: false };
    ev(jeu, { t: 'mort', id: zb.id, type: zb.type, x: zb.x, z: zb.z, a: zb.angle, points, par: de, boss: !!Z.boss, kx: Math.round(dc.px * 100) / 100, kz: Math.round(dc.pz * 100) / 100, fort: dc.fort });
    if (Z.kamikaze) detoner(jeu, zb, de);
  }
  // ─── l'expérience, les niveaux et les atouts ───
  function gagnerXp(jeu, j, x) {
    j.xp += x * (1 + j.bonus.xp * D.BUNKER.xp.par);
    while (j.xp >= D.XP.pour(j.niveau)) { j.xp -= D.XP.pour(j.niveau); j.niveau++; j.choixAttente++; ev(jeu, { t: 'niveau', id: j.id, niveau: j.niveau }); }
    proposer(jeu);
  }
  function proposer(jeu) { // trois atouts tirés au hasard parmi ceux qui ne sont pas au maximum, pour chaque joueur qui a un niveau en attente
    for (const j of jeu.joueurs) {
      if (j.choix || j.choixAttente <= 0 || !j.vivant) continue;
      const l = Object.keys(D.ATOUTS).filter((k) => rang(j, k) < D.ATOUTS[k].max), options = [];
      while (options.length < 3 && l.length) options.push(l.splice(Math.floor(jeu.rnd() * l.length) % l.length, 1)[0]);
      if (!options.length) { j.choixAttente = 0; continue; }
      j.choix = { id: j.id, options, niveau: j.niveau - j.choixAttente + 1 };
    }
    majChoixGlobal(jeu);
  }
  // jeu.choix : le choix qui met la partie en pause (en solo seulement)
  function majChoixGlobal(jeu) { const j = jeu.pauseChoix ? jeu.joueurs.find((k) => k.choix) : null; jeu.choix = j ? j.choix : null; }
  function choisirAtout(jeu, idJ, k) {
    const j = trouverJoueur(jeu, idJ); if (!j) return false;
    if (!j.choix && jeu.choix && jeu.choix.id === idJ) j.choix = jeu.choix; // (un choix posé tel quel sur jeu.choix)
    const c = j.choix; if (!c || !c.options.includes(k)) return false;
    const A = D.ATOUTS[k];
    j.atouts[k] = rang(j, k) + 1; j.choixAttente = Math.max(0, j.choixAttente - 1);
    if (k === 'vie') { j.vieMax += A.par; j.vie = Math.min(j.vieMax, j.vie + A.par); }
    j.choix = null; jeu.choix = null; ev(jeu, { t: 'atout', id: j.id, atout: k, rang: j.atouts[k] });
    proposer(jeu);
    return true;
  }
  function grenade(jeu, idJ) {
    const j = trouverJoueur(jeu, idJ); if (!j || !j.vivant || jeu.fini) return { ok: false, raison: 'mort' };
    if (jeu.pauseChoix && jeu.choix) return { ok: false, raison: 'choix' };
    if (j.grenadeT > 0) return { ok: false, raison: 'recharge' };
    // la cible : le zombie qui a le plus de voisins à portée (sinon droit devant)
    const G = D.GRENADE, p2 = G.portee * G.portee, s2 = G.souffle * G.souffle; let cible = null, score = -1;
    for (const zb of jeu.zombies) {
      if ((zb.x - j.x) ** 2 + (zb.z - j.z) ** 2 > p2) continue;
      let n = 0; for (const o of jeu.zombies) if ((o.x - zb.x) ** 2 + (o.z - zb.z) ** 2 < s2) n++;
      if (n > score) { score = n; cible = zb; }
    }
    const x1 = cible ? cible.x : j.x + Math.cos(j.angle) * 6, z1 = cible ? cible.z : j.z + Math.sin(j.angle) * 6;
    const k = 1 + rang(j, 'grenade') * D.ATOUTS.grenade.par;
    jeu.obus.push({ x0: j.x, z0: j.z, x1, z1, t: 0, duree: G.vol, degats: G.degats * k * multDegats(j), souffle: G.souffle * (1 + rang(j, 'grenade') * 0.1), de: j.id, grenade: true });
    j.grenadeT = rechargeGrenade(j); jeu.stats.grenades++;
    ev(jeu, { t: 'grenade', id: j.id, x: x1, z: z1 });
    return { ok: true };
  }

  function explosion(jeu, x, z, r, degats, de, petite) {
    for (const zb of jeu.zombies) {
      if (zb.vie <= 0) continue;
      const d = Math.hypot(zb.x - x, zb.z - z); if (d > r + zb.rayon) continue;
      const k = 1 - Math.min(1, d / (r + zb.rayon)) * 0.6, n = d > 1e-3 ? 1 / d : 0;
      blesserZombie(jeu, zb, degats * k, (zb.x - x) * n * 1.5, (zb.z - z) * n * 1.5, de, false, true);
    }
    if (!petite) for (const d of jeu.defenses) if (d.type === 'baril' && d.vie > 0 && Math.hypot(d.x - x, d.z - z) < r + 0.4) { d.vie = 0; d.de = de; }
    ev(jeu, { t: 'boum', x, z, r, petite: !!petite });
  }

  // le kamikaze : il souffle tout autour de lui (les zombies aussi, et les autres kamikazes : ça peut s'enchaîner)
  function detoner(jeu, zb, de) {
    const K = D.ZOMBIES.kamikaze.kamikaze;
    for (const j of jeu.joueurs) { if (!j.vivant) continue; const d = Math.hypot(j.x - zb.x, j.z - zb.z); if (d < K.souffle + j.rayon) blesserJoueur(jeu, j, K.degats * (1 - Math.min(1, d / (K.souffle + j.rayon)) * 0.5)); }
    for (const d of jeu.defenses) if (d.type !== 'mine' && Math.hypot(d.x - zb.x, d.z - zb.z) < K.souffle + 0.5) { d.vie -= K.degats * 1.5; d.flash = 0.15; }
    explosion(jeu, zb.x, zb.z, K.souffle, K.degats * 1.2, de || 'kamikaze');
  }
  // le duel : trois coureurs qui sortent de terre près de l'adversaire
  function envoyer(jeu, de) {
    const vers = jeu.joueurs.find((k) => k.id !== de.id && k.vivant); if (!vers) return;
    for (let k = 0; k < 3; k++) {
      const a = jeu.rnd() * TAU, p = jeu.monde.libreProche(vers.x + Math.cos(a) * 6.5, vers.z + Math.sin(a) * 6.5, 0.4, 3); if (!p) continue;
      const Z = D.ZOMBIES.coureur, vie = Math.round(Z.vie * D.VAGUES.vie(Math.max(1, jeu.vague)));
      jeu.zombies.push({ id: nouvelId(jeu), type: 'coureur', x: p[0], z: p[1], vie, vieMax: vie, vitesse: Z.vitesse * D.VAGUES.vitesse(Math.max(1, jeu.vague)), rayon: Z.rayon, angle: 0, chemin: null, ci: 0, repense: 0, coinceT: 0, coince: 0, cx: p[0], cz: p[1], coup: 0.5, crache: 1, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: jeu.t, envoye: true });
    }
    ev(jeu, { t: 'envoi', de: de.id, vers: vers.id });
  }
  // ─── l'Ascension : les chutes (foudre, météores), l'objectif de l'échelon ───
  // les rivières de lave (le Volcan) : elles brûlent qui s'y tient
  const dansLave = (A, x, z, r) => !!A.laves && A.laves.some(([lx, lz, w, d]) => Math.abs(x - lx) < w / 2 + r * 0.3 && Math.abs(z - lz) < d / 2 + r * 0.3);
  function majLave(jeu, dt) {
    const A = jeu.A; if (!A.laves) return;
    jeu.laveT = (jeu.laveT || 0) - dt; if (jeu.laveT > 0) return; jeu.laveT = 0.25;
    for (const j of jeu.joueurs) if (j.vivant && dansLave(A, j.x, j.z, j.rayon)) { blesserJoueur(jeu, j, 6, true); ev(jeu, { t: 'brule', id: j.id, x: j.x, z: j.z }); }
    for (const zb of jeu.zombies) if (zb.vie > 0 && dansLave(A, zb.x, zb.z, zb.rayon) && jeu.t - zb.naissance > SORTIE) { zb.feu = Math.max(zb.feu || 0, 1); zb.feuDps = Math.max(zb.feuDps || 0, 22); zb.feuDe = 'lave'; }
  }
  function majChutes(jeu, dt) {
    const M = D.ASCENSION.meteos[jeu.meteo], C = M && M.chute;
    if (C && jeu.phase === 'vague') {
      jeu.chuteT = (jeu.chuteT == null ? 1.5 : jeu.chuteT) - dt * C.cadence * (1 + Math.min(1, jeu.vaguesFinies * 0.15));
      if (jeu.chuteT <= 0) {
        jeu.chuteT = 1;
        const l = jeu.joueurs.filter((j) => j.vivant), j = l[Math.floor(jeu.rnd() * l.length) % Math.max(1, l.length)];
        if (j) { const a = jeu.rnd() * TAU, r = jeu.rnd() * 5.5, x = j.x + Math.cos(a) * r, z = j.z + Math.sin(a) * r; jeu.chutes.push({ x, z, t: 0, delai: C.delai, r: C.souffle }); ev(jeu, { t: 'alerte', x, z, r: C.souffle, delai: C.delai, meteo: jeu.meteo }); }
      }
    }
    for (let i = jeu.chutes.length - 1; i >= 0; i--) {
      const c = jeu.chutes[i]; c.t += dt; if (c.t < c.delai) continue;
      jeu.chutes.splice(i, 1);
      for (const j of jeu.joueurs) if (j.vivant && Math.hypot(j.x - c.x, j.z - c.z) < c.r + j.rayon) blesserJoueur(jeu, j, C ? C.degats : 20);
      for (const d of jeu.defenses) if (d.type !== 'mine' && Math.hypot(d.x - c.x, d.z - c.z) < c.r) { d.vie -= 40; d.flash = 0.15; }
      explosion(jeu, c.x, c.z, c.r, (C ? C.degats : 20) * 3, 'ciel');
      ev(jeu, { t: 'impact', x: c.x, z: c.z, meteo: jeu.meteo });
    }
  }
  function finir(jeu, gagne, raison) { if (jeu.fini) return; jeu.fini = true; jeu.phase = 'fin'; jeu.gagne = gagne; jeu.raison = raison || ''; ev(jeu, { t: gagne ? 'victoire' : 'echec', raison: raison || '' }); }
  function majObjectif(jeu, dt) {
    const O = jeu.objectif; if (!O || jeu.fini) return;
    if (jeu.vague > 0 && jeu.vaguesFinies < 999) jeu.tempsVague += jeu.phase === 'vague' || jeu.vaguesFinies > 0 ? dt : 0;
    if (O.type === 'vagues') { O.fait = jeu.vaguesFinies; if (O.fait >= O.n) finir(jeu, true); }
    else if (O.type === 'tues') { O.fait = jeu.stats.tues; if (O.fait >= O.n) finir(jeu, true); }
    else if (O.type === 'chrono') { O.fait = Math.floor(jeu.tempsVague); if (jeu.tempsVague >= O.s) finir(jeu, true); }
    else if (O.type === 'contrat') {
      if (!O.lance) return;
      O.reste = Math.max(0, O.s - jeu.tempsVague);
      if (!jeu.zombies.some((z) => z.id === O.id && z.vie > 0)) finir(jeu, true);
      else if (O.reste <= 0) finir(jeu, false, 'contrat');
    } else if (O.type === 'generateur') {
      O.fait = jeu.vaguesFinies; const g = jeu.defenses.find((d) => d.type === 'generateur'); O.vie = g ? g.vie / g.vieMax : 0;
      if (!g) finir(jeu, false, 'generateur'); else if (O.fait >= O.n) finir(jeu, true);
    }
  }
  // un échelon de l'Ascension, tiré de son numéro : le même pour tout le monde
  function echelon(n) {
    n = Math.max(1, n | 0);
    let h = 0x811c9dc5; const t = 'ascension:' + n; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const r = mulberry32(h), choisir = (l) => l[Math.floor(r() * l.length) % l.length], AS = D.ASCENSION;
    const arene = D.ORDRE_ARENES[(n - 1) % D.ORDRE_ARENES.length === 0 && n <= 3 ? 0 : Math.floor(r() * D.ORDRE_ARENES.length) % D.ORDRE_ARENES.length];
    const regles = AS.regles.filter((x) => (x.depuis || 1) <= n), poidsR = regles.map((x) => x.poids || 1); let tir = r() * poidsR.reduce((a, b) => a + b, 0), regle = regles[0];
    for (let i = 0; i < regles.length; i++) { tir -= poidsR[i]; if (tir <= 0) { regle = regles[i]; break; } }
    if (n === 1) regle = AS.regles[0];
    const meteo = regle.meteo || (n < 3 ? 'clair' : choisir(['clair', 'clair', 'crepuscule', 'nuit', 'brouillard', 'orage', 'meteores']));
    const vagueDepart = Math.min(30, 1 + Math.floor(n / 3));
    const types = Object.keys(D.ZOMBIES).filter((k) => !D.ZOMBIES[k].boss && k !== 'trainard' && D.ZOMBIES[k].depuis <= vagueDepart + 1 + Math.floor(n / 4));
    const vedettes = []; if (regle.vedette) vedettes.push(regle.vedette); while (vedettes.length < 2 && types.length) { const k = choisir(types); if (!vedettes.includes(k)) vedettes.push(k); else if (types.length < 2) break; }
    let objectif;
    if (n % 5 === 0) { const c = choisir(['costaud', 'geolier', 'sabreur', 'invocateur'].filter((k) => k === 'costaud' || n >= 10)); objectif = { type: 'contrat', cible: c, vie: 6 + n * 0.25, s: 75 + Math.min(45, n) }; }
    else { const ty = choisir(n >= 4 ? ['vagues', 'tues', 'chrono', 'generateur'] : ['vagues', 'tues', 'chrono']); objectif = ty === 'vagues' ? { type: 'vagues', n: Math.min(5, 2 + Math.floor(n / 7)) } : ty === 'tues' ? { type: 'tues', n: 25 + n * 4 } : ty === 'chrono' ? { type: 'chrono', s: Math.min(150, 55 + n * 3) } : { type: 'generateur', n: Math.min(4, 2 + Math.floor(n / 9)) }; }
    const mod = {}; for (const k of ['zVie', 'zVitesse', 'nombre', 'ferraille', 'points', 'unPV', 'sansAtelier', 'armeRare']) if (regle[k] != null) mod[k] = regle[k];
    mod.zVie = (mod.zVie || 1) * (1 + Math.max(0, n - 1) * 0.025);
    return { n, graine: h || 1, arene, meteo, regle: regle.id, regleNom: regle.nom, regleTexte: regle.texte, objectif, vedettes, vagueDepart, mod };
  }
  // la phrase de l'objectif (l'écran de l'Ascension, le HUD)
  function texteObjectif(O) {
    if (!O) return '';
    if (O.type === 'vagues') return `Survis à ${O.n} vague${O.n > 1 ? 's' : ''}`;
    if (O.type === 'tues') return `Abats ${O.n} zombies`;
    if (O.type === 'chrono') return `Tiens ${O.s} secondes`;
    if (O.type === 'contrat') { const nom = D.ZOMBIES[O.cible].nom; return `Contrat : abats ${/^[AEIOUÉ]/.test(nom) ? 'l’' : 'le '}${nom} d’élite en moins de ${O.s} s`; }
    if (O.type === 'generateur') return `Protège le générateur pendant ${O.n} vague${O.n > 1 ? 's' : ''}`;
    return '';
  }
  // ─── un pas de simulation ───
  function pas(jeu, entrees, dt) {
    dt = dt || 1 / 60; jeu.evs.length = 0;
    if (jeu.fini) return jeu.evs;
    if (jeu.choix) return jeu.evs; // un niveau passé : la partie attend le choix d'un atout
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
          const type = jeu.bossAVenir && jeu.aSortir <= Math.ceil(jeu.totalVague * 0.6) ? jeu.bossAVenir : tirerType(jeu);
          if (!fairesortir(jeu, type)) break;
          if (D.ZOMBIES[type].boss) jeu.bossAVenir = null;
          jeu.sortieT -= 1; jeu.aSortir--; vivants++;
        }
        if (jeu.sortieT > 3) jeu.sortieT = 3;
      } else if (!jeu.zombies.length) {
        const prime = V.prime(jeu.vague);
        for (const j of jeu.joueurs) if (j.vivant) j.score += prime;
        jeu.phase = 'pause'; jeu.chrono = V.pause;
        ev(jeu, { t: 'vagueFinie', n: jeu.vague, prime }); jeu.vaguesFinies++;
      }
    }
    for (const j of jeu.joueurs) { majJoueur(jeu, j, entrees[j.id] || null, dt); if (j.emote && (j.emote.t -= dt) <= 0) j.emote = null; if (j.emoteCd > 0) j.emoteCd -= dt; }
    if (jeu.joueurs.length > 1 && !jeu.mode) relever(jeu, dt);
    majZombies(jeu, dt);
    majDefenses(jeu, dt);
    majProjectiles(jeu, dt);
    majObjets(jeu, dt);
    majEffets(jeu, dt);
    majLargage(jeu, dt);
    majPieges(jeu, dt);
    majChutes(jeu, dt);
    majLave(jeu, dt);
    majObjectif(jeu, dt);
    if (jeu.fini) return jeu.evs;
    // chacun pour soi, duel : le dernier debout gagne (personne debout : le meilleur score)
    if (jeu.mode && jeu.joueurs.length > 1) {
      const debout = jeu.joueurs.filter((j) => j.vivant && !j.parti);
      if (debout.length <= 1) {
        const g = debout[0] || jeu.joueurs.slice().sort((a, b) => b.score - a.score)[0];
        jeu.gagnant = g.id; jeu.fini = true; jeu.phase = 'fin'; ev(jeu, { t: 'gagnant', id: g.id });
        ev(jeu, { t: 'fin', score: g.score, vague: jeu.vague, tues: jeu.stats.tues });
        return jeu.evs;
      }
    }
    // fin : plus aucun survivant debout
    if (!jeu.joueurs.some((j) => j.vivant)) {
      jeu.fini = true; jeu.phase = 'fin'; if (jeu.objectif) jeu.gagne = false;
      const score = jeu.joueurs.reduce((s, j) => s + j.score, 0);
      ev(jeu, { t: 'fin', score, vague: jeu.vague, tues: jeu.stats.tues });
    }
    return jeu.evs;
  }

  // à plusieurs : un survivant à terre se relève si un copain reste près de lui (RELEVE s) ; il repart avec 40 % de sa vie
  const RELEVE = 2.5, PRES = 1.7;
  function relever(jeu, dt) {
    for (const j of jeu.joueurs) {
      if (j.vivant || j.parti) continue;
      const aide = jeu.joueurs.find((k) => k.vivant && Math.hypot(k.x - j.x, k.z - j.z) < PRES);
      j.releve = aide ? j.releve + dt : Math.max(0, j.releve - dt * 0.5);
      if (j.releve >= RELEVE) { j.vivant = true; j.releve = 0; j.vie = Math.round(j.vieMax * 0.4); j.invul = 2; ev(jeu, { t: 'releve', id: j.id, par: aide.id }); }
    }
  }
  function majJoueur(jeu, j, e, dt) {
    if (!j.vivant) return;
    if (j.invul > 0) j.invul -= dt;
    if (j.rouleCd > 0) j.rouleCd = Math.max(0, j.rouleCd - dt);
    // tiré par la chaîne d'un geôlier : il glisse vers lui (ses pas ne comptent plus le temps du tirage)
    if (j.tire) {
      const g = jeu.zombies.find((z) => z.id === j.tire.de && z.vie > 0); j.tire.t -= dt;
      if (!g || j.tire.t <= 0) j.tire = null;
      else { const ex = g.x - j.x, ez = g.z - j.z, d = Math.hypot(ex, ez); if (d > g.rayon + j.rayon + 0.3) { j.x += ex / d * 10 * dt; j.z += ez / d * 10 * dt; } else j.tire = null; }
    }
    // le déplacement
    const roule = j.roule > 0; // (en pleine roulade : le pouce ne compte plus, il file dans sa direction)
    let mx = e && !j.tire && !roule ? +e.mx || 0 : 0, mz = e && !j.tire && !roule ? +e.mz || 0 : 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    if (j.gele > 0) j.gele = Math.max(0, j.gele - dt);
    const v = D.JOUEUR.vitesse * (1 + rang(j, 'vitesse') * D.ATOUTS.vitesse.par) * (j.gele > 0 ? D.ZOMBIES.golemglace.attaque.ralenti : 1);
    if (j.grenadeT > 0) j.grenadeT = Math.max(0, j.grenadeT - dt);
    if (rang(j, 'regen') && j.vie < j.vieMax) { j.regenR += rang(j, 'regen') * D.ATOUTS.regen.par * dt; if (j.regenR >= 1) { const g = Math.floor(j.regenR); j.regenR -= g; j.vie = Math.min(j.vieMax, j.vie + g); } }
    j.vx = mx * v; j.vz = mz * v; j.x += j.vx * dt; j.z += j.vz * dt;
    j.bouge = l > 0.05 ? Math.min(1, l) : 0;
    if (roule) { const R = D.ROULADE, k = Math.min(dt, j.roule) * R.distance / R.duree; j.x += j.rdx * k; j.z += j.rdz * k; j.roule -= dt; j.bouge = 1; if (j.roule <= 0) j.roule = 0; }
    // en ligne, le client prédit son déplacement et envoie sa position : l'hôte l'adopte si elle est à moins de 2,5 m de la sienne
    if (e && !j.tire && !roule && typeof e.x === 'number' && typeof e.z === 'number' && Number.isFinite(e.x) && Number.isFinite(e.z) && Math.hypot(e.x - j.x, e.z - j.z) < 2.5) { j.x = e.x; j.z = e.z; }
    // les défenses sont dures pour lui aussi (sauf les mines)
    for (const d of jeu.defenses) { if (d.type === 'mine') continue; pousserCercle(j, d.x, d.z, D.DEFENSES[d.type].rayon); }
    jeu.monde.pousser(j);
    // la cible : le zombie le plus proche à portée et en vue (relue tous les 0,1 s)
    const base = armeDe(j), arme = remplir(_armeJ, base, { portee: base.portee * (1 + rang(j, 'portee') * D.ATOUTS.portee.par), perce: base.perce + rang(j, 'perce') });
    j.cible -= dt;
    if (j.cible <= 0) {
      j.cible = 0.1; j.viseId = 0; const max2 = Math.max(arme.portee, D.ARMES[D.ARME_DE_BASE].portee) ** 2; let best = max2; // (au-delà de la portée de l'arme en main : le pistolet d'appoint)
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0 || zb.terre) continue;
        const r2 = (zb.x - j.x) ** 2 + (zb.z - j.z) ** 2; if (r2 >= max2) continue;
        const d2 = r2 * (zb.elite ? 0.3 : 1); if (d2 >= best) continue; // (l'élite d'un contrat d'abord)
        if (!jeu.monde.vue(j.x, j.z, zb.x, zb.z)) continue;
        best = d2; j.viseId = zb.id;
      }
    }
    const cible = j.viseId ? jeu.zombies.find((zb) => zb.id === j.viseId && zb.vie > 0) : null;
    const voulu = cible ? Math.atan2(cible.z - j.z, cible.x - j.x) : (l > 0.05 ? Math.atan2(mz, mx) : j.angle);
    j.angle = angleVers(j.angle, voulu, 14 * dt);
    j.visee = cible ? 1 : 0;
    // le tir automatique (le minigun monte en cadence tant qu'il tire ; le fusil à rafales tire ses balles d'affilée) ; une cible hors de
    // portée de l'arme en main (lance-flammes, fusil à pompe…) : le pistolet d'appoint, sans dépenser de munitions
    if (j.attente > 0) j.attente -= dt;
    if (cible && j.main !== 0 && Math.hypot(cible.x - j.x, cible.z - j.z) > arme.portee + cible.rayon) {
      j.salve = 0; j.chauffe = Math.max(0, j.chauffe - dt * 2);
      const P = remplir(_armeA, D.ARMES[D.ARME_DE_BASE], { perce: D.ARMES[D.ARME_DE_BASE].perce + rang(j, 'perce') });
      if (j.attente <= 0 && ecartAngle(j.angle, voulu) < 0.35) { j.attente += 1 / (P.cadence * multCadence(j)); if (j.attente < 0) j.attente = 0; tirer(jeu, j, P, cible, D.ARME_DE_BASE); }
      return;
    }
    j.chauffe = arme.montee && cible ? Math.min(arme.montee, j.chauffe + dt) : Math.max(0, j.chauffe - dt * 2);
    const cad = arme.cadence * multCadence(j) * (arme.montee ? 0.25 + 0.75 * j.chauffe / arme.montee : 1);
    const unTir = () => {
      const s = j.armes[j.main];
      tirer(jeu, j, arme, cible, s ? s.id : D.ARME_DE_BASE);
      if (s && s.mun !== Infinity) { s.mun--; if (s.mun <= 0) { j.armes[j.main] = null; j.main = 0; j.salve = 0; ev(jeu, { t: 'vide', id: j.id }); } }
    };
    if (j.salve > 0) { j.salveT -= dt; if (j.salveT <= 0) { j.salve--; j.salveT = 0.075; if (cible) unTir(); } }
    else if (cible && j.attente <= 0 && ecartAngle(j.angle, voulu) < 0.35) {
      j.attente += 1 / cad; if (j.attente < 0) j.attente = 0;
      if (arme.salve > 1) { j.salve = arme.salve - 1; j.salveT = 0.075; }
      unTir();
    }
  }
  const _armeTir = {}, _armeJ = {}, _armeA = {};
  // (des objets réutilisés à chaque tir : vidés d'abord, pour qu'une arme ne garde rien de la précédente)
  function remplir(o, ...l) { for (const k in o) delete o[k]; return Object.assign(o, ...l); }
  function pousserCercle(c, x, z, R) {
    const ex = c.x - x, ez = c.z - z, d2 = ex * ex + ez * ez, m = R + c.rayon; if (d2 >= m * m) return false;
    const d = Math.sqrt(d2) || 1e-6, k = (m - d) / d; c.x += (d2 > 1e-12 ? ex : 1) * k; c.z += (d2 > 1e-12 ? ez : 0) * k; return true;
  }
  function blesserJoueur(jeu, j, deg, continu) {
    if (j.roule > 0) return; // (en pleine roulade : rien ne le touche)
    if (!j.vivant || (j.invul > 0 && !continu) || (continu && j.invul > D.JOUEUR.invulnerable)) return; // (relevé : vraiment invulnérable)
    if (j.effets && j.effets.bouclier > 0) { if (!continu) ev(jeu, { t: 'pare', id: j.id, x: j.x, z: j.z }); return; } // (le bouclier : rien ne passe)
    j.vie -= deg; if (!continu) j.invul = D.JOUEUR.invulnerable;
    ev(jeu, { t: 'blesse', id: j.id, degats: Math.round(deg) });
    if (j.vie <= 0) { j.vie = 0; j.vivant = false; j.releve = 0; j.choix = null; ev(jeu, { t: 'tombe', id: j.id }); majChoixGlobal(jeu); }
  }

  function majZombies(jeu, dt) {
    const Zs = jeu.zombies, monde = jeu.monde, vivants = jeu.joueurs.filter((j) => j.vivant);
    const epouvantails = jeu.defenses.filter((d) => D.DEFENSES[d.type].attire); // (l'épouvantail, le poste radio)
    if (jeu.pontes && jeu.pontes.length) { for (const [x, z, n] of jeu.pontes) pondre(jeu, x, z, n); jeu.pontes.length = 0; } // (la couvée d'une pondeuse morte)
    const H = D.ZOMBIES.hurleur.hurle;
    for (let i = 0; i < Zs.length; i++) {
      const zb = Zs[i]; if (zb.vie <= 0) continue;
      const Z = D.ZOMBIES[zb.type];
      if (zb.flash > 0) zb.flash -= dt;
      if (jeu.t - zb.naissance < SORTIE) { zb.bouge = 0; continue; } // il sort de terre : ni pas ni coup
      // il brûle (un peu toutes les 0,33 s), il est gelé (il avance moins vite)
      if (zb.feu > 0) { zb.feu -= dt; zb.feuT = (zb.feuT || 0) - dt; if (zb.feuT <= 0) { zb.feuT = 0.33; blesserZombie(jeu, zb, zb.feuDps * 0.33, 0, 0, zb.feuDe, false, false, true); if (zb.vie <= 0) continue; } }
      if (zb.poison > 0) { zb.poison -= dt; zb.poisonT = (zb.poisonT || 0) - dt; if (zb.poisonT <= 0) { zb.poisonT = 0.5; blesserZombie(jeu, zb, zb.poisonDps * 0.5, 0, 0, zb.poisonDe, false, false, true); if (zb.vie <= 0) continue; } } // (les toxines rongent)
      if (zb.etourdi > 0) { // étourdi (le canon sonique) : il ne fait rien, il glisse seulement sous le coup
        zb.etourdi -= dt; zb.bouge = 0; zb.x += zb.rx * dt; zb.z += zb.rz * dt; const am = Math.exp(-6 * dt); zb.rx *= am; zb.rz *= am; zb.coinceT = 0; continue;
      }
      if (zb.excite > 0) zb.excite -= dt; // (le hurlement d'un hurleur : plus vite, plus fort)
      const lent = (zb.gel > 0 ? (zb.gel -= dt, D.ARMES.cryo.gel.ralenti) : 1) * (jeu.ralenti > 0 ? D.BONUS.ralenti.facteur : 1) * (zb.excite > 0 ? H.vitesse : 1);
      // la proie : le survivant le plus proche, ou un épouvantail tout près
      let cx = 0, cz = 0, proie = null, best = Infinity;
      for (const j of vivants) { const d = (j.x - zb.x) ** 2 + (j.z - zb.z) ** 2; if (d < best) { best = d; proie = j; } }
      for (const d of epouvantails) { const r = D.DEFENSES[d.type].attire, dd = (d.x - zb.x) ** 2 + (d.z - zb.z) ** 2; if (dd < r * r && dd < best * (d.type === 'radio' ? 4 : 1.6)) { best = dd; proie = d; } }
      for (const L of jeu.leurres || []) { const r = D.BONUS.leurre.attire, dd = (L.x - zb.x) ** 2 + (L.z - zb.z) ** 2; if (dd < r * r && dd < best * 4) { best = dd; proie = L; } } // (le leurre : il les attire de loin)
      if (!proie) { zb.bouge = 0; continue; }
      cx = proie.x; cz = proie.z;
      const dist = Math.sqrt(best);
      // le boss : ses phases, son cri, son attaque spéciale (il ne fait rien d'autre pendant ce temps)
      if (Z.boss && majBossZ(jeu, zb, Z, vivants, proie, dist, dt)) continue;
      // le fouisseur sous terre : il file droit vers sa proie, puis surgit
      if (Z.terre && fouir(jeu, zb, Z, proie, dist, vivants, dt, lent)) continue;
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
      const contact = dist < zb.rayon + (proie.rayon || D.DEFENSES[proie.type].rayon) + 0.25;
      // ─── les talents ───
      const estJ = proie.vivant !== undefined;
      if (Z.kamikaze && dist < zb.rayon + (proie.rayon || D.DEFENSES[proie.type].rayon) + 0.45) { zb.vie = 0; zb.dernier = { px: 0, pz: 0, fort: true }; ev(jeu, { t: 'detone', id: zb.id, x: zb.x, z: zb.z }); detoner(jeu, zb, 'kamikaze'); continue; }
      if (Z.saut) {
        if (zb.saut > 0) { // en l'air : il file vers son point de chute, par-dessus tout
          zb.saut -= dt; const k = 1 - Math.max(0, zb.saut) / Z.saut.duree;
          zb.x = zb.sx + (zb.tx2 - zb.sx) * k; zb.z = zb.sz + (zb.tz2 - zb.sz) * k; zb.bouge = 1;
          if (zb.saut <= 0) { zb.saut = 0; ev(jeu, { t: 'atterrit', id: zb.id, x: zb.x, z: zb.z }); for (const j of vivants) if (Math.hypot(j.x - zb.x, j.z - zb.z) < 1.3) blesserJoueur(jeu, j, Z.saut.degats); }
          continue;
        }
        zb.sautT = (zb.sautT == null ? 0.4 + jeu.rnd() : zb.sautT) - dt;
        if (zb.sautT <= 0 && estJ && dist > 2.6 && dist < Z.saut.portee) {
          const p = monde.libreProche(cx - (cx - zb.x) / dist * 0.9, cz - (cz - zb.z) / dist * 0.9, zb.rayon, 3);
          if (p) { zb.saut = Z.saut.duree; zb.sx = zb.x; zb.sz = zb.z; zb.tx2 = p[0]; zb.tz2 = p[1]; zb.sautT = Z.saut.recharge; zb.chemin = null; ev(jeu, { t: 'saute', id: zb.id, x: zb.x, z: zb.z }); continue; }
          zb.sautT = 0.6;
        }
      }
      if (Z.flamme && estJ && dist < Z.flamme.portee && monde.vue(zb.x, zb.z, cx, cz)) {
        avance = dist > Z.flamme.portee * 0.55;
        zb.flammeT = (zb.flammeT || 0) - dt;
        if (zb.flammeT <= 0) {
          zb.flammeT = 0.2; const a = Math.atan2(cz - zb.z, cx - zb.x); zb.attaque = 0.3;
          ev(jeu, { t: 'souffle', id: zb.id, x: zb.x, z: zb.z, a });
          for (const j of vivants) { const d = Math.hypot(j.x - zb.x, j.z - zb.z); if (d < Z.flamme.portee + j.rayon && ecartAngle(a, Math.atan2(j.z - zb.z, j.x - zb.x)) < Z.flamme.cone) blesserJoueur(jeu, j, Z.flamme.dps * 0.2, true); }
          for (const d of jeu.defenses) if (d.type !== 'mine' && Math.hypot(d.x - zb.x, d.z - zb.z) < Z.flamme.portee && ecartAngle(a, Math.atan2(d.z - zb.z, d.x - zb.x)) < Z.flamme.cone) { d.vie -= Z.flamme.dps * 0.2; d.flash = 0.1; }
        }
      }
      if (Z.crochet && estJ) {
        zb.crochetT = (zb.crochetT == null ? 2 + jeu.rnd() * 2 : zb.crochetT) - dt;
        if (zb.crochetT <= 0 && dist > 3.2 && dist < Z.crochet.portee && monde.vue(zb.x, zb.z, cx, cz) && !jeu.crochets.some((c) => c.de === zb.id)) {
          zb.crochetT = Z.crochet.recharge; const a = Math.atan2(cz - zb.z, cx - zb.x); zb.attaque = 0.3;
          jeu.crochets.push({ id: nouvelId(jeu), de: zb.id, x: zb.x, z: zb.z, vx: Math.cos(a) * Z.crochet.vitesse, vz: Math.sin(a) * Z.crochet.vitesse, vie: Z.crochet.portee / Z.crochet.vitesse * 1.15 });
          ev(jeu, { t: 'crochet', id: zb.id, x: zb.x, z: zb.z });
        }
      }
      if (Z.invoque) {
        if (estJ) avance = avance && dist > Z.invoque.distance;
        zb.invoqueT = (zb.invoqueT == null ? 2 + jeu.rnd() * 2 : zb.invoqueT) - dt;
        if (zb.invoqueT <= 0) {
          zb.invoqueT = 1.5;
          const proches = jeu.morts.filter((m) => jeu.t - m.t < 25 && Math.hypot(m.x - zb.x, m.z - zb.z) < Z.invoque.portee).slice(-Z.invoque.nombre);
          if (proches.length && jeu.zombies.length < 64) {
            zb.invoqueT = Z.invoque.recharge; zb.attaque = 0.3; const pts = [];
            for (const m of proches) { jeu.morts.splice(jeu.morts.indexOf(m), 1); const p = monde.libreProche(m.x, m.z, 0.42, 2); if (!p) continue; const vie = Math.round(D.ZOMBIES.trainard.vie * D.VAGUES.vie(jeu.vague) * 0.7); jeu.zombies.push({ id: nouvelId(jeu), type: 'trainard', x: p[0], z: p[1], vie, vieMax: vie, vitesse: D.ZOMBIES.trainard.vitesse * D.VAGUES.vitesse(jeu.vague) * jeu.mod.zVitesse, rayon: 0.42, angle: 0, chemin: null, ci: 0, repense: 0.2, coinceT: 0, coince: 0, cx: p[0], cz: p[1], coup: 0.5, crache: 1, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: jeu.t, releve: true }); pts.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]); }
            ev(jeu, { t: 'invoque', id: zb.id, x: zb.x, z: zb.z, pts });
          }
        }
      }
      if (Z.ponte) {
        zb.ponteT = (zb.ponteT == null ? 2 + jeu.rndB() * 2 : zb.ponteT) - dt;
        if (zb.ponteT <= 0) { zb.ponteT = Z.ponte.recharge; if (jeu.zombies.length < 56) { zb.attaque = 0.3; pondre(jeu, zb.x - Math.cos(zb.angle) * 0.7, zb.z - Math.sin(zb.angle) * 0.7, Z.ponte.nombre); } }
      }
      if (Z.hurle) {
        if (estJ) avance = avance && dist > Z.hurle.distance; // (il reste en retrait, derrière les autres)
        zb.hurleT = (zb.hurleT == null ? 1.5 + jeu.rndB() * 2 : zb.hurleT) - dt;
        if (zb.hurleT <= 0) {
          zb.hurleT = Z.hurle.recharge; zb.attaque = 0.4; const R2 = Z.hurle.rayon * Z.hurle.rayon; let n = 0;
          for (const o of Zs) if (o.vie > 0 && !D.ZOMBIES[o.type].boss && (o.x - zb.x) ** 2 + (o.z - zb.z) ** 2 < R2) { o.excite = Z.hurle.duree; n++; }
          ev(jeu, { t: 'hurle', id: zb.id, x: zb.x, z: zb.z, r: Z.hurle.rayon, n });
        }
      }
      let vx = 0, vz = 0;
      if (avance && !contact) { vx = dx / l * zb.vitesse * lent; vz = dz / l * zb.vitesse * lent; }
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
        const deg = Z.degats * (zb.excite > 0 ? H.degats : 1);
        if (frappe.vivant !== undefined) { blesserJoueur(jeu, frappe, deg); if (Z.boss && zb.phase >= 3 && Z.attaque && Z.attaque.draine) zb.vie = Math.min(zb.vieMax, zb.vie + zb.vieMax * Z.attaque.draine * 0.5); }
        else { frappe.vie -= deg; frappe.flash = 0.15; }
      }
    }
    // ils se poussent entre eux, et poussent un peu les survivants
    for (let i = 0; i < Zs.length; i++) {
      const a = Zs[i]; if (a.vie <= 0 || a.saut > 0 || a.terre) continue;
      for (let k = i + 1; k < Zs.length; k++) {
        const b = Zs[k]; if (b.vie <= 0 || b.saut > 0 || b.terre) continue;
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

  // ─── le fouisseur : dehors, il marche (et replonge s'il est loin de sa proie) ; sous terre, il file droit (sous les murs) et surgit
  // sous ses pieds : un souffle de terre qui blesse autour. Renvoie vrai s'il est sous terre (rien d'autre à faire ce pas-ci).
  function fouir(jeu, zb, Z, proie, dist, vivants, dt, lent) {
    const T = Z.terre, estJ = proie.vivant !== undefined;
    if (!zb.terre) {
      zb.dehors = (zb.dehors || 0) - dt;
      if (zb.dehors <= 0 && estJ && dist > T.surface + 3) { zb.terre = true; zb.terreT = T.duree; zb.chemin = null; zb.rx = zb.rz = 0; ev(jeu, { t: 'terre', id: zb.id, x: zb.x, z: zb.z }); return true; }
      return false;
    }
    zb.terreT -= dt; zb.bouge = 1; zb.attaque = 0; zb.coinceT = 0; zb.cx = zb.x; zb.cz = zb.z;
    const ex = proie.x - zb.x, ez = proie.z - zb.z, d = Math.hypot(ex, ez) || 1, v = T.vitesse * lent, demi = jeu.A.taille / 2 - 1;
    zb.angle = Math.atan2(ez, ex);
    if (d > T.surface * 0.5) { zb.x += ex / d * Math.min(v * dt, d); zb.z += ez / d * Math.min(v * dt, d); }
    zb.x = Math.max(-demi, Math.min(demi, zb.x)); zb.z = Math.max(-demi, Math.min(demi, zb.z));
    if (dist < T.surface || zb.terreT <= 0) {
      const p = jeu.monde.libreProche(zb.x, zb.z, zb.rayon, 3); if (!p) return true; // (sous un mur : il continue)
      zb.x = p[0]; zb.z = p[1]; zb.cx = p[0]; zb.cz = p[1]; zb.terre = false; zb.dehors = T.dehors; zb.coup = 0.35; zb.attaque = 0.3;
      for (const j of vivants) if (Math.hypot(j.x - zb.x, j.z - zb.z) < T.souffle + j.rayon) blesserJoueur(jeu, j, T.degats);
      ev(jeu, { t: 'surgit', id: zb.id, x: zb.x, z: zb.z, r: T.souffle });
    }
    return true;
  }

  // ─── les boss à phases : à 2/3 puis 1/3 de sa vie, il rugit et passe à la phase suivante ; dès la 2, son attaque spéciale revient
  // toutes les « recharge » secondes (plus souvent à la 3, où il enrage). Une attaque s'annonce (un cercle au sol, « prepare ») avant de
  // frapper (« frappe ») : le temps de s'écarter. Renvoie vrai quand le boss est occupé (il crie, se prépare, bondit).
  function majBossZ(jeu, zb, Z, vivants, proie, dist, dt) {
    const P = D.PHASES, A = Z.attaque, f = zb.vie / zb.vieMax, cible = f <= P.seuils[1] ? 3 : f <= P.seuils[0] ? 2 : 1;
    zb.phase = zb.phase || 1;
    if (cible > zb.phase) {
      const saute = cible - zb.phase; zb.phase = cible; zb.cri = P.cri; zb.atk = null; zb.atkT = 0.8; zb.saut = 0; zb.attaque = 0;
      if (cible === 3) zb.vitesse *= P.rage.vitesse; else if (saute > 1) zb.vitesse *= P.rage.vitesse;
      for (const j of vivants) { const ex = j.x - zb.x, ez = j.z - zb.z, d = Math.hypot(ex, ez) || 1; if (d < P.repousse + zb.rayon) { j.x += ex / d * 1.8; j.z += ez / d * 1.8; jeu.monde.pousser(j); } }
      const pts = [];
      if (A && A.meute) for (let k = 0; k < P.meute[cible - 2]; k++) { const a = jeu.rndB() * TAU, m = rejeton(jeu, A.meute, zb.x + Math.cos(a) * 2.2, zb.z + Math.sin(a) * 2.2); if (m) pts.push([r2j(m.x), r2j(m.z)]); }
      ev(jeu, { t: 'phase', id: zb.id, type: zb.type, n: cible, x: zb.x, z: zb.z, pts });
    }
    if (zb.cri > 0) { zb.cri -= dt; zb.bouge = 0; return true; }
    if (!A || zb.phase < 2) return false;
    const a = zb.atk;
    if (a) {
      if (a.vol > 0) { // le bond du loup-garou : en l'air vers le point annoncé
        a.vol -= dt; zb.saut = Math.max(0.001, a.vol); const k = 1 - Math.max(0, a.vol) / A.duree;
        zb.x = a.sx + (a.x - a.sx) * k; zb.z = a.sz + (a.z - a.sz) * k; zb.bouge = 1;
        if (a.vol <= 0) { zb.saut = 0; frapperBoss(jeu, zb, A, a, vivants); }
        return true;
      }
      a.t -= dt; zb.bouge = 0; zb.attaque = Math.max(zb.attaque, 0.05);
      if (a.cible) { const j = trouverJoueur(jeu, a.cible); if (j) zb.angle = angleVers(zb.angle, Math.atan2(j.z - zb.z, j.x - zb.x), 6 * dt); }
      if (a.t > 0) return true;
      if (A.genre === 'bond') { a.vol = A.duree; a.sx = zb.x; a.sz = zb.z; zb.saut = A.duree; zb.chemin = null; ev(jeu, { t: 'saute', id: zb.id, x: zb.x, z: zb.z }); return true; }
      frapperBoss(jeu, zb, A, a, vivants);
      return true;
    }
    zb.atkT = (zb.atkT == null ? 1 : zb.atkT) - dt;
    if (zb.atkT > 0 || !proie || proie.vivant === undefined) return false;
    let x = zb.x, z = zb.z, r = A.rayon || 1.4;
    if (A.genre === 'onde' || A.genre === 'nova') { if (dist > r * 1.25) { zb.atkT = 0.3; return false; } }
    else if (A.genre === 'bond') {
      if (dist < 3 || dist > A.portee) { zb.atkT = 0.4; return false; }
      const p = jeu.monde.libreProche(proie.x, proie.z, zb.rayon, 3); if (!p) { zb.atkT = 0.4; return false; } x = p[0]; z = p[1];
    } else if (A.genre === 'eclipse') { if (dist < 2.5) { zb.atkT = 0.5; return false; } x = proie.x; z = proie.z; r = 1.3; }
    zb.atk = { t: A.prepare, x, z, cible: A.genre === 'eclipse' ? proie.id : null };
    ev(jeu, { t: 'prepare', id: zb.id, genre: A.genre, x: r2j(x), z: r2j(z), r, delai: A.prepare + (A.genre === 'bond' ? A.duree : 0) });
    return true;
  }
  function frapperBoss(jeu, zb, A, a, vivants) {
    zb.atk = null; zb.atkT = A.recharge * (zb.phase >= 3 ? D.PHASES.rage.recharge : 1); zb.attaque = 0.3; zb.coup = 0.6;
    if (A.genre === 'eclipse') { // le vampire disparaît et reparaît dans le dos de sa cible, et frappe aussitôt
      const j = trouverJoueur(jeu, a.cible); if (!j || !j.vivant) return;
      const x0 = zb.x, z0 = zb.z, p = jeu.monde.libreProche(j.x - Math.cos(j.angle) * A.derriere, j.z - Math.sin(j.angle) * A.derriere, zb.rayon, 3); if (!p) return;
      zb.x = p[0]; zb.z = p[1]; zb.cx = p[0]; zb.cz = p[1]; zb.chemin = null; zb.angle = Math.atan2(j.z - zb.z, j.x - zb.x);
      ev(jeu, { t: 'eclipse', id: zb.id, x0: r2j(x0), z0: r2j(z0), x: r2j(zb.x), z: r2j(zb.z) });
      if (Math.hypot(j.x - zb.x, j.z - zb.z) < A.derriere + 1.2) { blesserJoueur(jeu, j, A.degats); zb.vie = Math.min(zb.vieMax, zb.vie + zb.vieMax * A.draine); }
      return;
    }
    const x = A.genre === 'bond' ? zb.x : a.x, z = A.genre === 'bond' ? zb.z : a.z, R = A.rayon;
    for (const j of vivants) {
      const ex = j.x - x, ez = j.z - z, d = Math.hypot(ex, ez) || 1; if (d > R + j.rayon) continue;
      blesserJoueur(jeu, j, A.degats);
      if (A.gel) j.gele = A.gel;
      if (A.recul) { const k = Math.min(2.4, A.recul * 0.25); j.x += ex / d * k; j.z += ez / d * k; jeu.monde.pousser(j); }
    }
    if (A.genre === 'onde') for (const d of jeu.defenses) if (d.type !== 'generateur' && Math.hypot(d.x - x, d.z - z) < R) { d.vie -= A.degats; d.flash = 0.15; }
    ev(jeu, { t: 'frappe', id: zb.id, genre: A.genre, x: r2j(x), z: r2j(z), r: R });
  }

  // la roulade : la direction du pouce (sa dernière vitesse), sinon à l'opposé de la cible, sinon droit devant ; elle casse la chaîne d'un
  // geôlier. « muet » : sans événement (la prédiction d'un copain en ligne, chez lui)
  function roulade(jeu, idJ, muet) {
    const j = trouverJoueur(jeu, idJ); if (!j || !j.vivant || jeu.fini) return { ok: false };
    if (j.roule > 0 || j.rouleCd > 0) return { ok: false, raison: 'recharge' };
    let dx = j.vx || 0, dz = j.vz || 0, l = Math.hypot(dx, dz);
    if (l < 0.3) { const a = j.visee ? j.angle + Math.PI : j.angle; dx = Math.cos(a); dz = Math.sin(a); l = 1; }
    j.rdx = dx / l; j.rdz = dz / l; j.roule = D.ROULADE.duree; j.rouleCd = D.ROULADE.recharge; j.tire = null;
    if (!muet) { if (jeu.stats) jeu.stats.roulades = (jeu.stats.roulades || 0) + 1; ev(jeu, { t: 'roule', id: j.id, x: j.x, z: j.z, a: r2j(Math.atan2(j.rdz, j.rdx)) }); }
    return { ok: true };
  }

  function majDefenses(jeu, dt) {
    const km = multDefense(jeu), monde = jeu.monde;
    for (const d of jeu.defenses) {
      const T = D.DEFENSES[d.type]; if (d.flash > 0) d.flash -= dt;
      if (d.type === 'claymore') { // un zombie devant, assez près : elle souffle vers l'avant
        if (jeu.zombies.some((zb) => zb.vie > 0 && Math.hypot(zb.x - d.x, zb.z - d.z) < T.declenche && ecartAngle(d.angle, Math.atan2(zb.z - d.z, zb.x - d.x)) < T.cone)) d.vie = 0;
        continue;
      }
      if (d.type === 'radio') { d.t = (d.t || 0) + dt; if (d.t >= T.duree) d.vie = 0; continue; }
      if (d.type === 'tourelle' || d.type === 'mortier' || d.type === 'tourellefeu' || d.type === 'tourelletesla') {
        d.attente -= dt;
        let cible = null, best = T.portee * T.portee;
        if (d.type !== 'mortier') {
          for (const zb of jeu.zombies) { if (zb.vie <= 0 || zb.terre) continue; const d2 = (zb.x - d.x) ** 2 + (zb.z - d.z) ** 2; if (d2 < best && monde.vue(d.x, d.z, zb.x, zb.z)) { best = d2; cible = zb; } }
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
            const bx = d.x + Math.cos(d.angle) * 0.5, bz = d.z + Math.sin(d.angle) * 0.5;
            if (d.type === 'tourellefeu') souffler(jeu, 'def' + d.id, bx, bz, d.angle, remplir(_armeTir, { degats: T.degats, portee: T.portee, cone: T.cone, feu: T.feu, recul: 0.05, classe: 'flamme', cle: 'tourellefeu' }), km);
            else if (d.type === 'tourelletesla') eclair(jeu, 'def' + d.id, d.x, d.z, d.angle, remplir(_armeTir, { degats: T.degats, portee: T.portee + 1, rebonds: T.rebonds, saut: T.saut, classe: 'tesla', cle: 'tourelletesla' }), km, null, cible);
            else if (d.type === 'tourelle') rafale(jeu, 'def' + d.id, d.x + Math.cos(d.angle) * 0.5, d.z + Math.sin(d.angle) * 0.5, d.angle, remplir(_armeTir, { degats: T.degats, balles: 1, dispersion: 0.06, portee: T.portee, perce: 0, recul: 0.15, classe: 'mitraillette', cle: 'tourelle' }), km, false);
            else { const duree = 0.9 + Math.hypot(cible.x - d.x, cible.z - d.z) * 0.04; jeu.obus.push({ x0: d.x, z0: d.z, x1: cible.x + (jeu.rnd() - 0.5), z1: cible.z + (jeu.rnd() - 0.5), t: 0, duree, degats: T.degats * km, souffle: T.souffle }); ev(jeu, { t: 'mortier', x: d.x, z: d.z }); }
          }
        } else if (d.attente < 0) d.attente = 0;
      }
    }
    for (let i = jeu.defenses.length - 1; i >= 0; i--) {
      const d = jeu.defenses[i]; if (d.vie > 0) continue;
      jeu.defenses.splice(i, 1);
      const T = D.DEFENSES[d.type];
      if (d.type === 'mine') explosion(jeu, d.x, d.z, T.souffle, T.degats * km, 'def' + d.id);
      else if (d.type === 'claymore') { // le souffle en cône, vers l'avant
        for (const zb of jeu.zombies) { if (zb.vie <= 0) continue; const ex = zb.x - d.x, ez = zb.z - d.z, dd = Math.hypot(ex, ez); if (dd > T.souffle + zb.rayon || ecartAngle(d.angle, Math.atan2(ez, ex)) > T.cone + 0.15) continue; blesserZombie(jeu, zb, T.degats * km * (1 - Math.min(1, dd / T.souffle) * 0.5), ex / (dd || 1) * 2, ez / (dd || 1) * 2, 'def' + d.id, false, true); }
        ev(jeu, { t: 'boum', x: d.x + Math.cos(d.angle) * 1.2, z: d.z + Math.sin(d.angle) * 1.2, r: 2.2, cone: d.angle });
      } else if (d.type === 'baril' || d.type === 'radio') {
        explosion(jeu, d.x, d.z, T.souffle, T.degats * km, d.de || 'def' + d.id);
        for (const j of jeu.joueurs) { if (!j.vivant) continue; const dd = Math.hypot(j.x - d.x, j.z - d.z); if (dd < T.souffle * 0.8) blesserJoueur(jeu, j, 25 * (1 - dd / T.souffle)); }
      } else ev(jeu, { t: 'casse', type: d.type, x: d.x, z: d.z });
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
      if (o.t >= o.duree) {
        jeu.obus.splice(i, 1);
        if (o.trou) { if (jeu.trous) { jeu.trous.push({ id: nouvelId(jeu), x: o.x1, z: o.z1, t: 0, duree: o.trou.duree, r: o.trou.r, attire: o.trou.attire, dps: o.trou.dps, implose: o.trou.implose, souffle: o.trou.souffle, de: o.de, tic: 0 }); ev(jeu, { t: 'trou', x: o.x1, z: o.z1, r: o.trou.r }); } continue; }
        explosion(jeu, o.x1, o.z1, o.souffle, o.degats, o.de || 'mortier', o.petite);
        if (o.grappe) for (let k = 0; k < o.grappe.n; k++) { // (la grappe : de petites bombes tout autour, qui éclatent l'une après l'autre)
          const a = (k / o.grappe.n) * TAU + jeu.rndB() * 0.8, r = o.grappe.r * (0.55 + jeu.rndB() * 0.45), x1 = o.x1 + Math.cos(a) * r, z1 = o.z1 + Math.sin(a) * r;
          jeu.obus.push({ x0: o.x1, z0: o.z1, x1, z1, t: 0, duree: 0.28 + k * 0.07, degats: o.grappe.degats, souffle: o.grappe.souffle, de: o.de, droit: false, petite: true, cle: o.cle });
        }
        if (o.flaque) { jeu.zones.push({ id: nouvelId(jeu), x: o.x1, z: o.z1, r: o.flaque.r, dps: o.flaque.dps, vie: o.flaque.duree, duree: o.flaque.duree, de: o.de, tick: 0 }); ev(jeu, { t: 'acide', x: o.x1, z: o.z1, r: o.flaque.r }); }
      }
    }
    // les singularités : elles aspirent ce qui est autour (un peu de mal chaque quart de seconde), puis implosent
    for (let i = (jeu.trous || []).length - 1; i >= 0; i--) {
      const T = jeu.trous[i]; T.t += dt; T.tic -= dt; const tic = T.tic <= 0; if (tic) T.tic = 0.25;
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0 || zb.terre) continue;
        const ex = T.x - zb.x, ez = T.z - zb.z, d = Math.hypot(ex, ez); if (d > T.r + zb.rayon) continue;
        const v = T.attire * (D.ZOMBIES[zb.type].boss ? 0.15 : zb.rayon > 0.6 ? 0.6 : 1) * (0.5 + 0.5 * (1 - d / (T.r + zb.rayon)));
        if (d > 0.35) { const k = Math.min(d - 0.3, v * dt) / d; zb.x += ex * k; zb.z += ez * k; }
        if (tic) blesserZombie(jeu, zb, T.dps * 0.25, 0, 0, T.de, false, false, true);
      }
      if (T.t >= T.duree) { jeu.trous.splice(i, 1); explosion(jeu, T.x, T.z, T.souffle, T.implose, T.de); ev(jeu, { t: 'implose', x: T.x, z: T.z, r: T.souffle }); }
    }
    // les crochets des geôliers : ils volent ; celui qui touche un survivant le tire vers son geôlier
    for (let i = jeu.crochets.length - 1; i >= 0; i--) {
      const c = jeu.crochets[i]; c.vie -= dt; c.x += c.vx * dt; c.z += c.vz * dt;
      const g = jeu.zombies.find((z) => z.id === c.de && z.vie > 0);
      let fini = !g || c.vie <= 0 || jeu.monde.bloque(c.x, c.z, 0.05);
      if (!fini) for (const j of jeu.joueurs) if (j.vivant && Math.hypot(j.x - c.x, j.z - c.z) < j.rayon + 0.25) { blesserJoueur(jeu, j, D.ZOMBIES.geolier.crochet.degats); j.tire = { de: c.de, t: 0.55 }; ev(jeu, { t: 'accroche', id: j.id, par: c.de }); fini = true; break; }
      if (fini) jeu.crochets.splice(i, 1);
    }
    // les disques du lance-scies
    for (let i = jeu.disques.length - 1; i >= 0; i--) {
      const d = jeu.disques[i]; d.t += dt;
      const j = trouverJoueur(jeu, d.de);
      if (d.t > d.aller) { // le retour vers le tireur
        if (!j || !j.vivant || d.t > d.aller * 3.5) { jeu.disques.splice(i, 1); continue; }
        const ex = j.x - d.x, ez = j.z - d.z, l = Math.hypot(ex, ez) || 1;
        if (l < 0.6) { jeu.disques.splice(i, 1); continue; }
        d.vx = ex / l * d.v * 1.15; d.vz = ez / l * d.v * 1.15;
      }
      const nx = d.x + d.vx * dt, nz = d.z + d.vz * dt;
      if (jeu.monde.bloque(nx, nz, 0.15) && d.t <= d.aller) { d.t = d.aller + 1e-3; } // un mur : il rebondit et revient
      else { d.x = nx; d.z = nz; }
      for (const zb of jeu.zombies) {
        if (zb.vie <= 0) continue;
        if ((zb.x - d.x) ** 2 + (zb.z - d.z) ** 2 > (zb.rayon + 0.45) ** 2) continue;
        if (d.vus[zb.id] !== undefined && d.t - d.vus[zb.id] < 0.35) continue;
        d.vus[zb.id] = d.t; const l = Math.hypot(d.vx, d.vz) || 1;
        blesserZombie(jeu, zb, d.degats, d.vx / l * d.recul, d.vz / l * d.recul, d.de, false);
      }
    }
    // les flaques d'acide : elles rongent ce qui marche dedans
    for (let i = jeu.zones.length - 1; i >= 0; i--) {
      const z = jeu.zones[i]; z.vie -= dt; z.tick -= dt;
      if (z.vie <= 0) { jeu.zones.splice(i, 1); continue; }
      if (z.tick > 0) continue; z.tick = 0.3;
      for (const zb of jeu.zombies) if (zb.vie > 0 && (zb.x - z.x) ** 2 + (zb.z - z.z) ** 2 < (z.r + zb.rayon * 0.5) ** 2) blesserZombie(jeu, zb, z.dps * 0.3, 0, 0, z.de, false, false, true);
    }
  }

  function majObjets(jeu, dt) {
    for (let i = jeu.objets.length - 1; i >= 0; i--) {
      const o = jeu.objets[i]; o.age += dt;
      if ((o.type === 'ferraille' && o.age > DUREE_FERRAILLE) || (o.type === 'bonus' && o.age > D.BONUS_CHANCE.dure)) { jeu.objets.splice(i, 1); continue; }
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
      if (o.type === 'ferraille') { const v = o.valeur * (pris.effets && pris.effets.double > 0 ? 2 : 1); pris.ferraille += v; jeu.stats.ferraille += v; ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'ferraille', valeur: v, x: o.x, z: o.z }); }
      else if (o.type === 'bonus') appliquerBonus(jeu, pris, o.bonus, o.x, o.z);
      else if (o.type === 'soin') { pris.vie = Math.min(pris.vieMax, pris.vie + o.valeur); ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'soin', valeur: o.valeur }); }
      else if (o.type === 'caisse') { jeu.stats.caisses++; const a = ouvrirCaisse(jeu, pris, o.rare); ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'caisse', arme: a, rare: !!o.rare }); if (o.rare && o.valeur) { pris.ferraille += o.valeur; jeu.stats.ferraille += o.valeur; ev(jeu, { t: 'ramasse', id: pris.id, quoi: 'ferraille', valeur: o.valeur, x: o.x, z: o.z }); } }
    }
  }
  // ─── le Lot 4 : les bonus, les leurres, le largage, les pièges ───
  function tirerBonus(jeu) { const l = Object.keys(D.BONUS); let s = 0; for (const k of l) s += D.BONUS[k].poids; let r = jeu.rndB() * s; for (const k of l) { r -= D.BONUS[k].poids; if (r <= 0) return k; } return l[0]; }
  function appliquerBonus(jeu, j, k, x, z) {
    const B = D.BONUS[k]; if (!B) return;
    if (k === 'bombe') { for (const zb of jeu.zombies) if (zb.vie > 0 && Math.hypot(zb.x - j.x, zb.z - j.z) < B.rayon) blesserZombie(jeu, zb, D.ZOMBIES[zb.type].boss ? B.boss : zb.vie + 1, 0, 0, j.id, false, true); }
    else if (k === 'leurre') { jeu.leurres.push({ id: nouvelId(jeu), type: 'leurre', x, z, rayon: 0.45, vie: 1e9, vieMax: 1e9, t: B.duree }); if (jeu.leurres.length > 3) jeu.leurres.shift(); }
    else if (k === 'ralenti') jeu.ralenti = B.duree;
    else j.effets[k] = B.duree;
    ev(jeu, { t: 'bonus', id: j.id, bonus: k, x, z, r: B.rayon || 0 });
  }
  function majEffets(jeu, dt) {
    for (const j of jeu.joueurs) for (const k in j.effets) { j.effets[k] -= dt; if (j.effets[k] <= 0) { delete j.effets[k]; ev(jeu, { t: 'finBonus', id: j.id, bonus: k }); } }
    if (jeu.ralenti > 0) { jeu.ralenti -= dt; if (jeu.ralenti <= 0) { jeu.ralenti = 0; ev(jeu, { t: 'finBonus', id: '', bonus: 'ralenti' }); } }
    for (let i = jeu.leurres.length - 1; i >= 0; i--) { const L = jeu.leurres[i]; L.t -= dt; if (L.flash > 0) L.flash -= dt; if (L.t <= 0) { jeu.leurres.splice(i, 1); ev(jeu, { t: 'finLeurre', x: L.x, z: L.z }); } }
  }
  function majLargage(jeu, dt) {
    const la = jeu.largage, L = D.LARGAGE; if (!la || jeu.phase !== 'vague') return;
    la.t -= dt; if (la.t > 0) return;
    if (!la.pose) { // sa place : à quelques pas d'un survivant, sur un sol libre
      const j0 = jeu.joueurs.find((j) => j.vivant); if (!j0) return; const demi = jeu.A.taille / 2 - 3;
      for (let e = 0; e < 30; e++) {
        const a = jeu.rndB() * TAU, d = L.distance[0] + jeu.rndB() * (L.distance[1] - L.distance[0]), x = j0.x + Math.cos(a) * d, z = j0.z + Math.sin(a) * d;
        if (Math.abs(x) > demi || Math.abs(z) > demi || jeu.monde.bloque(x, z, 1.0)) continue;
        la.pose = true; la.x = x; la.z = z; la.t = L.delai; ev(jeu, { t: 'largage', x, z, delai: L.delai }); return;
      }
      jeu.largage = null; return;
    }
    jeu.objets.push({ id: nouvelId(jeu), type: 'caisse', rare: true, x: la.x, z: la.z, valeur: L.ferraille, age: 0, vole: false });
    ev(jeu, { t: 'largue', x: la.x, z: la.z }); jeu.largage = null;
  }
  function poserPieges(jeu) {
    const P = D.PIEGE, demi = jeu.A.taille / 2 - 4, r = jeu.rndB, l = [], m = jeu.monde;
    const libre = (x, z, rr) => { if (m.bloque(x, z, 0.6)) return false; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; if (m.bloque(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.4)) return false; } return true; };
    for (let e = 0; e < 120 && l.length < P.nombre; e++) {
      const a = r() * TAU, d = 7 + r() * Math.max(1, demi - 7), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) > demi || Math.abs(z) > demi || !libre(x, z, P.rayon) || l.some((p) => Math.hypot(p.x - x, p.z - z) < 11)) continue;
      const as = r() * TAU, sx = x + Math.cos(as) * (P.rayon + 1.5), sz = z + Math.sin(as) * (P.rayon + 1.5);
      if (Math.abs(sx) > demi || Math.abs(sz) > demi || m.bloque(sx, sz, 0.7)) continue;
      l.push({ id: l.length, x, z, sx, sz, etat: 'pret', t: 0, tic: 0, cher: 0 });
    }
    return l;
  }
  function majPieges(jeu, dt) {
    const P = D.PIEGE;
    for (const p of jeu.pieges || []) {
      if (p.etat === 'actif') {
        p.t -= dt; p.tic -= dt;
        if (p.tic <= 0) { p.tic = 0.25; for (const zb of jeu.zombies) if (zb.vie > 0 && (zb.x - p.x) ** 2 + (zb.z - p.z) ** 2 < P.rayon * P.rayon) blesserZombie(jeu, zb, P.dps * 0.25, 0, 0, 'piege', false, false, true); ev(jeu, { t: 'zap', id: p.id, x: p.x, z: p.z }); }
        if (p.t <= 0) { p.etat = 'recharge'; p.t = P.recharge; }
        continue;
      }
      if (p.etat === 'recharge') { p.t -= dt; if (p.t <= 0) { p.etat = 'pret'; p.t = 0; ev(jeu, { t: 'piegePret', id: p.id, x: p.x, z: p.z }); } continue; }
      if (p.cher > 0) p.cher -= dt;
      for (const j of jeu.joueurs) {
        if (!j.vivant || Math.hypot(j.x - p.sx, j.z - p.sz) > 0.9) continue;
        if (j.ferraille >= P.cout) { j.ferraille -= P.cout; p.etat = 'actif'; p.t = P.duree; p.tic = 0; ev(jeu, { t: 'piege', id: p.id, de: j.id, x: p.x, z: p.z }); }
        else if (p.cher <= 0) { p.cher = 3; ev(jeu, { t: 'piegeCher', id: j.id, cout: P.cout }); }
        break;
      }
    }
  }
  function ouvrirCaisse(jeu, j, rare) {
    // une arme au hasard parmi celles permises à cette vague (pondérées par leur rareté)
    const n = Math.max(1, jeu.vague) + (rare ? 4 : 0), l = Object.keys(D.ARMES).filter((k) => D.ARMES[k].rarete > 0 && D.ARMES[k].depuis <= n);
    const poids = (k) => (rare ? 400 / D.ARMES[k].rarete : D.ARMES[k].rarete), tir = rare ? jeu.rndB : jeu.rnd; // (largage : les plus rares d'abord)
    let s = 0; for (const k of l) s += poids(k); let r = tir() * s, id = l[0];
    for (const k of l) { r -= poids(k); if (r <= 0) { id = k; break; } }
    const A = D.ARMES[id], slot = j.armes[1];
    if (slot && slot.id === id) slot.mun += A.munitions; else j.armes[1] = { id, mun: A.munitions };
    j.main = 1; j.attente = Math.min(j.attente, 0.15);
    ev(jeu, { t: 'arme', id: j.id, arme: id, trouvee: true }); // (trouvée dans une caisse : le HUD montre sa carte)
    return id;
  }

  // ─── les actions du joueur (boutons du HUD ; plus tard, des messages du salon) ───
  function construire(jeu, idJ, type) {
    const j = trouverJoueur(jeu, idJ), T = D.DEFENSES[type];
    if (!j || !T || jeu.fini) return { ok: false, raison: 'inconnu' };
    if (!j.vivant) return { ok: false, raison: 'mort' };
    if (jeu.mod.sansAtelier || T.horsAtelier) return { ok: false, raison: 'regle' };
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
  // une émote : une bulle au-dessus du survivant (même à terre : « À l'aide ! »), pas plus d'une toutes les 1,2 s
  function emote(jeu, idJ, e) {
    const j = trouverJoueur(jeu, idJ); if (!j || !D.EMOTES[e] || j.emoteCd > 0 || j.parti) return { ok: false };
    j.emote = { id: e, t: 2.4 }; j.emoteCd = 1.2; ev(jeu, { t: 'emote', id: j.id, e });
    return { ok: true };
  }
  function passer(jeu) { if (jeu.phase === 'pause' && !jeu.fini) { jeu.chrono = 0; return true; } return false; }
  // ce qu'il reste à tuer dans la vague
  const restants = (jeu) => jeu.aSortir + jeu.zombies.length;

  // le défi du jour : la date (« 2026-11-03 », heure de Paris) donne la graine, l'arène et le mutateur, les mêmes pour tout le monde
  function defiDu(jour) {
    let h = 0x811c9dc5; const t = 'rempart:' + jour;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const L = D.DEFI.mutateurs, r = mulberry32(h);
    const AR = jour <= '2026-11-03' ? D.ORDRE_ARENES.slice(0, 3) : D.ORDRE_ARENES; // (les arènes arrivées le 4 novembre ne changent pas les défis d'avant)
    const arene = AR[Math.floor(r() * AR.length) % AR.length], m = L[Math.floor(r() * L.length) % L.length];
    return { jour, graine: h || 1, arene, mutateur: m.id, mod: Object.assign({}, m), nom: m.nom, texte: m.texte };
  }
  return { roulade, appliquerBonus, emote, echelon, texteObjectif, tirer, defiDu, creer, pas, construire, ameliorer, changerArme, passer, grenade, choisirAtout, restants, multDegats, chanceCritique, rechargeGrenade, prixDefense, prixAmelioration, maxDefenses, compteDefenses, armeDe, mulberry32, DUREE_FERRAILLE };
});
