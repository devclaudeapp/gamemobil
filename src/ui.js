/* LE FOURNIL — interface : barre d'onglets (Boutique, Défis, Boulanger, Journal, Réglages), cartes compactes, ticket des objectifs,
   bannière d'événement sur la scène, cloche, badges, feuilles, classement en ligne, sons, sauvegarde, boucle. */
const UI = (() => {
  'use strict';
  const G = GAME, $ = (s) => document.querySelector(s), KEY = 'fournil.v2';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let st, lastFrame = 0, lastSave = 0, cards = [], carteSaison = null, lastHud = '', lastObj = '', lastEv = '', lastPage = '', hintStep = -1, hintUntil = 0, hintDefile = -1, toastTimer = 0, lastNiveau = 0, vuBoulanger = false, dernierToucher = -1e9;
  let pageActive = 'boutique', evEtendu = false, retourEnCours = false; // retourEnCours : la page redevient visible, l'heure sûre est en route
  let absencePrete = false, absencePayee = 0, dernierRetour = ''; // l'absence du lancement est comptée ; ce qui a été payé (ms) pour l'absence en cours (lancement, retour, sauts) ; ce qui a lancé le dernier retour (pour les tests)
  let classement = null, ongletCl = 'semaine', vueCl = ''; // le classement en ligne : son moteur, l'onglet choisi, la feuille qu'il occupe
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAGES = ['boutique', 'defis', 'boulanger', 'journal', 'reglages'];

  // ─── sauvegarde : localStorage et IndexedDB en double (le second résiste mieux quand l'app est tuée), on relit la plus récente ───
  const DB = 'fournil', STORE = 'sauvegarde';
  const idb = () => new Promise((res) => {
    try {
      if (!window.indexedDB) return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
      setTimeout(() => res(null), 1500);
    } catch (e) { res(null); }
  });
  function idbEcrire(raw) { idb().then((db) => { if (!db) return; try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(raw, KEY); } catch (e) { /* rien */ } }); }
  function idbLire() { return idb().then((db) => new Promise((res) => { if (!db) return res(null); try { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res(typeof r.result === 'string' ? r.result : null); r.onerror = () => res(null); setTimeout(() => res(null), 1500); } catch (e) { res(null); } })); }
  function idbEffacer() { return idb().then((db) => new Promise((res) => { if (!db) return res(); try { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = () => res(); t.onerror = () => res(); setTimeout(res, 1500); } catch (e) { res(); } })); }
  let fige = false; // après « tout effacer » ou le chargement d'un code : plus aucune écriture jusqu'au rechargement
  function save() {
    if (fige) return;
    if (!retourEnCours) st.lastSeen = HORLOGE.maintenant(); // pendant un retour, l'absence n'est pas encore comptée : elle part toujours de l'ancien lastSeen
    if (!retourEnCours) st.vuTel = Date.now(); // l'heure du téléphone à cette sauvegarde : seulement pour (e), le retour à l'heure de l'horloge
    lastSave = performance.now();
    st.horloge = HORLOGE.sauver(); // l'heure sûre et le dernier « maintenant » du jeu : dans la sauvegarde et dans leur clé à part
    let raw; try { raw = JSON.stringify(st); } catch (e) { return; }
    try { localStorage.setItem(KEY, raw); } catch (e) { /* stockage indisponible */ }
    idbEcrire(raw);
  }
  function lire(raw) {
    try {
      if (!raw) return null;
      const s = JSON.parse(raw); if (!s || s.v !== 2 || !Array.isArray(s.stations)) return null;
      const fresh = G.newState(HORLOGE.maintenant());
      for (const k in fresh) if (!(k in s)) s[k] = fresh[k];
      while (s.stations.length < G.PRODUITS.length) s.stations.push({ niv: 0, staff: false, prog: 0, actif: false });
      G.compagnons(s); // une vieille sauvegarde : son chat adopté devient le compagnon « chat-roux » (ou « chat-noir »)
      return s;
    } catch (e) { return null; }
  }
  async function load() {
    let a = null, b = null;
    try { a = lire(localStorage.getItem(KEY)); } catch (e) { /* stockage indisponible */ }
    try { b = lire(await idbLire()); } catch (e) { /* rien */ }
    if (a && b) return (b.lifetime > a.lifetime || (b.lifetime === a.lifetime && b.lastSeen > a.lastSeen)) ? b : a;
    return a || b;
  }
  function effacer() { try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } return idbEffacer(); }
  // code de sauvegarde : l'état en base64, à copier pour le garder ailleurs ou le transférer
  function codeSauvegarde() { try { const bytes = new TextEncoder().encode(JSON.stringify(st)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return 'FOURNIL1.' + btoa(bin); } catch (e) { return ''; } }
  function lireCode(code) {
    try {
      const t = String(code || '').replace(/\s+/g, ''); const b64 = t.startsWith('FOURNIL1.') ? t.slice(9) : t;
      const bin = atob(b64); return lire(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    } catch (e) { return null; }
  }

  // ─── sons : de vrais bruitages (src/sons.js) dès qu'ils sont chargés, sinon des bips (Web Audio, sans fichier) ───
  let actx = null;
  function audio() { if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { actx = new AC(); } catch (e) { actx = null; } if (actx && typeof SONS !== 'undefined') SONS.brancher(actx); }
  function beep(freq, dur, type, vol, delay) {
    if (!actx || !st.son || actx.state !== 'running') return;
    const t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sf = (n, o) => !!st.son && typeof SONS !== 'undefined' && SONS.jouer(n, o); // un vrai bruitage, s'il est prêt
  const zf = (n, o) => !!st.son && typeof SONS !== 'undefined' && SONS.zz(n, o);
  const son = {
    tap: () => sf('clic', { vol: 0.35 }) || beep(520, 0.08, 'triangle', 0.06),
    vente: (m) => { const k = Math.min(6, Math.floor(Math.log10(Math.max(1, m)))); if (sf('piece', { vol: 0.28, vitesse: 1 + k * 0.06 })) return; beep(660 + k * 80, 0.12, 'sine', 0.05); beep(990 + k * 80, 0.16, 'sine', 0.04, 0.06); },
    achat: () => { if (sf('pose', { vol: 0.45 })) return; beep(440, 0.1, 'triangle', 0.06); beep(660, 0.14, 'triangle', 0.06, 0.08); },
    deblocage: () => { if (sf('fanfare', { vol: 0.5 })) { sf('piece', { vol: 0.22, vitesse: 1.3, delai: 0.14 }); return; } [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.07, i * 0.09)); },
    embauche: () => { if (sf('pose2', { vol: 0.45 })) { sf('pop', { vol: 0.35, delai: 0.1 }); return; } [784, 988].forEach((f, i) => beep(f, 0.2, 'sine', 0.06, i * 0.12)); },
    evenement: () => zf('alerte') || [659, 784, 659, 988].forEach((f, i) => beep(f, 0.14, 'square', 0.035, i * 0.1)),
    sirene: () => zf('sirene', { vol: 0.18 }) || son.evenement(),
    pourboire: () => { if (sf('piece', { vol: 0.3 })) { sf('piece', { vol: 0.28, vitesse: 1.25, delai: 0.08 }); sf('piece', { vol: 0.26, vitesse: 1.5, delai: 0.16 }); return; } [1047, 1319, 1568].forEach((f, i) => beep(f, 0.2, 'sine', 0.06, i * 0.07)); },
    carte: () => sf('carte', { vol: 0.4, vitesse: 0.95 + Math.random() * 0.1 }) || beep(520, 0.08, 'triangle', 0.06),
    non: () => sf('refus', { vol: 0.25 }) || beep(200, 0.12, 'square', 0.03),
    ronron: () => { beep(300, 0.25, 'sine', 0.05); beep(420, 0.28, 'sine', 0.04, 0.12); },
  };
  // des confettis (canvas-confetti, vendor/confetti.min.js, seulement sur la page du jeu) : couleurs du Fournil, rien si l'on préfère moins de mouvement
  function confettis(force) {
    if (typeof confetti !== 'function') return false;
    try { const n = Math.round(70 * (force || 1)); confetti({ particleCount: n, spread: 75, startVelocity: 38, origin: { x: 0.5, y: 0.32 }, colors: ['#FFC84A', '#FF6B8B', '#5FD3A4', '#B8A6FF', '#FFFFFF'], scalar: 0.9, ticks: 160, zIndex: 3000, disableForReducedMotion: true }); window.__confettis = (window.__confettis || 0) + 1; return true; } catch (e) { return false; }
  }

  function buzz(p) { if (!st.vibre) return; try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* pas de vibreur */ } } // avant toute touche (un trophée au lancement), le navigateur refuse la vibration : on s'en passe

  // ─── cartes des produits (compactes : niveau sur l'icône, barre fine, deux boutons de 44 px) ───
  function buildCards() {
    const box = $('#cartes'); box.innerHTML = ''; cards = [];
    const sa = document.createElement('article'); sa.className = 'carte saison'; sa.dataset.saison = '1'; sa.hidden = true; box.appendChild(sa); carteSaison = { el: sa, html: '' }; // la recette de saison, avant les huit produits
    G.PRODUITS.forEach((p, i) => { const el = document.createElement('article'); el.className = 'carte'; el.dataset.i = i; box.appendChild(el); cards.push({ el, html: '' }); });
    renderCards(true);
  }
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function renderSaison(force) { // la carte de la recette de saison : préparer, améliorer, cuire à la main ; la collection en barre
    const c = carteSaison; if (!c) return; const s = st.saison, r = G.recetteSaison(st);
    if (!s || !r) { if (!c.el.hidden) { c.el.hidden = true; c.html = ''; } return; }
    const coll = (st.collection || {})[r.id], f = coll ? coll.fournees : 0, prix = G.coutSaison(st), ok = st.coins >= prix, max = s.niv >= G.SAISON.nivMax;
    const html = `<div class="icone">${ICONS.SAISON[r.id]}${s.niv ? `<span class="niv">${s.niv}</span>` : ''}</div>
      <div class="corps"><h3><span class="nom">${esc(r.nom)} <span class="tag saison">jusqu’au ${r.fin[1]} ${MOIS[r.fin[0] - 1]}</span></span></h3>
        ${s.niv ? `<div class="palier"><span>Collection <b>${Math.min(f, G.SAISON.maitrise)}</b>/${G.SAISON.maitrise}${coll && coll.maitrisee ? ' · maîtrisée' : ''}</span><span>niveau ${s.niv}</span><i style="width:${pct(Math.min(f, G.SAISON.maitrise), G.SAISON.maitrise)}"></i></div>
        <div class="barre"><i></i><span class="rev">+${G.fmtEur(G.revenuSaison(st))}</span>${s.actif ? `<span class="tps">${G.fmtDuree(G.tempsSaison(st))}</span>` : '<span class="cuire">Touche !</span>'}</div>` : `<p>${esc(r.desc)} À cuire à la main : cent fournées pour la maîtriser.</p>`}</div>
      <div class="boutons">${max ? '<div class="staff-ok"><span>Niveau max</span></div>' : `<button type="button" class="btn ${s.niv ? '' : 'beurre'} ${ok ? '' : 'non'}" data-a="${s.niv ? 'saison-niv' : 'preparer'}"><small>${s.niv ? 'Améliorer ×1' : 'Préparer'}</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
    const cls = 'carte saison' + (s.niv ? ' manuel' : '') + (s.actif ? ' actif' : '');
    c.el.hidden = false;
    if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); } else if (c.el.className !== cls) c.el.className = cls;
    if (c.bar) c.bar.style.width = (s.actif ? Math.min(100, s.prog / Math.max(0.01, G.tempsSaison(st)) * 100) : 0).toFixed(1) + '%';
  }
  function renderCards(force) {
    renderSaison(force);
    const remise = G.remise(st), critique = st.ev && st.ev.type === 'critique' ? st.ev.restants : [];
    G.PRODUITS.forEach((p, i) => {
      const s = st.stations[i], c = cards[i];
      let html, cls;
      if (s.niv === 0) {
        const prev = i === 0 || st.stations[i - 1].niv > 0, ok = st.coins >= p.debloquer * remise;
        cls = 'carte verrou' + (prev ? '' : ' secret');
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${esc(p.desc)} Rapporte ${G.fmtEur(p.rev)} la fournée.</p>
          <button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>${remise < 1 ? `Débloquer −${Math.round((1 - remise) * 100)} %` : 'Débloquer'}</small><b>${G.fmtEur(p.debloquer * remise)}</b></button></div>`;
      } else {
        const n = G.quantite(st, i), prix = G.prixNiveaux(st, i, n), ok = st.coins >= prix, pal = G.prochainPalier(s.niv);
        const prec = G.PALIERS.filter((x) => x <= s.niv).pop() || 0, franchit = pal && s.niv + n >= pal; // le palier : les gains doublent à 25, 50, 100…
        const rapide = p.temps <= 1.5 && s.staff;
        cls = 'carte' + (s.staff ? ' auto' : ' manuel') + (s.actif ? ' actif' : '') + (critique.includes(i) ? ' gouter' : '');
        html = `${critique.includes(i) ? '<span class="badge-critique">Sers le critique !</span>' : ''}<div class="icone">${ICONS.PRODUITS[p.id]}<span class="niv">${s.niv}</span></div>
          <div class="corps"><h3><span class="nom">${esc(p.nom)}${st.jour && st.jour.pain === i ? ' <span class="tag">×1,5</span>' : ''}${st.specialite === i ? ' <span class="tag spe">×2</span>' : ''}</span></h3>
            <div class="palier ${franchit ? 'bientot' : ''}">${pal ? `<span title="Au niveau ${pal}, les gains sont multipliés par ${G.palierMult(pal)}">Palier <b>${pal}</b> · ×${G.palierMult(pal)}</span><span>${pal - s.niv === 1 ? '1 niveau' : `${pal - s.niv} niveaux`}</span><i style="width:${((s.niv - prec) / (pal - prec) * 100).toFixed(0)}%"></i>` : `<span>Dernier palier atteint · ×${G.palierMult(s.niv)}</span><i style="width:100%"></i>`}</div>
            <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${G.fmtEur(G.revenuFournee(st, i))}</span>${s.staff || s.actif ? `<span class="tps">${G.fmtDuree(G.temps(st, i))}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
          <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'} ${remise < 1 ? 'promo' : ''}" data-a="ameliorer"><small>${remise < 1 ? `−${Math.round((1 - remise) * 100)} % ×${n}` : `Améliorer ×${n}`}</small><b>${G.fmtEur(prix)}</b>${franchit ? `<i class="pal-badge">palier ×${G.palierMult(pal)}</i>` : ''}</button>
            ${s.staff ? (() => { const g = G.gradeApprenti(st, i); return `<button type="button" class="staff-ok" data-a="apprenti" aria-label="${esc(p.staffNom)}, grade ${g} : voir sa fiche">${ICONS.apprenti(i, g)}<span>${esc(p.staffNom.split(' ').pop())}</span><i class="grade g${g}">${g}</i></button>`; })() : `<button type="button" class="btn beurre ${st.coins >= G.prixStaff(st, i) ? '' : 'non'}" data-a="embaucher"><small>Embaucher${G.gradeApprenti(st, i) > 1 ? ` · grade ${G.gradeApprenti(st, i)}` : ''}</small><b>${G.fmtEur(G.prixStaff(st, i))}</b></button>`}</div>`; // l'apprenti revient avec le grade qu'il avait
      }
      if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); }
      else if (c.el.className !== cls) c.el.className = cls;
      if (c.bar && !c.bar.classList.contains('rapide')) c.bar.style.width = (s.niv > 0 && s.actif ? Math.min(100, s.prog / G.temps(st, i) * 100) : 0).toFixed(1) + '%';
    });
  }
  function onCardClick(e) {
    const art = e.target.closest('.carte'); if (!art) return;
    if (art.dataset.saison) { clicSaison(e); return; }
    const i = +art.dataset.i, btn = e.target.closest('button[data-a]');
    audio();
    if (btn) {
      const a = btn.dataset.a;
      if (a === 'apprenti') { son.tap(); sheetApprenti(i); return; }
      if (a === 'debloquer' || a === 'ameliorer') {
        const r = G.acheter(st, i);
        if (!r.ok) { son.non(); toast(`Il manque ${G.fmtEur(r.prix - st.coins)}`); return; }
        if (a === 'debloquer') { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); confettis(1); toast(`${G.PRODUITS[i].nom} : nouvelle recette !`); } else { son.achat(); buzz(8); }
        renderCards(true); hud(); save(); return;
      }
      if (a === 'embaucher') {
        const r = G.embaucher(st, i);
        if (!r.ok) { son.non(); toast(`Il manque ${G.fmtEur(r.prix - st.coins)}`); return; }
        son.embauche(); buzz([10, 30, 10]); toast(`${G.PRODUITS[i].staffNom} rejoint l’équipe !`);
        renderCards(true); hud(); save(); return;
      }
    }
    if (st.ev && st.ev.type === 'critique' && st.ev.restants.includes(i)) { // on sert le critique
      const r = G.servir(st, i); if (!r.ok) return;
      if (r.fini) reussite(`Le critique est conquis : tout ×${G.CRITIQUE.mult} pendant ${G.CRITIQUE.boost / 60} minutes !`);
      else { son.achat(); buzz(8); toast(`Le critique goûte… encore ${r.restants} recette${r.restants > 1 ? 's' : ''}.`); renderCards(true); }
      return;
    }
    if (st.stations[i].niv > 0 && !st.stations[i].staff) { if (G.lancer(st, i)) { son.tap(); buzz(6); SCENE.tap(); renderCards(); } }
  }

  function clicSaison(e) { // préparer ou améliorer la recette de saison, ou lancer une fournée en touchant la carte
    audio(); const btn = e.target.closest('button[data-a]'), r = G.recetteSaison(st); if (!r) return;
    if (btn) {
      const res = G.preparerSaison(st);
      if (!res.ok) { son.non(); if (res.prix) toast(`Il manque ${G.fmtEur(res.prix - st.coins)}`); return; }
      if (res.niv === 1) { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); confettis(0.8); toast(`${r.nom} : au menu jusqu’au ${r.fin[1]} ${MOIS[r.fin[0] - 1]} ! Touche la carte pour en cuire.`); } else { son.achat(); buzz(8); }
      renderCards(true); hud(); save(); return;
    }
    if (G.lancerSaison(st)) { son.tap(); buzz(6); SCENE.tap(); renderCards(); }
  }
  // la fiche d'un apprenti : son grade, ce qu'il apporte, son talent, le temps avant le grade suivant
  function sheetApprenti(i) {
    const p = G.PRODUITS[i], a = G.APPRENTIS[i], pr = G.progresApprenti(st, i), g = pr.n, vit = Math.round(G.APPRENTI_VITESSE * (g - 1) * 100);
    const restant = g < 5 ? pr.prochain - pr.reste : 0; // l'expérience compte les secondes de cuisson
    openSheet(`<div class="apprenti-tete">${ICONS.apprenti(i, g)}<div><h2>${esc(p.staffNom)}</h2><p class="sous">Grade <b>${g}</b> sur 5 · s’occupe des ${esc(p.pl)}</p></div></div>
      <div class="encadre doux"><div class="stat"><span>Fournées</span><b>${vit ? `${vit} % plus rapides` : 'à la vitesse normale'}</b></div>
        <div class="stat"><span>Talent au grade 3</span><b>${esc(a.talent)}</b></div><p class="note talent">${g >= 3 ? 'Acquis : ' : ''}${esc(G.effetTalentApprenti(i))}</p></div>
      ${g < 5 ? `<div class="stat"><span>Grade ${g + 1}</span><b>encore ≈ ${G.fmtDuree(restant)} de fournil</b></div><div class="mini xp"><i style="width:${pct(pr.reste, pr.prochain)}"></i></div>` : '<p class="note">Grade maximum : un pilier de la boutique.</p>'}
      <p class="note">Un apprenti prend du métier à chaque fournée (pendant ton absence, la moitié du temps compte) et garde son grade d’une boutique à l’autre : −2 % de temps de cuisson par grade, et son talent au grade 3.</p>${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
  }
  function annoncerGrade(g) { const a = G.APPRENTIS[g.i]; son.embauche(); buzz([10, 30, 10]); toast(`${a.prenom} passe au grade ${g.niv}${g.talent ? ` : ${a.talent} !` : ' !'}`); renderCards(true); }
  // le chat qui miaule à la porte : on l'adopte et on le nomme, ou il repassera
  function sheetChat(seule) { // seule : ouverte par le jeu, pas par le joueur
    if (seule && performance.now() - dernierToucher < 1000) { st.chatAttente = 2; return; } // le joueur touche l'écran : le chat attend d'être remarqué
    st.chatAttente = 300; // fermée sans choisir, la feuille revient dans cinq minutes
    openSheet(`<div class="chat-tete">${chatNoir() ? ICONS.CHAT_NOIR : ICONS.CHAT}</div><h2>Un chat miaule à la porte</h2><p class="sous">Il a senti les éclairs et veut rester. Comment l’appelles-tu ?</p>
      <input class="champ" type="text" maxlength="16" value="${G.CHAT.defaut}" aria-label="Nom du chat" autocomplete="off" autocorrect="off">
      <button type="button" class="btn large beurre" data-a="adopter" style="margin-top:12px"><b>L’adopter</b></button>
      <button type="button" class="btn large non" data-a="plus-tard" style="margin-top:8px"><b>Pas aujourd’hui</b></button>`);
    const champ = fc.querySelector('.champ');
    const pret = () => !seule || performance.now() - openedAt > 500; // la feuille s'est ouverte toute seule : un toucher déjà en route ne choisit pas pour le joueur
    const ok = () => { if (!pret()) return; const r = G.adopterChat(st, champ.value); closeSheet(); if (r.ok) { reussite(`${r.chat.nom} a adopté la boutique ! Caresse-le : il porte chance.`); renderPage(true); } };
    on('[data-a="adopter"]', ok); on('[data-a="plus-tard"]', () => { if (!pret()) return; G.refuserChat(st); save(); closeSheet(); toast('Le chat repassera demain.'); });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }
  function sheetNomChat(retour) { // retour : la feuille d'où l'on vient (« Les compagnons »)
    if (!st.chat) return;
    const id = modeleVu(), fin = () => { if (retour) retour(); else closeSheet(); };
    openSheet(`<div class="chat-tete">${ICONS.compagnon(id)}</div><h2>Le nom du compagnon</h2><input class="champ" type="text" maxlength="16" value="${esc(st.chat.nom)}" aria-label="Nom du compagnon" autocomplete="off" autocorrect="off">
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>Garder ce nom</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Annuler</b></button>`);
    const champ = fc.querySelector('.champ'), ok = () => { G.renommerChat(st, champ.value); save(); fin(); renderPage(true); toast(G.estChat(id) ? `${st.chat.nom} ronronne.` : `${st.chat.nom} adore son nom.`); };
    on('[data-a="ok"]', ok); on('[data-a="non"]', fin); champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    setTimeout(() => { champ.focus(); champ.select(); }, 50);
  }
  function caresserChat() { // une caresse au compagnon : son cri (ou le ronron), des cœurs, un nuage de farine pour le mini-dragon ; une fois par minute, la chance
    const r = G.caresser(st); if (!r.ok) return;
    const id = modeleVu(), cri = criCompagnon(id); buzz(6); if (SCENE.ronron) SCENE.ronron(); if (id === 'dragon' && SCENE.souffle) SCENE.souffle(reduceMotion ? 3 : 7);
    if (r.chance) toast(`${cri} ${st.chat.nom} porte chance : le client mystère passera plus tôt.`);
  }

  // ─── en-tête, enseigne, cloche et badges des onglets ───
  const trophesGagnes = () => G.TROPHEES.filter((t) => (st.trophees || {})[t.id]).length;
  // les nouvelles du Journal pas encore lues : celles du carnet arrivées après la dernière visite du Journal (les trophées y sont annoncés)
  const nonLues = () => { const vu = (st.vu && st.vu.journal) || 0; return (st.carnetEv || []).filter((e) => e.t > vu).length; };
  const marquerLu = () => { if (!st.vu) st.vu = {}; const c = st.carnetEv || []; st.vu.journal = Math.max(st.vu.journal || 0, c.length ? c[c.length - 1].t : 0, st.now || 0); };
  const primesAReclamer = () => { const j = G.objectifsDuJour(st, st.now), sm = st.semaine; return j.objectifs.filter((o) => o.fait && !o.reclame).length + (sm && sm.fait && !sm.reclame ? 1 : 0); };
  function badge(el, n, cls) { const b = el.querySelector('.badge'); if (!b) return; b.hidden = !n; b.textContent = n > 0 && cls !== 'point' ? n : ''; b.className = 'badge' + (cls ? ' ' + cls : ''); }
  function hud() {
    const taux = G.tauxParSeconde(st), gain = G.etoilesGagnables(st), marche = G.jourDeMarche(st.now), boost = st.boost && st.boost.fin > st.now ? st.boost.mult : 0;
    const bonus = G.AMELIORATIONS.filter((a) => !st.ameliorations[a.id] && st.coins >= G.prixBonus(st, a)).length + G.MOBILIER.filter((m) => G.mobilierCran(st, m.id) < m.max && st.coins >= G.prixMeuble(st, m.id)).length, primes = primesAReclamer(), pts = G.ptsTalents(st);
    if (pageActive === 'journal' && tiroir.pos !== 'ferme' && nonLues()) marquerLu(); // une nouvelle arrivée pendant qu'on lit le Journal est lue aussitôt
    const nouveaux = nonLues(), nom = G.nomBoutique(st), ev = st.ev ? st.ev.type : '';
    // le marché du samedi et la bonne critique : pas de deuxième ligne sous le solde (elle repoussait la boutique à 360×640) ;
    // la ligne du rythme et les badges s'y relaient toutes les 4 s, à hauteur constante
    const br = st.boosts && st.boosts.actif && st.boosts.actif.fin > st.now ? st.boosts.actif.mult : 0; // un boost de la réserve (l'événement du quartier)
    const extras = [marche && 'Marché ×1,5', boost && `Bonne critique ×${boost}`, br && `Boost ×${br}`].filter(Boolean), tour = extras.length ? Math.floor(performance.now() / 4000) % (extras.length + 1) : 0;
    const key = `${G.fmtEur(st.coins)}|${G.fmtEur(taux)}|${st.etoiles}|${gain}|${marche}|${boost}|${br}|${bonus}|${primes}|${pts}|${nouveaux}|${nom}|${ev}|${tour}`;
    if (key === lastHud) return; lastHud = key;
    $('#coins').textContent = G.fmtEur(st.coins);
    $('#taux').innerHTML = `<span${tour ? ' style="display:none"' : ''}>${taux > 0 ? `<b>+${G.fmtEur(taux)}</b> par seconde` : 'Touche la baguette !'}</span>` + extras.map((t, k) => `<span class="marche" style="margin:0;padding:1px 7px;vertical-align:top${tour === k + 1 ? '' : ';display:none'}">${t}</span>`).join('');
    $('#etoiles-n').textContent = gain > 0 ? `${st.etoiles} · +${gain}` : st.etoiles;
    $('#b-etoiles').classList.toggle('pret', gain >= 3);
    $('#b-ameliorations').classList.toggle('pret', bonus > 0); badge($('#b-ameliorations'), bonus);
    $('#enseigne span').textContent = nom;
    $('#b-cloche').classList.toggle('actif', !!ev); $('#b-cloche .point').hidden = !ev && !nouveaux; // la cloche : l'événement en cours, sinon les nouvelles pas lues
    $('#b-cloche').setAttribute('aria-label', ev ? 'Événement en cours' : nouveaux ? `${nouveaux} nouvelle${nouveaux > 1 ? 's' : ''} dans le Journal` : 'Le Journal');
    badge($('#onglets [data-page="defis"]'), primes);
    badge($('#onglets [data-page="boulanger"]'), pts, 'lavande');
    badge($('#onglets [data-page="journal"]'), nouveaux, 'beurre');
  }
  // les messages arrivés ensemble (un grade et son trophée, une maîtrise et le niveau) passent l'un après l'autre au lieu de s'écraser
  const toastFile = [];
  function montrerToast(txt) {
    let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = txt; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastTimer = 0; if (toastFile.length) montrerToast(toastFile.shift()); else el.remove(); }, toastFile.length ? 1700 : 2400);
  }
  function toast(txt) {
    const el = $('.toast');
    if (toastTimer && el) { if (el.textContent !== txt && !toastFile.includes(txt)) { toastFile.push(txt); if (toastFile.length > 2) toastFile.shift(); } return; }
    montrerToast(txt);
  }
  function flottant(x, y, txt) { const el = document.createElement('div'); el.className = 'flottant'; el.textContent = txt; el.style.left = x + 'px'; el.style.top = y + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 900); }

  // ─── le tiroir : les pages glissent sur la boutique ; on le tire par sa poignée, il s'arrête à trois crans (ouvert, mi, fermé) ───
  const tiroir = (() => {
    const POIGNEE = 36, OUVERT = 48, ORDRE = ['ouvert', 'mi', 'ferme'];
    const Y = { ouvert: OUVERT, mi: 300, ferme: 500 }; let pos = 'mi', y = 300, drag = null, el, poignee;
    const plusProche = (v) => ORDRE.reduce((a, b) => (Math.abs(Y[b] - v) < Math.abs(Y[a] - v) ? b : a));
    const suivant = (sens) => ORDRE[Math.max(0, Math.min(2, ORDRE.indexOf(pos) + sens))];
    function poser(p, anime) {
      pos = p; y = Y[p];
      el.classList.toggle('glisse', !anime); el.style.transform = '';
      document.documentElement.style.setProperty('--tiroir-y', y + 'px');
      el.dataset.pos = p; document.body.dataset.tiroir = p; poignee.setAttribute('aria-expanded', p !== 'ferme');
      if (SCENE.visible) SCENE.visible(y);
      if (st && st.tiroir !== p) st.tiroir = p;
      if (!anime) requestAnimationFrame(() => el.classList.remove('glisse'));
    }
    const aller = (p, anime) => { if (Y[p] != null && el) poser(p, anime == null ? !reduceMotion : anime); };
    function layout(corpsH, miH) { Y.ferme = corpsH - POIGNEE; Y.mi = Math.max(OUVERT + 60, Math.min(miH, Y.ferme - 120)); poser(pos, false); }
    function init() {
      el = $('#tiroir'); poignee = $('#poignee');
      poignee.addEventListener('pointerdown', (e) => {
        if (drag) return; e.preventDefault(); try { poignee.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
        drag = { id: e.pointerId, y0: e.clientY, depart: y, pts: [[performance.now(), e.clientY]], bouge: false };
        el.classList.add('glisse');
      });
      poignee.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.y0; if (Math.abs(dy) > 6) drag.bouge = true;
        let v = drag.depart + dy; // élastique au-delà des bornes
        if (v < Y.ouvert) v = Y.ouvert - (Y.ouvert - v) * 0.25;
        if (v > Y.ferme) v = Y.ferme + (v - Y.ferme) * 0.25;
        y = v; el.style.transform = `translateY(${v}px)`; if (SCENE.visible) SCENE.visible(v);
        drag.pts.push([performance.now(), e.clientY]); if (drag.pts.length > 6) drag.pts.shift();
      });
      const fin = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        if (!d.bouge) { aller(pos === 'ouvert' ? 'ferme' : suivant(-1)); return; } // une simple touche : fermé → mi → ouvert → fermé
        const [t0, p0] = d.pts[0], [t1, p1] = d.pts[d.pts.length - 1], vit = t1 > t0 ? (p1 - p0) / (t1 - t0) : 0; // px/ms
        let cible = plusProche(y + vit * 160); // on projette le geste 160 ms plus loin
        if (Math.abs(vit) > 0.8 && cible === pos) cible = suivant(Math.sign(vit)); // une pichenette avance toujours d'un cran
        aller(cible);
      };
      poignee.addEventListener('pointerup', fin); poignee.addEventListener('pointercancel', fin);
      poignee.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aller(pos === 'ouvert' ? 'ferme' : suivant(-1)); } });
    }
    return { init, aller, layout, get pos() { return pos; }, get y() { return y; }, get Y() { return Y; } };
  })();
  // ─── pages : une seule visible ; un onglet ouvre le tiroir au moins à mi-hauteur ───
  function showPage(id) {
    if (!PAGES.includes(id)) return;
    pageActive = id;
    document.querySelectorAll('#pages .page').forEach((p) => { p.hidden = p.dataset.page !== id; });
    document.querySelectorAll('#onglets button').forEach((b) => { const on = b.dataset.page === id; b.classList.toggle('actif', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#pages').scrollTop = 0;
    if (id === 'boulanger') vuBoulanger = true;
    if (id === 'journal') { vuAvantJournal = (st.vu && st.vu.journal) || 0; marquerLu(); }
    lastPage = ''; renderPage(true);
    if (tiroir.y > tiroir.Y.mi) tiroir.aller('mi');
    hud();
  }
  // le mode Aménager : les meubles entourés, nommés, avec leurs crans et le prix du cran suivant
  // (le bouton « rouleau » de l'écran est parti : on repeint depuis Réglages, et « Terminé », en haut à droite, referme le mode)
  function amenager(on) { const v = on == null ? !SCENE.amenager : !!on; SCENE.setAmenager(v); document.body.classList.toggle('amenage', v); $('#b-fini').hidden = !v; }
  function repeindre() { closeSheet(); if (pageActive !== 'boutique') showPage('boutique'); tiroir.aller('ferme'); amenager(true); toast('Touche un meuble pour l’améliorer.'); }
  const PAGE_HEAD = (id, titre, droite) => `<div class="page-tete"><h2><span class="pic">${ICONS.UI[id]}</span>${titre}</h2>${droite || ''}</div>`;
  function renderPage(force) {
    if (pageActive === 'boutique') return;
    const sec = $(`#page-${pageActive}`);
    const p = { defis: pageDefis, boulanger: pageBoulanger, journal: pageJournal, reglages: pageReglages }[pageActive];
    const key = p.key();
    if (force || key !== lastPage) { lastPage = key; sec.innerHTML = p.html(); p.bind(sec); }
    if (p.maj) p.maj(sec);
  }
  const onIn = (sec, sel, fn) => sec.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { audio(); fn(b); }));
  const pct = (a, b) => Math.min(100, a / b * 100).toFixed(0) + '%';

  // Défis : objectifs du jour (primes à récupérer), pain du jour, défi de la semaine, les sept événements
  const EV_LISTE = [
    ['rush', () => ICONS.FEU, 'Coup de feu', `toutes les ventes ×${G.RUSH.mult} pendant ${G.RUSH.duree} s`],
    ['commande', () => ICONS.PRODUITS.baguette, 'Commande spéciale', `des fournées à livrer en ${G.COMMANDE.duree / 60} min, payées ${G.COMMANDE.prime} fois`],
    ['critique', () => ICONS.CRITIQUE, 'Le critique', `trois recettes en ${G.CRITIQUE.duree / 60} min, puis tout ×${G.CRITIQUE.mult} pendant ${G.CRITIQUE.boost / 60} min`],
    ['meunier', () => ICONS.SAC, 'Le meunier', `niveaux et recettes à −${Math.round(G.MEUNIER.remise * 100)} % pendant ${G.MEUNIER.duree} s`],
    ['petrissage', () => ICONS.PATE, 'Concours de pétrissage', `${G.PETRISSAGE.n} touches en ${G.PETRISSAGE.duree} s`],
    ['panne', () => ICONS.PANNE, 'Panne de four', `${G.PANNE.n} touches pour réparer, prime à la clé`],
    ['anniversaire', () => ICONS.BALLON, 'Goûter d’anniversaire', `un produit ×${G.ANNIVERSAIRE.mult} pendant ${G.ANNIVERSAIRE.duree / 60} min`],
  ];
  // l'Atelier : trois mini-jeux à lancer quand on veut (jamais en surprise) ; chacun son record, trois parties payées par jour (heure de Paris)
  function cleAtelier() { const a = G.atelierDuJour(st); return `${a.jour}|${JSON.stringify(a.payees)}|${JSON.stringify(a.records)}|${G.fmt(G.primePleineAtelier(st))}`; }
  function carteAtelier() {
    const a = G.atelierDuJour(st), prime = G.primePleineAtelier(st), restantes = G.JEUX_ATELIER.reduce((n, j) => n + G.restantesAtelier(st, j.id), 0);
    return `<div class="card atelier-carte" data-atelier><div class="c-tete"><span class="pic peche">${ICONS.ATELIER.atelier}</span><h3>L’Atelier</h3><span class="compte ${restantes ? '' : 'or'}">${restantes ? `${restantes} partie${restantes > 1 ? 's' : ''} payée${restantes > 1 ? 's' : ''}` : 'pour le record'}</span></div>
      ${G.JEUX_ATELIER.map((j) => { const reste = G.restantesAtelier(st, j.id), rec = a.records[j.id]; return `<div class="ligne ${reste ? '' : 'plafond'}"><div class="t"><span class="ev-ico">${ICONS.ATELIER[j.id]}</span><span><b>${esc(j.nom)}</b><small>Record : ${rec ? G.fmt(rec) : '—'} · ${reste ? `gains du jour ${a.payees[j.id]}/${G.ATELIER.parJour}` : 'plafond du jour atteint'}</small></span></div><button type="button" class="btn ${reste ? 'beurre' : 'clair'}" data-jeu="${j.id}"><small>${reste ? `jusqu’à ${G.fmtEur(prime)}` : 'pour le record'}</small><b>Jouer</b></button></div>`; }).join('')}
      <p class="note">Des mini-jeux à lancer quand tu veux. ${G.ATELIER.parJour} parties payées par jeu et par jour ; au-delà, on joue pour le record.</p></div>`;
  }
  const pageDefis = {
    key: () => { const j = G.objectifsDuJour(st, st.now), sm = st.semaine; return JSON.stringify([j.objectifs.map((o) => [o.fait, o.reclame]), j.pain, j.etoileDonnee, sm && [sm.fait, sm.reclame, sm.txt], st.ev && st.ev.type, G.serieEnCours(st), cleAtelier()]); },
    html: () => {
      const j = G.objectifsDuJour(st, st.now), sm = st.semaine, serie = G.serieEnCours(st), faits = j.objectifs.filter((o) => o.fait).length, aReclamer = j.objectifs.some((o) => o.fait && !o.reclame), pain = G.PRODUITS[j.pain];
      return `${PAGE_HEAD('defis', 'Défis', serie > 0 ? `<span class="serie">${ICONS.UI.soleil}${serie} jour${serie > 1 ? 's' : ''}</span>` : '')}
      <div class="bloc">
        <div class="card ${aReclamer ? 'pret' : ''}"><div class="c-tete"><span class="pic peche">${ICONS.UI.defis}</span><h3>Objectifs du jour</h3><span class="compte ${aReclamer ? 'ok' : j.etoileDonnee ? 'or' : ''}">${aReclamer ? 'Prime !' : j.etoileDonnee ? 'Terminés ★' : `${faits}/3`}</span></div>
          ${j.objectifs.map((o, k) => `<div class="ligne ${o.fait ? 'fait' : ''}"><div class="t"><span>${esc(o.txt)}</span><span class="p" data-p="${k}"></span></div>
            ${o.reclame ? okChip('Récupéré') : `<button type="button" class="btn ${o.fait ? 'menthe' : 'non'}" data-k="${k}"><small>${o.fait ? 'Récupérer' : 'Prime'}</small><b>${G.fmtEur(o.prime)}</b></button>`}
            <div class="mini"><i data-b="${k}"></i></div></div>`).join('')}
          <p class="note">${j.etoileDonnee ? 'Bravo : une étoile de plus pour toujours. De nouveaux défis demain !' : 'Les trois réussis : <b>+1 étoile</b>, pour toujours.'}</p></div>
        <div class="card pain"><span class="icone">${ICONS.PRODUITS[pain.id]}</span><div><b>Pain du jour : ${esc(pain.nom)} ×${G.PAIN_DU_JOUR_MULT.toString().replace('.', ',')}</b><span>Toute la journée, chaque fournée de ${esc(pain.pl)} rapporte moitié plus. Demain, un autre produit.</span></div></div>
        ${sm ? `<div class="card ${sm.fait && !sm.reclame ? 'pret' : ''}"><div class="c-tete"><span class="pic or">${ICONS.UI.etoile}</span><h3>Défi de la semaine</h3><span class="compte ${sm.reclame ? 'or' : sm.fait ? 'ok' : ''}">${sm.reclame ? 'Réussi ★' : sm.fait ? 'Prime !' : 'jusqu’à dimanche'}</span></div>
          <div class="ligne ${sm.fait ? 'fait' : ''}"><div class="t"><span>${esc(sm.txt)}</span><span class="p" data-p="s"></span></div>
            ${sm.reclame ? okChip('Récupéré') : `<button type="button" class="btn ${sm.fait ? 'beurre' : 'non'}" data-a="semaine"><small>${sm.fait ? 'Récupérer' : 'Récompense'}</small><b>+1 ★</b></button>`}
            <div class="mini beurre"><i data-b="s"></i></div></div></div>` : ''}
        ${carteAtelier()}
        <div class="card ev-liste"><div class="c-tete"><span class="pic rose">${ICONS.UI.soleil}</span><h3>Événements surprise</h3><span class="compte" data-p="ev"></span></div>
          ${EV_LISTE.map(([type, ico, nom, desc]) => `<div class="ligne ${st.ev && st.ev.type === type ? 'en-cours' : ''}"><div class="t"><span class="ev-ico">${ico()}</span><span><b>${nom}</b><small>${desc}</small></span></div>${st.ev && st.ev.type === type ? '<span class="chrono-pill" data-p="chrono"></span>' : ''}</div>`).join('')}
          <p class="note">Ils arrivent tout seuls pendant que tu joues, toutes les quelques minutes : la cloche en haut sonne et une bannière s’ouvre sur la boutique.</p></div>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-k]', (b) => { const r = G.reclamer(st, +b.dataset.k); if (!r.ok) { son.non(); return; } son.deblocage(); buzz([10, 30, 10]); toast(r.etoile ? `+${G.fmtEur(r.prime)} et +1 ★ : objectifs du jour réussis !${r.points ? ` +${r.points} points de boulanger` : ''}` : `+${G.fmtEur(r.prime)} de prime`); if (r.etoile) SCENE.fete(); renderCards(true); hud(); save(); renderPage(true); });
      onIn(sec, '[data-a="semaine"]', () => { const r = G.reclamerSemaine(st); if (!r.ok) { son.non(); return; } reussite(`Défi de la semaine : +${G.fmtEur(r.prime)} et +1 ★ ! +${G.POINTS.defi} points de boulanger`); renderPage(true); });
      onIn(sec, '[data-jeu]', (b) => { son.tap(); MINIJEUX.ouvrir(b.dataset.jeu); });
    },
    maj: (sec) => {
      const j = G.objectifsDuJour(st, st.now), sm = st.semaine;
      j.objectifs.forEach((o, k) => { const p = sec.querySelector(`[data-p="${k}"]`), b = sec.querySelector(`[data-b="${k}"]`); if (p) p.textContent = o.fait ? 'fait' : `${G.fmt(Math.floor(o.progres))} / ${G.fmt(o.cible)}`; if (b) b.style.width = pct(o.progres, o.cible); });
      if (sm) { const p = sec.querySelector('[data-p="s"]'), b = sec.querySelector('[data-b="s"]'); if (p) p.textContent = sm.fait ? 'fait' : `${G.fmt(sm.progres)} / ${G.fmt(sm.cible)}`; if (b) b.style.width = pct(sm.progres, sm.cible); }
      const e = sec.querySelector('[data-p="ev"]'); if (e) e.textContent = st.ev ? 'en cours' : `prochain dans ~${Math.max(1, Math.ceil(st.evTimer / 60))} min`;
      const c = sec.querySelector('[data-p="chrono"]'); if (c && st.ev) c.textContent = G.fmtChrono(Math.max(0, (st.ev.fin - st.now) / 1000));
    },
  };
  // Boulanger : niveau, savoir-faire, talents permanents, la garde-robe (src/garderobe.js)
  const GRU = typeof GARDEROBE_UI !== 'undefined' ? GARDEROBE_UI : null;
  const ctxGarderobe = () => ({ st, openSheet, closeSheet, on, feuille, save, toast, son, buzz, apres: () => { renderCards(true); hud(); lastPage = ''; renderPage(true); },
    compagnon: { id: modeleVu, nom: () => (st.chat ? st.chat.nom : ''), force: () => chatNoirForce() && G.estChat(G.compagnonActif(st)), ouvrir: (retour) => sheetCompagnons(retour) } }); // apres : la boutique (le boulanger en 3D suit sa tenue à la frame suivante) et la page se redessinent
  // les statistiques et records du boulanger (onglet Boulanger) : valeurs relues à chaque image, la page n'est pas redessinée pour une vente
  function valeursStats() {
    const S = st.stats, at = G.atelierDuJour(st).records, v = {
      ventes: G.fmt(S.ventes), clients: G.fmt(S.clients), gagne: G.fmtEur(st.lifetime), boutiques: `n°${st.boutiques}`,
      commande: S.meilleureCommande ? G.fmtEur(S.meilleureCommande) : '—', pourboire: S.meilleurPourboire ? G.fmtEur(S.meilleurPourboire) : '—',
      petrissage: S.petrissageRecord ? S.petrissageRecord.toFixed(1).replace('.', ',') + ' s' : '—', semaine: pts(G.pointsSemaine(st)),
      serie: `${S.serieMax || 0} jour${(S.serieMax || 0) > 1 ? 's' : ''}`, evenements: `${S.commandes || 0} · ${S.critiques || 0} · ${S.petrissages || 0} · ${S.pannes || 0}`,
    };
    G.JEUX_ATELIER.forEach((j) => { v['at-' + j.id] = at[j.id] ? G.fmt(at[j.id]) + ' pts' : '—'; });
    if (st.chat) v.caresses = G.fmt(st.chat.caresses);
    return v;
  }
  const crans = (k, max) => `<span class="crans" role="img" aria-label="${k} sur ${max}">${Array.from({ length: max }, (_, n) => `<i class="${n < k ? 'on' : ''}"></i>`).join('')}</span>`;
  const okChip = (txt) => `<span class="ok"><i class="ico">${ICONS.UI.coche}</i>${txt}</span>`;
  const pageBoulanger = {
    key: () => `${st.xp}|${G.ptsTalents(st)}|${JSON.stringify(st.talents)}|${tenueVue().cle}|${G.garderobeCle(st)}|${trophesGagnes()}|${cleRecompenses()}|${!!st.chat}`,
    html: () => {
      const np = G.niveauPour(st.xp), pts_ = G.ptsTalents(st), rang = G.rangTitre(st), suivant = G.TITRES.find((t) => t[0] > np.n), tr = st.trophees || {}, gagnes = trophesGagnes(), v = valeursStats();
      const stat = (k, t) => `<div class="stat"><span>${t}</span><b data-s="${k}">${v[k]}</b></div>`;
      const troph = (t) => `<div class="troph ${tr[t.id] ? 'gagne' : ''}">${tr[t.id] ? `<i class="ico">${ICONS.UI.trophee}</i>` : ''}<b>${esc(t.nom)}</b><span>${esc(t.desc)}</span></div>`;
      const aGagner = G.TROPHEES.filter((t) => !tr[t.id]);
      return `${PAGE_HEAD('boulanger', 'Boulanger', pts_ ? `<span class="serie lav">${pts_} point${pts_ > 1 ? 's' : ''}</span>` : '')}
      <div class="bloc">
        <div class="card boulanger-tete"><span class="portrait">${ICONS.boulanger(rang, tenueVue())}</span><div><h3>${esc(G.titre(st))}</h3><p class="sous">Niveau <b>${np.n}</b> · ${G.fmt(np.reste)} / ${G.fmt(np.prochain)} savoir-faire</p><div class="mini xp"><i style="width:${pct(np.reste, np.prochain)}"></i></div>${suivant ? `<p class="note">${esc(suivant[1])} au niveau ${suivant[0]}</p>` : ''}</div></div>
        <div class="encadre doux">Le savoir-faire vient des défis du jour, des événements réussis, des recettes, des embauches et des nouvelles boutiques. Chaque niveau donne <b>un point de talent</b>. Les talents sont à toi pour toujours, même en changeant de boutique.</div>
        <h3 class="titre-section"><span>Talents</span>${pts_ ? `<span class="pts">${pts_} point${pts_ > 1 ? 's' : ''} à dépenser</span>` : ''}</h3>
        <div class="liste-am">${G.TALENTS.map((t) => { const k = G.talent(st, t.id), max = k >= t.max; return `<div class="am talent ${k ? 'appris' : ''}"><div><h3>${esc(t.nom)} ${crans(k, t.max)}</h3><p>${k ? esc(t.desc(k)) : 'Cran 1 : ' + esc(t.desc(1))}${k && !max ? `<br><em>Cran suivant : ${esc(t.desc(k + 1))}</em>` : ''}</p></div>${max ? okChip('Maîtrisé') : `<button type="button" class="btn ${pts_ ? 'lavande' : 'non'}" data-t="${t.id}"><small>Apprendre</small><b>1 point</b></button>`}</div>`; }).join('')}</div>
        <h3 class="titre-section"><span>Tenue et récompenses</span></h3>
        ${GRU ? GRU.carte(st) : ''}
        ${carteRecompenses()}
        <div class="card"><div class="c-tete"><span class="pic or">${ICONS.UI.trophee}</span><h3>Trophées</h3><span class="compte ${gagnes ? 'or' : ''}">${gagnes}/${G.TROPHEES.length}</span></div>
          ${gagnes ? `<div class="trophees">${G.TROPHEES.filter((t) => tr[t.id]).map(troph).join('')}</div>` : `<div class="vide"><b>Pas encore de trophée</b><span>Cuis, vends, embauche : les premiers tombent vite.</span></div>`}
          ${aGagner.length ? `<details class="repli"><summary><span>${aGagner.length === 1 ? 'Le dernier à gagner' : `Les ${aGagner.length} à gagner`}</span><i class="ico chev">${ICONS.UI.chevron}</i></summary><div class="trophees">${aGagner.map(troph).join('')}</div></details>` : ''}</div>
        <div class="card stats"><div class="c-tete"><span class="pic menthe">${ICONS.UI.stats}</span><h3>Statistiques</h3></div>
          ${stat('ventes', 'Fournées vendues')}${stat('clients', 'Clients servis')}${stat('gagne', 'Gagné depuis le début')}${stat('boutiques', 'Boutique')}${st.chat ? stat('caresses', `Caresses à ${esc(st.chat.nom)}`) : ''}
          <h4 class="sous-titre">Records</h4>
          ${stat('commande', 'Plus grosse commande livrée')}${stat('pourboire', 'Meilleur pourboire')}${stat('petrissage', 'Pétrissage le plus rapide')}
          ${G.JEUX_ATELIER.map((j) => stat('at-' + j.id, `Atelier : ${esc(j.court.toLowerCase())}`)).join('')}
          ${stat('semaine', 'Points de boulanger cette semaine')}${stat('serie', 'Meilleure série d’objectifs')}${stat('evenements', 'Commandes · critiques · pétrissages · fours')}</div>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-t]', (b) => {
        const r = G.apprendre(st, b.dataset.t);
        if (!r.ok) { son.non(); toast(G.ptsTalents(st) ? 'Ce talent est déjà au maximum.' : 'Pas encore de point : gagne du savoir-faire.'); return; }
        son.deblocage(); buzz([10, 30, 10]); toast(`${r.talent.nom} : ${r.talent.desc(r.cran)}`); renderCards(true); hud(); save(); renderPage(true);
      });
      onIn(sec, '[data-a="cl-recompenses"]', () => { son.tap(); sheetRecompenses(); });
      if (GRU) GRU.bind(sec, ctxGarderobe());
    },
    maj: (sec) => { const v = valeursStats(); sec.querySelectorAll('[data-s]').forEach((el) => { const t = v[el.dataset.s]; if (t != null && el.textContent !== t) el.textContent = t; }); },
  };
  const QUAND_SAISON = { galette: 'en janvier', crepe: 'début février', paques: 'en avril', glace: 'cet été', citrouille: 'à la mi-octobre', buche: 'en décembre' };
  // Journal : le fil des nouvelles (les dernières en tête, les pas encore lues marquées), puis la vie du quartier : recettes de saison, habitués
  const ilYA = (ms) => { const s = Math.max(0, (HORLOGE.maintenant() - ms) / 1000); return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : s < 86400 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };
  // l'arrière-salle (src/arriere.js) : une fois la petite porte du fond trouvée, une carte discrète, tout en bas du Journal, y ramène
  const AR = typeof ARRIERE !== 'undefined' ? ARRIERE : null;
  const arriereTrouvee = () => !!(AR && st.arriere && st.arriere.trouvee);
  const cleArriere = () => (arriereTrouvee() ? (st.arriere.main && !st.arriere.main.fin ? 'ar-main' : 'ar') : '');
  const carteArriere = () => (arriereTrouvee() ? `<button type="button" class="card arriere-carte" data-arriere="1"><span class="pic">${ICONS.UI.arriere}</span><span class="t"><b>L’arrière-salle</b><small>${st.arriere.main && !st.arriere.main.fin ? 'Une main t’attend sur le tapis vert.' : 'La petite porte du fond est restée entrouverte.'}</small></span><i class="ico chev">${ICONS.UI.chevron}</i></button>` : '');
  // la porte : cinq touches de suite en moins de 3 s l'ouvrent (toute autre touche dans la boutique remet le compte à zéro)
  let toquees = [];
  function toquer(x, y) {
    const t = performance.now(); toquees = toquees.filter((k) => t - k <= 3000); toquees.push(t);
    son.tap(); buzz(5); const r = $('#scene').getBoundingClientRect(); flottant(r.left + x - 12, r.top + y - 26, toquees.length >= 5 ? 'toc toc !' : 'toc');
    if (toquees.length < 5 || !AR) return;
    toquees = []; const premiere = !arriereTrouvee();
    if (premiere) { st.arriere = st.arriere || {}; st.arriere.trouvee = true; }
    setTimeout(() => { AR.ouvrir(); if (premiere) { lastPage = ''; renderPage(true); } }, 260);
  }
  let vuAvantJournal = 0; // le dernier passage avant celui-ci : ce qui est arrivé depuis est « nouveau »
  const pageJournal = {
    key: () => `${cleArriere()}|${(st.carnetEv || []).length}|${(st.carnetEv || []).length ? st.carnetEv[st.carnetEv.length - 1].t : 0}|${JSON.stringify(st.habitues)}|${JSON.stringify(st.collection)}|${st.saison ? st.saison.id + st.saison.niv : ''}|${Math.floor(HORLOGE.maintenant() / 60e3)}`,
    html: () => {
      const fil = (st.carnetEv || []).slice().reverse(), neuves = fil.filter((e) => e.t > vuAvantJournal).length;
      return `${PAGE_HEAD('journal', 'Journal', neuves ? `<span class="serie fraise">${neuves} nouvelle${neuves > 1 ? 's' : ''}</span>` : '')}
      <div class="bloc">
        <div class="card fil"><div class="c-tete"><span class="pic lav">${ICONS.UI.cloche}</span><h3>Les nouvelles</h3></div>
          ${fil.length ? `<ol class="carnet">${fil.map((e) => `<li class="${e.t > vuAvantJournal ? 'neuf' : ''}"><i class="puce" aria-hidden="true"></i><span>${esc(e.txt)}</span><small>${ilYA(e.t)}</small></li>`).join('')}</ol>`
            : `<div class="vide"><span class="pic">${ICONS.UI.journal}</span><b>Rien encore</b><span>Les trophées, les grades, les commandes livrées et les cadeaux des habitués s’écrivent ici.</span></div>`}</div>
        <h3 class="titre-section"><span>La vie du quartier</span></h3>
        <div class="card"><div class="c-tete"><span class="pic peche">${ICONS.UI.saison}</span><h3>Recettes de saison</h3></div>
          ${G.RECETTES_SAISON.map((r) => { const c = (st.collection || {})[r.id], enCours = st.saison && st.saison.id === r.id; return `<div class="ligne saison"><span class="ev-ico">${ICONS.SAISON[r.id]}</span><div class="t"><span><b>${esc(r.nom)}</b><small>${c && c.maitrisee ? `maîtrisée (${c.annee})` : c ? `${c.fournees}/${G.SAISON.maitrise} fournées${enCours ? ', en ce moment' : ''}` : enCours ? 'en ce moment : prépare-la !' : `revient ${QUAND_SAISON[r.id]}`}</small></span></div>${c && c.maitrisee ? `<i class="ico mai">${ICONS.UI.coche}</i>` : ''}${c && !c.maitrisee ? `<div class="mini beurre"><i style="width:${pct(c.fournees, G.SAISON.maitrise)}"></i></div>` : ''}</div>`; }).join('')}
          <p class="note">Chaque saison sa recette, cuite à la main : cent fournées pour la maîtriser.</p></div>
        <div class="card"><div class="c-tete"><span class="pic peche">${ICONS.UI.habitues}</span><h3>Les habitués</h3></div>
          ${G.HABITUES.map((h) => { const e = (st.habitues || {})[h.id]; return `<div class="ligne habitue"><span class="pastille-hab" style="background:${h.haut}"></span><div class="t"><span><b>${esc(h.nom)}</b><small>Passe entre ${h.debut}h et ${Math.floor(h.fin)}h${h.fin % 1 ? '30' : ''} · ${e && e.jours ? `fidèle depuis ${e.jours} jour${e.jours > 1 ? 's' : ''}` : 'première visite à venir'}</small></span></div></div>`; }).join('')}
          <p class="note">Sers un habitué cinq jours de suite : il t’offre un cadeau.</p></div>
        ${carteArriere()}
      </div>`;
    },
    bind: (sec) => { onIn(sec, '[data-arriere]', () => { son.tap(); if (AR) AR.ouvrir(); }); },
  };
  // Réglages : rangés par groupe ; ce qui sert peu vit ici (repeindre, masquer l'événement, quitter le classement, sauvegarde, partage)
  const pageReglages = {
    key: () => `${st.son}|${st.vibre}|${st.specialite}|${st.nomBoutique}|${st.boutiques}|${st.chat ? st.chat.nom : ''}|${modeleVu()}|${st.quartier ? st.quartier.masque : ''}|${QT ? QT.fenetre(st.now).classement : ''}|${HTE ? `${HTE.visible()}${st[HTE.cle] ? st[HTE.cle].masque : ''}${chatNoir()}${chatNoirDispo()}` : ''}|${classement ? classement.resume().rejoint + classement.resume().pseudo : ''}|${cleNotifs()}`,
    html: () => {
      const q = G.QUARTIERS[G.quartier(st)], cr = classement ? classement.resume() : null;
      const ligne = (a, ico, titre, sous, droite) => `<button type="button" class="reglage" data-a="${a}"><i class="ico">${ico}</i><span><b>${titre}</b>${sous ? `<small>${sous}</small>` : ''}</span>${droite}</button>`;
      const sw = (on) => `<span class="interrupteur" role="switch" aria-checked="${on}"></span>`, chev = `<i class="ico chev">${ICONS.UI.chevron}</i>`;
      const groupe = (titre, lignes) => `<h3 class="titre-section"><span>${titre}</span></h3><div class="card reglages">${lignes}</div>`;
      return `${PAGE_HEAD('reglages', 'Réglages')}
      <div class="bloc">
        ${groupe('Le jeu', ligne('son', st.son ? ICONS.UI.son : ICONS.UI.sonOff, 'Sons', 'Petites notes à chaque vente et achat', sw(st.son)) + ligne('vibre', ICONS.UI.vibre, 'Vibrations', 'Un léger retour sous le doigt', sw(st.vibre)))}
        ${groupe('La boutique', ligne('nom', ICONS.UI.crayon, 'Renommer la boutique', `${esc(G.nomBoutique(st))} · ${esc(q.nom)}`, chev)
          + ligne('repeindre', ICONS.UI.amenager, 'Repeindre la boutique', 'Les meubles entourés, leurs crans et leurs prix : touche-les pour les améliorer', chev)
          + (st.specialite == null ? ligne('specialite', ICONS.UI.specialite, 'Choisir la spécialité', 'Un produit fétiche ×2 pour cette boutique', chev) : ligne('specialite-ok', ICONS.UI.specialite, 'Spécialité', `${esc(G.PRODUITS[st.specialite].nom)} ×2, pour cette boutique`, ''))
          + ligne('compagnons', ICONS.UI.patte, 'Le compagnon', st.chat ? `${esc(st.chat.nom)}, ${esc(G.compagnon(modeleVu()).nom.toLowerCase())} · treize animaux au choix, du chat au mini-dragon` : 'Choisis l’animal de la boutique : du chat roux au mini-dragon', chev)
          + (st.chat ? ligne('chat', ICONS.UI.chat, `Renommer ${esc(st.chat.nom)}`, 'Le compagnon de la boutique', chev) : ''))}
        ${cr && cr.rejoint ? groupe('Classement', ligne('cl-quitter', ICONS.UI.quitter, 'Quitter le classement', `Ton pseudo « ${esc(cr.pseudo)} » et tes points disparaissent du classement`, chev)) : ''}
        ${blocNotifs(ligne, sw)}
        ${QT && QT.fenetre(st.now).ouvert ? groupe('Événement', ligne('quartier', ICONS.UI.quartier, 'Masquer l’événement', 'Le Quartier, une parodie réservée aux adultes : l’icône et la Planque disparaissent', sw(!!(st.quartier && st.quartier.masque))) + (typeof HDM !== 'undefined' && HDM.actif ? ligne('hd', ICONS.UI.quartier, 'Planque en HD', HDM.raison === 'écran noir' ? 'Coupée : l’écran restait noir sur ce téléphone. Touche pour réessayer' : 'Meubles, rue de nuit et équipe animée (à couper si l’écran reste noir)', sw(!HDM.coupe())) : '')) : ''}
        ${HTE && HTE.fenetre() && HTE.fenetre().ouvert ? groupe('Halloween', ligne('hantee', ICONS.UI.hantee, 'Masquer la Maison hantée', 'L’icône citrouille et le manoir disparaissent ; le reste du jeu ne change pas', sw(!!(st[HTE.cle] && st[HTE.cle].masque)))) : ''}
        ${groupe('Sauvegarde et partage', ligne('sauvegarde', ICONS.UI.sauvegarde, 'Sauvegarde et transfert', 'Copier un code, le charger sur un autre appareil', chev)
          + ligne('partager', ICONS.UI.partager, 'Partager ma boutique', 'Une image de la boutique et ton score', chev)
          + (window.FOURNIL_ACCUEIL ? ligne('accueil', ICONS.UI.salle, 'Salle de jeux', 'Revenir à l’écran d’accueil et aux autres jeux', chev) : ''))}
        ${groupe('Aide', ligne('journal-retours', ICONS.UI.journal, 'Journal des retours', 'Les 10 derniers retours dans le jeu et ce que tes apprentis ont vendu', chev))}
        <div class="card reglages danger">${ligne('reset', ICONS.UI.recommencer, 'Recommencer de zéro', 'Efface tout, étoiles comprises', chev)}</div>
        <p class="note centre">Le Fournil · boutique n°${st.boutiques} · ${esc(q.nom)}<br>Ta boutique est enregistrée toutes les 5 secondes et à chaque achat.</p>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-a="son"]', () => { st.son = !st.son; save(); renderPage(true); if (st.son) son.tap(); });
      onIn(sec, '[data-a="vibre"]', () => { st.vibre = !st.vibre; save(); renderPage(true); buzz(8); });
      onIn(sec, '[data-a="nom"]', () => sheetNom(false));
      onIn(sec, '[data-a="repeindre"]', () => { son.tap(); repeindre(); });
      onIn(sec, '[data-a="chat"]', () => sheetNomChat());
      onIn(sec, '[data-a="compagnons"]', () => { son.tap(); sheetCompagnons(); });
      onIn(sec, '[data-a="specialite"]', sheetSpecialite);
      onIn(sec, '[data-a="sauvegarde"]', sheetSauvegarde);
      onIn(sec, '[data-a="hd"]', () => { if (typeof HDM === 'undefined') return; if (HDM.coupe()) HDM.remettre(); else HDM.couper('joueur'); son.tap(); renderPage(true); });
      onIn(sec, '[data-a="quartier"]', () => { if (!EVT) return; EVT.masquer(!(st.quartier && st.quartier.masque)); son.tap(); majCoin(); renderPage(true); });
      onIn(sec, '[data-a="hantee"]', () => { if (!HTE) return; HTE.masquer(!(st[HTE.cle] && st[HTE.cle].masque)); son.tap(); majCoin(); majChat(); renderPage(true); });
      onIn(sec, '[data-a="partager"]', partager);
      onIn(sec, '[data-a="journal-retours"]', () => { son.tap(); sheetJournalRetours(); });
      onIn(sec, '[data-a="cl-quitter"]', () => { son.tap(); sheetQuitter(); });
      onIn(sec, '[data-a="notifs"]', () => basculerNotifs()); // la permission est demandée tout de suite, dans le geste (Safari l'exige)
      for (const [k] of CAS_NOTIFS) onIn(sec, `[data-a="notif-${k}"]`, () => { const p = classement.notifs().prefs; p[k] = !p[k]; basculerNotifs(p); });
      onIn(sec, '[data-a="notif-essai"]', essaiNotif);
      onIn(sec, '[data-a="cl-rejoindre-notifs"]', () => { son.tap(); sheetPseudo(false); });
      onIn(sec, '[data-a="accueil"]', () => { save(); location.href = window.FOURNIL_ACCUEIL + '?app=accueil'; }); // ?app=accueil : l'accueil ne renvoie pas vers le jeu
      onIn(sec, '[data-a="reset"]', () => {
        openSheet(`<h2>Tout effacer ?</h2><p class="sous">Euros, recettes, apprentis, bonus et étoiles : tout repart de la première baguette. Impossible de revenir en arrière.</p><button type="button" class="btn large" data-a="oui" style="background:var(--fraise);box-shadow:0 4px 0 var(--fraise-sombre)"><b>Oui, tout effacer</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Non, je garde ma boutique</b></button>`);
        on('[data-a="non"]', closeSheet); on('[data-a="oui"]', () => { fige = true; effacer().then(() => location.reload()); });
      });
    },
  };

  // ─── le ticket des objectifs : une ligne sous la barre d'achat, qui mène aux Défis ───
  function renderObjectifs() {
    const j = G.objectifsDuJour(st, st.now), sm = st.semaine, faits = j.objectifs.filter((o) => o.fait).length, aReclamer = primesAReclamer() > 0;
    const key = `${faits}|${aReclamer}|${j.etoileDonnee}|${j.pain}|${sm ? sm.reclame + ':' + sm.fait + ':' + G.fmt(sm.progres) + '/' + G.fmt(sm.cible) : ''}`;
    if (key === lastObj) return; lastObj = key;
    const el = $('#objectifs');
    el.className = 'ticket' + (aReclamer ? ' pret' : '') + (j.etoileDonnee ? ' complet' : '');
    el.innerHTML = `<i class="ico">${ICONS.UI.defis}</i><span class="tk-txt"><b>Objectifs du jour · ${j.etoileDonnee ? 'terminés ★' : `${faits}/3`}</b><small>Pain du jour : ${esc(G.PRODUITS[j.pain].pl)} ×1,5${sm ? ` · Semaine : ${sm.reclame ? 'réussi ★' : `${G.fmt(sm.progres)}/${G.fmt(sm.cible)}`}` : ''}</small></span>
      <span class="tk-pill">${aReclamer ? 'Prime !' : `<i class="ico">${ICONS.UI.chevron}</i>`}</span>`;
  }

  // ─── la réserve de boosts (les paliers de l'événement du quartier) : une pastille sous les objectifs, à lancer quand on veut ───
  let lastBoosts = '';
  function renderBoosts() {
    const el = $('#boosts'); if (!el) return;
    const b = st.boosts, actif = b && b.actif && b.actif.fin > st.now ? b.actif : null, reserve = b ? b.reserve : [];
    if (!actif && !reserve.length) { if (lastBoosts) { lastBoosts = ''; el.hidden = true; } return; }
    const reste = actif ? G.fmtChrono((actif.fin - st.now) / 1000) : '', key = `${actif ? actif.mult + reste : ''}|${reserve.map((x) => x.mult + ':' + x.secs).join(',')}`;
    if (key === lastBoosts) return; lastBoosts = key; el.hidden = false;
    el.className = 'ticket boosts' + (actif ? ' actif' : '');
    el.innerHTML = `<i class="ico">${ICONS.UI.eclair}</i><span class="tk-txt"><b>${actif ? `Boost ×${actif.mult} en cours` : `Boost ×${reserve[0].mult} · ${G.fmtDuree(reserve[0].secs)}`}</b><small>${actif ? `Toutes les ventes ×${actif.mult}${reserve.length ? ` · encore ${reserve.length} en réserve` : ''}` : reserve.length > 1 ? `${reserve.length} boosts en réserve, gagnés au Quartier` : 'Gagné au Quartier : lance-le quand tu veux'}</small></span><span class="tk-pill">${actif ? reste : 'Lancer'}</span>`;
  }
  function lancerBoost() {
    const b = st.boosts; if (!b || (b.actif && b.actif.fin > st.now)) { toast('Un boost tourne déjà : attends la fin.'); return; }
    if (!b.reserve.length) return;
    if (b.reserve.length === 1) { const r = G.lancerBoostReserve(st, 0); if (r.ok) reussite(`Boost ×${r.boost.mult} lancé : toutes les ventes ×${r.boost.mult} pendant ${G.fmtDuree((r.boost.fin - st.now) / 1000)} !`); return; }
    openSheet(`<h2>La réserve de boosts</h2><p class="sous">Gagnés aux paliers des événements, avec les pourboires des copains et l’objectif commun. Un seul à la fois ; il tourne sur l'horloge, même la boutique fermée.</p><div class="liste-am">${b.reserve.map((x, k) => `<div class="am"><div><h3>Boost ×${x.mult}</h3><p>Toutes les ventes ×${x.mult} pendant ${G.fmtDuree(x.secs)}</p></div><button type="button" class="btn beurre" data-k="${k}"><small>Lancer</small><b>×${x.mult}</b></button></div>`).join('')}</div>${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
    on('[data-k]', (el) => { const r = G.lancerBoostReserve(st, +el.dataset.k); closeSheet(); if (r.ok) reussite(`Boost ×${r.boost.mult} lancé : toutes les ventes ×${r.boost.mult} pendant ${G.fmtDuree((r.boost.fin - st.now) / 1000)} !`); else son.non(); });
  }

  // ─── événements : une bannière compacte posée sur la scène, qu'on déplie en la touchant ───
  const TXT_EV = { rush: 'Coup de feu : les clients affluent !', commande: 'Un client passe une commande spéciale !', critique: 'Le critique gastronomique entre dans la boutique !', meunier: 'Le meunier passe : tout à −40 % !', petrissage: 'Concours de pétrissage : touche vite !', panne: 'Un four tombe en panne !', anniversaire: 'Un goûter d’anniversaire dans la boutique !' };
  const FIN_EV = { rush: 'Le coup de feu est passé.', commande: 'Trop tard, le client reviendra une autre fois.', critique: 'Le critique est reparti sans conclure…', meunier: 'Le meunier est reparti.', petrissage: 'Trop tard, la pâte a trop levé.', panne: 'Le four s’est réparé tout seul.', anniversaire: 'Le goûter est terminé.' };
  const Maj = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  // la fête de la scène 3D : pendant une partie de l'Atelier, la scène est en pause sous l'écran de jeu ; la fête attend qu'on en sorte
  // (les toasts, eux, passent au-dessus de l'Atelier)
  let feteEnAttente = false;
  function feter() { if (MINIJEUX.ouvert || (AR && AR.ouvert)) feteEnAttente = true; else { SCENE.fete(); confettis(0.8); } }
  function reussite(txt) { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); confettis(1); toast(txt); renderCards(true); hud(); save(); }
  function renderEvenement() {
    const ev = st.ev, box = $('#evenement');
    if (!ev) { if (lastEv) { lastEv = ''; box.hidden = true; box.innerHTML = ''; SCENE.setRush(false); } return; }
    const reste = Math.max(0, (ev.fin - st.now) / 1000), pct = Math.min(100, reste / G.EVENEMENTS[ev.type].duree * 100);
    const p = ev.i != null ? G.PRODUITS[ev.i] : null, prete = ev.type === 'commande' && ev.fait >= ev.n, key = ev.type + ev.debut + (prete ? 'p' : '');
    if (lastEv !== key) {
      if (!lastEv || lastEv.slice(0, -1) !== key.slice(0, -1)) evEtendu = false;
      lastEv = key; box.hidden = false; SCENE.setRush(ev.type === 'rush');
      const chrono = '<b class="ev-chrono"></b>', barre = '<i class="ev-barre"></i>';
      const html = {
        rush: () => `<div class="ev rush"><span class="ev-ico">${ICONS.FEU}</span><div class="ev-txt"><b>Coup de feu !</b><span>Toutes les ventes ×${G.RUSH.mult}</span></div>${chrono}${barre}</div>`,
        commande: () => `<div class="ev commande ${prete ? 'prete' : ''}"><span class="ev-ico">${ICONS.PRODUITS[p.id]}</span><div class="ev-txt"><b>Commande spéciale</b><span>${G.fmt(ev.n)} ${esc(ev.n > 1 ? p.pl : p.nom.toLowerCase())} · prime <b>${G.fmtEur(ev.prime)}</b> · <span class="ev-prog"></span></span></div>${prete ? '<button type="button" class="btn menthe" data-a="livrer"><small>C’est prêt</small><b>Livrer !</b></button>' : chrono}${barre}</div>`,
        critique: () => `<div class="ev critique"><span class="ev-ico">${ICONS.CRITIQUE}</span><div class="ev-txt"><b>Le critique est là !</b><span>Tout ×${G.CRITIQUE.mult} pendant ${G.CRITIQUE.boost / 60} min s’il est conquis · <span class="ev-prog"></span></span></div>${chrono}${barre}</div>`,
        meunier: () => `<div class="ev meunier"><span class="ev-ico">${ICONS.SAC}</span><div class="ev-txt"><b>Le meunier passe</b><span>Niveaux et recettes à −${Math.round(G.MEUNIER.remise * 100)} % : c’est le moment d’acheter !</span></div>${chrono}${barre}</div>`,
        petrissage: () => `<div class="ev petrissage"><span class="ev-ico">${ICONS.PATE}</span><div class="ev-txt"><b>Concours de pétrissage</b><span>${ev.n} touches en ${G.PETRISSAGE.duree} s · prime <b>${G.fmtEur(ev.prime)}</b></span></div><button type="button" class="btn tapote" data-a="petrir"><small>Pétris !</small><b class="ev-compte">0/${ev.n}</b></button>${barre}</div>`,
        panne: () => `<div class="ev panne"><span class="ev-ico">${ICONS.PANNE}</span><div class="ev-txt"><b>Panne de four !</b><span>${esc(Maj(p.pl))} à l’arrêt · répare pour <b>${G.fmtEur(ev.prime)}</b></span></div><button type="button" class="btn tapote" data-a="reparer"><small>Répare !</small><b class="ev-compte">0/${ev.n}</b></button>${barre}</div>`,
        anniversaire: () => `<div class="ev anniversaire"><span class="ev-ico">${ICONS.BALLON}</span><div class="ev-txt"><b>Goûter d’anniversaire</b><span>${esc(Maj(p.pl))} ×${ev.mult}${st.stations[ev.i].staff ? '' : ' · touche pour cuire !'}</span></div>${chrono}${barre}</div>`,
      };
      box.innerHTML = html[ev.type]();
      box.classList.toggle('etendu', evEtendu);
      const livrer = box.querySelector('[data-a="livrer"]');
      if (livrer) livrer.addEventListener('click', (e) => { e.stopPropagation(); audio(); const r = G.livrer(st); if (r.ok) reussite(`Commande livrée : +${G.fmtEur(r.prime)}`); });
      const petrir = box.querySelector('[data-a="petrir"]');
      if (petrir) petrir.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio(); const r = G.petrir(st); if (!r.ok) return; son.tap(); buzz(8); if (r.fini) reussite(`Pétrissage gagné : +${G.fmtEur(r.prime)}`); else petrir.querySelector('.ev-compte').textContent = `${r.taps}/${ev.n}`; });
      const reparer = box.querySelector('[data-a="reparer"]');
      if (reparer) reparer.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio(); const r = G.reparer(st); if (!r.ok) return; son.tap(); buzz(8); if (r.fini) reussite(`Four réparé : +${G.fmtEur(r.prime)}`); else reparer.querySelector('.ev-compte').textContent = `${r.coups}/${ev.n}`; });
    }
    const prog = box.querySelector('.ev-prog');
    if (prog && ev.type === 'commande') prog.textContent = prete ? 'le client attend' : `${G.fmt(ev.fait)} / ${G.fmt(ev.n)} fournées${st.stations[ev.i].staff ? '' : ' · touche pour cuire !'}`;
    if (prog && ev.type === 'critique') prog.textContent = 'touche les cartes : ' + ev.restants.map((i) => G.PRODUITS[i].nom.toLowerCase()).join(', ');
    const ch = box.querySelector('.ev-chrono'); if (ch) ch.textContent = G.fmtChrono(reste);
    box.querySelector('.ev-barre').style.width = (prete ? 100 : pct) + '%';
  }
  function basculerEvenement() { evEtendu = !evEtendu; $('#evenement').classList.toggle('etendu', evEtendu); }

  // ─── indices : une seule consigne à la fois, qui pointe l'élément concerné ───
  const INDICES = [
    { txt: 'Touche la baguette pour la cuire et la vendre !', ou: 'pages', cible: () => cards[0].el.querySelector('.barre'), fini: () => st.stats.ventes >= 1 },
    { txt: 'Avec tes euros, améliore la baguette : chaque niveau rapporte plus.', ou: 'pages', cible: () => cards[0].el.querySelector('[data-a="ameliorer"]'), pret: () => st.coins >= G.coutNiveau(0, st.stations[0].niv), fini: () => st.stations[0].niv >= 2 },
    { txt: 'Débloque les croissants : 20 € la fournée !', ou: 'pages', cible: () => cards[1].el.querySelector('[data-a="debloquer"]'), pret: () => st.coins >= G.PRODUITS[1].debloquer, fini: () => st.stations[1].niv >= 1 },
    { txt: 'Embauche Léo : il cuit les baguettes tout seul, même quand tu n’es pas là.', ou: 'pages', cible: () => cards[0].el.querySelector('[data-a="embaucher"]'), pret: () => st.coins >= G.PRODUITS[0].staff, fini: () => st.stations[0].staff },
    { txt: 'Bravo ! Au niveau 25, 50, 100… les gains doublent. Et regarde tes objectifs du jour : trois défis, une étoile à la clé.', ou: 'pages', cible: () => $('#objectifs'), pret: () => true, fini: () => performance.now() > hintUntil },
    { txt: 'Le boulanger a un point de talent ! Touche-le dans la boutique, ou ouvre l’onglet Boulanger.', ou: 'onglets', cible: () => $('#onglets [data-page="boulanger"]'), pret: () => G.ptsTalents(st) > 0, fini: () => vuBoulanger },
    { txt: 'Ton salon de thé ! Touche un meuble dans la boutique (les tables, le four, la vitrine…) pour l’améliorer, ou Réglages › Repeindre la boutique pour les voir tous.', ou: 'scene', cible: () => zoneCible('tables'), pret: () => G.MOBILIER.some((m) => G.mobilierCran(st, m.id) < m.max && st.coins >= G.prixMeuble(st, m.id)), fini: () => (st.stats.meubles || 0) > 0 },
  ];
  // une cible d'indice posée sur une zone de la scène (le canvas n'a pas d'éléments)
  function zoneCible(id) {
    const z = SCENE.zones && SCENE.zones()[id]; if (!z) return $('#scene');
    const r = $('#scene').getBoundingClientRect();
    return { getBoundingClientRect: () => ({ left: r.left + z.x, top: r.top + z.y, right: r.left + z.x + z.w, bottom: r.top + z.y + z.h, width: z.w, height: z.h }) };
  }
  function indices() {
    const el = $('#indice');
    if (st.tuto >= INDICES.length || !$('#feuille').hidden || MINIJEUX.ouvert || (EVT && EVT.ouvert) || (AR && AR.ouvert)) { el.hidden = true; return; }
    const h = INDICES[st.tuto];
    if (h.ou === 'pages' && (pageActive !== 'boutique' || tiroir.pos === 'ferme')) { el.hidden = true; return; }
    if (h.fini()) { st.tuto++; hintUntil = performance.now() + 8000; save(); el.hidden = true; return; }
    if (h.pret && !h.pret()) { el.hidden = true; return; }
    if (st.tuto !== hintStep) { hintStep = st.tuto; $('#indice-txt').textContent = h.txt; if (st.tuto === 4) hintUntil = performance.now() + 8000; }
    const cible = h.cible();
    el.hidden = false;
    if (!cible) { el.classList.remove('haut'); el.style.left = '50%'; el.style.transform = 'translateX(-50%)'; el.style.top = (window.innerHeight * 0.42) + 'px'; el.querySelector('.main').hidden = true; return; }
    el.querySelector('.main').hidden = false;
    const r = cible.getBoundingClientRect(), bw = Math.min(window.innerWidth * 0.78, 320), hautTiroir = $('#tiroir').getBoundingClientRect().top;
    const visible = h.ou === 'pages' ? r.top >= hautTiroir + 30 && r.bottom <= $('#onglets').getBoundingClientRect().top + 2 : h.ou === 'scene' ? r.bottom <= hautTiroir + 2 : true; // sous le tiroir ou sous les onglets : on attend
    if (!visible) { // la liste défile une fois jusqu'à la cible (et seulement la liste)
      if (h.ou === 'pages' && hintDefile !== st.tuto) { hintDefile = st.tuto; const pg = $('#pages'), pr = pg.getBoundingClientRect(); pg.scrollTo({ top: pg.scrollTop + (r.top - pr.top) - (pr.height - r.height) / 2, behavior: reduceMotion ? 'auto' : 'smooth' }); }
      el.hidden = true; return;
    }
    let x = r.left + r.width / 2 - bw / 2; x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
    el.style.left = x + 'px'; el.style.transform = 'none';
    const hauteur = el.offsetHeight || 90;
    if (r.bottom + hauteur + 6 < window.innerHeight - 20) { el.classList.add('haut'); el.style.top = (r.bottom + 6) + 'px'; }
    else { el.classList.remove('haut'); el.style.top = (r.top - hauteur - 6) + 'px'; }
    if (r.bottom < 0 || r.top > window.innerHeight) el.hidden = true;
  }

  // ─── feuilles : bonus, étoiles, sauvegarde, nom, spécialité, retour d'absence ───
  const feuille = $('#feuille'), fc = $('#feuille-contenu'), voile = $('#voile');
  let openedAt = 0;
  function openSheet(html) { vueCl = ''; fc.innerHTML = html; feuille.hidden = false; voile.hidden = false; feuille.scrollTop = 0; openedAt = performance.now(); }
  function closeSheet() { vueCl = ''; feuille.hidden = true; voile.hidden = true; fc.innerHTML = ''; }
  voile.addEventListener('pointerdown', (e) => { if (performance.now() - openedAt > 300) { e.preventDefault(); closeSheet(); } });
  const on = (sel, fn) => fc.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  const btnRetour = (a) => `<button type="button" class="btn large sombre" data-a="${a || 'close'}" style="margin-top:14px"><b>Retour</b></button>`;
  let ongletBonus = 'bonus';
  function sheetAmeliorations(tab) {
    if (tab) ongletBonus = tab;
    const bonus = G.AMELIORATIONS.map((a) => {
      const fait = st.ameliorations[a.id], prix = G.prixBonus(st, a), ok = st.coins >= prix;
      return `<div class="am ${fait ? 'fait' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p></div>${fait ? okChip('Acheté') : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
    }).join('');
    const meubles = G.MOBILIER.map((m) => {
      const k = G.mobilierCran(st, m.id), max = k >= m.max, prix = G.prixMeuble(st, m.id), ok = !max && st.coins >= prix;
      return `<div class="am meuble ${max ? 'fait' : ''}">${ICONS.MEUBLES[m.id]}<div><h3>${esc(m.nom)} ${crans(k, m.max)}</h3><p>${k ? esc(m.desc(k)) : 'Pas encore installé'}${max ? '' : `<br><em>Cran suivant : ${esc(m.desc(k + 1))}</em>`}</p></div>${max ? okChip('Au max') : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-m="${m.id}"><small>Améliorer</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
    }).join('');
    openSheet(`<div class="segments" role="tablist"><button type="button" role="tab" data-tab="bonus" aria-selected="${ongletBonus === 'bonus'}" class="${ongletBonus === 'bonus' ? 'actif' : ''}">Bonus</button><button type="button" role="tab" data-tab="mobilier" aria-selected="${ongletBonus === 'mobilier'}" class="${ongletBonus === 'mobilier' ? 'actif' : ''}">Mobilier</button></div>
      ${ongletBonus === 'bonus' ? `<h2>Bonus</h2><p class="sous">Des recettes et des équipements qui multiplient tes gains, pour toujours (jusqu’à la prochaine boutique).</p><div class="liste-am">${bonus}</div>`
    : `<h2>Mobilier</h2><p class="sous">Les meubles de la boutique, à améliorer cran par cran : chacun donne un bonus. Tu peux aussi les toucher directement dans la boutique. Tout repart de zéro à la prochaine boutique.</p><div class="liste-am">${meubles}</div>`}`);
    on('[data-tab]', (b) => { son.tap(); sheetAmeliorations(b.dataset.tab); });
    on('[data-id]', (b) => { const r = G.amelioration(st, b.dataset.id); if (!r.ok) { son.non(); toast(`Il manque ${G.fmtEur(r.prix - st.coins)}`); return; } son.deblocage(); buzz([10, 30, 10]); toast(`${r.a.nom} : ${r.a.desc}`); renderCards(true); hud(); save(); sheetAmeliorations(); });
    on('[data-m]', (b) => acheterMeuble(b.dataset.m, () => sheetAmeliorations()));
  }
  function acheterMeuble(id, apres) {
    const r = G.ameliorerMeuble(st, id);
    if (!r.ok) { son.non(); toast(r.m && r.cran >= r.m.max ? 'Ce meuble est déjà au maximum.' : `Il manque ${G.fmtEur(r.prix - st.coins)}`); return; }
    son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); confettis(0.5); toast(`${r.m.nom} : ${r.m.desc(r.cran)}`); renderCards(true); hud(); save(); if (apres) apres();
  }
  // la fiche d'un meuble, ouverte en le touchant dans la boutique
  function sheetMeuble(id) {
    const m = G.MOBILIER.find((x) => x.id === id); if (!m) return;
    const k = G.mobilierCran(st, id), max = k >= m.max, prix = G.prixMeuble(st, id), ok = !max && st.coins >= prix;
    openSheet(`<div class="meuble-fiche">${ICONS.MEUBLES[id]}<div><h2>${esc(m.nom)}</h2><p class="sous">${crans(k, m.max)} cran ${k} sur ${m.max}</p></div></div>
      <div class="encadre espace">${k ? `<b>Maintenant :</b> ${esc(m.desc(k))}` : 'Pas encore installé.'}${max ? '' : `<br><b>Cran suivant :</b> ${esc(m.desc(k + 1))}`}</div>
      ${max ? '<p class="sous">Ce meuble est au maximum.</p>' : `<button type="button" class="btn large ${ok ? 'lavande' : 'non'}" data-m="${id}"><small>Améliorer</small><b>${G.fmtEur(prix)}</b></button>`}
      <button type="button" class="lien" data-a="tous">Tous les bonus et le mobilier</button>${btnRetour()}`);
    on('[data-a="close"]', closeSheet); on('[data-a="tous"]', () => sheetAmeliorations('mobilier'));
    on('[data-m]', (b) => acheterMeuble(b.dataset.m, () => sheetMeuble(id)));
  }
  function sheetSauvegarde() {
    save();
    openSheet(`<h2>Sauvegarde</h2><p class="sous">Ta boutique est enregistrée ici toutes les 5 secondes et à chaque achat. Attention : Safari et l’app installée ont chacun leur sauvegarde, et supprimer l’app efface la sienne. Pour la mettre à l’abri ou la transférer, copie ce code et garde-le quelque part.</p>
      <h3 class="titre-section">Ton code</h3>
      <textarea class="code" readonly data-r="code" aria-label="Code de sauvegarde">${esc(codeSauvegarde())}</textarea>
      <button type="button" class="btn large menthe" data-a="copier"><b>Copier le code</b></button>
      <h3 class="titre-section">Charger un code</h3>
      <textarea class="code" data-r="entree" placeholder="Colle un code ici" aria-label="Code à charger"></textarea>
      <button type="button" class="btn large lavande" data-a="charger"><b>Charger ce code</b></button>${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
    on('[data-a="copier"]', () => {
      const ta = fc.querySelector('[data-r="code"]'); ta.focus(); ta.select();
      const fait = () => { son.deblocage(); toast('Code copié. Colle-le dans tes notes.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(fait, () => { try { document.execCommand('copy'); fait(); } catch (e) { toast('Sélectionne le code et copie-le.'); } });
      else { try { document.execCommand('copy'); fait(); } catch (e) { toast('Sélectionne le code et copie-le.'); } }
    });
    on('[data-a="charger"]', () => {
      const s2 = lireCode(fc.querySelector('[data-r="entree"]').value);
      if (!s2) { son.non(); toast('Ce code n’est pas valide.'); return; }
      const plus = s2.etoiles > st.etoiles || (s2.xp || 0) > (st.xp || 0);
      openSheet(`<h2>Charger cette boutique ?</h2><p class="sous">Ta boutique actuelle : ${G.fmtEur(st.coins)}, ${st.etoiles} étoile${st.etoiles > 1 ? 's' : ''}, boutique n°${st.boutiques}. Dans le code :</p>
        <div class="stat"><span>Euros</span><b>${G.fmtEur(s2.coins)}</b></div><div class="stat"><span>Étoiles</span><b>${s2.etoiles}</b></div><div class="stat"><span>Boutique</span><b>n°${s2.boutiques}</b></div><div class="stat"><span>Gagné depuis le début</span><b>${G.fmtEur(s2.lifetime)}</b></div>
        <button type="button" class="btn large lavande" data-a="oui" style="margin-top:14px"><small>Remplacer ma boutique</small><b>Charger tout</b></button>
        ${plus ? `<button type="button" class="btn large beurre" data-a="etoiles" style="margin-top:8px"><small>Garder ma boutique</small><b>Prendre ${s2.etoiles} étoiles et le savoir-faire</b></button>` : ''}
        <button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Non, ne rien changer</b></button>`);
      on('[data-a="non"]', sheetSauvegarde);
      on('[data-a="oui"]', () => { st = s2; save(); fige = true; setTimeout(() => location.reload(), 150); });
      on('[data-a="etoiles"]', () => { st.etoiles = Math.max(st.etoiles, s2.etoiles); if ((s2.xp || 0) > (st.xp || 0)) { st.xp = s2.xp; st.talents = s2.talents || {}; } lastNiveau = G.niveau(st); son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); toast(`${st.etoiles} étoiles : +${Math.round(st.etoiles * G.ETOILE_BONUS * 100)} % de gains`); renderCards(true); hud(); save(); closeSheet(); renderPage(true); });
    });
  }
  // le nom de la boutique : demandé à chaque ouverture, modifiable depuis l'enseigne ou les Réglages
  function sheetNom(nouvelle) {
    const q = G.QUARTIERS[G.quartier(st)], actuel = st.nomBoutique || q.enseigne;
    const choixSpe = nouvelle && st.specialite == null; let spe = choixSpe ? (st.boutiques + 1) % G.PRODUITS.length : null;
    openSheet(`<h2>${nouvelle ? `Boutique n°${st.boutiques}` : 'Le nom de ta boutique'}</h2><p class="sous">${nouvelle ? `Tu t’installes dans ${esc(q.nom)}. ` : ''}Comment s’appelle ta boutique ? Le nom s’affiche sur l’enseigne.</p>
      <input class="champ" type="text" maxlength="24" value="${esc(actuel)}" aria-label="Nom de la boutique" autocomplete="off" autocorrect="off">
      ${choixSpe ? `<h3 class="titre-section">Sa spécialité</h3><p class="sous">Le produit fétiche de cette boutique rapporte <b>×2</b> le temps de la boutique. On choisit une fois.</p>${grilleSpecialite(spe)}` : ''}
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>${nouvelle ? 'C’est parti !' : 'Garder ce nom'}</b></button>
      ${nouvelle ? '' : '<button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Annuler</b></button>'}`);
    const champ = fc.querySelector('.champ');
    const valider = () => { G.renommer(st, champ.value); if (choixSpe && spe != null) G.choisirSpecialite(st, spe); save(); renderCards(true); hud(); closeSheet(); renderPage(true); toast(`${G.nomBoutique(st)} : bienvenue !${choixSpe && spe != null ? ` Spécialité : ${G.PRODUITS[spe].pl}.` : ''}`); };
    on('[data-a="ok"]', valider); on('[data-a="non"]', closeSheet);
    on('[data-s]', (b) => { spe = +b.dataset.s; fc.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('actif', x === b)); son.tap(); });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
    if (!nouvelle) setTimeout(() => { champ.focus(); champ.select(); }, 50);
  }
  const grilleSpecialite = (sel) => `<div class="spe-grille">${G.PRODUITS.map((p, i) => `<button type="button" class="${i === sel ? 'actif' : ''}" data-s="${i}">${ICONS.PRODUITS[p.id]}<span>${esc(p.nom.split(' ')[0])}</span></button>`).join('')}</div>`;
  function sheetSpecialite() {
    let spe = (st.boutiques + 1) % G.PRODUITS.length;
    openSheet(`<h2>La spécialité</h2><p class="sous">Le produit fétiche de cette boutique rapporte <b>×2</b> le temps de la boutique. On choisit une fois par boutique.</p>${grilleSpecialite(spe)}
      <button type="button" class="btn large lavande" data-a="ok" style="margin-top:12px"><b>Choisir</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Plus tard</b></button>`);
    on('[data-s]', (b) => { spe = +b.dataset.s; fc.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('actif', x === b)); son.tap(); });
    on('[data-a="ok"]', () => { if (G.choisirSpecialite(st, spe).ok) reussite(`Spécialité : ${G.PRODUITS[spe].pl} ×2 !`); closeSheet(); renderPage(true); });
    on('[data-a="non"]', closeSheet);
  }
  // partager : une image de la boutique avec une légende, sinon le texte, sinon le presse-papiers
  async function partager() {
    const texte = `${G.nomBoutique(st)} · boutique n°${st.boutiques} · ${st.etoiles} ★ · ${G.titre(st)} niveau ${G.niveau(st)} · ${G.fmtEur(st.lifetime)} gagnés — Le Fournil`;
    const url = location.href.split('#')[0];
    try {
      if (navigator.share && !SCENE.webgl) { await navigator.share({ title: 'Le Fournil', text: texte, url }); return; } // sans 3D, pas d'image : le texte seul
      if (navigator.share) {
        SCENE.rendu(); // rendu complet à la finesse de l'écran, lu tout de suite (même tâche)
        const cv = $('#scene'), ui = $('#scene-ui'), k = cv.width / cv.clientWidth, hu = Math.round(Math.min(cv.height, SCENE.hauteurUtile() * k)), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = hu + 56 * k;
        const x = c2.getContext('2d'); x.fillStyle = '#FFF7EC'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0, cv.width, hu, 0, 0, cv.width, hu); if (ui.width) x.drawImage(ui, 0, 0, ui.width, Math.round(hu * ui.height / cv.height), 0, 0, cv.width, hu); // la 3D puis le calque 2D
        x.fillStyle = '#4A3328'; x.font = `700 ${16 * k}px Fredoka, Nunito, sans-serif`; x.textAlign = 'center'; x.fillText(texte.replace(' — Le Fournil', ''), c2.width / 2, hu + 34 * k, c2.width - 20 * k);
        const blob = await new Promise((r) => c2.toBlob(r, 'image/png'));
        const files = blob ? [new File([blob], 'ma-boutique.png', { type: 'image/png' })] : [];
        if (files.length && navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: 'Le Fournil', text: texte, url }); return; }
        await navigator.share({ title: 'Le Fournil', text: texte, url }); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${texte}\n${url}`); toast('Texte copié : colle-le où tu veux.'); } catch (e) { toast(texte); }
  }
  // les étoiles : la nouvelle boutique, et rien d'autre (le reste vit dans les onglets)
  function sheetEtoiles() {
    const gain = G.etoilesGagnables(st), bonus = Math.round(st.etoiles * G.ETOILE_BONUS * 100), q = G.QUARTIERS[G.quartier(st)];
    openSheet(`<h2>Étoiles</h2><p class="sous"><b>${esc(G.nomBoutique(st))}</b> · boutique n°${st.boutiques}, ${esc(q.nom)} · ${st.etoiles} étoile${st.etoiles > 1 ? 's' : ''} · +${bonus} % sur tous les gains</p>
      <div class="encadre doux">Ouvrir une <b>nouvelle boutique</b> remet les produits et les euros à zéro, mais tu gardes tes étoiles pour toujours. Chaque étoile : <b>+${Math.round(G.ETOILE_BONUS * 100)} %</b> de gains. Plus tu as gagné dans cette boutique, plus tu en récoltes. Les objectifs du jour en donnent une aussi.</div>
      <div class="grand-nombre">+${gain} ★</div><p class="sous">à récolter maintenant (${G.fmtEur(st.lifetimeRun)} gagnés dans cette boutique)</p>
      <button type="button" class="btn large ${gain > 0 ? 'beurre' : 'non'}" data-a="prestige"><small>${gain > 0 ? 'Repartir avec' : 'Pas encore'}</small><b>${gain > 0 ? `+${gain} étoile${gain > 1 ? 's' : ''}` : 'Vends encore un peu'}</b></button>
      <h3 class="titre-section">Ta boutique</h3>
      <div class="stat"><span>Fournées vendues</span><b>${G.fmt(st.stats.ventes)}</b></div><div class="stat"><span>Clients servis</span><b>${G.fmt(st.stats.clients)}</b></div><div class="stat"><span>Gagné depuis le début</span><b>${G.fmtEur(st.lifetime)}</b></div>
      ${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
    on('[data-a="prestige"]', () => {
      if (G.etoilesGagnables(st) <= 0) { son.non(); return; }
      openSheet(`<h2>Nouvelle boutique ?</h2><p class="sous">Tu repars de la première baguette avec <b>${st.etoiles + gain} étoiles</b> (+${Math.round((st.etoiles + gain) * G.ETOILE_BONUS * 100)} % de gains). Les bonus achetés sont perdus.</p>
        <button type="button" class="btn large beurre" data-a="oui"><b>Ouvrir la boutique n°${st.boutiques + 1}</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Rester ici</b></button>`);
      on('[data-a="non"]', sheetEtoiles);
      on('[data-a="oui"]', () => { const r = G.nouvelleBoutique(st, HORLOGE.maintenant()); if (r.ok) { son.deblocage(); buzz([20, 40, 20]); SCENE.fete(); confettis(1.6); toast(`Boutique n°${st.boutiques} ouverte : +${r.gain} ★`); st.tuto = Math.max(st.tuto, INDICES.length); amenager(false); renderCards(true); hud(); save(); showPage('boutique'); sheetNom(true); } });
    });
  }
  // Réglages › Journal des retours : quand le jeu a compté une absence, pourquoi, et si la feuille s'est ouverte (sinon, pourquoi pas)
  const RAISON_RETOUR = { lancement: 'Ouverture du jeu', visible: 'Retour dans le jeu', cache: 'Retour dans le jeu', reveil: 'Réveil du téléphone', gel: 'Le jeu reprend après une pause', saut: 'L’heure a sauté', heure: 'L’heure sûre est arrivée', recul: 'Horloge du jeu remise à l’heure', derive: 'Le compteur du téléphone a sauté' };
  const NOTE_RETOUR = { feuille: 'feuille « Pendant ton absence » ouverte', court: 'pas de feuille : moins de 90 s', apprentis: 'pas de feuille : aucun apprenti', rien: 'pas de feuille : rien de vendu' };
  const ecartTxt = (s) => `${s > 0 ? '+' : '−'}${G.fmtDuree(Math.abs(s))}`;
  function sheetJournalRetours() {
    const j = (Array.isArray(st.journalRetours) ? st.journalRetours : []).slice().reverse();
    const quand = (t) => { try { return new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const horl = (e) => `${e.a ? ` · jeu ${ecartTxt(e.a)} sur l’heure sûre` : ''}${e.p ? ` · téléphone ${ecartTxt(e.p)}` : ''}`;
    const lignes = j.map((e) => (e.r === 'recul' || e.r === 'derive'
      ? `<li><span><b>${esc(quand(e.t))} · ${esc(RAISON_RETOUR[e.r])}</b><small>${e.r === 'recul' ? `−${esc(G.fmtDuree(e.o || 0))}${e.s ? ` (absence rendue : ${esc(G.fmtDuree(e.s))})` : ''} : tes absences comptent de nouveau` : `+${esc(G.fmtDuree(e.o || 0))} d’un coup`}${esc(horl(e))}</small></span><b></b></li>`
      : `<li><span><b>${esc(quand(e.t))} · ${esc(RAISON_RETOUR[e.r] || e.r)}</b><small>parti ${esc(G.fmtDuree(e.o || 0))}${e.o > e.s + 60 ? ` (payé ${esc(G.fmtDuree(e.s))})` : ''} · ${esc(NOTE_RETOUR[e.n] || e.n)}${e.h === 0 ? ' · sans heure sûre' : ''}${esc(horl(e))}</small></span><b>+${G.fmtEur(e.g || 0)}</b></li>`)).join('');
    const hv = horlogeVue(), etatH = hv.a ? `<p class="sous">Horloge du jeu : ${esc(ecartTxt(hv.a))} sur l’heure sûre${hv.p ? `, téléphone ${esc(ecartTxt(hv.p))}` : ''}.</p>` : '';
    openSheet(`<h2>Journal des retours</h2><p class="sous">Chaque fois que le jeu compte ton absence : l’heure, ce qui l’a lancé, le temps payé et la feuille « Pendant ton absence ».</p>
      ${etatH}${lignes ? `<ul class="detail journal-retours">${lignes}</ul>` : '<p class="sous">Rien encore : le prochain retour s’inscrira ici.</p>'}
      <button type="button" class="btn large menthe" data-a="close"><b>Fermer</b></button>`);
    on('[data-a="close"]', closeSheet);
  }
  // les cadeaux déposés sur le serveur (supabase/fournil-cadeaux.sql) : ajoutés une seule fois (st.cadeauxRecus garde les numéros déjà
  // reçus, même si l'accusé de réception se perd), puis la feuille « Un cadeau ! » ; relus au lancement, au retour et toutes les 10 min
  let cadeauxVol = false;
  function verifierCadeaux() {
    if (!classement || !classement.cadeaux || cadeauxVol || !st || fige) return;
    cadeauxVol = true;
    classement.cadeaux().then((r) => {
      const recus = Array.isArray(st.cadeauxRecus) ? st.cadeauxRecus : (st.cadeauxRecus = []), nouveaux = [];
      for (const c of r.cadeaux || []) {
        if (!recus.includes(c.n)) { G.gagner(st, c.montant, true); recus.push(c.n); nouveaux.push(c); }
        classement.cadeauRecu(c.n);
      }
      while (recus.length > 50) recus.shift();
      if (!nouveaux.length) return;
      save(); renderCards(true); hud();
      const total = nouveaux.reduce((a, c) => a + c.montant, 0), motifs = nouveaux.map((c) => c.motif).filter(Boolean);
      const montrer = () => { son.deblocage(); buzz([20, 40, 20]); confettis(1.4); openSheet(`<h2>Un cadeau !</h2><p class="sous">${motifs.length ? esc(motifs.join(' · ')) : 'Pour ta boutique'}</p><div class="grand-nombre">+${G.fmtEur(total)}</div>
        <button type="button" class="btn large menthe" data-a="close"><b>Merci !</b></button>`); on('[data-a="close"]', closeSheet); };
      if ($('#feuille').hidden) montrer(); else { const t = setInterval(() => { if ($('#feuille').hidden) { clearInterval(t); montrer(); } }, 1000); }
    }).catch(() => { /* rien */ }).then(() => { cadeauxVol = false; });
  }
  function sheetRetour(abs) {
    const detail = abs.detail.slice().sort((a, b) => b.m - a.m).map((d) => `<li><span>${esc(d.nom || G.PRODUITS[d.i].nom)} × ${G.fmt(d.n)}</span><b>${G.fmtEur(d.m)}</b></li>`).join('');
    const grades = (abs.grades || []).map((g) => `${G.APPRENTIS[g.i].prenom} passe au grade ${g.niv}`).join(' · ');
    openSheet(`<h2>Pendant ton absence</h2><p class="sous">${G.fmtDuree(abs.secs)}${abs.secs >= G.heuresAbsence(st) * 3600 ? ` (les apprentis s’arrêtent après ${G.heuresAbsence(st)} h)` : ''}</p>
      <div class="grand-nombre">+${G.fmtEur(abs.total)}</div><p class="sous">vendus par tes apprentis</p><ul class="detail">${detail}</ul>${grades ? `<p class="sous">${esc(grades)} !</p>` : ''}
      <button type="button" class="btn large menthe" data-a="close"><b>Super !</b></button>`);
    on('[data-a="close"]', closeSheet);
  }

  // ─── le classement en ligne : une feuille à deux onglets (cette semaine, tous les temps), un pseudo à part, des envois discrets ───
  // Le moteur (src/classement.js) n'existe que si fournil/config.js donne l'adresse et la clé publique Supabase : dans l'artefact Claude, tout se cache.
  const CLM = typeof CLASSEMENT !== 'undefined' ? CLASSEMENT : null;
  const EVS = typeof EVENEMENTS !== 'undefined' ? EVENEMENTS : null; // les écrans des événements (src/evenement.js)
  const EVT = EVS && EVS.quartier.R ? EVS.quartier : null, QT = EVT ? EVT.R : null; // l'événement « Le Quartier » (src/evenement.js, src/quartier.js)
  const HTE = EVS && EVS.hantee && EVS.hantee.R ? EVS.hantee : null, HT = HTE ? HTE.R : null; // l'événement « La Maison hantée » (src/evenement.js, src/hantee.js)
  // ce que le classement envoie de la Maison hantée : ses bonbons (p_evt = 'hantee'), pendant la fenêtre et l'heure de grâce ; deux noms
  // proposés au moteur (src/classement.js, v5) : hantee() → nombre, evenement() → { id, valeur } ; un moteur v4 les ignore
  function envoiHantee() {
    if (!HTE) return {};
    const bonbons = () => { const h = st && st[HTE.cle]; const t = HORLOGE.maintenant(); const ok = HT.envoiBillets ? HT.envoiBillets(t) : t >= HT.DEBUT && t < HT.FIN + 3600e3; return h && ok && h.total > 0 ? h.total : null; };
    return { [HTE.cle]: bonbons, evenement: () => { const v = bonbons(); return v == null ? null : { id: HTE.cle, score: v, valeur: v }; } }; // classement v5 : evenement() → { id, score }
  }
  // ─── le compagnon de la boutique : le chat roux de toujours, un chien, un lapin… jusqu'au mini-dragon (GAME.COMPAGNONS, src/game.js) ───
  // Un chat est noir d'office pendant la Maison hantée (pas masquée) ; le chat noir gagné y reste au choix, comme tous les autres, dans la
  // feuille « Les compagnons » (Réglages › La boutique, ou la garde-robe). majChat dit à la scène quel modèle bâtir quand il change.
  let tChat = 0, dernierModele = '';
  const chatNoirForce = () => !!(HTE && HTE.visible());
  function chatNoirDispo() { return !!(st && st.chat && G.aCompagnon(st, 'chat-noir')); } // gagné à un palier (GAME.donnerChatNoir)
  const modeleVu = () => (st && st.chat ? G.modeleCompagnon(st, chatNoirForce()) : 'chat-roux'); // l'animal montré dans la boutique
  function chatNoir() { return !!(st && st.chat) && modeleVu() === 'chat-noir'; }
  function choisirPelage(p) { if (!st || !st.chat) return false; G.choisirPelage(st, p); save(); majChat(); return chatNoir(); } // l'ancien choix (tests, garde-robe d'avant)
  function majChat() { const id = modeleVu(); if (id !== dernierModele) { dernierModele = id; if (SCENE.compagnon) SCENE.compagnon(id); else if (SCENE.pelageChat) SCENE.pelageChat(id === 'chat-noir' ? 'noir' : 'roux'); } }
  const CRIS = { wouf: 'Wouf !', cotcot: 'Cot cot !', coincoin: 'Coin coin !', couic: 'Couic !', couac: 'Couac !' };
  function criCompagnon(id) { // la caresse : le cri d'un animal simple (src/sons.js, sinon un bip à sa hauteur), le ronron pour les autres
    const c = G.compagnon(id), n = c && c.cri;
    if (!n) { son.ronron(); return id === 'dragon' ? 'Pfffouh…' : 'Rrrr…'; }
    if (!zf(n, { vol: 0.3 })) { const f = { wouf: 220, cotcot: 560, coincoin: 340, couic: 1250, couac: 280 }[n] || 440; beep(f, 0.09, n === 'couic' ? 'sine' : 'square', 0.035); beep(f * 0.9, 0.09, n === 'couic' ? 'sine' : 'square', 0.03, 0.13); }
    return CRIS[n] || 'Rrrr…';
  }
  // la feuille « Les compagnons » : la grille des animaux, leur phrase, et Choisir / Acheter (tout de suite) ; retour : la feuille d'où l'on vient
  function sheetCompagnons(retour) {
    const html = () => {
      const actif = st.chat ? G.compagnonActif(st) : null, vu = modeleVu(), force = chatNoirForce() && actif && G.estChat(actif);
      const cartes = G.COMPAGNONS.map((c) => {
        const a = G.aCompagnon(st, c.id), choisi = actif === c.id, prix = G.prixCompagnon(st, c.id), assez = prix != null && st.coins >= prix;
        const statut = c.prix == null ? (c.condition ? c.gagne : 'Gratuit') : a ? 'À toi' : G.fmtEur(prix);
        const bouton = choisi ? '<span class="cp-ok">Avec toi ✓</span>'
          : a ? `<button type="button" class="btn menthe" data-cp-choisir="${c.id}"><b>Choisir</b></button>`
          : prix == null ? '<span class="cp-verrou">Pendant Halloween</span>'
          : `<button type="button" class="btn ${assez ? 'beurre' : 'non'}" data-cp-acheter="${c.id}" aria-label="${assez ? 'Acheter' : 'Pas assez pour'} ${esc(c.nom)} : ${G.fmtEur(prix)}"><small>${assez ? 'Acheter' : 'Pas assez'}</small><b>${G.fmtEur(prix)}</b></button>`;
        return `<div class="cp-carte ${choisi ? 'choisi' : ''} ${a ? '' : 'verrou'}" data-cp="${c.id}"><span class="cp-ico">${ICONS.compagnon(choisi ? vu : c.id)}</span><b>${esc(c.nom)}</b><small class="cp-phrase">${esc(c.phrase)}</small><small class="cp-statut ${a ? 'a-toi' : ''}">${statut}</small>${bouton}</div>`;
      }).join('');
      const tete = st.chat ? `<b>${esc(st.chat.nom)}, ${esc(G.compagnon(vu).nom.toLowerCase())}</b><small>${G.fmt(st.chat.caresses)} caresse${st.chat.caresses > 1 ? 's' : ''} · une caresse par minute porte chance au client mystère</small>` : '<b>Pas encore de compagnon</b><small>Le chat arrive avec les éclairs au café. Tu peux aussi en choisir un tout de suite.</small>';
      return `<div class="cl cp" data-cl="compagnons"><div class="cl-tete"><span class="pic">${ICONS.UI.patte}</span><div><h2>Les compagnons</h2><p class="sous">L’animal de la boutique dort sur le comptoir, se promène dans la salle et porte chance quand on le caresse. Acheté, il est à toi pour toujours, même dans une nouvelle boutique.</p></div></div>
        <div class="cp-tete"><span class="cp-ico">${ICONS.compagnon(vu)}</span><div>${tete}</div>${st.chat ? '<button type="button" class="btn clair" data-a="cp-nom"><b>Renommer</b></button>' : ''}</div>
        ${force ? '<p class="note centre">Pendant la Maison hantée, un chat de la boutique est noir. Le choix revient après.</p>' : ''}
        <div class="cp-grille" role="list">${cartes}</div>
        <p class="note centre">Les prix suivent les gains de ta boutique : quelques minutes pour la poule, une belle journée de travail pour le mini-dragon.</p>
        <button type="button" class="btn large sombre" data-a="cp-fermer" style="margin-top:14px"><b>Retour</b></button></div>`;
    };
    const dessiner = (cible) => { const y = feuille.scrollTop; openSheet(html()); feuille.scrollTop = y; lier(); if (cible) { const b = fc.querySelector(cible); if (b) b.focus(); } };
    const apres = (r, c) => { save(); majChat(); renderPage(true); if (r.adopte) toast(`${st.chat.nom} a adopté la boutique ! Caresse-le : il porte chance.`); dessiner(`[data-cp="${c.id}"] .cp-ok`); };
    function lier() {
      on('[data-cp-choisir]', (b) => { const r = G.choisirCompagnon(st, b.dataset.cpChoisir); if (!r.ok) { son.non(); return; } son.tap(); buzz(8); apres(r, r.compagnon); if (!r.adopte) toast(`${r.compagnon.nom} : ${st.chat.nom} t’attend dans la boutique.`); });
      on('[data-cp-acheter]', (b) => {
        const id = b.dataset.cpAcheter, r = G.acheterCompagnon(st, id);
        if (!r.ok) { son.non(); if (r.raison === 'argent') toast(`Il manque ${G.fmtEur(r.prix - st.coins)} pour ${G.compagnon(id).nom.toLowerCase()}.`); return; }
        reussite(`${r.compagnon.nom} rejoint la boutique, pour toujours !`); apres(r, r.compagnon);
      });
      on('[data-a="cp-nom"]', () => { son.tap(); sheetNomChat(() => sheetCompagnons(retour)); });
      on('[data-a="cp-fermer"]', () => { son.tap(); if (retour) retour(); else closeSheet(); });
    }
    openSheet(html()); lier();
  }
  const PERIODES = [['semaine', 'Cette semaine'], ['total', 'Tous les temps']];
  // l'onglet Événement : pendant le Quartier et deux semaines après (le podium final) ; l'onglet Halloween : pareil pour la Maison hantée,
  // si le moteur du classement (src/classement.js, v5) connaît la période 'hantee'
  const ongletHantee = () => !!(HTE && CLM && CLM.PERIODES && CLM.PERIODES.includes(HTE.cle) && !(st && st[HTE.cle] && st[HTE.cle].masque) && fenetreClassementHantee());
  function fenetreClassementHantee() { const t = HORLOGE.maintenant(), f = HT.fenetre(t); if (typeof f.classement === 'boolean') return f.classement; return t >= HT.DEBUT && t < (HT.CLASSEMENT_JUSQUA || HT.FIN + 14 * 864e5); }
  const periodes = () => { let p = QT && QT.fenetre(HORLOGE.maintenant()).classement && !(st && st.quartier && st.quartier.masque) ? PERIODES.concat([['quartier', 'Événement']]) : PERIODES; if (ongletHantee()) p = p.concat([[HTE.cle, 'Halloween']]); return p.length > 3 ? p.map(([id, t]) => [id, { semaine: 'Semaine', total: 'Tous', quartier: 'Quartier' }[id] || t]) : p; }; // quatre onglets (les deux semaines du podium du Quartier et Halloween) : des noms courts, lisibles sur un iPhone
  const MSG_RESEAU = { 'hors-ligne': 'Pas de réseau : réessaie quand le téléphone est connecté.', 'lent': 'Le classement est lent à répondre : réessaie dans un instant.', 'pas-ouvert': 'Le classement ouvre bientôt : reviens dans quelques jours.' };
  const msgReseau = (e) => MSG_RESEAU[e] || 'Le classement ne répond pas. Réessaie dans un moment.';
  function cleClassement() { if (!classement) return ''; const r = classement.resume(); return `${r.rejoint}|${r.pseudo}|${r.semaine ? r.semaine.rang + '/' + r.semaine.joueurs : ''}|${r.total ? r.total.rang + '/' + r.total.joueurs : ''}|${classement.recompenses().podiums.length}|${G.pointsSemaine(st)}`; }
  // ses points de boulanger de la semaine, tels qu'ils partent au classement
  function mesPoints() { const d = G.detailPoints(st); return { points: d.total, lundi: d.semaine }; }
  const pts = (n) => `${G.fmt(n)} pt${n > 1 ? 's' : ''}`;
  // l'icône ronde en haut à droite : le classement, avec sa place de la semaine en petite pastille (« 2e »)
  let derniereCleCoin = '';
  // une place qui veut dire quelque chose : à 0 point et « 1er », personne n'a encore marqué (chaque lundi matin, tout le monde
  // serait « 1er » ex æquo) ; 0 point et 46e, c'est une vraie place. Un serveur encore en v2 ne donne pas de points : sa place
  // à l'argent s'affiche comme avant.
  const placeVraie = (p) => !!p && !(p.points === 0 && p.rang === 1);
  function majCoinQuartier() { const bq = $('#b-quartier'); if (bq) bq.hidden = !(EVT && EVT.visible()); const bh = $('#b-hantee'); if (bh) bh.hidden = !(HTE && HTE.visible()); } // l'icône de chaque événement : seulement pendant sa fenêtre, et pas masqué
  function majCoin() {
    majCoinQuartier();
    const b = $('#b-classement'); if (!b) return;
    if (!classement) { b.hidden = true; return; }
    const r = classement.resume(), rang = r.rejoint && placeVraie(r.semaine) ? r.semaine.rang : null, cle = `${rang}|${r.semaine ? r.semaine.joueurs : ''}`;
    b.hidden = false;
    if (cle === derniereCleCoin) return; derniereCleCoin = cle;
    const p = b.querySelector('.rang-pastille');
    p.hidden = !rang; p.textContent = rang ? CLM.rangTexte(rang) : ''; p.className = `rang-pastille${rang && rang <= 3 ? ' r' + rang : ''}`;
    majCoinQuartier();
    b.setAttribute('aria-label', rang ? `Classement des boulangers : ${CLM.rangPhrase(rang, r.semaine.joueurs, 'semaine')}` : 'Classement des boulangers');
  }
  // l'Atelier, d'un geste depuis l'icône du coin : les trois mini-jeux, leurs records et ce qu'ils valent au classement cette semaine
  function sheetAtelier() {
    const d = G.detailPoints(st);
    openSheet(`<div class="cl" data-cl="atelier">${carteAtelier()}<p class="note centre">Au classement : le meilleur score de la semaine de chaque mini-jeu vaut jusqu’à ${G.POINTS.atelier} points de boulanger. Cette semaine : ${d.atelier.map((a) => `${esc(a.nom.toLowerCase())} ${a.points}/${G.POINTS.atelier}`).join(' · ')}.</p><button type="button" class="btn large sombre" data-a="close" style="margin-top:12px"><b>Retour à la boutique</b></button></div>`);
    on('[data-jeu]', (b) => { son.tap(); closeSheet(); MINIJEUX.ouvrir(b.dataset.jeu); });
    on('[data-a="close"]', closeSheet);
  }
  // ses points de la semaine, catégorie par catégorie, et le barème (replié) : en tête de la feuille du classement
  function blocPoints() {
    const d = G.detailPoints(st), P = G.POINTS, a = d.aujourdhui, at = d.atelier.reduce((n, x) => n + x.points, 0);
    const case_ = (t, v, max, sous) => `<div class="pts-case"><small>${t}</small><b>${v}<i>/${max}</i></b>${sous ? `<small>${sous}</small>` : ''}</div>`;
    return `<div class="pts-bloc"><div class="pts-tete"><span><small>Mes points cette semaine</small><b>${pts(d.total)}</b></span><span class="pts-auj">aujourd’hui ${a.journee + a.evenements + a.ameliorations}/${a.max}</span></div>
      <div class="pts-cases">${case_('Journées', d.journees, 7 * P.journee, a.journee ? 'faite auj. ✓' : `${P.journee} par jour`)}${case_('Événements', d.evenements, 7 * P.evenementsJour, `auj. ${a.evenements}/${P.evenementsJour}`)}${case_('Améliorations', d.ameliorations, 7 * P.ameliorationsJour, `auj. ${a.ameliorations}/${P.ameliorationsJour}`)}${case_('Défi de la semaine', d.defi, P.defi, d.defi ? 'réussi ✓' : '')}${case_('Atelier', at, P.atelier * d.atelier.length, d.atelier.map((x) => x.points).join(' · '))}</div>
      <details class="pts-bareme"><summary><span>Comment marquer des points ?</span><i class="ico chev">${ICONS.UI.chevron}</i></summary><ul>
        <li><b>${P.journee} pts</b> par journée complète : les trois objectifs du jour réclamés.</li>
        <li><b>${P.defi} pts</b> pour le défi de la semaine.</li>
        <li><b>${P.evenement} pts</b> par événement réussi (pétrissage, commande livrée, four réparé, bonne critique, pourboire du client mystère), ${P.evenementsJour} au plus par jour.</li>
        <li><b>Jusqu’à ${P.atelier} pts</b> par mini-jeu de l’Atelier : ton meilleur score de la semaine.</li>
        <li><b>1 pt</b> par tranche d’améliorations valant 10 minutes de tes propres gains (niveaux, embauches, bonus, mobilier, recette de saison), <b>+${P.palier}</b> à chaque palier ×2 (niveaux 25, 50, 100…), ${P.ameliorationsJour} au plus par jour.</li>
      </ul><p>Tout est relatif à ta boutique : un débutant et une grande boutique qui jouent pareil marquent autant. La fortune reste affichée en petit, pour information. Les compteurs repartent chaque lundi (heure de Paris).</p></details></div>`;
  }
  function sheetClassement(periode) {
    if (!classement) return;
    if (periode === 'semaine' || periode === 'total' || ((periode === 'quartier' || (HTE && periode === HTE.cle)) && periodes().some(([id]) => id === periode))) ongletCl = periode;
    if (!periodes().some(([id]) => id === ongletCl)) ongletCl = 'semaine'; // l'onglet d'un événement a disparu (deux semaines après la fin)
    openSheet(htmlClassement()); vueCl = 'liste'; lierClassement();
    classement.ouvrir(ongletCl); // d'abord sa fortune (si on a rejoint), puis la liste
    classement.objectif(); // l'objectif commun de la semaine (classement v6 ; une fois par minute au plus)
  }
  let dernierHtmlCl = '';
  function rafraichirClassement(force) { // le moteur a du nouveau : la feuille ouverte se redessine sur place, sans remonter
    if (vueCl !== 'liste' || feuille.hidden) return;
    if (!classement.cache(ongletCl) && !classement.enChargement(ongletCl)) { classement.charger(ongletCl); return; } // liste oubliée (pseudo choisi, classement quitté) : on la relit, ce qui redessine
    const avant = dernierHtmlCl, html = htmlClassement(); if (!force && html === avant) return;
    const y = feuille.scrollTop, a = document.activeElement, cible = a && fc.contains(a) ? (a.dataset.tab ? `[data-tab="${a.dataset.tab}"]` : a.dataset.a ? `[data-a="${a.dataset.a}"]` : '') : '';
    fc.innerHTML = html; lierClassement(); feuille.scrollTop = y;
    if (cible) { const b = fc.querySelector(cible); if (b) b.focus(); }
  }
  function htmlClassement() {
    const r = classement.resume(), c = classement.cache(ongletCl), charge = classement.enChargement(ongletCl);
    const seg = `<div class="segments" role="tablist" aria-label="Période du classement">${periodes().map(([id, t]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${ongletCl === id}" class="${ongletCl === id ? 'actif' : ''}">${t}</button>`).join('')}</div>`;
    const corps = c && c.etat === 'ok' ? listeClassement(c.data, r) : c && !charge ? etatClassement(c.etat)
      : '<div class="cl-squelette" role="status" aria-label="Chargement du classement"><i></i><i></i><i></i><span>On compte les euros de chacun…</span></div>';
    const ferme = c && c.etat === 'pas-ouvert';
    // pas encore inscrit : l'invitation en haut, avant la liste ; inscrit : son pseudo et ses réglages en bas
    const invitation = ferme || r.rejoint ? '' : `<div class="cl-invitation"><p>Ton pseudo, tes points et ta fortune seront visibles de tous ceux qui ont le lien du jeu. Tu pourras quitter le classement quand tu veux.</p><button type="button" class="btn large beurre" data-a="cl-rejoindre"><b>Rejoindre le classement</b></button></div>`;
    const pied = ferme || !r.rejoint ? '' : `<p class="cl-moi">Tu joues sous le pseudo <b>${esc(r.pseudo)}</b>.</p><button type="button" class="btn large clair" data-a="cl-pseudo"><b>Changer de pseudo</b></button><button type="button" class="lien cl-quitter" data-a="cl-quitter">Quitter le classement</button>`;
    dernierHtmlCl = `<div class="cl" data-cl="liste"><div class="cl-tete"><span class="pic">${ICONS.UI.podium}</span><div><h2>Classement</h2><p class="sous">Les boulangers qui ont le lien du jeu, classés en points de boulanger : la façon de jouer, pas la fortune. Chaque semaine, les trois premiers gagnent une tenue et une coupe.${classement.copains() && classement.objectifVu() ? ' Touche un copain pour visiter sa boutique.' : ''}</p></div></div>${carteObjectif()}${carteRecompenses()}${blocPoints()}${invitation}${seg}${corps}${pied}${btnRetour()}</div>`;
    return dernierHtmlCl;
  }
  function listeClassement(d, r) {
    const semaine = ongletCl === 'semaine';
    const enPoints = d.version >= 3; // un serveur encore en version 2 classe à l'argent : on l'affiche comme avant
    const hantee = !!HTE && ongletCl === HTE.cle, fh = hantee ? HT.fenetre(HORLOGE.maintenant()) : null;
    const quartier = ongletCl === 'quartier' || hantee, fq = hantee ? fh : QT ? QT.fenetre(HORLOGE.maintenant()) : null;
    const info = hantee ? (fh.fini ? 'La Maison hantée est finie : le podium final est figé' : 'Les bonbons gagnés au manoir · podium final le 2 nov. à 20 h') : quartier ? (fq && fq.fini ? 'Le Quartier est fini : le podium final est figé' : `Les billets gagnés dans la Planque · podium final le 27 oct. à midi`) : semaine ? `Depuis lundi${d.semaine ? ' ' + CLM.dateCourte(d.semaine) : ''} · remis à zéro chaque lundi` : enPoints ? 'Tous les points depuis l’arrivée au classement' : 'Tout l’argent gagné depuis l’arrivée au classement';
    const val = (l) => (hantee ? `<b class="cl-val">${HT.fmt(l.valeur)}<small>bonbons</small></b>` : quartier ? `<b class="cl-val">${G.fmtEur(l.valeur)}<small>billets</small></b>` : enPoints && l.points != null ? `<b class="cl-val">${pts(l.points)}<small>${G.fmtEur(l.valeur)}</small></b>` : `<b class="cl-val">${G.fmtEur(l.valeur)}</b>`);
    const enLigne = d.enLigneN > 0 ? `<span class="cl-n-ligne"><i class="cl-en-ligne"></i>${d.enLigneN} en ligne</span>` : ''; // ceux qui ont le jeu ouvert en ce moment (vus depuis moins de 4 min ; serveur v5)
    const tete = `<div class="cl-info"><span>${info}</span>${enLigne}<b>${CLM.boulangers(d.joueurs)}</b></div>`
      + (r.rejoint && d.moi && d.moi.rang > 5 ? `<div class="cl-place"><span class="cl-rang${d.moi.rang <= 3 ? ' r' + d.moi.rang : ''}">${d.moi.rang}<small>${d.moi.rang === 1 ? 'er' : 'e'}</small></span><span><b>Ta place ${semaine ? 'cette semaine' : 'de tous les temps'}</b><small>sur ${CLM.boulangers(d.joueurs)}</small></span>${val(d.moi)}</div>` : ''); // sa place d'un coup d'œil quand sa ligne est loin dans la liste
    if (!d.lignes.length) return `${tete}<div class="cl-etat"><span class="pic">${ICONS.UI.podium}</span><b>${hantee ? 'Personne encore au manoir' : quartier ? 'Personne encore au Quartier' : semaine ? 'Personne encore cette semaine' : 'Personne encore'}</b><span>${hantee ? 'Les bonbons du manoir arrivent avec le prochain envoi.' : quartier ? 'Les billets de la Planque arrivent avec le prochain envoi.' : r.rejoint ? 'Tes points arrivent dans un instant.' : 'Rejoins le classement et ouvre le bal !'}</span></div>`;
    const visites = classement.copains(); // classement v6 : toucher la ligne d'un copain ouvre sa boutique
    const ligne = (l, moi) => `<li class="cl-ligne${moi ? ' moi' : visites ? ' visitable' : ''}"${moi ? ' aria-current="true"' : visites ? ` data-visite="${esc(l.pseudo)}" role="button" tabindex="0" aria-label="Visiter la boutique de ${esc(l.pseudo)}"` : ''}><span class="cl-rang${l.rang <= 3 ? ' r' + l.rang : ''}">${l.rang}<small>${l.rang === 1 ? 'er' : 'e'}</small></span><span class="cl-nom">${l.enLigne || (moi && d.enLigneN > 0) ? '<i class="cl-en-ligne" role="img" aria-label="en ligne" title="En ligne"></i>' : ''}<span>${esc(l.pseudo)}</span>${quartier ? (l.podium ? `<i class="tag">${rangDe(l.podium)} ${hantee ? 'du manoir' : 'du Quartier'}</i>` : '') : toqueDe(l.podium, l.toque, moi)}${moi ? '<i class="tag">toi</i>' : ''}</span>${val(l)}${!moi && visites ? `<i class="cl-chev" aria-hidden="true">${ICONS.UI.chevron}</i>` : ''}</li>`;
    let html = d.lignes.map((l) => ligne(l, l.moi && r.rejoint)).join('');
    if (r.rejoint && d.moi && !d.lignes.some((l) => l.moi)) html += `<li class="cl-sep" aria-hidden="true"><i></i><i></i><i></i></li>${ligne({ rang: d.moi.rang, pseudo: r.pseudo, points: d.moi.points, valeur: d.moi.valeur, podium: d.moi.podium }, true)}`; // loin derrière : sa ligne quand même, sous les 50 premiers
    const absent = r.rejoint && !d.moi ? `<p class="note">${semaine ? 'Tu n’apparais pas encore cette semaine : tes points partent dès que le réseau le permet.' : 'Tes points ne sont pas encore arrivés : ils partent dès que le réseau le permet.'}</p>` : '';
    return `${tete}<ol class="cl-liste" aria-label="${semaine ? 'Classement de la semaine' : 'Classement de tous les temps'}">${html}</ol>${absent}`;
  }
  function etatClassement(e) {
    const t = {
      'hors-ligne': [ICONS.UI.horsLigne, 'Pas de réseau', 'Le classement revient dès que le téléphone est connecté. Ta boutique, elle, tourne toujours.', true],
      'lent': [ICONS.UI.horsLigne, 'Le classement est lent à répondre', 'Le four met du temps à chauffer : réessaie dans un instant. Ta boutique, elle, tourne toujours.', true],
      'pas-ouvert': [ICONS.UI.podium, 'Le classement ouvre bientôt', 'Le four préchauffe : reviens dans quelques jours pour te mesurer aux autres boulangers.', false],
    }[e] || [ICONS.UI.horsLigne, 'Le classement ne répond pas', 'Un petit souci de fournée. Réessaie dans un moment.', true];
    return `<div class="cl-etat ${e}" role="status"><span class="pic">${t[0]}</span><b>${t[1]}</b><span>${t[2]}</span>${t[3] ? '<button type="button" class="btn clair" data-a="cl-reessayer"><b>Réessayer</b></button>' : ''}</div>`;
  }
  function lierClassement() {
    on('[data-tab]', (b) => {
      if (b.dataset.tab === ongletCl) return;
      son.tap(); ongletCl = b.dataset.tab; rafraichirClassement(true);
      const c = classement.cache(ongletCl); if (!c || c.etat !== 'ok' || HORLOGE.maintenant() - c.quand > 30e3) classement.charger(ongletCl); // c.quand est daté par l'horloge de confiance
    });
    on('[data-a="cl-reessayer"]', () => { son.tap(); classement.ouvrir(ongletCl); });
    on('[data-a="cl-rejoindre"]', () => { son.tap(); sheetPseudo(false); });
    on('[data-a="cl-pseudo"]', () => { son.tap(); sheetPseudo(true); });
    on('[data-a="cl-quitter"]', () => { son.tap(); sheetQuitter(true); });
    on('[data-a="cl-recompenses"]', () => { son.tap(); sheetRecompenses(true); });
    on('[data-a="close"]', closeSheet);
    fc.querySelectorAll('[data-visite]').forEach((li) => { // visiter la boutique d'un copain (classement v6)
      li.addEventListener('click', () => visiter(li.dataset.visite, true));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); visiter(li.dataset.visite, true); } });
    });
  }
  // ─── les récompenses du podium : chaque semaine, les trois premiers gagnent une tenue (toque et tablier) et une coupe, or, argent ou bronze ───
  // Portées d'office la semaine qui suit le podium (tenue « automatique »), puis gardées à vie : la coupe dans la vitrine des trophées, la tenue
  // dans la collection, où l'on remet celle qu'on veut. Le moteur (src/classement.js) les lit au lancement et à l'ouverture de la feuille.
  const NOM_METAL = { or: 'or', argent: 'argent', bronze: 'bronze' }, DE_METAL = { or: 'd’or', argent: 'd’argent', bronze: 'de bronze' };
  const rangDe = (n) => (n === 1 ? '1er' : `${n}e`);
  function recVue() { try { return classement ? classement.recompenses() : null; } catch (e) { return null; } }
  // ce que porte le boulanger : la garde-robe (src/game.js), pièce par pièce ; les tenues du podium y sont des pièces comme les autres
  const tenueVue = () => G.tenueBoulanger(st);
  function toqueDe(podium, toque, moi) { // la petite toque à côté d'un pseudo : la pièce de tête portée si elle vient d'un podium (la sienne, lue sur le téléphone ; celle des autres, si le serveur la donne), sinon le podium de la semaine passée
    const porte = moi ? G.toqueMetal(st) : CLM && CLM.METAUX.includes(toque) ? toque : null, m = porte || (CLM && CLM.metal(podium)); if (!m) return '';
    const titre = porte ? `Toque ${DE_METAL[m]}${podium ? `, ${rangDe(podium)} la semaine dernière` : ''}` : `${rangDe(podium)} la semaine dernière`;
    return `<i class="cl-toque ${m}" role="img" aria-label="${titre}" title="${titre}">${ICONS.toque(m)}</i>`;
  }
  let derniereRecScene = '', annonceOuverte = false, annonceMinuteur = 0;
  function majRecompenses() { // la boutique en 3D suit les récompenses, chaque podium met ses quatre pièces dans la garde-robe, et l'annonce attend que plus rien ne soit ouvert
    const r = recVue(); if (!r) return;
    let neuves = 0; for (const m of r.coupes) neuves += G.donnerCollection(st, m).length; // un podium gagné = les quatre pièces de sa collection (or, argent ou bronze), une fois pour toutes
    if ([1, 2, 3].includes(r.quartier)) { const n = G.donnerCollection(st, 'quartier-or').length; if (n) { neuves += n; toast('Podium final du Quartier : la tenue du quartier en or est dans ta garde-robe !'); } } // le podium final de l'événement « Le Quartier », à vie
    const xh = HTE ? r[HTE.cle] || (r.evenements && r.evenements[HTE.cle]) : null, rh = typeof xh === 'number' ? xh : xh && xh.rang; // classement v5 : evenements.hantee = { rang, podium }
    if ([1, 2, 3].includes(rh)) { const n = G.donnerCollection(st, `${HTE.cle}-or`).length; if (n) { neuves += n; toast('Podium final de la Maison hantée : la tenue d’Halloween en or est dans ta garde-robe !'); } } // le podium final de la Maison hantée, à vie
    if (neuves) { save(); if (pageActive === 'boulanger') { lastPage = ''; renderPage(true); } }
    if (visite && visite.scene) return; // la scène montre la boutique du copain : les siennes reviennent au retour
    const k = `${r.portee}|${r.coupe}|${r.coupes.join(',')}|${r.badge ? 'e' : ''}`;
    if (k !== derniereRecScene) { derniereRecScene = k; SCENE.recompenses({ tenue: r.portee, coupe: r.coupe, coupes: r.coupes, equipe: !!r.badge }); if (pageActive === 'boulanger') renderPage(); }
    if (r.annonce && !annonceOuverte) tenterAnnonce();
  }
  function tenterAnnonce() { // au premier lancement après un podium, une fois la feuille du retour (gains d'absence) refermée
    clearTimeout(annonceMinuteur); annonceMinuteur = 0;
    const r = recVue(); if (!r || !r.annonce || annonceOuverte) return;
    if (!feuille.hidden || document.hidden || visite) { annonceMinuteur = setTimeout(tenterAnnonce, 1500); return; }
    sheetAnnonce(r.annonce);
  }
  function sheetAnnonce(a) {
    const m = a.metal, n = DE_METAL[m], r = recVue(), recent = !!r && a.semaine === CLM.decalerSemaine(r.lundi, -1); // recent : le podium de la semaine passée (sinon, un plus ancien découvert maintenant)
    annonceOuverte = true;
    G.donnerCollection(st, m); if (recent) { G.equiperCollection(st, m); renderCards(true); hud(); } save(); // la tenue du podium de la semaine passée se porte d'office (on en change dans la garde-robe) ; un podium plus ancien la range seulement
    openSheet(`<div class="cl rec-annonce" data-cl="annonce"><div class="rec-scene ${m}" aria-hidden="true"><i class="rec-rayons"></i><span class="rec-coupe">${ICONS.coupe(m)}</span><span class="rec-boulanger">${ICONS.boulanger(1, m)}</span></div>
      <h2>Bravo ! ${rangDe(a.rang)} de la semaine</h2>
      <p class="rec-phrase">La tenue ${n} et la coupe ${n} sont à toi.</p>
      <p class="sous">Semaine du ${CLM.dateCourte(a.semaine)} : ${recent ? `ton boulanger porte la tenue ${n} cette semaine, la coupe trône sur le comptoir. Les quatre pièces restent à toi dans ta garde-robe.` : `la coupe est dans ta vitrine, les quatre pièces de la tenue dans ta garde-robe.`}${a.autres ? ` Et ${a.autres === 1 ? 'un autre podium t’attendait' : `${a.autres} autres podiums t’attendaient`} : ${a.autres === 1 ? 'sa tenue est' : 'leurs tenues sont'} dans ta garde-robe.` : ''}</p>
      <button type="button" class="btn large beurre" data-a="rec-voir"><b>Voir ma boutique</b></button>
      <button type="button" class="btn large clair" data-a="rec-collection" style="margin-top:8px"><b>Mes récompenses</b></button></div>`);
    vueCl = 'annonce';
    classement.annonceFaite(a.semaine); // annoncée une fois : la tenue de ce podium se porte d'office
    let touche = true; try { touche = !navigator.userActivation || navigator.userActivation.hasBeenActive; } catch (e) { /* rien */ }
    son.deblocage(); if (touche) buzz([20, 40, 20, 40, 30]); SCENE.fete(); confettis(1.2); // au lancement, avant toute touche, le navigateur refuse la vibration : on s'en passe
    const fin = () => { annonceOuverte = false; };
    on('[data-a="rec-voir"]', () => { son.tap(); fin(); closeSheet(); if (pageActive !== 'boutique') showPage('boutique'); tiroir.aller('ferme'); });
    on('[data-a="rec-collection"]', () => { son.tap(); fin(); sheetRecompenses(); });
    const surFermeture = setInterval(() => { if (feuille.hidden || vueCl !== 'annonce') { fin(); clearInterval(surFermeture); } }, 500);
  }
  // l'entrée « Mes récompenses », en tête de la feuille du classement et dans l'onglet Boulanger (seulement après un premier podium)
  const cleRecompenses = () => { const r = recVue(); return r ? `${r.podiums.length}|${G.toqueMetal(st)}` : ''; };
  function carteRecompenses() {
    const r = recVue(); if (!r || !r.podiums.length) return '';
    const n = r.podiums.length, dernieres = r.podiums.slice(-5).map((p) => `<i class="rec-mini">${ICONS.coupe(CLM.metal(p.rang))}</i>`).join('');
    const tm = G.toqueMetal(st), porte = tm ? `toque ${DE_METAL[tm]}` : 'toque blanche';
    return `<button type="button" class="rec-entree" data-a="cl-recompenses"><span class="rec-minis" aria-hidden="true">${dernieres}</span><span><b>Mes récompenses</b><small>${n} coupe${n > 1 ? 's' : ''} · ${porte}</small></span><i class="ico chev">${ICONS.UI.chevron}</i></button>`;
  }
  // la collection : chaque coupe et sa tenue, avec sa semaine ; la tenue se choisit pièce par pièce dans la garde-robe (onglet Boulanger)
  function sheetRecompenses(depuisCl) { // depuisCl : ouverte depuis la feuille du classement, on y revient
    if (!classement) return;
    const r = recVue(), tm = G.toqueMetal(st), tenue = tenueVue();
    for (const m of r.coupes) G.donnerCollection(st, m); // au cas où la garde-robe n'aurait pas encore reçu un podium
    const coupes = r.podiums.slice().reverse().map((p) => { const m = CLM.metal(p.rang); return `<li class="rec-carte ${m}"><span class="rec-icone">${ICONS.coupe(m)}</span><b>${rangDe(p.rang)}</b><small>Coupe et tenue ${DE_METAL[m]}</small><small>Semaine du ${CLM.dateCourte(p.semaine)}</small></li>`; }).join('');
    const vide = !r.podiums.length ? '<div class="cl-etat"><span class="pic">' + ICONS.coupe('or') + '</span><b>Pas encore de coupe</b><span>Termine la semaine dans les trois premiers du classement : une tenue et une coupe t’attendent.</span></div>' : '';
    const pieces = tenue ? ['tete', 'haut', 'pieds', 'accessoire'].map((p) => { const v = G.vetement(G.garderobe(st).equipe[p]); return v ? esc(v.nom.toLowerCase()) : null; }).filter(Boolean).join(', ') : '';
    openSheet(`<div class="cl" data-cl="recompenses"><div class="cl-tete"><span class="pic">${ICONS.coupe(r.coupes.length ? r.coupes[r.coupes.length - 1] : 'or')}</span><div><h2>Mes récompenses</h2><p class="sous">Les trois premiers de chaque semaine gagnent une tenue (toque, tablier, chaussures, foulard) et une coupe, à garder pour toujours.</p></div></div>
      ${vide}${r.podiums.length ? `<h3 class="titre-section">La vitrine des trophées</h3><ul class="rec-coupes" aria-label="Mes coupes">${coupes}</ul>
      <h3 class="titre-section" id="rec-titre-tenue">La tenue du boulanger</h3>
      <div class="rec-apercu" aria-hidden="true">${ICONS.boulanger(G.rangTitre(st), tenue)}<span>${tm ? `Il porte la toque ${DE_METAL[tm]}` : 'Il porte la toque blanche'}${pieces ? ` : ${pieces}.` : '.'}</span></div>
      <button type="button" class="btn large clair" data-a="rec-garderobe" style="margin-top:8px"><b>Ouvrir la garde-robe</b></button>` : ''}
      ${depuisCl ? '<button type="button" class="btn large sombre" data-a="cl-retour" style="margin-top:14px"><b>Retour au classement</b></button>' : btnRetour()}</div>`);
    vueCl = 'recompenses';
    on('[data-a="rec-garderobe"]', () => { son.tap(); if (GRU) GRU.ouvrir(ctxGarderobe(), 'tete'); });
    on('[data-a="cl-retour"]', () => { son.tap(); sheetClassement(); });
    on('[data-a="close"]', closeSheet);
  }
  // rejoindre (la première fois) ou changer de pseudo : validation en direct, « déjà pris » après l'envoi
  function sheetPseudo(changer) {
    const r = classement.resume(), nomBtn = changer ? 'Garder ce pseudo' : 'Rejoindre';
    openSheet(`<div class="cl" data-cl="pseudo"><div class="cl-tete"><span class="pic">${ICONS.UI.podium}</span><div><h2>${changer ? 'Changer de pseudo' : 'Rejoindre le classement'}</h2></div></div>
      <p class="sous">${changer ? 'Le nouveau pseudo remplace l’ancien dans le classement, tes points ne bougent pas.' : 'Choisis un pseudo : c’est lui que verront les autres boulangers, pas le nom de ta boutique. À côté s’afficheront tes points de boulanger (cette semaine, et depuis ton arrivée) et, en petit, l’argent que tu gagnes à partir de maintenant.'}</p>
      <label class="cl-label" for="cl-champ">Ton pseudo</label>
      <input id="cl-champ" class="champ" type="text" maxlength="24" value="${esc(r.pseudo || '')}" placeholder="Par exemple : Mamie Jo" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-describedby="cl-aide">
      <p id="cl-aide" class="cl-aide" aria-live="polite"></p>
      <button type="button" class="btn large beurre" data-a="cl-valider"><b>${nomBtn}</b></button>
      <button type="button" class="btn large clair" data-a="cl-annuler" style="margin-top:8px"><b>Annuler</b></button></div>`);
    vueCl = 'pseudo';
    const champ = fc.querySelector('#cl-champ'), aide = fc.querySelector('#cl-aide'), btn = fc.querySelector('[data-a="cl-valider"]');
    let envoi = false, annule = false; // annule : « Annuler » touché pendant l'envoi, le moteur n'enverra pas le pseudo s'il attend encore son tour
    const dire = (txt, ton) => { aide.textContent = txt; aide.className = 'cl-aide' + (ton ? ' ' + ton : ''); };
    const verifier = () => {
      const v = CLM.verifierPseudo(champ.value), pareil = changer && v.ok && v.pseudo === r.pseudo, bon = v.ok && !pareil, tape = champ.value.trim() !== '';
      btn.classList.toggle('non', !bon); btn.setAttribute('aria-disabled', String(!bon)); champ.setAttribute('aria-invalid', String(tape && !v.ok));
      dire(pareil ? 'C’est déjà ton pseudo.' : CLM.messagePseudo(v), bon ? 'bon' : tape && !pareil ? 'erreur' : '');
      return bon ? v : null;
    };
    verifier();
    champ.addEventListener('input', () => { if (!envoi) verifier(); });
    const valider = async () => {
      if (envoi) return;
      const v = verifier(); if (!v) { son.non(); champ.focus(); return; }
      envoi = true; champ.readOnly = true; btn.classList.add('non'); btn.setAttribute('aria-busy', 'true'); btn.querySelector('b').textContent = 'Un instant…'; dire('On envoie ton pseudo au classement…', '');
      const res = await classement.choisirPseudo(v.pseudo, {
        annule: () => annule,
        attente: () => { if (!annule && vueCl === 'pseudo' && fc.contains(champ)) dire('Encore quelques secondes : le classement prend un envoi toutes les 10 s…', ''); },
      });
      if (res.etat === 'annule') return; // le joueur a annulé : rien n'est parti, la liste est déjà revenue
      envoi = false; champ.readOnly = false; btn.removeAttribute('aria-busy'); btn.querySelector('b').textContent = nomBtn;
      const ici = vueCl === 'pseudo' && fc.contains(champ);
      if (res.etat === 'ok') { son.deblocage(); buzz([10, 30, 10]); toast(changer ? `Ton nouveau pseudo au classement\u00A0: «\u00A0${v.pseudo}\u00A0»` : `Bienvenue au classement, ${v.pseudo}\u00A0!`); if (ici) sheetClassement(); return; }
      const msg = res.etat === 'refus' ? ({ pseudo_pris: `«\u00A0${v.pseudo}\u00A0» est déjà pris : essaie une variante.`, pseudo_invalide: 'Ce pseudo n’est pas accepté : lettres, chiffres, espaces, - _ \' . seulement.', complet: 'Le classement est complet pour le moment : reviens un peu plus tard.', trop_vite: 'Beaucoup de nouveaux boulangers d’un coup : réessaie dans quelques minutes.' }[res.erreur] || 'Le classement a refusé l’envoi. Réessaie dans un moment.') : msgReseau(res.etat);
      son.non();
      if (!ici) { toast(msg); return; } // la feuille a été fermée entre-temps
      verifier(); dire(msg, 'erreur'); champ.focus();
    };
    on('[data-a="cl-valider"]', valider); on('[data-a="cl-annuler"]', () => { annule = true; sheetClassement(); });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
    setTimeout(() => { try { champ.focus(); if (changer) champ.select(); } catch (e) { /* rien */ } }, 50);
  }
  function sheetQuitter(depuisCl) { // depuisCl : ouverte depuis la feuille du classement, on y revient ; depuis les Réglages, on referme
    const r = classement.resume();
    openSheet(`<div class="cl" data-cl="quitter"><h2>Quitter le classement ?</h2><p class="sous">«\u00A0${esc(r.pseudo)}\u00A0» et ta fortune disparaissent du classement. Ta boutique ne change pas, et tu pourras revenir quand tu veux.</p>
      <button type="button" class="btn large rouge" data-a="cl-oui"><b>Oui, quitter le classement</b></button>
      <button type="button" class="btn large clair" data-a="cl-non" style="margin-top:8px"><b>Non, je reste</b></button>
      <p id="cl-aide" class="cl-aide" aria-live="polite"></p></div>`);
    vueCl = 'quitter';
    let envoi = false;
    on('[data-a="cl-non"]', () => (depuisCl ? sheetClassement() : closeSheet()));
    on('[data-a="cl-oui"]', async (b) => {
      if (envoi) return; envoi = true; b.classList.add('non'); b.querySelector('b').textContent = 'Un instant…';
      const res = await classement.quitter(); envoi = false;
      const ici = vueCl === 'quitter' && fc.contains(b);
      if (res.etat === 'ok') { toast('Tu as quitté le classement. À bientôt !'); if (ici) { if (depuisCl) sheetClassement(); else closeSheet(); } majCoin(); lastPage = ''; renderPage(true); return; }
      son.non(); b.classList.remove('non'); b.querySelector('b').textContent = 'Oui, quitter le classement';
      if (!ici) { toast(msgReseau(res.etat)); return; }
      const aide = fc.querySelector('#cl-aide'); aide.textContent = msgReseau(res.etat); aide.className = 'cl-aide erreur';
    });
  }

  // ─── les copains (classement v6) : visiter la boutique d'un copain, lui laisser un pourboire, l'objectif commun, les pourboires reçus ───
  // La visite montre la VRAIE scène 3D, en lecture seule : un état rebâti depuis la photo du copain (CLASSEMENT.boutiqueDepuisPhoto) prend la
  // place du sien dans SCENE.frame tant que l'écran est ouvert. Sa boutique à lui continue de tourner (G.tick), sans événement, client mystère
  // ni vente à l'écran ; rien de la visite n'est sauvé ; un voile capte toutes les touches. Au retour, ses récompenses, ses décos et son chat reviennent.
  // Sans 3D, ou sans photo (le copain n'a pas encore joué depuis la mise à jour), une carte texte. Un serveur v5 : les lignes ne se touchent pas.
  let visite = null; // { pseudo, depuisCl, charge, etat, data (la réponse de fournil_boutique), b (la boutique rebâtie), scene (la 3D montre b), tiroir, envoi }
  const nomQuartier = (q) => { const x = G.QUARTIERS[(q | 0) % G.QUARTIERS.length]; return x ? x.nom : ''; };
  async function visiter(pseudo, depuisCl) {
    if (!classement || visite || !pseudo) return;
    audio(); son.tap();
    visite = { pseudo: String(pseudo), depuisCl: !!depuisCl, charge: true, etat: '', data: null, b: null, scene: false, tiroir: tiroir.pos, envoi: false };
    closeSheet(); vueCl = '';
    $('#visite').hidden = false; document.body.classList.add('visite');
    peindreVisite();
    const v = visite, r = await classement.boutique(v.pseudo);
    if (visite !== v) return; // refermée pendant la lecture
    v.charge = false; v.etat = r.etat; v.data = r.etat === 'ok' ? r.data : null;
    const ph = v.data && v.data.photo; v.b = ph ? CLM.boutiqueDepuisPhoto(ph, { G, maintenant: HORLOGE.maintenant() }) : null;
    v.scene = !!v.b && !!(SCENE.stats && SCENE.stats.webgl);
    if (v.scene) { // sa boutique à lui, à la place de la sienne : ses coupes, son badge, ses décos, son chat ; le tiroir replié, la scène entière
      amenager(false); tiroir.aller('ferme', false);
      SCENE.recompenses({ tenue: null, coupe: null, coupes: v.b.coupes, equipe: v.b.badge }); SCENE.decosQuartier(v.b.decosQuartier); SCENE.decosHantee(v.b.decosHantee); const idv = v.b.compagnon || (v.b.st && v.b.st.compagnon); // son compagnon (l'id, si la photo le porte), sinon son chat, roux ou noir
      if (SCENE.compagnon) SCENE.compagnon(G.compagnon(idv) ? idv : G.modeleCompagnon(v.b.st, false)); else if (SCENE.pelageChat) SCENE.pelageChat(v.b.pelage);
    }
    peindreVisite();
  }
  function finVisite(versCl) {
    if (!visite) return; const v = visite; visite = null;
    $('#visite').hidden = true; document.body.classList.remove('visite'); $('#vi-vue').innerHTML = ''; $('#vi-bas').innerHTML = '';
    if (v.scene) { // tout ce que la scène montrait de lui revient à soi
      derniereRecScene = ''; majRecompenses(); SCENE.decosQuartier(st.quartier ? st.quartier.decos : []); SCENE.decosHantee(HTE && st[HTE.cle] ? st[HTE.cle].decos : []);
      dernierModele = ''; majChat(); tiroir.aller(v.tiroir, false);
    }
    lastFrame = performance.now();
    if (v.depuisCl && versCl !== false && classement) sheetClassement();
  }
  function carteVisite(v) { // le milieu de l'écran sans la scène : on frappe à la porte, la boutique sans photo, sans 3D, ou une erreur
    const d = v.data, ph = d && d.photo, carte = (pic, titre, txt, plus) => `<div class="vi-carte"><span class="pic">${pic}</span><b>${titre}</b>${txt ? `<span>${txt}</span>` : ''}${plus || ''}</div>`;
    if (v.charge) return carte(ICONS.UI.boutique, 'On frappe à la porte…', `La boutique de ${esc(v.pseudo)} va s’ouvrir.`);
    if (v.etat === 'pas-installe') return carte(ICONS.UI.boutique, 'Les visites arrivent bientôt', 'Le classement n’a pas encore la mise à jour des copains. Reviens dans quelques jours.');
    if (v.etat === 'refus') return carte(ICONS.UI.boutique, 'Cette boutique a fermé ses portes', `${esc(v.pseudo)} n’est plus au classement.`);
    if (!d) return carte(ICONS.UI.horsLigne, 'La porte ne s’ouvre pas', esc(msgReseau(v.etat)), '<button type="button" class="btn clair" data-vi="reessayer"><b>Réessayer</b></button>');
    if (!v.b) return carte(ICONS.UI.boutique, 'Pas encore ouverte aux visites', `La boutique de ${esc(v.pseudo)} apparaîtra après sa prochaine partie. Tu peux déjà lui laisser un pourboire.`);
    const s = v.b.st, postes = s.stations.filter((x) => x.niv > 0).length, apprentis = s.stations.filter((x) => x.staff).length, crans = G.MOBILIER.reduce((n, m) => n + G.mobilierCran(s, m.id), 0), max = G.MOBILIER.reduce((n, m) => n + m.max, 0);
    const li = [`Niveau ${G.niveau(s)} · ${esc(G.titre(s))}`, `${postes} recette${postes > 1 ? 's' : ''} au four · ${apprentis} apprenti${apprentis > 1 ? 's' : ''}`, `Mobilier : ${crans} cran${crans > 1 ? 's' : ''} sur ${max}`];
    if (s.chat) li.push(`Le compagnon : ${esc(s.chat.nom)}`); if (v.b.coupes.length) li.push(`${v.b.coupes.length} coupe${v.b.coupes.length > 1 ? 's' : ''} en vitrine`); if (v.b.badge) li.push('Le badge « Esprit d’équipe »');
    return carte(ICONS.UI.boutique, esc(v.b.nom), esc(nomQuartier(ph.q)), `<ul>${li.map((x) => `<li>${x}</li>`).join('')}</ul>`);
  }
  function basVisite(v) { // le pourboire (avec ses restants du jour) et le retour
    let pb = '';
    if (!v.charge && v.etat === 'ok' && classement.copains()) {
      const r = classement.resume(), dn = classement.dons(), deja = dn.deja(v.pseudo), reste = `encore ${dn.restants} aujourd’hui`;
      if (!r.rejoint) pb = `<p class="vi-note">Rejoins le classement pour laisser un pourboire à ${esc(v.pseudo)}.</p>`;
      else if (deja) pb = `<button type="button" class="btn large menthe" data-vi="pourboire" aria-disabled="true"><b>Pourboire laissé ✓</b><small>${dn.restants ? `${reste} pour d’autres copains` : 'tes 3 pourboires du jour sont donnés'}</small></button>`;
      else if (!dn.restants) pb = `<button type="button" class="btn large non" data-vi="pourboire" aria-disabled="true"><b>Plus de pourboire aujourd’hui</b><small>3 par jour : reviens demain</small></button>`;
      else pb = `<button type="button" class="btn large beurre" data-vi="pourboire"${v.envoi ? ' aria-busy="true"' : ''}><b>${v.envoi ? 'Un instant…' : 'Laisser un pourboire'}</b><small>${reste} · +1 étoile pour toi</small></button>`;
    }
    return `${pb}<button type="button" class="btn large sombre" data-vi="retour"><b>Retour</b></button>`;
  }
  function peindreVisite() {
    const v = visite; if (!v) return;
    const d = v.data, ph = d && d.photo, vue = $('#vi-vue');
    $('#vi-titre').textContent = `La boutique de ${v.pseudo}`;
    $('#vi-sous').textContent = v.charge ? 'On frappe à la porte…' : d ? `${d.enLigne ? 'En ligne · ' : ''}${v.b ? `${v.b.nom} · ${nomQuartier(ph.q)}` : 'Visite'}` : '';
    $('#vi-ligne').hidden = !(d && d.enLigne);
    vue.classList.toggle('carte', !v.scene);
    vue.innerHTML = v.scene ? `<span class="vi-enseigne">${esc(v.b.nom)}</span><span class="vi-lecture"><i class="ico">${ICONS.UI.oeil}</i>Tu visites : rien ne change chez ${esc(v.pseudo)}</span>` : carteVisite(v);
    $('#vi-bas').innerHTML = basVisite(v);
    document.querySelectorAll('#visite [data-vi]').forEach((b) => { b.onclick = () => clicVisite(b); });
  }
  async function clicVisite(b) {
    const v = visite; if (!v) return; audio();
    const a = b.dataset.vi;
    if (a === 'retour') { son.tap(); finVisite(); return; }
    if (a === 'reessayer') { son.tap(); const p = v.pseudo, cl = v.depuisCl; visite = null; visiter(p, cl); return; }
    if (a !== 'pourboire') return;
    if (b.getAttribute('aria-disabled') === 'true') { son.non(); return; }
    if (v.envoi) return;
    v.envoi = true; peindreVisite();
    const r = await classement.pourboire(v.pseudo); v.envoi = false;
    if (visite !== v) return;
    if (r.etat === 'ok') { st.etoiles++; save(); hud(); son.deblocage(); buzz([10, 30, 10]); confettis(0.5); if (v.scene && SCENE.texte) SCENE.texte('Merci !'); toast(`Pourboire laissé à ${v.pseudo} ! +1 étoile pour toi (+${Math.round(G.ETOILE_BONUS * 100)} % de gains, pour toujours).`); } // un pourboire donné : une étoile (plus de point de classement depuis le SQL 6.1)
    else {
      son.non();
      toast(r.etat === 'refus' ? ({ deja: `Tu as déjà laissé un pourboire à ${v.pseudo} aujourd’hui.`, quota: 'Tes 3 pourboires du jour sont donnés : reviens demain.', soi: 'C’est ta propre boutique !', inconnu: 'Cette boutique a fermé ses portes.', jeton: 'Ton inscription au classement a changé : rouvre le classement.' }[r.erreur] || 'Le pourboire n’est pas passé. Réessaie dans un moment.')
        : r.etat === 'pas-installe' ? 'Les pourboires arrivent bientôt.' : r.etat === 'pas-rejoint' ? 'Rejoins le classement pour laisser un pourboire.' : msgReseau(r.etat));
    }
    peindreVisite();
  }
  // l'objectif commun de la semaine : une carte en tête de la feuille du classement (la jauge, « À nous tous : X / Y croissants »)
  function carteObjectif() {
    const o = classement && classement.copains() ? classement.objectifVu() : null; if (!o || o.etat !== 'ok') return '';
    const d = o.data, pc = Math.max(0, Math.min(100, d.pourcent)), fmt = (n) => Math.round(n).toLocaleString('fr-FR');
    return `<div class="obj-carte${d.reussi ? ' reussi' : ''}" role="group" aria-label="Objectif commun de la semaine"><span class="pic">${ICONS.UI.equipe}</span><div class="obj-corps">
      <div class="obj-tete"><b>Objectif commun</b><small>${d.reussi ? 'réussi cette semaine ✓' : `cette semaine${d.joueurs ? ` · ${CLM.boulangers(d.joueurs)}` : ''}`}</small></div>
      <div class="obj-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pc)}"><i style="width:${pc.toFixed(1)}%"></i></div>
      <p>À nous tous : <b>${fmt(d.total)} / ${fmt(d.but)}</b> croissants</p>
      <small>${d.reussi ? 'Lundi, chacun de ceux qui ont marqué 30 points cette semaine reçoit un boost ×5 et le badge « Esprit d’équipe ».' : 'Chaque point de boulanger compte. Réussi : un boost ×5 et le badge « Esprit d’équipe » pour qui a marqué 30 points cette semaine.'}</small></div></div>`;
  }
  // à l'ouverture : « X t'a laissé un pourboire ! » (un boost ×2 de 10 min dans la réserve, 3 par jour au plus), puis la récompense de l'objectif
  // commun réussi (un boost ×5 de 15 min et le badge « Esprit d'équipe ») ; chacune attend que plus rien ne soit ouvert
  let copainsOuvert = false, copainsMinuteur = 0;
  function tenterCopains() {
    clearTimeout(copainsMinuteur); copainsMinuteur = 0;
    if (!classement || copainsOuvert || !st) return;
    const recus = classement.pourboiresRecus(), r = recVue(), obj = r && r.objectifAnnonce;
    if (!recus.length && !obj) return;
    if (!feuille.hidden || document.hidden || visite || annonceOuverte || retourEnCours || MINIJEUX.ouvert || (EVS && EVS.ouvert) || (AR && AR.ouvert)) { copainsMinuteur = setTimeout(tenterCopains, 1500); return; }
    if (recus.length) sheetPourboireRecu(); else sheetObjectifReussi(obj);
  }
  function indexBoost(mult, secs) { const l = (st.boosts && st.boosts.reserve) || []; for (let k = l.length - 1; k >= 0; k--) if (l[k].mult === mult && l[k].secs === secs) return k; return -1; }
  function feuilleCopain(html, mult, secs, n) { // la feuille commune : un bouton pour lancer tout de suite le boost reçu, ou plus tard
    const actif = st.boosts && st.boosts.actif && st.boosts.actif.fin > st.now;
    openSheet(`${html}${n && !actif ? `<button type="button" class="btn large beurre" data-a="cp-lancer"><b>Lancer le boost ×${mult}</b></button><button type="button" class="btn large clair" data-a="cp-plus-tard" style="margin-top:8px"><b>Plus tard</b></button>` : '<button type="button" class="btn large beurre" data-a="cp-plus-tard"><b>Merci !</b></button>'}</div>`);
    vueCl = 'copains'; copainsOuvert = true;
    let touche = true; try { touche = !navigator.userActivation || navigator.userActivation.hasBeenActive; } catch (e) { /* rien */ }
    son.deblocage(); if (touche) buzz([20, 40, 20]); confettis(0.8);
    const fin = () => { copainsOuvert = false; closeSheet(); setTimeout(tenterCopains, 400); };
    on('[data-a="cp-plus-tard"]', () => { son.tap(); fin(); });
    on('[data-a="cp-lancer"]', () => { const k = indexBoost(mult, secs); copainsOuvert = false; closeSheet(); const r = k >= 0 ? G.lancerBoostReserve(st, k) : { ok: false }; if (r.ok) reussite(`Boost ×${r.boost.mult} lancé : toutes les ventes ×${r.boost.mult} pendant ${G.fmtDuree((r.boost.fin - st.now) / 1000)} !`); renderBoosts(); setTimeout(tenterCopains, 400); });
    const surFermeture = setInterval(() => { if (feuille.hidden || vueCl !== 'copains') { copainsOuvert = false; clearInterval(surFermeture); } }, 500);
  }
  function sheetPourboireRecu() {
    copainsOuvert = true; // (accueillir prévient le moteur, qui rappelle tenterCopains : la feuille est déjà à nous)
    const a = classement.accueillirPourboires(); if (!a.liste.length) { copainsOuvert = false; return; }
    const [mult, secs] = CLM.REGLES.boostPourboire;
    for (let k = 0; k < a.boosts; k++) G.donnerBoostReserve(st, mult, secs);
    save(); renderBoosts();
    const noms = [...new Set(a.liste.map((x) => x.de))], n = noms.length, c = a.liste.length;
    const qui = n === 1 ? noms[0] : n === 2 ? `${noms[0]} et ${noms[1]}` : `${noms[0]}, ${noms[1]} et ${n - 2 === 1 ? 'un autre copain' : `${n - 2} autres copains`}`;
    const titre = n === 1 ? `${qui} t’a laissé ${c > 1 ? `${c} pourboires` : 'un pourboire'}\u00A0!` : `${qui} t’ont laissé ${c === n ? 'un pourboire' : `${c} pourboires`}\u00A0!`;
    const phrase = a.boosts ? (a.boosts === 1 ? `Un boost ×${mult} de ${G.fmtDuree(secs)} t’attend dans ta réserve.` : `${a.boosts} boosts ×${mult} de ${G.fmtDuree(secs)} t’attendent dans ta réserve.`) : 'Ta réserve a déjà reçu ses 3 boosts du jour : le geste compte quand même !';
    feuilleCopain(`<div class="cl rec-annonce cp-annonce" data-cl="pourboire-recu"><div class="rec-scene pourboire" aria-hidden="true"><i class="rec-rayons"></i><span class="rec-coupe">${ICONS.PRODUITS.croissant}</span><span class="cp-coeur">${ICONS.UI.pourboire}</span></div>
      <h2>${esc(titre)}</h2><p class="rec-phrase">${phrase}</p><p class="sous">Un pourboire, c’est un copain qui est passé voir ta boutique depuis le classement. Rends-lui la pareille : touche son nom dans la liste.</p>`, mult, secs, a.boosts);
  }
  function sheetObjectifReussi(semaine) {
    copainsOuvert = true;
    if (!classement.objectifFait(semaine)) { copainsOuvert = false; return; } // annoncée une fois : la semaine rejoint le badge
    const [mult, secs] = CLM.REGLES.boostObjectif;
    G.donnerBoostReserve(st, mult, secs); save(); renderBoosts(); majRecompenses();
    feuilleCopain(`<div class="cl rec-annonce cp-annonce" data-cl="objectif-reussi"><div class="rec-scene equipe" aria-hidden="true"><i class="rec-rayons"></i><span class="rec-coupe">${ICONS.UI.equipe}</span></div>
      <h2>Objectif commun réussi&nbsp;!</h2><p class="rec-phrase">Un boost ×${mult} de ${G.fmtDuree(secs)} et le badge « Esprit d’équipe » sont à toi.</p>
      <p class="sous">Semaine du ${CLM.dateCourte(semaine)} : à vous tous, vous avez atteint le but. Le badge est accroché au mur de ta boutique, et les copains le verront en la visitant.</p>`, mult, secs, 1);
  }

  // ─── les notifications (Web Push, classement v6) : le bloc « Notifications » des Réglages ───
  // La clé publique se lit dans fournil/config.js (vapid) : absente, le bloc dit « bientôt ». Sur iPhone, il faut iOS 16.4 et le jeu ajouté
  // à l'écran d'accueil ; le bloc le dit, comme une permission refusée. Les notifications passent par sa ligne du classement : il faut l'avoir rejoint.
  const CAS_NOTIFS = [['pleine', 'Ta boutique est pleine', 'Quand tes heures d’absence sont atteintes'], ['evenements', 'Les événements', 'L’ouverture et la fin'], ['pourboires', 'Les pourboires', 'Quand un copain t’en laisse un'], ['objectif', 'L’objectif commun', 'Quand il est réussi']];
  let notifEnCours = false;
  const permissionNotifs = () => { try { return window.Notification ? Notification.permission : 'absent'; } catch (e) { return 'absent'; } };
  function cleNotifs() { if (!classement) return ''; return `${classement.notifsPossibles()}|${JSON.stringify(classement.notifs())}|${permissionNotifs()}|${notifEnCours}`; }
  function blocNotifs(ligne, sw) {
    if (!classement) return '';
    const raison = classement.notifsPossibles(), n = classement.notifs(), r = classement.resume(), ico = ICONS.UI.notifs;
    const info = (titre, sous) => `<div class="reglage info"><i class="ico">${ico}</i><span><b>${titre}</b><small>${sous}</small></span><span></span></div>`;
    let corps;
    if (raison === 'absent') return '';
    if (raison === 'bientot' || raison === 'pas-installe') corps = info('Me prévenir', 'Bientôt disponible : ta boutique pleine, les événements, les pourboires et l’objectif commun, sur ton téléphone.');
    else if (raison === 'impossible') { const ios = CLM.iosHorsEcran(window); corps = info('Me prévenir', ios.ios && ios.vieux ? 'Il faut iOS 16.4 ou plus récent pour recevoir les notifications du jeu.' : ios.ios && ios.horsEcran ? 'Sur iPhone, ajoute d’abord le jeu à l’écran d’accueil : Partager, puis « Sur l’écran d’accueil », et ouvre-le depuis son icône.' : 'Ce navigateur ne sait pas recevoir de notifications.'); }
    else if (permissionNotifs() === 'denied') corps = info('Notifications bloquées', 'Tu les as refusées pour le jeu : autorise-les dans les réglages du téléphone (Notifications › Le Fournil), puis reviens ici.');
    else if (!r.rejoint) corps = info('Me prévenir', 'Les notifications passent par le classement : rejoins-le d’abord.') + ligne('cl-rejoindre-notifs', ICONS.UI.podium, 'Rejoindre le classement', 'Ton pseudo, tes points, puis les notifications', `<i class="ico chev">${ICONS.UI.chevron}</i>`);
    else {
      corps = ligne('notifs', ico, 'Me prévenir', n.actif ? 'Le Fournil te prévient sur ce téléphone' : 'Ta boutique pleine, les événements, les pourboires, l’objectif commun', sw(n.actif));
      if (n.actif) corps += CAS_NOTIFS.map(([k, t, s]) => ligne(`notif-${k}`, '', t, s, sw(n.prefs[k])).replace('class="reglage"', 'class="reglage cas"')).join('') + ligne('notif-essai', ICONS.UI.cloche, 'M’envoyer un essai', 'Une notification de test, dans les 5 minutes', `<i class="ico chev">${ICONS.UI.chevron}</i>`);
    }
    return `<h3 class="titre-section"><span>Notifications</span></h3><div class="card reglages notifs"${notifEnCours ? ' aria-busy="true"' : ''}>${corps}</div>`;
  }
  async function basculerNotifs(prefs) { // prefs : changer un cas (abonné) ; sinon, activer ou couper
    if (!classement || notifEnCours) return;
    const n = classement.notifs(), couper = !prefs && n.actif;
    notifEnCours = true; lastPage = ''; renderPage(true);
    const r = couper ? await classement.desabonner() : await classement.abonner(prefs || n.prefs);
    notifEnCours = false; lastPage = ''; renderPage(true);
    if (r.etat === 'ok') { son.tap(); if (!prefs) toast(couper ? 'Plus de notifications du Fournil sur ce téléphone.' : 'C’est noté : le Fournil te préviendra.'); return; }
    son.non();
    toast(r.etat === 'refus' && r.erreur === 'trop_vite' ? 'Doucement : réessaie dans une minute.' : r.etat === 'refus' && r.erreur === 'abonnement' ? 'Ce téléphone n’a pas pu s’abonner : réessaie dans un moment.' : r.etat === 'refus' && r.erreur === 'preferences' ? 'Ces réglages n’ont pas été acceptés : réessaie.' : { refuse: 'Notifications refusées : autorise-les dans les réglages du téléphone.', ignore: 'Pas de réponse à la demande : réessaie.', 'pas-installe': 'Les notifications arrivent bientôt.', bientot: 'Les notifications arrivent bientôt.', impossible: 'Ce téléphone ne peut pas recevoir les notifications du jeu.', 'pas-rejoint': 'Rejoins d’abord le classement.', sw: 'Le jeu n’est pas encore installé sur ce téléphone : rouvre-le dans un instant.' }[r.etat] || (r.etat === 'refus' ? 'Le serveur a refusé l’abonnement. Réessaie dans un moment.' : msgReseau(r.etat)));
  }
  async function essaiNotif() {
    if (!classement || notifEnCours) return;
    const r = await classement.essai();
    if (r.etat === 'ok') { son.tap(); toast('Essai envoyé : la notification arrive d’ici quelques minutes.'); return; }
    son.non(); toast(r.etat === 'refus' ? (r.erreur === 'trop_vite' ? 'Un essai toutes les 2 minutes au plus.' : 'L’essai n’est pas parti. Réessaie dans un moment.') : r.etat === 'pas-installe' ? 'Les notifications arrivent bientôt.' : msgReseau(r.etat));
  }

  // ─── boucle ───
  let derniereImage = 0;
  function frame(now) {
    verifierReveil(); // chaque image : la page vient-elle de dormir ?
    if (retourEnCours) { lastFrame = now; derniereImage = now; requestAnimationFrame(frame); return; } // l'absence n'est pas encore comptée : rien ne bouge
    const dt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    // le filet : plus de 5 s entre deux images sans qu'aucun retour soit parti (une page gelée que le détecteur a manquée, vue « cachée » au
    // dégel) ; on ne tique pas par-dessus (le temps serait perdu, puis lastSeen recollé à maintenant) : le retour compte l'absence depuis le
    // dernier lastSeen sauvé. Les sauts de l'heure sûre ne passent pas par ici (pas de trou entre les images) : payerSaut les plafonne.
    const trou = derniereImage ? now - derniereImage : 0; derniereImage = now;
    if (absencePrete && trou > 5000 && reprendre('saut')) { requestAnimationFrame(frame); return; }
    const ecranEv = EVS ? EVS.ouvert : null, planque = !!ecranEv, atelier = MINIJEUX.ouvert || planque || !!(AR && AR.ouvert) || !!visite; // pendant l'Atelier, la Planque ou une visite : pas d'événement, de client mystère, d'habitué ni de chat qui surgissent sous l'écran
    if (atelier) { st.evTimer = Math.max(st.evTimer, 5); st.mystereTimer = Math.max(st.mystereTimer, 5); if (st.chatAttente != null) st.chatAttente = Math.max(st.chatAttente, 5); }
    const out = G.tick(st, dt, HORLOGE.maintenant(), atelier ? () => 0.999 : undefined);
    if (out.ventes.length) {
      const gros = out.ventes.reduce((a, v) => a + v.montant, 0), first = out.ventes[0];
      if (!visite && (G.PRODUITS[first.i].temps >= 3 || Math.random() < 0.15)) { SCENE.vente(first.i, gros, '+' + G.fmtEur(gros), !st.stations[first.i].staff); son.vente(gros); } // en visite : ses ventes ne s'affichent pas chez le copain
      if (!st.stations[first.i].staff && pageActive === 'boutique' && tiroir.pos !== 'ferme') { const r = cards[first.i].el.querySelector('.barre').getBoundingClientRect(); if (r.top > $('#tiroir').getBoundingClientRect().top + 20 && r.bottom < $('#onglets').getBoundingClientRect().top) flottant(r.left + r.width / 2 - 30, r.top - 10, '+' + G.fmtEur(first.montant)); }
    }
    if (out.nouvelEv) { son.evenement(); buzz([15, 40, 15]); toast(TXT_EV[out.nouvelEv.type]); }
    if (out.finEv) { toast(FIN_EV[out.finEv.type]); if (out.finEv.type === 'critique' || out.finEv.type === 'petrissage') son.non(); }
    if (out.mystere && $('#feuille').hidden && !visite) { if (SCENE.mystere()) toast('Un client mystère ! Touche-le vite.'); }
    if (out.habitue && !visite) { SCENE.habitue(out.habitue); son.achat(); toast(`${out.habitue.nom} : « ${out.habitue.phrase} »`); }
    if (out.grades && out.grades.length) annoncerGrade(out.grades[0]);
    if (out.chat && $('#feuille').hidden && !visite) sheetChat(true);
    if (out.saison) { son.evenement(); toast(`Nouvelle recette de saison : ${out.saison.nom}, jusqu’au ${out.saison.fin[1]} ${MOIS[out.saison.fin[0] - 1]} !`); renderCards(true); }
    if (out.venteSaison && !visite) { SCENE.vente(0, out.venteSaison.montant, '+' + G.fmtEur(out.venteSaison.montant), true); son.vente(out.venteSaison.montant); }
    if (out.maitrise) reussite(`${out.maitrise.nom} : recette maîtrisée !`);
    if (out.trophees && out.trophees.length) { const t0 = out.trophees[0]; son.deblocage(); buzz([10, 30, 10, 30, 10]); feter(); toast(`Trophée : ${t0.nom} !${out.trophees.length > 1 ? ` (+${out.trophees.length - 1})` : ''}`); }
    const nv = G.niveau(st);
    if (nv > lastNiveau) { lastNiveau = nv; son.deblocage(); buzz([15, 40, 15, 40, 15]); feter(); toast(`Niveau ${nv} : ${G.titre(st)} ! Un point de talent à apprendre.`); }
    renderCards(); hud(); renderObjectifs(); renderEvenement(); renderPage();
    if (!atelier) SCENE.frame(dt, st, HORLOGE.maintenant()); // l'écran de l'Atelier (ou de l'arrière-salle) couvre la boutique : la 3D attend
    else if (visite && visite.scene) { const t = HORLOGE.maintenant(); visite.b.st.now = t; SCENE.frame(dt, visite.b.st, t); } // la visite : la scène montre la boutique du copain (rien n'est sauvé)
    if (planque) ecranEv.frame(dt, HORLOGE.maintenant()); // l'écran de l'événement (la Planque, le Manoir) vit tant qu'il est ouvert (fermé, il rattrape une absence)
    if (++tChat > 30) { tChat = 0; majChat(); } // le chat noir arrive (ou repart) avec la Maison hantée
    renderBoosts();
    indices();
    if (now - lastSave > 5000) save();
    requestAnimationFrame(frame);
  }
  function layout() {
    const corps = $('#corps'), w = corps.clientWidth, h = corps.clientHeight; if (!w || !h) return;
    const T = SCENE.hautBloc(w, h), miH = Math.max(T + 8, Math.min(h - 360, Math.round(h * 0.55))); // à mi-hauteur, la file et le client mystère restent visibles
    SCENE.resize(w, h, miH);
    tiroir.layout(h, miH);
  }

  // ─── le retour dans le jeu : une heure sûre fraîche (2,5 s au plus), puis l'absence est payée (feuille « Pendant ton absence » après 90 s).
  //     Déclenché quand la page redevient visible, revient du cache, ou quand le détecteur de réveil voit que la page a dormi : sur iPhone,
  //     une app installée qu'on verrouille ne prévient pas toujours, et performance.now() (le temps du jeu) s'arrête pendant la veille.
  let reveilW = Date.now(), reveilP = performance.now();
  function reprendre(raison) {
    reveilW = Date.now(); reveilP = performance.now(); // le détecteur repart d'ici : pas de second retour pour le même sommeil
    if (!st || !absencePrete || fige || retourEnCours) return false; retourEnCours = true; dernierRetour = raison;
    // en ligne, seule une heure sûre fraîche fait avancer le jeu (HORLOGE.retour) : si elle manque, on la redemande toutes les 5 s
    HORLOGE.retour().catch(() => null).then((info) => { if (!(info && info.frais) && navigator.onLine !== false) relancerHeure(); retourEnCours = false; reveilW = Date.now(); reveilP = performance.now(); const t = HORLOGE.maintenant(), sortie = t - st.lastSeen, abs = G.absence(st, t); absencePayee = abs.secs * 1000; if (EVS && EVS.ouvert) EVS.ouvert.retour(); const montre = abs.total > 0 && abs.secs > 90; if (montre) { sheetRetour(abs); renderCards(true); } noterRetour(raison, abs, sortie, montre, !!(info && info.frais)); lastFrame = performance.now(); save(); if (abs.secs > 60) verifierCadeaux(); });
    return true;
  }
  // l'heure sûre n'est pas venue au réveil (réseau pas encore revenu) : nouvel essai toutes les 5 s pendant une minute ; quand elle arrive,
  // le saut est payé comme une absence (payerSaut, une seule fois pour une même absence)
  let relances = 0, tRelance = 0;
  function relancerHeure() { relances = 12; clearTimeout(tRelance); const essai = () => { if (relances-- <= 0) return; HORLOGE.synchroniser().then((ok) => { if (!ok) tRelance = setTimeout(essai, 5000); else relances = 0; }); }; tRelance = setTimeout(essai, 5000); }
  // la page a dormi : l'heure du téléphone a avancé de plus de 5 s de plus que performance.now(). Le détecteur ne fait que lancer le retour :
  // c'est l'heure sûre (HORLOGE.retour) qui fixe le temps payé, donc avancer l'heure du téléphone ne rapporte rien de plus qu'avant.
  // La page a été gelée : le détecteur passe chaque seconde et à chaque image, donc plus de 5 s de performance.now() entre deux passages,
  // page visible, veulent dire que le JavaScript ne tournait plus (iPhone : une app installée laissée en arrière-plan sans verrouiller,
  // l'appareil éveillé ; performance.now() avance alors avec l'heure, et visibilitychange ne vient pas toujours au retour).
  function verifierReveil() {
    const w = Date.now(), p = performance.now(), ecart = (w - reveilW) - (p - reveilP), gel = p - reveilP; reveilW = w; reveilP = p;
    if (ecart < -60e3 && st) noterJournal({ t: HORLOGE.maintenant(), r: 'derive', o: Math.round(-ecart / 1000), s: 0, g: 0, n: 'derive', ...horlogeVue() }); // le compteur du téléphone a couru plus vite que l'heure : le mouchard le note
    if (document.visibilityState === 'hidden') return;
    if (ecart > 5000) reprendre('reveil'); else if (gel > 5000) reprendre('gel');
  }
  // le journal des retours (Réglages › Journal des retours) : les 10 derniers, pour comprendre une feuille « Pendant ton absence » qui manque.
  // Le mouchard de l'horloge : a = l'avance du jeu sur l'heure sûre, p = celle du téléphone (en s), notées quand elles dépassent une minute
  function horlogeVue() {
    const i = HORLOGE.info ? HORLOGE.info() : null, o = {}; if (!i || !(i.sure > 0)) return o;
    const a = Math.round(((i.jeu != null ? i.jeu : HORLOGE.maintenant()) - i.sure) / 1000), p = i.tel > 0 ? Math.round((i.tel - i.sure) / 1000) : 0;
    if (Math.abs(a) > 60) o.a = a; if (Math.abs(p) > 60) o.p = p; return o;
  }
  function noterJournal(e) {
    if (!st) return;
    const j = Array.isArray(st.journalRetours) ? st.journalRetours : (st.journalRetours = []);
    j.push(e); while (j.length > 10) j.shift();
  }
  function noterRetour(raison, abs, sortie, montre, frais) {
    if (!st) return;
    const note = montre ? 'feuille' : abs.secs <= 90 ? 'court' : !st.stations.some((s) => s.niv > 0 && s.staff) ? 'apprentis' : 'rien';
    noterJournal({ t: st.now, r: raison, o: Math.max(0, Math.round(sortie / 1000)), s: Math.round(abs.secs), g: abs.total, n: note, h: frais == null ? null : frais ? 1 : 0, ...horlogeVue() });
  }
  // (e) l'heure sûre a ramené le jeu de ms en arrière. Le départ de l'absence (lastSeen) revient à la vraie heure de la dernière sauvegarde :
  // une avance prise avant cette sauvegarde est rendue, une avance prise après (le compteur qui saute en pleine partie) ne crée pas de
  // fausse absence. Ce qui a commencé « dans le futur » (un coup de feu, une
  // opération lancés pendant l'avance) revient à maintenant, en gardant sa durée ; les absences recomptent aussitôt
  function reculer(ms) {
    if (!st || !(ms > 0)) return;
    const t = HORLOGE.maintenant(), avant = st.lastSeen;
    // la vraie heure de la dernière sauvegarde : l'heure du téléphone d'alors (st.vuTel), sinon l'heure sûre qu'elle gardait (st.horloge.sure,
    // les sauvegardes d'avant cette version) ; jamais après lastSeen ni après maintenant (le recul n'est possible que si le téléphone n'a pas
    // mené le jeu en avance : src/horloge.js (e))
    const est = Number.isFinite(st.vuTel) ? st.vuTel : st.horloge && Number.isFinite(st.horloge.sure) ? st.horloge.sure : avant - ms;
    const base = Number.isFinite(avant) ? Math.min(t, avant, est) : t;
    const rendu = Number.isFinite(avant) ? Math.max(0, avant - base) : 0;
    const dec = (o) => { if (!o || typeof o !== 'object') return; if (Number.isFinite(o.debut) && o.debut > t) { const d = o.debut - t; o.debut -= d; if (Number.isFinite(o.fin)) o.fin -= d; } };
    const etat = (o, r) => { if (!o || typeof o !== 'object') return; if (Number.isFinite(o.lastSeen)) o.lastSeen = Math.min(o.lastSeen - r, t); if (Number.isFinite(o.now)) o.now = Math.min(o.now, t); dec(o.ev); dec(o.operation); };
    if (Number.isFinite(avant)) st.lastSeen = base;
    if (Number.isFinite(st.now)) st.now = Math.min(st.now, t); dec(st.ev);
    for (const k of ['quartier', HTE && HTE.cle]) if (k && st[k]) etat(st[k], rendu);
    noterJournal({ t, r: 'recul', o: Math.round(ms / 1000), s: Math.round(rendu / 1000), g: 0, n: 'recul', ...horlogeVue() });
  }
  // une heure sûre arrivée en cours de partie (le réseau revient après des jours hors ligne, une lecture arrivée après les 2,5 s d'attente,
  // un téléphone endormi page ouverte) a fait sauter le jeu vers l'avant : ce vrai temps passé est payé comme une absence, une seule
  // pour une même absence (avec ce qui a été payé au lancement ou au retour, jamais plus que heuresAbsence) ; voir src/horloge.js (d)
  function payerSaut(r) {
    if (!st || !absencePrete || retourEnCours || fige) return; // au lancement et au retour, l'absence part de l'ancien lastSeen : le saut y est déjà
    const paye = HORLOGE.sautAPayer(r.saut, absencePayee, G.heuresAbsence(st) * 3600e3);
    if (!(paye > 0)) return;
    const now = HORLOGE.maintenant();
    st.lastSeen = now - paye;
    const abs = G.absence(st, now);
    absencePayee += abs.secs * 1000;
    const montre = abs.total > 0 && abs.secs > 90;
    if (montre) { sheetRetour(abs); renderCards(true); }
    noterRetour('heure', abs, paye, montre, true);
    save();
  }

  // ─── démarrage ───
  async function boot() {
    st = await load();
    // l'horloge de confiance : la plus longue absence de cette boutique, le plancher de la sauvegarde, puis l'heure sûre (2,5 s au plus)
    HORLOGE.regler({ avanceMax: () => (st ? G.heuresAbsence(st) : G.ABSENCE_MAX_H) * 3600e3 });
    if (st) { HORLOGE.charger(st.horloge); HORLOGE.pousser(st.lastSeen); }
    HORLOGE.surRecul(reculer); // (e) de src/horloge.js : le jeu était en avance sans que le téléphone l'y ait mené ; il revient à l'heure
    await HORLOGE.pret();
    const fresh = !st;
    if (fresh) st = G.newState(HORLOGE.maintenant());
    st.now = HORLOGE.maintenant();
    if (!st.vu) st.vu = {};
    if (st.vu.journal == null) { const c = st.carnetEv || []; st.vu.journal = fresh ? 0 : c.length ? c[c.length - 1].t : 0; } // une ancienne sauvegarde : son carnet compte comme lu
    document.querySelectorAll('[data-ico]').forEach((el) => { el.innerHTML = ICONS.UI[el.dataset.ico] || ''; });
    if (!SCENE.init($('#scene'), $('#scene-ui'))) $('#sans-3d').hidden = false; // sans WebGL : la boutique vit quand même, sans image
    SCENE.surServi = (r) => { if (visite) return; if (r.cadeau) { reussite(`${r.hb.nom}, fidèle depuis ${r.jours} jours, t’offre ${G.fmtEur(r.cadeau)} !`); } else if (r.jours > 1) toast(`${r.hb.nom} : ${r.jours}e jour de suite !`); };
    tiroir.init();
    layout();
    tiroir.aller(['ouvert', 'mi', 'ferme'].includes(st.tiroir) ? st.tiroir : 'mi', false);
    if (window.ResizeObserver) new ResizeObserver(layout).observe($('#corps'));
    $('#b-fini').addEventListener('click', () => { audio(); son.tap(); amenager(false); });
    $('#b-atelier').addEventListener('click', () => { audio(); son.tap(); sheetAtelier(); });
    $('#b-classement').addEventListener('click', () => { audio(); son.tap(); sheetClassement(); });
    $('#b-quartier').addEventListener('click', () => { audio(); son.tap(); if (EVT) EVT.ouvrir(); });
    $('#b-hantee').addEventListener('click', () => { audio(); son.tap(); if (HTE) HTE.ouvrir(); });
    $('#boosts').addEventListener('click', () => { audio(); son.tap(); lancerBoost(); });
    // l'événement « Le Quartier » : la Planque, ses paliers et leurs récompenses, l'annonce, le bilan (src/evenement.js)
    // les événements (src/evenement.js) : « Le Quartier » (la Planque) et « La Maison hantée » (le Manoir) ; leurs paliers et récompenses, l'annonce, le bilan
    const depsEv = (cle) => ({ st: () => st, son, buzz, audio, maintenant: () => HORLOGE.maintenant(), sure: () => { try { const e = HORLOGE.etat(); return e ? e.sure : null; } catch (e) { return null; } }, save, toast, fete: () => SCENE.fete(), openSheet, closeSheet, on, recompenses: recVue, confettis,
      classement: () => sheetClassement(cle), rang: () => { try { if (!classement || !classement.disponible() || !periodes().some(([id]) => id === cle)) return null; const r = classement.resume(), x = r[cle] || (r.evenements && r.evenements[cle]); return r.rejoint && x ? x.rang : 0; } catch (e) { return null; } },
      ouvert: () => { closeSheet(); }, ferme: () => { lastFrame = performance.now(); majCoin(); majChat(); renderCards(true); hud(); renderPage(true); if (feteEnAttente) { feteEnAttente = false; SCENE.fete(); } },
      apres: () => { renderCards(true); hud(); lastPage = ''; renderPage(true); } });
    if (EVT) EVT.init(depsEv('quartier'));
    if (HTE) HTE.init(depsEv(HTE.cle));
    majChat();
    buildCards();
    MINIJEUX.init({ st: () => st, son, buzz, audio, maintenant: () => HORLOGE.maintenant(), fete: () => SCENE.fete(),
      ouvert: () => { closeSheet(); }, ferme: () => { lastFrame = performance.now(); renderPage(true); if (feteEnAttente) { feteEnAttente = false; SCENE.fete(); } },
      apres: () => { renderCards(true); hud(); save(); renderPage(true); } });
    if (AR) AR.init({ st: () => st, son, buzz, audio, save, confettis,
      ouvert: () => { closeSheet(); }, ferme: () => { lastFrame = performance.now(); renderCards(true); hud(); lastPage = ''; renderPage(true); if (feteEnAttente) { feteEnAttente = false; SCENE.fete(); } },
      apres: () => { hud(); } });
    document.querySelectorAll('.modes button').forEach((b) => { b.classList.toggle('actif', String(st.mode) === b.dataset.mode); b.addEventListener('click', () => { st.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCards(true); save(); }); });
    $('#cartes').addEventListener('click', onCardClick);
    $('#b-ameliorations').addEventListener('click', () => { audio(); sheetAmeliorations(); });
    $('#b-etoiles').addEventListener('click', () => { audio(); sheetEtoiles(); });
    $('#objectifs').addEventListener('click', () => { audio(); showPage('defis'); });
    $('#enseigne').addEventListener('click', () => { audio(); sheetNom(false); });
    $('#b-cloche').addEventListener('click', () => { audio(); if (st.ev) { if (tiroir.pos === 'ouvert') tiroir.aller('mi'); if (!evEtendu) basculerEvenement(); } else { son.tap(); showPage('journal'); } }); // la cloche : l'événement en cours, sinon le fil des nouvelles
    $('#evenement').addEventListener('click', (e) => { if (e.target.closest('button')) return; audio(); basculerEvenement(); });
    document.querySelectorAll('#onglets button').forEach((b) => b.addEventListener('click', () => { audio(); if (b.dataset.page !== pageActive) { son.tap(); showPage(b.dataset.page); } else if (tiroir.pos === 'ferme') tiroir.aller('mi'); else $('#pages').scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }));
    $('#scene').addEventListener('pointerdown', (e) => {
      audio();
      const r = $('#scene').getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const porte = !SCENE.amenager && SCENE.hitArriere && SCENE.hitArriere(sx, sy); if (!porte) toquees = []; // la petite porte du fond : cinq touches de suite
      if (SCENE.hit(sx, sy)) { const tip = G.encaisserPourboire(st); son.pourboire(); buzz([10, 20, 10, 20, 10]); SCENE.texte(`+${G.fmtEur(tip)} de pourboire !`); toast(`Le client mystère laisse ${G.fmtEur(tip)} de pourboire !`); renderCards(true); hud(); save(); }
      else if (SCENE.hitChat && SCENE.hitChat(sx, sy)) caresserChat(); // le chat dort dans la zone du boulanger : il passe avant
      else if (classement && SCENE.hitTrophees && SCENE.hitTrophees(sx, sy)) { son.tap(); sheetRecompenses(); } // la vitrine des trophées, la coupe du comptoir
      else if (SCENE.hitBoulanger(sx, sy)) showPage('boulanger');
      else if (porte) toquer(sx, sy);
      else { const id = SCENE.hitMeuble ? SCENE.hitMeuble(sx, sy) : null; if (id) sheetMeuble(id); else SCENE.tap(); }
    });
    // au retour dans le jeu : une heure sûre fraîche (2,5 s au plus) avant de compter l'absence ; le jeu attend, sans rien sauver entre-temps
    document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); return; } reprendre('visible'); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) reprendre('cache'); else verifierReveil(); });
    for (const ev of ['focus', 'resume']) (ev === 'resume' ? document : window).addEventListener(ev, verifierReveil);
    setInterval(verifierReveil, 1000);
    document.addEventListener('pointerdown', () => { dernierToucher = performance.now(); }, true);
    document.addEventListener('pointerdown', () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* rien */ } }, { once: true });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    document.addEventListener('freeze', save);
    window.addEventListener('blur', save);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (visite && $('#feuille').hidden) finVisite(); else closeSheet(); } });
    if (!fresh) { const t = HORLOGE.maintenant(), sortie = t - st.lastSeen, abs = G.absence(st, t); absencePayee = abs.secs * 1000; const montre = abs.total > 0 && abs.secs > 90; if (montre) sheetRetour(abs); noterRetour('lancement', abs, sortie, montre, HORLOGE.info().source !== 'telephone'); }
    absencePrete = true;
    HORLOGE.surSaut(payerSaut);
    if (EVS) { setTimeout(() => { if ($('#feuille').hidden) EVS.annoncer(true); else { const t = setInterval(() => { if ($('#feuille').hidden) { clearInterval(t); EVS.annoncer(true); } }, 1500); } }, 800); } // l'annonce d'un événement (ou son bilan) attend que la feuille du retour soit refermée ; le bilan du Quartier passe avant l'annonce de la Maison hantée
    // l'écran d'un événement se prépare en arrière-plan (5 s après le lancement) pour qui y est déjà entré : il s'ouvrira directement en HD
    if (EVT) setTimeout(() => { try { if (EVT.visible() && st.quartier && st.quartier.majeur && SCENE.precharger) SCENE.precharger('planque'); } catch (e) { /* rien */ } }, 5000);
    if (HTE) setTimeout(() => { try { if (HTE.visible() && st[HTE.cle] && st[HTE.cle].ouvertLe && SCENE.precharger) SCENE.precharger('hantee'); } catch (e) { /* rien */ } }, 5000);
    if (EVS) setInterval(() => { majCoinQuartier(); majChat(); if (!EVS.ouvert && !MINIJEUX.ouvert && !(AR && AR.ouvert) && !visite && !document.hidden && $('#feuille').hidden) EVS.annoncer(); }, 20e3); // midi sonne (ou la fin) pendant qu'on joue : l'icône, l'annonce ou le bilan arrivent sans relancer
    // le classement : après les gains hors ligne, un premier envoi (si on l'a rejoint), puis toutes les 5 min et au passage en arrière-plan
    // ce qui part : ses points de boulanger de la semaine (et leur lundi, heure de Paris sur l'horloge de confiance), et sa fortune pour information
    // classement v6 : la photo de sa boutique (pour les visites des copains), et l'heure où elle sera pleine (la notification, en quittant le jeu)
    const photo = () => { if (!st || !CLM.photo) return null; const r = recVue(); return CLM.photo(st, { G, coupes: r ? r.coupes : [], badge: !!(r && r.badge), dh: HTE && st[HTE.cle] ? st[HTE.cle].decos : [] }); };
    const pleineA = () => (st ? HORLOGE.maintenant() + G.heuresAbsence(st) * 3600e3 : null);
    try { classement = CLM ? CLM.navigateur({ fortune: () => (st ? st.lifetime : NaN), points: () => (st ? mesPoints() : null), quartier: () => (st && st.quartier && QT && QT.envoiBillets(HORLOGE.maintenant()) ? st.quartier.total : null), ...envoiHantee(), maintenant: () => HORLOGE.maintenant(), photo, pleineA }) : null; } catch (e) { classement = null; }
    if (classement) { classement.ecouter(() => { rafraichirClassement(); majRecompenses(); majCoin(); if (pageActive === 'reglages') renderPage(); if (visite) peindreVisite(); tenterCopains(); }); majRecompenses(); classement.demarrer(); setTimeout(verifierCadeaux, 3000); setInterval(() => { if (document.visibilityState === 'visible') verifierCadeaux(); }, 10 * 60e3); setInterval(majRecompenses, 60e3);
    // la liste ouverte se relit toute seule toutes les 30 s (qui vient d'arriver « en ligne », les points qui bougent) : seulement
    // sur l'onglet de la liste, page visible, sans doubler une lecture en vol ; la feuille fermée, plus rien
    setInterval(() => { if (vueCl === 'liste' && !feuille.hidden && document.visibilityState === 'visible' && !classement.enChargement(ongletCl)) classement.charger(ongletCl); }, (window.__relireClassement | 0) || 30e3); } // la tenue et la coupe changent aussi au lundi
    majCoin();
    lastNiveau = G.niveau(st);
    renderCards(true); hud(); renderObjectifs(); renderEvenement();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    window.__fournil = { get st() { return st; }, get retour() { return { enCours: retourEnCours, dernier: dernierRetour }; }, journalRetours: sheetJournalRetours, cadeaux: verifierCadeaux, G, SCENE, save, son, confettis, audio, reset: () => { fige = true; return effacer().then(() => location.reload()); }, absence: (ms) => { st.lastSeen = HORLOGE.maintenant() - ms; const abs = G.absence(st, HORLOGE.maintenant()); sheetRetour(abs); renderCards(true); return abs; }, give: (n) => { G.gagner(st, n, true); renderCards(true); hud(); }, rush: () => G.lancerRush(st), commande: () => G.lancerCommande(st, Math.random), ev: (type) => G.lancerEvenement(st, Math.random, type), mystere: () => SCENE.mystere(), xp: (n) => G.gagnerXp(st, n), meuble: (id) => { const r = G.ameliorerMeuble(st, id); renderCards(true); hud(); save(); return r; }, fiche: sheetMeuble, tiroir: (p) => (p ? tiroir.aller(p, false) : tiroir.pos), tiroirY: () => tiroir.y, amenager: (on) => { amenager(on); return SCENE.amenager; }, page: showPage, boulanger: () => showPage('boulanger'), nommer: (n) => G.renommer(st, n), scene: (o) => SCENE.forcer(o), journal: () => showPage('journal'), classement: () => classement, feuilleClassement: sheetClassement, recompenses: sheetRecompenses, majRecompenses, habitue: (id) => SCENE.habitue(G.HABITUES.find((h) => h.id === id)), partager,
      apprentiXp: (i, sec) => { const g = G.creditApprenti(st, i, sec / G.temps(st, i)); if (g) annoncerGrade(g); renderCards(true); return G.gradeApprenti(st, i); },
      chat: () => sheetChat(), ficheApprenti: (i) => sheetApprenti(i), caresser: caresserChat, saison: (id) => { G.forcerRecette(id); G.objectifsDuJour(st, HORLOGE.maintenant()); renderCards(true); return st.saison; }, stats: () => SCENE.stats, qualite: (q) => SCENE.qualite(q), atelier: () => MINIJEUX.etat(), ouvrirAtelier: (id) => MINIJEUX.ouvrir(id), fermerAtelier: () => MINIJEUX.fermer(), points: () => G.detailPoints(st), garderobe: (piece) => { if (GRU) GRU.ouvrir(ctxGarderobe(), piece); }, vetement: (id) => { const r = G.donnerVetement(st, id); save(); lastPage = ''; renderPage(true); return r; }, rafraichir: () => { renderCards(true); hud(); save(); lastPage = ''; renderPage(true); }, coin: () => { majCoin(); const b = $('#b-classement'), p = b.querySelector('.rang-pastille'); return { classement: !b.hidden, pastille: p.hidden ? '' : p.textContent, label: b.getAttribute('aria-label'), quartier: !$('#b-quartier').hidden, hantee: !$('#b-hantee').hidden }; }, repeindre, feuilleAtelier: () => sheetAtelier(),
      quartier: () => (EVT ? EVT.ouvrir() : false), fermerQuartier: () => { if (EVT) EVT.fermer(); }, evenement: EVT, Q: QT,
      hantee: () => (HTE ? HTE.ouvrir() : false), fermerHantee: () => { if (HTE) HTE.fermer(); }, evHantee: HTE, HT, annoncerEvenements: (f) => (EVS ? EVS.annoncer(f !== false) : false), chatNoir, choisirPelage, compagnons: (retour) => sheetCompagnons(retour), choisirCompagnon: (id) => { const r = G.choisirCompagnon(st, id); if (r.ok) { save(); majChat(); } return r; }, modeleVu, majChat, boosts: () => st.boosts, lancerBoost, renderBoosts, annoncerQuartier: () => (EVT ? EVT.annoncer() : false), majCoin,
      visiter: (p) => visiter(p, true), finVisite, visite: () => (visite ? { pseudo: visite.pseudo, scene: visite.scene, charge: visite.charge, etat: visite.etat, nom: visite.b ? visite.b.nom : null } : null), tenterCopains, // classement v6 (pour les tests)
      arriere: () => (AR ? AR.etat() : null), ouvrirArriere: () => (AR ? AR.ouvrir() : false), fermerArriere: () => { if (AR) AR.fermer(); }, BJ: typeof BLACKJACK !== 'undefined' ? BLACKJACK : null, zonePorte: () => (SCENE.zoneArriere ? SCENE.zoneArriere() : null) };
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  return { get st() { return st; } };
})();
