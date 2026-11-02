/* DERNIER REMPART — les commandes. Le joystick flottant d'Opération Poncin (src-poncin/controles.js), réduit à ce qu'il faut ici :
   le doigt se pose n'importe où dans la zone de jeu (hors des boutons du HUD), la base du joystick naît sous lui, le pouce s'en écarte
   de RAYON pixels au plus ; zone morte, courbe un peu exponentielle (mêmes réglages que Poncin). Pointer Events suivis par pointerId,
   touch-action: none. Le tir est automatique (la simulation vise le zombie le plus proche) : seul le déplacement passe par ici.
   Clavier (event.code, donc ZQSD en AZERTY = WASD en QWERTY) et flèches ; 1 / 2 : l'arme ; Échap ou P : pause ; Espace : lancer la vague.
   API : ZCONTROLES.init(zone, { surTouche(nom) }), lire() → { mx, mz } (vecteur du monde : x vers l'est, z vers le sud ; longueur ≤ 1),
         activer(bool), reinit(), get joystick() → { actif, x, y } (pour les tests). */
const ZCONTROLES = (() => {
  'use strict';
  const RAYON = 60, MORTE = 0.08, EXPO = 1.15; // comme Poncin
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
  }
  function bas(e) {
    if (!actif || joyId !== -1) return;
    if (e.target !== zone && !(e.target.classList && e.target.classList.contains('joy-zone'))) return; // un bouton du HUD : pas pour nous
    e.preventDefault();
    joyId = e.pointerId; bx = e.clientX; by = e.clientY; vx = 0; vy = 0;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    const r = zone.getBoundingClientRect();
    elJoy.hidden = false; elJoy.style.transform = `translate(${bx - r.left}px, ${by - r.top}px)`; elPouce.style.transform = 'translate(-50%, -50%)';
  }
  function bouge(e) {
    if (e.pointerId !== joyId) return;
    e.preventDefault();
    let dx = e.clientX - bx, dy = e.clientY - by; const l = Math.hypot(dx, dy);
    // la base suit le doigt quand il va trop loin (comme Poncin) : on ne « perd » jamais le joystick
    if (l > RAYON * 1.6) { const k = (l - RAYON * 1.6) / l; bx += dx * k; by += dy * k; dx = e.clientX - bx; dy = e.clientY - by; const r = zone.getBoundingClientRect(); elJoy.style.transform = `translate(${bx - r.left}px, ${by - r.top}px)`; }
    const m = Math.min(1, Math.hypot(dx, dy) / RAYON), a = Math.atan2(dy, dx);
    const v = m < MORTE ? 0 : Math.pow((m - MORTE) / (1 - MORTE), EXPO);
    vx = Math.cos(a) * v; vy = Math.sin(a) * v;
    elPouce.style.transform = `translate(calc(-50% + ${Math.cos(a) * m * RAYON}px), calc(-50% + ${Math.sin(a) * m * RAYON}px))`;
  }
  function haut(e) { if (e.pointerId !== joyId) return; joyId = -1; vx = 0; vy = 0; if (elJoy) elJoy.hidden = true; }
  function clavier(e) {
    const t = CODES[e.code], enBas = e.type === 'keydown';
    if (t) { touches[t] = enBas; if (actif) e.preventDefault(); return; }
    if (!enBas || e.repeat || !rappel) return;
    if (e.code === 'Digit1' || e.code === 'Numpad1') rappel('arme0');
    else if (e.code === 'Digit2' || e.code === 'Numpad2') rappel('arme1');
    else if (e.code === 'Escape' || e.code === 'KeyP') rappel('pause');
    else if (e.code === 'Space') { rappel('passer'); if (actif) e.preventDefault(); }
  }
  function lire() {
    let mx = vx, mz = vy;
    const kx = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0), kz = (touches.bas ? 1 : 0) - (touches.haut ? 1 : 0);
    if (kx || kz) { const l = Math.hypot(kx, kz); mx = kx / l; mz = kz / l; }
    sortie.mx = actif ? mx : 0; sortie.mz = actif ? mz : 0; return sortie;
  }
  function reinit() { joyId = -1; vx = 0; vy = 0; for (const k in touches) touches[k] = false; if (elJoy) elJoy.hidden = true; }
  function activer(oui) { actif = !!oui; if (!actif) reinit(); }
  return { init, lire, activer, reinit, get joystick() { return { actif: joyId !== -1, x: vx, y: vy }; } };
})();
