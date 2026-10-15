/* OPÉRATION PONCIN — le mode Extraction : 8 minutes (5 / 8 / 12) dans la zone choisie (par défaut tout le bourg), contre des robots
   gardiens. Trois formats (réglage formatExtraction) : 'ensemble' (tous les humains dans une équipe ; en solo, toi contre les robots),
   'equipes' (2 ou 3 équipes rivales de 1 à 3 humains, réglage equipesExtraction, réparties de façon équilibrée), 'chacun' (chacun pour
   soi). Le tir allié suit tirAllie à l'intérieur d'une équipe ; entre équipes rivales, on se blesse.
   On part avec l'équipement choisi (plus les améliorations du coffre personnel : armure de départ, chargeur en plus, sac plus grand,
   ouverture plus rapide). Dans la zone, 20 à 40 coffres (posés par PZONES avec la zone : mêmes chez tous) commun / rare / épique /
   légendaire, à ouvrir en restant 1,2 s à côté sans bouger (coupé si l'on bouge ou si l'on est touché ; ça fait du bruit) : objets de
   valeur dans le sac (des cases, PBUTIN), soins, armure et munitions pris s'ils servent (sinon rangés dans le sac, sinon posés), une
   meilleure principale posée à côté (avec sa rareté : ramenée si on la porte en sortant), un silencieux (fixé à l'arme en main : le tir
   ne s'entend plus qu'à 8 m), la clé du coffre-fort. Ce qui ne tient pas reste au sol (un sac au sol, à ramasser en restant 0,5 s à
   côté). Entrées en plus (des fronts) : en.lacher = i (l'objet i du sac au sol), en.utiliser = i (un consommable du sac), en.lampe
   (allumer / éteindre sa lampe, la nuit : éteinte, les robots ne la voient plus de loin), en.signal = { type: 'coffre' | 'ennemi' |
   'sortie' | 'ici', x, y, z } (un marqueur de 12 s pour son équipe, 3 au plus par joueur).
   Le poids du sac ralentit : au-delà de 4 cases, −2,5 % par case (−20 % au plus : e.ralenti, lu par PCORPS).
   À mi-partie, deux points d'extraction s'ouvrent (le pont, la cale de la rivière : PZONES ; balise + annonce) : rester 8 s dans le
   cercle de 10 m sans être touché = extrait (plusieurs joueurs peuvent y être : les sorties se disputent). 30 s plus tard, un largage :
   une caisse épique ou légendaire tombe (annoncée 15 s avant ; fumée rouge côté rendu), deux gardiens y arrivent 20 s après.
   Le coffre-fort (devant la mairie, PZONES : zone.lieux) est verrouillé : il faut la clé (dans un coffre rare ou mieux) ; 4 s pour
   l'ouvrir ; dedans, le trésor de la mairie. Le Gardien (le boss : e.boss = { nom, vieMax }, vie × 6, armure pleine, 30 % plus lent)
   le garde et appelle des renforts à 50 % de sa vie.
   Mort : le sac tombe au sol (n'importe qui peut le ramasser : piller un rival, récupérer celui d'un équipier) ; seul (ou sans
   équipier en jeu), on est éliminé ; avec un équipier : à terre, relevé en restant 4 s à côté dans les 30 s, sinon éliminé. Fin du
   temps : ceux qui ne sont pas sortis perdent ce qu'ils portent. En 'equipes' et 'chacun', le plus riche (au-delà de 150 pièces portées)
   est révélé à tous toutes les 30 s (événement 'prime') ; l'éliminer rapporte une prime (25 % de ce qu'il porte, 25 à 250 pièces),
   versée seulement si l'on sort.
   Score : la valeur extraite + 10 par gardien (100 le Gardien), 25 par joueur éliminé + les primes versées (PBUTIN). Après la partie,
   resultat(jeu).extraction.joueurs donne pour chacun ce qui est sorti (objets et materiel, à déposer : PBUTIN.deposer(coffre, ligne)),
   ce qui est perdu, les éliminations (robots / joueurs), les primes, le format, la zone de la semaine (jeu.maintenant : PJEU.creer({
   maintenant: Date.now() }) ; +25 % de pièces au dépôt).
   Les gardiens (PBOTS, entité e.garde = { x, z, cx, cz, laisse, ronde, depart, arrivee? }) : des groupes près des coffres rares et
   mieux, des patrouilles à deux sur une ronde entre les coffres ; tous dans le camp 'gardiens'.
   Un mode est un jeu de crochets appelés par PJEU (comme PARENE) : zones, init, nouveau, place, apparition, agir, tick, surMort,
   objets, fini, resultat, trier. L'état est dans jeu.extraction (jeu.arene = { robots } pour enligne.js). Événements : voir
   src-poncin/ARCHITECTURE.md « Extraction ». Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'), require('./butin.js'), require('./zones.js'));
  else root.PEXTRACTION = factory(root.PREGLES, root.PBUTIN, root.PZONES);
})(typeof self !== 'undefined' ? self : this, function (REGLES, BUTIN, ZONES) {
  'use strict';
  const X = REGLES.MODES.extraction, J = REGLES.JOUEUR, G = X.gardiens;
  const VIDE = [];
  const fin = (v) => typeof v === 'number' && v - v === 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
  const COULEUR_GARDIENS = ['#FF6B8B', '#7FB3FF', '#5FD3A4', '#B8A6FF', '#FF9F5A', '#4FD1E0', '#F48FD8'];
  const COULEUR_BOSS = '#5A5F73';
  const SIGNAUX = ['coffre', 'ennemi', 'sortie', 'ici'], SIGNAL_DUREE = 12, SIGNAL_MAX = 3;
  const nomDe = (e) => (e.humain && e.nom === 'Toi' ? 'Tu' : e.nom);
  const toi = (e) => (e.humain && e.nom === 'Toi' ? 'toi' : e.nom);
  const verbe = (e, tu, il) => (e.humain && e.nom === 'Toi' ? tu : il);
  const minuscule = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  function annonce(evs, texte) { evs.push({ t: 'annonce', texte }); }
  const enJeu = (e) => e.humain && !!e.sac && !e.extrait && !e.elimine && !e.retire;   // encore dans la partie (vivant ou à terre)

  // ─── la mise en place : coffres, points d'extraction, largage, coffre-fort, gardiens ───
  function init(jeu) {
    const monde = jeu.monde, R = jeu.reglages || jeu.options;
    let zone = jeu.zone;
    if (zone && !zone.coffres && ZONES && ZONES.extraction) { try { ZONES.extraction(jeu.carte, monde, null, zone, REGLES.mulberry32((jeu.graine ^ 0x5EC0FF3) >>> 0), R); } catch (err) { /* repli ci-dessous */ } }
    if (!zone || !zone.coffres || !zone.extractions) zone = secours(jeu, zone);
    if (zone.limite) monde.limite = zone.limite;
    jeu.duree = R.duree > 0 ? R.duree : X.duree;
    const rndC = REGLES.mulberry32((jeu.graine ^ 0xC0FF3E) >>> 0); // le contenu des coffres : un hasard à part, le même partout
    const coffres = zone.coffres.map((c, i) => coffreDe(jeu, R, rndC, 'c' + i, +c[0], +c[1], c[2], c[3] || null));
    const extractions = zone.extractions.map((e) => ({ id: e.id, nom: e.nom, x: +e.x, z: +e.z, y: monde.hauteur(+e.x, +e.z), rayon: e.rayon > 0 ? +e.rayon : X.extraction.rayon }));
    const format = X.formats.indexOf(R.formatExtraction) >= 0 ? R.formatExtraction : 'ensemble';
    const ouvreA = jeu.duree * X.extraction.ouvre;
    // le largage : sa caisse est tirée dès maintenant (même hasard partout), posée quand elle tombe
    let largage = null;
    if (zone.largage) {
      const rar = rndC() < X.largage.legendaire ? 'legendaire' : 'epique';
      largage = { x: +zone.largage[0], z: +zone.largage[1], A: ouvreA + X.largage.decalage, annonce: false, tombe: false, gardesA: Infinity, coffre: coffreDe(jeu, R, rndC, 'largage', +zone.largage[0], +zone.largage[1], rar, 'largage') };
    }
    const A = jeu.extraction = {
      zone, coffres, extractions, format, nEquipes: format === 'equipes' ? (R.equipesExtraction === 3 ? 3 : 2) : format === 'ensemble' ? 1 : 0,
      depart: (zone.depart || [extractions[0].x, extractions[0].z]).slice(), departs: null, lieux: (zone.lieux || []).map((l) => Object.assign({}, l)),
      ouvreA, ouvertes: false, largage, sacs: [], objets: [], signaux: [], nSacs: 0, nObjets: 0, nSignaux: 0, nRobots: 0,
      prime: { prochainA: X.prime.premier, id: null, valeur: 0, montant: 0 }, zoneSemaine: fin(jeu.maintenant) && zone.id === BUTIN.zoneDeLaSemaine(jeu.maintenant),
      equipes: format !== 'chacun', chrono: {}, termine: false, finA: Infinity, robots: [], nHumains: 0, premierCoffre: false, boss: null,
    };
    jeu.arene = { robots: A.robots }; // enligne.js lit jeu.arene.robots pour le message 'lancer'
    // les gardiens : ceux que l'hôte a listés (jeu.robots), sinon posés ici (le Gardien d'abord)
    const liste = Array.isArray(jeu.robots) ? jeu.robots : gardiens(jeu, A, R);
    for (const r of liste) ajouterRobot(jeu, A, R, r);
  }
  function coffreDe(jeu, R, rnd, id, x, z, rarete, special) {
    return { id, x, z, y: jeu.monde.hauteur(x, z), rarete, special, verrou: special === 'coffre-fort', contenu: BUTIN.tirerContenu(rarete, rnd, { armes: R.armes, special }), ouvert: false, par: null, ouvertA: -1 };
  }
  function ajouterRobot(jeu, A, R, r) {
    const k = A.nRobots++;
    const e = jeu.ajouterJoueur({ id: typeof r.id === 'string' && r.id ? r.id : 'bot' + (k + 1), nom: typeof r.nom === 'string' ? r.nom : REGLES.NOMS_BOTS[k % REGLES.NOMS_BOTS.length],
      couleur: typeof r.couleur === 'string' ? r.couleur : COULEUR_GARDIENS[k % COULEUR_GARDIENS.length], bot: true, niveau: REGLES.BOTS[r.niveau] ? r.niveau : R.niveau, equip: r.equip, garde: r.garde, boss: r.boss === true });
    const l = { id: e.id, nom: e.nom, couleur: e.couleur, equip: e.equip.p + '+' + e.equip.s, niveau: e.niveau, garde: e.garde };
    if (e.boss) { l.boss = true; A.boss = e.id; }
    A.robots.push(l);
    return l;
  }
  // sans zone préparée (PJEU sans PZONES) : 20 coffres et deux sorties au hasard rejouable autour du centre
  function secours(jeu, z) {
    const monde = jeu.monde, rnd = REGLES.mulberry32((jeu.graine ^ 0x5EC0FF3) >>> 0), c = z && z.englobant ? z.englobant.centre : [0, 0], r = z && z.englobant ? z.englobant.rayon : 110;
    const pt = () => monde.libre(rnd, c, r - 5), coffres = [], raretes = BUTIN.raretes(X.coffres.min);
    for (let k = 0; k < X.coffres.min; k++) { const p = pt(); coffres.push([p[0], p[1], raretes[k]]); }
    const a = pt(); let b = pt(); for (let k = 0; k < 30 && d2(a[0], a[1], b[0], b[1]) < r * r; k++) b = pt();
    return Object.assign({}, z || {}, { englobant: { centre: c.slice(), rayon: r }, apparitions: (z && z.apparitions) || [], coffres, depart: pt(), lieux: [], largage: null,
      extractions: [{ id: 'sortie1', nom: 'Sortie A', x: a[0], z: a[1], rayon: X.extraction.rayon }, { id: 'sortie2', nom: 'Sortie B', x: b[0], z: b[1], rayon: X.extraction.rayon }] });
  }
  // un point libre (dans la zone, joignable) à r0–r1 m de (cx, cz)
  function autour(jeu, rnd, cx, cz, r0, r1) {
    const monde = jeu.monde, lim = monde.limite;
    for (let k = 0; k < 60; k++) {
      const a = rnd() * 2 * Math.PI, r = r0 + (r1 - r0) * rnd(), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!monde.bloque(x, z, 0.6) && (typeof monde.accessible !== 'function' || monde.accessible(x, z)) && (!lim || typeof lim.dedans !== 'function' || lim.dedans(x, z))) return [r2(x), r2(z)];
    }
    return null;
  }
  const equipRobot = (jeu, R, niveau) => { const q = REGLES.equipementRobot(jeu.rnd, R, niveau); return q.p + '+' + q.s; };
  // les postes des gardiens : le Gardien (boss), groupes autour des coffres rares et mieux, patrouilles à deux ; plafond selon le niveau
  function gardiens(jeu, A, R) {
    const rnd = jeu.rnd, niv = G[R.niveau] || G.normal;
    const max = Math.min(G.plafond, niv.max + G.parHumain * Math.max(0, (jeu.humains || 1) - 1));
    const postes = [], groupe = (c, n, laisse) => { for (let k = 0; k < n; k++) { const p = autour(jeu, rnd, c.x, c.z, 3, 7); if (p) postes.push({ x: p[0], z: p[1], cx: c.x, cz: c.z, laisse, ronde: null }); } };
    const par = (r) => A.coffres.filter((c) => c.rarete === r);
    // le Gardien : à son poste (zone.lieux), sinon près du coffre-fort ou du légendaire le plus loin du départ
    const fort = A.coffres.find((c) => c.special === 'coffre-fort') || par('legendaire').sort((a, b) => d2(b.x, b.z, A.depart[0], A.depart[1]) - d2(a.x, a.z, A.depart[0], A.depart[1]))[0];
    const lieu = A.lieux.find((l) => l.id === 'gardien');
    const pb = lieu ? [lieu.x, lieu.z] : fort ? autour(jeu, rnd, fort.x, fort.z, 4, 9) : null;
    const boss = pb ? { x: pb[0], z: pb[1], cx: fort ? fort.x : pb[0], cz: fort ? fort.z : pb[1], laisse: 25, ronde: null } : null;
    for (const c of par('legendaire')) groupe(c, c === fort && boss ? Math.max(0, niv.legendaire - 1) : niv.legendaire, 40);
    // les patrouilles : à deux, une ronde de 4 coffres voisins (rangés autour de leur centre)
    const rondes = [];
    for (let k = 0; k < niv.patrouilles && A.coffres.length >= 4; k++) {
      const c0 = A.coffres[Math.floor(rnd() * A.coffres.length)], proches = A.coffres.slice().sort((a, b) => d2(a.x, a.z, c0.x, c0.z) - d2(b.x, b.z, c0.x, c0.z)).slice(0, 4);
      const mx = proches.reduce((s, c) => s + c.x, 0) / 4, mz = proches.reduce((s, c) => s + c.z, 0) / 4;
      proches.sort((a, b) => Math.atan2(a.z - mz, a.x - mx) - Math.atan2(b.z - mz, b.x - mx));
      const ronde = []; for (const c of proches) { const p = autour(jeu, rnd, c.x, c.z, 2, 5); if (p) ronde.push(p); }
      if (ronde.length >= 2) rondes.push({ ronde, mx, mz });
    }
    const patrouilles = [];
    for (const r of rondes) for (let k = 0; k < 2; k++) { const p = autour(jeu, rnd, r.ronde[0][0], r.ronde[0][1], 0.8, 2.5) || r.ronde[0]; patrouilles.push({ x: p[0], z: p[1], cx: r.mx, cz: r.mz, laisse: 70, ronde: r.ronde, depart: k }); }
    const epiques = []; for (const c of par('epique')) { const n0 = postes.length; groupe(c, niv.epique, 35); epiques.push(...postes.splice(n0)); }
    const rares = []; par('rare').forEach((c, i) => { const n = Math.floor((i + 1) * niv.rare) - Math.floor(i * niv.rare); const n0 = postes.length; groupe(c, n, 30); rares.push(...postes.splice(n0)); });
    const tous = postes.concat(patrouilles, epiques, rares).slice(0, max);
    // noms (mélangés, rejouables) et équipement (parmi les armes permises)
    const noms = REGLES.NOMS_BOTS.slice();
    for (let i = noms.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = noms[i]; noms[i] = noms[j]; noms[j] = t; }
    const out = tous.map((g, k) => ({ id: 'bot' + (k + 1), nom: noms[k % noms.length] + (k >= noms.length ? ' ' + (Math.floor(k / noms.length) + 1) : ''), couleur: COULEUR_GARDIENS[k % COULEUR_GARDIENS.length],
      niveau: R.niveau, equip: equipRobot(jeu, R, R.niveau), garde: { x: r2(g.x), z: r2(g.z), cx: r2(g.cx), cz: r2(g.cz), laisse: g.laisse, ronde: g.ronde, depart: g.depart | 0 } }));
    if (boss) { // l'arme lourde : un fusil d'assaut (AK-74, sinon une principale permise), et le niveau « fort »
      const lourde = ['ak74', 'm4', 'pompe'].find((a) => R.armes.indexOf(a) >= 0);
      out.unshift({ id: 'gardien', nom: 'Le Gardien', couleur: COULEUR_BOSS, niveau: 'fort', boss: true, equip: lourde ? lourde + '+' + (R.armes.indexOf('m1911') >= 0 ? 'm1911' : 'p226') : equipRobot(jeu, R, 'fort'),
        garde: { x: r2(boss.x), z: r2(boss.z), cx: r2(boss.cx), cz: r2(boss.cz), laisse: boss.laisse, ronde: null, depart: 0 } });
    }
    return out;
  }
  function lireGarde(g) {
    if (!g || typeof g !== 'object' || !fin(+g.x) || !fin(+g.z)) return null;
    const ronde = Array.isArray(g.ronde) ? g.ronde.filter((p) => Array.isArray(p) && fin(+p[0]) && fin(+p[1])).map((p) => [+p[0], +p[1]]) : null;
    const out = { x: +g.x, z: +g.z, cx: fin(+g.cx) ? +g.cx : +g.x, cz: fin(+g.cz) ? +g.cz : +g.z, laisse: fin(+g.laisse) && g.laisse > 5 ? +g.laisse : 35, ronde: ronde && ronde.length >= 2 ? ronde : null, depart: g.depart | 0 };
    if (Array.isArray(g.arrivee) && fin(+g.arrivee[0]) && fin(+g.arrivee[1])) out.arrivee = [+g.arrivee[0], +g.arrivee[1]];
    return out;
  }
  // des renforts (le largage, le Gardien) : n robots qui arrivent de 35–50 m et prennent leur poste autour de (cx, cz)
  function renforts(jeu, A, n, cx, cz, quoi, evs) {
    const R = jeu.reglages, liste = [];
    for (let k = 0; k < n; k++) {
      const poste = autour(jeu, jeu.rnd, cx, cz, 2.5, 6), dep = autour(jeu, jeu.rnd, cx, cz, 35, 50) || autour(jeu, jeu.rnd, cx, cz, 15, 30);
      if (!poste || !dep) continue;
      const i = A.nRobots + 1, nom = REGLES.NOMS_BOTS[(i * 7) % REGLES.NOMS_BOTS.length] + ' ' + (Math.floor(i / REGLES.NOMS_BOTS.length) + 2);
      liste.push(ajouterRobot(jeu, A, R, { id: 'bot' + i + (jeu.trouver('bot' + i) ? 'r' : ''), nom, niveau: R.niveau, equip: equipRobot(jeu, R, R.niveau),
        garde: { x: poste[0], z: poste[1], cx: r2(cx), cz: r2(cz), laisse: 40, ronde: null, depart: 0, arrivee: dep } }));
    }
    if (liste.length) evs.push({ t: 'renforts', quoi, robots: liste.map((l) => Object.assign({}, l)) }); // la façade les ajoute tels quels
    return liste;
  }

  // ─── un joueur arrive : son camp, son sac, ses améliorations ; un robot : son poste (et le Gardien, sa vie) ───
  function nouveau(jeu, e, d) {
    const A = jeu.extraction;
    if (e.bot) {
      e.equipe = 'gardiens'; e.garde = lireGarde(d && d.garde);
      if (d && d.boss === true) e.boss = { nom: e.nom, vieMax: Math.round(jeu.vieMax * X.boss.vie), renforts: false };
      return;
    }
    e.equipe = equipeDe(jeu, A, e, d);
    e.ameliorations = BUTIN.bornerAmeliorations(d && d.ameliorations);
    const ef = BUTIN.effets(e.ameliorations);
    e.sac = BUTIN.sacVide(ef.cases); e.dureeOuverture = ef.ouverture;
    e.extrait = false; e.aTerre = false; e.aTerreJusqua = 0; e.elimine = false; e.perdu = false; e.cle = false; e.silencieux = null; e.verrouVu = null;
    e.interaction = null; e.sortie = 0; e.sortiePoint = null; e.toucheVu = -1; e.ralenti = 0;
    e.butin = { coffres: 0, coffresPar: { commun: 0, rare: 0, epique: 0, legendaire: 0 }, extrait: [], materiel: [], perdu: [], materielPerdu: [], point: null, valeurExtraite: 0, valeurPerdue: 0, killsRobots: 0, killsJoueurs: 0, boss: false, primes: 0 };
    e.armeTrouvee = null;
    e.rang = A ? A.nHumains++ : 0;
  }
  // le camp d'un humain : 0 (ensemble), son id (chacun pour soi), ou l'équipe la moins nombreuse (equipes ; d.equipe si elle est valable)
  function equipeDe(jeu, A, e, d) {
    if (!A || A.format === 'ensemble') return 0;
    if (A.format === 'chacun') return e.id;
    const n = A.nEquipes; if (d && Number.isInteger(d.equipe) && d.equipe >= 0 && d.equipe < n) return d.equipe;
    const compte = new Array(n).fill(0); for (const c of jeu.entites) if (c.humain && c.sac && c.equipe >= 0 && c.equipe < n) compte[c.equipe]++;
    let best = 0; for (let i = 1; i < n; i++) if (compte[i] < compte[best]) best = i;
    return best;
  }
  // à chaque apparition (placer a rééquipé) : l'armure de départ et le chargeur en plus ; le Gardien : sa vie, son armure, sa lenteur
  function place(jeu, e) {
    if (e.boss) { e.vie = e.boss.vieMax; e.armure = Math.round(jeu.armureMax * X.boss.armure); e.ralenti = X.boss.ralenti; return; }
    if (e.bot || !e.ameliorations) return;
    const ef = BUTIN.effets(e.ameliorations);
    e.armure = Math.min(jeu.armureMax, ef.armure);
    if (ef.chargeurs > 0) for (const id of e.armes) e.reserve[id] = (e.reserve[id] | 0) + ef.chargeurs * REGLES.arme(id).chargeur;
  }
  // le point d'apparition : le poste du gardien (ou son point d'arrivée) ; le départ de son camp (en petit cercle)
  function apparition(jeu, e) {
    const A = jeu.extraction, monde = jeu.monde;
    if (e.bot && e.garde) {
      const g = e.garde; let x = g.x, z = g.z;
      if (g.arrivee) { x = g.arrivee[0]; z = g.arrivee[1]; }
      else if (g.ronde && g.depart) { const p = g.ronde[g.depart % g.ronde.length]; if (!monde.bloque(p[0], p[1], J.rayon)) { x = p[0]; z = p[1]; } }
      return [x, z, g.arrivee ? Math.atan2(-(g.x - x), -(g.z - z)) : Math.atan2(-(x - g.cx), -(z - g.cz))]; // dos à ce qu'il garde : il regarde qui arrive
    }
    if (!A) return null;
    const l = departs(jeu, A);
    let dep = A.depart, k = 0;
    if (e.humain && A.format === 'chacun') dep = l[(e.rang | 0) % l.length];
    else if (e.humain && A.format === 'equipes') dep = l[(e.equipe | 0) % l.length];
    if (e.humain) for (const c of jeu.entites) if (c !== e && c.humain && c.sac && c.equipe === e.equipe && c.rang < e.rang) k++; // son rang dans son camp
    const c = A.zone.englobant ? A.zone.englobant.centre : [0, 0], yaw = Math.atan2(-(c[0] - dep[0]), -(c[1] - dep[1]));
    for (const r of k ? [2.2, 1.2, 3.2] : [0, 1.5]) {
      const a = k * 2.1, x = dep[0] + Math.cos(a) * r, z = dep[1] + Math.sin(a) * r;
      if (!monde.bloque(x, z, J.rayon)) return [x, z, yaw];
    }
    return [dep[0], dep[1], yaw];
  }
  // des départs écartés (60 m au moins, sinon 40), loin des points d'extraction : un par camp ('equipes', 'chacun')
  function departs(jeu, A) {
    if (A.departs) return A.departs;
    const l = [A.depart], apps = (A.zone.apparitions || []).slice();
    const loinEx = (p) => Math.min(...A.extractions.map((x) => Math.sqrt(d2(p[0], p[1], x.x, x.z))));
    apps.sort((a, b) => loinEx(b) - loinEx(a));
    for (const ecart of [60, 40, 20]) for (const p of apps) { if (l.length >= REGLES.SALON.max) break; if (l.every((q) => d2(p[0], p[1], q[0], q[1]) >= ecart * ecart) && !jeu.monde.bloque(p[0], p[1], 0.6)) l.push([p[0], p[1]]); }
    A.departs = l; return l;
  }

  // ─── les entrées du mode (des fronts) : utiliser, lâcher, lampe, signal ───
  function agir(jeu, e, en, dt, evs) {
    const A = jeu.extraction; if (!A || !e.sac || !e.vivant || !en) return;
    if (en.utiliser != null) {
      const i = +en.utiliser, id = i >= 0 && i < e.sac.objets.length ? e.sac.objets[i | 0] : null;
      if (id && servir(jeu, e, id)) { e.sac.objets.splice(i | 0, 1); evs.push({ t: 'butin', id: e.id, quoi: id, objet: id, utilise: true }); }
    }
    if (en.lampe === true && jeu.lampes) { e.lampe = !e.lampe; evs.push({ t: 'lampe', id: e.id, allumee: e.lampe }); }
    if (en.signal && typeof en.signal === 'object') signal(jeu, A, e, en.signal, evs);
    if (en.lacher == null) return;
    const i = +en.lacher; if (!(i >= 0 && i < e.sac.objets.length)) return;
    const id = BUTIN.retirer(e.sac, i | 0); if (!id) return;
    const s = poserSac(jeu, A, e.x, e.z, [id], e.id, evs);
    s.attend[e.id] = true; // pas repris tout de suite par celui qui l'a lâché (il doit s'en éloigner)
  }
  // un signal d'équipe : 12 s, 3 au plus par joueur (le plus ancien remplacé), à 300 m au plus ; visible de son camp (equipe)
  function signal(jeu, A, e, s, evs) {
    if (SIGNAUX.indexOf(s.type) < 0 || !fin(+s.x) || !fin(+s.z)) return;
    const x = +s.x, z = +s.z, y = fin(+s.y) ? +s.y : jeu.monde.hauteur(x, z);
    if (d2(x, z, e.x, e.z) > 300 * 300) return;
    const miens = A.signaux.filter((g) => g.de === e.id);
    if (miens.length >= SIGNAL_MAX) A.signaux.splice(A.signaux.indexOf(miens[0]), 1);
    const g = { id: 'g' + A.nSignaux++, de: e.id, equipe: e.equipe, type: s.type, x: r2(x), y: r2(y), z: r2(z), jusqua: jeu.temps + SIGNAL_DUREE };
    A.signaux.push(g);
    evs.push({ t: 'signal', id: g.id, de: e.id, equipe: e.equipe, type: g.type, x: g.x, y: g.y, z: g.z, duree: SIGNAL_DUREE });
  }
  // les signaux que voit un joueur (ceux de son camp, encore valables)
  function signauxPour(jeu, id) {
    const A = jeu.extraction, e = jeu.trouver(id); if (!A || !e) return [];
    return A.signaux.filter((g) => g.jusqua > jeu.temps && g.equipe === e.equipe);
  }

  // un consommable appliqué s'il sert : rend vrai si oui
  function servir(jeu, e, type) {
    if (type === 'soin') { if (e.vie >= jeu.vieMax || jeu.vieMax <= 1) return false; e.vie = Math.min(jeu.vieMax, e.vie + REGLES.OBJETS.soin.vie); return true; }
    if (type === 'armure') { if (e.armure >= jeu.armureMax) return false; e.armure = Math.min(jeu.armureMax, e.armure + REGLES.OBJETS.armure.armure); return true; }
    if (type === 'munitions') { if (!e.armes.some((id) => (e.reserve[id] | 0) < REGLES.arme(id).reserve)) return false; for (const id of e.armes) e.reserve[id] = Math.max(e.reserve[id] | 0, REGLES.arme(id).reserve); return true; }
    return false;
  }

  // ─── les sacs au sol (objets de valeur, consommables, la clé) et les objets posés (ramassés au passage par PJEU, une seule fois) ───
  function poserSac(jeu, A, x, z, objets, de, evs, cle) {
    const s = { id: 's' + A.nSacs++, x, z, y: jeu.monde.hauteur(x, z), objets: objets.slice(), de: de || null, dispo: true, attend: {}, cle: !!cle };
    A.sacs.push(s);
    evs.push({ t: 'sac', quoi: 'pose', sac: s.id, x: r2(x), z: r2(z), objets: s.objets.slice(), de: s.de, cle: s.cle });
    return s;
  }
  function poserObjet(jeu, A, x, z, nom, rarete) {
    const o = { id: 'x' + A.nObjets++, x, z, y: null, objet: nom, dispo: true, revient: 0, unique: true, rarete: rarete || null };
    A.objets.push(o); return o;
  }
  // un point libre à ~1,5 m de (x, z), du côté opposé à (ox, oz) (on ne ramasse pas l'arme sans le vouloir)
  function aCote(jeu, x, z, ox, oz, k) {
    const monde = jeu.monde, base = Math.atan2(z - oz, x - ox);
    for (let i = 0; i < 8; i++) {
      const a = base + (k * 0.9) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.6, px = x + Math.cos(a) * 1.5, pz = z + Math.sin(a) * 1.5;
      if (!monde.bloque(px, pz, 0.3) && monde.passe(x, z, px, pz, 0.1)) return [px, pz];
    }
    return [x, z];
  }
  // le silencieux : fixé à l'arme en main (la secondaire si c'est la pompe)
  function fixerSilencieux(e) {
    const a = REGLES.arme(e.arme).classe === 'pompe' ? e.armes[1] : e.arme;
    if (!a || e.silencieux === a) return null;
    e.silencieux = a; return a;
  }

  // ─── ouvrir un coffre ───
  function ouvrir(jeu, A, e, c, evs) {
    c.ouvert = true; c.par = e.id; c.ouvertA = jeu.temps; e.butin.coffres++; e.butin.coffresPar[c.rarete] = (e.butin.coffresPar[c.rarete] | 0) + 1;
    if (c.verrou) { e.cle = false; evs.push({ t: 'cle', id: e.id, quoi: 'utilisee', coffre: c.id }); }
    evs.push({ t: 'coffre', id: c.id, par: e.id, rarete: c.rarete, special: c.special, x: r2(c.x), z: r2(c.z), contenu: c.contenu.map((o) => Object.assign({}, o)) });
    const reste = []; let k = 0, cle = false;
    for (const o of c.contenu) {
      if (o.type === 'valeur') {
        if (BUTIN.ajouter(e.sac, o.id)) evs.push({ t: 'butin', id: e.id, quoi: 'valeur', objet: o.id, valeur: BUTIN.valeur(o.id), coffre: c.id });
        else { reste.push(o.id); evs.push({ t: 'plein', id: e.id, objet: o.id }); }
      } else if (o.type === 'cle') {
        if (!e.cle) { e.cle = true; evs.push({ t: 'cle', id: e.id, quoi: 'trouvee', coffre: c.id }); annonce(evs, `${nomDe(e)} ${verbe(e, 'trouves', 'trouve')} la clé du coffre-fort !`); } else cle = true;
      } else if (o.type === 'silencieux') {
        const a = fixerSilencieux(e); if (a) evs.push({ t: 'butin', id: e.id, quoi: 'silencieux', objet: a, coffre: c.id });
      } else if (o.type !== 'arme' && servir(jeu, e, o.type)) evs.push({ t: 'butin', id: e.id, quoi: o.type, objet: o.type, coffre: c.id }); // sert tout de suite
      else if (o.type !== 'arme' && BUTIN.ajouter(e.sac, o.type)) evs.push({ t: 'butin', id: e.id, quoi: o.type, objet: o.type, coffre: c.id, sac: true }); // dans le sac (pour plus tard, ou ramené)
      else {
        // une arme (au choix : posée à côté, avec sa rareté), ou un consommable qui ne tient plus (posé pour un équipier)
        const nom = o.type === 'arme' ? o.arme : o.type; if (!REGLES.OBJETS[nom]) continue;
        if ((nom === 'soin' && jeu.vieMax <= 1) || (nom === 'armure' && jeu.armureMax <= 0)) continue;
        const p = aCote(jeu, c.x, c.z, e.x, e.z, k++); poserObjet(jeu, A, p[0], p[1], nom, o.type === 'arme' ? o.rarete || c.rarete : null);
      }
    }
    if (reste.length || cle) { const p = aCote(jeu, c.x, c.z, e.x, e.z, k++); poserSac(jeu, A, p[0], p[1], reste, null, evs, cle); }
    if (c.special === 'coffre-fort') annonce(evs, `${nomDe(e)} ${verbe(e, 'ouvres', 'ouvre')} le coffre-fort : le trésor de la mairie !`);
    else if (c.rarete === 'legendaire') annonce(evs, `${nomDe(e)} ${verbe(e, 'ouvres', 'ouvre')} un coffre légendaire !`);
    else if (!A.premierCoffre) annonce(evs, `Premier coffre : ${toi(e)} !`);
    A.premierCoffre = true;
  }
  // ramasser un sac au sol : la clé, puis ce qui tient, le plus précieux d'abord
  function ramasserSac(jeu, A, e, s, evs) {
    if (s.cle && !e.cle) { s.cle = false; e.cle = true; evs.push({ t: 'cle', id: e.id, quoi: 'trouvee', sac: s.id }); }
    const pris = [], ordre = s.objets.slice().sort((a, b) => BUTIN.valeur(b) - BUTIN.valeur(a));
    for (const id of ordre) if (BUTIN.ajouter(e.sac, id)) { pris.push(id); s.objets.splice(s.objets.indexOf(id), 1); evs.push({ t: 'butin', id: e.id, quoi: BUTIN.VALEURS[id] ? 'valeur' : id, objet: id, valeur: BUTIN.valeur(id), sac: s.id, de: s.de }); }
    if (!s.objets.length && !s.cle) s.dispo = false;
    evs.push({ t: 'sac', quoi: s.dispo ? 'pris' : 'vide', sac: s.id, par: e.id, de: s.de, pris, objets: s.objets.slice(), cle: s.cle });
    if (s.dispo && s.objets.length) evs.push({ t: 'plein', id: e.id, objet: s.objets[0] });
  }
  // relever un équipier à terre
  function relever(jeu, A, e, v, evs) {
    v.aTerre = false; v.vivant = true; v.vie = Math.max(1, Math.round(jeu.vieMax * X.relever.vie)); v.armure = 0; v.invincible = 1;
    v.vx = v.vz = v.vy = 0; v.auSol = true; v.y = jeu.monde.hauteur(v.x, v.z); v.ax = v.x; v.ay = v.y; v.az = v.z;
    v.posture = v.vers = 'debout'; v.transition = 0; v.accroupi = false; v.oeil = J.postures.debout.oeil; v.hautCapsule = J.postures.debout.haut; v.aoeil = v.oeil;
    v.prochainTir = jeu.temps + 0.3; v.interaction = null; v.sortie = 0;
    evs.push({ t: 'releve', id: v.id, par: e.id });
    annonce(evs, `${nomDe(e)} ${verbe(e, 'relèves', 'relève')} ${toi(v)} !`);
  }
  // sortir par un point d'extraction
  function extraire(jeu, A, e, p, evs) {
    const objets = e.sac.objets.slice(), valeur = BUTIN.valeurDe(objets);
    e.extrait = true; e.vivant = false; e.interaction = null; e.sortie = 0; e.sortiePoint = null; e.mortDepuis = jeu.temps; e.cle = false;
    const materiel = e.armeTrouvee && e.armes[0] === e.armeTrouvee.arme ? [{ type: 'arme', arme: e.armeTrouvee.arme, rarete: e.armeTrouvee.rarete }] : [];
    e.butin.extrait = objets; e.butin.materiel = materiel; e.butin.point = p.id; e.butin.valeurExtraite = valeur; e.score.points += valeur + e.butin.primes;
    evs.push({ t: 'extrait', id: e.id, point: p.id, nom: p.nom, valeur, objets, materiel, primes: e.butin.primes });
    annonce(evs, `${nomDe(e)} ${verbe(e, 'sors', 'sort')} par ${minuscule(p.nom)} avec ${valeur} pièces !`);
  }
  // perdre ce qu'on porte (mort : le sac tombe au sol, avec la clé ; fin du temps : perdu)
  function perdre(jeu, A, e, raison, evs) {
    const objets = e.sac.objets.slice(), valeur = BUTIN.valeurDe(objets), cle = e.cle;
    if ((objets.length || cle) && raison === 'mort') poserSac(jeu, A, e.x, e.z, objets, e.id, evs, cle);
    const arme = e.armeTrouvee && e.armes[0] === e.armeTrouvee.arme ? e.armeTrouvee : null; e.armeTrouvee = null; // l'arme trouvée est perdue aussi
    e.butin.perdu = e.butin.perdu.concat(objets); e.butin.valeurPerdue += valeur; e.sac.objets.length = 0; e.cle = false;
    if (arme) e.butin.materielPerdu.push({ type: 'arme', arme: arme.arme, rarete: arme.rarete });
    evs.push({ t: 'perdu', id: e.id, raison, valeur, objets, arme: arme ? arme.arme : null });
  }
  function eliminer(jeu, A, e, par, evs) {
    e.elimine = true; e.aTerre = false; e.vivant = false; e.interaction = null;
    let n = 0; for (const c of jeu.entites) if (enJeu(c)) n++;
    evs.push({ t: 'elimine', id: e.id, par: par || null, enLice: n });
  }

  // ─── chaque pas : extractions, largage, Gardien, prime, signaux, interactions, extraction, fin ───
  function tick(jeu, dt, evs) {
    const A = jeu.extraction; if (!A) return;
    const T = jeu.temps, reste = jeu.reste, es = jeu.entites;
    if (!A.ouvertes && T >= A.ouvreA) {
      A.ouvertes = true;
      evs.push({ t: 'extractions', quoi: 'ouvertes', points: A.extractions.map((p) => ({ id: p.id, nom: p.nom, x: r2(p.x), z: r2(p.z), rayon: p.rayon })) });
      annonce(evs, A.extractions.length === 2 ? `Extractions ouvertes : ${minuscule(A.extractions[0].nom)} et ${minuscule(A.extractions[1].nom)} !` : 'Extractions ouvertes !');
    }
    if (reste !== undefined) for (const [s, texte] of [[60, 'Plus qu’une minute pour sortir !'], [30, '30 secondes pour sortir !'], [10, '10 secondes !']]) if (reste <= s && reste > 0 && !A.chrono[s] && jeu.duree > s) { A.chrono[s] = true; annonce(evs, texte); }
    largage(jeu, A, T, evs);
    gardien(jeu, A, evs);
    if (A.format !== 'ensemble' && T >= A.prime.prochainA) prime(jeu, A, evs);
    if (A.signaux.length) for (let i = A.signaux.length - 1; i >= 0; i--) if (A.signaux[i].jusqua <= T) A.signaux.splice(i, 1);
    // une arme d'un coffre ramassée (PJEU : 'ramasse' de ce pas) : elle devient la principale, avec sa rareté (ramenée si l'on sort)
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]; if (ev.t !== 'ramasse' || typeof ev.oid !== 'string' || ev.oid[0] !== 'x') continue;
      const o = A.objets.find((q) => q.id === ev.oid), e = jeu.trouver(ev.id);
      if (o && e && e.sac && REGLES.OBJETS[o.objet] && REGLES.OBJETS[o.objet].type === 'arme') e.armeTrouvee = { arme: REGLES.OBJETS[o.objet].arme, rarete: o.rarete || 'commun' };
    }
    const P = X.poids;
    for (let k = 0; k < es.length; k++) {
      const e = es[k]; if (!e.humain || !e.sac || e.extrait || e.elimine) continue;
      if (e.aTerre) { // personne pour le relever (ou le délai passé) : éliminé
        let quelquun = false; for (const c of es) if (c !== e && c.humain && c.vivant && !c.extrait && !jeu.ennemis(c, e)) quelquun = true;
        if (T >= e.aTerreJusqua || !quelquun) eliminer(jeu, A, e, e.parQui, evs);
        continue;
      }
      if (!e.vivant) continue;
      e.ralenti = Math.min(P.max, Math.max(0, BUTIN.casesDe(e.sac.objets) - P.seuil) * P.parCase); // le poids du sac
      const touche = e.toucheA > e.toucheVu; e.toucheVu = e.toucheA;
      // l'extraction : dans un cercle ouvert, sans être touché
      let p = null;
      if (A.ouvertes) for (const q of A.extractions) if (d2(e.x, e.z, q.x, q.z) <= q.rayon * q.rayon) { p = q; break; }
      if (p) {
        if (e.sortiePoint !== p.id) { e.sortiePoint = p.id; e.sortie = 0; evs.push({ t: 'ouverture', id: e.id, quoi: 'extraction', cible: p.id, duree: X.extraction.duree, etat: 'debut' }); }
        if (touche) { if (e.sortie > 0) evs.push({ t: 'ouverture', id: e.id, quoi: 'extraction', cible: p.id, duree: X.extraction.duree, etat: 'coupe' }); e.sortie = 0; }
        else e.sortie += dt;
        if (e.sortie >= X.extraction.duree) { evs.push({ t: 'ouverture', id: e.id, quoi: 'extraction', cible: p.id, duree: X.extraction.duree, etat: 'fin' }); extraire(jeu, A, e, p, evs); continue; }
      } else if (e.sortiePoint) { evs.push({ t: 'ouverture', id: e.id, quoi: 'extraction', cible: e.sortiePoint, duree: X.extraction.duree, etat: 'coupe' }); e.sortiePoint = null; e.sortie = 0; }
      // les sacs qu'on a lâchés : repris seulement après s'en être éloigné
      for (const s of A.sacs) if (s.dispo && s.attend[e.id] && d2(e.x, e.z, s.x, s.z) > 2.5 * 2.5) delete s.attend[e.id];
      interagir(jeu, A, e, touche, dt, evs);
    }
    // la fin : le temps écoulé (ceux qui ne sont pas sortis perdent ce qu'ils portent), ou plus personne dans la partie
    if (!A.termine) {
      let humains = 0, dedans = 0; for (const e of es) if (e.humain && e.sac) { humains++; if (enJeu(e)) dedans++; }
      if (reste !== undefined && reste <= 0) {
        for (const e of es) if (enJeu(e)) { perdre(jeu, A, e, 'temps', evs); e.perdu = true; e.interaction = null; }
        annonce(evs, 'Temps écoulé !'); A.termine = true; A.finA = T;
      } else if (humains > 0 && dedans === 0) { A.termine = true; A.finA = T + 2; }
    }
  }
  // le largage : annoncé 15 s avant, la caisse tombe (un coffre de plus), deux gardiens arrivent 20 s après
  function largage(jeu, A, T, evs) {
    const L = A.largage; if (!L) return;
    if (!L.annonce && T >= L.A - 15) { L.annonce = true; evs.push({ t: 'largage', quoi: 'annonce', x: r2(L.x), z: r2(L.z), dans: r2(Math.max(0, L.A - T)) }); annonce(evs, 'Un largage arrive : cherchez la fumée rouge !'); }
    if (!L.tombe && T >= L.A) {
      L.tombe = true; L.gardesA = T + X.largage.arrivee; A.coffres.push(L.coffre);
      evs.push({ t: 'largage', quoi: 'tombe', id: L.coffre.id, x: r2(L.x), z: r2(L.z), rarete: L.coffre.rarete });
      annonce(evs, L.coffre.rarete === 'legendaire' ? 'Largage ! Une caisse légendaire est tombée.' : 'Largage ! Une caisse épique est tombée.');
    }
    if (L.tombe && T >= L.gardesA) { L.gardesA = Infinity; renforts(jeu, A, X.largage.gardes, L.x, L.z, 'largage', evs); }
  }
  // le Gardien : à la moitié de sa vie, il appelle des renforts
  function gardien(jeu, A, evs) {
    if (!A.boss) return;
    const b = jeu.trouver(A.boss); if (!b || !b.boss || b.boss.renforts || !b.vivant) return;
    if (b.vie > b.boss.vieMax * X.boss.renforts) return;
    b.boss.renforts = true;
    renforts(jeu, A, X.boss.nRenforts[jeu.reglages.niveau] || 2, b.x, b.z, 'boss', evs);
    annonce(evs, 'Le Gardien appelle des renforts !');
  }
  // la prime : le plus riche (au-delà du seuil) révélé à tous
  function prime(jeu, A, evs) {
    const Pr = X.prime; A.prime.prochainA += Pr.periode;
    let best = null, bv = Pr.seuil - 1;
    for (const e of jeu.entites) if (e.humain && e.sac && e.vivant && !e.extrait) { const v = BUTIN.valeurSac(e.sac); if (v > bv) { bv = v; best = e; } }
    if (!best) { A.prime.id = null; return; }
    const montant = Math.max(Pr.min, Math.min(Pr.max, Math.round(bv * Pr.part)));
    A.prime.id = best.id; A.prime.valeur = bv; A.prime.montant = montant;
    evs.push({ t: 'prime', quoi: 'revele', id: best.id, x: r2(best.x), z: r2(best.z), valeur: bv, prime: montant });
    annonce(evs, `Prime de ${montant} pièces sur ${toi(best)} (${bv} pièces dans le sac) !`);
  }

  // l'interaction en cours (coffre, sac, relever) : immobile, à côté, sans être touché ; sinon coupée ; ouvrir fait du bruit
  function interagir(jeu, A, e, touche, dt, evs) {
    const immobile = e.auSol && !(e.vitesse > X.ouverture.bouge);
    let it = e.interaction;
    if (it) {
      const c = cibleDe(jeu, A, it), ok = c && valide(jeu, A, e, it.quoi, c) && immobile && !touche;
      if (!ok) { evs.push({ t: 'ouverture', id: e.id, quoi: it.quoi, cible: it.cible, duree: it.duree, etat: 'coupe' }); e.interaction = it = null; }
      else {
        const avant = Math.floor(it.t / 0.5); it.t += dt; it.prog = Math.min(1, it.t / it.duree);
        if (it.quoi === 'coffre' && Math.floor(it.t / 0.5) > avant) jeu.faireBruit(e, c.verrou ? X.bruits.coffreFort : X.bruits.ouvrir);
        if (it.t >= it.duree) {
          e.interaction = null;
          evs.push({ t: 'ouverture', id: e.id, quoi: it.quoi, cible: it.cible, duree: it.duree, etat: 'fin' });
          if (it.quoi === 'coffre') ouvrir(jeu, A, e, c, evs); else if (it.quoi === 'sac') ramasserSac(jeu, A, e, c, evs); else relever(jeu, A, e, c, evs);
        }
        return;
      }
    }
    if (!immobile || touche) return;
    // une nouvelle : relever (un équipier à terre) > coffre fermé (verrouillé : avec la clé) > sac au sol (si quelque chose y tient)
    let quoi = null, cible = null, bd = Infinity, verrou = null;
    for (const v of jeu.entites) if (v !== e && v.aTerre && v.humain && !jeu.ennemis(e, v)) { const d = d2(e.x, e.z, v.x, v.z); if (d <= X.relever.distance * X.relever.distance && d < bd) { bd = d; quoi = 'relever'; cible = v; } }
    if (!cible) for (const c of A.coffres) if (!c.ouvert) {
      const d = d2(e.x, e.z, c.x, c.z); if (d > X.ouverture.distance * X.ouverture.distance || d >= bd || Math.abs(e.y - c.y) >= 2) continue;
      if (c.verrou && !e.cle) { verrou = c; continue; }
      bd = d; quoi = 'coffre'; cible = c;
    }
    if (!cible) for (const s of A.sacs) if (valide(jeu, A, e, 'sac', s)) { const d = d2(e.x, e.z, s.x, s.z); if (d < bd) { bd = d; quoi = 'sac'; cible = s; } }
    if (verrou && !cible) { if (e.verrouVu !== verrou.id) { e.verrouVu = verrou.id; evs.push({ t: 'verrou', id: e.id, coffre: verrou.id }); } } else if (!verrou) e.verrouVu = null;
    if (!cible) return;
    const duree = quoi === 'relever' ? X.relever.duree : quoi === 'sac' ? X.ramasser.duree : cible.verrou ? X.coffreFort.duree : e.dureeOuverture || X.ouverture.duree;
    e.interaction = { quoi, cible: cible.id, t: 0, prog: 0, duree };
    evs.push({ t: 'ouverture', id: e.id, quoi, cible: cible.id, duree, etat: 'debut' });
    if (quoi === 'coffre') jeu.faireBruit(e, cible.verrou ? X.bruits.coffreFort : X.bruits.ouvrir);
  }
  function cibleDe(jeu, A, it) {
    if (it.quoi === 'relever') return jeu.trouver(it.cible);
    const l = it.quoi === 'coffre' ? A.coffres : A.sacs; for (let i = 0; i < l.length; i++) if (l[i].id === it.cible) return l[i];
    return null;
  }
  function valide(jeu, A, e, quoi, c) {
    if (quoi === 'relever') return c.aTerre && !c.elimine && d2(e.x, e.z, c.x, c.z) <= X.relever.distance * X.relever.distance;
    if (quoi === 'coffre') return !c.ouvert && (!c.verrou || e.cle) && d2(e.x, e.z, c.x, c.z) <= X.ouverture.distance * X.ouverture.distance;
    if (!c.dispo || c.attend[e.id] || d2(e.x, e.z, c.x, c.z) > X.ramasser.distance * X.ramasser.distance) return false;
    if (c.cle && !e.cle) return true;
    for (const id of c.objets) if (BUTIN.tient(e.sac, id)) return true;
    return false;
  }

  // ─── une mort : points, prime, sac au sol, à terre (avec un équipier) ou éliminé ───
  function surMort(jeu, v, k, evs) {
    const A = jeu.extraction; if (!A) return;
    if (k && k !== v && k.humain && k.butin && jeu.ennemis(k, v)) {
      k.score.points += v.boss ? X.boss.points : v.bot ? BUTIN.POINTS.gardien : BUTIN.POINTS.joueur;
      if (v.bot) k.butin.killsRobots++; else k.butin.killsJoueurs++;
      if (v.boss) k.butin.boss = true;
      if (!v.bot && A.prime.id === v.id) { // la prime : au tueur, versée s'il sort
        k.butin.primes += A.prime.montant;
        evs.push({ t: 'prime', quoi: 'gagnee', id: k.id, cible: v.id, prime: A.prime.montant });
        annonce(evs, `${nomDe(k)} ${verbe(k, 'gagnes', 'gagne')} la prime : ${A.prime.montant} pièces (s’${k.humain && k.nom === 'Toi' ? 'tu sors' : 'il sort'}) !`);
      }
    }
    if (!v.bot && A.prime.id === v.id) A.prime.id = null;
    if (v.bot) { // un gardien laisse parfois des munitions ou un soin
      if (v.boss) annonce(evs, k && k.humain ? `${nomDe(k)} ${verbe(k, 'abats', 'abat')} le Gardien !` : 'Le Gardien est tombé !');
      const r = jeu.rnd();
      if (r < 0.5 || v.boss) poserObjet(jeu, A, v.x, v.z, r < 0.35 ? 'munitions' : jeu.vieMax > 1 ? 'soin' : 'munitions');
      return;
    }
    if (!v.sac) return;
    v.interaction = null; v.sortie = 0; v.sortiePoint = null;
    perdre(jeu, A, v, 'mort', evs);
    let equipier = false;
    for (const c of jeu.entites) if (c !== v && c.humain && c.vivant && !c.extrait && !jeu.ennemis(c, v)) equipier = true;
    if (A.equipes && equipier) {
      v.aTerre = true; v.aTerreJusqua = jeu.temps + X.relever.delai;
      evs.push({ t: 'a-terre', id: v.id, par: k ? k.id : null, jusqua: r2(v.aTerreJusqua) });
      annonce(evs, v.humain && v.nom === 'Toi' ? 'Tu es à terre : un équipier peut te relever !' : `${v.nom} est à terre : relève-le !`);
    } else eliminer(jeu, A, v, k ? k.id : null, evs);
  }

  function objets(jeu) { return jeu.extraction ? jeu.extraction.objets : VIDE; }
  function fini(jeu) { const A = jeu.extraction; if (!A) return jeu.duree > 0 && jeu.temps >= jeu.duree; return A.termine && jeu.temps >= A.finA; }
  // le classement : le score (valeur extraite + éliminations + primes), puis les éliminations ; les humains devant les robots
  const trier = (a, b) => (a.bot === b.bot ? 0 : a.bot ? 1 : -1) || b.score.points - a.score.points || b.score.kills - a.score.kills || a.score.morts - b.score.morts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // la ligne de résultat d'un joueur (le classement « Butin » de l'intégrateur la reprend ; PBUTIN.deposer et progression la lisent)
  function bilan(e, A) {
    const b = e.butin || { coffres: 0, coffresPar: {}, extrait: [], materiel: [], perdu: [], materielPerdu: [], point: null, valeurExtraite: 0, valeurPerdue: 0, killsRobots: 0, killsJoueurs: 0, boss: false, primes: 0 };
    const versees = e.extrait ? b.primes : 0, points = e.score.points - b.valeurExtraite - versees;
    return { id: e.id, nom: e.nom, couleur: e.couleur, equipe: e.equipe, format: A ? A.format : 'ensemble', zoneSemaine: !!(A && A.zoneSemaine),
      extrait: !!e.extrait, point: b.point, objets: b.extrait.slice(), materiel: b.materiel.map((m) => Object.assign({}, m)), valeur: b.valeurExtraite,
      perdu: b.perdu.slice(), materielPerdu: b.materielPerdu.map((m) => Object.assign({}, m)), valeurPerdue: b.valeurPerdue, porte: e.sac ? e.sac.objets.slice() : [],
      coffres: b.coffres, coffresPar: Object.assign({}, b.coffresPar), kills: e.score.kills, killsRobots: b.killsRobots, killsJoueurs: b.killsJoueurs, boss: b.boss, morts: e.score.morts,
      primesGagnees: b.primes, primes: versees, points, score: BUTIN.score({ valeur: b.valeurExtraite, points, primes: versees }) };
  }
  function resultat(jeu) {
    const A = jeu.extraction, classement = jeu.resume ? jeu.resume() : jeu.classement();
    const joueurs = jeu.entites.filter((e) => e.humain && e.sac).map((e) => bilan(e, A)).sort((a, b) => b.score - a.score || b.valeur - a.valeur);
    let gagnant = null, equipes = null;
    if (A && A.format === 'equipes') { // les équipes : la somme des scores de leurs membres
      equipes = []; for (let i = 0; i < A.nEquipes; i++) { const m = joueurs.filter((j) => j.equipe === i); equipes.push({ equipe: i, membres: m.map((j) => j.id), valeur: m.reduce((s, j) => s + j.valeur, 0), score: m.reduce((s, j) => s + j.score, 0) }); }
      const tri = equipes.slice().sort((a, b) => b.score - a.score); if (tri.length && tri[0].score > 0 && (tri.length < 2 || tri[0].score > tri[1].score)) gagnant = tri[0].equipe;
    } else gagnant = joueurs.length && joueurs[0].score > 0 && (joueurs.length < 2 || joueurs[0].score > joueurs[1].score) ? joueurs[0].id : null;
    return { classement, gagnant, duree: jeu.duree > 0 ? Math.min(jeu.temps, jeu.duree) : jeu.temps, equipes: !!(A && A.equipes), scores: equipes ? equipes.map((q) => q.score) : null,
      extraction: { format: A ? A.format : 'ensemble', zone: A && A.zone ? A.zone.id || null : null, zoneSemaine: !!(A && A.zoneSemaine), joueurs, equipes,
        coffres: { total: A ? A.coffres.length : 0, ouverts: A ? A.coffres.filter((c) => c.ouvert).length : 0 },
        valeurExtraite: joueurs.reduce((s, j) => s + j.valeur, 0), points: A ? A.extractions.map((p) => ({ id: p.id, nom: p.nom })) : [] } };
  }

  // ─── pour le jeu en ligne : l'état du mode en JSON compact (l'hôte fait autorité) et sa lecture chez un client ───
  // { o: '0110…' (coffres ouverts, dans l'ordre de jeu.extraction.coffres ; la caisse du largage à la fin une fois tombée), x: 0 | 1
  //   (extractions ouvertes), l: 0 | 1 (largage tombé), s: [[id, x, z, [objets], cle 0 | 1], …] (sacs au sol disponibles),
  //   j: [[id, [objets du sac], drapeaux (1 à terre, 2 extrait, 4 éliminé, 8 perdu, 16 a la clé, 32 lampe), quoi ('' | 'coffre' | 'sac' |
  //   'relever'), prog, sortie, silencieux ('' | arme)], …], p: [id primé, montant] | 0, g: [[id, de, equipe, type, x, y, z, reste], …] }
  function etat(jeu) {
    const A = jeu.extraction; if (!A) return null;
    let o = ''; for (const c of A.coffres) o += c.ouvert ? '1' : '0';
    const s = []; for (const q of A.sacs) if (q.dispo) s.push([q.id, r2(q.x), r2(q.z), q.objets.slice(), q.cle ? 1 : 0]);
    const j = []; for (const e of jeu.entites) if (e.humain && e.sac) j.push([e.id, e.sac.objets.slice(), (e.aTerre ? 1 : 0) | (e.extrait ? 2 : 0) | (e.elimine ? 4 : 0) | (e.perdu ? 8 : 0) | (e.cle ? 16 : 0) | (e.lampe ? 32 : 0), e.interaction ? e.interaction.quoi : '', e.interaction ? r2(e.interaction.prog) : 0, r2(e.sortie || 0), e.silencieux || '']);
    const g = A.signaux.map((q) => [q.id, q.de, q.equipe, q.type, q.x, q.y, q.z, r2(Math.max(0, q.jusqua - jeu.temps))]);
    return { o, x: A.ouvertes ? 1 : 0, l: A.largage && A.largage.tombe ? 1 : 0, s, j, p: A.prime.id ? [A.prime.id, A.prime.montant] : 0, g };
  }
  const objetConnu = (id) => !!(BUTIN.VALEURS[id] || BUTIN.CONSOMMABLES[id]);
  function lireEtat(jeu, et) {
    const A = jeu.extraction; if (!A || !et || typeof et !== 'object') return false;
    if (et.l === 1 && A.largage && !A.largage.tombe) { A.largage.tombe = true; A.coffres.push(A.largage.coffre); }
    if (typeof et.o === 'string') for (let i = 0; i < A.coffres.length && i < et.o.length; i++) A.coffres[i].ouvert = et.o[i] === '1';
    A.ouvertes = et.x === 1;
    if (Array.isArray(et.s)) {
      const vus = new Set();
      for (const q of et.s) {
        if (!Array.isArray(q) || typeof q[0] !== 'string' || !fin(+q[1]) || !fin(+q[2])) continue; vus.add(q[0]);
        let s = A.sacs.find((x) => x.id === q[0]);
        if (!s) { s = { id: q[0], x: +q[1], z: +q[2], y: jeu.monde.hauteur(+q[1], +q[2]), objets: [], de: null, dispo: true, attend: {}, cle: false }; A.sacs.push(s); }
        s.objets = Array.isArray(q[3]) ? q[3].filter(objetConnu) : []; s.cle = q[4] === 1; s.dispo = true;
      }
      for (const s of A.sacs) if (!vus.has(s.id)) s.dispo = false;
    }
    if (Array.isArray(et.j)) for (const l of et.j) {
      const e = Array.isArray(l) ? jeu.trouver(l[0]) : null; if (!e || !e.sac) continue;
      e.sac.objets = Array.isArray(l[1]) ? l[1].filter(objetConnu) : [];
      const f = l[2] | 0; e.aTerre = !!(f & 1); e.extrait = !!(f & 2); e.elimine = !!(f & 4); e.perdu = !!(f & 8); e.cle = !!(f & 16); e.lampe = !!(f & 32);
      e.interaction = l[3] ? { quoi: l[3], cible: null, t: 0, prog: +l[4] || 0, duree: 1 } : null; e.sortie = +l[5] || 0; e.silencieux = typeof l[6] === 'string' && l[6] ? l[6] : null;
    }
    A.prime.id = Array.isArray(et.p) ? String(et.p[0]) : null; A.prime.montant = Array.isArray(et.p) ? +et.p[1] || 0 : 0;
    if (Array.isArray(et.g)) A.signaux = et.g.filter((q) => Array.isArray(q) && SIGNAUX.indexOf(q[3]) >= 0).map((q) => ({ id: String(q[0]), de: String(q[1]), equipe: q[2], type: q[3], x: +q[4], y: +q[5], z: +q[6], jusqua: jeu.temps + (+q[7] || 0) }));
    return true;
  }

  // le point d'extraction le plus proche (HUD : flèche et distance) → { point, d } | null
  function plusProche(jeu, x, z) {
    const A = jeu.extraction; if (!A) return null;
    let best = null, bd = Infinity; for (const p of A.extractions) { const d = Math.sqrt(d2(x, z, p.x, p.z)); if (d < bd) { bd = d; best = p; } }
    return best ? { point: best, d: bd } : null;
  }

  return { id: 'extraction', nom: 'Extraction', zones: true, init, nouveau, place, apparition, agir, tick, surMort, objets, fini, resultat, trier,
    etat, lireEtat, plusProche, signauxPour, bilan, renforts, COULEUR_GARDIENS, COULEUR_BOSS, SIGNAUX, SIGNAL_DUREE, SIGNAL_MAX };
});
