/* OPÉRATION PONCIN — les commandes : au doigt (joystick flottant à gauche, glisser à droite pour viser, bouton Tir qui vise aussi
   quand on le glisse, Saut, Recharge, Accroupi, emplacements d'armes), au clavier (par event.code : ZQSD en AZERTY = WASD en QWERTY)
   et à la souris (pointer lock). Pointer Events suivis par pointerId, touch-action: none. PCONTROLES.lire() rend toujours le même
   objet d'entrée (aucune allocation par image) et remet les variations de visée à zéro. Le mode gaucher inverse les côtés. */
const PCONTROLES = (() => {
  'use strict';
  const DEG = Math.PI / 180, RAYON = 60, MORTE = 0.08, K_DOIGT = 0.22 * DEG, EXPO = 1.15, K_SOURIS = 0.0022;
  const entree = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null };
  const R = { sensibilite: 1, inverserY: false, gaucher: false, tirAuto: true };
  const ARMES = ['rafale', 'pompe', 'precision'];
  let racine = null, actif = false, tactile = false, actions = {}, W = 1, H = 1;
  // les doigts : un rôle par pointerId
  const roles = new Map(); // pointerId → { role: 'joy' | 'vise' | 'tir' | 'bouton', x, y }
  const pool = []; const prendre = () => pool.pop() || { role: '', x: 0, y: 0, cmd: null };
  let joyId = -1, joyBx = 0, joyBy = 0, joyVx = 0, joyVy = 0, tirDoigt = 0;
  let accYaw = 0, accPitch = 0, sautL = false, rechargeL = false, armeL = null, accroupiBascule = false;
  // clavier et souris
  const touches = { avant: false, arriere: false, gauche: false, droite: false, accroupi: false };
  let tirSouris = false, moiArmes = null, moiArme = 'rafale';
  // les éléments
  let elJoy, elJoyBase, elJoyBouton, elBoutons, elTir, elSaut, elAccroupi, elRecharge, elAnneau, elAide, elArmes = [], vuAccroupi = null, vuArme = '', vuPossede = -1, vuMun = [-2, -2, -2], vuRech = -1;

  const ICONES = {
    tir: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 20h22l4-4h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4-3H22l-3 11a2 2 0 0 1-2 1.5h-5a2 2 0 0 1-2-2.5l2.5-10H8a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><circle cx="38" cy="22" r="3" fill="#FF6B8B"/><path d="M14 18v-5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v5" fill="#FFC84A" stroke="#2B2A4C" stroke-width="3"/></svg>',
    saut: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 9l12 13h-7v11H19V22h-7z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M14 39h20" stroke="#2B2A4C" stroke-width="4" stroke-linecap="round"/></svg>',
    accroupi: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="12" r="5.5" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><path d="M17 22h13l3 9h-6l-3 7h-6l3-9h-6z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M11 41h26" stroke="#2B2A4C" stroke-width="4" stroke-linecap="round"/></svg>',
    recharge: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M35 17a13 13 0 1 0 2 12" fill="none" stroke="#2B2A4C" stroke-width="5" stroke-linecap="round"/><path d="M35 17a13 13 0 1 0 2 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M38 8v11H27z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/></svg>',
    rafale: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M6 14h34l5-5h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9l-4-3H26l-3 11a2 2 0 0 1-2 1.5h-6a2 2 0 0 1-2-2.5l2.5-10H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z" fill="#FF6B8B" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><rect x="16" y="6" width="14" height="8" rx="3" fill="#FFC84A" stroke="#2B2A4C" stroke-width="3"/></svg>',
    pompe: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M4 15h46a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H24l-4 10a2 2 0 0 1-2 1.3h-6a2 2 0 0 1-1.8-2.8L14 25H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" fill="#5FD3A4" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><rect x="30" y="24" width="18" height="7" rx="3" fill="#FFC84A" stroke="#2B2A4C" stroke-width="3"/><circle cx="57" cy="20" r="3" fill="#2B2A4C"/></svg>',
    precision: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M2 19h50l6-3h3v8h-3l-6-3H26l-5 12a2 2 0 0 1-2 1.3h-5a2 2 0 0 1-1.8-2.8L16 23H4a2 2 0 0 1-2-2z" fill="#B8A6FF" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><rect x="22" y="7" width="20" height="8" rx="4" fill="#7FB3FF" stroke="#2B2A4C" stroke-width="3"/><path d="M28 15v4M36 15v4" stroke="#2B2A4C" stroke-width="3"/></svg>',
  };

  // ─── construction ───
  function init(r, o) {
    racine = r; o = o || {}; tactile = !!o.tactile; actions = o.actions || {};
    if (!racine) return;
    racine.classList.add('pc');
    racine.innerHTML = `<div class="pc-joy" aria-hidden="true"><div class="pc-joy-base"></div><div class="pc-joy-bouton"></div></div>
      <div class="pc-boutons">
        <button type="button" class="pc-btn pc-tir" data-cmd="tir" aria-label="Tirer">${ICONES.tir}</button>
        <button type="button" class="pc-btn pc-saut" data-cmd="saut" aria-label="Sauter">${ICONES.saut}</button>
        <button type="button" class="pc-btn pc-accroupi" data-cmd="accroupi" aria-label="S’accroupir" aria-pressed="false">${ICONES.accroupi}</button>
        <button type="button" class="pc-btn pc-recharge" data-cmd="recharge" aria-label="Recharger">${ICONES.recharge}<svg class="pc-anneau" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" pathLength="100"/></svg></button>
        <div class="pc-armes">${ARMES.map((a, i) => `<button type="button" class="pc-arme" data-cmd="arme" data-arme="${a}" aria-label="Arme ${i + 1}">${ICONES[a]}<b>${i + 1}</b><span></span></button>`).join('')}</div>
      </div>
      <div class="pc-aide"><b>Clique pour viser à la souris</b><small>ZQSD ou WASD : bouger · Espace : sauter · C : s’accroupir · R : recharger · 1 2 3 : armes · Tab : scores · Échap : pause</small></div>`;
    elJoy = racine.querySelector('.pc-joy'); elJoyBase = racine.querySelector('.pc-joy-base'); elJoyBouton = racine.querySelector('.pc-joy-bouton');
    elBoutons = racine.querySelector('.pc-boutons'); elTir = racine.querySelector('.pc-tir'); elSaut = racine.querySelector('.pc-saut');
    elAccroupi = racine.querySelector('.pc-accroupi'); elRecharge = racine.querySelector('.pc-recharge'); elAnneau = racine.querySelector('.pc-anneau circle');
    elArmes = Array.from(racine.querySelectorAll('.pc-arme')).map((el) => ({ el, mun: el.querySelector('span'), id: el.dataset.arme }));
    racine.addEventListener('pointerdown', bas, { passive: false });
    racine.addEventListener('pointermove', bouge, { passive: false });
    racine.addEventListener('pointerup', haut); racine.addEventListener('pointercancel', haut); racine.addEventListener('lostpointercapture', haut);
    racine.addEventListener('contextmenu', (e) => e.preventDefault());
    racine.addEventListener('touchstart', (e) => { if (actif) e.preventDefault(); }, { passive: false }); // pas de zoom ni de défilement sous les pouces
    window.addEventListener('keydown', clavierBas); window.addEventListener('keyup', clavierHaut);
    window.addEventListener('mousemove', souris);
    window.addEventListener('blur', lacher); document.addEventListener('visibilitychange', () => { if (document.hidden) lacher(); });
    document.addEventListener('pointerlockchange', () => { racine.classList.toggle('verrou', verrouille()); if (!verrouille() && actif && actions.verrouPerdu) actions.verrouPerdu(); });
    taille(); regler(o.reglages); modeTactile(tactile);
  }
  function taille() { if (!racine) return; W = racine.clientWidth || window.innerWidth; H = racine.clientHeight || window.innerHeight; }
  function regler(o) {
    if (!o) return;
    if (o.sensibilite != null) R.sensibilite = Math.max(0.2, Math.min(3, +o.sensibilite || 1));
    if (o.inverserY != null) R.inverserY = !!o.inverserY;
    if (o.tirAuto != null) R.tirAuto = !!o.tirAuto;
    if (o.gaucher != null) { R.gaucher = !!o.gaucher; if (racine) racine.classList.toggle('gaucher', R.gaucher); }
  }
  function modeTactile(oui) { tactile = !!oui; if (racine) racine.classList.toggle('tactile', tactile); document.documentElement.classList.toggle('tactile', tactile); }
  function activer(oui) { actif = !!oui; if (!actif) { lacher(); if (verrouille()) try { document.exitPointerLock(); } catch (e) { /* rien */ } } if (racine) racine.classList.toggle('actif', actif); }
  const verrouille = () => !!racine && document.pointerLockElement === racine;
  function verrouiller() { if (!racine || tactile || verrouille() || !racine.requestPointerLock) return; try { const p = racine.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refusé */ } }

  // ─── doigts et souris ───
  const coteJoy = (x) => (R.gaucher ? x > W * 0.55 : x < W * 0.45); // la moitié du joystick
  function bas(e) {
    if (!actif) return;
    const cible = e.target.closest ? e.target.closest('[data-cmd]') : null;
    if (e.pointerType === 'mouse') { // souris : le premier clic verrouille le pointeur, puis le bouton gauche tire
      if (!verrouille()) { verrouiller(); e.preventDefault(); return; }
      if (e.button === 0) tirSouris = true; e.preventDefault(); return;
    }
    if (!tactile && e.pointerType === 'touch') modeTactile(true);
    e.preventDefault();
    if (roles.has(e.pointerId)) return;
    const d = prendre(); d.x = e.clientX; d.y = e.clientY; d.cmd = null;
    if (cible) {
      const cmd = cible.dataset.cmd;
      if (cmd === 'tir') { d.role = 'tir'; tirDoigt++; elTir.classList.add('appui'); }
      else {
        d.role = 'bouton'; d.cmd = cible; cible.classList.add('appui');
        if (cmd === 'saut') sautL = true;
        else if (cmd === 'recharge') rechargeL = true;
        else if (cmd === 'accroupi') accroupiBascule = !accroupiBascule;
        else if (cmd === 'arme') { if (!cible.classList.contains('absente')) armeL = cible.dataset.arme; }
      }
    } else if (joyId < 0 && coteJoy(e.clientX)) { // le joystick apparaît sous le pouce, un peu écarté des bords (geste retour de Safari)
      d.role = 'joy'; joyId = e.pointerId; joyBx = e.clientX; joyBy = e.clientY; joyVx = 0; joyVy = 0; // le centre est là où le pouce s'est posé
      placerJoy(); elJoy.classList.add('vivant');
    } else d.role = 'vise';
    roles.set(e.pointerId, d);
    try { racine.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
  }
  function viser(dx, dy) { // un glissé de (dx, dy) px : ≈ 0,22°/px, courbe d^1,15 (les petits gestes restent fins)
    const m = Math.sqrt(dx * dx + dy * dy); if (m <= 0) return;
    const k = K_DOIGT * R.sensibilite * Math.pow(m, EXPO - 1);
    accYaw -= dx * k; accPitch -= dy * k * (R.inverserY ? -1 : 1);
  }
  function bouge(e) {
    if (!actif) return;
    if (e.pointerType === 'mouse') return; // la souris passe par mousemove (movementX/Y en pointer lock)
    const d = roles.get(e.pointerId); if (!d) return;
    e.preventDefault();
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
    if (d.role === 'joy') {
      let vx = e.clientX - joyBx, vy = e.clientY - joyBy; const l = Math.sqrt(vx * vx + vy * vy);
      if (l > RAYON) { joyBx += vx * (1 - RAYON / l); joyBy += vy * (1 - RAYON / l); vx *= RAYON / l; vy *= RAYON / l; } // la base suit le pouce qui dépasse
      joyVx = vx / RAYON; joyVy = vy / RAYON; placerJoy();
    } else if (d.role === 'vise' || d.role === 'tir') viser(dx, dy);
  }
  function haut(e) {
    if (e.pointerType === 'mouse') { if (e.button === 0 || e.type !== 'pointerup') tirSouris = false; return; }
    const d = roles.get(e.pointerId); if (!d) return;
    roles.delete(e.pointerId);
    if (d.role === 'joy') { joyId = -1; joyVx = 0; joyVy = 0; elJoy.classList.remove('vivant'); placerJoy(); }
    else if (d.role === 'tir') { tirDoigt = Math.max(0, tirDoigt - 1); if (!tirDoigt) elTir.classList.remove('appui'); }
    else if (d.role === 'bouton' && d.cmd) d.cmd.classList.remove('appui');
    d.cmd = null; pool.push(d);
  }
  function placerJoy() { // le dessin seul est tenu loin des bords (geste retour de Safari) ; la mesure reste relative au pouce
    if (joyId < 0) { elJoyBase.style.transform = ''; elJoyBouton.style.transform = ''; return; }
    const bx = Math.max(RAYON + 6, Math.min(W - RAYON - 6, joyBx)), by = Math.max(RAYON + 6, Math.min(H - RAYON - 6, joyBy));
    elJoyBase.style.transform = `translate3d(${bx - RAYON}px, ${by - RAYON}px, 0)`;
    elJoyBouton.style.transform = `translate3d(${bx + joyVx * RAYON - 26}px, ${by + joyVy * RAYON - 26}px, 0)`;
  }
  function souris(e) {
    if (!actif || !verrouille()) return;
    if (tactile) modeTactile(false);
    const k = K_SOURIS * R.sensibilite;
    accYaw -= (e.movementX || 0) * k; accPitch -= (e.movementY || 0) * k * (R.inverserY ? -1 : 1);
  }
  function lacher() { // tout relâcher (fenêtre quittée, menu) : jamais de doigt ou de touche coincés
    roles.forEach((d) => { if (d.cmd) d.cmd.classList.remove('appui'); d.cmd = null; pool.push(d); }); roles.clear();
    joyId = -1; joyVx = 0; joyVy = 0; tirDoigt = 0; tirSouris = false;
    if (elJoy) { elJoy.classList.remove('vivant'); placerJoy(); elTir.classList.remove('appui'); }
    touches.avant = touches.arriere = touches.gauche = touches.droite = touches.accroupi = false;
    accYaw = 0; accPitch = 0; sautL = false; rechargeL = false; armeL = null;
  }

  // ─── clavier ───
  const DIRS = { KeyW: 'avant', ArrowUp: 'avant', KeyS: 'arriere', ArrowDown: 'arriere', KeyA: 'gauche', ArrowLeft: 'gauche', KeyD: 'droite', ArrowRight: 'droite' };
  const champ = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  function clavierBas(e) {
    if (champ(e)) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (actif && actions.pause) { e.preventDefault(); actions.pause(); } return; }
    if (!actif) return;
    if (tactile && !e.repeat) modeTactile(false);
    const dir = DIRS[e.code];
    if (dir) { touches[dir] = true; e.preventDefault(); return; }
    switch (e.code) {
      case 'Space': if (!e.repeat) sautL = true; e.preventDefault(); break;
      case 'KeyR': if (!e.repeat) rechargeL = true; break;
      case 'KeyC': if (!e.repeat) accroupiBascule = !accroupiBascule; break;
      case 'ControlLeft': case 'ControlRight': touches.accroupi = true; e.preventDefault(); break;
      case 'Digit1': case 'Numpad1': armeL = 'rafale'; break;
      case 'Digit2': case 'Numpad2': armeL = 'pompe'; break;
      case 'Digit3': case 'Numpad3': armeL = 'precision'; break;
      case 'Tab': e.preventDefault(); if (!e.repeat && actions.scores) actions.scores(true); break;
    }
  }
  function clavierHaut(e) {
    const dir = DIRS[e.code]; if (dir) { touches[dir] = false; return; }
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') touches.accroupi = false;
    else if (e.code === 'Tab' && actions.scores) actions.scores(false);
  }
  function molette(e) { if (!actif || !verrouille() || !moiArmes) return; const i = Math.max(0, moiArmes.indexOf(moiArme)), n = moiArmes.length; if (n > 1) armeL = moiArmes[(i + (e.deltaY > 0 ? 1 : n - 1)) % n]; }
  window.addEventListener('wheel', molette, { passive: true });

  // ─── lecture, une fois par image ───
  function lire() {
    if (!actif) { entree.avant = 0; entree.cote = 0; entree.dyaw = 0; entree.dpitch = 0; entree.tir = false; entree.saut = false; entree.recharge = false; entree.arme = null; entree.accroupi = false; accYaw = accPitch = 0; return entree; }
    let vx = joyVx, vy = joyVy; const l = Math.sqrt(vx * vx + vy * vy);
    if (l < MORTE) { vx = 0; vy = 0; } else { const k = Math.min(1, (l - MORTE) / (1 - MORTE)) / l; vx *= k; vy *= k; } // zone morte de 8 %, puis toute la course
    const kbA = (touches.avant ? 1 : 0) - (touches.arriere ? 1 : 0), kbC = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0);
    let av = -vy + kbA, co = vx + kbC; const n = Math.sqrt(av * av + co * co); if (n > 1) { av /= n; co /= n; }
    entree.avant = av; entree.cote = co;
    entree.dyaw = accYaw; entree.dpitch = accPitch; accYaw = 0; accPitch = 0;
    entree.tir = tirDoigt > 0 || tirSouris;
    entree.saut = sautL; sautL = false;
    entree.recharge = rechargeL; rechargeL = false;
    entree.arme = armeL; armeL = null;
    entree.accroupi = accroupiBascule || touches.accroupi;
    return entree;
  }
  function reinit() { lacher(); accroupiBascule = false; vuAccroupi = null; vuArme = ''; vuPossede = -1; vuRech = -1; vuMun[0] = vuMun[1] = vuMun[2] = -2; }

  // ─── l'état affiché sur les boutons : armes possédées, arme en main, munitions, anneau de recharge, accroupi ───
  function maj(jeu, moi) {
    if (!racine || !moi) return;
    moiArmes = moi.armes; moiArme = moi.arme;
    const acc = !!(accroupiBascule || moi.accroupi);
    if (acc !== vuAccroupi) { vuAccroupi = acc; elAccroupi.classList.toggle('on', acc); elAccroupi.setAttribute('aria-pressed', acc ? 'true' : 'false'); }
    let possede = 0; // les armes possédées en bits (sans construire de chaîne à chaque image)
    for (let i = 0; i < elArmes.length; i++) if (moi.armes ? moi.armes.indexOf(elArmes[i].id) >= 0 : i === 0) possede |= 1 << i;
    if (possede !== vuPossede || moi.arme !== vuArme) {
      vuPossede = possede; vuArme = moi.arme;
      for (let i = 0; i < elArmes.length; i++) { const a = elArmes[i]; a.el.classList.toggle('absente', !(possede & (1 << i))); a.el.classList.toggle('choisie', a.id === moi.arme); }
    }
    for (let i = 0; i < elArmes.length; i++) {
      const a = elArmes[i], m = moi.munitions && moi.munitions[a.id], v = m == null ? -1 : m;
      if (v !== vuMun[i]) { vuMun[i] = v; a.mun.textContent = v < 0 ? '' : String(v); }
    }
    let p = 0; // la recharge en cours, de 0 à 1
    if (jeu && moi.rechargeJusqua > jeu.temps && typeof PREGLES !== 'undefined') { const d = PREGLES.arme(moi.arme).recharge; p = 1 - (moi.rechargeJusqua - jeu.temps) / d; }
    const q = Math.round(Math.max(0, Math.min(1, p)) * 100);
    if (q !== vuRech) { vuRech = q; elAnneau.style.strokeDashoffset = String(100 - q); elRecharge.classList.toggle('charge', q > 0 && q < 100); }
  }

  return { init, lire, regler, activer, taille, reinit, maj, modeTactile, verrouiller, lacher,
    get reglages() { return R; }, get tactile() { return tactile; }, get actif() { return actif; }, get verrouille() { return verrouille(); } };
})();
