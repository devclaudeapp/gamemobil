/* OPÉRATION PONCIN — la simulation d'une partie (autoritaire chez l'hôte) : déplacements (marche, accroupi, saut, gravité, marche de
   0,45 m, glissement le long des murs par monde.deplacer), blasters à peinture (cadence, chargeur, réserve, recharge, dispersion qui
   s'ouvre en mouvement et en l'air, recul, plombs de la pompe, chute de dégâts), tirs instantanés contre le monde (monde.rayon) et les
   capsules des joueurs (tête = 0,35 m du haut), vie et armure (qui absorbe 60 %), invincibilité après l'apparition (cesse au premier
   tir), objets à ramasser, aide à la visée au doigt. Les bots sont pilotés ici par PBOTS ; le mode (PARENE…) est un jeu de crochets.
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. Voir src-poncin/ARCHITECTURE.md (x à l'est, z au sud, y en haut ;
   yaw 0 = nord, positif vers l'ouest ; regard d = (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)).
   API (contrat) : PJEU.creer({ monde, mode, graine, options: { bots, niveau, equipes }, carte? }) → jeu ; jeu.ajouterJoueur(o) → entité ;
   jeu.etape(dt, entrees) → événements ; jeu.entites, jeu.temps, jeu.fini, jeu.classement(), jeu.aideVisee(id, force).
   En plus : jeu.carte (pour les zones du mode : passée à creer, ou monde.carte), jeu.monde, jeu.mode, jeu.options, jeu.nav (PNAV),
   jeu.duree / jeu.reste, jeu.finir(), jeu.trouver(id), jeu.retirerJoueur(id), jeu.ennemis(a, b), jeu.reapparaitre(e, evs) (pour le
   mode), jeu.erreurs / jeu.derniereErreur (un bot qui lève une erreur ne casse pas la partie), jeu.bruits (tirs et pas récents : l'ouïe
   des bots), jeu.budgetNav (requêtes de chemin encore permises dans l'image : 2 pour tous les bots).
   Le tableau d'événements rendu par etape est RÉUTILISÉ à l'image suivante (le copier pour le garder) ; les événements eux-mêmes sont neufs.
   Le hasard vient de deux mulberry32 tirés de la graine (jeu.rnd : tirs et mode ; jeu.rndBots : les bots) : même graine, mêmes entrées,
   même partie, à l'identique. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'), require('./nav.js'), require('./bots.js'));
  else root.PJEU = factory(root.PREGLES, root.PNAV, root.PBOTS);
})(typeof self !== 'undefined' ? self : this, function (REGLES, NAV, BOTS) {
  'use strict';
  const J = REGLES.JOUEUR;
  const DT_MAX = 1 / 20;              // une image ne simule jamais plus de 50 ms
  const R_CAPSULE = 0.4, TETE = 0.35; // la capsule touchable : rayon 0,4 m du pied à la taille ; la tête = les 35 derniers cm
  const ACCEL_SOL = 14, ACCEL_AIR = 2.2; // la vitesse rejoint la consigne (1/s) : vive au sol, peu de contrôle en l'air
  const ABSORBE = 0.6;                // l'armure absorbe 60 % des dégâts
  const CHANGE_ARME = 0.3;            // le temps de sortir une autre arme (s)
  const FOULEE = 1.7;                 // un « pas » (son) tous les 1,7 m au sol, debout
  const RAMASSE = 1.3;                // on ramasse un objet à 1,3 m
  const ECART = 0.7;                  // deux joueurs ne se superposent pas : ils se poussent doucement à moins de 0,7 m
  const GONFLE = { rafale: 0.22, pompe: 0.8, precision: 1 }; // l'ouverture du viseur par tir (retombe de 3,2/s), comme le HUD
  const PENTE_MAX = J.marche / 0.3;     // la pente la plus raide qu'on monte (une marche de 0,45 m sur 30 cm, ≈ 56°)
  const KICK = 0.6;                   // la part du recul de l'arme qui relève le regard
  const AIDE_CONE = 4 * Math.PI / 180, AIDE_DIST = 40, AIDE_MAX = 2.5 * Math.PI / 180, AIDE_SUR = 1.5 * Math.PI / 180, AIDE_RALENTIR = 0.4;
  const NB_BRUITS = 24;
  const PORTEE_AUTO = { pompe: 12 };   // le tir auto de la pompe s'arrête à sa portée utile ; les autres : min(portée, 60, 1,2 × fin de la chute)
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, a, b) => { v = +v; return fini(v) ? borne(v, a, b) : 0; };
  const angle = (a) => { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };
  const taille = (e) => (e.accroupi ? J.tailleAccroupi : J.taille);
  const oeil = (e) => (e.accroupi ? J.oeilAccroupi : J.oeil);
  const NEUTRE = Object.freeze({ avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null });

  // un mode minimal quand on n'en donne pas : réapparition au bout de 3 s sur un point libre, jamais de fin
  const MODE_LIBRE = {
    id: 'libre', nom: 'Libre',
    init() {}, surMort() {}, objets() { return VIDE; }, fini() { return false; }, resultat(jeu) { return { classement: jeu.classement(), gagnant: null, duree: jeu.temps }; },
    apparition(jeu) { const p = jeu.monde.libre(jeu.rnd); return [p[0], p[1], (jeu.rnd() * 2 - 1) * Math.PI]; },
    tick(jeu, dt, evs) { for (const e of jeu.entites) if (!e.vivant && jeu.temps - e.mortDepuis >= 3) jeu.reapparaitre(e, evs); },
  };
  const VIDE = [];

  // ─── la capsule d'une entité contre un rayon : t du premier contact (≤ tMax), ou −1 ───
  const CAP = { t: 0, y: 0 };
  function rayonCapsule(ox, oy, oz, dx, dy, dz, e, tMax) {
    const y0 = e.y + R_CAPSULE, y1 = e.y + taille(e) - R_CAPSULE, R2 = R_CAPSULE * R_CAPSULE;
    const px = ox - e.x, pz = oz - e.z;
    // dégrossi : la droite passe-t-elle à moins de R du fût (dans le plan) ?
    const a = dx * dx + dz * dz, b = px * dx + pz * dz, c = px * px + pz * pz - R2;
    let best = -1;
    if (a > 1e-12) {
      const disc = b * b - a * c; if (disc < 0) return -1;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= tMax) { const y = oy + dy * t; if (y >= y0 && y <= y1) { best = t; CAP.y = y; } }
      else if (t < 0 && c <= 0) { const y = oy; if (y >= y0 && y <= y1) { best = 0; CAP.y = y; } } // l'origine est dans le fût
    } else if (c > 0) return -1;
    // les deux demi-sphères
    for (let k = 0; k < 2; k++) {
      const cy = k ? y1 : y0, qy = oy - cy, bb = px * dx + qy * dy + pz * dz, cc = px * px + qy * qy + pz * pz - R2, disc = bb * bb - cc;
      if (disc < 0) continue;
      let t = -bb - Math.sqrt(disc); if (t < 0) { if (cc > 0) continue; t = 0; }
      if (t > tMax || (best >= 0 && t >= best)) continue;
      const y = oy + dy * t; if (k ? y < y1 - 1e-9 : y > y0 + 1e-9) continue; // la partie de la sphère hors du fût
      best = t; CAP.y = y;
    }
    if (best >= 0) CAP.t = best;
    return best;
  }

  // ─── le déplacement d'une entité selon son entrée (regard, marche, glissement contre les murs, pente, saut, gravité) ───
  // Fonction pure, partagée par la simulation (etape) et la prédiction du client en ligne : même entrée, même dt → même résultat.
  // L'entrée peut donner le regard en absolu (yaw, pitch : le client en ligne) ou en variation (dyaw, dpitch). Rend MV { dep, saut }.
  const MV = { dep: 0, saut: false };
  function deplacer(e, en, dt, monde) {
    MV.dep = 0; MV.saut = false;
    if (!en || typeof en !== 'object') en = NEUTRE;
    // le regard
    if (fini(en.yaw)) e.yaw = angle(en.yaw); else e.yaw = angle(e.yaw + num(en.dyaw, -Math.PI, Math.PI));
    if (fini(en.pitch)) e.pitch = borne(en.pitch, -1.45, 1.45); else e.pitch = borne(e.pitch + num(en.dpitch, -Math.PI, Math.PI), -1.45, 1.45);
    e.accroupi = !!en.accroupi;
    // la marche : consigne dans le repère du regard, rejointe en douceur
    let av = num(en.avant, -1, 1), co = num(en.cote, -1, 1); const l = Math.sqrt(av * av + co * co); if (l > 1) { av /= l; co /= l; }
    const vmax = e.accroupi ? J.vitesseAccroupi : J.vitesse; if (av < 0) av *= J.vitesseRecul;
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
    const cvx = (-sy * av + cy * co) * vmax, cvz = (-cy * av - sy * co) * vmax, k = Math.min(1, dt * (e.auSol ? ACCEL_SOL : ACCEL_AIR));
    e.vx += (cvx - e.vx) * k; e.vz += (cvz - e.vz) * k;
    const x0 = e.x, z0 = e.z;
    if (e.vx * e.vx + e.vz * e.vz > 1e-8) {
      const p = monde.deplacer(e.x, e.z, e.vx * dt, e.vz * dt, J.rayon), px = p[0] - e.x, pz = p[1] - e.z, pl = Math.sqrt(px * px + pz * pz);
      let ok = monde.hauteur(p[0], p[1]) - e.y <= J.marche; // plus haut qu'une marche d'un coup : on ne monte pas
      if (ok && pl > 1e-6 && monde.pente) { const g = monde.pente(p[0], p[1]); if ((g[0] * px + g[1] * pz) / pl > PENTE_MAX) ok = false; } // un talus plus raide qu'une marche de 0,45 m sur 30 cm
      if (ok) { e.x = p[0]; e.z = p[1]; }
    }
    const mx = e.x - x0, mz = e.z - z0, dep = Math.sqrt(mx * mx + mz * mz);
    if (e.auSol) { e.vx = mx / dt; e.vz = mz / dt; } // un mur a mangé une partie de l'élan
    e.vitesse = dep / dt;
    // saut et gravité ; au sol, on suit le relief (une pente qui descend trop vite : on tombe)
    const sol = monde.hauteur(e.x, e.z);
    if (en.saut && e.auSol) { e.vy = J.saut; e.auSol = false; MV.saut = true; }
    if (e.auSol) { if (sol < e.y - 0.6) { e.auSol = false; e.vy = 0; } else { e.y = sol; e.vy = 0; } }
    if (!e.auSol) {
      e.y += e.vy * dt - 0.5 * J.gravite * dt * dt; e.vy -= J.gravite * dt; // la parabole exacte : même saut à 30 ou 120 images/s
      if (e.y <= sol) { e.y = sol; e.vy = 0; e.auSol = true; }
    }
    MV.dep = dep;
    return MV;
  }
  function dispersionDe(e, A) { // l'écart du tir (rad) : l'arme, ×0,7 accroupi, + le mouvement et l'air, + l'ouverture des tirs précédents
    const mvt = Math.min(1, e.vitesse / J.vitesse) + (e.auSol ? 0 : 0.6);
    return A.dispersion * (e.accroupi ? 0.7 : 1) + (A.dispersionMouvement || 0) * mvt + e.gonfle * (A.recul || 0.02) * 1.6;
  }
  // un tir « pour l'image » (client en ligne : l'éclair et la traînée tout de suite, l'hôte décide des dégâts) : mêmes rayons que la
  // simulation (dispersion, plombs, monde puis capsules des ennemis vivants), événements « tir » dans out, aucun effet sur le jeu
  function tirVisuel(e, monde, entites, rnd, out) {
    const A = REGLES.arme(e.arme), disp = dispersionDe(e, A), o = e.accroupi ? J.oeilAccroupi : J.oeil;
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
        const t = rayonCapsule(ox, oy, oz, dx, dy, dz, c, tMax); if (t >= 0 && t < tMax) { tMax = t; cible = c; }
      }
      const fx = ox + dx * tMax, fy = oy + dy * tMax, fz = oz + dz * tMax;
      const impact = cible ? { x: fx, y: fy, z: fz, nx: -dx, ny: -dy, nz: -dz, quoi: 'entite', id: cible.id } : h ? { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, quoi: h.quoi } : null;
      out.push({ t: 'tir', id: e.id, arme: A.id, o: [ox, oy, oz], fin: [fx, fy, fz], impact, local: true });
    }
    return out;
  }

  // ─── l'instantané compact (le jeu en ligne : l'hôte l'envoie à 20 Hz) ───
  // { t, e: [[id, x, y, z, yaw, pitch, vie, armure, drapeaux, arme, kills, morts, points (+ pour les humains : m0, m1, m2, r0, r1, r2, recharge, ack)], …], o, r }
  // drapeaux : 1 vivant, 2 au sol, 4 accroupi, 8 invincible, 16 en recharge ; arme : indice dans ARMES_ID ; m / r : munitions et réserve par arme (−1 : pas
  // possédée) ; recharge : secondes restantes ; ack : numéro de la dernière entrée appliquée (réseau) ; o : '1' / '0' par objet du mode (disponible) ; r : reste (s).
  const ARMES_ID = ['rafale', 'pompe', 'precision'];
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  function ligneDe(e, temps, ack) {
    const fl = (e.vivant ? 1 : 0) | (e.auSol ? 2 : 0) | (e.accroupi ? 4 : 0) | (e.invincible > 0 ? 8 : 0) | (e.enRecharge ? 16 : 0);
    const l = [e.id, r2(e.x), r2(e.y), r2(e.z), r3(e.yaw), r3(e.pitch), Math.max(0, Math.round(e.vie)), Math.round(e.armure), fl, Math.max(0, ARMES_ID.indexOf(e.arme)), e.score.kills, e.score.morts, e.score.points];
    if (e.humain) {
      for (let i = 0; i < 3; i++) { const a = ARMES_ID[i]; l.push(e.armes.indexOf(a) >= 0 ? e.munitions[a] | 0 : -1); }
      for (let i = 0; i < 3; i++) { const a = ARMES_ID[i]; l.push(e.armes.indexOf(a) >= 0 ? e.reserve[a] | 0 : -1); }
      l.push(e.enRecharge ? r2(Math.max(0, e.rechargeJusqua - temps)) : 0, ack | 0);
    }
    return l;
  }
  // écrit une ligne d'instantané dans une entité : quoi = 'etat' (vie, scores, munitions…), 'corps' (position, regard, drapeaux, arme), ou 'tout'
  function lireLigne(l, e, temps, quoi) {
    if (!Array.isArray(l) || !e) return false;
    const fl = l[8] | 0;
    if (quoi !== 'etat') {
      if (fini(l[1]) && fini(l[2]) && fini(l[3])) { e.x = l[1]; e.y = l[2]; e.z = l[3]; }
      if (fini(l[4])) e.yaw = angle(l[4]); if (fini(l[5])) e.pitch = borne(l[5], -1.45, 1.45);
      e.vivant = !!(fl & 1); e.auSol = !!(fl & 2); e.accroupi = !!(fl & 4); e.invincible = fl & 8 ? 1 : 0;
      e.arme = ARMES_ID[l[9] | 0] || 'rafale';
    }
    if (quoi !== 'corps') {
      if (fini(l[6])) e.vie = l[6]; if (fini(l[7])) e.armure = l[7];
      e.score.kills = l[10] | 0; e.score.morts = l[11] | 0; e.score.points = l[12] | 0;
      if (l.length >= 21) {
        const armes = [];
        for (let i = 0; i < 3; i++) { const a = ARMES_ID[i], m = l[13 + i]; if (m >= 0) { armes.push(a); e.munitions[a] = m | 0; e.reserve[a] = Math.max(0, l[16 + i] | 0); } else { delete e.munitions[a]; delete e.reserve[a]; } }
        if (armes.length) e.armes = armes;
        e.enRecharge = !!(fl & 16); e.rechargeJusqua = e.enRecharge ? temps + (+l[19] || 0) : 0;
      }
    }
    return true;
  }

  function creer(params) {
    params = params || {};
    const monde = params.monde;
    if (!monde || typeof monde.deplacer !== 'function') throw new Error('PJEU.creer : il faut un monde (PMONDE.creer)');
    const o = params.options || {};
    const options = {
      bots: fini(+o.bots) ? Math.max(0, Math.min(REGLES.NOMS_BOTS.length, Math.round(+o.bots))) : REGLES.MODES.arene.bots.defaut || 4,
      niveau: REGLES.BOTS[o.niveau] ? o.niveau : 'normal', equipes: !!o.equipes,
    };
    let graine = params.graine;
    graine = fini(+graine) ? (+graine >>> 0) : REGLES.hash(String(graine));
    const mode = params.mode && typeof params.mode === 'object' ? params.mode : MODE_LIBRE;
    const reglesMode = REGLES.MODES[mode.id] || REGLES.MODES.arene;
    const entites = [], evs = [];
    const bruits = []; for (let k = 0; k < NB_BRUITS; k++) bruits.push({ n: 0, x: 0, z: 0, t: -1e9, e: null, portee: 0 });
    const CIBLES = [], DEGATS = [], TETES = []; // les touchés d'un tir (agrégés par cible : la pompe fait un seul « touche » par victime)
    let finDemandee = false;

    const jeu = {
      monde, mode, options, graine, carte: params.carte || o.carte || monde.carte || null, nav: null,
      entites, temps: 0, fini: false, duree: 0, image: 0, evenements: evs,
      rnd: REGLES.mulberry32(graine), rndBots: REGLES.mulberry32((graine ^ 0x9E3779B9) >>> 0),
      bruits, nBruits: 0, budgetNav: 2, erreurs: 0, derniereErreur: null,
      get reste() { return jeu.duree > 0 ? Math.max(0, jeu.duree - jeu.temps) : undefined; },
      ajouterJoueur, retirerJoueur, etape, classement, aideVisee, finir, trouver, ennemis, reapparaitre, resume,
      reglerRetard, retardDe, historique, instantane,
    };

    function trouver(id) { for (let i = 0; i < entites.length; i++) if (entites[i].id === id) return entites[i]; return null; }
    function ennemis(a, b) { return !!a && !!b && a !== b && a.equipe !== b.equipe; }
    function erreur(ou, err) { jeu.erreurs++; jeu.derniereErreur = ou + ' : ' + (err && err.message ? err.message : String(err)); }
    function faireBruit(e, portee) {
      const b = bruits[jeu.nBruits % NB_BRUITS]; jeu.nBruits++;
      b.n = jeu.nBruits; b.x = e.x; b.z = e.z; b.t = jeu.temps; b.e = e; b.portee = portee;
    }

    // ─── les joueurs ───
    function plusPetiteEquipe() { let a = 0, b = 0; for (const e of entites) { if (e.equipe === 0) a++; else if (e.equipe === 1) b++; } return b < a ? 1 : 0; }
    function ajouterJoueur(d) {
      d = d || {};
      const bot = d.bot === true || d.humain === false;
      let id = d.id != null && String(d.id) ? String(d.id) : (bot ? 'bot' : 'j') + (entites.length + 1);
      const deja = trouver(id); if (deja) return deja;
      const A = REGLES.arme('rafale');
      const e = {
        id, nom: String(d.nom || (bot ? 'Robot' : 'Joueur')).slice(0, 24), couleur: typeof d.couleur === 'string' ? d.couleur : REGLES.COULEURS[entites.length % REGLES.COULEURS.length],
        equipe: options.equipes ? (d.equipe === 0 || d.equipe === 1 ? d.equipe : plusPetiteEquipe()) : id,
        humain: !bot, bot, niveau: bot ? (REGLES.BOTS[d.niveau] ? d.niveau : options.niveau) : null,
        x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, vitesse: 0, yaw: 0, pitch: 0, auSol: true, accroupi: false,
        vie: J.vie, armure: 0, vivant: true, mortDepuis: -1, apparuA: 0, invincible: 0,
        arme: 'rafale', armes: ['rafale'], munitions: { rafale: A.chargeur }, reserve: { rafale: A.reserve }, rechargeJusqua: 0, enRecharge: false, prochainTir: 0,
        score: { kills: 0, morts: 0, points: 0 }, serie: 0,
        dispersion: A.dispersion, gonfle: 0, dernierTir: -1, toucheA: -1, parQui: null, tueTete: false, foulee: 0, ia: null,
      };
      entites.push(e);
      placer(e);
      return e;
    }
    function retirerJoueur(id) { // vraiment : hors du jeu, hors des cibles et de la mémoire des robots, hors des bruits
      const i = entites.findIndex((e) => e.id === id); if (i < 0) return false;
      const e = entites[i]; entites.splice(i, 1);
      e.vivant = false; e.retire = true; HIST.delete(e); retards.delete(id);
      for (const b of entites) {
        if (b.parQui === id) b.parQui = null;
        const ia = b.ia; if (!ia) continue;
        if (ia.cible === e) { ia.cible = null; ia.vuA = -1e9; ia.alerteA = -1e9; ia.retourne = false; ia.fouilleA = -1; }
        if (ia.proie === e) { ia.proie = null; ia.chemin = null; ia.veut = false; }
        if (ia.agresseur === e) ia.agresseur = null;
      }
      for (let k = 0; k < bruits.length; k++) if (bruits[k].e === e) bruits[k].e = null;
      return true;
    }
    function placer(e) { // au point que choisit le mode (vérifié : libre, dans le carré), sinon un point libre
      let p = null;
      try { p = mode.apparition ? mode.apparition(jeu, e) : null; } catch (err) { erreur('mode.apparition', err); p = null; }
      if (!p || !fini(+p[0]) || !fini(+p[1]) || monde.bloque(+p[0], +p[1], J.rayon)) { const q = monde.libre(jeu.rnd); p = [q[0], q[1], (jeu.rnd() * 2 - 1) * Math.PI]; }
      e.x = +p[0]; e.z = +p[1]; e.y = monde.hauteur(e.x, e.z); e.yaw = fini(+p[2]) ? angle(+p[2]) : 0; e.pitch = 0;
      e.vx = e.vz = e.vy = 0; e.vitesse = 0; e.auSol = true; e.accroupi = false;
      e.vie = J.vie; e.armure = 0; e.vivant = true; e.apparuA = jeu.temps; e.invincible = reglesMode.invincible || 0;
      const A = REGLES.arme('rafale');
      e.arme = 'rafale'; e.armes = ['rafale']; e.munitions = { rafale: A.chargeur }; e.reserve = { rafale: A.reserve };
      e.rechargeJusqua = 0; e.enRecharge = false; e.prochainTir = jeu.temps + 0.2; e.gonfle = 0; e.dispersion = A.dispersion; e.foulee = 0; e.tueTete = false;
    }
    function reapparaitre(e, out) { placer(e); (out || evs).push({ t: 'reapparition', id: e.id }); }

    // ─── l'historique des positions (≈ 1 s) et la compensation de latence par tireur (jeu en ligne) ───
    // jeu.reglerRetard(id, s) : les tirs de id voient les autres comme il y a s secondes (borné à 0,25 s) ; l'hôte le règle d'après le ping.
    const NH = 72, H_PAS = 1 / 70, HIST = new Map(), retards = new Map();
    const SAUVE = { x: [], y: [], z: [], a: [], ent: [], n: 0 };
    function noter() { // une entrée par entité, au plus 70 par seconde
      for (let k = 0; k < entites.length; k++) {
        const e = entites[k]; let h = HIST.get(e);
        if (!h) { h = { t: new Float64Array(NH), x: new Float64Array(NH), y: new Float64Array(NH), z: new Float64Array(NH), f: new Uint8Array(NH), i: -1, n: 0 }; HIST.set(e, h); }
        if (h.n && jeu.temps - h.t[h.i] < H_PAS) continue;
        h.i = (h.i + 1) % NH; if (h.n < NH) h.n++;
        h.t[h.i] = jeu.temps; h.x[h.i] = e.x; h.y[h.i] = e.y; h.z[h.i] = e.z; h.f[h.i] = (e.vivant ? 1 : 0) | (e.accroupi ? 2 : 0);
      }
    }
    const POS = { x: 0, y: 0, z: 0, accroupi: false, vivant: false };
    function historique(qui, t) { // la position (interpolée) d'une entité au temps t, ou null si l'historique ne remonte pas jusque-là
      const e = typeof qui === 'string' ? trouver(qui) : qui, h = e && HIST.get(e); if (!h || !h.n) return null;
      let j = h.i;
      for (let k = 0; k < h.n; k++) {
        if (h.t[j] <= t) {
          const s = (j + 1) % NH, suivant = k > 0; // l'entrée d'après (plus récente), s'il y en a une
          let u = 0; if (suivant && h.t[s] > h.t[j]) u = Math.min(1, (t - h.t[j]) / (h.t[s] - h.t[j]));
          if (suivant && Math.abs(h.x[s] - h.x[j]) + Math.abs(h.z[s] - h.z[j]) > 4) u = u < 0.5 ? 0 : 1; // une téléportation : pas de milieu
          const a = u >= 1 ? s : j;
          POS.x = h.x[j] + (suivant ? (h.x[s] - h.x[j]) * u : 0); POS.y = h.y[j] + (suivant ? (h.y[s] - h.y[j]) * u : 0); POS.z = h.z[j] + (suivant ? (h.z[s] - h.z[j]) * u : 0);
          POS.vivant = !!(h.f[a] & 1); POS.accroupi = !!(h.f[a] & 2);
          return POS;
        }
        j = (j - 1 + NH) % NH;
      }
      return null;
    }
    function reglerRetard(id, s) { s = num(s, 0, 0.25); if (s > 0) retards.set(String(id), s); else retards.delete(String(id)); return s; }
    function retardDe(id) { return retards.get(String(id)) || 0; }
    function rembobiner(tireur) {
      const r = retards.size ? retards.get(tireur.id) : 0; if (!r) return false;
      const t = jeu.temps - r; SAUVE.n = 0;
      for (let k = 0; k < entites.length; k++) {
        const c = entites[k]; if (c === tireur || !c.vivant) continue;
        const p = historique(c, t); if (!p) continue;
        const n = SAUVE.n++; SAUVE.ent[n] = c; SAUVE.x[n] = c.x; SAUVE.y[n] = c.y; SAUVE.z[n] = c.z; SAUVE.a[n] = c.accroupi;
        if (p.vivant) { c.x = p.x; c.y = p.y; c.z = p.z; c.accroupi = p.accroupi; }
        else { c.x = 1e7; c.z = 1e7; } // pas encore réapparu à ce moment-là : intouchable pour ce tir
      }
      return SAUVE.n > 0;
    }
    function restaurer() { for (let n = 0; n < SAUVE.n; n++) { const c = SAUVE.ent[n]; c.x = SAUVE.x[n]; c.y = SAUVE.y[n]; c.z = SAUVE.z[n]; c.accroupi = SAUVE.a[n]; SAUVE.ent[n] = null; } SAUVE.n = 0; }

    // ─── l'instantané compact de la partie (voir ligneDe) ; acks : { id: numéro de la dernière entrée appliquée } ───
    function instantane(acks) {
      const e = new Array(entites.length);
      for (let k = 0; k < entites.length; k++) e[k] = ligneDe(entites[k], jeu.temps, acks ? acks[entites[k].id] : 0);
      let o = ''; let objs = null; try { objs = mode.objets ? mode.objets(jeu) : null; } catch (err) { objs = null; }
      if (objs) for (let i = 0; i < objs.length; i++) o += objs[i].dispo ? '1' : '0';
      return { t: r3(jeu.temps), e, o, r: jeu.duree > 0 ? r2(Math.max(0, jeu.duree - jeu.temps)) : -1, f: jeu.fini ? 1 : 0 };
    }

    // ─── les armes ───
    function changerArme(e, id) {
      if (e.arme === id) return;
      e.arme = id; e.enRecharge = false; e.rechargeJusqua = 0; e.prochainTir = Math.max(e.prochainTir, jeu.temps + CHANGE_ARME);
    }
    function lacherArme(e, id) { // une arme vide de tout (chargeur et réserve) : on la lâche et on reprend le blaster
      if (id === 'rafale') return;
      const i = e.armes.indexOf(id); if (i >= 0) e.armes.splice(i, 1);
      delete e.munitions[id]; delete e.reserve[id];
      if (e.arme === id) changerArme(e, 'rafale');
    }
    function commencerRecharge(e, out) {
      if (e.enRecharge) return;
      const A = REGLES.arme(e.arme), m = e.munitions[e.arme] | 0;
      if (m >= A.chargeur) return;
      if ((e.reserve[e.arme] | 0) <= 0 && e.arme !== 'rafale') { if (m <= 0) lacherArme(e, e.arme); return; } // le blaster rafale, lui, ne tombe jamais en panne
      e.enRecharge = true; e.rechargeJusqua = jeu.temps + A.recharge;
      out.push({ t: 'recharge', id: e.id });
    }
    function finirRecharge(e) {
      e.enRecharge = false;
      const A = REGLES.arme(e.arme), m = e.munitions[e.arme] | 0, res = e.reserve[e.arme] | 0, manque = A.chargeur - m;
      const n = e.arme === 'rafale' ? manque : Math.min(manque, res); // réserve de secours du blaster de base
      e.munitions[e.arme] = m + n; e.reserve[e.arme] = e.arme === 'rafale' ? Math.max(A.chargeur, res - n) : Math.max(0, res - n); // le blaster ne tombe jamais sous un chargeur de réserve (il recharge à l'infini)
    }

    // ─── un tir : un rayon par plomb, depuis l'œil, contre le monde puis les capsules ───
    function tirer(e, dt, out) {
      const A = REGLES.arme(e.arme), T = jeu.temps;
      const m = e.munitions[e.arme] | 0;
      if (m <= 0) { commencerRecharge(e, out); return; }
      e.munitions[e.arme] = m - 1;
      e.prochainTir = (e.prochainTir > T - dt ? e.prochainTir : T) + 1 / A.cadence; // cadence exacte quelle que soit l'image
      e.invincible = 0; e.dernierTir = T;
      const rnd = jeu.rnd, disp = dispersionDe(e, A);
      const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw), sp = Math.sin(e.pitch), cp = Math.cos(e.pitch);
      const d0x = -sy * cp, d0y = sp, d0z = -cy * cp;             // le regard
      const rx = cy, rz = -sy;                                      // la droite
      const ux = sy * sp, uy = cp, uz = cy * sp;                    // le haut de l'écran
      const ox = e.x, oy = e.y + oeil(e), oz = e.z;
      const rembobine = rembobiner(e); // compensation de latence (jeu en ligne) : les autres là où le tireur les voyait
      let nc = 0;
      for (let p = 0; p < A.plombs; p++) {
        const r = disp * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI, da = Math.tan(r) * Math.cos(a), db = Math.tan(r) * Math.sin(a);
        let dx = d0x + rx * da + ux * db, dy = d0y + uy * db, dz = d0z + rz * da + uz * db;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
        const h = monde.rayon(ox, oy, oz, dx, dy, dz, A.portee);
        let tMax = h ? h.t : A.portee, cible = null, ty = 0;
        for (let k = 0; k < entites.length; k++) {
          const c = entites[k]; if (!c.vivant || !ennemis(e, c)) continue;
          const ddx = c.x - ox, ddz = c.z - oz; if (ddx * ddx + ddz * ddz > (tMax + 1) * (tMax + 1)) continue;
          const t = rayonCapsule(ox, oy, oz, dx, dy, dz, c, tMax);
          if (t >= 0 && t < tMax) { tMax = t; cible = c; ty = CAP.y; }
        }
        const fx = ox + dx * tMax, fy = oy + dy * tMax, fz = oz + dz * tMax;
        let impact = null;
        if (cible) {
          const ay = borne(ty, cible.y + R_CAPSULE, cible.y + taille(cible) - R_CAPSULE), nx = fx - cible.x, ny = fy - ay, nz = fz - cible.z, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          impact = { x: fx, y: fy, z: fz, nx: nx / nl, ny: ny / nl, nz: nz / nl, quoi: 'entite', id: cible.id };
          const tete = ty >= cible.y + taille(cible) - TETE, deg = REGLES.degatsA(A, tMax, tete);
          let i = 0; while (i < nc && CIBLES[i] !== cible) i++;
          if (i === nc) { CIBLES[nc] = cible; DEGATS[nc] = 0; TETES[nc] = false; nc++; }
          DEGATS[i] += deg; if (tete) TETES[i] = true;
        } else if (h) impact = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, quoi: h.quoi };
        out.push({ t: 'tir', id: e.id, arme: A.id, o: [ox, oy, oz], fin: [fx, fy, fz], impact });
      }
      if (rembobine) restaurer();
      // le recul : le viseur s'ouvre, le regard se relève un peu
      e.gonfle = Math.min(1, e.gonfle + (GONFLE[A.id] != null ? GONFLE[A.id] : 0.3));
      e.pitch = borne(e.pitch + (A.recul || 0) * KICK * (0.7 + 0.3 * rnd()), -1.45, 1.45);
      e.yaw = angle(e.yaw + (A.recul || 0) * KICK * 0.35 * (rnd() * 2 - 1));
      faireBruit(e, 30);
      for (let i = 0; i < nc; i++) { const c = CIBLES[i]; CIBLES[i] = null; blesser(c, e, DEGATS[i], TETES[i], A.id, out); }
    }
    function blesser(c, de, degats, tete, armeId, out) {
      if (!c.vivant || !(degats > 0) || c.invincible > 0) return; // protégé juste après l'apparition
      const abs = Math.min(c.armure, Math.round(degats * ABSORBE));
      c.armure -= abs; c.vie -= degats - abs; c.toucheA = jeu.temps; c.parQui = de ? de.id : null;
      const mort = c.vie <= 0;
      out.push({ t: 'touche', de: de ? de.id : null, a: c.id, degats, tete: !!tete, mort });
      if (mort) tuer(c, de, armeId, tete, out);
    }
    function tuer(v, k, armeId, tete, out) {
      v.vie = 0; v.vivant = false; v.mortDepuis = jeu.temps; v.vx = v.vz = v.vy = 0; v.vitesse = 0; v.enRecharge = false; v.rechargeJusqua = 0;
      v.score.morts++; v.serie = 0; v.tueTete = !!tete;
      if (k && k !== v) { k.score.kills++; k.serie++; }
      out.push({ t: 'mort', a: v.id, par: k ? k.id : null, arme: armeId, tete: !!tete });
      if (mode.surMort) { try { mode.surMort(jeu, v, k, out); } catch (err) { erreur('mode.surMort', err); } }
    }

    // ─── une entité joue son entrée ───
    function appliquer(e, en, dt, out) {
      const T = jeu.temps;
      const mv = deplacer(e, en, dt, monde), dep = mv.dep;
      if (mv.saut) out.push({ t: 'saut', id: e.id });
      // les pas (debout seulement : accroupi, on est discret)
      if (e.auSol && !e.accroupi && dep > 0) { e.foulee += dep; if (e.foulee >= FOULEE) { e.foulee -= FOULEE; out.push({ t: 'pas', id: e.id }); faireBruit(e, 10); } }
      // les armes
      if (en.arme && en.arme !== e.arme && e.armes.indexOf(en.arme) >= 0) changerArme(e, en.arme);
      if (e.enRecharge && T >= e.rechargeJusqua) finirRecharge(e);
      if (en.recharge) commencerRecharge(e, out);
      if (en.tir && !e.enRecharge && T >= e.prochainTir) tirer(e, dt, out);
      else if (!e.enRecharge && (e.munitions[e.arme] | 0) <= 0 && T >= e.prochainTir) commencerRecharge(e, out); // chargeur vide : on recharge tout seul
      e.gonfle = Math.max(0, e.gonfle - 3.2 * dt);
      if (e.invincible > 0) e.invincible = Math.max(0, e.invincible - dt);
      e.dispersion = dispersionDe(e, REGLES.arme(e.arme));
    }

    // deux joueurs vivants ne se superposent pas (poussée douce, par le monde : jamais dans un mur)
    function separer() {
      for (let i = 0; i < entites.length; i++) {
        const a = entites[i]; if (!a.vivant) continue;
        for (let j = i + 1; j < entites.length; j++) {
          const b = entites[j]; if (!b.vivant || Math.abs(a.y - b.y) > 1.6) continue;
          let dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz; if (d2 >= ECART * ECART) continue;
          let d = Math.sqrt(d2); if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; } else { dx /= d; dz /= d; }
          const m = (ECART - d) * 0.5;
          const pa = monde.deplacer(a.x, a.z, -dx * m, -dz * m, J.rayon); a.x = pa[0]; a.z = pa[1];
          const pb = monde.deplacer(b.x, b.z, dx * m, dz * m, J.rayon); b.x = pb[0]; b.z = pb[1];
          if (a.auSol) a.y = monde.hauteur(a.x, a.z); if (b.auSol) b.y = monde.hauteur(b.x, b.z);
        }
      }
    }

    // ─── les objets du mode : ramassés au passage s'ils servent, de retour au bout de « retour » secondes ───
    function utile(e, nom) {
      const O = REGLES.OBJETS[nom]; if (!O) return false;
      if (O.type === 'soin') return e.vie < J.vie;
      if (O.type === 'armure') return e.armure < J.armureMax;
      if (O.type === 'arme') { const A = REGLES.arme(O.arme); return e.armes.indexOf(O.arme) < 0 || (e.munitions[O.arme] | 0) < A.chargeur || (e.reserve[O.arme] | 0) < A.reserve; }
      return false;
    }
    function prendre(e, nom) {
      const O = REGLES.OBJETS[nom];
      if (O.type === 'soin') e.vie = Math.min(J.vie, e.vie + O.vie);
      else if (O.type === 'armure') e.armure = Math.min(J.armureMax, e.armure + O.armure);
      else if (O.type === 'arme') {
        const A = REGLES.arme(O.arme), neuve = e.armes.indexOf(O.arme) < 0;
        if (neuve) e.armes.push(O.arme);
        e.munitions[O.arme] = A.chargeur; e.reserve[O.arme] = Math.max(e.reserve[O.arme] | 0, A.reserve);
        if (neuve) changerArme(e, O.arme); // une arme neuve passe en main
        else if (e.arme === O.arme && e.enRecharge) { e.enRecharge = false; e.rechargeJusqua = 0; }
      }
    }
    function ramasser(out) {
      let objs = null;
      try { objs = mode.objets ? mode.objets(jeu) : null; } catch (err) { erreur('mode.objets', err); objs = null; }
      if (!objs) return;
      for (let i = 0; i < objs.length; i++) {
        const ob = objs[i];
        if (!ob.dispo) { if (ob.revient > 0 && jeu.temps >= ob.revient) { ob.dispo = true; ob.revient = 0; } continue; }
        if (ob.y == null) ob.y = monde.hauteur(ob.x, ob.z);
        for (let k = 0; k < entites.length; k++) {
          const e = entites[k]; if (!e.vivant) continue;
          const dx = e.x - ob.x, dz = e.z - ob.z; if (dx * dx + dz * dz > RAMASSE * RAMASSE || Math.abs(e.y - ob.y) > 2.2 || !utile(e, ob.objet)) continue;
          prendre(e, ob.objet); ob.dispo = false; ob.revient = jeu.temps + ((REGLES.OBJETS[ob.objet] || {}).retour || 20);
          out.push({ t: 'ramasse', id: e.id, objet: ob.objet, oid: ob.id });
          break;
        }
      }
    }

    // ─── une image ───
    function etape(dt, entrees) {
      evs.length = 0;
      if (jeu.fini) return evs;
      dt = +dt; if (!(dt > 0)) return evs; if (dt > DT_MAX) dt = DT_MAX;
      jeu.temps += dt; jeu.image++; jeu.budgetNav = 2;
      const n = entites.length;
      for (let k = 0; k < n; k++) {
        const e = entites[(k + jeu.image) % n]; // l'ordre tourne : personne ne tire toujours le premier
        if (!e.vivant) continue;
        let en = null;
        if (e.bot) { if (BOTS) { try { en = BOTS.penser(e, jeu, dt, jeu.rndBots); } catch (err) { erreur('bot ' + e.id, err); en = null; } } }
        else en = entrees ? entrees[e.id] : null;
        appliquer(e, en && typeof en === 'object' ? en : NEUTRE, dt, evs);
      }
      separer();
      ramasser(evs);
      if (mode.tick) { try { mode.tick(jeu, dt, evs); } catch (err) { erreur('mode.tick', err); } }
      noter();
      let fin = finDemandee;
      if (!fin && mode.fini) { try { fin = !!mode.fini(jeu); } catch (err) { erreur('mode.fini', err); } }
      if (fin) { jeu.fini = true; evs.push({ t: 'fin', classement: resume() }); }
      return evs;
    }
    function finir() { finDemandee = true; }

    // ─── le classement : les repeints (le critère de fin de l'Arène), départagés par les points, puis le moins de morts ; à égalité
    // parfaite, les humains devant les robots ───
    const parScore = (a, b) => b.score.kills - a.score.kills || b.score.points - a.score.points || a.score.morts - b.score.morts || (a.bot === b.bot ? 0 : a.bot ? 1 : -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    function classement() { return entites.slice().sort(parScore); }
    function resume() { return classement().map((e) => ({ id: e.id, nom: e.nom, couleur: e.couleur, equipe: e.equipe, bot: e.bot, humain: e.humain, kills: e.score.kills, morts: e.score.morts, points: e.score.points })); }

    // ─── l'aide à la visée (humains au doigt) : ralentit et aimante doucement près d'une cible, dit si le viseur est dessus ───
    const AIDE = { dyaw: 0, dpitch: 0, surCible: false, ralentir: 0, cible: null };
    function aideVisee(id, force) {
      AIDE.dyaw = 0; AIDE.dpitch = 0; AIDE.surCible = false; AIDE.ralentir = 0; AIDE.cible = null;
      const e = trouver(id); if (!e || !e.vivant || e.bot || jeu.fini) return AIDE;
      force = num(force, 0, 1);
      const A = REGLES.arme(e.arme), ox = e.x, oy = e.y + oeil(e), oz = e.z;
      const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw), sp = Math.sin(e.pitch), cp = Math.cos(e.pitch), dx = -sy * cp, dy = sp, dz = -cy * cp;
      const porteeSur = PORTEE_AUTO[A.id] || Math.min(A.portee, 60, A.chute[1] * 1.2); // le tir auto seulement là où l'arme sert (la pompe à 18 m ne fait plus que 3 à 6 dégâts)
      let best = null, bestAng = AIDE_CONE, bestD = 0, bestY = 0;
      for (let k = 0; k < entites.length; k++) {
        const c = entites[k]; if (!c.vivant || !ennemis(e, c) || c.invincible > 0) continue;
        const vx = c.x - ox, vz = c.z - oz, hz = Math.sqrt(vx * vx + vz * vz); if (hz > Math.max(porteeSur, AIDE_DIST) + 1) continue;
        // le point de l'axe de la capsule le plus proche du regard (dans le plan vertical de la cible)
        const h = taille(c), proj = (vx * dx + vz * dz) / Math.max(1e-6, dx * dx + dz * dz);
        const yAxe = borne(oy + dy * Math.max(0, proj), c.y + 0.3, c.y + h - 0.12), vy = yAxe - oy, dist = Math.sqrt(hz * hz + vy * vy);
        const cosA = (vx * dx + vy * dy + vz * dz) / Math.max(1e-6, dist), ecart = Math.acos(borne(cosA, -1, 1)) - Math.atan(R_CAPSULE / Math.max(0.5, dist));
        if (!AIDE.surCible && ecart <= AIDE_SUR && dist <= porteeSur && monde.vue(ox, oy, oz, c.x, yAxe, c.z)) { AIDE.surCible = true; AIDE.cible = c.id; }
        // l'aimant vise la poitrine
        if (dist > AIDE_DIST || force <= 0) continue;
        const yc = c.y + h * 0.62, wy = yc - oy, dc = Math.sqrt(hz * hz + wy * wy), a = Math.acos(borne((vx * dx + wy * dy + vz * dz) / Math.max(1e-6, dc), -1, 1));
        if (a < bestAng && monde.vue(ox, oy, oz, c.x, yc, c.z)) { best = c; bestAng = a; bestD = dc; bestY = yc; }
      }
      if (best) {
        const vx = best.x - ox, vz = best.z - oz, ty = Math.atan2(-vx, -vz), tp = Math.atan2(bestY - oy, Math.sqrt(vx * vx + vz * vz));
        let gy = angle(ty - e.yaw), gp = tp - e.pitch; const g = Math.sqrt(gy * gy + gp * gp), max = AIDE_MAX * Math.max(0, 1 - bestD / 50) * force;
        if (g > max && g > 0) { gy *= max / g; gp *= max / g; }
        AIDE.dyaw = gy; AIDE.dpitch = gp; AIDE.ralentir = AIDE_RALENTIR * force;
        if (!AIDE.cible) AIDE.cible = best.id;
      }
      return AIDE;
    }

    // ─── la mise en place : le mode (zones, bots), puis la navigation des bots sur la zone jouée ───
    try { if (mode.init) mode.init(jeu); } catch (err) { erreur('mode.init', err); }
    if (!jeu.duree && reglesMode && mode !== MODE_LIBRE) jeu.duree = reglesMode.duree || 0;
    if (NAV && params.nav !== false && typeof monde.passe === 'function') { try { jeu.nav = NAV.creer(monde, { pas: 1.5, marge: 0.45 }); } catch (err) { erreur('nav', err); jeu.nav = null; } }
    return jeu;
  }

  return { creer, rayonCapsule, deplacer, dispersion: dispersionDe, tirVisuel, ligneDe, lireLigne, ARMES_ID, PORTEE_AUTO, DT_MAX, R_CAPSULE, TETE };
});
