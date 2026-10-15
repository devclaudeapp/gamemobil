/* OPÉRATION PONCIN — les sons, tous synthétisés en Web Audio (aucun fichier) comme ceux du Fournil. Les vraies armes : un coup de feu
   par classe (fusil, mitraillette, pompe, sniper, pistolet), fait de trois couches — le claquement (bruit très bref, aigu), le corps
   (bruit filtré qui s'éteint vite + un « boum » grave qui descend) et la queue (l'écho du bourg, longue et sourde) ; de loin, le
   claquement s'efface et la queue domine. Puis la mécanique : la pompe qu'on arme, la culasse du sniper, la recharge par classe (chargeur
   qui sort, qui entre, culasse ; cartouches une à une à la pompe), le changement d'arme, la mise en joue, les douilles qui tintent au sol.
   Les impacts selon la matière (mur, métal qui sonne et ricoche, sol, bois, corps) ; le « toc » d'une touche, le « ding » d'une tête,
   l'élimination ; les pas selon la posture (marche, course, accroupi, rampé), la glissade, le saut, la réception ; le ramassage, le
   compte à rebours ; plus les vibrations. Le contexte audio naît au premier geste (debloquer) : iOS et Chrome refusent de jouer avant.
   Les sons des autres s'atténuent avec la distance et se placent à gauche ou à droite.
   L'ambiance (salon : heure et météo) : la pluie (un bruit filtré en boucle, le crépitement aigu et la rumeur grave, des gouttes et, de
   loin en loin, un tonnerre lointain), le vent de nuit (un souffle grave dont le filtre et le volume ondulent lentement, un hibou de temps
   en temps), un souffle plus léger dans le brouillard. Ces boucles ne jouent que pendant la partie : prises dans jeu.reglages (sinon
   jeu.options, sinon le dernier PSONS.ambiance({ heure, meteo })) à chaque appel d'evenements, elles s'éteignent en ~1 s quand on ne
   l'appelle plus (menus, fin). Les manches (« dernier debout ») : un gong au début d'une manche, une petite fanfare à sa fin, un « toc »
   sourd quand un joueur est éliminé de la manche (événements 'manche' et 'elimine' de l'Arène).
   L'arme d'un événement : PREGLES.arme(id).classe (le contrat), sinon PAVATARS.armes.classe(id) (le modèle), sinon 'fusil'. Les
   changements d'état du joueur (posture, arme en main, visée, déplacement accroupi ou couché) sont lus sur l'entité à chaque appel
   d'evenements (une fois par pas, même sans événement). */
const PSONS = (() => {
  'use strict';
  let ctx = null, maitre = null, comp = null, bruit = null, actif = true, vibre = true, volume = 0.85, budget = 0, budgetT = 0, pasAlterne = 0;
  const dernier = Object.create(null); // nom → dernier départ (s, horloge audio) : pas de mitraille de sons identiques
  const CLASSES = ['fusil', 'mitraillette', 'pompe', 'sniper', 'pistolet'];
  const ANCIENS = { rafale: 'fusil', carabine: 'fusil', arrosoir: 'mitraillette', arroseuse: 'mitraillette', pompe: 'pompe', precision: 'sniper', petoire: 'pistolet' };
  function classeDe(id) {
    try { if (typeof PREGLES !== 'undefined' && PREGLES.estArme && PREGLES.estArme(id)) { const c = PREGLES.arme(id).classe; if (CLASSES.indexOf(c) >= 0) return c; } } catch (e) { /* rien */ }
    try { if (typeof PAVATARS !== 'undefined' && PAVATARS && PAVATARS.armes) return PAVATARS.armes.classe(id); } catch (e) { /* rien */ }
    return ANCIENS[id] || 'fusil';
  }

  // ─── mise en route ───
  function debloquer() { // à appeler dans un geste (pointerdown, keydown)
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      maitre = ctx.createGain(); maitre.gain.value = actif ? volume : 0; maitre.connect(comp); comp.connect(ctx.destination);
      bruit = bruitBlanc(ctx);
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); // iOS : un silence pour ouvrir la sortie
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }
  function bruitBlanc(c) { const n = Math.floor(c.sampleRate * 1.6), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; } // partagé (1,6 s : les queues des coups de feu)
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
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * Math.max(0, bruit.duration - dur - 0.05)); s.stop(t0 + dur + 0.03);
  }
  const clic = (t, f, v, d) => { souffle('bandpass', f, f * 0.8, 4, t, 0.025, v, d, 0.001); osc('square', f * 0.3, f * 0.22, t, 0.02, v * 0.12, d, 0.001); }; // un petit déclic métallique

  // ─── les coups de feu : [claquement (durée, coupe-haut, volume), corps (coupe-bas début → fin, durée, volume), boum (Hz début → fin,
  // durée, volume), queue (coupe-bas, durée, volume)] ; loin ∈ [0, 1] : de loin, moins de claquement et de corps, plus de queue, plus sourd
  const COUP = {
    fusil: { c: [0.022, 2000, 0.55], b: [1900, 320, 0.15, 0.7], m: [115, 45, 0.13, 0.6], q: [900, 0.5, 0.17] },
    mitraillette: { c: [0.016, 2600, 0.45], b: [2300, 420, 0.1, 0.52], m: [140, 60, 0.085, 0.42], q: [1000, 0.32, 0.11] },
    pompe: { c: [0.032, 1300, 0.5], b: [1500, 200, 0.26, 0.72], m: [82, 30, 0.26, 0.78], q: [700, 0.95, 0.24] },
    sniper: { c: [0.03, 1800, 0.62], b: [2100, 240, 0.22, 0.78], m: [72, 28, 0.3, 0.8], q: [800, 1.35, 0.3] },
    pistolet: { c: [0.015, 2300, 0.5], b: [2700, 520, 0.085, 0.55], m: [165, 72, 0.075, 0.36], q: [1100, 0.26, 0.1] },
  };
  function coup(classe, t, v, d, loin) {
    const P = COUP[classe] || COUP.fusil, L = Math.max(0, Math.min(1, loin || 0)), sourd = 1 - L * 0.7;
    souffle('highpass', P.c[1], P.c[1] * 0.7, 0.7, t, P.c[0], P.c[2] * v * (1 - L * 0.85), d, 0.0015); // le claquement
    souffle('lowpass', P.b[0] * sourd, P.b[1], 0.8, t, P.b[2], P.b[3] * v * (1 - L * 0.5), d, 0.002); // le corps
    osc('sine', P.m[0], P.m[1], t, P.m[2], P.m[3] * v * (1 - L * 0.4), d, 0.003); // le boum
    souffle('lowpass', P.q[0] * sourd, P.q[0] * 0.35, 0.6, t + 0.02, P.q[1] * (1 + L * 0.6), P.q[2] * v * (1 + L * 1.2), d, 0.03); // l'écho du bourg
    if (classe === 'fusil' && L < 0.5) clic(t + 0.012, 3200, 0.06 * v, d); // la culasse qui revient
  }

  // ─── le catalogue (v : volume 0..1, d : la sortie, h : hauteur relative ou paramètre, x : un paramètre de plus) ───
  const SONS = {
    fusil(t, v, d, h, x) { coup('fusil', t, v, d, x); },
    mitraillette(t, v, d, h, x) { coup('mitraillette', t, v, d, x); },
    pompe(t, v, d, h, x) {
      coup('pompe', t, v, d, x);
      if (!(x > 0.5)) { souffle('bandpass', 2100, 1500, 3, t + 0.36, 0.06, 0.24 * v, d, 0.004); clic(t + 0.37, 2600, 0.16 * v, d); souffle('bandpass', 1700, 1300, 3, t + 0.5, 0.06, 0.26 * v, d, 0.004); clic(t + 0.52, 2200, 0.2 * v, d); } // tchic-tchac de la pompe
    },
    sniper(t, v, d, h, x) {
      coup('sniper', t, v, d, x);
      if (!(x > 0.5)) { clic(t + 0.55, 2400, 0.18 * v, d); souffle('bandpass', 1400, 900, 2.5, t + 0.6, 0.09, 0.14 * v, d, 0.01); clic(t + 0.74, 2000, 0.2 * v, d); } // la culasse : on l'ouvre, on la ferme
    },
    pistolet(t, v, d, h, x) { coup('pistolet', t, v, d, x); if (!(x > 0.5)) clic(t + 0.01, 3600, 0.07 * v, d); },
    // les impacts (h : la hauteur relative, pour varier)
    impactMur(t, v, d, h) { souffle('lowpass', 1600 * h, 300, 1, t, 0.09, 0.32 * v, d, 0.002); souffle('bandpass', 1200 * h, 700, 1.4, t + 0.02, 0.22, 0.14 * v, d, 0.02); osc('sine', 180 * h, 70, t, 0.06, 0.18 * v, d); }, // le choc, puis les gravillons
    impactMetal(t, v, d, h) {
      osc('sine', 2600 * h, 2450 * h, t, 0.22, 0.14 * v, d, 0.001); osc('triangle', 3900 * h, 3700 * h, t, 0.12, 0.05 * v, d, 0.001); souffle('highpass', 4000, 2500, 1, t, 0.03, 0.2 * v, d, 0.001); // « ting »
      if (h > 1.05) osc('sine', 3200, 900, t + 0.03, 0.32, 0.05 * v, d, 0.02); // parfois le ricochet qui siffle
    },
    impactSol(t, v, d, h) { souffle('lowpass', 900 * h, 160, 0.9, t, 0.12, 0.34 * v, d, 0.002); osc('sine', 120 * h, 50, t, 0.08, 0.2 * v, d); },
    impactBois(t, v, d, h) { souffle('bandpass', 900 * h, 500, 2, t, 0.08, 0.3 * v, d, 0.002); osc('triangle', 260 * h, 180, t, 0.07, 0.18 * v, d); },
    impactCorps(t, v, d) { souffle('lowpass', 500, 150, 0.8, t, 0.08, 0.3 * v, d, 0.003); osc('sine', 110, 60, t, 0.07, 0.22 * v, d); },
    ploc(t, v, d) { osc('triangle', 1700, 1500, t, 0.05, 0.16 * v, d, 0.002); souffle('highpass', 5000, 4000, 1, t, 0.03, 0.12 * v, d, 0.001); }, // le marqueur de touche : un « tic » sec
    ding(t, v, d) { osc('sine', 1568, 1568, t, 0.35, 0.2 * v, d, 0.003); osc('sine', 2093, 2093, t + 0.005, 0.28, 0.12 * v, d, 0.003); osc('triangle', 3136, 3136, t, 0.1, 0.05 * v, d); },
    elimination(t, v, d) { [784, 988, 1175, 1568].forEach((f, i) => osc('triangle', f, f, t + i * 0.07, 0.16, 0.12 * v, d)); },
    blesse(t, v, d) { osc('sine', 150, 70, t, 0.14, 0.42 * v, d); souffle('lowpass', 600, 180, 0.8, t, 0.1, 0.25 * v, d); },
    mort(t, v, d) { [392, 349, 311].forEach((f, i) => osc('triangle', f, f * 0.97, t + i * 0.2, i === 2 ? 0.55 : 0.18, 0.16 * v, d)); souffle('lowpass', 900, 150, 1, t, 0.3, 0.3 * v, d); },
    // les pas : h = hauteur ; marche, course (plus lourd, plus sec), accroupi (feutré), rampé (frottement de tissu et de gravier)
    pas(t, v, d, h) { souffle('lowpass', 420 * h, 160, 0.9, t, 0.06, 0.16 * v, d); osc('sine', 95 * h, 55, t, 0.05, 0.1 * v, d); },
    pasCourse(t, v, d, h) { souffle('lowpass', 650 * h, 180, 0.9, t, 0.07, 0.24 * v, d, 0.002); osc('sine', 85 * h, 45, t, 0.06, 0.16 * v, d); souffle('bandpass', 2600, 1800, 1.2, t + 0.01, 0.04, 0.04 * v, d); },
    pasAccroupi(t, v, d, h) { souffle('lowpass', 340 * h, 140, 0.8, t, 0.09, 0.11 * v, d, 0.02); },
    ramper(t, v, d, h) { souffle('bandpass', 900 * h, 500, 0.9, t, 0.32, 0.09 * v, d, 0.08); souffle('lowpass', 300, 150, 0.8, t + 0.1, 0.15, 0.06 * v, d, 0.03); },
    glissade(t, v, d) { souffle('bandpass', 1400, 380, 0.7, t, 0.75, 0.22 * v, d, 0.03); souffle('lowpass', 500, 160, 0.8, t, 0.6, 0.14 * v, d, 0.05); },
    saut(t, v, d) { souffle('lowpass', 700, 300, 0.8, t, 0.08, 0.12 * v, d); osc('sine', 120, 90, t, 0.06, 0.08 * v, d); },
    reception(t, v, d) { souffle('lowpass', 500, 120, 0.9, t, 0.12, 0.3 * v, d, 0.002); osc('sine', 75, 40, t, 0.1, 0.24 * v, d); },
    // la mécanique : h = la durée (s) de la recharge, x = la classe (index dans CLASSES)
    recharge(t, v, d, h, x) {
      const fin = Math.max(0.5, (h || 1.6) - 0.15), c = CLASSES[x | 0] || 'fusil';
      if (c === 'pompe') { const n = Math.max(2, Math.min(6, Math.round(fin / 0.4))); for (let i = 0; i < n; i++) { clic(t + 0.15 + i * fin / (n + 1), 1800 + (i % 2) * 300, 0.16 * v, d); souffle('bandpass', 900, 600, 2, t + 0.17 + i * fin / (n + 1), 0.06, 0.08 * v, d); } souffle('bandpass', 2000, 1400, 3, t + fin - 0.1, 0.06, 0.2 * v, d); clic(t + fin, 2300, 0.2 * v, d); return; }
      if (c === 'sniper') { clic(t + 0.05, 2400, 0.18 * v, d); souffle('bandpass', 1300, 900, 2.5, t + 0.1, 0.1, 0.12 * v, d, 0.01); clic(t + fin * 0.5, 1900, 0.16 * v, d); clic(t + fin - 0.12, 2000, 0.2 * v, d); clic(t + fin, 2500, 0.2 * v, d); return; }
      clic(t + 0.05, c === 'pistolet' ? 3000 : 2400, 0.16 * v, d); souffle('highpass', 3000, 2400, 0.9, t + 0.06, 0.04, 0.1 * v, d); // le chargeur sort
      souffle('bandpass', 1100, 800, 2, t + fin * 0.45, 0.12, 0.14 * v, d, 0.03); clic(t + fin * 0.58, 1700, 0.22 * v, d); // le nouveau entre
      if (c === 'pistolet') clic(t + fin, 2800, 0.24 * v, d); // la culasse revient
      else { souffle('bandpass', 2200, 1500, 2.5, t + fin - 0.14, 0.07, 0.16 * v, d, 0.005); clic(t + fin, 2600, 0.24 * v, d); } // on arme
    },
    changement(t, v, d) { souffle('bandpass', 700, 450, 0.8, t, 0.16, 0.1 * v, d, 0.03); clic(t + 0.14, 2200, 0.12 * v, d); }, // le tissu, puis l'arme en main
    visee(t, v, d) { souffle('bandpass', 900, 600, 0.9, t, 0.1, 0.08 * v, d, 0.02); clic(t + 0.07, 3200, 0.06 * v, d); },
    douille(t, v, d, h) { osc('sine', 4200 * h, 4000 * h, t, 0.06, 0.05 * v, d, 0.001); osc('sine', 5600 * h, 5400 * h, t + 0.09, 0.05, 0.035 * v, d, 0.001); osc('sine', 4700 * h, 4600 * h, t + 0.16, 0.04, 0.02 * v, d, 0.001); }, // tin-tin-tin sur les pavés
    cartouche(t, v, d) { souffle('bandpass', 700, 500, 2, t, 0.05, 0.08 * v, d); souffle('bandpass', 650, 450, 2, t + 0.11, 0.04, 0.05 * v, d); }, // la cartouche de la pompe : plastique, plus sourde
    ramasse(t, v, d) { clic(t, 2200, 0.15 * v, d); [660, 880].forEach((f, i) => osc('sine', f, f, t + 0.04 + i * 0.06, 0.12, 0.1 * v, d)); },
    munitions(t, v, d) { souffle('bandpass', 1500, 900, 1.5, t, 0.12, 0.12 * v, d, 0.01); clic(t + 0.08, 2000, 0.14 * v, d); clic(t + 0.16, 2400, 0.12 * v, d); },
    soin(t, v, d) { [523, 659, 784, 1047].forEach((f, i) => osc('sine', f, f * 1.02, t + i * 0.05, 0.16, 0.12 * v, d)); },
    armure(t, v, d) { osc('triangle', 392, 784, t, 0.28, 0.14 * v, d); osc('sine', 1568, 2093, t + 0.12, 0.2, 0.06 * v, d); },
    compte(t, v, d) { osc('square', 660, 660, t, 0.13, 0.1 * v, d); osc('sine', 1320, 1320, t, 0.1, 0.04 * v, d); },
    go(t, v, d) { [880, 1109, 1319].forEach((f) => osc('triangle', f, f, t, 0.42, 0.09 * v, d)); osc('square', 440, 440, t, 0.2, 0.04 * v, d); },
    annonce(t, v, d) { [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + i * 0.08, i === 3 ? 0.3 : 0.12, 0.16 * v, d)); },
    reapparition(t, v, d) { osc('sine', 320, 960, t, 0.3, 0.12 * v, d); osc('triangle', 640, 1280, t + 0.08, 0.24, 0.05 * v, d); },
    victoire(t, v, d) { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + i * 0.11, i === 5 ? 0.5 : 0.14, 0.2 * v, d)); },
    defaite(t, v, d) { [523, 494, 466, 440].forEach((f, i) => osc('triangle', f, f, t + i * 0.16, i === 3 ? 0.45 : 0.15, 0.16 * v, d)); },
    vide(t, v, d) { clic(t, 3400, 0.16 * v, d); },
    // l'ambiance et les manches
    goutte(t, v, d, h) { osc('sine', 1400 * h, 520 * h, t, 0.11, 0.07 * v, d, 0.002); souffle('bandpass', 3000 * h, 2000, 2, t, 0.02, 0.04 * v, d, 0.001); }, // une goutte tombée d'un toit
    tonnerre(t, v, d, h) { souffle('lowpass', 420, 60, 0.7, t, 2.6, 0.5 * v, d, 0.35); souffle('lowpass', 900 * h, 120, 0.8, t + 0.12, 0.9, 0.22 * v, d, 0.05); osc('sine', 48, 32, t + 0.05, 2.2, 0.25 * v, d, 0.4); }, // un roulement lointain
    hibou(t, v, d, h) { for (const [dt, f0, f1, du] of [[0, 520, 470, 0.32], [0.55, 560, 520, 0.18], [0.82, 540, 470, 0.5]]) { osc('sine', f0 * h, f1 * h, t + dt, du, 0.07 * v, d, 0.06); osc('triangle', f0 * h * 2, f1 * h * 2, t + dt, du * 0.8, 0.008 * v, d, 0.06); } }, // hou… hou-hou
    manche(t, v, d) { osc('sine', 196, 194, t, 1.6, 0.3 * v, d, 0.004); osc('sine', 392, 389, t, 1.2, 0.14 * v, d, 0.004); osc('triangle', 587, 583, t, 0.9, 0.06 * v, d, 0.004); [523, 659, 784].forEach((f, i) => osc('triangle', f, f, t + 0.35 + i * 0.09, 0.22, 0.11 * v, d)); }, // un gong, puis trois notes qui montent
    mancheFin(t, v, d) { [784, 659, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + i * 0.12, i === 3 ? 0.55 : 0.14, 0.17 * v, d)); osc('sine', 1568, 1568, t + 0.36, 0.5, 0.05 * v, d); souffle('highpass', 6000, 5000, 1, t + 0.36, 0.25, 0.04 * v, d, 0.01); }, // la manche est gagnée
    elimine(t, v, d) { osc('sine', 330, 180, t, 0.3, 0.2 * v, d, 0.004); osc('triangle', 165, 110, t + 0.02, 0.35, 0.08 * v, d); }, // éliminé de la manche : un « toc » sourd qui descend
    // l'Extraction : le coffre qui grince et s'ouvre, le butin (des pièces qui tintent, plus riches selon la rareté : h = 1 à 4), l'alarme des
    // sorties qui s'ouvrent (deux tons, trois fois), le tic de l'extraction (chaque seconde dans le cercle), l'extraction réussie, relever,
    // le sac qui tombe, et l'achat ou la vente au coffre personnel
    ouvrir(t, v, d) { souffle('bandpass', 700, 1100, 6, t, 0.25, 0.1 * v, d, 0.04); clic(t + 0.02, 1500, 0.08 * v, d); }, // on met la main au coffre
    coffre(t, v, d) { osc('sawtooth', 180, 320, t, 0.32, 0.05 * v, d, 0.05); souffle('bandpass', 500, 900, 5, t, 0.3, 0.12 * v, d, 0.05); souffle('lowpass', 400, 120, 0.8, t + 0.3, 0.12, 0.3 * v, d, 0.002); osc('sine', 110, 60, t + 0.3, 0.1, 0.22 * v, d); }, // le grincement, puis le couvercle qui retombe
    butin(t, v, d, h) { const n = 2 + Math.round(h || 1); for (let i = 0; i < n; i++) { const f = 1800 + ((i * 7) % 5) * 260 + (h || 1) * 120; osc('sine', f, f * 1.01, t + i * 0.06, 0.18, 0.07 * v, d, 0.002); osc('triangle', f * 2.4, f * 2.4, t + i * 0.06, 0.06, 0.02 * v, d, 0.001); }
      if (h >= 3) [784, 988, 1319].forEach((f, i) => osc('triangle', f, f, t + 0.25 + i * 0.08, 0.22, 0.1 * v, d)); }, // épique, légendaire : trois notes de plus
    alarme(t, v, d) { for (let i = 0; i < 3; i++) { osc('square', 660, 660, t + i * 0.5, 0.22, 0.05 * v, d, 0.01); osc('square', 880, 880, t + i * 0.5 + 0.24, 0.22, 0.05 * v, d, 0.01); osc('sine', 330, 330, t + i * 0.5, 0.46, 0.08 * v, d, 0.02); } },
    tic(t, v, d, h) { osc('sine', 1200 * (h || 1), 1180 * (h || 1), t, 0.07, 0.1 * v, d, 0.002); },
    extrait(t, v, d) { osc('sine', 300, 1200, t, 0.5, 0.12 * v, d, 0.02); [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, f, t + 0.3 + i * 0.09, i === 4 ? 0.6 : 0.16, 0.15 * v, d)); souffle('highpass', 5000, 3000, 1, t, 0.6, 0.05 * v, d, 0.2); },
    releve(t, v, d) { [392, 523, 659].forEach((f, i) => osc('triangle', f, f, t + i * 0.1, 0.18, 0.13 * v, d)); },
    sacTombe(t, v, d) { souffle('lowpass', 600, 140, 0.8, t, 0.18, 0.3 * v, d, 0.004); [1400, 1700, 1250].forEach((f, i) => osc('sine', f, f, t + 0.05 + i * 0.07, 0.08, 0.04 * v, d, 0.002)); },
    achat(t, v, d) { [1568, 2093].forEach((f, i) => osc('sine', f, f, t + i * 0.07, 0.2, 0.09 * v, d, 0.002)); [523, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + 0.12 + i * 0.07, 0.16, 0.1 * v, d)); },
    vente(t, v, d) { for (let i = 0; i < 4; i++) osc('sine', 2000 + i * 180, 2010 + i * 180, t + i * 0.05, 0.14, 0.07 * v, d, 0.002); },
    signal(t, v, d) { osc('sine', 1320, 1320, t, 0.12, 0.12 * v, d, 0.003); osc('sine', 1760, 1760, t + 0.09, 0.16, 0.1 * v, d, 0.003); }, // un « ping » d'équipe
    lampe(t, v, d) { clic(t, 2600, 0.14 * v, d); },
    largage(t, v, d) { osc('sawtooth', 110, 96, t, 2.2, 0.035 * v, d, 0.6); osc('sawtooth', 112, 98, t, 2.2, 0.03 * v, d, 0.6); souffle('lowpass', 300, 200, 0.7, t, 2.4, 0.18 * v, d, 0.7); }, // l'avion qui passe, au loin
    prime(t, v, d) { [988, 784, 988, 784].forEach((f, i) => osc('square', f, f, t + i * 0.13, 0.11, 0.045 * v, d, 0.005)); },
    cle(t, v, d) { [1047, 1319, 1568, 2093].forEach((f, i) => osc('triangle', f, f, t + i * 0.06, 0.2, 0.09 * v, d)); },
    refus(t, v, d) { osc('square', 220, 200, t, 0.09, 0.05 * v, d); },
    tap(t, v, d) { osc('triangle', 520, 520, t, 0.07, 0.07 * v, d); },
    ok(t, v, d) { osc('triangle', 520, 520, t, 0.08, 0.07 * v, d); osc('triangle', 780, 780, t + 0.07, 0.1, 0.07 * v, d); },
    retour(t, v, d) { osc('triangle', 600, 400, t, 0.1, 0.06 * v, d); },
  };
  // intervalle mini entre deux mêmes sons (s) ; une mitraillette à 14 coups/s passe (0,05 s)
  const ECART = { signal: 0.25, prime: 2, largage: 5, butin: 0.15, coffre: 0.3, ouvrir: 0.3, alarme: 3, tic: 0.5, extrait: 2, sacTombe: 0.5, goutte: 0.05, tonnerre: 8, hibou: 6, manche: 1, mancheFin: 1, elimine: 0.2, fusil: 0.05, mitraillette: 0.045, pistolet: 0.06, pompe: 0.15, sniper: 0.15, impactMur: 0.04, impactSol: 0.04, impactMetal: 0.05, impactBois: 0.05, impactCorps: 0.04, pas: 0.11, pasCourse: 0.1, pasAccroupi: 0.2, ramper: 0.3, ploc: 0.03, blesse: 0.08, vide: 0.12, douille: 0.07, cartouche: 0.2, glissade: 0.5, changement: 0.15, visee: 0.25 };
  function jouer(nom, v, p, h, extra, retard) { // v : volume 0..1, p : panoramique, h : hauteur relative, retard (s)
    if (!pret() || !SONS[nom]) return;
    const t = ctx.currentTime;
    if (t - budgetT > 0.1) { budgetT = t; budget = 0; } if (++budget > 12) return; // au plus douze sons par dixième de seconde
    const e = ECART[nom]; if (e && dernier[nom] != null && t - dernier[nom] < e) return; dernier[nom] = t;
    try { SONS[nom](t + 0.005 + (retard || 0), v == null ? 1 : v, sortie(p || 0), h || 1, extra); } catch (err) { /* un nœud refusé ne coupe pas le jeu */ }
  }
  function vibrer(motif) { if (!vibre) return; try { if (navigator.vibrate) navigator.vibrate(motif); } catch (e) { /* pas de vibreur */ } }

  // ─── l'ambiance : boucles de bruit filtré (pluie, vent), créées au premier besoin, puis gardées (volume à 0 hors partie) ───
  const AMB = { voulue: null, heure: 'jour', meteo: 'clair', pluie: null, vent: null, plan: -1, cible: { pluie: 0, vent: 0 }, prochain: { goutte: 0, tonnerre: 0, hibou: 0 }, long: null };
  const HEURES = ['jour', 'soir', 'nuit'], METEOS = ['clair', 'brouillard', 'pluie'];
  function bruitLong() { if (!AMB.long) { const n = Math.floor(ctx.sampleRate * 4.3), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let r = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; r = 0.97 * r + 0.03 * w; d[i] = w * 0.6 + r * 2.2; } AMB.long = b; } return AMB.long; } // blanc + un peu de rose : moins sec
  function boucle(nom) {
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = bruitLong(); src.loop = true; g.gain.value = 0; g.connect(maitre);
    const B = { src, g, nodes: [] };
    if (nom === 'pluie') { // le crépitement (aigu, large) et la rumeur (grave)
      const a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter(), c = ctx.createBiquadFilter(), gb = ctx.createGain(); a.type = 'highpass'; a.frequency.value = 900; b.type = 'lowpass'; b.frequency.value = 7000; c.type = 'lowpass'; c.frequency.value = 280; gb.gain.value = 0.7;
      src.connect(a); a.connect(b); b.connect(g); src.connect(c); c.connect(gb); gb.connect(g); B.nodes.push(a, b, c, gb);
    } else { // le vent : un souffle grave, filtre et volume qui ondulent lentement (deux oscillateurs très lents)
      const f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), pf = ctx.createGain(), lfo2 = ctx.createOscillator(), pv = ctx.createGain(), gv = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 1.6; lfo.frequency.value = 0.07; pf.gain.value = 170; lfo2.frequency.value = 0.11; pv.gain.value = 0.45; gv.gain.value = 0.7;
      lfo.connect(pf); pf.connect(f.frequency); lfo2.connect(pv); pv.connect(gv.gain); src.connect(f); f.connect(gv); gv.connect(g); lfo.start(); lfo2.start(); B.nodes.push(f, lfo, pf, lfo2, pv, gv);
    }
    src.start(0, Math.random() * 3); return B;
  }
  function ambiance(o) { // PSONS.ambiance({ heure, meteo }) : l'ambiance d'une partie dont le jeu ne porte pas de réglages ; null : aucune
    if (o === null) AMB.voulue = null; else if (o && typeof o === 'object') AMB.voulue = { heure: HEURES.includes(o.heure) ? o.heure : 'jour', meteo: METEOS.includes(o.meteo) ? o.meteo : 'clair' };
    return { heure: AMB.heure, meteo: AMB.meteo, pluie: AMB.cible.pluie, vent: AMB.cible.vent, boucles: !!(AMB.pluie || AMB.vent) };
  }
  function majAmbiance(jeu) { // à chaque appel d'evenements (une fois par pas) : on replanifie au plus quatre fois par seconde
    if (!pret()) return; const t = ctx.currentTime; if (t - AMB.plan < 0.25) return; AMB.plan = t;
    const r = jeu && (jeu.reglages || jeu.options), v = AMB.voulue;
    AMB.heure = r && HEURES.includes(r.heure) ? r.heure : v ? v.heure : 'jour'; AMB.meteo = r && METEOS.includes(r.meteo) ? r.meteo : v ? v.meteo : 'clair';
    AMB.cible.pluie = AMB.meteo === 'pluie' ? 0.17 : 0; AMB.cible.vent = AMB.heure === 'nuit' ? 0.08 : AMB.meteo === 'brouillard' ? 0.05 : AMB.meteo === 'pluie' ? 0.04 : 0;
    for (const nom of ['pluie', 'vent']) {
      const c = AMB.cible[nom]; if (!c && !AMB[nom]) continue; if (!AMB[nom]) { try { AMB[nom] = boucle(nom); } catch (e) { continue; } }
      const g = AMB[nom].g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(c, t, 0.5); g.setTargetAtTime(0, t + 0.8, 0.3); // sans nouvel appel, la boucle s'éteint
    }
    // de loin en loin : gouttes (pluie), tonnerre lointain (pluie), hibou (nuit claire)
    const P = AMB.prochain, alea = Math.random;
    if (AMB.meteo === 'pluie') { if (t > P.goutte) { P.goutte = t + 0.15 + alea() * 0.6; jouer('goutte', 0.5 + alea() * 0.4, (alea() - 0.5) * 1.6, 0.8 + alea() * 0.5); } if (t > P.tonnerre) { if (P.tonnerre) jouer('tonnerre', 0.6 + alea() * 0.3, (alea() - 0.5) * 1.2, 0.8 + alea() * 0.4); P.tonnerre = t + 25 + alea() * 35; } }
    if (AMB.heure === 'nuit' && AMB.meteo === 'clair' && t > P.hibou) { if (P.hibou) jouer('hibou', 0.7, (alea() - 0.5) * 1.6, 0.92 + alea() * 0.16); P.hibou = t + 30 + alea() * 40; }
  }

  // ─── les événements d'une image de jeu ───
  let moi = null, _pan = 0, _dist = 0;
  const SUIVI = { exK: -1, id: null, arme: null, posture: 'debout', vise: 0, x: 0, z: 0, d: 0, pasEv: -9, t: 0 };
  function trouver(jeu, id) { const es = jeu.entites; for (let i = 0; i < es.length; i++) if (es[i].id === id) return es[i]; return null; }
  function ecoute(x, z, portee) { // atténuation et panoramique d'un son placé en (x, z), vus depuis moi ; _dist : la distance
    if (!moi) { _dist = 0; _pan = 0; return 1; }
    const dx = x - moi.x, dz = z - moi.z, dist = Math.sqrt(dx * dx + dz * dz); _dist = dist; if (dist > portee) return 0;
    const k = 1 - dist / portee; _pan = dist > 0.5 ? (dx * Math.cos(moi.yaw) - dz * Math.sin(moi.yaw)) / dist : 0; return k * k;
  }
  const posture = (e) => { const p = e.vers && e.transition > 0 ? e.vers : e.posture; return p === 'accroupi' || p === 'glisse' || p === 'couche' ? p : e.couche ? 'couche' : e.glisse ? 'glisse' : e.accroupi ? 'accroupi' : 'debout'; };
  const IMPACT = { mur: 'impactMur', toit: 'impactMur', sol: 'impactSol', metal: 'impactMetal', bois: 'impactBois', corps: 'impactCorps' };
  function matiere(im) { // comme rendu.js : impact.materiau du contrat, sinon déduit de quoi / de
    const m = im.materiau || im.mat || im.matiere; if (im.de === 'arbre') return 'bois'; if (IMPACT[m]) return m;
    if (im.quoi === 'entite' || im.quoi === 'corps') return 'corps'; if (im.de === 'mobilier') return 'metal'; return im.quoi === 'sol' ? 'sol' : 'mur';
  }
  // l'état de mon entité, une fois par appel : arme changée, mise en joue, glissade, pas accroupi ou rampé (la simulation ne compte pas
  // ces pas-là : on les compte ici, sauf si des événements 'pas' arrivent pour moi)
  function suivre(jeu, idMoi) {
    if (!moi || moi.vivant === false) { SUIVI.id = null; return; }
    const S = SUIVI, t = ctx ? ctx.currentTime : 0, pos = posture(moi);
    if (S.id !== idMoi) { S.id = idMoi; S.arme = moi.arme; S.posture = pos; S.vise = +moi.vise || 0; S.x = +moi.x; S.z = +moi.z; S.d = 0; return; }
    if (moi.arme !== S.arme) { S.arme = moi.arme; jouer('changement', 0.7); }
    const ex = moi.extraction || moi.sortie, d0 = ex && typeof ex === 'object' ? +(ex.debut != null ? ex.debut : ex.depuis) : NaN; // Extraction : un tic par seconde dans le cercle, plus aigu à la fin
    if (d0 >= 0 && jeu.temps >= d0) { const k = Math.floor(jeu.temps - d0); if (k !== S.exK) { S.exK = k; if (k > 0) jouer('tic', 0.7, 0, k >= 5 ? 1.5 : 1); } } else S.exK = -1;
    const vs = +moi.vise || 0; if (vs > 0.15 && S.vise <= 0.15) jouer('visee', 0.6); S.vise = vs;
    if (pos === 'glisse' && S.posture !== 'glisse') jouer('glissade', 0.75);
    S.posture = pos;
    const dx = +moi.x - S.x, dz = +moi.z - S.z, d = Math.sqrt(dx * dx + dz * dz); S.x = +moi.x; S.z = +moi.z; if (!(d < 2)) return;
    if ((pos === 'accroupi' || pos === 'couche') && t - S.pasEv > 1) { S.d += d; const pas = pos === 'couche' ? 0.55 : 0.75; if (S.d >= pas) { S.d -= pas; pasAlterne ^= 1; jouer(pos === 'couche' ? 'ramper' : 'pasAccroupi', 0.6, 0, pasAlterne ? 1 : 0.85); } } else S.d = 0;
  }
  const vusTir = new Set();
  function evenements(evs, jeu, idMoi) {
    if (!jeu) return;
    moi = trouver(jeu, idMoi); // retrouvée à chaque fois : rien ne casse si le jeu remplace l'objet
    try { suivre(jeu, idMoi); } catch (e) { /* rien */ }
    try { majAmbiance(jeu); } catch (e) { /* rien */ }
    if (!evs || !evs.length) return;
    vusTir.clear(); let impacts = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.t) {
        case 'tir': {
          const classe = classeDe(e.arme);
          if (!vusTir.has(e.id)) { // la pompe tire huit plombs : un seul coup de feu
            vusTir.add(e.id);
            if (e.id === idMoi) { jouer(classe, 0.9, 0, 1, 0); vibrer(classe === 'sniper' || classe === 'pompe' ? 24 : classe === 'pistolet' ? 12 : 8); if (classe !== 'pompe') jouer('douille', 0.35, 0.3, 0.9 + Math.random() * 0.2, 0, classe === 'sniper' ? 0.95 : 0.4); else jouer('cartouche', 0.4, 0.3, 1, 0, 0.9); }
            else if (e.o) { const v = ecoute(e.o[0], e.o[2], classe === 'sniper' ? 220 : 160); if (v > 0.01) jouer(classe, 0.25 + 0.6 * v, _pan, 1, Math.min(1, _dist / 90)); }
          }
          const im = e.impact;
          if (im && impacts < 2 && (classe !== 'pompe' || impacts === 0)) { const v = ecoute(im.x, im.z, 35); if (v > 0.04) { impacts++; const m = matiere(im); if (m !== 'corps' || e.id !== idMoi) jouer(IMPACT[m], 0.5 * v, _pan, 0.85 + Math.random() * 0.3); } }
          break;
        }
        case 'touche':
          if (e.de === idMoi && e.a !== idMoi) { jouer(e.tete ? 'ding' : 'ploc', 0.9); jouer('impactCorps', 0.35); }
          else if (e.a === idMoi) { jouer('blesse', 0.8); vibrer(e.degats >= 40 ? 45 : 22); }
          break;
        case 'mort':
          if (e.par === idMoi && e.a !== idMoi) { jouer('elimination', 1); vibrer([15, 30, 15]); }
          else if (e.a === idMoi) { jouer('mort', 0.9); vibrer([70, 40, 90]); }
          break;
        case 'reapparition': if (e.id === idMoi) { jouer('reapparition', 0.8); SUIVI.id = null; } break;
        case 'ramasse': if (e.id === idMoi) { const o = e.objet, type = typeof o === 'string' ? o : o && (o.objet || o.type); jouer(type === 'soin' ? 'soin' : type === 'armure' ? 'armure' : type === 'munitions' ? 'munitions' : 'ramasse', 0.9); vibrer(12); } break;
        case 'recharge': if (e.id === idMoi) { const id = moi ? moi.arme : null, A = id && typeof PREGLES !== 'undefined' && PREGLES.estArme && PREGLES.estArme(id) ? PREGLES.arme(id) : null; jouer('recharge', 0.85, 0, A ? A.recharge : 1.6, CLASSES.indexOf(classeDe(id))); } break;
        case 'saut': if (e.id === idMoi) jouer('saut', 0.7); break;
        case 'refus': if (e.id === idMoi) jouer('refus', 0.6); break;
        case 'pas': {
          const ent = e.id === idMoi ? moi : trouver(jeu, e.id); if (!ent) break; const pos = posture(ent), nom = pos === 'couche' ? 'ramper' : pos === 'accroupi' ? 'pasAccroupi' : ent.course ? 'pasCourse' : 'pas';
          if (e.id === idMoi) { SUIVI.pasEv = ctx ? ctx.currentTime : 0; pasAlterne ^= 1; jouer(nom, 0.55, 0, pasAlterne ? 1 : 0.85); }
          else if (moi) { const k = ecoute(ent.x, ent.z, ent.course ? 20 : 14); if (k > 0.05) jouer(nom, 0.4 * k, _pan, 0.8); }
          break;
        }
        case 'annonce': jouer('annonce', 0.8); break;
        case 'manche': jouer(e.quoi === 'fin' || e.fin || e.vainqueur != null || e.gagnant != null ? 'mancheFin' : 'manche', 0.9); break; // « dernier debout » : début ou fin d'une manche
        case 'elimine': if (e.id !== idMoi && e.a !== idMoi) jouer('elimine', 0.6); break; // un autre est sorti de la manche (pour moi, 'mort' a déjà joué)
        case 'fin': break; // l'écran de fin joue victoire ou défaite
        // l'Extraction (événements du groupe des règles, lus avec tolérance)
        case 'ouverture': if (e.id === idMoi && e.quoi !== 'extraction' && /debut/.test(String(e.etat || 'debut'))) jouer('ouvrir', 0.8); else if (e.id === idMoi && /coupe/.test(String(e.etat || ''))) jouer('refus', 0.5); break;
        case 'coffre': if (e.id === idMoi || e.par === idMoi) { jouer('coffre', 0.9); vibrer(15); } else if (e.x != null) { const k = ecoute(+e.x, +e.z, 25); if (k > 0.05) jouer('coffre', 0.5 * k, _pan); } break;
        case 'butin': if (e.id === idMoi) { const l = Array.isArray(e.objets) ? e.objets : e.objet ? [e.objet] : []; let h = 1; for (const o of l) { const r = o && (o.rarete != null ? o.rarete : o.rang); const k = typeof r === 'number' ? r + 1 : { rare: 2, epique: 3, 'épique': 3, legendaire: 4, 'légendaire': 4 }[r] || 1; if (k > h) h = k; } jouer('butin', 0.85, 0, h, 0, 0.25); } break;
        case 'extraction': case 'extractions': case 'sorties': if (/ouv/.test(String(e.quoi || e.etat || 'ouvert'))) { jouer('alarme', 0.85); vibrer([30, 60, 30]); } break;
        case 'extrait': if (e.id === idMoi) { jouer('extrait', 1); vibrer([20, 40, 20, 40, 80]); } else jouer('releve', 0.5); break;
        case 'releve': if (e.id === idMoi || e.par === idMoi) jouer('releve', 0.9); break;
        case 'sac': if (e.quoi === 'pose' || e.quoi === 'tombe' || e.quoi === 'lache') { const k = e.x != null ? ecoute(+e.x, +e.z, 30) : 1; if (k > 0.05) jouer('sacTombe', 0.7 * k, _pan); } else if (e.par === idMoi || e.id === idMoi) jouer('ramasse', 0.9); break;
        case 'plein': if (e.id === idMoi) jouer('refus', 0.7); break;
        case 'signal': { const m = moi; if (!m || e.equipe == null || e.equipe === m.equipe) jouer('signal', e.de === idMoi ? 0.6 : 0.9); break; }
        case 'lampe': if (e.id === idMoi) jouer('lampe', 0.8); break;
        case 'largage': if (e.quoi === 'annonce') jouer('largage', 0.9); else if (e.quoi === 'tombe') { const k = e.x != null ? ecoute(+e.x, +e.z, 120) : 0.5; jouer('sacTombe', 0.4 + 0.6 * k, _pan); } break;
        case 'prime': if (e.quoi === 'revele' || e.quoi == null) { jouer('prime', e.id === idMoi ? 1 : 0.7); if (e.id === idMoi) vibrer([40, 60, 40]); } else if (e.quoi === 'gagnee' && e.id === idMoi) jouer('butin', 0.9, 0, 3); break;
        case 'cle': if (e.id === idMoi && e.quoi === 'trouvee') jouer('cle', 0.9); break;
        case 'verrou': if (e.id === idMoi) jouer('refus', 0.7); break;
      }
    }
  }
  // pour les tests : rend un son hors ligne et mesure son pic, son niveau moyen et sa durée (aucun effet sur le contexte du jeu) ;
  // h, x : les paramètres du son (la recharge : durée et classe ; un coup de feu : x = loin)
  async function mesurer(nom, duree, h, x) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC || !SONS[nom]) return null;
    const sr = 22050, oc = new OAC(1, Math.ceil(sr * (duree || 1.2)), sr), avant = [ctx, maitre, bruit];
    try {
      ctx = oc; maitre = oc.createGain(); maitre.connect(oc.destination); bruit = bruitBlanc(oc);
      SONS[nom](0.01, 1, maitre, h == null ? 1 : h, x == null ? 0 : x);
    } finally { ctx = avant[0]; maitre = avant[1]; bruit = avant[2]; }
    const d = (await oc.startRendering()).getChannelData(0); let pic = 0, s2 = 0, fin = 0, s2c = 0; const nc = Math.floor(sr * 0.05);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pic) pic = v; s2 += v * v; if (i < nc + 220) s2c += v * v; if (v > 0.003) fin = i; }
    return { pic, rms: Math.sqrt(s2 / d.length), attaque: Math.sqrt(s2c / (nc + 220)), duree: fin / sr };
  }
  function compte(n) { jouer(n > 0 ? 'compte' : 'go', 1); if (n <= 0) vibrer(30); }
  function ui(nom) { jouer(nom || 'tap', 1); }
  return { debloquer, regler, suspendre, jouer, vibrer, evenements, compte, ui, mesurer, ambiance, classe: classeDe, CLASSES, noms: Object.keys(SONS), get pret() { return pret(); }, get contexte() { return ctx; } };
})();
