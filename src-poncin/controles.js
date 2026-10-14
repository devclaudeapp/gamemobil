/* OPÉRATION PONCIN — les commandes : au doigt (joystick flottant à gauche, glisser à droite pour tourner la vue, bouton Tir qui tourne
   aussi la vue quand on le glisse, Viser, Saut, Recharge, Accroupi / glisser / couché, bouton Courir en option), au clavier (par
   event.code : ZQSD en AZERTY = WASD en QWERTY) et à la souris (pointer lock : clic gauche tire, clic droit vise). Pointer Events suivis
   par pointerId, touch-action: none. Le mode gaucher inverse les côtés. Les deux emplacements d'armes sont les pastilles du HUD
   (PHUD les touche ; PCONTROLES.emplacement(slot) et PCONTROLES.recharger() reçoivent l'ordre).
   L'entrée v2 (conception du lot Gameplay § 3 et § 10 ; les noms de corps.js et armes.js font foi) :
     { avant, cote, dyaw, dpitch, tir, saut, recharge, accroupi, course, couche, vise, arme: null | 0 | 1 (emplacement), changer }
   accroupi, course, couche, vise et tir sont des NIVEAUX (une entrée perdue ne perd rien ; la simulation trouve elle-même le front
   accroupi qui lance la glissade) ; saut, recharge, arme, changer et l'appui bref sur Tir sont des FRONTS.
   - Courir : pousser le joystick à fond (|j| ≥ 0,92 et ≤ 40° de l'avant ; on en sort sous 0,85 ou au-delà de 50° ; un anneau jaune
     s'allume), Maj maintenue, ou le bouton Courir (réglage « course : bouton » ; lâcher le joystick l'éteint). Commencer à courir
     efface la bascule accroupi et la visée en bascule.
   - Accroupi : un toucher bascule accroupi tout de suite (en course : la glissade ; à sa fin on se relève en courant si l'on court
     encore) ; un appui long (350 ms) bascule couché (vibration de 12 ms) ; toucher quand on est couché : accroupi.
     Clavier : C bascule (glissade en courant), Ctrl maintenu, X couché. Un refus de la simulation ({ t: 'refus', quoi: 'couche' })
     efface la bascule couché.
   - Viser : bouton (bascule au doigt), clic droit (maintenu à la souris) ; réglage « visee » : 'auto' | 'bascule' | 'maintenir'.
     En visée la vue tourne moins vite : × (1/z)^0,9 × la « sensibilité en visée » (z : le zoom de l'arme, lissé par e.vise).
   - Armes : 1 / 2 (emplacement), KeyQ (A en AZERTY) ou la molette (l'autre emplacement : changer).
   La partie avance à pas fixe (1/60 s, conception § 2) : PCONTROLES.lire() est appelé une fois par IMAGE et verse ce qui s'est passé
   depuis l'image d'avant dans un CUMUL (dyaw et dpitch s'additionnent ; les fronts se combinent par OU ; les niveaux gardent la dernière
   valeur). PCONTROLES.consommer() rend l'entrée d'un PAS : le premier pas qui suit prend les variations et les fronts (puis le cumul les
   oublie), les pas suivants n'ont que les niveaux ; une image sans pas garde tout le cumul. PCONTROLES.enAttente() → { dyaw, dpitch } :
   les variations pas encore consommées, que le rendu ajoute au regard affiché (visée sans latence) ; PCONTROLES.attenuer(k) les y
   multiplie par k (ui.js : 1 − ralentir de l'aide à la visée, pour que le regard affiché entre deux pas ne montre pas plus que ce que le
   pas appliquera : il ne recule jamais).
   PCONTROLES.maj(jeu, moi, evs) : l'état des boutons (icône de posture, visée, recharge, course), le zoom de l'arme pour la sensibilité,
   les refus. PCONTROLES.ICONES : les icônes (postures comprises, reprises par le HUD). Objets réutilisés : aucune allocation par image. */
const PCONTROLES = (() => {
  'use strict';
  const DEG = Math.PI / 180, RAYON = 60, MORTE = 0.08, K_DOIGT = 0.22 * DEG, EXPO = 1.15, K_SOURIS = 0.0022;
  // courir au joystick : entrer à |j| ≥ 0,92 et ≤ 40° de l'avant, sortir sous 0,85 ou au-delà de 50° ; l'appui long d'Accroupi (ms)
  const COURSE_IN = 0.92, COURSE_OUT = 0.85, ANGLE_IN = 40 * DEG, ANGLE_OUT = 50 * DEG, APPUI_LONG = 350;
  const entree = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, course: false, couche: false, vise: false, recharge: false, arme: null, changer: false }; // l'entrée d'un pas
  const cumul = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, course: false, couche: false, vise: false, recharge: false, arme: null, changer: false, tirBref: false }; // depuis le dernier pas
  const ATTENTE = { dyaw: 0, dpitch: 0 };
  let kAttente = 1; // la part du regard en attente que le rendu montre (attenuer)
  // les réglages du joueur : visee 'auto' (bascule au doigt, maintenue à la souris) | 'bascule' | 'maintenir' ; course 'joystick' | 'bouton'
  const R = { sensibilite: 1, sensibiliteVisee: 1, inverserY: false, gaucher: false, tirAuto: true, visee: 'auto', course: 'joystick' };
  let racine = null, actif = false, tactile = false, actions = {}, W = 1, H = 1;
  // les doigts : un rôle par pointerId
  const roles = new Map(); // pointerId → { role: 'joy' | 'vise' | 'tir' | 'bouton', x, y, cmd }
  const pool = []; const prendre = () => pool.pop() || { role: '', x: 0, y: 0, cmd: null };
  let joyId = -1, joyBx = 0, joyBy = 0, joyVx = 0, joyVy = 0, tirDoigt = 0;
  let accYaw = 0, accPitch = 0, sautL = false, rechargeL = false, armeL = null, changerL = false, tirL = false; // tirL : un appui sur Tir, même relâché avant l'image
  // les niveaux tenus ou basculés
  let accroupiBascule = false, coucheBascule = false, viseBascule = false, viseDoigt = 0, viseSouris = false, courseBascule = false, joyCourse = false;
  let courseAvant = false;     // le niveau course de l'image d'avant (son front efface accroupi et la visée en bascule)
  let glissade = 0;            // une glissade demandée (Accroupi en courant) : 1 demandée, 2 vue par la simulation ; à la fin, on se relève si l'on court encore
  let glissadeT = 0, coucheT = 0, appuiAcc = null, appuiAccT = 0; // l'heure de la demande (ms) ; l'appui long d'Accroupi en cours
  let kVue = 1;                // le facteur de sensibilité de la visée (zoom de l'arme, réglage)
  // clavier et souris
  const touches = { avant: false, arriere: false, gauche: false, droite: false, accroupi: false, course: false };
  let tirSouris = false, nArmes = 2;
  // les éléments
  let elJoy, elJoyBase, elJoyBouton, elTir, elAccroupi, elAccIco, elRecharge, elAnneau, elVise, elCourse;
  const vu = { posture: '', on: null, vise: null, course: null, joyCourse: null, rech: -1 };

  const ICONES = {
    tir: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13" fill="none" stroke="#2B2A4C" stroke-width="6"/><circle cx="24" cy="24" r="13" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M24 4v12M24 32v12M4 24h12M32 24h12" stroke="#2B2A4C" stroke-width="6" stroke-linecap="round"/><path d="M24 5v10M24 33v10M5 24h10M33 24h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="3.2" fill="#fff" stroke="#2B2A4C" stroke-width="2"/></svg>',
    vise: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><circle cx="24" cy="24" r="8" fill="none" stroke="#2B2A4C" stroke-width="2.5"/><path d="M24 6v9M24 33v9M6 24h9M33 24h9" stroke="#2B2A4C" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="2.6" fill="#FF4D6D" stroke="#2B2A4C" stroke-width="1.5"/></svg>',
    saut: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 9l12 13h-7v11H19V22h-7z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M14 39h20" stroke="#2B2A4C" stroke-width="4" stroke-linecap="round"/></svg>',
    recharge: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M35 17a13 13 0 1 0 2 12" fill="none" stroke="#2B2A4C" stroke-width="5" stroke-linecap="round"/><path d="M35 17a13 13 0 1 0 2 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M38 8v11H27z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/></svg>',
    // les postures (le bouton Accroupi suit l'état ; le HUD montre la même icône près de la vie)
    debout: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="9.5" r="5" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><path d="M18 18h12l1 12h-3l-1 12h-6l-1-12h-3z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M12 44h24" stroke="#2B2A4C" stroke-width="3.5" stroke-linecap="round"/></svg>',
    accroupi: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="12" r="5.5" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><path d="M17 22h13l3 9h-6l-3 7h-6l3-9h-6z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M11 41h26" stroke="#2B2A4C" stroke-width="4" stroke-linecap="round"/></svg>',
    couche: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="37" cy="27" r="5" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><path d="M6 33l4-6h20l2 6z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M5 39h38" stroke="#2B2A4C" stroke-width="3.5" stroke-linecap="round"/></svg>',
    glisse: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="33" cy="15" r="5" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><path d="M28 22l-6 9H9l-1 4h17l7-10z" fill="#fff" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><path d="M5 40h30M30 34h12M34 29h9" stroke="#2B2A4C" stroke-width="3" stroke-linecap="round"/></svg>',
    course: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="29" cy="8.5" r="5" fill="#fff" stroke="#2B2A4C" stroke-width="3"/><path d="M22 16l9 2 3 8 6 2-1 3-8-2-3-5-3 7 5 5-3 9h-4l2-7-7-6-4 7-6-2 6-11z" fill="#fff" stroke="#2B2A4C" stroke-width="2.6" stroke-linejoin="round"/><path d="M4 18h9M2 25h8" stroke="#2B2A4C" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  // ─── construction ───
  function init(r, o) {
    racine = r; o = o || {}; tactile = !!o.tactile; actions = o.actions || {};
    if (!racine) return;
    racine.classList.add('pc');
    racine.innerHTML = `<div class="pc-joy" aria-hidden="true"><div class="pc-joy-base"></div><div class="pc-joy-bouton"></div></div>
      <div class="pc-boutons">
        <button type="button" class="pc-btn pc-tir" data-cmd="tir" aria-label="Tirer">${ICONES.tir}</button>
        <button type="button" class="pc-btn pc-vise" data-cmd="vise" aria-label="Viser" aria-pressed="false">${ICONES.vise}</button>
        <button type="button" class="pc-btn pc-saut" data-cmd="saut" aria-label="Sauter">${ICONES.saut}</button>
        <button type="button" class="pc-btn pc-accroupi" data-cmd="accroupi" aria-label="S’accroupir (appui long : se coucher)" aria-pressed="false"><span class="pc-ico">${ICONES.accroupi}</span></button>
        <button type="button" class="pc-btn pc-course" data-cmd="course" aria-label="Courir" aria-pressed="false">${ICONES.course}</button>
        <button type="button" class="pc-btn pc-recharge" data-cmd="recharge" aria-label="Recharger">${ICONES.recharge}<svg class="pc-anneau" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" pathLength="100"/></svg></button>
      </div>
      <div class="pc-aide"><b>Clique pour viser à la souris</b><small>ZQSD ou WASD : bouger · Maj : courir · clic droit : viser · C : s’accroupir (en courant : glisser) · X : se coucher · Espace : sauter · R : recharger · 1 2 ou Q : armes · Tab : scores · Échap : pause</small></div>`;
    elJoy = racine.querySelector('.pc-joy'); elJoyBase = racine.querySelector('.pc-joy-base'); elJoyBouton = racine.querySelector('.pc-joy-bouton');
    elTir = racine.querySelector('.pc-tir'); elVise = racine.querySelector('.pc-vise'); elCourse = racine.querySelector('.pc-course');
    elAccroupi = racine.querySelector('.pc-accroupi'); elAccIco = racine.querySelector('.pc-accroupi .pc-ico'); elRecharge = racine.querySelector('.pc-recharge'); elAnneau = racine.querySelector('.pc-anneau circle');
    racine.addEventListener('pointerdown', bas, { passive: false });
    racine.addEventListener('pointermove', bouge, { passive: false });
    racine.addEventListener('pointerup', haut); racine.addEventListener('pointercancel', haut); racine.addEventListener('lostpointercapture', haut);
    racine.addEventListener('contextmenu', (e) => e.preventDefault());
    racine.addEventListener('touchstart', (e) => { if (actif) e.preventDefault(); }, { passive: false }); // pas de zoom ni de défilement sous les pouces
    window.addEventListener('keydown', clavierBas); window.addEventListener('keyup', clavierHaut);
    window.addEventListener('mousemove', souris);
    // les boutons de la souris par mousedown / mouseup : un second bouton pressé pendant que le premier est tenu ne donne pas de pointerdown
    window.addEventListener('mousedown', sourisBas); window.addEventListener('mouseup', sourisHaut);
    window.addEventListener('blur', lacher); document.addEventListener('visibilitychange', () => { if (document.hidden) lacher(); });
    document.addEventListener('pointerlockchange', () => { racine.classList.toggle('verrou', verrouille()); if (!verrouille()) { tirSouris = false; viseSouris = false; } if (!verrouille() && actif && actions.verrouPerdu) actions.verrouPerdu(); });
    taille(); regler(o.reglages); modeTactile(tactile);
  }
  function taille() { if (!racine) return; W = racine.clientWidth || window.innerWidth; H = racine.clientHeight || window.innerHeight; }
  const VISEES = ['auto', 'bascule', 'maintenir'], COURSES = ['joystick', 'bouton'];
  function regler(o) {
    if (!o) return;
    if (o.sensibilite != null) R.sensibilite = Math.max(0.2, Math.min(3, +o.sensibilite || 1));
    if (o.sensibiliteVisee != null) R.sensibiliteVisee = Math.max(0.5, Math.min(1.5, +o.sensibiliteVisee || 1));
    if (o.inverserY != null) R.inverserY = !!o.inverserY;
    if (o.tirAuto != null) R.tirAuto = !!o.tirAuto;
    if (o.visee != null) R.visee = VISEES.indexOf(o.visee) >= 0 ? o.visee : 'auto';
    if (o.course != null) { R.course = COURSES.indexOf(o.course) >= 0 ? o.course : 'joystick'; if (R.course !== 'bouton') courseBascule = false; if (R.course !== 'joystick') joyCourse = false; }
    if (o.gaucher != null) R.gaucher = !!o.gaucher;
    if (racine) { racine.classList.toggle('gaucher', R.gaucher); racine.classList.toggle('course-bouton', R.course === 'bouton'); }
  }
  function modeTactile(oui) { tactile = !!oui; if (racine) racine.classList.toggle('tactile', tactile); document.documentElement.classList.toggle('tactile', tactile); }
  function activer(oui) { actif = !!oui; if (!actif) { lacher(); if (verrouille()) try { document.exitPointerLock(); } catch (e) { /* rien */ } } if (racine) racine.classList.toggle('actif', actif); }
  const verrouille = () => !!racine && document.pointerLockElement === racine;
  function verrouiller() { if (!racine || tactile || verrouille() || !racine.requestPointerLock) return; try { const p = racine.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refusé */ } }
  const viseeBascule = (doigt) => (R.visee === 'auto' ? doigt : R.visee === 'bascule'); // par défaut : bascule au doigt, maintenue à la souris
  function vibrer(ms) { try { if (typeof PSONS !== 'undefined' && PSONS.vibrer) PSONS.vibrer(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* pas de vibreur */ } }

  // ─── accroupi, couché, glissade ───
  const enCourse = () => joyCourse || courseBascule || touches.course;
  function basculerAccroupi() { // un toucher d'Accroupi, ou C : couché → accroupi ; en course → glissade ; sinon bascule
    if (coucheBascule) { coucheBascule = false; accroupiBascule = true; glissade = 0; return; }
    if (enCourse() && !accroupiBascule) { accroupiBascule = true; glissade = 1; glissadeT = performance.now(); return; }
    accroupiBascule = !accroupiBascule; glissade = 0;
  }
  function basculerCouche() { coucheBascule = !coucheBascule; coucheT = performance.now(); glissade = 0; if (!coucheBascule) accroupiBascule = false; }
  function appuiLong() { // 350 ms sur Accroupi : bascule couché (sauf si l'appui a commencé couché : il est déjà passé accroupi)
    appuiAccT = 0; if (!appuiAcc || !actif) return;
    if (!appuiAcc.depuisCouche) { coucheBascule = !coucheBascule; coucheT = performance.now(); glissade = 0; vibrer(12); }
    appuiAcc.long = true;
  }

  // ─── doigts et souris ───
  const coteJoy = (x) => (R.gaucher ? x > W * 0.55 : x < W * 0.45); // la moitié du joystick
  function bas(e) {
    if (!actif) return;
    const cible = e.target.closest ? e.target.closest('[data-cmd]') : null;
    if (e.pointerType === 'mouse') { // souris : le premier clic verrouille le pointeur ; ensuite les boutons passent par mousedown / mouseup
      if (!verrouille()) verrouiller();
      e.preventDefault(); return;
    }
    if (!tactile && e.pointerType === 'touch') modeTactile(true);
    e.preventDefault();
    if (roles.has(e.pointerId)) haut(e); // un doigt dont le « lever » s'est perdu (le navigateur réutilise son numéro) : relâché d'abord, sinon ce nouvel appui serait ignoré
    const d = prendre(); d.x = e.clientX; d.y = e.clientY; d.cmd = null;
    if (cible) {
      const cmd = cible.dataset.cmd;
      if (cmd === 'tir') { d.role = 'tir'; tirDoigt++; tirL = true; elTir.classList.add('appui'); }
      else {
        d.role = 'bouton'; d.cmd = cible; cible.classList.add('appui');
        if (cmd === 'saut') sautL = true;
        else if (cmd === 'recharge') rechargeL = true;
        else if (cmd === 'vise') { if (viseeBascule(true)) viseBascule = !viseBascule; else viseDoigt++; }
        else if (cmd === 'course') { courseBascule = !courseBascule; if (courseBascule) viseBascule = false; }
        else if (cmd === 'accroupi') {
          const depuisCouche = coucheBascule; basculerAccroupi();
          appuiAcc = { id: e.pointerId, depuisCouche, long: false }; clearTimeout(appuiAccT); appuiAccT = setTimeout(appuiLong, APPUI_LONG);
        }
      }
    } else if (joyId < 0 && coteJoy(e.clientX)) { // le joystick apparaît sous le pouce, un peu écarté des bords (geste retour de Safari)
      d.role = 'joy'; joyId = e.pointerId; joyBx = e.clientX; joyBy = e.clientY; joyVx = 0; joyVy = 0; // le centre est là où le pouce s'est posé
      placerJoy(); elJoy.classList.add('vivant');
    } else d.role = 'vise';
    roles.set(e.pointerId, d);
    try { racine.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
  }
  function viser(dx, dy) { // un glissé de (dx, dy) px : ≈ 0,22°/px, courbe d^1,15 (les petits gestes restent fins), × la visée
    const m = Math.sqrt(dx * dx + dy * dy); if (m <= 0) return;
    const k = K_DOIGT * R.sensibilite * kVue * Math.pow(m, EXPO - 1);
    accYaw -= dx * k; accPitch -= dy * k * (R.inverserY ? -1 : 1);
  }
  function joyCourir() { // pousser le joystick à fond, vers l'avant (avec une marge pour en sortir)
    if (R.course !== 'joystick' || joyId < 0) { joyCourse = false; return; }
    const l = Math.sqrt(joyVx * joyVx + joyVy * joyVy), ang = Math.atan2(Math.abs(joyVx), -joyVy);
    joyCourse = joyCourse ? !(l < COURSE_OUT || ang > ANGLE_OUT) : l >= COURSE_IN && ang <= ANGLE_IN;
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
      joyVx = vx / RAYON; joyVy = vy / RAYON; joyCourir(); placerJoy();
    } else if (d.role === 'vise' || d.role === 'tir') viser(dx, dy);
  }
  function haut(e) {
    if (e.pointerType === 'mouse') return;
    const d = roles.get(e.pointerId); if (!d) return;
    roles.delete(e.pointerId);
    if (d.role === 'joy') { joyId = -1; joyVx = 0; joyVy = 0; joyCourse = false; courseBascule = false; elJoy.classList.remove('vivant'); placerJoy(); } // lâcher le joystick arrête la course
    else if (d.role === 'tir') { tirDoigt = Math.max(0, tirDoigt - 1); if (!tirDoigt) elTir.classList.remove('appui'); }
    else if (d.role === 'bouton' && d.cmd) {
      d.cmd.classList.remove('appui');
      const cmd = d.cmd.dataset.cmd;
      if (cmd === 'vise' && viseDoigt > 0) viseDoigt--;
      else if (cmd === 'accroupi' && appuiAcc && appuiAcc.id === e.pointerId) { clearTimeout(appuiAccT); appuiAccT = 0; appuiAcc = null; }
    }
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
    const k = K_SOURIS * R.sensibilite * kVue;
    accYaw -= (e.movementX || 0) * k; accPitch -= (e.movementY || 0) * k * (R.inverserY ? -1 : 1);
  }
  function sourisBas(e) {
    if (!actif || !verrouille()) return;
    if (e.button === 0) { tirSouris = true; tirL = true; }
    else if (e.button === 2) { if (viseeBascule(false)) viseBascule = !viseBascule; else viseSouris = true; }
    e.preventDefault();
  }
  function sourisHaut(e) { if (e.button === 0) tirSouris = false; else if (e.button === 2) viseSouris = false; }
  function lacher() { // tout relâcher (fenêtre quittée, menu) : jamais de doigt ou de touche coincés (les bascules restent)
    roles.forEach((d) => { if (d.cmd) d.cmd.classList.remove('appui'); d.cmd = null; pool.push(d); }); roles.clear();
    joyId = -1; joyVx = 0; joyVy = 0; joyCourse = false; courseBascule = false; tirDoigt = 0; tirSouris = false; viseDoigt = 0; viseSouris = false;
    clearTimeout(appuiAccT); appuiAccT = 0; appuiAcc = null;
    if (elJoy) { elJoy.classList.remove('vivant'); placerJoy(); elTir.classList.remove('appui'); }
    touches.avant = touches.arriere = touches.gauche = touches.droite = touches.accroupi = touches.course = false;
    accYaw = 0; accPitch = 0; sautL = false; rechargeL = false; armeL = null; changerL = false; tirL = false; viderCumul(); kAttente = 1;
  }
  function viderCumul() {
    cumul.avant = 0; cumul.cote = 0; cumul.dyaw = 0; cumul.dpitch = 0; cumul.tir = false; cumul.saut = false; cumul.accroupi = false; cumul.course = false; cumul.couche = false; cumul.vise = false;
    cumul.recharge = false; cumul.arme = null; cumul.changer = false; cumul.tirBref = false;
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
      case 'KeyC': if (!e.repeat) basculerAccroupi(); break;
      case 'KeyX': if (!e.repeat) basculerCouche(); break;
      case 'ShiftLeft': case 'ShiftRight': touches.course = true; break;
      case 'ControlLeft': case 'ControlRight': touches.accroupi = true; e.preventDefault(); break;
      case 'Digit1': case 'Numpad1': armeL = 0; break;
      case 'Digit2': case 'Numpad2': armeL = 1; break;
      case 'KeyQ': if (!e.repeat) changerL = true; break; // A sur un clavier AZERTY
      case 'Tab': e.preventDefault(); if (!e.repeat && actions.scores) actions.scores(true); break;
    }
  }
  function clavierHaut(e) {
    const dir = DIRS[e.code]; if (dir) { touches[dir] = false; return; }
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') touches.accroupi = false;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') touches.course = false;
    else if (e.code === 'Tab' && actions.scores) actions.scores(false);
  }
  function molette(e) { if (!actif || !verrouille() || nArmes < 2 || !e.deltaY) return; changerL = true; }
  window.addEventListener('wheel', molette, { passive: true });
  // les ordres venus du HUD (les pastilles d'armes, le compteur de munitions)
  function emplacement(slot) { if (actif && (slot === 0 || slot === 1)) armeL = slot; }
  function recharger() { if (actif) rechargeL = true; }

  // ─── lecture, une fois par image : le cumul ───
  function lire() {
    if (!actif) { viderCumul(); accYaw = accPitch = 0; sautL = rechargeL = tirL = changerL = false; armeL = null; courseAvant = false; return cumul; }
    let vx = joyVx, vy = joyVy; const l = Math.sqrt(vx * vx + vy * vy);
    if (l < MORTE) { vx = 0; vy = 0; } else { const k = Math.min(1, (l - MORTE) / (1 - MORTE)) / l; vx *= k; vy *= k; } // zone morte de 8 %, puis toute la course
    const kbA = (touches.avant ? 1 : 0) - (touches.arriere ? 1 : 0), kbC = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0);
    let av = -vy + kbA, co = vx + kbC; const n = Math.sqrt(av * av + co * co); if (n > 1) { av /= n; co /= n; }
    // la course : son front efface la bascule accroupi (sauf une glissade demandée) et la visée en bascule
    const course = enCourse();
    if (course && !courseAvant) { if (glissade === 0) accroupiBascule = false; viseBascule = false; }
    courseAvant = course;
    // les niveaux : la dernière valeur
    cumul.avant = av; cumul.cote = co;
    cumul.tir = tirDoigt > 0 || tirSouris;
    cumul.accroupi = accroupiBascule || touches.accroupi;
    cumul.couche = coucheBascule;
    cumul.course = course;
    cumul.vise = viseBascule || viseDoigt > 0 || viseSouris;
    // les variations s'additionnent, les fronts se combinent par OU (rien de perdu si l'image n'a pas de pas)
    cumul.dyaw += accYaw; cumul.dpitch += accPitch; accYaw = 0; accPitch = 0;
    if (sautL) cumul.saut = true; sautL = false;
    if (rechargeL) cumul.recharge = true; rechargeL = false;
    if (tirL) cumul.tirBref = true; tirL = false;
    if (armeL !== null) cumul.arme = armeL; armeL = null;
    if (changerL) cumul.changer = true; changerL = false;
    // l'anneau jaune du joystick : on court
    if (joyCourse !== vu.joyCourse && elJoy) { vu.joyCourse = joyCourse; elJoy.classList.toggle('course', joyCourse); }
    return cumul;
  }
  // l'entrée d'un pas : le premier pas après lire() prend variations et fronts, les suivants n'ont que les niveaux
  function consommer() {
    entree.avant = cumul.avant; entree.cote = cumul.cote; entree.accroupi = cumul.accroupi; entree.couche = cumul.couche; entree.course = cumul.course; entree.vise = cumul.vise;
    entree.dyaw = cumul.dyaw; entree.dpitch = cumul.dpitch;
    entree.tir = cumul.tir || cumul.tirBref; // un appui bref sur Tir (relâché avant l'image) tire une fois
    entree.saut = cumul.saut; entree.recharge = cumul.recharge; entree.arme = cumul.arme; entree.changer = cumul.changer;
    cumul.dyaw = 0; cumul.dpitch = 0; cumul.saut = false; cumul.recharge = false; cumul.arme = null; cumul.changer = false; cumul.tirBref = false;
    return entree;
  }
  function enAttente() { ATTENTE.dyaw = actif ? (cumul.dyaw + accYaw) * kAttente : 0; ATTENTE.dpitch = actif ? (cumul.dpitch + accPitch) * kAttente : 0; return ATTENTE; } // y compris ce qui est arrivé depuis lire()
  function attenuer(k) { kAttente = k > 0 && k <= 1 ? k : 1; }
  function reinit() {
    lacher(); accroupiBascule = false; coucheBascule = false; viseBascule = false; glissade = 0; courseAvant = false; kVue = 1;
    vu.posture = ''; vu.on = null; vu.vise = null; vu.course = null; vu.joyCourse = null; vu.rech = -1;
  }

  // ─── l'état affiché sur les boutons, et ce que la partie dit en retour (posture, zoom de l'arme, refus) ───
  const ARME0 = { recharge: 1.6, visee: null };
  function armeDe(id) { return typeof PREGLES !== 'undefined' && PREGLES.arme ? PREGLES.arme(id) || ARME0 : ARME0; }
  function maj(jeu, moi, evs) {
    if (!racine || !moi) return;
    nArmes = Array.isArray(moi.armes) ? moi.armes.length : 1;
    const now = performance.now(), A = armeDe(moi.arme);
    // le zoom de l'arme, lissé par la visée : z = 1 + (zoom − 1)·smoothstep(vise) ; la vue tourne × (1/z)^0,9 × la sensibilité en visée
    const v = Math.max(0, Math.min(1, +moi.vise || 0)), s = v * v * (3 - 2 * v), zoom = A.visee && A.visee.zoom > 1 ? A.visee.zoom : 1, z = 1 + (zoom - 1) * s;
    kVue = Math.pow(1 / z, 0.9) * (1 + (R.sensibiliteVisee - 1) * s);
    // les refus de la simulation : « Pas la place de te coucher » efface la bascule couché
    if (evs) for (let i = 0; i < evs.length; i++) { const x = evs[i]; if (x && x.t === 'refus' && x.id === moi.id && x.quoi === 'couche') coucheBascule = false; }
    const posture = moi.vers || moi.posture || (moi.accroupi ? 'accroupi' : 'debout');
    if (coucheBascule && posture !== 'couche' && moi.posture !== 'couche' && now - coucheT > 1500) coucheBascule = false; // un refus perdu : on ne reste pas coincé
    if (moi.vivant === false) { coucheBascule = false; accroupiBascule = false; viseBascule = false; glissade = 0; } // on réapparaît debout
    // la glissade demandée en courant : vue par la simulation, puis finie → on se relève si l'on court encore (sinon on reste accroupi)
    if (glissade === 1) { if (posture === 'glisse') glissade = 2; else if (now - glissadeT > 400) glissade = 0; }
    else if (glissade === 2 && posture !== 'glisse') { glissade = 0; if (enCourse()) accroupiBascule = false; }
    // le bouton Accroupi : l'icône suit l'état (debout : l'action, s'accroupir)
    const p = coucheBascule && posture !== 'glisse' ? 'couche' : posture === 'debout' && (accroupiBascule || touches.accroupi) ? 'accroupi' : ICONES[posture] ? posture : 'debout';
    const ico = p === 'debout' ? 'accroupi' : p, on = p !== 'debout';
    if (ico !== vu.posture) { vu.posture = ico; elAccIco.innerHTML = ICONES[ico]; elAccroupi.dataset.p = ico; }
    if (on !== vu.on) { vu.on = on; elAccroupi.classList.toggle('on', on); elAccroupi.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    const vise = viseBascule || viseDoigt > 0 || viseSouris; if (vise !== vu.vise) { vu.vise = vise; elVise.classList.toggle('on', vise); elVise.setAttribute('aria-pressed', vise ? 'true' : 'false'); }
    if (courseBascule !== vu.course) { vu.course = courseBascule; elCourse.classList.toggle('on', courseBascule); elCourse.setAttribute('aria-pressed', courseBascule ? 'true' : 'false'); }
    let q = 0; // la recharge en cours, de 0 à 1
    if (jeu && moi.rechargeJusqua > jeu.temps) { const d = A.recharge || 1.6; q = 1 - (moi.rechargeJusqua - jeu.temps) / d; }
    q = Math.round(Math.max(0, Math.min(1, q)) * 100);
    if (q !== vu.rech) { vu.rech = q; elAnneau.style.strokeDashoffset = String(100 - q); elRecharge.classList.toggle('charge', q > 0 && q < 100); }
  }

  return { init, lire, consommer, enAttente, attenuer, regler, activer, taille, reinit, maj, modeTactile, verrouiller, lacher, emplacement, recharger, ICONES,
    get reglages() { return R; }, get tactile() { return tactile; }, get actif() { return actif; }, get verrouille() { return verrouille(); } };
})();
