/* OPÉRATION PONCIN — le point d'entrée : écran titre sur le survol 3D de Poncin, choix du mode (Arène jouable seul ou « Avec les
   copains » en ligne ; Extraction, Jour / Nuit « bientôt »), le panneau des réglages de la partie, commun au solo et au salon (onglets
   Carte : zone avec sa vignette sur la carte, heure, météo ; Partie : format, durée, score, vie, réapparition ou « dernier debout » en
   manches, tir allié, objets, aide à la visée ; Robots : nombre et niveau ; Armes : l'équipement, principale + secondaire, parmi les
   armes permises ; en solo c'est le joueur qui règle tout, dans un salon l'hôte, les autres le voient en lecture seule et ne choisissent
   que leur équipement), réglages du joueur (dont la sensibilité en visée, la visée en bascule ou maintenue, la course au joystick ou au
   bouton), crédits, pause, compte à rebours, la boucle de jeu (commandes → aide à la visée → simulation → effets, sons, HUD → image), la
   sauvegarde 'poncin.v2' (réglages, pseudo, records, équipement, choix.reglages : les réglages de partie du solo, choix.salon : ceux du
   salon que l'on mène ; reprise de 'poncin.v1' et des anciens choix format / bots / niveau / armes, dont une copie des records reste
   écrite pour la Salle de jeux) et les crochets de test window.__poncin. Le jeu reçoit toujours des réglages normalisés
   (PREGLES.normaliserReglages) : en solo PJEU.creer({ …, options: normaliserReglages(choix solo, { humains: 1 }) }).
   En ligne (PENLIGNE) : créer un salon (code de 4 lettres, partager le lien …/poncin/?salle=CODE, copier le code) ou le rejoindre (code
   tapé, ou lien ouvert), le salon (6 joueurs au plus, robots compris ; joueurs et leur équipement, ping, voie ; le résumé des réglages ;
   l'hôte règle et lance, les autres disent « Prêt »), puis la même partie qu'en solo : jeu.etape vient du vrai PJEU chez l'hôte, de la
   façade chez les clients.
   Réglages et équipement en ligne (par les fonctions de enligne.js / reseau.js) : chacun publie son équipement par la présence
   (ctl.equiper('p+s'), dans la présence : joueurs()[i].eq) ; l'hôte annonce TOUS ses réglages normalisés par ctl.regler(r) (le message
   'reglages' reprend ctl.reglages, ou les porte dans d.r) ; les autres les lisent dans ce message (ctl.salon.sur('reglages')) et dans
   ctl.reglages, normalisés ici avec le nombre de joueurs (repli tolérant : un champ absent prend le défaut).
   Le joueur local est idMoi : 'moi' en solo, son id de salon en ligne. Voie réseau : 'supabase' si window.PONCIN_CONFIG est rempli,
   'local' sinon (ou avec ?reseau=local : entre onglets du même navigateur).
   Tout appel aux autres modules est gardé : sans Three.js ou sans WebGL, un panneau clair ; une erreur ne fige jamais l'écran.
   La boucle (conception § 2) : la partie avance par pas fixes de 1/60 s (PJEU.pasFixe, au plus 4 pas par image, au-delà le temps est
   perdu), en solo, chez l'hôte et chez le client ; les commandes sont lues une fois par image dans un cumul (PCONTROLES.lire) et
   chaque pas prend son entrée (PCONTROLES.consommer) ; l'image reçoit alpha (la fraction du pas en cours) pour interpoler. */
const PUI = (() => {
  'use strict';
  const CLE = 'poncin.v2', CLE_V1 = 'poncin.v1', $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const R = typeof PREGLES !== 'undefined' ? PREGLES : null;
  let _compte = null; const elCompte = () => _compte || (_compte = $('#compte'));
  const equipDefaut = () => (R && R.DEFAUT_EQUIP ? { p: R.DEFAUT_EQUIP.p, s: R.DEFAUT_EQUIP.s } : { p: null, s: null });
  const armesDefaut = () => (R && R.DEFAUT_REGLAGES && Array.isArray(R.DEFAUT_REGLAGES.armes) ? R.DEFAUT_REGLAGES.armes.slice() : []);
  const MAX_JOUEURS = () => (R && R.SALON && R.SALON.max) || 6;
  // les réglages de partie par défaut : ceux de PREGLES ; en solo, des robots faciles pour commencer ; dans un salon, pas de robots
  function reglagesDefaut(salon) {
    const D = R && R.DEFAUT_REGLAGES ? R.DEFAUT_REGLAGES : { v: 2, mode: 'arene', zone: 'centre', duree: 180, score: 25, heure: 'jour', meteo: 'clair', equipes: false, bots: 4, niveau: 'normal', tirAllie: false, vie: 'normale', reapparition: 'rapide', manches: 3, objets: true, aide: true };
    const r = Object.assign({}, D, { armes: armesDefaut() });
    if (salon) r.bots = 0; else r.niveau = 'facile';
    return r;
  }
  function normaliser(r, humains) { // PREGLES.normaliserReglages (une copie bornée) ; sans lui, une copie telle quelle
    if (!R || !R.normaliserReglages) return Object.assign({}, r);
    try { return R.normaliserReglages(r, { humains: humains || 1 }); } catch (e) { signaler('reglages', e); return Object.assign({}, r); }
  }
  const DEFAUT = () => ({ v: 2, reglages: { sensibilite: 1, sensibiliteVisee: 1, visee: 'auto', course: 'joystick', inverserY: false, gaucher: false, tirAuto: true, qualite: 'auto', balancement: 'normal', son: true, vibre: true, nom: '', pseudo: '' },
    records: { arene: { meilleur: 0, parties: 0, eliminations: 0, victoires: 0, serie: 0 } }, choix: { equip: equipDefaut(), reglages: reglagesDefaut(false), salon: reglagesDefaut(true) }, derniere: 0 });
  let sauv = DEFAUT(), carte = null, monde = null, rendu3d = false, jeu = null, ecran = 'chargement', retourReglages = 'titre', avantPause = 'partie', optsPartie = null;
  let J, A, RENDU, CARTEPROV, MONDE; // les modules, résolus au démarrage
  let aideVue = null; // l'aide à la visée du dernier pas (le viseur « sur la cible » des images où avantImage rend des événements)
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
  function lireSauv() { // 'poncin.v2', sinon la reprise de 'poncin.v1' (réglages, records, choix)
    const d = DEFAUT(); let s = null;
    try { s = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 2) { let v1 = null; try { v1 = JSON.parse(localStorage.getItem(CLE_V1) || 'null'); } catch (e) { v1 = null; } s = v1 && v1.v === 1 ? v1 : null; }
    if (!s) return d;
    Object.assign(d.reglages, s.reglages || {}); Object.assign(d.records.arene, (s.records && s.records.arene) || {}); d.derniere = s.derniere || 0;
    const c = s.choix && typeof s.choix === 'object' ? s.choix : {}, objet = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
    // les réglages de partie : choix.reglages (solo) et choix.salon ; sinon repris des anciens choix (format, bots, niveau, armes, armesSalon)
    const solo = objet(c.reglages) ? c.reglages : Object.assign(reglagesDefaut(false), c.format != null ? { equipes: c.format === 'equipes' } : {}, c.bots != null ? { bots: +c.bots } : {}, c.niveau ? { niveau: c.niveau } : {}, Array.isArray(c.armes) ? { armes: c.armes } : {});
    const salon = objet(c.salon) ? c.salon : Object.assign(reglagesDefaut(true), Array.isArray(c.armesSalon) ? { armes: c.armesSalon } : {});
    d.choix.reglages = normaliser(Object.assign(reglagesDefaut(false), solo), 1); if (!(d.choix.reglages.bots > 0)) d.choix.reglages.bots = 1; // seul, au moins un robot
    d.choix.salon = normaliser(Object.assign(reglagesDefaut(true), salon), 1);
    d.choix.equip = equipValide(c.equip, d.choix.reglages.armes);
    return d;
  }
  // les armes permises et l'équipement, validés par PREGLES (une arme inconnue — l'arsenal a changé — prend le défaut)
  function armesValides(l) { if (!R) return Array.isArray(l) ? l.slice() : []; try { return R.armesPermises ? R.armesPermises(Array.isArray(l) ? l : armesDefaut()) : (Array.isArray(l) ? l : armesDefaut()).filter((id) => R.estArme(id)); } catch (e) { return armesDefaut(); } }
  function equipValide(q, armes) { if (!R || !R.equipementDe) return q && q.p ? { p: q.p, s: q.s } : equipDefaut(); try { return R.equipementDe(q || null, { armes: armesValides(armes) }); } catch (e) { return equipDefaut(); } }
  function pseudoParDefaut() { // tiré une fois (« Castor Turbo 42 »), gardé dans la sauvegarde
    if (!sauv.reglages.pseudo) { try { sauv.reglages.pseudo = typeof PENLIGNE !== 'undefined' ? PENLIGNE.pseudoAuHasard() : 'Joueur ' + Math.floor(Math.random() * 100); } catch (e) { sauv.reglages.pseudo = 'Joueur'; } sauver(); }
    return sauv.reglages.pseudo;
  }
  const pseudoJoueur = () => (sauv.reglages.nom || '').trim() || pseudoParDefaut();
  const couleurJoueur = () => { try { return PENLIGNE.couleurDe(pseudoJoueur()); } catch (e) { return '#FFC84A'; } };
  function sauver() {
    try {
      localStorage.setItem(CLE, JSON.stringify(sauv));
      localStorage.setItem(CLE_V1, JSON.stringify({ v: 1, reglages: sauv.reglages, records: sauv.records, derniere: sauv.derniere })); // la Salle de jeux lit les records ici
    } catch (e) { /* stockage indisponible : on joue quand même */ }
  }
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
    if (nom === 'options') { armesVues = ''; optVus = ''; vignetteVue = ''; majOptions(); }
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
    if (['auto', 'bascule', 'maintenir'].indexOf(g.visee) < 0) g.visee = 'auto';
    if (['joystick', 'bouton'].indexOf(g.course) < 0) g.course = 'joystick';
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
    // l'aide à la visée coupée (par l'hôte, ou dans les réglages de la partie) : le tir auto est grisé, avec la raison
    const coupee = jeu ? reglagesPartie().aide === false : ctl ? reglagesSalon().aide === false : false, ta = $('#reg-tirauto');
    if (ta) {
      const c = ta.querySelector('input'), sm = ta.querySelector('small'); ta.classList.toggle('coupee', coupee); if (c) c.disabled = coupee;
      if (sm) { if (!sm.dataset.texte) sm.dataset.texte = sm.textContent; sm.textContent = !coupee ? sm.dataset.texte : (ctl || enLigne) && !(ctl && ctl.estHote) ? 'Désactivée par l’hôte' : 'Aide à la visée coupée dans les réglages de la partie'; }
    }
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

  // ─── les libellés des réglages de partie ───
  const T = {
    zone: { place: 'Place Bichat', centre: 'Cœur du village', eglise: 'Autour de l’église', bourg: 'Tout le bourg', rivieres: 'Le Veyron', tout: 'Tout Poncin' },
    conseil: { place: '2 à 4 joueurs', centre: '2 à 6 joueurs', eglise: '2 à 4 joueurs', bourg: '4 à 6 joueurs', rivieres: '4 à 6 joueurs', tout: '6 joueurs' },
    heure: { jour: 'Jour', soir: 'Soir', nuit: 'Nuit' }, meteo: { clair: 'Clair', brouillard: 'Brouillard', pluie: 'Pluie' },
    vie: { normale: 'Normale', unCoup: 'Un coup', costaud: 'Costaud' },
    reapparition: { rapide: 'Rapide', normale: 'Normale', lente: 'Lente', aucune: 'Dernier debout' },
    niveau: { facile: 'Facile', normal: 'Normal', fort: 'Fort' }, robots: { facile: ['facile', 'faciles'], normal: ['malin', 'malins'], fort: ['redoutable', 'redoutables'] },
  };
  const SAL = (k, defaut) => (R && R.SALON && R.SALON[k] ? R.SALON[k] : defaut);
  const nomZone = (id) => { try { if (typeof PZONES !== 'undefined' && PZONES.NOMS && PZONES.NOMS[id]) return PZONES.NOMS[id]; } catch (e) { /* repli */ } return T.zone[id] || String(id || ''); };
  const pluriel = (n, mot, pl) => `${n} ${n > 1 ? pl || mot + 's' : mot}`;
  const dureeTxt = (d) => (d > 0 ? `${Math.round(d / 60)} min` : '∞');
  const robotsTxt = (r) => (r.bots > 0 ? `${pluriel(r.bots, 'robot')} ${(T.robots[r.niveau] || ['', ''])[r.bots > 1 ? 1 : 0]}` : 'Aucun robot');
  const delaiTxt = (r) => { const t = SAL('reapparitions', {})[r.reapparition]; return t > 0 ? `Retour au jeu au bout de ${t} s` : ''; };
  function partieTxt(r) { // « Chacun pour soi · 3 min · premier à 25 » ; « 2 équipes · dernier debout, 3 manches · un coup »
    return (r.equipes ? '2 équipes' : 'Chacun pour soi') + ' · ' + (r.reapparition === 'aucune' ? `dernier debout, ${pluriel(r.manches, 'manche')}` : `${r.duree > 0 ? dureeTxt(r.duree) : 'sans limite'} · premier à ${r.score}`)
      + (r.vie && r.vie !== 'normale' ? ' · ' + (T.vie[r.vie] || r.vie).toLowerCase() : '');
  }
  function descPartie(r) { // la phrase de la carte Arène
    return `${nomZone(r.zone)} : ` + (r.reapparition === 'aucune' ? `dernier debout en ${pluriel(r.manches, 'manche')}, sans réapparition.` : `${r.duree > 0 ? `${Math.round(r.duree / 60)} minutes` : 'sans limite de temps'}, le premier à ${r.score} repeints gagne.`);
  }
  function phraseSolo(r) {
    const b = r.bots, adj = (n) => (T.robots[r.niveau] || ['', ''])[n > 1 ? 1 : 0];
    if (r.equipes) { const al = Math.floor(b / 2), en = b - al; return al ? `Toi et ${pluriel(al, 'robot allié', 'robots alliés')} contre ${pluriel(en, 'robot')} ${adj(en)}.` : `Toi contre ${pluriel(en, 'robot')} ${adj(en)}, en équipes.`; }
    return `Toi contre ${pluriel(b, 'robot')} ${adj(b)}, chacun pour soi.`;
  }
  // le résumé des réglages (carte Arène du menu, salon) : une ligne par onglet du panneau, qui l'ouvre sur cet onglet
  const FLECHE = '<i class="rp-fl" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9.5 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></i>';
  function resumeHtml(r, q) {
    const ligne = (o, titre, val) => `<button type="button" class="rp-l" data-a="options" data-onglet="${o}"><b>${titre}</b><span class="rp-v">${val}</span>${FLECHE}</button>`;
    const tot = listeArmes('principale').length + listeArmes('secondaire').length, n = Array.isArray(r.armes) ? r.armes.length : tot;
    const armes = q && q.p ? `<span class="eq-ico">${icoA(q.p)}</span>${echapA(nomA(q.p))} + ${echapA(nomA(q.s))}${n < tot ? ` <small>${n}/${tot} permises</small>` : ''}` : '';
    return ligne('carte', 'Carte', echapA(`${nomZone(r.zone)} · ${T.heure[r.heure] || r.heure} · ${T.meteo[r.meteo] || r.meteo}`)) + ligne('partie', 'Partie', echapA(partieTxt(r)))
      + ligne('robots', 'Robots', echapA(robotsTxt(r))) + ligne('armes', 'Armes', armes);
  }

  // ─── choix du mode : la carte Arène résume les réglages du solo ───
  function majModes() {
    const r = reglagesSolo(), q = equipValide(sauv.choix.equip, r.armes);
    const rs = $('#resume-solo'), cle = JSON.stringify(r) + q.p + q.s; if (rs && rs._cle !== cle) { rs._cle = cle; rs.innerHTML = resumeHtml(r, q); }
    $('#resume-arene').textContent = phraseSolo(r);
    const d = $('#arene-desc'); if (d) d.textContent = descPartie(r);
    const ok = rendu3d && !!J && !!A; $('#b-lancer').disabled = !ok; $('#b-lancer').title = ok ? '' : 'La 3D n’est pas disponible';
    const bc = $('#b-copains'); if (bc) { bc.disabled = !ok || typeof PENLIGNE === 'undefined'; bc.title = bc.disabled ? 'Le jeu en ligne n’est pas disponible' : ''; }
  }
  function reglagesSolo() { const r = normaliser(sauv.choix.reglages, 1); if (!(r.bots > 0)) r.bots = 1; return r; } // seul : au moins un robot
  function choixPartie() { const r = reglagesSolo(); r.equip = equipValide(sauv.choix.equip, r.armes); return r; }

  // ─── le panneau des réglages de la partie : commun au solo et au salon (lecture seule chez ceux qui ne sont pas l'hôte) ───
  let optCtx = 'solo', onglet = 'carte', reglagesRecus = null, optVus = '', dernierAnnonce = '';
  const ONGLETS = ['carte', 'partie', 'robots', 'armes'];
  const enSalon = () => optCtx === 'salon' && !!ctl;
  const humainsSalon = () => { try { return ctl ? Math.max(1, Math.min(MAX_JOUEURS(), ctl.joueurs().length)) : 1; } catch (e) { return 1; } };
  const peutRegler = () => !enSalon() || !!ctl.estHote; // en solo le joueur, dans un salon l'hôte
  function reglagesSalon() { // chez l'hôte, les siens ; chez les autres, ceux qu'il annonce (message 'reglages' : d.r ou d ; ctl.reglages), un champ absent au défaut
    if (!ctl) return normaliser(sauv.choix.salon, 1);
    if (ctl.estHote) return normaliser(sauv.choix.salon, humainsSalon());
    const r = Object.assign(reglagesDefaut(true), reglagesRecus || {}), g = ctl.reglages || {};
    for (const k in g) if (g[k] != null) r[k] = g[k];
    return normaliser(r, humainsSalon());
  }
  const reglagesVus = () => (enSalon() ? reglagesSalon() : reglagesSolo());
  function annoncerReglages(forcer) { // l'hôte : tous ses réglages, normalisés avec le nombre de joueurs (robots ≤ 6 − joueurs), par ctl.regler
    if (!ctl || !ctl.estHote) return;
    const r = normaliser(sauv.choix.salon, humainsSalon()), sig = JSON.stringify(r);
    if (sig === dernierAnnonce && !forcer) return; dernierAnnonce = sig; // (ctl.regler émet 'maj', qui nous rappelle : rien de neuf, on s'arrête)
    try { ctl.regler(r); } catch (e) { signaler('réglages du salon', e); }
  }
  // une valeur des boutons (data-v) dans le type du réglage
  function lireValeur(k, v) { const d = reglagesDefaut(false)[k]; return typeof d === 'boolean' ? v === 'true' : typeof d === 'number' ? +v : v; }
  function regler(k, v) { // un réglage changé : sauvegardé (choix.reglages en solo, choix.salon dans un salon), annoncé par l'hôte
    if (!peutRegler()) return;
    const cle = enSalon() ? 'salon' : 'reglages', r = Object.assign({}, sauv.choix[cle]); r[k] = v;
    sauv.choix[cle] = normaliser(r, 1); sauver();
    if (cle === 'salon') { annoncerReglages(); if (k === 'armes') publierEquip(); }
    majOptions();
  }
  function parDefaut() { // tout revient au défaut, sauf les armes permises (elles ont leur onglet)
    if (!peutRegler()) return;
    const cle = enSalon() ? 'salon' : 'reglages', armes = (sauv.choix[cle] || {}).armes;
    sauv.choix[cle] = normaliser(Object.assign(reglagesDefaut(cle === 'salon'), Array.isArray(armes) ? { armes } : {}), 1); sauver();
    if (cle === 'salon') annoncerReglages();
    majOptions(); toast('Réglages remis par défaut.');
  }
  // les lignes de chaque onglet : [valeur, libellé] ; actif(r) : sinon grisée ; aide : la petite ligne sous le titre
  const LIGNES = {
    carte: [
      { k: 'heure', titre: 'Heure', vals: () => SAL('heures', ['jour', 'soir', 'nuit']).map((v) => [v, T.heure[v] || v]) },
      { k: 'meteo', titre: 'Météo', vals: () => SAL('meteos', ['clair', 'brouillard', 'pluie']).map((v) => [v, T.meteo[v] || v]) },
    ],
    partie: [ // en paysage, deux colonnes : Format | Tir allié ; Réapparition (toute la largeur) ; Manches | Durée ; Premier à | Vie ; Objets | Aide
      { k: 'equipes', titre: 'Format', vals: () => [[false, 'Chacun pour soi'], [true, '2 équipes']] },
      { k: 'tirAllie', titre: 'Tir allié', vals: () => [[false, 'Non'], [true, 'Oui']], actif: (r) => r.equipes, aide: (r) => (r.equipes ? (r.tirAllie ? 'Repeindre un équipier : −100 points' : 'Les équipiers ne se blessent pas') : 'En équipes seulement') },
      { k: 'reapparition', titre: 'Réapparition', vals: () => Object.keys(SAL('reapparitions', T.reapparition)).map((v) => [v, T.reapparition[v] || v]), aide: (r) => (r.reapparition === 'aucune' ? 'Pas de retour : le dernier en lice gagne la manche' : delaiTxt(r)) },
      { k: 'manches', titre: 'Manches', vals: () => SAL('manches', [1, 3, 5]).map((v) => [v, String(v)]), actif: (r) => r.reapparition === 'aucune', aide: (r) => (r.reapparition === 'aucune' ? 'Le plus de manches gagnées l’emporte' : 'Avec « Dernier debout »') },
      { k: 'duree', titre: 'Durée', vals: () => SAL('durees', [180, 300, 600, 0]).map((v) => [v, dureeTxt(v)]), aide: (r) => (r.duree > 0 ? '' : 'Sans limite de temps') },
      { k: 'score', titre: 'Premier à', vals: () => SAL('scores', [10, 25, 50]).map((v) => [v, String(v)]), actif: (r) => r.reapparition !== 'aucune', aide: (r) => (r.reapparition === 'aucune' ? 'Pas en « Dernier debout »' : 'repeints pour gagner') },
      { k: 'vie', titre: 'Vie', vals: () => Object.keys(SAL('vies', T.vie)).map((v) => [v, T.vie[v] || v]), aide: (r) => { const v = SAL('vies', {})[r.vie]; return v && v.vie ? `${v.vie} PV${v.armureMax ? `, armure ${v.armureMax}` : ', ni soin ni armure'}` : ''; } },
      { k: 'objets', titre: 'Objets au sol', vals: () => [[true, 'Oui'], [false, 'Non']], aide: () => 'Armes, soins, armures, munitions' },
      { k: 'aide', titre: 'Aide à la visée', vals: () => [[true, 'Permise'], [false, 'Coupée']], aide: (r) => (r.aide ? 'Au doigt : ralentit et tire tout seul' : 'Pour tout le monde, robots non compris') },
    ],
    robots: [
      { k: 'bots', titre: 'Robots', vals: (r, h) => { const max = MAX_JOUEURS() - h, l = []; for (let n = enSalon() ? 0 : 1; n <= MAX_JOUEURS() - 1; n++) l.push([n, String(n), n > max]); return l; }, aide: (r, h) => (enSalon() ? `${pluriel(h, 'joueur')} + ${pluriel(r.bots, 'robot')} (6 au plus)` : `Toi + ${pluriel(r.bots, 'robot')}`) },
      { k: 'niveau', titre: 'Niveau', vals: () => Object.keys(R && R.BOTS ? R.BOTS : T.niveau).map((v) => [v, T.niveau[v] || v]), actif: (r) => r.bots > 0, aide: (r) => ({ facile: 'Ils visent mal et réagissent lentement', normal: 'Des robots malins', fort: 'Rapides et précis' }[r.niveau] || '') },
    ],
  };
  function ligneHtml(L, r, peut, h) {
    const actif = !L.actif || L.actif(r), v = String(r[L.k]), aide = typeof L.aide === 'function' ? L.aide(r, h) : L.aide || '';
    return `<div class="opt op-l${actif ? '' : ' inactif'}" data-k="${L.k}"><span><b>${L.titre}</b>${aide ? `<small>${echapA(aide)}</small>` : ''}</span><div class="seg" role="group" aria-label="${echapA(L.titre)}">`
      + L.vals(r, h).map((x) => `<button type="button" data-a="oopt" data-k="${L.k}" data-v="${echapA(String(x[0]))}" aria-pressed="${String(x[0]) === v}"${!peut || !actif || x[2] ? ' disabled' : ''}>${echapA(x[1])}</button>`).join('') + '</div></div>';
  }
  function majOptions() {
    if (ecran !== 'options') return;
    if (ONGLETS.indexOf(onglet) < 0) onglet = 'carte';
    const r = reglagesVus(), peut = peutRegler(), h = enSalon() ? humainsSalon() : 1, e = $('#e-options');
    $$('#e-options [role="tab"]').forEach((b) => { const on = b.dataset.onglet === onglet; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $$('#e-options .op-page').forEach((p) => { p.hidden = p.dataset.page !== onglet; });
    e.classList.toggle('lecture', !peut); e.dataset.onglet = onglet;
    const t = $('#op-titre'); if (t) t.textContent = enSalon() ? 'Le salon' : 'Ta partie';
    const lec = $('#op-lecture'); if (lec) lec.hidden = peut;
    const def = $('#op-defaut'); if (def) def.hidden = !peut || onglet === 'armes';
    const cle = [optCtx, peut, h, JSON.stringify(r)].join('|');
    if (cle !== optVus) {
      optVus = cle;
      for (const p of ['carte', 'partie', 'robots']) { const c = $(`#e-options [data-lignes="${p}"]`); if (c) c.innerHTML = LIGNES[p].map((L) => ligneHtml(L, r, peut, h)).join(''); }
      const z = $('#op-zones'); if (z) z.innerHTML = SAL('zones', Object.keys(T.zone)).map((id) => `<button type="button" class="op-zone" data-a="oopt" data-k="zone" data-v="${echapA(id)}" aria-pressed="${id === r.zone}"${peut ? '' : ' disabled'}><b>${echapA(nomZone(id))}</b><small>${echapA(T.conseil[id] || '')}</small></button>`).join('');
      const n = $('#op-robots-note'); if (n) n.textContent = enSalon() ? (peut ? 'Les robots complètent le salon : 6 joueurs au plus, robots compris.' : 'C’est l’hôte qui choisit les robots.') : 'Les robots s’équipent parmi les armes permises.';
    }
    if (onglet === 'carte') vignette(r.zone);
    if (onglet === 'armes') majArmes();
  }
  let vignetteVue = '';
  function vignette(zone) { // la zone sur la carte (PHUD.vignette peint la carte et la zone), repeinte si la zone ou la taille change
    const c = $('#op-vignette'); if (!c || !c.clientWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr), cle = zone + '|' + w + 'x' + h;
    const nom = $('#op-vignette-nom'); if (nom) nom.textContent = nomZone(zone);
    if (cle === vignetteVue) return; vignetteVue = cle;
    c.width = w; c.height = h;
    try { if (!PHUD.vignette || !PHUD.vignette(c, zone)) { const g = c.getContext('2d'); g.fillStyle = '#D8EDC2'; g.fillRect(0, 0, w, h); } } catch (e) { signaler('vignette', e); }
  }
  function ouvrirOptions(o) { optCtx = ecran === 'salon' && ctl ? 'salon' : ecran === 'options' ? optCtx : 'solo'; onglet = ONGLETS.indexOf(o) >= 0 ? o : 'carte'; montrer('options'); }

  // ─── l'équipement : principale + secondaire, parmi les armes permises (l'onglet Armes ; solo : le joueur les coche ; salon : l'hôte) ───
  const echapA = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const nomA = (id) => { try { return PHUD.nomArme(id); } catch (e) { return String(id || ''); } };
  const icoA = (id) => { try { return PHUD.iconeArme(id); } catch (e) { return ''; } };
  const classeA = (id) => { try { return PHUD.nomClasse(PHUD.classeArme(id)); } catch (e) { return ''; } };
  function listeArmes(role) { return R && Array.isArray(R.ARMES) ? R.ARMES.filter((a) => a && a.id && a.role === role) : []; }
  const permisesSalon = () => armesValides(reglagesSalon().armes);
  const permises = () => armesValides(reglagesVus().armes);
  function carteArme(A, q, perm, hote) {
    const ok = perm.indexOf(A.id) >= 0, choisie = ok && (q.p === A.id || q.s === A.id);
    return `<div class="ar-carte${choisie ? ' choisie' : ''}${ok ? '' : ' interdite'}">
      <button type="button" class="ar-choisir" data-a="arme-choix" data-id="${echapA(A.id)}" aria-pressed="${choisie}"${ok ? '' : ' disabled'}><span class="ar-ico">${icoA(A.id)}</span><b>${echapA(nomA(A.id))}</b><small>${echapA(classeA(A.id))}${A.chargeur ? ` · ${A.chargeur} coups` : ''}</small>${ok ? '' : '<em>Pas permise</em>'}</button>
      ${hote ? `<button type="button" class="ar-permise" data-a="arme-permise" data-id="${echapA(A.id)}" aria-pressed="${ok}" aria-label="${ok ? 'Interdire' : 'Permettre'} : ${echapA(nomA(A.id))}" title="${ok ? 'Permise' : 'Pas permise'}"><i aria-hidden="true"></i></button>` : ''}</div>`;
  }
  let armesVues = '';
  function majArmes() {
    const perm = permises(), q = equipValide(sauv.choix.equip, perm), hote = peutRegler();
    const cle = [optCtx, hote, q.p, q.s, perm.join(',')].join('|'); if (cle === armesVues) return; // rien n'a changé : pas de nouveaux boutons sous le doigt
    armesVues = cle;
    const lp = $('#ar-principales'), ls = $('#ar-secondaires');
    if (lp) lp.innerHTML = listeArmes('principale').map((A) => carteArme(A, q, perm, hote)).join('');
    if (ls) ls.innerHTML = listeArmes('secondaire').map((A) => carteArme(A, q, perm, hote)).join('');
    const n = $('#ar-note');
    if (n) n.textContent = !enSalon() ? 'Touche une arme pour la prendre. La case verte : les armes permises (les robots s’équipent parmi elles).'
      : ctl.estHote ? 'Touche une arme pour la prendre. La case verte : les armes permises pour tout le salon.' : 'Touche une arme pour la prendre. C’est l’hôte qui choisit les armes permises.';
    $('#e-options').classList.toggle('permettre', hote);
  }
  function choisirArme(id) {
    if (!R || !R.estArme(id)) return;
    const perm = permises(); if (perm.indexOf(id) < 0) return;
    const q = equipValide(sauv.choix.equip, perm), A = R.arme(id);
    if (A.role === 'secondaire') q.s = id; else q.p = id;
    sauv.choix.equip = q; sauver(); majArmes();
    if (enSalon()) publierEquip();
  }
  function permettreArme(id) {
    if (!R || !R.estArme(id) || !peutRegler()) return;
    const perm = permises(), i = perm.indexOf(id);
    if (i >= 0) { const role = R.arme(id).role; if (perm.filter((x) => R.arme(x).role === role).length <= 1) { toast('Il faut au moins une arme par emplacement.'); return; } perm.splice(i, 1); } // au moins une principale et une secondaire
    else perm.push(id);
    regler('armes', armesValides(perm));
  }
  function publierEquip() { // l'équipement de chacun passe par la présence : ctl.equiper('p+s')
    if (!ctl) return;
    const q = equipValide(sauv.choix.equip, permisesSalon());
    try { if (typeof ctl.equiper === 'function') ctl.equiper(q.p + '+' + q.s); } catch (e) { signaler('équipement', e); }
  }
  function equipDe(j) { // l'équipement d'un joueur du salon : le mien, sinon celui de sa présence (s'il est publié)
    if (j.moi) return equipValide(sauv.choix.equip, permisesSalon());
    const e = j.eq; // la présence du joueur ('ak74+p226'), rendue par ctl.joueurs()
    return typeof e === 'string' && e.indexOf('+') > 0 ? equipValide(e, permisesSalon()) : null;
  }

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
      // les options : les réglages normalisés (§ 6 ; en solo, ceux du panneau, que les tests peuvent surcharger), l'équipement validé
      const options = normaliser(o, 1);
      jeu = J.creer({ monde, carte, mode: A, graine, options });
      const nom = (sauv.reglages.nom || '').trim() || 'Toi';
      idMoi = 'moi'; enLigne = false; partieL = null; entrees = { moi: null };
      jeu.ajouterJoueur({ id: 'moi', nom, couleur: '#FFC84A', equipe: o.equipes ? 0 : 'moi', humain: true, equip: equipValide(o.equip, options.armes) });
    } catch (e) { signaler('jeu.creer', e); jeu = null; oups('La partie n’a pas pu démarrer', 'Recharge la page et réessaie.'); return false; }
    optsPartie = Object.assign({}, o, { reglages: normaliser(o, 1) }); finTraitee = false; surDepuis = 0; aideVue = null; erreursEtape = 0; serie = 0; serieMax = 0; elims = 0; force = null; remettrePas();
    try { PHUD.reinit({ equipes: !!o.equipes, reglages: jeu.reglages || normaliser(o, 1) }); } catch (e) { signaler('hud.reinit', e); }
    try { PCONTROLES.reinit(); } catch (e) { signaler('controles.reinit', e); }
    if (compte) { compteT = 3.6; compteVu = -1; montrer('compte'); PCONTROLES.activer(false); astuce(true); }
    else { montrer('partie'); PCONTROLES.activer(true); }
    eveille(true);
    return true;
  }
  function astuce(oui) { // les trois premières parties : comment on joue, pendant le compte à rebours
    const a = $('#astuce'); if (!a) return;
    if (!oui || (sauv.records.arene.parties || 0) >= 3) { a.hidden = true; return; }
    a.innerHTML = PCONTROLES.tactile ? '<b>Pouce gauche</b> : marcher (<b>à fond</b> : courir) · <b>glisse à droite</b> : tourner · <b>Viser</b> pour zoomer · viseur rouge : <b>ça tire tout seul</b> !'
      : '<b>Clique</b> pour viser à la souris · <b>ZQSD / WASD</b> : marcher · <b>Maj</b> : courir · <b>clic droit</b> : viser · <b>Échap</b> : pause';
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
    astuce(false); jeu = null; force = null; aideVue = null; PCONTROLES.activer(false); eveille(false); try { PHUD.reinit(); } catch (e) { /* rien */ }
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
  const NIVEAUX = ['avant', 'cote', 'tir', 'accroupi', 'course', 'couche', 'vise'];
  function pasPartie(dt) { // un pas de simulation (1/60 s) : son entrée, aide à la visée, jeu, effets, sons, HUD
    const e = PCONTROLES.consommer(); nPas++;
    if (force) { // l'entrée imposée par les tests
      for (const k of NIVEAUX) if (force[k] != null) e[k] = force[k];
      if (force.dyaw) { e.dyaw += force.dyaw; force.dyaw = 0; } if (force.dpitch) { e.dpitch += force.dpitch; force.dpitch = 0; }
      if (force.saut) { e.saut = true; force.saut = false; } if (force.recharge) { e.recharge = true; force.recharge = false; } if (force.changer) { e.changer = true; force.changer = false; }
      if (force.arme != null) { e.arme = force.arme; force.arme = null; }
    }
    let aide = null;
    const aidePermise = reglagesPartie(jeu).aide !== false; // l'hôte peut couper l'aide à la visée (ralentissement, aimant, tir auto)
    if (jeu.aideVisee && aidePermise) { try { aide = jeu.aideVisee(idMoi, PCONTROLES.tactile ? 1 : 0); } catch (err) { aide = null; } }
    if (aide && PCONTROLES.tactile && PCONTROLES.actif) { // (en ligne, la partie continue pendant la pause : pas de tir auto)
      const ral = Math.max(0, Math.min(0.9, +aide.ralentir || 0)); e.dyaw *= 1 - ral; e.dpitch *= 1 - ral; // la visée ralentit sur une cible
      PCONTROLES.attenuer(1 - ral); // et le regard affiché d'ici au pas suivant aussi (sinon il avance de 100 %, puis recule de ral)
      const bouge = e.dyaw !== 0 || e.dpitch !== 0 || e.avant !== 0 || e.cote !== 0 || e.tir;
      if (bouge) { const lim = 0.0436 * dt * 3; e.dyaw += Math.max(-lim, Math.min(lim, +aide.dyaw || 0)); e.dpitch += Math.max(-lim, Math.min(lim, +aide.dpitch || 0)); } // et s'aimante doucement, seulement quand on joue
      if (PCONTROLES.reglages.tirAuto && aide.surCible) { surDepuis += dt; if (surDepuis >= 0.12) e.tir = true; } else surDepuis = 0; // tir auto après ~120 ms sur la cible
    } else { surDepuis = 0; PCONTROLES.attenuer(1); }
    aideVue = aide; // le HUD des images sans pas (avantImage) garde l'aide du dernier pas
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
    try { PCONTROLES.maj(jeu, trouver(idMoi), evs); } catch (err) { signaler('controles.maj', err); }
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
          // l'heure de l'IMAGE (l'horodatage de requestAnimationFrame, même base que performance.now) : pas celle d'après les pas,
          // dont l'écart irrégulier (1 à 30 ms) ferait trembler les autres
          let evs = null; try { evs = jeu.avantImage(now); } catch (err) { signaler('jeu.avantImage', err); evs = null; }
          if (evs && evs.length && jeu) traiter(evs, aideVue);
        }
      } else if (ecran === 'compte' && jeu) {
        if (!enLigne) compteT -= dt; const n = Math.ceil(compteT - 0.6);
        if (n !== compteVu) { compteVu = n; const c = elCompte(); c.hidden = false; c.firstElementChild.textContent = n > 0 ? String(n) : 'Repeins !'; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); c.classList.toggle('go', n <= 0); PSONS.compte(n); }
        try { PHUD.maj(jeu, idMoi, VIDE, null); PCONTROLES.maj(jeu, trouver(idMoi)); } catch (err) { signaler('hud.maj', err); }
        if (compteT <= 0) { elCompte().hidden = true; astuce(false); montrer('partie'); PCONTROLES.activer(true); PHUD.annonce(annonceDepart()); }
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
    if (ecran === 'options') majOptions(); // la vignette suit la taille
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
      case 'modes': montrer('modes'); break;
      case 'copains': montrer('copains'); break;
      case 'creer': ouvrirSalon(null); break;
      case 'rejoindre': { const c = codeTape(); if (!c) { noteCopains('Le code a 4 lettres (des consonnes), par exemple <b>BKRT</b>.', true); break; } ouvrirSalon(c); break; }
      case 'salon-quitter': quitterSalon(); montrer('copains'); break;
      case 'partager': partager(); break;
      case 'copier': copier(ctl ? ctl.code : '', 'Code copié : '); break;
      case 'salon-action': actionSalon(); break;
      case 'armes': ouvrirOptions('armes'); break;
      case 'options': ouvrirOptions(b && b.dataset.onglet); break;
      case 'onglet': onglet = b.dataset.onglet; majOptions(); break;
      case 'oopt': regler(b.dataset.k, lireValeur(b.dataset.k, b.dataset.v)); break;
      case 'options-defaut': parDefaut(); break;
      case 'armes-retour': case 'options-retour': montrer(optCtx === 'salon' && ctl ? 'salon' : 'modes'); break;
      case 'arme-choix': choisirArme(b.dataset.id); break;
      case 'arme-permise': permettreArme(b.dataset.id); break;
    }
    PSONS.ui(a === 'retour' || a === 'titre' ? 'retour' : 'tap');
  }
  function brancher() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      PSONS.debloquer(); try { action(b.dataset.a, b); } catch (err) { signaler('bouton ' + b.dataset.a, err); }
    });
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
      if (e.code === 'Escape') { if (ecran === 'pause') { e.stopPropagation(); reprendre(); } else if (ecran === 'reglages' || ecran === 'credits') action('retour'); else if (ecran === 'modes') action('titre'); else if (ecran === 'copains') action('modes'); else if (ecran === 'options') action('options-retour'); }
      else if (ecran === 'options' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && e.target && e.target.getAttribute && e.target.getAttribute('role') === 'tab') { // les onglets au clavier
        const i = ONGLETS.indexOf(onglet), n = ONGLETS[(i + (e.code === 'ArrowRight' ? 1 : ONGLETS.length - 1)) % ONGLETS.length]; onglet = n; majOptions(); const t = $(`#e-options [data-onglet="${n}"]`); if (t) t.focus(); }
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
    else noteCopains(`2 à ${MAX_JOUEURS()} joueurs, chacun sur son téléphone, en 4G ou en wifi.`);
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
    reglagesRecus = null; dernierAnnonce = '';
    c.sur('maj', () => {
      if (c !== ctl) return;
      if (c.estHote) annoncerReglages(); // (aussi quand on devient l'hôte, et quand le nombre de joueurs change : robots ≤ 6 − joueurs)
      if (ecran === 'salon') majSalon(); else if (ecran === 'options' && optCtx === 'salon') majOptions();
    });
    try { // les réglages annoncés par l'hôte (message 'reglages' : tous les champs dans d.r, sinon à plat dans d, comme ctl.reglages)
      if (c.salon && typeof c.salon.sur === 'function') c.salon.sur('reglages', (d) => { if (c !== ctl || c.estHote || !d || typeof d !== 'object') return; reglagesRecus = d.r && typeof d.r === 'object' ? d.r : d; if (ecran === 'salon') majSalon(); else if (ecran === 'options' && optCtx === 'salon') majOptions(); });
    } catch (e) { signaler('salon.sur', e); }
    if (c.estHote) annoncerReglages(true);
    publierEquip();
    c.sur('partie', (P) => { if (c !== ctl) return; demarrerEnLigne(P); });
    c.sur('salon', () => { if (c !== ctl) return; jeu = null; partieL = null; enLigne = false; finTraitee = false; force = null; astuce(false); PCONTROLES.activer(false); eveille(false); try { PHUD.reinit(); } catch (e) { /* rien */ } montrer('salon'); });
    c.sur('ferme', (d) => {
      if (c !== ctl) return; ctl = null; partieL = null;
      if (enLigne || ecran === 'salon' || (ecran === 'options' && optCtx === 'salon')) {
        enLigne = false; jeu = null; try { PHUD.reinit(); } catch (e) { /* rien */ } montrer('copains');
        const r = d && d.raison;
        noteCopains(r === 'carte' ? 'Ta carte de Poncin n’est pas celle de l’hôte : rechargez la page tous les deux, puis recréez le salon.' : r === 'complet' ? `Le salon est complet : ${MAX_JOUEURS()} joueurs au plus.` : 'Le salon a été fermé.', true);
      }
    });
  }
  function quitterSalon() { const c = ctl; ctl = null; partieL = null; enLigne = false; if (c) { try { c.quitter(); } catch (e) { console.warn('[Poncin] quitter le salon', e); } } }
  const VOIES = { local: 'même appareil', hote: 'hôte', p2p: 'direct', webrtc: 'direct', direct: 'direct', relais: 'relais', supabase: 'relais', faux: 'essai' };
  const echap = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function majSalon() {
    if (!ctl) return;
    const js = ctl.joueurs(), hote = ctl.estHote, moi = js.find((j) => j.moi) || {};
    const code = $('#salon-code'); if (code) code.textContent = ctl.code;
    const nb = $('#salon-nb'); if (nb) nb.textContent = `(${js.length}/${MAX_JOUEURS()})`;
    const l = $('#salon-liste');
    if (l) l.innerHTML = js.map((j) => { const q = equipDe(j); return `<li class="${j.moi ? 'moi' : ''}"><i class="pastille" style="background:${echap(j.couleur || '#ccc')}"></i><span class="sj-nom">${echap(j.pseudo)}${j.moi ? ' <small>(toi)</small>' : ''}${q ? `<small class="sj-equip">${echap(nomA(q.p))} + ${echap(nomA(q.s))}</small>` : ''}</span>`
      + `<span class="sj-info">${j.hote ? '' : j.ping != null ? `${j.ping} ms` : '…'}${j.voie && !j.hote ? `<br>${echap(VOIES[j.voie] || j.voie)}` : ''}</span>`
      + `<span class="sj-etat${j.hote ? ' hote' : j.pret ? ' pret' : ''}">${j.hote ? 'Hôte' : j.pret ? 'Prêt' : '…'}</span></li>`; }).join('')
      + (js.length < 2 ? '<li class="vide">En attente des copains…</li>' : '');
    const r = reglagesSalon(), q = equipValide(sauv.choix.equip, r.armes), rs = $('#resume-salon'), cleR = JSON.stringify(r) + q.p + q.s; // le résumé : une ligne par onglet du panneau
    if (rs && rs._cle !== cleR) { rs._cle = cleR; rs.innerHTML = resumeHtml(r, q); }
    const reg = $('.salon-reglages'); if (reg) reg.classList.toggle('lecture', !hote);
    const etat = $('#salon-etat'), bouton = $('#b-salon-action');
    const prets = js.filter((j) => !j.hote && j.pret).length, autres = js.length - 1;
    if (hote) {
      if (etat) etat.textContent = js.length < 2 ? 'Donne le code aux copains : la partie se lance à partir de 2 joueurs.' : `${prets}/${autres} copain${autres > 1 ? 's' : ''} prêt${prets > 1 ? 's' : ''}${js.length >= MAX_JOUEURS() ? ' · salon complet' : ''}. Tu lances quand tu veux ; garde le jeu ouvert pendant la partie : c’est ton téléphone qui la fait tourner.`;
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
      optsPartie = { equipes: eq, enLigne: true, reglages: P.reglages || jeu.reglages || (ctl ? reglagesSalon() : null) }; finTraitee = false; surDepuis = 0; aideVue = null; erreursEtape = 0; serie = 0; serieMax = 0; elims = 0; force = null; remettrePas();
      try { PHUD.reinit({ equipes: eq, reglages: reglagesPartie() }); } catch (e) { signaler('hud.reinit', e); }
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
  // les réglages de la partie en cours : jeu.reglages (normalisés, groupe des règles), sinon jeu.options, complétés par ceux du lancement
  function reglagesPartie(j) { j = j || jeu; if (!j) return {}; if (j.reglages && typeof j.reglages === 'object') return j.reglages; return Object.assign({}, (optsPartie && optsPartie.reglages) || {}, j.options || {}); }
  function annonceDepart() { // l'annonce du « Repeins ! »
    const r = reglagesPartie(), eq = !!(optsPartie && optsPartie.equipes);
    if (r.reapparition === 'aucune') return ''; // le bandeau de manche du HUD le dit (« Manche 1/3 · reste debout »)
    if (eq) return enLigne ? annonceEquipe() : 'En équipes : couvre tes robots alliés !';
    return `Premier à ${r.score || (R ? R.MODES.arene.scoreVictoire : 25)} repeints !`;
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
    try { PHUD.init($('#hud'), { actions: { pause, rejouer, menu: quitter, salon: () => auSalon(), arme: (i) => PCONTROLES.emplacement(i), recharger: () => PCONTROLES.recharger() } }); } catch (e) { signaler('hud.init', e); }
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
      viser: (id) => { // vers le milieu de sa capsule touchable (debout, accroupi ou couché : les robots se mettent à couvert)
        const m = trouver(idMoi), c = trouver(id); if (!m || !c) return null;
        let cx = c.x, cy = c.y + 1.2, cz = c.z; if (typeof PCORPS !== 'undefined' && PCORPS.capsule) { const k = PCORPS.capsule(c); cx = (k.ax + k.bx) / 2; cy = (k.ay + k.by) / 2; cz = (k.az + k.bz) / 2; }
        const oeil = typeof PCORPS !== 'undefined' && PCORPS.oeil ? PCORPS.oeil(m) : m.accroupi ? (R ? R.JOUEUR.oeilAccroupi : 1) : (R ? R.JOUEUR.oeil : 1.6), dx = cx - m.x, dz = cz - m.z, dy = cy - (m.y + oeil);
        m.yaw = Math.atan2(-dx, -dz); m.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)); return { yaw: m.yaw, pitch: m.pitch }; },
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
