/* DERNIER REMPART — l'interface et la boucle : les écrans (titre avec la partie de démonstration en fond, pause, fin, réglages), la
   sauvegarde (localStorage « zombies.v1 » : records par arène, totaux, réglages ; lue en lecture seule par la Salle de jeux), et la
   boucle d'images : la simulation avance à pas fixe de 1/60 s (au plus 5 pas par image), le rendu, le HUD et les sons suivent.
   La partie se met en pause toute seule quand la page passe en arrière-plan ; en pause, plus rien n'est dessiné (batterie).
   Pour les tests : window.__zombies (état, écran, démarrer une partie à graine fixe, avancer la simulation, statistiques du rendu). */
(() => {
  'use strict';
  const D = ZDONNEES, PAS = 1 / 60, CLE = 'zombies.v1';
  const $ = (s) => document.querySelector(s);
  const ecrans = { titre: $('#ecran-titre'), pause: $('#ecran-pause'), fin: $('#ecran-fin'), reglages: $('#ecran-reglages'), bunker: $('#ecran-bunker'), salon: $('#ecran-salon'), defi: $('#ecran-defi') };

  // ─── la sauvegarde ───
  function lire() {
    try { const s = JSON.parse(localStorage.getItem(CLE) || 'null'); if (s && s.v === 1) return s; } catch (e) { /* abîmée ou stockage refusé : on repart à zéro */ }
    return { v: 1, records: {}, total: { parties: 0, tues: 0, temps: 0 }, derniere: 0, arene: 'jardin', reglages: { son: true, vibre: true, eco: false } };
  }
  const save = lire();
  save.reglages = Object.assign({ son: true, vibre: true, eco: false, joy: 'flottant', joyt: 'normal' }, save.reglages || {});
  save.meta = Object.assign({ medailles: 0, gagnees: 0, bunker: {} }, save.meta || {}); // le Bunker : les médailles et les crans achetés
  save.records = save.records || {}; save.total = Object.assign({ parties: 0, tues: 0, temps: 0 }, save.total || {});
  function ecrire() { try { localStorage.setItem(CLE, JSON.stringify(save)); } catch (e) { /* stockage plein ou refusé : la partie continue */ } }
  const debloquee = (id) => { const k = D.ORDRE_ARENES.indexOf(id); if (k <= 0) return true; const prec = D.ORDRE_ARENES[k - 1], r = save.records[prec]; return !!(r && r.vague >= D.DEBLOCAGE[id]); };

  // ─── la 3D ───
  const canvas = $('#scene');
  const rendu = ZRENDU.creer(canvas, { qualite: save.reglages.eco ? 'eco' : 'haute' });
  if (!rendu) { $('#sans3d').hidden = false; return; }
  function taille() { rendu.taille(window.innerWidth, window.innerHeight); }
  window.addEventListener('resize', taille); taille();

  // ─── l'état ───
  let ecran = 'titre', jeu = null, demo = null, enPause = false, acc = 0, derT = 0, retourReglages = 'titre', idMoi = 'moi', debut = 0;
  let arene = D.ARENES[save.arene] && debloquee(save.arene) ? save.arene : 'jardin';
  const evs = [];

  // ─── les commandes et le HUD ───
  const reglerJoy = () => ZCONTROLES.regler({ fixe: save.reglages.joy === 'fixe', taille: save.reglages.joyt });
  ZCONTROLES.init($('#zone'), { surTouche(n) {
    if (n === 'valider') { // la manette dans les menus : le bouton principal de l'écran affiché
      if (ecran === 'jeu' && !enPause && !(jeu && jeu.fini)) return;
      const b = [...document.querySelectorAll('.ecran:not([hidden]) .gros')].find((x) => !x.hidden && x.offsetParent !== null); if (b) b.click(); return;
    }
    if (ecran !== 'jeu') return;
    if (n === 'pause') { if (enPause) reprendre(); else pause(); }
    else if (enPause) return;
    else if (monChoix() && /^arme[012]$/.test(n)) { const k = monChoix().options[+n.slice(-1)]; if (k) choisir(k); }
    else if (n === 'passer') faire('passer');
    else if (n === 'grenade') lancerGrenade();
    else if (n === 'arme0' || n === 'arme1') faire('arme', +n.slice(-1));
  } });
  reglerJoy();
  const raisons = { ferraille: 'Pas assez de ferraille', max: 'Tu en as déjà le maximum pour cette vague', verrou: 'Pas encore : plus tard dans la partie', place: 'Pas de place ici : écarte-toi des murs', mort: '' };
  ZHUD.init($('#hud'), {
    construire(type) { if (!jeu || (enPause && !partie)) return; const r = faire('construire', type); if (!r.ok && raisons[r.raison]) { ZHUD.toast(raisons[r.raison]); PSONS.jouer('refus', 0.6); } },
    ameliorer(type) { if (!jeu || (enPause && !partie)) return; const r = faire('ameliorer', type); if (!r.ok && raisons[r.raison]) { ZHUD.toast(r.raison === 'max' ? 'Déjà au maximum' : raisons[r.raison]); PSONS.jouer('refus', 0.6); } },
    arme(i) { if (jeu && !enPause) faire('arme', i); },
    pause() { pause(); },
    passer() { if (jeu && !enPause) faire('passer'); },
    grenade() { lancerGrenade(); },
    atout(k) { choisir(k); },
    projeter: (x, y, z) => rendu.ecranDe(x, z, y),
  });
  // toutes les actions passent par ici : en solo sur la partie, en coop envoyées à l'hôte (qui les exécute pour ce joueur)
  function faire(quoi, arg) {
    if (!jeu) return { ok: false };
    if (partie) return partie.action(quoi, arg) || { ok: false };
    switch (quoi) {
      case 'construire': return ZJEU.construire(jeu, idMoi, arg);
      case 'ameliorer': return ZJEU.ameliorer(jeu, idMoi, arg);
      case 'grenade': return ZJEU.grenade(jeu, idMoi);
      case 'arme': return { ok: ZJEU.changerArme(jeu, idMoi, arg) };
      case 'atout': return { ok: ZJEU.choisirAtout(jeu, idMoi, arg) };
      case 'passer': return { ok: ZJEU.passer(jeu) };
    }
    return { ok: false };
  }
  const moi = () => (jeu ? jeu.joueurs.find((p) => p.id === idMoi) || jeu.joueurs[0] : null);
  const monChoix = () => { const m = moi(); return m ? m.choix || (jeu.choix && jeu.choix.id === idMoi ? jeu.choix : null) : null; };
  function lancerGrenade() { if (!jeu || (enPause && !partie)) return; const r = faire('grenade'); if (r && !r.ok && r.raison === 'recharge') PSONS.jouer('refus', 0.5); }
  function choisir(k) { if (!jeu || (enPause && !partie) || !monChoix()) return; const r = faire('atout', k); if (r && r.ok) { PSONS.jouer('achat', 0.9); PSONS.vibrer(15); } }
  // le son naît au premier geste (iOS, Chrome)
  const geste = () => { try { PSONS.debloquer(); } catch (e) { /* rien */ } };
  window.addEventListener('pointerdown', geste, true); window.addEventListener('keydown', geste, true);
  function reglerSons() { try { PSONS.regler({ son: save.reglages.son, vibre: save.reglages.vibre }); ZSONS.regler({ son: save.reglages.son }); } catch (e) { /* rien */ } }
  reglerSons();

  // ─── les écrans ───
  function montrer(nom) {
    ecran = nom; document.body.dataset.ecran = nom;
    for (const k in ecrans) ecrans[k].hidden = k !== nom;
    $('#hud').hidden = !(nom === 'jeu' || nom === 'pause' || nom === 'fin' || (nom === 'reglages' && retourReglages === 'pause'));
    ZCONTROLES.activer(nom === 'jeu' && !enPause);
    if (nom === 'titre') { remplirArenes(); if (!demo) nouvelleDemo(); majMedailles(); majBoutonDefi(); }
  }
  function remplirArenes() {
    const box = $('.arenes');
    box.innerHTML = D.ORDRE_ARENES.map((id) => {
      const A = D.ARENES[id], ok = debloquee(id), r = save.records[id], k = D.ORDRE_ARENES.indexOf(id);
      const prec = k > 0 ? D.ARENES[D.ORDRE_ARENES[k - 1]].nom : '';
      return `<button type="button" class="arene" role="radio" data-arene="${id}" aria-checked="${id === arene}" ${ok ? '' : 'disabled'}>
        <b>${A.nom}</b>${ok ? `<small>${A.desc}</small>${r ? `<span class="rec">Record : vague ${r.vague} · ${r.score} pts</span>` : ''}` : `<span class="verrou">${ZHUD.ICO.cadenas}Atteins la vague ${D.DEBLOCAGE[id]} : ${prec}</span>`}
      </button>`;
    }).join('');
    box.querySelectorAll('.arene').forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return; arene = b.dataset.arene; save.arene = arene; ecrire();
      box.querySelectorAll('.arene').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      nouvelleDemo(); PSONS.ui('tap');
    }));
  }
  // la démonstration du titre : le survivant (invincible) tient l'arène choisie, une tourelle à côté
  function nouvelleDemo() {
    demo = ZJEU.creer({ arene, graine: (Math.random() * 1e9) | 0, attente: 1, ferraille: 15 });
    ZJEU.construire(demo, 'moi', 'tourelle');
  }
  function demarrer(id, graine) {
    arene = D.ARENES[id] ? id : arene; defi = null;
    jeu = ZJEU.creer({ arene, graine: graine != null ? graine : (Math.random() * 1e9) | 0, joueurs: [{ id: idMoi, pseudo: 'Moi' }], bonus: Object.assign({}, save.meta.bunker) });
    demo = null; enPause = false; acc = 0; debut = Date.now();
    ZHUD.reinit(); ZCONTROLES.reinit();
    montrer('jeu');
    ZHUD.annonce(D.ARENES[arene].nom.toUpperCase(), 'Les zombies arrivent…', 2.2);
    return jeu;
  }
  function pause() {
    if (ecran !== 'jeu' || !jeu || jeu.fini) return;
    enPause = true; ZCONTROLES.activer(false);
    $('#ecran-pause .resume').textContent = `Vague ${Math.max(1, jeu.vague)} · ${moi().tues} zombies · ${moi().score} points${partie ? ' · la partie continue pour les copains' : ''}`;
    ecrans.pause.hidden = false; document.body.dataset.ecran = 'pause'; ecran = 'jeu'; // l'écran de jeu reste dessous, figé
    try { PSONS.suspendre(true); } catch (e) { /* rien */ }
  }
  function reprendre() {
    ecrans.pause.hidden = true; ecrans.reglages.hidden = true; enPause = false; derT = 0; acc = 0;
    document.body.dataset.ecran = 'jeu'; ZCONTROLES.activer(true);
    try { PSONS.suspendre(false); } catch (e) { /* rien */ }
  }
  function finir() {
    const j = moi(), r = defi ? { vague: 0, score: 0, tues: 0, parties: 0 } : save.records[arene] || { vague: 0, score: 0, tues: 0, parties: 0 };
    const record = !defi && (j.score > r.score || jeu.vague > r.vague);
    r.parties++; r.vague = Math.max(r.vague, jeu.vague); r.score = Math.max(r.score, j.score); r.tues = Math.max(r.tues, j.tues);
    const M = D.MEDAILLES, medailles = jeu.vague * M.parVague + Math.floor(j.tues / M.parZombies) + j.boss * M.parBoss;
    save.meta.medailles += medailles; save.meta.gagnees += medailles;
    if (!defi) save.records[arene] = r;
    save.total.parties++; save.total.tues += j.tues; save.total.temps += Math.round(jeu.t); save.derniere = Date.now();
    ecrire();
    const nouvelle = D.ORDRE_ARENES.find((id) => !save['vu_' + id] && debloquee(id) && id !== 'jardin');
    const min = Math.floor(jeu.t / 60), s = Math.floor(jeu.t % 60);
    $('.fin-chiffres').innerHTML = [
      ['Vague atteinte', jeu.vague], ['Niveau', j.niveau], ['Zombies', j.tues], ['Boss abattus', j.boss], ['Score', j.score], ['Ferraille ramassée', jeu.stats.ferraille], ['Défenses posées', jeu.stats.construits], ['Temps', `${min} min ${String(s).padStart(2, '0')} s`],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('.fin-medailles').innerHTML = `${ZHUD.ICO.medaille} +${medailles} médaille${medailles > 1 ? 's' : ''} pour le Bunker`;
    $('.fin-record').hidden = !record || r.parties <= 1 && j.score === 0;
    $('.fin-record').textContent = nouvelle ? `${D.ARENES[nouvelle].nom} débloqué !` : 'Nouveau record !';
    if (nouvelle) { save['vu_' + nouvelle] = true; ecrire(); $('.fin-record').hidden = false; }
    finDefi(j);
    $('#b-rejouer').hidden = !!(partie && !partie.estHote); $('#b-rejouer').textContent = partie ? 'Rejouer ensemble' : 'Rejouer';
    $('.fin-attente').hidden = !(partie && !partie.estHote);
    ZCONTROLES.activer(false);
    setTimeout(() => { if (jeu && jeu.fini) { ecran = 'fin'; document.body.dataset.ecran = 'fin'; ecrans.fin.hidden = false; } }, 1400);
  }
  function quitter() { quitterSalon(); jeu = null; enPause = false; for (const k in ecrans) ecrans[k].hidden = true; try { PSONS.suspendre(false); } catch (e) { /* rien */ } montrer('titre'); }

  // ─── jouer à plusieurs : le salon (un code de 4 lettres), puis la partie en coop ───
  let salon = null, partie = null;
  const erreurSalon = (t) => { const e = $('.salon-erreur'); e.textContent = t || ''; e.hidden = !t; };
  function ouvrirSalon() {
    $('#s-pseudo').value = save.pseudo || ''; erreurSalon('');
    $('.salon-entree').hidden = !!salon; $('.salon-dedans').hidden = !salon;
    for (const k in ecrans) ecrans[k].hidden = k !== 'salon'; document.body.dataset.ecran = 'salon';
    if (salon) majSalon();
  }
  async function entrerSalon(creer) {
    const pseudo = ($('#s-pseudo').value || '').trim().slice(0, 16) || 'Survivant', code = ($('#s-code').value || '').trim().toUpperCase();
    if (!creer && !PRESEAU.codeValide(code)) { erreurSalon('Le code a 4 lettres (des consonnes), par exemple « BRKT ».'); return; }
    save.pseudo = pseudo; ecrire(); erreurSalon(''); $('.salon-etat').hidden = false; $('.salon-etat').textContent = creer ? 'Création du salon…' : `Connexion au salon ${code}…`;
    try {
      salon = await ZENLIGNE.ouvrir({ code: creer ? null : code, creer, pseudo, bonus: save.meta.bunker, config: window.ZOMBIES_CONFIG || window.PONCIN_CONFIG });
      salon.sur('maj', majSalon);
      salon.sur('debut', (p) => demarrerPartie(p));
      salon.sur('ferme', (r) => { const l = salon; salon = null; partie = null; if (l) try { l.quitter(); } catch (e) { /* rien */ } if (ecran === 'jeu' || ecran === 'fin' || document.body.dataset.ecran === 'salon') { quitter(); ZHUD.toast(r && r.raison === 'hote' ? 'L’hôte a quitté la partie' : 'Le salon est fermé'); } });
      $('.salon-etat').hidden = true; ouvrirSalon();
    } catch (e) { salon = null; $('.salon-etat').hidden = true; erreurSalon(e && e.message ? e.message : 'Connexion impossible : vérifie ta connexion et réessaie.'); }
  }
  function majSalon() {
    if (!salon) return;
    const l = salon.joueurs();
    $('.code-salon').textContent = salon.code;
    $('.liste-joueurs').innerHTML = l.map((j) => `<li${j.moi ? ' class="moi"' : ''}><b>${j.pseudo.replace(/[<>&"]/g, '')}</b>${j.hote ? '<span class="pastille">hôte</span>' : ''}${j.moi ? '<span class="pastille toi">toi</span>' : ''}</li>`).join('');
    $('#b-lancer').hidden = !salon.estHote; $('.attente').hidden = salon.estHote;
    $('#b-lancer').textContent = l.length > 1 ? `Lancer à ${l.length}` : 'Lancer (en attendant les copains)';
    $('.salon-arene').textContent = `Arène : ${D.ARENES[arene].nom}`;
  }
  function demarrerPartie(p) {
    partie = p; jeu = p.jeu; idMoi = p.idMoi; defi = null; arene = p.arene; demo = null; enPause = false; finVu = false; acc = 0;
    for (const k in ecrans) ecrans[k].hidden = true;
    ZHUD.reinit(); ZCONTROLES.reinit(); montrer('jeu');
    ZHUD.annonce('EN COOP', `${jeu.joueurs.length} survivant${jeu.joueurs.length > 1 ? 's' : ''} · ${D.ARENES[arene].nom}`, 2.4);
  }
  function quitterSalon() { if (partie && partie.fermer) partie.fermer(); if (salon) { const l = salon; salon = null; try { l.quitter(); } catch (e) { /* rien */ } } partie = null; idMoi = 'moi'; }

  // ─── le Bunker : les améliorations permanentes ───
  function majMedailles() { const h = `${ZHUD.ICO.medaille}<span>${save.meta.medailles}</span>`; $('#titre-medailles').innerHTML = h; $('#bunker-medailles').innerHTML = h; }
  function remplirBunker() {
    majMedailles();
    $('.bunker-liste').innerHTML = Object.keys(D.BUNKER).map((k) => {
      const B = D.BUNKER[k], n = save.meta.bunker[k] || 0, prix = n < B.crans ? B.prix[n] : null;
      return `<div class="amelio"><b>${B.nom}</b><small>${B.desc}</small><span class="crans">${'●'.repeat(n)}${'○'.repeat(B.crans - n)}</span>
        <button type="button" data-bunker="${k}" ${prix == null || save.meta.medailles < prix ? 'disabled' : ''} aria-label="${B.nom} : ${prix == null ? 'au maximum' : prix + ' médailles'}">${prix == null ? 'MAX' : `<span class="prix-m">${ZHUD.ICO.medaille}</span>${prix}`}</button></div>`;
    }).join('');
  }
  $('.bunker-liste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bunker]'); if (!b || b.disabled) return;
    const k = b.dataset.bunker, B = D.BUNKER[k], n = save.meta.bunker[k] || 0; if (n >= B.crans || save.meta.medailles < B.prix[n]) return;
    save.meta.medailles -= B.prix[n]; save.meta.bunker[k] = n + 1; ecrire(); remplirBunker();
    try { PSONS.jouer('achat', 0.9); PSONS.vibrer(15); } catch (err) { /* rien */ }
  });

  // ─── le défi du jour : la même partie pour tout le monde aujourd'hui (heure de Paris) ; le meilleur score part au classement ───
  const stock = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const CL = ZCLASSEMENT.creer({ config: () => window.ZOMBIES_CONFIG || window.PONCIN_CONFIG, supabase: () => window.supabase, stockage: stock, enLigne: () => navigator.onLine !== false });
  let defi = null, periode = 'jour', lecture = 0;
  const echap = (t) => String(t == null ? '' : t).replace(/[<>&"]/g, '');
  const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const defiActuel = () => ZJEU.defiDu(ZCLASSEMENT.jourParis());
  function monDefi(jour) { if (!save.defi || save.defi.jour !== jour) save.defi = { jour, meilleur: 0, vague: 0, tues: 0, parties: 0, envoye: true }; return save.defi; }
  function majBoutonDefi() { const d = defiActuel(), m = monDefi(d.jour); $('.defi-sous').textContent = `${d.nom} · ${m.parties ? 'ton meilleur : ' + nf(m.meilleur) : 'pas encore joué'}`; }
  const MESSAGES = {
    absent: 'Classement indisponible ici : ton meilleur score reste gardé sur ce téléphone.', 'hors-ligne': 'Pas de réseau : ton score partira dès que tu seras en ligne.',
    lent: 'Le classement ne répond pas : réessaie plus tard.', 'pas-installe': 'Le classement n’est pas encore ouvert : ton score est gardé.',
    pseudo_pris: 'Ce pseudo est déjà pris : choisis-en un autre.', pseudo_invalide: 'Pseudo : 2 à 16 lettres ou chiffres.', trop_vite: 'Doucement ! Réessaie dans quelques secondes.',
    quota: 'Assez de parties pour aujourd’hui !', complet: 'Le classement est complet.', erreur: 'Classement indisponible pour l’instant.',
  };
  function retenirPseudo() { const v = ZCLASSEMENT.verifierPseudo($('#d-pseudo').value); if (v.ok && v.pseudo !== save.pseudo) { save.pseudo = v.pseudo; ecrire(); } }
  function pseudoClassement() { const p = ZCLASSEMENT.pseudoPour(save.pseudo || ''); return p; }
  // le meilleur score du jour qui n'est pas encore parti (pas de réseau, pas de pseudo…) part à la prochaine occasion
  async function envoyerEnAttente(renommer) {
    const m = save.defi, pseudo = pseudoClassement();
    if (!pseudo || !CL.disponible()) return null;
    if (m && m.parties && !m.envoye && m.jour >= ZCLASSEMENT.jourParis(Date.now() - 86400e3)) {
      const r = await CL.publier({ jour: m.jour, score: m.meilleur, vague: m.vague, tues: m.tues }, { pseudo });
      if (r.ok || r.erreur === 'valeur' || r.erreur === 'jour') { m.envoye = true; ecrire(); }
      if (!r.ok && MESSAGES[r.erreur]) $('.defi-etat').textContent = MESSAGES[r.erreur];
      return r;
    }
    if (renommer && CL.etat().rejoint && CL.etat().pseudo !== pseudo) { const r = await CL.publier(null, { pseudo }); if (!r.ok && MESSAGES[r.erreur]) $('.defi-etat').textContent = MESSAGES[r.erreur]; return r; }
    return null;
  }
  function ouvrirDefi() {
    const d = defiActuel(), m = monDefi(d.jour);
    let date = d.jour; try { date = new Date(d.jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch (e) { /* la date brute */ }
    $('.defi-date').textContent = date;
    $('.defi-mut').textContent = d.nom; $('.defi-texte').textContent = d.texte;
    $('.defi-arene').textContent = `${D.ARENES[d.arene].nom} · la même partie pour tout le monde · sans les bonus du Bunker`;
    $('.defi-perso').textContent = m.parties ? `Ton meilleur aujourd’hui : ${nf(m.meilleur)} pts (vague ${m.vague}) · ${pluriel(m.parties, 'partie')}` : 'Pas encore joué aujourd’hui : le meilleur score de la journée compte.';
    $('#d-pseudo').value = save.pseudo || CL.etat().pseudo || '';
    for (const k in ecrans) ecrans[k].hidden = true;
    montrer('defi');
    chargerClassement().then(() => envoyerEnAttente()).then((r) => { if (r && r.ok) chargerClassement(); });
  }
  async function chargerClassement() {
    const n = ++lecture, box = $('.defi-liste'), etat = $('.defi-etat');
    document.querySelectorAll('.onglets [data-periode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.periode === periode)));
    if (!CL.disponible()) { box.innerHTML = ''; etat.textContent = MESSAGES.absent; return; }
    etat.textContent = 'Chargement du classement…';
    const r = await CL.lire(periode, ZCLASSEMENT.jourParis()); if (n !== lecture) return;
    if (!r.ok) { box.innerHTML = ''; etat.textContent = MESSAGES[r.erreur] || MESSAGES.erreur; return; }
    const li = (l, loin) => `<li class="${l.moi ? 'moi' : ''}${loin ? ' loin' : ''}"><b>${l.rang || '–'}</b><span>${l.moi && !l.pseudo ? 'Toi' : echap(l.pseudo)}<small>${periode === 'jour' ? `vague ${l.vague} · ${pluriel(l.parties, 'partie')}` : `${pluriel(l.parties, 'jour')} · vague ${l.vague} au mieux`}</small></span><span class="score">${nf(l.score)}</span></li>`;
    box.innerHTML = r.lignes.map((l) => li(l)).join('') + (r.moi && !r.lignes.some((l) => l.moi) ? li(r.moi, true) : '');
    etat.textContent = r.lignes.length ? `${pluriel(r.joueurs, 'joueur')} ${periode === 'jour' ? 'aujourd’hui' : 'cette semaine'}${pseudoClassement() ? '' : ' · choisis un pseudo pour y entrer'}` : 'Personne encore : sois le premier !';
  }
  function demarrerDefi() {
    const d = defiActuel(); defi = d;
    jeu = ZJEU.creer({ arene: d.arene, graine: d.graine, mod: d.mod, joueurs: [{ id: idMoi, pseudo: 'Moi' }] }); // sans les bonus du Bunker : la même partie pour tous
    demo = null; enPause = false; acc = 0; debut = Date.now();
    ZHUD.reinit(); ZCONTROLES.reinit();
    montrer('jeu');
    ZHUD.annonce('DÉFI DU JOUR', `${d.nom} · ${D.ARENES[d.arene].nom}`, 2.6);
    return jeu;
  }
  // l'écran de fin d'un défi : le score, le meilleur du jour, puis la place au classement
  function finDefi(j) {
    const box = $('.fin-defi');
    box.hidden = !defi || !!partie; if (box.hidden) return;
    const m = monDefi(defi.jour), meilleur = j.score > m.meilleur || !m.parties;
    m.parties++; if (meilleur) { m.meilleur = j.score; m.vague = jeu.vague; m.tues = j.tues; m.envoye = false; }
    ecrire(); $('.fin-record').hidden = true;
    const base = `Défi du jour : ${nf(j.score)} pts${meilleur && m.parties > 1 ? ' — ton meilleur aujourd’hui !' : ''}`;
    box.textContent = base;
    if (!pseudoClassement()) { if (CL.disponible()) box.textContent = base + ' · choisis un pseudo (Défi du jour) pour entrer au classement'; return; }
    const lire = () => CL.lire('jour', defi.jour).then((r) => { if (r.ok && r.moi && r.moi.rang) box.textContent = `${base} · ${r.moi.rang === 1 ? '1er' : r.moi.rang + 'e'} sur ${r.joueurs}`; });
    if (meilleur) envoyerEnAttente().then((r) => { if (r && r.ok && r.rang) box.textContent = `${base} · ${r.rang === 1 ? '1er' : r.rang + 'e'} sur ${r.joueurs}`; else if (r && !r.ok && MESSAGES[r.erreur]) box.textContent = `${base} · ${MESSAGES[r.erreur]}`; });
    else lire();
  }

  // ─── les boutons des écrans ───
  const clic = (s, f) => $(s).addEventListener('click', (e) => { e.preventDefault(); try { PSONS.ui('tap'); } catch (err) { /* rien */ } f(); });
  clic('#b-jouer', () => { verrouiller(); demarrer(arene); });
  clic('#b-reprendre', reprendre);
  clic('#b-recommencer', () => { ecrans.pause.hidden = true; try { PSONS.suspendre(false); } catch (e) { /* rien */ } if (defi) demarrerDefi(); else demarrer(arene); });
  clic('#b-quitter', quitter);
  clic('#b-rejouer', () => { if (salon && partie) { if (salon.estHote) salon.lancer(arene); return; } ecrans.fin.hidden = true; if (defi) demarrerDefi(); else demarrer(arene); });
  clic('#b-menu', () => { ecrans.fin.hidden = true; quitter(); });
  const ouvrirReglages = (depuis) => {
    retourReglages = depuis; $('#r-son').checked = save.reglages.son; $('#r-vibre').checked = save.reglages.vibre; $('#r-eco').checked = save.reglages.eco; $('#r-joy').value = save.reglages.joy; $('#r-joyt').value = save.reglages.joyt;
    ecrans.reglages.hidden = false; if (depuis === 'titre') ecrans.titre.hidden = true; else ecrans.pause.hidden = true;
  };
  clic('#b-reglages', () => ouvrirReglages('titre'));
  clic('#b-multi', ouvrirSalon);
  clic('#b-defi', ouvrirDefi);
  clic('#b-defi-jouer', () => { verrouiller(); retenirPseudo(); demarrerDefi(); });
  clic('#b-defi-retour', () => { retenirPseudo(); for (const k in ecrans) ecrans[k].hidden = true; montrer('titre'); });
  document.querySelectorAll('.onglets [data-periode]').forEach((b) => b.addEventListener('click', () => { periode = b.dataset.periode; try { PSONS.ui('tap'); } catch (e) { /* rien */ } chargerClassement(); }));
  $('#d-pseudo').addEventListener('change', () => { retenirPseudo(); envoyerEnAttente(true).then(chargerClassement); });
  clic('#b-creer', () => entrerSalon(true));
  clic('#b-rejoindre', () => entrerSalon(false));
  clic('#b-lancer', () => { if (salon) { verrouiller(); salon.lancer(arene); } });
  clic('#b-salon-quitter', () => { quitterSalon(); for (const k in ecrans) ecrans[k].hidden = true; montrer('titre'); });
  clic('#b-bunker', () => { remplirBunker(); ecrans.titre.hidden = true; ecrans.bunker.hidden = false; document.body.dataset.ecran = 'bunker'; });
  clic('#b-bunker-ok', () => { ecrans.bunker.hidden = true; ecrans.titre.hidden = false; document.body.dataset.ecran = 'titre'; majMedailles(); });
  clic('#b-pause-reglages', () => ouvrirReglages('pause'));
  clic('#b-reglages-ok', () => {
    save.reglages.son = $('#r-son').checked; save.reglages.vibre = $('#r-vibre').checked;
    const eco = $('#r-eco').checked; if (eco !== save.reglages.eco) { save.reglages.eco = eco; rendu.qualite(eco ? 'eco' : 'haute'); }
    save.reglages.joy = $('#r-joy').value === 'fixe' ? 'fixe' : 'flottant'; save.reglages.joyt = ['petit', 'normal', 'grand'].includes($('#r-joyt').value) ? $('#r-joyt').value : 'normal'; reglerJoy();
    ecrire(); reglerSons(); ecrans.reglages.hidden = true;
    if (retourReglages === 'pause') ecrans.pause.hidden = false; else ecrans.titre.hidden = false;
  });
  if (window.ZOMBIES_ACCUEIL) $('#b-accueil').href = window.ZOMBIES_ACCUEIL;

  // en arrière-plan : pause (et plus d'images)
  const portrait = () => window.matchMedia && matchMedia('(orientation: portrait) and (max-width: 900px)').matches;
  let estPortrait = portrait();
  const surOrientation = () => { estPortrait = portrait(); if (estPortrait && ecran === 'jeu' && jeu && !jeu.fini && !enPause) pause(); };
  window.addEventListener('resize', surOrientation); window.addEventListener('orientationchange', surOrientation);
  // sur Android, en plein écran, on peut verrouiller le paysage (iOS refuse : l'écran « Tourne ton téléphone » prend le relais)
  const verrouiller = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* rien */ } };
  document.addEventListener('visibilitychange', () => { if (document.hidden && ecran === 'jeu' && jeu && !jeu.fini && !enPause) pause(); });

  // ─── la boucle ───
  function avancer(j, entrees, dt) {
    acc += dt; let n = 0; evs.length = 0;
    while (acc >= PAS && n < 5) { const e = ZJEU.pas(j, entrees, PAS); for (let i = 0; i < e.length; i++) evs.push(e[i]); acc -= PAS; n++; }
    if (n === 5) acc = 0;
  }
  const entrees = { moi: null };
  // le coup de grâce sur un boss : 1,6 s au ralenti (×0,3), l'éclair blanc ; une explosion : une micro-pause de 45 ms
  let ralentiJusque = 0, arretJusque = 0;
  const facteurTemps = () => { const t = performance.now(); return t < arretJusque ? 0 : t < ralentiJusque ? 0.3 : 1; };
  function effetsTemps(l) {
    for (const e of l) {
      if (e.t === 'mort' && e.boss) { ralentiJusque = performance.now() + 1600; ZHUD.flash(); PSONS.vibrer([60, 40, 120]); }
      else if (e.t === 'boum') arretJusque = Math.max(arretJusque, performance.now() + 45);
    }
  }
  let fige = false, finVu = false;
  function boucle(t) {
    requestAnimationFrame(boucle);
    const dt = derT ? Math.min(0.1, (t - derT) / 1000) : PAS; derT = t;
    if (document.hidden) return;
    if (estPortrait && ecran === 'jeu' && jeu && !jeu.fini && !enPause) pause(); // en portrait, la partie attend (« Tourne ton téléphone »)
    if (partie && jeu && (ecran === 'jeu' || ecran === 'fin')) { // la coop : l'hôte simule, le client suit ; la pause n'arrête rien
      const e = partie.etape(partie.estHote ? dt * facteurTemps() : dt, enPause || estPortrait ? null : ZCONTROLES.lire()); effetsTemps(e);
      ZSONS.evenements(e, jeu, idMoi, dt); ZHUD.maj(jeu, idMoi, dt, e); rendu.image(jeu, idMoi, dt, e);
      if (jeu.fini && !finVu) { finVu = true; finir(); }
      return;
    }
    if (jeu && (ecran === 'jeu' || ecran === 'fin')) {
      if (enPause) { if (!fige) { rendu.image(jeu, idMoi, 0, null); fige = true; } return; }
      fige = false;
      if (!jeu.fini) {
        entrees.moi = ZCONTROLES.lire(); avancer(jeu, entrees, dt * facteurTemps()); effetsTemps(evs);
        ZSONS.evenements(evs, jeu, idMoi, dt);
        ZHUD.maj(jeu, idMoi, dt, evs);
        rendu.image(jeu, idMoi, dt, evs);
        if (jeu.fini) finir();
      } else rendu.image(jeu, idMoi, dt, null);
    } else if (demo) {
      const j = demo.joueurs[0]; j.invul = 99; j.vie = j.vieMax;
      if (demo.choix) ZJEU.choisirAtout(demo, demo.choix.id, demo.choix.options[0]); // la démonstration choisit seule ses atouts
      avancer(demo, null, dt);
      rendu.image(demo, 'moi', dt, evs);
      if (demo.vague > 3) nouvelleDemo();
    }
  }
  montrer('titre');
  requestAnimationFrame(boucle);

  // ─── pour les tests (Playwright) ───
  window.__zombies = {
    get jeu() { return jeu; }, get demo() { return demo; }, get ecran() { return ecran; }, get enPause() { return enPause; }, get portrait() { return estPortrait; }, get save() { return JSON.parse(JSON.stringify(save)); },
    demarrer, demarrerDefi, ouvrirDefi, get defi() { return defi; }, classement: CL, pause, reprendre, montrer, quitter, get salon() { return salon; }, get partie() { return partie; }, get idMoi() { return idMoi; }, entrerSalon,
    avancer(n, e) { for (let i = 0; i < n && jeu && !jeu.fini; i++) { ZJEU.pas(jeu, e || null, PAS); } return jeu && { vague: jeu.vague, zombies: jeu.zombies.length, fini: jeu.fini }; },
    stats() { return { rendu: rendu.stats(), ecran, arene, ralenti: performance.now() < ralentiJusque }; },
    ecranDe: (x, z) => rendu.ecranDe(x, z),
  };
})();
