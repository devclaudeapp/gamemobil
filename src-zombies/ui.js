/* DERNIER REMPART — l'interface et la boucle : les écrans (titre avec la partie de démonstration en fond, pause, fin, réglages), la
   sauvegarde (localStorage « zombies.v1 » : records par arène, totaux, réglages ; lue en lecture seule par la Salle de jeux), et la
   boucle d'images : la simulation avance à pas fixe de 1/60 s (au plus 5 pas par image), le rendu, le HUD et les sons suivent.
   La partie se met en pause toute seule quand la page passe en arrière-plan ; en pause, plus rien n'est dessiné (batterie).
   Pour les tests : window.__zombies (état, écran, démarrer une partie à graine fixe, avancer la simulation, statistiques du rendu). */
(() => {
  'use strict';
  const D = ZDONNEES, PAS = 1 / 60, CLE = 'zombies.v1';
  const $ = (s) => document.querySelector(s);
  const ecrans = { titre: $('#ecran-titre'), pause: $('#ecran-pause'), fin: $('#ecran-fin'), reglages: $('#ecran-reglages') };

  // ─── la sauvegarde ───
  function lire() {
    try { const s = JSON.parse(localStorage.getItem(CLE) || 'null'); if (s && s.v === 1) return s; } catch (e) { /* abîmée ou stockage refusé : on repart à zéro */ }
    return { v: 1, records: {}, total: { parties: 0, tues: 0, temps: 0 }, derniere: 0, arene: 'jardin', reglages: { son: true, vibre: true, eco: false } };
  }
  const save = lire();
  save.reglages = Object.assign({ son: true, vibre: true, eco: false }, save.reglages || {});
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
  ZCONTROLES.init($('#zone'), { surTouche(n) {
    if (ecran !== 'jeu') return;
    if (n === 'pause') { if (enPause) reprendre(); else pause(); }
    else if (enPause) return;
    else if (n === 'passer') ZJEU.passer(jeu);
    else if (n === 'arme0' || n === 'arme1') ZJEU.changerArme(jeu, idMoi, +n.slice(-1));
  } });
  const raisons = { ferraille: 'Pas assez de ferraille', max: 'Tu en as déjà le maximum pour cette vague', verrou: 'Pas encore : plus tard dans la partie', place: 'Pas de place ici : écarte-toi des murs', mort: '' };
  ZHUD.init($('#hud'), {
    construire(type) { if (!jeu || enPause) return; const r = ZJEU.construire(jeu, idMoi, type); if (!r.ok && raisons[r.raison]) { ZHUD.toast(raisons[r.raison]); PSONS.jouer('refus', 0.6); } },
    ameliorer(type) { if (!jeu || enPause) return; const r = ZJEU.ameliorer(jeu, idMoi, type); if (!r.ok && raisons[r.raison]) { ZHUD.toast(r.raison === 'max' ? 'Déjà au maximum' : raisons[r.raison]); PSONS.jouer('refus', 0.6); } },
    arme(i) { if (jeu && !enPause) ZJEU.changerArme(jeu, idMoi, i); },
    pause() { pause(); },
    passer() { if (jeu && !enPause) ZJEU.passer(jeu); },
  });
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
    if (nom === 'titre') { remplirArenes(); if (!demo) nouvelleDemo(); }
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
    arene = D.ARENES[id] ? id : arene;
    jeu = ZJEU.creer({ arene, graine: graine != null ? graine : (Math.random() * 1e9) | 0, joueurs: [{ id: idMoi, pseudo: 'Moi' }] });
    demo = null; enPause = false; acc = 0; debut = Date.now();
    ZHUD.reinit(); ZCONTROLES.reinit();
    montrer('jeu');
    ZHUD.annonce(D.ARENES[arene].nom.toUpperCase(), 'Les zombies arrivent…', 2.2);
    return jeu;
  }
  function pause() {
    if (ecran !== 'jeu' || !jeu || jeu.fini) return;
    enPause = true; ZCONTROLES.activer(false);
    $('#ecran-pause .resume').textContent = `Vague ${Math.max(1, jeu.vague)} · ${jeu.joueurs[0].tues} zombies · ${jeu.joueurs[0].score} points`;
    ecrans.pause.hidden = false; document.body.dataset.ecran = 'pause'; ecran = 'jeu'; // l'écran de jeu reste dessous, figé
    try { PSONS.suspendre(true); } catch (e) { /* rien */ }
  }
  function reprendre() {
    ecrans.pause.hidden = true; ecrans.reglages.hidden = true; enPause = false; derT = 0; acc = 0;
    document.body.dataset.ecran = 'jeu'; ZCONTROLES.activer(true);
    try { PSONS.suspendre(false); } catch (e) { /* rien */ }
  }
  function finir() {
    const j = jeu.joueurs[0], r = save.records[arene] || { vague: 0, score: 0, tues: 0, parties: 0 };
    const record = j.score > r.score || jeu.vague > r.vague;
    r.parties++; r.vague = Math.max(r.vague, jeu.vague); r.score = Math.max(r.score, j.score); r.tues = Math.max(r.tues, j.tues);
    save.records[arene] = r; save.total.parties++; save.total.tues += j.tues; save.total.temps += Math.round(jeu.t); save.derniere = Date.now();
    ecrire();
    const nouvelle = D.ORDRE_ARENES.find((id) => !save['vu_' + id] && debloquee(id) && id !== 'jardin');
    const min = Math.floor(jeu.t / 60), s = Math.floor(jeu.t % 60);
    $('.fin-chiffres').innerHTML = [
      ['Vague atteinte', jeu.vague], ['Zombies', j.tues], ['Score', j.score], ['Ferraille ramassée', jeu.stats.ferraille], ['Défenses posées', jeu.stats.construits], ['Temps', `${min} min ${String(s).padStart(2, '0')} s`],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('.fin-record').hidden = !record || r.parties <= 1 && j.score === 0;
    $('.fin-record').textContent = nouvelle ? `${D.ARENES[nouvelle].nom} débloqué !` : 'Nouveau record !';
    if (nouvelle) { save['vu_' + nouvelle] = true; ecrire(); $('.fin-record').hidden = false; }
    ZCONTROLES.activer(false);
    setTimeout(() => { if (jeu && jeu.fini) { ecran = 'fin'; document.body.dataset.ecran = 'fin'; ecrans.fin.hidden = false; } }, 1400);
  }
  function quitter() { jeu = null; enPause = false; for (const k in ecrans) ecrans[k].hidden = true; try { PSONS.suspendre(false); } catch (e) { /* rien */ } montrer('titre'); }

  // ─── les boutons des écrans ───
  const clic = (s, f) => $(s).addEventListener('click', (e) => { e.preventDefault(); try { PSONS.ui('tap'); } catch (err) { /* rien */ } f(); });
  clic('#b-jouer', () => demarrer(arene));
  clic('#b-reprendre', reprendre);
  clic('#b-recommencer', () => { ecrans.pause.hidden = true; try { PSONS.suspendre(false); } catch (e) { /* rien */ } demarrer(arene); });
  clic('#b-quitter', quitter);
  clic('#b-rejouer', () => { ecrans.fin.hidden = true; demarrer(arene); });
  clic('#b-menu', () => { ecrans.fin.hidden = true; quitter(); });
  const ouvrirReglages = (depuis) => {
    retourReglages = depuis; $('#r-son').checked = save.reglages.son; $('#r-vibre').checked = save.reglages.vibre; $('#r-eco').checked = save.reglages.eco;
    ecrans.reglages.hidden = false; if (depuis === 'titre') ecrans.titre.hidden = true; else ecrans.pause.hidden = true;
  };
  clic('#b-reglages', () => ouvrirReglages('titre'));
  clic('#b-pause-reglages', () => ouvrirReglages('pause'));
  clic('#b-reglages-ok', () => {
    save.reglages.son = $('#r-son').checked; save.reglages.vibre = $('#r-vibre').checked;
    const eco = $('#r-eco').checked; if (eco !== save.reglages.eco) { save.reglages.eco = eco; rendu.qualite(eco ? 'eco' : 'haute'); }
    ecrire(); reglerSons(); ecrans.reglages.hidden = true;
    if (retourReglages === 'pause') ecrans.pause.hidden = false; else ecrans.titre.hidden = false;
  });
  if (window.ZOMBIES_ACCUEIL) $('#b-accueil').href = window.ZOMBIES_ACCUEIL;

  // en arrière-plan : pause (et plus d'images)
  document.addEventListener('visibilitychange', () => { if (document.hidden && ecran === 'jeu' && jeu && !jeu.fini && !enPause) pause(); });

  // ─── la boucle ───
  function avancer(j, entrees, dt) {
    acc += dt; let n = 0; evs.length = 0;
    while (acc >= PAS && n < 5) { const e = ZJEU.pas(j, entrees, PAS); for (let i = 0; i < e.length; i++) evs.push(e[i]); acc -= PAS; n++; }
    if (n === 5) acc = 0;
  }
  const entrees = { moi: null };
  let fige = false;
  function boucle(t) {
    requestAnimationFrame(boucle);
    const dt = derT ? Math.min(0.1, (t - derT) / 1000) : PAS; derT = t;
    if (document.hidden) return;
    if (jeu && (ecran === 'jeu' || ecran === 'fin')) {
      if (enPause) { if (!fige) { rendu.image(jeu, idMoi, 0, null); fige = true; } return; }
      fige = false;
      if (!jeu.fini) {
        entrees.moi = ZCONTROLES.lire(); avancer(jeu, entrees, dt);
        ZSONS.evenements(evs, jeu, idMoi, dt);
        ZHUD.maj(jeu, idMoi, dt, evs);
        rendu.image(jeu, idMoi, dt, evs);
        if (jeu.fini) finir();
      } else rendu.image(jeu, idMoi, dt, null);
    } else if (demo) {
      const j = demo.joueurs[0]; j.invul = 99; j.vie = j.vieMax;
      avancer(demo, null, dt);
      rendu.image(demo, 'moi', dt, evs);
      if (demo.vague > 3) nouvelleDemo();
    }
  }
  montrer('titre');
  requestAnimationFrame(boucle);

  // ─── pour les tests (Playwright) ───
  window.__zombies = {
    get jeu() { return jeu; }, get demo() { return demo; }, get ecran() { return ecran; }, get enPause() { return enPause; }, get save() { return JSON.parse(JSON.stringify(save)); },
    demarrer, pause, reprendre, montrer, quitter,
    avancer(n, e) { for (let i = 0; i < n && jeu && !jeu.fini; i++) { ZJEU.pas(jeu, e || null, PAS); } return jeu && { vague: jeu.vague, zombies: jeu.zombies.length, fini: jeu.fini }; },
    stats() { return { rendu: rendu.stats(), ecran, arene }; },
    ecranDe: (x, z) => rendu.ecranDe(x, z),
  };
})();
