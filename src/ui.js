/* ŒILLETS — cœur de l'interface : état, horloge, boucle, HUD, marge et anneau, tutoriel, entrées, sauvegarde. */
const UI = (() => {
  'use strict';
  const S = SIM, R = RENDER, t = COPY.t, pl = COPY.pl, $ = (s) => document.querySelector(s);
  const KEY = 'oeillets.v1';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let st = null, env = null, mode = 'play', selected = null, selFree = null, ring = null, strokes = [], flood = 0;
  let tutoVh = 6, tutoSimVh = 6, tutoEnv = null, lastFrame = 0, lastDraw = 0, dirty = true, lastSave = 0, flashUntil = 0, flashText = '', bannerUntil = 0;
  let margeText = '', margeDicton = false, margeAction = null, speed = 1, winterType = 'oeillet', ringBtn = null, lastGridBottom = -1, corrupt = false;

  // ─── formats ───
  const fmt = (n, d = 0) => (Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtHeure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtJour = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtJourCourt = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short' });
  const lune = (ms) => COPY.T.lunes[Math.round(S.moonPhase(ms) * 8) % 8];
  const fmtVh = (vh) => { const h = Math.floor(vh % 24), m = Math.floor((vh % 1) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

  // ─── horloge (vitesse de test via #x120) ───
  const simNow = () => st.clock.anchorSim + (Date.now() - st.clock.anchorReal) * st.clock.speed;
  function setSpeed(s) { const now = simNow(); st.clock = { anchorSim: now, anchorReal: Date.now(), speed: s }; speed = s; save(); }
  function resetClock() { st.clock = { anchorSim: Date.now(), anchorReal: Date.now(), speed: 1 }; speed = 1; st.lastSimMs = Date.now(); }

  // ─── sauvegarde ───
  function save() { try { st.lastSave = Date.now(); localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* stockage indisponible */ } lastSave = performance.now(); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.cells)) { corrupt = true; return null; }
      return migrate(s);
    } catch (e) { corrupt = true; return null; }
  }
  function migrate(s) {
    const fresh = S.newState(Date.now());
    for (const k in fresh) if (!(k in s)) s[k] = fresh[k];
    for (const c of s.cells) for (const k of ['gDay', 'pinkH', 'fleur', 'dryH']) if (c[k] == null) c[k] = 0;
    if (!s.clock || !s.clock.speed) s.clock = { anchorSim: Date.now(), anchorReal: Date.now(), speed: 1 };
    if (s.clock.speed === 1) { s.clock.anchorSim = Date.now(); s.clock.anchorReal = Date.now(); }
    else { s.clock.anchorReal = Date.now(); } // l'horloge accélérée reprend là où elle était
    if (s.winterBank == null) s.winterBank = 0;
    if (!s.tutoFlags) s.tutoFlags = {};
    if (s.pendingHivernage == null) s.pendingHivernage = false;
    return s;
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* pas de vibreur */ } }
  const changed = () => { dirty = true; save(); };
  const flash = (txt, ms) => { flashText = txt; flashUntil = performance.now() + (ms || 3200); dirty = true; };

  // ─── prévision 24 h (carnet, bandeau) ───
  function forecast() {
    const now = simNow();
    let rainAt = null, cloudAt = null, windH = 0, fleurTonight = false;
    for (let h = 0; h <= 24; h++) {
      const e = S.envAt(st, now + h * 3.6e6);
      if (e.rain > 0 && rainAt == null) rainAt = now + h * 3.6e6;
      if (e.P < 1008 && cloudAt == null) cloudAt = now + h * 3.6e6;
      if (e.wind > 0.6) windH++;
      if (S.fleurOK(e) && h < 12) fleurTonight = true;
    }
    const until = (ms) => fmtHeure(ms);
    if (rainAt != null) return { key: 'pluie', phrase: `${COPY.T.previsions.pluie} vers ${until(rainAt)}.`, court: `pluie vers ${until(rainAt)}`, rainAt };
    if (fleurTonight && env && env.hour < 20) return { key: 'fleur', phrase: `${COPY.T.previsions.fleur} : écume avant 20 h.`, court: 'soir à fleur' };
    if (windH >= 6) return { key: 'vent', phrase: `${COPY.T.previsions.vent} une bonne partie de la journée.`, court: 'vent' };
    if (cloudAt != null) return { key: 'couvert', phrase: t('carnet_prevision', { prevision: COPY.T.previsions.couvert, heure: until(cloudAt) }), court: 'couvert' };
    return { key: 'beau', phrase: t('carnet_prevision', { prevision: COPY.T.previsions.beau, heure: until(now + 24 * 3.6e6) }), court: 'beau' };
  }
  function baroData() {
    if (!env) return null;
    if (!st.items.barometre) return { P: env.P, dP: env.dP };
    const now = simNow(), curve = [];
    for (let h = 0; h <= 24; h += 2) curve.push(S.pressureAt(st, now + h * 3.6e6));
    return { curve };
  }

  // ─── HUD ───
  const rollers = {};
  function roll(id, value, fmtFn) {
    const el = $(id), r = rollers[id] || (rollers[id] = { v: value, timer: null });
    if (r.v === value) { el.innerHTML = fmtFn(value); return; }
    if (reduceMotion || Math.abs(value - r.v) < 0.005) { r.v = value; el.innerHTML = fmtFn(value); return; }
    const steps = 10, d = (value - r.v) / steps; let i = 0;
    clearInterval(r.timer);
    r.timer = setInterval(() => { i++; r.v = i >= steps ? value : r.v + d; el.innerHTML = fmtFn(r.v); if (i >= steps) clearInterval(r.timer); }, 60);
  }
  function hud() {
    if (!env) return;
    $('#heure').textContent = st.phase === 'tuto' ? fmtVh(tutoVh) : fmtHeure(simNow());
    const prev = st.phase === 'play' ? forecast() : null;
    const meteo = `${fmt(env.T, 0)} °C${env.rain > 0 ? ' · pluie' : env.wind > 0.6 ? ' · vent' : ''}${prev && env.rain <= 0 ? ' · ' + prev.court : ''}`;
    $('#meteo').textContent = meteo;
    const ht = st.phase === 'tuto' ? null : S.nextHighTides(simNow(), 1)[0];
    $('#maree-txt').innerHTML = st.phase === 'tuto'
      ? `PLEINE MER <b>${tutoVh % 24 < 7 ? '07:00' : tutoVh % 24 < 19.42 ? '19:25' : '07:00'}</b>`
      : `PLEINE MER <b>${fmtHeure(ht)}</b>`;
    roll('#cash', st.cash, (v) => `${fmt(v, v < 100 ? 2 : 0)}<small>\u202f€</small>`);
    const fleur = st.fleurStock > 0.005 ? ` · ${fmt(st.fleurStock, 2)} kg fleur` : '';
    $('#mulon').innerHTML = `<b>${fmt(st.mulon, st.mulon < 10 ? 1 : 0)}</b> kg au mulon${fleur}`;
    if (st.phase === 'tuto') $('#reserve').innerHTML = '<span class="etiquette" style="font-size:11px;padding:2px 6px">1re journée · ×144</span>';
    else $('#reserve').textContent = t('hud_reserve', { jours: fmt(S.reserveDays(st), 1) }) + (env.A < 0.9 ? ' · mortes-eaux' : env.A > 1.2 ? ' · vives-eaux' : '');
  }
  function placeDom() {
    const g = R.layout(st), marge = $('#marge');
    marge.style.top = (g.gridBottom + 2) + 'px';
    const put = (id, x, y, right) => { const el = $(id); el.style.top = y + 'px'; if (right) { el.style.right = (g.W - x) + 'px'; el.style.left = 'auto'; } else el.style.left = x + 'px'; };
    put('#lbl-seuil', g.gauge.sillX - 5, g.gauge.y + 18, true);
    put('#lbl-mer', g.gx - 4, g.seaY - 15);
    put('#lbl-etier', g.etier.x - 18, g.vasY - 20, true);
    put('#lbl-baro', g.baro.x + g.baro.w, g.baro.y + g.baro.h + 4, true);
    lastGridBottom = g.gridBottom;
  }
  function baroWord() { if (!env) return ''; return st.items.barometre ? 'Baro · 24 h' : env.dP < -0.15 ? 'Baro · baisse' : env.dP > 0.15 ? 'Baro · monte' : 'Baro · stable'; }
  const nomParcelle = (c) => COPY.T.noms_def[c.type] + (c.type === 'vasiere' ? '' : ' ' + c.num);

  // ─── marge et anneau : une seule action suggérée ───
  function setMarge(txt, dicton, action) {
    if (txt !== margeText || dicton !== margeDicton || action !== margeAction) {
      margeText = txt; margeDicton = !!dicton; margeAction = action || null;
      const em = $('#marge-txt'); em.textContent = dicton ? `«\u202f${txt}\u202f»` : txt; em.classList.toggle('dicton', !!dicton); em.classList.toggle('action', !!action);
    }
  }
  function margeTap() {
    if (!margeAction) return;
    if (margeAction === 'eneau') SHEETS.confirm(t('mise_en_eau_confirm'), () => { S.miseEnEau(st); changed(); });
    else if (margeAction === 'lever') SHEETS.confirm(t('lever_eau_confirm'), () => { S.leverEau(st); changed(); });
  }
  function setRing(r) { ring = r && r.kind !== 'btn' ? r : null; const b = r && r.kind === 'btn' ? r.id : null; if (b !== ringBtn) { if (ringBtn) $('#' + ringBtn).classList.remove('anneau'); ringBtn = b; if (b) $('#' + b).classList.add('anneau'); } }
  function suggest() {
    const nowP = performance.now();
    if (flashUntil > nowP) { setMarge(flashText, false); setRing(null); return; }
    if (st.phase === 'hiver') { setMarge(t('marge_hiver'), false); setRing(null); return; }
    if (st.phase === 'tuto') { tutorial(); return; }
    const vas = st.cells.find((c) => c.type === 'vasiere'), oes = st.cells.filter((c) => c.type === 'oeillet');
    const prev = forecast();
    if (!st.items.clapet && env.h > S.P.SILL && !st.etierOpen && !st.enEau) return pick(t('marge_ouvre_etier'), { kind: 'etier' });
    if (!st.items.clapet && env.h < S.P.SILL - 0.05 && st.etierOpen && vas.depth > 1 && !st.enEau) return pick(t('marge_ferme_etier'), { kind: 'etier' });
    if (st.enEau && env.hour >= 6.5 && env.hour < 20) return pick(t('marge_lever'), null, false, 'lever');
    const salted = oes.filter((c) => S.kgOf(c.crust) >= 5).sort((a, b) => b.crust - a.crust);
    if (salted.length && prev.rainAt && prev.rainAt - simNow() < 3 * 3.6e6) return pick(t('marge_pluie_vient'), { kind: 'cell', id: salted[0].id });
    if (salted.length && S.kgOf(salted[0].crust) >= 20) return pick(t('marge_sel', { kg: fmt(S.kgOf(salted[0].crust), 0), n: salted[0].num }), { kind: 'cell', id: salted[0].id });
    const fl = oes.find((c) => c.fleur > 0.3);
    if (fl && st.items.lousse && env.hour >= 15 && env.hour < 20) return pick(t('marge_fleur'), { kind: 'cell', id: fl.id });
    if (fl && !st.items.lousse) return pick(t('marge_fleur_lousse'), { kind: 'btn', id: 'b-coop' });
    const dry = st.cells.filter((c) => c.type !== 'vasiere' && c.depth <= 0.02 && c.dryH > S.P.CRACK_AFTER[c.type] && !st.enEau).sort((a, b) => b.dryH - a.dryH)[0];
    if (dry) return pick(t('marge_a_sec', { nom: nomParcelle(dry), h: fmt(dry.dryH, 0) }), { kind: 'cell', id: dry.id });
    const crusty = st.cells.find((c) => c.type !== 'vasiere' && c.type !== 'oeillet' && S.kgOf(c.crust) > 30);
    if (crusty) return pick(t('marge_croute', { nom: nomParcelle(crusty) }), { kind: 'cell', id: crusty.id });
    if (env.hour >= 20.5 && !st.enEau && mode === 'play') return pick(t('marge_mise_en_eau'), null, false, 'eneau');
    if (st.mulon * S.P.PRICE_GROS + st.fleurStock * S.P.PRICE_FLEUR >= 20) return pick(t('marge_porter'), { kind: 'btn', id: 'b-coop' });
    if (env.A < 0.95 && S.reserveDays(st) < 2) {
      const j = daysToNeap(), jours = S.reserveDays(st);
      return pick(j <= 0 ? t('marge_reserve_maintenant', { jours: fmt(jours, 1), s: pl(jours) }) : t('marge_reserve', { j, s_j: pl(j), jours: fmt(jours, 1), s: pl(jours) }), null);
    }
    if (st.cash >= 60 && S.DIG_TYPES.some((ty) => anyDig(ty))) return pick(t('marge_creuser', { eur: fmt(st.cash, 0) }), { kind: 'btn', id: 'b-creuser' });
    const day = S.seasonDay(st, simNow()), slot = Math.floor(env.hour / 6);
    if ((day + slot) % 3 === 0) return pick(t('marge_rien'), null);
    return pick(COPY.DICTONS[(day * 7 + slot) % COPY.DICTONS.length], null, true);
  }
  function pick(txt, r, dicton, action) { setMarge(txt, dicton, action); setRing(r); }
  function anyDig(type) { for (let r = 1; r < st.rows; r++) for (let c = 0; c < S.P.COLS; c++) if (S.canDig(st, r, c, type).ok) return true; return false; }
  function daysToNeap() { const now = simNow(); if (S.tideAmp(now) < 0.9) return 0; for (let d = 1; d < 15; d++) if (S.tideAmp(now + d * 864e5) < 0.9) return d; return 0; }

  // ─── tutoriel : première journée en accéléré ───
  const CHAIN = ['0,0|1,3', '1,3|2,3', '2,3|3,3', '3,3|4,3'];
  function tutorial() {
    const vas = st.cells.find((c) => c.type === 'vasiere'), oe = st.cells.find((c) => c.type === 'oeillet'), f = st.tutoFlags;
    const kg = S.kgOf(oe.crust), e = tutoEnv;
    if (S.salinity(oe) >= 150 && !f.rosit) { f.rosit = true; flash(COPY.DICTONS[1]); }
    if (e.night && tutoVh > 21.5 && tutoVh < 22 && !f.nuit) { f.nuit = true; flash(COPY.DICTONS[2]); }
    if (tutoVh < 6.7) return pick(t('marge_eaux_vieilles'), null);
    if (e.rain > 0 && S.gateOpen(st, '3,3|4,3') && !f.pluieFaite) return pick(t('marge_pluie'), { kind: 'gate', key: '3,3|4,3' });
    if (e.rain > 0) f.pluieFaite = true;
    if (st.etierOpen) f.etierOnce = true;
    if (e.h > S.P.SILL && !st.etierOpen && !st.items.clapet) return pick(t(tutoVh > 12 ? 'marge_remonte' : 'marge_ouvre_etier'), { kind: 'etier' });
    if (e.h < S.P.SILL - 0.02 && st.etierOpen && !st.items.clapet && vas.depth > 1) return pick(t('marge_ferme_etier'), { kind: 'etier' });
    if (vas.depth < 1 && !st.etierOpen && !st.items.clapet && tutoVh > 9 && tutoVh < 18) return pick(t('marge_maree_ratee'), { kind: 'etier' });
    const closed = CHAIN.find((k) => !S.gateOpen(st, k));
    if (closed && vas.depth > 3 && tutoVh < 22) return pick(t('marge_descendre'), { kind: 'gate', key: closed });
    if (kg >= 20 || (tutoVh >= 17 && kg >= 5)) return pick(t('marge_tirer'), { kind: 'cell', id: oe.id });
    if (st.mulon > 0.5) return pick(t('marge_porter'), { kind: 'btn', id: 'b-coop' });
    if (tutoVh >= 29) return pick(t('marge_fin_journee', { heure: fmtHeure(S.nextHighTides(Date.now(), 1)[0]) }), null);
    return pick(COPY.DICTONS[tutoVh < 12 ? 0 : tutoVh < 21.5 ? 5 : 2], null, true);
  }
  function startTutorial() {
    st.phase = 'tuto'; tutoVh = 6; tutoSimVh = 6; st.tutorialVh = 6; dirty = true; save();
  }
  function endTutorial() {
    const now = Date.now();
    st.phase = 'play'; st.tutorialDone = true; st.tutorialEndMs = now; st.seasonStartMs = now; st.lastSimMs = now; resetClock();
    st.carnet.push({ season: st.seasonIndex, day: 1, text: t('obs_premiere', { kg: fmt(st.stats.kgRaked, 0), eur: fmt(st.stats.eurSold, 0) }) });
    st.lastObsDay = 1;
    flash(t('marge_fin_journee', { heure: fmtHeure(S.nextHighTides(now, 1)[0]) }), 20000);
    save();
    SHEETS.carnet(true);
  }
  function showBanner(txt) { const b = $('#bandeau'); b.textContent = txt; b.hidden = false; b.style.whiteSpace = txt.length > 40 ? 'normal' : 'nowrap'; }

  // ─── observations du carnet (une par jour au plus) ───
  function observe(day) {
    if (st.lastObsDay === day) return;
    st.lastObsDay = day;
    const snap = st.daySnap || { gLost: st.stats.gLostUpstream, gRain: st.stats.gRainRedissolved };
    const oes = st.cells.filter((c) => c.type === 'oeillet'), ads = st.cells.filter((c) => c.type === 'aderne'), vas = st.cells.find((c) => c.type === 'vasiere');
    const cands = [];
    const best = oes.slice().sort((a, b) => b.gDay - a.gDay)[0];
    if (best && S.kgOf(best.gDay) >= 5) cands.push(['obs_meilleur_oeillet', { n: best.num, kg: fmt(S.kgOf(best.gDay), 0) }]);
    if (S.kgOf(st.stats.gRainRedissolved - snap.gRain) >= 3) cands.push(['obs_pluie', { kg: fmt(S.kgOf(st.stats.gRainRedissolved - snap.gRain), 0) }]);
    if (S.kgOf(st.stats.gLostUpstream - snap.gLost) >= 20) cands.push(['obs_croute', { kg: fmt(S.kgOf(st.stats.gLostUpstream - snap.gLost), 0) }]);
    const dry = oes.filter((c) => c.dryH >= 6).sort((a, b) => b.dryH - a.dryH)[0];
    if (dry) cands.push(['obs_sec', { n: dry.num, h: fmt(dry.dryH, 0) }]);
    if (env.A < 0.9 && vas && vas.depth < 8) cands.push(['obs_mortes_eaux', { cm: fmt(vas.depth, 0) }]);
    const pink = ads.filter((c) => c.pinkH >= 48).sort((a, b) => b.pinkH - a.pinkH)[0];
    if (pink) cands.push(['obs_rose', { n: pink.num, j: fmt(pink.pinkH / 24, 0) }]);
    if (st.stats.kgFleur >= 5) cands.push(['obs_fleur', { kg: fmt(st.stats.kgFleur, 1), eur: fmt(st.stats.kgFleur * 12, 0), kg_gros: fmt(st.stats.kgFleur * 15, 0) }]);
    if (oes.length) cands.push(['obs_ratio', { aup: S.upstreamArea(st), n: oes.length, s: pl(oes.length) }]);
    const choice = cands.find(([k]) => !(k in st.seenObs) || day - st.seenObs[k] >= 5);
    if (choice) { st.seenObs[choice[0]] = day; st.carnet.push({ season: st.seasonIndex, day, text: t(choice[0], choice[1]) }); if (st.carnet.length > 120) st.carnet.shift(); }
    for (const c of oes) c.gDay = 0;
    st.daySnap = { gLost: st.stats.gLostUpstream, gRain: st.stats.gRainRedissolved };
  }

  // ─── boucle ───
  function frame(now) {
    const rdt = Math.min(0.6, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    if (st.phase === 'tuto') {
      const target = Math.min(30, tutoVh + rdt * 0.04); // ×144 : 24 h simulées en 10 min réelles
      let guard = 0;
      while (tutoSimVh < target - 1e-9 && guard++ < 400) { // rattrape aussi un saut d'horloge (test, image en retard)
        const d = Math.min(1 / 6, target - tutoSimVh); tutoSimVh += d;
        tutoEnv = S.tutorialEnv(tutoSimVh, !st.tutoFlags.etierOnce && !st.etierOpen); S.step(st, tutoEnv, d);
      }
      tutoVh = target; st.tutorialVh = tutoVh;
      tutoEnv = S.tutorialEnv(tutoVh, !st.tutoFlags.etierOnce && !st.etierOpen); env = tutoEnv; env.ms = Date.now();
      dirty = true;
      if (tutoVh >= 30) endTutorial();
    } else if (st.phase === 'play') {
      const simMs = simNow(), gapMs = simMs - st.lastSimMs;
      if (gapMs > 10 * 60000) {
        const rep = S.catchUp(st, simMs);
        env = S.envAt(st, simNow());
        save();
        if (!SHEETS.isOpen() && (rep.hivernage || gapMs / st.clock.speed >= 45 * 60000)) SHEETS.retour(rep);
        dirty = true;
      } else if (gapMs > 0) {
        env = S.envAt(st, simMs);
        S.step(st, env, gapMs / 3.6e6);
        st.lastSimMs = simMs;
      } else env = S.envAt(st, simMs);
      const day = S.seasonDay(st, simMs);
      if (day !== st.lastObsDay && st.tutorialDone) observe(day);
      if ((st.pendingHivernage || simMs >= S.seasonEndMs(st)) && !SHEETS.isOpen()) startHivernage(true);
    } else {
      env = S.envAt(st, simNow());
    }
    if (flood > 0 && flood < 0.8) { flood = Math.min(0.8, flood + rdt * 0.3); dirty = true; if (flood >= 0.8) SHEETS.hivernagePage(); }
    for (const s of strokes) s.life -= rdt * 1.6;
    if (strokes.length) { strokes = strokes.filter((s) => s.life > 0); dirty = true; }
    if (bannerUntil !== Infinity && bannerUntil && now > bannerUntil) { $('#bandeau').hidden = true; bannerUntil = 0; }
    if (flashUntil && now > flashUntil) { flashUntil = 0; dirty = true; }
    if (R.layout(st).gridBottom !== lastGridBottom) placeDom();
    if (dirty || now - lastDraw > (reduceMotion ? 1000 : 480)) {
      lastDraw = now; dirty = false;
      $('#lbl-baro').textContent = baroWord();
      suggest();
      R.draw(st, env, { mode, selected, selFree, ring, strokes, flood, baro: baroData(), reduceMotion, problems: mode === 'hiver' ? S.winterProblems(st) : null });
      hud();
    }
    if (now - lastSave > 30000 && st.phase !== 'garde') save();
    requestAnimationFrame(frame);
  }

  // ─── hivernage ───
  function startHivernage(auto) {
    if (st.phase !== 'play') return;
    SHEETS.closeSheet(); SHEETS.closePage();
    S.hivernage(st, simNow(), auto);
    st.winterBank = 0; mode = 'play'; setRing(null);
    flood = 0.01; dirty = true; save();
  }
  function setMode(m) {
    mode = m; selected = null; selFree = null; dirty = true;
    $('#b-creuser').classList.toggle('actif', m === 'creuser');
    $('#barre').hidden = m === 'hiver'; $('#marge').hidden = false;
    if (m === 'hiver') { SHEETS.hiverBar(); R.setBottomInset($('#hiver-bar').offsetHeight + 4); }
    else { $('#hiver-bar').hidden = true; R.setBottomInset(0); }
    placeDom();
  }
  function openSeasonUI() {
    S.openSeason(st, Date.now()); resetClock(); flood = 0; setMode('play'); changed();
    flash(t('marge_fin_journee', { heure: fmtHeure(S.nextHighTides(simNow(), 1)[0]) }), 8000);
  }

  // ─── entrées tactiles ───
  function input() {
    const cv = $('#marais');
    let down = null, dragged = false, raked = new Set();
    cv.addEventListener('pointerdown', (e) => {
      if (SHEETS.isOpen() || st.phase === 'garde' || down || e.isPrimary === false) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, hit: R.hit(st, e.clientX, e.clientY), lx: e.clientX, ly: e.clientY };
      dragged = false; raked = new Set();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture indisponible */ }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      if (!dragged && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 18) dragged = true;
      if (dragged && mode !== 'hiver') {
        const h = R.hit(st, e.clientX, e.clientY);
        if (h && h.kind === 'cell' && h.cell.type === 'oeillet' && !raked.has(h.cell.id) && h.cell.crust > 0) {
          raked.add(h.cell.id);
          const kg = S.rakeCell(st, h.cell, env.rain > 0 ? 'p' : env.night ? 'n' : 's');
          strokes.push({ x0: down.lx, y0: down.ly, x1: e.clientX, y1: e.clientY, life: 1 });
          buzz(10); flash(`+${fmt(kg, 1)} kg au mulon`); changed();
        }
        down.lx = e.clientX; down.ly = e.clientY;
      }
      e.preventDefault();
    });
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const h = down.hit; down = null;
      if (dragged || !h) return;
      tap(h);
    };
    cv.addEventListener('pointerup', up);
    const cancel = (e) => { if (down && e.pointerId === down.id) down = null; };
    cv.addEventListener('pointercancel', cancel); cv.addEventListener('lostpointercapture', cancel);
    $('#marge-txt').addEventListener('click', margeTap);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#b-carnet').addEventListener('click', () => { buzz(6); if (mode === 'creuser') setMode('play'); SHEETS.carnet(false); });
    $('#b-coop').addEventListener('click', () => { buzz(6); if (mode === 'creuser') setMode('play'); SHEETS.coop(); });
    $('#b-creuser').addEventListener('click', () => { buzz(6); setMode(mode === 'creuser' ? 'play' : 'creuser'); if (mode === 'creuser') flash(t('creuser_aide')); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { SHEETS.closeSheet(); SHEETS.closePage(); } });
  }
  function tap(h) {
    if (mode === 'hiver') {
      if (h.kind === 'free') { if (winterType === 'vase') return; if (!S.winterSet(st, h.r, h.c, winterType)) flash('Plus de parcelle à placer : rends-en une à la vase d’abord.'); }
      else if (h.kind === 'cell' && h.cell.type !== 'vasiere') S.winterSet(st, h.cell.r, h.cell.c, winterType === 'vase' ? null : winterType);
      else return;
      buzz(8); changed(); SHEETS.hiverBar(); return;
    }
    if (h.kind === 'etier') { if (st.items.clapet) { flash(t('marge_clapet')); return; } S.toggleEtier(st); buzz(8); changed(); return; }
    if (h.kind === 'gate') { S.toggleGate(st, h.gate.key); buzz(8); changed(); return; }
    if (h.kind === 'free') { if (mode === 'creuser') SHEETS.creuser(h.r, h.c); else { setMode('creuser'); SHEETS.creuser(h.r, h.c); } return; }
    if (h.kind === 'cell') {
      const c = h.cell;
      if (mode === 'creuser' && c.type === 'vasiere') { SHEETS.agrandir(); return; }
      if (c.type === 'oeillet' && c.fleur > 0.15 && st.items.lousse) { const kg = S.skimCell(st, c); buzz([8, 20, 8]); flash(`+${fmt(kg, 2)} kg de fleur`); changed(); return; }
      if (c.type === 'oeillet' && c.fleur > 0.15 && !st.items.lousse) flash(t('lousse_absente'));
      SHEETS.fiche(c);
    }
  }

  // ─── démarrage ───
  function boot() {
    R.init($('#marais'), $('#probe'));
    st = load();
    const fresh = !st;
    if (fresh) st = S.newState(Date.now());
    speed = st.clock.speed;
    const m = /^#x(\d+)$/.exec(location.hash);
    if (m) setSpeed(Math.max(1, Math.min(2000, +m[1])));
    env = st.phase === 'tuto' ? S.tutorialEnv(st.tutorialVh || 6) : S.envAt(st, simNow());
    tutoVh = st.tutorialVh || 6; tutoSimVh = tutoVh;
    placeDom();
    input();
    window.addEventListener('resize', () => { R.resize(); placeDom(); dirty = true; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else { lastFrame = performance.now(); dirty = true; } });
    window.addEventListener('pagehide', save);
    if (st.phase === 'garde') SHEETS.garde(corrupt ? t('sauvegarde_perdue') : '');
    else if (st.phase === 'hiver') { SHEETS.hivernagePage(); flood = 0.8; }
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    window.__oeillets = { get st() { return st; }, get env() { return env; }, SIM: S, R, simNow, setSpeed, save, catchUp: (ms) => S.catchUp(st, ms), setVh: (v) => { tutoVh = v; }, startHivernage, setMode, redraw: () => { dirty = true; }, reset: () => { try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } location.reload(); } };
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') setTimeout(boot, 0);

  return {
    get st() { return st; }, get env() { return env; }, get speed() { return speed; }, get winterType() { return winterType; }, set winterType(v) { winterType = v; },
    fmt, fmtHeure, fmtJour, fmtJourCourt, lune, simNow, save, changed, buzz, flash, forecast, resetClock, setMode, openSeasonUI, startTutorial, startHivernage, nomParcelle,
    select(c) { selected = c; dirty = true; }, selectFree(p) { selFree = p; dirty = true; },
    onSold(r) { if (r.eur > 0) flash(`Vendu : ${fmt(r.eur, 2)} €`); },
  };
})();
