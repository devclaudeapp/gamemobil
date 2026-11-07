/* DERNIER REMPART — les commandes. Le joystick flottant d'Opération Poncin (src-poncin/controles.js), réduit à ce qu'il faut ici :
   le doigt se pose n'importe où dans la zone de jeu (hors des boutons du HUD), la base du joystick naît sous lui, le pouce s'en écarte
   de RAYON pixels au plus ; zone morte, courbe un peu exponentielle (mêmes réglages que Poncin). Pointer Events suivis par pointerId,
   touch-action: none. Le tir est automatique (la simulation vise le zombie le plus proche) : seul le déplacement passe par ici.
   Clavier (event.code, donc ZQSD en AZERTY = WASD en QWERTY) et flèches ; 1 / 2 : l'arme (1 / 2 / 3 : l'atout, au passage d'un niveau) ; G ou E : la grenade ; Maj ou C : la roulade ; F ou R : la capacité ; Échap ou P : pause ; Espace : lancer la vague.
   Manette (PS5, Xbox… : Gamepad API, disposition standard) : stick gauche ou croix pour courir ; A / Croix : la grenade (et, dans les
   menus, le bouton principal) ; X / Carré, Y / Triangle, B / Rond : l'arme 1 / 2 (les atouts 1 / 2 / 3 au passage d'un niveau) ;
   R1 / RB : lancer la vague ; L1 / LB ou R2 / RT : la roulade ; L2 / LT : la capacité ; Start / Options : pause.
   API : ZCONTROLES.init(zone, { surTouche(nom) }), lire() → { mx, mz } (vecteur du monde : x vers l'est, z vers le sud ; longueur ≤ 1),
         activer(bool), reinit(), get joystick() → { actif, x, y } (pour les tests). */
const ZCONTROLES = (() => {
  'use strict';
  const MORTE = 0.08, EXPO = 1.15; // comme Poncin
  let RAYON = 60, fixe = false; // réglables : la taille du joystick, et le joystick fixe (en bas à gauche) plutôt que flottant
  const TAILLES = { petit: 46, normal: 60, grand: 78 };
  function regler(o) {
    if (!o) return;
    if (o.taille && TAILLES[o.taille]) RAYON = TAILLES[o.taille];
    if (o.fixe != null) fixe = !!o.fixe;
    if (elJoy) { const k = RAYON / 60; elJoy.style.setProperty('--joy', k); placerFixe(); }
  }
  function placerFixe() { // le joystick fixe : sa base attend en bas à gauche
    if (!elJoy || !zone) return;
    if (fixe && actif) { const r = zone.getBoundingClientRect(); bx = r.left + 40 + RAYON * 1.4; by = r.bottom - 30 - RAYON * 1.4; elJoy.hidden = false; elJoy.classList.add('fixe'); elJoy.style.transform = `translate(${bx - r.left}px, ${by - r.top}px)`; if (joyId === -1) elPouce.style.transform = 'translate(-50%, -50%)'; }
    else { elJoy.classList.remove('fixe'); if (joyId === -1) elJoy.hidden = true; }
  }
  let zone = null, actif = false, rappel = null;
  let joyId = -1, bx = 0, by = 0, vx = 0, vy = 0;
  let elJoy = null, elBase = null, elPouce = null;
  const touches = { haut: false, bas: false, gauche: false, droite: false };
  const sortie = { mx: 0, mz: 0 };
  const CODES = { KeyW: 'haut', ArrowUp: 'haut', KeyS: 'bas', ArrowDown: 'bas', KeyA: 'gauche', ArrowLeft: 'gauche', KeyD: 'droite', ArrowRight: 'droite' };

  function init(z, o) {
    zone = z; rappel = (o && o.surTouche) || null;
    elJoy = document.createElement('div'); elJoy.className = 'joy'; elJoy.hidden = true;
    elBase = document.createElement('div'); elBase.className = 'joy-base';
    elPouce = document.createElement('div'); elPouce.className = 'joy-pouce';
    elJoy.appendChild(elBase); elJoy.appendChild(elPouce); zone.appendChild(elJoy);
    zone.style.touchAction = 'none';
    zone.addEventListener('pointerdown', bas, { passive: false });
    window.addEventListener('pointermove', bouge, { passive: false });
    window.addEventListener('pointerup', haut); window.addEventListener('pointercancel', haut);
    window.addEventListener('keydown', clavier); window.addEventListener('keyup', clavier);
    window.addEventListener('blur', reinit);
    window.addEventListener('gamepadconnected', () => { manette = true; if (!sondeEnCours) { sondeEnCours = true; requestAnimationFrame(sonder); } });
  }
  // ─── la manette : sondée à chaque image tant qu'il y en a une ───
  let manette = false, sondeEnCours = false, px = 0, pz = 0; const avant = [];
  const BOUTONS = { 0: 'grenade', 2: 'arme0', 3: 'arme1', 1: 'arme2', 5: 'passer', 9: 'pause', 4: 'roulade', 7: 'roulade', 6: 'capacite' };
  function sonder() {
    let pad = null;
    try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of l) if (g && g.connected) { pad = g; break; } } catch (e) { pad = null; }
    if (!pad) { px = pz = 0; manette = false; sondeEnCours = false; return; }
    const ax = pad.axes[0] || 0, az = pad.axes[1] || 0, m = Math.hypot(ax, az), b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    if (m > 0.18) { const v = Math.min(1, (m - 0.18) / 0.82); px = ax / m * v; pz = az / m * v; } else { px = 0; pz = 0; }
    const cx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), cz = (b(13) ? 1 : 0) - (b(12) ? 1 : 0); if (cx || cz) { const l = Math.hypot(cx, cz); px = cx / l; pz = cz / l; }
    for (const i in BOUTONS) { const d = b(+i); if (d && !avant[i] && rappel) { if (+i === 0) rappel('valider'); rappel(BOUTONS[i]); } avant[i] = d; }
    requestAnimationFrame(sonder);
  }
  function bas(e) {
    if (!actif || joyId !== -1) return;
    if (e.target !== zone && !(e.target.classList && e.target.classList.contains('joy-zone'))) return; // un bouton du HUD : pas pour nous
    e.preventDefault();
    const r = zone.getBoundingClientRect();
    if (fixe && e.clientX > r.left + r.width * 0.55) return; // fixe : la moitié gauche de l'écran seulement
    joyId = e.pointerId; vx = 0; vy = 0;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    if (fixe) { placerFixe(); bouge(e); return; }
    bx = e.clientX; by = e.clientY;
    elJoy.hidden = false; elJoy.style.transform = `translate(${bx - r.left}px, ${by - r.top}px)`; elPouce.style.transform = 'translate(-50%, -50%)';
  }
  function bouge(e) {
    if (e.pointerId !== joyId) return;
    e.preventDefault();
    let dx = e.clientX - bx, dy = e.clientY - by; const l = Math.hypot(dx, dy);
    // la base suit le doigt quand il va trop loin (comme Poncin) : on ne « perd » jamais le joystick
    if (l > RAYON * 1.6 && !fixe) { const k = (l - RAYON * 1.6) / l; bx += dx * k; by += dy * k; dx = e.clientX - bx; dy = e.clientY - by; const r = zone.getBoundingClientRect(); elJoy.style.transform = `translate(${bx - r.left}px, ${by - r.top}px)`; }
    const m = Math.min(1, Math.hypot(dx, dy) / RAYON), a = Math.atan2(dy, dx);
    const v = m < MORTE ? 0 : Math.pow((m - MORTE) / (1 - MORTE), EXPO);
    vx = Math.cos(a) * v; vy = Math.sin(a) * v;
    elPouce.style.transform = `translate(calc(-50% + ${Math.cos(a) * m * RAYON}px), calc(-50% + ${Math.sin(a) * m * RAYON}px))`;
  }
  function haut(e) { if (e.pointerId !== joyId) return; joyId = -1; vx = 0; vy = 0; if (elJoy) { elJoy.hidden = !fixe || !actif; elPouce.style.transform = 'translate(-50%, -50%)'; } }
  function clavier(e) {
    const t = CODES[e.code], enBas = e.type === 'keydown';
    if (t) { touches[t] = enBas; if (actif) e.preventDefault(); return; }
    if (!enBas || e.repeat || !rappel) return;
    if (e.code === 'Digit1' || e.code === 'Numpad1') rappel('arme0');
    else if (e.code === 'Digit2' || e.code === 'Numpad2') rappel('arme1');
    else if (e.code === 'Digit3' || e.code === 'Numpad3') rappel('arme2');
    else if (e.code === 'KeyG' || e.code === 'KeyE') rappel('grenade');
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') rappel('roulade');
    else if (e.code === 'KeyF' || e.code === 'KeyR') rappel('capacite');
    else if (e.code === 'Escape' || e.code === 'KeyP') rappel('pause');
    else if (e.code === 'Space') { rappel('passer'); if (actif) e.preventDefault(); }
  }
  function lire() {
    let mx = vx, mz = vy;
    if (manette && (px || pz)) { mx = px; mz = pz; }
    const kx = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0), kz = (touches.bas ? 1 : 0) - (touches.haut ? 1 : 0);
    if (kx || kz) { const l = Math.hypot(kx, kz); mx = kx / l; mz = kz / l; }
    sortie.mx = actif ? mx : 0; sortie.mz = actif ? mz : 0; return sortie;
  }
  function reinit() { joyId = -1; vx = 0; vy = 0; for (const k in touches) touches[k] = false; if (elJoy) elJoy.hidden = true; placerFixe(); }
  function activer(oui) { actif = !!oui; if (!actif) reinit(); else placerFixe(); }
  return { init, lire, activer, reinit, sonder, regler, get manette() { return manette; }, get joystick() { return { actif: joyId !== -1, x: vx, y: vy }; } };
})();
