/* OPÉRATION PONCIN — le point d'entrée : écran titre sur le survol 3D de Poncin, choix du mode (Arène jouable seul ou « Avec les
   copains » en ligne ; Extraction, Jour / Nuit « bientôt »), réglages, crédits, pause, compte à rebours, la boucle de jeu (commandes →
   aide à la visée → simulation → effets, sons, HUD → image), la sauvegarde 'poncin.v1' (réglages, pseudo, records) et les crochets de
   test window.__poncin. En ligne (PENLIGNE) : créer un salon (code de 4 lettres, partager le lien …/poncin/?salle=CODE, copier le code)
   ou le rejoindre (code tapé, ou lien ouvert), le salon (joueurs, ping, voie ; l'hôte règle robots, niveau et format, et lance ; les
   autres disent « Prêt »), puis la même partie qu'en solo : jeu.etape vient du vrai PJEU chez l'hôte, de la façade chez les clients.
   Le joueur local est idMoi : 'moi' en solo, son id de salon en ligne. Voie réseau : 'supabase' si window.PONCIN_CONFIG est rempli,
   'local' sinon (ou avec ?reseau=local : entre onglets du même navigateur).
   Tout appel aux autres modules est gardé : sans Three.js ou sans WebGL, un panneau clair ; une erreur ne fige jamais l'écran.
   La boucle (conception § 2) : la partie avance par pas fixes de 1/60 s (PJEU.pasFixe, au plus 4 pas par image, au-delà le temps est
   perdu), en solo, chez l'hôte et chez le client ; les commandes sont lues une fois par image dans un cumul (PCONTROLES.lire) et
   chaque pas prend son entrée (PCONTROLES.consommer) ; l'image reçoit alpha (la fraction du pas en cours) pour interpoler. */
const PUI = (() => {
  'use strict';
  const CLE = 'poncin.v1', $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const R = typeof PREGLES !== 'undefined' ? PREGLES : null;
  let _compte = null; const elCompte = () => _compte || (_compte = $('#compte'));
  const DEFAUT = () => ({ v: 1, reglages: { sensibilite: 1, inverserY: false, gaucher: false, tirAuto: true, qualite: 'auto', balancement: 'normal', son: true, vibre: true, nom: '', pseudo: '' }, records: { arene: { meilleur: 0, parties: 0, eliminations: 0, victoires: 0, serie: 0 } }, choix: { format: 'solo', bots: 4, niveau: 'facile' }, derniere: 0 });
  let sauv = DEFAUT(), carte = null, monde = null, rendu3d = false, jeu = null, ecran = 'chargement', retourReglages = 'titre', avantPause = 'partie', optsPartie = null;
  let J, A, RENDU, CARTEPROV, MONDE; // les modules, résolus au démarrage
  let last = 0, tAnim = 0, compteT = 0, compteVu = -1, surDepuis = 0, erreursEtape = 0, erreursRendu = 0, erreursTotal = 0, derniereErreur = '', finTraitee = false, serie = 0, serieMax = 0, elims = 0;
  let fps = 0, nImages = 0, tFps = 0, msImage = 0, imagePause = 0;
  let entrees = { moi: null }; const VIDE = [];
  let force = null; // l'entrée imposée par les tests (window.__poncin.entree)
  // le pas fixe : PAS = 1/60 s, au plus 4 pas par image ; alpha = la fraction du pas en cours (gardée telle quelle quand la partie ne tourne pas)
  const PAS = 1 / 60, PAS_MAX = 4;
  let boucleFixe = null, alpha = 1, nPas = 0, manuel = false;
  // en ligne : le joueur local (son id de salon), le salon ouvert (PENLIGNE), la partie en cours
  let idMoi = 'moi', enLigne = false, ctl = null, partieL = null, ouverture = false, compteFin = 0, renduCoupe = false;
  const idSalon = 'j' + Math.random().toString(36).slice(2, 10);

  // ─── sauvegarde ───
  function lireSauv() {
    const d = DEFAUT(); let s = null;
    try { s = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1) return d;
    Object.assign(d.reglages, s.reglages || {}); Object.assign(d.records.arene, (s.records && s.records.arene) || {}); Object.assign(d.choix, s.choix || {}); d.derniere = s.derniere || 0;
    return d;
  }
  function pseudoParDefaut() { // tiré une fois (« Castor Turbo 42 »), gardé dans la sauvegarde
    if (!sauv.reglages.pseudo) { try { sauv.reglages.pseudo = typeof PENLIGNE !== 'undefined' ? PENLIGNE.pseudoAuHasard() : 'Joueur ' + Math.floor(Math.random() * 100); } catch (e) { sauv.reglages.pseudo = 'Joueur'; } sauver(); }
    return sauv.reglages.pseudo;
  }
  const pseudoJoueur = () => (sauv.reglages.nom || '').trim() || pseudoParDefaut();
  const couleurJoueur = () => { try { return PENLIGNE.couleurDe(pseudoJoueur()); } catch (e) { return '#FFC84A'; } };
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
    if (nom === 'copains') majCopains();
    if (nom === 'salon') majSalon();
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
      const v = typeof window.PONCIN_CARTE_V === 'string' && window.PONCIN_CARTE_V ? '?v=' + encodeURIComponent(window.PONCIN_CARTE_V) : ''; // la version de la carte : jamais une vieille copie en cache après une mise à jour
      const r = await fetch('carte/poncin.json' + v, ctl ? { signal: ctl.signal } : undefined); clearTimeout(t);
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
  const BALANCEMENTS = ['normal', 'doux', 'aucun'];
  function appliquerReglages() {
    const g = sauv.reglages;
    try { PCONTROLES.regler(g); } catch (e) { signaler('controles.regler', e); }
    try { PSONS.regler({ son: g.son, vibre: g.vibre }); } catch (e) { signaler('sons.regler', e); }
    if (BALANCEMENTS.indexOf(g.balancement) < 0) g.balancement = 'normal';
    try { if (typeof PRENDU !== 'undefined' && typeof PRENDU.reglages === 'function') PRENDU.reglages({ balancement: g.balancement }); } catch (e) { signaler('rendu.reglages', e); }
    document.body.classList.toggle('gaucher', !!g.gaucher);
  }
  function majReglages() {
    const g = sauv.reglages;
    $$('[data-r]').forEach((i) => {
      const k = i.dataset.r;
      if (i.type === 'checkbox') i.checked = !!g[k];
      else if (i.type === 'range') { i.value = g[k]; const o = i.parentNode.querySelector('output'); if (o) o.textContent = (+g[k]).toFixed(2).replace('.', ','); }
      else if (i.type === 'text') { i.value = g[k] || ''; if (k === 'nom') i.placeholder = pseudoParDefaut(); }
      else if (i.classList.contains('seg')) i.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(g[k]))));
    });
  }
  function brancherReglages() {
    $$('[data-r]').forEach((i) => {
      const k = i.dataset.r;
      if (i.classList.contains('seg')) i.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; sauv.reglages[k] = b.dataset.v; PSONS.ui('tap'); if (k === 'qualite' && rendu3d) try { RENDU.qualite(b.dataset.v); } catch (err) { signaler('rendu.qualite', err); } if (k !== 'qualite') appliquerReglages(); majReglages(); sauver(); });
      else i.addEventListener(i.type === 'range' || i.type === 'text' ? 'input' : 'change', () => {
        sauv.reglages[k] = i.type === 'checkbox' ? i.checked : i.type === 'range' ? +i.value : String(i.value).replace(/[<>]/g, '').slice(0, 20);
        if (i.type === 'checkbox') PSONS.ui('tap');
        appliquerReglages(); if (i.type !== 'text') majReglages(); sauver();
        if (k === 'nom' && ctl) { try { ctl.renommer(pseudoJoueur()); } catch (err) { signaler('pseudo', err); } } // dans un salon : les autres voient le nouveau pseudo
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
    const bc = $('#b-copains'); if (bc) { bc.disabled = !ok || typeof PENLIGNE === 'undefined'; bc.title = bc.disabled ? 'Le jeu en ligne n’est pas disponible' : ''; }
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
      if (ctl) quitterSalon(); // une partie seul : on quitte le salon éventuel
      jeu = J.creer({ monde, carte, mode: A, graine, options: { bots: o.bots, niveau: o.niveau, equipes: !!o.equipes } });
      const nom = (sauv.reglages.nom || '').trim() || 'Toi';
      idMoi = 'moi'; enLigne = false; partieL = null; entrees = { moi: null };
      jeu.ajouterJoueur({ id: 'moi', nom, couleur: '#FFC84A', equipe: o.equipes ? 0 : 'moi', humain: true });
    } catch (e) { signaler('jeu.creer', e); jeu = null; oups('La partie n’a pas pu démarrer', 'Recharge la page et réessaie.'); return false; }
    optsPartie = o; finTraitee = false; surDepuis = 0; erreursEtape = 0; serie = 0; serieMax = 0; elims = 0; force = null; remettrePas();
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
    const pe = $('#pause-enligne'); if (pe) pe.hidden = !enLigne;
    const m = trouver(idMoi); $('#pause-score').innerHTML = m && m.score ? `<span><b>${m.score.points || 0}</b> points</span><span><b>${m.score.kills || 0}</b> repeints</span><span><b>${m.score.morts || 0}</b> fois repeint</span>` : '';
  }
  function reprendre() {
    if (ecran !== 'pause' || !jeu) return;
    if (portrait()) return; // tourne d'abord le téléphone
    montrer(avantPause === 'compte' ? 'compte' : 'partie'); if (ecran === 'partie') PCONTROLES.activer(true); else { compteVu = -1; astuce(true); }
    if (!PCONTROLES.tactile) PCONTROLES.verrouiller();
    last = performance.now();
  }
  function quitter() { // la partie (et, en ligne, le salon) : retour au menu
    astuce(false); jeu = null; force = null; PCONTROLES.activer(false); eveille(false); try { PHUD.reinit(); } catch (e) { /* rien */ }
    if (ctl || enLigne) { quitterSalon(); montrer('copains'); } else montrer('titre');
  }
  function terminer(evFin) {
    if (finTraitee || !jeu) return;
    if (enLigne) { terminerEnLigne(evFin); return; }
    finTraitee = true;
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
  function remettrePas() { if (boucleFixe) boucleFixe.remettre(); alpha = 1; }
  function nouvelleBoucle() { // PJEU.pasFixe ; sans lui (module absent), la même règle ici
    if (J && typeof J.pasFixe === 'function') return J.pasFixe({ pas: PAS, max: PAS_MAX });
    let acc = 0; const EPS = PAS * 1e-6;
    return { pas: PAS, max: PAS_MAX, avancer(d, f) { if (d > 0) acc = Math.min(acc + d, PAS_MAX * PAS); while (acc >= PAS - EPS) { acc -= PAS; if (acc < 0) acc = 0; f(PAS); } return acc / PAS; }, remettre() { acc = 0; }, get acc() { return acc; } };
  }
  function pasJeu(dt) { if (jeu && !finTraitee) pasPartie(dt); } // un pas de la boucle (la partie a pu finir au pas d'avant)
  function pasPartie(dt) { // un pas de simulation (1/60 s) : son entrée, aide à la visée, jeu, effets, sons, HUD
    const e = PCONTROLES.consommer(); nPas++;
    if (force) { // l'entrée imposée par les tests
      if (force.avant != null) e.avant = force.avant; if (force.cote != null) e.cote = force.cote; if (force.tir != null) e.tir = force.tir; if (force.accroupi != null) e.accroupi = force.accroupi;
      if (force.dyaw) { e.dyaw += force.dyaw; force.dyaw = 0; } if (force.dpitch) { e.dpitch += force.dpitch; force.dpitch = 0; }
      if (force.saut) { e.saut = true; force.saut = false; } if (force.recharge) { e.recharge = true; force.recharge = false; } if (force.arme) { e.arme = force.arme; force.arme = null; }
    }
    let aide = null;
    if (jeu.aideVisee) { try { aide = jeu.aideVisee(idMoi, PCONTROLES.tactile ? 1 : 0); } catch (err) { aide = null; } }
    if (aide && PCONTROLES.tactile && PCONTROLES.actif) { // (en ligne, la partie continue pendant la pause : pas de tir auto)
      const ral = Math.max(0, Math.min(0.9, +aide.ralentir || 0)); e.dyaw *= 1 - ral; e.dpitch *= 1 - ral; // la visée ralentit sur une cible
      const bouge = e.dyaw !== 0 || e.dpitch !== 0 || e.avant !== 0 || e.cote !== 0 || e.tir;
      if (bouge) { const lim = 0.0436 * dt * 3; e.dyaw += Math.max(-lim, Math.min(lim, +aide.dyaw || 0)); e.dpitch += Math.max(-lim, Math.min(lim, +aide.dpitch || 0)); } // et s'aimante doucement, seulement quand on joue
      if (PCONTROLES.reglages.tirAuto && aide.surCible) { surDepuis += dt; if (surDepuis >= 0.12) e.tir = true; } else surDepuis = 0; // tir auto après ~120 ms sur la cible
    } else surDepuis = 0;
    entrees[idMoi] = e;
    let evs;
    try { evs = jeu.etape(dt, entrees) || VIDE; erreursEtape = 0; }
    catch (err) { signaler('jeu.etape', err); evs = VIDE; if (++erreursEtape >= 3) { quitter(); oups('La partie s’est emmêlé les pinceaux', 'Une erreur a interrompu la partie. Tu peux en relancer une depuis le menu.'); } return; }
    traiter(evs, aide);
  }
  function traiter(evs, aide) { // les événements d'un pas (ou de avantImage) : image, sons, HUD, fin
    if (rendu3d) { try { RENDU.evenements(evs, jeu); } catch (err) { signaler('rendu.evenements', err); } }
    try { PSONS.evenements(evs, jeu, idMoi); } catch (err) { signaler('sons', err); }
    try { PHUD.maj(jeu, idMoi, evs, aide); } catch (err) { signaler('hud.maj', err); }
    try { PCONTROLES.maj(jeu, trouver(idMoi)); } catch (err) { signaler('controles.maj', err); }
    let evFin = null;
    for (let i = 0; i < evs.length; i++) { const v = evs[i]; if (v.t === 'mort') { if (v.par === idMoi && v.a !== idMoi) { elims++; serie++; if (serie > serieMax) serieMax = serie; } if (v.a === idMoi) serie = 0; } else if (v.t === 'fin') evFin = v; }
    if (evFin || fini()) terminer(evFin);
  }
  function boucle(now) {
    requestAnimationFrame(boucle);
    if (manuel) { last = now; return; } // les tests mènent les images eux-mêmes (window.__poncin.images)
    image((now - last) / 1000, now);
  }
  function image(dtBrut, now) { // une image : commandes (cumul), pas fixes de la partie, puis le rendu avec alpha
    const t0 = performance.now();
    dtBrut = dtBrut > 0 ? Math.min(1, dtBrut) : 0; // la boucle fixe borne d'elle-même à 4 pas ; le rendu garde son pas borné à 50 ms
    const dt = Math.min(0.05, dtBrut); last = now; tAnim += dt;
    nImages++; if (now - tFps > 1000) { fps = Math.round(nImages * 1000 / (now - tFps)); nImages = 0; tFps = now; }
    try {
      // en ligne, la partie ne s'arrête pas pendant la pause (commandes neutres) ; le compte à rebours commun non plus
      const enPause = enLigne && (ecran === 'pause' || (ecran === 'reglages' && retourReglages === 'pause'));
      if (enLigne && compteT > 0) compteT = (compteFin - now) / 1000; // le compte à rebours commun suit l'horloge, pas les images
      if (enPause && compteT <= 0 && avantPause === 'compte') avantPause = 'partie';
      if ((ecran === 'partie' || (enPause && compteT <= 0)) && jeu && !finTraitee) {
        PCONTROLES.lire(); // une fois par image : le cumul
        if (!boucleFixe) boucleFixe = nouvelleBoucle();
        alpha = boucleFixe.avancer(dtBrut, pasJeu);
        if (enLigne && jeu && !finTraitee && typeof jeu.avantImage === 'function') { // le client : horloge et interpolation des autres, à chaque image
          let evs = null; try { evs = jeu.avantImage(performance.now()); } catch (err) { signaler('jeu.avantImage', err); evs = null; }
          if (evs && evs.length && jeu) traiter(evs, null);
        }
      } else if (ecran === 'compte' && jeu) {
        if (!enLigne) compteT -= dt; const n = Math.ceil(compteT - 0.6);
        if (n !== compteVu) { compteVu = n; const c = elCompte(); c.hidden = false; c.firstElementChild.textContent = n > 0 ? String(n) : 'Repeins !'; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); c.classList.toggle('go', n <= 0); PSONS.compte(n); }
        try { PHUD.maj(jeu, idMoi, VIDE, null); PCONTROLES.maj(jeu, trouver(idMoi)); } catch (err) { signaler('hud.maj', err); }
        if (compteT <= 0) { elCompte().hidden = true; astuce(false); montrer('partie'); PCONTROLES.activer(true); PHUD.annonce(optsPartie && optsPartie.equipes ? (enLigne ? annonceEquipe() : 'Deux contre deux : couvre ton robot allié !') : `Premier à ${R ? R.MODES.arene.scoreVictoire : 25} repeints !`); }
      }
      if (ecran !== 'compte' && !elCompte().hidden) { elCompte().hidden = true; astuce(false); }
    } catch (err) { signaler('boucle', err); }
    if (rendu3d && !renduCoupe) {
      const enJeu = jeu && (EN_JEU[ecran] || ecran === 'reglages' && retourReglages === 'pause');
      const fige = ecran === 'pause' || ecran === 'reglages';
      if (!fige || (imagePause++ % 3) === 0) { // en pause, une image sur trois suffit
        try { RENDU.image(enJeu ? jeu : null, enJeu ? idMoi : null, ecran === 'compte' || (fige && !enLigne) ? 0 : dt, tAnim, enJeu ? alpha : 1); erreursRendu = 0; }
        catch (err) { signaler('rendu.image', err); if (++erreursRendu > 90) { rendu3d = false; panneau3d(true); } }
      }
    }
    msImage = msImage * 0.9 + (performance.now() - t0) * 0.1;
    return alpha;
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
      case 'modes': montrer('modes'); break;
      case 'copains': montrer('copains'); break;
      case 'creer': ouvrirSalon(null); break;
      case 'rejoindre': { const c = codeTape(); if (!c) { noteCopains('Le code a 4 lettres (des consonnes), par exemple <b>BKRT</b>.', true); break; } ouvrirSalon(c); break; }
      case 'salon-quitter': quitterSalon(); montrer('copains'); break;
      case 'partager': partager(); break;
      case 'copier': copier(ctl ? ctl.code : '', 'Code copié : '); break;
      case 'salon-action': actionSalon(); break;
      case 'sopt': { if (!ctl || !ctl.estHote) return; const s = b.closest('.seg'), k = s.dataset.sopt, v = b.dataset.v; ctl.regler({ [k]: k === 'bots' ? +v : k === 'equipes' ? v === '1' : v }); majSalon(); break; }
    }
    PSONS.ui(a === 'retour' || a === 'titre' ? 'retour' : 'tap');
  }
  function brancher() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      PSONS.debloquer(); try { action(b.dataset.a, b); } catch (err) { signaler('bouton ' + b.dataset.a, err); }
    });
    $$('#e-modes .seg[data-opt]').forEach((s) => s.querySelectorAll('button').forEach((b) => { b.dataset.a = 'opt'; }));
    $$('#e-salon .seg[data-sopt]').forEach((s) => s.querySelectorAll('button').forEach((b) => { b.dataset.a = 'sopt'; }));
    const champCode = $('#code-salon');
    if (champCode) {
      champCode.addEventListener('input', () => { const v = champCode.value.toUpperCase().replace(/[^BCDFGHJKLMNPQRSTVWXZ]/g, '').slice(0, 4); if (v !== champCode.value) champCode.value = v; });
      champCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); action('rejoindre', champCode); } });
    }
    brancherReglages();
    document.addEventListener('pointerdown', () => PSONS.debloquer(), { capture: true, passive: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false }); // Safari iOS : pas de zoom à deux doigts
    document.addEventListener('keydown', (e) => {
      PSONS.debloquer();
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (e.code === 'Escape') { if (ecran === 'pause') { e.stopPropagation(); reprendre(); } else if (ecran === 'reglages' || ecran === 'credits') action('retour'); else if (ecran === 'modes') action('titre'); else if (ecran === 'copains') action('modes'); }
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
  function rejouer() {
    PSONS.debloquer(); pleinEcran();
    if (enLigne || ctl) { if (ctl && ctl.estHote) { const r = ctl.lancer(); if (r !== true) toast(String(r)); } return; } // en ligne, seul l'hôte relance
    if (demarrerPartie(optsPartie || choixPartie(), true) && !PCONTROLES.tactile) PCONTROLES.verrouiller();
  }

  // ═══════════════════════════════ en ligne : salons et parties entre copains ═══════════════════════════════
  const LETTRES_CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
  const configEnLigne = () => { const c = window.PONCIN_CONFIG; return !!(c && c.supabaseUrl && c.supabaseKey); };
  const reseauForce = () => { try { const v = new URLSearchParams(location.search).get('reseau'); return v === 'local' || v === 'webrtc-local' ? v : null; } catch (e) { return null; } }; // essais : entre onglets
  const localForce = () => !!reseauForce();
  const viaReseau = () => reseauForce() || (configEnLigne() ? 'supabase' : 'local');
  function codeTape() { const i = $('#code-salon'), v = i ? i.value.toUpperCase().trim() : ''; return LETTRES_CODE.test(v) ? v : null; }
  function noteCopains(html, erreur) { const n = $('#cp-note'); if (!n) return; n.innerHTML = html || ''; n.classList.toggle('erreur', !!erreur); }
  function majCopains(garderNote) {
    const p = $('#moi-pseudo'), c = $('#moi-couleur'); if (p) p.textContent = pseudoJoueur(); if (c) c.style.background = couleurJoueur();
    const ok = typeof PENLIGNE !== 'undefined' && typeof PRESEAU !== 'undefined' && !!monde;
    ['#b-creer', '#b-rejoindre'].forEach((s) => { const b = $(s); if (b) b.disabled = !ok || ouverture; });
    if (ouverture || garderNote) return;
    if (!ok) noteCopains('Le jeu en ligne n’est pas disponible sur cette page.', true);
    else if (localForce()) noteCopains(`Voie ${reseauForce() === 'local' ? 'locale' : 'WebRTC locale'} (essais) : seulement entre les onglets de ce navigateur.`);
    else if (!configEnLigne()) noteCopains('Le jeu en ligne n’est pas encore configuré ici : seuls les onglets de ce navigateur peuvent jouer ensemble.', true);
    else noteCopains('2 à 4 joueurs, chacun sur son téléphone, en 4G ou en wifi.');
  }
  async function ouvrirSalon(code) {
    if (ctl || ouverture) return;
    if (typeof PENLIGNE === 'undefined' || !monde) { majCopains(); return; }
    ouverture = true; majCopains(); noteCopains(code ? `Connexion au salon <b>${code}</b>…` : 'Création du salon…');
    let c = null, trop = false;
    const lent = setTimeout(() => { if (ouverture) noteCopains(`${code ? `Connexion au salon <b>${code}</b>` : 'Création du salon'}… (en 4G, ça peut prendre quelques secondes)`); }, 5000);
    try {
      const ouv = PENLIGNE.ouvrir({ via: viaReseau(), code: code || null, moi: { id: idSalon, pseudo: pseudoJoueur(), couleur: couleurJoueur() }, config: window.PONCIN_CONFIG || null, monde, carte });
      c = await Promise.race([ouv, new Promise((r) => setTimeout(() => { trop = true; r(null); }, 25000))]);
      if (trop) { ouv.then((x) => { try { if (x) x.quitter(); } catch (e) { /* rien */ } }, () => {}); throw new Error('le serveur ne répond pas'); } // arrivé trop tard : on le referme
    } catch (e) {
      c = null; console.warn('[Poncin] salon', e);
      const msg = e && e.message ? String(e.message).replace(/[<>&]/g, '').trim() : '';
      noteCopains(`Impossible d’ouvrir le salon${msg ? ' : ' + msg : '.'}${/réessa/i.test(msg) ? '' : ' Vérifie ta connexion et réessaie.'}`, true);
    }
    clearTimeout(lent); ouverture = false;
    if (!c) { majCopains(true); return; }
    ctl = c; brancherSalon(c);
    montrer('salon');
    if (code && c.estHote && c.joueurs().length < 2) toast(`Personne dans le salon ${code} pour l’instant : tu en es l’hôte. Vérifie le code, ou partage-le !`);
  }
  function brancherSalon(c) {
    c.sur('maj', () => { if (c !== ctl) return; if (ecran === 'salon') majSalon(); });
    c.sur('partie', (P) => { if (c !== ctl) return; demarrerEnLigne(P); });
    c.sur('salon', () => { if (c !== ctl) return; jeu = null; partieL = null; enLigne = false; finTraitee = false; force = null; astuce(false); PCONTROLES.activer(false); eveille(false); try { PHUD.reinit(); } catch (e) { /* rien */ } montrer('salon'); });
    c.sur('ferme', (d) => { if (c !== ctl) return; ctl = null; partieL = null; if (enLigne || ecran === 'salon') { enLigne = false; jeu = null; try { PHUD.reinit(); } catch (e) { /* rien */ } montrer('copains'); noteCopains(d && d.raison === 'carte' ? 'Ta carte de Poncin n’est pas celle de l’hôte : rechargez la page tous les deux, puis recréez le salon.' : 'Le salon a été fermé.', true); } });
  }
  function quitterSalon() { const c = ctl; ctl = null; partieL = null; enLigne = false; if (c) { try { c.quitter(); } catch (e) { console.warn('[Poncin] quitter le salon', e); } } }
  const VOIES = { local: 'même appareil', hote: 'hôte', p2p: 'direct', webrtc: 'direct', direct: 'direct', relais: 'relais', supabase: 'relais', faux: 'essai' };
  const echap = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function majSalon() {
    if (!ctl) return;
    const js = ctl.joueurs(), hote = ctl.estHote, g = ctl.reglages, moi = js.find((j) => j.moi) || {};
    const code = $('#salon-code'); if (code) code.textContent = ctl.code;
    const nb = $('#salon-nb'); if (nb) nb.textContent = `(${js.length})`;
    const l = $('#salon-liste');
    if (l) l.innerHTML = js.map((j) => `<li class="${j.moi ? 'moi' : ''}"><i class="pastille" style="background:${echap(j.couleur || '#ccc')}"></i><span class="sj-nom">${echap(j.pseudo)}${j.moi ? ' <small>(toi)</small>' : ''}</span>`
      + `<span class="sj-info">${j.hote ? '' : j.ping != null ? `${j.ping} ms` : '…'}${j.voie && !j.hote ? `<br>${echap(VOIES[j.voie] || j.voie)}` : ''}</span>`
      + `<span class="sj-etat${j.hote ? ' hote' : j.pret ? ' pret' : ''}">${j.hote ? 'Hôte' : j.pret ? 'Prêt' : '…'}</span></li>`).join('')
      + (js.length < 2 ? '<li class="vide">En attente des copains…</li>' : '');
    const val = { bots: String(g.bots), niveau: g.niveau, equipes: g.equipes ? '1' : '0' };
    $$('#e-salon .seg[data-sopt]').forEach((s) => s.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.v === val[s.dataset.sopt])); b.disabled = !hote; }));
    const reg = $('.salon-reglages'); if (reg) reg.classList.toggle('lecture', !hote);
    const etat = $('#salon-etat'), bouton = $('#b-salon-action');
    const prets = js.filter((j) => !j.hote && j.pret).length, autres = js.length - 1;
    if (hote) {
      if (etat) etat.textContent = js.length < 2 ? 'Donne le code aux copains : la partie se lance à partir de 2 joueurs.' : `${prets}/${autres} copain${autres > 1 ? 's' : ''} prêt${prets > 1 ? 's' : ''}. Tu lances quand tu veux ; garde le jeu ouvert pendant la partie : c’est ton téléphone qui la fait tourner.`;
      if (bouton) { bouton.textContent = 'Lancer la partie'; bouton.disabled = js.length < 2; bouton.removeAttribute('aria-pressed'); }
    } else {
      if (etat) etat.textContent = ctl.enJeu ? 'Une partie est en cours : tu joueras à la suivante.' : 'L’hôte règle la partie et la lance.';
      if (bouton) { bouton.textContent = moi.pret ? 'Prêt !' : 'Je suis prêt'; bouton.disabled = false; bouton.setAttribute('aria-pressed', String(!!moi.pret)); }
    }
  }
  function actionSalon() {
    if (!ctl) return;
    if (ctl.estHote) { pleinEcran(); const r = ctl.lancer(); if (r !== true) toast(String(r)); }
    else { const moi = ctl.joueurs().find((j) => j.moi); if (!(moi && moi.pret)) pleinEcran(); ctl.pret(!(moi && moi.pret)); majSalon(); } // « Prêt » : le geste qui met en plein écran (Android)
  }
  let toastT = 0;
  function toast(texte) { const t = $('#salon-toast'); if (!t) return; t.textContent = texte; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500); }
  function lienSalon() {
    const u = location.origin + location.pathname + '?salle=' + (ctl ? ctl.code : '') + (reseauForce() ? '&reseau=' + reseauForce() : '');
    return u;
  }
  async function copier(texte, prefixe) {
    if (!texte) return;
    let ok = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texte); ok = true; } } catch (e) { ok = false; }
    toast(ok ? prefixe + texte : texte); // sans presse-papiers : on l'affiche (sélectionnable)
  }
  async function partager() {
    if (!ctl) return;
    const url = lienSalon(), texte = `Viens jouer à Opération Poncin avec moi ! Code du salon : ${ctl.code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Opération Poncin', text: texte, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copier(url, 'Lien copié : ');
  }
  function demarrerEnLigne(P) { // le lancement reçu (ou décidé, chez l'hôte) : compte à rebours commun, puis la partie
    try {
      if (!P || !P.jeu) return;
      astuce(false);
      jeu = P.jeu; idMoi = P.idMoi; enLigne = true; partieL = P; entrees = {}; entrees[idMoi] = null;
      const eq = !!(jeu.options && jeu.options.equipes);
      optsPartie = { equipes: eq, enLigne: true }; finTraitee = false; surDepuis = 0; erreursEtape = 0; serie = 0; serieMax = 0; elims = 0; force = null; remettrePas();
      try { PHUD.reinit({ equipes: eq }); } catch (e) { signaler('hud.reinit', e); }
      try { PCONTROLES.reinit(); } catch (e) { signaler('controles.reinit', e); }
      compteT = Math.max(0.5, +P.dans || 3.6); compteFin = performance.now() + compteT * 1000; compteVu = -1; montrer('compte'); PCONTROLES.activer(false); astuce(true);
      eveille(true);
    } catch (e) { signaler('partie en ligne', e); }
  }
  function terminerEnLigne(evFin) {
    finTraitee = true; PCONTROLES.activer(false); eveille(false); astuce(false);
    let res = evFin && evFin.resultat ? evFin.resultat : partieL && partieL.resultat ? partieL.resultat : null;
    if (!res) { try { res = A.resultat(jeu); } catch (e) { res = evFin && evFin.classement ? { classement: evFin.classement } : null; } }
    const raison = res && res.raison, hote = !!(ctl && ctl.estHote) && ctl.joueurs().length >= 2; // relancer : l'hôte, à deux au moins
    const message = raison === 'hote' ? 'L’hôte a quitté la partie' : raison === 'exclu' ? 'Tu as été déconnecté de la partie' : '';
    const boutons = hote ? [{ fin: 'rejouer', texte: 'Rejouer', cls: 'menthe' }, { fin: 'salon', texte: 'Salon', cls: 'blanc' }, { fin: 'menu', texte: 'Quitter', cls: 'blanc' }]
      : [{ fin: 'salon', texte: 'Salon', cls: 'menthe' }, { fin: 'menu', texte: 'Quitter', cls: 'blanc' }];
    let r = null;
    try { r = PHUD.fin(res, jeu, idMoi, { mode: 'Arène entre copains', message, boutons, titre: raison ? 'Partie interrompue' : '', attente: hote ? '' : raison ? 'Retourne au salon pour en lancer une autre.' : 'Si l’hôte relance, tu repars directement avec lui.' }); } catch (e) { signaler('hud.fin', e); }
    PSONS.jouer(r && r.gagne ? 'victoire' : 'defaite'); if (r && r.gagne) PSONS.vibrer([20, 40, 20, 40, 60]);
    montrer('fin');
  }
  function annonceEquipe() { const m = trouver(idMoi), j = !m || m.equipe !== 1; return `Équipe ${j ? 'jaune' : 'rose'} : repeins l’équipe ${j ? 'rose' : 'jaune'} !`; }
  function auSalon() { if (ctl) ctl.retourSalon(); else quitter(); }

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
    try { PHUD.init($('#hud'), { actions: { pause, rejouer, menu: quitter, salon: () => auSalon() } }); } catch (e) { signaler('hud.init', e); }
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
    const at = $('#e-credits .attribution'); if (at && carte.attribution) at.textContent = String(carte.attribution); // la carte cite ses sources (IGN : BD ORTHO, BD TOPO, RGE ALTI, LiDAR HD ; OSM)
    const cr = $('#credits-carte'); if (cr) cr.textContent = carte.source === 'provisoire' ? 'La carte affichée est provisoire : les vraies rues et les vrais bâtiments de Poncin arrivent avec les données IGN et OpenStreetMap.' : carte.attribution ? 'Le relief, les bâtiments et leurs matériaux, la photo aérienne et les arbres (mesurés au LiDAR) viennent de l’IGN ; les rues, les noms et les commerces, d’OpenStreetMap.' : 'Carte construite à partir des données © IGN – © contributeurs OpenStreetMap.';
    taille(); montrer('titre');
    // ouvert par un lien d'invitation …/poncin/?salle=CODE : droit au salon
    let salle = ''; try { salle = (new URLSearchParams(location.search).get('salle') || '').toUpperCase(); } catch (e) { salle = ''; }
    if (LETTRES_CODE.test(salle) && rendu3d) { montrer('copains'); const i = $('#code-salon'); if (i) i.value = salle; ouvrirSalon(salle); }
  }
  function installerCrochets() {
    const etat = () => { const m = trouver(idMoi); return { ecran, pret: !!monde, webgl: rendu3d, carte: carte ? carte.source || 'ign-osm' : null, enLigne, idMoi, partie: jeu ? { temps: jeu.temps, fini: fini(), entites: (jeu.entites || VIDE).length, vie: m ? m.vie : null, score: m && m.score ? Object.assign({}, m.score) : null } : null, erreurs: erreursTotal, derniereErreur }; };
    const etatEnLigne = () => {
      const P = partieL, j = jeu;
      return { ecran, via: ctl ? ctl.via : null, code: ctl ? ctl.code : null, estHote: ctl ? ctl.estHote : false, idMoi: ctl ? ctl.idMoi : idMoi, enLigne, joueurs: ctl ? ctl.joueurs() : [], reglages: ctl ? Object.assign({}, ctl.reglages) : null, enJeu: ctl ? ctl.enJeu : false,
        partie: P && j ? { k: P.k, hote: P.estHote, temps: j.temps, fini: fini(), entites: (j.entites || VIDE).map((e) => ({ id: e.id, nom: e.nom, bot: !!e.bot, x: e.x, y: e.y, z: e.z, vie: e.vie, vivant: e.vivant, kills: e.score.kills, morts: e.score.morts, points: e.score.points })) } : null,
        fil: Array.from(document.querySelectorAll('#hud .h-fil-l')).map((d) => d.textContent), erreurs: erreursTotal, derniereErreur, reseau: typeof PENLIGNE !== 'undefined' ? { erreurs: PENLIGNE.erreurs, derniereErreur: PENLIGNE.derniereErreur } : null };
    };
    window.__poncin = {
      etat,
      demarrer: (o) => { o = o || {}; const ok = demarrerPartie(Object.assign(choixPartie(), o), !!o.compte); return ok ? etat() : null; },
      jeu: () => jeu,
      stats: () => { let r = null; try { r = rendu3d && RENDU.stats ? RENDU.stats : null; } catch (e) { r = null; } return { fps, ms: Math.round(msImage * 100) / 100, rendu: r, erreurs: erreursTotal, derniereErreur, elims, serie }; },
      entree: (e) => { force = e ? Object.assign(force || {}, e) : null; return force; },
      pas: (n) => { if (!jeu) return null; if (ecran === 'compte') { compteT = 0; elCompte().hidden = true; astuce(false); montrer('partie'); PCONTROLES.activer(true); } for (let i = 0; i < (n || 1) && jeu && !finTraitee; i++) { PCONTROLES.lire(); pasPartie(PAS); } return etat(); }, // toujours n pas de 1/60 s
      // les tests mènent les images : manuel(true) arrête la boucle de requestAnimationFrame ; images([dt en s…], { remettre }) joue ces
      // images (commandes, pas fixes, rendu) et rend { pas, alpha, temps } ; compteurs() : pas faits depuis le chargement
      manuel: (oui) => { manuel = oui !== false; last = performance.now(); return manuel; },
      images: (dts, o) => { if (o && o.remettre && boucleFixe) boucleFixe.remettre(); const p0 = nPas; let t = last; for (let i = 0; i < (dts || VIDE).length; i++) { t += Math.max(0, +dts[i] || 0) * 1000; image(Math.max(0, +dts[i] || 0), t); } last = performance.now(); return { pas: nPas - p0, alpha, temps: jeu ? jeu.temps : null, acc: boucleFixe ? boucleFixe.acc : 0 }; },
      compteurs: () => ({ pas: nPas, alpha, acc: boucleFixe ? boucleFixe.acc : 0, pasDuree: PAS, max: PAS_MAX }),
      joueur: () => trouver(idMoi),
      tp: (x, z, yaw) => { const m = trouver(idMoi); if (!m) return null; m.x = x; m.z = z; try { m.y = monde.hauteur(x, z); } catch (e) { /* rien */ } m.vy = 0; if (yaw != null) m.yaw = yaw; return m; },
      viser: (id) => { const m = trouver(idMoi), c = trouver(id); if (!m || !c) return null; const dx = c.x - m.x, dz = c.z - m.z, oeil = m.accroupi ? (R ? R.JOUEUR.oeilAccroupi : 1) : (R ? R.JOUEUR.oeil : 1.6), dy = (c.y + 1.2) - (m.y + oeil); m.yaw = Math.atan2(-dx, -dz); m.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)); return { yaw: m.yaw, pitch: m.pitch }; },
      finir: () => {
        if (!jeu) return null;
        try { if (typeof jeu.finir === 'function') jeu.finir(); else jeu.temps = Math.max(jeu.temps || 0, (R ? R.MODES.arene.duree : 180) + 0.01); } catch (e) { signaler('finir', e); }
        if (ecran === 'compte') { compteT = 0; elCompte().hidden = true; montrer('partie'); }
        if (!finTraitee) pasPartie(1 / 60);
        if (!finTraitee) terminer(null);
        return etat();
      },
      menu: quitter, pause, reprendre, montrer, sauvegarde: () => JSON.parse(JSON.stringify(sauv)),
      enLigne: {
        etat: etatEnLigne,
        creer: async () => { await ouvrirSalon(null); return etatEnLigne(); },
        rejoindre: async (code) => { await ouvrirSalon(String(code || '').toUpperCase()); return etatEnLigne(); },
        regler: (o) => (ctl ? ctl.regler(o) : false), pret: (oui) => { if (ctl) ctl.pret(oui !== false); return etatEnLigne(); },
        lancer: () => (ctl ? ctl.lancer() : 'pas de salon'), quitter: () => { quitter(); return etatEnLigne(); },
        stats: () => (ctl ? ctl.stats() : null), salon: () => ctl,
        pseudo: (nom) => { sauv.reglages.nom = String(nom || '').replace(/[<>]/g, '').slice(0, 20); sauver(); if (ctl) ctl.renommer(pseudoJoueur()); if (ecran === 'copains') majCopains(); return pseudoJoueur(); },
      },
      rendu: (oui) => { renduCoupe = oui === false; return !renduCoupe; }, // les tests coupent la 3D des pages qu'ils ne photographient pas (la simulation continue)
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  return { get ecran() { return ecran; }, montrer, pause, reprendre, quitter };
})();
