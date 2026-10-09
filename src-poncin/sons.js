/* OPÉRATION PONCIN — les sons, tous synthétisés en Web Audio (aucun fichier) comme ceux du Fournil : un blaster par arme (rafale,
   pompe, long-tir), le « splat » des impacts, le « ploc » d'une touche, le « ding » d'une tête, l'élimination, les pas, le saut,
   la recharge, le ramassage, le compte à rebours ; plus les vibrations. Le contexte audio naît au premier geste (debloquer) :
   iOS et Chrome refusent de jouer avant. Les tirs des autres s'atténuent avec la distance et se placent à gauche ou à droite. */
const PSONS = (() => {
  'use strict';
  let ctx = null, maitre = null, comp = null, bruit = null, actif = true, vibre = true, volume = 0.85, budget = 0, budgetT = 0, pasAlterne = 0;
  const dernier = Object.create(null); // nom → dernier départ (s, horloge audio) : pas de mitraille de sons identiques
  const ARME_SON = { rafale: 'rafale', pompe: 'pompe', precision: 'longTir' };

  // ─── mise en route ───
  function debloquer() { // à appeler dans un geste (pointerdown, keydown)
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      maitre = ctx.createGain(); maitre.gain.value = actif ? volume : 0; maitre.connect(comp); comp.connect(ctx.destination);
      const n = Math.floor(ctx.sampleRate * 0.6), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); // un bruit blanc partagé
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      bruit = b;
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); // iOS : un silence pour ouvrir la sortie
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }
  function regler(o) {
    if (!o) return;
    if (o.son != null) actif = !!o.son;
    if (o.vibre != null) vibre = !!o.vibre;
    if (o.volume != null) volume = Math.max(0, Math.min(1, +o.volume || 0));
    if (maitre && ctx) maitre.gain.setTargetAtTime(actif ? volume : 0, ctx.currentTime, 0.02);
  }
  function suspendre(oui) { if (!ctx) return; try { if (oui) ctx.suspend(); else ctx.resume(); } catch (e) { /* rien */ } }
  const pret = () => !!(ctx && actif && ctx.state === 'running');

  // ─── briques : oscillateur et bruit filtré, chacun avec son enveloppe ───
  function sortie(pan) { // le bus d'un son : panoramique éventuel, puis le maître
    if (!pan || !ctx.createStereoPanner) return maitre;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(maitre); return p;
  }
  function osc(type, f0, f1, t0, dur, vol, dest, attaque) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (attaque || 0.006)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function souffle(filtre, f0, f1, q, t0, dur, vol, dest, attaque) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = bruit; f.type = filtre; f.Q.value = q || 0.8; f.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (attaque || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.03);
  }

  // ─── le catalogue (v : volume 0..1, p : panoramique -1..1, h : hauteur relative) ───
  const SONS = {
    rafale(t, v, d, h) { souffle('bandpass', 2600 * h, 900 * h, 1.1, t, 0.07, 0.34 * v, d); osc('square', 560 * h, 190 * h, t, 0.065, 0.07 * v, d); osc('sine', 150, 60, t, 0.08, 0.28 * v, d); },
    pompe(t, v, d) {
      souffle('lowpass', 2200, 260, 0.7, t, 0.24, 0.62 * v, d); osc('sine', 96, 38, t, 0.2, 0.55 * v, d); osc('triangle', 300, 120, t, 0.08, 0.12 * v, d);
      souffle('bandpass', 3200, 2400, 3, t + 0.34, 0.045, 0.22 * v, d); souffle('bandpass', 2300, 1800, 3, t + 0.44, 0.05, 0.24 * v, d); // tchic-tchac de la pompe
    },
    longTir(t, v, d) {
      souffle('highpass', 3000, 1200, 0.7, t, 0.09, 0.42 * v, d); osc('sine', 1500, 260, t, 0.24, 0.16 * v, d); osc('sine', 80, 40, t, 0.16, 0.5 * v, d);
      souffle('bandpass', 3400, 500, 1.4, t + 0.03, 0.42, 0.1 * v, d, 0.05); // le sifflement de la bille de peinture
    },
    splat(t, v, d, h) { souffle('lowpass', 1500 * h, 180, 1.2, t, 0.17, 0.4 * v, d); osc('sine', 330 * h, 85, t, 0.11, 0.2 * v, d); },
    ploc(t, v, d) { osc('sine', 720, 1180, t, 0.07, 0.28 * v, d, 0.003); osc('triangle', 1450, 1450, t + 0.01, 0.05, 0.08 * v, d); },
    ding(t, v, d) { osc('sine', 1568, 1568, t, 0.4, 0.22 * v, d, 0.003); osc('sine', 2093, 2093, t + 0.005, 0.32, 0.14 * v, d, 0.003); osc('triangle', 3136, 3136, t, 0.12, 0.05 * v, d); },
    elimination(t, v, d) { [784, 988, 1175, 1568].forEach((f, i) => osc('triangle', f, f, t + i * 0.07, 0.16, 0.13 * v, d)); SONS.splat(t, v * 0.8, d, 0.8); },
    blesse(t, v, d) { osc('sine', 170, 80, t, 0.14, 0.42 * v, d); souffle('lowpass', 700, 200, 0.8, t, 0.1, 0.25 * v, d); },
    mort(t, v, d) { [392, 349, 311].forEach((f, i) => osc('triangle', f, f * 0.97, t + i * 0.2, i === 2 ? 0.55 : 0.18, 0.16 * v, d)); souffle('lowpass', 900, 150, 1, t, 0.3, 0.3 * v, d); },
    pas(t, v, d, h) { souffle('lowpass', 420 * h, 160, 0.9, t, 0.06, 0.16 * v, d); osc('sine', 95 * h, 55, t, 0.05, 0.1 * v, d); },
    saut(t, v, d) { osc('triangle', 300, 640, t, 0.15, 0.13 * v, d); souffle('bandpass', 900, 1600, 1, t, 0.08, 0.06 * v, d); },
    recharge(t, v, d, h, duree) {
      const fin = Math.max(0.45, (duree || 1.6) - 0.2);
      souffle('highpass', 3400, 2800, 0.9, t, 0.035, 0.22 * v, d); osc('square', 900, 700, t, 0.03, 0.03 * v, d); // le chargeur sort
      souffle('bandpass', 1300, 800, 2, t + fin * 0.45, 0.12, 0.16 * v, d, 0.03); // le nouveau glisse
      souffle('highpass', 2600, 2000, 0.9, t + fin, 0.04, 0.26 * v, d); osc('square', 620, 480, t + fin, 0.04, 0.04 * v, d); // clac
    },
    ramasse(t, v, d) { [660, 880, 1320].forEach((f, i) => osc('sine', f, f, t + i * 0.06, 0.14, 0.14 * v, d)); },
    soin(t, v, d) { [523, 659, 784, 1047].forEach((f, i) => osc('sine', f, f * 1.02, t + i * 0.05, 0.16, 0.12 * v, d)); },
    armure(t, v, d) { osc('triangle', 392, 784, t, 0.28, 0.14 * v, d); osc('sine', 1568, 2093, t + 0.12, 0.2, 0.06 * v, d); },
    compte(t, v, d) { osc('square', 660, 660, t, 0.13, 0.1 * v, d); osc('sine', 1320, 1320, t, 0.1, 0.04 * v, d); },
    go(t, v, d) { [880, 1109, 1319].forEach((f) => osc('triangle', f, f, t, 0.42, 0.09 * v, d)); osc('square', 440, 440, t, 0.2, 0.04 * v, d); },
    annonce(t, v, d) { [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + i * 0.08, i === 3 ? 0.3 : 0.12, 0.16 * v, d)); },
    reapparition(t, v, d) { osc('sine', 320, 960, t, 0.3, 0.12 * v, d); osc('triangle', 640, 1280, t + 0.08, 0.24, 0.05 * v, d); },
    victoire(t, v, d) { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + i * 0.11, i === 5 ? 0.5 : 0.14, 0.2 * v, d)); },
    defaite(t, v, d) { [523, 494, 466, 440].forEach((f, i) => osc('triangle', f, f, t + i * 0.16, i === 3 ? 0.45 : 0.15, 0.16 * v, d)); },
    vide(t, v, d) { souffle('highpass', 4000, 3000, 1, t, 0.03, 0.15 * v, d); },
    tap(t, v, d) { osc('triangle', 520, 520, t, 0.07, 0.07 * v, d); },
    ok(t, v, d) { osc('triangle', 520, 520, t, 0.08, 0.07 * v, d); osc('triangle', 780, 780, t + 0.07, 0.1, 0.07 * v, d); },
    retour(t, v, d) { osc('triangle', 600, 400, t, 0.1, 0.06 * v, d); },
  };
  const ECART = { rafale: 0.045, pompe: 0.12, longTir: 0.12, splat: 0.05, pas: 0.11, ploc: 0.03, blesse: 0.08, vide: 0.12 }; // intervalle mini entre deux mêmes sons
  function jouer(nom, v, p, h, extra) { // v : volume 0..1, p : panoramique, h : hauteur relative
    if (!pret() || !SONS[nom]) return;
    const t = ctx.currentTime;
    if (t - budgetT > 0.1) { budgetT = t; budget = 0; } if (++budget > 10) return; // au plus dix sons par dixième de seconde
    const e = ECART[nom]; if (e && dernier[nom] != null && t - dernier[nom] < e) return; dernier[nom] = t;
    try { SONS[nom](t + 0.005, v == null ? 1 : v, sortie(p || 0), h || 1, extra); } catch (err) { /* un nœud refusé ne coupe pas le jeu */ }
  }
  function vibrer(motif) { if (!vibre) return; try { if (navigator.vibrate) navigator.vibrate(motif); } catch (e) { /* pas de vibreur */ } }

  // ─── les événements d'une image de jeu ───
  let moi = null, jeuVu = null, _pan = 0;
  function trouver(jeu, id) { const es = jeu.entites; for (let i = 0; i < es.length; i++) if (es[i].id === id) return es[i]; return null; }
  function ecoute(x, z, portee) { // atténuation et panoramique d'un son placé en (x, z), vus depuis moi
    if (!moi) return 1;
    const dx = x - moi.x, dz = z - moi.z, dist = Math.sqrt(dx * dx + dz * dz); if (dist > portee) return 0;
    const k = 1 - dist / portee; _pan = dist > 0.5 ? (dx * Math.cos(moi.yaw) - dz * Math.sin(moi.yaw)) / dist : 0; return k * k;
  }
  const vusTir = new Set();
  function evenements(evs, jeu, idMoi) {
    if (!evs || !evs.length || !jeu) return;
    jeuVu = jeu; moi = trouver(jeu, idMoi); // retrouvée à chaque fois : rien ne casse si le jeu remplace l'objet
    vusTir.clear(); let splats = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.t) {
        case 'tir': {
          if (vusTir.has(e.id)) break; vusTir.add(e.id); // la pompe tire huit plombs : un seul son
          const nom = ARME_SON[e.arme] || 'rafale';
          if (e.id === idMoi) { jouer(nom, 0.9, 0, 1); if (e.arme === 'precision') vibrer(14); else if (e.arme === 'pompe') vibrer(20); }
          else if (e.o) { const v = ecoute(e.o[0], e.o[2], 90); if (v > 0.02) jouer(nom, 0.55 * v, _pan, 0.92); }
          if (e.impact && splats < 2) { const v = e.id === idMoi ? 0.55 : ecoute(e.impact.x, e.impact.z, 35); if (v > 0.04) { splats++; jouer('splat', 0.5 * v, e.id === idMoi ? 0 : _pan, 0.85 + Math.random() * 0.3); } }
          break;
        }
        case 'touche':
          if (e.de === idMoi && e.a !== idMoi) jouer(e.tete ? 'ding' : 'ploc', 0.9);
          else if (e.a === idMoi) { jouer('blesse', 0.8); vibrer(e.degats >= 40 ? 45 : 22); }
          break;
        case 'mort':
          if (e.par === idMoi && e.a !== idMoi) { jouer('elimination', 1); vibrer([15, 30, 15]); }
          else if (e.a === idMoi) { jouer('mort', 0.9); vibrer([70, 40, 90]); }
          break;
        case 'reapparition': if (e.id === idMoi) jouer('reapparition', 0.8); break;
        case 'ramasse': if (e.id === idMoi) { const o = e.objet, type = typeof o === 'string' ? o : o && (o.objet || o.type); jouer(type === 'soin' ? 'soin' : type === 'armure' ? 'armure' : 'ramasse', 0.9); vibrer(12); } break;
        case 'recharge': if (e.id === idMoi) { const a = moi && typeof PREGLES !== 'undefined' ? PREGLES.arme(moi.arme) : null; jouer('recharge', 0.85, 0, 1, a ? a.recharge : 1.6); } break;
        case 'saut': if (e.id === idMoi) jouer('saut', 0.7); break;
        case 'pas': if (e.id === idMoi) { pasAlterne ^= 1; jouer('pas', 0.55, 0, pasAlterne ? 1 : 0.85); } else if (moi) { const v = trouver(jeu, e.id); if (v) { const k = ecoute(v.x, v.z, 14); if (k > 0.05) jouer('pas', 0.4 * k, _pan, 0.8); } } break;
        case 'annonce': jouer('annonce', 0.8); break;
        case 'fin': break; // l'écran de fin joue victoire ou défaite
      }
    }
  }
  // pour les tests : rend un son hors ligne et mesure son pic et son niveau moyen (aucun effet sur le contexte du jeu)
  async function mesurer(nom, duree) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC || !SONS[nom]) return null;
    const sr = 22050, oc = new OAC(1, Math.ceil(sr * (duree || 1.2)), sr), avant = [ctx, maitre, bruit];
    try {
      ctx = oc; maitre = oc.createGain(); maitre.connect(oc.destination);
      const n = Math.floor(sr * 0.6), b = oc.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; bruit = b;
      SONS[nom](0.01, 1, maitre, 1, 1.6);
    } finally { ctx = avant[0]; maitre = avant[1]; bruit = avant[2]; }
    const d = (await oc.startRendering()).getChannelData(0); let pic = 0, s2 = 0, fin = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pic) pic = v; s2 += v * v; if (v > 0.003) fin = i; }
    return { pic, rms: Math.sqrt(s2 / d.length), duree: fin / sr };
  }
  function compte(n) { jouer(n > 0 ? 'compte' : 'go', 1); if (n <= 0) vibrer(30); }
  function ui(nom) { jouer(nom || 'tap', 1); }
  return { debloquer, regler, suspendre, jouer, vibrer, evenements, compte, ui, mesurer, noms: Object.keys(SONS), get pret() { return pret(); }, get contexte() { return ctx; } };
})();
