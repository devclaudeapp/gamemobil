/* OPÉRATION PONCIN — le mode Extraction : 8 minutes (5 / 8 / 12) dans la zone choisie (par défaut tout le bourg), 1 à 3 humains
   ensemble (réglage equipes, vrai par défaut ; faux : chacun pour soi) contre des robots gardiens. On part avec l'équipement choisi
   (plus les améliorations du coffre personnel : armure de départ, chargeur en plus, sac plus grand, ouverture plus rapide) ; dans la
   zone, 20 à 40 coffres (posés par PZONES avec la zone : mêmes chez tous) commun / rare / épique / légendaire, à ouvrir en restant
   1,2 s à côté sans bouger (coupé si l'on bouge ou si l'on est touché) : objets de valeur dans le sac (des cases, PBUTIN), soins,
   armure et munitions pris tout de suite s'ils servent (sinon posés au sol), une meilleure principale posée à côté. Le sac plein, ce
   qui ne tient pas reste au sol (un sac au sol, à ramasser en restant 0,5 s à côté) ; en.lacher = i lâche l'objet i du sac,
   en.utiliser = i s'en sert (un consommable rangé dans le sac quand il ne servait pas tout de suite). Ramené : les objets du sac et
   l'arme trouvée encore en main (le matériel du coffre personnel).
   À mi-partie, deux points d'extraction s'ouvrent (le pont, la cale de la rivière : PZONES ; balise + annonce) : rester 8 s dans le
   cercle de 10 m sans être touché = extrait (la partie continue pour les autres). Mort : le sac tombe au sol (un équipier peut le
   ramasser) ; seul (ou chacun pour soi), on est éliminé ; en équipe, à terre : un équipier relève en restant 4 s à côté dans les 30 s,
   sinon éliminé. Fin du temps : ceux qui ne sont pas sortis perdent ce qu'ils portent. Score : la valeur extraite + 10 par gardien,
   25 par joueur éliminé (PBUTIN.POINTS). Après la partie, resultat(jeu).extraction.joueurs donne pour chacun ce qui est sorti (objets et
   materiel, à déposer au coffre personnel : PBUTIN.deposer(coffre, ligne)) et ce qui est perdu.
   Les gardiens (PBOTS, entité e.garde = { x, z, cx, cz, laisse, ronde }) : des groupes près des coffres rares et mieux (autant que
   MODES.extraction.gardiens[niveau] : par légendaire, par épique, par rare), et des patrouilles à deux sur une ronde entre les coffres ;
   ils restent à leur poste, chassent jusqu'à leur laisse, puis y retournent ; tous dans le camp 'gardiens' (ils ne se tirent pas dessus).
   Un mode est un jeu de crochets appelés par PJEU (comme PARENE) : zones, init, nouveau, place, apparition, agir, tick, surMort,
   objets, fini, resultat, trier. L'état est dans jeu.extraction (jeu.arene = { robots } pour enligne.js). Événements (en plus de ceux de
   PJEU, voir src-poncin/ARCHITECTURE.md « Extraction ») : 'ouverture', 'coffre', 'butin', 'plein', 'sac', 'extractions', 'extrait',
   'perdu', 'a-terre', 'releve', 'elimine', 'annonce'. Module pur (aucun DOM, aucun THREE) : tourne aussi dans Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'), require('./butin.js'), require('./zones.js'));
  else root.PEXTRACTION = factory(root.PREGLES, root.PBUTIN, root.PZONES);
})(typeof self !== 'undefined' ? self : this, function (REGLES, BUTIN, ZONES) {
  'use strict';
  const X = REGLES.MODES.extraction, J = REGLES.JOUEUR, G = X.gardiens;
  const VIDE = [];
  const fin = (v) => typeof v === 'number' && v - v === 0;
  const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
  const COULEUR_GARDIENS = ['#FF6B8B', '#7FB3FF', '#5FD3A4', '#B8A6FF', '#FF9F5A', '#4FD1E0', '#F48FD8'];
  const nomDe = (e) => (e.humain && e.nom === 'Toi' ? 'Tu' : e.nom);
  const verbe = (e, tu, il) => (e.humain && e.nom === 'Toi' ? tu : il);
  function annonce(evs, texte) { evs.push({ t: 'annonce', texte }); }
  const enJeu = (e) => e.humain && !e.extrait && !e.elimine && !e.retire;   // encore dans la partie (vivant ou à terre)

  // ─── la mise en place : coffres, points d'extraction, gardiens ───
  function init(jeu) {
    const monde = jeu.monde, R = jeu.reglages || jeu.options;
    let zone = jeu.zone;
    if (zone && !zone.coffres && ZONES && ZONES.extraction) { try { ZONES.extraction(jeu.carte, monde, null, zone, REGLES.mulberry32((jeu.graine ^ 0x5EC0FF3) >>> 0), R); } catch (err) { /* repli ci-dessous */ } }
    if (!zone || !zone.coffres || !zone.extractions) zone = secours(jeu, zone);
    if (zone.limite) monde.limite = zone.limite;
    jeu.duree = R.duree > 0 ? R.duree : X.duree;
    const rndC = REGLES.mulberry32((jeu.graine ^ 0xC0FF3E) >>> 0); // le contenu des coffres : un hasard à part, le même partout
    const coffres = zone.coffres.map((c, i) => ({ id: 'c' + i, x: +c[0], z: +c[1], y: monde.hauteur(+c[0], +c[1]), rarete: c[2], special: c[3] || null,
      contenu: BUTIN.tirerContenu(c[2], rndC, { armes: R.armes, special: c[3] }), ouvert: false, par: null, ouvertA: -1 }));
    const extractions = zone.extractions.map((e) => ({ id: e.id, nom: e.nom, x: +e.x, z: +e.z, y: monde.hauteur(+e.x, +e.z), rayon: e.rayon > 0 ? +e.rayon : X.extraction.rayon }));
    const A = jeu.extraction = {
      zone, coffres, extractions, depart: (zone.depart || [extractions[0].x, extractions[0].z]).slice(), departs: null,
      ouvreA: jeu.duree * X.extraction.ouvre, ouvertes: false, sacs: [], objets: [], nSacs: 0, nObjets: 0,
      equipes: R.equipes !== false, chrono: {}, termine: false, finA: Infinity, robots: [], nHumains: 0, premierCoffre: false,
    };
    jeu.arene = { robots: A.robots }; // enligne.js lit jeu.arene.robots pour le message 'lancer'
    // les gardiens : ceux que l'hôte a listés (jeu.robots), sinon posés ici
    const liste = Array.isArray(jeu.robots) ? jeu.robots : gardiens(jeu, A, R);
    liste.forEach((r, k) => {
      jeu.ajouterJoueur({ id: typeof r.id === 'string' && r.id ? r.id : 'bot' + (k + 1), nom: typeof r.nom === 'string' ? r.nom : REGLES.NOMS_BOTS[k % REGLES.NOMS_BOTS.length],
        couleur: typeof r.couleur === 'string' ? r.couleur : COULEUR_GARDIENS[k % COULEUR_GARDIENS.length], bot: true, niveau: REGLES.BOTS[r.niveau] ? r.niveau : R.niveau, equip: r.equip, garde: r.garde });
    });
    for (const e of jeu.entites) if (e.bot) A.robots.push({ id: e.id, nom: e.nom, couleur: e.couleur, equip: e.equip.p + '+' + e.equip.s, niveau: e.niveau, garde: e.garde });
  }
  // sans zone préparée (PJEU sans PZONES) : 20 coffres et deux sorties au hasard rejouable autour du centre
  function secours(jeu, z) {
    const monde = jeu.monde, rnd = REGLES.mulberry32((jeu.graine ^ 0x5EC0FF3) >>> 0), c = z && z.englobant ? z.englobant.centre : [0, 0], r = z && z.englobant ? z.englobant.rayon : 110;
    const pt = () => monde.libre(rnd, c, r - 5), coffres = [], raretes = BUTIN.raretes(X.coffres.min);
    for (let k = 0; k < X.coffres.min; k++) { const p = pt(); coffres.push([p[0], p[1], raretes[k]]); }
    const a = pt(); let b = pt(); for (let k = 0; k < 30 && d2(a[0], a[1], b[0], b[1]) < r * r; k++) b = pt();
    const dep = pt();
    return Object.assign({}, z || {}, { englobant: { centre: c.slice(), rayon: r }, apparitions: (z && z.apparitions) || [], coffres, depart: dep,
      extractions: [{ id: 'sortie1', nom: 'Sortie A', x: a[0], z: a[1], rayon: X.extraction.rayon }, { id: 'sortie2', nom: 'Sortie B', x: b[0], z: b[1], rayon: X.extraction.rayon }] });
  }
  // les postes des gardiens : groupes autour des coffres rares et mieux, patrouilles à deux ; plafond selon le niveau et les humains
  function gardiens(jeu, A, R) {
    const monde = jeu.monde, rnd = jeu.rnd, niv = G[R.niveau] || G.normal;
    const max = Math.min(G.plafond, niv.max + G.parHumain * Math.max(0, (jeu.humains || 1) - 1));
    const libre = (x, z) => !monde.bloque(x, z, 0.6) && (typeof monde.accessible !== 'function' || monde.accessible(x, z)) && (!monde.limite || typeof monde.limite.dedans !== 'function' || monde.limite.dedans(x, z));
    const autour = (cx, cz, r0, r1) => { for (let k = 0; k < 40; k++) { const a = rnd() * 2 * Math.PI, r = r0 + (r1 - r0) * rnd(), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (libre(x, z)) return [x, z]; } return null; };
    const postes = [], groupe = (c, n, laisse) => { for (let k = 0; k < n; k++) { const p = autour(c.x, c.z, 3, 7); if (p) postes.push({ x: p[0], z: p[1], cx: c.x, cz: c.z, laisse, ronde: null }); } };
    const par = (r) => A.coffres.filter((c) => c.rarete === r);
    for (const c of par('legendaire')) groupe(c, niv.legendaire, 40);
    // les patrouilles : à deux, une ronde de 4 coffres voisins (rangés autour de leur centre)
    const rondes = [];
    for (let k = 0; k < niv.patrouilles && A.coffres.length >= 4; k++) {
      const c0 = A.coffres[Math.floor(rnd() * A.coffres.length)], proches = A.coffres.slice().sort((a, b) => d2(a.x, a.z, c0.x, c0.z) - d2(b.x, b.z, c0.x, c0.z)).slice(0, 4);
      const mx = proches.reduce((s, c) => s + c.x, 0) / 4, mz = proches.reduce((s, c) => s + c.z, 0) / 4;
      proches.sort((a, b) => Math.atan2(a.z - mz, a.x - mx) - Math.atan2(b.z - mz, b.x - mx));
      const ronde = []; for (const c of proches) { const p = autour(c.x, c.z, 2, 5); if (p) ronde.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]); }
      if (ronde.length >= 2) rondes.push({ ronde, mx, mz });
    }
    const patrouilles = [];
    for (const r of rondes) for (let k = 0; k < 2; k++) { const p = autour(r.ronde[0][0], r.ronde[0][1], 0.8, 2.5) || r.ronde[0]; patrouilles.push({ x: p[0], z: p[1], cx: r.mx, cz: r.mz, laisse: 70, ronde: r.ronde, depart: k }); }
    const epiques = []; for (const c of par('epique')) { const n0 = postes.length; groupe(c, niv.epique, 35); epiques.push(...postes.splice(n0)); }
    const rares = []; par('rare').forEach((c, i) => { const n = Math.floor((i + 1) * niv.rare) - Math.floor(i * niv.rare); const n0 = postes.length; groupe(c, n, 30); rares.push(...postes.splice(n0)); });
    const tous = postes.concat(patrouilles, epiques, rares).slice(0, max);
    // noms (mélangés, rejouables) et équipement (parmi les armes permises)
    const noms = REGLES.NOMS_BOTS.slice();
    for (let i = noms.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = noms[i]; noms[i] = noms[j]; noms[j] = t; }
    return tous.map((g, k) => {
      const equip = REGLES.equipementRobot(rnd, R, R.niveau);
      return { id: 'bot' + (k + 1), nom: noms[k % noms.length] + (k >= noms.length ? ' ' + (Math.floor(k / noms.length) + 1) : ''), couleur: COULEUR_GARDIENS[k % COULEUR_GARDIENS.length],
        niveau: R.niveau, equip: equip.p + '+' + equip.s, garde: { x: r2(g.x), z: r2(g.z), cx: r2(g.cx), cz: r2(g.cz), laisse: g.laisse, ronde: g.ronde, depart: g.depart | 0 } };
    });
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  function lireGarde(g) {
    if (!g || typeof g !== 'object' || !fin(+g.x) || !fin(+g.z)) return null;
    const ronde = Array.isArray(g.ronde) ? g.ronde.filter((p) => Array.isArray(p) && fin(+p[0]) && fin(+p[1])).map((p) => [+p[0], +p[1]]) : null;
    return { x: +g.x, z: +g.z, cx: fin(+g.cx) ? +g.cx : +g.x, cz: fin(+g.cz) ? +g.cz : +g.z, laisse: fin(+g.laisse) && g.laisse > 5 ? +g.laisse : 35, ronde: ronde && ronde.length >= 2 ? ronde : null, depart: g.depart | 0 };
  }

  // ─── un joueur arrive : son camp, son sac, ses améliorations ; un gardien : son poste ───
  function nouveau(jeu, e, d) {
    const A = jeu.extraction;
    if (e.bot) { e.equipe = 'gardiens'; e.garde = lireGarde(d && d.garde); return; }
    e.equipe = !A || A.equipes ? 0 : e.id; // en équipe : tous ensemble contre les gardiens ; sinon chacun pour soi
    e.ameliorations = BUTIN.bornerAmeliorations(d && d.ameliorations);
    const ef = BUTIN.effets(e.ameliorations);
    e.sac = BUTIN.sacVide(ef.cases); e.dureeOuverture = ef.ouverture;
    e.extrait = false; e.aTerre = false; e.aTerreJusqua = 0; e.elimine = false; e.perdu = false;
    e.interaction = null; e.sortie = 0; e.sortiePoint = null; e.toucheVu = -1;
    e.butin = { coffres: 0, extrait: [], materiel: [], perdu: [], materielPerdu: [], point: null, valeurExtraite: 0, valeurPerdue: 0 }; e.armeTrouvee = null;
    e.rang = A ? A.nHumains++ : 0;
  }
  // à chaque apparition (placer a rééquipé) : l'armure de départ et le chargeur en plus
  function place(jeu, e) {
    if (e.bot || !e.ameliorations) return;
    const ef = BUTIN.effets(e.ameliorations);
    e.armure = Math.min(jeu.armureMax, ef.armure);
    if (ef.chargeurs > 0) for (const id of e.armes) e.reserve[id] = (e.reserve[id] | 0) + ef.chargeurs * REGLES.arme(id).chargeur;
  }
  // le point d'apparition : le poste du gardien ; le départ de l'équipe (en petit cercle) ; chacun pour soi : un départ chacun
  function apparition(jeu, e) {
    const A = jeu.extraction, monde = jeu.monde;
    if (e.bot && e.garde) {
      const g = e.garde; let x = g.x, z = g.z;
      if (g.ronde) { const p = g.ronde[g.depart % g.ronde.length]; if (!monde.bloque(p[0], p[1], J.rayon) && g.depart) { x = p[0]; z = p[1]; } }
      return [x, z, Math.atan2(-(x - g.cx), -(z - g.cz))]; // dos au coffre : il regarde qui arrive
    }
    if (!A) return null;
    let dep = A.depart;
    if (!A.equipes && e.humain) dep = departs(jeu, A)[(e.rang | 0) % departs(jeu, A).length];
    const k = e.humain ? e.rang | 0 : 0, c = A.zone.englobant ? A.zone.englobant.centre : [0, 0];
    const yaw = Math.atan2(-(c[0] - dep[0]), -(c[1] - dep[1]));
    for (const r of A.equipes ? [2.2, 1.2, 0] : [0, 1.5]) {
      const a = k * 2.1, x = dep[0] + Math.cos(a) * r * (k ? 1 : 0), z = dep[1] + Math.sin(a) * r * (k ? 1 : 0);
      if (!monde.bloque(x, z, J.rayon)) return [x, z, yaw];
    }
    return [dep[0], dep[1], yaw];
  }
  // chacun pour soi : des départs écartés (40 m au moins), loin des points d'extraction
  function departs(jeu, A) {
    if (A.departs) return A.departs;
    const l = [A.depart], apps = (A.zone.apparitions || []).slice();
    const loinEx = (p) => Math.min(...A.extractions.map((x) => Math.sqrt(d2(p[0], p[1], x.x, x.z))));
    apps.sort((a, b) => loinEx(b) - loinEx(a));
    for (const p of apps) { if (l.length >= REGLES.SALON.max) break; if (l.every((q) => d2(p[0], p[1], q[0], q[1]) >= 40 * 40) && !jeu.monde.bloque(p[0], p[1], 0.6)) l.push([p[0], p[1]]); }
    A.departs = l; return l;
  }

  // ─── le sac en partie : en.utiliser = i (un consommable : soin, armure, munitions, s'il sert), en.lacher = i (au sol) ; des fronts ───
  function agir(jeu, e, en, dt, evs) {
    const A = jeu.extraction; if (!A || !e.sac || !e.vivant || !en) return;
    if (en.utiliser != null) {
      const i = +en.utiliser, id = i >= 0 && i < e.sac.objets.length ? e.sac.objets[i | 0] : null;
      if (id && servir(jeu, e, id)) { e.sac.objets.splice(i | 0, 1); evs.push({ t: 'butin', id: e.id, quoi: id, objet: id, utilise: true }); }
    }
    if (en.lacher == null) return;
    const i = +en.lacher; if (!(i >= 0 && i < e.sac.objets.length)) return;
    const id = BUTIN.retirer(e.sac, i | 0); if (!id) return;
    const s = poserSac(jeu, A, e.x, e.z, [id], e.id, evs);
    s.attend[e.id] = true; // pas repris tout de suite par celui qui l'a lâché (il doit s'en éloigner)
  }

  // un consommable appliqué s'il sert : rend vrai si oui
  function servir(jeu, e, type) {
    if (type === 'soin') { if (e.vie >= jeu.vieMax) return false; e.vie = Math.min(jeu.vieMax, e.vie + REGLES.OBJETS.soin.vie); return true; }
    if (type === 'armure') { if (e.armure >= jeu.armureMax) return false; e.armure = Math.min(jeu.armureMax, e.armure + REGLES.OBJETS.armure.armure); return true; }
    if (type === 'munitions') { if (!e.armes.some((id) => (e.reserve[id] | 0) < REGLES.arme(id).reserve)) return false; for (const id of e.armes) e.reserve[id] = Math.max(e.reserve[id] | 0, REGLES.arme(id).reserve); return true; }
    return false;
  }

  // ─── les sacs au sol (objets de valeur) et les objets posés (consommables, armes : ramassés au passage par PJEU, une seule fois) ───
  function poserSac(jeu, A, x, z, objets, de, evs) {
    const s = { id: 's' + A.nSacs++, x, z, y: jeu.monde.hauteur(x, z), objets: objets.slice(), de: de || null, dispo: true, attend: {} };
    A.sacs.push(s);
    evs.push({ t: 'sac', quoi: 'pose', sac: s.id, x: r2(x), z: r2(z), objets: s.objets.slice(), de: s.de });
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

  // ─── ouvrir un coffre ───
  function ouvrir(jeu, A, e, c, evs) {
    c.ouvert = true; c.par = e.id; c.ouvertA = jeu.temps; e.butin.coffres++;
    evs.push({ t: 'coffre', id: c.id, par: e.id, rarete: c.rarete, x: r2(c.x), z: r2(c.z), contenu: c.contenu.map((o) => Object.assign({}, o)) });
    const reste = []; let k = 0;
    for (const o of c.contenu) {
      if (o.type === 'valeur') {
        if (BUTIN.ajouter(e.sac, o.id)) evs.push({ t: 'butin', id: e.id, quoi: 'valeur', objet: o.id, valeur: BUTIN.valeur(o.id), coffre: c.id });
        else { reste.push(o.id); evs.push({ t: 'plein', id: e.id, objet: o.id }); }
      } else if (o.type !== 'arme' && servir(jeu, e, o.type)) evs.push({ t: 'butin', id: e.id, quoi: o.type, objet: o.type, coffre: c.id }); // sert tout de suite
      else if (o.type !== 'arme' && BUTIN.ajouter(e.sac, o.type)) evs.push({ t: 'butin', id: e.id, quoi: o.type, objet: o.type, coffre: c.id, sac: true }); // dans le sac (pour plus tard, ou ramené)
      else {
        // une arme (au choix : posée à côté, avec sa rareté), ou un consommable qui ne tient plus (posé pour un équipier)
        const nom = o.type === 'arme' ? o.arme : o.type; if (!REGLES.OBJETS[nom]) continue;
        if ((nom === 'soin' && jeu.vieMax <= 1) || (nom === 'armure' && jeu.armureMax <= 0)) continue;
        const p = aCote(jeu, c.x, c.z, e.x, e.z, k++); poserObjet(jeu, A, p[0], p[1], nom, o.type === 'arme' ? o.rarete || c.rarete : null);
      }
    }
    if (reste.length) { const p = aCote(jeu, c.x, c.z, e.x, e.z, k++); poserSac(jeu, A, p[0], p[1], reste, null, evs); }
    if (c.rarete === 'legendaire') annonce(evs, c.special === 'mairie' ? `${nomDe(e)} ${verbe(e, 'ouvres', 'ouvre')} le coffre de la mairie !` : `${nomDe(e)} ${verbe(e, 'ouvres', 'ouvre')} un coffre légendaire !`);
    else if (!A.premierCoffre) annonce(evs, `Premier coffre : ${e.humain && e.nom === 'Toi' ? 'toi' : e.nom} !`);
    A.premierCoffre = true;
  }
  // ramasser un sac au sol : ce qui tient, le plus précieux d'abord
  function ramasserSac(jeu, A, e, s, evs) {
    const pris = [], ordre = s.objets.slice().sort((a, b) => BUTIN.valeur(b) - BUTIN.valeur(a));
    for (const id of ordre) if (BUTIN.ajouter(e.sac, id)) { pris.push(id); s.objets.splice(s.objets.indexOf(id), 1); evs.push({ t: 'butin', id: e.id, quoi: 'valeur', objet: id, valeur: BUTIN.valeur(id), sac: s.id }); }
    if (!s.objets.length) s.dispo = false;
    evs.push({ t: 'sac', quoi: s.dispo ? 'pris' : 'vide', sac: s.id, par: e.id, pris, objets: s.objets.slice() });
    if (s.dispo) evs.push({ t: 'plein', id: e.id, objet: s.objets[0] });
  }
  // relever un équipier à terre
  function relever(jeu, A, e, v, evs) {
    v.aTerre = false; v.vivant = true; v.vie = Math.max(1, Math.round(jeu.vieMax * X.relever.vie)); v.armure = 0; v.invincible = 1;
    v.vx = v.vz = v.vy = 0; v.auSol = true; v.y = jeu.monde.hauteur(v.x, v.z); v.ax = v.x; v.ay = v.y; v.az = v.z;
    v.posture = v.vers = 'debout'; v.transition = 0; v.accroupi = false; v.oeil = J.postures.debout.oeil; v.hautCapsule = J.postures.debout.haut; v.aoeil = v.oeil;
    v.prochainTir = jeu.temps + 0.3; v.interaction = null; v.sortie = 0;
    evs.push({ t: 'releve', id: v.id, par: e.id });
    annonce(evs, `${nomDe(e)} ${verbe(e, 'relèves', 'relève')} ${v.humain && v.nom === 'Toi' ? 'toi' : v.nom} !`);
  }
  // sortir par un point d'extraction
  function extraire(jeu, A, e, p, evs) {
    const objets = e.sac.objets.slice(), valeur = BUTIN.valeurDe(objets);
    e.extrait = true; e.vivant = false; e.interaction = null; e.sortie = 0; e.sortiePoint = null; e.mortDepuis = jeu.temps;
    const materiel = e.armeTrouvee && e.armes[0] === e.armeTrouvee.arme ? [{ type: 'arme', arme: e.armeTrouvee.arme, rarete: e.armeTrouvee.rarete }] : [];
    e.butin.extrait = objets; e.butin.materiel = materiel; e.butin.point = p.id; e.butin.valeurExtraite = valeur; e.score.points += valeur;
    evs.push({ t: 'extrait', id: e.id, point: p.id, nom: p.nom, valeur, objets, materiel });
    annonce(evs, `${nomDe(e)} ${verbe(e, 'sors', 'sort')} par ${p.nom.charAt(0).toLowerCase() + p.nom.slice(1)} avec ${valeur} pièces !`);
  }
  // perdre ce qu'on porte (mort : le sac tombe au sol ; fin du temps : perdu)
  function perdre(jeu, A, e, raison, evs) {
    const objets = e.sac.objets.slice(), valeur = BUTIN.valeurDe(objets);
    if (objets.length && raison === 'mort') poserSac(jeu, A, e.x, e.z, objets, e.id, evs);
    const arme = e.armeTrouvee && e.armes[0] === e.armeTrouvee.arme ? e.armeTrouvee : null; e.armeTrouvee = null; // l'arme trouvée est perdue aussi
    e.butin.perdu = e.butin.perdu.concat(objets); e.butin.valeurPerdue += valeur; e.sac.objets.length = 0;
    if (arme) e.butin.materielPerdu.push({ type: 'arme', arme: arme.arme, rarete: arme.rarete });
    evs.push({ t: 'perdu', id: e.id, raison, valeur, objets, arme: arme ? arme.arme : null });
  }
  function eliminer(jeu, A, e, par, evs) {
    e.elimine = true; e.aTerre = false; e.vivant = false; e.interaction = null;
    let n = 0; for (const c of jeu.entites) if (enJeu(c)) n++;
    evs.push({ t: 'elimine', id: e.id, par: par || null, enLice: n });
  }

  // ─── chaque pas : ouverture des extractions, interactions (coffre, sac, relever), extraction, fin ───
  function tick(jeu, dt, evs) {
    const A = jeu.extraction; if (!A) return;
    const T = jeu.temps, reste = jeu.reste;
    if (!A.ouvertes && T >= A.ouvreA) {
      A.ouvertes = true;
      evs.push({ t: 'extractions', quoi: 'ouvertes', points: A.extractions.map((p) => ({ id: p.id, nom: p.nom, x: r2(p.x), z: r2(p.z), rayon: p.rayon })) });
      annonce(evs, A.extractions.length === 2 ? `Extractions ouvertes : ${minuscule(A.extractions[0].nom)} et ${minuscule(A.extractions[1].nom)} !` : 'Extractions ouvertes !');
    }
    if (reste !== undefined) for (const [s, texte] of [[60, 'Plus qu’une minute pour sortir !'], [30, '30 secondes pour sortir !'], [10, '10 secondes !']]) if (reste <= s && reste > 0 && !A.chrono[s] && jeu.duree > s) { A.chrono[s] = true; annonce(evs, texte); }
    const es = jeu.entites;
    // une arme d'un coffre ramassée (PJEU : 'ramasse' de ce pas) : elle devient la principale, avec sa rareté (ramenée si l'on sort)
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]; if (ev.t !== 'ramasse' || typeof ev.oid !== 'string' || ev.oid[0] !== 'x') continue;
      const o = A.objets.find((q) => q.id === ev.oid), e = jeu.trouver(ev.id);
      if (o && e && e.sac && REGLES.OBJETS[o.objet] && REGLES.OBJETS[o.objet].type === 'arme') e.armeTrouvee = { arme: REGLES.OBJETS[o.objet].arme, rarete: o.rarete || 'commun' };
    }
    for (let k = 0; k < es.length; k++) {
      const e = es[k]; if (!e.humain || !e.sac || e.extrait || e.elimine) continue;
      if (e.aTerre) { // personne pour le relever (ou le délai passé) : éliminé
        let quelquun = false; for (const c of es) if (c !== e && c.humain && c.vivant && !c.extrait && !jeu.ennemis(c, e)) quelquun = true;
        if (T >= e.aTerreJusqua || !quelquun) eliminer(jeu, A, e, e.parQui, evs);
        continue;
      }
      if (!e.vivant) continue;
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
        for (const e of es) if (e.humain && e.sac && enJeu(e)) { perdre(jeu, A, e, 'temps', evs); e.perdu = true; e.interaction = null; }
        annonce(evs, 'Temps écoulé !'); A.termine = true; A.finA = T;
      } else if (humains > 0 && dedans === 0) { A.termine = true; A.finA = T + 2; }
    }
  }
  const minuscule = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  // l'interaction en cours (coffre, sac, relever) : immobile, à côté, sans être touché ; sinon coupée
  function interagir(jeu, A, e, touche, dt, evs) {
    const immobile = e.auSol && !(e.vitesse > X.ouverture.bouge);
    let it = e.interaction;
    if (it) {
      const c = cibleDe(jeu, A, it), ok = c && valide(jeu, A, e, it.quoi, c) && immobile && !touche;
      if (!ok) { evs.push({ t: 'ouverture', id: e.id, quoi: it.quoi, cible: it.cible, duree: it.duree, etat: 'coupe' }); e.interaction = it = null; }
      else {
        it.t += dt; it.prog = Math.min(1, it.t / it.duree);
        if (it.t >= it.duree) {
          e.interaction = null;
          evs.push({ t: 'ouverture', id: e.id, quoi: it.quoi, cible: it.cible, duree: it.duree, etat: 'fin' });
          if (it.quoi === 'coffre') ouvrir(jeu, A, e, c, evs); else if (it.quoi === 'sac') ramasserSac(jeu, A, e, c, evs); else relever(jeu, A, e, c, evs);
        }
        return;
      }
    }
    if (!immobile || touche) return;
    // une nouvelle : relever (un équipier à terre) > coffre fermé > sac au sol (si quelque chose y tient)
    let quoi = null, cible = null, bd = Infinity;
    for (const v of jeu.entites) if (v !== e && v.aTerre && v.humain && !jeu.ennemis(e, v)) { const d = d2(e.x, e.z, v.x, v.z); if (d <= X.relever.distance * X.relever.distance && d < bd) { bd = d; quoi = 'relever'; cible = v; } }
    if (!cible) for (const c of A.coffres) if (!c.ouvert) { const d = d2(e.x, e.z, c.x, c.z); if (d <= X.ouverture.distance * X.ouverture.distance && d < bd && Math.abs(e.y - c.y) < 2) { bd = d; quoi = 'coffre'; cible = c; } }
    if (!cible) for (const s of A.sacs) if (valide(jeu, A, e, 'sac', s)) { const d = d2(e.x, e.z, s.x, s.z); if (d < bd) { bd = d; quoi = 'sac'; cible = s; } }
    if (!cible) return;
    const duree = quoi === 'relever' ? X.relever.duree : quoi === 'sac' ? X.ramasser.duree : e.dureeOuverture || X.ouverture.duree;
    e.interaction = { quoi, cible: cible.id, t: 0, prog: 0, duree };
    evs.push({ t: 'ouverture', id: e.id, quoi, cible: cible.id, duree, etat: 'debut' });
  }
  function cibleDe(jeu, A, it) {
    if (it.quoi === 'relever') return jeu.trouver(it.cible);
    const l = it.quoi === 'coffre' ? A.coffres : A.sacs; for (let i = 0; i < l.length; i++) if (l[i].id === it.cible) return l[i];
    return null;
  }
  function valide(jeu, A, e, quoi, c) {
    if (quoi === 'relever') return c.aTerre && !c.elimine && d2(e.x, e.z, c.x, c.z) <= X.relever.distance * X.relever.distance;
    if (quoi === 'coffre') return !c.ouvert && d2(e.x, e.z, c.x, c.z) <= X.ouverture.distance * X.ouverture.distance;
    if (!c.dispo || c.attend[e.id] || d2(e.x, e.z, c.x, c.z) > X.ramasser.distance * X.ramasser.distance) return false;
    for (const id of c.objets) if (BUTIN.tient(e.sac, id)) return true;
    return false;
  }

  // ─── une mort : points, sac au sol, à terre (en équipe) ou éliminé ───
  function surMort(jeu, v, k, evs) {
    const A = jeu.extraction; if (!A) return;
    if (k && k !== v && k.humain && jeu.ennemis(k, v)) k.score.points += v.bot ? BUTIN.POINTS.gardien : BUTIN.POINTS.joueur;
    if (v.bot) { // un gardien laisse parfois des munitions ou un soin
      const r = jeu.rnd();
      if (r < 0.5) poserObjet(jeu, A, v.x, v.z, r < 0.35 ? 'munitions' : jeu.vieMax > 1 ? 'soin' : 'munitions');
      return;
    }
    if (!v.sac) return;
    v.interaction = null; v.sortie = 0; v.sortiePoint = null;
    perdre(jeu, A, v, 'mort', evs);
    let equipier = false;
    for (const c of jeu.entites) if (c !== v && c.humain && c.vivant && !c.extrait && !jeu.ennemis(c, v)) equipier = true;
    if (A.equipes && equipier) {
      v.aTerre = true; v.aTerreJusqua = jeu.temps + X.relever.delai;
      evs.push({ t: 'a-terre', id: v.id, par: k ? k.id : null, jusqua: Math.round(v.aTerreJusqua * 100) / 100 });
      annonce(evs, v.humain && v.nom === 'Toi' ? 'Tu es à terre : un équipier peut te relever !' : `${v.nom} est à terre : relève-le !`);
    } else eliminer(jeu, A, v, k ? k.id : null, evs);
  }

  function objets(jeu) { return jeu.extraction ? jeu.extraction.objets : VIDE; }
  function fini(jeu) { const A = jeu.extraction; if (!A) return jeu.duree > 0 && jeu.temps >= jeu.duree; return A.termine && jeu.temps >= A.finA; }
  // le classement : le score (valeur extraite + éliminations), puis les éliminations ; les humains devant les robots
  const trier = (a, b) => (a.bot === b.bot ? 0 : a.bot ? 1 : -1) || b.score.points - a.score.points || b.score.kills - a.score.kills || a.score.morts - b.score.morts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  function bilan(e) {
    const b = e.butin || { coffres: 0, extrait: [], materiel: [], perdu: [], materielPerdu: [], point: null, valeurExtraite: 0, valeurPerdue: 0 };
    return { id: e.id, nom: e.nom, couleur: e.couleur, equipe: e.equipe, extrait: !!e.extrait, point: b.point, objets: b.extrait.slice(), materiel: b.materiel.map((m) => Object.assign({}, m)), valeur: b.valeurExtraite,
      perdu: b.perdu.slice(), materielPerdu: b.materielPerdu.map((m) => Object.assign({}, m)), valeurPerdue: b.valeurPerdue, porte: e.sac ? e.sac.objets.slice() : [], coffres: b.coffres, kills: e.score.kills, morts: e.score.morts,
      points: e.score.points - b.valeurExtraite, score: BUTIN.score({ valeur: b.valeurExtraite, points: e.score.points - b.valeurExtraite }) };
  }
  function resultat(jeu) {
    const A = jeu.extraction, classement = jeu.resume ? jeu.resume() : jeu.classement();
    const joueurs = jeu.entites.filter((e) => e.humain && e.sac).map(bilan).sort((a, b) => b.score - a.score || b.valeur - a.valeur);
    const gagnant = joueurs.length && joueurs[0].score > 0 && (joueurs.length < 2 || joueurs[0].score > joueurs[1].score) ? joueurs[0].id : null;
    return { classement, gagnant, duree: jeu.duree > 0 ? Math.min(jeu.temps, jeu.duree) : jeu.temps, equipes: !!(A && A.equipes), scores: null,
      extraction: { joueurs, coffres: { total: A ? A.coffres.length : 0, ouverts: A ? A.coffres.filter((c) => c.ouvert).length : 0 },
        valeurExtraite: joueurs.reduce((s, j) => s + j.valeur, 0), points: A ? A.extractions.map((p) => ({ id: p.id, nom: p.nom })) : [] } };
  }

  // ─── pour le jeu en ligne : l'état du mode en JSON compact (l'hôte fait autorité) et sa lecture chez un client ───
  // { o: '0110…' (coffres ouverts), x: 0 | 1 (extractions ouvertes), s: [[id, x, z, [objets]], …] (sacs au sol disponibles),
  //   j: [[id, [objets du sac], drapeaux (1 à terre, 2 extrait, 4 éliminé, 8 perdu), quoi ('' | 'coffre' | 'sac' | 'relever'), prog, sortie], …] }
  function etat(jeu) {
    const A = jeu.extraction; if (!A) return null;
    let o = ''; for (const c of A.coffres) o += c.ouvert ? '1' : '0';
    const s = []; for (const q of A.sacs) if (q.dispo) s.push([q.id, r2(q.x), r2(q.z), q.objets.slice()]);
    const j = []; for (const e of jeu.entites) if (e.humain && e.sac) j.push([e.id, e.sac.objets.slice(), (e.aTerre ? 1 : 0) | (e.extrait ? 2 : 0) | (e.elimine ? 4 : 0) | (e.perdu ? 8 : 0), e.interaction ? e.interaction.quoi : '', e.interaction ? r2(e.interaction.prog) : 0, r2(e.sortie || 0)]);
    return { o, x: A.ouvertes ? 1 : 0, s, j };
  }
  function lireEtat(jeu, et) {
    const A = jeu.extraction; if (!A || !et || typeof et !== 'object') return false;
    if (typeof et.o === 'string') for (let i = 0; i < A.coffres.length && i < et.o.length; i++) A.coffres[i].ouvert = et.o[i] === '1';
    A.ouvertes = et.x === 1;
    if (Array.isArray(et.s)) {
      const vus = new Set();
      for (const q of et.s) {
        if (!Array.isArray(q) || typeof q[0] !== 'string' || !fin(+q[1]) || !fin(+q[2])) continue; vus.add(q[0]);
        let s = A.sacs.find((x) => x.id === q[0]);
        if (!s) { s = { id: q[0], x: +q[1], z: +q[2], y: jeu.monde.hauteur(+q[1], +q[2]), objets: [], de: null, dispo: true, attend: {} }; A.sacs.push(s); }
        s.objets = Array.isArray(q[3]) ? q[3].filter((id) => BUTIN.VALEURS[id]) : []; s.dispo = true;
      }
      for (const s of A.sacs) if (!vus.has(s.id)) s.dispo = false;
    }
    if (Array.isArray(et.j)) for (const l of et.j) {
      const e = Array.isArray(l) ? jeu.trouver(l[0]) : null; if (!e || !e.sac) continue;
      e.sac.objets = Array.isArray(l[1]) ? l[1].filter((id) => BUTIN.VALEURS[id]) : [];
      const f = l[2] | 0; e.aTerre = !!(f & 1); e.extrait = !!(f & 2); e.elimine = !!(f & 4); e.perdu = !!(f & 8);
      e.interaction = l[3] ? { quoi: l[3], cible: null, t: 0, prog: +l[4] || 0, duree: 1 } : null; e.sortie = +l[5] || 0;
    }
    return true;
  }

  // le point d'extraction le plus proche (HUD : flèche et distance) → { point, d } | null
  function plusProche(jeu, x, z) {
    const A = jeu.extraction; if (!A) return null;
    let best = null, bd = Infinity; for (const p of A.extractions) { const d = Math.sqrt(d2(x, z, p.x, p.z)); if (d < bd) { bd = d; best = p; } }
    return best ? { point: best, d: bd } : null;
  }

  return { id: 'extraction', nom: 'Extraction', zones: true, init, nouveau, place, apparition, agir, tick, surMort, objets, fini, resultat, trier, etat, lireEtat, plusProche, bilan, COULEUR_GARDIENS };
});
