/* LE FOURNIL — l'arrière-salle : le BlackJack caché, en plein écran par-dessus la boutique (comme l'Atelier). On la trouve en touchant cinq
   fois de suite la petite porte du fond dans la boutique en 3D (ui.js) ; ensuite, une carte discrète du Journal y ramène.
   Les règles, le sabot et les mises sont dans src/blackjack.js (purs, testés dans Node) ; ici, le tapis vert, les cartes dessinées en
   SVG, les jetons, les animations de la donne et les touches. Seule la caisse (st.coins) bouge : jamais la fortune, ni les points.
   Tant que la salle est ouverte, aucun événement surprise ne vient interrompre la main (ui.js la compte comme l'Atelier). */
const ARRIERE = (() => {
  'use strict';
  const G = GAME, B = BLACKJACK, $ = (s) => document.querySelector(s);
  let d = null, el, table, panneau, dialogue, boite, annonce, resultatEl, zJ, zC, tJ, tC, coinsEl, miseEl;
  let hPanneau = 0, phase = '', choix = 'main', mises = { main: 0, paires: 0, plus3: 0 }, vue = { joueur: 0, croupier: 0, cachee: true, main: null }, minuteurs = [];
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = () => d.st();
  const eur = (n) => G.fmtEur(n);
  const NOM_CASE = { main: 'Mise', paires: 'Perfect Pairs', plus3: '21+3' };

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

  // ─── ouvrir, fermer ───
  function init(deps) {
    d = deps; el = $('#arriere'); if (!el) return;
    table = $('#ar-table'); panneau = $('#ar-panneau'); dialogue = $('#ar-dialogue'); boite = dialogue.querySelector('.ar-boite'); annonce = $('#ar-annonce'); resultatEl = $('#ar-resultat');
    zJ = $('#ar-joueur'); zC = $('#ar-croupier'); tJ = $('#ar-tj'); tC = $('#ar-tc'); coinsEl = $('#ar-coins'); miseEl = $('#ar-mise');
    el.querySelector('[data-ar="fermer"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
    el.querySelector('[data-ar="gains"]').addEventListener('click', () => { d.audio(); d.son.tap(); tableauGains(); });
    el.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => { if (phase !== 'mise') return; d.audio(); d.son.tap(); choix = b.dataset.case; majCases(); majPanneau(); }));
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || el.hidden) return; if (!dialogue.hidden && dialogue.dataset.type !== 'accueil') fermerDialogue(); else if (dialogue.hidden) fermer(); });
    dialogue.addEventListener('click', (e) => { if (e.target === dialogue && dialogue.dataset.type === 'gains') fermerDialogue(); });
  }
  const ouvert = () => !!el && !el.hidden;
  function ouvrir() {
    if (!el) return false;
    const a = B.etat(st()); a.trouvee = true;
    el.hidden = false; d.ouvert(); hPanneau = 0; el.style.removeProperty('--panneau-h');
    annuler(); fermerDialogue();
    // la main en cours (l'appli fermée au milieu, ou la salle quittée) reprend là où elle était ; sinon, les dernières mises
    const h = a.main;
    vue = { joueur: 0, croupier: 0, cachee: true, main: null }; zJ.innerHTML = ''; zC.innerHTML = ''; resultatEl.hidden = true; annonce.hidden = true;
    mises = B.borner(st(), a.mises); delete mises.total; delete mises.tapis; // « même mise » : les dernières mises, ramenées à la caisse
    if (h) poserTout(h);
    if (h && !h.fin) phase = 'jeu';
    else { phase = 'mise'; if (h) montrerResultat(h, false); } // la dernière main reste sur le tapis jusqu'à la prochaine donne
    choix = 'main'; maj();
    if (!a.accueil) accueil();
    d.save();
    return true;
  }
  function fermer() {
    if (!el || el.hidden) return;
    annuler(); fermerDialogue(); el.hidden = true; phase = '';
    if (d.ferme) d.ferme();
  }
  const annuler = () => { minuteurs.forEach(clearTimeout); minuteurs = []; };
  const plus = (ms, f) => { minuteurs.push(setTimeout(f, reduceMotion ? Math.min(ms, 60) : ms)); };

  // ─── les dialogues : le mot de la première fois, le tableau des gains, la confirmation du tapis ───
  function ouvrirDialogue(type, html, lier) { dialogue.dataset.type = type; boite.className = 'ar-boite ' + type; boite.innerHTML = html; dialogue.hidden = false; if (lier) lier(boite); }
  function fermerDialogue() { if (!dialogue) return; dialogue.hidden = true; dialogue.dataset.type = ''; boite.innerHTML = ''; }
  function accueil() {
    ouvrirDialogue('accueil', `<span class="ar-pic">${ICONS.UI.arriere}</span>
      <h3>Tu as trouvé l’arrière&#8209;salle…</h3>
      <p>Derrière la petite porte du fond : une lampe basse, un tapis vert et un sabot de six jeux. On y joue l’argent de la caisse, <b>tout ou rien</b>.</p>
      <p class="ar-petit">Rien de ce qui se gagne ou se perd ici ne compte pour le classement ni pour ta fortune. La carte « L’arrière-salle » du Journal t’y ramènera.</p>
      <button type="button" class="btn large beurre" data-ar="asseoir"><b>S’asseoir à la table</b></button>`, (b) => {
      b.querySelector('[data-ar="asseoir"]').addEventListener('click', () => { d.audio(); d.son.tap(); B.etat(st()).accueil = true; d.save(); fermerDialogue(); });
    });
  }
  function tableauGains() {
    const P = B.PAIRES, T = B.VINGT_ET_UN_PLUS_TROIS, S = B.etat(st()).stats;
    const ligne = (nom, ex, mult) => `<li><span>${nom}${ex ? miniCartes(ex) : ''}</span><b>${mult}</b></li>`;
    ouvrirDialogue('gains', `<div class="ar-boite-tete"><h3>Le tableau des gains</h3><button type="button" class="at-fermer" data-ar="ok" aria-label="Fermer le tableau des gains"><i class="ico">${ICONS.UI.fermer}</i></button></div>
      <h4>La main</h4><ul class="ar-gains">${ligne('BlackJack (as + 10 ou figure)', 'A♠ R♥', '3 pour 2')}${ligne('Main gagnante', '', '1 pour 1')}${ligne('Égalité', '', 'mise rendue')}</ul>
      <h4>Perfect Pairs <small>tes deux premières cartes</small></h4><ul class="ar-gains">${ligne('Paire mixte', '7♥ 7♠', `${P.mixte} pour 1`)}${ligne('Paire de couleur', '7♥ 7♦', `${P.couleur} pour 1`)}${ligne('Paire parfaite', '7♠ 7♠', `${P.parfaite} pour 1`)}</ul>
      <h4>21+3 <small>tes deux cartes et celle du croupier</small></h4><ul class="ar-gains">${ligne('Couleur', '2♥ 9♥ R♥', `${T.couleur} pour 1`)}${ligne('Quinte', '4♠ 5♥ 6♦', `${T.quinte} pour 1`)}${ligne('Brelan', '9♠ 9♥ 9♦', `${T.brelan} pour 1`)}${ligne('Quinte couleur', 'V♣ D♣ R♣', `${T.quinteCouleur} pour 1`)}${ligne('Brelan de même enseigne', '9♦ 9♦ 9♦', `${T.brelanCouleur} pour 1`)}</ul>
      <p class="ar-petit">Sabot de 6 jeux, re-mélangé passé les trois quarts. Le croupier tire jusqu’à 17 et reste sur 17 souple. Doubler sur les deux premières cartes ; ni partage, ni assurance. Les mises annexes se posent avant la donne.</p>
      <p class="ar-petit">${S.mains ? `Ici : ${G.fmt(S.mains)} main${S.mains > 1 ? 's' : ''}, ${G.fmt(S.gagnees)} gagnée${S.gagnees > 1 ? 's' : ''}, ${G.fmt(S.blackjacks)} BlackJack${S.blackjacks > 1 ? 's' : ''}.` : 'Aucune main jouée pour l’instant.'}</p>`, (b) => {
      b.querySelector('[data-ar="ok"]').addEventListener('click', () => { d.son.tap(); fermerDialogue(); });
    });
  }
  function confirmerTapis(m, suite) {
    ouvrirDialogue('tapis', `<span class="ar-pic tapis">${ICONS.UI.cartes}</span>
      <h3>Tapis ?</h3>
      <p>Tu mets <b>toute la caisse</b> en jeu : <b class="ar-somme">${eur(m.total)}</b>.</p>
      <p class="ar-petit">Perdue, la caisse est vide. Gagnée, elle double (et un BlackJack paie 3 pour 2).</p>
      <div class="ar-choix"><button type="button" class="btn large clair" data-ar="non"><b>Pas cette fois</b></button><button type="button" class="btn large" data-ar="oui"><b>Oui, tapis !</b></button></div>`, (b) => {
      b.querySelector('[data-ar="non"]').addEventListener('click', () => { d.son.tap(); fermerDialogue(); });
      b.querySelector('[data-ar="oui"]').addEventListener('click', () => { d.audio(); fermerDialogue(); suite(); });
    });
  }

  // ─── les mises ───
  const caisse = () => Math.max(0, st().coins || 0);
  const totalMises = () => mises.main + mises.paires + mises.plus3;
  function borne() { if (phase === 'mise' && resultatEl) resultatEl.hidden = true; const b = B.borner(st(), mises); // une mise qui change : le résultat de la main d'avant s'efface du tapis
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
    if (m.tapis) confirmerTapis(m, lancer); else lancer();
  }
  function lancer() {
    const s = st();
    const r = B.distribuer(s, mises); if (!r.ok) { d.son.non(); maj(); return; }
    d.son.tap(); d.buzz(8);
    zJ.innerHTML = ''; zC.innerHTML = ''; vue = { joueur: 0, croupier: 0, cachee: true, main: r.main }; resultatEl.hidden = true; annonce.hidden = true;
    if (r.melange) montrerAnnonce('Le croupier mélange un sabot neuf…', 'melange');
    d.save(); jouerVers(r.main, r.melange ? 700 : 0);
  }
  function action(quoi) {
    if (phase !== 'jeu') return;
    const s = st(), h = B.enCours(s); if (!h) return;
    const r = quoi === 'tirer' ? B.tirer(s) : quoi === 'doubler' ? B.doubler(s) : B.rester(s);
    if (!r.ok) { d.son.non(); return; }
    d.son.tap(); d.buzz(6); d.save(); jouerVers(r.main, 0);
  }

  // ─── la donne, animée : les cartes partent du sabot une à une ; la carte cachée se retourne ; le croupier tire ───
  function poserCarte(zone, c, cachee, anime) {
    const e = carteEl(c, cachee); zone.appendChild(e); serrer(zone);
    if (anime && !reduceMotion) {
      const sab = table.querySelector('.ar-sabot').getBoundingClientRect(), r = e.getBoundingClientRect();
      e.style.setProperty('--dx', `${Math.round(sab.left + sab.width / 2 - (r.left + r.width / 2))}px`); e.style.setProperty('--dy', `${Math.round(sab.top + sab.height / 2 - (r.top + r.height / 2))}px`);
      e.classList.add('arrive');
    }
    return e;
  }
  function serrer(zone) { const n = zone.children.length; zone.style.setProperty('--n', n); zone.classList.toggle('serre', n >= 6); zone.classList.toggle('tres-serre', n >= 8); if (zone.parentElement) zone.parentElement.classList.toggle('large', n >= 5); } // une longue main : le total passe au-dessus, à gauche
  function retourner() { const e = zC.children[1]; if (e && e.classList.contains('cachee')) { e.classList.remove('cachee'); e.setAttribute('aria-label', nomLong(B.etat(st()).main.croupier[1])); } vue.cachee = false; majTotaux(); }
  function poserTout(h) { // sans animation : la main telle qu'elle est (retour dans la salle)
    zJ.innerHTML = ''; zC.innerHTML = '';
    h.joueur.forEach((c) => poserCarte(zJ, c, false, false)); h.croupier.forEach((c, k) => poserCarte(zC, c, k === 1 && h.cachee, false));
    vue = { joueur: h.joueur.length, croupier: h.croupier.length, cachee: h.cachee, main: h }; majTotaux();
  }
  function jouerVers(h, attente) {
    phase = 'anim'; maj();
    const pas = []; const P = 300, R = 420; // le rythme : une carte toutes les 0,3 s ; le croupier prend son temps
    if (vue.joueur === 0) { pas.push(['j', P], ['c', P], ['j', P], ['c', P]); }
    const j0 = Math.max(vue.joueur, pas.length ? 2 : 0); for (let k = j0; k < h.joueur.length; k++) pas.push(['j', P]);
    if (pas.length && h.annexes.length && vue.joueur === 0) pas.push(['annexes', 250]);
    if (!h.cachee) { pas.push(['retourner', 450]); for (let k = Math.max(2, vue.croupier); k < h.croupier.length; k++) pas.push(['c', R + 120]); }
    let t = attente || 0;
    for (const [quoi, dur] of pas) {
      plus(t, () => {
        if (quoi === 'j') { const k = vue.joueur++; poserCarte(zJ, h.joueur[k], false, true); d.son.tap(); majTotaux(); }
        else if (quoi === 'c') { const k = vue.croupier++; poserCarte(zC, h.croupier[k], k === 1 && vue.cachee, true); majTotaux(); }
        else if (quoi === 'retourner') { retourner(); d.son.tap(); }
        else if (quoi === 'annexes') annexes(h);
      });
      t += dur;
    }
    plus(t + 120, () => {
      if (h.fin) { if (vue.cachee) retourner(); phase = 'mise'; borne(); montrerResultat(h, true); }
      else phase = 'jeu';
      maj();
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
  function montrerResultat(h, fete) {
    const j = B.valeur(h.joueur).total, c = B.valeur(h.croupier).total, g = B.gagnant(h.resultat);
    const cls = h.resultat === 'blackjack' ? 'bj' : g ? 'gagne' : h.resultat === 'egalite' ? 'egal' : 'perdu';
    const net = h.net, ligneNet = net > 0 ? `+${eur(net)}` : net < 0 ? `−${eur(-net)}` : 'Rien de perdu';
    resultatEl.className = 'ar-resultat ' + cls; resultatEl.dataset.resultat = h.resultat;
    resultatEl.innerHTML = `<span class="haut"><b>${B.MOTS[h.resultat]}</b><i class="${net > 0 ? 'plus' : net < 0 ? 'moins' : ''}">${ligneNet}</i></span><span class="ar-detail">${esc(DETAIL[h.resultat](j, c))}</span>`;
    resultatEl.hidden = false;
    if (!fete) return;
    if (h.resultat === 'blackjack') { d.son.deblocage(); d.buzz([20, 40, 20, 40, 30]); }
    else if (g) { d.son.vente(h.gain); d.buzz([10, 30, 10]); }
    else if (h.resultat === 'egalite') d.son.tap();
    else { d.son.non(); d.buzz(30); }
    if (h.tapis && !(caisse() > 0)) montrerAnnonce('La caisse est vide… les fournées la rempliront.', 'rien');
  }

  // ─── l'affichage ───
  function majTotaux() {
    const h = vue.main || B.etat(st()).main;
    const txt = (cartes) => { const v = B.valeur(cartes); return v.blackjack ? 'BlackJack' : v.souple && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total); };
    if (!h || !vue.joueur) { tJ.hidden = true; tC.hidden = true; return; }
    const cj = h.joueur.slice(0, vue.joueur), cc = h.croupier.slice(0, vue.croupier);
    tJ.hidden = false; tJ.textContent = txt(cj); tJ.classList.toggle('brule', B.valeur(cj).brule); tJ.classList.toggle('bj', B.valeur(cj).blackjack);
    const visibles = vue.cachee ? cc.slice(0, 1) : cc; tC.hidden = !visibles.length; tC.textContent = visibles.length ? txt(visibles) : ''; tC.classList.toggle('brule', B.valeur(visibles).brule); tC.classList.toggle('bj', !vue.cachee && B.valeur(cc).blackjack);
  }
  function majCases() {
    const h = B.etat(st()).main, enJeu = phase !== 'mise' && h, mise = phase === 'mise';
    el.querySelectorAll('[data-case]').forEach((b) => {
      const id = b.dataset.case, v = enJeu ? (id === 'main' ? h.mise : h.mises[id]) : mises[id], x = enJeu && id !== 'main' ? h.annexes.find((a) => a.id === id) : null;
      b.classList.toggle('choisie', mise && choix === id); b.classList.toggle('sans', !(v > 0)); b.classList.toggle('pleine', v > 0);
      b.classList.toggle('gagnee', !!(x && x.gain > 0 && vue.joueur >= 2)); b.classList.toggle('perdue', !!(x && !x.gain && vue.joueur >= 2));
      b.disabled = !mise; b.setAttribute('aria-pressed', mise && choix === id ? 'true' : 'false');
      b.querySelector('b').textContent = v > 0 ? (x && x.gain > 0 && vue.joueur >= 2 ? `+${eur(x.gain)}` : eur(v)) : mise && choix === id ? 'à poser' : '—';
      b.setAttribute('aria-label', `${NOM_CASE[id]} : ${v > 0 ? eur(v) : 'rien'}`);
    });
  }
  function majPanneau() {
    const s = st(), c = caisse(), h = B.enCours(s);
    if (phase === 'jeu' && h) {
      const dbl = B.peutDoubler(s);
      panneau.className = 'ar-panneau jeu';
      const ann = h.annexes.reduce((a, x) => a + x.gain - x.mise, 0);
      panneau.innerHTML = `<div class="ar-infos-main"><span><small>Ta mise</small><b>${eur(h.mise)}</b></span><span><small>Annexes</small><b class="${ann > 0 ? 'plus' : ''}">${h.annexes.length ? (ann > 0 ? `+${eur(ann)}` : ann < 0 ? `−${eur(-ann)}` : '0 €') : '—'}</b></span><span><small>En caisse</small><b>${eur(c)}</b></span></div>
        <div class="ar-actions">
        <button type="button" class="btn ar-act menthe" data-ar="tirer"><b>Tirer</b><small>une carte</small></button>
        <button type="button" class="btn ar-act" data-ar="rester"><b>Rester</b><small>à ${B.valeur(h.joueur).total}</small></button>
        <button type="button" class="btn ar-act lavande${dbl ? '' : ' non'}" data-ar="doubler" ${dbl ? '' : 'aria-disabled="true"'}><b>Doubler</b><small>${h.joueur.length > 2 || h.double ? 'plus possible' : dbl ? `+${eur(h.mise)}` : 'caisse trop courte'}</small></button></div>`;
      panneau.querySelector('[data-ar="tirer"]').addEventListener('click', () => { d.audio(); action('tirer'); });
      panneau.querySelector('[data-ar="rester"]').addEventListener('click', () => { d.audio(); action('rester'); });
      panneau.querySelector('[data-ar="doubler"]').addEventListener('click', () => { d.audio(); if (!B.peutDoubler(st())) { d.son.non(); return; } action('doubler'); });
      return;
    }
    if (phase === 'anim') { panneau.classList.add('attente'); panneau.querySelectorAll('button').forEach((b) => { b.disabled = true; }); return; }
    // miser : les jetons rapides, le réglage fin, distribuer
    const reste = Math.max(0, c - totalMises()), m = B.borner(s, mises), parts = [[0.01, '1 %', 'menthe'], [0.1, '10 %', 'ciel'], [0.5, '50 %', 'lavande']];
    panneau.className = 'ar-panneau mise';
    if (!(c >= B.MISE_MIN) && !(totalMises() > 0)) {
      panneau.innerHTML = `<p class="ar-vide"><b>La caisse est vide.</b> Les fournées et les apprentis la rempliront : reviens plus tard.</p><button type="button" class="btn large clair" data-ar="sortir"><b>Retour à la boutique</b></button>`;
      panneau.querySelector('[data-ar="sortir"]').addEventListener('click', () => { d.son.tap(); fermer(); });
      return;
    }
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
    // le panneau garde la hauteur du panneau des mises : la table ne saute pas d'une phase à l'autre
    const hp = panneau.offsetHeight; if (hp > hPanneau) { hPanneau = hp; el.style.setProperty('--panneau-h', `${hp}px`); }
    panneau.querySelectorAll('[data-jeton]').forEach((b) => b.addEventListener('click', () => { d.audio(); if (b.dataset.jeton === 'tapis') tapis(); else ajouter(B.jeton(st(), +b.dataset.jeton)); }));
    panneau.querySelector('[data-ar="moins"]').addEventListener('click', () => { d.audio(); ajuster(-1); });
    panneau.querySelector('[data-ar="plus"]').addEventListener('click', () => { d.audio(); ajuster(1); });
    panneau.querySelector('[data-ar="effacer"]').addEventListener('click', () => { d.audio(); effacer(); });
    panneau.querySelector('[data-ar="donner"]').addEventListener('click', () => { d.audio(); donner(); });
  }
  function maj() {
    if (!el || el.hidden) return;
    const s = st(), h = B.etat(s).main;
    coinsEl.textContent = eur(caisse());
    const enJeu = h && !h.fin ? h.mise + h.annexes.reduce((a, x) => a + x.mise, 0) : 0;
    miseEl.textContent = phase === 'mise' ? (totalMises() > 0 ? `${eur(totalMises())} prêts à miser` : 'dans la caisse') : enJeu ? `${eur(enJeu)} sur le tapis` : 'dans la caisse';
    table.classList.toggle('en-mise', phase === 'mise');
    majCases(); majPanneau();
    if (d.apres) d.apres();
  }
  const etat = () => {
    const a = st() && st().arriere, h = a && a.main;
    return { ouvert: ouvert(), phase, choix, mises: { ...mises }, dialogue: dialogue && !dialogue.hidden ? dialogue.dataset.type : '', vue: { joueur: vue.joueur, croupier: vue.croupier, cachee: vue.cachee },
      main: h ? { joueur: h.joueur.map(B.nomCarte), croupier: h.croupier.map(B.nomCarte), fin: h.fin, resultat: h.resultat, mise: h.mise, net: h.net, double: h.double, tapis: h.tapis, annexes: h.annexes.map((x) => ({ id: x.id, gain: x.gain, type: x.combinaison && x.combinaison.type })) } : null };
  };
  return { init, ouvrir, fermer, maj, get ouvert() { return ouvert(); }, etat, carteEl };
})();
