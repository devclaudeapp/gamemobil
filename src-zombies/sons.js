/* DERNIER REMPART — les sons. Les coups de feu, impacts, ramassages, achats, gong et fanfare viennent tels quels d'Opération Poncin
   (src-poncin/sons.js, PSONS : tout synthétisé en Web Audio, aucun fichier) ; ce module ajoute ce qui manque aux zombies, synthétisé de
   même sur le contexte audio de PSONS : le grognement (dents de scie filtrées, vibrato lent), l'éclaboussure, l'explosion, le crachat,
   le marteau qui monte une défense, le bois qui casse. ZSONS.evenements(evs, jeu, idMoi) traduit les événements d'un pas de simulation.
   Les sons lointains s'atténuent et se placent à gauche ou à droite, depuis le survivant. */
const ZSONS = (() => {
  'use strict';
  const P = typeof PSONS !== 'undefined' ? PSONS : null;
  let actif = true, bus = null, busCtx = null, grogneT = 0;
  const CLASSE = { pistolet: 'pistolet', mitraillette: 'mitraillette', pompe: 'pompe', fusil: 'fusil', sniper: 'sniper' };
  function sortie() {
    const ctx = P && P.contexte; if (!ctx || ctx.state !== 'running' || !actif) return null;
    if (busCtx !== ctx) { bus = ctx.createGain(); bus.gain.value = 0.8; bus.connect(ctx.destination); busCtx = ctx; }
    return ctx;
  }
  function env(ctx, g, t0, att, dur, vol) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
  function pan(ctx, p) { if (!p || !ctx.createStereoPanner) return bus; const n = ctx.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); n.connect(bus); return n; }
  let bruitB = null;
  function bruit(ctx) { if (!bruitB || bruitB.sampleRate !== ctx.sampleRate) { const n = ctx.sampleRate | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; bruitB = b; } return bruitB; }
  function souffle(ctx, dest, type, f0, f1, q, t0, dur, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = bruit(ctx);
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(ctx, g, t0, 0.005, dur, vol); s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  function osc(ctx, dest, type, f0, f1, t0, dur, vol, att) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(ctx, g, t0, att || 0.01, dur, vol); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05); return o;
  }
  const SONS = {
    grogne(ctx, d, t, v, h) { // un grognement : dents de scie graves, filtre passe-bas, vibrato lent
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      const f0 = (70 + Math.random() * 40) * h, dur = 0.6 + Math.random() * 0.5;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.78, t + dur);
      lfo.frequency.value = 7 + Math.random() * 5; lg.gain.value = f0 * 0.08; lfo.connect(lg); lg.connect(o.frequency);
      f.type = 'lowpass'; f.frequency.value = 520 * h; f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(d); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    splat(ctx, d, t, v) { souffle(ctx, d, 'lowpass', 1800, 220, 1.2, t, 0.18, 0.5 * v); osc(ctx, d, 'sine', 180, 60, t, 0.12, 0.35 * v); },
    boum(ctx, d, t, v) { souffle(ctx, d, 'lowpass', 2400, 90, 0.8, t, 0.9, 0.9 * v); osc(ctx, d, 'sine', 110, 32, t, 0.6, 0.9 * v, 0.004); souffle(ctx, d, 'bandpass', 500, 160, 0.7, t + 0.05, 1.3, 0.25 * v); },
    crachat(ctx, d, t, v) { souffle(ctx, d, 'bandpass', 900, 2600, 3, t, 0.16, 0.35 * v); osc(ctx, d, 'square', 300, 90, t, 0.1, 0.06 * v); },
    marteau(ctx, d, t, v) { for (let k = 0; k < 3; k++) { const u = t + k * 0.11; souffle(ctx, d, 'bandpass', 2600, 1800, 6, u, 0.05, 0.5 * v); osc(ctx, d, 'triangle', 820 - k * 60, 600, u, 0.08, 0.22 * v, 0.002); } },
    casse(ctx, d, t, v) { souffle(ctx, d, 'bandpass', 700, 300, 1.5, t, 0.35, 0.6 * v); for (let k = 0; k < 4; k++) souffle(ctx, d, 'highpass', 1500, 900, 2, t + 0.04 + k * 0.05, 0.05, 0.25 * v); },
    vague(ctx, d, t, v) { // la corne : deux notes graves et longues
      for (const [f, u] of [[98, 0], [147, 0.32]]) { const o = osc(ctx, d, 'sawtooth', f, f * 0.98, t + u, 0.9, 0.12 * v, 0.08); void o; osc(ctx, d, 'sine', f * 2, f * 2, t + u, 0.9, 0.06 * v, 0.08); }
    },
    serie(ctx, d, t, v, h) { for (let k = 0; k < 3; k++) osc(ctx, d, 'triangle', 660 * h * Math.pow(1.26, k), 660 * h * Math.pow(1.26, k), t + k * 0.06, 0.12, 0.12 * v, 0.004); },
    // les nouvelles armes
    flamme(ctx, d, t, v) { souffle(ctx, d, 'lowpass', 900, 500, 0.7, t, 0.16, 0.32 * v); souffle(ctx, d, 'bandpass', 2400, 1400, 1.5, t, 0.08, 0.08 * v); },
    cryo(ctx, d, t, v) { souffle(ctx, d, 'highpass', 3500, 5000, 0.8, t, 0.14, 0.18 * v); osc(ctx, d, 'sine', 2400, 1900, t, 0.08, 0.03 * v); },
    tesla(ctx, d, t, v) { for (let k = 0; k < 3; k++) souffle(ctx, d, 'bandpass', 3000 + Math.random() * 3000, 1500, 4, t + k * 0.025, 0.05, 0.35 * v); osc(ctx, d, 'sawtooth', 120, 60, t, 0.18, 0.12 * v); },
    roquette(ctx, d, t, v) { souffle(ctx, d, 'lowpass', 1600, 300, 0.8, t, 0.45, 0.5 * v); osc(ctx, d, 'triangle', 220, 90, t, 0.25, 0.15 * v); },
    scie(ctx, d, t, v) { const o = osc(ctx, d, 'sawtooth', 900, 1500, t, 0.35, 0.07 * v); void o; souffle(ctx, d, 'bandpass', 2500, 4000, 6, t, 0.3, 0.12 * v); },
    laser(ctx, d, t, v) { osc(ctx, d, 'square', 1800, 300, t, 0.12, 0.08 * v, 0.003); osc(ctx, d, 'sine', 900, 200, t, 0.14, 0.12 * v, 0.003); },
    arc(ctx, d, t, v) { souffle(ctx, d, 'bandpass', 600, 1800, 3, t, 0.09, 0.4 * v); osc(ctx, d, 'triangle', 300, 120, t, 0.06, 0.12 * v, 0.002); },
    acide(ctx, d, t, v) { souffle(ctx, d, 'lowpass', 700, 200, 1.5, t, 0.2, 0.4 * v); osc(ctx, d, 'sine', 140, 70, t, 0.18, 0.2 * v); },
    piece(ctx, d, t, v, h) { osc(ctx, d, 'square', 1320 * h, 1320 * h, t, 0.05, 0.05 * v, 0.002); osc(ctx, d, 'square', 1760 * h, 1760 * h, t + 0.045, 0.08, 0.05 * v, 0.002); },
  };
  function jouer(nom, v, p, h) {
    const ctx = sortie(); if (!ctx || !SONS[nom]) return;
    try { SONS[nom](ctx, pan(ctx, p), ctx.currentTime + 0.01, v == null ? 1 : v, h || 1); } catch (e) { /* un nœud refusé ne coupe pas le jeu */ }
  }
  const estBoss = (t) => typeof ZDONNEES !== 'undefined' && !!(ZDONNEES.ZOMBIES[t] && ZDONNEES.ZOMBIES[t].boss);
  let moi = null;
  function ecoute(x, z, portee) { if (!moi) return [1, 0]; const dx = x - moi.x, dz = z - moi.z, d = Math.hypot(dx, dz); if (d > portee) return [0, 0]; const k = 1 - d / portee; return [k * k, Math.max(-1, Math.min(1, dx / 12))]; }
  let piecesT = 0, toucheT = 0, critT = 0, souffleT = 0;
  function evenements(evs, jeu, idMoi, dt) {
    moi = jeu.joueurs.find((j) => j.id === idMoi) || null;
    // un grognement de temps en temps, plus souvent quand ils sont nombreux et proches
    grogneT -= dt || 0;
    if (grogneT <= 0 && jeu.zombies.length && moi) {
      const z = jeu.zombies[Math.floor(Math.random() * jeu.zombies.length)], [k, p] = ecoute(z.x, z.z, 22);
      if (k > 0.03) jouer('grogne', 0.4 + 0.6 * k, p, estBoss(z.type) ? 0.55 : z.type === 'coureur' ? 1.35 : z.type === 'costaud' ? 0.75 : 1);
      grogneT = 0.6 + Math.random() * 2.5 / Math.sqrt(jeu.zombies.length);
    }
    if (!evs || !evs.length || !P) return;
    for (const e of evs) {
      switch (e.t) {
        case 'tir': {
          if (e.b) break; // une seule détonation pour les plombs d'un même coup
          const mien = e.de === idMoi, [k, p] = mien ? [1, 0] : ecoute(e.x, e.z, 30);
          if (k > 0.02) {
            if (CLASSE[e.arme]) P.jouer(CLASSE[e.arme], (mien ? 0.75 : 0.45) * k, p, e.cle === 'tourelle' ? 1.25 : 1, mien ? 0 : 0.3);
            else if (SONS[e.arme]) { const t = performance.now(); if (e.arme !== 'flamme' && e.arme !== 'cryo' || t - souffleT > 90) { souffleT = t; jouer(e.arme, (mien ? 0.9 : 0.5) * k, p); } }
            else P.jouer('pistolet', 0.5 * k, p);
          }
          if (mien) P.vibrer(e.arme === 'pompe' || e.arme === 'sniper' || e.arme === 'roquette' ? 18 : e.arme === 'flamme' || e.arme === 'cryo' ? 0 : 6);
          break;
        }
        case 'touche': { const t = performance.now(); if (e.crit && e.de === idMoi && t - critT > 120) { critT = t; P.jouer('ding', 0.55); } if (t - toucheT > 60) { toucheT = t; const [k, p] = ecoute(e.x, e.z, 20); if (k > 0.05) P.jouer('ploc', 0.35 * k, p); } break; }
        case 'mort': { const [k, p] = ecoute(e.x, e.z, 24); if (k > 0.03) { jouer('splat', 0.6 * k + 0.2, p); if (e.boss) jouer('boum', 0.8, p); } break; }
        case 'blesse': if (e.id === idMoi) { P.jouer('blesse', 0.8); P.vibrer(e.degats >= 20 ? 40 : 20); } break;
        case 'tombe': if (e.id === idMoi) { P.jouer('mort', 0.9); P.vibrer([70, 40, 90]); } break;
        case 'ramasse':
          if (e.id !== idMoi) break;
          if (e.quoi === 'ferraille') { const t = performance.now(); if (t - piecesT > 45) { piecesT = t; jouer('piece', 0.9, 0, 1 + Math.min(0.5, (e.valeur - 1) * 0.08)); } }
          else if (e.quoi === 'soin') P.jouer('soin', 0.9);
          else if (e.quoi === 'caisse') { P.jouer('munitions', 0.9); P.vibrer(20); }
          break;
        case 'arme': if (e.id === idMoi) P.jouer('changement', 0.7); break;
        case 'vide': if (e.id === idMoi) P.jouer('vide', 0.8); break;
        case 'construit': jouer('marteau', 0.9); P.jouer('achat', 0.5); break;
        case 'ameliore': if (e.id === idMoi) { P.jouer('achat', 0.9); P.vibrer(15); } break;
        case 'casse': { const [k, p] = ecoute(e.x, e.z, 30); jouer('casse', 0.4 + 0.6 * k, p); break; }
        case 'boum': { const [k, p] = ecoute(e.x, e.z, 40); jouer('boum', 0.35 + 0.65 * k, p); if (k > 0.5) P.vibrer(30); break; }
        case 'crachat': { const [k, p] = ecoute(e.x, e.z, 20); if (k > 0.05) jouer('crachat', 0.8 * k, p); break; }
        case 'mortier': { const [k, p] = ecoute(e.x, e.z, 30); P.jouer('pompe', 0.4 * k + 0.1, p, 0.6, 0.6); break; }
        case 'vague': jouer('vague', 1); P.jouer('manche', 0.7); P.vibrer([30, 50, 30]); break;
        case 'vagueFinie': P.jouer('mancheFin', 0.9); break;
        case 'serie': jouer('serie', 0.9, 0, 1 + (e.mult - 2) * 0.2); break;
        case 'fin': P.jouer('defaite', 1); break;
        case 'niveau': if (e.id === idMoi) { jouer('serie', 1, 0, 1.3); P.jouer('mancheFin', 0.6); P.vibrer([20, 40, 20]); } break;
        case 'grenade': if (e.id === idMoi) P.jouer('saut', 0.6, 0, 0.8); break;
        case 'releve': P.jouer('releve', 0.9); if (e.id === idMoi) P.vibrer([20, 40, 20]); break;
      }
    }
  }
  function regler(o) { if (o && o.son != null) actif = !!o.son; if (P) P.regler(o); }
  return { jouer, evenements, regler, noms: Object.keys(SONS) };
})();
