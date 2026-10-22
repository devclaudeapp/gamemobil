/* LE FOURNIL — l'arrière-salle : le BlackJack et la roulette cachés, en plein écran par-dessus la boutique (comme l'Atelier). On la trouve
   en touchant cinq fois de suite la petite porte du fond dans la boutique en 3D (ui.js) ; ensuite, une carte discrète du Journal y ramène.
   Deux tables, une bascule en haut (st.arriere.table) : le BlackJack (on peut séparer une paire, « Le bon coup » conseille la stratégie de
   base si on l'allume : st.arriere.conseil) et la roulette européenne (un zéro), avec sa roue en 3D procédurale (aucun fichier : trois mille
   triangles bâtis à l'ouverture de la table, libérés à la fermeture ; on ne dessine que pendant que la bille tourne).
   Les règles sont ailleurs, pures et testées dans Node : src/blackjack.js (le sabot, les mains), src/roulette.js (le tirage d'abord : la roue
   ne fait que montrer un numéro déjà tiré et payé), src/casino.js (les trophées, les mini-objectifs, les statistiques, les skins). Ici : le
   tapis, les cartes dessinées en SVG, les jetons, les animations, les touches, et « Le carnet du croupier » (les mini-objectifs du jour, les
   trophées, les statistiques, les skins). Seule la caisse (st.coins) bouge : jamais la fortune, ni les points ; les récompenses sont des skins.
   Tant que la salle est ouverte, aucun événement surprise ne vient interrompre la main (ui.js la compte comme l'Atelier).
   Le commutateur de test window.__rouletteTirage (0 à 36) force le prochain numéro : lu ICI seulement, jamais posé par le jeu. */
const ARRIERE = (() => {
  'use strict';
  const G = GAME, B = BLACKJACK, R = typeof ROULETTE !== 'undefined' ? ROULETTE : null, C = typeof CASINO !== 'undefined' ? CASINO : null, $ = (s) => document.querySelector(s);
  let d = null, el, table, roul, panneau, dialogue, boite, annonce, resultatEl, zC, tC, mainsEl, coinsEl, miseEl, sousEl, bullesEl, pastille, tapisEl, histoEl, roueEl, numeroEl, roue2d;
  let hPanneau = 0, phase = '', choix = 'main', mises = { main: 0, paires: 0, plus3: 0 }, vue = vueNeuve(), minuteurs = [];
  let tableVue = 'blackjack', rPhase = 'mise', rMises = [], jetonPart = 0.01, vueTapis = 'chances', montre = null, rendu = null, enAttente = [], carnetOnglet = 'objectifs', caisseVue = null;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = () => d.st();
  const eur = (n) => G.fmtEur(n);
  const signe = (n) => (n > 0 ? `+${eur(n)}` : n < 0 ? `−${eur(-n)}` : '0 €');
  const NOM_CASE = { main: 'Mise', paires: 'Perfect Pairs', plus3: '21+3' };
  const maintenant = () => (typeof HORLOGE !== 'undefined' && HORLOGE.maintenant ? HORLOGE.maintenant() : st().now);
  const optsCasino = () => { const t = maintenant(); return { maintenant: t, jour: G.dayKey(t), G }; };
  function vueNeuve() { return { j: [0], separee: false, croupier: 0, cachee: true, main: null }; }

  // ─── les cartes, dessinées en SVG : l'index aux deux coins, la grande enseigne au centre, un médaillon pour les figures ───
  const ENS = [ // pique, cœur, carreau, trèfle (repère 24 × 24)
    '<path d="M12 2.6C9.4 5.6 3 9.6 3 14.1c0 2.6 2 4.5 4.5 4.5 1.5 0 2.8-.7 3.6-1.9-.2 1.9-.9 3.3-2.3 4.7h6.4c-1.4-1.4-2.1-2.8-2.3-4.7.8 1.2 2.1 1.9 3.6 1.9 2.5 0 4.5-1.9 4.5-4.5 0-4.5-6.4-8.5-9-11.5z"/>',
    '<path d="M12 21.2S2.6 15.3 2.6 9c0-2.9 2.2-5.2 5-5.2 1.9 0 3.5 1 4.4 2.6.9-1.6 2.5-2.6 4.4-2.6 2.8 0 5 2.3 5 5.2 0 6.3-9.4 12.2-9.4 12.2z"/>',
    '<path d="M12 2.4c2.3 3.5 5 6.6 8.2 9.6-3.2 3-5.9 6.1-8.2 9.6-2.3-3.5-5-6.6-8.2-9.6 3.2-3 5.9-6.1 8.2-9.6z"/>',
    '<circle cx="12" cy="7.3" r="4.3"/><circle cx="7" cy="13.4" r="4.3"/><circle cx="17" cy="13.4" r="4.3"/><path d="M12 11.5c0 4.3-1.1 7-3.3 9.8h6.6c-2.2-2.8-3.3-5.5-3.3-9.8z"/>',
  ];
  const ROUGE = '#E1496C', NOIR = '#3A2A22';
  const svgEns = (s, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="${s === 1 || s === 2 ? ROUGE : NOIR}">${ENS[s]}</svg>`;
  const FIGURES = { 11: ['V', '#EFEAFF', '#9A84F0'], 12: ['D', '#FFE9EE', '#FF6B8B'], 13: ['R', '#FFF3C4', '#E0A61E'] };
  function faceCarte(c) {
    const h = B.hauteur(c), s = B.enseigne(c), r = B.RANGS[h], coul = s === 1 || s === 2 ? ROUGE : NOIR;
    const index = `<span class="ix" style="color:${coul}"><b>${r}</b>${svgEns(s, 'ix-e')}</span>`;
    let centre;
    if (FIGURES[h]) { const [l, fond, bord] = FIGURES[h]; centre = `<span class="figure" style="background:${fond};border-color:${bord}"><b style="color:${coul}">${l}</b>${svgEns(s, 'fig-e')}${h === 13 ? '<i class="couronne"></i>' : ''}</span>`; }
    else centre = svgEns(s, h === 1 ? 'grand as' : 'grand');
    return `${index}${centre}<span class="ix bas" style="color:${coul}"><b>${r}</b>${svgEns(s, 'ix-e')}</span>`;
  }
  function carteEl(c, cachee) {
    const e = document.createElement('div'); e.className = 'ar-carte' + (cachee ? ' cachee' : ''); e.dataset.carte = B.nomCarte(c);
    e.setAttribute('role', 'img'); e.setAttribute('aria-label', cachee ? 'carte cachée' : nomLong(c));
    e.innerHTML = `<div class="recto">${faceCarte(c)}</div><div class="verso"></div>`;
    return e;
  }
  const NOMS_H = ['', 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'], NOMS_E = ['de pique', 'de cœur', 'de carreau', 'de trèfle'];
  const nomLong = (c) => `${NOMS_H[B.hauteur(c)]} ${NOMS_E[B.enseigne(c)]}`;
  function miniCartes(t) { // un petit exemple pour le tableau des gains : 'A♠ 2♥' → deux mini-cartes
    return `<span class="mini-cartes">${t.split(' ').map((x) => { const m = /^(A|[2-9]|10|V|D|R)([♠♥♦♣])$/.exec(x), s = B.SYMBOLES.indexOf(m[2]); return `<span class="mc" style="color:${s === 1 || s === 2 ? ROUGE : NOIR}">${m[1]}${svgEns(s, 'mc-e')}</span>`; }).join('')}</span>`;
  }

  // ─── le croupier, un petit personnage en SVG ; sa tenue est un skin (gilet, smoking, canotier, tablier de boulanger) ───
  function croupierSVG(tenue) {
    const peau = '#F2C9A0', trait = '#4A3328';
    const corps = {
      gilet: `<path d="M7 40c0-8 5-12 13-12s13 4 13 12z" fill="#FFFDF8"/><path d="M11 40c0-7 2-10 6-11l3 5 3-5c4 1 6 4 6 11z" fill="#2E8C63"/><path d="M17 30.5l3 2 3-2-3 3.4z" fill="#E1496C"/>`,
      smoking: `<path d="M7 40c0-8 5-12 13-12s13 4 13 12z" fill="#22201F"/><path d="M16.5 29l3.5 8 3.5-8z" fill="#FFFDF8"/><path d="M17 30.6l3 1.6 3-1.6-3 2.6z" fill="#22201F"/>`,
      canotier: `<path d="M7 40c0-8 5-12 13-12s13 4 13 12z" fill="#E1496C"/><path d="M11 40V31M15.5 40v-11M24.5 40v-11M29 40v-9" stroke="#FFF1D6" stroke-width="2"/><path d="M17 29.6l3 3.4 3-3.4z" fill="#FFFDF8"/>`,
      tablier: `<path d="M7 40c0-8 5-12 13-12s13 4 13 12z" fill="#F3E3C0"/><path d="M13.5 40V31.5h13V40z" fill="#FFFDF8"/><path d="M13.5 31.5l-3-3M26.5 31.5l3-3" stroke="#8C6F62" stroke-width="1.4"/>`,
    }[tenue] || '';
    const tete = `<circle cx="20" cy="19" r="7.6" fill="${peau}"/><circle cx="17.3" cy="19.4" r=".9" fill="${trait}"/><circle cx="22.7" cy="19.4" r=".9" fill="${trait}"/><path d="M17.8 22.6c1.3 1 3.1 1 4.4 0" stroke="${trait}" stroke-width="1.1" fill="none" stroke-linecap="round"/><circle cx="15.6" cy="21.6" r="1.1" fill="#FF8FA6" opacity=".6"/><circle cx="24.4" cy="21.6" r="1.1" fill="#FF8FA6" opacity=".6"/>`;
    const tetiere = {
      canotier: `<ellipse cx="20" cy="13.2" rx="11" ry="2.4" fill="#E8C77A"/><path d="M14.2 13V8.6c0-1 2.6-1.8 5.8-1.8s5.8.8 5.8 1.8V13z" fill="#E8C77A"/><path d="M14.2 11.2h11.6v1.8H14.2z" fill="#E1496C"/>`,
      tablier: `<path d="M13.5 14.2h13v-3c2.2-.4 3.4-2.2 2.6-4-.7-1.6-2.6-2.1-4-1.2-.7-1.8-2.6-2.8-5.1-2.8s-4.4 1-5.1 2.8c-1.4-.9-3.3-.4-4 1.2-.8 1.8.4 3.6 2.6 4z" fill="#FFFDF8" stroke="#E6D9CB" stroke-width=".8"/>`,
    }[tenue] || `<path d="M12.6 18.4c-.4-5.4 3-8.4 7.4-8.4s7.8 3 7.4 8.4c-1.2-2.4-3.6-3.6-7.4-3.6s-6.2 1.2-7.4 3.6z" fill="#6B4632"/>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true">${corps}${tete}${tetiere}</svg>`;
  }

  // ─── les skins : posés en attributs sur #arriere (le tapis, le dos des cartes, les jetons, le croupier), la roue suit sa finition ───
  const skin = (cat) => (C ? C.skinChoisi(st(), cat) : '');
  function appliquerSkins() {
    if (!el || !C) return;
    for (const cat of ['tapis', 'dos', 'jetons', 'croupier', 'roue']) el.dataset[cat] = skin(cat);
    el.querySelectorAll('.ar-perso').forEach((p) => { p.innerHTML = croupierSVG(skin('croupier')); });
    if (rendu && !rendu.sans && rendu.finition !== skin('roue')) refaireRoue();
  }

  // ─── ouvrir, fermer ───
  function init(deps) {
    d = deps; el = $('#arriere'); if (!el) return;
    table = $('#ar-table'); roul = $('#ar-roulette'); panneau = $('#ar-panneau'); dialogue = $('#ar-dialogue'); boite = dialogue.querySelector('.ar-boite'); annonce = $('#ar-annonce'); resultatEl = $('#ar-resultat');
    mainsEl = $('#ar-mains'); zC = $('#ar-croupier'); tC = $('#ar-tc'); coinsEl = $('#ar-coins'); miseEl = $('#ar-mise'); sousEl = $('#ar-sous'); bullesEl = $('#ar-bulles'); pastille = $('#ar-pastille');
    tapisEl = $('#ar-tapis'); histoEl = $('#ar-histo'); roueEl = $('#ar-roue'); numeroEl = $('#ar-numero'); roue2d = $('#ar-roue-2d');
    boites(1);
    el.querySelector('[data-ar="fermer"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
    el.querySelector('[data-ar="gains"]').addEventListener('click', () => { d.audio(); d.son.tap(); tableauGains(); });
    el.querySelector('[data-ar="carnet"]').addEventListener('click', () => { d.audio(); d.son.tap(); carnet(); });
    el.querySelectorAll('.ar-bascule [data-table]').forEach((b) => b.addEventListener('click', () => { d.audio(); if (b.dataset.table === tableVue) return; if (!basculeLibre()) { d.son.non(); return; } d.son.tap(); montrerTable(b.dataset.table); d.save(); }));
    el.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => { if (phase !== 'mise') return; d.audio(); d.son.tap(); choix = b.dataset.case; majCases(); majPanneau(); }));
    if (R) { tapisEl.innerHTML = tapisHTML(); tapisEl.addEventListener('click', toucheTapis); roue2d.style.background = roue2dFond(); }
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || el.hidden) return; if (!dialogue.hidden && dialogue.dataset.type !== 'accueil') fermerDialogue(); else if (dialogue.hidden) fermer(); });
    dialogue.addEventListener('click', (e) => { if (e.target === dialogue && (dialogue.dataset.type === 'gains' || dialogue.dataset.type === 'carnet')) fermerDialogue(); });
  }
  const ouvert = () => !!el && !el.hidden;
  function ouvrir() {
    if (!el) return false;
    const s = st(), a = B.etat(s); a.trouvee = true;
    if (typeof a.conseil !== 'boolean') a.conseil = false; // « Le bon coup » : éteint par défaut
    if (a.table !== 'roulette' || !R) a.table = 'blackjack';
    if (a.main && !a.main.fin) a.table = 'blackjack'; // une main en cours attend sur le tapis vert
    el.hidden = false; d.ouvert(); hPanneau = 0; el.style.removeProperty('--panneau-h');
    annuler(); fermerDialogue();
    // la main en cours (l'appli fermée au milieu, ou la salle quittée) reprend là où elle était ; sinon, les dernières mises
    const h = a.main;
    vue = vueNeuve(); boites(1); zC.innerHTML = ''; resultatEl.hidden = true; annonce.hidden = true;
    mises = B.borner(s, a.mises); delete mises.total; delete mises.tapis; // « même mise » : les dernières mises, ramenées à la caisse
    if (h) poserTout(h);
    if (h && !h.fin) phase = 'jeu';
    else { phase = 'mise'; if (h) montrerResultat(h, false); } // la dernière main reste sur le tapis jusqu'à la prochaine donne
    choix = 'main';
    // la roulette : la table est au repos (le dernier tour était réglé dès le lancer) ; ses dernières mises attendent « même mise »
    rPhase = 'mise'; rMises = []; caisseVue = null; numeroEl.hidden = true;
    if (R) { const r = R.etat(s); montre = r.dernier ? { tour: r.dernier } : null; }
    // le casino : les mini-objectifs du jour, et ce qui n'a pas encore été compté (l'appli fermée juste après une main)
    if (C) {
      C.objectifs(s, optsCasino().jour);
      if (h && h.fin && !h.compte) noter(C.apresMain(s, h, optsCasino()));
      if (montre && !montre.tour.compte) noter(C.apresTour(s, montre.tour, optsCasino()));
    }
    appliquerSkins();
    montrerTable(a.table);
    if (!a.accueil) accueil();
    montrerBulles();
    d.save();
    return true;
  }
  function fermer() {
    if (!el || el.hidden) return;
    annuler(); fermerDialogue(); libererRoue(); el.hidden = true; phase = ''; rPhase = 'mise'; caisseVue = null; roul.classList.remove('tourne');
    bullesEl.innerHTML = '';
    if (d.ferme) d.ferme();
  }
  const annuler = () => { minuteurs.forEach(clearTimeout); minuteurs = []; };
  const plus = (ms, f) => { minuteurs.push(setTimeout(f, reduceMotion ? Math.min(ms, 60) : ms)); };
  // la bascule BlackJack / roulette : pas au milieu d'une main ni pendant que la bille tourne
  const basculeLibre = () => (tableVue === 'blackjack' ? phase === 'mise' : rPhase === 'mise') && dialogue.hidden;
  function montrerTable(t) {
    tableVue = t === 'roulette' && R ? 'roulette' : 'blackjack';
    B.etat(st()).table = tableVue; el.dataset.table = tableVue;
    table.hidden = tableVue !== 'blackjack'; roul.hidden = tableVue !== 'roulette';
    el.querySelectorAll('.ar-bascule [data-table]').forEach((b) => b.setAttribute('aria-selected', b.dataset.table === tableVue ? 'true' : 'false'));
    sousEl.textContent = tableVue === 'roulette' ? 'Roulette · un seul zéro' : 'BlackJack · sabot de 6 jeux';
    hPanneau = 0; el.style.removeProperty('--panneau-h');
    if (tableVue === 'roulette') construireRoue(); else libererRoue(); // la roue n'existe que table ouverte
    maj();
    if (tableVue === 'roulette') majRoue();
  }

  // ─── les petites bulles du casino (trophée, mini-objectif, jeton d'or), en haut de la salle ───
  function noter(out) { if (out && (out.trophees.length || out.objectifs.some((o) => o.nouveau))) enAttente.push(out); }
  function nomRecompense(rec) {
    if (!rec) return '';
    if (rec.titre) return 'le titre « Main de velours »';
    const x = C && (C.SKINS[rec.categorie] || []).find((y) => y.id === rec.skin);
    return x ? `${C.NOMS_CATEGORIES[rec.categorie].toLowerCase()} « ${x.nom} »` : '';
  }
  function montrerBulles() {
    if (!enAttente.length || !el || el.hidden) return;
    const liste = enAttente; enAttente = [];
    let n = 0;
    for (const out of liste) {
      for (const t of out.trophees) bulle(`<i class="ico">${ICONS.UI.trophee}</i><span><b>Trophée : ${esc(t.nom)}</b><small>Débloqué : ${esc(nomRecompense(t.recompense))}</small></span>`, 'trophee', n++);
      const faits = out.objectifs.filter((o) => o.nouveau);
      for (const o of faits) bulle(`<i class="ico">${ICONS.UI.jetonOr}</i><span><b>Mini-objectif réussi</b><small>${esc(o.txt)}${out.jetons ? ` · +${out.jetons} jeton${out.jetons > 1 ? 's' : ''} d’or` : ''}</small></span>`, 'objectif', n++);
    }
    if (n) { d.son.deblocage(); d.buzz([10, 30, 10]); pastille.hidden = false; }
  }
  function bulle(html, cls, k) {
    const b = document.createElement('div'); b.className = 'ar-bulle ' + cls; b.innerHTML = html;
    setTimeout(() => { if (!bullesEl || !el || el.hidden) return; bullesEl.appendChild(b); while (bullesEl.children.length > 3) bullesEl.firstChild.remove(); setTimeout(() => b.remove(), 4200); }, (k || 0) * 450);
  }

  // ─── les dialogues : le mot de la première fois, le tableau des gains, la confirmation du tapis, le carnet du croupier ───
  function ouvrirDialogue(type, html, lier) { dialogue.dataset.type = type; boite.className = 'ar-boite ' + (type === 'carnet' ? 'calepin' : type); boite.innerHTML = html; dialogue.hidden = false; if (lier) lier(boite); } // (.carnet est déjà la liste du Journal : le carnet du croupier s'appelle « calepin » en CSS)
  function fermerDialogue() { if (!dialogue) return; dialogue.hidden = true; dialogue.dataset.type = ''; boite.innerHTML = ''; }
  function accueil() {
    ouvrirDialogue('accueil', `<span class="ar-pic">${ICONS.UI.arriere}</span>
      <h3>Tu as trouvé l’arrière&#8209;salle…</h3>
      <p>Derrière la petite porte du fond : une lampe basse, un tapis vert, un sabot de six jeux et une roulette. On y joue l’argent de la caisse, <b>tout ou rien</b>.</p>
      <p class="ar-petit">Rien de ce qui se gagne ou se perd ici ne compte pour le classement ni pour ta fortune. La carte « L’arrière-salle » du Journal t’y ramènera.</p>
      <button type="button" class="btn large beurre" data-ar="asseoir"><b>S’asseoir à la table</b></button>`, (b) => {
      b.querySelector('[data-ar="asseoir"]').addEventListener('click', () => { d.audio(); d.son.tap(); B.etat(st()).accueil = true; d.save(); fermerDialogue(); });
    });
  }
  function tableauGains() {
    const tete = (t) => `<div class="ar-boite-tete"><h3>${t}</h3><button type="button" class="at-fermer" data-ar="ok" aria-label="Fermer le tableau des gains"><i class="ico">${ICONS.UI.fermer}</i></button></div>`;
    const ligne = (nom, ex, mult) => `<li><span>${nom}${ex ? miniCartes(ex) : ''}</span><b>${mult}</b></li>`;
    let html;
    if (tableVue === 'roulette' && R) {
      const S = R.etat(st()).stats;
      html = `${tete('Le tableau des gains')}
      <h4>Les chances simples <small>18 numéros</small></h4><ul class="ar-gains">${ligne('Rouge ou noir', '', '1 pour 1')}${ligne('Pair ou impair', '', '1 pour 1')}${ligne('Manque (1–18) ou passe (19–36)', '', '1 pour 1')}</ul>
      <h4>Douzaines et colonnes <small>12 numéros</small></h4><ul class="ar-gains">${ligne('Une douzaine (1–12, 13–24, 25–36)', '', '2 pour 1')}${ligne('Une colonne', '', '2 pour 1')}</ul>
      <h4>Le plein <small>un numéro</small></h4><ul class="ar-gains">${ligne('Un numéro, le zéro compris', '', '35 pour 1')}</ul>
      <p class="ar-petit">Roulette européenne : 37 cases, un seul zéro. Le zéro fait perdre toutes les chances simples, les douzaines et les colonnes. Le numéro est tiré dès que tu lances : la roue ne fait que le montrer.</p>
      <p class="ar-petit">${S.tours ? `Ici : ${G.fmt(S.tours)} tour${S.tours > 1 ? 's' : ''}, ${G.fmt(S.gagnes)} gagné${S.gagnes > 1 ? 's' : ''}, ${G.fmt(S.pleins)} plein${S.pleins > 1 ? 's' : ''}.` : 'Aucun tour joué pour l’instant.'}</p>`;
    } else {
      const P = B.PAIRES, T = B.VINGT_ET_UN_PLUS_TROIS, S = B.etat(st()).stats;
      html = `${tete('Le tableau des gains')}
      <h4>La main</h4><ul class="ar-gains">${ligne('BlackJack (as + 10 ou figure)', 'A♠ R♥', '3 pour 2')}${ligne('Main gagnante', '', '1 pour 1')}${ligne('21 après un partage', 'A♠ R♥', '1 pour 1')}${ligne('Égalité', '', 'mise rendue')}</ul>
      <h4>Perfect Pairs <small>tes deux premières cartes</small></h4><ul class="ar-gains">${ligne('Paire mixte', '7♥ 7♠', `${P.mixte} pour 1`)}${ligne('Paire de couleur', '7♥ 7♦', `${P.couleur} pour 1`)}${ligne('Paire parfaite', '7♠ 7♠', `${P.parfaite} pour 1`)}</ul>
      <h4>21+3 <small>tes deux cartes et celle du croupier</small></h4><ul class="ar-gains">${ligne('Couleur', '2♥ 9♥ R♥', `${T.couleur} pour 1`)}${ligne('Quinte', '4♠ 5♥ 6♦', `${T.quinte} pour 1`)}${ligne('Brelan', '9♠ 9♥ 9♦', `${T.brelan} pour 1`)}${ligne('Quinte couleur', 'V♣ D♣ R♣', `${T.quinteCouleur} pour 1`)}${ligne('Brelan de même enseigne', '9♦ 9♦ 9♦', `${T.brelanCouleur} pour 1`)}</ul>
      <p class="ar-petit">Sabot de 6 jeux, re-mélangé passé les trois quarts. Le croupier tire jusqu’à 17 et reste sur 17 souple. Doubler sur les deux premières cartes. Séparer une paire une fois (deux cartes de même valeur, la seconde mise égale à la première) ; as séparés : une carte chacun ; 21 après partage payé 1 pour 1 ; pas de double après partage. Pas d’assurance. Les mises annexes se posent avant la donne.</p>
      <p class="ar-petit">${S.mains ? `Ici : ${G.fmt(S.mains)} main${S.mains > 1 ? 's' : ''}, ${G.fmt(S.gagnees)} gagnée${S.gagnees > 1 ? 's' : ''}, ${G.fmt(S.blackjacks)} BlackJack${S.blackjacks > 1 ? 's' : ''}.` : 'Aucune main jouée pour l’instant.'}</p>`;
    }
    ouvrirDialogue('gains', html, (b) => { b.querySelector('[data-ar="ok"]').addEventListener('click', () => { d.son.tap(); fermerDialogue(); }); });
  }
  function confirmerTapis(total, suite, roulette) {
    ouvrirDialogue('tapis', `<span class="ar-pic tapis">${roulette ? ICONS.UI.roulette : ICONS.UI.cartes}</span>
      <h3>Tapis ?</h3>
      <p>Tu mets <b>toute la caisse</b> en jeu : <b class="ar-somme">${eur(total)}</b>.</p>
      <p class="ar-petit">${roulette ? 'Perdue, la caisse est vide. Le zéro fait perdre toutes les chances simples.' : 'Perdue, la caisse est vide. Gagnée, elle double (et un BlackJack paie 3 pour 2).'}</p>
      <div class="ar-choix"><button type="button" class="btn large clair" data-ar="non"><b>Pas cette fois</b></button><button type="button" class="btn large" data-ar="oui"><b>Oui, tapis !</b></button></div>`, (b) => {
      b.querySelector('[data-ar="non"]').addEventListener('click', () => { d.son.tap(); fermerDialogue(); maj(); });
      b.querySelector('[data-ar="oui"]').addEventListener('click', () => { d.audio(); fermerDialogue(); suite(); });
    });
  }

  // ─── le carnet du croupier : les mini-objectifs du jour, les trophées du casino, les statistiques, les skins ───
  const ONGLETS = [['objectifs', 'Objectifs'], ['trophees', 'Trophées'], ['stats', 'Stats'], ['skins', 'Skins']];
  function apercu(cat, id) {
    if (cat === 'croupier') return `<span class="ap ap-croupier">${croupierSVG(id)}</span>`;
    if (cat === 'roue') { const f = FINITIONS[id] || FINITIONS.classique; return `<span class="ap ap-roue" style="--r:${f.rouge};--n:${f.noir};--v:${f.vert};--b:${f.bois};--m:${f.metal}"></span>`; }
    if (cat === 'tapis') return `<span class="ap ap-tapis" data-tapis="${id}"></span>`;
    if (cat === 'dos') return `<span class="ap ap-dos" data-dos="${id}"><i class="verso"></i></span>`;
    return `<span class="ap ap-jeton" data-jetons="${id}"><i></i></span>`;
  }
  const nomTrophee = (id) => (C.TROPHEES.find((t) => t.id === id) || {}).nom || '';
  function carnet(onglet) {
    if (!C) return;
    const meme = !onglet || onglet === carnetOnglet;
    if (onglet) carnetOnglet = onglet;
    pastille.hidden = true;
    const s = st(), c = C.etat(s), objs = C.objectifs(s, optsCasino().jour), x = carnetOnglet;
    let corps = '';
    if (x === 'objectifs') {
      corps = `<div class="ar-or"><span class="ico">${ICONS.UI.jetonOr}</span><span><b>${G.fmt(c.jetonsOr)} jeton${c.jetonsOr > 1 ? 's' : ''} d’or</b><small>Aujourd’hui : ${c.jetonsJour} sur ${C.JETONS_JOUR_MAX} · ils débloquent des skins</small></span></div>
        <ul class="ar-objs">${objs.map((o) => `<li class="${o.fait ? 'fait' : ''}" data-obj="${esc(o.type)}"><span class="t"><b>${esc(o.txt)}</b><span class="mini"><i style="width:${Math.round(100 * Math.min(1, o.progres / o.cible))}%"></i></span></span><b class="n">${o.fait ? `<i class="ico">${ICONS.UI.coche}</i>` : `${o.progres}/${o.cible}`}</b></li>`).join('')}</ul>
        <p class="ar-petit">Trois par jour, renouvelés à minuit. Une main ou un tour compte dès que sa mise atteint 0,5 % de la caisse (1 € au moins) : inutile de miser gros. Un jeton d’or par objectif, un de plus pour les trois.</p>`;
    } else if (x === 'trophees') {
      const tr = C.trophees(s), g = tr.filter((t) => t.gagne), a = tr.filter((t) => !t.gagne);
      const li = (t) => `<li class="${t.gagne ? 'gagne' : ''}" data-trophee="${t.id}"><span class="pic">${ICONS.UI.trophee}</span><span><b>${esc(t.nom)}</b><small>${esc(t.desc)}</small><em>${t.gagne ? 'Débloqué' : 'Débloque'} : ${esc(nomRecompense(t.recompense))}</em></span></li>`;
      corps = `<p class="ar-petit">${g.length} sur ${tr.length}. Ils ne rapportent que des skins et un titre : jamais d’argent ni de points.</p><ul class="ar-trophs">${g.map(li).join('')}${a.map(li).join('')}</ul>`;
    } else if (x === 'stats') {
      const S = C.stats(s), b = S.blackjack, r = S.roulette;
      const l = (k, v, cls) => `<li><span>${k}</span><b class="${cls || ''}">${v}</b></li>`;
      corps = `<h4>BlackJack</h4><ul class="ar-gains ar-stats" data-jeu="blackjack">${l('Mains jouées', G.fmt(b.mains))}${l('Gagnées · perdues · égalités', `${G.fmt(b.gagnees)} · ${G.fmt(b.perdues)} · ${G.fmt(b.egalites)}`)}${l('Solde', signe(b.solde), b.solde > 0 ? 'plus' : b.solde < 0 ? 'moins' : '')}${l('Plus gros gain', b.plusGrosGain > 0 ? eur(b.plusGrosGain) : '—')}${l('Meilleure série', G.fmt(b.meilleureSerie))}${l('BlackJacks', G.fmt(b.blackjacks))}${l('Partages · doubles', `${G.fmt(b.separees)} · ${G.fmt(b.doubles)}`)}</ul>
        <h4>Roulette</h4><ul class="ar-gains ar-stats" data-jeu="roulette">${l('Tours joués', G.fmt(r.tours))}${l('Gagnés · perdus · égalités', `${G.fmt(r.gagnes)} · ${G.fmt(r.perdus)} · ${G.fmt(r.egalites)}`)}${l('Solde', signe(r.solde), r.solde > 0 ? 'plus' : r.solde < 0 ? 'moins' : '')}${l('Plus gros gain', r.plusGrosGain > 0 ? eur(r.plusGrosGain) : '—')}${l('Meilleure série', G.fmt(r.meilleureSerie))}${l('Pleins gagnés', G.fmt(r.pleins))}</ul>
        <p class="ar-petit">Le solde ne compte que la caisse : la fortune et le classement n’en savent rien.</p>`;
    } else {
      const sk = C.skins(s);
      const etat = (y) => (y.choisi ? 'Choisi' : y.debloque ? 'Choisir' : y.prix ? `${y.prix} jetons d’or` : `Trophée « ${esc(nomTrophee(y.trophee))} »`);
      corps = `<div class="ar-or petit"><span class="ico">${ICONS.UI.jetonOr}</span><span><b>${G.fmt(c.jetonsOr)} jeton${c.jetonsOr > 1 ? 's' : ''} d’or</b><small>Purement pour le plaisir des yeux</small></span></div>
        ${C.CATEGORIES.map((cat) => `<h4>${esc(C.NOMS_CATEGORIES[cat])}</h4><div class="ar-skins">${sk[cat].map((y) => `<button type="button" class="ar-skin${y.choisi ? ' choisi' : ''}${y.debloque ? '' : ' verrou'}" data-skin="${cat}:${y.id}" aria-pressed="${y.choisi}">${apercu(cat, y.id)}<b>${esc(y.nom)}</b><small>${etat(y)}</small></button>`).join('')}</div>`).join('')}`;
    }
    const html = `<div class="ar-boite-tete"><h3>Le carnet du croupier</h3><button type="button" class="at-fermer" data-ar="ok" aria-label="Fermer le carnet"><i class="ico">${ICONS.UI.fermer}</i></button></div>
      <div class="ar-onglets" role="tablist">${ONGLETS.map(([k, t]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="${k === x}">${t}</button>`).join('')}</div>
      <div class="ar-carnet" data-onglet="${x}">${corps}</div>`;
    const ancien = boite.querySelector('.ar-carnet'), defile = dialogue.dataset.type === 'carnet' && meme && ancien ? ancien.scrollTop : 0; // seul le contenu défile : la croix et les onglets restent en haut
    ouvrirDialogue('carnet', html, (b) => {
      b.querySelector('[data-ar="ok"]').addEventListener('click', () => { d.son.tap(); fermerDialogue(); });
      b.querySelectorAll('[data-onglet]').forEach((t) => t.addEventListener('click', () => { d.son.tap(); carnet(t.dataset.onglet); }));
      b.querySelectorAll('[data-skin]').forEach((t) => t.addEventListener('click', () => { d.audio(); toucherSkin(t.dataset.skin); }));
    });
    boite.querySelector('.ar-carnet').scrollTop = defile;
  }
  function toucherSkin(cle) {
    const s = st(), [cat, id] = cle.split(':'), y = C.skins(s)[cat].find((z) => z.id === id);
    if (!y) return;
    if (!y.debloque) {
      if (!y.prix) { d.son.non(); bulle(`<i class="ico">${ICONS.UI.trophee}</i><span><b>${esc(y.nom)}</b><small>Se gagne avec le trophée « ${esc(nomTrophee(y.trophee))} »</small></span>`, 'info'); return; }
      const r = C.acheterSkin(s, id, cat);
      if (!r.ok) { d.son.non(); bulle(`<i class="ico">${ICONS.UI.jetonOr}</i><span><b>${esc(y.nom)} : ${y.prix} jetons d’or</b><small>Il en manque ${y.prix - r.jetonsOr} : les mini-objectifs du jour en donnent</small></span>`, 'info'); return; }
      d.son.achat();
    } else d.son.tap();
    C.choisirSkin(s, cat, id); appliquerSkins(); d.save(); carnet(carnetOnglet);
  }

  // ═══ LE BLACKJACK ═══
  // ─── les mises ───
  const caisse = () => Math.max(0, st().coins || 0);
  const totalMises = () => mises.main + mises.paires + mises.plus3;
  function borne() { if (phase === 'mise' && resultatEl) { resultatEl.hidden = true; etiquettes(null); } const b = B.borner(st(), mises); // une mise qui change : le résultat de la main d'avant s'efface du tapis
    mises = { main: b.main, paires: b.paires, plus3: b.plus3 }; }
  function ajouter(montant) { // un jeton : s'ajoute à la case choisie, sans jamais dépasser ce qui reste dans la caisse
    const reste = Math.max(0, caisse() - totalMises());
    if (!(reste > 0)) { d.son.non(); return; }
    mises[choix] += Math.min(montant, reste); d.son.achat(); d.buzz(6); borne(); maj();
  }
  function tapis() { mises[choix] += Math.max(0, caisse() - totalMises()); d.son.achat(); d.buzz([8, 20, 8]); borne(); maj(); }
  function ajuster(sens) { // le réglage fin : un cran rond, à la hausse ou à la baisse
    const cur = mises[choix], p = B.pas(Math.max(cur, B.jeton(st(), 0.1)));
    if (sens > 0) { const reste = Math.max(0, caisse() - totalMises()); if (!(reste > 0)) { d.son.non(); return; } mises[choix] = cur + Math.min(p, reste); }
    else { if (!(cur > 0)) { d.son.non(); return; } mises[choix] = Math.max(0, Math.ceil(cur / p - 1e-9) * p - p); }
    d.son.tap(); borne(); maj();
  }
  function effacer() { mises = { main: 0, paires: 0, plus3: 0 }; borne(); d.son.tap(); maj(); }
  function donner() {
    if (phase !== 'mise') return;
    borne();
    if (mises.main < B.MISE_MIN) { d.son.non(); return; }
    const m = B.borner(st(), mises);
    if (m.tapis) confirmerTapis(m.total, lancer, false); else lancer();
  }
  // une main finie est comptée tout de suite par le casino (trophées, mini-objectifs) ; ses bulles attendent la fin de l'animation
  function compter(h) { if (C && h && h.fin && !h.compte) noter(C.apresMain(st(), h, optsCasino())); }
  function lancer() {
    const s = st();
    const r = B.distribuer(s, mises); if (!r.ok) { d.son.non(); maj(); return; }
    compter(r.main);
    d.son.tap(); d.buzz(8);
    boites(1); zC.innerHTML = ''; vue = vueNeuve(); vue.main = r.main; resultatEl.hidden = true; annonce.hidden = true;
    if (r.melange) montrerAnnonce('Le croupier mélange un sabot neuf…', 'melange');
    d.save(); jouerVers(r.main, r.melange ? 700 : 0);
  }
  function action(quoi) {
    if (phase !== 'jeu') return;
    const s = st(), h = B.enCours(s); if (!h) return;
    const r = quoi === 'tirer' ? B.tirer(s) : quoi === 'doubler' ? B.doubler(s) : quoi === 'separer' ? B.separer(s) : B.rester(s);
    if (!r.ok) { d.son.non(); return; }
    compter(r.main);
    d.son.tap(); d.buzz(6); d.save(); jouerVers(r.main, 0);
  }

  // ─── les mains du joueur : une boîte par main (deux après un partage, côte à côte), chacune avec son total et, à la fin, son résultat ───
  function boites(n) {
    mainsEl.innerHTML = Array.from({ length: n }, (_, k) => `<div class="ar-boite-main" data-k="${k}"><span class="ar-total" hidden></span><div class="ar-main"></div><span class="ar-etiquette" hidden></span></div>`).join('');
    mainsEl.classList.toggle('deux', n === 2);
  }
  const zoneJ = (k) => mainsEl.children[k] && mainsEl.children[k].querySelector('.ar-main');
  const totJ = (k) => mainsEl.children[k] && mainsEl.children[k].querySelector('.ar-total');
  const cartesJ = (h, k) => (h.separee && vue.separee ? h.mains[k].cartes : h.joueur);

  // ─── la donne, animée : les cartes partent du sabot une à une ; la carte cachée se retourne ; le croupier tire ───
  function poserCarte(zone, c, cachee, anime) {
    const e = carteEl(c, cachee); zone.appendChild(e); serrer(zone); if (anime && d.son.carte) d.son.carte(); // le glissé de la carte
    if (anime && !reduceMotion) {
      const sab = table.querySelector('.ar-sabot').getBoundingClientRect(), r = e.getBoundingClientRect();
      e.style.setProperty('--dx', `${Math.round(sab.left + sab.width / 2 - (r.left + r.width / 2))}px`); e.style.setProperty('--dy', `${Math.round(sab.top + sab.height / 2 - (r.top + r.height / 2))}px`);
      e.classList.add('arrive');
    }
    return e;
  }
  function serrer(zone) { // une longue main se resserre ; à deux mains côte à côte, plus tôt ; le total passe au-dessus, à gauche
    const n = zone.children.length, deux = zone !== zC && mainsEl.classList.contains('deux');
    zone.style.setProperty('--n', n); zone.classList.toggle('serre', n >= 6 || (deux && n >= 4)); zone.classList.toggle('tres-serre', n >= 8 || (deux && n >= 6));
    if (zone.parentElement) zone.parentElement.classList.toggle('large', n >= 5);
  }
  function retourner() { const e = zC.children[1]; if (e && e.classList.contains('cachee')) { e.classList.remove('cachee'); e.setAttribute('aria-label', nomLong(B.etat(st()).main.croupier[1])); } vue.cachee = false; majTotaux(); }
  function poserTout(h) { // sans animation : la main telle qu'elle est (retour dans la salle)
    zC.innerHTML = ''; vue = vueNeuve(); vue.main = h; vue.separee = !!(h.separee && Array.isArray(h.mains));
    boites(vue.separee ? 2 : 1);
    if (vue.separee) vue.j = h.mains.map((m, k) => { m.cartes.forEach((c) => poserCarte(zoneJ(k), c, false, false)); return m.cartes.length; });
    else { h.joueur.forEach((c) => poserCarte(zoneJ(0), c, false, false)); vue.j = [h.joueur.length]; }
    h.croupier.forEach((c, k) => poserCarte(zC, c, k === 1 && h.cachee, false));
    vue.croupier = h.croupier.length; vue.cachee = h.cachee; majTotaux(); marquerActive(h);
  }
  function jouerVers(h, attente) {
    phase = 'anim'; maj();
    const pas = []; const P = 300, RC = 420; // le rythme : une carte toutes les 0,3 s ; le croupier prend son temps
    const initiale = vue.j[0] === 0 && !vue.separee;
    if (initiale) pas.push(['j', 0, P], ['c', 0, P], ['j', 0, P], ['c', 0, P]);
    if (!h.separee) for (let k = initiale ? 2 : vue.j[0]; k < h.joueur.length; k++) pas.push(['j', 0, P]);
    else {
      const depart = vue.separee ? vue.j.slice() : [1, 1];
      if (!vue.separee) pas.push(['separer', 0, 420]);
      for (let m = 0; m < 2; m++) for (let k = depart[m]; k < h.mains[m].cartes.length; k++) pas.push(['j', m, P]);
    }
    if (initiale && h.annexes.length) pas.push(['annexes', 0, 250]);
    if (!h.cachee) { pas.push(['retourner', 0, 450]); for (let k = Math.max(2, vue.croupier); k < h.croupier.length; k++) pas.push(['c', 0, RC + 120]); }
    let t = attente || 0;
    for (const [quoi, m, dur] of pas) {
      plus(t, () => {
        if (quoi === 'j') { const k = vue.j[m]++; poserCarte(zoneJ(m), cartesJ(h, m)[k], false, true); d.son.tap(); majTotaux(); }
        else if (quoi === 'c') { const k = vue.croupier++; poserCarte(zC, h.croupier[k], k === 1 && vue.cachee, true); majTotaux(); }
        else if (quoi === 'separer') { // la paire se coupe en deux mains, côte à côte ; chacune garde sa carte
          vue.separee = true; boites(2); mainsEl.classList.add('coupe');
          for (let k = 0; k < 2; k++) poserCarte(zoneJ(k), h.mains[k].cartes[0], false, false);
          vue.j = [1, 1]; d.son.achat(); majTotaux();
        }
        else if (quoi === 'retourner') { retourner(); d.son.tap(); }
        else if (quoi === 'annexes') annexes(h);
      });
      t += dur;
    }
    plus(t + 120, () => {
      mainsEl.classList.remove('coupe');
      if (h.fin) { if (vue.cachee) retourner(); phase = 'mise'; borne(); montrerResultat(h, true); montrerBulles(); }
      else phase = 'jeu';
      marquerActive(h); maj();
    });
  }
  function annexes(h) { // les mises annexes se règlent dès la donne
    const gagnees = h.annexes.filter((x) => x.gain > 0);
    majCases();
    if (gagnees.length) {
      montrerAnnonce(gagnees.map((x) => `<span><b>${esc(x.nom)}</b> : ${esc(x.combinaison.nom.toLowerCase())} ×${x.combinaison.mult} · <b>+${eur(x.gain)}</b></span>`).join(''), 'gagne', true);
      d.son.pourboire(); d.buzz([10, 30, 10]);
    } else montrerAnnonce(h.annexes.length > 1 ? 'Mises annexes : rien cette fois' : `${h.annexes[0].nom} : rien cette fois`, 'rien');
  }
  function montrerAnnonce(txt, cls, html) { if (html) annonce.innerHTML = txt; else annonce.textContent = txt; annonce.className = 'ar-annonce ' + (cls || ''); annonce.hidden = false; void annonce.offsetWidth; annonce.classList.add('vu'); clearTimeout(montrerAnnonce.t); montrerAnnonce.t = setTimeout(() => { annonce.hidden = true; }, cls === 'gagne' ? 3500 : 2700); }
  const DETAIL = {
    blackjack: () => 'Payé 3 pour 2', gagne: (j, c) => `${j} contre ${c}`, croupierBrule: (j, c) => `Le croupier brûle à ${c}`, egalite: (j, c) => (j === 21 && c === 21 ? 'BlackJack contre BlackJack : mise rendue' : `${j} partout : mise rendue`),
    perdu: (j, c) => `${j} contre ${c}`, brule: (j) => `Brûlé à ${j}`, croupierBJ: () => 'BlackJack du croupier',
  };
  const MOT_MAIN = { gagne: 'gagnée', croupierBrule: 'gagnée', egalite: 'égalité', perdu: 'perdue', brule: 'brûlée', blackjack: 'gagnée' };
  // la main active du partage, marquée ; à la fin, le résultat de chaque main sous ses cartes
  function marquerActive(h) {
    [...mainsEl.children].forEach((b, k) => b.classList.toggle('active', !!(h && h.separee && vue.separee && !h.fin && k === B.mainActive(h))));
    etiquettes(h && h.fin && h.separee && vue.separee ? h : null);
  }
  function etiquettes(h) {
    [...mainsEl.children].forEach((b, k) => {
      const e = b.querySelector('.ar-etiquette'), m = h && h.mains[k];
      if (!m) { e.hidden = true; return; }
      const g = B.gagnant(m.resultat); e.hidden = false; e.className = 'ar-etiquette ' + (g ? 'gagne' : m.resultat === 'egalite' ? 'egal' : 'perdu');
      e.textContent = g ? `+${eur(m.gain - m.mise)}` : m.resultat === 'egalite' ? 'Égalité' : m.resultat === 'brule' ? 'Brûlée' : 'Perdue';
    });
  }
  function montrerResultat(h, fete) {
    const c = B.valeur(h.croupier).total, g = B.gagnant(h.resultat);
    const cls = h.resultat === 'blackjack' ? 'bj' : g ? 'gagne' : h.resultat === 'egalite' ? 'egal' : 'perdu';
    const net = h.net, ligneNet = net > 0 ? `+${eur(net)}` : net < 0 ? `−${eur(-net)}` : 'Rien de perdu';
    const detail = h.separee && Array.isArray(h.mains) ? h.mains.map((m, k) => `Main ${k + 1} : ${MOT_MAIN[m.resultat] || '—'}`).join(' · ') : DETAIL[h.resultat](B.valeur(h.joueur).total, c);
    resultatEl.className = 'ar-resultat ' + cls; resultatEl.dataset.resultat = h.resultat;
    resultatEl.innerHTML = `<span class="haut"><b>${B.MOTS[h.resultat]}</b><i class="${net > 0 ? 'plus' : net < 0 ? 'moins' : ''}">${ligneNet}</i></span><span class="ar-detail">${esc(detail)}</span>`;
    resultatEl.hidden = false; if (d.confettis && (h.resultat === 'blackjack' || (g && net > 0))) d.confettis(h.resultat === 'blackjack' ? 1.4 : 0.5); // un BlackJack : la pluie ; une main gagnée : un peu
    if (!fete) return;
    if (h.resultat === 'blackjack') { d.son.deblocage(); d.buzz([20, 40, 20, 40, 30]); }
    else if (g) { d.son.vente(h.gain); d.buzz([10, 30, 10]); }
    else if (h.resultat === 'egalite') d.son.tap();
    else { d.son.non(); d.buzz(30); }
    if (h.tapis && !(caisse() > 0)) montrerAnnonce('La caisse est vide… les fournées la rempliront.', 'rien');
  }

  // ─── l'affichage du BlackJack ───
  function majTotaux() {
    const h = vue.main || B.etat(st()).main;
    const txt = (cartes, coupe) => { const v = B.valeur(cartes); return v.blackjack && !coupe ? 'BlackJack' : v.souple && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total); }; // après partage, as + figure fait 21, pas un BlackJack
    if (!h || !(vue.j[0] > 0)) { [...mainsEl.querySelectorAll('.ar-total')].forEach((t) => { t.hidden = true; }); tC.hidden = true; return; }
    vue.j.forEach((n, k) => {
      const t = totJ(k); if (!t) return;
      const cj = cartesJ(h, k).slice(0, n), coupe = vue.separee;
      t.hidden = !cj.length; t.textContent = cj.length ? txt(cj, coupe) : ''; t.classList.toggle('brule', B.valeur(cj).brule); t.classList.toggle('bj', !coupe && B.valeur(cj).blackjack);
    });
    const cc = h.croupier.slice(0, vue.croupier);
    const visibles = vue.cachee ? cc.slice(0, 1) : cc; tC.hidden = !visibles.length; tC.textContent = visibles.length ? txt(visibles) : ''; tC.classList.toggle('brule', B.valeur(visibles).brule); tC.classList.toggle('bj', !vue.cachee && B.valeur(cc).blackjack);
  }
  function majCases() {
    const h = B.etat(st()).main, enJeu = phase !== 'mise' && h, mise = phase === 'mise';
    el.querySelectorAll('[data-case]').forEach((b) => {
      const id = b.dataset.case, v = enJeu ? (id === 'main' ? h.mise : h.mises[id]) : mises[id], x = enJeu && id !== 'main' ? h.annexes.find((a) => a.id === id) : null;
      b.classList.toggle('choisie', mise && choix === id); b.classList.toggle('sans', !(v > 0)); b.classList.toggle('pleine', v > 0);
      b.classList.toggle('gagnee', !!(x && x.gain > 0 && vue.j[0] >= 2)); b.classList.toggle('perdue', !!(x && !x.gain && vue.j[0] >= 2));
      b.disabled = !mise; b.setAttribute('aria-pressed', mise && choix === id ? 'true' : 'false');
      b.querySelector('b').textContent = v > 0 ? (x && x.gain > 0 && vue.j[0] >= 2 ? `+${eur(x.gain)}` : eur(v)) : mise && choix === id ? 'à poser' : '—';
      b.setAttribute('aria-label', `${NOM_CASE[id]} : ${v > 0 ? eur(v) : 'rien'}`);
    });
  }
  // la paire visible (deux cartes de même valeur, pas encore séparée) : le bouton Séparer paraît (grisé si la caisse ne suit pas)
  const paireVue = (h) => !h.separee && !h.double && h.joueur.length === 2 && B.points(h.joueur[0]) === B.points(h.joueur[1]);
  function majPanneauBJ() {
    const s = st(), c = caisse(), h = B.enCours(s), a = B.etat(s);
    if (phase === 'jeu' && h) {
      const dbl = B.peutDoubler(s), sep = B.peutSeparer(s), paire = paireVue(h), k = B.mainActive(h), active = h.separee ? h.mains[k].cartes : h.joueur;
      const cs = a.conseil ? B.conseil(s) : null;
      panneau.className = 'ar-panneau jeu';
      const ann = h.annexes.reduce((t, x) => t + x.gain - x.mise, 0);
      const bouton = (id, cls, titre, petit, ok) => `<button type="button" class="btn ar-act ${cls}${ok ? '' : ' non'}${cs && cs.coup === id ? ' conseille' : ''}" data-ar="${id}" ${ok ? '' : 'aria-disabled="true"'}><b>${titre}</b><small>${petit}</small></button>`;
      panneau.innerHTML = `<div class="ar-infos-main"><span><small>Ta mise</small><b>${eur(h.mise)}</b></span><span><small>Annexes</small><b class="${ann > 0 ? 'plus' : ''}">${h.annexes.length ? (ann > 0 ? `+${eur(ann)}` : ann < 0 ? `−${eur(-ann)}` : '0 €') : '—'}</b></span><span><small>En caisse</small><b>${eur(c)}</b></span></div>
        <button type="button" class="ar-conseil${a.conseil ? ' on' : ''}" data-ar="conseil" role="switch" aria-checked="${a.conseil}"><i class="ico">${ICONS.UI.conseil}</i><span><b>Le bon coup</b><small>${cs ? esc(cs.texte) : 'Allume-le : la stratégie de base te souffle le coup'}</small></span><span class="ar-inter" aria-hidden="true"></span></button>
        <div class="ar-actions${paire ? ' quatre' : ''}">
        ${bouton('tirer', 'menthe', 'Tirer', h.separee ? `main ${k + 1}` : 'une carte', true)}
        ${bouton('rester', '', 'Rester', `à ${B.valeur(active).total}`, true)}
        ${bouton('doubler', 'lavande', 'Doubler', h.separee ? 'pas permis' : h.joueur.length > 2 || h.double ? 'plus possible' : dbl ? `+${eur(h.mise)}` : 'caisse trop courte', dbl)}
        ${paire ? bouton('separer', 'peche', 'Séparer', sep ? `+${eur(h.mise)}` : 'caisse trop courte', sep) : ''}</div>`;
      panneau.querySelector('[data-ar="tirer"]').addEventListener('click', () => { d.audio(); action('tirer'); });
      panneau.querySelector('[data-ar="rester"]').addEventListener('click', () => { d.audio(); action('rester'); });
      panneau.querySelector('[data-ar="doubler"]').addEventListener('click', () => { d.audio(); if (!B.peutDoubler(st())) { d.son.non(); return; } action('doubler'); });
      const bs = panneau.querySelector('[data-ar="separer"]'); if (bs) bs.addEventListener('click', () => { d.audio(); if (!B.peutSeparer(st())) { d.son.non(); return; } action('separer'); });
      panneau.querySelector('[data-ar="conseil"]').addEventListener('click', () => { d.audio(); d.son.tap(); const x = B.etat(st()); x.conseil = !x.conseil; d.save(); majPanneau(); });
      return;
    }
    if (phase === 'anim') { panneau.classList.add('attente'); panneau.querySelectorAll('button').forEach((b) => { b.disabled = true; }); return; }
    // miser : les jetons rapides, le réglage fin, distribuer
    const reste = Math.max(0, c - totalMises()), m = B.borner(s, mises), parts = [[0.01, '1 %', 'menthe'], [0.1, '10 %', 'ciel'], [0.5, '50 %', 'lavande']];
    panneau.className = 'ar-panneau mise';
    if (!(c >= B.MISE_MIN) && !(totalMises() > 0)) { caisseVide(); return; }
    panneau.innerHTML = `<div class="ar-jetons" role="group" aria-label="Jetons : ajouter à ${NOM_CASE[choix]}">
        ${parts.map(([p, l, k]) => { const v = B.jeton(s, p); return `<button type="button" class="ar-jeton ${k}" data-jeton="${p}" ${v > 0 && reste > 0 ? '' : 'disabled'}><span>${l}</span><small>${v > 0 ? eur(Math.min(v, reste || v)) : '—'}</small></button>`; }).join('')}
        <button type="button" class="ar-jeton tapis" data-jeton="tapis" ${reste > 0 ? '' : 'disabled'}><span>Tapis</span><small>${eur(reste > 0 ? reste : c)}</small></button>
      </div>
      <div class="ar-fin">
        <button type="button" class="ar-pm" data-ar="moins" aria-label="Moins sur ${NOM_CASE[choix]}">−</button>
        <div class="ar-sur"><small>${NOM_CASE[choix]}</small><b>${eur(mises[choix])}</b></div>
        <button type="button" class="ar-pm" data-ar="plus" aria-label="Plus sur ${NOM_CASE[choix]}">+</button>
        <button type="button" class="ar-effacer" data-ar="effacer" ${totalMises() > 0 ? '' : 'disabled'}>Effacer</button>
      </div>
      <button type="button" class="btn large beurre ar-donner${mises.main >= B.MISE_MIN ? '' : ' non'}" data-ar="donner"><b>${mises.main >= B.MISE_MIN ? `Distribuer · ${eur(m.total)}` : 'Pose une mise pour jouer'}</b></button>`;
    garderHauteur();
    panneau.querySelectorAll('[data-jeton]').forEach((b) => b.addEventListener('click', () => { d.audio(); if (b.dataset.jeton === 'tapis') tapis(); else ajouter(B.jeton(st(), +b.dataset.jeton)); }));
    panneau.querySelector('[data-ar="moins"]').addEventListener('click', () => { d.audio(); ajuster(-1); });
    panneau.querySelector('[data-ar="plus"]').addEventListener('click', () => { d.audio(); ajuster(1); });
    panneau.querySelector('[data-ar="effacer"]').addEventListener('click', () => { d.audio(); effacer(); });
    panneau.querySelector('[data-ar="donner"]').addEventListener('click', () => { d.audio(); donner(); });
  }
  function caisseVide() {
    panneau.innerHTML = `<p class="ar-vide"><b>La caisse est vide.</b> Les fournées et les apprentis la rempliront : reviens plus tard.</p><button type="button" class="btn large clair" data-ar="sortir"><b>Retour à la boutique</b></button>`;
    panneau.querySelector('[data-ar="sortir"]').addEventListener('click', () => { d.son.tap(); fermer(); });
  }
  // le panneau garde la hauteur du panneau des mises : la table ne saute pas d'une phase à l'autre
  function garderHauteur() { const hp = panneau.offsetHeight; if (hp > hPanneau) { hPanneau = hp; el.style.setProperty('--panneau-h', `${hp}px`); } }

  // ═══ LA ROULETTE ═══
  // ─── le tapis de mises : les chances simples, les douzaines et les colonnes ; la grille des pleins (0 à 36) sur un second onglet ───
  const parseCle = (k) => { const [type, x] = k.split('-'); return type === 'douzaine' || type === 'colonne' ? { type, k: +x } : type === 'plein' ? { type, n: +x } : { type }; };
  function tapisHTML() {
    const cell = (cle, nom, petit, cls) => `<button type="button" class="ar-cell ${cls || ''}" data-mise="${cle}" aria-label="${esc(R.nomMise(parseCle(cle)))}"><span class="nom">${nom}</span>${petit ? `<small>${petit}</small>` : ''}<b class="jet"></b></button>`;
    const num = (n) => `<button type="button" class="ar-cell num ${R.couleur(n)}" data-mise="plein-${n}" aria-label="Plein ${n}"><span class="nom">${n}</span><b class="jet"></b></button>`;
    return `<div class="ar-onglets ar-onglets-mise" role="tablist" aria-label="Le tapis"><button type="button" role="tab" data-vue="chances" aria-selected="true">Chances <i></i></button><button type="button" role="tab" data-vue="numeros" aria-selected="false">Numéros <i></i></button></div>
      <div class="ar-grille chances" data-grille="chances">
        ${cell('manque', '1–18', '1 pour 1')}${cell('pair', 'Pair', '1 pour 1')}${cell('rouge', '<i class="puce-coul rouge"></i>Rouge', '1 pour 1', 'rouge')}
        ${cell('noir', '<i class="puce-coul noir"></i>Noir', '1 pour 1', 'noir')}${cell('impair', 'Impair', '1 pour 1')}${cell('passe', '19–36', '1 pour 1')}
        ${cell('douzaine-1', '1–12', '2 pour 1', 'dz')}${cell('douzaine-2', '13–24', '2 pour 1', 'dz')}${cell('douzaine-3', '25–36', '2 pour 1', 'dz')}
        ${cell('colonne-1', 'Col. 1', '1, 4, 7…', 'col')}${cell('colonne-2', 'Col. 2', '2, 5, 8…', 'col')}${cell('colonne-3', 'Col. 3', '3, 6, 9…', 'col')}
      </div>
      <div class="ar-grille numeros" data-grille="numeros" hidden>${num(0)}${Array.from({ length: 36 }, (_, k) => num(k + 1)).join('')}</div>`;
  }
  function toucheTapis(e) {
    const o = e.target.closest('[data-vue]'); if (o) { d.audio(); d.son.tap(); vueTapis = o.dataset.vue; majTapis(); return; }
    const c = e.target.closest('[data-mise]'); if (!c || c.disabled) return;
    d.audio(); poserR(c.dataset.mise);
  }
  const totalR = () => rMises.reduce((t, m) => t + m.mise, 0);
  function montantJeton() { const reste = Math.max(0, caisse() - totalR()); return jetonPart >= 1 ? reste : Math.min(B.jeton(st(), jetonPart), reste); }
  function poserR(cle) {
    if (rPhase !== 'mise' || !R) return;
    const v = montantJeton();
    if (!(v >= R.MISE_MIN)) { d.son.non(); return; }
    const m = rMises.find((x) => R.cle(x) === cle);
    if (m) m.mise += v; else rMises.push(Object.assign(parseCle(cle), { mise: v }));
    rMises = R.borner(st(), rMises).mises; montre = null; numeroEl.hidden = true; // une mise posée : le dernier tour s'efface du tapis
    d.son.achat(); d.buzz(6); maj();
  }
  function memeMise() {
    const der = R.etat(st()).mises; if (!der.length) { d.son.non(); return; }
    rMises = R.borner(st(), der).mises; montre = null; numeroEl.hidden = true; d.son.achat(); maj();
  }
  function effacerR() { rMises = []; d.son.tap(); maj(); }
  function lancerR() {
    if (rPhase !== 'mise' || !R) return;
    const b = R.borner(st(), rMises); rMises = b.mises;
    if (!b.mises.length || b.total < R.MISE_MIN) { d.son.non(); maj(); return; }
    if (b.tapis) confirmerTapis(b.total, tourner, true); else tourner();
  }
  // le tour : ROULETTE.lancer tire le numéro, prend les mises et paie, d'un coup ; la roue ne fait que le montrer
  function tourner() {
    const s = st(), n = window.__rouletteTirage;
    const rng = Number.isInteger(n) && n >= 0 && n <= 36 ? () => (n + 0.5) / 37 : undefined; // le commutateur de test (jamais posé par le jeu)
    const r = R.lancer(s, rMises, rng, maintenant());
    if (!r.ok) { d.son.non(); maj(); return; }
    const tour = r.tour;
    if (C) noter(C.apresTour(s, tour, optsCasino()));
    d.save();
    caisseVue = tour.caisse - tour.mise; // tant que la bille roule, la caisse montrée est celle d'après les mises
    rPhase = 'tour'; montre = { tour, enCours: true };
    numeroEl.hidden = true; roul.classList.add('tourne'); d.son.carte(); d.buzz(8);
    maj();
    majRoue(); animer(tour.numero, () => finTour(tour));
  }
  function finTour(tour) {
    if (!montre || montre.tour !== tour || !montre.enCours) return;
    montre.enCours = false; caisseVue = null;
    const g = tour.net > 1e-9, egal = Math.abs(tour.net) <= 1e-9;
    montrerNumero(tour); numeroEl.classList.add('pose');
    if (g) { d.son.vente(tour.gain); d.buzz([10, 30, 10]); if (d.confettis) d.confettis(tour.mises.some((m) => m.type === 'plein' && m.gagne) ? 1.2 : 0.5); } else if (egal) d.son.tap(); else { d.son.non(); d.buzz(30); }
    rMises = [];
    maj();
    plus(1300, () => { if (!ouvert()) return; rPhase = 'mise'; roul.classList.remove('tourne'); numeroEl.classList.remove('pose'); if (tour.tapis && !(caisse() > 0)) bulle(`<span><b>La caisse est vide…</b><small>les fournées la rempliront.</small></span>`, 'info'); maj(); majRoue(); montrerBulles(); });
  }
  function montrerNumero(t) { // le numéro tiré, posé sur la roue, avec ce qu'il a rapporté
    numeroEl.className = `ar-numero ${t.couleur} ${t.net > 1e-9 ? 'gagne' : t.net < -1e-9 ? 'perdu' : 'egal'}`;
    numeroEl.innerHTML = `<b>${t.numero}</b><span><em>${{ rouge: 'Rouge', noir: 'Noir', vert: 'Zéro' }[t.couleur]}</em><i>${t.net > 1e-9 ? `+${eur(t.net)}` : t.net < -1e-9 ? `−${eur(-t.net)}` : 'Rien de perdu'}</i></span>`;
    numeroEl.hidden = false;
  }
  function majTapis() {
    if (!R) return;
    tapisEl.querySelectorAll('[data-vue]').forEach((b) => {
      const v = b.dataset.vue, on = v === vueTapis, n = rMises.filter((m) => (m.type === 'plein') === (v === 'numeros')).length;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.querySelector('i').textContent = n ? String(n) : '';
    });
    tapisEl.querySelectorAll('[data-grille]').forEach((g) => { g.hidden = g.dataset.grille !== vueTapis; });
    roul.classList.toggle('vue-numeros', vueTapis === 'numeros'); // sur un petit écran, la grille des pleins prend la place de la roue
    const t = montre && !montre.enCours ? montre.tour : null, par = new Map(rMises.map((m) => [R.cle(m), m])), passe = t ? new Map(t.mises.map((m) => [R.cle(m), m])) : null;
    tapisEl.querySelectorAll('[data-mise]').forEach((c) => {
      const k = c.dataset.mise, m = par.get(k), x = passe && passe.get(k), sort = t && R.gagne(parseCle(k), t.numero);
      c.classList.toggle('pleine', !!m); c.classList.toggle('sort', !!sort);
      c.classList.toggle('gagnee', !!(x && x.gagne && !m)); c.classList.toggle('perdue', !!(x && !x.gagne && !m));
      c.querySelector('.jet').textContent = m ? eur(m.mise) : x ? (x.gagne ? `+${eur(x.gain - x.mise)}` : eur(x.mise)) : '';
      c.disabled = rPhase !== 'mise';
    });
  }
  function majHisto() {
    const h = R.etat(st()).historique, cache = rPhase === 'tour' && montre && montre.enCours; // le numéro qui roule n'apparaît qu'une fois la bille posée
    const vus = cache ? h.slice(0, -1) : h;
    histoEl.innerHTML = vus.length ? vus.map((n, k) => `<li class="${R.couleur(n)}${k === vus.length - 1 ? ' dernier' : ''}">${n}</li>`).join('') : '<li class="vide">Les derniers numéros s’afficheront ici</li>';
    histoEl.scrollLeft = histoEl.scrollWidth;
  }
  const PARTS_R = [[0.01, '1 %', 'menthe'], [0.1, '10 %', 'ciel'], [0.5, '50 %', 'lavande'], [1, 'Tapis', 'tapis']];
  function majPanneauR() {
    const s = st(), c = caisse(), tot = totalR();
    if (rPhase === 'tour') {
      panneau.className = 'ar-panneau mise roulette tour';
      const t = montre && montre.tour, fini = montre && !montre.enCours;
      panneau.innerHTML = `<p class="ar-rien-ne-va"><b>${fini ? `${t.numero}, ${{ rouge: 'rouge', noir: 'noir', vert: 'le zéro' }[t.couleur]} !` : 'Rien ne va plus…'}</b><small>${fini ? (t.net > 1e-9 ? `Gagné : +${eur(t.net)}` : t.net < -1e-9 ? `Perdu : −${eur(-t.net)}` : 'Rien de perdu') : `${eur(t ? t.mise : tot)} sur le tapis`}</small></p>`;
      return;
    }
    panneau.className = 'ar-panneau mise roulette';
    if (!(c >= R.MISE_MIN) && !(tot > 0)) { caisseVide(); return; }
    const reste = Math.max(0, c - tot), der = R.etat(s).mises, b = R.borner(s, rMises);
    panneau.innerHTML = `<div class="ar-jetons" role="radiogroup" aria-label="Le jeton en main : touche une case du tapis pour le poser">
        ${PARTS_R.map(([p, l, k]) => { const v = p >= 1 ? reste : B.jeton(s, p), on = jetonPart === p; return `<button type="button" role="radio" aria-checked="${on}" class="ar-jeton ${k}${on ? ' en-main' : ''}" data-jr="${p}" ${v > 0 && reste > 0 ? '' : 'disabled'}><span>${l}</span><small>${v > 0 ? eur(Math.min(v, reste || v)) : '—'}</small></button>`; }).join('')}
      </div>
      <div class="ar-fin r">
        <button type="button" class="ar-effacer" data-ar="meme" ${der.length && !tot ? '' : 'disabled'}>Même mise</button>
        <div class="ar-sur"><small>Sur le tapis</small><b>${tot > 0 ? eur(tot) : '—'}</b></div>
        <button type="button" class="ar-effacer" data-ar="effacer" ${tot > 0 ? '' : 'disabled'}>Effacer</button>
      </div>
      <button type="button" class="btn large beurre ar-donner${b.mises.length ? '' : ' non'}" data-ar="lancer"><b>${b.mises.length ? `Lancer la bille · ${eur(b.total)}` : 'Touche le tapis pour miser'}</b></button>`;
    garderHauteur();
    panneau.querySelectorAll('[data-jr]').forEach((x) => x.addEventListener('click', () => { d.audio(); d.son.tap(); jetonPart = +x.dataset.jr; majPanneau(); }));
    panneau.querySelector('[data-ar="meme"]').addEventListener('click', () => { d.audio(); memeMise(); });
    panneau.querySelector('[data-ar="effacer"]').addEventListener('click', () => { d.audio(); effacerR(); });
    panneau.querySelector('[data-ar="lancer"]').addEventListener('click', () => { d.audio(); lancerR(); });
  }

  // ─── la roue 3D procédurale (le repérage du lot 7) : Three.js global, aucun fichier ; finitions = skins ; la bille calée sur le tirage ───
  // Le principe : le numéro est tiré d'abord ; on anime la bille en angle RELATIF au cylindre : Δ(t) = D·(1−s)³ (+ petits rebonds amortis),
  // s = t / T_CALE ; à s = 1, Δ = 0 : la bille est exactement dans la case tirée, et tourne ensuite avec le cylindre. Tout est une fonction
  // pure du temps (plan, etatBille, caseSous) : rejouable, vérifiable 37 fois sur 37, et une capture à t fixe montre la même image.
  const PAS_R = (2 * Math.PI) / 37, ORDRE = R ? R.ORDRE : [];
  const R_CASE_IN = 0.36, R_CASE_OUT = 0.56, R_ANNEAU = 0.74, R_PISTE = 0.93, R_BORD = 1.0; // le profil du bol, rayon de la roue = 1
  function hauteurBol(r) {
    if (r <= R_CASE_IN) return 0.06 + (R_CASE_IN - r) * 0.5; // la tourelle
    if (r <= R_CASE_OUT) return 0.0; // le fond des cases
    if (r <= R_ANNEAU) return 0.03 + (r - R_CASE_OUT) * 0.25; // l'anneau des numéros (légère pente)
    if (r <= R_PISTE) return 0.075 + (r - R_ANNEAU) * 0.55; // le cône fixe (losanges)
    return 0.18 + (r - R_PISTE) * 0.3; // la piste de la bille
  }
  const FINITIONS = { // la finition de la roulette (skin « roue ») : quelques couleurs, rien d'autre
    classique: { rouge: '#B3202A', noir: '#1C1C1C', vert: '#1E7A3A', filet: '#C9A646', bois: '#6B3A1E', metal: '#D4B25A' },
    fournil: { rouge: '#E1496C', noir: '#3A2A22', vert: '#3FA36B', filet: '#F3E3C0', bois: '#C98B4E', metal: '#F0C66A' },
    ebene: { rouge: '#A01F2C', noir: '#101010', vert: '#17603A', filet: '#C8CDD3', bois: '#2A1D17', metal: '#C8CDD3' },
    or: { rouge: '#B3202A', noir: '#1C1C1C', vert: '#1E7A3A', filet: '#F2D27A', bois: '#8C5A2B', metal: '#F5C54A' },
  };
  function roue2dFond() { // sans WebGL : une roue à plat (un dégradé conique), le numéro posé dessus
    const f = FINITIONS.classique, c = { rouge: f.rouge, noir: f.noir, vert: f.vert };
    return `radial-gradient(circle, ${f.bois} 0 30%, ${f.filet} 31% 33%, transparent 34%), conic-gradient(from ${(-180 / 37).toFixed(3)}deg, ${ORDRE.map((n, i) => `${c[R.couleur(n)]} ${(i * 360 / 37).toFixed(2)}deg ${((i + 1) * 360 / 37).toFixed(2)}deg`).join(', ')})`;
  }
  function toile(rIn, rOut, chiffres, palette) { // une texture d'anneau en coordonnées planes (RingGeometry, rayon externe = 1)
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), m = N / 2;
    g.translate(m, m);
    for (let i = 0; i < 37; i++) {
      const n = ORDRE[i], a0 = -i * PAS_R - PAS_R / 2, a1 = a0 + PAS_R; // sens horaire vu de dessus, comme une vraie roue
      g.beginPath(); g.arc(0, 0, rOut * m, -a1, -a0); g.arc(0, 0, rIn * m, -a0, -a1, true); g.closePath();
      g.fillStyle = palette[R.couleur(n)]; g.fill(); g.strokeStyle = palette.filet; g.lineWidth = 2; g.stroke();
      if (chiffres) {
        g.save(); g.rotate(i * PAS_R); g.translate(((rIn + rOut) / 2) * m, 0); g.rotate(Math.PI / 2);
        g.fillStyle = '#fff'; g.font = `bold ${Math.round(m * 0.075)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 0, 0); g.restore();
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function creerRoue(fin) {
    const roue = new THREE.Group(), cylindre = new THREE.Group(); roue.add(cylindre);
    const mBois = new THREE.MeshStandardMaterial({ color: fin.bois, roughness: 0.6 }), mMetal = new THREE.MeshStandardMaterial({ color: fin.metal, metalness: 0.7, roughness: 0.35 });
    // le bol fixe (tour) : de l'anneau jusqu'au bord, puis l'extérieur
    const prof = []; for (let r = R_ANNEAU + 0.005; r <= R_BORD + 1e-6; r += 0.0325) prof.push(new THREE.Vector2(r, hauteurBol(r)));
    prof.push(new THREE.Vector2(R_BORD, 0.26), new THREE.Vector2(1.08, 0.26), new THREE.Vector2(1.1, 0.1), new THREE.Vector2(1.05, -0.05), new THREE.Vector2(0.5, -0.06));
    roue.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mBois));
    roue.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(R_ANNEAU + 0.01, hauteurBol(R_ANNEAU + 0.01) + 0.002), new THREE.Vector2(R_PISTE, hauteurBol(R_PISTE) + 0.002)], 48), new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.5, side: THREE.DoubleSide })));
    // 8 losanges sur le cône
    const los = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.03), mMetal, 8), o = new THREE.Object3D();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = 0.84; o.position.set(r * Math.cos(a), hauteurBol(r) + 0.01, -r * Math.sin(a)); o.scale.set(1, 0.4, 2.2); o.rotation.set(0, a, 0); o.updateMatrix(); los.setMatrixAt(i, o.matrix); }
    roue.add(los);
    // le cylindre tournant : anneau des numéros, fond des cases, séparateurs, tourelle
    const anneau = new THREE.Mesh(new THREE.RingGeometry(R_CASE_OUT / R_ANNEAU, 1, 74, 1), new THREE.MeshStandardMaterial({ map: toile(R_CASE_OUT / R_ANNEAU, 1, true, fin), roughness: 0.5 }));
    anneau.scale.setScalar(R_ANNEAU); anneau.rotation.x = -Math.PI / 2; anneau.position.y = 0.045; cylindre.add(anneau);
    const fond = new THREE.Mesh(new THREE.RingGeometry(R_CASE_IN / R_CASE_OUT, 1, 74, 1), new THREE.MeshStandardMaterial({ map: toile(R_CASE_IN / R_CASE_OUT, 1, false, fin), roughness: 0.6 }));
    fond.scale.setScalar(R_CASE_OUT); fond.rotation.x = -Math.PI / 2; cylindre.add(fond);
    const frets = new THREE.InstancedMesh(new THREE.BoxGeometry(R_CASE_OUT - R_CASE_IN, 0.05, 0.008), mMetal, 37);
    for (let i = 0; i < 37; i++) { const a = i * PAS_R - PAS_R / 2, r = (R_CASE_IN + R_CASE_OUT) / 2; o.position.set(r * Math.cos(a), 0.025, -r * Math.sin(a)); o.rotation.set(0, a, 0); o.scale.set(1, 1, 1); o.updateMatrix(); frets.setMatrixAt(i, o.matrix); }
    cylindre.add(frets);
    const tour = new THREE.Mesh(new THREE.ConeGeometry(R_CASE_IN, 0.18, 32, 1, true), mBois); tour.position.y = 0.09; cylindre.add(tour);
    const axe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12), mMetal); axe.position.y = 0.25; cylindre.add(axe);
    for (let k = 0; k < 2; k++) { const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), mMetal); bras.rotation.set(0, (k * Math.PI) / 2, Math.PI / 2, 'YXZ'); bras.position.y = 0.3; cylindre.add(bras); }
    for (let k = 0; k < 4; k++) { const bout = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mMetal); bout.position.set(0.2 * Math.cos((k * Math.PI) / 2), 0.3, -0.2 * Math.sin((k * Math.PI) / 2)); cylindre.add(bout); }
    const bille = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.2, metalness: 0.1 }));
    roue.add(bille);
    let tris = 0; roue.traverse((x) => { if (x.isMesh) { const g = x.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += x.isInstancedMesh ? n * x.count : n; } });
    return { roue, cylindre, bille, tris };
  }
  // ─── l'animation : des fonctions pures du temps ───
  const T_CALE = 5.2, T_FIN = 7.0, OMEGA0 = 1.4, FREIN = 0.06, LANCER = Math.PI * 0.5; // la bille part toujours d'en face (angle monde)
  function plan(numero, tours, cyl0) {
    const off = -ORDRE.indexOf(numero) * PAS_R, c0 = Number.isFinite(cyl0) ? cyl0 : 0; // l'angle de la case dans le repère du cylindre ; le cylindre repart d'où il s'est arrêté
    const reste = (((LANCER - c0 - off) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return { numero, off, cyl0: c0, D: (tours || 6) * 2 * Math.PI + reste };
  }
  const cylAngle = (p, t) => p.cyl0 + OMEGA0 * t - 0.5 * FREIN * t * t;
  function etatBille(p, t) {
    const s = Math.min(1, t / T_CALE), u = 1 - s;
    let delta = p.D * u * u * u, r = R_PISTE, saut = 0;
    if (s > 0.55) { // la bille quitte la piste, descend le cône, rebondit sur les séparateurs puis se pose
      const v = (s - 0.55) / 0.45, e = v * v * (3 - 2 * v);
      r = R_PISTE + (0.47 - R_PISTE) * e;
      const amorti = (1 - v) * (1 - v);
      delta += 0.35 * Math.sin(v * Math.PI * 5) * amorti * u; // petits coups de côté (s'annulent à s = 1)
      saut = Math.abs(Math.sin(v * Math.PI * 4)) * 0.05 * amorti;
    }
    return { a: cylAngle(p, t) + p.off + delta, r, y: hauteurBol(r) + 0.028 + saut, cylindre: cylAngle(p, t) };
  }
  function poser(objets, p, t) {
    const e = etatBille(p, t);
    objets.cylindre.rotation.y = e.cylindre;
    objets.bille.position.set(e.r * Math.cos(e.a), e.y, -e.r * Math.sin(e.a));
    return e;
  }
  const caseDe = (aBille, aCyl) => { let rel = -(aBille - aCyl) / PAS_R; rel = ((Math.round(rel) % 37) + 37) % 37; return ORDRE[rel]; };
  // la case où se trouve la bille (lecture inverse) : pour vérifier que l'animation tombe bien sur le tirage
  function caseSous(p, t) { const e = etatBille(p, t); return caseDe(e.a, e.cylindre); }

  // ─── le rendu : bâti quand la roulette s'ouvre, libéré quand on la quitte ; une image seulement pendant que la bille roule ───
  function construireRoue() {
    if (rendu || !roueEl || !R) return;
    roue2d.hidden = true;
    const canvas = document.createElement('canvas'); canvas.className = 'ar-roue-3d'; roueEl.insertBefore(canvas, roueEl.firstChild);
    let gl = null;
    try { if (typeof THREE !== 'undefined') { const o = { antialias: true, alpha: true, powerPreference: 'low-power' }; gl = canvas.getContext('webgl2', o) || canvas.getContext('webgl', o); } } catch (e) { gl = null; }
    if (!gl) { canvas.remove(); rendu = { sans: true, bille: null }; roue2d.hidden = false; return; } // sans WebGL : la roue à plat, le numéro sans animation
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
      scene.add(new THREE.HemisphereLight(0xfff1d6, 0x22302a, 2.4));
      const lampe = new THREE.DirectionalLight(0xffe2b0, 2.6); lampe.position.set(1.2, 3.2, 1.6); scene.add(lampe);
      rendu = { sans: false, renderer, scene, cam, canvas, finition: skin('roue'), objets: null, p: null, raf: 0, fin: null, bille: null, ro: null };
      poserObjets();
      if (typeof ResizeObserver !== 'undefined') { rendu.ro = new ResizeObserver(() => { if (rendu && !rendu.raf) { taille(); dessiner(); } }); rendu.ro.observe(roueEl); }
      taille();
    } catch (e) { libererRoue(); rendu = { sans: true, bille: null }; roue2d.hidden = false; }
  }
  function poserObjets() { // la roue à la finition choisie ; la bille posée sur le dernier numéro (ou sur la piste)
    const f = FINITIONS[rendu.finition] || FINITIONS.classique, o = creerRoue(f);
    rendu.objets = o; rendu.scene.add(o.roue);
    const der = montre ? montre.tour : R.etat(st()).dernier;
    if (!rendu.p && der && Number.isInteger(der.numero)) rendu.p = plan(der.numero, 6, 0);
    if (rendu.p) { poser(o, rendu.p, T_FIN); lireBille(); } else o.bille.position.set(R_PISTE * Math.cos(LANCER), hauteurBol(R_PISTE) + 0.028, -R_PISTE * Math.sin(LANCER));
  }
  function jeter(obj) { obj.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
  function refaireRoue() { // une autre finition : la roue est refaite, la bille garde sa case
    if (!rendu || rendu.sans || rendu.raf) return;
    rendu.scene.remove(rendu.objets.roue); jeter(rendu.objets.roue);
    rendu.finition = skin('roue'); poserObjets(); dessiner();
  }
  function taille() {
    if (!rendu || rendu.sans) return;
    const w = roueEl.clientWidth, h = roueEl.clientHeight; if (!w || !h || (w === rendu.w && h === rendu.h)) return;
    rendu.w = w; rendu.h = h;
    rendu.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); rendu.renderer.setSize(w, h, false);
    const c = rendu.cam; c.aspect = w / h;
    const vf = (c.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * c.aspect), f = Math.min(vf * 1.32, hf), dist = 1.12 / Math.sin(f / 2), haut = (58 * Math.PI) / 180; // la roue vue d'en haut, un peu de biais
    c.position.set(0, dist * Math.sin(haut), dist * Math.cos(haut)); c.lookAt(0, 0.04, 0.04); c.updateProjectionMatrix();
  }
  function dessiner() { if (rendu && !rendu.sans && rendu.renderer) rendu.renderer.render(rendu.scene, rendu.cam); }
  function lireBille() { // la case sous la bille, lue sur les objets 3D eux-mêmes (sa position et l'angle du cylindre)
    if (!rendu || rendu.sans || !rendu.objets) return;
    const b = rendu.objets.bille.position; rendu.bille = caseDe(Math.atan2(-b.z, b.x), rendu.objets.cylindre.rotation.y);
  }
  function animer(numero, fin) {
    if (!rendu) construireRoue();
    if (!rendu || rendu.sans) { rendu = rendu || { sans: true }; rendu.bille = numero; roue2d.hidden = false; plus(450, fin); return; } // sans WebGL : le numéro, sans animation
    const o = rendu.objets, c0 = ((o.cylindre.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const p = plan(numero, 6, c0); rendu.p = p; rendu.fin = fin; rendu.bille = null;
    if (reduceMotion) { poser(o, p, T_FIN); lireBille(); dessiner(); rendu.fin = null; plus(0, fin); return; } // mouvement réduit : la bille posée d'emblée
    const t0 = performance.now();
    const image = () => {
      if (!rendu || rendu.sans) return;
      const t = Math.min(T_FIN, (performance.now() - t0) / 1000);
      taille(); poser(o, p, t); dessiner(); // la table s'agrandit pendant le tour : la roue suit
      if (t >= T_FIN) { rendu.raf = 0; lireBille(); const f = rendu.fin; rendu.fin = null; if (f) f(); return; }
      rendu.raf = requestAnimationFrame(image);
    };
    rendu.raf = requestAnimationFrame(image);
  }
  function libererRoue() {
    if (!rendu) return;
    const r = rendu; rendu = null;
    if (r.raf) cancelAnimationFrame(r.raf);
    if (r.ro) r.ro.disconnect();
    if (r.objets) { r.scene.remove(r.objets.roue); jeter(r.objets.roue); }
    if (r.renderer) { r.renderer.dispose(); try { r.renderer.forceContextLoss(); } catch (e) { /* rien */ } }
    if (r.canvas) r.canvas.remove();
    if (roue2d) roue2d.hidden = true;
    if (r.fin) { const f = r.fin; r.fin = null; f(); } // la bille roulait encore : le tour, déjà réglé, se montre tout de suite
  }
  function majRoue() { if (rendu && !rendu.sans && !rendu.raf) { taille(); dessiner(); } }

  // ─── l'affichage ───
  function majPanneau() { if (tableVue === 'roulette') majPanneauR(); else majPanneauBJ(); }
  function maj() {
    if (!el || el.hidden) return;
    const s = st(), h = B.etat(s).main;
    coinsEl.textContent = eur(caisseVue != null ? caisseVue : caisse());
    if (tableVue === 'roulette' && R) {
      const tot = totalR();
      miseEl.textContent = rPhase === 'tour' && montre ? `${eur(montre.tour.mise)} sur le tapis` : tot > 0 ? `${eur(tot)} prêts à miser` : 'dans la caisse';
      roul.classList.toggle('en-mise', rPhase === 'mise');
      majTapis(); majHisto();
      if (rPhase === 'mise' && montre && !montre.enCours && numeroEl.hidden && !rMises.length) montrerNumero(montre.tour); // à la réouverture : le dernier numéro, posé sur la roue
    } else {
      const enJeu = h && !h.fin ? h.mise + h.annexes.reduce((a, x) => a + x.mise, 0) : 0;
      miseEl.textContent = phase === 'mise' ? (totalMises() > 0 ? `${eur(totalMises())} prêts à miser` : 'dans la caisse') : enJeu ? `${eur(enJeu)} sur le tapis` : 'dans la caisse';
      table.classList.toggle('en-mise', phase === 'mise');
      majCases();
    }
    el.querySelectorAll('.ar-bascule [data-table]').forEach((b) => { b.classList.toggle('non', !basculeLibre() && b.dataset.table !== tableVue); });
    majPanneau();
    if (d.apres) d.apres();
  }
  const etat = () => {
    const a = st() && st().arriere, h = a && a.main;
    return { ouvert: ouvert(), table: tableVue, phase, choix, mises: { ...mises }, dialogue: dialogue && !dialogue.hidden ? dialogue.dataset.type : '', carnet: dialogue && !dialogue.hidden && dialogue.dataset.type === 'carnet' ? carnetOnglet : '',
      conseil: !!(a && a.conseil), vue: { joueur: vue.j[0], mains: vue.j.slice(), separee: vue.separee, croupier: vue.croupier, cachee: vue.cachee },
      main: h ? { joueur: h.joueur.map(B.nomCarte), croupier: h.croupier.map(B.nomCarte), fin: h.fin, resultat: h.resultat, mise: h.mise, net: h.net, double: h.double, tapis: h.tapis, annexes: h.annexes.map((x) => ({ id: x.id, gain: x.gain, type: x.combinaison && x.combinaison.type })),
        separee: !!h.separee, active: B.mainActive(h), mains: B.mains(h).map((m) => ({ cartes: m.cartes.map(B.nomCarte), mise: m.mise, resultat: m.resultat, gain: m.gain, active: m.active })) } : null,
      bulles: bullesEl ? [...bullesEl.children].map((b) => b.textContent) : [],
      skins: el ? { tapis: el.dataset.tapis, dos: el.dataset.dos, jetons: el.dataset.jetons, croupier: el.dataset.croupier, roue: el.dataset.roue } : null,
      roulette: { phase: rPhase, mises: rMises.map((m) => ({ cle: R.cle(m), mise: m.mise })), total: totalR(), jeton: jetonPart, vueTapis, numero: montre ? montre.tour.numero : null,
        rendu: rendu ? (rendu.sans ? '2d' : 'webgl') : null, tris: rendu && rendu.objets ? rendu.objets.tris : 0, bille: rendu ? rendu.bille : null, anime: !!(rendu && rendu.raf), finition: rendu && !rendu.sans ? rendu.finition : null } };
  };
  const ROUE = Object.freeze({ T_CALE, T_FIN, plan, etatBille, caseSous, FINITIONS });
  return { init, ouvrir, fermer, maj, get ouvert() { return ouvert(); }, etat, carteEl, ROUE, croupierSVG };
})();
