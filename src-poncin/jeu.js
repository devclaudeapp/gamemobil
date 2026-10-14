/* OPÉRATION PONCIN — la simulation d'une partie (autoritaire chez l'hôte) : déplacements et postures (marche, course, accroupi,
   glissade, couché, saut, gravité, marche de 0,45 m, glissement le long des murs par monde.deplacer), vraies armes à deux emplacements
   (cadence, chargeur, réserve, recharge, visée, dispersion qui s'ouvre en mouvement et en l'air, recul, plombs de la pompe, chute de
   dégâts), tirs instantanés contre le monde (monde.rayon) et les capsules des joueurs (par posture ; la tête en haut), vie et armure
   (qui absorbe 60 %), invincibilité après l'apparition (cesse au premier tir), objets à ramasser, aide à la visée au doigt. Les bots
   sont pilotés ici par PBOTS ; le mode (PARENE…) est un jeu de crochets.
   Régime v2 pour tous (livraison 2) : chaque entité est équipée (e.equip = { p, s }, PARMES.equiper) et chaque entrée est jouée en v2
   (une entrée sans les niveaux course / couche / vise les reçoit à false : plus aucun chemin du jeu ne prend le régime historique).
   Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. Voir src-poncin/ARCHITECTURE.md (x à l'est, z au sud, y en haut ;
   yaw 0 = nord, positif vers l'ouest ; regard d = (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)).
   Le corps (déplacement, postures, capsules, caméra) est dans corps.js (PCORPS), les armes (tir, recharge, changement, visée) dans
   armes.js (PARMES) : PJEU.deplacer, PJEU.dispersion et PJEU.tirVisuel en sont des alias.
   API (contrat) : PJEU.creer({ monde, mode, graine, options: { bots, niveau, equipes, armes, objets }, carte? }) → jeu ;
   jeu.ajouterJoueur({ id, nom, couleur, equipe, humain | bot, niveau, equip }) → entité (equip { p, s } ou 'p+s', validé par
   PREGLES.equipementDe contre options.armes ; sans lui, l'équipement par défaut permis) ;
   jeu.etape(dt, entrees) → événements ; jeu.entites, jeu.temps, jeu.fini, jeu.classement(), jeu.aideVisee(id, force).
   En plus : jeu.carte (pour les zones du mode : passée à creer, ou monde.carte), jeu.monde, jeu.mode, jeu.options, jeu.nav (PNAV),
   jeu.duree / jeu.reste, jeu.finir(), jeu.trouver(id), jeu.retirerJoueur(id), jeu.ennemis(a, b), jeu.reapparaitre(e, evs) (pour le
   mode), jeu.erreurs / jeu.derniereErreur (un bot qui lève une erreur ne casse pas la partie), jeu.bruits (tirs et pas récents : l'ouïe
   des bots), jeu.budgetNav (requêtes de chemin encore permises dans l'image : 2 pour tous les bots).
   Le tableau d'événements rendu par etape est RÉUTILISÉ à l'image suivante (le copier pour le garder) ; les événements eux-mêmes sont neufs.
   Le hasard vient de deux mulberry32 tirés de la graine (jeu.rnd : tirs et mode ; jeu.rndBots : les bots) : même graine, mêmes entrées,
   même partie, à l'identique.
   Entité v2 (lot Gameplay, § 3) : posture, vers, transition, oeil, hautCapsule, course, gv / gdx / gdz, relanceA, receptionA, remonte,
   vise, viseStable, accroupiPrec, couchePrec, corpsV2, ax / ay / az / aoeil (la position au début du pas : le rendu interpole entre
   elle et la position), armes / slot / equip / changeJusqua ; e.accroupi reste (posture ≠ 'debout').
   Événements de tir pour le rendu (impacts, traceurs, douilles) : voir PARMES.tirer (point, normale, quoi, mat, arme).
   PJEU.pasFixe({ pas: 1/60, max: 4 }) → { avancer(dtImage, fnPas) → alpha, remettre() } : la boucle à pas fixe (§ 2), pure.
   Livraison 3 « Le salon » : les options SONT les réglages normalisés (jeu.reglages === jeu.options = PREGLES.normaliserReglages(options,
   { humains }) ; humains : params.humains, 0 par défaut, pour borner les robots à 6 − humains) :
   - la zone (mode.zones vrai, PARENE) : jeu.zone = params.zone (reçue : PZONES.adopter) ou PZONES.preparer(carte, monde, null,
     reglages.zone, mulberry32(graine ^ 0x2F6E2B1), reglages), AVANT mode.init (qui y lit apparitions et objets) ; monde.limite = zone.limite ;
   - la vie : jeu.vieMax, jeu.armureMax (SALON.vies[vie] : normale 100 / 50, unCoup 1 / 0, costaud 200 / 100) ;
   - jeu.peutBlesser(a, b) = a ≠ b et (équipes différentes ou tirAllie) : PARMES ne touche que là ; repeindre un équipier coûte 100 points
     et ne compte pas de repeint ('mort' porte allie: true) ; jeu.treve (vrai entre deux manches) : personne n'est blessé ;
   - l'aide (reglages.aide faux) : aideVisee ne ralentit ni n'aimante plus (permise: false ; surCible reste, pour le viseur rouge) ;
   - l'heure et la météo : jeu.visibilite (m, la vue des robots : 25 la nuit, 30 dans le brouillard, Infinity sinon), jeu.visibiliteLampe
     (45 m la nuit, 30 dans le brouillard : une cible dont la lampe éclaire le robot à ±35° se voit jusque-là), jeu.lampes (la nuit :
     e.lampe vrai pour tous, drapeau 1024) ;
   - params.robots (ou options.robots) : [{ id, nom, couleur, equipe, equip, niveau }], les robots listés par l'hôte (message 'lancer') :
     le mode les ajoute tels quels au lieu de les tirer au sort ;
   - jeu.duree (0 : sans limite, jeu.reste undefined), jeu.debutChrono (le chrono d'une manche part de là), jeu.manche (« dernier
     debout », PARENE) ; crochet de mode apresNav(jeu), appelé une fois la navigation construite. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'), require('./nav.js'), require('./bots.js'), require('./corps.js'), require('./armes.js'), require('./zones.js'));
  else root.PJEU = factory(root.PREGLES, root.PNAV, root.PBOTS, root.PCORPS, root.PARMES, root.PZONES);
})(typeof self !== 'undefined' ? self : this, function (REGLES, NAV, BOTS, CORPS, ARMES, ZONES) {
  'use strict';
  const J = REGLES.JOUEUR;
  const DT_MAX = 1 / 20;              // une image ne simule jamais plus de 50 ms
  const R_CAPSULE = CORPS.R_CAPSULE, TETE = CORPS.TETE; // la capsule touchable debout : rayon 0,4 m ; la tête = les 35 derniers cm
  const ABSORBE = 0.6;                // l'armure absorbe 60 % des dégâts
  const FOULEE = 1.7;                 // un « pas » (son) tous les 1,7 m au sol, debout
  const RAMASSE = 1.3;                // on ramasse un objet à 1,3 m
  const ECART = 0.7;                  // deux joueurs ne se superposent pas : ils se poussent doucement à moins de 0,7 m
  const AIDE_CONE = 4 * Math.PI / 180, AIDE_DIST = 40, AIDE_MAX = 2.5 * Math.PI / 180, AIDE_SUR = 1.5 * Math.PI / 180, AIDE_RALENTIR = 0.4;
  const NB_BRUITS = 24;
  const PENALITE_ALLIE = 100;          // repeindre un équipier (tir allié) : −100 points, pas de repeint
  // la vue des robots selon l'heure et la météo (conception § 8) : { vue, lampe } en m
  function visibiliteDe(heure, meteo) {
    let vue = Infinity, lampe = 0;
    if (heure === 'nuit') { vue = 25; lampe = 45; }
    if (meteo === 'brouillard') { vue = Math.min(vue, 30); if (lampe) lampe = 30; }
    return { vue, lampe };
  }
  const PORTEE_AUTO = { pompe: 12 };   // le tir auto de la pompe s'arrête à sa portée utile ; les autres : min(portée, 60, 1,2 × fin de la chute)
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, a, b) => { v = +v; return fini(v) ? borne(v, a, b) : 0; };
  const angle = (a) => { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };
  const taille = CORPS.haut, oeil = CORPS.oeil;
  const NEUTRE = Object.freeze(Object.assign({}, CORPS.NEUTRE, { course: false, couche: false, vise: false, changer: false }));
  // une entrée sans les niveaux v2 (vieux client, entrée abîmée) est jouée en v2 : copiée dans EN2 (réutilisé), niveaux à false
  const EN2 = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, yaw: undefined, pitch: undefined, tir: false, saut: false, accroupi: false, recharge: false, arme: null, changer: false, origine: undefined, course: false, couche: false, vise: false };
  function entreeV2(en) {
    if (!en || typeof en !== 'object') return NEUTRE;
    if (CORPS.estV2(en)) return en;
    EN2.avant = en.avant; EN2.cote = en.cote; EN2.dyaw = en.dyaw; EN2.dpitch = en.dpitch; EN2.yaw = en.yaw; EN2.pitch = en.pitch;
    EN2.tir = en.tir; EN2.saut = en.saut; EN2.accroupi = en.accroupi; EN2.recharge = en.recharge; EN2.arme = en.arme; EN2.changer = en.changer; EN2.origine = en.origine;
    return EN2;
  }

  // un mode minimal quand on n'en donne pas : réapparition au bout de 3 s sur un point libre, jamais de fin
  const MODE_LIBRE = {
    id: 'libre', nom: 'Libre',
    init() {}, surMort() {}, objets() { return VIDE; }, fini() { return false; }, resultat(jeu) { return { classement: jeu.classement(), gagnant: null, duree: jeu.temps }; },
    apparition(jeu) { const p = jeu.monde.libre(jeu.rnd); return [p[0], p[1], (jeu.rnd() * 2 - 1) * Math.PI]; },
    tick(jeu, dt, evs) { for (const e of jeu.entites) if (!e.vivant && jeu.temps - e.mortDepuis >= 3) jeu.reapparaitre(e, evs); },
  };
  const VIDE = [];

  // compatibilité : le rayon contre la capsule d'une entité (PCORPS.rayon ; PCORPS.TOUCHE dit le point et la tête)
  const rayonCapsule = CORPS.rayon;

  // ─── la boucle à pas fixe (§ 2) : acc = min(acc + dt, max·pas) ; tant que acc ≥ pas : fnPas(pas), acc −= pas ; alpha = acc / pas ───
  // Le temps perdu au-delà de max pas de retard ralentit la partie plutôt que de l'emballer. Aucune allocation par image.
  function pasFixe(o) {
    const pas = o && o.pas > 0 ? +o.pas : 1 / 60, max = o && o.max > 0 ? +o.max : 4, EPS = pas * 1e-6;
    let acc = 0;
    return {
      pas, max,
      avancer(dtImage, fnPas) {
        dtImage = +dtImage; if (dtImage > 0) acc = Math.min(acc + dtImage, max * pas);
        while (acc >= pas - EPS) { acc -= pas; if (acc < 0) acc = 0; fnPas(pas); }
        return acc / pas;
      },
      remettre() { acc = 0; },
      get acc() { return acc; },
    };
  }

  // ─── l'instantané compact v2 (§ 9.3 ; le jeu en ligne : l'hôte l'envoie à 20 Hz) ───
  // { t, e: [[id, x, y, z, yaw, pitch, vie, armure, drapeaux, arme, kills, morts, points (+ pour les humains : p, s, mP, rP, mS, rS,
  // recharge, ack)], …], o, r, f }
  // drapeaux : 1 vivant, 2 au sol, 4 accroupi (posture ≠ debout), 8 invincible, 16 en recharge, 32 couché (posture visée), 64 glissade,
  // 128 course, 256 vise ≥ 0,5, 512 en transition, 1024 lampe ; arme : l'arme en main, indice dans ARMES_ID ; p, s : les armes des deux
  // emplacements (indices ; p peut être une arme ramassée) ; mP / rP, mS / rS : munitions et réserve de chacune ; recharge : secondes
  // restantes ; ack : numéro de la dernière entrée appliquée (réseau) ; o : '1' / '0' par objet du mode (disponible) ; r : reste (s).
  // ARMES_ID : l'ordre du réseau (PREGLES.ARMES_ID, reparti à zéro avec la VERSION 2 du réseau, puis ne fait que s'allonger)
  const ARMES_ID = REGLES.ARMES_ID, PO = J.postures;
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const idx = (id) => Math.max(0, ARMES_ID.indexOf(id));
  function drapeaux(e) {
    return (e.vivant ? 1 : 0) | (e.auSol ? 2 : 0) | (e.accroupi ? 4 : 0) | (e.invincible > 0 ? 8 : 0) | (e.enRecharge ? 16 : 0) |
      (e.vers === 'couche' ? 32 : 0) | (e.vers === 'glisse' ? 64 : 0) | (e.course ? 128 : 0) | (e.vise >= 0.5 ? 256 : 0) | (e.transition > 0 ? 512 : 0) | (e.lampe ? 1024 : 0);
  }
  function ligneDe(e, temps, ack) {
    const l = [e.id, r2(e.x), r2(e.y), r2(e.z), r3(e.yaw), r3(e.pitch), Math.max(0, Math.round(e.vie)), Math.round(e.armure), drapeaux(e), idx(e.arme), e.score.kills, e.score.morts, e.score.points];
    if (e.humain) {
      const p = e.armes[0], s = e.armes[1] || p;
      l.push(idx(p), idx(s), e.munitions[p] | 0, e.reserve[p] | 0, e.munitions[s] | 0, e.reserve[s] | 0, e.enRecharge ? r2(Math.max(0, e.rechargeJusqua - temps)) : 0, ack | 0);
    }
    return l;
  }
  // écrit une ligne d'instantané dans une entité : quoi = 'etat' (vie, scores, munitions…), 'corps' (position, regard, drapeaux, arme), ou 'tout'
  function lireLigne(l, e, temps, quoi) {
    if (!Array.isArray(l) || !e) return false;
    const fl = l[8] | 0;
    if (quoi !== 'etat') {
      let saut = false;
      if (fini(l[1]) && fini(l[2]) && fini(l[3])) {
        saut = !(Math.abs(l[1] - e.x) + Math.abs(l[3] - e.z) <= 4); // une téléportation (réapparition) : pas d'interpolation à travers
        e.x = l[1]; e.y = l[2]; e.z = l[3];
      }
      if (fini(l[4])) e.yaw = angle(l[4]); if (fini(l[5])) e.pitch = borne(l[5], -1.45, 1.45);
      e.vivant = !!(fl & 1); e.auSol = !!(fl & 2); e.invincible = fl & 8 ? 1 : 0;
      // la posture (v2) : celle que vise le corps (couché, glissade, accroupi, debout), sans la transition (le rendu lisse l'œil)
      const vers = fl & 32 ? 'couche' : fl & 64 ? 'glisse' : fl & 4 ? 'accroupi' : 'debout';
      e.corpsV2 = true; e.posture = e.vers = vers; e.transition = 0; e.accroupi = vers !== 'debout';
      e.oeil = PO[vers].oeil; e.hautCapsule = PO[vers].haut; e.course = !!(fl & 128); e.vise = fl & 256 ? 1 : 0; e.enTransition = !!(fl & 512); e.lampe = !!(fl & 1024);
      if (saut) { e.ax = e.x; e.ay = e.y; e.az = e.z; e.aoeil = e.oeil; }
      e.arme = ARMES_ID[l[9] | 0] || REGLES.DEFAUT_EQUIP.p;
      if (e.armes) { const s = e.armes.indexOf(e.arme); if (s >= 0) e.slot = s; }
    }
    if (quoi !== 'corps') {
      if (fini(l[6])) e.vie = l[6]; if (fini(l[7])) e.armure = l[7];
      e.score.kills = l[10] | 0; e.score.morts = l[11] | 0; e.score.points = l[12] | 0;
      if (l.length >= 21) { // les deux emplacements, leurs munitions et réserves
        const p = ARMES_ID[l[13] | 0], s = ARMES_ID[l[14] | 0];
        if (p && s) {
          if (!e.armes || e.armes.length !== 2) e.armes = [p, s]; else { e.armes[0] = p; e.armes[1] = s; }
          for (const k in e.munitions) if (k !== p && k !== s) { delete e.munitions[k]; delete e.reserve[k]; }
          e.munitions[s] = Math.max(0, l[17] | 0); e.reserve[s] = Math.max(0, l[18] | 0);
          e.munitions[p] = Math.max(0, l[15] | 0); e.reserve[p] = Math.max(0, l[16] | 0);
          const k = e.armes.indexOf(e.arme); if (k >= 0) e.slot = k;
        }
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
    // les options = les réglages normalisés (§ 6) : déjà normalisés par ui.js / enligne.js, normalisés encore ici (idempotent)
    const humains = fini(+params.humains) ? Math.max(0, Math.min(REGLES.SALON.max, Math.round(+params.humains))) : 0;
    const options = REGLES.normaliserReglages(o, { humains });
    // les robots listés par l'hôte ('lancer') : tels quels (6 au plus)
    let robots = Array.isArray(params.robots) ? params.robots : Array.isArray(o.robots) ? o.robots : null;
    if (robots) { robots = robots.filter((r) => r && typeof r === 'object').slice(0, REGLES.SALON.max); options.bots = robots.length; }
    const vies = REGLES.SALON.vies[options.vie] || REGLES.SALON.vies.normale, vis = visibiliteDe(options.heure, options.meteo);
    let graine = params.graine;
    graine = fini(+graine) ? (+graine >>> 0) : REGLES.hash(String(graine));
    const mode = params.mode && typeof params.mode === 'object' ? params.mode : MODE_LIBRE;
    const reglesMode = REGLES.MODES[mode.id] || REGLES.MODES.arene;
    const entites = [], evs = [];
    const bruits = []; for (let k = 0; k < NB_BRUITS; k++) bruits.push({ n: 0, x: 0, z: 0, t: -1e9, e: null, portee: 0 });
    let finDemandee = false;

    const jeu = {
      monde, mode, options, reglages: options, graine, carte: params.carte || o.carte || monde.carte || null, nav: null, zone: null, robots,
      vieMax: vies.vie, armureMax: vies.armureMax, visibilite: vis.vue, visibiliteLampe: vis.lampe, lampes: options.heure === 'nuit',
      manche: null, treve: false, debutChrono: 0,
      entites, temps: 0, dt: 0, fini: false, duree: 0, image: 0, evenements: evs,
      rnd: REGLES.mulberry32(graine), rndBots: REGLES.mulberry32((graine ^ 0x9E3779B9) >>> 0),
      bruits, nBruits: 0, budgetNav: 2, erreurs: 0, derniereErreur: null,
      get reste() { return jeu.duree > 0 ? Math.max(0, jeu.duree - (jeu.temps - jeu.debutChrono)) : undefined; },
      ajouterJoueur, retirerJoueur, etape, classement, aideVisee, finir, trouver, ennemis, peutBlesser, reapparaitre, resume,
      reglerRetard, retardDe, historique, instantane,
      // pour PARMES (le tir) : compensation de latence, dégâts, bruits
      rembobiner, restaurer, blesser, faireBruit,
    };

    function trouver(id) { for (let i = 0; i < entites.length; i++) if (entites[i].id === id) return entites[i]; return null; }
    function ennemis(a, b) { return !!a && !!b && a !== b && a.equipe !== b.equipe; }
    function peutBlesser(a, b) { return !!a && !!b && a !== b && (a.equipe !== b.equipe || options.tirAllie === true); } // le tir allié
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
      const e = { // (voir l'entité v2 en tête de fichier ; placer remet tout à l'apparition)
        id, nom: String(d.nom || (bot ? 'Robot' : 'Joueur')).slice(0, 24), couleur: typeof d.couleur === 'string' ? d.couleur : REGLES.COULEURS[entites.length % REGLES.COULEURS.length],
        equipe: options.equipes ? (d.equipe === 0 || d.equipe === 1 ? d.equipe : plusPetiteEquipe()) : id,
        humain: !bot, bot, niveau: bot ? (REGLES.BOTS[d.niveau] ? d.niveau : options.niveau) : null,
        x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, vitesse: 0, yaw: 0, pitch: 0, auSol: true, accroupi: false,
        posture: 'debout', vers: 'debout', transition: 0, oeil: PO.debout.oeil, hautCapsule: PO.debout.haut, corpsV2: true,
        course: false, gv: 0, gdx: 0, gdz: 0, relanceA: 0, receptionA: 0, remonte: 0, vise: 0, viseStable: 0, accroupiPrec: false, couchePrec: false,
        ax: 0, ay: 0, az: 0, aoeil: PO.debout.oeil,
        vie: J.vie, armure: 0, vivant: true, mortDepuis: -1, apparuA: 0, invincible: 0,
        arme: null, armes: [], slot: 0, equip: null, changeJusqua: 0, changeReste: 0,
        munitions: {}, reserve: {}, rechargeJusqua: 0, enRecharge: false, prochainTir: 0,
        score: { kills: 0, morts: 0, points: 0, manches: 0 }, serie: 0,
        dispersion: 0, gonfle: 0, dernierTir: -1, toucheA: -1, parQui: null, tueTete: false, foulee: 0, ia: null, lampe: jeu.lampes,
      };
      // l'équipement (deux emplacements) : celui demandé s'il est permis, sinon l'équipement par défaut permis (placer l'applique)
      e.equip = REGLES.equipementDe(d.equip, options);
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
      e.posture = e.vers = 'debout'; e.transition = 0; e.oeil = PO.debout.oeil; e.hautCapsule = PO.debout.haut; e.corpsV2 = true;
      e.course = false; e.gv = 0; e.gdx = 0; e.gdz = 0; e.relanceA = 0; e.receptionA = 0; e.remonte = 0; e.accroupiPrec = false; e.couchePrec = false;
      e.ax = e.x; e.ay = e.y; e.az = e.z; e.aoeil = e.oeil; // une téléportation : pas d'interpolation à travers
      e.vie = jeu.vieMax; e.armure = 0; e.vivant = true; e.apparuA = jeu.temps; e.invincible = reglesMode.invincible || 0; e.lampe = jeu.lampes;
      ARMES.equiper(e, e.equip || REGLES.equipementDe(null, options), options); // l'équipement choisi, la principale en main
      e.prochainTir = jeu.temps + 0.2; e.foulee = 0; e.tueTete = false;
    }
    function reapparaitre(e, out) { placer(e); (out || evs).push({ t: 'reapparition', id: e.id }); }

    // ─── l'historique des positions (≈ 1 s) et la compensation de latence par tireur (jeu en ligne) ───
    // jeu.reglerRetard(id, s) : les tirs de id voient les autres comme il y a s secondes (borné à 0,25 s) ; l'hôte le règle d'après le ping.
    const NH = 72, H_PAS = 1 / 70, HIST = new Map(), retards = new Map();
    const SAUVE = { x: [], y: [], z: [], a: [], ent: [], p: [], v: [], tr: [], h: [], yaw: [], c2: [], n: 0 };
    function noter() { // une entrée par entité, au plus 70 par seconde
      for (let k = 0; k < entites.length; k++) {
        const e = entites[k]; let h = HIST.get(e);
        if (!h) { h = { t: new Float64Array(NH), x: new Float64Array(NH), y: new Float64Array(NH), z: new Float64Array(NH), f: new Uint8Array(NH), yaw: new Float64Array(NH), haut: new Float64Array(NH), forme: new Uint8Array(NH), i: -1, n: 0 }; HIST.set(e, h); }
        if (h.n && jeu.temps - h.t[h.i] < H_PAS) continue;
        h.i = (h.i + 1) % NH; if (h.n < NH) h.n++;
        h.t[h.i] = jeu.temps; h.x[h.i] = e.x; h.y[h.i] = e.y; h.z[h.i] = e.z; h.f[h.i] = (e.vivant ? 1 : 0) | (e.accroupi ? 2 : 0) | (e.corpsV2 ? 4 : 0) | (e.posture === 'couche' && e.vers === 'couche' ? 8 : 0);
        h.yaw[h.i] = e.yaw; h.haut[h.i] = e.hautCapsule; h.forme[h.i] = Math.max(0, CORPS.POSTURES.indexOf(e.vers)); // la posture et le regard : la capsule d'alors
      }
    }
    // POS (réutilisé) : x, y, z, vivant, accroupi ; et pour la capsule : corpsV2, couche (couché pour de bon), yaw, haut, vers (la posture visée)
    const POS = { x: 0, y: 0, z: 0, accroupi: false, vivant: false, corpsV2: false, couche: false, yaw: 0, haut: J.taille, vers: 'debout' };
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
          POS.vivant = !!(h.f[a] & 1); POS.accroupi = !!(h.f[a] & 2); POS.corpsV2 = !!(h.f[a] & 4); POS.couche = !!(h.f[a] & 8);
          POS.yaw = h.yaw[a]; POS.haut = h.haut[a]; POS.vers = CORPS.POSTURES[h.forme[a]] || 'debout';
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
        SAUVE.p[n] = c.posture; SAUVE.v[n] = c.vers; SAUVE.tr[n] = c.transition; SAUVE.h[n] = c.hautCapsule; SAUVE.yaw[n] = c.yaw; SAUVE.c2[n] = c.corpsV2;
        if (p.vivant) {
          c.x = p.x; c.y = p.y; c.z = p.z; c.accroupi = p.accroupi; // la capsule d'alors : posture, hauteur, regard (couché)
          c.corpsV2 = p.corpsV2; c.hautCapsule = p.haut; c.yaw = p.yaw; c.vers = p.vers; c.posture = p.couche ? 'couche' : p.vers === 'couche' ? 'accroupi' : p.vers;
        } else { c.x = 1e7; c.z = 1e7; } // pas encore réapparu à ce moment-là : intouchable pour ce tir
      }
      return SAUVE.n > 0;
    }
    function restaurer() {
      for (let n = 0; n < SAUVE.n; n++) {
        const c = SAUVE.ent[n]; c.x = SAUVE.x[n]; c.y = SAUVE.y[n]; c.z = SAUVE.z[n]; c.accroupi = SAUVE.a[n];
        c.posture = SAUVE.p[n]; c.vers = SAUVE.v[n]; c.transition = SAUVE.tr[n]; c.hautCapsule = SAUVE.h[n]; c.yaw = SAUVE.yaw[n]; c.corpsV2 = SAUVE.c2[n]; SAUVE.ent[n] = null;
      }
      SAUVE.n = 0;
    }

    // ─── l'instantané compact de la partie (voir ligneDe) ; acks : { id: numéro de la dernière entrée appliquée } ───
    function instantane(acks) {
      const e = new Array(entites.length);
      for (let k = 0; k < entites.length; k++) e[k] = ligneDe(entites[k], jeu.temps, acks ? acks[entites[k].id] : 0);
      let o = ''; let objs = null; try { objs = mode.objets ? mode.objets(jeu) : null; } catch (err) { objs = null; }
      if (objs) for (let i = 0; i < objs.length; i++) o += objs[i].dispo ? '1' : '0';
      const reste = jeu.reste;
      return { t: r3(jeu.temps), e, o, r: reste !== undefined ? r2(reste) : -1, f: jeu.fini ? 1 : 0 };
    }

    // ─── les armes : PARMES (armes.js) ; le tir appelle les crochets jeu.rembobiner / restaurer / blesser / faireBruit ───
    function blesser(c, de, degats, tete, armeId, out) {
      if (!c.vivant || !(degats > 0) || c.invincible > 0 || jeu.treve) return; // protégé juste après l'apparition ; entre deux manches
      if (de && de !== c && !peutBlesser(de, c)) return;                     // un équipier sans tir allié
      const abs = Math.min(c.armure, Math.round(degats * ABSORBE));
      c.armure -= abs; c.vie -= degats - abs; c.toucheA = jeu.temps; c.parQui = de ? de.id : null;
      const mort = c.vie <= 0;
      out.push({ t: 'touche', de: de ? de.id : null, a: c.id, degats, tete: !!tete, mort, arme: armeId });
      if (mort) tuer(c, de, armeId, tete, out);
    }
    function tuer(v, k, armeId, tete, out) {
      v.vie = 0; v.vivant = false; v.mortDepuis = jeu.temps; v.vx = v.vz = v.vy = 0; v.vitesse = 0; v.enRecharge = false; v.rechargeJusqua = 0;
      v.score.morts++; v.serie = 0; v.tueTete = !!tete;
      const allie = !!k && k !== v && !ennemis(k, v);
      if (allie) k.score.points -= PENALITE_ALLIE; // un équipier repeint (tir allié) : une pénalité, pas un repeint
      else if (k && k !== v) { k.score.kills++; k.serie++; }
      const ev = { t: 'mort', a: v.id, par: k ? k.id : null, arme: armeId, tete: !!tete }; if (allie) ev.allie = true;
      out.push(ev);
      if (mode.surMort) { try { mode.surMort(jeu, v, k, out); } catch (err) { erreur('mode.surMort', err); } }
    }

    // ─── une entité joue son entrée ───
    const P_DEBOUT = J.postures.debout.bruit, P_COURSE = J.postures.course.bruit;
    function appliquer(e, en, dt, out) {
      en = entreeV2(en);
      const mv = CORPS.deplacer(e, en, dt, monde, REGLES.arme(e.arme)), dep = mv.dep;
      if (mv.saut) out.push({ t: 'saut', id: e.id });
      if (mv.refus) out.push({ t: 'refus', id: e.id, quoi: mv.refus }); // local : « Pas la place de te coucher »
      // les pas (debout seulement : accroupi, couché ou en glissade, on est discret)
      if (e.auSol && e.posture === 'debout' && dep > 0) { e.foulee += dep; if (e.foulee >= FOULEE) { e.foulee -= FOULEE; out.push({ t: 'pas', id: e.id }); faireBruit(e, e.course ? P_COURSE : P_DEBOUT); } }
      // les armes : la visée, puis changement, recharge, tir
      ARMES.majVisee(e, en, dt);
      ARMES.agir(e, en, dt, jeu, out);
      if (e.invincible > 0) e.invincible = Math.max(0, e.invincible - dt);
      e.dispersion = ARMES.dispersion(e, REGLES.arme(e.arme));
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
      if (O.type === 'arme' && options.armes.indexOf(O.arme) < 0) return false; // une arme que l'hôte n'a pas permise ne se prend pas
      if (O.type === 'soin') return e.vie < jeu.vieMax;
      if (O.type === 'armure') return e.armure < jeu.armureMax;
      return ARMES.utile(e, O); // armes et munitions
    }
    function prendre(e, nom) {
      const O = REGLES.OBJETS[nom];
      if (O.type === 'soin') e.vie = Math.min(jeu.vieMax, e.vie + O.vie);
      else if (O.type === 'armure') e.armure = Math.min(jeu.armureMax, e.armure + O.armure);
      else ARMES.prendre(e, O, jeu);
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
      jeu.temps += dt; jeu.dt = dt; jeu.image++; jeu.budgetNav = 2;
      const n = entites.length;
      for (let k = 0; k < n; k++) { const e = entites[k]; e.ax = e.x; e.ay = e.y; e.az = e.z; e.aoeil = oeil(e); } // la position au début du pas (le rendu interpole)
      for (let k = 0; k < n; k++) {
        const e = entites[(k + jeu.image) % n]; // l'ordre tourne : personne ne tire toujours le premier
        if (!e.vivant) continue;
        let en = null;
        if (e.bot) { if (BOTS) { try { en = BOTS.penser(e, jeu, dt, jeu.rndBots); } catch (err) { erreur('bot ' + e.id, err); en = null; } } }
        else en = entrees ? entrees[e.id] : null;
        appliquer(e, en, dt, evs);
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
    const parScore = (a, b) => (b.score.manches | 0) - (a.score.manches | 0) || b.score.kills - a.score.kills || b.score.points - a.score.points || a.score.morts - b.score.morts || (a.bot === b.bot ? 0 : a.bot ? 1 : -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    function classement() { return entites.slice().sort(parScore); }
    function resume() { return classement().map((e) => ({ id: e.id, nom: e.nom, couleur: e.couleur, equipe: e.equipe, bot: e.bot, humain: e.humain, kills: e.score.kills, morts: e.score.morts, points: e.score.points, manches: e.score.manches | 0 })); }

    // ─── l'aide à la visée (humains au doigt) : ralentit et aimante doucement près d'une cible, dit si le viseur est dessus ───
    const AIDE = { dyaw: 0, dpitch: 0, surCible: false, ralentir: 0, cible: null, permise: true };
    function aideVisee(id, force) {
      AIDE.dyaw = 0; AIDE.dpitch = 0; AIDE.surCible = false; AIDE.ralentir = 0; AIDE.cible = null; AIDE.permise = options.aide !== false;
      const e = trouver(id); if (!e || !e.vivant || e.bot || jeu.fini) return AIDE;
      force = AIDE.permise ? num(force, 0, 1) : 0; // l'hôte a coupé l'aide : ni ralenti ni aimant (le viseur rouge reste)
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

    // ─── la mise en place : la zone (reçue, ou préparée avec son hasard à part), le mode (apparitions, objets, bots), puis la navigation
    // des bots sur la zone jouée (déjà construite par la zone : en cache sur le monde) et le crochet apresNav ───
    if (mode.zones && ZONES) {
      try {
        let z = params.zone ? ZONES.adopter(params.zone, monde) : null;
        if (!z) z = ZONES.preparer(jeu.carte, monde, null, options.zone, REGLES.mulberry32((graine ^ 0x2F6E2B1) >>> 0), options);
        jeu.zone = z;
      } catch (err) { erreur('zone', err); jeu.zone = null; }
    }
    try { if (mode.init) mode.init(jeu); } catch (err) { erreur('mode.init', err); }
    if (NAV && params.nav !== false && typeof monde.passe === 'function') { try { jeu.nav = NAV.creer(monde, { pas: 1.5, marge: 0.45 }); } catch (err) { erreur('nav', err); jeu.nav = null; } }
    if (mode.apresNav) { try { mode.apresNav(jeu); } catch (err) { erreur('mode.apresNav', err); } }
    return jeu;
  }

  // deplacer, dispersion, tirVisuel : alias de PCORPS.deplacer, PARMES.dispersion, PARMES.tirVisuel (la prédiction du client en ligne)
  return { creer, rayonCapsule, deplacer: CORPS.deplacer, dispersion: ARMES.dispersion, tirVisuel: ARMES.tirVisuel, pasFixe, ligneDe, lireLigne, ARMES_ID, PORTEE_AUTO, DT_MAX, R_CAPSULE, TETE };
});
