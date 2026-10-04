/* ŒILLETS — simulation pure : marée, météo, hydrologie du marais, économie.
   Aucune dépendance au DOM : le même fichier tourne dans Node (tests, réglage) et dans le jeu. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SIM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ─────────────────────────── constantes (réglées par simulation) ───────────────────────────
  const P = {
    E0: 2.6, NIGHT: 0.3, RAIN_EVAP: 0.2, SAT: 260, SEA_S: 35, SILL: 0.72,
    K_SEA: 300000, K_GATE: 3000, L_PER_CM: 700, MAX_DROP: 10, YIELD_DIV: 14,
    FLEUR_RATE: 0.25, FLEUR_CAP: 1.5, ALGAE_GROW: 0.06, ALGAE_DIE: 0.25, ALGAE_EVAP: 0.25,
    CRACK_AFTER: { vasiere: 48, cobier: 24, fare: 12, aderne: 8, oeillet: 6 },
    CRACK_RATE: 0.006, LEAK_RATE: 0.4, REPAIR_BELOW: 0.7, LOST_BELOW: 0.5,
    PRICE_GROS: 0.8, PRICE_FLEUR: 12,
    COST: { oeillet: 60, aderne: 110, fare: 150, cobier: 180, vasiere: 300, clapet: 25, barometre: 80, lousse: 120, rhabillage: 60 },
    GROWTH: 0.1, VAS_GROWTH: 1.5, VAS_MAX: 4, COLS: 7, ROWS0: 5, ROWS_MAX: 11,
    EVAP_DAY_CM: 3.5, // évaporation moyenne (cm/jour) servant à exprimer la réserve en jours
  };
  const TYPES = {
    vasiere: { floor: 0, max: 40, area: 8 },
    cobier: { floor: -5, max: 20, area: 4 },
    fare: { floor: -10, max: 10, area: 3 },
    aderne: { floor: -15, max: 5, area: 2 },
    oeillet: { floor: -20, max: 2, area: 1 },
  };
  const DIG_TYPES = ['cobier', 'fare', 'aderne', 'oeillet'];
  const CLIMATES = {
    ordinaire: { dT: 0, rainP: 1005, dWind: 0, crack: 1, fleurT: 22 },
    secheresse: { dT: 3, rainP: 1001, dWind: 0.1, crack: 1, fleurT: 22 },
    pourri: { dT: -2, rainP: 1008, dWind: 0, crack: 1, fleurT: 22 },
    canicule: { dT: 5, rainP: 1005, dWind: 0, crack: 2, fleurT: 19 },
    vent: { dT: 0, rainP: 1005, dWind: 0.25, crack: 1, fleurT: 22 },
  };
  const CLIMATE_ORDER = ['secheresse', 'pourri', 'canicule', 'vent', 'ordinaire'];

  // ─────────────────────────── temps, lune, marée, météo partagée ───────────────────────────
  const EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);
  const SYNODIC_H = 29.530588 * 24, TIDE_H = 12.4206, H_MS = 3.6e6;
  const tH = (ms) => (ms - EPOCH_MS) / H_MS;
  const moonPhase = (ms) => ((tH(ms) / SYNODIC_H) % 1 + 1) % 1;
  const tideAmp = (ms) => 1.05 + 0.25 * Math.cos(2 * Math.PI * tH(ms) / (SYNODIC_H / 2));
  const tide = (ms) => tideAmp(ms) * Math.sin(2 * Math.PI * tH(ms) / TIDE_H);
  const isNight = (hour) => hour < 6.5 || hour >= 21.5;
  function localHour(ms) { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
  // prochaines pleines mers (ms) après `ms`
  function nextHighTides(ms, n) {
    const t = tH(ms), out = [];
    let k = Math.ceil((t - 0.25 * TIDE_H) / TIDE_H);
    while (out.length < n) { out.push(EPOCH_MS + (k + 0.25) * TIDE_H * H_MS); k++; }
    return out;
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Les phases de pression sont fixes : la même averse le même mardi pour tout le monde.
  const PH = (() => { let s = 2026 * 9301 + 49297; const o = []; for (let i = 0; i < 4; i++) { s = (s * 9301 + 49297) % 233280; o.push(2 * Math.PI * s / 233280); } return o; })();
  const pressureRaw = (t) => 1013 + 6 * Math.sin(2 * Math.PI * t / 55.2 + PH[0]) + 5 * Math.sin(2 * Math.PI * t / 98.4 + PH[1])
    + 4 * Math.sin(2 * Math.PI * t / 190 + PH[2]) + 3 * Math.sin(2 * Math.PI * t / 329 + PH[3]);
  function pressureAt(st, ms) {
    let p = pressureRaw(tH(ms));
    if (st && st.tutorialEndMs) {
      const since = (ms - st.tutorialEndMs) / H_MS;
      const day = Math.floor((ms - st.seasonStartMs) / 864e5), hour = localHour(ms);
      if (day === 2 && hour >= 14 && hour < 16) return 1002 - (hour - 14) * 0.3; // l'averse scriptée du troisième jour
      if (since < 72) p = Math.max(p, 1012);                                      // beau fixe garanti
    }
    return p;
  }
  function envAt(st, ms) {
    const hour = localHour(ms);
    const day = clamp((ms - st.seasonStartMs) / 864e5, 0, 30);
    const Pn = pressureAt(st, ms), dP = pressureAt(st, ms + H_MS) - Pn;
    const cl = CLIMATES[st.climate] || CLIMATES.ordinaire;
    const rain = (Pn < cl.rainP && dP < 0) ? Math.min(4, (cl.rainP - Pn) * 0.6) : 0;
    const wind = clamp(0.1 + 0.9 * Math.abs(dP) + Math.max(0, 1010 - Pn) / 20 + cl.dWind, 0, 1);
    const Tmid = 20 + 7 * Math.sin(Math.PI * day / 36) + cl.dT;
    const T = Tmid + 6 * Math.cos(2 * Math.PI * (hour - 16) / 24) - (Pn < 1008 ? 4 : 0) - (rain > 0 ? 2 : 0);
    return { ms, hour, day, T, wind, rain, P: Pn, dP, night: isNight(hour), h: tide(ms), A: tideAmp(ms), moon: moonPhase(ms), fleurT: cl.fleurT, crack: cl.crack };
  }
  // Première journée : horloge virtuelle 06:00 -> 06:00, ciel scripté.
  function tutorialEnv(vh) {
    const hour = vh % 24, rain = (vh >= 23 && vh < 24.5) ? 3 : 0;
    return { ms: 0, hour, day: 0, T: 22 + 7 * Math.cos(2 * Math.PI * (hour - 16) / 24) - (rain ? 5 : 0), wind: 0.5, rain,
      P: rain ? 1003 : 1018, dP: rain ? -0.3 : 0.05, night: isNight(hour),
      h: 1.2 * Math.sin(2 * Math.PI * (vh - 7 + TIDE_H / 4) / TIDE_H), A: 1.2, moon: 0.05, fleurT: 22, crack: 1 };
  }
  const evapMmH = (env, algae) => P.E0 * clamp((env.T - 10) / 15, 0, 1.25) * (1 + 0.6 * env.wind) * (1 + P.ALGAE_EVAP * algae)
    * (env.night ? P.NIGHT : 1) * (env.rain > 0 ? P.RAIN_EVAP : 1);
  const fleurOK = (env) => env.T > env.fleurT && env.wind < 0.4 && env.rain === 0 && env.hour >= 15 && env.hour < 20;

  // ─────────────────────────── grille, parcelles, trappes ───────────────────────────
  const canFeed = (pt, ct) => { const d = TYPES[pt].floor - TYPES[ct].floor; return (d > 0 && d <= P.MAX_DROP) || (d === 0 && ct === 'oeillet'); };
  const posKey = (r, c) => r === 0 ? '0,0' : r + ',' + c;
  const gateKey = (a, b) => { const ka = posKey(a.r, a.c), kb = posKey(b.r, b.c); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  const cap = (c) => TYPES[c.type].area * P.L_PER_CM;
  const salinity = (c) => c.depth > 0 ? c.salt / (c.depth * cap(c)) : 0;
  const kgOf = (g) => g / 1000 / P.YIELD_DIV;
  const maxDepth = (st, c) => c.type === 'vasiere' ? TYPES.vasiere.max * Math.pow(P.VAS_GROWTH, st.vasEnl) : (c.type === 'oeillet' && st.enEau ? 8 : TYPES[c.type].max);
  const bucket = (S) => S <= 0 ? 'sec' : S < 80 ? 'canard' : S < 150 ? 'violet30' : S < 220 ? 'violet60' : S < P.SAT - 2 ? 'rose' : 'blanc';

  function cellAt(st, r, c) {
    if (r === 0) return st.cells.find((x) => x.type === 'vasiere') || null;
    return st.cells.find((x) => x.r === r && x.c === c) || null;
  }
  function neighborsOf(st, cell) {
    const out = [];
    if (cell.type === 'vasiere') { for (let c = 0; c < P.COLS; c++) { const n = cellAt(st, 1, c); if (n) out.push(n); } return out; }
    const cand = [[cell.r - 1, cell.c], [cell.r + 1, cell.c], [cell.r, cell.c - 1], [cell.r, cell.c + 1]];
    for (const [r, c] of cand) {
      if (r < 0 || r >= st.rows || c < 0 || c >= P.COLS) continue;
      const n = cellAt(st, r, c); if (n) out.push(n);
    }
    return out;
  }
  function neighborPositions(st, r, c) {
    const out = [];
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (rr < 0 || rr >= st.rows || cc < 0 || cc >= P.COLS) continue;
      out.push([rr, cc]);
    }
    return out;
  }
  // Toutes les trappes existantes : [{key, a, b, from, to}] ; from/to = sens de l'eau (null si œillet-œillet : par la pente)
  function gatesOf(st) {
    const out = [], seen = new Set();
    for (const a of st.cells) for (const b of neighborsOf(st, a)) {
      const key = gateKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      if (canFeed(a.type, b.type)) out.push({ key, a, b, from: a, to: b });
      else if (canFeed(b.type, a.type)) out.push({ key, a, b, from: b, to: a });
    }
    return out;
  }
  const gateOpen = (st, key) => st.gates[key] === 1;
  function cellGates(st, cell) { return gatesOf(st).filter((g) => g.a === cell || g.b === cell); }
  // Un œillet est « nourri » s'il a une trappe possible vers une aderne ou un fare
  const hasBasinFeeder = (st, cell) => neighborsOf(st, cell).some((n) => n.type !== 'oeillet' && canFeed(n.type, 'oeillet'));

  // ─────────────────────────── un pas de simulation ───────────────────────────
  function step(st, env, dt) {
    const cells = st.cells, vas = cells.find((c) => c.type === 'vasiere');
    const S = st.stats;
    // 1. la mer et l'étier
    if (vas && (st.etierOpen || st.enEau)) {
      const kSea = P.K_SEA * Math.pow(1.25, st.vasEnl), C = cap(vas);
      if (env.h > P.SILL) {
        let V = kSea * (env.h - P.SILL) * dt;
        V = Math.min(V, Math.max(0, (maxDepth(st, vas) - vas.depth) * C));
        if (V > 0) {
          const V0 = vas.depth * C;
          vas.algae = V0 + V > 0 ? vas.algae * V0 / (V0 + V) : 0;
          vas.depth += V / C; vas.salt += V * P.SEA_S; S.intake += V / P.L_PER_CM;
        }
      } else if (!st.items.clapet && !st.enEau && env.h < P.SILL - 0.05 && vas.depth > 0) {
        const V = Math.min(kSea * (P.SILL - env.h) * dt * 0.5, vas.depth * C);
        const f = V / (vas.depth * C);
        vas.salt *= 1 - f; vas.depth -= V / C;
      }
    }
    // 2. écoulements par les trappes ouvertes
    for (const g of gatesOf(st)) {
      if (!gateOpen(st, g.key)) continue;
      let u = g.from, v = g.to;
      if (!u) { // œillet -> œillet : par la pente d'eau
        if (g.a.depth > g.b.depth) { u = g.a; v = g.b; } else { u = g.b; v = g.a; }
      }
      const head = (TYPES[u.type].floor + u.depth) - (TYPES[v.type].floor + v.depth);
      if (head <= 0 || u.depth <= 0) continue;
      const Cu = cap(u), Cv = cap(v);
      let V = Math.min(P.K_GATE * head * dt, 0.5 * head * Cu * Cv / (Cu + Cv));
      V = Math.min(V, u.depth * Cu, Math.max(0, (maxDepth(st, v) - v.depth) * Cv));
      if (V <= 0) continue;
      const fu = V / (u.depth * Cu), moved = u.salt * fu, Vv = v.depth * Cv;
      v.algae = (v.algae * Vv + u.algae * V) / (Vv + V);
      u.salt -= moved; u.depth -= V / Cu; v.salt += moved; v.depth += V / Cv;
    }
    // 3. évaporation, fuites, pluie, précipitation, algues, argile, fleur
    let nOe = 0;
    for (const c of cells) {
      const C = cap(c), md = maxDepth(st, c);
      c.depth = Math.max(0, c.depth - evapMmH(env, c.algae) / 10 * dt);
      if (c.integ < 0.8 && c.depth > 0) c.depth = Math.max(0, c.depth - P.LEAK_RATE * (1 - c.integ) * dt);
      if (env.rain > 0) {
        c.depth += env.rain / 10 * dt;
        if (c.depth > md) { c.salt *= md / c.depth; c.depth = md; }
        if (c.fleur > 0) { c.crust += c.fleur * 1000 * P.YIELD_DIV; c.fleur = 0; }
      }
      const V = c.depth * C;
      if (V <= 0.5) { c.crust += c.salt; c.salt = 0; c.depth = 0; }
      else {
        const s = c.salt / V;
        if (s > P.SAT) { const ex = c.salt - P.SAT * V; c.crust += ex; c.salt -= ex; if (c.type === 'oeillet') { S.gFormed += ex; c.gDay += ex; } else S.gLostUpstream += ex; }
        else if (c.crust > 0) {
          const d = Math.min(c.crust, (P.SAT - s) * V);
          c.crust -= d; c.salt += d;
          if (c.type === 'oeillet') { S.gRedissolved += d; if (env.rain > 0) S.gRainRedissolved += d; }
        }
      }
      const s2 = salinity(c);
      if (c.depth > 0 && s2 >= 150 && s2 <= 280 && env.T > 18 && !env.night) c.algae = Math.min(1, c.algae + P.ALGAE_GROW * dt);
      else if (c.depth <= 0 || s2 < 100 || s2 > 290) c.algae = Math.max(0, c.algae - P.ALGAE_DIE * dt);
      if (c.depth <= 0.02) {
        c.dryH += dt;
        if (c.dryH > P.CRACK_AFTER[c.type] && !st.enEau) c.integ = Math.max(0, c.integ - P.CRACK_RATE * env.crack * dt);
      } else c.dryH = 0;
      if (c.type === 'oeillet') {
        nOe++;
        if (c.depth > 0 && s2 >= 250 && fleurOK(env)) c.fleur = Math.min(P.FLEUR_CAP, c.fleur + P.FLEUR_RATE * dt);
        if (c.algae >= 0.5 && s2 >= 150) c.pinkH += dt;
      } else if (c.type === 'aderne') { if (c.algae >= 0.5 && s2 >= 150) c.pinkH += dt; }
    }
    S.oeilletDays += nOe * dt / 24;
    S.simH += dt;
  }

  // ─────────────────────────── réserve, projections ───────────────────────────
  function reserveDays(st) {
    let stock = 0, area = 0;
    for (const c of st.cells) { stock += c.depth * TYPES[c.type].area; area += TYPES[c.type].area; }
    return area ? stock / (P.EVAP_DAY_CM * area) : 0;
  }
  function upstreamArea(st) { return st.cells.filter((c) => c.type !== 'oeillet').reduce((a, c) => a + TYPES[c.type].area, 0); }
  const countType = (st, type) => st.cells.filter((c) => c.type === type).length;
  // Régime permanent : EUR/jour que le marais peut rendre (pour le carnet)
  function yieldEurDay(Aup, N) { const unit = P.EVAP_DAY_CM * P.L_PER_CM * P.PRICE_GROS / (P.YIELD_DIV * 1000); return unit * Math.min((Aup + N) * P.SEA_S, N * (P.SAT - 2)); }
  function projection(st, env, c) {
    // {kind:'sature'|'sec'|'tenu'|'rien', hours}
    const gates = cellGates(st, c).filter((g) => gateOpen(st, g.key));
    const fed = gates.some((g) => (g.to === c || (!g.from && g.a !== c ? g.a.depth > c.depth : g.b !== c && g.b.depth > c.depth)) && (g.from || g.a) !== c && ((g.from && g.from.depth > 0) || (!g.from)));
    if (c.depth <= 0) return { kind: 'rien' };
    const E = evapMmH(env, c.algae) / 10; // cm/h
    if (E <= 0) return { kind: 'rien' };
    const s = salinity(c);
    if (fed && c.type === 'oeillet') return { kind: 'tenu' };
    if (s >= P.SAT) return { kind: 'sec', hours: c.depth / E };
    const x = c.depth * (1 - s / P.SAT);
    return { kind: 'sature', hours: x / E, thenDry: (c.depth - x) / E };
  }
  function gateFlow(st, g) { // cm/h reçus par la parcelle aval, pour la fiche
    let u = g.from, v = g.to;
    if (!u) { if (g.a.depth > g.b.depth) { u = g.a; v = g.b; } else { u = g.b; v = g.a; } }
    const head = (TYPES[u.type].floor + u.depth) - (TYPES[v.type].floor + v.depth);
    if (head <= 0 || u.depth <= 0) return { u, v, cmH: 0 };
    const Cu = cap(u), Cv = cap(v);
    const LH = Math.min(P.K_GATE * head, 0.5 * head * Cu * Cv / (Cu + Cv) * 6);
    return { u, v, cmH: LH / Cv };
  }

  // ─────────────────────────── état, nouvelle partie ───────────────────────────
  function newCell(type, r, c, init) {
    return Object.assign({ id: 0, r, c, type, depth: 0, salt: 0, algae: 0, crust: 0, fleur: 0, integ: 1, dryH: 0, gDay: 0, pinkH: 0, num: 0 }, init || {});
  }
  function withS(cell, S) { cell.salt = S * cell.depth * cap(cell); return cell; }
  function numberCells(st) {
    const n = {};
    for (const c of st.cells) { if (c.type === 'vasiere') continue; n[c.type] = (n[c.type] || 0) + 1; if (!c.num) c.num = n[c.type]; else n[c.type] = Math.max(n[c.type], c.num); }
  }
  function addCell(st, cell) {
    cell.id = ++st.nextId;
    if (cell.type !== 'vasiere') { let mx = 0; for (const o of st.cells) if (o.type === cell.type) mx = Math.max(mx, o.num); cell.num = mx + 1; }
    st.cells.push(cell);
    return cell;
  }
  function newState(nowMs) {
    const st = {
      v: 1, installMs: nowMs, seasonStartMs: nowMs, seasonIndex: 1, climate: 'ordinaire', rows: P.ROWS0, nextId: 0,
      lastSimMs: nowMs, tutorialDone: false, tutorialEndMs: 0, tutorialVh: 6, tutoFlags: {}, winterBank: 0, phase: 'garde',
      cash: 0, mulon: 0, mulonStripes: [], fleurStock: 0, items: { clapet: false, barometre: false, lousse: false },
      vasEnl: 0, enEau: false, etierOpen: false, cells: [], gates: {},
      stats: freshStats(), carnet: [], records: [], seenObs: {}, lastObsDay: -1, lastReturnMs: nowMs,
      clock: { anchorReal: nowMs, anchorSim: nowMs, speed: 1 },
    };
    addCell(st, newCell('vasiere', 0, 0));
    addCell(st, newCell('cobier', 1, 3));
    addCell(st, withS(newCell('fare', 2, 3, { depth: 10, algae: 0.2 }), 130));
    addCell(st, withS(newCell('aderne', 3, 3, { depth: 5, algae: 0.9 }), 190));
    addCell(st, newCell('oeillet', 4, 3, { integ: 0.92 }));
    for (const g of gatesOf(st)) st.gates[g.key] = 0;
    return st;
  }
  function freshStats() { return { kgRaked: 0, kgFleur: 0, eurSold: 0, gRedissolved: 0, gRainRedissolved: 0, gFormed: 0, gLostUpstream: 0, repairs: 0, spent: 0, intake: 0, oeilletDays: 0, simH: 0, fleurEvenings: 0 }; }

  // ─────────────────────────── actions ───────────────────────────
  function plotCost(st, type) { return type === 'vasiere' ? P.COST.vasiere * Math.pow(P.VAS_GROWTH, st.vasEnl) : P.COST[type] * (1 + P.GROWTH * countType(st, type)); }
  // Peut-on creuser `type` en (r,c) ? -> {ok, reason, cost}
  function canDig(st, r, c, type) {
    const cost = plotCost(st, type);
    if (r <= 0 || r >= st.rows || c < 0 || c >= P.COLS || cellAt(st, r, c)) return { ok: false, reason: 'occupe', cost };
    const ns = neighborPositions(st, r, c).map(([rr, cc]) => cellAt(st, rr, cc)).filter(Boolean);
    if (!ns.length) return { ok: false, reason: 'amont', cost };
    const feeders = ns.filter((n) => canFeed(n.type, type));
    if (!feeders.length) {
      const anyHigher = ns.some((n) => TYPES[n.type].floor > TYPES[type].floor);
      return { ok: false, reason: anyHigher ? 'denivele' : 'amont', cost };
    }
    if (type === 'oeillet' && feeders.every((n) => n.type === 'oeillet') && !feeders.some((n) => hasBasinFeeder(st, n))) return { ok: false, reason: 'chapelet', cost };
    if (st.cash < cost) return { ok: false, reason: 'argent', cost, missing: cost - st.cash };
    return { ok: true, cost };
  }
  function dig(st, r, c, type) {
    const chk = canDig(st, r, c, type);
    if (!chk.ok) return chk;
    st.cash -= chk.cost; st.stats.spent += chk.cost;
    const cell = addCell(st, newCell(type, r, c));
    for (const g of gatesOf(st)) if (!(g.key in st.gates)) st.gates[g.key] = st.enEau ? 1 : 0;
    return { ok: true, cell };
  }
  function enlargeVasiere(st) {
    if (st.vasEnl >= P.VAS_MAX) return { ok: false, reason: 'max' };
    const cost = plotCost(st, 'vasiere');
    if (st.cash < cost) return { ok: false, reason: 'argent', cost, missing: cost - st.cash };
    st.cash -= cost; st.stats.spent += cost; st.vasEnl++;
    return { ok: true };
  }
  function buyItem(st, id) {
    if (st.items[id]) return { ok: false, reason: 'possede' };
    const cost = P.COST[id];
    if (st.cash < cost) return { ok: false, reason: 'argent', cost, missing: cost - st.cash };
    st.cash -= cost; st.stats.spent += cost; st.items[id] = true;
    if (id === 'clapet') st.etierOpen = true;
    return { ok: true };
  }
  function repair(st, cell) {
    if (st.cash < P.COST.rhabillage) return { ok: false, reason: 'argent', cost: P.COST.rhabillage, missing: P.COST.rhabillage - st.cash };
    st.cash -= P.COST.rhabillage; st.stats.spent += P.COST.rhabillage; st.stats.repairs++; cell.integ = 1; cell.dryH = 0;
    return { ok: true };
  }
  function rakeCell(st, cell, weatherCode) {
    if (cell.type !== 'oeillet' || cell.crust <= 0) return 0;
    const kg = kgOf(cell.crust); cell.crust = 0;
    st.mulon += kg; st.stats.kgRaked += kg;
    const last = st.mulonStripes[st.mulonStripes.length - 1];
    if (last && last.w === weatherCode) last.kg += kg; else st.mulonStripes.push({ kg, w: weatherCode });
    if (st.mulonStripes.length > 60) st.mulonStripes.shift();
    return kg;
  }
  function skimCell(st, cell) {
    if (!st.items.lousse || cell.type !== 'oeillet' || cell.fleur <= 0) return 0;
    const kg = cell.fleur; cell.fleur = 0; st.fleurStock += kg; st.stats.kgFleur += kg;
    return kg;
  }
  function sell(st) {
    const eur = st.mulon * P.PRICE_GROS + st.fleurStock * P.PRICE_FLEUR;
    const r = { kg: st.mulon, fleur: st.fleurStock, eur };
    st.cash += eur; st.stats.eurSold += eur; st.mulon = 0; st.fleurStock = 0; st.mulonStripes = [];
    return r;
  }
  function toggleGate(st, key) { st.gates[key] = st.gates[key] === 1 ? 0 : 1; return st.gates[key]; }
  function toggleEtier(st) { st.etierOpen = !st.etierOpen; return st.etierOpen; }
  function miseEnEau(st) { st.enEau = true; for (const k in st.gates) st.gates[k] = 1; st.etierOpen = true; }
  function leverEau(st) {
    st.enEau = false;
    for (const c of st.cells) {
      if (c.type !== 'oeillet' || c.depth <= 2) continue;
      const feeders = neighborsOf(st, c).filter((n) => n.type !== 'oeillet' && canFeed(n.type, 'oeillet')).sort((a, b) => (maxDepth(st, b) - b.depth) - (maxDepth(st, a) - a.depth));
      const extra = c.depth - 2, f = extra / c.depth, V = extra * cap(c);
      if (feeders.length) {
        const p = feeders[0], room = Math.max(0, (maxDepth(st, p) - p.depth) * cap(p)), Vm = Math.min(V, room);
        p.depth += Vm / cap(p); p.salt += c.salt * f * (Vm / V);
      }
      c.salt *= 1 - f; c.depth = 2;
    }
  }

  // ─────────────────────────── rattrapage (absence) ───────────────────────────
  // Rejoue la simulation de st.lastSimMs à nowMs par pas de 10 min. Rend un rapport.
  function catchUp(st, nowMs, onEvent) {
    const DT_MS = 600000, DT = 1 / 6;
    const rep = { fromMs: st.lastSimMs, toMs: nowMs, tides: 0, rains: [], glyphs: [], kgFormed: 0, fleur: 0, enEau: st.enEau, hivernage: false,
      adernePink: null, oeilletDry: null, steps: 0 };
    const start = Math.max(st.lastSimMs, nowMs - 60 * 864e5);
    const g0 = st.stats.gFormed, f0 = st.cells.filter((c) => c.type === 'oeillet').reduce((a, c) => a + c.fleur, 0);
    const pinkStart = st.cells.filter((c) => c.type === 'aderne' && c.algae >= 0.5).map((c) => c.id);
    let t = start, lastH = tide(start), inRain = false, chunkStart = start, chunk = { rain: 0, night: 0, cloud: 0, n: 0 };
    const seasonEnd = seasonEndMs(st);
    while (t < nowMs) {
      const t2 = Math.min(t + DT_MS, nowMs);
      if (t2 > seasonEnd && st.phase === 'play') { rep.hivernage = true; rep.toMs = seasonEnd; break; }
      const env = envAt(st, t);
      step(st, env, (t2 - t) / H_MS);
      rep.steps++;
      if (lastH <= P.SILL && env.h > P.SILL) rep.tides++;
      lastH = env.h;
      if (env.rain > 0) { if (!inRain) { inRain = true; rep.rains.push({ ms: t, g0: st.stats.gRainRedissolved }); } }
      else if (inRain) { inRain = false; const r = rep.rains[rep.rains.length - 1]; r.kg = kgOf(st.stats.gRainRedissolved - r.g0); }
      chunk.n++; if (env.rain > 0) chunk.rain++; if (env.night) chunk.night++; if (env.P < 1008) chunk.cloud++;
      if (t2 - chunkStart >= TIDE_H * H_MS || t2 >= nowMs) {
        rep.glyphs.push(chunk.rain > chunk.n * 0.15 ? 'pluie' : chunk.night > chunk.n * 0.6 ? 'lune' : chunk.cloud > chunk.n * 0.5 ? 'nuage' : 'soleil');
        chunkStart = t2; chunk = { rain: 0, night: 0, cloud: 0, n: 0 };
      }
      if (onEvent) onEvent(t2, env);
      t = t2;
    }
    if (inRain) { const r = rep.rains[rep.rains.length - 1]; r.kg = kgOf(st.stats.gRainRedissolved - r.g0); }
    st.lastSimMs = rep.toMs;
    rep.kgFormed = kgOf(st.stats.gFormed - g0);
    rep.fleur = Math.max(0, st.cells.filter((c) => c.type === 'oeillet').reduce((a, c) => a + c.fleur, 0) - f0);
    const stillPink = st.cells.find((c) => pinkStart.includes(c.id) && c.algae >= 0.5);
    if (stillPink) rep.adernePink = stillPink;
    const dry = st.cells.filter((c) => c.type === 'oeillet' && c.dryH >= 6).sort((a, b) => b.dryH - a.dryH)[0];
    if (dry) rep.oeilletDry = dry;
    if (rep.glyphs.length > 28) rep.glyphs = rep.glyphs.slice(-28);
    return rep;
  }

  // ─────────────────────────── saison, hivernage, rhabillage ───────────────────────────
  const seasonEndMs = (st) => st.seasonStartMs + SYNODIC_H * H_MS;
  const seasonDay = (st, ms) => Math.floor((ms - st.seasonStartMs) / 864e5) + 1; // jour 1 = premier jour
  function recordKgPerOeilletDay(st) { return st.stats.oeilletDays > 0.25 ? st.stats.kgRaked / st.stats.oeilletDays : 0; }
  function nextClimate(st) {
    const h = hashStr('climat:' + st.seasonStartMs + ':' + st.seasonIndex);
    const pool = CLIMATE_ORDER.filter((k) => k !== st.climate);
    return pool[h % pool.length];
  }
  // Ferme la saison : vend le mulon, inscrit le sac, retire les parcelles perdues, noie le marais. phase -> 'hiver'
  function hivernage(st, nowMs, auto) {
    const sold = sell(st);
    for (const c of st.cells) if (c.type === 'oeillet') { st.stats.kgRaked += 0; }
    const lost = st.cells.filter((c) => c.type !== 'vasiere' && c.integ < P.LOST_BELOW);
    st.cells = st.cells.filter((c) => !lost.includes(c));
    const rec = {
      season: st.seasonIndex, climate: st.climate, tonnes: (st.stats.kgRaked + st.stats.kgFleur) / 1000, kg: st.stats.kgRaked, fleur: st.stats.kgFleur,
      record: recordKgPerOeilletDay(st), eur: st.stats.eurSold, lost: lost.length, rows: st.rows, auto: !!auto,
      plan: st.cells.filter((c) => c.type !== 'vasiere').map((c) => [c.r, c.c, c.type]), startMs: st.seasonStartMs, endMs: nowMs,
      rains: 0, pinkDays: Math.max(0, ...st.cells.filter((c) => c.type === 'aderne').map((c) => c.pinkH / 24)),
    };
    st.records.push(rec);
    st.lastSeason = { sold, lost: lost.length, rec };
    st.phase = 'hiver';
    st.enEau = false;
    for (const c of st.cells) { c.depth = c.type === 'vasiere' ? 0 : 0; c.salt = 0; c.algae = 0; c.crust = 0; c.fleur = 0; c.dryH = 0; c.gDay = 0; c.pinkH = 0; }
    st.rows = Math.min(P.ROWS_MAX, P.ROWS0 + 2 * st.seasonIndex);
    st.nextClimate = nextClimate(st);
    return rec;
  }
  // Rhabillage : poser/changer/effacer librement, dans la limite des parcelles possédées
  function winterSet(st, r, c, type) {
    if (r <= 0 || r >= st.rows || c < 0 || c >= P.COLS) return false;
    const cur = cellAt(st, r, c);
    if (type === null) { if (cur) { st.cells = st.cells.filter((x) => x !== cur); st.winterBank++; } return true; }
    if (cur) { cur.type = type; cur.num = 0; cur.integ = Math.max(cur.integ, 0.9); numberCells(st); return true; }
    if (st.winterBank <= 0) return false;
    st.winterBank--;
    addCell(st, newCell(type, r, c));
    return true;
  }
  function winterProblems(st) { // parcelles sans eau possible en amont
    return st.cells.filter((c) => c.type !== 'vasiere' && !neighborsOf(st, c).some((n) => canFeed(n.type, c.type)));
  }
  function openSeason(st, nowMs) {
    st.seasonIndex++;
    st.climate = st.nextClimate || 'ordinaire';
    st.seasonStartMs = nowMs; st.lastSimMs = nowMs; st.tutorialEndMs = 0;
    st.stats = freshStats();
    st.gates = {};
    for (const g of gatesOf(st)) st.gates[g.key] = 0;
    st.etierOpen = !!st.items.clapet; st.enEau = false; st.lastObsDay = -1; st.seenObs = {};
    for (const c of st.cells) { c.integ = Math.max(c.integ, 0.9); c.num = 0; }
    numberCells(st);
    st.phase = 'play';
  }

  return {
    P, TYPES, DIG_TYPES, CLIMATES, EPOCH_MS, SYNODIC_H, TIDE_H, H_MS,
    tH, moonPhase, tideAmp, tide, isNight, localHour, nextHighTides, hashStr, pressureAt, envAt, tutorialEnv, evapMmH, fleurOK,
    canFeed, posKey, gateKey, cap, salinity, kgOf, maxDepth, bucket, cellAt, neighborsOf, neighborPositions, gatesOf, gateOpen, cellGates, hasBasinFeeder,
    step, reserveDays, upstreamArea, countType, yieldEurDay, projection, gateFlow,
    newState, newCell, addCell, numberCells, freshStats,
    plotCost, canDig, dig, enlargeVasiere, buyItem, repair, rakeCell, skimCell, sell, toggleGate, toggleEtier, miseEnEau, leverEau,
    catchUp, seasonEndMs, seasonDay, recordKgPerOeilletDay, nextClimate, hivernage, winterSet, winterProblems, openSeason, clamp,
  };
});
