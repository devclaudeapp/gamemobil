/* DERNIER REMPART — l'interface et la boucle : les écrans (titre avec la partie de démonstration en fond, pause, fin, réglages), la
   sauvegarde (localStorage « zombies.v1 » : records par arène, totaux, réglages ; lue en lecture seule par la Salle de jeux), et la
   boucle d'images : la simulation avance à pas fixe de 1/60 s (au plus 5 pas par image), le rendu, le HUD et les sons suivent.
   La partie se met en pause toute seule quand la page passe en arrière-plan ; en pause, plus rien n'est dessiné (batterie).
   Pour les tests : window.__zombies (état, écran, démarrer une partie à graine fixe, avancer la simulation, statistiques du rendu). */
(() => {
  'use strict';
  const D = ZDONNEES, PAS = 1 / 60, CLE = 'zombies.v1';
  const $ = (s) => document.querySelector(s);
  const ecrans = { titre: $('#ecran-titre'), pause: $('#ecran-pause'), fin: $('#ecran-fin'), reglages: $('#ecran-reglages'), bunker: $('#ecran-bunker'), salon: $('#ecran-salon'), defi: $('#ecran-defi'), ascension: $('#ecran-ascension'), collection: $('#ecran-collection'), progression: $('#ecran-progression'), modes: $('#ecran-modes') };

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
    emote(e) { if (jeu) faire('emote', e); },
    emotesDispo: () => Object.keys(D.EMOTES).filter((k) => save.collection.emotes.includes(k)),
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
      case 'emote': return ZJEU.emote(jeu, idMoi, arg);
    }
    return { ok: false };
  }
  const moi = () => (jeu ? jeu.joueurs.find((p) => p.id === idMoi) || jeu.joueurs[0] : null);
  const monChoix = () => { const m = moi(); return m ? m.choix || (jeu.choix && jeu.choix.id === idMoi ? jeu.choix : null) : null; };
  function lancerGrenade() { if (jeu && jeu.mode === 'infection') { if (!enPause && ZINFECTION.bondir(jeu)) PSONS.vibrer(15); return; } if (!jeu || (enPause && !partie)) return; const r = faire('grenade'); if (r && !r.ok && r.raison === 'recharge') PSONS.jouer('refus', 0.5); }
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
    const enJeu = nom === 'jeu' || nom === 'pause' || nom === 'fin' || (nom === 'reglages' && retourReglages === 'pause'), inf = !!(jeu && jeu.mode === 'infection');
    $('#hud').hidden = !enJeu || inf; $('#hud-inf').hidden = !enJeu || !inf;
    ZCONTROLES.activer(nom === 'jeu' && !enPause);
    rendu.decaler(nom === 'collection' ? 6 : 0);
    if (nom === 'titre') { remplirArenes(); if (!demo) nouvelleDemo(); majMedailles(); majBoutonDefi(); majBoutonAscension(); majBoutonProgression(); }
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
    const choisie = box.querySelector('[aria-checked="true"]'); if (choisie && choisie.scrollIntoView) try { choisie.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* rien */ }
    box.querySelectorAll('.arene').forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return; arene = b.dataset.arene; save.arene = arene; ecrire();
      box.querySelectorAll('.arene').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      nouvelleDemo(); PSONS.ui('tap');
    }));
  }
  // la démonstration du titre : le survivant (invincible) tient l'arène choisie, une tourelle à côté
  function nouvelleDemo() {
    demo = ZJEU.creer({ arene, graine: (Math.random() * 1e9) | 0, attente: 1, ferraille: 15, joueurs: [Object.assign(moiJoueur(), { id: 'moi' })] });
    ZJEU.construire(demo, 'moi', 'tourelle');
  }
  function demarrer(id, graine) {
    arene = D.ARENES[id] ? id : arene; defi = null; ascension = null; mode = null;
    jeu = ZJEU.creer({ arene, graine: graine != null ? graine : (Math.random() * 1e9) | 0, joueurs: [moiJoueur()], bonus: Object.assign({}, save.meta.bunker) });
    demo = null; enPause = false; acc = 0; debut = Date.now();
    ZHUD.reinit(); ZCONTROLES.reinit();
    montrer('jeu');
    ZHUD.annonce(D.ARENES[arene].nom.toUpperCase(), 'Les zombies arrivent…', 2.2);
    return jeu;
  }
  function pause() {
    if (ecran !== 'jeu' || !jeu || jeu.fini) return;
    enPause = true; ZCONTROLES.activer(false);
    $('#ecran-pause .resume').textContent = jeu.mode === 'infection' ? `Infection · ${jeu.mordus} mordus · ${ZINFECTION.restants(jeu)} survivants encore debout` : `Vague ${Math.max(1, jeu.vague)} · ${moi().tues} zombies · ${moi().score} points${partie ? ' · la partie continue pour les copains' : ''}`;
    ecrans.pause.hidden = false; document.body.dataset.ecran = 'pause'; ecran = 'jeu'; // l'écran de jeu reste dessous, figé
    try { PSONS.suspendre(true); } catch (e) { /* rien */ }
  }
  function reprendre() {
    ecrans.pause.hidden = true; ecrans.reglages.hidden = true; enPause = false; derT = 0; acc = 0;
    document.body.dataset.ecran = 'jeu'; ZCONTROLES.activer(true);
    try { PSONS.suspendre(false); } catch (e) { /* rien */ }
  }
  function finir() {
    const horsRecords = !!(defi || ascension), j = moi(), r = horsRecords ? { vague: 0, score: 0, tues: 0, parties: 0 } : save.records[arene] || { vague: 0, score: 0, tues: 0, parties: 0 };
    const record = !horsRecords && (j.score > r.score || jeu.vague > r.vague);
    r.parties++; r.vague = Math.max(r.vague, jeu.vague); r.score = Math.max(r.score, j.score); r.tues = Math.max(r.tues, j.tues);
    const M = D.MEDAILLES, medailles = jeu.vague * M.parVague + Math.floor(j.tues / M.parZombies) + j.boss * M.parBoss;
    save.meta.medailles += medailles; save.meta.gagnees += medailles;
    if (!horsRecords) save.records[arene] = r;
    save.total.parties++; save.total.tues += j.tues; save.total.temps += Math.round(jeu.t); save.derniere = Date.now();
    save.total.boss = (save.total.boss || 0) + j.boss; if (partie) save.total.coop = (save.total.coop || 0) + 1;
    if (!horsRecords) save.total.vagueMax = Math.max(save.total.vagueMax || 0, jeu.vague);
    if (defi) { save.total.defisJours = (save.total.defisJours || []).filter((x) => x !== defi.jour).concat(defi.jour).slice(-60); }
    ecrire();
    const nouvelle = D.ORDRE_ARENES.find((id) => !save['vu_' + id] && debloquee(id) && id !== 'jardin');
    const min = Math.floor(jeu.t / 60), s = Math.floor(jeu.t % 60);
    $('.fin-chiffres').innerHTML = [
      ['Vague atteinte', jeu.vague], ['Niveau', j.niveau], ['Zombies', j.tues], ['Boss abattus', j.boss], ['Score', j.score], ['Ferraille ramassée', jeu.stats.ferraille], ['Défenses posées', jeu.stats.construits], ['Temps', `${min} min ${String(s).padStart(2, '0')} s`],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('.fin-medailles').innerHTML = `${ZHUD.ICO.medaille} +${medailles} médaille${medailles > 1 ? 's' : ''} pour le Bunker`; medaillesPartie = medailles;
    $('.fin-record').hidden = !record || r.parties <= 1 && j.score === 0;
    $('.fin-record').textContent = nouvelle ? `${D.ARENES[nouvelle].nom} débloqué !` : 'Nouveau record !';
    if (nouvelle) { save['vu_' + nouvelle] = true; ecrire(); $('.fin-record').hidden = false; }
    finDefi(j);
    $('#b-rejouer').hidden = !!(partie && !partie.estHote); $('#b-rejouer').textContent = partie ? 'Rejouer ensemble' : 'Rejouer';
    finAscension(); finMode();
    const gainsProg = bilanProgression(j); if (gainsProg) setTimeout(() => ZHUD.toast(gainsProg), 2600);
    const neufs = verifierExploits(); if (neufs.length) setTimeout(() => ZHUD.toast(`Nouveau survivant : ${neufs.map((k) => D.SURVIVANTS[k].nom).join(', ')} !`), 1600);
    $('.fin-attente').hidden = !(partie && !partie.estHote);
    ZCONTROLES.activer(false);
    setTimeout(() => { if (jeu && jeu.fini) { ecran = 'fin'; document.body.dataset.ecran = 'fin'; ecrans.fin.hidden = false; } }, 1400);
  }
  function quitter() { quitterSalon(); jeu = null; enPause = false; for (const k in ecrans) ecrans[k].hidden = true; try { PSONS.suspendre(false); } catch (e) { /* rien */ } montrer('titre'); }

  // ─── jouer à plusieurs : le salon (un code de 4 lettres), puis la partie en coop ───
  let salon = null, partie = null, modeSalon = 'coop';
  const erreurSalon = (t) => { const e = $('.salon-erreur'); e.textContent = t || ''; e.hidden = !t; };
  const TITRES_SALON = { coop: 'Jouer à plusieurs', cps: 'Chacun pour soi', duel: 'Duel' };
  const AIDES_SALON = { coop: 'De 2 à 4 survivants, chacun sur son téléphone, chacun chez soi.', cps: 'De 2 à 4 : la même arme pour tous, pas de relève. Le dernier debout gagne.', duel: 'À deux : tes zombies abattus en envoient à l’autre, un atout offert à chaque vague. Le dernier debout gagne et monte de division.' };
  function ouvrirSalon() {
    $('#ecran-salon h2').textContent = TITRES_SALON[modeSalon] || TITRES_SALON.coop; $('.salon-entree .resume').textContent = AIDES_SALON[modeSalon] || AIDES_SALON.coop;
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
      salon = await ZENLIGNE.ouvrir({ code: creer ? null : code, creer, pseudo, bonus: save.meta.bunker, skin: save.collection.skin, config: window.ZOMBIES_CONFIG || window.PONCIN_CONFIG });
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
    partie = p; jeu = p.jeu; idMoi = p.idMoi; defi = null; ascension = null; arene = p.arene; demo = null; enPause = false; finVu = false; acc = 0;
    for (const k in ecrans) ecrans[k].hidden = true;
    ZHUD.reinit(); ZCONTROLES.reinit(); montrer('jeu');
    ZHUD.annonce('EN COOP', `${jeu.joueurs.length} survivant${jeu.joueurs.length > 1 ? 's' : ''} · ${D.ARENES[arene].nom}`, 2.4);
  }
  function quitterSalon() { if (partie && partie.fermer) partie.fermer(); if (salon) { const l = salon; salon = null; try { l.quitter(); } catch (e) { /* rien */ } } partie = null; idMoi = 'moi'; }

  // ─── le Bunker : les améliorations permanentes ───
  function majMedailles() { const h = `${ZHUD.ICO.medaille}<span>${save.meta.medailles}</span>`; $('#titre-medailles').innerHTML = h; $('#bunker-medailles').innerHTML = h; const c = $('#col-medailles'); if (c) c.innerHTML = h; const pm = $('#prog-medailles'); if (pm) pm.innerHTML = h; }
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
    jeu = ZJEU.creer({ arene: d.arene, graine: d.graine, mod: d.mod, joueurs: [moiJoueur()] }); // sans les bonus du Bunker : la même partie pour tous
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

  // ─── l'Ascension : des échelons sans fin (ZJEU.echelon : le même pour tout le monde), le Bunker compte ; une finition d'arme tous les 3 ───
  save.ascension = Object.assign({ echelon: 1, reussis: 0, finitions: 0, essais: 0 }, save.ascension || {});
  let ascension = null, medaillesPartie = 0;
  const AS = D.ASCENSION;
  function majBoutonAscension() { $('.asc-sous').textContent = `Échelon ${save.ascension.echelon}`; }
  function ficheEchelon(e) {
    const lignes = [['Objectif', ZJEU.texteObjectif(e.objectif), 'obj'], ['Arène', D.ARENES[e.arene].nom], ['Météo', AS.meteos[e.meteo].nom], ['Règle', `${e.regleNom}${e.regleTexte && e.regle !== 'normale' ? ' — ' + e.regleTexte : ''}`], ['Horde', `${e.vedettes.map((k) => D.ZOMBIES[k].nom).join(', ') || 'mêlée'} en vedette, dès la vague ${e.vagueDepart}`]];
    return lignes.map(([a, b, c]) => `<dt>${a}</dt><dd${c ? ` class="${c}"` : ''}>${echap(b)}</dd>`).join('');
  }
  function ouvrirAscension() {
    const n = save.ascension.echelon, e = ZJEU.echelon(n);
    $('.asc-n').innerHTML = `Échelon ${n} <small>· ${save.ascension.reussis} réussi${save.ascension.reussis > 1 ? 's' : ''}</small>`;
    $('.asc-carte').innerHTML = ficheEchelon(e);
    const prochaine = Math.ceil(n / AS.finitionTous) * AS.finitionTous;
    $('.asc-recomp').textContent = `Récompense : ${AS.recompense(n)} médailles${n === prochaine ? ' et une finition d’arme' : ` · une finition d’arme à l’échelon ${prochaine}`}`;
    for (const k in ecrans) ecrans[k].hidden = true;
    montrer('ascension');
  }
  function demarrerAscension(n) {
    const e = ZJEU.echelon(n); ascension = e; defi = null;
    jeu = ZJEU.creer({ arene: e.arene, graine: e.graine, mod: e.mod, objectif: e.objectif, meteo: e.meteo, vedettes: e.vedettes, vagueDepart: e.vagueDepart, joueurs: [moiJoueur()], bonus: Object.assign({}, save.meta.bunker) });
    demo = null; enPause = false; acc = 0; debut = Date.now(); save.ascension.essais++; ecrire();
    ZHUD.reinit(); ZCONTROLES.reinit();
    montrer('jeu');
    ZHUD.annonce(`ÉCHELON ${n}`, ZJEU.texteObjectif(e.objectif), 3);
    return jeu;
  }
  function finAscension() {
    $('.fin-titre').textContent = ascension ? (jeu.gagne ? `Échelon ${ascension.n} réussi !` : `Échelon ${ascension.n} : raté`) : 'Submergé !';
    if (!ascension) return;
    const n = ascension.n, A = save.ascension;
    if (jeu.gagne) {
      const m = AS.recompense(n); save.meta.medailles += m; save.meta.gagnees += m;
      if (n >= A.echelon) { A.echelon = n + 1; A.reussis++; if (n % AS.finitionTous === 0) A.finitions++; }
      ecrire();
      const t = medaillesPartie + m; $('.fin-medailles').innerHTML = `${ZHUD.ICO.medaille} +${t} médailles pour le Bunker (dont ${m} pour l’échelon)`;
      $('.fin-record').hidden = n % AS.finitionTous !== 0; $('.fin-record').textContent = 'Une finition d’arme gagnée !';
    } else { const raisons = { contrat: 'Le contrat a expiré.', generateur: 'Le générateur a sauté.' }, t = raisons[jeu.raison]; $('.fin-record').hidden = !t; if (t) $('.fin-record').textContent = t; }
    $('#b-rejouer').textContent = jeu.gagne ? `Échelon ${n + 1}` : 'Réessayer';
  }

  // ─── la collection : les survivants (skins), les finitions d'armes, les émotes ───
  save.collection = Object.assign({ skin: 'gardien', skins: [], parArme: {}, emotes: [] }, save.collection || {});
  { const C = save.collection; for (const k in D.SURVIVANTS) if (D.SURVIVANTS[k].depart && !C.skins.includes(k)) C.skins.push(k); for (const k in D.EMOTES) if (!D.EMOTES[k].prix && !D.EMOTES[k].pass && !C.emotes.includes(k)) C.emotes.push(k); if (!D.SURVIVANTS[C.skin]) C.skin = 'gardien'; }
  function moiJoueur() { const C = save.collection, fins = finitionsEues(), parArme = {}; for (const a in C.parArme) if (fins.includes(C.parArme[a])) parArme[a] = C.parArme[a]; return { id: idMoi, pseudo: 'Moi', skin: C.skin, finitions: parArme }; }
  const finitionsEues = () => D.ORDRE_FINITIONS.slice(0, Math.min(D.ORDRE_FINITIONS.length, save.ascension ? save.ascension.finitions : 0));
  // où en est un exploit (pour le texte « 3 / 5 ») ; ceux qui sont atteints donnent leur survivant
  function progres(x) {
    const T = save.total; const v = { echelon: save.ascension ? save.ascension.echelon : 1, vague: T.vagueMax || Math.max(0, ...Object.values(save.records).map((r) => r.vague || 0)), boss: T.boss || 0, defis: (T.defisJours || []).length, coop: T.coop || 0, tues: T.tues || 0 };
    const k = Object.keys(x)[0]; return { fait: v[k] || 0, but: x[k] };
  }
  function verifierExploits() {
    const C = save.collection, neufs = [];
    for (const k in D.SURVIVANTS) { const S = D.SURVIVANTS[k]; if (!S.exploit || C.skins.includes(k)) continue; const p = progres(S.exploit); if (p.fait >= p.but) { C.skins.push(k); neufs.push(k); } }
    if (neufs.length) ecrire(); return neufs;
  }
  let ongletCol = 'survivants', armeCol = 'revolver';
  function ouvrirCollection() {
    verifierExploits();
    for (const k in ecrans) ecrans[k].hidden = true;
    montrer('collection'); remplirCollection();
  }
  function remplirCollection() {
    const C = save.collection, box = $('.col-liste');
    document.querySelectorAll('.col-onglets [data-onglet]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === ongletCol)));
    $('.col-armes').hidden = ongletCol !== 'finitions';
    majMedailles();
    if (ongletCol === 'survivants') {
      box.innerHTML = Object.keys(D.SURVIVANTS).map((k) => {
        const S = D.SURVIVANTS[k], eu = C.skins.includes(k), porte = C.skin === k;
        const etat = porte ? '<b class="porte">Porté</b>' : eu ? '<b>Porter</b>' : S.prix ? `<b class="prix">${ZHUD.ICO.medaille}${S.prix}</b>` : S.secret ? '<small>Secret</small>' : `<small>${echap(S.texte)} (${Math.min(progres(S.exploit).fait, progres(S.exploit).but)} / ${progres(S.exploit).but})</small>`;
        return `<button type="button" class="col-carte${porte ? ' porte' : ''}${eu ? '' : ' verrou'}" data-skin="${k}"><span class="nom">${eu || !S.secret ? echap(S.nom) : '???'}</span>${etat}</button>`;
      }).join('');
      box.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.skin, S = D.SURVIVANTS[k];
        if (C.skins.includes(k)) { C.skin = k; }
        else if (S.prix) { if (save.meta.medailles < S.prix) { ZHUD.toast('Pas assez de médailles (le Bunker les gagne en jouant)'); PSONS.jouer('refus', 0.6); return; } save.meta.medailles -= S.prix; C.skins.push(k); C.skin = k; PSONS.jouer('achat', 0.9); }
        else { ZHUD.toast(S.secret ? 'Un survivant secret : continue de jouer…' : S.texte); return; }
        ecrire(); if (demo) demo.joueurs[0].skin = C.skin; remplirCollection();
      }));
    } else if (ongletCol === 'finitions') {
      const fins = finitionsEues();
      $('.col-armes select').innerHTML = Object.keys(D.ARMES).map((a) => `<option value="${a}"${a === armeCol ? ' selected' : ''}>${echap(D.ARMES[a].nom)}${C.parArme[a] ? ' · ' + echap(D.FINITIONS[C.parArme[a]].nom) : ''}</option>`).join('');
      box.innerHTML = `<button type="button" class="col-carte${!C.parArme[armeCol] ? ' porte' : ''}" data-fin=""><span class="nom">D’origine</span></button>` + D.ORDRE_FINITIONS.map((f, i) => {
        const F = D.FINITIONS[f], eu = fins.includes(f), porte = C.parArme[armeCol] === f;
        return `<button type="button" class="col-carte${porte ? ' porte' : ''}${eu ? '' : ' verrou'}" data-fin="${f}"><span class="pastille" style="background:${eu ? F.couleur : '#555'}"></span><span class="nom">${eu ? echap(F.nom) : '???'}</span><small>${eu ? (porte ? 'Portée' : 'Appliquer') : `Échelon ${(i + 1) * D.ASCENSION.finitionTous}`}</small></button>`;
      }).join('');
      box.querySelectorAll('[data-fin]').forEach((b) => b.addEventListener('click', () => {
        const f = b.dataset.fin; if (f && !fins.includes(f)) { ZHUD.toast(`Se gagne à l’échelon ${(D.ORDRE_FINITIONS.indexOf(f) + 1) * D.ASCENSION.finitionTous} de l’Ascension`); return; }
        if (f) C.parArme[armeCol] = f; else delete C.parArme[armeCol]; ecrire(); apercuArme(); remplirCollection(); PSONS.ui('tap');
      }));
      apercuArme();
    } else {
      box.innerHTML = Object.keys(D.EMOTES).map((k) => { const E = D.EMOTES[k], eu = C.emotes.includes(k); return `<button type="button" class="col-carte${eu ? '' : ' verrou'}" data-emo="${k}"><span class="signe">${E.signe}</span><span class="nom">${echap(E.nom)}</span>${eu ? '<small>À toi</small>' : E.pass ? `<small>Pass, palier ${E.pass}</small>` : `<b class="prix">${ZHUD.ICO.medaille}${E.prix}</b>`}</button>`; }).join('');
      box.querySelectorAll('[data-emo]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.emo, E = D.EMOTES[k]; if (C.emotes.includes(k)) { if (demo) ZJEU.emote(demo, 'moi', k); return; }
        if (E.pass) { ZHUD.toast(`Se gagne au palier ${E.pass} du pass de saison`); return; }
        if (save.meta.medailles < E.prix) { ZHUD.toast('Pas assez de médailles'); PSONS.jouer('refus', 0.6); return; }
        save.meta.medailles -= E.prix; C.emotes.push(k); ecrire(); PSONS.jouer('achat', 0.9); remplirCollection();
      }));
    }
  }
  // l'aperçu : le survivant de la démonstration (derrière l'écran) porte le skin, et tient l'arme choisie avec sa finition
  function apercuArme() { if (!demo) return; const p = demo.joueurs[0]; p.skin = save.collection.skin; p.finitions = moiJoueur().finitions; p.armes[1] = { id: armeCol, mun: 999 }; p.main = 1; }

  // ─── la progression : missions sans fin, pass de saison (100 paliers, un par mois), coffre du jour et série de jours ───
  const P0 = { rang: 0, missions: [], palier: 0, xp: 0, saison: '', coffre: '', serie: 0, dernierJour: '' };
  save.prog = Object.assign({}, P0, save.prog || {});
  const aujourdhui = () => ZCLASSEMENT.jourParis();
  const hier = () => ZCLASSEMENT.jourParis(Date.now() - 86400e3);
  const saisonDe = (j) => j.slice(0, 7);
  const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function nouvelleMission(rangPlus) { // la suivante dans le cycle, plus dure à chaque tour
    const P = save.prog, r = P.rang + (rangPlus || 0), M = D.MISSIONS[(r * 7 + 3) % D.MISSIONS.length], deja = P.missions.map((m) => m.id);
    let k = (r * 7 + 3) % D.MISSIONS.length, essai = 0; while (deja.includes(D.MISSIONS[k].id) && essai++ < D.MISSIONS.length) k = (k + 1) % D.MISSIONS.length;
    const X = D.MISSIONS[k]; void M; return { id: X.id, but: X.but(Math.floor(r / 3)), fait: 0 };
  }
  function majProgression() { // nouvelle saison : le pass repart ; toujours trois missions
    const P = save.prog, s = saisonDe(aujourdhui());
    if (P.saison !== s) { P.saison = s; P.palier = 0; P.xp = 0; }
    while (P.missions.length < 3) P.missions.push(nouvelleMission(P.missions.length));
  }
  majProgression();
  function gagnerXpPass(x) {
    const P = save.prog, gains = []; P.xp += x;
    while (P.xp >= D.PASS.xpPalier && P.palier < D.PASS.paliers) {
      P.xp -= D.PASS.xpPalier; P.palier++; const R = D.PASS.recompense(P.palier);
      if (R.medailles) { save.meta.medailles += R.medailles; save.meta.gagnees += R.medailles; gains.push(`+${R.medailles} médailles`); }
      if (R.emote && !save.collection.emotes.includes(R.emote)) { save.collection.emotes.push(R.emote); gains.push(`l’émote ${D.EMOTES[R.emote].signe}`); }
    }
    if (P.palier >= D.PASS.paliers) P.xp = 0;
    return gains;
  }
  function bilanProgression(j) {
    majProgression();
    const P = save.prog, b = { tues: j.tues, boss: j.boss, crits: jeu.stats.crits, ferraille: jeu.stats.ferraille, construits: jeu.stats.construits, grenades: jeu.stats.grenades, caisses: jeu.stats.caisses, vague: jeu.vague, echelons: ascension && jeu.gagne ? 1 : 0, coop: partie ? 1 : 0, defi: defi ? 1 : 0 };
    const faites = [];
    for (const m of P.missions) { const X = D.MISSIONS.find((x) => x.id === m.id); if (!X) continue; m.fait = X.cumul ? m.fait + (b[X.mesure] || 0) : Math.max(m.fait, b[X.mesure] || 0); if (m.fait >= m.but) faites.push(m); }
    let xp = D.PASS.xpPartie(j.score);
    for (const m of faites) { P.missions.splice(P.missions.indexOf(m), 1); P.rang++; xp += D.PASS.xpMission; }
    majProgression();
    const gains = gagnerXpPass(xp); ecrire();
    const t = []; if (faites.length) t.push(`${faites.length} mission${faites.length > 1 ? 's' : ''} réussie${faites.length > 1 ? 's' : ''}`); if (gains.length) t.push(`pass : ${gains.join(', ')}`);
    return t.join(' · ');
  }
  // le coffre du jour (une fois par jour, heure de Paris) ; la série : les jours d'affilée où on l'ouvre
  const coffrePret = () => save.prog.coffre !== aujourdhui();
  function ouvrirCoffre() {
    const P = save.prog, j = aujourdhui(); if (P.coffre === j) return null;
    P.serie = P.dernierJour === hier() ? P.serie + 1 : 1; P.dernierJour = j; P.coffre = j;
    const [a, b] = D.COFFRE.medailles, base = a + Math.floor(Math.random() * (b - a + 1)), m = Math.round(base * (1 + D.COFFRE.serieBonus * Math.min(D.COFFRE.serieMax, P.serie - 1)));
    save.meta.medailles += m; save.meta.gagnees += m; ecrire(); return { medailles: m, serie: P.serie };
  }
  let ongletProg = 'missions';
  function majBoutonProgression() { const b = $('#b-progression small'); if (b) b.textContent = coffrePret() ? '🎁 coffre du jour' : `🔥 ${save.prog.serie} jour${save.prog.serie > 1 ? 's' : ''} · palier ${save.prog.palier}`; }
  function ouvrirProgression() { majProgression(); for (const k in ecrans) ecrans[k].hidden = true; montrer('progression'); remplirProgression(); }
  function remplirProgression() {
    const P = save.prog, box = $('.prog-corps'); majMedailles();
    document.querySelectorAll('.prog-onglets [data-onglet]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === ongletProg)));
    if (ongletProg === 'missions') {
      box.innerHTML = `<p class="prog-aide">Trois missions à la fois ; une réussie en amène une autre, plus dure. Chacune rapporte ${D.PASS.xpMission} points de pass.</p>` + P.missions.map((m) => { const X = D.MISSIONS.find((x) => x.id === m.id); const f = Math.min(m.fait, m.but); return `<div class="prog-mission"><b>${echap(X.texte(m.but))}</b><div class="prog-barre"><i style="width:${Math.round(f / m.but * 100)}%"></i></div><small>${f} / ${m.but}</small></div>`; }).join('') + `<p class="prog-aide">${P.rang} mission${P.rang > 1 ? 's' : ''} réussie${P.rang > 1 ? 's' : ''} en tout.</p>`;
    } else if (ongletProg === 'pass') {
      const [an, mois] = P.saison.split('-'), prochains = []; for (let p = P.palier + 1; p <= Math.min(D.PASS.paliers, P.palier + 6); p++) { const R = D.PASS.recompense(p); prochains.push(`<li class="${R.emote ? 'rare' : ''}"><b>${p}</b><span>${R.emote ? `${D.EMOTES[R.emote].signe} émote « ${echap(D.EMOTES[R.emote].nom)} »` : `${ZHUD.ICO.medaille} ${R.medailles} médailles`}</span></li>`); }
      box.innerHTML = `<p class="prog-titre">Saison de ${NOMS_MOIS[+mois - 1] || ''} ${an || ''} · palier ${P.palier} / ${D.PASS.paliers}</p><div class="prog-barre gros"><i style="width:${Math.round(P.xp / D.PASS.xpPalier * 100)}%"></i></div><small>${P.xp} / ${D.PASS.xpPalier} points pour le palier suivant (une partie : score ÷ 20, une mission : ${D.PASS.xpMission})</small><ul class="prog-paliers">${prochains.join('') || '<li>Pass terminé : bravo !</li>'}</ul>`;
    } else {
      const pret = coffrePret();
      box.innerHTML = `<div class="prog-coffre"><span class="gros-ico">${pret ? '🎁' : '📦'}</span><p>${pret ? 'Ton coffre du jour t’attend.' : 'Coffre ouvert aujourd’hui : reviens demain !'}</p><p class="prog-aide">Série : 🔥 ${P.serie} jour${P.serie > 1 ? 's' : ''} d’affilée (+${Math.round(D.COFFRE.serieBonus * 100)} % par jour, jusqu’à ${D.COFFRE.serieMax})</p>${pret ? '<button type="button" class="gros" id="b-coffre">Ouvrir</button>' : ''}</div>`;
      const b = $('#b-coffre'); if (b) b.addEventListener('click', () => { const r = ouvrirCoffre(); if (!r) return; PSONS.jouer('achat', 1); PSONS.vibrer([20, 40, 20]); ZHUD.toast(`+${r.medailles} médailles · série de ${r.serie} jour${r.serie > 1 ? 's' : ''}`); remplirProgression(); });
    }
  }

  // ─── les modes : l'Infection (seul : c'est toi l'épidémie) ; Chacun pour soi et le Duel se jouent dans un salon ───
  let mode = null;
  save.infection = Object.assign({ parties: 0, victoires: 0, meilleur: 0 }, save.infection || {});
  function ouvrirModes() { for (const k in ecrans) ecrans[k].hidden = true; montrer('modes'); $('.duel-div').textContent = `Ta division : ${division(save.duel.points)} (${save.duel.victoires} victoire${save.duel.victoires > 1 ? 's' : ''})`; $('.mode-inf small').textContent = `${D.ARENES[arene].nom} · ${save.infection.victoires} victoire${save.infection.victoires > 1 ? 's' : ''}, record ${save.infection.meilleur}`; }
  function demarrerInfection() {
    defi = null; ascension = null; mode = 'infection';
    jeu = ZINFECTION.creer({ arene, graine: (Math.random() * 1e9) | 0 });
    demo = null; enPause = false; acc = 0; debut = Date.now(); ZCONTROLES.reinit();
    montrer('jeu');
    $('.hi-annonce').textContent = 'Mords-les tous avant la fin du chrono !'; $('.hi-annonce').hidden = false; setTimeout(() => { $('.hi-annonce').hidden = true; }, 2600);
    return jeu;
  }
  function majHudInfection() {
    if (!jeu || jeu.mode !== 'infection') return;
    const m = jeu.moiZ, t = Math.max(0, jeu.reste);
    $('.hi-vie i').style.width = `${Math.max(0, m.vie / m.vieMax) * 100}%`;
    $('.hi-reste b').textContent = ZINFECTION.restants(jeu); $('.hi-chrono').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    $('.hi-chrono').classList.toggle('urgent', t < 20); $('.hi-mordus b').textContent = jeu.mordus;
    const b = $('.hi-bond'); b.classList.toggle('pret', jeu.bondT <= 0); b.style.setProperty('--recharge', `${Math.max(0, jeu.bondT / ZINFECTION.R.moi.bond.recharge) * 100}%`);
  }
  function finirInfection() {
    const gagne = jeu.gagne, I = save.infection, med = jeu.mordus + (gagne ? 6 : 0);
    I.parties++; if (gagne) I.victoires++; I.meilleur = Math.max(I.meilleur, jeu.score);
    save.meta.medailles += med; save.meta.gagnees += med; save.total.parties++; save.total.temps += Math.round(jeu.t);
    const gains = gagnerXpPass(D.PASS.xpPartie(jeu.score)); ecrire();
    $('.fin-titre').textContent = gagne ? 'L’épidémie a gagné !' : jeu.raison === 'abattu' ? 'Abattu par les survivants' : 'Les survivants ont tenu';
    $('.fin-chiffres').innerHTML = [['Survivants mordus', `${jeu.mordus} / ${jeu.joueurs.length}`], ['Score', jeu.score], ['Temps', `${Math.floor(jeu.t / 60)} min ${String(Math.floor(jeu.t % 60)).padStart(2, '0')} s`], ['Record', I.meilleur]].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('.fin-medailles').innerHTML = `${ZHUD.ICO.medaille} +${med} médaille${med > 1 ? 's' : ''} pour le Bunker${gains.length ? ' · pass : ' + gains.join(', ') : ''}`;
    $('.fin-record').hidden = true; $('.fin-defi').hidden = true; $('.fin-attente').hidden = true; $('#b-rejouer').hidden = false; $('#b-rejouer').textContent = 'Rejouer';
    ZCONTROLES.activer(false);
    setTimeout(() => { if (jeu && jeu.fini) { ecran = 'fin'; document.body.dataset.ecran = 'fin'; ecrans.fin.hidden = false; } }, 1400);
  }

  // le duel : 8 divisions, des points gagnés (+25) ou perdus (−15) à chaque duel
  const DIVISIONS = ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Maître', 'Grand maître', 'Légende'];
  save.duel = Object.assign({ points: 0, victoires: 0, defaites: 0 }, save.duel || {});
  const division = (p) => DIVISIONS[Math.min(DIVISIONS.length - 1, Math.floor(p / 100))];
  function finMode() {
    if (!jeu || !(jeu.mode === 'cps' || jeu.mode === 'duel')) return;
    const g = jeu.joueurs.find((p) => p.id === jeu.gagnant), moiGagne = jeu.gagnant === idMoi;
    $('.fin-titre').textContent = moiGagne ? (jeu.mode === 'duel' ? 'Duel gagné !' : 'Dernier debout !') : `${g ? g.pseudo : 'Un autre'} gagne`;
    if (jeu.mode === 'duel') {
      const D0 = save.duel, avant = division(D0.points);
      if (moiGagne) { D0.points += 25; D0.victoires++; } else { D0.points = Math.max(0, D0.points - 15); D0.defaites++; }
      ecrire(); const apres = division(D0.points);
      $('.fin-record').hidden = false; $('.fin-record').textContent = `${apres} · ${D0.points % 100} / 100${apres !== avant ? (moiGagne ? ' — promu !' : ' — relégué') : ''}`;
    }
  }

  // ─── les boutons des écrans ───
  const clic = (s, f) => $(s).addEventListener('click', (e) => { e.preventDefault(); try { PSONS.ui('tap'); } catch (err) { /* rien */ } f(); });
  clic('#b-jouer', () => { verrouiller(); demarrer(arene); });
  clic('#b-reprendre', reprendre);
  clic('#b-recommencer', () => { ecrans.pause.hidden = true; try { PSONS.suspendre(false); } catch (e) { /* rien */ } if (mode === 'infection') demarrerInfection(); else if (ascension) demarrerAscension(ascension.n); else if (defi) demarrerDefi(); else demarrer(arene); });
  clic('#b-quitter', quitter);
  clic('#b-rejouer', () => { if (salon && partie) { if (salon.estHote) salon.lancer(arene, modeSalon); return; } ecrans.fin.hidden = true; if (mode === 'infection') demarrerInfection(); else if (ascension) demarrerAscension(save.ascension.echelon); else if (defi) demarrerDefi(); else demarrer(arene); });
  clic('#b-menu', () => { ecrans.fin.hidden = true; quitter(); });
  const ouvrirReglages = (depuis) => {
    retourReglages = depuis; $('#r-son').checked = save.reglages.son; $('#r-vibre').checked = save.reglages.vibre; $('#r-eco').checked = save.reglages.eco; $('#r-joy').value = save.reglages.joy; $('#r-joyt').value = save.reglages.joyt;
    ecrans.reglages.hidden = false; if (depuis === 'titre') ecrans.titre.hidden = true; else ecrans.pause.hidden = true;
  };
  clic('#b-reglages', () => ouvrirReglages('titre'));
  clic('#b-multi', () => { modeSalon = 'coop'; ouvrirSalon(); });
  clic('#b-defi', ouvrirDefi);
  clic('#b-ascension', ouvrirAscension);
  clic('#b-collection', ouvrirCollection);
  clic('#b-progression', ouvrirProgression);
  clic('#b-modes', ouvrirModes);
  clic('#b-mode-inf', () => { verrouiller(); demarrerInfection(); });
  clic('#b-mode-cps', () => { modeSalon = 'cps'; ouvrirSalon(); });
  clic('#b-mode-duel', () => { modeSalon = 'duel'; ouvrirSalon(); });
  clic('#b-modes-retour', () => { for (const k in ecrans) ecrans[k].hidden = true; montrer('titre'); });
  clic('.hi-bond', lancerGrenade);
  clic('.hi-pause', () => pause());
  clic('#b-prog-retour', () => { for (const k in ecrans) ecrans[k].hidden = true; montrer('titre'); });
  document.querySelectorAll('.prog-onglets [data-onglet]').forEach((b) => b.addEventListener('click', () => { ongletProg = b.dataset.onglet; PSONS.ui('tap'); remplirProgression(); }));
  clic('#b-col-retour', () => { for (const k in ecrans) ecrans[k].hidden = true; if (demo) { demo.joueurs[0].armes[1] = null; demo.joueurs[0].main = 0; } montrer('titre'); });
  document.querySelectorAll('.col-onglets [data-onglet]').forEach((b) => b.addEventListener('click', () => { ongletCol = b.dataset.onglet; PSONS.ui('tap'); remplirCollection(); }));
  $('.col-armes select').addEventListener('change', (e) => { armeCol = D.ARMES[e.target.value] ? e.target.value : 'revolver'; remplirCollection(); });
  clic('#b-asc-jouer', () => { verrouiller(); demarrerAscension(save.ascension.echelon); });
  clic('#b-asc-retour', () => { for (const k in ecrans) ecrans[k].hidden = true; montrer('titre'); });
  clic('#b-defi-jouer', () => { verrouiller(); retenirPseudo(); demarrerDefi(); });
  clic('#b-defi-retour', () => { retenirPseudo(); for (const k in ecrans) ecrans[k].hidden = true; montrer('titre'); });
  document.querySelectorAll('.onglets [data-periode]').forEach((b) => b.addEventListener('click', () => { periode = b.dataset.periode; try { PSONS.ui('tap'); } catch (e) { /* rien */ } chargerClassement(); }));
  $('#d-pseudo').addEventListener('change', () => { retenirPseudo(); envoyerEnAttente(true).then(chargerClassement); });
  clic('#b-creer', () => entrerSalon(true));
  clic('#b-rejoindre', () => entrerSalon(false));
  clic('#b-lancer', () => { if (salon) { const r = salon.lancer(arene, modeSalon); if (r === 'duel-deux') { erreurSalon('Le duel se joue à deux exactement.'); return; } verrouiller(); } });
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
    while (acc >= PAS && n < 5) { const e = j.mode === 'infection' ? ZINFECTION.pas(j, entrees && entrees.moi, PAS) : ZJEU.pas(j, entrees, PAS); for (let i = 0; i < e.length; i++) evs.push(e[i]); acc -= PAS; n++; }
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
        if (jeu.mode === 'infection') majHudInfection(); else ZHUD.maj(jeu, idMoi, dt, evs);
        rendu.image(jeu, idMoi, dt, evs);
        if (jeu.fini) { if (jeu.mode === 'infection') finirInfection(); else finir(); }
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
    get modeSalon() { return modeSalon; }, set modeSalon(v) { modeSalon = v; }, demarrerInfection, ouvrirModes, ouvrirCollection, verifierExploits, ouvrirProgression, ouvrirCoffre, demarrer, demarrerDefi, ouvrirDefi, demarrerAscension, ouvrirAscension, get ascension() { return ascension; }, get defi() { return defi; }, classement: CL, pause, reprendre, montrer, quitter, get salon() { return salon; }, get partie() { return partie; }, get idMoi() { return idMoi; }, entrerSalon,
    avancer(n, e) { for (let i = 0; i < n && jeu && !jeu.fini; i++) { ZJEU.pas(jeu, e || null, PAS); } return jeu && { vague: jeu.vague, zombies: jeu.zombies.length, fini: jeu.fini }; },
    stats() { return { rendu: rendu.stats(), ecran, arene, ralenti: performance.now() < ralentiJusque }; },
    ecranDe: (x, z) => rendu.ecranDe(x, z), get rendu() { return rendu; },
  };
})();
