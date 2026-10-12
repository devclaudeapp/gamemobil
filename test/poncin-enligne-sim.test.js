#!/usr/bin/env node
// Opération Poncin — le jeu en ligne mesuré dans Node (conception § 1 causes 4–5, corrections C5 et C6, § 14).
// enligne.js est chargé tel quel (vm) avec un faux salon : réseau simulé (latence, gigue, pertes ; voie directe, ou relais groupé à
// 200 ms), horloge et minuteries simulées, images irrégulières de chaque côté (téléphones). Chaque participant tourne comme ui.js :
// pas fixes de 1/60 s (PJEU.pasFixe), puis jeu.avantImage(maintenant) chez les clients ; on mesure ce qu'il afficherait (position
// interpolée ax → x avec alpha). Un hôte H, deux clients C et D, deux robots. C marche dans la rue du 11 Novembre ; D reste sur la place
// et regarde ; H tourne en rond ; personne ne meurt (vie remise à 10 000 : pas de téléportation).
// Mesures après 3 s : « à-coups » = |Δv| horizontal d'une image à la suivante (rms, m/s) ; recalages nets des clients.
// Seuils (§ 14) : C vu par D ≤ 0,6 (mauvais ≤ 0,8) ; C vu par H ≤ 1,3 (mauvais ≤ 1,6) ; robot vu par D ≤ 1,8 × la vérité (vu par H) ;
// aucun recalage net hors du premier ; l'hôte ne refuse aucun échantillon d'un client honnête. Variante : 5 clients et 1 robot en
// direct, pas de l'hôte ≤ 2 ms en moyenne.
// Non-régression de la relecture du lot : appuis brefs sur Tir (un pas sur un, toutes les 737 ms, et calés sur le relais toutes les
// 700 ms) : ≥ 95 % des tirs du client faits par l'hôte, et jamais plus ; tricheurs (15 m/s avec tc normal, tc × 2 et × 3, sans tc à
// 25 m/s, v = 0 une entrée sur deux) : vitesse vue par l'hôte ≤ 1,3 × 7 m/s ; l'heure passée à avantImage avec 1 ms de gigue
// (horloges arrondies à la milliseconde, Safari) : seuils tenus.
// Usage : node test/poncin-enligne-sim.test.js [--detail] [profil graine] ; ENLIGNE=chemin pour mesurer une autre version d'enligne.js.
// Sortie « ok / FAIL », code 1 au moindre échec.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PN = require('../src-poncin/nav.js');
const PB = require('../src-poncin/bots.js'), PJ = require('../src-poncin/jeu.js'), PA = require('../src-poncin/arene.js');
const SOURCE = fs.readFileSync(process.env.ENLIGNE || path.join(__dirname, '..', 'src-poncin', 'enligne.js'), 'utf8');
const carte = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json'), 'utf8'));
const MONDE = PM.creer(carte); // lu seulement : partagé par tous les participants
const DETAIL = process.argv.includes('--detail'), ARGS = process.argv.slice(2).filter((a) => a[0] !== '-');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const PROFILS = { direct: { lat: 35, gigue: 25, perte: 0.02, relais: 0 }, relais: { lat: 70, gigue: 60, perte: 0, relais: 200 }, mauvais: { lat: 90, gigue: 120, perte: 0.06, relais: 0 } };
const SEUILS = { direct: { cD: 0.6, cH: 1.3 }, relais: { cD: 0.6, cH: 1.3 }, mauvais: { cD: 0.8, cH: 1.6 } };

// un téléphone moyen en 3D : 60 Hz visé, gigue de vsync, images ratées (33 ms), à-coups (50 ms) suivis d'une image courte
function horaire(n, graine) {
  const rnd = R.mulberry32(graine), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const u = rnd(); out[i] = u < 0.02 ? 0.05 : u < 0.14 ? 1 / 30 : u < 0.17 ? 0.008 : 1 / 60 + (rnd() - 0.5) * 0.003; }
  return out;
}
function pilote(chemin) { // vise le point du chemin à ~1,5 m devant, joystick à fond
  let i = 0;
  return (e) => {
    while (i < chemin.length - 1 && Math.hypot(chemin[i][0] - e.x, chemin[i][1] - e.z) < 1.5) i++;
    const c = chemin[i], dx = c[0] - e.x, dz = c[1] - e.z;
    return { fin: i === chemin.length - 1 && Math.hypot(dx, dz) < 0.8, yaw: Math.atan2(-dx, -dz) };
  };
}
const angle = (a) => { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };
const NEUTRE = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null };

async function simuler(o) {
  const RES = PROFILS[o.profil], rnd = R.mulberry32(o.graine);
  const ancienRandom = Math.random; Math.random = R.mulberry32(o.graine * 7 + 1); // rejouable
  let horloge = 1000; const minuteries = [];
  const fauxSetInterval = (fn, ms) => { const m = { fn, ms, prochain: horloge + ms, actif: true }; minuteries.push(m); return m; };
  const fauxClearInterval = (m) => { if (m) m.actif = false; };
  // ─── le réseau : une file d'arrivées ───
  const file = [], salons = new Map(), relaisDe = {}, octets = { entree: [0, 0], etat: [0, 0] };
  let triche = o.triche || 0;
  const TR = o.tricheur ? { debut: 0, tc0: 0, s0: 0, n: 0 } : null;
  function poster(de, a, type, data, fiable) {
    const s = salons.get(a); if (!s) return;
    if (type === 'entree' && de === o.clients[0]) {
      if (o.sansTc) { data = Object.assign({}, data); delete data.tc; delete data.tr; } // un vieux client : sans piste
      if (triche && horloge >= triche && data.v) { data = Object.assign({}, data, { x: data.x + 6 }); delete data.tr; triche = 0; } // une entrée truquée : 6 m d'un coup
      if (TR && horloge >= tTriche && data.v) data = tricher(data);
    }
    const texte = JSON.stringify(data); if (octets[type]) { octets[type][0] += texte.length; octets[type][1]++; }
    if (!fiable && rnd() < RES.perte) return;
    const copie = JSON.parse(texte);
    let t = horloge + RES.lat + rnd() * RES.gigue;
    if (RES.relais) { // un envoi groupé toutes les 200 ms par expéditeur ; non fiable : seul le dernier de chaque type part
      const depart = Math.ceil(horloge / RES.relais) * RES.relais, L = relaisDe[de] || (relaisDe[de] = new Map());
      t = depart + RES.lat + rnd() * RES.gigue;
      if (!fiable) { const cle = a + ':' + type, ancien = L.get(cle); if (ancien && ancien.depart === depart) { ancien.data = copie; return; } const m = { t, a, type, data: copie, de, depart }; L.set(cle, m); file.push(m); return; }
    }
    if (fiable) { let der = 0; for (const m of file) if (m.de === de && m.a === a && m.fiable && m.t > der) der = m.t; t = Math.max(t, der + 0.01); } // fiable : dans l'ordre
    file.push({ t, a, type, data: copie, de, fiable });
  }
  function fauxSalon(id, hoteId, ids) {
    const abonnes = new Map();
    const s = {
      code: 'BKRT', via: 'simu', moi: { id, pseudo: id, couleur: '#FFC84A' }, hote: hoteId, estHote: id === hoteId, ferme: false, joueurs: new Map(),
      sur(type, fn) { if (!abonnes.has(type)) abonnes.set(type, new Set()); abonnes.get(type).add(fn); return () => abonnes.get(type).delete(fn); },
      _emettre(type, d, de) { const l = abonnes.get(type); if (l) for (const fn of Array.from(l)) fn(d, de); },
      envoyer(type, data, opt) { opt = opt || {}; const fiable = opt.fiable !== false; if (s.estHote) { for (const j of s.joueurs.keys()) if (j !== id && (!opt.a || opt.a === j)) poster(id, j, type, data, fiable); } else poster(id, hoteId, type, data, fiable); return true; },
      majMoi(x) { Object.assign(s.joueurs.get(id), x); }, stats() { return {}; }, quitter() { s.ferme = true; },
    };
    for (const j of ids) s.joueurs.set(j, { id: j, pseudo: j, couleur: '#FFC84A', pret: true, depuis: ids.indexOf(j) + 1, voie: j === hoteId ? 'hote' : RES.relais ? 'relais' : 'p2p' });
    salons.set(id, s); return s;
  }
  function charger(salon) { // enligne.js tel quel, avec les modules purs en globales
    const ctx = { console, Math, JSON, Map, Set, Array, Object, Promise, Float64Array, Int32Array, Uint8Array, Uint32Array, Int8Array, Error, String, Number, Boolean, isFinite, setTimeout: () => 0, clearTimeout: () => {},
      setInterval: fauxSetInterval, clearInterval: fauxClearInterval, performance: { now: () => horloge }, Date: { now: () => horloge },
      PREGLES: R, PMONDE: PM, PNAV: PN, PBOTS: PB, PJEU: PJ, PARENE: PA, PRESEAU: { salon: async () => salon } };
    ctx.self = ctx; ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(SOURCE + '\n;self.PENLIGNE = PENLIGNE;', ctx);
    modules.push(ctx.PENLIGNE);
    return ctx.PENLIGNE;
  }
  // le tricheur : ses positions suivent le chemin à o.tricheur.v m/s (au temps réel), tc qui court × ktc, sans tc, ou v = 0 une sur deux
  let tTriche = Infinity, chT = null, cumT = null;
  function curseur(t) {
    let s = TR.s0 + o.tricheur.v * Math.max(0, t - TR.debut) / 1000, i = 0;
    while (i < chT.length - 2 && cumT[i + 1] < s) i++;
    const u = Math.max(0, Math.min(1, (s - cumT[i]) / Math.max(1e-6, cumT[i + 1] - cumT[i]))), x = chT[i][0] + (chT[i + 1][0] - chT[i][0]) * u, z = chT[i][1] + (chT[i + 1][1] - chT[i][1]) * u;
    return [Math.round(x * 100) / 100, Math.round(MONDE.hauteur(x, z) * 100) / 100, Math.round(z * 100) / 100];
  }
  function tricher(data) {
    const T = o.tricheur; data = Object.assign({}, data); TR.n++;
    if (!TR.debut) { TR.debut = horloge; TR.tc0 = data.tc; let m = Infinity; for (let i = 0; i < chT.length; i++) { const d = Math.hypot(chT[i][0] - data.x, chT[i][1] - data.z); if (d < m) { m = d; TR.s0 = cumT[i]; } } }
    const p = curseur(horloge); data.x = p[0]; data.y = p[1]; data.z = p[2];
    const k = T.ktc || 1;
    if (Array.isArray(data.tr)) data.tr = data.tr.map((e) => { const q = curseur(horloge - e[0]); return [Math.round(e[0] * k), q[0], q[1], q[2], e[4]]; });
    if (data.tc != null && k !== 1) data.tc = Math.round(TR.tc0 + (data.tc - TR.tc0) * k);
    if (T.v0 && TR.n % 2) data.v = 0;
    return data;
  }
  const IDS = ['h'].concat(o.clients), ctl = {}, modules = [];
  for (const id of IDS) { const s = fauxSalon(id, 'h', IDS); ctl[id] = await charger(s).ouvrir({ via: 'simu', moi: s.moi, monde: MONDE, carte }); }
  ctl.h.regler({ bots: o.bots, niveau: 'normal' });
  const r = ctl.h.lancer(); if (r !== true) throw new Error('lancer : ' + r);
  const livrer = () => { file.sort((a, b) => a.t - b.t); while (file.length && file[0].t <= horloge) { const m = file.shift(); const s = salons.get(m.a); if (s && !s.ferme) s._emettre(m.type, m.data, m.de); } };
  const tics = () => { for (const m of minuteries) while (m.actif && m.prochain <= horloge) { m.prochain += m.ms; m.fn(); } };
  let garde = 0; while (o.clients.some((id) => !ctl[id].partie) && garde++ < 2000) { horloge += 5; livrer(); tics(); }
  const jeu = {}; for (const id of IDS) jeu[id] = ctl[id].partie.jeu;
  const jH = jeu.h, nav = jH.nav;
  const poser = (e, x, z) => { const p = nav.proche(x, z); e.x = e.ax = p[0]; e.z = e.az = p[1]; e.y = e.ay = MONDE.hauteur(e.x, e.z); };
  const ch = []; for (const [a, b] of [[[159, 33], [111, 80]], [[111, 80], [159, 33]], [[159, 33], [111, 80]]]) for (const p of nav.chemin(a[0], a[1], b[0], b[1])) ch.push(p);
  chT = ch; cumT = [0]; for (let i = 1; i < ch.length; i++) cumT.push(cumT[i - 1] + Math.hypot(ch[i][0] - ch[i - 1][0], ch[i][1] - ch[i - 1][1]));
  const coins = [[120, 60], [104, 2], [95, 20], [130, 10], [100, 45]];
  poser(jH.trouver('h'), 120, 60); o.clients.forEach((id, i) => poser(jH.trouver(id), i === 0 ? 159 : coins[i][0], i === 0 ? 33 : coins[i][1]));
  // ─── chacun sa boucle, comme ui.js : pas fixes, puis avantImage ───
  const P = {};
  IDS.forEach((id, i) => { P[id] = { boucle: PJ.pasFixe({ pas: 1 / 60, max: 4 }), sched: horaire(4000, 5 + i), idx: 0, prochaine: horloge + 11 + 7 * i, derniere: horloge + 3 * i - 5, en: Object.assign({}, NEUTRE), entrees: {}, premier: true }; });
  const pil = pilote(ch), cpu = { t: 0, n: 0 };
  if (o.triche) triche = horloge + o.triche;
  const T0 = horloge + 3000, FIN = horloge + 3000 + o.duree * 1000;
  if (o.tricheur) tTriche = T0;
  const tirs = { c: 0, h: 0 }, rndI = R.mulberry32(o.graine * 13 + 5); let tapK = -1;
  const tr = () => ({ t: [], x: [], z: [] }), T = { cD: tr(), cH: tr(), bD: tr(), bH: tr(), cC: tr() };
  const vu = (e, alpha, interpole) => { const ok = interpole && Number.isFinite(e.ax); return [ok ? e.ax + (e.x - e.ax) * alpha : e.x, ok ? e.az + (e.z - e.az) * alpha : e.z]; };
  const noter = (o2, p) => { o2.t.push(horloge / 1000); o2.x.push(p[0]); o2.z.push(p[1]); };
  const nouveau = typeof jeu[o.clients[0]].avantImage === 'function'; // l'ancienne façade n'entretient pas ax pour les autres
  while (horloge < FIN) {
    let p = Infinity; for (const id of IDS) p = Math.min(p, P[id].prochaine); for (const m of file) p = Math.min(p, m.t); for (const m of minuteries) if (m.actif) p = Math.min(p, m.prochain);
    horloge = Math.max(horloge, p); livrer(); tics();
    for (const id of IDS) {
      const q = P[id]; if (horloge < q.prochaine) continue;
      const d = (horloge - q.derniere) / 1000; q.derniere = horloge; q.prochaine = horloge + q.sched[q.idx++ % q.sched.length] * 1000;
      const j = jeu[id], moi = j.trouver(id), en = q.en;
      if (id === 'h') { for (const e of jH.entites) e.vie = 1e4; Object.assign(en, NEUTRE, { avant: 0.6, dyaw: 0.6 * d }); }
      else if (id === o.clients[0]) {
        Object.assign(en, NEUTRE); if (moi && moi.vivant) { const c = pil(moi); en.avant = c.fin ? 0 : 1; en.dyaw = angle(c.yaw - moi.yaw); }
        if (o.tap && horloge >= T0 && Math.floor(horloge / o.tap) !== tapK) { tapK = Math.floor(horloge / o.tap); en.tir = true; } // un appui bref : le premier pas de l'image seulement
      }
      else Object.assign(en, NEUTRE);
      let premier = true; q.entrees[id] = en;
      const alpha = q.boucle.avancer(d, (dt) => {
        if (!premier) { en.dyaw = 0; en.dpitch = 0; en.saut = false; if (o.tap) en.tir = false; } premier = false;
        const t0 = id === 'h' ? process.hrtime.bigint() : 0n; const evs = j.etape(dt, q.entrees); if (id === 'h') { cpu.t += Number(process.hrtime.bigint() - t0) / 1e6; cpu.n++; }
        if (o.tap && horloge >= T0 && evs && (id === 'h' || id === o.clients[0])) { let tir = false; for (const v of evs) if (v.t === 'tir' && v.id === o.clients[0] && (id === 'h' || v.local)) tir = true; if (tir) tirs[id === 'h' ? 'h' : 'c']++; } // un tir par pas au plus (un événement par plomb)
      });
      if (id !== 'h' && typeof j.avantImage === 'function') j.avantImage(horloge + (o.gigueImage ? rndI() * o.gigueImage : 0));
      if (horloge < T0) continue;
      if (id === 'h') { noter(T.cH, vu(jH.trouver(o.clients[0]), alpha, true)); const b = jH.entites.find((e) => !e.humain); if (b) noter(T.bH, vu(b, alpha, true)); }
      else if (id === o.clients[0]) noter(T.cC, vu(moi, alpha, true));
      else if (id === o.clients[1]) { noter(T.cD, vu(j.trouver(o.clients[0]), alpha, nouveau)); const b = j.entites.find((e) => !e.humain); if (b) noter(T.bD, vu(b, alpha, nouveau)); }
    }
  }
  Math.random = ancienRandom;
  const stats = {}; for (const id of IDS) stats[id] = ctl[id].partie.stats();
  for (const id of IDS) ctl[id].quitter();
  let erreurs = 0; for (const M of modules) erreurs += M.erreurs;
  return { T, stats, cpu: cpu.t / Math.max(1, cpu.n), octets, clients: o.clients, erreurs, tirs, T0: T0 / 1000 };
}
function vitesse(o, t0, t1) { // la vitesse moyenne (m/s) le long de la trace entre t0 et t1 (s)
  let d = 0, a = -1, b = -1; for (let i = 1; i < o.t.length; i++) { if (o.t[i - 1] < t0 || o.t[i] > t1) continue; if (a < 0) a = o.t[i - 1]; b = o.t[i]; d += Math.hypot(o.x[i] - o.x[i - 1], o.z[i] - o.z[i - 1]); }
  return b > a ? d / (b - a) : 0;
}
function acoups(o) { // |Δv| horizontal d'une image à la suivante, rms (m/s)
  const v = []; for (let i = 1; i < o.t.length; i++) { const dt = o.t[i] - o.t[i - 1]; if (dt > 0) v.push(Math.hypot(o.x[i] - o.x[i - 1], o.z[i] - o.z[i - 1]) / dt); }
  let s = 0; for (let i = 1; i < v.length; i++) s += (v[i] - v[i - 1]) ** 2;
  return Math.sqrt(s / Math.max(1, v.length - 1));
}

(async () => {
  const cas = ARGS.length >= 2 ? [[ARGS[0], +ARGS[1]]] : [].concat(...['direct', 'relais', 'mauvais'].map((p) => [3, 4, 9].map((g) => [p, g])));
  console.log(`── en ligne simulé (${process.env.ENLIGNE ? path.basename(process.env.ENLIGNE) : 'enligne.js'}) : hôte, 2 clients, 2 robots, 30 s par cas`);
  for (const [profil, graine] of cas) {
    const m = await simuler({ profil, graine, clients: ['c', 'd'], bots: 2, duree: 30 });
    const a = { cD: acoups(m.T.cD), cH: acoups(m.T.cH), bD: acoups(m.T.bD), bH: acoups(m.T.bH), cC: acoups(m.T.cC) }, S = SEUILS[profil];
    const nets = m.stats.c.cales + m.stats.d.cales;
    const hc = m.stats.h.clients.find((c) => c.id === 'c') || {};
    const lib = `${profil} ${graine}`;
    if (DETAIL) console.log(`     ${lib} : C chez D ${f2(a.cD)}, C chez H ${f2(a.cH)} (C chez lui ${f2(a.cC)}), robot chez D ${f2(a.bD)} (vérité ${f2(a.bH)}) ; nets C ${m.stats.c.cales} D ${m.stats.d.cales}, doux ${m.stats.c.douces} ; délai D ${m.stats.d.delai} s, prolongée ${m.stats.d.prolonge}, sauts d'horloge ${m.stats.d.sautsHorloge} ; hôte : piste ${hc.piste != null ? hc.piste + ' D ' + hc.D + ' ms (gigue ' + hc.gigue + '), prolongée ' + hc.prolonge + ', rejets ' + hc.rejets : '—'} ; entrée ${Math.round(m.octets.entree[0] / Math.max(1, m.octets.entree[1]))} o, état ${Math.round(m.octets.etat[0] / Math.max(1, m.octets.etat[1]))} o ; pas de l'hôte ${m.cpu.toFixed(3)} ms`);
    check(a.cD <= S.cD, `${lib} : un client vu par un autre client, à-coups ${f2(a.cD)} m/s rms ≤ ${S.cD}`);
    check(a.cH <= S.cH, `${lib} : un client vu par l'hôte, à-coups ${f2(a.cH)} m/s rms ≤ ${S.cH}`);
    check(a.bD <= 1.8 * a.bH, `${lib} : un robot vu par un client, à-coups ${f2(a.bD)} ≤ 1,8 × la vérité (${f2(a.bH)})`);
    check(nets === 2, `${lib} : aucun recalage net hors du premier (C ${m.stats.c.cales}, D ${m.stats.d.cales})`);
    check(hc.rejets === 0, `${lib} : l'hôte ne refuse aucun échantillon du client honnête (rejets ${hc.rejets})`);
    if (m.erreurs) check(false, `${lib} : ${m.erreurs} erreur(s) rattrapée(s) dans enligne.js`);
  }
  if (ARGS.length < 2) {
    const m = await simuler({ profil: 'direct', graine: 5, clients: ['c', 'd', 'e', 'f', 'g'], bots: 1, duree: 10 });
    const ent = m.octets.entree[0] / Math.max(1, m.octets.entree[1]);
    check(m.cpu <= 2, `5 clients et 1 robot : pas de l'hôte ${m.cpu.toFixed(3)} ms en moyenne ≤ 2 ms`);
    check(ent <= 220, `entrée du client : ${Math.round(ent)} o en moyenne ≤ 220 o`);
    let nets = 0; for (const id of m.clients) nets += m.stats[id].cales;
    check(nets === m.clients.length, `5 clients : aucun recalage net hors du premier (${nets - m.clients.length} de plus)`);
    check(!m.erreurs, `5 clients : aucune erreur rattrapée (${m.erreurs})`);
    // un vieux client (entrée sans tc) : l'hôte le sert comme avant (il adopte sa position prédite)
    const v = await simuler({ profil: 'direct', graine: 3, clients: ['c', 'd'], bots: 1, duree: 10, sansTc: true });
    const hv = v.stats.h.clients.find((c) => c.id === 'c'), n = v.T.cH.x.length, parcouru = n ? Math.hypot(v.T.cH.x[n - 1] - v.T.cH.x[0], v.T.cH.z[n - 1] - v.T.cH.z[0]) : 0;
    check(hv && !hv.piste && hv.adopte && parcouru > 15 && v.stats.c.cales === 1 && !v.erreurs, `un client sans tc reste servi comme avant (piste ${hv && hv.piste}, adopté ${hv && hv.adopte}, ${parcouru.toFixed(1)} m parcourus chez l'hôte, nets ${v.stats.c.cales}, erreurs ${v.erreurs})`);
    // une entrée truquée (6 m d'un coup) : refusée, accusé négatif, l'hôte reprend sa simulation puis la piste
    const t = await simuler({ profil: 'direct', graine: 4, clients: ['c', 'd'], bots: 1, duree: 10, triche: 6000 });
    const ht = t.stats.h.clients.find((c) => c.id === 'c'); let saut = 0; for (let i = 1; i < t.T.cH.x.length; i++) saut = Math.max(saut, Math.hypot(t.T.cH.x[i] - t.T.cH.x[i - 1], t.T.cH.z[i] - t.T.cH.z[i - 1]));
    check(ht && ht.rejets >= 1 && ht.piste && saut < 1 && !t.erreurs, `une entrée truquée est refusée (rejets ${ht && ht.rejets}, plus grand pas vu par l'hôte ${saut.toFixed(2)} m < 1, piste reprise ${ht && ht.piste}, nets C ${t.stats.c.cales}, doux ${t.stats.c.douces})`);
    // appuis brefs sur Tir : l'hôte fait les tirs que le client a montrés (compteur nt), ni moins ni plus
    for (const [profil, graine, tap] of [['direct', 3, 737], ['relais', 3, 737], ['relais', 4, 700], ['mauvais', 4, 737]]) {
      const b = await simuler({ profil, graine, clients: ['c', 'd'], bots: 1, duree: 30, tap });
      check(b.tirs.c >= 30 && b.tirs.h >= 0.95 * b.tirs.c && b.tirs.h <= b.tirs.c && !b.erreurs, `${profil} ${graine} : appuis brefs sur Tir toutes les ${tap} ms : ${b.tirs.h} tirs chez l'hôte pour ${b.tirs.c} montrés par le client (≥ 95 %, jamais plus)`);
    }
    // les tricheurs : la vitesse que l'hôte leur voit reste celle d'un joueur (≤ 1,3 × 7 m/s) ; l'honnête, lui, avance normalement
    const VMAXT = 1.3 * 7;
    for (const [lib, tri, opt] of [['honnête (5,2 m/s)', null, {}], ['15 m/s, tc normal', { v: 15 }, {}], ['15 m/s, tc × 2', { v: 15, ktc: 2 }, {}], ['25 m/s, tc × 3', { v: 25, ktc: 3 }, {}],
      ['25 m/s sans tc', { v: 25 }, { sansTc: true }], ['15 m/s, v = 0 une entrée sur deux', { v: 15, v0: true }, {}], ['15 m/s en relais, tc × 2', { v: 15, ktc: 2 }, { profil: 'relais' }]]) {
      const x = await simuler(Object.assign({ profil: 'direct', graine: 4, clients: ['c', 'd'], bots: 1, duree: 6, tricheur: tri }, opt));
      const v = vitesse(x.T.cH, x.T0 + 1, x.T0 + 5), hx = x.stats.h.clients.find((c) => c.id === 'c') || {};
      if (!tri) check(v > 4.5 && v <= VMAXT && !hx.rejets, `client ${lib} : ${v.toFixed(2)} m/s vus par l'hôte, aucun rejet (${hx.rejets})`);
      else check(v <= VMAXT && !x.erreurs, `tricheur ${lib} : ${v.toFixed(2)} m/s vus par l'hôte ≤ ${VMAXT.toFixed(1)} (rejets ${hx.rejets})`);
    }
    // l'heure passée à avantImage : celle de l'image (rAF), arrondie à la ms par certains navigateurs : les seuils tiennent
    for (const [profil, graine] of [['direct', 3], ['mauvais', 4]]) {
      const g = await simuler({ profil, graine, clients: ['c', 'd'], bots: 2, duree: 30, gigueImage: 1 });
      const S = SEUILS[profil], cD = acoups(g.T.cD), bD = acoups(g.T.bD), bH = acoups(g.T.bH);
      check(cD <= S.cD && bD <= 1.8 * bH, `${profil} ${graine}, heure d'image à 1 ms près : client vu par l'autre ${f2(cD)} ≤ ${S.cD}, robot ${f2(bD)} ≤ 1,8 × ${f2(bH)}`);
    }
  }
  console.log(`\n${oks} ok, ${fails} échec(s)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
