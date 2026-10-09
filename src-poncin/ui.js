/* OPÉRATION PONCIN — le point d'entrée : écran titre sur le survol 3D de Poncin, choix du mode (Arène jouable ; Extraction, Jour / Nuit
   et les salons en ligne « bientôt »), réglages, crédits, pause, compte à rebours, la boucle de jeu (commandes → aide à la visée →
   simulation → effets, sons, HUD → image), la sauvegarde 'poncin.v1' (réglages, records) et les crochets de test window.__poncin.
   Tout appel aux autres modules est gardé : sans Three.js ou sans WebGL, un panneau clair ; une erreur ne fige jamais l'écran. */
const PUI = (() => {
  'use strict';
  const CLE = 'poncin.v1', $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const R = typeof PREGLES !== 'undefined' ? PREGLES : null;
  let _compte = null; const elCompte = () => _compte || (_compte = $('#compte'));
  const DEFAUT = () => ({ v: 1, reglages: { sensibilite: 1, inverserY: false, gaucher: false, tirAuto: true, qualite: 'auto', son: true, vibre: true, nom: '' }, records: { arene: { meilleur: 0, parties: 0, eliminations: 0, victoires: 0, serie: 0 } }, choix: { format: 'solo', bots: 4, niveau: 'normal' }, derniere: 0 });
  let sauv = DEFAUT(), carte = null, monde = null, rendu3d = false, jeu = null, ecran = 'chargement', retourReglages = 'titre', avantPause = 'partie', optsPartie = null;
  let J, A, RENDU, CARTEPROV, MONDE; // les modules, résolus au démarrage
  let last = 0, tAnim = 0, compteT = 0, compteVu = -1, surDepuis = 0, erreursEtape = 0, erreursRendu = 0, erreursTotal = 0, derniereErreur = '', finTraitee = false, serie = 0, serieMax = 0, elims = 0;
  let fps = 0, nImages = 0, tFps = 0, msImage = 0, imagePause = 0;
  const entrees = { moi: null }, VIDE = [];
  let force = null; // l'entrée imposée par les tests (window.__poncin.entree)

  // ─── sauvegarde ───
  function lireSauv() {
    const d = DEFAUT(); let s = null;
    try { s = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1) return d;
    Object.assign(d.reglages, s.reglages || {}); Object.assign(d.records.arene, (s.records && s.records.arene) || {}); Object.assign(d.choix, s.choix || {}); d.derniere = s.derniere || 0;
    return d;
  }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(sauv)); } catch (e) { /* stockage indisponible : on joue quand même */ } }
  function signaler(ou, e) { erreursTotal++; derniereErreur = ou + ' : ' + (e && e.message ? e.message : e); if (erreursTotal < 20) console.error('[Poncin]', ou, e); }

  // ─── écrans ───
  const EN_JEU = { compte: 1, partie: 1, pause: 1, fin: 1 };
  function montrer(nom) {
    ecran = nom; document.body.dataset.ecran = nom;
    $$('.ecran').forEach((s) => { s.hidden = s.dataset.e !== nom; });
    const enJeu = !!EN_JEU[nom] || (nom === 'reglages' && retourReglages === 'pause');
    $('#hud').hidden = !enJeu; $('#commandes').hidden = !(nom === 'partie' || nom === 'compte');
    document.body.classList.toggle('en-jeu', enJeu);
    if (nom === 'titre') majTitre();
    if (nom === 'modes') majModes();
    if (nom === 'reglages') majReglages();
  }
  function majTitre() {
    const a = sauv.records.arene, r = $('#records');
    r.innerHTML = a.parties ? `<span><b>${a.meilleur}</b> pts record</span><span><b>${a.eliminations}</b> robots repeints</span><span><b>${a.parties}</b> partie${a.parties > 1 ? 's' : ''}</span>` : '<span>Première mission : repeins les robots qui ont envahi Poncin !</span>';
    const p = $('#carte-provisoire'); if (p) p.hidden = !(carte && carte.source === 'provisoire');
  }
  function oups(titre, texte) { // un panneau d'erreur aimable, jamais un écran blanc
    const o = $('#oups'); if (!o) return;
    o.querySelector('h2').textContent = titre || 'Oups, la peinture a coulé'; o.querySelector('p').textContent = texte || 'Le jeu a rencontré un souci. Recharge la page pour repartir.';
    o.hidden = false;
  }

  // ─── chargement de la carte ───
  async function chargerCarte() {
    let c = null;
    try {
      const ctl = window.AbortController ? new AbortController() : null, t = setTimeout(() => { if (ctl) ctl.abort(); }, 8000);
      const r = await fetch('carte/poncin.json', ctl ? { signal: ctl.signal } : undefined); clearTimeout(t);
      if (r.ok) { const j = await r.json(); if (j && j.v === 1 && Array.isArray(j.batiments) && j.taille > 0) c = j; }
    } catch (e) { c = null; } // hors ligne, fichier absent, page ouverte en file:// : la carte provisoire
    if (!c && CARTEPROV) { try { c = CARTEPROV.creer(); } catch (e) { signaler('carte provisoire', e); c = null; } }
    return c;
  }
  function init3d() {
    if (typeof THREE === 'undefined' || !RENDU || !carte || !monde) return false;
    let ok = false;
    const q = sauv.reglages.qualite; // « auto » : on laisse PRENDU choisir (et ?qualite= de l'adresse)
    try { ok = RENDU.init($('#vue3d'), carte, monde, { qualite: q && q !== 'auto' ? q : undefined }) !== false; } catch (e) { signaler('rendu.init', e); ok = false; }
    if (ok) try { RENDU.taille(window.innerWidth, window.innerHeight); } catch (e) { signaler('rendu.taille', e); }
    return ok;
  }

  // ─── réglages ───
  function appliquerReglages() {
    const g = sauv.reglages;
    try { PCONTROLES.regler(g); } catch (e) { signaler('controles.regler', e); }
    try { PSONS.regler({ son: g.son, vibre: g.vibre }); } catch (e) { signaler('sons.regler', e); }
    document.body.classList.toggle('gaucher', !!g.gaucher);
  }
  function majReglages() {
    const g = sauv.reglages;
    $$('[data-r]').forEach((i) => {
      const k = i.dataset.r;
      if (i.type === 'checkbox') i.checked = !!g[k];
      else if (i.type === 'range') { i.value = g[k]; const o = i.parentNode.querySelector('output'); if (o) o.textContent = (+g[k]).toFixed(2).replace('.', ','); }
      else if (i.type === 'text') i.value = g[k] || '';
      else if (i.classList.contains('seg')) i.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(g[k]))));
    });
  }
  function brancherReglages() {
    $$('[data-r]').forEach((i) => {
      const k = i.dataset.r;
      if (i.classList.contains('seg')) i.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; sauv.reglages[k] = b.dataset.v; PSONS.ui('tap'); if (k === 'qualite' && rendu3d) try { RENDU.qualite(b.dataset.v); } catch (err) { signaler('rendu.qualite', err); } majReglages(); sauver(); });
      else i.addEventListener(i.type === 'range' || i.type === 'text' ? 'input' : 'change', () => {
        sauv.reglages[k] = i.type === 'checkbox' ? i.checked : i.type === 'range' ? +i.value : String(i.value).replace(/[<>]/g, '').slice(0, 12);
        if (i.type === 'checkbox') PSONS.ui('tap');
        appliquerReglages(); if (i.type !== 'text') majReglages(); sauver();
      });
    });
  }

  // ─── choix du mode ───
  function majModes() {
    const c = sauv.choix;
    $$('#e-modes .seg[data-opt]').forEach((s) => s.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(c[s.dataset.opt])))));
    $('#opt-bots').hidden = c.format === 'equipes';
    const niv = { facile: 'faciles', normal: 'malins', fort: 'redoutables' }[c.niveau] || '';
    $('#resume-arene').textContent = c.format === 'equipes' ? `Toi et un robot allié contre 2 robots ${niv}.` : `Toi contre ${c.bots} robots ${niv}, chacun pour soi.`;
    const ok = rendu3d && !!J && !!A; $('#b-lancer').disabled = !ok; $('#b-lancer').title = ok ? '' : 'La 3D n’est pas disponible';
  }
  function choixPartie() { const c = sauv.choix, eq = c.format === 'equipes'; return { bots: eq ? 3 : Math.max(3, Math.min(5, +c.bots || 4)), niveau: c.niveau in (R ? R.BOTS : { facile: 1, normal: 1, fort: 1 }) ? c.niveau : 'normal', equipes: eq }; }

  // ─── plein écran, paysage, écran allumé ───
  const android = /Android/i.test(navigator.userAgent || '');
  function pleinEcran() {
    try {
      const verrou = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* refusé */ } };
      const d = document.documentElement;
      if (android && !document.fullscreenElement && d.requestFullscreen) { const p = d.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(verrou, () => {}); else verrou(); } else if (android) verrou();
    } catch (e) { /* le navigateur refuse : on joue tel quel */ }
  }
  let verrouEcran = null;
  async function eveille(oui) {
    try {
      if (oui && !verrouEcran && navigator.wakeLock && document.visibilityState === 'visible') { verrouEcran = await navigator.wakeLock.request('screen'); verrouEcran.addEventListener('release', () => { verrouEcran = null; }); }
      else if (!oui && verrouEcran) { const v = verrouEcran; verrouEcran = null; await v.release(); }
    } catch (e) { verrouEcran = null; }
  }

  // ─── une partie ───
  function trouver(id) { if (!jeu) return null; const es = jeu.entites || VIDE; for (let i = 0; i < es.length; i++) if (es[i].id === id) return es[i]; return null; }
  const fini = () => !!jeu && (jeu.fini === true || (typeof jeu.fini === 'function' && !!jeu.fini()));
  function demarrerPartie(o, compte) {
    if (!monde || !J || !A) { oups('La partie ne peut pas démarrer', 'Il manque un morceau du jeu. Recharge la page.'); return false; }
    o = Object.assign(choixPartie(), o || {});
    try {
      const graine = o.graine != null ? o.graine >>> 0 : ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
      jeu = J.creer({ monde, mode: A, graine, options: { bots: o.bots, niveau: o.niveau, equipes: !!o.equipes } });
      const nom = (sauv.reglages.nom || '').trim() || 'Toi';
      jeu.ajouterJoueur({ id: 'moi', nom, couleur: '#FFC84A', equipe: o.equipes ? 0 : 'moi', humain: true });
    } catch (e) { signaler('jeu.creer', e); jeu = null; oups('La partie n’a pas pu démarrer', 'Recharge la page et réessaie.'); return false; }
    optsPartie = o; finTraitee = false; surDepuis = 0; erreursEtape = 0; serie = 0; serieMax = 0; elims = 0; force = null;
    try { PHUD.reinit({ equipes: !!o.equipes }); } catch (e) { signaler('hud.reinit', e); }
    try { PCONTROLES.reinit(); } catch (e) { signaler('controles.reinit', e); }
    if (compte) { compteT = 3.6; compteVu = -1; montrer('compte'); PCONTROLES.activer(false); astuce(true); }
    else { montrer('partie'); PCONTROLES.activer(true); }
    eveille(true);
    return true;
  }
  function astuce(oui) { // les trois premières parties : comment on joue, pendant le compte à rebours
    const a = $('#astuce'); if (!a) return;
    if (!oui || (sauv.records.arene.parties || 0) >= 3) { a.hidden = true; return; }
    a.innerHTML = PCONTROLES.tactile ? '<b>Pouce gauche</b> : marcher · <b>glisse à droite</b> : viser · viseur rouge : <b>ça tire tout seul</b> !'
      : '<b>Clique</b> pour viser à la souris · <b>ZQSD / WASD</b> : marcher · <b>clic</b> : tirer · <b>Échap</b> : pause';
    a.hidden = false;
  }
  function lancer() { // le bouton « C'est parti ! » (dans le geste : plein écran, paysage, pointeur, son)
    PSONS.debloquer(); PSONS.ui('ok'); pleinEcran();
    if (demarrerPartie(choixPartie(), true) && !PCONTROLES.tactile) PCONTROLES.verrouiller();
  }
  function pause() {
    if (ecran !== 'partie' && ecran !== 'compte') return;
    avantPause = ecran; PCONTROLES.activer(false); montrer('pause'); PHUD.scores(false);
    const m = trouver('moi'); $('#pause-score').innerHTML = m && m.score ? `<span><b>${m.score.points || 0}</b> points</span><span><b>${m.score.kills || 0}</b> repeints</span><span><b>${m.score.morts || 0}</b> fois repeint</span>` : '';
  }
  function reprendre() {
    if (ecran !== 'pause' || !jeu) return;
    if (portrait()) return; // tourne d'abord le téléphone
    montrer(avantPause === 'compte' ? 'compte' : 'partie'); if (ecran === 'partie') PCONTROLES.activer(true); else { compteVu = -1; astuce(true); }
    if (!PCONTROLES.tactile) PCONTROLES.verrouiller();
    last = performance.now();
  }
  function quitter() { astuce(false); jeu = null; force = null; PCONTROLES.activer(false); eveille(false); try { PHUD.reinit(); } catch (e) { /* rien */ } montrer('titre'); }
  function terminer(evFin) {
    if (finTraitee || !jeu) return; finTraitee = true;
    PCONTROLES.activer(false); eveille(false);
    const m = trouver('moi'), pts = m && m.score ? m.score.points || 0 : 0, k = m && m.score ? m.score.kills || 0 : 0;
    const a = sauv.records.arene, record = pts > (a.meilleur || 0) && pts > 0, ancien = a.meilleur || 0;
    let res = null; try { res = A && A.resultat ? A.resultat(jeu) : null; } catch (e) { res = null; }
    let r = null; try { r = PHUD.fin(res || (evFin && evFin.classement ? { classement: evFin.classement } : null), jeu, 'moi', { mode: 'Arène', record, meilleur: ancien }); } catch (e) { signaler('hud.fin', e); }
    a.parties = (a.parties || 0) + 1; a.eliminations = (a.eliminations || 0) + k; if (record) a.meilleur = pts; if (r && r.gagne) a.victoires = (a.victoires || 0) + 1; a.serie = Math.max(a.serie || 0, serieMax);
    sauv.derniere = Date.now(); sauver();
    PSONS.jouer(r && r.gagne ? 'victoire' : 'defaite'); if (r && r.gagne) PSONS.vibrer([20, 40, 20, 40, 60]);
    montrer('fin');
  }

  // ─── la boucle ───
  function pasPartie(dt) { // une image de simulation : commandes, aide à la visée, jeu, effets, sons, HUD
    const e = PCONTROLES.lire();
    if (force) { // l'entrée imposée par les tests
      if (force.avant != null) e.avant = force.avant; if (force.cote != null) e.cote = force.cote; if (force.tir != null) e.tir = force.tir; if (force.accroupi != null) e.accroupi = force.accroupi;
      if (force.dyaw) { e.dyaw += force.dyaw; force.dyaw = 0; } if (force.dpitch) { e.dpitch += force.dpitch; force.dpitch = 0; }
      if (force.saut) { e.saut = true; force.saut = false; } if (force.recharge) { e.recharge = true; force.recharge = false; } if (force.arme) { e.arme = force.arme; force.arme = null; }
    }
    let aide = null;
    if (jeu.aideVisee) { try { aide = jeu.aideVisee('moi', PCONTROLES.tactile ? 1 : 0); } catch (err) { aide = null; } }
    if (aide && PCONTROLES.tactile) {
      const ral = Math.max(0, Math.min(0.9, +aide.ralentir || 0)); e.dyaw *= 1 - ral; e.dpitch *= 1 - ral; // la visée ralentit sur une cible
      const bouge = e.dyaw !== 0 || e.dpitch !== 0 || e.avant !== 0 || e.cote !== 0 || e.tir;
      if (bouge) { const lim = 0.0436 * dt * 3; e.dyaw += Math.max(-lim, Math.min(lim, +aide.dyaw || 0)); e.dpitch += Math.max(-lim, Math.min(lim, +aide.dpitch || 0)); } // et s'aimante doucement, seulement quand on joue
      if (PCONTROLES.reglages.tirAuto && aide.surCible) { surDepuis += dt; if (surDepuis >= 0.12) e.tir = true; } else surDepuis = 0; // tir auto après ~120 ms sur la cible
    } else surDepuis = 0;
    entrees.moi = e;
    let evs;
    try { evs = jeu.etape(dt, entrees) || VIDE; erreursEtape = 0; }
    catch (err) { signaler('jeu.etape', err); evs = VIDE; if (++erreursEtape >= 3) { quitter(); oups('La partie s’est emmêlé les pinceaux', 'Une erreur a interrompu la partie. Tu peux en relancer une depuis le menu.'); } return; }
    if (rendu3d) { try { RENDU.evenements(evs, jeu); } catch (err) { signaler('rendu.evenements', err); } }
    try { PSONS.evenements(evs, jeu, 'moi'); } catch (err) { signaler('sons', err); }
    try { PHUD.maj(jeu, 'moi', evs, aide); } catch (err) { signaler('hud.maj', err); }
    try { PCONTROLES.maj(jeu, trouver('moi')); } catch (err) { signaler('controles.maj', err); }
    let evFin = null;
    for (let i = 0; i < evs.length; i++) { const v = evs[i]; if (v.t === 'mort') { if (v.par === 'moi' && v.a !== 'moi') { elims++; serie++; if (serie > serieMax) serieMax = serie; } if (v.a === 'moi') serie = 0; } else if (v.t === 'fin') evFin = v; }
    if (evFin || fini()) terminer(evFin);
  }
  function boucle(now) {
    requestAnimationFrame(boucle);
    const t0 = performance.now(), dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; tAnim += dt;
    nImages++; if (now - tFps > 1000) { fps = Math.round(nImages * 1000 / (now - tFps)); nImages = 0; tFps = now; }
    try {
      if (ecran === 'partie' && jeu && !finTraitee) pasPartie(dt);
      else if (ecran === 'compte' && jeu) {
        compteT -= dt; const n = Math.ceil(compteT - 0.6);
        if (n !== compteVu) { compteVu = n; const c = elCompte(); c.hidden = false; c.firstElementChild.textContent = n > 0 ? String(n) : 'Repeins !'; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); c.classList.toggle('go', n <= 0); PSONS.compte(n); }
        try { PHUD.maj(jeu, 'moi', VIDE, null); PCONTROLES.maj(jeu, trouver('moi')); } catch (err) { signaler('hud.maj', err); }
        if (compteT <= 0) { elCompte().hidden = true; astuce(false); montrer('partie'); PCONTROLES.activer(true); PHUD.annonce(optsPartie && optsPartie.equipes ? 'Deux contre deux : couvre ton robot allié !' : `Premier à ${R ? R.MODES.arene.scoreVictoire : 25} repeints !`); }
      }
      if (ecran !== 'compte' && !elCompte().hidden) { elCompte().hidden = true; astuce(false); }
    } catch (err) { signaler('boucle', err); }
    if (rendu3d) {
      const enJeu = jeu && (EN_JEU[ecran] || ecran === 'reglages' && retourReglages === 'pause');
      const fige = ecran === 'pause' || ecran === 'reglages';
      if (!fige || (imagePause++ % 3) === 0) { // en pause, une image sur trois suffit
        try { RENDU.image(enJeu ? jeu : null, enJeu ? 'moi' : null, ecran === 'compte' || fige ? 0 : dt, tAnim); erreursRendu = 0; }
        catch (err) { signaler('rendu.image', err); if (++erreursRendu > 90) { rendu3d = false; panneau3d(true); } }
      }
    }
    msImage = msImage * 0.9 + (performance.now() - t0) * 0.1;
  }
  function panneau3d(oui) { const p = $('#sans3d'); if (p) p.hidden = !oui; document.body.classList.toggle('sans-3d', !!oui); if (oui && EN_JEU[ecran]) quitter(); }

  // ─── orientation, taille, visibilité ───
  const mqPortrait = window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;
  const portrait = () => !!(mqPortrait && mqPortrait.matches && PCONTROLES.tactile);
  function taille() {
    const w = window.innerWidth, h = window.innerHeight;
    if (rendu3d) try { RENDU.taille(w, h); } catch (e) { signaler('rendu.taille', e); }
    try { PHUD.taille(w, h); } catch (e) { signaler('hud.taille', e); }
    try { PCONTROLES.taille(); } catch (e) { signaler('controles.taille', e); }
    if (portrait() && (ecran === 'partie' || ecran === 'compte')) pause();
  }

  // ─── les boutons ───
  function action(a, b) {
    switch (a) {
      case 'jouer': montrer('modes'); break;
      case 'titre': montrer('titre'); break;
      case 'lancer': lancer(); return;
      case 'reglages': retourReglages = ecran === 'pause' ? 'pause' : ecran; montrer('reglages'); break;
      case 'retour': montrer(retourReglages === 'pause' && jeu ? 'pause' : retourReglages === 'modes' ? 'modes' : 'titre'); break;
      case 'credits': montrer('credits'); break;
      case 'reprendre': reprendre(); break;
      case 'quitter': quitter(); break;
      case 'accueil': location.href = (window.PONCIN_ACCUEIL || '../') + '?app=accueil'; break; // ?app=accueil : l'accueil ne renvoie pas vers un jeu
      case 'recharger': location.reload(); break;
      case 'oups-menu': $('#oups').hidden = true; if (!rendu3d) panneau3d(true); else montrer('titre'); break;
      case 'opt': { const s = b.closest('.seg'); const k = s.dataset.opt, v = b.dataset.v; sauv.choix[k] = k === 'bots' ? +v : v; majModes(); sauver(); break; }
    }
    PSONS.ui(a === 'retour' || a === 'titre' ? 'retour' : 'tap');
  }
  function brancher() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      PSONS.debloquer(); action(b.dataset.a, b);
    });
    $$('#e-modes .seg[data-opt]').forEach((s) => s.querySelectorAll('button').forEach((b) => { b.dataset.a = 'opt'; }));
    brancherReglages();
    document.addEventListener('pointerdown', () => PSONS.debloquer(), { capture: true, passive: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false }); // Safari iOS : pas de zoom à deux doigts
    document.addEventListener('keydown', (e) => {
      PSONS.debloquer();
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (e.code === 'Escape') { if (ecran === 'pause') { e.stopPropagation(); reprendre(); } else if (ecran === 'reglages' || ecran === 'credits') action('retour'); else if (ecran === 'modes') action('titre'); }
      else if ((e.code === 'Enter' || e.code === 'Space') && ecran === 'fin') { e.preventDefault(); rejouer(); }
    });
    window.addEventListener('resize', taille); window.addEventListener('orientationchange', () => setTimeout(taille, 120));
    if (mqPortrait && mqPortrait.addEventListener) mqPortrait.addEventListener('change', taille);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (ecran === 'partie' || ecran === 'compte') pause(); PSONS.suspendre(true); sauver(); }
      else { PSONS.suspendre(false); if (jeu && (ecran === 'pause' || ecran === 'partie')) eveille(true); last = performance.now(); }
    });
    window.addEventListener('pagehide', sauver);
  }
  function rejouer() { PSONS.debloquer(); pleinEcran(); if (demarrerPartie(optsPartie || choixPartie(), true) && !PCONTROLES.tactile) PCONTROLES.verrouiller(); }

  // ─── démarrage ───
  let demarre = false;
  async function boot() {
    if (demarre) return; demarre = true; window.__poncinPret = true;
    // les modules des autres fichiers (UMD sur window, ou const du même script) : absents, le jeu le dit au lieu de planter
    J = typeof PJEU !== 'undefined' ? PJEU : null; A = typeof PARENE !== 'undefined' ? PARENE : null; RENDU = typeof PRENDU !== 'undefined' ? PRENDU : null;
    CARTEPROV = typeof PCARTEPROV !== 'undefined' ? PCARTEPROV : null; MONDE = typeof PMONDE !== 'undefined' ? PMONDE : null;
    sauv = lireSauv();
    const tactile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
    try { PCONTROLES.init($('#commandes'), { tactile, reglages: sauv.reglages, actions: { pause, scores: (on) => PHUD.scores(on), verrouPerdu: pause } }); } catch (e) { signaler('controles.init', e); }
    try { PHUD.init($('#hud'), { actions: { pause, rejouer, menu: quitter } }); } catch (e) { signaler('hud.init', e); }
    appliquerReglages(); brancher(); montrer('chargement');
    last = performance.now(); tFps = last; requestAnimationFrame(boucle);
    installerCrochets();
    carte = await chargerCarte();
    if (!carte) { oups('La carte de Poncin manque', 'Impossible de charger la carte. Vérifie ta connexion et recharge la page.'); return; }
    try { monde = MONDE ? MONDE.creer(carte) : null; } catch (e) { signaler('monde.creer', e); monde = null; }
    if (!monde) { oups('La carte de Poncin n’a pas pu se construire', 'Recharge la page pour réessayer.'); return; }
    try { PHUD.carte(carte, monde); } catch (e) { signaler('hud.carte', e); }
    rendu3d = init3d();
    if (!rendu3d) panneau3d(true);
    const cr = $('#credits-carte'); if (cr) cr.textContent = carte.source === 'provisoire' ? 'La carte affichée est provisoire : les vraies rues et les vrais bâtiments de Poncin arrivent avec les données IGN et OpenStreetMap.' : `Carte construite à partir des données ${carte.attribution || '© IGN – © contributeurs OpenStreetMap'}.`;
    taille(); montrer('titre');
  }
  function installerCrochets() {
    const etat = () => { const m = trouver('moi'); return { ecran, pret: !!monde, webgl: rendu3d, carte: carte ? carte.source || 'ign-osm' : null, partie: jeu ? { temps: jeu.temps, fini: fini(), entites: (jeu.entites || VIDE).length, vie: m ? m.vie : null, score: m && m.score ? Object.assign({}, m.score) : null } : null, erreurs: erreursTotal, derniereErreur }; };
    window.__poncin = {
      etat,
      demarrer: (o) => { o = o || {}; const ok = demarrerPartie(Object.assign(choixPartie(), o), !!o.compte); return ok ? etat() : null; },
      jeu: () => jeu,
      stats: () => { let r = null; try { r = rendu3d && RENDU.stats ? RENDU.stats : null; } catch (e) { r = null; } return { fps, ms: Math.round(msImage * 100) / 100, rendu: r, erreurs: erreursTotal, derniereErreur, elims, serie }; },
      entree: (e) => { force = e ? Object.assign(force || {}, e) : null; return force; },
      pas: (n) => { if (!jeu) return null; if (ecran === 'compte') { compteT = 0; elCompte().hidden = true; astuce(false); montrer('partie'); PCONTROLES.activer(true); } for (let i = 0; i < (n || 1) && jeu && !finTraitee; i++) pasPartie(1 / 60); return etat(); },
      joueur: () => trouver('moi'),
      tp: (x, z, yaw) => { const m = trouver('moi'); if (!m) return null; m.x = x; m.z = z; try { m.y = monde.hauteur(x, z); } catch (e) { /* rien */ } m.vy = 0; if (yaw != null) m.yaw = yaw; return m; },
      viser: (id) => { const m = trouver('moi'), c = trouver(id); if (!m || !c) return null; const dx = c.x - m.x, dz = c.z - m.z, oeil = m.accroupi ? (R ? R.JOUEUR.oeilAccroupi : 1) : (R ? R.JOUEUR.oeil : 1.6), dy = (c.y + 1.2) - (m.y + oeil); m.yaw = Math.atan2(-dx, -dz); m.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)); return { yaw: m.yaw, pitch: m.pitch }; },
      finir: () => {
        if (!jeu) return null;
        try { if (typeof jeu.finir === 'function') jeu.finir(); else jeu.temps = Math.max(jeu.temps || 0, (R ? R.MODES.arene.duree : 180) + 0.01); } catch (e) { signaler('finir', e); }
        if (ecran === 'compte') { compteT = 0; elCompte().hidden = true; montrer('partie'); }
        if (!finTraitee) pasPartie(1 / 60);
        if (!finTraitee) terminer(null);
        return etat();
      },
      menu: quitter, pause, reprendre, montrer, sauvegarde: () => JSON.parse(JSON.stringify(sauv)),
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  return { get ecran() { return ecran; }, montrer, pause, reprendre, quitter };
})();
