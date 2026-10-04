#!/usr/bin/env node
// Vérifie la simulation hors navigateur : première journée scriptée, saison en temps réel, absence.
'use strict';
const SIM = require('../src/sim.js');
const { P } = SIM;
const fmt = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };

// ── 1. première journée accélérée (le joueur suit la marge)
{
  const st = SIM.newState(Date.UTC(2026, 5, 14, 4, 0));
  const oe = st.cells.find((c) => c.type === 'oeillet'), ad = st.cells.find((c) => c.type === 'aderne');
  const chain = ['0,0|1,3', '1,3|2,3', '2,3|3,3', '3,3|4,3'];
  check(chain.every((k) => k in st.gates), 'les 4 trappes de la chaîne existent : ' + Object.keys(st.gates).join(' '));
  const DT = 1 / 6; let firstPink = null, firstWhite = null, raked = 0, sold = 0;
  const real = (vh) => { const m = (vh - 6) / 2.4; return `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`; };
  for (let vh = 6; vh < 30 - 1e-9; vh += DT) {
    const env = SIM.tutorialEnv(vh);
    if (env.h > P.SILL && !st.etierOpen && vh < 18) st.etierOpen = true;
    if (env.h < P.SILL && st.etierOpen && vh < 18) st.etierOpen = false;
    if (vh >= 10 && vh < 10.2) for (const k of chain) st.gates[k] = 1;
    if (vh >= 17.9 && vh < 18.1 && !raked) { raked = SIM.rakeCell(st, oe, 's'); sold = SIM.sell(st).eur; }
    if (vh >= 19.3 && env.h > P.SILL && !st.etierOpen) st.etierOpen = true;
    if (vh >= 21 && env.h < P.SILL && st.etierOpen) st.etierOpen = false;
    if (vh >= 23 && vh < 23.2) st.gates['3,3|4,3'] = 0;
    SIM.step(st, env, DT);
    if (!firstPink && SIM.salinity(oe) >= 150) firstPink = real(vh);
    if (!firstWhite && oe.crust > 0) firstWhite = real(vh);
  }
  console.log(`  journée : rose à ${firstPink}, cristaux à ${firstWhite}, tiré ${fmt(raked)} kg, vendu ${fmt(sold, 2)} EUR, sel couché au matin ${fmt(SIM.kgOf(oe.crust))} kg, aderne ${fmt(SIM.salinity(ad), 0)} g/L`);
  check(firstPink && firstPink < '2:30', 'œillet rose avant 2:30');
  check(raked >= 25, 'au moins 25 kg tirés');
  check(sold >= 20 && sold <= 40, 'première vente entre 20 et 40 EUR');
}

// ── 2. saison en temps réel : 10 jours, une visite par jour, politique simple
{
  const t0 = Date.UTC(2026, 5, 15, 8, 0);
  const st = SIM.newState(t0);
  st.tutorialDone = true; st.tutorialEndMs = t0; st.seasonStartMs = t0; st.lastSimMs = t0; st.phase = 'play';
  st.cash = 29; st.cells.find((c) => c.type === 'vasiere').depth = 36; st.cells.find((c) => c.type === 'vasiere').salt = 36 * SIM.cap(st.cells[0]) * 35;
  for (const k in st.gates) st.gates[k] = 1;
  SIM.buyItem(st, 'clapet');
  let eur = 0, buys = [];
  for (let d = 1; d <= 10; d++) {
    const now = t0 + d * 864e5 + 11 * 3.6e6;
    SIM.catchUp(st, now);
    for (const c of st.cells) SIM.rakeCell(st, c, 's');
    eur += SIM.sell(st).eur;
    // acheter un œillet près d'une aderne/fare si possible, sinon une aderne, sinon un fare
    let bought = true;
    while (bought) {
      bought = false;
      for (const type of ['oeillet', 'aderne', 'fare', 'cobier']) {
        let done = false;
        for (let r = 1; r < st.rows && !done; r++) for (let c = 0; c < P.COLS && !done; c++) {
          const chk = SIM.canDig(st, r, c, type);
          if (chk.ok) { SIM.dig(st, r, c, type); buys.push(type[0] + '@' + r + ',' + c); done = true; bought = true; }
        }
        if (done) break;
      }
    }
    for (const k in st.gates) st.gates[k] = 1;
  }
  console.log(`  10 jours : vendu ${fmt(eur, 0)} EUR, ${st.cells.length} parcelles, achats ${buys.join(' ')}`);
  console.log(`  réserve ${fmt(SIM.reserveDays(st))} j, record ${fmt(SIM.recordKgPerOeilletDay(st))} kg/œillet/jour, amont ${SIM.upstreamArea(st)} parts`);
  check(eur > 300, 'revenu de 10 jours > 300 EUR');
  check(st.cells.length >= 8, 'le marais a grandi');
  const integ = Math.min(...st.cells.map((c) => c.integ));
  check(integ > 0.5, 'aucune parcelle perdue (intégrité mini ' + fmt(integ, 2) + ')');
}

// ── 3. absence de 7 jours puis hivernage automatique
{
  const t0 = Date.UTC(2026, 5, 15, 8, 0);
  const st = SIM.newState(t0);
  st.tutorialDone = true; st.tutorialEndMs = t0; st.seasonStartMs = t0; st.lastSimMs = t0; st.phase = 'play'; st.items.clapet = true; st.etierOpen = true;
  for (const k in st.gates) st.gates[k] = 1;
  const rep = SIM.catchUp(st, t0 + 7 * 864e5);
  console.log(`  7 jours : ${rep.tides} marées, ${rep.rains.length} averses, ${fmt(rep.kgFormed, 0)} kg formés, glyphes ${rep.glyphs.join(' ')}`);
  check(rep.tides >= 12 && rep.tides <= 14, 'nombre de marées plausible');
  check(rep.kgFormed > 50, 'du sel s\'est formé pendant l\'absence');
  const rep2 = SIM.catchUp(st, t0 + 40 * 864e5);
  check(rep2.hivernage, 'absence au-delà de la saison : hivernage détecté');
  SIM.hivernage(st, rep2.toMs, true);
  check(st.phase === 'hiver' && st.rows === 7 && st.records.length === 1, 'hivernage : 7 rangées, un sac');
  st.winterBank = 2;
  check(SIM.winterSet(st, 1, 0, 'cobier') && SIM.winterSet(st, 5, 3, 'oeillet'), 'rhabillage : poser deux parcelles');
  console.log('  problèmes avant ouverture : ' + SIM.winterProblems(st).map((c) => c.type + '@' + c.r + ',' + c.c).join(' '));
  SIM.openSeason(st, t0 + 41 * 864e5);
  check(st.phase === 'play' && st.seasonIndex === 2 && st.climate !== 'ordinaire', 'saison 2 ouverte, climat ' + st.climate);
}

// ── 4. marée et pleines mers
{
  const now = Date.UTC(2026, 9, 4, 20, 0);
  const hts = SIM.nextHighTides(now, 2).map((ms) => new Date(ms).toISOString().slice(11, 16));
  console.log(`  pleines mers après 2026-10-04 20:00 UTC : ${hts.join(', ')} ; amplitude ${fmt(SIM.tideAmp(now), 2)} ; lune ${fmt(SIM.moonPhase(now), 2)}`);
  const ht = SIM.nextHighTides(now, 1)[0];
  check(Math.abs(SIM.tide(ht) - SIM.tideAmp(ht)) < 0.01 && ht > now, 'la pleine mer calculée est bien un maximum à venir');
}
console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
process.exit(fails ? 1 : 0);
