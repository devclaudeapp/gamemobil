#!/usr/bin/env node
// ŒILLETS — simulateur headless : hydrologie du marais + économie du paludier.
// Usage : node econ-sim.js [--seed N] [--casual] [--days N]
// Unités réelles partout : cm d'eau, g/L, kg, EUR. Temps interne en heures.
'use strict';

const ARGS = process.argv.slice(2);
const arg = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 ? (ARGS[i + 1] ?? true) : d; };
const SEED = +arg('--seed', 7);
const CASUAL = ARGS.includes('--casual');
const DAYS = +arg('--days', 30);

// ───────────────────────── CONSTANTES (à coller dans le jeu) ─────────────────────────
const P = {
  // hydrologie
  E0: 2.6,            // mm/h évaporés à T=25°C, vent 0, algues 0, jour (≈ x10 la réalité)
  NIGHT: 0.3,         // facteur nuit (21h30-6h30)
  RAIN_EVAP: 0.2,     // facteur pendant la pluie
  SAT: 260,           // g/L : au-delà, le sel précipite
  SEA_S: 35,          // g/L eau de mer
  SILL: 0.72,         // seuil de l'étier (unités de marée ; pleine mer entre 0.80 et 1.30)
  K_SEA: 300000,      // L/h entrant par unité de hauteur au-dessus du seuil (x1.25 par agrandissement de la vasière)
  K_GATE: 3000,       // L/h par cm de charge à travers une trappe ouverte
  L_PER_CM: 700,      // L par cm pour 1 unité de surface (70 m²)
  MAX_DROP: 10,       // cm : une trappe ne franchit pas plus de 10 cm de dénivelé entre deux fonds
  YIELD_DIV: 14,      // g de sel simulés -> kg affichés : kg = g / 1000 / YIELD_DIV
  FLEUR_RATE: 0.25,   // kg/h de fleur par œillet quand les conditions sont réunies
  FLEUR_CAP: 1.5,     // kg max de fleur en attente par œillet
  ALGAE_GROW: 0.06, ALGAE_DIE: 0.25, ALGAE_EVAP: 0.25, // /h ; bonus d'évaporation des eaux roses
  CRACK_AFTER: { vasiere: 48, cobier: 24, fare: 12, aderne: 8, oeillet: 6 }, // h à sec avant fissures
  CRACK_RATE: 0.006,  // intégrité perdue par heure ensuite
  LEAK_RATE: 0.4,     // cm/h perdus x (1 - intégrité) quand intégrité < 0.8
  REPAIR_BELOW: 0.7,
  // économie
  PRICE_GROS: 0.80, PRICE_FLEUR: 12,
  COST: { oeillet: 60, aderne: 110, fare: 150, cobier: 180, vasiere: 300,
          clapet: 25, barometre: 80, lousse: 120, trappe: 40, rhabillage: 60 },
  GROWTH: 0.10,       // +10 % linéaire par parcelle du même type déjà creusée
  VAS_GROWTH: 1.5,    // agrandir la vasière : coût x1.5, capacité +50 %, étier +25 %
  STORAGE_TARGET_DAYS: 5.0, // jours d'évaporation que le stockage doit couvrir (trou de morte-eau ≈ 4 j)
  MAX_PLOTS: 35,      // 7 x 5 cases la première saison (vasière comprise)
};
// Types : fond (cm), profondeur max (cm), surface (unités de 70 m²), voisins aval max
const TYPES = {
  vasiere: { floor: 0,   max: 40, area: 8, kids: 3 },
  cobier:  { floor: -5,  max: 20, area: 4, kids: 3 },
  fare:    { floor: -10, max: 10, area: 3, kids: 3 },
  aderne:  { floor: -15, max: 5,  area: 2, kids: 3 },
  oeillet: { floor: -20, max: 2,  area: 1, kids: 1 },
};
const canFeed = (pt, ct) => { const d = TYPES[pt].floor - TYPES[ct].floor; return (d > 0 && d <= P.MAX_DROP) || (d === 0 && ct === 'oeillet'); };

// ───────────────────────── TEMPS, LUNE, MARÉE, MÉTÉO ─────────────────────────
const EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);        // nouvelle lune de référence
const SYNODIC_H = 29.530588 * 24;
const TIDE_H = 12.4206;
const LOCAL_OFFSET_H = 20.2333;                        // heure locale (CEST) à t = 0
const hoursSinceEpoch = (ms) => (ms - EPOCH_MS) / 3.6e6;
const localHour = (t) => ((LOCAL_OFFSET_H + t) % 24 + 24) % 24;
const tideAmp = (t) => 1.05 + 0.25 * Math.cos(2 * Math.PI * t / (SYNODIC_H / 2)); // 0.80 (morte-eau) .. 1.30 (vive-eau à NL et PL)
const tide = (t) => tideAmp(t) * Math.sin(2 * Math.PI * t / TIDE_H);
const isNight = (hour) => hour < 6.5 || hour >= 21.5;

function seededPhases(seed) {
  let s = seed * 9301 + 49297; const out = [];
  for (let i = 0; i < 4; i++) { s = (s * 9301 + 49297) % 233280; out.push(2 * Math.PI * s / 233280); }
  return out;
}
const PH = seededPhases(SEED);
function pressure(t) {
  return 1013 + 6 * Math.sin(2 * Math.PI * t / 55.2 + PH[0]) + 5 * Math.sin(2 * Math.PI * t / 98.4 + PH[1])
       + 4 * Math.sin(2 * Math.PI * t / 190 + PH[2]) + 3 * Math.sin(2 * Math.PI * t / 329 + PH[3]);
}
function weatherAt(t, seasonStart) {
  const hour = localHour(t);
  const day = Math.max(0, Math.min(30, (t - seasonStart) / 24));
  const Pn = pressure(t), dP = pressure(t + 1) - Pn;
  const rain = (Pn < 1005 && dP < 0) ? Math.min(4, (1005 - Pn) * 0.6) : 0;
  const wind = Math.max(0, Math.min(1, 0.1 + 0.9 * Math.abs(dP) + Math.max(0, 1010 - Pn) / 20));
  const Tmid = 20 + 7 * Math.sin(Math.PI * day / 36);           // 20 (juin) -> 27 (jour 18, août) -> 23,5 (septembre)
  const T = Tmid + 6 * Math.cos(2 * Math.PI * (hour - 16) / 24) - (Pn < 1008 ? 4 : 0) - (rain > 0 ? 2 : 0);
  return { hour, T, wind, rain, P: Pn, dP, night: isNight(hour), h: tide(t) };
}
const evapRate = (env, algae) => P.E0 * Math.max(0, Math.min(1.25, (env.T - 10) / 15))
  * (1 + 0.6 * env.wind) * (1 + P.ALGAE_EVAP * algae) * (env.night ? P.NIGHT : 1) * (env.rain > 0 ? P.RAIN_EVAP : 1);
const fleurOK = (env) => env.T > 22 && env.wind < 0.4 && env.rain === 0 && env.hour >= 15 && env.hour < 20;

// ───────────────────────── MARAIS ─────────────────────────
class Marsh {
  constructor() {
    this.cells = []; this.cash = 0; this.mulon = 0; this.fleurStock = 0;
    this.items = { clapet: false, barometre: false, lousse: false };
    this.etierOpen = false; this.enEau = false; this.vasEnl = 0; this.incomeEst = 40;
    this.stats = { kgRaked: 0, kgFleur: 0, eurSold: 0, kgRedissolved: 0, repairs: 0, spent: 0, intake: 0 };
    this.log = [];
  }
  add(type, parentId = null, init = {}) {
    const c = { id: this.cells.length, type, parent: parentId, kids: [], gate: 1,
      depth: 0, salt: 0, algae: 0, crust: 0, integ: 1, dryH: 0, fleur: 0, ...init };
    if (init.S !== undefined) { c.salt = init.S * c.depth * this.cap(c); delete c.S; }
    this.cells.push(c);
    if (parentId !== null) this.cells[parentId].kids.push(c.id);
    return c;
  }
  cap(c) { return TYPES[c.type].area * P.L_PER_CM; }
  maxDepth(c) { if (c.type === 'vasiere') return TYPES.vasiere.max * Math.pow(1.5, this.vasEnl);
    if (c.type === 'oeillet' && this.enEau) return 8; return TYPES[c.type].max; }
  S(c) { const V = c.depth * this.cap(c); return V > 0 ? c.salt / V : 0; }
  count(type) { return this.cells.filter(c => c.type === type).length; }
  oeillets() { return this.cells.filter(c => c.type === 'oeillet'); }
  // un œillet ne peut nourrir qu'un seul autre œillet, et seulement s'il est lui-même nourri par une aderne ou un fare (pas de chapelet > 2)
  freeParents(type) { return this.cells.filter(c => canFeed(c.type, type) && c.kids.length < TYPES[c.type].kids && !(c.type === 'oeillet' && this.cells[c.parent].type === 'oeillet')); }
  plotCost(type) { return type === 'vasiere' ? P.COST.vasiere * Math.pow(P.VAS_GROWTH, this.vasEnl)
    : P.COST[type] * (1 + P.GROWTH * this.count(type)); }
  areaUp() { return this.cells.filter(c => c.type !== 'oeillet').reduce((a, c) => a + TYPES[c.type].area, 0); }
  storageDays() {
    const st = this.cells.reduce((a, c) => a + this.maxDepth(c) * TYPES[c.type].area, 0);
    const ev = this.cells.reduce((a, c) => a + 3.5 * TYPES[c.type].area, 0);
    return st / ev;
  }
  toKg(g) { return g / 1000 / P.YIELD_DIV; }

  // ─── un pas de simulation (dt heures) ───
  step(env, dt) {
    const cells = this.cells, vas = cells[0];
    // 1. mer -> vasière par l'étier
    if (this.etierOpen) {
      const kSea = P.K_SEA * Math.pow(1.25, this.vasEnl);
      if (env.h > P.SILL) {
        let V = kSea * (env.h - P.SILL) * dt;
        V = Math.min(V, Math.max(0, (this.maxDepth(vas) - vas.depth) * this.cap(vas)));
        const V0 = vas.depth * this.cap(vas);
        vas.algae = V0 + V > 0 ? vas.algae * V0 / (V0 + V) : 0;
        vas.depth += V / this.cap(vas); vas.salt += V * P.SEA_S; this.stats.intake += V / P.L_PER_CM;
      } else if (!this.items.clapet && env.h < P.SILL - 0.05) {   // sans clapet : l'eau repart avec la mer
        const V = Math.min(kSea * (P.SILL - env.h) * dt * 0.5, vas.depth * this.cap(vas));
        const f = vas.depth > 0 ? V / (vas.depth * this.cap(vas)) : 0;
        vas.salt *= (1 - f); vas.depth -= V / this.cap(vas);
      }
    }
    // 2. écoulements amont -> aval par les trappes ouvertes (bassins en cascade, plafonnés)
    for (const v of cells) {
      if (v.parent === null || v.gate <= 0) continue;
      const u = cells[v.parent];
      const head = (TYPES[u.type].floor + u.depth) - (TYPES[v.type].floor + v.depth);
      if (head <= 0) continue;
      const Cu = this.cap(u), Cv = this.cap(v);
      let V = Math.min(P.K_GATE * v.gate * head * dt, 0.5 * head * Cu * Cv / (Cu + Cv));
      V = Math.min(V, u.depth * Cu, Math.max(0, (this.maxDepth(v) - v.depth) * Cv));
      if (V <= 0) continue;
      const fu = V / (u.depth * Cu), saltMoved = u.salt * fu, Vv = v.depth * Cv;
      v.algae = (v.algae * Vv + u.algae * V) / (Vv + V);
      u.salt -= saltMoved; u.depth -= V / Cu; v.salt += saltMoved; v.depth += V / Cv;
    }
    // 3. évaporation, fuites, pluie, précipitation/dissolution, algues, fissures, fleur
    for (const c of cells) {
      const C = this.cap(c), md = this.maxDepth(c);
      c.depth = Math.max(0, c.depth - evapRate(env, c.algae) / 10 * dt);
      if (c.integ < 0.8 && c.depth > 0) c.depth = Math.max(0, c.depth - P.LEAK_RATE * (1 - c.integ) * dt);
      if (env.rain > 0) {
        c.depth += env.rain / 10 * dt;
        if (c.depth > md) { const f = (c.depth - md) / c.depth; c.salt *= (1 - f); c.depth = md; }
        if (c.fleur > 0) { c.crust += c.fleur * 1000 * P.YIELD_DIV; c.fleur = 0; }
      }
      const V = c.depth * C;
      if (V <= 0.5) { c.crust += c.salt; c.salt = 0; c.depth = 0; }
      else {
        const S = c.salt / V;
        if (S > P.SAT) { const ex = c.salt - P.SAT * V; c.crust += ex; c.salt -= ex; }
        else if (c.crust > 0) {
          const d = Math.min(c.crust, (P.SAT - S) * V);
          c.crust -= d; c.salt += d;
          if (c.type === 'oeillet') this.stats.kgRedissolved += this.toKg(d);
        }
      }
      const S = this.S(c);
      if (c.depth > 0 && S >= 150 && S <= 280 && env.T > 18 && !env.night) c.algae = Math.min(1, c.algae + P.ALGAE_GROW * dt);
      else if (c.depth <= 0 || S < 100 || S > 290) c.algae = Math.max(0, c.algae - P.ALGAE_DIE * dt);
      if (c.depth <= 0.02) { c.dryH += dt; if (c.dryH > P.CRACK_AFTER[c.type] && !this.enEau) c.integ = Math.max(0, c.integ - P.CRACK_RATE * dt); }
      else c.dryH = 0;
      if (c.type === 'oeillet' && c.depth > 0 && S >= 250 && fleurOK(env)) c.fleur = Math.min(P.FLEUR_CAP, c.fleur + P.FLEUR_RATE * dt);
    }
  }

  // ─── actions du joueur ───
  rake() { let kg = 0; for (const c of this.oeillets()) { kg += this.toKg(c.crust); c.crust = 0; } this.mulon += kg; this.stats.kgRaked += kg; return kg; }
  skim() { if (!this.items.lousse) return 0; let kg = 0; for (const c of this.oeillets()) { kg += c.fleur; c.fleur = 0; } this.fleurStock += kg; this.stats.kgFleur += kg; return kg; }
  sell() { const eur = this.mulon * P.PRICE_GROS + this.fleurStock * P.PRICE_FLEUR; this.cash += eur; this.stats.eurSold += eur; this.mulon = 0; this.fleurStock = 0; return eur; }
  repairAll(t) { for (const c of this.cells) if (c.integ < P.REPAIR_BELOW && this.cash >= P.COST.rhabillage) { this.cash -= P.COST.rhabillage; this.stats.spent += P.COST.rhabillage; c.integ = 1; this.stats.repairs++; this.log.push([t, `rhabillage ${c.type}#${c.id}`]); } }
  miseEnEau() { this.enEau = true; for (const c of this.cells) c.gate = 1; this.etierOpen = true; }
  leverEau() { this.enEau = false; for (const c of this.oeillets()) if (c.depth > 2) { const p = this.cells[c.parent]; const V = (c.depth - 2) * this.cap(c); const f = (c.depth - 2) / c.depth; const room = Math.max(0, (this.maxDepth(p) - p.depth) * this.cap(p)); const Vm = Math.min(V, room); p.depth += Vm / this.cap(p); p.salt += c.salt * f * (Vm / V); c.salt *= (1 - f); c.depth = 2; } }

  // valeur marginale (EUR/jour) d'un achat : formule fermée de régime permanent
  yieldEur(Aup, N) { const unit = 3.5 * P.L_PER_CM * P.PRICE_GROS / (P.YIELD_DIV * 1000); return unit * Math.min((Aup + N) * P.SEA_S, N * (P.SAT - 2)); }
  options() {
    const Aup = this.areaUp(), N = this.count('oeillet'), base = this.yieldEur(Aup, N), sd = this.storageDays();
    const direct = {};
    for (const type of ['oeillet', 'aderne', 'fare', 'cobier']) {
      const a = TYPES[type].area;
      direct[type] = type === 'oeillet' ? this.yieldEur(Aup, N + 1) - base : this.yieldEur(Aup + a, N) - base;
    }
    const opts = [];
    if (!this.items.clapet) opts.push({ id: 'clapet', cost: P.COST.clapet, val: 999 });
    if (!this.items.barometre) opts.push({ id: 'barometre', cost: P.COST.barometre, val: 2.5 });
    if (!this.items.lousse) opts.push({ id: 'lousse', cost: P.COST.lousse, val: 3.5 * N });
    for (const type of ['oeillet', 'aderne', 'fare', 'cobier']) {
      if (this.freeParents(type).length === 0 || this.cells.length >= P.MAX_PLOTS) continue;
      let val = direct[type];
      // valeur d'ouverture : ce que cette parcelle permet de creuser ensuite (un cran)
      for (const ct of ['oeillet', 'aderne', 'fare']) if (canFeed(type, ct)) val = Math.max(val, 0.5 * direct[ct]);
      if (type === 'cobier' && sd < P.STORAGE_TARGET_DAYS) val += 0.12 * this.incomeEst;
      opts.push({ id: type, cost: this.plotCost(type), val });
    }
    // agrandir la vasière protège ~1/3 du revenu pendant les mortes-eaux
    if (sd < P.STORAGE_TARGET_DAYS && this.vasEnl < 4) opts.push({ id: 'vasiere', cost: this.plotCost('vasiere'), val: Math.max(18, 0.35 * this.incomeEst) });
    return opts;
  }
  buy(opt, t) {
    this.cash -= opt.cost; this.stats.spent += opt.cost;
    if (opt.id in this.items) { this.items[opt.id] = true; if (opt.id === 'clapet') this.etierOpen = true; }
    else if (opt.id === 'vasiere') this.vasEnl++;
    else { // on branche sur le parent le plus salé (c'est ce qu'un joueur attentif ferait)
      const par = this.freeParents(opt.id).sort((a, b) => this.S(b) - this.S(a))[0]; this.add(opt.id, par.id); }
    this.log.push([t, `${opt.id} ${opt.cost.toFixed(0)}€`]);
  }
  shop(t, maxBuys = 2) {
    for (let i = 0; i < maxBuys; i++) {
      const opts = this.options().filter(o => o.val > 0.01).map(o => ({ ...o, r: o.val / o.cost })).sort((a, b) => b.r - a.r);
      if (!opts.length) return;
      const best = opts[0];
      let pick = null;
      if (best.cost <= this.cash) pick = best;
      else { const alt = opts.find(o => o.cost <= this.cash && o.r >= 0.5 * best.r && this.cash >= 1.3 * o.cost); if (alt) pick = alt; }
      if (!pick) return;
      this.buy(pick, t);
    }
  }
  session(t, env) {
    if (!this.items.clapet) this.etierOpen = env.h > P.SILL;
    const kg = this.rake(), fl = this.skim(), eur = this.sell();
    this.repairAll(t); this.shop(t);
    return { kg, fl, eur };
  }
  summary() { return `${this.cells.length} parcelles (${this.count('oeillet')} œ, ${this.count('aderne')} ad, ${this.count('fare')} fa, ${this.count('cobier')} co, vasière x${this.vasEnl})`; }
}

// ───────────────────────── MISE EN PLACE ─────────────────────────
function startingMarsh() {
  const m = new Marsh();
  m.add('vasiere');
  m.add('cobier', 0);
  m.add('fare', 1, { depth: 10, S: 130, algae: 0.2 });        // eaux vieilles de l'automne : violet
  m.add('aderne', 2, { depth: 5, S: 190, algae: 0.9 });        // encore rose
  m.add('oeillet', 3, { integ: 0.92 });                       // à sec, fines fissures
  for (const c of m.cells) c.gate = 0;                         // trappes fermées au départ
  return m;
}
const fmt = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const bucket = (S) => S <= 0 ? 'sec' : S < 80 ? 'bleu' : S < 150 ? 'violet' : S < 220 ? 'rose' : S < 258 ? 'rose+' : 'BLANC';
const near = (a, b, dt) => Math.abs(a - b) < dt / 2;

// ───────────────────────── 1. PREMIÈRE JOURNÉE ACCÉLÉRÉE (x144) ─────────────────────────
function tutorialRun(verbose = true) {
  const m = startingMarsh();
  const out = [];
  const DT = 1 / 6; // 10 min sim = 4,17 s réelles
  // horloge virtuelle 06:00 -> 06:00, pleine mer 07:00 et 19:25 (A = 1.2), ciel clair et chaud, averse nocturne 23:00-00:30
  const env = (h) => { const hour = h % 24; const rain = (h >= 23 && h < 24.5) ? 3 : 0; const night = isNight(hour);
    return { hour, T: 22 + 7 * Math.cos(2 * Math.PI * (hour - 16) / 24) - (rain ? 5 : 0), wind: 0.5, rain, P: rain ? 1003 : 1018, dP: 0, night, h: 1.2 * Math.sin(2 * Math.PI * (h - 7 + TIDE_H / 4) / TIDE_H) }; };
  const real = (h) => { const m = (h - 6) / 2.4; return `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`; };
  let firstWhite = null, firstPink = null, lastB = '', sold = 0, kgRaked = 0;
  const o = m.cells[4];
  for (let h = 6; h < 30 - 1e-9; h += DT) {
    const e = env(h);
    if (near(h, 7.2, DT)) { m.etierOpen = true; out.push(`${real(h)}  JOUEUR ouvre l'étier (mer à ${fmt(e.h, 2)} > seuil ${P.SILL})`); }
    if (near(h, 8.8, DT)) { m.etierOpen = false; out.push(`${real(h)}  JOUEUR ferme l'étier (mer à ${fmt(e.h, 2)}) ; vasière ${fmt(m.cells[0].depth, 1)} cm`); }
    if (near(h, 10.2, DT)) { for (const c of m.cells) c.gate = 1; out.push(`${real(h)}  JOUEUR ouvre les 4 trappes de la chaîne`); }
    if (near(h, 18.0, DT)) { kgRaked = m.rake(); out.push(`${real(h)}  JOUEUR tire le sel : ${fmt(kgRaked, 1)} kg sur le mulon`); }
    if (near(h, 18.5, DT)) { sold = m.sell(); out.push(`${real(h)}  JOUEUR vend : ${fmt(sold, 2)} EUR`); }
    if (near(h, 19.5, DT)) { m.etierOpen = true; out.push(`${real(h)}  JOUEUR rouvre l'étier (deuxième pleine mer, mer à ${fmt(e.h, 2)})`); }
    if (near(h, 21.8, DT)) { m.etierOpen = false; out.push(`${real(h)}  JOUEUR referme l'étier ; vasière ${fmt(m.cells[0].depth, 1)} cm`); }
    m.step(e, DT);
    const hh = h + DT, b = m.cells.map(c => bucket(m.S(c))).join('/');
    if (b !== lastB) { out.push(`${real(hh)}  [${fmt(hh % 24, 1)}h ${fmt(e.T)}°C${e.rain ? ' PLUIE' : ''}${e.night ? ' nuit' : ''}] vas/cob/fare/ad/œ = ${b} | œillet ${fmt(o.depth, 1)} cm ${fmt(m.S(o))} g/L, sel ${fmt(m.toKg(o.crust), 1)} kg | aderne ${fmt(m.S(m.cells[3]))} g/L`); lastB = b; }
    if (!firstPink && m.S(o) >= 150) firstPink = real(hh);
    if (!firstWhite && o.crust > 0) firstWhite = real(hh);
  }
  out.push(`FIN 10:00  cash ${fmt(m.cash, 2)} EUR | sel dans l'œillet ${fmt(m.toKg(o.crust), 1)} kg | redissous par l'averse ${fmt(m.stats.kgRedissolved, 1)} kg | aderne ${fmt(m.S(m.cells[3]))} g/L algues ${fmt(m.cells[3].algae, 2)} | fare ${fmt(m.S(m.cells[2]))} g/L | vasière ${fmt(m.cells[0].depth, 1)} cm`);
  return { m, out, firstPink, firstWhite, sold, kgRaked };
}

// ───────────────────────── 2. SAISON EN TEMPS RÉEL ─────────────────────────
function seasonRun(m, opts = {}) {
  const { days = 30, sessions = CASUAL ? [19.25] : [8.0, 13.0, 18.75], absence = null, startLocal = Date.UTC(2026, 5, 15, 8, 0) } = opts;
  const t0 = hoursSinceEpoch(startLocal), seasonStart = t0, DT = 1 / 6, T_END = t0 + days * 24;
  const daily = []; let dayRec = null;
  const firstBuy = {}; let nPurchases = 0, idleSessions = 0, sessions7 = 0;
  let dryOeilletH = 0, minAdDepth = 99, lastH = tide(t0);
  // "mur" : plus longue plage éveillée (8h-22h) sans événement (achat, ouverture de marée, début de pluie, soirée à fleur, sel >= 5 kg tiré)
  let gapStart = t0, maxGap = { h: 0, from: 0 }, maxGap3 = 0, lastFleurDay = -1;
  const event = (t) => { const awake = (a, b) => { let s = 0; for (let x = a; x < b; x += 1 / 6) { const hr = localHour(x); if (hr >= 8 && hr < 22) s += 1 / 6; } return s; };
    const g = awake(gapStart, t); if (g > maxGap.h) maxGap = { h: g, from: (gapStart - t0) / 24 }; if (t - t0 < 72 && g > maxGap3) maxGap3 = g; gapStart = t; };
  const seen = new Set();
  for (let t = t0; t < T_END - 1e-9; t += DT) {
    const env = weatherAt(t, seasonStart);
    const dayIdx = Math.floor((t - t0) / 24);
    if (!dayRec || dayRec.day !== dayIdx) {
      if (dayRec) { dayRec.cash = m.cash; dayRec.plots = m.summary(); dayRec.storage = m.storageDays(); dayRec.intake = m.stats.intake - dayRec.intake0; daily.push(dayRec); m.incomeEst = 0.5 * m.incomeEst + 0.5 * dayRec.eur; }
      dayRec = { day: dayIdx, eur: 0, kg: 0, fleur: 0, rainMm: 0, buys: [], A: tideAmp(t), minOeDepth: 99, intake0: m.stats.intake };
    }
    const inAbsence = absence && t >= t0 + absence.from * 24 && t < t0 + absence.to * 24;
    if (absence && absence.miseEnEau && !m.enEau && near(t, t0 + absence.from * 24, DT)) m.miseEnEau();
    for (const s of sessions) {
      const key = `${dayIdx}:${s}`;
      if (!seen.has(key) && env.hour >= s && env.hour < s + 0.2 && !inAbsence) {
        seen.add(key);
        if (m.enEau) m.leverEau();
        const before = m.log.length;
        const r = m.session(t, env);
        dayRec.eur += r.eur; dayRec.kg += r.kg; dayRec.fleur += r.fl;
        if (dayIdx < 7) { sessions7++; if (r.kg < 5 && r.fl <= 0 && m.log.length === before) idleSessions++; }
        for (let i = before; i < m.log.length; i++) { const id = m.log[i][1].split(/[ #]/)[0]; dayRec.buys.push(m.log[i][1]); if (!firstBuy[id]) firstBuy[id] = (t - t0) / 24; nPurchases++; }
        if (m.log.length > before || r.kg >= 5) event(t);
      }
    }
    if (lastH <= P.SILL && env.h > P.SILL && !inAbsence) event(t);          // la mer franchit le seuil : ouverture
    if (env.rain > 0 && weatherAt(t - DT, seasonStart).rain === 0 && !inAbsence) event(t);
    if (m.items.lousse && fleurOK(env) && lastFleurDay !== dayIdx && !inAbsence) { lastFleurDay = dayIdx; event(t); }
    lastH = env.h;
    m.step(env, DT);
    dayRec.rainMm += env.rain * DT;
    for (const c of m.oeillets()) { dayRec.minOeDepth = Math.min(dayRec.minOeDepth, c.depth); if (c.depth <= 0.02) dryOeilletH += DT; }
    for (const c of m.cells) if (c.type === 'aderne') minAdDepth = Math.min(minAdDepth, c.depth);
  }
  dayRec.cash = m.cash; dayRec.plots = m.summary(); dayRec.storage = m.storageDays(); dayRec.intake = m.stats.intake - dayRec.intake0; daily.push(dayRec);
  return { m, daily, firstBuy, nPurchases, dryOeilletH, minAdDepth, maxGap, maxGap3, idleSessions, sessions7 };
}

// ───────────────────────── 3. TESTS DE GÉOMÉTRIE ─────────────────────────
function geometryTest(name, build, days = 15) {
  const m = new Marsh(); build(m); m.items.clapet = true; m.etierOpen = true;
  for (const c of m.cells) c.gate = 1;
  const t0 = hoursSinceEpoch(Date.UTC(2026, 5, 15, 8, 0));
  const DT = 1 / 6; let kg = 0, upstreamCrust = 0, lastRake = t0, oeHours = 0, oeSat = 0, dryH = 0, fleur = 0, kgSpring = 0;
  for (let t = t0; t < t0 + days * 24; t += DT) {
    const env = weatherAt(t, t0 - 72);
    m.step(env, DT);
    if (t - lastRake >= 8) { const k = m.rake(); kg += k; if (t - t0 >= 3 * 24 && t - t0 < 7 * 24) kgSpring += k; lastRake = t; }
    for (const c of m.oeillets()) { oeHours += DT; if (m.S(c) >= 250) oeSat += DT; if (c.depth <= 0.02) dryH += DT; if (env.hour >= 19.9 && env.hour < 19.9 + DT) { fleur += c.fleur; c.fleur = 0; } }
  }
  kg += m.rake();
  for (const c of m.cells) if (c.type !== 'oeillet') upstreamCrust += m.toKg(c.crust);
  const N = Math.max(1, m.count('oeillet'));
  const cost = m.cells.slice(1).reduce((a, c) => a + P.COST[c.type], 0);
  const eurDay = kg / days * P.PRICE_GROS + fleur / days * P.PRICE_FLEUR;
  return { name, plots: m.cells.length, oeillets: m.count('oeillet'), kgDay: kg / days, kgPerOeDay: kg / days / N, kgSpringPerOe: kgSpring / 4 / N, upstreamCrust, satFrac: oeHours ? oeSat / oeHours : 0, cost,
    eurDay, fleurDay: fleur / days, dryH, eurPerDayPer100: cost ? eurDay / cost * 100 : 0 };
}

// ───────────────────────── RAPPORT ─────────────────────────
function main() {
  const L = (s = '') => console.log(s);
  L('═══ ŒILLETS — simulation headless  (seed ' + SEED + (CASUAL ? ', joueur occasionnel 1 visite/j à 19h15' : ', joueur régulier 3 visites/j : 8h, 13h, 18h45') + ') ═══');
  L('\n── 1. PREMIÈRE JOURNÉE EN ACCÉLÉRÉ (x144 : 1 min réelle = 2,4 h ; 06:00 -> 06:00) ──');
  const tut = tutorialRun();
  for (const l of tut.out) L('  ' + l);
  L(`  >> œillet rose à ${tut.firstPink}, premiers cristaux à ${tut.firstWhite}, ${fmt(tut.kgRaked, 1)} kg tirés, première vente ${fmt(tut.sold, 2)} EUR`);

  L('\n── 2. SAISON 1 EN TEMPS RÉEL (' + DAYS + ' jours à partir du 15 juin 10h, fin du tutoriel) ──');
  const m = tut.m; m.etierOpen = false; for (const c of m.cells) c.gate = 1;
  const S1 = seasonRun(m, { days: DAYS });
  L('  jour | vente/j EUR | gros sel kg | fleur kg | pluie mm | A marée | entrée cm·u | œ sec cm | cash fin | stock j | marais                                            | achats');
  for (const d of S1.daily) {
    L(`  ${String(d.day + 1).padStart(4)} | ${fmt(d.eur).padStart(11)} | ${fmt(d.kg).padStart(11)} | ${fmt(d.fleur, 1).padStart(8)} | ${fmt(d.rainMm).padStart(8)} | ${fmt(d.A, 2).padStart(7)} | ${fmt(d.intake).padStart(11)} | ${fmt(d.minOeDepth, 1).padStart(8)} | ${fmt(d.cash).padStart(8)} | ${fmt(d.storage, 1).padStart(7)} | ${d.plots.padEnd(49)} | ${d.buys.join(', ')}`);
  }
  const mm = S1.m;
  L(`  >> fin : ${mm.summary()}, cash ${fmt(mm.cash)} EUR, dépensé ${fmt(mm.stats.spent)} EUR`);
  L(`  >> total vendu ${fmt(mm.stats.eurSold)} EUR = gros sel ${fmt(mm.stats.kgRaked)} kg (${fmt(mm.stats.kgRaked / 1000, 1)} t) + fleur ${fmt(mm.stats.kgFleur, 1)} kg ; redissous par la pluie ${fmt(mm.stats.kgRedissolved)} kg ; rhabillages ${mm.stats.repairs}`);
  L(`  >> heures d'œillet à sec cumulées ${fmt(S1.dryOeilletH)} h ; profondeur mini d'aderne ${fmt(S1.minAdDepth, 1)} cm ; achats ${S1.nPurchases}`);
  L('  >> premier achat de chaque chose (jours après le tutoriel) : ' + Object.entries(S1.firstBuy).map(([k, v]) => `${k} j${fmt(v, 1)}`).join(', '));
  const inc = (d) => S1.daily[d] ? S1.daily[d].eur : NaN;
  L(`  >> revenu : j1 ${fmt(inc(0))}  j2 ${fmt(inc(1))}  j3 ${fmt(inc(2))}  j7 ${fmt(inc(6))}  j14 ${fmt(inc(13))}  j21 ${fmt(inc(20))}  j29 ${fmt(inc(28))} EUR/jour`);
  const d7 = S1.daily.slice(0, 7); const buyDays = d7.filter(d => d.buys.length).length;
  L(`  >> jours avec achat en semaine 1 : ${buyDays}/7 (${d7.reduce((a, d) => a + d.buys.length, 0)} achats) ; visites de la semaine 1 sans rien à faire (ni 5 kg à tirer, ni fleur, ni achat) : ${S1.idleSessions}/${S1.sessions7} ; mur max (heures éveillées sans événement) : 3 premiers jours ${fmt(S1.maxGap3, 1)} h, saison ${fmt(S1.maxGap.h, 1)} h (au jour ${fmt(S1.maxGap.from, 1)})`);
  const wk = d7.reduce((a, d) => a + d.eur, 0);
  L(`  >> échelle : 1 h ≈ ${fmt(inc(0) / 14, 1)} EUR ; 1 jour ${fmt(inc(0))} EUR / ${fmt(S1.daily[0].kg)} kg ; 1 semaine ${fmt(wk)} EUR / ${fmt(d7.reduce((a, d) => a + d.kg, 0))} kg ; saison ${fmt(mm.stats.eurSold)} EUR / ${fmt(mm.stats.kgRaked / 1000, 1)} t ; meilleur jour ${fmt(Math.max(...S1.daily.map(d => d.eur)))} EUR`);
  const d14 = S1.daily[13]; if (d14) L(`  >> au jour 14 (fermeture anticipée possible) : ${d14.plots}, cash ${fmt(d14.cash)} EUR`);

  L('\n── 3. ABSENCES ──');
  const fresh = (days) => { const t2 = tutorialRun().m; t2.etierOpen = false; for (const c of t2.cells) c.gate = 1; return seasonRun(t2, { days }).m; };
  {
    const a = fresh(5), b = fresh(5);
    const t0 = hoursSinceEpoch(Date.UTC(2026, 5, 20, 8, 0)); const DT = 1 / 6; let kgB = 0, n = 0;
    for (let t = t0; t < t0 + 8; t += DT) { const env = weatherAt(t, t0 - 5 * 24); a.step(env, DT); b.step(env, DT); if (++n % 6 === 0) kgB += b.rake(); }
    const kgA = a.rake(); kgB += b.rake();
    L(`  8 h d'absence au jour 5 (8h->16h) : ${fmt(kgA, 1)} kg retrouvés dans les œillets, contre ${fmt(kgB, 1)} kg en ratissant chaque heure (ratio ${fmt(kgA / Math.max(0.1, kgB), 2)}) ; marais ${a.summary()}`);
  }
  for (const mee of [false, true]) {
    const t2 = tutorialRun().m; t2.etierOpen = false; for (const c of t2.cells) c.gate = 1;
    const R = seasonRun(t2, { days: 17, absence: { from: 8, to: 15, miseEnEau: mee } });
    const integ = R.m.cells.map(c => c.integ); const minI = Math.min(...integ); const cracked = integ.filter(i => i < P.REPAIR_BELOW).length;
    const eurBack = R.daily.slice(15, 17).reduce((a, d) => a + d.eur, 0);
    L(`  7 jours d'absence (j8->j15) ${mee ? 'AVEC' : 'SANS'} mise en eau : intégrité mini ${fmt(minI, 2)}, à rhabiller au retour ${cracked}/${R.m.cells.length}, rhabillages payés ${R.m.stats.repairs}, vendu au retour (j16-17) ${fmt(eurBack)} EUR, redissous ${fmt(R.m.stats.kgRedissolved)} kg, œillets à sec ${fmt(R.dryOeilletH)} h`);
  }

  L('\n── 4. LA GÉOMÉTRIE COMPTE-T-ELLE ? (15 jours du 15 juin : vive-eau -> morte-eau -> vive-eau, même météo, trappes ouvertes, ratissage toutes les 8 h) ──');
  const V = (m) => m.add('vasiere', null, { depth: 30, S: 35 });
  const G = [
    geometryTest('court : vasière -> fare -> œillet', m => { V(m); m.add('fare', 0); m.add('oeillet', 1); }),
    geometryTest('ligne : vas -> cobier -> fare -> aderne -> œillet', m => { V(m); m.add('cobier', 0); m.add('fare', 1); m.add('aderne', 2); m.add('oeillet', 3); }),
    geometryTest('ferme : vasière -> fare -> 3 œillets', m => { V(m); m.add('fare', 0); for (let i = 0; i < 3; i++) m.add('oeillet', 1); }),
    geometryTest('chapelet : vas -> fare -> œ -> œ -> œ -> œ', m => { V(m); m.add('fare', 0); let p = 1; for (let i = 0; i < 4; i++) p = m.add('oeillet', p).id; }),
    geometryTest('équilibré : vas, 1 cob, 2 fares, 3 adernes, 6 œillets', m => { V(m); m.add('cobier', 0); m.add('fare', 1); m.add('fare', 1); m.add('aderne', 2); m.add('aderne', 2); m.add('aderne', 3); for (let i = 0; i < 6; i++) m.add('oeillet', 4 + (i % 3)); }),
    geometryTest('surchargé : vas, 1 fare, 2 adernes, 9 œillets', m => { V(m); m.add('fare', 0); m.add('aderne', 1); m.add('aderne', 1); for (let i = 0; i < 6; i++) m.add('oeillet', 2 + (i % 2)); let p = 4; for (let i = 0; i < 3; i++) p = m.add('oeillet', p).id; }),
    geometryTest('citerne : vas, 3 cobiers, 2 adernes, 4 œillets', m => { V(m); for (let i = 0; i < 3; i++) m.add('cobier', 0); m.add('aderne', 1); m.add('aderne', 2); for (let i = 0; i < 4; i++) m.add('oeillet', 4 + (i % 2)); }),
    geometryTest('sans œillet : vas, cob, 2 fares, 3 adernes', m => { V(m); m.add('cobier', 0); m.add('fare', 1); m.add('fare', 1); m.add('aderne', 2); m.add('aderne', 2); m.add('aderne', 3); }),
  ];
  for (const g of G) L(`  ${g.name.padEnd(54)} ${String(g.plots).padStart(2)} parc. | ${fmt(g.kgDay).padStart(4)} kg/j  ${fmt(g.kgPerOeDay, 1).padStart(5)} kg/œ/j (j4-7 en vive-eau : ${fmt(g.kgSpringPerOe, 1).padStart(5)})  fleur ${fmt(g.fleurDay, 1)} kg/j  saturé ${fmt(g.satFrac * 100).padStart(3)} %  croûte amont ${fmt(g.upstreamCrust).padStart(4)} kg  œ à sec ${fmt(g.dryH).padStart(4)} h  coût ${fmt(g.cost).padStart(5)} EUR  ${fmt(g.eurDay).padStart(3)} EUR/j = ${fmt(g.eurPerDayPer100, 1).padStart(4)} EUR/j par 100 EUR`);

  L('\n── 5. MÉTÉO ET MARÉE PARTAGÉES (30 jours, seed ' + SEED + ') ──');
  { const t0 = hoursSinceEpoch(Date.UTC(2026, 5, 15, 8, 0)); let rainH = 0, events = 0, inRain = false, mm = 0, fleurH = 0, fleurDays = new Set(), neapDays = 0, tidesIn = 0, lastH = 0, windyH = 0;
    for (let t = t0; t < t0 + 30 * 24; t += 1 / 6) { const e = weatherAt(t, t0); if (e.rain > 0) { rainH += 1 / 6; mm += e.rain / 6; if (!inRain) { events++; inRain = true; } } else inRain = false;
      if (fleurOK(e)) { fleurH += 1 / 6; fleurDays.add(Math.floor((t - t0) / 24)); } if (e.wind > 0.6) windyH += 1 / 6;
      if (lastH <= P.SILL && e.h > P.SILL) tidesIn++; lastH = e.h; }
    for (let d = 0; d < 30; d++) if (tideAmp(t0 + d * 24) < P.SILL) neapDays++;
    L(`  averses : ${events} épisodes, ${fmt(rainH)} h, ${fmt(mm)} mm sur le mois ; heures de vent fort (>0.6) ${fmt(windyH)} ; soirées à fleur (15-20h, T>23, vent<0.35, sec) : ${fmt(fleurH)} h réparties sur ${fleurDays.size} jours ; marées franchissant le seuil : ${tidesIn}/60 ; jours où la pleine mer reste sous le seuil : ${neapDays}/30`);
  }

  L('\n── 6. VARIANTES (résumé) ──');
  for (const v of [{ name: 'occasionnel : 1 visite/j à 19h15', sessions: [19.25] }, { name: 'régulier 2 visites/j : 8h, 19h', sessions: [8, 19] }]) {
    const t2 = tutorialRun().m; t2.etierOpen = false; for (const c of t2.cells) c.gate = 1;
    const R = seasonRun(t2, { days: 30, sessions: v.sessions });
    const d = R.daily, I = (i) => d[i] ? d[i].eur : NaN;
    L(`  ${v.name.padEnd(36)} fin : ${R.m.summary()} ; vendu ${fmt(R.m.stats.eurSold)} EUR, ${fmt(R.m.stats.kgRaked / 1000, 1)} t ; revenu j1 ${fmt(I(0))} j7 ${fmt(I(6))} j14 ${fmt(I(13))} j29 ${fmt(I(28))} ; achats semaine 1 : ${d.slice(0, 7).reduce((a, x) => a + x.buys.length, 0)} ; œillets à sec ${fmt(R.dryOeilletH)} h ; rhabillages ${R.m.stats.repairs} ; mur max ${fmt(R.maxGap.h, 1)} h`);
  }
}
main();
