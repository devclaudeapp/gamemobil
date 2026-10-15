#!/usr/bin/env node
// Opération Poncin — l'Extraction en ligne, dans Node : enligne.js chargé tel quel (vm) avec un faux salon (latence fixe, ordre gardé),
// horloge simulée. Un hôte H et deux clients C et D, zone 'bourg', format « ensemble ». On vérifie que la façade des clients suit
// l'hôte (qui fait autorité) : le mode et la zone de la semaine au lancement, les améliorations de chacun (présence → 'lancer'),
// un coffre ouvert par H (coffre, sac de H, arme posée au sol chez tous, au même indice), un geste de C (lâcher : son sac au sol ; un
// signal vu par D), les renforts du Gardien (robots ajoutés chez les clients, jamais retirés par un état en retard), l'extraction de H
// (drapeau chez les clients), puis la fin : le résultat de l'hôte avec la ligne de chacun (ce que l'interface dépose au coffre personnel).
// Les robots ne blessent personne (jeu.treve chez l'hôte) : on teste le réseau, pas le combat.
// Usage : node test/poncin-enligne-extraction.test.js ; sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PN = require('../src-poncin/nav.js');
const PZ = require('../src-poncin/zones.js'), PBU = require('../src-poncin/butin.js'), PB = require('../src-poncin/bots.js');
const PJ = require('../src-poncin/jeu.js'), PA = require('../src-poncin/arene.js'), PX = require('../src-poncin/extraction.js');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src-poncin', 'enligne.js'), 'utf8');
const carte = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json'), 'utf8'));
const MONDE = PM.creer(carte);
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };

(async () => {
  console.log('── l\'Extraction en ligne (hôte, 2 clients, bourg, ensemble)');
  let horloge = Date.UTC(2026, 9, 15, 10, 0, 0); const minuteries = [], file = [], salons = new Map(), LAT = 20;
  const ancienRandom = Math.random; Math.random = R.mulberry32(11);
  const fauxSetInterval = (fn, ms) => { const m = { fn, ms, prochain: horloge + ms, actif: true }; minuteries.push(m); return m; };
  function poster(de, a, type, data) { let t = horloge + LAT; for (const m of file) if (m.de === de && m.a === a && m.t >= t) t = m.t + 0.01; file.push({ t, a, type, data: JSON.parse(JSON.stringify(data)), de }); }
  const IDS = ['h', 'c', 'd'];
  function fauxSalon(id) {
    const abonnes = new Map();
    const s = {
      code: 'XTRA', via: 'simu', moi: { id, pseudo: id.toUpperCase(), couleur: '#FFC84A' }, hote: 'h', estHote: id === 'h', ferme: false, joueurs: new Map(),
      sur(type, fn) { if (!abonnes.has(type)) abonnes.set(type, new Set()); abonnes.get(type).add(fn); return () => abonnes.get(type).delete(fn); },
      _emettre(type, d, de) { const l = abonnes.get(type); if (l) for (const fn of Array.from(l)) fn(d, de); },
      envoyer(type, data, opt) { opt = opt || {}; if (s.estHote) { for (const j of IDS) if (j !== id && (!opt.a || opt.a === j)) poster(id, j, type, data); } else poster(id, 'h', type, data); return true; },
      // la présence : partagée par tous (le transport la recopie chez chacun)
      majMoi(x) { for (const t of salons.values()) Object.assign(t.joueurs.get(id), x); }, stats() { return {}; }, quitter() { s.ferme = true; },
    };
    for (const j of IDS) s.joueurs.set(j, { id: j, pseudo: j.toUpperCase(), couleur: '#FFC84A', pret: true, eq: '', am: '', depuis: IDS.indexOf(j) + 1, voie: j === 'h' ? 'hote' : 'p2p' });
    salons.set(id, s); return s;
  }
  const modules = [];
  function charger(salon) {
    const ctx = { console, Math, JSON, Map, Set, Array, Object, Promise, Float64Array, Int32Array, Uint8Array, Uint32Array, Int8Array, Error, String, Number, Boolean, isFinite, setTimeout: () => 0, clearTimeout: () => {},
      setInterval: fauxSetInterval, clearInterval: (m) => { if (m) m.actif = false; }, performance: { now: () => horloge }, Date: { now: () => horloge },
      PREGLES: R, PMONDE: PM, PNAV: PN, PZONES: PZ, PBUTIN: PBU, PBOTS: PB, PJEU: PJ, PARENE: PA, PEXTRACTION: PX, PRESEAU: { salon: async () => salon } };
    ctx.self = ctx; ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(SOURCE + '\n;self.PENLIGNE = PENLIGNE;', ctx);
    modules.push(ctx.PENLIGNE); return ctx.PENLIGNE;
  }
  const ctl = {};
  for (const id of IDS) { const s = fauxSalon(id); ctl[id] = await charger(s).ouvrir({ via: 'simu', moi: s.moi, monde: MONDE, carte }); }
  const livrer = () => { file.sort((a, b) => a.t - b.t); while (file.length && file[0].t <= horloge) { const m = file.shift(); const s = salons.get(m.a); if (s && !s.ferme) s._emettre(m.type, m.data, m.de); } };
  const tics = () => { for (const m of minuteries) while (m.actif && m.prochain <= horloge) { m.prochain += m.ms; m.fn(); } };

  // le salon : C a deux niveaux de sac, D l'ouverture rapide ; l'hôte choisit l'Extraction
  check(ctl.c.ameliorer({ sac: 2 }) === '2000' && ctl.d.ameliorer({ ouverture: 3, armure: 1 }) === '0310', 'les améliorations partent dans la présence (« 2000 », « 0310 »)');
  ctl.h.regler({ mode: 'extraction', zone: 'bourg', formatExtraction: 'ensemble', bots: 0, niveau: 'facile' });
  let lance = null; ctl.c.sur('partie', () => { lance = true; });
  const r = ctl.h.lancer(); check(r === true, 'l\'hôte lance l\'Extraction (' + r + ')');
  for (let i = 0; i < 40 && !(ctl.c.partie && ctl.d.partie); i++) { horloge += 5; livrer(); tics(); }
  check(!!(lance && ctl.c.partie && ctl.d.partie), 'les deux clients reçoivent la partie');
  const J = { h: ctl.h.partie.jeu, c: ctl.c.partie.jeu, d: ctl.d.partie.jeu }, XH = J.h.extraction, XC = J.c.extraction, XD = J.d.extraction;
  check(!!(XH && XC && XD) && XH.coffres.length === XC.coffres.length && XH.coffres.length >= 20, `le mode Extraction partout (${XH && XH.coffres.length} coffres)`);
  check(XC && XH.coffres.every((c, i) => XC.coffres[i].id === c.id && Math.abs(XC.coffres[i].x - c.x) < 0.01 && XC.coffres[i].rarete === c.rarete && JSON.stringify(XC.coffres[i].contenu) === JSON.stringify(c.contenu)), 'les mêmes coffres, au même contenu, chez le client');
  check(XC && XC.zoneSemaine === XH.zoneSemaine && XC.extractions.length === XH.extractions.length, `la zone de la semaine (${XH.zoneSemaine}) et les extractions concordent`);
  check(XC && XH.robots.length === XC.robots.length && J.c.entites.filter((e) => e.bot).length === J.h.entites.filter((e) => e.bot).length, `les mêmes gardiens (${XH.robots.length})`);
  const sacH = (id) => J.h.trouver(id).sac, eC = J.h.trouver('c'), eD = J.h.trouver('d');
  check(sacH('c').cases === PBU.sacVide(PBU.effets({ sac: 2 }).cases).cases && sacH('c').cases > sacH('h').cases, `chez l'hôte, C part avec son grand sac (${sacH('c').cases} cases contre ${sacH('h').cases})`);
  check(eD.dureeOuverture < eC.dureeOuverture && eD.armure > 0, `D ouvre plus vite (${eD.dureeOuverture} s) et part avec de l'armure (${eD.armure})`);
  check(J.c.trouver('c').sac.cases === sacH('c').cases, 'la façade de C connaît son grand sac');

  // la boucle : pas fixes de 1/60 s chez tous ; H suit un script, C et D restent immobiles (sauf leurs gestes)
  const NEUTRE = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null };
  const en = { h: Object.assign({}, NEUTRE), c: Object.assign({}, NEUTRE), d: Object.assign({}, NEUTRE) }, evsDe = { h: [], c: [], d: [] };
  function tourner(ms, chaque) {
    const fin = horloge + ms;
    while (horloge < fin) {
      horloge += 1000 / 60; livrer(); tics();
      J.h.treve = true; // personne n'est blessé
      if (chaque) chaque();
      for (const id of IDS) { const evs = J[id].etape(1 / 60, { [id]: en[id] }); for (const v of evs || []) evsDe[id].push(v); if (J[id].avantImage) for (const v of J[id].avantImage(horloge) || []) evsDe[id].push(v); }
      for (const id of IDS) { en[id].lacher = null; en[id].signal = null; en[id].lampe = false; en[id].utiliser = null; }
    }
  }
  const poser = (e, x, z) => { e.x = e.ax = x; e.z = e.az = z; e.y = e.ay = MONDE.hauteur(x, z); e.vx = e.vz = e.vy = 0; };
  tourner(4500); // le compte à rebours
  // H ouvre un coffre légendaire (une arme y est toujours) : il se poste à côté, immobile
  const leg = XH.coffres.find((c) => c.rarete === 'legendaire' && !c.verrou), hH = J.h.trouver('h');
  const pres = (x, z) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) { const px = x + dx * 1.2, pz = z + dz * 1.2; if (!MONDE.bloque(px, pz, 0.45)) return [px, pz]; } return [x, z]; };
  const p0 = pres(leg.x, leg.z); poser(hH, p0[0], p0[1]);
  const nObj0 = XH.objets.length;
  tourner(2500, () => { if (!leg.ouvert) poser(hH, p0[0], p0[1]); });
  check(leg.ouvert && leg.par === 'h', `H a ouvert le coffre légendaire ${leg.id} chez l'hôte`);
  const legC = XC.coffres.find((c) => c.id === leg.id), legD = XD.coffres.find((c) => c.id === leg.id);
  check(legC && legC.ouvert && legD && legD.ouvert, 'le coffre est ouvert chez C et chez D');
  check(evsDe.c.some((v) => v.t === 'coffre' && v.id === leg.id) && evsDe.c.some((v) => v.t === 'ouverture' && v.id === 'h'), 'les clients reçoivent les événements « ouverture » et « coffre »');
  check(XH.objets.length > nObj0 && XC.objets.length === XH.objets.length && XD.objets.length === XH.objets.length, `l'arme posée au sol existe partout (${XH.objets.length} objet(s) posés)`);
  check(XH.objets.every((o, i) => XC.objets[i] && XC.objets[i].objet === o.objet && Math.abs(XC.objets[i].x - o.x) < 0.02 && XC.objets[i].dispo === o.dispo), 'au même indice, à la même place (l\'instantané les suit par indice)');
  check(JSON.stringify(J.c.trouver('h').sac.objets) === JSON.stringify(hH.sac.objets) && hH.sac.objets.length > 0, `le sac de H vu par C : ${hH.sac.objets.join(', ')}`);

  // C lâche l'objet 0 de son sac (donné par l'hôte) : un sac au sol chez tous ; puis un signal, vu par D
  eC.sac.objets.push('montre'); poser(eC, eC.x, eC.z);
  tourner(400);
  check(J.c.trouver('c').sac.objets.indexOf('montre') >= 0, 'C voit l\'objet dans son sac (état du mode)');
  const sacs0 = XH.sacs.filter((s) => s.dispo).length;
  en.c.lacher = 0; tourner(500);
  check(eC.sac.objets.indexOf('montre') < 0 && XH.sacs.filter((s) => s.dispo).length === sacs0 + 1, 'chez l\'hôte, le geste « lâcher » de C a posé son sac au sol (une fois)');
  check(XD.sacs.filter((s) => s.dispo).length === sacs0 + 1 && XD.sacs.some((s) => s.dispo && s.objets.indexOf('montre') >= 0), 'D voit le sac de C au sol');
  en.c.signal = { type: 'coffre', x: eC.x + 5, y: eC.y, z: eC.z }; tourner(500);
  check(XH.signaux.some((g) => g.de === 'c' && g.type === 'coffre') && XD.signaux.some((g) => g.de === 'c' && g.type === 'coffre'), 'le signal « coffre » de C : chez l\'hôte et chez D');
  en.c.signal = { type: 'ici', x: eC.x, y: eC.y, z: eC.z }; tourner(800);
  check(XH.signaux.filter((g) => g.de === 'c').length === 2, 'deux signaux, pas un de plus (les gestes répétés ne sont joués qu\'une fois)');

  // le Gardien blessé appelle des renforts : ajoutés chez les clients, et pas retirés par un état parti avant eux
  const boss = XH.boss && J.h.trouver(XH.boss), nBots = J.h.entites.filter((e) => e.bot).length;
  if (boss) {
    boss.vie = Math.floor(boss.boss.vieMax * 0.3);
    tourner(1500);
    const n = J.h.entites.filter((e) => e.bot).length;
    check(n > nBots, `le Gardien a appelé ${n - nBots} renfort(s) chez l'hôte`);
    check(J.c.entites.filter((e) => e.bot).length === n && J.d.entites.filter((e) => e.bot).length === n, 'les renforts sont chez C et chez D');
    tourner(3500);
    check(J.c.entites.filter((e) => e.bot).length === n, 'ils y sont toujours 3,5 s après');
  } else check(false, 'pas de Gardien dans la zone');

  // les extractions s'ouvrent (on avance l'heure de l'hôte), H sort par la plus proche
  J.h.temps = XH.ouvreA - 0.2; tourner(1500);
  check(XH.ouvertes && XC.ouvertes && XD.ouvertes, 'les extractions sont ouvertes chez tous');
  const pt = XH.extractions[0]; let pp = [pt.x, pt.z]; if (MONDE.bloque(pp[0], pp[1], 0.45)) pp = pres(pt.x, pt.z);
  poser(hH, pp[0], pp[1]);
  tourner(9500, () => { if (!hH.extrait) poser(hH, pp[0], pp[1]); });
  check(hH.extrait, 'H est extrait chez l\'hôte');
  check(J.c.trouver('h').extrait && J.d.trouver('h').extrait && evsDe.c.some((v) => v.t === 'extrait' && v.id === 'h'), 'C et D voient H extrait (drapeau et événement)');

  // la fin : le temps (C et D perdent ce qu'ils portent) ; le résultat de l'hôte chez les clients
  J.h.temps = J.h.duree - 0.5; tourner(4000);
  const fin = (id) => evsDe[id].find((v) => v.t === 'fin');
  check(!!(fin('h') && fin('c') && fin('d')), 'la fin chez l\'hôte et chez les deux clients');
  const resC = fin('c') && fin('c').resultat, lH = resC && resC.extraction && resC.extraction.joueurs.find((l) => l.id === 'h'), lC = resC && resC.extraction && resC.extraction.joueurs.find((l) => l.id === 'c');
  check(!!(lH && lH.extrait && lH.valeur > 0 && lH.objets.length > 0), `le résultat de l'hôte chez C : H est sorti avec ${lH && lH.valeur} pièces`);
  check(!!(lC && !lC.extrait && lC.valeur === 0), 'C, resté dans la zone, n\'a rien sorti');
  const dep = lH && PBU.deposer(PBU.lireCoffre(null), lH);
  check(!!(dep && dep.coffre.pieces > 0), `l'interface peut déposer la ligne au coffre personnel (+${dep && dep.gain} pièces)`);

  for (const id of IDS) ctl[id].quitter();
  Math.random = ancienRandom;
  let erreurs = 0; for (const M of modules) erreurs += M.erreurs;
  check(erreurs === 0, `aucune erreur rattrapée (${erreurs}${erreurs ? ' : ' + modules.map((m) => m.derniereErreur).filter(Boolean).join(' | ') : ''})`);
  console.log(`\n${oks} ok, ${fails} en échec`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
