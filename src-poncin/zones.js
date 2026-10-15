/* OPÉRATION PONCIN — les zones de la carte où se joue une partie (conception du lot Gameplay, § 7, et décision du joueur du 9 oct.) :
     'place'    Place Bichat (serré)          cercle de 55 m autour de la place (carte.zones.arene.centre)            2–4 joueurs
     'centre'   Cœur du village (défaut)      carte.zones.arene telle quelle (l'arène d'avant : ses apparitions et ses objets)   2–6
     'eglise'   Autour de l'église            cercle de 70 m autour de l'église Saint-Martin (carte.noms)              2–4
     'bourg'    Tout le bourg                 cercle de 190 m, centré entre la place et le barycentre des bâtiments à moins de 200 m d'elle   4–6
     'rivieres' Le Veyron                     le Veyron dans le bourg et ses deux ponts : l'union de cercles de 45 m posés tous les 30 m sur
                                              ses berges, entre ses ponts (35 m au-delà de chacun) ; une limite v2 en arêtes            4–6
     'tout'     Tout Poncin                   le carré de la carte, marge de 8 m (limite v2 'carre')                    6
   PZONES.preparer(carte, monde, nav, id, rnd, reglages?) → { id, demande, nom, limite, englobant: { centre, rayon }, apparitions: [[x, z], …],
   objets: [[x, z, objet], …], aire (m² joignables), joueurs: [min, max], avertissement? }. Pose monde.limite = zone.limite (la partie
   la garde). Au lancement (hôte ou solo), dans PJEU.creer, avant mode.init : rnd est un générateur à part (mulberry32(graine ^
   0x2F6E2B1)) pour que jeu.rnd reste identique chez l'hôte et chez la façade ; la navigation (PNAV, pas 1,5 m, marge 0,45 : celle de la
   partie, mise en cache sur le monde) est construite ici si on n'en donne pas : la même graine donne la même zone partout.
   'centre' reprend telles quelles les zones précalculées de la carte (aucun risque pour l'arène d'avant). Les autres :
   - apparitions : monde.libre(rnd) dans la zone, sur la composante principale de la navigation (nav.accessible), à 1 m au moins de tout
     mur et de la limite, espacées de 18 m (14 m pour 'place') ; au moins max(12, 2 × 6) (l'espacement se resserre s'il le faut), au
     plus 180 ;
   - objets : n = clamp(arrondi(aire joignable / 2500 m²), 4, 16), à plus de 8 m des apparitions et 12 m l'un de l'autre (moins s'il le
     faut) ; types tournants : soin, armure, munitions, puis une arme principale permise (reglages.armes ; à tour de rôle).
   L'Extraction (reglages.mode === 'extraction') : la même zone que l'Arène (même graine), plus zone.extractions (le pont, la cale de
   la rivière ; repli : les apparitions les plus éloignées du départ), zone.depart et zone.coffres [[x, z, rareté, special?], …] (voir
   extraction() plus bas ; PZONES.extraction(carte, monde, nav, zone, rnd, reglages) les ajoute à une zone préparée).
   PZONES.definition(carte, monde, id) → la forme de la limite (le def de PMONDE.limiteDe : du JSON simple) ou null ;
   PZONES.adopter(z, monde) → une zone reçue (limite en def ou déjà construite) prête à jouer ; PZONES.pourReseau(z) → { id, nom, limite:
   def, englobant, apparitions, objets, aire } (JSON, arrondi au cm) ; PZONES.distanceReapparition(z) ; PZONES.IDS, NOMS, JOUEURS.
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. Voir src-poncin/ARCHITECTURE.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'), require('./monde.js'), require('./nav.js'));
  else root.PZONES = factory(root.PREGLES, root.PMONDE, root.PNAV);
})(typeof self !== 'undefined' ? self : this, function (REGLES, MONDE, NAV) {
  'use strict';
  const fin = (v) => typeof v === 'number' && v - v === 0;
  const IDS = REGLES.SALON.zones;
  const NOMS = { place: 'Place Bichat', centre: 'Cœur du village', eglise: 'Autour de l’église', bourg: 'Tout le bourg', rivieres: 'Le Veyron', tout: 'Tout Poncin' };
  const JOUEURS = { place: [2, 4], centre: [2, 6], eglise: [2, 4], bourg: [4, 6], rivieres: [4, 6], tout: [6, 6] }; // joueurs conseillés
  const R_PLACE = 55, R_EGLISE = 70, R_BOURG = 190, BOURG_BATIS = 200, MARGE_TOUT = 8;
  const R_RIVE = 45, PAS_RIVE = 30, AU_DELA = 35, UN_PONT = 120; // cercles des berges ; au-delà des ponts ; un seul pont : 120 m autour
  const ESPACE = { place: 14 }, ESPACE_DEFAUT = 18, MIN_APPARITIONS = Math.max(12, 2 * REGLES.SALON.max), MAX_APPARITIONS = 180;
  const OBJ_AIRE = 2500, OBJ_MIN = 4, OBJ_MAX = 16, OBJ_LOIN_APP = 8, OBJ_ECART = 12;
  const NAV_OPTS = { pas: 1.5, marge: 0.45 };   // celle de la partie (PJEU.creer) : la même grille, en cache sur le monde
  const d2 = (a, b) => (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);
  const r2 = (v) => Math.round(v * 100) / 100;

  // ─── les repères de la carte ───
  function arene(carte) {
    const a = carte && carte.zones && carte.zones.arene;
    const c = a && a.centre && fin(+a.centre[0]) && fin(+a.centre[1]) ? [+a.centre[0], +a.centre[1]] : [0, 0];
    return { centre: c, rayon: a && fin(+a.rayon) && a.rayon > 10 ? +a.rayon : 110 };
  }
  const centreDe = (p) => { let x = 0, z = 0; for (const q of p) { x += +q[0]; z += +q[1]; } return [x / p.length, z / p.length]; };
  function nomme(carte, re) { for (const n of (carte && carte.noms) || []) if (n && typeof n.n === 'string' && re.test(n.n) && fin(+n.x) && fin(+n.z)) return [+n.x, +n.z]; return null; }
  function eglise(carte) {
    const p = nomme(carte, /^[ÉE]glise/i); if (p) return p;
    const b = ((carte && carte.batiments) || []).find((q) => q && q.t === 'eglise' && Array.isArray(q.p) && q.p.length >= 3);
    return b ? centreDe(b.p) : null;
  }
  function bourg(carte) { // entre la place et le barycentre des bâtiments à moins de 200 m d'elle
    const pl = arene(carte).centre; let n = 0, x = 0, z = 0;
    for (const b of (carte && carte.batiments) || []) { if (!b || !Array.isArray(b.p) || b.p.length < 3) continue; const c = centreDe(b.p); if (fin(c[0]) && fin(c[1]) && d2(c, pl) < BOURG_BATIS * BOURG_BATIS) { n++; x += c[0]; z += c[1]; } }
    return n ? [(pl[0] + x / n) / 2, (pl[1] + z / n) / 2] : pl.slice();
  }
  function distPoly(p, x, z) { // distance au bord du polygone (m)
    let best = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
      let t = l2 > 0 ? ((x - a[0]) * ex + (z - a[1]) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - a[0] - t * ex, dz = z - a[1] - t * ez; best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  }
  function dansPoly(p, x, z) { let d = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])) d = !d; } return d; }
  // le Veyron : la rivière nommée (eau[i].n), sinon celle qui passe au plus près du nom « Le Veyron » de carte.noms
  function veyron(carte) {
    const eaux = ((carte && carte.eau) || []).filter((e) => e && Array.isArray(e.p) && e.p.length >= 3);
    let e = eaux.find((q) => typeof q.n === 'string' && /veyron/i.test(q.n));
    const nom = nomme(carte, /veyron/i);
    if (!e && nom) { let best = Infinity; for (const q of eaux) { const d = distPoly(q.p, nom[0], nom[1]); if (d < best) { best = d; e = q; } } }
    return e || null;
  }
  // les cercles des berges : des points tous les 30 m le long du bord de la rivière, gardés entre ses ponts (une ellipse de foyers les
  // deux ponts les plus éloignés, qui déborde de 35 m au-delà de chacun ; un seul pont : 120 m autour), plus le milieu de chaque pont
  function rivieres(carte) {
    const e = veyron(carte); if (!e) return null;
    const p = e.p.map((q) => [+q[0], +q[1]]).filter((q) => fin(q[0]) && fin(q[1])); if (p.length < 3) return null;
    const ponts = [];
    for (const q of (carte && carte.ponts) || []) {
      if (!q || !Array.isArray(q.l) || q.l.length < 2) continue;
      const a = q.l[0], b = q.l[q.l.length - 1], m = [(+a[0] + +b[0]) / 2, (+a[1] + +b[1]) / 2];
      if (fin(m[0]) && fin(m[1]) && (dansPoly(p, m[0], m[1]) || distPoly(p, m[0], m[1]) < 6)) ponts.push(m);
    }
    if (!ponts.length) return null;
    let A = ponts[0], B = ponts[0], dAB = 0;
    for (let i = 0; i < ponts.length; i++) for (let j = i + 1; j < ponts.length; j++) { const d = Math.sqrt(d2(ponts[i], ponts[j])); if (d > dAB) { dAB = d; A = ponts[i]; B = ponts[j]; } }
    const somme = dAB > 1 ? dAB + 2 * AU_DELA : 2 * UN_PONT;
    const garde = (q) => Math.sqrt(d2(q, A)) + Math.sqrt(d2(q, B)) <= somme;
    const cercles = []; let reste = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], lg = Math.sqrt(d2(a, b));
      let s = reste;
      for (; s < lg; s += PAS_RIVE) { const q = [a[0] + (b[0] - a[0]) * s / lg, a[1] + (b[1] - a[1]) * s / lg]; if (garde(q)) cercles.push([r2(q[0]), r2(q[1]), R_RIVE]); }
      reste = s - lg;
    }
    for (const m of ponts) if (garde(m)) cercles.push([r2(m[0]), r2(m[1]), R_RIVE]); // le milieu de chaque pont : ses deux têtes dedans
    return cercles.length ? { forme: 'cercles', cercles } : null;
  }

  // la forme de la limite d'une zone (le def de PMONDE.limiteDe) ou null si la carte ne la permet pas
  function definition(carte, monde, id) {
    const a = arene(carte);
    if (id === 'centre') return { forme: 'cercle', centre: a.centre.slice(), rayon: a.rayon };
    if (id === 'place') return { forme: 'cercle', centre: a.centre.slice(), rayon: R_PLACE };
    if (id === 'eglise') { const c = eglise(carte); return c ? { forme: 'cercle', centre: [r2(c[0]), r2(c[1])], rayon: R_EGLISE } : null; }
    if (id === 'bourg') { const c = bourg(carte); return { forme: 'cercle', centre: [r2(c[0]), r2(c[1])], rayon: R_BOURG }; }
    if (id === 'rivieres') return rivieres(carte);
    if (id === 'tout') { const L = monde && monde.L > 0 ? monde.L : carte && carte.taille > 0 ? +carte.taille : 600; return { forme: 'carre', centre: [0, 0], cote: L - 2 * MARGE_TOUT }; }
    return null;
  }

  // 'centre' : l'arène de la carte (110 m autour de (0, 0) sans carte, comme PARENE), ses apparitions et ses objets, tels quels
  function centre(carte) {
    const z = (carte && carte.zones) || {}, a = arene(carte);
    const apparitions = [], objets = [];
    for (const p of Array.isArray(z.apparitions) ? z.apparitions : []) if (p && fin(+p[0]) && fin(+p[1])) apparitions.push([+p[0], +p[1]]);
    for (const o of Array.isArray(z.armes) ? z.armes : []) if (o && fin(+o.x) && fin(+o.z) && typeof o.arme === 'string') objets.push([+o.x, +o.z, o.arme]);
    return { id: 'centre', demande: 'centre', nom: NOMS.centre, limite: MONDE.limiteDe({ forme: 'cercle', centre: a.centre.slice(), rayon: a.rayon }), englobant: { centre: a.centre.slice(), rayon: a.rayon }, apparitions, objets, aire: Math.PI * a.rayon * a.rayon, joueurs: JOUEURS.centre.slice() };
  }

  // la navigation de la partie (en cache sur le monde), construite au besoin
  function navDe(monde, nav) {
    if (nav && typeof nav.accessible === 'function') return nav;
    if (!NAV || !monde || typeof monde.passe !== 'function' || !monde._interne) return null;
    try { return NAV.creer(monde, NAV_OPTS); } catch (e) { return null; }
  }
  // l'aire joignable (m²) : les cases de la composante principale de la navigation ; sans navigation, l'aire de la limite
  function aireJoignable(nav, z) {
    if (nav && nav.stats && nav.pas > 0) { const n = nav.stats.principale; if (n > 0) return n * nav.pas * nav.pas; }
    const l = z && z.limite; return l && l.aire > 0 ? l.aire : l && l.rayon > 0 ? Math.PI * l.rayon * l.rayon : 0;
  }

  function preparer(carte, monde, nav, id, rnd, reglages) {
    const demande = typeof id === 'string' && IDS.indexOf(id) >= 0 ? id : 'centre';
    const poser = (z) => { if (monde) { monde.limite = z.limite; z.aire = aireJoignable(navDe(monde, nav), z); } return z; }; // la navigation d'abord : monde.libre la lit (même zone partout)
    const repli = (raison) => { const z = centre(carte); z.demande = typeof id === 'string' ? id : demande; z.avertissement = raison; return poser(z); };
    const ex = reglages && reglages.mode === 'extraction'; // l'Extraction : coffres, points d'extraction et départ en plus (hasard à part)
    if (ex) { const z = preparer(carte, monde, nav, id, rnd, Object.assign({}, reglages, { mode: 'arene' })); extraction(carte, monde, navDe(monde, nav), z, rnd, reglages); return z; }
    if (demande !== id) return repli(`zone « ${typeof id === 'string' ? id : String(id)} » inconnue : on joue « centre »`);
    if (demande === 'centre') return poser(centre(carte));
    if (!monde) return repli(`zone « ${id} » : il faut le monde pour la préparer : on joue « centre »`);
    const def = definition(carte, monde, id), limite = def ? MONDE.limiteDe(def) : null;
    if (!limite) return repli(`zone « ${id} » introuvable sur cette carte : on joue « centre »`);
    monde.limite = limite;
    nav = navDe(monde, nav);
    if (typeof rnd !== 'function') rnd = REGLES.mulberry32(0x2F6E2B1);
    const ok = (p) => limite.dedans(p[0], p[1]) && !monde.bloque(p[0], p[1], 1) && (!nav || nav.accessible(p[0], p[1]));
    // les apparitions : fléchettes espacées, jusqu'à 400 échecs de suite ; l'espacement se resserre s'il en manque
    const apparitions = [];
    for (let esp = ESPACE[id] || ESPACE_DEFAUT; ; esp *= 0.8) {
      const e2 = esp * esp;
      for (let k = 0, rate = 0; k < 8000 && rate < 400 && apparitions.length < MAX_APPARITIONS; k++) {
        const q0 = monde.libre(rnd), p = [r2(q0[0]), r2(q0[1])]; // arrondi au cm (le format réseau) avant de vérifier
        if (!ok(p) || apparitions.some((q) => d2(p, q) < e2)) { rate++; continue; }
        apparitions.push(p); rate = 0;
      }
      if (apparitions.length >= MIN_APPARITIONS || esp < 5) break;
    }
    // les objets : soin, armure, munitions, une arme permise, à tour de rôle
    const aire = aireJoignable(nav, { limite });
    const n = Math.max(OBJ_MIN, Math.min(OBJ_MAX, Math.round(aire / OBJ_AIRE)));
    const permises = REGLES.armesPermises(reglages && Array.isArray(reglages.armes) ? reglages.armes : null).filter((a) => REGLES.OBJETS[a] && REGLES.OBJETS[a].type === 'arme');
    const types = ['soin', 'armure', 'munitions', 'arme'], objets = [];
    for (let k = 1; objets.length < n && k >= 0.3; k *= 0.75) {
      const loin = OBJ_LOIN_APP * k, ecart = OBJ_ECART * k;
      for (let essai = 0, rate = 0; objets.length < n && essai < 4000 && rate < 300; essai++) {
        const q0 = monde.libre(rnd), p = [r2(q0[0]), r2(q0[1])];
        if (!ok(p) || apparitions.some((q) => d2(p, q) < loin * loin) || objets.some((q) => d2(p, q) < ecart * ecart)) { rate++; continue; }
        const i = objets.length, t = types[i % 4];
        objets.push([p[0], p[1], t === 'arme' ? (permises.length ? permises[Math.floor(i / 4) % permises.length] : 'munitions') : t]); rate = 0;
      }
    }
    const zone = { id, demande: id, nom: NOMS[id], limite, englobant: { centre: limite.centre.slice(), rayon: limite.rayon }, apparitions, objets, aire, joueurs: JOUEURS[id].slice() };
    if (apparitions.length < MIN_APPARITIONS) zone.avertissement = `zone « ${id} » : ${apparitions.length} apparitions seulement`;
    return zone;
  }

  // ─── l'Extraction (mode 'extraction') : les points d'extraction, le départ, les coffres ───
  // - le pont : le milieu d'un pont de la carte (carte.ponts) dans la zone, joignable (le plus près du centre de la zone s'il y en a
  //   plusieurs) ; la cale de la rivière : un point de la berge d'une rivière (carte.eau 'riviere'), 2,5 à 6 m hors de l'eau, joignable,
  //   à clamp(0,6 · rayon englobant, 80, 220) m du pont au mieux (au moins 60 m). 'bourg' (graine 1) : le pont de l'église (74 ; 162) et
  //   la berge nord du Veyron (≈ 191 ; 179), à 117 m ;
  // - le départ : l'apparition la plus éloignée des deux points (sans les deux : la plus proche du centre de la zone, et les points
  //   manquants sont les apparitions les plus éloignées du départ, écartées l'une de l'autre : « Sortie » + la rue la plus proche) ;
  // - les coffres : n = clamp(arrondi(aire joignable / 2500 m²), 20, 40) (bourg 30, tout 40), joignables, à 10 m l'un de l'autre, à 20 m
  //   du départ, hors des cercles d'extraction, de préférence contre un mur ; raretés PBUTIN-compatibles (7 % légendaires, au moins un ;
  //   15 % épiques ; 28 % rares), les plus rares les plus loin du départ ; l'hôtel de ville dans la zone : un coffre légendaire 'mairie'
  //   (le trésor de la mairie) à côté.
  // zone.extractions = [{ id: 'pont' | 'cale' | 'sortieN', nom, x, z, rayon }] ; zone.depart = [x, z] ; zone.coffres = [[x, z, rarete, special?], …]
  const EX = REGLES.MODES.extraction || {}, EX_RAYON = (EX.extraction && EX.extraction.rayon) || 10, C = EX.coffres || { aire: 2500, min: 20, max: 40, ecart: 10 };
  const PARTS = { legendaire: 0.07, epique: 0.15, rare: 0.28 }; // (les mêmes que PBUTIN.PARTS)
  function berges(carte, ok) { // les points de berge (tous les 4 m, 2,5 à 6 m hors de l'eau) qui conviennent
    const out = [];
    for (const e of (carte && carte.eau) || []) {
      if (!e || e.t !== 'riviere' || !Array.isArray(e.p) || e.p.length < 3) continue;
      const p = e.p.map((q) => [+q[0], +q[1]]), n = p.length; let aire = 0;
      for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; aire += a[0] * b[1] - b[0] * a[1]; }
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz); if (!(l > 0)) continue;
        let nx = dz / l, nz = -dx / l; if (aire < 0) { nx = -nx; nz = -nz; } // la normale vers la terre
        for (let t = 0; t < l; t += 4) {
          const x = a[0] + dx * t / l, z = a[1] + dz * t / l;
          for (const off of [2.5, 4, 6]) { const q = [r2(x + nx * off), r2(z + nz * off)]; if (ok(q) && !dansPoly(p, q[0], q[1])) { out.push(q); break; } }
        }
      }
    }
    return out;
  }
  function nomVers(carte, zone, p) { // « Sortie » + la rue nommée la plus proche (30 m), sinon le côté de la zone
    let best = null, bd = 30;
    for (const r of (carte && carte.rues) || []) {
      if (!r || typeof r.n !== 'string' || !r.n || !Array.isArray(r.l)) continue;
      for (let i = 0; i + 1 < r.l.length; i++) { const d = distSeg(r.l[i], r.l[i + 1], p[0], p[1]); if (d < bd) { bd = d; best = r.n; } }
    }
    if (best) return 'Sortie ' + best;
    const c = zone.englobant.centre, dx = p[0] - c[0], dz = p[1] - c[1];
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'Sortie est' : 'Sortie ouest') : (dz > 0 ? 'Sortie sud' : 'Sortie nord');
  }
  function distSeg(a, b, x, z) {
    const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - a[0]) * ex + (z - a[1]) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - a[0] - t * ex, dz = z - a[1] - t * ez; return Math.sqrt(dx * dx + dz * dz);
  }
  function extraction(carte, monde, nav, zone, rnd0, reglages) {
    const rnd = REGLES.mulberry32(typeof rnd0 === 'function' ? (rnd0() * 4294967296) >>> 0 : 0x5EC0FF3), lim = zone.limite;
    const ok = (p, r) => fin(p[0]) && fin(p[1]) && lim.dedans(p[0], p[1]) && (!lim.pres || !lim.pres(p[0], p[1], 1)) && !(monde && monde.bloque(p[0], p[1], r || 1)) && (!nav || nav.accessible(p[0], p[1]));
    const R = zone.englobant.rayon, C0 = zone.englobant.centre, pts = [];
    // le pont
    let pont = null, bp = Infinity;
    for (const q of (carte && carte.ponts) || []) {
      if (!q || !Array.isArray(q.l) || q.l.length < 2) continue;
      const a = q.l[0], b = q.l[q.l.length - 1], m = [r2((+a[0] + +b[0]) / 2), r2((+a[1] + +b[1]) / 2)];
      if (!ok(m, 0.4)) continue;
      const d = d2(m, C0); if (d < bp) { bp = d; pont = m; }
    }
    if (pont) pts.push({ id: 'pont', nom: 'Le pont', x: pont[0], z: pont[1], rayon: EX_RAYON });
    // la cale de la rivière
    const ideal = Math.max(80, Math.min(220, 0.6 * R));
    let cale = null, bc = Infinity;
    for (const q of berges(carte, (p) => ok(p, 1))) {
      const d = pont ? Math.sqrt(d2(q, pont)) : ideal; if (pont && d < 60) continue;
      const s = Math.abs(d - ideal) + (pont ? 0 : Math.sqrt(d2(q, C0)) * 0.01); if (s < bc) { bc = s; cale = q; }
    }
    if (cale) pts.push({ id: 'cale', nom: 'La cale de la rivière', x: cale[0], z: cale[1], rayon: EX_RAYON });
    // le départ (une apparition joignable)
    const apps = zone.apparitions.filter((p) => ok(p, 0.6));
    const dmin = (p) => { let m = Infinity; for (const e of pts) m = Math.min(m, Math.sqrt(d2(p, [e.x, e.z]))); return m; };
    let depart = null, bd = -Infinity;
    if (pts.length === 2) { for (const p of apps) { const v = dmin(p); if (v > bd) { bd = v; depart = p; } } }
    else { for (const p of apps) { const v = -d2(p, C0); if (v > bd) { bd = v; depart = p; } } }
    if (!depart) { const q = monde ? monde.libre(rnd) : [C0[0], C0[1]]; depart = [r2(q[0]), r2(q[1])]; }
    // les points manquants : les apparitions les plus éloignées du départ, écartées des autres points
    for (let k = 0; pts.length < 2 && k < 2; k++) {
      let best = null, bv = -Infinity;
      for (const p of apps) { const dd = Math.sqrt(d2(p, depart)); if (pts.length && dmin(p) < Math.max(40, 0.6 * R)) continue; if (dd > bv) { bv = dd; best = p; } }
      if (!best) for (const p of apps) { const dd = Math.sqrt(d2(p, depart)) + (pts.length ? dmin(p) : 0); if (dd > bv && (!pts.length || dmin(p) > 1)) { bv = dd; best = p; } }
      if (!best) break;
      pts.push({ id: 'sortie' + (pts.length + 1), nom: nomVers(carte, zone, best), x: best[0], z: best[1], rayon: EX_RAYON });
    }
    // les coffres
    const aire = zone.aire > 0 ? zone.aire : lim.aire || 0, n = Math.max(C.min, Math.min(C.max, Math.round(aire / C.aire)));
    const coffres = [], loinDe = (p, e) => coffres.every((q) => d2(p, q) >= e * e);
    const libreEx = (p) => pts.every((e) => d2(p, [e.x, e.z]) >= (e.rayon + 5) * (e.rayon + 5)) && d2(p, depart) >= 20 * 20;
    // l'hôtel de ville : le trésor de la mairie
    const mairie = nomme(carte, /^(Hôtel de ville|Mairie)/i);
    if (mairie && monde) {
      for (let k = 0; k < 200; k++) {
        const a = rnd() * 2 * Math.PI, r = 3 + 12 * Math.sqrt(rnd()), p = [r2(mairie[0] + Math.cos(a) * r), r2(mairie[1] + Math.sin(a) * r)];
        if (ok(p, 0.8) && libreEx(p)) { coffres.push([p[0], p[1], 'legendaire', 'mairie']); break; }
      }
    }
    for (let ecart = C.ecart; coffres.length < n && ecart >= 4; ecart *= 0.75) {
      for (let essai = 0, rate = 0; coffres.length < n && essai < 6000 && rate < 400; essai++) {
        const q0 = monde ? monde.libre(rnd) : [C0[0] + (rnd() * 2 - 1) * R, C0[1] + (rnd() * 2 - 1) * R], p = [r2(q0[0]), r2(q0[1])];
        if (!ok(p, 0.8) || !libreEx(p) || !loinDe(p, ecart)) { rate++; continue; }
        if (monde && !monde.bloque(p[0], p[1], 3) && rnd() > 0.35) { rate++; continue; } // de préférence contre un mur
        coffres.push([p[0], p[1], 'commun']); rate = 0;
      }
    }
    // les raretés : les plus rares le plus loin du départ (un peu de hasard)
    const nl = Math.max(1, Math.round(coffres.length * PARTS.legendaire)), ne = Math.round(coffres.length * PARTS.epique), nr = Math.round(coffres.length * PARTS.rare);
    const libres = coffres.filter((c) => !c[3]).map((c) => ({ c, d: Math.sqrt(d2(c, depart)) * (0.7 + 0.6 * rnd()) })).sort((a, b) => b.d - a.d);
    let k = coffres.some((c) => c[3] === 'mairie') ? 1 : 0;
    for (const o of libres) { o.c[2] = k < nl ? 'legendaire' : k < nl + ne ? 'epique' : k < nl + ne + nr ? 'rare' : 'commun'; k++; }
    zone.extractions = pts; zone.depart = depart; zone.coffres = coffres;
    return zone;
  }

  // une zone reçue (le message 'lancer', ou passée à PJEU.creer) : la limite reconstruite depuis son def si besoin ; null si inutilisable
  function adopter(z, monde) {
    if (!z || typeof z !== 'object') return null;
    let limite = z.limite;
    if (!(limite && limite.v === 2 && typeof limite.dedans === 'function')) limite = MONDE.limiteDe(limite && limite.def ? limite.def : limite);
    if (!limite) return null;
    const pts = (l, k) => (Array.isArray(l) ? l.filter((p) => Array.isArray(p) && fin(+p[0]) && fin(+p[1]) && (k < 3 || typeof p[2] === 'string')).map((p) => (k < 3 ? [+p[0], +p[1]] : [+p[0], +p[1], p[2]])) : []);
    const id = IDS.indexOf(z.id) >= 0 ? z.id : 'centre';
    const out = { id, demande: typeof z.demande === 'string' ? z.demande : id, nom: typeof z.nom === 'string' ? z.nom : NOMS[id], limite, englobant: { centre: limite.centre.slice(), rayon: limite.rayon },
      apparitions: pts(z.apparitions, 2), objets: pts(z.objets, 3), aire: fin(+z.aire) ? +z.aire : limite.aire, joueurs: (JOUEURS[id] || JOUEURS.centre).slice() };
    if (typeof z.avertissement === 'string') out.avertissement = z.avertissement;
    if (Array.isArray(z.coffres)) out.coffres = z.coffres.filter((c) => Array.isArray(c) && fin(+c[0]) && fin(+c[1]) && typeof c[2] === 'string').map((c) => (typeof c[3] === 'string' ? [+c[0], +c[1], c[2], c[3]] : [+c[0], +c[1], c[2]]));
    if (Array.isArray(z.extractions)) out.extractions = z.extractions.filter((e) => e && fin(+e.x) && fin(+e.z)).map((e) => ({ id: String(e.id), nom: String(e.nom || ''), x: +e.x, z: +e.z, rayon: fin(+e.rayon) && e.rayon > 0 ? +e.rayon : EX_RAYON }));
    if (Array.isArray(z.depart) && fin(+z.depart[0]) && fin(+z.depart[1])) out.depart = [+z.depart[0], +z.depart[1]];
    if (monde) { monde.limite = limite; navDe(monde, null); } // la navigation aussi : monde.libre la lit (les caisses du mode tombent au même endroit que chez l'hôte)
    return out;
  }
  // la zone en JSON simple pour le réseau (la limite par son def ; arrondi au cm)
  function pourReseau(z) {
    if (!z || !z.limite) return null;
    const out = { id: z.id, nom: z.nom, limite: z.limite.def || z.limite, englobant: { centre: z.englobant.centre.map(r2), rayon: r2(z.englobant.rayon) },
      apparitions: z.apparitions.map((p) => [r2(p[0]), r2(p[1])]), objets: z.objets.map((o) => [r2(o[0]), r2(o[1]), o[2]]), aire: Math.round(z.aire) };
    if (z.coffres) out.coffres = z.coffres.map((c) => (c[3] ? [r2(c[0]), r2(c[1]), c[2], c[3]] : [r2(c[0]), r2(c[1]), c[2]])); // l'Extraction
    if (z.extractions) out.extractions = z.extractions.map((e) => ({ id: e.id, nom: e.nom, x: r2(e.x), z: r2(e.z), rayon: e.rayon }));
    if (z.depart) out.depart = [r2(z.depart[0]), r2(z.depart[1])];
    return out;
  }
  // la distance idéale de réapparition : clamp(0,32 · rayon englobant, 15, 60) m (35 m pour 'centre')
  const distanceReapparition = (z) => Math.max(15, Math.min(60, 0.32 * (z && z.englobant ? z.englobant.rayon : 110)));

  return { preparer, definition, adopter, pourReseau, distanceReapparition, extraction, IDS, NOMS, JOUEURS };
});
