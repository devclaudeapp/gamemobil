/* DERNIER REMPART — la musique et les ambiances (Lot 6), synthétisées en Web Audio sur le contexte de PSONS : aucun fichier.
   Un séquenceur à doubles croches (on planifie un peu d'avance, à chaque image) joue des couches qui montent et descendent avec la partie :
   · les moments : « menu » (l'écran titre : une nappe et un arpège lents), « pause » (entre deux vagues : la même, plus douce, et une pulsation),
     « vague » (la basse, les charlestons, puis la grosse caisse et la caisse claire selon l'intensité : le nombre de zombies, la vie qui baisse),
     « boss » (plus vite, plus sombre : une autre grille, la basse en doubles croches), « fin » (le silence après le jingle) ;
   · Noël : des clochettes (un carillon sur les notes de l'accord, un grelot) par-dessus ;
   · chaque arène joue dans sa tonalité (une transposition), avec son ambiance : le vent, les vagues, un grondement, un bourdonnement, des
     oiseaux, des bips, des corbeaux…
   Les jingles : la vague finie (un arpège majeur qui monte), le boss qui arrive (un accord grave qui s'ouvre), la partie perdue (qui descend).
   API : ZMUSIQUE.maj({ moment, intensite, arene, noel }) (à chaque image) ; jingle(nom) ; regler({ son, volume, ambiance }) ; baisser(duree)
   (les grosses explosions : la musique s'efface un instant) ; etat() (pour les tests) ; rendre(moment, secondes, o) → Promise<{ pic, rms }>
   (un rendu hors ligne, pour les tests). Le reste est pur : moment(jeu, ecran), intensite(jeu, j), GRILLES, TRANSPOSE. */
const ZMUSIQUE = (() => {
  'use strict';
  const P = typeof PSONS !== 'undefined' ? PSONS : null;
  // ─── la musique sur le papier : les grilles d'accords (une mesure chacun, notes MIDI), les tempos ───
  const GRILLES = {
    menu: { bpm: 84, accords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]] },                     // la mineur, fa, do, sol
    pause: { bpm: 90, accords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]] },
    vague: { bpm: 116, accords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60], [55, 59, 62], [56, 59, 64]] }, // … et mi majeur pour relancer
    boss: { bpm: 132, accords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]] },                    // ré mineur, si bémol, sol mineur, la
  };
  // la tonalité de chaque arène (des demi-tons ajoutés à tout) : on ne joue pas deux fois tout à fait la même chose
  const TRANSPOSE = [0, -2, 3, -3, 2, 5, -5, 1, -1, 4, -4, 2, -2, 3, 0];
  // l'ambiance de chaque arène : un bruit filtré (passe-bas, fréquence, niveau, houle : la vitesse de sa respiration), et des sons qui passent
  const AMBIANCES = {
    jardin: { f: 900, g: 0.025, houle: 0.15, sons: ['oiseau'] }, ferme: { f: 800, g: 0.03, houle: 0.12, sons: ['oiseau'] },
    parking: { f: 260, g: 0.03, houle: 0.05, sons: ['sirene'] }, cimetiere: { f: 600, g: 0.04, houle: 0.2, sons: ['corbeau'] },
    port: { f: 420, g: 0.06, houle: 0.11, sons: ['mouette'] }, place: { f: 700, g: 0.02, houle: 0.1, sons: ['oiseau'] },
    plage: { f: 520, g: 0.07, houle: 0.09, sons: ['mouette'] }, chantier: { f: 300, g: 0.03, houle: 0.06, sons: ['sirene'] },
    supermarche: { f: 180, g: 0.035, houle: 0.03, sons: ['bip'] }, foret: { f: 700, g: 0.045, houle: 0.18, sons: ['corbeau', 'oiseau'] },
    neon: { f: 140, g: 0.04, houle: 0.04, sons: ['sirene'] }, volcan: { f: 90, g: 0.08, houle: 0.07, sons: ['gronde'] },
    metro: { f: 120, g: 0.05, houle: 0.05, sons: ['gronde'] }, hopital: { f: 220, g: 0.02, houle: 0.04, sons: ['bip'] },
    base: { f: 500, g: 0.035, houle: 0.14, sons: ['corbeau'] },
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // ─── le moment de la musique, et son intensité (pur) ───
  function moment(jeu, ecran) {
    if (!jeu || ecran !== 'jeu') return ecran === 'fin' ? 'fin' : 'menu';
    if (jeu.fini) return 'fin';
    if (jeu.mode === 'infection') return 'vague';
    if ((jeu.zombies || []).some((z) => z.vie > 0 && typeof ZDONNEES !== 'undefined' && ZDONNEES.ZOMBIES[z.type] && ZDONNEES.ZOMBIES[z.type].boss)) return 'boss';
    return jeu.phase === 'vague' ? 'vague' : 'pause';
  }
  function intensite(jeu, j) {
    if (!jeu) return 0;
    const n = (jeu.zombies || []).filter((z) => z.vie > 0).length, vie = j && j.vieMax ? j.vie / j.vieMax : 1;
    return Math.max(0, Math.min(1, 0.25 + Math.min(0.5, n / 28) + (vie < 0.35 ? 0.25 : 0) + (jeu.vague >= 10 ? 0.1 : 0)));
  }
  // ─── les instruments (sur un contexte donné : celui du jeu, ou hors ligne pour les tests) ───
  let bruitB = null;
  function bruit(ctx) { if (!bruitB || bruitB.sampleRate !== ctx.sampleRate) { const n = ctx.sampleRate | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; bruitB = b; } return bruitB; }
  function env(g, t, att, dur, vol) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function osc(ctx, dest, type, f0, f1, t, dur, vol, att, filtre) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    let sortie = g; if (filtre) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(filtre, t); f.Q.value = 2; g.connect(f); sortie = f; }
    env(g, t, att || 0.005, dur, vol); o.connect(g); sortie.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function souffle(ctx, dest, type, f, q, t, dur, vol) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = bruit(ctx); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    env(g, t, 0.002, dur, vol); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const INSTR = {
    grosse(ctx, d, t, v) { osc(ctx, d, 'sine', 150, 42, t, 0.28, 0.9 * v, 0.002); },
    claire(ctx, d, t, v) { souffle(ctx, d, 'bandpass', 1900, 0.9, t, 0.16, 0.45 * v); osc(ctx, d, 'triangle', 200, 140, t, 0.08, 0.25 * v, 0.002); },
    charleston(ctx, d, t, v) { souffle(ctx, d, 'highpass', 7500, 0.7, t, 0.04, 0.18 * v); },
    basse(ctx, d, t, v, m, dur) { osc(ctx, d, 'sawtooth', hz(m), hz(m), t, dur, 0.32 * v, 0.006, 420); },
    nappe(ctx, d, t, v, accord, dur) { for (const m of accord) for (const det of [-6, 6]) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * v, t + dur * 0.3); g.gain.setValueAtTime(0.05 * v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05); o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + dur * 1.1); } },
    arpege(ctx, d, t, v, m) { osc(ctx, d, 'triangle', hz(m), hz(m), t, 0.22, 0.13 * v, 0.004); },
    cloche(ctx, d, t, v, m) { osc(ctx, d, 'sine', hz(m), hz(m), t, 1.3, 0.12 * v, 0.003); osc(ctx, d, 'sine', hz(m) * 2.76, hz(m) * 2.76, t, 0.5, 0.04 * v, 0.003); },
    grelot(ctx, d, t, v) { souffle(ctx, d, 'bandpass', 9000, 3, t, 0.08, 0.06 * v); },
  };
  // ─── une double croche : ce que joue chaque couche (pur sur le papier, les volumes viennent des couches) ───
  // k : le numéro de la double croche depuis le début ; c : les couches { nappe, arpege, basse, rythme, cloches } (0..1) ; tr : la transposition
  function pas(ctx, d, t, k, M, c, tr, i, sec) {
    const G = GRILLES[M], mesure = Math.floor(k / 16), s = k % 16, acc = G.accords[mesure % G.accords.length].map((m) => m + tr), dur16 = sec;
    if (c.nappe > 0.01 && s === 0) INSTR.nappe(ctx, d, t, c.nappe, acc, dur16 * 16);
    if (c.arpege > 0.01 && s % (M === 'vague' && i > 0.7 ? 1 : 2) === 0) { const ordre = [0, 1, 2, 1], n = acc[ordre[(s >> (M === 'vague' && i > 0.7 ? 0 : 1)) % 4]] + 12; INSTR.arpege(ctx, d, t, c.arpege, n); }
    if (c.basse > 0.01) {
      const racine = acc[0] - 24 + (acc[0] - 24 < 33 ? 12 : 0);
      if (M === 'boss') INSTR.basse(ctx, d, t, c.basse, racine + (s % 4 === 2 ? 12 : 0), dur16 * 0.9);
      else if (M === 'vague' && [0, 3, 6, 8, 10, 11, 14].includes(s)) INSTR.basse(ctx, d, t, c.basse, racine + (s === 14 ? 7 : 0), dur16 * 1.6);
      else if (M === 'pause' && s % 8 === 0) INSTR.basse(ctx, d, t, c.basse * 0.7, racine, dur16 * 6);
    }
    if (c.rythme > 0.01) {
      const fort = M === 'boss' || i > 0.7;
      if (s % 4 === 0 && (M === 'boss' || s % 8 === 0 || i > 0.7)) INSTR.grosse(ctx, d, t, c.rythme);
      if ((s === 4 || s === 12) && (M === 'boss' || i > 0.45)) INSTR.claire(ctx, d, t, c.rythme);
      if (fort ? true : s % 2 === 0) INSTR.charleston(ctx, d, t, c.rythme * (s % 4 === 2 ? 1 : 0.6));
    }
    if (c.cloches > 0.01) { if (s % 4 === 0) INSTR.cloche(ctx, d, t, c.cloches, acc[(s >> 2) % 3] + 24); INSTR.grelot(ctx, d, t, c.cloches * (s % 2 ? 0.5 : 1)); }
  }
  // les couches voulues pour un moment (et l'intensité, Noël)
  function couches(M, i, noel) {
    const c = { nappe: 0, arpege: 0, basse: 0, rythme: 0, cloches: 0 };
    if (M === 'menu') { c.nappe = 1; c.arpege = 0.7; }
    else if (M === 'pause') { c.nappe = 0.8; c.arpege = 0.5; c.basse = 0.5; }
    else if (M === 'vague') { c.nappe = 0.5; c.basse = 0.6 + i * 0.4; c.rythme = Math.max(0, Math.min(1, (i - 0.15) * 1.4)); c.arpege = i > 0.5 ? 0.6 : 0.3; }
    else if (M === 'boss') { c.nappe = 0.6; c.basse = 1; c.rythme = 1; c.arpege = 0.4; }
    if (noel && M !== 'fin') c.cloches = M === 'menu' || M === 'pause' ? 0.9 : 0.4;
    return c;
  }
  // ─── la mise en route sur le contexte du jeu ───
  const E = { volume: 0.6, son: true, amb: true, M: 'menu', i: 0.3, arene: 'jardin', noel: false, k: 0, prochain: 0, bus: null, comp: null, ctx: null, baisse: 0, amb0: null, ambT: 0, jingles: 0 };
  function sortie() {
    const ctx = P && P.contexte; if (!ctx || ctx.state !== 'running') return null;
    if (E.ctx !== ctx) {
      E.ctx = ctx; E.comp = ctx.createDynamicsCompressor(); E.comp.threshold.value = -18; E.comp.ratio.value = 3; E.comp.connect(ctx.destination);
      E.bus = ctx.createGain(); E.bus.gain.value = 0; E.bus.connect(E.comp); E.prochain = ctx.currentTime + 0.1; E.amb0 = null;
    }
    return ctx;
  }
  const volumeVoulu = () => (E.son ? E.volume : 0) * (E.M === 'fin' ? 0 : 1) * (E.baisse > 0 ? 0.35 : 1);
  function maj(o) {
    if (o) { if (o.moment) { if (o.moment !== E.M) E.k = 0; E.M = o.moment; } if (o.intensite != null) E.i += (o.intensite - E.i) * 0.05; if (o.arene) E.arene = o.arene; if (o.noel != null) E.noel = !!o.noel; }
    const ctx = sortie(); if (!ctx) return;
    const now = ctx.currentTime; E.bus.gain.setTargetAtTime(volumeVoulu(), now, 0.25); if (E.baisse > 0 && now > E.baisse) E.baisse = 0;
    majAmbiance(ctx, now);
    if (E.M === 'fin' || !E.son || E.volume <= 0.001) { E.prochain = now + 0.1; return; }
    const G = GRILLES[E.M] || GRILLES.menu, sec = 60 / G.bpm / 4, tr = TRANSPOSE[Math.max(0, (typeof ZDONNEES !== 'undefined' ? ZDONNEES.ORDRE_ARENES.indexOf(E.arene) : 0)) % TRANSPOSE.length];
    if (E.prochain < now) E.prochain = now + 0.05; // (l'onglet a dormi : on repart d'ici, sans rattraper)
    const c = couches(E.M, E.i, E.noel);
    while (E.prochain < now + 0.18) { try { pas(ctx, E.bus, E.prochain, E.k, E.M, c, tr, E.i, sec); } catch (e) { /* une note refusée ne coupe pas la musique */ } E.k++; E.prochain += sec; }
  }
  // l'ambiance de l'arène : une boucle de bruit filtré qui respire, et de temps en temps un oiseau, un bip, une sirène…
  function majAmbiance(ctx, now) {
    const A = AMBIANCES[E.arene] || AMBIANCES.jardin, voulu = E.son && E.amb && E.M !== 'menu' ? A.g * (E.volume > 0 ? 1 : 0) * 1.6 : 0;
    if (!E.amb0 || E.amb0.arene !== E.arene) {
      if (E.amb0) { try { E.amb0.g.gain.setTargetAtTime(0, now, 0.3); const s = E.amb0.s; setTimeout(() => { try { s.stop(); } catch (e) { /* rien */ } }, 1500); } catch (e) { /* rien */ } }
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      s.buffer = bruit(ctx); s.loop = true; f.type = 'lowpass'; f.frequency.value = A.f; g.gain.value = 0; lfo.frequency.value = A.houle; lg.gain.value = A.f * 0.35; lfo.connect(lg); lg.connect(f.frequency);
      s.connect(f); f.connect(g); g.connect(E.comp); s.start(); lfo.start(); E.amb0 = { arene: E.arene, s, g };
    }
    E.amb0.g.gain.setTargetAtTime(voulu, now, 0.8);
    if (!voulu || now < E.ambT) return; E.ambT = now + 4 + Math.random() * 7;
    const nom = A.sons[Math.floor(Math.random() * A.sons.length)], d = E.comp, v = Math.min(1, E.volume * 1.4);
    if (nom === 'oiseau') for (let k = 0; k < 3; k++) osc(ctx, d, 'sine', 2600 + Math.random() * 900, 3600 + Math.random() * 600, now + k * 0.12, 0.08, 0.025 * v, 0.01);
    else if (nom === 'corbeau') for (let k = 0; k < 2; k++) { souffle(ctx, d, 'bandpass', 900, 4, now + k * 0.35, 0.22, 0.05 * v); osc(ctx, d, 'sawtooth', 420, 300, now + k * 0.35, 0.2, 0.012 * v, 0.02, 1200); }
    else if (nom === 'mouette') osc(ctx, d, 'triangle', 1400, 900, now, 0.5, 0.025 * v, 0.05);
    else if (nom === 'sirene') { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(600, now); for (let k = 1; k <= 4; k++) o.frequency.linearRampToValueAtTime(k % 2 ? 900 : 600, now + k * 0.7); env(g, now, 0.6, 3, 0.012 * v); o.connect(g); g.connect(d); o.start(now); o.stop(now + 3.1); }
    else if (nom === 'bip') for (let k = 0; k < 2; k++) osc(ctx, d, 'sine', 1320, 1320, now + k * 0.9, 0.09, 0.02 * v, 0.005);
    else if (nom === 'gronde') souffle(ctx, d, 'lowpass', 120, 1, now, 2.2, 0.12 * v);
  }
  // les jingles (par-dessus, le temps de quelques notes)
  const JINGLES = {
    vagueFinie: [[0, 72], [0.11, 76], [0.22, 79], [0.33, 84]], bossArrive: null, perdu: [[0, 69], [0.22, 65], [0.44, 62], [0.7, 57]], gagne: [[0, 72], [0.12, 76], [0.24, 79], [0.36, 84], [0.5, 88]],
  };
  function jingle(nom) {
    const ctx = sortie(); if (!ctx || !E.son || E.volume <= 0.001) return; const t = ctx.currentTime + 0.03, v = E.volume; E.jingles++;
    if (nom === 'bossArrive') { for (const m of [38, 45, 50]) osc(ctx, E.comp, 'sawtooth', hz(m), hz(m), t, 1.8, 0.09 * v, 0.25, 700); INSTR.grosse(ctx, E.comp, t, v); return; }
    const L = JINGLES[nom]; if (!L) return; for (const [dt, m] of L) { osc(ctx, E.comp, 'square', hz(m), hz(m), t + dt, 0.3, 0.05 * v, 0.004, 3000); osc(ctx, E.comp, 'triangle', hz(m - 12), hz(m - 12), t + dt, 0.35, 0.08 * v, 0.004); }
  }
  function baisser(duree) { const ctx = sortie(); if (ctx) E.baisse = ctx.currentTime + (duree || 0.5); }
  function regler(o) { if (!o) return; if (o.son != null) E.son = !!o.son; if (o.volume != null) E.volume = Math.max(0, Math.min(1, +o.volume || 0)); if (o.ambiance != null) E.amb = !!o.ambiance; }
  const etat = () => ({ moment: E.M, intensite: Math.round(E.i * 100) / 100, arene: E.arene, noel: E.noel, volume: E.volume, son: E.son, joue: !!(E.ctx && E.ctx.state === 'running' && E.son && E.volume > 0 && E.M !== 'fin'), notes: E.k, jingles: E.jingles });
  // pour les tests : quelques secondes d'un moment, rendues hors ligne (rien n'est joué), leur pic et leur niveau moyen
  async function rendre(M, secondes, o) {
    const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext); if (!OAC || !GRILLES[M]) return null;
    o = o || {}; const sr = 22050, oc = new OAC(1, Math.ceil(sr * (secondes || 3)), sr), bus = oc.createGain(); bus.gain.value = 0.6; bus.connect(oc.destination);
    const G = GRILLES[M], sec = 60 / G.bpm / 4, c = couches(M, o.intensite == null ? 0.8 : o.intensite, !!o.noel);
    for (let k = 0, t = 0.02; t < (secondes || 3); k++, t += sec) pas(oc, bus, t, k, M, c, o.transpose || 0, o.intensite == null ? 0.8 : o.intensite, sec);
    const d = (await oc.startRendering()).getChannelData(0); let pic = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pic) pic = v; s2 += v * v; }
    return o.donnees ? { pic, rms: Math.sqrt(s2 / d.length), donnees: Array.from(d), sr } : { pic, rms: Math.sqrt(s2 / d.length) };
  }
  return { maj, jingle, baisser, regler, etat, rendre, moment, intensite, couches, GRILLES, TRANSPOSE, AMBIANCES };
})();
if (typeof module === 'object' && module.exports) module.exports = ZMUSIQUE;
